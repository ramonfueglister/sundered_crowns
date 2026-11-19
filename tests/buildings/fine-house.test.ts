// The fine-block house of the near view: the same seed gives the same model, the model is sound, it stays on its plot
// and under its height, and the Venice tradition keeps the measures of its sources (Dorigo's storey heights, the
// reference class's openings, Lupo's chimneys).
import { describe, expect, it } from 'vitest';
import { type Batch, seeded } from '../../src/lookprobe/batch';
import * as B from '../../src/buildings';
import venice from '../../src/buildings/traditions/measures/venedig_1356.json';

const V = B.VOXEL,
  tr = B.VENICE;
const CASES: [number, number, number, B.HouseOptions][] = [
  [3, 5, 2, {}],
  [2.5, 4, 3, { shop: true, canal: 'nz' }],
  [7, 9, 3, { great: true, canal: 'nz' }],
  [3.5, 6, 2, { detail: 0 }],
  [3, 5, 3, { blind: ['nx', 'px'], front: 'pz' }],
];

function bounds(b: Batch) {
  const lo = [Infinity, Infinity, Infinity],
    hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < b.pos.length; i++) {
    lo[i % 3] = Math.min(lo[i % 3], b.pos[i]);
    hi[i % 3] = Math.max(hi[i % 3], b.pos[i]);
  }
  return { lo, hi };
}

describe('fine house', () => {
  for (const [w, d, floors, o] of CASES)
    for (const seed of [1, 7, 42, 1234]) {
      const build = () => B.fineHouse(w, d, floors, tr, seeded(seed), o),
        label = `${w}x${d}x${floors} ${JSON.stringify(o)} seed ${seed}`;
      it(`${label}: same seed, same model`, () => {
        const a = build(),
          b = build();
        expect(a.pos).toEqual(b.pos);
        expect(a.col).toEqual(b.col);
      });
      it(`${label}: finite, unit normals, colours in range`, () => {
        const b = build();
        expect(b.triangles).toBeGreaterThan(0);
        expect(b.pos.every(Number.isFinite)).toBe(true);
        for (let i = 0; i < b.nor.length; i += 3)
          expect(Math.hypot(b.nor[i], b.nor[i + 1], b.nor[i + 2])).toBeCloseTo(1, 6);
        expect(b.col.every((c) => c >= 0 && c <= 1.6)).toBe(true);
      });
      it(`${label}: on its plot and under its height`, () => {
        const { lo, hi } = bounds(build());
        // the plot snapped to fine blocks, plus the jetty (2), the eaves (1.5) or an awning on posts (3) and its hood (1)
        const reach = (Math.round(Math.max(w, d) / V) * V) / 2 + 4 * V;
        expect(lo[0]).toBeGreaterThanOrEqual(-reach);
        expect(hi[0]).toBeLessThanOrEqual(reach);
        expect(lo[2]).toBeGreaterThanOrEqual(-reach);
        expect(hi[2]).toBeLessThanOrEqual(reach);
        expect(lo[1]).toBeGreaterThanOrEqual(-1);
        // storeys and cornice, the roof's rise at the steepest pitch, and the tallest chimney or the terrace on top
        const storeys =
          tr.ground + (o.great ? tr.noble : 0) + Math.max(0, floors - 1 - (o.great ? 1 : 0)) * tr.upper + 1;
        const rise = (Math.max(w, d) / 2) * tr.pitch[1],
          top = (storeys + Math.max(tr.chimney.height[1], 5.5)) * V + rise;
        expect(hi[1]).toBeLessThanOrEqual(top + 0.3);
      });
    }
  it('the near view costs more triangles than the far view, the far view under a tenth of it', () => {
    const near = B.fineHouse(3, 5, 2, tr, seeded(3), { detail: 1 }).triangles,
      far = B.fineHouse(3, 5, 2, tr, seeded(3), { detail: 0 }).triangles;
    expect(far).toBeLessThan(near / 10);
  });
});

describe('the house the settlement chooses', () => {
  it('Italy gets the fine-block house of Venice, Germany the house of its style, both under their stated height', () => {
    for (const [region, fine] of [
      ['italy', true],
      ['germany', false],
    ] as const)
      for (const detail of [0, 1] as const) {
        const r = seeded(5),
          st = B.styleOf(region),
          c = B.houseOf(st, 3, 5, 2, r.pick(st.house.walls), r.pick(st.house.roofs), r, detail);
        expect(!!st.tradition).toBe(fine);
        let top = -Infinity;
        for (let i = 1; i < c.model.pos.length; i += 3) top = Math.max(top, c.model.pos[i]);
        expect(top).toBeLessThanOrEqual(c.height + 0.01);
      }
  });
});

