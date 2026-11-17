//! No unemployment benefit in the cities of the game (economy feature 9, docs/ECONOMY_DESIGN.md). The model's rule is
//! the port's own (Poledna et al. 2023, appendix A.44, A.53: a person without work is paid `theta_UB` times the last
//! wage by the government); what the feature sets is the calibration: the rate is switched off, as it was before
//! feature 6. That the cities hold without it rests on the wage in money (feature 7) and the demand pull (feature 8).
//! These tests compute cities of the game from the file the world server reads (public/data/economy_cities.json,
//! written by `npm run economy:calibrate`).
#![allow(non_snake_case)]

use sc_economy::Economy;
use sc_economy::trade::Cities;

const CITIES: &str = include_str!("../../public/data/economy_cities.json");

/// A city of the game with the rules of the game (wages in money, the demand pull) and the seed given.
fn city(name: &str, seed: u64) -> Economy {
    let file: serde_json::Value = serde_json::from_str(CITIES).unwrap();
    assert_eq!((&file["wage"], &file["prices"]), (&"money".into(), &"demand".into()));
    let city = file["cities"].as_array().unwrap().iter().find(|c| c["name"] == name).unwrap_or_else(|| panic!("{name} is a city of the game"));
    let clock = &file["clock"];
    let (plan, window) = (clock["plan"].as_u64().unwrap() as usize, clock["window"].as_u64().unwrap() as usize);
    Economy::new(&city["parameters"].to_string(), &city["initial_conditions"].to_string(), seed, plan, window).unwrap().with_wages_in_money().with_demand_pull().unwrap()
}

fn assert_books(e: &Economy, at: &str) {
    let [income, nominal, real, central_bank, banks, gdp] = e.checks();
    for v in [income, nominal, real, central_bank, banks] {
        assert!((v / gdp).abs() < 1e-9, "{at}: the books are off by {v} against {gdp}");
    }
}

#[test]
fn no_city_of_the_game_pays_a_person_without_work() {
    let file: serde_json::Value = serde_json::from_str(CITIES).unwrap();
    let cities = file["cities"].as_array().unwrap();
    assert_eq!(cities.len(), 29);
    for c in cities {
        // the rate is a billionth, not 0: the port divides the wage of the start by it (src/agents.rs, line 222)
        assert_eq!(c["parameters"]["theta_UB"], 1e-9, "{}", c["name"]);
        for k in ["w_UB", "sb_other", "sb_inact"] {
            assert_eq!(c["initial_conditions"][k].as_f64(), Some(0.0), "{}: {k}", c["name"]);
        }
    }
    let e = city("London", 1356);
    assert_eq!(e.model.prop.theta_UB, 1e-9);
    assert_eq!(e.model.gov.sb_other, 0.0);
    // the one person without work of the start has no last wage
    let w = &e.model.w_act;
    let out: Vec<usize> = (0..w.w_h.len()).filter(|&h| w.O_h[h].is_none()).collect();
    assert_eq!(out.len(), 1);
    assert_eq!(w.w_h[out[0]], 0.0);
}

#[test]
fn a_person_without_work_has_no_income_and_buys_nothing() {
    // seeds with which somebody is without work on more than 100 of the 730 days, so the rule is seen at work
    // (measured with London as the reference world has it since feature 10: five of the eight seeds 1356 to 1363)
    for seed in [1356, 1359, 1360] {
        let mut e = city("London", seed);
        let p = e.model.prop.clone();
        let (mut days_with, mut most) = (0, 0);
        for day in 1..=730 {
            e.step(1);
            let (w, P) = (&e.model.w_act, e.model.agg.P_bar_HH);
            let mut out = 0;
            for h in 0..w.w_h.len() {
                if w.O_h[h].is_some() {
                    // A.53, as the port computes it: the wage after tax
                    let income = w.w_h[h] * (1.0 - p.tau_INC) * P;
                    assert!((w.Y_h[h] - income).abs() <= 1e-12 * income, "seed {seed}, day {day}, person {h}: {} against {income}", w.Y_h[h]);
                    assert!(w.C_d_h[h] > 0.0 && w.C_d_h[h].is_finite());
                } else {
                    // a billionth of the last wage, and nothing for the person who never had one
                    out += 1;
                    assert!(w.Y_h[h] <= 1.0001e-9 * w.w_h[h] * P, "seed {seed}, day {day}, person {h}: an income of {}", w.Y_h[h]);
                    assert!(w.C_d_h[h] <= 1.0001e-9 * w.w_h[h] * P * 1.01, "seed {seed}, day {day}, person {h}: a budget of {}", w.C_d_h[h]);
                }
            }
            if out > 0 {
                days_with += 1;
                most = most.max(out);
            }
            assert_books(&e, &format!("seed {seed}, day {day}"));
        }
        assert!(days_with > 100 && most >= 1, "seed {seed}: persons without work on {days_with} days, at most {most}");
    }
}

#[test]
fn the_crown_owes_nothing_for_persons_without_work() {
    // A.60, A.61 as the port computes them: what the crown pays to persons without work is the rate times their
    // last wages. With the rate switched off this is less than a millionth of a penny a day, whoever is without work.
    let mut e = city("London", 7);
    for day in 1..=400 {
        e.step(1);
        let (w, P) = (&e.model.w_act, e.model.agg.P_bar_HH);
        let paid: f64 = (0..w.w_h.len()).filter(|&h| w.O_h[h].is_none()).map(|h| e.model.prop.theta_UB * w.w_h[h] * P).sum();
        let wages: f64 = (0..w.w_h.len()).filter(|&h| w.O_h[h].is_some()).map(|h| w.w_h[h] * P).sum();
        assert!(paid <= 1e-8 * wages, "day {day}: the crown paid {paid} against wages of {wages}");
    }
}

#[test]
fn cities_that_trade_keep_their_people_in_work_without_the_benefit() {
    // Four cities of the game with the merchants between them, ten years. Before features 7 and 8 linked cities
    // without the benefit sank and stayed down (feature 5: single cities at half their start after decades). Now a
    // city can still have a slump (with the second seed Cairo has 3 % without work for six years and an output of
    // 98 % of its start), but it comes back: in the tenth year nobody is without work and every city stands above
    // its start. The bounds are measured ones, not a paper's.
    for seed in [1356, 1357] {
        let names = ["Cairo", "Paris", "Venice", "London"];
        let mut all = Cities::new(names.iter().enumerate().map(|(k, n)| city(n, seed + 100 * k as u64)).collect()).unwrap();
        for year in 1..=10 {
            all.step(365);
            for (k, [off, scale]) in all.checks().into_iter().enumerate() {
                assert!(off.abs() <= 1e-9 * scale, "seed {seed}, year {year}: check {k} of the merchants is off by {off} against {scale}");
            }
            for (name, e) in names.iter().zip(&all.cities) {
                assert_books(e, &format!("seed {seed}, year {year}, {name}"));
                let f = e.figures();
                let (output, without, P) = (f[1] / f[2], f[12] / (f[10] + f[12]), f[15]);
                let at = format!("seed {seed}, year {year}, {name}: output {output:.4}, without work {without:.4}, prices {P:.4}");
                assert!(output > 0.95 && without < 0.05 && (P - 1.0).abs() < 0.1, "{at}");
                if year == 10 {
                    assert!(output > 1.05 && without < 0.01, "{at}");
                }
            }
        }
    }
}
