//! The working days of the firms and households (economy feature 19, src/clock.rs `Attendance`): a firm makes
//! nothing on a day of rest and more than on a mean day on a working day, a household buys on the working days of its
//! calendar, the figures stay numbers on a day on which nothing is made or bought, a firm plans on the demand per
//! worked day, and with the factor 1 on every day the economy computes what it computes without working days. And the
//! days of rest without a leak (feature 20): a firm buys on a working day the materials of its next working day, and
//! an owner buys on his working days on the profit of the year. The
//! calibration is the port's own data set for Austria (2010Q1), so these tests need nothing from the game.
#![allow(non_snake_case)]

use beforeit::AUSTRIA2010Q1;
use sc_economy::Economy;
use sc_economy::clock::{Attendance, OWNER_PLANS};

/// Austria with a plan every 30 periods and windows of 365 periods, as the cities of the game, wages in money.
fn austria(seed: u64) -> Economy {
    Economy::new(
        &AUSTRIA2010Q1.parameters.to_json(),
        &AUSTRIA2010Q1.initial_conditions.to_json(),
        seed,
        30,
        365,
    )
    .unwrap()
    .with_wages_in_money()
}

/// The firms and the households that own no firm.
fn sizes(e: &Economy) -> (usize, usize) {
    let m = &e.model;
    (m.firms.len(), m.w_act.len() + m.w_inact.len() + m.banks.len())
}

/// The same economy with one calendar for everybody: `factor` per kind of day, `day` the kind of every day.
fn one_calendar(e: Economy, factor: Vec<f64>, day: Vec<u8>) -> Economy {
    let (firms, households) = sizes(&e);
    let kinds = factor.len();
    e.with_working_days(day.len(), kinds, factor, day, vec![0; firms], vec![0; households])
        .unwrap()
}

/// A week of five working days, a half day and a day of rest, `weeks` times: the kinds 0, 1 and 2 with the factors of
/// flows that over the week are those of seven mean days.
const WEEK: [u8; 7] = [0, 0, 0, 0, 0, 1, 2];
fn weeks(weeks: usize) -> (Vec<f64>, Vec<u8>) {
    let a = 7.0 / 5.5;
    (vec![a, 0.5 * a, 0.0], (0..7 * weeks).map(|d| WEEK[d % 7]).collect())
}

fn bits(v: &[f64]) -> Vec<u64> {
    v.iter().map(|x| x.to_bits()).collect()
}

fn output(e: &Economy) -> f64 {
    e.model.firms.Y_i.iter().sum()
}

/// What the households that own no firm planned to buy in the last period.
fn budgets(e: &Economy) -> f64 {
    let m = &e.model;
    [&m.w_act.C_d_h, &m.w_inact.C_d_h, &m.banks.C_d_h]
        .iter()
        .flat_map(|v| v.iter())
        .sum()
}

#[test]
fn with_the_factor_1_on_every_day_the_economy_computes_as_without_working_days() {
    let (mut a, mut b) = (austria(5), austria(5));
    b = one_calendar(b, vec![1.0], vec![0; 40]);
    for day in 1..=45 {
        a.step(1);
        b.step(1);
        assert_eq!(bits(&a.figures()), bits(&b.figures()), "day {day}");
        assert_eq!(bits(&a.agents()), bits(&b.agents()), "day {day}");
    }
}

#[test]
fn on_a_day_of_rest_nobody_makes_or_buys_anything_and_the_figures_stay_numbers() {
    let (factor, day) = weeks(4);
    let mut e = one_calendar(austria(3), factor, day.clone());
    let (mut made, mut planned) = (output(&e), 0.0);
    for (d, &kind) in day.iter().enumerate() {
        let price_level = e.model.agg.P_bar;
        e.step(1);
        let (y, c) = (output(&e), budgets(&e));
        match kind {
            2 => {
                assert_eq!((y, c), (0.0, 0.0), "day {}", d + 1);
                // nothing made: the price index of the firms stays
                assert_eq!(e.model.agg.P_bar, price_level);
            }
            1 => assert!(
                y > 0.0 && y < 0.6 * made && c < 0.6 * planned,
                "day {}: {y} after {made}",
                d + 1
            ),
            _ => assert!(y > 0.0 && c > 0.0),
        }
        if kind == 0 {
            (made, planned) = (y, c);
        }
        assert!(
            e.figures().iter().all(|x| x.is_finite()),
            "day {}: {:?}",
            d + 1,
            e.figures()
        );
        let m = &e.model;
        for p in [
            m.agg.P_bar_h,
            m.agg.P_bar_CF_h,
            m.gov.P_j,
            m.rotw.P_l,
            m.agg.P_bar_HH,
            m.agg.P_bar_CF,
        ] {
            assert!(p.is_finite() && p > 0.0, "day {}: a price of {p}", d + 1);
        }
        assert!(m.agg.P_bar_g.iter().all(|p| p.is_finite() && *p > 0.0));
    }
    // and after the days every day is a working day again
    e.step(1);
    assert!(output(&e) > 0.0 && budgets(&e) > 0.0);
}

