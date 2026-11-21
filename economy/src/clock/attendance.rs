//! The working days of the firms and households of an economy (economy feature 19).

/// The working days of the firms and households of an economy (economy feature 19): for a run of days, per calendar the
/// kind of every day, per calendar and kind the factor of the flows of a firm or a household on such a day, per firm
/// its calendar and per household that owns no firm its calendar. Empty: every period is a working day of the factor
/// 1, as in the port.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Attendance {
    /// the period (counted from 1) of the first day
    pub from: usize,
    /// the days
    pub days: usize,
    /// the kinds of a day
    pub kinds: usize,
    /// per calendar and kind of day: the factor of the flows of a firm on such a day (`kinds` numbers a calendar)
    pub factor: Vec<f64>,
    /// per calendar and day: the kind of the day (`days` numbers a calendar)
    pub day: Vec<u8>,
    /// per firm: its calendar (and so of its owner's household)
    pub calendar: Vec<u8>,
    /// per household that does not own a firm: its calendar, in the port's order of the workers, the persons who do
    /// not work and the owners of the banks
    pub household: Vec<u8>,
}

impl Attendance {
    /// Working days for `days` days from period `from`: `factor` per calendar and kind, `day` the kind of every day
    /// per calendar, `calendar` per firm, `household` per household that owns no firm.
    pub fn new(
        from: usize,
        days: usize,
        kinds: usize,
        factor: Vec<f64>,
        day: Vec<u8>,
        calendar: Vec<u8>,
        household: Vec<u8>,
    ) -> Result<Attendance, String> {
        let calendars = if kinds == 0 { 0 } else { factor.len() / kinds };
        if kinds == 0 || calendars == 0 || factor.len() != calendars * kinds || day.len() != calendars * days {
            return Err(format!(
                "working days with {} factors for {kinds} kinds of days and {} kinds of days for {days} days",
                factor.len(),
                day.len()
            ));
        }
        if let Some(k) = day.iter().find(|&&k| k as usize >= kinds) {
            return Err(format!("a day of the kind {k} of {kinds}"));
        }
        if let Some(c) = calendar.iter().find(|&&c| c as usize >= calendars) {
            return Err(format!("a firm of the calendar {c} of {calendars}"));
        }
        if let Some(c) = household.iter().find(|&&c| c as usize >= calendars) {
            return Err(format!("a household of the calendar {c} of {calendars}"));
        }
        if let Some(f) = factor.iter().find(|f| !(f.is_finite() && **f >= 0.0)) {
            return Err(format!("a factor of the flows of {f}"));
        }
        Ok(Attendance {
            from,
            days,
            kinds,
            factor,
            day,
            calendar,
            household,
        })
    }

    /// Whether there are no working days: every period is a working day as in the port.
    pub fn is_empty(&self) -> bool {
        self.calendar.is_empty()
    }

    /// The factor of the flows of firm `i` in period `t`: 1 outside the days.
    pub fn factor(&self, i: usize, t: usize) -> f64 {
        if self.calendar.is_empty() {
            return 1.0;
        }
        self.of_calendar(self.calendar[i], t)
    }

    /// The factor of the purchases of household `h` that owns no firm (in the order of [`Attendance::household`]) in
    /// period `t`: 1 outside the days.
    pub fn household_factor(&self, h: usize, t: usize) -> f64 {
        if self.calendar.is_empty() {
            return 1.0;
        }
        self.of_calendar(self.household[h], t)
    }

    /// The factor of the flows of firm `i` on its next working day after period `t` (economy feature 20): of the
    /// periods `t + 1` to `t + 31` the first whose factor is above 0, and 1 if there is none (outside the days every
    /// period is a working day of the factor 1).
    pub fn next_working(&self, i: usize, t: usize) -> f64 {
        if self.calendar.is_empty() {
            return 1.0;
        }
        let c = self.calendar[i];
        (t + 1..=t + 31)
            .map(|s| self.of_calendar(c, s))
            .find(|&a| a > 0.0)
            .unwrap_or(1.0)
    }

    fn of_calendar(&self, c: u8, t: usize) -> f64 {
        if t < self.from || t - self.from >= self.days {
            return 1.0;
        }
        let c = c as usize;
        self.factor[c * self.kinds + self.day[c * self.days + t - self.from] as usize]
    }
}
