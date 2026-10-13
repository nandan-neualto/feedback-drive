/** Shared visitor vocabulary. Stored legacy categories remain valid for queued and older feedback. */
export const feedbackCategories = ['Exhibits', 'Guided tours', 'Interactive activities', 'Visitor support', 'Facilities & accessibility', 'Overall visit', 'Others'];
export const visitTypes = ['Individual visit', 'Family visit', 'School / college visit', 'Group visit'];
export const visitZones = ['General visit', 'Reception', 'Exhibits', 'Interactive area', 'Guided tour', 'Visitor facilities'];

export const legacyFeedbackCategories: Record<string, string> = {
  Design: 'Exhibits', Quality: 'Exhibits', Safety: 'Facilities & accessibility',
  Sport: 'Interactive activities', EV: 'Interactive activities', Infotainment: 'Interactive activities',
  Service: 'Visitor support',
};

export function normalizeFeedbackCategory(value?: string): string {
  const category = value?.trim() || 'Others';
  return feedbackCategories.includes(category) ? category : Object.hasOwn(legacyFeedbackCategories, category) ? legacyFeedbackCategories[category] : 'Others';
}

export function isFeedbackCategory(value: string): boolean {
  return feedbackCategories.includes(value) || Object.hasOwn(legacyFeedbackCategories, value);
}

/** Include aliases when filtering existing rows rather than rewriting visitor history. */
export function feedbackCategoryStorageValues(value: string): string[] {
  const category = normalizeFeedbackCategory(value);
  return [category, ...Object.keys(legacyFeedbackCategories).filter(key => legacyFeedbackCategories[key] === category)];
}
