//! The economy engine of the world server: a shell around the unchanged port of BeforeIT.jl, the agent-based model
//! of Poledna, Miess, Hommes and Rabitsch (2023). The shell loads the parameters, computes periods, hands out key
//! figures and saves and loads the state. It changes no rule of the port. Since economy feature 4 it runs the port
//! as the model type of the daily clock ([`clock`]), which replaces two of the port's rules through the port's own
//! mechanism for model types; with a plan and a window of one period that model type is the port itself.
//!
//! The world server holds no model in memory between two periods. It keeps the state as bytes in the state of the
//! world (src/sim/state.ts), hands them in, and gets the next state back. So a period is a function of the state
//! alone, like every other system of the simulation, and a snapshot of the world holds the whole economy.
#![allow(non_snake_case)] // the fields of the port carry the names of the paper's appendix

pub mod clock;
pub mod state;

use beforeit::{
    AbstractModel, Data, InitialConditions, Model, Parameters, Xoshiro, get_accounting_identities, get_accounting_identity_banks,
};
use clock::DailyClock;

/// A national economy: the model of the port and the random number generator it draws from.
#[derive(Clone, Debug, PartialEq)]
pub struct Economy {
    pub model: AbstractModel<DailyClock>,
    pub rng: Xoshiro,
}

/// Number of key figures of [`Economy::figures`].
pub const FIGURES: usize = 16;

/// The sum of a series of the national accounts over the last `window` periods. While fewer periods are computed,
/// the first row (the starting position) stands for the periods before the start.
fn over_window(series: &[f64], computed: usize, window: usize) -> f64 {
    if computed >= window {
        return series[series.len() - window..].iter().sum();
    }
    (window - computed) as f64 * series[0] + series[1..].iter().sum::<f64>()
}

impl Economy {
    /// `Model(parameters, initial_conditions)` of the port from its two JSON objects, with a generator seeded by
    /// `seed`, as the model type of the daily clock: a firm plans every `plan` periods, expectations are formed on
    /// windows of `window` periods. The state holds the starting position and no computed period.
    pub fn new(parameters: &str, initial_conditions: &str, seed: u64, plan: usize, window: usize) -> Result<Economy, String> {
        let p = Parameters::from_json(parameters)?;
        let ic = InitialConditions::from_json(initial_conditions)?;
        let mut rng = Xoshiro::seed_from_u64(seed);
        // the port builds the agents of a model type from those of its own model (the constructor of a model type
        // in BeforeIT.jl): the same agents, and the fields of the clock beside them
        let Model { w_act, w_inact, firms, banks, cb, gov, rotw, agg, prop, data, ext: _ } = Model::new(&p, &ic, &mut rng)?;
        let mut ext = DailyClock::new(plan, window, firms.len())?;
        ext.start = [data.real_gdp[0], data.nominal_gdp[0]];
        Ok(Economy { model: AbstractModel { w_act, w_inact, firms, banks, cb, gov, rotw, agg, prop, data, ext }, rng })
    }

    /// Computes `periods` periods: the port's `run`, one step and one row of its national accounts per period. Of
    /// the rows only the last `window` are kept (no rule of the port reads them).
    pub fn step(&mut self, periods: usize) {
        self.model.run(periods, &mut self.rng);
        let keep = self.model.ext.window;
        let rows = self.model.data.collection_time.len();
        if rows > keep {
            drop_rows(&mut self.model.data, rows - keep);
        }
    }

    /// Periods computed so far.
    pub fn periods(&self) -> usize {
        self.model.agg.t - 1
    }

    /// The key figures. Flows are sums over the last `window` periods (a year of the daily clock); before that many
    /// periods are computed, the starting position stands for the periods before the start. Amounts are in the
    /// model's own units; "real" means at the prices of the starting position. The order is the order of
    /// src/sim/economy/engine.ts.
    pub fn figures(&self) -> [f64; FIGURES] {
        let (m, d) = (&self.model, &self.model.data);
        let (n, window) = (self.periods(), m.ext.window);
        let flow = |v: &[f64]| over_window(v, n, window);
        let sum = |v: &[f64]| v.iter().sum::<f64>();
        let employees = m.w_act.O_h.iter().filter(|o| o.is_some()).count();
        [
            n as f64,
            flow(&d.real_gdp),
            window as f64 * m.ext.start[0],
            flow(&d.nominal_gdp),
            window as f64 * m.ext.start[1],
            flow(&d.real_household_consumption),
            flow(&d.real_government_consumption),
            flow(&d.real_fixed_capitalformation),
            flow(&d.real_exports),
            flow(&d.real_imports),
            employees as f64,
            (m.firms.len() + m.banks.len()) as f64,
            (m.w_act.len() - employees) as f64,
            sum(&m.w_act.D_h) + sum(&m.w_inact.D_h) + sum(&m.firms.D_h) + sum(&m.banks.D_h),
            sum(&m.firms.D_i),
            m.agg.P_bar,
        ]
    }

