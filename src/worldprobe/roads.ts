// The ways of the world (public/data/roads_<year>.json, tools/roads/build_roads.ts): lines over the map from town to
// town and from every place near them to the nearest way. world.ts draws them on the ground: at the finest step as a
// band of beaten earth, from afar as the same band drawn at least so wide that it can be followed, the busier
// ways longer than the tracks.
import { MinHeap } from '../sim/minheap';
import { N } from '../lookprobe/layout';

/**
 * The kinds of way. `half`: half the width drawn at the finest step, in finest blocks (some 130 m in middle Europe: a
 * way is drawn some ten times as wide as it was, as the rivers and the houses are; a diorama). `until`: the coarsest step
 * of the world graphic that still shows it (steps 0 … 7).
 */
export const ROAD_KINDS: readonly { name: string; half: number; until: number }[] = [
  { name: 'track', half: 0.55, until: 2 },
  { name: 'road', half: 0.8, until: 4 },
  { name: 'highway', half: 1.05, until: 6 },
];

/** the file */
interface RoadsJson {
  year: number;
  lines: { k: number; p: number[] }[];
  between: [number, number, number][];
}
/** A way as a line in map pixels: its kind and its points (x0, y0, x1, y1, …), the middles of the pixels it runs through, smoothed. */
export interface Road {
  k: number;
  p: Float32Array;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * A line relaxed into a curve: laid out at points `every` apart along its length, and each point moved to the
 * Gaussian-weighted mean of the points about it (`sigma` along the line, in the line's units). The window is cut to
 * the same length on both sides, so the ends stay where they are and two lines that meet still meet. A way laid
 * over a grid of pixels or blocks runs in steps of 45 degrees; relaxed it bends as a road does.
 */
export function relaxPoints(
  pts: readonly (readonly [number, number])[],
  sigma: number,
  every: number,
): [number, number][] {
  if (pts.length < 3) return pts.map(([x, z]): [number, number] => [x, z]);
  // even points along the line
  const xs: number[] = [pts[0][0]],
    zs: number[] = [pts[0][1]];
  let carry = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, az] = pts[k],
      [bx, bz] = pts[k + 1],
      len = Math.hypot(bx - ax, bz - az);
    let t = every - carry;
    for (; t < len; t += every) {
      xs.push(ax + ((bx - ax) * t) / len);
      zs.push(az + ((bz - az) * t) / len);
    }
    carry = len - (t - every);
  }
  const [lx, lz] = pts[pts.length - 1];
  if (Math.hypot(lx - xs[xs.length - 1], lz - zs[zs.length - 1]) > every * 0.25) {
    xs.push(lx);
    zs.push(lz);
  } else {
    xs[xs.length - 1] = lx;
    zs[zs.length - 1] = lz;
  }
  const n = xs.length,
    reach = Math.ceil((3 * sigma) / every),
    w = Array.from({ length: reach + 1 }, (_, k) => Math.exp(-0.5 * ((k * every) / sigma) ** 2));
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.min(reach, i, n - 1 - i);
    let sx = 0,
      sz = 0,
      sw = 0;
    for (let k = -r; k <= r; k++) {
      const wk = w[Math.abs(k)];
      sx += xs[i + k] * wk;
      sz += zs[i + k] * wk;
      sw += wk;
    }
    out.push([sx / sw, sz / sw]);
  }
  return out;
}

/** a line of the map is relaxed over this many pixels (some 3 km in middle Europe), at points this far apart */
export const LINE_SIGMA = 1.5,
  LINE_EVERY = 0.5;

/** The line of a way in the middles of its map pixels, relaxed into a curve (`relaxPoints`). */
export function smoothLine(p: readonly number[]): Float32Array {
  const pts: [number, number][] = [];
  for (let i = 0; i < p.length; i += 2) pts.push([p[i] + 0.5, p[i + 1] + 0.5]);
  return Float32Array.from(relaxPoints(pts, LINE_SIGMA, LINE_EVERY).flat());
}

