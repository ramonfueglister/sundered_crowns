// The settled land on the world's ground: the towns and villages of the gazetteer at their real sites, sized by
// their inhabitants and built in the tradition of their land (buildings/traditions), the monuments that have a model, and fields
// where the land was under the plough. No house stands alone: the people of the land live in its villages.
import * as THREE from 'three/webgpu';
import { Batch, type RGB, type Rnd, hash2, seeded } from '../lookprobe/batch';
import { crops } from '../lookprobe/blocks';
import { type Model, type Side, type Style, heightOf, houseOf, m, m2, styleOf, tower, townWall } from '../buildings';
import { type Crop, type Ground, Mat, N, type P2, idx, inGrid, occlude } from '../lookprobe/layout';
import type { Town } from '../figures';

/** A place of the gazetteer on the ground. */
export interface Site { /** the same in every ground the place falls on */ id: number; at: P2; /** 1 village … 5 great city */ size: number; /** inhabitants in 1356, where an estimate exists */ pop: number | null; /** the region it builds as (buildings/traditions/regions.ts) */ region: string; style: Style }
/** A monument on the ground: one building of it. */
export interface Monument { id: number; at: P2; model: Model }
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
  /** 1 where something stands or grows, 2 on the paved ground of the walled towns, 3 on the open ground between the houses of a village */
  used: Uint8Array;
  /** 1 on the paved ground of the walled towns */
  town: Uint8Array;
  /** what each column of a field carries: 0 no field, 1 winter corn, 2 vine, 3 nothing this year (the fallow), 4 spring corn */
  field: Uint8Array;
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
 * A field lies on level ground: it takes the free ground of its lot that stands within this many steps of the
 * height most of it has, and levels it to that height (in hill country the fields so stand in terraces). Water,
 * rock, what is built and steeper ground bear no field: there the fields fall short of the land under the plough.
 */
const FIELD_STEPS = 2;
/** a field is laid where at least this share of its lot's ground is free for it */
const FIELD_LEAST = 1 / 3;
/**
 * The share of the ground that is ploughed where field lies by field: no land holds more. The layer of the field
 * land is made with it (tools/worldprobe/build_fieldland.py GROUND): make the layer again when it changes.
 */
export const FIELD_GROUND = LOT_FILL;
/**
 * A village's houses stand close about its church, house by house outwards from its middle with a lane's width
 * between them. They so reach about this many blocks from it: two and this much for every root of a person (a
 * house with its lane takes some sixteen blocks and holds eight persons).
 */
export const VILLAGE_REACH = 0.8;
/** a village's houses stand no farther than this from its middle (the margin of a piece holds it) */
const VILLAGE_FAR = 60;
/** a village is no round disc: it reaches up to this much farther one way than the other, and has a bulge or two */
const VILLAGE_LONG = 0.3, VILLAGE_BULGE = 0.12;
/**
 * The columns round a village's middle in the order its houses are built on them: outwards from the middle, as far
 * as `far`, in the village's own shape (drawn from `r`).
 */
function outwards(r: Rnd, far: number): P2[] {
  const turn = r.range(0, Math.PI), bulge = r.range(0, Math.PI * 2), all: [number, number, number][] = [];
  for (let dz = -far; dz <= far; dz++) for (let dx = -far; dx <= far; dx++) {
    const a = Math.atan2(dz, dx), q = Math.hypot(dx, dz) * (1 + VILLAGE_LONG * Math.cos(2 * (a - turn)) + VILLAGE_BULGE * Math.cos(3 * (a - bulge)));
    if (q <= far) all.push([dx, dz, q]);
  }
  return all.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]).map(([dx, dz]) => [dx, dz]);
}
/** the ground of a village is levelled to that of its middle where it differs by no more than this many steps */
const VILLAGE_STEPS = 2;
/**
 * A village is built for at most this many persons: as many as its ground can hold inside the margin of a piece.
 * The gazetteer has few villages where little is written down (Africa south of the Sahara): there the people of
 * the land round a village are more than that, and those above it have no house in the picture.
 */
export const VILLAGE_MOST = 2500;
/** a village of this many persons has a church (a small town always has) */
export const CHURCH_FROM = 40;
const CROPS: readonly (Crop | null)[] = [null, 'wheat', 'vine', null, 'oats'];
/** a field that lies fallow this year, and one under spring corn */
export const FALLOW = 3, SPRING = 4;
/**
 * What a field of land tilled in `courses` carries this year, by its lot `u` (0 … 1): of two courses one is the
 * fallow, of three one the fallow and one the spring corn; the rest is winter corn (1). One course: no rotation.
 */
