// The stage of the look: renderer, light rig, camera and picture pipeline. A scene (ground, things, water) is put on
// it and shown with the camera of Ramon's reference image.
// Address options: ?webgl=1 (WebGL 2 instead of WebGPU), ?w=1672&h=941 (fixed picture size), ?blur=1 (miniature blur,
// which the reference does not have), ?shadows=0, ?mirror=0 (no mirror image on the water), ?sky=0 (without the baked sky share: light step 1 only),
// ?ao=0 (without the darkening of creases and corners; ?aoscale, ?aosamples, ?aosmooth: see there). ?small=0: the pieces' directions and
// colours come as floats, not as bytes (worldprobe/small.ts). ?faces=0: their rectangles on the grid of blocks come as
// triangles in those lists, not as faces (faces.ts).
import * as THREE from 'three/webgpu';
import { Fn, attribute, clamp, convertToTexture, dot, float, fract, getViewPosition, materialColor, max, mix, mrt, normalView, output, pass, positionGeometry, reflector, rtt, screenCoordinate, screenSize, screenUV, select, smoothstep, step, texture, uniform, userData, uv, vec2, vec3, vec4 } from 'three/tsl';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { hashBlur } from 'three/addons/tsl/display/hashBlur.js';
import { FRAME_W, LAND_Y, N, NEAR, RIGHT, SEA_Y, VIEW } from './layout';
import type { Batch } from './batch';
import { RIG, towards, CREASES } from './light';
import { type Figures, anyFigures, figureMeshes, keepFigures, showFigures, warmFigures } from '../figures/stage';
import { OPEN_WATER } from './terrain';
import { FACE_COL, FACE_CORNERS, FACE_GEO, FACE_STEPS, FLIPPED, RISES, type Faces, faceHit, unfaced } from './faces';

const q = new URLSearchParams(location.search);
const flag = (k: string, fallback: boolean) => (q.has(k) ? q.get(k) !== '0' : fallback);
const number = (k: string, fallback: number) => (q.has(k) && Number.isFinite(+q.get(k)!) ? +q.get(k)! : fallback);
/** the creases of a dot of the smaller picture count for a dot of the picture whose surface lies within this many blocks of its point */
const UPSAMPLE_REACH = 0.25;

/**
 * The look in numbers. Light strengths are shares of the brightness of sunlit level ground (= 1), in linear light.
 * Measured on the reference: a cast shadow keeps about a third of the light, a wall turned away from the sun about a
 * quarter of a sunlit wall, and a shadow is a little shorter than the thing that casts it. One sun cannot give all three, so the rig has a high sun that casts the
 * shadows and a level side light without shadows that brightens the walls facing right.
 */