    /// The port's accounting identities, each 0 up to rounding: value added against incomes, nominal GDP against its
    /// uses, real GDP against its uses (summed over the rows of the national accounts that are kept), the balance
    /// sheet of the central bank, the combined balance sheet of the banks; then nominal GDP summed over those rows,
    /// as the scale to judge the first three by.
    pub fn checks(&self) -> [f64; 6] {
        let (a, b, c) = get_accounting_identities(&self.model.data);
        let (cb, banks) = get_accounting_identity_banks(&self.model);
        [a, b, c, cb, banks, self.model.data.nominal_gdp.iter().sum()]
    }

    /// The state as bytes (see [`state`]).
    pub fn save(&self) -> Vec<u8> {
        state::save(&self.model, &self.rng)
    }

    /// Reads the bytes of [`Economy::save`].
    pub fn load(bytes: &[u8]) -> Result<Economy, String> {
        let (model, rng) = state::load(bytes)?;
        Ok(Economy { model, rng })
    }
}

/// Removes the first `n` rows of the national accounts. Every series is named without `..`: when the port gains a
/// series, this stops compiling instead of keeping it whole.
fn drop_rows(d: &mut Data, n: usize) {
    let Data {
        collection_time, nominal_gdp, real_gdp, nominal_gva, real_gva, nominal_household_consumption, real_household_consumption,
        nominal_government_consumption, real_government_consumption, nominal_capitalformation, real_capitalformation,
        nominal_fixed_capitalformation, real_fixed_capitalformation, nominal_fixed_capitalformation_dwellings,
        real_fixed_capitalformation_dwellings, nominal_exports, real_exports, nominal_imports, real_imports, operating_surplus,
        compensation_employees, wages, taxes_production, gdp_deflator_growth_ea, real_gdp_ea, euribor, nominal_sector_gva,
        real_sector_gva, credit_new_per_bank, credit_stock_per_bank, equity_per_bank, reserves_per_bank, roe_per_bank,
    } = d;
    collection_time.drain(..n);
    for v in [
        nominal_gdp, real_gdp, nominal_gva, real_gva, nominal_household_consumption, real_household_consumption,
        nominal_government_consumption, real_government_consumption, nominal_capitalformation, real_capitalformation,
        nominal_fixed_capitalformation, real_fixed_capitalformation, nominal_fixed_capitalformation_dwellings,
        real_fixed_capitalformation_dwellings, nominal_exports, real_exports, nominal_imports, real_imports, operating_surplus,
        compensation_employees, wages, taxes_production, gdp_deflator_growth_ea, real_gdp_ea, euribor,
    ] {
        v.drain(..n);
    }
    for v in [nominal_sector_gva, real_sector_gva, credit_new_per_bank, credit_stock_per_bank, equity_per_bank, reserves_per_bank, roe_per_bank] {
        v.drain(..n);
    }
}

/// The interface of the WebAssembly file (src/sim/economy/engine.ts is the other side). The caller copies its inputs
/// into memory from [`sce_alloc`], calls a function, and reads the result at [`sce_out_ptr`]. A function returns 1
/// when the result is what was asked for and 0 when it is the text of an error. A rule of the port that fails stops
/// the instance; its message is then at [`sce_panic_ptr`].
pub mod abi {
    use super::Economy;
    use std::cell::{RefCell, UnsafeCell};
    use std::sync::Once;

    thread_local! {
        static OUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
        /// The economy of the state that the last [`sce_step`] or [`sce_create`] handed out, beside that state. A
        /// call that is given exactly these bytes again (the world server computes day after day) takes the economy
        /// from here instead of reading the bytes; any other bytes are read. So the answers stay a function of the
        /// bytes alone.
        static LAST: RefCell<Option<(Vec<u8>, Economy)>> = const { RefCell::new(None) };
    }

    /// The economy of a state, taken out of [`LAST`] when the bytes are those it holds.
    fn take(state: &[u8]) -> Result<Economy, String> {
        match LAST.with(|l| l.borrow_mut().take()) {
            Some((bytes, e)) if bytes == state => Ok(e),
            _ => Economy::load(state),
        }
    }

    /// Hands out the state of `e` and keeps both in [`LAST`].
    fn keep(e: Economy) -> Vec<u8> {
        let bytes = e.save();
        LAST.with(|l| *l.borrow_mut() = Some((bytes.clone(), e)));
        bytes
    }

    /// What `f` says about the economy of a state, which stays in [`LAST`] when it is the one there.
    fn look<T>(state: &[u8], f: impl FnOnce(&Economy) -> T) -> Result<T, String> {
        LAST.with(|l| match &*l.borrow() {
            Some((bytes, e)) if bytes == state => Ok(f(e)),
            _ => Economy::load(state).map(|e| f(&e)),
        })
    }

    struct Panic(UnsafeCell<([u8; 1024], usize)>);
    // SAFETY: a WebAssembly instance runs on one thread.
    unsafe impl Sync for Panic {}
    static PANIC: Panic = Panic(UnsafeCell::new(([0; 1024], 0)));
    static HOOK: Once = Once::new();

