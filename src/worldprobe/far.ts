// The land from farther away. On the coarser steps of the map a block is two, four, eight … cells wide, and what
// stands and grows on the land is no longer built house by house and tree by tree: it becomes part of the ground
// itself, as it would look if the finest world were seen from that far. A tree is a green block, then woods are a
// raised green ground, then only its colour; a house is a block with a roof-coloured top, a town a square of them
// that shrinks to a single block; a field is a low block of its crop, then its colour. Only the great buildings
// stay themselves for two steps, built as small as the step makes them. So the world loses its detail step by step
// while everything stays where it is and as large as it is.
import * as THREE from 'three/webgpu';
import { type Batch, type RGB, type Rnd, hash2, mix, rgb, seeded, shade } from '../lookprobe/batch';
import { OATS, OATS_SIDE, VINE_BODY, WHEAT, WHEAT_SIDE } from '../lookprobe/blocks';
import { type HouseStyle, type Model, tower } from '../buildings';
import { type Ground, Mat, N, idx, inGrid, occlude } from '../lookprobe/layout';
import { FALLOW_SHOWS, SOIL_FALLOW } from '../lookprobe/terrain';
import { CHURCH_FROM, FALLOW, PEOPLE_PER_PERSON, PERSONS_PER_FLOOR_BLOCK, POP_OF_SIZE, type Site, SPRING, VILLAGE_MOST, VILLAGE_REACH, WALLED_FROM, courseOf } from './settle';

/** What a column carries as part of itself (GroundTraits.cover): where `has` is set, the colours of its top and sides and how far it stands above its ground. */
export interface Cover { has: Uint8Array; rise: Uint8Array; top: Float32Array; side: Float32Array; /** how much of the column's top the cover colours, 0 … 1: the rest is the ground's own colour */ share: Float32Array; /** 1 on the paved ground of the towns */ town: Uint8Array }
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
/** a lot at a step: its sides in blocks, and the share of its blocks that are its field (all, once it is too small to keep a balk) */
const lotAt = (step: number) => { const w = Math.max(1, Math.round(LOT_W / 2 ** step)), d = Math.max(1, Math.round(LOT_D / 2 ** step)); return { w, d, fill: w >= 4 ? ((w - 1) * (d - 1)) / (w * d) : 1 }; };
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
const TREES = 0.85, CANOPY = 0.9, STRAY = 0.05;
/** how much of the chance from block to block is left where the woods and the fields are laid out */
const LAID_CHANCE = 0.25;
/** seen from above without the shade between the crowns, woods are darker than a crown in the sun */
const CANOPY_LIGHT = 0.8;

/**
 * Lays towns, fields and woods on the ground of a piece at `step` (1 or coarser) and raises the ground under them.
 * `sites` are the places on the ground; `ploughed` is the share of the ground under the plough at a ground point,
 * the fallow counted in (`laid`: of that very point, the fields laid out together; else of the land about it),
 * `courses` in how many courses the fields there are tilled (settle.ts `courseOf`), `vines` the share of the winter
 * fields that are vineyards, `woods` what grows on a column. Everything depends on the
 * world block alone, so that pieces laid side by side fit together; only what `own` holds at its middle is added to
 * `things`.
 */
