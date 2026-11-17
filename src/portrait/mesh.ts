// From the triangles of the builder to three.js geometry, as Apoleia's bridge handed them to Godot
// (sim/godot/src/portrait.rs): a surface without normals is faceted (one normal a triangle); a surface with
// texture coordinates gets tangents along v, the way MakeHuman's hair strands run.
import { BufferAttribute, BufferGeometry } from 'three';
import { smoothSurface } from './subdivide';
import type { PortraitSurface } from './wire';

/** The geometry of a surface. `finer` > 0 draws it as the smooth surface its triangles stand for, each triangle
 *  split in four that many times, after `fit` rounds of moving the net so that the surface comes nearer the
 *  corners the builder gave (subdivide.ts). A surface with normals only: a faceted one is meant to be so. */
export function surfaceGeometry(s: PortraitSurface, finer = 0, fit = 0): BufferGeometry {
  const textured = s.uv.length === 2 * (s.pos.length / 3);
  if (finer > 0 && s.nrm.length === s.pos.length) {
    const fine = smoothSurface(s.pos, textured ? [{ data: s.col, size: 3 }, { data: s.uv, size: 2 }] : [{ data: s.col, size: 3 }], finer, fit);
    return geometry(fine.pos, fine.nrm, fine.carried[0]!, textured ? fine.carried[1]! : null);
  }
  const n = s.pos.length / 3, pos = s.pos;
  const nrm = new Float32Array(3 * n);
  for (let t = 0; t < n; t += 3) {
    const a = 3 * t;
    const ux = pos[a + 3] - pos[a], uy = pos[a + 4] - pos[a + 1], uz = pos[a + 5] - pos[a + 2];
    const vx = pos[a + 6] - pos[a], vy = pos[a + 7] - pos[a + 1], vz = pos[a + 8] - pos[a + 2];
    let x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    const l = Math.hypot(x, y, z);
    if (l > 0) { x /= l; y /= l; z /= l; } else { x = y = z = 0; }
    for (let k = 0; k < 3; k++) {
      const i = 3 * (t + k);
      if (i + 2 < s.nrm.length) { nrm[i] = s.nrm[i]; nrm[i + 1] = s.nrm[i + 1]; nrm[i + 2] = s.nrm[i + 2]; }
      else { nrm[i] = x; nrm[i + 1] = y; nrm[i + 2] = z; }
    }
  }
  return geometry(pos, nrm, s.col, textured ? s.uv : null);
}

function geometry(pos: Float32Array, nrm: Float32Array, col: Float32Array, uv: Float32Array | null): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nrm, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  if (uv) {
    g.setAttribute('uv', new BufferAttribute(uv, 2));
    g.setAttribute('tangent', new BufferAttribute(tangents(pos, nrm, uv), 4));
  }
  return g;
}

/** Per triangle the direction in which v grows, made perpendicular to each vertex's normal; w = 1. */
function tangents(pos: Float32Array, nrm: Float32Array, uv: Float32Array): Float32Array {
  const n = pos.length / 3, out = new Float32Array(4 * n);
  for (let t = 0; t < n; t += 3) {
    const a = 3 * t, b = 2 * t;
    const e1x = pos[a + 3] - pos[a], e1y = pos[a + 4] - pos[a + 1], e1z = pos[a + 5] - pos[a + 2];
    const e2x = pos[a + 6] - pos[a], e2y = pos[a + 7] - pos[a + 1], e2z = pos[a + 8] - pos[a + 2];
    const d1x = uv[b + 2] - uv[b], d1y = uv[b + 3] - uv[b + 1], d2x = uv[b + 4] - uv[b], d2y = uv[b + 5] - uv[b + 1];
    const r = d1x * d2y - d2x * d1y;
    let tx = 0, ty = 0, tz = 0;
    if (Math.abs(r) > 1e-12) {
      tx = (e2x * d1x - e1x * d2x) / r; ty = (e2y * d1x - e1y * d2x) / r; tz = (e2z * d1x - e1z * d2x) / r;
      const l = Math.hypot(tx, ty, tz);
      if (l > 0) { tx /= l; ty /= l; tz /= l; }
    }
    for (let k = 0; k < 3; k++) {
      const i = 3 * (t + k), o = 4 * (t + k);
      const d = nrm[i] * tx + nrm[i + 1] * ty + nrm[i + 2] * tz;
      let x = tx - nrm[i] * d, y = ty - nrm[i + 1] * d, z = tz - nrm[i + 2] * d;
      const l = Math.hypot(x, y, z);
      if (l > 0) { x /= l; y /= l; z /= l; } else { x = y = z = 0; }
      out[o] = x; out[o + 1] = y; out[o + 2] = z; out[o + 3] = 1;
    }
  }
  return out;
}
