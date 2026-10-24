import type { Dataset } from '../data/dataset';
import type { Plan } from '../data/schemas';
import { createDefaultPlan, newId } from '../plans/ops';
import { dexieStore, ShippingDb, type PlanStore } from './store';
import { migratePlan } from './migrate';
import { z } from 'zod';

export { ShippingDb } from './store';
export type { PlanStore } from './store';

let _store: PlanStore | null = null;
/** Current backend; defaults to IndexedDB until the app swaps in the one chosen at startup. */
export const getStore = (): PlanStore => (_store ??= dexieStore(new ShippingDb()));
export const setStore = (s: PlanStore | null) => { _store = s; };
export const getDb = getStore;
/** Accepts a PlanStore or (for tests) a raw Dexie database. */
const use = (x?: PlanStore | ShippingDb): PlanStore => (x == null ? getStore() : x instanceof ShippingDb ? dexieStore(x) : x);

export async function listPlans(s?: PlanStore | ShippingDb): Promise<Plan[]> {
  const rows = await use(s).all();
  return rows.map((r) => migratePlan(r)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export const getPlan = async (id: string, s?: PlanStore | ShippingDb) => {
  const r = await use(s).get(id);
  return r ? migratePlan(r) : undefined;
};
export const savePlan = async (plan: Plan, s?: PlanStore | ShippingDb) => { await use(s).put(plan); };
export const deletePlan = async (id: string, s?: PlanStore | ShippingDb) => { await use(s).remove(id); };

/** Seeds the default plan only when there are no plans at all (never overwrites user data). */
export async function ensureDefaultPlan(ds: Dataset, now: string, s?: PlanStore | ShippingDb): Promise<Plan[]> {
  const st = use(s);
  if ((await st.all()).length === 0) await st.put(createDefaultPlan(ds, now));
  return listPlans(st);
}

/** Deletes every plan and re-creates the default one. Callers must confirm with the user first. */
export async function resetToDefaults(ds: Dataset, now: string, s?: PlanStore | ShippingDb): Promise<Plan[]> {
  const st = use(s);
  await st.clear();
  await st.put(createDefaultPlan(ds, now));
  return listPlans(st);
}

const EXPORT_KIND = 'shipping-optimizer-plans';
export function exportPlans(plans: Plan[], now: string): string {
  return JSON.stringify({ kind: EXPORT_KIND, schemaVersion: 2, exportedAt: now, plans }, null, 2);
}

export interface ImportResult { imported: number; renamedIds: number; errors: string[] }
/** Import never overwrites: any id that already exists gets a fresh id. */
export async function importPlans(json: string, s?: PlanStore | ShippingDb): Promise<ImportResult> {
  const res: ImportResult = { imported: 0, renamedIds: 0, errors: [] };
  let data: unknown;
  try { data = JSON.parse(json); } catch { res.errors.push('invalid_json'); return res; }
  const parsed = z.object({ kind: z.literal(EXPORT_KIND), plans: z.array(z.unknown()) }).safeParse(data);
  if (!parsed.success) { res.errors.push('invalid_format'); return res; }
  const st = use(s);
  const existing = new Set((await st.all()).map((p) => p.id));
  for (const raw of parsed.data.plans) {
    try {
      const plan = migratePlan(raw);
      if (existing.has(plan.id)) { plan.id = newId('plan'); res.renamedIds += 1; }
      existing.add(plan.id);
      await st.put(plan);
      res.imported += 1;
    } catch (e) { res.errors.push(e instanceof Error ? e.message : String(e)); }
  }
  return res;
}
