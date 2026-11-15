// The wall round a walled town.
import { Batch, rgb, shade } from '../../lookprobe/batch';
import { battlements } from '../core/solids';

/**
 * A town wall round a rectangle of w × d: four runs with battlements, a turret on each corner, a gate in the middle of
 * the runs that face the viewer.
 */
export function townWall(w: number, d: number): Batch {
  const b = new Batch(), x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2, t = 0.8, h = 2.0, c = rgb(0xcdb89c), gate = 1.3;
  const run = (ax: number, az: number, bx: number, bz: number) => {
    b.box(ax, -1, az, bx, h, bz, c, { foot: 0.82, top: shade(c, 0.94) });
    battlements(b, ax, az, bx, bz, h, c, 0.4, 0.45);
  };
  run(x0, z0, x1, z0 + t); run(x0, z0, x0 + t, z1);
  run(x1 - t, z0, x1, -gate); run(x1 - t, gate, x1, z1);
  run(x0, z1 - t, -gate, z1); run(gate, z1 - t, x1, z1);
  for (const [tx, tz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
    b.box(tx - 1, -1, tz - 1, tx + 1, 3.4, tz + 1, shade(c, 1.04), { foot: 0.82, top: shade(c, 0.94) });
    battlements(b, tx - 1, tz - 1, tx + 1, tz + 1, 3.4, c, 0.4, 0.45);
  }
  return b;
}
