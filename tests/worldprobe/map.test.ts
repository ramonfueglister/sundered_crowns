// Properties the map mode of the world must keep: whatever tiles have arrived, the picture is covered exactly once
// (no hole, nothing drawn twice); the rules of the view change smoothly with its width; and the realms' map shows
// the realms where they are.
import { describe, expect, it } from 'vitest';
import { seeded } from '../../src/lookprobe/batch';
import { layoutNames, nameSvg } from '../../src/worldprobe/names';
import { distance, mapColours, paintRealms, realmNames } from '../../src/worldprobe/paint';
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
  const realms = { ids, w: 32, h: 16, owner, colors: [[0.6, 0.05, 0.03], [0.04, 0.08, 0.5]] as const };
  /** the dot's colour (un-premultiplied, linear 0 … 1) and cover */
  const look = (p: Uint8ClampedArray, x: number, y: number) => { const i = (y * 64 + x) * 4, a = p[i + 3]; return { r: p[i] / a, g: p[i + 1] / a, b: p[i + 2] / a, a: a / 255 }; };

  it('paints the realms in their hue, the land without a realm in sand and the water in slate blue, all covered', () => {
    const p = paintRealms(realms, 0, 0, 0, 64, 2);
    const red = look(p, 6, 10), blue = look(p, 24, 10), sand = look(p, 40, 10), sea = look(p, 60, 10);
    expect(red.r).toBeGreaterThan(red.b * 1.5); expect(blue.b).toBeGreaterThan(blue.r * 1.2);
    expect(sand.r).toBeGreaterThan(sand.b); expect(sea.b).toBeGreaterThan(sea.r);
    for (const d of [red, blue, sand, sea]) expect(d.a).toBeGreaterThan(0.85);
    // colour times cover never exceeds the cover
    for (let i = 0; i < p.length; i += 4) expect(Math.max(p[i], p[i + 1], p[i + 2])).toBeLessThanOrEqual(p[i + 3]);
  });

  it('draws a darker line of the realm’s own colour at its border and keeps the realm flat inside, as the reference', () => {
    const p = paintRealms(realms, 0, 0, 0, 64, 2), lum = (d: { r: number; g: number; b: number }) => 0.2126 * d.r + 0.7152 * d.g + 0.0722 * d.b;
    const line = look(p, 15, 10), nearBorder = look(p, 13, 10), inside = look(p, 4, 10), inside2 = look(p, 6, 10);
    expect(lum(line)).toBeLessThan(lum(inside) * 0.8);
    expect(lum(nearBorder)).toBeLessThanOrEqual(lum(inside) * 1.001);
    expect(Math.abs(lum(inside) - lum(inside2))).toBeLessThan(lum(inside) * 0.08);
    // the line keeps the realm's hue
    expect(line.r).toBeGreaterThan(line.b * 1.5);
  });

  it('lightens the shallow water along the coast', () => {
    const p = paintRealms(realms, 0, 0, 0, 64, 2), coast = look(p, 50, 10), open = look(p, 63, 10);
    expect(coast.g).toBeGreaterThan(open.g);
  });

  it('runs on unbroken from one tile into the next', () => {
    // the same map painted as one tile of 64 dots and as two of 32: the dots must agree
    const whole = paintRealms(realms, 0, 0, 0, 64, 2), west = paintRealms(realms, 0, 0, 0, 32, 2), east = paintRealms(realms, 0, 1, 0, 32, 2);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
      const part = x < 32 ? west : east, i = (y * 32 + (x % 32)) * 4, j = (y * 64 + x) * 4;
      for (let c = 0; c < 4; c++) expect(Math.abs(part[i + c] - whole[j + c]), `${x}, ${y}`).toBeLessThanOrEqual(1);
    }
  });

  it('picks a place out: lighter, inside a gold line, and nothing else changes', () => {
    const plain = paintRealms(realms, 0, 0, 0, 64, 2), p = paintRealms({ ...realms, chosen: 1 }, 0, 0, 0, 64, 2);
    const raw = (of: Uint8ClampedArray, x: number, y: number) => [...of.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];
    expect(look(p, 24, 10).b).toBeGreaterThan(look(plain, 24, 10).b);
    // on its rim, towards the other realm: the gold line
    const rim = look(p, 16, 10);
    expect(rim.r).toBeGreaterThan(rim.b);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (x < 15 || x >= 33) expect(raw(p, x, y), `${x}, ${y}`).toEqual(raw(plain, x, y));
    for (let i = 0; i < p.length; i += 4) expect(Math.max(p[i], p[i + 1], p[i + 2])).toBeLessThanOrEqual(p[i + 3]);
  });

  it('keeps every realm in the muted band of the atlas', () => {
    for (const c of [[1, 0, 0], [0, 0, 1], [1, 1, 0], [0.02, 0.02, 0.02], [1, 1, 1]] as const) {
      const [inner] = mapColours(c), max = Math.max(...inner), min = Math.min(...inner);
      expect(max).toBeLessThan(0.75); expect(min).toBeGreaterThan(0.005); expect(max - min).toBeLessThan(0.5);
    }
  });

  it('finds where a realm lies and writes its name along it, on its land', () => {
    const names = realmNames(realms, 1), first = names.find((n) => n.realm === 0)!;
    expect(names.length).toBe(2);
    // 8 wide and 16 tall: it lies north to south, and the name runs down it inside the realm
    expect(Math.abs(Math.abs(first.turn) - Math.PI / 2)).toBeLessThan(0.01);
    expect(first.long).toBeGreaterThan(first.broad * 1.5);
    for (const p of [first.from, first.bend, first.to, [first.x, first.y]]) { expect(p[0]).toBeGreaterThanOrEqual(0); expect(p[0]).toBeLessThanOrEqual(8); }
    expect(Math.abs(first.to[1] - first.from[1])).toBeGreaterThan(6);
    expect(first.size).toBeGreaterThan(1); expect(first.size).toBeLessThan(8);
  });

  it('measures exact distances', () => {
    const n = 9, marked = new Uint8Array(n * n); marked[4 * n + 4] = 1;
    const d = distance(marked, n);
    expect(d[4 * n + 4]).toBe(0); expect(d[4 * n + 7]).toBe(9); expect(d[0]).toBe(32);
  });
});

describe('names', () => {
  const name = { realm: 0, x: 50, y: 50, long: 80, broad: 20, turn: 0, from: [10, 50] as [number, number], bend: [50, 50] as [number, number], to: [90, 50] as [number, number], size: 12, name: 'Ungarn' };
  it('lays a name along its curve, as large as the land allows, and leaves out what is too small or outside', () => {
    const [n] = layoutNames([name], 100, 400, 50, 200, 1, 1);
    expect(n.size).toBeCloseTo(12, 0); expect(n.length).toBeGreaterThan(30); expect(n.d.startsWith('M10.0 50.0Q')).toBe(true);
    expect(layoutNames([{ ...name, size: 3 }], 100, 400, 50, 200, 1, 1)).toEqual([]);
    expect(layoutNames([name], 100, 100, 500, 500, 1, 1)).toEqual([]);
    expect(nameSvg(n, 'a')).toContain('textPath');
  });
});
