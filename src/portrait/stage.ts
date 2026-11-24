// The stage of the portraits: a small three.js world of its own in which one portrait at a time is lit, framed and
// drawn, as Apoleia did it in Godot (app/scripts/ui/portrait_cache.gd): a warm key light with shadows from the upper
// left, a cool rim light from behind on the right, a weak warm fill, sky above and earth below; the head turned a
// little to the left; the head from chin to crown filling about half the height.
//
// Godot's numbers in three.js terms: a directional light of energy e is one of intensity e·π (three.js divides the
// diffuse reflection by π, Godot does not); the sky's ambient light of energy 0.75 is a hemisphere light of 0.75·π;
// Godot's ACES setting there (exposure 0.92 / 0.6 / 1.8, white 14.26) is three.js' ACES at exposure 0.92, which is
// where Apoleia took it from. Those are Apoleia's values; a set of dress of the game's own may bring others
// (profile.ts, profile_1356.ts).
import {
  ACESFilmicToneMapping, DirectionalLight, Group, HalfFloatType, HemisphereLight, LinearFilter, LinearMipmapLinearFilter, Mesh, NoColorSpace,
  PCFShadowMap, PerspectiveCamera, RepeatWrapping, Scene, SRGBColorSpace, type Texture, TextureLoader, Vector2, Vector3, WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { Finish } from './finish';
import { surfaceGeometry } from './mesh';
import { drawOrder, normalMapOf, portraitSkinTone, surfaceKind, surfaceMaterials } from './materials';
import { APOLEIA, profileOf, type StageProfile } from './profile';
import type { Portrait } from './wire';

/** Width and height of a portrait in the game at scale 1 (Apoleia's 4:5), and of the picture drawn for it. */
export const PORTRAIT_SIZE = { width: 112, height: 140 } as const;
/** Vertical field of view of the camera in degrees. */
const FOV = 22;

/** Where the lights stand that a key light with a size is drawn as (profile.ts `shadow`): `n` places spread evenly
 *  over the disc under which the light is seen from the head, `spread` degrees to either side of `from`, each as
 *  far from the head as `from`; their mean direction is `from`'s. One light, or no size: `from` itself. */
export function keyPlaces(from: readonly [number, number, number], spread: number, n: number): [number, number, number][] {
  if (n <= 1 || spread <= 0) return [[from[0], from[1], from[2]]];
  const d = new Vector3(...from), far = d.length();
  d.normalize();
  const u = new Vector3(0, 1, 0).cross(d).normalize(), v = d.clone().cross(u), r = Math.tan(spread * Math.PI / 180);
  // a sunflower's seeds: equal shares of the disc's area (Vogel 1979); moved so that their centre is the disc's
  const seeds = Array.from({ length: n }, (_, i) => { const q = Math.sqrt((i + 0.5) / n), a = i * Math.PI * (3 - Math.sqrt(5)); return [q * Math.cos(a), q * Math.sin(a)] as const; });
  const mid = [0, 1].map(k => seeds.reduce((t, p) => t + p[k]!, 0) / n) as [number, number];
  return seeds.map(([x, y]) => d.clone().addScaledVector(u, r * (x - mid[0])).addScaledVector(v, r * (y - mid[1])).normalize().multiplyScalar(far).toArray());
}

/** Where the camera stands for a portrait and what it looks at (the portrait's own coordinates, before the person
 *  is turned by the profile's `turn` about the upright axis through `at`), and the height of what the picture
 *  shows there. The head from the chin to above the crown (or hat) fills `fill` of the height, the eyes a little
 *  above the middle. */
export function framing(p: Pick<Portrait, 'top' | 'chin' | 'cx' | 'cz' | 'fill'>, profile: StageProfile): { at: [number, number, number]; camera: [number, number, number]; height: number } {
  const h = Math.max(0.8, p.top - p.chin), hv = h / (p.fill * profile.close);
  const cy = p.top - 0.36 * hv, dist = (hv * 0.5) / Math.tan((FOV / 2) * Math.PI / 180);
  return { at: [p.cx, cy, p.cz], camera: [p.cx, cy + profile.rise * hv, p.cz + dist], height: hv };
}

/** How a portrait stands on the stage: turned about the upright axis through the head's centre by the profile's
 *  turn and the person's own (`Portrait.head`), and before that tilted about the axis from back to front through
 *  the neck's foot (`Portrait.neck`). `at`: where the portrait's origin then lies, seen from the head's centre
 *  before the turn. `place` says where a point of the portrait stands (the camera's world). */
export function standing(p: Pick<Portrait, 'cx' | 'cz' | 'head' | 'neck'>, profile: StageProfile): { turn: number; tilt: number; at: [number, number, number]; place(q: readonly number[], point?: boolean): [number, number, number] } {
  const [turn, tilt] = [profile.turn + p.head[0], p.head[1]], [c, s] = [Math.cos(tilt), Math.sin(tilt)], [nx, ny] = p.neck;
  // about the neck's foot n: R (q - n) + n, as a turn about the origin and a shift
  const at: [number, number, number] = [nx - (nx * c - ny * s) - p.cx, ny - (nx * s + ny * c), -p.cz];
  const [ct, st] = [Math.cos(turn), Math.sin(turn)];
  return {
    turn, tilt, at,
    place(q, point = true) {
      const k = point ? 1 : 0, [x, y, z] = [q[0]! * c - q[1]! * s + k * at[0], q[0]! * s + q[1]! * c + k * at[1], q[2]! + k * at[2]];
      return [x * ct + z * st + k * p.cx, y, -x * st + z * ct + k * p.cz];
    },
  };
}

export interface StageOptions {
  /** Pixels of the picture; default twice the size in the game, for clean edges. */
  width?: number; height?: number;
  /** The paths of the images there are, and the address of each (assets.ts). */
  images: Set<string>;
  url(path: string): string;
  canvas?: HTMLCanvasElement | OffscreenCanvas;
}

export class PortraitStage {
  readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly pivot = new Group();
  private readonly lights: Record<keyof StageProfile['lights'], DirectionalLight>;
  /** The further lights of a key light that has a size (profile.ts `shadow.lights`), made when first asked for. */
  private readonly keys: DirectionalLight[] = [];
  private readonly sky = new HemisphereLight();
  private readonly textures = new Map<string, Promise<Texture | null>>();
  private readonly loader = new TextureLoader();
  /** The picture in linear light before it is finished (profile.ts `finish`), and what finishes it. */
  private target: WebGLRenderTarget | null = null;
  private finish: Finish | null = null;

  constructor(private readonly options: StageOptions) {
    const width = options.width ?? 2 * PORTRAIT_SIZE.width, height = options.height ?? 2 * PORTRAIT_SIZE.height;
    this.renderer = new WebGLRenderer({ canvas: options.canvas, antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.camera = new PerspectiveCamera(FOV, width / height, 0.1, 100);
    this.scene.add(this.sky);
    this.lights = { key: this.lamp(), rim: this.lamp(), fill: this.lamp(), bounce: this.lamp() };
    this.light(APOLEIA);
    this.lights.key.castShadow = true;
    this.scene.add(this.pivot);
  }

  private lamp(): DirectionalLight {
    const l = new DirectionalLight();
    l.shadow.bias = -0.0005;
    l.shadow.normalBias = 0.02;
    this.scene.add(l, l.target);
    return l;
  }

  /** Sets the lights, their shadows, the sky and the exposure of a profile (where the lights stand is set with the
   *  framing). */
  private light(p: StageProfile): void {
    for (const k of Object.keys(this.lights) as (keyof StageProfile['lights'])[]) {
      this.lights[k].color.set(p.lights[k].colour);
      this.lights[k].intensity = p.lights[k].energy * Math.PI;
      // a light without energy is none: three.js then leaves it out of the materials' programs
      this.lights[k].visible = p.lights[k].energy > 0;
    }
    // a key light with a size is drawn as several lights that share its energy
    const { key, rim } = this.lights, n = keyPlaces(p.lights.key.from, p.shadow.spread, p.shadow.lights).length;
    while (this.keys.length < n - 1) { const l = this.lamp(); l.castShadow = true; this.keys.push(l); }
    key.intensity /= n;
    this.keys.forEach((l, i) => { l.visible = i < n - 1; l.color.copy(key.color); l.intensity = key.intensity; });
    for (const l of [key, rim, ...this.keys]) {
      if (l.shadow.mapSize.x !== p.shadow.map) {
        l.shadow.map?.dispose();
        l.shadow.map = null;
        l.shadow.mapSize.set(p.shadow.map, p.shadow.map);
      }
      l.shadow.radius = p.shadow.radius;
      l.shadow.intensity = l === rim ? p.rimShadow : p.shadow.strength;
    }
    rim.castShadow = p.rimShadow > 0;
    this.sky.color.set(p.sky.top);
    this.sky.groundColor.set(p.sky.ground);
    this.sky.intensity = p.sky.energy * Math.PI;
    this.renderer.toneMappingExposure = p.exposure;
  }

  /** An image, loaded once per sharpness and kept; null when it is not there or cannot be read. */
  private texture(path: string, colour: boolean, anisotropy: number): Promise<Texture | null> {
    if (!path || !this.options.images.has(path)) return Promise.resolve(null);
    const kept = `${path}|${anisotropy}`;
    let t = this.textures.get(kept);
    if (!t) {
      t = this.loader.loadAsync(this.options.url(path)).then(tex => {
        tex.flipY = false; // texture coordinates as the builder gives them: v grows downwards
        tex.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
        tex.wrapS = tex.wrapT = RepeatWrapping; // as Godot's materials: a cloth's weave tiles over the garment
        tex.minFilter = LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = anisotropy;
        return tex;
      }, () => null);
      this.textures.set(kept, t);
    }
    return t;
  }

  /** Draws a portrait; the picture is then on the stage's canvas (transparent around the person). */
  async draw(p: Portrait): Promise<void> {
    const profile = profileOf(p.look);
    const parts = await Promise.all(p.surfaces.map(async s => ({
      s, map: await this.texture(s.tex, true, profile.anisotropy),
      normalMap: await this.texture(normalMapOf(s, this.options.images), false, profile.anisotropy),
    })));
    this.clear();
    this.light(profile);
    const inner = new Group();
    const tone = portraitSkinTone(p.surfaces);
    parts.forEach(({ s, map, normalMap }) => {
      // the skin as the smooth surface its triangles stand for (subdivide.ts)
      const skin = surfaceKind(s) === 'skin' ? profile.skin : null;
      const geometry = surfaceGeometry(s, skin ? skin.finer : 0, skin ? skin.fit : 0);
      for (const material of surfaceMaterials(s, map, normalMap, profile, tone, p.young)) {
        const mesh = new Mesh(geometry, material);
        mesh.castShadow = material.colorWrite && !material.transparent;
        // the painted layer of short hairs may be lit without shadows (profile.ts `cap.shadow`)
        mesh.receiveShadow = !(surfaceKind(s) === 'cap' && profile.cap && !profile.cap.shadow);
        mesh.renderOrder = drawOrder(s);
        inner.add(mesh);
      }
    });
    this.frame(p, inner, profile);
    const fine = profile.finish && this.linear(profile.finish.fine);
    if (!profile.finish || !fine) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    // a profile that finishes its picture: drawn in linear light, finer than the picture, then brought to the
    // canvas through the profile's tone curve (finish.ts)
    this.renderer.setRenderTarget(fine);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.finish ??= new Finish();
    this.finish.draw(this.renderer, fine.texture, profile.finish, profile.exposure);
  }

  /** The target a finished picture is first drawn to: `fine` times the picture's size a side, in half floats (light
   *  above white is kept), with four samples a pixel. Null where the graphics card cannot draw to such a target:
   *  the picture is then drawn straight to the canvas. */
  private linear(fine: number): WebGLRenderTarget | null {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return null;
    const size = this.renderer.getSize(new Vector2()), w = Math.round(size.x * fine), h = Math.round(size.y * fine);
    if (!this.target || this.target.width !== w || this.target.height !== h) {
      this.target?.dispose();
      this.target = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: 4, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true });
    }
    return this.target;
  }

  /** The framing: the head from the chin to above the crown (or hat) fills `fill` of the height, the eyes a little
   *  above the middle; the person turns about the axis through the head's centre. */
  private frame(p: Portrait, inner: Group, profile: StageProfile): void {
    const f = framing(p, profile), hv = f.height;
    const s = standing(p, profile);
    this.pivot.position.set(p.cx, 0, p.cz);
    this.pivot.rotation.y = s.turn;
    inner.position.set(...s.at);
    inner.rotation.z = s.tilt;
    this.pivot.add(inner);
    const at = new Vector3(...f.at);
    this.camera.position.set(...f.camera);
    this.camera.lookAt(at);
    const stand = (l: DirectionalLight, f: readonly [number, number, number]) => {
      l.position.set(at.x + f[0], at.y + f[1], at.z + f[2]);
      l.target.position.copy(at);
    };
    stand(this.lights.rim, profile.lights.rim.from);
    stand(this.lights.fill, profile.lights.fill.from);
    stand(this.lights.bounce, profile.lights.bounce.from);
    const keys = [this.lights.key, ...this.keys];
    keyPlaces(profile.lights.key.from, profile.shadow.spread, profile.shadow.lights).forEach((f, i) => stand(keys[i]!, f));
    // the shadows of the key light and, where the profile has them, of the rim light: a box around head and
    // shoulders
    for (const l of [this.lights.rim, ...keys]) {
      const c = l.shadow.camera, r = hv * profile.shadow.reach;
      c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 0.5; c.far = 30;
      c.updateProjectionMatrix();
    }
  }

  /** Where a point of the portrait drawn last lies in the picture: pixels from its top left corner. */
  place(x: number, y: number, z: number): [number, number] {
    const inner = this.pivot.children[0];
    if (!inner) throw new Error('no portrait drawn');
    const p = new Vector3(x, y, z).applyMatrix4(inner.matrixWorld).project(this.camera);
    const size = this.renderer.getSize(new Vector2());
    return [(p.x + 1) / 2 * size.x, (1 - p.y) / 2 * size.y];
  }

  private clear(): void {
    for (const inner of [...this.pivot.children]) {
      inner.traverse(o => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
      this.pivot.remove(inner);
    }
  }

  dispose(): void {
    this.clear();
    for (const t of this.textures.values()) void t.then(tex => tex?.dispose());
    this.target?.dispose();
    this.finish?.dispose();
    this.renderer.dispose();
  }
}
