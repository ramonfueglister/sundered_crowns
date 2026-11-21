// The figures of the persons follow the plan of the day (people feature 12): a person whom the plan takes to the
// market or to a house of worship has a figure there, which only the piece that owns its column adds and which waits
// off the stage, dressed as the person's figure in the street; on the main thread the hour puts each person's figure
// on the stage where the plan has the person, and none at night.
import { describe, expect, it } from 'vitest';
import { type Figures, type SettledGround, crowd, setPlacePeople } from '../../src/figures';
import { FIGURE_AT, PLAN } from '../../src/figures/aims';
import { type FigureClock, NOWHERE, figureAtHour, figureShown } from '../../src/figures/schedule';
import { figureMeshes, figuresAtHour, personAt } from '../../src/figures/stage';
import { type Ground, N, idx } from '../../src/lookprobe/layout';
import { sickness } from '../../src/sim/people/absence';
import { AWAY, DOING, WHO, dayPlan, doingAt } from '../../src/sim/people/day_plan';
import { FARM_YEAR } from '../../src/sim/people/farm_year';
import { CALENDAR, DAY } from '../../src/sim/holy_days';
import CITIES_JSON from '../../src/sim/content/cities_1356.json';

const venice = CITIES_JSON.cities.find((c) => c.name === 'Venice')!;
const SEED = 1291,
  START = 1356,
  LAT = 45.4,
  PEOPLE = 800,
  ID = 90000;
/** the parts of the persons in turn; every tenth person is a woman in childbed */
const PARTS = [WHO.trade, WHO.craft, WHO.seeking, WHO.home, WHO.farm];
setPlacePeople({
  place: venice.place,
  day: 0,
  id: Array.from({ length: PEOPLE }, (_, k) => ID + k),
  born: Array.from({ length: PEOPLE }, () => -365 * 30),
  sex: Array.from({ length: PEOPLE }, (_, k) => k % 2),
  who: Array.from({ length: PEOPLE }, (_, k) => PARTS[k % PARTS.length]),
  calendar: Array.from({ length: PEOPLE }, () => CALENDAR.latin),
  seed: SEED,
  childbed: Array.from({ length: PEOPLE / 10 }, (_, k) => ({ uid: ID + 10 * k, born: -2 })),
});

/** A town of paved streets between built blocks, with a market and a church. */
function town(ox = 0): { g: Ground; s: SettledGround } {
  const g: Ground = {
    h: new Int16Array(N * N).fill(4),
    mat: new Uint8Array(N * N),
    wet: new Uint8Array(N * N),
    shore: new Uint8Array(N * N),
    occ: new Float32Array(N * N),
    surf: new Float32Array(N * N),
    ox,
    oz: 0,
  };
  const s: SettledGround = { used: new Uint8Array(N * N), town: new Uint8Array(N * N), field: new Uint8Array(N * N) };
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const wx = x + ox,
        i = idx(x, z);
      if (wx < 100 || wx >= 260 || z < 100 || z >= 260) continue;
      s.town[i] = 1;
      s.used[i] = wx % 19 < 2 || z % 17 < 2 || (wx >= 150 && wx < 175 && z >= 150 && z < 175) ? 2 : 1;
    }
  s.towns = [{ site: venice.site, cx: 180, cz: 180, half: 80, market: [150, 150, 175, 175], worship: [[210, 205]] }];
  return { g, s };
}
const whoOf = (f: Figures, k: number) => f.plan![k * PLAN];
const ofKind = (f: Figures, kind: number) =>
  Array.from({ length: f.count }, (_, k) => k).filter((k) => f.at![k] === kind);
const personOf = (f: Figures, k: number) => f.e[k * 4 + 3] - 1;

/** the first days from 1 January 1356 that are a Sunday, a market day of Venice, and a plain working day */
const days = (() => {
  const plan = (day: number) =>
    dayPlan({ who: WHO.trade, calendar: CALENDAR.latin, away: AWAY.none, heading: -1 }, venice.place, LAT, day, START);
  const find = (ok: (p: ReturnType<typeof plan>) => boolean) => [...Array(30).keys()].find((d) => ok(plan(d)))!;
  return {
    sunday: find((p) => p.kind === DAY.rest && p.weekday === 0),
    market: find((p) => p.kind === DAY.work && p.market),
    work: find((p) => p.kind === DAY.work && !p.market && p.weekday !== 6),
    plan,
  };
})();
const clock = (day: number, hour: number | null): FigureClock => ({
  day,
  hour,
  startYear: START,
  lat: () => LAT,
  farm: () => FARM_YEAR.north,
});

