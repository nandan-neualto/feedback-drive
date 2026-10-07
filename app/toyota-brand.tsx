'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Camera, Pause, Play, Plus } from 'lucide-react';
import { usePreferences } from './i18n';

export function ToyotaLogo() {
  return <span className="toyota-logo"><img src="/toyota/toyota-industries-group.svg" alt="Toyota Industries Group" width="300" height="106" /></span>;
}

export function ToyotaCorner({ onAdd, composing }: { onAdd: () => void; composing: boolean }) {
  const { t } = usePreferences();
  const [paused, setPaused] = useState(true), [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReduced(query.matches); if (query.matches) setPaused(true); };
    update(); setPaused(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return <div className={'drive-corner-card ' + (paused ? 'motion-paused' : '')}>
    <div className="drive-scene"><div className="drive-grid" aria-hidden="true" /><span className="drive-outline-word" aria-hidden="true">DRIVE</span><div className="drive-road" aria-hidden="true"><span /><span /></div><img className="drive-car" src="/toyota/car-hero.webp" alt="" width="1536" height="1024" loading="lazy" /><span className="drive-scene-tag">{t('Ideas in motion')}</span>{!reduced && <button className="drive-motion-control" aria-pressed={paused} aria-label={t(paused ? 'Play motion' : 'Pause motion')} title={t(paused ? 'Play motion' : 'Pause motion')} onClick={() => setPaused(value => !value)}>{paused ? <Play size={13} /> : <Pause size={13} />}</button>}</div>
    {!composing && <div className="drive-corner-copy"><div className="drive-corner-title"><h2>{t('A small idea can go a long way.')}</h2><Camera size={18} aria-hidden="true" /></div><p>{t('Share a thought, an experience, or a photo.')}</p><button className="drive-corner-launch" aria-controls="feedback-compose-region" aria-expanded={composing} onClick={onAdd}><Plus size={16} /><span>{t('Add feedback')}</span><ArrowUpRight size={17} /></button></div>}
  </div>;
}

export function GarageArtwork() {
  return <div className="garage-art" aria-hidden="true"><svg viewBox="0 0 210 130" fill="none"><path d="M15 113h180" stroke="currentColor" opacity=".15" strokeWidth="2" /><path d="M32 113h18m15 0h18m15 0h18m15 0h18m15 0h18" stroke="currentColor" opacity=".3" strokeWidth="2" /><path d="m42 68 17-27h79l20 27 13 9v22H29V79z" fill="var(--fd-surface)" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" /><path d="m67 47-12 21h41V47zm35 0v21h43l-15-21z" fill="var(--fd-accent-soft)" /><path d="M34 78h22m89 0h21M74 87h52" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><circle cx="53" cy="99" r="12" fill="var(--fd-background)" stroke="currentColor" strokeWidth="3" /><circle cx="148" cy="99" r="12" fill="var(--fd-background)" stroke="currentColor" strokeWidth="3" /><circle cx="53" cy="99" r="4" fill="currentColor" /><circle cx="148" cy="99" r="4" fill="currentColor" /><path d="M146 17h42v26h-15l-9 8v-8h-18z" fill="var(--fd-accent)" /><path d="M154 26h25m-25 8h16" stroke="white" strokeWidth="2.5" strokeLinecap="round" /></svg></div>;
}
