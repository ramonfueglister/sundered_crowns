// The near view of the towns. From afar a house that has fine blocks is drawn as a few blocks, like every other
// house, and the paved ground as whole blocks. Once the view is so near that fine blocks would show, the cells of
// the towns in the picture are built again from them, cell by cell of their piece, by workers off the page's thread:
// the houses (which dissolve into the picture while the far houses of their cell dissolve out of it) and the fine
// ground, which lies over the whole blocks (nearground.ts). Only what the picture shows is built this way: a house
// of fine blocks takes many times the triangles of a far one. What the view leaves behind is let go again.
import type * as THREE from 'three/webgpu';
import type { Stage } from '../lookprobe/stage';
import type { HousesDone, HousesJob } from './houses.worker';
import type { Columns } from './nearground';
import type { Lot } from './settle';
import { FINE_UNTIL } from './zoom';

/** the houses of a cell are built this far ahead of the picture, and kept this far behind it, in blocks */
const AHEAD = 12, KEPT = 60;
/** the fine houses of a cell take the place of its far ones over this many milliseconds */
const DISSOLVE = 300;

/**
 * A cell of a town on the stage: its piece's group and the share of the picture's dots the piece is drawn on, the
 * mesh of its far houses (none where no house of the cell has fine blocks) and their lots, the columns of its paved
 * ground, and how far it lies outside the picture and from its middle.
 */
export interface HouseCell { key: string; group: THREE.Group; dots: readonly [number, number]; far?: THREE.Mesh; lots: Lot[]; ground?: Columns; out: number; away: number }
interface State { cell: HouseCell; fine?: THREE.Mesh; asked: boolean; /** the share of the cell that shows its fine houses */ share: number }

export interface Fine {
  /** Brings the houses of the cells on the stage to the view. Returns how many cells of the picture still wait for their fine houses, and whether some are dissolving. */
  look(wide: number, cells: readonly HouseCell[]): { missing: number; fading: boolean };
  /** the first error of a worker, if any */
  failed: string;
  dispose(): void;
}

/** `still`: a tool takes one picture, in which nothing dissolves. `changed` is called whenever houses have arrived. */
export function createFine(stage: Stage, o: { still: boolean; changed(): void }): Fine {
  const states = new Map<string, State>(), jobs = new Map<number, string>(), idle: Worker[] = [], workers: Worker[] = [];
  const fine: Fine = { look, failed: '', dispose: () => { for (const w of workers) w.terminate(); } };
  let nextId = 1, last = 0;

  for (let k = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1)); k > 0; k--) {
    const worker = new Worker(new URL('./houses.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<HousesDone>) => {
      const key = jobs.get(e.data.id)!, s = states.get(key);
      jobs.delete(e.data.id); idle.push(worker);
      if (e.data.error) fine.failed ||= e.data.error;
      // the cell may have left the stage while its houses were built
      else if (s && e.data.houses) {
        s.fine = stage.more(s.cell.group, e.data.houses); s.fine.visible = false;
        stage.probe.counts['fine triangles'] = (stage.probe.counts['fine triangles'] ?? 0) + e.data.houses.pos.length / 9;
      }
      if (s) s.asked = false;
      o.changed();
    };
    worker.onerror = (e) => { fine.failed ||= e.message; o.changed(); };
    idle.push(worker); workers.push(worker);
  }
  const letGo = (s: State) => {
    if (!s.fine) return;
    stage.probe.counts['fine triangles'] -= s.fine.geometry.getAttribute('position').count / 3;
    stage.drop(s.fine); s.fine = undefined; s.share = 0;
  };

  function look(wide: number, cells: readonly HouseCell[]): { missing: number; fading: boolean } {
    const near = wide < FINE_UNTIL, now = performance.now(), step = o.still ? 1 : Math.min(50, now - last) / DISSOLVE, seen = new Set<string>();
    last = now;
    let missing = 0, fading = false;
    const queue: State[] = [];
    for (const cell of cells) {
      const s = states.get(cell.key) ?? { cell, asked: false, share: 0 };
      states.set(cell.key, s); seen.add(cell.key); s.cell = cell;
      if (near && cell.out <= AHEAD && !s.fine) { if (!s.asked) queue.push(s); if (cell.out <= 0) missing++; }
      // the fine houses come in where the view is near, go out where it is not, and are let go once out of sight
      // (they wait until the stage has sent their lists to the graphics card: stage.ts `sent`)
      const there = !!s.fine && stage.sent(s.fine), goal = near && there && cell.out <= KEPT ? 1 : 0;
      if (s.share !== goal) s.share = cell.out > 0 ? goal : goal ? Math.min(1, s.share + step) : Math.max(0, s.share - step);
      if (!goal && s.share === 0 && (there || !near)) letGo(s);
      fading ||= (s.share > 0 && s.share < 1) || (near && !!s.fine && !there);
      // the two take each other's place dot by dot, within the dots their piece is drawn on
      const [from, until] = cell.dots, mid = from + (until - from) * s.share;
      if (cell.far) { cell.far.visible = s.share < 1; stage.dissolve(cell.far, mid, until); }
      if (s.fine) { s.fine.visible = s.share > 0; stage.dissolve(s.fine, from, mid); }
    }
    // cells that left the stage: their meshes went with their piece, or go now
    for (const [key, s] of states) if (!seen.has(key)) { letGo(s); if (s.cell.far) s.cell.far.visible = true; states.delete(key); }
    queue.sort((a, b) => b.cell.away - a.cell.away);
    while (idle.length && queue.length) {
      const s = queue.pop()!, id = nextId++;
      s.asked = true; jobs.set(id, s.cell.key);
      idle.pop()!.postMessage({ id, lots: s.cell.lots, ground: s.cell.ground } satisfies HousesJob);
    }
    return { missing, fading };
  }
  return fine;
}
