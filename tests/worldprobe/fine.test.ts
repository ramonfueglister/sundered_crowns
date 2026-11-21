// The near view of the towns (worldprobe/fine.ts): the fine houses of the cells near the picture are asked of the
// workers, nearest first; they dissolve in over DISSOLVE ms once the stage has sent their lists, dot by dot within the
// dots of their piece, while the far houses dissolve out; and they are let go when the view goes far, when their cell
// lies far out of the picture, or when it leaves the stage. The workers and the stage are fakes that record what
// they are given, and the clock is driven here by hand.
import * as THREE from 'three/webgpu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FREE_GEO } from '../../src/lookprobe/faces';
import type { Shape } from '../../src/lookprobe/shape';
import type { Stage } from '../../src/lookprobe/stage';
import { type HouseCell, createFine } from '../../src/worldprobe/fine';
import type { HousesDone, HousesJob } from '../../src/worldprobe/houses.worker';
import { FINE_UNTIL } from '../../src/worldprobe/zoom';

/** a worker that keeps the jobs it is given and answers them when told */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: MessageEvent<HousesDone>) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  posted: HousesJob[] = [];
  terminated = false;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(job: HousesJob) {
    this.posted.push(job);
  }
  terminate() {
    this.terminated = true;
  }
  /** answers the last job it was given */
  answer(done: Omit<HousesDone, 'id'>) {
    this.onmessage?.(new MessageEvent('message', { data: { id: this.posted[this.posted.length - 1].id, ...done } }));
  }
}
/** the cell each job was for */
const keyOf = new Map<HousesJob, string>();
/** the worker whose last job was for a cell (of the near view made last) */
const workerOf = (key: string) =>
  [...FakeWorker.all].reverse().find((w) => w.posted.length && keyOf.get(w.posted[w.posted.length - 1]) === key)!;

/** houses of `n` triangles in the lists and `free` rectangles beside them */
const houses = (n: number, free = 0): Shape => ({
  pos: new Float32Array(9 * n),
  nor: new Float32Array(9 * n),
  col: new Float32Array(9 * n),
  ...(free ? { free: { geo: new Float32Array(FREE_GEO * free), col: new Uint8Array(0), nor: new Int8Array(0) } } : {}),
});

