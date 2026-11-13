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

  it('is consistently wound and has no folded faces: shared edges run opposite ways, neighbours do not fold over', () => {
    // The props shader lights a face seen from behind as if it faced the viewer, so a face wound the wrong way does
    // not show in the game or in a normal render; this keeps the export from relying on that. Vertices are
    // duplicated per face, so they are welded by position first (0.1 mm grid). An edge used by more than two
    // triangles (parts that only touch) says nothing about the winding and is left out.
    // A fold is two neighbours in one plane with opposite normals, lying on top of each other: what a concave
    // outline turns into when it is triangulated without its normal. Its edges still run opposite ways.
    for (const n of Object.keys(set.meshes)) {
      const { v, tris } = mesh(n);
      const ids = new Map<string, number>();
      const weld = (k: number) => {
        const key = `${Math.round(v(k, 0) * 1e4)},${Math.round(v(k, 1) * 1e4)},${Math.round(v(k, 2) * 1e4)}`;
        let id = ids.get(key);
        if (id === undefined) { id = ids.size; ids.set(key, id); }
        return id;
      };
      const uses = new Map<string, [number, number][]>(); // undirected edge -> [start vertex, triangle] of each use
      tris.forEach((t, ti) => {
        const w = t.map(weld);
        for (let e = 0; e < 3; e++) {
          const a = w[e], b = w[(e + 1) % 3];
          if (a === b) continue;
          const key = a < b ? `${a}:${b}` : `${b}:${a}`;
          const u = uses.get(key);
          if (u) u.push([a, ti]); else uses.set(key, [[a, ti]]);
        }
      });
      let same = 0, folds = 0;
      for (const u of uses.values()) {
        if (u.length !== 2) continue;
        if (u[0][0] === u[1][0]) { same++; continue; }
        const [p, q] = [tris[u[0][1]], tris[u[1][1]]];
        const dot = v(p[0], 3) * v(q[0], 3) + v(p[0], 4) * v(q[0], 4) + v(p[0], 5) * v(q[0], 5);
        if (dot > -0.999) continue;
        const off = Math.max(...q.map((k) => Math.abs((v(k, 0) - v(p[0], 0)) * v(p[0], 3) + (v(k, 1) - v(p[0], 1)) * v(p[0], 4) + (v(k, 2) - v(p[0], 2)) * v(p[0], 5))));
        if (off < 1e-4) folds++;
      }
      expect(same, `${n}: ${same} edges used twice in the same direction`).toBe(0);
      expect(folds, `${n}: ${folds} folded edges`).toBe(0);
    }
  });

  it('has no coplanar faces lying on top of each other (they would flicker in the depth test)', () => {
    for (const n of Object.keys(set.meshes)) {
      const { v, tris } = mesh(n);
      const P = (k: number) => [v(k, 0), v(k, 1), v(k, 2)];
      const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const planes = new Map<string, { t: number[][]; nrm: number[] }[]>();
      for (const t of tris) {
        const [a, b, c] = t.map(P);
        const cr = cross(sub(b, a), sub(c, a)), l = Math.hypot(...cr);
        if (l < 1e-9) continue;
        const nrm = cr.map((x) => x / l);
        const key = [...nrm.map((x) => Math.round(x * 1e3)), Math.round(dot(nrm, a) * 1e3)].join(',');
        (planes.get(key) ?? planes.set(key, []).get(key)!).push({ t: [a, b, c], nrm });
      }
      const inside = (p: number[], t: number[][], nrm: number[]) =>
        [0, 1, 2].every((i) => dot(cross(sub(t[(i + 1) % 3], t[i]), sub(p, t[i])), nrm) > 1e-7);
      const sample = (t: number[][], w: number[]) => [0, 1, 2].map((k) => w[0] * t[0][k] + w[1] * t[1][k] + w[2] * t[2][k]);
      const ws = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]];
      let overlaps = 0;
      for (const fs of planes.values()) {
        for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
          const A = fs[i], B = fs[j];
          if (ws.some((w) => inside(sample(A.t, w), B.t, B.nrm) || inside(sample(B.t, w), A.t, A.nrm))) overlaps++;
        }
      }
      expect(overlaps, `${n}: ${overlaps} pairs of overlapping coplanar faces`).toBe(0);
    }
  });

  it('keeps colours below the point where the props shader clips them to white', () => {
    // The light factor of the props shader (src/render/props.ts, fs): 0.3 sky + 0.34 + 0.62 sun + 0.26 fill, which
    // reaches about 1.21 on a face turned to the sun. Models are placed at any rotation, so each face is tried at 36
    // headings. Recoloured (tint) parts depend on the nation's colour and are left out. Tiny faces (fists, plumes)
    // may touch the limit; the clipped area must stay a negligible share of the mesh.
    const norm = (x: number, y: number, z: number) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
    const sun = norm(-0.62, 0.78, 0.95), fill = norm(0.3, -0.9, 0.5); // model space: x east, y north, z up
    for (const n of Object.keys(set.meshes)) {
      const { v, tris } = mesh(n);
      let total = 0, clipped = 0, worst = 0;
      for (const [a, b, c] of tris) {
        const ux = v(b, 0) - v(a, 0), uy = v(b, 1) - v(a, 1), uz = v(b, 2) - v(a, 2);
        const wx = v(c, 0) - v(a, 0), wy = v(c, 1) - v(a, 1), wz = v(c, 2) - v(a, 2);
        const area = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
        total += area;
        if (v(a, 9) > 0.5) continue;
        const nx = v(a, 3), ny = v(a, 4), nz = v(a, 5);
        let f = 0;
        for (let k = 0; k < 36; k++) {
          const t = (k / 36) * Math.PI * 2, rx = nx * Math.cos(t) - ny * Math.sin(t), ry = nx * Math.sin(t) + ny * Math.cos(t);
          const dif = Math.max(rx * sun[0] + ry * sun[1] + nz * sun[2], 0), fl = Math.max(rx * fill[0] + ry * fill[1] + nz * fill[2], 0);
          f = Math.max(f, 0.3 * (0.5 + 0.5 * nz) + 0.34 + 0.62 * dif + 0.26 * fl);
        }
        const lit = Math.max(v(a, 6), v(a, 7), v(a, 8)) * f;
        if (lit > 1.02) { clipped += area; worst = Math.max(worst, area); }
      }
      expect(clipped / total, `${n}: ${(100 * clipped / total).toFixed(2)} % of the surface clips`).toBeLessThan(0.002);
      expect(worst, `${n}: a clipped face of ${worst.toFixed(4)}`).toBeLessThan(0.002);
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
