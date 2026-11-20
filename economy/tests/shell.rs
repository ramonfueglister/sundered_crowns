//! The shell against the port used directly, the daily clock, and the state as bytes. The calibration is the port's
//! own data set for Austria (2010Q1), so these tests need nothing from the game.
#![allow(non_snake_case)]

use beforeit::{AUSTRIA2010Q1, Model, Xoshiro};
use sc_economy::Economy;

/// Austria with a plan every `plan` periods and windows of `window` periods.
fn austria_with(seed: u64, plan: usize, window: usize) -> Economy {
    Economy::new(
        &AUSTRIA2010Q1.parameters.to_json(),
        &AUSTRIA2010Q1.initial_conditions.to_json(),
        seed,
        plan,
        window,
    )
    .unwrap()
}

/// Austria as the port computes it: every firm plans in every period, expectations on single periods.
fn austria(seed: u64) -> Economy {
    austria_with(seed, 1, 1)
}

#[test]
fn with_a_plan_and_a_window_of_one_period_the_shell_computes_what_the_port_computes() {
    let mut rng = Xoshiro::seed_from_u64(7);
    let mut model = Model::new(&AUSTRIA2010Q1.parameters, &AUSTRIA2010Q1.initial_conditions, &mut rng).unwrap();
    model.run(8, &mut rng);

    // the shell, one period at a time, through bytes between any two periods (as the world server does)
    let mut state = austria(7).save();
    for _ in 0..8 {
        let mut e = Economy::load(&state).unwrap();
        e.step(1);
        state = e.save();
    }
    let e = Economy::load(&state).unwrap();
    let m = &e.model;
    assert_eq!(m.w_act, model.w_act);
    assert_eq!(m.w_inact, model.w_inact);
    assert_eq!(m.firms, model.firms);
    assert_eq!(m.banks, model.banks);
    assert_eq!(m.cb, model.cb);
    assert_eq!(m.gov, model.gov);
    assert_eq!(m.rotw, model.rotw);
    assert_eq!(m.agg, model.agg);
    assert_eq!(m.prop, model.prop);
    assert_eq!(e.rng, rng);
    assert_eq!(e.periods(), 8);
    // of the national accounts the shell keeps the last row (a window of one period)
    assert_eq!(m.data.real_gdp.len(), 1);
    assert_eq!(m.data.real_gdp[0].to_bits(), model.data.real_gdp[8].to_bits());
    assert_eq!(m.data.nominal_sector_gva[0], model.data.nominal_sector_gva[8]);
    assert_eq!(m.data.equity_per_bank[0], model.data.equity_per_bank[8]);
    assert_eq!(e.figures()[1].to_bits(), model.data.real_gdp[8].to_bits());
    assert_eq!(e.figures()[2].to_bits(), model.data.real_gdp[0].to_bits());
}

#[test]
fn a_firm_sets_supply_and_price_only_on_its_plan_day() {
    let mut e = austria_with(11, 5, 4);
    e.step(1); // every firm plans in the first period
    let I = e.model.firms.len();
    let (mut planned, mut kept) = (0, 0);
    for t in 2..=11 {
        let (supply, price) = (e.model.firms.Q_s_i.clone(), e.model.firms.P_i.clone());
        assert_eq!(e.model.agg.t, t);
        e.step(1);
        for i in 0..I {
            if e.model.ext.plans(i, t) {
                planned += 1;
                assert_eq!(e.model.ext.periods[i], 0);
                assert_eq!(e.model.ext.demand[i], 0.0);
            } else {
                kept += 1;
                assert_eq!(
                    e.model.firms.Q_s_i[i].to_bits(),
                    supply[i].to_bits(),
                    "firm {i} in period {t}"
                );
                assert_eq!(
                    e.model.firms.P_i[i].to_bits(),
                    price[i].to_bits(),
                    "firm {i} in period {t}"
                );
                assert!(e.model.ext.periods[i] >= 1 && e.model.ext.periods[i] < 5);
            }
        }
        // prices move in every period although most firms keep theirs
        assert!((0..I).any(|i| e.model.firms.P_i[i] != price[i]));
    }
    assert_eq!(planned, 2 * I); // ten periods, a plan every five
    assert_eq!(kept, 8 * I);
    // the books of the port balance under the clock as well
    let [income, nominal, real, central_bank, banks, gdp] = e.checks();
    for (name, v) in [
        ("income", income),
        ("nominal", nominal),
        ("real", real),
        ("central bank", central_bank),
        ("banks", banks),
    ] {
        assert!((v / gdp).abs() < 1e-9, "{name}: {v} against a GDP of {gdp}");
    }
}

