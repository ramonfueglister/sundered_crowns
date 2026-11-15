// The economy engine: the unchanged port of BeforeIT.jl (the agent-based model of Poledna, Miess, Hommes and
// Rabitsch 2023), built to WebAssembly from the shell in economy/ (economy features 3 and 4, docs/ECONOMY_DESIGN.md).
// The shell runs the port as the model type of the daily clock (economy/src/clock.rs): one period is one day.
//
// What a call gives depends on its arguments alone. The state of an economy is a sequence of bytes that lives in the
// state of the world (src/sim/state.ts); a call takes the bytes and gives new ones. So a period is a function of the
// state alone, like every other system, and the snapshot of a world holds its whole economy. (The engine remembers the
// economy of the bytes it handed out last and uses it for exactly those bytes, to save decoding them every day.)

/** The key figures of a state, in the order of `Economy::figures` (economy/src/lib.rs). Amounts are in the units
 *  of the calibration; "real" means at the prices of the starting position. Flows (GDP and its uses) are sums over
 *  the last window of the clock, a year of 365 days; the starting position stands for the days before the start. */
export const FIGURE = {
  /** periods (days) computed since the starting position */
  periods: 0,
  realGdp: 1, realGdpStart: 2, nominalGdp: 3, nominalGdpStart: 4,
  /** real consumption of households, real purchases of the government, real fixed capital formation (firms and dwellings) */
  consumption: 5, government: 6, investment: 7,
  /** real exports including the export duty, real imports */
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

/** The accounting identities of a state (`Economy::checks`): each of the first five is 0 up to rounding. */
export interface EconomyChecks { income: number; nominal: number; real: number; centralBank: number; banks: number; gdpSum: number }

export interface EconomyEngine {
  /** A new economy from the port's parameters and initial conditions (JSON text), a seed and the clock: its state. */
  create(parameters: string, initialConditions: string, seed: number, clock: EconomyClock): Uint8Array;
  /** The state after `periods` more periods. */
  step(state: Uint8Array, periods: number): Uint8Array;
  figures(state: Uint8Array): Float64Array;
  checks(state: Uint8Array): EconomyChecks;
}

interface Exports {
  memory: WebAssembly.Memory;
  sce_alloc(len: number): number; sce_free(ptr: number, len: number): void;
  sce_create(p: number, pLen: number, ic: number, icLen: number, seedLo: number, seedHi: number, plan: number, window: number): number;
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

  return {
    create(parameters, initialConditions, seed, clock) {
      if (!Number.isSafeInteger(seed) || seed < 0) throw new Error(`economy seed ${seed} is not a whole number from 0`);
      for (const n of [clock.plan, clock.window]) if (!Number.isInteger(n) || n < 1 || n > 0xffff) throw new Error(`${n} is not a length of the economy's clock`);
      const lo = seed % 0x100000000, hi = (seed - lo) / 0x100000000;
      return call([utf8.encode(parameters), utf8.encode(initialConditions)], (e, a) => e.sce_create(a[0], a[1], a[2], a[3], lo, hi, clock.plan, clock.window));
    },
    step(state, periods) {
      if (!Number.isInteger(periods) || periods < 0) throw new Error(`${periods} is not a number of periods`);
      return call([state], (e, a) => e.sce_step(a[0], a[1], periods));
    },
    figures(state) { return floats(call([state], (e, a) => e.sce_figures(a[0], a[1]))); },
    checks(state) {
      const [income, nominal, real, centralBank, banks, gdpSum] = floats(call([state], (e, a) => e.sce_checks(a[0], a[1])));
      return { income, nominal, real, centralBank, banks, gdpSum };
    },
  };
}
