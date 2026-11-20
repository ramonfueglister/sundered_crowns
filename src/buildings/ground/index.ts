// The fine ground of the near view: what the reference class shows between the houses and the water, built from
// fine blocks (houses/style.ts VOXEL) on top of the whole-block ground of the world. A pure function per cell: it
// reads the columns of its cell through `at` and builds into a batch in the piece's coordinates, never beyond the
// cell's rectangle and never above a column's top (a pane a hundredth of a block over the paving is all), so that
// the houses and figures keep standing where they stand. Everything random comes from world coordinates, so that
// paving bonds, steps and posts agree across cell borders.
//
// Parts: paving slabs on paved columns; the quay wall where a dry column meets the water (stone blocks in running
// bond under a pale coping) and where it meets a dry column a step lower (the rim of a quay a block under the town,
// as the world's layout lays it); a flight of water steps every so often along a straight quay, and mooring posts along
// it (a tradition's `quay`: the measures of Venice by assumption, see traditions/measures/venedig_1356.json "kai").
// The water keeps its own surface and material; `waterColourAt` gives the near view's colour of it at a point.
import { type Batch, type RGB, hash2, rgb, shade } from '../../lookprobe/batch';
import { type Side, pane, wallOf } from '../core/wall';
import { VOXEL as V } from '../houses/style';
import type { Quay } from '../traditions/tradition';

/** One column of the world's ground as the kit needs it: the height of its top, whether it is water, whether it is paved. */
export interface Column {
  top: number;
  wet: boolean;
  paved: boolean;
}

/** A cell of a piece: its corner and size in blocks, the piece's world offset (for seeds), the water's level. */
export interface GroundCell {
  x0: number;
  z0: number;
  size: number;
  ox: number;
  oz: number;
  water: number;
}

/** The column at a block, or null outside the piece. */
export type ColumnAt = (x: number, z: number) => Column | null;

/** Where no tradition says otherwise: the quay of Venice's measures (assumption, as there). */
export const PLAIN_QUAY: Quay = {
  wall: rgb(0xcdbba4),
  coping: rgb(0xe8dcc4),
  paving: rgb(0xe2c296),
  post: rgb(0x8a5a34),
  stepsEvery: [8, 14],
  postEvery: [1.5, 1.8],
};

/** how far a pane of the kit stands off the ground or the wall it lies on, in blocks: under a pixel at the near zoom */
const LIFT = 0.006;
/** the quay wall reaches this far under the water's surface */
const UNDER = 0.5;

const OUT: readonly [Side, number, number][] = [
  ['px', 1, 0],
  ['nx', -1, 0],
  ['pz', 0, 1],
  ['nz', 0, -1],
];

/**
 * Builds the fine ground of a cell into `b`. `at` gives the columns; the cell's own columns and their neighbours
 * one block beyond it are read, nothing is drawn beyond it.
 */
export function fineGround(b: Batch, cell: GroundCell, at: ColumnAt, q: Quay = PLAIN_QUAY) {
  const { x0, z0, size, ox, oz } = cell,
    x1 = x0 + size,
    z1 = z0 + size;
  for (let z = z0; z < z1; z++)
    for (let x = x0; x < x1; x++) {
      const c = at(x, z);
      if (!c || c.wet) continue;
      const wx = x + ox,
        wz = z + oz;
      if (c.paved) slabs(b, x, z, c.top, wx, wz, q.paving, (q.joint ?? 0) * V, q.spread);
      for (const [side, dx, dz] of OUT) {
        const n = at(x + dx, z + dz);
        if (!n) continue;
        if (!n.wet) {
          // a dry column a step lower (the rim of a quay, a terrace): the same stone face down to its top, no posts
          if (n.top < c.top - 1e-3) quayWall(b, x, z, side, c.top, n.top, wx, wz, q);
          continue;
        }
        // a dry column beside the water: the quay wall on that side, its coping along the top edge
        quayWall(b, x, z, side, c.top, cell.water - UNDER, wx, wz, q);
        // a mooring post or a flight of steps along this edge, where the edge is long enough to be a quay (the two
        // columns along the edge are dry and have the water on the same side)
        const [ux, uz] = dx ? [0, 1] : [1, 0],
          straight =
            at(x - ux, z - uz)?.wet === false &&
            at(x - ux + dx, z - uz + dz)?.wet &&
            at(x + ux, z + uz)?.wet === false &&
            at(x + ux + dx, z + uz + dz)?.wet;
        if (!straight) continue;
        const along = dx ? wz : wx,
          across = dx ? wx : wz;
        // steps: into the water column, which must lie inside the cell; one flight every stepsEvery blocks of this edge
        const every =
          q.stepsEvery[0] +
          (q.stepsEvery[1] - q.stepsEvery[0]) * hash2(across, side === 'px' || side === 'pz' ? 1 : 2, 7);
        const inCell = x + dx >= x0 && x + dx < x1 && z + dz >= z0 && z + dz < z1;
        if (inCell && Math.floor(along / every) !== Math.floor((along - 1) / every))
          steps(b, x, z, dx, dz, c.top, cell.water, q);
        else posts(b, x, z, dx, dz, c.top, wx, wz, q);
      }
    }
}

