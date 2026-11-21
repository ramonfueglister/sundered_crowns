// The figures show the persons of their towns as they are on the world's day (people feature 12, src/people/
// town_rolls.ts): a town's roll changes with who its persons are (the dead, the young who come to the age of the
// figures), not with what they do; an older list does not take the place of a newer one; figures built with an older
// roll are found out of date, and built again they show the new persons; until then the dead are nowhere, and a
// mother in childbed by the new list stays at home.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Figures, type SettledGround, crowd, setPlacePeople } from '../../src/figures';
import { FIGURE_AT, aimsOf } from '../../src/figures/aims';
import { PLACES_PER_REQUEST, type PlacePeopleList, listedPerson, rollOf, rollsHold } from '../../src/figures/people';
import { type FigureClock, NOWHERE, figureShown } from '../../src/figures/schedule';
import { type Ground, N, idx } from '../../src/lookprobe/layout';
import { askPersons } from '../../src/people/town_rolls';
import { AWAY, WHO, dayPlan } from '../../src/sim/people/day_plan';
import { CALENDAR, DAY } from '../../src/sim/holy_days';
import CITIES_JSON from '../../src/sim/content/cities_1356.json';

const city = (name: string) => CITIES_JSON.cities.find((c) => c.name === name)!;
const PEOPLE = 400,
  ID = 70000,
  /** born so that the person comes to the age of the figures (14) between day 0 and day 10 */
  YOUNG = ID + PEOPLE,
  YOUNG_BORN = -Math.round(14 * 365.25) + 5;
/** the list of a place on `day`: the persons ID … ID + PEOPLE - 1 but those `gone`, the young one, women and men in
 *  turn, traders and farmers in turn (`who` changes the part of each) */
function listOn(place: number, day: number, o: { gone?: number[]; who?: number; childbed?: number[] } = {}) {
  const ids = [...Array.from({ length: PEOPLE }, (_, k) => ID + k), YOUNG].filter((id) => !o.gone?.includes(id));
  return {
    place,
    day,
    id: ids,
    born: ids.map((id) => (id === YOUNG ? YOUNG_BORN : -365 * 30)),
    sex: ids.map((id) => id % 2),
    who: ids.map((id) => (id % 4 < 2 ? WHO.trade : (o.who ?? WHO.farm))),
    calendar: ids.map(() => CALENDAR.latin),
    seed: 1291,
    childbed: (o.childbed ?? []).map((uid) => ({ uid, born: day - 1 })),
  } satisfies PlacePeopleList;
}

describe('the lists of the persons of a town', () => {
  const paris = city('Paris');
  it('change its roll with who its persons are, not with what they do', () => {
    setPlacePeople(listOn(paris.place, 0));
    const before = rollOf(paris.site);
    expect(before).toBeDefined();
    expect(listedPerson(YOUNG, paris.place)).toBeNull();
    expect(listedPerson(ID + 6, paris.place)?.who).toBe(WHO.farm);
    // another part and a birth: the same persons
    setPlacePeople(listOn(paris.place, 1, { who: WHO.seeking, childbed: [ID + 6] }));
    expect(rollOf(paris.site)).toBe(before);
    expect(listedPerson(ID + 6, paris.place)).toMatchObject({ who: WHO.seeking, child: 0 });
    // one dies, the young one comes of age: as many persons as before, and others
    setPlacePeople(listOn(paris.place, 10, { gone: [ID + 3] }));
    const after = rollOf(paris.site);
    expect(after).not.toBe(before);
    expect(listedPerson(ID + 3, paris.place)).toBeNull();
    expect(listedPerson(YOUNG, paris.place)).toMatchObject({ id: YOUNG });
    // (a person is listed at the place of the list only)
    expect(listedPerson(YOUNG, paris.place + 1)).toBeUndefined();
  });
  it('do not take an older list in place of a newer one', () => {
    const now = rollOf(paris.site);
    setPlacePeople(listOn(paris.place, 5));
    expect(rollOf(paris.site)).toBe(now);
    expect(listedPerson(ID + 3, paris.place)).toBeNull();
  });
});

