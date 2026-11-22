// The land from farther away. On the coarser steps of the map a block is two, four, eight … cells wide, and what
// stands and grows on the land is no longer built house by house and tree by tree: it becomes part of the ground
// itself, as it would look if the finest world were seen from that far. At the first far step the trees and the
// sheaves of the fields are still the finest step's (trees.ts, crops.ts), then woods are a raised green ground and a
// field a flat block of its crop; up to the third far step the houses are still the finest step's houses, each under
// its own roof (houses.ts), then a town is a square of roof-coloured blocks that shrinks to a single block. The great
// buildings and the town walls stay themselves for two steps, built as small as the step makes them. What is still
// drawn as itself is built as tall as the land of its step is (zoom.ts `uprightOf`). So the world loses its detail
// step by step while everything stays where it is, as large as it is and as tall against its hills, and it is drawn
// the same way from every distance: from the second far step on woods are blocks in the colours of their crowns
// standing out of the open land and fields patches of their crops, however much land a block holds.
//
// The parts: far_lay.ts (what the laying out keeps while it runs), far_places.ts (towns, villages and the houses and
// great buildings of the finest step's plan), far_towns.ts (the plan's walled towns), far_fields.ts, far_woods.ts.
import type { Town } from '../figures';
import type { Batch, RGB } from '../lookprobe/batch';
import { type Ground, N, idx, occlude } from '../lookprobe/layout';
import { CROWD_AT, hamletGroundOn } from './crowd';
import { layFields } from './far_fields';
import { type CoverAsks, layingOf } from './far_lay';
import { layPlaces, layPlanned } from './far_places';
import { layTowns } from './far_towns';
import { layWoods } from './far_woods';
import { HOUSE_NUMBERS } from './houses';
import type { Site } from './settle';
import { marketOf, worshipOf } from './town_spots';

/** What a column carries as part of itself (GroundTraits.cover): where `has` is set, the colours of its top and sides and how far it stands above its ground. */
export interface Cover {
  /** what far.ts laid on each column (KINDS), for measuring it against the finer step */
  kind?: Uint8Array;
  /** of the mean of the finer step (mean.ts): the colour of all the camera sees of a column, tops and sides, as a flat top would have to show it */
  whole?: Float32Array;
  has: Uint8Array;
  rise: Uint8Array;
  top: Float32Array;
  side: Float32Array;
  /** how much of the column's top the cover colours, 0 … 1: the rest is the ground's own colour */
  share: Float32Array;
  /** 1 on the paved ground of the towns */
  town: Uint8Array;
  /** the trees of the finest step where they are drawn one by one (trees.ts TREES_AT): trees.ts TREE_NUMBERS to a column */
  trees?: Uint8Array;
  /** the houses of the finest step where they are drawn as houses (HOUSES_UNTIL): houses.ts HOUSE_NUMBERS numbers each */
  houses?: number[];
  /** the crop of the lot on each column where the fields are drawn sheaf by sheaf (crops.ts CROPS_AT): crops.ts WHEAT_FIELD … OATS_FIELD, 0 where no field lies */
  crops?: Uint8Array;
  /** beside `crops`, a furlong of the land register on the columns of its lot: its strips and rows (crops.ts `furlongOf`) */
  furlongs?: Uint8Array;
  /** where the figures are drawn (crowd.ts CROWD_AT): what the finest step has on the four blocks of each column, which are street and which built on */
  quarters?: Uint8Array;
  /** there too, the walled towns on the ground as the finest step lays them out, where the persons of the towns walk (`plannedTowns`) */
  towns?: Town[];
  /** what each field column carries by the season (season_codes.ts `sow`): its code and its own number, two bytes to a column, 0 where no field lies */
  season?: Uint8Array;
}
/**
 * The woods at a column: the share of the ground they cover (0 … 1), the colours of their crowns and whether the
 * trees are tall ones. `laid` says that the share is that of this very column, from the forest of the world's
 * year (forest.ts): then chance makes a block only a little more or less wooded than it says.
 */
export interface Woods {
  share: number;
  crowns: readonly RGB[];
  tall: boolean;
  laid?: boolean;
  /** where leafy trees and conifers stand mixed: the share of conifers among the trees, which the finest step draws tree by tree */
  conifers?: number;
}

// (world.ts takes it from here)
export { HOUSES_UNTIL, MODELS_UNTIL } from './far_places';

/** The share of a lot's ground that is its field at a step: of the land's lots `ploughed / lotFill` are fields. */
export const lotFill = (_step: number) => 1;

/**
 * What the finest step builds in its places (public/data/plan_<year>.json, written by tools/worldprobe/build_plan.ts):
 * per piece of `pieceBlocks` finest world blocks the houses whose middle lies in it (nine numbers each: x, z, w, d
 * in finest world blocks, floors, height in tenths of a block, wall and roof as 0xRRGGBB, kind) and the walled
 * towns (their paved ground is the square of 2 * half about (cx, cz)), and the great buildings where they stand.
 */
export interface Plan {
  pieceBlocks: number;
  /** the kinds of the houses: town, village, hamlet, farm (settle.ts `Told`) */
  houseKinds?: readonly string[];
  /** the kinds of the great buildings: church, landmark (a town's greatest), tower, monument */
  greatKinds?: readonly string[];
  pieces: Record<
    string,
    | {
        houses: readonly number[];
        /** seven numbers a great building: kind, x, z, w, d, height in tenths, site (-1 a monument) */
        greats?: readonly number[];
        towns?: readonly {
          site: number;
          cx: number;
          cz: number;
          half: number;
          /** null: the town has no wall; else where its wall is open for water (buildings/fortified/town-wall.ts) */
          wall?: readonly { side: 'nz' | 'px' | 'pz' | 'nx'; from: number; to: number }[] | null;
        }[];
      }
    | undefined
  >;
}
let plan: Plan | null = null,
  plans = new Map<string, Promise<Plan | null>>();
