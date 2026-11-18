// The ways of the world (public/data/roads_<year>.json, tools/roads/build_roads.ts): lines over the map from town to
// town and from every place near them to the nearest way. world.ts draws them on the ground: at the finest step as a
// band of beaten earth, from afar as a line of blocks coloured by how much of them the way covers, the busier ways
// longer than the tracks.
import { type RGB, rgb } from '../lookprobe/batch';

/**
 * The kinds of way. `half`: half the width drawn at the finest step, in finest blocks (some 130 m in middle Europe: a
 * way is drawn some ten times as wide as it was, as the rivers and the houses are; a diorama). `until`: the coarsest step
 * of the world graphic that still shows it (steps 0 … 7). `colour`: linear RGB of its surface.
 */
export const ROAD_KINDS: readonly { name: string; half: number; until: number; colour: RGB }[] = [
  { name: 'track', half: 0.55, until: 2, colour: rgb(0x7d6847) },
  { name: 'road', half: 0.8, until: 4, colour: rgb(0x8c7149) },
  { name: 'highway', half: 1.05, until: 6, colour: rgb(0x9a7d52) },
];

/** the file */
export interface RoadsJson { year: number; lines: { k: number; p: number[] }[]; between: [number, number, number][] }
/** A way as a line in map pixels: its kind and its points (x0, y0, x1, y1, …), the middles of the pixels it runs through, smoothed. */
export interface Road { k: number; p: Float32Array; x0: number; y0: number; x1: number; y1: number }

/**
 * The lines run from pixel middle to pixel middle; drawn as they are they zigzag. Each is smoothed by corner cutting
 * (Chaikin 1974), three rounds, its ends kept, and so becomes a curve that winds as the land does.
 */
export function smoothLine(p: readonly number[]): Float32Array {
  let pts: number[] = [];
  for (let i = 0; i < p.length; i += 2) pts.push(p[i] + 0.5, p[i + 1] + 0.5);
  for (let round = 0; round < 3 && pts.length >= 6; round++) {
    const out = [pts[0], pts[1]];
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
      out.push(0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by, 0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by);
    }
    out.push(pts[pts.length - 2], pts[pts.length - 1]);
    pts = out;
  }
  return Float32Array.from(pts);
}

export const roadsOf = (j: RoadsJson): Road[] => j.lines.map((l) => {
  const p = smoothLine(l.p);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
  return { k: l.k, p, x0, y0, x1, y1 };
});

const loaded = new Map<number, Promise<Road[] | null>>();
/** the ways of a start year (once per year); null where the year has none */
export function loadRoads(base: string, year: number): Promise<Road[] | null> {
  let p = loaded.get(year);
  if (!p) {
    p = fetch(`${base}data/roads_${year}.json`).then(async (r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? roadsOf(await r.json() as RoadsJson) : null)).catch(() => null);
    loaded.set(year, p);
  }
  return p;
}

/** The ways that cross a window of the map (pixels x0 ≤ x < x1, y0 ≤ y < y1). */
export const roadsIn = (roads: readonly Road[], x0: number, y0: number, x1: number, y1: number) => roads.filter((r) => r.x1 >= x0 && r.x0 < x1 && r.y1 >= y0 && r.y0 < y1);
