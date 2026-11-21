// The map mode the player has chosen (src/ui/mapmode.ts): which mode a visit opens in, that a chosen mode is kept, what
// the land is coloured by in each mode, and the keys 1 to 3. The storage and the page's elements are fakes; the module
// is loaded afresh where the mode a visit opens in is checked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEPT = 'sundered-crowns.map-mode';
let stored = new Map<string, string>();
/** the storage of the page: `broken` throws as in private mode */
function storage(broken = false) {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => {
      if (broken) throw new Error('private mode');
      return stored.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (broken) throw new Error('private mode');
      stored.set(k, v);
    },
  });
}
/** an element of the page, as far as the keys look at it */
class FakeElement {
  constructor(
    readonly tagName: string,
    readonly isContentEditable = false,
  ) {}
}
beforeEach(() => {
  vi.resetModules();
  stored = new Map();
  storage();
  vi.stubGlobal('HTMLElement', FakeElement);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const load = () => import('../src/ui/mapmode');
/** a key pressed on `target` (the page's body unless given) */
const press = (key: string, o: { target?: FakeElement; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}) =>
  // (a cast: mapModeKey reads only the key, the three modifiers and the target)
  ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: new FakeElement('BODY'),
    ...o,
  }) as unknown as KeyboardEvent;

describe('the map mode of a visit', () => {
  it('is the one it was left in, else political', async () => {
    const cases: [string | undefined, string][] = [
      ['terrain', 'terrain'],
      ['rulers', 'rulers'],
      ['political', 'political'],
      [undefined, 'political'],
      ['trade', 'political'], // a mode the menu does not have is left aside
    ];
    for (const [left, opens] of cases) {
      vi.resetModules();
      stored = new Map(left ? [[KEPT, left]] : []);
      expect((await load()).mapMode.value).toBe(opens);
    }
  });

  it('is political where the browser keeps nothing', async () => {
    storage(true);
    const { mapMode, setMapMode } = await load();
    expect(mapMode.value).toBe('political');
    setMapMode('terrain');
    expect(mapMode.value).toBe('terrain');
  });

  it('is kept when chosen', async () => {
    const { mapMode, setMapMode } = await load();
    setMapMode('rulers');
    expect(mapMode.value).toBe('rulers');
    expect(stored.get(KEPT)).toBe('rulers');
    vi.resetModules();
    expect((await load()).mapMode.value).toBe('rulers');
  });
});

describe('the land of a mode', () => {
  it('is coloured as in the political mode where the rulers are shown, else by the mode itself', async () => {
    const { landOf } = await load();
    expect(landOf('rulers')).toBe('political');
    expect(landOf('political')).toBe('political');
    expect(landOf('terrain')).toBe('terrain');
  });
});

describe('the map mode keys', () => {
  it('choose political, terrain and rulers with 1, 2 and 3', async () => {
    const { mapMode, mapModeKey } = await load();
    for (const [key, mode] of [
      ['2', 'terrain'],
      ['3', 'rulers'],
      ['1', 'political'],
    ]) {
      expect(mapModeKey(press(key)), key).toBe(true);
      expect(mapMode.value).toBe(mode);
      expect(stored.get(KEPT)).toBe(mode);
    }
  });

  it('leave a key that is none of them', async () => {
    const { mapMode, mapModeKey } = await load();
    for (const key of ['4', '0', 'a', 'Enter']) expect(mapModeKey(press(key)), key).toBe(false);
    expect(mapMode.value).toBe('political');
    expect(stored.has(KEPT)).toBe(false);
  });

  it('leave a key held with Ctrl, Cmd or Alt', async () => {
    const { mapMode, mapModeKey } = await load();
    expect(mapModeKey(press('2', { ctrlKey: true }))).toBe(false);
    expect(mapModeKey(press('2', { metaKey: true }))).toBe(false);
    expect(mapModeKey(press('2', { altKey: true }))).toBe(false);
    expect(mapMode.value).toBe('political');
  });

  it('leave what is typed into a field', async () => {
    const { mapMode, mapModeKey } = await load();
    for (const field of ['INPUT', 'TEXTAREA', 'SELECT'])
      expect(mapModeKey(press('2', { target: new FakeElement(field) })), field).toBe(false);
    expect(mapModeKey(press('2', { target: new FakeElement('DIV', true) })), 'editable').toBe(false);
    expect(mapMode.value).toBe('political');
    // a field's name only counts as a whole: a button or a label is not one
    expect(mapModeKey(press('2', { target: new FakeElement('INPUTS') }))).toBe(true);
    expect(mapModeKey(press('3', { target: new FakeElement('BUTTON') }))).toBe(true);
    expect(mapMode.value).toBe('rulers');
  });
});
