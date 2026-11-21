// The economy engine: the unchanged port of BeforeIT.jl (the agent-based model of Poledna, Miess, Hommes and
// Rabitsch 2023), built to WebAssembly from the shell in economy/ (docs/ECONOMY_DESIGN.md, features 3 to 5).
// It computes cities: every city is a whole economy of the port, one period is one day (economy/src/clock.rs), and
// the rest of the world of a city is the other cities, through the merchants between them (economy/src/trade.rs).
//
// What a call gives depends on its arguments alone. The state of the cities is a sequence of bytes that lives in the
// state of the world (src/sim/state.ts); a call takes the bytes and gives new ones. So a period is a function of the
// state alone, like every other system, and the snapshot of a world holds all its economies. (The engine remembers
// the cities of the bytes it handed out last and uses them for exactly those bytes, to save decoding them every day.)
import { absencesInput, citiesInput, contractsInput, routesInput, workingDaysInput } from './engine_inputs';

/** The key figures of a city, in the order of `Economy::figures` (economy/src/lib.rs). Amounts are in the units
 *  of the calibration; "real" means at the prices of the starting position. Flows (GDP and its uses) are sums over
 *  the last window of the clock, a year of 365 days; the starting position stands for the days before the start. */
export const FIGURE = {
  /** periods (days) computed since the starting position */
  periods: 0,
  realGdp: 1,
  realGdpStart: 2,
  nominalGdp: 3,
  nominalGdpStart: 4,
  /** real consumption of households, real purchases of the government, real fixed capital formation (firms and dwellings) */
  consumption: 5,
  government: 6,
  investment: 7,
  /** real exports including the export duty (what the merchants bought in the city), real imports (what they sold) */
  exports: 8,
  imports: 9,
  /** persons with an employer, owners of firms and of the bank, workers without an employer */
  employees: 10,
  owners: 11,
  unemployed: 12,
  /** deposits of all households, deposits of the firms */
  depositsHouseholds: 13,
  depositsFirms: 14,
  /** the price level of the last period: the mean price of the firms weighted by their output, 1 at the start */
  priceLevel: 15,
} as const;
export const FIGURES = 16;

/** The persons and firms of a city one by one, as `Economy::agents` gives them (economy/src/lib.rs, economy feature
 *  10): four counts (workers, firms, banks, persons who do not work), then for every worker `AGENT.worker` numbers,
 *  for every firm `AGENT.firm`, for the owner of every bank and every person who does not work `AGENT.person`.
 *  Amounts of money are in the units of the calibration; flows are those of the last period, a day. */
export const AGENT = {
  counts: 4,
  /** a worker: the firm that employs the person (its position among the firms of the city, −1 without work), the
   *  wage in money of the day before tax, the disposable income, the deposits, the money spent on consumption */
  worker: 5,
  employer: 0,
  wage: 1,
  income: 2,
  deposits: 3,
  consumption: 4,
  /** a firm: its sector, its employees, its production, its price, the wage in money it pays a person for the day,
   *  then the income, the deposits and the consumption of its owner */
  firm: 8,
  sector: 0,
  employees: 1,
  production: 2,
  price: 3,
  pay: 4,
  owner: 5,
  /** the owner of a bank or a person who does not work: income, deposits, consumption */
  person: 3,
} as const;

/** The two lengths of the daily clock in periods: a firm plans every `plan` periods, expectations are formed on
 *  windows of `window` periods. With 1 and 1 the engine computes the port as it is. */
export interface EconomyClock {
  plan: number;
  window: number;
}
/** How the firms pay wages (economy feature 7, economy/src/clock.rs): 'prices' is the port's rule, a real wage that
 *  never changes, paid times the consumer price level; 'money' is a wage in money that never changes. */
export type EconomyWage = 'prices' | 'money';
/** How a planning firm sets its supply and its price (economy feature 8, economy/src/clock.rs): 'costs' is the rule
 *  of the paper (supply = the demand it met, price by costs and expected inflation); 'demand' is the demand pull of
 *  CANVAS (supply or price changes by the gap between the demand it met and the supply it had planned). */
