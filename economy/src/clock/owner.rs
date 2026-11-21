//! The profits the owners of the firms plan their spending on (economy feature 20).

/// The plan periods over which the owner of a firm takes the mean of its profits (economy feature 20): twelve plans
/// of 30 days, the year of the window of the expectations.
pub const OWNER_PLANS: usize = 12;

/// With working days and [`DailyClock::owner`] (economy feature 20): per firm the profits its owner plans his spending
/// on, by the plan periods of the firm. Of the last [`OWNER_PLANS`] plan periods that ended, the profit summed and the
/// periods (`ended` and `ended_periods`, one row of firms per plan period, the row of the `n`-th period that ended at
/// `n % OWNER_PLANS`); of the periods since the last plan the same (`open`, `open_periods`); and per firm the plan
/// periods that ended (`ends`). All empty before the first period with working days; in that period the year before
/// is taken to be [`OWNER_PLANS`] plan periods of the profit of the period before, as the clock takes the window
/// before the start to be the starting position.
///
/// [`DailyClock::owner`]: super::DailyClock::owner
#[derive(Clone, Debug, Default, PartialEq)]
pub struct OwnerProfit {
    pub ended: Vec<f64>,
    pub ended_periods: Vec<f64>,
    pub open: Vec<f64>,
    pub open_periods: Vec<f64>,
    pub ends: Vec<u32>,
}

impl OwnerProfit {
    /// For firms whose profit of the period before is `before`: [`OWNER_PLANS`] plan periods of `plan` periods of
    /// that profit have ended, and none since.
    pub fn start(before: &[f64], plan: usize) -> OwnerProfit {
        let firms = before.len();
        OwnerProfit {
            ended: before
                .iter()
                .map(|p| p * plan as f64)
                .collect::<Vec<_>>()
                .repeat(OWNER_PLANS),
            ended_periods: vec![plan as f64; OWNER_PLANS * firms],
            open: vec![0.0; firms],
            open_periods: vec![0.0; firms],
            ends: vec![OWNER_PLANS as u32; firms],
        }
    }
    pub fn is_empty(&self) -> bool {
        self.open.is_empty()
    }
    pub fn firms(&self) -> usize {
        self.open.len()
    }
    /// The profit `pi` of firm `i` in the period that is computed.
    pub(super) fn add(&mut self, i: usize, pi: f64) {
        self.open[i] += pi;
        self.open_periods[i] += 1.0;
    }
    /// Firm `i` plans: the periods since its last plan end.
    pub(super) fn end(&mut self, i: usize) {
        let I = self.firms();
        let row = self.ends[i] as usize % OWNER_PLANS;
        self.ended[row * I + i] = self.open[i];
        self.ended_periods[row * I + i] = self.open_periods[i];
        self.ends[i] += 1;
        self.open[i] = 0.0;
        self.open_periods[i] = 0.0;
    }
    /// The mean profit per period of firm `i` over the last [`OWNER_PLANS`] plan periods that ended and the periods
    /// since; `None` before a period has been added.
    pub(super) fn mean(&self, i: usize) -> Option<f64> {
        let I = self.firms();
        let rows = (self.ends[i] as usize).min(OWNER_PLANS);
        let (mut sum, mut periods) = (self.open[i], self.open_periods[i]);
        for row in 0..rows {
            sum += self.ended[row * I + i];
            periods += self.ended_periods[row * I + i];
        }
        (periods > 0.0).then(|| sum / periods)
    }
}
