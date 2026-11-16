// Reads the colours of the sample's faces at their landmarks: photographs the portrait test page with England's
// sample (tests/portrait/sample_england.json) and prints, per person and as means over the grown women and men,
// the CIELAB colour of forehead, cheeks, nose, lips and chin, and how the lips and the eyes stand against the skin
// beside them. To hold a face against a reference in numbers before a value is tuned by eye (docs/PORTRAITS.md).
//
//   npx vite --port 5199 &            (the game's dev server)
//   NODE_PATH=$(npm root -g) node tools/portrait/face_colour.mjs http://localhost:5199 [query] [--all] [--brow] [--size=WxH]
//
// `query` goes to the test page as it is (set=skin.colour:1.1 to try a value of the stage profile); --all prints
// every person, not the means alone. Needs Playwright with its Chromium (not a dependency of the game).
// --brow prints the brow instead: the lightness along a line from the upper lid over the pupil up to the forehead
// (in steps of 0.005 of the face's length, sellion to menton), and from it how far above the lid the brow lies,
// how much darker than the forehead it is, how broad at half that darkness, and the lightest place between lid
// and brow. A soft picture reads broader and paler: hold a face against a reference at the reference's size
// (--size=224x280 gives a face of about 88 pixels; the default is 448x560).
//
// The landmarks are places on the skin's image, the same for everyone (written by
// `cargo run --release --example face_measure -- England Gallia 36 ../public/portrait --marks` in portrait/); the
// test page says where each lies in a picture (?at=). Left and right are the head's own.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MARKS = [
  ["sellion", 0.8350, 0.5168],
  ["subnasale", 0.8843, 0.5168],
  ["pronasale", 0.8732, 0.5168],
  ["menton", 0.9630, 0.5168],
  ["upper lip's edge", 0.9031, 0.5168],
  ["lower lip's edge", 0.9150, 0.5168],
  ["lips' top, inside", 0.8961, 0.5168],
  ["lips' top, outside", 0.8978, 0.5168],
  ["lips' foot, inside", 0.9214, 0.5168],
  ["lips' foot, outside", 0.9242, 0.5168],
  ["mouth's corner, left", 0.9062, 0.4977],
  ["mouth's corner, right", 0.9062, 0.5360],
  ["eye's inner corner, left", 0.8396, 0.4961],
  ["eye's outer corner, left", 0.8381, 0.4738],
  ["eye's inner corner, right", 0.8396, 0.5376],
  ["eye's outer corner, right", 0.8381, 0.5598],
  ["upper lid, left", 0.8345, 0.4846],
  ["lower lid, left", 0.8437, 0.4835],
  ["upper lid, right", 0.8345, 0.5491],
  ["lower lid, right", 0.8437, 0.5502],
  ["nose's wing, left", 0.8765, 0.4985],
  ["nose's wing, right", 0.8765, 0.5352],
  ["cheekbone, left", 0.8447, 0.4050],
  ["cheekbone, right", 0.8447, 0.6286],
];

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const all = args.includes('--all'), brow = args.includes('--brow');
const size = args.find(a => a.startsWith('--size='))?.slice(7) ?? '448x560';
const [base, query] = args.filter(a => !a.startsWith('--'));
if (!base) throw new Error('usage: face_colour.mjs <address of the dev server> [query for the test page] [--all] [--brow] [--size=WxH]');
// the steps of the line over the lid, in lengths of the face
const STEPS = Array.from({ length: 81 }, (_, k) => (k - 20) * 0.005);
const sample = JSON.parse(readFileSync(fileURLToPath(new URL('../../tests/portrait/sample_england.json', import.meta.url)), 'utf8'));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', e => console.error(String(e)));
const at = MARKS.map(([, u, v]) => `${u}:${v}`).join(',');
await page.goto(`${base}/portrait-test.html?sample=england&size=${size}&at=${at}${query ? `&${query}` : ''}`);
await page.waitForFunction('window.portraitsDone || window.portraitError', null, { timeout: 600000 });
const failed = await page.evaluate('window.portraitError');
if (failed) throw new Error(failed);

