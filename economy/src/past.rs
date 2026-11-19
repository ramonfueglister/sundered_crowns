//! The past the expectations are formed on, in a size that does not grow with the age of the economy.
//!
//! The port forecasts growth and inflation with an AR(1) estimate over the whole past (A.6, A.7, A.10): least squares
//! of every value on the value before it and a constant, and a shock with the standard deviation of the residuals.
//! The daily clock does so on sums over windows of `window` periods that end today ([`crate::clock`]). So the
//! windows of a day are the windows of the same day one window earlier, and one more: the last `window` periods.
//! Least squares of a value on the value before it needs, of all those pairs, only six numbers: how many they are,
//! the sums of both values, of their squares and of their products; and with the first and the last window four
//! are enough. This module keeps these for each of the
//! `window` positions a day can have in a window, and the values of the last `window` periods, from which the new
//! window is summed. The estimate is the port's estimate (its `rfvar3` with one lag and a constant, solved with the
//! pseudoinverse, singular values up to `100 · eps` counted as 0), computed from the sums instead of from the rows.
//! The two agree up to rounding (the tests of this module), not bit for bit.
//!
//! The sums are kept of the values minus a fixed `origin` (for real GDP, whose logarithm is estimated, the logarithm
//! of the first window of the history): the values of a series lie close together and far from 0, and sums of their
//! squares would lose the digits that the estimate lives on.
#![allow(non_snake_case)] // the fields of the port carry the names of the paper's appendix

use beforeit::Randomness;

/// Of the windows that end at one position of a day in a window: the last of them, and of the pairs of a window
/// and the window after it the sums of the first of each pair, of its square and of the product of the two. All
/// values are minus the origin of the series. What the estimate needs beyond these follows from them: the number of
/// windows from the number of periods, and the sums of the second of each pair from the sums of the first, the
/// first window of all (which lies in the history before the start) and the last.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Phase {
    pub last: f64,
    pub x: f64,
    pub xx: f64,
    pub xy: f64,
}

impl Phase {
    /// One more window after the last.
    fn add(&mut self, value: f64) {
        let before = self.last;
        self.x += before;
        self.xx += before * before;
        self.xy += before * value;
        self.last = value;
    }
}

/// One series of the past: real GDP or inflation.
#[derive(Clone, Debug, PartialEq)]
pub struct Series {
    /// whether the estimate is made on the logarithm of a window (real GDP) or on the window itself (inflation)
    pub log: bool,
    /// what is taken off every value before it is summed
    pub origin: f64,
    /// the entries of the history before the start, and the first two of them: every first window lies in these
    pub history: usize,
    pub early: [f64; 2],
    /// the values of the last `window` periods. The oldest is at position `periods % window`, the others follow in
    /// their order, around the end.
    pub days: Vec<f64>,
    /// the sum of `days`, oldest first: the window that ends today
    pub sum: f64,
    /// per position of a day in a window (`periods % window`) the windows that end there
    pub phases: Vec<Phase>,
}

impl Series {
    fn measure(&self, sum: f64) -> f64 {
        (if self.log { libm::log(sum) } else { sum }) - self.origin
    }

    /// The windows that end at position `q`, after `periods` periods: those of the history, one more for every
    /// window of periods computed, and one fewer if the position has not come yet in the window that runs.
    fn count(&self, periods: usize, q: usize) -> usize {
        let window = self.days.len();
        self.history + periods / window - usize::from(q > periods % window)
    }

    /// The first window that ends at position `q`: the periods `q` to `q + window` of the history.
    fn first(&self, q: usize) -> f64 {
        self.measure((self.days.len() - q) as f64 * self.early[0] + q as f64 * self.early[1])
    }

