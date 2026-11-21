// The replay of the borders (src/ui/replay.ts): it fetches the history from the world server, plays it on its own
// clock at a pace that fits the whole history into BASE_SECONDS, gives the map new owners only when places changed
// and at most MAP_HZ times a second, pauses, plays again from the start at its end, and goes to a day of the timeline.
// The pictures are driven here by hand, and the server's history is given by a fake fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpOf } from '../src/figures/people';
import { worldUrl } from '../src/net/client';
import type { History, HistoryLine, HistoryRealm } from '../src/net/protocol';
import {
  replay,
  replayClock,
  replayError,
  replayLoading,
  replaySpeed,
  seekReplay,
  startReplay,
  stopReplay,
  toggleReplay,
} from '../src/ui/replay';

const realm = (id: number, en: string, color: number): HistoryRealm => ({
  id,
  key: en.toLowerCase(),
  color,
  short: { en, de: en },
  name: { en, de: en },
});
const FRANCE = realm(0, 'France', 0xff0000),
  ENGLAND = realm(1, 'England', 0x0000ff),
  BURGUNDY = realm(2, 'Burgundy', 0x00ff00);
/** five places over 4000 days: place 1 goes to England on day 100, place 2 to France and Burgundy comes in on day
 *  1000 (with a change to a place the world does not have), place 3 to Burgundy on the last day */
const LONG: History = {
  startYear: 1291,
  lines: [
    { d: 0, owner: [0, 0, 1, 1, -1], r: [FRANCE, ENGLAND] },
    { d: 100, c: [[1, 1]] },
    {
      d: 1000,
      c: [
        [2, 0],
        [9, 1],
      ],
      r: [BURGUNDY],
    },
    { d: 4000, c: [[3, 2]] },
  ],
};
const FIRST = [0, 0, 1, 1, -1],
  LAST = [0, 1, 0, 2, -1];

let frames = new Map<number, FrameRequestCallback>(),
  ids = 0,
  clock = 0,
  cancelled: number[] = [],
  asked: string[] = [];
