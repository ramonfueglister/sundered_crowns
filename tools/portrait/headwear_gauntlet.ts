// The gauntlet of the headwear (docs/PORTRAITS.md "Headwear"): puts every piece of portrait/src/dress.rs `HEADWEAR`
// on every person of England's sample (tests/portrait/sample_england.json: women and men of 2 to 68) and holds
// what is built against the same lines, round after round, PASS or FAIL, as tools/portrait/gauntlet.mjs does for
// the faces. It reads the triangles, not pictures: no dev server, no graphics card.
//
//   PATH=/opt/homebrew/opt/rustup/bin:$PATH npm run -s portrait:build    (the builder in the repository)
//   npx tsx tools/portrait/headwear_gauntlet.ts [--strict] [--only=hat_felt] [--verbose]
//
// How it looks: from a point in the middle of each head, in 72 x 24 directions (5 degrees round, from 30 below
// the horizon to straight up), the farthest point of the skin, of the hair and of the piece. Where the piece is
// seen in a direction, nothing of the skin (and of the hair, under a piece that keeps it) may lie farther out
// than the piece: that is where it pokes through. And the piece may not float: above the horizon, the narrowest
// tenth of its gaps to what is under it (where it rests: a hat on its band, a helm on the crown) is within so many
// units (10 cm).
//
// The limits are by judgement, PLACEHOLDER: a poke-through of one direction in two hundred is a strand or the tip
// of an ear, which the eye hardly finds at the panel's size; a gap of 1.5 cm over a soft piece's hair, of 4 cm
// inside a helm (padding and the arming cap) reads as worn, not as floating.
//
// What it does not hold: whether a piece looks good, its history, its colours, and the pictures (light, metal).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORTRAIT_PUBLIC } from './build_portrait';
import { loadPortraitBuilder } from './load';
import { surfaceKind } from '../../src/portrait/materials';
import type { Portrait, PortraitPerson, PortraitSurface } from '../../src/portrait/wire';

interface Piece { key: string; files: string[]; rigid: boolean; hair: boolean }
/** As dress.rs `HEADWEAR` (the gauntlet would see a piece that is missing: its first file would not be built). */
const PIECES: Piece[] = [
  { key: 'helm_great', files: ['metal_helm_great'], rigid: true, hair: false },
  { key: 'bascinet', files: ['metal_bascinet', 'metal_mail_aventail'], rigid: true, hair: false },
  { key: 'mail_coif', files: ['metal_mail_coif', 'metal_mail_coif_skirt'], rigid: false, hair: false },
  { key: 'crown', files: ['metal_crown'], rigid: true, hair: true },
  { key: 'coif_linen', files: ['cloth_coif_linen'], rigid: false, hair: false },
  { key: 'hat_felt', files: ['cloth_hat_felt'], rigid: false, hair: true },
  { key: 'hat_straw', files: ['cloth_hat_straw'], rigid: false, hair: true },
];
/** Poke-through: share of the directions the piece is seen in, mean over the sample and its worst person. */
const POKE_MEAN = 0.005, POKE_WORST = 0.02;
/** Floating: the narrowest tenth of the gaps above the horizon (base units, 10 cm), soft pieces and rigid ones. */
const GAP_SOFT = 0.15, GAP_RIGID = 0.4;

const args = process.argv.slice(2);
const strict = args.includes('--strict'), verbose = args.includes('--verbose');
const only = args.find(a => a.startsWith('--only='))?.slice(7);

const NT = 72, NE = 24, E0 = -30, DE = 5;
const isHair = (s: PortraitSurface) => s.tex.includes('_locks.') || s.tex.includes('_rope.') || (surfaceKind(s) === 'cap' && !s.tex.includes('beard')) || surfaceKind(s) === 'cards';

/** The farthest point per direction of some surfaces, seen from `c` (0 where none). */
function far(surfaces: PortraitSurface[], c: [number, number, number]): Float32Array {
  const out = new Float32Array(NT * NE);
  for (const s of surfaces) {
    const p = s.pos;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]! - c[0], y = p[i + 1]! - c[1], z = p[i + 2]! - c[2];
      const r = Math.hypot(x, y, z);
      const el = Math.asin(y / (r || 1)) * 180 / Math.PI;
      const e = Math.floor((el - E0) / DE);
      if (e < 0 || e >= NE) continue;
      const t = Math.floor(((Math.atan2(x, z) * 180 / Math.PI + 360) % 360) / (360 / NT));
      const k = e * NT + t;
      if (r > out[k]!) out[k] = r;
    }
  }
  return out;
}

/** A point in the middle of the head: on its axis, a little under the eyes' height of a grown head. */
function middle(skin: PortraitSurface): [number, number, number] {
  let top = -Infinity;
  for (let i = 1; i < skin.pos.length; i += 3) top = Math.max(top, skin.pos[i]!);
  let z = 0, n = 0;
  for (let i = 0; i < skin.pos.length; i += 3) {
    const y = skin.pos[i + 1]!;
    if (y > top - 1.2 && y < top - 0.6) { z += skin.pos[i + 2]!; n++; }
  }
  return [0, top - 0.95, n ? z / n : 0];
}

interface Reading { poke: number; hairPoke: number; gap: number; others: string[]; missing: string[] }

