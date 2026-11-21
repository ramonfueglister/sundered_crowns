// The lists of a far piece glide to the coarser piece too: its water and the banks of its water, what stands on the
// ground, and its houses.
import { describe, expect, it } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { SEA_Y, onGrid } from '../../src/lookprobe/layout';
import { glide } from '../../src/worldprobe/glide';
import { faced, small } from '../../src/worldprobe/small';
import { drawHouses } from '../../src/worldprobe/houses';
import { drawBanks, drawTable, housesOf, tableOf } from '../../src/worldprobe/table';
import { LAND_STEP, SIDE, land, part } from './land';
import { OVER, QUARTER, S, fate, pair, piece, sheetsOn, tall } from './glide_rig';

describe('the glide of the water, the banks and what stands on the ground of a far piece', () => {
  it('has the water of the coarser step at the end: under the land that sinks from the start, and water above the sea at its level there', () => {
    const { fine, parent, shapes } = piece();
    let sea = 0,
      lake = 0,
      moved = 0,
      covered = 0;
    for (let z = part.z0; z < part.z1; z++)
      for (let x = part.x0; x < part.x1; x++) {
        const c = fate(fine, parent, x, z),
          high = c.level > SEA_Y + 0.01,
          sheets = [
            ...sheetsOn(shapes.water, x, z),
            ...sheetsOn(shapes.raised, x, z).filter(
              (s) => Math.abs(s.now[0] - s.now[1]) < 1e-6 && Math.abs(s.now[0] - s.now[2]) < 1e-6,
            ),
          ];
        if (!c.wetNow && c.wetThen) {
          // land that sinks: two triangles of water over the column, out of sight under its top now, at the coarser step's level then
          expect(sheets.length, `${x}, ${z}`).toBe(2);
          for (const s of sheets)
            for (let n = 0; n < 3; n++) {
              expect(s.now[n]).toBeLessThan(fine.h[c.i]);
              expect(s.later[n]).toBeCloseTo(c.level, 5);
            }
          if (high) lake++;
          else sea++;
        } else if (c.wetNow && c.wetThen && fine.surf[c.i] > SEA_Y + 0.01) {
          // water above the sea in both: at its own level now, at the coarser step's then
          expect(sheets.length).toBe(2);
          for (const s of sheets)
            for (let n = 0; n < 3; n++) {
              expect(s.now[n]).toBeCloseTo(fine.surf[c.i], 5);
              expect(s.later[n]).toBeCloseTo(c.level, 5);
            }
          moved++;
        } else if (c.wetNow && !c.wetThen) {
          // water that ends as land: what there is of it ends under the land's top
          for (const s of sheets) for (let n = 0; n < 3; n++) expect(s.later[n]).toBeLessThan(c.end / S + 1e-6);
          covered++;
        }
      }
    expect(sea).toBeGreaterThan(50);
    expect(lake).toBeGreaterThan(100);
    expect(moved).toBeGreaterThan(5);
    expect(covered).toBeGreaterThan(100);
  });

  it('lets the banks of its water sink out of sight and brings up those of the coarser piece', () => {
    const { fine, parent, shapes, before } = piece(),
      list = shapes.ground,
      own = before.banks,
      theirs = small(drawBanks(parent, true, QUARTER));
    expect(own).toBeGreaterThan(300);
    expect(list.sink!.length).toBe(list.pos.length / 3);
    // its own: each triangle lies in a column of water, and ends under that water or under the land that comes there
    for (let t = 0; t < own; t++) {
      const o = t * 9,
        x = Math.floor((list.pos[o] + list.pos[o + 3] + list.pos[o + 6]) / 3),
        z = Math.floor((list.pos[o + 2] + list.pos[o + 5] + list.pos[o + 8]) / 3),
        c = fate(fine, parent, x, z);
      expect(c.wetNow, `${x}, ${z}`).toBe(true);
      const hides = c.wetThen ? (fine.surf[c.i] > SEA_Y + 0.01 ? c.level : fine.surf[c.i]) : c.end / S;
      for (let n = 0; n < 3; n++) {
        expect(list.sink![t * 3 + n]).toBeLessThan(hides);
        expect(list.sink![t * 3 + n]).toBeLessThanOrEqual(list.pos[o + n * 3 + 1] + 1e-6);
      }
    }
    // the coarser piece's: all of them, where that piece has them (in this piece's blocks), and out of sight now
    expect(theirs.pos.length / 9).toBeGreaterThan(100);
    expect(list.pos.length / 9).toBe(own + theirs.pos.length / 9);
    for (let t = 0; t < theirs.pos.length / 9; t++) {
      const o = (own + t) * 9,
        q = t * 9;
      let under = Infinity;
      for (let n = 0; n < 3; n++) {
        expect(list.pos[o + n * 3]).toBeCloseTo((theirs.pos[q + n * 3] + parent.ox) * 2 - fine.ox, 4);
        expect(list.pos[o + n * 3 + 2]).toBeCloseTo((theirs.pos[q + n * 3 + 2] + parent.oz) * 2 - fine.oz, 4);
        expect(list.sink![(own + t) * 3 + n]).toBeCloseTo(tall(theirs.pos[q + n * 3 + 1]), 4);
        // (under what lies at the triangle's middle now)
        const x = Math.floor((list.pos[o] + list.pos[o + 3] + list.pos[o + 6]) / 3),
          z = Math.floor((list.pos[o + 2] + list.pos[o + 5] + list.pos[o + 8]) / 3),
          i = z * SIDE + x;
        under = fine.wet[i] ? fine.surf[i] : fine.h[i];
        expect(list.pos[o + n * 3 + 1]).toBeLessThan(under);
      }
      expect(under).toBeLessThan(Infinity);
    }
    for (let v = 0; v < 12; v++) {
      expect(list.nor[own * 3 * 4 + v]).toBe(theirs.nor[v]);
      expect(list.col[own * 3 * 4 + v]).toBe(theirs.col[v]);
    }
  });

  it('takes what stands on the ground down into its column: at the end it lies under the top there, with no height', () => {
    const { fine, parent } = pair(),
      drawn = drawTable(fine, true, LAND_STEP),
      stands = new Batch();
    // a wall two blocks tall on every third column, on its top or on its water
    for (let z = part.z0; z < part.z1; z += 3)
      for (let x = part.x0; x < part.x1; x += 3) {
        const i = z * SIDE + x,
          y = fine.wet[i] ? fine.surf[i] : fine.h[i];
        stands.quad(
          [x + 0.2, y, z + 0.5],
          [x + 0.8, y, z + 0.5],
          [x + 0.8, y + 2, z + 0.5],
          [x + 0.2, y + 2, z + 0.5],
          [0.5, 0.4, 0.3],
          [0, 0, 1],
        );
      }
    const things = small(stands),
      was = Float32Array.from(things.pos);
    glide(
      {
        ground: faced(drawn.ground),
        carried: faced(drawn.carried!),
        things,
        water: small(drawn.water),
        raised: small(drawn.raised),
      },
      fine,
      parent,
      true,
      LAND_STEP,
    );
    expect(things.pos).toEqual(was);
    let down = 0,
      stay = 0;
    for (let v = 0; v < things.pos.length / 3; v++) {
      const c = fate(fine, parent, Math.floor(things.pos[v * 3]), Math.floor(things.pos[v * 3 + 2]));
      // (on water that stays water it stays)
      if (c.wetNow && c.wetThen) {
        stay++;
        expect(things.sink![v]).toBe(things.pos[v * 3 + 1]);
        continue;
      }
      down++;
      expect(things.sink![v]).toBeLessThan(c.end / S);
      expect(things.sink![v]).toBeGreaterThan(c.end / S - 0.1);
    }
    expect(down).toBeGreaterThan(600);
    expect(stay).toBeGreaterThan(100);
  });

  it('takes its houses to where the coarser piece has the same houses, corner by corner, and the others down into their columns', () => {
    // a house: its corner, width and depth, eaves and rise, and hips (1) or gables (0)
    const house = (x0: number, z0: number, w: number, d: number, eaves: number, rise: number, hips = 0) => [
      x0,
      z0,
      x0 + w,
      z0 + d,
      eaves,
      rise,
      0xd8c8a8,
      0xb04a30,
      hips,
    ];
    const there = (x: number, z: number): [number, number] => [(4000 + x) / 2 - OVER.ox, (-1200 + z) / 2 - OVER.oz];
    const own = [
      ...house(30.25, 40.5, 1.5, 2, 2.4, 1.1),
      ...house(50, 33, 2, 1.5, 2, 0.8, 1),
      ...house(61.5, 28, 1, 1.5, 1.8, 0.7),
    ];
    // the coarser piece has the first two, a little lower each, and one of its own; not the third
    const theirs = [
      ...house(...there(50, 33), 1, 0.75, 1.5, 0.6, 1),
      ...house(40.5, 50.5, 1, 1, 1, 0.5),
      ...house(...there(30.25, 40.5), 0.75, 1, 1.8, 0.8),
    ];
    const { fine, parent } = onGrid(SIDE, () => {
      const a = land(4000, -1200, 0, 60, own),
        b = land(OVER.ox, OVER.oz, 21, 53, theirs);
      return { fine: tableOf(a.g, a.t, part), parent: tableOf(b.g, b.t, part) };
    });
    // the things as the worker hands them over: a wall, then the houses
    const drawn = drawTable(fine, true, LAND_STEP),
      stands = new Batch();
    stands.quad(
      [30.2, fine.h[30 * SIDE + 30], 30.5],
      [30.8, fine.h[30 * SIDE + 30], 30.5],
      [30.8, fine.h[30 * SIDE + 30] + 2, 30.5],
      [30.2, fine.h[30 * SIDE + 30] + 2, 30.5],
      [0.5, 0.4, 0.3],
      [0, 0, 1],
    );
    const walls = stands.pos.length / 3;
    onGrid(SIDE, () => drawHouses(stands, fine.houses!, fine.h));
    const things = small(stands);
    glide(
      {
        ground: faced(drawn.ground),
        carried: faced(drawn.carried!),
        things,
        water: small(drawn.water),
        raised: small(drawn.raised),
      },
      fine,
      parent,
      true,
      LAND_STEP,
    );
    const mine = housesOf(fine)!,
      coarse = housesOf(parent)!,
      at = (ends: number[], j: number) => [j ? ends[j - 1] : 0, ends[j]];
    // the first house ends where the coarser piece has its third, the second where it has its first: in place and height
    for (const [j, q] of [
      [0, 2],
      [1, 0],
    ]) {
      const [v0, v1] = at(mine.ends, j),
        [w0, w1] = at(coarse.ends, q);
      expect(v1 - v0).toBe(w1 - w0);
      for (let v = 0; v < v1 - v0; v++) {
        const f = (walls + v0 + v) * 3,
          c = (w0 + v) * 3;
        expect(things.pos[f]).toBeCloseTo(2 * coarse.batch.pos[c] + 2 * parent.ox - fine.ox, 4);
        expect(things.pos[f + 2]).toBeCloseTo(2 * coarse.batch.pos[c + 2] + 2 * parent.oz - fine.oz, 4);
        expect(things.sink![walls + v0 + v]).toBeCloseTo(tall(coarse.batch.pos[c + 1]), 4);
      }
    }
    // the third goes down into its column, and so does the wall
    const [v0, v1] = at(mine.ends, 2);
    for (const v of [0, ...Array.from({ length: v1 - v0 }, (_, k) => walls + v0 + k)]) {
      const c = fate(fine, parent, Math.floor(things.pos[v * 3]), Math.floor(things.pos[v * 3 + 2]));
      expect(things.sink![v]).toBeLessThan(c.end / S);
      expect(things.sink![v]).toBeGreaterThan(c.end / S - 0.1);
    }
  });
});
