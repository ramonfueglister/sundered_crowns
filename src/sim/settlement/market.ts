// Where the market of a town lies (src/sim/settlement/streets.ts, layTown, step 1 of its rules): the middle nearest
// the centre whose square, and the street round it (`hw` steps to either side of the lane round a square `half` steps
// to each side), lie on open ground.
import type { ParcelSize } from './rule';

/** how far from the centre the market looks for open ground, in parcel depths. PLACEHOLDER */
const MARKET_SEARCH = 3;

/** the offsets of a square of 2q + 1 by 2q + 1, the nearest first (ties: north before south, west before east) */
const offsets = new Map<number, Int16Array>();
const offsetsOf = (q: number) => {
  let o = offsets.get(q);
  if (!o) {
    const all: [number, number][] = [];
    for (let z = -q; z <= q; z++) for (let x = -q; x <= q; x++) if (x * x + z * z <= q * q) all.push([x, z]);
    all.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]) || a[1] - b[1] || a[0] - b[0]);
    o = Int16Array.from(all.flat());
    offsets.set(q, o);
  }
  return o;
};

/** Where the market of a town lies: the middle nearest the centre whose square and the street round it lie on
 *  open ground. In the world graphic the church stands at the centre (src/worldprobe/settle.ts), and the market lies
 *  beside it, as the market of many a medieval town lay at the church (OWN RULE). Without such ground within
 *  MARKET_SEARCH parcel depths, within four times as far (a town whose landmarks take the open ground at its centre,
 *  feature 5), and without it at all at the centre. */
export function marketAt(
  size: ParcelSize,
  free: (x: number, z: number) => boolean,
  { hw, half }: { hw: number; half: number },
): [number, number] {
  // first near (most churches are small), then as far as the search goes: the same answer, the nearest first
  return (
    marketWithin(free, Math.round(size.d), hw, half) ??
    marketWithin(free, Math.round(MARKET_SEARCH * size.d), hw, half) ??
    marketWithin(free, Math.round(4 * MARKET_SEARCH * size.d), hw, half) ?? [0, 0]
  );
}
function marketWithin(
  free: (x: number, z: number) => boolean,
  q: number,
  hw: number,
  half: number,
): [number, number] | null {
  const k = half + 2 * hw,
    S = q + k,
    n = 2 * S + 2;
  // the blocked metres summed over the square of the search, to test a market's square in one step
  const taken = new Int32Array(n * n);
  for (let z = 1; z < n; z++)
    for (let x = 1, row = 0; x < n; x++) {
      if (!free(x - 1 - S, z - 1 - S)) row++;
      taken[z * n + x] = taken[(z - 1) * n + x] + row;
    }
  const o = offsetsOf(q);
  for (let j = 0; j < o.length; j += 2) {
    const a = o[j] - k + S,
      b = o[j + 1] - k + S,
      c = o[j] + k + S + 1,
      d = o[j + 1] + k + S + 1;
    if (taken[d * n + c] - taken[b * n + c] - taken[d * n + a] + taken[b * n + a] === 0) return [o[j], o[j + 1]];
  }
  return null;
}
