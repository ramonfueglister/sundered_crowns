// Feature 3 of the economy, England as one national economy computed by the port of BeforeIT.jl
// (docs/ECONOMY_DESIGN.md): the calibration, the engine against its native build, the system in the world, the
// snapshot, the upgrade of an older world and the view of a place. The shell around the port has its own tests in
// economy/tests (cargo test).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newWorldState, loadWorld, loadEconomy, loadEconomyEngine, dataPath, countedInPeopleOfTheTime } from '../tools/sim/load';
import { ECONOMY_DIR } from '../tools/sim/build_economy';
import { calibrationJson, readTable } from '../tools/sim/calibrate_economy';
import { calibrateEconomy, ar1, roundHalfEven, type Entry } from '../tools/sim/economy_calibration';
import { FIGURE, FIGURES, type EconomyEngine } from '../src/sim/economy/engine';
import { computeYear } from '../src/sim/systems/economy';
import { advanceDay } from '../src/sim/engine';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { STATE_VERSION } from '../src/sim/state';
import { placeDetail } from '../src/net/views';
import { World } from '../src/sim/world';
import { WorldCore, configFromEnv } from '../server/world';

const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
const days = (s: any, w: World, n: number) => { for (let i = 0; i < n; i++) advanceDay(s, w); };
const bits = (v: Float64Array) => Array.from(new BigUint64Array(v.buffer, v.byteOffset, v.length), (x) => x.toString(16).padStart(16, '0')).join(' ');

