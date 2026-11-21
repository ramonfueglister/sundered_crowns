// The economies of the cities in the world (features 3 to 9, docs/ECONOMY_DESIGN.md): the system day by day, the
// snapshot, a world that starts in another year, what a player sees of a place, and the world server that replays
// the days. The calibration has tests/economy-calibration.test.ts, the engine tests/economy.test.ts.
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newWorldState, loadWorld, loadSetup } from '../tools/sim/load';
import { REFERENCE, cityCalibrations } from '../tools/sim/calibrate_economy';
import { FIGURE, FIGURES, type EconomyEngine } from '../src/sim/economy/engine';
import {
  cityAt,
  cityCalibrations as foundFrom,
  cityPlaces,
  citySeed,
  computeTo,
  foundEconomy,
  workingDays,
  yearRow,
} from '../src/sim/systems/economy';
import { absences, contracts } from '../src/sim/systems/workers';
import { upgradeState } from '../src/sim/upgrade';
import { cityRoutes } from '../src/sim/economy/routes';
import { advanceDay } from '../src/sim/engine';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { STATE_VERSION, type WorldState } from '../src/sim/state';
import { createWorldState } from '../src/sim/setup';
import { placeDetail } from '../src/net/views';
import { dateToDay, dayToDate } from '../src/sim/calendar';
import { World } from '../src/sim/world';
import { configFromEnv } from '../server/config';
import { WorldCore } from '../server/world';
import { bits, type PortJson } from './setup/economy_values';

const days = (s: WorldState, w: World, n: number) => {
  for (let i = 0; i < n; i++) advanceDay(s, w);
};
/** The state of the economies of a new world with what the world gives them before its first day: the working days
 *  of the firms (economy feature 19) and the workers who are away in the rest of the month (economy feature 22).
 *  What the engine starts that day from. */
const withWorkingDays = (s: WorldState, w: World) => {
  const e = s.economy.cities!,
    next = dayToDate(e.day + 1, s.startYear);
  const lastOfMonth = dateToDay(next.y + (next.m === 11 ? 1 : 0), (next.m + 1) % 12, 1, s.startYear) - 1;
  const days = w.economyEngine.workingDays(e.model, workingDays(s, e));
  return w.economyEngine.contracts(w.economyEngine.absences(days, absences(s, e, lastOfMonth)), contracts(s, e));
};

