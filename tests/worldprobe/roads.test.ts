// The ways at the finest step (worldprobe/roads.ts): the line of the map relaxed into a curve, the ways that cross a
// window, the path a way finds over the columns of a ground between its pins, and the distance to a way's band.
import { describe, expect, it } from 'vitest';
import { onGrid } from '../../src/lookprobe/layout';
import { type Road, relaxPoints, roadOn, roadsIn, wayOnGround } from '../../src/worldprobe/roads';

/** the side of the grounds here, and the world blocks between two pins of a way (roads.ts PIN) */
const SIDE = 96,
  PIN = 24;

/** a ground of SIDE blocks a side: per column its top, whether it is rock, whether it is water (2: the sea) */
function ground(top: (x: number, z: number) => number = () => 0) {
  const h = new Int16Array(SIDE * SIDE),
    rock = new Uint8Array(SIDE * SIDE),
    wet = new Uint8Array(SIDE * SIDE);
  for (let z = 0; z < SIDE; z++) for (let x = 0; x < SIDE; x++) h[z * SIDE + x] = top(x, z);
  const fill = (a: Uint8Array, x0: number, z0: number, x1: number, z1: number, v: number) => {
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) a[z * SIDE + x] = v;
  };
  return { h, rock, wet, fill };
}
type Ground = ReturnType<typeof ground>;
const way = (g: Ground, pts: [number, number][], ox = 0, oz = 0) =>
  wayOnGround(pts, ox, oz, SIDE, g.h, (i) => g.rock[i] === 1, g.wet);
/** whether each point of a path is one of the eight columns about the one before */
const stepsByColumns = (path: [number, number][]) =>
  path.every(([x, z], k) => k === 0 || (Math.abs(x - path[k - 1][0]) <= 1 && Math.abs(z - path[k - 1][1]) <= 1));
/** the points of a path on the columns `a` marks */
const on = (path: [number, number][], a: Uint8Array) =>
  path.filter(([x, z]) => a[Math.floor(z) * SIDE + Math.floor(x)]);

describe('a line relaxed into a curve', () => {
  it('leaves a line of two points as it is', () => {
    const pts: [number, number][] = [
      [1, 2],
      [7, 3],
    ];
    const out = relaxPoints(pts, 1.5, 0.5);
    expect(out).toEqual(pts);
    expect(out[0]).not.toBe(pts[0]);
  });

  it('lays a straight line out evenly and keeps it straight', () => {
    const out = relaxPoints(
      [
        [0, 0],
        [4, 0],
        [10, 0],
      ],
      1.5,
      0.5,
    );
    expect(out).toHaveLength(21);
    out.forEach(([x, z], k) => {
      expect(x).toBeCloseTo(k * 0.5, 9);
      expect(z).toBeCloseTo(0, 9);
    });
  });

  it('rounds a corner within the corner, the same on both sides of it, and keeps its ends where they are', () => {
    const out = relaxPoints(
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      1.5,
      0.5,
    );
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([10, 10]);
    // every point is a mean of points of the line, so it lies in the triangle the line spans
    for (const [x, z] of out) {
      expect(z).toBeGreaterThanOrEqual(-1e-9);
      expect(x).toBeLessThanOrEqual(10 + 1e-9);
      expect(z).toBeLessThanOrEqual(x + 1e-9);
    }
    // the corner itself is cut
    expect(Math.min(...out.map(([x, z]) => Math.hypot(x - 10, z)))).toBeGreaterThan(0.3);
    // the line is its own mirror image across the corner's diagonal, and so is the curve
    out.forEach(([x, z], k) => {
      const [mx, mz] = out[out.length - 1 - k];
      expect(10 - z).toBeCloseTo(mx, 9);
      expect(10 - x).toBeCloseTo(mz, 9);
    });
  });
});

describe('the ways across a window of the map', () => {
  const road = (x0: number, y0: number, x1: number, y1: number): Road => ({
    k: 0,
    p: Float32Array.from([x0, y0, x1, y1]),
    x0,
    y0,
    x1,
    y1,
  });
  it('are those whose bounds reach into it, up to its far edge but not on it', () => {
    const inside = road(12, 12, 14, 14),
      across = road(0, 15, 40, 16),
      left = road(0, 0, 9, 30),
      onNear = road(0, 10, 10, 11),
      onFar = road(20, 10, 25, 11);
    expect(roadsIn([inside, across, left, onNear, onFar], 10, 10, 20, 20)).toEqual([inside, across, onNear]);
  });
});

