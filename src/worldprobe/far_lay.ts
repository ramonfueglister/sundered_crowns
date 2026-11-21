// What laying out the cover of a far piece's ground (far.ts `coverLand`) keeps while it runs, and the small steps all
// of its parts take: whether a column is free, whether the ground about it is level, putting a cover on a column.
import * as THREE from 'three/webgpu';
import type { Batch, RGB } from '../lookprobe/batch';
import { type Ground, Mat, N, idx, inGrid } from '../lookprobe/layout';
import type { HouseStyle } from '../buildings';
import type { Cover, Plan, Woods } from './far';
import type { FieldShown } from './lots';
import type { Site } from './settle';
import { uprightOf } from './zoom';

/** something stands out of the ground while it is two thirds of a block; from front to back a house of the finest step is about six blocks deep */
const STANDS_FROM = 2 / 3,
  HOUSE_DEEP = 6;
/** what stands on a block too large for it shows its walls too: this many finest blocks more of the block than its ground, by step */
const STANDS_OVER: Record<number, number> = { 3: 8, 4: 10, 5: 8, 6: 7, 7: 4 };

/**
 * What `coverLand` asks about the land at a point of the piece's ground (see there). Nothing here reads `laid`, `farm`
 * or `farms` any more; world.ts still hands them over, and they go when world.ts is next changed (it is busy on the
 * Venice branch).
 */
export interface CoverAsks {
  ploughed(x: number, z: number): number;
  laid?: boolean;
  courses?(x: number, z: number): number;
  vines(x: number, z: number): number;
  farm(x: number, z: number): HouseStyle;
  /** the farmhouses to a field (everywhere FARMS without it) */
  farms?(x: number, z: number): number;
  woods(x: number, z: number): Woods | null;
  own(x: number, z: number): boolean;
  /** the furlong of the land register on a field lot (lots.ts): with it only the register's furlongs are fields */
  field?(lx: number, lz: number): FieldShown | undefined;
  /** whether a column is kept clear of woods: a stream narrower than a block runs through it (world.ts) */
  clear?(x: number, z: number): boolean;
}

/** What `coverLand` keeps while it lays out a piece's ground: its parts (far_places.ts, far_fields.ts, far_woods.ts) take it. */
export interface Laying {
  g: Ground;
  step: number;
  things: Batch;
  sites: readonly Site[];
  o: CoverAsks;
  plan: Plan | null;
  c: Cover;
  /** finest blocks to a block of the step */
  wider: number;
  ox: number;
  oz: number;
  m: THREE.Matrix4;
  /** a finest block of height in blocks of this step: what stands as a model, a house or a tree is built as tall as the land (zoom.ts `uprightOf`), and as wide as it is */
  up: number;
  /** the columns a house drawn as a house stands on: no field or wood grows there */
  taken: Uint8Array;
  /** how many blocks the woods on a column stand out of its ground: the ground is raised by them once all is laid out */
  raised: Uint8Array;
  /** what stands on a block too large for it shows its walls too (STANDS_OVER): this much more of the block than its ground */
  seenStanding: number;
  /**
   * A walled town keeps the ground within its wall to itself and two blocks round it (settle.ts claims the square):
   * no lot of the finest step touches that and no tree stands on it (world.ts), so none does here. In finest world
   * blocks, four numbers to a town.
   */
  walls: number[];
  free(x: number, z: number): boolean;
  /** whether the ground about a column is level to within a step */
  level(x: number, z: number): boolean;
  put(x: number, z: number, rise: number, top: RGB, side?: RGB, kind?: number): void;
  pick<T>(list: readonly T[], lot: number): T;
  /** how many blocks something as tall as `height` finest blocks stands out of the ground at this step */
  stands(height: number): number;
  /** whether the middle of a column lies on a walled town's square */
  walledIn(x: number, z: number): boolean;
}

/** What `coverLand` keeps while it lays out the ground `g` of a piece at `step` (see `Laying`). */
export function layingOf(
  g: Ground,
  step: number,
  things: Batch,
  sites: readonly Site[],
  o: CoverAsks,
  plan: Plan | null,
  c: Cover,
): Laying {
  const wider = 2 ** step,
    ox = g.ox ?? 0,
    oz = g.oz ?? 0,
    m = new THREE.Matrix4();
  const up = uprightOf(step);
  const taken = new Uint8Array(N * N);
  const free = (x: number, z: number) =>
    inGrid(x, z) &&
    !g.wet[idx(x, z)] &&
    g.mat[idx(x, z)] !== Mat.Rock &&
    !c.has[idx(x, z)] &&
    !c.town[idx(x, z)] &&
    !taken[idx(x, z)];
  const level = (x: number, z: number) => {
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      if (inGrid(x + dx, z + dz) && Math.abs(g.h[idx(x + dx, z + dz)] - g.h[idx(x, z)]) > 1) return false;
    return true;
  };
  const put = (x: number, z: number, rise: number, top: RGB, side: RGB = top, kind = 0) => {
    const i = idx(x, z);
    c.kind![i] = kind;
    c.has[i] = 1;
    c.rise[i] = rise;
    c.top.set(top, i * 3);
    c.side.set(side, i * 3);
  };
  const pick = <T>(list: readonly T[], lot: number) => list[Math.min(list.length - 1, Math.floor(lot * list.length))];
  const seenStanding = 1 + (STANDS_OVER[step] ?? 0) / HOUSE_DEEP;
  const stands = (height: number) => (height / wider >= STANDS_FROM ? Math.max(1, Math.round(height / wider)) : 0);
  const walls: number[] = [];
  if (plan) {
    const fine = (v: number) => Math.floor((v * wider) / plan.pieceBlocks);
    for (let pz = fine(oz) - 1; pz <= fine(oz + N) + 1; pz++)
      for (let px = fine(ox) - 1; px <= fine(ox + N) + 1; px++)
        for (const t of plan.pieces[`${px},${pz}`]?.towns ?? [])
          if (t.wall !== null) walls.push(t.cx - t.half - 2, t.cz - t.half - 2, t.cx + t.half + 2, t.cz + t.half + 2);
  }
  const walledIn = (x: number, z: number) => {
    const fx = (x + ox + 0.5) * wider,
      fz = (z + oz + 0.5) * wider;
    for (let k = 0; k < walls.length; k += 4)
      if (fx >= walls[k] && fx < walls[k + 2] && fz >= walls[k + 1] && fz < walls[k + 3]) return true;
    return false;
  };
  const raised = new Uint8Array(N * N);
  return {
    g,
    step,
    things,
    sites,
    o,
    plan,
    c,
    wider,
    ox,
    oz,
    m,
    up,
    taken,
    raised,
    seenStanding,
    walls,
    free,
    level,
    put,
    pick,
    stands,
    walledIn,
  };
}
