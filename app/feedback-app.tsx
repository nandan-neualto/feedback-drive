'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, Languages, MessageSquare, Moon, Plus, ShieldCheck, Star, Sun, WifiOff, X } from 'lucide-react';
import { answer, categories, fileUrl, type FeedbackItem, type ResponseItem, type Survey } from './model';
import { languages, usePreferences, type Language } from './i18n';
import { getAllPending, removePending, request, sendFeedbackPending, sendPending } from './offline';
import FeedbackComposer from './feedback-composer';
import ManagerBoard from './manager-board';
import ResponseFlow from './response-flow';
import RegisterSW from './register-sw';
import { Avatar, Modal } from './ui';

type Session = { user: { email: string; displayName: string } | null; isAdmin: boolean };
type Notice = { text: string; variables?: Record<string, string | number> };

function legacyFeedback(response: ResponseItem): FeedbackItem {
  const questions = response.questions || [];
  const message = questions.length ? questions.map(q => `${q.label}\n${answer(response.answers[q.id], q.type)}`).join('\n\n') : Object.values(response.answers).map(value => answer(value)).join('\n\n');
  return { id: response.id, name: response.publicName || response.name || 'Anonymous', avatar: response.avatar || 'default', category: response.category, title: response.surveyTitle, message, photos: response.photos, status: response.status, published: true, kioskId: response.kioskId, area: response.area, createdAt: response.createdAt, legacy: true };
}

