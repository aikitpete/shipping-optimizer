import { createContext, useContext } from 'react';
import type { Dataset } from '../lib/data/dataset';
import type { Plan } from '../lib/data/schemas';
import type { Prefs } from '../lib/persistence/prefs';

export interface AppCtx {
  ds: Dataset;
  snapshot: Record<string, string>;
  today: string;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  plans: Plan[];
  plan: Plan | null;
  /** Persist a changed plan (updates state and IndexedDB). */
  savePlan: (p: Plan) => Promise<void>;
  /** Autosave status of the last plan write. */
  saveStatus?: { status: 'idle' | 'saving' | 'saved' | 'error'; at: string | null };
  addPlan: (p: Plan, select?: boolean) => Promise<void>;
  removePlan: (id: string) => Promise<void>;
  reloadPlans: () => Promise<void>;
  resetAll: () => Promise<void>;
  selectPlan: (id: string) => void;
}
export const AppContext = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(AppContext);
