// One block of a house, built in three steps that a building grammar will later take over one by one: the body, the
// four fronts, the roof with what stands on it. The steps draw from the random source in a fixed order, so a house is
// the same for the same seed. Every length is in metres through m(), read off the reference image at its 1.43 m a block.
import { type Batch, type RGB, type Rnd, rgb, shade } from '../../lookprobe/batch';
import { gableRoof, hipRoof, roofAt } from '../core/roofs';
import { SIDES, arch, pane, spread, wallOf } from '../core/wall';
import { DOOR, DORMER, SHUTTERS, WINDOW, WINDOW_WARM } from '../palette';
import { SOUTH } from '../traditions/house-styles';
import { FLOOR, type HouseStyle, m, m2 } from './style';

/** A footprint x0 … x1 × z0 … z1 and the height of the walls' top. */
interface Body {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  top: number;
}

/**
 * One block of a house: walls with plinth, storey bands, windows and a door, under a tiled roof. The walls reach one
 * unit into the ground so that the block also sits on steps.
 */
export function block(
  b: Batch,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  floors: number,
  wallC: RGB,
  roofC: RGB,
  r: Rnd,
  door = true,
  style: HouseStyle = SOUTH,
) {
  const body: Body = { x0, z0, x1, z1, top: floors * FLOOR + m(0.45) };
  b.box(x0, -1, z0, x1, body.top, z1, wallC, { foot: 0.9 });
  fronts(b, body, floors, wallC, r, door);
  if (style.flat) terrace(b, body, wallC, r);
  else roof(b, body, wallC, roofC, r, style);
}

/** The four fronts: plinth, storey bands, eaves shadow, patches of plaster, putlog holes, windows and doors. */
function fronts(b: Batch, { x0, z0, x1, z1, top }: Body, floors: number, wallC: RGB, r: Rnd, door: boolean) {
  const glass = r.chance(0.5) ? WINDOW : WINDOW_WARM,
    shutter = r.chance(0.08) ? r.pick(SHUTTERS) : null,
    arched = r.chance(0.25);
  for (const s of SIDES) {
    const wl = wallOf(x0, z0, x1, z1, s),
      cols = spread(wl, Math.max(1, Math.round(wl.len / m(2.1))), m(0.3));
    // a door on most walls of the ground floor, two on a long one
    const doors = new Set<number>();
    if (door) for (let k = wl.len > m(13) ? 2 : r.chance(0.7) ? 1 : 0; k > 0; k--) doors.add(r.int(0, cols.length - 1));
    pane(b, wl, 0, 0, wl.len, m(0.6), shade(wallC, 0.8), 0.02);
    for (let f = 1; f < floors; f++)
      pane(b, wl, 0, f * FLOOR + m(0.3), wl.len, f * FLOOR + m(0.45), shade(wallC, 1.06), 0.02);
    // the shadow line under the eaves, and patches of older plaster
    pane(b, wl, 0, top - m(0.3), wl.len, top, shade(wallC, 0.7), 0.02);
    for (let k = Math.round(wl.len / m(4.3)) + r.int(0, 1); k > 0 && wl.len > m(4.3); k--) {
      const t = r.range(0, wl.len - m(2.9)),
        y = r.range(m(0.6), top - m(2.3));
      pane(
        b,
        wl,
        t,
        y,
        t + r.range(m(1.1), m(2.9)),
        y + r.range(m(0.7), m(1.9)),
        shade(wallC, r.chance(0.7) ? r.range(0.86, 0.94) : r.range(1.05, 1.1)),
        0.015,
      );
    }
    // putlog holes: small dark squares in a row above the windows of some storeys
    for (let f = 0; f < floors; f++)
      if (r.chance(0.5))
        for (let k = 0; k + 1 < cols.length; k++) {
          const t = (cols[k] + cols[k + 1]) / 2,
            y = f * FLOOR + m(2.6);
          if (r.chance(0.6)) pane(b, wl, t - m(0.13), y, t + m(0.13), y + m(0.26), shade(wallC, 0.6), 0.02);
        }
    for (let f = 0; f < floors; f++)
      cols.forEach((t, k) => {
        const y = f * FLOOR + m(1.0);
        if (f === 0 && doors.has(k)) {
          arch(b, wl, t, 0, m(0.57), m(1.65), DOOR, 0.05);
          return;
        }
        if (shutter) {
          pane(b, wl, t - m(0.74), y, t - m(0.41), y + m(1.3), shutter);
          pane(b, wl, t + m(0.41), y, t + m(0.74), y + m(1.3), shutter);
        }
        pane(b, wl, t - m(0.49), y - m(0.14), t + m(0.49), y, shade(wallC, 1.1));
        if (arched) arch(b, wl, t, y, m(0.37), y + m(0.89), glass, 0.05);
        else pane(b, wl, t - m(0.37), y, t + m(0.37), y + m(1.26), glass, 0.05);
      });
  }
}

