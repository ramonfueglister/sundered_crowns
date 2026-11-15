// The mosque of the lands of Islam.
import { Batch, type Rnd, rgb, shade } from '../../lookprobe/batch';
import { battlements, drum, dome } from '../core/solids';
import { SIDES, arch, pane, spread, wallOf } from '../core/wall';
import { GOLD, LEAD } from '../palette';
import { TERRACE } from '../traditions/house-styles';

/**
 * A mosque, 9 × 9 at `s` = 1: a prayer hall under a dome behind a court with arcades, a square minaret with a gallery at
 * one corner.
 */
export function mosque(r: Rnd, s = 1): Batch {
  const b = new Batch(), h = 4.5 * s, wallC = r.pick(TERRACE.walls), top = 3.8 * s, dark = rgb(0x4a4038), tile = rgb(0x4f9a8a);
  // the hall at the -z half, the court before it
  b.box(-h, -1, -h, h, top, 0.4 * s, wallC, { foot: 0.86, top: shade(wallC, 0.88) });
  battlements(b, -h, -h, h, 0.4 * s, top, wallC, 0.4, 0.4, 1.0);
  b.box(-h, -1, 0.4 * s, h, 2.4 * s, h, shade(wallC, 0.98), { foot: 0.86, top: shade(wallC, 0.9) });
  b.box(-h + 0.9, 0.05, 1.3 * s, h - 0.9, 2.41 * s, h - 0.9, shade(wallC, 0.7), { top: rgb(0xe8dcc4) });
  for (const sd of ['px', 'pz'] as const) { const w = wallOf(-h, 0.4 * s, h, h, sd); for (const t of spread(w, Math.max(3, Math.round(w.len / 1.6)), 0.3)) arch(b, w, t, 0, 0.45, 1.5 * s, dark, 0.05); }
  for (const sd of ['px', 'nx', 'nz'] as const) { const w = wallOf(-h, -h, h, 0.4 * s, sd); for (const t of spread(w, Math.max(2, Math.round(w.len / 2.2)), 0.5)) arch(b, w, t, 1.4 * s, 0.3, 2.8 * s, dark); pane(b, w, 0, top - 0.5, w.len, top - 0.3, tile, 0.03); }
  drum(b, 0, top, -h / 2 - 0.2, 2.1 * s, top + 1.0 * s, wallC, 12, 0.92);
  dome(b, 0, top + 1.0 * s, -h / 2 - 0.2, 2.2 * s, r.pick([rgb(0xf4ead8), tile, LEAD]), 1.05);
  b.box(-0.07, top + 3.3 * s, -h / 2 - 0.27, 0.07, top + 4.2 * s, -h / 2 - 0.13, GOLD);
  // the minaret
  const mx = h - 1.1, mz = h - 1.1, mh = 10.5 * s;
  b.box(mx - 1.1, -1, mz - 1.1, mx + 1.1, mh, mz + 1.1, wallC, { foot: 0.86 });
  for (const sd of SIDES) { const w = wallOf(mx - 1.1, mz - 1.1, mx + 1.1, mz + 1.1, sd); for (const y of [3, 5.5, 8]) arch(b, w, 1.1, y * s, 0.22, y * s + 0.8, dark); pane(b, w, 0, mh - 0.9, w.len, mh - 0.5, tile, 0.03); }
  b.box(mx - 1.4, mh, mz - 1.4, mx + 1.4, mh + 0.3, mz + 1.4, shade(wallC, 1.04));
  battlements(b, mx - 1.4, mz - 1.4, mx + 1.4, mz + 1.4, mh + 0.3, wallC, 0.3, 0.4, 0.7);
  b.box(mx - 0.6, mh + 0.3, mz - 0.6, mx + 0.6, mh + 2.4, mz + 0.6, wallC);
  dome(b, mx, mh + 2.4, mz, 0.66, rgb(0xf4ead8), 1.2, 8, 3);
  b.box(mx - 0.05, mh + 3.1, mz - 0.05, mx + 0.05, mh + 4.0, mz + 0.05, GOLD);
  return b;
}
