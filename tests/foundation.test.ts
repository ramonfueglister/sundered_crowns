// The foundation without game systems: entity tables, the start setup, snapshots and the day tick.
import { describe, it, expect } from 'vitest';
import { createTable, spawn, despawn, isAlive, liveCount } from '../src/sim/ecs';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { tick, shardRange, SHARDS } from '../src/sim/schedule';
import { advanceDay } from '../src/sim/engine';
import { newWorldState } from '../tools/sim/load';
import { placeDetail, realmInfos } from '../src/net/views';

describe('entity tables', () => {
  it('spawns zeroed rows, grows its columns and reuses freed rows', () => {
    const t = createTable({ a: 'f32', b: 'i16' }, 2);
    const ids = [spawn(t), spawn(t), spawn(t)];
    expect(ids).toEqual([0, 1, 2]);
    expect(t.cols.a.length).toBeGreaterThanOrEqual(3);
    t.cols.a[1] = 5; t.cols.b[1] = -3;
    despawn(t, 1);
    expect(isAlive(t, 1)).toBe(false); expect(liveCount(t)).toBe(2);
    expect(spawn(t)).toBe(1);
    expect(t.cols.a[1]).toBe(0); expect(t.cols.b[1]).toBe(0);
    despawn(t, 7); // unknown ids are ignored
    expect(liveCount(t)).toBe(3);
  });
});

describe('the start of a world', () => {
  const { s, w } = newWorldState();
  it('has the realms of 1356 with their land and capitals', () => {
    expect(s.realm.size).toBeGreaterThan(300);
    const fr = s.realmText.findIndex((r) => r.key === 'france');
    expect(fr).toBeGreaterThanOrEqual(0);
    const cap = s.realm.cols.capital[fr];
    expect(cap).toBeGreaterThanOrEqual(0);
    expect(s.place.owner[cap]).toBe(fr);
    expect(w.names[cap]).toBe('Paris');
    for (let r = 0; r < s.realm.size; r++) { const c = s.realm.cols.capital[r]; if (c >= 0) expect(s.place.owner[c]).toBe(r); }
    let people = 0; for (let i = 0; i < w.L; i++) people += s.place.pop[i];
    expect(people).toBeGreaterThan(5e7);
    expect(s.ruler.every((x) => x === '')).toBe(true);
  });
  it('describes realms and places for the clients', () => {
    const rs = realmInfos(s, () => null);
    expect(rs.length).toBe(s.realm.size);
    const fr = rs.find((r) => r.key === 'france')!;
    expect(fr.places).toBeGreaterThan(50); expect(fr.ruler).toBeNull();
    const d = placeDetail(s, w, fr.capital)!;
    expect(d.owner).toBe(fr.id); expect(d.name).toBe('Paris'); expect(d.pop).toBeGreaterThan(0);
    expect(placeDetail(s, w, -1)).toBeNull(); expect(placeDetail(s, w, w.L)).toBeNull();
  });
});

describe('snapshots', () => {
  it('encode and decode a state to the same bytes and hash', () => {
    const { s } = newWorldState();
    const a = encodeState(s), s2 = decodeState(a), b = encodeState(s2);
    expect(b).toEqual(a);
    expect(hashState(s2)).toBe(hashState(s));
    s2.place.pop[0] += 1;
    expect(hashState(s2)).not.toBe(hashState(s));
    expect(() => decodeState(new Uint8Array(16))).toThrow();
  });
});

describe('the day tick', () => {
  it('advances the date, flags new months and years, and runs the systems in order', () => {
    const { s, w } = newWorldState();
    const order: string[] = [];
    const sys = [{ id: 'a', run: () => { order.push('a'); } }, { id: 'b', run: () => { order.push('b'); } }];
    const t1 = tick(s, w, sys);
    expect(s.day).toBe(1); expect(t1.date).toEqual({ y: 1356, m: 0, d: 2 }); expect(order).toEqual(['a', 'b']);
    for (let i = 0; i < 30; i++) advanceDay(s, w);
    const t = tick(s, w, []);
    expect(t.date).toEqual({ y: 1356, m: 1, d: 2 });
    s.day = 365 - 1; // 31 Dec 1356 (a leap year: 366 days) → 1 Jan needs one more day
    expect(tick(s, w, []).newYear).toBe(false);
    expect(tick(s, w, []).newYear).toBe(true);
  });
  it('covers every place exactly once over a cycle of shards', () => {
    const n = 15220, seen = new Uint8Array(n);
    for (let k = 0; k < SHARDS; k++) { const [a, b] = shardRange(n, k); for (let i = a; i < b; i++) seen[i]++; }
    expect(seen.every((v) => v === 1)).toBe(true);
  });
});
