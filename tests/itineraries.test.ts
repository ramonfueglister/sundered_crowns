// The journeys of the rulers (src/sim/content/itineraries.ts): where a ruler is staying on a day, by the itinerary of
// the sources, and where the map and the figures then find them (src/net/people.ts).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadWorld, loadSetup, loadItineraries } from '../tools/sim/load';
import { createWorldState } from '../src/sim/setup';
import { compileChronicle, dayOf, type ChronicleJson } from '../src/sim/content/chronicle';
import { compileItineraries, stayOn, staysOf, tracksOf, type ItineraryFile } from '../src/sim/content/itineraries';
import { Travels } from '../src/sim/content/travel';
import { placePeople, rulersOnMap } from '../src/net/people';
import { rowOf } from '../src/sim/people/archive';

const w = loadWorld();
const at = (name: string) => w.names.indexOf(name);
const PARIS = at('Paris'),
  BRUGES = at('Bruges');

/** An itinerary of Edward I (key Q1 of the chronicle below): at Bruges on the first days of 1291, a day at an unknown
 *  place far out at sea, then Paris; the reign the source covers ends in 1292. */
const file: ItineraryFile = {
  places: [
    ['Brugge', w.lat[BRUGES], w.lon[BRUGES]],
    ['nowhere', 40, -40],
    ['Parisius', w.lat[PARIS] + 0.05, w.lon[PARIS]],
  ],
  kings: [
    {
      key: 'Q1',
      name: 'Edward I',
      from: '1291-01-01',
      to: '1292-12-31',
      stops: [
        ['1291-01-03', 0],
        ['1291-02-01', 1],
        ['1291-03-10', 2],
      ],
    },
  ],
};
const day = (d: string) => dayOf(d, 1291) as number;

describe('the itinerary of a ruler', () => {
  const it1 = compileItineraries(file, w.lat, w.lon, 1291),
    j = it1.get('Q1')!;
  it('puts each place of issue on the nearest place of the map, and leaves out one that is not on it', () => {
    expect(Array.from(j.place)).toEqual([BRUGES, PARIS]);
    expect(Array.from(j.day)).toEqual([day('1291-01-03'), day('1291-03-10')]);
  });
  it('stays at the place of the last stop on a day no source tells, and tells nothing outside the itinerary', () => {
    expect(stayOn(j, day('1291-01-02'))).toBe(-1);
    expect(stayOn(j, day('1291-01-03'))).toBe(BRUGES);
    expect(stayOn(j, day('1291-02-20'))).toBe(BRUGES);
    expect(stayOn(j, day('1291-03-10'))).toBe(PARIS);
    expect(stayOn(j, day('1292-12-31'))).toBe(PARIS);
    expect(stayOn(j, day('1293-01-01'))).toBe(-1);
  });
});

const fixture: ChronicleJson = {
  year: 1291,
  until: '1848-12-31',
  persons: [
    { key: 'Q1', name: 'Edward I', house: 'Plantagenet', qid: 'Q1', sex: 1, born: '1239-06-17', died: '1307-07-07' },
  ],
  reigns: [{ realm: 'england', person: 0, start: '1272-11-20', end: '1307-07-07', source: 'fixture' }],
};

describe('a ruler on a journey', () => {
  it('is on the map, and among the persons, at the place of the stay and not at home', () => {
    w.chronicle = compileChronicle(fixture);
    const s = createWorldState(w, loadSetup(1291), 1291);
    s.day = day('1291-03-20');
    const stays = staysOf(s, compileItineraries(file, w.lat, w.lon, 1291)),
      [edward] = rulersOnMap(s, stays),
      row = rowOf(s, edward.uid),
      home = s.family.cols.place[s.person.cols.family[row]];
    expect(home).not.toBe(PARIS);
    expect(stays.get(row)).toBe(PARIS);
    expect(edward.place).toBe(PARIS);
    const paris = placePeople(s, PARIS, stays);
    expect(paris.id).toContain(edward.uid);
    expect(paris.rulers).toContainEqual({ uid: edward.uid, color: edward.crowns[0].color });
    expect(placePeople(s, home, stays).id).not.toContain(edward.uid);
    // without the itinerary the ruler is at home, as before
    expect(rulersOnMap(s)[0].place).toBe(home);
    // with the ways the map is told the way ahead: from Paris, the last place named, where he stays
    const it1 = compileItineraries(file, w.lat, w.lon, 1291),
      tr = new Travels(w),
      [going] = rulersOnMap(s, staysOf(s, it1, tr), tracksOf(s, it1, tr, 120));
    expect(going.place).toBe(PARIS);
    expect(going.track).toEqual({ day: [day('1291-03-10'), s.day + 120], place: [PARIS, PARIS] });
  }, 150_000); // a fresh world of 1291 founds its economies
});

