// Properties the world must keep to be one world: it goes round the globe and begins again where it ended, and what
// stands on its land comes out the same on every ground that covers it, so that pieces fit together.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { LEAVES } from '../../src/lookprobe/blocks';
import { GRID, type Ground, LAND_Y, Mat, N, SEA_Y, onGrid } from '../../src/lookprobe/layout';
import { heightOf, styleOf } from '../../src/buildings';
import { coverLand, usePlan } from '../../src/worldprobe/far';
import { type Region, Water, cellOf, loadWindow, projectionOf, refine } from '../../src/worldprobe/region';
import { columnsOf, pave } from '../../src/worldprobe/nearground';
import { type Lot, type Site, raise, settle } from '../../src/worldprobe/settle';

/** a level meadow with a lake, starting at world block (ox, 0) */
const ground = (ox: number): Ground => {
  const g: Ground = { h: new Int16Array(N * N).fill(LAND_Y), mat: new Uint8Array(N * N).fill(Mat.Grass), wet: new Uint8Array(N * N), shore: new Uint8Array(N * N), occ: new Float32Array(N * N).fill(LAND_Y), surf: new Float32Array(N * N).fill(SEA_Y), ox, oz: 0 };
  for (let z = 150; z < 170; z++) for (let x = 0; x < N; x++) if (x + ox >= 250 && x + ox < 270) g.wet[z * N + x] = 1;
  return g;
};

describe('round the globe', () => {
  // a world of three tiles of eight cells in a row, the last cut short to four: twenty cells round the globe, of
  // which the first sixteen are the game map (60° west to 60° east)
  const T = 8, ROUND = 20, index = { tile: T, cells: 1, mapW: 16, mapH: 8, lon0: -60, lon1: 60, latN: 40, latS: -40, worldW: ROUND, worldH: 8, tiles: ['0_0', '1_0', '2_0'] };
  /** a tile whose heights say which cell of the world they are (column of the first lap + 100 × row), with a river along its first row */
  const tile = (tx: number) => {
    const raw = new Uint8Array(T * T * 6), heights = new Int16Array(raw.buffer, 0, T * T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) heights[y * T + x] = tx * T + x < ROUND ? tx * T + x + 100 * y : -1;
    return raw;
  };
  beforeAll(() => {
    vi.stubGlobal('fetch', async (url: string) => {
      const name = url.replace(/\?.*$/, '').split('/').pop()!, tx = Number(name.split('_')[0]);
      const body = name === 'index.json' ? JSON.stringify(index) : name.endsWith('.json') ? JSON.stringify([{ name: 'river', rank: 1, pts: [[tx * T, 0.5], [tx * T + 3, 0.5]] }]) : tile(tx);
      return new Response(body);
    });
  });
  afterAll(() => { vi.unstubAllGlobals(); });

  it('begins again in the east where it ended in the west', async () => {
    for (const gx0 of [14, -7, 2 * ROUND + 17]) {
      const r = await loadWindow('round', gx0, 2, 12, 3);
      for (let y = 0; y < 3; y++) for (let x = 0; x < 12; x++) expect(r.shaped[y * 12 + x]).toBe((((gx0 + x) % ROUND) + ROUND) % ROUND + 100 * (y + 2));
    }
  });

  it('carries the rivers round with the land', async () => {
    const r = await loadWindow('round', ROUND + 14, 0, 12, 3);
    // the river of the first tile, on the lap the window lies on
    expect(r.rivers.some((v) => v.pts[0][0] === 6 && v.pts[1][0] === 9)).toBe(true);
  });

  it('finds every place on the lap round the globe on which the window lies', async () => {
    const p = await projectionOf('round'), [u] = p.cellOf(-55, 0);
    expect(p.round).toBe(ROUND);
    expect(p.placeOf(u + 3 * ROUND, 4)[0]).toBeCloseTo(-55, 6);
    // 180° lies beyond the game map, half way round what is left of the globe
    expect(p.cellOf(180, 0)[0]).toBeCloseTo(18, 6);
    expect(p.placeOf(18, 4)[0]).toBeCloseTo(-180, 6);
    const r = await loadWindow('round', 2 * ROUND + 14, 0, 12, 3);
    expect(cellOf(r, -55, 0)[0]).toBeCloseTo(u + 2 * ROUND - r.x0 + (u < 10 ? ROUND : 0), 6);
    expect(cellOf(r, -55, 0)[0]).toBeGreaterThanOrEqual(0);
    expect(cellOf(r, -55, 0)[0]).toBeLessThan(12);
  });

  it('draws a window finer than the data from the cells around it', async () => {
    // the heights of the tiles rise by one a cell to the east and by a hundred a row to the south
    const F = 4, gx0 = 14, gy0 = 9, r = await loadWindow('round', gx0, gy0, 10, 5, '/', F);
    expect(r.cells).toBe(F);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 10; x++) {
      const cx = (gx0 + x + 0.5) / F, cy = (gy0 + y + 0.5) / F;
      expect(r.shaped[y * 10 + x], `${x}, ${y}`).toBe(Math.round(cx - 0.5 + 100 * (cy - 0.5)));
    }
  });
});

