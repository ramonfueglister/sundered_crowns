//! The wage in money (economy feature 7, docs/ECONOMY_DESIGN.md; the rule is in src/clock.rs). In the port a firm
//! has a real wage that never changes and pays it times the consumer price level; in an economy that pays wages in
//! money a firm has a wage in money that never changes (Assenza, Delli Gatti, Grazzini 2015, table 2). These tests
//! compute Austria by the port's own rules (its data set of 2010Q1, a plan and a window of one period) and a city
//! of the game, London, from the file the world server reads (public/data/economy_cities.json).
#![allow(non_snake_case)]

use beforeit::{AUSTRIA2010Q1, Extension};
use sc_economy::Economy;
use sc_economy::clock::DailyClock;
use sc_economy::trade::Cities;

const CITIES: &str = include_str!("../../public/data/economy_cities.json");

/// Austria as the port computes it, with the port's wage or with wages in money.
fn austria(seed: u64, money: bool) -> Economy {
    let e = Economy::new(&AUSTRIA2010Q1.parameters.to_json(), &AUSTRIA2010Q1.initial_conditions.to_json(), seed, 1, 1).unwrap();
    if money { e.with_wages_in_money() } else { e }
}

/// A city of the game on the clock of the game, with the port's wage or with wages in money.
fn city(name: &str, seed: u64, money: bool) -> Economy {
    let file: serde_json::Value = serde_json::from_str(CITIES).unwrap();
    let city = file["cities"].as_array().unwrap().iter().find(|c| c["name"] == name).unwrap_or_else(|| panic!("{name} is a city of the game"));
    let clock = &file["clock"];
    let (plan, window) = (clock["plan"].as_u64().unwrap() as usize, clock["window"].as_u64().unwrap() as usize);
    let e = Economy::new(&city["parameters"].to_string(), &city["initial_conditions"].to_string(), seed, plan, window).unwrap();
    if money { e.with_wages_in_money() } else { e }
}

fn london(seed: u64, money: bool) -> Economy {
    city("London", seed, money)
}

/// Multiplies every price of an economy by `k`: the prices of the firms and the price levels made of them.
fn raise_prices(e: &mut Economy, k: f64) {
    let m = &mut e.model;
    m.firms.P_i.iter_mut().for_each(|p| *p *= k);
    m.agg.P_bar_g.iter_mut().for_each(|p| *p *= k);
    m.agg.P_bar_HH *= k;
    m.agg.P_bar_CF *= k;
    m.agg.P_bar *= k;
}

fn assert_books(e: &Economy, at: &str) {
    let [income, nominal, real, central_bank, banks, gdp] = e.checks();
    for v in [income, nominal, real, central_bank, banks] {
        assert!((v / gdp).abs() < 1e-9, "{at}: the books are off by {v} against {gdp}");
    }
}

#[test]
fn the_calibration_of_the_cities_says_that_wages_are_paid_in_money() {
    let file: serde_json::Value = serde_json::from_str(CITIES).unwrap();
    assert_eq!(file["wage"], "money");
}

