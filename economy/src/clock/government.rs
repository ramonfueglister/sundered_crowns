//! The clock's rules of the port's src/government.rs: a crown that buys with what it took in, and its taxes on the
//! pays of the contracts.

use beforeit::{AbstractModel, Randomness, base};

use super::DailyClock;
use crate::workers;

/// The port's `gov_expenditure` (A.55, A.56); with [`DailyClock::crown_revenue`] the crown's budget is what it
/// took in the period before, less its other outlays of that period, and never below 0 (economy feature 16). The
/// series of the port is computed and its random number drawn all the same, so that every other draw of the
/// period stays where it was; before the first revenue (the first period) the series stands.
pub(super) fn gov_expenditure<R: Randomness + ?Sized>(
    m: &mut AbstractModel<DailyClock>,
    rng: &mut R,
) -> (f64, Vec<f64>) {
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
pub(super) fn gov_loans(m: &mut AbstractModel<DailyClock>) -> f64 {
    let l = base::gov_loans(m);
    if m.ext.crown_revenue {
        m.ext.crown_outlays = l - m.gov.L_G - m.gov.C_j + m.gov.Y_G;
    }
    l
}

/// The port's revenue of the crown (A.59), with the taxes on what the workers are paid more or less than the
/// port's pay (economy feature 23).
pub(super) fn gov_revenues(m: &mut AbstractModel<DailyClock>) -> f64 {
    base::gov_revenues(m) + workers::taxes_on_pays(m)
}
