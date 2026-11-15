// Holds the portraits of the game (three.js) against Apoleia's (Godot): photographs the portrait test page and
// compares each test person's picture with the one Apoleia's game rendered (tests/portrait/godot/<pid>.png,
// 336 x 420, written by Godot 4.7.2 from Apoleia at commit c30a107 with the same people).
//
//   npx vite --port 5199 &            (the game's dev server)
//   NODE_PATH=$(npm root -g) node tools/portrait/compare.mjs http://localhost:5199 out_dir
//
// Needs Playwright with its Chromium (not a dependency of the game). Writes per person the picture of the game, and
// a sheet with Apoleia's row above the game's; prints per person, over the pixels either picture covers, both laid
// on mid grey: the mean absolute difference of the colours (0..255), the difference of the mean colour (how far the
// overall tone is off), and the share of pixels covered by only one of the two (the outline).
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [base, out, query] = process.argv.slice(2);
if (!base || !out) throw new Error('usage: compare.mjs <address of the dev server> <folder for the pictures>');
const refs = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../tests/portrait/godot');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', e => console.error(String(e)));
await page.goto(`${base}/portrait-test.html?size=336x420${query ? `&${query}` : ''}`);
await page.waitForFunction('window.portraitsDone || window.portraitError', null, { timeout: 600000 });
const failed = await page.evaluate('window.portraitError');
if (failed) throw new Error(failed);

const reference = Object.fromEntries(readdirSync(refs).filter(n => n.endsWith('.png')).map(n => [n.slice(0, -4), `data:image/png;base64,${readFileSync(resolve(refs, n)).toString('base64')}`]));
const result = await page.evaluate(async reference => {
  const rows = [], W = 336, H = 420, ids = Object.keys(reference).sort();
  const sheet = document.createElement('canvas');
  sheet.width = W * ids.length; sheet.height = 2 * H;
  const sc = sheet.getContext('2d');
  sc.fillStyle = '#808080'; sc.fillRect(0, 0, sheet.width, sheet.height);
  const pictures = {};
  for (const [k, id] of ids.entries()) {
    const ours = document.getElementById(`p${id}`);
    const img = new Image(); img.src = reference[id]; await img.decode();
    const data = source => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(source, 0, 0, W, H);
      return x.getImageData(0, 0, W, H).data;
    };
    const a = data(img), b = data(ours);
    let n = 0, diff = 0, only = 0; const mean = [0, 0, 0];
    for (let i = 0; i < a.length; i += 4) {
      const aa = a[i + 3] / 255, ba = b[i + 3] / 255;
      if (aa < 0.02 && ba < 0.02) continue;
      n++;
      if ((aa > 0.5) !== (ba > 0.5)) only++;
      for (let c = 0; c < 3; c++) {
        const d = (b[i + c] * ba + 128 * (1 - ba)) - (a[i + c] * aa + 128 * (1 - aa));
        diff += Math.abs(d) / 3; mean[c] += d;
      }
    }
    rows.push({ id, diff: diff / n, tone: mean.map(m => m / n), outline: only / n });
    sc.drawImage(img, k * W, 0, W, H); sc.drawImage(ours, k * W, H);
    pictures[id] = ours.toDataURL('image/png');
  }
  return { rows, sheet: sheet.toDataURL('image/png'), pictures };
}, reference);
await browser.close();

const png = url => Buffer.from(url.split(',')[1], 'base64');
writeFileSync(resolve(out, 'sheet.png'), png(result.sheet));
for (const [id, url] of Object.entries(result.pictures)) writeFileSync(resolve(out, `${id}.png`), png(url));
const f = x => x.toFixed(1).padStart(6);
console.log('person   colour diff   tone r/g/b            outline');
for (const r of result.rows) console.log(`${r.id}  ${f(r.diff)}       ${r.tone.map(f).join(' ')}   ${(100 * r.outline).toFixed(1).padStart(5)} %`);
const avg = k => result.rows.reduce((s, r) => s + r[k], 0) / result.rows.length;
console.log(`mean     ${f(avg('diff'))}                              ${(100 * avg('outline')).toFixed(1).padStart(5)} %`);
