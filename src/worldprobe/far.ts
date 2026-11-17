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
 * colour as far as they cover it, a little more or less from block to block.
 */
const soft = (share: number, lot: number) => share + (lot - 0.5) * 2 * Math.min(share, 1 - share);
/** where no woods stand, a lone tree still stands on this share of the finest step's places for one */
const STRAY = 0.01;
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
const SEEN_LEAVES = { top: [0.61, 0.66, 0.87], side: [0.31, 0.51, 0.83] } as const, SEEN_CONIFERS = { top: [2.34, 1.14, 1.03], side: [1.6, 1.09, 1.1] } as const;
/** a house of the plan as the camera sees it from afar, by its roof's own colour: both sides of the roof, the gable and what shows of the walls are this much lighter than the roof (measured against the mean of the finest step on the house blocks about Paris, as `SEEN_LEAVES`; one number, so that every roof keeps its hue) */
const ROOF_SEEN = 1.42;
/** the tops of a closed wood at the second far step, as a share of those of the first: measured on the pictures of both sides of the border between them (width 1150 against 1242, tools/zoom) at Paris, checked in the Black Forest */
const ROOFED = 0.72;
const tinted = (c: RGB, by: readonly [number, number, number]): RGB => [c[0] * by[0], c[1] * by[1], c[2] * by[2]];
/**
 * From the step on where a tree no longer stands a block high, the woods lie flat in the ground's colour. What the
 * steps before show of them the camera, looking from low down, still has to see: their tops with the shade between
 * the crowns (FLAT_WOODS, as a share of the first far step's tops), and before the land behind a wood the shaded
 * sides of its trees, lit as a top is (SIDE_FLAT, as a share of the sides' colour). STANDS_OVER is how far those
 * sides hide the land behind them, in finest blocks by step: a tree four blocks high seen from 19 to 40 degrees
 * above, and less as the camera rises towards the flat map. A lone tree of the finest step, a dot of the steps
 * before, darkens a block as often as its crown and its side cover one, LONE_SEEN times that (the dot stands in
 * shade of its own); the frayed edge of a wood by its share and a little more (EDGE_SEEN). Measured on the pictures
 * of both sides of the steps' borders (2300 against 2500 blocks across, 4600 against 5000, 9200 against 10000,
 * 18400 against 20000; tools/zoom/border.py) at Paris, checked in the Black Forest, in Tuscany and in Sweden.
 */
/** from this step on a block is larger than a wood (forest.ts WOOD: forty finest blocks) */
const WOODS_BLEND = 5;
/** a walled town smaller than a block still shows on the block of its middle, this much of it its roofs: a town is found from as far as the land is seen */
const TOWN_LEAST = 0.6;
/** mixed evenly into a block the woods show paler than as blocks of their own beside open ones: this much more of them, measured at the border of the steps (9200 against 10000 blocks across at Paris) */
const BLEND_SEEN = 1.3;
const SIDE_FLAT = 0.55, LONE_SEEN = 1.6, EDGE_SEEN = 16;
const FLAT_WOODS = [0.55, 0.55, 0.55] as const, STANDS_OVER: Record<number, number> = { 3: 8, 4: 10, 5: 8, 6: 7, 7: 4 };
/**
 * The same for the fields, as a share of the colours far.ts gave them by eye: the rows of the winter corn stand
 * in each other's shade and creases, the spring corn shows more of its ground, and the finest step's vineyards
 * are not dark green but the colour of their ground between the rows. The fallow's soil showed too
 * pale and grey beside the finest step's stubble in the grass. Measured at Paris and in the Black Forest.
 */
