// The places of a far piece (far.ts `coverLand`): where the finest step's plan is not known, towns and villages laid
// out by rules of their own; where it is, the finest step's own houses, great buildings and walled towns.
import { type Batch, type RGB, type Rnd, hash2, rgb, seeded, shade } from '../lookprobe/batch';
import { Mat, N, idx, inGrid, occlude } from '../lookprobe/layout';
import { type HouseStyle, type Model, type Style, tower, townWall } from '../buildings';
import { builtOn, streetOn } from './crowd';
import type { Laying } from './far_lay';
import { type PlannedTown, greatOn, markOn, monumentOn, plannedTown } from './far_marks';
import { houseShape } from './houses';
import { PEOPLE_PER_PERSON, PERSONS_PER_FLOOR_BLOCK, POP_OF_SIZE, type Site, WALLED_FROM } from './settle';
import { streetsOf } from './town_spots';

/** a house of the finest step has two storeys on most of its ground and stands about five blocks high with its roof */
const STOREYS = 2,
  HOUSE_TALL = 4.5;
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
const WALL = rgb(0xcdb89c),
  STONE = rgb(0xe6dccc);
/** up to this step the great buildings are their own models, made smaller; beyond it they are blocks of stone under their roofs */
export const MODELS_UNTIL = 2;
/**
 * Up to this step the houses of the finest step are drawn as houses, each where it stands and as large as it is, with
 * its walls and roof (lookprobe/houses.ts), and no longer as blocks of their roof's colour: from near to far the same
 * houses. Beyond it a house is smaller than a dot of the picture, and a block shows the roofs on it as before.
 */
export const HOUSES_UNTIL = 3;
/** a great building stands as near its place as it finds free ground, within this many finest blocks */
const SEARCH = 16;
/**
 * A house of the plan as the camera sees it from above, at a far step: this much of its roof's colour and this much
 * of its walls' (both sides of the roof, the gable, the chimneys and what shows of the walls and the ground between
 * the houses). Measured against the mean of the finest step (`?mean=compare`) on the house blocks about Paris and
 * about Taranto: steep roofs of the north and low ones of the south come out within a tenth.
 */
const ROOF_SEEN = 0.82,
  WALL_SEEN = 0.115;
/** the walls of a house as the camera sees them: a fifth of them is windows, doors and the dark under the eaves (the upright faces of the houses' models by their area, buildings/houses, against the colour of their walls) */
const WALLS_SEEN = 0.8;
const roofSeen = (roof: RGB, wall: RGB): RGB => [
  roof[0] * ROOF_SEEN + wall[0] * WALL_SEEN,
  roof[1] * ROOF_SEEN + wall[1] * WALL_SEEN,
  roof[2] * ROOF_SEEN + wall[2] * WALL_SEEN,
];
/** the roofs and the walls the houses of a land show: a tradition's own (buildings/houses/choose.ts `shownOf`), else those of its style */
const shownBy = (s: Style): HouseStyle =>
  s.tradition ? { ...s.house, roofs: [s.tradition.roof], walls: s.tradition.walls } : s.house;
/** a walled town smaller than a block still shows on the block of its middle, this much of it its roofs: a town is found from as far as the land is seen */
const TOWN_LEAST = 0.6;
/** a walled town is paved within this many finest blocks of its buildings (settle.ts) */
const PAVED_ROUND = 3;

/**
 * The towns and villages of the sites on a far piece, laid out by rules of their own: their houses, great buildings and
 * walls where the finest step's plan is not known, only the great buildings where it is, and nothing where the plan has
 * the great buildings too (`greatKinds`).
 */
