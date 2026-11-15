// The stage of the look: renderer, light rig, camera and picture pipeline. A scene (ground, things, water) is put on
// it and shown with the camera of Ramon's reference image.
// Address options: ?webgl=1 (WebGL 2 instead of WebGPU), ?w=1672&h=941 (fixed picture size), ?blur=1 (miniature blur,
// which the reference does not have), ?shadows=0, ?mirror=0 (no mirror image on the water), ?sky=0 (without the baked sky share: light step 1 only),
// ?ao=0 (without the darkening of creases and corners).
import * as THREE from 'three/webgpu';
import { convertToTexture, dot, float, fract, mix, mrt, normalView, output, pass, reflector, screenCoordinate, uniform, userData, vec2, vec3 } from 'three/tsl';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { hashBlur } from 'three/addons/tsl/display/hashBlur.js';
import { FRAME_W, LAND_Y, N, NEAR, RIGHT, SEA_Y, VIEW } from './layout';
import type { Batch } from './batch';
import { type Figures, anyFigures, figureMeshes, showFigures } from '../figures/stage';
import { OPEN_WATER } from './terrain';

const q = new URLSearchParams(location.search);
const flag = (k: string, fallback: boolean) => (q.has(k) ? q.get(k) !== '0' : fallback);

/**
 * The look in numbers. Light strengths are shares of the brightness of sunlit level ground (= 1), in linear light.
 * Measured on the reference: a cast shadow keeps about a third of the light, a wall turned away from the sun about a
 * quarter of a sunlit wall, and a shadow is a little shorter than the thing that casts it. One sun cannot give all three, so the rig has a high sun that casts the
 * shadows and a level side light without shadows that brightens the walls facing right.
 */
const LOOK = {
  distance: 3000,
  sun: 0.9, sunElevation: 48, sunTurn: 12, sunColor: 0xffe9c8,
  side: 0.78, sideColor: 0xfff0dc,
  sky: 0.36, skyColor: 0xa8c4ff, bounce: 0.12, bounceColor: 0xffe2c0, fill: 0.1, fillColor: 0xffe0c4,
  mirror: 0.38, mirrorTint: 0x73c0cc, mirrorBlur: 0.003,
  creaseReach: 2.0, creaseDepth: 1.2, creaseColor: 0x44485a,
  focusRange: 150, blur: 2.6,
};

/** The strengths and colours of the light that a page may set for itself. */
export type Light = Pick<typeof LOOK, 'sun' | 'sunColor' | 'side' | 'sky' | 'skyColor' | 'bounce' | 'fill' | 'mirror' | 'mirrorTint'>;
/**
 * The light of the near view: softer than the far view's, so that the shaded sides keep about two thirds of the sunlit
 * ones, as in the reference class image of the near view; and the softness of its cast shadows (the look's is 2).
 */
export const NEAR_LIGHT: Light = { sun: 1.05, sunColor: 0xfff2e4, side: 0.7, sky: 0.4, skyColor: 0xc8d4f0, bounce: 0.26, fill: 0.26, mirror: 0.3, mirrorTint: 0x1898a8 }, NEAR_SHADOW = 6;
const FAR_SHADOW = 2;

