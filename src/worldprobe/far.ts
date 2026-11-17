// The land from farther away. On the coarser steps of the map a block is two, four, eight … cells wide, and what
// stands and grows on the land is no longer built house by house and tree by tree: it becomes part of the ground
// itself, as it would look if the finest world were seen from that far. A tree is a green block, then woods are a
// raised green ground, then only its colour; a house is a block with a roof-coloured top, a town a square of them
// that shrinks to a single block; a field is a low block of its crop, then its colour. Only the great buildings
// stay themselves for two steps, built as small as the step makes them. So the world loses its detail step by step
// while everything stays where it is and as large as it is.
import * as THREE from 'three/webgpu';
import { type Batch, type RGB, type Rnd, hash2, mix, rgb, seeded, shade } from '../lookprobe/batch';
import { CYPRESS, LEAVES, OATS, OATS_SIDE, VINE_BODY, WHEAT, WHEAT_SIDE } from '../lookprobe/blocks';
import { type HouseStyle, type Model, tower } from '../buildings';
import { type Ground, Mat, N, idx, inGrid, occlude } from '../lookprobe/layout';
import { FALLOW_SHOWS, SOIL_FALLOW } from '../lookprobe/terrain';
import { blockOf, FALLOW, FIELD_GROUND, PEOPLE_PER_PERSON, PERSONS_PER_FLOOR_BLOCK, POP_OF_SIZE, type Site, SPRING, WALLED_FROM, courseOf } from './settle';

/** What a column carries as part of itself (GroundTraits.cover): where `has` is set, the colours of its top and sides and how far it stands above its ground. */
export interface Cover { /** what far.ts laid on each column (KINDS), for measuring it against the finer step */ kind?: Uint8Array; /** of the mean of the finer step (mean.ts): the colour of all the camera sees of a column, tops and sides, as a flat top would have to show it */ whole?: Float32Array; has: Uint8Array; rise: Uint8Array; top: Float32Array; side: Float32Array; /** how much of the column's top the cover colours, 0 … 1: the rest is the ground's own colour */ share: Float32Array; /** 1 on the paved ground of the towns */ town: Uint8Array }
/**
 * The woods at a column: the share of the ground they cover (0 … 1), the colours of their crowns and whether the
 * trees are tall ones. `laid` says that the share is that of this very column, from the forest of the world's
 * year (forest.ts): then chance makes a block only a little more or less wooded than it says.
 */
export interface Woods { share: number; crowns: readonly RGB[]; tall: boolean; laid?: boolean }

/** a house of the finest step has two storeys on most of its ground and stands about five blocks high with its roof; it stands out of the ground while that is two thirds of a block */
const STOREYS = 2, HOUSE_TALL = 4.5, STANDS_FROM = 2 / 3;
/** between its streets this share of a town's blocks is houses, the rest yards and squares */
const HOUSES = 0.8;
/** a roof lies in the sun with one side only: seen as a flat top it is this much darker */
const ROOF_LIGHT = 0.82;
/** a village's houses lie scattered this far about its middle, in finest blocks: five and this much for every root of a person */
const SCATTER = 2.5;
/** a town is at most this many finest blocks from its middle to its wall (settle.ts) */
const TOWN_MOST = 70;
/** the streets of a town lie this many finest blocks apart */
const STREETS = 18;
/** the town wall and the stone of the great buildings */
const WALL = rgb(0xcdb89c), STONE = rgb(0xe6dccc);
/** up to this step the great buildings are their own models, made smaller; beyond it they are blocks of stone under their roofs */
const MODELS_UNTIL = 2;
/** a great building stands as near its place as it finds free ground, within this many finest blocks */
const SEARCH = 16;
/** fields at the finest step lie in lots of eleven by eight blocks (settle.ts) */
const LOT_W = 11, LOT_D = 8;
/**
 * A lot at a step. The lots are those of the finest step (settle.ts), at the same places of the world at every step:
 * rows of LOT_D finest blocks, every other row set off by half a lot. A block of the step belongs to the lot its
 * middle lies in. From afar a lot is all field: the fields of a landscape lie together as one ground of many
 * colours, without the balks between them (which made of them a pattern of bricks) and without the farmhouses at
 * their corners. `blended`: a lot is no larger than a block.
 */
