// The land from farther away. On the coarser steps of the map a block is two, four, eight … cells wide, and what
// stands and grows on the land is no longer built house by house and tree by tree: it becomes part of the ground
// itself, as it would look if the finest world were seen from that far. At the first far step the trees and the
// sheaves of the fields are still the finest step's (trees.ts, crops.ts), then woods are a raised green ground and a
// field a flat block of its crop; up to the third far step the houses are still the finest step's houses, each under
// its own roof (houses.ts), then a town is a square of roof-coloured blocks that shrinks to a single block. The great
// buildings and the town walls stay themselves for two steps, built as small as the step makes them. What is still
// drawn as itself is built as tall as the land of its step is (zoom.ts `uprightOf`). So the world loses its detail
// step by step while everything stays where it is, as large as it is and as tall against its hills, and it is drawn
// the same way from every distance: from the
// second far step on woods are blocks in the colours of their crowns standing out of the open land and fields
// patches of their crops, however much land a block holds.
import * as THREE from 'three/webgpu';
import { type Batch, type RGB, type Rnd, hash2, mix, noise2, rgb, seeded, shade } from '../lookprobe/batch';
import { ACACIA, CYPRESS, JUNGLE, LEAVES, OATS, OATS_SIDE, PALM, VINE_BODY, WHEAT, WHEAT_SIDE } from '../lookprobe/blocks';
import { FLOOR, type HouseStyle, type Model, type Style, m, tower, townWall } from '../buildings';
import { type Ground, Mat, N, idx, inGrid, occlude } from '../lookprobe/layout';
import { FALLOW_SHOWS, SOIL_FALLOW } from '../lookprobe/terrain';
import { CROPS_AT, FALLOW_FIELD, OATS_FIELD, WHEAT_FIELD } from './crops';
import { HOUSE_NUMBERS } from './houses';
import { PALMS, RAINFOREST, SAVANNA, STRAY, TEMPERATE, TREE_NUMBERS, TREE_PITCH, TREE_REACH, TREES_AT, TREES_CLOSED, crownColours, treeHeight, treesCode, treesIn } from './trees';
import { uprightOf } from './zoom';
import { blockOf, FALLOW, FIELD_GROUND, PEOPLE_PER_PERSON, PERSONS_PER_FLOOR_BLOCK, POP_OF_SIZE, type Site, SPRING, WALLED_FROM, courseOf } from './settle';

/** What a column carries as part of itself (GroundTraits.cover): where `has` is set, the colours of its top and sides and how far it stands above its ground. */
export interface Cover { /** what far.ts laid on each column (KINDS), for measuring it against the finer step */ kind?: Uint8Array; /** of the mean of the finer step (mean.ts): the colour of all the camera sees of a column, tops and sides, as a flat top would have to show it */ whole?: Float32Array; has: Uint8Array; rise: Uint8Array; top: Float32Array; side: Float32Array; /** how much of the column's top the cover colours, 0 … 1: the rest is the ground's own colour */ share: Float32Array; /** 1 on the paved ground of the towns */ town: Uint8Array; /** the trees of the finest step where they are drawn one by one (trees.ts TREES_AT): trees.ts TREE_NUMBERS to a column */ trees?: Uint8Array; /** the houses of the finest step where they are drawn as houses (HOUSES_UNTIL): houses.ts HOUSE_NUMBERS numbers each */ houses?: number[]; /** the crop of the lot on each column where the fields are drawn sheaf by sheaf (crops.ts CROPS_AT): crops.ts WHEAT_FIELD … OATS_FIELD, 0 where no field lies */ crops?: Uint8Array }
/**
 * The woods at a column: the share of the ground they cover (0 … 1), the colours of their crowns and whether the
 * trees are tall ones. `laid` says that the share is that of this very column, from the forest of the world's
 * year (forest.ts): then chance makes a block only a little more or less wooded than it says.
 */
export interface Woods { share: number; crowns: readonly RGB[]; tall: boolean; laid?: boolean; /** where leafy trees and conifers stand mixed: the share of conifers among the trees, which the finest step draws tree by tree */ conifers?: number }

/** a house of the finest step has two storeys on most of its ground and stands about five blocks high with its roof; it stands out of the ground while that is two thirds of a block; from front to back it is about six blocks deep */
const STOREYS = 2, HOUSE_TALL = 4.5, STANDS_FROM = 2 / 3, HOUSE_DEEP = 6;
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
/**
 * Up to this step the houses of the finest step are drawn as houses, each where it stands and as large as it is, with
 * its walls and roof (lookprobe/houses.ts), and no longer as blocks of their roof's colour: from near to far the same
 * houses. Beyond it a house is smaller than a dot of the picture, and a block shows the roofs on it as before.
 */
export const HOUSES_UNTIL = 3;
/** where the near view gives its roofs gables more often than hips: in the lands of steep roofs (traditions/house-styles.ts NORTH, ALPINE …) */
const GABLES_STEEP = 0.85, GABLES_LOW = 0.3, STEEP_FROM = m(3);
/**
 * A house of the plan as houses.ts draws it. Of the near view's roof (buildings/houses/block.ts) the plan keeps how
 * high the house stands with it, which is its storeys, a band, and the highest roof its land builds (`maxRise`);
 * the walls end a little over the last storey. Its roof rises as steeply as the roofs of its land do, which is the
 * more steeply the higher they may rise (pitch 0.31 under 2.1 m, 0.9 under 4.9 m), as far as `maxRise`.
 */
