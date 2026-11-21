// Properties the world from farther away must keep to be one world (worldprobe/far.ts): what stands on its land comes
// out the same on every ground that covers it, so that pieces fit together, and the walled towns and the monuments
// stand as the finest step has them.
import { afterAll, describe, expect, it } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { LEAVES } from '../../src/lookprobe/blocks';
import { GRID, type Ground, LAND_Y, Mat, N, onGrid } from '../../src/lookprobe/layout';
import { styleOf } from '../../src/buildings';
import { coverLand, usePlan } from '../../src/worldprobe/far';
import { type Site, settle } from '../../src/worldprobe/settle';
import { meadow } from './meadow';

describe('the land from farther away', () => {
  const style = styleOf('');
  /** a city, a small town and a village, where they lie in the world */
  const places: [number, number, number, number | null][] = [
    [300, 200, 4, 20000],
    [285, 110, 2, null],
    [330, 270, 1, null],
    [310, 150, 3, 4000],
  ];
  const laid = (ox: number, step: number) => {
    const g = meadow(ox),
      sites: Site[] = places.map(([x, z, size, pop], id) => ({
        id,
        at: [x - ox + 0.5, z + 0.5],
        size,
        pop,
        region: '',
        style,
      }));
    return coverLand(g, step, new Batch(), sites, {
      ploughed: (x, z) => ((Math.floor((x + ox) / 40) + Math.floor(z / 40)) % 2 ? 0.35 : 0.1),
      courses: () => 3,
      vines: () => 0.2,
      farm: () => style.house,
      own: () => true,
      woods: (x, z) => ((x + ox + z) % 90 < 45 ? { share: 0.6, crowns: LEAVES, tall: (x + ox) % 2 === 0 } : null),
    });
  };

  it('is the same on every ground that covers it', () => {
    for (const step of [1, 2, 3, 5]) {
      const a = laid(0, step),
        b = laid(200, step);
      let covered = 0;
      // the middle of what the two grounds share
      for (let z = 60; z < 340; z++)
        for (let x = 60; x < 140; x++) {
          const i = z * N + x + 200,
            j = z * N + x;
          covered += b.has[j];
          expect(
            [a.has[i], a.rise[i], a.town[i], a.share[i], a.top[i * 3], a.top[i * 3 + 1], a.top[i * 3 + 2]],
            `step ${step} at ${x + 200}, ${z}`,
          ).toEqual([b.has[j], b.rise[j], b.town[j], b.share[j], b.top[j * 3], b.top[j * 3 + 1], b.top[j * 3 + 2]]);
        }
      expect(covered).toBeGreaterThan(500);
    }
  }, 60000);

  it('is the same on a smaller ground, 32 blocks round the part that is compared', () => {
    const SIDE = 264,
      EDGE = (GRID - SIDE) / 2;
    for (const step of [2, 3, 5]) {
      const a = laid(0, step),
        b = onGrid(SIDE, () => {
          expect(N).toBe(SIDE);
          return laid(EDGE, step);
        });
      expect(N).toBe(GRID);
      expect(b.has.length).toBe(SIDE * SIDE);
      let covered = 0;
      for (let z = 32; z < SIDE - 32; z++)
        for (let x = 32; x < SIDE - 32; x++) {
          const i = z * GRID + x + EDGE,
            j = z * SIDE + x;
          covered += b.has[j];
          expect(
            [a.has[i], a.rise[i], a.town[i], a.share[i], a.kind![i], a.top[i * 3], a.top[i * 3 + 1], a.top[i * 3 + 2]],
            `step ${step} at ${x + EDGE}, ${z}`,
          ).toEqual([
            b.has[j],
            b.rise[j],
            b.town[j],
            b.share[j],
            b.kind![j],
            b.top[j * 3],
            b.top[j * 3 + 1],
            b.top[j * 3 + 2],
          ]);
        }
      expect(covered).toBeGreaterThan(500);
    }
  }, 60000);

  it('stands no higher step by step, and far out only as the woods do: a block out of the open land', () => {
    // from the step at which the great buildings too are part of the ground
    const tallest = [3, 4, 5, 6].map((step) => laid(0, step).rise.reduce((m, v) => Math.max(m, v), 0));
    for (let k = 1; k < tallest.length; k++) expect(tallest[k]).toBeLessThanOrEqual(tallest[k - 1]);
    expect(tallest[0]).toBeGreaterThan(0);
    expect(tallest[3]).toBe(1);
  }, 60000);

  it('is drawn the same way from every distance: woods as blocks of their own, as much of the land as is wooded', () => {
    for (const step of [3, 4, 5, 6, 7]) {
      const c = laid(0, step);
      let woods = 0,
        land = 0;
      for (let z = 20; z < N - 20; z++)
        for (let x = 20; x < N - 20; x++) {
          const i = z * N + x,
            kind = c.kind![i];
          // where woods grow, off the towns and the fields
          if ((x + z) % 90 >= 45 || c.town[i] || (kind >= 1 && kind <= 7)) continue;
          land++;
          if ((kind === 8 || kind === 9) && c.share[i] === 1) {
            woods++;
            expect(c.rise[i]).toBe(1);
          }
          // nothing is mixed into the colour of the ground
          expect(kind).not.toBe(10);
        }
      expect(woods / land, `step ${step}`).toBeGreaterThan(0.5);
      expect(woods / land, `step ${step}`).toBeLessThan(0.7);
    }
  }, 60000);
});

