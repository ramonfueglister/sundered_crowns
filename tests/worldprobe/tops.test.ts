// The joined tops of a near piece: one rectangle where columns of one height lie side by side, and each column's own
// colours in the field, so that the picture stays as it was.
import { describe, expect, it } from 'vitest';
import { FACE_COL, FACE_GEO, FIELD_SIDE, FLIPPED } from '../../src/lookprobe/faces';
import { onGrid } from '../../src/lookprobe/layout';
import { glide } from '../../src/worldprobe/glide';
import { faced, small } from '../../src/worldprobe/small';
import { drawGround, drawTable, tableOf } from '../../src/worldprobe/table';
import { joinTops } from '../../src/worldprobe/tops';
import { LAND_STEP, SIDE, land, part } from './land';

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

  it('of a far piece that glides join only tops that end at one height, and keep the colours they end with', () => {
    const own = onGrid(SIDE, () => {
      const fine = tableOf(land(4000, -1200, 0).g, land(4000, -1200, 0).t, part),
        parent = tableOf(
          land(4000 / 2 - 24, -1200 / 2 - 24, 21, 53).g,
          land(4000 / 2 - 24, -1200 / 2 - 24, 21, 53).t,
          part,
        );
      const drawn = drawTable(fine, true, LAND_STEP),
        ground = faced(drawn.ground);
      glide(
        { ground, carried: faced(drawn.carried!), water: faced(drawn.water), raised: small(drawn.raised) },
        fine,
        parent,
        true,
        LAND_STEP,
      );
      return ground;
    });
    const f = own.faces!,
      joined = joinTops(own, part.x0, part.z0),
      tops = joined.tops!;
    expect(tops.aim).toBeDefined();
    // where each column's top ends, and the colours it ends with, by its column
    const ends = new Map<string, number>();
    for (let k = 0; k < f.geo.length / FACE_GEO; k++) {
      const g = f.geo.subarray(k * FACE_GEO, (k + 1) * FACE_GEO);
      if (
        g[0] % FLIPPED !== 1 ||
        f.nor[k * 4 + 1] !== 127 ||
        Math.abs(g[3] - g[2]) !== S ||
        Math.abs(g[5] - g[4]) !== S
      )
        continue;
      const x = Math.min(g[2], g[3]) / S,
        z = Math.min(g[4], g[5]) / S;
      if (ends.has(`${x},${z}`)) continue;
      ends.set(`${x},${z}`, f.aim![k * 2]);
      for (let c = 0; c < 4; c++) {
        const right = (c === 1 || c === 2 ? g[3] : g[2]) > Math.min(g[2], g[3]) ? 1 : 0,
          below = (c >= 2 ? g[5] : g[4]) > Math.min(g[4], g[5]) ? 1 : 0,
          at = ((2 * (z - part.z0) + below) * FIELD_SIDE + 2 * (x - part.x0) + right) * 4;
        expect(Array.from(tops.aimTones!.subarray(at, at + 4))).toEqual(
          Array.from(f.aimCol!.subarray(k * FACE_COL + c * 4, k * FACE_COL + c * 4 + 4)),
        );
      }
    }
    for (let k = 0; k < tops.geo.length / FACE_GEO; k++) {
      const g = tops.geo.subarray(k * FACE_GEO, (k + 1) * FACE_GEO);
      for (let z = (Math.min(g[4], g[5]) + 1) / S; z < (Math.max(g[4], g[5]) - 1) / S; z++)
        for (let x = (Math.min(g[2], g[3]) + 1) / S; x < (Math.max(g[2], g[3]) - 1) / S; x++)
          expect(ends.get(`${x},${z}`)).toBe(tops.aim![k * 2]);
    }
    // the faces that stay keep where they end, and the colours they end with
    expect(joined.faces!.aim!.length).toBe((joined.faces!.geo.length / FACE_GEO) * 2);
    expect(tops.geo.length / FACE_GEO).toBeLessThan(ends.size / 2);
  });
});
