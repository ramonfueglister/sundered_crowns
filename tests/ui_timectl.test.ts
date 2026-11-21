// The world's clock in the top bar (src/ui/timectl.ts): what its speeds say in their tooltips, and its keys: space,
// + and − for who may change the time, space and Escape for a replay, nothing for what is typed into a field. What is
// sent to the world server and what the replay is told are fakes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { me, world } from '../src/net/client';
import type { Me, WorldInfo } from '../src/net/protocol';
import { setLang } from '../src/ui/i18n';

const sent: { paused?: boolean; speed?: number }[] = [];
vi.mock('../src/net/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/net/client')>()),
  setTime: (t: { paused?: boolean; speed?: number }) => sent.push(t),
}));
const told: string[] = [];
vi.mock('../src/ui/replay', async () => {
  const { signal } = await import('@preact/signals');
  return {
    replayClock: signal<object | null>(null),
    stopReplay: () => told.push('stop'),
    toggleReplay: () => told.push('toggle'),
  };
});
const { speedText, timeKey } = await import('../src/ui/timectl');
const { replayClock } = await import('../src/ui/replay');

/** an element of the page, as far as `closest` goes up from it */
class FakeEl {
  constructor(
    readonly tagName: string,
    readonly parent: FakeEl | null = null,
  ) {}
  closest(sel: string): FakeEl | null {
    const tags = sel.split(',').map((s) => s.trim().toUpperCase());
    for (let e: FakeEl | null = this; e; e = e.parent) if (tags.includes(e.tagName)) return e;
    return null;
  }
}
/** a key pressed, and whether the page was kept from its own use of it */
function press(
  key: string,
  o: { code?: string; target?: FakeEl | null; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {},
) {
  let prevented = false;
  const e = {
    key,
    code: o.code ?? (key === ' ' ? 'Space' : ''),
    ctrlKey: !!o.ctrlKey,
    metaKey: !!o.metaKey,
    altKey: !!o.altKey,
    target: o.target === undefined ? new FakeEl('BODY') : o.target,
    preventDefault: () => {
      prevented = true;
    },
  };
  // (a cast: timeKey reads only these members of the event)
  timeKey(e as unknown as KeyboardEvent);
  return prevented;
}
const info = (o: Partial<WorldInfo> = {}): WorldInfo => ({
  id: 'w',
  name: 'w',
  day: 0,
  startYear: 1356,
  secondsPerDay: 120,
  paused: false,
  players: 1,
  maxPlayers: 8,
  speed: 3,
  ...o,
});
/** a replay of the borders running */
const REPLAY = { day: 10, from: 0, to: 4000, startYear: 1356, playing: true, speed: 1 };
const player = (time: boolean): Me => ({ uid: 'u', name: 'a player', admin: false, realm: -1, time });
beforeEach(() => {
  sent.length = 0;
  told.length = 0;
  world.value = info();
  me.value = player(true);
  replayClock.value = null;
});
afterEach(() => {
  setLang('en');
  world.value = null;
  me.value = null;
});

describe('the speeds of the clock', () => {
  it('say how long a day takes at each', () => {
    setLang('en');
    expect([1, 2, 3, 4, 5].map((s) => speedText(s, 120))).toEqual([
      "the world's own pace, one day in 2 min",
      'one day in 2 s',
      'one day in 1 s',
      'one day in 0.25 s',
      'as fast as the server can',
    ]);
  });

  it('say seconds below a minute, whole minutes from one on', () => {
    setLang('en');
    expect(speedText(1, 59.5)).toBe("the world's own pace, one day in 59.5 s");
    expect(speedText(1, 60)).toBe("the world's own pace, one day in 1 min");
    expect(speedText(1, 90)).toBe("the world's own pace, one day in 2 min");
    expect(speedText(1, 0.125)).toBe("the world's own pace, one day in 0.13 s");
    setLang('de');
    expect(speedText(1, 1234.5)).toBe('eigenes Tempo der Welt, ein Tag in 21 min');
    expect(speedText(1, 2.5)).toBe('eigenes Tempo der Welt, ein Tag in 2.5 s'); // as in Switzerland
    expect(speedText(4, 120)).toBe('ein Tag in 0.25 s');
  });
});

describe('the keys of the clock', () => {
  it('pause and run the world with space', () => {
    expect(press(' ')).toBe(true);
    world.value = info({ paused: true });
    press(' ');
    // the space bar is known by where it sits on the keyboard, whatever it writes
    press('Unidentified', { code: 'Space' });
    expect(sent).toEqual([{ paused: true }, { paused: false }, { paused: false }]);
  });

  it('make the world faster with + and slower with −, within the speeds there are', () => {
    expect(press('+')).toBe(true);
    expect(press('', { code: 'NumpadAdd' })).toBe(true);
    expect(press('-')).toBe(true);
    expect(press('', { code: 'NumpadSubtract' })).toBe(true);
    expect(sent).toEqual([{ speed: 4 }, { speed: 4 }, { speed: 2 }, { speed: 2 }]);
    sent.length = 0;
    world.value = info({ speed: 5 });
    press('+');
    world.value = info({ speed: 1 });
    press('-');
    world.value = info({ speed: undefined }); // an older server: its own pace
    press('+');
    expect(sent).toEqual([{ speed: 5 }, { speed: 1 }, { speed: 2 }]);
  });

  it('leave the page every other key', () => {
    for (const key of ['a', 'Enter', 'Escape', '1']) expect(press(key), key).toBe(false);
    expect(sent).toEqual([]);
  });

  it('do nothing for who may not change the time, or before the world is known', () => {
    me.value = player(false);
    expect(press(' ')).toBe(false);
    expect(press('+')).toBe(false);
    me.value = null;
    expect(press('-')).toBe(false);
    me.value = player(true);
    world.value = null;
    expect(press(' ')).toBe(false);
    expect(sent).toEqual([]);
  });

  it('do nothing held with Ctrl, Cmd or Alt, or typed into a field', () => {
    expect(press('+', { ctrlKey: true })).toBe(false);
    expect(press('+', { metaKey: true })).toBe(false);
    expect(press('+', { altKey: true })).toBe(false);
    const form = new FakeEl('FORM');
    for (const field of ['INPUT', 'TEXTAREA', 'SELECT'])
      expect(press(' ', { target: new FakeEl(field, form) })).toBe(false);
    // also inside a field, as an option is inside its select
    expect(press(' ', { target: new FakeEl('OPTION', new FakeEl('SELECT')) })).toBe(false);
    expect(sent).toEqual([]);
    // a button or the page itself is no field; a key without an element still counts
    expect(press(' ', { target: new FakeEl('BUTTON', form) })).toBe(true);
    expect(press('+', { target: null })).toBe(true);
    expect(sent).toHaveLength(2);
  });
});

describe('the keys of the clock in a replay', () => {
  it('pause and run the replay with space and end it with Escape, also for who may not change the time', () => {
    replayClock.value = REPLAY;
    me.value = player(false);
    expect(press(' ')).toBe(true);
    expect(press('Escape')).toBe(true);
    expect(told).toEqual(['toggle', 'stop']);
    expect(sent).toEqual([]);
  });

  it('still change the world’s speed with + and −', () => {
    replayClock.value = REPLAY;
    press('+');
    expect(sent).toEqual([{ speed: 4 }]);
    expect(told).toEqual([]);
  });

  it('are not for a replay typed into a field, nor held with Ctrl', () => {
    replayClock.value = REPLAY;
    press('Escape', { target: new FakeEl('INPUT') });
    press(' ', { ctrlKey: true });
    expect(told).toEqual([]);
  });
});
