// The shape of a town's ring (settlement feature 6, src/sim/settlement/walls.ts): it follows the town round its
// parcels and landmarks, not their convex hull, so that it keeps off the hamlets that lie in the bays of a town
// (a hamlet keeps HAMLET_OFF from the outermost parcels, src/sim/settlement/hamlets.ts). Laid on a grid:
//   1. the ground within `margin` of what it holds;
//   2. closed with a disc of `smooth` metres, so that the ring does not go in and out round every parcel (a closing:
//      grown by `smooth`, then shrunk by it);
//   3. kept `margin` off the farmsteads, each piece that holds some of it kept and its holes filled;
//   4. its outline traced and simplified to `corner` metres (Douglas–Peucker).
// OWN RULE throughout: the sources give where some circuits ran, not how a ring followed its town.
import type { Box } from './walls';

type Point = readonly [number, number];

/** the side of a cell of the grid, in metres */
const CELL = 2;

/** The distance of every cell to the nearest set cell, in metres (the chamfer distance with steps 1 and √2, within
 *  about 8 % of the straight one). */
function distance(set: Uint8Array, w: number, h: number): Float32Array {
  const d = new Float32Array(w * h).fill(1e9),
    D = Math.SQRT2;
  for (let i = 0; i < w * h; i++) if (set[i]) d[i] = 0;
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (z > 0) {
        d[i] = Math.min(d[i], d[i - w] + 1);
        if (x > 0) d[i] = Math.min(d[i], d[i - w - 1] + D);
        if (x < w - 1) d[i] = Math.min(d[i], d[i - w + 1] + D);
      }
    }
  for (let z = h - 1; z >= 0; z--)
    for (let x = w - 1; x >= 0; x--) {
      const i = z * w + x;
      if (x < w - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (z < h - 1) {
        d[i] = Math.min(d[i], d[i + w] + 1);
        if (x < w - 1) d[i] = Math.min(d[i], d[i + w + 1] + D);
        if (x > 0) d[i] = Math.min(d[i], d[i + w - 1] + D);
      }
    }
  for (let i = 0; i < w * h; i++) d[i] *= CELL;
  return d;
}

