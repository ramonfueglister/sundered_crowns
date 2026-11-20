//! The economy engine of the world server: a shell around the unchanged port of BeforeIT.jl, the agent-based model
//! of Poledna, Miess, Hommes and Rabitsch (2023). The shell loads the parameters, computes periods, hands out key
//! figures and saves and loads the state. It changes no rule of the port. It runs the port as the model type of the
//! daily clock ([`clock`]), which replaces rules through the port's own mechanism for model types; with a plan and
//! a window of one period and without merchants that model type is the port itself.
//!
//! An [`Economy`] is one economy of the port. The world has [`trade::Cities`]: every city is an economy, and the
//! merchants between them are each city's rest of the world ([`trade`]).
//!
//! The world server holds no model in memory between two periods. It keeps the state as bytes in the state of the
//! world (src/sim/state.ts), hands them in, and gets the next state back. So a period is a function of the state
//! alone, like every other system of the simulation, and a snapshot of the world holds all economies.
#![allow(non_snake_case)] // the fields of the port carry the names of the paper's appendix

pub mod clock;
pub mod past;
pub mod state;
pub mod trade;
pub mod workers;

use beforeit::{
    AbstractModel, Data, InitialConditions, Model, Parameters, Xoshiro, get_accounting_identities,
    get_accounting_identity_banks,
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
/// Numbers of a worker, of a firm and of another person in [`Economy::agents`].
pub const WORKER: usize = 5;
pub const FIRM: usize = 8;
pub const PERSON: usize = 3;

/// Number of series of the national accounts that [`Economy::figures`] sums over a window.
pub const SUMMED: usize = 7;

/// Row `t` of the series of the national accounts that [`Economy::figures`] sums over a window, in this order: real
/// and nominal GDP, real consumption of the households and of the government, real fixed capital formation, real
/// exports and real imports.
pub(crate) fn summed(d: &Data, t: usize) -> [f64; SUMMED] {
    [
        d.real_gdp[t],
        d.nominal_gdp[t],
        d.real_household_consumption[t],
        d.real_government_consumption[t],
        d.real_fixed_capitalformation[t],
        d.real_exports[t],
        d.real_imports[t],
    ]
}

/// The sum of series `k` of the kept rows ([`clock::DailyClock::accounts`]) over the last `window` periods. While
/// fewer periods are computed, the first row is the starting position and stands for the periods before the start.
fn over_window(rows: &[[f64; SUMMED]], k: usize, computed: usize, window: usize) -> f64 {
    if computed >= window {
        return rows[rows.len() - window..].iter().map(|r| r[k]).sum();
    }
    (window - computed) as f64 * rows[0][k] + rows[1..].iter().map(|r| r[k]).sum::<f64>()
}

impl Economy {
    /// `Model(parameters, initial_conditions)` of the port from its two JSON objects, with a generator seeded by
    /// `seed`, as the model type of the daily clock: a firm plans every `plan` periods, expectations are formed on
    /// windows of `window` periods. The state holds the starting position and no computed period.
    pub fn new(
        parameters: &str,
        initial_conditions: &str,
        seed: u64,
        plan: usize,
        window: usize,
    ) -> Result<Economy, String> {
        let p = Parameters::from_json(parameters)?;
        let ic = InitialConditions::from_json(initial_conditions)?;
        let mut rng = Xoshiro::seed_from_u64(seed);
        // the port builds the agents of a model type from those of its own model (the constructor of a model type
        // in BeforeIT.jl): the same agents, and the fields of the clock beside them
        let Model {
            w_act,
            w_inact,
            firms,
            banks,
            cb,
            gov,
            rotw,
            agg,
            prop,
            data,
            ext: _,
        } = Model::new(&p, &ic, &mut rng)?;
        let mut ext = DailyClock::new(plan, window, firms.len())?;
        ext.start = [data.real_gdp[0], data.nominal_gdp[0]];
        ext.accounts = vec![summed(&data, 0)];
        Ok(Economy {
            model: AbstractModel {
                w_act,
                w_inact,
                firms,
                banks,
                cb,
                gov,
                rotw,
                agg,
                prop,
                data,
                ext,
            },
            rng,
        })
    }

    /// The same economy with wages paid in money from now on (economy feature 7, [`clock`]): every firm keeps the
    /// wage it pays today as an amount of money, instead of a real wage that follows the consumer prices.
    pub fn with_wages_in_money(mut self) -> Economy {
        self.model
            .ext
            .pay_in_money(&self.model.firms.w_bar_i, self.model.agg.P_bar_HH);
        self
    }

    /// The same economy with the demand pull of CANVAS from now on (economy feature 8, [`clock`]): a planning firm
    /// changes its supply or its price by the gap between the demand it met and the supply it had planned. As the
    /// port's CANVAS model does at its start (`firms.Q_s_i .= firms.Q_d_i` in init_CANVAS.jl), the supply every firm
    /// had planned is set to the demand it met last, so that the first gap is 0 and not a division by 0.
    ///
    /// The clock lets every planning firm adjust, which is the port's `theta_calvo` of 1; parameters that say
    /// otherwise are refused.
    pub fn with_demand_pull(mut self) -> Result<Economy, String> {
        let theta_calvo = self.model.prop.theta_calvo;
        if theta_calvo != 1.0 {
            return Err(format!(
                "theta_calvo = {theta_calvo}: with the demand pull every planning firm adjusts (theta_calvo = 1)"
            ));
        }
        let f = &mut self.model.firms;
        f.Q_s_i.clone_from(&f.Q_d_i);
        self.model.ext.demand_pull = true;
        Ok(self)
    }

    /// The same economy with households that spend out of their savings from now on (economy feature 15, [`clock`]):
    /// per period the share `share` of what a household holds above its target, the deposits the calibration gives
    /// the households relative to their budgets. 0 is the rule of the port.
    pub fn with_savings_spent(mut self, share: f64) -> Result<Economy, String> {
        if !(0.0..=1.0).contains(&share) {
            return Err(format!(
                "a share of {share} of the savings spent per period: between 0 and 1"
            ));
        }
        self.model.ext.savings = share;
        Ok(self)
    }

    /// The same economy with a crown that buys with what it took in from now on (economy feature 16, [`clock`]): its
    /// budget of a period is its revenue of the period before, less the benefits and the interest it paid then.
    /// Without it the crown's purchases follow the series of the paper, whatever the crown takes in.
    pub fn with_crown_spending_revenue(mut self) -> Economy {
        self.model.ext.crown_revenue = true;
        self
    }

    /// The same economy with firms and owners that are one household from now on (economy feature 18, [`clock`]): an
    /// owner's income is the firm's profit without the change of its stock, and the owner bears a loss as he holds a
    /// profit. Without it the owner is paid the profit of the paper, unsold stock included, and bears no loss.
    pub fn with_owner_household(mut self) -> Economy {
        self.model.ext.owner = true;
        self
    }

    /// Computes `periods` periods: the port's `run`, one step and one row of its national accounts per period. No
    /// rule of the port reads these rows. Of every new row the clock keeps the series that [`Economy::figures`]
    /// sums, for the last `window` periods ([`clock::DailyClock::accounts`]); of the port's rows only the last
    /// stays.
    ///
    /// An economy that keeps its past in a fixed size ([`Economy::with_bounded_past`]) computes every period as the
    /// port's first: the port appends the real GDP and the inflation of a period to its lists at the place its
    /// count of periods gives, so the count is set back and the two values go to the clock.
    pub fn step(&mut self, periods: usize) {
        if self.model.ext.past.is_none() {
            self.model.run(periods, &mut self.rng);
        } else {
            for _ in 0..periods {
                self.model.run(1, &mut self.rng);
                let m = &mut self.model;
                let (Y, pi) = (
                    m.agg.Y.pop().expect("the port appends the real GDP of a period"),
                    m.agg.pi_.pop().expect("the port appends the inflation of a period"),
                );
                m.agg.t = 1;
                let past = m.ext.past.as_mut().expect("checked above");
                past.Y.push(past.periods, Y);
                past.pi.push(past.periods, pi);
                past.periods += 1;
            }
        }
        take_rows(&mut self.model);
    }

    /// Periods computed so far.
    pub fn periods(&self) -> usize {
        self.model.ext.periods_computed(self.model.agg.t)
    }

    /// The same economy with the working days of its firms and households for its next `days` periods (economy
    /// feature 19, [`clock::Attendance`]): per calendar and kind of day the factor of the flows of a firm or a
    /// household (`kinds` numbers a calendar), per calendar the kind of each of the days, per firm its calendar (and
    /// its owner's), and per household that owns no firm its calendar: the workers, the persons who do not work and
    /// the owners of the banks, in the port's order. They take the place of the days it had; after them every period
    /// is a working day of the factor 1 again.
    pub fn with_working_days(
        mut self,
        days: usize,
        kinds: usize,
        factor: Vec<f64>,
        day: Vec<u8>,
        calendar: Vec<u8>,
        household: Vec<u8>,
    ) -> Result<Economy, String> {
        let m = &self.model;
        let (firms, households) = (m.firms.len(), m.w_act.len() + m.w_inact.len() + m.banks.len());
        if calendar.len() != firms || household.len() != households {
            return Err(format!(
                "working days for {} firms and {} households of an economy of {firms} firms and {households} other \
                 households",
                calendar.len(),
                household.len()
            ));
        }
        self.model.ext.attendance =
            clock::Attendance::new(self.periods() + 1, days, kinds, factor, day, calendar, household)?;
        Ok(self)
    }

    /// The same economy with a past of a fixed size from now on ([`past`]): for the expectations of growth and
    /// inflation it keeps, instead of the real GDP and the inflation of every period since the start, the values of
    /// the last window and the sums that the port's estimate is made of. The rule is the port's; its results agree
    /// with the estimate on the whole past up to rounding, not bit for bit. The lists of the port go back to the
    /// history before the start and its count of periods to 1; [`Economy::periods`] goes on counting. An economy
    /// that has it already stays as it is.
    pub fn with_bounded_past(mut self) -> Economy {
        let m = &mut self.model;
        if m.ext.past.is_none() {
            let (history, window) = (m.prop.T_prime, m.ext.window);
            let n = history + m.agg.t - 1;
            m.ext.past = Some(past::Past {
                periods: m.agg.t - 1,
                Y: past::Series::new(&m.agg.Y[..n], history, window, true),
                pi: past::Series::new(&m.agg.pi_[..n], history, window, false),
            });
            m.agg.Y.truncate(history);
            m.agg.pi_.truncate(history);
            m.agg.t = 1;
        }
        self
    }

    /// The key figures. Flows are sums over the last `window` periods (a year of the daily clock); before that many
    /// periods are computed, the starting position stands for the periods before the start. Amounts are in the
    /// model's own units; "real" means at the prices of the starting position. The order is the order of
    /// src/sim/economy/engine.ts.
    pub fn figures(&self) -> [f64; FIGURES] {
        let m = &self.model;
        let (n, window) = (self.periods(), m.ext.window);
        let flow = |k: usize| over_window(&m.ext.accounts, k, n, window);
        let sum = |v: &[f64]| v.iter().sum::<f64>();
        let employees = m.w_act.O_h.iter().filter(|o| o.is_some()).count();
        [
            n as f64,
            flow(0),
            window as f64 * m.ext.start[0],
            flow(1),
            window as f64 * m.ext.start[1],
            flow(2),
            flow(3),
            flow(4),
            flow(5),
            flow(6),
            employees as f64,
            (m.firms.len() + m.banks.len()) as f64,
            (m.w_act.len() - employees) as f64,
            sum(&m.w_act.D_h) + sum(&m.w_inact.D_h) + sum(&m.firms.D_h) + sum(&m.banks.D_h),
            sum(&m.firms.D_i),
            m.agg.P_bar,
        ]
    }

    /// The persons and the firms of the economy one by one (economy feature 10): what the world writes to the persons
    /// and firms of its city after every day. First four counts: the workers, the firms, the banks and the persons
    /// who do not work, each in the order of the port's lists (a position in a list never changes: the cities of the
    /// game neither add nor delete an agent). Then, with amounts of money in the units of the calibration and flows
    /// for the last period:
    ///
    /// - for every worker [`WORKER`] numbers: the firm that employs the person (its position, −1 without work), the
    ///   wage in money for the period before tax (0 without work), the disposable income (A.53), the deposits (A.54)
    ///   and what the person spent on consumption (A.48);
    /// - for every firm [`FIRM`] numbers: the sector, the employees (A.24), the production (A.13), the price (A.8),
    ///   the wage in money it pays a person for the period, and of its owner the income, the deposits and the
    ///   consumption;
    /// - for the owner of every bank and for every person who does not work [`PERSON`] numbers: the income, the
    ///   deposits and the consumption.
    ///
    /// The wage a firm pays is what the port books for the period: the firm's real wage of the period, which holds
    /// the effort of its people (A.26), times the consumer price level at the end of the period (A.53 computes the
    /// worker's income from it). Where the firms pay wages in money ([`clock::DailyClock::pay_in_money`]) the real
    /// wage is the wage in money over the price level at the start of the period, so the amount paid is the wage in
    /// money times the effort times the change of the price level within the period. In the starting position no
    /// period is computed and nothing is paid yet: the wage is 0.
    pub fn agents(&self) -> Vec<f64> {
        let m = &self.model;
        let (w, f, b, x) = (&m.w_act, &m.firms, &m.banks, &m.w_inact);
        let pay = |i: usize| f.w_i[i] * m.agg.P_bar_HH;
        let mut v = Vec::with_capacity(4 + WORKER * w.len() + FIRM * f.len() + PERSON * (b.Y_h.len() + x.len()));
        v.extend([w.len() as f64, f.len() as f64, b.Y_h.len() as f64, x.len() as f64]);
        for h in 0..w.len() {
            let firm = w.O_h[h].map(|id| f.index(id));
            v.extend([
                firm.map_or(-1.0, |i| i as f64),
                firm.map_or(0.0, pay),
                w.Y_h[h],
                w.D_h[h],
                w.C_h[h],
            ]);
        }
        for i in 0..f.len() {
            v.extend([
                f.G_i[i] as f64,
                f.N_i[i] as f64,
                f.Y_i[i],
                f.P_i[i],
                pay(i),
                f.Y_h[i],
                f.D_h[i],
                f.C_h[i],
            ]);
        }
        for k in 0..b.Y_h.len() {
            v.extend([b.Y_h[k], b.D_h[k], b.C_h[k]]);
        }
        for h in 0..x.len() {
            v.extend([x.Y_h[h], x.D_h[h], x.C_h[h]]);
        }
        v
    }

    /// The port's accounting identities, each 0 up to rounding: value added against incomes, nominal GDP against its
    /// uses, real GDP against its uses (each for the last period computed), the balance sheet of the central bank,
    /// the combined balance sheet of the banks; then the nominal GDP of that period, as the scale to judge the first
    /// three by.
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

/// Moves the rows of the national accounts that the port has added since the last call into the rows the clock keeps
/// (the series of [`summed`], for the last `window` periods), and leaves the port its last row alone. All series of
/// the port keep the same length: its collector writes a new row at the position the first series gives.
pub(crate) fn take_rows(m: &mut AbstractModel<DailyClock>) {
    let rows = m.data.collection_time.len();
    for t in 1..rows {
        let row = summed(&m.data, t);
        m.ext.accounts.push(row);
    }
    let kept = m.ext.accounts.len();
    if kept > m.ext.window {
        m.ext.accounts.drain(..kept - m.ext.window);
    }
    drop_rows(&mut m.data, rows - 1);
}

/// Removes the first `n` rows of the national accounts. Every series is named without `..`: when the port gains a
/// series, this stops compiling instead of keeping it whole.
fn drop_rows(d: &mut Data, n: usize) {
    let Data {
        collection_time,
        nominal_gdp,
        real_gdp,
        nominal_gva,
        real_gva,
        nominal_household_consumption,
        real_household_consumption,
        nominal_government_consumption,
        real_government_consumption,
        nominal_capitalformation,
        real_capitalformation,
        nominal_fixed_capitalformation,
        real_fixed_capitalformation,
        nominal_fixed_capitalformation_dwellings,
        real_fixed_capitalformation_dwellings,
        nominal_exports,
        real_exports,
        nominal_imports,
        real_imports,
        operating_surplus,
        compensation_employees,
        wages,
        taxes_production,
        gdp_deflator_growth_ea,
        real_gdp_ea,
        euribor,
        nominal_sector_gva,
        real_sector_gva,
        credit_new_per_bank,
        credit_stock_per_bank,
        equity_per_bank,
        reserves_per_bank,
        roe_per_bank,
    } = d;
    collection_time.drain(..n);
    for v in [
        nominal_gdp,
        real_gdp,
        nominal_gva,
        real_gva,
        nominal_household_consumption,
        real_household_consumption,
        nominal_government_consumption,
        real_government_consumption,
        nominal_capitalformation,
        real_capitalformation,
        nominal_fixed_capitalformation,
        real_fixed_capitalformation,
        nominal_fixed_capitalformation_dwellings,
        real_fixed_capitalformation_dwellings,
        nominal_exports,
        real_exports,
        nominal_imports,
        real_imports,
        operating_surplus,
        compensation_employees,
        wages,
        taxes_production,
        gdp_deflator_growth_ea,
        real_gdp_ea,
        euribor,
    ] {
        v.drain(..n);
    }
    for v in [
        nominal_sector_gva,
        real_sector_gva,
        credit_new_per_bank,
        credit_stock_per_bank,
        equity_per_bank,
        reserves_per_bank,
        roe_per_bank,
    ] {
        v.drain(..n);
    }
}

/// The cities with the working days of their firms and households (economy feature 19) as bytes: per city the number
/// of its calendars, of the kinds of a day and of the days (32 bits each), per calendar and kind the factor of the
/// flows (64-bit floats), per calendar the kind of every day (a byte each), the number of its firms (32 bits) and the
/// calendar of every firm (a byte each), the number of its other households (32 bits) and the calendar of each (a byte
/// each, [`Economy::with_working_days`]).
pub fn working_days(all: &mut trade::Cities, mut r: &[u8]) -> Result<(), String> {
    fn take_bytes<'a>(r: &mut &'a [u8], n: usize) -> Result<&'a [u8], String> {
        if r.len() < n {
            return Err(format!(
                "the working days end after {} more bytes, {n} were read",
                r.len()
            ));
        }
        let (head, rest) = r.split_at(n);
        *r = rest;
        Ok(head)
    }
    let u32_ = |r: &mut &[u8]| -> Result<usize, String> {
        Ok(u32::from_le_bytes(take_bytes(r, 4)?.try_into().unwrap()) as usize)
    };
    let mut cities = Vec::with_capacity(all.cities.len());
    for (c, e) in std::mem::take(&mut all.cities).into_iter().enumerate() {
        let (calendars, kinds, n) = (u32_(&mut r)?, u32_(&mut r)?, u32_(&mut r)?);
        let factor = take_bytes(&mut r, 8 * calendars * kinds)?
            .chunks_exact(8)
            .map(|b| f64::from_le_bytes(b.try_into().unwrap()))
            .collect();
        let day = take_bytes(&mut r, calendars * n)?.to_vec();
        let firms = u32_(&mut r)?;
        let calendar = take_bytes(&mut r, firms)?.to_vec();
        let households = u32_(&mut r)?;
        let household = take_bytes(&mut r, households)?.to_vec();
        cities.push(
            e.with_working_days(n, kinds, factor, day, calendar, household)
                .map_err(|e| format!("city {c}: {e}"))?,
        );
    }
    if !r.is_empty() {
        return Err(format!(
            "{} bytes of working days are left over after the cities",
            r.len()
        ));
    }
    all.cities = cities;
    Ok(())
}