#[test]
fn over_the_weeks_firms_make_and_households_buy_about_what_they_do_on_every_day() {
    let (factor, day) = weeks(8);
    for seed in 1..=6 {
        // with the owners' rule of the game (economy feature 18), who plan on the profit of the year with working
        // days (feature 20): so every day a working day of the factor 1 against the weeks
        let (mut a, mut b) = (
            one_calendar(austria(seed).with_owner_household(), vec![1.0], vec![0; day.len()]),
            one_calendar(austria(seed).with_owner_household(), factor.clone(), day.clone()),
        );
        let (mut ya, mut yb, mut ca, mut cb) = (0.0, 0.0, 0.0, 0.0);
        for _ in 0..day.len() {
            a.step(1);
            b.step(1);
            (ya, yb) = (ya + output(&a), yb + output(&b));
            (ca, cb) = (ca + budgets(&a), cb + budgets(&b));
        }
        assert!(
            (yb / ya - 1.0).abs() < 0.04,
            "seed {seed}: {yb} over the weeks, {ya} on every day"
        );
        assert!(
            (cb / ca - 1.0).abs() < 0.04,
            "seed {seed}: {cb} over the weeks, {ca} on every day"
        );
        // the prices move about as on every day (measured 19 Nov 2026 over these seeds: output −1.7 to −3.3 %,
        // budgets −1.1 to +3.4 %, price level −7.4 to +6.1 %; with the owners on the profit of the day before and the
        // materials bought for the day, feature 19, the price level moved by −13.7 to +13.4 %)
        let (pa, pb) = (a.model.agg.P_bar, b.model.agg.P_bar);
        assert!(
            (pb / pa - 1.0).abs() < 0.08,
            "seed {seed}: a price level of {pb} over the weeks, {pa} on every day"
        );
    }
}

#[test]
fn a_firm_plans_on_the_demand_per_worked_day() {
    // a firm that plans on the second day saw the demand of the first, a day of rest; the third, a half day
    let (factor, day) = (vec![2.0, 1.0, 0.0], vec![2, 1, 0, 0]);
    let mut e = one_calendar(austria(3), factor, day);
    e.step(1);
    assert!(e.model.ext.worked.iter().all(|&w| w == 0.0)); // everybody planned on the first day, then rested
    let Q_s = e.model.firms.Q_s_i.clone();
    e.step(1);
    // nobody worked since the last plan: the firms that plan on this day keep their supply and wait
    let m = &e.model;
    let waits: Vec<usize> = (0..m.firms.len()).filter(|&i| m.ext.plans(i, 2)).collect();
    assert!(!waits.is_empty());
    for &i in &waits {
        assert_eq!(m.firms.Q_s_i[i], Q_s[i]);
        assert_eq!(m.ext.worked[i], 1.0); // the half day, and the demand of both days at the next plan
    }
    assert!(m.firms.Q_d_i.iter().sum::<f64>() > 0.0);
}

