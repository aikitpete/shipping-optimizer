import { buildDataset, type Dataset } from './lib/data/dataset';
import { loadBrowserProfile } from './lib/data/profile';
import { registerProfileTexts } from './i18n';
import { claudeDb, openStore, type PlanStore } from './lib/persistence/store';
import { attachRemoteSettings } from './lib/persistence/remember';
import { setStore } from './lib/persistence/db';

export interface Boot { ds: Dataset; snapshot: Record<string, string>; store: PlanStore }

/** Loads the active data profile (inlined private build or fetched demo JSON) and the matching plan storage backend. */
export async function boot(): Promise<Boot> {
  const [profile, store] = await Promise.all([loadBrowserProfile(), openStore()]);
  registerProfileTexts(profile.i18n);
  setStore(store);
  if (store.kind === 'claude-db') { const db = await claudeDb(); if (db) await attachRemoteSettings(db); }
  return { ds: buildDataset(profile.raw), snapshot: profile.snapshot, store };
}
