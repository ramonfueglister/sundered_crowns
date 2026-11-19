// The writing over a still of the atlas probe (tools/atlas/probe.py): the realms' names along their curves as the game
// lays them out (names.ts), here with a light halo, and the towns as signs by their size with their names.
// Run: npx tsx tools/atlas/labels.ts <out>   (reads <out>.base.png and <out>.frame.json, writes <out>.png and <out>.towns.json;
// with ATLAS_3D=1 the towns' signs are left out: tools/atlas/land3d.mjs builds them)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { rgb } from '../../src/lookprobe/batch';
import { layoutNames, nameSvg } from '../../src/worldprobe/names';
import { realmNames } from '../../src/worldprobe/paint';
import { extentOf } from '../../src/worldprobe/extent';
import { projectionFrom, type Index } from '../../src/worldprobe/region';

interface Town {
  name: string;
  x: number;
  y: number;
  people: number;
  capital: boolean;
}
interface Frame {
  w: number;
  h: number;
  x0: number;
  y0: number;
  mpp: number;
  mx: number;
  my: number;
  mode: string;
  year: number;
  towns: Town[];
}
const out = process.argv[2],
  frame = JSON.parse(readFileSync(`${out}.frame.json`, 'utf8')) as Frame,
  W = 6144;
const raw = gunzipSync(readFileSync('public/map/ids.bin.gz')),
  ids = new Uint16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
const setup = JSON.parse(readFileSync(`public/data/setup_${frame.year}.json`, 'utf8')) as {
  states: { short: { de: string }; color: string }[];
  owner: (number | null)[];
};
const realms = {
  ids,
  w: W,
  h: ids.length / W,
  owner: setup.owner.map((o) => o ?? -1),
  colors: setup.states.map((s) => rgb(Number.parseInt(s.color.slice(1), 16))),
};
const index = JSON.parse(readFileSync('public/map/regions/world/index.json', 'utf8')) as Index,
  world = extentOf(projectionFrom(index, 1 / index.cells));
const names = realmNames(realms, 4, (k) => setup.states[k].short.de, world).map((n) => ({
  ...n,
  name: setup.states[n.realm].short.de,
}));
const laid = layoutNames(names, frame.w, frame.h, frame.mx, frame.my, 1 / frame.mpp, 1);

// towns: the larger the view, the fewer; a sign by size, the name beside it unless it would run into one already written
const least = 30000 * (frame.mpp / 1.17) ** 1.3,
  political = frame.mode === 'political';
const shown = frame.towns
  .filter((t) => t.people >= least || (t.capital && t.people >= least / 3))
  .sort((a, b) => b.people - a.people);
