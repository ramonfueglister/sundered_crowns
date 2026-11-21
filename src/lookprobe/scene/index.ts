// Fills the probe scene: borders, landmarks, city, towns, islands, piers, bridges, farmhouses, fields, woods, meadows,
// market, people, ships and boats, in this order (each takes the cells the ones before it left free). Everything is
// placed from fixed seeds, so every load gives the same picture.
// The parts: site.ts (the ground being filled), buildings.ts, waterside.ts, country.ts, life.ts.
import * as THREE from 'three/webgpu';
import { Batch } from '../batch';
import { borderBand } from '../blocks';
import { Mat, idx, inGrid } from '../layout';
import { BORDERS, TRAITS } from './places';
import { buildTerrain, buildWater } from '../terrain';
import { city, farmhouses, islands, landmarks, towns } from './buildings';
import { fields, meadows, woods } from './country';
import { market, people } from './life';
import { Site } from './site';
import { boats, bridges, piers, ships } from './waterside';

interface ProbeScene {
  ground: Batch;
  water: Batch;
  things: Batch;
  counts: Record<string, number>;
}

/** The scene; `swap` puts another model in a landmark's place, e.g. the campanile read from its GLB (?campanile=glb). */
export function buildScene(bakedSky = true, swap: { campanile?: Batch } = {}): ProbeScene {
  const site = new Site(),
    { g, things, used, counts } = site;
  // realm borders first: their cells stay free of houses and trees
  const bands = new Batch();
  for (const b of BORDERS)
    borderBand(bands, g, b.pts, b.color, (x, z) => {
      if (!inGrid(x, z) || g.mat[idx(x, z)] === Mat.Rock) return true;
      used[idx(x, z)] = 1;
      return false;
    });
  landmarks(site, swap);
  city(site);
  towns(site);
  islands(site);
  piers(site);
  bridges(site);
  farmhouses(site);
  fields(site);
  woods(site);
  meadows(site);
  market(site);
  people(site);
  ships(site);
  boats(site);
  things.append(bands, new THREE.Matrix4());

  const ground = buildTerrain(g, TRAITS, bakedSky),
    water = buildWater(g);
  counts.triangles = ground.triangles + water.triangles + things.triangles;
  return { ground, water, things, counts };
}
