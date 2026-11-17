// The borders (src/sim/systems/borders.ts): the chronicle of borders of 1291 (public/data/borders_1291.json, built by
// tools/history/borders/build.py) played on a world of 1291. The checks are dates of history the map must show.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadWorldFor, loadSetup, dataPath } from '../tools/sim/load';
import { createWorldState } from '../src/sim/setup';
import { dayOf } from '../src/sim/content/chronicle';
import { type BordersJson } from '../src/sim/content/borders';
import { playBorders, rankOfName } from '../src/sim/systems/borders';
import { STATE_VERSION, RANKS, type WorldState } from '../src/sim/state';
import { upgradeState } from '../src/sim/upgrade';
import { hashState, encodeState, decodeState } from '../src/sim/snapshot';

const w = loadWorldFor(1291);
const json: BordersJson = JSON.parse(readFileSync(dataPath('borders_1291.json'), 'utf8'));
const fresh = () => createWorldState(w, loadSetup(1291), 1291);
/** The place of the map nearest to a point. */
const at = (lon: number, lat: number) => {
  let best = 0, d = Infinity;
  for (let i = 0; i < w.L; i++) { const e = (w.lon[i] - lon) ** 2 + (w.lat[i] - lat) ** 2; if (e < d) { d = e; best = i; } }
  return best;
};
const ownerKey = (s: WorldState, p: number) => (s.place.owner[p] < 0 ? null : s.realmText[s.place.owner[p]].key);
/** Plays the borders up to a date, as the daily system would. */
const until = (s: WorldState, date: string) => { const d = dayOf(date, 1291)!; playBorders(s, w, s.day + 1, d); s.day = d; };

describe('the chronicle of borders of 1291', () => {
  it('names only realms of the setup or realms it brings in, and is in the order of its dates', () => {
    const keys = new Set([...loadSetup(1291).states.map((st) => st.id), ...json.realms.map((r) => r.id)]);
    for (const e of json.events) {
      if (e.kind === 'name') { expect(keys.has(e.realm)).toBe(true); continue; }
      expect(keys.has(e.to)).toBe(true); if (e.from) expect(keys.has(e.from)).toBe(true);
    }
    const days = w.borders!.events.map((e) => e.day);
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThanOrEqual(days[i - 1]);
    expect(w.borders!.events.length).toBe(json.events.length);
  });
  it('gives every change its source, and a window to every change no source dates', () => {
    for (const e of json.events) {
      expect(e.source).toBeTruthy();
      if (e.kind !== 'name' && e.precision === 'window') expect(Number(e.window![0])).toBeLessThanOrEqual(Number(e.window![1]));
    }
  });
});

describe('the borders of a world of 1291 played to 1848', () => {
  const s = fresh();
  const constantinople = at(28.98, 41.01), granada = at(-3.6, 37.18), buda = at(19.04, 47.5), berlin = at(13.4, 52.5);
  const prague = at(14.42, 50.08), milan = at(9.19, 45.46), kazan = at(49.1, 55.8);
  it('starts with the borders of the setup', () => {
    expect(ownerKey(s, constantinople)).toBe('byzantium');
    expect(ownerKey(s, granada)).toBe('granada');
  }, 60_000);
  it('moves the places on their days', () => {
    until(s, '1452-12-31'); expect(ownerKey(s, constantinople)).toBe('byzantium');
    until(s, '1500-01-01'); expect(ownerKey(s, constantinople)).toBe('ottoman'); expect(ownerKey(s, granada)).toBe('castile');
    until(s, '1600-01-01'); expect(ownerKey(s, buda)).toBe('ottoman'); expect(ownerKey(s, kazan)).toBe('moscow');
    until(s, '1700-01-01'); expect(ownerKey(s, buda)).toBe('hungary');
    until(s, '1848-12-31');
    expect(ownerKey(s, berlin)).toBe('brandenburg'); expect(ownerKey(s, prague)).toBe('bohemia');
    expect(['austria', 'savoy']).toContain(ownerKey(s, milan)); // Sardinia held Milan in the summer of 1848
  });
  it('brings in the realms that were not there in 1291, with a capital they hold', () => {
    const swiss = s.realmText.findIndex((t) => t.key === 'c_swiss_confederation');
    expect(swiss).toBeGreaterThan(0);
    expect(s.realmText[swiss].name.en).toBe('Swiss Confederation');
    expect(s.place.owner[s.realm.cols.capital[swiss]]).toBe(swiss);
    for (let r = 0; r < s.realm.size; r++) { const c = s.realm.cols.capital[r]; if (c >= 0) expect(s.place.owner[c]).toBe(r); }
  });
  it('gives the realms the names of the polities they have become', () => {
    const name = (key: string) => s.realmText[s.realmText.findIndex((t) => t.key === key)];
    expect(name('moscow').name.en).toBe('Russian Empire');
    expect(name('england').short.en).toBe('Great Britain');
    expect(name('france').name.en).toBe('French Second Republic'); // from 24 February 1848
  });
  it('ranks a realm by the title word of its name', () => {
    expect(RANKS[rankOfName('Kingdom of Bavaria')]).toBe('kingdom');
    expect(RANKS[rankOfName('Grand Duchy of Baden')]).toBe('grand_duchy');
    expect(RANKS[rankOfName('Morocco')]).toBe('duchy');
  });
});

describe('a world of 1291 saved before the borders', () => {
  it('gets the borders of the day it has reached, as a world that had them from the first day', () => {
    const s = fresh();
    until(s, '1400-01-01');
    const old = decodeState(encodeState(fresh()));
    old.day = s.day; old.v = 17;
    const up = upgradeState(old, w, () => loadSetup(1291));
    expect(up.v).toBe(STATE_VERSION);
    expect(Array.from(up.place.owner)).toEqual(Array.from(s.place.owner));
    expect(up.realmText.map((t) => t.key)).toEqual(s.realmText.map((t) => t.key));
    expect(hashState(up)).toBe(hashState(s));
  }, 120_000);
});