#[test]
fn a_firm_and_a_household_keep_the_days_of_their_own_calendar() {
    let e = austria(3);
    let (firms, households) = sizes(&e);
    // the calendar 0 rests on the first day, the calendar 1 on the second; every other firm and household keeps the
    // calendar 1
    let (calendar, household) = (
        (0..firms).map(|i| (i % 2) as u8).collect(),
        (0..households).map(|h| (h % 2) as u8).collect(),
    );
    let mut e = e
        .with_working_days(2, 2, vec![1.0, 0.0, 1.0, 0.0], vec![1, 0, 0, 1], calendar, household)
        .unwrap();
    for rests in 0..2 {
        e.step(1);
        let m = &e.model;
        assert!((0..firms).filter(|i| i % 2 == rests).all(|i| m.firms.Y_i[i] == 0.0));
        assert!((0..firms).filter(|i| i % 2 != rests).any(|i| m.firms.Y_i[i] > 0.0));
        let workers = m.w_act.len();
        assert!((0..workers).filter(|h| h % 2 == rests).all(|h| m.w_act.C_d_h[h] == 0.0));
        assert!((0..workers).filter(|h| h % 2 != rests).any(|h| m.w_act.C_d_h[h] > 0.0));
        assert!(e.figures().iter().all(|x| x.is_finite()));
    }
}

/// What the owners of the firms planned to buy in the last period.
fn owners(e: &Economy) -> f64 {
    e.model.firms.C_d_h.iter().sum()
}

#[test]
fn an_owner_buys_on_his_working_days_on_the_profit_of_the_year() {
    let (factor, day) = weeks(8);
    let (mut a, mut b) = (
        one_calendar(austria(4).with_owner_household(), vec![1.0], vec![0; day.len()]),
        one_calendar(austria(4).with_owner_household(), factor, day.clone()),
    );
    let (mut ca, mut cb) = (0.0, 0.0);
    let (mut after_rest, mut after_work) = (Vec::new(), Vec::new());
    for (d, &kind) in day.iter().enumerate() {
        a.step(1);
        b.step(1);
        (ca, cb) = (ca + owners(&a), cb + owners(&b));
        // the market of his faith is closed on his days of rest (economy feature 20)
        assert_eq!(owners(&b) == 0.0, kind == 2, "day {}", d + 1);
        match d.checked_sub(1).map(|y| day[y]) {
            Some(2) => after_rest.push(owners(&b)),
            Some(0) if kind == 0 => after_work.push(owners(&b)),
            _ => {}
        }
    }
    // on the profit of the year, a day of rest before a working day does not take what he buys on it (with the
    // profit of the day before he bought less than half after a day of rest, feature 19)
    let mean = |v: &[f64]| v.iter().sum::<f64>() / v.len() as f64;
    assert!(
        (mean(&after_rest) / mean(&after_work) - 1.0).abs() < 0.1,
        "{after_rest:?} after rest, {after_work:?} after work"
    );
    // and over the weeks the owners buy about what they buy on the profit of the year when every day is a working day
    assert!((cb / ca - 1.0).abs() < 0.05, "{cb} over the weeks, {ca} on every day");
    let p = &b.model.ext.owner_profit;
    assert_eq!(p.firms(), b.model.firms.len());
    assert!(p.ends.iter().all(|&n| n as usize > OWNER_PLANS));
}

#[test]
fn a_firm_buys_on_a_working_day_the_materials_of_its_next_working_day() {
    // a full day, a day of rest, a half day, and after the days a full day again; the same economy without working
    // days computes the same first day but for the materials
    let (factor, day) = (vec![1.0, 0.5, 0.0], vec![0, 2, 1]);
    let (mut a, mut b) = (austria(7), one_calendar(austria(7), factor, day));
    a.step(1);
    b.step(1);
    let (fa, fb) = (&a.model.firms, &b.model.firms);
    assert_eq!(bits(&fb.I_d_i), bits(&fa.I_d_i));
    assert!(fa.DM_d_i.iter().sum::<f64>() > 0.0);
    // on the first day the materials of the half day: the day of rest between is skipped
    for i in 0..fa.len() {
        assert_eq!(fb.DM_d_i[i], fa.DM_d_i[i] * 0.5, "firm {i}");
    }
    // on the day of rest nothing
    b.step(1);
    assert!(
        b.model
            .firms
            .DM_d_i
            .iter()
            .chain(&b.model.firms.I_d_i)
            .all(|&x| x == 0.0)
    );
    // on the half day the materials of the first day after the days, a full day
    b.step(1);
    let at = &b.model.ext.attendance;
    assert!(b.model.firms.DM_d_i.iter().sum::<f64>() > 0.0);
    assert_eq!(
        [at.next_working(0, 1), at.next_working(0, 2), at.next_working(0, 3)],
        [0.5, 0.5, 1.0]
    );
}

