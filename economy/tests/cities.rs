//! Cities that trade with each other (src/trade.rs): the merchants' books, the cities' own books, and the state as
//! bytes. Every city is the port's own data set for Austria (2010Q1) with a seed of its own, so these tests need
//! nothing from the game.
#![allow(non_snake_case)]

use beforeit::AUSTRIA2010Q1;
use sc_economy::Economy;
use sc_economy::trade::{Cities, origins};

fn city(seed: u64, plan: usize, window: usize) -> Economy {
    Economy::new(&AUSTRIA2010Q1.parameters.to_json(), &AUSTRIA2010Q1.initial_conditions.to_json(), seed, plan, window).unwrap()
}

/// Cities with the seeds given, a plan every 3 periods and windows of 4 periods.
fn cities(seeds: &[u64]) -> Cities {
    Cities::new(seeds.iter().map(|&s| city(s, 3, 4)).collect()).unwrap()
}

/// The books of the merchants and of every city balance, and no stall holds less than nothing.
fn assert_books(all: &Cities, when: &str) {
    for (k, [off, scale]) in all.checks().into_iter().enumerate() {
        assert!(off.abs() <= 1e-9 * scale, "{when}: check {k} of the merchants is off by {off} against {scale}");
    }
    let m = &all.merchants;
    assert!(m.stock.iter().chain(&m.value).flatten().all(|&x| x >= 0.0 && x.is_finite()), "{when}: {:?} {:?}", m.stock, m.value);
    assert!(m.orders.iter().flatten().flatten().all(|&x| x >= 0.0 && x.is_finite()), "{when}: {:?}", m.orders);
    for (c, e) in all.cities.iter().enumerate() {
        let [income, nominal, real, central_bank, banks, gdp] = e.checks();
        for (name, v) in [("income", income), ("nominal", nominal), ("real", real), ("central bank", central_bank), ("banks", banks)] {
            assert!((v / gdp).abs() < 1e-9, "{when}, city {c}, {name}: {v} against a GDP of {gdp}");
        }
        assert!(e.model.ext.trade.is_none(), "{when}: city {c} still holds the merchants' day");
    }
}

#[test]
fn the_merchants_start_with_the_import_supply_of_every_city() {
    let all = cities(&[1, 2, 3]);
    let m = &all.merchants;
    for (c, e) in all.cities.iter().enumerate() {
        let (Y_I, p) = (e.model.rotw.Y_I, &e.model.prop);
        assert!(Y_I > 0.0);
        for g in 0..p.G {
            assert_eq!(m.stock[c][g], p.c_I_g[g] * Y_I);
            assert_eq!(m.value[c][g], m.stock[c][g] * e.model.agg.P_bar_g[g]); // at the prices of the start
        }
        // the stock to keep is that supply, as a share of the city's output of a period
        assert_eq!(m.share[c], Y_I / e.model.data.real_gdp[0]);
        // for the first period they have ordered that supply again, in the other cities
        for g in 0..p.G {
            let ordered: f64 = (0..3).map(|o| m.orders[o][c][g]).sum();
            assert!((ordered - m.stock[c][g]).abs() <= 1e-12 * m.stock[c][g], "city {c}, product {g}: {ordered}");
            assert_eq!(m.orders[c][c][g], 0.0);
        }
    }
    assert_eq!(m.start, all.worth());
    assert_books(&all, "start");
}

#[test]
fn a_city_computes_with_what_the_merchants_want_and_bring() {
    let mut all = cities(&[1, 2, 3]);
    all.step(2);
    let before = all.merchants.clone();
    all.step(1);
    for (c, e) in all.cities.iter().enumerate() {
        let (r, p) = (&e.model.rotw, &e.model.prop);
        // the demand for exports is what the merchants ordered, and the mix of the exports the mix of the orders
        let orders: Vec<f64> = (0..p.G).map(|g| before.orders[c].iter().map(|o| o[g]).sum()).collect();
        let ordered: f64 = orders.iter().sum();
        assert!(ordered > 0.0);
        assert_eq!(r.C_E, ordered);
        for g in 0..p.G {
            assert_eq!(p.c_E_g[g], orders[g] / ordered);
        }
        assert!((p.c_E_g.iter().sum::<f64>() - 1.0).abs() < 1e-12);
        assert_eq!(r.Y_m, before.stock[c]); // the supply of imports is the stock at their stall
        assert_eq!(r.Y_I, before.stock[c].iter().sum::<f64>());
        for g in 0..p.G {
            if before.stock[c][g] > 0.0 {
                assert_eq!(r.P_m[g], before.value[c][g] / before.stock[c][g]); // sold at cost
            }
            assert!(r.Q_m[g] <= r.Y_m[g]);
        }
        // a foreign consumer's budget follows from the order as in the port (A.82); all budgets are alike
        assert!(r.C_d_l.iter().all(|&b| b == r.C_d_l[0]) && (r.C_d_l[0] > 0.0) == (ordered > 0.0));
        // and the merchants cannot spend more than the budgets
        assert!(r.C_l <= r.C_d_l.iter().sum::<f64>() * (1.0 + 1e-12));
    }
}