describe("the calibration of England's economy", () => {
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

describe('the economy engine (WebAssembly)', () => {
  const engine = loadEconomyEngine(), c = loadEconomy();
  const P = JSON.stringify(c.parameters), IC = JSON.stringify(c.initial_conditions);

  it('computes bit for bit what the native build of the port computes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sce-'));
    try {
      writeFileSync(join(dir, 'p.json'), P); writeFileSync(join(dir, 'ic.json'), IC);
      for (const seed of [1356, 7]) {
        const native = execFileSync(join(ECONOMY_DIR, 'target/release/examples/reference'), [join(dir, 'p.json'), join(dir, 'ic.json'), String(seed), '25'], { encoding: 'utf8' }).trim().split('\n');
        expect(native.length).toBe(26);
        let state = engine.create(P, IC, seed);
        expect(bits(engine.figures(state))).toBe(native[0]);
        for (let t = 1; t <= 25; t++) { state = engine.step(state, 1); expect(bits(engine.figures(state))).toBe(native[t]); }
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('gives the same state for the same seed and another for another seed', () => {
    const a = engine.create(P, IC, 1356), b = engine.create(P, IC, 1356), other = engine.create(P, IC, 1357);
    expect(Buffer.compare(a, b)).toBe(0);
    expect(Buffer.compare(engine.step(a, 3), engine.step(b, 3))).toBe(0);
    expect(Buffer.compare(a, other)).not.toBe(0);
  });
  it('continues from a saved state as if it had never stopped', () => {
    const start = engine.create(P, IC, 1356);
    let state = start;
    for (let t = 0; t < 6; t++) state = engine.step(Uint8Array.from(state), 1); // a copy each time: only the bytes carry over
    expect(Buffer.compare(state, engine.step(start, 6))).toBe(0);
    expect(engine.figures(state)[FIGURE.periods]).toBe(6);
    expect(engine.figures(state).length).toBe(FIGURES);
  });
  it('keeps the books: the accounting identities of the port hold after every year', () => {
    let state = engine.create(P, IC, 1356);
    for (let t = 0; t < 12; t++) {
      state = engine.step(state, 1);
      const k = engine.checks(state);
      for (const v of [k.income, k.nominal, k.real, k.centralBank, k.banks]) expect(Math.abs(v) / k.gdpSum).toBeLessThan(1e-9);
      const f = engine.figures(state);
      expect(f[FIGURE.employees] + f[FIGURE.owners] + f[FIGURE.unemployed]).toBe((c.parameters as any).H_act);
    }
  });
  it('starts at the GDP of the calibration', () => {
    const f = engine.figures(engine.create(P, IC, 1356));
    expect(f[FIGURE.periods]).toBe(0);
    expect(f[FIGURE.realGdp]).toBeCloseTo(45247.8, 3);
    expect(f[FIGURE.nominalGdp]).toBeCloseTo(45247.8, 3);
    expect(f[FIGURE.depositsHouseholds] + f[FIGURE.depositsFirms]).toBeCloseTo(11066.5, 3); // the coin
  });
  it('refuses what is not a state or not a calibration, and keeps working', () => {
    expect(() => engine.step(new Uint8Array(10), 1)).toThrow(/economy engine/);
    expect(() => engine.figures(new Uint8Array(0))).toThrow(/economy engine/);
    expect(() => engine.create('{}', IC, 1)).toThrow(/economy engine/);
    expect(() => engine.create(P, IC, -1)).toThrow();
    expect(engine.figures(engine.create(P, IC, 1))[FIGURE.periods]).toBe(0);
  });
  it('reports a rule of the port that fails, and starts afresh', () => {
    // a state in which a worker has an employer that does not exist: the labour market of the port stops
    const p = c.parameters as any, workers = p.H_act - sum(p.I_s) - 1;
    const state = engine.step(engine.create(P, IC, 1356), 1);
    const employers = 69 + 36 * workers; // economy/src/state.rs: header, the IDs and four amounts of every worker
    const dv = new DataView(state.buffer, state.byteOffset, state.byteLength);
    expect(dv.getUint32(employers, true)).toBe(workers);
    dv.setUint32(employers + 4, 0x00ffffff, true);
    expect(() => engine.step(state, 1)).toThrow(/^the economy engine stopped: index out of bounds: .+ \(src\/markets\.rs:\d+\)$/);
    expect(engine.figures(engine.create(P, IC, 1356))[FIGURE.periods]).toBe(0); // a fresh instance answers
  });
});

describe("England's economy in the world", () => {
  it('is founded with the world: the starting position of 1356, from the seed of the world', () => {
    const { s, w } = newWorldState();
    const e = s.economy.england!;
    expect(s.v).toBe(STATE_VERSION);
    expect(e.year).toBe(1356); expect(e.halted).toBe('');
    expect(e.figures[FIGURE.periods]).toBe(0);
    expect(Buffer.compare(e.model, w.economyEngine.create(w.englandEconomy.parameters, w.englandEconomy.initialConditions, s.seed))).toBe(0);
    expect(hashState(newWorldState(1357).s)).not.toBe(hashState(s));
  });
  it('computes one period on the first day of each year and none in between', () => {
    const { s, w } = newWorldState();
    const start = s.economy.england!.model;
    days(s, w, 365); // 1356 is a leap year: day 365 is 31 December
    expect(s.economy.england!.model).toBe(start);
    advanceDay(s, w); // 1 January 1357
    const e = s.economy.england!;
    expect(e.year).toBe(1357);
    expect(e.figures[FIGURE.periods]).toBe(1);
    expect(Buffer.compare(e.model, w.economyEngine.step(start, 1))).toBe(0);
    const y1357 = e.model;
    days(s, w, 364);
    expect(s.economy.england!.model).toBe(y1357);
    advanceDay(s, w); // 1 January 1358
    expect(s.economy.england!.year).toBe(1358);
    expect(s.economy.england!.figures[FIGURE.periods]).toBe(2);
  });
  it('is in the snapshot and in its hash: save, load and go on equals going straight on', () => {
    const a = newWorldState(), b = newWorldState();
    days(a.s, a.w, 800);
    days(b.s, b.w, 400);
    const loaded = decodeState(encodeState(b.s));
    expect(loaded.economy.england!.model).toBeInstanceOf(Uint8Array);
    expect(hashState(loaded)).toBe(hashState(b.s));
    days(loaded, b.w, 400);
    expect(hashState(loaded)).toBe(hashState(a.s));
    expect(loaded.economy.england!.year).toBe(1358);
    // the hash sees the economy
    const before = hashState(loaded);
    loaded.economy.england!.model[loaded.economy.england!.model.length - 1] ^= 1;
    expect(hashState(loaded)).not.toBe(before);
  });
  it('does not exist in a world that starts in another year', () => {
    const { s, w } = newWorldState(1492, 1492);
    expect(s.economy.england).toBeNull();
    days(s, w, 400);
    expect(s.economy.england).toBeNull();
    const i = (JSON.parse(readFileSync(dataPath('land.json'), 'utf8')).england.places as number[])[0];
    expect(placeDetail(s, w, i)!.economy).toBeUndefined();
  });
  it('stands still when the engine cannot compute a year, and the world goes on', () => {
    const real = loadWorld();
    let calls = 0;
    const broken: EconomyEngine = { ...real.economyEngine, step: () => { calls++; throw new Error('the economy engine stopped: a rule failed'); } };
    const w: World = Object.assign(Object.create(World.prototype), real, { economyEngine: broken });
    const { s } = newWorldState();
    const before = s.economy.england!.model;
    days(s, w, 366);
    const e = s.economy.england!;
    expect(e.halted).toBe('1357: the economy engine stopped: a rule failed');
    expect(e.year).toBe(1356); expect(e.model).toBe(before);
    days(s, w, 366); // the next year does not try again
    expect(calls).toBe(1);
    expect(s.day).toBe(732);
    const i = (JSON.parse(readFileSync(dataPath('land.json'), 'utf8')).england.places as number[])[0];
    expect(placeDetail(s, real, i)!.economy!.halted).toBe(e.halted);
    computeYear(s, real, 1359); // not even with a working engine: a halted economy stays as it was
    expect(s.economy.england!.year).toBe(1356);
  });
  it('stands still when a year ends without a GDP', () => {
    const real = loadWorld();
    const broken: EconomyEngine = { ...real.economyEngine, figures: (m) => real.economyEngine.figures(m).fill(NaN, FIGURE.realGdp, FIGURE.realGdp + 1) };
    const w: World = Object.assign(Object.create(World.prototype), real, { economyEngine: broken });
    const { s } = newWorldState();
    const before = s.economy.england!.model;
    days(s, w, 366);
    expect(s.economy.england!.halted).toBe('1357: the period ended without a GDP (not a number)');
    expect(s.economy.england!.model).toBe(before);
    expect(Number.isFinite(s.economy.england!.figures[FIGURE.realGdp])).toBe(true);
  });
});

describe('a world saved before England had an economy', () => {
  const older = (s: any) => { const old = countedInPeopleOfTheTime(decodeState(encodeState(s)) as any); delete old.economy; old.v = 3; return decodeState(encodeState(old)); };
  it('gets it when it is loaded', () => {
    const { s, w } = newWorldState();
    const loaded = older(s);
    expect(loaded.v).toBe(3); expect((loaded as any).economy).toBeUndefined();
    expect(hashState(upgradeState(loaded, w))).toBe(hashState(s));
  });
  it('gets it with the years the world has already seen', () => {
    const { s, w } = newWorldState();
    days(s, w, 1000); // 27 September 1358: two periods
    const loaded = upgradeState(older(s), w);
    expect(loaded.economy.england!.year).toBe(1358);
    expect(loaded.economy.england!.figures[FIGURE.periods]).toBe(2);
    expect(hashState(loaded)).toBe(hashState(s));
    days(s, w, 300); days(loaded, w, 300);
    expect(hashState(loaded)).toBe(hashState(s));
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
  it('shows the figures of the last computed year for all of England', () => {
    const { s, w } = newWorldState();
    const london = w.names.indexOf('London');
    expect(places).toContain(london);
    const d0 = placeDetail(s, w, london)!.economy!;
    expect(d0).toMatchObject({ country: 'england', year: 1356, baseYear: 1356, scale: 0.01 });
    expect(d0.realGdp).toBeCloseTo(45247.8, 3);
    expect(d0.realGdpIndex).toBeCloseTo(100, 9); expect(d0.priceIndex).toBeCloseTo(100, 9);
    expect(d0.employed + d0.unemployed).toBe(11221);
    expect(d0.coinHouseholds + d0.coinFirms).toBeCloseTo(11066.5, 3);
    expect(d0.halted).toBeUndefined();
    days(s, w, 366);
    const f = s.economy.england!.figures, d = placeDetail(s, w, london)!.economy!;
    expect(d.year).toBe(1357);
    expect(d.realGdp).toBe(f[FIGURE.realGdp]);
    expect(d.realGdpIndex).toBeCloseTo(100 * f[FIGURE.realGdp] / 45247.8, 6);
    expect(d.priceIndex).toBeCloseTo(100 * f[FIGURE.nominalGdp] / f[FIGURE.realGdp], 6);
    expect(d.consumption).toBe(f[FIGURE.consumption]); expect(d.crown).toBe(f[FIGURE.government]);
    expect(d.investment).toBe(f[FIGURE.investment]); expect(d.exports).toBe(f[FIGURE.exports]); expect(d.imports).toBe(f[FIGURE.imports]);
    // every place of England shows the same economy
    expect(placeDetail(s, w, places[0])!.economy).toEqual(d);
    // GDP is the sum of its uses
    expect(d.consumption + d.crown + f[FIGURE.investment] + d.exports - d.imports).toBeGreaterThan(0.9 * d.realGdp);
  });
});

describe('the world server with the economy', () => {
  it('replays a year change from its command log and resumes from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scw-eco-'));
    try {
      const cfg = { ...configFromEnv({}), dataDir: dir, id: 'eco', snapshotEveryDays: 150, log: () => {} };
      const core = new WorldCore(cfg).init();
      for (let i = 0; i < 400; i++) core.step(); // snapshots at day 150 and 300, 1 January 1357 is day 366
      expect(core.s.economy.england!.year).toBe(1357);
      const fromStart = core.verifyReplay(0), fromLast = core.verifyReplay(300);
      expect(fromStart.hash).toBe(fromStart.live);
      expect(fromLast.hash).toBe(fromLast.live);
      const live = hashState(core.s);
      core.shutdown();
      const again = new WorldCore(cfg).init();
      expect(again.s.day).toBe(400);
      expect(hashState(again.s)).toBe(live);
      again.shutdown();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