describe('a walled town of the plan from farther away', () => {
  afterAll(() => usePlan(null));
  it('is paved round its houses as at the finest step, and the rest of its square stays the land', () => {
    // a town of 80 finest blocks about (300, 200) with one house of 8 by 6 in its north-west
    usePlan({
      pieceBlocks: 200,
      greatKinds: [],
      pieces: {
        '1,1': {
          houses: [270, 170, 8, 6, 2, 60, 0xffffff, 0xff0000, 0],
          towns: [{ site: 0, cx: 300, cz: 200, half: 40, wall: null }],
        },
      },
    });
    const g = meadow(0),
      c = coverLand(g, 1, new Batch(), [], {
        ploughed: () => 0,
        vines: () => 0,
        farm: () => styleOf('').house,
        own: () => true,
        woods: () => null,
      });
    // the house, as a house on paved ground, in blocks two finest blocks wide
    expect(c.houses!.slice(0, 4)).toEqual([135, 85, 139, 88]);
    for (let z = 85; z < 88; z++)
      for (let x = 135; x < 139; x++)
        expect([c.has[z * N + x], g.mat[z * N + x]], `${x}, ${z}`).toEqual([0, Mat.Paved]);
    // three finest blocks round it are paved: the blocks of which half lies that near, so not those at its corners
    let paved = 0;
    for (let z = 80; z < 120; z++)
      for (let x = 130; x < 170; x++) {
        const i = z * N + x,
          near = x >= 133 && x <= 140 && z >= 83 && z <= 89 && !((x === 133 || x === 140) && (z === 83 || z === 89));
        paved += c.town[i];
        expect(c.town[i] === 1, `${x}, ${z}`).toBe(near);
        if (!near) expect(g.mat[i], `${x}, ${z}`).toBe(Mat.Grass);
      }
    expect(paved).toBe(8 * 7 - 4);
  });
  it("keeps the houses that the plan lists in a piece after the town's", () => {
    usePlan({
      pieceBlocks: 200,
      greatKinds: [],
      pieces: {
        '1,0': { houses: [], towns: [{ site: 0, cx: 300, cz: 190, half: 40, wall: null }] },
        '1,1': { houses: [290, 204, 8, 6, 2, 60, 0xffffff, 0xff0000, 0] },
      },
    });
    const cover = (step: number) =>
      coverLand(meadow(0), step, new Batch(), [], {
        ploughed: () => 0,
        vines: () => 0,
        farm: () => styleOf('').house,
        own: () => true,
        woods: () => null,
      });
    // as a house where houses are drawn as houses
    expect(cover(1).houses!.slice(0, 4)).toEqual([145, 102, 149, 105]);
    // as the block it lies on farther out
    expect(cover(4).kind![12 * N + 18]).toBe(1);
  });
  it('lays no field within its wall nor two blocks round it, where the finest step lays none, and one without a wall has them', () => {
    // all the land under the plough; the town's square is 258 … 342 × 158 … 242 with the two blocks round it, the columns 129 … 170 × 79 … 120
    const fields = (wall: [] | null) => {
      usePlan({
        pieceBlocks: 200,
        greatKinds: [],
        pieces: { '1,1': { houses: [], towns: [{ site: 0, cx: 300, cz: 200, half: 40, wall }] } },
      });
      const c = coverLand(meadow(0), 1, new Batch(), [], {
        ploughed: () => 1,
        vines: () => 0,
        farm: () => styleOf('').house,
        own: () => true,
        woods: () => null,
      });
      let inside = 0,
        outside = 0;
      for (let z = 0; z < N; z++)
        for (let x = 0; x < N; x++) {
          const kind = c.kind![z * N + x];
          if (kind < 4 || kind > 7) continue;
          if (x >= 129 && x <= 170 && z >= 79 && z <= 120) inside++;
          else outside++;
        }
      return { inside, outside };
    };
    const walled = fields([]),
      open = fields(null);
    expect(walled.inside).toBe(0);
    expect(walled.outside).toBeGreaterThan(N * N * 0.3);
    expect(open.inside).toBeGreaterThan(42 * 42 * 0.3);
  });

  it('paves the streets of its register at the first far step, as the finest step does, also beyond its square', () => {
    usePlan({
      pieceBlocks: 200,
      greatKinds: [],
      pieces: { '1,1': { houses: [], towns: [{ site: 0, cx: 300, cz: 200, half: 40, wall: null }] } },
    });
    // a street through its middle from 142 metres west to 142 metres east: 71 finest blocks to each side, where its
    // square reaches 40
    const site: Site = {
      id: 0,
      at: [150.5, 100.5],
      size: 3,
      pop: 2000,
      region: 'italy',
      style: styleOf('italy'),
      lots: { w: 8, d: 16, x: [], z: [], front: [], streets: [[-140, 0, 140, 0, 1]], street: 4 },
    };
    const c = coverLand(meadow(0), 1, new Batch(), [site], {
      ploughed: () => 0,
      vines: () => 0,
      farm: () => styleOf('').house,
      own: () => true,
      woods: () => null,
    });
    // its columns at the first far step: 115 … 184 in the rows 99 and 100 (finest blocks 199 and 200)
    let street = 0,
      off = 0;
    for (let x = 115; x < 185; x++) {
      street += c.town[99 * N + x] + c.town[100 * N + x];
      off += c.town[90 * N + x];
    }
    expect(street).toBe(2 * 70);
    expect(off).toBe(0);
  });

  it('grows no tree within its wall nor two blocks round it at any far step, where the finest step grows none', () => {
    // all the land under woods; the town's square is 258 … 342 × 158 … 242 with the two blocks round it
    const trees = (step: number, wall: [] | null) => {
      usePlan({
        pieceBlocks: 200,
        greatKinds: [],
        pieces: { '1,1': { houses: [], towns: [{ site: 0, cx: 300, cz: 200, half: 40, wall }] } },
      });
      const c = coverLand(meadow(0), step, new Batch(), [], {
        ploughed: () => 0,
        vines: () => 0,
        farm: () => styleOf('').house,
        own: () => true,
        woods: () => ({ share: 1, crowns: LEAVES, tall: false }),
      });
      const w = 2 ** step,
        on = (v: number, lo: number, hi: number) => (v + 0.5) * w >= lo && (v + 0.5) * w < hi;
      let inside = 0;
      for (let z = 0; z < N; z++)
        for (let x = 0; x < N; x++)
          if (on(x, 258, 342) && on(z, 158, 242) && (step === 1 ? c.trees?.[(z * N + x) * 2] : c.kind![z * N + x] >= 8))
            inside++;
      return inside;
    };
    for (const step of [1, 2, 3]) {
      expect(trees(step, []), `step ${step}`).toBe(0);
      expect(trees(step, null), `step ${step}`).toBeGreaterThan(0);
    }
  });
});

