// The settled land of 1356 on the world's ground: the towns and villages of the gazetteer at their real sites, sized by
// their inhabitants and built in the tradition of their land (buildings/traditions), the monuments that have a model, and fields
// where the land was under the plough.
import * as THREE from 'three/webgpu';
import { Batch, type RGB, type Rnd, hash2, seeded } from '../lookprobe/batch';
import { crops } from '../lookprobe/blocks';
import { type Model, type Side, type Style, heightOf, houseOf, m, m2, styleOf, tower, townWall, type WallGap } from '../buildings';
import { type Crop, type Ground, Mat, N, type P2, idx, inGrid, occlude } from '../lookprobe/layout';
import type { Town } from '../figures';
import { FINER } from './land';
import type { FieldShown, Parcels } from './lots';
import { CROP } from '../sim/settlement/fields';
import { seasonCode, sow, sowingOf } from './season_codes';
import { marketOf, streetsOf, worshipOf } from './town_spots';
import { onWall, townWorks } from './town_wall';

/** A place of the gazetteer on the ground. */
export interface Site { /** the same in every ground the place falls on */ id: number; at: P2; /** 1 village … 5 great city */ size: number; /** inhabitants in 1356, where an estimate exists */ pop: number | null; /** the region it builds as (buildings/traditions/regions.ts) */ region: string; style: Style; /** a hamlet of a town's farming families before its walls (hamlets.ts): houses close together, no church */ hamlet?: boolean; /** the parcels of its families in the land register (lots.ts): a house stands on each, at its street */ lots?: Parcels; /** its landmarks in the land register (landmarks.ts): each at its middle, `x` metres east and `z` south of the town's centre; with them the town has no church of the graphic's own */ marks?: readonly Mark[] }
/** A landmark of the register as it is built: its middle (metres from the town's centre), its model of w × d blocks, and what it is counted as. */
export interface Mark { x: number; z: number; model: Model; kind: string; /** a house of worship: where the persons of the town go on a day of rest (src/worldprobe/town_spots.ts) */ worship?: boolean }

/**
 * Asked for every town once its great buildings stand and before its houses: `free` tells whether a block `dx` east
 * and `dz` south of the town's middle can carry a house (dry, no rock, level with its neighbours, nothing built).
 * The simulation's land register lays its parcels by it (tools/worldprobe/build_ground.ts).
 */
/**
 * What the finest step builds, told as it is built: the far steps draw the same places from it
 * (tools/worldprobe/build_plan.ts). Only what the ground owns at its middle is told. Blocks of the ground.
 */
export interface Told {
  /** a house: its lot, what it belongs to, its height in blocks */
  house(l: Lot, kind: 'town' | 'village' | 'hamlet' | 'farm', height: number): void;
  /** a great building: the footprint from (x, z), its height, what it is, the place it belongs to (-1 a monument) */
  great(kind: string, x: number, z: number, w: number, d: number, y: number, height: number, site: number): void;
  /** a walled town: its middle, half the side of its paved square, the openings of its wall or null without a wall */
  town(site: number, cx: number, cz: number, half: number, y: number, wall: readonly WallGap[] | null): void;
  /** once all is built: whether a column of the ground is dry and no rock */
  dry?(at: (x: number, z: number) => boolean): void;
  /** once all is built: whether a column of the ground is a river's water (not a lake's or the sea's), for the bridges of the land register (world.ts) */
  river?(at: (x: number, z: number) => boolean): void;
  /** once the towns and hamlets stand, before the fields: whether a furlong can lie on the field lot (`lx`, `lz`) of
   *  the grid (dry ground without rock, nothing built, level to within two blocks, with a balk round it), for the
   *  simulation's fields (tools/worldprobe/build_tilth.ts; world.ts adds that no woods stand there, and gives the world
   *  block of a town's centre at the finest step and the courses its land is tilled in, for the towns on this ground) */
  room?(fits: (lx: number, lz: number) => boolean, towns?: { centre(site: number): [number, number] | null; courses(site: number): number | null }): void;
}
export type Survey = (s: Site, free: (dx: number, dz: number) => boolean) => void;
/** A monument on the ground: one building of it. */
export interface Monument { id: number; at: P2; model: Model; /** stands at its spot on ground levelled for it (a landmark of the register) */ level?: boolean }
/**
 * A house on its lot: all that is needed to build it, so that the near view can build the houses that have fine
 * blocks again from them (fine.ts). `x`, `z` is the corner of its footprint on the ground, `y` the height it stands at.
 */
export interface Lot { x: number; z: number; w: number; d: number; y: number; floors: number; wall: RGB; roof: RGB; seed: number; front: Side; region: string }
/** Builds the house of a lot into a batch: as the far view shows it (0), or from its fine blocks for the near view (1). */
export function raise(into: Batch, l: Lot, detail: 0 | 1) {
  const { model } = houseOf(styleOf(l.region), l.w, l.d, l.floors, l.wall, l.roof, seeded(l.seed), detail, l.front);
  into.append(model, new THREE.Matrix4().setPosition(l.x + l.w / 2, l.y, l.z + l.d / 2));
}
/** How a house is built: the region's style, and the region itself by name. */
export interface Builds { region: string; style: Style }
export interface Settled {
  /** 1 where something stands or grows */
  used: Uint8Array;
  /** 1 on the paved ground of the walled towns */
  town: Uint8Array;
  /** what each column of a field carries: 0 no field, 1 winter corn, 2 vine, 3 nothing this year (the fallow), 4 spring corn */
  field: Uint8Array;
  /** the code of each column of a field and its own number (season_codes.ts `sow`, of the north's farming year), two bytes to a column */ season: Uint8Array;
  /** the walled towns as they were laid out, in world blocks */
  towns: Town[];
  /** the houses of this piece that have fine blocks: they are not among the `things`, but for the caller to draw */
  lots: Lot[];
}

