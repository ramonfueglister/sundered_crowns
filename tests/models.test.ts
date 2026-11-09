// The Blender-built props in public/models (tools/models/build_models.py): the binary contract the renderer relies on,
// the triangle budgets, flat per-face normals, tint flags, and the agreed scales and orientations.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MODEL_BUDGETS, MODEL_FLOATS, MODEL_NAMES, MODEL_STRIDE, loadModels, parseModels, type ModelSet } from '../src/render/models';

const dir = fileURLToPath(new URL('../public/models/', import.meta.url));
const metaText = readFileSync(dir + 'models.json', 'utf8');
const bin = readFileSync(dir + 'models.bin');
const buffer = () => bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
const meta = JSON.parse(metaText);
const set: ModelSet = parseModels(meta, buffer());

/** the vertices of one mesh as [x, y, z, nx, ny, nz, r, g, b, tint] rows, and its triangles */
function mesh(name: string) {
  const m = set.meshes[name];
  const v = (i: number, k: number) => set.vertices[(m.vertexOffset + i) * MODEL_FLOATS + k];
  const tris: number[][] = [];
  for (let i = 0; i < m.indexCount; i += 3) tris.push([0, 1, 2].map((k) => set.indices[m.indexOffset + i + k]));
  return { m, v, tris };
}
function extent(name: string, keep: (x: number, y: number, z: number) => boolean = () => true) {
  const { m, v } = mesh(name);
  const e = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (let i = 0; i < m.vertexCount; i++) {
    const x = v(i, 0), y = v(i, 1), z = v(i, 2);
    if (!keep(x, y, z)) continue;
    e.x0 = Math.min(e.x0, x); e.x1 = Math.max(e.x1, x); e.y0 = Math.min(e.y0, y); e.y1 = Math.max(e.y1, y); e.z0 = Math.min(e.z0, z); e.z1 = Math.max(e.z1, z);
  }
  return e;
}