/** A mesh as flat lists: three numbers per corner for position, direction and colour. A `Batch` is one. */
export interface Shape { pos: ArrayLike<number>; nor: ArrayLike<number>; col: ArrayLike<number> }
export interface StageScene<S extends Shape = Batch> {
  ground: S; things: S;
  /** the sea, which mirrors what stands beside it */
  water: S;
  /** water above sea level (lakes, rivers): drawn plain, because the mirror lies at sea level */
  raised?: S;
  /** the people standing and walking on it (figures/crowd.ts) */
  figures?: Figures;
  counts: Record<string, number>;
}
export interface StageOptions {
  /** ground units across the picture (default: the frame of the reference) */
  frameW?: number;
  /** how far the camera looks down, in degrees (default: as in the reference) */
  elevation?: number;
  /** the picture is moved by the page itself (`Stage.aim`), not by the stage's own mouse controls */
  fixed?: boolean;
  /** height in blocks of the tallest thing that casts a shadow into the picture */
  tall?: number;
  /** the light strengths of this page where they differ from the look's (the near view is lit softer than the far view) */
  light?: Partial<Light>;
  /** softness of the cast shadows (the look's is 2) */
  shadowRadius?: number;
  /** the canvas to draw on (default: the page's first); the picture is as large as the canvas lies on the page */
  canvas?: HTMLCanvasElement;
}
export interface Stage {
  canvas: HTMLCanvasElement;
  /** Puts a scene on the stage, moved by (x, z) blocks. */
  add(built: StageScene<Shape>, x?: number, z?: number): THREE.Group;
  remove(group: THREE.Group): void;
  /**
   * Adds more things to a group on the stage, as a mesh of its own that is shown, hidden and dissolved by itself;
   * `drop` takes it off again.
   */
  more(group: THREE.Group, things: Shape): THREE.Mesh;
  drop(mesh: THREE.Mesh): void;
  /**
   * Draws a group, or one mesh of it, on a share of the picture's dots only, to dissolve it into the picture or out of it: of a fine
   * pattern that gives every dot a value from 0 to 1, those from `from` up to `until` (0 and 1: all of the group).
   * Two groups whose shares meet take each other's place dot by dot.
   */
  dissolve(thing: THREE.Group | THREE.Mesh, from: number, until: number): void;
  /** Puts a thing of the page's own making on the stage, or takes it off again (the page lets go of what it is made of). */
  put(thing: THREE.Object3D): void;
  take(thing: THREE.Object3D): void;
  /** How deep creases and corners are drawn, as a share of the look's own depth (1: as in the reference, 0: not at all). */
  creases(share: number): void;
  /** Softens the light towards the near view's, by a share (0: the page's own light, 1: the light of the near view). */
  soften(share: number): void;
  /** Points camera and lights at a ground point, with `frameW` blocks across the picture, looking down by `elevation` degrees. */
  aim(x: number, z: number, frameW: number, elevation: number): void;
  /** Asks for a new picture. */
  redraw(): void;
  /** Stops drawing and lets go of the renderer; the stage is not used after that. */
  dispose(): void;
  /** The point of the ground under a point of the page, in the stage's blocks; none where the picture shows no ground. */
  pick(px: number, py: number): [number, number, number] | null;
  /** what the page reports to the tools that take pictures of it; `ready` is set once a picture is drawn while `busy` is false */
  probe: { ready: boolean; counts: Record<string, number>; backend: string; /** pictures drawn in the last second, while figures walk */ fps?: number };
  /** more is still to come onto the stage (true until the page says otherwise) */
  busy: boolean;
}

