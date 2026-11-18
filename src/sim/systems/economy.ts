// The cities as economies of their own that trade with each other: features 3 to 11 of the economy
// (docs/ECONOMY_DESIGN.md).
//
// Every place with one of the 30 largest cities of the start year is a whole economy, computed by the unchanged port
// of BeforeIT.jl, the agent-based model of Poledna, Miess, Hommes and Rabitsch (2023, European Economic Review 151):
// persons, firms, a bank, the crown and the rest of the world, each with a balance sheet, meeting on the markets for
// credit, labour and goods (online appendix A.1 to A.84). The rest of the world of a city is the other cities:
// merchants buy in one city and sell in the others, and neither goods nor money come from nowhere
// (economy/src/trade.rs). No rule is written here. This system decides when the engine computes: one period of the
// model is one day of the game. Every day goods are made and bought, wages are paid and the books are closed; a firm
// sets its supply and its price on its own plan day, every 30 days (economy/src/clock.rs). The figures of a city are
// sums over the last 365 days.
//
// The persons of a city's economy are the persons of the city (economy feature 10): who works is a person of the
// model (src/sim/systems/work.ts), a worker, the owner of a firm or the owner of the bank, and every firm is an
// entity of the world. So a city is calibrated when its economy is founded: as England in 1356 at the city's share
// of England's people (data/economy/england_1356.json, src/sim/economy/calibration.ts), with as many active persons
// as the city has persons who work. The engine computes; after every day this system writes what it computed for
// every person and every firm into their components, where everything else reads it. The engine's lists stay the
// place where the amounts are computed: a component is a copy of the day. From the persons the purse of every
// family follows (economy feature 11, src/sim/systems/household.ts).
//
// The economies are not connected to anything else in the world yet: not to the harvest or the arable, and nothing a
// player does reaches them. Places without a city have no economy. The year has 365 equal days: no seasons.
import type { System } from '../schedule';
import type { CityEconomies, WorldState } from '../state';
import { FIRM_SCHEMA } from '../state';
import type { World } from '../world';
import { createTable, spawn } from '../ecs';
import { AGENT, FIGURE, FIGURES, type CitySetup } from '../economy/engine';
import { activePersons, cityTable, dailyCalibration, type EconomyCalibration } from '../economy/calibration';
import { citiesOf } from '../content/cities';
import { cityRoutes } from '../economy/routes';
import { dateToDay, dayToDate, fmtDate } from '../calendar';
import { hash01 } from '../rng';
import { uses1356Tables } from '../tables';
import { ROLE, workforce } from './work';
import { writeHouseholds } from './household';

/** Numbers of a row of `CityEconomies.years` in a world with `cities` cities: the year, then the key figures of
 *  every city at its end. */
export const yearRow = (cities: number): number => 1 + cities * FIGURES;

/** The seed of the random numbers of the city in `place`, from the seed of the world: 53 bits. */
export function citySeed(seed: number, place: number): number {
  const u32 = (k: number) => Math.floor(hash01(seed, place, k) * 0x100000000);
  return (u32(1) % 0x200000) * 0x100000000 + u32(2);
}

/** The places that have a city in a world that starts in `year`, in the order of its list of cities, each with its
 *  name and the real people of its cities (several cities of the list may lie in one place: they are one economy). */
export function cityPlaces(year: number): { place: number; name: string; people: number }[] {
  const out: { place: number; name: string; people: number }[] = [];
  for (const c of citiesOf(year)) {
    const at = out.find((x) => x.place === c.place);
    if (at) at.people += c.people; else out.push({ place: c.place, name: c.placeName, people: c.people });
  }
  return out;
}

/** The number of the city of a place in the economies of a world, −1 for a place without one. */
export const cityAt = (e: CityEconomies, place: number): number => e.places.indexOf(place);

/** What the economy of each city of a world is founded from: its place, its people, its persons who work
 *  (src/sim/systems/work.ts) and its calibration, which has as many active persons as the city has persons who
 *  work. A world whose start year has no cities, or no calibration table, has none. */
export function cityCalibrations(s: WorldState, w: World): { place: number; name: string; people: number; working: number[]; idle: number; calibration: EconomyCalibration }[] {
  const c = w.cityEconomies;
  if (s.startYear !== c.year && !(c.year === 1356 && uses1356Tables(s.startYear))) return [];
  const cities = cityPlaces(s.startYear);
  const force = workforce(s, cities.map((x) => x.place), c.table.inputs.participation.value);
  return cities.map((x, k) => {
    const { working, idle } = force[k];
    if (idle < 0) throw new Error(`every adult of ${x.name} works: the model needs a person who does not`);
    const calibration = dailyCalibration(cityTable(c.table, x.people, working.length));
    if (activePersons(calibration) !== working.length) throw new Error(`${x.name} has ${working.length} persons who work, its calibration ${activePersons(calibration)} active persons`);
    return { ...x, working, idle, calibration };
  });
}

