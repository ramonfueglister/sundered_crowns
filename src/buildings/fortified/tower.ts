// The slim brick towers of the leading families that stand over the Latin towns.
import { Batch, type Rnd, rgb, shade } from '../../lookprobe/batch';
import { hipRoof } from '../core/roofs';
import { SIDES, arch, pane, wallOf } from '../core/wall';
import { OPENING, ROOFS, WINDOW } from '../palette';

/** A slim town tower of brick with a pointed roof, as in the towns of the reference; 2.4 × 2.4, about 10 high. */
export function tower(r: Rnd): Batch {
  const b = new Batch(), h = 1.2, top = r.range(8, 10.5), c = r.pick([rgb(0xc98a64), rgb(0xd29a72), rgb(0xbf7f5c)]);
  b.box(-h, -1, -h, h, top, h, c, { foot: 0.88 });
  for (const s of SIDES) {
    const wl = wallOf(-h, -h, h, h, s);
    for (const y of [2.2, 4.4]) pane(b, wl, 1.05, y, 1.35, y + 0.7, WINDOW);
    for (const t of [0.75, 1.65]) arch(b, wl, t, top - 1.7, 0.26, top - 0.9, OPENING);
    pane(b, wl, 0, top - 2.2, wl.len, top - 2.05, shade(c, 1.12), 0.02);
  }
  b.box(-h - 0.18, top, -h - 0.18, h + 0.18, top + 0.16, h + 0.18, shade(c, 1.1));
  hipRoof(b, -h - 0.1, -h - 0.1, h + 0.1, h + 0.1, top + 0.16, 2.0, ROOFS[5], 4);
  return b;
}
