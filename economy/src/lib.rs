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

pub mod abi;
mod accounts;
pub mod clock;
pub mod past;
pub mod state;
pub mod trade;
pub mod workers;

use beforeit::{
    AbstractModel, InitialConditions, Model, Parameters, Xoshiro, get_accounting_identities,
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
        ext.accounts = vec![accounts::summed(&data, 0)];
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
        accounts::take_rows(&mut self.model);
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
        let flow = |k: usize| accounts::over_window(&m.ext.accounts, k, n, window);
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
