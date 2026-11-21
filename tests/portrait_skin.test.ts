// The skin as the smooth surface its net of triangles stands for (src/portrait/subdivide.ts, round 84 of the
// portraits: docs/PORTRAITS.md).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PORTRAIT_TEST_WASM } from '../tools/portrait/build_portrait';
import { loadPortraitBuilder } from '../tools/portrait/load';
import { surfaceKind } from '../src/portrait/materials';
import { surfaceGeometry } from '../src/portrait/mesh';
import { APOLEIA } from '../src/portrait/profile';
import { ENGLAND_1356 } from '../src/portrait/profile_1356';
import { smoothSurface, weld } from '../src/portrait/subdivide';
import type { PortraitPerson, PortraitSurface } from '../src/portrait/wire';

/** An icosahedron with its corners at 1 from the middle, its triangles wound so that their normals point out. */
function icosahedron(): Float32Array {
  const t = (1 + Math.sqrt(5)) / 2,
    l = Math.hypot(1, t);
  const v = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ].map((p) => p.map((c) => c / l));
  const f = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  return new Float32Array(f.flatMap((q) => q.flatMap((i) => v[i]!)));
}

/** A flat sheet of `n` by `n` squares of side 1 in the plane z = 0, two triangles a square; with every corner its
 *  own place as two numbers (as the place in an image would be). */
function sheet(n: number): { pos: Float32Array; uv: Float32Array } {
  const pos: number[] = [],
    uv: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      for (const [x, y] of [
        [i, j],
        [i + 1, j],
        [i + 1, j + 1],
        [i, j],
        [i + 1, j + 1],
        [i, j + 1],
      ]) {
        pos.push(x!, y!, 0);
        uv.push(x! / n, y! / n);
      }
    }
  }
  return { pos: new Float32Array(pos), uv: new Float32Array(uv) };
}

/** The mean angle (degrees, weighted by area) between a triangle's own normal and the normals at its corners:
 *  how far the triangles that are drawn stand off the surface they are lit as. Above the height `from` only. */