/** the server answers every fetch with `answer` */
function serve(answer: () => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>) {
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url);
    return answer();
  });
}
const history = (h: History) => serve(async () => ({ ok: true, status: 200, json: async () => h }));
beforeEach(() => {
  frames = new Map();
  cancelled = [];
  asked = [];
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => {
    frames.set(++ids, f);
    return ids;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    cancelled.push(id);
    frames.delete(id);
  });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  stopReplay();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
/** shows a picture `ms` milliseconds after the last, `n` times, while the replay asks for one */
function run(ms: number, n: number) {
  for (let i = 0; i < n && frames.size; i++) {
    clock += ms;
    const now = [...frames.values()];
    frames.clear();
    for (const f of now) f(clock);
  }
}
const day = () => replayClock.value!.day;
const owners = () => [...replay.value!.owner];

describe('the replay of the borders', () => {
  it('fetches the history from the world server and shows its first day, playing at the middle speed', async () => {
    history(LONG);
    await startReplay();
    expect(asked).toEqual([`${httpOf(worldUrl)}/history`]);
    expect(replayClock.value).toEqual({ day: 0, from: 0, to: 4000, startYear: 1291, playing: true, speed: 3 });
    expect(owners()).toEqual(FIRST);
    expect(replay.value!.colors).toEqual([0xff0000, 0x0000ff]);
    expect(replay.value!.names.map((n) => n.en)).toEqual(['France', 'England']);
    expect(replayLoading.value).toBe(false);
    expect(frames.size).toBe(1);
  });

  it('plays the whole history in 40 seconds at the middle speed, faster or slower by the speed chosen', async () => {
    history(LONG);
    await startReplay();
    run(20, 50); // a second: 4000 days in 40 seconds
    expect(day()).toBeCloseTo(100, 6);
    replaySpeed(5); // four times as fast
    run(20, 10);
    expect(day()).toBeCloseTo(180, 6);
    replaySpeed(1); // a quarter as fast
    run(20, 50);
    expect(day()).toBeCloseTo(205, 6);
  });

  it('plays a short history at no less than 30 days a second', async () => {
    history({ startYear: 1291, lines: [LONG.lines[0], { d: 400, c: [[0, 1]] }] });
    await startReplay();
    run(20, 50);
    expect(day()).toBeCloseTo(30, 6);
  });

  it('goes on by a quarter of a second at most when a picture comes late', async () => {
    history(LONG);
    await startReplay();
    run(2000, 1);
    expect(day()).toBeCloseTo(25, 6);
  });

  it('gives the map new owners when places change, at most 12 times a second', async () => {
    // a place changes every day
    const lines: HistoryLine[] = [LONG.lines[0]];
    for (let d = 1; d <= 4000; d++) lines.push({ d, c: [[d % 4, d % 2]] });
    history({ startYear: 1291, lines });
    await startReplay();
    const shown = new Set([replay.value]);
    for (let i = 0; i < 62; i++) {
      run(16, 1);
      shown.add(replay.value);
    }
    // the first day, and then a new map no sooner than 1/12 s after the last
    expect(shown.size - 1).toBeLessThanOrEqual(12);
    expect(shown.size - 1).toBeGreaterThanOrEqual(8);
  });

  it('keeps the map as it is while no place changes', async () => {
    history(LONG);
    await startReplay();
    const first = replay.value;
    run(20, 25); // to day 50: nothing changed yet
    expect(replay.value).toBe(first);
    run(20, 30); // past day 100: place 1 went to England
    expect(owners()).toEqual([0, 1, 1, 1, -1]);
  });

  it('stays on the last day at its end, and played again begins from the first', async () => {
    history(LONG);
    await startReplay();
    replaySpeed(5);
    run(250, 100);
    expect(replayClock.value).toMatchObject({ day: 4000, playing: false });
    expect(owners()).toEqual(LAST);
    expect(frames.size).toBe(0);
    toggleReplay();
    expect(replayClock.value).toMatchObject({ day: 0, playing: true });
    expect(owners()).toEqual(FIRST);
    expect(frames.size).toBe(1);
  });

  it('pauses, and plays on from where it stood', async () => {
    history(LONG);
    await startReplay();
    run(20, 10);
    toggleReplay();
    const stood = day();
    run(20, 10);
    expect(replayClock.value!.playing).toBe(false);
    expect(day()).toBe(stood);
    toggleReplay();
    run(20, 10);
    expect(day()).toBeCloseTo(stood + 20, 6);
  });

  it('goes to a day of the timeline, back as well as forth, and no further than the history', async () => {
    history(LONG);
    await startReplay();
    toggleReplay();
    seekReplay(1500);
    // the change to a place the world does not have is left out
    expect(owners()).toEqual([0, 1, 0, 1, -1]);
    expect(replay.value!.colors[2]).toBe(0x00ff00);
    expect(replay.value!.names[2].en).toBe('Burgundy');
    seekReplay(50);
    expect(owners()).toEqual(FIRST);
    expect(replay.value!.names).toHaveLength(2);
    seekReplay(-10);
    expect(day()).toBe(0);
    seekReplay(99999);
    expect(day()).toBe(4000);
    expect(owners()).toEqual(LAST);
  });

  it('keeps its speed among the five', async () => {
    history(LONG);
    await startReplay();
    replaySpeed(0);
    expect(replayClock.value!.speed).toBe(1);
    replaySpeed(9);
    expect(replayClock.value!.speed).toBe(5);
  });

  it('shows the world again when closed, and asks for no more pictures', async () => {
    history(LONG);
    await startReplay();
    const [id] = frames.keys();
    stopReplay();
    expect(replay.value).toBe(null);
    expect(replayClock.value).toBe(null);
    expect(cancelled).toEqual([id]);
    expect(frames.size).toBe(0);
  });

  it('says it is loading while the history comes, and why it could not be had', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let answer = (_: { ok: boolean; status: number; json: () => Promise<unknown> }) => {};
    serve(() => new Promise((done) => (answer = done)));
    const started = startReplay();
    expect(replayLoading.value).toBe(true);
    answer({ ok: false, status: 503, json: async () => ({}) });
    await started;
    expect(replayLoading.value).toBe(false);
    expect(replayError.value).toBe('HTTP 503');
    expect(replay.value).toBe(null);
    expect(replayClock.value).toBe(null);
    // a history without lines, or whose first line has no owners
    history({ startYear: 1291, lines: [] });
    await startReplay();
    expect(replayError.value).toBe('no history');
    history({ startYear: 1291, lines: [{ d: 0 }] });
    await startReplay();
    expect(replayError.value).toBe('no history');
    // closed, the replay forgets the error; begun again too
    stopReplay();
    expect(replayError.value).toBe(null);
    serve(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    await startReplay();
    expect(replayError.value).toBe('HTTP 500');
    history(LONG);
    await startReplay();
    expect(replayError.value).toBe(null);
  });
});