describe('models.json / models.bin', () => {
  it('has the agreed header and an exactly sized buffer: vertices first, then uint32 indices', () => {
    expect(meta.version).toBe(1);
    expect(meta.stride).toBe(MODEL_STRIDE);
    expect(bin.byteLength).toBe(meta.totalVertices * 40 + meta.totalIndices * 4);
    expect(set.vertices.length).toBe(meta.totalVertices * MODEL_FLOATS);
    expect(set.indices.length).toBe(meta.totalIndices);
  });

  it('contains every listed mesh, and the meshes tile the vertex and index ranges without gaps or overlaps', () => {
    for (const n of MODEL_NAMES) expect(set.meshes[n], n).toBeDefined();
    const ms = Object.values(set.meshes);
    const byV = [...ms].sort((a, b) => a.vertexOffset - b.vertexOffset), byI = [...ms].sort((a, b) => a.indexOffset - b.indexOffset);
    let v = 0, i = 0;
    for (const m of byV) { expect(m.vertexOffset).toBe(v); v += m.vertexCount; }
    for (const m of byI) { expect(m.indexOffset).toBe(i); i += m.indexCount; }
    expect(v).toBe(meta.totalVertices);
    expect(i).toBe(meta.totalIndices);
  });

  it('keeps indices local to their mesh and in range', () => {
    for (const n of Object.keys(set.meshes)) {
      const { m, tris } = mesh(n);
      expect(m.indexCount % 3).toBe(0);
      let max = 0;
      for (const t of tris) for (const k of t) max = Math.max(max, k);
      expect(max, n).toBeLessThan(m.vertexCount);
    }
  });

  it('keeps every mesh within its triangle budget', () => {
    for (const n of MODEL_NAMES) {
      const tris = set.meshes[n].indexCount / 3;
      expect(tris, `${n}: ${tris} triangles`).toBeLessThanOrEqual(MODEL_BUDGETS[n]);
    }
  });

  it('has tint exactly 0 or 1, colours in 0..1 and finite positions; tinted parts exist on flags, figures and ships', () => {
    for (const n of Object.keys(set.meshes)) {
      const { m, v } = mesh(n);
      let tinted = 0;
      for (let i = 0; i < m.vertexCount; i++) {
        const t = v(i, 9);
        expect(t === 0 || t === 1, `${n} tint ${t}`).toBe(true);
        tinted += t;
        for (let k = 6; k < 9; k++) expect(v(i, k) >= 0 && v(i, k) <= 1, `${n} colour`).toBe(true);
        for (let k = 0; k < 3; k++) expect(Number.isFinite(v(i, k))).toBe(true);
      }
      if (/^(soldier_|ship_|banner_|castle$|tent$)/.test(n)) expect(tinted, `${n} has tinted parts`).toBeGreaterThan(0);
      if (/^(tree_|bush$|house_)/.test(n)) expect(tinted, `${n} has no tinted parts`).toBe(0);
    }
  });

  it('has unit normals, flat per triangle and agreeing with the winding', () => {
    for (const n of Object.keys(set.meshes)) {
      const { v, tris } = mesh(n);
      for (const [a, b, c] of tris) {
        for (const k of [a, b, c]) expect(Math.abs(Math.hypot(v(k, 3), v(k, 4), v(k, 5)) - 1), `${n} normal length`).toBeLessThan(1e-3);
        const ux = v(b, 0) - v(a, 0), uy = v(b, 1) - v(a, 1), uz = v(b, 2) - v(a, 2);
        const wx = v(c, 0) - v(a, 0), wy = v(c, 1) - v(a, 1), wz = v(c, 2) - v(a, 2);
        const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
        const l = Math.hypot(cx, cy, cz);
        if (l < 1e-9) continue;
        for (const k of [a, b, c]) {
          const d = (cx * v(k, 3) + cy * v(k, 4) + cz * v(k, 5)) / l;
          expect(d, `${n} face normal`).toBeGreaterThan(0.999);
        }
      }
    }
  });

  it('reports height (max z) and radius (max horizontal distance) that match the geometry', () => {
    for (const n of Object.keys(set.meshes)) {
      const { m, v } = mesh(n);
      let h = -Infinity, r = 0;
      for (let i = 0; i < m.vertexCount; i++) { h = Math.max(h, v(i, 2)); r = Math.max(r, Math.hypot(v(i, 0), v(i, 1))); }
      expect(Math.abs(m.height - h), `${n} height`).toBeLessThan(1e-3);
      expect(Math.abs(m.radius - r), `${n} radius`).toBeLessThan(1e-3);
    }
  });

  it('follows the agreed scales: ground at z = 0, soldiers 1.0, houses about 1.2, trees 1.4..2.2, a tower about 3, castle about 4 wide', () => {
    for (const n of MODEL_NAMES) {
      const e = extent(n);
      if (n.startsWith('ship_')) {
        expect(e.z0, `${n} reaches below the waterline`).toBeLessThan(-0.05);
        // the hull at the waterline is about 2.5 long and the bow points +y
        const hull = extent(n, (_x, _y, z) => z < 0);
        expect(hull.y1 - hull.y0, `${n} hull length`).toBeGreaterThan(2.2);
        expect(hull.y1 - hull.y0, `${n} hull length`).toBeLessThan(3.0);
        expect(e.y1, `${n} bow (bowsprit or spur) forward`).toBeGreaterThan(-e.y0);
      } else {
        expect(Math.abs(e.z0), `${n} stands on the ground`).toBeLessThan(0.02);
      }
    }
    for (const n of ['tree_conifer_a', 'tree_conifer_b', 'tree_broadleaf_a', 'tree_broadleaf_b', 'tree_palm'] as const) {
      expect(set.meshes[n].height, n).toBeGreaterThanOrEqual(1.4);
      expect(set.meshes[n].height, n).toBeLessThanOrEqual(2.2);
    }
    for (const n of ['house_timber', 'house_stone', 'house_mediterranean'] as const) {
      expect(set.meshes[n].height, n).toBeGreaterThan(0.9);
      expect(set.meshes[n].height, n).toBeLessThan(1.6);
    }
    for (const n of ['soldier_infantry', 'soldier_pikeman', 'soldier_archer', 'soldier_musketeer'] as const) {
      const head = extent(n, (x, y) => Math.hypot(x, y) < 0.12); // the figure itself, without spears and muskets
      expect(head.z1, n).toBeGreaterThan(0.9);
      expect(head.z1, n).toBeLessThan(1.12);
    }
    expect(set.meshes.church_gothic.height).toBeGreaterThan(2.6);
    expect(set.meshes.church_gothic.height).toBeLessThan(3.6);
    const c = extent('castle');
    expect(c.x1 - c.x0).toBeGreaterThan(3.6);
    expect(c.x1 - c.x0).toBeLessThan(4.4);
    expect(Math.abs(set.meshes.tent.height - 1.2)).toBeLessThan(0.15);
    expect(set.meshes.tent.radius).toBeLessThan(0.6);
    // the cannon's barrel (high and near the centre line) points +y, like the ships' bows
    const barrel = extent('cannon', (x, _y, z) => z > 0.4 && Math.abs(x) < 0.09);
    expect(barrel.y1).toBeGreaterThan(-barrel.y0);
  });
});

describe('parseModels / loadModels', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects a truncated buffer, a wrong stride and an out-of-range index', () => {
    expect(() => parseModels(meta, buffer().slice(0, bin.byteLength - 4))).toThrow(/bytes/);
    expect(() => parseModels({ ...meta, stride: 32 }, buffer())).toThrow(/stride/);
    const bad = buffer();
    const first = set.meshes[MODEL_NAMES[0]];
    new Uint32Array(bad, meta.totalVertices * 40, meta.totalIndices)[first.indexOffset] = first.vertexCount;
    expect(() => parseModels(meta, bad)).toThrow(/index/);
  });

  it('loads both files through fetch from the base path', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      seen.push(url);
      return url.endsWith('.json') ? new Response(metaText, { headers: { 'content-type': 'application/json' } }) : new Response(buffer());
    });
    const s = await loadModels('/game');
    expect(seen.sort()).toEqual(['/game/models/models.bin', '/game/models/models.json']);
    expect(Object.keys(s.meshes).length).toBe(Object.keys(set.meshes).length);
    expect(s.vertices.length).toBe(set.vertices.length);
  });
});
