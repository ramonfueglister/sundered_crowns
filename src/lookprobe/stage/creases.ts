// The creases and corners of the picture (see Stage.creases): every point is darkened by how much of its surroundings
// stands in front of it (three's GTAONode), worked out from the scene pass's depths and directions.
import * as THREE from 'three/webgpu';
import { Fn, If, dot, float, getViewPosition, max, mix, rtt, screenUV, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { CREASES } from '../light';
import { flag, number } from './address';
import { LOOK, UPSAMPLE_REACH } from './look';

/**
 * The scene pass's colour `colour` with its creases darkened, by `creased` (0: none, and nothing of them is drawn),
 * from its depths `far` and directions `facing`; and how far the creases reach (`reached`, Stage.creases).
 */
export function creasesOn(
  renderer: THREE.WebGPURenderer,
  camera: THREE.PerspectiveCamera,
  colour: THREE.TextureNode,
  far: THREE.TextureNode,
  facing: THREE.TextureNode,
  creased: THREE.UniformNode<'float'>,
) {
  // The creases are worked out and smoothed on every other dot of the picture each way, a quarter of the work
  // (Jimenez et al. 2016 work them out at half resolution too), and laid over the picture by depth. The depths and
  // directions of those dots are copied into smaller pictures of their own first: so each of them is worked out
  // at a point the picture really shows, as dark as at every dot, and from depths that lie closer together in memory.
  // For measuring: ?aoscale=1 (at every dot, as before), ?aosamples=24, ?aosmooth=0 (not smoothed).
  const scale = number('aoscale', 0.5),
    small = scale < 1,
    parts: { updateBefore?(frame: unknown): unknown }[] = [];
  /** half a dot of the picture, and the dots of the smaller pictures, each way */
  const half = uniform(new THREE.Vector2()),
    fewer = uniform(new THREE.Vector2());
  const sized = () => {
    const dots = renderer.getDrawingBufferSize(new THREE.Vector2());
    half.value.set(0.5 / dots.x, 0.5 / dots.y);
    fewer.value.set(Math.floor(dots.x * scale), Math.floor(dots.y * scale));
  };
  // the pass's own pictures or smaller copies of them
  let depths: THREE.TextureNode = far,
    faces: THREE.TextureNode = facing;
  if (small) {
    // the dot a smaller picture's dot stands for: the one whose middle lies half a dot before its own middle
    const from = uv().sub(half);
    const copy = (of: Parameters<typeof rtt>[0], type: THREE.TextureDataType) => {
      const made = rtt(of, null, null, { resolutionScale: scale, type });
      made.renderTarget!.texture.minFilter = made.renderTarget!.texture.magFilter = THREE.NearestFilter;
      parts.push(made);
      return made;
    };
    depths = copy(vec4(far.sample(from).r, 0, 0, 1), THREE.FloatType);
    faces = copy(facing.sample(from), THREE.HalfFloatType);
  }
  const creases = ao(depths, faces, camera);
  if (small) {
    const size = creases.setSize.bind(creases);
    creases.setSize = (w, h) => size(Math.floor(w * scale), Math.floor(h * scale));
  }
  creases.radius.value = LOOK.creaseReach;
  creases.thickness.value = CREASES.thickness;
  creases.scale.value = LOOK.creaseDepth;
  creases.samples.value = number('aosamples', 24);
  // the raw result is speckled; the smoothing keeps to surfaces of like depth and direction
  const raw = creases.getTextureNode(),
    smoother = denoise(raw, depths, faces, camera);
  // (as far across the picture as at every dot)
  smoother.radius.value *= scale;
  const smooth = flag('aosmooth', true) ? rtt(smoother, null, null, { resolutionScale: scale }) : raw;
  // nothing of this is drawn while the creases do not show (see Stage.creases): from afar the picture has none
  for (const part of [...parts, creases, smooth] as typeof parts) {
    const draw = part.updateBefore?.bind(part);
    if (draw)
      part.updateBefore = (frame) => {
        sized();
        return creased.value > 0 ? draw(frame) : undefined;
      };
  }
  let open: THREE.Node<'float'> = smooth.sample(screenUV).r;
  if (small) {
    // a dot of the picture takes the creases of the four dots around it in the smaller picture, each by how near
    // it is and by how near its point lies to the surface the dot shows: so that the darkness under an eave
    // does not spill over the edge of the roof in front of it
    const lensInverse = uniform(camera.projectionMatrixInverse),
      at = screenUV.add(half).mul(fewer).sub(0.5),
      corner = at.floor(),
      part = at.sub(corner);
    const here = getViewPosition(screenUV, far.sample(screenUV).r, lensInverse),
      faced = facing.sample(screenUV).rgb.normalize();
    let sum: THREE.Node<'float'> = float(0),
      weight: THREE.Node<'float'> = float(0);
    for (const [i, j] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      const its = corner.add(vec2(i + 0.5, j + 0.5)).div(fewer),
        there = getViewPosition(its.sub(half), depths.sample(its).r, lensInverse);
      const near = (i ? part.x : part.x.oneMinus()).mul(j ? part.y : part.y.oneMinus()),
        w = near.mul(max(dot(here.sub(there), faced).abs().div(UPSAMPLE_REACH).oneMinus(), 0)).add(1e-4);
      sum = sum.add(smooth.sample(its).r.mul(w));
      weight = weight.add(w);
    }
    open = sum.div(weight);
  }
  // a crease does not turn grey: it keeps a share of bluish light, as the shadows of the reference do
  // (where the creases do not show, the dots of the smaller picture are not looked at either)
  const deep = new THREE.Color(LOOK.creaseColor),
    creasedColour = colour.mul(mix(vec3(1, 1, 1), mix(vec3(deep.r, deep.g, deep.b), vec3(1, 1, 1), open), creased));
  const picture = Fn(() => {
    const shown = vec4(colour).toVar();
    If(creased.greaterThan(0), () => {
      shown.assign(creasedColour);
    });
    return shown;
  })();
  return { picture, reached: creases.radius };
}
