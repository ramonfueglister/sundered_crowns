// The wall of a town and its gates (settlement feature 6, docs/SETTLEMENT_DESIGN.md, where every source is listed):
// where the ring runs and where it opens. Only geometry here, no state: src/sim/systems/walls.ts writes the walls of
// the towns with it.
//
// 1. The ring follows the town round what it holds, a street's width clear of it, so that a lane runs along its
//    inside (src/sim/settlement/wall_shape.ts; OWN RULE: the sources give where some circuits ran, not how near the
//    houses stood).
// 2. Where water or rock lies under it the ring is open: a river or the sea stood in for the wall (Boston was "bounded
//    by walls and river", Cesaretti et al. 2016, appendix S2 note 18).
// 3. A gate stands where a street of the town crosses the ring: on a way of the world a gate, on a lane a postern.
//    Gates let people in and took the tolls (Pounds 2005, p. 50); their number follows from the ways.

/** a piece of ground: its middle and its size, metres east and south of the town's centre */
export interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** a straight piece of street: its ends on the middle line and its kind (STREET_KIND in src/sim/state.ts) */
export interface Crossing {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  kind: number;
}

/** what a piece of the ring is */
export const WALL_PIECE = { wall: 0, gate: 1, postern: 2 } as const;

/** a straight piece of the ring: its ends and what it is (WALL_PIECE) */
export interface WallPiece {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  kind: number;
}

type Point = readonly [number, number];

/** The ring stretched from (cx, cz) so that it holds `k` times its area. */
export const scaled = (ring: readonly Point[], cx: number, cz: number, k: number): Point[] => {
  const f = Math.sqrt(k);
  return ring.map(([x, z]) => [cx + (x - cx) * f, cz + (z - cz) * f]);
};

/** Whether a box reaches over the ring: part of it inside, part outside. */
export function straddles(ring: readonly Point[], b: Box): boolean {
  const corners: Point[] = [
    [b.x - b.w / 2, b.z - b.d / 2],
    [b.x + b.w / 2, b.z - b.d / 2],
    [b.x - b.w / 2, b.z + b.d / 2],
    [b.x + b.w / 2, b.z + b.d / 2],
  ];
  const inside = corners.filter((c) => holds(ring, c)).length;
  return inside > 0 && inside < 4;
}

/** Whether the point lies inside the ring (even–odd: the ring may bend in). */
export function holds(ring: readonly Point[], p: Point): boolean {
  let inside = false;
  for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
    const [xk, zk] = ring[k],
      [xj, zj] = ring[j];
    if (zk > p[1] !== zj > p[1] && p[0] < ((xj - xk) * (p[1] - zk)) / (zj - zk) + xk) inside = !inside;
  }
  return inside;
}

/** where along the edge a→b (0..1) the street piece crosses it, or null */
function crossAt(a: Point, b: Point, q: Crossing): number | null {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    ex = q.x1 - q.x0,
    ez = q.z1 - q.z0;
  const den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q.x0 - a[0]) * ez - (q.z0 - a[1]) * ex) / den,
    u = ((q.x0 - a[0]) * dz - (q.z0 - a[1]) * dx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/**
 * The pieces of the ring: wall where the ground under it is dry (`dry`), open where it is not, and a gate `gate`
 * metres wide where a street crosses it (a postern on a lane). The ground is asked every `step` metres along it.
 */
export function layRing(
  ring: readonly Point[],
  dry: (x: number, z: number) => boolean,
  streets: readonly Crossing[],
  step: number,
  gate: number,
): WallPiece[] {
  const out: WallPiece[] = [];
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k],
      b = ring[(k + 1) % ring.length],
      len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const at = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    // the gates on this edge, by where they lie along it, the nearer of two that would overlap kept
    const gates: { t: number; kind: number }[] = [];
    for (const q of streets) {
      const t = crossAt(a, b, q);
      if (t === null || !dry(...at(t))) continue;
      const kind = q.kind === 0 ? WALL_PIECE.postern : WALL_PIECE.gate;
      const near = gates.find((g) => Math.abs(g.t - t) * len < gate);
      if (!near) gates.push({ t, kind });
      else if (kind === WALL_PIECE.gate) near.kind = kind;
    }
    gates.sort((p, q) => p.t - q.t);
    // the edge in pieces of `step`: runs of dry ground are wall, the gates cut into them
    const n = Math.max(1, Math.ceil(len / step)),
      half = gate / 2 / len;
    let from: number | null = null;
    const wall = (t0: number, t1: number) => {
      let s = t0;
      for (const g of gates) {
        if (g.t + half <= s || g.t - half >= t1) continue;
        if (g.t - half > s) out.push(piece(at(s), at(g.t - half), WALL_PIECE.wall));
        out.push(piece(at(Math.max(s, g.t - half)), at(Math.min(t1, g.t + half)), g.kind));
        s = Math.min(t1, g.t + half);
      }
      if (t1 > s) out.push(piece(at(s), at(t1), WALL_PIECE.wall));
    };
    for (let i = 0; i < n; i++) {
      const t0 = i / n,
        t1 = (i + 1) / n,
        ok = dry(...at((t0 + t1) / 2));
      if (ok && from === null) from = t0;
      if (!ok && from !== null) {
        wall(from, t0);
        from = null;
      }
    }
    if (from !== null) wall(from, 1);
  }
  return out;
}

const piece = (a: Point, b: Point, kind: number): WallPiece => ({ x0: a[0], z0: a[1], x1: b[0], z1: b[1], kind });

/** How far, in widths of a street, the end of a street along a way may lie inside the ring and still run on through
 *  it. OWN RULE: a way of the world goes on beyond the town (the streets end where the parcels end, the ring stands a
 *  street's width beyond them, src/sim/settlement/streets.ts); farther in, the street ended in the town. */
export const RUNS_ON = 3;

/**
 * The streets of a town with each street along a way of the world (kind above a lane) that ends inside the ring near
 * it run on to the ring and through it: the way goes on into the land, so the ring has a gate there. An end runs on
 * where no other such street goes on from it and the ring lies within `reach` metres ahead.
 */
export function runOn(ring: readonly Point[], streets: readonly Crossing[], reach: number): Crossing[] {
  const ways = streets.filter((q) => q.kind > 0),
    out = [...streets];
  const touches = (x: number, z: number, self: Crossing) =>
    ways.some(
      (q) =>
        q !== self &&
        ((Math.abs(q.x0 - x) < 0.5 && Math.abs(q.z0 - z) < 0.5) ||
          (Math.abs(q.x1 - x) < 0.5 && Math.abs(q.z1 - z) < 0.5)),
    );
  for (const q of ways)
    for (const [x, z, fx, fz] of [
      [q.x1, q.z1, q.x0, q.z0],
      [q.x0, q.z0, q.x1, q.z1],
    ]) {
      if (!holds(ring, [x, z]) || touches(x, z, q)) continue;
      const len = Math.hypot(x - fx, z - fz);
      if (len < 1e-6) continue;
      const ahead: Crossing = {
        x0: x,
        z0: z,
        x1: x + ((x - fx) / len) * reach,
        z1: z + ((z - fz) / len) * reach,
        kind: q.kind,
      };
      if (ring.some((a, k) => crossAt(a, ring[(k + 1) % ring.length], ahead) !== null)) out.push(ahead);
    }
  return out;
}
