// The life of the probe scene: market stalls and goods by the water, people on the square, the quays and the roads,
// sheep on two meadows.
import { seeded } from '../batch';
import { crate, person, sheep, stall } from '../blocks';
import { LAND_Y, Mat, N, ROADS, SITES, idx, inCity, inGrid, isWet, toXZ } from '../layout';
import { type Site, inFrame } from './site';

/** Market stalls on the square, goods on the paving near the water. */
export function market(site: Site): void {
  const { g, things, used } = site;
  const r = seeded(71),
    p = SITES.plaza;
  for (let k = 0; k < 5; k++) {
    const x = p.at[0] + r.range(-p.w, p.w) * 0.4,
      z = p.at[1] + r.range(-p.d, p.d) * 0.4;
    if (site.cells(x - 1.5, z - 1.2, x + 1.5, z + 1.2, (j) => g.wet[j] === 0)) {
      stall(things, x, site.baseY(x, z), z, r);
      site.count('stall');
    }
  }
  for (let k = 0; k < 9000; k++) {
    const x = r.range(2, N - 2),
      z = r.range(2, N - 2),
      i = idx(Math.floor(x), Math.floor(z));
    if (
      g.mat[i] === Mat.Paved &&
      !g.wet[i] &&
      !used[i] &&
      g.shore[i] === 0 &&
      inFrame(x, z) &&
      site.cells(x - 3, z - 3, x + 3, z + 3, (j) => g.wet[j] === 0) === false
    ) {
      crate(things, x, g.h[i], z, r);
      site.count('crate');
    }
  }
}

/** People on the square, the quay and the roads; sheep on two meadows. */
export function people(site: Site): void {
  const { g, things, used } = site;
  const r = seeded(51),
    p = SITES.plaza;
  for (let k = 0; k < 34; k++) {
    const x = p.at[0] + r.range(-p.w, p.w) * 0.48,
      z = p.at[1] + r.range(-p.d, p.d) * 0.48;
    if (!isWet(g, x, z)) {
      person(things, x, site.baseY(x, z), z, r);
      site.count('person');
    }
  }
  for (const road of ROADS)
    for (let i = 0; i + 1 < road.length; i++)
      for (let k = 0; k < 8; k++) {
        const q = r.next(),
          x = road[i][0] + (road[i + 1][0] - road[i][0]) * q + r.range(-0.6, 0.6),
          z = road[i][1] + (road[i + 1][1] - road[i][1]) * q + r.range(-0.6, 0.6);
        if (
          inGrid(Math.floor(x), Math.floor(z)) &&
          !isWet(g, x, z) &&
          !used[idx(Math.floor(x), Math.floor(z))] &&
          inFrame(x, z)
        ) {
          person(things, x, site.baseY(x, z), z, r);
          site.count('person');
        }
      }
  // townsfolk in the streets and on the quays of the city
  for (let k = 0, tries = 0; k < 40 && tries < 20000; tries++) {
    const x = r.range(2, N - 2),
      z = r.range(2, N - 2),
      i = idx(Math.floor(x), Math.floor(z));
    if (g.mat[i] === Mat.Paved && !g.wet[i] && !used[i] && inCity(x, z) && g.h[i] === LAND_Y) {
      person(things, x, g.h[i], z, r);
      site.count('person');
      k++;
    }
  }
  for (const [s, t] of [
    [0.105, 0.455],
    [0.59, 0.19],
  ] as const)
    for (let k = 0; k < 9; k++) {
      const at = toXZ(s, t),
        x = at[0] + r.range(-6, 6),
        z = at[1] + r.range(-6, 6),
        i = idx(Math.floor(x), Math.floor(z));
      if (g.mat[i] === Mat.Grass && !g.wet[i] && !used[i]) {
        sheep(things, x, g.h[i], z, r);
        site.count('sheep');
      }
    }
}
