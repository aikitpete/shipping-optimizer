import type { RawData } from './dataset';

/** Everything one data profile provides: the raw tables, the price snapshot and its own texts (merged over the core UI strings). */
export interface ProfileData {
  raw: RawData;
  snapshot: Record<string, string>;
  i18n: Record<string, Record<string, string>>;
}

/** Files of a profile, relative to its folder. */
export interface Manifest {
  profile: string;
  files: {
    providers: string; services: string; routes: string; sources: string; transit: string; restrictions: string; rates: string;
    templates: string; config: string; snapshot: string; tariffFiles: string[];
    /** One text file per language, e.g. { en: 'i18n.en.json', de: 'i18n.de.json' }. */
    i18n: Record<string, string>;
  };
}

/** Reads a profile through any "get JSON by relative path" function (fetch in the browser, fs in Node). */
export async function loadProfile(read: (path: string) => Promise<unknown>): Promise<ProfileData> {
  const m = (await read('manifest.json')) as Manifest;
  const f = m.files;
  const [providers, services, routes, sources, transit, restrictions, rates, templates, config, snapshot] = await Promise.all(
    [f.providers, f.services, f.routes, f.sources, f.transit, f.restrictions, f.rates, f.templates, f.config, f.snapshot].map(read),
  );
  const i18n: Record<string, Record<string, string>> = {};
  for (const [lang, file] of Object.entries(f.i18n)) i18n[lang] = (await read(file)) as Record<string, string>;
  const tariffFiles = await Promise.all(f.tariffFiles.map(read));
  return {
    raw: { providers, services, routes, sources, transit, restrictions, rates, templates, config, tariffFiles },
    snapshot: snapshot as Record<string, string>,
    i18n,
  };
}

declare global { interface Window { __SHIPPING_DATA__?: ProfileData; SHIPPING_DATA_BASE?: string } }

/** Browser entry: private builds inline the profile as window.__SHIPPING_DATA__; the public demo fetches static JSON, so the data can be swapped by replacing files. */
export async function loadBrowserProfile(): Promise<ProfileData> {
  if (typeof window !== 'undefined' && window.__SHIPPING_DATA__) return window.__SHIPPING_DATA__;
  const base = (typeof window !== 'undefined' && window.SHIPPING_DATA_BASE) || 'data/demo/';
  return loadProfile(async (p) => {
    const r = await fetch(base + p);
    if (!r.ok) throw new Error(`Could not load ${base}${p} (${r.status})`);
    return r.json();
  });
}