export function layPlaces(l: Laying) {
  const { g, step, things, sites, o, plan, c, wider, ox, oz, m, up, free, put, pick, stands, seenStanding } = l;
  const house = (style: HouseStyle, x: number, z: number, rise: number) => {
    if (free(x, z))
      put(
        x,
        z,
        rise,
        shade(pick(style.roofs, hash2(x + ox, z + oz, 211)), ROOF_LIGHT),
        pick(style.walls, hash2(x + ox, z + oz, 212)),
        1,
      );
  };
  /** A great building as near a column as it finds free ground. */
  const landmark = (model: Model, r: Rnd, cx: number, cz: number, roof: RGB) => {
    const w = Math.max(1, Math.round(model.w / wider)),
      d = Math.max(1, Math.round(model.d / wider)),
      reach = Math.round(SEARCH / wider);
    /** the height to build at on the footprint from (x0, z0), if all of it is free */
    const lot = (x0: number, z0: number) => {
      let y = -Infinity;
      for (let z = z0; z < z0 + d; z++)
        for (let x = x0; x < x0 + w; x++) {
          if (!free(x, z)) return null;
          y = Math.max(y, g.h[idx(x, z)]);
        }
      return y;
    };
    // a building that covers less than a quarter of a block is no block of its own: its town's houses show there
    if (step > MODELS_UNTIL && model.w * model.d < 0.25 * w * d * wider * wider) return;
    for (let k = 0; k <= reach; k++)
      for (let dz = -k; dz <= k; dz++)
        for (let dx = -k; dx <= k; dx += Math.abs(dz) === k ? 1 : 2 * k || 1) {
          const x0 = cx + dx - (w >> 1),
            z0 = cz + dz - (d >> 1),
            y = lot(x0, z0);
          if (y === null) continue;
          for (let z = z0; z < z0 + d; z++)
            for (let x = x0; x < x0 + w; x++) {
              if (step > MODELS_UNTIL) {
                put(x, z, stands(model.height), roof, STONE, 3);
                c.share[idx(x, z)] = Math.min(1, (seenStanding * model.w * model.d) / (w * d * wider * wider));
                continue;
              }
              // the model stands on level, paved ground
              const i = idx(x, z);
              g.h[i] = y;
              c.town[i] = 1;
              g.mat[i] = Mat.Paved;
            }
          if (step > MODELS_UNTIL) return;
          if (o.own(x0 + (w >> 1), z0 + (d >> 1)))
            things.append(model.build(r), m.makeScale(1 / wider, up, 1 / wider).setPosition(x0 + w / 2, y, z0 + d / 2));
          occlude(g, x0, z0, x0 + w, z0 + d, y + model.height * up);
          return;
        }
  };
  // towns and villages: a place is drawn as long as it is at least a block of its own
  for (const s of sites) {
    if (s.size < step - 1) continue;
    // the same great buildings as at the finest step (settle.ts)
    const cx = Math.floor(s.at[0]),
      cz = Math.floor(s.at[1]),
      style = shownBy(s.style),
      r = seeded(1000 + s.id),
      roof = pick(s.style.house.roofs, 0),
      near = (reach: number) => Math.round(r.int(-reach, reach) / wider);
    // as many blocks of houses as hold the place's people (settle.ts), as tall as a house is at this step
    const need = (s.pop ?? POP_OF_SIZE[s.size]) / PEOPLE_PER_PERSON,
      holds = wider * wider * STOREYS * PERSONS_PER_FLOOR_BLOCK,
      tall = stands(HOUSE_TALL);
    // with the plan of the finest step the houses and the great buildings are its own (below)
    if (plan?.greatKinds) continue;
    if (plan && s.hamlet) continue;
    if (s.hamlet) {
      // a hamlet is a few houses close together, low against the towns
      for (let k = Math.max(1, Math.round(need / holds)), q = 0; k > 0 && q <= 3; q++)
        for (let dz = -q; dz <= q && k > 0; dz++)
          for (let dx = -q; dx <= q && k > 0; dx += Math.abs(dz) === q ? 1 : 2 * q || 1) {
            if (free(cx + dx, cz + dz)) {
              house(style, cx + dx, cz + dz, Math.min(1, tall));
              k--;
            }
          }
      continue;
    }
    if (s.size < WALLED_FROM) {
      // a village is houses scattered about its middle, a small town has its church among them
      if (s.size === 2 && step <= MODELS_UNTIL) landmark(s.style.church, r, cx, cz, roof);
      if (plan) continue;
      const reach = (5 + SCATTER * Math.sqrt(need)) / wider;
      for (let k = Math.max(1, Math.round(need / holds)), tries = 0; k > 0 && tries < 60; tries++) {
        const a = r.range(0, Math.PI * 2),
          q = Math.sqrt(r.next()) * reach,
          x = Math.round(cx + Math.cos(a) * q),
          z = Math.round(cz + Math.sin(a) * q);
        if (free(x, z)) {
          house(style, x, z, tall);
          k--;
        }
      }
      continue;
    }
    landmark(s.size >= 4 ? s.style.great : s.style.church, r, cx, cz, roof);
    for (let k = s.size - 3; k > 0; k--) landmark(s.style.church, r, cx + near(14), cz + near(14), roof);
    if (s.style.towers)
      for (let k = s.size - 2; k > 0; k--)
        landmark({ build: tower, w: 3, d: 3, height: 10 }, r, cx + near(7), cz + near(7), roof);
    if (plan) continue;
    // houses between the streets, ring by ring from the middle until all are housed; what is left of the last ring is paved
    const pitch = Math.round(STREETS / wider);
    let half = 0;
    for (let housed = 0; housed < need && half * wider < TOWN_MOST; half++)
      for (let dz = -half; dz <= half; dz++)
        for (let dx = -half; dx <= half; dx += Math.abs(dz) === half ? 1 : 2 * half || 1) {
          const x = cx + dx,
            z = cz + dz;
          if (!free(x, z)) continue;
          const street = pitch >= 3 && ((dx + 900) % pitch === 0 || (dz + 900) % pitch === 0),
            lot = hash2(x + ox, z + oz, 213);
          if (!street && lot < HOUSES && housed < need) {
            house(style, x, z, tall + (tall && wider * lot < 0.5 ? 1 : 0));
            housed += holds;
          } else {
            c.town[idx(x, z)] = 1;
            g.mat[idx(x, z)] = Mat.Paved;
          }
        }
    // the wall, with a gate in the middle of each side, while it is a block wide
    if (step === 1 && half > 1)
      for (let k = -half; k <= half; k++)
        for (const [x, z] of [
          [cx + k, cz - half],
          [cx + k, cz + half],
          [cx - half, cz + k],
          [cx + half, cz + k],
        ])
          if (k !== 0 && free(x, z)) put(x, z, 1, WALL, WALL, 2);
  }
}

