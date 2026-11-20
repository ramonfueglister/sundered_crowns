import { describe, expect, it } from 'vitest';
import { FINER_STEPS, cellOfBlock } from '../../src/worldprobe/land';
import { type Region } from '../../src/worldprobe/region';
import { buildWorld, windowOf } from '../../src/worldprobe/world';

describe('a river', () => {
  // A land that falls to the east, two metres a cell, with a ridge of 250 m across it. A river runs down it, from west
  // to east; its bed falls with the land and is cut through the ridge, and falls twice as fast in the east.
  const height = (u: number) => 1000 - 2 * u + (u > 0 && u < 12 ? 250 : 0),
    bed = (u: number) => (u < 60 ? 1000 - 2 * u : 880 - 4 * (u - 60));
  /** the cell row of the river, the cells of its points and the cells between two heights of its bed */
  const ROW = 280,
    POINTS = [-180, -80, 20, 120, 220],
    EVERY = 10;
  /** the window of the land that the ground at (ox, oz) needs, with the river */
  const land = (ox: number, oz: number, bedded = true): Region => {
    const w = windowOf(ox, oz),
      n = w.w * w.h;
    const r: Region = {
      w: w.w,
      h: w.h,
      x0: w.gx0 / 4,
      y0: w.gy0 / 4,
      cells: 4,
      mapW: 6144,
      mapH: 5296,
      lon0: -100,
      lon1: 70,
      latN: 72,
      latS: -38,
      shaped: new Int16Array(n),
      drainage: new Uint8Array(n),
      water: new Uint8Array(n),
      forest: new Uint8Array(n),
      crops: new Uint8Array(n),
      rivers: [],
    };
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) r.shaped[y * w.w + x] = height(x + w.gx0 + 0.5);
    const river: Region['rivers'][number] = {
      name: 'river',
      rank: 3,
      pts: POINTS.map((u) => [u - w.gx0, ROW - w.gy0]),
    };
    if (bedded) {
      river.bed = POINTS.map(bed);
      river.mid = POINTS.slice(0, -1).map((u, k) => [
        k,
        ...Array.from({ length: (POINTS[k + 1] - u) / EVERY - 1 }, (_, j) => bed(u + (j + 1) * EVERY)),
      ]);
    }
    r.rivers.push(river);
    return r;
  };
  /** the river's water over the world's blocks 100 to 300 each way, as the ground at (ox, oz) shows it: the height of every column of water, by its place in the world */
  const water = (ox: number, oz: number, bedded = true) => {
    const part = { x0: 100 - ox, z0: 100 - oz, x1: 300 - ox, z1: 300 - oz };
    const scene = buildWorld(land(ox, oz, bedded), { ox, oz, part }, [], [], true, FINER_STEPS) as never as {
      raised: { pos: number[] };
    };
    const tops = new Map<string, number>(),
      pos = scene.raised.pos;
    for (let t = 0; t < pos.length; t += 9) {
      if (pos[t + 4] !== pos[t + 1] || pos[t + 7] !== pos[t + 1]) continue;
      tops.set(
        `${Math.floor((pos[t] + pos[t + 3] + pos[t + 6]) / 3) + ox},${Math.floor((pos[t + 2] + pos[t + 5] + pos[t + 8]) / 3) + oz}`,
        pos[t + 1],
      );
    }
    return tops;
  };
  /** the highest water in every stretch of eight cells down the river, from west to east */
  const profile = (tops: Map<string, number>) => {
    const by = new Map<number, number>();
    for (const [at, y] of tops) {
      const [x, z] = at.split(',').map(Number),
        stretch = Math.floor(cellOfBlock(x + 0.5, z + 0.5)[0] / 8);
      by.set(stretch, Math.max(by.get(stretch) ?? -Infinity, y));
    }
    return [...by].sort((a, b) => a[0] - b[0]).map(([, y]) => y);
  };

  it('lies as high on every ground that covers it', () => {
    const a = water(0, 0),
      b = water(-60, 40);
    expect(a.size).toBeGreaterThan(200);
    expect([...b].sort()).toEqual([...a].sort());
  }, 60000);

  it('lies at its bed: it never rises on its way down and is cut through the ridge in its way', () => {
    const down = profile(water(0, 0));
    expect(down.length).toBeGreaterThan(20);
    for (let k = 1; k < down.length; k++) expect(down[k], `stretch ${k}`).toBeLessThanOrEqual(down[k - 1]);
    // from one end of the ground's part to the other the bed falls by more than three blocks of 165 m
    expect(down[0] - down[down.length - 1]).toBeGreaterThanOrEqual(3);
  }, 60000);

  it('without a bed lies on its valley floor, over the ridge', () => {
    const down = profile(water(0, 0, false));
    expect(down.some((y, k) => k > 0 && y > down[k - 1])).toBe(true);
  }, 60000);
});