#[test]
fn the_port_pays_a_real_wage_times_the_prices_and_the_feature_a_wage_in_money() {
    // the port: the real wage of a firm never changes, so what it pays for a unit of work follows the consumer prices
    let mut port = austria(7, false);
    assert!(!port.model.ext.pays_in_money());
    let real = port.model.firms.w_bar_i.clone();
    port.step(40);
    let P = port.model.agg.P_bar_HH;
    assert!((P - 1.0).abs() > 0.05, "the consumer prices of Austria have moved by {}", P - 1.0);
    assert_eq!(port.model.firms.w_bar_i, real);
    assert!(port.model.ext.wage.is_empty() && port.model.ext.real_wage.is_empty());

    // wages in money: the wage in money of a firm never changes, its real wage is that wage over the consumer prices
    let mut e = austria(7, true);
    assert!(e.model.ext.pays_in_money());
    assert_eq!(e.model.ext.real_wage, real);
    assert_eq!(e.model.ext.wage, real); // the consumer price level of the starting position is 1
    let wage = e.model.ext.wage.clone();
    let (mut least, mut most) = (1.0f64, 1.0f64);
    for t in 1..=40 {
        let before = e.model.agg.P_bar_HH;
        e.step(1);
        let (f, after) = (&e.model.firms, e.model.agg.P_bar_HH);
        assert_eq!(e.model.ext.wage, wage, "period {t}");
        assert_eq!(e.model.ext.real_wage, real, "period {t}");
        for i in 0..f.len() {
            // the real wage of the period is the wage in money over the consumer prices the firms knew when they decided
            assert_eq!(f.w_bar_i[i].to_bits(), (wage[i] / before).to_bits(), "period {t}, firm {i}");
            // A.26 and the wage bill of the port: what the firm pays for a unit of work is the wage in money, off by the
            // change of the consumer prices within the period
            let effort = f.w_i[i] / f.w_bar_i[i];
            let paid = f.w_i[i] * after / effort;
            assert!((paid / wage[i] - after / before).abs() < 1e-14, "period {t}, firm {i}: {paid} against {}", wage[i]);
        }
        (least, most) = (least.min(after), most.max(after));
        assert_books(&e, &format!("period {t}"));
    }
    // while the real wage moved with the prices
    assert!(most - least > 0.001, "the consumer prices stayed between {least} and {most}");
    assert_ne!(e.model.firms.w_bar_i, real);
    // and it is another economy than the port's
    assert_ne!(e.figures(), port.figures());
}

#[test]
fn the_cost_push_takes_the_wage_in_money_as_the_price_of_labour() {
    let push = |e: &Economy| <DailyClock as Extension>::cost_push_inflation(&e.model, &e.model.firms);
    let (mut port, mut money) = (london(1356, false), london(1356, true));
    // at the start the wage in money is the real wage at the prices of the start: the same push
    let (start_port, start_money) = (push(&port), push(&money));
    let I = start_port.len();
    for i in 0..I {
        assert!((start_money[i] - start_port[i]).abs() < 1e-15, "firm {i}: {} against {}", start_money[i], start_port[i]);
    }
    // every price a quarter higher. The port's push does not see it: its wage rises with the prices, so nothing
    // holds the level of prices. With wages in money labour has become cheaper against the firm's price by a fifth.
    raise_prices(&mut port, 1.25);
    raise_prices(&mut money, 1.25);
    let (high_port, high_money) = (push(&port), push(&money));
    let (f, tax) = (&money.model.firms, 1.0 + money.model.prop.tau_SIF);
    for i in 0..I {
        assert!((high_port[i] - start_port[i]).abs() < 1e-12, "firm {i}: {} against {}", high_port[i], start_port[i]);
        // (1 + tau_SIF) * wage / alpha * (1 / (1.25 * P) - 1 / P), P the price of the firm at the start
        let labour = tax * money.model.ext.wage[i] / f.alpha_bar_i[i] * (1.0 / f.P_i[i] - 1.25 / f.P_i[i]);
        assert!(labour < 0.0);
        assert!((high_money[i] - start_port[i] - labour).abs() < 1e-12, "firm {i}: {} against {}", high_money[i] - start_port[i], labour);
    }
    // the push does not depend on the real wage the port holds at the moment (it is set anew before the firms decide)
    money.model.firms.w_bar_i.iter_mut().for_each(|w| *w *= 3.0);
    let other = push(&money);
    for i in 0..I {
        assert!((other[i] - high_money[i]).abs() < 1e-12, "firm {i}");
    }
}