// per person: the mean colour (linear light) of a disc round each place measured, laid on black where the picture
// is clear (a place beside the face then reads dark, and is seen as such)
const read = await page.evaluate(([names, STEPS]) => {
  const out = {};
  for (const canvas of document.querySelectorAll('canvas[id^=p]')) {
    const m = Object.fromEntries(canvas.dataset.at.split(',').map((t, k) => [names[k], t.split(':').map(Number)]));
    const mid = (a, b, t = 0.5) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const mean = (...p) => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
    const face = Math.hypot(m.sellion[0] - m.menton[0], m.sellion[1] - m.menton[1]);
    const side = s => ({
      [`cheek, ${s}`]: mean(m[`eye's outer corner, ${s}`], m[`mouth's corner, ${s}`], m[`nose's wing, ${s}`]),
      [`under the eye, ${s}`]: mid(m[`upper lid, ${s}`], m[`lower lid, ${s}`], 2.2),
      [`eye, ${s}`]: mid(m[`upper lid, ${s}`], m[`lower lid, ${s}`]),
    });
    const places = {
      forehead: mid(m.subnasale, m.sellion, 1.45),
      'nose\'s back': mid(m.sellion, m.pronasale, 0.6),
      'above the lip': mid(m.subnasale, m['lips\' top, outside'], 0.6),
      'upper lip': mid(m['lips\' top, inside'], m['upper lip\'s edge'], 0.55),
      'lower lip': mid(m['lower lip\'s edge'], m['lips\' foot, inside'], 0.5),
      chin: mid(m['lips\' foot, outside'], m.menton, 0.55),
      ...side('left'), ...side('right'),
    };
    const px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    const lin = c => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
    const colour = ([cx, cy], r) => {
      const sum = [0, 0, 0]; let n = 0;
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r || x < 0 || y < 0 || x >= px.width || y >= px.height) continue;
        const i = 4 * (y * px.width + x), a = px.data[i + 3] / 255;
        for (let c = 0; c < 3; c++) sum[c] += lin(px.data[i + c]) * a;
        n++;
      }
      return sum.map(s => s / Math.max(1, n));
    };
    const lipsHeight = Math.hypot(m['lips\' top, outside'][0] - m['lips\' foot, outside'][0], m['lips\' top, outside'][1] - m['lips\' foot, outside'][1]);
    // the line over each eye: from the upper lid over the pupil along the face's own upright (menton to sellion)
    const up = [(m.sellion[0] - m.menton[0]) / face, (m.sellion[1] - m.menton[1]) / face];
    const line = s => STEPS.map(d => colour([m[`upper lid, ${s}`][0] + up[0] * d * face, m[`upper lid, ${s}`][1] + up[1] * d * face], Math.max(1, 0.008 * face)));
    out[canvas.id.slice(1)] = {
      face,
      lines: { left: line('left'), right: line('right') },
      colours: Object.fromEntries(Object.entries(places).map(([k, p]) => [k, colour(p, k.includes('lip') && !k.startsWith('above') ? Math.max(1.5, 0.12 * lipsHeight) : 0.022 * face)])),
    };
  }
  return out;
}, [MARKS.map(m => m[0]), STEPS]);
await browser.close();

function lab(rgb) {
  const M = [[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]], white = [0.9505, 1, 1.089];
  const f = M.map((row, k) => { const t = (row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]) / white[k]; return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; });
  return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
}

