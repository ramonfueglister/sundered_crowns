// The walled towns of the finest step's plan on a far piece (far.ts `coverLand`): a town smaller than a block shows its
// roofs on the blocks it lies on; a larger one is paved as the finest step paves it, and at the first far steps its
// wall and its bridges stand about it. At the first far step the quarters its figures stand on keep its streets and
// its wall (crowd.ts).
import { Mat, N, idx, inGrid } from '../lookprobe/layout';
import { shade } from '../lookprobe/batch';
import { townWall } from '../buildings';
import { streetOn, wallOn } from './crowd';
import type { Laying } from './far_lay';
import { HOUSES, HOUSES_UNTIL, MODELS_UNTIL, WALLS_SEEN, roofSeen, shownBy } from './far_places';
import { streetsOf } from './town_spots';
import { onWall, townWorks } from './town_wall';

/** a walled town smaller than a block still shows on the block of its middle, this much of it its roofs: a town is found from as far as the land is seen */
const TOWN_LEAST = 0.6;
/** a walled town is paved within this many finest blocks of its buildings (settle.ts) */
const PAVED_ROUND = 3;

/** The walled towns of the plan on a far piece, after all its houses (far_places.ts `layPlanned`). */
export function layTowns(l: Laying) {
  const { g, step, things, sites, o, plan, c, wider, ox, oz, m, up, taken, free, put, pick, seenStanding } = l;
  if (!plan) return;
  const side = plan.pieceBlocks,
    fine = (v: number) => Math.floor((v * wider) / side);
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
        // the wall and the bridges as long as the great buildings stay themselves: those of the land register
        // (settlement features 6 and 7, settle.ts) made smaller, each piece of the world drawing what lies on its
        // ground; nothing grows on the ring. A town without a ring of the register keeps the square wall below.
        const ring = t.wall === null ? undefined : s?.lots?.walls;
        if (step <= MODELS_UNTIL && s?.lots && (ring?.length || s.lots.bridges?.length)) {
          const mx = t.cx / wider - ox,
            mz = t.cz / wider - oz,
            at = (x: number, z: number): [number, number] => [Math.floor(mx + x), Math.floor(mz + z)];
          const pieces = townWorks(
            things,
            m.makeRotationY(0).setPosition(mx, 0, mz),
            ring ? s.lots : { ...s.lots, walls: undefined },
            wider,
            up,
            (x, z) => (inGrid(...at(x, z)) ? g.h[idx(...at(x, z))] : null),
            (x, z) => inGrid(...at(x, z)) && o.own(...at(x, z)),
            (x, z) => !g.wet[idx(...at(x, z))],
          );
          onWall(pieces, mx, mz, (x, z) => {
            if (inGrid(x, z)) taken[idx(x, z)] = 1;
          });
          if (c.quarters) wallOn(c.quarters, ox, oz, pieces, wider, t.cx, t.cz);
        }
        if (step <= MODELS_UNTIL && t.wall !== null && !ring?.length) {
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
