// Builds the private artifact: one self-contained HTML file with data/private inlined as window.__SHIPPING_DATA__.
// Run `npm run build:claude`. Output: dist-private/index.html (publish it as a Claude artifact with the `db` capability).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadProfile } from '../src/lib/data/profile';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'data', 'private');
if (!fs.existsSync(path.join(dir, 'manifest.json'))) { console.error('data/private/manifest.json not found. Put your own profile there (same shape as data/demo).'); process.exit(1); }

execSync('npx vite build --outDir dist-private --emptyOutDir', { cwd: root, stdio: 'inherit' });
const out = path.join(root, 'dist-private');
fs.rmSync(path.join(out, 'data'), { recursive: true, force: true }); // the demo copy is not needed here

const profile = await loadProfile(async (p) => JSON.parse(fs.readFileSync(path.join(dir, p), 'utf8')));
const safe = JSON.stringify(profile).replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const read = (href: string) => fs.readFileSync(path.join(out, href.replace(/^\.\//, '')), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_m, h) => `<style>${read(h)}</style>`);
let js = '';
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_m, h) => { js = read(h); return ''; });
html = html.replace('</body>', () => `<script>window.__SHIPPING_DATA__=${safe};</script><script type="module">${js.replace(/<\/script/g, '<\\/script')}</script></body>`);
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
fs.writeFileSync(path.join(out, 'index.html'), html);
for (const f of fs.readdirSync(path.join(out, 'assets'), { withFileTypes: true })) fs.rmSync(path.join(out, 'assets', f.name), { recursive: true, force: true });
console.log(`dist-private/index.html written (${(html.length / 1024).toFixed(0)} kB, ${profile.raw.tariffFiles.length} tariff files inlined)`);