function read(q: Portrait, piece: Piece): Reading {
  const skin = q.surfaces.filter(s => surfaceKind(s) === 'skin').sort((a, b) => b.pos.length - a.pos.length)[0]!;
  const c = middle(skin);
  const mine = q.surfaces.filter(s => piece.files.some(f => s.tex.includes(`/${f}.`)));
  const P = far(mine, c), S = far([skin], c), H = far(q.surfaces.filter(isHair), c);
  let seen = 0, poke = 0, hairPoke = 0;
  const gaps: number[] = [];
  for (let k = 0; k < P.length; k++) {
    if (!P[k]) continue;
    // above the horizon, where the piece lies on the head or stands off it (a hat's crown, a helm's top)
    if (Math.floor(k / NT) * DE + E0 >= 0) {
      const under = Math.max(S[k]!, piece.hair ? H[k]! : 0);
      if (under) gaps.push(P[k]! - under);
    }
    // at the piece's own edge a direction sees it only in part, and the skin beyond the edge in the rest of it:
    // that is not a poke-through, so only directions whose four neighbours see the piece too are counted
    const e = Math.floor(k / NT), t = k % NT;
    const inner = e > 0 && e < NE - 1 && P[k - NT]! > 0 && P[k + NT]! > 0 && P[e * NT + (t + 1) % NT]! > 0 && P[e * NT + (t + NT - 1) % NT]! > 0;
    if (!inner) continue;
    seen++;
    if (S[k]! > P[k]! + 0.002) { poke++; if (process.env.WHERE) console.log(`      skin at ${(k % NT) * 360 / NT} deg round, ${Math.floor(k / NT) * DE + E0} up: ${((S[k]! - P[k]!) * 100).toFixed(1)} mm`); }
    if (piece.hair && H[k]! > P[k]! + 0.002) hairPoke++;
  }
  gaps.sort((a, b) => a - b);
  const worn = q.surfaces.map(s => s.tex);
  return {
    poke: seen ? poke / seen : 1,
    hairPoke: seen ? hairPoke / seen : 0,
    // where it rests: the narrowest tenth of the gaps (a piece that floats has no narrow gap anywhere)
    gap: gaps.length ? gaps[Math.floor(gaps.length / 10)]! : Infinity,
    others: worn.filter(t => /\/cloth_(hood_up|hood_down|veil|veil_linen|wimple)\./.test(t)),
    missing: piece.files.filter(f => !worn.some(t => t.includes(`/${f}.`))),
  };
}

const people: PortraitPerson[] = JSON.parse(readFileSync(fileURLToPath(new URL('../../tests/portrait/sample_england.json', import.meta.url)), 'utf8'));
const b = loadPortraitBuilder(resolve(PORTRAIT_PUBLIC, 'sc_portrait.wasm'));
let failed = 0, lines = 0;
const line = (ok: boolean, what: string, got: string, want: string) => {
  lines++;
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what.padEnd(46)} ${got.padStart(16)}   (${want})`);
};
const pct = (x: number) => `${(100 * x).toFixed(2)} %`;

for (const piece of PIECES) {
  if (only && piece.key !== only) continue;
  b.headwear(piece.key);
  const rs = people.map(p => ({ p, r: read(b.build({ ...p, origin: 'England' }), piece) }));
  console.log(piece.key);
  const worst = (f: (r: Reading) => number) => rs.reduce((w, x) => (f(x.r) > f(w.r) ? x : w));
  const who = (x: { p: PortraitPerson }) => `${x.p.female ? 'woman' : 'man'} ${x.p.age} (${x.p.pid})`;
  const mean = (f: (r: Reading) => number) => rs.reduce((a, x) => a + f(x.r), 0) / rs.length;
  const missing = rs.filter(x => x.r.missing.length);
  line(!missing.length, 'every file of it is built', `${rs.length - missing.length} of ${rs.length}`, 'all');
  const others = rs.filter(x => x.r.others.length);
  line(!others.length, 'no hood, veil or wimple under it', `${others.length} people`, 'none');
  if (others.length && verbose) for (const x of others) console.log(`        ${who(x)}: ${x.r.others.join(', ')}`);
  const wp = worst(r => r.poke);
  line(mean(r => r.poke) <= POKE_MEAN, 'skin through it, mean', pct(mean(r => r.poke)), `at most ${pct(POKE_MEAN)}`);
  line(wp.r.poke <= POKE_WORST, `skin through it, worst: ${who(wp)}`, pct(wp.r.poke), `at most ${pct(POKE_WORST)}`);
  if (piece.hair) {
    const wh = worst(r => r.hairPoke);
    line(mean(r => r.hairPoke) <= POKE_MEAN, 'hair through it, mean', pct(mean(r => r.hairPoke)), `at most ${pct(POKE_MEAN)}`);
    line(wh.r.hairPoke <= POKE_WORST, `hair through it, worst: ${who(wh)}`, pct(wh.r.hairPoke), `at most ${pct(POKE_WORST)}`);
  }
  const limit = piece.rigid ? GAP_RIGID : GAP_SOFT;
  const wg = worst(r => r.gap);
  line(wg.r.gap <= limit, `where it rests, gap, worst: ${who(wg)}`, `${(wg.r.gap * 10).toFixed(1)} cm`, `at most ${(limit * 10).toFixed(1)} cm`);
  if (verbose) for (const x of rs) console.log(`        ${who(x).padEnd(24)} skin ${pct(x.r.poke)}  hair ${pct(x.r.hairPoke)}  gap ${(x.r.gap * 10).toFixed(1)} cm`);
}
b.headwear('');
console.log(`${lines - failed} of ${lines} lines pass`);
if (strict && failed) process.exit(1);
