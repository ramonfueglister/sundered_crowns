// The stage's lights (light step 1): sun, side light, the light thrown back by the sunlit ground, and sky. Their
// strengths are mixed between the page's own light and the near view's by a share (`soften`), and they are laid out
// around the ground the picture shows (`place`, from Stage.aim).
import * as THREE from 'three/webgpu';
import { NEAR, RIGHT } from '../layout';
import { RIG, towards } from '../light';
import type { StageOptions } from './api';
import { KeptShadow } from './kept_shadow';
import { FAR_SHADOW, LOOK, NEAR_LIGHT, NEAR_SHADOW } from './look';
import type { Materials } from './materials';

/** a direction on the ground given by its share to the right of the picture and towards its back, raised by `elev` */
const from = (turn: number, elev: number) => new THREE.Vector3(...towards(turn, elev));

/** Puts the lights on the stage; `redraw` is told whenever they change. */
export function createRig(
  scene: THREE.Scene,
  o: StageOptions,
  m: Pick<Materials, 'tint' | 'water' | 'solid' | 'seaFaced' | 'lake' | 'lakeSinking' | 'lakeFreed'>,
  redraw: () => void,
) {
  const { tint, water, solid, seaFaced, lake, lakeSinking, lakeFreed } = m;
  // strengths are multiplied by π because a Lambert surface returns light / π
  const L = { ...LOOK, ...o.light };
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  const shade = new KeptShadow(sun);
  const side = new THREE.DirectionalLight(L.sideColor),
    sky = new THREE.HemisphereLight();
  // light thrown back by the sunlit ground and walls: it lifts the walls that face the viewer's left, as in the reference
  const fill = new THREE.DirectionalLight(L.fillColor);
  scene.add(sun, sun.target, side, side.target, fill, fill.target, sky);
  let softened = -1;
  /** the page's own light, mixed towards the near view's by a share */
  const soften = (share: number) => {
    if (share === softened) return;
    softened = share;
    const at = (k: 'sun' | 'side' | 'sky' | 'bounce' | 'fill' | 'mirror') => L[k] + (NEAR_LIGHT[k] - L[k]) * share;
    const colour = (k: 'sunColor' | 'skyColor' | 'mirrorTint') =>
      new THREE.Color(L[k]).lerp(new THREE.Color(NEAR_LIGHT[k]), share);
    sun.color.copy(colour('sunColor'));
    sun.intensity = at('sun') * Math.PI;
    sun.shadow.radius = (o.shadowRadius ?? FAR_SHADOW) + (NEAR_SHADOW - (o.shadowRadius ?? FAR_SHADOW)) * share;
    side.intensity = at('side') * Math.PI;
    fill.intensity = at('fill') * Math.PI;
    sky.color.copy(colour('skyColor'));
    sky.groundColor.set(L.bounceColor).multiplyScalar(at('bounce') / at('sky'));
    sky.intensity = at('sky') * Math.PI;
    // the mirror image is laid over what the water keeps of its own colour
    tint.value.copy(colour('mirrorTint')).multiplyScalar(at('mirror'));
    if (water !== solid) {
      water.color.setRGB(1 - tint.value.r, 1 - tint.value.g, 1 - tint.value.b);
      seaFaced.color.copy(water.color);
      // (water above the sea, where it has materials of its own: materials.ts)
      if (lake !== solid) for (const above of [lake, lakeSinking, lakeFreed]) above.color.copy(water.color);
    }
    redraw();
  };
  /** the lights around `centre`, the middle of the picture's ground: `frameW` across, `frameD` deep, at height `landY` */
  const place = (centre: THREE.Vector3, frameW: number, frameD: number, landY: number) => {
    const toSun = from(LOOK.sunTurn, LOOK.sunElevation);
    sun.position.copy(centre).addScaledVector(toSun, 420);
    sun.target.position.copy(centre);
    // the shadow map covers the ground of the picture and what stands on it, seen from the sun
    const sc = sun.shadow.camera,
      wide = new THREE.Vector3().crossVectors(toSun, new THREE.Vector3(0, 1, 0)).normalize(),
      up = new THREE.Vector3().crossVectors(wide, toSun);
    let halfW = 0,
      halfH = 0,
      depth = 0;
    for (const s of [-0.02, 1.02])
      for (const t of [-0.02, 1.02])
        for (const y of [0, o.tall ?? 36]) {
          const u = (s - 0.5) * frameW,
            v = (t - 0.5) * frameD,
            p = new THREE.Vector3(u * RIGHT[0] + v * NEAR[0], y - landY, u * RIGHT[1] + v * NEAR[1]);
          halfW = Math.max(halfW, Math.abs(p.dot(wide)));
          halfH = Math.max(halfH, Math.abs(p.dot(up)));
          depth = Math.max(depth, Math.abs(p.dot(toSun)));
        }
    sc.left = -halfW;
    sc.right = halfW;
    sc.top = halfH;
    sc.bottom = -halfH;
    sc.near = 420 - depth - 10;
    sc.far = 420 + depth + 10;
    sc.updateProjectionMatrix();
    side.position.copy(centre).addScaledVector(from(0, 0), 100);
    side.target.position.copy(centre);
    fill.position.copy(centre).addScaledVector(from(RIG.fillTurn, RIG.fillElevation), 100);
    fill.target.position.copy(centre);
  };
  /**
   * Before each picture: the sun's shadow map is drawn anew, and with it the part that stands still if `full`, that
   * is when something other than the walking figures asks for the picture (see KeptShadow).
   */
  const shadows = (full: boolean) => {
    shade.full ||= full;
    sun.shadow.needsUpdate = true;
  };
  return { soften, place, shadows };
}
