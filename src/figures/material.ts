// How the figures are drawn: one instanced mesh per piece of the world, near or far kit, and a material whose vertex
// stage does all the work. Each figure goes its way back and forth, swings legs and arms, folds away what it does not
// wear or carry, and takes its colours, from five numbers per figure that never change. Per frame the processor only
// advances the clock. Main thread only (needs the renderer's node materials).
import * as THREE from 'three/webgpu';
import { Fn, abs, attribute, cos, float, fract, instancedBufferAttribute, length, max, mix, normalLocal, positionGeometry, select, sin, uniform, varying, vec2, vec3, vec4 } from 'three/tsl';
import type { Figures } from './crowd';
import { HIP, Joint, Load, SHOULDER, Slot, buildKit, FAR_PARTS, NEAR_PARTS } from './kit';

type F = THREE.Node<'float'>;
type V3 = THREE.Node<'vec3'>;
/** true where a number equals a whole number k */
const is = (v: F, k: number) => abs(v.sub(k)).lessThan(0.5);
/** a colour 0xRRGGBB, given as a number, to linear light (the look probe's colours are sRGB) */
const unpack = (n: F): V3 => {
  const r = n.div(65536).floor(), g = n.sub(r.mul(65536)).div(256).floor(), b = n.sub(r.mul(65536)).sub(g.mul(256));
  return vec3(r, g, b).div(255).pow(vec3(2.2));
};
/** turns (y, z) about the x axis by `a` */
const turnX = (v: V3, a: F): V3 => vec3(v.x, v.y.mul(cos(a)).sub(v.z.mul(sin(a))), v.y.mul(sin(a)).add(v.z.mul(cos(a))));

/** The figures' clock in seconds: the page's own, so that a click can find where a walker is (stage.ts figureAt). */
export const figureSeconds = () => performance.now() / 1000;
const time = uniform(0).onFrameUpdate(figureSeconds);

/** Where a figure stands at a time, in its piece (the same as the vertex stage below, on the processor). */
export function figureAt(f: { a: Float32Array; b: Float32Array; c: Float32Array }, i: number, t: number): [number, number, number] {
  const a = i * 4, x0 = f.a[a], y0 = f.a[a + 1], z0 = f.a[a + 2];
  if (Math.abs(f.c[a] - 1) > 0.5) return [x0, y0, z0];
  const dx = f.b[a] - x0, dz = f.b[a + 2] - z0, long = Math.max(Math.hypot(dx, dz), 0.001);
  const v = (t * f.b[a + 3]) / (long * 2) + f.a[a + 3], lap = v - Math.floor(v), along = lap < 0.5 ? lap * 2 : 2 - lap * 2;
  return [x0 + dx * along, y0 + (f.b[a + 1] - y0) * along, z0 + dz * along];
}

/** Strides a second: a cadence of about 110 steps a minute at comfortable pace (Bohannon 1997), two steps a stride. */
const STRIDE = 2 * Math.PI * 0.92;

/** The per-figure vec4 lists side by side: figure i holds lists[0][i], lists[1][i], ... (each four floats). */
export function interleave(lists: readonly Float32Array[], count: number): Float32Array {
  const w = lists.length * 4, out = new Float32Array(Math.max(count, 1) * w);
  for (let i = 0; i < count; i++) lists.forEach((l, k) => out.set(l.subarray(i * 4, i * 4 + 4), i * w + k * 4));
  return out;
}

