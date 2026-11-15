// The landmark models exported by tools/blender load into a Batch with the right size, orientation and colours.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rgb } from '../../src/lookprobe/batch';
import { glbToBatch } from '../../src/buildings/landmarks/glb';

const CAMPANILE = 'public/models/landmarks/campanile_san_marco_1356.glb';
const load = (path: string) => { const f = readFileSync(path); return glbToBatch(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength)); };

describe('campanile_san_marco_1356.glb', () => {
  const b = load(CAMPANILE);
  it('has the triangles the build printed and stands on the ground, Y up', () => {
    expect(b.triangles).toBe(780);
    let top = -Infinity, bottom = Infinity, reach = 0;
    for (let i = 0; i < b.pos.length; i += 3) { top = Math.max(top, b.pos[i + 1]); bottom = Math.min(bottom, b.pos[i + 1]); reach = Math.max(reach, Math.abs(b.pos[i]), Math.abs(b.pos[i + 2])); }
    // 90 m at 3.65 m per block (tools/blender/landmarks/campanile_san_marco_1356.json); the plinth reaches half a block into the ground
    expect(top).toBeCloseTo(25.1, 0);
    expect(bottom).toBeCloseTo(-0.5, 1);
    expect(reach).toBeCloseTo((12 / 2 + 0.5) / 3.65, 1);
  });
  it('has openings: some normals face the axis of the tower (the arch reveals of the belfry)', () => {
    let inward = 0;
    for (let i = 0; i < b.pos.length; i += 9) {
      const cx = (b.pos[i] + b.pos[i + 3] + b.pos[i + 6]) / 3, cz = (b.pos[i + 2] + b.pos[i + 5] + b.pos[i + 8]) / 3;
      if (b.nor[i] * cx + b.nor[i + 2] * cz < -0.1) inward++;
    }
    expect(inward).toBeGreaterThan(50);
  });
  it('uses the game palette: the spire is copper, the shaft brick', () => {
    const seen = new Set<string>();
    for (let i = 0; i < b.col.length; i += 3) seen.add([b.col[i], b.col[i + 1], b.col[i + 2]].map((c) => c.toFixed(2)).join(','));
    const key = (c: readonly number[]) => c.map((x) => x.toFixed(2)).join(',');
    expect(seen.has(key(rgb(0x6fb078)))).toBe(true);
    expect(seen.has(key(rgb(0xd0603c)))).toBe(true);
  });
  it('normals are unit length and the spire faces outwards', () => {
    for (let i = 0; i < b.nor.length; i += 3) expect(Math.hypot(b.nor[i], b.nor[i + 1], b.nor[i + 2])).toBeCloseTo(1, 4);
    // every triangle of the spire points away from the tower's axis or upwards (the belfry's reveals face inwards)
    for (let i = 0; i < b.pos.length; i += 9) {
      const cy = (b.pos[i + 1] + b.pos[i + 4] + b.pos[i + 7]) / 3;
      if (cy < 19) continue;
      const cx = (b.pos[i] + b.pos[i + 3] + b.pos[i + 6]) / 3, cz = (b.pos[i + 2] + b.pos[i + 5] + b.pos[i + 8]) / 3;
      const dot = b.nor[i] * cx + b.nor[i + 2] * cz + b.nor[i + 1] * 0.5;
      expect(dot).toBeGreaterThan(-1e-6);
    }
  });
});