const lotAt = (step: number) => ({ blended: Math.max(1, Math.round(LOT_W / 2 ** step)) * Math.max(1, Math.round(LOT_D / 2 ** step)) === 1, fill: 1 });
/** Where a point of the world (in finest blocks) lies among the lots: the lot and how far its row is set off. */
function spotOf(fx: number, fz: number) {
  const lz = Math.floor(fz / LOT_D), shift = lz & 1 ? Math.floor(LOT_W / 2) : 0, lx = Math.floor((fx - shift) / LOT_W);
  return { lx, lz, shift };
}
/** The share of a lot's ground that is its field at a step: of the land's lots `ploughed / lotFill` are fields. */
export const lotFill = (step: number) => lotAt(step).fill;
/** a field from above: the tops of its crop with a little of their sides, and with more of them where it is no longer raised */
const field = (crop: RGB, flat: boolean, side: RGB = WHEAT_SIDE) => mix(crop, side, flat ? 0.6 : 0.3), VINEYARD = mix(VINE_BODY, WHEAT_SIDE, 0.3);
/**
 * Where a lot is no larger than a block, fields and woods are no longer blocks of their own: every block takes their
 * colour as far as they cover it, a little more or less from block to block. Woods seen so are as dark as their
 * crowns with the shade between them.
 */
const WOODS_FAR = 0.5;
const soft = (share: number, lot: number) => share + (lot - 0.5) * 2 * Math.min(share, 1 - share);
/** a single tree stands on this share of the woods' ground at the step where a tree is one block; from the next step on a block is woods or not */
const CANOPY = 0.9, STRAY = 0.01;
/** the finest step's places for a tree lie this many finest blocks apart, and inside a wood this share of them carries one (world.ts TREE_PITCH, CLOSED) */
const TREE_PITCH = 2.4, TREES_CLOSED = 0.88;
/** a tree of the finest step stands about four of its blocks high, two of the first far step's: a far block on which one stands stands out by that, one under crowns only by one */
const TREE_STANDS = 2;
/** from its trunk a leafy crown and a conifer reach this many finest blocks to each side (blocks.ts `tree`, `cypress`) */
const CROWN = 1.2, CROWN_TALL = 0.6;
/**
 * What the camera sees of a wood at the finest step, as a share of the colour of its crowns in the sun, for the
 * top and the sides of a far block: between the crowns it sees their shaded sides and the dark ground. Measured
 * against the mean of the finest step (mean.ts, `?mean=compare`) at Paris, in the Black Forest, in Sweden and in
 * Tuscany.
 */
const SEEN_LEAVES = { top: [0.61, 0.66, 0.87], side: [0.34, 0.57, 0.91] } as const, SEEN_CONIFERS = { top: [2.34, 1.14, 1.03], side: [1.6, 1.09, 1.1] } as const;
const tinted = (c: RGB, by: readonly [number, number, number]): RGB => [c[0] * by[0], c[1] * by[1], c[2] * by[2]];
/**
 * The same for the fields, as a share of the colours far.ts gave them by eye: the rows of the winter corn stand
 * in each other's shade and creases, the spring corn shows more of its ground, and the finest step's vineyards
 * are not dark green but the colour of their ground between the rows. Measured at Paris and in the Black Forest.
 */
const SEEN_WINTER = [0.84, 0.9, 0.9] as const, SEEN_SPRING = [1.08, 0.83, 0.94] as const, SEEN_VINES = [1.53, 1.1, 1.13] as const;
/** how much of the chance from block to block is left where the woods and the fields are laid out */
const LAID_CHANCE = 0.25;
/** seen from above without the shade between the crowns, woods are darker than a crown in the sun */
const CANOPY_LIGHT = 0.8;

/**
 * What the finest step builds in its places (public/data/plan_<year>.json, written by tools/worldprobe/build_plan.ts):
 * per piece of `pieceBlocks` finest world blocks the houses whose middle lies in it (nine numbers each: x, z, w, d
 * in finest world blocks, floors, height in tenths of a block, wall and roof as 0xRRGGBB, kind) and the walled
 * towns (their paved ground is the square of 2 * half about (cx, cz)).
 */
