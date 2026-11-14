// Look probe: one fixed scene, rendered with the camera of Ramon's reference image, to be judged side by side with it.
// Address options: ?webgl=1 (WebGL 2 instead of WebGPU), ?w=1672&h=941 (fixed picture size), ?blur=1 (miniature blur,
// which the reference does not have), ?shadows=0, ?mirror=0 (no mirror image on the water), ?sky=0 (without the baked sky share: light step 1 only).
import * as THREE from 'three/webgpu';
import { float, pass, reflector } from 'three/tsl';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { hashBlur } from 'three/addons/tsl/display/hashBlur.js';
import { FRAME_D, FRAME_W, LAND_Y, N, NEAR, RIGHT, SEA_Y, VIEW, toXZ } from './layout';
import { buildScene } from './scene';
import { OPEN_WATER } from './terrain';

const q = new URLSearchParams(location.search);
const flag = (k: string, fallback: boolean) => (q.has(k) ? q.get(k) !== '0' : fallback);

/**
 * The look in numbers. Light strengths are shares of the brightness of sunlit level ground (= 1), in linear light.
 * Measured on the reference: a cast shadow keeps about a third of the light, a wall turned away from the sun about a
 * quarter of a sunlit wall, and shadows are short. One sun cannot give all three, so the rig has a high sun that casts the
 * shadows and a level side light without shadows that brightens the walls facing right.
 */
const LOOK = {
  distance: 3000,
  sun: 0.82, sunElevation: 55, sunTurn: 12, sunColor: 0xfff0d8,
  side: 0.7, sideColor: 0xffe6c8,
  sky: 0.36, skyColor: 0xcfe0ff, bounce: 0.12, bounceColor: 0xffe2c0,
  mirror: 0.32, mirrorBlur: 0.006,
  focusRange: 150, blur: 2.6,
};

