// How the pieces on the stage show (worldprobe/piece_show.ts `createShow`): each is scaled and placed for the view's
// step; pieces that take each other's place dissolve over DISSOLVE ms, what only comes or goes does so at once; a
// piece that took the place of a coarser one settles from that step's shape to its own; the next coarser step is laid
// into the picture as the view nears it; and a piece not shown yet is drawn once on none of the dots first. The stage
// is a fake that records what it is told, and the clock is driven by hand. (pieces.test.ts checks glideOf and
// settleOf on their own.)
import * as THREE from 'three/webgpu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEA_Y } from '../../src/lookprobe/layout';
import type { Stage } from '../../src/lookprobe/stage';
import type { Held } from '../../src/worldprobe/piece_arrival';
import { glideOf, settleOf, createShow } from '../../src/worldprobe/piece_show';
import { PIECE, type View } from '../../src/worldprobe/piece_sight';
import { keyOf } from '../../src/worldprobe/pyramid';
import { reliefOf } from '../../src/worldprobe/zoom';

type Look = Parameters<ReturnType<typeof createShow>['show']>[0];
/** a view `wide` finest blocks across about (x, z): at 200 the finest step, far from its border (glideOf 0) */
const view = (x: number, z: number, wide: number): View => ({ x, z, wide, aspect: 1.6, pixels: 1600, elevation: 50 });
const V = view(200, 200, 200);
const lookOf = (o: Partial<Look> = {}): Look => ({
  v: V,
  rest: o.v ?? V,
  step: 0,
  stepped: false,
  seamless: false,
  blend: 0,
  coarser: [],
  homeX: 0,
  homeZ: 0,
  looks: 1,
  ...o,
});
const heldOf = (step: number, px: number, pz: number, o: Partial<Held> = {}): Held => ({
  group: new THREE.Group(),
  step,
  px,
  pz,
  cells: [],
  dots: [0, 1],
  seen: 0,
  on: false,
  laid: 0,
  glides: false,
  ...o,
});

