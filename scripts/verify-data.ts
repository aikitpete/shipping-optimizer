import fs from 'node:fs';
import path from 'node:path';
import { bundledDataset, PROFILE, PROFILE_DIR } from '../src/lib/data/nodeData';
import { buildSnapshot, checkDataset, checkTariffs, selfTest, summarize } from '../src/lib/validation/check';

const snapPath = path.join(PROFILE_DIR, 'tariff-snapshot.json');
const args = process.argv.slice(2);
const today = new Date().toISOString().slice(0, 10);
const ds = bundledDataset;
console.log(`profile: ${PROFILE}`);

if (args.includes('--update-snapshot')) {
  fs.writeFileSync(snapPath, JSON.stringify(buildSnapshot(ds), null, 2) + '\n');
  console.log(`snapshot updated (${ds.tariffs.length} tariffs)`);
  process.exit(0);
}

const snapshot = JSON.parse(fs.readFileSync(snapPath, 'utf8')) as Record<string, string>;
const issues = args.includes('--tariffs-only') ? checkTariffs(ds, today, snapshot) : checkDataset(ds, today, snapshot);
const verbose = args.includes('--verbose');
for (const i of issues) if (verbose || i.severity !== 'info') console.log(`${i.severity.toUpperCase().padEnd(7)} ${i.code.padEnd(28)} ${i.ref ?? ''}  ${i.message}`);
const st = selfTest(ds, today);
const failed = st.filter((t) => !t.pass);
for (const t of failed) console.log(`SELFTEST FAIL: ${t.name}`);
const sum = summarize(issues);
console.log(`\n${ds.tariffs.length} tariffs · ${sum.errors} errors · ${sum.warnings} warnings · ${sum.info} info (use --verbose to list) · self-tests ${st.length - failed.length}/${st.length}`);
process.exit(sum.errors > 0 || failed.length > 0 ? 1 : 0);
