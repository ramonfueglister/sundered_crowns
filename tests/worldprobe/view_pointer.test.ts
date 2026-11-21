// The pointer and the keys on the world (worldprobe/view_pointer.ts): a press let go at once is a click, one pointer
// drags the ground along and lets it glide on, two pinch it, the wheel zooms about the pointer, the keys move and zoom,
// and where the mouse rests over the ground the page is told (`world-hover`). The canvas and the window are event
// targets of Node, the view and its motion fakes that record what they are told, and the clock is driven by hand.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Motion } from '../../src/worldprobe/view_motion';
import { type WorldClick, type WorldHover, createPointer } from '../../src/worldprobe/view_pointer';

/** a field of the page or another element a key can be typed into */
class FakeElement extends EventTarget {
  constructor(
    readonly tagName: string,
    readonly isContentEditable = false,
  ) {
    super();
  }
}

let clock = 1000;
/** the ground under the pointer, and what the page was told of it */
let ground: WorldClick | null = null,
  told: (WorldHover | null)[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const win = Object.assign(new EventTarget(), {
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
    clearTimeout: (id: number) => clearTimeout(id),
  });
  win.addEventListener('world-hover', (e) => {
    if (e instanceof CustomEvent) told.push(e.detail);
  });
  vi.stubGlobal('window', win);
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  ground = { x: 1, y: 2, z: 3, step: 0, lon: 8.5, lat: 47.4 };
  told = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** a view 1000 finest blocks across whose ground lies twice as far to the right and three times as far near as the page */
function pointerOn(o: { still?: boolean; step?: number } = {}) {
  const canvas = Object.assign(new EventTarget(), {
    style: { touchAction: '', cursor: '' },
    captured: [] as number[],
    setPointerCapture(id: number) {
      this.captured.push(id);
    },
  });
  const seen = {
    calls: [] as [string, ...number[]][],
    moves: [] as [number, number][],
    clicks: [] as [number, number][],
    lookups: 0,
  };
  const call =
    (name: string) =>
    (...a: number[]) => {
      seen.calls.push([name, ...a]);
    };
  const motion: Motion = {
    toward: () => undefined,
    zoomTo: (factor, at) => seen.calls.push(['zoomTo', factor, ...(at ?? [])]),
    push: call('push'),
    flyTo: call('flyTo'),
    pinch: call('pinch'),
    halt: call('halt'),
    carry: call('carry'),
    stop: call('stop'),
  };
  const pointer = createPointer(
    // (the pointer uses only these members of the canvas: its events, style and setPointerCapture)
    canvas as unknown as HTMLCanvasElement,
    {
      place: { x: 0, z: 0, wide: 1000 },
      still: !!o.still,
      motion,
      step: () => o.step ?? 0,
      offset: (px, py) => [2 * px, 3 * py],
      move: (right, near) => seen.moves.push([right, near]),
      groundAt: () => {
        seen.lookups++;
        return ground && { at: ground };
      },
      click: (px, py) => seen.clicks.push([px, py]),
    },
  );
  /** a pointer event on the canvas, `ms` after the last */
  const send = (type: string, x: number, y: number, o: { id?: number; kind?: string; ms?: number } = {}) => {
    clock += o.ms ?? 0;
    canvas.dispatchEvent(
      Object.assign(new Event(type), { clientX: x, clientY: y, pointerId: o.id ?? 1, pointerType: o.kind ?? 'mouse' }),
    );
  };
  return { canvas, pointer, seen, send };
}
const callsOf = (seen: { calls: [string, ...number[]][] }, name: string) =>
  seen.calls.filter((c) => c[0] === name).map((c) => c.slice(1));
/** a key pressed on the window, typed into `target` if given */
function key(k: string, target?: FakeElement) {
  const e = Object.assign(new Event('keydown'), { key: k });
  if (target) Object.defineProperty(e, 'target', { value: target });
  window.dispatchEvent(e);
}

describe('a press on the world', () => {
  it('grabs the ground: the canvas takes no gestures of the page, and a press halts the view', () => {
    const { canvas, seen, send } = pointerOn();
    expect(canvas.style).toEqual({ touchAction: 'none', cursor: 'grab' });
    send('pointerdown', 100, 100, { id: 7 });
    expect(canvas.style.cursor).toBe('grabbing');
    expect(canvas.captured).toEqual([7]);
    expect(callsOf(seen, 'halt')).toEqual([[]]);
    send('pointerup', 100, 100, { id: 7 });
    expect(canvas.style.cursor).toBe('grab');
  });

  it('is a click where it is let go within 4 pixels and 400 ms', () => {
    const { seen, send } = pointerOn();
    send('pointerdown', 100, 100);
    send('pointerup', 104, 100, { ms: 400 });
    send('pointerdown', 100, 100);
    send('pointerup', 105, 100, { ms: 10 }); // too far
    send('pointerdown', 100, 100);
    send('pointerup', 100, 100, { ms: 401 }); // too long
    send('pointerdown', 100, 100);
    send('pointercancel', 100, 100, { ms: 10 }); // taken away
    expect(seen.clicks).toEqual([[104, 100]]);
  });

  it('is no click where a second finger came down', () => {
    const { seen, send } = pointerOn();
    send('pointerdown', 100, 100, { id: 1, kind: 'touch' });
    send('pointerdown', 200, 100, { id: 2, kind: 'touch' });
    send('pointerup', 200, 100, { id: 2, kind: 'touch' });
    send('pointerup', 100, 100, { id: 1, kind: 'touch' });
    expect(seen.clicks).toEqual([]);
  });
});

describe('a drag on the world', () => {
  it('drags the ground along by the ground under the pointer', () => {
    const { seen, send } = pointerOn();
    send('pointermove', 100, 100); // not pressed: no drag
    send('pointerdown', 100, 100);
    send('pointermove', 110, 105);
    send('pointermove', 130, 105);
    expect(seen.moves).toEqual([
      [-20, -15],
      [-40, 0],
    ]);
  });

  it('lets the view glide on at the speed of its last 90 ms, but not for a tool that takes one picture', () => {
    for (const still of [false, true]) {
      const { seen, send } = pointerOn({ still });
      send('pointerdown', 0, 0);
      for (let k = 1; k <= 12; k++) send('pointermove', 10 * k, 0, { ms: 10 });
      send('pointerup', 120, 0);
      // the moves of the last 90 ms, 20 blocks to the left each, over 90 ms
      expect(callsOf(seen, 'carry')).toEqual(still ? [] : [[-200 / 90, 0]]);
    }
  });

  it('does not glide on where it rested before it was let go, or moved but once', () => {
    const { seen, send } = pointerOn();
    send('pointerdown', 0, 0);
    send('pointermove', 10, 0, { ms: 10 });
    send('pointermove', 20, 0, { ms: 10 });
    send('pointerup', 20, 0, { ms: 100 });
    send('pointerdown', 0, 0);
    send('pointermove', 10, 0, { ms: 10 });
    send('pointerup', 10, 0, { ms: 10 });
    expect(callsOf(seen, 'carry')).toEqual([]);
  });

  it('forgets the last drag when pressed again', () => {
    const { seen, send } = pointerOn();
    send('pointerdown', 0, 0);
    for (let k = 1; k <= 3; k++) send('pointermove', 10 * k, 0, { ms: 10 });
    send('pointerup', 30, 0);
    // pressed and let go at once, soon after: a click, and no second glide
    send('pointerdown', 30, 0, { ms: 10 });
    send('pointerup', 30, 0, { ms: 10 });
    expect(callsOf(seen, 'carry')).toHaveLength(1);
    expect(seen.clicks).toEqual([[30, 0]]);
  });

  it('with two fingers pinches the view about their middle', () => {
    const { seen, send } = pointerOn();
    send('pointerdown', 100, 100, { id: 1, kind: 'touch' });
    send('pointerdown', 300, 100, { id: 2, kind: 'touch' });
    send('pointermove', 500, 100, { id: 2, kind: 'touch' });
    // twice as far apart: half as wide, about the middle of the two
    expect(callsOf(seen, 'pinch')).toEqual([[500, 300, 100]]);
    expect(seen.moves).toEqual([]);
  });
});

describe('the wheel and the keys', () => {
  it('zoom about the pointer with the wheel, by lines or pixels, faster for a pinch on the trackpad', () => {
    const { canvas, seen } = pointerOn();
    const wheel = (deltaY: number, deltaMode = 0, ctrlKey = false) => {
      const e = Object.assign(new Event('wheel', { cancelable: true }), {
        deltaY,
        deltaMode,
        ctrlKey,
        clientX: 50,
        clientY: 60,
      });
      canvas.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(wheel(100)).toBe(true); // the page does not scroll
    wheel(3, 1);
    wheel(10, 0, true);
    expect(callsOf(seen, 'zoomTo')).toEqual([
      [Math.exp(100 * 0.0015), 50, 60],
      [Math.exp(3 * 30 * 0.0015), 50, 60],
      [Math.exp(10 * 0.01), 50, 60],
    ]);
  });

  it('move the view by an eighth of its width with the arrows or WASD, and zoom with + and -', () => {
    const { seen } = pointerOn();
    for (const k of ['ArrowLeft', 'a', 'ArrowRight', 'd', 'ArrowUp', 'w', 'ArrowDown', 's', 'x']) key(k);
    expect(callsOf(seen, 'push')).toEqual([
      [-120, 0],
      [-120, 0],
      [120, 0],
      [120, 0],
      [0, -180],
      [0, -180],
      [0, 180],
      [0, 180],
    ]);
    for (const k of ['+', '=', '-']) key(k);
    expect(callsOf(seen, 'zoomTo')).toEqual([[0.8], [0.8], [1.25]]);
  });

  it('leave what is typed into a field of the page alone, and are not heard once the pointer is disposed', () => {
    const { pointer, seen } = pointerOn();
    key('a', new FakeElement('INPUT'));
    key('a', new FakeElement('TEXTAREA'));
    key('a', new FakeElement('SELECT'));
    key('a', new FakeElement('DIV', true));
    expect(seen.calls).toEqual([]);
    key('a', new FakeElement('DIV'));
    expect(callsOf(seen, 'push')).toHaveLength(1);
    pointer.dispose();
    key('a');
    expect(callsOf(seen, 'push')).toHaveLength(1);
  });
});

describe('the mouse resting over the ground', () => {
  it('tells the page where it rests, looked up at most every 90 ms', () => {
    const { seen, send } = pointerOn();
    send('pointermove', 10, 20);
    send('pointermove', 15, 25);
    vi.advanceTimersByTime(89);
    expect(told).toEqual([]);
    send('pointermove', 30, 40);
    vi.advanceTimersByTime(1);
    expect(seen.lookups).toBe(1);
    expect(told).toEqual([{ ...ground, px: 30, py: 40 }]);
  });

  it('tells the page it left the ground: off the ground, out of the canvas, or a button down', () => {
    const { send } = pointerOn();
    const rest = (x: number) => {
      send('pointermove', x, 0);
      vi.advanceTimersByTime(90);
    };
    rest(1);
    const at = ground;
    ground = null;
    rest(2);
    expect(told).toEqual([{ ...at, px: 1, py: 0 }, null]);
    rest(3); // still off: told once
    expect(told).toHaveLength(2);
    ground = at;
    rest(4);
    send('pointerleave', 4, 0);
    rest(5);
    send('pointerdown', 5, 0);
    expect(told.slice(2)).toEqual([{ ...at, px: 4, py: 0 }, null, { ...at, px: 5, py: 0 }, null]);
  });

  it('is not looked up while a button is down, nor once the pointer has left the canvas', () => {
    const { pointer, seen, send } = pointerOn();
    send('pointermove', 1, 0);
    send('pointerdown', 1, 0);
    pointer.hover(); // the view moved under the held pointer
    vi.advanceTimersByTime(90);
    send('pointerup', 1, 0);
    send('pointerleave', 1, 0);
    pointer.hover();
    vi.advanceTimersByTime(90);
    expect(seen.lookups).toBe(0);
    expect(told).toEqual([]);
  });

  it('points at nothing where the view is drawn coarser than its finest step, or the pointer is a finger', () => {
    const coarse = pointerOn({ step: 1 });
    coarse.send('pointermove', 1, 0);
    vi.advanceTimersByTime(90);
    expect(coarse.seen.lookups).toBe(0);
    const touch = pointerOn();
    touch.send('pointermove', 1, 0, { kind: 'touch' });
    vi.advanceTimersByTime(90);
    expect(touch.seen.lookups).toBe(0);
    expect(told).toEqual([]);
  });

  it('is looked up anew when the view moves under it, and let go when the view says so', () => {
    const { pointer, seen, send } = pointerOn();
    send('pointermove', 1, 0);
    vi.advanceTimersByTime(90);
    const moved = { ...ground!, x: 9 };
    ground = moved;
    pointer.hover();
    vi.advanceTimersByTime(90);
    expect(told).toEqual([expect.objectContaining({ x: 1 }), { ...moved, px: 1, py: 0 }]);
    pointer.hover();
    pointer.hoverOff(); // the lookup on its way is dropped
    vi.advanceTimersByTime(90);
    expect(seen.lookups).toBe(2);
    expect(told[2]).toBe(null);
    expect(told).toHaveLength(3);
  });
});
