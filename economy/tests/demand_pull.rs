//! The demand pull of CANVAS (economy feature 8, docs/ECONOMY_DESIGN.md; the rule is in src/clock.rs): Hommes, He,
//! Poledna, Siqueira, Zhang (2022), Bank of Canada Staff Working Paper 2022-51, section 3.2.4, equations 34 to 37, as
//! BeforeIT.jl has it in src/model_extensions/init_CANVAS.jl and the port in src/model_extensions/canvas.rs. These
//! tests set the clock against the port's CANVAS model on the port's own data set for Italy (2010Q1), and compute a
//! city of the game, London, from the file the world server reads (public/data/economy_cities.json).
#![allow(non_snake_case)]

use beforeit::{AbstractModel, Canvas, Deterministic, Extension, ITALY2010Q1, ModelCANVAS, Xoshiro};
use sc_economy::Economy;
use sc_economy::clock::DailyClock;
use sc_economy::trade::Cities;

const CITIES: &str = include_str!("../../public/data/economy_cities.json");

/// A city of the game on the clock of the game, with or without wages in money and the demand pull. The cities of
/// the game pay no unemployment benefit (feature 9).
fn city(name: &str, seed: u64, money: bool, pull: bool) -> Economy {
    let file: serde_json::Value = serde_json::from_str(CITIES).unwrap();
    let city = file["cities"].as_array().unwrap().iter().find(|c| c["name"] == name).unwrap_or_else(|| panic!("{name} is a city of the game"));
    let (p, ic) = (&city["parameters"], &city["initial_conditions"]);
    let clock = &file["clock"];
    let (plan, window) = (clock["plan"].as_u64().unwrap() as usize, clock["window"].as_u64().unwrap() as usize);
    let e = Economy::new(&p.to_string(), &ic.to_string(), seed, plan, window).unwrap();
    let e = if money { e.with_wages_in_money() } else { e };
    if pull { e.with_demand_pull().unwrap() } else { e }
}

/// London as the game computes it: wages in money, the demand pull, no unemployment benefit.
fn london(seed: u64) -> Economy {
    city("London", seed, true, true)
}

fn assert_books(e: &Economy, at: &str) {
    let [income, nominal, real, central_bank, banks, gdp] = e.checks();
    for v in [income, nominal, real, central_bank, banks] {
        assert!((v / gdp).abs() < 1e-9, "{at}: the books are off by {v} against {gdp}");
    }
}

fn bits(v: &[f64]) -> Vec<u64> {
    v.iter().map(|x| x.to_bits()).collect()
}

#[test]
fn the_calibration_of_the_cities_says_that_firms_plan_by_the_demand_pull() {
    let file: serde_json::Value = serde_json::from_str(CITIES).unwrap();
    assert_eq!(file["prices"], "demand");
    assert_eq!(file["wage"], "money"); // the anchor the demand pull needs
}

#[test]
fn with_a_plan_every_period_the_clock_decides_what_the_ports_canvas_decides() {
    let s = &ITALY2010Q1;
    let mut cases = [0usize; 4];
    for seed in [3, 1356] {
        let mut rng = Xoshiro::seed_from_u64(seed);
        let mut canvas = ModelCANVAS::new(&s.parameters, &s.initial_conditions, &mut rng).unwrap();
        assert_eq!(canvas.prop.theta_calvo, 1.0);
        for periods in [0usize, 1, 5] {
            canvas.run(periods, &mut rng);
            let c = canvas.clone();
            let I = c.firms.len();
            // the same firms under the clock: a plan in every period, expectations on single periods
            let mut ext = DailyClock::new(1, 1, I).unwrap();
            ext.demand_pull = true;
            let mut clock = AbstractModel {
                w_act: c.w_act.clone(), w_inact: c.w_inact.clone(), firms: c.firms.clone(), banks: c.banks.clone(), cb: c.cb.clone(),
                gov: c.gov.clone(), rotw: c.rotw.clone(), agg: c.agg.clone(), prop: c.prop.clone(), data: c.data.clone(), ext,
            };
            let mut c = c;
            // the port draws a random number per firm for `theta_calvo`; with 1 every firm adjusts whatever is drawn
            let a = Canvas::firms_expectations_and_decisions(&mut c, &mut Deterministic);
            let b = DailyClock::firms_expectations_and_decisions(&mut clock, &mut Deterministic);
            assert_eq!(bits(&a.Q_s_i), bits(&b.Q_s_i), "supply after {periods} periods");
            assert_eq!(bits(&a.new_P_i), bits(&b.new_P_i), "price after {periods} periods");
            assert_eq!(bits(&a.I_d_i), bits(&b.I_d_i));
            assert_eq!(bits(&a.DM_d_i), bits(&b.DM_d_i));
            assert_eq!(a.N_d_i, b.N_d_i);
            assert_eq!(bits(&a.Pi_e_i), bits(&b.Pi_e_i));
            assert_eq!(bits(&a.DL_d_i), bits(&b.DL_d_i));
            assert_eq!(bits(&a.K_e_i), bits(&b.K_e_i));
            assert_eq!(bits(&a.L_e_i), bits(&b.L_e_i));
            // and without the demand pull the clock decides something else: the rule of the paper
            clock.ext = DailyClock::new(1, 1, I).unwrap();
            let paper = DailyClock::firms_expectations_and_decisions(&mut clock, &mut Deterministic);
            if periods > 0 {
                assert_ne!(bits(&paper.new_P_i), bits(&a.new_P_i));
            }
            let f = &canvas.firms;
            for i in 0..I {
                cases[(f.Q_s_i[i] <= f.Q_d_i[i]) as usize * 2 + (f.P_i[i] >= canvas.agg.P_bar_g[f.G_i[i]]) as usize] += 1;
            }
        }
    }
    // all four cases of the rule occur, so the comparison says something
    assert!(cases.iter().all(|&n| n > 100), "the four cases: {cases:?}");
}

