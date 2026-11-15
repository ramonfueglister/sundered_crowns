//! The shell against the port used directly, and the state as bytes. The calibration is the port's own data set
//! for Austria (2010Q1), so these tests need nothing from the game.
#![allow(non_snake_case)]

use beforeit::{AUSTRIA2010Q1, Model, Xoshiro};
use sc_economy::Economy;

fn austria(seed: u64) -> Economy {
    Economy::new(&AUSTRIA2010Q1.parameters.to_json(), &AUSTRIA2010Q1.initial_conditions.to_json(), seed).unwrap()
}

#[test]
fn the_shell_computes_what_the_port_computes() {
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
    assert_eq!(e.model, model);
    assert_eq!(e.rng, rng);
    assert_eq!(e.periods(), 8);
    assert_eq!(e.figures()[1].to_bits(), model.data.real_gdp[8].to_bits());
}

#[test]
fn a_state_loads_bit_for_bit() {
    let mut e = austria(1);
    assert_eq!(Economy::load(&e.save()).unwrap(), e); // the starting position
    e.step(3);
    let bytes = e.save();
    let back = Economy::load(&bytes).unwrap();
    assert_eq!(back, e);
    assert_eq!(back.save(), bytes);
    assert_eq!(bytes, e.save()); // the same state gives the same bytes
}

#[test]
fn save_load_continue_equals_a_straight_run() {
    let mut straight = austria(2026);
    straight.step(6);
    let mut first = austria(2026);
    first.step(2);
    let mut second = Economy::load(&first.save()).unwrap();
    second.step(4);
    assert_eq!(second.save(), straight.save());
    // another seed is another economy
    let mut other = austria(2027);
    other.step(6);
    assert_ne!(other.save(), straight.save());
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
}

#[test]
fn the_books_balance() {
    let mut e = austria(1);
    e.step(8);
    let [income, nominal, real, central_bank, banks, gdp] = e.checks();
    for (name, v) in [("income", income), ("nominal", nominal), ("real", real), ("central bank", central_bank), ("banks", banks)] {
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
    assert_eq!(f[1], d.real_gdp[2]);
    assert_eq!(f[2], d.real_gdp[0]);
    assert_eq!(f[3], d.nominal_gdp[2]);
    assert_eq!(f[4], d.nominal_gdp[0]);
    assert_eq!(f[5], d.real_household_consumption[2]);
    assert_eq!(f[6], d.real_government_consumption[2]);
    assert_eq!(f[7], d.real_fixed_capitalformation[2]);
    assert_eq!(f[8], d.real_exports[2]);
    assert_eq!(f[9], d.real_imports[2]);
    // every active person is an employee, an owner or without work
    assert_eq!((f[10] + f[11] + f[12]) as usize, m.prop.H_act);
    let employees: i64 = m.firms.N_i.iter().sum();
    assert_eq!(f[10] as i64, employees);
}
