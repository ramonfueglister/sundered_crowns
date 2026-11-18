// The wall round a walled town.
import { Batch, rgb, shade } from '../../lookprobe/batch';
import { battlements } from '../core/solids';

/** Where a wall is open for water: on the side `side` of the rectangle, from `from` to `to` along it, measured from the side's middle. */
export interface WallGap { side: 'nz' | 'px' | 'pz' | 'nx'; from: number; to: number }

/** a river up to this wide is crossed by a water gate; wider water, a harbour or the sea, stays open. Its arches are at most ARCH wide and spring CROWN above the wall's foot */
const WATER_GATE = 12, ARCH = 3, CROWN = 0.9;

/**
 * A town wall round a rectangle of w × d: four runs with battlements, a turret on each corner, a gate in the middle of
 * the runs that face the viewer. Where a river or the sea crosses it (`gaps`) the wall is open, with a pier at each
 * end of the opening and, over a river, a water gate between them: the wall on arches; a corner that stands in the water has no turret.
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
  const side = (k: 'nz' | 'px' | 'pz' | 'nx', half: number, gated: boolean, piece: (a: number, b: number) => void, pier: (at: number) => void, over: (a: number, b: number) => void, post: (at: number) => void) => {
    const open = [...wet[k], ...(gated ? [[-gate, gate] as [number, number]] : [])].sort((p, q) => p[0] - q[0]);
    let at = -half;
    for (const [from, to] of open) { if (from - at > 0.3) piece(at, from); at = Math.max(at, to); }
    if (half - at > 0.3) piece(at, half);
    for (const [from, to] of wet[k]) {
      if (from > -half + 1) pier(from); if (to < half - 1) pier(to);
      // a water gate: between two piers the wall goes on over the water on arches, a post in the water every ARCH
      if (from <= -half + 1 || to >= half - 1 || to - from > WATER_GATE) continue;
      over(from, to);
      const arches = Math.ceil((to - from) / ARCH);
      for (let n = 1; n < arches; n++) post(from + ((to - from) * n) / arches);
    }
  };
  /** the wall over the water, from the arches' crown up, and a post of an arch */
  const span = (ax: number, az: number, bx: number, bz: number) => {
    b.box(ax, CROWN, az, bx, h, bz, c, { bottom: true, top: shade(c, 0.94) });
    battlements(b, ax, az, bx, bz, h, c, 0.4, 0.45);
  };
  const leg = (tx: number, tz: number) => b.box(tx - 0.3, -2, tz - t / 2, tx + 0.3, CROWN, tz + t / 2, shade(c, 0.9), { foot: 0.7 });
  const legX = (tx: number, tz: number) => b.box(tx - t / 2, -2, tz - 0.3, tx + t / 2, CROWN, tz + 0.3, shade(c, 0.9), { foot: 0.7 });
  side('nz', w / 2, false, (p, q) => run(p, z0, q, z0 + t), (at) => tower(at, z0 + t / 2, 0.7, 2.7), (p, q) => span(p, z0, q, z0 + t), (at) => leg(at, z0 + t / 2));
  side('nx', d / 2, false, (p, q) => run(x0, p, x0 + t, q), (at) => tower(x0 + t / 2, at, 0.7, 2.7), (p, q) => span(x0, p, x0 + t, q), (at) => legX(x0 + t / 2, at));
  side('px', d / 2, true, (p, q) => run(x1 - t, p, x1, q), (at) => tower(x1 - t / 2, at, 0.7, 2.7), (p, q) => span(x1 - t, p, x1, q), (at) => legX(x1 - t / 2, at));
  side('pz', w / 2, true, (p, q) => run(p, z1 - t, q, z1), (at) => tower(at, z1 - t / 2, 0.7, 2.7), (p, q) => span(p, z1 - t, q, z1), (at) => leg(at, z1 - t / 2));
  /** whether a side is open at its end `end` (-1 its start, 1 its end) */
  const openAt = (k: 'nz' | 'px' | 'pz' | 'nx', half: number, end: number) => wet[k].some(([from, to]) => (end < 0 ? from <= -half + 1 : to >= half - 1));
  for (const [tx, tz, dry] of [[x0, z0, !openAt('nz', w / 2, -1) && !openAt('nx', d / 2, -1)], [x1, z0, !openAt('nz', w / 2, 1) && !openAt('px', d / 2, -1)], [x1, z1, !openAt('pz', w / 2, 1) && !openAt('px', d / 2, 1)], [x0, z1, !openAt('pz', w / 2, -1) && !openAt('nx', d / 2, 1)]] as [number, number, boolean][]) if (dry) tower(tx, tz, 1, 3.4);
  return b;
}
