// The probe scene by the water: piers along the city quay, bridges where the roads cross the river, the ships and the
// rowing boats.
import { seeded } from '../batch';
import { boat, pier, ship } from '../blocks';
import { bridge } from '../../buildings';
import { LAND_Y, N, type P2, ROADS, SHIPS, idx, inCity, inGrid, isWet, riverDist } from '../layout';
import { type Site, inFrame } from './site';

/** Piers wherever the city quay looks onto open water, every few cells. */
export function piers(site: Site): void {
  const { g, things } = site;
  const made: P2[] = [],
    deck = LAND_Y - 0.35;
  const open = (x: number, z: number, dx: number, dz: number) => {
    for (let k = 1; k <= 8; k++)
      if (!inGrid(x + dx * k, z + dz * k) || !g.wet[idx(x + dx * k, z + dz * k)]) return false;
    return true;
  };
  for (let z = 2; z < N - 10; z++)
    for (let x = 2; x < N - 10; x++) {
      if (g.wet[idx(x, z)] || !inCity(x + 0.5, z + 0.5) || made.some((p) => Math.hypot(p[0] - x, p[1] - z) < 9))
        continue;
      const dir = open(x, z, 1, 0) ? 'x' : open(x, z, 0, 1) ? 'z' : null;
      if (!dir) continue;
      made.push([x, z]);
      const len = 7 + ((x * 7 + z * 3) % 3);
      if (dir === 'x') pier(things, x + 1, z + 0.5, 'x', len, deck);
      else pier(things, x + 0.5, z + 1, 'z', len, deck);
      site.count('pier');
    }
}

/** Bridges wherever a road runs over the river. */
export function bridges(site: Site): void {
  const { g } = site;
  const made: P2[] = [];
  for (const road of ROADS)
    for (let i = 0; i + 1 < road.length; i++) {
      const a = road[i],
        c = road[i + 1],
        len = Math.hypot(c[0] - a[0], c[1] - a[1]),
        dx = (c[0] - a[0]) / len,
        dz = (c[1] - a[1]) / len;
      let from = -1;
      for (let k = 0; k <= len; k += 0.25) {
        const wet = isWet(g, a[0] + dx * k, a[1] + dz * k);
        if (wet && from < 0) from = k;
        if (!wet && from >= 0) {
          const mid = (from + k) / 2,
            x = a[0] + dx * mid,
            z = a[1] + dz * mid,
            span = k - from;
          if (from > 0 && span < 9 && !made.some((p) => Math.hypot(p[0] - x, p[1] - z) < 8)) {
            made.push([x, z]);
            site.put(bridge(span), x, LAND_Y, z, Math.atan2(-dz, dx));
            site.count('bridge');
          }
          from = -1;
        }
      }
    }
}

/** The ships of the reference picture. */
export function ships(site: Site): void {
  const { things } = site;
  for (const s of SHIPS) {
    ship(things, s.at[0], s.at[1], s.heading);
    site.count('ship');
  }
}

/** Rowing boats on the water before the quays. */
export function boats(site: Site): void {
  const { g, things } = site;
  const r = seeded(81);
  for (let k = 0, tries = 0; k < 28 && tries < 4000; tries++) {
    const x = r.range(2, N - 2),
      z = r.range(2, N - 2),
      i = idx(Math.floor(x), Math.floor(z));
    if (g.wet[i] && g.shore[i] >= 3 && g.shore[i] <= 9 && inFrame(x, z) && riverDist(x, z) > 12) {
      boat(things, x, z, r);
      site.count('boat');
      k++;
    }
  }
}