export type EconomyPrices = 'costs' | 'demand';
/** What the crown of a city buys with (economy feature 16, economy/src/clock.rs): 'series' is the rule of the paper,
 *  purchases that follow their own random series whatever the crown takes in; 'revenue': the crown's budget of a
 *  period is what it took in the period before, less the benefits and the interest it paid then. */
type EconomyCrown = 'series' | 'revenue';
/** Who gets what a firm earns (economy feature 18, economy/src/clock.rs): 'paper' is the rule of the paper, the owner
 *  is paid the profit with the unsold stock at its price and bears no loss; 'household': firm and owner are one
 *  household, the owner's income is the firm's profit without the change of its stock, of either sign. */
type EconomyOwner = 'paper' | 'household';
/** The rules of the cities that the calibration chooses. `savings`: the share of what a household holds above its
 *  target that it spends per period (economy feature 15, economy/src/clock.rs); 0 is the port's rule, a household
 *  that spends out of its income only. */
export interface EconomyRules {
  wage: EconomyWage;
  prices: EconomyPrices;
  savings: number;
  crown: EconomyCrown;
  owner: EconomyOwner;
}

/** The working days of the firms and households of a city (economy feature 19, economy/src/clock.rs `Attendance`)
 *  for its next `days` periods: per calendar and kind of day the factor of the flows of a firm or a household on such
 *  a day (`kinds` numbers a calendar), per calendar the kind of each of the days (`days` numbers a calendar), the
 *  calendar of every firm (and of its owner), and of every other household: the workers, the persons who do not work
 *  and the owners of the bank, in the engine's order. */
export interface CityWorkingDays {
  days: number;
  kinds: number;
  factor: Float64Array;
  day: Uint8Array;
  calendar: Uint8Array;
  household: Uint8Array;
}
/** The workers of a city who are away (economy feature 22): per absence the worker (the position in the engine's list
 *  of workers), the first and the last day of the absence, counted from 0 for the next period, and 1 if an adult of
 *  the worker's family stands in on those days, else 0 (economy feature 24). */
export interface CityAbsences {
  worker: Uint32Array;
  first: Uint32Array;
  last: Uint32Array;
  family: Uint8Array;
}
/** The distance between the cities (economy feature 17): the days of travel and the labour of carrying per pair of
 *  the `cities` cities, the weight of every product, and the elasticity of the stock to keep. */
export interface EconomyRoutes {
  cities: number;
  days: Uint32Array;
  labour: Float64Array;
  weight: readonly number[];
  elasticity: number;
}
/** What the engine is given for a city: the port's parameters and initial conditions (JSON text) and the seed of
 *  the city's random numbers. */
export interface CitySetup {
  parameters: string;
  initialConditions: string;
  seed: number;
}

/** The accounting identities of a city (`Economy::checks`): each of the first five is 0 up to rounding; `gdpSum`
 *  is the amount to judge them by. */
interface CityChecks {
  income: number;
  nominal: number;
  real: number;
  centralBank: number;
  banks: number;
  gdpSum: number;
}
/** What must be 0 in a state: the identities of every city, and the books of the merchants (`Cities::checks`): the
 *  change of their worth, then for every product the goods neither in stock nor sold, each with the amount to judge
 *  it by. */
interface EconomyChecks {
  cities: CityChecks[];
  merchants: { off: number; scale: number }[];
}

/** The state of the economies after `advance`: kept inside the engine, written as bytes only when they are asked for
 *  (a snapshot, a hash). Writing the 50 MB of a world's economies every day took as long as computing the day. */
export interface KeptEconomy {
  bytes(): Uint8Array;
}
/** A state as the engine takes it: its bytes, or the state it keeps. */
export type EconomyState = Uint8Array | KeptEconomy;

