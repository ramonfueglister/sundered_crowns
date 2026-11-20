// Dormers: small gabled windows standing out of a roof's long slopes, as the roofs of Ramon's Paris reference picture
// of 20 Nov 2026 have them now and then. PROTOTYPE: sizes are drawing values read off that picture.
import { type Batch, type RGB, type Rnd, shade } from '../../lookprobe/batch';
import { gableRoof, roofAt } from '../core/roofs';
import { pane, wallOf } from '../core/wall';
import { VOXEL as V } from './style';

/**
 * `n` dormers on the long slopes of a gable roof over x0 … z1 at height y rising by `rise`, on both slopes in turn,
 * each a box of wall with a window in its front and a little gable roof of the main roof's colour.
 */
export function dormers(
  b: Batch,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  rise: number,
  n: number,
  wallC: RGB,
  roofC: RGB,
  glass: RGB,
  r: Rnd,
) {
  const alongX = x1 - x0 >= z1 - z0,
    len = alongX ? x1 - x0 : z1 - z0,
    half = (alongX ? z1 - z0 : x1 - x0) / 2,
    w = 3 * V,
    h = 4 * V,
    deep = Math.min(half * 0.6, 5 * V);
  for (let k = 0; k < n; k++) {
    const t = (alongX ? x0 : z0) + (len * ((k >> 1) + 0.5 + r.range(-0.15, 0.15))) / Math.max(1, Math.ceil(n / 2)),
      sign = k % 2 ? -1 : 1;
    // the front of the dormer stands at a third of the way up the slope
    const across0 = (alongX ? (z0 + z1) / 2 : (x0 + x1) / 2) + sign * half * 0.62,
      across1 = across0 - sign * deep;
    const fx0 = alongX ? t - w / 2 : Math.min(across0, across1),
      fx1 = alongX ? t + w / 2 : Math.max(across0, across1),
      fz0 = alongX ? Math.min(across0, across1) : t - w / 2,
      fz1 = alongX ? Math.max(across0, across1) : t + w / 2;
    const base = y + roofAt(x0, z0, x1, z1, rise, true, alongX ? t : across0, alongX ? across0 : t) - V * 0.3;
    b.box(fx0, base - V, fz0, fx1, base + h, fz1, wallC);
    const side = alongX ? (sign > 0 ? 'pz' : 'nz') : sign > 0 ? 'px' : 'nx';
    const wall = wallOf(fx0, fz0, fx1, fz1, side);
    pane(b, wall, w / 2 - V * 0.75, base + V * 0.8, w / 2 + V * 0.75, base + h - V * 0.6, shade(glass, 0.8), 0.04);
    const o = V * 0.4;
    gableRoof(
      b,
      fx0 - (alongX ? o : 0),
      fz0 - (alongX ? 0 : o),
      fx1 + (alongX ? o : 0),
      fz1 + (alongX ? 0 : o),
      base + h,
      w * 0.55,
      roofC,
      wallC,
      2,
    );
  }
}
