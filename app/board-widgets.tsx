'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Bookmark, CheckCheck, ChevronLeft, ChevronRight, Download, Image as ImageIcon, MessageSquare, Share2, Sparkles, Star } from 'lucide-react';
import { type FeedbackItem, fileUrl } from './model';
import { usePreferences } from './i18n';
import { Avatar } from './ui';

export function EmptyArtwork() {
  return <div className="wall-art" aria-hidden="true"><div className="wall-orbit" /><div className="wall-note wall-note-back"><span /><span /><span /></div><div className="wall-note wall-note-front"><MessageSquare size={27} strokeWidth={1.5} /><div><span /><span /></div><span className="wall-art-check"><CheckCheck size={16} /></span></div><span className="wall-art-spark"><Sparkles size={21} /></span></div>;
}

export function FeedbackCard({ item, onPhoto, saved, onSave, onShare, onOpen, full = false }: {
  item: FeedbackItem; onPhoto: (item: FeedbackItem, index: number) => void; saved: boolean;
  onSave: (id: string) => void; onShare: (item: FeedbackItem) => void; onOpen?: (id: string) => void; full?: boolean;
}) {
  const { t, categoryLabel, statusLabel, formatDate, number } = usePreferences();
  const [expanded, setExpanded] = useState(false);
  const long = item.message.length > 320;
  const autoTitle = item.message.length > 80 ? `${item.message.slice(0, 77).trimEnd()}…` : item.message;
  const showTitle = item.title && item.title !== autoTitle && item.title !== item.message;
  return <article className={`feedback-card wall-card ${full ? 'wall-card-full' : ''}`}>
    <div className="feedback-card-top"><Avatar value={item.avatar} /><div className="grow"><strong>{!item.name || item.name === 'Anonymous' ? t('Anonymous') : item.publicName || item.name}</strong><time className="help-text block" dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></div><button className={`wall-save ${saved ? 'is-saved' : ''}`} aria-label={t(saved ? 'Unsave feedback' : 'Save feedback')} aria-pressed={saved} title={t(saved ? 'Unsave feedback' : 'Save feedback')} onClick={() => onSave(item.id)}><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /></button></div>
    <div className="feedback-card-body"><div className="feedback-card-meta"><span className="wall-category" data-category={item.category}>{categoryLabel(item.category)}</span>{item.rating && <span className="wall-rating" aria-label={t('{rating} out of 5 stars', { rating: number(item.rating) })}><Star size={12} fill="currentColor" />{number(item.rating)}/5</span>}</div>{showTitle && <h2 className="feedback-card-title">{item.title}</h2>}<p className="wall-message">{long && !expanded && !full ? `${item.message.slice(0, 320)}…` : item.message}</p>{long && !full && <button className="wall-read" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{t(expanded ? 'Read less' : 'Read more')}<ArrowUpRight size={13} /></button>}{item.suggestion && <div className="feedback-suggestion"><span className="detail-label"><Sparkles size={12} />{t('Suggested improvement')}</span><p>{item.suggestion}</p></div>}</div>
    {item.photos.length > 0 && <div className={`feedback-photo-grid wall-photos photos-${item.photos.length}`}>{item.photos.map((photo, index) => <button key={photo} className="feedback-image" aria-label={t('View feedback photo {number}', { number: number(index + 1) })} onClick={() => onPhoto(item, index)}><img src={fileUrl(photo)} loading="lazy" alt={t('Photo {number} shared with feedback', { number: number(index + 1) })} /><span className="wall-photo-expand"><ImageIcon size={15} /></span></button>)}</div>}
    <div className="wall-card-bottom"><span className={`wall-status status-${item.status}`}>{item.status === 'adopted' ? <CheckCheck size={13} /> : <span className="wall-status-dot" />}{t(item.status === 'new' ? 'Shared' : statusLabel(item.status))}</span><div className="wall-card-links">{onOpen && <button className="wall-link" onClick={() => onOpen(item.id)} aria-label={t('Open feedback')}><ArrowUpRight size={15} /></button>}<button className="wall-link" onClick={() => onShare(item)} aria-label={t('Copy feedback link')} title={t('Copy feedback link')}><Share2 size={15} /></button></div></div>
    {full && item.area && <div className="wall-location">{item.area}</div>}
  </article>;
}

export function PhotoGallery({ item, index, onIndex }: { item: FeedbackItem; index: number; onIndex: (index: number) => void }) {
  const { t, number } = usePreferences();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [index]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); onIndex(index - 1); }
      if (event.key === 'ArrowRight' && index < item.photos.length - 1) { event.preventDefault(); onIndex(index + 1); }
    };
    document.addEventListener('keydown', keyboard); return () => document.removeEventListener('keydown', keyboard);
  }, [index, item.photos.length, onIndex]);
  return <div className="wall-gallery"><div className="wall-gallery-stage">{failed ? <div className="wall-photo-unavailable"><ImageIcon size={30} /><p>{t('This photo is currently unavailable.')}</p></div> : <img key={item.photos[index]} src={fileUrl(item.photos[index])} alt={t('Photo {number} shared with feedback', { number: number(index + 1) })} onError={() => setFailed(true)} />}{item.photos.length > 1 && <><button className="wall-gallery-arrow previous" aria-label={t('Previous photo')} disabled={index === 0} onClick={() => onIndex(index - 1)}><ChevronLeft /></button><button className="wall-gallery-arrow next" aria-label={t('Next photo')} disabled={index === item.photos.length - 1} onClick={() => onIndex(index + 1)}><ChevronRight /></button></>}</div><div className="wall-gallery-footer"><span aria-live="polite">{t('Photo {current} of {total}', { current: number(index + 1), total: number(item.photos.length) })}</span><a className="button ghost small" href={fileUrl(item.photos[index])} download={`feedback-photo-${index + 1}`}><Download size={14} />{t('Download photo')}</a></div>{item.photos.length > 1 && <div className="wall-gallery-thumbs">{item.photos.map((photo, i) => <button className={i === index ? 'selected' : ''} aria-label={t('View feedback photo {number}', { number: number(i + 1) })} aria-pressed={i === index} key={photo} onClick={() => onIndex(i)}><img src={fileUrl(photo)} alt="" /></button>)}</div>}</div>;
}
