import Dexie, { type Table } from 'dexie';
import type { Plan } from '../data/schemas';

/** Where plans live. Two backends: IndexedDB in the browser (public demo) and the Claude artifact database (private build). */
export interface PlanStore {
  readonly kind: 'indexeddb' | 'claude-db';
  all(): Promise<Plan[]>;
  get(id: string): Promise<Plan | undefined>;
  put(plan: Plan): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

export class ShippingDb extends Dexie {
  plans!: Table<Plan, string>;
  constructor(name = 'shipping-optimizer') {
    super(name);
    this.version(1).stores({ plans: 'id, updatedAt' });
  }
}

export function dexieStore(db: ShippingDb): PlanStore {
  return {
    kind: 'indexeddb',
    all: () => db.plans.toArray(),
    get: (id) => db.plans.get(id),
    put: async (p) => { await db.plans.put(p); },
    remove: (id) => db.plans.delete(id),
    clear: () => db.plans.clear(),
  };
}

/** Minimal shape of the Claude artifact `db` capability that we use. */
export interface ClaudeDbLike {
  collection(path: string): { get(): Promise<{ docs: { id: string; data(): unknown }[] }> ; doc(id: string): ClaudeDocLike };
}
export interface ClaudeDocLike { get(): Promise<{ exists: boolean; data(): unknown }>; set(d: unknown): Promise<unknown>; delete(): Promise<unknown> }

/** Plans as one document each in the `plans` collection. Writes are serialised and JSON-cloned (the db rejects class instances / undefined). */
export function claudeStore(db: ClaudeDbLike, collection = 'plans'): PlanStore {
  const col = () => db.collection(collection);
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T,>(fn: () => Promise<T>): Promise<T> => { const run = chain.catch(() => undefined).then(fn); chain = run; return run; };
  const clone = (p: Plan) => JSON.parse(JSON.stringify(p));
  return {
    kind: 'claude-db',
    all: async () => (await col().get()).docs.map((d) => d.data() as Plan),
    get: async (id) => { const s = await col().doc(id).get(); return s.exists ? (s.data() as Plan) : undefined; },
    put: (p) => serial(async () => { await col().doc(p.id).set(clone(p)); }),
    remove: (id) => serial(async () => { await col().doc(id).delete(); }),
    clear: () => serial(async () => { for (const d of (await col().get()).docs) await col().doc(d.id).delete(); }),
  };
}

declare global { interface Window { claude?: { use(name: string): Promise<unknown> } } }

/**
 * Picks the backend. If the page runs as a Claude artifact with a granted `db`, plans go there (and are imported once from the
 * legacy IndexedDB when the database is still empty). Otherwise plain IndexedDB.
 */
export async function openStore(): Promise<PlanStore> {
  const local = dexieStore(new ShippingDb());
  try {
    const use = typeof window !== 'undefined' ? window.claude?.use : undefined;
    const db = use ? ((await window.claude!.use('db')) as ClaudeDbLike | null) : null;
    if (!db) return local;
    const remote = claudeStore(db);
    if ((await remote.all()).length === 0) {
      try { for (const p of await local.all()) await remote.put(p); } catch { /* no legacy data */ }
    }
    return remote;
  } catch { return local; }
}
