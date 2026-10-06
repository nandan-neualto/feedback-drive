'use client';

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { publicCatalog } from './locales/public';
import { composerCatalog } from './locales/composer';
import { managerCatalog } from './locales/manager';

export type Language = 'en' | 'kn' | 'hi' | 'ja';
export type Theme = 'light' | 'dark';
export type TranslationCatalog = Record<Exclude<Language, 'en'>, Record<string, string>>;
export const languages: { code: Language; label: string; locale: string }[] = [
  { code: 'en', label: 'English', locale: 'en-IN' },
  { code: 'kn', label: 'ಕನ್ನಡ', locale: 'kn-IN' },
  { code: 'hi', label: 'हिन्दी', locale: 'hi-IN' },
  { code: 'ja', label: '日本語', locale: 'ja-JP' },
];
const catalogs: TranslationCatalog = {
  kn: { ...publicCatalog.kn, ...composerCatalog.kn, ...managerCatalog.kn },
  hi: { ...publicCatalog.hi, ...composerCatalog.hi, ...managerCatalog.hi },
  ja: { ...publicCatalog.ja, ...composerCatalog.ja, ...managerCatalog.ja },
};
const preferenceKey = 'fd-preferences';
const preferenceEvent = 'feedback-preferences-updated';
let volatilePreferences: { language: Language; theme: Theme } | undefined;
const isLanguage = (value: unknown): value is Language => languages.some(language => language.code === value);
const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark';

function readPreferences() {
  if (volatilePreferences) return volatilePreferences;
  let saved: { language?: unknown; theme?: unknown } = {};
  try { saved = JSON.parse(localStorage.getItem(preferenceKey) || '{}') || {}; } catch { /* Storage can be unavailable on restricted devices. */ }
  const language = isLanguage(saved.language) ? saved.language : 'en';
  const theme = isTheme(saved.theme) ? saved.theme : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return { language, theme };
}
function snapshot() { const preferences = readPreferences(); return `${preferences.language}|${preferences.theme}`; }
function subscribe(listener: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  window.addEventListener(preferenceEvent, listener);
  window.addEventListener('storage', listener);
  media.addEventListener('change', listener);
  return () => { window.removeEventListener(preferenceEvent, listener); window.removeEventListener('storage', listener); media.removeEventListener('change', listener); };
}
function savePreference(patch: Partial<{ language: Language; theme: Theme }>) {
  const next = { ...readPreferences(), ...patch };
  try { localStorage.setItem(preferenceKey, JSON.stringify(next)); volatilePreferences = undefined; }
  catch { volatilePreferences = next; }
  window.dispatchEvent(new Event(preferenceEvent));
}

export function translate(language: Language, text: string, variables: Record<string, string | number> = {}) {
  const translated = language === 'en' ? text : catalogs[language][text] || text;
  return translated.replace(/\{(\w+)\}/g, (placeholder, key: string) => variables[key] === undefined ? placeholder : String(variables[key]));
}
type Preferences = {
  language: Language; theme: Theme;
  setLanguage: (language: Language) => void; setTheme: (theme: Theme) => void; toggleTheme: () => void;
  t: (text: string, variables?: Record<string, string | number>) => string;
  categoryLabel: (category: string) => string; statusLabel: (status: string) => string;
  formatDate: (value?: string) => string; number: (value: number, options?: Intl.NumberFormatOptions) => string;
};
const PreferencesContext = createContext<Preferences | null>(null);

export default function PreferencesProvider({ children }: { children: ReactNode }) {
  const value = useSyncExternalStore(subscribe, snapshot, () => 'en|light');
  const [language, theme] = value.split('|') as [Language, Theme];
  const locale = languages.find(item => item.code === language)!.locale;
  const t = (text: string, variables?: Record<string, string | number>) => translate(language, text, variables);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.documentElement.lang = language;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#faf9f6' : '#101214');
  }, [language, theme]);
  const preferences: Preferences = {
    language, theme, t,
    setLanguage: next => { if (isLanguage(next)) savePreference({ language: next }); },
    setTheme: next => { if (isTheme(next)) savePreference({ theme: next }); },
    toggleTheme: () => savePreference({ theme: theme === 'dark' ? 'light' : 'dark' }),
    categoryLabel: category => t(category),
    statusLabel: status => t(({ new: 'New', reviewed: 'In review', shortlisted: 'Shortlisted', adopted: 'Adopted', hidden: 'Archived', active: 'Open', draft: 'Draft', closed: 'Closed' } as Record<string, string>)[status] || status),
    formatDate: date => { if (!date) return ''; const parsed = new Date(date); return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(parsed); },
    number: (count, options) => new Intl.NumberFormat(locale, options).format(count),
  };
  return <PreferencesContext.Provider value={preferences}>{children}</PreferencesContext.Provider>;
}
export function usePreferences() {
  const preferences = useContext(PreferencesContext);
  if (!preferences) throw new Error('PreferencesProvider is required.');
  return preferences;
}
