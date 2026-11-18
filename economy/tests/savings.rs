//! Economy feature 15 (docs/ECONOMY_DESIGN.md): households spend out of their savings (src/clock.rs).
use sc_economy::Economy;
use sc_economy::state::FORMAT;

const CITIES: &str = include_str!("../../public/data/economy_cities.json");

/// The first city of the game with the rules of the game (wages in money, the demand pull) and the seed given.
fn city(seed: u64) -> Economy {
    let file: serde_json::Value = serde_json::from_str(CITIES).unwrap();
    let city = &file["cities"].as_array().unwrap()[0];
    let clock = &file["clock"];
    let (plan, window) = (clock["plan"].as_u64().unwrap() as usize, clock["window"].as_u64().unwrap() as usize);
    Economy::new(&city["parameters"].to_string(), &city["initial_conditions"].to_string(), seed, plan, window).unwrap().with_wages_in_money().with_demand_pull().unwrap()
}

fn deposits(e: &Economy) -> f64 {
    let m = &e.model;
    [&m.w_act.D_h, &m.w_inact.D_h, &m.firms.D_h, &m.banks.D_h].iter().map(|v| v.iter().sum::<f64>()).sum()
}

#[test]
fn without_a_share_the_economy_computes_as_the_port_does() {
    let (mut port, mut none) = (city(7), city(7).with_savings_spent(0.0).unwrap());
    port.step(40);
    none.step(40);
    assert_eq!(none.save(), port.save());
    assert_eq!(none.model.ext.norm, -1.0); // no target is ever set
}

#[test]
fn the_target_is_what_the_households_hold_at_the_start_over_their_first_budgets() {
    let mut e = city(7).with_savings_spent(0.4 / 365.0).unwrap();
    let held = deposits(&e);
    assert_eq!(e.model.ext.norm, -1.0);
    e.step(1);
    let n = e.model.ext.norm;
    // the calibration gives the households the coin they hold: some weeks of their spending
    assert!(n > 20.0 && n < 200.0, "target of {n} budgets");
    let m = &e.model;
    let budgets: f64 = [&m.w_act.C_d_h, &m.w_inact.C_d_h, &m.firms.C_d_h, &m.banks.C_d_h].iter().map(|v| v.iter().sum::<f64>()).sum();
    // all households together start at the target: together they want to spend what the port's rule says
    let port = { let mut p = city(7); p.step(1); let m = &p.model; [&m.w_act.C_d_h, &m.w_inact.C_d_h, &m.firms.C_d_h, &m.banks.C_d_h].iter().map(|v| v.iter().sum::<f64>()).sum::<f64>() };
    assert!((budgets / port - 1.0).abs() < 1e-3, "budgets {budgets} against the port's {port}");
    assert!((held / port / n - 1.0).abs() < 1e-9);
    e.step(30);
    assert_eq!(e.model.ext.norm, n); // set once
}

#[test]
fn households_that_spend_out_of_savings_hold_less_after_years() {
    // One city alone is noisy: after 12 years the households of a city that spends out of savings held less than
    // those of the port's rule in only 3 of 8 seeds (London as it is since people feature 2; 5 of 8 with London as it
    // was before). After 30 years, with a crown that buys with what it took in, they held less in 5 of 6 seeds (1.22 to 1.76 times the start against 1.53 to 1.94),
    // so the statement is made of three cities together, the exception (seed 3) among them. Across the 29 cities
    // that trade the difference is large (docs/ECONOMY_DESIGN.md, section 15).
    let (mut a, mut b) = (0.0, 0.0);
    for seed in [1, 2, 3] {
        let (mut port, mut spends) = (city(seed).with_crown_spending_revenue(), city(seed).with_crown_spending_revenue().with_savings_spent(0.4 / 365.0).unwrap());
        let start = deposits(&port);
        port.step(365 * 30);
        spends.step(365 * 30);
        a += deposits(&port) / start;
        b += deposits(&spends) / start;
    }
    assert!(b < a, "deposits of the households over those of the start, three cities: {b} with the spending, {a} without");
}

#[test]
fn the_share_and_the_target_are_saved_and_a_share_must_be_a_share() {
    let mut e = city(5).with_savings_spent(0.001).unwrap();
    e.step(3);
    let bytes = e.save();
    assert_eq!(bytes[4..8], FORMAT.to_le_bytes());
    let mut back = Economy::load(&bytes).unwrap();
    assert_eq!(back.model, e.model);
    e.step(4);
    back.step(4);
    assert_eq!(back.save(), e.save());
    assert!(city(5).with_savings_spent(-0.1).unwrap_err().contains("between 0 and 1"));
    assert!(city(5).with_savings_spent(1.5).is_err());
}
