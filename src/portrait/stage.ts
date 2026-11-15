// The stage of the portraits: a small three.js world of its own in which one portrait at a time is lit, framed and
// drawn, as Apoleia did it in Godot (app/scripts/ui/portrait_cache.gd): a warm key light with shadows from the upper
// left, a cool rim light from behind on the right, a weak warm fill, sky above and earth below; the head turned a
// little to the left; the head from chin to crown filling about half the height.
//
// Godot's numbers in three.js terms: a directional light of energy e is one of intensity e·π (three.js divides the
// diffuse reflection by π, Godot does not); the sky's ambient light of energy 0.75 is a hemisphere light of 0.75·π;
// Godot's ACES setting there (exposure 0.92 / 0.6 / 1.8, white 14.26) is three.js' ACES at exposure 0.92, which is
// where Apoleia took it from. Those are Apoleia's values; a set of dress of the game's own may bring others
// (profile.ts).
import {
  ACESFilmicToneMapping, DirectionalLight, Group, HemisphereLight, LinearMipmapLinearFilter, Mesh, NoColorSpace,
  PCFShadowMap, PerspectiveCamera, RepeatWrapping, Scene, SRGBColorSpace, type Texture, TextureLoader, Vector3, WebGLRenderer,
} from 'three';
import { surfaceGeometry } from './mesh';
import { drawOrder, normalMapOf, surfaceMaterials } from './materials';
import { APOLEIA, profileOf, type StageProfile } from './profile';
import type { Portrait } from './wire';

/** Width and height of a portrait in the game at scale 1 (Apoleia's 4:5), and of the picture drawn for it. */
export const PORTRAIT_SIZE = { width: 112, height: 140 } as const;
/** Vertical field of view of the camera in degrees. */
const FOV = 22;
/** The shadow of the key light: pixels of its map, and how dark it falls (1 = no key light in the shadow). Measured,
 *  not derived: with these two the pictures come closest to Godot's, whose shadows are softer and lighter than
 *  three.js' at full strength (tools/portrait/compare.mjs, docs/PORTRAITS.md). */
const SHADOW = { map: 512, strength: 0.7 } as const;

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
  private readonly sky = new HemisphereLight();
  private readonly textures = new Map<string, Promise<Texture | null>>();
  private readonly loader = new TextureLoader();

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
    const light = (): DirectionalLight => {
      const l = new DirectionalLight();
      this.scene.add(l, l.target);
      return l;
    };
    this.lights = { key: light(), rim: light(), fill: light() };
    this.light(APOLEIA);
    const { key, rim } = this.lights;
    key.castShadow = true;
    key.shadow.intensity = SHADOW.strength;
    for (const l of [key, rim]) {
      l.shadow.mapSize.set(SHADOW.map, SHADOW.map);
      l.shadow.bias = -0.0005;
      l.shadow.normalBias = 0.02;
    }
    this.scene.add(this.pivot);
  }

  /** Sets the lights, the sky and the exposure of a profile (where the lights stand is set with the framing). */
  private light(p: StageProfile): void {
    for (const k of Object.keys(this.lights) as (keyof StageProfile['lights'])[]) {
      this.lights[k].color.set(p.lights[k].colour);
      this.lights[k].intensity = p.lights[k].energy * Math.PI;
    }
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
    parts.forEach(({ s, map, normalMap }) => {
      const geometry = surfaceGeometry(s);
      for (const material of surfaceMaterials(s, map, normalMap, profile)) {
        const mesh = new Mesh(geometry, material);
        mesh.castShadow = material.colorWrite && !material.transparent;
        mesh.receiveShadow = true;
        mesh.renderOrder = drawOrder(s);
        inner.add(mesh);
      }
    });
    this.frame(p, inner, profile);
    this.renderer.render(this.scene, this.camera);
  }

  /** The framing: the head from the chin to above the crown (or hat) fills `fill` of the height, the eyes a little
   *  above the middle; the person turns about the axis through the head's centre. */
  private frame(p: Portrait, inner: Group, profile: StageProfile): void {
    const h = Math.max(0.8, p.top - p.chin), hv = h / (p.fill * profile.close);
    const cy = p.top - 0.36 * hv, dist = (hv * 0.5) / Math.tan((FOV / 2) * Math.PI / 180);
    this.pivot.position.set(p.cx, 0, p.cz);
    this.pivot.rotation.y = profile.turn;
    inner.position.set(-p.cx, 0, -p.cz);
    this.pivot.add(inner);
    const at = new Vector3(p.cx, cy, p.cz);
    this.camera.position.set(p.cx, cy + profile.rise * hv, p.cz + dist);
    this.camera.lookAt(at);
    for (const k of Object.keys(this.lights) as (keyof StageProfile['lights'])[]) {
      const l = this.lights[k], f = profile.lights[k].from;
      l.position.set(at.x + f[0], at.y + f[1], at.z + f[2]);
      l.target.position.copy(at);
    }
    // the shadows of the key light and, where the profile has them, of the rim light: a box around head and
    // shoulders
    this.lights.rim.castShadow = profile.rimShadow;
    for (const l of [this.lights.key, this.lights.rim]) {
      const c = l.shadow.camera, r = hv * 0.9;
      c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 0.5; c.far = 30;
      c.updateProjectionMatrix();
    }
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
    this.renderer.dispose();
  }
}
