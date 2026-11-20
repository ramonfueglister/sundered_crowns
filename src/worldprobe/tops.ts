// The level tops of a near piece's columns, joined. Most of a piece's ground is level land, and each of its columns
// has a top of its own: a face of two triangles, 40 000 to a piece. Where columns of one height lie side by side
// their tops are one rectangle here, and the colours that made each top what it was (the grain of each column, the
// patches of the meadow, the light of the sky at each corner) go into a field that the stage reads as it draws
// (lookprobe/faces.ts `Field`): the picture stays as it was, from far fewer triangles.
import { FACE_COL, FACE_GEO, FACE_STEPS, FIELD_COLUMNS, FIELD_SIDE, type Faces, type Field, FLIPPED } from '../lookprobe/faces';
import type { Shape } from '../lookprobe/shape';

/**
 * A shape with the level tops of its columns taken out of its faces and joined (`Shape.tops`): the faces that face
 * upwards, are one block square on the blocks and lie in the field's columns from (x0, z0). The rest of the faces
 * stay as they are. A shape without faces is handed back as it is.
 */
/** how far a joined top reaches over its columns' edges, in 64ths of a block (see `joinTops`) */
const OVERLAP = 1;

export function joinTops(shape: Shape, x0: number, z0: number): Shape {
  const f = shape.faces;
  if (!f || f.lift || f.aim) return shape;
  const n = f.geo.length / FACE_GEO, S = FACE_STEPS;
  // the column each top lies on, and the kind of top it is: of one height, one way round and one direction
  const kinds = new Map<string, number>(), kindOf = new Int32Array(FIELD_COLUMNS * FIELD_COLUMNS), faceOf = new Int32Array(FIELD_COLUMNS * FIELD_COLUMNS).fill(-1);
  const first: number[] = [];
  const tones = new Uint8Array(FIELD_SIDE * FIELD_SIDE * 4), keep = new Uint8Array(n).fill(1);
  for (let k = 0; k < n; k++) {
    const g = k * FACE_GEO, kind = f.geo[g];
    if (kind % FLIPPED !== 1 || f.nor[k * 4 + 1] !== 127) continue;
    const ua = f.geo[g + 2], uc = f.geo[g + 3], va = f.geo[g + 4], vc = f.geo[g + 5];
    if (Math.abs(uc - ua) !== S || Math.abs(vc - va) !== S) continue;
    const u = Math.min(ua, uc), v = Math.min(va, vc);
    if (u % S || v % S) continue;
    const x = u / S - x0, z = v / S - z0;
    if (x < 0 || z < 0 || x >= FIELD_COLUMNS || z >= FIELD_COLUMNS || faceOf[z * FIELD_COLUMNS + x] >= 0) continue;
    const name = `${kind} ${f.geo[g + 1]} ${ua < uc ? 1 : 0} ${va < vc ? 1 : 0} ${f.nor[k * 4]} ${f.nor[k * 4 + 2]} ${f.nor[k * 4 + 3]}`;
    let id = kinds.get(name);
    if (id === undefined) { id = kinds.size + 1; kinds.set(name, id); first.push(k); }
    kindOf[z * FIELD_COLUMNS + x] = id; faceOf[z * FIELD_COLUMNS + x] = k; keep[k] = 0;
    // the colours of its corners at (u0, v0), (u1, v0), (u1, v1), (u0, v1), each into its place among the column's two by two
    for (let c = 0; c < 4; c++) {
      const cu = c === 1 || c === 2 ? uc : ua, cv = c >= 2 ? vc : va, at = ((2 * z + (cv > v ? 1 : 0)) * FIELD_SIDE + 2 * x + (cu > u ? 1 : 0)) * 4;
      for (let m = 0; m < 4; m++) tones[at + m] = f.col[k * FACE_COL + c * 4 + m];
    }
  }
  if (!kinds.size) return shape;
  // the tops joined: along a row as far as they are of one kind, then down as far as every column of the row below is too
  const geo: number[] = [], nor: number[] = [], done = new Uint8Array(FIELD_COLUMNS * FIELD_COLUMNS);
  for (let z = 0; z < FIELD_COLUMNS; z++) for (let x = 0; x < FIELD_COLUMNS; x++) {
    const id = kindOf[z * FIELD_COLUMNS + x];
    if (!id || done[z * FIELD_COLUMNS + x]) continue;
    let w = 1, h = 1;
    while (x + w < FIELD_COLUMNS && kindOf[z * FIELD_COLUMNS + x + w] === id && !done[z * FIELD_COLUMNS + x + w]) w++;
    rows: while (z + h < FIELD_COLUMNS) {
      for (let i = 0; i < w; i++) if (kindOf[(z + h) * FIELD_COLUMNS + x + i] !== id || done[(z + h) * FIELD_COLUMNS + x + i]) break rows;
      h++;
    }
    for (let j = 0; j < h; j++) done.fill(1, (z + j) * FIELD_COLUMNS + x, (z + j) * FIELD_COLUMNS + x + w);
    // (one way round as its columns' tops were: the way its spans run tells which way its triangles face)
    const k = first[id - 1], g = k * FACE_GEO, uUp = f.geo[g + 3] > f.geo[g + 2], vUp = f.geo[g + 5] > f.geo[g + 4];
    // (and a 64th of a block wider on every side: where the corner of one rectangle lies on the edge of the next, the
    // graphics card does not quite close the seam between them, and the samples of a dot it leaves open along the
    // whole edge drew a fine dark line there; so the rectangles overlap by a hair, where both show the same colours,
    // and reach as far over the edge of a step, which is less than a dot from any distance the map is seen at)
    const u0 = (x + x0) * S - OVERLAP, u1 = (x + x0 + w) * S + OVERLAP, v0 = (z + z0) * S - OVERLAP, v1 = (z + z0 + h) * S + OVERLAP;
    geo.push(f.geo[g], f.geo[g + 1], uUp ? u0 : u1, uUp ? u1 : u0, vUp ? v0 : v1, vUp ? v1 : v0);
    nor.push(f.nor[k * 4], f.nor[k * 4 + 1], f.nor[k * 4 + 2], f.nor[k * 4 + 3]);
  }
  // the faces that are not such tops stay
  const kept: number[] = [];
  for (let k = 0; k < n; k++) if (keep[k]) kept.push(k);
  const faces: Faces = { geo: new Int16Array(kept.length * FACE_GEO), col: new Uint8Array(kept.length * FACE_COL), nor: new Int8Array(kept.length * 4) };
  kept.forEach((k, i) => {
    faces.geo.set(f.geo.subarray(k * FACE_GEO, (k + 1) * FACE_GEO), i * FACE_GEO);
    faces.col.set(f.col.subarray(k * FACE_COL, (k + 1) * FACE_COL), i * FACE_COL);
    faces.nor.set(f.nor.subarray(k * 4, (k + 1) * 4), i * 4);
  });
  const tops: Field = { geo: Int16Array.from(geo), nor: Int8Array.from(nor), tones, x0, z0 };
  return { ...shape, faces, tops };
}
