// The picture pipeline: the scene's pass with the creases and corners darkened, things that share the picture's dots
// put together again, the light taken as film takes it, and the map's paper laid on (see Stage.creases, Stage.dissolve,
// Stage.lay).
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  agxToneMapping,
  clamp,
  convertToTexture,
  dot,
  float,
  getViewPosition,
  max,
  mix,
  mrt,
  neutralToneMapping,
  normalView,
  output,
  pass,
  rtt,
  saturation,
  screenSize,
  screenUV,
  smoothstep,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { NEAR, SEA_Y } from '../layout';
import { CREASES } from '../light';
import { flag, number, q } from './address';
import { CALM_KEPT, LIT_GROUND, LOOK, TONE, UPSAMPLE_REACH } from './look';
import type { StageOptions } from './api';
import type { Materials } from './materials';

/** What the picture is aimed at: the ground it shows (laid out by Stage.aim) and the camera's distance from it. */
interface PictureView {
  ground: { x: number; z: number; wide: number; elev: number };
  distance: number;
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
  let picture: typeof colour | ReturnType<typeof colour.mul> = colour;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the pass's own pictures or smaller copies of them
    let depths: any = far,
      faces: any = facing;
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
    reached = creases.radius;
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
    let open = smooth.sample(screenUV).r as ReturnType<typeof float>;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sums of nodes: every `add` is a node type of its own
      let sum: any = float(0),
        weight: any = float(0);
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
    picture = Fn(() => {
      const shown = vec4(colour).toVar();
      If(creased.greaterThan(0), () => {
        shown.assign(creasedColour);
      });
      return shown;
    })() as unknown as typeof picture;
  }
  // things that share the picture's dots (see Stage.dissolve): at every dot the thing drawn there is taken as it is,
  // what it shares the dots with is the mean of the dots around that are drawn on the other set, and the two are
  // mixed by their shares. So both are whole pictures again, as in a resolve of screen-door transparency, and they
  // blend without single dots showing. Where a thing has all the dots, the picture is as it was drawn: so while
  // nothing on the stage is drawn on a share of the dots (most pictures: a piece dissolves for a third of a second),
  // the picture is not copied into a texture of its own and read nine times at every dot, but taken as it is.
  /** whether something on the stage is drawn on a share of the picture's dots (see `partial`) */
  const dissolving = uniform(0);
  {
    const whole = convertToTexture(picture);
    {
      const resolving = whole as unknown as { updateBefore(frame: unknown): unknown },
        draw = resolving.updateBefore.bind(resolving);
      resolving.updateBefore = (frame) => (dissolving.value > 0 ? draw(frame) : undefined);
    }
    /** of a dot: whether it is of the set from a mark up to 1, and the mark */
    const read = (at: Parameters<typeof facing.sample>[0]) => {
      const code = facing.sample(at).a,
        upper = step(0.5001, code).mul(step(code, 0.999));
      return { upper, mark: mix(code.mul(2).min(1), code.sub(0.5).mul(2), upper) };
    };
    const own = read(screenUV),
      here = whole.sample(screenUV).rgb,
      mine = mix(own.mark, own.mark.oneMinus(), own.upper);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sums of nodes: every `add` is a node type of its own
    let others: any = vec3(0, 0, 0),
      found: any = float(0);
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
    picture = Fn(() => {
      const shown = vec3(drawn.rgb).toVar();
      If(dissolving.greaterThan(0.5), () => {
        shown.assign(mix(other, here, mine));
      });
      return shown;
    })() as unknown as typeof picture;
  }
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
    picture = vec4(saturation(curved, saturated), 1) as unknown as typeof picture;
  }
  // the map's paper (see Stage.paper): drawn from straight above into a picture of its own, which the picture of the
  // scene then takes its colour from by where each of its points lies on the ground
  const paper = new THREE.Scene(),
    paperEye = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  const paperPicture = new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const laid = { strength: uniform(0), flat: uniform(1), seaTop: uniform(SEA_Y), things: uniform(1), calm: uniform(0) };
  const paperFrom = uniform(new THREE.Matrix4()),
    eyeInverse = uniform(camera.projectionMatrixInverse),
    eyeWorld = uniform(camera.matrixWorld);
  {
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
    picture = mix(
      picture,
      mix(ink.mul(mix(light, light.mul(CALM_KEPT).add(1 - CALM_KEPT), laid.calm)), ink, laid.flat),
      cover,
    );
  }
  // miniature blur: sharp around the middle distance, softer towards the far and the near edge
  pipeline.outputNode = flag('blur', false)
    ? dof(picture, scenePass.getViewZNode(), LOOK.distance, LOOK.focusRange, LOOK.blur)
    : picture;
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
  return { pipeline, creased, reached, dissolving, paper, paperEye, paperPicture, laid, aimPaper };
}
