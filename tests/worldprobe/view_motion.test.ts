// The view in motion (worldprobe/view_motion.ts): it closes on the width the wheel asked for, glides on after a drag,
// flies to a place, and goes at once where it is sent when a tool takes one picture. The pictures are driven here by
// hand, one every 16 ms.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NEAR, RIGHT } from '../../src/lookprobe/layout';
import { createMotion } from '../../src/worldprobe/view_motion';
import { NEAREST, elevationOf } from '../../src/worldprobe/zoom';

/** the picture's width on the page, and its middle */
const ACROSS = 1600,
  MIDDLE: [number, number] = [800, 450],
  FARTHEST = 100000;

let frames: FrameRequestCallback[] = [],
  clock = 0;
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f));
});
afterEach(() => {
  vi.unstubAllGlobals();
});
/** shows pictures for `ms` milliseconds or until the motion asks for none, and gives back how many it showed */
function run(ms: number): number {
  const end = clock + ms;
  let shown = 0;
  while (frames.length && clock < end) {
    const now = frames;
    frames = [];
    for (const f of now) f(clock);
    clock += 16;
    shown++;
  }
  return shown;
}

/** a view of `wide` finest blocks about (x, z), drawn flat: a point of the page lies as far from the middle on the ground as on the page, at the view's scale */
function viewAt(x: number, z: number, wide: number, still = false) {
  const place = { x, z, wide },
    seen = { looks: 0, notes: 0, moves: [] as [number, number][] };
  const offset = (px: number, py: number, across = place.wide): [number, number] => [
    ((px - MIDDLE[0]) * across) / ACROSS,
    ((py - MIDDLE[1]) * across) / ACROSS,
  ];
  const move = (right: number, near: number) => {
    seen.moves.push([right, near]);
    place.x += right * RIGHT[0] + near * NEAR[0];
    place.z += right * RIGHT[1] + near * NEAR[1];
  };
  const v: Parameters<typeof createMotion>[0] = {
    place,
    still,
    farthest: FARTHEST,
    middle: () => MIDDLE,
    offset,
    look: () => seen.looks++,
    note: () => seen.notes++,
    move,
    zoom(to, px, py) {
      const [r0, n0] = offset(px, py),
        [r1, n1] = offset(px, py, to);
      move(r0 - r1, n0 - n1);
      place.wide = to;
    },
    blockOf: (lon, lat) => [lon * 1000, lat * 1000],
  };
  /** the ground under a point of the page */
  const under = (px: number, py: number): [number, number] => {
    const [r, n] = offset(px, py);
    return [place.x + r * RIGHT[0] + n * NEAR[0], place.z + r * RIGHT[1] + n * NEAR[1]];
  };
  return { place, seen, motion: createMotion(v), under };
}
const travelled = (moves: [number, number][]) => moves.reduce((s, [r]) => s + r, 0);

describe('a view a tool takes one picture of', () => {
  it('goes at once where it is sent, within the widths a view may have', () => {
    const { place, seen, motion } = viewAt(0, 0, 1000, true);
    motion.zoomTo(2);
    expect(place.wide).toBe(2000);
    motion.zoomTo(1000);
    expect(place.wide).toBe(FARTHEST);
    motion.zoomTo(1e-9);
    expect(place.wide).toBe(NEAREST);
    motion.push(30, -20);
    expect(seen.moves.at(-1)).toEqual([30, -20]);
    motion.flyTo(4, 5, 700);
    expect(place).toEqual({ x: 4000, z: 5000, wide: 700 });
    expect([seen.looks, seen.notes]).toEqual([1, 1]);
    expect(frames).toEqual([]);
    expect(motion.toward()).toBeUndefined();
  });
});

