// England as one national economy: features 3 and 4 of the economy (docs/ECONOMY_DESIGN.md, where every source is
// listed).
//
// The economy is computed by the unchanged port of BeforeIT.jl, the agent-based model of Poledna, Miess, Hommes and
// Rabitsch (2023, European Economic Review 151): persons, firms, a bank, the crown and the rest of the world, each
// with a balance sheet, meeting on the markets for credit, labour and goods (online appendix A.1 to A.84). No rule is
// written here. This system only decides when the engine computes: one period of the model is one day of the game
// (feature 4). Every day goods are made and bought, wages are paid and the books are closed; a firm sets its supply
// and its price on its own plan day, every 30 days (economy/src/clock.rs). The figures are sums over the last 365
// days.
//
// The model is calibrated on England in 1356 (data/economy/england_1356.json, tools/sim/calibrate_economy.ts) and
// computes at the scale 1:100. It is not connected to anything else in the world yet: not to the harvest, the
// arable or the people of the places, and nothing a player does reaches it. Its year has 365 equal days: no seasons.
import type { System } from '../schedule';
import type { NationalEconomy, WorldState } from '../state';
import type { World } from '../world';
import { FIGURE, FIGURES } from '../economy/engine';
import { dateToDay, dayToDate, fmtDate } from '../calendar';

/** Numbers of a row of `NationalEconomy.years`: the year, then the key figures at its end. */
export const YEAR_ROW = 1 + FIGURES;

/** Founds England's economy in a world that starts in the year of the calibration: the starting position, with no
 *  period computed. Its random numbers come from the seed of the world, through the engine's own generator. */
export function foundEconomy(s: WorldState, w: World): void {
  const c = w.englandEconomy;
  if (s.startYear !== c.year) { s.economy = { england: null }; return; }
  const model = w.economyEngine.create(c.parameters, c.initialConditions, s.seed, c.clock);
  s.economy = { england: { day: 0, model, figures: w.economyEngine.figures(model), years: new Float64Array(0), halted: '' } };
}

/** Computes `days` periods from the state of the economy. A period the engine cannot compute, or one that ends
 *  without a GDP, stops the economy: the state of the day before stays, with the reason. (The world itself goes on;
 *  the same state always stops in the same way.) */
function compute(e: NationalEconomy, s: WorldState, w: World, days: number): void {
  try {
    const model = w.economyEngine.step(e.model, days), figures = w.economyEngine.figures(model);
    if (!Number.isFinite(figures[FIGURE.realGdp]) || !Number.isFinite(figures[FIGURE.nominalGdp])) throw new Error('the day ended without a GDP (not a number)');
    e.figures = figures; e.model = model; e.day += days;
  } catch (err) {
    // several days at once: day by day, to stop on the day that fails
    if (days > 1) { for (let k = 0; k < days && !e.halted; k++) compute(e, s, w, 1); return; }
    e.halted = `${fmtDate(e.day + 1, s.startYear)}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** Computes the economy up to the day `day` of the world: one period for each day. Before the first day of a year
 *  is computed, the figures of the year that has ended are kept as a row of `years`. Many days at once (a world
 *  saved before the daily clock, src/sim/upgrade.ts) give what the same days give one by one. */
export function computeTo(s: WorldState, w: World, day: number): void {
  const e = s.economy.england;
  if (!e) return;
  while (e.day < day && !e.halted) {
    const next = dayToDate(e.day + 1, s.startYear);
    if (next.m === 0 && next.d === 1) {
      const years = new Float64Array(e.years.length + YEAR_ROW);
      years.set(e.years); years[e.years.length] = next.y - 1; years.set(e.figures, e.years.length + 1);
      e.years = years;
    }
    const lastOfYear = dateToDay(next.y + 1, 0, 1, s.startYear) - 1;
    compute(e, s, w, Math.min(day, lastOfYear) - e.day);
  }
}

/** One period a day. */
export const nationalEconomy: System = {
  id: 'economy',
  run(s, w, t) { computeTo(s, w, t.day); },
};
