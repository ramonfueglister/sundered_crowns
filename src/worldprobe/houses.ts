// The houses of the near view as the far steps draw them (far.ts HOUSES_UNTIL): each where it stands and as large as
// it is, its walls in its own colour under a roof of its own tiles, with the gables or the hips the near view gives
// it. What a house of the far steps leaves out is what is smaller than a dot of their picture: windows, doors, bands,
// the rows of tiles, chimneys and dormers (buildings/houses/block.ts draws those in the near view).
//
// A house is HOUSE_NUMBERS numbers (far.ts lays them out, table.ts keeps them): its footprint in columns of the
// ground (no longer on their grid), the height of its walls and of its roof over the ground it stands on, in blocks of
// its step, the colours of its walls and roof, and its kind of roof.
import { FLOOR, m } from '../buildings';
import { Batch, type RGB, hash2, rgb, shade } from '../lookprobe/batch';
import { N } from '../lookprobe/layout';
import type { Part } from '../lookprobe/terrain';

/** x0, z0, x1, z1, eaves, rise (0: a flat terrace), wall and roof (0xRRGGBB), form (0 gables, 1 hips) */
export const HOUSE_NUMBERS = 9;
/** the walls darken towards their foot, as a box of the near view does (Batch.box `foot`) */
const FOOT = 0.9;
/** the roof reaches over the walls by this share of the house's shorter side (block.ts: 0.3 m on houses of 6 to 8 m) */
const OVERHANG = 0.05;
/** the gables of a roof are of the walls' colour, a touch darker in their shade under the roof */
const GABLE = 0.96;
/** each roof is a touch lighter or darker than the next, as the tiles of the near view differ from house to house */
const ROOF_LIGHT = 0.06;

/** where the near view gives its roofs gables more often than hips: in the lands of steep roofs (traditions/house-styles.ts NORTH, ALPINE …) */
const GABLES_STEEP = 0.85,
  GABLES_LOW = 0.3,
  STEEP_FROM = m(3);
/**
 * A house of the plan as it is drawn here. Of the near view's roof (buildings/houses/block.ts) the plan keeps how
 * high the house stands with it, which is its storeys, a band, and the highest roof its land builds (`maxRise`);
 * the walls end a little over the last storey. Its roof rises as steeply as the roofs of its land do, which is the
 * more steeply the higher they may rise (pitch 0.31 under 2.1 m, 0.9 under 4.9 m), as far as `maxRise`.
 */
export function houseShape(
  w: number,
  d: number,
  floors: number,
  height: number,
  hx: number,
  hz: number,
): { eaves: number; rise: number; hips: boolean } {
  const eaves = floors * FLOOR + m(0.62),
    most = Math.max(0, height - floors * FLOOR - m(1.7)),
    pitch = Math.min(1.05, 0.34 * most);
  const rise = most < m(0.4) ? 0 : Math.min((Math.min(w, d) / 2) * pitch, most);
  return { eaves, rise, hips: hash2(hx, hz, 142) >= (most >= STEEP_FROM ? GABLES_STEEP : GABLES_LOW) };
}
/** The houses of `houses` whose middle lies in `part`: those a piece draws and keeps (table.ts), as floats. */
export function housesIn(houses: ArrayLike<number> | undefined, part: Part): Float32Array | undefined {
  if (!houses?.length) return undefined;
  const own: number[] = [];
  for (let k = 0; k + HOUSE_NUMBERS <= houses.length; k += HOUSE_NUMBERS) {
    const mx = (houses[k] + houses[k + 2]) / 2,
      mz = (houses[k + 1] + houses[k + 3]) / 2;
    if (mx >= part.x0 && mx < part.x1 && mz >= part.z0 && mz < part.z1)
      for (let q = 0; q < HOUSE_NUMBERS; q++) own.push(houses[k + q]);
  }
  return own.length ? Float32Array.from(own) : undefined;
}

/** The height a house stands at and the foot of its walls: the highest and the lowest top of the columns under it. */
function groundOf(tops: ArrayLike<number>, x0: number, z0: number, x1: number, z1: number): [number, number] {
  let base = -Infinity,
    foot = Infinity;
  for (let z = Math.max(0, Math.floor(z0)); z < Math.min(N, Math.ceil(z1)); z++)
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(N, Math.ceil(x1)); x++) {
      const y = tops[z * N + x];
      base = Math.max(base, y);
      foot = Math.min(foot, y);
    }
  return base === -Infinity ? [0, 0] : [base, foot];
}

/**
 * Draws houses on a ground whose columns' tops are `tops` (as they are drawn). Returns where each house's corners end
 * in the batch, counted from where they began (three numbers to a corner): the glide moves them house by house.
 */
