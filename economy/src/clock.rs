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

mod aggregates;
mod attendance;
mod data;
mod firms;
mod government;
mod households;
mod markets;
mod owner;
mod rotw;

use beforeit::{AbstractModel, Extension, Firms, FirmsDecisions, Randomness};

use crate::past::Past;
use crate::trade::Trade;
use crate::workers::{Absences, Today};

pub use aggregates::windows;
pub use attendance::Attendance;
pub use owner::{OWNER_PLANS, OwnerProfit};

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
    /// of the national accounts, the series that the key figures sum over a window ([`crate::accounts::summed`]): one
    /// row per period for the last `window` periods, oldest first; while fewer periods are computed, the first row is
    /// the starting position. The port's own rows are not kept (no rule reads them).
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
    /// per worker the contract ([`crate::workers::BY_THE_YEAR`] or [`crate::workers::BY_THE_DAY`], economy feature
    /// 23); empty: everybody serves by the year, and nobody stands in, as before
    pub contracts: Vec<u8>,
    /// the stand-ins and the pays of the period that is being computed ([`crate::workers::today`]); not part of
    /// the state
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

/// The rules of the port that the clock replaces, each in the submodule named after the port's file of the rule;
/// every other rule is the port's.
impl Extension for DailyClock {
    fn growth_inflation_expectations<R: Randomness + ?Sized>(
        m: &mut AbstractModel<Self>,
        rng: &mut R,
    ) -> (f64, f64, f64) {
        aggregates::growth_inflation_expectations(m, rng)
    }
    fn cost_push_inflation(m: &AbstractModel<Self>, firms: &Firms) -> Vec<f64> {
        firms::cost_push_inflation(m, firms)
    }
    fn firms_expectations_and_decisions<R: Randomness + ?Sized>(
        m: &mut AbstractModel<Self>,
        rng: &mut R,
    ) -> FirmsDecisions {
        firms::firms_expectations_and_decisions(m, rng)
    }
    fn firms_production(m: &mut AbstractModel<Self>) -> Vec<f64> {
        firms::firms_production(m)
    }
    fn inflation_priceindex(m: &mut AbstractModel<Self>) -> (f64, f64) {
        aggregates::inflation_priceindex(m)
    }
    fn sector_specific_priceindex(m: &mut AbstractModel<Self>) -> Vec<f64> {
        aggregates::sector_specific_priceindex(m)
    }
    fn search_and_matching_labour<R: Randomness + ?Sized>(m: &mut AbstractModel<Self>, rng: &mut R) {
        markets::search_and_matching_labour(m, rng)
    }
    fn search_and_matching<R: Randomness + ?Sized>(m: &mut AbstractModel<Self>, rng: &mut R, parallel: bool) {
        markets::search_and_matching(m, rng, parallel)
    }
    fn firms_profits(m: &mut AbstractModel<Self>) -> Vec<f64> {
        firms::firms_profits(m)
    }
    fn gov_expenditure<R: Randomness + ?Sized>(m: &mut AbstractModel<Self>, rng: &mut R) -> (f64, Vec<f64>) {
        government::gov_expenditure(m, rng)
    }
    fn gov_loans(m: &mut AbstractModel<Self>) -> f64 {
        government::gov_loans(m)
    }
    fn rotw_import_export<R: Randomness + ?Sized>(
        m: &mut AbstractModel<Self>,
        rng: &mut R,
    ) -> (f64, f64, Vec<f64>, Vec<f64>, Vec<f64>) {
        rotw::rotw_import_export(m, rng)
    }
    fn households_budget_act(m: &mut AbstractModel<Self>) -> (Vec<f64>, Vec<f64>) {
        households::households_budget_act(m)
    }
    fn households_budget_inact(m: &mut AbstractModel<Self>) -> (Vec<f64>, Vec<f64>) {
        households::households_budget_inact(m)
    }
    fn households_income_act(m: &mut AbstractModel<Self>, expected: bool) -> Vec<f64> {
        households::households_income_act(m, expected)
    }
    fn gov_revenues(m: &mut AbstractModel<Self>) -> f64 {
        government::gov_revenues(m)
    }
    fn update_data_step(m: &mut AbstractModel<Self>) {
        data::update_data_step(m)
    }
    fn households_income_firms(m: &mut AbstractModel<Self>, expected: bool) -> Vec<f64> {
        households::households_income_firms(m, expected)
    }
    fn firms_deposits(m: &mut AbstractModel<Self>) -> Vec<f64> {
        firms::firms_deposits(m)
    }
    fn households_budget_firms(m: &mut AbstractModel<Self>) -> (Vec<f64>, Vec<f64>) {
        households::households_budget_firms(m)
    }
    fn households_budget_banks(m: &mut AbstractModel<Self>) -> (Vec<f64>, Vec<f64>) {
        households::households_budget_banks(m)
    }
    fn rotw_deposits(m: &mut AbstractModel<Self>) -> f64 {
        rotw::rotw_deposits(m)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
