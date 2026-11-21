// The great buildings at the far steps that draw models (far_places.ts MODELS_UNTIL): the very model the finest step
// stood on a great building's ground (settle.ts `marks`, `monument`, `landmark`), as large as it is and built from
// the same numbers, so that a cathedral, a palace or a town's church or tower stays the building it is from near to
// far.
import { type Model, m, tower } from '../buildings';
import { type Batch, type Rnd, seeded } from '../lookprobe/batch';
import { GRID } from '../lookprobe/layout';
import type { Plan } from './far';
import { PIECE } from './piece_sight';
import type { Mark, Monument, Site } from './settle';

/** the blocks of land round a piece of the finest step on the ground it is built on (pieces.ts MARGIN) */
const MARGIN = (GRID - PIECE) / 2;
/** the finest step looks this far each way for a town's middle without one from the register (settle.ts `middleOf`) */
const MIDDLE_SEARCH = 10;
/** and this many for ground for a monument that does not stand on ground levelled for it (settle.ts `monument`) */
const MONUMENT_SEARCH = 14;
/** a walled town without landmarks of the register looks this far each way from its middle for the ground of its
 *  building in the middle; draws the spots of its other churches this far each way from its middle and looks this far
 *  from a spot; and those of its towers, and looks this far (settle.ts, a walled town) */
const MIDDLE_REACH = 16,
  CHURCH_SPREAD = 14,
  CHURCH_REACH = 8,
  TOWER_SPREAD = 7,
  TOWER_REACH = 5;
/** a tower of the leading families as settle.ts stands it */
const TOWER: Model = { build: tower, w: 3, d: 3, height: 10 };

/** the corner of the footprint a landmark stands on, of a town whose middle is cx, cz (settle.ts `marks`) */
const cornerOf = (k: Mark, cx: number, cz: number): [number, number] => [
  cx + Math.round(m(k.x) - k.model.w / 2),
  cz + Math.round(m(k.z) - k.model.d / 2),
];

/** Builds a town's landmarks of the register whose middle is cx, cz from `r` in turn, each one that stands on the
 *  ground of GRID blocks from x0, z0 (settle.ts `stand`); null for the others. */
function marksOn(marks: readonly Mark[], cx: number, cz: number, x0: number, z0: number, r: Rnd): (Batch | null)[] {
  return marks.map((k) => {
    const [x, z] = cornerOf(k, cx, cz);
    return x < x0 + GRID && x + k.model.w > x0 && z < z0 + GRID && z + k.model.d > z0 ? k.model.build(r) : null;
  });
}

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
    builds = marksOn(marks, cx, cz, px * PIECE - MARGIN, pz * PIECE - MARGIN, seeded(1000 + s.id));
    built.set(key, builds);
  }
  return builds[which];
}

/** A great building of a town as the plan has it: its kind and its footprint in finest blocks of the world. */
export interface Stood {
  kind: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

/** A walled town of the plan: its middle in finest blocks of the world and its great buildings. */
export interface PlannedTown {
  cx: number;
  cz: number;
  stood: Stood[];
}
/** The walled town of the place `id` about the block x, z (finest blocks of the world) in the plan, null for a place
 *  that is none: in the piece of the plan its middle lies in, and its great buildings in the pieces round that one. */
export function plannedTown(plan: Plan, id: number, x: number, z: number): PlannedTown | null {
  const side = plan.pieceBlocks,
    near = (px: number, pz: number) =>
      [-1, 0, 1].flatMap((dz) => [-1, 0, 1].map((dx) => plan.pieces[`${px + dx},${pz + dz}`])).filter((p) => !!p);
  const town = near(Math.floor(x / side), Math.floor(z / side))
    .flatMap((p) => p.towns ?? [])
    .find((t) => t.site === id);
  if (!town) return null;
  const stood: Stood[] = [];
  for (const p of near(Math.floor(town.cx / side), Math.floor(town.cz / side)))
    for (let k = 0; p.greats && k + 6 < p.greats.length; k += 7)
      if (p.greats[k + 6] === id) {
        const [kind, x, z, w, d] = p.greats.slice(k, k + 5);
        stood.push({ kind: plan.greatKinds?.[kind] ?? '', x, z, w, d });
      }
  return { cx: town.cx, cz: town.cz, stood };
}

/**
 * The model of a great building of the walled town `s` whose middle is the block cx, cz that the finest step stood
 * on the footprint gw × gd from gx, gz (in finest blocks of the world, as the plan has it), where it is no landmark of
 * the register: the building in the middle of a town without them, its other churches, and the towers. The finest
 * step builds them from the town's one source of numbers in turn after its landmarks (settle.ts): the spot of each
 * from the numbers, and the building from them only where it found ground near its spot, the first in rings round
 * it. `stood` are the town's great buildings in the plan, which tell where each found ground; `built` keeps what was
 * built for a town and piece. Null where none was built there.
 */
export function greatOn(
  s: Site,
  gx: number,
  gz: number,
  gw: number,
  gd: number,
  cx: number,
  cz: number,
  stood: readonly Stood[],
  built: Map<string, Map<string, Batch>>,
): Batch | null {
  // (the landmarks before them stand where the ground of the piece that builds the footprint's middle reaches)
  const px = Math.floor(Math.floor(gx + gw / 2) / PIECE),
    pz = Math.floor(Math.floor(gz + gd / 2) / PIECE),
    key = `${s.id}:${px},${pz}`;
  let builds = built.get(key);
  if (!builds) {
    const made = new Map<string, Batch>(),
      taken = new Set<Stood>(),
      r = seeded(1000 + s.id);
    // the building of `kind` that took the first ground in rings round the spot sx, sz within `reach` (settle.ts
    // `landmark`): of those not yet taken the nearest, in the order the rings are searched
    const standAt = (kind: string, model: Model, sx: number, sz: number, reach: number) => {
      let found: Stood | null = null,
        first = Infinity;
      for (const f of stood) {
        if (f.kind !== kind || f.w !== model.w || f.d !== model.d || taken.has(f)) continue;
        const dx = f.x + Math.floor(f.w / 2) - sx,
          dz = f.z + Math.floor(f.d / 2) - sz,
          ring = Math.max(Math.abs(dx), Math.abs(dz)),
          order = (ring * (2 * reach + 1) + dz + reach) * (2 * reach + 1) + dx + reach;
        if (ring <= reach && order < first) {
          found = f;
          first = order;
        }
      }
      if (!found) return;
      taken.add(found);
      made.set(`${found.x},${found.z},${found.w},${found.d}`, model.build(r));
    };
    if (s.marks) marksOn(s.marks, cx, cz, px * PIECE - MARGIN, pz * PIECE - MARGIN, r);
    else {
      const great = s.size >= 4;
      standAt(great ? 'landmark' : 'church', great ? s.style.great : s.style.church, cx, cz, MIDDLE_REACH);
      for (let k = s.size - 3; k > 0; k--) {
        const sx = cx + r.int(-CHURCH_SPREAD, CHURCH_SPREAD);
        standAt('church', s.style.church, sx, cz + r.int(-CHURCH_SPREAD, CHURCH_SPREAD), CHURCH_REACH);
      }
    }
    for (let k = s.style.towers ? s.size - 2 : 0; k > 0; k--) {
      const sx = cx + r.int(-TOWER_SPREAD, TOWER_SPREAD);
      standAt('tower', TOWER, sx, cz + r.int(-TOWER_SPREAD, TOWER_SPREAD), TOWER_REACH);
    }
    builds = made;
    built.set(key, builds);
  }
  return builds.get(`${gx},${gz},${gw},${gd}`) ?? null;
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
