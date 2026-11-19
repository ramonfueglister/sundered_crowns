// The glide from a step of the map to the next coarser one. A coarser step has blocks twice as wide: where the view
// changed steps, every hill, wood and town of the picture changed its shape at once, and the land its grain. Now a
// piece of a far step knows what the piece of the coarser step over it shows at each of its columns, the height of
// the coarser column there and the colours of its top, and over the last stretch before the border the stage moves
// each column towards that (stage/materials.ts `gliding`, pieces.ts `GLIDE`): four columns close up into the one block that
// takes their place. At the border the piece shows what the coarser piece shows, column for column, so the change of
// steps changes nothing on the land. A view at rest anywhere in that stretch shows one step, with its columns part
// of the way: nothing is drawn twice. (Continuous distance-dependent level of detail, Strugar 2009, does the same for
// a height field: a vertex moves to where the coarser mesh has it before the meshes change places.)
//
// What glides:
//  - the tops of the land's columns and what they carry, their sides, and the colours of both. Between two columns
//    that the coarser step sets apart in height a side is added that has no height until they part.
//  - the coast. A column of land that is water in the coarser step sinks to that step's bed, and the water that is
//    to stand over it lies under it from the start. A column of water that is land in the coarser step has a top
//    that comes up from its bed. So the coast moves to the coarser step's coast column by column, each as its top
//    passes the water's level.
//  - water above the sea's level (lakes, rivers) moves to the level the coarser step has it at.
//  - the banks of the water (shore.ts), which are no faces but lists: the piece's own sink under the water, and
//    those of the coarser piece, which the piece carries too, come up from under it (stage/materials.ts `sinking`: each corner
//    of such a list knows the height it ends up at).
//  - the beds of such water, which are not drawn: the sides of the land that stand in the water follow them, so
//    they reach under the water at whatever level it ends.
//  - what stands on the ground as a thing of its own (the landmarks of the finest far step), which the coarser step
//    does not have: it goes down into its column.
//  - what the columns carry as faces inside a column (the crowns of the woods, lookprobe/terrain.ts `woodsOf`): the
//    piece's own go down into their column, and those of the coarser piece, which the piece carries too, come up
//    from under it to where that piece has them.
// What stays as it is and changes at the border, in the short dissolve as before (pieces.ts): the colours of the
// water, and the sea where the coarser step has water above the sea's level.
//
// The targets are worked out where the piece is built, from the tables of the two pieces (table.ts): the coarser one
// has a table built ahead, and the part of it that lies over the piece is drawn here for its colours.
import { Batch, type RGB } from '../lookprobe/batch';
import { FACE_COL, FACE_GEO, FACE_STEPS, FLIPPED, RISES, type Faces } from '../lookprobe/faces';
import { type Ground, SEA_Y, onGrid } from '../lookprobe/layout';
import type { Shape } from '../lookprobe/shape';
import { buildWater } from '../lookprobe/terrain';
import { ballOf } from './ball';
import { BRIGHTEST, faced, small } from './small';
import { type Table, drawBanks, drawLand, drawnHeights } from './table';
import { reliefOf } from './zoom';

/**
 * a block of height of the coarser step stands this many times as tall as one of the finer step, where both are
 * drawn at their border: every step is built flatter and drawn twice as wide (zoom.ts `reliefOf`, pieces.ts)
 */
export const TALLER = (2 * reliefOf(1e4, 5)) / reliefOf(1e4, 4);

/** the four ways a column's side faces: +x, -x, +z, -z */
const WAYS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const S = FACE_STEPS;

/** the colour last looked up: one list for all, as the lookups are a few to every face of a piece */
const tone = [0, 0, 0];
const shown = (col: Uint8Array, o: number): RGB => { const most = (col[o + 3] / 254) * BRIGHTEST; return [(col[o] / 255) * most, (col[o + 1] / 255) * most, (col[o + 2] / 255) * most]; };
/** a colour as four bytes, as small.ts writes it */
function write(c: ArrayLike<number>, col: Uint8Array, o: number) {
  const r = Math.max(0, c[0]), g = Math.max(0, c[1]), l = Math.max(0, c[2]);
  const most = Math.min(254, Math.ceil((Math.max(r, g, l) / BRIGHTEST) * 254)), k = most ? (255 * 254) / (most * BRIGHTEST) : 0;
  col[o] = Math.min(255, Math.round(r * k)); col[o + 1] = Math.min(255, Math.round(g * k)); col[o + 2] = Math.min(255, Math.round(l * k)); col[o + 3] = most;
}

/** What the coarser piece shows over a piece, by the columns of the coarser piece's ground. */
interface Above {
  side: number;
  /** the colours of each column's top at its corners (x, z), (x + 1, z), (x + 1, z + 1), (x, z + 1), three numbers each; whether it has a top; and whether that is ground to the map's paper */
  tops: Float32Array; has: Uint8Array; ink: Uint8Array;
  /** the sides of each column, by column and way: where each lies along its edge and in height (64ths), and its colours at the foot's two ends and the top's */
  sides: Map<number, { a0: number; a1: number; y0: number; y1: number; foot: [RGB, RGB]; top: [RGB, RGB] }[]>;
}

