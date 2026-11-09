// WebGPU map renderer.
import type { MapAssets } from './assets';
import { buildCoastSdf } from './coast';
import { Overlay, type MapLabel, type MapUnit, type MapLandmark } from './overlay';
import { ALBEDO_WGSL, BAKE_WGSL, HEIGHT_WGSL, MAIN_WGSL, MIP_WGSL, RIVER_WGSL, TERRAIN_WGSL } from './shaders';
import { makeCamera, project, screenToPlane, screenToTerrain, type Cam3 } from './camera3d';
import { Props, loadModelSet, figureSpot, SHOW_UNITS, type Settlement, type UnitProp, type SceneProp } from './props';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type MapMode = 'political' | 'terrain' | 'flat';

interface QualityDef { scale: number; dprCap: number; waves: number; rings: number[]; aoTaps: number; q: number; meshPx: number; trees: number; shadows: boolean }
const QUALITY: Record<Quality, QualityDef> = {
  low: { scale: 0.75, dprCap: 1, waves: 1, rings: [1.2, 5], aoTaps: 1, q: 0, meshPx: 10, trees: 0, shadows: false },
  medium: { scale: 0.9, dprCap: 1.25, waves: 2, rings: [1, 3.5, 7], aoTaps: 4, q: 1, meshPx: 6, trees: 40000, shadows: false },
  high: { scale: 1, dprCap: 1.5, waves: 3, rings: [1, 3, 6, 10], aoTaps: 4, q: 2, meshPx: 4, trees: 120000, shadows: true },
  ultra: { scale: 1, dprCap: 2, waves: 3, rings: [1, 2.5, 5.5, 10], aoTaps: 4, q: 3, meshPx: 3, trees: 250000, shadows: true },
};

const LOC_WORDS = 12; // Loc struct in MAIN_WGSL
const UNIFORM_FLOATS = 52;
/** height-field mesh: chunks of CH x CH height samples, LOD levels 0..MAX_LOD (vertex step 2^lod samples) */
const CH = 64, MAX_LOD = 6;
/** world px (map px) of relief per km of height: about nine times true scale, so mountains read at a glance */
export const H_SCALE = 4.5;
const RIVER_W = [0, 2.4, 1.9, 1.5, 1.15, 0.9, 0.7];

function pack(r: number, g: number, b: number, a: number): number {
  return ((r & 255) | ((g & 255) << 8) | ((b & 255) << 16) | ((a & 255) << 24)) >>> 0;
}
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (t: number) => t * t * (3 - 2 * t);

export class MapRenderer {
  camera = { x: 0, y: 0, zoom: 1 };
  onFrame?: () => void;
  onClick?: (loc: number, ev: MouseEvent) => void;
  onHover?: (loc: number) => void;
  onRightClick?: (loc: number, ev: MouseEvent) => void;
  /** pan when the mouse rests near the canvas edge */
  edgePan = false;
  minZoom = 0.15;
  maxZoom = 24;
  /** last measured CPU+GPU-submit frame time (ms) and smoothed frame interval */
  stats = { frameMs: 0, intervalMs: 0 };

  readonly overlay: Overlay;
  readonly N: number; readonly L: number; readonly W: number; readonly H: number;

  private device!: GPUDevice;
  private ctx!: GPUCanvasContext;
  private format!: GPUTextureFormat;
  private quality: Quality;
  private qd: QualityDef;
  private mode: MapMode = 'political';
  private pxRatio = 1;
  private cssW = 1; private cssH = 1;
  private time = 0;
  private raf = 0;
  private lastT = 0;
  private destroyed = false;

  private locData: ArrayBuffer;
  private locU32: Uint32Array; private locI32: Int32Array; private locF32: Float32Array;
  private locDirty = true;
  private polColor: Uint32Array; private flatColor: Uint32Array;
  private selected = -1; private hover = -1; private highlight: number[] = [];

  private uniforms = new Float32Array(UNIFORM_FLOATS);
  private uniformBuf!: GPUBuffer;
  private locBuf!: GPUBuffer;
  private idTex!: GPUTexture;
  private heightInt!: GPUTexture; private heightF!: GPUTexture; private biomeTex!: GPUTexture;
  private albedoTex!: GPUTexture; private coastTex!: GPUTexture;
  private terrainTex!: GPUTexture; private auxTex!: GPUTexture;
  private riverTex: GPUTexture | null = null;
  private riverBuf!: GPUBuffer; private riverCount = 0;
  private roadBuf: GPUBuffer | null = null; private roadCount = 0; private roadPipe!: GPURenderPipeline; private roadLevels: Uint8Array | null = null;
  private sampler!: GPUSampler;
  private mainPipe!: GPURenderPipeline; private riverPipe!: GPURenderPipeline;
  private mipPipes = new Map<GPUTextureFormat, GPURenderPipeline>();
  private mainBG: GPUBindGroup | null = null; private riverBG!: GPUBindGroup;
  private bakedAo = -1;
  // 3D terrain
  private cam3!: Cam3;
  private gbufTex: GPUTexture | null = null; private depthTex: GPUTexture | null = null;
  private terrainPipe!: GPURenderPipeline; private terrainBG!: GPUBindGroup;
  private terrainUB!: GPUBuffer;
  private lodVB: GPUBuffer[] = []; private lodIB: GPUBuffer[] = []; private lodIdx: number[] = [];
  private instBuf!: GPUBuffer; private instData!: Float32Array;
  private chunkNX = 0; private chunkNY = 0; private chunkZ!: Float32Array; // per chunk: min, max height (world px)
  private maxTerrain = 0;
  private lodCounts: number[] = [];
  /** trees, towns, armies and fleets as 3D figures */
  props: Props | null = null;
  /** hosts gliding to their new place: current and target spot of the figures, offset of the figures from the counter */
  private unitAnim = new Map<number, { x: number; y: number; tx: number; ty: number; ox: number; oy: number; vx: number; vy: number; t0: number; dur: number }>();
  /** time of year (0 = 1 January) and game day, for seasons and weather */
  private season = 0.5; private gameDay = 0; private dayAt = 0;

