//! The clock's rules of the port's src/firms.rs: plans on the firm's own day, production on working days and with
//! workers who are away, profits and deposits.

use beforeit::julia::min;
use beforeit::{AbstractModel, Extension, Firms, FirmsDecisions, Randomness, base};

use super::aggregates::compound;
use super::{DailyClock, OwnerProfit};
use crate::workers;

/// The work effort of the port (A.25, A.26, `firms.jl`): the output that planned supply, capital and intermediate
/// inputs allow, relative to what the employees produce at average productivity, at most 1.5. (The port keeps its own
/// copy private.)
fn effort(f: &Firms, i: usize) -> f64 {
    min(
        1.5,
        min(f.Q_s_i[i], min(f.K_i[i] * f.kappa_i[i], f.M_i[i] * f.beta_i[i])) / (f.N_i[i] as f64 * f.alpha_bar_i[i]),
    )
}

/// The port's `cost_push_inflation` (A.9). In an economy that pays wages in money the term of labour is the
/// port's with another price of labour: the port has `(1 + tau_SIF) * w_bar_i / alpha_bar_i * (P_bar_HH / P_i - 1)`,
/// where the consumer price level `P_bar_HH` is the price of labour because the wage follows it. Here the price of
/// labour is the wage in money over the real wage of the start, so the term is
/// `(1 + tau_SIF) * real_wage / alpha_bar_i * (wage / real_wage / P_i - 1)`, computed as
/// `(1 + tau_SIF) / alpha_bar_i * (wage / P_i - real_wage)`. The terms of materials and of capital are the port's.
pub(super) fn cost_push_inflation(m: &AbstractModel<DailyClock>, firms: &Firms) -> Vec<f64> {
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
pub(super) fn firms_expectations_and_decisions<R: Randomness + ?Sized>(
    m: &mut AbstractModel<DailyClock>,
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
    let cost_push = cost_push_inflation(m, &m.firms);
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
    let (mut I_d_i, mut DM_d_i, N_d_i) = DailyClock::desired_capital_material_employment(&m.firms, &d.Q_s_i);
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
/// those who stand in for them (economy features 23 and 24): `a (N − away + stand-ins) α`; the effort stays the
/// one the firm's employees give. What the firm would have made with all its workers is kept as the output lost
/// ([`DailyClock::lost`]) for the market of the period.
///
/// [`Attendance`]: super::Attendance
/// [`Absences`]: crate::workers::Absences
pub(super) fn firms_production(m: &mut AbstractModel<DailyClock>) -> Vec<f64> {
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

/// The port's profit of a firm (A.27); with [`DailyClock::owner`] without the stock it built or sold from,
/// valued at its price: what the firm took in less what it spent on what it made (economy feature 18; Caiani and
/// Catullo 2023, eq. 23). The stock stays in the firm's books in units; it is profit on the day it is sold.
pub(super) fn firms_profits(m: &mut AbstractModel<DailyClock>) -> Vec<f64> {
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

/// The port's deposits of a firm; with [`DailyClock::owner`] the firm gets from its owner what the owner bears
/// of a loss, the other side of [`Extension::households_income_firms`].
pub(super) fn firms_deposits(m: &mut AbstractModel<DailyClock>) -> Vec<f64> {
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
