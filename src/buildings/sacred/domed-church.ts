// The domed church of the Greek rite, also used (with gilded domes) for the Rus.
import { Batch, type RGB, type Rnd, rgb, shade } from '../../lookprobe/batch';
import { drum, dome } from '../core/solids';
import { gableRoof } from '../core/roofs';
import { SIDES, arch, pane, spread, wallOf } from '../core/wall';
import { DOOR, GLASS, GOLD, LEAD, ROOFS } from '../palette';

/**
 * A domed church of the Greek rite, a square of 7 × `s` with an apse at its -z end: walls of stone banded with brick, a
 * dome on a drum over the middle, a narthex before the door. The dome is of tiles, lead or gilded.
 */
export function domedChurch(r: Rnd, s = 1, domeC: RGB = r.pick([ROOFS[0], ROOFS[3], LEAD])): Batch {
  const b = new Batch(), h = 3.5 * s, top = 4.6 * s, wallC = r.pick([rgb(0xf0d8b8), rgb(0xecd0b0), rgb(0xf4e0c4)]), band = rgb(0xd88462);
  b.box(-h, -1, -h, h, top, h, wallC, { foot: 0.84, top: shade(ROOFS[1], 0.9) });
  for (const sd of SIDES) {
    const w = wallOf(-h, -h, h, h, sd);
    for (let y = 0.9; y < top - 0.3; y += 0.9) pane(b, w, 0, y, w.len, y + 0.16, band, 0.02);
    for (const t of spread(w, 3, 0.6 * s)) arch(b, w, t, 1.5 * s, 0.34 * s, 3.1 * s, GLASS);
  }
  // the arms of the cross stand above the corners, under tiled roofs
  gableRoof(b, -h - 0.15, -1.6 * s, h + 0.15, 1.6 * s, top, 1.3 * s, ROOFS[1], wallC, 3);
  gableRoof(b, -1.6 * s, -h - 0.15, 1.6 * s, h + 0.15, top, 1.3 * s, ROOFS[1], wallC, 3);
  drum(b, 0, top, 0, 2.0 * s, top + 2.4 * s, wallC, 12, 0.92);
  for (let i = 0; i < 12; i += 2) { const a = ((i + 0.5) / 12) * Math.PI * 2, x = Math.cos(a) * 1.95 * s, z = Math.sin(a) * 1.95 * s; b.box(x - 0.2 * s, top + 0.8 * s, z - 0.2 * s, x + 0.2 * s, top + 1.9 * s, z + 0.2 * s, GLASS); }
  dome(b, 0, top + 2.4 * s, 0, 2.15 * s, domeC, 0.85);
  b.box(-0.08, top + 4.2 * s, -0.08, 0.08, top + 5.3 * s, 0.08, GOLD); b.box(-0.35, top + 4.8 * s, -0.08, 0.35, top + 4.95 * s, 0.08, GOLD, { bottom: true });
  // apse and narthex
  drum(b, 0, -1, -h, 1.7 * s, 3.2 * s, wallC, 10, 0.86); dome(b, 0, 3.2 * s, -h, 1.75 * s, ROOFS[1], 0.5, 10, 3);
  b.box(-h, -1, h, h, 2.8 * s, h + 1.6 * s, shade(wallC, 0.98), { foot: 0.84, top: shade(ROOFS[1], 0.95) });
  arch(b, wallOf(-h, h, h, h + 1.6 * s, 'pz'), h, 0, 0.6 * s, 1.5 * s, DOOR);
  return b;
}
