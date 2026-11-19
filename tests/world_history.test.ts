// The history of the borders (server/history.ts) and the world's clock (server/world.ts): the replay plays what the
// world really did, and the time control pauses the world and changes its speed only for whom it is allowed.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { BorderHistory } from '../server/history';
import { configFromEnv } from '../server/config';
import type { Conn } from '../server/session';
import { WorldCore } from '../server/world';
import type { History, ServerMsg } from '../src/net/protocol';
import type { WorldState } from '../src/sim/state';
import type { World } from '../src/sim/world';

/** A world of a few places and realms, as much of the state as the history reads. */
function tiny(owner: number[], realms: string[], day = 0): WorldState {
  return {
    day,
    startYear: 1291,
    place: { owner: Int16Array.from(owner) },
    realm: {
      size: realms.length,
      alive: realms.map(() => 1),
      cols: { color: realms.map((_, k) => 0x101010 * (k + 1)) },
    },
    realmText: realms.map((key) => ({
      key,
      name: { en: key, de: key },
      short: { en: key, de: key },
      adjective: { en: key, de: key },
    })),
  } as unknown as WorldState;
}
/** The owners and realms after every line of a history, by day. */
function play(h: History) {
  const owner = [...h.lines[0].owner!],
    names: string[] = [];
  for (const r of h.lines[0].r ?? []) names[r.id] = r.short.en;
  const days: Record<number, number[]> = { [h.lines[0].d]: [...owner] };
  for (const l of h.lines.slice(1)) {
    for (const [p, o] of l.c ?? []) owner[p] = o;
    for (const r of l.r ?? []) names[r.id] = r.short.en;
    days[l.d] = [...owner];
  }
  return { owner, names, days };
}
const history = (b: BorderHistory) => JSON.parse(b.payload(1291).json.toString()) as History;