/** What is printed of a face: L a b of the places, and what stands against what. The lit cheek is the lighter one. */
function row(person) {
  const c = Object.fromEntries(Object.entries(person.colours).map(([k, rgb]) => [k, lab(rgb)]));
  const [lit, shaded] = c['cheek, left'][0] >= c['cheek, right'][0] ? ['left', 'right'] : ['right', 'left'];
  const cheek = c[`cheek, ${lit}`], hue = v => Math.atan2(v[2], v[1]) * 180 / Math.PI, chroma = v => Math.hypot(v[1], v[2]);
  return {
    'lit cheek L': cheek[0], 'lit cheek a*': cheek[1], 'lit cheek b*': cheek[2], 'lit cheek chroma': chroma(cheek), 'lit cheek hue': hue(cheek),
    'shaded cheek L': c[`cheek, ${shaded}`][0], 'shaded cheek a*': c[`cheek, ${shaded}`][1], 'shaded cheek b*': c[`cheek, ${shaded}`][2],
    'forehead L': c.forehead[0], 'forehead a*': c.forehead[1], 'forehead b*': c.forehead[2],
    'cheek redder than forehead (a*)': cheek[1] - c.forehead[1],
    'nose\'s back L': c['nose\'s back'][0], 'nose\'s back a*': c['nose\'s back'][1],
    'chin L': c.chin[0], 'chin a*': c.chin[1],
    'lower lip L': c['lower lip'][0], 'lower lip a*': c['lower lip'][1], 'lower lip b*': c['lower lip'][2],
    'lower lip darker than cheek (L)': cheek[0] - c['lower lip'][0], 'lower lip redder than cheek (a*)': c['lower lip'][1] - cheek[1],
    'lower lip yellower than cheek (b*)': c['lower lip'][2] - cheek[2],
    'upper lip L': c['upper lip'][0], 'upper lip a*': c['upper lip'][1], 'upper lip b*': c['upper lip'][2],
    'above the lip L': c['above the lip'][0],
    'eye darker than cheek (L)': cheek[0] - c[`eye, ${lit}`][0],
    'under the eye darker than cheek (L)': cheek[0] - c[`under the eye, ${lit}`][0],
  };
}

/** What is printed of a brow (--brow), read on the side of the lit cheek: how far above the upper lid its darkest
 *  place lies (in lengths of the face), how much darker than the forehead that is (L), how broad the brow is at
 *  half that darkness, and the lightest place between lid and brow against the forehead. */
function browRow(person) {
  const L = rgb => lab(rgb)[0], c = person.colours;
  const lit = L(c['cheek, left']) >= L(c['cheek, right']) ? 'left' : 'right';
  const line = person.lines[lit].map(rgb => L(rgb) - L(c.forehead));
  const within = STEPS.map((d, k) => k).filter(k => STEPS[k] >= 0.04 && STEPS[k] <= 0.26);
  const dark = within.reduce((a, k) => line[k] < line[a] ? k : a);
  let under = dark, over = dark;
  for (let k = dark; k >= 0 && STEPS[k] >= 0; k--) if (line[k] > line[under]) under = k;
  for (let k = dark; k < STEPS.length; k++) if (line[k] > line[over]) over = k;
  const half = (line[dark] + Math.min(line[under], line[over])) / 2;
  let a = dark, b = dark;
  while (a > 0 && line[a - 1] < half) a--;
  while (b < STEPS.length - 1 && line[b + 1] < half) b++;
  return {
    'face, pixels': person.face,
    'brow above the upper lid (faces)': STEPS[dark], 'brow darker than forehead (L)': -line[dark],
    'brow broad at half its darkness (faces)': STEPS[b] - STEPS[a] + 0.005,
    'lightest between lid and brow, against the forehead (L)': line[under],
  };
}

const rows = sample.filter(p => read[p.pid]).map(p => ({ p, r: brow ? browRow(read[p.pid]) : row(read[p.pid]) }));
const keys = Object.keys(rows[0].r);
const show = (name, list) => {
  if (!list.length) return;
  const cell = k => (list.reduce((s, x) => s + x.r[k], 0) / list.length).toFixed(k.includes('(faces)') ? 3 : 1).padStart(7);
  console.log(`\n${name} (${list.length})`);
  for (const k of keys) console.log(`  ${k.padEnd(brow ? 56 : 38)}${cell(k)}`);
};
if (all) for (const x of rows) show(`${x.p.pid}, ${x.p.female ? 'woman' : 'man'} of ${x.p.age}`, [x]);
show('grown women (20 and older)', rows.filter(x => x.p.female && x.p.age >= 20));
show('grown men (20 and older; a beard lies over lips and chin)', rows.filter(x => !x.p.female && x.p.age >= 20));
show('girls of 8 to 17', rows.filter(x => x.p.female && x.p.age >= 8 && x.p.age < 20));
show('boys of 8 to 17', rows.filter(x => !x.p.female && x.p.age >= 8 && x.p.age < 20));
