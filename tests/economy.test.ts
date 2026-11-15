// Features 3 and 4 of the economy, England as one national economy computed every day by the port of BeforeIT.jl
// (docs/ECONOMY_DESIGN.md): the calibration and its turn into days, the engine against its native build, the system
// in the world, the snapshot, the upgrade of an older world and the view of a place. The shell around the port and
// the daily clock have their own tests in economy/tests and economy/src/clock.rs (cargo test).
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newWorldState, loadWorld, loadEconomy, loadEconomyEngine, dataPath } from '../tools/sim/load';
import { ECONOMY_DIR } from '../tools/sim/build_economy';
import { calibrationJson, readTable, worldCalibration } from '../tools/sim/calibrate_economy';
import { calibrateEconomy, dailyEconomy, ar1, roundHalfEven, type Entry } from '../tools/sim/economy_calibration';
import { FIGURE, FIGURES, type EconomyEngine } from '../src/sim/economy/engine';
import { computeTo, YEAR_ROW } from '../src/sim/systems/economy';
import { advanceDay } from '../src/sim/engine';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { STATE_VERSION, type WorldState } from '../src/sim/state';
import { placeDetail } from '../src/net/views';
import { World } from '../src/sim/world';
import { WorldCore, configFromEnv } from '../server/world';

const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
const days = (s: WorldState, w: World, n: number) => { for (let i = 0; i < n; i++) advanceDay(s, w); };
const bits = (v: Float64Array) => Array.from(new BigUint64Array(v.buffer, v.byteOffset, v.length), (x) => x.toString(16).padStart(16, '0')).join(' ');

