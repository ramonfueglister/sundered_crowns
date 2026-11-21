//! The rows of the national accounts the shell keeps: the series the key figures sum over a window, taken from
//! the port's rows, which keep only their last row.

use beforeit::{AbstractModel, Data};

use crate::SUMMED;
use crate::clock::DailyClock;

/// Row `t` of the series of the national accounts that [`Economy::figures`] sums over a window, in this order: real
/// and nominal GDP, real consumption of the households and of the government, real fixed capital formation, real
/// exports and real imports.
///
/// [`Economy::figures`]: crate::Economy::figures
pub(crate) fn summed(d: &Data, t: usize) -> [f64; SUMMED] {
    [
        d.real_gdp[t],
        d.nominal_gdp[t],
        d.real_household_consumption[t],
        d.real_government_consumption[t],
        d.real_fixed_capitalformation[t],
        d.real_exports[t],
        d.real_imports[t],
    ]
}

/// The sum of series `k` of the kept rows ([`clock::DailyClock::accounts`]) over the last `window` periods. While
/// fewer periods are computed, the first row is the starting position and stands for the periods before the start.
///
/// [`clock::DailyClock::accounts`]: crate::clock::DailyClock::accounts
pub(crate) fn over_window(rows: &[[f64; SUMMED]], k: usize, computed: usize, window: usize) -> f64 {
    if computed >= window {
        return rows[rows.len() - window..].iter().map(|r| r[k]).sum();
    }
    (window - computed) as f64 * rows[0][k] + rows[1..].iter().map(|r| r[k]).sum::<f64>()
}

/// Moves the rows of the national accounts that the port has added since the last call into the rows the clock keeps
/// (the series of [`summed`], for the last `window` periods), and leaves the port its last row alone. All series of
/// the port keep the same length: its collector writes a new row at the position the first series gives.
pub(crate) fn take_rows(m: &mut AbstractModel<DailyClock>) {
    let rows = m.data.collection_time.len();
    for t in 1..rows {
        let row = summed(&m.data, t);
        m.ext.accounts.push(row);
    }
    let kept = m.ext.accounts.len();
    if kept > m.ext.window {
        m.ext.accounts.drain(..kept - m.ext.window);
    }
    drop_rows(&mut m.data, rows - 1);
}

/// Removes the first `n` rows of the national accounts. Every series is named without `..`: when the port gains a
/// series, this stops compiling instead of keeping it whole.
fn drop_rows(d: &mut Data, n: usize) {
    let Data {
        collection_time,
        nominal_gdp,
        real_gdp,
        nominal_gva,
        real_gva,
        nominal_household_consumption,
        real_household_consumption,
        nominal_government_consumption,
        real_government_consumption,
        nominal_capitalformation,
        real_capitalformation,
        nominal_fixed_capitalformation,
        real_fixed_capitalformation,
        nominal_fixed_capitalformation_dwellings,
        real_fixed_capitalformation_dwellings,
        nominal_exports,
        real_exports,
        nominal_imports,
        real_imports,
        operating_surplus,
        compensation_employees,
        wages,
        taxes_production,
        gdp_deflator_growth_ea,
        real_gdp_ea,
        euribor,
        nominal_sector_gva,
        real_sector_gva,
        credit_new_per_bank,
        credit_stock_per_bank,
        equity_per_bank,
        reserves_per_bank,
        roe_per_bank,
    } = d;
    collection_time.drain(..n);
    for v in [
        nominal_gdp,
        real_gdp,
        nominal_gva,
        real_gva,
        nominal_household_consumption,
        real_household_consumption,
        nominal_government_consumption,
        real_government_consumption,
        nominal_capitalformation,
        real_capitalformation,
        nominal_fixed_capitalformation,
        real_fixed_capitalformation,
        nominal_fixed_capitalformation_dwellings,
        real_fixed_capitalformation_dwellings,
        nominal_exports,
        real_exports,
        nominal_imports,
        real_imports,
        operating_surplus,
        compensation_employees,
        wages,
        taxes_production,
        gdp_deflator_growth_ea,
        real_gdp_ea,
        euribor,
    ] {
        v.drain(..n);
    }
    for v in [
        nominal_sector_gva,
        real_sector_gva,
        credit_new_per_bank,
        credit_stock_per_bank,
        equity_per_bank,
        reserves_per_bank,
        roe_per_bank,
    ] {
        v.drain(..n);
    }
}
