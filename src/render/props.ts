// 3D props on the map: forests, towns and the armies and fleets, drawn as instanced meshes on the terrain.
// Meshes come from public/models (built with Blender, tools/models); until they load, simple built-in shapes stand in.
import type { MapAssets } from './assets';
import type { Cam3 } from './camera3d';

export interface ModelMesh { vertexOffset: number; vertexCount: number; indexOffset: number; indexCount: number; height: number; radius: number }
export interface ModelSet { meshes: Record<string, ModelMesh>; vertices: Float32Array; indices: Uint32Array }

/** an instance: map position, height (world px, up), scale, rotation, nation colour (0xRRGGBB, -1 = none) */
interface Inst { x: number; y: number; z: number; s: number; r: number; c: number; wind?: number }
interface Run { mesh: string; first: number; count: number }

const STRIDE = 8; // floats per instance: x, y, z, scale, rot, colour(bits), wind, _
const CHUNK = 128; // map px per chunk (trees and towns)
const TREE_STEP = 1.5; // map px between tree slots
/** size of the figures in map px per model unit */
const S_TREE = 0.95, S_HOUSE = 1.15, S_SOLDIER = 2.0, S_SHIP = 1.7;
/** css px per map px from which each kind is drawn */
export const SHOW_TREES = 4.2, SHOW_TOWNS = 3.6, SHOW_UNITS = 2.6;
/** figures grow from nothing at SHOW_x to full size at SHOW_x * GROW */
const GROW = 1.4;