function faceted(pos: ArrayLike<number>, nrm: ArrayLike<number>, from: number): number {
  let sum = 0,
    area = 0;
  for (let t = 0; t + 8 < pos.length; t += 9) {
    if (pos[t + 1]! < from) continue;
    const ux = pos[t + 3]! - pos[t]!,
      uy = pos[t + 4]! - pos[t + 1]!,
      uz = pos[t + 5]! - pos[t + 2]!;
    const vx = pos[t + 6]! - pos[t]!,
      vy = pos[t + 7]! - pos[t + 1]!,
      vz = pos[t + 8]! - pos[t + 2]!;
    const x = uy * vz - uz * vy,
      y = uz * vx - ux * vz,
      z = ux * vy - uy * vx,
      l = Math.hypot(x, y, z);
    if (!(l > 1e-12)) continue;
    for (let k = 0; k < 3; k++) {
      const d = (x * nrm[t + 3 * k]! + y * nrm[t + 3 * k + 1]! + z * nrm[t + 3 * k + 2]!) / l;
      sum += ((Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI) * l;
      area += l;
    }
  }
  return sum / area;
}

describe('the skin as a smooth surface', { timeout: 20_000 }, () => {
  it('corners at one place are one corner', () => {
    const { place, places } = weld(icosahedron());
    expect(places).toBe(12);
    expect(place.length).toBe(60);
    // every corner of an icosahedron belongs to five triangles
    const uses = new Array(12).fill(0);
    place.forEach((p) => {
      uses[p]++;
    });
    expect(uses).toEqual(new Array(12).fill(5));
  });

  it('a ball of twenty triangles becomes a ball', () => {
    const pos = icosahedron();
    const radii = (levels: number, fit: number) => {
      const s = smoothSurface(pos, [], levels, fit);
      let lo = Infinity,
        hi = 0,
        along = 1;
      for (let i = 0; i < s.pos.length; i += 3) {
        const r = Math.hypot(s.pos[i]!, s.pos[i + 1]!, s.pos[i + 2]!);
        lo = Math.min(lo, r);
        hi = Math.max(hi, r);
        expect(Math.hypot(s.nrm[i]!, s.nrm[i + 1]!, s.nrm[i + 2]!)).toBeCloseTo(1, 5);
        along = Math.min(
          along,
          (s.pos[i]! * s.nrm[i]! + s.pos[i + 1]! * s.nrm[i + 1]! + s.pos[i + 2]! * s.nrm[i + 2]!) / r,
        );
      }
      return { corners: s.pos.length / 3, lo, hi, along };
    };
    // every triangle in four, and again
    expect(radii(1, 0).corners).toBe(4 * 60);
    expect(radii(2, 0).corners).toBe(16 * 60);
    // round to within a hundredth of its radius (the twenty triangles: their middles at 0.795 of the corners'),
    // and the normals point outward along the radius
    for (const [levels, fit] of [
      [1, 0],
      [2, 0],
      [2, 1],
      [3, 60],
    ] as const) {
      const r = radii(levels, fit);
      expect(r.hi / r.lo, `${levels} ${fit}`).toBeLessThan(1.015);
      expect(r.along, `${levels} ${fit}`).toBeGreaterThan(0.999);
    }
    // Loop's surface lies inside its net (so coarse a net: at 0.7 of it); each round of fitting brings it nearer
    // the corners given, and in the end it goes through them
    expect(radii(1, 0).hi).toBeCloseTo(0.708, 2);
    expect(radii(1, 1).hi).toBeGreaterThan(0.9);
    expect(radii(1, 1).hi).toBeLessThan(radii(1, 2).hi);
    expect(radii(1, 2).hi).toBeLessThan(1);
    expect(radii(1, 60).hi).toBeCloseTo(1, 4);
  });

  it('a flat sheet stays flat, its border a border, and what its corners carry is halved along the edges', () => {
    const { pos, uv } = sheet(4);
    const s = smoothSurface(pos, [{ data: uv, size: 2 }], 1, 0);
    expect(s.pos.length).toBe(4 * pos.length);
    let xLo = Infinity,
      xHi = -Infinity;
    for (let i = 0; i < s.pos.length; i += 3) {
      expect(s.pos[i + 2]).toBeCloseTo(0, 6);
      expect([s.nrm[i], s.nrm[i + 1], s.nrm[i + 2]]).toEqual([
        expect.closeTo(0, 5),
        expect.closeTo(0, 5),
        expect.closeTo(1, 5),
      ]);
      xLo = Math.min(xLo, s.pos[i]!);
      xHi = Math.max(xHi, s.pos[i]!);
    }
    // the border does not draw in (a corner of the net in the middle of a border's side stays on it)
    expect([xLo, xHi]).toEqual([expect.closeTo(0, 5), expect.closeTo(4, 5)]);
    // the first triangle (0,0) (1,0) (1,1) becomes four: its own corners keep what they carried, the new ones
    // have the mean of the two ends of their edge
    const carried = Array.from(s.carried[0]!.subarray(0, 24)).map((v) => Math.round(v * 8));
    expect(carried).toEqual([0, 0, 1, 0, 1, 1, /**/ 1, 0, 2, 0, 2, 1, /**/ 1, 1, 2, 1, 2, 2, /**/ 1, 0, 2, 1, 1, 1]);
    // in the middle of the sheet the net is even: a corner there stays where it was
    const at = (x: number, y: number) => {
      for (let i = 0; i < s.pos.length; i += 3)
        if (Math.abs(s.pos[i]! - x) < 1e-4 && Math.abs(s.pos[i + 1]! - y) < 1e-4) return true;
      return false;
    };
    expect(at(2, 2)).toBe(true);
    expect(at(1.5, 2)).toBe(true);
  });

  it('a triangle without area is left out, and a single triangle stays within itself', () => {
    const one = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const s = smoothSurface(one, [], 1, 0);
    expect(s.pos.length).toBe(36);
    // a lone triangle is all border: its outline is rounded as a border curve is, in its own plane
    for (let i = 0; i < s.pos.length; i += 3) {
      expect(s.pos[i + 2]).toBeCloseTo(0, 6);
      expect(Math.min(s.pos[i]!, s.pos[i + 1]!, 1 - s.pos[i]! - s.pos[i + 1]!)).toBeGreaterThan(-1e-6);
      expect([s.nrm[i], s.nrm[i + 1], s.nrm[i + 2]]).toEqual([
        expect.closeTo(0, 5),
        expect.closeTo(0, 5),
        expect.closeTo(1, 5),
      ]);
    }
    const flat = new Float32Array([...one, 2, 2, 2, 2, 2, 2, 3, 3, 3]);
    expect(smoothSurface(flat, [], 1, 0).pos.length).toBe(36);
  });

  it('the skin of a person of England is drawn finer and keeps the head the builder made', () => {
    const england: PortraitPerson[] = JSON.parse(
      readFileSync(resolve(__dirname, 'portrait', 'sample_england.json'), 'utf8'),
    );
    const builder = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const skin = ENGLAND_1356.skin!;
    // once in four after one round of fitting: twice looks the same as once, and from the second round of
    // fitting on the surface waves round the eyes and along the nose
    expect([skin.finer, skin.fit]).toEqual([1, 1]);
    for (const pid of [940007, 940008, 940000]) {
      const p = builder.build(england.find((q) => q.pid === pid)!);
      const s: PortraitSurface = p.surfaces
        .filter((q) => surfaceKind(q) === 'skin')
        .sort((a, b) => b.pos.length - a.pos.length)[0]!;
      const from = p.chin - 0.2;
      const off = (fit: number) => {
        const fine = smoothSurface(
          s.pos,
          [
            { data: s.col, size: 3 },
            { data: s.uv, size: 2 },
          ],
          1,
          fit,
        );
        expect(fine.pos.length).toBe(4 * s.pos.length);
        // corner k of the triangle i given is the first corner of the k-th of its four triangles; of the corners
        // of the head (from a little under the chin up), how far off (mm; the builder's unit is 10 cm) and how
        // far the normal has turned
        const d: number[] = [];
        let turned = 0;
        for (let i = 0; i < s.pos.length / 9; i++) {
          for (let k = 0; k < 3; k++) {
            const a = 3 * (3 * i + k),
              b = 3 * (12 * i + 4 * k);
            if (s.pos[a + 1]! < from) continue;
            d.push(
              100 *
                Math.hypot(
                  fine.pos[b]! - s.pos[a]!,
                  fine.pos[b + 1]! - s.pos[a + 1]!,
                  fine.pos[b + 2]! - s.pos[a + 2]!,
                ),
            );
            turned += fine.nrm[b]! * s.nrm[a]! + fine.nrm[b + 1]! * s.nrm[a + 1]! + fine.nrm[b + 2]! * s.nrm[a + 2]!;
          }
        }
        d.sort((x, y) => x - y);
        return {
          mean: d.reduce((x, y) => x + y, 0) / d.length,
          most: d[Math.floor(0.95 * d.length)]!,
          turned: turned / d.length,
          fine,
        };
      };
      // without fitting a corner of the head is 0.56 to 0.74 mm off in the mean (2 mm at the twentieth worst),
      // after one round 0.24 to 0.33 (0.7 to 1.0)
      const loose = off(0),
        fitted = off(skin.fit);
      expect(loose.mean, `${pid}`).toBeGreaterThan(0.5);
      expect(fitted.mean, `${pid}`).toBeLessThan(0.4);
      expect(fitted.most, `${pid}`).toBeLessThan(1.2);
      expect(fitted.turned, `${pid}`).toBeGreaterThan(0.99);
      // the triangles drawn stand half as far off the surface they are lit as: 9.0 to 9.8 degrees as built, 4.6
      // to 4.9 now
      const built = faceted(s.pos, s.nrm, from),
        now = faceted(fitted.fine.pos, fitted.fine.nrm, from);
      expect(built, `${pid}`).toBeGreaterThan(8);
      expect(now, `${pid}`).toBeLessThan(0.6 * built);
      // and the stage's geometry is that surface, with all it needs to be drawn
      const g = surfaceGeometry(s, skin.finer, skin.fit);
      expect(g.getAttribute('position').count).toBe((4 * s.pos.length) / 3);
      for (const name of ['normal', 'color', 'uv', 'tangent'])
        expect(g.getAttribute(name).count, name).toBe((4 * s.pos.length) / 3);
      expect(Array.from(g.getAttribute('position').array.subarray(0, 9))).toEqual(
        Array.from(fitted.fine.pos.subarray(0, 9)),
      );
    }
  });

  it("Apoleia's skin, and every surface that is not asked to be finer, is drawn as built", () => {
    expect(APOLEIA.skin).toBeNull();
    const s: PortraitSurface = {
      rough: 0.5,
      metal: 0,
      double: false,
      tex: 'real/skin_young_female.webp',
      nmap: '',
      pos: icosahedron(),
      col: new Float32Array(180).fill(0.5),
      uv: new Float32Array(120),
      nrm: icosahedron(),
    };
    const g = surfaceGeometry(s);
    expect(g.getAttribute('position').array).toBe(s.pos);
    expect(Array.from(g.getAttribute('normal').array)).toEqual(Array.from(s.nrm));
    // a surface without normals is a faceted one and stays so
    const faceted = surfaceGeometry({ ...s, nrm: new Float32Array(0) }, 1, 1);
    expect(faceted.getAttribute('position').array).toBe(s.pos);
  });
});
