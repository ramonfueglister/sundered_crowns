// The glide from a step of the map to the next coarser one. A coarser step has blocks twice as wide: where the view
// changed steps, every hill, wood and town of the picture changed its shape at once, and the land its grain. Now a
// piece of a far step knows what the piece of the coarser step over it shows at each of its columns, the height of
// the coarser column there and the colours of its top, and over the last stretch before the border the stage moves
// each column towards that (stage.ts `glides`, pieces.ts `GLIDE`): four columns close up into the one block that
// takes their place. At the border the piece shows what the coarser piece shows, column for column, so the change of
// steps changes nothing on the land. A view at rest anywhere in that stretch shows one step, with its columns part
// of the way: nothing is drawn twice. (Continuous distance-dependent level of detail, Strugar 2009, does the same for
// a height field: a vertex moves to where the coarser mesh has it before the meshes change places.)
//
// What glides: the tops of the land's columns and what they carry, their sides, and the colours of both. Between two
// columns that the coarser step sets apart in height a side is added that has no height until they part. What stays
// as it is and changes at the border, in the short dissolve as before (pieces.ts): water and its banks, and columns
// that are land in one step and water in the other.
//
// The targets are worked out where the piece is built, from the tables of the two pieces (table.ts): the coarser one
// has a table built ahead, and the part of it that lies over the piece is drawn here for its colours.
import { Batch, type RGB } from '../lookprobe/batch';
import { FACE_COL, FACE_GEO, FACE_STEPS, FLIPPED, RISES, type Faces } from '../lookprobe/faces';
import { SEA_Y } from '../lookprobe/layout';
import type { Shape } from '../lookprobe/stage';
import { BRIGHTEST, faced } from './small';
import { type Table, drawLand } from './table';
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
    // a side: the column behind it, the way it faces, its span along the edge and in height
    const us = [u0, u1, u1, u0], vs = [v0, v0, v1, v1], ys = axis === 0 ? us : vs, as = axis === 0 ? vs : us, a0 = Math.min(...as), a1 = Math.max(...as), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const along = Math.floor(a0 / S), across = level / S - (way > 0 ? 1 : 0), x = axis === 0 ? across : along, z = axis === 0 ? along : across;
    const at = (low: boolean, first: boolean): RGB => { for (let c = 0; c < 4; c++) if ((ys[c] === y0) === low && (as[c] === a0) === first) return shown(f.col, k * FACE_COL + c * 4); return [0, 0, 0]; };
    const key = (z * above.side + x) * 4 + (axis === 0 ? (way > 0 ? 0 : 1) : way > 0 ? 2 : 3);
    let list = above.sides.get(key);
    if (!list) above.sides.set(key, list = []);
    list.push({ a0, a1, y0, y1, foot: [at(true, true), at(true, false)], top: [at(false, true), at(false, false)] });
  }
}

/**
 * Gives the faces of a piece's land their targets in the piece of the coarser step over it (see the head of the
 * file): `shapes` are the piece's ground and what its columns carry, as faces (small.ts `faced`), `fine` the table of
 * its columns and `parent` that of the coarser piece. The faces get `aim` and `aimCol`, and the fourth byte of their
 * direction says whether the column they end up on is ground to the map's paper; the ground gets the sides that are
 * to come. Returns how many columns glide.
 */