let clock = 1000;
beforeEach(() => {
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** the pieces `pieces` on a stage that records what it is told; `ahead`: the view moves */
function showOf(pieces: Held[], ahead = true) {
  const held = new Map(pieces.map((h) => [keyOf(h.step, h.px, h.pz), h])),
    counts: Record<string, number> = {},
    seen = {
      pictures: 0,
      whole: [] as [THREE.Group, boolean][],
      glide: new Map<THREE.Group, number>(),
      thin: new Map<THREE.Group, number>(),
      dots: new Map<THREE.Group, [number, number]>(),
    };
  const stage = {
    pictures: () => seen.pictures,
    whole: (g: THREE.Group, on: boolean) => seen.whole.push([g, on]),
    glide: (g: THREE.Group, share: number) => seen.glide.set(g, share),
    thin: (g: THREE.Group, share: number) => seen.thin.set(g, share),
    dissolve: (g: THREE.Group, from: number, until: number) => seen.dots.set(g, [from, until]),
    probe: { ready: false, counts, backend: 'test' },
  };
  // (the showing uses only these members of the stage: pictures, whole, glide, thin, dissolve and probe.counts)
  const show = createShow(stage as unknown as Stage, held, ahead, (step) => 2 * step + 1);
  /** a look `ms` after the last, showing `shown` */
  const look = (shown: Held[], ms = 0, o: Partial<Look> = {}) => {
    clock += ms;
    return show.show(lookOf(o), new Set(shown));
  };
  return { seen, counts, look };
}

describe('a piece on the stage', () => {
  it('is scaled to the stage of the view, and sinks towards the sea as the view widens', () => {
    const h = heldOf(1, 2, 3);
    const { look } = showOf([h]);
    look([h], 0, { homeX: 10, homeZ: 20 });
    const tall = 2 * reliefOf(200, 1),
      margin = 2 * 1 + 1;
    expect(h.group.scale.toArray()).toEqual([2, tall, 2]);
    expect(h.group.position.toArray()).toEqual([
      (2 * PIECE - margin) * 2 - 10,
      SEA_Y * (1 - tall),
      (3 * PIECE - margin) * 2 - 20,
    ]);
  });

  it('of the first far step lets its figures go as the view nears the next step, those of the finest step stay', () => {
    const fine = heldOf(0, 0, 0),
      far = heldOf(1, 0, 0);
    const { seen, look } = showOf([fine, far]);
    /** the shares of the two pieces' figures gone in a view `wide` across */
    const gone = (wide: number) => {
      look([fine, far], 0, { v: view(200, 200, wide) });
      return [seen.thin.get(fine.group), seen.thin.get(far.group)];
    };
    // over the stretch in which the far steps glide to the next one (glideOf), all gone at the border
    expect(gone(600)).toEqual([0, 0]);
    expect(gone(1000)).toEqual([0, glideOf(1000, 1)]);
    expect(glideOf(1000, 1)).toBeGreaterThan(0.2);
    expect(glideOf(1000, 1)).toBeLessThan(0.8);
    expect(gone(1199)[0]).toBe(0);
    expect(gone(1199)[1]).toBeGreaterThan(0.99);
  });

  it('comes into the picture and leaves it at once where it takes no other one’s place', () => {
    const h = heldOf(0, 0, 0);
    const { seen, look } = showOf([h]);
    const shown = look([h], 0, { looks: 4 });
    expect([...shown.showing]).toEqual([h]);
    expect(shown.fading).toBe(false);
    expect(h).toMatchObject({ on: true, fade: undefined, dots: [0, 1], seen: 4 });
    expect(h.group.visible).toBe(true);
    expect(seen.dots.get(h.group)).toEqual([0, 1]);
    expect(look([]).showing.size).toBe(0);
    expect(h.on).toBe(false);
    expect(h.group.visible).toBe(false);
  });
});

describe('pieces that take each other’s place', () => {
  it('dissolve over 300 ms: the finer ones in on the first of the dots, the coarser out on the last', () => {
    const coarse = heldOf(1, 0, 0),
      a = heldOf(0, 0, 0),
      b = heldOf(0, 1, 0),
      beside = heldOf(0, 0, 2); // under the coarse piece's neighbour to the south
    const { seen, look } = showOf([coarse, a, b, beside]);
    look([coarse]);
    expect(look([a, b, beside]).fading).toBe(true);
    expect(a.fade).toEqual({ since: clock, rising: true });
    expect(coarse.fade).toEqual({ since: clock, rising: false });
    expect(beside.fade).toBe(undefined);
    look([a, b]);
    const half = look([a, b], 150);
    expect([...half.showing].sort((p, q) => p.step - q.step || p.px - q.px)).toEqual([a, b, coarse]);
    expect(seen.dots.get(a.group)).toEqual([0, 0.5]);
    expect(seen.dots.get(coarse.group)).toEqual([0.5, 1]);
    const done = look([a, b], 150);
    expect(done.fading).toBe(false);
    expect(a.fade).toBe(undefined);
    expect(seen.dots.get(a.group)).toEqual([0, 1]);
    expect(coarse.group.visible).toBe(false);
  });

  it('change at once for a tool that takes one picture, and where the zoom has blended the two steps already', () => {
    for (const [ahead, seamless] of [
      [false, false],
      [true, true],
    ]) {
      const coarse = heldOf(1, 0, 0),
        a = heldOf(0, 0, 0);
      const { look } = showOf([coarse, a], ahead);
      look([coarse]);
      expect(look([a], 0, { seamless }).fading).toBe(false);
      expect(a.fade).toBe(undefined);
      expect(coarse.group.visible).toBe(false);
    }
  });

  it('settle from the coarser step’s shape to their own, after they dissolved in', () => {
    const coarse = heldOf(1, 0, 0, { glides: true }),
      a = heldOf(0, 0, 0, { glides: true });
    const { seen, counts, look } = showOf([coarse, a]);
    look([coarse]);
    look([a]);
    // the view's width asks for none of the coarser shape: it begins all the way there
    expect(a.settle).toEqual({ since: clock, by: 1 });
    expect(counts['pieces settled']).toBe(1);
    expect(seen.glide.get(a.group)).toBe(1);
    const own = glideOf(200, 0);
    expect(look([a], 600).fading).toBe(true);
    expect(seen.glide.get(a.group)).toBeCloseTo(settleOf(own, 1, 600)!, 9);
    expect(look([a], 300).fading).toBe(false);
    expect(a.settle).toBe(undefined);
    expect(seen.glide.get(a.group)).toBe(own);
    // a coarser piece that takes the place of finer ones does not settle
    look([coarse], 1000);
    expect(coarse.fade).toEqual({ since: clock, rising: true });
    expect(coarse.settle).toBe(undefined);
    expect(counts['pieces settled']).toBe(1);
  });

  it('settle by what the view’s width leaves of the coarser shape, and not where that is within 2 %', () => {
    const cases: [number, number | undefined][] = [
      [365, 1 - glideOf(365, 0)],
      [390, undefined],
    ];
    for (const [wide, by] of cases) {
      const coarse = heldOf(1, 0, 0),
        a = heldOf(0, 0, 0, { glides: true });
      const { look } = showOf([coarse, a]);
      const v = view(200, 200, wide);
      look([coarse], 0, { v });
      look([a], 0, { v });
      expect(a.settle?.by).toBe(by);
    }
  });
});

describe('the next coarser step', () => {
  it('is laid into the picture as the view nears it, on the first of the dots, the view’s pieces on the rest', () => {
    const coarse = heldOf(1, 0, 0),
      a = heldOf(0, 0, 0);
    const { seen, look } = showOf([coarse, a]);
    const near = { coarser: [{ key: keyOf(1, 0, 0), step: 1, px: 0, pz: 0 }] };
    // the first look sets the share at once
    look([a], 0, { ...near, blend: 0.5 });
    expect(coarse.laid).toBe(0.5);
    expect(coarse.group.visible).toBe(true);
    expect(seen.dots.get(coarse.group)).toEqual([0, 0.5]);
    expect(seen.dots.get(a.group)).toEqual([0.5, 1]);
    // where it comes late, it closes on the zoom over the time of a dissolve, 50 ms at most a picture
    expect(look([a], 1000, { ...near, blend: 1 }).fading).toBe(true);
    expect(coarse.laid).toBeCloseTo(0.5 + 50 / 300, 9);
    // across the border at once
    expect(look([a], 16, { ...near, blend: 1, stepped: true }).fading).toBe(false);
    expect(coarse.laid).toBe(1);
    // and out again as the view leaves it
    look([a], 16, { blend: 0 });
    expect(coarse.laid).toBeCloseTo(1 - 16 / 300, 9);
  });
});

describe('a piece not shown yet', () => {
  it('is drawn once on none of the dots, one to a picture, where the view is or comes to rest', () => {
    const a = heldOf(0, 0, 0, { warm: -1 }),
      b = heldOf(0, 1, 0, { warm: -1 }),
      far = heldOf(0, 20, 20, { warm: -1 });
    const { seen, look } = showOf([a, b, far]);
    expect(look([]).fading).toBe(true);
    expect(a.warm).toBe(0);
    expect(seen.whole).toEqual([[a.group, true]]);
    expect(a.group.visible).toBe(true);
    expect(seen.dots.get(a.group)).toEqual([0, 0]);
    expect(b.group.visible).toBe(false);
    // looks without a picture between change nothing
    look([]);
    expect(seen.whole).toHaveLength(1);
    // the stage drew a picture: a is done, b is next
    seen.pictures = 1;
    look([]);
    expect(a.warm).toBe(undefined);
    expect(a.group.visible).toBe(false);
    expect(seen.whole.slice(1)).toEqual([
      [a.group, false],
      [b.group, true],
    ]);
    seen.pictures = 2;
    // the far piece waits until the view comes to rest by it
    expect(look([]).fading).toBe(false);
    expect(far.warm).toBe(-1);
    look([], 0, { rest: view(20.5 * PIECE, 20.5 * PIECE, 200) });
    expect(far.warm).toBe(2);
  });

  it('shows at once when the view asks for it while it is drawn so', () => {
    const a = heldOf(0, 0, 0, { warm: -1 });
    const { seen, look } = showOf([a]);
    look([]);
    look([a]);
    expect(a.warm).toBe(undefined);
    expect(seen.whole).toEqual([
      [a.group, true],
      [a.group, false],
    ]);
    expect(seen.dots.get(a.group)).toEqual([0, 1]);
  });
});
