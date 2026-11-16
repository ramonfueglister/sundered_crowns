// A still of the realms' map as the game paints it (src/worldprobe/paint.ts) with the realms' names as the game lays
// them out (names.ts), without the world below it: for checking the look against the reference.
// Run: npx tsx tools/map/preview.ts <out.png> <x0> <y0> <x1> <y1> <level> [setup.json]
// x0 … y1 are map pixels of the world frame (the game map, then round the globe to the east); level as in zoom.ts (its dots are 2^level / 4 map pixels).
// Writes <out>.rgba (the map alone), <out>.html (map and names) and, through the browser of Playwright, <out>.png.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { rgb } from '../../src/lookprobe/batch';
import { NAME_STYLE, layoutNames, nameSvg } from '../../src/worldprobe/names';
import { paintRealms, placeAt, realmNames } from '../../src/worldprobe/paint';
import { extentOf } from '../../src/worldprobe/extent';
import { projectionFrom, type Index } from '../../src/worldprobe/region';

const [out, sx0, sy0, sx1, sy1, slevel, setupPath = 'public/data/setup_1356.json'] = process.argv.slice(2);
const level = Number(slevel), CELLS = 4, TILE = 512, W = 6144;
const raw = gunzipSync(readFileSync('public/map/ids.bin.gz')), ids = new Uint16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)), H = ids.length / W;
const setup = JSON.parse(readFileSync(setupPath, 'utf8')) as { states: { short: { de: string }; color: string }[]; owner: (number | null)[] };
const geo = JSON.parse(readFileSync('public/data/geo.json', 'utf8')) as { beyond?: { w: number; h: number; cells: number; worldW: number; raster: string } }, by = geo.beyond;
const rraw = by ? gunzipSync(readFileSync(`public/${by.raster}`)) : undefined;
const rest = by && rraw ? { ids: new Uint16Array(rraw.buffer.slice(rraw.byteOffset, rraw.byteOffset + rraw.byteLength)), w: by.w, h: by.h, cells: by.cells } : undefined;
const realms = { ids, w: W, h: H, round: by?.worldW, rest, owner: setup.owner.map((o) => o ?? -1), colors: setup.states.map((s) => rgb(Number.parseInt(s.color.slice(1), 16))) };
const perDot = 2 ** level / CELLS, d0 = [Math.floor(Number(sx0) / perDot), Math.floor(Number(sy0) / perDot)], d1 = [Math.ceil(Number(sx1) / perDot), Math.ceil(Number(sy1) / perDot)];
const pw = d1[0] - d0[0], ph = d1[1] - d0[1], png = { data: new Uint8Array(pw * ph * 4) };
const toS = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
// what lies under the map where it is clear: a neutral grey
for (let i = 0; i < pw * ph; i++) { png.data[i * 4] = 90; png.data[i * 4 + 1] = 90; png.data[i * 4 + 2] = 90; png.data[i * 4 + 3] = 255; }
const t0 = Date.now();
let tiles = 0;
for (let ty = Math.floor(d0[1] / TILE); ty * TILE < d1[1]; ty++) for (let tx = Math.floor(d0[0] / TILE); tx * TILE < d1[0]; tx++) {
  const t = paintRealms(realms, level, tx, ty, TILE, CELLS); tiles++;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const px = tx * TILE + x - d0[0], py = ty * TILE + y - d0[1];
    if (px < 0 || py < 0 || px >= pw || py >= ph) continue;
    const i = (y * TILE + x) * 4, o = (py * pw + px) * 4, a = t[i + 3] / 255, under = 90 / 255;
    for (let c = 0; c < 3; c++) png.data[o + c] = Math.round(toS(t[i + c] / 255 + (1 - a) * (under ** 2.2)) * 255);
  }
}
// raw RGBA; tools/map/gauntlet.py turns it into a PNG
writeFileSync(out.replace(/\.png$/, '.rgba'), png.data);
// the names over what the world shows (data/content/world_extent.json), as the game lays them
const index = JSON.parse(readFileSync('public/map/regions/world/index.json', 'utf8')) as Index, frame = extentOf(projectionFrom(index, 1 / index.cells));
const names = realmNames(realms, 4, (k) => [...setup.states[k].short.de].length, frame).map((n) => ({ ...n, name: setup.states[n.realm].short.de }));
writeFileSync(out.replace(/\.png$/, '.names.json'), JSON.stringify({ x0: d0[0] * perDot, y0: d0[1] * perDot, perDot, w: pw, h: ph, names }));
console.log(`${tiles} tiles in ${Date.now() - t0} ms, ${pw}x${ph}`);

