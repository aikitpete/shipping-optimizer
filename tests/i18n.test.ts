import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import sk from '../src/i18n/sk.json';
import de from '../src/i18n/de.json';
import { translate } from '../src/i18n';
import { bundledI18n, PROFILE_DIR } from '../src/lib/data/nodeData';
import { ds } from './helpers/fixtures';

const root = path.resolve(__dirname, '..');
const CORE: Record<string, Record<string, string>> = { en, sk, de };
const LANGS = ds.config.languages;
/** Core UI strings merged with the active profile's own texts, per language the profile offers. */
const DICT: Record<string, Record<string, string>> = Object.fromEntries(LANGS.map((l) => [l, { ...CORE[l], ...(bundledI18n[l] ?? {}) }]));
const EN = DICT.en;
function walk(dir: string, out: string[] = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out); else if (/\.(tsx?|json)$/.test(f.name) && !/i18n(\/|\.)(en|sk)(\.json)$/.test(p)) out.push(p);
  }
  return out;
}
const PREFIXES = ['app', 'nav', 'common', 'confirm', 'cat', 'budget', 'sender', 'delivery', 'battery', 'conf', 'fuel', 'vat', 'pick', 'status', 'money', 'form', 'ship', 'plan', 'default', 'tpl', 'assume', 'totals', 'seq', 'rec', 'transit', 'opt', 'cmp', 'quick', 'tar', 'tariff', 'conflict', 'price', 'reason', 'warn', 'health', 'issue', 'settings', 'access', 'limits', 'use'];

describe('i18n (core strings + active data profile)', () => {
  it('the core dictionaries (en, sk, de) have identical key sets', () => {
    expect(Object.keys(sk).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });
  it('every language the profile offers has the same keys as English', () => {
    for (const l of LANGS) expect(Object.keys(DICT[l]).sort(), l).toEqual(Object.keys(EN).sort());
  });
  it('no empty values, and placeholders match between languages', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const l of LANGS) for (const k of Object.keys(EN)) {
      expect(DICT[l][k].length, `${l} ${k}`).toBeGreaterThan(0);
      expect(ph(DICT[l][k]), `${l} ${k}`).toBe(ph(EN[k]));
    }
  });
  it('every language is really translated (differs from English for nearly all keys)', () => {
    for (const l of LANGS.filter((x) => x !== 'en')) {
      const same = Object.keys(EN).filter((k) => EN[k] === DICT[l][k]);
      expect(same.length, l).toBeLessThan(40);
    }
  });
  it('every country has a name in every offered language', () => {
    for (const c of ds.countries) for (const l of LANGS) expect(c.name[l], `${c.code} ${l}`).toBeTruthy();
  });
  it('every statically referenced key exists', () => {
    const missing = new Set<string>();
    const re = new RegExp(`['"\`]((?:${PREFIXES.join('|')})\\.[a-zA-Z0-9_.-]+)['"\`]`, 'g');
    for (const f of walk(path.join(root, 'src')).concat(walk(PROFILE_DIR).filter((x) => /(templates|config)\.json$/.test(x)))) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(re)) if (!(m[1] in EN) && !m[1].endsWith('.')) missing.add(`${path.relative(root, f)}: ${m[1]}`);
    }
    expect([...missing]).toEqual([]);
  });
  it('the profile provides texts for everything it declares', () => {
    const need: string[] = [];
    for (const g of ds.config.guide.groups) {
      need.push(`guide.group.${g.id}.title`, `guide.group.${g.id}.standard`, `guide.group.${g.id}.faster`, `guide.group.${g.id}.fastest`, `guide.group.${g.id}.note`);
      for (const p of g.presets) need.push(`guide.preset.${p.id}`);
    }
    for (const p of ds.templates.plans) need.push(p.nameKey);
    for (const s of ds.templates.shipments) need.push(s.nameKey);
    for (const s of ds.services) if (s.accessKey) need.push(s.accessKey);
    expect(need.filter((k) => !(k in EN))).toEqual([]);
  });
  it('dynamic key families are complete', () => {
    const fam: Record<string, string[]> = {
      cat: ['documents', 'original_documents', 'certified_copies', 'clothing', 'electronics', 'books', 'gifts', 'mixed_goods', 'other'],
      status: ['verified_published', 'verified_live', 'historical', 'research_estimate', 'unverified_lead', 'quote_required', 'not_available'],
      pick: ['cheapest', 'fastest', 'bestValue', 'bestDocuments', 'bestTrackedInsured'],
      nav: ['planner', 'compare', 'tariffs', 'health', 'settings'], battery: ['none', 'lithium_ion', 'lithium_metal'],
    };
    for (const [p, ks] of Object.entries(fam)) for (const k of ks) expect(`${p}.${k}` in EN, `${p}.${k}`).toBe(true);
  });
  it('interpolates parameters and falls back to English then to the key', () => {
    expect(translate('en', 'totals.incomplete', { missing: 2, n: 4 })).toBe('Incomplete: 2 of 4 shipments have no usable price.');
    expect(translate('sk', 'totals.incomplete', { missing: 2, n: 4 })).toContain('2 z 4');
    expect(translate('de', 'totals.incomplete', { missing: 2, n: 4 })).toContain('2 von 4');
    expect(translate('en', 'no.such.key')).toBe('no.such.key');
  });
});
