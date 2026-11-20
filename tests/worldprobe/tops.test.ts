// The joined tops of a near piece: one rectangle where columns of one height lie side by side, and each column's own
// colours in the field, so that the picture stays as it was.
import { describe, expect, it } from 'vitest';
import { FACE_COL, FACE_GEO, FIELD_SIDE, FLIPPED } from '../../src/lookprobe/faces';
import { onGrid } from '../../src/lookprobe/layout';
import { faced } from '../../src/worldprobe/small';
import { drawGround } from '../../src/worldprobe/table';
import { joinTops } from '../../src/worldprobe/tops';
import { SIDE, land, part } from './land';

const S = 64;

function shapes() {
  return onGrid(SIDE, () => {
    const { g, t } = land(),
      own = faced(drawGround(g, t, true, part, true).ground);
    return { own, joined: joinTops(own, part.x0, part.z0) };
  });
}

describe('the joined tops of a near piece', () => {
  it('cover each level top of a column once, at its height, and keep every other face as it was', () => {
    const { own, joined } = shapes(),
      f = own.faces!,
      tops = joined.tops!,
      rest = joined.faces!;
    const wanted = new Map<string, number>(),
      others: string[] = [];
    for (let k = 0; k < f.geo.length / FACE_GEO; k++) {
      const g = f.geo.subarray(k * FACE_GEO, (k + 1) * FACE_GEO);
      if (g[0] % FLIPPED === 1 && Math.abs(g[3] - g[2]) === S && Math.abs(g[5] - g[4]) === S)
        wanted.set(`${Math.min(g[2], g[3]) / S},${Math.min(g[4], g[5]) / S}`, g[1]);
      else others.push(`${g.join(' ')}|${f.col.subarray(k * FACE_COL, (k + 1) * FACE_COL).join(' ')}`);
    }
    const kept = Array.from(
      { length: rest.geo.length / FACE_GEO },
      (_, k) =>
        `${rest.geo.subarray(k * FACE_GEO, (k + 1) * FACE_GEO).join(' ')}|${rest.col.subarray(k * FACE_COL, (k + 1) * FACE_COL).join(' ')}`,
    );
    expect(kept).toEqual(others);
    // (a rectangle reaches a 64th of a block over its columns' edges)
    const covered = new Map<string, number>();
    for (let k = 0; k < tops.geo.length / FACE_GEO; k++) {
      const g = tops.geo.subarray(k * FACE_GEO, (k + 1) * FACE_GEO),
        x0 = (Math.min(g[2], g[3]) + 1) / S,
        x1 = (Math.max(g[2], g[3]) - 1) / S,
        z0 = (Math.min(g[4], g[5]) + 1) / S,
        z1 = (Math.max(g[4], g[5]) - 1) / S;
      expect([x0, x1, z0, z1].every(Number.isInteger)).toBe(true);
      for (let z = z0; z < z1; z++)
        for (let x = x0; x < x1; x++) {
          expect(covered.has(`${x},${z}`)).toBe(false);
          covered.set(`${x},${z}`, g[1]);
        }
    }
    expect(covered).toEqual(wanted);
    expect(tops.geo.length / FACE_GEO).toBeLessThan(wanted.size / 3);
  });

  it("keep the colours of each column's four corners in the field", () => {
    const { own, joined } = shapes(),
      f = own.faces!,
      tones = joined.tops!.tones;
    let seen = 0;
    for (let k = 0; k < f.geo.length / FACE_GEO; k++) {
      const g = f.geo.subarray(k * FACE_GEO, (k + 1) * FACE_GEO);
      if (g[0] % FLIPPED !== 1 || Math.abs(g[3] - g[2]) !== S || Math.abs(g[5] - g[4]) !== S) continue;
      const x = Math.min(g[2], g[3]) / S - part.x0,
        z = Math.min(g[4], g[5]) / S - part.z0;
      // the corners at (u0, v0), (u1, v0), (u1, v1), (u0, v1) of the face, each where its place in the column puts it
      for (let c = 0; c < 4; c++) {
        const right = (c === 1 || c === 2 ? g[3] : g[2]) > Math.min(g[2], g[3]) ? 1 : 0,
          below = (c >= 2 ? g[5] : g[4]) > Math.min(g[4], g[5]) ? 1 : 0;
        const at = ((2 * z + below) * FIELD_SIDE + 2 * x + right) * 4;
        expect(Array.from(tones.subarray(at, at + 4))).toEqual(
          Array.from(f.col.subarray(k * FACE_COL + c * 4, k * FACE_COL + c * 4 + 4)),
        );
      }
      seen++;
    }
    expect(seen).toBeGreaterThan(500);
  });
});
