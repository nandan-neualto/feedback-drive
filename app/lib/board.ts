import type { FeedbackItem } from '../model';

export type BoardSort = 'newest' | 'oldest' | 'rated';
export type BoardFilters = { category: string; search: string; sort: BoardSort; photosOnly: boolean; savedOnly: boolean; saved: string[] };
const normalize = (value: string) => value.normalize('NFKC').toLowerCase();
export function selectFeedback(items: FeedbackItem[], filters: BoardFilters): FeedbackItem[] {
  const words = normalize(filters.search.trim()).split(/\s+/).filter(Boolean);
  const saved = new Set(filters.saved);
  return items.filter(item => {
    if (!item.published || item.status === 'hidden') return false;
    if (filters.category !== 'All' && item.category !== filters.category) return false;
    if (filters.photosOnly && !item.photos.length) return false;
    if (filters.savedOnly && !saved.has(item.id)) return false;
    // Search only public fields. Contact information and request IDs never enter the index.
    const haystack = normalize([item.message, item.title, item.suggestion, item.publicName || item.name, item.area].filter(Boolean).join(' '));
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