#[test]
fn a_planning_firm_changes_its_supply_or_its_price_by_the_gap_and_never_both() {
    let mut e = london(1356);
    let (plan, I) = (e.model.ext.plan, e.model.firms.len());
    let (mut supply_moves, mut price_moves, mut kept) = (0, 0, 0);
    let push = |e: &Economy| <DailyClock as Extension>::cost_push_inflation(&e.model, &e.model.firms);
    for _ in 0..150 {
        // what a firm knows before the day: the supply per day of its last plan, the mean demand per day since
        // (yesterday's demand is added when it decides), its price and the price index of its sector
        let (m, t) = (&e.model, e.model.agg.t);
        let Q_s = m.firms.Q_s_i.clone();
        let Q_d: Vec<f64> = (0..I).map(|i| (m.ext.demand[i] + m.firms.Q_d_i[i]) / (m.ext.periods[i] + 1) as f64).collect();
        let P = m.firms.P_i.clone();
        let P_g: Vec<f64> = (0..I).map(|i| m.agg.P_bar_g[m.firms.G_i[i]]).collect();
        let cost = push(&e);
        e.step(1);
        let m = &e.model;
        let (growth, inflation) = ((1.0 + m.agg.gamma_e).powi(plan as i32), (1.0 + m.agg.pi_e).powi(plan as i32));
        let near = |a: f64, b: f64| (a / b - 1.0).abs() < 1e-11;
        for i in 0..I {
            let (supply, price) = (m.firms.Q_s_i[i], m.firms.P_i[i]);
            if !m.ext.plans(i, t) {
                kept += 1;
                assert_eq!((supply.to_bits(), price.to_bits()), (Q_s[i].to_bits(), P[i].to_bits()), "day {t}, firm {i}");
                continue;
            }
            let gap = Q_d[i] / Q_s[i];
            let by_costs = P[i] * (1.0 + cost[i]) * inflation;
            // sold out and not cheaper than its sector, or not sold out and cheaper: the supply follows the demand
            if (Q_s[i] <= Q_d[i]) == (P[i] >= P_g[i]) {
                supply_moves += 1;
                assert!(near(supply, Q_s[i] * growth * gap), "day {t}, firm {i}: supply {supply}");
                assert!(near(price, by_costs), "day {t}, firm {i}: price {price} against {by_costs}");
            } else {
                price_moves += 1;
                assert!(near(supply, Q_s[i] * growth), "day {t}, firm {i}: supply {supply}");
                assert!(near(price, by_costs * gap), "day {t}, firm {i}: price {price} against {}", by_costs * gap);
                // sold out and cheaper: dearer; not sold out and not cheaper: cheaper
                assert_eq!(gap >= 1.0, Q_s[i] <= Q_d[i]);
            }
        }
        assert_books(&e, &format!("day {t}"));
    }
    assert!(supply_moves > 100 && price_moves > 100 && kept > 5000, "{supply_moves} supplies moved, {price_moves} prices, {kept} firms kept both");
}

#[test]
fn the_first_plan_is_the_plan_of_the_paper_because_no_firm_has_a_gap_yet() {
    // as the port's CANVAS model starts: the supply a firm had planned is the demand it met
    let paper = city("London", 1356, true, false);
    let pull = london(1356);
    assert!(pull.model.ext.demand_pull && !paper.model.ext.demand_pull);
    assert_eq!(pull.model.firms.Q_s_i, pull.model.firms.Q_d_i);
    assert_ne!(paper.model.firms.Q_s_i, paper.model.firms.Q_d_i);
    let (mut paper, mut pull) = (paper, pull);
    paper.step(1);
    pull.step(1);
    assert_eq!(bits(&pull.model.firms.Q_s_i), bits(&paper.model.firms.Q_s_i));
    assert_eq!(bits(&pull.model.firms.P_i), bits(&paper.model.firms.P_i));
    assert_eq!(bits(&pull.figures()), bits(&paper.figures()));
    // from the second round of plans on the firms have gaps
    paper.step(60);
    pull.step(60);
    assert_ne!(bits(&pull.model.firms.P_i), bits(&paper.model.firms.P_i));
}

