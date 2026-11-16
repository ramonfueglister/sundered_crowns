// The economy engine: the unchanged port of BeforeIT.jl (the agent-based model of Poledna, Miess, Hommes and
// Rabitsch 2023), built to WebAssembly from the shell in economy/ (docs/ECONOMY_DESIGN.md, features 3 to 5).
// It computes cities: every city is a whole economy of the port, one period is one day (economy/src/clock.rs), and
// the rest of the world of a city is the other cities, through the merchants between them (economy/src/trade.rs).
//
// What a call gives depends on its arguments alone. The state of the cities is a sequence of bytes that lives in the
// state of the world (src/sim/state.ts); a call takes the bytes and gives new ones. So a period is a function of the
// state alone, like every other system, and the snapshot of a world holds all its economies. (The engine remembers
// the cities of the bytes it handed out last and uses them for exactly those bytes, to save decoding them every day.)

/** The key figures of a city, in the order of `Economy::figures` (economy/src/lib.rs). Amounts are in the units
 *  of the calibration; "real" means at the prices of the starting position. Flows (GDP and its uses) are sums over
 *  the last window of the clock, a year of 365 days; the starting position stands for the days before the start. */
export const FIGURE = {
  /** periods (days) computed since the starting position */
  periods: 0,
  realGdp: 1, realGdpStart: 2, nominalGdp: 3, nominalGdpStart: 4,
  /** real consumption of households, real purchases of the government, real fixed capital formation (firms and dwellings) */
  consumption: 5, government: 6, investment: 7,
  /** real exports including the export duty (what the merchants bought in the city), real imports (what they sold) */
  exports: 8, imports: 9,
  /** persons with an employer, owners of firms and of the bank, workers without an employer */
  employees: 10, owners: 11, unemployed: 12,
  /** deposits of all households, deposits of the firms */
  depositsHouseholds: 13, depositsFirms: 14,
  /** the price level of the last period: the mean price of the firms weighted by their output, 1 at the start */
  priceLevel: 15,
} as const;
export const FIGURES = 16;

/** The two lengths of the daily clock in periods: a firm plans every `plan` periods, expectations are formed on
 *  windows of `window` periods. With 1 and 1 the engine computes the port as it is. */
export interface EconomyClock { plan: number; window: number }
/** How the firms pay wages (economy feature 7, economy/src/clock.rs): 'prices' is the port's rule, a real wage that
 *  never changes, paid times the consumer price level; 'money' is a wage in money that never changes. */
export type EconomyWage = 'prices' | 'money';

/** What the engine is given for a city: the port's parameters and initial conditions (JSON text) and the seed of
 *  the city's random numbers. */
export interface CitySetup { parameters: string; initialConditions: string; seed: number }

/** The accounting identities of a city (`Economy::checks`): each of the first five is 0 up to rounding; `gdpSum`
 *  is the amount to judge them by. */
export interface CityChecks { income: number; nominal: number; real: number; centralBank: number; banks: number; gdpSum: number }
/** What must be 0 in a state: the identities of every city, and the books of the merchants (`Cities::checks`): the
 *  change of their worth, then for every product the goods neither in stock nor sold, each with the amount to judge
 *  it by. */
export interface EconomyChecks { cities: CityChecks[]; merchants: { off: number; scale: number }[] }

export interface EconomyEngine {
  /** New cities that trade with each other, with the clock and the way their firms pay wages: their state. */
  create(cities: readonly CitySetup[], clock: EconomyClock, wage: EconomyWage): Uint8Array;
  /** The state after `periods` more periods. */
  step(state: Uint8Array, periods: number): Uint8Array;
  /** The key figures of every city, `FIGURES` numbers a city in the order of the cities. */
  figures(state: Uint8Array): Float64Array;
  checks(state: Uint8Array): EconomyChecks;
}

interface Exports {
  memory: WebAssembly.Memory;
  sce_alloc(len: number): number; sce_free(ptr: number, len: number): void;
  sce_create(list: number, len: number, plan: number, window: number, wage: number): number;
  sce_step(state: number, len: number, periods: number): number;
  sce_figures(state: number, len: number): number;
  sce_checks(state: number, len: number): number;
  sce_out_ptr(): number; sce_out_len(): number; sce_panic_ptr(): number; sce_panic_len(): number;
}