/** The world has a hundredth of the people of the real world of its time (src/sim/scale.ts): a town of 20,000 is built for 200 persons. */
export const PEOPLE_PER_PERSON = 100;
/** A household of five on every storey of 33 m² (sixteen blocks of the reference image), per block of floor. */
export const PERSONS_PER_FLOOR_BLOCK = 5 / m2(33);
/** Inhabitants taken for the places the gazetteer gives no estimate for: a village, a small town. An assumption. */
export const POP_OF_SIZE = [0, 500, 2000];
/** towns from this size on are walled and paved */
export const WALLED_FROM = 3;
/** a field lot with its balk, in blocks */
const LOT_W = 11, LOT_D = 8;
/** blocks of the finest step a field lot takes with its balk */
export const LOT_BLOCKS = LOT_W * LOT_D;
/** the share of a lot's ground that is its field: all of it but a balk a block wide on two sides */
export const LOT_FILL = ((LOT_W - 1) * (LOT_D - 1)) / LOT_BLOCKS;
/**
 * Of the lots tried for a field at the finest step about this share finds level, free, dry ground in the low
 * country (measured, 16 November 2026: 0.78 in Flanders, 0.82 in Brie, 0.85 round Kraków, 0.87 in the English
 * Midlands). In hill country only a half does (Tuscany, the Swiss Mittelland): there the fields fall short of the
 * land under the plough.
 */
export const FIELDS_FOUND = 0.85;
/** the share of the ground that is ploughed where field lies by field: no land holds more */
export const FIELD_GROUND = LOT_FILL * FIELDS_FOUND;
/** the farmhouses stand together, this many at the end of a field: a hamlet, and the fields between the hamlets are open */
export const HAMLET = 2;
/**
 * The farmhouses to a field where the simulation counts no people on the land (beyond the game map, a start year
 * without the layer of rural.ts; elsewhere see `farmsFor`): four to ten fields. An assumption: the places of the
 * gazetteer are a few of the villages there were, and the farms stand in for the rest.
 */
export const FARMS = Math.min(1, LOT_BLOCKS / 55 / FINER ** 2);
/** a farmhouse holds some ten persons: the people of the real world of the time they were derived from */
export const PEOPLE_PER_FARM = 10 * PEOPLE_PER_PERSON;
/**
 * The farmhouses to a field where `people` of the real world of the time live on a km² of the land outside its towns
 * (the simulation's own count, rural.ts): as many as hold the world's persons derived from them, on the fields the
 * land has. `lotKm2` is the ground a lot takes, `fields` the share of the land's lots that are fields. No more than
 * a hamlet stands on a field: where more people live than that holds, the farmhouses fall short of them; where
 * people live and nothing is ploughed, none stand.
 */
export const farmsFor = (people: number, lotKm2: number, fields: number) => (fields > 0 ? Math.min(HAMLET, (people * lotKm2) / PEOPLE_PER_FARM / fields) : 0);
/** a hamlet's houses stand no farther than this from its middle */
const HAMLET_FAR = 14;
/** a hamlet is no round disc: it reaches up to this much farther one way than the other, and has a bulge */
const HAMLET_LONG = 0.3, HAMLET_BULGE = 0.12;
/** the ground of a hamlet is levelled to that of its middle where it differs by no more than this many steps */
const HAMLET_STEPS = 2;
/**
 * The columns round a hamlet's middle in the order its houses are built on them: outwards from the middle, as far
 * as `far`, in the hamlet's own shape (drawn from `r`). Building outwards packs the houses to half the ground a
 * random scatter takes.
 */
function outwards(r: Rnd, far: number): P2[] {
  const turn = r.range(0, Math.PI), bulge = r.range(0, Math.PI * 2), all: [number, number, number][] = [];
  for (let dz = -far; dz <= far; dz++) for (let dx = -far; dx <= far; dx++) {
    const a = Math.atan2(dz, dx), q = Math.hypot(dx, dz) * (1 + HAMLET_LONG * Math.cos(2 * (a - turn)) + HAMLET_BULGE * Math.cos(3 * (a - bulge)));
    if (q <= far) all.push([dx, dz, q]);
  }
  return all.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]).map(([dx, dz]) => [dx, dz]);
}
const CROPS: readonly (Crop | null)[] = [null, 'wheat', 'vine', 'wheat', 'oats']; // the fallow's sheaves are the winter corn's, kept down by the stage while it lies fallow (season_codes.ts)
/** a field that lies fallow this year, and one under spring corn */
export const FALLOW = 3, SPRING = 4;
/**
 * What a field of land tilled in `courses` carries this year, by its lot `u` (0 … 1): of two courses one is the
 * fallow, of three one the fallow and one the spring corn; the rest is winter corn (1). One course: no rotation.
 */
