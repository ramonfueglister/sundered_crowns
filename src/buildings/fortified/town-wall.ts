// The wall round a walled town.
import { Batch, rgb, shade } from '../../lookprobe/batch';
import { battlements } from '../core/solids';

/** Where a wall is open for water: on the side `side` of the rectangle, from `from` to `to` along it, measured from the side's middle. */
export interface WallGap { side: 'nz' | 'px' | 'pz' | 'nx'; from: number; to: number }

/**
 * A town wall round a rectangle of w × d: four runs with battlements, a turret on each corner, a gate in the middle of
 * the runs that face the viewer. Where a river or the sea crosses it (`gaps`) the wall is open, with a pier at each
 * end of the opening; a corner that stands in the water has no turret.
 */
export function townWall(w: number, d: number, gaps: readonly WallGap[] = []): Batch {
  const b = new Batch(), x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2, t = 0.8, h = 2.0, c = rgb(0xcdb89c), gate = 1.3;
  const run = (ax: number, az: number, bx: number, bz: number) => {
    b.box(ax, -1, az, bx, h, bz, c, { foot: 0.82, top: shade(c, 0.94) });
    battlements(b, ax, az, bx, bz, h, c, 0.4, 0.45);
  };
  const tower = (tx: number, tz: number, r: number, top: number) => {
    b.box(tx - r, -1, tz - r, tx + r, top, tz + r, shade(c, 1.04), { foot: 0.82, top: shade(c, 0.94) });
    battlements(b, tx - r, tz - r, tx + r, tz + r, top, c, 0.4, 0.45);
  };
  const wet = { nz: [] as [number, number][], px: [] as [number, number][], pz: [] as [number, number][], nx: [] as [number, number][] };
  for (const g of gaps) wet[g.side].push([g.from, g.to]);
  /** one side: along its axis from -half to half, but for its gate and where it is open for water */
  const side = (k: 'nz' | 'px' | 'pz' | 'nx', half: number, gated: boolean, piece: (a: number, b: number) => void, pier: (at: number) => void) => {
    const open = [...wet[k], ...(gated ? [[-gate, gate] as [number, number]] : [])].sort((p, q) => p[0] - q[0]);
    let at = -half;
    for (const [from, to] of open) { if (from - at > 0.3) piece(at, from); at = Math.max(at, to); }
    if (half - at > 0.3) piece(at, half);
    for (const [from, to] of wet[k]) { if (from > -half + 1) pier(from); if (to < half - 1) pier(to); }
  };
  side('nz', w / 2, false, (p, q) => run(p, z0, q, z0 + t), (at) => tower(at, z0 + t / 2, 0.7, 2.7));
  side('nx', d / 2, false, (p, q) => run(x0, p, x0 + t, q), (at) => tower(x0 + t / 2, at, 0.7, 2.7));
  side('px', d / 2, true, (p, q) => run(x1 - t, p, x1, q), (at) => tower(x1 - t / 2, at, 0.7, 2.7));
  side('pz', w / 2, true, (p, q) => run(p, z1 - t, q, z1), (at) => tower(at, z1 - t / 2, 0.7, 2.7));
  /** whether a side is open at its end `end` (-1 its start, 1 its end) */
  const openAt = (k: 'nz' | 'px' | 'pz' | 'nx', half: number, end: number) => wet[k].some(([from, to]) => (end < 0 ? from <= -half + 1 : to >= half - 1));
  for (const [tx, tz, dry] of [[x0, z0, !openAt('nz', w / 2, -1) && !openAt('nx', d / 2, -1)], [x1, z0, !openAt('nz', w / 2, 1) && !openAt('px', d / 2, -1)], [x1, z1, !openAt('pz', w / 2, 1) && !openAt('px', d / 2, 1)], [x0, z1, !openAt('pz', w / 2, -1) && !openAt('nx', d / 2, 1)]] as [number, number, boolean][]) if (dry) tower(tx, tz, 1, 3.4);
  return b;
}