/** The faces of a drawn mesh, read as tops and sides of columns. */
function read(above: Above, f: Faces | undefined, ink: number) {
  if (!f) return;
  for (let k = 0, g = 0; g < f.geo.length; k++, g += FACE_GEO) {
    const axis = f.geo[g] % FLIPPED, level = f.geo[g + 1], u0 = f.geo[g + 2], u1 = f.geo[g + 3], v0 = f.geo[g + 4], v1 = f.geo[g + 5], way = f.nor[k * 4 + axis];
    if (axis === 1) {
      if (way <= 0 || Math.abs(u1 - u0) !== S || Math.abs(v1 - v0) !== S) continue;
      const x = Math.min(u0, u1) / S, z = Math.min(v0, v1) / S, i = z * above.side + x;
      // the face's corners in their order: (u0, v0), (u1, v0), (u1, v1), (u0, v1)
      for (let c = 0; c < 4; c++) {
        const far = (c === 1 || c === 2 ? u1 : u0) > x * S, deep = (c >= 2 ? v1 : v0) > z * S, o = k * FACE_COL + c * 4, to = i * 12 + (far ? (deep ? 2 : 1) : deep ? 3 : 0) * 3, most = (f.col[o + 3] / 254) * BRIGHTEST;
        above.tops[to] = (f.col[o] / 255) * most; above.tops[to + 1] = (f.col[o + 1] / 255) * most; above.tops[to + 2] = (f.col[o + 2] / 255) * most;
      }
      above.has[i] = 1; above.ink[i] = ink;
      continue;
    }
    // a side: the column behind it, the way it faces, its span along the edge and in height (a side inside a column,
    // of what stands on it, is none of the column's)
    if (level % S) continue;
    const us = [u0, u1, u1, u0], vs = [v0, v0, v1, v1], ys = axis === 0 ? us : vs, as = axis === 0 ? vs : us, a0 = Math.min(...as), a1 = Math.max(...as), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const along = Math.floor(a0 / S), across = level / S - (way > 0 ? 1 : 0), x = axis === 0 ? across : along, z = axis === 0 ? along : across;
    const at = (low: boolean, first: boolean): RGB => { for (let c = 0; c < 4; c++) if ((ys[c] === y0) === low && (as[c] === a0) === first) return shown(f.col, k * FACE_COL + c * 4); return [0, 0, 0]; };
    const key = (z * above.side + x) * 4 + (axis === 0 ? (way > 0 ? 0 : 1) : way > 0 ? 2 : 3);
    let list = above.sides.get(key);
    if (!list) above.sides.set(key, list = []);
    list.push({ a0, a1, y0, y1, foot: [at(true, true), at(true, false)], top: [at(false, true), at(false, false)] });
  }
}

/** what becomes of a column on the way: it stays; land that stays land; land that ends under the coarser step's water; water that ends as land */
const STAYS = 0, LAND = 1, SINKS = 2, COMES = 3;
/** what is to be out of sight lies this far under the top of the land that hides it, or under the level of the water that does (deeper than a bank's foot: shore.ts) */
const UNDER_LAND = 0.05, UNDER_WATER = 0.3;

type Ball = [number, number, number, number];
/** The ball that holds two balls (a ball of no size holds nothing). */
function both(a: Ball | undefined, b: Ball): Ball {
  if (!a || !a[3]) return b;
  if (!b[3]) return a;
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  if (d + b[3] <= a[3]) return a;
  if (d + a[3] <= b[3]) return b;
  const r = (d + a[3] + b[3]) / 2, k = (r - a[3]) / d;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, r];
}
/** How far the corners of a list move at most: from where they lie to the heights they end up at. */
function reach(pos: ArrayLike<number>, ends: Float32Array, from = 0): number {
  let most = 0;
  for (let v = 0; v < ends.length; v++) most = Math.max(most, Math.abs(ends[v] - pos[(from + v) * 3 + 1]));
  return most;
}
/**
 * The lists of a shape with more triangles after them; `ends` are the heights the new corners end up at, where the
 * shape tells them. The ball round the shape (in which the stage looks whether to draw it) then holds what it held,
 * the shape's faces too, and the new corners all the way.
 */
function join(shape: Shape, add: Shape, ends?: Float32Array) {
  const all = <T extends Float32Array | Int8Array | Uint8Array>(a: T, b: T): T => { const c = new (a.constructor as new (n: number) => T)(a.length + b.length); c.set(a); c.set(b, a.length); return c; };
  if (shape.sink || ends) {
    const was = shape.sink ?? Float32Array.from({ length: shape.pos.length / 3 }, (_, v) => shape.pos[v * 3 + 1]);
    shape.sink = all(was, ends ?? Float32Array.from({ length: add.pos.length / 3 }, (_, v) => add.pos[v * 3 + 1]));
  }
  const more = ballOf(add.pos);
  if (ends) more[3] += reach(add.pos, ends);
  shape.ball = both(shape.pos.length || shape.faces ? shape.ball as Ball | undefined : undefined, more);
  shape.pos = all(shape.pos as Float32Array, add.pos as Float32Array); shape.nor = all(shape.nor as Int8Array, add.nor as Int8Array); shape.col = all(shape.col as Uint8Array, add.col as Uint8Array);
}
/** The ball round a shape made wider by as far as its corners move. */
function wider(shape: Shape, by: number) {
  if (by > 0 && shape.ball) shape.ball = [shape.ball[0], shape.ball[1], shape.ball[2], shape.ball[3] + by];
}

/** a height of the coarser piece in this piece's blocks */
const tall = (y: number) => SEA_Y + (y - SEA_Y) * TALLER;
/** a height of this piece, in 64ths, as the coarser piece counts it */
const coarse = (y: number) => (SEA_Y + (y / S - SEA_Y) / TALLER) * S;

/**
 * What becomes of each column of a piece, and of one round it: the coarser column over it (`over`, -1: none), where
 * its top starts and where it ends (`from`, `aim`: 64ths of this piece's blocks), what becomes of it (`way`), and the
 * level the water over it ends at (`surface`, blocks; none where the coarser step has land there). And what the
 * piece holds of all that: how many of its own columns glide, whether land and water change places, whether either
 * step has water here, and whether the coarser has.
 *
 * (The parts of the glide are functions of their own that are handed this, not one long function with its helpers
 * inside: so the engine keeps the fast code it makes of each from piece to piece. As one function, each part ran
 * for the first time in a piece while the fast code of the part before it was in use, which threw that code away:
 * a walk over a piece's columns and their neighbours took 30 ms where it now takes a few.)
 */