const SEEN_WINTER = [0.84, 0.9, 0.9] as const, SEEN_SPRING = [1.08, 0.83, 0.94] as const, SEEN_VINES = [1.53, 1.1, 1.13] as const, SEEN_FALLOW = [0.99, 1.14, 0.76] as const;
/** how much of the chance from block to block is left where the woods and the fields are laid out */
const LAID_CHANCE = 0.25;
/** seen from above without the shade between the crowns, woods are darker than a crown in the sun */
const CANOPY_LIGHT = 0.8;

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
  /** what stands on a block too large for it shows its walls too, as the trees their sides (STANDS_OVER): this much more of the block than its ground */
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

  // the houses of the finest step, where its plan is known: a far block is a house if a house covers half of it
  // or more (a house too small for that, the block under its middle), as tall as the house stands at this step
  if (plan) {
    /** how much of a block the houses laid on it cover */
    const housed = new Float32Array(N * N);
    const side = plan.pieceBlocks, fine = (v: number) => Math.floor((v * wider) / side);
    for (let pz = fine(oz); pz <= fine(oz + N); pz++) for (let px = fine(ox); px <= fine(ox + N); px++) {
      const here = plan.pieces[`${px},${pz}`];
      if (!here) continue;
      if (step > MODELS_UNTIL) {
        // where a block is larger than a house, it is the houses' as far as they cover it: a block for every
        // house made a town many times its size
        for (let k = 0; k + 8 < here.houses.length; k += 9) {
          const [hx, hz, w, d, , tenths, wall, roof] = here.houses.slice(k, k + 9), top = shade(rgb(roof), ROOF_SEEN), walls = rgb(wall);
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
      } else for (let k = 0; k + 8 < here.houses.length; k += 9) {
        const [hx, hz, w, d, , tenths, wall, roof] = here.houses.slice(k, k + 9), top = shade(rgb(roof), ROOF_SEEN), walls = rgb(wall);
        const on: [number, number][] = [];
        for (let bz = Math.floor(hz / wider); bz * wider < hz + d; bz++) for (let bx = Math.floor(hx / wider); bx * wider < hx + w; bx++) {
          const covered = (Math.min(hx + w, (bx + 1) * wider) - Math.max(hx, bx * wider)) * (Math.min(hz + d, (bz + 1) * wider) - Math.max(hz, bz * wider)) / (wider * wider);
          if (covered >= 0.5 && free(bx - ox, bz - oz)) on.push([bx - ox, bz - oz]);
        }
        const mx = Math.floor((hx + w / 2) / wider) - ox, mz = Math.floor((hz + d / 2) / wider) - oz;
        if (!on.length && free(mx, mz)) on.push([mx, mz]);
        // the far blocks hold as much as the house does: it stands lower by as much as they are wider than it
        const rise = stands((tenths / 10) * Math.min(1, (w * d) / (on.length * wider * wider)));
        for (const [x, z] of on) put(x, z, rise, top, walls, 1);
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
        if (o.own(Math.floor(mx), Math.floor(mz))) things.append(model.build(seeded(1000 + id + k)), m.makeScale(1 / wider, 1 / wider, 1 / wider).setPosition(mx, y, mz));
        occlude(g, x0, z0, x1, z1, y + tenths / 10 / wider);
      }
      // a walled town's ground is paved between its houses, and at the first far step its wall stands about it,
      // open where the finest step's wall is open for water
      for (const t of here.towns ?? []) {
        const x0 = Math.floor((t.cx - t.half) / wider) - ox, x1 = Math.ceil((t.cx + t.half) / wider) - ox, z0 = Math.floor((t.cz - t.half) / wider) - oz, z1 = Math.ceil((t.cz + t.half) / wider) - oz;
        if (wider > 2 * t.half) {
          // a town smaller than a block: the blocks it lies on show its roofs as far as it covers them
          const s = sites.find((q) => q.id === t.site), roofs = s ? shade(pick(s.style.house.roofs, 0), ROOF_SEEN) : null;
          for (let z = z0; roofs && z < z1; z++) for (let x = x0; x < x1; x++) {
            if (!inGrid(x, z) || g.wet[idx(x, z)] || !(free(x, z) || c.kind![idx(x, z)] === 1)) continue;
            const bx = (x + ox) * wider, bz = (z + oz) * wider, i = idx(x, z);
            const covers = Math.max(0, Math.min(t.cx + t.half, bx + wider) - Math.max(t.cx - t.half, bx)) * Math.max(0, Math.min(t.cz + t.half, bz + wider) - Math.max(t.cz - t.half, bz)) / (wider * wider), here = t.cx >= bx && t.cx < bx + wider && t.cz >= bz && t.cz < bz + wider, seen = Math.max(here ? TOWN_LEAST : 0, Math.min(1, covers * HOUSES * seenStanding));
            if (seen <= (c.kind![i] === 1 ? c.share[i] : 0)) continue;
            put(x, z, 0, roofs, pick(s!.style.house.walls, 0), 1); c.share[i] = seen;
          }
          continue;
        }
        for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (free(x, z)) { c.town[idx(x, z)] = 1; g.mat[idx(x, z)] = Mat.Paved; } else if (inGrid(x, z) && c.kind![idx(x, z)] === 1) g.mat[idx(x, z)] = Mat.Paved;
        const open = (side: 'nz' | 'px' | 'pz' | 'nx', along: number) => (t.wall ?? []).some((gap) => gap.side === side && along >= gap.from && along <= gap.to);
        if (step === 1 && t.wall !== null) for (let z = z0 - 1; z <= z1; z++) for (let x = x0 - 1; x <= x1; x++) {
          if (!(x === x0 - 1 || x === x1 || z === z0 - 1 || z === z1) || x === (x0 + x1) >> 1 || z === (z0 + z1) >> 1 || !free(x, z)) continue;
          // where the block lies along its side of the wall, in finest blocks from the side's middle
          const ax = (x + ox + 0.5) * wider - t.cx, az = (z + oz + 0.5) * wider - t.cz;
          if (z === z0 - 1 ? open('nz', ax) : z === z1 ? open('pz', ax) : x === x0 - 1 ? open('nx', az) : open('px', az)) continue;
          put(x, z, 1, WALL, WALL, 2);
        }
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
    if (course === FALLOW) { put(x, z, 0, tinted(SOIL_FALLOW, SEEN_FALLOW), SOIL_FALLOW, 4); c.share[idx(x, z)] = FALLOW_SHOWS; continue; }
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
    const fx = (x + ox) * 2, fz = (z + oz) * 2;
    /** whether the tree at a place is a conifer: drawn tree by tree as at the finest step, where the two stand mixed */
    const dark = (tx: number, tz: number) => (w.conifers === undefined ? w.tall : hash2(tx, tz, 74) < w.conifers);
    let under = 0, stand = 0, conifers = 0, leafy = 0;
    // the trees that stand on the block itself
    for (let tz = Math.floor((fz - 1.2) / TREE_PITCH); tz * TREE_PITCH < fz + 3.2; tz++) for (let tx = Math.floor((fx - 1.2) / TREE_PITCH); tx * TREE_PITCH < fx + 3.2; tx++) {
      if (hash2(tx, tz, 73) > STRAY + TREES_CLOSED * w.share) continue;
      const px = tx * TREE_PITCH + (hash2(tx, tz, 71) - 0.5) * 2.4, pz = tz * TREE_PITCH + (hash2(tx, tz, 72) - 0.5) * 2.4;
      if (px >= fx && px < fx + 2 && pz >= fz && pz < fz + 2) { stand++; if (dark(tx, tz)) conifers += 4; else leafy += 4; }
    }
    for (let q = 0; q < 4; q++) {
      const px = fx + 0.5 + (q & 1), pz = fz + 0.5 + (q >> 1);
      crowned: for (let tz = Math.floor((pz - 1.2 - CROWN) / TREE_PITCH); tz * TREE_PITCH <= pz + 1.2 + CROWN; tz++) for (let tx = Math.floor((px - 1.2 - CROWN) / TREE_PITCH); tx * TREE_PITCH <= px + 1.2 + CROWN; tx++) {
        if (hash2(tx, tz, 73) > STRAY + TREES_CLOSED * w.share) continue;
        const tall = dark(tx, tz), reach = tall ? CROWN_TALL : CROWN;
        if (Math.abs(tx * TREE_PITCH + (hash2(tx, tz, 71) - 0.5) * 2.4 - px) <= reach && Math.abs(tz * TREE_PITCH + (hash2(tx, tz, 72) - 0.5) * 2.4 - pz) <= reach) { under++; if (tall) conifers++; else leafy++; break crowned; }
      }
    }
    // the block is of the kind most of its trees are
    const tall = w.conifers === undefined ? w.tall : conifers > leafy || (conifers === leafy && w.tall), crowns = w.conifers === undefined ? w.crowns : tall ? CYPRESS : LEAVES;
    // inside a wood the camera, looking from low down, sees trees wherever it looks: the trunks and crowns in
    // front hide the ground between them. So a block of a closed wood shows the wood whole, whether a crown
    // stands on it or not; out of the woods a block shows as much of a tree as stands on it.
    const closed = w.share > 0.5;
    if (!under && !closed) continue;
    const crown = pick(crowns, hash2(x + ox, z + oz, 74)), seen = crowns === LEAVES ? SEEN_LEAVES : crowns === CYPRESS ? SEEN_CONIFERS : null, rise = stand ? TREE_STANDS : under >= 2 ? 1 : 0;
    if (rise && !level(x, z)) continue;
    put(x, z, 0, seen ? tinted(crown, seen.top) : crown, seen ? tinted(crown, seen.side) : shade(crown, 0.7), tall ? 9 : 8);
    c.share[idx(x, z)] = closed || stand ? 1 : under / 4;
    raised[idx(x, z)] = rise;
  }
  // farther out, while a tree still stands a block high: a block is woods by the trees of the finest step that
  // stand on it, in the same colours; a closed wood shows whole
  if (!blended && step > 1) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (!free(x, z) || g.mat[idx(x, z)] !== Mat.Grass) continue;
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
    const crown = pick(crowns, hash2(x + ox, z + oz, 74)), seen = crowns === LEAVES ? SEEN_LEAVES : crowns === CYPRESS ? SEEN_CONIFERS : null, rise = trees ? stands(TREE_STANDS * 2) : 0;
    if (rise && !level(x, z)) continue;
    // a closed wood is one roof of blocks here: of the shaded sides between the crowns, which the first far step
    // shows as the sides of its blocks, nothing is seen, so the tops carry them
    put(x, z, 0, shade(seen ? tinted(crown, seen.top) : shade(crown, CANOPY_LIGHT), closed ? ROOFED : 1), seen ? tinted(crown, seen.side) : shade(crown, 0.7), tall ? 9 : 8);
    // out of the woods a block shows as much of its trees as their crowns cover of it
    c.share[idx(x, z)] = closed ? 1 : Math.min(1, (trees * (2 * (tall ? CROWN_TALL : CROWN)) ** 2) / (wider * wider));
    raised[idx(x, z)] = rise;
  }
  // fields and woods as the colour of the ground. The woods are those of the steps before: a closed wood shows
  // whole, and out of the woods a block is a tree's as often as the finest step's lone trees darken the land.
  // Trees no longer stand out of this ground, but the camera still looks at them from low down and sees their
  // shaded sides before the land behind them: the blocks behind a wood take the colour of its sides as far as a
  // tree's height reaches over them (STANDS_OVER).
  if (blended) {
    const over = STANDS_OVER[step] ?? 0, reach = Math.min(1, over / wider), tops = new Float32Array(N * N * 3), sides = new Float32Array(N * N * 3), wood = new Float32Array(N * N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (!free(x, z) || g.mat[idx(x, z)] !== Mat.Grass) continue;
      const w = o.woods(x, z);
      if (!w) continue;
      const wx = x + ox, wz = z + oz, lot = hash2(wx, wz, 74);
      const tall = w.conifers === undefined ? w.tall : lot < w.conifers, crowns = w.conifers === undefined ? w.crowns : tall ? CYPRESS : LEAVES;
      // a lone tree darkens its crown's ground and what its side hides
      const lone = (STRAY * (1 + over / TREE_PITCH) * LONE_SEEN + TREES_CLOSED * w.share * (1 + over / EDGE_SEEN)) * (tall ? (CROWN_TALL / CROWN) ** 2 : 1);
      // while a block is smaller than a wood it is a wood's or a tree's or not; a larger one holds woods and open
      // land both and is wooded as far as they cover it, a little more or less from block to block
      const some = Math.min(1, lone * BLEND_SEEN), grown = step < WOODS_BLEND ? (w.share > 0.5 || hash2(wx, wz, 73 + step) < lone ? 1 : 0) : some + (soft(some, hash2(wx, wz, 73 + step)) - some) * (w.laid ? LAID_CHANCE : 1);
      if (grown <= 0) continue;
      const crown = pick(crowns, lot), seen = crowns === LEAVES ? SEEN_LEAVES : crowns === CYPRESS ? SEEN_CONIFERS : null;
      wood[idx(x, z)] = grown;
      tops.set(tinted(seen ? tinted(crown, seen.top) : shade(crown, CANOPY_LIGHT), FLAT_WOODS), idx(x, z) * 3);
      sides.set(shade(seen ? tinted(crown, seen.side) : shade(crown, 0.7), SIDE_FLAT), idx(x, z) * 3);
    }
    /** the wood before a block, towards the camera: how much of the block its sides hide, and their colour */
    const before = (x: number, z: number): [number, RGB] => {
      let hid = 0; const col: [number, number, number] = [0, 0, 0];
      if (reach > 0) for (const [dx, dz, share] of [[1, 1, 0.5], [1, 0, 0.25], [0, 1, 0.25]] as const) {
        const j = inGrid(x + dx, z + dz) ? idx(x + dx, z + dz) : -1;
        if (j < 0 || !wood[j]) continue;
        hid += share * wood[j]; for (let k = 0; k < 3; k++) col[k] += share * wood[j] * sides[j * 3 + k];
      }
      return hid > 0 ? [hid * reach, [col[0] / hid, col[1] / hid, col[2] / hid]] : [0, col];
    };
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (!free(x, z)) continue;
      const wx = x + ox, wz = z + oz, i = idx(x, z);
      // of the ploughed ground one course is the fallow, the grass with its stubble showing through, of three courses
      // one the green spring corn, and the rest the winter corn
      const ploughed = o.ploughed(x + 0.5, z + 0.5), n = courses(x + 0.5, z + 0.5), idle = n >= 2 ? ploughed / n : 0, green = n >= 3 ? ploughed / n : 0, sown = ploughed - idle - green;
      const tilled = sown + (soft(sown, hash2(wx, wz, 65 + step)) - sown) * (o.laid ? LAID_CHANCE : 1), bare = idle * FALLOW_SHOWS, fields = Math.min(1, tilled + green + bare);
      // the fields lie where they lie first, the woods on the rest (in a block larger than both they lie apart, as
      // in the landscape), and the sides of the wood in front before both
      const [hid, side] = before(x, z), grown = step < WOODS_BLEND ? wood[i] * (1 - fields) : Math.min(wood[i], 1 - fields), lies = fields + grown, share = hid + (1 - hid) * lies;
      if (share <= 0) continue;
      const corn = mix(cropOf(wx, wz, x + 0.5, z + 0.5)[0], springOf(wx, wz)[0], tilled + green > 0 ? green / (tilled + green) : 0);
      const crop = mix(corn, SOIL_FALLOW, fields > 0 ? bare / fields : 0), crown: RGB = [tops[i * 3], tops[i * 3 + 1], tops[i * 3 + 2]];
      put(x, z, 0, lies > 0 ? mix(mix(crop, crown, grown / lies), side, hid / share) : side, undefined, 10);
      c.share[i] = Math.min(1, share);
    }
  }
  // the ground is raised only now, so that what was laid out saw the land as it is
  for (let i = 0; i < N * N; i++) {
    if (raised[i]) c.rise[i] = raised[i];
    if (c.rise[i]) { g.h[i] += c.rise[i]; g.occ[i] = Math.max(g.occ[i], g.h[i]); }
  }
  last = c;
  return c;
}
