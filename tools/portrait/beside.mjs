// Sets faces of the sample beside faces of the reference at the same size, and reads a face's proportions in
// the picture. Round 107 (docs/PORTRAITS.md): numbers of colour and light had passed for thirty rounds while the
// faces read wrong at a glance, and one sheet of this kind showed why (narrow, long faces with small eyes beside
// broad ones with large eyes). A round looks at such a sheet first and measures after.
//
//   npx vite --port 5199 &            (the game's dev server)
//   NODE_PATH=$(npm root -g) node tools/portrait/beside.mjs http://localhost:5199 <folder> out.png [pairs] [query]
//
// `folder` holds the reference's pictures (screenshots of Crusader Kings III; they are not in the repository and
// must not be: the project's files have them under portraits/referenz_ck3). `-` in its place: no sheet, the
// numbers alone. `pairs` says which face of the reference stands over which person of England's sample
// (tests/portrait/sample_england.json), as A:940006,C:940004; without it the six pairs of round 107's first
// sheet. `query` goes to the test page as it is. Needs Playwright with its Chromium (not a dependency of the game).
//
// Every face is scaled so that the line of its eyes and its chin lie at the same heights of its cell, and its
// middle at the same place across. For ours the test page says where the landmarks lie in a picture (?at=, the
// places on the skin's image as in face_colour.mjs); for the reference's they were read by hand (REF). Printed
// per person, in lengths from the line of the eyes to the chin: the breadth at the cheekbones, the pupils'
// distance, an eye's length and its opening, the mouth's breadth, how far under the eyes the nose ends. The
// head is turned, so these are shares in the picture, to hold against the same shares of a turned face of the
// reference (about 1.5 at the cheekbones and 0.65 between the pupils on its large faces), not millimetres.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Faces of the reference: the picture, where the face's middle lies across, the line of its eyes and its chin
 *  (pixels, read by hand in round 107). A, C, J, K, N are women, the rest men. */
const REF = {
  A: ['ck3_06_gesichter_gross.png', 312, 205, 332],
  B: ['ck3_06_gesichter_gross.png', 966, 218, 336],
  C: ['ck3_06_gesichter_gross.png', 1680, 205, 338],
  E: ['ck3_06_gesichter_gross.png', 1456, 918, 1034],
  F: ['ck3_09_koepfe_maenner_frauen.png', 903, 104, 171],
  G: ['ck3_09_koepfe_maenner_frauen.png', 1850, 117, 181],
  H: ['ck3_09_koepfe_maenner_frauen.png', 1375, 718, 792],
  J: ['ck3_08_koepfe_huete.png', 1401, 110, 191],
  K: ['ck3_08_koepfe_huete.png', 722, 640, 758],
  L: ['ck3_08_koepfe_huete.png', 1253, 730, 850],
  N: ['ck3_10_portraet_gross_jung.png', 319, 244, 337],
};
const MARKS = {
  menton: [0.9630, 0.5168], subnasale: [0.8843, 0.5168], mouthL: [0.9062, 0.4977], mouthR: [0.9062, 0.5360],
  inL: [0.8396, 0.4961], outL: [0.8381, 0.4738], inR: [0.8396, 0.5376], outR: [0.8381, 0.5598],
  upL: [0.8345, 0.4846], loL: [0.8437, 0.4835], upR: [0.8345, 0.5491], loR: [0.8437, 0.5502],
  cheekL: [0.8447, 0.4050], cheekR: [0.8447, 0.6286],
};
/** A cell of the sheet, where the line of the eyes lies in it, and the eyes' line to the chin, in pixels. */
const CELL = { w: 320, h: 400, eye: [150, 163], chin: 110 };

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [base, folder, out, pairsArg, query] = process.argv.slice(2);
if (!base || !folder || !out) throw new Error('usage: beside.mjs <address of the dev server> <folder of the reference\'s pictures | -> out.png [A:940006,...] [query for the test page]');
const pairs = (pairsArg || 'A:940006,C:940004,J:940008,F:940005,G:940009,L:940021').split(',').map(t => t.split(':')).map(([face, pid]) => ({ face, pid: Number(pid) }));
for (const { face } of pairs) if (!REF[face]) throw new Error(`no face ${face} of the reference (${Object.keys(REF).join(', ')})`);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', e => console.error(String(e)));
const at = Object.values(MARKS).map(([u, v]) => `${u}:${v}`).join(',');
await page.goto(`${base}/portrait-test.html?sample=england&only=${[...new Set(pairs.map(p => p.pid))].join(',')}&size=448x560&at=${at}${query ? `&${query}` : ''}`);
await page.waitForFunction('window.portraitsDone || window.portraitError', null, { timeout: 900000 });
const failed = await page.evaluate('window.portraitError');
if (failed) throw new Error(failed);

