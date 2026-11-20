// The shores of the water. The ground is made of columns, so a coast or a river bank that runs at a slant is a stair
// of block edges. The shore lays a bank into the water's own columns instead: land that follows the smoothed line of
// the coast and falls to the water over a strip of sand, so that the water's edge is a slanted line and not a stair.
// The columns themselves stay as they are: what is wet stays wet for everything that asks the ground.
import { Batch, type RGB, type V3, mix, rgb, smooth } from './batch';
import { type Ground, type GroundTraits, Mat, N, idx } from './layout';
import { type Part, ROCK_TOP_LOW, skyLight, skyShare, topColor } from './terrain';

/** the land's share round a point is taken over this many columns (the width of a bell curve) */
export const SHORE_BLUR = 0.7;
/** the bank reaches as far as this share of land round a point: under a half, so that it stands out before a straight coast too */
export const SHORE_LEVEL = 0.2;
/** from this much over the level on the bank is as high as the land behind it */
const SHORE_FULL = 0.06,
  SHORE_GENTLE = 0.3;
/** the bank's foot lies this deep under the water, and its top at most this high over it */
const SHORE_DIP = 0.25,
  SHORE_MOST = 2.3;
/** a bank lower than this over the water (a river's) runs level at the height of the lowest land beside the column */
const SHORE_LOW = 0.6;
/** water a single column wide keeps its middle open: the middle counts this far under the level */
const SHORE_THIN = 1.2,
  SHORE_BEND = 0.18;
export const SAND = rgb(0xdcc790);

/**
 * The share of land round every point of a lattice of half columns (corners, middles of edges, middles of columns),
 * less the level: over nought where the bank lies. Paved ground is no land here, a quay stays straight. It holds the
 * points of the columns of `part` (all of the ground where none is given) and nothing of the rest. Null where the
 * part has no water.
 */
