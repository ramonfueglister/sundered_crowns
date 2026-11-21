//! The clock's rules of the port's src/households.rs: budgets out of savings and on working days, incomes with the
//! pays of the contracts, and owners who bear losses.

use beforeit::{AbstractModel, base};

use super::DailyClock;
use crate::workers;

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
///
/// [`Attendance::household`]: super::Attendance::household
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

/// The port's budgets of the four kinds of households (A.46, A.49), and out of savings ([`spend_savings`]).
pub(super) fn households_budget_act(m: &mut AbstractModel<DailyClock>) -> (Vec<f64>, Vec<f64>) {
    let n = norm(m);
    let (mut c, mut i) = base::households_budget_act(m);
    spend_savings(&mut c, &m.w_act.D_h, m.ext.savings, n, m.prop.tau_VAT);
    on_working_days(m, &mut c, &mut i, 0);
    (c, i)
}

pub(super) fn households_budget_inact(m: &mut AbstractModel<DailyClock>) -> (Vec<f64>, Vec<f64>) {
    let n = norm(m);
    let (mut c, mut i) = base::households_budget_inact(m);
    spend_savings(&mut c, &m.w_inact.D_h, m.ext.savings, n, m.prop.tau_VAT);
    on_working_days(m, &mut c, &mut i, m.w_act.len());
    (c, i)
}

/// The port's income of a worker (A.53); the realised one with what the worker is paid more or less than the
/// port's pay in the period (economy feature 23). The expected one, which the budget is planned on (A.46), stays
/// the wage of the contract per mean day.
pub(super) fn households_income_act(m: &mut AbstractModel<DailyClock>, expected: bool) -> Vec<f64> {
    let mut y = base::households_income_act(m, expected);
    if !expected {
        workers::add_pays(m, &mut y);
    }
    y
}

/// The port's income of an owner (A.33, A.44), which holds the share of a profit and nothing of a loss; with
/// [`DailyClock::owner`] the owner bears the same share of a loss: firm and owner are one household with
/// unlimited liability (economy feature 18; SNA 2008, 4.155 and 4.158).
pub(super) fn households_income_firms(m: &mut AbstractModel<DailyClock>, expected: bool) -> Vec<f64> {
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

pub(super) fn households_budget_firms(m: &mut AbstractModel<DailyClock>) -> (Vec<f64>, Vec<f64>) {
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

pub(super) fn households_budget_banks(m: &mut AbstractModel<DailyClock>) -> (Vec<f64>, Vec<f64>) {
    let n = norm(m);
    let (mut c, mut i) = base::households_budget_banks(m);
    spend_savings(&mut c, &m.banks.D_h, m.ext.savings, n, m.prop.tau_VAT);
    on_working_days(m, &mut c, &mut i, m.w_act.len() + m.w_inact.len());
    (c, i)
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
