// The pieces that arrive from the workers and go on the stage (worldprobe/piece_arrival.ts): one to a picture while
// the view moves, all at once for a tool that takes one picture, as many as would have had a picture of their own on a
// slow machine; or, where the stage sends the lists itself, as the stage has room, the pieces the view asks for
// first, and a piece joins the view only once its lists are sent. The stage is a fake that records what it is given,
// and the pictures are driven here by hand.
import * as THREE from 'three/webgpu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Shape } from '../../src/lookprobe/shape';
import type { Stage } from '../../src/lookprobe/stage';
import { type Held, createArrival } from '../../src/worldprobe/piece_arrival';
import type { PieceDone } from '../../src/worldprobe/piece.worker';
import { PIECE, type Spot } from '../../src/worldprobe/piece_sight';
import type { Cell } from '../../src/worldprobe/world';

type PieceScene = NonNullable<PieceDone['scene']>;
const none = (): Shape => ({ pos: [], nor: [], col: [] });
/** what a worker built of a piece: its cells, whether its ground glides to the next coarser step, what it counts */
function scene(o: { cells?: Cell<Shape>[]; glides?: boolean; counts?: Record<string, number> } = {}): PieceScene {
  const faces = { geo: new Int16Array(0), col: new Uint8Array(0), nor: new Int8Array(0) };
  return {
    ground: { ...none(), faces: o.glides ? { ...faces, aim: new Int16Array(0) } : faces },
    things: none(),
    water: none(),
    counts: o.counts ?? {},
    cells: o.cells ?? [],
  };
}
const spot = (key: string, px = 0, pz = 0, step = 1): Spot => ({ key, step, px, pz });

/** a stage that records the groups it was given; `room` pieces fit on before it has to send */
function stageOf(staged: boolean) {
  const added: THREE.Group[] = [],
    counts: Record<string, number> = { trees: 5 },
    seen = { added, more: 0, room: Number.POSITIVE_INFINITY, sent: new Set<THREE.Group | THREE.Mesh>() };
  const stage = {
    staged,
    add: () => {
      const g = new THREE.Group();
      seen.added.push(g);
      seen.room--;
      return g;
    },
    more: () => {
      seen.more++;
      return new THREE.Mesh();
    },
    room: () => seen.room > 0,
    sent: (thing: THREE.Group | THREE.Mesh) => seen.sent.has(thing),
    probe: { ready: false, counts, backend: 'test' },
  };
  return { seen, stage };
}

let frames: FrameRequestCallback[] = [],
  clock = 1000;
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f));
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
/** shows a picture `ms` milliseconds after the last */
function picture(ms = 16) {
  clock += ms;
  const now = frames;
  frames = [];
  for (const f of now) f(clock);
}

/** the arrival of pieces at a view that moves (`ahead`) or a tool that takes one picture, on a stage that sends or not */
function arrivalOf(o: { ahead: boolean; staged?: boolean }) {
  const { seen, stage } = stageOf(!!o.staged);
  const held = new Map<string, Held>(),
    building = new Set<string>(),
    asked = new Set<string>(),
    told = { changed: 0, looks: 7 };
  const arrival = createArrival(
    // (the arrival uses only these members of the stage: add, more, staged, room, sent and probe.counts)
    stage as unknown as Stage,
    { ahead: o.ahead, changed: () => told.changed++ },
    held,
    building,
    asked,
    () => told.looks,
    (step) => 2 * step,
  );
  /** pieces arrive that were being built */
  const take = (...keys: string[]) => {
    for (const key of keys) {
      building.add(key);
      arrival.take(spot(key), scene());
    }
  };
  return { arrival, seen, stage, held, building, asked, told, take };
}