#[test]
fn what_one_city_exports_lies_in_the_other_the_next_day_at_what_it_cost() {
    let mut all = cities(&[5, 6]);
    let mut traded = 0;
    for day in 1..=8 {
        let before = all.merchants.clone();
        all.step(1);
        let (m, G) = (&all.merchants, all.cities[0].model.prop.G);
        for (c, d) in [(0, 1), (1, 0)] {
            // from city c to city d: goods at the mean price the merchants paid, cost with the export duty of c
            let (from, to) = (&all.cities[c].model, &all.cities[d].model.rotw);
            let (goods, cost) = if from.rotw.C_l > 0.0 {
                traded += 1;
                (from.rotw.C_l / from.rotw.P_l, (1.0 + from.prop.tau_EXPORT) * from.rotw.C_l)
            } else {
                (0.0, 0.0)
            };
            for g in 0..G {
                let left = before.stock[d][g] - to.Q_m[g];
                let stock = left + from.prop.c_E_g[g] * goods;
                assert!((m.stock[d][g] - stock).abs() <= 1e-12 * stock, "day {day}, product {g}: {} against {stock}", m.stock[d][g]);
                let value = before.value[d][g] - to.P_m[g] * to.Q_m[g] + from.prop.c_E_g[g] * cost;
                assert!((m.value[d][g] - value).abs() <= 1e-9 * value.abs().max(1.0), "day {day}, product {g}: {} against {value}", m.value[d][g]);
            }
        }
        assert_books(&all, &format!("day {day}"));
    }
    assert!(traded >= 10, "goods were bought on {traded} of 16 city days");
}

#[test]
fn nothing_is_made_or_lost_between_the_cities() {
    let mut all = cities(&[1356, 1357, 1358, 1359]);
    let start = all.worth();
    for day in 1..=24 {
        all.step(1);
        assert_books(&all, &format!("day {day}"));
    }
    // the merchants' money has moved between the cities and into goods, their worth has not
    let m = &all.merchants;
    assert!(all.cities.iter().any(|e| e.model.rotw.D_RoW != AUSTRIA2010Q1.initial_conditions.D_RoW));
    assert!((all.worth() - start).abs() <= 1e-9 * m.value.iter().flatten().sum::<f64>());
    // goods were traded: every city sold to the merchants and bought from them over the last window
    for (c, e) in all.cities.iter().enumerate() {
        let f = e.figures();
        assert!(f[8] > 0.0 && f[9] > 0.0, "city {c}: exports {} and imports {}", f[8], f[9]);
    }
    assert!(m.bought.iter().sum::<f64>() > 0.0 && m.sold.iter().sum::<f64>() > 0.0);
    // what is on its way never exceeds what was bought: every product in stock was either there at the start or bought
    for g in 0..m.bought.len() {
        let stock: f64 = m.stock.iter().map(|s| s[g]).sum();
        assert!(stock <= (m.start_stock[g] + m.bought[g]) * (1.0 + 1e-12));
    }
}

