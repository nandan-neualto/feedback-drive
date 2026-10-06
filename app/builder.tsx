'use client';

import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Camera, Check, ChevronRight, ImagePlus, LoaderCircle, Plus, Save, Trash2, X } from 'lucide-react';
import { categories, fileUrl, json, uid, type Question, type Survey } from './model';
import { Modal } from './ui';
import { usePreferences } from './i18n';
import { processImage } from './response-flow';

type LocalMessage = string | { key: string; vars: Record<string, string | number> };
type Props = { survey: Survey; onClose: () => void; onSaved: (survey?: Survey, archived?: boolean) => void };
const questionTypes: { value: Question['type']; label: string }[] = [
  { value: 'short', label: 'Short answer' }, { value: 'long', label: 'Long answer' },
  { value: 'single', label: 'Single choice' }, { value: 'multiple', label: 'Multiple choice' },
  { value: 'rating', label: 'Rating (1–5)' }, { value: 'yesno', label: 'Yes / No' },
];
const isChoice = (type: Question['type']) => type === 'single' || type === 'multiple';
function localDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
}
async function readReply(response: globalThis.Response) {
  const data = await response.json().catch(() => ({})) as { error?: string; survey?: Survey; key?: string; url?: string };
  if (!response.ok) throw new Error(data.error || 'Your changes could not be saved. Please try again.');
  return data;
}

