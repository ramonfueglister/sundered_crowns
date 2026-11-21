//! The clock's rules of the port's src/rotw.rs: the merchants as the rest of the world of a city.

use beforeit::{AbstractModel, Randomness, base};

use super::DailyClock;
use crate::trade;

/// The port's `rotw_import_export`; in a city with merchants what they want and bring ([`trade::import_export`]).
pub(super) fn rotw_import_export<R: Randomness + ?Sized>(
    m: &mut AbstractModel<DailyClock>,
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

/// The port's `rotw_deposits`. The port divides the exports by the mean price paid for them, which is 0 / 0 on
/// a day without exports; its own rule of exports never gives such a day, the merchants do. For such a day the
/// mean price is set to 1 here, before the national accounts read it, so that real exports are 0.
pub(super) fn rotw_deposits(m: &mut AbstractModel<DailyClock>) -> f64 {
    if m.ext.trade.is_some() && m.rotw.C_l == 0.0 {
        m.rotw.P_l = 1.0;
    }
    base::rotw_deposits(m)
}