export interface EconomyEngine {
  /** New cities that trade with each other, with the clock and the rules of their firms: their state. */
  create(cities: readonly CitySetup[], clock: EconomyClock, rules: EconomyRules): Uint8Array;
  /** The cities of a state that has not computed a period, with distance between them (economy feature 17). */
  routes(state: Uint8Array, routes: EconomyRoutes): Uint8Array;
  /** The cities of a state with the working days of their firms from their next period on (economy feature 19), one
   *  entry per city in their order. */
  workingDays(state: EconomyState, cities: readonly CityWorkingDays[]): Uint8Array;
  /** The cities of a state with the workers who are away from their next period on (economy feature 22), one entry
   *  per city in their order; they take the place of the absences the cities had. */
  absences(state: EconomyState, cities: readonly CityAbsences[]): Uint8Array;
  /** The cities of a state with their contracts from their next period on (economy feature 23): per city the workers
   *  who work by the day (positions in the engine's list of workers); every other worker serves by the year. They
   *  take the place of the contracts the cities had. */
  contracts(state: EconomyState, byTheDay: readonly Uint32Array[]): Uint8Array;
  /** Of the state the engine computed last, per city the workers away from firms that worked in its last period,
   *  those of their families who stood in for them and the workers without work who stood in for them (economy
   *  features 23 and 24): three numbers a city. A measure for the tools; no rule reads it. */
  standIns(): Float64Array;
  /** The state after `periods` more periods. */
  step(state: EconomyState, periods: number): Uint8Array;
  /** The state after `periods` more periods, kept inside the engine: the same state as `step` gives, without
   *  writing its bytes until they are asked for. */
  advance(state: EconomyState, periods: number): KeptEconomy;
  /** The key figures of every city, `FIGURES` numbers a city in the order of the cities. */
  figures(state: EconomyState): Float64Array;
  checks(state: EconomyState): EconomyChecks;
  /** The persons and firms of every city one by one (`AGENT`), one city after the other. */
  agents(state: EconomyState): Float64Array;
}

interface Exports {
  memory: WebAssembly.Memory;
  sce_alloc(len: number): number;
  sce_free(ptr: number, len: number): void;
  sce_create(
    list: number,
    len: number,
    plan: number,
    window: number,
    wage: number,
    prices: number,
    savings: number,
    crown: number,
    owner: number,
  ): number;
  sce_routes(state: number, len: number, routes: number, routesLen: number): number;
  sce_working_days(state: number, len: number, days: number, daysLen: number): number;
  sce_absences(state: number, len: number, list: number, listLen: number): number;
  sce_contracts(state: number, len: number, list: number, listLen: number): number;
  sce_stand_ins_last(): number;
  sce_step(state: number, len: number, periods: number): number;
  sce_figures(state: number, len: number): number;
  sce_checks(state: number, len: number): number;
  sce_agents(state: number, len: number): number;
  sce_step_last(periods: number): number;
  sce_figures_last(): number;
  sce_agents_last(): number;
  sce_advance_last(periods: number): number;
  sce_save_last(): number;
  sce_out_ptr(): number;
  sce_out_len(): number;
  sce_panic_ptr(): number;
  sce_panic_len(): number;
}

