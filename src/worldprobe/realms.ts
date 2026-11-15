// The 2D map: once the world lies flat under a camera that looks straight down (zoom.ts), the realms of 1356 colour
// it. Their colours are painted tile by tile (paint.ts) by a worker, at the level whose dots are about a pixel wide,
// and laid over the blocks. The tiles form a pyramid (pyramid.ts), so that a coarser tile stands in for finer ones
// that are not there yet. The realms lie on the game map only; round the globe they come again with it.
import * as THREE from 'three/webgpu';
import { texture, uniform } from 'three/tsl';
import { LAND_Y, SEA_Y } from '../lookprobe/layout';
import type { Stage } from '../lookprobe/stage';
import { blockOfCell, cellOfBlock } from './land';
import type { RealmName } from './paint';
import type { Layout, View } from './pieces';
import { cover, keyOf } from './pyramid';
import type { RealmsDone, RealmsJob } from './realms.worker';
import { PAPER_COARSEST, paperLevelOf, realmsOf, reliefOf } from './zoom';

/** dots along the side of a tile: as the tiles of the region (region.ts) */
const TILE = 512;
/** tiles are painted ahead of need this far around the picture, as a share of its width */
const AHEAD = 0.3;
/** the realms are fetched and painted from when the view is within this factor of the width at which they show */
const SOON = 2;
/** tiles kept beyond those the view asks for, and how many the worker is given at once */
const SPARE = 16, AT_ONCE = 4;

/** A tile of the pyramid that has been painted; without a mesh it holds no realm. */
interface Held { level: number; x: number; y: number; seen: number; mesh?: THREE.Mesh; picture?: THREE.Texture }
interface Want { key: string; level: number; x: number; y: number; rank: number }

export interface RealmsMap {
  /** Brings the map to the view. Returns how many tiles of what the picture shows of it are still to come. */
  look(view: View, at: Layout): number;
  /** where the realms' names are written; empty until the realms have been near once */
  names: (RealmName & { name: string })[];
  /** cells from the game map as the names know it to the lap of the globe the view shows */
  lap: number;
  /** the first error of the worker, if any */
  failed: string;
}

/**
 * `map`: the game map's width and height in cells; `round`: the cells after which the world begins again.
 * `ahead`: paint the surroundings of the picture too. `changed` is called whenever a tile has arrived.
 */