/// The interface of the WebAssembly file (src/sim/economy/engine.ts is the other side). The caller copies its inputs
/// into memory from [`sce_alloc`], calls a function, and reads the result at [`sce_out_ptr`]. A function returns 1
/// when the result is what was asked for and 0 when it is the text of an error. A rule of the port that fails stops
/// the instance; its message is then at [`sce_panic_ptr`].
pub mod abi {
    use super::Economy;
    use crate::trade::Cities;
    use std::cell::{RefCell, UnsafeCell};
    use std::rc::Rc;
    use std::sync::Once;

    thread_local! {
        /// The result of the last call.
        static OUT: RefCell<Rc<Vec<u8>>> = RefCell::new(Rc::new(Vec::new()));
        /// The cities of the state that the last [`sce_step`] or [`sce_create`] handed out, beside that state. A
        /// call that is given exactly these bytes again (the world server computes day after day) takes the cities
        /// from here instead of reading the bytes; any other bytes are read. So the answers stay a function of the
        /// bytes alone. The bytes are the same list as the result in [`OUT`], not a copy: the state of a world is
        /// tens of megabytes, and the memory of an instance never shrinks.
        /// The bytes are `None` after [`sce_advance_last`] until [`sce_save_last`] writes them: the world computes
        /// day after day and needs the bytes of its economies only for a snapshot.
        static LAST: RefCell<Option<Last>> = const { RefCell::new(None) };
    }