describe("the calibration of England's economy (the year of the sources)", () => {
  const table = readTable(), c = calibrateEconomy(table);
  const a = c.accounts as Record<string, any>, p = c.parameters as Record<string, any>, ic = c.initial_conditions as Record<string, any>;

  it('is the file the world server reads', () => {
    expect(readFileSync(dataPath('economy_england.json'), 'utf8')).toBe(calibrationJson(table)); // else: npm run economy:calibrate
  });
  it('names a source or says "assumption" for every input', () => {
    const entries = [table.scale, ...Object.values(table.inputs)] as Entry<unknown>[];
    for (const e of entries) {
      expect(['source', 'assumption']).toContain(e.kind);
      expect(e.source.length).toBeGreaterThan(10);
    }
    // the twelve gaps of the proposal (inputs and investment are two entries each) and the value of a cloth
    expect(entries.filter((e) => e.kind === 'assumption').length).toBe(15);
    // the daily clock: the length of the year is an assumption, the plan of a firm has a source
    expect(table.clock.days_per_year).toMatchObject({ value: 365, kind: 'assumption' });
    expect(table.clock.plan_days).toMatchObject({ value: 30, kind: 'source' });
    expect(table.clock.plan_days.source).toMatch(/Eurace@Unibi/);
  });
  it('starts from the GDP, the people and the coin of the sources at the scale 1:100', () => {
    expect(a.gdp).toBeCloseTo(45247.8, 6);
    expect(a.people).toBeCloseTo(25831.8, 6);
    expect(a.coin).toBeCloseTo(11066.5, 6);
    expect(a.revenue).toBeCloseTo(1055.44, 6);
    expect(a.exports).toBeCloseTo(0.01 * (32666.40 * 4.050 + 9061 * 1.751), 6);
    expect(a.duty).toBeCloseTo(0.01 * 32666.40 * 2, 6); // 40 shillings a sack
  });
  it('balances: GDP is what households, crown, investment and trade use, and what the sectors add plus the duty', () => {
    expect(Math.abs(a.gdpCheck)).toBeLessThan(1e-6);
    expect(sum(a.valueAdded) + a.duty).toBeCloseTo(a.gdp, 6);
    expect(sum(a.households)).toBeGreaterThan(0.8 * a.gdp);
  });
  it('gives every person of the labour force a place: employee, owner of a firm or of the bank, or without work', () => {
    expect(a.labourForce).toBe(roundHalfEven(25831.8 * 0.62 * (0.971 + 0.430) / 2));
    expect(p.H_act).toBe(sum(a.employees) + sum(p.I_s) + 1 + 1);
    expect(sum(a.employees) + sum(p.I_s)).toBeGreaterThanOrEqual(a.labourForce - 1); // rounding by sector
    expect(sum(a.employees) + sum(p.I_s)).toBeLessThanOrEqual(a.labourForce + 1);
    for (let g = 0; g < 3; g++) expect(a.employees[g]).toBeGreaterThanOrEqual(p.I_s[g]); // every firm has an employee
  });
  it("follows the port's formulas", () => {
    for (let g = 0; g < 3; g++) {
      expect(p.alpha_s[g]).toBeCloseTo(a.output[g] / a.employees[g], 9); // output per employee
      expect(p.w_s[g]).toBeCloseTo(a.wages[g] / a.employees[g], 9);
      expect(p.kappa_s[g]).toBeCloseTo(a.output[g] / a.capital[g] / 0.85, 9);
      expect(a.output[g] / (a.output[g] - a.valueAdded[g])).toBeCloseTo(p.beta_s[g], 9); // output per input
    }
    expect(p.tau_EXPORT).toBeCloseTo(a.duty / a.exports, 12);
    expect(p.tau_INC).toBeCloseTo(a.directTax / (sum(a.wages) + sum(a.valueAdded) - sum(a.wages) - 0.025 * sum(a.capital)), 12);
    expect(sum(p.b_HH_g)).toBeCloseTo(1, 12);
    expect(sum(p.c_E_g)).toBeCloseTo(1, 12);
    expect(ic.E_CB).toBeCloseTo(-(ic.D_I + ic.D_H + ic.E_k), 9); // the port's rule with no government debt and no loans
    for (const k of ['tau_VAT', 'tau_SIF', 'tau_SIW', 'tau_FIRM', 'tau_CF', 'tau_G', 'r_G', 'xi_pi', 'xi_gamma']) expect(p[k]).toBe(0);
    expect(p.rho).toBe(1); // no Taylor rule
    expect(ic.r_bar).toBe(0);
    expect(p.mu).toBe(0.075); // the loan rate
  });
  it('hands over the history of 1281 to 1356 and nothing after it', () => {
    expect(p.T_prime).toBe(76);
    for (const k of ['Y', 'pi', 'C_G', 'C_E', 'Y_I']) expect(ic[k].length).toBe(76);
    expect(ic.Y[75]).toBeCloseTo(sum(a.output), 6); // the last year of the history is the start year
    expect(ic.C_G[75]).toBeCloseTo(a.crown, 9);
    expect(ic.C_E[75]).toBeCloseTo(a.exports, 9);
    expect(ic.Y[0] / ic.Y[75]).toBeCloseTo(3389.51 / 2686.02, 9); // real GDP of 1281 against 1356
    expect(ic.pi[0]).toBeCloseTo(Math.log(0.1249 / 0.132607), 9); // the deflator of 1281 against 1280
  });
  it('estimates an AR(1) by least squares', () => {
    const y = [1, 1.5, 1.75, 1.875, 1.9375]; // y_t = 0.5 · y_(t−1) + 1 exactly
    const e = ar1(y);
    expect(e.alpha).toBeCloseTo(0.5, 12); expect(e.beta).toBeCloseTo(1, 12); expect(e.sigma).toBeCloseTo(0, 12);
    expect(roundHalfEven(2.5)).toBe(2); expect(roundHalfEven(3.5)).toBe(4); expect(roundHalfEven(2.4)).toBe(2); expect(roundHalfEven(2.6)).toBe(3);
  });
});

