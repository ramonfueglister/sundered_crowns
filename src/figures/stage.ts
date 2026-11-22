// The figures on the stage (lookprobe/stage.ts): which pieces show figures, near or far kit by how much of the world
// is in the picture, and whether anything walks, so that the stage keeps drawing. Main thread only.
import type * as THREE from 'three/webgpu';
import { Group } from 'three/webgpu';
import { FIGURE_AT, PLAN } from './aims';
import type { Figures } from './crowd';
import { figureMeshes as build, riderMesh, figureAt as standing, figureSeconds, thinnedOut } from './material';
import { type FigureClock, figureShown } from './schedule';

export type { Figures } from './crowd';
export { figureSeconds };

/**
 * Up to this many blocks of the finest step across the picture a figure is drawn with its full kit; beyond it, with
 * the far kit. At 1672 pixels across, 260 blocks give 6.4 pixels a block: a figure stands 8 pixels tall, too small for
 * faces and hands. Drawing value.
 */
export const NEAR_UNTIL = 260;

type Kit = THREE.Mesh<THREE.InstancedBufferGeometry>;
interface Pair {
  near: Kit;
  far: Kit;
  f: Figures;
  /** the share of the figures that is drawn */
  kept: number;
  /** the share of them that has gone (`thinFigures`) */
  thinned: number;
}
const shown = new Set<Pair>(),
  pairOf = new WeakMap<THREE.Object3D, Pair>();
/** the stage's blocks across the picture */
let across = 0;
/**
 * Both kits of a piece are on the stage all the time, and the one not in use draws none of its figures: so the
 * renderer has the pipelines of both when the piece arrives, and the change of kit costs nothing (shown and hidden
 * instead, the far kits of all pieces were set up in the one frame of the change: 60 to 80 ms, Chrome on a Mac,
 * 16 November 2026).
 */
const draw = (p: Pair) => {
  // (a block of the finest step is as many of the stage's as the mesh and its piece are scaled: a far step's figures
  // and those of a finer piece on a far step's stage are smaller)
  const n = Math.round(p.f.count * p.kept),
    near = across <= NEAR_UNTIL * p.near.scale.x * (p.near.parent?.scale.x ?? 1);
  p.near.geometry.instanceCount = near ? n : 0;
  p.far.geometry.instanceCount = near ? 0 : n;
};

/** Tells a mesh of figures that it leaves the stage: the renderer and the mesh's own listeners let go of what they hold. */
export const disposeFigures = (mesh: THREE.Object3D) => mesh.dispatchEvent({ type: 'dispose' } as never);

/** Makes the two meshes of a piece's figures and keeps them until the stage disposes of the near one (`disposeFigures`). */
export function figureMeshes(f: Figures) {
  const pair: Pair = { ...build(f), f, kept: 1, thinned: 0 };
  pairOf.set(pair.near, pair);
  pairOf.set(pair.far, pair);
  draw(pair);
  if (rulerColours.size) paint(pair);
  if (clock) follow(pair, clock);
  shown.add(pair);
  pair.near.addEventListener('dispose' as never, () => {
    shown.delete(pair);
    disposeFigures(pair.far);
  });
  return pair;
}

/** One figure of each kit, both shown, on the figures' layer `1`: drawn once somewhere out of sight, it has the renderer build the figures' shaders ahead of need. */
export function warmFigures(): THREE.Group {
  const none = () => new Float32Array(4),
    pair = build({ count: 1, a: none(), b: none(), c: none(), d: none(), e: none() }),
    group = new Group();
  for (const mesh of [pair.near, pair.far]) {
    mesh.layers.set(1);
    group.add(mesh);
  }
  return group;
}

/** Shows the near or the far kit, for a picture `wide` of the stage's blocks wide. */
export function showFigures(wide: number) {
  across = wide;
  for (const p of shown) draw(p);
}

/** Draws only a share of the figures a mesh belongs to: they come and go one by one. */
export function keepFigures(mesh: THREE.Object3D, kept: number) {
  const p = pairOf.get(mesh);
  if (p) {
    p.kept = kept;
    draw(p);
  }
}

/**
 * Lets a share of the figures a mesh belongs to go, 0 … 1: they go one by one all over the piece (material.ts), as
 * the view nears the border of a step that draws no figures. Returns whether that changed (the stage then needs a
 * picture).
 */
export function thinFigures(mesh: THREE.Object3D, share: number) {
  const p = pairOf.get(mesh);
  if (!p || p.thinned === share) return false;
  p.thinned = share;
  // (the shader reads it from the mesh it draws)
  p.near.userData.thinned = share;
  p.far.userData.thinned = share;
  return true;
}

/**
 * The person whose figure stands nearest a point of the world (finest world blocks; y in blocks as the piece was
 * built), within `reach` blocks across (the click hits the ground just behind a figure) and three up or down, or null: anonymous figures (outside the 30 cities, or
 * without a world server) do not count.
 */
export function personAt(x: number, y: number, z: number, reach = 2): number | null {
  const t = figureSeconds();
  let best: number | null = null,
    bestD = reach;
  for (const p of shown) {
    const lx = x - (p.f.ox ?? 0),
      lz = z - (p.f.oz ?? 0);
    for (let i = 0; i < p.f.count; i++) {
      const id = p.f.e[i * 4 + 3];
      if (!id || !onStage(p, i)) continue;
      const [fx, fy, fz] = standing(p.f, i, t),
        d = Math.hypot(fx - lx, fz - lz);
      if (d < bestD && Math.abs(fy - y) < 3) {
        bestD = d;
        best = id - 1;
      }
    }
  }
  return best;
}