function houseShape(w: number, d: number, floors: number, height: number, hx: number, hz: number): { eaves: number; rise: number; hips: boolean } {
  const eaves = floors * FLOOR + m(0.62), most = Math.max(0, height - floors * FLOOR - m(1.7)), pitch = Math.min(1.05, 0.34 * most);
  const rise = most < m(0.4) ? 0 : Math.min((Math.min(w, d) / 2) * pitch, most);
  return { eaves, rise, hips: hash2(hx, hz, 142) >= (most >= STEEP_FROM ? GABLES_STEEP : GABLES_LOW) };
}
/** a great building stands as near its place as it finds free ground, within this many finest blocks */
const SEARCH = 16;
/** fields at the finest step lie in lots of eleven by eight blocks (settle.ts) */
const LOT_W = 11, LOT_D = 8;
/**
 * The lots are those of the finest step (settle.ts), at the same places of the world at every step: rows of LOT_D
 * finest blocks, every other row set off by half a lot. A block of the step belongs to the lot its middle lies in.
 * From afar a lot is all field: the fields of a landscape lie together as one ground of many colours, without the
 * balks between them (which made of them a pattern of bricks) and without the farmhouses at their corners. Up to
 * the step LOTS_UNTIL a lot is larger than a block; beyond it the lots are drawn twice as large with every step.
 */
const LOTS_UNTIL = 2;
/** every step's ground is built flatter than the step before by this much (world.ts `flatter`): a block of height stands for this many times the metres */
const FLATTER = 2 ** 0.6;
/** Where a point of the world (in finest blocks) lies among the lots: the lot and how far its row is set off. */
function spotOf(fx: number, fz: number) {
  const lz = Math.floor(fz / LOT_D), shift = lz & 1 ? Math.floor(LOT_W / 2) : 0, lx = Math.floor((fx - shift) / LOT_W);
  return { lx, lz, shift };
}
/** The share of a lot's ground that is its field at a step: of the land's lots `ploughed / lotFill` are fields. */
export const lotFill = (_step: number) => 1;
/** a field from above: the tops of its crop with a little of their sides, and with more of them where it is no longer raised */
const field = (crop: RGB, flat: boolean, side: RGB = WHEAT_SIDE) => mix(crop, side, flat ? 0.6 : 0.3), VINEYARD = mix(VINE_BODY, WHEAT_SIDE, 0.3);
/** a tree of the finest step stands about four of its blocks high, two of the first far step's: a far block on which one stands stands out by that, one under crowns only by one */
const TREE_STANDS = 2;
/** from its trunk a leafy crown and a conifer reach this many finest blocks to each side (blocks.ts `tree`, `cypress`) */
const CROWN = 1.2, CROWN_TALL = 0.6;
/**
 * A house of the plan as the camera sees it from above, at a far step: this much of its roof's colour and this much
 * of its walls' (both sides of the roof, the gable, the chimneys and what shows of the walls and the ground between
 * the houses). Measured against the mean of the finest step (`?mean=compare`) on the house blocks about Paris and
 * about Taranto: steep roofs of the north and low ones of the south come out within a tenth.
 */
const ROOF_SEEN = 0.82, WALL_SEEN = 0.115;
/** the walls of a house as the camera sees them: a fifth of them is windows, doors and the dark under the eaves (the upright faces of the houses' models by their area, buildings/houses, against the colour of their walls) */
const WALLS_SEEN = 0.8;
const roofSeen = (roof: RGB, wall: RGB): RGB => [roof[0] * ROOF_SEEN + wall[0] * WALL_SEEN, roof[1] * ROOF_SEEN + wall[1] * WALL_SEEN, roof[2] * ROOF_SEEN + wall[2] * WALL_SEEN];
const tinted = (c: RGB, by: readonly [number, number, number]): RGB => [c[0] * by[0], c[1] * by[1], c[2] * by[2]];
/** the roofs and the walls the houses of a land show: a tradition's own (buildings/houses/choose.ts `shownOf`), else those of its style */
const shownBy = (s: Style): HouseStyle => (s.tradition ? { ...s.house, roofs: [s.tradition.roof], walls: s.tradition.walls } : s.house);
/** a walled town smaller than a block still shows on the block of its middle, this much of it its roofs: a town is found from as far as the land is seen */
const TOWN_LEAST = 0.6;
/** a walled town is paved within this many finest blocks of its buildings (settle.ts) */
const PAVED_ROUND = 3;
/** what stands on a block too large for it shows its walls too: this many finest blocks more of the block than its ground, by step */
const STANDS_OVER: Record<number, number> = { 3: 8, 4: 10, 5: 8, 6: 7, 7: 4 };
/** of the open land's blocks at the second far step this share carries a tree (a place for one every TREE_PITCH finest blocks, STRAY of them with a tree): as many carry trees farther out */
const LONE = 1 - (1 - STRAY) ** ((4 / TREE_PITCH) ** 2);
/**
 * Where the woods of a landscape lie on blocks that hold more than one wood: a field over the world, spread evenly
 * over 0 … 1, and a block is woods where more of its ground is under trees than the field's value there. Its hills
 * and hollows are some WOODS_ACROSS blocks of the step across, as the single woods are at the second far step, and
 * its wider ones are those of the step before: from step to step the woods of a landscape draw together and stay
 * where they are. (fx, fz) in finest blocks. DRAWN: the woods within this many blocks of a block count for it.
 */