function hash(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (t: number) => t * t * (3 - 2 * t);

export const PROPS_WGSL = /* wgsl */ `
struct U { view: vec4f, cam: vec4f, map: vec4f, misc: vec4f, misc2: vec4f, rings: vec4f, eye: vec4f, ex: vec4f, vp: mat4x4f, env: vec4f };
@group(0) @binding(0) var<uniform> U0: U;
// the locations (12 words each, word 6 = snow) and the id raster, for snow on roofs and trees
@group(0) @binding(1) var<storage, read> locw: array<u32>;
@group(0) @binding(2) var idTex: texture_2d<u32>;
struct VO { @builtin(position) pos: vec4f, @location(0) col: vec3f, @location(1) n: vec3f, @location(2) w: vec3f, @location(3) h: f32, @location(4) snow: f32 };

fn snowAt(x: f32, y: f32) -> f32 {
  let d = vec2i(textureDimensions(idTex));
  let id = textureLoad(idTex, clamp(vec2i(i32(x), i32(y)), vec2i(0), d - 1), 0).r;
  if (id == 0u || f32(id) > U0.map.z) { return 0.0; }
  return bitcast<f32>(locw[(id - 1u) * 12u + 6u]);
}
fn h1(x: f32) -> f32 { return fract(sin(x * 12.9898) * 43758.5453); }
// light from the north-west, as on the terrain (east, south, up)
const SUN = vec3f(-0.62, -0.78, 0.95);

// ib.w: css px per map px from which the figure shows; it grows to full size over the next 40 %.
// ib.z >= 1 marks a tree and its rank (fract): forests thin out with distance, the highest ranks go first; ib.z >= 3: it sheds its leaves.
fn grow(ia: vec4f, ib: vec4f) -> f32 {
  let base = U0.vp * vec4f(ia.x, ia.y, -ia.z, 1.0);
  let sc = U0.ex.y / max(base.w, 1e-3);
  var g = smoothstep(ib.w, ib.w * ${GROW}, sc);
  if (ib.z >= 1.0) {
    let frac = 0.14 + 0.86 * smoothstep(0.0, 1.0, (sc - ib.w) / 4.5);
    let rank = fract(ib.z);
    g *= smoothstep(rank, rank + 0.06, frac);
  }
  return g;
}

fn place(pos: vec3f, ia: vec4f, ib: vec4f) -> vec3f {
  let c = cos(ib.x); let s = sin(ib.x);
  var mp = pos * ia.w * grow(ia, ib);
  // on the march: a steady bob (soldiers step, ships ride the swell)
  if (ib.z < -0.5) { mp.z += abs(sin(U0.cam.z * 6.0 + ia.x * 3.1 + ia.y * 1.7)) * 0.06 * ia.w; }
  // trees lean a little in the wind (more at the top)
  let sway = sin(U0.cam.z * 1.3 + ia.x * 0.37 + ia.y * 0.21) * 0.035 * step(1.0, ib.z) * pos.z;
  mp.x += sway * ia.w;
  let rx = c * mp.x - s * mp.y; let ry = s * mp.x + c * mp.y;
  return vec3f(ia.x + rx, ia.y - ry, ia.z + mp.z); // map x, map y, height
}

@vertex fn vs(@location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) vcol: vec3f, @location(3) tint: f32,
              @location(4) ia: vec4f, @location(5) ib: vec4f) -> VO {
  let c = cos(ib.x); let s = sin(ib.x);
  let p = place(pos, ia, ib);
  let world = vec3f(p.x, p.y, -p.z);
  let nx = c * nrm.x - s * nrm.y; let ny = s * nrm.x + c * nrm.y;
  var o: VO;
  o.pos = U0.vp * vec4f(world, 1.0);
  let cu = bitcast<u32>(ib.y);
  var colr = vcol;
  if (tint > 0.5 && cu != 0xffffffffu) {
    let nc = vec3f(f32((cu >> 16u) & 255u), f32((cu >> 8u) & 255u), f32(cu & 255u)) / 255.0;
    colr = mix(nc, vcol * nc * 1.25, 0.35);
  }
  // leaves through the year: fresh in spring, red and gold in autumn, bare in winter
  let leaf = vcol.g > vcol.r * 1.12 && vcol.g > vcol.b * 1.2;
  if (ib.z >= 3.0 && leaf && U0.env.z > 0.5) {
    let ph = U0.env.x;
    let lat = ia.y / U0.map.y;
    let k = h1(ia.x * 0.13 + ia.y * 0.71);
    let autumn = smoothstep(0.7 + k * 0.04, 0.78 + k * 0.04, ph) * (1.0 - smoothstep(0.88, 0.93, ph));
    let bare = (1.0 - smoothstep(0.22, 0.3, ph) + smoothstep(0.9, 0.96, ph)) * (1.0 - smoothstep(0.6, 0.7, lat));
    let spring = smoothstep(0.26, 0.32, ph) * (1.0 - smoothstep(0.42, 0.5, ph));
    let fall = mix(vec3f(0.72, 0.36, 0.12), vec3f(0.80, 0.62, 0.16), k);
    colr = mix(colr, colr * vec3f(1.1, 1.18, 0.9), spring);
    colr = mix(colr, fall * (0.8 + 0.3 * vcol.g / 0.4), autumn * (1.0 - smoothstep(0.62, 0.72, lat)));
    colr = mix(colr, vec3f(0.36, 0.31, 0.27), bare * 0.85);
  }
  o.col = colr;
  // snow on roofs and branches where the location lies under snow
  o.snow = clamp(snowAt(ia.x, ia.y) * 1.4 - 0.15, 0.0, 1.0) * smoothstep(0.25, 0.65, nrm.z) * step(0.15, pos.z);
  o.n = vec3f(nx, -ny, nrm.z); // east, south, up
  o.w = world;
  o.h = pos.z / max(1e-3, ib.w);
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let n = normalize(i.n);
  let sun = normalize(SUN);
  let dif = max(dot(n, sun), 0.0);
  let sky = 0.5 + 0.5 * n.z;
  let base = mix(i.col, vec3f(0.95, 0.96, 1.0), i.snow * 0.85);
  // the camera looks north, so most visible walls face away from the north-west sun: a soft fill light from the south
  let fill = max(dot(n, normalize(vec3f(0.3, 0.9, 0.5))), 0.0);
  var col = base * (0.3 * sky + 0.34 + 0.62 * dif + 0.26 * fill);
  // darker where the figure meets the ground
  col *= mix(0.62, 1.0, smoothstep(0.0, 0.35, i.h));
  // the same blue haze as the land at a distance
  let tilt = sin(U0.ex.z);
  let d = length(U0.eye.xyz - i.w);
  let haze = smoothstep(U0.eye.w * 1.05, U0.eye.w * 2.6, d) * tilt;
  col = mix(col, vec3f(0.62, 0.69, 0.75), haze * 0.55);
  return vec4f(col, 1.0);
}

// shadows: the figure flattened onto the ground along the sun, multiplied into the map
struct SO { @builtin(position) pos: vec4f };
@vertex fn vs_shadow(@location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) vcol: vec3f, @location(3) tint: f32,
                     @location(4) ia: vec4f, @location(5) ib: vec4f) -> SO {
  let p = place(pos, ia, ib);
  let up = max(0.0, p.z - ia.z);
  let sh = vec2f(-SUN.x, -SUN.y) / SUN.z * up;
  var o: SO;
  o.pos = U0.vp * vec4f(p.x + sh.x, p.y + sh.y, -(ia.z + 0.04), 1.0);
  return o;
}
@fragment fn fs_shadow() -> @location(0) vec4f { return vec4f(0.76, 0.78, 0.84, 1.0); }
`;

/** simple stand-in meshes (until the Blender models are loaded) */
export function builtinModels(): ModelSet {
  const verts: number[] = [], idx: number[] = [];
  const meshes: Record<string, ModelMesh> = {};
  let cur = { v0: 0, i0: 0 };
  const begin = () => { cur = { v0: verts.length / 10, i0: idx.length }; };
  const tri = (a: number[], b: number[], c: number[], col: number[], tint = 0) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const base = verts.length / 10 - cur.v0;
    for (const p of [a, b, c]) verts.push(p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2], tint);
    idx.push(base, base + 1, base + 2);
  };
  const cone = (cx: number, cy: number, z0: number, z1: number, r: number, n: number, col: number[], tint = 0) => {
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      tri([cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z0], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z0], [cx, cy, z1], col, tint);
    }
  };
  // rounded crown: two stacked rings and a cap
  const crown = (z0: number, z1: number, r: number, n: number, col: number[]) => {
    const zm = z0 + (z1 - z0) * 0.45;
    const ring = (z: number, rr: number, k: number, ph: number) => [Math.cos((k / n) * Math.PI * 2 + ph) * rr, Math.sin((k / n) * Math.PI * 2 + ph) * rr, z];
    const lo = col, mid = [col[0] * 1.12, col[1] * 1.12, col[2] * 1.1], hi = [col[0] * 1.25, col[1] * 1.25, col[2] * 1.2];
    for (let k = 0; k < n; k++) {
      const a = ring(z0, r * 0.55, k, 0), b = ring(z0, r * 0.55, k + 1, 0), c = ring(zm, r, k, 0.3), d = ring(zm, r, k + 1, 0.3);
      tri(a, b, d, lo); tri(a, d, c, lo);
      tri(c, d, [0, 0, z1], k % 2 ? mid : hi);
      tri(b, a, [0, 0, z0], lo);
    }
  };
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: number[], tint = 0) => {
    const P = (i: number) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
    const faces = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
    for (const f of faces) { tri(P(f[0]), P(f[1]), P(f[2]), col, tint); tri(P(f[0]), P(f[2]), P(f[3]), col, tint); }
  };
  const roof = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, col: number[]) => {
    const ym = (y0 + y1) / 2;
    tri([x0, y0, z0], [x1, y0, z0], [x1, ym, z1], col); tri([x0, y0, z0], [x1, ym, z1], [x0, ym, z1], col);
    tri([x1, y1, z0], [x0, y1, z0], [x0, ym, z1], col); tri([x1, y1, z0], [x0, ym, z1], [x1, ym, z1], col);
    tri([x0, y0, z0], [x0, ym, z1], [x0, y1, z0], col); tri([x1, y1, z0], [x1, ym, z1], [x1, y0, z0], col);
  };
  const end = (name: string, _height: number, radius: number) => {
    // the true height (spears and masts stand above the body)
    let height = 0;
    for (let v = cur.v0; v < verts.length / 10; v++) height = Math.max(height, verts[v * 10 + 2]);
    meshes[name] = { vertexOffset: cur.v0, vertexCount: verts.length / 10 - cur.v0, indexOffset: cur.i0, indexCount: idx.length - cur.i0, height, radius };
  };
  const trunk = [0.32, 0.22, 0.14];
  for (const [name, g, h] of [['tree_conifer_a', [0.11, 0.22, 0.13], 1.9], ['tree_conifer_b', [0.14, 0.26, 0.15], 1.6]] as const) {
    begin(); box(-0.06, -0.06, 0, 0.06, 0.06, 0.3, trunk);
    cone(0, 0, 0.22, h * 0.62, 0.46, 7, [...g]); cone(0, 0, h * 0.4, h * 0.85, 0.36, 7, [g[0] * 1.12, g[1] * 1.12, g[2] * 1.1]); cone(0, 0, h * 0.68, h, 0.22, 7, [g[0] * 1.25, g[1] * 1.25, g[2] * 1.2]);
    end(name, h, 0.46);
  }
  for (const [name, g, h] of [['tree_broadleaf_a', [0.2, 0.33, 0.14], 1.5], ['tree_broadleaf_b', [0.27, 0.38, 0.15], 1.3], ['bush', [0.28, 0.36, 0.17], 0.55]] as const) {
    begin(); box(-0.07, -0.07, 0, 0.07, 0.07, h * 0.45, trunk); crown(h * 0.3, h, 0.55 * (h / 1.5) + 0.08, 7, [...g]); end(name, h, 0.55);
  }
  begin(); box(-0.05, -0.05, 0, 0.05, 0.05, 1.6, trunk); cone(0, 0, 1.75, 1.35, 0.6, 6, [0.3, 0.45, 0.18]); end('tree_palm', 1.75, 0.6);
  const wall = [0.84, 0.78, 0.66], red = [0.6, 0.27, 0.2], grey = [0.6, 0.58, 0.55], white = [0.92, 0.9, 0.84], slate = [0.32, 0.31, 0.33];
  begin(); box(-0.4, -0.3, 0, 0.4, 0.3, 0.55, wall); box(-0.42, -0.04, 0.12, 0.42, 0.04, 0.5, [0.38, 0.27, 0.18]); roof(-0.44, -0.34, 0.44, 0.34, 0.55, 1.1, red); end('house_timber', 1.1, 0.5);
  begin(); box(-0.45, -0.35, 0, 0.45, 0.35, 0.65, grey); roof(-0.47, -0.37, 0.47, 0.37, 0.65, 1.1, slate); end('house_stone', 1.1, 0.55);
  begin(); box(-0.45, -0.35, 0, 0.45, 0.35, 0.6, white); roof(-0.47, -0.37, 0.47, 0.37, 0.6, 0.8, [0.74, 0.4, 0.26]); end('house_mediterranean', 0.8, 0.55);
  begin(); cone(0, 0, 0, 0.42, 0.52, 9, [0.86, 0.82, 0.7]); cone(0, 0, 0.4, 0.75, 0.52, 9, [0.78, 0.72, 0.6]); end('house_steppe_yurt', 0.75, 0.52);
  begin(); box(-0.9, -0.35, 0, 0.5, 0.35, 0.9, grey); roof(-0.92, -0.37, 0.52, 0.37, 0.9, 1.45, slate); box(0.5, -0.25, 0, 1.0, 0.25, 2.2, grey); cone(0.75, 0, 2.2, 3.2, 0.32, 4, slate); end('church_gothic', 3.2, 1.0);
  begin(); box(-0.7, -0.7, 0, 0.7, 0.7, 0.8, white); cone(0, 0, 0.8, 1.55, 0.66, 10, [0.55, 0.66, 0.6]); box(0.8, 0.5, 0, 1.0, 0.7, 2.4, white); cone(0.9, 0.6, 2.4, 2.85, 0.13, 6, [0.55, 0.66, 0.6]); end('mosque', 2.85, 1.1);
  begin(); box(-1.6, -1.6, 0, 1.6, -1.3, 1.0, grey); box(-1.6, 1.3, 0, 1.6, 1.6, 1.0, grey); box(-1.6, -1.6, 0, -1.3, 1.6, 1.0, grey); box(1.3, -1.6, 0, 1.6, 1.6, 1.0, grey);
  for (const [x, y] of [[-1.45, -1.45], [1.45, -1.45], [-1.45, 1.45], [1.45, 1.45]]) { box(x - 0.3, y - 0.3, 0, x + 0.3, y + 0.3, 1.4, grey); cone(x, y, 1.4, 1.9, 0.38, 6, slate); }
  box(-0.6, -0.6, 0, 0.6, 0.6, 2.2, grey); box(-0.05, -0.05, 2.2, 0.05, 0.05, 2.9, trunk); box(0.05, -0.01, 2.55, 0.6, 0.01, 2.9, [0.8, 0.8, 0.8], 1); end('castle', 2.9, 2.2);
  // soldier: legs, body with tabard (tinted), head, helmet, weapon
  const skin = [0.85, 0.66, 0.52], steel = [0.62, 0.64, 0.68], dark = [0.25, 0.22, 0.2];
  const soldier = (name: string, extra: () => void) => {
    begin(); box(-0.12, -0.06, 0, -0.02, 0.06, 0.42, dark); box(0.02, -0.06, 0, 0.12, 0.06, 0.42, dark);
    box(-0.17, -0.1, 0.42, 0.17, 0.1, 0.78, [0.82, 0.82, 0.82], 1); box(-0.08, -0.08, 0.78, 0.08, 0.08, 0.95, skin); cone(0, 0, 0.93, 1.05, 0.11, 6, steel);
    extra(); end(name, 1.05, 0.3);
  };
  soldier('soldier_infantry', () => { box(0.2, -0.02, 0.2, 0.24, 0.02, 1.4, trunk); cone(0.22, 0, 1.4, 1.55, 0.04, 4, steel); box(-0.26, -0.12, 0.4, -0.2, 0.12, 0.8, [0.8, 0.8, 0.8], 1); });
  soldier('soldier_pikeman', () => { box(0.2, -0.02, 0.2, 0.23, 0.02, 2.0, trunk); cone(0.215, 0, 2.0, 2.15, 0.035, 4, steel); });
  soldier('soldier_archer', () => { box(0.2, -0.02, 0.4, 0.23, 0.02, 1.1, trunk); });
  soldier('soldier_musketeer', () => { box(0.18, -0.02, 0.3, 0.22, 0.02, 1.15, dark); });
  begin();
  box(-0.18, -0.6, 0.45, 0.18, 0.6, 0.85, [0.45, 0.32, 0.22]); for (const [x, y] of [[-0.12, -0.45], [0.12, -0.45], [-0.12, 0.45], [0.12, 0.45]]) box(x - 0.05, y - 0.05, 0, x + 0.05, y + 0.05, 0.5, [0.38, 0.27, 0.18]);
  box(-0.08, 0.55, 0.75, 0.08, 0.85, 1.05, [0.45, 0.32, 0.22]); box(-0.2, -0.62, 0.55, 0.2, 0.62, 0.8, [0.8, 0.8, 0.8], 1);
  box(-0.13, -0.08, 0.85, 0.13, 0.08, 1.25, [0.8, 0.8, 0.8], 1); box(-0.07, -0.06, 1.25, 0.07, 0.06, 1.4, skin); cone(0, 0, 1.38, 1.52, 0.09, 6, steel);
  box(0.16, -0.02, 1.0, 0.19, 1.4, 1.04, trunk);
  end('soldier_cavalry', 1.52, 0.8);
  begin(); box(-0.06, -0.6, 0.25, 0.06, 0.6, 0.37, [0.3, 0.3, 0.32]); box(-0.25, -0.3, 0, 0.25, 0.3, 0.3, [0.4, 0.28, 0.18]); end('cannon', 0.4, 0.6);
  begin(); box(-0.025, -0.025, 0, 0.025, 0.025, 2.0, trunk); box(0.03, -0.01, 1.35, 0.75, 0.01, 1.95, [0.8, 0.8, 0.8], 1); end('banner_standard', 2.0, 0.75);
  const hull = [0.42, 0.3, 0.2];
  const ship = (name: string, masts: number, len: number) => {
    begin(); box(-0.35, -len / 2, -0.15, 0.35, len / 2, 0.3, hull); box(-0.3, len / 2 - 0.45, 0.3, 0.3, len / 2, 0.55, hull); box(-0.3, -len / 2, 0.3, 0.3, -len / 2 + 0.45, 0.6, hull);
    for (let m = 0; m < masts; m++) { const y = (m - (masts - 1) / 2) * len * 0.28; box(-0.03, y - 0.03, 0.3, 0.03, y + 0.03, 2.0, trunk); box(-0.45, y - 0.02, 0.9, 0.45, y + 0.02, 1.8, [0.85, 0.83, 0.78], 1); }
    end(name, 2.0, len / 2);
  };
  ship('ship_cog', 1, 2.2); ship('ship_galley', 1, 2.8); ship('ship_carrack', 3, 2.8); ship('ship_ship_of_the_line', 3, 3.2);
  return { meshes, vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}

