// Properties the figures must keep: the kit is well formed, a ground gives the same figures every time, two pieces that
// share ground put each figure in exactly one of them, every figure stands on free ground and walks a level way, and
// the code that runs in the world's web workers needs no page.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Figures, type SettledGround, crowd, setPlacePeople } from '../../src/figures';
import CITIES_JSON from '../../src/sim/content/cities_1356.json';
import { ESTATES, Mode } from '../../src/figures/estates';
import { FAR_PARTS, HEIGHT, NEAR_PARTS, buildKit } from '../../src/figures/kit';
import { type Ground, Mat, N, idx } from '../../src/lookprobe/layout';

const CITIES = CITIES_JSON.cities;

/** A ground with a walled town (paved streets between built blocks), a field with its grass strip, a farm and a river. */
function testGround(ox = 0, oz = 0): { g: Ground; s: SettledGround } {
  const g: Ground = {
    h: new Int16Array(N * N).fill(4),
    mat: new Uint8Array(N * N),
    wet: new Uint8Array(N * N),
    shore: new Uint8Array(N * N),
    occ: new Float32Array(N * N),
    surf: new Float32Array(N * N),
    ox,
    oz,
  };
  const s: SettledGround = { used: new Uint8Array(N * N), town: new Uint8Array(N * N), field: new Uint8Array(N * N) };
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const wx = x + ox,
        wz = z + oz,
        i = idx(x, z);
      if (wx % 50 === 7) {
        g.wet[i] = 1;
        g.mat[i] = Mat.Bed;
        continue;
      }
      if (wx >= 100 && wx < 260 && wz >= 100 && wz < 260) {
        s.town[i] = 1;
        s.used[i] = wx % 19 < 2 || wz % 17 < 2 ? 2 : 1;
        g.mat[i] = Mat.Paved;
      } else if (wx % 11 > 1 && wz % 8 > 1 && wz > 300) {
        s.field[i] = wx % 22 < 11 ? 1 : 2;
        s.used[i] = 1;
        g.mat[i] = Mat.Soil;
      } else if (wx % 37 < 4 && wz % 29 < 4) s.used[i] = 1;
      if (wz > 200) g.h[i] = 4 + Math.floor((wx % 40) / 10);
    }
  return { g, s };
}
const all = () => true;
const at = (f: Figures, k: number) => ({
  a: [...f.a.subarray(k * 4, k * 4 + 4)],
  b: [...f.b.subarray(k * 4, k * 4 + 4)],
  c: [...f.c.subarray(k * 4, k * 4 + 4)],
});

describe('the kit', () => {
  for (const [name, parts] of [
    ['near', NEAR_PARTS],
    ['far', FAR_PARTS],
  ] as const)
    it(`${name}: 12 triangles a box, finite, within a figure's height`, () => {
      const k = buildKit(parts);
      expect(k.triangles).toBe(parts.length * 12);
      expect(k.pos.every(Number.isFinite)).toBe(true);
      for (let i = 1; i < k.pos.length; i += 3) expect(k.pos[i]).toBeGreaterThanOrEqual(0);
      // only the spear rises above the head
      const tallest = Math.max(...parts.filter((p) => p.load !== 4).map((p) => p.to[1])) / 10;
      expect(tallest).toBeLessThanOrEqual(HEIGHT + 0.15);
    });
  it('every estate has a garment and headwear colour', () => {
    for (const e of ESTATES) {
      expect(e.tunic.length).toBeGreaterThan(0);
      expect(e.headwear.length).toBeGreaterThan(0);
    }
  });
});

describe('the crowd', () => {
  const { g, s } = testGround(),
    f = crowd(g, s, all);
  it('comes out the same every time', () => {
    const again = crowd(g, s, all);
    expect(again.count).toBe(f.count);
    expect(again.a).toEqual(f.a);
    expect(again.b).toEqual(f.b);
    expect(again.d).toEqual(f.d);
  });
  it('has town walkers, people about the houses and farmers', () => {
    const modes = [0, 1, 2].map(
      (m) => Array.from({ length: f.count }, (_, k) => f.c[k * 4]).filter((v) => v === m).length,
    );
    expect(f.count).toBeGreaterThan(200);
    expect(modes[Mode.Walk]).toBeGreaterThan(50);
    expect(modes[Mode.Work]).toBeGreaterThan(5);
  });
  it('stands every figure on dry free ground, and walks only over it', () => {
    for (let k = 0; k < f.count; k++) {
      const { a, b, c } = at(f, k),
        steps = Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]));
      for (let t = 0; t <= (c[0] === Mode.Walk ? steps : 0); t++) {
        const x = Math.floor(a[0] + ((b[0] - a[0]) * t) / Math.max(1, steps)),
          z = Math.floor(a[2] + ((b[2] - a[2]) * t) / Math.max(1, steps)),
          i = idx(x, z);
        expect(g.wet[i]).toBe(0);
        expect(s.used[i] === 1 && !s.town[i]).toBe(false);
        expect(s.field[i]).toBe(0);
      }
      if (c[0] === Mode.Walk) expect(Math.abs(b[1] - a[1])).toBeLessThanOrEqual(steps);
    }
  });
});