export default function Builder({ survey, onClose, onSaved }: Props) {
  const { t, categoryLabel, number } = usePreferences();
  const [draft, setDraft] = useState<Survey>(() => ({ ...survey, questions: survey.questions.map(q => ({ ...q, ...(q.options ? { options: [...q.options] } : {}) })) }));
  const [closing, setClosing] = useState(() => localDate(survey.closesAt));
  const [error, setError] = useState<LocalMessage>('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const busyRef = useRef(false);
  const uploadRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const patch = (value: Partial<Survey>) => setDraft(previous => ({ ...previous, ...value }));
  const patchQuestion = (id: string, value: Partial<Question>) => setDraft(previous => ({ ...previous, questions: previous.questions.map(q => q.id === id ? { ...q, ...value } : q) }));
  const close = () => { if (!busyRef.current && !uploadRef.current) onClose(); };

  function changeType(question: Question, type: Question['type']) {
    patchQuestion(question.id, { type, options: isChoice(type) ? question.options?.length ? question.options : ['', ''] : undefined });
  }
  function moveQuestion(index: number, direction: number) {
    setDraft(previous => {
      const questions = [...previous.questions];
      const target = index + direction;
      if (target < 0 || target >= questions.length) return previous;
      [questions[index], questions[target]] = [questions[target], questions[index]];
      return { ...previous, questions };
    });
  }
  function validate(status: Survey['status']): LocalMessage {
    if (!draft.title.trim()) return 'Give your survey a title.';
    if (draft.title.trim().length > 160) return 'The title must be 160 characters or fewer.';
    if (draft.description.trim().length > 2000) return 'The introduction must be 2,000 characters or fewer.';
    if (!draft.questions.length || draft.questions.length > 20) return 'Add between 1 and 20 questions.';
    for (let index = 0; index < draft.questions.length; index++) {
      const q = draft.questions[index];
      if (!q.label.trim()) return { key: "Write a question for question {number}.", vars: { number: number(index + 1) } };
      if (q.label.trim().length > 400) return { key: "Question {number} must be 400 characters or fewer.", vars: { number: number(index + 1) } };
      if (isChoice(q.type)) {
        const options = q.options || [];
        if (options.length < 2 || options.length > 12) return { key: "Question {number} needs between 2 and 12 choices.", vars: { number: number(index + 1) } };
        if (options.some(option => !option.trim())) return { key: "Fill in every choice for question {number}.", vars: { number: number(index + 1) } };
        if (options.some(option => option.trim().length > 160)) return { key: "Keep the choices for question {number} under 160 characters.", vars: { number: number(index + 1) } };
        if (new Set(options.map(option => option.trim().toLowerCase())).size !== options.length) return { key: "Use different choices for question {number}.", vars: { number: number(index + 1) } };
      }
    }
    if (closing && !Number.isFinite(new Date(closing).getTime())) return 'Choose a valid closing date.';
    if (status === 'active' && closing && new Date(closing).getTime() <= Date.now()) return 'Choose a future closing date before publishing, or clear the closing date.';
    return '';
  }

  async function uploadCover(file?: File) {
    if (!file || busyRef.current || uploadRef.current) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPG, PNG, or WebP cover image.'); return; }
    if (file.size > 5 * 1024 * 1024 || file.size < 16) { setError('Choose a cover image smaller than 5 MB.'); return; }
    uploadRef.current = true; setUploading(true);
    try {
      const prepared = await processImage(file);
      const form = new FormData();
      form.append('file', prepared, 'survey-cover.jpg'); form.append('purpose', 'cover');
      const result = await readReply(await fetch('/api/uploads', { method: 'POST', body: form, signal: AbortSignal.timeout(45000) }));
      if (!result.key && !result.url) throw new Error('The cover image could not be uploaded. Please try again.');
      patch({ coverImage: result.key || result.url });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The cover image could not be uploaded. Please try again.'); }
    finally { uploadRef.current = false; setUploading(false); if (fileInput.current) fileInput.current.value = ''; }
  }

  async function save(status: Survey['status']) {
    if (busyRef.current || uploadRef.current) return;
    const invalid = validate(status);
    if (invalid) { setError(invalid); return; }
    busyRef.current = true; setBusy(true); setError('');
    try {
      const questions = draft.questions.map(question => {
        const clean: Question = { id: question.id, label: question.label.trim(), type: question.type, required: question.required, ...(isChoice(question.type) ? { options: question.options!.map(option => option.trim()) } : {}) };
        const original = survey.questions.find(q => q.id === clean.id);
        if (survey.responseCount > 0 && original && (original.label !== clean.label || original.type !== clean.type || JSON.stringify(original.options || []) !== JSON.stringify(clean.options || []))) clean.id = uid();
        return clean;
      });
      const payload = { title: draft.title.trim(), description: draft.description.trim(), category: draft.category, status, questions, allowPhotos: draft.allowPhotos, requireName: draft.requireName, showOnBoard: draft.showOnBoard, coverImage: draft.coverImage || '', closesAt: closing ? new Date(closing).toISOString() : '' };
      const result = await readReply(await fetch(survey.id ? `/api/surveys/${encodeURIComponent(survey.id)}` : '/api/surveys', { ...json(payload, survey.id ? 'PATCH' : 'POST'), signal: AbortSignal.timeout(30000) }));
      if (!result.survey?.id) throw new Error('The server did not confirm your survey. Please try saving again.');
      onSaved(result.survey);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your survey could not be saved. Please try again.'); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function archive() {
    if (!survey.id || busyRef.current || uploadRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      await readReply(await fetch(`/api/surveys/${encodeURIComponent(survey.id)}`, { method: 'DELETE', signal: AbortSignal.timeout(30000) }));
      onSaved(undefined, true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This survey could not be archived. Please try again.'); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return <Modal title={t(survey.id ? 'Edit survey' : 'Create a survey')} onClose={close} wide>
    <div className="builder-intro"><span className="eyebrow">{t("Survey studio")}</span><p className="muted">{t("Ask the right questions. Make every response count.")}</p></div>
    {error && <div className="error-banner" role="alert">{typeof error === 'string' ? t(error) : t(error.key, error.vars)}</div>}
    <fieldset className="builder-fieldset" disabled={busy || uploading}>
      <div className="form-grid">
        <label className="form-field full"><span className="form-label">{t("Survey title")} <span className="required">*</span></span><input className="text-input" value={draft.title} maxLength={160} placeholder={t("e.g. Help shape the next drive")} onChange={e => patch({ title: e.target.value })} autoFocus /></label>
        <label className="form-field full"><span className="form-label">{t("Introduction")}</span><textarea className="text-area" value={draft.description} maxLength={2000} placeholder={t("Let people know what you want to learn and why their feedback matters.")} onChange={e => patch({ description: e.target.value })} /></label>
        <label className="form-field"><span className="form-label">{t("Category")}</span><select className="select-input" value={draft.category} onChange={e => patch({ category: e.target.value })}>{categories.map(category => <option key={category} value={category}>{categoryLabel(category)}</option>)}{!categories.includes(draft.category) && <option value={draft.category}>{draft.category}</option>}</select></label>
        <label className="form-field"><span className="form-label">{t("Closing date")} <span className="muted">{t("(optional)")}</span></span><input className="text-input" type="datetime-local" value={closing} onChange={e => setClosing(e.target.value)} /><span className="help-text">{t("Your local time. Leave empty to keep the survey open.")}</span></label>
        <div className="form-field full"><span className="form-label">{t("Cover image")} <span className="muted">{t("(optional)")}</span></span>
          {draft.coverImage ? <div className="cover-preview"><img src={fileUrl(draft.coverImage)} alt={t("Survey cover preview")} /><div className="cover-actions"><button type="button" className="button small secondary" onClick={() => fileInput.current?.click()}><ImagePlus />{t("Replace")}</button><button type="button" className="icon-button danger" aria-label={t("Remove cover image")} onClick={() => patch({ coverImage: '' })}><X /></button></div></div> : <button className="photo-upload cover-upload" type="button" onClick={() => fileInput.current?.click()}><Camera /><strong>{t("Add a cover image")}</strong><small>{t("JPG, PNG, or WebP · Up to 5 MB")}</small></button>}
          <input ref={fileInput} className="sr-only" tabIndex={-1} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => void uploadCover(e.target.files?.[0])} />
        </div>
      </div>
      <div className="divider" />
      <div className="row between builder-section-title"><div><span className="eyebrow">{t("The questions")}</span><h3>{t("What would you like to know?")}</h3></div><span className="badge gray">{number(draft.questions.length)} / {number(20)}</span></div>
      {survey.responseCount > 0 && <p className="help-text builder-note">{t("Changes apply to future responses. Existing responses remain available.")}</p>}
      <div className="question-list">
        {draft.questions.map((question, index) => <div className="question-card" key={question.id}>
          <div className="row"><span className="question-number">{number(index + 1, { minimumIntegerDigits: 2, useGrouping: false })}</span><div className="question-tools"><select aria-label={t('Question {number} type', { number: number(index + 1) })} className="select-input" value={question.type} onChange={e => changeType(question, e.target.value as Question['type'])}>{questionTypes.map(type => <option value={type.value} key={type.value}>{t(type.label)}</option>)}</select><button type="button" className="icon-button" disabled={index === 0} aria-label={t('Move question {number} up', { number: number(index + 1) })} onClick={() => moveQuestion(index, -1)}><ArrowUp /></button><button type="button" className="icon-button" disabled={index === draft.questions.length - 1} aria-label={t('Move question {number} down', { number: number(index + 1) })} onClick={() => moveQuestion(index, 1)}><ArrowDown /></button><button type="button" className="icon-button danger" disabled={draft.questions.length === 1} aria-label={t('Delete question {number}', { number: number(index + 1) })} onClick={() => patch({ questions: draft.questions.filter(q => q.id !== question.id) })}><Trash2 /></button></div></div>
          <label className="form-field"><span className="sr-only">{t('Question {number}', { number: number(index + 1) })}</span><input className="text-input" maxLength={400} placeholder={t("Write your question here…")} value={question.label} onChange={e => patchQuestion(question.id, { label: e.target.value })} /></label>
          {isChoice(question.type) && <div className="option-list">{(question.options || []).map((option, optionIndex) => <div className="option-row" key={optionIndex}><span className="option-dot" /><input className="text-input" aria-label={t('Question {number}, choice {choice}', { number: number(index + 1), choice: number(optionIndex + 1) })} maxLength={160} value={option} placeholder={t('Choice {number}', { number: number(optionIndex + 1) })} onChange={e => patchQuestion(question.id, { options: question.options!.map((value, i) => i === optionIndex ? e.target.value : value) })} /><button type="button" className="icon-button danger" disabled={(question.options?.length || 0) <= 2} aria-label={t('Delete choice {number}', { number: number(optionIndex + 1) })} onClick={() => patchQuestion(question.id, { options: question.options!.filter((_, i) => i !== optionIndex) })}><X /></button></div>)}<button className="button ghost small" type="button" disabled={(question.options?.length || 0) >= 12} onClick={() => patchQuestion(question.id, { options: [...(question.options || []), ''] })}><Plus />{t("Add choice")}</button></div>}
          {question.type === 'rating' && <p className="help-text question-help">{t("People will choose a rating from 1 to 5.")}</p>}
          {question.type === 'yesno' && <p className="help-text question-help">{t("People will choose Yes or No.")}</p>}
          <label className="required-toggle"><input type="checkbox" checked={question.required} onChange={e => patchQuestion(question.id, { required: e.target.checked })} /><span>{t("Answer required")}</span></label>
        </div>)}
      </div>
      <button type="button" className="button secondary add-question" disabled={draft.questions.length >= 20} onClick={() => patch({ questions: [...draft.questions, { id: uid(), label: '', type: 'long', required: true }] })}><Plus />{t("Add question")}</button>
      <div className="divider" />
      <span className="eyebrow">{t("Response settings")}</span>
      <label className="toggle-row"><div><strong>{t("Photo responses")}</strong><p>{t("Let people attach photos and take a selfie.")}</p></div><input type="checkbox" checked={draft.allowPhotos} onChange={e => patch({ allowPhotos: e.target.checked })} /></label>
      <label className="toggle-row"><div><strong>{t("Require a name")}</strong><p>{t("Ask respondents to enter their name before submitting.")}</p></div><input type="checkbox" checked={draft.requireName} onChange={e => patch({ requireName: e.target.checked })} /></label>
      <label className="toggle-row"><div><strong>{t("Public response board")}</strong><p>{t("Allow approved responses with consent to appear on the board.")}</p></div><input type="checkbox" checked={draft.showOnBoard} onChange={e => patch({ showOnBoard: e.target.checked })} /></label>
    </fieldset>
    {uploading && <p className="upload-status" role="status"><LoaderCircle size={15} />{t("Preparing and uploading your cover…")}</p>}
    {confirmArchive ? <div className="archive-confirm"><h3>{t("Archive this survey?")}</h3><p>{t("It will stop accepting responses and disappear from the public board. Existing responses stay in your dashboard.")}</p><div className="row"><button className="button secondary" disabled={busy} onClick={() => setConfirmArchive(false)}>{t("Keep survey")}</button><button className="button danger" disabled={busy} onClick={() => void archive()}>{busy ? <LoaderCircle /> : <Trash2 />}{t("Archive survey")}</button></div></div> : <div className="builder-footer">
      <div className="row">{survey.id && <button className="button ghost small" disabled={busy || uploading} onClick={() => setConfirmArchive(true)}><Trash2 />{t("Archive")}</button>}{survey.id && survey.status === 'active' && <button className="button ghost small" disabled={busy || uploading} onClick={() => void save('closed')}>{t("Close survey")}</button>}</div>
      <div className="row"><button className="button secondary" disabled={busy || uploading} onClick={() => void save('draft')}><Save />{t("Save draft")}</button><button className="button primary" disabled={busy || uploading} onClick={() => void save(survey.status === 'closed' ? 'closed' : 'active')}>{busy ? <LoaderCircle /> : <Check />}{t(survey.status === 'active' ? 'Save changes' : survey.status === 'closed' ? 'Save closed survey' : 'Publish survey')}<ChevronRight /></button></div>
      {survey.status === 'closed' && <button className="button ghost small reopen-survey" disabled={busy || uploading} onClick={() => void save('active')}>{t("Reopen this survey")}</button>}
    </div>}
  </Modal>;
}