    /// The series from the whole past as the port keeps it: `history` entries from before the start, each standing
    /// for `window` periods with its value, then one value per period computed.
    ///
    /// The windows of the positions that are not today's are summed as differences of running sums, today's window
    /// value by value as the port's rule on the whole past does.
    ///
    /// # Panics
    ///
    /// For a history of fewer than two entries: on the first day the port's estimate has one window then and stops.
    pub fn new(series: &[f64], history: usize, window: usize, log: bool) -> Series {
        assert!(
            history >= 2,
            "a history of {history} entries: the AR(1) estimate needs two windows"
        );
        let before = history * window;
        let computed = series.len() - history;
        let periods = before + computed;
        let value = |j: usize| {
            if j < before {
                series[j / window]
            } else {
                series[history + j - before]
            }
        };
        let mut running = Vec::with_capacity(periods + 1);
        let mut total = 0.0;
        running.push(total);
        for j in 0..periods {
            total += value(j);
            running.push(total);
        }
        let today = computed % window;
        let days: Vec<f64> = (0..window)
            .map(|i| value(periods - window + (i + window - today) % window))
            .collect();
        let sum = (0..window).map(|i| days[(today + i) % window]).sum();
        let mut s = Series {
            log,
            origin: 0.0,
            history,
            early: [series[0], series[1]],
            days,
            sum,
            phases: vec![Phase::default(); window],
        };
        s.origin = s.measure(window as f64 * series[0]);
        for q in 0..window {
            // the last day at position q: today, a day of this window before today, or a day of the window before
            let end = periods + q - today - if q > today { window } else { 0 };
            let count = s.count(computed, q);
            s.phases[q].last = s.first(q);
            for k in 1..count {
                let from = end - (count - k) * window;
                let sum = if q == today && k + 1 == count {
                    s.sum
                } else {
                    running[from + window] - running[from]
                };
                let x = s.measure(sum);
                s.phases[q].add(x);
            }
        }
        s
    }

    /// The value of the period after `periods` periods: it takes the place of the oldest, and the window that ends
    /// with it joins the windows of its position.
    pub fn push(&mut self, periods: usize, value: f64) {
        let window = self.days.len();
        self.days[periods % window] = value;
        let today = (periods + 1) % window;
        self.sum = (0..window).map(|i| self.days[(today + i) % window]).sum();
        let x = self.measure(self.sum);
        self.phases[today].add(x);
    }

    /// The port's `estimate_next_value` on the windows that end after `periods` periods: the AR(1) forecast of the
    /// next window (of its logarithm for real GDP) with a random shock.
    ///
    /// # Panics
    ///
    /// Never for the fewer than two windows the port stops at: a series has at least two entries of history.
    pub fn next_value<R: Randomness + ?Sized>(&self, periods: usize, rng: &mut R) -> f64 {
        let q = periods % self.days.len();
        let p = &self.phases[q];
        let (c, n) = (self.origin, (self.count(periods, q) - 1) as f64);
        // the sums of the second of each pair: those of the first without the first window and with the last
        let first = self.first(q);
        let (y, yy) = (p.x - first + p.last, p.xx - first * first + p.last * p.last);
        // sums of squares and products around the means
        let (sxx, sxy, syy) = (p.xx - p.x * p.x / n, p.xy - p.x * y / n, yy - y * y / n);
        // the smaller singular value of the regressors (the values and a column of ones), squared: the determinant
        // of their products over the larger one, which is the trace up to that smaller one
        let trace = p.xx + 2.0 * c * p.x + c * c * n + n;
        let limit = 100.0 * f64::EPSILON;
        let singular = !(n * sxx > limit * limit * trace && sxx > 1e-12 * p.xx);
        let (forecast, residuals) = if singular {
            // the values before are all the same: the pseudoinverse gives the shortest coefficients that fit the mean
            let (k, mean) = (c + p.x / n, c + y / n);
            let (alpha, beta) = (k * mean / (k * k + 1.0), mean / (k * k + 1.0));
            (alpha * (c + p.last) + beta, syy)
        } else {
            let alpha = sxy / sxx;
            let beta = (y - alpha * p.x) / n;
            (c + alpha * p.last + beta, syy - alpha * sxy)
        };
        // the port: the squared deviations of the residuals from their mean times 1 / (n − 1); not a number for one
        // residual, and then no shock
        let sigma = if n > 1.0 {
            (residuals / (n - 1.0)).max(0.0).sqrt()
        } else {
            f64::NAN
        };
        let epsilon = if sigma > 0.0 { sigma * rng.randn() } else { 0.0 };
        forecast + epsilon
    }
}

