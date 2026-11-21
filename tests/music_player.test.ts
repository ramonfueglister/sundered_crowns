// The player of the background music (src/audio/music.ts): the settings it keeps, how a piece is loaded and faded in
// once it sounds, the next piece after one ends or fails, muting with a fade, the volume, waiting for a click where the
// browser holds sound back, and the keys M and N. Web Audio, the <audio> element, the storage and the media session are
// fakes that record what they are told; the module is loaded afresh for every test. (music.test.ts checks the track
// list and the volume rules.)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACKS } from '../src/audio/playlist';

/** an AudioParam: its value and the changes scheduled on it */
class FakeParam {
  value = 1;
  plan: [string, ...number[]][] = [];
  cancelScheduledValues(t: number) {
    this.plan.push(['cancel', t]);
  }
  setValueAtTime(v: number, t: number) {
    this.plan.push(['set', v, t]);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.plan.push(['ramp', v, t]);
  }
  setTargetAtTime(v: number, t: number, c: number) {
    this.plan.push(['target', v, t, c]);
  }
}
class FakeGain {
  gain = new FakeParam();
  connect<T>(next: T) {
    return next;
  }
}
class FakeContext {
  static made: FakeContext[] = [];
  currentTime = 10;
  state = 'running';
  destination = {};
  gains: FakeGain[] = [];
  resumed = 0;
  constructor() {
    FakeContext.made.push(this);
  }
  createMediaElementSource() {
    return new FakeGain();
  }
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  resume() {
    this.resumed++;
    return Promise.resolve();
  }
}
/** the <audio> element: plays as `answer` says */
class FakeAudio extends EventTarget {
  static made: FakeAudio[] = [];
  static answer: () => Promise<void> = () => Promise.resolve();
  src = '';
  preload = '';
  plays = 0;
  paused = 0;
  constructor() {
    super();
    FakeAudio.made.push(this);
  }
  play() {
    this.plays++;
    return FakeAudio.answer();
  }
  pause() {
    this.paused++;
  }
}

/**
 * the page's own listeners, kept as a browser keeps them: by type, function and capture (Node's EventTarget does not
 * remove a listener added with capture `true` when told to with `true`)
 */
class FakePage {
  listeners = new Map<string, Set<() => void>>();
  add = (type: string, f: () => void, capture = false) => {
    const k = `${type} ${capture}`;
    this.listeners.set(k, (this.listeners.get(k) ?? new Set()).add(f));
  };
  remove = (type: string, f: () => void, capture = false) => {
    this.listeners.get(`${type} ${capture}`)?.delete(f);
  };
  fire(type: string) {
    for (const capture of [true, false]) for (const f of [...(this.listeners.get(`${type} ${capture}`) ?? [])]) f();
  }
}