export async function loadModelSet(base = '/'): Promise<ModelSet | null> {
  try {
    const j = await fetch(base + 'models/models.json');
    if (!j.ok || !(j.headers.get('content-type') ?? '').includes('json')) return null;
    const meta = await j.json();
    const b = await fetch(base + 'models/models.bin');
    if (!b.ok) return null;
    const buf = await b.arrayBuffer();
    const nv = meta.totalVertices, ni = meta.totalIndices;
    if (!nv || !ni || buf.byteLength < nv * 40 + ni * 4) return null;
    return { meshes: meta.meshes, vertices: new Float32Array(buf, 0, nv * 10), indices: new Uint32Array(buf, nv * 40, ni) };
  } catch { return null; }
}

interface Chunk { buf: GPUBuffer; runs: Run[]; used: number; n: number }

export type TownStyle = 'north' | 'stone' | 'south' | 'steppe' | 'muslim';
export interface Settlement { x: number; y: number; size: number; capital?: boolean; style: TownStyle; loc: number }
/** x, y: where the figures stand (figureSpot); heading: course of ships under way (radians, see setUnits); marching: on the move */
export interface UnitProp { id: number; x: number; y: number; men: number; fleet: boolean; color: [number, number, number]; heading?: number; marching?: boolean }
interface UnitGroup { id: number; ax: number; ay: number; fleet: boolean; march: boolean; parts: { dx: number; dy: number; s: number; r: number; c: number; mesh: string }[] }

