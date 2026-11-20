// Which tiles of the realms' map lie where for a view, for realms.ts: how far a tile lies outside the picture, the
// tiles of a level about it, what a view asks for and in which order, and how many tiles of the picture lie under no
// painted tile.
import { cellOfBlock } from './land';
import type { View } from './pieces';
import { keyOf } from './pyramid';
import { TILE } from './realm_tiles';
import { PAPER_COARSEST } from './zoom';

/** tiles are painted ahead of need this far around the picture, as a share of its width */
const AHEAD = 0.3;
/** how much wider than its middle the far side of the picture is, and how far beyond its far edge the ground is seen, as shares of its half width and depth */
const FAR_SIDE = 1.2,
  FAR_END = 1.1;
/**
 * The ranks of what a view asks for: the coarser level under the picture by its distance from the middle, then the
 * view's own level in the picture (`own` and the distance), every coarser level under the picture (`under`, the
 * coarsest first), and the view's own level around the picture (`around` and the distance).
 */
export const RANK = { own: 1e9, under: 1.5e9, around: 2e9 } as const;

/** a tile the view asks for */
export interface Want {
  key: string;
  level: number;
  x: number;
  y: number;
  rank: number;
  /** the realms it was asked for (realms.ts `set`) */
  age: number;
}

/** a tile of a level about the picture: its place, how far it lies outside the picture, and from its middle */
interface Near {
  x: number;
  y: number;
  out: number;
  far: number;
}

interface Sight {
  /** cells from the game map as the names know it to the lap of the globe whose game map lies nearest the picture */
  lap: number;
  /** How far a tile lies outside the picture, in finest cells (0: it reaches into it); the map's cells run with the picture's sides. */
  outside(l: number, x: number, y: number): number;
  /** The tiles of a level on the game map within `around` cells of the picture. */
  near(l: number, around: number): Near[];
}

/** The tiles about the picture of the view `v`, on a game map `map` cells wide and high that comes again after `round` cells (a world `rows` high). */
export function sightOf(v: View, o: { map: readonly [number, number]; round: number; rows?: number }): Sight {
  // (the far side of a slanted picture is wider than its middle, and what stands tall is seen beyond its far edge: the tiles reach that far)
  const [u, cv] = cellOfBlock(v.x, v.z),
    halfW = (v.wide / 2) * FAR_SIDE,
    halfD = (v.wide / v.aspect / Math.sin((v.elevation * Math.PI) / 180) / 2) * FAR_END;
  // the lap of the globe whose game map lies nearest the picture
  const lap = Number.isFinite(o.round) ? Math.round((u - o.map[0] / 2) / o.round) * o.round : 0;
  const cu = u - lap;
  const outside = (l: number, x: number, y: number) => {
    const side = TILE * 2 ** l;
    return Math.max(
      0,
      Math.abs((x + 0.5) * side - cu) - halfW - side / 2,
      Math.abs((y + 0.5) * side - cv) - halfD - side / 2,
    );
  };
  const near = (l: number, around: number) => {
    const side = TILE * 2 ** l,
      list: Near[] = [];
    // round the globe the map goes on (beyond the game map as land and water alone, paint.ts); a map that is not the
    // whole world ends at its edges
    const wraps = Number.isFinite(o.round),
      rows = wraps ? (o.rows ?? o.map[1]) : o.map[1],
      west = cu - halfW - around,
      east = cu + halfW + around;
    for (
      let y = Math.max(0, Math.floor((cv - halfD - around) / side));
      y * side <= Math.min(rows - 1, cv + halfD + around);
      y++
    )
      for (
        let x = wraps ? Math.floor(west / side) : Math.max(0, Math.floor(west / side));
        x * side <= (wraps ? east : Math.min(o.map[0] - 1, east));
        x++
      )
        list.push({ x, y, out: outside(l, x, y), far: Math.hypot((x + 0.5) * side - cu, (y + 0.5) * side - cv) });
    return list;
  };
  return { lap, outside, near };
}

/**
 * What the view asks for once the realms are near, for the realms of `age`: the coarser level under the picture
 * first, then its own level in the picture, then every coarser level under the picture, the coarsest first (a tile or
 * two each, and the whole map lies in the coarsest: so wherever the view goes next and however far it zooms out at
 * once, the land it comes to lies under the realms' colours from the first picture on, coarsely until its own tiles
 * are painted; without them it showed its own colours there for a moment), then around the picture. Without `ahead`
 * only the picture's own tiles.
 */
export function wantedOf(s: Sight, level: number, ahead: boolean, wide: number, age: number): Want[] {
  const wanted: Want[] = [],
    want = (l: number, t: { x: number; y: number }, rank: number) =>
      wanted.push({ key: keyOf(l, t.x, t.y), level: l, x: t.x, y: t.y, rank, age });
  if (ahead && level < PAPER_COARSEST) for (const t of s.near(level + 1, 0)) want(level + 1, t, t.far);
  for (const t of s.near(level, ahead ? AHEAD * wide : 0)) want(level, t, (t.out > 0 ? RANK.around : RANK.own) + t.far);
  if (ahead) for (let l = level + 2; l <= PAPER_COARSEST; l++) for (const t of s.near(l, 0)) want(l, t, RANK.under - l);
  return wanted;
}

/** How many tiles of `level` in the picture lie under no painted tile of any level (`has`: whether a tile is painted), so that the land shows there without the realms' colours. */
export function bareIn(s: Sight, level: number, has: (key: string) => boolean): number {
  let bare = 0;
  for (const t of s.near(level, 0)) {
    let l = level,
      x = t.x,
      y = t.y;
    while (l <= PAPER_COARSEST && !has(keyOf(l, x, y))) {
      l++;
      x >>= 1;
      y >>= 1;
    }
    if (l > PAPER_COARSEST) bare++;
  }
  return bare;
}
