//! The unemployment benefit in the cities of the game (economy feature 6, docs/ECONOMY_DESIGN.md). The rule is the
//! port's own (Poledna et al. 2023, appendix A.44, A.53: a person without work is paid `theta_UB` times the last
//! wage); what the feature sets is the calibration. So these tests compute a city of the game, London, from the
//! file the world server reads (public/data/economy_cities.json, written by `npm run economy:calibrate`).
#![allow(non_snake_case)]

use sc_economy::Economy;

const CITIES: &str = include_str!("../../public/data/economy_cities.json");

/// London of the game with the seed given; `benefit: false` switches the benefit off, as the calibration did before
/// feature 6 (the rate 1e-9, because the port divides by it, and no benefit at the start).
fn london(seed: u64, benefit: bool) -> Economy {
    let file: serde_json::Value = serde_json::from_str(CITIES).unwrap();
    let city = file["cities"].as_array().unwrap().iter().find(|c| c["name"] == "London").expect("London is a city of the game");
    let (mut p, mut ic) = (city["parameters"].clone(), city["initial_conditions"].clone());
    if !benefit {
        p["theta_UB"] = 1e-9.into();
        ic["w_UB"] = 0.0.into();
    }
    let clock = &file["clock"];
    let (plan, window) = (clock["plan"].as_u64().unwrap() as usize, clock["window"].as_u64().unwrap() as usize);
    Economy::new(&p.to_string(), &ic.to_string(), seed, plan, window).unwrap()
}

/// What the persons without an employer have on this day: how many they are, the smallest of their incomes as a
/// part of the last wage at today's prices, and the smallest of their consumption budgets.
fn without_work(e: &Economy) -> (usize, f64, f64) {
    let (w, P) = (&e.model.w_act, e.model.agg.P_bar_HH);
    let out: Vec<usize> = (0..w.w_h.len()).filter(|&h| w.O_h[h].is_none()).collect();
    let least = |v: &dyn Fn(usize) -> f64| out.iter().map(|&h| v(h)).fold(f64::INFINITY, f64::min);
    (out.len(), least(&|h| w.Y_h[h] / (w.w_h[h] * P)), least(&|h| w.C_d_h[h]))
}

#[test]
fn the_calibration_of_a_city_sets_the_rate_of_the_original_code() {
    let e = london(1356, true);
    let p = &e.model.prop;
    assert_eq!(p.tau_SIW, 0.0);
    assert!((p.theta_UB - 0.55 * (1.0 - p.tau_INC) * (1.0 - p.tau_SIW)).abs() < 1e-15, "theta_UB = {}", p.theta_UB);
    assert_eq!(e.model.gov.sb_other, 0.0); // nothing else is paid to a person
    // every person starts with a last wage: the mean wage of an employee of the city
    let w = &e.model.w_act;
    let employed: Vec<usize> = (0..w.w_h.len()).filter(|&h| w.O_h[h].is_some()).collect();
    assert!(w.w_h.iter().all(|&x| x > 0.0));
    let one = (0..w.w_h.len()).find(|&h| w.O_h[h].is_none()).expect("the calibration has one person without work");
    let mean = employed.iter().map(|&h| w.w_h[h]).sum::<f64>() / employed.len() as f64;
    assert!((w.w_h[one] / mean - 1.0).abs() < 1e-9, "{} against {mean}", w.w_h[one]);
}

#[test]
fn a_person_without_work_is_paid_a_part_of_the_last_wage_and_buys_from_it() {
    let mut e = london(1356, true);
    let p = e.model.prop.clone();
    let (mut days_with, mut most) = (0, 0);
    for day in 1..=400 {
        e.step(1);
        let (w, P) = (&e.model.w_act, e.model.agg.P_bar_HH);
        for h in 0..w.w_h.len() {
            // A.53, as the port computes it: the wage after tax with an employer, the benefit without
            let income = if w.O_h[h].is_some() { w.w_h[h] * (1.0 - p.tau_INC) * P } else { p.theta_UB * w.w_h[h] * P };
            assert!((w.Y_h[h] - income).abs() <= 1e-12 * income, "day {day}, person {h}: {} against {income}", w.Y_h[h]);
            assert!(w.C_d_h[h] > 0.0 && w.C_d_h[h].is_finite(), "day {day}, person {h} plans to buy {}", w.C_d_h[h]);
        }
        let (n, part, budget) = without_work(&e);
        if n > 0 {
            days_with += 1;
            most = most.max(n);
            // 55 % of what the same wage pays after tax
            assert!((part / (1.0 - p.tau_INC) - 0.55).abs() < 1e-12, "day {day}: {part}");
            assert!(budget > 0.0);
        }
        let [income, nominal, real, central_bank, banks, gdp] = e.checks();
        for v in [income, nominal, real, central_bank, banks] {
            assert!((v / gdp).abs() < 1e-9, "day {day}: the books are off by {v} against {gdp}");
        }
    }
    assert!(days_with > 200 && most >= 2, "persons without work on {days_with} days, at most {most}");
}

#[test]
fn without_the_benefit_a_person_without_work_has_no_income_and_buys_nothing() {
    // the calibration before feature 6, as the control: this is what let a slump of a city feed itself
    let mut e = london(1356, false);
    let mut days_with = 0;
    for _ in 1..=400 {
        e.step(1);
        let (w, P) = (&e.model.w_act, e.model.agg.P_bar_HH);
        let out: Vec<usize> = (0..w.w_h.len()).filter(|&h| w.O_h[h].is_none()).collect();
        if !out.is_empty() {
            days_with += 1;
        }
        for h in out {
            // a billionth of the last wage, and nothing for the person who never had one
            assert!(w.Y_h[h] <= 1.0001e-9 * w.w_h[h] * P, "person {h}: an income of {}", w.Y_h[h]);
            assert!(w.C_d_h[h] <= 1.0001e-9 * w.w_h[h] * P * 1.01, "person {h}: a budget of {}", w.C_d_h[h]);
        }
    }
    assert!(days_with > 200, "persons without work on {days_with} days");
}

#[test]
fn the_crown_pays_the_benefit_and_owes_what_it_lacks() {
    // A.60, A.61 as the port computes them. The same city with and without the benefit, one day: the crown's debt
    // differs by the benefit of the one person without work (at the prices of the day; what the person buys moves
    // the profits of the firms and with them the tax a little, hence 1 %).
    let (mut with, mut without) = (london(7, true), london(7, false));
    let benefit = with.model.prop.theta_UB * with.model.w_act.w_h[(0..with.model.w_act.w_h.len()).find(|&h| with.model.w_act.O_h[h].is_none()).unwrap()];
    assert_eq!(with.model.gov.L_G, 0.0);
    with.step(1);
    without.step(1);
    let (n_with, _, _) = without_work(&with);
    let (n_without, _, _) = without_work(&without);
    assert_eq!(n_with, n_without);
    let paid = with.model.gov.L_G - without.model.gov.L_G;
    assert_eq!(n_with, 1);
    assert!((paid / benefit - 1.0).abs() < 0.01, "the crown paid {paid} for one person with a benefit of {benefit}");
}