/** The engine from the bytes of the WebAssembly file (build/economy/sc_economy.wasm, see tools/sim/load.ts). */
export function wasmEconomyEngine(wasm: Uint8Array): EconomyEngine {
  const module = new WebAssembly.Module(wasm as BufferSource);
  let x: Exports | null = null;
  const instance = (): Exports => (x ??= new WebAssembly.Instance(module, {}).exports as unknown as Exports);
  const text = new TextDecoder();

  /** Copies the inputs into the instance, calls `f` with their addresses and lengths, and returns a copy of the result. */
  function call(inputs: Uint8Array[], f: (e: Exports, args: number[]) => number): Uint8Array {
    const e = instance(), held: [number, number][] = [], args: number[] = [];
    let ok: number;
    try {
      for (const b of inputs) {
        const p = e.sce_alloc(b.length);
        held.push([p, b.length]); args.push(p, b.length);
        new Uint8Array(e.memory.buffer, p, b.length).set(b); // the buffer is looked up anew: memory may have grown
      }
      ok = f(e, args);
    } catch (err) {
      // a rule of the port failed and stopped the instance: read its message and start with a fresh instance next time
      let why = String(err);
      try { const n = e.sce_panic_len(); if (n) why = text.decode(new Uint8Array(e.memory.buffer, e.sce_panic_ptr(), n)); } catch { /* keep the error of the runtime */ }
      x = null;
      throw new Error(`the economy engine stopped: ${why}`);
    }
    for (const [p, n] of held) e.sce_free(p, n);
    const out = new Uint8Array(e.memory.buffer, e.sce_out_ptr(), e.sce_out_len()).slice();
    if (!ok) throw new Error(`economy engine: ${text.decode(out)}`);
    return out;
  }
  const floats = (b: Uint8Array): Float64Array => new Float64Array(b.buffer, b.byteOffset, b.byteLength / 8);
  const utf8 = new TextEncoder();

  /** The list of cities as `sce_create` reads it: for every city the seed in 64 bits, then the two texts, each with
   *  its length in 32 bits before it; little endian. */
  function list(cities: readonly CitySetup[]): Uint8Array {
    const texts = cities.map((c) => [utf8.encode(c.parameters), utf8.encode(c.initialConditions)]);
    const out = new Uint8Array(texts.reduce((n, [p, ic]) => n + 16 + p.length + ic.length, 0)), dv = new DataView(out.buffer);
    let at = 0;
    cities.forEach((c, k) => {
      if (!Number.isSafeInteger(c.seed) || c.seed < 0) throw new Error(`economy seed ${c.seed} is not a whole number from 0`);
      const lo = c.seed % 0x100000000;
      dv.setUint32(at, lo, true); dv.setUint32(at + 4, (c.seed - lo) / 0x100000000, true); at += 8;
      for (const t of texts[k]) { dv.setUint32(at, t.length, true); out.set(t, at + 4); at += 4 + t.length; }
    });
    return out;
  }

  return {
    create(cities, clock, wage) {
      for (const n of [clock.plan, clock.window]) if (!Number.isInteger(n) || n < 1 || n > 0xffff) throw new Error(`${n} is not a length of the economy's clock`);
      if (wage !== 'prices' && wage !== 'money') throw new Error(`${wage} is not a way to pay wages: 'prices' or 'money'`);
      return call([list(cities)], (e, a) => e.sce_create(a[0], a[1], clock.plan, clock.window, wage === 'money' ? 1 : 0));
    },
    step(state, periods) {
      if (!Number.isInteger(periods) || periods < 0) throw new Error(`${periods} is not a number of periods`);
      return call([state], (e, a) => e.sce_step(a[0], a[1], periods));
    },
    figures(state) { return floats(call([state], (e, a) => e.sce_figures(a[0], a[1]))); },
    checks(state) {
      // the cities are counted by their figures: six numbers a city come first, then the pairs of the merchants
      const v = floats(call([state], (e, a) => e.sce_checks(a[0], a[1]))), n = this.figures(state).length / FIGURES;
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