const names = Object.keys(MARKS);
const marks = await page.evaluate(names => Object.fromEntries([...document.querySelectorAll('#wall canvas')].map(c =>
  [c.id.slice(1), Object.fromEntries(c.dataset.at.split(',').map((t, k) => [names[k], t.split(':').map(Number)]))])), names);
/** A face of ours: its middle across, the line of its eyes and its chin in its picture. */
const placed = pid => {
  const m = marks[pid];
  if (!m) throw new Error(`the sample has no person ${pid}`);
  const eye = [0, 1].map(k => (m.inL[k] + m.outL[k] + m.inR[k] + m.outR[k]) / 4);
  return { m, eye, chin: m.menton[1] };
};
const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
console.log('person   cheekbones  pupils  eye     opening  mouth   nose     (in lengths from the line of the eyes to the chin)');
for (const pid of [...new Set(pairs.map(p => p.pid))]) {
  const { m, eye, chin } = placed(pid);
  const len = chin - eye[1];
  const row = [far(m.cheekL, m.cheekR), far(mid(m.inL, m.outL), mid(m.inR, m.outR)), (far(m.inL, m.outL) + far(m.inR, m.outR)) / 2,
    (far(m.upL, m.loL) + far(m.upR, m.loR)) / 2, far(m.mouthL, m.mouthR), m.subnasale[1] - eye[1]].map(x => (x / len).toFixed(3));
  console.log(`${pid}   ${row[0]}       ${row[1]}   ${row[2]}   ${row[3]}    ${row[4]}   ${row[5]}`);
}

if (folder !== '-') {
  const files = Object.fromEntries([...new Set(pairs.map(p => REF[p.face][0]))].map(f =>
    [f, `data:image/${f.endsWith('.png') ? 'png' : 'jpeg'};base64,${readFileSync(join(folder, f)).toString('base64')}`]));
  const cells = pairs.map(({ face, pid }) => {
    const [file, x, eye, chin] = REF[face];
    const ours = placed(pid);
    return { file, ref: { x, eye, chin }, pid, ours: { x: ours.eye[0], eye: ours.eye[1], chin: ours.chin } };
  });
  const png = await page.evaluate(async ({ files, cells, CELL }) => {
    const pictures = {};
    for (const [name, url] of Object.entries(files)) {
      const image = new Image();
      image.src = url;
      await image.decode();
      pictures[name] = image;
    }
    const gap = 6, label = 22;
    const sheet = document.createElement('canvas');
    sheet.width = cells.length * (CELL.w + gap) + gap;
    sheet.height = 2 * (CELL.h + gap + label) + gap;
    const g = sheet.getContext('2d');
    g.fillStyle = '#121418';
    g.fillRect(0, 0, sheet.width, sheet.height);
    g.imageSmoothingQuality = 'high';
    const draw = (source, at, x, y) => {
      const scale = CELL.chin / (at.chin - at.eye);
      g.save();
      g.beginPath();
      g.rect(x, y, CELL.w, CELL.h);
      g.clip();
      g.fillStyle = '#282a2e';
      g.fillRect(x, y, CELL.w, CELL.h);
      g.drawImage(source, x + CELL.eye[0] - at.x * scale, y + CELL.eye[1] - at.eye * scale, source.width * scale, source.height * scale);
      g.restore();
    };
    g.font = '13px sans-serif';
    g.fillStyle = '#e6dcbe';
    g.fillText('the reference', 8, 15);
    g.fillText('ours', 8, CELL.h + gap + label + 15);
    cells.forEach((cell, k) => {
      const x = gap + k * (CELL.w + gap);
      draw(pictures[cell.file], cell.ref, x, label);
      draw(document.getElementById(`p${cell.pid}`), cell.ours, x, CELL.h + gap + 2 * label);
    });
    return sheet.toDataURL('image/png');
  }, { files, cells, CELL });
  writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
  console.log(`${out}: ${pairs.length} pairs`);
}
await browser.close();