#[test]
fn the_working_days_are_part_of_the_state() {
    let mut a = austria(9).with_owner_household();
    let (factor, day) = weeks(3);
    a.step(2);
    a = one_calendar(a, factor, day);
    a.step(4);
    let mut b = Economy::load(&a.save()).unwrap();
    assert_eq!(a.save(), b.save());
    assert_eq!(a.model.ext.attendance, b.model.ext.attendance);
    assert_eq!(a.model.ext.worked, b.model.ext.worked);
    assert!(!a.model.ext.owner_profit.is_empty());
    assert_eq!(a.model.ext.owner_profit, b.model.ext.owner_profit);
    a.step(10);
    b.step(10);
    assert_eq!(a.save(), b.save());
}

#[test]
fn a_state_of_format_10_gathers_the_profits_of_the_owners_anew() {
    // format 10 is format 13 without the workers who are away, the materials they left unused and the contracts at its
    // end (for none, three numbers of 0) and without the owners' profits before them: per firm twelve plan periods of profits and of their periods, the profit and the
    // periods since the last plan and the plan periods that ended, each list after its length
    let mut e = one_calendar(austria(9).with_owner_household(), weeks(3).0, weeks(3).1);
    e.step(4);
    let mut bytes = e.save();
    let firms = e.model.firms.len();
    assert_eq!(bytes.split_off(bytes.len() - 12), [0u8; 12]);
    bytes.truncate(bytes.len() - 20 - (2 * OWNER_PLANS * 8 + 2 * 8 + 4) * firms);
    bytes[4..8].copy_from_slice(&10u32.to_le_bytes());
    let mut back = Economy::load(&bytes).unwrap();
    assert!(back.model.ext.owner_profit.is_empty());
    let before = back.model.firms.Pi_i.clone();
    back.step(1);
    // the year before is taken to be the profit of the period before
    let p = &back.model.ext.owner_profit;
    assert_eq!(p.firms(), firms);
    assert_eq!(
        p.ended[..firms],
        before.iter().map(|x| x * 30.0).collect::<Vec<_>>()[..]
    );
    assert!(p.open_periods.iter().all(|&n| n == 1.0));
    assert!(back.figures().iter().all(|x| x.is_finite()));
}

#[test]
fn working_days_that_do_not_fit_are_refused() {
    let (firms, households) = sizes(&austria(1));
    // a kind of day without a factor, a firm or a household without a calendar, a factor that is not a number or below
    // 0, days that do not fill the calendars, no kinds of days, and working days for other numbers of firms or
    // households
    let new = |kinds, factor: Vec<f64>, day: Vec<u8>, calendar: Vec<u8>, household: Vec<u8>| {
        Attendance::new(1, 2, kinds, factor, day, calendar, household)
    };
    assert!(new(2, vec![1.0, 0.0], vec![0, 2], vec![0], vec![0]).is_err());
    assert!(new(2, vec![1.0, 0.0], vec![0, 1], vec![1], vec![0]).is_err());
    assert!(new(2, vec![1.0, 0.0], vec![0, 1], vec![0], vec![1]).is_err());
    assert!(new(2, vec![1.0, f64::NAN], vec![0, 1], vec![0], vec![0]).is_err());
    assert!(new(2, vec![1.0, -1.0], vec![0, 1], vec![0], vec![0]).is_err());
    assert!(new(2, vec![1.0, 0.0], vec![0, 1, 1], vec![0], vec![0]).is_err());
    assert!(new(0, vec![], vec![0, 1], vec![0], vec![0]).is_err());
    let with = |f: usize, h: usize| austria(1).with_working_days(1, 1, vec![1.0], vec![0], vec![0; f], vec![0; h]);
    assert!(with(firms - 1, households).is_err());
    assert!(with(firms, households + 1).is_err());
    assert!(with(firms, households).is_ok());
    let a = Attendance::new(4, 2, 2, vec![1.5, 0.0], vec![0, 1], vec![0], vec![0]).unwrap();
    assert_eq!(
        [a.factor(0, 3), a.factor(0, 4), a.factor(0, 5), a.factor(0, 6)],
        [1.0, 1.5, 0.0, 1.0]
    );
    assert_eq!([a.household_factor(0, 4), a.household_factor(0, 5)], [1.5, 0.0]);
}
