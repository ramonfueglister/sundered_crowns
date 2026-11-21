// A far piece's table as a run of bytes, to be zipped and kept (tools/worldprobe/build_tables.ts) and read back by
// the worker that draws the piece (piece.worker.ts).
import { Mat, SUMMIT } from '../lookprobe/layout';
import { pack, unpack } from './pack';
import type { Table } from './table';

/** what a packed table holds: the table's lists in fewer bytes (see `packTable`) */
interface Packed extends Omit<Table, 'occ' | 'share' | 'top' | 'flank' | 'bleach' | 'summit'> {
  /** marks the way a table is packed: a run of another way is not read */
  packed: typeof PACKED;
  lift: Float32Array;
  share: Uint8Array;
  pair: Uint16Array;
  pairs: Uint16Array;
  bleach: Uint8Array;
  summit: Uint8Array;
  pale: Uint8Array;
}
const PACKED = 1;
/** the steps a packed table keeps of the meadow's bleach (0 … 1) and of a rock column's height on its massif (0 … 2) */
const BLEACH_STEPS = 32,
  SUMMIT_STEPS = 127;

/**
 * A table as a run of bytes (pack.ts), to be zipped and kept. The lists are packed so that they zip well, and what
 * is lost is far less than a colour's own step of a 255th:
 *  - what blocks the sky as its height over the column (nought nearly everywhere), to the last bit;
 *  - the two colours of what a column carries as one number for the pair;
 *  - the share of the cover as a byte: full stays full, and it stays on its side of a half (terrain.ts CARRIED_FROM);
 *  - the meadow's bleach in 32 steps (it moves a colour by a 30th of that at most), and only where a top or a bank
 *    asks for it: within a column of open or half covered green land or of water;
 *  - a rock column's height on its massif in steps of a 127th, and whether it is pale, which is kept as it was.
 */
export function packTable(table: Table): ArrayBuffer {
  const { side, occ, share, top, flank, bleach, summit, ...rest } = table,
    n = side * side;
  const lift = new Float32Array(n),
    pair = new Uint16Array(n),
    pairs: number[] = [],
    known = new Map<number, number>(),
    asked = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    lift[i] = occ[i] - table.h[i];
    if (Math.fround(table.h[i] + lift[i]) !== occ[i]) throw new Error('table: a height that cannot be packed');
    if (!table.has[i]) continue;
    const key = top[i] * 65536 + flank[i];
    let k = known.get(key);
    if (k === undefined) {
      k = pairs.length / 2;
      if (k > 65535) throw new Error('table: more pairs of colours than a table holds');
      known.set(key, k);
      pairs.push(top[i], flank[i]);
    }
    pair[i] = k;
  }
  // the bleach is asked for at the corners of grass and soil that are not wholly covered, and along the water's banks
  for (let z = 0; z < side; z++)
    for (let x = 0; x < side; x++) {
      const i = z * side + x,
        green = table.mat[i] === Mat.Grass || table.mat[i] === Mat.Soil;
      if (!table.wet[i] && !(green && !(table.has[i] && !(share[i] < 1)))) continue;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++)
          if (x + dx >= 0 && z + dz >= 0 && x + dx < side && z + dz < side) asked[i + dz * side + dx] = 1;
    }
  return pack({
    ...rest,
    packed: PACKED,
    side,
    lift,
    pair,
    pairs: Uint16Array.from(pairs),
    share: Uint8Array.from(share, (v) => Math.round(Math.max(0, Math.min(1, v)) * 255)),
    bleach: Uint8Array.from(bleach, (v, i) => (asked[i] ? Math.round(Math.max(0, Math.min(1, v)) * BLEACH_STEPS) : 0)),
    summit: Uint8Array.from(summit, (v) => Math.round(Math.max(0, Math.min(2, v)) * SUMMIT_STEPS)),
    pale: Uint8Array.from(summit, (v) => (v > SUMMIT ? 1 : 0)),
  } satisfies Packed);
}
export function unpackTable(run: ArrayBuffer): Table {
  const { packed, lift, pair, pairs, share, bleach, summit, pale, ...rest } = unpack<Packed>(run),
    n = rest.side * rest.side;
  if (packed !== PACKED) throw new Error('table: packed another way');
  const occ = new Float32Array(n),
    top = new Uint16Array(n),
    flank = new Uint16Array(n),
    high = new Float32Array(n);
  const shared = new Float32Array(share.length),
    bleached = new Float32Array(bleach.length);
  for (let i = 0; i < shared.length; i++) shared[i] = share[i] / 255;
  for (let i = 0; i < bleached.length; i++) bleached[i] = bleach[i] / BLEACH_STEPS;
  for (let i = 0; i < n; i++) {
    occ[i] = rest.h[i] + lift[i];
    if (rest.has[i]) {
      top[i] = pairs[pair[i] * 2];
      flank[i] = pairs[pair[i] * 2 + 1];
    }
    // (a pale column stays pale and a grey one grey, whatever the steps make of its height: the list holds single
    // floats, and the threshold itself as a single float lies above the threshold, so both keep clear of it)
    const s = summit[i] / SUMMIT_STEPS;
    high[i] = pale[i] ? Math.max(s, SUMMIT * 1.001) : Math.min(s, SUMMIT * 0.999);
  }
  return { ...rest, occ, top, flank, share: shared, bleach: bleached, summit: high };
}