/** the realm colours the rulers are painted in (the map mode of the rulers), by uid; empty: as they are built */
let rulerColours: ReadonlyMap<number, number> = new Map();
/** where in a figure's numbers the phase and the colours of the garment and of the headwear lie (material.ts
 *  `interleave`: a, b, c, d, e of four each; a ends with the phase, d holds skin, garment, hose and headwear) */
const PHASE = 3,
  GARMENT = 13,
  HEADWEAR = 15,
  STRIDE = 20;
/** the numbers of a piece's figures as the graphics card has them (one list for both kits, material.ts) */
const numbersOf = (p: Pair, name: 'figureA' | 'figureD') =>
  (p.near.geometry.getAttribute(name) as THREE.InterleavedBufferAttribute).data;
/** whether figure `i` of a piece is on the stage: a negative phase keeps it off, and so does its going (material.ts) */
const onStage = (p: Pair, i: number) => {
  const phase = (numbersOf(p, 'figureA').array as Float32Array)[i * STRIDE + PHASE];
  return phase >= 0 && !thinnedOut(phase, p.thinned);
};
/** Paints the figures of these rulers in their colours (garment and headwear), or back as they were built. */
function paint(p: Pair) {
  const buf = numbersOf(p, 'figureD'),
    arr = buf.array as Float32Array;
  let changed = false;
  for (let i = 0; i < p.f.count; i++) {
    const id = p.f.e[i * 4 + 3];
    if (!id) continue;
    const c = rulerColours.get(id - 1),
      garment = c ?? p.f.d[i * 4 + 1],
      head = c ?? p.f.d[i * 4 + 3];
    if (arr[i * STRIDE + GARMENT] !== garment || arr[i * STRIDE + HEADWEAR] !== head) {
      arr[i * STRIDE + GARMENT] = garment;
      arr[i * STRIDE + HEADWEAR] = head;
      changed = true;
    }
  }
  if (changed) buf.needsUpdate = true;
  return changed;
}
/** Paints the figures of the rulers in the colours of their realms (uid → 0xRRGGBB), now and as pieces come; an empty
 *  map paints them back. Returns whether a figure on the stage changed (the stage then needs a picture). */
export function paintRulers(colours: ReadonlyMap<number, number>): boolean {
  rulerColours = colours;
  let changed = false;
  for (const p of shown) changed = paint(p) || changed;
  return changed;
}

/** the world's clock the persons' figures follow; null until the world tells its hour */
let clock: FigureClock | null = null;
/** Puts each figure of a person on the stage or off it, by where the plan of the day has the person (schedule.ts). */
function follow(p: Pair, at: FigureClock) {
  const kinds = p.f.at;
  if (!kinds) return false;
  const buf = numbersOf(p, 'figureA'),
    arr = buf.array as Float32Array;
  let changed = false;
  for (let i = 0; i < p.f.count; i++) {
    if (kinds[i] === FIGURE_AT.anonymous) continue;
    // (the phase as built, negative where the figure was built off the stage)
    const built = p.f.a[i * 4 + 3],
      phase = built < 0 ? -1 - built : built,
      want = Math.fround(figureShown(p.f, i, at) === kinds[i] ? phase : -1 - phase);
    if (arr[i * STRIDE + PHASE] !== want) {
      arr[i * STRIDE + PHASE] = want;
      changed = true;
    }
  }
  if (changed) buf.needsUpdate = true;
  return changed;
}
/** Shows the figures of the persons where the plans of their day have them at the world's hour, now and as pieces
 *  come. Returns whether a figure on the stage changed (the stage then needs a picture). */
export function figuresAtHour(at: FigureClock): boolean {
  clock = at;
  let changed = false;
  for (const p of shown) changed = follow(p, at) || changed;
  return changed;
}

/** the meshes of the riders on the map (`riders`) */
const riding = new Set<THREE.Mesh<THREE.InstancedBufferGeometry>>();
/** Makes the mesh of the riders on the map, with room for `room` of them (material.ts riderMesh): while it shows any,
 *  the stage keeps drawing, as for walking figures. */
export function riders(room: number) {
  const made = riderMesh(room);
  riding.add(made.mesh);
  made.mesh.addEventListener('dispose' as never, () => riding.delete(made.mesh));
  return made;
}

/** whether any figures stand on the stage, or riders ride on it */
export const anyFigures = () => shown.size > 0 || [...riding].some((m) => m.geometry.instanceCount > 0);

/** The places (of the game map) of the persons whose figures are on the stage. */
export function placesOnStage(): number[] {
  const places = new Set<number>();
  for (const p of shown)
    for (let i = 0; p.f.at && p.f.plan && i < p.f.count; i++)
      if (p.f.at[i] !== FIGURE_AT.anonymous) places.add(p.f.plan[i * PLAN + 2]);
  return [...places];
}
/** The figures among the parts of a group on the stage, and the share of them drawn, if it has any. */
export function figuresIn(group: THREE.Object3D): { f: Figures; kept: number } | undefined {
  for (const part of group.children) {
    const p = pairOf.get(part);
    if (p) return { f: p.f, kept: p.kept };
  }
  return undefined;
}
