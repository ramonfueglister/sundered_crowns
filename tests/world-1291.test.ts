// The world of 1291: its realms and borders (public/data/setup_1291.json), the people before the Black Death, the
// persons of every town of the world graphic inside the world frame, and the economy of 1356 as a placeholder (src/sim/tables.ts); a world of 1291 founded
// with the people and persons of 1356 got those of 1291 by upgrades this build no longer has (state versions 8 and 11).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { newWorldState, loadSetup, dataPath } from '../tools/sim/load';
import { SCALE } from '../src/sim/scale';
import { type City, citiesOf } from '../src/sim/content/cities';
import { ALL_CULTURES, FAITHS } from '../src/sim/content/peoples';
import { upgradeState } from '../src/sim/upgrade';
import { STATE_VERSION } from '../src/sim/state';
import { hashState, encodeState, decodeState } from '../src/sim/snapshot';
import { createWorldState } from '../src/sim/setup';

const { s, w } = newWorldState(1291, 1291);
const s1291 = loadSetup(1291), s1356 = loadSetup(1356);
/** A world as it was before state 19: the persons had no culture or faith, the places had those of the setup. */
function asBeforeCultures(old: ReturnType<typeof createWorldState>): void {
  const P = old.person.cols as unknown as Record<string, unknown>;
  delete P.culture; delete P.faith;
  Object.assign(old.place, {
    culture: Uint16Array.from(s1291.culture.slice(0, w.L), (c) => Math.max(0, ALL_CULTURES.indexOf(c ?? 'unknown'))),
    faith: Uint8Array.from(s1291.faith.slice(0, w.L), (f) => Math.max(0, FAITHS.findIndex((x) => x.id === (f ?? 'latin'))))
  });
}
const sum = (a: ArrayLike<number | null>) => { let t = 0; for (let i = 0; i < a.length; i++) t += a[i] ?? 0; return t; };

