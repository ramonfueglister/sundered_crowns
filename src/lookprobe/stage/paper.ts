// The map's paper (see Stage.lay, Stage.paper): drawn from straight above into a picture of its own, which the
// picture of the scene then takes its colour from by where each of its points lies on the ground.
import * as THREE from 'three/webgpu';
import {
  clamp,
  dot,
  float,
  getViewPosition,
  max,
  mix,
  screenUV,
  smoothstep,
  step,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { NEAR, SEA_Y } from '../layout';
import type { StageOptions } from './api';
import { CALM_KEPT, LIT_GROUND } from './look';

/** What the picture is aimed at: the ground it shows (laid out by Stage.aim) and the camera's distance from it. */
export interface PictureView {
  ground: { x: number; z: number; wide: number; elev: number };
  distance: number;
}

/**
 * The paper for the picture `camera` takes, which `view` tells where it looks now, from the scene pass's depths
 * `far` and the share of their own colours what is drawn keeps (`inked`, Stage.lay).
 */
export function createPaper(
  renderer: THREE.WebGPURenderer,
  camera: THREE.PerspectiveCamera,
  o: StageOptions,
  view: () => PictureView,
  far: THREE.TextureNode,
  inked: THREE.TextureNode | null,
) {
  const paper = new THREE.Scene(),
    paperEye = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  const paperPicture = new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const laid = { strength: uniform(0), flat: uniform(1), seaTop: uniform(SEA_Y), things: uniform(1), calm: uniform(0) };
  const paperFrom = uniform(new THREE.Matrix4()),
    eyeInverse = uniform(camera.projectionMatrixInverse),
    eyeWorld = uniform(camera.matrixWorld);
  /** `picture` with the paper laid on; `lit` is its light before the film's curve, whose light and shade colour the ink */
  const layOn = (picture: THREE.Node<'vec4'>, lit: THREE.Node<'vec4'>) => {
    const depth = far.sample(screenUV).r,
      inView = getViewPosition(screenUV, depth, eyeInverse),
      there = eyeWorld.mul(vec4(inView, 1));
    const onPaper = paperFrom.mul(there),
      at = onPaper.xy.mul(vec2(0.5, -0.5)).add(0.5),
      dots = texture(paperPicture.texture, at);
    // nothing beyond the paper's edges, nor where the picture shows no ground (its depth at the far end)
    const inside = step(0, at.x).mul(step(at.x, 1)).mul(step(0, at.y)).mul(step(at.y, 1)).mul(step(depth, 0.999999));
    // the sea keeps its own look unless the paper is laid flat as a printed map
    const land = max(smoothstep(laid.seaTop.sub(0.05), laid.seaTop.add(0.05), there.y), laid.flat);
    // houses, trees and fields keep more of their own colours under the paper than the ground, until it lies flat as a printed map
    const ink = dots.rgb.div(max(dots.a, 1 / 255)),
      cover = dots.a
        .mul(laid.strength)
        .mul(inside)
        .mul(land)
        .mul(inked ? mix(mix(laid.things, 1, inked.sample(screenUV).r), 1, laid.flat) : float(1));
    // the land's light and shade, as a share of how sunlit level ground is drawn, colours the ink with it
    // (softened: the light and shade of the relief should show, the colours of woods and fields much less)
    const light = clamp(
      dot(lit.rgb, vec3(0.2126, 0.7152, 0.0722))
        .div(LIT_GROUND)
        .pow(0.5),
      0.45,
      1.25,
    );
    return mix(
      picture,
      mix(ink.mul(mix(light, light.mul(CALM_KEPT).add(1 - CALM_KEPT), laid.calm)), ink, laid.flat),
      cover,
    );
  };
  /** points the paper's eye straight down at the ground of the picture, with one of its dots to about one of the picture's */
  const aimPaper = () => {
    const { ground, distance } = view(),
      { x, z, wide, elev } = ground,
      size = new THREE.Vector2(),
      deep = wide / camera.aspect / Math.sin(elev);
    renderer.getDrawingBufferSize(size);
    // what stands tall is seen beyond the ground's edges at the far side of a slanted picture
    // (the far side of the picture is wider than its middle by as much as it lies farther from the camera)
    const halfW = wide * 0.56 * (1 + ((deep / 2) * Math.cos(elev)) / distance),
      halfD = deep * 0.54 + (o.tall ?? 36) / Math.tan(elev);
    paperEye.left = -halfW;
    paperEye.right = halfW;
    paperEye.top = halfD;
    paperEye.bottom = -halfD;
    paperEye.updateProjectionMatrix();
    paperEye.position.set(x, 2000, z);
    paperEye.up.set(-NEAR[0], 0, -NEAR[1]);
    paperEye.lookAt(x, 0, z);
    paperEye.updateMatrixWorld();
    const across = Math.min(4096, Math.max(256, size.x)),
      down = Math.min(4096, Math.max(256, Math.round((across * halfD) / halfW)));
    if (paperPicture.width !== across || paperPicture.height !== down) paperPicture.setSize(across, down);
    paperFrom.value.multiplyMatrices(paperEye.projectionMatrix, paperEye.matrixWorldInverse);
  };
  return { paper, paperEye, paperPicture, laid, layOn, aimPaper };
}
