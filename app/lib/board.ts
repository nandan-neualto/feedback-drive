import type { FeedbackItem } from '../model';
import { normalizeFeedbackCategory } from './experience-centre.ts';

export type BoardSort = 'newest' | 'oldest' | 'rated';
export type BoardStatus = 'all' | 'new' | 'reviewed' | 'shortlisted' | 'adopted';
export type BoardFilters = { category: string; status?: BoardStatus; search: string; sort: BoardSort; photosOnly: boolean; savedOnly: boolean; saved: string[]; visitType?: string; visitZone?: string; replyState?: 'all' | 'replied' | 'unanswered' };
const normalize = (value: string) => value.normalize('NFKC').toLowerCase();
export function selectFeedback(items: FeedbackItem[], filters: BoardFilters): FeedbackItem[] {
  const words = normalize(filters.search.trim()).split(/\s+/).filter(Boolean);
  const saved = new Set(filters.saved);
  return items.filter(item => {
    if (!item.published || item.consent === false || item.status === 'hidden') return false;
    if (filters.status && filters.status !== 'all' && item.status !== filters.status) return false;
    if (filters.category !== 'All' && normalizeFeedbackCategory(item.category) !== normalizeFeedbackCategory(filters.category)) return false;
    if (filters.visitType && filters.visitType !== 'all' && item.visitType !== filters.visitType) return false;
    if (filters.visitZone && filters.visitZone !== 'all' && item.visitZone !== filters.visitZone) return false;
    if (filters.replyState === 'replied' && !item.teamReply?.trim()) return false;
    if (filters.replyState === 'unanswered' && item.teamReply?.trim()) return false;
    if (filters.photosOnly && !item.photos.length) return false;
    if (filters.savedOnly && !saved.has(item.id)) return false;
    // Search only public fields. Contact information and submission request IDs never enter the index.
    const haystack = normalize([item.id, item.message, item.title, item.suggestion, item.publicName || item.name, normalizeFeedbackCategory(item.category), item.area, item.visitType, item.visitZone, item.teamReply].filter(Boolean).join(' '));
    return words.every(word => haystack.includes(word));
  }).sort((a, b) => {
    const newest = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return filters.sort === 'oldest' ? -newest : filters.sort === 'rated' ? (b.rating ?? -1) - (a.rating ?? -1) || newest : newest;
  });
}

export function readSaved(value: string | null): string[] {
  try { const parsed: unknown = JSON.parse(value || '[]'); return Array.isArray(parsed) ? [...new Set(parsed.filter((item): item is string => typeof item === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(item)))].slice(0, 500) : []; }
  catch { return []; }
}
