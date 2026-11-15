// Properties the world must keep to be one world: it goes round the globe and begins again where it ended, and what
// stands on its land from farther away comes out the same on every ground that covers it, so that pieces fit together.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';
import { LEAVES } from '../../src/lookprobe/blocks';
import { type Ground, LAND_Y, Mat, N, SEA_Y } from '../../src/lookprobe/layout';
import { styleOf } from '../../src/buildings';
import { coverLand } from '../../src/worldprobe/far';
import { cellOf, loadWindow, projectionOf } from '../../src/worldprobe/region';
import type { Site } from '../../src/worldprobe/settle';

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
      const name = url.split('/').pop()!, tx = Number(name.split('_')[0]);
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
});

describe('the land from farther away', () => {
  /** a level meadow with a lake, starting at world block (ox, 0) */
  const ground = (ox: number): Ground => {
    const g: Ground = { h: new Int16Array(N * N).fill(LAND_Y), mat: new Uint8Array(N * N).fill(Mat.Grass), wet: new Uint8Array(N * N), shore: new Uint8Array(N * N), occ: new Float32Array(N * N).fill(LAND_Y), surf: new Float32Array(N * N).fill(SEA_Y), ox, oz: 0 };
    for (let z = 150; z < 170; z++) for (let x = 0; x < N; x++) if (x + ox >= 250 && x + ox < 270) g.wet[z * N + x] = 1;
    return g;
  };
  const style = styleOf('');
  /** a city, a small town and a village, where they lie in the world */
  const places: [number, number, number, number | null][] = [[300, 200, 4, 20000], [285, 110, 2, null], [330, 270, 1, null], [310, 150, 3, 4000]];
  const laid = (ox: number, step: number) => {
    const g = ground(ox), sites: Site[] = places.map(([x, z, size, pop], id) => ({ id, at: [x - ox + 0.5, z + 0.5], size, pop, style }));
    return coverLand(g, step, new Batch(), sites, {
      cultivated: (x, z) => (Math.floor((x + ox) / 40) + Math.floor(z / 40)) % 2 ? 0.7 : 0.2, vines: () => 0.2, farm: () => style.house, own: () => true,
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

  it('stands lower step by step, until it is only the colour of the ground', () => {
    // from the step at which the great buildings too are part of the ground
    const tallest = [3, 4, 5, 6].map((step) => laid(0, step).rise.reduce((m, v) => Math.max(m, v), 0));
    for (let k = 1; k < tallest.length; k++) expect(tallest[k]).toBeLessThanOrEqual(tallest[k - 1]);
    expect(tallest[0]).toBeGreaterThan(0);
    expect(tallest[3]).toBe(0);
  }, 60000);
});