#[test]
fn a_planning_firm_supplies_the_mean_demand_since_its_last_plan() {
    let mut e = austria_with(3, 4, 4);
    e.step(1);
    let i = 2; // plans in the periods 1, 3, 7, …
    assert!(e.model.ext.plans(i, 3) && e.model.ext.plans(i, 7) && !(4..7).any(|t| e.model.ext.plans(i, t)));
    e.step(2);
    let mut demand = 0.0;
    for _ in 0..4 {
        demand += e.model.firms.Q_d_i[i]; // the demand of the periods 3, 4, 5 and 6
        e.step(1);
    }
    assert_eq!(e.model.agg.t, 8); // period 7 is computed
    // the expected growth per period is that of period 7, compounded over the four periods of the plan
    let growth = (1.0 + e.model.agg.gamma_e).powi(4);
    let supply = demand / 4.0 * growth;
    assert!(
        (e.model.firms.Q_s_i[i] / supply - 1.0).abs() < 1e-12,
        "{} against {supply}",
        e.model.firms.Q_s_i[i]
    );
}

#[test]
fn the_clock_keeps_one_window_of_the_series_that_the_figures_sum() {
    let mut e = austria_with(1, 2, 4);
    assert_eq!((e.model.ext.accounts.len(), e.model.data.real_gdp.len()), (1, 1));
    let start = e.figures();
    assert_eq!(start[0], 0.0);
    assert_eq!(start[1], 4.0 * e.model.data.real_gdp[0]); // the starting position stands for the periods before
    assert_eq!(start[1], start[2]);
    assert_eq!(start[3], start[4]);
    assert_eq!(start[15], 1.0); // the price level of the starting position
    let column = |e: &Economy, k: usize| e.model.ext.accounts.iter().map(|r| r[k]).collect::<Vec<f64>>();
    e.step(3);
    let rows = column(&e, 0);
    assert_eq!(rows.len(), 4); // the starting position and three periods
    assert_eq!(e.figures()[1], rows[0] + (rows[1] + rows[2] + rows[3]));
    assert_eq!(e.figures()[2], start[2]);
    e.step(1);
    assert_eq!(e.model.ext.accounts.len(), 4); // the starting position has left
    e.step(6);
    // the port keeps its last row, in every series
    let d = &e.model.data;
    assert_eq!(d.real_gdp.len(), 1);
    assert_eq!(d.collection_time.len(), 1);
    assert_eq!(d.nominal_sector_gva.len(), 1);
    assert_eq!(d.roe_per_bank.len(), 1);
    assert_eq!(e.model.ext.accounts.len(), 4);
    assert_eq!(
        e.model.ext.accounts[3],
        [
            d.real_gdp[0],
            d.nominal_gdp[0],
            d.real_household_consumption[0],
            d.real_government_consumption[0],
            d.real_fixed_capitalformation[0],
            d.real_exports[0],
            d.real_imports[0],
        ]
    );
    let f = e.figures();
    assert_eq!(f[0], 10.0);
    assert_eq!(f[2], start[2]); // the starting position is remembered
    assert_eq!(f[4], start[4]);
    for (figure, k) in [(1, 0), (3, 1), (5, 2), (6, 3), (7, 4), (8, 5), (9, 6)] {
        assert_eq!(f[figure], column(&e, k).iter().sum::<f64>());
    }
    assert_eq!(f[15], e.model.agg.P_bar);
    // one call for many periods equals many calls
    let mut other = austria_with(1, 2, 4);
    other.step(10);
    assert_eq!(other.save(), e.save());
}