    /// What [`LAST`] holds: the bytes of a state (or `None` until they are written) and its cities.
    type Last = (Option<Rc<Vec<u8>>>, Cities);

    /// The cities of a state, taken out of [`LAST`] when the bytes are those it holds. The result of the call before
    /// is given up first, so that the bytes it shares with [`LAST`] are free before the next state is written.
    fn take(state: &[u8]) -> Result<Cities, String> {
        OUT.with(|o| *o.borrow_mut() = Rc::new(Vec::new()));
        match LAST.with(|l| l.borrow_mut().take()) {
            Some((Some(bytes), all)) if *bytes == state => Ok(all),
            _ => Cities::load(state),
        }
    }

    /// The cities that [`LAST`] holds, for the calls that are told to take them without being given their bytes.
    fn take_last() -> Result<Cities, String> {
        OUT.with(|o| *o.borrow_mut() = Rc::new(Vec::new()));
        LAST.with(|l| l.borrow_mut().take())
            .map(|(_, all)| all)
            .ok_or_else(|| "no state is kept from the call before".to_string())
    }

    /// What `f` says about the cities that [`LAST`] holds.
    fn look_last<T>(f: impl FnOnce(&Cities) -> T) -> Result<T, String> {
        LAST.with(|l| {
            l.borrow()
                .as_ref()
                .map(|(_, all)| f(all))
                .ok_or_else(|| "no state is kept from the call before".to_string())
        })
    }