const WOODS_ACROSS = 10, LIES = [4, 3, 1] as const, DRAWN = 2;
const lie = (fx: number, fz: number, step: number) => { let v = 0; for (let j = 0; j < LIES.length; j++) { const wave = WOODS_ACROSS * 2 ** (step + j); v += LIES[j] * noise2(fx / wave, fz / wave, 84 + step + j); } return v / 8; };
const RANKS = 512;
let ranks: Float32Array | undefined;
function liesAt(fx: number, fz: number, step: number): number {
  if (!ranks) {
    // the share of the land on which `lie` is below k / RANKS
    const seen = new Uint32Array(RANKS + 1), side = 400;
    for (let z = 0; z < side; z++) for (let x = 0; x < side; x++) seen[Math.min(RANKS, Math.ceil(lie(x * 7.31, z * 7.31, 0) * RANKS))]++;
    ranks = new Float32Array(RANKS + 1);
    for (let k = 1, below = 0; k <= RANKS; k++) { below += seen[k]; ranks[k] = below / (side * side); }
  }
  const at = Math.max(0, Math.min(1, lie(fx, fz, step))) * RANKS, k = Math.min(RANKS - 1, Math.floor(at));
  return ranks[k] + (ranks[k + 1] - ranks[k]) * (at - k);
}
/**
 * The same for the fields, as a share of the colours far.ts gave them by eye: the rows of the winter corn stand
 * in each other's shade and creases, the spring corn shows more of its ground, and the finest step's vineyards
 * are not dark green but the colour of their ground between the rows. The fallow's soil showed too
 * pale and grey beside the finest step's stubble in the grass. Measured at Paris and in the Black Forest.
 */
const SEEN_WINTER = [0.84, 0.9, 0.9] as const, SEEN_SPRING = [1.08, 0.83, 0.94] as const, SEEN_VINES = [1.53, 1.1, 1.13] as const, SEEN_FALLOW = [0.99, 1.14, 0.76] as const;

/**
 * What the finest step builds in its places (public/data/plan_<year>.json, written by tools/worldprobe/build_plan.ts):
 * per piece of `pieceBlocks` finest world blocks the houses whose middle lies in it (nine numbers each: x, z, w, d
 * in finest world blocks, floors, height in tenths of a block, wall and roof as 0xRRGGBB, kind) and the walled
 * towns (their paved ground is the square of 2 * half about (cx, cz)), and the great buildings where they stand.
 */