describe('finer than the data', () => {
  // a slope of 8 by 6 cells rising to the east, with a lake of two cells in it, the sea along its east edge and a river
  const W = 8, H = 6, F = 4;
  const data = (): Region => {
    const n = W * H, r: Region = { w: W, h: H, x0: 10, y0: 20, cells: 4, mapW: 100, mapH: 100, lon0: -10, lon1: 10, latN: 50, latS: 40, shaped: new Int16Array(n), drainage: new Uint8Array(n), water: new Uint8Array(n), forest: new Uint8Array(n), crops: new Uint8Array(n), rivers: [{ name: 'river', rank: 3, pts: [[1, 1], [5, 1]] }] };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      r.shaped[i] = 100 * x + 10 * y; r.forest[i] = 30 * x; r.drainage[i] = x;
      if (x === W - 1) { r.water[i] = Water.Sea; r.shaped[i] = 0; }
    }
    for (const x of [3, 4]) { r.water[3 * W + x] = Water.Lake; r.shaped[3 * W + x] = 250; }
    return r;
  };
  // the finer window from the data's cell (1, 1) to their east edge and their fifth row
  const d = data(), f = refine(d, F, F, F, (W - 1) * F, 4 * F);
  /** the finer window's column and cell at a point of the data's cells */
  const column = (cx: number) => Math.floor(cx * F - F), at = (cx: number, cy: number) => Math.floor(cy * F - F) * f.w + column(cx);

  it('lies where the data lie, with four cells to each of theirs', () => {
    expect(f.cells).toBe(d.cells * F);
    for (const [lon, lat] of [[-3, 47], [1, 45], [6, 41]]) {
      const [u, v] = cellOf(d, lon, lat), [fu, fv] = cellOf(f, lon, lat);
      expect(fu).toBeCloseTo(u * F - F, 6); expect(fv).toBeCloseTo(v * F - F, 6);
    }
  });

  it('draws the land between the data\'s cells', () => {
    // away from the water every cell lies on the slope the data's cells span
    for (let y = 0; y < F; y++) for (let x = 0; x < 4 * F; x++) {
      const cx = (F + x + 0.5) / F, cy = (F + y + 0.5) / F;
      expect(f.shaped[y * f.w + x]).toBe(Math.round(100 * (cx - 0.5) + 10 * (cy - 0.5)));
      expect(f.forest[y * f.w + x]).toBe(Math.round(30 * (cx - 0.5)));
      expect(f.drainage[y * f.w + x]).toBe(Math.floor(cx));
    }
  });

  it('keeps the water where it was: the coast half way between the cells, the lake at its level', () => {
    for (let y = 0; y < f.h; y++) {
      expect(f.water[y * f.w + column(6.875)]).toBe(Water.Land);
      expect(f.water[y * f.w + column(7.125)]).toBe(Water.Sea);
    }
    // the middles of the lake's cells are lake, and every cell of the lake lies at its level
    for (const [cx, cy] of [[3.375, 3.375], [3.625, 3.625], [4.375, 3.375], [4.625, 3.625]]) expect(f.water[at(cx, cy)]).toBe(Water.Lake);
    let lake = 0;
    for (let i = 0; i < f.w * f.h; i++) if (f.water[i] === Water.Lake) { lake++; expect(f.shaped[i]).toBe(250); }
    expect(lake).toBeGreaterThanOrEqual(2 * F * F * 0.5);
    expect(lake).toBeLessThanOrEqual(2 * F * F * 1.5);
  });

  it('carries the rivers along', () => {
    expect(f.rivers[0].pts).toEqual([[0, 0], [4 * F, 0]]);
  });
});