export const courseOf = (courses: number, u: number): 1 | typeof FALLOW | typeof SPRING => (courses >= 2 && u < 1 / courses ? FALLOW : courses >= 3 && u < 2 / courses ? SPRING : 1);
/**
 * The fields lie in blocks of one course: a block is this many lots wide and deep, and all its fields carry the same
 * this year, as the furlongs of an open field did. Gives the block a point of the world lies in, in finest blocks.
 */
export const BLOCK_LOTS_W = 3, BLOCK_LOTS_D = 2;
export const blockOf = (wx: number, wz: number): [number, number] => [Math.floor(wx / (BLOCK_LOTS_W * LOT_W)), Math.floor(wz / (BLOCK_LOTS_D * LOT_D))];
/** Half the side of the square a walled town of `pop` inhabitants is first packed into; it grows from there until all are housed. */
export const firstHalf = (pop: number) => Math.max(6, Math.round(0.8 * Math.sqrt(pop / PEOPLE_PER_PERSON / PERSONS_PER_FLOOR_BLOCK / 2.3) / 2));
/** A footprint side drawn between two lengths in metres, whole blocks (the footprints were read off the reference image). */
const blocks = (r: Rnd, lo: number, hi: number) => r.int(Math.max(2, Math.round(m(lo))), Math.max(2, Math.round(m(hi))));

/**
 * Builds the monuments, then the sites, largest first, and lays the fields. `ploughed` is the share of the ground
 * under the plough at a ground point (0 … FIELD_GROUND), the fallow counted in, `courses` in how many courses the
 * fields there are tilled (`courseOf`), `vines` the share of the winter fields that are vineyards, `farm` how the farmhouses there
 * are built, `farms` the farmhouses to a field. Everything is laid out so that it comes out the same
 * on every ground that covers it; only what `own` holds at its middle is added to `things`, but for the houses that
 * have fine blocks for the near view: those are handed back as `lots`.
 */
