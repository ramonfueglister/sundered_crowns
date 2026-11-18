//! Economy feature 18 (docs/ECONOMY_DESIGN.md): a firm and its owner are one household (src/clock.rs).
use sc_economy::Economy;
use sc_economy::state::FORMAT;

const CITIES: &str = include_str!("../../public/data/economy_cities.json");

/// The first city of the game with the rules of the game before feature 18 and the seed given.
fn city(seed: u64) -> Economy {
    let file: serde_json::Value = serde_json::from_str(CITIES).unwrap();
    let city = &file["cities"].as_array().unwrap()[0];
    let clock = &file["clock"];
    let (plan, window) = (clock["plan"].as_u64().unwrap() as usize, clock["window"].as_u64().unwrap() as usize);
    Economy::new(&city["parameters"].to_string(), &city["initial_conditions"].to_string(), seed, plan, window).unwrap().with_wages_in_money().with_demand_pull().unwrap().with_savings_spent(0.4 / 365.0).unwrap().with_crown_spending_revenue()
}

/// What the firms hold less what they owe.
fn net(e: &Economy) -> f64 {
    e.model.firms.D_i.iter().sum::<f64>() - e.model.firms.L_i.iter().sum::<f64>()
}

#[test]
fn the_profit_of_the_first_day_is_the_papers_without_the_stock_that_was_built() {
    let (mut paper, mut owner) = (city(7), city(7).with_owner_household());
    paper.step(1);
    owner.step(1);
    // up to the profits the day is the same: the same goods were made, sold and put in stock (the two figures left out are the
    // deposits of households and firms, which the rule changes)
    assert_eq!(owner.figures()[..13], paper.figures()[..13]);
    assert_eq!(owner.figures()[15], paper.figures()[15]);
    let (p, o) = (&paper.model.firms, &owner.model.firms);
    assert_eq!(o.DS_i, p.DS_i);
    assert!(p.DS_i.iter().any(|d| *d != 0.0));
    for i in 0..p.len() {
        let want = p.Pi_i[i] - p.P_i[i] * p.DS_i[i];
        assert!((o.Pi_i[i] - want).abs() <= 1e-9 * want.abs().max(1.0), "firm {i}: {} for {want}", o.Pi_i[i]);
    }
}

#[test]
fn an_owner_bears_a_loss_as_he_holds_a_profit_and_the_firm_gets_it() {
    let mut e = city(7).with_owner_household();
    let mut losses = 0;
    for _ in 0..120 {
        e.step(1);
        let (m, f) = (&e.model, &e.model.firms);
        let k = m.prop.theta_DIV * (1.0 - m.prop.tau_FIRM);
        let other = m.gov.sb_other * m.agg.P_bar_HH;
        assert!(m.ext.borne.is_empty());
        for i in 0..f.len() {
            if f.Pi_i[i] >= 0.0 {
                continue;
            }
            losses += 1;
            // the income of the owner is what the crown gives him less the loss
            let (bore, want) = (other - f.Y_h[i], -k * f.Pi_i[i]);
            assert!((bore - want).abs() <= 1e-9 * want.max(1.0), "firm {i}: bore {bore} for {want}");
        }
    }
    assert!(losses > 100, "{losses} days with a loss");
}

#[test]
fn the_firms_keep_their_money_where_the_papers_firms_lose_it() {
    let (mut paper, mut owner) = (city(1356), city(1356).with_owner_household());
    let start = net(&paper);
    assert_eq!(net(&owner), start);
    paper.step(3 * 365);
    owner.step(3 * 365);
    let gdp = paper.figures()[1];
    let (p, o) = ((net(&paper) - start) / gdp, (net(&owner) - start) / gdp);
    println!("firms' money after three years, in a year's output: paper {p}, one household {o}");
    assert!(p < -0.0005, "the firms of the paper lost {p}");
    assert!(o.abs() < p.abs() / 10.0, "the firms of feature 18 moved by {o}, the paper's by {p}");
}

#[test]
fn the_rule_is_saved_and_a_city_without_it_computes_as_before() {
    let mut e = city(5).with_owner_household();
    e.step(3);
    let bytes = e.save();
    assert_eq!(bytes[4..8], FORMAT.to_le_bytes());
    let mut back = Economy::load(&bytes).unwrap();
    assert_eq!(back.model, e.model);
    assert!(back.model.ext.owner);
    e.step(4);
    back.step(4);
    assert_eq!(back.save(), e.save());
    let (mut a, mut b) = (city(5), city(5));
    a.step(3);
    b.step(3);
    let mut again = Economy::load(&a.save()).unwrap();
    assert!(!again.model.ext.owner);
    again.step(4);
    b.step(4);
    assert_eq!(again.save(), b.save());
    assert_ne!(e.save(), b.save());
}
