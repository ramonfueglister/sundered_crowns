// What the renderer makes for a kind of mesh (the shader of its material for its kind of lists, once for the
// picture's pass, once for the shadows' and once for the mirror's) it makes on the page's thread in the picture
// that first draws one, and lets go again when the last mesh of the kind leaves the stage (three's NodeManager
// counts who uses it). The pieces of the far steps, of the near steps and of the sea are of different kinds: a zoom
// across the border between two steps would have the next kind's shaders made in the middle of its motion, and
// made again on every way back. So one mesh of each kind the pieces come as is always on the stage, of no size and
// on none of the picture's dots: what the kinds take is made in the first pictures, while the world is still
// loading, and kept. The sea's are drawn in the first pictures only: a mesh of the sea in the picture has the
// mirror's picture drawn, which a view of the land alone goes without; what was made for them stays as long as
// they are on the stage, drawn or not. ?pilots=0: without all of them (index.ts). The counts `shaders built` and
// `ms shaders` tell how many were made and how long that took the page's thread (counts.ts).
import type * as THREE from 'three/webgpu';
import { FACE_COL, FACE_GEO, FREE_GEO } from '../faces';
import type { Shape } from '../shape';
import { FIGURES_LAYER } from './look';
import type { Materials } from './materials';
import type { Meshes } from './meshes';

/** small lists of one triangle, sinking if `sink` */
const lists = (sink = false): Shape => ({
  pos: new Float32Array(9),
  nor: new Int8Array(12),
  col: new Uint8Array(12),
  small: true,
  ball: [0, 0, 0, 0],
  ...(sink ? { sink: new Float32Array(3) } : {}),
});
/** small lists of no triangle, for a shape that is all faces */
const none = (): Shape => ({
  pos: new Float32Array(0),
  nor: new Int8Array(0),
  col: new Uint8Array(0),
  small: true,
  ball: [0, 0, 0, 0],
});
/** one face on the grid of blocks, gliding if `aimed` */
const face = (aimed = false): Shape => ({
  ...none(),
  faces: {
    geo: new Int16Array(FACE_GEO),
    col: new Uint8Array(FACE_COL),
    nor: new Int8Array(4),
    ...(aimed ? { aim: new Int16Array(2), aimCol: new Uint8Array(FACE_COL) } : {}),
  },
});

/** Puts one mesh of each kind the pieces come as on the stage, and gives back the sea's (see above). */
export function addPilots(scene: THREE.Scene, meshes: Meshes, m: Pick<Materials, 'water' | 'solid' | 'sinking'>) {
  const { mesh, faceMesh, fieldMesh, freeMesh } = meshes,
    { water, solid, sinking } = m;
  const sea = [...(water !== solid ? [mesh(lists(), water, false)] : []), faceMesh(face(), false, true)];
  for (const pilot of [
    mesh(lists(), solid, true),
    mesh(lists(true), sinking, true),
    faceMesh(face(), true),
    faceMesh(face(true), true),
    fieldMesh(
      {
        ...none(),
        tops: { geo: new Int16Array(FACE_GEO), nor: new Int8Array(4), tones: new Uint8Array(0), x0: 0, z0: 0 },
      },
      true,
      false,
    ),
    fieldMesh(
      {
        ...none(),
        tops: {
          geo: new Int16Array(FACE_GEO),
          nor: new Int8Array(4),
          tones: new Uint8Array(0),
          x0: 0,
          z0: 0,
          aim: new Int16Array(2),
          aimTones: new Uint8Array(0),
        },
      },
      true,
      false,
    ),
    freeMesh(
      { ...none(), free: { geo: new Float32Array(FREE_GEO), col: new Uint8Array(FACE_COL), nor: new Int8Array(4) } },
      true,
    ),
    ...sea,
  ]) {
    // (three keeps userData untyped: `dots` is the Vector2 every mesh of meshes.ts carries)
    (pilot.userData.dots as THREE.Vector2).set(0, 0);
    pilot.userData.glide = 0;
    pilot.frustumCulled = false;
    // (the sea's lie where the sea's meshes lie: on the layer the mirror does not draw)
    if (sea.includes(pilot)) pilot.layers.set(FIGURES_LAYER);
    scene.add(pilot);
  }
  return sea;
}
