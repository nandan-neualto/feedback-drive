'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { avatars, fileUrl } from './model';
import { usePreferences } from './i18n';
export function Avatar({ value }: { value?: string }) { const { t } = usePreferences(); const image = value && (/^[a-f0-9]{64}$/.test(value) || value.startsWith('/api/files/') || value.startsWith('blob:')); return <span className="avatar">{image ? <img src={fileUrl(value)} alt={t('Respondent profile')} /> : avatars.find(a => a.id === value)?.icon || '🚗'}</span>; }
export function Empty({ icon: Icon, title, text, children }: { icon: any; title: string; text: string; children?: React.ReactNode }) { return <div className="empty-state"><div className="empty-icon"><Icon size={28} /></div><h3>{title}</h3><p className="muted">{text}</p>{children}</div>; }
export function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
 const { t } = usePreferences();
 const ref = useRef<HTMLDivElement>(null);
 useEffect(() => { const old = document.activeElement as HTMLElement; ref.current?.focus(); const keyboard = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'Tab') { const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input,textarea,select,[tabindex="0"]') || []); if (!nodes.length) return; const first = nodes[0], last = nodes[nodes.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); } } }; document.addEventListener('keydown', keyboard); return () => { document.removeEventListener('keydown', keyboard); old?.focus(); }; }, []);
 return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} tabIndex={-1} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label={t('Close dialog')} onClick={onClose}><X size={20} /></button></div><div className="modal-body">{children}</div></div></div>;
}