async function start() {
  const canvas = document.querySelector('canvas')!;
  const fixedW = Number(q.get('w')) || 0, fixedH = Number(q.get('h')) || 0;
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: flag('webgl', false) });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = flag('shadows', true);
  renderer.shadowMap.type = THREE.PCFShadowMap;
  await renderer.init();

  const built = buildScene(flag('sky', true));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(...OPEN_WATER);
  const solid = new THREE.MeshLambertNodeMaterial({ vertexColors: true });
  // water: a soft mirror image of piers, hulls and houses is laid over the water colour
  let water = solid;
  if (flag('mirror', true)) {
    const mirror = reflector({ resolutionScale: 0.5 });
    mirror.target.rotateX(-Math.PI / 2);
    mirror.target.position.y = SEA_Y;
    scene.add(mirror.target);
    water = new THREE.MeshLambertNodeMaterial({ vertexColors: true });
    water.color.setScalar(1 - LOOK.mirror);
    water.emissiveNode = hashBlur(mirror, float(LOOK.mirrorBlur), { repeats: float(24) }).rgb.mul(LOOK.mirror);
  }
  for (const [batch, material, casts] of [[built.ground, solid, true], [built.things, solid, true], [built.water, water, false]] as const) {
    const mesh = new THREE.Mesh(batch.toGeometry(), material);
    mesh.castShadow = casts; mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // light step 1: sun, side light and sky; strengths are multiplied by π because a Lambert surface returns light / π
  const centre = new THREE.Vector3(N / 2, LAND_Y, N / 2), rad = THREE.MathUtils.degToRad;
  /** a direction on the ground given by its share to the right of the picture and towards its back, raised by `elev` */
  const from = (turn: number, elev: number) => {
    const right = Math.cos(rad(turn)) * Math.cos(rad(elev)), back = Math.sin(rad(turn)) * Math.cos(rad(elev));
    return new THREE.Vector3(RIGHT[0] * right - NEAR[0] * back, Math.sin(rad(elev)), RIGHT[1] * right - NEAR[1] * back);
  };
  const sun = new THREE.DirectionalLight(LOOK.sunColor, LOOK.sun * Math.PI);
  sun.position.copy(centre).addScaledVector(from(LOOK.sunTurn, LOOK.sunElevation), 420);
  sun.target.position.copy(centre);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  // the shadow map covers the ground of the picture and what stands on it, seen from the sun
  const sc = sun.shadow.camera, toSun = from(LOOK.sunTurn, LOOK.sunElevation);
  const across = new THREE.Vector3().crossVectors(toSun, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(across, toSun);
  let halfW = 0, halfH = 0, depth = 0;
  for (const s of [-0.02, 1.02]) for (const t of [-0.02, 1.02]) for (const y of [0, 36]) {
    const [x, z] = toXZ(s, t), p = new THREE.Vector3(x, y, z).sub(centre);
    halfW = Math.max(halfW, Math.abs(p.dot(across))); halfH = Math.max(halfH, Math.abs(p.dot(up))); depth = Math.max(depth, Math.abs(p.dot(toSun)));
  }
  sc.left = -halfW; sc.right = halfW; sc.top = halfH; sc.bottom = -halfH; sc.near = 420 - depth - 10; sc.far = 420 + depth + 10;
  sun.shadow.radius = 5; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  const side = new THREE.DirectionalLight(LOOK.sideColor, LOOK.side * Math.PI);
  side.position.copy(centre).addScaledVector(from(0, 0), 100);
  side.target.position.copy(centre);
  const sky = new THREE.HemisphereLight(LOOK.skyColor, new THREE.Color(LOOK.bounceColor).multiplyScalar(LOOK.bounce / LOOK.sky), LOOK.sky * Math.PI);
  scene.add(sun, sun.target, side, side.target, sky);

  // the camera: far away with a long lens, so that the whole picture has one scale (the "parallel" look of the reference)
  const elev = rad(VIEW.elevation), reach = (FRAME_D / 2) * Math.cos(elev) + 80;
  const camera = new THREE.PerspectiveCamera(6.5, 1672 / 941, LOOK.distance - reach, LOOK.distance + reach);
  camera.position.copy(centre).add(new THREE.Vector3(NEAR[0] * Math.cos(elev), Math.sin(elev), NEAR[1] * Math.cos(elev)).multiplyScalar(LOOK.distance));
  camera.lookAt(centre);
  const controls = new MapControls(camera, canvas);
  controls.target.copy(centre);
  controls.minDistance = 600; controls.maxDistance = 4200; controls.maxPolarAngle = rad(80);
  controls.update();

  const pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  // miniature blur: sharp around the middle distance, softer towards the far and the near edge
  pipeline.outputNode = flag('blur', false) ? dof(scenePass.getTextureNode(), scenePass.getViewZNode(), LOOK.distance, LOOK.focusRange, LOOK.blur) : scenePass.getTextureNode();

  let pending = 3;
  const resize = () => {
    const w = fixedW || innerWidth, h = fixedH || innerHeight;
    renderer.setPixelRatio(fixedW ? 1 : Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, true);
    camera.aspect = w / h;
    // FRAME_W ground units across the picture at the middle distance, whatever the window shape
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(FRAME_W / camera.aspect / 2 / LOOK.distance));
    camera.updateProjectionMatrix();
    pending = Math.max(pending, 1);
  };
  addEventListener('resize', resize);
  controls.addEventListener('change', () => { pending = Math.max(pending, 1); });
  resize();

  const probe = { ready: false, counts: built.counts, backend: flag('webgl', false) ? 'webgl2' : 'webgpu' };
  (window as unknown as { __probe: typeof probe }).__probe = probe;
  renderer.setAnimationLoop(() => {
    if (pending <= 0) return;
    pipeline.render();
    if (--pending === 0) probe.ready = true;
  });
}

start().catch((e: unknown) => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:auto 0 0 0;margin:0;padding:12px;background:#400;color:#fff">${String(e)}</pre>`);
  throw e;
});
