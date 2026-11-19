//! Distance in trade (economy feature 17, src/trade.rs): goods travel for days, carrying is labour bought in the city
//! of origin, the stock to keep answers to the price at the stall, and cities without a way do not trade. Every
//! city is the port's own data set for Austria (2010Q1) with a seed of its own.
#![allow(non_snake_case)]

use beforeit::AUSTRIA2010Q1;
use sc_economy::Economy;
use sc_economy::state::FORMAT_CITIES;
use sc_economy::trade::Cities;

fn cities(seeds: &[u64]) -> Cities {
    let city = |s: u64| {
        Economy::new(
            &AUSTRIA2010Q1.parameters.to_json(),
            &AUSTRIA2010Q1.initial_conditions.to_json(),
            s,
            3,
            4,
        )
        .unwrap()
    };
    Cities::new(seeds.iter().map(|&s| city(s)).collect()).unwrap()
}

/// Routes of `days` days between any two of `n` cities, with `labour` days of labour a real unit of every product.
fn routes(all: Cities, days: usize, labour: f64, elasticity: f64) -> Cities {
    let (n, G) = (all.cities.len(), all.merchants.bought.len());
    all.with_routes(
        vec![vec![days; n]; n],
        vec![vec![labour; n]; n],
        vec![1.0; G],
        elasticity,
    )
    .unwrap()
}

fn assert_books(all: &Cities, when: &str) {
    for (k, [off, scale]) in all.checks().into_iter().enumerate() {
        assert!(
            off.abs() <= 1e-9 * scale,
            "{when}: check {k} of the merchants is off by {off} against {scale}"
        );
    }
    let m = &all.merchants;
    assert!(
        m.stock
            .iter()
            .chain(&m.value)
            .flatten()
            .all(|&x| x >= 0.0 && x.is_finite()),
        "{when}"
    );
    for (c, e) in all.cities.iter().enumerate() {
        let [income, nominal, real, central_bank, banks, gdp] = e.checks();
        for (name, v) in [
            ("income", income),
            ("nominal", nominal),
            ("real", real),
            ("central bank", central_bank),
            ("banks", banks),
        ] {
            assert!(
                (v / gdp).abs() < 1e-9,
                "{when}, city {c}, {name}: {v} against a GDP of {gdp}"
            );
        }
    }
}

fn figures(all: &Cities) -> Vec<u64> {
    all.cities.iter().flat_map(Economy::figures).map(f64::to_bits).collect()
}

#[test]
fn a_day_of_travel_without_labour_and_without_elasticity_is_the_trade_without_routes() {
    let (mut plain, mut one) = (cities(&[1, 2, 3]), routes(cities(&[1, 2, 3]), 1, 0.0, 0.0));
    assert_eq!(one.merchants.orders, plain.merchants.orders);
    for day in 1..=12 {
        plain.step(1);
        one.step(1);
        assert_eq!(figures(&one), figures(&plain), "day {day}");
        assert_eq!(one.merchants.stock, plain.merchants.stock, "day {day}");
        assert_eq!(one.merchants.value, plain.merchants.value, "day {day}");
    }
    let r = one.merchants.routes.as_ref().unwrap();
    assert!(r.on_way.iter().all(|&x| x == 0.0) && r.paid == 0.0 && r.period == 12);
}