/// The past of an economy that keeps it in a fixed size: the number of periods computed, and real GDP and inflation.
#[derive(Clone, Debug, PartialEq)]
pub struct Past {
    pub periods: usize,
    pub Y: Series,
    pub pi: Series,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::windows;
    use beforeit::Xoshiro;

    fn rng(seed: u64) -> Xoshiro {
        Xoshiro::seed_from_u64(seed)
    }

    fn port(series: &[f64], history: usize, window: usize, log: bool, seed: u64) -> f64 {
        let w = windows(series, history, window);
        let w: Vec<f64> = if log {
            w.iter().map(|&y| libm::log(y)).collect()
        } else {
            w
        };
        beforeit::estimate::estimate_next_value(&w, &mut rng(seed))
    }

    /// A series that looks like a city: a history that moves from year to year, then days around a level with a
    /// drift and noise.
    fn series(history: usize, days: usize, level: f64, noise: f64, seed: u64) -> Vec<f64> {
        let mut r = rng(seed);
        let mut v: Vec<f64> = (0..history)
            .map(|k| level * (1.0 + 0.01 * k as f64 + 0.02 * r.randn()))
            .collect();
        let mut x = level * 1.1;
        for _ in 0..days {
            x += noise * level * r.randn() - 0.02 * (x - level * 1.15);
            v.push(x);
        }
        v
    }

    fn close(a: f64, b: f64, tolerance: f64, what: &str) {
        assert!((a - b).abs() <= tolerance * (1.0 + b.abs()), "{what}: {a} against {b}");
    }

    /// Least squares of every value on the value before it and a constant, row by row around the means, with the
    /// port's shock: the estimate without the rounding of the port's decomposition of regressors that barely differ.
    /// `None` when the values before are all the same.
    fn around_the_means(series: &[f64], history: usize, window: usize, log: bool, seed: u64) -> Option<f64> {
        let w = windows(series, history, window);
        let w: Vec<f64> = if log {
            w.iter().map(|&y| libm::log(y)).collect()
        } else {
            w
        };
        let (x, y) = (&w[..w.len() - 1], &w[1..]);
        let n = x.len() as f64;
        let (mx, my) = (x.iter().sum::<f64>() / n, y.iter().sum::<f64>() / n);
        let sxx: f64 = x.iter().map(|v| (v - mx) * (v - mx)).sum();
        if sxx == 0.0 {
            return None;
        }
        let alpha = x.iter().zip(y).map(|(a, b)| (a - mx) * (b - my)).sum::<f64>() / sxx;
        let u: Vec<f64> = x.iter().zip(y).map(|(a, b)| (b - my) - alpha * (a - mx)).collect();
        let mu = u.iter().sum::<f64>() / n;
        let sigma = (u.iter().map(|v| (v - mu) * (v - mu)).sum::<f64>() / (n - 1.0))
            .max(0.0)
            .sqrt();
        let epsilon = if sigma > 0.0 { sigma * rng(seed).randn() } else { 0.0 };
        Some(my + alpha * (w[w.len() - 1] - mx) + epsilon)
    }

