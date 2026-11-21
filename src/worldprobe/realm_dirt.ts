// Where the realms' map changed, for realms.ts: a tile painted before a change that touches it shows old realms
// and is painted anew.
import { type Held, TILE } from './realm_tiles';

/** where the map changed with the realms of `age`, as rectangles of map pixels (realms.worker.ts `RealmsDone.dirty`) */
interface Dirt {
  age: number;
  rects: number[];
}
/** changes kept to test tiles that come late against; a tile older than the oldest is painted anew */
const DIRT_KEPT = 64;

interface Dirty {
  /** Whether a tile painted for the realms of `painted` shows realms that have changed since where it lies. */
  outdated(level: number, x: number, y: number, painted: number): boolean;
  /** The map changed there with the realms of `since`: the tiles of `held` there that show older realms are painted anew. */
  soil(since: number, rects: number[] | undefined, held: Iterable<Held>): void;
}

/** The changes of a map of which `cells` cells lie along a map pixel, and after `round` cells the world begins again. */
export function createDirt(o: { cells: number; round: number }): Dirty {
  const dirt: Dirt[] = [];
  let forgot = 0;
  /** whether the tile (level, x, y) touches a rectangle of map pixels of `rects`, with the margin its shading reaches */
  const touches = (level: number, x: number, y: number, rects: number[]) => {
    const side = (TILE * 2 ** level) / o.cells,
      pad = Math.max(8, (6 * 2 ** level) / o.cells),
      round = Number.isFinite(o.round) ? o.round / o.cells : 0;
    // round the globe the tiles go on with the laps: the tile on the game map's own lap
    let x0 = x * side;
    if (round) x0 = ((x0 % round) + round) % round;
    const x1 = x0 + side,
      y0 = y * side,
      y1 = y0 + side;
    for (let k = 0; k < rects.length; k += 4) {
      if (rects[k + 1] - pad >= y1 || rects[k + 3] + pad <= y0) continue;
      for (const lap of round ? [0, round, -round] : [0])
        if (rects[k] + lap - pad < x1 && rects[k + 2] + lap + pad > x0) return true;
    }
    return false;
  };
  return {
    outdated: (level, x, y, painted) =>
      painted < forgot || dirt.some((d) => d.age > painted && touches(level, x, y, d.rects)),
    soil(since, rects, held) {
      if (!rects?.length) return;
      dirt.push({ age: since, rects });
      while (dirt.length > DIRT_KEPT) forgot = dirt.shift()!.age;
      for (const h of held) if (h.age < since && !h.old && touches(h.level, h.x, h.y, rects)) h.old = true;
    },
  };
}
