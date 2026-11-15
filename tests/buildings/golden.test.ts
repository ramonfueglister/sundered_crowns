// The geometry of every building builder, fixed as a fingerprint. The refactor of the building code into
// src/buildings must not change a single vertex: each case below is built with fixed seeds, and the hash of its
// positions, normals and colours (as float64 bytes) must equal the one in golden.json. After a deliberate change to a
// building, rewrite the fixture with UPDATE_GOLDEN=1 npx vitest run tests/buildings and say so in the commit.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Batch, seeded } from '../../src/lookprobe/batch';
import * as B from '../../src/buildings';
import { glbToBatch } from '../../src/buildings/landmarks/glb';

/** the monument files as the world's workers load them, read from public/ */
const FILES = new Map(B.MONUMENT_FILES.map((f) => { const buf = readFileSync(`public/models/landmarks/${f}`); return [f, glbToBatch(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))]; }));

const FIXTURE = new URL('./golden.json', import.meta.url);

function fingerprint(b: Batch): string {
  const h = createHash('sha256');
  for (const list of [b.pos, b.nor, b.col]) h.update(new Uint8Array(new Float64Array(list).buffer));
  return `${b.triangles}:${h.digest('hex').slice(0, 24)}`;
}

/** Every builder, with the arguments the game and the look probe use, over a few seeds. */
function cases(): Record<string, () => Batch> {
  const out: Record<string, () => Batch> = {};
  const styles = { SOUTH: B.SOUTH, NORTH: B.NORTH, TIMBER: B.TIMBER, TERRACE: B.TERRACE };
  for (const [name, style] of Object.entries(styles)) for (const seed of [1, 2, 3, 4]) for (const [w, d, floors] of [[4, 3, 1], [5, 4, 2], [12, 6, 3], [6, 9, 2]] as const) {
    out[`house/${name}/${seed}/${w}x${d}x${floors}`] = () => { const r = seeded(seed); return B.house(w, d, floors, r.pick(style.walls), r.pick(style.roofs), r, style); };
    out[`townHouse/${name}/${seed}/${w}x${d}x${floors}`] = () => { const r = seeded(seed + 100); return B.townHouse(w, d, floors, r.pick(style.walls), r.pick(style.roofs), r, style); };
  }
  for (const seed of [1, 2, 3, 4]) for (const [w, d, floors, o] of [[3, 5, 2, {}], [2.5, 4, 3, { shop: true, canal: 'nz' }], [7, 9, 3, { great: true, canal: 'nz' }], [3.5, 6, 2, { detail: 0 }]] as const) {
    out[`fineHouse/VENICE/${seed}/${w}x${d}x${floors}/${JSON.stringify(o)}`] = () => B.fineHouse(w, d, floors, B.VENICE, seeded(seed), o);
  }
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    out[`tower/${seed}`] = () => B.tower(seeded(seed));
    out[`church/${seed}`] = () => B.church(seeded(seed));
    out[`spireChurch/${seed}`] = () => B.spireChurch(seeded(seed));
    out[`domedChurch/${seed}`] = () => B.domedChurch(seeded(seed));
    out[`domedChurch/${seed}/1.6`] = () => B.domedChurch(seeded(seed), 1.6);
    out[`mosque/${seed}`] = () => B.mosque(seeded(seed));
    out[`mosque/${seed}/1.6`] = () => B.mosque(seeded(seed), 1.6);
  }
  out['campanile'] = B.campanile;
  out['basilica'] = B.basilica;
  out['palace'] = B.palace;
  out['castle'] = B.castle;
  out['lighthouse'] = B.lighthouse;
  out['hagiaSophia'] = B.hagiaSophia;
  for (const [w, d] of [[20, 20], [34, 26]]) out[`townWall/${w}x${d}`] = () => B.townWall(w, d);
  for (const [span, width] of [[6, 3], [11, 4]]) out[`bridge/${span}x${width}`] = () => B.bridge(span, width);
  out['cathedral/plain'] = () => B.cathedral(B.WALLS[0], B.ROOFS[1], null);
  for (const region of ['italy', 'germany', 'greece', 'rus', 'egypt']) for (const seed of [1, 2, 3]) {
    const st = B.styleOf(region);
    out[`style/${region}/church/${seed}`] = () => st.church.build(seeded(seed));
    out[`style/${region}/great/${seed}`] = () => st.great.build(seeded(seed));
  }
  for (const [id, parts] of Object.entries(B.MONUMENTS)) parts.forEach((p, k) => { out[`monument/${id}/${k}`] = () => B.modelOf(p, FILES).build(seeded(500)); });
  return out;
}

describe('building geometry stays exactly as fixed in golden.json', () => {
  const got = Object.fromEntries(Object.entries(cases()).map(([k, f]) => [k, fingerprint(f())]));
  if (process.env.UPDATE_GOLDEN) writeFileSync(FIXTURE, `${JSON.stringify(got, null, 1)}\n`);
  const want: Record<string, string> = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  it('has the same cases', () => expect(Object.keys(got).sort()).toEqual(Object.keys(want).sort()));
  for (const k of Object.keys(want)) it(k, () => expect(got[k]).toBe(want[k]));
});
