// The landmarks of the land register and the monuments at the far steps that draw models (far_places.ts
// MODELS_UNTIL): the very model the finest step stood on a great building's ground (settle.ts `marks`, `monument`),
// as large as it is and built from the same numbers, so that a cathedral or a palace stays the building it is from
// near to far.
import { m } from '../buildings';
import { type Batch, seeded } from '../lookprobe/batch';
import { GRID } from '../lookprobe/layout';
import { PIECE } from './piece_sight';
import type { Mark, Monument, Site } from './settle';

/** the blocks of land round a piece of the finest step on the ground it is built on (pieces.ts MARGIN) */
const MARGIN = (GRID - PIECE) / 2;
/** the finest step looks this far each way for a town's middle without one from the register (settle.ts `middleOf`) */
const MIDDLE_SEARCH = 10;
/** and this many for ground for a monument that does not stand on ground levelled for it (settle.ts `monument`) */
const MONUMENT_SEARCH = 14;

/** the corner of the footprint a landmark stands on, of a town whose middle is cx, cz (settle.ts `marks`) */
const cornerOf = (k: Mark, cx: number, cz: number): [number, number] => [
  cx + Math.round(m(k.x) - k.model.w / 2),
  cz + Math.round(m(k.z) - k.model.d / 2),
];

/**
 * The model of the landmark of the register that the finest step stood on the footprint gw × gd from gx, gz (in
 * finest blocks of the world, as the plan has it) of the town `s` whose middle lies about at `near`; null where none
 * of its landmarks stands there. A town's landmarks are built from one source of numbers in turn, each one that
 * stands on the ground of the piece that builds it (settle.ts `stand`): so the landmarks before it on the ground of
 * the piece that has the footprint's middle are built again first. `built` keeps what was built for a town and piece.
 */
export function markOn(
  s: Site,
  gx: number,
  gz: number,
  gw: number,
  gd: number,
  near: readonly [number, number],
  built: Map<string, (Batch | null)[]>,
): Batch | null {
  const marks = s.marks ?? [];
  let which = -1,
    cx = 0,
    cz = 0,
    off = MIDDLE_SEARCH + 1;
  marks.forEach((k, j) => {
    if (k.model.w !== gw || k.model.d !== gd) return;
    const [x, z] = cornerOf(k, 0, 0),
      far = Math.max(Math.abs(gx - x - near[0]), Math.abs(gz - z - near[1]));
    if (far >= off) return;
    which = j;
    cx = gx - x;
    cz = gz - z;
    off = far;
  });
  if (which < 0) return null;
  // the piece of the finest step whose own the footprint's middle is, and the ground it is built on (pieces.ts)
  const px = Math.floor(Math.floor(gx + gw / 2) / PIECE),
    pz = Math.floor(Math.floor(gz + gd / 2) / PIECE),
    key = `${s.id}:${px},${pz}`;
  let builds = built.get(key);
  if (!builds) {
    const x0 = px * PIECE - MARGIN,
      z0 = pz * PIECE - MARGIN,
      r = seeded(1000 + s.id);
    builds = marks.map((k) => {
      const [x, z] = cornerOf(k, cx, cz);
      return x < x0 + GRID && x + k.model.w > x0 && z < z0 + GRID && z + k.model.d > z0 ? k.model.build(r) : null;
    });
    built.set(key, builds);
  }
  return builds[which];
}

/**
 * The model of the monument the finest step stood on the footprint gw × gd from gx, gz (in finest blocks of the
 * world, as the plan has it), built from the monument's own numbers (settle.ts `monument`); null where none of
 * `monuments` stands there. `world` gives a point of the monuments' ground in finest blocks of the world.
 */
export function monumentOn(
  monuments: readonly Monument[],
  gx: number,
  gz: number,
  gw: number,
  gd: number,
  world: (x: number, z: number) => [number, number],
): Batch | null {
  let best: Monument | null = null,
    off = MONUMENT_SEARCH + 1;
  for (const mon of monuments) {
    if (mon.model.w !== gw || mon.model.d !== gd) continue;
    const [x, z] = world(mon.at[0], mon.at[1]),
      far = Math.max(Math.abs(gx + gw / 2 - x), Math.abs(gz + gd / 2 - z));
    if (far >= off) continue;
    best = mon;
    off = far;
  }
  return best ? best.model.build(seeded(500 + best.id)) : null;
}
