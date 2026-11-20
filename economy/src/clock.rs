//! The daily clock: the model type that lets the port compute one day per period (economy feature 4,
//! docs/ECONOMY_DESIGN.md).
//!
//! The port's rules know no length of a period: a period is as long as the flows of the calibration say. But the
//! period is also the speed of behaviour, because every firm sets its supply to the demand of the period before, in
//! every period. With a day as the period that makes an economy that swings several times harder than with a year
//! (the trial runs of the proposal). So a day as the period needs a statement about how often an agent decides. This
//! model type takes it from Eurace@Unibi (Dawid, Gemkow, Harting, van der Hoog, Neugart 2011, The Eurace@Unibi Model,
//! Model v1.0 User Manual): the clock is the day, and a firm acts on its own day, once per planning period.
//!
//! It replaces two rules of the port through the port's own mechanism for model types ([`Extension`]) and leaves
//! every other rule as it is:
//!
//! 1. A firm sets its supply and its price only on its own plan day, every `plan` days, by the port's rule
//!    (A.5, A.8, A.9): supply is the mean demand per day since its last plan, times the growth expected over the `plan`
//!    days ahead; the price changes by the cost push and by the inflation expected over those days. On the other
//!    days it keeps both.
//! 2. Growth and inflation are expected as in the port (an AR(1) forecast with a random shock), but on sums over
//!    windows of `window` days that end today, because the sources of the calibration are yearly. The result is
//!    expressed per day. An entry of the history before the start stands for `window` days.
//!
//! With `plan` and `window` of 1 both rules are the port's rules, number for number (economy/tests/shell.rs).
//!
//! It also carries the wage in money (economy feature 7). In the port a firm has a real wage that never changes, and
//! what it pays is that real wage times the consumer price level of the period (`firms.jl:120-127` and `:221` of
//! BeforeIT.jl; A.26 and the wage bill of the profits): the wage follows the prices one to one, so nothing holds the
//! level of prices. In an economy that pays wages in money ([`DailyClock::pay_in_money`]) a firm has a wage in money
//! that never changes, as in Assenza, Delli Gatti and Grazzini (2015, Emergent Dynamics of a Macroeconomic Agent
//! Based Model with Capital and Credit, CESifo Working Paper 4765, table 2: the nominal wage is a constant). The
//! port's rules stay as they are and go on paying "real wage times consumer price level": before the firms decide,
//! the real wage of every firm is set to its wage in money over the consumer price level. And in the cost push
//! (A.9) the price of labour is no longer the consumer price level but the wage in money over the real wage of the
//! start, which stays where it was at the start; that reading of A.9 is ours, the papers do not give it. Without
//! [`DailyClock::pay_in_money`] nothing of this happens and the economy computes as before.
//!
//! And it carries the demand pull of CANVAS (economy feature 8): Hommes, He, Poledna, Siqueira and Zhang (2022,
//! CANVAS: A Canadian Behavioral Agent-Based Model, Bank of Canada Staff Working Paper 2022-51, section 3.2.4,
//! equations 34 to 37), as BeforeIT.jl has it in src/model_extensions/init_CANVAS.jl (lines 45 to 75) and the port in
//! src/model_extensions/canvas.rs. In the paper of Poledna et al. a firm's price moves with its costs and with expected
//! inflation only, and its supply is the demand it met. With the demand pull a firm compares the demand it met with
//! the supply it had planned, and changes either its supply or its price by the gap between the two, never both: its
//! supply if it sold out and is no cheaper than its sector or did not sell out and is cheaper, its price otherwise.
//! Here a firm does so on its plan day, with the supply per day of its last plan and the mean demand per day since.
//! With a plan in every period that is the rule of the port's CANVAS model, number for number
//! (economy/tests/demand_pull.rs). The other change of the port's CANVAS model, a central bank that learns its rule,
//! is not part of this.
//!
//! And it carries the spending out of savings (economy feature 15). In the paper a household spends the share ψ of
//! its expected income and nothing else (A.46): "no wealth effects on consumption". What a household could not buy
//! or did not spend stays in its deposits for ever, and over the centuries of the game the deposits of the
//! households pile up while those of the firms drain (docs/ECONOMY_DESIGN.md, section 15). Godley and Lavoie
//! (Monetary Economics, 2007, Model SIM, equation 3.7) let households consume out of income and out of the wealth
//! of the period before, C = α1 · YD + α2 · H, which is the same as a target for wealth relative to income. Here
//! ([`DailyClock::savings`]) the budget of the paper gets that second term, with the target set to what the
//! calibration says at the start: C = ψ · Y + s · (D − n · ψ · Y), D the household's deposits, n the deposits of all
//! households of the economy over their budgets in the first period, s the share of the gap spent per period. A
//! household at the target spends what the paper says; with s = 0 the rule is the paper's.
//!
//! The port takes one model type per model, so this one also carries what a city needs that trades with other cities
//! ([`crate::trade`]): while the merchants have set what they want and bring, the rule of the rest of the world reads
//! that instead of the port's random series. An economy on its own never has merchants and computes as before.
//!
//! And it carries the working days of the firms and households (economy feature 19, [`Attendance`]). In the port
//! every period is a working day. With a day as the period a firm and a household keep the working days of a calendar
//! (src/sim/holy_days.ts in the game: the Sundays and feasts of the Latin Church, the Sabbath, and so on; a firm
//! that of its owner). On a day with the factor `a`, the share of the day that is worked times the days of the year over
//! the working days of the year, the flows of a firm and the purchases of a household are `a` times those of a mean
//! day: on a day of rest nothing, on a working day more, and over a year as much as in the port in as many periods.
//!
//! 1. The output of the Leontief function (A.13) is `min(Q_s, N α, K κ, M β)`: the planned supply, what the workers,
//!    the capital and the materials allow in a period. On the day it is `min(a Q_s, a N α, a K κ, M β)`; `M β` is a
//!    stock and is not scaled.
//! 2. A firm invests (A.14) for the day's work, `a` times the port's. It buys the materials (A.18) for the next day
//!    it works: in the port the materials bought in a period are used in the next (A.13 reads the stock `M` before
//!    the market of the period, A.21 adds what was bought), so on a working day a firm buys the port's materials times
//!    the factor of its next working day, and on a day of rest, when the market of its faith is closed, nothing
//!    (economy feature 20).
//! 3. A household buys `a` times its budget (A.46, A.49, with the spending out of savings): the market of its faith
//!    is closed on its days of rest. The owner of a firm is such a household too (economy feature 20): he plans his
//!    spending by the rule of feature 18, on the profit he expects, which is the mean profit per period of his firm
//!    since its twelfth plan before ([`OwnerProfit`]), grown as the port grows the profit of the period before
//!    (A.28): the profit of the window of the expectations, a year, in the place of the port's period. The crown and
//!    the merchants buy every day.
//! 4. In the market the spare capacity of a firm, which records the demand it cannot serve, is that of the day,
//!    `a K κ − Y`.
//! 5. A firm plans on the mean demand per worked day: the demand since its last plan over the factors of those days,
//!    which without working days are as many as the days. A firm that has not worked since its last plan keeps its
//!    supply and its price until it has.
//! 6. Wages are paid every day as in the port, worked or not (the work effort of A.26 is the port's): a holy day costs
//!    a firm its output, not its workers' pay.
//! 7. A price index of the port that weights with what was made, sold or bought, and the mean prices paid, are 0 / 0
//!    on a day without any: they keep the value of the day before.
//!
//! Without a calendar, and on every day of the factor 1, the economy computes as before, number for number.
//!
//! And it carries the workers who are away (economy feature 22, [`Absences`]: sickness and childbed in the game). On a
//! day a worker is away the labour of the firm is that of the workers who are there, `a (N − away) α` in the Leontief
//! function; the worker keeps the place and the wage. A firm that sold all it had counts the output its workers who
//! were away would have made to the demand of its next plan, and it does not buy again the materials they left
//! unused. Without absences the economy computes as before, number for number.
//!
//! And it carries the contracts of the workers (economy feature 23, [`crate::workers`]): who serves by the year and
//! who works by the day, with the workers without work who stand in for those who are away. A stand-in adds to the
//! labour of his firm on the day, `a (N − away + stand-ins) α`; what the day labourers and the stand-ins are paid
//! more or less than the port's pay goes through the firm's profit and deposits, the worker's income and the crown's
//! taxes on wages, and into the national accounts. Without contracts the economy computes as before, number for number.
#![allow(non_snake_case)] // the fields of the port carry the names of the paper's appendix