export function shoreField(g: Ground, part: Part = { x0: 0, z0: 0, x1: N, z1: N }): Float32Array | null {
  // only the water of `part` is given banks: where it has none, there is nothing to tell
  let any = false;
  for (let z = part.z0; z < part.z1 && !any; z++)
    for (let x = part.x0; x < part.x1; x++)
      if (g.wet[idx(x, z)] === 1) {
        any = true;
        break;
      }
  if (!any) return null;
  const M = 2 * N,
    L = M + 1;
  const land = (x: number, z: number) => {
    const i = idx(Math.max(0, Math.min(N - 1, x)), Math.max(0, Math.min(N - 1, z)));
    return !g.wet[i] && g.mat[i] !== Mat.Paved ? 1 : 0;
  };
  // the bell curve, in half columns
  const reach = Math.ceil(6 * SHORE_BLUR),
    bell: number[] = [];
  let sum = 0;
  for (let k = -reach; k <= reach; k++) {
    const w = Math.exp(-(k * k) / (8 * SHORE_BLUR * SHORE_BLUR));
    bell.push(w);
    sum += w;
  }
  // The field is worked out at the lattice points the part's columns read (i0 … i1, j0 … j1) and no further: on a
  // ground of 400 blocks that holds a piece of 200, three quarters of it were worked out for nothing (a tenth of a
  // near piece's building time, a fifth of what the glide draws of the coarser piece). The numbers are the same.
  const i0 = 2 * part.x0,
    i1 = 2 * part.x1,
    j0 = 2 * part.z0,
    j1 = 2 * part.z1;
  const hx0 = Math.max(0, i0 - 1),
    hx1 = Math.min(M - 1, i1),
    hz0 = Math.max(0, j0 - 1),
    hz1 = Math.min(M - 1, j1);
  const along = new Float32Array(M * M),
    both = new Float32Array(M * M);
  for (let z = Math.max(0, hz0 - reach); z <= Math.min(M - 1, hz1 + reach); z++)
    for (let x = hx0; x <= hx1; x++) {
      let v = 0;
      for (let k = -reach; k <= reach; k++) v += bell[k + reach] * land((x + k) >> 1, z >> 1);
      along[z * M + x] = v / sum;
    }
  for (let z = hz0; z <= hz1; z++)
    for (let x = hx0; x <= hx1; x++) {
      let v = 0;
      for (let k = -reach; k <= reach; k++) v += bell[k + reach] * along[Math.max(0, Math.min(M - 1, z + k)) * M + x];
      both[z * M + x] = v / sum;
    }
  const f = new Float32Array(L * L),
    half = (x: number, z: number) => both[Math.max(0, Math.min(M - 1, z)) * M + Math.max(0, Math.min(M - 1, x))];
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++)
      f[j * L + i] = (half(i - 1, j - 1) + half(i, j - 1) + half(i - 1, j) + half(i, j)) / 4 - SHORE_LEVEL;
  // narrow water (a river, a sound) must not be closed by its banks: the columns in its middle, which have no water
  // beside them that lies farther from the land, keep their middles open, and the edges between them. Whether a
  // column is such a middle is told by the water up to three columns from it: SEEN columns round the part are looked at.
  const SEEN = 6,
    x0 = Math.max(0, part.x0 - SEEN),
    x1 = Math.min(N, part.x1 + SEEN),
    z0 = Math.max(0, part.z0 - SEEN),
    z1 = Math.min(N, part.z1 + SEEN);
  const wet = (x: number, z: number) => x >= 0 && z >= 0 && x < N && z < N && g.wet[idx(x, z)] === 1;
  const NB = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const,
    from = new Uint8Array(N * N).fill(3);
  for (let z = z0; z < z1; z++)
    for (let x = x0; x < x1; x++)
      if (
        wet(x, z) &&
        NB.some(([dx, dz]) => x + dx >= 0 && z + dz >= 0 && x + dx < N && z + dz < N && !wet(x + dx, z + dz))
      )
        from[idx(x, z)] = 1;
  for (let z = z0; z < z1; z++)
    for (let x = x0; x < x1; x++)
      if (
        wet(x, z) &&
        from[idx(x, z)] === 3 &&
        NB.some(([dx, dz]) => wet(x + dx, z + dz) && from[idx(x + dx, z + dz)] === 1)
      )
        from[idx(x, z)] = 2;
  const middle = (x: number, z: number) =>
    wet(x, z) &&
    from[idx(x, z)] < 3 &&
    !NB.some(([dx, dz]) => wet(x + dx, z + dz) && from[idx(x + dx, z + dz)] > from[idx(x, z)]);
  const open = (i: number, j: number, by = SHORE_THIN) => {
    f[j * L + i] = Math.min(f[j * L + i], -by);
  };
  for (let z = Math.max(0, part.z0 - 2); z < Math.min(N, part.z1 + 2); z++)
    for (let x = Math.max(0, part.x0 - 2); x < Math.min(N, part.x1 + 2); x++) {
      if (!middle(x, z)) continue;
      const e = middle(x + 1, z),
        w = middle(x - 1, z),
        s = middle(x, z + 1),
        n = middle(x, z - 1);
      // where the water turns a corner its middle lies off the column's middle: that one is only just kept open
      open(
        2 * x + 1,
        2 * z + 1,
        Number(e) + Number(w) + Number(s) + Number(n) === 2 && e !== w ? SHORE_BEND : SHORE_THIN,
      );
      if (e) open(2 * x + 2, 2 * z + 1);
      if (w) open(2 * x, 2 * z + 1);
      if (s) open(2 * x + 1, 2 * z + 2);
      if (n) open(2 * x + 1, 2 * z);
    }
  return f;
}

