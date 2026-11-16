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
//! The port takes one model type per model, so this one also carries what a city needs that trades with other cities
//! ([`crate::trade`]): while the merchants have set what they want and bring, the rule of the rest of the world reads
//! that instead of the port's random series. An economy on its own never has merchants and computes as before.
#![allow(non_snake_case)] // the fields of the port carry the names of the paper's appendix

use beforeit::{AbstractModel, Extension, Firms, FirmsDecisions, Randomness, base};

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
    /// the wage in money (economy feature 7): per firm the wage in money it pays for a unit of work, and the real
    /// wage it had when the wage in money was set. Both empty: the wage follows the consumer prices, as in the port.
    pub wage: Vec<f64>,
    pub real_wage: Vec<f64>,
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
        Ok(DailyClock { plan, window, demand: vec![0.0; firms], periods: vec![0; firms], start: [f64::NAN; 2], wage: Vec::new(), real_wage: Vec::new(), trade: None })
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

impl Extension for DailyClock {
    /// The port's `growth_inflation_expectations` (A.6, A.7, A.10) on windows: expected GDP, growth and inflation of
    /// the next period.
    fn growth_inflation_expectations<R: Randomness + ?Sized>(m: &mut AbstractModel<Self>, rng: &mut R) -> (f64, f64, f64) {
        let window = m.ext.window;
        let n = m.prop.T_prime + m.agg.t - 1;
        let Y = windows(&m.agg.Y[..n], m.prop.T_prime, window);
        let pi = windows(&m.agg.pi_[..n], m.prop.T_prime, window);
        let last = Y.len() - 1;
        let log_Y: Vec<f64> = Y.iter().map(|&y| libm::log(y)).collect();
        let Y_e = libm::exp(Self::estimate_next_value(&log_Y, rng));
        let gamma_e = Y_e / Y[last] - 1.0;
        let mut pi_e = libm::exp(Self::estimate_next_value(&pi, rng)) - 1.0;
        let omega_pi = m.prop.omega_pi;
        pi_e = (1.0 - omega_pi) * pi_e + (omega_pi * pi[last]);
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
        let (plan, t) = (m.ext.plan, m.agg.t);
        let (growth, inflation) = (compound(m.agg.gamma_e, plan), compound(m.agg.pi_e, plan));
        let cost_push = Self::cost_push_inflation(m, &m.firms);
        for i in 0..I {
            m.ext.demand[i] += m.firms.Q_d_i[i];
            m.ext.periods[i] += 1;
            if m.ext.plans(i, t) {
                d.Q_s_i[i] = m.ext.demand[i] / m.ext.periods[i] as f64 * growth;
                d.new_P_i[i] = m.firms.P_i[i] * (1.0 + cost_push[i]) * inflation;
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
