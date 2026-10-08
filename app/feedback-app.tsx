'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, CheckCircle2, Clock, CheckCheck, Grid2X2, LayoutGrid, Maximize2, Minimize2, RefreshCw, Image as ImageIcon, Languages, MessageSquare, Moon, Plus, Search, ShieldCheck, Sun, WifiOff, X } from 'lucide-react';
import { answer, categories, fileUrl, type FeedbackItem, type ResponseItem, type Survey } from './model';
import { languages, usePreferences, type Language } from './i18n';
import { getAllPending, removePending, request, sendFeedbackPending, sendPending } from './offline';
import FeedbackComposer from './feedback-composer';
import ManagerBoard from './manager-board';
import ResponseFlow from './response-flow';
import RegisterSW from './register-sw';
import { Modal } from './ui';
import { EmptyArtwork, FeedbackCard, PhotoGallery } from './board-widgets';
import { ToyotaCorner, ToyotaLogo } from './toyota-brand';
import { readSaved, selectFeedback, type BoardSort, type BoardStatus } from './lib/board';

type Session = { user: { email: string; displayName: string } | null; isAdmin: boolean; authMode?: string };
type Notice = { text: string; variables?: Record<string, string | number> };

function legacyFeedback(response: ResponseItem): FeedbackItem {
  const questions = response.questions || [];
  const message = questions.length ? questions.map(q => `${q.label}\n${answer(response.answers[q.id], q.type)}`).join('\n\n') : Object.values(response.answers).map(value => answer(value)).join('\n\n');
  return { id: response.id, name: response.publicName || response.name || 'Anonymous', avatar: response.avatar || 'default', category: response.category, title: response.surveyTitle, message, photos: response.photos, status: response.status, published: true, kioskId: response.kioskId, area: response.area, createdAt: response.createdAt, legacy: true };
}

