// The Gothic cathedral of the great Latin towns.
import { Batch, type RGB, type V3, shade } from '../../lookprobe/batch';
import { battlements } from '../core/solids';
import { gableRoof, hipRoof } from '../core/roofs';
import { SIDES, arch, on, pane, spread, wallOf } from '../core/wall';
import { DOOR, GLASS, OPENING, SLATE } from '../palette';

/**
 * A Gothic cathedral, 11 × 20: a high nave between lower aisles with buttresses, a transept, and at the +z end the
 * front with its rose between two towers, which carry spires or end flat.
 */
export function cathedral(wallC: RGB, roofC: RGB, spire: RGB | null): Batch {
  const b = new Batch(),
    x0 = -4.5,
    x1 = 4.5,
    z0 = -10,
    z1 = 6.4,
    aisle = 4.4,
    nave = 8.6;
  b.box(x0, -1, z0, x1, aisle, z1, wallC, { foot: 0.84 });
  b.box(-2.3, aisle, z0, 2.3, nave, z1, shade(wallC, 1.03));
  for (const sx of [-1, 1])
    b.box(sx > 0 ? 2.3 : x0 - 0.15, aisle, z0 - 0.15, sx > 0 ? x1 + 0.15 : -2.3, aisle + 0.3, z1, shade(roofC, 0.92), {
      top: roofC,
    });
  gableRoof(b, -2.6, z0 - 0.3, 2.6, z1, nave, 3.2, roofC, wallC, 5);
  for (const s of ['px', 'nx'] as const) {
    const low = wallOf(x0, z0, x1, z1, s),
      high = wallOf(-2.3, z0, 2.3, z1, s);
    for (const t of spread(low, 7, 0.4)) arch(b, low, t, 1.0, 0.36, 3.2, GLASS);
    for (const t of spread(high, 7, 0.4)) arch(b, high, t, aisle + 0.9, 0.32, nave - 1.3, GLASS);
    // buttresses with pinnacles between the windows
    for (let k = 0; k <= 7; k++) {
      const z = z0 + 0.3 + (k * (z1 - z0 - 0.6)) / 7,
        x = s === 'px' ? x1 : x0 - 0.5;
      b.box(x, -1, z - 0.22, x + 0.5, aisle + 0.8, z + 0.22, shade(wallC, 0.97), { foot: 0.86 });
      hipRoof(b, x - 0.05, z - 0.27, x + 0.55, z + 0.27, aisle + 0.8, 0.9, shade(wallC, 1.06));
    }
  }
  const apse = wallOf(x0, z0, x1, z1, 'nz');
  for (const t of spread(apse, 4, 0.5)) arch(b, apse, t, 1.0, 0.36, 3.2, GLASS);
  // the transept
  b.box(-5.5, -1, -3.2, 5.5, nave, 0, wallC, { foot: 0.84 });
  gableRoof(b, -5.8, -3.5, 5.8, 0.3, nave, 3.2, roofC, wallC, 5);
  for (const s of ['px', 'nx'] as const) {
    const w = wallOf(-5.5, -3.2, 5.5, 0, s);
    arch(b, w, 1.6, 0, 0.5, 1.4, DOOR);
    arch(b, w, 1.6, 3.2, 0.7, 6.6, GLASS);
  }
  hipRoof(b, -0.5, -2.1, 0.5, -1.1, nave + 2.4, 4.2, spire ?? SLATE);
  // the front: two towers, the portals, the rose
  const th = 12.6;
  b.box(x0 - 0.3, -1, z1, x1 + 0.3, nave + 1.2, z1 + 3.6, wallC, { foot: 0.84 });
  const front = wallOf(x0 - 0.3, z1, x1 + 0.3, z1 + 3.6, 'pz');
  for (const [t, half] of [
    [1.9, 0.75],
    [4.8, 1.05],
    [7.7, 0.75],
  ] as const) {
    arch(b, front, t, 0, half, 1.6, shade(wallC, 0.82), 0.03);
    arch(b, front, t, 0, half * 0.66, 1.3, DOOR, 0.06);
  }
  pane(b, front, 0, 3.4, front.len, 3.7, shade(wallC, 0.84), 0.04);
  {
    const rim: V3[] = [];
    for (let k = 0; k <= 12; k++)
      rim.push(on(front, 4.8 + Math.cos((Math.PI * k) / 6) * 1.25, 6.2 + Math.sin((Math.PI * k) / 6) * 1.25, 0.06));
    b.fan(on(front, 4.8, 6.2, 0.06), rim, GLASS, front.n);
  }
  for (const tx of [x0 - 0.3, x1 + 0.3 - 3.4]) {
    b.box(tx, nave + 1.2, z1 + 0.1, tx + 3.4, th, z1 + 3.5, shade(wallC, 1.02));
    for (const s of SIDES) {
      const w = wallOf(tx, z1 + 0.1, tx + 3.4, z1 + 3.5, s);
      for (const t of [1.05, 2.35]) arch(b, w, t, nave + 1.7, 0.3, th - 0.9, OPENING);
    }
    if (spire) hipRoof(b, tx - 0.1, z1, tx + 3.5, z1 + 3.6, th, 7.5, spire);
    else battlements(b, tx, z1 + 0.1, tx + 3.4, z1 + 3.5, th, wallC, 0.4, 0.5);
  }
  return b;
}