#[test]
fn a_state_loads_bit_for_bit() {
    for (plan, window) in [(1, 1), (3, 4)] {
        let mut e = austria_with(1, plan, window);
        assert_eq!(Economy::load(&e.save()).unwrap(), e); // the starting position
        e.step(5);
        let bytes = e.save();
        let back = Economy::load(&bytes).unwrap();
        assert_eq!(back, e);
        assert_eq!(back.save(), bytes);
        assert_eq!(bytes, e.save()); // the same state gives the same bytes
        assert_eq!((back.model.ext.plan, back.model.ext.window), (plan, window));
    }
}

#[test]
fn save_load_continue_equals_a_straight_run() {
    for (plan, window) in [(1, 1), (3, 4)] {
        let mut straight = austria_with(2026, plan, window);
        straight.step(8);
        let mut first = austria_with(2026, plan, window);
        first.step(2); // in the middle of a plan and of a window
        let mut second = Economy::load(&first.save()).unwrap();
        second.step(6);
        assert_eq!(second.save(), straight.save());
        // another seed is another economy
        let mut other = austria_with(2027, plan, window);
        other.step(8);
        assert_ne!(other.save(), straight.save());
    }
    // and another clock is another economy
    let (mut a, mut b) = (austria_with(5, 1, 1), austria_with(5, 3, 1));
    a.step(4);
    b.step(4);
    assert_ne!(a.model.firms.P_i, b.model.firms.P_i);
}

#[test]
fn agents_that_were_removed_keep_their_places() {
    // the port removes and adds agents by ID (src/agents.rs); from the first removal on it keeps the position of
    // every ID in a hash map, which has no order of its own
    let mut e = austria(1);
    e.model.firms.delete(3);
    e.model.w_act.delete(10);
    e.model.w_act.delete(0);
    assert!(!e.model.firms.id_to_index.is_empty());
    let bytes = e.save();
    let back = Economy::load(&bytes).unwrap();
    assert_eq!(back, e);
    assert_eq!(back.save(), bytes);
    assert_eq!(back.model.firms.index(e.model.firms.ID[3]), 3);
}

#[test]
#[should_panic(expected = "the daily clock holds")]
fn the_clock_stops_when_it_does_not_hold_every_firm() {
    let mut e = austria(1);
    e.model.ext.demand.pop();
    e.step(1);
}

#[test]
fn not_a_number_survives() {
    let mut e = austria(1);
    e.model.agg.pi_e = f64::NAN;
    e.model.firms.P_i[0] = f64::NEG_INFINITY;
    let bytes = e.save();
    let back = Economy::load(&bytes).unwrap();
    assert!(back.model.agg.pi_e.is_nan());
    assert_eq!(back.model.firms.P_i[0], f64::NEG_INFINITY);
    assert_eq!(back.save(), bytes);
}

#[test]
fn broken_bytes_are_refused() {
    let bytes = austria(1).save();
    assert!(Economy::load(&[]).is_err());
    assert!(Economy::load(b"nope").is_err());
    assert!(Economy::load(&bytes[..bytes.len() - 1]).is_err()); // cut short
    assert!(Economy::load(&bytes[..bytes.len() / 2]).is_err());
    let mut longer = bytes.clone();
    longer.push(0);
    assert!(Economy::load(&longer).is_err()); // bytes left over
    let mut other_format = bytes.clone();
    other_format[4] = 99;
    assert!(Economy::load(&other_format).unwrap_err().contains("format 99"));
    let mut huge_list = bytes.clone();
    huge_list[45..49].copy_from_slice(&0xffff_fff0u32.to_le_bytes()); // a length far beyond the state
    assert!(Economy::load(&huge_list).is_err());
    assert!(
        Economy::new(
            &AUSTRIA2010Q1.parameters.to_json(),
            &AUSTRIA2010Q1.initial_conditions.to_json(),
            1,
            0,
            1
        )
        .is_err()
    );
}

