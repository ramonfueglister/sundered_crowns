// The world's window on the land's data (worldprobe/region.ts): it goes round the globe and begins again where it
// ended, and draws the land finer than the data where the data lie, the water and the rivers with it.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type Region, Water, cellOf, loadWindow, projectionOf, refine } from '../../src/worldprobe/region';

describe('round the globe', () => {
  // a world of three tiles of eight cells in a row, the last cut short to four: twenty cells round the globe, of
  // which the first sixteen are the game map (60° west to 60° east)
  const T = 8,
    ROUND = 20,
    index = {
      tile: T,
      cells: 1,
      mapW: 16,
      mapH: 8,
      lon0: -60,
      lon1: 60,
      latN: 40,
      latS: -40,
      worldW: ROUND,
      worldH: 8,
      tiles: ['0_0', '1_0', '2_0'],
    };
  /** a tile whose heights say which cell of the world they are (column of the first lap + 100 × row), with a river along its first row */
  const tile = (tx: number) => {
    const raw = new Uint8Array(T * T * 6),
      heights = new Int16Array(raw.buffer, 0, T * T);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) heights[y * T + x] = tx * T + x < ROUND ? tx * T + x + 100 * y : -1;
    return raw;
  };
  beforeAll(() => {
    vi.stubGlobal('fetch', async (url: string) => {
      const name = url.replace(/\?.*$/, '').split('/').pop()!,
        tx = Number(name.split('_')[0]);
      const body =
        name === 'index.json'
          ? JSON.stringify(index)
          : name.endsWith('.json')
            ? JSON.stringify([
                {
                  name: 'river',
                  rank: 1,
                  pts: [
                    [tx * T, 0.5],
                    [tx * T + 3, 0.5],
                  ],
                },
              ])
            : tile(tx);
      return new Response(body);
    });
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('begins again in the east where it ended in the west', async () => {
    for (const gx0 of [14, -7, 2 * ROUND + 17]) {
      const r = await loadWindow('round', gx0, 2, 12, 3);
      for (let y = 0; y < 3; y++)
        for (let x = 0; x < 12; x++)
          expect(r.shaped[y * 12 + x]).toBe(((((gx0 + x) % ROUND) + ROUND) % ROUND) + 100 * (y + 2));
    }
  });

  it('carries the rivers round with the land', async () => {
    const r = await loadWindow('round', ROUND + 14, 0, 12, 3);
    // the river of the first tile, on the lap the window lies on
    expect(r.rivers.some((v) => v.pts[0][0] === 6 && v.pts[1][0] === 9)).toBe(true);
  });

  it('finds every place on the lap round the globe on which the window lies', async () => {
    const p = await projectionOf('round'),
      [u] = p.cellOf(-55, 0);
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
    const F = 4,
      gx0 = 14,
      gy0 = 9,
      r = await loadWindow('round', gx0, gy0, 10, 5, '/', F);
    expect(r.cells).toBe(F);
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 10; x++) {
        const cx = (gx0 + x + 0.5) / F,
          cy = (gy0 + y + 0.5) / F;
        expect(r.shaped[y * 10 + x], `${x}, ${y}`).toBe(Math.round(cx - 0.5 + 100 * (cy - 0.5)));
      }
  });
});

describe('finer than the data', () => {
  // a slope of 8 by 6 cells rising to the east, with a lake of two cells in it, the sea along its east edge and a river
  const W = 8,
    H = 6,
    F = 4;
  const data = (): Region => {
    const n = W * H,
      r: Region = {
        w: W,
        h: H,
        x0: 10,
        y0: 20,
        cells: 4,
        mapW: 100,
        mapH: 100,
        lon0: -10,
        lon1: 10,
        latN: 50,
        latS: 40,
        shaped: new Int16Array(n),
        drainage: new Uint8Array(n),
        water: new Uint8Array(n),
        forest: new Uint8Array(n),
        crops: new Uint8Array(n),
        rivers: [
          {
            name: 'river',
            rank: 3,
            pts: [
              [1, 1],
              [5, 1],
            ],
          },
        ],
      };
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        r.shaped[i] = 100 * x + 10 * y;
        r.forest[i] = 30 * x;
        r.drainage[i] = x;
        if (x === W - 1) {
          r.water[i] = Water.Sea;
          r.shaped[i] = 0;
        }
      }
    for (const x of [3, 4]) {
      r.water[3 * W + x] = Water.Lake;
      r.shaped[3 * W + x] = 250;
    }
    return r;
  };
  // the finer window from the data's cell (1, 1) to their east edge and their fifth row
  const d = data(),
    f = refine(d, F, F, F, (W - 1) * F, 4 * F);
  /** the finer window's column and cell at a point of the data's cells */
  const column = (cx: number) => Math.floor(cx * F - F),
    at = (cx: number, cy: number) => Math.floor(cy * F - F) * f.w + column(cx);

  it('lies where the data lie, with four cells to each of theirs', () => {
    expect(f.cells).toBe(d.cells * F);
    for (const [lon, lat] of [
      [-3, 47],
      [1, 45],
      [6, 41],
    ]) {
      const [u, v] = cellOf(d, lon, lat),
        [fu, fv] = cellOf(f, lon, lat);
      expect(fu).toBeCloseTo(u * F - F, 6);
      expect(fv).toBeCloseTo(v * F - F, 6);
    }
  });

  it("draws the land between the data's cells", () => {
    // away from the water every cell lies on the slope the data's cells span
    for (let y = 0; y < F; y++)
      for (let x = 0; x < 4 * F; x++) {
        const cx = (F + x + 0.5) / F,
          cy = (F + y + 0.5) / F;
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
    for (const [cx, cy] of [
      [3.375, 3.375],
      [3.625, 3.625],
      [4.375, 3.375],
      [4.625, 3.625],
    ])
      expect(f.water[at(cx, cy)]).toBe(Water.Lake);
    let lake = 0;
    for (let i = 0; i < f.w * f.h; i++)
      if (f.water[i] === Water.Lake) {
        lake++;
        expect(f.shaped[i]).toBe(250);
      }
    expect(lake).toBeGreaterThanOrEqual(2 * F * F * 0.5);
    expect(lake).toBeLessThanOrEqual(2 * F * F * 1.5);
  });

  it('carries the rivers along', () => {
    expect(f.rivers[0].pts).toEqual([
      [0, 0],
      [4 * F, 0],
    ]);
  });
});