/** The houses, great buildings and walled towns of the finest step's plan on a far piece, where the plan is known. */
export function layPlanned(l: Laying) {
  const { g, step, things, sites, o, plan, c, wider, ox, oz, m, up, taken, free, put, pick, stands, seenStanding } = l;
  // the houses of the finest step, where its plan is known: drawn as houses up to HOUSES_UNTIL; beyond it a far
  // block shows the roofs of the houses on it as far as they cover it
  if (plan) {
    /** how much of a block the houses laid on it cover */
    const housed = new Float32Array(N * N),
      marked = new Map<string, (Batch | null)[]>(),
      walled = new Map<number, PlannedTown | null>(),
      greats = new Map<string, Map<string, Batch>>();
    // a walled town's other great buildings as the finest step built them (far_marks.ts `greatOn`)
    const greatOf = (s: Site, gx: number, gz: number, gw: number, gd: number) => {
      if (!walled.has(s.id)) walled.set(s.id, plannedTown(plan, s.id, (s.at[0] + ox) * wider, (s.at[1] + oz) * wider));
      const t = walled.get(s.id);
      return t ? greatOn(s, gx, gz, gw, gd, t.cx, t.cz, t.stood, greats) : null;
    };
    const side = plan.pieceBlocks,
      fine = (v: number) => Math.floor((v * wider) / side);
    for (let pz = fine(oz); pz <= fine(oz + N); pz++)
      for (let px = fine(ox); px <= fine(ox + N); px++) {
        const here = plan.pieces[`${px},${pz}`];
        if (!here) continue;
        if (step <= HOUSES_UNTIL) {
          // each house as a house, on the columns it stands on
          c.houses ??= [];
          const houses = c.houses;
          for (let k = 0; k + 8 < here.houses.length; k += 9) {
            const [hx, hz, w, d, floors, tenths, wall, roof] = here.houses.slice(k, k + 9),
              x0 = hx / wider - ox,
              z0 = hz / wider - oz,
              x1 = (hx + w) / wider - ox,
              z1 = (hz + d) / wider - oz;
            if (c.quarters) builtOn(c.quarters, ox, oz, hx, hz, hx + w, hz + d);
            if (!inGrid(Math.floor((x0 + x1) / 2), Math.floor((z0 + z1) / 2))) continue;
            // (as tall as the land is built, as the great buildings and the trees stand)
            const shape = houseShape(w, d, floors, tenths / 10, hx, hz);
            houses.push(x0, z0, x1, z1, shape.eaves * up, shape.rise * up, wall, roof, shape.hips ? 1 : 0);
            for (let z = Math.max(0, Math.floor(z0)); z < Math.min(N, Math.ceil(z1)); z++)
              for (let x = Math.max(0, Math.floor(x0)); x < Math.min(N, Math.ceil(x1)); x++) taken[idx(x, z)] = 1;
          }
        } else {
          // where a block is larger than a house, it is the houses' as far as they cover it: a block for every
          // house made a town many times its size
          for (let k = 0; k + 8 < here.houses.length; k += 9) {
            const [hx, hz, w, d, , tenths, wall, roof] = here.houses.slice(k, k + 9),
              walls = shade(rgb(wall), WALLS_SEEN),
              top = roofSeen(rgb(roof), rgb(wall));
            for (let bz = Math.floor(hz / wider); bz * wider < hz + d; bz++)
              for (let bx = Math.floor(hx / wider); bx * wider < hx + w; bx++) {
                const x = bx - ox,
                  z = bz - oz;
                if (!inGrid(x, z)) continue;
                const i = idx(x, z),
                  was = c.kind![i] === 1 ? housed[i] : 0;
                if (!was && !free(x, z)) continue;
                const covered =
                    ((Math.min(hx + w, (bx + 1) * wider) - Math.max(hx, bx * wider)) *
                      (Math.min(hz + d, (bz + 1) * wider) - Math.max(hz, bz * wider))) /
                    (wider * wider),
                  all = was + covered;
                // the roofs of a block's houses in the mean, by the ground each covers
                const mean = (of: Float32Array, c1: RGB): RGB => [
                  (of[i * 3] * was + c1[0] * covered) / all,
                  (of[i * 3 + 1] * was + c1[1] * covered) / all,
                  (of[i * 3 + 2] * was + c1[2] * covered) / all,
                ];
                put(
                  x,
                  z,
                  all >= 0.5 ? stands(tenths / 10) : 0,
                  was ? mean(c.top, top) : top,
                  was ? mean(c.side, walls) : walls,
                  1,
                );
                housed[i] = all;
                c.share[i] = Math.min(1, all * seenStanding);
              }
          }
        }
        // the great buildings where the finest step has them: its models made smaller while they are a few blocks
        // wide, then stone under their roof as far as they cover a block
        for (let k = 0; plan.greatKinds && here.greats && k + 6 < here.greats.length; k += 7) {
          const [kind, gx, gz, gw, gd, tenths, id] = here.greats.slice(k, k + 7),
            s = sites.find((q) => q.id === id),
            name = plan.greatKinds[kind];
          if (c.quarters) builtOn(c.quarters, ox, oz, gx, gz, gx + gw, gz + gd);
          const model: Model | null = !s
            ? null
            : name === 'church'
              ? s.style.church
              : name === 'landmark'
                ? s.style.great
                : name === 'tower'
                  ? { build: tower, w: 3, d: 3, height: 10 }
                  : null;
          // a landmark of the register or a monument: the finest step's own model, as large as it is (far_marks.ts)
          const world = (x: number, z: number): [number, number] => [(x + ox) * wider, (z + oz) * wider];
          let mark: Batch | null = null;
          if (step <= MODELS_UNTIL && name !== 'tower' && s?.marks)
            mark = markOn(s, gx, gz, gw, gd, world(s.at[0], s.at[1]), marked);
          else if (step <= MODELS_UNTIL && id < 0) mark = monumentOn(o.monuments ?? [], gx, gz, gw, gd, world);
          else if (step <= MODELS_UNTIL && s) mark = greatOf(s, gx, gz, gw, gd);
          // else a town's first great building is its church or its cathedral, built from its numbers as they start
          // (settle.ts: a village's church, a walled town's building in the middle, before its other churches)
          const first = name === 'landmark' || (name === 'church' && (s?.size ?? 0) < 4),
            made = mark ? () => mark : model ? () => model.build(seeded(1000 + id + (first ? 0 : k))) : null;
          const roof = s ? pick(s.style.house.roofs, 0) : STONE,
            x0 = Math.floor(gx / wider) - ox,
            z0 = Math.floor(gz / wider) - oz,
            x1 = Math.max(x0 + 1, Math.round((gx + gw) / wider) - ox),
            z1 = Math.max(z0 + 1, Math.round((gz + gd) / wider) - oz);
          if (step > MODELS_UNTIL || !made) {
            const covers = Math.min(1, (seenStanding * gw * gd) / ((x1 - x0) * (z1 - z0) * wider * wider));
            if (covers >= 0.25)
              for (let z = z0; z < z1; z++)
                for (let x = x0; x < x1; x++)
                  if (free(x, z)) {
                    put(x, z, stands(tenths / 10), roof, STONE, 3);
                    c.share[idx(x, z)] = covers;
                  }
            continue;
          }
          let y = -Infinity;
          for (let z = z0; z < z1; z++)
            for (let x = x0; x < x1; x++) if (inGrid(x, z) && !g.wet[idx(x, z)]) y = Math.max(y, g.h[idx(x, z)]);
          if (y === -Infinity) continue;
          // the model stands on level, paved ground
          for (let z = z0; z < z1; z++)
            for (let x = x0; x < x1; x++)
              if (inGrid(x, z) && !g.wet[idx(x, z)]) {
                const i = idx(x, z);
                g.h[i] = y;
                c.town[i] = 1;
                c.has[i] = 0;
                g.mat[i] = Mat.Paved;
              }
          const mx = (gx + gw / 2) / wider - ox,
            mz = (gz + gd / 2) / wider - oz;
          if (o.own(Math.floor(mx), Math.floor(mz)))
            things.append(made(), m.makeScale(1 / wider, up, 1 / wider).setPosition(mx, y, mz));
          occlude(g, x0, z0, x1, z1, y + (tenths / 10) * up);
        }
      }
    // the towns after all the houses: a town's paving and wall leave the ground of every house free, also of
    // those in a piece that comes after the town's
    for (let pz = fine(oz); pz <= fine(oz + N); pz++)
      for (let px = fine(ox); px <= fine(ox + N); px++) {
        const here = plan.pieces[`${px},${pz}`];
        if (!here) continue;
        // a walled town's ground is paved round its houses, and at the first far step its wall stands about it,
        // open where the finest step's wall is open for water
        for (const t of here.towns ?? []) {
          const x0 = Math.floor((t.cx - t.half) / wider) - ox,
            x1 = Math.ceil((t.cx + t.half) / wider) - ox,
            z0 = Math.floor((t.cz - t.half) / wider) - oz,
            z1 = Math.ceil((t.cz + t.half) / wider) - oz;
          if (wider > 2 * t.half) {
            // (its houses are drawn as houses)
            if (step <= HOUSES_UNTIL) continue;
            // a town smaller than a block: the blocks it lies on show its roofs as far as it covers them
            const s = sites.find((q) => q.id === t.site),
              roofs = s ? roofSeen(pick(shownBy(s.style).roofs, 0), pick(shownBy(s.style).walls, 0)) : null;
            for (let z = z0; roofs && z < z1; z++)
              for (let x = x0; x < x1; x++) {
                if (!inGrid(x, z) || g.wet[idx(x, z)] || !(free(x, z) || c.kind![idx(x, z)] === 1)) continue;
                const bx = (x + ox) * wider,
                  bz = (z + oz) * wider,
                  i = idx(x, z);
                const covers =
                    (Math.max(0, Math.min(t.cx + t.half, bx + wider) - Math.max(t.cx - t.half, bx)) *
                      Math.max(0, Math.min(t.cz + t.half, bz + wider) - Math.max(t.cz - t.half, bz))) /
                    (wider * wider),
                  here = t.cx >= bx && t.cx < bx + wider && t.cz >= bz && t.cz < bz + wider,
                  seen = Math.max(here ? TOWN_LEAST : 0, Math.min(1, covers * HOUSES * seenStanding));
                if (seen <= (c.kind![i] === 1 ? c.share[i] : 0)) continue;
                put(x, z, 0, roofs, shade(pick(shownBy(s!.style).walls, 0), WALLS_SEEN), 1);
                c.share[i] = seen;
              }
            continue;
          }
          // paved as the finest step paves it (settle.ts): within its square, PAVED_ROUND of its blocks of a building,
          // and the streets and the market of the land register, also beyond the square; a far block where half of it is.
          // Its street, where its people walk, is that paving but where a building stands on it, and the register's
          // streets only where it has a wall (settle.ts: town ground nothing stands on; `near` 1 round the buildings,
          // 2 on the register's streets)
          const s = sites.find((q) => q.id === t.site),
            streets = s?.lots ? streetsOf(s.lots) : [];
          const sx0 = t.cx - t.half,
            sz0 = t.cz - t.half,
            sx1 = t.cx + t.half,
            sz1 = t.cz + t.half;
          let fx0 = sx0,
            fz0 = sz0,
            fx1 = sx1,
            fz1 = sz1;
          for (let q = 0; q < streets.length; q += 4) {
            fx0 = Math.min(fx0, t.cx + streets[q]);
            fz0 = Math.min(fz0, t.cz + streets[q + 1]);
            fx1 = Math.max(fx1, t.cx + streets[q + 2]);
            fz1 = Math.max(fz1, t.cz + streets[q + 3]);
          }
          const spanX = fx1 - fx0,
            near = new Uint8Array(spanX * (fz1 - fz0));
          const mark = (ax0: number, az0: number, ax1: number, az1: number, v = 1) => {
            for (let z = Math.max(fz0, az0); z < Math.min(fz1, az1); z++)
              for (let x = Math.max(fx0, ax0); x < Math.min(fx1, ax1); x++) near[(z - fz0) * spanX + x - fx0] |= v;
          };
          const round = (bx: number, bz: number, bw: number, bd: number) =>
            mark(
              Math.max(sx0, Math.floor(bx) - PAVED_ROUND),
              Math.max(sz0, Math.floor(bz) - PAVED_ROUND),
              Math.min(sx1, Math.ceil(bx + bw) + PAVED_ROUND),
              Math.min(sz1, Math.ceil(bz + bd) + PAVED_ROUND),
            );
          for (let qz = Math.floor((sz0 - PAVED_ROUND) / side); qz <= Math.floor((sz1 + PAVED_ROUND) / side); qz++)
            for (let qx = Math.floor((sx0 - PAVED_ROUND) / side); qx <= Math.floor((sx1 + PAVED_ROUND) / side); qx++) {
              const there = plan.pieces[`${qx},${qz}`];
              for (let k = 0; there && k + 8 < there.houses.length; k += 9)
                round(there.houses[k], there.houses[k + 1], there.houses[k + 2], there.houses[k + 3]);
              for (let k = 0; there?.greats && k + 6 < there.greats.length; k += 7)
                round(there.greats[k + 1], there.greats[k + 2], there.greats[k + 3], there.greats[k + 4]);
            }
          for (let q = 0; q < streets.length; q += 4)
            mark(t.cx + streets[q], t.cz + streets[q + 1], t.cx + streets[q + 2], t.cz + streets[q + 3], 2);
          const paved = (x: number, z: number) => {
            let n = 0;
            for (let fz = Math.max(fz0, (z + oz) * wider); fz < Math.min(fz1, (z + oz + 1) * wider); fz++)
              for (let fx = Math.max(fx0, (x + ox) * wider); fx < Math.min(fx1, (x + ox + 1) * wider); fx++)
                n += near[(fz - fz0) * spanX + fx - fx0] ? 1 : 0;
            return 2 * n >= wider * wider;
          };
          const street = (fx: number, fz: number) =>
            fx >= fx0 &&
            fz >= fz0 &&
            fx < fx1 &&
            fz < fz1 &&
            (near[(fz - fz0) * spanX + fx - fx0] & (t.wall === null ? 1 : 3)) > 0;
          for (let z = Math.floor(fz0 / wider) - oz; z < Math.ceil(fz1 / wider) - oz; z++)
            for (let x = Math.floor(fx0 / wider) - ox; x < Math.ceil(fx1 / wider) - ox; x++)
              if (inGrid(x, z) && paved(x, z)) {
                if (
                  free(x, z) ||
                  (taken[idx(x, z)] && !g.wet[idx(x, z)] && g.mat[idx(x, z)] !== Mat.Rock && !c.has[idx(x, z)])
                ) {
                  c.town[idx(x, z)] = 1;
                  g.mat[idx(x, z)] = Mat.Paved;
                  if (c.quarters) streetOn(c.quarters, x, z, ox, oz, street);
                } else if (c.kind![idx(x, z)] === 1) g.mat[idx(x, z)] = Mat.Paved;
              }
          // the wall as long as the great buildings stay themselves: the finest step's wall (settle.ts), made smaller,
          // on the lowest ground of its ring, with its gates and its openings for the water; nothing grows on its ring
          if (step <= MODELS_UNTIL && t.wall !== null) {
            let lo = Infinity;
            for (let z = z0 - 1; z <= z1; z++)
              for (let x = x0 - 1; x <= x1; x++) {
                if (!(x === x0 - 1 || x === x1 || z === z0 - 1 || z === z1) || !inGrid(x, z)) continue;
                taken[idx(x, z)] = 1;
                if (!g.wet[idx(x, z)]) lo = Math.min(lo, g.h[idx(x, z)]);
              }
            const mx = t.cx / wider - ox,
              mz = t.cz / wider - oz;
            if (lo < Infinity && o.own(Math.floor(mx), Math.floor(mz)))
              things.append(
                townWall(t.half * 2 + 2, t.half * 2 + 2, t.wall ?? []),
                m.makeScale(1 / wider, up, 1 / wider).setPosition(mx, lo, mz),
              );
          }
        }
      }
  }
}
