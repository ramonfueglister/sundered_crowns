// The world of 1291: its realms and borders (public/data/setup_1291.json), the people before the Black Death, the
// persons of its own 30 cities, and the economy of 1356 as a placeholder (src/sim/tables.ts); a world of 1291 founded
// with the people and persons of 1356 got those of 1291 by upgrades this build no longer has (state versions 8 and 11).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { newWorldState, loadSetup, dataPath } from '../tools/sim/load';
import { SCALE } from '../src/sim/scale';
import { citiesOf } from '../src/sim/content/cities';
import { ALL_CULTURES, FAITHS } from '../src/sim/content/peoples';
import { upgradeState } from '../src/sim/upgrade';
import { STATE_VERSION } from '../src/sim/state';
import { hashState } from '../src/sim/snapshot';

const { s, w } = newWorldState(1291, 1291);
const s1291 = loadSetup(1291), s1356 = loadSetup(1356);
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
    towns.people.forEach((n, k) => { if (n) inTowns.set(towns.place[k], (inTowns.get(towns.place[k]) ?? 0) + n); });
    expect(inTowns.size).toBeGreaterThan(400);
    for (const [p, n] of inTowns) expect(s.place.pop[p]).toBeGreaterThanOrEqual(n / SCALE - 0.01);
    expect(inTowns.get(w.names.indexOf('Paris'))).toBeGreaterThan(200_000); // Chandler 1291
  });
  it('counts heads at 1:100 and feeds a head as a person of the time', () => {
    expect(sum(s.place.pop)).toBeGreaterThan(sum(s1291.pop) / SCALE * 0.999);
    expect(sum(s.place.pop)).toBeLessThan(sum(s1291.pop) / SCALE * 1.01); // the 30 cities may lift a few places
    let kcal = 0, heads = 0;
    for (let i = 0; i < w.L; i++) if (s.place.harvest[i] > 0) { kcal += s.place.harvest[i]; heads += s.place.pop[i]; }
    expect(kcal / heads / 365).toBeGreaterThan(800); expect(kcal / heads / 365).toBeLessThan(3000);
  });
  it('has the persons of its own 30 cities of 1291, as many as the towns of the world graphic house', () => {
    const cities = citiesOf(1291);
    expect(cities.length).toBe(30);
    expect(cities[0].name).toBe('Cairo');
    for (const out of ['Texcoco', 'Tenayuca', 'Mali']) expect(cities.some((c) => c.name === out)).toBe(false); // outside the world
    expect(s.person.size).toBe(cities.reduce((t, c) => t + Math.round(c.people / SCALE), 0));
    const towns = JSON.parse(readFileSync(dataPath('towns_1291.json'), 'utf8')) as { people: (number | null)[]; place: number[] };
    for (const c of cities) {
      expect(towns.people[c.site]).toBe(c.people); // the town of the picture holds the city's people
      expect(towns.place[c.site]).toBe(c.place);
      expect(s.place.pop[c.place]).toBeGreaterThanOrEqual(c.people / SCALE - 0.01);
    }
  });
});

describe('the peoples of 1291', () => {
  const rules = JSON.parse(readFileSync('data/history/1291/peoples.json', 'utf8')).rules as { id: string; sources: string[]; note: string }[];
  const at = (name: string) => { const i = w.names.indexOf(name); expect(i, name).toBeGreaterThanOrEqual(0); return i; };
  const culture = (i: number) => ALL_CULTURES[s.place.culture[i]], faith = (i: number) => FAITHS[s.place.faith[i]].id;
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
  it('come into a world of 1291 that was founded with those of 1356 by the upgrade from 12', () => {
    const old = structuredClone(s);
    old.v = 12;
    const aragon = old.realmText.findIndex((r) => r.key === 'aragon');
    for (let i = 0; i < w.L; i++) {
      old.place.culture[i] = ALL_CULTURES.indexOf(s1356.culture[i] ?? 'unknown');
      old.place.faith[i] = FAITHS.findIndex((f) => f.id === s1356.faith[i]);
    }
    for (const n of ['Cieza', 'Mula', 'Villena', 'Almansa', 'Moya']) old.place.owner[at(n)] = aragon;
    expect(hashState(old)).not.toBe(hashState(s));
    const up = upgradeState(old, w, () => s1291);
    expect(up.v).toBe(STATE_VERSION);
    expect(hashState(up)).toBe(hashState(s));
  });
});

