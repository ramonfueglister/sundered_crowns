// One block of a house, built in three steps that a building grammar will later take over one by one: the body, the
// four fronts, the roof with what stands on it. The steps draw from the random source in a fixed order, so a house is
// the same for the same seed.
import { type Batch, type RGB, type Rnd, rgb, shade } from '../../lookprobe/batch';
import { gableRoof, hipRoof, roofAt } from '../core/roofs';
import { SIDES, arch, pane, spread, wallOf } from '../core/wall';
import { DOOR, DORMER, SHUTTERS, WINDOW, WINDOW_WARM } from '../palette';
import { SOUTH } from '../traditions/house-styles';
import { FLOOR, type HouseStyle } from './style';

/** A footprint x0 … x1 × z0 … z1 and the height of the walls' top. */
interface Body { x0: number; z0: number; x1: number; z1: number; top: number }

/**
 * One block of a house: walls with plinth, storey bands, windows and a door, under a tiled roof. The walls reach one
 * unit into the ground so that the block also sits on steps.
 */
export function block(b: Batch, x0: number, z0: number, x1: number, z1: number, floors: number, wallC: RGB, roofC: RGB, r: Rnd, door = true, style: HouseStyle = SOUTH) {
  const body: Body = { x0, z0, x1, z1, top: floors * FLOOR + 0.3 };
  b.box(x0, -1, z0, x1, body.top, z1, wallC, { foot: 0.9 });
  fronts(b, body, floors, wallC, r, door);
  if (style.flat) terrace(b, body, wallC, r);
  else roof(b, body, wallC, roofC, r, style);
}

/** The four fronts: plinth, storey bands, eaves shadow, patches of plaster, putlog holes, windows and doors. */
function fronts(b: Batch, { x0, z0, x1, z1, top }: Body, floors: number, wallC: RGB, r: Rnd, door: boolean) {
  const glass = r.chance(0.5) ? WINDOW : WINDOW_WARM, shutter = r.chance(0.08) ? r.pick(SHUTTERS) : null, arched = r.chance(0.25);
  for (const s of SIDES) {
    const wl = wallOf(x0, z0, x1, z1, s), cols = spread(wl, Math.max(1, Math.round(wl.len / 1.5)), 0.2);
    // a door on most walls of the ground floor, two on a long one
    const doors = new Set<number>();
    if (door) for (let k = wl.len > 9 ? 2 : r.chance(0.7) ? 1 : 0; k > 0; k--) doors.add(r.int(0, cols.length - 1));
    pane(b, wl, 0, 0, wl.len, 0.4, shade(wallC, 0.8), 0.02);
    for (let f = 1; f < floors; f++) pane(b, wl, 0, f * FLOOR + 0.2, wl.len, f * FLOOR + 0.32, shade(wallC, 1.06), 0.02);
    // the shadow line under the eaves, and patches of older plaster
    pane(b, wl, 0, top - 0.2, wl.len, top, shade(wallC, 0.7), 0.02);
    for (let k = Math.round(wl.len / 3) + r.int(0, 1); k > 0 && wl.len > 3; k--) {
      const t = r.range(0, wl.len - 2), y = r.range(0.4, top - 1.6);
      pane(b, wl, t, y, t + r.range(0.8, 2), y + r.range(0.5, 1.3), shade(wallC, r.chance(0.7) ? r.range(0.86, 0.94) : r.range(1.05, 1.1)), 0.015);
    }
    // putlog holes: small dark squares in a row above the windows of some storeys
    for (let f = 0; f < floors; f++) if (r.chance(0.5)) for (let k = 0; k + 1 < cols.length; k++) {
      const t = (cols[k] + cols[k + 1]) / 2, y = f * FLOOR + 1.82;
      if (r.chance(0.6)) pane(b, wl, t - 0.09, y, t + 0.09, y + 0.18, shade(wallC, 0.6), 0.02);
    }
    for (let f = 0; f < floors; f++) cols.forEach((t, k) => {
      const y = f * FLOOR + 0.72;
      if (f === 0 && doors.has(k)) { arch(b, wl, t, 0, 0.4, 1.15, DOOR, 0.05); return; }
      if (shutter) { pane(b, wl, t - 0.52, y, t - 0.29, y + 0.9, shutter); pane(b, wl, t + 0.29, y, t + 0.52, y + 0.9, shutter); }
      pane(b, wl, t - 0.34, y - 0.1, t + 0.34, y, shade(wallC, 1.1));
      if (arched) arch(b, wl, t, y, 0.26, y + 0.62, glass, 0.05); else pane(b, wl, t - 0.26, y, t + 0.26, y + 0.88, glass, 0.05);
    });
  }
}

