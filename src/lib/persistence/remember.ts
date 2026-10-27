import { useCallback, useState } from 'react';
import type { ClaudeDbLike } from './store';

const NS = 'shipping-optimizer:ui:';
const mem = new Map<string, unknown>();
let remote: ClaudeDbLike | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

const local = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

/**
 * Last-used UI state (form, sort order, filters, open tab). In the private artifact it lives in the artifact database
 * (`settings/ui`) so it follows you to other devices; everywhere else it falls back to this browser's localStorage.
 * It is never required: invalid or missing values fall back to the defaults.
 */
export async function attachRemoteSettings(db: ClaudeDbLike): Promise<void> {
  try {
    const snap = await db.collection('settings').doc('ui').get();
    const values = snap.exists ? ((snap.data() as { values?: Record<string, unknown> })?.values ?? {}) : {};
    for (const [k, v] of Object.entries(values)) mem.set(k, v);
    remote = db;
  } catch { remote = null; }
}

function flush() {
  if (!remote) return;
  const db = remote;
  const values = JSON.parse(JSON.stringify(Object.fromEntries(mem)));
  void db.collection('settings').doc('ui').set({ v: 1, values }).catch(() => undefined);
}

export function recall<T>(key: string, parse: (raw: unknown) => T | null): T | null {
  try {
    if (mem.has(key)) { const v = parse(mem.get(key)); if (v !== null) return v; }
    const raw = local()?.getItem(NS + key);
    return raw ? parse(JSON.parse(raw)) : null;
  } catch { return null; }
}
export function remember(key: string, value: unknown) {
  mem.set(key, value);
  try { local()?.setItem(NS + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  if (remote) { clearTimeout(timer); timer = setTimeout(flush, 500); }
}

export function useRemembered<T>(key: string, initial: () => T, parse: (raw: unknown) => T | null): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => recall(key, parse) ?? initial());
  const set = useCallback((n: T | ((p: T) => T)) => setV((p) => { const next = typeof n === 'function' ? (n as (p: T) => T)(p) : n; remember(key, next); return next; }), [key]);
  return [v, set];
}
