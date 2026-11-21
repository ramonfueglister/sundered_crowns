// What stands on the water before the towns: landing stages from the quays, rowing boats about them and a ship now
// and then farther out, as the look probe's scene has them (src/lookprobe/scene/waterside.ts). A sketch for a picture
// of what the coast of the world lacks (Ramon, 21 November 2026); the places are chosen by the ground alone.
import * as THREE from 'three/webgpu';
import { Batch, seeded } from '../lookprobe/batch';
import { boat, pier, ship } from '../lookprobe/blocks';
import { type Ground, Mat, N, SEA_Y, idx } from '../lookprobe/layout';

/** a landing stage needs this many columns of open water before it, and lies at least PIER_APART columns from the next */
const PIER_OPEN = 8,
  PIER_APART = 15;
/** a ship beside the world's houses: this share of the look probe's (whose houses are smaller) */
const SHIP_SIZE = 0.62;
const WAYS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Builds the landing stages, boats and ships of the ground's paved shores into `things` (`own`: the columns the piece draws). */
export function waterside(
  g: Ground,
  things: Batch,
  own: (x: number, z: number) => boolean,
  counts: Record<string, number>,
): void {
  const r = seeded(811 + (g.ox ?? 0) * 31 + (g.oz ?? 0) * 17);
  const wet = (x: number, z: number) => x >= 0 && z >= 0 && x < N && z < N && g.wet[idx(x, z)] === 1;
  const open = (x: number, z: number, dx: number, dz: number) => {
    for (let k = 1; k <= PIER_OPEN; k++) if (!wet(x + dx * k, z + dz * k)) return false;
    return true;
  };
  const made: [number, number][] = [];
  const count = (kind: string) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
  };
  for (let z = 2; z < N - 2; z++)
    for (let x = 2; x < N - 2; x++) {
      const i = idx(x, z);
      if (g.wet[i] || g.mat[i] !== Mat.Paved || !own(x, z)) continue;
      if (made.some((p) => Math.hypot(p[0] - x, p[1] - z) < PIER_APART)) continue;
      const way = WAYS.find(([dx, dz]) => open(x, z, dx, dz));
      if (!way) continue;
      made.push([x, z]);
      const [dx, dz] = way,
        len = 5 + ((x * 7 + z * 3) % 3),
        deck = Math.min(g.h[i], SEA_Y + 1) - 0.35;
      if (dx) pier(things, dx > 0 ? x + 1 : x - len, z + 0.5, 'x', len, deck);
      else pier(things, x + 0.5, dz > 0 ? z + 1 : z - len, 'z', len, deck);
      count('pier');
      // two or three boats about the stage's end, and before every third stage a ship farther out
      const ex = x + 0.5 + dx * (len + 1),
        ez = z + 0.5 + dz * (len + 1);
      for (let k = 0, tries = 0; k < 2 + (made.length % 2) && tries < 40; tries++) {
        const bx = ex + r.range(-5, 5),
          bz = ez + r.range(-5, 5);
        if (!wet(Math.floor(bx), Math.floor(bz)) || g.shore[idx(Math.floor(bx), Math.floor(bz))] < 2) continue;
        boat(things, bx, bz, r);
        count('boat');
        k++;
      }
      if (made.length % 3 !== 1) continue;
      for (let tries = 0; tries < 40; tries++) {
        const sx = ex + dx * r.range(7, 18) + dz * r.range(-9, 9),
          sz = ez + dz * r.range(7, 18) + dx * r.range(-9, 9);
        if (!wet(Math.floor(sx), Math.floor(sz)) || g.shore[idx(Math.floor(sx), Math.floor(sz))] < 6) continue;
        const one = new Batch();
        ship(one, 0, 0, Math.floor(r.range(0, 4)));
        things.append(
          one,
          new THREE.Matrix4().makeScale(SHIP_SIZE, SHIP_SIZE, SHIP_SIZE).setPosition(sx, SEA_Y * (1 - SHIP_SIZE), sz),
        );
        count('ship');
        break;
      }
    }
}