export function glide(shapes: { ground: Shape; carried?: Shape }, fine: Table, parent: Table, bakedSky: boolean): number {
  const n = fine.side, pn = parent.side, own = fine.part;
  // the coarser piece's own columns over this piece, drawn for their colours
  const qx = Math.floor((fine.ox + own.x0) / 2) - parent.ox, qz = Math.floor((fine.oz + own.z0) / 2) - parent.oz, wide = (own.x1 - own.x0) / 2, deep = (own.z1 - own.z0) / 2;
  if (qx < 1 || qz < 1 || qx + wide >= pn || qz + deep >= pn) return 0;
  const drawn = drawLand(parent, bakedSky, { x0: qx, z0: qz, x1: qx + wide, z1: qz + deep });
  const above: Above = { side: pn, tops: new Float32Array(pn * pn * 12), has: new Uint8Array(pn * pn), ink: new Uint8Array(pn * pn), sides: new Map() };
  read(above, faced(drawn.ground).faces, 1);
  if (drawn.carried) read(above, faced(drawn.carried).faces, 0);

  // where each column of the piece, and one round it, goes: the coarser column over it and its height there in
  // 64ths of this piece's blocks; a column under water, or with water over it, stays
  const over = new Int32Array(n * n).fill(-1), aim = new Int32Array(n * n), moves = new Uint8Array(n * n);
  let gliding = 0;
  for (let z = Math.max(0, own.z0 - 1); z < Math.min(n, own.z1 + 1); z++) for (let x = Math.max(0, own.x0 - 1); x < Math.min(n, own.x1 + 1); x++) {
    const i = z * n + x, px = Math.floor((fine.ox + x) / 2) - parent.ox, pz = Math.floor((fine.oz + z) / 2) - parent.oz, p = pz * pn + px;
    aim[i] = fine.h[i] * S;
    if (px < 0 || pz < 0 || px >= pn || pz >= pn || fine.wet[i] || parent.wet[p]) continue;
    over[i] = p; moves[i] = 1; aim[i] = Math.round((SEA_Y + (parent.h[p] - SEA_Y) * TALLER) * S);
    if (x >= own.x0 && x < own.x1 && z >= own.z0 && z < own.z1) gliding++;
  }
  if (!gliding) return 0;
  /** a height of this piece, in 64ths, as the coarser piece counts it */
  const coarse = (y: number) => (SEA_Y + (y / S - SEA_Y) / TALLER) * S;
  /** a place along x or z of this piece's ground, in 64ths, on the coarser piece's ground */
  const alongX = (a: number) => ((fine.ox + a / S) / 2 - parent.ox) * S, alongZ = (a: number) => ((fine.oz + a / S) / 2 - parent.oz) * S;
  /** the colour the coarser piece's side of a column shows at a height and a place along its edge, into `tone`; false where it has no side there */
  const sideAt = (p: number, way: number, y: number, a: number): boolean => {
    const list = above.sides.get(p * 4 + way);
    if (!list) return false;
    let best = list[0], miss = Infinity;
    for (const s of list) { const d = Math.max(0, s.y0 - y, y - s.y1) + Math.max(0, s.a0 - a, a - s.a1) * 4; if (d < miss) { miss = d; best = s; } }
    const t = best.y1 > best.y0 ? Math.max(0, Math.min(1, (y - best.y0) / (best.y1 - best.y0))) : 0, s = best.a1 > best.a0 ? Math.max(0, Math.min(1, (a - best.a0) / (best.a1 - best.a0))) : 0;
    for (let k = 0; k < 3; k++) tone[k] = (best.foot[0][k] * (1 - s) + best.foot[1][k] * s) * (1 - t) + (best.top[0][k] * (1 - s) + best.top[1][k] * s) * t;
    return true;
  };
  /** the colour of the coarser column's top at a point of it (s along x, t along z, 0 … 1), into `tone`: as its two triangles show it */
  const topAt = (p: number, s: number, t: number) => {
    const tops = above.tops;
    for (let k = 0, o = p * 12; k < 3; k++, o++) {
      const a = tops[o], d = tops[o + 3], c = tops[o + 6], b = tops[o + 9];
      tone[k] = t >= s ? a + s * (c - b) + t * (b - a) : a + s * (d - a) + t * (c - d);
    }
  };

  const meshes: [Shape | undefined, number][] = [[shapes.ground, 127], [shapes.carried, 0]];
  for (const [shape, ink] of meshes) {
    const f: Faces | undefined = shape?.faces;
    if (!f) continue;
    const count = f.geo.length / FACE_GEO, aims = new Int16Array(count * 2), cols = new Uint8Array(f.col);
    for (let k = 0, g = 0; k < count; k++, g += FACE_GEO) {
      const axis: number = f.geo[g] % FLIPPED, level: number = f.geo[g + 1], u0 = f.geo[g + 2], u1 = f.geo[g + 3], v0 = f.geo[g + 4], v1 = f.geo[g + 5], way = f.nor[k * 4 + axis];
      // (a face that does not glide aims at where it is)
      aims[k * 2] = axis === 1 ? level : axis === 0 ? u0 : v0; aims[k * 2 + 1] = axis === 1 ? 0 : axis === 0 ? u1 : v1;
      f.nor[k * 4 + 3] = ink;
      if (axis === 1) {
        // the top of a column
        if (way <= 0 || Math.abs(u1 - u0) !== S || Math.abs(v1 - v0) !== S) continue;
        const x = Math.min(u0, u1) / S, z = Math.min(v0, v1) / S, i = z * n + x;
        if (x < 0 || z < 0 || x >= n || z >= n || !moves[i] || level !== fine.h[i] * S) continue;
        aims[k * 2] = aim[i];
        const p = over[i];
        if (!above.has[p]) continue;
        f.nor[k * 4 + 3] = above.ink[p] ? 127 : 0;
        // (the coarser column is two of this piece's wide: the corner's place on it)
        const sx = (fine.ox + x) & 1, sz = (fine.oz + z) & 1;
        for (let c = 0; c < 4; c++) { topAt(p, (sx + ((c === 1 || c === 2 ? u1 : u0) > x * S ? 1 : 0)) / 2, (sz + ((c >= 2 ? v1 : v0) > z * S ? 1 : 0)) / 2); write(tone, cols, k * FACE_COL + c * 4); }
        continue;
      }
      // a side: between the column behind it and the one it faces, it keeps its share of the way from one's top to
      // the other's (its span in height is u on a face across x, v on one across z; the other is its span along the edge)
      const y0 = axis === 0 ? u0 : v0, y1 = axis === 0 ? u1 : v1, a0 = axis === 0 ? v0 : u0, a1 = axis === 0 ? v1 : u1;
      const along = Math.floor(Math.min(a0, a1) / S), across: number = level / S - (way > 0 ? 1 : 0);
      const x: number = axis === 0 ? across : along, z: number = axis === 0 ? along : across, d = way > 0 ? 1 : -1, nx: number = axis === 0 ? x + d : x, nz: number = axis === 0 ? z : z + d;
      if (x < 0 || z < 0 || x >= n || z >= n || nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const i = z * n + x, j = nz * n + nx, top = fine.h[i] * S, foot = fine.h[j] * S;
      if ((!moves[i] && !moves[j]) || top <= foot || Math.min(y0, y1) < foot || Math.max(y0, y1) > top) continue;
      const span = (aim[i] - aim[j]) / (top - foot), to0 = Math.round(aim[j] + (y0 - foot) * span), to1 = Math.round(aim[j] + (y1 - foot) * span);
      aims[k * 2] = to0; aims[k * 2 + 1] = to1;
      // where the coarser step has a side here too, the face takes its colours
      const p = over[i];
      if (p < 0 || over[j] === p || aim[i] <= aim[j]) continue;
      const dir = axis === 0 ? (way > 0 ? 0 : 1) : way > 0 ? 2 : 3;
      for (let c = 0; c < 4; c++) {
        // (the corners in their order: (u0, v0), (u1, v0), (u1, v1), (u0, v1))
        const firstU = c === 0 || c === 3, firstV = c < 2, y = (axis === 0 ? firstU : firstV) ? to0 : to1, a = (axis === 0 ? firstV : firstU) ? a0 : a1;
        if (sideAt(p, dir, coarse(y), axis === 0 ? alongZ(a) : alongX(a))) write(tone, cols, k * FACE_COL + c * 4);
      }
    }
    f.aim = aims; f.aimCol = cols;
  }

  // the sides to come: where the coarser step sets a column above its neighbour and this one does not, a side of
  // no height that rises as the two part (a column of the piece against any neighbour, as terrain.ts draws its sides)
  const ground = shapes.ground.faces;
  if (!ground?.aim) return gliding;
  const more = new Batch(), spans: { foot: number; top: number; footAim: number; topAim: number; /** the coarser column over the side's own, and that where the coarser step has a side here */ owner: number; p: number; way: number }[] = [];
  for (let z = own.z0; z < own.z1; z++) for (let x = own.x0; x < own.x1; x++) {
    const i = z * n + x;
    if (fine.wet[i]) continue;
    for (let w = 0; w < 4; w++) {
      const [dx, dz] = WAYS[w], nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const j = nz * n + nx;
      if ((!moves[i] && !moves[j]) || aim[i] <= aim[j] || fine.h[i] > fine.h[j]) continue;
      // the two top corners of this side, in the order that keeps the face turned outwards (terrain.ts)
      const ax = dx === 1 ? x + 1 : dx === -1 ? x : dz === 1 ? x : x + 1, az = dz === 1 ? z + 1 : dz === -1 ? z : dx === 1 ? z : z + 1;
      const bx = dx === 1 ? x + 1 : dx === -1 ? x : dz === 1 ? x + 1 : x, bz = dz === 1 ? z + 1 : dz === -1 ? z : dx === 1 ? z + 1 : z;
      more.quad([ax, 0, az], [bx, 0, bz], [bx, 1, bz], [ax, 1, az], [1, 1, 1], [dx, 0, dz]);
      spans.push({ foot: fine.h[j] * S, top: fine.h[i] * S, footAim: aim[j], topAim: aim[i], owner: over[i], p: over[i] >= 0 && over[j] !== over[i] ? over[i] : -1, way: w });
    }
  }
  if (!spans.length) return gliding;
  const added = faced(more).faces!, extra = added.geo.length / FACE_GEO;
  if (extra !== spans.length) throw new Error('glide: a side that is no face');
  const count = ground.geo.length / FACE_GEO, geo = new Int16Array((count + extra) * FACE_GEO), col = new Uint8Array((count + extra) * FACE_COL), nor = new Int8Array((count + extra) * 4), aims = new Int16Array((count + extra) * 2), aimCol = new Uint8Array((count + extra) * FACE_COL);
  geo.set(ground.geo); col.set(ground.col); nor.set(ground.nor); aims.set(ground.aim); aimCol.set(ground.aimCol!);
  for (let k = 0; k < extra; k++) {
    const g = k * FACE_GEO, axis = added.geo[g] % FLIPPED, lo = axis === 0 ? 2 : 4, span = spans[k], at = count + k, o = at * FACE_GEO;
    // (the quad was made one block tall, its first corners at the foot: so the face's span in height runs upwards)
    if (added.geo[g + lo] !== 0 || added.geo[g + lo + 1] !== S) throw new Error('glide: a side that runs downwards');
    geo.set(added.geo.subarray(g, g + FACE_GEO), o);
    geo[o] += RISES; geo[o + lo] = span.foot; geo[o + lo + 1] = span.top;
    aims[at * 2] = span.footAim; aims[at * 2 + 1] = span.topAim;
    nor.set(added.nor.subarray(k * 4, k * 4 + 3), at * 4); nor[at * 4 + 3] = 127;
    // its colours: the coarser step's side there; where that has none, the coarser column's top, darker
    const us = [added.geo[g + 2], added.geo[g + 3], added.geo[g + 3], added.geo[g + 2]], vs = [added.geo[g + 4], added.geo[g + 4], added.geo[g + 5], added.geo[g + 5]];
    for (let c = 0; c < 4; c++) {
      const y = (axis === 0 ? us[c] : vs[c]) === 0 ? span.footAim : span.topAim, a = axis === 0 ? alongZ(vs[c]) : alongX(us[c]);
      if (span.p < 0 || !sideAt(span.p, span.way, coarse(y), a)) {
        if (span.owner >= 0 && above.has[span.owner]) topAt(span.owner, 0.5, 0.5); else tone.fill(0.4);
        for (let m = 0; m < 3; m++) tone[m] *= 0.7;
      }
      write(tone, aimCol, at * FACE_COL + c * 4);
    }
    col.set(aimCol.subarray(at * FACE_COL, (at + 1) * FACE_COL), at * FACE_COL);
  }
  shapes.ground.faces = { geo, col, nor, aim: aims, aimCol };
  return gliding;
}
