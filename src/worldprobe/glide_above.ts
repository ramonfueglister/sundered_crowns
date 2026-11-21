// What the coarser piece shows over a piece, read from its drawn faces as the tops and sides of its columns, and
// the colours a face of the piece takes from it on the glide (glide.ts).
import type { RGB } from '../lookprobe/batch';
import { FACE_COL, FACE_GEO, FACE_STEPS, FLIPPED, type Faces } from '../lookprobe/faces';
import { BRIGHTEST } from './small';

const S = FACE_STEPS;

/** the colour last looked up: one list for all, as the lookups are a few to every face of a piece */
export const tone = [0, 0, 0];
const shown = (col: Uint8Array, o: number): RGB => {
  const most = (col[o + 3] / 254) * BRIGHTEST;
  return [(col[o] / 255) * most, (col[o + 1] / 255) * most, (col[o + 2] / 255) * most];
};
/** a colour as four bytes, as small.ts writes it */
export function write(c: ArrayLike<number>, col: Uint8Array, o: number) {
  const r = Math.max(0, c[0]),
    g = Math.max(0, c[1]),
    l = Math.max(0, c[2]);
  const most = Math.min(254, Math.ceil((Math.max(r, g, l) / BRIGHTEST) * 254)),
    k = most ? (255 * 254) / (most * BRIGHTEST) : 0;
  col[o] = Math.min(255, Math.round(r * k));
  col[o + 1] = Math.min(255, Math.round(g * k));
  col[o + 2] = Math.min(255, Math.round(l * k));
  col[o + 3] = most;
}

/** What the coarser piece shows over a piece, by the columns of the coarser piece's ground. */
export interface Above {
  side: number;
  /** the colours of each column's top at its corners (x, z), (x + 1, z), (x + 1, z + 1), (x, z + 1), three numbers each; whether it has a top; and whether that is ground to the map's paper */
  tops: Float32Array;
  has: Uint8Array;
  ink: Uint8Array;
  /** the sides of each column, by column and way: where each lies along its edge and in height (64ths), and its colours at the foot's two ends and the top's */
  sides: Map<number, { a0: number; a1: number; y0: number; y1: number; foot: [RGB, RGB]; top: [RGB, RGB] }[]>;
}

/** The faces of a drawn mesh, read as tops and sides of columns. */
export function read(above: Above, f: Faces | undefined, ink: number) {
  if (!f) return;
  for (let k = 0, g = 0; g < f.geo.length; k++, g += FACE_GEO) {
    const axis = f.geo[g] % FLIPPED,
      level = f.geo[g + 1],
      u0 = f.geo[g + 2],
      u1 = f.geo[g + 3],
      v0 = f.geo[g + 4],
      v1 = f.geo[g + 5],
      way = f.nor[k * 4 + axis];
    if (axis === 1) {
      if (way <= 0 || Math.abs(u1 - u0) !== S || Math.abs(v1 - v0) !== S) continue;
      const x = Math.min(u0, u1) / S,
        z = Math.min(v0, v1) / S,
        i = z * above.side + x;
      // the face's corners in their order: (u0, v0), (u1, v0), (u1, v1), (u0, v1)
      for (let c = 0; c < 4; c++) {
        const far = (c === 1 || c === 2 ? u1 : u0) > x * S,
          deep = (c >= 2 ? v1 : v0) > z * S,
          o = k * FACE_COL + c * 4,
          to = i * 12 + (far ? (deep ? 2 : 1) : deep ? 3 : 0) * 3,
          most = (f.col[o + 3] / 254) * BRIGHTEST;
        above.tops[to] = (f.col[o] / 255) * most;
        above.tops[to + 1] = (f.col[o + 1] / 255) * most;
        above.tops[to + 2] = (f.col[o + 2] / 255) * most;
      }
      above.has[i] = 1;
      above.ink[i] = ink;
      continue;
    }
    // a side: the column behind it, the way it faces, its span along the edge and in height (a side inside a column,
    // of what stands on it, is none of the column's)
    if (level % S) continue;
    const us = [u0, u1, u1, u0],
      vs = [v0, v0, v1, v1],
      ys = axis === 0 ? us : vs,
      as = axis === 0 ? vs : us,
      a0 = Math.min(...as),
      a1 = Math.max(...as),
      y0 = Math.min(...ys),
      y1 = Math.max(...ys);
    const along = Math.floor(a0 / S),
      across = level / S - (way > 0 ? 1 : 0),
      x = axis === 0 ? across : along,
      z = axis === 0 ? along : across;
    const at = (low: boolean, first: boolean): RGB => {
      for (let c = 0; c < 4; c++)
        if ((ys[c] === y0) === low && (as[c] === a0) === first) return shown(f.col, k * FACE_COL + c * 4);
      return [0, 0, 0];
    };
    const key = (z * above.side + x) * 4 + (axis === 0 ? (way > 0 ? 0 : 1) : way > 0 ? 2 : 3);
    let list = above.sides.get(key);
    if (!list) {
      list = [];
      above.sides.set(key, list);
    }
    list.push({ a0, a1, y0, y1, foot: [at(true, true), at(true, false)], top: [at(false, true), at(false, false)] });
  }
}