export interface Plan { pieceBlocks: number; pieces: Record<string, { houses: readonly number[]; towns?: readonly { site: number; cx: number; cz: number; half: number }[] } | undefined> }
let plan: Plan | null = null, plans = new Map<string, Promise<Plan | null>>();
/** The plan of a year's places, loaded once; null where the file is not there (then the far steps lay out their places by rules of their own, as before). */
export function loadPlan(base: string, year: number): Promise<Plan | null> {
  let p = plans.get(`${base}|${year}`);
  if (!p) {
    p = fetch(`${base}data/plan_${year}.json`).then(async (r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? await r.json() as Plan : null)).catch(() => null);
    plans.set(`${base}|${year}`, p);
  }
  return p;
}
/** The plan `coverLand` lays its places by from now on (the worker sets it before it builds a far piece). */
export const usePlan = (p: Plan | null) => { plan = p; };

/** what a column carries, by the number in `Cover.kind` */
export const KINDS = ['open', 'house', 'wall', 'great', 'fallow', 'spring', 'winter', 'vines', 'wood', 'tall wood', 'blend'] as const;
let last: Cover | null = null;
/** the cover `coverLand` laid out last, for measuring it (piece.worker.ts `compare`) */
export const laidOut = () => last;

/**
 * Lays towns, fields and woods on the ground of a piece at `step` (1 or coarser) and raises the ground under them.
 * `sites` are the places on the ground; `ploughed` is the share of the ground under the plough at a ground point,
 * the fallow counted in (`laid`: of that very point, the fields laid out together; else of the land about it),
 * `courses` in how many courses the fields there are tilled (settle.ts `courseOf`), `vines` the share of the winter
 * fields that are vineyards, `farm` the style of the farmhouses there, `woods` what grows on a column. Everything depends on the
 * world block alone, so that pieces laid side by side fit together; only what `own` holds at its middle is added to
 * `things`.
 */