export interface Plan { pieceBlocks: number; /** the kinds of the great buildings: church, landmark (a town's greatest), tower, monument */ greatKinds?: readonly string[]; pieces: Record<string, { houses: readonly number[]; /** seven numbers a great building: kind, x, z, w, d, height in tenths, site (-1 a monument) */ greats?: readonly number[]; towns?: readonly { site: number; cx: number; cz: number; half: number; /** null: the town has no wall; else where its wall is open for water (buildings/fortified/town-wall.ts) */ wall?: readonly { side: 'nz' | 'px' | 'pz' | 'nx'; from: number; to: number }[] | null }[] } | undefined> }
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
  woods(x: number, z: number): Woods | null; own(x: number, z: number): boolean; /** whether a column is kept clear of woods: a stream narrower than a block runs through it (world.ts) */ clear?(x: number, z: number): boolean;
}): Cover {
  const c: Cover = { has: new Uint8Array(N * N), rise: new Uint8Array(N * N), top: new Float32Array(N * N * 3), side: new Float32Array(N * N * 3), town: new Uint8Array(N * N), share: new Float32Array(N * N).fill(1), kind: new Uint8Array(N * N) };
  const wider = 2 ** step, ox = g.ox ?? 0, oz = g.oz ?? 0, m = new THREE.Matrix4();
  /** a finest block of height in blocks of this step: what stands as a model, a house or a tree is built as tall as the land (zoom.ts `uprightOf`), and as wide as it is */
  const up = uprightOf(step);
  /** the columns a house drawn as a house stands on: no field or wood grows there */
  const taken = new Uint8Array(N * N);
  const free = (x: number, z: number) => inGrid(x, z) && !g.wet[idx(x, z)] && g.mat[idx(x, z)] !== Mat.Rock && !c.has[idx(x, z)] && !c.town[idx(x, z)] && !taken[idx(x, z)];
  /** whether the ground about a column is level to within a step */
  const level = (x: number, z: number) => { for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inGrid(x + dx, z + dz) && Math.abs(g.h[idx(x + dx, z + dz)] - g.h[idx(x, z)]) > 1) return false; return true; };
  const put = (x: number, z: number, rise: number, top: RGB, side: RGB = top, kind = 0) => { const i = idx(x, z); c.kind![i] = kind; c.has[i] = 1; c.rise[i] = rise; c.top.set(top, i * 3); c.side.set(side, i * 3); };
  const pick = <T>(list: readonly T[], lot: number) => list[Math.min(list.length - 1, Math.floor(lot * list.length))];
  const house = (style: HouseStyle, x: number, z: number, rise: number) => { if (free(x, z)) put(x, z, rise, shade(pick(style.roofs, hash2(x + ox, z + oz, 211)), ROOF_LIGHT), pick(style.walls, hash2(x + ox, z + oz, 212)), 1); };
  /** how many blocks something as tall as `height` finest blocks stands out of the ground at this step */
  /** what stands on a block too large for it shows its walls too (STANDS_OVER): this much more of the block than its ground */
  const seenStanding = 1 + (STANDS_OVER[step] ?? 0) / HOUSE_DEEP;
  const stands = (height: number) => (height / wider >= STANDS_FROM ? Math.max(1, Math.round(height / wider)) : 0);
  /** A great building as near a column as it finds free ground. */
  const landmark = (model: Model, r: Rnd, cx: number, cz: number, roof: RGB) => {
    const w = Math.max(1, Math.round(model.w / wider)), d = Math.max(1, Math.round(model.d / wider)), reach = Math.round(SEARCH / wider);
    /** the height to build at on the footprint from (x0, z0), if all of it is free */
    const lot = (x0: number, z0: number) => { let y = -Infinity; for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) { if (!free(x, z)) return null; y = Math.max(y, g.h[idx(x, z)]); } return y; };
    // a building that covers less than a quarter of a block is no block of its own: its town's houses show there
    if (step > MODELS_UNTIL && model.w * model.d < 0.25 * w * d * wider * wider) return;
    for (let k = 0; k <= reach; k++) for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx += Math.abs(dz) === k ? 1 : 2 * k || 1) {
      const x0 = cx + dx - (w >> 1), z0 = cz + dz - (d >> 1), y = lot(x0, z0);
      if (y === null) continue;
      for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) {
        if (step > MODELS_UNTIL) { put(x, z, stands(model.height), roof, STONE, 3); c.share[idx(x, z)] = Math.min(1, (seenStanding * model.w * model.d) / (w * d * wider * wider)); continue; }
        // the model stands on level, paved ground
        const i = idx(x, z);
        g.h[i] = y; c.town[i] = 1; g.mat[i] = Mat.Paved;
      }
      if (step > MODELS_UNTIL) return;
      if (o.own(x0 + (w >> 1), z0 + (d >> 1))) things.append(model.build(r), m.makeScale(1 / wider, up, 1 / wider).setPosition(x0 + w / 2, y, z0 + d / 2));
      occlude(g, x0, z0, x0 + w, z0 + d, y + model.height * up);
      return;
    }
  };

  // towns and villages: a place is drawn as long as it is at least a block of its own
  for (const s of sites) {
    if (s.size < step - 1) continue;
    // the same great buildings as at the finest step (settle.ts)
    const cx = Math.floor(s.at[0]), cz = Math.floor(s.at[1]), style = shownBy(s.style), r = seeded(1000 + s.id), roof = pick(s.style.house.roofs, 0), near = (reach: number) => Math.round(r.int(-reach, reach) / wider);
    // as many blocks of houses as hold the place's people (settle.ts), as tall as a house is at this step
    const need = (s.pop ?? POP_OF_SIZE[s.size]) / PEOPLE_PER_PERSON, holds = wider * wider * STOREYS * PERSONS_PER_FLOOR_BLOCK, tall = stands(HOUSE_TALL);
    // with the plan of the finest step the houses and the great buildings are its own (below)
    if (plan?.greatKinds) continue;
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

  // the houses of the finest step, where its plan is known: drawn as houses up to HOUSES_UNTIL; beyond it a far
  // block shows the roofs of the houses on it as far as they cover it
  if (plan) {
    /** how much of a block the houses laid on it cover */
    const housed = new Float32Array(N * N);
    const side = plan.pieceBlocks, fine = (v: number) => Math.floor((v * wider) / side);
    for (let pz = fine(oz); pz <= fine(oz + N); pz++) for (let px = fine(ox); px <= fine(ox + N); px++) {
      const here = plan.pieces[`${px},${pz}`];
      if (!here) continue;
      if (step <= HOUSES_UNTIL) {
        // each house as a house, on the columns it stands on
        const houses = (c.houses ??= []);
        for (let k = 0; k + 8 < here.houses.length; k += 9) {
          const [hx, hz, w, d, floors, tenths, wall, roof] = here.houses.slice(k, k + 9), x0 = hx / wider - ox, z0 = hz / wider - oz, x1 = (hx + w) / wider - ox, z1 = (hz + d) / wider - oz;
          if (!inGrid(Math.floor((x0 + x1) / 2), Math.floor((z0 + z1) / 2))) continue;
          // (as tall as the land is built, as the great buildings and the trees stand)
          const shape = houseShape(w, d, floors, tenths / 10, hx, hz);
          houses.push(x0, z0, x1, z1, shape.eaves * up, shape.rise * up, wall, roof, shape.hips ? 1 : 0);
          for (let z = Math.max(0, Math.floor(z0)); z < Math.min(N, Math.ceil(z1)); z++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(N, Math.ceil(x1)); x++) taken[idx(x, z)] = 1;
        }
      } else {
        // where a block is larger than a house, it is the houses' as far as they cover it: a block for every
        // house made a town many times its size
        for (let k = 0; k + 8 < here.houses.length; k += 9) {
          const [hx, hz, w, d, , tenths, wall, roof] = here.houses.slice(k, k + 9), walls = shade(rgb(wall), WALLS_SEEN), top = roofSeen(rgb(roof), rgb(wall));
          for (let bz = Math.floor(hz / wider); bz * wider < hz + d; bz++) for (let bx = Math.floor(hx / wider); bx * wider < hx + w; bx++) {
            const x = bx - ox, z = bz - oz;
            if (!inGrid(x, z)) continue;
            const i = idx(x, z), was = c.kind![i] === 1 ? housed[i] : 0;
            if (!was && !free(x, z)) continue;
            const covered = (Math.min(hx + w, (bx + 1) * wider) - Math.max(hx, bx * wider)) * (Math.min(hz + d, (bz + 1) * wider) - Math.max(hz, bz * wider)) / (wider * wider), all = was + covered;
            // the roofs of a block's houses in the mean, by the ground each covers
            const mean = (of: Float32Array, c1: RGB): RGB => [(of[i * 3] * was + c1[0] * covered) / all, (of[i * 3 + 1] * was + c1[1] * covered) / all, (of[i * 3 + 2] * was + c1[2] * covered) / all];
            put(x, z, all >= 0.5 ? stands(tenths / 10) : 0, was ? mean(c.top, top) : top, was ? mean(c.side, walls) : walls, 1);
            housed[i] = all; c.share[i] = Math.min(1, all * seenStanding);
          }
        }
      }
      // the great buildings where the finest step has them: its models made smaller while they are a few blocks
      // wide, then stone under their roof as far as they cover a block
      for (let k = 0; plan.greatKinds && here.greats && k + 6 < here.greats.length; k += 7) {
        const [kind, gx, gz, gw, gd, tenths, id] = here.greats.slice(k, k + 7), s = sites.find((q) => q.id === id), name = plan.greatKinds[kind];
        const model: Model | null = !s ? null : name === 'church' ? s.style.church : name === 'landmark' ? s.style.great : name === 'tower' ? { build: tower, w: 3, d: 3, height: 10 } : null;
        const roof = s ? pick(s.style.house.roofs, 0) : STONE, x0 = Math.floor(gx / wider) - ox, z0 = Math.floor(gz / wider) - oz, x1 = Math.max(x0 + 1, Math.round((gx + gw) / wider) - ox), z1 = Math.max(z0 + 1, Math.round((gz + gd) / wider) - oz);
        if (step > MODELS_UNTIL || !model) {
          const covers = Math.min(1, (seenStanding * gw * gd) / ((x1 - x0) * (z1 - z0) * wider * wider));
          if (covers >= 0.25) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (free(x, z)) { put(x, z, stands(tenths / 10), roof, STONE, 3); c.share[idx(x, z)] = covers; }
          continue;
        }
        let y = -Infinity;
        for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (inGrid(x, z) && !g.wet[idx(x, z)]) y = Math.max(y, g.h[idx(x, z)]);
        if (y === -Infinity) continue;
        // the model stands on level, paved ground
        for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (inGrid(x, z) && !g.wet[idx(x, z)]) { const i = idx(x, z); g.h[i] = y; c.town[i] = 1; c.has[i] = 0; g.mat[i] = Mat.Paved; }
        const mx = (gx + gw / 2) / wider - ox, mz = (gz + gd / 2) / wider - oz;
        if (o.own(Math.floor(mx), Math.floor(mz))) things.append(model.build(seeded(1000 + id + k)), m.makeScale(1 / wider, up, 1 / wider).setPosition(mx, y, mz));
        occlude(g, x0, z0, x1, z1, y + (tenths / 10) * up);
      }
    }
    // the towns after all the houses: a town's paving and wall leave the ground of every house free, also of
    // those in a piece that comes after the town's
    for (let pz = fine(oz); pz <= fine(oz + N); pz++) for (let px = fine(ox); px <= fine(ox + N); px++) {
      const here = plan.pieces[`${px},${pz}`];
      if (!here) continue;
      // a walled town's ground is paved round its houses, and at the first far step its wall stands about it,
      // open where the finest step's wall is open for water
      for (const t of here.towns ?? []) {
        const x0 = Math.floor((t.cx - t.half) / wider) - ox, x1 = Math.ceil((t.cx + t.half) / wider) - ox, z0 = Math.floor((t.cz - t.half) / wider) - oz, z1 = Math.ceil((t.cz + t.half) / wider) - oz;
        if (wider > 2 * t.half) {
          // (its houses are drawn as houses)
          if (step <= HOUSES_UNTIL) continue;
          // a town smaller than a block: the blocks it lies on show its roofs as far as it covers them
          const s = sites.find((q) => q.id === t.site), roofs = s ? roofSeen(pick(shownBy(s.style).roofs, 0), pick(shownBy(s.style).walls, 0)) : null;
          for (let z = z0; roofs && z < z1; z++) for (let x = x0; x < x1; x++) {
            if (!inGrid(x, z) || g.wet[idx(x, z)] || !(free(x, z) || c.kind![idx(x, z)] === 1)) continue;
            const bx = (x + ox) * wider, bz = (z + oz) * wider, i = idx(x, z);
            const covers = Math.max(0, Math.min(t.cx + t.half, bx + wider) - Math.max(t.cx - t.half, bx)) * Math.max(0, Math.min(t.cz + t.half, bz + wider) - Math.max(t.cz - t.half, bz)) / (wider * wider), here = t.cx >= bx && t.cx < bx + wider && t.cz >= bz && t.cz < bz + wider, seen = Math.max(here ? TOWN_LEAST : 0, Math.min(1, covers * HOUSES * seenStanding));
            if (seen <= (c.kind![i] === 1 ? c.share[i] : 0)) continue;
            put(x, z, 0, roofs, shade(pick(shownBy(s!.style).walls, 0), WALLS_SEEN), 1); c.share[i] = seen;
          }
          continue;
        }
        // paved as the finest step paves it: within PAVED_ROUND of its blocks of a building (settle.ts), a far
        // block where half of it is
        const across = 2 * t.half, fx0 = t.cx - t.half, fz0 = t.cz - t.half, near = new Uint8Array(across * across);
        const round = (bx: number, bz: number, bw: number, bd: number) => { for (let z = Math.max(0, Math.floor(bz) - PAVED_ROUND - fz0); z < Math.min(across, Math.ceil(bz + bd) + PAVED_ROUND - fz0); z++) for (let x = Math.max(0, Math.floor(bx) - PAVED_ROUND - fx0); x < Math.min(across, Math.ceil(bx + bw) + PAVED_ROUND - fx0); x++) near[z * across + x] = 1; };
        for (let qz = Math.floor((fz0 - PAVED_ROUND) / side); qz <= Math.floor((fz0 + across + PAVED_ROUND) / side); qz++) for (let qx = Math.floor((fx0 - PAVED_ROUND) / side); qx <= Math.floor((fx0 + across + PAVED_ROUND) / side); qx++) {
          const there = plan.pieces[`${qx},${qz}`];
          for (let k = 0; there && k + 8 < there.houses.length; k += 9) round(there.houses[k], there.houses[k + 1], there.houses[k + 2], there.houses[k + 3]);
          for (let k = 0; there?.greats && k + 6 < there.greats.length; k += 7) round(there.greats[k + 1], there.greats[k + 2], there.greats[k + 3], there.greats[k + 4]);
        }
        const paved = (x: number, z: number) => { let n = 0; for (let fz = Math.max(0, (z + oz) * wider - fz0); fz < Math.min(across, (z + oz + 1) * wider - fz0); fz++) for (let fx = Math.max(0, (x + ox) * wider - fx0); fx < Math.min(across, (x + ox + 1) * wider - fx0); fx++) n += near[fz * across + fx]; return 2 * n >= wider * wider; };
        for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (inGrid(x, z) && paved(x, z)) { if (free(x, z) || (taken[idx(x, z)] && !g.wet[idx(x, z)] && g.mat[idx(x, z)] !== Mat.Rock && !c.has[idx(x, z)])) { c.town[idx(x, z)] = 1; g.mat[idx(x, z)] = Mat.Paved; } else if (c.kind![idx(x, z)] === 1) g.mat[idx(x, z)] = Mat.Paved; }
        // the wall as long as the great buildings stay themselves: the finest step's wall (settle.ts), made smaller,
        // on the lowest ground of its ring, with its gates and its openings for the water; nothing grows on its ring
        if (step <= MODELS_UNTIL && t.wall !== null) {
          let lo = Infinity;
          for (let z = z0 - 1; z <= z1; z++) for (let x = x0 - 1; x <= x1; x++) {
            if (!(x === x0 - 1 || x === x1 || z === z0 - 1 || z === z1) || !inGrid(x, z)) continue;
            taken[idx(x, z)] = 1;
            if (!g.wet[idx(x, z)]) lo = Math.min(lo, g.h[idx(x, z)]);
          }
          const mx = t.cx / wider - ox, mz = t.cz / wider - oz;
          if (lo < Infinity && o.own(Math.floor(mx), Math.floor(mz))) things.append(townWall(t.half * 2 + 2, t.half * 2 + 2, t.wall ?? []), m.makeScale(1 / wider, up, 1 / wider).setPosition(mx, lo, mz));
        }
      }
    }
  }

  // fields: the lots of the finest step, as large as they are, each all field and flat, in the colour of its crop.
  // A field that lies fallow is the grass with its stubble showing through, one under spring corn is green.
  // Farther out than LOTS_UNTIL a block is as large as a lot and then larger. The fields are drawn as before all the
  // same: in patches of some three blocks by two, each of one crop, a patch for the lots that lie under it. So the
  // ploughed land looks from every distance as it does from the middle one, and only shows less of itself.
  const grown = 2 ** Math.max(0, step - LOTS_UNTIL), salt = grown > 1 ? 7 * step : 0, raised = new Uint8Array(N * N);
  const courses = (x: number, z: number) => o.courses?.(x, z) ?? 1;
  const springOf = (lx: number, lz: number): [RGB, RGB] => [tinted(field(pick(OATS, hash2(lx, lz, 68 + salt)), true, OATS_SIDE), SEEN_SPRING), OATS_SIDE];
  const cropOf = (lx: number, lz: number, mx: number, mz: number): [RGB, RGB] => (hash2(lx, lz, 67 + salt) < o.vines(mx, mz) ? [tinted(VINEYARD, SEEN_VINES), shade(VINE_BODY, 0.8)] : [tinted(field(pick(WHEAT, hash2(lx, lz, 68 + salt)), true), SEEN_WINTER), WHEAT_SIDE]);
  // the lots, their crops and their courses are those of the finest step (settle.ts: the same lot, the same lots
  // drawn by the same numbers), so that a field stays the field it is from step to step
  // And a lot is a field only where the finest step finds room for one (settle.ts `lot`): all of it, with a balk's
  // width round it, is dry ground without rock on which nothing is built, and it is level to within two blocks of
  // the finest step. In hill country most lots are not, and the land stays grass.
  const built = Uint8Array.from(c.has, (has, i) => (has || c.town[i] || taken[i] || g.wet[i] || g.mat[i] === Mat.Rock ? 1 : 0)), slack = Math.floor(2 / FLATTER ** step), rooms = new Map<number, boolean>();
  // A walled town keeps the ground within its wall to itself and two blocks round it (settle.ts claims the square):
  // no lot of the finest step touches that and no tree stands on it (world.ts), so none does here. In finest world
  // blocks, four numbers to a town.
  const walls: number[] = [];
  if (plan) {
    const fine = (v: number) => Math.floor((v * wider) / plan!.pieceBlocks);
    for (let pz = fine(oz) - 1; pz <= fine(oz + N) + 1; pz++) for (let px = fine(ox) - 1; px <= fine(ox + N) + 1; px++) for (const t of plan.pieces[`${px},${pz}`]?.towns ?? []) if (t.wall !== null) walls.push(t.cx - t.half - 2, t.cz - t.half - 2, t.cx + t.half + 2, t.cz + t.half + 2);
  }
  /** whether the middle of a column lies on a walled town's square */
  const walledIn = (x: number, z: number) => {
    const fx = (x + ox + 0.5) * wider, fz = (z + oz + 0.5) * wider;
    for (let k = 0; k < walls.length; k += 4) if (fx >= walls[k] && fx < walls[k + 2] && fz >= walls[k + 1] && fz < walls[k + 3]) return true;
    return false;
  };
  const room = (lx: number, lz: number, shift: number) => {
    const key = (lx + 32768) * 65536 + lz + 32768, known = rooms.get(key);
    if (known !== undefined) return known;
    const x0 = Math.floor(((lx * LOT_W + shift) * grown) / wider) - ox, x1 = Math.floor(((lx * LOT_W + shift + LOT_W + 1) * grown - 1) / wider) - ox, z0 = Math.floor((lz * LOT_D * grown) / wider) - oz, z1 = Math.floor(((lz * LOT_D + LOT_D + 1) * grown - 1) / wider) - oz;
    // the lot with the balk round it, in finest world blocks
    const fx0 = (lx * LOT_W + shift) * grown, fx1 = fx0 + (LOT_W + 1) * grown, fz0 = lz * LOT_D * grown, fz1 = fz0 + (LOT_D + 1) * grown;
    let lo = Infinity, hi = -Infinity, fits = true;
    for (let k = 0; k < walls.length && fits; k += 4) if (fx0 < walls[k + 2] && walls[k] < fx1 && fz0 < walls[k + 3] && walls[k + 1] < fz1) fits = false;
    for (let z = z0; z <= z1 && fits; z++) for (let x = x0; x <= x1; x++) {
      if (!inGrid(x, z)) continue;
      if (built[idx(x, z)]) { fits = false; break; }
      lo = Math.min(lo, g.h[idx(x, z)]); hi = Math.max(hi, g.h[idx(x, z)]);
    }
    fits &&= hi - lo <= slack;
    rooms.set(key, fits);
    return fits;
  };
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (!free(x, z)) continue;
    const { lx, lz, shift } = spotOf(((x + ox + 0.5) * wider) / grown, ((z + oz + 0.5) * wider) / grown);
    const fx = ((lx + 0.5) * LOT_W + shift) * grown, fz = (lz + 0.5) * LOT_D * grown, mx = fx / wider - ox, mz = fz / wider - oz;
    // a lot is a field here if it is one at the finest step (settle.ts draws the same number against the same share)
    if (hash2(lx, lz, 65 + salt) > o.ploughed(mx, mz) / FIELD_GROUND || !room(lx, lz, shift)) continue;
    // the course of the block of fields the lot lies in, the same as at the finest step (settle.ts)
    const course = courseOf(courses(mx, mz), hash2(...blockOf(fx / grown, fz / grown), 66 + salt));
    const vines = course !== SPRING && course !== FALLOW && hash2(lx, lz, 67 + salt) < o.vines(mx, mz);
    // at the first far step a field is the finest step's: its soil, and its sheaves standing on it (crops.ts draws
    // them from the crop laid down here); the vineyards stay a colour of their own
    if (step === CROPS_AT && !vines) {
      const i = idx(x, z);
      g.mat[i] = Mat.Soil; taken[i] = 1; c.kind![i] = course === FALLOW ? 4 : course === SPRING ? 5 : 6;
      (c.crops ??= new Uint8Array(N * N))[i] = course === FALLOW ? FALLOW_FIELD : course === SPRING ? OATS_FIELD : WHEAT_FIELD;
      continue;
    }
    if (course === FALLOW) { put(x, z, 0, tinted(SOIL_FALLOW, SEEN_FALLOW), SOIL_FALLOW, 4); c.share[idx(x, z)] = FALLOW_SHOWS; continue; }
    put(x, z, 0, ...(course === SPRING ? springOf(lx, lz) : cropOf(lx, lz, mx, mz)), course === SPRING ? 5 : vines ? 7 : 6);
  }

  // woods at the first far step: the very trees of the finest step, each where it stands, as large as it is and in
  // its colours (trees.ts draws them from the woods' share and kind at the column, which are laid down here). The
  // ground between them is the ground, which the trees darken round them by hiding its sky, as at the finest step.
  if (step === TREES_AT) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (!free(x, z) || g.mat[idx(x, z)] !== Mat.Grass || walledIn(x, z)) continue;
    const w = o.woods(x, z);
    if (!w) continue;
    const kind = w.crowns === JUNGLE ? RAINFOREST : w.crowns === ACACIA ? SAVANNA : w.crowns === PALM ? PALMS : TEMPERATE;
    const [code, sort] = treesCode(w.share, kind, w.conifers ?? (w.tall ? 1 : 0)), i = idx(x, z);
    let stand = 0;
    treesIn(x + ox, z + oz, (code - 1) / 254, (px, pz, tx, tz) => {
      const cx = px / wider - ox, cz = pz / wider - oz, reach = TREE_REACH / wider;
      occlude(g, cx - reach, cz - reach, cx + reach, cz + reach, Math.ceil((g.h[i] + treeHeight(sort, tx, tz) * up) * 64) / 64);
      stand++;
    });
    if (!stand) continue;
    const trees = (c.trees ??= new Uint8Array(N * N * TREE_NUMBERS));
    trees[i * TREE_NUMBERS] = code; trees[i * TREE_NUMBERS + 1] = sort;
  }
  // at the second far step: a block is woods by the trees of the finest step that
  // stand on it, in the same colours; a closed wood shows whole
  if (step === 2) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (!free(x, z) || g.mat[idx(x, z)] !== Mat.Grass || walledIn(x, z)) continue;
    const w = o.woods(x, z);
    if (!w) continue;
    const fx = (x + ox) * wider, fz = (z + oz) * wider;
    let conifers = 0, leafy = 0;
    for (let tz = Math.floor((fz - 1.2) / TREE_PITCH); tz * TREE_PITCH < fz + wider + 1.2; tz++) for (let tx = Math.floor((fx - 1.2) / TREE_PITCH); tx * TREE_PITCH < fx + wider + 1.2; tx++) {
      if (hash2(tx, tz, 73) > STRAY + TREES_CLOSED * w.share) continue;
      const px = tx * TREE_PITCH + (hash2(tx, tz, 71) - 0.5) * 2.4, pz = tz * TREE_PITCH + (hash2(tx, tz, 72) - 0.5) * 2.4;
      if (px < fx || px >= fx + wider || pz < fz || pz >= fz + wider) continue;
      if (w.conifers === undefined ? w.tall : hash2(tx, tz, 74) < w.conifers) conifers++; else leafy++;
    }
    const closed = w.share > 0.5, trees = conifers + leafy;
    if (!trees && !closed) continue;
    const tall = w.conifers === undefined ? w.tall : conifers > leafy || (conifers === leafy && w.tall), crowns = w.conifers === undefined ? w.crowns : tall ? CYPRESS : LEAVES;
    const crown = pick(crowns, hash2(x + ox, z + oz, 74)), rise = trees ? stands(TREE_STANDS * 2) : 0;
    if (rise && !level(x, z)) continue;
    // a closed wood is one roof of blocks here: of the shaded sides between the crowns, which the first far step
    // shows as the sides of its blocks, nothing is seen, so the tops carry them
    put(x, z, 0, ...crownColours(crown, crowns), tall ? 9 : 8);
    // out of the woods a block shows as much of its trees as their crowns cover of it
    c.share[idx(x, z)] = closed ? 1 : Math.min(1, (trees * (2 * (tall ? CROWN_TALL : CROWN)) ** 2) / (wider * wider));
    raised[idx(x, z)] = rise;
  }
  // Farther out a block is larger than a tree, then than a wood. The woods are drawn as at the second far step all
  // the same: dark blocks that stand a block out of the open land, whole woods with clearings between them, some
  // WOODS_ACROSS blocks across. For that the woods of a landscape draw together: a block is woods where more of the
  // ground about it (within DRAWN blocks) lies under trees than `liesAt` asks there. So a landscape keeps as much
  // woodland as it has, lying where most of its woods lie. Here and there a block of the open land carries trees,
  // as often as one of the second far step does.
  if (step > 2) {
    const grows: (Woods | null)[] = new Array(N * N).fill(null), under = new Float32Array(N * N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (g.wet[idx(x, z)] || g.mat[idx(x, z)] !== Mat.Grass) continue;
      const w = o.woods(x, z);
      if (w) { grows[idx(x, z)] = w; under[idx(x, z)] = w.share; }
    }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const w = grows[idx(x, z)];
      if (!w || !free(x, z) || !level(x, z) || o.clear?.(x, z) || walledIn(x, z)) continue;
      // where the single woods still show (the share differs from block to block), those about the block count
      let about = w.share;
      if (w.laid) {
        let sum = 0, n = 0;
        for (let dz = -DRAWN; dz <= DRAWN; dz++) for (let dx = -DRAWN; dx <= DRAWN; dx++) if (inGrid(x + dx, z + dz) && grows[idx(x + dx, z + dz)]) { sum += under[idx(x + dx, z + dz)]; n++; }
        about = sum / n;
      }
      const wx = x + ox, wz = z + oz, closed = about > 0 && about >= liesAt((wx + 0.5) * wider, (wz + 0.5) * wider, step);
      if (!closed && hash2(wx, wz, 73 + step) >= LONE) continue;
      const tall = w.conifers === undefined ? w.tall : hash2(wx, wz, 76) < w.conifers, crowns = w.conifers === undefined ? w.crowns : tall ? CYPRESS : LEAVES;
      put(x, z, 0, ...crownColours(pick(crowns, hash2(wx, wz, 74)), crowns), tall ? 9 : 8);
      c.share[idx(x, z)] = closed ? 1 : Math.min(1, (2 * (tall ? CROWN_TALL : CROWN)) ** 2 / 16);
      raised[idx(x, z)] = 1;
    }
  }
  // the ground is raised only now, so that what was laid out saw the land as it is
  for (let i = 0; i < N * N; i++) {
    if (raised[i]) c.rise[i] = raised[i];
    if (c.rise[i]) { g.h[i] += c.rise[i]; g.occ[i] = Math.max(g.occ[i], g.h[i]); }
  }
  // a house drawn as a house hides the sky of the ground round it up to its eaves, as at the finest step (on a 64th
  // of a block, so that a table keeps it to the bit: table.ts `packTable`)
  for (let k = 0; c.houses && k < c.houses.length; k += HOUSE_NUMBERS) {
    const [x0, z0, x1, z1, eaves] = c.houses.slice(k, k + 5);
    let base = -Infinity;
    for (let z = Math.max(0, Math.floor(z0)); z < Math.min(N, Math.ceil(z1)); z++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(N, Math.ceil(x1)); x++) base = Math.max(base, g.h[idx(x, z)]);
    if (base > -Infinity) occlude(g, x0, z0, x1, z1, Math.ceil((base + eaves) * 64) / 64);
  }
  last = c;
  return c;
}