/**
 * The paving of one column: slabs of two by two fine blocks in running bond, aligned to the world grid; `gap` apart
 * where the ground under them shows as the joints.
 */
function slabs(b: Batch, x: number, z: number, y: number, wx: number, wz: number, c: RGB, gap = 0, spread?: number) {
  const S = 2 * V,
    k0 = Math.floor(wz / S),
    k1 = Math.ceil((wz + 1) / S),
    yy = y + LIFT;
  for (let k = k0; k < k1; k++) {
    const az = Math.max(wz, k * S),
      bz = Math.min(wz + 1, (k + 1) * S),
      off = (k % 2 === 0 ? 0 : 0.5) * S;
    if (bz <= az) continue;
    for (let j = Math.floor((wx - off) / S); j * S + off < wx + 1; j++) {
      const ax = Math.max(wx, j * S + off),
        bx = Math.min(wx + 1, (j + 1) * S + off);
      if (bx <= ax) continue;
      const h = hash2(j, k, 3),
        lit = h < 0.08 ? 0.84 : 0.92 + 0.16 * h,
        col = shade(c, spread === undefined ? lit : 1 + (lit - 1) * spread),
        g = gap / 2;
      b.quad(
        [ax - wx + x + g, yy, az - wz + z + g],
        [ax - wx + x + g, yy, bz - wz + z - g],
        [bx - wx + x - g, yy, bz - wz + z - g],
        [bx - wx + x - g, yy, az - wz + z + g],
        col,
        [0, 1, 0],
      );
    }
  }
}

/** The quay wall on one side of a column, from `top` down to `y0`: stone blocks of two by one fine blocks in running bond, a pale coping on top. */
function quayWall(
  b: Batch,
  x: number,
  z: number,
  side: Side,
  top: number,
  y0: number,
  wx: number,
  wz: number,
  q: Quay,
) {
  const w = wallOf(x, z, x + 1, z + 1, side),
    rows = Math.ceil((top - y0) / V),
    along = side === 'px' || side === 'nx' ? wz : wx;
  // the joints: a darker pane behind the blocks, so that the courses read on the lit faces too (in the picture of the
  // game the sunlit quay was one plain face: the block's own ground showed through the joints in the same tone)
  pane(b, w, 0, y0, w.len, top, shade(q.wall, 0.78), LIFT * 0.5);
  for (let k = 0; k < rows; k++) {
    const yb = top - (k + 1) * V,
      yt = top - k * V,
      off = (k % 2) * V;
    if (k === 0) {
      pane(b, w, 0, yb + V * 0.05, w.len, yt, q.coping, LIFT);
      continue;
    }
    for (let j = -1; j * 2 * V + off < w.len; j++) {
      const t0 = Math.max(0, j * 2 * V + off + V * 0.05),
        t1 = Math.min(w.len, (j + 1) * 2 * V + off - V * 0.05);
      if (t1 <= t0) continue;
      pane(
        b,
        w,
        t0,
        Math.max(y0, yb + V * 0.05),
        t1,
        yt - V * 0.05,
        shade(
          q.wall,
          0.9 +
            0.16 *
              hash2(
                Math.floor(along * 8) + j * 3,
                k,
                21 + (side === 'px' ? 1 : side === 'nx' ? 2 : side === 'pz' ? 3 : 4),
              ),
        ),
        LIFT,
      );
    }
  }
}

/** Mooring posts along the water's edge of a column, set back a third of a block from it, every postEvery blocks. */
function posts(b: Batch, x: number, z: number, dx: number, dz: number, top: number, wx: number, wz: number, q: Quay) {
  const along = dx ? wz : wx,
    every = q.postEvery[0] + (q.postEvery[1] - q.postEvery[0]) * hash2(dx ? wx : wz, 5, 9),
    s = V * 0.4;
  for (let t = Math.ceil((along - 0.3) / every) * every; t < along + 1 - 0.3; t += every) {
    const u = t - along,
      px = dx ? x + (dx > 0 ? 1 - 0.35 : 0.35) : x + u,
      pz = dz ? z + (dz > 0 ? 1 - 0.35 : 0.35) : z + u;
    if (u < s || u > 1 - s) continue;
    b.box(px - s, top, pz - s, px + s, top + 2 * V, pz + s, q.post, { top: shade(q.post, 1.3), foot: 0.85 });
  }
}