/** The banks of the water of a ground (see the head of the file), added to the ground's mesh `b`. */
export function buildShore(
  b: Batch,
  g: Ground,
  t: GroundTraits,
  baked = true,
  part: Part = { x0: 0, z0: 0, x1: N, z1: N },
) {
  const f = shoreField(g, part),
    L = 2 * N + 1;
  if (!f) return;
  const ox = g.ox ?? 0,
    oz = g.oz ?? 0,
    UP: V3 = [0, 1, 0];
  /** the lowest land that touches a lattice point (or lies a column from it), and whether it is rock */
  const behind = (i: number, j: number): [number, boolean] | null => {
    for (let wider = 0; wider <= 1; wider++) {
      let low = Infinity,
        rock = false;
      const x0 = (i >> 1) - (i % 2 ? 0 : 1) - wider,
        x1 = (i >> 1) + wider,
        z0 = (j >> 1) - (j % 2 ? 0 : 1) - wider,
        z1 = (j >> 1) + wider;
      for (let z = Math.max(0, z0); z <= Math.min(N - 1, z1); z++)
        for (let x = Math.max(0, x0); x <= Math.min(N - 1, x1); x++) {
          const c = idx(x, z);
          if (g.wet[c] || g.mat[c] === Mat.Paved || g.h[c] >= low) continue;
          low = g.h[c];
          rock = g.mat[c] === Mat.Rock;
        }
      if (low < Infinity) return [low, rock];
    }
    return null;
  };
  type P = { x: number; z: number; f: number; i: number; j: number };
  const point = (i: number, j: number): P => ({ x: i / 2, z: j / 2, f: f[j * L + i], i, j });
  for (let z = part.z0; z < part.z1; z++)
    for (let x = part.x0; x < part.x1; x++) {
      const c = idx(x, z);
      if (!g.wet[c]) continue;
      const surf = g.surf[c],
        foot = surf - SHORE_DIP,
        mid = point(2 * x + 1, 2 * z + 1);
      let dry = mid.f > 0;
      for (let k = 0; k < 9 && !dry; k++) dry = f[(2 * z + Math.floor(k / 3)) * L + 2 * x + (k % 3)] > 0;
      if (!dry) continue;
      // the lowest land round the column
      let low = Infinity;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const n = x + dx >= 0 && z + dz >= 0 && x + dx < N && z + dz < N ? idx(x + dx, z + dz) : -1;
          if (n >= 0 && !g.wet[n] && g.mat[n] !== Mat.Paved && g.h[n] < low) low = g.h[n];
        }
      const seen = new Map<number, [V3, RGB]>();
      /** a point of the bank: its height and colour from how far over the level the land's share is there */
      const vertex = (p: P, v: number): [V3, RGB] => {
        const key = v > 0 ? p.j * L + p.i : -1,
          known = key >= 0 ? seen.get(key) : undefined;
        if (known) return known;
        const land = v > 0 ? behind(p.i, p.j) : null,
          top = land ? Math.min(land[0], low - surf < SHORE_LOW ? low : Infinity, surf + SHORE_MOST) : surf + 0.15;
        // a low bank falls gently to the water, a high one keeps its height up to the land's corners and falls steeply
        const k = Math.min(1, v / (SHORE_FULL + (SHORE_GENTLE - SHORE_FULL) * smooth(1.3, 0.4, top - surf))),
          y = foot + (top - foot) * k;
        const own = land?.[1] ? ROCK_TOP_LOW : topColor(t, p.x, p.z, Mat.Grass, p.x + ox, p.z + oz),
          base = mix(SAND, own, smooth(0.35, 1, k));
        const l = baked ? skyLight(skyShare(g, p.x, p.z, Math.max(y, surf) + 0.02)) : 1;
        const made: [V3, RGB] = [
          [p.x, y, p.z],
          [base[0] * l ** 1.5, base[1] * l, base[2] * l ** 0.3],
        ];
        if (key >= 0) seen.set(key, made);
        return made;
      };
      const cross = (a: P, c2: P): P => {
        const s = a.f / (a.f - c2.f);
        return { x: a.x + (c2.x - a.x) * s, z: a.z + (c2.z - a.z) * s, f: 0, i: -1, j: -1 };
      };
      // the column in eight triangles round its middle: each a corner or the middle of an edge, the next one, the middle
      const rim: P[] = [
        [0, 0],
        [1, 0],
        [2, 0],
        [2, 1],
        [2, 2],
        [1, 2],
        [0, 2],
        [0, 1],
        [0, 0],
      ].map(([di, dj]) => point(2 * x + di, 2 * z + dj));
      for (let k = 0; k < 8; k++) {
        const tri = [rim[k], rim[k + 1], mid];
        if (tri.every((p) => p.f <= 0)) continue;
        // the part of the triangle over the level
        const shape: [V3, RGB][] = [];
        for (let e = 0; e < 3; e++) {
          const a = tri[e],
            n = tri[(e + 1) % 3];
          if (a.f > 0) shape.push(vertex(a, a.f));
          if (a.f > 0 !== n.f > 0) shape.push(vertex(cross(a, n), 0));
        }
        for (let e = 1; e + 1 < shape.length; e++)
          b.tri(shape[0][0], shape[e][0], shape[e + 1][0], shape[0][1], shape[e][1], shape[e + 1][1], UP);
      }
    }
}
