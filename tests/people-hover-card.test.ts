// The card a figure shows while the pointer rests on it (src/people/hover.ts): when it shows and for whom, where it
// stands beside the pointer, how long a person's data are kept, an answer that comes too late, and the look-up again
// while the figure walks on. The page's elements, the world server, the figures on the stage and the lines of the card
// (tests/people-hover.test.ts tests those) are fakes; the time is faked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldHover } from '../src/worldprobe/view';

/** an element of the page, as far as the card uses it */
class FakeEl {
  className = '';
  textContent = '';
  hidden = false;
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  style = { transform: '' };
  attrs = new Map<string, string>();
  offsetWidth = 200;
  offsetHeight = 100;
  constructor(readonly tagName: string) {}
  append(...add: FakeEl[]) {
    for (const c of add) {
      c.remove();
      c.parent = this;
      this.children.push(c);
    }
  }
  prepend(c: FakeEl) {
    this.append(c);
    this.children.unshift(this.children.pop() as FakeEl); // (append just put it last)
  }
  remove() {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  replaceChildren(...add: FakeEl[]) {
    for (const c of [...this.children]) c.remove();
    this.append(...add);
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  insertRow() {
    const r = new FakeEl('TR');
    this.append(r);
    return r;
  }
  insertCell() {
    const c = new FakeEl('TD');
    this.append(c);
    return c;
  }
  /** all elements below this one */
  all(): FakeEl[] {
    return this.children.flatMap((c) => [c, ...c.all()]);
  }
  /** the first element below that fits a chain of `tag` or `tag.class`, as the browser's querySelector */
  querySelector(sel: string): FakeEl | null {
    const [first, ...rest] = sel.split(' '),
      [tag, cls] = first.split('.');
    for (const c of this.all())
      if (c.tagName === tag.toUpperCase() && (!cls || c.className === cls)) {
        const found = rest.length ? c.querySelector(rest.join(' ')) : c;
        if (found) return found;
      }
    return null;
  }
  getBoundingClientRect() {
    return { left: 10, top: 20, width: 1000, height: 600 };
  }
}

/** the figures on the stage, by where they stand (`x,z`), and how often one was looked for */
const figures = new Map<string, number>();
let lookedFor = 0;
vi.mock('../src/figures/stage', () => ({
  personAt: (x: number, _y: number, z: number) => {
    lookedFor++;
    return figures.get(`${x},${z}`) ?? null;
  },
}));
/** what the person does now, and what the card's lines were made of */
let doing = 'pflügt';
const made: [string, number | null, number | undefined][] = [];
vi.mock('../src/people/hover_lines', () => ({
  hoverLines: (p: { name: string }, hour: number | null, day: number | undefined) => {
    made.push([p.name, hour, day]);
    return {
      title: p.name,
      rows: [
        ['Alter', '30 Jahre'],
        ['Jetzt', doing],
      ],
    };
  },
}));
vi.mock('../src/net/client', () => ({ world: { value: { day: 12 } }, worldHour: () => 9.5 }));
const { listenForWorldHover } = await import('../src/people/hover');

/** what was asked of the world server, each with the way to answer it */
const asked: { url: string; answer(name: string | null): void; fail(): void }[] = [];
let clock = 0;
let win: EventTarget;
beforeEach(() => {
  asked.length = 0;
  made.length = 0;
  figures.clear();
  lookedFor = 0;
  doing = 'pflügt';
  clock = 1000;
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  win = Object.assign(new EventTarget(), { setInterval: (f: () => void, ms: number) => setInterval(f, ms) });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', { createElement: (tag: string) => new FakeEl(tag.toUpperCase()) });
  vi.stubGlobal(
    'fetch',
    (url: string) =>
      new Promise((done, fail) =>
        asked.push({
          url,
          answer: (name) => done(name ? { ok: true, json: async () => ({ name }) } : { ok: false }),
          fail: () => fail(new Error('no connection')),
        }),
      ),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
/** lets the answers' promises run on */
const settle = () => new Promise((r) => setTimeout(r, 0));
/** the pointer rests at (x, z) of the ground, at (px, py) of the page, in `step`; null: it left the ground */
const rest = (x: number, z: number, px = 100, py = 100, step = 0) =>
  win.dispatchEvent(
    new CustomEvent<WorldHover>('world-hover', { detail: { x, y: 0, z, step, lon: 0, lat: 0, px, py } }),
  );
const leave = () => win.dispatchEvent(new CustomEvent('world-hover', { detail: null }));

/** a card over a page, with a world server at `url` */
function page(url = 'wss://world.example/') {
  const host = new FakeEl('BODY');
  // (a cast: the card only appends itself to its host and asks for the host's box)
  const hover = listenForWorldHover(host as unknown as HTMLElement, url);
  const card = host.children[0];
  /** the card's title and rows as shown */
  const shown = () =>
    card.hidden
      ? null
      : [
          card.children[0].textContent,
          ...(card.querySelector('table')?.children ?? []).map((tr) =>
            tr.children.map((c) => c.textContent).join(': '),
          ),
          card.children[2].textContent,
        ];
  return { host, hover, card, shown };
}

describe('the card of a figure', () => {
  it('shows who the person under the resting pointer is, asked of the world server', async () => {
    const { card, shown } = page();
    expect(card.hidden).toBe(true);
    expect(card.className).toBe('person-hover');
    expect(card.attrs.get('role')).toBe('tooltip');
    figures.set('5,7', 42);
    rest(5, 7);
    expect(asked.map((a) => a.url)).toEqual(['https://world.example/person/42']);
    asked[0].answer('Agnes');
    await settle();
    expect(shown()).toEqual(['Agnes', 'Alter: 30 Jahre', 'Jetzt: pflügt', 'Klicken für mehr']);
    expect(card.querySelector('tr.now td')?.textContent).toBe('pflügt');
    expect(card.querySelector('tr')?.className).toBe('');
    // the lines are made at the world's hour and day
    expect(made).toEqual([['Agnes', 9.5, 12]]);
  });

  it('is not shown away from the finest step, where no figure stands, or when the pointer leaves', async () => {
    const { card } = page();
    figures.set('5,7', 42);
    rest(5, 7, 100, 100, 1);
    rest(6, 7);
    expect(asked).toHaveLength(0);
    rest(5, 7);
    asked[0].answer('Agnes');
    await settle();
    expect(card.hidden).toBe(false);
    rest(6, 7);
    expect(card.hidden).toBe(true);
    rest(5, 7);
    await settle();
    expect(card.hidden).toBe(false);
    leave();
    expect(card.hidden).toBe(true);
    rest(5, 7);
    await settle();
    rest(5, 7, 100, 100, 2);
    expect(card.hidden).toBe(true);
  });

  it('is never shown without a world server', async () => {
    const { card } = page('');
    figures.set('5,7', 42);
    rest(5, 7);
    await settle();
    expect(asked).toHaveLength(0);
    expect(card.hidden).toBe(true);
  });

  it('is not shown for a person the server does not give', async () => {
    const { card } = page();
    figures.set('5,7', 42);
    figures.set('6,7', 43);
    figures.set('8,7', 44);
    rest(5, 7);
    asked[0].answer('Agnes');
    await settle();
    rest(6, 7);
    asked[1].answer(null);
    await settle();
    expect(card.hidden).toBe(true);
    rest(8, 7);
    asked[2].fail();
    await settle();
    expect(card.hidden).toBe(true);
  });

  it('shows nobody whose answer comes after the pointer moved on or left', async () => {
    const { shown } = page();
    figures.set('5,7', 42);
    figures.set('6,7', 43);
    rest(5, 7);
    rest(6, 7);
    asked[0].answer('Agnes');
    await settle();
    expect(shown()).toBe(null);
    asked[1].answer('Konrad');
    await settle();
    expect(shown()?.[0]).toBe('Konrad');
    figures.set('9,9', 50);
    rest(9, 9);
    leave();
    asked[2].answer('Hedwig');
    await settle();
    expect(shown()).toBe(null);
    // nor when the pointer rests on ground where nobody stands
    figures.set('3,3', 60);
    rest(3, 3);
    rest(4, 4);
    asked[3].answer('Ulrich');
    await settle();
    expect(shown()).toBe(null);
  });

  it('is made anew for another person, also one who does the same', async () => {
    const { shown } = page();
    figures.set('5,7', 42);
    figures.set('6,7', 43);
    rest(5, 7);
    asked[0].answer('Agnes');
    await settle();
    rest(6, 7);
    asked[1].answer('Konrad');
    await settle();
    expect(shown()).toEqual(['Konrad', 'Alter: 30 Jahre', 'Jetzt: pflügt', 'Klicken für mehr']);
  });
});

describe('where the card stands', () => {
  it('is below and right of the pointer, else on the other side where it would leave the page', async () => {
    const { card } = page();
    figures.set('5,7', 42);
    const at = async (px: number, py: number) => {
      rest(5, 7, px, py);
      if (asked.length === 1 && card.hidden) asked[0].answer('Agnes');
      await settle();
      return card.style.transform;
    };
    // (the page's box starts at 10, 20 and is 1000 by 600; the card is 200 by 100)
    expect(await at(100, 100)).toBe('translate(108px, 98px)');
    expect(await at(900, 100)).toBe('translate(676px, 98px)'); // 908 + 200 > 1000 − 8
    expect(await at(100, 550)).toBe('translate(108px, 416px)'); // 548 + 100 > 600 − 8
    expect(await at(784, 494)).toBe('translate(792px, 492px)'); // just fits
    expect(await at(785, 495)).toBe('translate(561px, 361px)');
    expect(await at(0, 0)).toBe('translate(8px, 8px)'); // never nearer the edge than 8
    // also where it fits on neither side
    card.offsetWidth = 990;
    card.offsetHeight = 590;
    expect(await at(100, 100)).toBe('translate(8px, 8px)');
  });
});

describe('the card of the same person', () => {
  it('stays as it is while the person does the same, and is made anew when that changes', async () => {
    const { card, shown } = page();
    figures.set('5,7', 42);
    figures.set('5,8', 42); // the figure took a step
    rest(5, 7);
    asked[0].answer('Agnes');
    await settle();
    const head = card.children[0];
    rest(5, 8, 300, 200);
    await settle();
    expect(card.children[0]).toBe(head);
    expect(card.style.transform).toBe('translate(308px, 198px)');
    doing = 'isst';
    rest(5, 8);
    await settle();
    expect(card.children[0]).not.toBe(head);
    expect(shown()).toContain('Jetzt: isst');
  });
});

describe('the data of a person', () => {
  it('are asked for again only after 20 seconds', async () => {
    page();
    figures.set('5,7', 42);
    rest(5, 7);
    asked[0].answer('Agnes');
    await settle();
    leave();
    clock += 19_999;
    rest(5, 7);
    expect(asked).toHaveLength(1);
    leave();
    clock += 1;
    rest(5, 7);
    expect(asked).toHaveLength(2);
  });

  it('are kept for no more than 300 persons: the one asked for longest ago goes first', () => {
    page();
    for (let id = 1; id <= 301; id++) {
      figures.set(`${id},0`, id);
      rest(id, 0);
    }
    expect(asked).toHaveLength(301);
    rest(2, 0);
    expect(asked).toHaveLength(301);
    rest(1, 0);
    expect(asked).toHaveLength(302);
    expect(asked[301].url).toBe('https://world.example/person/1');
  });

  it('asked for again count as asked for last', () => {
    page();
    for (let id = 1; id <= 3; id++) {
      figures.set(`${id},0`, id);
      rest(id, 0);
    }
    clock += 20_000;
    rest(1, 0);
    expect(asked).toHaveLength(4);
    for (let id = 4; id <= 301; id++) {
      figures.set(`${id},0`, id);
      rest(id, 0);
    }
    // 2 went, the oldest; 1 was asked for after 3
    rest(1, 0);
    expect(asked).toHaveLength(302);
    rest(2, 0);
    expect(asked).toHaveLength(303);
    expect(asked[302].url).toBe('https://world.example/person/2');
  });
});

describe('the figure walking on', () => {
  it('is looked up again every 350 ms while the card shows, and the card goes when nobody stands there', async () => {
    const { card } = page();
    figures.set('5,7', 42);
    rest(5, 7);
    asked[0].answer('Agnes');
    await settle();
    // made anew: still one look-up again
    doing = 'isst';
    rest(5, 7);
    await settle();
    lookedFor = 0;
    vi.advanceTimersByTime(349);
    expect(lookedFor).toBe(0);
    vi.advanceTimersByTime(1);
    expect(lookedFor).toBe(1);
    await settle();
    expect(card.hidden).toBe(false);
    figures.delete('5,7');
    vi.advanceTimersByTime(350);
    await settle();
    expect(card.hidden).toBe(true);
    lookedFor = 0;
    vi.advanceTimersByTime(3500);
    expect(lookedFor).toBe(0);
    // shown again, it is looked up again again
    figures.set('5,7', 42);
    rest(5, 7);
    await settle();
    lookedFor = 0;
    vi.advanceTimersByTime(350);
    expect(lookedFor).toBe(1);
  });
});

describe('the card, given up', () => {
  it('leaves the page and no longer listens', async () => {
    const { host, hover, card } = page();
    figures.set('5,7', 42);
    rest(5, 7);
    asked[0].answer('Agnes');
    await settle();
    hover.dispose();
    expect(host.children).toEqual([]);
    expect(card.hidden).toBe(true);
    lookedFor = 0;
    vi.advanceTimersByTime(3500);
    rest(5, 7);
    expect(lookedFor).toBe(0);
  });
});