interface Columns {
  /** `h`, `theirH`: the tops of the piece's columns and of the coarser piece's as they are drawn, which is lower than their tables have them where trees stand (table.ts `drawnHeights`) */
  n: number; fine: Table; parent: Table; above: Above; h: ArrayLike<number>; theirH: ArrayLike<number>;
  over: Int32Array; from: Int32Array; aim: Int32Array; way: Uint8Array; surface: Float32Array;
  gliding: number; coast: boolean; water: boolean; theirs: boolean;
}
function columnsOf(fine: Table, parent: Table, above: Above): Columns {
  // (the heights the two pieces draw: where trees stand, those are lower than their tables have them)
  const h = drawnHeights(fine), theirH = drawnHeights(parent);
  const n = fine.side, pn = parent.side, own = fine.part, fox = fine.ox, foz = fine.oz, pox = parent.ox, poz = parent.oz;
  const wet = fine.wet, surf = fine.surf, theirWet = parent.wet, theirSurf = parent.surf;
  const over = new Int32Array(n * n).fill(-1), from = new Int32Array(n * n), aim = new Int32Array(n * n), way = new Uint8Array(n * n), surface = new Float32Array(n * n).fill(NaN);
  let gliding = 0, coast = false, water = false, theirs = false;
  for (let z = Math.max(0, own.z0 - 1); z < Math.min(n, own.z1 + 1); z++) for (let x = Math.max(0, own.x0 - 1); x < Math.min(n, own.x1 + 1); x++) {
    const i = z * n + x, px = Math.floor((fox + x) / 2) - pox, pz = Math.floor((foz + z) / 2) - poz, p = pz * pn + px;
    from[i] = aim[i] = h[i] * S;
    if (px < 0 || pz < 0 || px >= pn || pz >= pn) continue;
    over[i] = p;
    if (theirWet[p]) surface[i] = theirSurf[p] > SEA_Y + 0.01 ? tall(theirSurf[p]) : SEA_Y;
    if (wet[i] || theirWet[p]) water = true;
    if (theirWet[p]) theirs = true;
    aim[i] = Math.round(tall(theirH[p]) * S);
    // (water in both steps: where its level moves, its bed moves too, out of sight, and with it the feet of the
    // sides that stand in it, so that they reach under the water whatever level that ends at; the sea stays the sea)
    if (wet[i] && theirWet[p]) { if (surf[i] <= SEA_Y + 0.01) aim[i] = from[i]; continue; }
    way[i] = wet[i] ? COMES : theirWet[p] ? SINKS : LAND;
    if (way[i] !== LAND) coast = true;
    if (x >= own.x0 && x < own.x1 && z >= own.z0 && z < own.z1) gliding++;
  }
  return { n, fine, parent, above, h, theirH, over, from, aim, way, surface, gliding, coast, water, theirs };
}

/** The colour the coarser piece's side of a column shows at a height and a place along its edge, into `tone`; false where it has no side there. */
function sideAt(above: Above, p: number, dir: number, y: number, a: number): boolean {
  const list = above.sides.get(p * 4 + dir);
  if (!list) return false;
  let best = list[0], miss = Infinity;
  for (let k = 0; k < list.length; k++) { const s = list[k], d = Math.max(0, s.y0 - y, y - s.y1) + Math.max(0, s.a0 - a, a - s.a1) * 4; if (d < miss) { miss = d; best = s; } }
  const t = best.y1 > best.y0 ? Math.max(0, Math.min(1, (y - best.y0) / (best.y1 - best.y0))) : 0, s = best.a1 > best.a0 ? Math.max(0, Math.min(1, (a - best.a0) / (best.a1 - best.a0))) : 0;
  for (let k = 0; k < 3; k++) tone[k] = (best.foot[0][k] * (1 - s) + best.foot[1][k] * s) * (1 - t) + (best.top[0][k] * (1 - s) + best.top[1][k] * s) * t;
  return true;
}
/** The colour of the coarser column's top at a point of it (s along x, t along z, 0 … 1), into `tone`: as its two triangles show it. */
function topAt(tops: Float32Array, p: number, s: number, t: number) {
  for (let k = 0, o = p * 12; k < 3; k++, o++) {
    const a = tops[o], d = tops[o + 3], c = tops[o + 6], b = tops[o + 9];
    tone[k] = t >= s ? a + s * (c - b) + t * (b - a) : a + s * (d - a) + t * (c - d);
  }
}
/**
 * The colours of the coarser column's top at the four corners of the top of a column of this piece (whose first
 * block in the world is `wx`, `wz`), written to a face's corners (u0, v0), (u1, v0), (u1, v1), (u0, v1).
 */
function topsTo(tops: Float32Array, cols: Uint8Array, o: number, p: number, wx: number, wz: number, x: number, z: number, u0: number, u1: number, v0: number, v1: number) {
  // (the coarser column is two of this piece's wide: the corner's place on it)
  const sx = wx & 1, sz = wz & 1;
  for (let c = 0; c < 4; c++) { topAt(tops, p, (sx + ((c === 1 || c === 2 ? u1 : u0) > x * S ? 1 : 0)) / 2, (sz + ((c >= 2 ? v1 : v0) > z * S ? 1 : 0)) / 2); write(tone, cols, o + c * 4); }
}

/** what goes down into a column ends this many 64ths under its top */
const SUNK = Math.round(UNDER_LAND * S);
/**
 * The column a face lies inside, of a ground `n` columns a side, where it is a face of what stands on the column and
 * none of the column's own: a level face smaller than the column's top, an upright face off the edges of the columns.
 * -1 where it is none, or off the ground.
 */
function insideOf(n: number, axis: number, level: number, u0: number, u1: number, v0: number, v1: number): number {
  let x: number, z: number;
  if (axis === 1) {
    if (Math.abs(u1 - u0) === S && Math.abs(v1 - v0) === S && u0 % S === 0 && v0 % S === 0) return -1;
    x = Math.floor(Math.min(u0, u1) / S); z = Math.floor(Math.min(v0, v1) / S);
    if (Math.max(u0, u1) > (x + 1) * S || Math.max(v0, v1) > (z + 1) * S) return -1;
  }
  else {
    if (level % S === 0) return -1;
    const a0 = axis === 0 ? v0 : u0, a1 = axis === 0 ? v1 : u1, along = Math.floor(Math.min(a0, a1) / S);
    if (Math.max(a0, a1) > (along + 1) * S) return -1;
    x = axis === 0 ? Math.floor(level / S) : along; z = axis === 0 ? along : Math.floor(level / S);
  }
  return x < 0 || z < 0 || x >= n || z >= n ? -1 : z * n + x;
}