/** A terrace roof behind a low parapet, sometimes with a small room on it. */
function terrace(b: Batch, { x0, z0, x1, z1, top }: Body, wallC: RGB, r: Rnd) {
  b.box(x0 - m(0.09), top, z0 - m(0.09), x1 + m(0.09), top + m(0.57), z1 + m(0.09), shade(wallC, 1.03), {
    top: shade(wallC, 0.86),
  });
  if (r.chance(0.4)) {
    const cx = r.range(x0 + m(1.43), x1 - m(1.43)),
      cz = r.range(z0 + m(1.43), z1 - m(1.43));
    b.box(cx - m(1.14), top, cz - m(1.14), cx + m(1.14), top + m(2.1), cz + m(1.14), shade(wallC, 0.97), {
      top: shade(wallC, 0.88),
    });
  }
}

/** A tiled hip or gable roof over an overhang, and the small clutter on it. */
function roof(b: Batch, { x0, z0, x1, z1, top }: Body, wallC: RGB, roofC: RGB, r: Rnd, style: HouseStyle) {
  const w = x1 - x0,
    d = z1 - z0;
  const ov = m(0.3),
    rise = Math.min((Math.min(w, d) / 2) * r.range(style.pitch[0], style.pitch[1]), style.maxRise),
    gable = r.chance(style.gables),
    eaves = top + m(0.17);
  b.box(x0 - ov, top, z0 - ov, x1 + ov, eaves, z1 + ov, shade(roofC, 0.78));
  const rows = Math.max(4, Math.round(Math.min(w, d) / m(1.0)));
  if (gable) gableRoof(b, x0 - ov, z0 - ov, x1 + ov, z1 + ov, eaves, rise, roofC, wallC, rows);
  else hipRoof(b, x0 - ov, z0 - ov, x1 + ov, z1 + ov, eaves, rise, roofC, rows);
  // dormers, chimneys and hatches: the small clutter that makes the roofs of the reference lively
  for (let k = r.int(1, 2) + Math.round((w * d) / m2(14.3)); k > 0; k--) {
    const cx = r.range(x0 + m(1.0), x1 - m(1.0)),
      cz = r.range(z0 + m(1.0), z1 - m(1.0)),
      under = eaves + roofAt(x0 - ov, z0 - ov, x1 + ov, z1 + ov, rise, gable, cx, cz),
      kind = r.next();
    if (kind < 0.5) {
      // a dormer: a dark opening under its own piece of roof
      const hw = r.range(m(0.23), m(0.37));
      b.box(
        cx - hw,
        under - m(0.43),
        cz - hw,
        cx + hw,
        under + r.range(m(0.29), m(0.46)),
        cz + hw,
        r.chance(0.25) ? DORMER : shade(roofC, 0.66),
        { top: shade(roofC, r.range(1.04, 1.16)) },
      );
    } else if (kind < 0.74) {
      const sz = r.range(m(0.19), m(0.29));
      b.box(
        cx - sz,
        under - m(0.43),
        cz - sz,
        cx + sz,
        under + r.range(m(0.64), m(1.14)),
        cz + sz,
        r.chance(0.5) ? shade(roofC, 0.55) : rgb(0x6a5a58),
        { top: r.chance(0.8) ? rgb(0xf0e6dc) : shade(roofC, 0.6) },
      );
    } else {
      // a hatch or a patch of new tiles: a pale spot lying on the slope
      const sz = r.range(m(0.23), m(0.37));
      b.box(cx - sz, under - m(0.43), cz - sz, cx + sz, under + m(0.17), cz + sz, rgb(0xf2e2d2));
    }
  }
}
