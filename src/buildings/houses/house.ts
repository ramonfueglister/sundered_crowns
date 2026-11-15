// Whole houses from blocks: the plain house of one block, and the town house of two or three blocks with sometimes a
// slim tower. Every builder returns a model around its own origin (ground at y = 0).
import { Batch, type RGB, type Rnd, shade } from '../../lookprobe/batch';
import { hipRoof } from '../core/roofs';
import { SIDES, arch, wallOf } from '../core/wall';
import { WINDOW } from '../palette';
import { SOUTH } from '../traditions/house-styles';
import { block } from './block';
import { FLOOR, type HouseStyle } from './style';

/** A plain house of one block: `w` along x, `d` along z. */
export function house(w: number, d: number, floors: number, wallC: RGB, roofC: RGB, r: Rnd, style: HouseStyle = SOUTH): Batch {
  const b = new Batch();
  block(b, -w / 2, -d / 2, w / 2, d / 2, floors, wallC, roofC, r, true, style);
  return b;
}

/**
 * A larger town house inside a footprint of w × d: a main block with a lower wing in an L, three wings round a court,
 * or two blocks of different height side by side, sometimes with a slim tower. This gives the broken roof line of the
 * city in the reference.
 */
export function townHouse(w: number, d: number, floors: number, wallC: RGB, roofC: RGB, r: Rnd, style: HouseStyle = SOUTH): Batch {
  const b = new Batch(), x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2, alongX = w >= d, wing = shade(wallC, r.range(0.94, 1.04));
  const cut = r.range(0.5, 0.68), low = Math.max(1, floors - 1);
  if (Math.min(w, d) >= 6 && r.chance(0.3)) {
    // three wings round a court that opens to one side
    const t = Math.min(w, d) * 0.36;
    if (alongX) { block(b, x0, z0, x1, z0 + t, floors, wallC, roofC, r, true, style); block(b, x0, z0 + t, x0 + t, z1, low, wing, roofC, r, false, style); block(b, x1 - t, z0 + t, x1, z1, low, wing, roofC, r, false, style); }
    else { block(b, x0, z0, x0 + t, z1, floors, wallC, roofC, r, true, style); block(b, x0 + t, z0, x1, z0 + t, low, wing, roofC, r, false, style); block(b, x0 + t, z1 - t, x1, z1, low, wing, roofC, r, false, style); }
  } else if (r.chance(0.5)) {
    // L: the main block takes one end at full depth, the wing the rest at part of the depth
    if (alongX) { block(b, x0, z0, x0 + w * cut, z1, floors, wallC, roofC, r, true, style); block(b, x0 + w * cut, z0, x1, z0 + d * r.range(0.55, 0.75), low, wing, roofC, r, false, style); }
    else { block(b, x0, z0, x1, z0 + d * cut, floors, wallC, roofC, r, true, style); block(b, x0, z0 + d * cut, x0 + w * r.range(0.55, 0.75), z1, low, wing, roofC, r, false, style); }
  } else if (alongX) { block(b, x0, z0, x0 + w * cut, z1, floors, wallC, roofC, r, true, style); block(b, x0 + w * cut, z0, x1, z1, low, wing, r.pick(style.roofs), r, false, style); }
  else { block(b, x0, z0, x1, z0 + d * cut, floors, wallC, roofC, r, true, style); block(b, x0, z0 + d * cut, x1, z1, low, wing, r.pick(style.roofs), r, false, style); }
  if (r.chance(0.12)) {
    const tx = x1 - 1.1, tz = z1 - 1.1, th = (floors + 1.3) * FLOOR;
    b.box(tx - 1, -1, tz - 1, tx + 1, th, tz + 1, shade(wallC, 0.97), { foot: 0.9 });
    for (const s of SIDES) arch(b, wallOf(tx - 1, tz - 1, tx + 1, tz + 1, s), 1, th - 1.1, 0.24, th - 0.6, WINDOW);
    b.box(tx - 1.2, th, tz - 1.2, tx + 1.2, th + 0.12, tz + 1.2, shade(roofC, 0.78));
    hipRoof(b, tx - 1.2, tz - 1.2, tx + 1.2, tz + 1.2, th + 0.12, 1.1, roofC, 3);
  }
  return b;
}
