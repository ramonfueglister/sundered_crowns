// What a town's street network looks like once it is laid (src/sim/settlement/streets.ts, layOnce): the straight
// pieces of its streets, and, for the calibration and the tests, its junctions and the blocks its streets enclose.
import type { Street, Town } from './town_layout';

/** the grid a town is laid on: N × N cells round its centre (R to each side), whether a cell holds a street's middle
 *  line (`line`) and the street's kind (`kind`, STREET); `all`: the middle-line cells in the order laid */
interface StreetGrid {
  all: readonly number[];
  line: Uint8Array;
  kind: Uint8Array;
  N: number;
  R: number;
}

const STEP = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

const lineAt =
  ({ line, N, R }: StreetGrid) =>
  (x: number, z: number) =>
    x >= -R && x <= R && z >= -R && z <= R && line[(z + R) * N + (x + R)] === 1;

/** the streets as straight pieces, east-west or north-south */
export function streetPieces(g: StreetGrid): Street[] {
  const { all, kind, N, R } = g,
    isLine = lineAt(g),
    at = (x: number, z: number) => (z + R) * N + (x + R);
  const streets: Street[] = [];
  const sorted = all.slice().sort((a, b) => a - b); // north to south, west to east
  for (const i of sorted) {
    const x = (i % N) - R,
      z = Math.floor(i / N) - R;
    // a piece runs over the cells of one kind, and on into the street of another kind it meets, so that they join;
    // a single cell of one kind at the end of a street of another is a piece too (a parcel may front it)
    const k = kind[at(x, z)];
    if (isLine(x + 1, z) && (!isLine(x - 1, z) || kind[at(x - 1, z)] !== k)) {
      let e = x;
      while (isLine(e + 1, z) && kind[at(e + 1, z)] === k) e++;
      const x0 = isLine(x - 1, z) ? x - 1 : x,
        x1 = isLine(e + 1, z) ? e + 1 : e;
      if (e > x || !isLine(x - 1, z)) streets.push({ x0, z0: z, x1, z1: z, kind: k });
    }
    if (isLine(x, z + 1) && (!isLine(x, z - 1) || kind[at(x, z - 1)] !== k)) {
      let e = z;
      while (isLine(x, e + 1) && kind[at(x, e + 1)] === k) e++;
      const z0 = isLine(x, z - 1) ? z - 1 : z,
        z1 = isLine(x, e + 1) ? e + 1 : e;
      if (e > z || !isLine(x, z - 1)) streets.push({ x0: x, z0, x1: x, z1, kind: k });
    }
  }
  return streets;
}

/** the junctions of the network by the number of streets that meet in them */
export function junctions(g: StreetGrid): Town['nodes'] {
  const { all, N, R } = g,
    isLine = lineAt(g);
  const nodes = { ends: 0, bends: 0, tees: 0, crosses: 0 };
  for (const i of all) {
    const x = (i % N) - R,
      z = Math.floor(i / N) - R;
    const e = +isLine(x + 1, z),
      wv = +isLine(x - 1, z),
      s = +isLine(x, z + 1),
      n = +isLine(x, z - 1),
      deg = e + wv + s + n;
    if (deg === 1) nodes.ends++;
    else if (deg === 2 && e + wv === 1) nodes.bends++;
    else if (deg === 3) nodes.tees++;
    else if (deg === 4) nodes.crosses++;
  }
  return nodes;
}

/** the areas of the blocks: `isMarket` tells the cells of the market square, which no block holds */
export function blockAreas(g: StreetGrid, isMarket: (i: number) => boolean): number[] {
  const { all, line, N, R } = g,
    at = (x: number, z: number) => (z + R) * N + (x + R);
  // the blocks: ground the street lines enclose, found as the pieces of the plane between the lines that do not reach the edge of the town's box
  const box = (() => {
    let x0 = Infinity,
      z0 = Infinity,
      x1 = -Infinity,
      z1 = -Infinity;
    for (const i of all) {
      const x = (i % N) - R,
        z = Math.floor(i / N) - R;
      x0 = Math.min(x0, x);
      z0 = Math.min(z0, z);
      x1 = Math.max(x1, x);
      z1 = Math.max(z1, z);
    }
    return { x0, z0, x1, z1 };
  })();
  const blocks: number[] = [];
  if (box.x0 <= box.x1) {
    const seen = new Uint8Array(N * N),
      stack: number[] = [];
    for (let z = box.z0; z <= box.z1; z++)
      for (let x = box.x0; x <= box.x1; x++) {
        const i0 = at(x, z);
        if (seen[i0] || line[i0] || isMarket(i0)) continue;
        let area = 0,
          open = false;
        stack.push(i0);
        seen[i0] = 1;
        while (stack.length) {
          const i = stack.pop()!,
            cx = (i % N) - R,
            cz = Math.floor(i / N) - R;
          area++;
          for (const [dx, dz] of STEP) {
            const nx = cx + dx,
              nz = cz + dz;
            if (nx < box.x0 || nx > box.x1 || nz < box.z0 || nz > box.z1) {
              open = true;
              continue;
            }
            const j = at(nx, nz);
            if (seen[j] || line[j] || isMarket(j)) continue;
            seen[j] = 1;
            stack.push(j);
          }
        }
        if (!open) blocks.push(area);
      }
  }
  return blocks;
}