  // camera animation
  private fly: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; t: number; dur: number } | null = null;
  private zoomTarget: number | null = null; private zoomAnchor: [number, number] = [0, 0];
  private keys = new Set<string>();
  private mouse: [number, number] | null = null;
  private detachFns: (() => void)[] = [];
  private inkSpeed = 400;

  private constructor(private canvas: HTMLCanvasElement, private assets: MapAssets, quality: Quality) {
    this.quality = quality; this.qd = QUALITY[quality];
    const g = assets.geo;
    this.W = assets.W; this.H = assets.H; this.L = g.L; this.N = g.L + g.S;
    this.locData = new ArrayBuffer(this.N * LOC_WORDS * 4);
    this.locU32 = new Uint32Array(this.locData); this.locI32 = new Int32Array(this.locData); this.locF32 = new Float32Array(this.locData);
    this.polColor = new Uint32Array(this.N); this.flatColor = new Uint32Array(this.N);
    const provOf = new Int32Array(this.N).fill(-1);
    g.provinces.forEach((p, i) => { for (const l of p.locs) provOf[l - 1] = i; });
    for (let i = 0; i < this.N; i++) {
      const o = i * LOC_WORDS;
      this.locI32[o + 3] = -1;           // owner
      this.locF32[o + 5] = -1;           // animStart
      this.locI32[o + 8] = provOf[i] >= 0 ? provOf[i] : -2 - i; // province (unique fallback)
    }
    this.overlay = new Overlay(canvas);
    this.camera = { x: 3900, y: 1900, zoom: 0.6 };
  }

  static async create(canvas: HTMLCanvasElement, assets: MapAssets, quality: Quality): Promise<MapRenderer> {
    if (!('gpu' in navigator) || !navigator.gpu) throw new Error('WebGPU is not available in this browser');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No WebGPU adapter found');
    const need = Math.max(assets.W, assets.H);
    if (adapter.limits.maxTextureDimension2D < need) throw new Error(`GPU max texture size ${adapter.limits.maxTextureDimension2D} < ${need}`);
    const device = await adapter.requestDevice({
      requiredLimits: {
        maxTextureDimension2D: Math.max(8192, need) <= adapter.limits.maxTextureDimension2D ? Math.max(8192, need) : need,
        maxStorageBufferBindingSize: Math.min(adapter.limits.maxStorageBufferBindingSize, 256 << 20),
      },
    });
    const r = new MapRenderer(canvas, assets, quality);
    await r.init(device);
    return r;
  }

  // ------------------------------------------------------------------ init
  private async init(device: GPUDevice) {
    this.device = device;
    device.lost.then((info) => { if (!this.destroyed) console.error('WebGPU device lost:', info.message); });
    const ctx = this.canvas.getContext('webgpu');
    if (!ctx) throw new Error('Could not get a WebGPU canvas context');
    this.ctx = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format: this.format, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const a = this.assets;
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

    // id raster
    this.idTex = device.createTexture({ size: [a.W, a.H], format: 'r16uint', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    const rowsPerChunk = 512;
    for (let y = 0; y < a.H; y += rowsPerChunk) {
      const rows = Math.min(rowsPerChunk, a.H - y);
      device.queue.writeTexture({ texture: this.idTex, origin: [0, y] }, a.ids.subarray(y * a.W, (y + rows) * a.W), { bytesPerRow: a.W * 2 }, [a.W, rows]);
    }
    // height + biome
    this.heightInt = device.createTexture({ size: [a.hw, a.hh], format: 'r16sint', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: this.heightInt }, a.height, { bytesPerRow: a.hw * 2 }, [a.hw, a.hh]);
    const bw = a.biome.width, bh = a.biome.height;
    this.biomeTex = device.createTexture({ size: [bw, bh], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT });
    device.queue.copyExternalImageToTexture({ source: a.biome }, { texture: this.biomeTex, premultipliedAlpha: false }, [bw, bh]);
    // coast signed distance field at full resolution (worker) while the GPU prepares the bake inputs
    const sdfP = buildCoastSdf(a.ids, a.W, a.H, this.L);
    this.prepareStatic(bw, bh);
    const sdf = await sdfP;
    this.coastTex = device.createTexture({ size: [a.W, a.H], format: 'r8unorm', mipLevelCount: this.mipLevels(a.W, a.H), usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    for (let y = 0; y < a.H; y += 1024) {
      const rows = Math.min(1024, a.H - y);
      device.queue.writeTexture({ texture: this.coastTex, origin: [0, y] }, sdf.subarray(y * a.W, (y + rows) * a.W), { bytesPerRow: a.W }, [a.W, rows]);
    }
    const menc = device.createCommandEncoder();
    this.genMips(menc, this.coastTex);
    device.queue.submit([menc.finish()]);
    this.bake();
    this.buildRivers();
    this.buildRoads();

    // per-frame resources
    this.uniformBuf = device.createBuffer({ size: UNIFORM_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.locBuf = device.createBuffer({ size: this.locData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const mainMod = device.createShaderModule({ code: MAIN_WGSL });
    this.mainPipe = device.createRenderPipeline({ layout: 'auto', vertex: { module: mainMod, entryPoint: 'vs' }, fragment: { module: mainMod, entryPoint: 'fs', targets: [{ format: this.format }] }, primitive: { topology: 'triangle-list' } });
    const rivMod = device.createShaderModule({ code: RIVER_WGSL });
    // rivers and roads share one layout (and one bind group)
    const ribbonBGL = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }] });
    const ribbonLayout = device.createPipelineLayout({ bindGroupLayouts: [ribbonBGL] });
    this.riverPipe = device.createRenderPipeline({
      layout: ribbonLayout,
      vertex: {
        module: rivMod, entryPoint: 'vs',
        buffers: [{ arrayStride: 32, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }, { shaderLocation: 1, offset: 16, format: 'float32x2' }, { shaderLocation: 2, offset: 24, format: 'float32x2' }] }],
      },
      fragment: { module: rivMod, entryPoint: 'fs', targets: [{ format: 'rgba8unorm', blend: { color: { operation: 'max', srcFactor: 'one', dstFactor: 'one' }, alpha: { operation: 'max', srcFactor: 'one', dstFactor: 'one' } } }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less-equal' },
    });
    // roads share the ribbon shader and the target (green channel)
    this.roadPipe = device.createRenderPipeline({
      layout: ribbonLayout,
      vertex: {
        module: rivMod, entryPoint: 'vs_road',
        buffers: [{ arrayStride: 32, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }, { shaderLocation: 1, offset: 16, format: 'float32x2' }, { shaderLocation: 2, offset: 24, format: 'float32x2' }] }],
      },
      fragment: { module: rivMod, entryPoint: 'fs_road', targets: [{ format: 'rgba8unorm', blend: { color: { operation: 'max', srcFactor: 'one', dstFactor: 'one' }, alpha: { operation: 'max', srcFactor: 'one', dstFactor: 'one' } } }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less-equal' },
    });
    this.riverBG = device.createBindGroup({ layout: ribbonBGL, entries: [{ binding: 0, resource: { buffer: this.uniformBuf } }] });
    const terMod = this.initTerrain();
    const props = (this.props = new Props(device, a, this.uniformBuf, this.format, (x, y) => this.terrainZ(x, y), this.locBuf, this.idTex));
    props.treeBudget = this.qd.trees; props.shadows = this.qd.shadows;
    props.unitSpot = (id) => { const an = this.unitAnim.get(id); return an ? [an.x, an.y] : undefined; };
    void props.loadBiome(this.biomeTex);
    void loadModelSet('/').then((m) => { if (m && !this.destroyed) props.setModels(m); });
    for (const m of [mainMod, rivMod, terMod, props.mod]) {
      const info = await m.getCompilationInfo();
      for (const msg of info.messages) if (msg.type === 'error') throw new Error('WGSL: ' + msg.message + ' @' + msg.lineNum);
    }
    this.resize();
    this.fitInitial();
    await device.queue.onSubmittedWorkDone();
  }

  private fitInitial() {
    // Europe overview
    this.camera.x = 3980; this.camera.y = 1950;
    this.camera.zoom = clamp(Math.min(this.cssW / 2300, this.cssH / 1500), this.minZoom, this.maxZoom);
  }

  private mipLevels(w: number, h: number) { return Math.floor(Math.log2(Math.max(w, h))) + 1; }

  private mipPipe(format: GPUTextureFormat) {
    let p = this.mipPipes.get(format);
    if (!p) {
      const m = this.device.createShaderModule({ code: MIP_WGSL });
      p = this.device.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' }, fragment: { module: m, entryPoint: 'fs', targets: [{ format }] } });
      this.mipPipes.set(format, p);
    }
    return p;
  }

  private genMips(enc: GPUCommandEncoder, tex: GPUTexture) {
    const pipe = this.mipPipe(tex.format);
    for (let l = 1; l < tex.mipLevelCount; l++) {
      const bg = this.device.createBindGroup({
        layout: pipe.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: tex.createView({ baseMipLevel: l - 1, mipLevelCount: 1 }) }, { binding: 1, resource: this.sampler }],
      });
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: tex.createView({ baseMipLevel: l, mipLevelCount: 1 }), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
      pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
    }
  }

  private fullscreen(enc: GPUCommandEncoder, code: string, targets: GPUTexture[], entries: (GPUBindingResource)[]) {
    const d = this.device;
    const m = d.createShaderModule({ code });
    const pipe = d.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' }, fragment: { module: m, entryPoint: 'fs', targets: targets.map((t) => ({ format: t.format })) } });
    const bg = d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: entries.map((resource, binding) => ({ binding, resource })) });
    const pass = enc.beginRenderPass({ colorAttachments: targets.map((t) => ({ view: t.createView({ baseMipLevel: 0, mipLevelCount: 1 }), loadOp: 'clear' as const, storeOp: 'store' as const, clearValue: [0, 0, 0, 0] })) });
    pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
  }

  /** inputs of the bake that never change: float heights with mips, albedo with mips */
  private prepareStatic(bw: number, bh: number) {
    const d = this.device, a = this.assets;
    const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT;
    this.heightF = d.createTexture({ size: [a.hw, a.hh], format: 'r16float', usage, mipLevelCount: this.mipLevels(a.hw, a.hh) });
    this.albedoTex = d.createTexture({ size: [bw, bh], format: 'rgba8unorm', usage, mipLevelCount: this.mipLevels(bw, bh) });
    const enc = d.createCommandEncoder();
    this.fullscreen(enc, HEIGHT_WGSL, [this.heightF], [this.heightInt.createView()]);
    this.genMips(enc, this.heightF);
    this.fullscreen(enc, ALBEDO_WGSL, [this.albedoTex], [this.biomeTex.createView()]);
    this.genMips(enc, this.albedoTex);
    d.queue.submit([enc.finish()]);
  }

  private bake() {
    const d = this.device, a = this.assets;
    if (this.bakedAo === this.qd.aoTaps) return;
    this.bakedAo = this.qd.aoTaps;
    const bw = this.albedoTex.width, bh = this.albedoTex.height;
    const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT;
    this.terrainTex?.destroy(); this.auxTex?.destroy();
    this.terrainTex = d.createTexture({ size: [bw, bh], format: 'rgba8unorm', usage, mipLevelCount: this.mipLevels(bw, bh) });
    this.auxTex = d.createTexture({ size: [bw, bh], format: 'rgba8unorm', usage, mipLevelCount: this.mipLevels(bw, bh) });
    const g = a.geo;
    const merc = (lat: number) => Math.asinh(Math.tan((lat * Math.PI) / 180));
    const ub = d.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(ub, 0, new Float32Array([bw, bh, a.W, a.H, merc(g.latN), merc(g.latS), ((g.lon1 - g.lon0) / a.W) * 111.32, 0, this.qd.aoTaps, 6.0, 0, 0]));
    const enc = d.createCommandEncoder();
    this.fullscreen(enc, BAKE_WGSL, [this.terrainTex, this.auxTex], [
      { buffer: ub }, this.albedoTex.createView(), this.heightF.createView(), this.coastTex.createView(), this.biomeTex.createView(), this.sampler,
    ]);
    this.genMips(enc, this.terrainTex);
    this.genMips(enc, this.auxTex);
    d.queue.submit([enc.finish()]);
    ub.destroy();
    this.mainBG = null;
  }

  /** terrain height in world px (>= 0, sea level 0) at a map position, bilinear like the GPU mesh */
  terrainZ(x: number, y: number): number {
    const a = this.assets;
    const sx = clamp(x / 2 - 0.5, 0, a.hw - 1.001), sy = clamp(y / 2 - 0.5, 0, a.hh - 1.001);
    const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
    const o = iy * a.hw + ix, h = a.height;
    const v = (h[o] * (1 - fx) + h[o + 1] * fx) * (1 - fy) + (h[o + a.hw] * (1 - fx) + h[o + a.hw + 1] * fx) * fy;
    return Math.max(0, v) / 1000 * H_SCALE;
  }

  private initTerrain(): GPUShaderModule {
    const d = this.device, a = this.assets;
    // per-LOD grid with a skirt ring (outer ring repeats the border position, flagged to drop down and hide cracks)
    for (let l = 0; l <= MAX_LOD; l++) {
      const n = CH >> l, side = n + 3;
      const v = new Float32Array(side * side * 3);
      let k = 0;
      for (let j = -1; j <= n + 1; j++) for (let i = -1; i <= n + 1; i++) {
        v[k++] = clamp(i, 0, n); v[k++] = clamp(j, 0, n); v[k++] = i < 0 || j < 0 || i > n || j > n ? 1 : 0;
      }
      const idx = new Uint32Array((side - 1) * (side - 1) * 6);
      k = 0;
      for (let j = 0; j < side - 1; j++) for (let i = 0; i < side - 1; i++) {
        const q = j * side + i;
        idx[k++] = q; idx[k++] = q + side; idx[k++] = q + 1;
        idx[k++] = q + 1; idx[k++] = q + side; idx[k++] = q + side + 1;
      }
      const vb = d.createBuffer({ size: v.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(vb, 0, v);
      const ib = d.createBuffer({ size: idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(ib, 0, idx);
      this.lodVB.push(vb); this.lodIB.push(ib); this.lodIdx.push(idx.length);
    }
    // chunk height bounds for culling and LOD
    this.chunkNX = Math.ceil(a.hw / CH); this.chunkNY = Math.ceil(a.hh / CH);
    const nc = this.chunkNX * this.chunkNY;
    this.chunkZ = new Float32Array(nc * 2);
    for (let c = 0; c < nc; c++) { this.chunkZ[c * 2] = 1e9; this.chunkZ[c * 2 + 1] = 0; }
    for (let y = 0; y < a.hh; y++) {
      const cy = Math.floor(y / CH) * this.chunkNX;
      for (let x = 0; x < a.hw; x++) {
        const z = Math.max(0, a.height[y * a.hw + x]) / 1000 * H_SCALE;
        const c = (cy + Math.floor(x / CH)) * 2;
        if (z < this.chunkZ[c]) this.chunkZ[c] = z;
        if (z > this.chunkZ[c + 1]) this.chunkZ[c + 1] = z;
      }
    }
    for (let c = 0; c < nc; c++) this.maxTerrain = Math.max(this.maxTerrain, this.chunkZ[c * 2 + 1]);
    this.instData = new Float32Array(nc * 4);
    this.instBuf = d.createBuffer({ size: this.instData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.terrainUB = d.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const mod = d.createShaderModule({ code: TERRAIN_WGSL });
    this.terrainPipe = d.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: mod, entryPoint: 'vs',
        buffers: [
          { arrayStride: 12, stepMode: 'vertex', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
          { arrayStride: 16, stepMode: 'instance', attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x4' }] },
        ],
      },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format: 'rgba32float' }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.terrainBG = d.createBindGroup({
      layout: this.terrainPipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.terrainUB } }, { binding: 1, resource: this.heightF.createView() }, { binding: 2, resource: this.sampler }],
    });
    return mod;
  }

  /** choose a level of detail for every visible chunk and upload the instance list (grouped by level) */
  private updateChunks(c: Cam3) {
    const a = this.assets, m = c.vp, inst = this.instData;
    const byLod: number[][] = Array.from({ length: MAX_LOD + 1 }, () => []);
    const px = this.qd.meshPx;
    for (let cy = 0; cy < this.chunkNY; cy++) for (let cx = 0; cx < this.chunkNX; cx++) {
      const ci = cy * this.chunkNX + cx;
      const x0 = cx * CH * 2, y0 = cy * CH * 2;
      const x1 = Math.min(a.hw, (cx + 1) * CH) * 2, y1 = Math.min(a.hh, (cy + 1) * CH) * 2;
      const z0 = -this.chunkZ[ci * 2 + 1] - 1, z1 = -this.chunkZ[ci * 2] + 1;
      // frustum test: all 8 corners outside one clip plane -> invisible
      let o0 = 0, o1 = 0, o2 = 0, o3 = 0, o4 = 0, o5 = 0;
      for (let k = 0; k < 8; k++) {
        const x = k & 1 ? x1 : x0, y = k & 2 ? y1 : y0, z = k & 4 ? z1 : z0;
        const X = m[0] * x + m[4] * y + m[8] * z + m[12], Y = m[1] * x + m[5] * y + m[9] * z + m[13];
        const Z = m[2] * x + m[6] * y + m[10] * z + m[14], Wc = m[3] * x + m[7] * y + m[11] * z + m[15];
        if (X < -Wc) o0++; if (X > Wc) o1++; if (Y < -Wc) o2++; if (Y > Wc) o3++; if (Z < 0) o4++; if (Z > Wc) o5++;
      }
      if (o0 === 8 || o1 === 8 || o2 === 8 || o3 === 8 || o4 === 8 || o5 === 8) continue;
      // distance from the eye to the chunk box
      const e = c.eye;
      const dx = Math.max(x0 - e[0], 0, e[0] - x1), dy = Math.max(y0 - e[1], 0, e[1] - y1), dz = Math.max(z0 - e[2], 0, e[2] - z1);
      const dist = Math.max(1, Math.hypot(dx, dy, dz));
      // one quad (2 * step map px) should cover about meshPx css px
      const lod = clamp(Math.floor(Math.log2((px * dist) / (2 * c.focal))), 0, MAX_LOD);
      byLod[lod].push(cx * CH, cy * CH);
    }
    let k = 0;
    this.lodCounts = [];
    for (let l = 0; l <= MAX_LOD; l++) {
      const list = byLod[l];
      for (let i = 0; i < list.length; i += 2) { inst[k++] = list[i]; inst[k++] = list[i + 1]; inst[k++] = 1 << l; inst[k++] = 0; }
      this.lodCounts.push(list.length / 2);
    }
    if (k) this.device.queue.writeBuffer(this.instBuf, 0, inst, 0, k);
    const tu = new Float32Array(20);
    tu.set(c.vp, 0);
    tu[16] = a.hw; tu[17] = a.hh; tu[18] = H_SCALE; tu[19] = 1.2;
    this.device.queue.writeBuffer(this.terrainUB, 0, tu);
  }

  /** the camera for the current view */
  private camNow(): Cam3 {
    return makeCamera(this.camera.x, this.camera.y, this.camera.zoom, this.cssW, this.cssH, undefined, this.maxTerrain);
  }

  /** road levels per location (the road building, 0..3); the map draws them between neighbouring locations */
  setRoads(levels: Uint8Array) {
    const old = this.roadLevels;
    if (old && old.length === levels.length && old.every((v, i) => v === levels[i])) return;
    this.roadLevels = new Uint8Array(levels);
    this.buildRoads();
  }
  /** country tracks link every place to the network (a spanning tree, cheapest ways first), towns are linked to each
   *  other, and built roads show wider and paler; each way winds a little across the land */
  private roadNet: { p: number; q: number; tree: boolean; towns: boolean }[] | null = null;
  private roadGeo = new Map<number, Float32Array>();
  private buildRoads() {
    const a = this.assets, g = a.geo, L = g.L, sz = g.loc.size as number[], elev = g.loc.elev as number[];
    if (!this.roadNet) {
      const edges: { p: number; q: number; w: number; tree: boolean; towns: boolean }[] = [];
      for (const [a1, b1, kind, , rf] of g.edges as [number, number, number, number, number][]) {
        if (kind !== 0) continue;
        const p = a1 - 1, q = b1 - 1;
        if (p >= L || q >= L) continue;
        const len = Math.hypot(g.loc.x[p] - g.loc.x[q], g.loc.y[p] - g.loc.y[q]);
        if (len > 90) continue;
        const w = len * (1 + 0.8 * (rf || 0)) * (1 + Math.abs((elev[p] || 0) - (elev[q] || 0)) / 350) / (1 + 0.35 * ((sz[p] || 0) + (sz[q] || 0)));
        edges.push({ p, q, w, tree: false, towns: Math.min(sz[p] || 0, sz[q] || 0) >= 1 });
      }
      // the spanning tree (Kruskal)
      const parent = new Int32Array(L).map((_, i) => i);
      const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
      for (const e of [...edges].sort((x, y) => x.w - y.w)) { const r1 = find(e.p), r2 = find(e.q); if (r1 !== r2) { parent[r1] = r2; e.tree = true; } }
      this.roadNet = edges.map(({ p, q, tree, towns }) => ({ p, q, tree, towns }));
    }
    const lv = this.roadLevels;
    const parts: Float32Array[] = [];
    let total = 0;
    for (let i = 0; i < this.roadNet.length; i++) {
      const { p, q, tree, towns } = this.roadNet[i];
      const built = lv ? Math.min(lv[p], lv[q]) : 0;
      if (!tree && !towns && !built) continue;
      // kind: track 0.35, town road 0.5, built 0.72 / paved 1
      const kindV = built >= 2 ? 1 : built >= 1 ? 0.72 : towns ? 0.5 : 0.35;
      const width = built >= 2 ? 0.62 : built >= 1 ? 0.52 : towns ? 0.42 : 0.34;
      let geo = this.roadGeo.get(i);
      if (!geo) {
        // the way's shape: a gentle bend and a little wander, the same from either end
        const x0 = g.loc.x[p], y0 = g.loc.y[p], x1 = g.loc.x[q], y1 = g.loc.y[q];
        const len = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
        const n = Math.max(2, Math.ceil(len / 5));
        const s0 = Math.min(p, q) * 0.618 + Math.max(p, q) * 0.382;
        const bend = (Math.sin(s0 * 12.9898) * 0.5) * Math.min(0.16 * len, 4) * (p < q ? 1 : -1);
        const wob = Math.min(0.05 * len, 1.4);
        geo = new Float32Array(n * 8);
        let px = x0, py = y0, pz = this.terrainZ(x0, y0);
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          const off = bend * Math.sin(Math.PI * t) + wob * Math.sin(Math.PI * 3 * t + s0) * Math.sin(Math.PI * t);
          const x = x0 + (x1 - x0) * t + nx * off, y = y0 + (y1 - y0) * t + ny * off, z = this.terrainZ(x, y);
          geo.set([px, py, x, y, 0, 0, pz, z], (k - 1) * 8);
          px = x; py = y; pz = z;
        }
        this.roadGeo.set(i, geo);
      }
      for (let o = 0; o < geo.length; o += 8) { geo[o + 4] = width; geo[o + 5] = kindV; }
      parts.push(geo); total += geo.length;
    }
    const segs = new Float32Array(Math.max(8, total));
    let o = 0;
    for (const f of parts) { segs.set(f, o); o += f.length; }
    this.roadCount = total / 8;
    if (!this.roadBuf || this.roadBuf.size < segs.byteLength) {
      this.roadBuf?.destroy();
      this.roadBuf = this.device.createBuffer({ size: Math.ceil(segs.byteLength * 1.25 / 4) * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    this.device.queue.writeBuffer(this.roadBuf, 0, segs);
  }

  private buildRivers() {
    const a = this.assets, W = a.W, H = a.H;
    const segs: number[] = [];
    const hAt = (x: number, y: number) => {
      const hx = clamp(Math.floor(x / 2), 0, a.hw - 1), hy = clamp(Math.floor(y / 2), 0, a.hh - 1);
      return a.height[hy * a.hw + hx];
    };
    for (const r of a.geo.rivers) {
      const pts = r.pts.filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H);
      if (pts.length < 2) continue;
      // source = higher end; widen towards the mouth
      const rev = hAt(pts[0][0], pts[0][1]) < hAt(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      if (rev) pts.reverse();
      const base = RIVER_W[clamp(r.rank, 1, 6)];
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        const len = Math.hypot(x1 - x0, y1 - y0);
        if (len > 60) { acc += len; continue; } // gaps where the polyline leaves the map
        const t0 = total > 0 ? acc / total : 1; acc += len; const t1 = total > 0 ? acc / total : 1;
        segs.push(x0, y0, x1, y1, base * (0.4 + 0.6 * Math.sqrt(t0)), base * (0.4 + 0.6 * Math.sqrt(t1)), this.terrainZ(x0, y0), this.terrainZ(x1, y1));
      }
    }
    this.riverCount = segs.length / 8;
    this.riverBuf = this.device.createBuffer({ size: Math.max(32, segs.length * 4), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    if (segs.length) this.device.queue.writeBuffer(this.riverBuf, 0, new Float32Array(segs));
  }

  // ------------------------------------------------------------------ public state API
  setQuality(q: Quality) {
    if (q === this.quality) return;
    this.quality = q; this.qd = QUALITY[q];
    if (this.props) { this.props.treeBudget = this.qd.trees; this.props.shadows = this.qd.shadows; }
    this.bake();
    this.resize();
  }

  setMode(mode: MapMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    const src = mode === 'flat' ? this.flatColor : this.polColor;
    for (let i = 0; i < this.N; i++) {
      const o = i * LOC_WORDS;
      this.locU32[o] = src[i]; this.locU32[o + 1] = src[i]; this.locF32[o + 5] = -1;
    }
    this.locDirty = true;
  }

  setLocationColors(rgba: Uint8Array) {
    for (let i = 0; i < this.N; i++) {
      const j = i * 4;
      this.flatColor[i] = j + 3 < rgba.length ? pack(rgba[j], rgba[j + 1], rgba[j + 2], rgba[j + 3]) : 0;
    }
    if (this.mode === 'flat') this.applyColors(this.flatColor);
  }

  setPolitical(owner: Int16Array, ctrl: Int16Array, nationColors: Uint8Array) {
    const nc = (n: number) => pack(nationColors[n * 3] ?? 128, nationColors[n * 3 + 1] ?? 128, nationColors[n * 3 + 2] ?? 128, 255);
    for (let i = 0; i < this.N; i++) {
      const o = i < this.L && i < owner.length ? owner[i] : -1;
      const c = i < this.L && i < ctrl.length ? ctrl[i] : o;
      this.polColor[i] = o >= 0 ? nc(o) : 0;
      const w = i * LOC_WORDS;
      this.locI32[w + 3] = i < this.L ? o : -1;
      let cc = 0;
      if (o >= 0 && c !== o) {
        if (c >= 0) cc = nc(c);
        else if (c === -2) cc = pack(38, 34, 30, 255); // rebels
      }
      this.locU32[w + 2] = cc;
    }
    if (this.mode === 'political') this.applyColors(this.polColor);
    this.locDirty = true;
  }

  private applyColors(src: Uint32Array) {
    for (let i = 0; i < this.N; i++) {
      const o = i * LOC_WORDS;
      if (this.locU32[o] !== src[i]) {
        // keep the old colour as the ink-spread start unless an animation is still running
        if (!(this.locF32[o + 5] >= 0 && this.locF32[o + 5] + 2.5 > this.time)) this.locU32[o + 1] = this.locU32[o];
        this.locU32[o] = src[i];
      }
    }
    this.locDirty = true;
  }

  setSelection(loc: number, highlight: number[] = []) {
    this.selected = loc;
    for (const h of this.highlight) if (h >= 0 && h < this.N) this.locU32[h * LOC_WORDS + 4] &= ~1;
    for (const h of highlight) if (h >= 0 && h < this.N) this.locU32[h * LOC_WORDS + 4] |= 1;
    this.highlight = highlight.slice();
    this.locDirty = true;
  }

  /** Terra incognita: known[i] = 0 marks a location or sea zone the player has not explored (drawn as parchment). */
  setExplored(known: Uint8Array | null) {
    for (let i = 0; i < this.N; i++) {
      const w = i * LOC_WORDS + 4;
      if (known && i < known.length && known[i] === 0) this.locU32[w] |= 2; else this.locU32[w] &= ~2;
    }
    this.locDirty = true;
    this.props?.setExplored(known);
  }

  setSnow(snow: Float32Array) {
    for (let i = 0; i < this.L; i++) this.locF32[i * LOC_WORDS + 6] = i < snow.length ? clamp(snow[i], 0, 1) : 0;
    this.locDirty = true;
  }

  /** the game date: day number and time of year (0 = 1 January, 0.5 = early July) */
  setDate(day: number, yearPhase: number) {
    if (day !== this.gameDay) { this.gameDay = day; this.dayAt = this.time; }
    this.season = yearPhase;
  }

  setLabels(labels: MapLabel[]) { this.overlay.labels = labels; }
  setUnits(units: MapUnit[]) {
    // armies and fleets stand as figures a little beside the town; the counter floats above them when they show.
    // Each host glides to its new place instead of jumping (see stepUnits).
    const slots = new Map<string, number>();
    const figs: UnitProp[] = [];
    const seen = new Set<number>();
    const battles = new Set<string>();
    for (const u of units) if (u.kind === 'battle' && u.lx !== undefined && u.ly !== undefined) battles.add(`${Math.round(u.lx)}:${Math.round(u.ly)}`);
    for (const u of units) {
      if (u.kind !== 'army' && u.kind !== 'fleet') continue;
      const key = `${Math.round(u.x)}:${Math.round(u.y)}:${u.kind}`;
      const slot = slots.get(key) ?? 0; slots.set(key, slot + 1);
      const fleet = u.kind === 'fleet';
      const [fx, fy] = u.moving ? [u.x, u.y] : figureSpot(u.x, u.y, fleet, slot);
      let an = this.unitAnim.get(u.id);
      if (!an || Math.hypot(an.tx - fx, an.ty - fy) > 160) an = { x: fx, y: fy, tx: fx, ty: fy, ox: fx - u.x, oy: fy - u.y, vx: 0, vy: 0, t0: this.time, dur: 1 };
      if (an.tx !== fx || an.ty !== fy) {
        // marching: keep walking at the pace of the last day until the next report comes in
        const dur = clamp(this.time - an.t0, 0.15, 60);
        if (u.moving) { an.vx = (fx - an.tx) / dur; an.vy = (fy - an.ty) / dur; } else { an.vx = 0; an.vy = 0; }
        an.t0 = this.time; an.dur = dur;
      }
      if (!u.moving) { an.vx = 0; an.vy = 0; }
      an.tx = fx; an.ty = fy; an.ox = fx - u.x; an.oy = fy - u.y;
      this.unitAnim.set(u.id, an); seen.add(u.id);
      const heading = fleet && u.moving && u.toX !== undefined && u.toY !== undefined ? Math.atan2(-(u.toX - u.x), -(u.toY - u.y)) : undefined;
      // two hosts in battle face each other
      let facing: number | undefined;
      if (!fleet && !u.moving && slot < 2 && battles.has(`${Math.round(u.x)}:${Math.round(u.y)}`)) {
        const [ox, oy] = figureSpot(u.x, u.y, false, 1 - slot);
        facing = Math.atan2(-(ox - fx), -(oy - fy));
      }
      figs.push({ id: u.id, x: fx, y: fy, men: u.men ?? 1000, fleet, color: u.color, heading, marching: !!u.moving, facing });
    }
    for (const id of [...this.unitAnim.keys()]) if (!seen.has(id)) this.unitAnim.delete(id);
    this.props?.setUnits(figs);
    const scenes: SceneProp[] = [];
    for (const u of units) if ((u.kind === 'siege' || u.kind === 'battle') && u.lx !== undefined && u.ly !== undefined) scenes.push({ id: u.id, x: u.lx, y: u.ly, kind: u.kind, color: u.color, progress: u.progress });
    this.props?.setScenes(scenes);
    this.overlay.units = units;
    this.stepUnits(0);
  }
  /** move every host a little towards its place; the counters follow */
  private stepUnits(dt: number) {
    const k = 1 - Math.exp(-dt * 2.5);
    for (const an of this.unitAnim.values()) {
      const e = Math.min(this.time - an.t0, an.dur);
      const gx = an.tx + an.vx * e, gy = an.ty + an.vy * e;
      an.x += (gx - an.x) * k; an.y += (gy - an.y) * k;
    }
    for (const u of this.overlay.units) {
      const an = this.unitAnim.get(u.id);
      if (!an) continue;
      u.fx = an.x; u.fy = an.y; u.ax = an.x - an.ox; u.ay = an.y - an.oy;
    }
  }
  /** towns and villages drawn as houses (see Props.setSettlements) */
  setSettlements(list: Settlement[]) { this.props?.setSettlements(list); }
  /** the map canvas (for recording) */
  get element(): HTMLCanvasElement { return this.canvas; }
  /** the layer with realm names and counters */
  get overlayElement(): HTMLCanvasElement { return this.overlay.canvas; }
  setLandmarks(l: MapLandmark[]) { this.overlay.landmarks = l; }

  animateOwnerChange(changes: { loc: number; order: number }[], originX: number, originY: number) {
    if (!changes.length) return;
    const g = this.assets.geo;
    let maxD = 0, maxOrder = 0;
    for (const c of changes) {
      if (c.loc < 0 || c.loc >= this.N) continue;
      maxD = Math.max(maxD, Math.hypot(g.loc.x[c.loc] - originX, g.loc.y[c.loc] - originY));
      maxOrder = Math.max(maxOrder, c.order);
    }
    this.inkSpeed = Math.max(60, (maxD + 90) / 1.05);
    const stagger = maxOrder > 0 ? Math.min(0.08, 0.45 / maxOrder) : 0;
    const ox = clamp(Math.round(originX), 0, 65535), oy = clamp(Math.round(originY), 0, 65535);
    for (const c of changes) {
      if (c.loc < 0 || c.loc >= this.N) continue;
      const o = c.loc * LOC_WORDS;
      this.locF32[o + 5] = this.time + c.order * stagger;
      this.locU32[o + 7] = (ox | (oy << 16)) >>> 0;
    }
    this.locDirty = true;
  }

  // ------------------------------------------------------------------ camera

  /** the point of the sea-level plane under a canvas-local css point */
  screenToMap(x: number, y: number): [number, number] {
    return screenToPlane(this.camNow(), x, y);
  }
  /** map point (on the terrain surface) -> canvas-local css point; far off screen when behind the camera */
  mapToScreen(x: number, y: number): [number, number] {
    const c = this.cam3 ?? this.camNow();
    const [sx, sy, w] = project(c, x, y, -this.terrainZ(x, y));
    return w > 0 ? [sx, sy] : [-1e5, -1e5];
  }
  /** a point h map px above the terrain -> canvas-local css point */
  mapToScreenH(x: number, y: number, h: number): [number, number] {
    const c = this.cam3 ?? this.camNow();
    const [sx, sy, w] = project(c, x, y, -this.terrainZ(x, y) - h);
    return w > 0 ? [sx, sy] : [-1e5, -1e5];
  }
  /** css px per map px at a map point (perspective makes distant land smaller) */
  scaleAt(x: number, y: number): number {
    const c = this.cam3 ?? this.camNow();
    const [, , w] = project(c, x, y, -this.terrainZ(x, y));
    return w > 0 ? c.focal / w : this.camera.zoom;
  }

  pick(clientX: number, clientY: number): number {
    const r = this.canvas.getBoundingClientRect();
    const [mx, my] = screenToTerrain(this.camNow(), clientX - r.left, clientY - r.top, (x, y) => this.terrainZ(x, y), this.maxTerrain);
    const x = Math.floor(mx), y = Math.floor(my);
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return -1;
    const id = this.assets.ids[y * this.W + x];
    return id ? id - 1 : -1;
  }

  flyTo(x: number, y: number, zoom?: number) {
    const z1 = clamp(zoom ?? this.camera.zoom, this.minZoom, this.maxZoom);
    const dist = Math.hypot(x - this.camera.x, y - this.camera.y) * Math.min(this.camera.zoom, z1);
    this.fly = { x0: this.camera.x, y0: this.camera.y, z0: this.camera.zoom, x1: x, y1: y, z1, t: 0, dur: clamp(0.5 + dist / 2500, 0.6, 1.6) };
    this.zoomTarget = null;
  }

  /** zoom by factor around a canvas-local css point (smoothed) */
  zoomAt(factor: number, sx: number, sy: number) {
    const cur = this.zoomTarget ?? this.camera.zoom;
    this.zoomTarget = clamp(cur * factor, this.minZoom, this.maxZoom);
    this.zoomAnchor = [sx, sy];
    this.fly = null;
  }

  private clampCamera() {
    const c = this.camera;
    c.zoom = clamp(c.zoom, this.minZoom, this.maxZoom);
    const hw = this.cssW / 2 / c.zoom, hh = this.cssH / 2 / c.zoom;
    const fx = (lo: number, hi: number, half: number, v: number) => (hi - lo < 2 * half ? (lo + hi) / 2 : clamp(v, lo + half * 0.15, hi - half * 0.15));
    c.x = fx(0, this.W, hw, c.x); c.y = fx(0, this.H, hh, c.y);
  }

  private lastCam = { x: NaN, y: NaN, zoom: NaN };

  private updateCamera(dt: number) {
    const c = this.camera;
    // the UI wrote the camera directly: drop running animations
    const lc = this.lastCam;
    if (!Number.isNaN(lc.x) && (c.x !== lc.x || c.y !== lc.y || c.zoom !== lc.zoom) && !this.dragging) { this.fly = null; this.zoomTarget = null; }
    if (this.fly) {
      const f = this.fly;
      f.t += dt / f.dur;
      const t = smooth(clamp(f.t, 0, 1));
      c.x = f.x0 + (f.x1 - f.x0) * t; c.y = f.y0 + (f.y1 - f.y0) * t;
      // zoom out a bit in the middle of long flights
      const dist = Math.hypot(f.x1 - f.x0, f.y1 - f.y0);
      const dip = Math.min(0.6, (dist * Math.min(f.z0, f.z1)) / 4000);
      c.zoom = Math.exp(Math.log(f.z0) + (Math.log(f.z1) - Math.log(f.z0)) * t) * (1 - dip * Math.sin(Math.PI * t));
      if (f.t >= 1) this.fly = null;
    }
    if (this.zoomTarget !== null) {
      const [ax, ay] = this.zoomAnchor;
      const [mx, my] = this.screenToMap(ax, ay);
      const k = 1 - Math.exp(-dt * 14);
      const lz = Math.log(c.zoom) + (Math.log(this.zoomTarget) - Math.log(c.zoom)) * k;
      c.zoom = Math.exp(lz);
      if (Math.abs(lz - Math.log(this.zoomTarget)) < 0.002) { c.zoom = this.zoomTarget; this.zoomTarget = null; }
      // keep the point under the cursor in place (the camera tilts as it zooms, so measure again)
      const [nx, ny] = this.screenToMap(ax, ay);
      c.x += mx - nx; c.y += my - ny;
    }
    let vx = 0, vy = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) vx -= 1;
    if (k.has('d') || k.has('arrowright')) vx += 1;
    if (k.has('w') || k.has('arrowup')) vy -= 1;
    if (k.has('s') || k.has('arrowdown')) vy += 1;
    if (this.edgePan && this.mouse) {
      const [mx, my] = this.mouse, m = 14;
      if (mx < m) vx -= 1; else if (mx > this.cssW - m) vx += 1;
      if (my < m) vy -= 1; else if (my > this.cssH - m) vy += 1;
    }
    if (vx || vy) {
      const sp = 750 / c.zoom; // css px per second
      c.x += vx * sp * dt; c.y += vy * sp * dt;
      this.fly = null;
    }
    this.clampCamera();
    lc.x = c.x; lc.y = c.y; lc.zoom = c.zoom;
  }

  // ------------------------------------------------------------------ input
  private dragging = false;
  attachControls(canvas: HTMLCanvasElement = this.canvas): () => void {
    let down: { x: number; y: number; cx: number; cy: number; moved: boolean; id: number } | null = null;
    const pointers = new Map<number, [number, number]>();
    let pinch: { d: number; z: number } | null = null;
    const local = (e: MouseEvent): [number, number] => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: this.camera.zoom };
        down = null; return;
      }
      if (e.button !== 0) return;
      canvas.setPointerCapture?.(e.pointerId);
      const [lx, ly] = local(e);
      const [ax, ay] = this.screenToMap(lx, ly);
      down = { x: e.clientX, y: e.clientY, cx: ax, cy: ay, moved: false, id: e.pointerId };
      this.fly = null; this.dragging = true;
    };
    const onMove = (e: PointerEvent) => {
      this.mouse = local(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const r = canvas.getBoundingClientRect();
        const mx = (a[0] + b[0]) / 2 - r.left, my = (a[1] + b[1]) / 2 - r.top;
        this.zoomTarget = clamp(pinch.z * (d / Math.max(1, pinch.d)), this.minZoom, this.maxZoom); this.zoomAnchor = [mx, my];
        return;
      }
      if (down && down.id === e.pointerId) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!down.moved && Math.hypot(dx, dy) > 4) down.moved = true;
        if (down.moved) {
          // the map point grabbed at pointer-down stays under the pointer
          const [lx, ly] = local(e);
          const [nx, ny] = this.screenToMap(lx, ly);
          this.camera.x += down.cx - nx; this.camera.y += down.cy - ny;
          this.zoomTarget = null;
          return;
        }
      }
      const loc = this.pick(e.clientX, e.clientY);
      if (loc !== this.hover) { this.hover = loc; this.onHover?.(loc); }
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (down && down.id === e.pointerId) {
        if (!down.moved && e.button === 0) this.onClick?.(this.pick(e.clientX, e.clientY), e);
        down = null; this.dragging = false;
      }
    };
    const onLeave = () => { this.mouse = null; if (this.hover !== -1) { this.hover = -1; this.onHover?.(-1); } };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const [sx, sy] = local(e);
      this.zoomAt(Math.exp(-clamp(dy, -400, 400) * 0.0018), sx, sy);
    };
    const onCtx = (e: MouseEvent) => { e.preventDefault(); this.onRightClick?.(this.pick(e.clientX, e.clientY), e); };
    const typing = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
    const PAN = new Set(['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown']);
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (PAN.has(k)) { this.keys.add(k); e.preventDefault(); }
      else if (k === '+' || k === '=') this.zoomAt(1.4, this.cssW / 2, this.cssH / 2);
      else if (k === '-') this.zoomAt(1 / 1.4, this.cssW / 2, this.cssH / 2);
    };
    const onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    const onBlur = () => this.keys.clear();
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onCtx);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.style.touchAction = 'none';
    const detach = () => {
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave); canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onCtx);
      window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur);
    };
    this.detachFns.push(detach);
    return detach;
  }

  // ------------------------------------------------------------------ frame
  resize() {
    const cssW = Math.max(1, this.canvas.clientWidth || this.canvas.width);
    const cssH = Math.max(1, this.canvas.clientHeight || this.canvas.height);
    this.cssW = cssW; this.cssH = cssH;
    const dpr = window.devicePixelRatio || 1;
    const pr = Math.min(dpr, this.qd.dprCap) * this.qd.scale;
    const w = Math.max(1, Math.round(cssW * pr)), h = Math.max(1, Math.round(cssH * pr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.pxRatio = w / cssW;
    if (!this.riverTex || this.riverTex.width !== w || this.riverTex.height !== h) {
      this.riverTex?.destroy();
      this.riverTex = this.device.createTexture({ size: [w, h], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      this.mainBG = null;
    }
    if (!this.gbufTex || this.gbufTex.width !== w || this.gbufTex.height !== h) {
      this.gbufTex?.destroy(); this.depthTex?.destroy();
      this.gbufTex = this.device.createTexture({ size: [w, h], format: 'rgba32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      this.depthTex = this.device.createTexture({ size: [w, h], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      this.mainBG = null;
    }
    this.minZoom = Math.min(0.5, Math.max(cssW / this.W, cssH / this.H) * 0.9);
    this.overlay.layout(this.canvas, cssW, cssH);
  }

  private writeUniforms() {
    const u = this.uniforms, c = this.camera, q = this.qd;
    const z = c.zoom, pr = this.pxRatio;
    const W = this.canvas.width, H = this.canvas.height;
    u[0] = W; u[1] = H; u[2] = 1 / (z * pr); u[3] = z;
    u[4] = c.x; u[5] = c.y; u[6] = this.time; u[7] = pr;
    const lz = clamp((Math.log2(z) + 1.5) / 4.5, 0, 1); // 0 at zoom ~0.35, 1 at zoom ~8
    // close in, the land itself shows through: the realm's colour becomes a wash with a strong band at the border
    const polA = 0.82 - 0.56 * smooth(lz), flatA = 0.9 - 0.35 * smooth(lz);
    u[8] = this.W; u[9] = this.H; u[10] = this.L; u[11] = this.mode === 'flat' ? flatA : polA;
    u[12] = this.mode === 'political' ? 0 : this.mode === 'terrain' ? 1 : 2; u[13] = this.selected; u[14] = this.hover; u[15] = q.q;
    u[16] = this.inkSpeed; u[17] = z >= 1.5 ? 1 : 0; u[18] = q.waves; u[19] = q.rings.length;
    for (let i = 0; i < 4; i++) u[20 + i] = q.rings[i] ?? 0;
    const cam = (this.cam3 = this.camNow());
    u[24] = cam.eye[0]; u[25] = cam.eye[1]; u[26] = cam.eye[2]; u[27] = cam.dist;
    u[28] = H_SCALE; u[29] = cam.focal; u[30] = cam.pitch; u[31] = this.props?.enabled && this.qd.trees > 0 ? 1 : 0;
    u.set(cam.vp, 32);
    // weather drifts on smoothly between the daily updates
    const dayF = this.gameDay + clamp((this.time - this.dayAt) / 1.2, 0, 1) - 1;
    u[48] = this.season; u[49] = dayF; u[50] = this.qd.q >= 1 ? 1 : 0; u[51] = 0;
    this.device.queue.writeBuffer(this.uniformBuf, 0, u);
    this.updateChunks(cam);
  }

  private encodeFrame(enc: GPUCommandEncoder, target: GPUTexture) {
    if (!this.mainBG) {
      this.mainBG = this.device.createBindGroup({
        layout: this.mainPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuf } },
          { binding: 1, resource: { buffer: this.locBuf } },
          { binding: 2, resource: this.idTex.createView() },
          { binding: 3, resource: this.terrainTex.createView() },
          { binding: 4, resource: this.auxTex.createView() },
          { binding: 5, resource: this.riverTex!.createView() },
          { binding: 6, resource: this.sampler },
          { binding: 7, resource: this.coastTex.createView() },
          { binding: 8, resource: this.gbufTex!.createView() },
          { binding: 9, resource: this.biomeTex.createView() },
          { binding: 10, resource: this.heightF.createView() },
        ],
      });
    }
    // 1) terrain mesh -> map position per pixel + depth
    const tp = enc.beginRenderPass({
      colorAttachments: [{ view: this.gbufTex!.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
      depthStencilAttachment: { view: this.depthTex!.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    tp.setPipeline(this.terrainPipe); tp.setBindGroup(0, this.terrainBG); tp.setVertexBuffer(1, this.instBuf);
    let first = 0;
    for (let l = 0; l <= MAX_LOD; l++) {
      const n = this.lodCounts[l] ?? 0;
      if (n) { tp.setVertexBuffer(0, this.lodVB[l]); tp.setIndexBuffer(this.lodIB[l], 'uint32'); tp.drawIndexed(this.lodIdx[l], n, 0, 0, first); }
      first += n;
    }
    tp.end();
    // 2) rivers draped on the terrain (hidden behind mountains)
    const rp = enc.beginRenderPass({
      colorAttachments: [{ view: this.riverTex!.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
      depthStencilAttachment: { view: this.depthTex!.createView(), depthLoadOp: 'load', depthStoreOp: 'store', depthReadOnly: false },
    });
    if (this.riverCount) { rp.setPipeline(this.riverPipe); rp.setBindGroup(0, this.riverBG); rp.setVertexBuffer(0, this.riverBuf); rp.draw(6, this.riverCount); }
    if (this.roadCount && this.roadBuf && this.camera.zoom > 1.2) { rp.setPipeline(this.roadPipe); rp.setBindGroup(0, this.riverBG); rp.setVertexBuffer(0, this.roadBuf); rp.draw(6, this.roadCount); }
    rp.end();
    const mp = enc.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    mp.setPipeline(this.mainPipe); mp.setBindGroup(0, this.mainBG); mp.draw(3); mp.end();
    // 4) trees, towns, armies and fleets standing on the terrain
    if (this.props?.enabled) {
      const cam = this.cam3;
      const pp = enc.beginRenderPass({
        colorAttachments: [{ view: target.createView(), loadOp: 'load', storeOp: 'store' }],
        depthStencilAttachment: { view: this.depthTex!.createView(), depthLoadOp: 'load', depthStoreOp: 'store' },
      });
      this.props.draw(pp, cam, (x, y, z) => { const w = project(cam, x, y, -z)[2]; return w > 0 ? cam.focal / w : 0; });
      pp.end();
    }
  }

  private overlayView() {
    return {
      toScreen: (x: number, y: number) => this.mapToScreen(x, y), scaleAt: (x: number, y: number) => this.scaleAt(x, y),
      toScreenH: (x: number, y: number, h: number) => this.mapToScreenH(x, y, h),
      toScreenZ: (x: number, y: number, z: number) => { const c = this.cam3 ?? this.camNow(); const [sx, sy, w] = project(c, x, y, -z); return (w > 0 ? [sx, sy] : [-1e5, -1e5]) as [number, number]; },
      heightAt: (x: number, y: number) => this.terrainZ(x, y),
      figuresFrom: this.props?.enabled ? SHOW_UNITS * 1.25 : Infinity,
      zoom: this.camera.zoom, cssW: this.cssW, cssH: this.cssH, time: this.time,
    };
  }

  render(dtMs: number) {
    if (this.destroyed) return;
    const t0 = performance.now();
    const dt = clamp(dtMs / 1000, 0, 0.1);
    this.time += dt;
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    if ((cw && cw !== this.cssW) || (ch && ch !== this.cssH)) this.resize();
    this.updateCamera(dt);
    this.stepUnits(dt);
    this.writeUniforms();
    if (this.locDirty) { this.device.queue.writeBuffer(this.locBuf, 0, this.locData); this.locDirty = false; }
    const enc = this.device.createCommandEncoder();
    this.encodeFrame(enc, this.ctx.getCurrentTexture());
    this.device.queue.submit([enc.finish()]);
    this.overlay.draw(this.overlayView());
    this.onFrame?.();
    this.stats.frameMs = performance.now() - t0;
  }

  start() {
    if (this.raf || this.destroyed) return;
    this.lastT = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = t - this.lastT; this.lastT = t;
      this.stats.intervalMs = this.stats.intervalMs ? this.stats.intervalMs * 0.9 + dt * 0.1 : dt;
      this.render(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }

  /** waits until the GPU finished all submitted work (for tests/benchmarks) */
  async idle() { await this.device.queue.onSubmittedWorkDone(); }

  async screenshot(): Promise<Blob> {
    const cv = await this.captureCanvas();
    return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
  }

  /** The current view (map and overlay) rendered into a 2D canvas, for screenshots and videos. */
  async captureCanvas(maxScale = 2): Promise<HTMLCanvasElement> {
    const d = this.device;
    const w = this.canvas.width, h = this.canvas.height;
    this.writeUniforms();
    if (this.locDirty) { d.queue.writeBuffer(this.locBuf, 0, this.locData); this.locDirty = false; }
    const tex = d.createTexture({ size: [w, h], format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const bpr = Math.ceil((w * 4) / 256) * 256;
    const buf = d.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = d.createCommandEncoder();
    this.encodeFrame(enc, tex);
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr }, [w, h]);
    d.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange());
    const out = new Uint8ClampedArray(w * h * 4);
    const bgra = this.format === 'bgra8unorm';
    for (let y = 0; y < h; y++) {
      const so = y * bpr, dO = y * w * 4;
      for (let x = 0; x < w * 4; x += 4) {
        out[dO + x] = src[so + x + (bgra ? 2 : 0)]; out[dO + x + 1] = src[so + x + 1];
        out[dO + x + 2] = src[so + x + (bgra ? 0 : 2)]; out[dO + x + 3] = 255;
      }
    }
    buf.unmap(); buf.destroy(); tex.destroy();
    const scale = Math.min(window.devicePixelRatio || 1, maxScale);
    const cv = document.createElement('canvas');
    cv.width = Math.round(this.cssW * scale); cv.height = Math.round(this.cssH * scale);
    const c2 = cv.getContext('2d')!;
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    tmp.getContext('2d')!.putImageData(new ImageData(out, w, h), 0, 0);
    c2.imageSmoothingQuality = 'high';
    c2.drawImage(tmp, 0, 0, cv.width, cv.height);
    this.overlay.drawTo(c2, this.overlayView(), scale);
    return cv;
  }

  destroy() {
    if (this.destroyed) return;
    this.stop();
    this.destroyed = true;
    for (const f of this.detachFns) f();
    this.overlay.destroy();
    this.props?.destroy();
    for (const t of [this.idTex, this.heightInt, this.heightF, this.biomeTex, this.albedoTex, this.coastTex, this.terrainTex, this.auxTex, this.riverTex, this.gbufTex, this.depthTex]) t?.destroy();
    this.uniformBuf?.destroy(); this.locBuf?.destroy(); this.riverBuf?.destroy(); this.roadBuf?.destroy(); this.instBuf?.destroy(); this.terrainUB?.destroy();
    for (const b of [...this.lodVB, ...this.lodIB]) b.destroy();
    this.ctx?.unconfigure();
    this.device?.destroy();
  }
}