describe('the pieces that arrive', () => {
  it('go on one to a picture while the view moves, hidden until the view shows them', () => {
    const { arrival, held, building, told, take } = arrivalOf({ ahead: true });
    take('a', 'b', 'c');
    arrival.schedule();
    arrival.schedule(); // asked twice, still one picture at a time
    expect(held.size).toBe(0);
    expect(frames).toHaveLength(1);
    expect(told.changed).toBe(2);
    picture();
    expect([...held.keys()]).toEqual(['a']);
    expect([...building]).toEqual(['b', 'c']);
    picture();
    picture();
    expect([...held.keys()]).toEqual(['a', 'b', 'c']);
    expect(building.size).toBe(0);
    expect(frames).toHaveLength(0);
    const a = held.get('a')!;
    expect(a.group.visible).toBe(false);
    expect(a).toMatchObject({ step: 1, px: 0, pz: 0, dots: [0, 1], seen: 7, on: false, laid: 0, glides: false });
    // to be drawn once without showing, before a look puts it into the picture
    expect(a.warm).toBe(-1);
  });

  it('go on all at once for a tool that takes one picture', () => {
    const { arrival, held, told, take } = arrivalOf({ ahead: false });
    take('a', 'b', 'c');
    arrival.schedule();
    expect(held.size).toBe(3);
    expect(frames).toHaveLength(0);
    expect(told.changed).toBe(1);
    expect(held.get('a')!.warm).toBe(undefined);
  });

  it('go on as many to a picture as would have had pictures of their own, where pictures take a quarter second', () => {
    const { arrival, held, take } = arrivalOf({ ahead: true });
    take(...Array.from({ length: 40 }, (_, k) => `p${k}`));
    arrival.schedule();
    picture(); // the first picture after a rest: one
    expect(held.size).toBe(1);
    picture(510); // 510 ms at 60 pictures a second: 30
    expect(held.size).toBe(31);
    picture(200); // no slower than a quarter second: one
    expect(held.size).toBe(32);
    picture(310); // 18 more, but only 8 are left
    expect(held.size).toBe(40);
    expect(frames).toHaveLength(0);
    // the time since the last counts from one picture to the next, not across a rest
    clock += 5000;
    take('late1', 'late2');
    arrival.schedule();
    picture();
    expect(held.size).toBe(41);
  });

  it('bring the cells of their towns, with their middles in finest blocks, and what they count', () => {
    const { arrival, held, seen, stage } = arrivalOf({ ahead: false });
    const far: Shape = { pos: [0, 0, 0], nor: [0, 1, 0], col: [1, 1, 1] };
    arrival.take(
      spot('t', 2, 1, 3),
      scene({
        cells: [
          { x: 3, z: 5, far, lots: [] },
          { x: 40, z: 60, far: none(), lots: [] },
        ],
        glides: true,
        counts: { trees: 2, houses: 3 },
      }),
    );
    arrival.take(spot('u'), scene({ counts: { houses: 1 } }));
    arrival.schedule();
    const t = held.get('t')!,
      margin = 2 * 3;
    expect(t.cells.map(({ key, x, z }) => ({ key, x, z }))).toEqual([
      { key: 't/0', x: 2 * PIECE - margin + 3, z: PIECE - margin + 5 },
      { key: 't/1', x: 2 * PIECE - margin + 40, z: PIECE - margin + 60 },
    ]);
    // far houses only where the cell has some
    expect(t.cells[0].far).toBeInstanceOf(THREE.Mesh);
    expect(t.cells[1].far).toBe(undefined);
    expect(seen.more).toBe(1);
    expect(t.glides).toBe(true);
    expect(held.get('u')!.glides).toBe(false);
    expect(stage.probe.counts).toEqual({ trees: 7, houses: 4 });
  });

  it('go on as the stage that sends has room, those the view asks for first, and join the view once sent', () => {
    const { arrival, held, building, asked, seen, told, take } = arrivalOf({ ahead: true, staged: true });
    seen.room = 2;
    take('a', 'b', 'c');
    asked.add('c');
    arrival.schedule();
    // c first, as the view asks for it, then a; b waits for room
    expect(seen.added).toHaveLength(2);
    expect(held.size).toBe(0);
    expect(told.changed).toBe(1);
    expect(frames).toHaveLength(1);
    const [c, a] = seen.added;
    seen.sent.add(c);
    told.looks = 9;
    picture();
    expect([...held.keys()]).toEqual(['c']);
    expect(held.get('c')!.group).toBe(c);
    expect(held.get('c')!.seen).toBe(9);
    expect(held.get('c')!.warm).toBe(undefined);
    expect([...building].sort()).toEqual(['a', 'b']);
    expect(told.changed).toBe(2);
    // nothing sent and no room: it waits and tells no one
    picture();
    expect(told.changed).toBe(2);
    seen.room = 1;
    seen.sent.add(a);
    picture();
    expect([...held.keys()]).toEqual(['c', 'a']);
    expect(seen.added).toHaveLength(3);
    seen.sent.add(seen.added[2]);
    picture();
    expect([...held.keys()]).toEqual(['c', 'a', 'b']);
    expect(frames).toHaveLength(0);
  });

  it('on a stage that sends, with none arrived, only tell the view', () => {
    const { arrival, told } = arrivalOf({ ahead: true, staged: true });
    arrival.schedule();
    expect(told.changed).toBe(1);
    expect(frames).toHaveLength(0);
  });
});
