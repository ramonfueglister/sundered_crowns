// Economy feature 10 (docs/ECONOMY_DESIGN.md): the persons of the cities' economies are the persons of the cities,
// and every firm is an entity. Who works (src/sim/systems/work.ts), the founding and the daily writing
// (src/sim/systems/economy.ts), the state, the upgrade, and what the server and the panel say of a person.
import { describe, it, expect } from 'vitest';
import { foundDeaths } from '../src/sim/systems/deaths';
import { newWorldState, loadSetup } from '../tools/sim/load';
import { advanceDay } from '../src/sim/engine';
import { FIGURE, FIGURES } from '../src/sim/economy/engine';
import { activePersons } from '../src/sim/economy/calibration';
import { ROLE, WORKING_AGE, workforce } from '../src/sim/systems/work';
import { cityCalibrations, cityPlaces, foundEconomy } from '../src/sim/systems/economy';
import { ageOn } from '../src/sim/systems/people';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { ALIVE, STATE_VERSION, PERSON_SCHEMA, type WorldState } from '../src/sim/state';
import { personDetail, personEconomy } from '../src/net/people';
import { economyRows, lsd, pence } from '../src/people/economy_rows';
import { countPeople, settleHamlets } from '../src/sim/systems/hamlets';
import { foundLots } from '../src/sim/systems/lots';
import { cultivate } from '../src/sim/systems/cultivation';
import { bringInHarvest } from '../src/sim/systems/harvest';

const { s, w } = newWorldState();
const P = s.person.cols,
  F = s.firm.cols,
  e = s.economy.cities!;
// Nobody moves in this world (people feature 4; tests/moves.test.ts runs the moves with the economy): the upgrades
// of the old versions below lay out the land register for persons who live where they were founded.
P.moves.fill(ALIVE);
const N = e.places.length;
const placeOf = (x: WorldState, id: number) => x.family.cols.place[x.person.cols.family[id]];
const cityOf = new Map<number, number>(Array.from(e.places, (p, k) => [p, k]));
const figure = (x: WorldState, k: number, f: number) => x.economy.cities!.figures[k * FIGURES + f];
/** Per city the persons of each part. */
function parts(x: WorldState): number[][][] {
  const c = x.economy.cities!,
    at = new Map<number, number>(Array.from(c.places, (p, k) => [p, k]));
  const out: number[][][] = Array.from(c.places, () => [[], [], [], [], []]);
  for (let id = 0; id < x.person.size; id++) {
    const role = x.person.cols.role[id];
    if (role) out[at.get(placeOf(x, id))!][role].push(id);
  }
  return out;
}
const sum = (v: ArrayLike<number>, ids: number[]) => ids.reduce((a, id) => a + v[id], 0);
const start = decodeState(encodeState(s)); // the world on the day it is founded