    #[test]
    fn the_estimate_from_the_sums_is_the_ports_estimate_on_the_whole_past() {
        for (window, history, days) in [(1, 5, 40), (7, 3, 100), (365, 77, 1200), (365, 2, 800)] {
            let Y = series(history, days, 180.0, 0.01, 7);
            let pi: Vec<f64> = series(history, days, 1.0, 0.3, 8)
                .iter()
                .map(|v| (v - 1.1) * 1e-3)
                .collect();
            // built at the start and fed day by day, and built from the whole past of that day
            let (mut fed_Y, mut fed_pi) = (
                Series::new(&Y[..history], history, window, true),
                Series::new(&pi[..history], history, window, false),
            );
            for t in 0..=days {
                let n = history + t;
                if t > 0 {
                    fed_Y.push(t - 1, Y[n - 1]);
                    fed_pi.push(t - 1, pi[n - 1]);
                }
                if t % 97 == 0 || t == days || t < 3 {
                    let (built_Y, built_pi) = (
                        Series::new(&Y[..n], history, window, true),
                        Series::new(&pi[..n], history, window, false),
                    );
                    let last = *windows(&Y[..n], history, window).last().unwrap();
                    assert_eq!(fed_Y.sum, last, "the window that ends today, window {window} day {t}");
                    assert_eq!(built_Y.sum, last);
                    // a city of the game (a window of 365 days, 77 years of history) agrees to 12 digits; with two or
                    // three years of history the estimate rests on a handful of windows and the port's own solution
                    // carries more rounding
                    let tolerance = if history >= 5 { 1e-12 } else { 1e-8 };
                    for seed in [1, 2] {
                        let what = format!("window {window}, history {history}, day {t}");
                        close(
                            fed_Y.next_value(t, &mut rng(seed)),
                            port(&Y[..n], history, window, true, seed),
                            tolerance,
                            &format!("real GDP fed, {what}"),
                        );
                        close(
                            built_Y.next_value(t, &mut rng(seed)),
                            port(&Y[..n], history, window, true, seed),
                            tolerance,
                            &format!("real GDP built, {what}"),
                        );
                        close(
                            fed_pi.next_value(t, &mut rng(seed)),
                            port(&pi[..n], history, window, false, seed),
                            tolerance,
                            &format!("inflation fed, {what}"),
                        );
                        close(
                            built_pi.next_value(t, &mut rng(seed)),
                            port(&pi[..n], history, window, false, seed),
                            tolerance,
                            &format!("inflation built, {what}"),
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn a_history_that_never_moved_gives_the_ports_estimate_too() {
        // the port's own calibration: the same real GDP in every year of the history and no inflation
        let (history, window) = (4, 30);
        let mut Y = vec![5.0; history];
        let mut pi = vec![0.0; history];
        let (mut sY, mut sp) = (
            Series::new(&Y, history, window, true),
            Series::new(&pi, history, window, false),
        );
        let mut r = rng(3);
        for t in 0..100 {
            for seed in [1, 2] {
                let (mine_Y, mine_pi) = (sY.next_value(t, &mut rng(seed)), sp.next_value(t, &mut rng(seed)));
                // While the windows before are all the same, the port's pseudoinverse fits the mean: the same here.
                // Once one of them differs a little, the port decomposes regressors that are nearly one column and
                // its solution carries rounding up to the sixth digit; the sums agree with least squares around
                // the means to 10 digits, and with the port as far as the port is exact.
                close(
                    mine_Y,
                    port(&Y, history, window, true, seed),
                    1e-5,
                    &format!("real GDP against the port, day {t}"),
                );
                close(
                    mine_pi,
                    port(&pi, history, window, false, seed),
                    1e-9,
                    &format!("inflation against the port, day {t}"),
                );
                match around_the_means(&Y, history, window, true, seed) {
                    Some(exact) => close(
                        mine_Y,
                        exact,
                        1e-10,
                        &format!("real GDP against least squares around the means, day {t}"),
                    ),
                    None => close(
                        mine_Y,
                        port(&Y, history, window, true, seed),
                        1e-12,
                        &format!("real GDP, the same windows before, day {t}"),
                    ),
                }
            }
            let (y, p) = (5.0 * (1.0 + 0.01 * r.randn()), 1e-4 * r.randn());
            Y.push(y);
            pi.push(p);
            sY.push(t, y);
            sp.push(t, p);
        }
    }

    #[test]
    fn the_size_does_not_depend_on_the_age() {
        let young = Series::new(&series(77, 10, 180.0, 0.01, 1), 77, 365, true);
        let old = Series::new(&series(77, 5000, 180.0, 0.01, 1), 77, 365, true);
        assert_eq!((young.days.len(), young.phases.len()), (365, 365));
        assert_eq!((old.days.len(), old.phases.len()), (365, 365));
    }
}
