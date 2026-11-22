// A batch added to another, moved by a matrix (lookprobe/batch.ts `append`): its faces' normals stay square to the
// faces and unit, also where the scale is not the same for all axes (a far step's model, made lower than wide:
// worldprobe/far_places.ts), and with one scale for all axes they turn as the faces do.
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { Batch } from '../../src/lookprobe/batch';

/** a roof's face of 45°, rising towards +x, and one of 60° rising towards −z, each with its own normal */
function roofs(): Batch {
  const b = new Batch(),
    grey: [number, number, number] = [0.5, 0.5, 0.5];
  b.quad([0, 0, 0], [0, 0, 1], [1, 1, 1], [1, 1, 0], grey, [-Math.SQRT1_2, Math.SQRT1_2, 0]);
  const t = Math.tan(Math.PI / 3);
  b.quad([0, 0, 0], [1, 0, 0], [1, t, -1], [0, t, -1], grey, [0, 0.5, Math.sin(Math.PI / 3)]);
  return b;
}
/** for each triangle of a batch: how far its normals are from square to its edges, and from unit */
function offSquare(b: Batch): { square: number; unit: number } {
  const p = b.pos,
    n = b.nor;
  let square = 0,
    unit = 0;
  for (let k = 0; k < p.length; k += 9) {
    const e1 = [p[k + 3] - p[k], p[k + 4] - p[k + 1], p[k + 5] - p[k + 2]],
      e2 = [p[k + 6] - p[k], p[k + 7] - p[k + 1], p[k + 8] - p[k + 2]];
    for (let v = 0; v < 9; v += 3) {
      const m = [n[k + v], n[k + v + 1], n[k + v + 2]],
        len = Math.hypot(...m);
      unit = Math.max(unit, Math.abs(len - 1));
      for (const e of [e1, e2])
        square = Math.max(square, Math.abs(m[0] * e[0] + m[1] * e[1] + m[2] * e[2]) / Math.hypot(...e));
    }
  }
  return { square, unit };
}

describe('a batch added to another', () => {
  it('keeps the normals square to its faces and unit where the scale differs between the axes', () => {
    // as far_places.ts stands a model at the second far step: a quarter as wide, 0.435 as tall
    const moved = new Batch();
    moved.append(roofs(), new THREE.Matrix4().makeScale(1 / 4, 0.435, 1 / 4).setPosition(3, 2, 1));
    const { square, unit } = offSquare(moved);
    expect(square).toBeLessThan(1e-9);
    expect(unit).toBeLessThan(1e-9);
    // (turned as the faces, a roof's normal stood upright the lower the model was made)
    expect(Math.abs(moved.nor[1])).toBeLessThan(Math.SQRT1_2);
  });

  it('turns them as the faces with one scale for all axes', () => {
    const turn = new THREE.Matrix4().makeRotationY(0.7),
      moved = new Batch();
    moved.append(roofs(), turn.clone().multiply(new THREE.Matrix4().makeScale(3, 3, 3)).setPosition(5, 0, 5));
    const { square, unit } = offSquare(moved);
    expect(square).toBeLessThan(1e-9);
    expect(unit).toBeLessThan(1e-9);
    const n = new THREE.Vector3(-Math.SQRT1_2, Math.SQRT1_2, 0).applyMatrix4(turn);
    expect([moved.nor[0], moved.nor[1], moved.nor[2]].map((v, k) => v - n.getComponent(k))).toEqual([
      expect.closeTo(0, 12),
      expect.closeTo(0, 12),
      expect.closeTo(0, 12),
    ]);
  });
});
