'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, ClipboardList, Clock3, ImagePlus, MapPin, Power, RotateCcw, Send, Trash2, Upload, X } from 'lucide-react';
import { answer, avatars, colors, uid, type Question, type Survey } from './model';
import { usePreferences } from './i18n';
import { Avatar, Empty, Modal } from './ui';
import { savePending, sendPending, type PendingResponse } from './offline';

type Attachment = { blob: Blob; name: string };
type Answers = Record<string, string | string[] | number>;
type Props = { survey: Survey; kiosk: boolean; kioskId: string; area: string; onClose: () => void; onQueued: () => void };

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The photo could not be processed. Try another image.')), 'image/jpeg', quality));
}

/** Compress photos before upload; the same helper is used for survey covers. */
export async function processImage(file: Blob, selfie = false): Promise<Blob> {
  if (file.type && !file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose a photo smaller than 25 MB.');
  let image: ImageBitmap | HTMLImageElement;
  let temporaryUrl = '';
  try {
    if (typeof createImageBitmap === 'function') image = await createImageBitmap(file);
    else {
      temporaryUrl = URL.createObjectURL(file);
      const decoded = new Image(); decoded.src = temporaryUrl; await decoded.decode(); image = decoded;
    }
  } catch {
    if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
    throw new Error('This photo could not be opened. Try a JPEG, PNG, or WebP image.');
  }
  try {
    const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
    const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
    if (!width || !height) throw new Error('This image is empty. Choose another photo.');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(width, height));
    canvas.width = selfie ? 480 : Math.max(1, Math.round(width * scale));
    canvas.height = selfie ? 480 : Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Photo processing is unavailable in this browser.');
    if (selfie) { const crop = Math.min(width, height); ctx.drawImage(image, (width - crop) / 2, (height - crop) / 2, crop, crop, 0, 0, 480, 480); }
    else ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvasBlob(canvas, selfie ? .85 : .8);
  } finally {
    if ('close' in image) image.close();
    if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
  }
}

function useBlobUrl(blob?: Blob) {
  const [url, setUrl] = useState('');
  useEffect(() => { const next = blob ? URL.createObjectURL(blob) : ''; const frame = requestAnimationFrame(() => setUrl(next)); return () => { cancelAnimationFrame(frame); if (next) URL.revokeObjectURL(next); }; }, [blob]);
  return url;
}

function Photo({ file, onRemove, index }: { file: Attachment; onRemove?: () => void; index: number }) {
  const { t } = usePreferences();
  const url = useBlobUrl(file.blob);
  return <div className="photo-thumb"><img src={url || undefined} alt={t("Attached photo {count}", { count: index + 1 })} />{onRemove && <button type="button" className="remove-photo" aria-label={t("Remove photo {count}", { count: index + 1 })} onClick={onRemove}><X /></button>}</div>;
}

function cameraMessage(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  if (!window.isSecureContext) return 'The camera needs a secure connection. You can choose a photo from your device below.';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was blocked. Allow access in your browser settings and retry, or choose a photo below.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No camera was found. Choose a photo from your device below.';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'Another app is using the camera. Close it and retry, or choose a photo below.';
  return 'The camera could not start. Retry or choose a photo from your device.';
}