    /// Hands out the state of `all` and keeps both in [`LAST`].
    fn keep(all: Cities) -> Rc<Vec<u8>> {
        let bytes = Rc::new(all.save());
        LAST.with(|l| *l.borrow_mut() = Some((Some(bytes.clone()), all)));
        bytes
    }

    /// What `f` says about the cities of a state, which stay in [`LAST`] when they are the ones there.
    fn look<T>(state: &[u8], f: impl FnOnce(&Cities) -> T) -> Result<T, String> {
        LAST.with(|l| match &*l.borrow() {
            Some((Some(bytes), all)) if **bytes == state => Ok(f(all)),
            _ => Cities::load(state).map(|all| f(&all)),
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
                let said = payload
                    .downcast_ref::<&str>()
                    .copied()
                    .or_else(|| payload.downcast_ref::<String>().map(String::as_str));
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

    fn answer(r: Result<Rc<Vec<u8>>, String>) -> u32 {
        let (ok, bytes) = match r {
            Ok(b) => (1, b),
            Err(e) => (0, Rc::new(e.into_bytes())),
        };
        OUT.with(|o| *o.borrow_mut() = bytes);
        ok
    }

    fn floats(v: impl IntoIterator<Item = f64>) -> Rc<Vec<u8>> {
        let v = v.into_iter();
        let mut out = Vec::with_capacity(8 * v.size_hint().0);
        for x in v {
            out.extend_from_slice(&x.to_le_bytes());
        }
        Rc::new(out)
    }

    /// The lists of every city one after the other as [`floats`]: one list of bytes of the right length at once
    /// (the persons and firms of 550 cities are 1.3 million numbers: byte by byte through a flattening iterator,
    /// they were a tenth of the time of a day of the world).
    fn float_lists(lists: impl IntoIterator<Item = Vec<f64>>) -> Rc<Vec<u8>> {
        let lists: Vec<Vec<f64>> = lists.into_iter().collect();
        let mut out = Vec::with_capacity(8 * lists.iter().map(Vec::len).sum::<usize>());
        for l in &lists {
            for x in l {
                out.extend_from_slice(&x.to_le_bytes());
            }
        }
        Rc::new(out)
    }

    /// SAFETY: `ptr` and `len` describe memory from [`sce_alloc`] that the caller has filled.
    unsafe fn bytes<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
        if len == 0 {
            &[]
        } else {
            unsafe { std::slice::from_raw_parts(ptr, len) }
        }
    }

    /// The cities of a list as [`sce_create`] takes it: for every city the 64-bit seed, then the parameters and the
    /// initial conditions of the port (JSON), each with its length in 32 bits before it; all little endian.
    #[allow(clippy::too_many_arguments)] // the arguments of sce_create, one by one
    fn cities(
        mut list: &[u8],
        plan: usize,
        window: usize,
        wage: u32,
        prices: u32,
        savings: f64,
        crown: u32,
        owner: u32,
    ) -> Result<Cities, String> {
        fn take<'a>(list: &mut &'a [u8], n: usize) -> Result<&'a [u8], String> {
            if list.len() < n {
                return Err(format!("the list of cities ends {} bytes early", n - list.len()));
            }
            let (head, rest) = list.split_at(n);
            *list = rest;
            Ok(head)
        }
        fn text<'a>(list: &mut &'a [u8], what: &str, c: usize) -> Result<&'a str, String> {
            let n = u32::from_le_bytes(take(list, 4)?.try_into().unwrap()) as usize;
            std::str::from_utf8(take(list, n)?).map_err(|e| format!("{what} of city {c} are not text: {e}"))
        }
        if wage > 1 {
            return Err(format!(
                "wages of kind {wage}: 0 is the port's wage that follows the prices, 1 the wage in money"
            ));
        }
        if prices > 1 {
            return Err(format!(
                "prices of kind {prices}: 0 is the paper's rule of costs, 1 the demand pull of CANVAS"
            ));
        }
        if crown > 1 {
            return Err(format!(
                "a crown of kind {crown}: 0 buys by the paper's series, 1 with what it took in"
            ));
        }
        if owner > 1 {
            return Err(format!(
                "an owner of kind {owner}: 0 is paid the paper's profit and bears no loss, 1 is one household with the firm"
            ));
        }
        let mut all = Vec::new();
        while !list.is_empty() {
            let c = all.len();
            let seed = u64::from_le_bytes(take(&mut list, 8)?.try_into().unwrap());
            let p = text(&mut list, "the parameters", c)?;
            let ic = text(&mut list, "the initial conditions", c)?;
            let e = Economy::new(p, ic, seed, plan, window).map_err(|e| format!("city {c}: {e}"))?;
            let e = if wage == 1 { e.with_wages_in_money() } else { e };
            let e = if prices == 1 {
                e.with_demand_pull().map_err(|e| format!("city {c}: {e}"))?
            } else {
                e
            };
            let e = e.with_savings_spent(savings).map_err(|e| format!("city {c}: {e}"))?;
            let e = if crown == 1 { e.with_crown_spending_revenue() } else { e };
            let e = if owner == 1 { e.with_owner_household() } else { e };
            // the cities of the game run for centuries: their past has a fixed size
            all.push(e.with_bounded_past());
        }
        Cities::new(all)
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

    /// New cities that trade with each other, from a list of cities (for every city the 64-bit seed, then the
    /// port's parameters and initial conditions as JSON, each with its length in 32 bits before it) and the two
    /// lengths of the daily clock ([`Economy::new`], [`Cities::new`]) and the kind of wages: 0 for the port's wage
    /// that follows the consumer prices, 1 for the wage in money ([`Economy::with_wages_in_money`]); and the kind
    /// of prices: 0 for the paper's rule of costs, 1 for the demand pull of CANVAS ([`Economy::with_demand_pull`]);
    /// and the share of the savings above their target that households spend per period, 0 for the port's rule
    /// ([`Economy::with_savings_spent`]); and the crown: 0 buys by the paper's series, 1 with what it took in
    /// ([`Economy::with_crown_spending_revenue`]); and the owner of a firm: 0 is paid the paper's profit and bears no
    /// loss, 1 is one household with the firm ([`Economy::with_owner_household`]). Result: their state.
    ///
    /// # Safety
    ///
    /// The pointer and the length describe memory from [`sce_alloc`] that the caller has filled.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn sce_create(
        list: *const u8,
        len: usize,
        plan: u32,
        window: u32,
        wage: u32,
        prices: u32,
        savings: f64,
        crown: u32,
        owner: u32,
    ) -> u32 {
        hook();
        answer(
            cities(
                unsafe { bytes(list, len) },
                plan as usize,
                window as usize,
                wage,
                prices,
                savings,
                crown,
                owner,
            )
            .map(keep),
        )
    }

    /// The cities of a state that has not computed a period, with distance between them (economy feature 17,
    /// [`Cities::with_routes`]). The routes are, little endian: the elasticity of the stock to keep and, per
    /// product, the tonnes of a real unit (64-bit floats); then for every city of origin and every city of
    /// destination the days of travel (32 bits, 0 for no way) and the days of labour that carry a tonne (64-bit
    /// float). Result: their state.
    ///
    /// # Safety
    ///
    /// As [`sce_create`], for both pairs of pointer and length.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn sce_routes(state: *const u8, len: usize, routes: *const u8, routes_len: usize) -> u32 {
        hook();
        answer((|| {
            let all = take(unsafe { bytes(state, len) })?;
            let (n, G) = (all.cities.len(), all.merchants.bought.len());
            let r = unsafe { bytes(routes, routes_len) };
            if r.len() != 8 + 8 * G + 12 * n * n {
                return Err(format!(
                    "routes of {} bytes do not fit {n} cities with {G} products",
                    r.len()
                ));
            }
            let f = |at: usize| f64::from_le_bytes(r[at..at + 8].try_into().unwrap());
            let weight = (0..G).map(|g| f(8 + 8 * g)).collect();
            let (mut days, mut labour, mut at) = (vec![vec![0; n]; n], vec![vec![0.0; n]; n], 8 + 8 * G);
            for c in 0..n {
                for d in 0..n {
                    days[c][d] = u32::from_le_bytes(r[at..at + 4].try_into().unwrap()) as usize;
                    labour[c][d] = f(at + 4);
                    at += 12;
                }
            }
            Ok(keep(all.with_routes(days, labour, weight, f(0))?))
        })())
    }

    /// The cities of a state with the working days of their firms from their next period on (economy feature 19,
    /// [`Economy::with_working_days`]). The days are, little endian, for every city in its order: the number of its
    /// calendars, of the kinds of a day and of the days (32 bits each), per calendar and kind the factor of a firm's
    /// flows (64-bit floats), per calendar the kind of every day (a byte each), the number of its firms (32 bits) and
    /// the calendar of every firm (a byte each), the number of its other households (32 bits) and the calendar of each
    /// (a byte each, [`Economy::with_working_days`]). Result: their state.
    ///
    /// # Safety
    ///
    /// As [`sce_create`], for both pairs of pointer and length.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn sce_working_days(state: *const u8, len: usize, days: *const u8, days_len: usize) -> u32 {
        hook();
        answer((|| {
            let mut all = take(unsafe { bytes(state, len) })?;
            crate::working_days(&mut all, unsafe { bytes(days, days_len) })?;
            Ok(keep(all))
        })())
    }

    /// The cities of a state with the workers who are away from their next period on, as [`crate::absences`] reads
    /// them (economy feature 22). Result: their state.
    ///
    /// # Safety
    ///
    /// As [`sce_create`], for both pairs of pointer and length.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn sce_absences(state: *const u8, len: usize, list: *const u8, list_len: usize) -> u32 {
        hook();
        answer((|| {
            let mut all = take(unsafe { bytes(state, len) })?;
            crate::workers::absences(&mut all, unsafe { bytes(list, list_len) })?;
            Ok(keep(all))
        })())
    }

    /// The cities of a state with their contracts from their next period on, as [`crate::workers::contracts`] reads
    /// them (economy feature 23). Result: their state.
    ///
    /// # Safety
    ///
    /// As [`sce_create`], for both pairs of pointer and length.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn sce_contracts(state: *const u8, len: usize, list: *const u8, list_len: usize) -> u32 {
        hook();
        answer((|| {
            let mut all = take(unsafe { bytes(state, len) })?;
            crate::workers::contracts(&mut all, unsafe { bytes(list, list_len) })?;
            Ok(keep(all))
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
            let mut all = take(unsafe { bytes(state, len) })?;
            // cities from before the past of a fixed size take it on the day they are computed again
            all.cities = std::mem::take(&mut all.cities)
                .into_iter()
                .map(Economy::with_bounded_past)
                .collect();
            all.step(periods as usize);
            Ok(keep(all))
        })())
    }

    /// As [`sce_step`], from the state that the call before handed out (kept in [`LAST`]), without being given its
    /// bytes again: the caller saves copying tens of megabytes into the instance and comparing them every day.
    #[unsafe(no_mangle)]
    pub extern "C" fn sce_step_last(periods: u32) -> u32 {
        hook();
        answer((|| {
            let mut all = take_last()?;
            all.cities = std::mem::take(&mut all.cities)
                .into_iter()
                .map(Economy::with_bounded_past)
                .collect();
            all.step(periods as usize);
            Ok(keep(all))
        })())
    }

    /// As [`sce_step_last`], but the state after the periods stays in [`LAST`] without its bytes: the result is
    /// empty, and [`sce_save_last`] gives the bytes when they are needed. Writing the state of a world (some 50 MB)
    /// every day took as long as computing the day.
    #[unsafe(no_mangle)]
    pub extern "C" fn sce_advance_last(periods: u32) -> u32 {
        hook();
        answer((|| {
            let mut all = take_last()?;
            all.cities = std::mem::take(&mut all.cities)
                .into_iter()
                .map(Economy::with_bounded_past)
                .collect();
            all.step(periods as usize);
            LAST.with(|l| *l.borrow_mut() = Some((None, all)));
            Ok(Rc::new(Vec::new()))
        })())
    }

    /// Result: the bytes of the state kept in [`LAST`], written now if [`sce_advance_last`] left them out.
    #[unsafe(no_mangle)]
    pub extern "C" fn sce_save_last() -> u32 {
        hook();
        answer(LAST.with(|l| match &mut *l.borrow_mut() {
            Some((Some(bytes), _)) => Ok(bytes.clone()),
            Some((none, all)) => {
                let bytes = Rc::new(all.save());
                *none = Some(bytes.clone());
                Ok(bytes)
            }
            None => Err("no state is kept from the call before".to_string()),
        }))
    }

    /// As [`sce_figures`], of the state kept in [`LAST`].
    #[unsafe(no_mangle)]
    pub extern "C" fn sce_figures_last() -> u32 {
        hook();
        answer(look_last(|all| floats(all.cities.iter().flat_map(Economy::figures))))
    }

    /// As [`sce_agents`], of the state kept in [`LAST`].
    #[unsafe(no_mangle)]
    pub extern "C" fn sce_agents_last() -> u32 {
        hook();
        answer(look_last(|all| float_lists(all.cities.iter().map(Economy::agents))))
    }

    /// Of the state kept in [`LAST`], per city the workers away from firms that worked in its last period and the
    /// workers without work who stood in for them (economy feature 23, [`crate::workers::Today`]): two 64-bit floats a
    /// city. A measure for the tools; no rule and no state reads it.
    #[unsafe(no_mangle)]
    pub extern "C" fn sce_stand_ins_last() -> u32 {
        hook();
        answer(look_last(|all| {
            floats(
                all.cities
                    .iter()
                    .flat_map(|e| [e.model.ext.today.away as f64, e.model.ext.today.stood_in as f64]),
            )
        }))
    }

    /// Result: the key figures of every city of a state, [`super::FIGURES`] 64-bit floats a city.
    ///
    /// # Safety
    ///
    /// As [`sce_create`].
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn sce_figures(state: *const u8, len: usize) -> u32 {
        hook();
        answer(look(unsafe { bytes(state, len) }, |all| {
            floats(all.cities.iter().flat_map(Economy::figures))
        }))
    }

    /// Result: the persons and firms of every city of a state one by one, as 64-bit floats: the lists of
    /// [`Economy::agents`], one city after the other.
    ///
    /// # Safety
    ///
    /// As [`sce_create`].
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn sce_agents(state: *const u8, len: usize) -> u32 {
        hook();
        answer(look(unsafe { bytes(state, len) }, |all| {
            float_lists(all.cities.iter().map(Economy::agents))
        }))
    }

    /// Result: what must be 0 in a state, as 64-bit floats: for every city the six numbers of [`Economy::checks`],
    /// then for the merchants the pairs of [`Cities::checks`] (what is off, and the amount to judge it by).
    ///
    /// # Safety
    ///
    /// As [`sce_create`].
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn sce_checks(state: *const u8, len: usize) -> u32 {
        hook();
        answer(look(unsafe { bytes(state, len) }, |all| {
            floats(
                all.cities
                    .iter()
                    .flat_map(Economy::checks)
                    .chain(all.checks().into_iter().flatten()),
            )
        }))
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