use beforeit::julia::min;
use beforeit::{AbstractModel, Extension, Firms, FirmsDecisions, Randomness, base};

use crate::past::Past;
use crate::trade::{self, Trade};
use crate::workers::{self, Absences, Today};

/// The working days of the firms and households of an economy (economy feature 19): for a run of days, per calendar the
/// kind of every day, per calendar and kind the factor of the flows of a firm or a household on such a day, per firm
/// its calendar and per household that owns no firm its calendar. Empty: every period is a working day of the factor
/// 1, as in the port.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Attendance {
    /// the period (counted from 1) of the first day
    pub from: usize,
    /// the days
    pub days: usize,
    /// the kinds of a day
    pub kinds: usize,
    /// per calendar and kind of day: the factor of the flows of a firm on such a day (`kinds` numbers a calendar)
    pub factor: Vec<f64>,
    /// per calendar and day: the kind of the day (`days` numbers a calendar)
    pub day: Vec<u8>,
    /// per firm: its calendar (and so of its owner's household)
    pub calendar: Vec<u8>,
    /// per household that does not own a firm: its calendar, in the port's order of the workers, the persons who do
    /// not work and the owners of the banks
    pub household: Vec<u8>,
}

impl Attendance {
    /// Working days for `days` days from period `from`: `factor` per calendar and kind, `day` the kind of every day
    /// per calendar, `calendar` per firm, `household` per household that owns no firm.
    pub fn new(
        from: usize,
        days: usize,
        kinds: usize,
        factor: Vec<f64>,
        day: Vec<u8>,
        calendar: Vec<u8>,
        household: Vec<u8>,
    ) -> Result<Attendance, String> {
        let calendars = if kinds == 0 { 0 } else { factor.len() / kinds };
        if kinds == 0 || calendars == 0 || factor.len() != calendars * kinds || day.len() != calendars * days {
            return Err(format!(
                "working days with {} factors for {kinds} kinds of days and {} kinds of days for {days} days",
                factor.len(),
                day.len()
            ));
        }
        if let Some(k) = day.iter().find(|&&k| k as usize >= kinds) {
            return Err(format!("a day of the kind {k} of {kinds}"));
        }
        if let Some(c) = calendar.iter().find(|&&c| c as usize >= calendars) {
            return Err(format!("a firm of the calendar {c} of {calendars}"));
        }
        if let Some(c) = household.iter().find(|&&c| c as usize >= calendars) {
            return Err(format!("a household of the calendar {c} of {calendars}"));
        }
        if let Some(f) = factor.iter().find(|f| !(f.is_finite() && **f >= 0.0)) {
            return Err(format!("a factor of the flows of {f}"));
        }
        Ok(Attendance {
            from,
            days,
            kinds,
            factor,
            day,
            calendar,
            household,
        })
    }

    /// Whether there are no working days: every period is a working day as in the port.
    pub fn is_empty(&self) -> bool {
        self.calendar.is_empty()
    }

    /// The factor of the flows of firm `i` in period `t`: 1 outside the days.
    pub fn factor(&self, i: usize, t: usize) -> f64 {
        if self.calendar.is_empty() {
            return 1.0;
        }
        self.of_calendar(self.calendar[i], t)
    }

    /// The factor of the purchases of household `h` that owns no firm (in the order of [`Attendance::household`]) in
    /// period `t`: 1 outside the days.
    pub fn household_factor(&self, h: usize, t: usize) -> f64 {
        if self.calendar.is_empty() {
            return 1.0;
        }
        self.of_calendar(self.household[h], t)
    }

    /// The factor of the flows of firm `i` on its next working day after period `t` (economy feature 20): of the
    /// periods `t + 1` to `t + 31` the first whose factor is above 0, and 1 if there is none (outside the days every
    /// period is a working day of the factor 1).
    pub fn next_working(&self, i: usize, t: usize) -> f64 {
        if self.calendar.is_empty() {
            return 1.0;
        }
        let c = self.calendar[i];
        (t + 1..=t + 31)
            .map(|s| self.of_calendar(c, s))
            .find(|&a| a > 0.0)
            .unwrap_or(1.0)
    }

    fn of_calendar(&self, c: u8, t: usize) -> f64 {
        if t < self.from || t - self.from >= self.days {
            return 1.0;
        }
        let c = c as usize;
        self.factor[c * self.kinds + self.day[c * self.days + t - self.from] as usize]
    }
}

/// The work effort of the port (A.25, A.26, `firms.jl`): the output that planned supply, capital and intermediate
/// inputs allow, relative to what the employees produce at average productivity, at most 1.5. (The port keeps its own
/// copy private.)
fn effort(f: &Firms, i: usize) -> f64 {
    min(
        1.5,
        min(f.Q_s_i[i], min(f.K_i[i] * f.kappa_i[i], f.M_i[i] * f.beta_i[i])) / (f.N_i[i] as f64 * f.alpha_bar_i[i]),
    )
}