export default function FeedbackApp() {
  const { t, language, setLanguage, theme, toggleTheme, categoryLabel, number } = usePreferences();
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]), [session, setSession] = useState<Session>({ user: null, isAdmin: false });
  const [loading, setLoading] = useState(true), [online, setOnline] = useState(true), [error, setError] = useState(''), [toast, setToast] = useState<Notice | null>(null);
  const [category, setCategory] = useState('All'), [composing, setComposing] = useState(false), [manager, setManager] = useState(false), [lightbox, setLightbox] = useState('');
  const [kioskId, setKioskId] = useState('K-01'), [area, setArea] = useState('Experience Zone'), [kiosk, setKiosk] = useState(false), [legacyForm, setLegacyForm] = useState<Survey | null>(null);
  const [pendingCount, setPendingCount] = useState(0), [queueError, setQueueError] = useState<string[]>([]);
  const fetching = useRef(false), syncing = useRef(false);

  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const [current, previous, identity] = await Promise.allSettled([request<{ feedback: FeedbackItem[] }>('/api/feedback'), request<{ responses: ResponseItem[] }>('/api/board'), request<Session>('/api/session')]);
      if (current.status === 'rejected') throw current.reason;
      const legacy = previous.status === 'fulfilled' ? previous.value.responses.map(legacyFeedback) : [];
      setFeedback([...current.value.feedback, ...legacy].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
      setSession(identity.status === 'fulfilled' ? identity.value : { user: null, isAdmin: false });
      setError(previous.status === 'rejected' ? 'Some earlier feedback could not be loaded. Try refreshing.' : '');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The feedback board could not be loaded.'); }
    finally { setLoading(false); fetching.current = false; }
  }, []);

  const syncQueue = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const items = await getAllPending();
      setPendingCount(items.length);
      if (!navigator.onLine) return;
      let sent = 0;
      const failures: string[] = [];
      for (const item of items) {
        try {
          const confirmation = item.kind === 'feedback' ? await sendFeedbackPending(item) : await sendPending(item);
          if (!confirmation.id || !confirmation.submitted) throw Object.assign(new Error('The server did not confirm your saved feedback. It will be retried safely.'), { status: 502 });
          await removePending(item.id); sent++;
        } catch (failure) {
          failures.push(failure instanceof Error ? failure.message : 'Saved feedback needs attention.');
          const status = (failure as Error & { status?: number }).status;
          if (!navigator.onLine || status === undefined || status >= 500) break;
        }
      }
      setQueueError(failures);
      setPendingCount((await getAllPending()).length);
      if (sent) { setToast({ text: '{count} saved posts have been sent.', variables: { count: sent } }); void refresh(); }
    } catch { setQueueError(['Saved feedback could not be read on this device.']); }
    finally { syncing.current = false; }
  }, [refresh]);

  useEffect(() => {
    const station = () => { setKioskId(localStorage.getItem('sd-kiosk-id') || 'K-01'); setArea(localStorage.getItem('sd-area') || 'Experience Zone'); setKiosk(localStorage.getItem('fd-kiosk-mode') === 'true'); };
    queueMicrotask(() => { station(); setOnline(navigator.onLine); void refresh(); void syncQueue(); });
    const params = new URLSearchParams(location.search);
    if (['admin', 'results'].includes(params.get('view') || '')) queueMicrotask(() => setManager(true));
    if (params.get('kiosk')) { const id = params.get('kiosk')!.slice(0, 80); localStorage.setItem('sd-kiosk-id', id); if (params.get('area')?.trim()) localStorage.setItem('sd-area', params.get('area')!.trim().slice(0, 120)); localStorage.setItem('fd-kiosk-mode', 'true'); queueMicrotask(station); }
    if (params.get('survey')) void request<{ surveys: Survey[] }>('/api/surveys').then(result => { const found = result.surveys.find(item => item.id === params.get('survey')); if (found) setLegacyForm(found); else setToast({ text: 'This feedback form is no longer available. You can still add feedback here.' }); }).catch(() => setToast({ text: 'This feedback form could not be opened.' }));
    const connect = () => { setOnline(navigator.onLine); if (navigator.onLine) { void refresh(); void syncQueue(); } };
    const timer = setInterval(() => { if (navigator.onLine) void refresh(); void syncQueue(); }, 30000);
    window.addEventListener('online', connect); window.addEventListener('offline', connect); window.addEventListener('feedback-station-updated', station);
    return () => { clearInterval(timer); window.removeEventListener('online', connect); window.removeEventListener('offline', connect); window.removeEventListener('feedback-station-updated', station); };
  }, [refresh, syncQueue]);

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 6500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!manager && !(composing && kiosk)) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => { setComposing(false); setManager(false); history.replaceState({}, '', '/'); setToast({ text: 'Returned to the feedback board after inactivity.' }); }, manager ? 180000 : 120000); };
    reset(); window.addEventListener('pointerdown', reset); window.addEventListener('keydown', reset);
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', reset); window.removeEventListener('keydown', reset); };
  }, [manager, composing, kiosk]);

  function openComposer() { setComposing(true); setManager(false); history.replaceState({}, '', '/'); requestAnimationFrame(() => document.querySelector('.feedback-composer')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); }
  function closeManager() { setManager(false); history.replaceState({}, '', '/'); void refresh(); }
  function posted(item?: FeedbackItem, queued?: boolean) {
    setComposing(false);
    if (queued) { setToast({ text: 'Saved on this device. Your feedback will post when connected.' }); void getAllPending().then(items => setPendingCount(items.length)).catch(() => {}); }
    else { if (item?.published && item.status !== 'hidden') { setCategory('All'); setFeedback(previous => [item, ...previous.filter(existing => existing.id !== item.id)]); } setToast({ text: 'Your feedback is on the board. Thank you for sharing.' }); void refresh(); }
  }
  const visible = feedback.filter(item => category === 'All' || item.category === category);
  const overlay = manager || Boolean(legacyForm) || Boolean(lightbox);

  return <div className="feedback-app"><RegisterSW />
    <div inert={overlay || undefined}>
      <header className="feedback-header"><Link href="/" className="feedback-brand" aria-label={t('Feedback Drive home')}><span className="brand-mark"><MessageSquare size={22} strokeWidth={1.8} /></span><span className="brand-name">Feedback <span>Drive</span></span></Link><div className="feedback-header-actions"><div className="preference-controls"><label className="language-control"><Languages size={16} aria-hidden="true" /><select className="language-select" aria-label={t('Language')} value={language} onChange={event => setLanguage(event.target.value as Language)}>{languages.map(item => <option key={item.code} value={item.code} lang={item.code}>{item.label}</option>)}</select></label><button className="icon-button theme-toggle" onClick={toggleTheme} aria-pressed={theme === 'dark'} aria-label={t(theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')} title={t(theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button></div><button className="button ghost small manager-button" aria-label={t('Manager board')} onClick={() => { setManager(true); history.replaceState({}, '', '/?view=admin'); }}><ShieldCheck size={16} /><span className="manager-label">{t('Manager board')}</span></button><button className="button primary add-feedback-button" aria-expanded={composing} aria-controls="feedback-compose-region" onClick={openComposer}><Plus size={18} />{t('Add feedback')}</button></div></header>
      <main className="feedback-main">
        <div className="board-heading"><div><h1 className="board-title">{t('Feedback')}</h1><p className="board-description">{t('A space for your thoughts, ideas, and experiences.')}</p></div>{feedback.length > 0 && <span className="board-count">{t('{count} shared', { count: number(feedback.length) })}</span>}</div>
        {!online && <div className="error-banner" role="status"><WifiOff size={17} /><span>{t('You’re offline. Feedback and photos will be saved on this device until connected.')}</span></div>}
        {error && online && <div className="error-banner" role="alert"><span>{t(error)}</span><button className="button ghost small" onClick={() => void refresh()}>{t('Retry')}</button></div>}
        {pendingCount > 0 && <div className="panel queue-banner" role="status"><Clock size={17} /><span>{t('{count} saved posts waiting to send.', { count: number(pendingCount) })} {queueError.length > 0 && t('Needs attention: {message}', { message: queueError.map(message => t(message)).join(' ') })}</span><button className="button small" disabled={!online} onClick={() => void syncQueue()}>{t('Retry sync')}</button></div>}
        <div className="category-tabs" role="group" aria-label={t('Filter feedback by category')}>{['All', ...categories].map(value => { const count = feedback.filter(item => value === 'All' || item.category === value).length; return <button key={value} className={`category-tab ${category === value ? 'active' : ''}`} aria-pressed={category === value} onClick={() => setCategory(value)}>{categoryLabel(value)}{count > 0 && <span>{number(count)}</span>}</button>; })}</div>
        <div className={`feedback-layout ${composing ? 'composing' : ''}`}>
          <section className="feedback-feed" aria-label={t('Public feedback')} aria-busy={loading}>
            {loading ? <div className="feedback-grid">{[1, 2, 3].map(value => <div className="skeleton" key={value} />)}</div> : visible.length ? <div className="feedback-grid">{visible.map(item => <FeedbackCard key={item.id} item={item} onPhoto={setLightbox} />)}</div> : <div className="feedback-empty"><div className="feedback-empty-art"><MessageSquare size={28} strokeWidth={1.5} /></div><div className="feedback-empty-card"><h2>{t(category === 'All' ? 'Start a conversation.' : 'No feedback in this category yet.')}</h2><p>{t('Share what worked well, or what could be better.')}</p><button className="button primary" onClick={openComposer}><Plus size={17} />{t('Add feedback')}</button>{category !== 'All' && <button className="button ghost small" onClick={() => setCategory('All')}>{t('Show all feedback')}</button>}</div></div>}
          </section>
          <div id="feedback-compose-region">{composing && <FeedbackComposer kioskId={kioskId} area={area} onClose={() => setComposing(false)} onPosted={posted} />}</div>
        </div>
        <footer className="feedback-board-footer"><ShieldCheck size={14} /><span>{t('Shared with permission. Contact details stay private.')}</span></footer>
      </main>
    </div>
    {manager && <div className="manager-overlay"><ManagerBoard session={session} kioskId={kioskId} area={area} onSettings={(id, nextArea) => { setKioskId(id); setArea(nextArea); localStorage.setItem('sd-kiosk-id', id); localStorage.setItem('sd-area', nextArea); }} onClose={closeManager} onUpdated={() => void refresh()} /></div>}
    {legacyForm && <div className="legacy-form-overlay"><ResponseFlow survey={legacyForm} kiosk={kiosk} kioskId={kioskId} area={area} onClose={() => { setLegacyForm(null); history.replaceState({}, '', '/'); void refresh(); }} onQueued={() => { void getAllPending().then(items => setPendingCount(items.length)).catch(() => {}); }} /></div>}
    {lightbox && <Modal title={t('Feedback photo')} onClose={() => setLightbox('')} wide><img className="feedback-lightbox-image" src={lightbox} alt={t('Full size photo shared with feedback')} /></Modal>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={18} /><span>{t(toast.text, toast.variables)}</span><button className="icon-button" aria-label={t('Dismiss message')} onClick={() => setToast(null)}><X size={14} /></button></div>}
  </div>;
}

function FeedbackCard({ item, onPhoto }: { item: FeedbackItem; onPhoto: (url: string) => void }) {
  const { t, categoryLabel, statusLabel, formatDate, number } = usePreferences();
  const [expanded, setExpanded] = useState(false);
  const long = item.message.length > 420;
  const autoTitle = item.message.length > 80 ? `${item.message.slice(0, 77).trimEnd()}…` : item.message;
  const showTitle = item.title && item.title !== autoTitle && item.title !== item.message;
  return <article className="feedback-card">
    <div className="feedback-card-top"><Avatar value={item.avatar} /><div className="grow"><strong>{!item.name || item.name === 'Anonymous' ? t('Anonymous') : item.publicName || item.name}</strong><span className="help-text block">{formatDate(item.createdAt)}</span></div>{item.status !== 'new' && <span className="feedback-status">{statusLabel(item.status)}</span>}</div>
    <div className="feedback-card-body"><div className="feedback-card-meta"><span>{categoryLabel(item.category)}</span>{item.rating && <span aria-label={t('{rating} out of 5 stars', { rating: number(item.rating) })}><Star size={13} fill="currentColor" />{number(item.rating)}/5</span>}</div>{showTitle && <h2 className="feedback-card-title">{item.title}</h2>}<p style={{ whiteSpace: 'pre-wrap' }}>{long && !expanded ? `${item.message.slice(0, 420)}…` : item.message}</p>{long && <button className="button ghost small" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{t(expanded ? 'Read less' : 'Read more')}</button>}{item.suggestion && <div className="feedback-suggestion"><span className="detail-label">{t('Suggested improvement')}</span><p>{item.suggestion}</p></div>}</div>
    {item.photos.length > 0 && <div className="feedback-photo-grid">{item.photos.map((photo, index) => <button key={photo} className="feedback-image" aria-label={t('View feedback photo {number}', { number: number(index + 1) })} onClick={() => onPhoto(fileUrl(photo))}><img src={fileUrl(photo)} loading="lazy" alt={t('Photo {number} shared with feedback', { number: number(index + 1) })} /></button>)}</div>}
    {item.area && item.area !== 'Experience Zone' && <div className="feedback-card-footer"><span className="help-text">{item.area}</span></div>}
  </article>;
}