describe('pieces', () => {
  it('put each figure into exactly one of two pieces that share their ground', () => {
    // two pieces 100 blocks apart, each owning 100 blocks of the world well inside its ground, against one owning both
    const left = testGround(0, 0),
      right = testGround(100, 0);
    const fl = crowd(left.g, left.s, (x) => x >= 100 && x < 200),
      fr = crowd(right.g, right.s, (x) => x >= 100 && x < 200);
    const whole = crowd(left.g, left.s, (x) => x >= 100 && x < 300);
    const key = (f: Figures, ox: number) =>
      Array.from({ length: f.count }, (_, k) =>
        [f.a[k * 4] + ox, f.a[k * 4 + 2], f.b[k * 4] + ox, f.b[k * 4 + 2]].map((v) => v.toFixed(3)).join(),
      );
    const both = [...key(fl, 0), ...key(fr, 100)].sort();
    expect(both).toEqual(key(whole, 0).sort());
  });
});

describe('the persons of a town', () => {
  // a town in the middle of the test ground, with 400 persons of the place of Paris (gazetteer site 68)
  const paris = CITIES.find((c) => c.name === 'Paris')!;
  setPlacePeople({
    place: paris.place,
    day: 0,
    id: Array.from({ length: 400 }, (_, k) => 50000 + k),
    born: Array.from({ length: 400 }, (_, k) => (k % 10 === 0 ? -365 : -365 * 30)),
    sex: Array.from({ length: 400 }, (_, k) => k % 2),
  });
  const withTown = (ox: number) => {
    const t = testGround(ox, 0);
    t.s.towns = [{ site: paris.site, cx: 180, cz: 180, half: 80 }];
    return t;
  };
  const persons = (f: Figures) =>
    Array.from({ length: f.count }, (_, k) => f.e[k * 4 + 3])
      .filter((v) => v > 0)
      .map((v) => v - 1);
  it('walk its streets as themselves, adults only, each at most once', () => {
    const { g, s } = withTown(0),
      f = crowd(g, s, all),
      ids = persons(f);
    expect(ids.length).toBeGreaterThan(20);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toBeGreaterThanOrEqual(50000);
      expect((id - 50000) % 10).not.toBe(0);
    }
    // a woman wears a woman's estate
    for (let k = 0; k < f.count; k++) {
      const id = f.e[k * 4 + 3] - 1;
      if (id >= 0)
        expect(
          ['Bäuerin', 'Bürgerin'].includes(
            ESTATES.find((e) => e.cut === f.c[k * 4 + 2] && e.head === f.c[k * 4 + 3])!.name,
          ),
        ).toBe((id - 50000) % 2 === 0);
    }
  });
  it('are put into exactly one of two pieces that share the town', () => {
    const l = withTown(0),
      r = withTown(100);
    const both = [
      ...persons(crowd(l.g, l.s, (x) => x >= 100 && x < 200)),
      ...persons(crowd(r.g, r.s, (x) => x >= 100 && x < 200)),
    ].sort();
    expect(both).toEqual(persons(crowd(l.g, l.s, (x) => x >= 100 && x < 300)).sort());
  });
  it('leave the other towns their anonymous figures', () => {
    const { g, s } = testGround(),
      f = crowd(g, s, all);
    expect(persons(f).length).toBe(0);
  });
});

describe('the figure code that runs in a web worker', () => {
  const dir = join(__dirname, '../../src/figures');
  for (const file of readdirSync(dir).filter((n) => n.endsWith('.ts')))
    it(`${file}: at most 300 lines${['kit.ts', 'estates.ts', 'crowd.ts', 'index.ts', 'people.ts'].includes(file) ? ', no page' : ''}`, () => {
      const src = readFileSync(join(dir, file), 'utf8');
      expect(src.split('\n').length).toBeLessThanOrEqual(300);
      if (['kit.ts', 'estates.ts', 'crowd.ts', 'index.ts', 'people.ts'].includes(file)) {
        expect(src).not.toMatch(/\b(document|window|localStorage|requestAnimationFrame)\./);
        expect(src).not.toMatch(/from '(three|three\/webgpu|three\/tsl)'/);
      }
    });
});

// The five numbers per figure travel as one vertex buffer: separate ones made nine buffers with the kit and the
// instance matrix, over WebGPU's default limit of eight, and no figure was drawn on a real device.
describe('the figure buffer', () => {
  it('holds the five lists of each figure side by side', async () => {
    const { interleave } = await import('../../src/figures/material');
    const l = [0, 1, 2, 3, 4].map((k) => Float32Array.from({ length: 8 }, (_, j) => k * 100 + j));
    const out = interleave(l, 2);
    expect(out.length).toBe(40);
    expect(Array.from(out.subarray(0, 8))).toEqual([0, 1, 2, 3, 100, 101, 102, 103]);
    expect(Array.from(out.subarray(20, 24))).toEqual([4, 5, 6, 7]);
    expect(Array.from(out.subarray(36, 40))).toEqual([404, 405, 406, 407]);
  });
});