/// The plan periods over which the owner of a firm takes the mean of its profits (economy feature 20): twelve plans
/// of 30 days, the year of the window of the expectations.
pub const OWNER_PLANS: usize = 12;

/// With working days and [`DailyClock::owner`] (economy feature 20): per firm the profits its owner plans his spending
/// on, by the plan periods of the firm. Of the last [`OWNER_PLANS`] plan periods that ended, the profit summed and the
/// periods (`ended` and `ended_periods`, one row of firms per plan period, the row of the `n`-th period that ended at
/// `n % OWNER_PLANS`); of the periods since the last plan the same (`open`, `open_periods`); and per firm the plan
/// periods that ended (`ends`). All empty before the first period with working days; in that period the year before
/// is taken to be [`OWNER_PLANS`] plan periods of the profit of the period before, as the clock takes the window
/// before the start to be the starting position.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct OwnerProfit {
    pub ended: Vec<f64>,
    pub ended_periods: Vec<f64>,
    pub open: Vec<f64>,
    pub open_periods: Vec<f64>,
    pub ends: Vec<u32>,
}

impl OwnerProfit {
    /// For firms whose profit of the period before is `before`: [`OWNER_PLANS`] plan periods of `plan` periods of
    /// that profit have ended, and none since.
    pub fn start(before: &[f64], plan: usize) -> OwnerProfit {
        let firms = before.len();
        OwnerProfit {
            ended: before
                .iter()
                .map(|p| p * plan as f64)
                .collect::<Vec<_>>()
                .repeat(OWNER_PLANS),
            ended_periods: vec![plan as f64; OWNER_PLANS * firms],
            open: vec![0.0; firms],
            open_periods: vec![0.0; firms],
            ends: vec![OWNER_PLANS as u32; firms],
        }
    }
    pub fn is_empty(&self) -> bool {
        self.open.is_empty()
    }
    pub fn firms(&self) -> usize {
        self.open.len()
    }
    /// The profit `pi` of firm `i` in the period that is computed.
    fn add(&mut self, i: usize, pi: f64) {
        self.open[i] += pi;
        self.open_periods[i] += 1.0;
    }
    /// Firm `i` plans: the periods since its last plan end.
    fn end(&mut self, i: usize) {
        let I = self.firms();
        let row = self.ends[i] as usize % OWNER_PLANS;
        self.ended[row * I + i] = self.open[i];
        self.ended_periods[row * I + i] = self.open_periods[i];
        self.ends[i] += 1;
        self.open[i] = 0.0;
        self.open_periods[i] = 0.0;
    }
    /// The mean profit per period of firm `i` over the last [`OWNER_PLANS`] plan periods that ended and the periods
    /// since; `None` before a period has been added.
    fn mean(&self, i: usize) -> Option<f64> {
        let I = self.firms();
        let rows = (self.ends[i] as usize).min(OWNER_PLANS);
        let (mut sum, mut periods) = (self.open[i], self.open_periods[i]);
        for row in 0..rows {
            sum += self.ended[row * I + i];
            periods += self.ended_periods[row * I + i];
        }
        (periods > 0.0).then(|| sum / periods)
    }
}

/// The model type of the daily clock and the fields it adds to a model.
#[derive(Clone, Debug, PartialEq)]
pub struct DailyClock {
    /// periods between two plans of a firm
    pub plan: usize,
    /// periods of a window of the expectations, and periods that one entry of the history before the start stands for
    pub window: usize,
    /// per firm: the demand of the periods since its last plan, summed, and the number of those periods
    pub demand: Vec<f64>,
    pub periods: Vec<u32>,
    /// per firm: the factors of its flows (economy feature 19, [`Attendance`]) of the periods whose demand `demand`
    /// holds or will hold at the next decision: the periods since its last plan, the starting position counting as one
    /// period of the factor 1. Without working days it is the number of those periods.
    pub worked: Vec<f64>,
    /// real and nominal GDP of the starting position, per period
    pub start: [f64; 2],
    /// of the national accounts, the series that the key figures sum over a window ([`crate::summed`]): one row per
    /// period for the last `window` periods, oldest first; while fewer periods are computed, the first row is the
    /// starting position. The port's own rows are not kept (no rule reads them).
    pub accounts: Vec<[f64; crate::SUMMED]>,
    /// the wage in money (economy feature 7): per firm the wage in money it pays for a unit of work, and the real
    /// wage it had when the wage in money was set. Both empty: the wage follows the consumer prices, as in the port.
    pub wage: Vec<f64>,
    pub real_wage: Vec<f64>,
    /// whether a planning firm changes its supply or its price by the gap between the demand it met and the supply
    /// it had planned (the demand pull of CANVAS, economy feature 8); without it the firm plans by the rule of the
    /// paper (A.5, A.8)
    pub demand_pull: bool,
    /// the spending out of savings (economy feature 15): the share of the gap between a household's deposits and its
    /// target that it spends per period, and the target as deposits over the budget for consumption, set in the
    /// first period that is computed (−1 before). 0: a household spends out of its income only, as in
    /// the port.
    pub savings: f64,
    pub norm: f64,
    /// whether the crown buys with what it took in (economy feature 16): its budget of a period is its revenue of the
    /// period before, less what it paid besides its purchases in that period (`crown_outlays`: benefits and interest).
    /// Without it the purchases follow the series of the paper (A.55, A.56), whatever the crown takes in.
    pub crown_revenue: bool,
    pub crown_outlays: f64,
    /// whether a firm and its owner are one household (economy feature 18): the owner's income of a period is the
    /// firm's profit without the change of its stock, of either sign. Without it the owner gets the profit of the
    /// paper (A.27), unsold stock at its price included, and bears no loss (A.33, A.44).
    pub owner: bool,
    /// what the owner of every firm bore of its loss in the period that is being computed. Not part of the saved
    /// state: it is set and read within one period.
    pub borne: Vec<f64>,
    /// the past in a fixed size ([`crate::past`]); `None`: the expectations are estimated on the port's lists of
    /// every period since the start, bit for bit as the port does
    pub past: Option<Past>,
    /// what the merchants want from this economy and bring to it in the period that is being computed
    /// ([`crate::trade`]); `None` between two periods and in an economy on its own. Not part of the saved state.
    pub trade: Option<Trade>,
    /// the working days of the firms (economy feature 19); empty: every period is a working day, as in the port
    pub attendance: Attendance,
    /// with working days and [`DailyClock::owner`]: the profits the owners plan their spending on (economy feature 20)
    pub owner_profit: OwnerProfit,
    /// the workers who are away (economy feature 22); empty: everybody is there, as in the port
    pub absences: Absences,
    /// per firm, the output that its workers who are away kept it from making in the period (economy feature 22):
    /// set by the production and read by the market of the same period, so it is not part of the state
    pub lost: Vec<f64>,
    /// per firm, the materials that its workers who were away left unused and that it has not yet bought less of
    /// (economy feature 22); empty while nobody has been away
    pub unused: Vec<f64>,
    /// per worker the contract ([`workers::BY_THE_YEAR`] or [`workers::BY_THE_DAY`], economy feature 23); empty:
    /// everybody serves by the year, and nobody stands in, as before
    pub contracts: Vec<u8>,
    /// the stand-ins and the pays of the period that is being computed ([`workers::today`]); not part of the state
    pub today: Today,
}

