//! The clock's rule of the port's src/data.rs: the national accounts with the wages as they were paid.

use beforeit::{AbstractModel, base};

use super::DailyClock;
use crate::workers;

/// The port's national accounts of the period, with the wages as they were paid (economy feature 23): what the
/// firms paid more or less than the port's wages is compensation of employees, not operating surplus.
pub(super) fn update_data_step(m: &mut AbstractModel<DailyClock>) {
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
