// Fetches ECB daily reference rates and refreshes the currencies already listed in the active profile's exchange-rates.json (SHIPPING_PROFILE, default demo).
import fs from 'node:fs';
import path from 'node:path';
import { PROFILE_DIR } from '../src/lib/data/nodeData';

const file = path.join(PROFILE_DIR, 'exchange-rates.json');
const URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

const res = await fetch(URL).catch((e) => { console.error('fetch failed:', e.message); return null; });
if (!res || !res.ok) { console.error('Could not fetch ECB rates. Existing file left unchanged.'); process.exit(1); }
const xml = await res.text();
const date = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
const pick = (c: string) => Number(new RegExp(`currency=['"]${c}['"]\\s+rate=['"]([\\d.]+)['"]`).exec(xml)?.[1]);
const rates: Record<string, number> = {};
const cur = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const c of Object.keys(cur.rates)) { const v = pick(c); if (v > 0) rates[c] = v; }
if (!date || !Object.keys(rates).length) { console.error('Unexpected ECB format. File left unchanged.'); process.exit(1); }
const next = { ...cur, rateDate: date, fetchedAt: new Date().toISOString().slice(0, 10), status: 'verified_published', rates, note: 'ECB daily reference rates (eurofxref-daily.xml). Native-currency amounts stay authoritative; EUR = native / rate.' };
fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
console.log(`rates updated for ${date}:`, rates);