describe('a person who goes to the market or to a house of worship', () => {
  const { g, s } = town(),
    f = crowd(g, s, () => true);
  it('has a figure there that waits off the stage, standing on the street', () => {
    const market = ofKind(f, FIGURE_AT.market),
      worship = ofKind(f, FIGURE_AT.worship);
    expect(market.length).toBeGreaterThan(20);
    expect(worship.length).toBeGreaterThan(20);
    for (const k of [...market, ...worship]) {
      const x = Math.floor(f.a[k * 4]),
        z = Math.floor(f.a[k * 4 + 2]);
      expect(s.used[idx(x, z)]).toBe(2);
      expect(f.a[k * 4 + 3]).toBeLessThan(0);
      expect(f.b[k * 4 + 3]).toBe(0);
    }
    // only the services and those who look for work go to the market
    for (const k of market) {
      expect([WHO.trade, WHO.seeking]).toContain(whoOf(f, k));
      expect(f.a[k * 4]).toBeGreaterThanOrEqual(150);
      expect(f.a[k * 4]).toBeLessThan(175);
    }
    for (const k of worship) expect(Math.hypot(f.a[k * 4] - 210, f.a[k * 4 + 2] - 205)).toBeLessThan(14);
  });
  it('has at most one figure of each kind, all dressed alike', () => {
    for (const kind of [FIGURE_AT.street, FIGURE_AT.market, FIGURE_AT.worship]) {
      const ids = ofKind(f, kind).map((k) => personOf(f, k));
      expect(new Set(ids).size).toBe(ids.length);
    }
    const dress = (k: number) => [...f.c.subarray(k * 4 + 1, k * 4 + 4), ...f.d.subarray(k * 4, k * 4 + 4)];
    const first = new Map<number, number>();
    let same = 0;
    for (let k = 0; k < f.count; k++) {
      const id = personOf(f, k);
      if (id < 0) continue;
      const k0 = first.get(id);
      if (k0 === undefined) first.set(id, k);
      else {
        expect(dress(k)).toEqual(dress(k0));
        same++;
      }
    }
    expect(same).toBeGreaterThan(10);
  });
  it('carries what the plan of the day needs of the person', () => {
    for (let k = 0; k < f.count; k++) {
      const id = personOf(f, k),
        [who, calendar, place, born, child] = f.plan!.subarray(k * PLAN, k * PLAN + PLAN);
      expect(who).toBe(PARTS[(id - ID) % PARTS.length]);
      expect([calendar, place, born]).toEqual([CALENDAR.latin, venice.place, -365 * 30]);
      expect(child).toBe((id - ID) % 10 === 0 ? -2 : Number.NEGATIVE_INFINITY);
    }
    expect(f.seed).toBe(SEED);
  });
  it('is put into exactly one of two pieces that share the town', () => {
    const l = town(0),
      r = town(100),
      keys = (x: Figures, ox: number) =>
        Array.from(
          { length: x.count },
          (_, k) => `${x.at![k]}:${personOf(x, k)}:${Math.floor(x.a[k * 4]) + ox}:${Math.floor(x.a[k * 4 + 2])}`,
        );
    const both = [
      ...keys(
        crowd(l.g, l.s, (x) => x >= 100 && x < 200),
        0,
      ),
      ...keys(
        crowd(r.g, r.s, (x) => x >= 100 && x < 200),
        100,
      ),
    ].sort();
    expect(both).toEqual(
      keys(
        crowd(l.g, l.s, (x) => x >= 100 && x < 300),
        0,
      ).sort(),
    );
  });
});