describe('a zoom', () => {
  it('closes a share of the way on the width asked for every picture, and rests there', () => {
    const { place, motion } = viewAt(0, 0, 1000);
    motion.zoomTo(2);
    expect(motion.toward()).toMatchObject({ wide: 2000, elevation: elevationOf(2000) });
    let last = place.wide;
    for (let k = 0; k < 10; k++) {
      run(16);
      expect(place.wide).toBeGreaterThanOrEqual(last);
      last = place.wide;
    }
    expect(place.wide).toBeGreaterThan(1000);
    expect(place.wide).toBeLessThan(2000);
    run(5000);
    expect(frames).toEqual([]);
    expect(Math.abs(Math.log(place.wide / 2000))).toBeLessThanOrEqual(1e-3);
    expect(motion.toward()).toBeUndefined();
  });

  it('keeps the ground under the point it zooms about, and says beforehand where it will rest', () => {
    const { place, motion, under } = viewAt(5000, 3000, 1000),
      at: [number, number] = [1300, 200],
      ground = under(...at);
    motion.zoomTo(0.5, at);
    const to = motion.toward();
    run(5000);
    const now = under(...at);
    expect(now[0]).toBeCloseTo(ground[0], 6);
    expect(now[1]).toBeCloseTo(ground[1], 6);
    expect(to?.x).toBeCloseTo(place.x, 0);
    expect(to?.z).toBeCloseTo(place.z, 0);
  });

  it('as two fingers pinch, goes to the width at once and leaves nothing to close on', () => {
    const { place, motion } = viewAt(0, 0, 1000);
    motion.pinch(400, ...MIDDLE);
    expect(place.wide).toBe(400);
    expect(frames).toEqual([]);
    expect(motion.toward()).toBeUndefined();
  });
});

describe('a glide', () => {
  it('goes on after a drag ever slower, and ends', () => {
    const { seen, motion } = viewAt(0, 0, 1000);
    motion.carry(0.5, 0);
    run(10000);
    expect(frames).toEqual([]);
    const steps = seen.moves.map(([r]) => r).filter((r) => r > 0);
    expect(steps.length).toBeGreaterThan(50);
    for (let k = 1; k < steps.length; k++) expect(steps[k]).toBeLessThan(steps[k - 1]);
    // half a block a millisecond, losing 1/280 of it every millisecond: some 140 blocks on
    expect(travelled(seen.moves)).toBeGreaterThan(125);
    expect(travelled(seen.moves)).toBeLessThan(150);
  });

  it('comes to rest about as far on as it was pushed', () => {
    const { seen, motion } = viewAt(0, 0, 1000);
    motion.push(100, 0);
    run(10000);
    expect(travelled(seen.moves)).toBeGreaterThan(90);
    expect(travelled(seen.moves)).toBeLessThan(110);
  });

  it('stops when a pointer goes down, and nothing moves once the motion is stopped for good', () => {
    const { seen, motion } = viewAt(0, 0, 1000);
    motion.carry(0.5, 0);
    run(100);
    motion.halt();
    const moved = seen.moves.length;
    run(1000);
    expect(seen.moves.length).toBeLessThanOrEqual(moved + 1);
    expect(frames).toEqual([]);
    motion.carry(0.5, 0);
    motion.stop();
    run(1000);
    expect(seen.moves.length).toBeLessThanOrEqual(moved + 1);
  });
});

describe('a flight', () => {
  it('rises on its way to a place far off and arrives there at the width asked for', () => {
    const { place, seen, motion } = viewAt(0, 0, 1000);
    motion.flyTo(10, 0, 500);
    expect(motion.toward()).toEqual({ x: 10000, z: 0, wide: 500, elevation: elevationOf(500) });
    run(700);
    expect(place.wide).toBeGreaterThan(1000);
    expect(place.x).toBeGreaterThan(0);
    expect(place.x).toBeLessThan(10000);
    run(5000);
    expect(frames).toEqual([]);
    expect([place.x, place.z]).toEqual([10000, 0]);
    // (the rise is gone at the end but for the rounding of sin π)
    expect(place.wide).toBeCloseTo(500, 9);
    expect(seen.looks).toBeGreaterThan(80);
    expect(motion.toward()).toBeUndefined();
  });

  it('does not rise on its way to a place in the picture', () => {
    const { place, motion } = viewAt(0, 0, 1000);
    motion.flyTo(0.3, 0, 2000);
    let widest = 0;
    while (frames.length) {
      run(16);
      widest = Math.max(widest, place.wide);
    }
    expect(widest).toBeCloseTo(2000, 6);
    expect(place).toEqual({ x: 300, z: 0, wide: 2000 });
  });
});
