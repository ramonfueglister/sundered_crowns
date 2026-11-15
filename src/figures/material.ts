// How the figures are drawn: one instanced mesh per piece of the world, near or far kit, and a material whose vertex
// stage does all the work. Each figure goes its way back and forth, swings legs and arms, folds away what it does not
// wear or carry, and takes its colours, from five numbers per figure that never change. Per frame the processor only
// advances the clock. Main thread only (needs the renderer's node materials).
import * as THREE from 'three/webgpu';
import { Fn, abs, attribute, cos, float, fract, instancedBufferAttribute, length, max, mix, normalLocal, positionGeometry, select, sin, time, varying, vec2, vec3, vec4 } from 'three/tsl';
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

/** Strides a second: a cadence of about 110 steps a minute at comfortable pace (Bohannon 1997), two steps a stride. */
const STRIDE = 2 * Math.PI * 0.92;

function material(f: Figures): THREE.MeshLambertNodeMaterial {
  const inst = (list: Float32Array) => instancedBufferAttribute(new THREE.InstancedBufferAttribute(list, 4)) as unknown as THREE.Node<'vec4'>;
  const A = inst(f.a), B = inst(f.b), C = inst(f.c), D = inst(f.d), E = inst(f.e);
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