describe('a world of 1291', () => {
  it('starts in 1291 with the realms of 1291', () => {
    expect(s.startYear).toBe(1291);
    expect(s.realmText.some((t) => t.key === 'greater_poland')).toBe(true);
    expect(s.realmText.some((t) => t.key === 'jerusalem')).toBe(true);
  });
  it('has more people than 1356 (before the plague) and keeps the placeholder tables', () => {
    expect(sum(s1291.pop)).toBeGreaterThan(sum(s1356.pop) * 1.05);
    expect(s.person.size).toBeGreaterThan(0);
    expect(s.economy.cities?.day).toBe(0); // the economies of the cities of 1356, founded on the first day
    expect(s.economy.cities!.halted).toBe('');
  });
  it('holds in every place at least the people of the towns the world graphic builds there', () => {
    const towns = JSON.parse(readFileSync(dataPath('towns_1291.json'), 'utf8')) as { people: (number | null)[]; place: number[] };
    const inTowns = new Map<number, number>();
    const inFrame = new Set(citiesOf(1291).map((c) => c.site)), persons = new Map<number, number>();
    towns.people.forEach((n, k) => {
      if (!n) return;
      inTowns.set(towns.place[k], (inTowns.get(towns.place[k]) ?? 0) + n);
      if (inFrame.has(k)) persons.set(towns.place[k], (persons.get(towns.place[k]) ?? 0) + Math.round(n / SCALE));
    });
    expect(inTowns.size).toBeGreaterThan(400);
    for (const [p, n] of persons) expect(s.place.pop[p]).toBeGreaterThanOrEqual(n); // its persons (and rulers)
    expect(inTowns.get(w.names.indexOf('Paris'))).toBeGreaterThan(200_000); // Chandler 1291
  });
  it('has only its persons as people and feeds a head as a person of the time', () => {
    expect(sum(s.place.pop)).toBe(s.person.size); // all alive on the first day; the land without towns is empty
    let kcal = 0, heads = 0;
    for (let i = 0; i < w.L; i++) if (s.place.harvest[i] > 0) { kcal += s.place.harvest[i]; heads += s.place.pop[i]; }
    expect(kcal / heads / 365).toBeGreaterThan(800); expect(kcal / heads / 365).toBeLessThan(3000);
  });
  it('has persons in every town of the world graphic with people inside the world frame, as many as the towns house', () => {
    const cities = citiesOf(1291);
    const ext = JSON.parse(readFileSync('data/content/world_extent.json', 'utf8')) as { west: number; east: number; north: number; south: number };
    const gaz = JSON.parse(readFileSync('data/content/gazetteer.json', 'utf8')).places as { lon: number; lat: number }[];
    const towns = JSON.parse(readFileSync(dataPath('towns_1291.json'), 'utf8')) as { people: (number | null)[]; place: number[] };
    const inFrame = (k: number) => gaz[k].lon >= ext.west && gaz[k].lon <= ext.east && gaz[k].lat >= ext.south && gaz[k].lat <= ext.north;
    const expected = towns.people.flatMap((n, k) => (n && inFrame(k) ? [k] : []));
    expect(cities.length).toBe(558);
    expect(cities.map((c) => c.site).sort((a, b) => a - b)).toEqual(expected);
    expect(cities[0].name).toBe('Cairo');
    for (const out of ['Texcoco', 'Tenayuca', 'Mali']) expect(cities.some((c) => c.name === out)).toBe(false); // outside the world
    expect(s.person.size - s.named.length).toBe(cities.reduce((t, c) => t + Math.round(c.people / SCALE), 0)); // the rest are rulers
    expect(s.person.size).toBeGreaterThan(100_000);
    for (const c of cities) {
      expect(towns.people[c.site]).toBe(c.people); // the town of the picture holds the city's people
      expect(towns.place[c.site]).toBe(c.place);
      expect(s.place.pop[c.place]).toBeGreaterThanOrEqual(Math.round(c.people / SCALE));
    }
    // Chandler's towns first, each group largest first: the 30 largest of Chandler are the first 30
    const ch = cities.filter((c) => c.source === 'chandler');
    expect(ch.length).toBe(65); expect(cities.slice(0, 65)).toEqual(ch);
    for (let k = 1; k < cities.length; k++) if (cities[k].source === cities[k - 1].source) expect(cities[k].people).toBeLessThanOrEqual(cities[k - 1].people);
  });
  it('gets them by the upgrade from 14, and the persons of the 30 cities stay who they were, with their numbers', () => {
    // a world of 1291 as version 14 founded it: persons only in the 30 largest towns of Chandler
    const list = citiesOf(1291) as City[], all = list.slice();
    list.splice(30);
    let old: ReturnType<typeof createWorldState>;
    try { old = createWorldState(w, s1291, 1291); } finally { list.splice(0, list.length, ...all); }
    old.v = 14; asBeforeCultures(old);
    expect(old.person.size - old.named.length).toBe(24_828); // and the rulers after them expect(old.economy.cities!.places.length).toBe(30);
    const before = decodeState(encodeState(old));
    const up = upgradeState(old, w, () => s1291);
    expect(up.v).toBe(STATE_VERSION);
    expect(hashState(up)).toBe(hashState(s)); // as a new world
    const P = up.person.cols, B = before.person.cols;
    let differ = 0; // counted, not one expect per person: 24,828 persons
    for (let id = 0; id < 24_828; id++) {
      if (P.born[id] !== B.born[id] || P.sex[id] !== B.sex[id] || P.family[id] !== B.family[id] || P.mother[id] !== B.mother[id] || P.iq[id] !== B.iq[id]) differ++;
    }
    for (let k = 0; k < 24_828 * 100; k++) if (P.genes[k] !== B.genes[k]) differ++; // 100 gene bytes a person
    expect(differ).toBe(0);
    expect(up.economy.cities!.places.length).toBe(550);
  }, 120_000);
});

