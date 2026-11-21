// The bridges of a town (settlement feature 7, src/sim/settlement/bridges.ts): each from bank to bank on the middle
// line of its street, of stone on arches where a source says stone, else of timber on trestles, with houses on it where
// a source says so (London Bridge; the sources are listed in docs/SETTLEMENT_DESIGN.md).
// OWN RULE: an arch spans ARCH, a trestle stands every TRESTLE; London Bridge had 19 arches over 282 m (≈ 15 m each),
// Regensburg 16 over 336 m (≈ 21 m), and no source in hand gives one measure for the timber bridges of all towns.
import { Batch, type RGB, rgb, shade } from '../../lookprobe/batch';
import { along, type Faces } from '../core/along';

/** what a bridge is built of (src/sim/settlement/bridges.ts BRIDGE_KIND) */
const STONE = 1;
/** finest blocks (2 m): the span of an arch, the distance between two trestles, a pier's and a post's side */
const ARCH = 7.5,
  TRESTLE = 3,
  PIER = 1.2,
  POST = 0.2;
/** finest blocks: how far the deck of stone and of timber stands above the higher bank, along how much of its length
 *  at each end it ramps up from its bank, how far below the lower bank its arches spring (the water), how thick it is
 *  over the crown of an arch and on its trestles, how far the piers and posts reach below the springing, and the
 *  parapet's and the rail's height */
const STONE_UP = 1,
  TIMBER_UP = 0.4,
  RAMP = 1.5,
  SPRING = 1,
  CROWN = 0.4,
  PLANKS = 0.25,
  FOOT = 2,
  PARAPET = 0.5,
  RAIL = 0.55;
/** finest blocks: the houses on a bridge, how deep they reach out over the water, how long and how high each is */
const HOUSE_D = 2,
  HOUSE_L = 3,
  HOUSE_UP = 3;
/** slices across each arch, to round its underside */
const SLICES = 6;

/**
 * The bridges of a town from their rows ([x0, z0, x1, z1, kind, houses] in the units of the ground they stand over,
 * from where the batch is set), each `width` of those units wide, `size` of them to a finest block across and `up`
 * upright. `bank(x, z)` is the height of the ground there, or null where this ground does not know it; `mine(x, z)`
 * whether this piece of the world draws what stands there (each bridge is drawn by the piece its middle lies on).
 */
export function townBridge(
  rows: readonly (readonly number[])[],
  width: number,
  bank: (x: number, z: number) => number | null,
  mine: (x: number, z: number) => boolean,
  size = 1,
  up = 1,
): Batch {
  const b = new Batch(),
    stone = rgb(0xcdb89c),
    wood = rgb(0x8a6a48),
    plaster = rgb(0xd9ccb0);
  const faces = (c: RGB): Faces => ({ side: c, foot: shade(c, 0.82), top: shade(c, 0.94) });
  for (const [x0, z0, x1, z1, kind, houses] of rows) {
    if (!mine((x0 + x1) / 2, (z0 + z1) / 2)) continue;
    const y0 = bank(x0, z0),
      y1 = bank(x1, z1),
      line = along(b, x0, z0, x1, z1);
    if ((y0 === null && y1 === null) || !line) continue;
    const e0 = y0 ?? y1 ?? 0,
      e1 = y1 ?? e0,
      { len, box } = line,
      top = Math.max(e0, e1) + (kind === STONE ? STONE_UP : TIMBER_UP) * up,
      base = Math.min(e0, e1) - SPRING * up,
      floor = base - FOOT * up,
      ramp = RAMP * size,
      w = width / 2;
    /** the top of the deck `u` along it: up from each bank over the ramp, level between */
    const deck = (u: number) => Math.min(top, e0 + ((top - e0) * u) / ramp, e1 + ((top - e1) * (len - u)) / ramp);
    if (kind === STONE) {
      const c = faces(stone),
        n = Math.max(1, Math.round(len / (ARCH * size))),
        pier = Math.min(PIER * size, len / (3 * n)),
        crown = top - CROWN * up;
      for (let k = 0; k < n; k++) {
        // the arch between two piers: its underside rises from the springing (the water) to its crown
        const u0 = (len * k) / n + (k ? pier / 2 : 0),
          u1 = (len * (k + 1)) / n - (k < n - 1 ? pier / 2 : 0),
          half = (u1 - u0) / 2;
        for (let j = 0; j < SLICES; j++) {
          const a = u0 + ((u1 - u0) * j) / SLICES,
            e = u0 + ((u1 - u0) * (j + 1)) / SLICES,
            off = Math.abs((a + e) / 2 - u0 - half) / half,
            y = deck((a + e) / 2),
            under = Math.min(y - CROWN * up, base + (crown - base) * Math.sqrt(Math.max(0, 1 - off * off)));
          box(a, -w, e, w, under, y, c, true);
          for (const v of [-w, w - 0.2 * size]) box(a, v, e, v + 0.2 * size, y, y + PARAPET * up, c);
        }
        if (k < n - 1) {
          const y = deck(u1 + pier / 2);
          box(u1, -w, u1 + pier, w, floor, y, c);
          for (const v of [-w, w - 0.2 * size]) box(u1, v, u1 + pier, v + 0.2 * size, y, y + PARAPET * up, c);
        }
      }
    } else {
      const c = faces(wood),
        n = Math.max(1, Math.round(len / (TRESTLE * size))),
        slices = Math.max(1, Math.ceil(len / size)),
        p = POST * size;
      for (let j = 0; j < slices; j++) {
        const a = (len * j) / slices,
          e = (len * (j + 1)) / slices,
          y = deck((a + e) / 2);
        box(a, -w, e, w, y - PLANKS * up, y, c, true);
        for (const v of [-w, w - p]) box(a, v, e, v + p, y + (RAIL - 0.1) * up, y + RAIL * up, c);
      }
      // a trestle at every TRESTLE: a post at each side and one in the middle of a wide deck, down into the river bed
      for (let k = 1; k < n; k++) {
        const u = (len * k) / n;
        for (const v of w > 2 * size ? [-w, -p / 2, w - p] : [-w, w - p])
          box(u - p / 2, v, u + p / 2, v + p, floor, deck(u), c);
      }
      for (const v of [-w, w - p])
        for (let k = 0; k <= n; k++) {
          const u = Math.min(len - p, (len * k) / n);
          box(u, v, u + p, v + p, deck(u + p / 2), deck(u + p / 2) + RAIL * up, c);
        }
    }
    if (houses) {
      // houses along both sides, leaning out over the water, a gap between every two
      const c = faces(plaster),
        l = HOUSE_L * size,
        n = Math.floor(len / (2 * l));
      for (let k = 0; k < n; k++) {
        const u = (len - (2 * n - 1) * l) / 2 + 2 * k * l;
        for (const [v0, v1] of [
          [-w - HOUSE_D * size, -w + 0.3 * size],
          [w - 0.3 * size, w + HOUSE_D * size],
        ])
          box(u, v0, u + l, v1, top, top + HOUSE_UP * up, c, true);
      }
    }
  }
  return b;
}