/** Sets up the stage: renderer, light, camera and picture pipeline, with nothing on it yet. */
export async function createStage(o: StageOptions = {}): Promise<Stage> {
  const canvas = o.canvas ?? document.querySelector('canvas')!;
  const fixedW = Number(q.get('w')) || 0, fixedH = Number(q.get('h')) || 0;
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: flag('webgl', false) });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = flag('shadows', true);
  renderer.shadowMap.type = THREE.PCFShadowMap;
  await renderer.init();

  const scene = new THREE.Scene();
  let pending = 3;
  scene.background = new THREE.Color(...OPEN_WATER);
  const solid = new THREE.MeshLambertNodeMaterial({ vertexColors: true });
  // every mesh is drawn on the dots of the picture whose value lies between its two marks (see `dissolve`); the
  // pattern is interleaved gradient noise, which has no stripes or clumps
  const dots = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189)), marks = userData('dots', 'vec2') as unknown as ReturnType<typeof vec2>;
  solid.maskNode = dots.greaterThanEqual(marks.x).and(dots.lessThan(marks.y));
  // water: a soft mirror image of piers, hulls and houses is laid over the water colour
  let water = solid;
  const tint = uniform(new THREE.Color());
  if (flag('mirror', true)) {
    const mirror = reflector({ resolutionScale: 0.5 });
    mirror.target.rotateX(-Math.PI / 2);
    mirror.target.position.y = SEA_Y;
    scene.add(mirror.target);
    water = new THREE.MeshLambertNodeMaterial({ vertexColors: true });
    water.maskNode = solid.maskNode;
    // the mirror image is tinted like the water, so a white sail shows as a pale green shape, not as a light
    water.emissiveNode = hashBlur(mirror, float(LOOK.mirrorBlur), { repeats: float(24) }).rgb.mul(tint);
  }
  const geometry = (s: Shape) => {
    const g = new THREE.BufferGeometry(), list = (a: ArrayLike<number>) => new THREE.BufferAttribute(a instanceof Float32Array ? a : new Float32Array(a), 3);
    g.setAttribute('position', list(s.pos)); g.setAttribute('normal', list(s.nor)); g.setAttribute('color', list(s.col));
    g.computeBoundingSphere();
    return g;
  };

  // light step 1: sun, side light and sky; strengths are multiplied by π because a Lambert surface returns light / π
  const rad = THREE.MathUtils.degToRad;
  /** a direction on the ground given by its share to the right of the picture and towards its back, raised by `elev` */
  const from = (turn: number, elev: number) => {
    const right = Math.cos(rad(turn)) * Math.cos(rad(elev)), back = Math.sin(rad(turn)) * Math.cos(rad(elev));
    return new THREE.Vector3(RIGHT[0] * right - NEAR[0] * back, Math.sin(rad(elev)), RIGHT[1] * right - NEAR[1] * back);
  };
  const L = { ...LOOK, ...o.light };
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  const side = new THREE.DirectionalLight(L.sideColor), sky = new THREE.HemisphereLight();
  // light thrown back by the sunlit ground and walls: it lifts the walls that face the viewer's left, as in the reference
  const fill = new THREE.DirectionalLight(L.fillColor);
  scene.add(sun, sun.target, side, side.target, fill, fill.target, sky);
  let softened = -1;
  /** the page's own light, mixed towards the near view's by a share */
  const soften = (share: number) => {
    if (share === softened) return;
    softened = share;
    const at = (k: 'sun' | 'side' | 'sky' | 'bounce' | 'fill' | 'mirror') => L[k] + (NEAR_LIGHT[k] - L[k]) * share;
    const colour = (k: 'sunColor' | 'skyColor' | 'mirrorTint') => new THREE.Color(L[k]).lerp(new THREE.Color(NEAR_LIGHT[k]), share);
    sun.color.copy(colour('sunColor')); sun.intensity = at('sun') * Math.PI;
    sun.shadow.radius = (o.shadowRadius ?? FAR_SHADOW) + (NEAR_SHADOW - (o.shadowRadius ?? FAR_SHADOW)) * share;
    side.intensity = at('side') * Math.PI; fill.intensity = at('fill') * Math.PI;
    sky.color.copy(colour('skyColor')); sky.groundColor.set(L.bounceColor).multiplyScalar(at('bounce') / at('sky')); sky.intensity = at('sky') * Math.PI;
    // the mirror image is laid over what the water keeps of its own colour
    tint.value.copy(colour('mirrorTint')).multiplyScalar(at('mirror'));
    if (water !== solid) water.color.setRGB(1 - tint.value.r, 1 - tint.value.g, 1 - tint.value.b);
    pending = Math.max(pending, 1);
  };

  // the camera: far away with a long lens, so that the whole picture has one scale (the "parallel" look of the reference)
  const camera = new THREE.PerspectiveCamera(6.5, 1672 / 941, 1, LOOK.distance * 2);
  const controls = o.fixed ? null : new MapControls(camera, canvas);
  if (controls) { controls.minDistance = 600; controls.maxDistance = 4200; controls.maxPolarAngle = rad(80); }
  let frameW = o.frameW ?? FRAME_W;
  const lens = () => {
    // frameW ground units across the picture at the middle distance, whatever the window shape
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(frameW / camera.aspect / 2 / LOOK.distance));
    camera.updateProjectionMatrix();
  };
  const aim = (x: number, z: number, across: number, elevation: number) => {
    frameW = across;
    const elev = rad(elevation), frameD = (frameW * 941) / 1672 / Math.sin(elev), centre = new THREE.Vector3(x, LAND_Y, z);
    const toSun = from(LOOK.sunTurn, LOOK.sunElevation);
    sun.position.copy(centre).addScaledVector(toSun, 420); sun.target.position.copy(centre);
    // the shadow map covers the ground of the picture and what stands on it, seen from the sun
    const sc = sun.shadow.camera, wide = new THREE.Vector3().crossVectors(toSun, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(wide, toSun);
    let halfW = 0, halfH = 0, depth = 0;
    for (const s of [-0.02, 1.02]) for (const t of [-0.02, 1.02]) for (const y of [0, o.tall ?? 36]) {
      const u = (s - 0.5) * frameW, v = (t - 0.5) * frameD, p = new THREE.Vector3(u * RIGHT[0] + v * NEAR[0], y - LAND_Y, u * RIGHT[1] + v * NEAR[1]);
      halfW = Math.max(halfW, Math.abs(p.dot(wide))); halfH = Math.max(halfH, Math.abs(p.dot(up))); depth = Math.max(depth, Math.abs(p.dot(toSun)));
    }
    sc.left = -halfW; sc.right = halfW; sc.top = halfH; sc.bottom = -halfH; sc.near = 420 - depth - 10; sc.far = 420 + depth + 10;
    sc.updateProjectionMatrix();
    side.position.copy(centre).addScaledVector(from(0, 0), 100); side.target.position.copy(centre);
    fill.position.copy(centre).addScaledVector(from(180 + VIEW.turn, 20), 100); fill.target.position.copy(centre);
    const reach = (frameD / 2) * Math.cos(elev) + 80 + (o.tall ?? 0);
    camera.near = LOOK.distance - reach; camera.far = LOOK.distance + reach;
    camera.position.copy(centre).add(new THREE.Vector3(NEAR[0] * Math.cos(elev), Math.sin(elev), NEAR[1] * Math.cos(elev)).multiplyScalar(LOOK.distance));
    camera.lookAt(centre);
    if (controls) { controls.target.copy(centre); controls.update(); }
    lens();
    showFigures(frameW);
    pending = Math.max(pending, 1);
  };
  aim(N / 2, N / 2, frameW, o.elevation ?? VIEW.elevation);
  soften(0);

  const pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  // creases and corners: every point is darkened by how much of its surroundings stands in front of it
  const colour = scenePass.getTextureNode('output'), far = scenePass.getTextureNode('depth');
  let picture: typeof colour | ReturnType<typeof colour.mul> = colour;
  const creased = uniform(1);
  if (flag('ao', true)) {
    scenePass.setMRT(mrt({ output, normal: normalView }));
    const facing = scenePass.getTextureNode('normal'), creases = ao(far, facing, camera);
    creases.radius.value = LOOK.creaseReach; creases.thickness.value = 4; creases.scale.value = LOOK.creaseDepth; creases.samples.value = 24;
    // the raw result is speckled; the smoothing keeps to surfaces of like depth and direction
    // a crease does not turn grey: it keeps a share of bluish light, as the shadows of the reference do
    const open = convertToTexture(denoise(creases.getTextureNode(), far, facing, camera)).r, deep = new THREE.Color(LOOK.creaseColor);
    picture = colour.mul(mix(vec3(1, 1, 1), mix(vec3(deep.r, deep.g, deep.b), vec3(1, 1, 1), open), creased));
  }
  // miniature blur: sharp around the middle distance, softer towards the far and the near edge
  pipeline.outputNode = flag('blur', false) ? dof(picture, scenePass.getViewZNode(), LOOK.distance, LOOK.focusRange, LOOK.blur) : picture;

  const resize = () => {
    // a canvas of the page's own is laid out by the page; the stage only follows its size
    const w = fixedW || (o.canvas?.clientWidth ?? innerWidth) || 1, h = fixedH || (o.canvas?.clientHeight ?? innerHeight) || 1;
    renderer.setPixelRatio(fixedW ? 1 : Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, !o.canvas || !!fixedW);
    camera.aspect = w / h;
    lens();
    pending = Math.max(pending, 1);
  };
  addEventListener('resize', resize);
  controls?.addEventListener('change', () => { pending = Math.max(pending, 1); });
  resize();

  const mesh = (shape: Shape, material: THREE.Material, casts: boolean) => {
    const made = new THREE.Mesh(geometry(shape), material);
    made.castShadow = casts; made.receiveShadow = true; made.userData.dots = new THREE.Vector2(0, 1);
    return made;
  };
  const stage: Stage = {
    canvas, aim, soften, busy: true,
    probe: { ready: false, counts: {}, backend: flag('webgl', false) ? 'webgl2' : 'webgpu' },
    add(built, x = 0, z = 0) {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      for (const [shape, material, casts] of [[built.ground, solid, true], [built.things, solid, true], [built.water, water, false], [built.raised, solid, false]] as const) {
        if (!shape || !shape.pos.length) continue;
        const part = mesh(shape, material, casts);
        part.userData.ground = shape === built.ground;
        group.add(part);
      }
      if (built.figures?.count) { const f = figureMeshes(built.figures); group.add(f.near, f.far); showFigures(frameW); }
      scene.add(group);
      pending = Math.max(pending, 3);
      return group;
    },
    remove(group) {
      scene.remove(group);
      // the figures' kit is shared by every piece: only their own mesh is let go (figures/stage.ts)
      for (const mesh of group.children) if (mesh.userData.figures === 'near') (mesh as THREE.InstancedMesh).dispose(); else if (!mesh.userData.figures) (mesh as THREE.Mesh).geometry.dispose();
      pending = Math.max(pending, 1);
    },
    more(group, things) { const part = mesh(things, solid, true); group.add(part); pending = Math.max(pending, 3); return part; },
    drop(part) { part.removeFromParent(); part.geometry.dispose(); pending = Math.max(pending, 1); },
    dissolve(thing, from, until) {
      // the figures are too small to dissolve: they show with the whole group only
      for (const part of (thing as THREE.Mesh).isMesh ? [thing] : thing.children) if (part.userData.figures) part.visible = from <= 0 && until >= 1; else (part.userData.dots as THREE.Vector2).set(from, until);
      pending = Math.max(pending, 1);
    },
    put(thing) { scene.add(thing); pending = Math.max(pending, 1); },
    take(thing) { scene.remove(thing); pending = Math.max(pending, 1); },
    creases(share) { if (creased.value !== share) { creased.value = share; pending = Math.max(pending, 1); } },
    redraw() { pending = Math.max(pending, 1); },
    dispose() { renderer.setAnimationLoop(null); removeEventListener('resize', resize); renderer.dispose(); },
    pick(px, py) {
      const box = canvas.getBoundingClientRect(), ray = new THREE.Raycaster(), grounds: THREE.Object3D[] = [];
      ray.setFromCamera(new THREE.Vector2(((px - box.left) / box.width) * 2 - 1, 1 - ((py - box.top) / box.height) * 2), camera);
      scene.traverseVisible((thing) => { if (thing.userData.ground) grounds.push(thing); });
      const hit = ray.intersectObjects(grounds, false)[0];
      return hit ? [hit.point.x, hit.point.y, hit.point.z] : null;
    },
  };
  (window as unknown as { __probe: Stage['probe'] }).__probe = stage.probe;
  let drawn = 0, since = performance.now();
  renderer.setAnimationLoop(() => {
    // a picture of fixed size is taken by a tool, which waits for the finished scene: nothing is drawn before
    // walking figures keep the picture moving; a picture of fixed size is a still, so that a tool's picture comes
    if (!fixedW && anyFigures()) pending = Math.max(pending, 1);
    if (pending <= 0 || (fixedW && stage.busy)) return;
    pipeline.render();
    drawn++;
    if (performance.now() - since >= 1000) { stage.probe.fps = Math.round((drawn * 1000) / (performance.now() - since)); drawn = 0; since = performance.now(); }
    if (--pending === 0 && !stage.busy) stage.probe.ready = true;
  });
  return stage;
}

/** Builds the scene with `build` (told whether the sky share is to be baked in) and shows it. */
export async function stage(build: (bakedSky: boolean) => StageScene | Promise<StageScene>, o: StageOptions = {}) {
  const st = await createStage(o), built = await build(flag('sky', true));
  st.add(built);
  st.probe.counts = built.counts; st.busy = false;
}
/** Whether the sky share is to be baked into the ground (address option ?sky=0 switches it off). */
export const bakedSky = () => flag('sky', true);

/** Shows an error of the stage on the page instead of a blank picture. */
export function showError(e: unknown): never {
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:auto 0 0 0;margin:0;padding:12px;background:#400;color:#fff">${String(e)}</pre>`);
  throw e;
}
