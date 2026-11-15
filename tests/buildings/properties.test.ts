// Properties every building must keep, whatever its tradition: the same seed gives the same model, every number in it
// is finite, normals are unit length, a house stays on its footprint and under its height, and the code can run in
// the world's web workers.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Batch, seeded } from '../../src/lookprobe/batch';
import * as B from '../../src/buildings';

const STYLES = { SOUTH: B.SOUTH, NORTH: B.NORTH, TIMBER: B.TIMBER, TERRACE: B.TERRACE };
/** the roof's overhang and the clutter on it reach this far past the walls */
const OVERHANG = 0.2 + 0.11;
/** walls stand one unit into the ground so that a house also sits on steps */
const FOOTING = 1;

function bounds(b: Batch) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < b.pos.length; i++) { lo[i % 3] = Math.min(lo[i % 3], b.pos[i]); hi[i % 3] = Math.max(hi[i % 3], b.pos[i]); }
  return { lo, hi };
}

describe('houses', () => {
  for (const [name, style] of Object.entries(STYLES)) for (const seed of [1, 7, 42, 99, 1234]) for (const [w, d, floors] of [[3, 3, 1], [4, 5, 2], [14, 6, 3]] as const) {
    const make = (f: typeof B.house) => () => { const r = seeded(seed); return f(w, d, floors, r.pick(style.walls), r.pick(style.roofs), r, style); };
    for (const [kind, build] of [['house', make(B.house)], ['townHouse', make(B.townHouse)]] as const) {
      const label = `${kind} ${name} seed ${seed} ${w}x${d}x${floors}`;
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
      it(`${label}: on its footprint and under its height`, () => {
        const { lo, hi } = bounds(build());
        expect(lo[0]).toBeGreaterThanOrEqual(-w / 2 - OVERHANG);
        expect(hi[0]).toBeLessThanOrEqual(w / 2 + OVERHANG);
        expect(lo[2]).toBeGreaterThanOrEqual(-d / 2 - OVERHANG);
        expect(hi[2]).toBeLessThanOrEqual(d / 2 + OVERHANG);
        expect(lo[1]).toBeGreaterThanOrEqual(-FOOTING);
        // walls, then a terrace with a small room of 1.5 on it, or eaves, roof and chimneys up to 1 above the ridge; on a
        // town house also a tower one storey and a third above the house under a pointed roof
        const walls = floors * B.FLOOR + B.m(0.45), roofed = style.flat ? walls + B.m(2.1) : walls + B.m(0.17) + style.maxRise + B.m(1.14);
        const tower = kind === 'townHouse' ? (floors + 1.3) * B.FLOOR + B.m(0.17) + B.m(1.57) : 0;
        expect(hi[1]).toBeLessThanOrEqual(Math.max(roofed, tower + 0.2));
      });
    }
  }
});

describe('every model the map places', () => {
  const models: [string, B.Model][] = [];
  for (const region of ['italy', 'germany', 'greece', 'rus', 'egypt']) { const s = B.styleOf(region); models.push([`${region} church`, s.church], [`${region} great`, s.great]); }
  for (const [id, parts] of Object.entries(B.MONUMENTS)) parts.forEach((p, k) => models.push([`${id} ${k}`, p.model]));
  for (const [name, m] of models) it(`${name}: deterministic and finite`, () => {
    const a = m.build(seeded(5)), b = m.build(seeded(5));
    expect(a.pos).toEqual(b.pos);
    expect(a.pos.every(Number.isFinite)).toBe(true);
  });
});

describe('the building code can run in a web worker', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []; });
  for (const file of files('src/buildings')) it(file, () => {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/\b(document|window|localStorage|requestAnimationFrame)\./);
    expect(src).not.toMatch(/from '(preact|three)/);
    expect(src.split('\n').length).toBeLessThanOrEqual(300);
  });
});
