// Probes the reachability of fetchable sources and lists tariffs that still need manual verification.
// It never edits prices. Output: data/reverify-report.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundledDataset, PROFILE_DIR } from '../src/lib/data/nodeData';
import { reverify } from '../src/lib/validation/reverify';

const out = path.join(PROFILE_DIR, 'reverify-report.json');
const report = await reverify(bundledDataset, new Date().toISOString(), (u, i) => fetch(u, i));
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
const reach = report.probes.filter((p) => p.reachable).length;
console.log(`${reach}/${report.probes.length} sources reachable · ${report.manualQueue.length} tariffs need manual verification → data/reverify-report.json`);