#[test]
fn a_day_without_exports_has_real_exports_of_zero() {
    // the port divides by the mean price paid for exports; its own rule always exports, the merchants may not
    let mut all = cities(&[1, 2]);
    for o in all.merchants.orders.iter_mut().flatten() {
        o.fill(0.0); // nothing is ordered for the first period
    }
    all.step(1);
    for e in &all.cities {
        let (r, d) = (&e.model.rotw, &e.model.data);
        assert_eq!(r.C_E, 0.0);
        assert_eq!(r.C_l, 0.0);
        // the port keeps the row of the period just computed
        assert_eq!(d.real_exports, [0.0]);
        assert_eq!(d.nominal_exports, [0.0]);
        assert!(d.real_gdp[0].is_finite() && d.real_gdp[0] > 0.0);
        assert!(d.real_imports[0] > 0.0); // the stalls were full
        // without orders the mix of the exports stays that of the calibration
        assert_eq!(e.model.prop.c_E_g, AUSTRIA2010Q1.parameters.c_E_g);
    }
    assert_books(&all, "day 1");
    // after the first day of sales the merchants order
    assert!(all.merchants.orders.iter().flatten().flatten().sum::<f64>() > 0.0);
}

#[test]
fn the_merchants_order_what_a_stall_will_lack_after_one_more_day() {
    let mut all = cities(&[1, 2, 3]);
    all.step(5);
    let m = &all.merchants;
    let mut ordered_something = false;
    for d in 0..3 {
        let e = &all.cities[d];
        let (r, p) = (&e.model.rotw, &e.model.prop);
        let keep = m.share[d] * e.figures()[1] / e.model.ext.window as f64;
        for g in 0..p.G {
            assert_eq!(m.orders[d][d][g], 0.0); // no city orders from itself
            let ordered: f64 = (0..3).map(|c| m.orders[c][d][g]).sum();
            // the stall sold this part of what it offered today, and is expected to sell it of its stock tomorrow
            let sells = if r.Y_m[g] > 0.0 { r.Q_m[g] / r.Y_m[g] } else { 1.0 };
            let missing = p.c_I_g[g] * keep - (1.0 - sells) * m.stock[d][g];
            if missing > 0.0 {
                ordered_something = true;
                assert!((ordered - missing).abs() <= 1e-12 * missing, "city {d}, product {g}: ordered {ordered}, missing {missing}");
            } else {
                assert_eq!(ordered, 0.0);
            }
        }
    }
    assert!(ordered_something);
}

#[test]
fn a_stall_is_full_again_the_morning_after_next_when_the_orders_are_filled() {
    // what is on offer in a city the morning after next is the stock to keep, minus what the merchants ordered and
    // did not get, plus what the stall sold less of its stock than the day before
    let mut all = cities(&[21, 22, 23]);
    all.step(4);
    let (mut filled, mut short) = (0, 0);
    for day in 5..=12 {
        let then = all.clone(); // the evening of the day before: the orders are placed
        all.step(1);
        // the part of its orders that every city of origin filled
        let fill: Vec<f64> = (0..3)
            .map(|c| {
                let (r, ordered) = (&all.cities[c].model.rotw, then.merchants.orders[c].iter().flatten().sum::<f64>());
                if ordered > 0.0 { r.C_l / r.P_l / ordered } else { 1.0 }
            })
            .collect();
        for d in 0..3 {
            let (e, r) = (&then.cities[d], &all.cities[d].model.rotw);
            let keep = then.merchants.share[d] * e.figures()[1] / e.model.ext.window as f64;
            for g in 0..e.model.prop.G {
                let to_keep = e.model.prop.c_I_g[g] * keep;
                let offered = then.merchants.stock[d][g];
                if to_keep == 0.0 || offered == 0.0 || (0..3).all(|c| then.merchants.orders[c][d][g] == 0.0) {
                    continue;
                }
                let before = &e.model.rotw;
                let sold_then = if before.Y_m[g] > 0.0 { before.Q_m[g] / before.Y_m[g] } else { 1.0 };
                let sold_now = r.Q_m[g] / offered;
                let not_filled: f64 = (0..3).map(|c| then.merchants.orders[c][d][g] * (1.0 - fill[c])).sum();
                let expected = to_keep - not_filled + (sold_then - sold_now) * offered;
                let stock = all.merchants.stock[d][g];
                assert!((stock - expected).abs() <= 1e-9 * to_keep, "day {day}, city {d}, product {g}: {stock} against {expected}");
                if not_filled.abs() <= 1e-9 * to_keep && sold_then == sold_now {
                    filled += 1;
                    assert!((stock / to_keep - 1.0).abs() < 1e-9);
                } else {
                    short += 1;
                }
            }
        }
    }
    assert!(filled + short > 100, "{filled} stalls full, {short} not");
}

