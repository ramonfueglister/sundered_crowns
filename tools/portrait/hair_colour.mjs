// Reads the colour of the hair as it is drawn: photographs the portrait test page with England's sample
// (tests/portrait/sample_england.json) twice, as it is and with no colour left in the hair (set=sheen.colour:0), and
// takes as hair every pixel whose colour goes with it: the bundles, locks and plaits of a head and a full beard's
// locks, not the painted layer under them, not skin in the hair's shadow, not tightly curled hair (which the stage
// draws another way). Prints the CIELAB colour of that hair per person, whole and at the crown (the part of the
// picture above the forehead: from 0.107 to 0.339 of its height, the middle half of its breadth), and the mean over
// the people who have hair there. To hold the hair against a reference in numbers before a value is tuned by eye
// (docs/PORTRAITS.md, round 122).
//
//   npx vite --port 5199 &            (the game's dev server)
//   NODE_PATH=$(npm root -g) node tools/portrait/hair_colour.mjs http://localhost:5199 [query] [--size=WxH]
//
// `query` goes to the test page as it is: only=940006,940008 for these people alone, gene=27:240 for blond hair on
// everyone (27 the hair's lightness, 28 its red, 32 how early it greys), set=sheen.tone:1.3 to try a value of the
// stage profile. Hair that is white has no colour to lose and is not found: read grey heads by eye.
// Needs Playwright with its Chromium (not a dependency of the game).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const size = (args.find(a => a.startsWith('--size=')) ?? '--size=448x560').slice(7);
const [base, query] = args.filter(a => !a.startsWith('--'));
if (!base) throw new Error('usage: hair_colour.mjs <address of the dev server> [query for the test page] [--size=WxH]');

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
/** Every person's picture, as its pixels. `more`: further values of the stage profile for `set=`. */
async function pictures(more) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => console.error(String(e)));
  // one `set=` for the page: the query's own values first, then `more`
  const params = new URLSearchParams(query ?? '');
  const set = [params.get('set'), more].filter(Boolean).join(',');
  params.delete('set');
  const rest = params.toString();
  await page.goto(`${base}/portrait-test.html?sample=england&size=${size}${rest ? `&${decodeURIComponent(rest)}` : ''}${set ? `&set=${set}` : ''}`);
  await page.waitForFunction('window.portraitsDone || window.portraitError', null, { timeout: 900000 });
  const failed = await page.evaluate('window.portraitError');
  if (failed) throw new Error(failed);
  const out = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('canvas[id^=p]')].map(canvas => {
    const px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    let text = '';
    for (let i = 0; i < px.data.length; i += 32768) text += String.fromCharCode.apply(null, px.data.subarray(i, i + 32768));
    return [canvas.id.slice(1), { width: px.width, height: px.height, data: btoa(text) }];
  })));
  await page.close();
  for (const p of Object.values(out)) p.data = Buffer.from(p.data, 'base64');
  return out;
}
const drawn = await pictures('');
const grey = await pictures('sheen.colour:0');
await browser.close();

const lin = c => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
function lab(r, g, b) {
  const rgb = [lin(r), lin(g), lin(b)];
  const M = [[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]], white = [0.9505, 1, 1.089];
  const f = M.map((row, k) => { const t = (row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]) / white[k]; return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; });
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}
/** How far the colour (a*, b*) of a pixel has to move for it to be hair, and how many pixels make a head of hair. */
const MOVED = 2.5, ENOUGH = 300;
const pad = (v, n = 6) => v.toFixed(1).padStart(n);
/** L (mean, and its 10th, 50th and 90th percentile), chroma and hue of a list of [L, a, b]. */
function said(list) {
  if (list.length < ENOUGH / 3) return null;
  const L = list.map(p => p[0]).sort((x, y) => x - y), mean = k => list.reduce((s, p) => s + p[k], 0) / list.length;
  const at = q => L[Math.min(L.length - 1, Math.floor(q * L.length))];
  const chroma = list.reduce((s, p) => s + Math.hypot(p[1], p[2]), 0) / list.length;
  return { L: mean(0), chroma, text: `L ${pad(mean(0))} (${pad(at(0.1), 5)} ${pad(at(0.5), 5)} ${pad(at(0.9), 5)})  chroma ${pad(chroma)}  hue ${pad(Math.atan2(mean(2), mean(1)) * 180 / Math.PI)}` };
}
const sums = { whole: [0, 0, 0], crown: [0, 0, 0] };
console.log('the hair as drawn (CIELAB; L: mean and 10th, 50th, 90th percentile)');
for (const [pid, a] of Object.entries(drawn)) {
  const g = grey[pid], whole = [], crown = [];
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const i = 4 * (y * a.width + x);
    const p = lab(a.data[i], a.data[i + 1], a.data[i + 2]), q = lab(g.data[i], g.data[i + 1], g.data[i + 2]);
    if (Math.hypot(p[1] - q[1], p[2] - q[2]) <= MOVED) continue;
    whole.push(p);
    if (y >= 0.107 * a.height && y < 0.339 * a.height && x >= 0.254 * a.width && x < 0.746 * a.width) crown.push(p);
  }
  if (whole.length < ENOUGH) continue;
  const w = said(whole), c = said(crown);
  console.log(`  ${pid}  whole ${w.text}  |  crown ${c ? c.text : 'none'}`);
  for (const [k, v] of [['whole', w], ['crown', c]]) if (v) { sums[k][0] += v.L; sums[k][1] += v.chroma; sums[k][2]++; }
}
for (const k of ['whole', 'crown']) {
  const [L, chroma, n] = sums[k];
  if (n) console.log(`mean of ${n}, ${k}: L ${pad(L / n)}  chroma ${pad(chroma / n)}`);
}
