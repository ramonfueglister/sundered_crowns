import * as THREE from 'three/webgpu';
import { texture } from 'three/tsl';
import { FIGURES_LAYER } from './look';

/**
 * The sun's shadow map, drawn in two parts. What stands still (land, houses, ships, all but the figures) is drawn
 * into a depth picture of its own, kept from picture to picture; each picture copies it into the shadow map and
 * draws the walking figures over it. The part that stands still is drawn anew only in a picture that something
 * other than the figures asks for (`full`: the view, a piece that comes, goes, glides or dissolves …) and wherever
 * the sun's camera has moved. So while the figures walk and nothing else changes, a picture draws the shadows of
 * the figures alone, where it drew everything that casts a shadow again (near a town two million triangles and more),
 * and the copy is one pass over the map. The map is drawn once a picture, also where the water's mirror draws the
 * stage a second time: it was drawn twice there (the mirror's camera does not see the figures; the parts are drawn
 * by their layers, whichever camera comes first). Both depth pictures have no colour beside them, which three gives
 * its shadow map and which is never read with PCF: so the kept one takes no more memory than that colour took.
 */
export class KeptShadow extends THREE.ShadowNode {
  /** whether the part that stands still is to be drawn anew in the next picture */
  full = true;
  private kept: THREE.RenderTarget | null = null;
  private copy: THREE.QuadMesh | null = null;
  private readonly seen = new THREE.Matrix4();
  constructor(light: THREE.DirectionalLight) {
    super(light, light.shadow);
    light.shadow.autoUpdate = false;
    (light.shadow as unknown as { shadowNode: THREE.ShadowNode }).shadowNode = this;
  }
  /** the shadow map of three's own, without its colour */
  setupRenderTarget(shadow: THREE.LightShadow, builder: { renderer: THREE.WebGPURenderer }) {
    const depthTexture = new THREE.DepthTexture(shadow.mapSize.width, shadow.mapSize.height);
    depthTexture.name = 'ShadowDepthTexture';
    depthTexture.compareFunction = builder.renderer.reversedDepthBuffer ? THREE.GreaterEqualCompare : THREE.LessEqualCompare;
    const shadowMap = new THREE.RenderTarget(shadow.mapSize.width, shadow.mapSize.height, { count: 0, depthTexture });
    return { shadowMap, depthTexture };
  }
  renderShadow(frame: { renderer: THREE.WebGPURenderer; scene: THREE.Scene }) {
    const { shadow, light, shadowMap } = this as unknown as { shadow: THREE.LightShadow; light: THREE.DirectionalLight; shadowMap: THREE.RenderTarget };
    const { renderer, scene } = frame, eye = shadow.camera, w = shadow.mapSize.width, h = shadow.mapSize.height;
    shadow.updateMatrices(light);
    shadowMap.setSize(w, h);
    if (!this.kept) {
      const depth = new THREE.DepthTexture(w, h);
      depth.minFilter = depth.magFilter = THREE.NearestFilter;
      this.kept = new THREE.RenderTarget(w, h, { count: 0, depthTexture: depth });
      const copied = new THREE.NodeMaterial();
      copied.name = 'KeptShadow';
      copied.depthNode = texture(depth).r;
      copied.depthFunc = THREE.AlwaysDepth; copied.depthTest = true; copied.depthWrite = true; copied.colorWrite = false;
      this.copy = new THREE.QuadMesh(copied);
      this.full = true;
    }
    this.kept.setSize(w, h);
    const layers = eye.layers.mask;
    // (renderShadow is called with the shadow map as the target, its clearing, three's shadow material and its way of
    // drawing only what casts a shadow; updateShadow sets the layers of the sun's camera back afterwards)
    if (this.full || !this.seen.equals(shadow.matrix)) {
      this.seen.copy(shadow.matrix);
      eye.layers.set(0);
      renderer.setRenderTarget(this.kept);
      renderer.render(scene, eye);
      renderer.setRenderTarget(shadowMap);
      this.full = false;
    }
    const drawing = renderer.getRenderObjectFunction();
    renderer.setRenderObjectFunction(null);
    this.copy!.render(renderer);
    renderer.setRenderObjectFunction(drawing);
    eye.layers.set(FIGURES_LAYER);
    renderer.autoClear = false;
    renderer.render(scene, eye);
    renderer.autoClear = true;
    eye.layers.mask = layers;
  }
}