/** where the figures of an army stand: a little in front (south-east) of the town at the location's centre */
export function figureSpot(x: number, y: number, fleet: boolean, slot = 0): [number, number] {
  if (fleet) return [x + slot * 5, y + slot * 2];
  const a = 0.9 + slot * 1.25;
  return [x + Math.cos(a) * 6, y + Math.sin(a) * 6];
}

export class Props {
  private models: ModelSet;
  private vb!: GPUBuffer; private ib!: GPUBuffer;
  private pipe!: GPURenderPipeline; private shadowPipe!: GPURenderPipeline; private bg!: GPUBindGroup;
  /** the shader module (to check for compile errors) */
  mod!: GPUShaderModule;
  private biome: Uint8Array | null = null; private bw = 0; private bh = 0;
  private trees = new Map<number, Chunk>();
  private frame = 0;
  private dyn: GPUBuffer | null = null; private dynCap = 0;
  private settlements: Settlement[] = [];
  private townBuf: GPUBuffer | null = null; private townRuns = new Map<number, Run[]>();
  private townCircles = new Map<number, number[]>();
  private units: UnitGroup[] = [];
  /** the animated place of moving hosts (set by the renderer each frame) */
  unitSpot?: (id: number) => [number, number] | undefined;
  private dynRuns: Run[] = [];
  private hidden: Uint8Array | null = null;
  private ncx: number; private ncy: number;
  enabled = true;
  /** most tree instances per frame */
  treeBudget = 150000;
  shadows = true;
  /** last frame's counts (for tests) */
  stats = { trees: 0, towns: 0, units: 0, chunks: 0 };

