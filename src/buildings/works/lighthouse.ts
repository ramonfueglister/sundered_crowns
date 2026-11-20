// The lighthouse of the reference image.
import { Batch, rgb, shade } from '../../lookprobe/batch';
import { hipRoof } from '../core/roofs';
import { SIDES, arch, wallOf } from '../core/wall';
import { GOLD, ROOFS, WINDOW } from '../palette';

/** A square stone tower in three steps on an islet, with a small lantern under a gilded tip. */
export function lighthouse(): Batch {
  const b = new Batch(),
    c = rgb(0xe6dcd2);
  let y = -1;
  for (const [half, top] of [
    [1.6, 3.2],
    [1.2, 6.0],
    [0.85, 7.6],
  ] as const) {
    b.box(-half, y, -half, half, top, half, c, { foot: 0.84 });
    b.box(-half - 0.12, top - 0.25, -half - 0.12, half + 0.12, top, half + 0.12, shade(c, 1.05));
    for (const s of SIDES) arch(b, wallOf(-half, -half, half, half, s), half, top - 1.5, 0.22, top - 0.95, WINDOW);
    y = top;
  }
  b.box(-0.55, 7.6, -0.55, 0.55, 8.7, 0.55, rgb(0xe9a45c), { foot: 0.9 });
  hipRoof(b, -0.7, -0.7, 0.7, 0.7, 8.7, 0.7, ROOFS[1]);
  b.box(-0.1, 9.4, -0.1, 0.1, 10.0, 0.1, GOLD);
  return b;
}