/** The engine from the bytes of the WebAssembly file (build/economy/sc_economy.wasm, see tools/sim/load.ts). */
export function wasmEconomyEngine(wasm: Uint8Array): EconomyEngine {
  const module = new WebAssembly.Module(wasm as BufferSource);
  let x: Exports | null = null;
  const instance = (): Exports => (x ??= new WebAssembly.Instance(module, {}).exports as unknown as Exports);
  /** The state the instance handed out last and keeps beside it (economy/src/abi/last.rs `LAST`). Given this very
   *  array again (the world computes day after day), the instance takes the state it keeps instead of being given the
   *  bytes: copying the state of a world (some 50 MB) into the instance and comparing it took about 40 ms a call,
   *  three calls a day. The arrays the engine hands out are not changed by anyone. */
  let last: Uint8Array | null = null;
  const text = new TextDecoder();

  /** Copies the inputs into the instance, calls `f` with their addresses and lengths, and returns a copy of the result. */
  function call(inputs: Uint8Array[], f: (e: Exports, args: number[]) => number): Uint8Array {
    const e = instance(),
      held: [number, number][] = [],
      args: number[] = [];
    let ok: number;
    try {
      for (const b of inputs) {
        const p = e.sce_alloc(b.length);
        held.push([p, b.length]);
        args.push(p, b.length);
        new Uint8Array(e.memory.buffer, p, b.length).set(b); // the buffer is looked up anew: memory may have grown
      }
      ok = f(e, args);
    } catch (err) {
      // a rule of the port failed and stopped the instance: read its message and start with a fresh instance next time
      let why = String(err);
      try {
        const n = e.sce_panic_len();
        if (n) why = text.decode(new Uint8Array(e.memory.buffer, e.sce_panic_ptr(), n));
      } catch {
        /* keep the error of the runtime */
      }
      x = null;
      last = null;
      current = null;
      throw new Error(`the economy engine stopped: ${why}`);
    }
    for (const [p, n] of held) e.sce_free(p, n);
    const out = new Uint8Array(e.memory.buffer, e.sce_out_ptr(), e.sce_out_len()).slice();
    if (!ok) {
      last = null;
      current = null;
      throw new Error(`economy engine: ${text.decode(out)}`);
    }
    return out;
  }
  /** The state `advance` left in the instance without its bytes (null: none, or its bytes are written). */
  let current: Kept | null = null;
  /** A state kept by `advance`: the bytes of an earlier state and the periods computed from it since. While it is
   *  the one the instance keeps, its bytes are written from there; otherwise (another state was computed in between,
   *  or the instance stopped) they are computed again from the earlier bytes: the engine is deterministic. */
  class Kept implements KeptEconomy {
    constructor(
      readonly base: Uint8Array,
      readonly periods: number,
      public written: Uint8Array | null = null,
    ) {}
    bytes(): Uint8Array {
      if (this.written) return this.written;
      if (this === current && x) {
        this.written = last = call([], (e) => e.sce_save_last());
        current = null;
        return this.written;
      }
      this.written = step(this.base, this.periods);
      return this.written;
    }
  }
  /** Before the instance computes or reads another state: the bytes of the one it keeps without them are written,
   *  so that they are not lost. */
  const flush = () => {
    if (current && !current.written && x) current.bytes();
    current = null;
  };
  /** A call that hands out a state the instance keeps (create, routes, step). */
  const keeps = (out: Uint8Array): Uint8Array => (last = out);
  /** Whether the instance keeps this state (see `last`), with its bytes or without (see `current`). */
  const kept = (state: EconomyState) => x !== null && (state === last || (state === current && !!current));
  const bytesOf = (state: EconomyState): Uint8Array => (state instanceof Uint8Array ? state : state.bytes());
  /** `step` of the engine: from the state the instance keeps, or from bytes. */
  function step(state: EconomyState, periods: number): Uint8Array {
    if (!Number.isInteger(periods) || periods < 0) throw new Error(`${periods} is not a number of periods`);
    // (a state kept without its bytes is given up: its bytes are computed again from its earlier ones if asked for)
    if (kept(state)) {
      current = null;
      return keeps(call([], (e) => e.sce_step_last(periods)));
    }
    const b = bytesOf(state);
    flush();
    return keeps(call([b], (e, a) => e.sce_step(a[0], a[1], periods)));
  }
  const floats = (b: Uint8Array): Float64Array => new Float64Array(b.buffer, b.byteOffset, b.byteLength / 8);

  return {
    create(cities, clock, { wage, prices, savings, crown, owner }) {
      for (const n of [clock.plan, clock.window])
        if (!Number.isInteger(n) || n < 1 || n > 0xffff) throw new Error(`${n} is not a length of the economy's clock`);
      if (wage !== 'prices' && wage !== 'money')
        throw new Error(`${wage} is not a way to pay wages: 'prices' or 'money'`);
      if (prices !== 'costs' && prices !== 'demand')
        throw new Error(`${prices} is not a way to set prices: 'costs' or 'demand'`);
      if (!(savings >= 0 && savings <= 1)) throw new Error(`${savings} is not a share of the savings spent per period`);
      if (crown !== 'series' && crown !== 'revenue')
        throw new Error(`${crown} is not a way for the crown to buy: 'series' or 'revenue'`);
      if (owner !== 'paper' && owner !== 'household')
        throw new Error(`${owner} is not a way for an owner to hold a firm: 'paper' or 'household'`);
      flush();
      return keeps(
        call([citiesInput(cities)], (e, a) =>
          e.sce_create(
            a[0],
            a[1],
            clock.plan,
            clock.window,
            wage === 'money' ? 1 : 0,
            prices === 'demand' ? 1 : 0,
            savings,
            crown === 'revenue' ? 1 : 0,
            owner === 'household' ? 1 : 0,
          ),
        ),
      );
    },
    routes(state, routes) {
      const out = routesInput(routes),
        b = bytesOf(state);
      flush();
      return keeps(call([b, out], (e, a) => e.sce_routes(a[0], a[1], a[2], a[3])));
    },
    workingDays(state, cities) {
      const out = workingDaysInput(cities),
        b = bytesOf(state);
      flush();
      return keeps(call([b, out], (e, a) => e.sce_working_days(a[0], a[1], a[2], a[3])));
    },
    absences(state, cities) {
      const out = absencesInput(cities),
        b = bytesOf(state);
      flush();
      return keeps(call([b, out], (e, a) => e.sce_absences(a[0], a[1], a[2], a[3])));
    },
    contracts(state, byTheDay) {
      const out = contractsInput(byTheDay),
        b = bytesOf(state);
      flush();
      return keeps(call([b, out], (e, a) => e.sce_contracts(a[0], a[1], a[2], a[3])));
    },
    standIns() {
      return floats(call([], (e) => e.sce_stand_ins_last()));
    },
    step,
    advance(state, periods) {
      if (!Number.isInteger(periods) || periods < 0) throw new Error(`${periods} is not a number of periods`);
      if (!kept(state)) step(state, 0); // the state into the instance, with its bytes
      const from = state instanceof Kept ? state : null;
      // what the new state is computed again from if need be: the last bytes written and the periods since
      const next =
        from && !from.written
          ? new Kept(from.base, from.periods + periods)
          : new Kept(from?.written ?? bytesOf(state), periods);
      call([], (e) => e.sce_advance_last(periods));
      last = null;
      current = next;
      return next;
    },
    figures(state) {
      return floats(
        kept(state)
          ? call([], (e) => e.sce_figures_last())
          : call([bytesOf(state)], (e, a) => e.sce_figures(a[0], a[1])),
      );
    },
    agents(state) {
      return floats(
        kept(state) ? call([], (e) => e.sce_agents_last()) : call([bytesOf(state)], (e, a) => e.sce_agents(a[0], a[1])),
      );
    },
    checks(state) {
      // the cities are counted by their figures: six numbers a city come first, then the pairs of the merchants
      const v = floats(call([bytesOf(state)], (e, a) => e.sce_checks(a[0], a[1]))),
        n = this.figures(state).length / FIGURES;
      const cities = Array.from({ length: n }, (_, c) => {
        const [income, nominal, real, centralBank, banks, gdpSum] = v.subarray(6 * c, 6 * c + 6);
        return { income, nominal, real, centralBank, banks, gdpSum };
      });
      const merchants: { off: number; scale: number }[] = [];
      for (let k = 6 * n; k < v.length; k += 2) merchants.push({ off: v[k], scale: v[k + 1] });
      return { cities, merchants };
    },
  };
}