  constructor(private device: GPUDevice, private assets: MapAssets, private uniformBuf: GPUBuffer, private format: GPUTextureFormat,
    private zAt: (x: number, y: number) => number, private locBuf: GPUBuffer, private idTex: GPUTexture) {
    this.models = builtinModels();
    this.ncx = Math.ceil(assets.W / CHUNK); this.ncy = Math.ceil(assets.H / CHUNK);
    this.upload();
  }

  private upload() {
    const d = this.device;
    this.vb?.destroy(); this.ib?.destroy();
    this.vb = d.createBuffer({ size: Math.max(16, this.models.vertices.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.vb, 0, this.models.vertices);
    const ib = new Uint32Array(Math.ceil(this.models.indices.length));
    ib.set(this.models.indices);
    this.ib = d.createBuffer({ size: Math.max(16, ib.byteLength), usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.ib, 0, ib);
    if (!this.pipe) {
      const mod = d.createShaderModule({ code: PROPS_WGSL });
      const buffers: GPUVertexBufferLayout[] = [
        { arrayStride: 40, stepMode: 'vertex', attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32x3' }, { shaderLocation: 3, offset: 36, format: 'float32' }] },
        { arrayStride: STRIDE * 4, stepMode: 'instance', attributes: [
          { shaderLocation: 4, offset: 0, format: 'float32x4' }, { shaderLocation: 5, offset: 16, format: 'float32x4' }] },
      ];
      const bgl = d.createBindGroupLayout({ entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, texture: { sampleType: 'uint' } },
      ] });
      const layout = d.createPipelineLayout({ bindGroupLayouts: [bgl] });
      this.pipe = d.createRenderPipeline({
        layout,
        vertex: { module: mod, entryPoint: 'vs', buffers },
        fragment: { module: mod, entryPoint: 'fs', targets: [{ format: this.format }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
      });
      // shadows darken what is already drawn (multiply); no depth write so that they never hide anything
      this.shadowPipe = d.createRenderPipeline({
        layout,
        vertex: { module: mod, entryPoint: 'vs_shadow', buffers },
        fragment: { module: mod, entryPoint: 'fs_shadow', targets: [{ format: this.format, blend: { color: { operation: 'add', srcFactor: 'zero', dstFactor: 'src' }, alpha: { operation: 'add', srcFactor: 'zero', dstFactor: 'one' } } }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less-equal' },
      });
      this.mod = mod;
      this.bg = d.createBindGroup({ layout: bgl, entries: [
        { binding: 0, resource: { buffer: this.uniformBuf } }, { binding: 1, resource: { buffer: this.locBuf } }, { binding: 2, resource: this.idTex.createView() },
      ] });
    }
  }

  /** swap in the Blender models once they are loaded; keeps the built-in shapes for any mesh that is missing */
  setModels(m: ModelSet) {
    const fb = builtinModels();
    for (const k of Object.keys(fb.meshes)) if (!m.meshes[k]) {
      const f = fb.meshes[k];
      const v = new Float32Array(m.vertices.length + f.vertexCount * 10); v.set(m.vertices); v.set(fb.vertices.subarray(f.vertexOffset * 10, (f.vertexOffset + f.vertexCount) * 10), m.vertices.length);
      const i = new Uint32Array(m.indices.length + f.indexCount); i.set(m.indices); i.set(fb.indices.subarray(f.indexOffset, f.indexOffset + f.indexCount), m.indices.length);
      m = { meshes: { ...m.meshes, [k]: { ...f, vertexOffset: m.vertices.length / 10, indexOffset: m.indices.length } }, vertices: v, indices: i };
    }
    this.models = m;
    this.upload();
  }

  /** read the biome raster back once (forest density and terrain class decide where trees grow) */
  async loadBiome(tex: GPUTexture) {
    const d = this.device, w = tex.width, h = tex.height;
    const bpr = Math.ceil((w * 4) / 256) * 256;
    const buf = d.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = d.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr }, [w, h]);
    d.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange());
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) out.set(src.subarray(y * bpr, y * bpr + w * 4), y * w * 4);
    buf.unmap(); buf.destroy();
    this.biome = out; this.bw = w; this.bh = h;
    this.clearTrees();
  }

  private clearTrees() { for (const c of this.trees.values()) c.buf.destroy(); this.trees.clear(); }

  /** locations the player has not explored (known[i] = 0) carry no figures */
  setExplored(known: Uint8Array | null) {
    const same = known === this.hidden || (!!known && !!this.hidden && known.length === this.hidden.length && known.every((v, i) => v === this.hidden![i]));
    if (same) return;
    this.hidden = known ? known.slice() : null;
    this.clearTrees();
    this.buildTowns();
  }

  private known(id: number) { const h = this.hidden; return !h || id <= 0 || id > h.length || h[id - 1] !== 0; }

  private treeChunk(cx: number, cy: number): Chunk | null {
    const key = cy * 4096 + cx;
    let c = this.trees.get(key);
    if (c) { c.used = this.frame; return c; }
    const b = this.biome; if (!b) return null;
    const a = this.assets;
    const byType = new Map<string, number[]>();
    const n = Math.floor(CHUNK / TREE_STEP);
    const circles = this.townCircles.get(key) ?? [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const gx = cx * n + i, gy = cy * n + j;
      const x = cx * CHUNK + (i + 0.15 + 0.7 * hash(gx, gy, 1)) * TREE_STEP, y = cy * CHUNK + (j + 0.15 + 0.7 * hash(gx, gy, 2)) * TREE_STEP;
      if (x >= a.W || y >= a.H) continue;
      const bx = Math.min(this.bw - 1, Math.floor((x / a.W) * this.bw)), by = Math.min(this.bh - 1, Math.floor((y / a.H) * this.bh));
      const o = (by * this.bw + bx) * 4;
      const cls = b[o]; if (cls === 0) continue;
      const forest = b[o + 1] / 255, cult = b[o + 2] / 255;
      // dense in forests, a scatter of single trees and hedgerow trees elsewhere
      const dens = forest > 0.12 ? Math.min(0.92, forest * 1.15) : cls === 8 || cls === 11 ? 0.003 : cls === 7 ? 0.008 : cls === 6 ? 0.05 : 0.02 + cult * 0.025;
      const r = hash(gx, gy, 3);
      if (r > dens) continue;
      const id = a.ids[Math.floor(y) * a.W + Math.floor(x)];
      if (!id || id > a.geo.L || !this.known(id)) continue; // water or unexplored
      let inTown = false;
      for (let k = 0; k < circles.length; k += 3) { const dx = x - circles[k], dy = y - circles[k + 1]; if (dx * dx + dy * dy < circles[k + 2]) { inTown = true; break; } }
      if (inTown) continue;
      const z = this.zAt(x, y);
      if (z > 10.5) continue; // above the tree line (about 2300 m)
      const lat = y / a.H;
      const cold = lat < 0.3 || cls === 5 || cls === 10 || z > 4.5;
      let mesh: string;
      const t = hash(gx, gy, 4);
      if (forest <= 0.12 && t < 0.35) mesh = 'bush';
      else if (cls === 8 || (cls === 7 && lat > 0.45) || (lat > 0.48 && t < 0.3 && forest < 0.3)) mesh = 'tree_palm';
      else if (cold) mesh = t < 0.8 ? (t < 0.45 ? 'tree_conifer_a' : 'tree_conifer_b') : 'tree_broadleaf_a';
      else if (cls === 9) mesh = 'tree_broadleaf_b';
      else mesh = t < 0.15 ? 'tree_conifer_a' : t < 0.6 ? 'tree_broadleaf_a' : 'tree_broadleaf_b';
      const s = (0.62 + 0.38 * hash(gx, gy, 5)) * S_TREE;
      let list = byType.get(mesh); if (!list) byType.set(mesh, (list = []));
      // rank (r / dens) first, so that the first part of every run is an even random thinning of the forest
      list.push(r / Math.max(1e-3, dens), x, y, z - 0.05, s, hash(gx, gy, 6) * 6.283, mesh.startsWith('tree_broadleaf') || mesh === 'bush' ? 3 : 1);
    }
    let total = 0; for (const l of byType.values()) total += l.length / 7;
    const data = new Float32Array(Math.max(STRIDE, total * STRIDE));
    const u32 = new Uint32Array(data.buffer);
    const runs: Run[] = [];
    let k = 0;
    for (const [mesh, l] of byType) {
      const order = Array.from({ length: l.length / 7 }, (_, i) => i).sort((p, q) => l[p * 7] - l[q * 7]);
      runs.push({ mesh, first: k / STRIDE, count: order.length });
      for (const i of order) {
        const o = i * 7;
        data[k] = l[o + 1]; data[k + 1] = l[o + 2]; data[k + 2] = l[o + 3]; data[k + 3] = l[o + 4]; data[k + 4] = l[o + 5];
        u32[k + 5] = 0xffffffff; data[k + 6] = l[o + 6] + Math.min(0.995, l[o]); data[k + 7] = SHOW_TREES; k += STRIDE;
      }
    }
    const buf = this.device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(buf, 0, data);
    c = { buf, runs, used: this.frame, n: total };
    this.trees.set(key, c);
    return c;
  }

  /** towns: houses around a church or mosque, more for larger places, yurts on the steppe; a castle at capitals */
  setSettlements(list: Settlement[]) {
    this.settlements = list;
    this.buildTowns();
  }

  private buildTowns() {
    const byChunk = new Map<number, Map<string, Inst[]>>();
    const circles = new Map<number, number[]>();
    const add = (mesh: string, i: Inst) => {
      const key = clamp(Math.floor(i.y / CHUNK), 0, this.ncy - 1) * 4096 + clamp(Math.floor(i.x / CHUNK), 0, this.ncx - 1);
      let m = byChunk.get(key); if (!m) byChunk.set(key, (m = new Map()));
      let l = m.get(mesh); if (!l) m.set(mesh, (l = []));
      l.push(i);
    };
    for (const t of this.settlements) {
      if (!this.known(t.loc + 1)) continue;
      const n = [2, 4, 7, 10, 14, 18][clamp(Math.round(t.size), 0, 5)];
      const hs = (Math.floor(t.x * 13 + t.y * 7) | 0) >>> 0;
      const house = t.style === 'south' || t.style === 'muslim' ? 'house_mediterranean' : t.style === 'steppe' ? 'house_steppe_yurt' : t.style === 'stone' ? 'house_stone' : 'house_timber';
      let rad = 0;
      const hasCentre = n >= 7 && t.style !== 'steppe';
      for (let i = 0; i < n; i++) {
        const k = i + (hasCentre ? 2 : 0);
        const ang = k * 2.39996 + hash(hs, i, 1) * 0.6, r = (0.4 + Math.sqrt(k) * 0.66) * S_HOUSE;
        const x = t.x + Math.cos(ang) * r, y = t.y + Math.sin(ang) * r;
        rad = Math.max(rad, r + 0.8);
        const m = i % 4 === 3 && house === 'house_timber' ? 'house_stone' : house;
        // houses line up roughly with the street around the centre
        add(m, { x, y, z: this.zAt(x, y), s: (0.85 + 0.3 * hash(hs, i, 2)) * S_HOUSE, r: ang + Math.PI / 2 + (hash(hs, i, 3) - 0.5) * 0.3, c: -1 });
      }
      if (hasCentre) add(t.style === 'muslim' ? 'mosque' : 'church_gothic', { x: t.x, y: t.y, z: this.zAt(t.x, t.y), s: 0.75 * S_HOUSE, r: 0, c: -1 });
      if (t.capital) {
        const x = t.x + rad * 0.7 + 1.5, y = t.y - rad * 0.7 - 1.0;
        add('castle', { x, y, z: this.zAt(x, y), s: 0.8 * S_HOUSE, r: 0.3, c: -1 });
        rad += 2.5;
      }
      // keep the forest out of the town
      const r2 = rad * rad;
      for (let cy = Math.floor((t.y - rad) / CHUNK); cy <= Math.floor((t.y + rad) / CHUNK); cy++)
        for (let cx = Math.floor((t.x - rad) / CHUNK); cx <= Math.floor((t.x + rad) / CHUNK); cx++) {
          const key = cy * 4096 + cx;
          let l = circles.get(key); if (!l) circles.set(key, (l = []));
          l.push(t.x, t.y, r2);
        }
    }
    let total = 0;
    for (const m of byChunk.values()) for (const l of m.values()) total += l.length;
    const data = new Float32Array(Math.max(STRIDE, total * STRIDE)), u32 = new Uint32Array(data.buffer);
    const runs = new Map<number, Run[]>();
    let k = 0;
    for (const [key, m] of byChunk) {
      const rl: Run[] = [];
      for (const [mesh, l] of m) {
        rl.push({ mesh, first: k / STRIDE, count: l.length });
        for (const i of l) { data[k] = i.x; data[k + 1] = i.y; data[k + 2] = i.z; data[k + 3] = i.s; data[k + 4] = i.r; u32[k + 5] = 0xffffffff; data[k + 6] = 0; data[k + 7] = SHOW_TOWNS; k += STRIDE; }
      }
      runs.set(key, rl);
    }
    this.townBuf?.destroy();
    this.townBuf = this.device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(this.townBuf, 0, data);
    this.townRuns = runs;
    // circles changed: trees must be placed again
    const changed = circles.size !== this.townCircles.size || [...circles].some(([kk, l]) => (this.townCircles.get(kk)?.length ?? -1) !== l.length);
    this.townCircles = circles;
    if (changed) this.clearTrees();
  }

  /** armies (a block of soldiers with a standard, more for larger hosts) and fleets (one to three ships) */
  setUnits(list: UnitProp[]) {
    const out: UnitGroup[] = [];
    for (const u of list) {
      const c = ((u.color[0] & 255) << 16) | ((u.color[1] & 255) << 8) | (u.color[2] & 255);
      const parts: UnitGroup['parts'] = [];
      if (u.fleet) {
        const n = u.men >= 30 ? 3 : u.men >= 10 ? 2 : 1;
        const mesh = u.men >= 20 ? 'ship_carrack' : 'ship_cog';
        // under way the ships turn their bows to the course (models point the bow to +y, north)
        const r = u.heading !== undefined ? u.heading : 0.6;
        for (let i = 0; i < n; i++) parts.push({ dx: (i - (n - 1) / 2) * 3.2 * (S_SHIP / 1.7), dy: (i % 2) * 1.6, s: S_SHIP, r, c, mesh });
      } else {
        const n = clamp(Math.round(2 + Math.log2(Math.max(1, u.men / 1000)) * 1.5), 2, 12);
        const sp = 0.5 * S_SOLDIER;
        const cols = Math.min(4, n);
        for (let i = 0; i < n; i++) {
          const row = Math.floor(i / cols), col = i % cols;
          const x = (col - (cols - 1) / 2) * sp + row * sp * 0.5, y = row * sp * 0.8;
          const mesh = n >= 5 && (i === n - 1 || (n >= 9 && i === n - 2)) ? 'soldier_cavalry' : row === 0 ? (i % 2 ? 'soldier_infantry' : 'soldier_pikeman') : i % 3 === 0 ? 'soldier_archer' : 'soldier_pikeman';
          parts.push({ dx: mesh === 'soldier_cavalry' ? x + sp * 1.2 : x, dy: y, s: S_SOLDIER * (mesh === 'soldier_cavalry' ? 0.95 : 1), r: 0, c, mesh });
        }
        if (u.men >= 15000) parts.push({ dx: -sp * (cols / 2 + 1.2), dy: sp, s: S_SOLDIER, r: 0.4, c, mesh: 'cannon' });
        parts.push({ dx: -sp * (cols / 2 + 0.6), dy: -sp * 0.3, s: S_SOLDIER, r: 0, c, mesh: 'banner_standard' });
      }
      out.push({ id: u.id, ax: u.x, ay: u.y, fleet: u.fleet, march: !!u.marching, parts });
    }
    this.units = out;
  }

  /** upload the units near enough to draw this frame (spot(id) gives the animated place of a host, if it is moving) */
  private prepareUnits(scaleAt: (x: number, y: number, z: number) => number, spot?: (id: number) => [number, number] | undefined) {
    const groups = new Map<string, Inst[]>();
    let total = 0;
    for (const u of this.units) {
      const at = spot?.(u.id);
      const ax = at ? at[0] : u.ax, ay = at ? at[1] : u.ay;
      if (scaleAt(ax, ay, u.fleet ? 0 : this.zAt(ax, ay)) < SHOW_UNITS * 0.9) continue;
      for (const p of u.parts) {
        const x = ax + p.dx, y = ay + p.dy;
        let g = groups.get(p.mesh); if (!g) groups.set(p.mesh, (g = []));
        g.push({ x, y, z: u.fleet ? 0.05 : this.zAt(x, y), s: p.s, r: p.r, c: p.c, wind: u.march ? -1 : 0 }); total++;
      }
    }
    this.dynRuns = [];
    this.stats.units = total;
    if (!total) return;
    if (!this.dyn || this.dynCap < total) {
      this.dyn?.destroy(); this.dynCap = Math.max(1024, total * 2);
      this.dyn = this.device.createBuffer({ size: this.dynCap * STRIDE * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    const data = new Float32Array(total * STRIDE), u32 = new Uint32Array(data.buffer);
    let k = 0;
    for (const [mesh, g] of groups) {
      this.dynRuns.push({ mesh, first: k / STRIDE, count: g.length });
      for (const i of g) {
        data[k] = i.x; data[k + 1] = i.y; data[k + 2] = i.z; data[k + 3] = i.s; data[k + 4] = i.r;
        u32[k + 5] = i.c < 0 ? 0xffffffff : i.c; data[k + 6] = i.wind ?? 0; data[k + 7] = SHOW_UNITS; k += STRIDE;
      }
    }
    this.device.queue.writeBuffer(this.dyn, 0, data);
  }

  /** visible chunks with their scale (css px per map px at the chunk centre), nearest first */
  private visibleChunks(cam: Cam3, zAt: (x: number, y: number) => number): [number, number, number][] {
    const out: [number, number, number][] = [];
    const m = cam.vp;
    for (let cy = 0; cy < this.ncy; cy++) for (let cx = 0; cx < this.ncx; cx++) {
      const x = (cx + 0.5) * CHUNK, y = (cy + 0.5) * CHUNK, z = -zAt(x, y);
      const X = m[0] * x + m[4] * y + m[8] * z + m[12], Y = m[1] * x + m[5] * y + m[9] * z + m[13], W = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (W <= 1) continue;
      const sc = (cam.focal / W) * 1.6; // about the scale at the chunk's near edge
      if (sc < SHOW_TOWNS) continue;
      const pad = (CHUNK * 0.75 * sc * 2) / cam.cssW, padY = (CHUNK * 0.75 * sc * 2) / cam.cssH + 0.15;
      if (Math.abs(X / W) > 1 + pad || Math.abs(Y / W) > 1 + padY) continue;
      out.push([sc, cx, cy]);
    }
    out.sort((p, q) => q[0] - p[0]);
    return out;
  }

  /** draw the props; call inside a pass with the map colour target and the terrain depth */
  draw(pass: GPURenderPassEncoder, cam: Cam3, scaleAt: (x: number, y: number, z: number) => number) {
    this.stats = { trees: 0, towns: 0, units: 0, chunks: 0 };
    if (!this.enabled) return;
    this.frame++;
    const M = this.models.meshes;
    const chunks = this.visibleChunks(cam, this.zAt);
    this.stats.chunks = chunks.length;
    this.prepareUnits(scaleAt, this.unitSpot);
    // gather the draws once, run them for the shadows and then for the figures
    const draws: { buf: GPUBuffer; mesh: ModelMesh; first: number; count: number; shadow: boolean }[] = [];
    let budget = this.treeBudget;
    for (const [sc, cx, cy] of chunks) {
      const key = cy * 4096 + cx;
      const tr = this.townRuns.get(key);
      if (tr && this.townBuf) for (const r of tr) { const mm = M[r.mesh]; if (mm) { draws.push({ buf: this.townBuf, mesh: mm, first: r.first, count: r.count, shadow: true }); this.stats.towns += r.count; } }
      if (sc < SHOW_TREES || budget <= 0 || !this.biome) continue;
      const c = this.treeChunk(cx, cy); if (!c) continue;
      // thin the forest with distance: a share of every run (the runs are in random order)
      const frac = 0.14 + 0.86 * smooth(clamp((sc - SHOW_TREES) / 4.5, 0, 1)) + 0.04;
      for (const r of c.runs) {
        const mm = M[r.mesh]; if (!mm) continue;
        const n = Math.min(budget, r.count, Math.ceil(r.count * frac));
        if (n <= 0) continue;
        draws.push({ buf: c.buf, mesh: mm, first: r.first, count: n, shadow: sc > 3 });
        budget -= n; this.stats.trees += n;
      }
    }
    if (this.dyn) for (const r of this.dynRuns) { const mm = M[r.mesh]; if (mm) draws.push({ buf: this.dyn, mesh: mm, first: r.first, count: r.count, shadow: true }); }
    // forget tree chunks not drawn for a while
    if (this.trees.size > 200) for (const [k, c] of this.trees) if (this.frame - c.used > 240) { c.buf.destroy(); this.trees.delete(k); }
    if (!draws.length) return;
    pass.setBindGroup(0, this.bg);
    pass.setVertexBuffer(0, this.vb); pass.setIndexBuffer(this.ib, 'uint32');
    if (this.shadows) {
      pass.setPipeline(this.shadowPipe);
      let cur: GPUBuffer | null = null;
      for (const d of draws) if (d.shadow) { if (d.buf !== cur) { pass.setVertexBuffer(1, d.buf); cur = d.buf; } pass.drawIndexed(d.mesh.indexCount, d.count, d.mesh.indexOffset, d.mesh.vertexOffset, d.first); }
    }
    pass.setPipeline(this.pipe);
    let cur: GPUBuffer | null = null;
    for (const d of draws) { if (d.buf !== cur) { pass.setVertexBuffer(1, d.buf); cur = d.buf; } pass.drawIndexed(d.mesh.indexCount, d.count, d.mesh.indexOffset, d.mesh.vertexOffset, d.first); }
  }

  destroy() {
    this.vb?.destroy(); this.ib?.destroy(); this.dyn?.destroy(); this.townBuf?.destroy();
    this.clearTrees();
  }
}