/**
 * The faces of a mesh get where they end up and what they show there; `ink`: what the fourth byte of their direction
 * says where the coarser step does not say otherwise. Where the mesh is what the columns carry (`standing`), the faces
 * that lie inside a column, above its top (the crowns of a wood), go down into it: they end under its top, with no height.
 */
function aimFaces(c: Columns, shape: Shape | undefined, ink: number, standing = false) {
  const f: Faces | undefined = shape?.faces;
  if (!f) return;
  const n = c.n, over = c.over, aim = c.aim, way = c.way, above = c.above, has = above.has, inked = above.ink, tops = above.tops, h = c.h, fox = c.fine.ox, foz = c.fine.oz, pox = c.parent.ox, poz = c.parent.oz;
  const geo = f.geo, nor = f.nor, count = geo.length / FACE_GEO, aims = new Int16Array(count * 2), cols = new Uint8Array(f.col);
  for (let k = 0, g = 0; k < count; k++, g += FACE_GEO) {
    const axis: number = geo[g] % FLIPPED, level: number = geo[g + 1], u0 = geo[g + 2], u1 = geo[g + 3], v0 = geo[g + 4], v1 = geo[g + 5], facing = nor[k * 4 + axis];
    // (a face that does not glide aims at where it is)
    aims[k * 2] = axis === 1 ? level : axis === 0 ? u0 : v0; aims[k * 2 + 1] = axis === 1 ? 0 : axis === 0 ? u1 : v1;
    nor[k * 4 + 3] = ink;
    const inner = standing ? insideOf(n, axis, level, u0, u1, v0, v1) : -1;
    if (inner >= 0) {
      if (way[inner] && (axis === 1 ? facing > 0 && level > h[inner] * S : Math.min(aims[k * 2], aims[k * 2 + 1]) >= h[inner] * S)) aims[k * 2] = aims[k * 2 + 1] = aim[inner] - SUNK;
      if (axis === 1) aims[k * 2 + 1] = 0;
      continue;
    }
    if (axis === 1) {
      // the top of a column
      if (facing <= 0 || Math.abs(u1 - u0) !== S || Math.abs(v1 - v0) !== S) continue;
      const x = Math.min(u0, u1) / S, z = Math.min(v0, v1) / S, i = z * n + x;
      if (x < 0 || z < 0 || x >= n || z >= n || !way[i] || level !== h[i] * S) continue;
      aims[k * 2] = aim[i];
      // (a top that sinks under the water keeps its colours: it is out of sight where it ends)
      const p = over[i];
      if (!has[p]) continue;
      nor[k * 4 + 3] = inked[p] ? 127 : 0;
      topsTo(tops, cols, k * FACE_COL, p, fox + x, foz + z, x, z, u0, u1, v0, v1);
      continue;
    }
    // a side: between the column behind it and the one it faces, it keeps its share of the way from one's top to
    // the other's (its span in height is u on a face across x, v on one across z; the other is its span along the edge)
    const y0 = axis === 0 ? u0 : v0, y1 = axis === 0 ? u1 : v1, a0 = axis === 0 ? v0 : u0, a1 = axis === 0 ? v1 : u1;
    const along = Math.floor(Math.min(a0, a1) / S), across: number = level / S - (facing > 0 ? 1 : 0);
    const x: number = axis === 0 ? across : along, z: number = axis === 0 ? along : across, d = facing > 0 ? 1 : -1, nx: number = axis === 0 ? x + d : x, nz: number = axis === 0 ? z : z + d;
    if (x < 0 || z < 0 || x >= n || z >= n || nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
    const i = z * n + x, j = nz * n + nx, top = h[i] * S, foot = h[j] * S;
    if ((!way[i] && !way[j]) || top <= foot || Math.min(y0, y1) < foot || Math.max(y0, y1) > top) continue;
    const span = (aim[i] - aim[j]) / (top - foot), to0 = Math.round(aim[j] + (y0 - foot) * span), to1 = Math.round(aim[j] + (y1 - foot) * span);
    aims[k * 2] = to0; aims[k * 2 + 1] = to1;
    // where the coarser step has a side here too, the face takes its colours
    const p = over[i];
    if (p < 0 || over[j] === p || aim[i] <= aim[j]) continue;
    const dir = axis === 0 ? (facing > 0 ? 0 : 1) : facing > 0 ? 2 : 3;
    for (let q = 0; q < 4; q++) {
      // (the corners in their order: (u0, v0), (u1, v0), (u1, v1), (u0, v1); a place along x or z of this piece's
      // ground, in 64ths, on the coarser piece's ground)
      const firstU = q === 0 || q === 3, firstV = q < 2, y = (axis === 0 ? firstU : firstV) ? to0 : to1, a = (axis === 0 ? firstV : firstU) ? a0 : a1;
      if (sideAt(above, p, dir, coarse(y), axis === 0 ? ((foz + a / S) / 2 - poz) * S : ((fox + a / S) / 2 - pox) * S)) write(tone, cols, k * FACE_COL + q * 4);
    }
  }
  f.aim = aims; f.aimCol = cols;
  // (the ball round the mesh holds its faces all the way)
  let far = 0;
  for (let k = 0, g = 0; k < count; k++, g += FACE_GEO) {
    const axis = geo[g] % FLIPPED, lo = axis === 0 ? 2 : 4;
    far = Math.max(far, axis === 1 ? Math.abs(aims[k * 2] - geo[g + 1]) : Math.max(Math.abs(aims[k * 2] - geo[g + lo]), Math.abs(aims[k * 2 + 1] - geo[g + lo + 1])));
  }
  wider(shape!, far / S);
}

/** the colour of a top to come where the coarser step shows none: a meadow's */
const MEADOW = [0.3, 0.36, 0.16];
/** the colour the faces to come are laid down with before their own is set (one list for all: see batch.ts `triAt`) */
const BLANK: RGB = [1, 1, 1];
/**
 * The faces to come, on the piece's own columns, added to the ground's:
 *  - the top of a column of water that ends as land: it comes up from the column's bed;
 *  - a side of no height where the coarser step sets a column above its neighbour and this one does not: it rises
 *    as the two part (a column against any neighbour, as terrain.ts draws its sides);
 *  - the sides of such a top to come, between two beds, which the water hides until they come up.
 */
function comingFaces(c: Columns, land: Shape) {
  const ground = land.faces!, n = c.n, over = c.over, from = c.from, aim = c.aim, way = c.way, above = c.above, tints = above.tops, own = c.fine.part, wet = c.fine.wet, h = c.h, fox = c.fine.ox, foz = c.fine.oz, pox = c.parent.ox, poz = c.parent.oz;
  const more = new Batch(), tops: number[] = [], spans: { foot: number; top: number; footAim: number; topAim: number; /** the coarser column over the side's own, and that where the coarser step has a side here */ owner: number; p: number; dir: number }[] = [];
  for (let z = own.z0; z < own.z1; z++) for (let x = own.x0; x < own.x1; x++) {
    const i = z * n + x;
    if (way[i] === COMES) { more.quadAt(x, 0, z, x, 0, z + 1, x + 1, 0, z + 1, x + 1, 0, z, BLANK, BLANK, BLANK, BLANK, 0, 1, 0); tops.push(i); }
  }
  for (let z = own.z0; z < own.z1; z++) for (let x = own.x0; x < own.x1; x++) {
    const i = z * n + x, moves = way[i], water = wet[i];
    // (water that stays water has no sides, now or then)
    if (water && !moves) continue;
    for (let w = 0; w < 4; w++) {
      const dx = WAYS[w][0], dz = WAYS[w][1], nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const j = nz * n + nx;
      // (land that stands above its neighbour has its side already; a column of water has none: it gets one where
      // its bed lies above its neighbour's, which is gone when it ends no higher than that, and one where it ends above it)
      if ((!moves && !way[j]) || (water ? aim[i] <= aim[j] && from[i] <= from[j] : aim[i] <= aim[j] || h[i] > h[j])) continue;
      // the two top corners of this side, in the order that keeps the face turned outwards (terrain.ts)
      const ax = dx === 1 ? x + 1 : dx === -1 ? x : dz === 1 ? x : x + 1, az = dz === 1 ? z + 1 : dz === -1 ? z : dx === 1 ? z : z + 1;
      const bx = dx === 1 ? x + 1 : dx === -1 ? x : dz === 1 ? x + 1 : x, bz = dz === 1 ? z + 1 : dz === -1 ? z : dx === 1 ? z + 1 : z;
      more.quadAt(ax, 0, az, bx, 0, bz, bx, 1, bz, ax, 1, az, BLANK, BLANK, BLANK, BLANK, dx, 0, dz);
      spans.push({ foot: from[j], top: from[i], footAim: aim[j], topAim: aim[i], owner: over[i], p: over[i] >= 0 && over[j] !== over[i] ? over[i] : -1, dir: w });
    }
  }
  if (!(tops.length + spans.length)) return;
  const added = faced(more).faces!, extra = added.geo.length / FACE_GEO, theirs = added.geo, turned = added.nor;
  if (extra !== tops.length + spans.length) throw new Error('glide: a face to come that is no face');
  const count = ground.geo.length / FACE_GEO, geo = new Int16Array((count + extra) * FACE_GEO), col = new Uint8Array((count + extra) * FACE_COL), nor = new Int8Array((count + extra) * 4), aims = new Int16Array((count + extra) * 2), aimCol = new Uint8Array((count + extra) * FACE_COL);
  geo.set(ground.geo); col.set(ground.col); nor.set(ground.nor); aims.set(ground.aim!); aimCol.set(ground.aimCol!);
  /** two corners of each, where it starts and where it ends, for the ball round the mesh */
  const span: number[] = [];
  for (let k = 0; k < extra; k++) {
    const g = k * FACE_GEO, axis = theirs[g] % FLIPPED, at = count + k, o = at * FACE_GEO;
    for (let m = 0; m < FACE_GEO; m++) geo[o + m] = theirs[g + m];
    nor[at * 4] = turned[k * 4]; nor[at * 4 + 1] = turned[k * 4 + 1]; nor[at * 4 + 2] = turned[k * 4 + 2]; nor[at * 4 + 3] = 127;
    if (k < tops.length) {
      // a top to come: in the colours of the coarser column's top; where that has none, a meadow's
      const i = tops[k], p = over[i], x = i % n, z = (i - x) / n;
      geo[o + 1] = from[i]; aims[at * 2] = aim[i];
      span.push(x, from[i] / S, z, x + 1, aim[i] / S, z + 1);
      if (above.has[p]) { nor[at * 4 + 3] = above.ink[p] ? 127 : 0; topsTo(tints, aimCol, at * FACE_COL, p, fox + x, foz + z, x, z, geo[o + 2], geo[o + 3], geo[o + 4], geo[o + 5]); }
      else for (let q = 0; q < 4; q++) write(MEADOW, aimCol, at * FACE_COL + q * 4);
    }
    else {
      const lo = axis === 0 ? 2 : 4, side = spans[k - tops.length];
      // (the quad was made one block tall, its first corners at the foot: so the face's span in height runs upwards)
      if (theirs[g + lo] !== 0 || theirs[g + lo + 1] !== S) throw new Error('glide: a side that runs downwards');
      geo[o] += RISES; geo[o + lo] = side.foot; geo[o + lo + 1] = side.top;
      aims[at * 2] = side.footAim; aims[at * 2 + 1] = side.topAim;
      const across = theirs[g + 1] / S, a0 = theirs[g + (axis === 0 ? 4 : 2)] / S, a1 = theirs[g + (axis === 0 ? 5 : 3)] / S, low = Math.min(side.foot, side.footAim) / S, high = Math.max(side.top, side.topAim) / S;
      span.push(axis === 0 ? across : a0, low, axis === 0 ? a0 : across, axis === 0 ? across : a1, high, axis === 0 ? a1 : across);
      // its colours: the coarser step's side there; where that has none, the coarser column's top, darker
      for (let q = 0; q < 4; q++) {
        const u = theirs[g + (q === 1 || q === 2 ? 3 : 2)], v = theirs[g + (q >= 2 ? 5 : 4)], y = (axis === 0 ? u : v) === 0 ? side.footAim : side.topAim, a = axis === 0 ? ((foz + v / S) / 2 - poz) * S : ((fox + u / S) / 2 - pox) * S;
        if (side.p < 0 || !sideAt(above, side.p, side.dir, coarse(y), a)) {
          if (side.owner >= 0 && above.has[side.owner]) topAt(tints, side.owner, 0.5, 0.5); else tone.fill(0.4);
          for (let m = 0; m < 3; m++) tone[m] *= 0.7;
        }
        write(tone, aimCol, at * FACE_COL + q * 4);
      }
    }
    // (a face that comes shows at once what it will show: it has no colours of its own to come from)
    for (let m = at * FACE_COL, end = m + FACE_COL; m < end; m++) col[m] = aimCol[m];
  }
  land.faces = { geo, col, nor, aim: aims, aimCol };
  land.ball = both(land.ball as Ball | undefined, ballOf(span));
}

/**
 * The crowns of the coarser piece over this piece (`theirs`, the faces of what that piece's columns carry: those that
 * lie inside a column, above its top) are added to what the piece's columns carry: they come up to where that piece
 * has them, from under the lowest top of the columns they stand over, in their own colours all the way.
 */
function comingCrowns(c: Columns, carried: Shape, theirs: Faces) {
  const n = c.n, h = c.h, theirH = c.theirH, pn = c.parent.side, shiftX = (2 * c.parent.ox - c.fine.ox) * S, shiftZ = (2 * c.parent.oz - c.fine.oz) * S;
  const X = (u: number) => 2 * u + shiftX, Z = (v: number) => 2 * v + shiftZ, Y = (y: number) => Math.round(tall(y / S) * S);
  const picked: number[] = [], starts: number[] = [];
  for (let k = 0, g = 0; g < theirs.geo.length; k++, g += FACE_GEO) {
    const kind = theirs.geo[g], axis = kind % FLIPPED, level = theirs.geo[g + 1], u0 = theirs.geo[g + 2], u1 = theirs.geo[g + 3], v0 = theirs.geo[g + 4], v1 = theirs.geo[g + 5];
    const p = kind < RISES ? insideOf(pn, axis, level, u0, u1, v0, v1) : -1;
    if (p < 0) continue;
    // (a crown's sides run upwards from its foot, as terrain.ts draws them)
    const y0 = axis === 0 ? u0 : v0, y1 = axis === 0 ? u1 : v1;
    if (axis === 1 ? theirs.nor[k * 4 + 1] <= 0 || level <= theirH[p] * S : y0 < theirH[p] * S || y1 <= y0) continue;
    // the columns of this piece it stands over (an upright face may lie on the edge between two)
    const xa = axis === 0 ? X(level) : Math.min(X(u0), X(u1)), xb = axis === 0 ? X(level) : Math.max(X(u0), X(u1)), za = axis === 2 ? Z(level) : Math.min(Z(v0), Z(v1)), zb = axis === 2 ? Z(level) : Math.max(Z(v0), Z(v1));
    const cx0 = Math.floor((xa - (axis === 0 ? 1 : 0)) / S), cx1 = Math.floor((xb - (axis === 0 ? 0 : 1)) / S), cz0 = Math.floor((za - (axis === 2 ? 1 : 0)) / S), cz1 = Math.floor((zb - (axis === 2 ? 0 : 1)) / S);
    if (cx0 < 0 || cz0 < 0 || cx1 >= n || cz1 >= n) continue;
    let under = Infinity;
    for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) under = Math.min(under, h[z * n + x] * S);
    picked.push(k); starts.push(Math.round(under) - SUNK);
  }
  if (!picked.length) return;
  const had = carried.faces, count = had ? had.geo.length / FACE_GEO : 0, extra = picked.length;
  const geo = new Int16Array((count + extra) * FACE_GEO), col = new Uint8Array((count + extra) * FACE_COL), nor = new Int8Array((count + extra) * 4), aims = new Int16Array((count + extra) * 2), aimCol = new Uint8Array((count + extra) * FACE_COL);
  if (had) { geo.set(had.geo); col.set(had.col); nor.set(had.nor); aims.set(had.aim!); aimCol.set(had.aimCol!); }
  /** two corners of each, where it starts and where it ends, for the ball round the mesh */
  const span: number[] = [];
  for (let m = 0; m < extra; m++) {
    const k = picked[m], g = k * FACE_GEO, at = count + m, o = at * FACE_GEO, start = starts[m];
    const kind = theirs.geo[g], axis = kind % FLIPPED, level = theirs.geo[g + 1], u0 = theirs.geo[g + 2], u1 = theirs.geo[g + 3], v0 = theirs.geo[g + 4], v1 = theirs.geo[g + 5];
    if (axis === 1) {
      geo.set([kind, start, X(u0), X(u1), Z(v0), Z(v1)], o); aims[at * 2] = Y(level);
      span.push(X(u0) / S, start / S, Z(v0) / S, X(u1) / S, Y(level) / S, Z(v1) / S);
    }
    else if (axis === 0) {
      geo.set([kind + RISES, X(level), start, start, Z(v0), Z(v1)], o); aims[at * 2] = Y(u0); aims[at * 2 + 1] = Y(u1);
      span.push(X(level) / S, start / S, Z(v0) / S, X(level) / S, Y(u1) / S, Z(v1) / S);
    }
    else {
      geo.set([kind + RISES, Z(level), X(u0), X(u1), start, start], o); aims[at * 2] = Y(v0); aims[at * 2 + 1] = Y(v1);
      span.push(X(u0) / S, start / S, Z(level) / S, X(u1) / S, Y(v1) / S, Z(level) / S);
    }
    for (let q = 0; q < FACE_COL; q++) col[at * FACE_COL + q] = aimCol[at * FACE_COL + q] = theirs.col[k * FACE_COL + q];
    for (let q = 0; q < 3; q++) nor[at * 4 + q] = theirs.nor[k * 4 + q];
    nor[at * 4 + 3] = 0;
  }
  carried.faces = { geo, col, nor, aim: aims, aimCol };
  carried.ball = both(had || carried.pos.length ? carried.ball as Ball | undefined : undefined, ballOf(span));
}