describe('the calibration turned into days', () => {
  const table = readTable(), y = calibrateEconomy(table), d = worldCalibration(table);
  const py = y.parameters as Record<string, any>, pd = d.parameters as Record<string, any>;
  const iy = y.initial_conditions as Record<string, any>, id = d.initial_conditions as Record<string, any>;
  const FLOWS = ['alpha_s', 'kappa_s', 'delta_s', 'w_s'], RULES = ['mu', 'theta', 'alpha_G', 'beta_G', 'sigma_G', 'alpha_E', 'beta_E', 'sigma_E', 'C'];
  const HISTORY = ['Y', 'pi', 'C_G', 'C_E', 'Y_I'];

  it('has a year of 365 days, a plan every 30 days and expectations on the last 365 days', () => {
    expect(y.periods_per_year).toBe(1); expect(y.clock).toEqual({ plan: 1, window: 1 });
    expect(d.periods_per_year).toBe(365); expect(d.clock).toEqual({ plan: 30, window: 365 });
    expect(d.accounts).toEqual(y.accounts); // the accounts of the year stay as the sources give them
  });
  it('spreads what flows in a year evenly over its days', () => {
    for (const k of FLOWS) for (let g = 0; g < 3; g++) expect(pd[k][g]).toBe(py[k][g] / 365);
    for (const k of HISTORY) {
      expect(id[k].length).toBe(76);
      for (let t = 0; t < 76; t++) expect(id[k][t]).toBe(iy[k][t] / 365);
    }
    expect(pd.T_prime).toBe(76);
    expect(365 * sum(pd.alpha_s.map((x: number, g: number) => x * (y.accounts as any).employees[g]))).toBeCloseTo(sum((y.accounts as any).output), 6);
  });
  it('leaves every share and every stock as it is', () => {
    for (const k of Object.keys(py)) if (!FLOWS.includes(k) && !RULES.includes(k)) expect(pd[k], k).toEqual(py[k]);
    for (const k of Object.keys(iy)) if (!HISTORY.includes(k)) expect(id[k], k).toEqual(iy[k]);
    expect(Object.keys(pd)).toEqual(Object.keys(py)); expect(Object.keys(id)).toEqual(Object.keys(iy));
  });
  it('compounds the interest of a day to the interest of the year', () => {
    expect(Math.pow(1 + pd.mu, 365)).toBeCloseTo(1.075, 12);
    expect(pd.theta).toBe(py.theta / 365);
  });
  it('keeps the memory of a year, the long-run mean and the spread of the crown and of the exports', () => {
    for (const s of ['G', 'E']) {
      const a = py[`alpha_${s}`], ad = pd[`alpha_${s}`];
      expect(Math.pow(ad, 365)).toBeCloseTo(a, 12);
      expect(pd[`beta_${s}`] / (1 - ad)).toBeCloseTo(py[`beta_${s}`] / (1 - a) - Math.log(365), 9); // the mean of the logarithm, a day is 1/365 of a year
      expect(pd[`sigma_${s}`] ** 2 / (1 - ad * ad)).toBeCloseTo(py[`sigma_${s}`] ** 2 / (1 - a * a), 12); // the variance in the long run
    }
    expect(pd.C[1][1]).toBe(pd.sigma_E ** 2);
  });
  it('refuses a calibration that is daily already, a rule without a long-run mean and a year of one day', () => {
    expect(() => dailyEconomy(d, 365, 30)).toThrow(/yearly/);
    expect(() => dailyEconomy({ ...y, parameters: { ...py, alpha_G: 1 } }, 365, 30)).toThrow(/long-run mean/);
    expect(() => dailyEconomy(y, 1, 30)).toThrow();
    expect(() => dailyEconomy(y, 365, 0)).toThrow();
  });
});

