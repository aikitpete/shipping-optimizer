import { createContext, useContext, useMemo, type ReactNode } from 'react';
import en from './en.json';
import sk from './sk.json';
import de from './de.json';
import { setActiveLocale } from './languages';
import type { Msg } from '../lib/msg';
import type { Lang } from '../lib/persistence/prefs';

export const dictionaries: Record<string, Record<string, string>> = { en: { ...en }, sk: { ...sk }, de: { ...de } };

/** Merges a data profile's own texts (carrier notes, plan names, package labels) over the core UI strings. */
export function registerProfileTexts(texts: Record<string, Record<string, string>>) {
  for (const [lang, t] of Object.entries(texts)) Object.assign((dictionaries[lang] ??= {}), t);
}

export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const raw = dictionaries[lang]?.[key] ?? dictionaries.en[key] ?? key;
  return params ? raw.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`)) : raw;
}

interface I18n { lang: Lang; t: (key: string, params?: Record<string, string | number>) => string; tm: (m: Msg) => string }
const Ctx = createContext<I18n>({ lang: 'en', t: (k) => k, tm: (m) => m.key });

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  setActiveLocale(lang);
  const value = useMemo<I18n>(() => ({ lang, t: (k, p) => translate(lang, k, p), tm: (m) => translate(lang, m.key, m.params) }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
