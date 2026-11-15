// Properties the figures must keep: the kit is well formed, a ground gives the same figures every time, two pieces that
// share ground put each figure in exactly one of them, every figure stands on free ground and walks a level way, and
// the code that runs in the world's web workers needs no page.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Figures, type SettledGround, crowd } from '../../src/figures';
import { ESTATES, Mode } from '../../src/figures/estates';
import { FAR_PARTS, HEIGHT, NEAR_PARTS, buildKit } from '../../src/figures/kit';
import { type Ground, Mat, N, idx } from '../../src/lookprobe/layout';

/** A ground with a walled town (paved streets between built blocks), a field with its grass strip, a farm and a river. */
function testGround(ox = 0, oz = 0): { g: Ground; s: SettledGround } {
  const g: Ground = { h: new Int16Array(N * N).fill(4), mat: new Uint8Array(N * N), wet: new Uint8Array(N * N), shore: new Uint8Array(N * N), occ: new Float32Array(N * N), surf: new Float32Array(N * N), ox, oz };
  const s: SettledGround = { used: new Uint8Array(N * N), town: new Uint8Array(N * N), field: new Uint8Array(N * N) };
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const wx = x + ox, wz = z + oz, i = idx(x, z);
    if (wx % 50 === 7) { g.wet[i] = 1; g.mat[i] = Mat.Bed; continue; }
    if (wx >= 100 && wx < 260 && wz >= 100 && wz < 260) { s.town[i] = 1; s.used[i] = (wx % 19 < 2 || wz % 17 < 2) ? 2 : 1; g.mat[i] = Mat.Paved; }
    else if (wx % 11 > 1 && wz % 8 > 1 && wz > 300) { s.field[i] = wx % 22 < 11 ? 1 : 2; s.used[i] = 1; g.mat[i] = Mat.Soil; }
    else if (wx % 37 < 4 && wz % 29 < 4) s.used[i] = 1;
    if (wz > 200) g.h[i] = 4 + Math.floor((wx % 40) / 10);
  }
  return { g, s };
}
const all = () => true;
const at = (f: Figures, k: number) => ({ a: [...f.a.subarray(k * 4, k * 4 + 4)], b: [...f.b.subarray(k * 4, k * 4 + 4)], c: [...f.c.subarray(k * 4, k * 4 + 4)] });

describe('the kit', () => {
  for (const [name, parts] of [['near', NEAR_PARTS], ['far', FAR_PARTS]] as const) it(`${name}: 12 triangles a box, finite, within a figure's height`, () => {
    const k = buildKit(parts);
    expect(k.triangles).toBe(parts.length * 12);
    expect(k.pos.every(Number.isFinite)).toBe(true);
    for (let i = 1; i < k.pos.length; i += 3) expect(k.pos[i]).toBeGreaterThanOrEqual(0);
    // only the spear rises above the head
    const tallest = Math.max(...parts.filter((p) => p.load !== 4).map((p) => p.to[1])) / 10;
    expect(tallest).toBeLessThanOrEqual(HEIGHT + 0.15);
  });
  it('every estate has a garment and headwear colour', () => {
    for (const e of ESTATES) { expect(e.tunic.length).toBeGreaterThan(0); expect(e.headwear.length).toBeGreaterThan(0); }
  });
});

describe('the crowd', () => {
  const { g, s } = testGround(), f = crowd(g, s, all);
  it('comes out the same every time', () => {
    const again = crowd(g, s, all);
    expect(again.count).toBe(f.count);
    expect(again.a).toEqual(f.a); expect(again.b).toEqual(f.b); expect(again.d).toEqual(f.d);
  });
  it('has town walkers, people about the houses and farmers', () => {
    const modes = [0, 1, 2].map((m) => Array.from({ length: f.count }, (_, k) => f.c[k * 4]).filter((v) => v === m).length);
    expect(f.count).toBeGreaterThan(200);
    expect(modes[Mode.Walk]).toBeGreaterThan(50);
    expect(modes[Mode.Work]).toBeGreaterThan(5);
  });
  it('stands every figure on dry free ground, and walks only over it', () => {
    for (let k = 0; k < f.count; k++) {
      const { a, b, c } = at(f, k), steps = Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]));
      for (let t = 0; t <= (c[0] === Mode.Walk ? steps : 0); t++) {
        const x = Math.floor(a[0] + ((b[0] - a[0]) * t) / Math.max(1, steps)), z = Math.floor(a[2] + ((b[2] - a[2]) * t) / Math.max(1, steps)), i = idx(x, z);
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
    const left = testGround(0, 0), right = testGround(100, 0);
    const fl = crowd(left.g, left.s, (x) => x >= 100 && x < 200), fr = crowd(right.g, right.s, (x) => x >= 100 && x < 200);
    const whole = crowd(left.g, left.s, (x) => x >= 100 && x < 300);
    const key = (f: Figures, ox: number) => Array.from({ length: f.count }, (_, k) => [f.a[k * 4] + ox, f.a[k * 4 + 2], f.b[k * 4] + ox, f.b[k * 4 + 2]].map((v) => v.toFixed(3)).join());
    const both = [...key(fl, 0), ...key(fr, 100)].sort();
    expect(both).toEqual(key(whole, 0).sort());
  });
});

describe('the figure code that runs in a web worker', () => {
  const dir = join(__dirname, '../../src/figures');
  for (const file of readdirSync(dir).filter((n) => n.endsWith('.ts'))) it(`${file}: at most 300 lines${['kit.ts', 'estates.ts', 'crowd.ts', 'index.ts'].includes(file) ? ', no page' : ''}`, () => {
    const src = readFileSync(join(dir, file), 'utf8');
    expect(src.split('\n').length).toBeLessThanOrEqual(300);
    if (['kit.ts', 'estates.ts', 'crowd.ts', 'index.ts'].includes(file)) {
      expect(src).not.toMatch(/\b(document|window|localStorage|requestAnimationFrame)\./);
      expect(src).not.toMatch(/from '(three|three\/webgpu|three\/tsl)'/);
    }
  });
});