describe('a monument', () => {
  const model = { build: () => new Batch(), w: 12, d: 10, height: 8 },
    farm = () => ({ region: '', style: styleOf('') });
  /** a lake of 80 × 80 blocks from (100, 100) with an island of 8 × 8 in its middle */
  const lagoon = (): Ground => {
    const g = meadow(0);
    for (let z = 100; z < 180; z++)
      for (let x = 100; x < 180; x++) g.wet[z * N + x] = x >= 136 && x < 144 && z >= 136 && z < 144 ? 0 : 1;
    return g;
  };
  const wetIn = (g: Ground, x0: number, z0: number, x1: number, z1: number) => {
    let n = 0;
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) n += g.wet[z * N + x];
    return n;
  };

  it('stands at its place on ground made for it, where its place is an island too small for it', () => {
    const g = lagoon(),
      counts: Record<string, number> = {},
      before = wetIn(g, 100, 100, 180, 180);
    const { used } = settle(
      g,
      new Batch(),
      [],
      [{ id: 1, at: [140.5, 140.5], model }],
      farm,
      () => 0,
      () => 0,
      counts,
    );
    expect(counts.monument).toBe(1);
    // its footprint, with the column round it, is dry and paved, and the lake beyond is as it was
    expect(wetIn(g, 133, 134, 147, 146)).toBe(0);
    for (let z = 135; z < 145; z++)
      for (let x = 134; x < 146; x++) {
        expect(used[z * N + x]).toBe(1);
        expect(g.h[z * N + x]).toBe(LAND_Y);
      }
    expect(g.mat[134 * N + 133]).toBe(Mat.Paved);
    expect(before - wetIn(g, 100, 100, 180, 180)).toBe(14 * 12 - 64);
  });

  it('stands beside another on the ground made for that one', () => {
    const g = lagoon(),
      counts: Record<string, number> = {},
      tower = { build: () => new Batch(), w: 3, d: 3, height: 20 };
    const { used } = settle(
      g,
      new Batch(),
      [],
      [
        { id: 1, at: [140.5, 140.5], model },
        { id: 2, at: [140.5, 147.5], model: tower },
      ],
      farm,
      () => 0,
      () => 0,
      counts,
    );
    expect(counts.monument).toBe(2);
    // at its place, a column of the first one's made ground between them
    for (let z = 146; z < 149; z++)
      for (let x = 139; x < 142; x++) {
        expect(used[z * N + x]).toBe(1);
        expect(g.wet[z * N + x]).toBe(0);
      }
    expect(used[145 * N + 140]).toBe(0);
    expect(g.wet[145 * N + 140]).toBe(0);
  });

  it('is left out in open water, and leaves dry ground as it is', () => {
    const g = lagoon(),
      counts: Record<string, number> = {};
    settle(
      g,
      new Batch(),
      [],
      [
        { id: 1, at: [115.5, 115.5], model },
        { id: 2, at: [300.5, 300.5], model },
      ],
      farm,
      () => 0,
      () => 0,
      counts,
    );
    expect(counts['monument dropped']).toBe(1);
    expect(counts.monument).toBe(1);
    expect(wetIn(g, 100, 100, 180, 180)).toBe(80 * 80 - 64);
    expect(g.mat[300 * N + 300]).toBe(Mat.Grass);
  });
});
