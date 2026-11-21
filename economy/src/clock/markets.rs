//! The clock's rules of the port's src/markets.rs: the labour market with stand-ins, and the goods market on working
//! days.

use beforeit::{AbstractModel, Randomness, base};

use super::DailyClock;
use crate::workers;

/// The port's labour market (A.1.1); with contracts (economy feature 23) then who stands in for the workers who
/// are away and who is paid what in the period ([`workers::today`]).
pub(super) fn search_and_matching_labour<R: Randomness + ?Sized>(m: &mut AbstractModel<DailyClock>, rng: &mut R) {
    base::search_and_matching_labour(m, rng);
    m.ext.today = workers::today(m, rng);
}

/// The port's goods market (A.42 and the rules of the market). With working days the spare capacity of a firm,
/// `K κ − Y` in the port, which records the demand the firm cannot serve, is that of the day: `a K κ − Y`. The mean
/// prices the households paid for what they consumed and for what they invested, and the crown and the buyers
/// abroad for what they bought, are what they paid over what they bought: 0 / 0 or 0 on a day on which they bought
/// nothing, which a day of rest gives (economy feature 19). Such a price stays that of the day before, or 1 if
/// there is none; what they bought is 0 at any price.
pub(super) fn search_and_matching<R: Randomness + ?Sized>(
    m: &mut AbstractModel<DailyClock>,
    rng: &mut R,
    parallel: bool,
) {
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