/** A terrace roof behind a low parapet, sometimes with a small room on it. */
function terrace(b: Batch, { x0, z0, x1, z1, top }: Body, wallC: RGB, r: Rnd) {
  b.box(x0 - 0.06, top, z0 - 0.06, x1 + 0.06, top + 0.4, z1 + 0.06, shade(wallC, 1.03), { top: shade(wallC, 0.86) });
  if (r.chance(0.4)) { const cx = r.range(x0 + 1, x1 - 1), cz = r.range(z0 + 1, z1 - 1); b.box(cx - 0.8, top, cz - 0.8, cx + 0.8, top + 1.5, cz + 0.8, shade(wallC, 0.97), { top: shade(wallC, 0.88) }); }
}

/** A tiled hip or gable roof over an overhang, and the small clutter on it. */
function roof(b: Batch, { x0, z0, x1, z1, top }: Body, wallC: RGB, roofC: RGB, r: Rnd, style: HouseStyle) {
  const w = x1 - x0, d = z1 - z0;
  const ov = 0.2, rise = Math.min((Math.min(w, d) / 2) * r.range(style.pitch[0], style.pitch[1]), style.maxRise), gable = r.chance(style.gables), eaves = top + 0.12;
  b.box(x0 - ov, top, z0 - ov, x1 + ov, eaves, z1 + ov, shade(roofC, 0.78));
  const rows = Math.max(4, Math.round(Math.min(w, d) / 0.7));
  if (gable) gableRoof(b, x0 - ov, z0 - ov, x1 + ov, z1 + ov, eaves, rise, roofC, wallC, rows);
  else hipRoof(b, x0 - ov, z0 - ov, x1 + ov, z1 + ov, eaves, rise, roofC, rows);
  // dormers, chimneys and hatches: the small clutter that makes the roofs of the reference lively
  for (let k = r.int(1, 2) + Math.round((w * d) / 7); k > 0; k--) {
    const cx = r.range(x0 + 0.7, x1 - 0.7), cz = r.range(z0 + 0.7, z1 - 0.7), under = eaves + roofAt(x0 - ov, z0 - ov, x1 + ov, z1 + ov, rise, gable, cx, cz), kind = r.next();
    if (kind < 0.5) {
      // a dormer: a dark opening under its own piece of roof
      const hw = r.range(0.16, 0.26);
      b.box(cx - hw, under - 0.3, cz - hw, cx + hw, under + r.range(0.2, 0.32), cz + hw, r.chance(0.25) ? DORMER : shade(roofC, 0.66), { top: shade(roofC, r.range(1.04, 1.16)) });
    } else if (kind < 0.74) {
      const sz = r.range(0.13, 0.2);
      b.box(cx - sz, under - 0.3, cz - sz, cx + sz, under + r.range(0.45, 0.8), cz + sz, r.chance(0.5) ? shade(roofC, 0.55) : rgb(0x6a5a58), { top: r.chance(0.8) ? rgb(0xf0e6dc) : shade(roofC, 0.6) });
    } else {
      // a hatch or a patch of new tiles: a pale spot lying on the slope
      const sz = r.range(0.16, 0.26);
      b.box(cx - sz, under - 0.3, cz - sz, cx + sz, under + 0.12, cz + sz, rgb(0xf2e2d2));
    }
  }
}