impl DailyClock {
    /// The clock of a model with `firms` firms that has not computed a period yet.
    pub fn new(plan: usize, window: usize, firms: usize) -> Result<DailyClock, String> {
        if plan == 0 || window == 0 {
            return Err(format!(
                "a plan every {plan} periods and windows of {window} periods: both need at least one period"
            ));
        }
        Ok(DailyClock {
            plan,
            window,
            demand: vec![0.0; firms],
            periods: vec![0; firms],
            worked: vec![1.0; firms],
            start: [f64::NAN; 2],
            accounts: Vec::new(),
            wage: Vec::new(),
            real_wage: Vec::new(),
            demand_pull: false,
            savings: 0.0,
            norm: -1.0,
            crown_revenue: false,
            crown_outlays: 0.0,
            owner: false,
            borne: Vec::new(),
            past: None,
            trade: None,
            attendance: Attendance::default(),
            owner_profit: OwnerProfit::default(),
            absences: Absences::default(),
            lost: Vec::new(),
            unused: Vec::new(),
            contracts: Vec::new(),
            today: Today::default(),
        })
    }

    /// Whether firm `i` plans in period `t` (counted from 1). Every firm plans in the first period; after that
    /// firm `i` plans every `plan` periods, the firms spread evenly over them in their order.
    pub fn plans(&self, i: usize, t: usize) -> bool {
        t == 1 || (t - 1) % self.plan == i % self.plan
    }

    /// From now on the firms pay wages in money: every firm keeps the wage it pays today, its real wage `w_bar_i`
    /// times the consumer price level `P_bar_HH`, as an amount of money.
    pub fn pay_in_money(&mut self, w_bar_i: &[f64], P_bar_HH: f64) {
        self.wage = w_bar_i.iter().map(|w| w * P_bar_HH).collect();
        self.real_wage = w_bar_i.to_vec();
    }

    /// Periods computed so far, given the port's count of periods `t` (1 before the first): with a past of a fixed
    /// size the port's count stays at 1 and the past counts.
    pub fn periods_computed(&self, t: usize) -> usize {
        self.past.as_ref().map_or(t - 1, |p| p.periods)
    }

    /// Whether the firms pay wages in money ([`DailyClock::pay_in_money`]).
    pub fn pays_in_money(&self) -> bool {
        !self.wage.is_empty()
    }
}

/// `(1 + rate)` compounded over `periods` periods.
fn compound(rate: f64, periods: usize) -> f64 {
    if periods == 1 {
        1.0 + rate
    } else {
        libm::pow(1.0 + rate, periods as f64)
    }
}

/// The rate per period that compounds to `rate` over `periods` periods.
fn per_period(rate: f64, periods: usize) -> f64 {
    if periods == 1 {
        rate
    } else {
        libm::pow(1.0 + rate, 1.0 / periods as f64) - 1.0
    }
}

/// The sums of a series over windows of `window` periods, the last one ending with the series. The first `history`
/// entries are the history before the start: each stands for `window` periods with its value. Periods at the
/// beginning that do not fill a window are left out.
pub fn windows(series: &[f64], history: usize, window: usize) -> Vec<f64> {
    if window == 1 {
        return series.to_vec();
    }
    let before = history * window;
    let periods = before + series.len() - history;
    let value = |j: usize| {
        if j < before {
            series[j / window]
        } else {
            series[history + j - before]
        }
    };
    let count = periods / window;
    (0..count)
        .map(|k| {
            let from = periods - (count - k) * window;
            (from..from + window).map(value).sum()
        })
        .collect()
}

/// The target of the households' deposits (economy feature 15): the deposits of all households of the economy over
/// their budgets for consumption, both as they are when the first budget is drawn up. Set once and kept.
fn norm(m: &mut AbstractModel<DailyClock>) -> f64 {
    if m.ext.savings == 0.0 {
        return 0.0;
    }
    if m.ext.norm < 0.0 {
        let sum = |v: &[f64]| v.iter().sum::<f64>();
        let budgets = sum(&base::households_budget_act(m).0)
            + sum(&base::households_budget_inact(m).0)
            + sum(&base::households_budget_firms(m).0)
            + sum(&base::households_budget_banks(m).0);
        let deposits = sum(&m.w_act.D_h) + sum(&m.w_inact.D_h) + sum(&m.firms.D_h) + sum(&m.banks.D_h);
        m.ext.norm = if budgets > 0.0 { deposits / budgets } else { 0.0 };
    }
    m.ext.norm
}

/// Adds to every budget for consumption `c` the share `savings` of the gap between the household's deposits `d` and
/// its target, `norm` times its budget (Godley and Lavoie 2007, equation 3.7, as a target for wealth). The deposits
/// are money and the budget is net of the value added tax, as in A.46. A household below its target spends less, never
/// less than nothing.
fn spend_savings(c: &mut [f64], d: &[f64], savings: f64, norm: f64, tau_VAT: f64) {
    if savings == 0.0 {
        return;
    }
    for (c, d) in c.iter_mut().zip(d) {
        *c = (*c + savings * (*d / (1.0 + tau_VAT) - norm * *c)).max(0.0);
    }
}

/// The budgets `c` and `i` of households that own no firm, the first of them number `first` of
/// [`Attendance::household`], for the day (economy feature 19): a household buys on the days of its calendar, on a day
/// of rest nothing and on a working day more than on a mean day, so that over the year it buys what the port's
/// household buys in as many periods.
fn on_working_days(m: &AbstractModel<DailyClock>, c: &mut [f64], i: &mut [f64], first: usize) {
    let a = &m.ext.attendance;
    if a.is_empty() {
        return;
    }
    let t = m.ext.periods_computed(m.agg.t) + 1;
    for h in 0..c.len() {
        let f = a.household_factor(first + h, t);
        c[h] *= f;
        i[h] *= f;
    }
}

