// Fills the probe scene: landmarks, city, towns, islands, piers, bridges, woods, fields, borders, ships, figures.
// Everything is placed from fixed seeds, so every load gives the same picture.
import * as THREE from 'three/webgpu';
import { Batch, type Rnd, fbm2, seeded, smooth } from './batch';
import { borderBand, bush, crops, cypress, person, pier, sheep, ship, smoke, tree } from './blocks';
import { ROOFS, WALLS, basilica, bridge, campanile, castle, church, house, lighthouse, palace } from './buildings';
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
  /** free ground for a footprint: nothing built within `gap` cells, no water within two */
  const fits = (x0: number, z0: number, x1: number, z1: number, where: (x: number, z: number) => boolean = () => true, gap = 1) =>
    cells(x0 - 2, z0 - 2, x1 + 2, z1 + 2, (i) => g.wet[i] === 0)
    && cells(x0 - gap, z0 - gap, x1 + gap, z1 + gap, (i, x, z) => used[i] === 0 && g.mat[i] !== Mat.Rock && where(x + 0.5, z + 0.5));
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
  build(palace(), S.palace.at[0], S.palace.at[1], S.palace.w, S.palace.d, 0, 9.5, 'landmark');
  build(basilica(), S.basilica.at[0], S.basilica.at[1], S.basilica.w, S.basilica.d, 1, 7, 'landmark');
  build(campanile(), S.campanile.at[0], S.campanile.at[1], S.campanile.w, S.campanile.d, 0, 24, 'landmark');
  build(castle(), CASTLE_AT[0], CASTLE_AT[1], 13.5, 13.5, 0, 5, 'landmark');

  /** roof tops of the houses outside the city, for the smoke */
  const hearths: [number, number, number][] = [];
  const homes = (r: Rnd, x: number, z: number, w: number, d: number, floors: number) => {
    const turns = r.int(0, 1) * 2;
    if (!inCity(x, z)) hearths.push([x + w / 2, baseY(x + w / 2, z + d / 2) + floors * 1.85 + 1.2, z + d / 2]);
    build(house(w, d, floors, r.pick(WALLS), r.pick(ROOFS), r), x + w / 2, z + d / 2, w, d, turns, floors * 1.85 + 1, 'house');
  };

  // the city: houses packed wall to wall inside its outline, first fit, with a few straight streets left open
  {
    const r = seeded(7), street = (x: number, z: number) => Math.floor(x) % 19 < 2 || Math.floor(z) % 17 < 2;
    for (const part of CITY) {
      const xs = part.map((p) => p[0]), zs = part.map((p) => p[1]);
      for (let z = Math.floor(Math.min(...zs)); z < Math.max(...zs); z++) for (let x = Math.floor(Math.min(...xs)); x < Math.max(...xs); x++) {
        if (!inGrid(x, z) || used[idx(x, z)] || !inCity(x + 0.5, z + 0.5)) continue;
        const grand = r.chance(0.08), long = grand ? r.int(7, 9) : r.int(4, 5), short = grand ? 5 : r.int(3, 4), turn = r.chance(0.5), w = turn ? short : long, d = turn ? long : short;
        if (!fits(x, z, x + w, z + d, (px, pz) => inCity(px, pz) && !street(px, pz), 0)) continue;
        homes(r, x, z, w, d, r.chance(0.45) ? 3 : 2);
      }
    }
  }

  // towns and islands: houses scattered around a centre
  const scatter = (r: Rnd, at: P2, rx: number, rz: number, n: number, big: boolean) => {
    for (let k = 0, tries = 0; k < n && tries < n * 60; tries++) {
      const a = r.range(0, Math.PI * 2), q = Math.sqrt(r.next());
      const long = r.int(4, 5), short = r.int(3, 4), turn = r.chance(0.5), w = turn ? short : long, d = turn ? long : short;
      const x = Math.round(at[0] + Math.cos(a) * q * rx - w / 2), z = Math.round(at[1] + Math.sin(a) * q * rz - d / 2);
      if (!fits(x, z, x + w, z + d, (px, pz) => !fieldAt(px, pz, 1) && roadDist(px, pz) > 1.6)) continue;
      homes(r, x, z, w, d, big && r.chance(0.2) ? 3 : 2);
      k++;
    }
  };
  TOWNS.forEach((t, n) => {
    const r = seeded(100 + n);
    for (let k = 0, tries = 0; k < t.towers && tries < 80; tries++) {
      const x = Math.round(t.at[0] + r.range(-t.r, t.r) * 0.4), z = Math.round(t.at[1] + r.range(-t.r, t.r) * 0.4);
      if (!fits(x - 3, z - 6, x + 3, z + 5, (px, pz) => !fieldAt(px, pz, 1) && roadDist(px, pz) > 1.6)) continue;
      build(church(r), x, z, 5.2, 10.6, 0, 6, 'church'); k++;
    }
    scatter(r, t.at, t.r, t.r, t.houses, true);
  });
  ISLANDS.forEach((isle, n) => {
    const r = seeded(200 + n);
    if (isle.kind === 'tower') build(lighthouse(), isle.at[0], isle.at[1], 3, 3, 0, 8, 'landmark');
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
      const sx = r.pick([-1, 1]), w = r.int(4, 5), d = r.int(3, 4);
      const x = Math.round(f.at[0] + sx * (f.w / 2 + 2.5 + w / 2) - w / 2), z = Math.round(f.at[1] + r.range(-f.d, f.d) * 0.4 - d / 2);
      if (!fits(x, z, x + w, z + d, (px, pz) => !fieldAt(px, pz, 1) && roadDist(px, pz) > 1.6 && !inCity(px, pz))) continue;
      homes(r, x, z, w, d, r.int(1, 2)); break;
    }
  });

  // fields
  { const r = seeded(31); for (const f of FIELDS) crops(things, g, f.at, f.w, f.d, f.crop, r); }

  // woods: dense at the foot of the mountains and along the top of the picture, clumps elsewhere, single trees between
  {
    const r = seeded(41), pitch = 3.3;
    const nearTown = (x: number, z: number) => TOWNS.some((t) => Math.hypot(x - t.at[0], z - t.at[1]) < t.r * 0.75);
    for (let gz = 2; gz < N - 2; gz += pitch) for (let gx = 2; gx < N - 2; gx += pitch) {
      const x = gx + r.range(-1, 1), z = gz + r.range(-1, 1), roll = r.next(), i = idx(Math.floor(x), Math.floor(z));
      if (!inFrame(x, z) || g.wet[i] || g.mat[i] !== Mat.Grass || inCity(x, z)) continue;
      const [, t] = toST(x, z);
      let density = Math.max(0.07, 0.45 * smooth(0.56, 0.66, fbm2(x / 22, z / 22, 71)), 0.8 * smooth(0.27, 0.12, t), 0.85 * smooth(-7, -1, mountainAt(x, z)));
      if (nearTown(x, z)) density = Math.min(density, 0.08);
      if (roll > density || roadDist(x, z) < 2 || riverDist(x, z) < 3.2 || fieldAt(x, z, 1.2)) continue;
      if (!cells(x - 1.3, z - 1.3, x + 1.3, z + 1.3, (j) => used[j] === 0 && g.wet[j] === 0)) continue;
      const y = g.h[i];
      if (r.chance(density < 0.2 ? 0.45 : 0.15)) { cypress(things, x, y, z, r); occlude(g, x - 0.8, z - 0.8, x + 0.8, z + 0.8, y + 4.5); count('tree'); continue; }
      tree(things, x, y, z, r); occlude(g, x - 1.3, z - 1.3, x + 1.3, z + 1.3, y + 3.6); count('tree');
    }
    // cypresses and garden trees beside houses on the islands and at the city edge
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
    for (let k = 0; k < 2600; k++) {
      const x = r.range(2, N - 2), z = r.range(2, N - 2), i = idx(Math.floor(x), Math.floor(z));
      if (inFrame(x, z) && g.mat[i] === Mat.Grass && !g.wet[i] && !used[i] && roadDist(x, z) > 1.5) bush(things, x, g.h[i], z, r);
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