#[test]
fn the_merchants_pick_among_the_firms_of_the_other_cities_as_a_buyer_of_the_port_does() {
    let mut all = cities(&[1, 2, 3]);
    all.step(5);
    // city 0 orders product g from 1 and 2: every firm of the product there has the weight of a seller of the
    // port, half by its price and half by what it offers, and a city has the weights of its firms
    let g = (0..all.cities[0].model.prop.G).find(|&g| all.merchants.orders[1][0][g] > 0.0).expect("an order of city 0");
    let m = &all.merchants;
    let base = m.orders[1][0][g] / (m.orders[1][0][g] + m.orders[2][0][g]);
    assert!(base > 0.0 && base < 1.0);
    let firms = |e: &Economy| -> Vec<usize> { (0..e.model.firms.len()).filter(|&i| e.model.firms.G_i[i] == g).collect() };
    let cheap = |e: &Economy| -> f64 { firms(e).iter().map(|&i| libm::exp(-2.0 * e.model.firms.P_i[i])).sum() };
    let offer = |e: &Economy| -> f64 { firms(e).iter().map(|&i| e.model.firms.Y_i[i] + e.model.firms.S_i[i]).sum() };
    let (one, two) = (&all.cities[1], &all.cities[2]);
    let expected = 0.5 * cheap(one) / (cheap(one) + cheap(two)) + 0.5 * offer(one) / (offer(one) + offer(two));
    assert!((base - expected).abs() < 1e-12, "{base} against {expected}");
    let w = origins(&all.cities, 0, g);
    assert_eq!(w[0], 0.0);
    assert!((w.iter().sum::<f64>() - 1.0).abs() < 1e-12);
    assert!((w[1] - base).abs() < 1e-12);

    // the product dearer in city 1: its part of an order falls; its firms offering more: it rises
    let mut dear = all.clone();
    for i in firms(&all.cities[1]) {
        dear.cities[1].model.firms.P_i[i] *= 1.5;
    }
    assert!(origins(&dear.cities, 0, g)[1] < w[1]);
    let mut more = all.clone();
    for i in firms(&all.cities[1]) {
        more.cities[1].model.firms.Y_i[i] *= 2.0;
    }
    assert!(origins(&more.cities, 0, g)[1] > w[1]);

    // what a city has sold does not count: with the sales of city 1 halved its part is the same
    let mut slump = all.clone();
    for row in &mut slump.cities[1].model.ext.accounts {
        row[0] *= 0.5;
    }
    assert_eq!(origins(&slump.cities, 0, g), w);

    // firms that are alike count one by one: a city with a third of the firms gets a third of the part
    let mut alike = all.clone();
    for e in &mut alike.cities {
        for i in firms(e) {
            (e.model.firms.P_i[i], e.model.firms.Y_i[i], e.model.firms.S_i[i]) = (1.0, 1.0, 0.0);
        }
    }
    let other = (0..all.cities[0].model.prop.G).find(|&h| h != g).unwrap();
    let of_two = firms(&alike.cities[2]);
    let keep = of_two.len() / 3;
    assert!(keep > 0);
    for &i in &of_two[keep..] {
        alike.cities[2].model.firms.G_i[i] = other;
    }
    let w = origins(&alike.cities, 0, g);
    let n = firms(&alike.cities[1]).len() as f64;
    assert!((w[2] / w[1] - keep as f64 / n).abs() < 1e-12, "{} against {}", w[2] / w[1], keep as f64 / n);

    // with two cities the other one gets the whole order; a product that no other city makes is not ordered
    assert_eq!(origins(&all.cities[..2], 0, g), vec![0.0, 1.0]);
    let mut none = all.clone();
    for c in 1..3 {
        for i in firms(&all.cities[c]) {
            none.cities[c].model.firms.G_i[i] = other;
        }
    }
    assert_eq!(origins(&none.cities, 0, g), vec![0.0; 3]);
}