export const courseOf = (courses: number, u: number): 1 | typeof FALLOW | typeof SPRING => (courses >= 2 && u < 1 / courses ? FALLOW : courses >= 3 && u < 2 / courses ? SPRING : 1);
/** Half the side of the square a walled town of `pop` inhabitants is first packed into; it grows from there until all are housed. */
export const firstHalf = (pop: number) => Math.max(6, Math.round(0.8 * Math.sqrt(pop / PEOPLE_PER_PERSON / PERSONS_PER_FLOOR_BLOCK / 2.3) / 2));
/** A footprint side drawn between two lengths in metres, whole blocks (the footprints were read off the reference image). */
const blocks = (r: Rnd, lo: number, hi: number) => r.int(Math.max(2, Math.round(m(lo))), Math.max(2, Math.round(m(hi))));

/**
 * Builds the monuments, then the sites, largest first, and lays the fields. `ploughed` is the share of the ground
 * under the plough at a ground point (0 … FIELD_GROUND), the fallow counted in, `courses` in how many courses the
 * fields there are tilled (`courseOf`), `vines` the share of the winter fields that are vineyards. Everything is laid out so that it comes out the same
 * on every ground that covers it; only what `own` holds at its middle is added to `things`, but for the houses that
 * have fine blocks for the near view: those are handed back as `lots`. The counts say how the picture stands to
 * the numbers it was built from: `asked` and `housed` are the persons the villages and towns of the piece were to
 * hold and those their houses hold, `ploughed` and `tilled` the blocks of ploughed ground the land of the piece's
 * lots asks for (on the ground no town or village is built on) and the blocks of its fields.
 */