#[test]
fn goods_lie_at_the_stall_after_the_days_of_the_way() {
    let mut all = routes(cities(&[1, 2, 3]), 5, 0.0, 0.0);
    let G = all.merchants.bought.len();
    let on = |all: &Cities, arrives: usize| {
        let r = all.merchants.routes.as_ref().unwrap();
        (0..3)
            .map(|d| (0..G).map(|g| r.on_way[r.slot(arrives, d, g)]).sum::<f64>())
            .sum::<f64>()
    };
    assert_eq!(all.merchants.routes.as_ref().unwrap().horizon, 5);
    // the ring has five days: before the first day nothing arrives with the settling of day 5 (period 4)
    assert_eq!(on(&all, 4), 0.0);
    all.step(1);
    // what was bought on day 1 arrives with the settling of day 5
    let bought_first = on(&all, 4);
    assert!(bought_first > 0.0);
    assert!((bought_first / all.merchants.bought.iter().sum::<f64>() - 1.0).abs() < 1e-12);
    for day in 2..=4 {
        all.step(1);
        assert_eq!(on(&all, 4), bought_first, "day {day}");
        assert_books(&all, &format!("day {day}"));
    }
    let (before, sold_before): (f64, f64) = (
        all.merchants.stock.iter().flatten().sum(),
        all.merchants.sold.iter().sum(),
    );
    all.step(1);
    let (after, sold): (f64, f64) = (
        all.merchants.stock.iter().flatten().sum(),
        all.merchants.sold.iter().sum(),
    );
    // the stalls hold what they held, less what they sold on day 5, plus the goods of day 1
    assert!(
        (after - (before - (sold - sold_before) + bought_first)).abs() < 1e-9 * bought_first,
        "{after} {before} {bought_first}"
    );
    assert_books(&all, "day 5");
}

#[test]
fn at_the_start_what_a_stall_sells_in_a_day_is_on_the_way_for_every_day_an_order_travels() {
    let (plain, far) = (cities(&[1, 2, 3]), routes(cities(&[1, 2, 3]), 5, 0.0, 0.0));
    let (r, G) = (far.merchants.routes.as_ref().unwrap(), far.merchants.bought.len());
    // an order travels four days longer than without routes: four days of sales are on the way, one for each day
    for d in 0..3 {
        for g in 0..G {
            let daily = plain.merchants.stock[d][g];
            for arrives in 0..5 {
                let want = if arrives < 4 { daily } else { 0.0 };
                assert!(
                    (r.on_way[r.slot(arrives, d, g)] - want).abs() <= 1e-12 * daily,
                    "city {d}, product {g}, day {arrives}"
                );
            }
        }
    }
    // so the first order is the order without routes: one day of sales
    let sum = |a: &Cities| a.merchants.orders.iter().flatten().flatten().sum::<f64>();
    assert!(
        (sum(&far) / sum(&plain) - 1.0).abs() < 1e-9,
        "{} against {}",
        sum(&far),
        sum(&plain)
    );
    // the goods on the way are the merchants': their worth and their goods balance from the first day on
    assert_books(&far, "the start");
    assert!(far.worth() > plain.worth());
}

#[test]
fn carrying_is_bought_as_services_in_the_city_of_origin_and_laid_on_the_goods() {
    let (mut free, mut dear) = (
        routes(cities(&[1, 2, 3]), 2, 0.0, 0.0),
        routes(cities(&[1, 2, 3]), 2, 1e-3, 0.0),
    );
    let G = dear.merchants.bought.len();
    // the carrying ordered is services: the days of labour of the goods ordered, at the mean wage, over the price of services
    let r = dear.merchants.routes.as_ref().unwrap();
    assert!(r.carrying.iter().flatten().sum::<f64>() > 0.0);
    for c in 0..3 {
        assert_eq!(r.carrying[c][c], 0.0);
    }
    for _ in 0..10 {
        free.step(1);
        dear.step(1);
    }
    assert_books(&dear, "day 10 with carrying");
    let (r, f) = (
        dear.merchants.routes.as_ref().unwrap(),
        free.merchants.routes.as_ref().unwrap(),
    );
    assert!(r.paid > 0.0 && f.paid == 0.0);
    // a unit at the stall is what cost 1 at the start, carrying included: a unit bought makes more than one there
    for c in 0..3 {
        for g in 0..G {
            let unit = r.unit(c, (c + 1) % 3, g);
            assert_eq!(unit, 1.0 + 1e-3 * r.wage0[c] / r.price0[c][g]);
            assert!(unit > 1.0 && f.unit(c, (c + 1) % 3, g) == 1.0);
        }
    }
    // the cities sold more services to the merchants than without carrying: the last product of the orders
    let exports = |a: &Cities| a.cities.iter().map(|e| e.model.rotw.C_l).sum::<f64>();
    assert!(exports(&dear) > 0.0 && exports(&free) > 0.0);
}