/** The column a triangle of a list lies on: that of its middle; `back`: taken a little against its direction (a sheet of falling water stands on its column's edge). */
function columnOf(n: number, pos: ArrayLike<number>, nor: ArrayLike<number>, t: number, back: number) {
  const o = t * 9, q = t * 12;
  const x = Math.floor((pos[o] + pos[o + 3] + pos[o + 6]) / 3 - back * Math.sign(nor[q])), z = Math.floor((pos[o + 2] + pos[o + 5] + pos[o + 8]) / 3 - back * Math.sign(nor[q + 2]));
  return Math.max(0, Math.min(n - 1, z)) * n + Math.max(0, Math.min(n - 1, x));
}
/** The level the water of a column of this piece ends at: the coarser step's where both have water above the sea, its own else. */
const endsAt = (surf: Float32Array, surface: Float32Array, i: number) => (surf[i] > SEA_Y + 0.01 && !Number.isNaN(surface[i]) ? surface[i] : surf[i]);

/**
 * The ground's lists are the banks of its water, which lie in the water's columns: each sinks out of sight, under
 * the land that comes there or under the water (what else is a list moves with its column).
 */
function ownBanks(c: Columns, land: Shape) {
  const n = c.n, from = c.from, aim = c.aim, way = c.way, surface = c.surface, wet = c.fine.wet, surf = c.fine.surf, pos = land.pos, nor = land.nor, banks = new Float32Array(pos.length / 3);
  for (let t = 0; t < banks.length / 3; t++) {
    const i = columnOf(n, pos, nor, t, 0), hide = way[i] === COMES ? aim[i] / S - UNDER_LAND : wet[i] ? endsAt(surf, surface, i) - UNDER_WATER : NaN;
    for (let q = 0; q < 3; q++) { const y = pos[(t * 3 + q) * 3 + 1]; banks[t * 3 + q] = Number.isNaN(hide) ? y + (aim[i] - from[i]) / S : Math.min(y, hide); }
  }
  if (banks.length) { land.sink = banks; wider(land, reach(pos, banks)); }
}
/**
 * The coarser piece's banks over this piece (`banked`, as that piece has them) come up to where that piece has
 * them: from under the land or the water that lies there now.
 */
