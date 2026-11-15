//! The economy engine of the world server: a shell around the unchanged port of BeforeIT.jl, the agent-based model
//! of Poledna, Miess, Hommes and Rabitsch (2023). The shell adds no rule and changes none. It does four things:
//! load the parameters, compute periods, hand out key figures, save and load the state.
//!
//! The world server holds no model in memory between two periods. It keeps the state as bytes in the state of the
//! world (src/sim/state.ts), hands them in, and gets the next state back. So a period is a function of the state
//! alone, like every other system of the simulation, and a snapshot of the world holds the whole economy.
#![allow(non_snake_case)] // the fields of the port carry the names of the paper's appendix

pub mod state;

use beforeit::{
    InitialConditions, Model, Parameters, Xoshiro, get_accounting_identities, get_accounting_identity_banks,
};

/// A national economy: the model of the port and the random number generator it draws from.
#[derive(Clone, Debug, PartialEq)]
pub struct Economy {
    pub model: Model,
    pub rng: Xoshiro,
}

/// Number of key figures of [`Economy::figures`].
pub const FIGURES: usize = 15;

impl Economy {
    /// `Model(parameters, initial_conditions)` of the port from its two JSON objects, with a generator seeded by
    /// `seed`. The state holds the starting position and no computed period.
    pub fn new(parameters: &str, initial_conditions: &str, seed: u64) -> Result<Economy, String> {
        let p = Parameters::from_json(parameters)?;
        let ic = InitialConditions::from_json(initial_conditions)?;
        let mut rng = Xoshiro::seed_from_u64(seed);
        let model = Model::new(&p, &ic, &mut rng)?;
        Ok(Economy { model, rng })
    }

    /// Computes `periods` periods: the port's `run`, one step and one entry of its national accounts per period.
    pub fn step(&mut self, periods: usize) {
        self.model.run(periods, &mut self.rng);
    }

    /// Periods computed so far (the national accounts hold the starting position and one entry per period).
    pub fn periods(&self) -> usize {
        self.model.data.collection_time.len().saturating_sub(1)
    }

    /// The key figures of the last period (of the starting position before the first one). Amounts are in the
    /// model's own units; "real" means at the prices of the starting position. The order is the order of
    /// src/sim/economy/engine.ts.
    pub fn figures(&self) -> [f64; FIGURES] {
        let (m, d) = (&self.model, &self.model.data);
        let last = |v: &[f64]| v.last().copied().unwrap_or(f64::NAN);
        let first = |v: &[f64]| v.first().copied().unwrap_or(f64::NAN);
        let sum = |v: &[f64]| v.iter().sum::<f64>();
        let employees = m.w_act.O_h.iter().filter(|o| o.is_some()).count();
        [
            self.periods() as f64,
            last(&d.real_gdp),
            first(&d.real_gdp),
            last(&d.nominal_gdp),
            first(&d.nominal_gdp),
            last(&d.real_household_consumption),
            last(&d.real_government_consumption),
            last(&d.real_fixed_capitalformation),
            last(&d.real_exports),
            last(&d.real_imports),
            employees as f64,
            (m.firms.len() + m.banks.len()) as f64,
            (m.w_act.len() - employees) as f64,
            sum(&m.w_act.D_h) + sum(&m.w_inact.D_h) + sum(&m.firms.D_h) + sum(&m.banks.D_h),
            sum(&m.firms.D_i),
        ]
    }

    /// The port's accounting identities, each 0 up to rounding: value added against incomes, nominal GDP against its
    /// uses, real GDP against its uses (summed over all periods), the balance sheet of the central bank, the combined
    /// balance sheet of the banks; then nominal GDP summed over all periods, as the scale to judge the first three by.
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

    /// A new economy from the port's parameters and initial conditions (JSON) and a 64-bit seed in two halves.
    /// Result: its state.
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
    ) -> u32 {
        hook();
        answer((|| {
            let p = unsafe { text(p, p_len, "the parameters") }?;
            let ic = unsafe { text(ic, ic_len, "the initial conditions") }?;
            let seed = (seed_hi as u64) << 32 | seed_lo as u64;
            Ok(Economy::new(p, ic, seed)?.save())
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
            let mut e = Economy::load(unsafe { bytes(state, len) })?;
            e.step(periods as usize);
            Ok(e.save())
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
        answer(Economy::load(unsafe { bytes(state, len) }).map(|e| floats(&e.figures())))
    }

    /// Result: the accounting identities of a state, six 64-bit floats ([`Economy::checks`]).
    ///
    /// # Safety
    ///
    /// As [`sce_create`].
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn sce_checks(state: *const u8, len: usize) -> u32 {
        hook();
        answer(Economy::load(unsafe { bytes(state, len) }).map(|e| floats(&e.checks())))
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