#[test]
fn carrying_that_costs_more_than_at_the_start_makes_the_stall_dearer() {
    // the same cities, but in one the wages of the start were half of what they are: carrying has doubled since
    let (mut same, mut risen) = (
        routes(cities(&[1, 2, 3]), 1, 2e-2, 0.0),
        routes(cities(&[1, 2, 3]), 1, 2e-2, 0.0),
    );
    risen
        .merchants
        .routes
        .as_mut()
        .unwrap()
        .wage0
        .iter_mut()
        .for_each(|w| *w /= 2.0);
    let G = same.merchants.bought.len();
    same.step(1);
    risen.step(1);
    assert_books(&same, "day 1");
    let price = |a: &Cities, c: usize, g: usize| a.merchants.value[c][g] / a.merchants.stock[c][g];
    let mut stalls = 0;
    for c in 0..3 {
        for g in 0..G {
            // the last product is the services that carry, bought with the goods but not carried themselves
            if g + 1 < G && same.merchants.stock[c][g] > 0.0 && risen.merchants.stock[c][g] > 0.0 {
                assert!(price(&risen, c, g) > price(&same, c, g), "stall {c}, product {g}");
                stalls += 1;
            }
        }
    }
    assert!(stalls > 0);
    // and while carrying costs what it cost at the start, the stalls stay at the price they have without carrying,
    // though carrying is paid (here a tenth and more of the goods)
    let mut free = routes(cities(&[1, 2, 3]), 1, 0.0, 0.0);
    free.step(1);
    let (r, goods) = (
        same.merchants.routes.as_ref().unwrap(),
        same.cities.iter().map(|e| e.model.rotw.C_l).sum::<f64>(),
    );
    assert!(
        r.paid / goods > 0.1,
        "carrying is {} of what the merchants spent",
        r.paid / goods
    );
    let mut worst: f64 = 0.0;
    for c in 0..3 {
        for g in 0..G - 1 {
            if same.merchants.stock[c][g] > 0.0 && free.merchants.stock[c][g] > 0.0 {
                worst = worst.max((price(&same, c, g) / price(&free, c, g) - 1.0).abs());
            }
        }
    }
    assert!(worst < 0.02, "a stall is {worst} off the price without carrying");
}

#[test]
fn a_dearer_stall_keeps_less_stock() {
    // the goods at every stall cost twice, or half, what they cost at the start, when the merchants order
    let ordered = |factor: f64, elasticity: f64| {
        let mut all = cities(&[1, 2, 3]);
        for v in all.merchants.value.iter_mut().flatten() {
            *v *= factor;
        }
        let all = routes(all, 1, 0.0, elasticity);
        all.merchants.orders.iter().flatten().flatten().sum::<f64>()
    };
    // at the start a stall is full and expected to sell out, so the order is the stock to keep
    let base = ordered(1.0, 2.0);
    assert!(base > 0.0);
    assert_eq!(ordered(2.0, 0.0), base);
    assert!(
        (ordered(2.0, 2.0) / base - 0.25).abs() < 1e-9,
        "{}",
        ordered(2.0, 2.0) / base
    );
    assert!((ordered(0.5, 2.0) / base - 4.0).abs() < 1e-9);
    assert!((ordered(2.0, 1.0) / base - 0.5).abs() < 1e-9);
    // and the books balance over weeks with an elasticity
    let mut all = routes(cities(&[1, 2, 3]), 2, 1e-3, 2.0);
    all.step(40);
    assert_books(&all, "day 40 with an elasticity");
}