/** A town of paved streets between built blocks. */
function town(site: number): { g: Ground; s: SettledGround } {
  const g: Ground = {
    h: new Int16Array(N * N).fill(4),
    mat: new Uint8Array(N * N),
    wet: new Uint8Array(N * N),
    shore: new Uint8Array(N * N),
    occ: new Float32Array(N * N),
    surf: new Float32Array(N * N),
    ox: 0,
    oz: 0,
  };
  const s: SettledGround = { used: new Uint8Array(N * N), town: new Uint8Array(N * N), field: new Uint8Array(N * N) };
  for (let z = 100; z < 260; z++)
    for (let x = 100; x < 260; x++) {
      s.town[idx(x, z)] = 1;
      s.used[idx(x, z)] = x % 19 < 2 || z % 17 < 2 ? 2 : 1;
    }
  s.towns = [{ site, cx: 180, cz: 180, half: 80 }];
  return { g, s };
}
const persons = (f: Figures) =>
  new Set(Array.from({ length: f.count }, (_, k) => f.e[k * 4 + 3] - 1).filter((uid) => uid >= 0));
const figureOf = (f: Figures, uid: number) =>
  Array.from({ length: f.count }, (_, k) => k).find(
    (k) => f.e[k * 4 + 3] - 1 === uid && f.at![k] === FIGURE_AT.street,
  )!;

describe('the figures of a town whose persons changed', () => {
  const milan = city('Milan'),
    LAT = 45.5;
  setPlacePeople(listOn(milan.place, 0));
  const { g, s } = town(milan.site),
    built = crowd(g, s, () => true),
    plan = (day: number) =>
      dayPlan({ who: WHO.trade, calendar: CALENDAR.latin, away: AWAY.none, heading: -1 }, milan.place, LAT, day, 1356),
    work = [...Array(14).keys()].map((d) => d + 10).find((d) => plan(d).kind === DAY.work)!,
    clock: FigureClock = { day: work, hour: 10, startYear: 1356, lat: () => LAT };
  // a trader in the street at ten on a working day (services work in the streets, schedule.ts), and a woman
  const shown = [...persons(built)].filter(
    (uid) => uid % 4 < 2 && figureShown(built, figureOf(built, uid), clock) === FIGURE_AT.street,
  );
  const dead = shown[0],
    mother = shown.find((uid) => uid % 2 === 0 && uid !== dead)!;
  it('are built with the roll of the town, which holds while nobody changed', () => {
    expect(built.rolls).toEqual([milan.site, rollOf(milan.site)]);
    expect(rollsHold(built.rolls)).toBe(true);
    expect(dead).toBeDefined();
    expect(mother).toBeDefined();
  });
  it('are out of date once a person died and another came of age, and the dead and the mother are not seen', () => {
    setPlacePeople(listOn(milan.place, work - 1, { gone: [dead], childbed: [mother] }));
    expect(rollsHold(built.rolls)).toBe(false);
    expect(figureShown(built, figureOf(built, dead), clock)).toBe(NOWHERE);
    expect(figureShown(built, figureOf(built, mother), clock)).toBe(NOWHERE);
  });
  it('show the new persons when built again, also where the town has as many persons as before', () => {
    const again = crowd(g, s, () => true),
      aims = aimsOf(s.towns![0])!,
      aiming = new Set([...aims.street.values()].map((p) => p.id));
    expect(rollsHold(again.rolls)).toBe(true);
    expect(persons(again).has(dead)).toBe(false);
    expect(aiming.has(dead)).toBe(false);
    expect(aiming.has(YOUNG)).toBe(true);
  });
});

describe('the lists asked for again', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('come in requests of at most the places the server takes, and are taken', async () => {
    const cologne = city('Cologne'),
      places = [cologne.place, ...Array.from({ length: PLACES_PER_REQUEST }, (_, k) => 10000 + k)],
      asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      const of = new URL(url).searchParams.get('places')!.split(',').map(Number);
      return new Response(JSON.stringify(of.includes(cologne.place) ? [listOn(cologne.place, 3)] : []));
    });
    const lists = await askPersons('ws://localhost:8787', places, 1356);
    expect(asked.length).toBe(2);
    expect(asked[0].startsWith('http://localhost:8787/people?places=')).toBe(true);
    expect(lists.map((l) => l.place)).toEqual([cologne.place]);
    expect(listedPerson(ID + 1, cologne.place)).toMatchObject({ id: ID + 1 });
  });
});
