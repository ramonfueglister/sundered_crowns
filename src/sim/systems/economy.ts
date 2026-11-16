// The cities as economies of their own that trade with each other: features 3 to 5 of the economy
// (docs/ECONOMY_DESIGN.md).
//
// Every place with one of the 30 largest cities is a whole economy, computed by the unchanged port of BeforeIT.jl,
// the agent-based model of Poledna, Miess, Hommes and Rabitsch (2023, European Economic Review 151): persons, firms,
// a bank, the crown and the rest of the world, each with a balance sheet, meeting on the markets for credit, labour
// and goods (online appendix A.1 to A.84). The rest of the world of a city is the other cities: merchants buy in one
// city and sell in the others, and neither goods nor money come from nowhere (economy/src/trade.rs). No rule is
// written here. This system only decides when the engine computes: one period of the model is one day of the game.
// Every day goods are made and bought, wages are paid and the books are closed; a firm sets its supply and its price
// on its own plan day, every 30 days (economy/src/clock.rs). The figures of a city are sums over the last 365 days.
//
// Every city is calibrated as England in 1356 at the city's share of England's people (data/economy/england_1356.json,
// tools/sim/calibrate_economy.ts) and computes at the scale 1:100. The economies are not connected to anything else
// in the world yet: not to the harvest, the arable or the persons of the cities, and nothing a player does reaches
// them. Places without a city have no economy. The year has 365 equal days: no seasons.
import type { System } from '../schedule';
import type { CityEconomies, WorldState } from '../state';
import type { World } from '../world';
import { FIGURE, FIGURES } from '../economy/engine';
import { dateToDay, dayToDate, fmtDate } from '../calendar';
import { hash01 } from '../rng';

/** Numbers of a row of `CityEconomies.years` in a world with `cities` cities: the year, then the key figures of
 *  every city at its end. */
export const yearRow = (cities: number): number => 1 + cities * FIGURES;

/** The seed of the random numbers of the city in `place`, from the seed of the world: 53 bits. */
export function citySeed(seed: number, place: number): number {
  const u32 = (k: number) => Math.floor(hash01(seed, place, k) * 0x100000000);
  return (u32(1) % 0x200000) * 0x100000000 + u32(2);
}

/** Founds the economies of the cities in a world that starts in the year of their calibration: the starting
 *  position of every city on the day the world has reached, with no period computed. The random numbers of a city
 *  come from the seed of the world and the city's place, through the engine's own generator. */
export function foundEconomy(s: WorldState, w: World): void {
  const c = w.cityEconomies;
  if (s.startYear !== c.year) { s.economy = { cities: null }; return; }
  const model = w.economyEngine.create(c.cities.map((x) => ({ parameters: x.parameters, initialConditions: x.initialConditions, seed: citySeed(s.seed, x.place) })), c.clock, c.rules);
  s.economy = { cities: { day: s.day, model, figures: w.economyEngine.figures(model), years: new Float64Array(0), halted: '' } };
}

/** Computes `days` periods from the state of the economies. A period the engine cannot compute, or one that ends
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
  }
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