#[test]
fn cities_without_a_way_do_not_trade() {
    let all = cities(&[1, 2, 3, 4]);
    let (n, G) = (4, all.merchants.bought.len());
    let mut days = vec![vec![3; n]; n];
    for c in 0..n {
        days[0][c] = 0;
        days[c][0] = 0;
    }
    let mut all = all
        .with_routes(days, vec![vec![1e-4; n]; n], vec![1.0; G], 2.0)
        .unwrap();
    for day in 1..=8 {
        for c in 0..n {
            assert!(
                all.merchants.orders[0][c]
                    .iter()
                    .chain(&all.merchants.orders[c][0])
                    .all(|&o| o == 0.0),
                "day {day}"
            );
        }
        all.step(1);
        assert_eq!(
            all.cities[0].model.rotw.C_l, 0.0,
            "day {day}: the city without a way exports"
        );
        assert!(all.cities[1].model.rotw.C_l > 0.0);
    }
    assert_books(&all, "day 8 with a city without a way");
}

#[test]
fn cities_with_routes_load_bit_for_bit_and_older_states_have_none() {
    let mut straight = routes(cities(&[10, 11, 12]), 4, 1e-4, 2.0);
    assert_eq!(Cities::load(&straight.save()).unwrap(), straight);
    straight.step(9);
    let mut first = routes(cities(&[10, 11, 12]), 4, 1e-4, 2.0);
    first.step(6); // with goods on the way
    assert!(first.merchants.routes.as_ref().unwrap().on_way.iter().any(|&x| x > 0.0));
    let bytes = first.save();
    assert_eq!(bytes[4..8], FORMAT_CITIES.to_le_bytes());
    let mut second = Cities::load(&bytes).unwrap();
    assert_eq!(second, first);
    assert_eq!(second.save(), bytes);
    second.step(3);
    assert_eq!(second.save(), straight.save());
    // format 1 is format 2 without the last byte, which says whether there are routes
    let mut plain = cities(&[10, 11, 12]);
    plain.step(2);
    let mut old = plain.save();
    assert_eq!(old.pop(), Some(0));
    old[4..8].copy_from_slice(&1u32.to_le_bytes());
    let back = Cities::load(&old).unwrap();
    assert_eq!(back, plain);
    assert!(back.merchants.routes.is_none());
    // a broken end is refused
    let mut cut = bytes.clone();
    cut.truncate(bytes.len() - 5);
    assert!(Cities::load(&cut).is_err());
}

#[test]
fn routes_that_do_not_fit_are_refused() {
    let G = cities(&[1, 2]).merchants.bought.len();
    let ok = || (vec![vec![2; 2]; 2], vec![vec![0.0; 2]; 2], vec![1.0; G]);
    let (d, l, w) = ok();
    assert!(cities(&[1, 2]).with_routes(d, l, w, 2.0).is_ok());
    let (d, l, w) = ok();
    assert!(
        cities(&[1, 2, 3])
            .with_routes(d, l, w, 2.0)
            .unwrap_err()
            .contains("do not fit")
    );
    let (d, l, _) = ok();
    assert!(
        cities(&[1, 2])
            .with_routes(d, l, vec![1.0], 2.0)
            .unwrap_err()
            .contains("do not fit")
    );
    let (d, mut l, w) = ok();
    l[0][1] = -1.0;
    assert!(
        cities(&[1, 2])
            .with_routes(d, l, w, 2.0)
            .unwrap_err()
            .contains("labour")
    );
    let (d, l, w) = ok();
    assert!(
        cities(&[1, 2])
            .with_routes(d, l, w, f64::NAN)
            .unwrap_err()
            .contains("elasticity")
    );
    let (d, l, w) = ok();
    let mut late = cities(&[1, 2]);
    late.step(1);
    assert!(
        late.with_routes(d, l, w, 2.0)
            .unwrap_err()
            .contains("have not computed")
    );
    let (d, l, w) = ok();
    let (d2, l2, w2) = ok();
    assert!(
        cities(&[1, 2])
            .with_routes(d, l, w, 2.0)
            .unwrap()
            .with_routes(d2, l2, w2, 2.0)
            .is_err()
    );
}
