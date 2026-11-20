// The graphics card's lists of a shape: its lists as they are, its faces on the grid of blocks and its faces on no grid
// (faces.ts), each face drawn as one instance of the same four corners.
import * as THREE from 'three/webgpu';
import { FACE_COL, FACE_CORNERS, FACE_GEO, FREE_GEO, unfaced, unfree } from '../faces';
import type { Shape } from '../shape';

/**
 * A face's four corners, each worked out once: which of the face's four each of the mesh's is, where its triangles
 * turn one way and where the other (faces.ts FACE_CORNERS, whose six are these four, the first and the third
 * twice); and the two triangles of them.
 */
const CORNERS = new Float32Array([0, 1, 2, 5].flatMap((k) => [FACE_CORNERS[0][k], FACE_CORNERS[1][k], 0])),
  TRIANGLES = new Uint16Array([0, 1, 2, 0, 2, 3]);
export const faceGeometry = (s: Shape) => {
  const f = s.faces!,
    g = new THREE.InstancedBufferGeometry();
  // (the four corners are the same for every mesh, but each has a list of its own: a mesh that goes takes its lists with it)
  g.setAttribute('position', new THREE.BufferAttribute(CORNERS, 3));
  g.setIndex(new THREE.BufferAttribute(TRIANGLES, 1));
  const lies = new THREE.InstancedInterleavedBuffer(f.geo, FACE_GEO),
    colours = new THREE.InstancedInterleavedBuffer(f.col, FACE_COL);
  g.setAttribute('lie', new THREE.InterleavedBufferAttribute(lies, 4, 0, true));
  g.setAttribute('reach', new THREE.InterleavedBufferAttribute(lies, 2, 4, true));
  for (let k = 0; k < 4; k++) g.setAttribute(`tone${k}`, new THREE.InterleavedBufferAttribute(colours, 4, k * 4, true));
  g.setAttribute('normal', new THREE.InstancedBufferAttribute(f.nor, 4, true));
  if (f.aim && f.aimCol) {
    const ends = new THREE.InstancedInterleavedBuffer(f.aimCol, FACE_COL);
    g.setAttribute('aim', new THREE.InstancedBufferAttribute(f.aim, 2, true));
    for (let k = 0; k < 4; k++)
      g.setAttribute(`aimTone${k}`, new THREE.InterleavedBufferAttribute(ends, 4, k * 4, true));
  }
  g.instanceCount = f.geo.length / FACE_GEO;
  if (s.ball) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(s.ball[0], s.ball[1], s.ball[2]), s.ball[3]);
  else g.boundingSphere = new THREE.Box3().setFromArray(unfaced(f).pos).getBoundingSphere(new THREE.Sphere());
  return g;
};
/** The joined tops of a shape (faces.ts `Field`) likewise: a row of numbers and a direction to each, and no colours, which the stage reads from the shape's field. */
export const fieldGeometry = (s: Shape) => {
  const f = s.tops!,
    g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(CORNERS, 3));
  g.setIndex(new THREE.BufferAttribute(TRIANGLES, 1));
  const lies = new THREE.InstancedInterleavedBuffer(f.geo, FACE_GEO);
  g.setAttribute('lie', new THREE.InterleavedBufferAttribute(lies, 4, 0, true));
  g.setAttribute('reach', new THREE.InterleavedBufferAttribute(lies, 2, 4, true));
  g.setAttribute('normal', new THREE.InstancedBufferAttribute(f.nor, 4, true));
  g.instanceCount = f.geo.length / FACE_GEO;
  if (s.ball) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(s.ball[0], s.ball[1], s.ball[2]), s.ball[3]);
  else
    g.boundingSphere = new THREE.Box3()
      .setFromArray(unfaced({ ...f, col: new Uint8Array((f.geo.length / FACE_GEO) * FACE_COL) }).pos)
      .getBoundingSphere(new THREE.Sphere());
  return g;
};
/** The faces on no grid of a shape likewise: a row of five floats, of colours and of its direction to each. */
export const freeGeometry = (s: Shape) => {
  const f = s.free!,
    g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(CORNERS, 3));
  g.setIndex(new THREE.BufferAttribute(TRIANGLES, 1));
  const lies = new THREE.InstancedInterleavedBuffer(f.geo, FREE_GEO),
    colours = new THREE.InstancedInterleavedBuffer(f.col, FACE_COL);
  g.setAttribute('freeLevel', new THREE.InterleavedBufferAttribute(lies, 1, 0));
  g.setAttribute('freeSpans', new THREE.InterleavedBufferAttribute(lies, 4, 1));
  for (let k = 0; k < 4; k++) g.setAttribute(`tone${k}`, new THREE.InterleavedBufferAttribute(colours, 4, k * 4, true));
  g.setAttribute('normal', new THREE.InstancedBufferAttribute(f.nor, 4, true));
  g.instanceCount = f.geo.length / FREE_GEO;
  if (s.ball) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(s.ball[0], s.ball[1], s.ball[2]), s.ball[3]);
  else g.boundingSphere = new THREE.Box3().setFromArray(unfree(f).pos).getBoundingSphere(new THREE.Sphere());
  return g;
};
export const geometry = (s: Shape) => {
  const g = new THREE.BufferGeometry(),
    list = (a: ArrayLike<number>) => new THREE.BufferAttribute(a instanceof Float32Array ? a : new Float32Array(a), 3);
  g.setAttribute('position', list(s.pos));
  // (bytes, which the graphics card reads as shares of their largest)
  if (s.small) {
    g.setAttribute('normal', new THREE.BufferAttribute(s.nor as Int8Array, 4, true));
    g.setAttribute('color', new THREE.BufferAttribute(s.col as Uint8Array, 4, true));
  } else {
    g.setAttribute('normal', list(s.nor));
    g.setAttribute('color', list(s.col));
  }
  if (s.sink) g.setAttribute('sink', new THREE.BufferAttribute(s.sink, 1));
  if (s.ball) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(s.ball[0], s.ball[1], s.ball[2]), s.ball[3]);
  else g.computeBoundingSphere();
  return g;
};
