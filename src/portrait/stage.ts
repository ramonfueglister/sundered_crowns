// The stage of the portraits: a small three.js world of its own in which one portrait at a time is lit, framed and
// drawn, as Apoleia did it in Godot (app/scripts/ui/portrait_cache.gd): a warm key light with shadows from the upper
// left, a cool rim light from behind on the right, a weak warm fill, sky above and earth below; the head turned a
// little to the left; the head from chin to crown filling about half the height.
//
// Godot's numbers in three.js terms: a directional light of energy e is one of intensity e·π (three.js divides the
// diffuse reflection by π, Godot does not); the sky's ambient light of energy 0.75 is a hemisphere light of 0.75·π;
// Godot's ACES setting there (exposure 0.92 / 0.6 / 1.8, white 14.26) is three.js' ACES at exposure 0.92, which is
// where Apoleia took it from.
import {
  ACESFilmicToneMapping, DirectionalLight, Group, HemisphereLight, LinearMipmapLinearFilter, Mesh, NoColorSpace,
  PCFShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, type Texture, TextureLoader, Vector3, WebGLRenderer,
} from 'three';
import { surfaceGeometry } from './mesh';
import { drawOrder, normalMapOf, surfaceMaterials } from './materials';
import type { Portrait } from './wire';

/** Width and height of a portrait in the game at scale 1 (Apoleia's 4:5), and of the picture drawn for it. */
export const PORTRAIT_SIZE = { width: 112, height: 140 } as const;
/** The head is turned a little to the left. */
const TURN = -0.35;
/** Vertical field of view of the camera in degrees. */
const FOV = 22;
/** Where the lights stand, seen from the point the camera looks at; colour; Godot's energy. */
const LIGHTS = {
  key: { from: [-3.5, 4.5, 5.0], colour: '#fff0dc', energy: 2.0 },
  rim: { from: [3.5, 2.5, -4.0], colour: '#bcd0ff', energy: 1.4 },
  fill: { from: [3.0, -1.0, 5.0], colour: '#ffe2c8', energy: 0.35 },
} as const;
const SKY = { top: '#e6ecff', ground: '#5a3d2a', energy: 0.75 } as const;
const EXPOSURE = 0.92;
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
  private readonly lights: Record<keyof typeof LIGHTS, DirectionalLight>;
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
    this.renderer.toneMappingExposure = EXPOSURE;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.camera = new PerspectiveCamera(FOV, width / height, 0.1, 100);
    this.scene.add(new HemisphereLight(SKY.top, SKY.ground, SKY.energy * Math.PI));
    const light = (k: keyof typeof LIGHTS): DirectionalLight => {
      const l = new DirectionalLight(LIGHTS[k].colour, LIGHTS[k].energy * Math.PI);
      this.scene.add(l, l.target);
      return l;
    };
    this.lights = { key: light('key'), rim: light('rim'), fill: light('fill') };
    const key = this.lights.key;
    key.castShadow = true;
    key.shadow.mapSize.set(SHADOW.map, SHADOW.map);
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    key.shadow.intensity = SHADOW.strength;
    this.scene.add(this.pivot);
  }

  /** An image, loaded once and kept; null when it is not there or cannot be read. */
  private texture(path: string, colour: boolean): Promise<Texture | null> {
    if (!path || !this.options.images.has(path)) return Promise.resolve(null);
    let t = this.textures.get(path);
    if (!t) {
      t = this.loader.loadAsync(this.options.url(path)).then(tex => {
        tex.flipY = false; // texture coordinates as the builder gives them: v grows downwards
        tex.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
        tex.minFilter = LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        return tex;
      }, () => null);
      this.textures.set(path, t);
    }
    return t;
  }

  /** Draws a portrait; the picture is then on the stage's canvas (transparent around the person). */
  async draw(p: Portrait): Promise<void> {
    const parts = await Promise.all(p.surfaces.map(async s => ({
      s, map: await this.texture(s.tex, true), normalMap: await this.texture(normalMapOf(s, this.options.images), false),
    })));
    this.clear();
    const inner = new Group();
    parts.forEach(({ s, map, normalMap }) => {
      const geometry = surfaceGeometry(s);
      for (const material of surfaceMaterials(s, map, normalMap)) {
        const mesh = new Mesh(geometry, material);
        mesh.castShadow = material.colorWrite && !material.transparent;
        mesh.receiveShadow = true;
        mesh.renderOrder = drawOrder(s);
        inner.add(mesh);
      }
    });
    this.frame(p, inner);
    this.renderer.render(this.scene, this.camera);
  }

  /** The framing: the head from the chin to above the crown (or hat) fills `fill` of the height, the eyes a little
   *  above the middle; the person turns about the axis through the head's centre. */
  private frame(p: Portrait, inner: Group): void {
    const h = Math.max(0.8, p.top - p.chin), hv = h / p.fill;
    const cy = p.top - 0.36 * hv, dist = (hv * 0.5) / Math.tan((FOV / 2) * Math.PI / 180);
    this.pivot.position.set(p.cx, 0, p.cz);
    this.pivot.rotation.y = TURN;
    inner.position.set(-p.cx, 0, -p.cz);
    this.pivot.add(inner);
    const at = new Vector3(p.cx, cy, p.cz);
    this.camera.position.set(p.cx, cy + 0.08 * hv, p.cz + dist);
    this.camera.lookAt(at);
    for (const k of Object.keys(LIGHTS) as (keyof typeof LIGHTS)[]) {
      const l = this.lights[k], f = LIGHTS[k].from;
      l.position.set(at.x + f[0], at.y + f[1], at.z + f[2]);
      l.target.position.copy(at);
    }
    // the shadow of the key light: a box around head and shoulders
    const c = this.lights.key.shadow.camera, r = hv * 0.9;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 0.5; c.far = 30;
    c.updateProjectionMatrix();
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