export function createRealms(stage: Stage, o: { region: string; base: string; map: readonly [number, number]; round: number; ahead: boolean; changed(): void }): RealmsMap {
  const held = new Map<string, Held>(), asked = new Map<number, Want | 'names'>(), busy = new Set<string>();
  const realms: RealmsMap = { look, names: [], lap: 0, failed: '' };
  /** how strongly the realms' colours cover the world */
  const wash = uniform(0);
  let nextId = 1, looks = 0, named = false;

  /** the tile as a square on the ground, in finest blocks from its north-west corner */
  const square = (level: number) => {
    const side = TILE * 2 ** level, e = blockOfCell(side, 0), s = blockOfCell(0, side), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, s[0], 0, s[1], e[0], 0, e[1], s[0], 0, s[1], e[0] + s[0], 0, e[1] + s[1], e[0], 0, e[1]], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 0], 2));
    return g;
  };

  const worker = new Worker(new URL('./realms.worker.ts', import.meta.url), { type: 'module' });
  const ask = (job: { kind: 'names' } | { kind: 'tile'; level: number; tx: number; ty: number }, what: Want | 'names') => {
    const id = nextId++;
    asked.set(id, what);
    worker.postMessage({ id, region: o.region, base: o.base, ...job } satisfies RealmsJob);
  };
  worker.onmessage = (e: MessageEvent<RealmsDone>) => {
    const what = asked.get(e.data.id)!;
    asked.delete(e.data.id);
    if (e.data.error) realms.failed ||= e.data.error;
    else if (what === 'names') realms.names = e.data.names ?? [];
    else {
      const h: Held = { level: what.level, x: what.x, y: what.y, seen: looks };
      if (e.data.tile) {
        // the picture holds colour times cover, and the cover, in linear light, so that its dots blend cleanly
        h.picture = new THREE.DataTexture(new Uint8Array(e.data.tile.buffer), TILE, TILE, THREE.RGBAFormat);
        h.picture.magFilter = THREE.LinearFilter; h.picture.minFilter = THREE.LinearMipmapLinearFilter; h.picture.generateMipmaps = true; h.picture.anisotropy = 4; h.picture.needsUpdate = true;
        const dots = texture(h.picture), material = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false, transparent: true });
        material.colorNode = dots.rgb.div(dots.a.max(1 / 255)); material.opacityNode = dots.a.mul(wash);
        h.mesh = new THREE.Mesh(square(what.level), material);
        // drawn after the blocks, whatever their heights
        h.mesh.renderOrder = 1; h.mesh.frustumCulled = false; h.mesh.visible = false;
        stage.put(h.mesh);
      }
      held.set(what.key, h);
    }
    if (what !== 'names') busy.delete(what.key);
    o.changed();
  };
  worker.onerror = (e) => { realms.failed ||= e.message; o.changed(); };
  const drop = (h: Held) => {
    if (!h.mesh) return;
    stage.take(h.mesh); (h.mesh.material as THREE.Material).dispose(); h.mesh.geometry.dispose(); h.picture!.dispose();
  };

  function look(v: View, at: Layout): number {
    const [u, cv] = cellOfBlock(v.x, v.z), halfW = v.wide / 2, halfD = v.wide / v.aspect / Math.sin((v.elevation * Math.PI) / 180) / 2;
    const level = paperLevelOf(v.wide, v.pixels), soon = realmsOf(v.wide * SOON) > 0;
    // the lap of the globe whose game map lies nearest the picture
    realms.lap = Number.isFinite(o.round) ? Math.round((u - o.map[0] / 2) / o.round) * o.round : 0;
    const cu = u - realms.lap;
    looks++;
    wash.value = realmsOf(v.wide);
    /** how far a tile lies outside the picture, in finest cells (0: it reaches into it); the map's cells run with the picture's sides */
    const outside = (l: number, x: number, y: number) => { const side = TILE * 2 ** l; return Math.max(0, Math.abs((x + 0.5) * side - cu) - halfW - side / 2, Math.abs((y + 0.5) * side - cv) - halfD - side / 2); };
    /** the tiles of a level on the game map within `around` cells of the picture */
    const near = (l: number, around: number) => {
      const side = TILE * 2 ** l, list: { x: number; y: number; out: number; far: number }[] = [];
      for (let y = Math.max(0, Math.floor((cv - halfD - around) / side)); y * side <= Math.min(o.map[1] - 1, cv + halfD + around); y++)
        for (let x = Math.max(0, Math.floor((cu - halfW - around) / side)); x * side <= Math.min(o.map[0] - 1, cu + halfW + around); x++)
          list.push({ x, y, out: outside(l, x, y), far: Math.hypot((x + 0.5) * side - cu, (y + 0.5) * side - cv) });
      return list;
    };

    // what the view asks for once the realms are near: the coarser level under the picture first, then its own level
    // in the picture, then around it
    const wanted: Want[] = [], want = (l: number, t: { x: number; y: number }, rank: number) => wanted.push({ key: keyOf(l, t.x, t.y), level: l, x: t.x, y: t.y, rank });
    if (soon) {
      if (o.ahead && level < PAPER_COARSEST) for (const t of near(level + 1, 0)) want(level + 1, t, t.far);
      for (const t of near(level, o.ahead ? AHEAD * v.wide : 0)) want(level, t, (t.out > 0 ? 2e9 : 1e9) + t.far);
      if (!named) { named = true; ask({ kind: 'names' }, 'names'); }
    }
    let missing = 0;
    for (const w of wanted) { const h = held.get(w.key); if (h) h.seen = looks; else if (wash.value > 0 && w.level === level && w.rank < 2e9) missing++; }
    const queue = wanted.filter((w) => !held.has(w.key) && !busy.has(w.key)).sort((a, b) => b.rank - a.rank);
    while (busy.size < AT_ONCE && queue.length) { const next = queue.pop()!; busy.add(next.key); ask({ kind: 'tile', level: next.level, tx: next.x, ty: next.y }, next); }

    // what is shown: every part of the picture once, from the tiles nearest the view's level that are there
    const shown = wash.value > 0 ? cover(level, PAPER_COARSEST, near(PAPER_COARSEST, 0).map((t) => [t.x, t.y] as const), (l, x, y) => held.get(keyOf(l, x, y)), (l, x, y) => outside(l, x, y) <= 0) : new Set<Held>();
    // the map lies at the height of the plains, which sink towards the sea's level as the view widens
    const ground = SEA_Y + (LAND_Y - SEA_Y) * reliefOf(v.wide, at.step);
    for (const h of held.values()) {
      const show = shown.has(h);
      if (show) h.seen = looks;
      if (!h.mesh) continue;
      h.mesh.visible = show;
      if (!show) continue;
      const side = TILE * 2 ** h.level, [bx, bz] = blockOfCell(h.x * side + realms.lap, h.y * side);
      h.mesh.position.set(bx / at.coarse - at.homeX, ground, bz / at.coarse - at.homeZ); h.mesh.scale.set(1 / at.coarse, 1, 1 / at.coarse);
    }
    // tiles the view no longer asks for leave the stage, those unused the longest first
    const spare = [...held].filter(([, h]) => h.seen !== looks).sort((a, b) => a[1].seen - b[1].seen);
    for (const [key, h] of spare.slice(0, Math.max(0, spare.length - SPARE))) { drop(h); held.delete(key); }
    stage.redraw();
    return missing;
  }
  return realms;
}
