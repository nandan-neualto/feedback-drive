'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUpRight, Flag, Gauge, MessageSquare, Pause, Play, Plus } from 'lucide-react';
import { usePreferences } from './i18n';

export function ToyotaLogo() {
  return <span className="toyota-logo"><img src="/toyota/toyota-logo.svg" alt="Toyota" width="520" height="347" /></span>;
}

export function ToyotaHero({ count, onAdd }: { count: number; onAdd: () => void }) {
  const { t, number } = usePreferences();
  const [paused, setPaused] = useState(true);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReduced(query.matches); if (query.matches) setPaused(true); };
    update(); setPaused(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return <section className={`toyota-hero ${paused ? 'motion-paused' : ''}`} aria-labelledby="drive-title">
    <div className="drive-grid" aria-hidden="true" />
    <div className="drive-hero-copy">
      <span className="drive-eyebrow"><span className="drive-stripes" aria-hidden="true"><i /><i /><i /></span>{t('Built around your experience')}</span>
      <h1 id="drive-title">{t('Your voice.')}<br /><span>{t('Our next gear.')}</span></h1>
      <p>{t('Every drive has a story. Share yours and help shape what comes next.')}</p>
      <div className="drive-hero-actions"><button className="button primary" onClick={onAdd}><Plus size={17} />{t('Add feedback')}<ArrowUpRight size={17} /></button><a href="#feedback-wall">{t('Explore feedback')}<ArrowDown size={15} /></a></div>
      <div className="drive-hero-note"><MessageSquare size={14} /><span>{t('Real experiences. Better journeys.')}</span></div>
    </div>
    <div className="drive-scene" aria-hidden="true">
      <div className="drive-ring" /><div className="drive-speed-lines"><i /><i /><i /></div>
      <span className="drive-outline-word">DRIVE</span>
      <div className="drive-road"><span /><span /><span /></div>
      <img className="drive-car" src="/toyota/car-hero.webp" alt="" width="1536" height="1024" fetchPriority="high" />
      <div className="drive-scene-label"><Gauge size={17} /><span>FEEDBACK / DRIVE</span><span className="drive-label-line" /><Flag size={15} /></div>
    </div>
    {!reduced && <button className="drive-motion-control" aria-pressed={paused} aria-label={t(paused ? 'Play motion' : 'Pause motion')} onClick={() => setPaused(value => !value)}>{paused ? <Play size={12} /> : <Pause size={12} />}<span>{t(paused ? 'Play motion' : 'Pause motion')}</span></button>}
    <div className="drive-hero-bottom"><span><span className="drive-live-dot" />{t('The feedback lane is open')}</span><span>{t('{count} shared', { count: number(count) })}<ArrowDown size={12} /></span></div>
  </section>;
}

export function GarageArtwork() {
  return <div className="garage-art" aria-hidden="true"><svg viewBox="0 0 210 130" fill="none"><path d="M15 113h180" stroke="currentColor" opacity=".15" strokeWidth="2" /><path d="M32 113h18m15 0h18m15 0h18m15 0h18m15 0h18" stroke="currentColor" opacity=".3" strokeWidth="2" /><path d="m42 68 17-27h79l20 27 13 9v22H29V79z" fill="var(--fd-surface)" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" /><path d="m67 47-12 21h41V47zm35 0v21h43l-15-21z" fill="var(--fd-accent-soft)" /><path d="M34 78h22m89 0h21M74 87h52" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><circle cx="53" cy="99" r="12" fill="var(--fd-background)" stroke="currentColor" strokeWidth="3" /><circle cx="148" cy="99" r="12" fill="var(--fd-background)" stroke="currentColor" strokeWidth="3" /><circle cx="53" cy="99" r="4" fill="currentColor" /><circle cx="148" cy="99" r="4" fill="currentColor" /><path d="M146 17h42v26h-15l-9 8v-8h-18z" fill="var(--fd-accent)" /><path d="M154 26h25m-25 8h16" stroke="white" strokeWidth="2.5" strokeLinecap="round" /></svg></div>;
}
