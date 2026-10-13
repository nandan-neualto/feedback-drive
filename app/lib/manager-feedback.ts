import type { FeedbackItem } from '../model';

type Filters = { category: string; status: string; area: string; search: string; visibility: string };
const normalize = (value: string) => value.normalize('NFKC').toLowerCase();

/** Shared by the manager list and CSV export so the downloaded rows match the view. */
export function selectManagerFeedback<T extends FeedbackItem>(items: T[], filters: Filters): T[] {
  const search = normalize(filters.search.trim());
  return items.filter(item =>
    (filters.category === 'all' || item.category === filters.category) &&
    (filters.status === 'all' || item.status === filters.status) &&
    (filters.area === 'all' || item.area === filters.area) &&
    (filters.visibility === 'all' || (filters.visibility === 'public' ? item.published && item.status !== 'hidden' : !item.published)) &&
    normalize([item.id, item.name, item.contact, item.title, item.message, item.suggestion, item.area, item.kioskId].filter(Boolean).join(' ')).includes(search)
  );
}