export function CameraCapture({ selfie, onUse, onClose }: { selfie: boolean; onUse: (photo: Attachment) => void; onClose: () => void }) {
  const { t } = usePreferences();
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const captureLock = useRef(false);
  const [retry, setRetry] = useState(0), [ready, setReady] = useState(false), [error, setError] = useState(''), [shot, setShot] = useState<Attachment>(), [busy, setBusy] = useState(false);
  const preview = useBlobUrl(shot?.blob);
  useEffect(() => {
    let cancelled = false;
    const stop = () => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; };
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('Camera unavailable', 'SecurityError');
        let incoming: MediaStream;
        try { incoming = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: selfie ? 'user' : 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); }
        catch (e) { if (!(e instanceof Error) || e.name !== 'OverconstrainedError') throw e; incoming = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
        if (cancelled) { incoming.getTracks().forEach(track => track.stop()); return; }
        stream.current = incoming;
        incoming.getVideoTracks()[0]?.addEventListener('ended', () => { if (!cancelled) { setReady(false); setError('The camera was disconnected. Retry to reconnect.'); } });
        if (video.current) { video.current.srcObject = incoming; await video.current.play(); }
        if (!cancelled) setReady(true);
      } catch (e) { if (!cancelled) setError(cameraMessage(e)); }
    })();
    return () => { cancelled = true; stop(); };
  }, [retry, selfie]);

  function restart() { setReady(false); setError(''); setShot(undefined); setRetry(value => value + 1); }

  async function capture() {
    if (captureLock.current || !ready || !video.current?.videoWidth) return;
    captureLock.current = true; setBusy(true); setError('');
    try {
      const source = video.current, canvas = document.createElement('canvas');
      const width = source.videoWidth, height = source.videoHeight, crop = Math.min(width, height), scale = Math.min(1, 1600 / Math.max(width, height));
      canvas.width = selfie ? 480 : Math.round(width * scale); canvas.height = selfie ? 480 : Math.round(height * scale);
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Photo capture is unavailable. Choose an image below.');
      if (selfie) { ctx.translate(480, 0); ctx.scale(-1, 1); ctx.drawImage(source, (width - crop) / 2, (height - crop) / 2, crop, crop, 0, 0, 480, 480); }
      else ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      setShot({ blob: await canvasBlob(canvas, selfie ? .85 : .8), name: selfie ? 'selfie.jpg' : `photo-${Date.now()}.jpg` });
    } catch (e) { setError(e instanceof Error ? e.message : 'The photo could not be captured.'); }
    finally { captureLock.current = false; setBusy(false); }
  }
  async function choose(file?: File) {
    if (!file || captureLock.current) return;
    captureLock.current = true; setBusy(true); setError('');
    try { setShot({ blob: await processImage(file, selfie), name: selfie ? 'selfie.jpg' : 'photo.jpg' }); }
    catch (e) { setError(e instanceof Error ? e.message : 'The photo could not be processed.'); }
    finally { captureLock.current = false; setBusy(false); }
  }

  return <Modal title={selfie ? t("Take a selfie") : t("Take a photo")} onClose={onClose} wide>
    <p className="muted small-text">{selfie ? t("Fit your face in the centre. Review your photo before using it.") : t("Show the detail you want to share. Review your photo before using it.")}</p>
    <div style={{ position: 'relative', width: '100%', minHeight: 220, aspectRatio: '16 / 10', background: '#07090d', border: "1px solid #343b46", borderRadius: 8, overflow: 'hidden' }}>
      <video ref={video} playsInline muted aria-label={t("Live camera preview")} style={{ display: shot || !ready ? 'none' : 'block', width: '100%', height: '100%', objectFit: 'cover', transform: selfie ? 'scaleX(-1)' : undefined }} />
      {shot ? <img src={preview || undefined} alt={t("Photo preview")} style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', inset: 0 }} /> : !ready ? <div className="stack center" style={{ position: 'absolute', inset: 0, padding: 24, textAlign: 'center' }}><Camera size={36} /><p className="muted small-text">{error ? t(error) : t("Starting camera…")}</p></div> : selfie ? <div aria-hidden="true" style={{ position: 'absolute', top: '50%', left: '50%', width: '65%', aspectRatio: '1', maxWidth: 300, border: "2px dashed #ffffffa0", borderRadius: '50%', transform: "translate(-50%, -50%)", pointerEvents: 'none' }} /> : null}
    </div>
    {error && (ready || shot) && <p className="error-banner mt" role="alert">{t(error)}</p>}
    <div className="row wrap between mt">
      <div className="row wrap"><button type="button" className="button" disabled={busy} onClick={() => fileInput.current?.click()}><Upload />{t("Choose photo")}</button>{!ready && <button type="button" className="button" disabled={busy} onClick={restart}><RotateCcw />{t("Retry camera")}</button>}</div>
      {shot ? <div className="row"><button type="button" className="button" onClick={() => { if (!ready) restart(); else setShot(undefined); }}><RotateCcw />{t("Retake")}</button><button type="button" className="button primary" onClick={() => onUse(shot)}><Check />{t("Use photo")}</button></div> : <button type="button" className="button primary" disabled={!ready || busy} onClick={capture}><Camera />{busy ? t("Processing…") : t("Take photo")}</button>}
    </div>
    <input ref={fileInput} type="file" accept="image/*" capture={selfie ? 'user' : 'environment'} className="sr-only" aria-label={t("Choose a photo")} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void choose(file); }} />
  </Modal>;
}