/** The plan of a year's places, loaded once; null where the file is not there (then the far steps lay out their places by rules of their own, as before). */
export function loadPlan(base: string, year: number): Promise<Plan | null> {
  let p = plans.get(`${base}|${year}`);
  if (!p) {
    p = fetch(`${base}data/plan_${year}.json`)
      .then(async (r) =>
        r.ok && (r.headers.get('content-type') ?? '').includes('json') ? ((await r.json()) as Plan) : null,
      )
      .catch(() => null);
    plans.set(`${base}|${year}`, p);
  }
  return p;
}
/** The plan `coverLand` lays its places by from now on (the worker sets it before it builds a far piece). */
export const usePlan = (p: Plan | null) => {
  plan = p;
};

/** what a column carries, by the number in `Cover.kind` */
export const KINDS = [
  'open',
  'house',
  'wall',
  'great',
  'fallow',
  'spring',
  'winter',
  'vines',
  'wood',
  'tall wood',
  'blend',
] as const;
/**
 * The walled towns of the plan on the ground of a piece of the first far step whose first column is the world block
 * ox, oz, as the finest step lays them out (settle.ts): in blocks of the finest step, with the market and the houses of
 * worship of the land register to which the persons of a town go by their plan of the day (town_spots.ts).
 */
function plannedTowns(p: Plan, ox: number, oz: number, sites: readonly Site[]): Town[] {
  const fine = (v: number) => Math.floor((v * 2 ** CROWD_AT) / p.pieceBlocks),
    towns: Town[] = [];
  for (let pz = fine(oz) - 1; pz <= fine(oz + N) + 1; pz++)
    for (let px = fine(ox) - 1; px <= fine(ox + N) + 1; px++)
      for (const { site, cx, cz, half } of p.pieces[`${px},${pz}`]?.towns ?? []) {
        const s = sites.find((q) => q.id === site),
          market = s?.lots ? marketOf(s.lots, cx, cz) : undefined,
          worship = worshipOf(s?.marks, cx, cz);
        towns.push({ site, cx, cz, half, ...(market ? { market } : {}), ...(worship.length ? { worship } : {}) });
      }
  return towns;
}

let last: Cover | null = null;
/** the cover `coverLand` laid out last, for measuring it (piece.worker.ts `compare`) */
export const laidOut = () => last;

/**
 * Lays towns, fields and woods on the ground of a piece at `step` (1 or coarser) and raises the ground under them.
 * `sites` are the places on the ground; `ploughed` is the share of the ground under the plough at a ground point,
 * the fallow counted in (`laid`: of that very point, the fields laid out together; else of the land about it),
 * `courses` in how many courses the fields there are tilled (settle.ts `courseOf`), `vines` the share of the winter
 * fields that are vineyards, `farm` the style of the farmhouses there, `woods` what grows on a column. Everything
 * depends on the world block alone, so that pieces laid side by side fit together; only what `own` holds at its middle
 * is added to `things`.
 */
export function coverLand(g: Ground, step: number, things: Batch, sites: readonly Site[], o: CoverAsks): Cover {
  const c: Cover = {
    has: new Uint8Array(N * N),
    rise: new Uint8Array(N * N),
    top: new Float32Array(N * N * 3),
    side: new Float32Array(N * N * 3),
    town: new Uint8Array(N * N),
    share: new Float32Array(N * N).fill(1),
    kind: new Uint8Array(N * N),
  };
  if (step === CROWD_AT) {
    c.quarters = new Uint8Array(N * N);
    if (plan) c.towns = plannedTowns(plan, g.ox ?? 0, g.oz ?? 0, sites);
  }
  const l = layingOf(g, step, things, sites, o, plan, c);
  layPlaces(l);
  layPlanned(l);
  layTowns(l);
  // the ground of a hamlet one block round its houses, after the walls, as the finest step lays it (settle.ts)
  if (c.quarters && plan) hamletGroundOn(c.quarters, l.ox, l.oz, plan, l.wider);
  layFields(l);
  layWoods(l);
  const { raised } = l;
  // the ground is raised only now, so that what was laid out saw the land as it is
  for (let i = 0; i < N * N; i++) {
    if (raised[i]) c.rise[i] = raised[i];
    if (c.rise[i]) {
      g.h[i] += c.rise[i];
      g.occ[i] = Math.max(g.occ[i], g.h[i]);
    }
  }
  // a house drawn as a house hides the sky of the ground round it up to its eaves, as at the finest step (on a 64th
  // of a block, so that a table keeps it to the bit: table_pack.ts `packTable`)
  for (let k = 0; c.houses && k < c.houses.length; k += HOUSE_NUMBERS) {
    const [x0, z0, x1, z1, eaves] = c.houses.slice(k, k + 5);
    let base = -Infinity;
    for (let z = Math.max(0, Math.floor(z0)); z < Math.min(N, Math.ceil(z1)); z++)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(N, Math.ceil(x1)); x++)
        base = Math.max(base, g.h[idx(x, z)]);
    if (base > -Infinity) occlude(g, x0, z0, x1, z1, Math.ceil((base + eaves) * 64) / 64);
  }
  last = c;
  return c;
}
