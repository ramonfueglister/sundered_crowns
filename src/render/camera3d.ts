// 3D camera for the map: a perspective camera that looks straight down at far zoom and tilts towards the horizon
// as the player zooms in. World space is right-handed with X = map x (east), Y = map y (south) and Z pointing DOWN
// (height above sea level is -Z), so that north stays at the top of the screen without mirroring.

export type Mat4 = Float32Array;

export interface Cam3 {
  view: Mat4; proj: Mat4; vp: Mat4;
  eye: [number, number, number];
  /** distance from the eye to the target point on the sea-level plane, in map px */
  dist: number;
  pitch: number;
  /** css px per map px at view depth 1 (scale at depth d is focal / d) */
  focal: number;
  near: number; far: number;
  cssW: number; cssH: number;
}

export const FOV_Y = (30 * Math.PI) / 180;
export const MAX_PITCH = (52 * Math.PI) / 180;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Tilt of the camera for a zoom level: flat over the whole continent, leaning in over a region. */
export function pitchFor(zoom: number, maxPitch = MAX_PITCH) {
  const t = clamp((Math.log2(zoom) - Math.log2(0.7)) / (Math.log2(7) - Math.log2(0.7)), 0, 1);
  return maxPitch * smooth(t);
}

export function makeCamera(cx: number, cy: number, zoom: number, cssW: number, cssH: number, maxPitch = MAX_PITCH, maxTerrain = 40): Cam3 {
  const t = Math.tan(FOV_Y / 2);
  const focal = cssH / 2 / t;
  const dist = focal / zoom;
  const pitch = pitchFor(zoom, maxPitch);
  const eye: [number, number, number] = [cx, cy + dist * Math.sin(pitch), -dist * Math.cos(pitch)];
  const view = lookAt(eye, [cx, cy, 0], [0, -1, 0]);
  const near = Math.max(0.5, (dist * Math.cos(pitch) - maxTerrain) * 0.5);
  const far = dist * (pitch > 0.05 ? 1 / Math.max(0.15, Math.cos(pitch + FOV_Y / 2)) : 1) * 1.6 + maxTerrain * 2;
  const proj = perspective(FOV_Y, cssW / cssH, near, far);
  const vp = mul(proj, view);
  return { view, proj, vp, eye, dist, pitch, focal, near, far, cssW, cssH };
}

export function lookAt(eye: number[], target: number[], up: number[]): Mat4 {
  let fx = target[0] - eye[0], fy = target[1] - eye[1], fz = target[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  // s = f x up
  let sx = fy * up[2] - fz * up[1], sy = fz * up[0] - fx * up[2], sz = fx * up[1] - fy * up[0];
  const sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
  // u = s x f
  const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
  const m = new Float32Array(16);
  m[0] = sx; m[1] = ux; m[2] = -fx; m[3] = 0;
  m[4] = sy; m[5] = uy; m[6] = -fy; m[7] = 0;
  m[8] = sz; m[9] = uz; m[10] = -fz; m[11] = 0;
  m[12] = -(sx * eye[0] + sy * eye[1] + sz * eye[2]);
  m[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
  m[14] = fx * eye[0] + fy * eye[1] + fz * eye[2];
  m[15] = 1;
  return m;
}

/** WebGPU clip space (depth 0..1), right-handed view space looking down -Z */
export function perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f;
  m[10] = far / (near - far); m[11] = -1;
  m[14] = (near * far) / (near - far);
  return m;
}

export function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}

/** world point -> [css x, css y, view depth, ndc z]; depth <= 0 means behind the camera */
export function project(c: Cam3, x: number, y: number, z: number): [number, number, number, number] {
  const m = c.vp;
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cz = m[2] * x + m[6] * y + m[10] * z + m[14];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  const iw = 1 / cw;
  return [(cx * iw * 0.5 + 0.5) * c.cssW, (0.5 - cy * iw * 0.5) * c.cssH, cw, cz * iw];
}

/** ray through a css pixel: origin (the eye) and normalised direction in world space */
export function ray(c: Cam3, sx: number, sy: number): { o: [number, number, number]; d: [number, number, number] } {
  const t = Math.tan(FOV_Y / 2);
  const nx = (sx / c.cssW) * 2 - 1, ny = 1 - (sy / c.cssH) * 2;
  const vx = nx * t * (c.cssW / c.cssH), vy = ny * t, vz = -1; // view space direction
  const v = c.view; // rows of the rotation part are s, u, -f (stored column-major)
  const dx = v[0] * vx + v[1] * vy + v[2] * vz;
  const dy = v[4] * vx + v[5] * vy + v[6] * vz;
  const dz = v[8] * vx + v[9] * vy + v[10] * vz;
  const l = Math.hypot(dx, dy, dz);
  return { o: [c.eye[0], c.eye[1], c.eye[2]], d: [dx / l, dy / l, dz / l] };
}

/** where a screen ray meets the sea-level plane (z = 0) */
export function screenToPlane(c: Cam3, sx: number, sy: number): [number, number] {
  const { o, d } = ray(c, sx, sy);
  if (d[2] <= 1e-6) return [o[0] + d[0] * c.far, o[1] + d[1] * c.far];
  const t = -o[2] / d[2];
  return [o[0] + d[0] * t, o[1] + d[1] * t];
}

/** first hit of a screen ray with a height field (heightAt returns the terrain height in world units, >= 0 up) */
export function screenToTerrain(c: Cam3, sx: number, sy: number, heightAt: (x: number, y: number) => number, maxH: number): [number, number] {
  const { o, d } = ray(c, sx, sy);
  if (d[2] <= 1e-6) return screenToPlane(c, sx, sy);
  // start where the ray drops below the highest terrain, end at sea level
  const t0 = Math.max(0, (-maxH - o[2]) / d[2]), t1 = -o[2] / d[2];
  const step = Math.max(0.5, (t1 - t0) / 160);
  let prevT = t0;
  for (let t = t0; t <= t1 + step; t += step) {
    const x = o[0] + d[0] * t, y = o[1] + d[1] * t, z = o[2] + d[2] * t;
    if (-z <= heightAt(x, y)) {
      // refine between prevT and t
      let a = prevT, b = t;
      for (let i = 0; i < 12; i++) {
        const m = (a + b) / 2;
        const mz = o[2] + d[2] * m;
        if (-mz <= heightAt(o[0] + d[0] * m, o[1] + d[1] * m)) b = m; else a = m;
      }
      return [o[0] + d[0] * b, o[1] + d[1] * b];
    }
    prevT = t;
  }
  return [o[0] + d[0] * t1, o[1] + d[1] * t1];
}
