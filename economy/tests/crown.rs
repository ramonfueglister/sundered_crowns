//! Economy feature 16 (docs/ECONOMY_DESIGN.md): the crown of a city buys with what it took in (src/clock.rs).
use sc_economy::Economy;
use sc_economy::state::FORMAT;

const CITIES: &str = include_str!("../../public/data/economy_cities.json");

/// The first city of the game with the rules of the game before feature 16 and the seed given.
fn city(seed: u64) -> Economy {
    let file: serde_json::Value = serde_json::from_str(CITIES).unwrap();
    let city = &file["cities"].as_array().unwrap()[0];
    let clock = &file["clock"];
    let (plan, window) = (
        clock["plan"].as_u64().unwrap() as usize,
        clock["window"].as_u64().unwrap() as usize,
    );
    Economy::new(
        &city["parameters"].to_string(),
        &city["initial_conditions"].to_string(),
        seed,
        plan,
        window,
    )
    .unwrap()
    .with_wages_in_money()
    .with_demand_pull()
    .unwrap()
    .with_savings_spent(0.4 / 365.0)
    .unwrap()
}

/// The budget the crown set for the period that was computed last.
fn budget(e: &Economy) -> f64 {
    e.model.gov.C_d_j.iter().sum()
}

#[test]
fn the_first_day_is_the_series_of_the_paper_and_the_random_numbers_stay_where_they_were() {
    let (mut series, mut revenue) = (city(7), city(7).with_crown_spending_revenue());
    series.step(1);
    revenue.step(1);
    // nothing has been taken in before the first day: the crown buys by the series, and the day is the same
    assert_eq!(revenue.model.gov, series.model.gov);
    assert_eq!(revenue.figures(), series.figures());
    series.step(1);
    revenue.step(1);
    assert_ne!(budget(&revenue), budget(&series));
}

#[test]
fn the_budget_of_a_day_is_the_revenue_of_the_day_before_less_the_other_outlays() {
    let mut e = city(7).with_crown_spending_revenue();
    e.step(5);
    for _ in 0..40 {
        let (taken, other) = (e.model.gov.Y_G, e.model.ext.crown_outlays);
        assert!(taken > 0.0);
        // the benefit of the game is next to nothing and the crown pays no interest
        assert!(
            other >= 0.0 && other < 1e-6 * taken,
            "other outlays of {other} against a revenue of {taken}"
        );
        e.step(1);
        assert!(
            (budget(&e) / (taken - other) - 1.0).abs() < 1e-12,
            "a budget of {} after a revenue of {taken}",
            budget(&e)
        );
        // the real purchases the crown plans are that budget at the prices it expects
        let m = &e.model;
        let price: f64 = m.prop.c_G_g.iter().zip(&m.agg.P_bar_g).map(|(c, p)| c * p).sum();
        assert!(m.gov.C_G > 0.0 && (m.gov.C_G * price / budget(&e) - 1.0).abs() < 0.05);
    }
}

#[test]
fn a_crown_that_buys_with_its_revenue_neither_hoards_nor_owes_after_years() {
    // seeds whose series runs low and high: the crown of the paper hoards or owes, the other does neither
    let mut widest: f64 = 0.0;
    for seed in [1, 2, 3, 4] {
        let (mut series, mut revenue) = (city(seed), city(seed).with_crown_spending_revenue());
        series.step(365 * 10);
        revenue.step(365 * 10);
        let (a, b) = (
            series.model.gov.L_G / series.figures()[3],
            revenue.model.gov.L_G / revenue.figures()[3],
        );
        assert!(
            b.abs() < 0.02,
            "seed {seed}: the crown's debt is {b} of a year's output"
        );
        widest = widest.max(a.abs());
    }
    assert!(
        widest > 0.05,
        "the series of the paper leaves at most {widest} of a year's output"
    );
}

#[test]
fn the_rule_and_the_outlays_are_saved_and_a_city_without_the_rule_keeps_the_series() {
    let mut e = city(5).with_crown_spending_revenue();
    e.step(3);
    let bytes = e.save();
    assert_eq!(bytes[4..8], FORMAT.to_le_bytes());
    let mut back = Economy::load(&bytes).unwrap();
    assert_eq!(back.model, e.model);
    assert!(back.model.ext.crown_revenue);
    e.step(4);
    back.step(4);
    assert_eq!(back.save(), e.save());
    // a city without the rule computes as before feature 16
    let (mut a, mut b) = (city(5), city(5));
    a.step(3);
    b.step(3);
    let mut again = Economy::load(&a.save()).unwrap();
    assert!(!again.model.ext.crown_revenue);
    again.step(4);
    b.step(4);
    assert_eq!(again.save(), b.save());
}