describe('the economy engine (WebAssembly)', () => {
  const engine = loadEconomyEngine(), c = loadEconomy();
  const P = JSON.stringify(c.parameters), IC = JSON.stringify(c.initial_conditions), CLOCK = c.clock;
  const create = (seed: number) => engine.create(P, IC, seed, CLOCK);

  it('computes bit for bit what the native build computes, day by day and with the clock of the port', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sce-'));
    try {
      writeFileSync(join(dir, 'p.json'), P); writeFileSync(join(dir, 'ic.json'), IC);
      // 65 days: every firm has planned three times. With a plan and a window of one period the rules are the port's.
      for (const [seed, clock, periods] of [[1356, CLOCK, 65], [7, CLOCK, 65], [1356, { plan: 1, window: 1 }, 10]] as const) {
        const native = execFileSync(join(ECONOMY_DIR, 'target/release/examples/reference'),
          [join(dir, 'p.json'), join(dir, 'ic.json'), String(seed), String(periods), String(clock.plan), String(clock.window)], { encoding: 'utf8' }).trim().split('\n');
        expect(native.length).toBe(periods + 1);
        let state = engine.create(P, IC, seed, clock);
        expect(bits(engine.figures(state))).toBe(native[0]);
        for (let t = 1; t <= periods; t++) { state = engine.step(state, 1); expect(bits(engine.figures(state))).toBe(native[t]); }
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);
  it('gives the same state for the same seed and another for another seed or another clock', () => {
    const a = create(1356), b = create(1356), other = create(1357);
    expect(Buffer.compare(a, b)).toBe(0);
    expect(Buffer.compare(engine.step(a, 3), engine.step(b, 3))).toBe(0);
    expect(Buffer.compare(a, other)).not.toBe(0);
    expect(Buffer.compare(a, engine.create(P, IC, 1356, { plan: 31, window: 365 }))).not.toBe(0);
  });
  it('continues from a saved state as if it had never stopped, in the middle of a month', () => {
    const start = create(1356);
    let state = start;
    for (let t = 0; t < 45; t++) state = engine.step(Uint8Array.from(state), 1); // a copy each time: only the bytes carry over
    expect(Buffer.compare(state, engine.step(start, 45))).toBe(0);
    expect(engine.figures(state)[FIGURE.periods]).toBe(45);
    expect(engine.figures(state).length).toBe(FIGURES);
  }, 30_000);
  it('keeps the books: the accounting identities of the port hold after every day', () => {
    let state = create(1356);
    for (let t = 0; t < 40; t++) {
      state = engine.step(state, 1);
      const k = engine.checks(state);
      for (const v of [k.income, k.nominal, k.real, k.centralBank, k.banks]) expect(Math.abs(v) / k.gdpSum).toBeLessThan(1e-9);
      const f = engine.figures(state);
      expect(f[FIGURE.employees] + f[FIGURE.owners] + f[FIGURE.unemployed]).toBe((c.parameters as any).H_act);
    }
  }, 30_000);
  it('starts at the GDP of the calibration, as the sum of 365 days', () => {
    const f = engine.figures(create(1356));
    expect(f[FIGURE.periods]).toBe(0);
    expect(f[FIGURE.realGdp]).toBeCloseTo(45247.8, 3);
    expect(f[FIGURE.nominalGdp]).toBeCloseTo(45247.8, 3);
    expect(f[FIGURE.realGdpStart]).toBe(f[FIGURE.realGdp]); expect(f[FIGURE.nominalGdpStart]).toBe(f[FIGURE.nominalGdp]);
    expect(f[FIGURE.priceLevel]).toBe(1);
    expect(f[FIGURE.depositsHouseholds] + f[FIGURE.depositsFirms]).toBeCloseTo(11066.5, 3); // the coin
  });
  it('moves a little every day: the sums of the last 365 days and the price level of today', () => {
    let state = create(1356);
    const start = engine.figures(state);
    const prices = new Set<number>(), gdp = new Set<number>();
    for (let t = 0; t < 40; t++) {
      state = engine.step(state, 1);
      const f = engine.figures(state);
      prices.add(f[FIGURE.priceLevel]); gdp.add(f[FIGURE.realGdp]);
      expect(Math.abs(f[FIGURE.realGdp] / start[FIGURE.realGdp] - 1)).toBeLessThan(0.02); // a day is 1/365 of the sum
      expect(Math.abs(f[FIGURE.priceLevel] - 1)).toBeLessThan(0.02);
    }
    expect(gdp.size).toBe(40);
    expect(prices.size).toBeGreaterThan(30);
  }, 30_000);
  it('refuses what is not a state, not a calibration or not a clock, and keeps working', () => {
    expect(() => engine.step(new Uint8Array(10), 1)).toThrow(/economy engine/);
    expect(() => engine.figures(new Uint8Array(0))).toThrow(/economy engine/);
    expect(() => engine.create('{}', IC, 1, CLOCK)).toThrow(/economy engine/);
    expect(() => engine.create(P, IC, -1, CLOCK)).toThrow();
    expect(() => engine.create(P, IC, 1, { plan: 0, window: 365 })).toThrow();
    expect(() => engine.create(P, IC, 1, { plan: 30, window: 1.5 })).toThrow();
    expect(engine.figures(create(1))[FIGURE.periods]).toBe(0);
  });
  it('reports a rule of the port that fails, and starts afresh', () => {
    // a state in which a worker has an employer that does not exist: the labour market of the port stops
    const p = c.parameters as any, workers = p.H_act - sum(p.I_s) - 1;
    const state = engine.step(create(1356), 1);
    const employers = 69 + 36 * workers; // economy/src/state.rs: header, the IDs and four amounts of every worker
    const dv = new DataView(state.buffer, state.byteOffset, state.byteLength);
    expect(dv.getUint32(employers, true)).toBe(workers);
    dv.setUint32(employers + 4, 0x00ffffff, true);
    expect(() => engine.step(state, 1)).toThrow(/^the economy engine stopped: index out of bounds: .+ \(src\/markets\.rs:\d+\)$/);
    expect(engine.figures(create(1356))[FIGURE.periods]).toBe(0); // a fresh instance answers
  });
});

describe("England's economy in the world", () => {
  // one world that runs 400 days, day by day (1356 is a leap year: day 365 is 31 December, day 366 is 1 January 1357)
  const run = newWorldState();
  const at: Record<number, { hash: string; state: Uint8Array; figures: Float64Array; model: number }> = {};
  beforeAll(() => {
    for (let d = 1; d <= 400; d++) {
      advanceDay(run.s, run.w);
      if ([45, 75, 365, 366].includes(d)) at[d] = { hash: hashState(run.s), state: encodeState(run.s), figures: run.s.economy.england!.figures.slice(), model: run.s.economy.england!.model.length };
    }
  }, 120_000);

  it('is founded with the world: the starting position of 1356, from the seed of the world', () => {
    const { s, w } = newWorldState();
    const e = s.economy.england!, c = w.englandEconomy;
    expect(s.v).toBe(STATE_VERSION);
    expect(e.day).toBe(0); expect(e.halted).toBe(''); expect(e.years.length).toBe(0);
    expect(e.figures[FIGURE.periods]).toBe(0);
    expect(c.clock).toEqual({ plan: 30, window: 365 });
    expect(Buffer.compare(e.model, w.economyEngine.create(c.parameters, c.initialConditions, s.seed, c.clock))).toBe(0);
    expect(hashState(newWorldState(1357).s)).not.toBe(hashState(s));
  });
  it('computes one period every day', () => {
    const { s, w } = newWorldState();
    const start = s.economy.england!.model;
    advanceDay(s, w);
    const e = s.economy.england!, first = e.figures;
    expect(e.day).toBe(1); expect(first[FIGURE.periods]).toBe(1);
    expect(Buffer.compare(e.model, w.economyEngine.step(start, 1))).toBe(0);
    days(s, w, 2);
    expect(e.day).toBe(3); expect(e.figures[FIGURE.periods]).toBe(3);
    expect(e.figures[FIGURE.realGdp]).not.toBe(first[FIGURE.realGdp]);
    expect(Buffer.compare(e.model, w.economyEngine.step(start, 3))).toBe(0);
    expect(e.years.length).toBe(0);
  });
  it('keeps the figures of a year that has ended, and the days of the last 365 days only', () => {
    const e = run.s.economy.england!;
    expect(e.day).toBe(400); expect(e.halted).toBe('');
    expect(e.figures[FIGURE.periods]).toBe(400);
    // the row of 1356 was written before 1 January 1357 was computed: the figures of 31 December
    expect(e.years.length).toBe(YEAR_ROW);
    expect(e.years[0]).toBe(1356);
    expect(bits(e.years.slice(1))).toBe(bits(at[365].figures));
    // from the 365th day on the accounts hold 365 days: a day adds only its GDP and its inflation to the history
    expect(e.model.length - at[366].model).toBe(34 * 16);
    expect(at[366].model - at[365].model).toBe(16);
  });
  it('gives for many days at once what the same days give one by one', () => {
    const { s, w } = newWorldState();
    computeTo(s, w, 400); s.day = 400;
    expect(s.economy.england!.years.length).toBe(YEAR_ROW);
    expect(Buffer.compare(s.economy.england!.model, run.s.economy.england!.model)).toBe(0);
    expect(bits(s.economy.england!.years)).toBe(bits(run.s.economy.england!.years));
    expect(bits(s.economy.england!.figures)).toBe(bits(run.s.economy.england!.figures));
  }, 60_000);
  it('is in the snapshot and in its hash: save in the middle of a month, load and go on equals going straight on', () => {
    const loaded = decodeState(at[45].state);
    expect(loaded.economy.england!.model).toBeInstanceOf(Uint8Array);
    expect(loaded.economy.england!.day).toBe(45);
    expect(hashState(loaded)).toBe(at[45].hash);
    days(loaded, run.w, 30);
    expect(hashState(loaded)).toBe(at[75].hash);
    // a year later: the rows of the years come back as they were
    const later = decodeState(encodeState(run.s));
    expect(later.economy.england!.years).toBeInstanceOf(Float64Array);
    expect(hashState(later)).toBe(hashState(run.s));
    // the hash sees the economy
    const before = hashState(loaded);
    loaded.economy.england!.model[loaded.economy.england!.model.length - 1] ^= 1;
    expect(hashState(loaded)).not.toBe(before);
  }, 30_000);
  it('does not exist in a world that starts in another year', () => {
    const { s, w } = newWorldState(1492, 1492);
    expect(s.economy.england).toBeNull();
    days(s, w, 400);
    expect(s.economy.england).toBeNull();
    const i = (JSON.parse(readFileSync(dataPath('land.json'), 'utf8')).england.places as number[])[0];
    expect(placeDetail(s, w, i)!.economy).toBeUndefined();
  });
  it('stands still when the engine cannot compute a day, and the world goes on', () => {
    const real = loadWorld();
    let calls = 0;
    const broken: EconomyEngine = { ...real.economyEngine, step: () => { calls++; throw new Error('the economy engine stopped: a rule failed'); } };
    const w: World = Object.assign(Object.create(World.prototype), real, { economyEngine: broken });
    const { s } = newWorldState();
    const before = s.economy.england!.model;
    advanceDay(s, w);
    const e = s.economy.england!;
    expect(e.halted).toBe('2 January 1356: the economy engine stopped: a rule failed');
    expect(e.day).toBe(0); expect(e.model).toBe(before);
    days(s, w, 400); // the next days do not try again
    expect(calls).toBe(1);
    expect(s.day).toBe(401);
    expect(e.years.length).toBe(0); // a year that was not computed has no row
    const i = (JSON.parse(readFileSync(dataPath('land.json'), 'utf8')).england.places as number[])[0];
    expect(placeDetail(s, real, i)!.economy!.halted).toBe(e.halted);
    computeTo(s, real, 401); // not even with a working engine: a halted economy stays as it was
    expect(s.economy.england!.day).toBe(0);
  });
  it('stops on the day that fails when many days are computed at once', () => {
    const real = loadWorld();
    let single = 0;
    const broken: EconomyEngine = {
      ...real.economyEngine,
      step: (m, n) => { if (n > 1 || ++single > 3) throw new Error('the economy engine stopped: a rule failed'); return real.economyEngine.step(m, n); },
    };
    const w: World = Object.assign(Object.create(World.prototype), real, { economyEngine: broken });
    const { s } = newWorldState();
    computeTo(s, w, 10);
    const e = s.economy.england!;
    expect(e.day).toBe(3); expect(e.figures[FIGURE.periods]).toBe(3);
    expect(e.halted).toBe('5 January 1356: the economy engine stopped: a rule failed');
    expect(Buffer.compare(e.model, real.economyEngine.step(newWorldState().s.economy.england!.model, 3))).toBe(0);
  });
  it('stands still when a day ends without a GDP', () => {
    const real = loadWorld();
    const broken: EconomyEngine = { ...real.economyEngine, figures: (m) => real.economyEngine.figures(m).fill(NaN, FIGURE.realGdp, FIGURE.realGdp + 1) };
    const w: World = Object.assign(Object.create(World.prototype), real, { economyEngine: broken });
    const { s } = newWorldState();
    const before = s.economy.england!.model;
    days(s, w, 2);
    expect(s.economy.england!.halted).toBe('2 January 1356: the day ended without a GDP (not a number)');
    expect(s.economy.england!.model).toBe(before);
    expect(Number.isFinite(s.economy.england!.figures[FIGURE.realGdp])).toBe(true);
  });

  describe('in a world saved by an older build', () => {
    it('is founded when a world from before the economy is loaded', () => {
      const { s, w } = newWorldState();
      const old = decodeState(encodeState(s)) as any; delete old.economy; old.v = 3;
      const loaded = decodeState(encodeState(old));
      expect(loaded.v).toBe(3); expect((loaded as any).economy).toBeUndefined();
      expect(hashState(upgradeState(loaded, w))).toBe(hashState(s));
    });
    it('starts again from 1356 and computes the days the world has seen, when the world had the yearly economy', () => {
      // the state of the yearly economy (state version 6): a year, a model, 15 figures
      const old = decodeState(encodeState(run.s)) as any;
      old.economy = { england: { year: 1357, model: new Uint8Array(64), figures: new Float64Array(15), halted: '' } }; old.v = 6;
      const loaded = upgradeState(decodeState(encodeState(old)), run.w);
      expect(loaded.v).toBe(STATE_VERSION);
      expect(loaded.economy.england!.day).toBe(400);
      expect(loaded.economy.england!.years[0]).toBe(1356);
      expect(hashState(loaded)).toBe(hashState(run.s));
      const straight = decodeState(encodeState(run.s));
      days(loaded, run.w, 5); days(straight, run.w, 5);
      expect(hashState(loaded)).toBe(hashState(straight));
    }, 60_000);
  });
});

describe('what a player sees of the economy', () => {
  const places = JSON.parse(readFileSync(dataPath('land.json'), 'utf8')).england.places as number[];
  it('is a section in every place of England, and in no other place', () => {
    const { s, w } = newWorldState();
    let shown = 0;
    for (let i = 0; i < w.L; i++) if (placeDetail(s, w, i)!.economy) { shown++; expect(places).toContain(i); }
    expect(shown).toBe(places.length);
    expect(shown).toBe(162);
    const paris = w.names.indexOf('Paris');
    expect(paris).toBeGreaterThanOrEqual(0);
    expect(placeDetail(s, w, paris)!.economy).toBeUndefined();
  });
  it('shows the last 365 days of all of England and the price level of today, new every day', () => {
    const { s, w } = newWorldState();
    const london = w.names.indexOf('London');
    expect(places).toContain(london);
    const d0 = placeDetail(s, w, london)!.economy!;
    expect(d0).toMatchObject({ country: 'england', year: 1356, day: 0, baseYear: 1356, scale: 0.01 });
    expect(d0.realGdp).toBeCloseTo(45247.8, 3);
    expect(d0.realGdpIndex).toBeCloseTo(100, 9); expect(d0.priceIndex).toBeCloseTo(100, 9); expect(d0.priceToday).toBe(100);
    expect(d0.employed + d0.unemployed).toBe(11221);
    expect(d0.coinHouseholds + d0.coinFirms).toBeCloseTo(11066.5, 3);
    expect(d0.halted).toBeUndefined();
    let last = d0;
    for (let day = 1; day <= 3; day++) {
      advanceDay(s, w);
      const f = s.economy.england!.figures, d = placeDetail(s, w, london)!.economy!;
      expect(d.day).toBe(day); expect(d.year).toBe(1356);
      expect(d.realGdp).toBe(f[FIGURE.realGdp]);
      expect(d.realGdp).not.toBe(last.realGdp);
      expect(d.realGdpIndex).toBeCloseTo(100 * f[FIGURE.realGdp] / 45247.8, 6);
      expect(d.priceIndex).toBeCloseTo(100 * f[FIGURE.nominalGdp] / f[FIGURE.realGdp], 6);
      expect(d.priceToday).toBe(100 * f[FIGURE.priceLevel]);
      expect(d.consumption).toBe(f[FIGURE.consumption]); expect(d.crown).toBe(f[FIGURE.government]);
      expect(d.investment).toBe(f[FIGURE.investment]); expect(d.exports).toBe(f[FIGURE.exports]); expect(d.imports).toBe(f[FIGURE.imports]);
      // every place of England shows the same economy
      expect(placeDetail(s, w, places[0])!.economy).toEqual(d);
      // GDP is the sum of its uses
      expect(d.consumption + d.crown + f[FIGURE.investment] + d.exports - d.imports).toBeGreaterThan(0.9 * d.realGdp);
      last = d;
    }
  });
});

describe('the world server with the economy', () => {
  it('replays the days of the economy from its command log and resumes from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scw-eco-'));
    try {
      const cfg = { ...configFromEnv({}), dataDir: dir, id: 'eco', snapshotEveryDays: 30, log: () => {} };
      const core = new WorldCore(cfg).init();
      for (let i = 0; i < 70; i++) core.step(); // snapshots at day 30 and 60
      expect(core.s.economy.england!.day).toBe(70);
      const fromStart = core.verifyReplay(0), fromLast = core.verifyReplay(60);
      expect(fromStart.hash).toBe(fromStart.live);
      expect(fromLast.hash).toBe(fromLast.live);
      const live = hashState(core.s);
      core.shutdown();
      const again = new WorldCore(cfg).init();
      expect(again.s.day).toBe(70);
      expect(hashState(again.s)).toBe(live);
      again.shutdown();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);
});