#[test]
fn the_order_of_the_cities_changes_nothing() {
    let mut ab = Cities::new(vec![city(8, 3, 4), city(9, 3, 4)]).unwrap();
    let mut ba = Cities::new(vec![city(9, 3, 4), city(8, 3, 4)]).unwrap();
    ab.step(7);
    ba.step(7);
    assert_eq!(ab.cities[0].save(), ba.cities[1].save());
    assert_eq!(ab.cities[1].save(), ba.cities[0].save());
    assert_eq!(ab.merchants.stock[0], ba.merchants.stock[1]);
    assert_eq!(ab.merchants.orders[0][1], ba.merchants.orders[1][0]);
}

#[test]
fn a_city_among_cities_is_another_economy_than_on_its_own() {
    let mut all = cities(&[4, 5]);
    let mut alone = city(4, 3, 4);
    all.step(3);
    alone.step(3);
    assert_ne!(all.cities[0].save(), alone.save());
    // but the same agents: trade changes what they do, not who they are
    assert_eq!(all.cities[0].model.firms.len(), alone.model.firms.len());
    assert_eq!(all.cities[0].model.w_act.len(), alone.model.w_act.len());
}

#[test]
fn the_same_cities_give_the_same_days() {
    let (mut a, mut b) = (cities(&[1, 2, 3]), cities(&[1, 2, 3]));
    a.step(6);
    for _ in 0..6 {
        b.step(1); // one call for many periods equals many calls
    }
    assert_eq!(a.save(), b.save());
    let mut other = cities(&[1, 2, 4]);
    other.step(6);
    assert_ne!(other.save(), a.save());
    // a city with another seed changes the others too, through the merchants
    assert_ne!(other.cities[0].save(), a.cities[0].save());
}

#[test]
fn cities_load_bit_for_bit_and_continue_as_a_straight_run() {
    let mut straight = cities(&[10, 11, 12]);
    assert_eq!(Cities::load(&straight.save()).unwrap(), straight); // the starting position
    straight.step(9);
    let mut first = cities(&[10, 11, 12]);
    first.step(4); // in the middle of a plan and of a window, with orders placed and goods bought
    let bytes = first.save();
    let mut second = Cities::load(&bytes).unwrap();
    assert_eq!(second, first);
    assert_eq!(second.save(), bytes);
    second.step(5);
    assert_eq!(second.save(), straight.save());
    assert_books(&second, "day 9 after loading");
}

#[test]
fn broken_bytes_are_refused() {
    let mut all = cities(&[1, 2]);
    all.step(2);
    let bytes = all.save();
    let refused = |b: &[u8]| Cities::load(b).unwrap_err();
    assert!(refused(&[]).contains("ends at byte 0"));
    assert!(refused(&all.cities[0].save()).contains("not the state of cities")); // one economy is not cities
    assert!(Economy::load(&bytes).unwrap_err().contains("not the state of an economy"));
    let mut other = bytes.clone();
    other[4] = 9;
    assert!(refused(&other).contains("format 9"));
    // the last byte says whether there are routes; the list before it is one byte short without the last two
    assert!(refused(&bytes[..bytes.len() - 1]).contains("ends at byte"));
    assert!(refused(&bytes[..bytes.len() - 2]).contains("does not fit the rest of the state"));
    assert!(refused(&bytes[..bytes.len() / 2]).contains("ends at byte"));
    let mut longer = bytes.clone();
    longer.push(0);
    assert!(refused(&longer).contains("1 bytes are left over"));
    // a city that is broken is named
    let mut broken = bytes.clone();
    broken[16] ^= 0xff; // the tag of the first city
    assert!(refused(&broken).contains("city 0"));
    // books that do not fit the cities: one product too few in a stall
    let mut short = all.clone();
    short.merchants.stock[1].pop();
    assert!(refused(&short.save()).contains("do not fit 2 cities"));
    let mut short = all.clone();
    short.merchants.orders.pop();
    assert!(refused(&short.save()).contains("do not fit 2 cities"));
}

#[test]
fn cities_that_cannot_trade_are_refused() {
    assert!(Cities::new(vec![city(1, 3, 4)]).unwrap_err().contains("trade needs two"));
    assert!(Cities::new(vec![]).unwrap_err().contains("trade needs two"));
    let mut late = city(2, 3, 4);
    late.step(1);
    assert!(Cities::new(vec![city(1, 3, 4), late]).unwrap_err().contains("city 1 has computed 1 periods"));
    assert!(Cities::new(vec![city(1, 3, 4), city(2, 1, 1)]).unwrap_err().contains("another clock"));
}
