// The probe scene's buildings: the landmarks of the city, the city's houses, the towns with their towers and churches,
// the islands and the farmhouses by the fields.
import { type Batch, type Rnd, hash2, seeded } from '../batch';
import { basilica, campanile, castle, church, lighthouse, palace, tower, townWall } from '../../buildings';
import { CASTLE_AT, CITY, FIELDS, ISLANDS, type P2, SITES, TOWNS, idx, inCity, inGrid } from '../layout';
import { type Site, blocks, rural } from './site';

/** The landmarks of the city, its square kept open; the castle; the two towers. `swap` puts another model in a
 *  landmark's place. */
export function landmarks(site: Site, swap: { campanile?: Batch }): void {
  const S = SITES;
  site.claim(
    S.plaza.at[0] - S.plaza.w / 2,
    S.plaza.at[1] - S.plaza.d / 2,
    S.plaza.at[0] + S.plaza.w / 2,
    S.plaza.at[1] + S.plaza.d / 2,
  );
  site.build(palace(), S.palace.at[0], S.palace.at[1], S.palace.w, S.palace.d, 0, 9.4, 'landmark');
  site.build(basilica(), S.basilica.at[0], S.basilica.at[1], S.basilica.w, S.basilica.d, 1, 9, 'landmark');
  // a small square before the front of the basilica and a lane along its side keep the domes in view
  site.claim(
    S.basilica.at[0] + S.basilica.d / 2,
    S.basilica.at[1] - 7,
    S.basilica.at[0] + S.basilica.d / 2 + 7,
    S.basilica.at[1] + 7,
  );
  site.claim(
    S.basilica.at[0] - S.basilica.d / 2,
    S.basilica.at[1] + S.basilica.w / 2,
    S.basilica.at[0] + S.basilica.d / 2,
    S.basilica.at[1] + S.basilica.w / 2 + 4,
  );
  site.build(
    swap.campanile ?? campanile(),
    S.campanile.at[0],
    S.campanile.at[1],
    S.campanile.w,
    S.campanile.d,
    0,
    swap.campanile ? 25 : 20,
    'landmark',
  );
  site.build(castle(), CASTLE_AT[0], CASTLE_AT[1], 13.5, 13.5, 0, 5, 'landmark');
  {
    const r = seeded(5);
    for (const t of [S.westTower, S.eastTower]) site.build(tower(r), t.at[0], t.at[1], t.w, t.d, 0, 10, 'tower');
  }
}

/** The city: palazzi and small houses inside its outline, first fit, with alleys between them and a few straight
 *  streets. */
export function city(site: Site): void {
  const { used } = site;
  // straight streets, and here and there a yard of five by five cells left open for a garden
  const yard = (x: number, z: number) => {
    const cx = Math.floor(x / 9),
      cz = Math.floor(z / 9),
      ix = Math.floor(x) - cx * 9,
      iz = Math.floor(z) - cz * 9;
    return hash2(cx, cz, 91) < 0.2 && ix >= 2 && ix < 7 && iz >= 2 && iz < 7;
  };
  const r = seeded(7),
    street = (x: number, z: number) => Math.floor(x) % 19 < 2 || Math.floor(z) % 17 < 2 || yard(x, z);
  for (const part of CITY) {
    const xs = part.map((p) => p[0]),
      zs = part.map((p) => p[1]);
    for (let z = Math.floor(Math.min(...zs)); z < Math.max(...zs); z++)
      for (let x = Math.floor(Math.min(...xs)); x < Math.max(...xs); x++) {
        if (!inGrid(x, z) || used[idx(x, z)] || !inCity(x + 0.5, z + 0.5)) continue;
        // one house in three is a long palazzo, the rest are small: the roofs of the reference are mostly five or six blocks wide
        const turn = r.chance(0.5),
          free = (px: number, pz: number) => inCity(px, pz) && !street(px, pz);
        for (const [long, short, floors] of [
          [blocks(r, 13, 20), blocks(r, 7.2, 8.6), r.chance(0.4) ? 3 : 2],
          [blocks(r, 7.2, 10), blocks(r, 5.7, 7.2), r.chance(0.25) ? 3 : 2],
          [blocks(r, 5.7, 5.7), blocks(r, 5.7, 5.7), 2],
        ].slice(r.chance(0.35) ? 0 : 1)) {
          const w = turn ? short : long,
            d = turn ? long : short;
          if (site.fits(x, z, x + w, z + d, free, r.chance(0.5) ? 2 : 1)) {
            site.homes(r, x, z, w, d, floors);
            break;
          }
        }
      }
  }
}