const LOOK = {
  distance: 3000,
  sun: RIG.sun as number, sunElevation: RIG.sunElevation, sunTurn: RIG.sunTurn, sunColor: 0xffe9c8,
  side: RIG.side as number, sideColor: 0xfff0dc,
  sky: RIG.sky as number, skyColor: 0xa8c4ff, bounce: RIG.bounce as number, bounceColor: 0xffe2c0, fill: RIG.fill as number, fillColor: 0xffe0c4,
  mirror: 0.38, mirrorTint: 0x73c0cc, mirrorBlur: 0.003,
  creaseReach: CREASES.reach as number, creaseDepth: CREASES.depth as number, creaseColor: CREASES.colour as number,
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
/** of the land's light and shade this share is left under the map's paper where it is fully calmed (see Stage.lay) */
const CALM_KEPT = 0.4;
/** how bright level, sunlit ground is drawn (luminance, linear light): the map's ink under the land's own light and shade is as bright as on the paper there */
const LIT_GROUND = 0.32;
/** the figures of a piece are gone when another layer has taken this share of its dots (see `dissolve`) */
const FIGURES_GONE = 0.3;
/** the layer the figures are drawn on: the picture's camera sees it, the water mirror's does not */
const FIGURES_LAYER = 1;

/**
 * A mesh as flat lists: three numbers per corner for position, direction and colour. A `Batch` is one. Or, where
 * `small`, direction and colour as four bytes per corner each (worldprobe/small.ts): 20 bytes to a corner, not 36.
 */
export interface Shape {
  pos: ArrayLike<number>; nor: ArrayLike<number>; col: ArrayLike<number>;
  /** the ball around all its points, middle and radius, where its builder has worked it out (else the stage does, on the page's thread) */
  ball?: [number, number, number, number];
  small?: boolean;
  /**
   * its rectangles on the grid of blocks, taken out of the lists (faces.ts): the stage draws them beside what the
   * lists hold, as a mesh of its own. Not of water that mirrors, and not of what `more` adds.
   */
  faces?: Faces;
}
export interface StageScene<S extends Shape = Batch> {
  ground: S; things: S;
  /** the sea, which mirrors what stands beside it */
  water: S;
  /** water above sea level (lakes, rivers): drawn plain, because the mirror lies at sea level */
  raised?: S;
  /** what the columns of the ground carry as part of themselves (terrain.ts `carried`): ground to a click, but to the map's paper what stands on the ground */
  carried?: S;
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
   * `?send=1`: the stage sends the lists of new meshes to the graphics card itself, a few to a picture, before they
   * are shown (`sent`, `room`). Off by default: measured on a Mac it took the single pictures of over 100 ms away
   * but left the zoom at 60 pictures a second where it had 120, and made a cold start and a leap in half a second
   * longer (the stand-ins are meshes of their own to the renderer, which sets each up as it does the mesh itself).
   */
  staged: boolean;
  /**
   * Whether the lists of a group's meshes, or of one mesh, are on the graphics card (always, unless `staged`). A
   * mesh shown before that sends its lists in the picture that first draws it, however long that picture then takes.
   */
  sent(thing: THREE.Group | THREE.Mesh): boolean;
  /** Whether the next picture could send more lists than are waiting to be sent: then the next meshes may as well be put on the stage now. */
  room(): boolean;
  /**
   * Draws a group, or one mesh of it, on a share of the picture's dots only, to dissolve it into the picture or out of it: of a fine
   * pattern that gives every dot a value from 0 to 1, those from `from` up to `until` (0 and 1: all of the group).
   * Two groups whose shares meet take each other's place dot by dot; the picture is then put together from the two,
   * each made whole from its own dots and mixed by the share, so that they blend and no pattern of dots shows.
   */
  dissolve(thing: THREE.Group | THREE.Mesh, from: number, until: number): void;
  /**
   * `on`: the meshes of a group are drawn whether they lie in the picture or not. A group that is drawn so, on none
   * of the picture's dots, has all its lists sent to the graphics card in that picture.
   */
  whole(group: THREE.Group, on: boolean): void;
  /**
   * How far the meshes of a group that glide to the shape of the next coarser step have come, 0 … 1: at 1 each of
   * their faces lies and looks as that step has it there (worldprobe/glide.ts).
   */
  glide(group: THREE.Group, share: number): void;
  /** How many pictures the stage has drawn. */
  pictures(): number;
  /** Puts a thing of the page's own making on the stage, or takes it off again (the page lets go of what it is made of). */
  put(thing: THREE.Object3D): void;
  take(thing: THREE.Object3D): void;
  /** How deep creases and corners are drawn, as a share of the look's own depth (1: as in the reference, 0: not at all), and how far they reach, as a share of the look's own reach in the stage's blocks. */
  creases(share: number, reach?: number): void;
  /** Softens the light towards the near view's, by a share (0: the page's own light, 1: the light of the near view). */
  soften(share: number): void;
  /**
   * The map's paper: what is put on it (the realms' colours, realms.ts) is seen from straight above and laid onto the
   * ground of the picture where it really lies, over relief, houses and trees alike, as the map modes of EU5 lie on
   * its land. Its pictures hold colour times cover and the cover, in linear light.
   */
  paper: THREE.Scene;
  /**
   * How the paper lies on the picture: `strength` how much it covers (0: not at all); `flat` how much of the land's own
   * light and shade it hides and whether it covers the sea too (0: the land shows through it and the sea is left
   * free, 1: the paper's colours as they are, sea and all, as on a printed map); the water's surface lies below `seaTop`.
   * `things`: how much of it lies on what stands on the ground (houses, trees, fields), as a share of what lies on the
   * ground itself (default: as much). `calm`: how far the land's light and shade are evened out under it, 0 … 1: from
   * afar woods and fields are many small blocks, which would speckle the realm's colour.
   */
  lay(strength: number, flat: number, seaTop: number, things?: number, calm?: number): void;
  /** Points camera and lights at a ground point, with `frameW` blocks across the picture, looking down by `elevation` degrees, from `away` times the look's own distance (the farther, the less the far side of the picture is drawn smaller than the near). */
  aim(x: number, z: number, frameW: number, elevation: number, away?: number): void;
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
  // `?gpu=1`: the graphics card's own time for each pass of a picture is measured (the counts `gpu …`), for the tools
  const timed = flag('gpu', false);
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: flag('webgl', false), trackTimestamp: timed });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = flag('shadows', true);
  renderer.shadowMap.type = THREE.PCFShadowMap;
  await renderer.init();

  const scene = new THREE.Scene();
  let pending = 3;
  scene.background = new THREE.Color(...OPEN_WATER);
  // The pieces come with directions and colours as bytes (worldprobe/small.ts). A corner's colour is then three
  // floats, or four bytes: the share each part has of the brightest, and half that brightest, of which 254 is one.
  // A colour of three floats has a one as its fourth number by the graphics card's rule, which a colour of bytes
  // never has: so both kinds are told apart here, at the corner, and what lies between the corners is the same for
  // both. (`?small=0`: all lists are floats, and the materials take the corners' colours as they always did.)
  const smallLists = flag('small', true);
  const tone = attribute('color', 'vec4') as unknown as ReturnType<typeof vec4>;
  const toned = () => materialColor.mul(tone.rgb.mul(select(tone.a.lessThan(254.5 / 255), tone.a.mul((2 * 255) / 254), float(1))).toVarying());
  const coloured = () => { const m = new THREE.MeshLambertNodeMaterial({ vertexColors: !smallLists }); if (smallLists) m.colorNode = toned(); return m; };
  const solid = coloured();
  // every mesh is drawn on the dots of the picture whose value lies between its two marks (see `dissolve`); the
  // pattern is interleaved gradient noise, which has no stripes or clumps
  const dots = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189)), marks = userData('dots', 'vec2') as unknown as ReturnType<typeof vec2>;
  solid.maskNode = dots.greaterThanEqual(marks.x).and(dots.lessThan(marks.y));
  // what share of the dots a mesh is drawn on is written beside the picture, for putting the picture together from
  // the two sets of dots (see below): the dots from 0 up to a mark as half the mark, those from a mark up to 1 as a
  // half and half the mark; all of the dots is 0.5
  // (written by the picture's own pass alone, for everything on the stage: the mirror's and the shadows' passes have no such second picture)
  const shareCode = select(marks.x.greaterThan(0), marks.x.mul(0.5).add(0.5), marks.y.mul(0.5));
  /** everything on the stage carries its two marks, all the dots unless it is dissolved */
  const marked = (thing: THREE.Object3D) => thing.traverse((part) => { part.userData.dots ??= new THREE.Vector2(0, 1); part.userData.ink ??= 1; });
  // whether a mesh is ground to the map's paper (1) or stands on the ground (0, see Stage.lay)
  // (a mesh that glides to the shape of the coarser step tells for each face what it ends up as, and is that by the
  // share it has glided: see `gliding`)
  const glided = userData('glide', 'float') as unknown as ReturnType<typeof float>;
  const inkOf = Fn((builder: { geometry: THREE.BufferGeometry }) => {
    const own = userData('ink', 'float') as unknown as ReturnType<typeof float>;
    return builder.geometry.hasAttribute('aim') ? mix(own, (attribute('normal', 'vec4') as unknown as ReturnType<typeof vec4>).w, glided) : own;
  })() as unknown as ReturnType<typeof float>;
  // water: a soft mirror image of piers, hulls and houses is laid over the water colour
  let water = solid;
  const tint = uniform(new THREE.Color());
  let mirrored: ReturnType<typeof reflector> | null = null;
  if (flag('mirror', true)) {
    const mirror = mirrored = reflector({ resolutionScale: 0.5 });
    mirror.target.rotateX(-Math.PI / 2);
    mirror.target.position.y = SEA_Y;
    marked(mirror.target); scene.add(mirror.target);
    water = coloured();
    water.maskNode = solid.maskNode;
    // the mirror image is tinted like the water, so a white sail shows as a pale green shape, not as a light
    water.emissiveNode = hashBlur(mirror, float(LOOK.mirrorBlur), { repeats: float(24) }).rgb.mul(tint);
  }
  // A mesh's rectangles on the grid of blocks come as faces (faces.ts), a row of numbers to each, and their corners
  // are made here: each of the six corners of a face's two triangles knows which of the face's four it is (one way
  // round and the other), and takes its place and its colour from the face's row by that. The numbers of 16 bits
  // reach the shader as shares of 32767 and are whole again before they are used, so a corner lies where the
  // builder put it, to the last bit.
  const lie = attribute('lie', 'vec4') as unknown as ReturnType<typeof vec4>, reach = attribute('reach', 'vec2') as unknown as ReturnType<typeof vec2>;
  const whole = (n: typeof lie.x) => n.mul(32767).add(0.5).floor();
  const kind = whole(lie.x), flipped = kind.greaterThanEqual(FLIPPED), axis = kind.sub(select(flipped, float(FLIPPED), float(0)));
  const corner = select(flipped, positionGeometry.y, positionGeometry.x);
  const level = whole(lie.y).div(FACE_STEPS), alongU = whole(select(corner.greaterThan(0.5).and(corner.lessThan(2.5)), lie.w, lie.z)).div(FACE_STEPS), alongV = whole(select(corner.greaterThan(1.5), reach.y, reach.x)).div(FACE_STEPS);
  const tones = [0, 1, 2, 3].map((k) => attribute(`tone${k}`, 'vec4') as unknown as ReturnType<typeof vec4>);
  const toneOf = select(corner.lessThan(0.5), tones[0], select(corner.lessThan(1.5), tones[1], select(corner.lessThan(2.5), tones[2], tones[3])));
  const faced = new THREE.MeshLambertNodeMaterial();
  faced.positionNode = select(axis.lessThan(0.5), vec3(level, alongU, alongV), select(axis.lessThan(1.5), vec3(alongU, level, alongV), vec3(alongU, alongV, level)));
  // (a face's colours are always bytes: see `toned`)
  faced.colorNode = materialColor.mul(toneOf.rgb.mul(toneOf.a.mul((2 * 255) / 254)).toVarying());
  faced.maskNode = solid.maskNode;
  // Faces that glide to the shape of the next coarser step (worldprobe/glide.ts): each has the level or the span in
  // height it ends up at and the colours of its corners there, and the mesh says how far it has glided (0 … 1,
  // `Stage.glide`). A level face moves to its level there. An upright face's two ends in height move each to its own;
  // where they would pass each other the face has no height, since by then the column it faced stands above its own.
  const aimed = attribute('aim', 'vec2') as unknown as ReturnType<typeof vec2>;
  const rises = kind.greaterThanEqual(RISES), kindG = kind.sub(select(rises, float(RISES), float(0))), flippedG = kindG.greaterThanEqual(FLIPPED), axisG = kindG.sub(select(flippedG, float(FLIPPED), float(0)));
  const cornerG = select(flippedG, positionGeometry.y, positionGeometry.x), upright = axisG.lessThan(0.5).or(axisG.greaterThan(1.5)), alongX = axisG.lessThan(0.5);
  const u0 = whole(lie.z), u1 = whole(lie.w), v0 = whole(reach.x), v1 = whole(reach.y), from0 = select(alongX, u0, v0), from1 = select(alongX, u1, v1);
  const end0 = mix(from0, whole(aimed.x), glided), way = select(rises, float(1), select(from1.lessThan(from0), float(-1), float(1))), end1 = end0.add(way.mul(max(way.mul(mix(from1, whole(aimed.y), glided).sub(end0)), 0)));
  const levelG = select(upright, whole(lie.y), mix(whole(lie.y), whole(aimed.x), glided)).div(FACE_STEPS);
  const second = cornerG.greaterThan(0.5).and(cornerG.lessThan(2.5)), third = cornerG.greaterThan(1.5);
  const alongUG = select(second, select(alongX, end1, u1), select(alongX, end0, u0)).div(FACE_STEPS), alongVG = select(third, select(axisG.greaterThan(1.5), end1, v1), select(axisG.greaterThan(1.5), end0, v0)).div(FACE_STEPS);
  const aims = [0, 1, 2, 3].map((k) => attribute(`aimTone${k}`, 'vec4') as unknown as ReturnType<typeof vec4>);
  const pick = (four: typeof tones) => { const t = select(cornerG.lessThan(0.5), four[0], select(cornerG.lessThan(1.5), four[1], select(cornerG.lessThan(2.5), four[2], four[3]))); return t.rgb.mul(t.a.mul((2 * 255) / 254)); };
  const gliding = new THREE.MeshLambertNodeMaterial();
  gliding.positionNode = select(axisG.lessThan(0.5), vec3(levelG, alongUG, alongVG), select(axisG.lessThan(1.5), vec3(alongUG, levelG, alongVG), vec3(alongUG, alongVG, levelG)));
  gliding.colorNode = materialColor.mul(mix(pick(tones), pick(aims), glided).toVarying());
  gliding.maskNode = solid.maskNode;
  /** which of a face's four corners each of the six is, where its triangles turn one way and where the other */
  const CORNERS = new Float32Array(FACE_CORNERS[0].flatMap((c, k) => [c, FACE_CORNERS[1][k], 0]));
  const faceGeometry = (s: Shape) => {
    const f = s.faces!, g = new THREE.InstancedBufferGeometry();
    // (the six corners are the same for every mesh, but each has a list of its own: a mesh that goes takes its lists with it)
    g.setAttribute('position', new THREE.BufferAttribute(CORNERS, 3));
    const lies = new THREE.InstancedInterleavedBuffer(f.geo, FACE_GEO), colours = new THREE.InstancedInterleavedBuffer(f.col, FACE_COL);
    g.setAttribute('lie', new THREE.InterleavedBufferAttribute(lies, 4, 0, true)); g.setAttribute('reach', new THREE.InterleavedBufferAttribute(lies, 2, 4, true));
    for (let k = 0; k < 4; k++) g.setAttribute(`tone${k}`, new THREE.InterleavedBufferAttribute(colours, 4, k * 4, true));
    g.setAttribute('normal', new THREE.InstancedBufferAttribute(f.nor, 4, true));
    if (f.aim && f.aimCol) {
      const ends = new THREE.InstancedInterleavedBuffer(f.aimCol, FACE_COL);
      g.setAttribute('aim', new THREE.InstancedBufferAttribute(f.aim, 2, true));
      for (let k = 0; k < 4; k++) g.setAttribute(`aimTone${k}`, new THREE.InterleavedBufferAttribute(ends, 4, k * 4, true));
    }
    g.instanceCount = f.geo.length / FACE_GEO;
    if (s.ball) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(s.ball[0], s.ball[1], s.ball[2]), s.ball[3]);
    else g.boundingSphere = new THREE.Box3().setFromArray(unfaced(f).pos).getBoundingSphere(new THREE.Sphere());
    return g;
  };
  const geometry = (s: Shape) => {
    const g = new THREE.BufferGeometry(), list = (a: ArrayLike<number>) => new THREE.BufferAttribute(a instanceof Float32Array ? a : new Float32Array(a), 3);
    g.setAttribute('position', list(s.pos));
    // (bytes, which the graphics card reads as shares of their largest)
    if (s.small) { g.setAttribute('normal', new THREE.BufferAttribute(s.nor as Int8Array, 4, true)); g.setAttribute('color', new THREE.BufferAttribute(s.col as Uint8Array, 4, true)); }
    else { g.setAttribute('normal', list(s.nor)); g.setAttribute('color', list(s.col)); }
    if (s.ball) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(s.ball[0], s.ball[1], s.ball[2]), s.ball[3]); else g.computeBoundingSphere();
    return g;
  };

  // light step 1: sun, side light and sky; strengths are multiplied by π because a Lambert surface returns light / π
  const rad = THREE.MathUtils.degToRad;
  /** a direction on the ground given by its share to the right of the picture and towards its back, raised by `elev` */
  const from = (turn: number, elev: number) => new THREE.Vector3(...towards(turn, elev));
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
  // The figures are not in the water's mirror image: there they are smaller than its blur, and the frame in which
  // the mirror was first drawn stood for 70 to 90 ms building their shader for its pass (Chrome on a Mac, 16 November 2026).
  camera.layers.enable(FIGURES_LAYER);
  mirrored?.reflector.getVirtualCamera(camera).layers.set(0);
  // one figure of each kit stands out of sight below the stage from the start, so that the figures' shaders are
  // built while the world loads and not in the frame in which a piece's figures or the other kit first show
  { const warm = warmFigures(); warm.position.y = -5000; marked(warm); scene.add(warm); }
  const controls = o.fixed ? null : new MapControls(camera, canvas);
  if (controls) { controls.minDistance = 600; controls.maxDistance = 4200; controls.maxPolarAngle = rad(80); }
  let frameW = o.frameW ?? FRAME_W, distance: number = LOOK.distance;
  const lens = () => {
    // frameW ground units across the picture at the middle distance, whatever the window shape
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(frameW / camera.aspect / 2 / distance));
    camera.updateProjectionMatrix();
  };
  /** the ground the picture shows, last laid out by `aim` (see `aimPaper`) */
  let ground = { x: 0, z: 0, wide: 1, elev: 1 };
  const aim = (x: number, z: number, across: number, elevation: number, away = 1) => {
    // the picture's middle lies on the land, above the sea by the look's own height times `away`: as far above it in the world at every size of the stage's blocks
    frameW = across; distance = LOOK.distance * away;
    const elev = rad(elevation), frameD = (frameW * 941) / 1672 / Math.sin(elev), landY = SEA_Y + (LAND_Y - SEA_Y) * away, centre = new THREE.Vector3(x, landY, z);
    const toSun = from(LOOK.sunTurn, LOOK.sunElevation);
    sun.position.copy(centre).addScaledVector(toSun, 420); sun.target.position.copy(centre);
    // the shadow map covers the ground of the picture and what stands on it, seen from the sun
    const sc = sun.shadow.camera, wide = new THREE.Vector3().crossVectors(toSun, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(wide, toSun);
    let halfW = 0, halfH = 0, depth = 0;
    for (const s of [-0.02, 1.02]) for (const t of [-0.02, 1.02]) for (const y of [0, o.tall ?? 36]) {
      const u = (s - 0.5) * frameW, v = (t - 0.5) * frameD, p = new THREE.Vector3(u * RIGHT[0] + v * NEAR[0], y - landY, u * RIGHT[1] + v * NEAR[1]);
      halfW = Math.max(halfW, Math.abs(p.dot(wide))); halfH = Math.max(halfH, Math.abs(p.dot(up))); depth = Math.max(depth, Math.abs(p.dot(toSun)));
    }
    sc.left = -halfW; sc.right = halfW; sc.top = halfH; sc.bottom = -halfH; sc.near = 420 - depth - 10; sc.far = 420 + depth + 10;
    sc.updateProjectionMatrix();
    side.position.copy(centre).addScaledVector(from(0, 0), 100); side.target.position.copy(centre);
    fill.position.copy(centre).addScaledVector(from(RIG.fillTurn, RIG.fillElevation), 100); fill.target.position.copy(centre);
    const reach = (frameD / 2) * Math.cos(elev) + 80 + (o.tall ?? 0);
    camera.near = distance - reach; camera.far = distance + reach;
    camera.position.copy(centre).add(new THREE.Vector3(NEAR[0] * Math.cos(elev), Math.sin(elev), NEAR[1] * Math.cos(elev)).multiplyScalar(distance));
    camera.lookAt(centre);
    ground = { x, z, wide: frameW, elev };
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
  let reached: { value: number } | null = null;
  // beside the picture: which way every point faces, and with it the share of the dots its mesh is drawn on
  // (`?ink=0` leaves the third picture out, for measuring what it costs: then the realms' colour lies on everything alike)
  const inks = flag('ink', true);
  scenePass.setMRT(mrt(inks ? { output, normal: vec4(normalView, shareCode), ink: vec4(inkOf, 0, 0, 1) } : { output, normal: vec4(normalView, shareCode) }));
  const facing = scenePass.getTextureNode('normal'), inked = inks ? scenePass.getTextureNode('ink') : null;
  if (flag('ao', true)) {
    // The creases are worked out and smoothed on every other dot of the picture each way, a quarter of the work
    // (Jimenez et al. 2016 work them out at half resolution too), and laid over the picture by depth. The depths and
    // directions of those dots are copied into smaller pictures of their own first: so each of them is worked out
    // at a point the picture really shows, as dark as at every dot, and from depths that lie closer together in memory.
    // For measuring: ?aoscale=1 (at every dot, as before), ?aosamples=24, ?aosmooth=0 (not smoothed).
    const scale = number('aoscale', 0.5), small = scale < 1, parts: { updateBefore?(frame: unknown): unknown }[] = [];
    /** half a dot of the picture, and the dots of the smaller pictures, each way */
    const half = uniform(new THREE.Vector2()), fewer = uniform(new THREE.Vector2());
    const sized = () => { const dots = renderer.getDrawingBufferSize(new THREE.Vector2()); half.value.set(0.5 / dots.x, 0.5 / dots.y); fewer.value.set(Math.floor(dots.x * scale), Math.floor(dots.y * scale)); };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the pass's own pictures or smaller copies of them
    let depths: any = far, faces: any = facing;
    if (small) {
      // the dot a smaller picture's dot stands for: the one whose middle lies half a dot before its own middle
      const from = uv().sub(half);
      const copy = (of: Parameters<typeof rtt>[0], type: THREE.TextureDataType) => {
        const made = rtt(of, null, null, { resolutionScale: scale, type });
        made.renderTarget!.texture.minFilter = made.renderTarget!.texture.magFilter = THREE.NearestFilter;
        parts.push(made);
        return made;
      };
      depths = copy(vec4(far.sample(from).r, 0, 0, 1), THREE.FloatType); faces = copy(facing.sample(from), THREE.HalfFloatType);
    }
    const creases = ao(depths, faces, camera);
    if (small) { const size = creases.setSize.bind(creases); creases.setSize = (w, h) => size(Math.floor(w * scale), Math.floor(h * scale)); }
    creases.radius.value = LOOK.creaseReach; reached = creases.radius; creases.thickness.value = CREASES.thickness; creases.scale.value = LOOK.creaseDepth; creases.samples.value = number('aosamples', 24);
    // the raw result is speckled; the smoothing keeps to surfaces of like depth and direction
    const raw = creases.getTextureNode(), smoother = denoise(raw, depths, faces, camera);
    // (as far across the picture as at every dot)
    smoother.radius.value *= scale;
    const smooth = flag('aosmooth', true) ? rtt(smoother, null, null, { resolutionScale: scale }) : raw;
    // nothing of this is drawn while the creases do not show (see Stage.creases): from afar the picture has none
    for (const part of [...parts, creases, smooth] as typeof parts) {
      const draw = part.updateBefore?.bind(part);
      if (draw) part.updateBefore = (frame) => { sized(); return creased.value > 0 ? draw(frame) : undefined; };
    }
    let open = smooth.sample(screenUV).r as ReturnType<typeof float>;
    if (small) {
      // a dot of the picture takes the creases of the four dots around it in the smaller picture, each by how near
      // it is and by how near its point lies to the surface the dot shows: so that the darkness under an eave
      // does not spill over the edge of the roof in front of it
      const lensInverse = uniform(camera.projectionMatrixInverse), at = screenUV.add(half).mul(fewer).sub(0.5), corner = at.floor(), part = at.sub(corner);
      const here = getViewPosition(screenUV, far.sample(screenUV).r, lensInverse), faced = facing.sample(screenUV).rgb.normalize();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sums of nodes: every `add` is a node type of its own
      let sum: any = float(0), weight: any = float(0);
      for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const its = corner.add(vec2(i + 0.5, j + 0.5)).div(fewer), there = getViewPosition(its.sub(half), depths.sample(its).r, lensInverse);
        const near = (i ? part.x : part.x.oneMinus()).mul(j ? part.y : part.y.oneMinus()), w = near.mul(max(dot(here.sub(there), faced).abs().div(UPSAMPLE_REACH).oneMinus(), 0)).add(1e-4);
        sum = sum.add(smooth.sample(its).r.mul(w)); weight = weight.add(w);
      }
      open = sum.div(weight);
    }
    // a crease does not turn grey: it keeps a share of bluish light, as the shadows of the reference do
    const deep = new THREE.Color(LOOK.creaseColor);
    picture = colour.mul(mix(vec3(1, 1, 1), mix(vec3(deep.r, deep.g, deep.b), vec3(1, 1, 1), open), creased));
  }
  // things that share the picture's dots (see Stage.dissolve): at every dot the thing drawn there is taken as it is,
  // what it shares the dots with is the mean of the dots around that are drawn on the other set, and the two are
  // mixed by their shares. So both are whole pictures again, as in a resolve of screen-door transparency, and they
  // blend without single dots showing. Where a thing has all the dots, the picture is as it was drawn.
  {
    const whole = convertToTexture(picture);
    /** of a dot: whether it is of the set from a mark up to 1, and the mark */
    const read = (at: Parameters<typeof facing.sample>[0]) => { const code = facing.sample(at).a, upper = step(0.5001, code).mul(step(code, 0.999)); return { upper, mark: mix(code.mul(2).min(1), code.sub(0.5).mul(2), upper) }; };
    const own = read(screenUV), here = whole.sample(screenUV).rgb, mine = mix(own.mark, own.mark.oneMinus(), own.upper);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sums of nodes: every `add` is a node type of its own
    let others: any = vec3(0, 0, 0), found: any = float(0);
    for (const by of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as [number, number][]) {
      const at = screenUV.add(vec2(...by).div(screenSize)), it = read(at);
      // of the other set, and sharing its dots (a thing with all the dots is no one's other half)
      const counts = it.upper.sub(own.upper).abs().mul(max(it.upper, step(it.mark, 0.9999)));
      others = others.add(whole.sample(at).rgb.mul(counts)); found = found.add(counts);
    }
    const other = mix(here, others.div(max(found, 1)), step(0.5, found));
    picture = mix(other, here, mine) as unknown as typeof picture;
  }
  // the map's paper (see Stage.paper): drawn from straight above into a picture of its own, which the picture of the
  // scene then takes its colour from by where each of its points lies on the ground
  const paper = new THREE.Scene(), paperEye = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  const paperPicture = new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const laid = { strength: uniform(0), flat: uniform(1), seaTop: uniform(SEA_Y), things: uniform(1), calm: uniform(0) };
  const paperFrom = uniform(new THREE.Matrix4()), eyeInverse = uniform(camera.projectionMatrixInverse), eyeWorld = uniform(camera.matrixWorld);
  {
    const depth = far.sample(screenUV).r, inView = getViewPosition(screenUV, depth, eyeInverse), there = eyeWorld.mul(vec4(inView, 1));
    const onPaper = paperFrom.mul(there), at = onPaper.xy.mul(vec2(0.5, -0.5)).add(0.5), dots = texture(paperPicture.texture, at);
    // nothing beyond the paper's edges, nor where the picture shows no ground (its depth at the far end)
    const inside = step(0, at.x).mul(step(at.x, 1)).mul(step(0, at.y)).mul(step(at.y, 1)).mul(step(depth, 0.999999));
    // the sea keeps its own look unless the paper is laid flat as a printed map
    const land = max(smoothstep(laid.seaTop.sub(0.05), laid.seaTop.add(0.05), there.y), laid.flat);
    // houses, trees and fields keep more of their own colours under the paper than the ground, until it lies flat as a printed map
    const ink = dots.rgb.div(max(dots.a, 1 / 255)), cover = dots.a.mul(laid.strength).mul(inside).mul(land).mul((inked ? mix(mix(laid.things, 1, inked.sample(screenUV).r), 1, laid.flat) : float(1)));
    // the land's light and shade, as a share of how sunlit level ground is drawn, colours the ink with it
    // (softened: the light and shade of the relief should show, the colours of woods and fields much less)
    const light = clamp(dot(picture.rgb, vec3(0.2126, 0.7152, 0.0722)).div(LIT_GROUND).pow(0.5), 0.45, 1.25);
    picture = mix(picture, mix(ink.mul(mix(light, light.mul(CALM_KEPT).add(1 - CALM_KEPT), laid.calm)), ink, laid.flat), cover);
  }
  // miniature blur: sharp around the middle distance, softer towards the far and the near edge
  pipeline.outputNode = flag('blur', false) ? dof(picture, scenePass.getViewZNode(), LOOK.distance, LOOK.focusRange, LOOK.blur) : picture;
  /** points the paper's eye straight down at the ground of the picture, with one of its dots to about one of the picture's */
  const aimPaper = () => {
    const { x, z, wide, elev } = ground, size = new THREE.Vector2(), deep = wide / camera.aspect / Math.sin(elev);
    renderer.getDrawingBufferSize(size);
    // what stands tall is seen beyond the ground's edges at the far side of a slanted picture
    // (the far side of the picture is wider than its middle by as much as it lies farther from the camera)
    const halfW = wide * 0.56 * (1 + ((deep / 2) * Math.cos(elev)) / distance), halfD = deep * 0.54 + (o.tall ?? 36) / Math.tan(elev);
    paperEye.left = -halfW; paperEye.right = halfW; paperEye.top = halfD; paperEye.bottom = -halfD; paperEye.updateProjectionMatrix();
    paperEye.position.set(x, 2000, z); paperEye.up.set(-NEAR[0], 0, -NEAR[1]); paperEye.lookAt(x, 0, z); paperEye.updateMatrixWorld();
    const across = Math.min(4096, Math.max(256, size.x)), down = Math.min(4096, Math.max(256, Math.round((across * halfD) / halfW)));
    if (paperPicture.width !== across || paperPicture.height !== down) paperPicture.setSize(across, down);
    paperFrom.value.multiplyMatrices(paperEye.projectionMatrix, paperEye.matrixWorldInverse);
  };

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
    made.castShadow = casts; made.receiveShadow = true; made.userData.dots = new THREE.Vector2(0, 1); made.userData.ink = 1;
    return made;
  };
  /** The faces of a shape as a mesh: one drawing of the six corners for every face. */
  const faceMesh = (shape: Shape, casts: boolean) => {
    const f = shape.faces!, made = new THREE.Mesh(faceGeometry(shape), f.aim && f.aimCol ? gliding : faced);
    made.castShadow = casts; made.receiveShadow = true; made.userData.dots = new THREE.Vector2(0, 1); made.userData.ink = 1; made.userData.glide = 0;
    // (a ray finds the faces by their rows: the mesh's own corners are not where they are drawn)
    made.raycast = (ray, hits) => {
      const own = ray.ray.clone().applyMatrix4(new THREE.Matrix4().copy(made.matrixWorld).invert()), t = faceHit(f, own.origin.toArray(), own.direction.toArray());
      if (t === null) return;
      const point = own.at(t, new THREE.Vector3()).applyMatrix4(made.matrixWorld), distance = ray.ray.origin.distanceTo(point);
      if (distance >= ray.near && distance <= ray.far) hits.push({ distance, point, object: made });
    };
    return made;
  };
  // The renderer keeps a record of every mesh it has drawn, and each record hangs on the material, which all pieces
  // share and which is never let go: only the mesh's own 'dispose' takes the record, and with it the mesh and its
  // numbers, out of the renderer. Letting go of the geometry alone leaves them held for good.
  const gone = (made: THREE.Mesh) => { warm(made); made.dispatchEvent({ type: 'dispose' } as never); made.geometry.dispose(); };
  // A mesh's lists go to the graphics card in the picture that first draws it, and that takes the page's thread a
  // millisecond or two for every megabyte and more for every list (measured on a Mac: the 49 meshes of one piece
  // of a town 77 ms; 27 meshes that came into the picture together, one picture of 247 ms). So the lists are sent
  // before their mesh is shown, a few to a picture: by stand-ins that share them, are drawn on none of the picture's
  // dots and are not left out for lying outside the picture. While the view moves a picture takes SEND_MOVING bytes,
  // which it can without a jolt; while it rests, where a longer picture does not show, SEND_RESTING. A machine whose
  // pictures take SLOW ms and more each sends as much as would have gone in that time. A picture of fixed size is a
  // tool's still, drawn once when the scene is whole: there the lists go as they are drawn.
  // All this only with `?send=1` (see Stage.staged for what it measured).
  const staged = flag('send', false);
  const SEND_MOVING = 4e6, SEND_RESTING = 16e6, SEND_LEAST = 0.25e6, SLOW = 250, RESTS_AFTER = 300;
  /** the meshes whose lists are still to be sent, in the order they were made; the stand-ins of this picture, and whose they are */
  const cold = new Set<THREE.Mesh>(), standIns = new THREE.Group();
  /** the bytes of their lists in all, and what the last picture that sent some could take */
  let sending: THREE.Mesh[] = [], sentAt = 0, movedAt = 0, waiting = 0, share = SEND_RESTING;
  const eye = new Float64Array(32);
  scene.add(standIns);
  // (one mesh of their kind is always there, on none of the dots: so what the renderer makes for the kind is made
  // in the first picture, and is not let go and made again between the stand-ins of two pictures)
  if (staged) {
    const pilot = mesh({ pos: [0, 0, 0, 0, 0, 1, 1, 0, 0], nor: [0, 1, 0, 0, 1, 0, 0, 1, 0], col: [0, 0, 0, 0, 0, 0, 0, 0, 0] }, solid, false);
    (pilot.userData.dots as THREE.Vector2).set(0, 0); pilot.frustumCulled = false; pilot.layers.set(FIGURES_LAYER);
    scene.add(pilot);
  }
  // (and one of small lists, whose pipeline is another)
  if (staged && smallLists) {
    const pilotSmall = mesh({ pos: new Float32Array(9), nor: new Int8Array(12), col: new Uint8Array(12), small: true }, solid, false);
    (pilotSmall.userData.dots as THREE.Vector2).set(0, 0); pilotSmall.frustumCulled = false; pilotSmall.layers.set(FIGURES_LAYER);
    scene.add(pilotSmall);
  }
  const weight = (g: THREE.BufferGeometry) => { const lists = new Set<Float32Array>(); for (const name in g.attributes) lists.add(g.attributes[name].array as Float32Array); let bytes = 0; for (const list of lists) bytes += list.byteLength; return Math.max(SEND_LEAST, bytes); };
  const cool = <M extends THREE.Mesh>(made: M): M => { if (staged && !fixedW) { cold.add(made); waiting += weight(made.geometry); } return made; };
  const warm = (made: THREE.Mesh) => { if (cold.delete(made)) waiting -= weight(made.geometry); };
  /** Puts the stand-ins of the next meshes into the picture about to be drawn. */
  const send = () => {
    const now = performance.now();
    // (the view moves while the camera's place or lens changes, and for a moment after: a zoom comes in ticks)
    const lens = [...camera.matrixWorld.elements, ...camera.projectionMatrix.elements];
    if (lens.some((v, k) => v !== eye[k])) { eye.set(lens); movedAt = now; }
    // (the time since the last picture counts only from one sending picture to the next, not across a rest)
    const since = sentAt ? now - sentAt : 0;
    let room = (share = (now - movedAt < RESTS_AFTER ? SEND_MOVING : SEND_RESTING) * (since > SLOW ? since / (1000 / 60) : 1));
    for (const made of cold) {
      const bytes = weight(made.geometry);
      if (sending.length && bytes > room) break;
      const standIn = new THREE.Mesh(made.geometry, made.material === faced || made.material === gliding ? made.material : solid);
      // (all that the material reads of a mesh, as its own mesh has it)
      standIn.userData = { ...made.userData, ground: false, dots: new THREE.Vector2(0, 0) };
      // (it lies on the layer the water's mirror does not draw, and casts no shadow: one pass sends the lists)
      standIn.frustumCulled = false; standIn.receiveShadow = true; standIn.layers.set(FIGURES_LAYER);
      standIns.add(standIn); sending.push(made); room -= bytes;
    }
    sentAt = sending.length ? now : 0;
  };
  /** After the picture: its stand-ins have done their work. */
  const haveSent = () => {
    for (const standIn of [...standIns.children]) { standIns.remove(standIn); standIn.dispatchEvent({ type: 'dispose' } as never); }
    for (const made of sending) warm(made);
    sending = [];
  };
  /** A shape as meshes of no more than 4 MB of lists each, the share of one picture while the view moves; they share its lists. */
  const parts = (shape: Shape): Shape[] => {
    const { pos, nor, col } = shape, n = pos.length / 9, per = shape.small ? 12 : 9;
    if (!staged || !ArrayBuffer.isView(pos) || !ArrayBuffer.isView(nor) || !ArrayBuffer.isView(col)) return [shape];
    const most = Math.floor(SEND_MOVING / ((pos.byteLength + nor.byteLength + col.byteLength) / Math.max(1, n)));
    if (n <= most) return [shape];
    const list: Shape[] = [], cut = <T extends ArrayLike<number>>(a: T, from: number, to: number) => (a as unknown as Float32Array).subarray(from, to) as unknown as T;
    // (each keeps the ball of the whole: it is left out of a picture only where the whole would be)
    for (let from = 0; from < n; from += most) { const to = Math.min(n, from + most); list.push({ ...shape, pos: cut(pos, from * 9, to * 9), nor: cut(nor, from * per, to * per), col: cut(col, from * per, to * per) }); }
    return list;
  };
  const stage: Stage = {
    canvas, aim, soften, busy: true, staged,
    probe: { ready: false, counts: {}, backend: flag('webgl', false) ? 'webgl2' : 'webgpu' },
    add(built, x = 0, z = 0) {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      for (const [shape, material, casts] of [[built.ground, solid, true], [built.carried, solid, true], [built.things, solid, true], [built.water, water, false], [built.raised, solid, false]] as const) {
        if (!shape) continue;
        for (const part of [...(shape.faces?.geo.length ? [cool(faceMesh(shape, casts))] : []), ...(shape.pos.length ? parts(shape).map((some) => cool(mesh(some, material, casts))) : [])]) {
          part.userData.ground = shape === built.ground || shape === built.carried;
          if (shape === built.things || shape === built.carried) part.userData.ink = 0;
          group.add(part);
        }
      }
      if (built.figures?.count) { const f = figureMeshes(built.figures); f.near.layers.set(FIGURES_LAYER); f.far.layers.set(FIGURES_LAYER); group.add(f.near, f.far); marked(group); showFigures(frameW); }
      scene.add(group);
      pending = Math.max(pending, 3);
      return group;
    },
    remove(group) {
      scene.remove(group);
      // the figures' kit is shared by every piece: only their own mesh is let go (figures/stage.ts)
      for (const mesh of group.children) if (mesh.userData.figures === 'near') (mesh as THREE.InstancedMesh).dispose(); else if (!mesh.userData.figures) gone(mesh as THREE.Mesh);
      pending = Math.max(pending, 1);
    },
    more(group, things) { const part = cool(mesh(things, solid, true)); part.userData.ink = 0; group.add(part); pending = Math.max(pending, 3); return part; },
    drop(part) { part.removeFromParent(); gone(part); pending = Math.max(pending, 1); },
    sent(thing) { return (thing as THREE.Mesh).isMesh ? !cold.has(thing as THREE.Mesh) : !thing.children.some((part) => cold.has(part as THREE.Mesh)); },
    room() { return waiting < share; },
    dissolve(thing, from, until) {
      // the figures are too small to dissolve dot by dot: they come and go one by one instead, and are all gone
      // well before the other layer has taken a third of the dots, so that it is not seen through them
      const kept = Math.max(0, Math.min(1, until) * (1 - from / FIGURES_GONE));
      for (const part of (thing as THREE.Mesh).isMesh ? [thing] : thing.children) {
        if (part.userData.figures) keepFigures(part, kept);
        else (part.userData.dots as THREE.Vector2).set(from, until);
      }
      pending = Math.max(pending, 1);
    },
    whole(group, on) { for (const part of group.children) if (!part.userData.figures) part.frustumCulled = !on; pending = Math.max(pending, 1); },
    glide(group, share) { for (const part of group.children) if (part.userData.glide !== undefined && part.userData.glide !== share) { part.userData.glide = share; pending = Math.max(pending, 1); } },
    pictures: () => pictures,
    put(thing) { marked(thing); scene.add(thing); pending = Math.max(pending, 1); },
    take(thing) { scene.remove(thing); pending = Math.max(pending, 1); },
    paper,
    lay(strength, flat, seaTop, things = 1, calm = 0) {
      if (laid.strength.value === strength && laid.flat.value === flat && laid.seaTop.value === seaTop && laid.things.value === things && laid.calm.value === calm) return;
      laid.strength.value = strength; laid.flat.value = flat; laid.seaTop.value = seaTop; laid.things.value = things; laid.calm.value = calm; pending = Math.max(pending, 1);
    },
    creases(share, reach = 1) {
      if (creased.value !== share) { creased.value = share; pending = Math.max(pending, 1); }
      if (reached && reached.value !== LOOK.creaseReach * reach) { reached.value = LOOK.creaseReach * reach; pending = Math.max(pending, 1); }
    },
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
  /**
   * What a picture took, for the tools: the page's own time to hand it over (`draw ms`), and the graphics card's time
   * for it, in all (`gpu ms`) and pass by pass in the order they are drawn (`gpu pass 0` …); each also summed over
   * the pictures (`… sum`, with `gpu pictures` and `draw pictures`), so that a tool can take means between two reads.
   */
  const clock = (draw: number) => {
    const c = stage.probe.counts, add = (name: string, v: number) => { c[name] = v; c[`${name} sum`] = (c[`${name} sum`] ?? 0) + v; };
    add('draw ms', draw); c['draw pictures'] = (c['draw pictures'] ?? 0) + 1;
    void renderer.resolveTimestampsAsync('render').then((all) => {
      const pool = (renderer.backend as unknown as { timestampQueryPool?: { render?: { timestamps: Map<string, number>; frames: number[] } } }).timestampQueryPool?.render;
      if (all === undefined || !pool) return;
      add('gpu ms', all); c['gpu pictures'] = (c['gpu pictures'] ?? 0) + 1;
      // the passes of the last picture that was measured, as they followed each other
      const last = `:f${pool.frames[pool.frames.length - 1]}`;
      let k = 0;
      for (const [uid, ms] of pool.timestamps) if (uid.endsWith(last)) add(`gpu pass ${k++}`, ms);
      c['gpu passes'] = k;
    });
  };
  let drawn = 0, since = performance.now(), pictures = 0;
  renderer.setAnimationLoop(() => {
    // a picture of fixed size is taken by a tool, which waits for the finished scene: nothing is drawn before
    // walking figures keep the picture moving; a picture of fixed size is a still, so that a tool's picture comes
    if (!fixedW && (anyFigures() || cold.size)) pending = Math.max(pending, 1);
    if (pending <= 0 || (fixedW && stage.busy)) return;
    if (cold.size) send(); else sentAt = 0;
    if (laid.strength.value > 0) { aimPaper(); renderer.setRenderTarget(paperPicture); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(paper, paperEye); renderer.setRenderTarget(null); }
    const began = timed ? performance.now() : 0, had = renderer.info.memory.attributesSize;
    pipeline.render();
    if (sending.length) haveSent();
    drawn++; pictures++;
    // what the picture sent to the graphics card in lists (a tool sets `MB sent most` to 0 and reads the most a picture has sent since)
    { const c = stage.probe.counts, sent = (renderer.info.memory.attributesSize - had) / 1e6; c.pictures = pictures; c['MB sent'] = sent; c['MB sent sum'] = (c['MB sent sum'] ?? 0) + sent; c['MB sent most'] = Math.max(c['MB sent most'] ?? 0, sent); if (sent > 0) c['pictures sending'] = (c['pictures sending'] ?? 0) + 1; }
    if (timed) clock(performance.now() - began);
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