describe('where the plan of the day has a person at an hour', () => {
  const plan = (who: number, day: number) =>
    dayPlan({ who, calendar: CALENDAR.latin, away: AWAY.none, heading: -1 }, venice.place, LAT, day, START);
  it('the craftsman in the workshop, in the street over the midday meal, and indoors at night', () => {
    const p = plan(WHO.craft, days.work);
    expect(figureAtHour(p, WHO.craft, 10)).toBe(NOWHERE);
    expect(doingAt(p, 12.5)).toBe(DOING.meal);
    expect(figureAtHour(p, WHO.craft, 12.5)).toBe(FIGURE_AT.street);
    expect(figureAtHour(p, WHO.craft, 3)).toBe(NOWHERE);
    expect(figureAtHour(p, WHO.craft, 23)).toBe(NOWHERE);
  });
  it('the services in the street, and at the market on its day', () => {
    expect(figureAtHour(plan(WHO.trade, days.work), WHO.trade, 10)).toBe(FIGURE_AT.street);
    expect(figureAtHour(plan(WHO.trade, days.market), WHO.trade, 10)).toBe(FIGURE_AT.market);
  });
  it('the worker without work at the hiring place for the hour after sunrise, then at home', () => {
    const p = plan(WHO.seeking, days.work);
    expect(figureAtHour(p, WHO.seeking, p.sunrise + 0.5)).toBe(FIGURE_AT.market);
    expect(figureAtHour(p, WHO.seeking, 14)).toBe(FIGURE_AT.street);
  });
  it('everyone at the house of worship at terce on Sunday, which is also the hour shown when the hours fly', () => {
    for (const who of PARTS) {
      const p = plan(who, days.sunday),
        terce = p.sunrise + (3.5 * (p.sunset - p.sunrise)) / 12;
      expect(figureAtHour(p, who, terce)).toBe(FIGURE_AT.worship);
    }
    const f = crowd(town().g, town().s, () => true),
      k = ofKind(f, FIGURE_AT.worship)[0];
    expect(figureShown(f, k, clock(days.sunday, null))).toBe(FIGURE_AT.worship);
  });
  it('nobody who is sick or in childbed, and a ruler in the street at every hour', () => {
    const f = crowd(town().g, town().s, () => true),
      street = ofKind(f, FIGURE_AT.street),
      noon = (day: number) => clock(day, 12.5);
    // a person of the town on the first day of an episode of sickness
    const sick = street.find((k) =>
      sickness(SEED, personOf(f, k), -365 * 30, 400).some((d, j) => j % 2 === 0 && d > 0),
    );
    expect(sick).toBeDefined();
    const ill = sickness(SEED, personOf(f, sick!), -365 * 30, 400).find((d, j) => j % 2 === 0 && d > 0)!;
    expect(figureShown(f, sick!, noon(ill))).toBe(NOWHERE);
    // a mother three days after the birth, and after the days of childbed
    const mother = street.find((k) => (personOf(f, k) - ID) % 10 === 0)!;
    expect(figureShown(f, mother, noon(1))).toBe(NOWHERE);
    expect(figureShown(f, mother, noon(40))).toBe(FIGURE_AT.street);
    const ruler = { ...f, plan: Float32Array.from([-1, -1, -1, 0, Number.NEGATIVE_INFINITY]), e: new Float32Array(4) };
    expect(figureShown(ruler, 0, clock(days.work, 3))).toBe(FIGURE_AT.street);
  });
});

describe('the figures on the stage', () => {
  it('show each person where the plan has them, and none of them at night', () => {
    const f = crowd(town().g, town().s, () => true),
      pair = figureMeshes(f),
      buf = pair.near.geometry.getAttribute('figureA') as unknown as { data: { array: Float32Array } },
      on = (k: number) => buf.data.array[k * 20 + 3] >= 0,
      persons = Array.from({ length: f.count }, (_, k) => k).filter((k) => f.at![k] !== FIGURE_AT.anonymous);
    // Sunday at terce: at the house of worship (unless sick), not in the street or at the market
    const terce = clock(days.sunday, null);
    expect(figuresAtHour(terce)).toBe(true);
    for (const k of persons) {
      expect(on(k)).toBe(figureShown(f, k, terce) === f.at![k]);
      if (f.at![k] !== FIGURE_AT.worship) expect(on(k)).toBe(false);
    }
    expect(persons.filter(on).length).toBeGreaterThan(20);
    // the same again changes nothing
    expect(figuresAtHour(clock(days.sunday, null))).toBe(false);
    // three in the morning: nobody
    figuresAtHour(clock(days.work, 3));
    for (const k of persons) expect(on(k)).toBe(false);
    const k = persons[0];
    expect(personAt(f.a[k * 4], f.a[k * 4 + 1], f.a[k * 4 + 2], 0.5)).toBeNull();
    // the anonymous figures keep their phase
    for (let j = 0; j < f.count; j++) if (f.at![j] === FIGURE_AT.anonymous) expect(on(j)).toBe(true);
    pair.near.dispatchEvent({ type: 'dispose' } as never);
  });
});
