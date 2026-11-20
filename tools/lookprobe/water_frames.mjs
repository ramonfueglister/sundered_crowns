// Takes stills of the moving water from one place at several moments: the page is loaded once, then the water's
// clock (sea.ts, `__seaClock`) is set to each moment and the picture drawn anew. The first moment's picture is
// <out>.png, the k-th's <out>_<k>.png (the water gauntlet's motion rows read them; a row of them makes a moving
// picture). Usage: node tools/lookprobe/water_frames.mjs <out> "<address options>" <moments in seconds, e.g.
// 0,0.0333,0.5> — or <frames>x<seconds a frame>, e.g. 24x0.125. PROBE_URL and PROBE_PAGE as for shot.mjs (default:
// world-probe.html). Playwright comes from the machine.
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const [out, extra = '', when = '0'] = process.argv.slice(2);
const times = when.includes('x')
  ? Array.from({ length: Number(when.split('x')[0]) }, (_, k) => k * Number(when.split('x')[1]))
  : when.split(',').map(Number);
const url = `${process.env.PROBE_URL ?? 'http://localhost:5173'}/${process.env.PROBE_PAGE ?? 'world-probe.html'}?webgl=1&w=1672&h=941&${extra}`;
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForFunction(() => globalThis.__probe?.ready === true, null, { timeout: 300000 });
await page.waitForTimeout(500);
for (const [k, t] of times.entries()) {
  await page.evaluate((t) => {
    globalThis.__probe.ready = false;
    globalThis.__seaClock.value = t;
    dispatchEvent(new Event('resize'));
  }, t);
  await page.waitForFunction(() => globalThis.__probe?.ready === true, null, { timeout: 180000 });
  await page.screenshot({ path: k ? `${out}_${k}.png` : `${out}.png`, timeout: 180000 });
}
console.log(`${times.length} pictures`);
await browser.close();