impl Extension for DailyClock {
    /// The port's `growth_inflation_expectations` (A.6, A.7, A.10) on windows: expected GDP, growth and inflation of
    /// the next period.
    fn growth_inflation_expectations<R: Randomness + ?Sized>(
        m: &mut AbstractModel<Self>,
        rng: &mut R,
    ) -> (f64, f64, f64) {
        let window = m.ext.window;
        // the forecasts of the logarithm of real GDP and of inflation, and the two windows that end today
        let (next_Y, next_pi, Y, pi) = if let Some(past) = &m.ext.past {
            (
                past.Y.next_value(past.periods, rng),
                past.pi.next_value(past.periods, rng),
                past.Y.sum,
                past.pi.sum,
            )
        } else {
            let n = m.prop.T_prime + m.agg.t - 1;
            let Y = windows(&m.agg.Y[..n], m.prop.T_prime, window);
            let pi = windows(&m.agg.pi_[..n], m.prop.T_prime, window);
            let last = Y.len() - 1;
            let log_Y: Vec<f64> = Y.iter().map(|&y| libm::log(y)).collect();
            (
                Self::estimate_next_value(&log_Y, rng),
                Self::estimate_next_value(&pi, rng),
                Y[last],
                pi[last],
            )
        };
        let Y_e = libm::exp(next_Y);
        let gamma_e = Y_e / Y - 1.0;
        let mut pi_e = libm::exp(next_pi) - 1.0;
        let omega_pi = m.prop.omega_pi;
        pi_e = (1.0 - omega_pi) * pi_e + (omega_pi * pi);
        (
            Y_e / window as f64,
            per_period(gamma_e, window),
            per_period(pi_e, window),
        )
    }

    /// The port's `cost_push_inflation` (A.9). In an economy that pays wages in money the term of labour is the
    /// port's with another price of labour: the port has `(1 + tau_SIF) * w_bar_i / alpha_bar_i * (P_bar_HH / P_i - 1)`,
    /// where the consumer price level `P_bar_HH` is the price of labour because the wage follows it. Here the price of
    /// labour is the wage in money over the real wage of the start, so the term is
    /// `(1 + tau_SIF) * real_wage / alpha_bar_i * (wage / real_wage / P_i - 1)`, computed as
    /// `(1 + tau_SIF) / alpha_bar_i * (wage / P_i - real_wage)`. The terms of materials and of capital are the port's.
    fn cost_push_inflation(m: &AbstractModel<Self>, firms: &Firms) -> Vec<f64> {
        let mut push = base::cost_push_inflation(m, firms);
        if m.ext.pays_in_money() {
            let (c, f, tax, P_bar_HH) = (&m.ext, firms, 1.0 + m.prop.tau_SIF, m.agg.P_bar_HH);
            for (i, push) in push.iter_mut().enumerate() {
                let port = tax * f.w_bar_i[i] / f.alpha_bar_i[i] * (P_bar_HH / f.P_i[i] - 1.0);
                let money = tax / f.alpha_bar_i[i] * (c.wage[i] / f.P_i[i] - c.real_wage[i]);
                *push += money - port;
            }
        }
        push
    }

    /// The port's `firms_expectations_and_decisions`, with supply and price set only by the firms that plan in this
    /// period. In an economy that pays wages in money every firm's real wage is first set to its wage in money over
    /// the consumer price level, so that the port's rules of this period pay the wage in money.
    ///
    /// A planning firm sets by the rule of the paper (A.5, A.8): supply = the mean demand per day since its last plan
    /// times expected growth; price = price times cost push times expected inflation. With the demand pull
    /// ([`DailyClock::demand_pull`]) it sets by the rule of CANVAS (equations 34 to 37): with `Q_s` the supply per day
    /// of its last plan, `Q_d` the mean demand per day since and the gap `Q_d / Q_s − 1`, the gap goes into the supply
    /// if `Q_s <= Q_d` and the firm's price is at least the price index of its sector, or `Q_s > Q_d` and its price is
    /// below it; into the price otherwise. Supply = `Q_s` times expected growth times (1 + gap or 0); price = price
    /// times cost push times expected inflation times (1 + gap or 0). Every planning firm adjusts (the port's
    /// `theta_calvo` of 1; the port's random draw for it is not made).
    ///
    /// With workers who are away (economy feature 22) a firm buys the port's materials (A.18) less those its workers
    /// who were away left unused in the stock.
    ///
    /// # Panics
    ///
    /// If the model has gained or lost firms: the clock does not follow that.
    fn firms_expectations_and_decisions<R: Randomness + ?Sized>(
        m: &mut AbstractModel<Self>,
        rng: &mut R,
    ) -> FirmsDecisions {
        let I = m.firms.len();
        assert!(
            m.ext.demand.len() == I && m.ext.periods.len() == I && m.ext.worked.len() == I,
            "the daily clock holds {} firms, the model has {I}",
            m.ext.demand.len()
        );
        if m.ext.pays_in_money() {
            assert!(
                m.ext.wage.len() == I && m.ext.real_wage.len() == I,
                "the daily clock holds the wages of {} firms, the model has {I}",
                m.ext.wage.len()
            );
            let P_bar_HH = m.agg.P_bar_HH;
            for i in 0..I {
                m.firms.w_bar_i[i] = m.ext.wage[i] / P_bar_HH;
            }
        }
        let mut d = base::firms_expectations_and_decisions(m, rng);
        let (plan, t) = (m.ext.plan, m.ext.periods_computed(m.agg.t) + 1);
        let (growth, inflation) = (compound(m.agg.gamma_e, plan), compound(m.agg.pi_e, plan));
        let cost_push = Self::cost_push_inflation(m, &m.firms);
        for i in 0..I {
            m.ext.demand[i] += m.firms.Q_d_i[i];
            m.ext.periods[i] += 1;
            // the mean demand per day: over the factors of the days (economy feature 19), which without working days
            // are as many as the periods; a firm that has not worked since its last plan waits for a day it works
            if m.ext.plans(i, t) && m.ext.worked[i] > 0.0 {
                let Q_d = m.ext.demand[i] / m.ext.worked[i];
                if m.ext.demand_pull {
                    let (Q_s, P, P_g) = (m.firms.Q_s_i[i], m.firms.P_i[i], m.agg.P_bar_g[m.firms.G_i[i]]);
                    let gap = Q_d / Q_s - 1.0;
                    let (gamma_d, pi_d) = if (Q_s <= Q_d) == (P >= P_g) {
                        (gap, 0.0)
                    } else {
                        (0.0, gap)
                    };
                    d.Q_s_i[i] = Q_s * growth * (1.0 + gamma_d);
                    d.new_P_i[i] = P * (1.0 + cost_push[i]) * inflation * (1.0 + pi_d);
                } else {
                    d.Q_s_i[i] = Q_d * growth;
                    d.new_P_i[i] = m.firms.P_i[i] * (1.0 + cost_push[i]) * inflation;
                }
                m.ext.demand[i] = 0.0;
                m.ext.periods[i] = 0;
                m.ext.worked[i] = 0.0;
                if m.ext.owner_profit.firms() == I {
                    m.ext.owner_profit.end(i);
                }
            } else {
                d.Q_s_i[i] = m.firms.Q_s_i[i];
                d.new_P_i[i] = m.firms.P_i[i];
            }
        }
        // what follows from the supply, by the port's rule (A.14, A.18, A.22)
        let (mut I_d_i, mut DM_d_i, N_d_i) = Self::desired_capital_material_employment(&m.firms, &d.Q_s_i);
        // a firm invests on the days it works (economy feature 19) and buys on them the materials of the next day it
        // works (feature 20)
        if !m.ext.attendance.is_empty() {
            let at = &m.ext.attendance;
            for i in 0..I {
                let a = at.factor(i, t);
                DM_d_i[i] *= if a > 0.0 { at.next_working(i, t) } else { 0.0 };
                I_d_i[i] *= a;
            }
        }
        // a firm does not buy again the materials that its workers who were away left unused (economy feature 22)
        if m.ext.unused.len() == I {
            for i in 0..I {
                let take = min(m.ext.unused[i], DM_d_i[i]);
                DM_d_i[i] -= take;
                m.ext.unused[i] -= take;
            }
        }
        d.I_d_i = I_d_i;
        d.DM_d_i = DM_d_i;
        d.N_d_i = N_d_i;
        d
    }

