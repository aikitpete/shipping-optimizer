import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDataset } from '../src/lib/data/dataset';
import { loadProfile, type Manifest } from '../src/lib/data/profile';
import { PROFILE_DIR } from '../src/lib/data/nodeData';
import { checkDataset, selfTest } from '../src/lib/validation/check';
import { ds, TODAY } from './helpers/fixtures';

const snapshot = JSON.parse(fs.readFileSync(path.join(PROFILE_DIR, 'tariff-snapshot.json'), 'utf8'));
const readFrom = (dir: string) => async (p: string) => JSON.parse(fs.readFileSync(path.join(dir, p), 'utf8'));

describe('data profile', () => {
  it('has no data errors and the checker detects the faults it claims to', () => {
    expect(checkDataset(ds, TODAY, snapshot).filter((i) => i.severity === 'error')).toEqual([]);
    expect(selfTest(ds, TODAY).filter((t) => !t.pass)).toEqual([]);
  });
  it('snapshot matches the tariffs (no unexpected price change)', () => {
    expect(checkDataset(ds, TODAY, snapshot).filter((i) => i.code === 'unexpected_change')).toEqual([]);
    expect(Object.keys(snapshot).length).toBe(ds.tariffs.length);
  });
  it('every file in the manifest exists', () => {
    const m = JSON.parse(fs.readFileSync(path.join(PROFILE_DIR, 'manifest.json'), 'utf8')) as Manifest;
    const files = Object.values(m.files).flatMap((v) => (typeof v === 'string' || Array.isArray(v) ? v : Object.values(v)));
    for (const f of files) expect(fs.existsSync(path.join(PROFILE_DIR, f)), f).toBe(true);
  });
  it('is swappable: a modified copy of the profile loads through the same loader', async () => {
    const read = readFrom(PROFILE_DIR);
    const swapped = await loadProfile(async (p) => {
      const j = (await read(p)) as any;
      if (p === 'config.json') return { ...j, title: 'My own data', demo: false };
      return j;
    });
    const d2 = buildDataset(swapped.raw);
    expect(d2.config.title).toBe('My own data');
    expect(d2.tariffs.length).toBe(ds.tariffs.length);
  });
  it('every country, route and service reference resolves', () => {
    const codes = new Set(ds.countries.map((c) => c.code));
    for (const r of ds.routes) { expect(codes.has(r.origin)).toBe(true); expect(codes.has(r.destination)).toBe(true); }
    for (const r of ds.config.requiredRoutes) expect(ds.routes.some((x) => x.id === r), r).toBe(true);
    for (const g of ds.config.guide.groups) for (const r of g.routes) expect(ds.routes.some((x) => x.id === r), r).toBe(true);
  });
});