/** houses scattered round a centre, (rx, rz) its reach; `big`: some of them grand */
function scatter(site: Site, r: Rnd, at: P2, rx: number, rz: number, n: number, big: boolean): void {
  for (let k = 0, tries = 0; k < n && tries < n * 60; tries++) {
    const a = r.range(0, Math.PI * 2),
      q = Math.sqrt(r.next()),
      grand = big && r.chance(0.3);
    const long = grand ? blocks(r, 10, 13) : blocks(r, 5.7, 7.2),
      short = grand ? blocks(r, 7.2, 7.2) : blocks(r, 4.3, 5.7),
      turn = r.chance(0.5),
      w = turn ? short : long,
      d = turn ? long : short;
    const x = Math.round(at[0] + Math.cos(a) * q * rx - w / 2),
      z = Math.round(at[1] + Math.sin(a) * q * rz - d / 2);
    if (!site.fits(x, z, x + w, z + d, rural)) continue;
    site.homes(r, x, z, w, d, grand || r.chance(0.55) ? 2 : 1);
    k++;
  }
}

/** Towns: a brick tower or a church, then houses scattered round the centre; a walled town packed inside its wall. */
export function towns(site: Site): void {
  const { used } = site;
  TOWNS.forEach((t, n) => {
    const r = seeded(100 + n);
    for (let k = 0, tries = 0; k < t.towers && tries < 80; tries++) {
      const x = Math.round(t.at[0] + r.range(-t.r, t.r) * 0.4),
        z = Math.round(t.at[1] + r.range(-t.r, t.r) * 0.4);
      // the walled town has two brick towers, as in the reference; the open towns a tower or a church
      if (k % 2 === 0 || t.houses > 12) {
        if (site.fits(x - 2, z - 2, x + 2, z + 2, rural)) {
          site.build(tower(r), x, z, 2.4, 2.4, 0, 10, 'tower');
          k++;
        }
      } else if (site.fits(x - 3, z - 6, x + 3, z + 5, rural)) {
        site.build(church(r), x, z, 5.2, 10.6, 0, 6, 'church');
        k++;
      }
    }
    if (t.houses > 12) {
      // a walled town: houses packed inside a square, the wall round them
      const half = Math.round(t.r * 0.62),
        cx = Math.round(t.at[0]),
        cz = Math.round(t.at[1]),
        inside = (px: number, pz: number) => Math.abs(px - cx) < half - 1.5 && Math.abs(pz - cz) < half - 1.5;
      for (let z = cz - half; z < cz + half; z++)
        for (let x = cx - half; x < cx + half; x++) {
          if (used[idx(x, z)]) continue;
          const turn = r.chance(0.5);
          for (const [long, short, floors] of [
            [blocks(r, 10, 14.3), blocks(r, 5.7, 7.2), r.chance(0.4) ? 3 : 2],
            [blocks(r, 5.7, 7.2), blocks(r, 5.7, 5.7), 2],
            [blocks(r, 4.3, 4.3), blocks(r, 4.3, 4.3), 2],
          ]) {
            const w = turn ? short : long,
              d = turn ? long : short;
            if (site.fits(x, z, x + w, z + d, inside, r.chance(0.5) ? 1 : 0)) {
              site.homes(r, x, z, w, d, floors);
              break;
            }
          }
        }
      site.put(townWall(half * 2, half * 2), cx, site.baseY(cx, cz), cz, 0);
      for (const [ax, az, bx, bz] of [
        [-half, -half, half, -half + 1],
        [-half, half - 1, half, half],
        [-half, -half, -half + 1, half],
        [half - 1, -half, half, half],
      ])
        site.claim(cx + ax - 1, cz + az - 1, cx + bx + 1, cz + bz + 1);
      site.count('wall');
    } else scatter(site, r, t.at, t.r, t.r, t.houses, t.houses > 8);
  });
}

/** Islands: a lighthouse on one, a few houses on the others. */
export function islands(site: Site): void {
  ISLANDS.forEach((isle, n) => {
    const r = seeded(200 + n);
    if (isle.kind === 'tower') site.build(lighthouse(), isle.at[0], isle.at[1], 3.4, 3.4, 0, 7.6, 'landmark');
    scatter(
      site,
      r,
      isle.at,
      isle.rx * 0.6,
      isle.rz * 0.6,
      isle.kind === 'village' ? 5 : isle.kind === 'houses' ? 3 : 0,
      false,
    );
  });
}

/** A farmhouse beside most fields. */
export function farmhouses(site: Site): void {
  FIELDS.forEach((f, n) => {
    const r = seeded(300 + n);
    for (let tries = 0; tries < 12; tries++) {
      const sx = r.pick([-1, 1]),
        w = r.int(3, 5),
        d = r.int(3, 4);
      const x = Math.round(f.at[0] + sx * (f.w / 2 + 2.5 + w / 2) - w / 2),
        z = Math.round(f.at[1] + r.range(-f.d, f.d) * 0.4 - d / 2);
      if (!site.fits(x, z, x + w, z + d, (px, pz) => rural(px, pz) && !inCity(px, pz))) continue;
      site.homes(r, x, z, w, d, r.chance(0.6) ? 2 : 1);
      break;
    }
  });
}
