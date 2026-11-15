// Properties the map mode of the world must keep: whatever tiles have arrived, the picture is covered exactly once
// (no hole, nothing drawn twice); the rules of the view change smoothly with its width; and the painted map shows
// sea, land, snow and realms where they are.
import { describe, expect, it } from 'vitest';
import { seeded } from '../../src/lookprobe/batch';
import { OPEN_WATER } from '../../src/lookprobe/terrain';
import { Land } from '../../src/worldprobe/climate';
import { paintLand, paintRealms, realmNames } from '../../src/worldprobe/paint';
import { cover, keyOf } from '../../src/worldprobe/pyramid';
import { type Region, Water, latOf } from '../../src/worldprobe/region';
import { COARSEST, FARTHEST, NEAREST, creasesOf, elevationOf, paperLevelOf, paperOf, realmsOf, reliefOf, stepOf } from '../../src/worldprobe/zoom';

describe('pyramid', () => {
  interface T { level: number; x: number; y: number }
  const TOP = 4, WORLD = 2 ** TOP;
  /** a picture (x0, y0, x1, y1) in tiles of level 0, and what is held: the top and a random share of the rest */
  const sample = (seed: number) => {
    const r = seeded(seed), x0 = r.range(0, WORLD - 2), y0 = r.range(0, WORLD - 2), view = [x0, y0, x0 + r.range(0.5, 6), y0 + r.range(0.5, 4)] as const;
    const held = new Map<string, T>([[keyOf(TOP, 0, 0), { level: TOP, x: 0, y: 0 }]]), share = r.range(0.1, 0.95);
    for (let l = 0; l < TOP; l++) for (let y = 0; y < WORLD >> l; y++) for (let x = 0; x < WORLD >> l; x++) if (r.chance(share)) held.set(keyOf(l, x, y), { level: l, x, y });
    const inView = (l: number, x: number, y: number) => x * 2 ** l < view[2] && (x + 1) * 2 ** l > view[0] && y * 2 ** l < view[3] && (y + 1) * 2 ** l > view[1];
    return { r, view, held, inView };
  };

  it('covers every point of the picture exactly once, whatever is held', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { r, view, held, inView } = sample(seed), want = Math.floor(r.range(0, TOP));
      const shown = [...cover(want, TOP, [[0, 0]], (l, x, y) => held.get(keyOf(l, x, y)), inView)];
      for (let k = 0; k < 50; k++) {
        const px = r.range(view[0], Math.min(WORLD, view[2])), py = r.range(view[1], Math.min(WORLD, view[3]));
        expect(shown.filter((t) => Math.floor(px / 2 ** t.level) === t.x && Math.floor(py / 2 ** t.level) === t.y).length, `seed ${seed}`).toBe(1);
      }
    }
  });

  it('shows the wanted level alone once all of it is there, and nothing outside the picture', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { held, inView } = sample(seed), want = seed % TOP;
      for (let y = 0; y < WORLD >> want; y++) for (let x = 0; x < WORLD >> want; x++) held.set(keyOf(want, x, y), { level: want, x, y });
      const shown = [...cover(want, TOP, [[0, 0]], (l, x, y) => held.get(keyOf(l, x, y)), inView)];
      expect(shown.length).toBeGreaterThan(0);
      for (const t of shown) { expect(t.level).toBe(want); expect(inView(t.level, t.x, t.y)).toBe(true); }
    }
  });
});

describe('zoom', () => {
  const widths: number[] = [];
  for (let w = NEAREST; w <= FARTHEST; w *= 1.01) widths.push(w);

  it('changes every rule smoothly and in one direction as the view widens', () => {
    const rules: [string, (w: number) => number, number][] = [['elevation', elevationOf, 1], ['paper', paperOf, 1], ['realms', realmsOf, 1], ['creases', creasesOf, -1]];
    for (const [name, rule, way] of rules) for (let k = 1; k < widths.length; k++) {
      const a = rule(widths[k - 1]), b = rule(widths[k]), span = name === 'elevation' ? 90 : 1;
      expect((b - a) * way, `${name} at ${widths[k]}`).toBeGreaterThanOrEqual(-1e-9);
      expect(Math.abs(b - a) / span, `${name} at ${widths[k]}`).toBeLessThan(0.03);
    }
  });

  it('draws the land at the same height on both sides of a change of step', () => {
    // a step's blocks are built flatter by 2^0.6 than those of the finer step (world.ts)
    for (let k = 1; k < widths.length; k++) {
      const a = stepOf(widths[k - 1]), b = stepOf(widths[k]);
      if (a !== b) expect(reliefOf(widths[k], b) / 2 ** (0.6 * b) / (reliefOf(widths[k - 1], a) / 2 ** (0.6 * a))).toBeCloseTo(2 ** -1, 1);
    }
  });

  it('has laid the world flat under a camera looking straight down before the map stands alone', () => {
    const alone = widths.find((w) => paperOf(w) >= 1)!;
    expect(elevationOf(alone)).toBeGreaterThan(89);
    expect(reliefOf(alone, stepOf(alone))).toBeLessThan(0.1);
    expect(creasesOf(widths.find((w) => paperOf(w) > 0)!)).toBeLessThan(0.01);
    expect(stepOf(alone)).toBe(COARSEST);
    expect(realmsOf(alone)).toBe(0);
  });

  it('paints the map at about a dot to a pixel', () => {
    for (const w of widths) for (const pixels of [800, 1672, 2560]) {
      const dot = (2 ** paperLevelOf(w, pixels) * pixels) / w;
      if (paperLevelOf(w, pixels) > 0) expect(dot).toBeLessThanOrEqual(1.5);
      if (paperLevelOf(w, pixels) < 6) expect(dot).toBeGreaterThanOrEqual(0.7);
    }
  });
});

