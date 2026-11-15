// A still of the realms' map as the game paints it (src/worldprobe/paint.ts) with the realms' names as the game lays
// them out (names.ts), without the world below it: for checking the look against the reference.
// Run: npx tsx tools/map/preview.ts <out.png> <x0> <y0> <x1> <y1> <level> [setup.json]
// x0 … y1 are map pixels of the game map; level as in zoom.ts (its dots are 2^level / 4 map pixels).
// Writes <out>.rgba (the map alone), <out>.html (map and names) and, through the browser of Playwright, <out>.png.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { rgb } from '../../src/lookprobe/batch';
import { NAME_STYLE, layoutNames, nameSvg } from '../../src/worldprobe/names';
import { paintRealms, realmNames } from '../../src/worldprobe/paint';

const [out, sx0, sy0, sx1, sy1, slevel, setupPath = 'public/data/setup_1356.json'] = process.argv.slice(2);
const level = Number(slevel), CELLS = 4, TILE = 512, W = 6144;
const raw = gunzipSync(readFileSync('public/map/ids.bin.gz')), ids = new Uint16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)), H = ids.length / W;
const setup = JSON.parse(readFileSync(setupPath, 'utf8')) as { states: { short: { de: string }; color: string }[]; owner: (number | null)[] };
const realms = { ids, w: W, h: H, owner: setup.owner.map((o) => o ?? -1), colors: setup.states.map((s) => rgb(Number.parseInt(s.color.slice(1), 16))) };
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
const names = realmNames(realms, 4, (k) => [...setup.states[k].short.de].length).map((n) => ({ ...n, name: setup.states[n.realm].short.de }));
writeFileSync(out.replace(/\.png$/, '.names.json'), JSON.stringify({ x0: d0[0] * perDot, y0: d0[1] * perDot, perDot, w: pw, h: ph, names }));
console.log(`${tiles} tiles in ${Date.now() - t0} ms, ${pw}x${ph}`);

// the map as a PNG through a canvas of the browser, the names over it as in the game
const laid = layoutNames(names, pw, ph, d0[0] * perDot + (pw / 2) * perDot, d0[1] * perDot + (ph / 2) * perDot, 1 / perDot, 1);
const font = (wt: number) => `@font-face{font-family:'Crimson Pro';font-weight:${wt};src:url('file://${process.cwd()}/node_modules/@fontsource/crimson-pro/files/crimson-pro-latin-${wt}-normal.woff2')}@font-face{font-family:'Crimson Pro';font-weight:${wt};unicode-range:U+0100-024F;src:url('file://${process.cwd()}/node_modules/@fontsource/crimson-pro/files/crimson-pro-latin-ext-${wt}-normal.woff2')}`;
const html = `<!doctype html><meta charset="utf-8"><style>${font(500)}${font(600)}${font(700)}body{margin:0}canvas,svg{position:absolute;left:0;top:0}</style>
<canvas id="c" width="${pw}" height="${ph}"></canvas>
<svg width="${pw}" height="${ph}" style="font-family:${NAME_STYLE.font};font-weight:${NAME_STYLE.weight};fill:${NAME_STYLE.ink};opacity:${NAME_STYLE.opacity};paint-order:stroke;stroke:${NAME_STYLE.halo};stroke-width:2px">${laid.map((n) => nameSvg(n, `n${n.realm}`)).join('')}</svg>`;
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
await browser.close();
console.log(`${laid.length} names`);
