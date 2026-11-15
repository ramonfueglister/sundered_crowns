// The fine-block house of the near view: the same seed gives the same model, the model is sound, it stays on its plot
// and under its height, and the Venice tradition keeps the measures of its sources (Dorigo's storey heights, the
// reference class's openings, Lupo's chimneys).
import { describe, expect, it } from 'vitest';
import { type Batch, seeded } from '../../src/lookprobe/batch';
import * as B from '../../src/buildings';
import venice from '../../src/buildings/traditions/measures/venedig_1356.json';

const V = B.VOXEL, tr = B.VENICE;
const CASES: [number, number, number, B.HouseOptions][] = [
  [3, 5, 2, {}], [2.5, 4, 3, { shop: true, canal: 'nz' }], [7, 9, 3, { great: true, canal: 'nz' }], [3.5, 6, 2, { detail: 0 }], [3, 5, 3, { blind: ['nx', 'px'], front: 'pz' }],
];

function bounds(b: Batch) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < b.pos.length; i++) { lo[i % 3] = Math.min(lo[i % 3], b.pos[i]); hi[i % 3] = Math.max(hi[i % 3], b.pos[i]); }
  return { lo, hi };
}

describe('fine house', () => {
  for (const [w, d, floors, o] of CASES) for (const seed of [1, 7, 42, 1234]) {
    const build = () => B.fineHouse(w, d, floors, tr, seeded(seed), o), label = `${w}x${d}x${floors} ${JSON.stringify(o)} seed ${seed}`;
    it(`${label}: same seed, same model`, () => {
      const a = build(), b = build();
      expect(a.pos).toEqual(b.pos); expect(a.col).toEqual(b.col);
    });
    it(`${label}: finite, unit normals, colours in range`, () => {
      const b = build();
      expect(b.triangles).toBeGreaterThan(0);
      expect(b.pos.every(Number.isFinite)).toBe(true);
      for (let i = 0; i < b.nor.length; i += 3) expect(Math.hypot(b.nor[i], b.nor[i + 1], b.nor[i + 2])).toBeCloseTo(1, 6);
      expect(b.col.every((c) => c >= 0 && c <= 1.6)).toBe(true);
    });
    it(`${label}: on its plot and under its height`, () => {
      const { lo, hi } = bounds(build());
      // the plot snapped to fine blocks, plus the jetty (2), the eaves (1.5) or an awning on posts (3) and its hood (1)
      const reach = (Math.round(Math.max(w, d) / V) * V) / 2 + 4 * V;
      expect(lo[0]).toBeGreaterThanOrEqual(-reach); expect(hi[0]).toBeLessThanOrEqual(reach);
      expect(lo[2]).toBeGreaterThanOrEqual(-reach); expect(hi[2]).toBeLessThanOrEqual(reach);
      expect(lo[1]).toBeGreaterThanOrEqual(-1);
      // storeys and cornice, the roof's rise at the steepest pitch, and the tallest chimney or the terrace on top
      const storeys = tr.ground + (o.great ? tr.noble : 0) + Math.max(0, floors - 1 - (o.great ? 1 : 0)) * tr.upper + 1;
      const rise = (Math.max(w, d) / 2) * tr.pitch[1], top = (storeys + Math.max(tr.chimney.height[1], 5.5)) * V + rise;
      expect(hi[1]).toBeLessThanOrEqual(top + 0.3);
    });
  }
  it('the near view costs more triangles than the far view, the far view under a tenth of it', () => {
    const near = B.fineHouse(3, 5, 2, tr, seeded(3), { detail: 1 }).triangles, far = B.fineHouse(3, 5, 2, tr, seeded(3), { detail: 0 }).triangles;
    expect(far).toBeLessThan(near / 10);
  });
});

describe('the Venice tradition keeps its sources', () => {
  const metres = (fine: number) => fine * V * B.METRES_PER_BLOCK, [g0, g1] = venice.geschoss.erdgeschoss_m, [u0, u1] = venice.geschoss.obergeschoss_m;
  it('storey heights lie in Dorigo\'s ranges (8 to 9, 7 to 8 and 14 to 18 piedi), to half a fine block', () => {
    expect(metres(tr.ground)).toBeGreaterThanOrEqual(g0 - metres(0.5)); expect(metres(tr.ground)).toBeLessThanOrEqual(g1 + metres(0.5));
    expect(metres(tr.upper)).toBeGreaterThanOrEqual(u0 - metres(0.5)); expect(metres(tr.upper)).toBeLessThanOrEqual(u1 + metres(0.5));
    expect(metres(tr.noble)).toBeGreaterThanOrEqual(venice.geschoss.piano_nobile_m[0] - metres(0.5));
  });
  it('a fine block is an eighth of a storey of 3 m', () => { expect(V * 8).toBeCloseTo(B.FLOOR, 12); expect(metres(1)).toBeCloseTo(0.375, 12); });
  it('openings, jetty and chimneys follow the measure files', () => {
    expect(tr.window).toEqual([2, 3]); expect(tr.door).toEqual([3, 5]);
    expect(metres(tr.jetty.out)).toBeCloseTo(venice.barbacani.vorsprung_m, 12);
    expect(metres(tr.chimney.height[0])).toBeGreaterThanOrEqual(venice.kamin.hoehe_m[0] - metres(0.5));
    expect(metres(tr.chimney.height[1])).toBeLessThanOrEqual(venice.kamin.hoehe_m[1] + metres(0.5));
    expect(tr.arched).toBe(venice.oeffnungen.bogenanteil);
  });
});