describe('painted map', () => {
  const W = 16;
  /** a tile at the latitude of the Alps: sea in the west, plains, and a mountain of 4000 m in the east */
  const region = (): Region => {
    const r: Region = { w: W, h: W, x0: 3000, y0: 1900, cells: 4, mapW: 6144, mapH: 5296, lon0: -100, lon1: 70, latN: 72, latS: -38, shaped: new Int16Array(W * W), drainage: new Uint8Array(W * W), water: new Uint8Array(W * W), forest: new Uint8Array(W * W), crops: new Uint8Array(W * W), rivers: [] };
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { r.water[y * W + x] = x < 4 ? Water.Sea : Water.Land; r.shaped[y * W + x] = x < 4 ? 0 : x > 11 ? 4000 : 200; }
    return r;
  };
  const climate = { w: 3072, h: 2648, cells: new Uint8Array(3072 * 2648).fill(Land.Temperate | 128) };
  const dot = (p: Uint8ClampedArray, x: number, y: number) => [...p.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)];

  it('paints sea, meadow and snow, and lets the realms colour the land alone', () => {
    const p = paintLand(region(), climate, 0), sea = dot(p, 1, 8), meadow = dot(p, 8, 8), snow = dot(p, 14, 8);
    const srgb = (v: number) => Math.round(255 * (1.055 * v ** (1 / 2.4) - 0.055));
    expect(sea.slice(0, 3)).toEqual(OPEN_WATER.map(srgb));
    expect(meadow[1]).toBeGreaterThan(meadow[2] + 40);
    expect(Math.min(...snow.slice(0, 3))).toBeGreaterThan(230);
    expect([sea[3], meadow[3], snow[3]]).toEqual([0, 255, 255]);
  });

  it('draws a river and a town where they are', () => {
    const plain = paintLand(region(), climate, 0), r = region();
    r.rivers = [{ name: 'test', rank: 1, pts: [[6.5, 0], [6.5, 16]] }];
    const p = paintLand(r, climate, 0, [{ lon: -100 + ((r.x0 + 9.5 / r.cells) / r.mapW) * 170, lat: latOf(r, 13), size: 3 }]);
    // the river is bluer than the meadow it crosses, and the meadow beside it is as it was
    expect(dot(p, 6, 2)[2]).toBeGreaterThan(dot(plain, 6, 2)[2] + 40);
    expect(dot(p, 9, 2)).toEqual(dot(plain, 9, 2));
    expect(dot(p, 6, 2)[3]).toBeLessThan(100);
    // the town is a mark in the red of its roofs
    expect(dot(p, 9, 13)[0]).toBeGreaterThan(dot(plain, 9, 13)[0] + 40);
    expect(dot(p, 9, 13)[0]).toBeGreaterThan(dot(p, 9, 13)[1] + 40);
  });

  // two realms of 8 × 16 map pixels side by side, a strip of land without a realm and water to the east
  const ids = new Uint16Array(32 * 16), owner = [0, 1, -1];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) ids[y * 32 + x] = x < 8 ? 1 : x < 16 ? 2 : x < 24 ? 3 : 4;
  const realms = { ids, w: 32, h: 16, owner, colors: [[1, 0, 0], [0, 0, 1]] as const };

  it('colours the realms, draws the line between them and leaves the rest alone', () => {
    const p = paintRealms(realms, 0, 0, 0, 64, 2), at = (x: number, y: number) => [...p.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];
    const inside = at(6, 10), edge = at(15, 10), other = at(24, 10);
    expect(inside[0]).toBeGreaterThan(150); expect(inside[2]).toBe(0); expect(inside[3]).toBeGreaterThan(150);
    expect(edge[3]).toBeGreaterThan(inside[3]); expect(edge[0]).toBeLessThan(inside[0]);
    expect(other[2]).toBeGreaterThan(150); expect(other[0]).toBe(0);
    // the edge towards the land without a realm is a line too, the land itself and the water are clear
    expect(at(31, 10)[3]).toBeGreaterThan(inside[3]);
    expect(at(40, 10)).toEqual([0, 0, 0, 0]); expect(at(60, 10)).toEqual([0, 0, 0, 0]);
    // colour times cover never exceeds the cover
    for (let i = 0; i < p.length; i += 4) expect(Math.max(p[i], p[i + 1], p[i + 2])).toBeLessThanOrEqual(p[i + 3]);
  });

  it('finds where a realm lies and how', () => {
    const names = realmNames(realms, 1), first = names.find((n) => n.realm === 0)!;
    expect(names.length).toBe(2);
    expect(first.x).toBeCloseTo(4, 0); expect(first.y).toBeCloseTo(8, 0);
    // 8 wide and 16 tall: it lies north to south
    expect(Math.abs(Math.abs(first.turn) - Math.PI / 2)).toBeLessThan(0.01);
    expect(first.long).toBeGreaterThan(first.broad * 1.5);
  });
});