const roadsOf = (j: RoadsJson): Road[] =>
  j.lines.map((l) => {
    const p = smoothLine(l.p);
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      x0 = Math.min(x0, p[i]);
      x1 = Math.max(x1, p[i]);
      y0 = Math.min(y0, p[i + 1]);
      y1 = Math.max(y1, p[i + 1]);
    }
    return { k: l.k, p, x0, y0, x1, y1 };
  });

const loaded = new Map<number, Promise<Road[] | null>>();
/** the ways of a start year (once per year); null where the year has none */
export function loadRoads(base: string, year: number): Promise<Road[] | null> {
  let p = loaded.get(year);
  if (!p) {
    p = fetch(`${base}data/roads_${year}.json`)
      .then(async (r) =>
        r.ok && (r.headers.get('content-type') ?? '').includes('json') ? roadsOf((await r.json()) as RoadsJson) : null,
      )
      .catch(() => null);
    loaded.set(year, p);
  }
  return p;
}

/** The ways that cross a window of the map (pixels x0 ≤ x < x1, y0 ≤ y < y1). */
export const roadsIn = (roads: readonly Road[], x0: number, y0: number, x1: number, y1: number) =>
  roads.filter((r) => r.x1 >= x0 && r.x0 < x1 && r.y1 >= y0 && r.y0 < y1);

/** a way is pinned where its line crosses every PIN-th row and column of world blocks; between pins it finds its own path */
const PIN = 24;
/** how far a way may stray from the straight line between two pins, in blocks */
export const STRAY = 9;
/**
 * The way at the finest step. The line of the map is laid on map pixels (some 2 km) and knows nothing of the
 * valleys and rocks a block shows. So it is held at pins, where it crosses the PIN-th rows and columns of the world's
 * blocks (the same blocks in every ground, so that grounds side by side lay the same way), and between two pins the
 * way takes the cheapest path over the ground's own columns (Galin et al. 2010 at the scale of the blocks): a step
 * costs its length, more for every block it climbs (squared, so that the way winds up a slope rather than straight
 * over it), more through rock, and a river is crossed on a bridge. Gives the path as points of the ground (column
 * middles), or the line as it was where a stretch reaches out of the ground.
 *
 * `pts`: the line in ground blocks; `ox`, `oz`: the ground's first world block; `n`: its side; `h`, `rock`, `wet`:
 * per column its top in blocks, whether it is rock, whether it is water (2: a lake or the sea, which no way crosses).
 */
export function wayOnGround(
  pts: readonly (readonly [number, number])[],
  ox: number,
  oz: number,
  n: number,
  h: Int16Array,
  rock: (i: number) => boolean,
  wet: Uint8Array,
): [number, number][] {
  // the line at every block of its length
  const fine: [number, number][] = [];
  for (let s = 0; s + 1 < pts.length; s++) {
    const [ax, az] = pts[s],
      [bx, bz] = pts[s + 1],
      len = Math.hypot(bx - ax, bz - az),
      steps = Math.max(1, Math.ceil(len));
    for (let k = 0; k < steps; k++) fine.push([ax + ((bx - ax) * k) / steps, az + ((bz - az) * k) / steps]);
  }
  if (pts.length) fine.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  // the pins: the first point of the line in each new square of PIN world blocks
  const pins: number[] = [];
  let last = '';
  fine.forEach(([x, z], k) => {
    const key = `${Math.floor((x + ox) / PIN)},${Math.floor((z + oz) / PIN)}`;
    if (key !== last) {
      pins.push(k);
      last = key;
    }
  });
  if (pins[pins.length - 1] !== fine.length - 1) pins.push(fine.length - 1);
  const out: [number, number][] = [];
  const inside = (x: number, z: number) => x >= 1 && z >= 1 && x < n - 1 && z < n - 1;
  for (let p = 0; p + 1 < pins.length; p++) {
    const a = fine[pins[p]],
      b = fine[pins[p + 1]];
    const ax = Math.floor(a[0]),
      az = Math.floor(a[1]),
      bx = Math.floor(b[0]),
      bz = Math.floor(b[1]);
    const x0 = Math.min(ax, bx) - STRAY,
      z0 = Math.min(az, bz) - STRAY,
      x1 = Math.max(ax, bx) + STRAY,
      z1 = Math.max(az, bz) + STRAY;
    const path =
      inside(x0, z0) && inside(x1, z1) ? cheapestOnGround(ax, az, bx, bz, x0, z0, x1, z1, n, h, rock, wet) : null;
    if (path) {
      for (const q of path)
        if (!out.length || out[out.length - 1][0] !== q[0] || out[out.length - 1][1] !== q[1]) out.push(q);
    } else for (let k = pins[p]; k <= pins[p + 1]; k++) out.push([fine[k][0], fine[k][1]]);
  }
  return out;
}