    /// The port's `firms_production` (A.13, A.25); with working days ([`Attendance`]) the flows of the Leontief
    /// function are those of the day: `min(a Q_s, a N α, a K κ, M β)` with the factor `a` of the firm's day, α the
    /// productivity times the port's work effort. With the factor 1 it is the port's number for number. Every firm adds
    /// the factor of the day to the days it worked since its last plan ([`DailyClock::worked`]). With workers who are
    /// away ([`Absences`], economy feature 22) the labour of the day is that of the workers who are there and of
    /// those who stand in for them (economy feature 23): `a (N − away + stand-ins) α`; the effort stays the one the
    /// firm's employees give. What the firm would have made with all its workers is kept as the output lost
    /// ([`DailyClock::lost`]) for the market of the period.
    fn firms_production(m: &mut AbstractModel<Self>) -> Vec<f64> {
        if m.ext.attendance.is_empty() && m.ext.absences.is_empty() {
            m.ext.worked.iter_mut().for_each(|w| *w += 1.0);
            return base::firms_production(m);
        }
        let t = m.ext.periods_computed(m.agg.t) + 1;
        let (f, c) = (&m.firms, &mut m.ext);
        let away = c.absences.of_firms(f.len(), &m.w_act.O_h, |id| f.index(id), t);
        let mut lost = Vec::with_capacity(if c.absences.is_empty() { 0 } else { f.len() });
        let Y = (0..f.len())
            .map(|i| {
                let (a, alpha) = (c.attendance.factor(i, t), f.alpha_bar_i[i] * effort(f, i));
                c.worked[i] += a;
                let made = |n: i64| {
                    min(
                        a * f.Q_s_i[i],
                        min(
                            a * n as f64 * alpha,
                            min(a * f.K_i[i] * f.kappa_i[i], f.M_i[i] * f.beta_i[i]),
                        ),
                    )
                };
                let stand_ins = c.today.stand_ins.get(i).map_or(0, |&n| n as i64);
                let y = made((f.N_i[i] - away[i] as i64 + stand_ins).max(0));
                if !c.absences.is_empty() {
                    let l = made(f.N_i[i]) - y;
                    // the materials the workers who are away did not use stay in the stock (A.13: M β per unit)
                    if l > 0.0 {
                        if c.unused.len() != f.len() {
                            c.unused = vec![0.0; f.len()];
                        }
                        c.unused[i] += l / f.beta_i[i];
                    }
                    lost.push(l);
                }
                y
            })
            .collect();
        c.lost = lost;
        Y
    }

    /// The port's price index (A.11, A.12), which weights the prices of the firms with what they made in the period.
    /// On a day on which no firm works (economy feature 19) there is nothing to weight with: the price index stays
    /// where it was and the inflation of the day is 0.
    fn inflation_priceindex(m: &mut AbstractModel<Self>) -> (f64, f64) {
        if m.firms.Y_i.iter().all(|&y| y == 0.0) {
            return (0.0, m.agg.P_bar);
        }
        base::inflation_priceindex(m)
    }

    /// The port's price index of every product (A.32), which weights with what was sold and imported in the period:
    /// a product of which nothing was sold or imported (on a day of rest, economy feature 19) keeps its index.
    fn sector_specific_priceindex(m: &mut AbstractModel<Self>) -> Vec<f64> {
        let mut index = base::sector_specific_priceindex(m);
        for (p, before) in index.iter_mut().zip(&m.agg.P_bar_g) {
            if !p.is_finite() {
                *p = *before;
            }
        }
        index
    }

    /// The port's labour market (A.1.1); with contracts (economy feature 23) then who stands in for the workers who
    /// are away and who is paid what in the period ([`workers::today`]).
    fn search_and_matching_labour<R: Randomness + ?Sized>(m: &mut AbstractModel<Self>, rng: &mut R) {
        base::search_and_matching_labour(m, rng);
        m.ext.today = workers::today(m, rng);
    }

    /// The port's goods market (A.42 and the rules of the market). With working days the spare capacity of a firm,
    /// `K κ − Y` in the port, which records the demand the firm cannot serve, is that of the day: `a K κ − Y`. The mean
    /// prices the households paid for what they consumed and for what they invested, and the crown and the buyers
    /// abroad for what they bought, are what they paid over what they bought: 0 / 0 or 0 on a day on which they bought
    /// nothing, which a day of rest gives (economy feature 19). Such a price stays that of the day before, or 1 if
    /// there is none; what they bought is 0 at any price.
    fn search_and_matching<R: Randomness + ?Sized>(m: &mut AbstractModel<Self>, rng: &mut R, parallel: bool) {
        let before = [m.agg.P_bar_h, m.agg.P_bar_CF_h, m.gov.P_j, m.rotw.P_l];
        // the spare capacity of a firm, which records the demand it cannot serve, is that of the day: a K κ − Y
        let kappa = (!m.ext.attendance.is_empty()).then(|| {
            let t = m.ext.periods_computed(m.agg.t) + 1;
            let kappa = m.firms.kappa_i.clone();
            for i in 0..kappa.len() {
                m.firms.kappa_i[i] *= m.ext.attendance.factor(i, t);
            }
            kappa
        });
        base::search_and_matching(m, rng, parallel);
        if let Some(kappa) = kappa {
            m.firms.kappa_i = kappa;
        }
        // a firm that sold all it had would have sold what its workers who are away kept it from making: that output
        // counts to the demand of its next plan, which the port measures by what it sold (economy feature 22)
        let (f, c) = (&m.firms, &mut m.ext);
        for (i, &lost) in c.lost.iter().enumerate() {
            if lost > 0.0 && f.Q_d_i[i] >= (f.Y_i[i] + f.S_i[i]) * (1.0 - 1e-12) {
                c.demand[i] += lost;
            }
        }
        c.lost.clear();
        let keep = |now: &mut f64, before: f64| {
            if !(now.is_finite() && *now > 0.0) {
                *now = if before.is_finite() && before > 0.0 {
                    before
                } else {
                    1.0
                };
            }
        };
        keep(&mut m.agg.P_bar_h, before[0]);
        keep(&mut m.agg.P_bar_CF_h, before[1]);
        keep(&mut m.gov.P_j, before[2]);
        keep(&mut m.rotw.P_l, before[3]);
    }