export function settle(g: Ground, things: Batch, sites: readonly Site[], monuments: readonly Monument[], ploughed: (x: number, z: number) => number, vines: (x: number, z: number) => number, counts: Record<string, number>, own: (x: number, z: number) => boolean = () => true, courses: (x: number, z: number) => number = () => 1): Settled {
  const used = new Uint8Array(N * N), town = new Uint8Array(N * N), field = new Uint8Array(N * N), mat = new THREE.Matrix4();
  const towns: Town[] = [], lots: Lot[] = [];
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
    if (own(Math.floor(x + w / 2), Math.floor(z + d / 2))) { things.append(model, mat.makeRotationY(0).setPosition(x + w / 2, y, z + d / 2)); count(kind); }
    claim(x, z, x + w, z + d); occlude(g, x, z, x + w, z + d, y + height);
  };
  /** A house on the footprint from (x, z), if it is free, its door towards `front`; returns the persons it holds. */
  const home = (r: Rnd, x: number, z: number, w: number, d: number, floors: number, gap: number, by: Builds, front: Side = 'pz'): number => {
    const y = lot(x, z, x + w, z + d, gap);
    if (y === null) return 0;
    const { style, region } = by, wall = r.pick(style.house.walls), roof = r.pick(style.house.roofs), seed = r.int(0, 0x7fffffff);
    // a house draws from a source of its own: the place is laid out the same whatever its houses are built from
    const l: Lot = { x, z, w, d, y, floors, wall, roof, seed, front, region };
    if (own(Math.floor(x + w / 2), Math.floor(z + d / 2))) { if (style.tradition) lots.push(l); else raise(things, l, 0); count('house'); }
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
   * A monument as near its real place as it can stand: on dry ground there, else on ground made for it at the
   * water's edge, else on the nearest dry ground.
   */
  const monument = (model: Model, r: Rnd, cx: number, cz: number) => {
    for (let k = 0; k <= 3; k++) for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx += Math.abs(dz) === k ? 1 : 2 * k || 1) {
      const x = cx + dx - Math.floor(model.w / 2), z = cz + dz - Math.floor(model.d / 2), y = lot(x, z, x + model.w, z + model.d, 1) ?? madeGround(x, z, x + model.w, z + model.d);
      if (y !== null) { build(model.build(r), x, z, model.w, model.d, y, model.height, 'monument'); return; }
    }
    landmark(model, r, cx, cz, 14, 'monument');
  };

  for (const mon of monuments) monument(mon.model, seeded(500 + mon.id), Math.floor(mon.at[0]), Math.floor(mon.at[1]));

  [...sites].sort((a, b) => b.size - a.size || (b.pop ?? 0) - (a.pop ?? 0) || a.id - b.id).forEach((s) => {
    // the site itself may lie in the water or on the rock at this scale: the nearest ground that can be built on
    let cx = -1, cz = -1;
    for (let k = 0; k <= 10 && cx < 0; k++) for (let dz = -k; dz <= k && cx < 0; dz++) for (let dx = -k; dx <= k; dx++) {
      const x = Math.floor(s.at[0]) + dx, z = Math.floor(s.at[1]) + dz;
      if (Math.max(Math.abs(dx), Math.abs(dz)) === k && buildable(x, z)) { cx = x; cz = z; break; }
    }
    if (cx < 0) return;
    const pop = s.pop ?? POP_OF_SIZE[s.size], size = s.size, mine = own(cx, cz);
    const r = seeded(1000 + s.id), need = size < WALLED_FROM ? Math.min(VILLAGE_MOST, pop / PEOPLE_PER_PERSON) : pop / PEOPLE_PER_PERSON;
    let housed = 0;
    if (size < WALLED_FROM) {
      // a village or small town: its houses close about its church, on ground levelled to that of its middle
      const y = g.h[idx(cx, cz)], level = 2 + VILLAGE_REACH * Math.sqrt(need);
      for (let z = Math.floor(cz - level); z <= cz + level; z++) for (let x = Math.floor(cx - level); x <= cx + level; x++) {
        if (Math.hypot(x - cx, z - cz) > level || !buildable(x, z) || Math.abs(g.h[idx(x, z)] - y) > VILLAGE_STEPS || g.wet[idx(x + 1, z)] || g.wet[idx(x - 1, z)] || g.wet[idx(x, z + 1)] || g.wet[idx(x, z - 1)]) continue;
        g.h[idx(x, z)] = y; g.occ[idx(x, z)] = y;
      }
      if (size === 2 || need >= CHURCH_FROM) landmark(s.style.church, r, cx, cz, 8, 'church');
      // outwards from the middle, each house where the ground is free with a lane round it
      let reach = 0;
      for (const [dx, dz] of outwards(r, Math.min(VILLAGE_FAR, Math.ceil(2 * level)))) {
        if (housed >= need) break;
        if (!buildable(cx + dx, cz + dz)) continue;
        const turn = r.chance(0.5), long = blocks(r, 5.7, 7.2), short = blocks(r, 4.3, 5.7), w = turn ? short : long, d = turn ? long : short;
        const got = home(r, cx + dx - (w >> 1), cz + dz - (d >> 1), w, d, r.chance(0.5) ? 2 : 1, 1, s);
        if (got) { housed += got; reach = Math.ceil(Math.hypot(dx, dz)); }
      }
      // the ground of a village is its own: no field and no wood between its houses, nor within two columns of them
      const ground: number[] = [];
      for (let z = cz - reach - 4; z <= cz + reach + 4; z++) for (let x = cx - reach - 4; x <= cx + reach + 4; x++) {
        if (!inGrid(x, z) || used[idx(x, z)]) continue;
        let near = false;
        for (let dz = -2; dz <= 2 && !near; dz++) for (let dx = -2; dx <= 2; dx++) if (inGrid(x + dx, z + dz) && used[idx(x + dx, z + dz)] === 1) { near = true; break; }
        if (near) ground.push(idx(x, z));
      }
      for (const i of ground) used[i] = 3;
      if (mine) { count('village'); count('asked', pop / PEOPLE_PER_PERSON); count('housed', housed); }
      return;
    }
    // a walled town: its great buildings in the middle, then houses packed in a square that grows until all are housed
    landmark(size >= 4 ? s.style.great : s.style.church, r, cx, cz, 16, size >= 4 ? 'landmark' : 'church');
    for (let k = size - 3; k > 0; k--) landmark(s.style.church, r, cx + r.int(-14, 14), cz + r.int(-14, 14), 8, 'church');
    if (s.style.towers) for (let k = size - 2; k > 0; k--) landmark({ build: tower, w: 3, d: 3, height: 10 }, r, cx + r.int(-7, 7), cz + r.int(-7, 7), 5, 'tower');
    // straight streets, two blocks wide; a house stands between them
    const street = (x: number, z: number) => (x - cx + 1900) % 19 < 2 || (z - cz + 1700) % 17 < 2;
    const crosses = (x: number, z: number, w: number, d: number) => (x - cx + 1900) % 19 + w > 19 || (z - cz + 1700) % 17 + d > 17;
    /** the side of a footprint that lies on a street, the sides towards the viewer first */
    const onStreet = (x: number, z: number, w: number, d: number): Side => (street(x, z + d) ? 'pz' : street(x + w, z) ? 'px' : street(x, z - 1) ? 'nz' : street(x - 1, z) ? 'nx' : 'pz');
    let half = firstHalf(pop);
    for (; housed < need && half <= 70; half += 2) {
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
    let lo = Infinity, hi = -Infinity, carries = true;
    for (let k = -half - 1; k <= half; k++) for (const [x, z] of [[cx + k, cz - half - 1], [cx + k, cz + half], [cx - half - 1, cz + k], [cx + half, cz + k]]) {
      if (!inGrid(x, z) || g.wet[idx(x, z)] || g.mat[idx(x, z)] === Mat.Rock) { carries = false; continue; }
      lo = Math.min(lo, g.h[idx(x, z)]); hi = Math.max(hi, g.h[idx(x, z)]);
    }
    // paved as far as the houses reach: within three blocks of a building
    const built = (x: number, z: number) => { for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (inGrid(x + dx, z + dz) && used[idx(x + dx, z + dz)] === 1) return true; return false; };
    for (let z = cz - half; z < cz + half; z++) for (let x = cx - half; x < cx + half; x++) if (inGrid(x, z) && !g.wet[idx(x, z)] && g.mat[idx(x, z)] !== Mat.Rock && built(x, z)) { g.mat[idx(x, z)] = Mat.Paved; town[idx(x, z)] = 1; }
    for (let i = 0; i < N * N; i++) if (town[i]) used[i] = 2;
    if (carries && hi - lo <= 2) {
      if (own(cx, cz)) { things.append(townWall(half * 2 + 2, half * 2 + 2), mat.makeRotationY(0).setPosition(cx, lo + 1, cz)); count('wall'); }
      claim(cx - half - 2, cz - half - 2, cx + half + 2, cz + half + 2);
    }
    towns.push({ site: s.id, cx: cx + (g.ox ?? 0), cz: cz + (g.oz ?? 0), half });
    if (mine) { count('town'); count('asked', need); count('housed', housed); }
  });

  // fields: the world is cut into lots, and of the lots as many are fields as hold the land under the plough
  const ox = g.ox ?? 0, oz = g.oz ?? 0;
  for (let lz = Math.floor(oz / LOT_D); lz * LOT_D < oz + N; lz++) for (let lx = Math.floor(ox / LOT_W) - 1; lx * LOT_W < ox + N; lx++) {
    // every other row of lots is set off by half a lot; a field fills its lot but for the balk on two sides
    const x0 = lx * LOT_W - ox + (lz & 1 ? Math.floor(LOT_W / 2) : 0) + 1, z0 = lz * LOT_D - oz + 1, w = LOT_W - 1, d = LOT_D - 1;
    const mx = x0 + w / 2, mz = z0 + d / 2;
    if (mx < 0 || mz < 0 || mx >= N || mz >= N) continue;
    const share = ploughed(mx, mz), mine = own(Math.floor(mx), Math.floor(mz));
    if (share <= 0 || x0 < 2 || z0 < 2 || x0 + w > N - 2 || z0 + d > N - 2) continue;
    // the land asks for its share of the lot's ground that no town or village is built on (the layer of the field land counts so)
    if (mine) { let open = 0; for (let z = z0 - 1; z < z0 + d; z++) for (let x = x0 - 1; x < x0 + w; x++) if (!used[idx(x, z)]) open++; count('ploughed', share * open); }
    if (hash2(lx, lz, 65) > share / FIELD_GROUND) continue;
    // the free ground of the lot, clear of the water, and the height most of it has (of two as common, the higher)
    const free: number[] = [], heights = new Map<number, number>();
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) {
      if (!buildable(x, z) || g.wet[idx(x + 1, z)] || g.wet[idx(x - 1, z)] || g.wet[idx(x, z + 1)] || g.wet[idx(x, z - 1)]) continue;
      free.push(idx(x, z)); heights.set(g.h[idx(x, z)], (heights.get(g.h[idx(x, z)]) ?? 0) + 1);
    }
    if (!free.length) continue;
    const y = [...heights].reduce((a, b) => (b[1] > a[1] || (b[1] === a[1] && b[0] > a[0]) ? b : a))[0], ground = free.filter((i) => Math.abs(g.h[i] - y) <= FIELD_STEPS);
    if (ground.length < FIELD_LEAST * w * d) continue;
    const course = courseOf(courses(mx, mz), hash2(lx, lz, 66)), kind = course === 1 && hash2(lx, lz, 67) < vines(mx, mz) ? 2 : course, r = seeded(Math.floor(hash2(lx, lz, 68) * 4294967296));
    for (const i of ground) { field[i] = kind; g.mat[i] = Mat.Soil; g.h[i] = y; g.occ[i] = y; used[i] = 1; }
    if (mine) { if (CROPS[kind]) crops(things, g, [mx, mz], w, d, CROPS[kind]!, r, (x, z) => field[idx(Math.floor(x), Math.floor(z))] === kind); count('field'); count('tilled', ground.length); if (kind >= FALLOW) count(kind === FALLOW ? 'fallow' : 'spring'); }
  }
  return { used, town, field, towns, lots };
}