export function settle(g: Ground, things: Batch, sites: readonly Site[], monuments: readonly Monument[], farm: (x: number, z: number) => Builds, ploughed: (x: number, z: number) => number, vines: (x: number, z: number) => number, counts: Record<string, number>, own: (x: number, z: number) => boolean = () => true, farms: (x: number, z: number) => number = () => FARMS, courses: (x: number, z: number) => number = () => 1, survey?: Survey, told?: Told, fieldOf?: (lx: number, lz: number) => FieldShown | undefined): Settled {
  const used = new Uint8Array(N * N), town = new Uint8Array(N * N), field = new Uint8Array(N * N), season = new Uint8Array(N * N * 2), mat = new THREE.Matrix4();
  const towns: Town[] = [], lots: Lot[] = [], onRing: number[] = [];
  /** the place that is being built, and what its houses are */
  let now = -1, kind: 'town' | 'village' | 'hamlet' | 'farm' = 'farm';
  const count = (k: string, n = 1) => { counts[k] = (counts[k] ?? 0) + n; };
  const buildable = (x: number, z: number) => x >= 2 && z >= 2 && x < N - 2 && z < N - 2 && !g.wet[idx(x, z)] && !used[idx(x, z)] && g.mat[idx(x, z)] !== Mat.Rock;
  /** The height to build at on a footprint, if it is free with `gap` columns round it and level to within a step. */
  const lot = (x0: number, z0: number, x1: number, z1: number, gap: number, steps = 1): number | null => {
    let lo = Infinity, hi = -Infinity;
    for (let z = Math.floor(z0) - gap; z < Math.ceil(z1) + gap; z++) for (let x = Math.floor(x0) - gap; x < Math.ceil(x1) + gap; x++) {
      if (!buildable(x, z)) return null;
      if (x >= x0 && x < x1 && z >= z0 && z < z1) { lo = Math.min(lo, g.h[idx(x, z)]); hi = Math.max(hi, g.h[idx(x, z)]); }
    }
    return hi - lo <= steps ? hi : null;
  };
  const claim = (x0: number, z0: number, x1: number, z1: number) => { for (let z = Math.floor(z0); z < Math.ceil(z1); z++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) if (inGrid(x, z)) used[idx(x, z)] = 1; };
  /** Stands a model of w × d on the footprint from (x, z). */
  const build = (model: Batch, x: number, z: number, w: number, d: number, y: number, height: number, kind: string) => {
    if (own(Math.floor(x + w / 2), Math.floor(z + d / 2))) { things.append(model, mat.makeRotationY(0).setPosition(x + w / 2, y, z + d / 2)); count(kind); told?.great(kind, x, z, w, d, y, height, now); }
    claim(x, z, x + w, z + d); occlude(g, x, z, x + w, z + d, y + height);
  };
  /** A house on the footprint from (x, z), if it is free, its door towards `front`; returns the persons it holds. */
  const home = (r: Rnd, x: number, z: number, w: number, d: number, floors: number, gap: number, by: Builds, front: Side = 'pz'): number => {
    const y = lot(x, z, x + w, z + d, gap);
    if (y === null) return 0;
    const { style, region } = by, wall = r.pick(style.house.walls), roof = r.pick(style.house.roofs), seed = r.int(0, 0x7fffffff);
    // a house draws from a source of its own: the place is laid out the same whatever its houses are built from
    const l: Lot = { x, z, w, d, y, floors, wall, roof, seed, front, region };
    if (own(Math.floor(x + w / 2), Math.floor(z + d / 2))) { if (style.tradition) lots.push(l); else raise(things, l, 0); count('house'); told?.house(l, kind, heightOf(style, w, d, floors)); }
    claim(x, z, x + w, z + d); occlude(g, x, z, x + w, z + d, y + heightOf(style, w, d, floors));
    return w * d * floors * PERSONS_PER_FLOOR_BLOCK;
  };
  /** A great building as near a point as it finds room, within `reach` blocks. */
  const landmark = (model: Model, r: Rnd, cx: number, cz: number, reach: number, kind: string) => {
    for (let k = 0; k <= reach; k++) for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx += Math.abs(dz) === k ? 1 : 2 * k || 1) {
      const x = cx + dx - Math.floor(model.w / 2), z = cz + dz - Math.floor(model.d / 2), y = lot(x, z, x + model.w, z + model.d, 1);
      if (y !== null) { build(model.build(r), x, z, model.w, model.d, y, model.height, kind); return; }
    }
    // no level, dry, free ground within reach: the model is left out, and the count says so
    if (own(cx, cz)) count(`${kind} dropped`);
  };
  /**
   * The height of ground made for a footprint that stands partly in water, as Venice's was: the footprint and the
   * column round it are free, the dry ground under and beside it is at least a quarter of the footprint and level to
   * within a step, and the rest becomes paved ground at that height. Null where that cannot be.
   */
  const madeGround = (x0: number, z0: number, x1: number, z1: number): number | null => {
    let lo = Infinity, hi = -Infinity, dry = 0;
    for (let z = z0 - 1; z <= z1; z++) for (let x = x0 - 1; x <= x1; x++) {
      if (x < 2 || z < 2 || x >= N - 2 || z >= N - 2 || used[idx(x, z)] || g.mat[idx(x, z)] === Mat.Rock) return null;
      if (!g.wet[idx(x, z)]) { dry++; lo = Math.min(lo, g.h[idx(x, z)]); hi = Math.max(hi, g.h[idx(x, z)]); }
    }
    if (dry * 4 < (x1 - x0) * (z1 - z0) || hi - lo > 1) return null;
    for (let z = z0 - 1; z <= z1; z++) for (let x = x0 - 1; x <= x1; x++) { const i = idx(x, z); if (g.wet[i]) { g.wet[i] = 0; g.h[i] = hi; g.mat[i] = Mat.Paved; g.occ[i] = hi; } }
    return hi;
  };
  /**
   * A landmark of the register on its own ground: the footprint from (x0, z0) is levelled to the highest of its dry
   * columns and made dry where it is not (the register gave the landmark this ground: OWN RULE, as a hamlet's ground
   * is levelled), and the model stands on it.
   */
  const stand = (model: Model, r: Rnd, x0: number, z0: number, kind: string) => {
    const x1 = x0 + model.w, z1 = z0 + model.d;
    let hi = -Infinity, any = false;
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (inGrid(x, z) && !g.wet[idx(x, z)]) { hi = Math.max(hi, g.h[idx(x, z)]); any = true; }
    if (!any) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (inGrid(x, z)) hi = Math.max(hi, g.h[idx(x, z)]);
    if (!Number.isFinite(hi)) return;
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (inGrid(x, z)) { const i = idx(x, z); g.wet[i] = 0; g.h[i] = hi; g.occ[i] = hi; if (g.mat[i] === Mat.Rock) g.mat[i] = Mat.Paved; }
    build(model.build(r), x0, z0, model.w, model.d, hi, model.height, kind);
  };
  /** the landmarks of a town of the register, each at its place */
  const marks = (s: Site, r: Rnd, cx: number, cz: number) => { for (const k of s.marks ?? []) stand(k.model, r, cx + Math.round(m(k.x) - k.model.w / 2), cz + Math.round(m(k.z) - k.model.d / 2), k.kind); };
  /**
   * A monument as near its real place as it can stand: on dry ground there, else on ground made for it at the
   * water's edge, else on the nearest dry ground.
   */
  const monument = (model: Model, r: Rnd, cx: number, cz: number, level = false) => {
    if (level) { stand(model, r, cx - Math.floor(model.w / 2), cz - Math.floor(model.d / 2), 'monument'); return; }
    for (let k = 0; k <= 3; k++) for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx += Math.abs(dz) === k ? 1 : 2 * k || 1) {
      const x = cx + dx - Math.floor(model.w / 2), z = cz + dz - Math.floor(model.d / 2), y = lot(x, z, x + model.w, z + model.d, 1) ?? madeGround(x, z, x + model.w, z + model.d);
      if (y !== null) { build(model.build(r), x, z, model.w, model.d, y, model.height, 'monument'); return; }
    }
    landmark(model, r, cx, cz, 14, 'monument');
  };

  /**
   * The houses of a town on the parcels of its families: one to a parcel, as wide as the parcel and at its street
   * side, the yard behind it left open. Neighbours stand wall to wall, as the houses of a medieval street did.
   * Returns how far the houses reach from the middle, in blocks; a parcel whose ground is taken, wet or steep gets
   * no house, and the count says so.
   */
  /** the persons the houses of the last place built on parcels hold */
  let housedOnParcels = 0;
  const onParcels = (s: Site, r: Rnd, cx: number, cz: number, tall: boolean, what = 'parcel'): number => {
    const L = s.lots!, mine = own(cx, cz);
    let reach = 0;
    housedOnParcels = 0;
    for (let k = 0; k < L.x.length; k++) {
      const side = L.front[k], across = side === 0 || side === 2, along = across ? L.x[k] : L.z[k], into = across ? L.z[k] : L.x[k];
      // the edges of neighbouring parcels round to the same block, so that their houses neither overlap nor gape
      const a0 = Math.round(m(along - L.w / 2)), a1 = Math.max(a0 + 2, Math.round(m(along + L.w / 2))), b0 = Math.round(m(into - L.d / 2)), b1 = Math.max(b0 + 2, Math.round(m(into + L.d / 2)));
      // a town house fills the width of its parcel; a farmhouse is small and stands in the middle of its farmstead's street side
      const farm = what === 'farmstead', wide = farm ? Math.min(a1 - a0, r.int(3, 4)) : a1 - a0, a = a0 + ((a1 - a0 - wide) >> 1);
      const deep = Math.min(b1 - b0, farm ? 3 : r.int(3, 5)), b = side === 0 || side === 3 ? b0 : b1 - deep, floors = farm ? (r.chance(0.3) ? 2 : 1) : tall ? (r.chance(0.35) ? 3 : 2) : r.chance(0.5) ? 2 : 1;
      const x = cx + (across ? a : b), z = cz + (across ? b : a), w = across ? wide : deep, d = across ? deep : wide;
      const got = home(r, x, z, w, d, floors, 0, s, (['nz', 'px', 'pz', 'nx'] as const)[side]);
      // a house beyond the ground counts as the ground that holds it builds it, so that the town reaches as far and
      // keeps the same ground on every ground it falls on (the wall's square: no field lies within it)
      const beyond = x < 2 || z < 2 || x + w > N - 2 || z + d > N - 2;
      if (got || beyond) reach = Math.max(reach, Math.abs(x - cx), Math.abs(x + w - cx), Math.abs(z - cz), Math.abs(z + d - cz));
      if (got) housedOnParcels += got;
      else if (mine) count(`${what} without house`);
    }
    if (mine) count(what, L.x.length);
    return reach;
  };

  /**
   * The streets and the market of a town as the land register lays them (settlement feature 3): their ground is
   * paved where it is dry, no rock and no house stands on it, and nothing grows or is built on it after. The edges
   * round to blocks as those of the parcels do, so that a street reaches the houses at its side.
   */
  const onStreets = (s: Site, cx: number, cz: number, walled: boolean) => {
    const rects = streetsOf(s.lots!);
    let paved = 0;
    for (let q = 0; q < rects.length; q += 4) {
      for (let z = cz + rects[q + 1]; z < cz + rects[q + 3]; z++) for (let x = cx + rects[q]; x < cx + rects[q + 2]; x++) {
        if (!inGrid(x, z)) continue;
        const i = idx(x, z);
        if (g.wet[i] || g.mat[i] === Mat.Rock || used[i] === 1) continue;
        g.mat[i] = Mat.Paved; used[i] = 2; if (walled) town[i] = 1; paved++;
      }
    }
    if (own(cx, cz) && paved) count('street', paved);
  };

  /** whether a house can stand on a column: buildable, and within a step of the columns beside it */
  const bears = (x: number, z: number) => buildable(x, z) && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => Math.abs(g.h[idx(x + dx, z + dz)] - g.h[idx(x, z)]) <= 1);

  for (const mon of monuments) monument(mon.model, seeded(500 + mon.id), Math.floor(mon.at[0]), Math.floor(mon.at[1]), mon.level);

  /** the site itself may lie in the water or on the rock at this scale: the nearest ground that can be built on (a town
   *  on a real plan that draws its ground: its site's block, round which that ground lies, plan_ground.ts) */
  const middleOf = (s: Site): [number, number] | null => {
    if (s.lots?.ground) return [Math.floor(s.at[0]), Math.floor(s.at[1])];
    for (let k = 0; k <= 10; k++) for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx++) {
      const x = Math.floor(s.at[0]) + dx, z = Math.floor(s.at[1]) + dz;
      if (Math.max(Math.abs(dx), Math.abs(dz)) === k && buildable(x, z)) return [x, z];
    }
    return null;
  };
  // the building ground of every town for the land register, before anything the graphic builds of its own (its
  // churches, its houses where there is no register): only the water, the rock, the steps and the monuments count
  // (settlement feature 5: the register lays its landmarks itself, and a town is not cut off by the houses of its
  // neighbour)
  if (survey) for (const s of sites) { const at = middleOf(s); if (at) survey(s, (dx, dz) => bears(at[0] + dx, at[1] + dz)); }

  [...sites].sort((a, b) => b.size - a.size || (b.pop ?? 0) - (a.pop ?? 0) || a.id - b.id).forEach((s) => {
    const at = middleOf(s);
    if (!at) return;
    const [cx, cz] = at;
    const pop = s.pop ?? POP_OF_SIZE[s.size], size = s.size;
    now = s.id; kind = s.hamlet ? 'hamlet' : size < WALLED_FROM ? 'village' : 'town';
    const r = seeded(1000 + s.id), need = pop / PEOPLE_PER_PERSON;
    let housed = 0;
    if (s.hamlet) {
      // a hamlet: its houses close together on ground levelled to that of its middle, built outwards from it
      // with a land register every farmstead stands on its parcel, two rows at a lane
      const span = s.lots ? Math.max(...s.lots.x.map((x) => Math.abs(m(x)) + m(s.lots!.w)), ...s.lots.z.map((z) => Math.abs(m(z)) + m(s.lots!.d))) : 0;
      const y = g.h[idx(cx, cz)], level = s.lots ? span + 1 : 2 + 0.8 * Math.sqrt(need);
      for (let z = Math.floor(cz - level); z <= cz + level; z++) for (let x = Math.floor(cx - level); x <= cx + level; x++) {
        if ((!s.lots && Math.hypot(x - cx, z - cz) > level) || !buildable(x, z) || Math.abs(g.h[idx(x, z)] - y) > HAMLET_STEPS || g.wet[idx(x + 1, z)] || g.wet[idx(x - 1, z)] || g.wet[idx(x, z + 1)] || g.wet[idx(x, z - 1)]) continue;
        g.h[idx(x, z)] = y; g.occ[idx(x, z)] = y;
      }
      let reach = 0;
      if (s.lots) { reach = onParcels(s, r, cx, cz, false, 'farmstead'); housed = housedOnParcels; }
      else for (const [dx, dz] of outwards(r, HAMLET_FAR)) {
        if (housed >= need) break;
        if (!buildable(cx + dx, cz + dz)) continue;
        const turn = r.chance(0.5), long = blocks(r, 5.7, 7.2), short = blocks(r, 4.3, 5.7), w = turn ? short : long, d = turn ? long : short;
        const got = home(r, cx + dx - (w >> 1), cz + dz - (d >> 1), w, d, r.chance(0.4) ? 2 : 1, 1, s);
        if (got) { housed += got; reach = Math.max(reach, Math.ceil(Math.hypot(dx, dz))); if (own(cx + dx, cz + dz)) count('farm'); }
      }
      // the ground of a hamlet is its own: no field and no tree between its houses, nor within a column of them
      const ground: number[] = [];
      for (let z = cz - reach - 5; z <= cz + reach + 5; z++) for (let x = cx - reach - 5; x <= cx + reach + 5; x++) {
        if (!inGrid(x, z) || used[idx(x, z)]) continue;
        let near = false;
        for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) if (inGrid(x + dx, z + dz) && used[idx(x + dx, z + dz)] === 1) { near = true; break; }
        if (near) ground.push(idx(x, z));
      }
      for (const i of ground) used[i] = 3;
      if (own(cx, cz)) { count('hamlet'); count('asked', need); count('housed', housed); }
      return;
    }
    if (size < WALLED_FROM) {
      // a village or small town: a church in the small town, houses scattered round it
      if (s.marks) marks(s, r, cx, cz);
      else if (size === 2) landmark(s.style.church, r, cx, cz, 4, 'church');
      if (s.lots) { onParcels(s, r, cx, cz, false); onStreets(s, cx, cz, false); if (own(cx, cz)) count('village'); return; }
      const reach = 5 + 2.5 * Math.sqrt(need);
      for (let tries = 0; housed < need && tries < 400; tries++) {
        const a = r.range(0, Math.PI * 2), q = Math.sqrt(r.next()) * reach, turn = r.chance(0.5), long = blocks(r, 5.7, 7.2), short = blocks(r, 4.3, 5.7), w = turn ? short : long, d = turn ? long : short;
        housed += home(r, Math.round(cx + Math.cos(a) * q - w / 2), Math.round(cz + Math.sin(a) * q - d / 2), w, d, r.chance(0.5) ? 2 : 1, 1, s);
      }
      if (own(cx, cz)) count('village');
      return;
    }
    // a walled town: its great buildings in the middle, then houses packed in a square that grows until all are housed
    if (s.marks) marks(s, r, cx, cz);
    else {
      landmark(size >= 4 ? s.style.great : s.style.church, r, cx, cz, 16, size >= 4 ? 'landmark' : 'church');
      for (let k = size - 3; k > 0; k--) landmark(s.style.church, r, cx + r.int(-14, 14), cz + r.int(-14, 14), 8, 'church');
    }
    if (s.style.towers) for (let k = size - 2; k > 0; k--) landmark({ build: tower, w: 3, d: 3, height: 10 }, r, cx + r.int(-7, 7), cz + r.int(-7, 7), 5, 'tower');
    // straight streets, two blocks wide; a house stands between them
    const street = (x: number, z: number) => (x - cx + 1900) % 19 < 2 || (z - cz + 1700) % 17 < 2;
    const crosses = (x: number, z: number, w: number, d: number) => (x - cx + 1900) % 19 + w > 19 || (z - cz + 1700) % 17 + d > 17;
    /** the side of a footprint that lies on a street, the sides towards the viewer first */
    const onStreet = (x: number, z: number, w: number, d: number): Side => (street(x, z + d) ? 'pz' : street(x + w, z) ? 'px' : street(x, z - 1) ? 'nz' : street(x - 1, z) ? 'nx' : 'pz');
    let half = s.lots ? onParcels(s, r, cx, cz, true) + 2 : firstHalf(pop);
    if (s.lots) onStreets(s, cx, cz, true);
    for (; !s.lots && housed < need && half <= 70; half += 2) {
      for (let z = cz - half; z < cz + half && housed < need; z++) for (let x = cx - half; x < cx + half && housed < need; x++) {
        if (!inGrid(x, z) || used[idx(x, z)] || street(x, z)) continue;
        const turn = r.chance(0.5);
        for (const [long, short, floors] of [[blocks(r, 13, 20), blocks(r, 7.2, 8.6), r.chance(0.4) ? 3 : 2], [blocks(r, 7.2, 10), blocks(r, 5.7, 7.2), r.chance(0.25) ? 3 : 2], [blocks(r, 5.7, 5.7), blocks(r, 5.7, 5.7), 2]].slice(r.chance(0.35) ? 0 : 1)) {
          const w = turn ? short : long, d = turn ? long : short;
          if (x + w > cx + half || z + d > cz + half || crosses(x, z, w, d)) continue;
          const got = home(r, x, z, w, d, floors, r.chance(0.5) ? 1 : 0, s, onStreet(x, z, w, d));
          if (got) { housed += got; break; }
        }
      }
    }
    half -= 1;
    // the wall, where the ground round the town carries it; inside it the ground is paved
    let lo = Infinity, hi = -Infinity, carries = true, dry = 0;
    const gaps: WallGap[] = [];
    for (const [side, at] of [['nz', (k: number) => [cx + k, cz - half - 1]], ['pz', (k: number) => [cx + k, cz + half]], ['nx', (k: number) => [cx - half - 1, cz + k]], ['px', (k: number) => [cx + half, cz + k]]] as [WallGap['side'], (k: number) => [number, number]][]) {
      let from: number | null = null;
      for (let k = -half - 1; k <= half + 1; k++) {
        const [x, z] = at(k), water = k <= half && inGrid(x, z) && g.wet[idx(x, z)] === 1;
        // a river or the sea crosses the ring: the wall is open there, half a block beyond the water on either side
        if (water) from ??= k;
        else if (from !== null) { gaps.push({ side, from: from - 0.5, to: k + 0.5 }); from = null; }
        if (k > half || water) continue;
        // (the ring beyond the ground is as the ground that holds the town finds it: that one tells whether the wall
        // stands, and here the town keeps its square all the same)
        if (!inGrid(x, z)) { dry++; continue; }
        if (g.mat[idx(x, z)] === Mat.Rock) { carries = false; continue; }
        dry++; lo = Math.min(lo, g.h[idx(x, z)]); hi = Math.max(hi, g.h[idx(x, z)]);
      }
    }
    // a town with a third of its ring in the water has no wall
    if (dry * 3 < 2 * 8 * (half + 1)) carries = false;
    // paved as far as the houses reach: within three blocks of a building
    const built = (x: number, z: number) => { for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (inGrid(x + dx, z + dz) && used[idx(x + dx, z + dz)] === 1) return true; return false; };
    for (let z = cz - half; z < cz + half; z++) for (let x = cx - half; x < cx + half; x++) if (inGrid(x, z) && !g.wet[idx(x, z)] && g.mat[idx(x, z)] !== Mat.Rock && built(x, z)) { g.mat[idx(x, z)] = Mat.Paved; town[idx(x, z)] = 1; }
    // the paving that nothing stands on is street; the ground of a house or a great building stays its own (used 1),
    // so that no figure stands or walks in it (src/figures/crowd.ts)
    const streets: number[] = [];
    for (let i = 0; i < N * N; i++) if (town[i] && used[i] !== 1) { used[i] = 2; streets.push(i); }
    // a town of the land register has the wall the simulation lays along its ring (settlement feature 6), stepping
    // with the ground, and its bridges (feature 7); each piece of the world draws what of them lies on its ground
    const ring = s.lots?.walls;
    if (s.lots) {
      const at = (x: number, z: number): [number, number] => [Math.floor(cx + x), Math.floor(cz + z)], mine = (x: number, z: number) => inGrid(...at(x, z)) && own(...at(x, z));
      const pieces = townWorks(things, mat.makeRotationY(0).setPosition(cx, 0, cz), s.lots, 1, 1, (x, z) => (inGrid(...at(x, z)) ? g.h[idx(...at(x, z))] + 1 : null), mine, (x, z) => !g.wet[idx(...at(x, z))]);
      if (ring?.length && own(cx, cz)) count('wall');
      // nothing else stands or grows on the ring, once the fields' ground is surveyed (the survey comes before the
      // register, which lays the ring: tools/worldprobe/build_tilth.ts)
      onWall(pieces, cx, cz, (x, z) => { if (inGrid(x, z)) onRing.push(idx(x, z)); });
    }
    const walled = ring?.length ? true : carries && hi - lo <= 2;
    if (walled && !ring?.length) {
      if (own(cx, cz)) { things.append(townWall(half * 2 + 2, half * 2 + 2, gaps), mat.makeRotationY(0).setPosition(cx, lo + 1, cz)); count('wall'); }
      claim(cx - half - 2, cz - half - 2, cx + half + 2, cz + half + 2);
      // the claim takes the square within the wall too; its paving stays street, where the persons of the town walk
      // (src/figures/crowd.ts: a column is street where it is town and used is 2)
      for (const i of streets) used[i] = 2;
    }
    const wx = cx + (g.ox ?? 0), wz = cz + (g.oz ?? 0), market = s.lots ? marketOf(s.lots, wx, wz) : undefined, worship = worshipOf(s.marks, wx, wz);
    towns.push({ site: s.id, cx: wx, cz: wz, half, ...(market ? { market } : {}), ...(worship.length ? { worship } : {}) });
    if (own(cx, cz)) told?.town(s.id, cx, cz, half, g.h[idx(cx, cz)], walled ? (ring?.length ? [] : gaps) : null);
    if (own(cx, cz)) count('town');
  });

  now = -1; kind = 'farm';
  // fields: the world is cut into lots, and of the lots as many are fields as hold the land under the plough
  const ox = g.ox ?? 0, oz = g.oz ?? 0;
  /** the corner of a lot's field (balk left off on its west and north side), on this ground */
  const cornerOf = (lx: number, lz: number): [number, number] => [lx * LOT_W - ox + (lz & 1 ? Math.floor(LOT_W / 2) : 0) + 1, lz * LOT_D - oz + 1];
  told?.room?.((lx, lz) => { const [x0, z0] = cornerOf(lx, lz); return lot(x0, z0, x0 + LOT_W - 1, z0 + LOT_D - 1, 1, 2) !== null; });
  for (const i of onRing) used[i] = 1;
  for (let lz = Math.floor(oz / LOT_D); lz * LOT_D < oz + N; lz++) for (let lx = Math.floor(ox / LOT_W) - 1; lx * LOT_W < ox + N; lx++) {
    // every other row of lots is set off by half a lot; a field fills its lot but for the balk on two sides
    const [x0, z0] = cornerOf(lx, lz), w = LOT_W - 1, d = LOT_D - 1;
    const mx = x0 + w / 2, mz = z0 + d / 2;
    if (mx < 0 || mz < 0 || mx >= N || mz >= N) continue;
    if (fieldOf) {
      // with the land register's fields only its furlongs are fields: in strips of its farmsteads, the crop of its
      // course this year, as deep as the register has it (a shortened furlong ends short of its balk in the south)
      const f = fieldOf(lx, lz);
      if (!f) continue;
      const mine = own(Math.floor(mx), Math.floor(mz)), fk = f.crop === CROP.fallow ? FALLOW : f.crop === CROP.spring ? SPRING : hash2(lx, lz, 67) < vines(mx, mz) ? 2 : 1, rows = f.rows, code = seasonCode(0, fk, f.courses), u = sowingOf(lx, lz);
      let tilled = 0;
      for (let k = 0; k < f.strips; k++) {
        const a0 = x0 + Math.round((k * w) / f.strips), a1 = x0 + Math.round(((k + 1) * w) / f.strips);
        if (a1 <= a0) continue;
        for (let z = z0; z < z0 + rows; z++) for (let x = a0; x < a1; x++) { if (!buildable(x, z)) continue; const i = idx(x, z); field[i] = fk; sow(season, i, code, u); g.mat[i] = Mat.Soil; tilled++; }
        // each strip is sown by its own farmstead: its corn stands a little lighter or darker than its neighbours'
        if (mine && CROPS[fk]) crops(things, g, [(a0 + a1) / 2, z0 + rows / 2], a1 - a0, rows, CROPS[fk]!, seeded(Math.floor(hash2(lx * 16 + k, lz, 68) * 4294967296)), f.strips > 1 ? 0.84 + 0.32 * hash2(lx * 16 + k, lz, 69) : 1);
      }
      if (mine) { count('field'); count('tilled', tilled); if (fk >= FALLOW) count(fk === FALLOW ? 'fallow' : 'spring'); }
      claim(x0, z0, x0 + w, z0 + rows);
      continue;
    }
    if (hash2(lx, lz, 65) > ploughed(mx, mz) / FIELD_GROUND || lot(x0, z0, x0 + w, z0 + d, 1, 2) === null) continue;
    const mine = own(Math.floor(mx), Math.floor(mz));
    // the farmhouses the people on the land ask for stand as hamlets at the ends of as many of the fields, on their ground
    let sown = w;
    if (hash2(lx, lz, 69) < farms(mx, mz) / HAMLET) {
      const f = seeded(Math.floor(hash2(lx, lz, 70) * 4294967296));
      for (let k = 0; k < HAMLET; k++) {
        const hw = f.int(3, 4), hd = 3, floors = f.chance(0.4) ? 2 : 1;
        if (!home(f, x0 + w - hw, z0 + k * (d - hd), hw, hd, floors, 0, farm(mx, mz))) continue;
        sown = Math.min(sown, w - hw - 1);
        if (mine) count('farm');
      }
    }
    const course = courseOf(courses(mx, mz), hash2(...blockOf(mx + ox, mz + oz), 66)), kind = course === 1 && hash2(lx, lz, 67) < vines(mx, mz) ? 2 : course, r = seeded(Math.floor(hash2(lx, lz, 68) * 4294967296)), code = seasonCode(0, kind, courses(mx, mz)), u = sowingOf(lx, lz);
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + sown; x++) { const i = idx(x, z); field[i] = kind; sow(season, i, code, u); g.mat[i] = Mat.Soil; }
    if (mine) { if (CROPS[kind]) crops(things, g, [x0 + sown / 2, mz], sown, d, CROPS[kind]!, r); count('field'); count('tilled', sown * d); if (kind >= FALLOW) count(kind === FALLOW ? 'fallow' : 'spring'); }
    claim(x0, z0, x0 + w, z0 + d);
  }
  told?.dry?.((x, z) => inGrid(x, z) && !g.wet[idx(x, z)] && g.mat[idx(x, z)] !== Mat.Rock);
  return { used, town, field, season, towns, lots };
}