let stored = new Map<string, string>(),
  page = new FakePage(),
  session: { metadata: unknown; handlers: Map<string, () => void> };
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  FakeContext.made = [];
  FakeAudio.made = [];
  FakeAudio.answer = () => Promise.resolve();
  stored = new Map();
  page = new FakePage();
  session = { metadata: null, handlers: new Map() };
  vi.stubGlobal('window', { AudioContext: FakeContext });
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => stored.set(k, v),
  });
  vi.stubGlobal('addEventListener', page.add);
  vi.stubGlobal('removeEventListener', page.remove);
  vi.stubGlobal('navigator', {
    mediaSession: {
      set metadata(m: unknown) {
        session.metadata = m;
      },
      setActionHandler: (name: string, f: () => void) => session.handlers.set(name, f),
    },
  });
  vi.stubGlobal(
    'MediaMetadata',
    class {
      constructor(readonly init: { title: string; artist: string }) {}
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** the player, loaded afresh, and the fakes it made once it has played */
async function load() {
  const music = await import('../src/audio/music');
  const parts = () => {
    const ctx = FakeContext.made[0],
      el = FakeAudio.made[0];
    // the graph makes the piece's gain first, then the master
    return { ctx, el, track: ctx.gains[0].gain, master: ctx.gains[1].gain };
  };
  return { music, parts };
}
/** lets the promise of play() settle */
const settle = () => Promise.resolve().then(() => undefined);
const fileOf = (i: number) => `/audio/music/${TRACKS[i][0]}`;

describe('the music player', () => {
  it('keeps the volume and the mute of the last visit, and their defaults where the storage has none or fails', async () => {
    stored.set('sc.music.volume', '70');
    stored.set('sc.music.muted', '1');
    let { music } = await load();
    expect(music.musicVolume.value).toBe(70);
    expect(music.musicMuted.value).toBe(true);
    vi.resetModules();
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('private mode');
      },
      setItem: () => {
        throw new Error('private mode');
      },
    });
    ({ music } = await load());
    expect(music.musicVolume.value).toBe(music.DEFAULT_VOLUME);
    expect(music.musicMuted.value).toBe(false);
    music.setVolume(55); // and storing fails quietly
    expect(music.musicVolume.value).toBe(55);
  });

  it('starts with the first piece at its loudness, silent until it sounds, then fades it in over 1.2 s', async () => {
    const { music, parts } = await load();
    music.startMusic();
    const { ctx, el, track, master } = parts();
    expect(el.src).toBe(fileOf(0));
    expect(track.value).toBeCloseTo(music.dbGain(TRACKS[0][2]), 9);
    expect(master.plan).toEqual([
      ['cancel', 10],
      ['set', 0, 10],
    ]);
    expect(music.nowPlaying.value).toBe(TRACKS[0][1]);
    expect(session.metadata).toEqual({ init: { title: TRACKS[0][1], artist: 'Sundered Crowns' } });
    expect(ctx.resumed).toBe(1);
    expect(master.value).toBe(0);
    expect(el.plays).toBe(1);
    ctx.currentTime = 12;
    el.dispatchEvent(new Event('playing'));
    el.dispatchEvent(new Event('playing')); // once only
    expect(master.plan.slice(2)).toEqual([
      ['cancel', 12],
      ['set', 0, 12],
      ['ramp', music.sliderGain(music.DEFAULT_VOLUME), 12 + 1.2],
    ]);
    // started again, it plays on
    music.startMusic();
    expect(el.plays).toBe(1);
  });

  it('plays nothing where it is muted or the browser has no Web Audio', async () => {
    stored.set('sc.music.muted', '1');
    let { music } = await load();
    music.startMusic();
    expect(FakeAudio.made).toEqual([]);
    vi.resetModules();
    stored.clear();
    vi.stubGlobal('window', {});
    ({ music } = await load());
    music.startMusic();
    expect(FakeAudio.made).toEqual([]);
    expect(music.nowPlaying.value).toBe(null);
  });

  it('goes on to the next piece when one ends, when the player asks, or from the media keys', async () => {
    const { music, parts } = await load();
    music.startMusic();
    const { el } = parts();
    el.dispatchEvent(new Event('ended'));
    expect(el.src).toBe(fileOf(1));
    music.skip();
    expect(el.src).toBe(fileOf(2));
    session.handlers.get('nexttrack')!();
    expect(el.src).toBe(fileOf(3));
    expect(music.nowPlaying.value).toBe(TRACKS[3][1]);
    // not while muted
    music.setMuted(true);
    music.skip();
    session.handlers.get('nexttrack')!();
    expect(el.src).toBe(fileOf(3));
  });

  it('skips a piece that fails to load, and gives up once every piece failed in a row', async () => {
    const { music, parts } = await load();
    music.startMusic();
    const { el } = parts();
    el.dispatchEvent(new Event('error'));
    expect(el.src).toBe(fileOf(1));
    // a piece that sounds starts the count again
    el.dispatchEvent(new Event('playing'));
    for (let k = 1; k < TRACKS.length; k++) el.dispatchEvent(new Event('error'));
    expect(music.nowPlaying.value).toBe(TRACKS[0][1]);
    el.dispatchEvent(new Event('error'));
    expect(music.nowPlaying.value).toBe(null);
  });

  it('fades out over 0.4 s when muted, then pauses; unmuted it plays the same piece again', async () => {
    const { music, parts } = await load();
    music.startMusic();
    music.skip();
    const { ctx, el, master } = parts();
    master.value = 0.16;
    ctx.currentTime = 20;
    master.plan = [];
    music.setMuted(true);
    expect(stored.get('sc.music.muted')).toBe('1');
    expect(master.plan).toEqual([
      ['cancel', 20],
      ['set', 0.16, 20],
      ['ramp', 0, 20.4],
    ]);
    vi.advanceTimersByTime(399);
    expect(el.paused).toBe(0);
    vi.advanceTimersByTime(1);
    expect(el.paused).toBe(1);
    expect(music.nowPlaying.value).toBe(null);
    music.setMuted(false);
    expect(stored.get('sc.music.muted')).toBe('0');
    expect(el.src).toBe(fileOf(1));
    expect(music.nowPlaying.value).toBe(TRACKS[1][1]);
    // muted and unmuted within the fade: it does not pause
    music.setMuted(true);
    music.setMuted(false);
    vi.advanceTimersByTime(400);
    expect(el.paused).toBe(1);
  });

  it('plays nothing when unmuted before the game view opened', async () => {
    stored.set('sc.music.muted', '1');
    const { music } = await load();
    music.setMuted(false);
    expect(FakeAudio.made).toEqual([]);
  });

  it('sets the volume smoothly, keeps it, and turns the music on again where it was muted', async () => {
    const { music, parts } = await load();
    music.startMusic();
    const { ctx, el, master } = parts();
    master.plan = [];
    ctx.currentTime = 30;
    music.setVolume(140);
    expect(music.musicVolume.value).toBe(100);
    expect(stored.get('sc.music.volume')).toBe('100');
    expect(master.plan).toEqual([['target', 1, 30, 0.05]]);
    music.setMuted(true);
    music.setVolume(0); // stays muted
    expect(music.musicMuted.value).toBe(true);
    expect(el.plays).toBe(1);
    music.setVolume(20);
    expect(music.musicMuted.value).toBe(false);
    expect(el.plays).toBe(2);
  });

  it('waits for a click or key where the browser holds sound back, and plays then', async () => {
    FakeAudio.answer = () => Promise.reject(new DOMException('no gesture', 'NotAllowedError'));
    const { music, parts } = await load();
    music.startMusic();
    await settle();
    expect(music.musicWaiting.value).toBe(true);
    music.skip(); // held back again: still one wait
    await settle();
    const { ctx, el } = parts();
    FakeAudio.answer = () => Promise.resolve();
    page.fire('keydown');
    expect(music.musicWaiting.value).toBe(false);
    expect(ctx.resumed).toBe(3);
    expect(el.plays).toBe(3);
    // heard once only
    page.fire('pointerdown');
    expect(el.plays).toBe(3);
  });

  it('waits likewise where the context is not running, and plays nothing on the click once muted', async () => {
    const { music, parts } = await load();
    music.startMusic();
    const { ctx, el } = parts();
    ctx.state = 'suspended';
    music.skip();
    expect(music.musicWaiting.value).toBe(true);
    music.setMuted(true);
    page.fire('pointerdown');
    expect(music.musicWaiting.value).toBe(false);
    expect(ctx.resumed).toBe(2);
    expect(el.plays).toBe(2);
  });
});

