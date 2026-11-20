// The fields of the meshes on the stage (faces.ts `Field`): the colours of their columns' corners, each mesh's field
// one layer of a single texture that all such meshes share, so that they share their material too. A mesh takes a
// layer when it comes onto the stage and gives it back when it goes; where all are taken the texture grows to twice
// as many.
import * as THREE from 'three/webgpu';
import { texture } from 'three/tsl';
import { FIELD_SIDE } from '../faces';

/** the layers the texture starts with */
const FIRST_LAYERS = 4;
const LAYER_BYTES = FIELD_SIDE * FIELD_SIDE * 4;

const made = (data: Uint8Array, layers: number) => {
  const t = new THREE.DataArrayTexture(data, FIELD_SIDE, FIELD_SIDE, layers);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  // (a texture is sent whole the first time; after that the layers written since are sent alone)
  t.userData.sent = false;
  t.onUpdate = () => { t.userData.sent = true; };
  return t;
};

export function createFields() {
  let layers = FIRST_LAYERS, data = new Uint8Array(LAYER_BYTES * layers), tex = made(data, layers);
  const free = Array.from({ length: layers }, (_, k) => layers - 1 - k);
  /** the texture as the material reads it (its value changes where the texture grows) */
  const node = texture(tex);
  return {
    node,
    /** the layers there are now, and of those the ones taken (for the counts) */
    get layers() { return layers; },
    get taken() { return layers - free.length; },
    /** A layer for a mesh's field, with its colours written into it. */
    take(tones: Uint8Array): number {
      if (!free.length) {
        // (the meshes keep their layers: the colours there move into the larger texture as they are)
        const more = new Uint8Array(LAYER_BYTES * layers * 2);
        more.set(data);
        for (let k = layers * 2 - 1; k >= layers; k--) free.push(k);
        const old = tex;
        layers *= 2; data = more; tex = made(data, layers); node.value = tex;
        old.dispose();
      }
      const layer = free.pop()!;
      data.set(tones.subarray(0, LAYER_BYTES), layer * LAYER_BYTES);
      if (tex.userData.sent) tex.addLayerUpdate(layer);
      tex.needsUpdate = true;
      return layer;
    },
    /** A mesh's layer given back as the mesh leaves the stage. */
    give(layer: number) { if (!free.includes(layer)) free.push(layer); },
  };
}
export type Fields = ReturnType<typeof createFields>;