describe('the Venice tradition keeps its sources', () => {
  const metres = (fine: number) => fine * V * B.METRES_PER_BLOCK,
    [g0, g1] = venice.geschoss.erdgeschoss_m,
    [u0, u1] = venice.geschoss.obergeschoss_m;
  it("storey heights lie in Dorigo's ranges (8 to 9, 7 to 8 and 14 to 18 piedi), to half a fine block", () => {
    expect(metres(tr.ground)).toBeGreaterThanOrEqual(g0 - metres(0.5));
    expect(metres(tr.ground)).toBeLessThanOrEqual(g1 + metres(0.5));
    expect(metres(tr.upper)).toBeGreaterThanOrEqual(u0 - metres(0.5));
    expect(metres(tr.upper)).toBeLessThanOrEqual(u1 + metres(0.5));
    expect(metres(tr.noble)).toBeGreaterThanOrEqual(venice.geschoss.piano_nobile_m[0] - metres(0.5));
  });
  it('a fine block is an eighth of a storey of 3 m', () => {
    expect(V * 8).toBeCloseTo(B.FLOOR, 12);
    expect(metres(1)).toBeCloseTo(0.375, 12);
  });
  it('openings, jetty and chimneys follow the measure files', () => {
    expect(tr.window).toEqual([2, 3]);
    expect(tr.door).toEqual([3, 5]);
    expect(metres(tr.jetty.out)).toBeCloseTo(venice.barbacani.vorsprung_m, 12);
    expect(metres(tr.chimney.height[0])).toBeGreaterThanOrEqual(venice.kamin.hoehe_m[0] - metres(0.5));
    expect(metres(tr.chimney.height[1])).toBeLessThanOrEqual(venice.kamin.hoehe_m[1] + metres(0.5));
    expect(tr.arched).toBe(venice.oeffnungen.bogenanteil);
  });
});

describe('what a house shows from afar (shownOf)', () => {
  /** the colour that covers most of the faces `of` kind (by their normal's height), by their area */
  const most = (b: Batch, of: (ny: number) => boolean) => {
    const areas = new Map<string, number>();
    for (let t = 0; t < b.triangles; t++) {
      if (!of(b.nor[t * 9 + 1])) continue;
      const p = b.pos,
        o = t * 9,
        u = [p[o + 3] - p[o], p[o + 4] - p[o + 1], p[o + 5] - p[o + 2]],
        v = [p[o + 6] - p[o], p[o + 7] - p[o + 1], p[o + 8] - p[o + 2]];
      const key = [0, 1, 2].map((k) => b.col[o + k]).join(','),
        area = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
      areas.set(key, (areas.get(key) ?? 0) + area);
    }
    return [...areas.entries()]
      .sort((a, c) => c[1] - a[1])[0][0]
      .split(',')
      .map(Number);
  };
  /** the same hue: one colour is the other, lighter or darker */
  const shadeOf = (a: readonly number[], b: readonly number[]) => {
    const by = a[0] / b[0];
    expect(a[1] / b[1]).toBeCloseTo(by, 3);
    expect(a[2] / b[2]).toBeCloseTo(by, 3);
  };
  const drawn: [number, number, number] = [0.1, 0.5, 0.9];

  it('is the wall its house is built of and the roof of its tradition, where the land has one', () => {
    const style = B.styleOf('italy');
    for (const seed of [1, 77, 12345]) {
      const shown = B.shownOf(style, drawn, drawn, seed),
        { model } = B.houseOf(style, 6, 8, 2, drawn, drawn, seeded(seed), 0);
      expect(tr.walls).toContainEqual(shown.wall);
      expect(shown.roof).toEqual(tr.roof);
      // most of the house's upright faces are that wall
      shadeOf(
        most(model, (ny) => Math.abs(ny) < 0.1),
        shown.wall,
      );
    }
  });
  it('is the colours drawn from the style elsewhere', () => {
    const shown = B.shownOf(B.styleOf('france'), drawn, [0.9, 0.5, 0.1], 5);
    expect(B.styleOf('france').tradition).toBeUndefined();
    expect(shown).toEqual({ wall: drawn, roof: [0.9, 0.5, 0.1] });
  });
});
