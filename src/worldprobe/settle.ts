// The settled land of 1356 on the world's ground: the towns and villages of the gazetteer at their real sites, sized by
// their inhabitants and built in the tradition of their land (buildings/traditions), the monuments that have a model, and fields
// where the land was under the plough.
import * as THREE from 'three/webgpu';
import { Batch, type Rnd, hash2, seeded } from '../lookprobe/batch';
import { crops } from '../lookprobe/blocks';
import { FLOOR, type HouseStyle, type Model, SOUTH, type Style, house, tower, townHouse, townWall } from '../buildings';
import { type Crop, type Ground, Mat, N, type P2, idx, inGrid, occlude } from '../lookprobe/layout';

/** A place of the gazetteer on the ground. */
export interface Site { /** the same in every ground the place falls on */ id: number; at: P2; /** 1 village … 5 great city */ size: number; /** inhabitants in 1356, where an estimate exists */ pop: number | null; style: Style }
/** A monument on the ground: one building of it. */
export interface Monument { id: number; at: P2; model: Model }
export interface Settled {
  /** 1 where something stands or grows */
  used: Uint8Array;
  /** 1 on the paved ground of the walled towns */
  town: Uint8Array;
  /** the crop of each column: 0 none, 1 wheat, 2 vine */
  field: Uint8Array;
}

/** The diorama holds one person for every hundred of 1356 (the scale agreed for the simulation too). */
const PEOPLE_PER_PERSON = 100;
/** A household of five on every storey of sixteen blocks. */
const PERSONS_PER_FLOOR_BLOCK = 5 / 16;
/** Inhabitants taken for the places the gazetteer gives no estimate for: a village, a small town. An assumption. */
const POP_OF_SIZE = [0, 500, 2000];
/** towns from this size on are walled and paved */
const WALLED_FROM = 3;
/** a field lot with the hedge round it, in blocks */
const LOT_W = 11, LOT_D = 8;
const CROPS: readonly (Crop | null)[] = [null, 'wheat', 'vine'];

/**
 * Builds the monuments, then the sites, largest first, and lays the fields. `cultivated` is the share of the land under the plough at a
 * ground point (0 … 1), `vines` the share of the fields there that are vineyards, `farm` the style of the farmhouses
 * there. Everything is laid out so that it comes out the same on every ground that covers it; only what `own` holds
 * at its middle is added to `things`. On a coarser map of the world a block covers `shrink` times the land, and the
 * places shrink with it.
 */