    /// The port's profit of a firm (A.27); with [`DailyClock::owner`] without the stock it built or sold from,
    /// valued at its price: what the firm took in less what it spent on what it made (economy feature 18; Caiani and
    /// Catullo 2023, eq. 23). The stock stays in the firm's books in units; it is profit on the day it is sold.
    fn firms_profits(m: &mut AbstractModel<Self>) -> Vec<f64> {
        let mut pi = base::firms_profits(m);
        // what the firm pays its day labourers and stand-ins more than the port's wages (economy feature 23)
        for (pi, more) in pi.iter_mut().zip(workers::wages_more(m)) {
            *pi -= more;
        }
        if m.ext.owner {
            for i in 0..pi.len() {
                pi[i] -= m.firms.P_i[i] * m.firms.DS_i[i];
            }
            // with working days the owner plans on the profits of the year (economy feature 20)
            if !m.ext.attendance.is_empty() {
                if m.ext.owner_profit.firms() != pi.len() {
                    m.ext.owner_profit = OwnerProfit::start(&m.firms.Pi_i, m.ext.plan);
                }
                for (i, &p) in pi.iter().enumerate() {
                    m.ext.owner_profit.add(i, p);
                }
            }
        }
        pi
    }

    /// The port's `gov_expenditure` (A.55, A.56); with [`DailyClock::crown_revenue`] the crown's budget is what it
    /// took in the period before, less its other outlays of that period, and never below 0 (economy feature 16). The
    /// series of the port is computed and its random number drawn all the same, so that every other draw of the
    /// period stays where it was; before the first revenue (the first period) the series stands.
    fn gov_expenditure<R: Randomness + ?Sized>(m: &mut AbstractModel<Self>, rng: &mut R) -> (f64, Vec<f64>) {
        let (c, d) = base::gov_expenditure(m, rng);
        if !m.ext.crown_revenue || m.gov.Y_G.is_nan() || m.gov.Y_G <= 0.0 {
            return (c, d);
        }
        let budget = (m.gov.Y_G - m.ext.crown_outlays).max(0.0);
        let price = m.prop.c_G_g.iter().zip(&m.agg.P_bar_g).map(|(c, p)| c * p).sum::<f64>() * (1.0 + m.agg.pi_e);
        let j = d.len();
        (budget / price, vec![budget / j as f64; j])
    }

    /// The port's `gov_loans` (A.60, A.61); for a crown that buys with its revenue the clock notes what it paid
    /// besides its purchases, which is the change of its debt plus its revenue less its purchases.
    fn gov_loans(m: &mut AbstractModel<Self>) -> f64 {
        let l = base::gov_loans(m);
        if m.ext.crown_revenue {
            m.ext.crown_outlays = l - m.gov.L_G - m.gov.C_j + m.gov.Y_G;
        }
        l
    }

    /// The port's `rotw_import_export`; in a city with merchants what they want and bring ([`trade::import_export`]).
    fn rotw_import_export<R: Randomness + ?Sized>(
        m: &mut AbstractModel<Self>,
        rng: &mut R,
    ) -> (f64, f64, Vec<f64>, Vec<f64>, Vec<f64>) {
        match m.ext.trade.take() {
            Some(t) => {
                let r = trade::import_export(m, &t);
                m.ext.trade = Some(t);
                r
            }
            None => base::rotw_import_export(m, rng),
        }
    }

