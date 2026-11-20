// Conversations with the persons through a language model (server/talk, docs/TALK.md): the persona from the state,
// the bounds of a request, the limits per hour, the stream of OpenRouter and the messages to the browser.
import { describe, it, expect } from 'vitest';
import { newWorldState } from '../tools/sim/load';
import { personaFacts, personaPrompt, big5Band, iqBand } from '../server/talk/persona';
import { chatMessages, MAX_CHARS, MAX_LINES, Talk, TalkLimits, type TalkConfig } from '../server/talk';
import { parseEvents, streamChat } from '../server/talk/openrouter';
import { ALIVE } from '../src/sim/state';
import { CITIES, personsIn } from '../src/sim/systems/people';
import type { ServerMsg } from '../src/net/protocol';

// a world of 1291: it has the rulers of the chronicle (src/sim/systems/rulers.ts)
const { s, w } = newWorldState(1291, 1291);
const london = CITIES.find((c) => c.name === 'London')!.place;

describe('the persona of a person', () => {
  it('says the day, the age, the town, the faith and the traits of a person of London', () => {
    const uid = personsIn(s, london)[0],
      f = personaFacts(s, w, uid)!;
    expect(f[0]).toMatch(/^Heute ist \w+, der 1\. Januar 1291\.$/);
    expect(f.join(' ')).toContain('London');
    expect(f.join(' ')).toMatch(/dein Glaube Lateinische Kirche/);
    expect(f.join(' ')).toMatch(/Die Welt kennt deinen Namen nicht/);
    expect(f.at(-1)).toMatch(/^Deine Persönlichkeit \(Big Five\): Offenheit/);
  });
  it('names a ruler and the crown', () => {
    const n = s.named.find((x) => s.realm.cols.holder.includes(x.person))!;
    const f = personaFacts(s, w, s.person.cols.uid[n.person])!.join(' ');
    expect(f).toContain(`Du bist ${n.name}`);
    expect(f).toContain('Du trägst die Krone von');
  });
  it('is none for a dead person or one the world does not have', () => {
    const P = s.person.cols;
    let dead = 0;
    while (dead < s.person.size && P.died[dead] === ALIVE) dead++;
    if (dead < s.person.size) expect(personaFacts(s, w, P.uid[dead])).toBeNull();
    expect(personaFacts(s, w, -1)).toBeNull();
    expect(personaFacts(s, w, 1e9)).toBeNull();
  });
  it('puts the rules before the facts', () => {
    const p = personaPrompt(['Du bist ein Mann.']);
    expect(p.indexOf('Regeln:')).toBeLessThan(p.indexOf('Fakten:'));
    expect(p.endsWith('- Du bist ein Mann.')).toBe(true);
  });
  it('words T-scores and IQ in the bands of the NEO PI-R and the Wechsler scales', () => {
    expect([34, 35, 44, 45, 55, 56, 65, 66].map(big5Band)).toEqual([
      'sehr niedrig',
      'niedrig',
      'niedrig',
      'durchschnittlich',
      'durchschnittlich',
      'hoch',
      'hoch',
      'sehr hoch',
    ]);
    expect([69, 70, 89, 90, 109, 110, 130].map(iqBand)).toEqual([
      'sehr niedrig',
      'grenzwertig',
      'unterdurchschnittlich',
      'durchschnittlich',
      'durchschnittlich',
      'überdurchschnittlich',
      'sehr hoch',
    ]);
  });
});

describe('what a browser may send', () => {
  const ok = [{ who: 'player', text: 'Guten Tag' }];
  it('becomes the persona and the conversation, the player as user', () => {
    const m = chatMessages('P', [
      ...ok,
      { who: 'person', text: 'Gott zum Gruss' },
      { who: 'player', text: 'Wie gehts?' },
    ])!;
    expect(m.map((x) => x.role)).toEqual(['system', 'user', 'assistant', 'user']);
  });
  it('is refused when empty, too long, ending with the person or not lines at all', () => {
    expect(chatMessages('P', [])).toBeNull();
    expect(chatMessages('P', 'x')).toBeNull();
    expect(chatMessages('P', [{ who: 'person', text: 'x' }])).toBeNull();
    expect(chatMessages('P', [{ who: 'player', text: 'x'.repeat(MAX_CHARS + 1) }])).toBeNull();
    expect(chatMessages('P', [{ who: 'player', text: '  ' }])).toBeNull();
  });
  it('keeps only the last lines', () => {
    const many = Array.from({ length: 40 }, (_, k) => ({ who: k % 2 ? 'person' : 'player', text: String(k) }));
    many.push({ who: 'player', text: 'last' });
    expect(chatMessages('P', many)!.length).toBe(1 + MAX_LINES);
  });
});

