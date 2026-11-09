// WGSL shaders of the map renderer.

export const NOISE = /* wgsl */ `
fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
fn hash22(p: vec2f) -> vec2f {
  var p3 = fract(vec3f(p.x, p.y, p.x) * vec3f(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i); let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0)); let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// value noise with analytic derivative: (value, d/dx, d/dy)
fn vnoised(p: vec2f) -> vec3f {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f); let du = 6.0 * f * (1.0 - f);
  let a = hash21(i); let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0)); let d = hash21(i + vec2f(1.0, 1.0));
  let k1 = b - a; let k2 = c - a; let k4 = a - b - c + d;
  return vec3f(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2f(k1 + k4 * u.y, k2 + k4 * u.x));
}
fn fbm3(p: vec2f) -> f32 {
  return vnoise(p) * 0.55 + vnoise(p * 2.03 + 11.7) * 0.3 + vnoise(p * 4.11 + 3.1) * 0.15;
}
`;

export const FULLSCREEN_VS = /* wgsl */ `
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** downsample one mip level (box filter through a linear sampler) */
export const MIP_WGSL = FULLSCREEN_VS + /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let sd = vec2f(textureDimensions(src));
  let dd = max(floor(sd * 0.5), vec2f(1.0));
  let uv = fc.xy / dd;
  return textureSampleLevel(src, smp, uv, 0.0);
}
`;

/** int16 metres -> f16 kilometres (filterable, mip-mappable) */
export const HEIGHT_WGSL = FULLSCREEN_VS + /* wgsl */ `
@group(0) @binding(0) var hsrc: texture_2d<i32>;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let h = f32(textureLoad(hsrc, vec2i(fc.xy), 0).r) / 1000.0;
  return vec4f(h, 0.0, 0.0, 1.0);
}
`;

/** biome classes -> unlit albedo (rgb) + land flag (a) */
export const ALBEDO_WGSL = FULLSCREEN_VS + NOISE + /* wgsl */ `
@group(0) @binding(0) var biome: texture_2d<f32>;
fn terrainColor(t: i32) -> vec3f {
  switch t {
    case 1: { return vec3f(0.560, 0.640, 0.385); }  // plains
    case 2: { return vec3f(0.680, 0.665, 0.400); }  // farmland
    case 3: { return vec3f(0.330, 0.440, 0.250); }  // forest
    case 4: { return vec3f(0.560, 0.580, 0.400); }  // hills
    case 5: { return vec3f(0.560, 0.520, 0.440); }  // mountains
    case 6: { return vec3f(0.420, 0.500, 0.380); }  // marsh
    case 7: { return vec3f(0.735, 0.690, 0.470); }  // steppe
    case 8: { return vec3f(0.880, 0.770, 0.545); }  // desert
    case 9: { return vec3f(0.230, 0.410, 0.200); }  // jungle
    case 10: { return vec3f(0.600, 0.610, 0.540); } // tundra
    case 11: { return vec3f(0.640, 0.560, 0.460); } // wasteland
    default: { return vec3f(0.80, 0.74, 0.58); }    // water: sand for coast blending
  }
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let b = textureLoad(biome, vec2i(fc.xy), 0);
  let t = i32(round(b.r * 255.0));
  if (t == 0) { return vec4f(0.0); } // premultiplied: water contributes nothing to land colours
  var c = terrainColor(t);
  let forest = b.g; let cult = b.b;
  // forests: deep greens, slightly bluish in the north, yellower in the south (handled in bake by latitude)
  let forestCol = select(vec3f(0.235, 0.345, 0.190), vec3f(0.30, 0.36, 0.20), t == 8 || t == 7);
  c = mix(c, forestCol, smoothstep(0.08, 0.85, forest) * 0.85);
  // cultivation: warm golden patchwork tones
  let n = vnoise(fc.xy * 0.35);
  let cultCol = mix(vec3f(0.74, 0.69, 0.41), vec3f(0.66, 0.66, 0.38), n);
  c = mix(c, cultCol, smoothstep(0.15, 0.9, cult) * 0.45 * (1.0 - forest));
  return vec4f(c, 1.0);
}
`;