function theirBanks(c: Columns, land: Shape, banked: Shape) {
  const n = c.n, fine = c.fine, parent = c.parent, h = c.h, wet = fine.wet, surf = fine.surf, pos = banked.pos as Float32Array, to = new Float32Array(pos.length / 3);
  for (let t = 0; t < to.length / 3; t++) {
    const o = t * 9;
    for (let q = 0; q < 3; q++) { pos[o + q * 3] = (pos[o + q * 3] + parent.ox) * 2 - fine.ox; pos[o + q * 3 + 2] = (pos[o + q * 3 + 2] + parent.oz) * 2 - fine.oz; to[t * 3 + q] = tall(pos[o + q * 3 + 1]); }
    // (the whole triangle under what lies there now: under the lowest of the columns it reaches over)
    let under = Infinity;
    const x0 = Math.floor(Math.min(pos[o], pos[o + 3], pos[o + 6]) + 1e-3), x1 = Math.floor(Math.max(pos[o], pos[o + 3], pos[o + 6]) - 1e-3), z0 = Math.floor(Math.min(pos[o + 2], pos[o + 5], pos[o + 8]) + 1e-3), z1 = Math.floor(Math.max(pos[o + 2], pos[o + 5], pos[o + 8]) - 1e-3);
    for (let z = Math.max(0, z0); z <= Math.min(n - 1, z1); z++) for (let x = Math.max(0, x0); x <= Math.min(n - 1, x1); x++) { const i = z * n + x; under = Math.min(under, wet[i] ? surf[i] - UNDER_WATER : h[i] - UNDER_LAND); }
    for (let q = 0; q < 3; q++) pos[o + q * 3 + 1] = Math.min(to[t * 3 + q], under);
  }
  if (to.length) join(land, banked, to);
}
/** Water above the sea's level: to the level the coarser step has it at, or out of sight under the land that comes. */
function raisedWater(c: Columns, raised: Shape) {
  const n = c.n, aim = c.aim, way = c.way, surface = c.surface, wet = c.fine.wet, surf = c.fine.surf, pos = raised.pos, nor = raised.nor, sink = new Float32Array(pos.length / 3);
  for (let t = 0; t < sink.length / 3; t++) {
    const i = columnOf(n, pos, nor, t, 0.25), by = wet[i] && !way[i] ? endsAt(surf, surface, i) - surf[i] : 0, hide = way[i] === COMES ? aim[i] / S - UNDER_LAND : Infinity;
    for (let q = 0; q < 3; q++) sink[t * 3 + q] = Math.min(pos[(t * 3 + q) * 3 + 1] + by, hide);
  }
  raised.sink = sink; wider(raised, reach(pos, sink));
}
/**
 * The water that is to stand where land sinks: the sea lies under the land from the start; water above the sea
 * lies under the land's top and comes to its level.
 */