/// The price level and the share of persons without work of a city at the end of each of `years` years.
fn years_of(mut e: Economy, years: usize) -> Vec<(f64, f64)> {
    (0..years)
        .map(|_| {
            e.step(365);
            let f = e.figures();
            if f[15].is_finite() {
                assert_books(&e, "the end of a year");
            }
            (f[15], f[12] / (f[10] + f[11] + f[12]))
        })
        .collect()
}

#[test]
fn with_wages_in_money_the_price_level_holds_and_without_them_it_leaves() {
    // Measured with London as the reference world has it since economy feature 12 (its agriculture at the factor of
    // its harvest): with the wage in money the level stays within 8 % of its start in all of twelve seeds (1356 to
    // 1367); without it the level leaves by a quarter in ten of them (not 1358 and 1360, at 21 % and 20 %).
    for seed in [1356, 1357, 1359] {
        // the wage in money is the anchor: the price level stays within a tenth of its start
        for (year, (P, _)) in years_of(london(seed), 10).into_iter().enumerate() {
            assert!((P - 1.0).abs() < 0.1, "seed {seed}, year {}: the price level is {P}", year + 1);
        }
        // with the port's wage, which follows the prices, nothing holds the level: the gaps of all firms add up,
        // until the level has left its start by a quarter or the port stops over a number that is none
        let mut free = city("London", seed, false, true);
        let mut levels = vec![];
        let left = (0..10).any(|_| {
            let stopped = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| free.step(365))).is_err();
            levels.push(if stopped { f64::NAN } else { free.figures()[15] });
            stopped || !((levels[levels.len() - 1] - 1.0).abs() < 0.25)
        });
        assert!(left, "seed {seed}: the price level stayed at {levels:?}");
    }
}

#[test]
fn with_the_demand_pull_a_city_keeps_its_people_in_work_without_the_benefit() {
    // Of twelve seeds tried (1356 to 1367) five show the slump of the paper's rule within ten years (1357, 1358, 1363,
    // 1365, 1367); three of them are computed here. The bounds are measured ones, with London as the reference world
    // has it since economy feature 12 (its agriculture at the factor of its harvest). With the demand pull the most
    // without work at the end of one of the first six years is 4.5 % (1358), and none from the seventh year on.
    for seed in [1357, 1363, 1365] {
        // without the unemployment benefit and with the rule of the paper a slump feeds itself (feature 6): at the end
        // of some year more than 4 % are without work (up to 20 %)
        let paper = years_of(city("London", seed, true, false), 10);
        assert!(paper.iter().any(|(_, without)| *without > 0.04), "seed {seed}: {paper:?}");
        // with the demand pull a firm that sells too little lowers its price or its supply. A city can still lose
        // work in its first years (up to 4.5 % at the end of a year among the twelve seeds), but from the seventh year
        // on nobody is without work, though nobody pays a benefit (feature 9)
        let pull = years_of(london(seed), 10);
        for (year, (_, without)) in pull.iter().enumerate() {
            assert!(*without < if year < 6 { 0.04 } else { 0.005 }, "seed {seed}, year {}: {without} without work", year + 1);
        }
    }
}

#[test]
fn the_demand_pull_goes_with_every_planning_firm_adjusting() {
    let mut p = ITALY2010Q1.parameters.clone();
    let ic = ITALY2010Q1.initial_conditions.to_json();
    assert!(Economy::new(&p.to_json(), &ic, 1, 1, 1).unwrap().with_demand_pull().is_ok());
    p.theta_calvo = 0.5;
    let e = Economy::new(&p.to_json(), &ic, 1, 1, 1).unwrap();
    assert!(e.with_demand_pull().unwrap_err().contains("theta_calvo = 0.5"));
}

#[test]
fn the_demand_pull_is_part_of_the_state() {
    let mut whole = london(1356);
    let mut state = london(1356).save();
    for _ in 0..45 {
        whole.step(1);
        let mut e = Economy::load(&state).unwrap();
        e.step(1);
        state = e.save();
    }
    let e = Economy::load(&state).unwrap();
    assert_eq!(e, whole);
    assert!(e.model.ext.demand_pull);
    assert_eq!(state, whole.save());
    let paper = city("London", 1356, true, false);
    assert_ne!(paper.save(), london(1356).save());
    assert!(!Economy::load(&paper.save()).unwrap().model.ext.demand_pull);
}

#[test]
fn cities_that_trade_set_prices_in_the_same_way() {
    let three = |pull: [bool; 3]| Cities::new(vec![city("London", 1, true, pull[0]), city("Paris", 2, true, pull[1]), city("Cairo", 3, true, pull[2])]);
    assert!(three([true, true, false]).unwrap_err().contains("city 2 sets prices in another way"));
    let mut all = three([true; 3]).unwrap();
    for day in 1..=90 {
        all.step(1);
        if day % 30 == 0 {
            for (c, e) in all.cities.iter().enumerate() {
                assert_books(e, &format!("day {day}, city {c}"));
            }
            for [off, scale] in all.checks() {
                assert!(scale == 0.0 || (off / scale).abs() < 1e-9, "day {day}: the merchants' books are off by {off} against {scale}");
            }
        }
    }
    assert_eq!(Cities::load(&all.save()).unwrap(), all);
}