/** The colour the coarser piece's side of a column shows at a height and a place along its edge, into `tone`; false where it has no side there. */
export function sideAt(above: Above, p: number, dir: number, y: number, a: number): boolean {
  const list = above.sides.get(p * 4 + dir);
  if (!list) return false;
  let best = list[0],
    miss = Infinity;
  for (let k = 0; k < list.length; k++) {
    const s = list[k],
      d = Math.max(0, s.y0 - y, y - s.y1) + Math.max(0, s.a0 - a, a - s.a1) * 4;
    if (d < miss) {
      miss = d;
      best = s;
    }
  }
  const t = best.y1 > best.y0 ? Math.max(0, Math.min(1, (y - best.y0) / (best.y1 - best.y0))) : 0,
    s = best.a1 > best.a0 ? Math.max(0, Math.min(1, (a - best.a0) / (best.a1 - best.a0))) : 0;
  for (let k = 0; k < 3; k++)
    tone[k] =
      (best.foot[0][k] * (1 - s) + best.foot[1][k] * s) * (1 - t) + (best.top[0][k] * (1 - s) + best.top[1][k] * s) * t;
  return true;
}
/** The colour of the coarser column's top at a point of it (s along x, t along z, 0 … 1), into `tone`: as its two triangles show it. */
export function topAt(tops: Float32Array, p: number, s: number, t: number) {
  for (let k = 0, o = p * 12; k < 3; k++, o++) {
    const a = tops[o],
      d = tops[o + 3],
      c = tops[o + 6],
      b = tops[o + 9];
    tone[k] = t >= s ? a + s * (c - b) + t * (b - a) : a + s * (d - a) + t * (c - d);
  }
}
/**
 * The colours of the coarser column's top at the four corners of the top of a column of this piece (whose first
 * block in the world is `wx`, `wz`), written to a face's corners (u0, v0), (u1, v0), (u1, v1), (u0, v1).
 */
export function topsTo(
  tops: Float32Array,
  cols: Uint8Array,
  o: number,
  p: number,
  wx: number,
  wz: number,
  x: number,
  z: number,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
) {
  // (the coarser column is two of this piece's wide: the corner's place on it)
  const sx = wx & 1,
    sz = wz & 1;
  for (let c = 0; c < 4; c++) {
    topAt(
      tops,
      p,
      (sx + ((c === 1 || c === 2 ? u1 : u0) > x * S ? 1 : 0)) / 2,
      (sz + ((c >= 2 ? v1 : v0) > z * S ? 1 : 0)) / 2,
    );
    write(tone, cols, o + c * 4);
  }
}