#[test]
fn the_books_balance() {
    let mut e = austria(1);
    e.step(8);
    let [income, nominal, real, central_bank, banks, gdp] = e.checks();
    for (name, v) in [
        ("income", income),
        ("nominal", nominal),
        ("real", real),
        ("central bank", central_bank),
        ("banks", banks),
    ] {
        assert!((v / gdp).abs() < 1e-9, "{name}: {v} against a GDP of {gdp}");
    }
}

#[test]
fn the_figures_are_those_of_the_model() {
    let mut e = austria(1);
    let start = e.figures();
    assert_eq!(start[0], 0.0);
    assert_eq!(start[1], start[2]); // real GDP is that of the starting position
    e.step(2);
    let f = e.figures();
    let (m, d) = (&e.model, &e.model.data);
    assert_eq!(f[0], 2.0);
    assert_eq!(f[1], d.real_gdp[0]); // a window of one period: the last row
    assert_eq!(f[2], start[1]);
    assert_eq!(f[3], d.nominal_gdp[0]);
    assert_eq!(f[4], start[3]);
    assert_eq!(f[5], d.real_household_consumption[0]);
    assert_eq!(f[6], d.real_government_consumption[0]);
    assert_eq!(f[7], d.real_fixed_capitalformation[0]);
    assert_eq!(f[8], d.real_exports[0]);
    assert_eq!(f[9], d.real_imports[0]);
    // every active person is an employee, an owner or without work
    assert_eq!((f[10] + f[11] + f[12]) as usize, m.prop.H_act);
    let employees: i64 = m.firms.N_i.iter().sum();
    assert_eq!(f[10] as i64, employees);
}

#[test]
fn a_state_of_format_4_is_read_and_computes_on_bit_for_bit() {
    // tests/data/format4_city.bin was written by the engine of format 4 (main 2bf3210), which kept a window of all
    // the port's rows: the city of the game with the fewest persons, seed 7, a plan every 2 days and windows of 8,
    // wages in money and the demand pull, after 5 days. format4_city.txt holds what that engine computed, as the bits
    // of the numbers: the key figures of that state, the key figures 10 days later, and a mix of all numbers of the
    // persons and firms then.
    let bytes = include_bytes!("data/format4_city.bin");
    let mut lines = include_str!("data/format4_city.txt").lines().skip(1);
    let mut figures = || {
        lines
            .next()
            .unwrap()
            .split(' ')
            .map(|x| u64::from_str_radix(x, 16).unwrap())
            .collect::<Vec<u64>>()
    };
    let (then, later, agents) = (figures(), figures(), figures()[0]);
    let bits = |e: &Economy| e.figures().iter().map(|x| x.to_bits()).collect::<Vec<u64>>();
    let mix = |v: &[f64]| {
        v.iter().fold(0u64, |h, x| {
            (h.rotate_left(5) ^ x.to_bits()).wrapping_mul(0x9E37_79B9_7F4A_7C15)
        })
    };

    let mut e = Economy::load(bytes).unwrap();
    assert_eq!(e.periods(), 5);
    assert_eq!(e.model.ext.accounts.len(), 6); // the starting position and five days
    assert_eq!(e.model.data.real_gdp.len(), 1);
    assert_eq!(bits(&e), then);
    // saved again it is a smaller state of the format of today, and loads as the same economy
    let now = e.save();
    assert!(now.len() < bytes.len());
    assert_eq!(Economy::load(&now).unwrap(), e);
    e.step(10);
    assert_eq!(e.model.ext.accounts.len(), 8);
    assert_eq!(bits(&e), later);
    assert_eq!(mix(&e.agents()), agents);
}
