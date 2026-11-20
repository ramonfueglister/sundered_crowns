// How the stage's materials read a corner's colour that comes as four bytes (worldprobe/small.ts): the share each part
// has of the brightest, and half that brightest, of which 254 is one.
import type * as THREE from 'three/webgpu';
import { select } from 'three/tsl';

/**
 * What a triangle shows between its corners is kept within what a corner can show (no corner of a piece is brighter
 * than 1.05). Where a triangle stands almost on its edge to a camera, a bank of the water in the mirror's picture, the
 * colour worked out between its corners runs far out of that at a dot or two, and the mirror's blur made a bright spot
 * of each.
 */
export const MOST = 1.1;

/** the colour four bytes stand for */
export const bytesColour = (t: THREE.Node<'vec4'>) => t.rgb.mul(t.a.mul((2 * 255) / 254));

/** of a face's four colours (at its corners 0, 1, 2, 3) the one of the corner `corner` */
export const atCorner = (corner: THREE.Node<'float'>, four: readonly THREE.Node<'vec4'>[]) =>
  select(
    corner.lessThan(0.5),
    four[0],
    select(corner.lessThan(1.5), four[1], select(corner.lessThan(2.5), four[2], four[3])),
  );