function material(f: Figures): THREE.MeshLambertNodeMaterial {
  // The five numbers per figure go to the graphics card as ONE interleaved vertex buffer: with three of the kit and
  // the instance matrix, five separate ones made nine, and WebGPU allows only eight by default (maxVertexBuffers),
  // so the pipeline failed and no figure was drawn on a real WebGPU device (Chrome on a Mac, 15 November 2026).
  const all = interleave([f.a, f.b, f.c, f.d, f.e], f.count);
  const buffer = new THREE.InstancedInterleavedBuffer(all, 20);
  const inst = (k: number) => (instancedBufferAttribute(buffer as never, 'vec4', 20, k * 4) as unknown as { setInstanced(v: boolean): THREE.Node<'vec4'> }).setInstanced(true);
  const A = inst(0), B = inst(1), C = inst(2), D = inst(3), E = inst(4);
  const info = vec4(attribute('info', 'vec4')), slot = info.x, joint = info.y, part = info.z, variant = info.w;
  const mode = C.x, carried = C.y, cut = C.z, head = C.w, walking = is(mode, 1), working = is(mode, 2);

  const m = new THREE.MeshLambertNodeMaterial();
  m.positionNode = Fn(() => {
    // what this figure does not wear or carry is folded into a point
    const hidden = part.greaterThan(0.5).and(abs(part.sub(carried)).greaterThan(0.1))
      .or(variant.greaterThan(-0.5).and(variant.lessThan(1.5)).and(abs(variant.sub(cut)).greaterThan(0.1)))
      .or(variant.greaterThan(9.5).and(abs(variant.sub(head)).greaterThan(0.1)));
    // the way: there and back again, at the figure's pace
    const way = B.xyz.sub(A.xyz), long = max(length(way.xz), float(0.001));
    const lap = fract(time.mul(B.w).div(long.mul(2)).add(A.w)), out = lap.lessThan(0.5);
    const along = select(out, lap.mul(2), float(2).sub(lap.mul(2)));
    const at = select(walking, mix(A.xyz, B.xyz, along), A.xyz);
    const facing = select(walking, way.xz.div(long).mul(select(out, float(1), float(-1))), vec2(sin(E.z), cos(E.z)));
    // legs and arms
    const clock = time.mul(STRIDE).add(A.w.mul(7)), swing = select(walking, sin(clock).mul(0.42), sin(time.mul(0.7).add(A.w)).mul(0.04));
    const leg = select(is(joint, Joint.LegL), swing, swing.negate());
    const shouldered = is(carried, Load.Sack).or(is(carried, Load.Log)), held = is(carried, Load.Basket).or(is(carried, Load.Bundle));
    let arm = select(is(joint, Joint.ArmL), swing.mul(-0.8), swing.mul(0.8));
    arm = select(shouldered, float(-2.4).add(sin(clock).mul(0.05)), arm);
    arm = select(held, float(0.9), arm);
    arm = select(is(carried, Load.Spear).and(is(joint, Joint.ArmR)), float(0.35), arm);
    arm = select(working, float(1.2).add(sin(time.mul(3).add(A.w)).mul(0.9)), arm);
    const isLeg = is(joint, Joint.LegL).or(is(joint, Joint.LegR)), isArm = is(joint, Joint.ArmL).or(is(joint, Joint.ArmR));
    const angle = select(isLeg, leg, select(isArm, arm, float(0))), pivot = vec3(0, select(isLeg, float(HIP), float(SHOULDER)), 0);
    let p = turnX(positionGeometry.sub(pivot), angle).add(pivot), n = turnX(normalLocal, angle);
    // at work the body bends forward over the hoe
    const lean = select(working, float(-0.25).sub(sin(time.mul(3).add(A.w)).mul(0.12)), float(0));
    p = turnX(p, lean); n = turnX(n, lean);
    p = p.add(vec3(0, select(walking, abs(sin(clock)).mul(0.03), float(0)), 0));
    // turn the front (-z) to the facing, then stand at the place
    const c = facing.y.negate(), s = facing.x.negate();
    const yaw = (v: V3): V3 => vec3(v.x.mul(c).add(v.z.mul(s)), v.y, v.z.mul(c).sub(v.x.mul(s)));
    normalLocal.assign(yaw(n));
    return select(hidden, at, yaw(p).add(at));
  })();
  const colour = select(is(slot, Slot.Skin), unpack(D.x), select(is(slot, Slot.Tunic), unpack(D.y), select(is(slot, Slot.Legs), unpack(D.z),
    select(is(slot, Slot.Headwear), unpack(D.w), select(is(slot, Slot.Load), unpack(E.x), select(is(slot, Slot.Shoes), vec3(0.02, 0.015, 0.01),
      select(is(slot, Slot.Belt), unpack(D.y).mul(0.35), unpack(E.y))))))));
  m.colorNode = varying(colour);
  return m;
}

const kits = { near: buildKit(NEAR_PARTS), far: buildKit(FAR_PARTS) };
const geometries = new Map<'near' | 'far', THREE.BufferGeometry>();
function geometry(which: 'near' | 'far') {
  let g = geometries.get(which);
  if (!g) {
    const k = kits[which];
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(k.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(k.nor, 3)); g.setAttribute('info', new THREE.BufferAttribute(k.info, 4));
    geometries.set(which, g);
  }
  return g;
}

/** triangles of one figure, near and far */
export const TRIANGLES = { near: kits.near.triangles, far: kits.far.triangles };

/** The two meshes of a piece's figures, near and far; the caller shows one of them (see detail.ts). */
export function figureMeshes(f: Figures): { near: THREE.InstancedMesh; far: THREE.InstancedMesh } {
  const m = material(f);
  const make = (which: 'near' | 'far') => {
    const mesh = new THREE.InstancedMesh(geometry(which), m, f.count);
    // the figures are placed by the material, not by the instance matrices (left as they are, unit), so the mesh
    // cannot know its own bounds: it is never culled, and a piece leaves the stage as a whole
    mesh.frustumCulled = false;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.figures = which;
    return mesh;
  };
  return { near: make('near'), far: make('far') };
}