export function coverLand(g: Ground, step: number, things: Batch, sites: readonly Site[], o: {
  ploughed(x: number, z: number): number; laid?: boolean; courses?(x: number, z: number): number; vines(x: number, z: number): number;
  woods(x: number, z: number): Woods | null; own(x: number, z: number): boolean;
}): Cover {
  const c: Cover = { has: new Uint8Array(N * N), rise: new Uint8Array(N * N), top: new Float32Array(N * N * 3), side: new Float32Array(N * N * 3), town: new Uint8Array(N * N), share: new Float32Array(N * N).fill(1) };
  const wider = 2 ** step, ox = g.ox ?? 0, oz = g.oz ?? 0, m = new THREE.Matrix4();
  const free = (x: number, z: number) => inGrid(x, z) && !g.wet[idx(x, z)] && g.mat[idx(x, z)] !== Mat.Rock && !c.has[idx(x, z)] && !c.town[idx(x, z)];
  /** whether the ground about a column is level to within a step */
  const level = (x: number, z: number) => { for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inGrid(x + dx, z + dz) && Math.abs(g.h[idx(x + dx, z + dz)] - g.h[idx(x, z)]) > 1) return false; return true; };
  const put = (x: number, z: number, rise: number, top: RGB, side: RGB = top) => { const i = idx(x, z); c.has[i] = 1; c.rise[i] = rise; c.top.set(top, i * 3); c.side.set(side, i * 3); };
  const pick = <T>(list: readonly T[], lot: number) => list[Math.min(list.length - 1, Math.floor(lot * list.length))];
  const house = (style: HouseStyle, x: number, z: number, rise: number) => { if (free(x, z)) put(x, z, rise, shade(pick(style.roofs, hash2(x + ox, z + oz, 211)), ROOF_LIGHT), pick(style.walls, hash2(x + ox, z + oz, 212))); };
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
        if (step > MODELS_UNTIL) { put(x, z, stands(model.height), roof, STONE); continue; }
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
    const people = (s.pop ?? POP_OF_SIZE[s.size]) / PEOPLE_PER_PERSON, need = s.size < WALLED_FROM ? Math.min(VILLAGE_MOST, people) : people, holds = wider * wider * STOREYS * PERSONS_PER_FLOOR_BLOCK, tall = stands(HOUSE_TALL);
    if (s.size < WALLED_FROM) {
      // a village is houses close about its church (settle.ts)
      if ((s.size === 2 || need >= CHURCH_FROM) && step <= MODELS_UNTIL) landmark(s.style.church, r, cx, cz, roof);
      const reach = (2 + VILLAGE_REACH * Math.sqrt(need)) / wider;
      const houses = Math.max(1, Math.round(need / holds));
      for (let k = houses, tries = 0; k > 0 && tries < 60 + 4 * houses; tries++) {
        const a = r.range(0, Math.PI * 2), q = Math.sqrt(r.next()) * reach, x = Math.round(cx + Math.cos(a) * q), z = Math.round(cz + Math.sin(a) * q);
        if (free(x, z)) { house(style, x, z, tall); k--; }
      }
      continue;
    }
    landmark(s.size >= 4 ? s.style.great : s.style.church, r, cx, cz, roof);
    for (let k = s.size - 3; k > 0; k--) landmark(s.style.church, r, cx + near(14), cz + near(14), roof);
    if (s.style.towers) for (let k = s.size - 2; k > 0; k--) landmark({ build: tower, w: 3, d: 3, height: 10 }, r, cx + near(7), cz + near(7), roof);
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
    if (step === 1 && half > 1) for (let k = -half; k <= half; k++) for (const [x, z] of [[cx + k, cz - half], [cx + k, cz + half], [cx - half, cz + k], [cx + half, cz + k]]) if (k !== 0 && free(x, z)) put(x, z, 1, WALL);
  }

  // fields: the lots of the finest step, as large as they are. While a lot is wide enough to show it, it keeps a
  // balk's width free on two sides and the crop stands a block high.
  // A field that lies fallow is the grass with its stubble showing through, one under spring corn is green.
  const { w: lotW, d: lotD, fill } = lotAt(step), hedged = fill < 1, blended = lotW * lotD === 1, raised = new Uint8Array(N * N);
  const courses = (x: number, z: number) => o.courses?.(x, z) ?? 1;
  const springOf = (lx: number, lz: number): [RGB, RGB] => [field(pick(OATS, hash2(lx, lz, 68)), !hedged, OATS_SIDE), OATS_SIDE];
  const cropOf = (lx: number, lz: number, mx: number, mz: number): [RGB, RGB] => (hash2(lx, lz, 67 + step) < o.vines(mx, mz) ? [VINEYARD, shade(VINE_BODY, 0.8)] : [field(pick(WHEAT, hash2(lx, lz, 68)), !hedged), WHEAT_SIDE]);
  if (!blended) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (!free(x, z) || !level(x, z)) continue;
    const wz = z + oz, lz = Math.floor(wz / lotD), shift = lz & 1 ? Math.floor(lotW / 2) : 0, wx = x + ox + shift, lx = Math.floor(wx / lotW);
    const mx = (lx + 0.5) * lotW - ox - shift, mz = (lz + 0.5) * lotD - oz;
    if (hash2(lx, lz, 65 + step) > o.ploughed(mx, mz) / fill) continue;
    if (hedged && (wx - lx * lotW === lotW - 1 || wz - lz * lotD === lotD - 1)) continue;
    const course = courseOf(courses(mx, mz), hash2(lx, lz, 166 + step));
    if (course === FALLOW) { put(x, z, 0, SOIL_FALLOW); c.share[idx(x, z)] = FALLOW_SHOWS; continue; }
    put(x, z, 0, ...(course === SPRING ? springOf(lx, lz) : cropOf(lx, lz, mx, mz)));
    raised[idx(x, z)] = hedged ? 1 : 0;
  }

  // woods: single trees while a tree is a block, then woods as raised ground, then as its colour
  if (!blended) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (!free(x, z) || g.mat[idx(x, z)] !== Mat.Grass) continue;
    const w = o.woods(x, z);
    if (!w || hash2(x + ox, z + oz, 73 + step) > STRAY + (step === 1 ? TREES : CANOPY) * w.share) continue;
    const crown = pick(w.crowns, hash2(x + ox, z + oz, 74)), rise = step === 1 ? (w.tall || hash2(x + ox, z + oz, 75) < 0.6 ? 2 : 1) : step === 2 ? 1 : 0;
    if (rise && !level(x, z)) continue;
    put(x, z, 0, shade(crown, step === 1 ? 1 : CANOPY_LIGHT), shade(crown, 0.7));
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
    put(x, z, 0, mix(crop, crown, grown / (fields + grown)));
    c.share[idx(x, z)] = Math.min(1, fields + grown);
  }
  // the ground is raised only now, so that what was laid out saw the land as it is
  for (let i = 0; i < N * N; i++) {
    if (raised[i]) c.rise[i] = raised[i];
    if (c.rise[i]) { g.h[i] += c.rise[i]; g.occ[i] = Math.max(g.occ[i], g.h[i]); }
  }
  return c;
}