export function settle(g: Ground, things: Batch, sites: readonly Site[], monuments: readonly Monument[], farm: (x: number, z: number) => HouseStyle, cultivated: (x: number, z: number) => number, vines: (x: number, z: number) => number, counts: Record<string, number>, own: (x: number, z: number) => boolean = () => true, shrink = 1): Settled {
  const used = new Uint8Array(N * N), town = new Uint8Array(N * N), field = new Uint8Array(N * N), m = new THREE.Matrix4();
  const count = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
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
    if (own(Math.floor(x + w / 2), Math.floor(z + d / 2))) { things.append(model, m.makeRotationY(0).setPosition(x + w / 2, y, z + d / 2)); count(kind); }
    claim(x, z, x + w, z + d); occlude(g, x, z, x + w, z + d, y + height);
  };
  /** A house on the footprint from (x, z), if it is free; returns the persons it holds. */
  const home = (r: Rnd, x: number, z: number, w: number, d: number, floors: number, gap: number, style = SOUTH): number => {
    const y = lot(x, z, x + w, z + d, gap);
    if (y === null) return 0;
    const wallC = r.pick(style.walls), roofC = r.pick(style.roofs);
    const model = Math.max(w, d) >= 8 && r.chance(0.7) ? townHouse(w, d, floors, wallC, roofC, r, style) : house(w, d, floors, wallC, roofC, r, style);
    build(model, x, z, w, d, y, floors * FLOOR + 1.2 + style.maxRise, 'house');
    return w * d * floors * PERSONS_PER_FLOOR_BLOCK;
  };
  /** A great building as near a point as it finds room, within `reach` blocks. */
  const landmark = (model: Model, r: Rnd, cx: number, cz: number, reach: number, kind: string) => {
    for (let k = 0; k <= reach; k++) for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx += Math.abs(dz) === k ? 1 : 2 * k || 1) {
      const x = cx + dx - Math.floor(model.w / 2), z = cz + dz - Math.floor(model.d / 2), y = lot(x, z, x + model.w, z + model.d, 1);
      if (y !== null) { build(model.build(r), x, z, model.w, model.d, y, model.height, kind); return; }
    }
  };

  for (const mon of monuments) landmark(mon.model, seeded(500 + mon.id), Math.floor(mon.at[0]), Math.floor(mon.at[1]), 14, 'monument');

  [...sites].sort((a, b) => b.size - a.size || (b.pop ?? 0) - (a.pop ?? 0) || a.id - b.id).forEach((s) => {
    // the site itself may lie in the water or on the rock at this scale: the nearest ground that can be built on
    let cx = -1, cz = -1;
    for (let k = 0; k <= 10 && cx < 0; k++) for (let dz = -k; dz <= k && cx < 0; dz++) for (let dx = -k; dx <= k; dx++) {
      const x = Math.floor(s.at[0]) + dx, z = Math.floor(s.at[1]) + dz;
      if (Math.max(Math.abs(dx), Math.abs(dz)) === k && buildable(x, z)) { cx = x; cz = z; break; }
    }
    if (cx < 0) return;
    // on a coarser map a place holds fewer of the diorama's people and falls into a smaller class, down to none
    const pop = (s.pop ?? POP_OF_SIZE[s.size]) / shrink, size = shrink === 1 ? s.size : pop >= 40000 ? 5 : pop >= 8000 ? 4 : pop >= 3000 ? 3 : pop >= 1200 ? 2 : pop >= 300 ? 1 : 0;
    if (!size) return;
    const r = seeded(1000 + s.id), need = pop / PEOPLE_PER_PERSON;
    let housed = 0;
    if (size < WALLED_FROM) {
      // a village or small town: a church in the small town, houses scattered round it
      if (size === 2) landmark(s.style.church, r, cx, cz, 4, 'church');
      const reach = 5 + 2.5 * Math.sqrt(need);
      for (let tries = 0; housed < need && tries < 400; tries++) {
        const a = r.range(0, Math.PI * 2), q = Math.sqrt(r.next()) * reach, turn = r.chance(0.5), long = r.int(4, 5), short = r.int(3, 4), w = turn ? short : long, d = turn ? long : short;
        housed += home(r, Math.round(cx + Math.cos(a) * q - w / 2), Math.round(cz + Math.sin(a) * q - d / 2), w, d, r.chance(0.5) ? 2 : 1, 1, s.style.house);
      }
      if (own(cx, cz)) count('village');
      return;
    }
    // a walled town: its great buildings in the middle, then houses packed in a square that grows until all are housed
    landmark(size >= 4 ? s.style.great : s.style.church, r, cx, cz, 16, size >= 4 ? 'landmark' : 'church');
    for (let k = size - 3; k > 0; k--) landmark(s.style.church, r, cx + r.int(-14, 14), cz + r.int(-14, 14), 8, 'church');
    if (s.style.towers) for (let k = size - 2; k > 0; k--) landmark({ build: tower, w: 3, d: 3, height: 10 }, r, cx + r.int(-7, 7), cz + r.int(-7, 7), 5, 'tower');
    // straight streets, two blocks wide; a house stands between them
    const street = (x: number, z: number) => (x - cx + 1900) % 19 < 2 || (z - cz + 1700) % 17 < 2;
    const crosses = (x: number, z: number, w: number, d: number) => (x - cx + 1900) % 19 + w > 19 || (z - cz + 1700) % 17 + d > 17;
    let half = Math.max(6, Math.round(0.8 * Math.sqrt(need / PERSONS_PER_FLOOR_BLOCK / 2.3) / 2));
    for (; housed < need && half <= 70; half += 2) {
      for (let z = cz - half; z < cz + half && housed < need; z++) for (let x = cx - half; x < cx + half && housed < need; x++) {
        if (!inGrid(x, z) || used[idx(x, z)] || street(x, z)) continue;
        const turn = r.chance(0.5);
        for (const [long, short, floors] of [[r.int(9, 14), r.int(5, 6), r.chance(0.4) ? 3 : 2], [r.int(5, 7), r.int(4, 5), r.chance(0.25) ? 3 : 2], [4, 4, 2]].slice(r.chance(0.35) ? 0 : 1)) {
          const w = turn ? short : long, d = turn ? long : short;
          if (x + w > cx + half || z + d > cz + half || crosses(x, z, w, d)) continue;
          const got = home(r, x, z, w, d, floors, r.chance(0.5) ? 1 : 0, s.style.house);
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
      if (own(cx, cz)) { things.append(townWall(half * 2 + 2, half * 2 + 2), m.makeRotationY(0).setPosition(cx, lo + 1, cz)); count('wall'); }
      claim(cx - half - 2, cz - half - 2, cx + half + 2, cz + half + 2);
    }
    if (own(cx, cz)) count('town');
  });

  // fields: the world is cut into lots, and of the lots as many are fields as the land was under the plough
  const ox = g.ox ?? 0, oz = g.oz ?? 0;
  for (let lz = Math.floor(oz / LOT_D); lz * LOT_D < oz + N; lz++) for (let lx = Math.floor(ox / LOT_W) - 1; lx * LOT_W < ox + N; lx++) {
    // every other row of lots is set off by half a lot, and a lot is a little smaller than its place
    const x0 = lx * LOT_W - ox + (lz & 1 ? Math.floor(LOT_W / 2) : 0) + 1, z0 = lz * LOT_D - oz + 1, w = LOT_W - 2 - Math.floor(hash2(lx, lz, 61) * 3), d = LOT_D - 2 - Math.floor(hash2(lx, lz, 63) * 2);
    const mx = x0 + w / 2, mz = z0 + d / 2;
    if (mx < 0 || mz < 0 || mx >= N || mz >= N || hash2(lx, lz, 65) > cultivated(mx, mz) || lot(x0, z0, x0 + w, z0 + d, 1, 2) === null) continue;
    const kind = hash2(lx, lz, 67) < vines(mx, mz) ? 2 : 1, r = seeded(Math.floor(hash2(lx, lz, 68) * 4294967296));
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) { const i = idx(x, z); field[i] = kind; g.mat[i] = Mat.Soil; }
    if (own(Math.floor(mx), Math.floor(mz))) { crops(things, g, [mx, mz], w, d, CROPS[kind]!, r); count('field'); }
    claim(x0, z0, x0 + w, z0 + d);
    // a farmhouse beside one field in four
    if (hash2(lx, lz, 69) < 0.25) { const f = seeded(Math.floor(hash2(lx, lz, 70) * 4294967296)); home(f, x0 + w + 1, z0 + f.int(0, 2), f.int(3, 4), f.int(3, 4), f.chance(0.4) ? 2 : 1, 0, farm(mx, mz)); }
  }
  return { used, town, field };
}
