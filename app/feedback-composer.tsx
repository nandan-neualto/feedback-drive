'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, CheckCircle2, ChevronDown, Eye, ImagePlus, LockKeyhole, Send, Star, Trash2, Upload, X } from 'lucide-react';
import { avatars, categories, colors, uid, type FeedbackItem, type FeedbackPayload } from './model';
import { savePending, sendFeedbackPending, type PendingFeedback } from './offline';
import { CameraCapture, processImage } from './response-flow';
import { usePreferences } from './i18n';
import { Avatar } from './ui';

type Attachment = { blob: Blob; name: string };
type Props = { kioskId: string; area: string; onClose: () => void; onPosted: (feedback?: FeedbackItem, queued?: boolean) => void };
type Errors = { message?: string; consent?: string; contact?: string };

function usePhotoUrl(blob?: Blob) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = blob ? URL.createObjectURL(blob) : '';
    const frame = requestAnimationFrame(() => setUrl(next));
    return () => { cancelAnimationFrame(frame); if (next) URL.revokeObjectURL(next); };
  }, [blob]);
  return url;
}

function PhotoPreview({ file, index, onRemove }: { file: Attachment; index: number; onRemove: () => void }) {
  const { t } = usePreferences();
  const url = usePhotoUrl(file.blob);
  return <div className="photo-thumb"><img src={url || undefined} alt={t("Attached photo {count}", { count: index + 1 })} /><button type="button" className="remove-photo" aria-label={t("Remove photo {count}", { count: index + 1 })} onClick={onRemove}><X size={14} /></button></div>;
}