const boxes: [number, number, number, number][] = [];
// the realms' names keep their room: a box around each letter run, roughly
for (const n of laid) {
  const m = /M([\d.-]+) ([\d.-]+)Q([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)/.exec(n.d);
  if (m) {
    const [ax, ay, cx, cy, bx, by] = m.slice(1).map(Number);
    for (let k = 0; k <= 8; k++) {
      const t = 0.5 + ((k / 8 - 0.5) * n.length) / Math.max(1, Math.hypot(bx - ax, by - ay)),
        px = (1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t * t * bx,
        py = (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t * t * by;
      boxes.push([px - n.size * 0.6, py - n.size * 0.6, px + n.size * 0.6, py + n.size * 0.6]);
    }
  }
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
let signs = '',
  words = '';
const stood: Town[] = [];
for (const t of shown) {
  const big = t.people >= least * 4,
    mid = t.people >= least * 1.8,
    r = big ? 4.2 : mid ? 3.3 : 2.5,
    size = big ? 15 : mid ? 13 : 11.5;
  if (t.x < 4 || t.y < 4 || t.x > frame.w - 4 || t.y > frame.h - 4) continue;
  const sign = t.capital
    ? `<rect x="${t.x - r}" y="${t.y - r}" width="${2 * r}" height="${2 * r}" class="sign" transform="rotate(45 ${t.x} ${t.y})"/>`
    : `<circle cx="${t.x}" cy="${t.y}" r="${r}" class="sign"/>`;
  // a town on a realm's name, or one whose own name finds no room, is left out: a sign without a name says nothing
  if (boxes.some((b) => t.x > b[0] && t.x < b[2] && t.y > b[1] && t.y < b[3])) continue;
  const wide = t.name.length * size * 0.47,
    places: [number, number, string][] = [
      [t.x + r + 4, t.y + size * 0.32, 'start'],
      [t.x - r - 4, t.y + size * 0.32, 'end'],
      [t.x, t.y - r - 5, 'middle'],
      [t.x, t.y + r + size * 0.85, 'middle'],
    ];
  for (const [x, y, anchor] of places) {
    const x0 = anchor === 'start' ? x : anchor === 'end' ? x - wide : x - wide / 2,
      box: [number, number, number, number] = [x0 - 2, y - size * 0.8, x0 + wide + 2, y + size * 0.25];
    if (box[0] < 2 || box[2] > frame.w - 2 || box[1] < 2 || box[3] > frame.h - 2) continue;
    if (boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    boxes.push(box, [t.x - r - 2, t.y - r - 2, t.x + r + 2, t.y + r + 2]);
    if (process.env.ATLAS_3D !== '1') signs += sign;
    stood.push({ ...t, rank: big ? 2 : mid ? 1 : 0 } as Town);
    if (process.env.ATLAS_3D !== '1')
      words += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" text-anchor="${anchor}" class="town${big ? ' big' : ''}">${esc(t.name)}</text>`;
    break;
  }
}
const font = (wt: number) =>
  `@font-face{font-family:'EB Garamond';font-weight:${wt};src:url('file://${process.cwd()}/node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-${wt}-normal.woff2')}@font-face{font-family:'EB Garamond';font-weight:${wt};unicode-range:U+0100-024F;src:url('file://${process.cwd()}/node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-ext-${wt}-normal.woff2')}`;
const halo = political ? 'rgba(255,248,232,0.34)' : 'rgba(255,250,238,0.4)';
const html = `<!doctype html><meta charset="utf-8"><style>${font(500)}${font(600)}${font(700)}body{margin:0;background:#222}img,svg{position:absolute;left:0;top:0}
svg{font-family:'EB Garamond',serif}
.realm text{font-weight:600;fill:#2a2315;fill-opacity:${political ? 0.86 : 0.8};stroke:${halo};stroke-width:3px;stroke-linejoin:round;paint-order:stroke fill;letter-spacing:.02em}
.sign{fill:#f6f0e2;stroke:#2a2315;stroke-width:1.3px}
.town{font-weight:500;fill:#231d12;stroke:rgba(255,250,238,0.5);stroke-width:2.2px;stroke-linejoin:round;paint-order:stroke fill}
.town.big{font-weight:600}</style>
<img src="file://${out}.base.png" width="${frame.w}" height="${frame.h}">
<svg width="${frame.w}" height="${frame.h}"><g class="realm">${laid.map((n) => nameSvg(n, `n${n.realm}`)).join('')}</g>${signs}${words}</svg>`;
writeFileSync(`${out}.html`, html);
writeFileSync(`${out}.towns.json`, JSON.stringify(stood));
const req = createRequire(import.meta.url);
let playwright: typeof import('playwright');
try {
  playwright = req('playwright');
} catch {
  playwright = createRequire('/opt/node22/lib/node_modules/')('playwright');
}
const browser = await playwright.chromium.launch(),
  page = await browser.newPage({ viewport: { width: frame.w, height: frame.h } });
await page.goto(`file://${out}.html`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}.png` });
// for the landscape (land3d.mjs) the names alone, on nothing: they are laid over the woods there
if (process.env.ATLAS_3D === '1') {
  await page.evaluate(() => {
    document.body.style.background = 'transparent';
    document.querySelector('img')!.style.visibility = 'hidden';
  });
  await page.screenshot({ path: `${out}.names.png`, omitBackground: true });
}
await browser.close();
console.log(`${out}.png: ${laid.length} names of realms, ${shown.length} towns`);
