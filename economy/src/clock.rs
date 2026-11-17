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
#![allow(non_snake_case)] // the fields of the port carry the names of the paper's appendix

use beforeit::{AbstractModel, Extension, Firms, FirmsDecisions, Randomness, base};

use crate::past::Past;
use crate::trade::{self, Trade};

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
    /// the past in a fixed size ([`crate::past`]); `None`: the expectations are estimated on the port's lists of
    /// every period since the start, bit for bit as the port does
    pub past: Option<Past>,
    /// what the merchants want from this economy and bring to it in the period that is being computed
    /// ([`crate::trade`]); `None` between two periods and in an economy on its own. Not part of the saved state.
    pub trade: Option<Trade>,
}

impl DailyClock {
    /// The clock of a model with `firms` firms that has not computed a period yet.
    pub fn new(plan: usize, window: usize, firms: usize) -> Result<DailyClock, String> {
        if plan == 0 || window == 0 {
            return Err(format!("a plan every {plan} periods and windows of {window} periods: both need at least one period"));
        }
        Ok(DailyClock { plan, window, demand: vec![0.0; firms], periods: vec![0; firms], start: [f64::NAN; 2], accounts: Vec::new(), wage: Vec::new(), real_wage: Vec::new(), demand_pull: false, savings: 0.0, norm: -1.0, past: None, trade: None })
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
    if periods == 1 { 1.0 + rate } else { libm::pow(1.0 + rate, periods as f64) }
}

/// The rate per period that compounds to `rate` over `periods` periods.
fn per_period(rate: f64, periods: usize) -> f64 {
    if periods == 1 { rate } else { libm::pow(1.0 + rate, 1.0 / periods as f64) - 1.0 }
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
    let value = |j: usize| if j < before { series[j / window] } else { series[history + j - before] };
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
        let budgets = sum(&base::households_budget_act(m).0) + sum(&base::households_budget_inact(m).0) + sum(&base::households_budget_firms(m).0) + sum(&base::households_budget_banks(m).0);
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

impl Extension for DailyClock {
    /// The port's `growth_inflation_expectations` (A.6, A.7, A.10) on windows: expected GDP, growth and inflation of
    /// the next period.
    fn growth_inflation_expectations<R: Randomness + ?Sized>(m: &mut AbstractModel<Self>, rng: &mut R) -> (f64, f64, f64) {
        let window = m.ext.window;
        // the forecasts of the logarithm of real GDP and of inflation, and the two windows that end today
        let (next_Y, next_pi, Y, pi) = if let Some(past) = &m.ext.past {
            (past.Y.next_value(past.periods, rng), past.pi.next_value(past.periods, rng), past.Y.sum, past.pi.sum)
        } else {
            let n = m.prop.T_prime + m.agg.t - 1;
            let Y = windows(&m.agg.Y[..n], m.prop.T_prime, window);
            let pi = windows(&m.agg.pi_[..n], m.prop.T_prime, window);
            let last = Y.len() - 1;
            let log_Y: Vec<f64> = Y.iter().map(|&y| libm::log(y)).collect();
            (Self::estimate_next_value(&log_Y, rng), Self::estimate_next_value(&pi, rng), Y[last], pi[last])
        };
        let Y_e = libm::exp(next_Y);
        let gamma_e = Y_e / Y - 1.0;
        let mut pi_e = libm::exp(next_pi) - 1.0;
        let omega_pi = m.prop.omega_pi;
        pi_e = (1.0 - omega_pi) * pi_e + (omega_pi * pi);
        (Y_e / window as f64, per_period(gamma_e, window), per_period(pi_e, window))
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
    /// # Panics
    ///
    /// If the model has gained or lost firms: the clock does not follow that.
    fn firms_expectations_and_decisions<R: Randomness + ?Sized>(m: &mut AbstractModel<Self>, rng: &mut R) -> FirmsDecisions {
        let I = m.firms.len();
        assert!(m.ext.demand.len() == I && m.ext.periods.len() == I, "the daily clock holds {} firms, the model has {I}", m.ext.demand.len());
        if m.ext.pays_in_money() {
            assert!(m.ext.wage.len() == I && m.ext.real_wage.len() == I, "the daily clock holds the wages of {} firms, the model has {I}", m.ext.wage.len());
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
            if m.ext.plans(i, t) {
                let Q_d = m.ext.demand[i] / m.ext.periods[i] as f64;
                if m.ext.demand_pull {
                    let (Q_s, P, P_g) = (m.firms.Q_s_i[i], m.firms.P_i[i], m.agg.P_bar_g[m.firms.G_i[i]]);
                    let gap = Q_d / Q_s - 1.0;
                    let (gamma_d, pi_d) = if (Q_s <= Q_d) == (P >= P_g) { (gap, 0.0) } else { (0.0, gap) };
                    d.Q_s_i[i] = Q_s * growth * (1.0 + gamma_d);
                    d.new_P_i[i] = P * (1.0 + cost_push[i]) * inflation * (1.0 + pi_d);
                } else {
                    d.Q_s_i[i] = Q_d * growth;
                    d.new_P_i[i] = m.firms.P_i[i] * (1.0 + cost_push[i]) * inflation;
                }
                m.ext.demand[i] = 0.0;
                m.ext.periods[i] = 0;
            } else {
                d.Q_s_i[i] = m.firms.Q_s_i[i];
                d.new_P_i[i] = m.firms.P_i[i];
            }
        }
        // what follows from the supply, by the port's rule (A.14, A.18, A.22)
        let (I_d_i, DM_d_i, N_d_i) = Self::desired_capital_material_employment(&m.firms, &d.Q_s_i);
        d.I_d_i = I_d_i;
        d.DM_d_i = DM_d_i;
        d.N_d_i = N_d_i;
        d
    }

    /// The port's `rotw_import_export`; in a city with merchants what they want and bring ([`trade::import_export`]).
    fn rotw_import_export<R: Randomness + ?Sized>(m: &mut AbstractModel<Self>, rng: &mut R) -> (f64, f64, Vec<f64>, Vec<f64>, Vec<f64>) {
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
        let (mut c, i) = base::households_budget_act(m);
        spend_savings(&mut c, &m.w_act.D_h, m.ext.savings, n, m.prop.tau_VAT);
        (c, i)
    }
    fn households_budget_inact(m: &mut AbstractModel<Self>) -> (Vec<f64>, Vec<f64>) {
        let n = norm(m);
        let (mut c, i) = base::households_budget_inact(m);
        spend_savings(&mut c, &m.w_inact.D_h, m.ext.savings, n, m.prop.tau_VAT);
        (c, i)
    }
    fn households_budget_firms(m: &mut AbstractModel<Self>) -> (Vec<f64>, Vec<f64>) {
        let n = norm(m);
        let (mut c, i) = base::households_budget_firms(m);
        spend_savings(&mut c, &m.firms.D_h, m.ext.savings, n, m.prop.tau_VAT);
        (c, i)
    }
    fn households_budget_banks(m: &mut AbstractModel<Self>) -> (Vec<f64>, Vec<f64>) {
        let n = norm(m);
        let (mut c, i) = base::households_budget_banks(m);
        spend_savings(&mut c, &m.banks.D_h, m.ext.savings, n, m.prop.tau_VAT);
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