export default function FeedbackComposer({ kioskId, area, onClose, onPosted }: Props) {
  const { t, categoryLabel, number } = usePreferences();
  const [category, setCategory] = useState('Others'), [title, setTitle] = useState(''), [message, setMessage] = useState(''), [suggestion, setSuggestion] = useState(''), [rating, setRating] = useState<number>();
  const [name, setName] = useState(''), [contact, setContact] = useState(''), [avatar, setAvatar] = useState('default'), [selfie, setSelfie] = useState<Attachment>();
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [photos, setPhotos] = useState<Attachment[]>([]), [consent, setConsent] = useState(false), [more, setMore] = useState(false), [profile, setProfile] = useState(false), [contactOpen, setContactOpen] = useState(false);
  const [camera, setCamera] = useState<'photo' | 'selfie' | null>(null), [error, setError] = useState(''), [errors, setErrors] = useState<Errors>({}), [busy, setBusy] = useState(false), [photoBusy, setPhotoBusy] = useState(false), [discard, setDiscard] = useState(false), [result, setResult] = useState<'posted' | 'queued'>();
  const submitLock = useRef(false), imageLock = useRef(false), requestId = useRef('');
  const messageInput = useRef<HTMLTextAreaElement>(null), consentInput = useRef<HTMLInputElement>(null), contactInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null), cameraInput = useRef<HTMLInputElement>(null), selfieInput = useRef<HTMLInputElement>(null);
  const selfieUrl = usePhotoUrl(selfie?.blob);
  const disabled = busy || photoBusy;
  const dirty = Boolean(title || message || suggestion || rating || name || contact || selfie || photos.length || consent || avatar !== 'default' || category !== 'Others');

  useEffect(() => { messageInput.current?.focus({ preventScroll: true }); }, []);

  function close() {
    if (disabled || camera) return;
    if (dirty && !result) setDiscard(true); else onClose();
  }

  async function choosePhotos(files: File[]) {
    if (!files.length || imageLock.current || submitLock.current) return;
    imageLock.current = true; setPhotoBusy(true); setError('');
    try {
      const available = Math.max(0, 3 - photos.length);
      if (!available) { setError('You can add up to 3 photos. Remove one to add another.'); return; }
      const selected: Attachment[] = [];
      for (const file of files.slice(0, available)) selected.push({ blob: await processImage(file), name: `feedback-${uid()}.jpg` });
      setPhotos(previous => [...previous, ...selected].slice(0, 3));
      if (files.length > available) setError('Only the available photos were added. Remove one to change your selection.');
    } catch (e) { setError(e instanceof Error ? e.message : 'This photo could not be added. Try another image.'); }
    finally { imageLock.current = false; setPhotoBusy(false); }
  }

  async function chooseSelfie(file?: File) {
    if (!file || imageLock.current || submitLock.current) return;
    imageLock.current = true; setPhotoBusy(true); setError('');
    try { setSelfie({ blob: await processImage(file, true), name: 'feedback-selfie.jpg' }); }
    catch (e) { setError(e instanceof Error ? e.message : 'This profile photo could not be added. Try another image.'); }
    finally { imageLock.current = false; setPhotoBusy(false); }
  }

  function openCamera(kind: 'photo' | 'selfie') {
    if (disabled || (kind === 'photo' && photos.length >= 3)) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      if (kind === 'photo') cameraInput.current?.click(); else selfieInput.current?.click();
    } else setCamera(kind);
  }

  function validate() {
    const next: Errors = {};
    if (message.trim().length < 10) next.message = 'Add at least 10 characters so the team can understand your feedback.';
    else if (message.trim().length > 2000) next.message = 'Keep your feedback within 2,000 characters.';
    const cleanContact = contact.trim(), contactDigits = cleanContact.replace(/\D/g, '');
    const validPhone = /^\+?[\d\s().-]+$/.test(cleanContact) && contactDigits.length >= 7 && contactDigits.length <= 15 && !/^0+$/.test(contactDigits);
    if (cleanContact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanContact) && !validPhone) next.contact = 'Enter an email address or mobile number, or leave this blank.';
    if (visibility === 'public' && !consent) next.consent = 'Please agree to share your feedback on the public board.';
    setErrors(next);
    if (next.message) messageInput.current?.focus();
    else if (next.contact) { setContactOpen(true); requestAnimationFrame(() => contactInput.current?.focus()); }
    else if (next.consent) consentInput.current?.focus();
    return !Object.keys(next).length;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current || imageLock.current || result || !validate()) return;
    submitLock.current = true; setBusy(true); setError(''); setDiscard(false);
    const payload: FeedbackPayload = { name: name.trim(), contact: contact.trim(), avatar, category, title: title.trim(), message: message.trim(), ...(suggestion.trim() ? { suggestion: suggestion.trim() } : {}), ...(rating ? { rating } : {}), consent: visibility === 'public' && consent, kioskId, area };
    const pending: PendingFeedback = { id: requestId.current || (requestId.current = uid()), kind: 'feedback', payload, files: photos, ...(selfie ? { selfie } : {}), createdAt: new Date().toISOString() };
    try {
      const response = await sendFeedbackPending(pending);
      if (!response.feedback || !response.id) { const failure = new Error('The server did not return a confirmation. Your feedback will be retried safely.') as Error & { status: number }; failure.status = 502; throw failure; }
      setResult('posted'); onPosted(response.feedback, false);
    } catch (e) {
      const status = (e as Error & { status?: number }).status;
      if (status === undefined || status >= 500) {
        try { await savePending(pending); setResult('queued'); onPosted(undefined, true); }
        catch { setError('Your feedback could not be sent or saved on this device. Keep this page open and try again when connected.'); }
      } else setError(e instanceof Error ? e.message : 'Your feedback could not be posted. Please review it and try again.');
    } finally { submitLock.current = false; setBusy(false); }
  }

  return <section className="feedback-composer" aria-labelledby="feedback-composer-title">
    <div className="composer-header"><div><div className="eyebrow">{t("Your perspective matters")}</div><h2 id="feedback-composer-title">{t("Add feedback")}</h2></div><button type="button" className="icon-button" disabled={disabled} aria-label={t("Close feedback form")} onClick={close}><X size={20} /></button></div>
    {result ? <div className="composer-body" role="status"><CheckCircle2 className="green-text" /><h3>{result === 'queued' ? t("Saved on this device") : t(visibility === 'private' ? 'Your feedback was sent to the team' : 'Your feedback is on the board')}</h3><p className="muted small-text">{result === 'queued' ? t("Your feedback and photos will send when the connection returns. Keep this device available until they send.") : t("Thank you for sharing your experience.")}</p><button type="button" className="button primary" onClick={onClose}>{t("Done")}</button></div> : <form className="composer-body" onSubmit={submit} noValidate>
      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <label className="form-field"><span className="form-label">{t("Your feedback")} <span className="required">*</span></span><textarea ref={messageInput} className="text-area" rows={5} minLength={10} maxLength={2000} placeholder={t("What worked well? What could be better?")} value={message} aria-invalid={Boolean(errors.message)} aria-describedby="feedback-message-help" onChange={event => { setMessage(event.target.value); setErrors(previous => ({ ...previous, message: '' })); }} /><span id="feedback-message-help" className={errors.message ? "red-text small-text" : 'help-text'} role={errors.message ? 'alert' : undefined}>{errors.message ? t(errors.message) : t("{count} / 2,000 characters · at least 10 characters", { count: number(message.length) })}</span></label>

        <fieldset className="form-field" style={{ border: 0, padding: 0, margin: "18px 0" }}><legend className="form-label">{t("Category")}</legend><div className="category-options">{categories.map(option => <label key={option} className={`category-option ${category === option ? 'active' : ''}`} style={{ '--category-color': colors[option], cursor: 'pointer' } as React.CSSProperties}><input className="sr-only" type="radio" name="feedback-category" value={option} checked={category === option} onChange={() => setCategory(option)} /><span>{categoryLabel(option)}</span></label>)}</div></fieldset>

        <div className="form-field"><div className="row between wrap"><span className="form-label">{t("Photos")} <span className="muted">{t("(optional)")}</span></span><span className="help-text">{t("{count} / 3 photos", { count: number(photos.length) })}</span></div><div className="row wrap"><button type="button" className="button small" disabled={photos.length >= 3} onClick={() => photoInput.current?.click()}><ImagePlus />{t("Add photos")}</button><button type="button" className="button small" disabled={photos.length >= 3} onClick={() => openCamera('photo')}><Camera />{t("Take photo")}</button></div>{photos.length > 0 && <div className="photo-grid mt">{photos.map((file, index) => <PhotoPreview key={file.name} file={file} index={index} onRemove={() => setPhotos(previous => previous.filter((_, photoIndex) => photoIndex !== index))} />)}</div>}<input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" aria-label={t("Choose up to 3 feedback photos")} onChange={event => { const selected = Array.from(event.target.files || []); event.target.value = ''; void choosePhotos(selected); }} /><input ref={cameraInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" aria-label={t("Capture a feedback photo")} onChange={event => { const selected = Array.from(event.target.files || []); event.target.value = ''; void choosePhotos(selected); }} /><p className="help-text">{t("JPEG, PNG or WebP · up to 25 MB each")}</p>{photoBusy && <p className="help-text" role="status">{t("Preparing your photo…")}</p>}</div>

        <div className="composer-option"><button type="button" className="button ghost small" aria-expanded={more} aria-controls="feedback-more-details" onClick={() => setMore(value => !value)}><ChevronDown size={14} style={{ transform: more ? 'rotate(180deg)' : undefined }} />{more ? t("Hide extra details") : t("Add a headline, rating or suggestion")}</button>{more && <div id="feedback-more-details" className="stack mt"><label className="form-field"><span className="form-label">{t("Headline")} <span className="muted">{t("(optional)")}</span></span><input className="text-input" maxLength={120} placeholder={t("Give your feedback a short title")} value={title} onChange={event => setTitle(event.target.value)} /></label><fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="form-label">{t("Your experience")} <span className="muted">{t("(optional)")}</span></legend><div className="row"><div className="composer-stars" role="group" aria-label={t("Rate your experience")}>{[1, 2, 3, 4, 5].map(value => <button key={value} type="button" className={`icon-button ${rating && rating >= value ? 'selected' : ''}`} aria-label={t("{count} out of 5 stars", { count: number(value) })} aria-pressed={rating === value} onClick={() => setRating(value)}><Star size={22} fill={rating && rating >= value ? 'currentColor' : 'none'} /></button>)}</div>{rating && <button type="button" className="button ghost small" onClick={() => setRating(undefined)}>{t("Clear")}</button>}</div></fieldset><label className="form-field"><span className="form-label">{t("Your suggestion")} <span className="muted">{t("(optional)")}</span></span><textarea className="text-area" rows={3} maxLength={1000} placeholder={t("How would you improve it?")} value={suggestion} onChange={event => setSuggestion(event.target.value)} /></label></div>}</div>

        <div className="composer-option"><button type="button" className="button ghost small" aria-expanded={profile} aria-controls="feedback-profile" onClick={() => setProfile(value => !value)}><ChevronDown size={14} style={{ transform: profile ? 'rotate(180deg)' : undefined }} />{profile ? t("Hide your profile") : t("Add your name or avatar")}</button>{profile && <div id="feedback-profile" className="stack mt"><label className="form-field"><span className="form-label">{t("Your name")} <span className="muted">{t("(optional)")}</span></span><input className="text-input" autoComplete="name" autoCapitalize="words" maxLength={100} placeholder={t("Leave blank to post anonymously")} value={name} onChange={event => setName(event.target.value)} /><span className="help-text">{t("The public board shows your first initial. Your full name stays with the managers.")}</span></label><div className="response-avatar"><Avatar value={selfieUrl || avatar} /><span className="form-label">{t("Your board avatar")}</span></div><fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="sr-only">{t("Choose your avatar")}</legend><div className="avatar-grid">{avatars.map((option, index) => <label key={option.id} className={`avatar-option ${!selfie && avatar === option.id ? 'selected' : ''}`} style={{ cursor: 'pointer' }}><input type="radio" className="sr-only" name="feedback-avatar" value={option.id} checked={!selfie && avatar === option.id} aria-label={t("Avatar {count}", { count: number(index + 1) })} onChange={() => { setAvatar(option.id); setSelfie(undefined); }} /><span aria-hidden="true">{option.icon}</span></label>)}</div></fieldset><div className="row wrap"><button type="button" className="button small" onClick={() => openCamera('selfie')}><Camera />{t("Take selfie")}</button><button type="button" className="button small" onClick={() => selfieInput.current?.click()}><Upload />{t("Upload selfie")}</button>{selfie && <button type="button" className="icon-button" aria-label={t("Remove selfie")} onClick={() => setSelfie(undefined)}><Trash2 size={16} /></button>}</div><input ref={selfieInput} type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="sr-only" aria-label={t("Choose a selfie for your avatar")} onChange={event => { const selected = event.target.files?.[0]; event.target.value = ''; void chooseSelfie(selected); }} /></div>}</div>

        <div className="composer-option"><button type="button" className="button ghost small" aria-expanded={contactOpen} aria-controls="feedback-contact" onClick={() => setContactOpen(value => !value)}><ChevronDown size={14} style={{ transform: contactOpen ? 'rotate(180deg)' : undefined }} />{contactOpen ? t("Hide contact details") : t("Add contact details")}</button>{contactOpen && <label id="feedback-contact" className="form-field mt"><span className="form-label">{t("Email or mobile")} <span className="muted">{t("(optional)")}</span></span><input ref={contactInput} className="text-input" maxLength={200} autoComplete="email" placeholder={t("So the team can follow up")} value={contact} aria-invalid={Boolean(errors.contact)} aria-describedby="feedback-contact-help" onChange={event => { setContact(event.target.value); setErrors(previous => ({ ...previous, contact: '' })); }} /><span id="feedback-contact-help" className={errors.contact ? "red-text small-text" : 'help-text'} role={errors.contact ? 'alert' : undefined}>{errors.contact ? t(errors.contact) : t("Only managers can see your contact details.")}</span></label>}</div>

        <div className="divider" /><div className="composer-visibility" role="radiogroup" aria-label={t('Who can see this?')}><span className="form-label">{t('Who can see this?')}</span><div>{([{ value: 'public', label: 'Public board', icon: Eye }, { value: 'private', label: 'Only the team', icon: LockKeyhole }] as const).map(option => <label key={option.value} className={visibility === option.value ? 'active' : ''}><input type="radio" className="sr-only" name="feedback-visibility" value={option.value} checked={visibility === option.value} onChange={() => { setVisibility(option.value); setConsent(false); setErrors(previous => ({ ...previous, consent: '' })); }} /><option.icon size={14} /><span>{t(option.label)}</span></label>)}</div></div>
        {visibility === 'public' ? <><label className="choice-option"><input ref={consentInput} type="checkbox" checked={consent} aria-invalid={Boolean(errors.consent)} aria-describedby="feedback-consent-help" onChange={event => { setConsent(event.target.checked); setErrors(previous => ({ ...previous, consent: '' })); }} /><span>{t("I agree to post my feedback and photos on this public board.")}</span></label><p id="feedback-consent-help" className={errors.consent ? "red-text small-text" : 'help-text'} role={errors.consent ? 'alert' : undefined}>{errors.consent ? t(errors.consent) : t("Your feedback, photos and avatar will be visible to everyone. Contact details stay private.")}</p></> : <p className="help-text private-feedback-help"><LockKeyhole size={13} />{t('Only the team can see this feedback and its photos.')}</p>}
      </fieldset>
      {error && <p className="error-banner" role="alert">{t(error)}</p>}
      {discard && <div className="composer-discard" role="alert"><p className="small-text">{t("Discard this feedback? Your text and photos will be cleared.")}</p><div className="row wrap"><button type="button" className="button small" onClick={() => setDiscard(false)}>{t("Keep editing")}</button><button type="button" className="button danger small" onClick={onClose}>{t("Discard feedback")}</button></div></div>}
      <div className="composer-footer row between mt"><button type="button" className="button ghost" disabled={disabled} onClick={close}>{t("Cancel")}</button><button type="submit" className="button primary" disabled={disabled}><Send size={15} />{busy ? t('Sending…') : photoBusy ? t("Preparing photo…") : t(visibility === 'private' ? 'Send privately' : 'Post feedback')}</button></div>
    </form>}
    {camera && <CameraCapture selfie={camera === 'selfie'} onClose={() => setCamera(null)} onUse={file => { if (camera === 'selfie') setSelfie({ ...file, name: 'feedback-selfie.jpg' }); else setPhotos(previous => previous.length < 3 ? [...previous, { ...file, name: `feedback-${uid()}.jpg` }] : previous); setCamera(null); }} />}
  </section>;
}