    /// Keeps the message of a failing rule where the caller can read it after the instance has stopped: what
    /// failed and where in the source (from `src/` on, so the text does not depend on the machine that built it).
    fn hook() {
        HOOK.call_once(|| {
            std::panic::set_hook(Box::new(|info| {
                let payload = info.payload();
                let said = payload.downcast_ref::<&str>().copied().or_else(|| payload.downcast_ref::<String>().map(String::as_str));
                let mut text = said.unwrap_or("a rule failed").to_string();
                if let Some(l) = info.location() {
                    let file = l.file();
                    let short = file.rfind("/src/").map_or(file, |i| &file[i + 1..]);
                    text.push_str(&format!(" ({short}:{})", l.line()));
                }
                // SAFETY: one thread, and nothing else holds a reference into the buffer while the hook runs.
                let (buf, len) = unsafe { &mut *PANIC.0.get() };
                let n = text.len().min(buf.len());
                buf[..n].copy_from_slice(&text.as_bytes()[..n]);
                *len = n;
            }));
        });
    }

    fn answer(r: Result<Vec<u8>, String>) -> u32 {
        let (ok, bytes) = match r {
            Ok(b) => (1, b),
            Err(e) => (0, e.into_bytes()),
        };
        OUT.with(|o| *o.borrow_mut() = bytes);
        ok
    }

    fn floats(v: &[f64]) -> Vec<u8> {
        v.iter().flat_map(|x| x.to_le_bytes()).collect()
    }

    /// SAFETY: `ptr` and `len` describe memory from [`sce_alloc`] that the caller has filled.
    unsafe fn bytes<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
        if len == 0 { &[] } else { unsafe { std::slice::from_raw_parts(ptr, len) } }
    }

    unsafe fn text<'a>(ptr: *const u8, len: usize, what: &str) -> Result<&'a str, String> {
        std::str::from_utf8(unsafe { bytes(ptr, len) }).map_err(|e| format!("{what} are not text: {e}"))
    }

    /// Memory for an input of `len` bytes.
    #[unsafe(no_mangle)]
    pub extern "C" fn sce_alloc(len: usize) -> *mut u8 {
        let mut v = Vec::<u8>::with_capacity(len.max(1));
        let p = v.as_mut_ptr();
        std::mem::forget(v);
        p
    }

    /// Gives memory from [`sce_alloc`] back.
    ///
    /// # Safety
    ///
    /// `ptr` came from `sce_alloc(len)` and is not used afterwards.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn sce_free(ptr: *mut u8, len: usize) {
        drop(unsafe { Vec::from_raw_parts(ptr, 0, len.max(1)) });
    }

    /// A new economy from the port's parameters and initial conditions (JSON), a 64-bit seed in two halves and the
    /// two lengths of the daily clock ([`Economy::new`]). Result: its state.
    ///
    /// # Safety
    ///
    /// The pointers and lengths describe memory from [`sce_alloc`] that the caller has filled.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn sce_create(
        p: *const u8,
        p_len: usize,
        ic: *const u8,
        ic_len: usize,
        seed_lo: u32,
        seed_hi: u32,
        plan: u32,
        window: u32,
    ) -> u32 {
        hook();
        answer((|| {
            let p = unsafe { text(p, p_len, "the parameters") }?;
            let ic = unsafe { text(ic, ic_len, "the initial conditions") }?;
            let seed = (seed_hi as u64) << 32 | seed_lo as u64;
            Ok(keep(Economy::new(p, ic, seed, plan as usize, window as usize)?))
        })())
    }

    /// Computes `periods` periods from a state. Result: the state after them.
    ///
    /// # Safety
    ///
    /// As [`sce_create`].
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn sce_step(state: *const u8, len: usize, periods: u32) -> u32 {
        hook();
        answer((|| {
            let mut e = take(unsafe { bytes(state, len) })?;
            e.step(periods as usize);
            Ok(keep(e))
        })())
    }

    /// Result: the key figures of a state, [`super::FIGURES`] 64-bit floats.
    ///
    /// # Safety
    ///
    /// As [`sce_create`].
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn sce_figures(state: *const u8, len: usize) -> u32 {
        hook();
        answer(look(unsafe { bytes(state, len) }, |e| floats(&e.figures())))
    }

    /// Result: the accounting identities of a state, six 64-bit floats ([`Economy::checks`]).
    ///
    /// # Safety
    ///
    /// As [`sce_create`].
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn sce_checks(state: *const u8, len: usize) -> u32 {
        hook();
        answer(look(unsafe { bytes(state, len) }, |e| floats(&e.checks())))
    }

    /// Where the result of the last call lies, and how long it is.
    #[unsafe(no_mangle)]
    pub extern "C" fn sce_out_ptr() -> *const u8 {
        OUT.with(|o| o.borrow().as_ptr())
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn sce_out_len() -> usize {
        OUT.with(|o| o.borrow().len())
    }

    /// Where the message of the rule that stopped the instance lies, and how long it is.
    #[unsafe(no_mangle)]
    pub extern "C" fn sce_panic_ptr() -> *const u8 {
        PANIC.0.get() as *const u8
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn sce_panic_len() -> usize {
        // SAFETY: one thread; the hook is not running while the caller asks.
        unsafe { (*PANIC.0.get()).1 }
    }
}
