import type { RawData } from './dataset';

/** Everything one data profile provides: the raw tables, the price snapshot and its own texts (merged over the core UI strings). */
export interface ProfileData {
  raw: RawData;
  snapshot: Record<string, string>;
  i18n: { en: Record<string, string>; sk: Record<string, string> };
}

/** Files of a profile, relative to its folder. */
export interface Manifest {
  profile: string;
  files: {
    providers: string; services: string; routes: string; sources: string; transit: string; restrictions: string; rates: string;
    templates: string; config: string; snapshot: string; i18nEn: string; i18nSk: string; tariffFiles: string[];
  };
}

/** Reads a profile through any "get JSON by relative path" function (fetch in the browser, fs in Node). */
export async function loadProfile(read: (path: string) => Promise<unknown>): Promise<ProfileData> {
  const m = (await read('manifest.json')) as Manifest;
  const f = m.files;
  const [providers, services, routes, sources, transit, restrictions, rates, templates, config, snapshot, en, sk] = await Promise.all(
    [f.providers, f.services, f.routes, f.sources, f.transit, f.restrictions, f.rates, f.templates, f.config, f.snapshot, f.i18nEn, f.i18nSk].map(read),
  );
  const tariffFiles = await Promise.all(f.tariffFiles.map(read));
  return {
    raw: { providers, services, routes, sources, transit, restrictions, rates, templates, config, tariffFiles },
    snapshot: snapshot as Record<string, string>,
    i18n: { en: en as Record<string, string>, sk: sk as Record<string, string> },
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