describe('who works', () => {
  const rate = w.cityEconomies.table.inputs.participation.value;
  it('is a person of a city aged 15 or more, and nobody else has a part in an economy', () => {
    let withPart = 0;
    for (let id = 0; id < s.person.size; id++) {
      if (!P.role[id]) {
        expect(P.firm[id]).toBe(-1);
        expect(P.wage[id] + P.income[id] + P.spent[id] + P.savings[id]).toBe(0);
        continue;
      }
      withPart++;
      expect(s.person.alive[id]).toBe(1);
      expect(ageOn(P.born[id], s.day)).toBeGreaterThanOrEqual(WORKING_AGE);
      expect(cityOf.has(placeOf(s, id))).toBe(true);
    }
    expect(withPart).toBeGreaterThan(11_000);
  });
  it('follows the rates of the table: 97.1 % of the men and 43 % of the women of working age', () => {
    expect(rate).toEqual({ men: 0.971, women: 0.43 });
    const n = [0, 0],
      works = [0, 0];
    for (let id = 0; id < s.person.size; id++) {
      if (!cityOf.has(placeOf(s, id)) || ageOn(P.born[id], s.day) < WORKING_AGE) continue;
      const man = P.sex[id] === 1 ? 1 : 0;
      n[man]++;
      if (P.role[id] && P.role[id] !== ROLE.idle) works[man]++;
    }
    expect(n[0]).toBeGreaterThan(7000);
    expect(n[1]).toBeGreaterThan(7000);
    // three standard errors of a share of that many draws
    for (const [man, p] of [
      [1, rate.men],
      [0, rate.women],
    ] as const)
      expect(Math.abs(works[man] / n[man] - p)).toBeLessThan(3 * Math.sqrt((p * (1 - p)) / n[man]));
  });
  it('is the same draw for the same seed, and another for another seed', () => {
    expect(Array.from(newWorldState().s.person.cols.role)).toEqual(Array.from(start.person.cols.role));
    const other = newWorldState(7).s;
    expect(Array.from(other.person.cols.role)).not.toEqual(Array.from(start.person.cols.role));
  });
  it('gives every city as many active persons as its calibration has, and one person who does not work', () => {
    const cities = cityCalibrations(start, w),
      force = workforce(
        start,
        cities.map((c) => c.place),
        rate,
      );
    expect(cities.map((c) => c.place)).toEqual(Array.from(e.places));
    expect(cityPlaces(1356).map((c) => c.place)).toEqual(Array.from(e.places));
    const by = parts(start);
    cities.forEach((c, k) => {
      const firms = (c.calibration.parameters as { I_s: number[] }).I_s.reduce((a, b) => a + b, 0);
      expect(force[k].working).toEqual(c.working);
      expect(activePersons(c.calibration)).toBe(c.working.length);
      expect(by[k][ROLE.owner].length).toBe(firms);
      expect(by[k][ROLE.banker].length).toBe(1);
      expect(by[k][ROLE.idle]).toEqual([c.idle]);
      expect(by[k][ROLE.worker].length + firms + 1).toBe(c.working.length);
      // a firm for every four persons of a sector, its owner among them, as the table says (rounded sector by
      // sector); the banker and the one person without work of the start belong to no sector
      expect(Math.abs(firms - (c.working.length - 2) / 4)).toBeLessThanOrEqual(1.5);
    });
  });
  it('gives every part of a city its numbers once: 0, 1, 2 and so on, as the engine lists its persons', () => {
    for (const city of parts(start))
      for (const role of [ROLE.worker, ROLE.owner, ROLE.banker, ROLE.idle]) {
        const numbers = city[role].map((id) => start.person.cols.agent[id]).sort((a, b) => a - b);
        expect(numbers).toEqual(numbers.map((_, i) => i));
      }
  });
});

describe('the firms', () => {
  it('are entities: each in its city, with the person who owns it, in a sector', () => {
    expect(s.firm.size).toBe(e.firm0[N]);
    expect(s.firm.size).toBeGreaterThan(2500);
    for (let k = 0; k < N; k++)
      for (let f = e.firm0[k]; f < e.firm0[k + 1]; f++) {
        expect(s.firm.alive[f]).toBe(1);
        expect(F.place[f]).toBe(e.places[k]);
        const owner = F.owner[f];
        expect(P.role[owner]).toBe(ROLE.owner);
        expect(P.firm[owner]).toBe(f);
        expect(placeOf(s, owner)).toBe(e.places[k]);
        expect(P.agent[owner]).toBe(f - e.firm0[k]);
        expect([0, 1, 2]).toContain(F.sector[f]);
      }
    // every owner owns one firm
    const owners = new Set(Array.from(F.owner.subarray(0, s.firm.size)));
    expect(owners.size).toBe(s.firm.size);
  });
});