/** A flight of water steps down from a column's edge into the wet column beside it, one fine block a step, as wide as the column. */
function steps(b: Batch, x: number, z: number, dx: number, dz: number, top: number, water: number, q: Quay) {
  const n = Math.max(1, Math.round((top - water) / V)),
    drop = (top - water) / n;
  for (let k = 0; k < n; k++) {
    const o0 = k * V,
      o1 = (k + 1) * V,
      yt = top - (k + 1) * drop,
      yb = water - UNDER;
    const ax = dx > 0 ? x + 1 + o0 : dx < 0 ? x - o1 : x + 0.1,
      bx = dx > 0 ? x + 1 + o1 : dx < 0 ? x - o0 : x + 0.9;
    const az = dz > 0 ? z + 1 + o0 : dz < 0 ? z - o1 : z + 0.1,
      bz = dz > 0 ? z + 1 + o1 : dz < 0 ? z - o0 : z + 0.9;
    b.box(ax, yb, az, bx, yt, bz, shade(q.wall, 0.97 - 0.01 * k), { top: q.coping, foot: 0.9 });
  }
}

/** The near view's colours of the water: deep, surface, and the ripple's pale (Venice's lagoon, measured against the reference class). */
export const LAGOON: RGB = rgb(0x009c9e),
  DEEP: RGB = rgb(0x00706a),
  RIPPLE: RGB = rgb(0x40c8cc);

/**
 * The colour of the water's surface at a world point in the near view: broad bands a touch lighter or darker
 * lying level on the picture (along the picture's right, (0.686, -0.728) on the ground), as on the reference
 * class, over the base colour. For the corners of the water's own quads.
 */
export function waterColourAt(wx: number, wz: number, base: RGB = LAGOON): RGB {
  const band = Math.floor((wx * 0.686 - wz * 0.728) / 1.5);
  return shade(base, 0.84 + 0.26 * hash2(band, 0, 11) + 0.06 * hash2(Math.floor(wx), Math.floor(wz), 9));
}

/**
 * The flecks of the near view's water for a cell, as the reference class has them everywhere: short pale streaks
 * lying level on the picture and small dark and light spots, a tenth of a block across, as quads a hair over the
 * surface of the wet columns. For a page that draws its water in one mesh; the world's water, which mirrors, may
 * prefer `waterColourAt` alone.
 */
export function waterFlecks(b: Batch, cell: GroundCell, at: ColumnAt, perBlock = { streaks: 0.3, spots: 0.2 }) {
  const { x0, z0, size, ox, oz } = cell,
    y = cell.water + LIFT,
    t = V * 0.3;
  for (let z = z0; z < z0 + size; z++)
    for (let x = x0; x < x0 + size; x++) {
      if (!at(x, z)?.wet) continue;
      const wx = x + ox,
        wz = z + oz;
      for (let k = 0; k < 4; k++) {
        const h = hash2(wx, wz, 100 + k);
        if (h < perBlock.streaks / 4) {
          // a streak along the picture's right, cut where it would leave its column
          const sx = x + 0.1 + 0.7 * hash2(wx, wz, 120 + k),
            sz = z + 0.1 + 0.7 * hash2(wx, wz, 130 + k),
            dark = hash2(wx, wz, 140 + k) < 0.3;
          const l = Math.min(0.3 + 0.8 * hash2(wx, wz, 110 + k), (x + 0.94 - sx) / 0.686, (sz - z - 0.06) / 0.728),
            ex = sx + 0.686 * l,
            ez = sz - 0.728 * l;
          const px = 0.728 * t,
            pz = 0.686 * t,
            col = dark
              ? shade(DEEP, 0.9 + 0.2 * hash2(wx, wz, 150 + k))
              : shade(RIPPLE, 0.85 + 0.25 * hash2(wx, wz, 150 + k));
          if (l > 0.1)
            b.quad(
              [sx - px, y, sz - pz],
              [sx + px, y, sz + pz],
              [ex + px, y, ez + pz],
              [ex - px, y, ez - pz],
              col,
              [0, 1, 0],
            );
        } else if (h < perBlock.streaks / 4 + perBlock.spots / 4) {
          const s = 0.06 + 0.08 * hash2(wx, wz, 160 + k),
            sx = x + 0.05 + (0.93 - 1.6 * s) * hash2(wx, wz, 170 + k),
            sz = z + 0.05 + (0.93 - s) * hash2(wx, wz, 180 + k),
            dark = hash2(wx, wz, 190 + k) < 0.75;
          b.quad(
            [sx, y, sz],
            [sx, y, sz + s],
            [sx + s * 1.6, y, sz + s],
            [sx + s * 1.6, y, sz],
            dark
              ? shade(DEEP, 0.7 + 0.25 * hash2(wx, wz, 200 + k))
              : shade(RIPPLE, 0.9 + 0.15 * hash2(wx, wz, 200 + k)),
            [0, 1, 0],
          );
        }
      }
    }
}
