// The figures on the stage (lookprobe/stage.ts): which pieces show figures, near or far kit by how much of the world
// is in the picture, and whether anything walks, so that the stage keeps drawing. Main thread only.
import type * as THREE from 'three/webgpu';
import type { Figures } from './crowd';
import { figureMeshes as build } from './material';

export type { Figures } from './crowd';

/**
 * Up to this many blocks across the picture a figure is drawn with its full kit; beyond it, with the far kit. At 1672
 * pixels across, 260 blocks give 6.4 pixels a block: a figure stands 8 pixels tall, too small for faces and hands.
 * Drawing value.
 */
export const NEAR_UNTIL = 260;

const shown = new Set<{ near: THREE.InstancedMesh; far: THREE.InstancedMesh }>();
let near = true;

/** Makes the two meshes of a piece's figures and keeps them until the stage disposes of them. */
export function figureMeshes(f: Figures) {
  const pair = build(f);
  pair.near.visible = near; pair.far.visible = !near;
  shown.add(pair);
  pair.near.addEventListener('dispose', () => { shown.delete(pair); pair.far.dispose(); (pair.near.material as THREE.Material).dispose(); });
  return pair;
}

/** Shows the near or the far kit, for a picture `across` blocks wide. */
export function showFigures(across: number) {
  near = across <= NEAR_UNTIL;
  for (const p of shown) { p.near.visible = near; p.far.visible = !near; }
}

/** whether any figures stand on the stage */
export const anyFigures = () => shown.size > 0;