describe('what the engine computes', () => {
  it('is on the day of the founding the starting position: everybody but one worker a city has work, nothing is paid yet', () => {
    const by = parts(start);
    for (let k = 0; k < N; k++) {
      const without = by[k][ROLE.worker].filter((id) => start.person.cols.firm[id] < 0);
      expect(without.length).toBe(1);
      expect(figure(start, k, FIGURE.unemployed)).toBe(1);
      expect(sum(start.person.cols.wage, by[k][ROLE.worker])).toBe(0);
    }
  });
  it('is written to the persons and firms every day: their sums are the figures of the city', () => {
    for (let day = 1; day <= 45; day++) {
      advanceDay(s, w);
      expect(e.halted).toBe('');
      const by = parts(s);
      const staff = new Int32Array(s.firm.size);
      for (let k = 0; k < N; k++) {
        const workers = by[k][ROLE.worker],
          everybody = by[k].flat();
        let employed = 0;
        for (const id of workers) {
          const f = P.firm[id];
          if (f < 0) {
            expect(P.wage[id]).toBe(0);
            continue;
          }
          employed++;
          staff[f]++;
          expect(f).toBeGreaterThanOrEqual(e.firm0[k]);
          expect(f).toBeLessThan(e.firm0[k + 1]); // a firm of the person's own city
          expect(P.wage[id]).toBe(F.pay[f]);
          expect(P.wage[id]).toBeGreaterThan(0);
          expect(P.income[id]).toBeGreaterThan(0);
          expect(P.income[id]).toBeLessThan(P.wage[id]); // the wage after the tax on income
        }
        expect(employed).toBe(figure(s, k, FIGURE.employees));
        expect(workers.length - employed).toBe(figure(s, k, FIGURE.unemployed));
        expect(by[k][ROLE.owner].length + by[k][ROLE.banker].length).toBe(figure(s, k, FIGURE.owners));
        // the savings of the persons are the deposits of the households (the components hold 32 bits)
        const deposits = figure(s, k, FIGURE.depositsHouseholds);
        expect(Math.abs(sum(P.savings, everybody) - deposits)).toBeLessThan(1e-5 * Math.abs(deposits));
        // what a person spent is the port's budget less what was left of it: 0 up to the rounding of that difference
        for (const id of everybody) expect(P.spent[id]).toBeGreaterThanOrEqual(-1e-15);
      }
      for (let f = 0; f < s.firm.size; f++) {
        expect(F.employees[f]).toBe(staff[f]);
        expect(F.price[f]).toBeGreaterThan(0);
        expect(F.output[f]).toBeGreaterThanOrEqual(0);
      }
    }
    expect(e.day).toBe(45);
    // the parts stand: who dies leaves the part to a successor (src/sim/systems/deaths.ts), so every city has the
    // persons of each part it had, each with a number of their own
    const then = parts(start),
      now = parts(s);
    for (let k = 0; k < N; k++)
      for (let role = 1; role <= 4; role++) {
        expect(now[k][role].length).toBe(then[k][role].length);
        expect(now[k][role].map((id) => P.agent[id]).sort((a, b) => a - b)).toEqual(
          then[k][role].map((id) => start.person.cols.agent[id]).sort((a, b) => a - b),
        );
      }
  }, 120_000);
  it('keeps its books to the last penny with the persons of the world', () => {
    const c = w.economyEngine.checks(e.model);
    for (const x of c.cities)
      for (const off of [x.income, x.nominal, x.real, x.centralBank, x.banks])
        expect(Math.abs(off)).toBeLessThan(1e-9 * x.gdpSum);
  });
});

describe('the state', () => {
  it('holds the persons and firms: a saved world goes on as the running one', () => {
    const again = decodeState(encodeState(s));
    expect(again.v).toBe(STATE_VERSION);
    expect(hashState(again)).toBe(hashState(s));
    for (let d = 0; d < 3; d++) {
      advanceDay(again, w);
      advanceDay(s, w);
    }
    expect(hashState(again)).toBe(hashState(s));
  });
  it('of a world from before feature 10 gets them by the upgrade: the economies are founded anew on the day reached', () => {
    // version 11: the cities' economies with persons of their own, no components of the economy, no firms
    const old = decodeState(encodeState(s)) as any;
    for (const k of ['role', 'agent', 'firm', 'wage', 'income', 'spent', 'savings']) delete old.person.cols[k];
    delete old.firm;
    delete old.economy.cities.places;
    delete old.economy.cities.firm0;
    old.v = 11;
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1356));
    expect(up.v).toBe(STATE_VERSION);
    expect(Object.keys(up.person.cols)).toEqual(Object.keys(PERSON_SCHEMA));
    // step 23 founds the persons anew on the day reached, and everything that hangs on them: as it does for the world that ran
    const founded = decodeState(encodeState(s));
    founded.v = 22;
    upgradeState(founded, w, () => loadSetup(1356));
    expect(hashState(up)).toBe(hashState(founded));
    const c = up.economy.cities!;
    expect(c.day).toBe(s.day);
    expect(c.years.length).toBe(0);
    expect(c.halted).toBe('');
    for (let k = 0; k < N; k++) expect(c.figures[k * FIGURES + FIGURE.periods]).toBe(0);
    // the persons are new ones (step 23), all alive, and those of them who work are of working age on the day reached
    let working = 0;
    for (let id = 0; id < up.person.size; id++) {
      expect(up.person.cols.died[id]).toBe(ALIVE);
      const r = up.person.cols.role[id];
      if (r !== ROLE.none && r !== ROLE.idle) {
        working++;
        expect(ageOn(up.person.cols.born[id], up.day)).toBeGreaterThanOrEqual(WORKING_AGE);
      }
    }
    expect(working).toBeGreaterThan(10_000);
    advanceDay(up, w);
    expect(up.economy.cities!.figures[FIGURE.periods]).toBe(1);
    expect(up.economy.cities!.halted).toBe('');
  }, 60_000);
});