describe('the economies of the cities in the world', () => {
  // one world that runs 400 days, day by day (1356 is a leap year: day 365 is 31 December, day 366 is 1 January 1357)
  const run = newWorldState();
  const CITIES = cityCalibrations(),
    N = CITIES.length; // the cities of this world: it is the reference world
  // the cities without a way to the others (economy feature 17): those of the regions the table names as apart
  const APART = new Set(
    CITIES.map((x, c) =>
      run.w.cityEconomies.table.routes.apart.value.includes(run.w.provinces[run.w.provOf[x.place]].region) ? c : -1,
    ).filter((c) => c >= 0),
  );
  if (run.s.seed !== REFERENCE.seed || run.s.startYear !== REFERENCE.year)
    throw new Error('the tests run the reference world');
  const at: Record<number, { hash: string; state: Uint8Array; figures: Float64Array; model: number }> = {};
  beforeAll(() => {
    for (let d = 1; d <= 400; d++) {
      advanceDay(run.s, run.w);
      if ([45, 75, 365, 366, 367, 396].includes(d))
        at[d] = {
          hash: hashState(run.s),
          state: encodeState(run.s),
          figures: run.s.economy.cities!.figures.slice(),
          model: run.s.economy.cities!.model.length,
        };
    }
  }, 180_000);

  it('are founded with the world: the starting position of every city, from the seed of the world', () => {
    const { s, w } = newWorldState();
    const e = s.economy.cities!,
      c = w.cityEconomies;
    expect(s.v).toBe(STATE_VERSION);
    expect(e.day).toBe(0);
    expect(e.halted).toBe('');
    expect(e.years.length).toBe(0);
    expect(e.figures.length).toBe(N * FIGURES);
    for (let k = 0; k < N; k++) expect(e.figures[k * FIGURES + FIGURE.periods]).toBe(0);
    expect(Array.from(e.places)).toEqual(CITIES.map((x) => x.place));
    const setups = CITIES.map((x) => ({
      parameters: JSON.stringify(x.calibration.parameters),
      initialConditions: JSON.stringify(x.calibration.initial_conditions),
      seed: citySeed(s.seed, x.place),
    }));
    // over land on the ways of the start year (the latest before 1356: those of 1291)
    expect(w.ways?.laid).toBe(1291);
    const routes = cityRoutes(
      w,
      CITIES.map((x) => x.place),
      c.table,
      w.ways,
    );
    expect(
      Buffer.compare(e.model, w.economyEngine.routes(w.economyEngine.create(setups, c.clock, c.rules), routes)),
    ).toBe(0);
    expect(hashState(newWorldState(1357).s)).not.toBe(hashState(s));
  });
  it('give every city random numbers of its own, from the seed of the world and its place', () => {
    const seeds = CITIES.map((x) => citySeed(1356, x.place));
    expect(new Set(seeds).size).toBe(N);
    for (const x of seeds) expect(Number.isSafeInteger(x) && x >= 0).toBe(true);
    expect(citySeed(1356, 4)).toBe(citySeed(1356, 4));
    expect(citySeed(1357, 4)).not.toBe(citySeed(1356, 4));
    expect(citySeed(1357, 4)).not.toBe(citySeed(1356, 5)); // the next world is not this world moved by a place
  });
  it('compute one period every day', () => {
    const { s, w } = newWorldState();
    const start = withWorkingDays(s, w);
    advanceDay(s, w);
    const e = s.economy.cities!,
      first = e.figures;
    expect(e.day).toBe(1);
    expect(first[FIGURE.periods]).toBe(1);
    expect(Buffer.compare(e.model, w.economyEngine.step(start, 1))).toBe(0);
    days(s, w, 2);
    expect(e.day).toBe(3);
    for (let k = 0; k < N; k++) {
      expect(e.figures[k * FIGURES + FIGURE.periods]).toBe(3);
      expect(e.figures[k * FIGURES + FIGURE.realGdp]).not.toBe(first[k * FIGURES + FIGURE.realGdp]);
    }
    expect(Buffer.compare(e.model, w.economyEngine.step(start, 3))).toBe(0);
    expect(e.years.length).toBe(0);
  });
  it('keep the figures of a year that has ended, and the days of the last 365 days only', () => {
    const e = run.s.economy.cities!;
    expect(e.day).toBe(400);
    expect(e.halted).toBe('');
    expect(e.figures[FIGURE.periods]).toBe(400);
    // the row of 1356 was written before 1 January 1357 was computed: the figures of all cities on 31 December
    expect(e.years.length).toBe(yearRow(N));
    expect(yearRow(N)).toBe(1 + N * FIGURES);
    expect(e.years[0]).toBe(1356);
    expect(bits(e.years.slice(1))).toBe(bits(at[365].figures));
    // from the 366th day on the accounts hold 365 days, and the past of the expectations has a fixed size from the
    // first day: the state of the economies no longer grows within a month (the workers who are away in a month,
    // economy feature 22, are 12 bytes each, given on its first day)
    expect(at[367].model - at[366].model).toBe(0);
    expect(at[396].model - at[367].model).toBe(0);
  });
  it('keep the books of every city and of the merchants after a year of the world', () => {
    const k = run.w.economyEngine.checks(run.s.economy.cities!.model);
    expect(k.cities.length).toBe(N);
    for (const x of k.cities)
      for (const v of [x.income, x.nominal, x.real, x.centralBank, x.banks])
        expect(Math.abs(v) / x.gdpSum).toBeLessThan(1e-9);
    for (const m of k.merchants) expect(Math.abs(m.off)).toBeLessThanOrEqual(1e-9 * m.scale);
    // every city with a way to the others has sold to the merchants and bought from them; Texcoco has none
    // (economy feature 17) and sells nothing
    const f = run.s.economy.cities!.figures;
    for (let c = 0; c < N; c++) {
      if (APART.has(c)) {
        expect(f[c * FIGURES + FIGURE.exports]).toBe(0);
        continue;
      }
      expect(f[c * FIGURES + FIGURE.exports]).toBeGreaterThan(0);
      expect(f[c * FIGURES + FIGURE.imports]).toBeGreaterThan(0);
    }
    expect(APART.size).toBe(1);
  });
  it('sell to the merchants about the same share of their output, the largest city as the smallest', () => {
    // the merchants pick among the firms of the other cities, so a city counts by its firms; were every city one
    // seller among 29, Cairo would export less than half of what the smallest cities do, measured by output
    const f = at[365].figures,
      all = Array.from({ length: N }, (_, c) => f[c * FIGURES + FIGURE.exports] / f[c * FIGURES + FIGURE.realGdp]),
      share = all.filter((_, c) => !APART.has(c));
    const people = CITIES.map((c) => c.people),
      largest = people.indexOf(Math.max(...people));
    expect(run.w.names[CITIES[largest].place]).toBe('Cairo');
    // measured 1.405 since firm and owner are one household (economy feature 18), below 1.4 before; 1.556 since goods
    // go over land on the ways (state version 27): the cities far from the sea and off the ways sell less; 2.52 since
    // the firms keep the working days of their owner's faith (economy feature 19): the merchants buy every day, and on
    // a Latin day of rest from the firms that work, so the Muslim cities sell 3.1 to 4.4 % of their output and the
    // Latin cities 1.8 to 2.7 % (Prague the least)
    expect(Math.max(...share) / Math.min(...share)).toBeLessThan(2.7);
    // without the working days the ports sold the most (Venice 3.95 % of output) and the cities inland the least
    // (Sarai 2.54 %); Cairo sold 2.80 %, 0.71 of Venice; with them Cairo sells 3.31 %, 0.75 of Tlemcen
    expect(all[largest]).toBeGreaterThan(0.65 * Math.max(...share));
  });
  it('give for many days at once what the same days give one by one', () => {
    // the persons stay as they are in both: the workers who are away in a month follow from the persons at its
    // start (economy feature 22), and the world's own days change them
    const { s, w } = newWorldState(),
      one = newWorldState();
    computeTo(s, w, 400);
    for (let d = 1; d <= 400; d++) computeTo(one.s, one.w, d);
    expect(s.economy.cities!.years.length).toBe(yearRow(N));
    expect(Buffer.compare(s.economy.cities!.model, one.s.economy.cities!.model)).toBe(0);
    expect(bits(s.economy.cities!.years)).toBe(bits(one.s.economy.cities!.years));
    expect(bits(s.economy.cities!.figures)).toBe(bits(one.s.economy.cities!.figures));
  }, 120_000);
  it('are in the snapshot and in its hash: save in the middle of a month, load and go on equals going straight on', () => {
    const loaded = decodeState(at[45].state);
    expect(loaded.economy.cities!.model).toBeInstanceOf(Uint8Array);
    expect(loaded.economy.cities!.day).toBe(45);
    expect(hashState(loaded)).toBe(at[45].hash);
    days(loaded, run.w, 30);
    expect(hashState(loaded)).toBe(at[75].hash);
    // a year later: the rows of the years come back as they were
    const later = decodeState(encodeState(run.s));
    expect(later.economy.cities!.years).toBeInstanceOf(Float64Array);
    expect(hashState(later)).toBe(hashState(run.s));
    // the hash sees the economies
    const before = hashState(loaded);
    loaded.economy.cities!.model[loaded.economy.cities!.model.length - 1] ^= 1;
    expect(hashState(loaded)).not.toBe(before);
  }, 30_000);
  it('do not exist in a world that starts in a year without its cities', () => {
    const w = loadWorld(),
      s = createWorldState(w, { ...loadSetup(1356), year: 1400 }, 1356); // no file has the cities of 1400
    expect(s.economy.cities).toBeNull();
    days(s, w, 400);
    expect(s.economy.cities).toBeNull();
    expect(placeDetail(s, w, CITIES[0].place)!.cityEconomy).toBeUndefined();
    expect(s.firm.size).toBe(0);
  });
  it('are founded in a world that starts in 1291 too: an economy in every place with a town, with the table of 1356 as a placeholder', () => {
    const { s, w } = newWorldState(1291, 1291);
    const e = s.economy.cities!,
      n = e.places.length;
    expect(s.startYear).toBe(1291);
    expect(Array.from(e.places)).toEqual(cityPlaces(1291).map((c) => c.place));
    expect(n).toBe(550); // 558 towns inside the world frame, some places hold two
    expect(e.day).toBe(0);
    expect(e.halted).toBe('');
    expect(e.figures.length).toBe(n * FIGURES);
    // the history up to 1291, not the plague of the table's years (feature 21)
    for (const x of foundFrom(s, w).slice(0, 3)) expect((x.calibration.parameters as PortJson).T_prime).toBe(11);
    days(s, w, 35); // past the first plan of every firm
    expect(e.day).toBe(35);
    expect(e.halted).toBe('');
    for (let k = 0; k < n; k++) expect(e.figures[k * FIGURES + FIGURE.periods]).toBe(35);
    const c = w.economyEngine.checks(e.model);
    for (const x of c.cities)
      for (const v of [x.income, x.nominal, x.real, x.centralBank, x.banks])
        expect(Math.abs(v) / x.gdpSum).toBeLessThan(1e-9);
    expect(placeDetail(s, w, e.places[0])!.cityEconomy).toBeDefined();
    // the economies are where the persons live: in every town of the world graphic with people, and nowhere else
    expect(placeDetail(s, w, w.names.indexOf('London'))!.cityEconomy).toBeDefined();
    expect(cityPlaces(1291).map((x) => x.name)).toContain('Bruges');
    const noTown = Array.from({ length: w.L }, (_, i) => i).find((i) => s.place.pop[i] > 0 && !e.places.includes(i))!;
    expect(placeDetail(s, w, noTown)!.cityEconomy).toBeUndefined();
    // a world of 1291 from before feature 21 has its economies founded anew on the day it has reached
    // biome-ignore lint/suspicious/noExplicitAny: a state of an older version, which no type of today describes
    const old = decodeState(encodeState(s)) as any;
    old.v = 33;
    const up = upgradeState(old, w),
      founded = decodeState(encodeState(s));
    foundEconomy(founded, w);
    expect(up.v).toBe(STATE_VERSION);
    expect(hashState(up)).toBe(hashState(founded));
    expect(up.economy.cities!.day).toBe(35);
    expect(up.economy.cities!.years.length).toBe(0);
  }, 300_000);
  it('stand still when the engine cannot compute a day, and the world goes on', () => {
    const real = loadWorld();
    let calls = 0;
    const broken: EconomyEngine = {
      ...real.economyEngine,
      advance: () => {
        calls++;
        throw new Error('the economy engine stopped: a rule failed');
      },
    };
    const w: World = Object.assign(Object.create(World.prototype), real, { economyEngine: broken });
    const { s } = newWorldState();
    // the state of the day before stays, with the working days it was given for the day that failed
    const before = withWorkingDays(s, real);
    advanceDay(s, w);
    const e = s.economy.cities!;
    expect(e.halted).toBe('2 January 1356: the economy engine stopped: a rule failed');
    expect(e.day).toBe(0);
    expect(Buffer.compare(e.model, before)).toBe(0);
    days(s, w, 400); // the next days do not try again
    expect(calls).toBe(1);
    expect(s.day).toBe(401);
    expect(e.years.length).toBe(0); // a year that was not computed has no row
    expect(placeDetail(s, real, e.places[0])!.cityEconomy!.halted).toBe(e.halted);
    computeTo(s, real, 401); // not even with a working engine: halted economies stay as they were
    expect(s.economy.cities!.day).toBe(0);
  });
  it('stop on the day that fails when many days are computed at once', () => {
    const real = loadWorld();
    let single = 0;
    const broken: EconomyEngine = {
      ...real.economyEngine,
      advance: (m, n) => {
        if (n > 1 || ++single > 3) throw new Error('the economy engine stopped: a rule failed');
        return real.economyEngine.advance(m, n);
      },
    };
    const w: World = Object.assign(Object.create(World.prototype), real, { economyEngine: broken });
    const { s } = newWorldState();
    computeTo(s, w, 10);
    const e = s.economy.cities!;
    expect(e.day).toBe(3);
    expect(e.figures[FIGURE.periods]).toBe(3);
    expect(e.halted).toBe('5 January 1356: the economy engine stopped: a rule failed');
    const fresh = newWorldState().s;
    expect(Buffer.compare(e.model, real.economyEngine.step(withWorkingDays(fresh, real), 3))).toBe(0);
  });
  it('stand still when a day ends without a GDP in one city', () => {
    const real = loadWorld();
    const last = (N - 1) * FIGURES + FIGURE.realGdp;
    const broken: EconomyEngine = {
      ...real.economyEngine,
      figures: (m) => real.economyEngine.figures(m).fill(NaN, last, last + 1),
    };
    const w: World = Object.assign(Object.create(World.prototype), real, { economyEngine: broken });
    const { s } = newWorldState();
    const before = withWorkingDays(s, real);
    days(s, w, 2);
    expect(s.economy.cities!.halted).toBe('2 January 1356: the day ended without a GDP (not a number)');
    expect(Buffer.compare(s.economy.cities!.model, before)).toBe(0);
  });
});

