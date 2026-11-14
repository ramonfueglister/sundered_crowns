// Fills the probe scene: landmarks, city, towns, islands, piers, bridges, woods, fields, borders, ships, figures.
// Everything is placed from fixed seeds, so every load gives the same picture.
import * as THREE from 'three/webgpu';
import { Batch, type Rnd, fbm2, seeded, smooth } from './batch';
import { borderBand, bush, crops, cypress, person, pier, sheep, ship, smoke, speck, tree } from './blocks';
import { FLOOR, ROOFS, WALLS, basilica, bridge, campanile, castle, church, house, lighthouse, palace, tower, townHouse } from './buildings';
import {
  BORDERS, CASTLE_AT, CITY, FIELDS, type Ground, ISLANDS, LAND_Y, Mat, N, type P2, ROADS, SHIPS, SITES, TOWNS,
  buildGround, fieldAt, idx, inCity, inGrid, isWet, mountainAt, occlude, riverDist, roadDist, toST, toXZ,
} from './layout';
import { buildTerrain, buildWater } from './terrain';

export interface ProbeScene { ground: Batch; water: Batch; things: Batch; counts: Record<string, number> }

export function buildScene(bakedSky = true): ProbeScene {
  const g = buildGround(), things = new Batch(), used = new Uint8Array(N * N), counts: Record<string, number> = {};
  const count = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
  const m = new THREE.Matrix4();
  const put = (model: Batch, x: number, y: number, z: number, angle: number) => things.append(model, m.makeRotationY(angle).setPosition(x, y, z));
  const cells = (x0: number, z0: number, x1: number, z1: number, f: (i: number, x: number, z: number) => boolean | void): boolean => {
    for (let z = Math.floor(z0); z < Math.ceil(z1); z++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      if (!inGrid(x, z) || f(idx(x, z), x, z) === false) return false;
    }
    return true;
  };
  const claim = (x0: number, z0: number, x1: number, z1: number) => cells(x0, z0, x1, z1, (i) => { used[i] = 1; });
  /** free ground for a footprint: every cell passes `where`, nothing built and no water within `gap` cells */
  const fits = (x0: number, z0: number, x1: number, z1: number, where: (x: number, z: number) => boolean = () => true, gap = 1) =>
    cells(x0 - gap, z0 - gap, x1 + gap, z1 + gap, (i) => g.wet[i] === 0)
    && cells(x0 - gap, z0 - gap, x1 + gap, z1 + gap, (i) => used[i] === 0 && g.mat[i] !== Mat.Rock)
    && cells(x0, z0, x1, z1, (_, x, z) => where(x + 0.5, z + 0.5));
  const baseY = (x: number, z: number) => g.h[idx(Math.floor(x), Math.floor(z))];
  /** places a model with footprint w × d (before turning) centred on (x, z) and records what it covers */
  const build = (model: Batch, x: number, z: number, w: number, d: number, turns: number, height: number, kind: string) => {
    const fw = turns % 2 ? d : w, fd = turns % 2 ? w : d, y = baseY(x, z);
    put(model, x, y, z, (turns * Math.PI) / 2);
    claim(x - fw / 2, z - fd / 2, x + fw / 2, z + fd / 2);
    occlude(g, x - fw / 2, z - fd / 2, x + fw / 2, z + fd / 2, y + height);
    count(kind);
  };
  const inFrame = (x: number, z: number) => { const [s, t] = toST(x, z); return s > -0.05 && s < 1.05 && t > -0.08 && t < 1.14; };

  // realm borders first: their cells stay free of houses and trees
  const bands = new Batch();
  for (const b of BORDERS) borderBand(bands, g, b.pts, b.color, (x, z) => { if (!inGrid(x, z) || g.mat[idx(x, z)] === Mat.Rock) return true; used[idx(x, z)] = 1; return false; });

  // landmarks of the city
  const S = SITES;
  claim(S.plaza.at[0] - S.plaza.w / 2, S.plaza.at[1] - S.plaza.d / 2, S.plaza.at[0] + S.plaza.w / 2, S.plaza.at[1] + S.plaza.d / 2);
  build(palace(), S.palace.at[0], S.palace.at[1], S.palace.w, S.palace.d, 0, 8.6, 'landmark');
  build(basilica(), S.basilica.at[0], S.basilica.at[1], S.basilica.w, S.basilica.d, 1, 7, 'landmark');
  build(campanile(), S.campanile.at[0], S.campanile.at[1], S.campanile.w, S.campanile.d, 0, 20, 'landmark');
  build(castle(), CASTLE_AT[0], CASTLE_AT[1], 13.5, 13.5, 0, 5, 'landmark');
  { const r = seeded(5); for (const t of [S.westTower, S.eastTower]) build(tower(r), t.at[0], t.at[1], t.w, t.d, 0, 10, 'tower'); }

  /** roof tops of the houses outside the city, for the smoke */
  const hearths: [number, number, number][] = [];
  /** a house on the footprint from (x, z): one block when small, a town house of two blocks when long */
  const homes = (r: Rnd, x: number, z: number, w: number, d: number, floors: number) => {
    const top = floors * FLOOR + 1.2, model = Math.max(w, d) >= 8 && r.chance(0.5) ? townHouse(w, d, floors, r.pick(WALLS), r.pick(ROOFS), r) : house(w, d, floors, r.pick(WALLS), r.pick(ROOFS), r);
    if (!inCity(x, z)) hearths.push([x + w / 2, baseY(x + w / 2, z + d / 2) + top + 0.4, z + d / 2]);
    build(model, x + w / 2, z + d / 2, w, d, 0, top, 'house');
  };
  const rural = (px: number, pz: number) => !fieldAt(px, pz, 1) && roadDist(px, pz) > 1.6;

  // the city: palazzi and small houses inside its outline, first fit, with alleys between them and a few straight streets
  {
    const r = seeded(7), street = (x: number, z: number) => Math.floor(x) % 23 < 2 || Math.floor(z) % 19 < 2;
    for (const part of CITY) {
      const xs = part.map((p) => p[0]), zs = part.map((p) => p[1]);
      for (let z = Math.floor(Math.min(...zs)); z < Math.max(...zs); z++) for (let x = Math.floor(Math.min(...xs)); x < Math.max(...xs); x++) {
        if (!inGrid(x, z) || used[idx(x, z)] || !inCity(x + 0.5, z + 0.5)) continue;
        // a palazzo if it fits, else a small house, else a narrow one
        const turn = r.chance(0.5), free = (px: number, pz: number) => inCity(px, pz) && !street(px, pz);
        for (const [long, short, floors] of [[r.int(10, 16), r.int(5, 7), r.chance(0.5) ? 3 : 2], [r.int(6, 8), r.int(5, 6), r.chance(0.3) ? 3 : 2], [5, 5, 2]].slice(r.chance(0.7) ? 0 : 1)) {
          const w = turn ? short : long, d = turn ? long : short;
          if (fits(x, z, x + w, z + d, free, 1)) { homes(r, x, z, w, d, floors); break; }
        }
      }
    }
  }

  // towns and islands: a brick tower or a church, then houses scattered around the centre
  const scatter = (r: Rnd, at: P2, rx: number, rz: number, n: number, big: boolean) => {
    for (let k = 0, tries = 0; k < n && tries < n * 60; tries++) {
      const a = r.range(0, Math.PI * 2), q = Math.sqrt(r.next()), grand = big && r.chance(0.3);
      const long = grand ? r.int(7, 9) : r.int(4, 5), short = grand ? 5 : r.int(3, 4), turn = r.chance(0.5), w = turn ? short : long, d = turn ? long : short;
      const x = Math.round(at[0] + Math.cos(a) * q * rx - w / 2), z = Math.round(at[1] + Math.sin(a) * q * rz - d / 2);
      if (!fits(x, z, x + w, z + d, rural)) continue;
      homes(r, x, z, w, d, grand || r.chance(0.55) ? 2 : 1);
      k++;
    }
  };
  TOWNS.forEach((t, n) => {
    const r = seeded(100 + n);
    for (let k = 0, tries = 0; k < t.towers && tries < 80; tries++) {
      const x = Math.round(t.at[0] + r.range(-t.r, t.r) * 0.4), z = Math.round(t.at[1] + r.range(-t.r, t.r) * 0.4);
      if (k % 2 === 0) { if (fits(x - 2, z - 2, x + 2, z + 2, rural)) { build(tower(r), x, z, 2.4, 2.4, 0, 10, 'tower'); k++; } }
      else if (fits(x - 3, z - 6, x + 3, z + 5, rural)) { build(church(r), x, z, 5.2, 10.6, 0, 6, 'church'); k++; }
    }
    scatter(r, t.at, t.r, t.r, t.houses, t.houses > 8);
  });
  ISLANDS.forEach((isle, n) => {
    const r = seeded(200 + n);
    if (isle.kind === 'tower') build(lighthouse(), isle.at[0], isle.at[1], 3.4, 3.4, 0, 7.6, 'landmark');
    scatter(r, isle.at, isle.rx * 0.6, isle.rz * 0.6, isle.kind === 'village' ? 6 : isle.kind === 'houses' ? 3 : 1, false);
  });

  // piers: wherever the city quay looks onto open water, every few cells
  {
    const made: P2[] = [], deck = LAND_Y - 0.35;
    const open = (x: number, z: number, dx: number, dz: number) => { for (let k = 1; k <= 8; k++) if (!inGrid(x + dx * k, z + dz * k) || !g.wet[idx(x + dx * k, z + dz * k)]) return false; return true; };
    for (let z = 2; z < N - 10; z++) for (let x = 2; x < N - 10; x++) {
      if (g.wet[idx(x, z)] || !inCity(x + 0.5, z + 0.5) || made.some((p) => Math.hypot(p[0] - x, p[1] - z) < 9)) continue;
      const dir = open(x, z, 1, 0) ? 'x' : open(x, z, 0, 1) ? 'z' : null;
      if (!dir) continue;
      made.push([x, z]);
      const len = 7 + ((x * 7 + z * 3) % 3);
      if (dir === 'x') pier(things, x + 1, z + 0.5, 'x', len, deck); else pier(things, x + 0.5, z + 1, 'z', len, deck);
      count('pier');
    }
  }

  // bridges: wherever a road runs over the river
  {
    const made: P2[] = [];
    for (const road of ROADS) for (let i = 0; i + 1 < road.length; i++) {
      const a = road[i], c = road[i + 1], len = Math.hypot(c[0] - a[0], c[1] - a[1]), dx = (c[0] - a[0]) / len, dz = (c[1] - a[1]) / len;
      let from = -1;
      for (let k = 0; k <= len; k += 0.25) {
        const wet = isWet(g, a[0] + dx * k, a[1] + dz * k);
        if (wet && from < 0) from = k;
        if (!wet && from >= 0) {
          const mid = (from + k) / 2, x = a[0] + dx * mid, z = a[1] + dz * mid, span = k - from;
          if (from > 0 && span < 9 && !made.some((p) => Math.hypot(p[0] - x, p[1] - z) < 8)) {
            made.push([x, z]); put(bridge(span), x, LAND_Y, z, Math.atan2(-dz, dx)); count('bridge');
          }
          from = -1;
        }
      }
    }
  }

  // a farmhouse beside most fields
  FIELDS.forEach((f, n) => {
    const r = seeded(300 + n);
    for (let tries = 0; tries < 12; tries++) {
      const sx = r.pick([-1, 1]), w = r.int(3, 5), d = r.int(3, 4);
      const x = Math.round(f.at[0] + sx * (f.w / 2 + 2.5 + w / 2) - w / 2), z = Math.round(f.at[1] + r.range(-f.d, f.d) * 0.4 - d / 2);
      if (!fits(x, z, x + w, z + d, (px, pz) => rural(px, pz) && !inCity(px, pz))) continue;
      homes(r, x, z, w, d, r.chance(0.6) ? 2 : 1); break;
    }
  });

  // fields
  { const r = seeded(31); for (const f of FIELDS) crops(things, g, f.at, f.w, f.d, f.crop, r); }

  // woods: dense at the foot of the mountains and along the top of the picture, clumps elsewhere, single trees between
  {
    const r = seeded(41), pitch = 3.1;
    const nearTown = (x: number, z: number) => TOWNS.some((t) => Math.hypot(x - t.at[0], z - t.at[1]) < t.r * 0.75);
    for (let gz = 2; gz < N - 2; gz += pitch) for (let gx = 2; gx < N - 2; gx += pitch) {
      const x = gx + r.range(-1, 1), z = gz + r.range(-1, 1), roll = r.next(), i = idx(Math.floor(x), Math.floor(z));
      if (!inFrame(x, z) || g.wet[i] || g.mat[i] !== Mat.Grass || inCity(x, z)) continue;
      const [, t] = toST(x, z);
      let density = Math.max(0.05, 0.42 * smooth(0.56, 0.66, fbm2(x / 22, z / 22, 71)), 0.6 * smooth(0.27, 0.12, t), 0.62 * smooth(-7, -1, mountainAt(x, z)));
      if (nearTown(x, z)) density = Math.min(density, 0.08);
      if (roll > density || roadDist(x, z) < 2 || riverDist(x, z) < 3.2 || fieldAt(x, z, 1.2)) continue;
      if (!cells(x - 1, z - 1, x + 1, z + 1, (j) => used[j] === 0 && g.wet[j] === 0)) continue;
      const y = g.h[i];
      if (r.chance(density < 0.2 ? 0.45 : 0.15)) { cypress(things, x, y, z, r); occlude(g, x - 0.6, z - 0.6, x + 0.6, z + 0.6, y + 4.2); count('tree'); continue; }
      // the trees of the woods are larger than those between the fields
      tree(things, x, y, z, r, density > 0.3 ? 1.3 : 1); occlude(g, x - 0.95, z - 0.95, x + 0.95, z + 0.95, y + 3.4); count('tree');
    }
    // garden trees on the squares and corners that the houses of the city left open
    for (const part of CITY) for (let k = 0; k < 90; k++) {
      const at = r.pick(part), x = at[0] + r.range(-45, 45), z = at[1] + r.range(-45, 45);
      if (!inGrid(Math.floor(x), Math.floor(z)) || !inCity(x, z) || !cells(x - 1.4, z - 1.4, x + 1.4, z + 1.4, (j) => used[j] === 0 && g.wet[j] === 0)) continue;
      if (r.chance(0.4)) cypress(things, x, baseY(x, z), z, r); else tree(things, x, baseY(x, z), z, r);
      claim(x - 1, z - 1, x + 1, z + 1); occlude(g, x - 0.9, z - 0.9, x + 0.9, z + 0.9, baseY(x, z) + 3.4); count('tree');
    }
    // cypresses and garden trees beside the houses on the islands
    for (const isle of ISLANDS) for (let k = 0; k < 10; k++) {
      const x = isle.at[0] + r.range(-isle.rx, isle.rx) * 0.75, z = isle.at[1] + r.range(-isle.rz, isle.rz) * 0.75;
      if (isWet(g, x, z) || !cells(x - 1, z - 1, x + 1, z + 1, (j) => used[j] === 0 && g.wet[j] === 0)) continue;
      if (baseY(x, z) < LAND_Y) continue;
      if (r.chance(0.7)) cypress(things, x, baseY(x, z), z, r); else tree(things, x, baseY(x, z), z, r);
      occlude(g, x - 0.8, z - 0.8, x + 0.8, z + 0.8, baseY(x, z) + 3.6); count('tree');
    }
  }

  // tufts on the meadows, smoke over a few houses of the towns
  {
    const r = seeded(61);
    for (let k = 0; k < 9000; k++) {
      const x = r.range(2, N - 2), z = r.range(2, N - 2), i = idx(Math.floor(x), Math.floor(z));
      if (!inFrame(x, z) || g.mat[i] !== Mat.Grass || g.wet[i] || used[i] || roadDist(x, z) < 1.5) continue;
      if (k % 3) bush(things, x, g.h[i], z, r); else speck(things, x, g.h[i], z, r);
    }
    for (const k of [3, 21, 40]) if (hearths[k]) smoke(things, ...hearths[k], r);
  }

  // people on the square, the quay and the roads; sheep on two meadows
  {
    const r = seeded(51), p = S.plaza;
    for (let k = 0; k < 34; k++) { const x = p.at[0] + r.range(-p.w, p.w) * 0.48, z = p.at[1] + r.range(-p.d, p.d) * 0.48; if (!isWet(g, x, z)) { person(things, x, baseY(x, z), z, r); count('person'); } }
    for (const road of ROADS) for (let i = 0; i + 1 < road.length; i++) for (let k = 0; k < 5; k++) {
      const q = r.next(), x = road[i][0] + (road[i + 1][0] - road[i][0]) * q + r.range(-0.6, 0.6), z = road[i][1] + (road[i + 1][1] - road[i][1]) * q + r.range(-0.6, 0.6);
      if (inGrid(Math.floor(x), Math.floor(z)) && !isWet(g, x, z) && !used[idx(Math.floor(x), Math.floor(z))] && inFrame(x, z)) { person(things, x, baseY(x, z), z, r); count('person'); }
    }
    for (const [s, t] of [[0.105, 0.455], [0.59, 0.19]] as const) for (let k = 0; k < 9; k++) {
      const at = toXZ(s, t), x = at[0] + r.range(-6, 6), z = at[1] + r.range(-6, 6), i = idx(Math.floor(x), Math.floor(z));
      if (g.mat[i] === Mat.Grass && !g.wet[i] && !used[i]) { sheep(things, x, g.h[i], z, r); count('sheep'); }
    }
  }

  for (const s of SHIPS) { ship(things, s.at[0], s.at[1], s.heading); count('ship'); }
  things.append(bands, m.identity());

  const ground = buildTerrain(g, bakedSky), water = buildWater(g);
  counts.triangles = ground.triangles + water.triangles + things.triangles;
  return { ground, water, things, counts };
}