let clock = 1000;
beforeEach(() => {
  FakeWorker.all = [];
  keyOf.clear();
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('navigator', { hardwareConcurrency: 4 });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** the near view on a stage that records what it is given; `still`: a tool that takes one picture */
function fineOf(still = false) {
  const counts: Record<string, number> = {},
    seen = {
      sent: new Set<THREE.Mesh>(),
      dropped: [] as THREE.Mesh[],
      built: [] as Shape[],
      dissolved: new Map<THREE.Group | THREE.Mesh, [number, number]>(),
    };
  const stage = {
    more: (group: THREE.Group, things: Shape) => {
      seen.built.push(things);
      const mesh = new THREE.Mesh();
      group.add(mesh);
      return mesh;
    },
    sent: (mesh: THREE.Mesh) => seen.sent.has(mesh),
    drop: (mesh: THREE.Mesh) => seen.dropped.push(mesh),
    dissolve: (thing: THREE.Group | THREE.Mesh, from: number, until: number) =>
      seen.dissolved.set(thing, [from, until]),
    probe: { ready: false, counts, backend: 'test' },
  };
  const told = { changed: 0 };
  // (the near view uses only these members of the stage: more, sent, drop, dissolve and probe.counts)
  const fine = createFine(stage as unknown as Stage, { still, changed: () => told.changed++, small: true });
  /** a look at a picture `ms` after the last, `wide` finest blocks across; the jobs it gives are told by cell */
  const look = (cells: HouseCell[], wide = 10, ms = 50) => {
    clock += ms;
    const before = new Set(FakeWorker.all.flatMap((w) => w.posted));
    const r = fine.look(wide, cells);
    for (const w of FakeWorker.all)
      for (const job of w.posted)
        if (!before.has(job)) keyOf.set(job, cells.find((c) => c.lots === job.lots)?.key ?? '');
    return r;
  };
  return { fine, seen, counts, told, look };
}
/** a cell of a town, `out` blocks outside the picture (0 or less: in it) and `away` from its middle */
const cellOf = (key: string, out = 0, away = 0): HouseCell => ({
  key,
  group: new THREE.Group(),
  dots: [0.2, 0.8],
  far: new THREE.Mesh(),
  lots: [],
  out,
  away,
});
// (the fake stage adds nothing to a cell's group but the mesh of its fine houses)
const fineMesh = (c: HouseCell) => c.group.children[0] as THREE.Mesh | undefined;

describe('the near view of the towns', () => {
  it('builds with one worker for every core but one, two at most', () => {
    for (const [cores, workers] of [
      [1, 1],
      [2, 1],
      [3, 2],
      [16, 2],
      [0, 1],
    ]) {
      FakeWorker.all = [];
      vi.stubGlobal('navigator', { hardwareConcurrency: cores });
      fineOf();
      expect(FakeWorker.all).toHaveLength(workers);
    }
  });

  it('asks for the houses of the cells near the picture, nearest first, as the workers are free', () => {
    const { look } = fineOf();
    const b = cellOf('b', 0, 30),
      c = cellOf('c', 5, 10),
      d = cellOf('d', 13, 1), // further out than the 12 blocks they are built ahead
      e = cellOf('e', -3, 20);
    // seen from afar, none
    expect(look([b, c, d, e], FINE_UNTIL)).toEqual({ missing: 0, fading: false });
    expect(FakeWorker.all.flatMap((w) => w.posted)).toEqual([]);
    // near: c and e go to the two workers, b waits; b and e are in the picture and still miss their houses
    expect(look([b, c, d, e])).toEqual({ missing: 2, fading: false });
    expect([...keyOf.values()].sort()).toEqual(['c', 'e']);
    const job = FakeWorker.all.flatMap((w) => w.posted)[0];
    expect(job).toMatchObject({ lots: c.lots, small: true });
    look([b, c, d, e]); // asked once only
    expect(keyOf.size).toBe(2);
    const wc = workerOf('c');
    wc.answer({ houses: houses(1) });
    look([b, c, d, e]);
    expect([...keyOf.values()].sort()).toEqual(['b', 'c', 'e']);
    expect(workerOf('b')).toBe(wc);
  });

  it('puts the houses that arrive on the stage hidden, and counts their triangles', () => {
    const { seen, counts, told, look } = fineOf();
    const a = cellOf('a'),
      b = cellOf('b', 0, 1);
    look([a, b]);
    workerOf('a').answer({ houses: houses(10) });
    workerOf('b').answer({ houses: houses(10, 4) });
    expect(told.changed).toBe(2);
    expect(seen.built).toHaveLength(2);
    expect(fineMesh(a)!.visible).toBe(false);
    // a rectangle beside the lists is two triangles
    expect(counts['fine triangles']).toBe(10 + 10 + 4 * 2);
  });

  it('dissolves the fine houses in over 300 ms once their lists are sent, dot by dot within the dots of the piece', () => {
    const { seen, look } = fineOf();
    const a = cellOf('a');
    look([a]);
    workerOf('a').answer({ houses: houses(1) });
    const fine = fineMesh(a)!;
    // arrived, not sent: they wait, and the view is not done
    expect(look([a])).toEqual({ missing: 0, fading: true });
    expect(fine.visible).toBe(false);
    seen.sent.add(fine);
    for (let k = 0; k < 3; k++) look([a]);
    // half way after 150 ms: the far houses on the upper half of the piece's dots, the fine ones on the lower
    expect(a.far!.visible).toBe(true);
    expect(fine.visible).toBe(true);
    expect(seen.dissolved.get(a.far!)![0]).toBeCloseTo(0.5, 9);
    expect(seen.dissolved.get(fine)![1]).toBeCloseTo(0.5, 9);
    let r = { missing: 0, fading: true };
    for (let k = 0; k < 4; k++) r = look([a]);
    expect(r.fading).toBe(false);
    expect(a.far!.visible).toBe(false);
    expect(fine.visible).toBe(true);
    expect(seen.dissolved.get(fine)).toEqual([0.2, 0.8]);
  });

  it('goes on by 50 ms at most when a picture comes late', () => {
    const { seen, look } = fineOf();
    const a = cellOf('a');
    look([a]);
    workerOf('a').answer({ houses: houses(1) });
    seen.sent.add(fineMesh(a)!);
    look([a], 10, 1000);
    expect(seen.dissolved.get(fineMesh(a)!)![1]).toBeCloseTo(0.2 + 0.6 / 6, 9);
  });

  it('shows them at once for a tool that takes one picture, or where the cell lies outside the picture', () => {
    const cases: [boolean, number][] = [
      [true, 0],
      [false, 5],
    ];
    for (const [still, out] of cases) {
      const { seen, look } = fineOf(still);
      const a = cellOf('a', out);
      look([a]);
      workerOf('a').answer({ houses: houses(1) });
      seen.sent.add(fineMesh(a)!);
      expect(look([a]).fading).toBe(false);
      expect(seen.dissolved.get(fineMesh(a)!)).toEqual([0.2, 0.8]);
      expect(a.far!.visible).toBe(false);
    }
  });

  it('lets them go once dissolved out when the view goes far, and at once where the cell lies far out', () => {
    const { seen, counts, look } = fineOf();
    const a = cellOf('a'),
      b = cellOf('b', 0, 1);
    look([a, b]);
    workerOf('a').answer({ houses: houses(10) });
    workerOf('b').answer({ houses: houses(5) });
    const fa = fineMesh(a)!,
      fb = fineMesh(b)!;
    seen.sent.add(fa);
    seen.sent.add(fb);
    for (let k = 0; k < 7; k++) look([a, b]);
    // b lies 61 blocks out of the picture, past the 60 they are kept
    b.out = 61;
    look([a, b]);
    expect(seen.dropped).toEqual([fb]);
    expect(counts['fine triangles']).toBe(10);
    // the view goes far: a dissolves out, then goes
    expect(look([a, b], FINE_UNTIL).fading).toBe(true);
    expect(seen.dropped).toEqual([fb]);
    for (let k = 0; k < 6; k++) look([a, b], FINE_UNTIL);
    expect(seen.dropped).toEqual([fb, fa]);
    expect(counts['fine triangles']).toBe(0);
    expect(a.far!.visible).toBe(true);
  });

  it('lets them go when their cell leaves the stage, and shows its far houses again', () => {
    const { seen, look } = fineOf();
    const a = cellOf('a');
    look([a]);
    workerOf('a').answer({ houses: houses(1) });
    seen.sent.add(fineMesh(a)!);
    for (let k = 0; k < 7; k++) look([a]);
    expect(a.far!.visible).toBe(false);
    look([]);
    expect(seen.dropped).toEqual([fineMesh(a)]);
    expect(a.far!.visible).toBe(true);
  });

  it('builds nothing for a cell that left the stage while its houses were built, and frees the worker', () => {
    const { seen, told, look } = fineOf();
    const a = cellOf('a'),
      b = cellOf('b');
    look([a]);
    const worker = workerOf('a');
    look([]);
    worker.answer({ houses: houses(1) });
    expect(seen.built).toEqual([]);
    expect(told.changed).toBe(1);
    // both workers are free again: b goes to the one that answered last
    look([b]);
    expect(workerOf('b')).toBe(worker);
  });

  it('keeps the first error of the workers, and asks again for houses that failed', () => {
    const { fine, look } = fineOf();
    const a = cellOf('a');
    look([a]);
    const worker = workerOf('a');
    worker.answer({ error: 'no lots' });
    worker.onerror?.({ message: 'crashed' });
    expect(fine.failed).toBe('no lots');
    look([a]);
    expect(worker.posted).toHaveLength(2);
    worker.answer({ error: 'no ground' });
    expect(fine.failed).toBe('no lots');
    const other = fineOf();
    FakeWorker.all[FakeWorker.all.length - 1].onerror?.({ message: 'crashed' });
    expect(other.fine.failed).toBe('crashed');
  });

  it('stops its workers when disposed', () => {
    const { fine } = fineOf();
    fine.dispose();
    expect(FakeWorker.all.every((w) => w.terminated)).toBe(true);
  });
});