describe('a world of 1291', () => {
  const x = newWorldState(1291, 1291).s;
  it('has an economy in every place with a town, with the persons who live there', () => {
    const c = x.economy.cities!;
    expect(c.places.length).toBe(550);
    expect(Array.from(c.places)).toEqual(cityPlaces(1291).map((p) => p.place));
    const by = parts(x); // throws for a person with a part outside the cities
    for (let k = 0; k < c.places.length; k++) {
      expect(by[k][ROLE.worker].length).toBeGreaterThanOrEqual(k < 30 ? 50 : 3); // a small town: one employee per sector at least
      expect(by[k][ROLE.owner].length).toBe(c.firm0[k + 1] - c.firm0[k]);
      expect(by[k][ROLE.banker].length).toBe(1);
      expect(by[k][ROLE.idle].length).toBe(1);
    }
  });
});

describe('a person', () => {
  const by = parts(s)[0];
  it('is given by the server with the part in the economy', () => {
    const worker = by[ROLE.worker].find((id) => P.firm[id] >= 0)!,
      d = personDetail(s, worker, () => 'x')!.economy!;
    expect(d.role).toBe('worker');
    expect(d.firm).toBe(P.firm[worker]);
    expect(d.firmOwner).toBe(F.owner[d.firm]);
    expect(d.employees).toBe(F.employees[d.firm]);
    expect(d.sector).toBe(F.sector[d.firm]);
    expect(d.wage).toBe(P.wage[worker]);
    expect(d.income).toBe(P.income[worker]);
    expect(d.savings).toBe(P.savings[worker]);
    expect(personEconomy(s, by[ROLE.owner][0])!.role).toBe('owner');
    expect(personEconomy(s, F.owner[d.firm])!.firm).toBe(d.firm);
    expect(personEconomy(s, by[ROLE.banker][0])).toMatchObject({ role: 'banker', firm: -1 });
    // the model's person who does not work, a child and an adult without a part are all "not working"
    expect(personEconomy(s, by[ROLE.idle][0])).toMatchObject({ role: 'none', firm: -1 });
    const child = Array.from({ length: s.person.size }, (_, id) => id).find(
      (id) => ageOn(P.born[id], s.day) < WORKING_AGE,
    )!;
    expect(personEconomy(s, child)).toEqual({
      role: 'none',
      firm: -1,
      sector: -1,
      firmOwner: -1,
      employees: 0,
      wage: 0,
      income: 0,
      spent: 0,
      savings: 0,
    });
  });
  it('has no part in a world without economies', () => {
    const none = decodeState(encodeState(s));
    none.economy = { cities: null };
    expect(personDetail(none, 0, () => 'x')!.economy).toBeNull();
    expect(economyRows(personDetail(none, 0, () => 'x')!)).toEqual([]);
  });
  it('is shown in the panel with work, wage, income, spending and savings', () => {
    const worker = by[ROLE.worker].find((id) => P.firm[id] >= 0)!,
      d = personDetail(s, worker, () => 'x')!;
    const rows = economyRows(d);
    expect(rows.map((r) => r[0])).toEqual([
      'Erwerb',
      'Betrieb',
      'Beschäftigte im Betrieb',
      'Lohn am Tag',
      'Einkommen am Tag',
      'Ausgaben am Tag',
      'Erspartes',
    ]);
    expect(rows[0][1]).toBe(d.female ? 'Arbeiterin' : 'Arbeiter');
    expect(['Landwirtschaft', 'Gewerbe', 'Dienste']).toContain(rows[1][1]);
    expect(rows[2][1]).toBe(String(d.economy!.employees));
    expect(rows[3][1]).toBe(pence(d.economy!.wage));
    expect(economyRows(personDetail(s, by[ROLE.owner][0], () => 'x')!)[0]).toEqual(['Erwerb', 'führt einen Betrieb']);
    expect(economyRows(personDetail(s, by[ROLE.banker][0], () => 'x')!)[0]).toEqual([
      'Erwerb',
      'führt die Bank der Stadt',
    ]);
    expect(economyRows(personDetail(s, by[ROLE.idle][0], () => 'x')!)).toEqual([['Erwerb', 'nicht erwerbstätig']]);
    const out = { ...d, economy: { ...d.economy!, firm: -1, wage: 0 } };
    expect(economyRows(out)[0]).toEqual(['Erwerb', 'ohne Arbeit']);
  });
  it('has its money written in pence, and in pounds, shillings and pence', () => {
    expect(pence(2.1 / 240)).toBe('2,1 d');
    expect(lsd(1 + 3 / 20 + 4 / 240)).toBe('£ 1 3 s 4 d');
    expect(lsd(5 / 240)).toBe('5 d');
    expect(lsd(30 / 240)).toBe('2 s 6 d');
  });
});
