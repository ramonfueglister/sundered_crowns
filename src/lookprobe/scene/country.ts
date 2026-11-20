// The probe scene's country: the crops of the fields, woods and single trees, tufts on the meadows and the smoke over
// a few houses.
import { type Rnd, fbm2, seeded, smooth } from '../batch';
import { bush, crops, cypress, smoke, speck, tree } from '../blocks';
import {
  CITY,
  FIELDS,
  ISLANDS,
  LAND_Y,
  Mat,
  N,
  ROADS,
  TOWNS,
  fieldAt,
  idx,
  inCity,
  inGrid,
  isWet,
  mountainAt,
  occlude,
  riverDist,
  roadDist,
  toST,
} from '../layout';
import { type Site, inFrame } from './site';

/** The fields' crops. */
export function fields(site: Site): void {
  const { g, things } = site;
  const r = seeded(31);
  for (const f of FIELDS) crops(things, g, f.at, f.w, f.d, f.crop, r);
}

/** Woods and trees, all from one seed, in this order. */
export function woods(site: Site): void {
  const r = seeded(41);
  forest(site, r);
  roadsideCypresses(site, r);
  gardenTrees(site, r);
  islandTrees(site, r);
}

/** Woods dense at the foot of the mountains, along the top of the picture in stands with clearings between, clumps
 *  elsewhere, single trees between. */
function forest(site: Site, r: Rnd): void {
  const { g, things, used } = site;
  const pitch = 2.7;
  const nearTown = (x: number, z: number) => TOWNS.some((t) => Math.hypot(x - t.at[0], z - t.at[1]) < t.r * 0.75);
  for (let gz = 2; gz < N - 2; gz += pitch)
    for (let gx = 2; gx < N - 2; gx += pitch) {
      const x = gx + r.range(-1.5, 1.5),
        z = gz + r.range(-1.5, 1.5),
        roll = r.next(),
        i = idx(Math.floor(x), Math.floor(z));
      if (!inFrame(x, z) || g.wet[i] || g.mat[i] !== Mat.Grass || inCity(x, z)) continue;
      const [s, t] = toST(x, z);
      // right of the stream the top of the picture is open country with stands of trees, not closed wood
      const open = 1 - 0.5 * smooth(0.58, 0.68, s);
      let density = Math.max(
        0.045,
        0.3 * smooth(0.54, 0.66, fbm2(x / 16, z / 16, 71)),
        0.4 * open * smooth(0.29, 0.15, t) * (0.45 + 0.55 * smooth(0.36, 0.56, fbm2(x / 13, z / 13, 73))),
        0.42 * smooth(-7, -1, mountainAt(x, z)),
      );
      if (nearTown(x, z)) density = Math.min(density, 0.1);
      if (roll > density || roadDist(x, z) < 2 || riverDist(x, z) < 3.2 || fieldAt(x, z, 1.2)) continue;
      if (!site.cells(x - 1, z - 1, x + 1, z + 1, (j) => used[j] === 0 && g.wet[j] === 0)) continue;
      const y = g.h[i];
      if (r.chance(density < 0.2 ? 0.45 : 0.15)) {
        cypress(things, x, y, z, r);
        occlude(g, x - 0.6, z - 0.6, x + 0.6, z + 0.6, y + 4.2);
        site.count('tree');
        continue;
      }
      // the trees of the woods are larger than those between the fields
      tree(things, x, y, z, r, density > 0.3 ? r.range(0.9, 1.55) : r.range(0.85, 1.2));
      occlude(g, x - 1.05, z - 1.05, x + 1.05, z + 1.05, y + 3.4);
      site.count('tree');
    }
}

