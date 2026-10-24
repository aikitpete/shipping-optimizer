import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ShippingDb, claudeStore, dexieStore, openStore, type ClaudeDbLike, type PlanStore } from '../src/lib/persistence/store';
import { deletePlan, ensureDefaultPlan, exportPlans, importPlans, listPlans, resetToDefaults, savePlan } from '../src/lib/persistence/db';
import { createDefaultPlan, updateShipment } from '../src/lib/plans/ops';
import { ds } from './helpers/fixtures';

const NOW = '2026-10-13T10:00:00.000Z';

/** In-memory stand-in for the Claude artifact `db` capability. Rejects non-plain values like the real one. */
function fakeClaudeDb(): ClaudeDbLike & { rows: Map<string, unknown> } {
  const rows = new Map<string, unknown>();
  return {
    rows,
    collection: () => ({
      get: async () => ({ docs: [...rows.entries()].map(([id, v]) => ({ id, data: () => v })) }),
      doc: (id: string) => ({
        get: async () => ({ exists: rows.has(id), data: () => rows.get(id) }),
        set: async (d: unknown) => { JSON.stringify(d); rows.set(id, structuredClone(d)); },
        delete: async () => { rows.delete(id); },
      }),
    }),
  };
}

let n = 0;
const backends: [string, () => PlanStore][] = [
  ['IndexedDB (public demo)', () => dexieStore(new ShippingDb(`store-test-${++n}`))],
  ['Claude database (private build)', () => claudeStore(fakeClaudeDb())],
];

describe.each(backends)('plan storage on %s', (_name, make) => {
  let store: PlanStore;
  beforeEach(() => { store = make(); });
  it('seeds one default plan, saves, lists and deletes', async () => {
    const [p] = await ensureDefaultPlan(ds, NOW, store);
    expect((await ensureDefaultPlan(ds, NOW, store))).toHaveLength(1);
    await savePlan(updateShipment(p, 'ship-1', { weightKg: 0.7 }, NOW), store);
    expect((await listPlans(store))[0].shipments[0].weightKg).toBe(0.7);
    await deletePlan(p.id, store);
    expect(await listPlans(store)).toHaveLength(0);
  });
  it('resets to the default plan and round-trips an export', async () => {
    await ensureDefaultPlan(ds, NOW, store);
    const plans = await resetToDefaults(ds, NOW, store);
    const json = exportPlans(plans, NOW);
    const r = await importPlans(json, store);
    expect(r.imported).toBe(1); expect(r.renamedIds).toBe(1);
    expect(await listPlans(store)).toHaveLength(2);
  });
  it('keeps concurrent writes in order', async () => {
    const p = createDefaultPlan(ds, NOW);
    await Promise.all([1, 2, 3, 4, 5].map((w) => savePlan(updateShipment(p, 'ship-1', { weightKg: w / 10 }, NOW), store)));
    expect((await listPlans(store))).toHaveLength(1);
  });
});

describe('backend selection', () => {
  it('falls back to IndexedDB when there is no Claude database', async () => {
    (globalThis as any).window = { claude: { use: async () => null } };
    expect((await openStore()).kind).toBe('indexeddb');
    delete (globalThis as any).window;
  });
  it('uses the Claude database when granted, and imports legacy browser plans once', async () => {
    const db = fakeClaudeDb();
    const legacy = dexieStore(new ShippingDb('shipping-optimizer'));
    await legacy.put(createDefaultPlan(ds, NOW));
    (globalThis as any).window = { claude: { use: async (name: string) => (name === 'db' ? db : null) } };
    const s = await openStore();
    expect(s.kind).toBe('claude-db');
    expect(db.rows.size).toBe(1);
    await legacy.clear();
    expect((await openStore()).kind).toBe('claude-db');
    expect(db.rows.size).toBe(1);
    delete (globalThis as any).window;
  });
});
