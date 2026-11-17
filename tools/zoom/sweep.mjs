// Takes stills of the world probe along a zoom from near to far, each `ratio` times wider than the last, so that
// the change from picture to picture can be measured (tools/zoom/jumps.py): a zoom without ugly transitions changes
// evenly, a step of the map shows as a jump. The dev server must be running; playwright is taken from the machine.
// Usage: node tools/zoom/sweep.mjs <out dir> <from> <until> [ratio=1.08] [lon=2.35] [lat=48.85] [mode=terrain]
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const [out, from, until, ratio = '1.08', lon = '2.35', lat = '48.85', mode = 'terrain'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (let wide = Number(from); wide <= Number(until); wide *= Number(ratio)) {
  const w = Math.round(wide), page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${process.env.PROBE_URL ?? 'http://localhost:5173'}/world-probe.html?webgl=1&w=960&h=540&year=1291&mode=${mode}&lon=${lon}&lat=${lat}&wide=${w}`);
  await page.waitForFunction(() => globalThis.__probe?.ready === true, null, { timeout: 300000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/wide_${String(w).padStart(6, '0')}.png` });
  console.log(w);
  await page.close();
}
await browser.close();