/** terrain bake: lit albedo, water depth, lighting, snow-proneness, coast sdf, forest */
export const BAKE_WGSL = FULLSCREEN_VS + NOISE + /* wgsl */ `
struct BU { size: vec4f, proj: vec4f, q: vec4f };  // size: hw,hh,W,H  proj: ymax,ymin,kmPerPxEq,_  q: aoTaps,exag,_,_
@group(0) @binding(0) var<uniform> bu: BU;
@group(0) @binding(1) var albedo: texture_2d<f32>;
@group(0) @binding(2) var hgt: texture_2d<f32>;
@group(0) @binding(3) var coast: texture_2d<f32>;
@group(0) @binding(4) var biome: texture_2d<f32>;
@group(0) @binding(5) var smp: sampler;
struct BO { @location(0) terrain: vec4f, @location(1) aux: vec4f };

fn hAt(uv: vec2f, lod: f32, land: bool) -> f32 {
  let h = textureSampleLevel(hgt, smp, uv, lod).r;
  return select(h * 0.5, max(h, 0.0), land);
}

@fragment fn fs(@builtin(position) fc: vec4f) -> BO {
  let hs = bu.size.xy;
  let t = fc.xy;
  let uv = t / hs;
  let px = 1.0 / hs;
  // latitude (Mercator)
  let yN = bu.proj.x - (t.y * 2.0) / bu.size.w * (bu.proj.x - bu.proj.y);
  let lat = degrees(atan(sinh(yN)));
  let coslat = cos(radians(lat));
  let tkm = 2.0 * bu.proj.z * coslat; // km per half-res texel
  let sdfRaw = textureSampleLevel(coast, smp, uv, 0.0).r; // full-res sdf, bilinear = 2x2 average
  let sdf = (sdfRaw - 0.5) * 40.0; // half-res texels, > 0 water
  let land = sdf < 0.0;
  let b = textureLoad(biome, vec2i(t), 0);

  // ---------- relief lighting ----------
  let h0 = hAt(uv, 0.0, land);
  var g = vec2f(0.0);
  var steps = array<vec3f, 3>(vec3f(1.0, 0.0, 0.5), vec3f(2.5, 1.3, 0.9), vec3f(6.0, 2.6, 0.75));
  for (var k = 0; k < 3; k++) {
    let s = steps[k];
    let o = s.x * px;
    let hx = hAt(uv + vec2f(o.x, 0.0), s.y, land) - hAt(uv - vec2f(o.x, 0.0), s.y, land);
    let hy = hAt(uv + vec2f(0.0, o.y), s.y, land) - hAt(uv - vec2f(0.0, o.y), s.y, land);
    g += vec2f(hx, hy) / (2.0 * s.x * tkm) * s.z;
  }
  let exag = select(bu.q.y * 0.18, bu.q.y, land);
  let n = normalize(vec3f(-g * exag, 1.0));
  let Ldir = normalize(vec3f(-0.62, -0.78, 0.95));
  let Ldir2 = normalize(vec3f(-0.9, 0.1, 1.4));
  let flat1 = Ldir.z; let flat2 = Ldir2.z;
  let shade = (max(dot(n, Ldir), 0.0) / flat1) * 0.75 + (max(dot(n, Ldir2), 0.0) / flat2) * 0.25;
  // ambient occlusion from blurred height mips (valleys darker, ridges lighter)
  var occ = 0.0; var ridge = 0.0;
  let taps = i32(bu.q.x);
  for (var l = 2; l <= 5; l++) {
    let lf = f32(l);
    let sc = exp2(lf);
    var hb = 0.0;
    if (taps <= 1) {
      hb = hAt(uv, lf, land);
    } else {
      let o = px * sc * 0.6;
      hb = 0.25 * (hAt(uv + vec2f(o.x, o.y), lf, land) + hAt(uv + vec2f(-o.x, o.y), lf, land)
                 + hAt(uv + vec2f(o.x, -o.y), lf, land) + hAt(uv + vec2f(-o.x, -o.y), lf, land));
    }
    let dh = (hb - h0) / (sc * tkm);
    let lw = 1.2 - lf * 0.18;
    occ += max(dh, 0.0) * lw; ridge += max(-dh, 0.0) * lw;
  }
  let ao = clamp(1.0 - occ * 11.0, 0.6, 1.0) * (1.0 + clamp(ridge * 4.0, 0.0, 0.1));
  var light = mix(1.0, shade, 0.9) * ao;
  light = clamp(light, 0.2, 1.75);

  var out: BO;
  // ---------- albedo with organic (domain-warped) class transitions ----------
  let w1 = vec2f(vnoise(t * 0.045), vnoise(t * 0.045 + 37.0)) - 0.5;
  let w2 = vec2f(vnoise(t * 0.17 + 5.0), vnoise(t * 0.17 + 91.0)) - 0.5;
  let warp = w1 * 9.0 + w2 * 3.0;
  let wS = textureSampleLevel(albedo, smp, (t + warp) * px, 1.4);
  let a0 = textureSampleLevel(albedo, smp, uv, 0.0);
  var a = select(vec3f(0.80, 0.74, 0.58), a0.rgb / max(a0.a, 1e-3), a0.a > 0.02);
  if (wS.a > 0.02) { a = mix(a, wS.rgb / wS.a, clamp(wS.a * 2.0, 0.0, 1.0) * 0.75); }
  let e = h0; // km
  let slope = length(g);
  // large-scale tonal variation + latitude tint (lush north-west, dry south-east)
  let tone = fbm3(t * 0.012);
  a *= 0.93 + tone * 0.14;
  let dry = clamp((40.0 - lat) / 14.0, 0.0, 1.0);
  a = mix(a, a * vec3f(1.06, 1.0, 0.88), dry * 0.25);
  let north = clamp((lat - 56.0) / 12.0, 0.0, 1.0);
  a = mix(a, a * vec3f(0.92, 0.98, 1.04), north * 0.5);
  // elevation bands
  a = mix(a, vec3f(0.56, 0.53, 0.40), smoothstep(0.45, 1.4, e) * 0.45);
  let rockAmt = smoothstep(1.1, 2.3, e + slope * 4.0 + (tone - 0.5) * 0.5);
  a = mix(a, vec3f(0.53, 0.50, 0.47), rockAmt * 0.8);
  // permanent snow by height and latitude
  let snowline = clamp(4.6 - 0.11 * (abs(lat) - 30.0), 0.25, 5.2);
  let sn = smoothstep(snowline - 0.45, snowline + 0.2, e + (vnoise(t * 0.21) - 0.5) * 0.5 - slope * 2.5);
  a = mix(a, vec3f(0.94, 0.95, 0.97), sn);

  // painterly light: warm lights, cool shadows
  let warm = mix(vec3f(0.82, 0.88, 1.02), vec3f(1.03, 1.0, 0.96), clamp(light - 0.45, 0.0, 1.0));
  var lit = a * light * warm;
  lit = mix(lit, a * 0.92, 0.12); // lift deep shadows a little

  // ---------- water ----------
  let depthKm = max(0.0, -textureSampleLevel(hgt, smp, uv, 0.0).r);
  let denc = select(0.0, max(0.03, sqrt(clamp(depthKm / 5.0, 0.0, 1.0))), !land);
  let seabed = mix(1.0, light, 0.6);
  // snow proneness: north and height first
  let prone = clamp((abs(lat) - 36.0) / 24.0 * 0.75 + e / 1.6 * 0.55 + (fbm3(t * 0.06) - 0.5) * 0.35, 0.0, 1.0);
  out.terrain = vec4f(lit, denc);
  out.aux = vec4f(select(seabed, light, land) * 0.5, prone, sdfRaw, b.g);
  return out;
}
`;

/** rivers: instanced round-capped segments into a screen-sized r8 mask (max blend), draped on the 3D terrain */
export const RIVER_WGSL = /* wgsl */ `
struct U { view: vec4f, cam: vec4f, map: vec4f, misc: vec4f, misc2: vec4f, rings: vec4f, eye: vec4f, ex: vec4f, vp: mat4x4f, env: vec4f };
@group(0) @binding(0) var<uniform> U0: U;
struct VO {
  @builtin(position) pos: vec4f,
  @location(0) @interpolate(flat) sa: vec2f,
  @location(1) @interpolate(flat) sb: vec2f,
  @location(2) @interpolate(flat) hw: vec3f,
};
// a ribbon from a to b draped on the terrain; it fades in between zoom z0 and z0 + zr (css px per map px)
fn ribbon(vi: u32, ab: vec4f, w: vec2f, zz: vec2f, z0: f32, zr: f32) -> VO {
  let pr = U0.cam.w;
  let viewSize = U0.view.xy;
  let lift = 0.6 + U0.eye.w * 0.0015;
  let ca = U0.vp * vec4f(ab.xy, -(zz.x + lift), 1.0);
  let cb = U0.vp * vec4f(ab.zw, -(zz.y + lift), 1.0);
  var o: VO;
  if (ca.w < 0.01 || cb.w < 0.01) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); o.sa = vec2f(0.0); o.sb = vec2f(0.0); o.hw = vec3f(0.0); return o; }
  let sa = (ca.xy / ca.w * vec2f(0.5, -0.5) + 0.5) * viewSize;
  let sb = (cb.xy / cb.w * vec2f(0.5, -0.5) + 0.5) * viewSize;
  let za = U0.ex.y / ca.w; let zb = U0.ex.y / cb.w; // css px per map px at each end
  let wa = w.x * za; let wb = w.y * zb; // css px
  let minW = 1.0;
  let zoom = max(za, zb);
  let alpha = pow(clamp(max(wa, wb) / minW, 0.0, 1.0), 0.6) * clamp((zoom - z0) / zr, 0.0, 1.0);
  let hwa = max(wa, minW) * 0.5 * pr; let hwb = max(wb, minW) * 0.5 * pr;
  var d = sb - sa; let len = length(d);
  d = select(vec2f(1.0, 0.0), d / max(len, 1e-5), len > 1e-4);
  let nrm = vec2f(-d.y, d.x);
  let pad = max(hwa, hwb) + 1.5;
  var cx = array<f32, 6>(0.0, 1.0, 0.0, 0.0, 1.0, 1.0);
  var cy = array<f32, 6>(-1.0, -1.0, 1.0, 1.0, -1.0, 1.0);
  let useB = cx[vi] > 0.5;
  let base = select(sa - d * pad, sb + d * pad, useB);
  let p = base + nrm * cy[vi] * pad;
  let depth = select(ca.z / ca.w, cb.z / cb.w, useB);
  o.pos = vec4f(p.x / viewSize.x * 2.0 - 1.0, 1.0 - p.y / viewSize.y * 2.0, clamp(depth, 0.0, 1.0), 1.0);
  o.sa = sa; o.sb = sb; o.hw = vec3f(hwa, hwb, alpha);
  return o;
}
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) ab: vec4f, @location(1) w: vec2f, @location(2) zz: vec2f) -> VO {
  return ribbon(vi, ab, w, zz, 0.12, 0.2);
}
// roads: w.x carries the width, w.y the kind (0.35 track ... 1 paved); they show from the regional zoom on
@vertex fn vs_road(@builtin(vertex_index) vi: u32, @location(0) ab: vec4f, @location(1) w: vec2f, @location(2) zz: vec2f) -> VO {
  var o = ribbon(vi, ab, vec2f(w.x, w.x), zz, 1.7, 1.6);
  o.hw.z *= w.y; // tracks are fainter than built roads
  return o;
}
fn cover(i: VO) -> f32 {
  let p = i.pos.xy;
  let ab = i.sb - i.sa;
  let t = clamp(dot(p - i.sa, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  let hw = mix(i.hw.x, i.hw.y, t);
  let dd = length(p - (i.sa + ab * t));
  return clamp(hw + 0.5 - dd, 0.0, 1.0);
}
@fragment fn fs_road(i: VO) -> @location(0) vec4f {
  return vec4f(0.0, cover(i) * i.hw.z, 0.0, 1.0);
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let p = i.pos.xy;
  let ab = i.sb - i.sa;
  let t = clamp(dot(p - i.sa, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  let hw = mix(i.hw.x, i.hw.y, t);
  let dd = length(p - (i.sa + ab * t));
  let cov = clamp(hw + 0.5 - dd, 0.0, 1.0) * i.hw.z;
  return vec4f(cov, 0.0, 0.0, 1.0);
}
`;

