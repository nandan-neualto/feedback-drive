import type { FeedbackItem } from '../model';
import { normalizeFeedbackCategory } from './experience-centre.ts';

export type ManagerFeedbackFilters = { category: string; status: string; area: string; search: string; visibility: string; visitType?: string; visitZone?: string; replyState?: 'all' | 'replied' | 'unanswered' };
const normalize = (value: string) => value.normalize('NFKC').toLowerCase();

/** Shared by the manager list and CSV export so the downloaded rows match the view. */
export function selectManagerFeedback<T extends FeedbackItem>(items: T[], filters: ManagerFeedbackFilters): T[] {
  const search = normalize(filters.search.trim());
  return items.filter(item =>
    (filters.category === 'all' || normalizeFeedbackCategory(item.category) === normalizeFeedbackCategory(filters.category)) &&
    (filters.status === 'all' || item.status === filters.status) &&
    (filters.area === 'all' || item.area === filters.area) &&
    (filters.visibility === 'all' || (filters.visibility === 'public' ? item.published && item.consent !== false && item.status !== 'hidden' : !item.published || item.consent === false || item.status === 'hidden')) &&
    (!filters.visitType || filters.visitType === 'all' || item.visitType === filters.visitType) &&
    (!filters.visitZone || filters.visitZone === 'all' || item.visitZone === filters.visitZone) &&
    (!filters.replyState || filters.replyState === 'all' || (filters.replyState === 'replied' ? Boolean(item.teamReply?.trim()) : !item.teamReply?.trim())) &&
    normalize([item.id, item.name, item.contact, item.title, item.message, item.suggestion, normalizeFeedbackCategory(item.category), item.area, item.kioskId, item.visitType, item.visitZone, item.teamReply].filter(Boolean).join(' ')).includes(search)
  );
}
