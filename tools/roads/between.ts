// The ways between the places of the map, for the simulation (tools/roads/build_roads.ts): which places the net of
// ways joins, the best kind of way between two of them, how long it is and what effort it takes.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { MinHeap } from '../../src/sim/minheap';
import { slopeTime } from '../../src/sim/roads';
import { direction, type Land } from './land';

/** the way from place `a` to place `b` (indices of geo.json loc): `k` the best kind on it, `km` its length, `effort`
 *  those km weighted by the time their slopes take, `straight` the km of the straight line between its ends */
export interface Between {
  a: number;
  b: number;
  k: number;
  km: number;
  effort: number;
  straight: number;
}

/** What the finished net of tools/roads/build_roads.ts gives. */
interface Net {
  /** the steps the ways take, as pairs of neighbouring pixels, and the neighbours of each pixel on a way */
  links: Set<number>;
  nbr: Map<number, number[]>;
  /** the kind of way on each pixel */
  kind: Uint8Array;
  /** the cost of a step from pixel i to its neighbour j in direction d (km of level road), and the share of it a step
   *  costs where a way already runs */
  stepCost: (i: number, j: number, d: number, y: number) => number;
  REUSE: number;
}

/** The ways between the places of the map, by the pair of places. */
export function waysBetween(ROOT: string, land: Land, net: Net): Map<string, Between> {
  const { geo, W, kmRow, X0, Y0, w, n, height } = land,
    { links, nbr, kind, stepCost, REUSE } = net;
  const ids = new Uint16Array(gunzipSync(readFileSync(resolve(ROOT, 'public/map/ids.bin.gz'))).buffer.slice(0));
  /** the place of the map a pixel of the window lies in (-1: none, or sea) */
  const placeOf = (i: number) => {
    const l = ids[(Math.floor(i / w) + Y0) * W + (i % w) + X0] - 1;
    return l >= 0 && l < geo.L ? l : -1;
  };
  const between = new Map<string, Between>();
  for (const key of links) {
    const a = Math.floor(key / n),
      b = key % n,
      la = placeOf(a),
      lb = placeOf(b);
    if (la === lb || la < 0 || lb < 0) continue;
    const id = la < lb ? `${la},${lb}` : `${lb},${la}`,
      k = Math.min(kind[a], kind[b]);
    const e =
      between.get(id) ??
      between.set(id, { a: Math.min(la, lb), b: Math.max(la, lb), k, km: 0, effort: 0, straight: 0 }).get(id)!;
    e.k = Math.max(e.k, k);
  }
  /**
   * How long the way from one place to the next is, its effort, and the straight line between its ends: from the pixel of the way nearest the first
   * place's middle to the pixel nearest the second's, along the way as it was laid (the cheapest to build), over the
   * way's pixels in the two places, or over all of them where the way leaves the two places between them. Effort is
   * the km weighted by the time their slopes take (src/sim/roads.ts slopeTime, Tobler's hiking function): the
   * simulation's days come from it.
   */
  {
    const near = new Map<number, number>();
    for (const i of nbr.keys()) {
      const l = placeOf(i);
      if (l < 0) continue;
      const d = Math.hypot((i % w) + X0 + 0.5 - geo.loc.x[l], Math.floor(i / w) + Y0 + 0.5 - geo.loc.y[l]),
        best = near.get(l);
      if (
        best === undefined ||
        d < Math.hypot((best % w) + X0 + 0.5 - geo.loc.x[l], Math.floor(best / w) + Y0 + 0.5 - geo.loc.y[l])
      )
        near.set(l, i);
    }
    const dirOf = (a: number, b: number) => direction(w, a, b);
    const q = new MinHeap(),
      dist = new Map<number, [number, number, number]>();
    const measure = (e: { a: number; b: number; km: number; effort: number; straight: number }, within: boolean) => {
      const s = near.get(e.a)!,
        t = near.get(e.b)!,
        straight =
          Math.hypot((s % w) - (t % w), Math.floor(s / w) - Math.floor(t / w)) *
          kmRow[Math.floor((s + t) / 2 / w) + Y0],
        far = 6 * straight + 20;
      q.clear();
      dist.clear();
      dist.set(s, [0, 0, 0]);
      q.push(0, s);
      while (q.size) {
        const d = q.peekKey(),
          u = q.popVal(),
          [du, ku, tu] = dist.get(u)!;
        if (d > du) continue;
        if (u === t) {
          e.km = ku;
          e.effort = tu;
          e.straight = straight;
          return;
        }
        if (ku > far) return;
        for (const v of nbr.get(u)!) {
          const pl = placeOf(v);
          if (within && pl !== e.a && pl !== e.b) continue;
          const dir = dirOf(u, v),
            step = kmRow[Math.floor(u / w) + Y0] * (dir < 4 ? 1 : Math.SQRT2),
            c = du + stepCost(u, v, dir, Math.floor(u / w)) / REUSE;
          const had = dist.get(v);
          if (!had || c < had[0]) {
            dist.set(v, [c, ku + step, tu + step * slopeTime((height[v] - height[u]) / (step * 1000))]);
            q.push(c, v);
          }
        }
      }
    };
    for (const e of between.values()) {
      measure(e, true);
      if (!(e.km > 0)) measure(e, false);
    }
  }
  return between;
}
