// The castle of the reference image.
import { Batch, rgb, seeded, shade } from '../../lookprobe/batch';
import { battlements } from '../core/solids';
import { hipRoof } from '../core/roofs';
import { SIDES, arch, pane, spread, wallOf } from '../core/wall';
import { block } from '../houses/block';
import { ROOFS } from '../palette';

/** the fixed random source of the castle's hall, so that the one castle is the same on every load */
const HALL_SEED = 977;

/** A castle on its hill, 11 × 11: a curtain wall with square corner towers, a tall keep with a flag, a hall in the court. */
export function castle(): Batch {
  const b = new Batch(),
    s = 5.2,
    wallH = 4.2,
    c = rgb(0xb09c8c),
    flag = rgb(0xd23b2e);
  const slit = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    for (const sd of SIDES) {
      const w = wallOf(x0, z0, x1, z1, sd);
      for (const t of spread(w, Math.max(1, Math.round(w.len / 2)), 0.3))
        pane(b, w, t - 0.12, y, t + 0.12, y + 0.7, rgb(0x4a4038));
    }
  };
  b.box(-s, -2, -s, s, wallH, s, c, { foot: 0.8, top: shade(c, 0.9) });
  b.box(-s + 1, wallH - 1.2, -s + 1, s - 1, wallH - 1.19, s - 1, shade(c, 0.7));
  battlements(b, -s, -s, s, s, wallH, c, 0.5, 0.55);
  slit(-s, -s, s, s, 2.4);
  slit(-s, -s, s, s, 0.9);
  arch(b, wallOf(-s, -s, s, s, 'px'), s, 0, 0.8, 1.6, rgb(0x4a3f38));
  for (const [tx, tz, th] of [
    [-s, -s, 7.2],
    [s, -s, 6.6],
    [s, s, 6.4],
    [-s, s, 6.6],
  ] as const) {
    b.box(tx - 1.5, -2, tz - 1.5, tx + 1.5, th, tz + 1.5, shade(c, 1.03), { foot: 0.8, top: shade(c, 0.92) });
    battlements(b, tx - 1.5, tz - 1.5, tx + 1.5, tz + 1.5, th, c, 0.5, 0.55);
    slit(tx - 1.5, tz - 1.5, tx + 1.5, tz + 1.5, th - 1.8);
  }
  block(b, -2.6, -1.2, 1.6, 2.6, 2, shade(c, 1.08), ROOFS[1], seeded(HALL_SEED), false);
  b.box(-3.6, -2, -3.6, -0.8, 10.2, -0.8, shade(c, 1.06), { foot: 0.86, top: shade(c, 0.92) });
  battlements(b, -3.6, -3.6, -0.8, -0.8, 10.2, c, 0.5, 0.55);
  slit(-3.6, -3.6, -0.8, -0.8, 7.6);
  slit(-3.6, -3.6, -0.8, -0.8, 4.8);
  // pointed tile roofs on the keep and on the tower beside the gate, as on the castle of the reference
  hipRoof(b, -3.3, -3.3, -1.1, -1.1, 10.2, 2.0, ROOFS[1], 3);
  hipRoof(b, s - 1.2, -s - 1.2, s + 1.2, -s + 1.2, 6.6, 1.8, ROOFS[3], 3);
  for (const [fx, fz, fy] of [
    [-2.2, -2.2, 12.2],
    [s, -s, 8.4],
    [-s, s, 6.6],
  ] as const) {
    b.box(fx - 0.06, fy, fz - 0.06, fx + 0.06, fy + 2.2, fz + 0.06, rgb(0x6a4a30));
    b.box(fx - 0.9, fy + 1.5, fz - 0.03, fx - 0.06, fy + 2.15, fz + 0.03, flag, { bottom: true });
  }
  return b;
}