export default function FeedbackApp() {
  const { t, language, setLanguage, theme, toggleTheme, categoryLabel, statusLabel, number } = usePreferences();
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]), [session, setSession] = useState<Session>({ user: null, isAdmin: false });
  const [loading, setLoading] = useState(true), [online, setOnline] = useState(true), [error, setError] = useState(''), [toast, setToast] = useState<Notice | null>(null);
  const [category, setCategory] = useState('All'), [composing, setComposing] = useState(false), [manager, setManager] = useState(false), [selectedId, setSelectedId] = useState('');
  const [saved, setSaved] = useState<string[]>([]), [savedOnly, setSavedOnly] = useState(false), [search, setSearch] = useState(''), [sort, setSort] = useState<BoardSort>('newest'), [photosOnly, setPhotosOnly] = useState(false);
  const [status, setStatus] = useState<BoardStatus>('all'), [compact, setCompact] = useState(true), [boardMode, setBoardMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false), [lastUpdated, setLastUpdated] = useState('');
  const boardModeButton = useRef<HTMLButtonElement>(null);
  const [gallery, setGallery] = useState<{ id: string; index: number } | null>(null), [shareLink, setShareLink] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const [kioskId, setKioskId] = useState('K-01'), [area, setArea] = useState('Experience Zone'), [kiosk, setKiosk] = useState(false), [legacyForm, setLegacyForm] = useState<Survey | null>(null);
  const [pendingCount, setPendingCount] = useState(0), [queueError, setQueueError] = useState<string[]>([]);
  const fetching = useRef(false), syncing = useRef(false);

  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true; setRefreshing(true);
    try {
      const [current, previous, identity] = await Promise.allSettled([request<{ feedback: FeedbackItem[] }>('/api/feedback'), request<{ responses: ResponseItem[] }>('/api/board'), request<Session>('/api/session')]);
      if (current.status === 'rejected') throw current.reason;
      const legacy = previous.status === 'fulfilled' ? previous.value.responses.map(legacyFeedback) : [];
      setFeedback([...current.value.feedback, ...legacy].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
      setSession(identity.status === 'fulfilled' ? identity.value : { user: null, isAdmin: false });
      setLastUpdated(new Date().toISOString());
      setError(previous.status === 'rejected' ? 'Some earlier feedback could not be loaded. Try refreshing.' : '');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The feedback board could not be loaded.'); }
    finally { setLoading(false); setRefreshing(false); fetching.current = false; }
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

  useEffect(() => {
    const read = () => { try { setCompact(localStorage.getItem('fd-board-density') !== 'comfortable'); setSaved(readSaved(localStorage.getItem('fd-saved'))); } catch { setSaved([]); } };
    read(); window.addEventListener('storage', read); return () => window.removeEventListener('storage', read);
  }, []);
  useEffect(() => {
    if (loading || error) return;
    const id = new URLSearchParams(location.search).get('feedback');
    if (id && feedback.some(item => item.id === id && item.published && item.status !== 'hidden')) setSelectedId(id);
    else if (id) { const url = new URL(location.href); url.searchParams.delete('feedback'); history.replaceState({}, '', url.pathname + url.search); setSelectedId(''); setGallery(null); setToast({ text: 'This feedback is no longer on the public board.' }); }
    if (gallery && !feedback.some(item => item.id === gallery.id)) setGallery(null);
  }, [feedback, loading, error]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (manager || composing || selectedId || gallery || shareLink || legacyForm || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape' && boardMode && !(event.target instanceof HTMLElement && ['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))) { setBoardMode(false); boardModeButton.current?.focus(); }
      if (event.key === '/' && !(event.target instanceof HTMLElement && (['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName) || event.target.isContentEditable))) { event.preventDefault(); searchInput.current?.focus(); }
    };
    document.addEventListener('keydown', keyboard); return () => document.removeEventListener('keydown', keyboard);
  }, [manager, composing, selectedId, gallery, shareLink, legacyForm, boardMode]);

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 6500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (!manager && !(composing && kiosk)) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => { setComposing(false); setManager(false); history.replaceState({}, '', '/'); setToast({ text: 'Returned to the feedback board after inactivity.' }); }, manager ? 180000 : 120000); };
    reset(); window.addEventListener('pointerdown', reset); window.addEventListener('keydown', reset);
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', reset); window.removeEventListener('keydown', reset); };
  }, [manager, composing, kiosk]);

  function openComposer() { setBoardMode(false); setComposing(true); setManager(false); history.replaceState({}, '', '/'); requestAnimationFrame(() => document.querySelector('.feedback-composer')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })); }
  function closeManager() { setManager(false); history.replaceState({}, '', '/'); void refresh(); }
  function posted(item?: FeedbackItem, queued?: boolean) {
    setComposing(false);
    if (queued) { setToast({ text: 'Saved on this device. Your feedback will send when connected.' }); void getAllPending().then(items => setPendingCount(items.length)).catch(() => {}); }
    else { if (item?.published && item.status !== 'hidden') { clearFilters(); setSavedOnly(false); setSort('newest'); setFeedback(previous => [item, ...previous.filter(existing => existing.id !== item.id)]); requestAnimationFrame(() => document.getElementById('feedback-wall')?.scrollIntoView({ block: 'start' })); } setToast({ text: item?.published ? 'Your feedback is on the board. Thank you for sharing.' : 'Your feedback was sent privately to the team. Thank you for sharing.' }); void refresh(); }
  }
  function toggleSaved(id: string) {
    const next = saved.includes(id) ? saved.filter(value => value !== id) : [id, ...saved].slice(0, 500);
    try { localStorage.setItem('fd-saved', JSON.stringify(next)); setSaved(next); setToast({ text: saved.includes(id) ? 'Removed from saved feedback.' : 'Saved to this device.' }); }
    catch { setToast({ text: 'This device could not save the feedback. Check your browser storage settings.' }); }
  }
  async function share(item: FeedbackItem) {
    const url = new URL('/', location.origin); url.searchParams.set('feedback', item.id);
    try { await navigator.clipboard.writeText(url.toString()); setToast({ text: 'Link copied. Pass the thought along.' }); }
    catch { setShareLink(url.toString()); }
  }
  function openFeedback(id: string) { setSelectedId(id); const url = new URL(location.href); url.searchParams.set('feedback', id); history.replaceState({}, '', url.pathname + url.search); }
  function closeFeedback() { setSelectedId(''); const url = new URL(location.href); url.searchParams.delete('feedback'); history.replaceState({}, '', url.pathname + url.search); }
  const clearFilters = () => { setCategory('All'); setSearch(''); setPhotosOnly(false); setStatus('all'); };
  function toggleDensity() { setCompact(value => { const next = !value; try { localStorage.setItem('fd-board-density', next ? 'compact' : 'comfortable'); } catch {} return next; }); }
  function toggleBoardMode() { setBoardMode(value => !value); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' })); }
  const visible = useMemo(() => selectFeedback(feedback, { category, status, search, sort, photosOnly, savedOnly, saved }), [feedback, category, status, search, sort, photosOnly, savedOnly, saved]);
  const selected = feedback.find(item => item.id === selectedId && item.published && item.status !== 'hidden');
  const galleryItem = gallery && feedback.find(item => item.id === gallery.id && item.published && item.status !== 'hidden');
  const savedCount = feedback.filter(item => saved.includes(item.id)).length;
  const filtered = Boolean(search.trim() || photosOnly || category !== 'All' || status !== 'all');
  const adoptedCount = feedback.filter(item => item.published && item.status === 'adopted').length;
  const overlay = manager || Boolean(legacyForm) || Boolean(selected) || Boolean(galleryItem) || Boolean(shareLink);
  const photo = (item: FeedbackItem, index: number) => setGallery({ id: item.id, index });

  return <div className={`feedback-app ${boardMode ? 'board-mode' : ''} ${compact ? 'board-compact' : ''}`}><RegisterSW />
    <div inert={overlay || undefined}>
      <header className="feedback-header"><a href="/" className="feedback-brand" aria-label={t('Feedback Drive home')}><ToyotaLogo /><span className="brand-name">Feedback <span>Drive</span></span></a><div className="feedback-header-actions"><div className="preference-controls"><label className="language-control"><Languages size={16} aria-hidden="true" /><select className="language-select" aria-label={t('Language')} value={language} onChange={event => setLanguage(event.target.value as Language)}>{languages.map(item => <option key={item.code} value={item.code} lang={item.code}>{item.label}</option>)}</select></label><button className="icon-button theme-toggle" onClick={toggleTheme} aria-pressed={theme === 'dark'} aria-label={t(theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')} title={t(theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button></div><button className="button ghost small manager-button" aria-label={t('Manager board')} onClick={() => { setManager(true); history.replaceState({}, '', '/?view=admin'); }}><ShieldCheck size={16} /><span className="manager-label">{t('Manager board')}</span></button><button className="button primary add-feedback-button" aria-expanded={composing} aria-controls="feedback-compose-region" onClick={openComposer}><Plus size={18} />{t('Add feedback')}</button></div></header>
      <main className="feedback-main">
        <div className="board-heading" id="feedback-wall"><div className="board-heading-copy"><div className="wall-eyebrow"><span aria-hidden="true" />TOYOTA INDUSTRIES <span className="eyebrow-divider" aria-hidden="true">/</span> {t('Ideas in motion')}</div><h1 className="board-title">{t('The idea board')}</h1><p className="board-description">{t('Your feedback. Our next improvement.')}</p></div><div className="board-heading-side"><div className="kaizen-sign"><span lang="ja">改善</span><div>KAIZEN<small>{t('Continuous improvement')}</small></div></div><div className="board-totals"><span><MessageSquare size={13} />{t('{count} shared', { count: number(feedback.length) })}</span>{adoptedCount > 0 && <button aria-pressed={status === 'adopted'} onClick={() => setStatus(value => value === 'adopted' ? 'all' : 'adopted')}><CheckCheck size={14} />{number(adoptedCount)} {statusLabel('adopted')}</button>}</div></div></div>
        {!online && <div className="error-banner" role="status"><WifiOff size={17} /><span>{t('You’re offline. Feedback and photos will be saved on this device until connected.')}</span></div>}
        {error && online && <div className="error-banner" role="alert"><span>{t(error)}</span><button className="button ghost small" onClick={() => void refresh()}>{t('Retry')}</button></div>}
        {pendingCount > 0 && <div className="panel queue-banner" role="status"><Clock size={17} /><span>{t('{count} saved posts waiting to send.', { count: number(pendingCount) })} {queueError.length > 0 && t('Needs attention: {message}', { message: queueError.map(message => t(message)).join(' ') })}</span><button className="button small" disabled={!online} onClick={() => void syncQueue()}>{t('Retry sync')}</button></div>}
        <div className="board-toolbar">
          <div className="wall-controls">
            <label className="wall-search"><Search size={16} /><input ref={searchInput} aria-label={t('Search public feedback')} placeholder={t('Search thoughts, ideas or experiences…')} value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setSearch(''); searchInput.current?.blur(); } }} />{search ? <button aria-label={t('Clear search')} onClick={() => setSearch('')}><X size={14} /></button> : <kbd aria-hidden="true">/</kbd>}</label>
            <div className="wall-view-tabs" role="group" aria-label={t('Public feedback')}><button aria-pressed={!savedOnly} onClick={() => setSavedOnly(false)}><MessageSquare size={14} />{t('All ideas')}</button><button aria-pressed={savedOnly} onClick={() => setSavedOnly(true)}><Bookmark size={14} />{t('Saved')}{savedCount > 0 && <span>{number(savedCount)}</span>}</button></div>
            <div className="board-view-controls"><button className="board-tool" aria-pressed={compact} aria-label={t('Compact cards')} title={t(compact ? 'Show larger cards' : 'Show compact cards')} onClick={toggleDensity}>{compact ? <Grid2X2 size={17} /> : <LayoutGrid size={17} />}</button><button ref={boardModeButton} className="board-tool" aria-pressed={boardMode} aria-label={t(boardMode ? 'Exit board view' : 'Expand board')} title={t(boardMode ? 'Exit board view' : 'Expand board')} onClick={toggleBoardMode}>{boardMode ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button><button className="board-tool refresh-board" disabled={refreshing || !online} aria-label={t('Refresh board')} title={lastUpdated ? t('Updated at {time}', { time: new Date(lastUpdated).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }) }) : t('Refresh board')} onClick={() => void refresh()}><RefreshCw size={16} className={refreshing ? 'is-refreshing' : ''} /></button></div>
            {boardMode && <button className="button primary board-add" onClick={openComposer}><Plus size={16} />{t('Add feedback')}</button>}
          </div>
          <div className="board-filter-row"><div className="category-tabs" role="group" aria-label={t('Filter feedback by category')}>{['All', ...categories].map(value => { const count = feedback.filter(item => value === 'All' || item.category === value).length; return <button key={value} className={`category-tab ${category === value ? 'active' : ''}`} aria-pressed={category === value} onClick={() => setCategory(value)}>{categoryLabel(value)}{count > 0 && <span>{number(count)}</span>}</button>; })}</div><div className="board-filter-tools"><button className="wall-photo-filter" aria-label={t('With photos')} title={t('With photos')} aria-pressed={photosOnly} onClick={() => setPhotosOnly(value => !value)}><ImageIcon size={15} /></button><select className="select-input wall-status-select" aria-label={t('Filter by progress')} value={status} onChange={event => setStatus(event.target.value as BoardStatus)}><option value="all">{t('All progress')}</option>{['new','reviewed','shortlisted','adopted'].map(value => <option key={value} value={value}>{value === 'new' ? t('Shared') : statusLabel(value)}</option>)}</select><select className="select-input wall-sort" aria-label={t('Sort feedback')} value={sort} onChange={event => setSort(event.target.value as BoardSort)}><option value="newest">{t('Newest first')}</option><option value="oldest">{t('Oldest first')}</option><option value="rated">{t('Highest rated')}</option></select></div></div>
        </div>
        {filtered && <div className="wall-results"><span role="status">{t(visible.length === 1 ? '{count} result' : '{count} results', { count: number(visible.length) })}</span><button className="button ghost small" onClick={clearFilters}>{t('Clear filters')}</button></div>}
        <div className="feedback-layout">
          <section className="feedback-feed" aria-label={t('Public feedback')} aria-busy={loading}>
            {loading ? <div className="feedback-grid">{[1, 2, 3].map(value => <div className="skeleton" key={value} />)}</div> : visible.length ? <div className="feedback-grid">{visible.map(item => <FeedbackCard key={item.id} item={item} compact={compact} saved={saved.includes(item.id)} onSave={toggleSaved} onShare={share} onOpen={openFeedback} onPhoto={photo} />)}</div> : <div className="feedback-empty"><EmptyArtwork /><div className="feedback-empty-card"><h2>{t(filtered ? 'No matching thoughts.' : savedOnly ? 'Save the thoughts that stay with you.' : 'Nothing here just yet.')}</h2><p>{t(filtered ? 'Try a different search or clear your filters.' : savedOnly ? 'Tap the bookmark on a post. Your saved feedback stays on this device.' : 'Share what worked well, or what could be better.')}</p>{filtered ? <button className="button secondary" onClick={clearFilters}>{t('Clear filters')}</button> : savedOnly ? <button className="button secondary" onClick={() => setSavedOnly(false)}>{t('Show all feedback')}</button> : <button className="button primary" onClick={openComposer}><Plus size={17} />{t('Add feedback')}</button>}</div></div>}
          </section>
        </div>
        <section className="drive-corner" aria-label={t('Share feedback')}><ToyotaCorner onAdd={openComposer} composing={composing} /><div id="feedback-compose-region">{composing && <FeedbackComposer kioskId={kioskId} area={area} onClose={() => setComposing(false)} onPosted={posted} />}</div></section>
        <footer className="feedback-board-footer"><ShieldCheck size={14} /><span>{t('Shared with permission. Contact details stay private.')}</span></footer>
      </main>
    </div>
    {manager && <div className="manager-overlay"><ManagerBoard session={session} kioskId={kioskId} area={area} onSettings={(id, nextArea) => { setKioskId(id); setArea(nextArea); localStorage.setItem('sd-kiosk-id', id); localStorage.setItem('sd-area', nextArea); }} onClose={closeManager} onUpdated={() => void refresh()} /></div>}
    {legacyForm && <div className="legacy-form-overlay"><ResponseFlow survey={legacyForm} kiosk={kiosk} kioskId={kioskId} area={area} onClose={() => { setLegacyForm(null); history.replaceState({}, '', '/'); void refresh(); }} onQueued={() => { void getAllPending().then(items => setPendingCount(items.length)).catch(() => {}); }} /></div>}
    {galleryItem && gallery ? <Modal title={t('Feedback photo')} onClose={() => setGallery(null)} wide><PhotoGallery item={galleryItem} index={gallery.index} onIndex={index => setGallery(value => value ? { ...value, index } : null)} /></Modal> : selected && !shareLink && <Modal title={t('Feedback')} onClose={closeFeedback}><FeedbackCard item={selected} full saved={saved.includes(selected.id)} onSave={toggleSaved} onShare={share} onPhoto={photo} /></Modal>}
    {shareLink && <Modal title={t('Copy feedback link')} onClose={() => setShareLink('')}><div className="wall-share-fallback"><p>{t('Copy this link to share the feedback.')}</p><input aria-label={t('Copy feedback link')} readOnly value={shareLink} onFocus={event => event.currentTarget.select()} /></div></Modal>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={18} /><span>{t(toast.text, toast.variables)}</span><button className="icon-button" aria-label={t('Dismiss message')} onClick={() => setToast(null)}><X size={14} /></button></div>}
  </div>;
}