describe('the land from farther away', () => {
  const style = styleOf('');
  /** a city, a small town and a village, where they lie in the world */
  const places: [number, number, number, number | null][] = [[300, 200, 4, 20000], [285, 110, 2, null], [330, 270, 1, null], [310, 150, 3, 4000]];
  const laid = (ox: number, step: number) => {
    const g = ground(ox), sites: Site[] = places.map(([x, z, size, pop], id) => ({ id, at: [x - ox + 0.5, z + 0.5], size, pop, region: '', style }));
    return coverLand(g, step, new Batch(), sites, {
      ploughed: (x, z) => (Math.floor((x + ox) / 40) + Math.floor(z / 40)) % 2 ? 0.35 : 0.1, courses: () => 3, vines: () => 0.2, farm: () => style.house, own: () => true,
      woods: (x, z) => ((x + ox + z) % 90 < 45 ? { share: 0.6, crowns: LEAVES, tall: (x + ox) % 2 === 0 } : null),
    });
  };

  it('is the same on every ground that covers it', () => {
    for (const step of [1, 2, 3, 5]) {
      const a = laid(0, step), b = laid(200, step);
      let covered = 0;
      // the middle of what the two grounds share
      for (let z = 60; z < 340; z++) for (let x = 60; x < 140; x++) {
        const i = z * N + x + 200, j = z * N + x;
        covered += b.has[j];
        expect([a.has[i], a.rise[i], a.town[i], a.share[i], a.top[i * 3], a.top[i * 3 + 1], a.top[i * 3 + 2]], `step ${step} at ${x + 200}, ${z}`).toEqual([b.has[j], b.rise[j], b.town[j], b.share[j], b.top[j * 3], b.top[j * 3 + 1], b.top[j * 3 + 2]]);
      }
      expect(covered).toBeGreaterThan(500);
    }
  }, 60000);

  it('is the same on a smaller ground, 32 blocks round the part that is compared', () => {
    const SIDE = 264, EDGE = (GRID - SIDE) / 2;
    for (const step of [2, 3, 5]) {
      const a = laid(0, step), b = onGrid(SIDE, () => { expect(N).toBe(SIDE); return laid(EDGE, step); });
      expect(N).toBe(GRID);
      expect(b.has.length).toBe(SIDE * SIDE);
      let covered = 0;
      for (let z = 32; z < SIDE - 32; z++) for (let x = 32; x < SIDE - 32; x++) {
        const i = z * GRID + x + EDGE, j = z * SIDE + x;
        covered += b.has[j];
        expect([a.has[i], a.rise[i], a.town[i], a.share[i], a.kind![i], a.top[i * 3], a.top[i * 3 + 1], a.top[i * 3 + 2]], `step ${step} at ${x + EDGE}, ${z}`).toEqual([b.has[j], b.rise[j], b.town[j], b.share[j], b.kind![j], b.top[j * 3], b.top[j * 3 + 1], b.top[j * 3 + 2]]);
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
      let woods = 0, land = 0;
      for (let z = 20; z < N - 20; z++) for (let x = 20; x < N - 20; x++) {
        const i = z * N + x, kind = c.kind![i];
        // where woods grow, off the towns and the fields
        if ((x + z) % 90 >= 45 || c.town[i] || (kind >= 1 && kind <= 7)) continue;
        land++;
        if ((kind === 8 || kind === 9) && c.share[i] === 1) { woods++; expect(c.rise[i]).toBe(1); }
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
    usePlan({ pieceBlocks: 200, greatKinds: [], pieces: { '1,1': { houses: [270, 170, 8, 6, 2, 60, 0xffffff, 0xff0000, 0], towns: [{ site: 0, cx: 300, cz: 200, half: 40, wall: null }] } } });
    const g = ground(0), c = coverLand(g, 1, new Batch(), [], { ploughed: () => 0, vines: () => 0, farm: () => styleOf('').house, own: () => true, woods: () => null });
    // the house, as a house on paved ground, in blocks two finest blocks wide
    expect(c.houses!.slice(0, 4)).toEqual([135, 85, 139, 88]);
    for (let z = 85; z < 88; z++) for (let x = 135; x < 139; x++) expect([c.has[z * N + x], g.mat[z * N + x]], `${x}, ${z}`).toEqual([0, Mat.Paved]);
    // three finest blocks round it are paved: the blocks of which half lies that near, so not those at its corners
    let paved = 0;
    for (let z = 80; z < 120; z++) for (let x = 130; x < 170; x++) {
      const i = z * N + x, near = x >= 133 && x <= 140 && z >= 83 && z <= 89 && !((x === 133 || x === 140) && (z === 83 || z === 89));
      paved += c.town[i];
      expect(c.town[i] === 1, `${x}, ${z}`).toBe(near);
      if (!near) expect(g.mat[i], `${x}, ${z}`).toBe(Mat.Grass);
    }
    expect(paved).toBe(8 * 7 - 4);
  });
  it('keeps the houses that the plan lists in a piece after the town\'s', () => {
    usePlan({ pieceBlocks: 200, greatKinds: [], pieces: { '1,0': { houses: [], towns: [{ site: 0, cx: 300, cz: 190, half: 40, wall: null }] }, '1,1': { houses: [290, 204, 8, 6, 2, 60, 0xffffff, 0xff0000, 0] } } });
    const cover = (step: number) => coverLand(ground(0), step, new Batch(), [], { ploughed: () => 0, vines: () => 0, farm: () => styleOf('').house, own: () => true, woods: () => null });
    // as a house where houses are drawn as houses
    expect(cover(1).houses!.slice(0, 4)).toEqual([145, 102, 149, 105]);
    // as the block it lies on farther out
    expect(cover(4).kind![12 * N + 18]).toBe(1);
  });
  it('lays no field within its wall nor two blocks round it, where the finest step lays none, and one without a wall has them', () => {
    // all the land under the plough; the town's square is 258 … 342 × 158 … 242 with the two blocks round it, the columns 129 … 170 × 79 … 120
    const fields = (wall: [] | null) => {
      usePlan({ pieceBlocks: 200, greatKinds: [], pieces: { '1,1': { houses: [], towns: [{ site: 0, cx: 300, cz: 200, half: 40, wall }] } } });
      const c = coverLand(ground(0), 1, new Batch(), [], { ploughed: () => 1, vines: () => 0, farm: () => styleOf('').house, own: () => true, woods: () => null });
      let inside = 0, outside = 0;
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        const kind = c.kind![z * N + x];
        if (kind < 4 || kind > 7) continue;
        if (x >= 129 && x <= 170 && z >= 79 && z <= 120) inside++;
        else outside++;
      }
      return { inside, outside };
    };
    const walled = fields([]), open = fields(null);
    expect(walled.inside).toBe(0);
    expect(walled.outside).toBeGreaterThan(N * N * 0.3);
    expect(open.inside).toBeGreaterThan(42 * 42 * 0.3);
  });

  it('paves the streets of its register at the first far step, as the finest step does, also beyond its square', () => {
    usePlan({ pieceBlocks: 200, greatKinds: [], pieces: { '1,1': { houses: [], towns: [{ site: 0, cx: 300, cz: 200, half: 40, wall: null }] } } });
    // a street through its middle from 142 metres west to 142 metres east: 71 finest blocks to each side, where its square reaches 40
    const site: Site = { id: 0, at: [150.5, 100.5], size: 3, pop: 2000, region: 'italy', style: styleOf('italy'), lots: { w: 8, d: 16, x: [], z: [], front: [], streets: [[-140, 0, 140, 0, 1]], street: 4 } };
    const c = coverLand(ground(0), 1, new Batch(), [site], { ploughed: () => 0, vines: () => 0, farm: () => styleOf('').house, own: () => true, woods: () => null });
    // its columns at the first far step: 115 … 184 in the rows 99 and 100 (finest blocks 199 and 200)
    let street = 0, off = 0;
    for (let x = 115; x < 185; x++) { street += c.town[99 * N + x] + c.town[100 * N + x]; off += c.town[90 * N + x]; }
    expect(street).toBe(2 * 70);
    expect(off).toBe(0);
  });

  it('grows no tree within its wall nor two blocks round it at any far step, where the finest step grows none', () => {
    // all the land under woods; the town's square is 258 … 342 × 158 … 242 with the two blocks round it
    const trees = (step: number, wall: [] | null) => {
      usePlan({ pieceBlocks: 200, greatKinds: [], pieces: { '1,1': { houses: [], towns: [{ site: 0, cx: 300, cz: 200, half: 40, wall }] } } });
      const c = coverLand(ground(0), step, new Batch(), [], { ploughed: () => 0, vines: () => 0, farm: () => styleOf('').house, own: () => true, woods: () => ({ share: 1, crowns: LEAVES, tall: false }) });
      const w = 2 ** step, on = (v: number, lo: number, hi: number) => (v + 0.5) * w >= lo && (v + 0.5) * w < hi;
      let inside = 0;
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (on(x, 258, 342) && on(z, 158, 242) && (step === 1 ? c.trees?.[(z * N + x) * 2] : c.kind![z * N + x] >= 8)) inside++;
      return inside;
    };
    for (const step of [1, 2, 3]) {
      expect(trees(step, []), `step ${step}`).toBe(0);
      expect(trees(step, null), `step ${step}`).toBeGreaterThan(0);
    }
  });
});

describe('a monument', () => {
  const model = { build: () => new Batch(), w: 12, d: 10, height: 8 }, farm = () => ({ region: '', style: styleOf('') });
  /** a lake of 80 × 80 blocks from (100, 100) with an island of 8 × 8 in its middle */
  const lagoon = (): Ground => {
    const g = ground(0);
    for (let z = 100; z < 180; z++) for (let x = 100; x < 180; x++) g.wet[z * N + x] = x >= 136 && x < 144 && z >= 136 && z < 144 ? 0 : 1;
    return g;
  };
  const wetIn = (g: Ground, x0: number, z0: number, x1: number, z1: number) => { let n = 0; for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) n += g.wet[z * N + x]; return n; };

  it('stands at its place on ground made for it, where its place is an island too small for it', () => {
    const g = lagoon(), counts: Record<string, number> = {}, before = wetIn(g, 100, 100, 180, 180);
    const { used } = settle(g, new Batch(), [], [{ id: 1, at: [140.5, 140.5], model }], farm, () => 0, () => 0, counts);
    expect(counts.monument).toBe(1);
    // its footprint, with the column round it, is dry and paved, and the lake beyond is as it was
    expect(wetIn(g, 133, 134, 147, 146)).toBe(0);
    for (let z = 135; z < 145; z++) for (let x = 134; x < 146; x++) { expect(used[z * N + x]).toBe(1); expect(g.h[z * N + x]).toBe(LAND_Y); }
    expect(g.mat[134 * N + 133]).toBe(Mat.Paved);
    expect(before - wetIn(g, 100, 100, 180, 180)).toBe(14 * 12 - 64);
  });

  it('stands beside another on the ground made for that one', () => {
    const g = lagoon(), counts: Record<string, number> = {}, tower = { build: () => new Batch(), w: 3, d: 3, height: 20 };
    const { used } = settle(g, new Batch(), [], [{ id: 1, at: [140.5, 140.5], model }, { id: 2, at: [140.5, 147.5], model: tower }], farm, () => 0, () => 0, counts);
    expect(counts.monument).toBe(2);
    // at its place, a column of the first one's made ground between them
    for (let z = 146; z < 149; z++) for (let x = 139; x < 142; x++) { expect(used[z * N + x]).toBe(1); expect(g.wet[z * N + x]).toBe(0); }
    expect(used[145 * N + 140]).toBe(0); expect(g.wet[145 * N + 140]).toBe(0);
  });

  it('is left out in open water, and leaves dry ground as it is', () => {
    const g = lagoon(), counts: Record<string, number> = {};
    settle(g, new Batch(), [], [{ id: 1, at: [115.5, 115.5], model }, { id: 2, at: [300.5, 300.5], model }], farm, () => 0, () => 0, counts);
    expect(counts['monument dropped']).toBe(1); expect(counts.monument).toBe(1);
    expect(wetIn(g, 100, 100, 180, 180)).toBe(80 * 80 - 64);
    expect(g.mat[300 * N + 300]).toBe(Mat.Grass);
  });
});

describe('the houses of the near view', () => {
  /** a town and a village that build as Venice does, and a town that has no fine blocks yet, where they lie in the world */
  const places: [number, number, number, number | null, string][] = [[300, 200, 4, 60000, 'italy'], [240, 110, 1, null, 'italy'], [330, 300, 3, 20000, '']];
  const laid = (ox: number) => {
    const things = new Batch(), sites: Site[] = places.map(([x, z, size, pop, region], id) => ({ id, at: [x - ox + 0.5, z + 0.5], size, pop, region, style: styleOf(region) }));
    const { lots } = settle(ground(ox), things, sites, [], () => ({ region: '', style: styleOf('') }), () => 0, () => 0, {});
    return { things, lots };
  };
  const key = (l: Lot, ox: number) => [l.x + ox, l.z, l.w, l.d, l.y, l.floors, l.seed, l.front, l.region].join(' ');

  it('stand on the same lots on every ground that covers them', () => {
    const a = laid(0), b = laid(200), shared = (l: Lot, ox: number) => l.x + ox >= 230 && l.x + ox < 370;
    const here = a.lots.filter((l) => shared(l, 0)).map((l) => key(l, 0)).sort(), there = b.lots.filter((l) => shared(l, 200)).map((l) => key(l, 200)).sort();
    expect(here.length).toBeGreaterThan(20);
    expect(here).toEqual(there);
    // only the houses that have fine blocks are kept apart; the others stand among the things
    expect(a.lots.every((l) => l.region === 'italy')).toBe(true);
    expect(a.things.triangles).toBeGreaterThan(0);
  }, 60000);

  it('are the far houses again, from their fine blocks', () => {
    const top = (b: Batch) => { let y = -Infinity; for (let i = 1; i < b.pos.length; i += 3) y = Math.max(y, b.pos[i]); return y; };
    for (const l of laid(0).lots.slice(0, 12)) {
      const far = new Batch(), near = new Batch();
      raise(far, l, 0); raise(near, l, 1);
      expect(near.triangles).toBeGreaterThan(far.triangles * 5);
      // both stay under the height the settlement keeps clear over the lot, and are about as tall
      for (const b of [far, near]) expect(top(b) - l.y).toBeLessThanOrEqual(heightOf(styleOf(l.region), l.w, l.d, l.floors) + 1e-6);
      expect(Math.abs(top(far) - top(near))).toBeLessThan(1);
    }
  }, 60000);
});

describe('the ground of the near view', () => {
  /** the meadow with its lake (world blocks 250 to 270 by 150 to 170), paved from 230 to 290 by 140 to 180 */
  const town = (ox: number) => {
    const g = ground(ox);
    for (let z = 140; z < 180; z++) for (let x = 0; x < N; x++) if (x + ox >= 230 && x + ox < 290 && !g.wet[z * N + x]) g.mat[z * N + x] = Mat.Paved;
    return g;
  };
  /** the fine ground of the cell at world block (wx, z) of a ground starting at (ox, 0) */
  const cell = (ox: number, wx: number, z: number) => {
    const b = new Batch(), columns = columnsOf(town(ox), wx - ox, z, 25, 'italy');
    if (columns) pave(b, columns);
    return b;
  };
  const span = (b: Batch, axis: number) => { let lo = Infinity, hi = -Infinity; for (let i = axis; i < b.pos.length; i += 3) { lo = Math.min(lo, b.pos[i]); hi = Math.max(hi, b.pos[i]); } return [lo, hi]; };

  it('is built only where a cell has paved ground', () => {
    expect(columnsOf(town(0), 100, 300, 25, 'italy')).toBeNull();
    expect(cell(0, 100, 300).triangles).toBe(0);
    expect(cell(0, 250, 150).triangles).toBeGreaterThan(0);
  });

  it('stays within its cell and over the whole blocks it lies on', () => {
    const b = cell(0, 250, 150), [x0, x1] = span(b, 0), [z0, z1] = span(b, 2);
    expect(x0).toBeGreaterThanOrEqual(250); expect(x1).toBeLessThanOrEqual(275);
    expect(z0).toBeGreaterThanOrEqual(150); expect(z1).toBeLessThanOrEqual(175);
    // a pane over the paving, a mooring post on it: under a block over the ground
    expect(span(b, 1)[1]).toBeLessThan(LAND_Y + 1);
  });

  it('has a quay wall where the paving meets the water, and none along a meadow', () => {
    // the lake's east shore lies in the cell from 250; the cell from 275 has the paving's edge to the meadow at 290
    expect(span(cell(0, 250, 150), 1)[0]).toBeLessThan(SEA_Y);
    const dry = cell(0, 275, 150);
    expect(dry.triangles).toBeGreaterThan(0);
    expect(span(dry, 1)[0]).toBeGreaterThanOrEqual(LAND_Y);
  });

  it('comes out the same on every ground that covers it', () => {
    const a = cell(0, 250, 150), b = cell(200, 250, 150);
    expect(a.triangles).toBe(b.triangles);
    for (let i = 0; i < a.pos.length; i++) expect(a.pos[i] - b.pos[i]).toBeCloseTo(i % 3 === 0 ? 200 : 0, 6);
    expect(a.col).toEqual(b.col);
  });

  it('lays no paving under a house, and costs a cell less than a great house of fine blocks', () => {
    // a cell paved all over is the most ground a cell can have: the near view's budget is counted in houses
    const g = ground(0);
    for (let i = 0; i < N * N; i++) if (!g.wet[i]) g.mat[i] = Mat.Paved;
    const all = new Batch(), built = new Batch();
    pave(all, columnsOf(g, 300, 300, 25, 'italy')!);
    pave(built, columnsOf(g, 300, 300, 25, 'italy', [{ x: 295, z: 305, w: 15, d: 10 }])!);
    expect(all.triangles).toBeLessThan(16000);
    // ten by ten columns of the house lie in the cell
    expect(built.triangles).toBeLessThan(all.triangles * (1 - 90 / 625));
    expect(built.triangles).toBeGreaterThan(all.triangles * (1 - 110 / 625));
  });
});