describe('the keys of the music', () => {
  type Modifier = 'ctrlKey' | 'metaKey' | 'altKey' | 'repeat';
  const press = (key: string, o: Partial<Record<Modifier, boolean>> = {}, target?: object) => {
    const e = Object.assign(new Event('keydown'), {
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      repeat: false,
      ...o,
    });
    if (target) Object.defineProperty(e, 'target', { value: target });
    // (the keys read only the key, the modifier keys, repeat and the target of the event)
    return e as unknown as KeyboardEvent;
  };

  it('turn the music off and on with M and go to the next piece with N', async () => {
    const { music, parts } = await load();
    music.startMusic();
    expect(music.musicKey(press('M'))).toBe(true);
    expect(music.musicMuted.value).toBe(true);
    expect(music.musicKey(press('m'))).toBe(true);
    expect(music.musicMuted.value).toBe(false);
    expect(music.musicKey(press('n'))).toBe(true);
    expect(parts().el.src).toBe(fileOf(1));
    expect(music.musicKey(press('x'))).toBe(false);
  });

  it('leave keys with a modifier, held keys and what is typed into a field alone', async () => {
    const { music } = await load();
    const mods: Modifier[] = ['ctrlKey', 'metaKey', 'altKey', 'repeat'];
    for (const mod of mods) expect(music.musicKey(press('m', { [mod]: true }))).toBe(false);
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT'])
      expect(music.musicKey(press('m', {}, { tagName, isContentEditable: false }))).toBe(false);
    expect(music.musicKey(press('m', {}, { tagName: 'DIV', isContentEditable: true }))).toBe(false);
    expect(music.musicMuted.value).toBe(false);
    expect(music.musicKey(press('m', {}, { tagName: 'DIV', isContentEditable: false }))).toBe(true);
  });
});