function sinkingWater(c: Columns, sea: Shape, raised: Shape) {
  const n = c.n, fine = c.fine, own = fine.part, way = c.way, surface = c.surface, wet = Uint8Array.from(fine.wet), surf = Float32Array.from(fine.surf);
  // (the water is worked out for the stretch of the piece that holds such land, no more)
  const where = { x0: n, z0: n, x1: 0, z1: 0 };
  for (let z = own.z0; z < own.z1; z++) for (let x = own.x0; x < own.x1; x++) {
    const i = z * n + x;
    if (way[i] !== SINKS) continue;
    wet[i] = 1; surf[i] = surface[i];
    where.x0 = Math.min(where.x0, x); where.z0 = Math.min(where.z0, z); where.x1 = Math.max(where.x1, x + 1); where.z1 = Math.max(where.z1, z + 1);
  }
  if (where.x1 <= where.x0) return;
  const g: Ground = { h: fine.h, mat: fine.mat, wet, shore: fine.shore, occ: fine.occ, surf, ox: fine.ox, oz: fine.oz };
  for (const [shape, high] of [[sea, false], [raised, true]] as const) {
    const all = onGrid(n, () => buildWater(g, high, where)), { pos: at, nor: turned, col: tints } = all, picked = { pos: [] as number[], nor: [] as number[], col: [] as number[] };
    for (let o = 0; o < at.length; o += 9) {
      if (turned[o + 1] !== 1) continue;
      const i = Math.floor((at[o + 2] + at[o + 5] + at[o + 8]) / 3) * n + Math.floor((at[o] + at[o + 3] + at[o + 6]) / 3);
      if (way[i] !== SINKS) continue;
      for (let k = 0; k < 9; k++) { picked.pos.push(at[o + k]); picked.nor.push(turned[o + k]); picked.col.push(tints[o + k]); }
    }
    if (!picked.pos.length) continue;
    const sheets = small(picked);
    if (!high) { join(shape, sheets); continue; }
    const pos = sheets.pos as Float32Array, to = new Float32Array(pos.length / 3);
    for (let t = 0; t < to.length / 3; t++) {
      const o = t * 9, i = Math.floor((pos[o + 2] + pos[o + 5] + pos[o + 8]) / 3) * n + Math.floor((pos[o] + pos[o + 3] + pos[o + 6]) / 3);
      for (let q = 0; q < 3; q++) { to[t * 3 + q] = pos[o + q * 3 + 1]; pos[o + q * 3 + 1] = Math.min(pos[o + q * 3 + 1], c.h[i] - UNDER_LAND); }
    }
    join(shape, sheets, to);
  }
}
/**
 * What stands on the ground as a thing of its own goes with the top of its column and loses its height on the way:
 * the coarser step has no such things.
 */