describe('a way at the finest step', () => {
  it('runs straight over open level ground, from column to column', () => {
    const path = way(ground(), [
      [10.5, 40.5],
      [80.5, 40.5],
    ]);
    expect(path[0]).toEqual([10.5, 40.5]);
    expect(path[path.length - 1]).toEqual([80.5, 40.5]);
    expect(path).toHaveLength(71);
    expect(stepsByColumns(path)).toBe(true);
    expect(path.every(([, z]) => z === 40.5)).toBe(true);
  });

  it('goes round a hill and round rock between its pins, where the way round is short', () => {
    for (const kind of ['hill', 'rock'] as const) {
      const g = ground((x, z) => (kind === 'hill' && x >= 30 && x < 40 && z >= 37 && z < 44 ? 3 : 0)),
        hill = new Uint8Array(SIDE * SIDE);
      g.fill(hill, 30, 37, 40, 44, 1);
      if (kind === 'rock') g.fill(g.rock, 30, 37, 40, 44, 1);
      const path = way(g, [
        [10.5, 40.5],
        [80.5, 40.5],
      ]);
      expect(stepsByColumns(path), kind).toBe(true);
      expect(on(path, hill), kind).toEqual([]);
      expect(path[path.length - 1]).toEqual([80.5, 40.5]);
    }
  });

  it('crosses a river on a bridge, where the way round is long, and goes round a pond, where it is short', () => {
    const line: [number, number][] = [
      [10.5, 40.5],
      [80.5, 40.5],
    ];
    const river = ground();
    river.fill(river.wet, 34, 0, 37, SIDE, 1);
    const across = way(river, line);
    expect(stepsByColumns(across)).toBe(true);
    expect(on(across, river.wet).length).toBe(3);
    // a river that ends a block short of how far the way may stray (9 blocks either side of the line between the
    // pins at 24 and 48): the way round is longer by more than a bridge costs
    const long = ground();
    long.fill(long.wet, 35, 32, 36, 49, 1);
    expect(on(way(long, line), long.wet).length).toBe(1);
    const pond = ground();
    pond.fill(pond.wet, 35, 40, 36, 41, 1);
    const round = way(pond, line);
    expect(stepsByColumns(round)).toBe(true);
    expect(on(round, pond.wet)).toEqual([]);
  });

  it('keeps to the line of the map where it finds no path: across the sea and where it reaches out of the ground', () => {
    // (a line off the column middles, so that its own points can be told from those of a path)
    const sea = ground();
    sea.fill(sea.wet, 34, 0, 37, SIDE, 2);
    const over = way(sea, [
      [10.25, 40.25],
      [80.25, 40.25],
    ]);
    // the stretch between the pins at 24 and 48 is the line, the stretches before and after it paths
    expect(over.filter(([x]) => x > 25 && x < 47).every(([, z]) => z === 40.25)).toBe(true);
    expect(over.filter(([x]) => x > 50).every(([x, z]) => x % 1 === 0.5 && z === 40.5)).toBe(true);
    const out = way(ground(), [
      [-5.25, 40.25],
      [60.25, 40.25],
    ]);
    expect(out[0]).toEqual([-5.25, 40.25]);
    expect(out[out.length - 1]).toEqual([60.5, 40.5]);
  });

  it('lays the same path between two pins on grounds side by side', () => {
    // a hilly land, the same in world blocks under both grounds; the second ground begins a square of pins further on
    const top = (wx: number, wz: number) =>
      Math.round(3 * Math.sin(wx / 7) + 2 * Math.cos(wz / 5) + Math.sin((wx + wz) / 3));
    const a = ground((x, z) => top(x, z)),
      b = ground((x, z) => top(x + PIN, z));
    const line: [number, number][] = [
        [30.25, 40.25],
        [90.25, 52.75],
      ],
      inA = way(a, line),
      inB = way(
        b,
        line.map(([x, z]): [number, number] => [x - PIN, z]),
        PIN,
      ).map(([x, z]): [number, number] => [x + PIN, z]);
    // between the pins at world blocks 48 and 72 (on both grounds far enough from the edge to find a path)
    const between = (path: [number, number][]) => path.filter(([x]) => x % 1 === 0.5 && x > 2 * PIN && x < 3 * PIN);
    expect(between(inA).length).toBeGreaterThan(20);
    expect(between(inB)).toEqual(between(inA));
    // and the hills make it wind: it is no straight line of columns
    expect(
      new Set(between(inA).map(([x, z]) => Math.round((z - 40.25 - (x - 30.25) * (12.5 / 60)) * 4))).size,
    ).toBeGreaterThan(1);
  });
});

describe('the distance to the band of the nearest way', () => {
  it('is bilinear between the corners of the columns, and held at the edge of the ground', () => {
    const side = 8,
      edge = new Float32Array((side + 1) * (side + 1));
    for (let z = 0; z <= side; z++) for (let x = 0; x <= side; x++) edge[z * (side + 1) + x] = x + 10 * z;
    onGrid(side, () => {
      expect(roadOn(edge, 0, 0)).toBe(0);
      expect(roadOn(edge, 3.25, 7.5)).toBeCloseTo(78.25, 5);
      expect(roadOn(edge, -5, 2)).toBeCloseTo(20, 5);
      expect(roadOn(edge, side + 5, 0)).toBeCloseTo(side, 4);
    });
  });
});