/** 3D terrain: a chunked height-field mesh that writes the map position under every pixel (G-buffer) and depth */
export const TERRAIN_WGSL = /* wgsl */ `
struct TU { vp: mat4x4f, a: vec4f };  // a: hw, hh, hScale (world px per km), skirt depth per step
@group(0) @binding(0) var<uniform> T: TU;
@group(0) @binding(1) var hgt: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f };
@vertex fn vs(@location(0) g: vec3f, @location(1) inst: vec4f) -> VO {
  let hs = vec2f(T.a.x, T.a.y);
  let s = min(inst.xy + g.xy * inst.z, hs);
  let lod = log2(max(inst.z, 1.0)) * 0.75;
  let h = textureSampleLevel(hgt, smp, s / hs, lod).r;
  var z = max(h, 0.0) * T.a.z;
  if (g.z > 0.5) { z = z - T.a.w * inst.z; }
  let mp = s * 2.0;
  var o: VO;
  o.pos = T.vp * vec4f(mp.x, mp.y, -z, 1.0);
  o.w = vec3f(mp, z);
  return o;
}
@fragment fn fs(i: VO) -> @location(0) vec4f { return vec4f(i.w, 1.0); }
`;

/** main composition pass */
export const MAIN_WGSL = FULLSCREEN_VS + NOISE + /* wgsl */ `
// view: viewW, viewH (render px), mapPerPx (map px per render px), zoom (css px per map px)
// cam: camX, camY, time (s), pxRatio (render px per css px)
// map: W, H, L, overlayAlpha
// misc: mode (0 political, 1 terrain, 2 flat), selected (0-based, -1), hover, quality (0..3)
// misc2: inkSpeed (map px/s), closeBlend, waveOctaves, ringCount
// rings: ring radii in css px
struct U { view: vec4f, cam: vec4f, map: vec4f, misc: vec4f, misc2: vec4f, rings: vec4f, eye: vec4f, ex: vec4f, vp: mat4x4f, env: vec4f };
struct Loc { color: u32, prev: u32, ctrl: u32, owner: i32, flags: u32, animStart: f32, snow: f32, origin: u32, prov: i32, p1: u32, p2: u32, p3: u32 };
@group(0) @binding(0) var<uniform> U0: U;
@group(0) @binding(1) var<storage, read> locs: array<Loc>;
@group(0) @binding(2) var idTex: texture_2d<u32>;
@group(0) @binding(3) var terrainTex: texture_2d<f32>;
@group(0) @binding(4) var auxTex: texture_2d<f32>;
@group(0) @binding(5) var riverTex: texture_2d<f32>;
@group(0) @binding(6) var smp: sampler;
@group(0) @binding(7) var coastTex: texture_2d<f32>;
@group(0) @binding(8) var gbuf: texture_2d<f32>;
@group(0) @binding(9) var biomeT: texture_2d<f32>;
@group(0) @binding(10) var hgtT: texture_2d<f32>;

// ---------------- seasons ----------------
// U0.env.x: time of year (0 = 1 January, 0.5 = early July)
/** a tilled strip through the year (k in 0..1 shifts it by a few weeks): winter crop, green, ripe, stubble, ploughed */
fn cropCol(ph0: f32, k: f32) -> vec3f {
  let ph = fract(ph0 + (k - 0.5) * 0.07 + 1.0);
  // winter grain shows green through the cold months, the land for spring sowing lies ploughed and brown
  let w = select(vec3f(0.50, 0.39, 0.28), vec3f(0.39, 0.49, 0.28), k < 0.55);
  var keys = array<vec3f, 6>(w, vec3f(0.42, 0.56, 0.27), vec3f(0.80, 0.68, 0.36), vec3f(0.73, 0.65, 0.46), vec3f(0.50, 0.40, 0.29), w);
  var at = array<f32, 6>(0.0, 0.30, 0.54, 0.69, 0.86, 1.0);
  var c = keys[5];
  for (var i = 0; i < 5; i++) {
    if (ph >= at[i] && ph < at[i + 1]) { c = mix(keys[i], keys[i + 1], smoothstep(at[i], at[i + 1], ph)); }
  }
  return c;
}
/** grassland through the year: dull in winter, fresh in spring, deep in summer, straw in a dry south */
fn meadowCol(ph: f32, dry: f32) -> vec3f {
  let spring = smoothstep(0.2, 0.33, ph) * (1.0 - smoothstep(0.5, 0.62, ph));
  let summer = smoothstep(0.42, 0.55, ph) * (1.0 - smoothstep(0.7, 0.8, ph));
  var c = vec3f(0.45, 0.48, 0.32);
  c = mix(c, vec3f(0.42, 0.58, 0.28), spring);
  c = mix(c, mix(vec3f(0.38, 0.52, 0.26), vec3f(0.70, 0.63, 0.40), dry), summer);
  return c;
}

/** close-zoom ground: field patchwork, meadow, scree and rock, dunes; base is the baked albedo */
fn groundDetail(base: vec3f, p: vec2f, zoom: f32, light: f32) -> vec3f {
  let bt = textureLoad(biomeT, vec2i(clamp(p * 0.5, vec2f(0.0), vec2f(textureDimensions(biomeT)) - 1.0)), 0);
  let cls = i32(round(bt.r * 255.0));
  let forest = bt.g; let cult = bt.b;
  // slope from the height field (km per map px), for rock on steep ground
  let e = 1.0;
  let hx = textureSampleLevel(hgtT, smp, (p + vec2f(e, 0.0)) / U0.map.xy, 0.0).r - textureSampleLevel(hgtT, smp, (p - vec2f(e, 0.0)) / U0.map.xy, 0.0).r;
  let hy = textureSampleLevel(hgtT, smp, (p + vec2f(0.0, e)) / U0.map.xy, 0.0).r - textureSampleLevel(hgtT, smp, (p - vec2f(0.0, e)) / U0.map.xy, 0.0).r;
  let slope = length(vec2f(hx, hy)) / (2.0 * e) * 4.5;
  var c = base;
  let f1 = fbm3(p * 0.6); let f2 = vnoise(p * 2.7); let f3 = vnoise(p * 9.0);
  // meadow and scrub: patches of lighter and darker growth
  c *= 0.92 + 0.16 * f1 + 0.06 * (f2 - 0.5) + 0.04 * (f3 - 0.5) * smoothstep(4.0, 9.0, zoom);
  // fields: open-field strips in irregular furlongs, each furlong with its own direction; more of them where the land is
  // well tilled, meadow and fallow between them, hedges and tracks along the furlong edges
  let ph = U0.env.x;
  let dry = smoothstep(0.62, 0.78, p.y / U0.map.y);
  let fieldW = smoothstep(0.1, 0.5, cult) * (1.0 - smoothstep(0.25, 0.6, forest)) * (1.0 - smoothstep(0.25, 0.6, slope));
  if (fieldW > 0.01) {
    let fs = 4.5;
    let gp = p / fs;
    let gi = floor(gp); let gf = gp - gi;
    var d1 = 9.0; var d2 = 9.0; var bid = vec2f(0.0); var bid2 = vec2f(0.0);
    for (var j = -1; j <= 1; j++) {
      for (var i = -1; i <= 1; i++) {
        let o = vec2f(f32(i), f32(j));
        let pt = o + 0.12 + hash22(gi + o) * 0.76;
        let d = length(gf - pt);
        if (d < d1) { d2 = d1; bid2 = bid; d1 = d; bid = gi + o; } else if (d < d2) { d2 = d; bid2 = gi + o; }
      }
    }
    let edge = (d2 - d1) * 0.5 * fs;          // map px to the furlong edge
    let hf = hash21(bid * 1.37 + 5.1);
    let tilled = hf < cult * 0.95 + 0.05;
    var fc = meadowCol(ph, dry) * (0.9 + 0.2 * hash21(bid + 9.3)) * (0.92 + 0.16 * vnoise(p * 1.3));
    if (tilled) {
      // neighbouring furlongs run in about the same direction (it turns slowly across the land), some at right angles
      let flow = vnoise((bid * fs) * 0.025 + 3.0) * 3.14159 * 1.5;
      let ang = flow + (hash21(bid + 2.7) - 0.5) * 0.5 + select(0.0, 1.5708, hash21(bid + 8.1) < 0.3);
      let ca = cos(ang); let sa = sin(ang);
      let q = vec2f(ca * p.x - sa * p.y, sa * p.x + ca * p.y);
      let sw = 0.32 + 0.3 * hash21(bid + 4.4);  // strip width, map px
      let si = floor(q.y / sw);
      let sf = fract(q.y / sw);
      let hs = hash21(vec2f(si, 0.0) + bid * 3.1);
      let kind = hash21(vec2f(si, 1.0) + bid * 1.9);
      var crop = cropCol(ph, hs);
      if (kind > 0.82) { crop = mix(meadowCol(ph, dry), crop, 0.25) * 0.95; }          // fallow
      else if (kind > 0.68) { crop = mix(cropCol(ph + 0.05, hs), vec3f(0.42, 0.52, 0.26), 0.35); } // peas, beans, flax
      crop *= (0.88 + 0.24 * hash21(vec2f(si, 7.0) + bid)) * (0.95 + 0.1 * vnoise(q * vec2f(0.6, 3.0)));
      // furrows along the strip, a darker balk between strips
      crop *= 0.97 + 0.04 * sin(q.y * 40.0) * smoothstep(6.0, 12.0, zoom);
      let balk = 1.0 - smoothstep(0.0, 0.03 + 0.4 / max(zoom, 1.0), min(sf, 1.0 - sf) * sw);
      crop = mix(crop, crop * 0.8, balk * 0.5 * smoothstep(2.5, 6.0, zoom));
      fc = crop;
    }
    // hedgerows and tracks along some of the furlong edges
    let lo = min(bid, bid2); let hi = max(bid, bid2);
    let hasHedge = step(hash21(lo * 1.7 + hi * 0.37), 0.55);
    let hedge = (1.0 - smoothstep(0.03, 0.07 + 0.25 / max(zoom, 1.0), edge)) * hasHedge;
    let track = (1.0 - smoothstep(0.02, 0.05 + 0.2 / max(zoom, 1.0), edge)) * (1.0 - hasHedge);
    fc = mix(fc, vec3f(0.30, 0.38, 0.21), hedge * 0.5);
    fc = mix(fc, vec3f(0.66, 0.6, 0.48), track * 0.3);
    c = mix(c, fc, fieldW * 0.85);
  } else {
    c = mix(c, c * meadowCol(ph, dry) / vec3f(0.42, 0.54, 0.28), 0.35 * (1.0 - forest));
  }
  // steep ground: scree and bare rock with strata
  let rockW = smoothstep(0.35, 0.9, slope) * (1.0 - forest * 0.6);
  if (rockW > 0.01) {
    let strata = 0.5 + 0.5 * sin((p.x * 0.3 + p.y * 0.7) * 2.0 + f1 * 6.0);
    let rock = mix(vec3f(0.48, 0.45, 0.41), vec3f(0.62, 0.59, 0.54), strata * 0.6 + f2 * 0.4);
    c = mix(c, rock, rockW * 0.8);
  }
  // sand seas: wind ripples
  if (cls == 8) {
    let dune = 0.5 + 0.5 * sin(p.x * 0.55 + p.y * 0.25 + f1 * 5.0);
    c *= 0.93 + 0.12 * dune;
  }
  return c;
}

/** map position under a render pixel from the terrain G-buffer (w = 0: no terrain) */
fn gAt(q: vec2i) -> vec4f {
  let d = vec2i(textureDimensions(gbuf));
  return textureLoad(gbuf, clamp(q, vec2i(0), d - 1), 0);
}
fn gStep(c: vec2f, a: vec4f, b: vec4f) -> f32 {
  let da = select(1e9, length(a.xy - c), a.w > 0.5);
  let db = select(1e9, length(b.xy - c), b.w > 0.5);
  return min(da, db);
}

fn idAt(q: vec2f) -> u32 {
  let c = clamp(vec2i(floor(q)), vec2i(0), vec2i(i32(U0.map.x) - 1, i32(U0.map.y) - 1));
  return textureLoad(idTex, c, 0).r;
}
fn isLand(id: u32) -> bool { return id >= 1u && f32(id) <= U0.map.z; }
fn ownerKey(id: u32) -> i32 { if (!isLand(id)) { return -100; } return locs[id - 1u].owner; }
fn provKey(id: u32) -> i32 { if (!isLand(id)) { return -100; } return locs[id - 1u].prov; }
fn flagsOf(id: u32) -> u32 { if (id == 0u) { return 0u; } return locs[id - 1u].flags; }
fn selKey(id: u32) -> bool { return i32(id) - 1 == i32(U0.misc.y); }

// distance (map px) from fr to the 0.5 iso-line of the bilinear indicator field a (x=00, y=10, z=01, w=11)
fn isoDist(a: vec4f, fr: vec2f) -> f32 {
  if (all(a == vec4f(1.0))) { return 1e3; }
  let cov = mix(mix(a.x, a.y, fr.x), mix(a.z, a.w, fr.x), fr.y);
  let gx = mix(a.y - a.x, a.w - a.z, fr.y);
  let gy = mix(a.z - a.x, a.w - a.y, fr.x);
  let gl = max(length(vec2f(gx, gy)), 0.3);
  return max(cov - 0.5, 0.0) / gl;
}

// first land id found on small rings around p (the smoothed coast can run past the id raster)
fn nearestLand(p: vec2f, step: f32) -> u32 {
  for (var r = 1; r <= 3; r++) {
    for (var k = 0; k < 8; k++) {
      let ang = f32(k) * 0.785398;
      let s = idAt(p + vec2f(cos(ang), sin(ang)) * step * f32(r));
      if (isLand(s)) { return s; }
    }
  }
  return 0u;
}

fn unpackC(c: u32) -> vec4f { return unpack4x8unorm(c); }

fn waterColor(depthEnc: f32, coastD: f32, seabed: f32) -> vec3f {
  let d = depthEnc * depthEnc * 5.0; // km
  let shallow = vec3f(0.45, 0.62, 0.65);
  let mid = vec3f(0.27, 0.46, 0.53);
  let deep = vec3f(0.15, 0.30, 0.42);
  let abyss = vec3f(0.10, 0.21, 0.33);
  var c = mix(shallow, mid, smoothstep(0.0, 0.12, d));
  c = mix(c, deep, smoothstep(0.12, 1.6, d));
  c = mix(c, abyss, smoothstep(2.2, 5.0, d));
  c = mix(c, shallow * 1.04, exp(-coastD / 5.0) * 0.55);
  return c * mix(1.0, seabed, 0.4);
}

@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let viewSize = U0.view.xy;
  let pr = U0.cam.w;
  let time = U0.cam.z;
  let mapSize = U0.map.xy;
  let mode = i32(U0.misc.x);
  let quality = i32(U0.misc.w);
  // vignette factor (screen space)
  let sv = fc.xy / viewSize - 0.5;
  let vign = 1.0 - dot(sv, sv) * 0.38;

  let ip = vec2i(fc.xy);
  let G = gAt(ip);
  let tilt = sin(U0.ex.z);
  if (G.w < 0.5) {
    // beyond the edge of the known world: a hazy sky towards the horizon
    let g = vnoise(fc.xy * 0.5) * 0.03;
    let sky = mix(vec3f(0.55, 0.62, 0.68), vec3f(0.11, 0.115, 0.125), smoothstep(0.0, 0.9, fc.y / viewSize.y + 0.25 * (1.0 - tilt)));
    return vec4f(mix(vec3f(0.11, 0.115, 0.125), sky, tilt) + g, 1.0);
  }
  let p = G.xy;
  // local scale: map px per render px from the neighbouring pixels (min of both sides, robust at silhouettes)
  let mx = gStep(p, gAt(ip + vec2i(1, 0)), gAt(ip - vec2i(1, 0)));
  let my = gStep(p, gAt(ip + vec2i(0, 1)), gAt(ip - vec2i(0, 1)));
  var mpp = max(min(mx, 1e8), min(my, 1e8));
  if (mpp > 1e7) { mpp = U0.view.z; }
  mpp = clamp(mpp, U0.view.z * 0.2, U0.view.z * 12.0);
  let zoom = 1.0 / (mpp * pr);  // css px per map px here
  let mppCss = mpp * pr;        // map px per css px
  let world = vec3f(p, -G.z);
  let toEye = U0.eye.xyz - world;
  let eyeDist = length(toEye);
  let V = vec3f(toEye.x, toEye.y, -toEye.z) / max(eyeDist, 1e-3); // to the eye, z up

  if (p.x < 0.0 || p.y < 0.0 || p.x >= mapSize.x || p.y >= mapSize.y) {
    let g = vnoise(fc.xy * 0.5) * 0.03;
    return vec4f(vec3f(0.11, 0.115, 0.125) + g, 1.0);
  }
  let uv = p / mapSize;
  let lod = max(0.0, log2(max(mpp * 0.5, 1e-6)));
  let T = textureSampleLevel(terrainTex, smp, uv, lod);
  let A = textureSampleLevel(auxTex, smp, uv, lod);
  let light = A.r * 2.0;
  let sdfMap = (textureSampleLevel(coastTex, smp, uv, max(0.0, log2(max(mpp, 1e-6)))).r - 0.5) * 80.0; // map px, > 0 water
  let aa = max(mpp, 0.35);
  var landMask = 1.0 - smoothstep(-0.5 * aa, 0.5 * aa, sdfMap);

  // ---------------- region classification ----------------
  let closeBlend = U0.misc2.y;
  var cid: u32 = 0u;
  var dIsoN = 1e3; var dIsoP = 1e3; var dIsoL = 1e3; var dIsoS = 1e3; var dIsoH = 1e3; var dIsoU = 1e3;
  if (closeBlend > 0.5) {
    let f = p - 0.5;
    let b = floor(f);
    let fr = f - b;
    let t00 = idAt(b + 0.5); let t10 = idAt(b + vec2f(1.5, 0.5));
    let t01 = idAt(b + vec2f(0.5, 1.5)); let t11 = idAt(b + vec2f(1.5, 1.5));
    let w = vec4f((1.0 - fr.x) * (1.0 - fr.y), fr.x * (1.0 - fr.y), (1.0 - fr.x) * fr.y, fr.x * fr.y);
    var ts = array<u32, 4>(t00, t10, t01, t11);
    var best = -1.0; var bestLand = -1.0; var landId: u32 = 0u;
    for (var k = 0; k < 4; k++) {
      let tk = ts[k];
      let cov = dot(w, vec4f(select(0.0, 1.0, t00 == tk), select(0.0, 1.0, t10 == tk), select(0.0, 1.0, t01 == tk), select(0.0, 1.0, t11 == tk)));
      if (cov > best) { best = cov; cid = tk; }
      if (isLand(tk) && cov > bestLand) { bestLand = cov; landId = tk; }
    }
    if (!isLand(cid) && landMask > 0.5) { cid = select(nearestLand(p, 1.0), landId, landId != 0u); }
    if (isLand(cid)) {
      let ok = ownerKey(cid); let pk = provKey(cid);
      var aN = vec4f(1.0); var aP = vec4f(1.0); var aL = vec4f(1.0);
      for (var k = 0; k < 4; k++) {
        let tk = ts[k];
        if (isLand(tk)) {
          aN[k] = select(0.0, 1.0, ownerKey(tk) == ok);
          aP[k] = select(0.0, 1.0, provKey(tk) == pk);
          aL[k] = select(0.0, 1.0, tk == cid);
        }
      }
      dIsoN = isoDist(aN, fr) / mppCss; dIsoP = isoDist(aP, fr) / mppCss; dIsoL = isoDist(aL, fr) / mppCss;
    }
    let cs = selKey(cid); let ch = (flagsOf(cid) & 1u) != 0u; let cu = (flagsOf(cid) & 2u) != 0u;
    var aS = vec4f(1.0); var aH = vec4f(1.0); var aU = vec4f(1.0);
    for (var k = 0; k < 4; k++) {
      let tk = ts[k];
      aS[k] = select(0.0, 1.0, selKey(tk) == cs);
      aH[k] = select(0.0, 1.0, ((flagsOf(tk) & 1u) != 0u) == ch);
      aU[k] = select(0.0, 1.0, ((flagsOf(tk) & 2u) != 0u) == cu);
    }
    dIsoS = isoDist(aS, fr) / mppCss; dIsoH = isoDist(aH, fr) / mppCss; dIsoU = isoDist(aU, fr) / mppCss;
  } else {
    cid = idAt(p);
    if (!isLand(cid) && landMask > 0.5) { cid = nearestLand(p, max(mpp, 1.0)); }
  }
  let cLand = isLand(cid);
  // smoothed coast says land but no land id nearby (narrow water channels): trust the id raster
  if (!cLand && landMask > 0.5) { landMask = 0.0; }
  let cOwner = ownerKey(cid); let cProv = provKey(cid);
  let cSel = selKey(cid); let cHi = (flagsOf(cid) & 1u) != 0u; let cUnk = (flagsOf(cid) & 2u) != 0u;

  // ---------------- ring samples (soft bands, far-zoom lines) ----------------
  var rN = 1e3; var rP = 1e3; var rL = 1e3; var rS = 1e3; var rH = 1e3; var rU = 1e3;
  var prevR = 0.0;
  let ringCount = i32(U0.misc2.w);
  for (var ri = 0; ri < ringCount; ri++) {
    let r = U0.rings[ri];
    let est = (prevR + r) * 0.5;
    let rot = f32(ri) * 0.3927;
    for (var k = 0; k < 8; k++) {
      let ang = f32(k) * 0.785398 + rot;
      let q = p + vec2f(cos(ang), sin(ang)) * r * mppCss;
      let sid = idAt(q);
      if (sid == cid) { continue; }
      let sl = isLand(sid);
      if (cLand && sl) {
        if (ownerKey(sid) != cOwner) { rN = min(rN, est); }
        if (provKey(sid) != cProv) { rP = min(rP, est); }
        rL = min(rL, est);
      }
      if (selKey(sid) != cSel) { rS = min(rS, est); }
      if (((flagsOf(sid) & 1u) != 0u) != cHi) { rH = min(rH, est); }
      if (sid != 0u && ((flagsOf(sid) & 2u) != 0u) != cUnk) { rU = min(rU, est); }
    }
    prevR = r;
  }
  let useIso = closeBlend > 0.5;
  let dN = select(rN, dIsoN, useIso);
  let dP = select(rP, dIsoP, useIso);
  let dL = select(rL, dIsoL, useIso);
  let dS = select(rS, min(dIsoS, rS + 0.5), useIso);
  let dH = select(rH, dIsoH, useIso);
  let dU = select(rU, min(dIsoU, rU + 0.5), useIso);

  // ---------------- terrain ----------------
  var col = T.rgb;
  // close-zoom painterly detail
  let detailFade = smoothstep(1.2, 4.0, zoom);
  if (detailFade > 0.0 && landMask > 0.5) {
    col = mix(col, groundDetail(col, p, zoom, light), detailFade);
  }
  if (detailFade > 0.0) {
    let nd = fbm3(p * 0.9) - 0.5;
    col *= 1.0 + nd * 0.10 * detailFade;
    // forest canopy: small shaded tree crowns on a staggered grid, clustered by noise
    let forest = A.a;
    // with 3D trees standing on the map the painted crowns stay only as the forest floor
    let treeFade = smoothstep(2.6, 5.0, zoom) * (1.0 - 0.6 * U0.ex.w * smoothstep(5.0, 9.0, zoom));
    if (quality >= 1 && forest > 0.15 && landMask > 0.5 && treeFade > 0.0) {
      let cs = 1.35;
      let q = p / cs;
      let row = floor(q.y);
      let qx = q.x + select(0.0, 0.5, (i32(row) & 1) == 1);
      let cell = vec2f(floor(qx), row);
      let lp = vec2f(fract(qx), fract(q.y));
      let jit = hash22(cell) * 0.36 + 0.32;
      let dens = smoothstep(0.15, 0.85, forest) * (0.55 + 0.9 * vnoise(cell * 0.11));
      if (hash21(cell + 17.0) < dens) {
        let rr = 0.27 + hash21(cell + 3.0) * 0.1;
        let dv = lp - jit;
        let edge = (aa / cs) * 0.8;
        let cov = 1.0 - smoothstep(rr - edge, rr + edge, length(dv * vec2f(1.0, 1.1)));
        let sh = 1.0 - smoothstep(rr - edge, rr + edge * 2.0, length(dv - vec2f(0.12, 0.14)));
        let hl = clamp(dot(-dv / max(rr, 1e-3), vec2f(0.55, 0.75)) * 0.8 + 0.25, 0.0, 1.0);
        let treeCol = mix(vec3f(0.16, 0.25, 0.13), vec3f(0.36, 0.47, 0.25), hl) * mix(1.0, light, 0.5);
        col = mix(col, col * 0.7, sh * 0.45 * treeFade);
        col = mix(col, treeCol, cov * 0.8 * treeFade);
      }
    }
  }
  // the year on the land: autumn woods, a dull winter, a parched southern summer
  if (landMask > 0.0 && U0.env.z > 0.5) {
    let ph = U0.env.x;
    let lat = p.y / mapSize.y;
    let temperate = smoothstep(0.12, 0.3, lat) * (1.0 - smoothstep(0.62, 0.72, lat));
    let autumn = smoothstep(0.7, 0.77, ph) * (1.0 - smoothstep(0.86, 0.92, ph)) * temperate;
    let winter = (1.0 - smoothstep(0.14, 0.26, ph) + smoothstep(0.9, 0.98, ph)) * smoothstep(0.08, 0.3, lat + 0.1) * (1.0 - smoothstep(0.66, 0.78, lat));
    let summer = smoothstep(0.45, 0.55, ph) * (1.0 - smoothstep(0.68, 0.76, ph)) * smoothstep(0.6, 0.75, lat);
    let fo = A.a;
    let leafy = vec3f(0.62, 0.40, 0.17) * (0.85 + 0.3 * vnoise(p * 0.4));
    col = mix(col, leafy * mix(1.0, light, 0.5), autumn * smoothstep(0.15, 0.7, fo) * 0.45 * landMask);
    let lum = dot(col, vec3f(0.3, 0.55, 0.15));
    col = mix(col, vec3f(lum) * vec3f(1.02, 0.98, 0.9), winter * 0.14 * landMask);
    col = mix(col, vec3f(0.70, 0.62, 0.43) * mix(1.0, light, 0.6), summer * (1.0 - fo) * 0.22 * landMask);
  }
  // dynamic snow: lies longer on high ground and on slopes turned from the sun; thin snow is a dusting
  if (cLand) {
    let s = locs[cid - 1u].snow;
    if (s > 0.001) {
      // noise octaves fade out before they alias on screen
      let n1 = (vnoise(p * 0.05) - 0.5) * 0.16;
      let n2 = (vnoise(p * 0.18) - 0.5) * 0.2 * smoothstep(0.35, 1.2, zoom);
      let n3 = (vnoise(p * 0.8) - 0.5) * 0.14 * smoothstep(1.8, 5.0, zoom);
      let v = A.g * 0.8 + (1.0 - light) * 0.4 + n1 + n2 + n3 + 0.1;
      let soft = 0.08 + 0.1 * (1.0 - smoothstep(0.3, 2.0, zoom));
      let cover = smoothstep(1.0 - s - soft, 1.0 - s + soft, v);
      // a dusting: speckles in furrows and hollows, not a veil over everything
      let dust = smoothstep(0.2, 0.7, s) * smoothstep(0.58, 0.85, vnoise(p * 0.45) * 0.75 + vnoise(p * 2.0) * 0.25 + s * 0.15) * 0.6;
      let snowLit = vec3f(0.93, 0.95, 0.99) * mix(vec3f(0.74, 0.8, 0.94), vec3f(1.04, 1.03, 1.0), clamp(light - 0.35, 0.0, 1.0));
      col = mix(col, snowLit, clamp(cover * 0.9 + dust * (1.0 - cover), 0.0, 1.0) * landMask);
    }
  }

  // ---------------- water ----------------
  let waterMask = 1.0 - landMask;
  if (waterMask > 0.0) {
    let coastD = max(sdfMap, 0.0);
    var wc = waterColor(T.a, coastD, light);
    // animated waves (normal from noise derivative); each octave fades out when its period gets small on screen
    let oct = i32(U0.misc2.z);
    var gsum = vec2f(0.0);
    var sc = 0.06; var amp = 1.0;
    for (var o = 0; o < oct; o++) {
      let dirv = vec2f(0.8, 0.35) * time * (0.5 + f32(o) * 0.35);
      let ca = cos(f32(o) * 1.1 + 0.4); let sa = sin(f32(o) * 1.1 + 0.4);
      let pr2 = vec2f(ca * p.x - sa * p.y, sa * p.x + ca * p.y);
      var nd = vnoised(pr2 * sc + dirv + f32(o) * 13.7);
      nd = vec3f(nd.x, ca * nd.y + sa * nd.z, -sa * nd.y + ca * nd.z);
      let vis = smoothstep(8.0, 28.0, zoom / sc);
      gsum += nd.yz * sc * amp * vis;
      sc *= 2.1; amp *= 0.6;
    }
    // broad swell visible at all zooms
    let sw = vnoised(p * 0.012 + vec2f(time * 0.05, time * 0.02));
    gsum = gsum * 1.4 + sw.yz * 0.012 * 2.0;
    let wn = normalize(vec3f(-gsum * 0.9, 1.0));
    // the mirrored sky follows only the long swell, or every wave crest turns into a white blotch
    let wnF = normalize(vec3f(-gsum * 0.22, 1.0));
    let sun = normalize(vec3f(-0.45, -0.6, 0.66));
    let hv = normalize(sun + V);
    // a sun glitter on the ripples, kept faint: with the camera tilted the mirror lobe would light whole swells
    let spec = pow(max(dot(wn, hv), 0.0), mix(80.0, 320.0, tilt)) * mix(0.08, 0.12, tilt) * (0.4 + 0.9 * vnoise(p * 2.3 + time * 0.4));
    let diffW = 0.93 + 0.07 * dot(wn, sun) / sun.z;
    // the sky mirrored in the sea, stronger at grazing angles
    let fres = 0.02 + 0.98 * pow(1.0 - max(dot(wnF, V), 0.0), 5.0);
    let skyC = mix(vec3f(0.70, 0.78, 0.84), vec3f(0.46, 0.58, 0.70), clamp(V.z, 0.0, 1.0));
    wc = mix(wc * diffW, skyC, fres * 0.55 * tilt) + vec3f(1.0, 0.97, 0.88) * spec;
    // painted waterlines parallel to the coast
    let lineW = mpp * 0.9;
    var wl = 0.0;
    var dists = vec3f(9.0, 20.0, 34.0);
    for (var k = 0; k < 3; k++) {
      let dk = dists[k] + (vnoise(p * 0.05 + f32(k) * 7.0) - 0.5) * 3.0;
      wl += (1.0 - smoothstep(0.0, lineW + 0.35, abs(coastD - dk))) * (0.42 - f32(k) * 0.12);
    }
    let wlFade = smoothstep(0.12, 0.5, zoom) * (1.0 - smoothstep(6.0, 14.0, zoom) * 0.6);
    wc = mix(wc, wc * 1.18 + 0.03, clamp(wl, 0.0, 1.0) * wlFade);
    // shoreline foam band
    let foamW = max(1.6, 1.2 * mppCss);
    let fn1 = vnoise(p * 0.45 + vec2f(time * 0.3, -time * 0.2));
    let surf = 0.5 + 0.5 * sin(coastD * 2.2 - time * 1.8 + fn1 * 4.0);
    let surfFade = smoothstep(0.8, 3.0, zoom);
    var foam = (1.0 - smoothstep(0.0, foamW, coastD)) * 0.5;
    foam += (1.0 - smoothstep(foamW, foamW * 3.0, coastD)) * smoothstep(0.6, 0.95, surf * fn1 + 0.25) * 0.3 * surfFade;
    wc = mix(wc, vec3f(0.86, 0.92, 0.90), clamp(foam, 0.0, 1.0));
    col = mix(col, wc, waterMask);
  }
  // coastline ink line
  let coastLine = 1.0 - smoothstep(0.2 * mpp, 1.1 * mpp + 0.08, abs(sdfMap + 0.4 * mpp));
  col = mix(col, vec3f(0.22, 0.19, 0.15), coastLine * 0.55);

  // ---------------- overlay (political / map mode) ----------------
  var overlayCol = vec3f(0.0); var overlayA = 0.0; var ownerCol = vec3f(0.0);
  if (cid != 0u && mode != 1) {
    let L = locs[cid - 1u];
    var c = unpackC(L.color);
    // ink-spread transition
    if (L.animStart >= 0.0) {
      let orig = vec2f(f32(L.origin & 0xffffu), f32(L.origin >> 16u));
      let reveal = L.animStart + distance(p, orig) / U0.misc2.x + (vnoise(p * 0.08) - 0.5) * 0.18 + (vnoise(p * 0.5) - 0.5) * 0.05;
      let dt = time - reveal;
      if (dt < 0.0) {
        c = unpackC(L.prev);
      } else if (dt < 0.25) {
        let rim = 1.0 - dt / 0.25;
        c = vec4f(mix(c.rgb, c.rgb * 0.55, rim * 0.8), max(c.a, rim));
      }
    }
    let isSeaPaint = !cLand && mode == 2;
    if (cLand || isSeaPaint) {
      overlayA = c.a * U0.map.w * select(landMask, waterMask, isSeaPaint);
      overlayCol = c.rgb;
      // occupation stripes in controller colour
      let cc = unpackC(L.ctrl);
      if (mode == 0 && cc.a > 0.0) {
        let u = (p.x + p.y) * zoom / 10.0;
        let aaS = mppCss * zoom * 1.5 / 10.0;
        let sm = smoothstep(0.5 - aaS, 0.5 + aaS, abs(fract(u) - 0.5) * 2.0);
        overlayCol = mix(overlayCol, cc.rgb, sm);
        overlayA = max(overlayA, sm * 0.85 * landMask);
      }
    }
    ownerCol = c.rgb;
  }
  if (overlayA > 0.0) {
    let reliefK = mix(0.5, 0.8, smoothstep(0.5, 3.0, zoom));
    let lit = overlayCol * mix(1.0, light, reliefK) * 1.04;
    col = mix(col, lit, overlayA);
  }

  // ---------------- roads (under the rivers: the bridges are implied) ----------------
  let rw = textureLoad(riverTex, vec2i(fc.xy), 0);
  let rd = rw.g * landMask;
  if (rd > 0.0) {
    // tracks and roads are beaten earth; the best roads are paved with pale stone
    let paved = smoothstep(0.78, 0.98, rd);
    let earth = mix(vec3f(0.54, 0.45, 0.33), vec3f(0.6, 0.57, 0.51), paved) * mix(1.0, light, 0.55);
    col = mix(col, earth, min(1.0, rd * 1.05) * 0.85 * (1.0 - 0.5 * overlayA));
  }
  // ---------------- rivers ----------------
  let rv = rw.r * landMask;
  if (rv > 0.0) {
    let rc = vec3f(0.22, 0.42, 0.56) * mix(1.0, light, 0.3);
    col = mix(col, rc, rv * 0.92);
  }

  // ---------------- borders ----------------
  if (cLand && mode != 1) {
    // location borders (close zoom)
    let fadeL = smoothstep(1.6, 3.2, zoom);
    if (fadeL > 0.0 && dL < 2.0) {
      col = mix(col, col * 0.7, (1.0 - smoothstep(0.15, 0.8, dL)) * 0.24 * fadeL);
    }
    // province borders (mid zoom)
    let fadeP = smoothstep(0.55, 1.2, zoom);
    if (fadeP > 0.0 && dP < 3.0) {
      col = mix(col, col * 0.38, (1.0 - smoothstep(0.35, 1.05, dP)) * 0.6 * fadeP);
    }
    // nation borders: dark core + soft inner band in owner colour
    if (cOwner != -100) {
      let hwN = clamp(0.9 + 0.45 * log2(max(zoom, 0.25) + 1.0), 0.8, 2.4);
      let core = 1.0 - smoothstep(hwN - 0.6, hwN + 0.6, dN);
      if (mode == 0 && cOwner >= 0 && overlayA > 0.0) {
        let band = (1.0 - smoothstep(0.0, U0.rings[ringCount - 1] + 1.0, rN)) * 0.45;
        col = mix(col, ownerCol * mix(1.0, light, 0.6) * 1.12, band);
      }
      let pol = cOwner >= 0 && mode == 0;
      let bc = select(vec3f(0.12, 0.10, 0.09), ownerCol * 0.42, pol);
      let coreF = select(1.0 - smoothstep(hwN * 0.6 - 0.5, hwN * 0.6 + 0.5, dN), core, pol);
      col = mix(col, bc, coreF * select(0.6, 0.92, pol));
    }
  }
  // terra incognita: lands and seas the player's people have not yet explored lie under blank parchment
  let fogIn = select(0.0, 1.0, cUnk);
  let fogEdge = 1.0 - smoothstep(0.0, 10.0, dU);
  let fog = select(fogEdge * 0.5, 1.0 - fogEdge * 0.5, cUnk);
  if (fog > 0.001) {
    let fogN = fbm3(p * 0.012 + vec2f(time * 0.004, 0.0));
    let swirl = vnoise(p * 0.05 + vec2f(fogN * 3.0, -time * 0.01));
    var parch = vec3f(0.80, 0.73, 0.58) * (0.9 + 0.18 * fogN) - vec3f(0.05, 0.05, 0.04) * swirl * fogIn;
    // faint engraved hatching, as on old charts
    let hatch = 1.0 - smoothstep(0.0, 0.18, abs(fract((p.x - p.y) * 0.08) - 0.5) - 0.32);
    parch = mix(parch, parch * 0.9, hatch * 0.35 * smoothstep(0.4, 1.5, zoom));
    col = mix(col, parch * vign, fog * 0.96);
  }
  // highlight set
  if (cHi) {
    col = mix(col, vec3f(1.0, 0.97, 0.85), 0.16 + 0.06 * sin(time * 3.0));
  }
  if (dH < 3.0) { col = mix(col, vec3f(1.0, 0.98, 0.9), (1.0 - smoothstep(0.4, 1.3, dH)) * 0.7); }
  // hover
  if (i32(cid) - 1 == i32(U0.misc.z) && cid != 0u) { col = col * 1.07 + 0.015; }
  // selection: inner/outer glow + bright outline
  if (U0.misc.y >= 0.0) {
    let pulse = 0.85 + 0.15 * sin(time * 2.6);
    if (cSel) {
      col = col * 1.08 + 0.02;
      let gl = exp(-dS / 4.0) * 0.45 * pulse;
      col = mix(col, vec3f(1.0, 0.88, 0.45), gl);
    } else {
      let gl = exp(-dS / 3.0) * 0.55;
      col = mix(col, col * 0.55, gl * 0.5);
    }
    let ol = 1.0 - smoothstep(0.6, 1.5, dS);
    col = mix(col, vec3f(1.0, 0.93, 0.62), ol * pulse);
  }

  // ---------------- weather ----------------
  // fronts drift across the map with the days (the same for every player); wetter in autumn and winter
  if (U0.env.z > 0.5) {
    let day = U0.env.y;
    let ph = U0.env.x;
    let wet = 0.5 + 0.5 * cos((ph - 0.9) * 6.2832);
    let wp = p * 0.0065 + vec2f(day * 0.55, day * 0.12);
    let front = fbm3(wp) + (vnoise(p * 0.03 + vec2f(day * 2.0, 0.0)) - 0.5) * 0.18;
    let southDry = smoothstep(0.62, 0.8, p.y / mapSize.y) * (1.0 - wet * 0.6);
    let cloud = smoothstep(0.52 - wet * 0.08 + southDry * 0.2, 0.74, front);
    let rain = smoothstep(0.66, 0.8, front) * (1.0 - southDry);
    // cloud shadows
    col *= 1.0 - cloud * 0.16;
    // rain darkens and greys the ground, storms whip the sea white
    let lum2 = dot(col, vec3f(0.3, 0.55, 0.15));
    col = mix(col, vec3f(lum2) * vec3f(0.92, 0.95, 1.0), rain * 0.25);
    if (waterMask > 0.5 && rain > 0.0) {
      // small, short-lived crests drawn out along the wind, not blotches
      let cq = p * vec2f(2.6, 7.5) + vec2f(time * 1.4, time * 0.2);
      let cap = smoothstep(0.86, 0.97, vnoise(cq) * (0.55 + 0.6 * vnoise(p * 0.2 - time * 0.05)));
      col = mix(col * (1.0 - 0.1 * rain), vec3f(0.86, 0.9, 0.93), cap * rain * 0.4 * smoothstep(2.0, 5.0, zoom));
    }
    // rain or snow falling, close in
    let fallFade = rain * smoothstep(2.5, 6.0, zoom);
    if (fallFade > 0.01) {
      let snowing = cLand && locs[cid - 1u].snow > 0.25;
      if (snowing) {
        let sp = fc.xy / pr * vec2f(1.0, 1.0) + vec2f(sin(time * 0.7) * 20.0, -time * 40.0);
        let cell = floor(sp / 9.0);
        let o = hash22(cell) * 7.0 + 1.0;
        let flake = 1.0 - smoothstep(0.6, 1.4, length(sp - cell * 9.0 - o));
        col = mix(col, vec3f(0.96, 0.97, 1.0), flake * step(0.55, hash21(cell + 3.3)) * fallFade * 0.8);
      } else {
        let sp = fc.xy / pr + vec2f(-time * 60.0, -time * 520.0);
        let k = vec2f(sp.x + sp.y * 0.18, sp.y);
        let cell = floor(k / vec2f(5.0, 26.0));
        let fy = fract(k.y / 26.0);
        let fx = fract(k.x / 5.0);
        let streak = (1.0 - smoothstep(0.0, 0.12, abs(fx - 0.5))) * smoothstep(0.0, 0.3, fy) * (1.0 - smoothstep(0.55, 0.85, fy));
        col = mix(col, vec3f(0.78, 0.82, 0.88), streak * step(0.8, hash21(cell)) * fallFade * smoothstep(0.3, 0.8, rain) * 0.28);
      }
    }
    // morning mist in autumn over low, wet land
    let autumnW = smoothstep(0.7, 0.78, ph) * (1.0 - smoothstep(0.9, 0.97, ph));
    let mist = autumnW * (1.0 - smoothstep(0.0, 1.2, G.z)) * smoothstep(0.45, 0.75, fbm3(p * 0.02 + vec2f(time * 0.01, day * 0.3))) * landMask;
    col = mix(col, vec3f(0.86, 0.88, 0.9), mist * 0.35 * smoothstep(0.8, 2.5, zoom));
    // seen from high up, the clouds themselves
    let high = 1.0 - smoothstep(0.55, 1.3, zoom);
    if (high > 0.0) {
      let puff = smoothstep(0.58 - wet * 0.06, 0.82, front + (fbm3(p * 0.025 + vec2f(day * 0.8, 0.0)) - 0.5) * 0.25);
      col = mix(col, vec3f(0.94, 0.95, 0.97), puff * high * 0.42);
    }
  }

  // aerial perspective: distant land fades into a blue haze when the camera leans in
  let haze = smoothstep(U0.eye.w * 1.05, U0.eye.w * 2.6, eyeDist) * tilt;
  col = mix(col, vec3f(0.62, 0.69, 0.75), haze * 0.55);
  // paper grain + vignette
  let grain = (hash21(floor(p * 2.0)) - 0.5) * 0.025 * (1.0 - smoothstep(4.0, 10.0, zoom));
  col = (col + grain) * vign;
  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;