function questionError(question: Question, value: Answers[string] | undefined) {
  const empty = value === undefined || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length);
  if (empty) return question.required ? 'Please answer this question before continuing.' : '';
  if ((question.type === 'short' || question.type === 'long') && (typeof value !== 'string' || value.trim().length > (question.type === 'short' ? 500 : 5000))) return 'Please shorten your answer.';
  if (question.type === 'rating' && (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5)) return 'Choose a rating from 1 to 5.';
  if (question.type === 'single' && (typeof value !== 'string' || !question.options?.includes(value))) return 'Choose one of the available options.';
  if (question.type === 'multiple' && (!Array.isArray(value) || value.some(option => !question.options?.includes(option)))) return 'Choose from the available options.';
  return '';
}

export default function ResponseFlow({ survey, kiosk, kioskId, area, onClose, onQueued }: Props) {
  const { t, categoryLabel, number } = usePreferences();
  const [screen, setScreen] = useState<'welcome' | 'form' | 'done'>('welcome'), [step, setStepState] = useState(0), [currentTime, setCurrentTime] = useState(() => Date.now());
  const [name, setName] = useState(''), [contact, setContact] = useState(''), [avatar, setAvatar] = useState('default'), [selfie, setSelfie] = useState<Attachment>();
  const [answers, setAnswers] = useState<Answers>({}), [photos, setPhotos] = useState<Attachment[]>([]), [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({}), [error, setError] = useState(''), [busy, setBusy] = useState(false), [photoBusy, setPhotoBusy] = useState(false);
  const [camera, setCamera] = useState<'selfie' | 'photo' | null>(null), [discard, setDiscard] = useState(false), [idle, setIdle] = useState(0), [seconds, setSeconds] = useState(10);
  const [result, setResult] = useState<{ reference: string; pending: boolean }>();
  const requestId = useRef(''), submitLock = useRef(false), imageLock = useRef(false), lastActivity = useRef(0), idleRef = useRef(0), callbacks = useRef({ onClose, onQueued });
  const stepHeading = useRef<HTMLHeadingElement>(null), nameInput = useRef<HTMLInputElement>(null), uploadInput = useRef<HTMLInputElement>(null), selfieInput = useRef<HTMLInputElement>(null);
  useEffect(() => { callbacks.current = { onClose, onQueued }; }, [onClose, onQueued]);
  useEffect(() => { idleRef.current = idle; }, [idle]);
  const selfieUrl = useBlobUrl(selfie?.blob);
  const finalTouches = survey.allowPhotos || survey.showOnBoard;
  const photoStep = survey.questions.length + 1;
  const reviewStep = survey.questions.length + 1 + (finalTouches ? 1 : 0);
  const totalSteps = reviewStep + 1;
  const question = step > 0 && step <= survey.questions.length ? survey.questions[step - 1] : undefined;
  const closed = survey.status !== 'active' || Boolean(survey.closesAt && new Date(survey.closesAt).getTime() <= currentTime);

  useEffect(() => { requestId.current = uid(); }, []);
  useEffect(() => { if (screen === 'form') { stepHeading.current?.focus(); if (step === 0) nameInput.current?.focus(); } lastActivity.current = Date.now(); }, [step, screen]);
  useEffect(() => { if (!survey.closesAt || new Date(survey.closesAt).getTime() <= currentTime) return; const delay = Math.max(0, new Date(survey.closesAt).getTime() - Date.now()); const timer = setTimeout(() => setCurrentTime(Date.now()), Math.min(delay + 5, 2147483647)); return () => clearTimeout(timer); }, [survey.closesAt, currentTime]);
  useEffect(() => {
    if (!kiosk || screen === 'done' || busy || photoBusy) return;
    lastActivity.current = Date.now();
    const activity = () => { if (!idleRef.current) lastActivity.current = Date.now(); };
    const tick = window.setInterval(() => { const remaining = Math.ceil((120000 - (Date.now() - lastActivity.current)) / 1000); if (remaining <= 0) callbacks.current.onClose(); else if (remaining <= 15) setIdle(remaining); }, 1000);
    window.addEventListener('pointerdown', activity); window.addEventListener('keydown', activity); window.addEventListener('input', activity);
    return () => { clearInterval(tick); window.removeEventListener('pointerdown', activity); window.removeEventListener('keydown', activity); window.removeEventListener('input', activity); };
  }, [kiosk, screen, busy, photoBusy]);
  useEffect(() => {
    if (screen !== 'done' || !kiosk) return;
    let remaining = 10;
    const timer = setInterval(() => { remaining -= 1; setSeconds(remaining); if (remaining <= 0) { clearInterval(timer); callbacks.current.onClose(); } }, 1000);
    return () => clearInterval(timer);
  }, [screen, kiosk]);

  function setStep(value: number | ((current: number) => number)) { setError(''); setStepState(value); }

  function profileErrors() {
    const next: Record<string, string> = {};
    if ((survey.requireName || name.trim()) && name.trim().length < 2) next.name = 'Enter your name (at least 2 characters).';
    if (name.trim().length > 100) next.name = 'Keep your name under 100 characters.';
    if (contact.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim()) && !/^\+?[0-9 ()-]{8,18}$/.test(contact.trim())) next.contact = 'Enter a valid email address or mobile number.';
    return next;
  }
  function validateAll() {
    const next = profileErrors();
    for (const q of survey.questions) { const message = questionError(q, answers[q.id]); if (message) next[q.id] = message; }
    setErrors(next);
    if (Object.keys(next).length) { const failed = survey.questions.findIndex(q => Boolean(next[q.id])); setStep(next.name || next.contact ? 0 : failed + 1); setScreen('form'); return false; }
    return true;
  }
  function next() {
    if (closed || (survey.closesAt && new Date(survey.closesAt).getTime() <= Date.now())) { setError('This survey is closed and no longer accepts responses.'); return; }
    const nextErrors = step === 0 ? profileErrors() : question ? { [question.id]: questionError(question, answers[question.id]) } : {};
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    setStep(value => value + 1);
  }
  function changeAnswer(q: Question, value: string | string[] | number) { setAnswers(previous => ({ ...previous, [q.id]: value })); setErrors(previous => ({ ...previous, [q.id]: '' })); }
  function exit() { if (busy) return; if (screen === 'form' && (name || contact || Object.keys(answers).length || selfie || photos.length)) setDiscard(true); else onClose(); }

  async function choosePhotos(files: File[]) {
    if (imageLock.current || busy) return;
    imageLock.current = true; setPhotoBusy(true); setError('');
    try {
      const available = Math.max(0, 3 - photos.length);
      if (!available) { setError('You can attach up to 3 photos. Remove a photo to add another.'); return; }
      const selected: Attachment[] = [];
      for (const file of files.slice(0, available)) selected.push({ blob: await processImage(file), name: `photo-${uid()}.jpg` });
      setPhotos(previous => [...previous, ...selected].slice(0, 3));
      if (files.length > available) setError('Only the first 3 photos were added. Remove one to change your selection.');
    } catch (e) { setError(e instanceof Error ? e.message : 'The photo could not be processed.'); }
    finally { imageLock.current = false; setPhotoBusy(false); }
  }
  async function chooseSelfie(file?: File) {
    if (!file || imageLock.current || busy) return;
    imageLock.current = true; setPhotoBusy(true); setError('');
    try { setSelfie({ blob: await processImage(file, true), name: 'selfie.jpg' }); }
    catch (e) { setError(e instanceof Error ? e.message : 'The profile photo could not be processed.'); }
    finally { imageLock.current = false; setPhotoBusy(false); }
  }
  async function submit() {
    if (submitLock.current || photoBusy || !validateAll()) return;
    if (closed || (survey.closesAt && new Date(survey.closesAt).getTime() <= Date.now())) { setError('This survey is closed and no longer accepts responses.'); return; }
    submitLock.current = true; setBusy(true); setError('');
    const trimmedAnswers: Answers = Object.fromEntries(Object.entries(answers).filter(([, value]) => typeof value !== 'string' || value.trim()).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
    const pending: PendingResponse = { id: requestId.current || (requestId.current = uid()), surveyId: survey.id, payload: { name: name.trim(), contact: contact.trim(), avatar, answers: trimmedAnswers, consent: survey.showOnBoard && consent, kioskId: kioskId || 'K-01', area: area || 'Experience Zone' }, files: survey.allowPhotos ? photos : [], ...(survey.allowPhotos && selfie ? { selfie } : {}), createdAt: new Date().toISOString() };
    try {
      const response = await sendPending(pending);
      const reference = response.id || response.responseId || response.response?.id;
      if (!reference) { const missing = new Error('The server did not return a reference. Your response will be retried safely.') as Error & { status: number }; missing.status = 502; throw missing; }
      setResult({ reference, pending: false }); setSeconds(10); setScreen('done');
    } catch (e) {
      const status = (e as Error & { status?: number }).status;
      if (status === undefined || status >= 500) {
        try { await savePending(pending); setResult({ reference: `PENDING-${pending.id.slice(0, 8).toUpperCase()}`, pending: true }); setSeconds(10); setScreen('done'); callbacks.current.onQueued(); }
        catch { setError('Your response could not be sent or saved on this device. Keep this page open and try again when connected.'); }
      } else setError(e instanceof Error ? e.message : 'Your response could not be accepted. Please review your answers.');
    } finally { submitLock.current = false; setBusy(false); }
  }
  function another() { requestId.current = uid(); setAnswers({}); setPhotos([]); setConsent(false); setResult(undefined); setErrors({}); setStep(0); setScreen('form'); lastActivity.current = Date.now(); }

  if (closed && screen !== 'done') return <div className="survey-experience"><Empty icon={ClipboardList} title={t("This survey is closed")} text={t("It is no longer accepting responses. You can explore other active surveys.")}><button className="button" onClick={onClose}><ArrowLeft />{t("Back to surveys")}</button></Empty></div>;

  return <div className="survey-experience">
    <div className="row between wrap mb"><button className="button ghost" disabled={busy} onClick={exit}><ArrowLeft />{kiosk ? t("Back to survey board") : t("Back to surveys")}</button><span className="badge"><MapPin size={12} />{area}{kiosk ? ` · ${kioskId}` : ''}</span></div>
    {screen === 'welcome' ? <section className="welcome-panel">
      <div className="welcome-copy"><div className="eyebrow">{t("{category} survey", { category: categoryLabel(survey.category) })}</div><h1>{survey.title}</h1><p>{survey.description || t("Your experience can make the next drive better. Share your thoughts with our team.")}</p><div className="survey-meta"><span><ClipboardList />{t("{count} questions", { count: number(survey.questions.length) })}</span><span><Clock3 />{t("About {count} min", { count: number(Math.max(1, Math.ceil(survey.questions.length / 3))) })}</span>{survey.allowPhotos && <span><Camera />{t("Photos welcome")}</span>}</div><p className="help-text mt">{t("Optional questions can be skipped. Your contact details are shared only with the survey team.")}</p></div>
      <div className="gauge"><button className="start-button" onClick={() => { setScreen('form'); setStep(0); }}><Power /><small>{t("Tap to")}</small>{t("Start")}</button></div>
    </section> : screen === 'done' && result ? <section className="success-panel" aria-live="polite">
      <div className="check-mark"><CheckCircle2 /></div><div className="eyebrow">{result.pending ? t("Saved on this device") : t("Response received")}</div><h2>{result.pending ? t("Ready for the road.") : t("Thank you for sharing.")}</h2><p>{name.trim() ? `${name.trim().split(/\s+/)[0]}, ` : ''}{result.pending ? t("your response and photos are saved securely on this device. They will send automatically when the connection returns.") : t("your response has reached the survey team. Your perspective helps shape a better experience.")}</p><div className="panel mb" style={{ padding: "15px 20px", maxWidth: '100%', overflowWrap: 'anywhere' }}><div className="detail-label">{result.pending ? t("Pending reference") : t("Response reference")}</div><strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{result.reference}</strong></div><div className="row"><button className="button" onClick={another}><RotateCcw />{t("Share another response")}</button><button className="button primary" onClick={onClose}><Check />{t("Done")}</button></div>{kiosk && <p className="help-text mt" role="status">{t("Returning to the survey board in {count} seconds.", { count: number(seconds) })}</p>}
    </section> : <section className="response-flow">
      <aside className="flow-sidebar"><div className="category-mark" style={{ color: colors[survey.category] }}><ClipboardList /></div><h2>{survey.title}</h2><p>{survey.description}</p><div className="detail-item"><div className="detail-label">{t("Your progress")}</div><strong>{step === 0 ? t("Your profile") : step === reviewStep ? t("Ready to review") : question ? t("Question {count} of {total}", { count: number(step), total: number(survey.questions.length) }) : t("Photos & privacy")}</strong></div><div className="detail-item"><div className="detail-label">{t("Privacy")}</div><p>{t("Contact details stay with the survey team. You choose whether your answers can appear on the public board.")}</p></div><div className="detail-item"><div className="detail-label">{t("Location")}</div><p>{area}{kiosk && <><br />{t("Kiosk {name}", { name: kioskId })}</>}</p></div></aside>
      <form className="flow-main" noValidate onSubmit={event => { event.preventDefault(); if (step === reviewStep) void submit(); else next(); }}>
        <div className="flow-progress"><strong>{step === reviewStep ? t("Pre-drive check") : t("Step {count} of {total}", { count: number(step + 1), total: number(totalSteps) })}</strong><span>{t("{count}% complete", { count: number(Math.round((step + 1) / totalSteps * 100)) })}</span></div><div className="progress-track" role="progressbar" aria-label={t("Survey progress")} aria-valuemin={0} aria-valuemax={totalSteps} aria-valuenow={step + 1}><div className="progress-fill" style={{ width: `${(step + 1) / totalSteps * 100}%` }} /></div>
        {error && <div className="error-banner mt" role="alert">{t(error)}</div>}
        {step === 0 ? <div className="answer-card"><span className="eyebrow">{t("Driver profile")}</span><h3 ref={stepHeading} tabIndex={-1}>{t("Let’s start with you.")}</h3><p>{survey.requireName ? t("Add your name and choose a profile picture.") : t("Your name is optional. You can respond anonymously.")}</p><div className="form-grid">
          <label className="form-field"><span className="form-label">{t("Your name")} {survey.requireName ? <span className="required">*</span> : t("(optional)")}</span><input ref={nameInput} className="text-input" maxLength={100} autoComplete="name" autoCapitalize="words" placeholder={t("e.g. Priya Sharma")} value={name} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'profile-name-error' : undefined} onChange={event => { setName(event.target.value); setErrors(previous => ({ ...previous, name: '' })); }} />{errors.name && <span id="profile-name-error" role="alert" className="red-text small-text">{t(errors.name)}</span>}</label>
          <label className="form-field"><span className="form-label">{t("Email or mobile (optional)")}</span><input className="text-input" maxLength={200} autoComplete="email" placeholder={t("So we can update you")} value={contact} aria-invalid={Boolean(errors.contact)} aria-describedby="contact-help" onChange={event => { setContact(event.target.value); setErrors(previous => ({ ...previous, contact: '' })); }} /><span id="contact-help" className={errors.contact ? "red-text small-text" : 'help-text'} role={errors.contact ? 'alert' : undefined}>{errors.contact ? t(errors.contact) : t("Only the survey team can see your contact details.")}</span></label>
        </div><div className="divider" /><div className="row between wrap mb"><div className="response-avatar"><Avatar value={selfieUrl || avatar} /><div><strong>{t("Your profile picture")}</strong><small>{t(survey.allowPhotos ? "Choose an avatar or add a selfie." : "Choose an avatar.")}</small></div></div>{survey.allowPhotos && <div className="row wrap"><button type="button" className="button small" disabled={photoBusy} onClick={() => setCamera('selfie')}><Camera />{selfie ? t("Retake selfie") : t("Take a selfie")}</button><button type="button" className="button small" disabled={photoBusy} onClick={() => selfieInput.current?.click()}><Upload />{t("Upload selfie")}</button>{selfie && <button type="button" className="icon-button" aria-label={t("Remove selfie")} onClick={() => setSelfie(undefined)}><Trash2 /></button>}</div>}</div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="sr-only">{t("Choose your avatar")}</legend><div className="avatar-grid">{avatars.map((option, index) => <label key={option.id} className={`avatar-option ${!selfie && avatar === option.id ? 'selected' : ''}`} style={{ cursor: 'pointer' }}><input className="sr-only" type="radio" name="avatar" checked={!selfie && avatar === option.id} value={option.id} aria-label={t("Avatar {count}", { count: number(index + 1) })} onChange={() => { setAvatar(option.id); setSelfie(undefined); }} /><span aria-hidden="true">{option.icon}</span></label>)}</div></fieldset><input ref={selfieInput} className="sr-only" aria-label={t("Upload your selfie")} type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void chooseSelfie(file); }} />{photoBusy && <p className="help-text mt" role="status">{t("Preparing your photo…")}</p>}</div> : question ? <div className="answer-card"><span className="eyebrow">{t("Question {count}", { count: number(step) })}</span><h3 ref={stepHeading} tabIndex={-1} id="question-heading">{question.label}</h3><p>{question.required ? t("Required") : t("Optional — you can skip this question.")}{question.type === 'multiple' ? t("Choose all that apply.") : ''}</p>
          {question.type === 'short' || question.type === 'long' ? <><label className="sr-only" htmlFor={`answer-${question.id}`}>{question.label}</label>{question.type === 'long' ? <textarea id={`answer-${question.id}`} className="text-area" rows={5} maxLength={5000} placeholder={t("Tell us in your own words…")} value={typeof answers[question.id] === 'string' ? String(answers[question.id]) : ''} aria-invalid={Boolean(errors[question.id])} aria-describedby="question-error" onChange={event => changeAnswer(question, event.target.value)} /> : <input id={`answer-${question.id}`} className="text-input" maxLength={500} placeholder={t("Your answer…")} value={typeof answers[question.id] === 'string' ? String(answers[question.id]) : ''} aria-invalid={Boolean(errors[question.id])} aria-describedby="question-error" onChange={event => changeAnswer(question, event.target.value)} />}<p className="help-text text-right">{number(String(answers[question.id] || '').length)} / {question.type === 'short' ? 500 : 5000}</p></> : question.type === 'rating' ? <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="sr-only">{question.label}</legend><div className="rating-scale">{[1, 2, 3, 4, 5].map(value => <label key={value} className={`rating-button ${answers[question.id] === value ? 'selected' : ''}`} style={{ cursor: 'pointer' }}><input type="radio" name={`question-${question.id}`} className="sr-only" value={value} checked={answers[question.id] === value} aria-label={t("{count} out of 5", { count: number(value) })} onChange={() => changeAnswer(question, value)} /><span>{number(value)}</span></label>)}</div><div className="rating-labels"><span>{t("Low")}</span><span>{t("High")}</span></div></fieldset> : <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="sr-only">{question.label}</legend>{(question.type === 'yesno' ? ['Yes', 'No'] : question.options || []).map((option, index) => { const value = question.type === 'yesno' ? option.toLowerCase() : option, selected = question.type === 'multiple' ? Array.isArray(answers[question.id]) && (answers[question.id] as string[]).includes(value) : answers[question.id] === value; return <label key={`${index}-${option}`} className={`choice-option ${selected ? 'selected' : ''}`} style={{ cursor: 'pointer' }}><input type={question.type === 'multiple' ? 'checkbox' : 'radio'} name={`question-${question.id}`} checked={selected} value={value} onChange={() => { if (question.type !== 'multiple') changeAnswer(question, value); else { const previous = Array.isArray(answers[question.id]) ? answers[question.id] as string[] : []; changeAnswer(question, selected ? previous.filter(item => item !== value) : [...previous, value]); } }} /><span>{question.type === 'yesno' ? t(option) : option}</span></label>; })}</fieldset>}
          {errors[question.id] && <p id="question-error" role="alert" className="red-text small-text mt">{t(errors[question.id])}</p>}{!question.required && answers[question.id] !== undefined && <button type="button" className="button ghost small mt" onClick={() => { setAnswers(previous => { const nextAnswers = { ...previous }; delete nextAnswers[question.id]; return nextAnswers; }); setErrors(previous => ({ ...previous, [question.id]: '' })); }}>{t("Clear answer")}</button>}
        </div> : step === photoStep && finalTouches ? <div className="answer-card"><span className="eyebrow">{t("Final touches")}</span><h3 ref={stepHeading} tabIndex={-1}>{survey.allowPhotos ? t("A picture adds perspective.") : t("Your answers. Your choice.")}</h3><p>{survey.allowPhotos ? t("Add up to 3 photos to support your answers. This is optional.") : t("Choose whether the survey team can feature your response.")}</p>{survey.allowPhotos && <><div className="row wrap mb"><button type="button" className="button" disabled={photos.length >= 3 || photoBusy} onClick={() => setCamera('photo')}><Camera />{t("Take a photo")}</button><button type="button" className="button" disabled={photos.length >= 3 || photoBusy} onClick={() => uploadInput.current?.click()}><ImagePlus />{t("Choose photos")}</button><span className="help-text">{t("{count} / 3 photos", { count: number(photos.length) })}</span></div>{photos.length ? <div className="photo-grid">{photos.map((file, index) => <Photo key={file.name} file={file} index={index} onRemove={() => setPhotos(previous => previous.filter((_, i) => i !== index))} />)}</div> : <button type="button" className="photo-upload" onClick={() => uploadInput.current?.click()} disabled={photoBusy}><ImagePlus /><strong>{t("Choose photos from your device")}</strong><small>{t("JPEG, PNG, or WebP · up to 3 photos")}</small></button>}<input ref={uploadInput} type="file" accept="image/*" multiple className="sr-only" aria-label={t("Choose up to 3 photos")} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void choosePhotos(files); }} />{photoBusy && <p className="help-text mt" role="status">{t("Preparing your photos…")}</p>}</>}{survey.showOnBoard && <><div className="divider" /><label className="choice-option"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>{t("I allow my answers and photos to be featured on the public response board.")}</span></label><p className="help-text mt">{t("Optional. The board uses your initial or “Anonymous”, your profile picture, and your response. Your contact details stay private.")}</p></>}</div> : <div className="answer-card"><span className="eyebrow">{t("Pre-drive check")}</span><h3 ref={stepHeading} tabIndex={-1}>{t("Ready to share?")}</h3><p>{t("Check your answers before sending them to the survey team.")}</p><div className="question-list"><div className="question-card row between"><div><div className="detail-label">{t("Your profile")}</div><div className="response-avatar"><Avatar value={selfieUrl || avatar} /><div><strong>{name.trim() || t("Anonymous")}</strong><small>{contact.trim() || t("No contact details")}</small></div></div></div><button type="button" className="button small" onClick={() => setStep(0)}>{t("Edit")}</button></div>{survey.questions.map((q, index) => <div key={q.id} className="question-card"><div className="row between"><strong className="small-text">{q.label}</strong><button type="button" className="button small" onClick={() => setStep(index + 1)}>{t("Edit")}</button></div><p className="muted small-text" style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{q.type === 'yesno' ? answers[q.id] === 'yes' ? t("Yes") : answers[q.id] === 'no' ? t("No") : "—" : q.type === 'rating' && typeof answers[q.id] === 'number' ? t("{count} out of 5", { count: number(Number(answers[q.id])) }) : answer(answers[q.id], q.type)}</p></div>)}{finalTouches && <div className="question-card"><div className="row between"><strong className="small-text">{t("Photos & privacy")}</strong><button type="button" className="button small" onClick={() => setStep(photoStep)}>{t("Edit")}</button></div>{photos.length > 0 && <div className="photo-grid mb">{photos.map((file, index) => <Photo key={file.name} file={file} index={index} />)}</div>}<p className="muted small-text" style={{ margin: 0 }}>{survey.allowPhotos ? t("{count} photos attached.", { count: number(photos.length) }) + " " : ''}{survey.showOnBoard ? consent ? t("You allow your response to be featured publicly.") : t("Your response stays with the survey team.") : t("Your response stays with the survey team.")}</p></div>}</div></div>}
        <div className="flow-navigation"><button type="button" className="button ghost" disabled={busy || photoBusy} onClick={() => step === 0 ? setScreen('welcome') : setStep(value => value - 1)}><ArrowLeft />{t("Back")}</button><span className="help-text">{step === reviewStep ? t("Your feedback makes a difference.") : t("* Required questions")}</span><button type="submit" className="button primary" disabled={busy || photoBusy}>{step === reviewStep ? <><Send />{busy ? t("Sending…") : t("Submit response")}</> : <>{t("Continue")}<ArrowRight /></>}</button></div>
      </form>
    </section>}
    {camera && <CameraCapture selfie={camera === 'selfie'} onClose={() => setCamera(null)} onUse={file => { if (camera === 'selfie') setSelfie(file); else setPhotos(previous => previous.length < 3 ? [...previous, { ...file, name: `photo-${uid()}.jpg` }] : previous); setCamera(null); }} />}
    {discard && <Modal title={t("Discard this response?")} onClose={() => setDiscard(false)}><p className="muted">{t("Your answers and photos will be cleared from this device.")}</p><div className="row"><button className="button" onClick={() => setDiscard(false)}>{t("Keep editing")}</button><button className="button danger" onClick={onClose}>{t("Discard response")}</button></div></Modal>}
    {idle > 0 && <Modal title={t("Still there?")} onClose={() => { lastActivity.current = Date.now(); setIdle(0); }}><p className="muted">{t("This response will be cleared in {count} seconds to make room for the next visitor.", { count: number(idle) })}</p><button className="button primary" onClick={() => { lastActivity.current = Date.now(); setIdle(0); }}><Power />{t("Keep going")}</button></Modal>}
  </div>;
}
