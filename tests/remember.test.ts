import { describe, expect, it } from 'vitest';
import { recall, remember } from '../src/lib/persistence/remember';

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };

describe('remembered UI state', () => {
  it('round-trips and rejects invalid stored values', () => {
    remember('k', { key: 'price', dir: 1 });
    expect(recall('k', (r) => r as { key: string })).toEqual({ key: 'price', dir: 1 });
    expect(recall('k', () => null)).toBeNull();
    expect(recall('missing', (r) => r)).toBeNull();
  });
});
