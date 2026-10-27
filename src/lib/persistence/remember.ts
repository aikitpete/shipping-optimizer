import { useCallback, useState } from 'react';

const NS = 'shipping-optimizer:ui:';
const store = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

/** Per-viewer UI convenience: remembers the last used value in localStorage. Never required — falls back to `initial`. */
export function recall<T>(key: string, parse: (raw: unknown) => T | null): T | null {
  try { const raw = store()?.getItem(NS + key); return raw ? parse(JSON.parse(raw)) : null; } catch { return null; }
}
export function remember(key: string, value: unknown) {
  try { store()?.setItem(NS + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export function useRemembered<T>(key: string, initial: () => T, parse: (raw: unknown) => T | null): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => recall(key, parse) ?? initial());
  const set = useCallback((n: T | ((p: T) => T)) => setV((p) => { const next = typeof n === 'function' ? (n as (p: T) => T)(p) : n; remember(key, next); return next; }), [key]);
  return [v, set];
}