/** Douglas–Peucker: the corners of the line that lie more than `tol` off the line between their neighbours kept. */
function simplify(p: Point[], tol: number): Point[] {
  if (p.length < 3) return p;
  const keep = new Uint8Array(p.length);
  keep[0] = keep[p.length - 1] = 1;
  const stack: [number, number][] = [[0, p.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, az] = p[a],
      [bx, bz] = p[b],
      len = Math.hypot(bx - ax, bz - az);
    let far = -1,
      at = -1;
    for (let k = a + 1; k < b; k++) {
      const [x, z] = p[k];
      const off = len < 1e-9 ? Math.hypot(x - ax, z - az) : Math.abs((bx - ax) * (az - z) - (ax - x) * (bz - az)) / len;
      if (off > far) {
        far = off;
        at = k;
      }
    }
    if (far > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return p.filter((_, k) => keep[k]);
}

/** The outline of the set cells (one 4-connected piece without holes) along the edges of its cells, their corners in
 *  turn: corner (x, z) is the north-west corner of cell (x, z). Where two cells of it touch only at a corner the
 *  outline turns there, so that it stays one loop. */
function outline(set: Uint8Array, w: number, h: number): [number, number][] {
  const on = (x: number, z: number) => x >= 0 && z >= 0 && x < w && z < h && set[z * w + x] === 1;
  // the edges with the piece on their right, going round it clockwise (x east, z south), from each corner
  const from = new Map<number, number[]>(),
    W = w + 1;
  const edge = (ax: number, az: number, bx: number, bz: number) => {
    const k = az * W + ax,
      list = from.get(k);
    if (list) list.push(bz * W + bx);
    else from.set(k, [bz * W + bx]);
  };
  let start = -1;
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      if (!on(x, z)) continue;
      if (!on(x, z - 1)) {
        edge(x, z, x + 1, z);
        if (start < 0) start = z * W + x;
      }
      if (!on(x + 1, z)) edge(x + 1, z, x + 1, z + 1);
      if (!on(x, z + 1)) edge(x + 1, z + 1, x, z + 1);
      if (!on(x - 1, z)) edge(x, z + 1, x, z);
    }
  if (start < 0) return [];
  const out: [number, number][] = [];
  let at = start,
    dx = 1,
    dz = 0;
  for (let n = 0; n < 4 * W * (h + 1); n++) {
    out.push([at % W, Math.floor(at / W)]);
    const next = from.get(at)!;
    // at a corner with two ways on, the one that turns right, keeping the piece's cells on the right
    let pick = next[0];
    if (next.length > 1) {
      const right = next.find((q) => (q % W) - (at % W) === -dz && Math.floor(q / W) - Math.floor(at / W) === dx);
      pick = right ?? pick;
    }
    from.set(
      at,
      next.filter((q) => q !== pick),
    );
    dx = (pick % W) - (at % W);
    dz = Math.floor(pick / W) - Math.floor(at / W);
    at = pick;
    if (at === start) break;
  }
  return out;
}

/**
 * The rings round the boxes `held` (each its corners in turn, metres east and south of the town's centre): `margin`
 * metres clear of them and of the boxes `clear` (the farmsteads), smoothed by `smooth` metres, their corners `corner`
 * metres off the line at the least. One ring for each piece the town falls into (a river between them).
 */
export function shapeAround(
  held: readonly Box[],
  clear: readonly Box[],
  margin: number,
  smooth: number,
  corner: number,
): Point[][] {
  let x0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    z1 = -Infinity;
  for (const b of held) {
    x0 = Math.min(x0, b.x - b.w / 2);
    x1 = Math.max(x1, b.x + b.w / 2);
    z0 = Math.min(z0, b.z - b.d / 2);
    z1 = Math.max(z1, b.z + b.d / 2);
  }
  const pad = margin + smooth + 2 * CELL;
  x0 -= pad;
  z0 -= pad;
  x1 += pad;
  z1 += pad;
  const w = Math.ceil((x1 - x0) / CELL) + 1,
    h = Math.ceil((z1 - z0) / CELL) + 1;
  const fill = (boxes: readonly Box[]) => {
    const g = new Uint8Array(w * h);
    for (const b of boxes) {
      const a0 = Math.max(0, Math.floor((b.x - b.w / 2 - x0) / CELL)),
        a1 = Math.min(w - 1, Math.ceil((b.x + b.w / 2 - x0) / CELL)),
        c0 = Math.max(0, Math.floor((b.z - b.d / 2 - z0) / CELL)),
        c1 = Math.min(h - 1, Math.ceil((b.z + b.d / 2 - z0) / CELL));
      for (let c = c0; c <= c1; c++) for (let a = a0; a <= a1; a++) g[c * w + a] = 1;
    }
    return g;
  };
  // 1. within the margin of what it holds; 2. closed: grown by `smooth`, then shrunk by it
  const toHeld = distance(fill(held), w, h),
    grown = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) grown[i] = toHeld[i] <= margin + smooth ? 1 : 0;
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) outside[i] = grown[i] ? 0 : 1;
  const toOutside = distance(outside, w, h),
    toClear = clear.length ? distance(fill(clear), w, h) : null;
  const inside = new Uint8Array(w * h);
  // 3. off the farmsteads, but never nearer to what it holds than a cell
  for (let i = 0; i < w * h; i++)
    inside[i] =
      toHeld[i] <= CELL || ((toHeld[i] <= margin || toOutside[i] > smooth) && (!toClear || toClear[i] > margin))
        ? 1
        : 0;
  // each piece that holds some of what it holds (a town on both banks of a river has a ring on each), its holes
  // filled: what the outside cannot reach from the grid's edge
  const flood = (seed: number, may: (i: number) => boolean, mark: Uint8Array) => {
    const todo = [seed];
    mark[seed] = 1;
    while (todo.length) {
      const i = todo.pop()!,
        x = i % w,
        z = (i - x) / w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, z > 0 ? i - w : -1, z < h - 1 ? i + w : -1])
        if (j >= 0 && !mark[j] && may(j)) {
          mark[j] = 1;
          todo.push(j);
        }
    }
  };
  const seen = new Uint8Array(w * h),
    rings: Point[][] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !inside[i] || toHeld[i] > 0) continue;
    const piece = new Uint8Array(w * h);
    flood(i, (j) => inside[j] === 1, piece);
    for (let j = 0; j < w * h; j++) if (piece[j]) seen[j] = 1;
    const sea = new Uint8Array(w * h);
    flood(0, (j) => piece[j] === 0, sea);
    for (let j = 0; j < w * h; j++) piece[j] = sea[j] ? 0 : 1;
    // 4. its outline, simplified
    const ring = outline(piece, w, h).map(([x, z]): Point => [x0 + (x - 0.5) * CELL, z0 + (z - 0.5) * CELL]);
    if (ring.length >= 3) rings.push(simplify([...ring, ring[0]], corner).slice(0, -1));
  }
  return rings;
}
