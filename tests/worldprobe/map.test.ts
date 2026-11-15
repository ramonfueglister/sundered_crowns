// Properties the map mode of the world must keep: whatever tiles have arrived, the picture is covered exactly once
// (no hole, nothing drawn twice); the rules of the view change smoothly with its width; and the realms' map shows
// the realms where they are.
import { describe, expect, it } from 'vitest';
import { seeded } from '../../src/lookprobe/batch';
import { paintRealms, realmNames } from '../../src/worldprobe/paint';
import { cover, keyOf } from '../../src/worldprobe/pyramid';
import { VIEW } from '../../src/lookprobe/layout';
import { COARSEST, FARTHEST, FINE_UNTIL, NEAREST, creasesOf, elevationOf, nearOf, paperLevelOf, realmsOf, reliefOf, stepOf } from '../../src/worldprobe/zoom';

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
    // the camera looks down the least on the diorama: more steeply from very near, and straight down from far away
    const rules: [string, (w: number) => number, (w: number) => number][] = [['elevation', elevationOf, (w) => (w < 300 ? -1 : 1)], ['near', nearOf, () => -1], ['realms', realmsOf, () => 1], ['creases', creasesOf, () => -1]];
    for (const [name, rule, way] of rules) for (let k = 1; k < widths.length; k++) {
      const a = rule(widths[k - 1]), b = rule(widths[k]), span = name === 'elevation' ? 90 : 1;
      expect((b - a) * way(widths[k]), `${name} at ${widths[k]}`).toBeGreaterThanOrEqual(-1e-9);
      // the realms come in over a short way, so that the world is not seen half under them for long: still without a leap
      expect(Math.abs(b - a) / span, `${name} at ${widths[k]}`).toBeLessThan(name === 'realms' ? 0.12 : 0.03);
    }
  });

  it('is the near view where the houses are built from their fine blocks, and the diorama of the reference from a town on', () => {
    expect(NEAREST).toBeLessThan(FINE_UNTIL);
    for (const w of [NEAREST, FINE_UNTIL]) { expect(nearOf(w)).toBe(1); expect(elevationOf(w)).toBeCloseTo(30, 6); }
    for (const w of [160, 190, 400]) { expect(nearOf(w)).toBe(0); expect(elevationOf(w)).toBeCloseTo(VIEW.elevation, 6); }
  });

  it('draws the land at the same height on both sides of a change of step', () => {
    // a step's blocks are built flatter by 2^0.6 than those of the finer step (world.ts)
    for (let k = 1; k < widths.length; k++) {
      const a = stepOf(widths[k - 1]), b = stepOf(widths[k]);
      if (a !== b) expect(reliefOf(widths[k], b) / 2 ** (0.6 * b) / (reliefOf(widths[k - 1], a) / 2 ** (0.6 * a))).toBeCloseTo(2 ** -1, 1);
    }
  });

  it('goes through every step of the map, one at a time, and keeps a step for at least a doubling of the width', () => {
    let from = widths[0];
    for (let k = 1; k < widths.length; k++) {
      const a = stepOf(widths[k - 1]), b = stepOf(widths[k]);
      if (a === b) continue;
      expect(b).toBe(a + 1);
      if (a > 0) expect(widths[k] / from).toBeGreaterThan(1.9);
      from = widths[k];
    }
    expect(stepOf(NEAREST)).toBe(0); expect(stepOf(FARTHEST)).toBe(COARSEST);
  });

  it('shows the realms only once the world lies flat under a camera looking straight down', () => {
    const first = widths.find((w) => realmsOf(w) > 0)!;
    expect(elevationOf(first)).toBeGreaterThan(89);
    expect(reliefOf(first, stepOf(first))).toBeLessThan(0.1);
    expect(creasesOf(first)).toBeLessThan(0.01);
    expect(stepOf(first)).toBeGreaterThanOrEqual(COARSEST - 1);
    expect(realmsOf(FARTHEST)).toBe(1);
  });

  it('paints the map at about a dot to a pixel', () => {
    for (const w of widths) for (const pixels of [800, 1672, 2560]) {
      const dot = (2 ** paperLevelOf(w, pixels) * pixels) / w;
      if (paperLevelOf(w, pixels) > 0) expect(dot).toBeLessThanOrEqual(1.5);
      if (paperLevelOf(w, pixels) < 6) expect(dot).toBeGreaterThanOrEqual(0.7);
    }
  });
});

describe('realms', () => {
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

  it('picks a place out: lighter, inside a line of its own, and nothing else changes', () => {
    const plain = paintRealms(realms, 0, 0, 0, 64, 2), p = paintRealms({ ...realms, chosen: 1 }, 0, 0, 0, 64, 2);
    const at = (of: Uint8ClampedArray, x: number, y: number) => [...of.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];
    // inside, the realm's blue with white in it; on its rim, towards the other realm and at the map's edge, the line
    expect(at(p, 24, 10)[0]).toBeGreaterThan(80); expect(at(p, 24, 10)[2]).toBeGreaterThan(at(plain, 24, 10)[2]);
    expect(at(p, 16, 10)).toEqual(at(p, 24, 0)); expect(at(p, 16, 10)[3]).toBe(255); expect(at(p, 16, 10)[0]).toBeGreaterThan(at(p, 16, 10)[2]);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (x < 16 || x >= 32) expect(at(p, x, y), `${x}, ${y}`).toEqual(at(plain, x, y));
    // land without a realm is clear until it is picked out
    expect(at(paintRealms({ ...realms, chosen: 2 }, 0, 0, 0, 64, 2), 40, 10)[3]).toBeGreaterThan(200);
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