/** blocks of cost for a step through rock, on top of its length */
const ROCK_COST = 2.5;
/** blocks of cost for a step for every block it climbs, squared */
const CLIMB_COST = 3;
/** blocks of cost for a step onto a river's water (a bridge) */
const BRIDGE_COST = 6;
function cheapestOnGround(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  n: number,
  h: Int16Array,
  rock: (i: number) => boolean,
  wet: Uint8Array,
): [number, number][] | null {
  const w = x1 - x0 + 1,
    d = z1 - z0 + 1,
    cost = new Float64Array(w * d).fill(Infinity),
    from = new Int32Array(w * d).fill(-1),
    done = new Uint8Array(w * d);
  const local = (x: number, z: number) => (z - z0) * w + (x - x0);
  // the straight line between the pins: a way strays at most STRAY blocks from it
  const lx = bx - ax,
    lz = bz - az,
    l2 = lx * lx + lz * lz || 1;
  const near = (x: number, z: number) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * lx + (z - az) * lz) / l2));
    return Math.hypot(x - ax - t * lx, z - az - t * lz) <= STRAY;
  };
  const open = new MinHeap(),
    s = local(ax, az),
    e = local(bx, bz);
  const guess = (x: number, z: number) => Math.hypot(x - bx, z - bz);
  cost[s] = 0;
  open.push(guess(ax, az), s);
  while (open.size) {
    const i = open.popVal();
    if (done[i]) continue;
    done[i] = 1;
    if (i === e) break;
    const x = (i % w) + x0,
      z = Math.floor(i / w) + z0,
      gi = z * n + x;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx,
          nz = z + dz;
        if (nx < x0 || nz < z0 || nx > x1 || nz > z1 || !near(nx, nz)) continue;
        const j = local(nx, nz),
          gj = nz * n + nx;
        if (done[j] || wet[gj] === 2) continue;
        const len = dx && dz ? Math.SQRT2 : 1,
          climb = wet[gj] || wet[gi] ? 0 : Math.abs(h[gj] - h[gi]);
        const c =
          cost[i] + len * (1 + (rock(gj) ? ROCK_COST : 0)) + CLIMB_COST * climb * climb + (wet[gj] ? BRIDGE_COST : 0);
        if (c < cost[j]) {
          cost[j] = c;
          from[j] = i;
          open.push(c + guess(nx, nz), j);
        }
      }
  }
  if (!done[e]) return null;
  const path: [number, number][] = [];
  for (let k = e; k >= 0; k = from[k]) path.push([(k % w) + x0 + 0.5, Math.floor(k / w) + z0 + 0.5]);
  return path.reverse();
}

/** blocks to a way where none is near (finite, so that the corners can be blended) */
export const FAR_FROM_ROADS = 1e4;
/** the ground takes the colour of a path up to about this many blocks from its line (lookprobe/terrain.ts topColor): a way's band edge is put there */
export const ROAD_SHOWS = 1.65;
/** Blocks to the edge of the nearest way's band at a ground point: bilinear between the corners of the columns, `edge` ((N + 1)² corners) as world.ts `buildWorld` lays it out. */
export function roadOn(edge: Float32Array, x: number, z: number): number {
  const fx = Math.max(0, Math.min(N - 1e-6, x)),
    fz = Math.max(0, Math.min(N - 1e-6, z)),
    x0 = Math.floor(fx),
    z0 = Math.floor(fz),
    u = fx - x0,
    v = fz - z0,
    i = z0 * (N + 1) + x0;
  return (edge[i] * (1 - u) + edge[i + 1] * u) * (1 - v) + (edge[i + N + 1] * (1 - u) + edge[i + N + 2] * u) * v;
}