describe('history of the borders', () => {
  it('records what moved day by day, realms that come in or are renamed, and reads itself back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sch-')),
      file = join(dir, 'borders.ndjson');
    const s = tiny([0, 0, 1, -1], ['a', 'b']),
      w = {} as World;
    const b = new BorderHistory(file, s, w, () => null);
    s.day = 1;
    b.record(s); // nothing moved: no line
    expect(b.length).toBe(1);
    s.day = 2;
    s.place.owner[1] = 1;
    b.record(s);
    // a realm comes in with a place, another is renamed
    s.day = 5;
    (s.realm as any).size = 3;
    (s.realm.alive as any).push(1);
    (s.realm.cols.color as any).push(0xabcdef);
    s.realmText.push({
      key: 'c',
      name: { en: 'C', de: 'C' },
      short: { en: 'C', de: 'C' },
      adjective: { en: 'C', de: 'C' },
    });
    s.realmText[0] = { ...s.realmText[0], short: { en: 'A2', de: 'A2' } };
    s.place.owner[3] = 2;
    b.record(s);
    const h = history(b),
      p = play(h);
    expect(h.lines.map((l) => l.d)).toEqual([0, 2, 5]);
    expect(p.days[2]).toEqual([0, 1, 1, -1]);
    expect(p.owner).toEqual([0, 1, 1, 2]);
    expect(p.names).toEqual(['A2', 'b', 'C']);
    b.close();
    // read back, with a torn last line from a crash: nothing is lost but the torn line, and what moved since comes as one line
    writeFileSync(file, readFileSync(file, 'utf8') + '{"d":6,"c":[[0');
    s.day = 7;
    s.place.owner[0] = 2;
    const again = new BorderHistory(file, s, w, () => null),
      h2 = history(again);
    expect(h2.lines.map((l) => l.d)).toEqual([0, 2, 5, 7]);
    expect(play(h2).owner).toEqual([2, 1, 1, 2]);
    expect(gunzipSync(again.payload(1291).gz).toString()).toBe(again.payload(1291).json.toString());
    again.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('begins the history of an older world from its genesis and the chronicle of borders', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sch-'));
    const genesis = tiny([0, 0, 1, 1], ['a', 'b']);
    // the world now: realm c came in on day 10 with place 3, place 1 went to b on day 20; a change on day 40 lies beyond the world's day
    const s = tiny([0, 1, 1, 2], ['a', 'b', 'c'], 30);
    s.realmText[2] = {
      key: 'c',
      name: { en: 'Realm C', de: 'Realm C' },
      short: { en: 'C', de: 'C' },
      adjective: { en: 'C', de: 'C' },
    }; // as the borders name it when it comes in
    const ev = (day: number, to: string, places: number[]) => ({ day, to, places: Int32Array.from(places) });
    const w = {
      borders: {
        year: 1291,
        realms: new Map([['c', { name: 'Realm C', short: 'C', wikidata: '' }]]),
        events: [ev(10, 'c', [3]), ev(20, 'b', [1]), ev(40, 'a', [2])],
      },
    } as unknown as World;
    const b = new BorderHistory(join(dir, 'borders.ndjson'), s, w, () => genesis),
      h = history(b),
      p = play(h);
    expect(h.lines.map((l) => l.d)).toEqual([0, 10, 20]);
    expect(p.days[10]).toEqual([0, 0, 1, 2]);
    expect(p.owner).toEqual([0, 1, 1, 2]);
    expect(p.names[2]).toBe('C');
    b.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("the world's clock", () => {
  const conn = () => {
    const msgs: ServerMsg[] = [];
    const c: Conn = { send: (m) => msgs.push(m), sendBin: () => {}, close: () => {} };
    return { c, msgs };
  };

  it('pauses and changes speed for whom it is allowed, and keeps the history of the borders', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scw-'));
    // a world with accounts: observers may not touch the time, admins may
    const core = new WorldCore({
      ...configFromEnv({}),
      dataDir: dir,
      id: 'clock',
      devAuth: false,
      log: () => {},
    }).init();
    const o = conn(),
      so = core.attach(o.c, { uid: 'watch-1', name: 'Observer', admin: false, observer: true });
    expect(
      (o.msgs.find((m) => m.type === 'welcome') as Extract<ServerMsg, { type: 'welcome' }>).me.time,
    ).toBeUndefined();
    so.handle({ type: 'time', speed: 5 });
    expect(core.speed).toBe(1);
    expect(o.msgs.some((m) => m.type === 'error' && m.code === 'time')).toBe(true);
    const a = conn(),
      sa = core.attach(a.c, { uid: 'admin-1', name: 'Admin', admin: true });
    expect((a.msgs.find((m) => m.type === 'welcome') as Extract<ServerMsg, { type: 'welcome' }>).me.time).toBe(true);
    sa.handle({ type: 'time', speed: 4 });
    expect(core.speed).toBe(4);
    expect(core.msPerDay()).toBe(250);
    expect(o.msgs.filter((m) => m.type === 'world').pop()).toMatchObject({ world: { speed: 4, paused: false } });
    sa.handle({ type: 'time', paused: true });
    expect(o.msgs.filter((m) => m.type === 'world').pop()).toMatchObject({ world: { speed: 4, paused: true } });
    sa.handle({ type: 'time', speed: 99 });
    expect(core.speed).toBe(4);
    sa.handle({ type: 'time', speed: 1, paused: false });
    expect(core.msPerDay()).toBe(core.cfg.secondsPerDay * 1000);
    // a place that changes hands is in the history from that day on
    const p = core.s.place.owner.findIndex((x) => x >= 0),
      to = core.s.place.owner.find((x) => x >= 0 && x !== core.s.place.owner[p])!;
    core.s.place.owner[p] = to;
    core.step();
    const h = JSON.parse(core.history.payload(core.s.startYear).json.toString()) as History;
    expect(h.lines[0].d).toBe(0);
    expect(h.lines.at(-1)).toMatchObject({ d: 1, c: [[p, to]] });
    core.shutdown();
    rmSync(dir, { recursive: true, force: true });
  }, 60_000);
});