describe('the journeys of the Roman-German kings (Regesta Imperii)', () => {
  const kings = loadItineraries(1291, w)!,
    chronicle = JSON.parse(readFileSync('public/data/rulers_1291.json', 'utf8')) as ChronicleJson,
    keys = new Set(chronicle.persons.map((p) => p.key));
  it('are those of persons of the chronicle of rulers', () => {
    expect(kings.size).toBeGreaterThanOrEqual(4);
    for (const key of kings.keys()) expect(keys.has(key)).toBe(true);
  });
  it('put Ludwig the Bavarian (Q57161) in the Empire on every day of his reign the Regesta tell', () => {
    const j = kings.get('Q57161')!;
    expect(j.day.length).toBeGreaterThan(1000);
    for (const p of j.place) {
      expect(w.lat[p]).toBeGreaterThan(41);
      expect(w.lat[p]).toBeLessThan(56);
      expect(w.lon[p]).toBeGreaterThan(3);
      expect(w.lon[p]).toBeLessThan(19);
    }
    // from his first stop to his death the itinerary always names a place
    expect(stayOn(j, day('1347-06-01'))).toBeGreaterThanOrEqual(0);
  });
  it('put places of issue the Regesta place at a namesake where the regest and the days around show them', () => {
    const karl = kings.get('Q155669')!;
    // 'in Arluno' (1346-10-04) is Arlon by Luxembourg, not Arluno by Milan
    const arlon = stayOn(karl, day('1346-10-04'));
    expect(w.lat[arlon]).toBeGreaterThan(49);
    expect(w.lon[arlon]).toBeLessThan(7);
    // Karl IV.'s Sulzbach (1366-12-16) is in the Upper Palatinate, not in the Hunsrück
    expect(w.lon[stayOn(karl, day('1366-12-16'))]).toBeGreaterThan(11);
    // 'Frankenvorde' (1375-11-25), between Berlin and Fürstenberg, is Frankfurt an der Oder
    expect(w.lon[stayOn(karl, day('1375-11-25'))]).toBeGreaterThan(13.5);
  });
  it("leave out what Heinrich VII.'s envoys, the pope and the communes did in his name", () => {
    const heinrich = kings.get('Q152717')!;
    // RI VI,4,2 n. 447 (1310-05-26): his envoys at Vercelli, while he was between Kaysersberg and Speyer
    expect(w.lat[stayOn(heinrich, day('1310-05-26'))]).toBeGreaterThan(47.5);
    // n. 499 (1310-07-06): Clement V at Carpentras grants his request; he was at Luxembourg
    expect(w.lat[stayOn(heinrich, day('1310-07-06'))]).toBeGreaterThan(48);
    // n. 497a (1310-07-04): the commune of Pisa pays his tentmaker
    expect(w.lat[stayOn(heinrich, day('1310-07-04'))]).toBeGreaterThan(48);
  });
  it('leave out the charters whose place the editors note as not where the king was', () => {
    // RI VII H. 11 n. 208 (Nürnberg, 1329-09-15): dated ahead; Ludwig was in Italy (Pavia) then
    const ludwig = kings.get('Q57161')!;
    expect(w.lat[stayOn(ludwig, day('1329-09-15'))]).toBeLessThan(47);
  });
});

describe('the journey of Edward I (Gough 1900)', () => {
  const edward = loadItineraries(1291, w)!.get('Q57798')!;
  it('put him in his kingdoms, in Gascony and in Flanders on every day the book tells', () => {
    expect(edward.day.length).toBeGreaterThan(1000);
    for (const p of edward.place) {
      expect(w.lat[p]).toBeGreaterThan(42.5);
      expect(w.lat[p]).toBeLessThan(58);
      expect(w.lon[p]).toBeGreaterThan(-5);
      expect(w.lon[p]).toBeLessThan(4);
    }
  });
  it('put him where the chronicles have him', () => {
    // in Gascony from 1286 to 1289, at Bordeaux in the summer of 1287
    expect(w.lat[stayOn(edward, day('1287-06-01'))]).toBeLessThan(46);
    // at Ghent in the winter of 1297-98
    expect(w.lon[stayOn(edward, day('1297-12-25'))]).toBeGreaterThan(3);
    // at the battle of Falkirk, 22 July 1298
    const falkirk = stayOn(edward, day('1298-07-22'));
    expect(w.lat[falkirk]).toBeGreaterThan(55.7);
    expect(w.lat[falkirk]).toBeLessThan(56.2);
  });
  it('put a name at the place of that name the days around show', () => {
    // 'St. Andrew' and 'St. Andrew's' (March 1304) are St Andrews in Fife, not a church of that saint in Somerset
    expect(w.lat[stayOn(edward, day('1304-03-20'))]).toBeGreaterThan(56.2);
    // 'Oleron' in Béarn (March 1289, between Luc and Bonnegarde) is Oloron, not the Île d'Oléron
    expect(w.lat[stayOn(edward, day('1289-03-12'))]).toBeLessThan(44);
    // Jedburgh (2 August 1304), out of reach between Stirling and Perth, is left out, not put at Edinburgh
    expect(w.lon[stayOn(edward, day('1304-08-02'))]).toBeLessThan(-3.5);
  });
});
