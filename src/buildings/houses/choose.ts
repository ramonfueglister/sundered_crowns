// Which house the settlement code builds on a lot: the fine-block house of a tradition where the region has one, at
// the detail the zoom asks for; otherwise the house or town house of the region's style, as before.
import { type Batch, type RGB, type Rnd, seeded } from '../../lookprobe/batch';
import type { Side } from '../core/wall';
import type { Style } from '../traditions/regions';
import { drawnWall, fineHouse } from './grammar';
import { house, townHouse } from './house';
import { FLOOR, VOXEL, m } from './style';

/** A house for a lot of w × d blocks, and the height the settlement keeps clear over it. */
export interface Chosen { model: Batch; height: number }

/** The height the settlement keeps clear over the house of a lot, whichever way it is built. */
export function heightOf(style: Style, w: number, d: number, floors: number): number {
  const tr = style.tradition;
  if (!tr) return floors * FLOOR + m(1.7) + style.house.maxRise;
  const storeys = tr.ground + Math.max(0, floors - 1) * tr.upper + 1, rise = (Math.min(w, d) / 2) * tr.pitch[1];
  return storeys * VOXEL + rise + tr.chimney.height[1] * VOXEL;
}

/**
 * `wallC` and `roofC` are the colours drawn from the style for the house and town house; a tradition draws its own
 * from its sources. `detail` 1 is the near view, 0 the far view. `front` is the side with the door, towards the
 * street.
 */
export function houseOf(style: Style, w: number, d: number, floors: number, wallC: RGB, roofC: RGB, r: Rnd, detail: 0 | 1 = 0, front: Side = 'pz'): Chosen {
  const tr = style.tradition, height = heightOf(style, w, d, floors);
  if (tr) return { model: fineHouse(w, d, floors, tr, r, { detail, front }), height };
  return { model: Math.max(w, d) >= m(11.4) && r.chance(0.7) ? townHouse(w, d, floors, wallC, roofC, r, style.house) : house(w, d, floors, wallC, roofC, r, style.house), height };
}

/**
 * The wall and the roof a house shows, for those who draw it from afar without building it (the plan of the far
 * steps): a tradition's own, the wall its house draws from the source `seed`; else the colours drawn from the style.
 */
export function shownOf(style: Style, wallC: RGB, roofC: RGB, seed: number): { wall: RGB; roof: RGB } {
  const tr = style.tradition;
  return tr ? { wall: drawnWall(tr, seeded(seed)), roof: tr.roof } : { wall: wallC, roof: roofC };
}