describe('the peoples of 1291', () => {
  const rules = JSON.parse(readFileSync('data/history/1291/peoples.json', 'utf8')).rules as { id: string; sources: string[]; note: string }[];
  const at = (name: string) => { const i = w.names.indexOf(name); expect(i, name).toBeGreaterThanOrEqual(0); return i; };
  // the setup of 1291 (its rules): the persons of a town are founded with these (src/sim/systems/cultures.ts)
  const culture = (i: number) => s1291.culture[i] ?? 'unknown', faith = (i: number) => s1291.faith[i] ?? 'latin';
  const owner = (i: number) => s.realmText[s.place.owner[i]]?.key;
  it('differ from those of 1356 only by rules that name their sources', () => {
    expect(rules.length).toBeGreaterThanOrEqual(10);
    for (const r of rules) { expect(r.sources.length, r.id).toBeGreaterThan(0); expect(r.note.length, r.id).toBeGreaterThan(20); }
    let differ = 0;
    for (let i = 0; i < w.L; i++) if (s1291.culture[i] !== s1356.culture[i] || s1291.faith[i] !== s1356.faith[i]) differ++;
    expect(differ).toBeGreaterThan(600); expect(differ).toBeLessThan(1000);
  });
  it('are Greek and Orthodox where Byzantium held Asia Minor', () => {
    for (const n of ['Bursa', 'Nicaea', 'Smyrna']) { expect(owner(at(n))).toBe('byzantium'); expect([culture(at(n)), faith(at(n))]).toEqual(['greek', 'orthodox']); }
  });
  it('keep the steppe religion among the nomads of the Golden Horde, Islam in its towns and in Volga Bulgaria', () => {
    expect(faith(at('Sarai'))).toBe('sunni'); expect(faith(at('Bolghar'))).toBe('sunni');
    let nomads = 0, muslims = 0;
    for (let i = 0; i < w.L; i++) if (owner(i) === 'golden_horde' && culture(i) === 'kipchak_nomad') faith(i) === 'tengri' ? nomads++ : muslims++;
    expect(nomads).toBeGreaterThan(10 * muslims);
    for (let i = 0; i < w.L; i++) expect(culture(i)).not.toBe('crimean'); // the Kipchaks of the Crimea
  });
  it('are Frankish in Acre, Armenian in Cilicia, Muslim in Lucera and in the land of Valencia, Old Prussian east of the Passarge', () => {
    expect([culture(at('Acre')), faith(at('Acre'))]).toEqual(['french', 'latin']);
    expect([culture(at('Adana')), faith(at('Adana'))]).toEqual(['armenian', 'armenian_apostolic']);
    expect([culture(at('Lucera')), faith(at('Lucera'))]).toEqual(['maghrebi', 'sunni']);
    expect([culture(at('Xàtiva')), faith(at('Xàtiva'))]).toEqual(['andalusi', 'sunni']);
    expect(culture(at('Valencia'))).toBe('catalan');
    expect(culture(at('Rastenburg'))).toBe('old_prussian'); expect(culture(at('Königsberg'))).toBe('prussian_german');
  });
  it('have the Jews of France in its towns until 1306', () => {
    const m = (s1291 as unknown as { minority: ([string, string, number] | null)[] }).minority;
    expect(m[at('Troyes')]?.slice(0, 2)).toEqual(['ashkenazi', 'jewish']);
    expect(m[at('Toulouse')]?.slice(0, 2)).toEqual(['sephardi', 'jewish']);
  });
  it('give the kingdom of Murcia and Villena to Castile', () => {
    for (const n of ['Cieza', 'Mula', 'Villena', 'Almansa', 'Moya']) expect(owner(at(n)), n).toBe('castile');
  });
  it('come into a world of 1291 by the upgrade from 12 only as borders: Murcia goes to Castile', () => {
    const old = structuredClone(s);
    old.v = 12; asBeforeCultures(old);
    const aragon = old.realmText.findIndex((r) => r.key === 'aragon');
    for (const n of ['Cieza', 'Mula', 'Villena', 'Almansa', 'Moya']) old.place.owner[at(n)] = aragon;
    expect(hashState(old)).not.toBe(hashState(s));
    const up = upgradeState(old, w, () => s1291);
    expect(up.v).toBe(STATE_VERSION);
    expect(hashState(up)).toBe(hashState(s));
  }, 20_000); // copies and hashes the whole world of 558 towns several times
  it('are the persons\' own: the persons of Bursa and Smyrna are Greek and Orthodox, those of Acre Frankish and Latin', () => {
    const P = s.person.cols, F = s.family.cols;
    for (const [n, c, f] of [['Bursa', 'greek', 'orthodox'], ['Smyrna', 'greek', 'orthodox'], ['Acre', 'french', 'latin']] as const) {
      const i = citiesOf(1291).find((c) => c.name === n)!.place;
      let persons = 0;
      for (let id = 0; id < s.person.size; id++) {
        if (F.place[P.family[id]] !== i || s.named.some((x) => x.person === id)) continue;
        persons++;
        expect([ALL_CULTURES[P.culture[id]], FAITHS[P.faith[id]].id], n).toEqual([c, f]);
      }
      expect(persons, n).toBeGreaterThan(0);
    }
  });
});

