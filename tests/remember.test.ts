import { describe, expect, it } from 'vitest';
import { attachRemoteSettings, recall, remember } from '../src/lib/persistence/remember';

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };

describe('remembered UI state', () => {
  it('round-trips and rejects invalid stored values', () => {
    remember('k', { key: 'price', dir: 1 });
    expect(recall('k', (r) => r as { key: string })).toEqual({ key: 'price', dir: 1 });
    expect(recall('k', () => null)).toBeNull();
    expect(recall('missing', (r) => r)).toBeNull();
  });

  it('syncs through the artifact database so settings follow the user to another device', async () => {
    let stored: unknown = { v: 1, values: { 'tab': 'compare', 'compare.weight': 0.02 } };
    const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => stored }), set: async (d: unknown) => { stored = d; } }) }) };
    await attachRemoteSettings(db as never);
    expect(recall('tab', (r) => (typeof r === 'string' ? r : null))).toBe('compare');
    remember('tab', 'tariffs');
    await new Promise((r) => setTimeout(r, 700));
    expect((stored as { values: Record<string, unknown> }).values.tab).toBe('tariffs');
    expect((stored as { values: Record<string, unknown> }).values['compare.weight']).toBe(0.02);
  });
});