/** Founds the economies of the cities of a world on the day it has reached: the starting position of every city,
 *  with no period computed. Who works becomes a person of the model: the first of them (in the order of
 *  src/sim/systems/work.ts) own the firms, the next owns the bank, the others are the workers, each in the order of
 *  the engine's list; one adult who does not work is the model's person who is not active. Every firm becomes an
 *  entity. The random numbers of a city come from the seed of the world and the city's place, through the engine's
 *  own generator. A world without cities or without a calibration for its start year (src/sim/tables.ts) has no
 *  economies, no firms, and no person has a part. */
export function foundEconomy(s: WorldState, w: World): void {
  const P = s.person.cols, c = w.cityEconomies;
  s.firm = createTable(FIRM_SCHEMA, 4096);
  P.role.fill(0); P.agent.fill(0); P.firm.fill(-1); P.wage.fill(0); P.income.fill(0); P.spent.fill(0); P.savings.fill(0);
  const cities = cityCalibrations(s, w);
  if (cities.length === 0) { s.economy = { cities: null }; writeHouseholds(s, w); return; }
  const F = s.firm.cols, firm0 = new Int32Array(cities.length + 1), setups: CitySetup[] = [];
  cities.forEach((x, k) => {
    const p = x.calibration.parameters as { I_s: number[]; H_inact: number };
    const firms = p.I_s.reduce((a, b) => a + b, 0);
    if (p.H_inact !== 1) throw new Error(`the calibration of ${x.name} has ${p.H_inact} persons who are not active, the world gives it one`);
    firm0[k] = s.firm.size;
    x.working.forEach((id, n) => {
      if (n < firms) { const f = spawn(s.firm); F.place[f] = x.place; F.owner[f] = id; P.role[id] = ROLE.owner; P.agent[id] = n; P.firm[id] = f; }
      else if (n === firms) { P.role[id] = ROLE.banker; P.agent[id] = 0; }
      else { P.role[id] = ROLE.worker; P.agent[id] = n - firms - 1; }
    });
    P.role[x.idle] = ROLE.idle; P.agent[x.idle] = 0;
    setups.push({ parameters: JSON.stringify(x.calibration.parameters), initialConditions: JSON.stringify(x.calibration.initial_conditions), seed: citySeed(s.seed, x.place) });
  });
  firm0[cities.length] = s.firm.size;
  const places = cities.map((x) => x.place);
  const model = w.economyEngine.routes(w.economyEngine.create(setups, c.clock, c.rules), cityRoutes(w, places, c.table, w.ways));
  s.economy = { cities: { day: s.day, model, figures: w.economyEngine.figures(model), years: new Float64Array(0), halted: '', places: Int32Array.from(cities, (x) => x.place), firm0 } };
  writeAgents(s, w);
}

/** Writes what the engine has computed for every person and every firm into their components: the employer, the
 *  wage, the income, the spending and the savings of a person, and the sector, the employees, the output, the price
 *  and the pay of a firm; then the purse of every family from its persons. The lists of the engine and the persons
 *  and firms of the world must fit one to one. */