describe('what a player sees of the economy', () => {
  it('is a section in every place with a city, and in no other place', () => {
    const { s, w } = newWorldState();
    const places = cityPlaces(1356).map((c) => c.place);
    let shown = 0;
    for (let i = 0; i < w.L; i++) {
      const d = placeDetail(s, w, i)!;
      expect(d).not.toHaveProperty('economy'); // the section of England's economy is gone
      if (d.cityEconomy) {
        shown++;
        expect(places).toContain(i);
      }
    }
    expect(shown).toBe(29);
    for (const name of ['London', 'Paris', 'Cairo', 'Venice'])
      expect(placeDetail(s, w, w.names.indexOf(name))!.cityEconomy).toBeDefined();
    // a place of England that is not one of the cities has no economy any more
    const york = w.names.indexOf('York');
    expect(york).toBeGreaterThanOrEqual(0);
    expect(placeDetail(s, w, york)!.cityEconomy).toBeUndefined();
  });
  it('shows the last 365 days of the city and its price level of today, new every day', () => {
    const { s, w } = newWorldState();
    const london = w.names.indexOf('London'),
      k = cityAt(s.economy.cities!, london);
    const p = cityCalibrations()[k].calibration.parameters as PortJson;
    const d0 = placeDetail(s, w, london)!.cityEconomy!;
    expect(d0).toMatchObject({ day: 0, baseYear: 1356, scale: 0.01 });
    expect(d0.realGdp).toBeCloseTo((45247.8 * 60862) / 2583180, 3); // London's share of England's GDP at 1:100
    expect(d0.realGdpIndex).toBeCloseTo(100, 9);
    expect(d0.priceToday).toBe(100);
    expect(d0.employed + d0.unemployed).toBe(p.H_act);
    expect(d0.halted).toBeUndefined();
    let last = d0;
    for (let day = 1; day <= 3; day++) {
      advanceDay(s, w);
      const f = s.economy.cities!.figures.subarray(k * FIGURES, (k + 1) * FIGURES),
        d = placeDetail(s, w, london)!.cityEconomy!;
      expect(d.day).toBe(day);
      expect(d.realGdp).toBe(f[FIGURE.realGdp]);
      expect(d.realGdp).not.toBe(last.realGdp);
      expect(d.realGdpIndex).toBeCloseTo((100 * f[FIGURE.realGdp]) / d0.realGdp, 6);
      expect(d.priceToday).toBe(100 * f[FIGURE.priceLevel]);
      expect(d.consumption).toBe(f[FIGURE.consumption]);
      expect(d.crown).toBe(f[FIGURE.government]);
      expect(d.investment).toBe(f[FIGURE.investment]);
      expect(d.exports).toBe(f[FIGURE.exports]);
      expect(d.imports).toBe(f[FIGURE.imports]);
      // GDP is the sum of its uses
      expect(d.consumption + d.crown + f[FIGURE.investment] + d.exports - d.imports).toBeGreaterThan(0.9 * d.realGdp);
      // another city shows another economy
      expect(placeDetail(s, w, w.names.indexOf('Paris'))!.cityEconomy!.realGdp).not.toBe(d.realGdp);
      last = d;
    }
  });
});

describe('the world server with the economy', () => {
  it('replays the days of the economies from its command log and resumes from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scw-eco-'));
    try {
      const cfg = { ...configFromEnv({}), dataDir: dir, id: 'eco', snapshotEveryDays: 30, log: () => {} };
      const core = new WorldCore(cfg).init();
      for (let i = 0; i < 70; i++) core.step(); // snapshots at day 30 and 60
      expect(core.s.economy.cities!.day).toBe(70);
      const fromStart = core.verifyReplay(0),
        fromLast = core.verifyReplay(60);
      expect(fromStart.hash).toBe(fromStart.live);
      expect(fromLast.hash).toBe(fromLast.live);
      const live = hashState(core.s);
      core.shutdown();
      const again = new WorldCore(cfg).init();
      expect(again.s.day).toBe(70);
      expect(hashState(again.s)).toBe(live);
      again.shutdown();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