describe('the limits per hour', () => {
  it('stop a player after their turns and free them an hour later', () => {
    const l = new TalkLimits({ perUserHour: 2, perAllHour: 10 });
    expect([l.take('a', 0), l.take('a', 1), l.take('a', 2), l.take('b', 3)]).toEqual([true, true, false, true]);
    expect(l.take('a', 3600_001)).toBe(true);
  });
  it('stop everybody when all players together reach theirs', () => {
    const l = new TalkLimits({ perUserHour: 5, perAllHour: 2 });
    expect([l.take('a', 0), l.take('b', 0), l.take('c', 0)]).toEqual([true, true, false]);
  });
});

describe('the stream of OpenRouter', () => {
  it('gives the pieces of text, skips comments and keeps an unfinished line', () => {
    const e = parseEvents(
      ': OPENROUTER PROCESSING\ndata: {"choices":[{"delta":{"content":"Gott "}}]}\ndata: {"choices":[{"delta":{"content":"zum"}}]}\ndata: {"cho',
    );
    expect(e).toEqual({ texts: ['Gott ', 'zum'], rest: 'data: {"cho', done: false });
    expect(parseEvents('data: [DONE]\n').done).toBe(true);
    expect(parseEvents('data: {"error":{"message":"no credits"}}\n').error).toBe('no credits');
  });
  it('sends the key, the model and no thinking, and reads the answer in chunks', async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const body = [
      'data: {"choices":[{"delta":{"content":"Gu"}}]}\n',
      'data: {"choices":[{"delta":{"content":"ten Tag"}}]}\ndata: [DONE]\n',
    ];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(
        new ReadableStream({
          start(c) {
            for (const b of body) c.enqueue(new TextEncoder().encode(b));
            c.close();
          },
        }),
      );
    }) as unknown as typeof fetch;
    const got: string[] = [];
    const all = await streamChat({
      key: 'k',
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
      maxTokens: 9,
      onText: (t) => got.push(t),
      fetchImpl,
    });
    expect(all).toBe('Guten Tag');
    expect(got).toEqual(['Gu', 'ten Tag']);
    const req = JSON.parse(String(sent!.init.body));
    expect(req).toMatchObject({ model: 'm', max_tokens: 9, stream: true, reasoning: { enabled: false } });
    expect((sent!.init.headers as Record<string, string>).authorization).toBe('Bearer k');
  });
});

describe('a conversation on the world server', () => {
  const cfg: TalkConfig = { key: 'k', model: 'm', perUserHour: 5, perAllHour: 50, maxTokens: 100 };
  const uid = personsIn(s, london)[0],
    lines = [{ who: 'player' as const, text: 'Guten Tag' }];
  const session = (observer = false) => {
    const out: ServerMsg[] = [];
    return {
      out,
      ss: { user: { uid: 'u', name: 'U', admin: false, observer }, closed: false, send: (m: ServerMsg) => out.push(m) },
    };
  };
  it('sends the answer in pieces with the id, then done, with the persona as the system message', async () => {
    let persona = '';
    const t = new Talk(
      cfg,
      () => ({ s, w }),
      async (r) => {
        persona = r.messages[0].content;
        r.onText('Gott ');
        r.onText('zum Gruss');
        return 'Gott zum Gruss';
      },
    );
    const { out, ss } = session();
    await t.handle(ss, { type: 'talk', id: 7, person: uid, lines });
    expect(out).toEqual([
      { type: 'talk', id: 7, text: 'Gott ' },
      { type: 'talk', id: 7, text: 'zum Gruss' },
      { type: 'talk', id: 7, done: true },
    ]);
    expect(persona).toContain('London');
  });
  it('refuses without a key, an observer, and a person who does not live', async () => {
    const never = async () => {
      throw new Error('not asked');
    };
    for (const [c, obs, person] of [
      [{ ...cfg, key: '' }, false, uid],
      [cfg, true, uid],
      [cfg, false, -5],
    ] as const) {
      const { out, ss } = session(obs);
      await new Talk(c, () => ({ s, w }), never).handle(ss, { type: 'talk', id: 1, person, lines });
      expect(out.length).toBe(1);
      expect(out[0]).toMatchObject({ type: 'talk', id: 1 });
      expect((out[0] as { err?: string }).err).toBeTruthy();
    }
  });
  it('says the service failed when the model does not answer', async () => {
    const t = new Talk(
      cfg,
      () => ({ s, w }),
      async () => {
        throw new Error('502');
      },
    );
    const { out, ss } = session();
    await t.handle(ss, { type: 'talk', id: 2, person: uid, lines });
    expect((out[0] as { err?: string }).err).toMatch(/schweigt/);
  });
});