export function writeAgents(s: WorldState, w: World): void {
  const e = s.economy.cities;
  if (!e) return;
  const a = w.economyEngine.agents(e.model), A = AGENT, P = s.person.cols, F = s.firm.cols, Fam = s.family.cols, N = e.places.length;
  // where the rows of each city start, and how many persons of each part it has
  const workers = new Int32Array(N), firms = new Int32Array(N), bank = new Int32Array(N), idle = new Int32Array(N), count = new Int32Array(4 * N);
  let at = 0;
  for (let k = 0; k < N; k++) {
    const [nW, nF, nB, nX] = a.subarray(at, at + A.counts);
    if (nF !== e.firm0[k + 1] - e.firm0[k] || nB !== 1 || nX !== 1) throw new Error(`city ${k} of the engine has ${nF} firms, ${nB} banks and ${nX} persons who do not work: the world has ${e.firm0[k + 1] - e.firm0[k]} firms, one bank and one such person`);
    workers[k] = at + A.counts; firms[k] = workers[k] + A.worker * nW; bank[k] = firms[k] + A.firm * nF; idle[k] = bank[k] + A.person * nB;
    count[4 * k + ROLE.worker - 1] = nW; count[4 * k + ROLE.owner - 1] = nF; count[4 * k + ROLE.banker - 1] = nB; count[4 * k + ROLE.idle - 1] = nX;
    at = idle[k] + A.person * nX;
    for (let i = 0; i < nF; i++) {
      const f = e.firm0[k] + i, r = firms[k] + A.firm * i;
      F.sector[f] = a[r + A.sector]; F.employees[f] = a[r + A.employees]; F.output[f] = a[r + A.production]; F.price[f] = a[r + A.price]; F.pay[f] = a[r + A.pay];
    }
  }
  if (at !== a.length) throw new Error(`the engine gave ${a.length} numbers for the persons and firms of the cities, ${at} were read`);
  const cityOf = new Map<number, number>(Array.from(e.places, (p, k) => [p, k]));
  const seen = new Int32Array(4 * N);
  for (let id = 0; id < s.person.size; id++) {
    const role = P.role[id];
    if (!role || !s.person.alive[id]) continue;
    const k = cityOf.get(Fam.place[P.family[id]]), n = P.agent[id];
    if (k === undefined || n < 0 || n >= count[4 * k + role - 1]) throw new Error(`person ${id} is number ${n} of part ${role} in a city that has no such person`);
    seen[4 * k + role - 1]++;
    let r: number; // the row of income, deposits, consumption
    if (role === ROLE.worker) {
      const row = workers[k] + A.worker * n, employer = a[row + A.employer];
      P.firm[id] = employer < 0 ? -1 : e.firm0[k] + employer; P.wage[id] = a[row + A.wage];
      r = row + A.income;
    } else if (role === ROLE.owner) r = firms[k] + A.firm * n + A.owner;
    else r = (role === ROLE.banker ? bank[k] : idle[k]) + A.person * n;
    P.income[id] = a[r]; P.savings[id] = a[r + 1]; P.spent[id] = a[r + 2];
  }
  for (let i = 0; i < seen.length; i++) if (seen[i] !== count[i]) throw new Error(`city ${i >> 2} has ${seen[i]} persons of part ${(i & 3) + 1}, the engine ${count[i]}`);
  writeHouseholds(s, w);
}

/** Computes `days` periods from the state of the economies and writes the persons and firms. A period the engine cannot compute, or one that ends
 *  without a GDP in a city, stops the economies: the state of the day before stays, with the reason. (The world
 *  itself goes on; the same state always stops in the same way.) */
function compute(e: CityEconomies, s: WorldState, w: World, days: number): void {
  try {
    const model = w.economyEngine.step(e.model, days), figures = w.economyEngine.figures(model);
    for (let k = 0; k < figures.length; k += FIGURES) {
      if (!Number.isFinite(figures[k + FIGURE.realGdp]) || !Number.isFinite(figures[k + FIGURE.nominalGdp])) throw new Error('the day ended without a GDP (not a number)');
    }
    e.figures = figures; e.model = model; e.day += days;
  } catch (err) {
    // several days at once: day by day, to stop on the day that fails
    if (days > 1) { for (let k = 0; k < days && !e.halted; k++) compute(e, s, w, 1); return; }
    e.halted = `${fmtDate(e.day + 1, s.startYear)}: ${err instanceof Error ? err.message : String(err)}`;
    return;
  }
  writeAgents(s, w); // the persons and firms of the world as the engine has them after these days
}

/** Computes the economies up to the day `day` of the world: one period for each day. Before the first day of a year
 *  is computed, the figures of the year that has ended are kept as a row of `years`. Many days at once give what the
 *  same days give one by one. */
export function computeTo(s: WorldState, w: World, day: number): void {
  const e = s.economy.cities;
  if (!e) return;
  while (e.day < day && !e.halted) {
    const next = dayToDate(e.day + 1, s.startYear);
    if (next.m === 0 && next.d === 1) {
      const years = new Float64Array(e.years.length + 1 + e.figures.length);
      years.set(e.years); years[e.years.length] = next.y - 1; years.set(e.figures, e.years.length + 1);
      e.years = years;
    }
    const lastOfYear = dateToDay(next.y + 1, 0, 1, s.startYear) - 1;
    compute(e, s, w, Math.min(day, lastOfYear) - e.day);
  }
}

/** One period a day. */
export const cityEconomies: System = {
  id: 'economy',
  run(s, w, t) { computeTo(s, w, t.day); },
};
