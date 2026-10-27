import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 1500 }, colorScheme: 'dark' });
await p.goto('http://localhost:5199/'); await p.waitForTimeout(1500);
await p.getByRole('link', { name: /compare/i }).first().click().catch(()=>{}); await p.waitForTimeout(800);
await p.getByRole('radio', { name: /^Documents/ }).click();
await p.getByRole('button', { name: '20 g', exact: true }).click(); await p.waitForTimeout(500);
console.log(await p.inputValue('input[aria-label="Weight"]'));
await p.screenshot({ path: '/tmp/out/cmp.png', fullPage: true }); await b.close();