// the map as a PNG through a canvas of the browser, the names over it as in the game
const laid = layoutNames(names, pw, ph, d0[0] * perDot + (pw / 2) * perDot, d0[1] * perDot + (ph / 2) * perDot, 1 / perDot, 1);
const font = (wt: number) => `@font-face{font-family:'EB Garamond';font-weight:${wt};src:url('file://${process.cwd()}/node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-${wt}-normal.woff2')}@font-face{font-family:'EB Garamond';font-weight:${wt};unicode-range:U+0100-024F;src:url('file://${process.cwd()}/node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-ext-${wt}-normal.woff2')}`;
const html = `<!doctype html><meta charset="utf-8"><style>${font(500)}${font(600)}${font(700)}body{margin:0}canvas,svg{position:absolute;left:0;top:0}</style>
<canvas id="c" width="${pw}" height="${ph}"></canvas>
<svg width="${pw}" height="${ph}" style="font-family:${NAME_STYLE.font};font-weight:${NAME_STYLE.weight};fill:${NAME_STYLE.ink};opacity:${NAME_STYLE.opacity};stroke:${NAME_STYLE.halo}">${laid.map((n) => nameSvg(n, `n${n.realm}`)).join('')}</svg>`;
writeFileSync(out.replace(/\.png$/, '.html'), html);
// Playwright is the cloud's own (not a dependency of the game), found as tools/lookprobe/shot.mjs finds it
const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: pw, height: ph } });
await page.goto(`file://${out.replace(/\.png$/, '.html')}`);
const rgba = Buffer.from(png.data).toString('base64');
await page.evaluate(async (b64) => {
  const bytes = Uint8ClampedArray.from(atob(b64), (ch) => ch.charCodeAt(0)), c = document.getElementById('c') as HTMLCanvasElement;
  c.getContext('2d')!.putImageData(new ImageData(bytes, c.width, c.height), 0, 0);
  await document.fonts.ready;
}, rgba);
await page.screenshot({ path: out });
// how far the letters keep to their realms: each letter as the box of its advance along the curve, ±0.3 of the type size
// across it (mixed case about the curve's middle), sampled 5 × 3; a sample on land of another holder, land of none or
// water counts as outside
const glyphs = await page.evaluate(() => Array.from(document.querySelectorAll('text'), (t) => {
  const el = t as SVGTextContentElement, size = Number(t.getAttribute('font-size')), n = el.getNumberOfChars(), out: number[][] = [];
  for (let i = 0; i < n; i++) { const a = el.getStartPositionOfChar(i), b = el.getEndPositionOfChar(i); out.push([a.x, a.y, b.x, b.y]); }
  return { realm: Number((t.querySelector('textPath')?.getAttribute('href') ?? '#n-1').slice(2)), size, glyphs: out };
}));
await browser.close();
const ownerAt = (px: number, py: number) => { const at = placeAt(realms, Math.floor((d0[0] + px) * perDot), Math.floor((d0[1] + py) * perDot)); return at >= 0 && at < realms.owner.length ? realms.owner[at] : -2; };
let outside = 0, samples = 0, bad = 0;
const worst: [string, number][] = [];
for (const g of glyphs) {
  let o = 0, k = 0;
  for (const [ax, ay, bx, by] of g.glyphs) {
    const len = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / len, ny = (bx - ax) / len;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
      const t = (i + 0.5) / 5, off = (j - 1) * 0.3 * g.size, px = ax + (bx - ax) * t + nx * off, py = ay + (by - ay) * t + ny * off;
      k++; if (ownerAt(px, py) !== g.realm) o++;
    }
  }
  outside += o; samples += k;
  if (o / k > 0.05) { bad++; worst.push([setup.states[g.realm].short.de, Math.round((100 * o) / k)]); }
}
worst.sort((p, q) => q[1] - p[1]);
console.log(`${laid.length} names; letters outside their realm: ${((100 * outside) / Math.max(1, samples)).toFixed(1)} % of samples; names over 5 %: ${bad}; worst ${worst.slice(0, 12).map(([n, v]) => `${n} ${v}%`).join(', ')}`);
