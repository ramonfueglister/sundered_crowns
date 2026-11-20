// The picture pipeline: the scene's pass with the creases and corners darkened, things that share the picture's dots
// put together again, the light taken as film takes it, and the map's paper laid on (see Stage.creases, Stage.dissolve,
// Stage.lay).
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  agxToneMapping,
  convertToTexture,
  float,
  max,
  mix,
  mrt,
  neutralToneMapping,
  normalView,
  output,
  pass,
  saturation,
  screenSize,
  screenUV,
  step,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { flag, q } from './address';
import { creasesOn } from './creases';
import { type PictureView, createPaper } from './paper';
import { LOOK, TONE } from './look';
import type { StageOptions } from './api';
import type { Materials } from './materials';

/**
 * the picture as it is worked on: the scene pass's colour, or a node made from it (TSL types the results of `Fn` and
 * `vec4` apart from these, so they are cast to it)
 */
type Picture = THREE.TextureNode | ReturnType<THREE.TextureNode['mul']>;

/**
 * Puts the things together again that share the picture's dots (see Stage.dissolve): at every dot the thing drawn there is taken as it is,
 * what it shares the dots with is the mean of the dots around that are drawn on the other set, and the two are
 * mixed by their shares. So both are whole pictures again, as in a resolve of screen-door transparency, and they
 * blend without single dots showing. Where a thing has all the dots, the picture is as it was drawn: so while
 * nothing on the stage is drawn on a share of the dots (most pictures: a piece dissolves for a third of a second),
 * the picture is not copied into a texture of its own and read nine times at every dot, but taken as it is.
 */
function resolveDots(picture: Picture, facing: THREE.TextureNode, dissolving: THREE.UniformNode<'float'>) {
  const whole = convertToTexture(picture);
  {
    const resolving = whole as unknown as { updateBefore(frame: unknown): unknown },
      draw = resolving.updateBefore.bind(resolving);
    resolving.updateBefore = (frame) => (dissolving.value > 0 ? draw(frame) : undefined);
  }
  /** of a dot: whether it is of the set from a mark up to 1, and the mark */
  const read = (at: Parameters<THREE.TextureNode['sample']>[0]) => {
    const code = facing.sample(at).a,
      upper = step(0.5001, code).mul(step(code, 0.999));
    return { upper, mark: mix(code.mul(2).min(1), code.sub(0.5).mul(2), upper) };
  };
  const own = read(screenUV),
    here = whole.sample(screenUV).rgb,
    mine = mix(own.mark, own.mark.oneMinus(), own.upper);
  let others: THREE.Node<'vec3'> = vec3(0, 0, 0),
    found: THREE.Node<'float'> = float(0);
  for (const by of [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ] as [number, number][]) {
    const at = screenUV.add(vec2(...by).div(screenSize)),
      it = read(at);
    // of the other set, and sharing its dots (a thing with all the dots is no one's other half)
    const counts = it.upper
      .sub(own.upper)
      .abs()
      .mul(max(it.upper, step(it.mark, 0.9999)));
    others = others.add(whole.sample(at).rgb.mul(counts));
    found = found.add(counts);
  }
  const other = mix(here, others.div(max(found, 1)), step(0.5, found)),
    drawn = picture;
  return Fn(() => {
    const shown = vec3(drawn.rgb).toVar();
    If(dissolving.greaterThan(0.5), () => {
      shown.assign(mix(other, here, mine));
    });
    return shown;
  })();
}

/** Builds the pipeline that draws the scene through `camera`; `view` tells where the picture looks now. */
export function createPicture(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  o: StageOptions,
  m: Pick<Materials, 'shareCode' | 'inkOf'>,
  view: () => PictureView,
) {
  const { shareCode, inkOf } = m;
  const pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  // creases and corners: every point is darkened by how much of its surroundings stands in front of it
  const colour = scenePass.getTextureNode('output'),
    far = scenePass.getTextureNode('depth');
  let picture: Picture = colour;
  const creased = uniform(1);
  let reached: { value: number } | null = null;
  // beside the picture: which way every point faces, and with it the share of the dots its mesh is drawn on
  // (`?ink=0` leaves the third picture out, for measuring what it costs: then the realms' colour lies on everything alike)
  const inks = flag('ink', true);
  scenePass.setMRT(
    mrt(
      inks
        ? { output, normal: vec4(normalView, shareCode), ink: vec4(inkOf, 0, 0, 1) }
        : { output, normal: vec4(normalView, shareCode) },
    ),
  );
  const facing = scenePass.getTextureNode('normal'),
    inked = inks ? scenePass.getTextureNode('ink') : null;
  if (flag('ao', true)) {
    const made = creasesOn(renderer, camera, colour, far, facing, creased);
    picture = made.picture as unknown as Picture;
    reached = made.reached;
  }
  /** whether something on the stage is drawn on a share of the picture's dots (see `partial`) */
  const dissolving = uniform(0);
  picture = resolveDots(picture, facing, dissolving) as unknown as Picture;
  // The picture's light as film takes it: a curve that keeps the shadows and the middle tones and rolls the bright
  // ones off softly instead of cutting them, with the colours of what is bright a little paler, as light is seen
  // (`?tone=agx|neutral|none`, `?exposure=1`, `?saturation=1`). The map's paper is laid on after it: its colours
  // stay as they are printed. What the paper takes of the land's light and shade is the light before the curve.
  const lit = picture;
  {
    const way = q.get('tone') ?? TONE.way,
      exposure = float(Number(q.get('exposure') ?? TONE.exposure)),
      saturated = float(Number(q.get('saturation') ?? TONE.saturation));
    const curved =
      way === 'agx'
        ? agxToneMapping(picture.rgb, exposure)
        : way === 'neutral'
          ? neutralToneMapping(picture.rgb, exposure)
          : picture.rgb.mul(exposure);
    picture = vec4(saturation(curved, saturated), 1) as unknown as Picture;
  }
  const { paper, paperEye, paperPicture, laid, layOn, aimPaper } = createPaper(renderer, camera, o, view, far, inked);
  picture = layOn(picture, lit);
  // miniature blur: sharp around the middle distance, softer towards the far and the near edge
  pipeline.outputNode = flag('blur', false)
    ? dof(picture, scenePass.getViewZNode(), LOOK.distance, LOOK.focusRange, LOOK.blur)
    : picture;
  return { pipeline, creased, reached, dissolving, paper, paperEye, paperPicture, laid, aimPaper };
}