function thingsDown(c: Columns, things: Shape) {
  const n = c.n, aim = c.aim, way = c.way, pos = things.pos, sink = new Float32Array(pos.length / 3);
  for (let v = 0; v < sink.length; v++) {
    const x = Math.max(0, Math.min(n - 1, Math.floor(pos[v * 3]))), z = Math.max(0, Math.min(n - 1, Math.floor(pos[v * 3 + 2])));
    sink[v] = way[z * n + x] ? aim[z * n + x] / S - UNDER_LAND : pos[v * 3 + 1];
  }
  things.sink = sink; wider(things, reach(pos, sink));
}

/**
 * Gives a piece its targets in the piece of the coarser step over it (see the head of the file): `shapes` are the
 * piece's meshes as the worker hands them over (small.ts `faced`, `small`), `fine` the table of its columns and
 * `parent` that of the coarser piece. The faces of the land get `aim` and `aimCol`, and the fourth byte of their
 * direction says whether the column they end up on is ground to the map's paper; the ground gets the tops and sides
 * that are to come and the coarser piece's banks, the water what is to stand where land sinks; the lists that move
 * get `sink`. Returns how many columns glide.
 */
export function glide(shapes: { ground: Shape; carried?: Shape; things?: Shape; water?: Shape; raised?: Shape }, fine: Table, parent: Table, bakedSky: boolean): number {
  const pn = parent.side, own = fine.part;
  // the coarser piece's own columns over this piece, drawn for their colours
  const qx = Math.floor((fine.ox + own.x0) / 2) - parent.ox, qz = Math.floor((fine.oz + own.z0) / 2) - parent.oz, wide = (own.x1 - own.x0) / 2, deep = (own.z1 - own.z0) / 2;
  if (qx < 1 || qz < 1 || qx + wide >= pn || qz + deep >= pn) return 0;
  const quarter = { x0: qx, z0: qz, x1: qx + wide, z1: qz + deep }, drawn = drawLand(parent, bakedSky, quarter);
  const above: Above = { side: pn, tops: new Float32Array(pn * pn * 12), has: new Uint8Array(pn * pn), ink: new Uint8Array(pn * pn), sides: new Map() };
  read(above, faced(drawn.ground).faces, 1);
  const theirCarried = drawn.carried ? faced(drawn.carried).faces : undefined;
  read(above, theirCarried, 0);

  const c = columnsOf(fine, parent, above);
  if (!c.gliding) return 0;
  aimFaces(c, shapes.ground, 127);
  aimFaces(c, shapes.carried, 0, true);
  if (!shapes.ground.faces?.aim) return c.gliding;
  comingFaces(c, shapes.ground);
  if (shapes.carried && theirCarried) comingCrowns(c, shapes.carried, theirCarried);

  // The lists: what is no face moves by the height each of its corners ends up at.
  if (c.water) {
    ownBanks(c, shapes.ground);
    theirBanks(c, shapes.ground, small(c.theirs ? drawBanks(parent, bakedSky, quarter) : new Batch()));
  }
  const raised = shapes.raised;
  if (raised?.pos.length) raisedWater(c, raised);
  if (c.coast && shapes.water && raised) sinkingWater(c, shapes.water, raised);
  if (shapes.things?.pos.length) thingsDown(c, shapes.things);
  return c.gliding;
}
