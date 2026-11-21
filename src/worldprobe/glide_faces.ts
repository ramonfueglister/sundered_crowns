// The faces of a piece on the glide (glide.ts): where each ends up and the colours it shows there, and the faces to
// come, the piece's own and the coarser piece's crowns.
import { Batch, type RGB } from '../lookprobe/batch';
import { FACE_COL, FACE_GEO, FACE_STEPS, FLIPPED, RISES, type Faces } from '../lookprobe/faces';
import type { Shape } from '../lookprobe/shape';
import { ballOf } from './ball';
import { sideAt, tone, topAt, topsTo, write } from './glide_above';
import { COMES, type Columns, SUNK, coarse, insideOf, tall } from './glide_columns';
import { type Ball, both, wider } from './glide_shape';
import { faced } from './small';

/** the four ways a column's side faces: +x, -x, +z, -z */
const WAYS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const S = FACE_STEPS;

/**
 * The faces of a mesh get where they end up and what they show there; `ink`: what the fourth byte of their direction
 * says where the coarser step does not say otherwise. Where the mesh is what the columns carry (`standing`), the faces
 * that lie inside a column, above its top (the crowns of a wood), go down into it: they end under its top, with no height.
 */
export function aimFaces(c: Columns, shape: Shape | undefined, ink: number, standing = false) {
  const f: Faces | undefined = shape?.faces;
  if (!f) return;
  const n = c.n,
    over = c.over,
    aim = c.aim,
    way = c.way,
    above = c.above,
    has = above.has,
    inked = above.ink,
    tops = above.tops,
    h = c.h,
    fox = c.fine.ox,
    foz = c.fine.oz,
    pox = c.parent.ox,
    poz = c.parent.oz;
  const geo = f.geo,
    nor = f.nor,
    count = geo.length / FACE_GEO,
    aims = new Int16Array(count * 2),
    cols = new Uint8Array(f.col);
  for (let k = 0, g = 0; k < count; k++, g += FACE_GEO) {
    const axis: number = geo[g] % FLIPPED,
      level: number = geo[g + 1],
      u0 = geo[g + 2],
      u1 = geo[g + 3],
      v0 = geo[g + 4],
      v1 = geo[g + 5],
      facing = nor[k * 4 + axis];
    // (a face that does not glide aims at where it is)
    aims[k * 2] = axis === 1 ? level : axis === 0 ? u0 : v0;
    aims[k * 2 + 1] = axis === 1 ? 0 : axis === 0 ? u1 : v1;
    nor[k * 4 + 3] = ink;
    const inner = standing ? insideOf(n, axis, level, u0, u1, v0, v1) : -1;
    if (inner >= 0) {
      if (
        way[inner] &&
        (axis === 1 ? facing > 0 && level > h[inner] * S : Math.min(aims[k * 2], aims[k * 2 + 1]) >= h[inner] * S)
      )
        aims[k * 2] = aims[k * 2 + 1] = aim[inner] - SUNK;
      if (axis === 1) aims[k * 2 + 1] = 0;
      continue;
    }
    if (axis === 1) {
      // the top of a column
      if (facing <= 0 || Math.abs(u1 - u0) !== S || Math.abs(v1 - v0) !== S) continue;
      const x = Math.min(u0, u1) / S,
        z = Math.min(v0, v1) / S,
        i = z * n + x;
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
    const y0 = axis === 0 ? u0 : v0,
      y1 = axis === 0 ? u1 : v1,
      a0 = axis === 0 ? v0 : u0,
      a1 = axis === 0 ? v1 : u1;
    const along = Math.floor(Math.min(a0, a1) / S),
      across: number = level / S - (facing > 0 ? 1 : 0);
    const x: number = axis === 0 ? across : along,
      z: number = axis === 0 ? along : across,
      d = facing > 0 ? 1 : -1,
      nx: number = axis === 0 ? x + d : x,
      nz: number = axis === 0 ? z : z + d;
    if (x < 0 || z < 0 || x >= n || z >= n || nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
    const i = z * n + x,
      j = nz * n + nx,
      top = h[i] * S,
      foot = h[j] * S;
    if ((!way[i] && !way[j]) || top <= foot || Math.min(y0, y1) < foot || Math.max(y0, y1) > top) continue;
    const span = (aim[i] - aim[j]) / (top - foot),
      to0 = Math.round(aim[j] + (y0 - foot) * span),
      to1 = Math.round(aim[j] + (y1 - foot) * span);
    aims[k * 2] = to0;
    aims[k * 2 + 1] = to1;
    // where the coarser step has a side here too, the face takes its colours
    const p = over[i];
    if (p < 0 || over[j] === p || aim[i] <= aim[j]) continue;
    const dir = axis === 0 ? (facing > 0 ? 0 : 1) : facing > 0 ? 2 : 3;
    for (let q = 0; q < 4; q++) {
      // (the corners in their order: (u0, v0), (u1, v0), (u1, v1), (u0, v1); a place along x or z of this piece's
      // ground, in 64ths, on the coarser piece's ground)
      const firstU = q === 0 || q === 3,
        firstV = q < 2,
        y = (axis === 0 ? firstU : firstV) ? to0 : to1,
        a = (axis === 0 ? firstV : firstU) ? a0 : a1;
      if (sideAt(above, p, dir, coarse(y), axis === 0 ? ((foz + a / S) / 2 - poz) * S : ((fox + a / S) / 2 - pox) * S))
        write(tone, cols, k * FACE_COL + q * 4);
    }
  }
  f.aim = aims;
  f.aimCol = cols;
  // (the ball round the mesh holds its faces all the way)
  let far = 0;
  for (let k = 0, g = 0; k < count; k++, g += FACE_GEO) {
    const axis = geo[g] % FLIPPED,
      lo = axis === 0 ? 2 : 4;
    far = Math.max(
      far,
      axis === 1
        ? Math.abs(aims[k * 2] - geo[g + 1])
        : Math.max(Math.abs(aims[k * 2] - geo[g + lo]), Math.abs(aims[k * 2 + 1] - geo[g + lo + 1])),
    );
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
export function comingFaces(c: Columns, land: Shape) {
  const ground = land.faces!,
    n = c.n,
    over = c.over,
    from = c.from,
    aim = c.aim,
    way = c.way,
    above = c.above,
    tints = above.tops,
    own = c.fine.part,
    wet = c.fine.wet,
    h = c.h,
    fox = c.fine.ox,
    foz = c.fine.oz,
    pox = c.parent.ox,
    poz = c.parent.oz;
  const more = new Batch(),
    tops: number[] = [],
    spans: {
      foot: number;
      top: number;
      footAim: number;
      topAim: number;
      /** the coarser column over the side's own, and that where the coarser step has a side here */
      owner: number;
      p: number;
      dir: number;
    }[] = [];
  for (let z = own.z0; z < own.z1; z++)
    for (let x = own.x0; x < own.x1; x++) {
      const i = z * n + x;
      if (way[i] === COMES) {
        more.quadAt(x, 0, z, x, 0, z + 1, x + 1, 0, z + 1, x + 1, 0, z, BLANK, BLANK, BLANK, BLANK, 0, 1, 0);
        tops.push(i);
      }
    }
  for (let z = own.z0; z < own.z1; z++)
    for (let x = own.x0; x < own.x1; x++) {
      const i = z * n + x,
        moves = way[i],
        water = wet[i];
      // (water that stays water has no sides, now or then)
      if (water && !moves) continue;
      for (let w = 0; w < 4; w++) {
        const dx = WAYS[w][0],
          dz = WAYS[w][1],
          nx = x + dx,
          nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const j = nz * n + nx;
        // (land that stands above its neighbour has its side already; a column of water has none: it gets one where
        // its bed lies above its neighbour's, which is gone when it ends no higher than that, and one where it ends above it)
        if ((!moves && !way[j]) || (water ? aim[i] <= aim[j] && from[i] <= from[j] : aim[i] <= aim[j] || h[i] > h[j]))
          continue;
        // the two top corners of this side, in the order that keeps the face turned outwards (terrain.ts)
        const ax = dx === 1 ? x + 1 : dx === -1 ? x : dz === 1 ? x : x + 1,
          az = dz === 1 ? z + 1 : dz === -1 ? z : dx === 1 ? z : z + 1;
        const bx = dx === 1 ? x + 1 : dx === -1 ? x : dz === 1 ? x + 1 : x,
          bz = dz === 1 ? z + 1 : dz === -1 ? z : dx === 1 ? z + 1 : z;
        more.quadAt(ax, 0, az, bx, 0, bz, bx, 1, bz, ax, 1, az, BLANK, BLANK, BLANK, BLANK, dx, 0, dz);
        spans.push({
          foot: from[j],
          top: from[i],
          footAim: aim[j],
          topAim: aim[i],
          owner: over[i],
          p: over[i] >= 0 && over[j] !== over[i] ? over[i] : -1,
          dir: w,
        });
      }
    }
  if (!(tops.length + spans.length)) return;
  const added = faced(more).faces!,
    extra = added.geo.length / FACE_GEO,
    theirs = added.geo,
    turned = added.nor;
  if (extra !== tops.length + spans.length) throw new Error('glide: a face to come that is no face');
  const count = ground.geo.length / FACE_GEO,
    geo = new Int16Array((count + extra) * FACE_GEO),
    col = new Uint8Array((count + extra) * FACE_COL),
    nor = new Int8Array((count + extra) * 4),
    aims = new Int16Array((count + extra) * 2),
    aimCol = new Uint8Array((count + extra) * FACE_COL);
  geo.set(ground.geo);
  col.set(ground.col);
  nor.set(ground.nor);
  aims.set(ground.aim!);
  aimCol.set(ground.aimCol!);
  /** two corners of each, where it starts and where it ends, for the ball round the mesh */
  const span: number[] = [];
  for (let k = 0; k < extra; k++) {
    const g = k * FACE_GEO,
      axis = theirs[g] % FLIPPED,
      at = count + k,
      o = at * FACE_GEO;
    for (let m = 0; m < FACE_GEO; m++) geo[o + m] = theirs[g + m];
    nor[at * 4] = turned[k * 4];
    nor[at * 4 + 1] = turned[k * 4 + 1];
    nor[at * 4 + 2] = turned[k * 4 + 2];
    nor[at * 4 + 3] = 127;
    if (k < tops.length) {
      // a top to come: in the colours of the coarser column's top; where that has none, a meadow's
      const i = tops[k],
        p = over[i],
        x = i % n,
        z = (i - x) / n;
      geo[o + 1] = from[i];
      aims[at * 2] = aim[i];
      span.push(x, from[i] / S, z, x + 1, aim[i] / S, z + 1);
      if (above.has[p]) {
        nor[at * 4 + 3] = above.ink[p] ? 127 : 0;
        topsTo(tints, aimCol, at * FACE_COL, p, fox + x, foz + z, x, z, geo[o + 2], geo[o + 3], geo[o + 4], geo[o + 5]);
      } else for (let q = 0; q < 4; q++) write(MEADOW, aimCol, at * FACE_COL + q * 4);
    } else {
      const lo = axis === 0 ? 2 : 4,
        side = spans[k - tops.length];
      // (the quad was made one block tall, its first corners at the foot: so the face's span in height runs upwards)
      if (theirs[g + lo] !== 0 || theirs[g + lo + 1] !== S) throw new Error('glide: a side that runs downwards');
      geo[o] += RISES;
      geo[o + lo] = side.foot;
      geo[o + lo + 1] = side.top;
      aims[at * 2] = side.footAim;
      aims[at * 2 + 1] = side.topAim;
      const across = theirs[g + 1] / S,
        a0 = theirs[g + (axis === 0 ? 4 : 2)] / S,
        a1 = theirs[g + (axis === 0 ? 5 : 3)] / S,
        low = Math.min(side.foot, side.footAim) / S,
        high = Math.max(side.top, side.topAim) / S;
      span.push(
        axis === 0 ? across : a0,
        low,
        axis === 0 ? a0 : across,
        axis === 0 ? across : a1,
        high,
        axis === 0 ? a1 : across,
      );
      // its colours: the coarser step's side there; where that has none, the coarser column's top, darker
      for (let q = 0; q < 4; q++) {
        const u = theirs[g + (q === 1 || q === 2 ? 3 : 2)],
          v = theirs[g + (q >= 2 ? 5 : 4)],
          y = (axis === 0 ? u : v) === 0 ? side.footAim : side.topAim,
          a = axis === 0 ? ((foz + v / S) / 2 - poz) * S : ((fox + u / S) / 2 - pox) * S;
        if (side.p < 0 || !sideAt(above, side.p, side.dir, coarse(y), a)) {
          if (side.owner >= 0 && above.has[side.owner]) topAt(tints, side.owner, 0.5, 0.5);
          else tone.fill(0.4);
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
export function comingCrowns(c: Columns, carried: Shape, theirs: Faces) {
  const n = c.n,
    h = c.h,
    theirH = c.theirH,
    pn = c.parent.side,
    shiftX = (2 * c.parent.ox - c.fine.ox) * S,
    shiftZ = (2 * c.parent.oz - c.fine.oz) * S;
  const X = (u: number) => 2 * u + shiftX,
    Z = (v: number) => 2 * v + shiftZ,
    Y = (y: number) => Math.round(tall(y / S) * S);
  const picked: number[] = [],
    starts: number[] = [];
  for (let k = 0, g = 0; g < theirs.geo.length; k++, g += FACE_GEO) {
    const kind = theirs.geo[g],
      axis = kind % FLIPPED,
      level = theirs.geo[g + 1],
      u0 = theirs.geo[g + 2],
      u1 = theirs.geo[g + 3],
      v0 = theirs.geo[g + 4],
      v1 = theirs.geo[g + 5];
    const p = kind < RISES ? insideOf(pn, axis, level, u0, u1, v0, v1) : -1;
    if (p < 0) continue;
    // (a crown's sides run upwards from its foot, as terrain.ts draws them)
    const y0 = axis === 0 ? u0 : v0,
      y1 = axis === 0 ? u1 : v1;
    if (axis === 1 ? theirs.nor[k * 4 + 1] <= 0 || level <= theirH[p] * S : y0 < theirH[p] * S || y1 <= y0) continue;
    // the columns of this piece it stands over (an upright face may lie on the edge between two)
    const xa = axis === 0 ? X(level) : Math.min(X(u0), X(u1)),
      xb = axis === 0 ? X(level) : Math.max(X(u0), X(u1)),
      za = axis === 2 ? Z(level) : Math.min(Z(v0), Z(v1)),
      zb = axis === 2 ? Z(level) : Math.max(Z(v0), Z(v1));
    const cx0 = Math.floor((xa - (axis === 0 ? 1 : 0)) / S),
      cx1 = Math.floor((xb - (axis === 0 ? 0 : 1)) / S),
      cz0 = Math.floor((za - (axis === 2 ? 1 : 0)) / S),
      cz1 = Math.floor((zb - (axis === 2 ? 0 : 1)) / S);
    if (cx0 < 0 || cz0 < 0 || cx1 >= n || cz1 >= n) continue;
    let under = Infinity;
    for (let z = cz0; z <= cz1; z++) for (let x = cx0; x <= cx1; x++) under = Math.min(under, h[z * n + x] * S);
    picked.push(k);
    starts.push(Math.round(under) - SUNK);
  }
  if (!picked.length) return;
  const had = carried.faces,
    count = had ? had.geo.length / FACE_GEO : 0,
    extra = picked.length;
  const geo = new Int16Array((count + extra) * FACE_GEO),
    col = new Uint8Array((count + extra) * FACE_COL),
    nor = new Int8Array((count + extra) * 4),
    aims = new Int16Array((count + extra) * 2),
    aimCol = new Uint8Array((count + extra) * FACE_COL);
  if (had) {
    geo.set(had.geo);
    col.set(had.col);
    nor.set(had.nor);
    aims.set(had.aim!);
    aimCol.set(had.aimCol!);
  }
  /** two corners of each, where it starts and where it ends, for the ball round the mesh */
  const span: number[] = [];
  for (let m = 0; m < extra; m++) {
    const k = picked[m],
      g = k * FACE_GEO,
      at = count + m,
      o = at * FACE_GEO,
      start = starts[m];
    const kind = theirs.geo[g],
      axis = kind % FLIPPED,
      level = theirs.geo[g + 1],
      u0 = theirs.geo[g + 2],
      u1 = theirs.geo[g + 3],
      v0 = theirs.geo[g + 4],
      v1 = theirs.geo[g + 5];
    if (axis === 1) {
      geo.set([kind, start, X(u0), X(u1), Z(v0), Z(v1)], o);
      aims[at * 2] = Y(level);
      span.push(X(u0) / S, start / S, Z(v0) / S, X(u1) / S, Y(level) / S, Z(v1) / S);
    } else if (axis === 0) {
      geo.set([kind + RISES, X(level), start, start, Z(v0), Z(v1)], o);
      aims[at * 2] = Y(u0);
      aims[at * 2 + 1] = Y(u1);
      span.push(X(level) / S, start / S, Z(v0) / S, X(level) / S, Y(u1) / S, Z(v1) / S);
    } else {
      geo.set([kind + RISES, Z(level), X(u0), X(u1), start, start], o);
      aims[at * 2] = Y(v0);
      aims[at * 2 + 1] = Y(v1);
      span.push(X(u0) / S, start / S, Z(level) / S, X(u1) / S, Y(v1) / S, Z(level) / S);
    }
    for (let q = 0; q < FACE_COL; q++)
      col[at * FACE_COL + q] = aimCol[at * FACE_COL + q] = theirs.col[k * FACE_COL + q];
    for (let q = 0; q < 3; q++) nor[at * 4 + q] = theirs.nor[k * 4 + q];
    nor[at * 4 + 3] = 0;
  }
  carried.faces = { geo, col, nor, aim: aims, aimCol };
  carried.ball = both(had || carried.pos.length ? (carried.ball as Ball | undefined) : undefined, ballOf(span));
}
