/** Display info for every language the app knows. Which ones a data profile offers is set in its config.json (`languages`). */
export const LANGUAGES: Record<string, { label: string; short: string; locale: string }> = {
  en: { label: 'English', short: 'EN', locale: 'en-GB' },
  sk: { label: 'Slovenčina', short: 'SK', locale: 'sk-SK' },
  de: { label: 'Deutsch', short: 'DE', locale: 'de-DE' },
};
/** Locale used by number formatting that has no React context (chart labels). Set by I18nProvider. */
let active = 'en-GB';
export const setActiveLocale = (lang: string) => { active = LANGUAGES[lang]?.locale ?? 'en-GB'; };
export const activeLocale = () => active;
export const localeOf = (lang: string) => LANGUAGES[lang]?.locale ?? 'en-GB';
