// Takes a picture of the look probe with headless Chromium (WebGL 2, software rendering) for comparison with the
// reference image. Usage: node tools/lookprobe/shot.mjs <out.png> [extra address options, e.g. "post=0&sky=0"]
// PROBE_PAGE picks another page on the same stage (world-probe.html). The dev server must be running (npm run dev). Playwright is not a dependency of the project; it is taken from the
// machine (global install, NODE_PATH).
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const out = process.argv[2] ?? 'look-probe.png', extra = process.argv[3] ? `&${process.argv[3]}` : '';
const url = `${process.env.PROBE_URL ?? 'http://localhost:5173'}/${process.env.PROBE_PAGE ?? 'look-probe.html'}?webgl=1&w=1672&h=941${extra}`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => globalThis.__probe?.ready === true, null, { timeout: 240000 });
await page.waitForTimeout(500);
console.log(JSON.stringify(await page.evaluate(() => globalThis.__probe)), `${Date.now() - t0} ms`);
await page.locator('canvas').screenshot({ path: out });
await browser.close();
