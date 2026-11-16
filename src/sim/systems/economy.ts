// England as one national economy: feature 3 of the economy (docs/ECONOMY_DESIGN.md, where every source is listed).
//
// The economy is computed by the unchanged port of BeforeIT.jl, the agent-based model of Poledna, Miess, Hommes and
// Rabitsch (2023, European Economic Review 151): persons, firms, a bank, the crown and the rest of the world, each
// with a balance sheet, meeting on the markets for credit, labour and goods (online appendix A.1 to A.84). No rule is
// written here. This system only decides when the engine computes: one period of the model is one year of the game,
// computed on the first day of the year, and the figures stand for that year.
//
// The model is calibrated on England in 1356 (data/economy/england_1356.json, tools/sim/calibrate_economy.ts) and
// computes at the scale 1:100. It is not connected to anything else in the world yet: not to the harvest, the
// arable or the people of the places, and nothing a player does reaches it.
import type { System } from '../schedule';
import type { WorldState } from '../state';
import type { World } from '../world';
import { FIGURE } from '../economy/engine';
import { uses1356Tables } from '../tables';

/** Founds England's economy in a world that starts in the year of the calibration: the starting position, with no
 *  period computed. Its random numbers come from the seed of the world, through the engine's own generator. */
export function foundEconomy(s: WorldState, w: World): void {
  const c = w.englandEconomy;
  if (s.startYear !== c.year && !(c.year === 1356 && uses1356Tables(s.startYear))) { s.economy = { england: null }; return; }
  const model = w.economyEngine.create(c.parameters, c.initialConditions, s.seed);
  s.economy = { england: { year: s.startYear, model, figures: w.economyEngine.figures(model), halted: '' } };
}

/** Computes one period for the year `year`. A period the engine cannot compute, or one that ends without a GDP,
 *  stops the economy: the state of the year before stays, with the reason. (The world itself goes on; the same
 *  state always stops in the same way.) */
export function computeYear(s: WorldState, w: World, year: number): void {
  const e = s.economy.england;
  if (!e || e.halted) return;
  try {
    const model = w.economyEngine.step(e.model, 1), figures = w.economyEngine.figures(model);
    if (!Number.isFinite(figures[FIGURE.realGdp]) || !Number.isFinite(figures[FIGURE.nominalGdp])) throw new Error('the period ended without a GDP (not a number)');
    e.figures = figures; e.model = model; e.year = year;
  } catch (err) {
    e.halted = `${year}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** One period a year, on the first day of the year. */
export const nationalEconomy: System = {
  id: 'economy',
  run(s, w, t) { if (t.newYear) computeYear(s, w, t.date.y); },
};
