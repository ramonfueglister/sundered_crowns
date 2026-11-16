// The figures on the stage (lookprobe/stage.ts): which pieces show figures, near or far kit by how much of the world
// is in the picture, and whether anything walks, so that the stage keeps drawing. Main thread only.
import type * as THREE from 'three/webgpu';
import { Group } from 'three/webgpu';
import type { Figures } from './crowd';
import { figureMeshes as build, figureAt as standing, figureSeconds } from './material';

export type { Figures } from './crowd';

/**
 * Up to this many blocks across the picture a figure is drawn with its full kit; beyond it, with the far kit. At 1672
 * pixels across, 260 blocks give 6.4 pixels a block: a figure stands 8 pixels tall, too small for faces and hands.
 * Drawing value.
 */
export const NEAR_UNTIL = 260;

interface Pair { near: THREE.InstancedMesh; far: THREE.InstancedMesh; f: Figures; /** the share of the figures that is drawn */ kept: number }
const shown = new Set<Pair>(), pairOf = new WeakMap<THREE.Object3D, Pair>();
let near = true;
/**
 * Both kits of a piece are on the stage all the time, and the one not in use draws none of its figures: so the
 * renderer has the pipelines of both when the piece arrives, and the change of kit costs nothing (shown and hidden
 * instead, the far kits of all pieces were set up in the one frame of the change: 60 to 80 ms, Chrome on a Mac,
 * 16 November 2026).
 */
const draw = (p: Pair) => { const n = Math.round(p.f.count * p.kept); p.near.count = near ? n : 0; p.far.count = near ? 0 : n; };

/** Makes the two meshes of a piece's figures and keeps them until the stage disposes of them. */
export function figureMeshes(f: Figures) {
  const pair: Pair = { ...build(f), f, kept: 1 };
  pairOf.set(pair.near, pair); pairOf.set(pair.far, pair);
  draw(pair);
  shown.add(pair);
  pair.near.addEventListener('dispose', () => { shown.delete(pair); pair.far.dispose(); });
  return pair;
}

/** One figure of each kit, both shown, on the figures' layer `1`: drawn once somewhere out of sight, it has the renderer build the figures' shaders ahead of need. */
export function warmFigures(): THREE.Group {
  const none = () => new Float32Array(4), pair = build({ count: 1, a: none(), b: none(), c: none(), d: none(), e: none() }), group = new Group();
  for (const mesh of [pair.near, pair.far]) { mesh.layers.set(1); group.add(mesh); }
  return group;
}

/** Shows the near or the far kit, for a picture `across` blocks wide. */
export function showFigures(across: number) {
  near = across <= NEAR_UNTIL;
  for (const p of shown) draw(p);
}

/** Draws only a share of the figures a mesh belongs to: they come and go one by one. */
export function keepFigures(mesh: THREE.Object3D, kept: number) {
  const p = pairOf.get(mesh);
  if (p) { p.kept = kept; draw(p); }
}

/**
 * The person whose figure stands nearest a point of the world (finest world blocks; y in blocks as the piece was
 * built), within `reach` blocks across (the click hits the ground just behind a figure) and three up or down, or null: anonymous figures (outside the 30 cities, or
 * without a world server) do not count.
 */
export function personAt(x: number, y: number, z: number, reach = 2): number | null {
  const t = figureSeconds();
  let best: number | null = null, bestD = reach;
  for (const p of shown) {
    const lx = x - (p.f.ox ?? 0), lz = z - (p.f.oz ?? 0);
    for (let i = 0; i < p.f.count; i++) {
      const id = p.f.e[i * 4 + 3];
      if (!id) continue;
      const [fx, fy, fz] = standing(p.f, i, t), d = Math.hypot(fx - lx, fz - lz);
      if (d < bestD && Math.abs(fy - y) < 3) { bestD = d; best = id - 1; }
    }
  }
  return best;
}

/** whether any figures stand on the stage */
export const anyFigures = () => shown.size > 0;