export function coverLand(g: Ground, step: number, things: Batch, sites: readonly Site[], o: {
  ploughed(x: number, z: number): number; laid?: boolean; courses?(x: number, z: number): number; vines(x: number, z: number): number; farm(x: number, z: number): HouseStyle; /** the farmhouses to a field (everywhere FARMS without it) */ farms?(x: number, z: number): number;
  woods(x: number, z: number): Woods | null; own(x: number, z: number): boolean;
}): Cover {
  const c: Cover = { has: new Uint8Array(N * N), rise: new Uint8Array(N * N), top: new Float32Array(N * N * 3), side: new Float32Array(N * N * 3), town: new Uint8Array(N * N), share: new Float32Array(N * N).fill(1), kind: new Uint8Array(N * N) };
  const wider = 2 ** step, ox = g.ox ?? 0, oz = g.oz ?? 0, m = new THREE.Matrix4();
  const free = (x: number, z: number) => inGrid(x, z) && !g.wet[idx(x, z)] && g.mat[idx(x, z)] !== Mat.Rock && !c.has[idx(x, z)] && !c.town[idx(x, z)];
  /** whether the ground about a column is level to within a step */
  const level = (x: number, z: number) => { for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inGrid(x + dx, z + dz) && Math.abs(g.h[idx(x + dx, z + dz)] - g.h[idx(x, z)]) > 1) return false; return true; };
  const put = (x: number, z: number, rise: number, top: RGB, side: RGB = top, kind = 0) => { const i = idx(x, z); c.kind![i] = kind; c.has[i] = 1; c.rise[i] = rise; c.top.set(top, i * 3); c.side.set(side, i * 3); };
  const pick = <T>(list: readonly T[], lot: number) => list[Math.min(list.length - 1, Math.floor(lot * list.length))];
  const house = (style: HouseStyle, x: number, z: number, rise: number) => { if (free(x, z)) put(x, z, rise, shade(pick(style.roofs, hash2(x + ox, z + oz, 211)), ROOF_LIGHT), pick(style.walls, hash2(x + ox, z + oz, 212)), 1); };
  /** how many blocks something as tall as `height` finest blocks stands out of the ground at this step */
  const stands = (height: number) => (height / wider >= STANDS_FROM ? Math.max(1, Math.round(height / wider)) : 0);
  /** A great building as near a column as it finds free ground. */
  const landmark = (model: Model, r: Rnd, cx: number, cz: number, roof: RGB) => {
    const w = Math.max(1, Math.round(model.w / wider)), d = Math.max(1, Math.round(model.d / wider)), reach = Math.round(SEARCH / wider);
    /** the height to build at on the footprint from (x0, z0), if all of it is free */
    const lot = (x0: number, z0: number) => { let y = -Infinity; for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) { if (!free(x, z)) return null; y = Math.max(y, g.h[idx(x, z)]); } return y; };
    for (let k = 0; k <= reach; k++) for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx += Math.abs(dz) === k ? 1 : 2 * k || 1) {
      const x0 = cx + dx - (w >> 1), z0 = cz + dz - (d >> 1), y = lot(x0, z0);
      if (y === null) continue;
      for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) {
        if (step > MODELS_UNTIL) { put(x, z, stands(model.height), roof, STONE, 3); continue; }
        // the model stands on level, paved ground
        const i = idx(x, z);
        g.h[i] = y; c.town[i] = 1; g.mat[i] = Mat.Paved;
      }
      if (step > MODELS_UNTIL) return;
      if (o.own(x0 + (w >> 1), z0 + (d >> 1))) things.append(model.build(r), m.makeScale(1 / wider, 1 / wider, 1 / wider).setPosition(x0 + w / 2, y, z0 + d / 2));
      occlude(g, x0, z0, x0 + w, z0 + d, y + model.height / wider);
      return;
    }
  };

  // towns and villages: a place is drawn as long as it is at least a block of its own
  for (const s of sites) {
    if (s.size < step - 1) continue;
    // the same great buildings as at the finest step (settle.ts)
    const cx = Math.floor(s.at[0]), cz = Math.floor(s.at[1]), style = s.style.house, r = seeded(1000 + s.id), roof = pick(style.roofs, 0), near = (reach: number) => Math.round(r.int(-reach, reach) / wider);
    // as many blocks of houses as hold the place's people (settle.ts), as tall as a house is at this step
    const need = (s.pop ?? POP_OF_SIZE[s.size]) / PEOPLE_PER_PERSON, holds = wider * wider * STOREYS * PERSONS_PER_FLOOR_BLOCK, tall = stands(HOUSE_TALL);
    // with the plan of the finest step the houses are its houses (below); only the great buildings are set here
    if (plan && s.hamlet) continue;
    if (s.hamlet) {
      // a hamlet is a few houses close together, low against the towns
      for (let k = Math.max(1, Math.round(need / holds)), q = 0; k > 0 && q <= 3; q++) for (let dz = -q; dz <= q && k > 0; dz++) for (let dx = -q; dx <= q && k > 0; dx += Math.abs(dz) === q ? 1 : 2 * q || 1) {
        if (free(cx + dx, cz + dz)) { house(style, cx + dx, cz + dz, Math.min(1, tall)); k--; }
      }
      continue;
    }
    if (s.size < WALLED_FROM) {
      // a village is houses scattered about its middle, a small town has its church among them
      if (s.size === 2 && step <= MODELS_UNTIL) landmark(s.style.church, r, cx, cz, roof);
      if (plan) continue;
      const reach = (5 + SCATTER * Math.sqrt(need)) / wider;
      for (let k = Math.max(1, Math.round(need / holds)), tries = 0; k > 0 && tries < 60; tries++) {
        const a = r.range(0, Math.PI * 2), q = Math.sqrt(r.next()) * reach, x = Math.round(cx + Math.cos(a) * q), z = Math.round(cz + Math.sin(a) * q);
        if (free(x, z)) { house(style, x, z, tall); k--; }
      }
      continue;
    }
    landmark(s.size >= 4 ? s.style.great : s.style.church, r, cx, cz, roof);
    for (let k = s.size - 3; k > 0; k--) landmark(s.style.church, r, cx + near(14), cz + near(14), roof);
    if (s.style.towers) for (let k = s.size - 2; k > 0; k--) landmark({ build: tower, w: 3, d: 3, height: 10 }, r, cx + near(7), cz + near(7), roof);
    if (plan) continue;
    // houses between the streets, ring by ring from the middle until all are housed; what is left of the last ring is paved
    const pitch = Math.round(STREETS / wider);
    let half = 0;
    for (let housed = 0; housed < need && half * wider < TOWN_MOST; half++) for (let dz = -half; dz <= half; dz++) for (let dx = -half; dx <= half; dx += Math.abs(dz) === half ? 1 : 2 * half || 1) {
      const x = cx + dx, z = cz + dz;
      if (!free(x, z)) continue;
      const street = pitch >= 3 && ((dx + 900) % pitch === 0 || (dz + 900) % pitch === 0), lot = hash2(x + ox, z + oz, 213);
      if (!street && lot < HOUSES && housed < need) { house(style, x, z, tall + (tall && wider * lot < 0.5 ? 1 : 0)); housed += holds; }
      else { c.town[idx(x, z)] = 1; g.mat[idx(x, z)] = Mat.Paved; }
    }
    // the wall, with a gate in the middle of each side, while it is a block wide
    if (step === 1 && half > 1) for (let k = -half; k <= half; k++) for (const [x, z] of [[cx + k, cz - half], [cx + k, cz + half], [cx - half, cz + k], [cx + half, cz + k]]) if (k !== 0 && free(x, z)) put(x, z, 1, WALL, WALL, 2);
  }

  // the houses of the finest step, where its plan is known: a far block is a house if a house covers half of it
  // or more (a house too small for that, the block under its middle), as tall as the house stands at this step
  if (plan) {
    const side = plan.pieceBlocks, fine = (v: number) => Math.floor((v * wider) / side);
    for (let pz = fine(oz); pz <= fine(oz + N); pz++) for (let px = fine(ox); px <= fine(ox + N); px++) {
      const here = plan.pieces[`${px},${pz}`];
      if (!here) continue;
      for (let k = 0; k + 8 < here.houses.length; k += 9) {
        const [hx, hz, w, d, , tenths, wall, roof] = here.houses.slice(k, k + 9), rise = stands(tenths / 10), top = rgb(roof, ROOF_LIGHT), walls = rgb(wall);
        let set = 0;
        for (let bz = Math.floor(hz / wider); bz * wider < hz + d; bz++) for (let bx = Math.floor(hx / wider); bx * wider < hx + w; bx++) {
          const covered = (Math.min(hx + w, (bx + 1) * wider) - Math.max(hx, bx * wider)) * (Math.min(hz + d, (bz + 1) * wider) - Math.max(hz, bz * wider)) / (wider * wider);
          if (covered >= 0.5 && free(bx - ox, bz - oz)) { put(bx - ox, bz - oz, rise, top, walls, 1); set++; }
        }
        const mx = Math.floor((hx + w / 2) / wider) - ox, mz = Math.floor((hz + d / 2) / wider) - oz;
        if (!set && free(mx, mz)) put(mx, mz, rise, top, walls, 1);
      }
      // a walled town's ground is paved between its houses, and at the first far step its wall stands about it
      for (const t of here.towns ?? []) {
        const x0 = Math.floor((t.cx - t.half) / wider) - ox, x1 = Math.ceil((t.cx + t.half) / wider) - ox, z0 = Math.floor((t.cz - t.half) / wider) - oz, z1 = Math.ceil((t.cz + t.half) / wider) - oz;
        for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (free(x, z)) { c.town[idx(x, z)] = 1; g.mat[idx(x, z)] = Mat.Paved; }
        if (step === 1) for (let z = z0 - 1; z <= z1; z++) for (let x = x0 - 1; x <= x1; x++) if ((x === x0 - 1 || x === x1 || z === z0 - 1 || z === z1) && x !== (x0 + x1) >> 1 && z !== (z0 + z1) >> 1 && free(x, z)) put(x, z, 1, WALL, WALL, 2);
      }
    }
  }

  // fields: the lots of the finest step, as large as they are, each all field and flat, in the colour of its crop.
  // A field that lies fallow is the grass with its stubble showing through, one under spring corn is green.
  const { blended } = lotAt(step), raised = new Uint8Array(N * N);
  const courses = (x: number, z: number) => o.courses?.(x, z) ?? 1;
  const springOf = (lx: number, lz: number): [RGB, RGB] => [tinted(field(pick(OATS, hash2(lx, lz, 68)), true, OATS_SIDE), SEEN_SPRING), OATS_SIDE];
  const cropOf = (lx: number, lz: number, mx: number, mz: number): [RGB, RGB] => (hash2(lx, lz, 67) < o.vines(mx, mz) ? [tinted(VINEYARD, SEEN_VINES), shade(VINE_BODY, 0.8)] : [tinted(field(pick(WHEAT, hash2(lx, lz, 68)), true), SEEN_WINTER), WHEAT_SIDE]);
  // the lots, their crops and their courses are those of the finest step (settle.ts: the same lot, the same lots
  // drawn by the same numbers), so that a field stays the field it is from step to step
  if (!blended) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (!free(x, z) || !level(x, z)) continue;
    const { lx, lz, shift } = spotOf((x + ox + 0.5) * wider, (z + oz + 0.5) * wider);
    const fx = (lx + 0.5) * LOT_W + shift, fz = (lz + 0.5) * LOT_D, mx = fx / wider - ox, mz = fz / wider - oz;
    // a lot is a field here if it is one at the finest step (settle.ts draws the same number against the same share)
    if (hash2(lx, lz, 65) > o.ploughed(mx, mz) / FIELD_GROUND) continue;
    // the course of the block of fields the lot lies in, the same as at the finest step (settle.ts)
    const course = courseOf(courses(mx, mz), hash2(...blockOf(fx, fz), 66));
    if (course === FALLOW) { put(x, z, 0, SOIL_FALLOW, SOIL_FALLOW, 4); c.share[idx(x, z)] = FALLOW_SHOWS; continue; }
    const vines = course !== SPRING && hash2(lx, lz, 67) < o.vines(mx, mz);
    put(x, z, 0, ...(course === SPRING ? springOf(lx, lz) : cropOf(lx, lz, mx, mz)), course === SPRING ? 5 : vines ? 7 : 6);
  }

  // woods at the first far step: the very trees of the finest step (world.ts: a place for a tree every TREE_PITCH
  // finest blocks, set off by chance, carries one if its number is drawn against the woods' share there). A block
  // shows the woods by how many of the four finest blocks under it lie under a crown, and stands out as a tree
  // where one stands on it: from low down the camera sees the land behind a tree hidden by it, at every step.
  if (step === 1) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (!free(x, z) || g.mat[idx(x, z)] !== Mat.Grass) continue;
    const w = o.woods(x, z);
    if (!w) continue;
    const reach = w.tall ? CROWN_TALL : CROWN, fx = (x + ox) * 2, fz = (z + oz) * 2;
    let under = 0, stand = 0;
    // the trees that stand on the block itself
    for (let tz = Math.floor((fz - 1.2) / TREE_PITCH); tz * TREE_PITCH < fz + 3.2; tz++) for (let tx = Math.floor((fx - 1.2) / TREE_PITCH); tx * TREE_PITCH < fx + 3.2; tx++) {
      if (hash2(tx, tz, 73) > STRAY + TREES_CLOSED * w.share) continue;
      const px = tx * TREE_PITCH + (hash2(tx, tz, 71) - 0.5) * 2.4, pz = tz * TREE_PITCH + (hash2(tx, tz, 72) - 0.5) * 2.4;
      if (px >= fx && px < fx + 2 && pz >= fz && pz < fz + 2) stand++;
    }
    for (let q = 0; q < 4; q++) {
      const px = fx + 0.5 + (q & 1), pz = fz + 0.5 + (q >> 1);
      crowned: for (let tz = Math.floor((pz - 1.2 - reach) / TREE_PITCH); tz * TREE_PITCH <= pz + 1.2 + reach; tz++) for (let tx = Math.floor((px - 1.2 - reach) / TREE_PITCH); tx * TREE_PITCH <= px + 1.2 + reach; tx++) {
        if (hash2(tx, tz, 73) > STRAY + TREES_CLOSED * w.share) continue;
        if (Math.abs(tx * TREE_PITCH + (hash2(tx, tz, 71) - 0.5) * 2.4 - px) <= reach && Math.abs(tz * TREE_PITCH + (hash2(tx, tz, 72) - 0.5) * 2.4 - pz) <= reach) { under++; break crowned; }
      }
    }
    // inside a wood the camera, looking from low down, sees trees wherever it looks: the trunks and crowns in
    // front hide the ground between them. So a block of a closed wood shows the wood whole, whether a crown
    // stands on it or not; out of the woods a block shows as much of a tree as stands on it.
    const closed = w.share > 0.5;
    if (!under && !closed) continue;
    const crown = pick(w.crowns, hash2(x + ox, z + oz, 74)), seen = w.crowns === LEAVES ? SEEN_LEAVES : w.crowns === CYPRESS ? SEEN_CONIFERS : null, rise = stand ? TREE_STANDS : under >= 2 ? 1 : 0;
    if (rise && !level(x, z)) continue;
    put(x, z, 0, seen ? tinted(crown, seen.top) : crown, seen ? tinted(crown, seen.side) : shade(crown, 0.7), w.tall ? 9 : 8);
    c.share[idx(x, z)] = closed || stand ? 1 : under / 4;
    raised[idx(x, z)] = rise;
  }
  // farther out: woods as raised ground, then as its colour
  if (!blended && step > 1) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (!free(x, z) || g.mat[idx(x, z)] !== Mat.Grass) continue;
    const w = o.woods(x, z);
    if (!w || hash2(x + ox, z + oz, 73 + step) > STRAY + CANOPY * w.share) continue;
    const crown = pick(w.crowns, hash2(x + ox, z + oz, 74)), rise = step === 2 ? 1 : 0;
    if (rise && !level(x, z)) continue;
    put(x, z, 0, shade(crown, CANOPY_LIGHT), shade(crown, 0.7), w.tall ? 9 : 8);
    raised[idx(x, z)] = rise;
  }
  // fields and woods as the colour of the ground
  if (blended) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (!free(x, z)) continue;
    const wx = x + ox, wz = z + oz, w = g.mat[idx(x, z)] === Mat.Grass ? o.woods(x, z) : null;
    // of the ploughed ground one course is the fallow, the grass with its stubble showing through, of three courses
    // one the green spring corn, and the rest the winter corn
    const ploughed = o.ploughed(x + 0.5, z + 0.5), n = courses(x + 0.5, z + 0.5), idle = n >= 2 ? ploughed / n : 0, green = n >= 3 ? ploughed / n : 0, sown = ploughed - idle - green;
    const tilled = sown + (soft(sown, hash2(wx, wz, 65 + step)) - sown) * (o.laid ? LAID_CHANCE : 1), bare = idle * FALLOW_SHOWS, fields = tilled + green + bare;
    // a tree darkens its own block and with its shadow about one beside it
    const trees = w ? STRAY + CANOPY * w.share : 0, shaded = 1 - (1 - trees) ** 2, grown = shaded + (soft(shaded, hash2(wx, wz, 73 + step)) - shaded) * (w?.laid ? LAID_CHANCE : 1);
    if (fields + grown <= 0) continue;
    const corn = mix(cropOf(wx, wz, x + 0.5, z + 0.5)[0], springOf(wx, wz)[0], tilled + green > 0 ? green / (tilled + green) : 0);
    const crop = mix(corn, SOIL_FALLOW, fields > 0 ? bare / fields : 0), crown = w ? shade(pick(w.crowns, hash2(wx, wz, 74)), WOODS_FAR) : crop;
    put(x, z, 0, mix(crop, crown, grown / (fields + grown)), undefined, 10);
    c.share[idx(x, z)] = Math.min(1, fields + grown);
  }
  // the ground is raised only now, so that what was laid out saw the land as it is
  for (let i = 0; i < N * N; i++) {
    if (raised[i]) c.rise[i] = raised[i];
    if (c.rise[i]) { g.h[i] += c.rise[i]; g.occ[i] = Math.max(g.occ[i], g.h[i]); }
  }
  last = c;
  return c;
}
