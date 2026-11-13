// The 3D figures of the map: the built-in meshes (the contract the Blender models follow), where armies stand, and
// the towns built for every owned location. Run: npx vitest run tests/map_props.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { builtinModels, figureSpot } from '../src/render/props';
import { computeSettlements, labelsFor as computeLabels } from '../src/ui/mapdata';

const NAMES = [
  'tree_conifer_a', 'tree_conifer_b', 'tree_broadleaf_a', 'tree_broadleaf_b', 'tree_palm', 'bush',
  'house_timber', 'house_stone', 'house_mediterranean', 'house_steppe_yurt', 'church_gothic', 'mosque', 'castle',
  'soldier_infantry', 'soldier_pikeman', 'soldier_archer', 'soldier_musketeer', 'soldier_cavalry', 'cannon', 'banner_standard',
  'ship_cog', 'ship_galley', 'ship_carrack', 'ship_ship_of_the_line',
];

describe('built-in figures', () => {
  const m = builtinModels();
  it('has every mesh the map asks for', () => {
    for (const n of NAMES) expect(m.meshes[n], n).toBeTruthy();
  });
  it('meshes are well formed: local indices in range, unit normals, tint 0 or 1, standing on the ground', () => {
    for (const [name, mesh] of Object.entries(m.meshes)) {
      expect(mesh.indexCount % 3, name).toBe(0);
      for (let i = 0; i < mesh.indexCount; i++) {
        const k = m.indices[mesh.indexOffset + i];
        expect(k, name).toBeLessThan(mesh.vertexCount);
      }
      let minZ = Infinity, maxZ = -Infinity;
      for (let v = 0; v < mesh.vertexCount; v++) {
        const o = (mesh.vertexOffset + v) * 10;
        const nl = Math.hypot(m.vertices[o + 3], m.vertices[o + 4], m.vertices[o + 5]);
        expect(Math.abs(nl - 1), name).toBeLessThan(1e-3);
        expect([0, 1], name).toContain(m.vertices[o + 9]);
        minZ = Math.min(minZ, m.vertices[o + 2]); maxZ = Math.max(maxZ, m.vertices[o + 2]);
      }
      // ships sit a little in the water, everything else stands on z = 0
      expect(minZ, name).toBeGreaterThanOrEqual(name.startsWith('ship_') ? -0.3 : -1e-6);
      expect(maxZ, name).toBeLessThanOrEqual(mesh.height + 1e-3);
    }
  });
});

describe('where figures stand', () => {
  it('armies stand beside the town, several hosts in one place side by side', () => {
    const a = figureSpot(100, 100, false, 0), b = figureSpot(100, 100, false, 1);
    expect(Math.hypot(a[0] - 100, a[1] - 100)).toBeGreaterThan(3);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(3);
  });
});

describe('towns and names on the map', () => {
  const geo = JSON.parse(readFileSync(new URL('../public/data/geo.json', import.meta.url), 'utf8'));
  const assets = { geo };
  // two realms: the west half Christian, the east half Muslim
  const owner = new Int16Array(geo.L).map((_, i) => (geo.loc.x[i] < geo.W / 2 ? 0 : 1));
  const ns = [
    { faith: 0, gov: 'feudal_monarchy', capital: owner.indexOf(0), short: { en: 'West', de: 'West' }, alive: true },
    { faith: 99, gov: 'feudal_monarchy', capital: owner.indexOf(1), short: { en: 'East', de: 'Ost' }, alive: true },
  ];
  it('every owned location gets a town with a size and a style', () => {
    const t = computeSettlements(owner, assets, ns);
    expect(t.length).toBe(geo.L);
    expect(t.filter((s) => s.capital).length).toBe(2);
    for (const s of t.slice(0, 200)) { expect(s.size).toBeGreaterThanOrEqual(0); expect(['north', 'stone', 'south', 'steppe', 'muslim']).toContain(s.style); }
  });
  it('realm names follow a curve through their land', () => {
    const labels = computeLabels(owner, assets, ns);
    expect(labels.length).toBe(2);
    for (const l of labels) {
      expect(l.curve.length).toBeGreaterThan(2);
      for (const [x, y] of l.curve) { expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true); }
    }
  });
});