/** Cypresses beside the roads, every few steps on one side or the other. */
function roadsideCypresses(site: Site, r: Rnd): void {
  const { g, things, used } = site;
  for (const road of ROADS)
    for (let i = 0; i + 1 < road.length; i++) {
      const a = road[i],
        c = road[i + 1],
        len = Math.hypot(c[0] - a[0], c[1] - a[1]),
        dx = (c[0] - a[0]) / len,
        dz = (c[1] - a[1]) / len;
      for (let k = 3; k < len; k += r.range(4, 9)) {
        const side = r.pick([-1, 1]) * r.range(2.6, 3.4),
          x = a[0] + dx * k - dz * side,
          z = a[1] + dz * k + dx * side;
        if (
          !inGrid(Math.floor(x), Math.floor(z)) ||
          inCity(x, z) ||
          fieldAt(x, z, 0.8) ||
          g.mat[idx(Math.floor(x), Math.floor(z))] !== Mat.Grass
        )
          continue;
        if (!site.cells(x - 1, z - 1, x + 1, z + 1, (j) => used[j] === 0 && g.wet[j] === 0)) continue;
        cypress(things, x, site.baseY(x, z), z, r);
        site.claim(x - 0.6, z - 0.6, x + 0.6, z + 0.6);
        occlude(g, x - 0.6, z - 0.6, x + 0.6, z + 0.6, site.baseY(x, z) + 4.2);
        site.count('tree');
      }
    }
}

/** Garden trees on the squares and corners that the houses of the city left open. */
function gardenTrees(site: Site, r: Rnd): void {
  const { g, things, used } = site;
  for (const part of CITY)
    for (let k = 0; k < 90; k++) {
      const at = r.pick(part),
        x = at[0] + r.range(-45, 45),
        z = at[1] + r.range(-45, 45);
      if (
        !inGrid(Math.floor(x), Math.floor(z)) ||
        !inCity(x, z) ||
        !site.cells(x - 1.4, z - 1.4, x + 1.4, z + 1.4, (j) => used[j] === 0 && g.wet[j] === 0)
      )
        continue;
      if (r.chance(0.4)) cypress(things, x, site.baseY(x, z), z, r);
      else tree(things, x, site.baseY(x, z), z, r);
      site.claim(x - 1, z - 1, x + 1, z + 1);
      occlude(g, x - 0.9, z - 0.9, x + 0.9, z + 0.9, site.baseY(x, z) + 3.4);
      site.count('tree');
    }
}

/** Cypresses and garden trees beside the houses on the islands. */
function islandTrees(site: Site, r: Rnd): void {
  const { g, things, used } = site;
  for (const isle of ISLANDS)
    for (let k = 0; k < (isle.kind === 'tower' ? 8 : 30); k++) {
      const x = isle.at[0] + r.range(-isle.rx, isle.rx) * 0.75,
        z = isle.at[1] + r.range(-isle.rz, isle.rz) * 0.75;
      if (isWet(g, x, z) || !site.cells(x - 1, z - 1, x + 1, z + 1, (j) => used[j] === 0 && g.wet[j] === 0)) continue;
      if (site.baseY(x, z) < LAND_Y) continue;
      if (r.chance(0.7)) cypress(things, x, site.baseY(x, z), z, r);
      else tree(things, x, site.baseY(x, z), z, r);
      occlude(g, x - 0.8, z - 0.8, x + 0.8, z + 0.8, site.baseY(x, z) + 3.6);
      site.count('tree');
    }
}

/** Tufts on the meadows, smoke over a few houses of the towns. */
export function meadows(site: Site): void {
  const { g, things, used } = site;
  const r = seeded(61);
  for (let k = 0; k < 17000; k++) {
    const x = r.range(2, N - 2),
      z = r.range(2, N - 2),
      i = idx(Math.floor(x), Math.floor(z)),
      road = roadDist(x, z);
    // stones and flowers lie mostly along the paths, few out on the meadows
    if (!inFrame(x, z) || g.mat[i] !== Mat.Grass || g.wet[i] || used[i] || road < 1.5 || (road > 4 && k % 3)) continue;
    if (k % 3 === 0) bush(things, x, g.h[i], z, r);
    else speck(things, x, g.h[i], z, r);
  }
  for (const k of [3, 21, 40]) if (site.hearths[k]) smoke(things, ...site.hearths[k], r);
}