export function drawHouses(b: Batch, houses: ArrayLike<number>, tops: ArrayLike<number>): number[] {
  const ends: number[] = [],
    began = b.pos.length / 3;
  for (let k = 0; k + HOUSE_NUMBERS <= houses.length; k += HOUSE_NUMBERS) {
    const x0 = houses[k],
      z0 = houses[k + 1],
      x1 = houses[k + 2],
      z1 = houses[k + 3],
      eaves = houses[k + 4],
      rise = houses[k + 5];
    const [base, foot] = groundOf(tops, x0, z0, x1, z1),
      top = base + eaves,
      wall = rgb(houses[k + 6]),
      low = shade(wall, FOOT);
    const roof = shade(
        rgb(houses[k + 7]),
        1 + ROOF_LIGHT * (2 * hash2(Math.round(x0 * 64), Math.round(z0 * 64), 141) - 1),
      ),
      gable = shade(wall, GABLE);
    // the walls, from the foot of the lowest column under the house to the eaves
    b.quadAt(x1, foot, z0, x1, foot, z1, x1, top, z1, x1, top, z0, low, low, wall, wall, 1, 0, 0);
    b.quadAt(x0, foot, z1, x0, foot, z0, x0, top, z0, x0, top, z1, low, low, wall, wall, -1, 0, 0);
    b.quadAt(x0, foot, z1, x1, foot, z1, x1, top, z1, x0, top, z1, low, low, wall, wall, 0, 0, 1);
    b.quadAt(x1, foot, z0, x0, foot, z0, x0, top, z0, x1, top, z0, low, low, wall, wall, 0, 0, -1);
    roofOf(b, x0, z0, x1, z1, top, rise, houses[k + 8] === 1, roof, gable);
    ends.push(b.pos.length / 3 - began);
  }
  return ends;
}

/**
 * The roof over a house's walls x0 … x1 × z0 … z1 whose top is `top`: its slopes run out over the walls by OVERHANG,
 * and they pass over the walls' top edge, so that no gap opens between the two; the ridge runs along the longer side.
 * A flat roof is a terrace of the roof's colour.
 */
function roofOf(
  b: Batch,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  top: number,
  rise: number,
  hips: boolean,
  c: RGB,
  gable: RGB,
) {
  const w = x1 - x0,
    d = z1 - z0,
    ov = OVERHANG * Math.min(w, d);
  if (!(rise > 0)) {
    b.quadAt(x0, top, z0, x0, top, z1, x1, top, z1, x1, top, z0, c, c, c, c, 0, 1, 0);
    return;
  }
  const along = w >= d,
    half = (Math.min(w, d) + 2 * ov) / 2,
    eaves = top - (ov * rise) / half,
    ridge = eaves + rise;
  const rx0 = x0 - ov,
    rz0 = z0 - ov,
    rx1 = x1 + ov,
    rz1 = z1 + ov;
  if (along) {
    const zc = (rz0 + rz1) / 2,
      a = hips ? rx0 + half : rx0,
      e = hips ? rx1 - half : rx1;
    slope(b, rx0, eaves, rz1, rx1, eaves, rz1, e, ridge, zc, a, ridge, zc, c, 0, 1, 1);
    slope(b, rx1, eaves, rz0, rx0, eaves, rz0, a, ridge, zc, e, ridge, zc, c, 0, 1, -1);
    if (hips) {
      b.triAt(rx1, eaves, rz1, rx1, eaves, rz0, e, ridge, zc, c, c, c, 1, 1, 0);
      b.triAt(rx0, eaves, rz0, rx0, eaves, rz1, a, ridge, zc, c, c, c, -1, 1, 0);
    } else {
      b.triAt(rx1, eaves, rz1, rx1, eaves, rz0, rx1, ridge, zc, gable, gable, gable, 1, 0, 0);
      b.triAt(rx0, eaves, rz0, rx0, eaves, rz1, rx0, ridge, zc, gable, gable, gable, -1, 0, 0);
    }
  } else {
    const xc = (rx0 + rx1) / 2,
      a = hips ? rz0 + half : rz0,
      e = hips ? rz1 - half : rz1;
    slope(b, rx1, eaves, rz1, rx1, eaves, rz0, xc, ridge, a, xc, ridge, e, c, 1, 1, 0);
    slope(b, rx0, eaves, rz0, rx0, eaves, rz1, xc, ridge, e, xc, ridge, a, c, -1, 1, 0);
    if (hips) {
      b.triAt(rx0, eaves, rz1, rx1, eaves, rz1, xc, ridge, e, c, c, c, 0, 1, 1);
      b.triAt(rx1, eaves, rz0, rx0, eaves, rz0, xc, ridge, a, c, c, c, 0, 1, -1);
    } else {
      b.triAt(rx0, eaves, rz1, rx1, eaves, rz1, xc, ridge, rz1, gable, gable, gable, 0, 0, 1);
      b.triAt(rx1, eaves, rz0, rx0, eaves, rz0, xc, ridge, rz0, gable, gable, gable, 0, 0, -1);
    }
  }
}

/** One slope from its eaves (a → b) up to its ridge (c → d): a triangle where the ridge has no length (a hip roof over a square). */
function slope(
  b: Batch,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  dx: number,
  dy: number,
  dz: number,
  col: RGB,
  fx: number,
  fy: number,
  fz: number,
) {
  if (Math.abs(cx - dx) + Math.abs(cz - dz) < 1e-6)
    b.triAt(ax, ay, az, bx, by, bz, cx, cy, cz, col, col, col, fx, fy, fz);
  else b.quadAt(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, col, col, col, col, fx, fy, fz);
}

/** The houses of a ground drawn as one batch (see `drawHouses`), with where each ends in it. */
export function housesBatch(
  houses: ArrayLike<number> | undefined,
  tops: ArrayLike<number>,
): { batch: Batch; ends: number[] } | undefined {
  if (!houses?.length) return undefined;
  const batch = new Batch();
  batch.reserve((houses.length / HOUSE_NUMBERS) * 14);
  return { batch, ends: drawHouses(batch, houses, tops) };
}
