//! The clock's rules of the port's src/aggregates.rs: the expectations on windows of days, and the price indices on
//! days on which nothing is made or sold.

use beforeit::{AbstractModel, Extension, Randomness, base};

use super::DailyClock;

/// `(1 + rate)` compounded over `periods` periods.
pub(super) fn compound(rate: f64, periods: usize) -> f64 {
    if periods == 1 {
        1.0 + rate
    } else {
        libm::pow(1.0 + rate, periods as f64)
    }
}

/// The rate per period that compounds to `rate` over `periods` periods.
fn per_period(rate: f64, periods: usize) -> f64 {
    if periods == 1 {
        rate
    } else {
        libm::pow(1.0 + rate, 1.0 / periods as f64) - 1.0
    }
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
    let value = |j: usize| {
        if j < before {
            series[j / window]
        } else {
            series[history + j - before]
        }
    };
    let count = periods / window;
    (0..count)
        .map(|k| {
            let from = periods - (count - k) * window;
            (from..from + window).map(value).sum()
        })
        .collect()
}

/// The port's `growth_inflation_expectations` (A.6, A.7, A.10) on windows: expected GDP, growth and inflation of
/// the next period.
pub(super) fn growth_inflation_expectations<R: Randomness + ?Sized>(
    m: &mut AbstractModel<DailyClock>,
    rng: &mut R,
) -> (f64, f64, f64) {
    let window = m.ext.window;
    // the forecasts of the logarithm of real GDP and of inflation, and the two windows that end today
    let (next_Y, next_pi, Y, pi) = if let Some(past) = &m.ext.past {
        (
            past.Y.next_value(past.periods, rng),
            past.pi.next_value(past.periods, rng),
            past.Y.sum,
            past.pi.sum,
        )
    } else {
        let n = m.prop.T_prime + m.agg.t - 1;
        let Y = windows(&m.agg.Y[..n], m.prop.T_prime, window);
        let pi = windows(&m.agg.pi_[..n], m.prop.T_prime, window);
        let last = Y.len() - 1;
        let log_Y: Vec<f64> = Y.iter().map(|&y| libm::log(y)).collect();
        (
            DailyClock::estimate_next_value(&log_Y, rng),
            DailyClock::estimate_next_value(&pi, rng),
            Y[last],
            pi[last],
        )
    };
    let Y_e = libm::exp(next_Y);
    let gamma_e = Y_e / Y - 1.0;
    let mut pi_e = libm::exp(next_pi) - 1.0;
    let omega_pi = m.prop.omega_pi;
    pi_e = (1.0 - omega_pi) * pi_e + (omega_pi * pi);
    (
        Y_e / window as f64,
        per_period(gamma_e, window),
        per_period(pi_e, window),
    )
}

/// The port's price index (A.11, A.12), which weights the prices of the firms with what they made in the period.
/// On a day on which no firm works (economy feature 19) there is nothing to weight with: the price index stays
/// where it was and the inflation of the day is 0.
pub(super) fn inflation_priceindex(m: &mut AbstractModel<DailyClock>) -> (f64, f64) {
    if m.firms.Y_i.iter().all(|&y| y == 0.0) {
        return (0.0, m.agg.P_bar);
    }
    base::inflation_priceindex(m)
}

/// The port's price index of every product (A.32), which weights with what was sold and imported in the period:
/// a product of which nothing was sold or imported (on a day of rest, economy feature 19) keeps its index.
pub(super) fn sector_specific_priceindex(m: &mut AbstractModel<DailyClock>) -> Vec<f64> {
    let mut index = base::sector_specific_priceindex(m);
    for (p, before) in index.iter_mut().zip(&m.agg.P_bar_g) {
        if !p.is_finite() {
            *p = *before;
        }
    }
    index
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
}