#[test]
fn prices_come_back_to_the_wage_in_money_and_stay_where_they_are_without_it() {
    for seed in [1356, 1357, 1358] {
        let level = |money: bool| {
            let mut e = london(seed, money);
            e.step(60);
            raise_prices(&mut e, 1.2);
            e.step(2 * 365);
            assert_books(&e, "two years after the prices were raised");
            e.figures()[15]
        };
        let (port, money) = (level(false), level(true));
        // measured over the seeds 1356 to 1363: 1.14 to 1.24 with the port's wage, 0.994 to 1.004 with wages in money
        assert!(port > 1.1, "seed {seed}: with the port's wage the price level is {port}");
        assert!((money - 1.0).abs() < 0.02, "seed {seed}: with wages in money the price level is {money}");
    }
}

#[test]
fn the_price_level_of_a_city_holds_for_years() {
    for seed in [1356, 1357, 1358] {
        let mut e = london(seed, true);
        for year in 1..=6 {
            e.step(365);
            let P = e.figures()[15];
            assert!((P - 1.0).abs() < 0.02, "seed {seed}, year {year}: the price level is {P}");
            assert_books(&e, &format!("seed {seed}, year {year}"));
        }
        // the wage of every person with an employer is a wage in money of a firm, times the effort of the day
        let (m, P) = (&e.model, e.model.agg.P_bar_HH);
        for h in 0..m.w_act.w_h.len() {
            if let Some(i) = m.w_act.O_h[h] {
                assert_eq!(m.w_act.w_h[h].to_bits(), m.firms.w_i[i].to_bits());
                assert!((m.w_act.Y_h[h] - m.firms.w_i[i] * (1.0 - m.prop.tau_INC) * P).abs() <= 1e-12 * m.w_act.Y_h[h]);
            }
        }
    }
}

#[test]
fn the_wages_in_money_are_part_of_the_state() {
    let mut whole = london(1356, true);
    let mut state = london(1356, true).save();
    for _ in 0..45 {
        whole.step(1);
        let mut e = Economy::load(&state).unwrap();
        e.step(1);
        state = e.save();
    }
    let e = Economy::load(&state).unwrap();
    assert_eq!(e, whole);
    assert!(e.model.ext.pays_in_money());
    assert_eq!(e.model.ext.wage.len(), e.model.firms.len());
    assert_eq!(state, whole.save());
    // the state of an economy with the port's wage is another one, and loads as such
    let port = london(1356, false);
    assert_ne!(port.save(), london(1356, true).save());
    assert!(!Economy::load(&port.save()).unwrap().model.ext.pays_in_money());
    // wages that do not fit the firms are refused
    let mut short = whole.clone();
    short.model.ext.real_wage.pop();
    assert!(Economy::load(&short.save()).unwrap_err().contains("wages in money"));
    let mut fewer = whole.clone();
    fewer.model.ext.wage.pop();
    fewer.model.ext.real_wage.pop();
    assert!(Economy::load(&fewer.save()).unwrap_err().contains("wages in money"));
}

#[test]
#[should_panic(expected = "the daily clock holds the wages of")]
fn the_clock_stops_when_it_does_not_hold_the_wage_of_every_firm() {
    let mut e = london(1356, true);
    e.model.ext.wage.pop();
    e.model.ext.real_wage.pop();
    e.step(1);
}

#[test]
fn cities_that_trade_pay_wages_in_the_same_way() {
    let three = |money: [bool; 3]| Cities::new(vec![london(1, money[0]), city("Paris", 2, money[1]), city("Cairo", 3, money[2])]);
    assert!(three([true, false, true]).unwrap_err().contains("city 1 pays wages in another way"));
    let mut all = three([true; 3]).unwrap();
    let wages: Vec<Vec<f64>> = all.cities.iter().map(|e| e.model.ext.wage.clone()).collect();
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
    for (e, wage) in all.cities.iter().zip(&wages) {
        assert_eq!(&e.model.ext.wage, wage);
    }
    // through bytes the cities are the same cities
    assert_eq!(Cities::load(&all.save()).unwrap(), all);
}
