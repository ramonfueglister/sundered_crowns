// The conversation with a person beside the person panel (src/people/talk.ts): what the player says and what the person
// answers, word by word; a line that got no answer; and that closing the box or opening another person ends the
// conversation, also while an answer is still coming. The page's elements are fakes, and so is the world server's
// `talk` (src/net/client.ts): each call waits until the test answers it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TalkLine } from '../src/net/protocol';

/** an element of the page, as far as the conversation box uses it */
class FakeEl {
  className = '';
  textContent = '';
  hidden = false;
  type = '';
  title = '';
  value = '';
  placeholder = '';
  maxLength = -1;
  disabled = false;
  scrollTop = 0;
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  attrs = new Map<string, string>();
  onclick: (() => void) | null = null;
  onsubmit: ((e: { preventDefault(): void }) => void) | null = null;
  constructor(readonly tagName: string) {}
  get scrollHeight() {
    return 20 * this.children.length;
  }
  append(...add: FakeEl[]) {
    for (const c of add) {
      c.remove();
      c.parent = this;
      this.children.push(c);
    }
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
  focus() {
    focused = this;
  }
}
let focused: FakeEl | null = null;

/** the calls to the world server, each with what was sent and the way to answer it */
interface Call {
  person: number;
  lines: TalkLine[];
  word(t: string): void;
  done(): void;
  fail(message: string): void;
}
const calls: Call[] = [];
vi.mock('../src/net/client', () => ({
  talk: (person: number, lines: TalkLine[], onText: (t: string) => void) =>
    new Promise<void>((done, fail) =>
      calls.push({ person, lines: [...lines], word: onText, done, fail: (m) => fail(new Error(m)) }),
    ),
}));
const { createTalkBox } = await import('../src/people/talk');

beforeEach(() => {
  calls.length = 0;
  focused = null;
  vi.stubGlobal('document', { createElement: (tag: string) => new FakeEl(tag.toUpperCase()) });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
/** lets the answers' promises run on */
const settle = () => new Promise((r) => setTimeout(r, 0));

/** a conversation box on a page, with its parts */
function page() {
  const host = new FakeEl('BODY');
  // (a cast: the box only appends itself to its host)
  const talk = createTalkBox(host as unknown as HTMLElement);
  const [box] = host.children,
    [head, log, form] = box.children,
    [title, close] = head.children,
    [input, send] = form.children;
  let prevented = 0;
  /** the player says `text` */
  const say = (text: string) => {
    input.value = text;
    form.onsubmit?.({ preventDefault: () => prevented++ });
  };
  /** what the log shows, by who said it */
  const shown = () => log.children.map((p) => `${p.className}: ${p.textContent}`);
  return { talk, box, log, title, close, input, send, say, shown, prevented: () => prevented };
}

describe('the conversation box', () => {
  it('opens titled with the person, ready to be written in, and closes', () => {
    const p = page();
    expect(p.box.hidden).toBe(true);
    p.talk.open(7, 'Agnes');
    expect(p.box.hidden).toBe(false);
    expect(p.title.textContent).toBe('Gespräch mit Agnes');
    expect(focused).toBe(p.input);
    expect(p.input.maxLength).toBe(600);
    p.talk.close();
    expect(p.box.hidden).toBe(true);
    p.talk.open(7, 'Agnes');
    p.close.onclick?.();
    expect(p.box.hidden).toBe(true);
  });

  it('sends what the player says with the conversation so far, and shows the answer as it comes', async () => {
    const p = page();
    p.talk.open(7, 'Agnes');
    p.say('  Wie geht es dir?  ');
    expect(p.prevented()).toBe(1);
    expect(p.input.value).toBe('');
    expect(p.send.disabled).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].person).toBe(7);
    expect(calls[0].lines).toEqual([{ who: 'player', text: 'Wie geht es dir?' }]);
    expect(p.shown()).toEqual(['player: Wie geht es dir?', 'person: …']);
    calls[0].word('Gut, ');
    calls[0].word('danke.');
    expect(p.shown()).toEqual(['player: Wie geht es dir?', 'person: Gut, danke.']);
    expect(p.log.scrollTop).toBe(p.log.scrollHeight);
    focused = null;
    calls[0].done();
    await settle();
    expect(p.send.disabled).toBe(false);
    expect(focused).toBe(p.input);
    // the answer is part of the conversation the next line is sent with
    p.say('Und die Ernte?');
    expect(calls[1].lines).toEqual([
      { who: 'player', text: 'Wie geht es dir?' },
      { who: 'person', text: 'Gut, danke.' },
      { who: 'player', text: 'Und die Ernte?' },
    ]);
  });

  it('sends nothing for an empty line, nor while an answer is coming', async () => {
    const p = page();
    p.talk.open(7, 'Agnes');
    p.say('   ');
    expect(calls).toHaveLength(0);
    expect(p.shown()).toEqual([]);
    p.say('Hallo');
    p.say('Hörst du mich?');
    expect(calls).toHaveLength(1);
    expect(p.input.value).toBe('Hörst du mich?'); // kept, to be sent once the answer is there
  });

  it('leaves an answer without words out of the conversation', async () => {
    const p = page();
    p.talk.open(7, 'Agnes');
    p.say('Hallo');
    calls[0].done();
    await settle();
    p.say('Hallo?');
    expect(calls[1].lines).toEqual([
      { who: 'player', text: 'Hallo' },
      { who: 'player', text: 'Hallo?' },
    ]);
  });

  it('takes a line that got no answer out of the conversation, and says why', async () => {
    const p = page();
    p.talk.open(7, 'Agnes');
    p.say('Hallo');
    calls[0].word('Gr');
    calls[0].fail('Keine Verbindung zum Server.');
    await settle();
    expect(p.shown()).toEqual(['player: Hallo', 'note: Keine Verbindung zum Server.']);
    expect(p.send.disabled).toBe(false);
    p.say('Hallo?');
    expect(calls[1].lines).toEqual([{ who: 'player', text: 'Hallo?' }]);
  });
});

describe('a conversation', () => {
  it('goes on when the same person is opened again while the box is open', async () => {
    const p = page();
    p.talk.open(7, 'Agnes');
    p.say('Hallo');
    calls[0].word('Grüss Gott.');
    calls[0].done();
    await settle();
    p.talk.open(7, 'Agnes von Rheinfelden');
    expect(p.title.textContent).toBe('Gespräch mit Agnes von Rheinfelden');
    expect(p.shown()).toEqual(['player: Hallo', 'person: Grüss Gott.']);
    p.say('Wie geht es?');
    expect(calls[1].lines).toHaveLength(3);
  });

  it('ends when another person is opened: what the first still answers is not shown', async () => {
    const p = page();
    p.talk.open(7, 'Agnes');
    p.say('Hallo');
    p.talk.open(9, 'Konrad');
    expect(p.shown()).toEqual([]);
    expect(p.send.disabled).toBe(false);
    calls[0].word('Grüss Gott.');
    calls[0].fail('zu spät');
    await settle();
    expect(p.shown()).toEqual([]);
    p.say('Wer bist du?');
    expect(calls[1].person).toBe(9);
    expect(calls[1].lines).toEqual([{ who: 'player', text: 'Wer bist du?' }]);
    // the first answer ending late leaves the new one waiting
    expect(p.send.disabled).toBe(true);
  });

  it('ends when the box is closed: opened again, the same person starts anew', async () => {
    const p = page();
    p.talk.open(7, 'Agnes');
    p.say('Hallo');
    calls[0].word('Grüss ');
    p.talk.close();
    calls[0].word('Gott.');
    expect(p.shown()).toEqual(['player: Hallo', 'person: Grüss ']);
    p.talk.open(7, 'Agnes');
    expect(p.shown()).toEqual([]);
    expect(p.send.disabled).toBe(false);
    p.say('Bist du noch da?');
    focused = null;
    calls[0].done();
    await settle();
    // the old answer's end neither joins the conversation nor frees the box for the next line
    expect(p.send.disabled).toBe(true);
    expect(focused).toBe(null);
    calls[1].word('Ja.');
    calls[1].done();
    await settle();
    p.say('Gut.');
    expect(calls[2].lines).toEqual([
      { who: 'player', text: 'Bist du noch da?' },
      { who: 'person', text: 'Ja.' },
      { who: 'player', text: 'Gut.' },
    ]);
  });
});
