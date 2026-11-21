// The tiles of the realms' map on the stage's paper, for realms.ts: one material for every tile, a tile's square on
// the ground, and its picture.
import { type vec4, userData } from 'three/tsl';
import * as THREE from 'three/webgpu';
import type { Stage } from '../lookprobe/stage';
import { blockOfCell } from './land';

/** dots along the side of a tile: as the tiles of the region (region.ts) */
export const TILE = 512;

/** A tile of the pyramid that has been painted; without a mesh it holds no realm. */
export interface Held {
  level: number;
  x: number;
  y: number;
  seen: number;
  mesh?: THREE.Mesh;
  picture?: THREE.Texture;
  /** the realms it was painted for (realms.ts `set`) */
  age: number;
  /** painted for realms that have changed since where it lies: shown until its new picture comes */
  old?: boolean;
}

interface Tiles {
  /** Puts the tile on the paper with its picture, RGBA row by row from the north (realms.worker.ts `RealmsDone.tile`); hidden until the view shows it. */
  put(h: Held, tile: Uint8ClampedArray): void;
  /** Takes the tile off the paper and lets go of its picture. */
  drop(h: Held): void;
  dispose(): void;
}

export function createTiles(stage: Stage): Tiles {
  // One material for every tile: a tile's picture is its mesh's (`userData.picture`), so that all tiles are drawn
  // by one shader. With a material of its own per tile three built a shader for every tile that came, on the
  // page's thread (47 while the page loaded about Paris at 1500 blocks across, some 3 ms each).
  const dots = userData('picture', 'texture') as unknown as ReturnType<typeof vec4>,
    paint = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false, transparent: true });
  // the picture holds colour times cover, and the cover, in linear light, so that its dots blend cleanly
  paint.colorNode = dots.rgb.div(dots.a.max(1 / 255));
  paint.opacityNode = dots.a;

  /** the tile as a square on the ground, in finest blocks from its north-west corner */
  const square = (level: number) => {
    const side = TILE * 2 ** level,
      e = blockOfCell(side, 0),
      s = blockOfCell(0, side),
      g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [0, 0, 0, s[0], 0, s[1], e[0], 0, e[1], s[0], 0, s[1], e[0] + s[0], 0, e[1] + s[1], e[0], 0, e[1]],
        3,
      ),
    );
    g.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3),
    );
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 0], 2));
    return g;
  };
  return {
    put(h, tile) {
      h.picture = new THREE.DataTexture(new Uint8Array(tile.buffer), TILE, TILE, THREE.RGBAFormat);
      h.picture.magFilter = THREE.LinearFilter;
      h.picture.minFilter = THREE.LinearMipmapLinearFilter;
      h.picture.generateMipmaps = true;
      h.picture.anisotropy = 4;
      h.picture.needsUpdate = true;
      h.mesh = new THREE.Mesh(square(h.level), paint);
      h.mesh.userData.picture = h.picture;
      h.mesh.frustumCulled = false;
      h.mesh.visible = false;
      stage.paper.add(h.mesh);
      stage.redraw();
    },
    drop(h) {
      if (!h.mesh) return;
      stage.paper.remove(h.mesh);
      stage.redraw();
      h.mesh.geometry.dispose();
      h.picture!.dispose();
    },
    dispose: () => paint.dispose(),
  };
}