    /// The port's budgets of the four kinds of households (A.46, A.49), and out of savings ([`spend_savings`]).
    fn households_budget_act(m: &mut AbstractModel<Self>) -> (Vec<f64>, Vec<f64>) {
        let n = norm(m);
        let (mut c, mut i) = base::households_budget_act(m);
        spend_savings(&mut c, &m.w_act.D_h, m.ext.savings, n, m.prop.tau_VAT);
        on_working_days(m, &mut c, &mut i, 0);
        (c, i)
    }
    fn households_budget_inact(m: &mut AbstractModel<Self>) -> (Vec<f64>, Vec<f64>) {
        let n = norm(m);
        let (mut c, mut i) = base::households_budget_inact(m);
        spend_savings(&mut c, &m.w_inact.D_h, m.ext.savings, n, m.prop.tau_VAT);
        on_working_days(m, &mut c, &mut i, m.w_act.len());
        (c, i)
    }
    /// The port's income of a worker (A.53); the realised one with what the worker is paid more or less than the
    /// port's pay in the period (economy feature 23). The expected one, which the budget is planned on (A.46), stays
    /// the wage of the contract per mean day.
    fn households_income_act(m: &mut AbstractModel<Self>, expected: bool) -> Vec<f64> {
        let mut y = base::households_income_act(m, expected);
        if !expected {
            workers::add_pays(m, &mut y);
        }
        y
    }
    /// The port's revenue of the crown (A.59), with the taxes on what the workers are paid more or less than the
    /// port's pay (economy feature 23).
    fn gov_revenues(m: &mut AbstractModel<Self>) -> f64 {
        base::gov_revenues(m) + workers::taxes_on_pays(m)
    }
    /// The port's national accounts of the period, with the wages as they were paid (economy feature 23): what the
    /// firms paid more or less than the port's wages is compensation of employees, not operating surplus.
    fn update_data_step(m: &mut AbstractModel<Self>) {
        base::update_data_step(m);
        let more: f64 = workers::wages_more(m).iter().sum();
        if more != 0.0 {
            let d = &mut m.data;
            let t = d.collection_time.len() - 1;
            d.compensation_employees[t] += more;
            d.wages[t] += more / (1.0 + m.prop.tau_SIF);
            d.operating_surplus[t] -= more;
        }
    }
    /// The port's income of an owner (A.33, A.44), which holds the share of a profit and nothing of a loss; with
    /// [`DailyClock::owner`] the owner bears the same share of a loss: firm and owner are one household with
    /// unlimited liability (economy feature 18; SNA 2008, 4.155 and 4.158).
    fn households_income_firms(m: &mut AbstractModel<Self>, expected: bool) -> Vec<f64> {
        let mut y = base::households_income_firms(m, expected);
        if m.ext.owner {
            let k = m.prop.theta_DIV * (1.0 - m.prop.tau_FIRM);
            let pi = if expected { &m.firms.Pi_e_i } else { &m.firms.Pi_i };
            // the owner bears the loss in full, as he holds the profit in full
            let borne: Vec<f64> = pi.iter().map(|pi| -k * pi.min(0.0)).collect();
            for i in 0..y.len() {
                y[i] -= borne[i];
            }
            if !expected {
                m.ext.borne = borne;
            }
        }
        y
    }
    /// The port's deposits of a firm; with [`DailyClock::owner`] the firm gets from its owner what the owner bears
    /// of a loss, the other side of [`Extension::households_income_firms`].
    fn firms_deposits(m: &mut AbstractModel<Self>) -> Vec<f64> {
        let mut d = base::firms_deposits(m);
        for (d, more) in d.iter_mut().zip(workers::wages_more(m)) {
            *d -= more;
        }
        if m.ext.owner {
            let borne = std::mem::take(&mut m.ext.borne);
            for i in 0..d.len() {
                d[i] += borne[i];
            }
        }
        d
    }
    fn households_budget_firms(m: &mut AbstractModel<Self>) -> (Vec<f64>, Vec<f64>) {
        let n = norm(m);
        // with working days the owner expects the mean profit of the year, grown as the port grows the profit of the
        // period before (A.28), and buys on the days of his calendar (economy feature 20)
        let year = m.ext.owner && !m.ext.attendance.is_empty() && m.ext.owner_profit.firms() == m.firms.len();
        let (mut c, mut i) = if year {
            let grown = (1.0 + m.agg.pi_e) * (1.0 + m.agg.gamma_e);
            let expected: Vec<f64> = (0..m.firms.len())
                .map(|f| m.ext.owner_profit.mean(f).map_or(m.firms.Pi_e_i[f], |p| p * grown))
                .collect();
            let day = std::mem::replace(&mut m.firms.Pi_e_i, expected);
            let budget = base::households_budget_firms(m);
            m.firms.Pi_e_i = day;
            budget
        } else {
            base::households_budget_firms(m)
        };
        // an owner who expects a loss plans to buy nothing out of income, not less than nothing
        if m.ext.owner {
            c.iter_mut().chain(i.iter_mut()).for_each(|x| *x = x.max(0.0));
        }
        spend_savings(&mut c, &m.firms.D_h, m.ext.savings, n, m.prop.tau_VAT);
        if !m.ext.attendance.is_empty() && m.ext.owner {
            let t = m.ext.periods_computed(m.agg.t) + 1;
            for f in 0..c.len() {
                let a = m.ext.attendance.factor(f, t);
                c[f] *= a;
                i[f] *= a;
            }
        }
        (c, i)
    }
    fn households_budget_banks(m: &mut AbstractModel<Self>) -> (Vec<f64>, Vec<f64>) {
        let n = norm(m);
        let (mut c, mut i) = base::households_budget_banks(m);
        spend_savings(&mut c, &m.banks.D_h, m.ext.savings, n, m.prop.tau_VAT);
        on_working_days(m, &mut c, &mut i, m.w_act.len() + m.w_inact.len());
        (c, i)
    }

    /// The port's `rotw_deposits`. The port divides the exports by the mean price paid for them, which is 0 / 0 on
    /// a day without exports; its own rule of exports never gives such a day, the merchants do. For such a day the
    /// mean price is set to 1 here, before the national accounts read it, so that real exports are 0.
    fn rotw_deposits(m: &mut AbstractModel<Self>) -> f64 {
        if m.ext.trade.is_some() && m.rotw.C_l == 0.0 {
            m.rotw.P_l = 1.0;
        }
        base::rotw_deposits(m)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_end_with_the_series_and_count_the_history_as_whole_windows() {
        // two entries of history (each stands for 3 periods), then 4 computed periods
        let s = [10.0, 20.0, 1.0, 2.0, 3.0, 4.0];
        // periods: 10 10 10 20 20 20 1 2 3 4; windows of 3 from the end: (2 3 4) (20 20 1) (10 10 20), the first 10 is left out
        assert_eq!(windows(&s, 2, 3), vec![40.0, 41.0, 9.0]);
        assert_eq!(windows(&s[..2], 2, 3), vec![30.0, 60.0]); // nothing computed yet: the history itself
        assert_eq!(windows(&s[..5], 2, 3), vec![30.0, 60.0, 6.0]); // a whole window computed
        assert_eq!(windows(&s, 2, 1), s.to_vec());
    }

    #[test]
    fn a_household_spends_a_share_of_what_it_holds_above_its_target() {
        let mut c = [10.0, 10.0, 10.0, 0.0, 1.0];
        // the target is 20 times the budget: at it, above it, below it, without an income, and far below it
        spend_savings(&mut c, &[200.0, 300.0, 100.0, 50.0, -500.0], 0.01, 20.0, 0.0);
        assert_eq!(c, [10.0, 11.0, 9.0, 0.5, 0.0]);
        let mut c = [10.0];
        spend_savings(&mut c, &[300.0], 0.0, 20.0, 0.0);
        assert_eq!(c, [10.0]); // the port's rule
    }

    #[test]
    fn rates_compound_and_come_back() {
        assert_eq!(compound(0.05, 1), 1.05);
        assert_eq!(per_period(0.05, 1), 0.05);
        assert!((compound(per_period(0.07, 365), 365) - 1.07).abs() < 1e-12);
        assert!((compound(0.01, 2) - 1.0201).abs() < 1e-15);
    }

    #[test]
    fn every_firm_plans_once_per_plan_and_all_plan_first() {
        let c = DailyClock::new(30, 365, 100).unwrap();
        for i in 0..100 {
            assert!(c.plans(i, 1));
            let own: Vec<usize> = (2..=61).filter(|&t| c.plans(i, t)).collect();
            assert_eq!(own.len(), 2);
            assert_eq!(own[1] - own[0], 30);
        }
        // the firms are spread evenly: 100 firms over 30 days are 3 or 4 a day
        for t in 2..=31 {
            let n = (0..100).filter(|&i| c.plans(i, t)).count();
            assert!(n == 3 || n == 4);
        }
        assert!(DailyClock::new(0, 365, 1).is_err());
        assert!(DailyClock::new(30, 0, 1).is_err());
    }
}
