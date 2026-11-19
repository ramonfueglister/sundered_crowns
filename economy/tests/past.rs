//! The past in a fixed size (src/past.rs) in a whole economy: the same economy as with the whole past up to rounding,
//! a state that stops growing, and the way from a state that kept the whole past. The calibration is the port's own
//! data set for Austria (2010Q1).
#![allow(non_snake_case)]

use beforeit::AUSTRIA2010Q1;
use sc_economy::Economy;
use sc_economy::state::FORMAT;

fn austria(seed: u64, plan: usize, window: usize) -> Economy {
    Economy::new(
        &AUSTRIA2010Q1.parameters.to_json(),
        &AUSTRIA2010Q1.initial_conditions.to_json(),
        seed,
        plan,
        window,
    )
    .unwrap()
}

fn close(a: f64, b: f64, tolerance: f64, what: &str) {
    assert!((a - b).abs() <= tolerance * (1.0 + b.abs()), "{what}: {a} against {b}");
}

#[test]
fn an_economy_with_a_past_of_a_fixed_size_expects_what_the_whole_past_gives() {
    for (plan, window) in [(1, 1), (5, 4)] {
        let (mut whole, mut fixed) = (austria(3, plan, window), austria(3, plan, window).with_bounded_past());
        let mut compared = 0;
        for t in 1..=8 {
            whole.step(1);
            fixed.step(1);
            assert_eq!(fixed.periods(), t);
            let (w, f) = (&whole.model, &fixed.model);
            // the port's count of periods and its lists stay where they were at the start
            assert_eq!(
                (f.agg.t, f.agg.Y.len(), f.agg.pi_.len()),
                (1, f.prop.T_prime, f.prop.T_prime)
            );
            assert_eq!(f.agg.Y[..], w.agg.Y[..w.prop.T_prime]);
            // The expectations and the economy they lead to are the same up to rounding. Sooner or later a last
            // digit decides a single hiring or purchase; from then on the two draw other random numbers and are
            // two runs of the same rules, which no longer compare number by number.
            if fixed.rng != whole.rng {
                break;
            }
            compared += 1;
            let what = format!("plan {plan}, window {window}, period {t}");
            close(f.agg.Y_e, w.agg.Y_e, 1e-10, &format!("expected GDP, {what}"));
            close(f.agg.gamma_e, w.agg.gamma_e, 1e-10, &format!("expected growth, {what}"));
            close(f.agg.pi_e, w.agg.pi_e, 1e-10, &format!("expected inflation, {what}"));
            for (k, (a, b)) in fixed.figures().iter().zip(whole.figures()).enumerate() {
                close(*a, b, 1e-10, &format!("key figure {k}, {what}"));
            }
            // the firms plan on the same days
            let planned = |e: &Economy| e.model.ext.periods.iter().filter(|&&p| p == 0).count();
            assert_eq!(planned(&fixed), planned(&whole), "{what}");
        }
        assert!(
            compared >= 4,
            "plan {plan}, window {window}: only {compared} periods before the two runs part"
        );
    }
}

#[test]
fn the_state_stops_growing() {
    let (mut whole, mut fixed) = (austria(5, 5, 4), austria(5, 5, 4).with_bounded_past());
    whole.step(6);
    fixed.step(6);
    let (w6, f6) = (whole.save().len(), fixed.save().len());
    whole.step(14);
    fixed.step(14);
    assert_eq!(fixed.save().len(), f6);
    assert_eq!(whole.save().len(), w6 + 14 * 16); // real GDP and inflation of every period
}

#[test]
fn a_state_with_a_past_of_a_fixed_size_loads_bit_for_bit_and_continues_as_a_straight_run() {
    let mut straight = austria(9, 5, 4).with_bounded_past();
    straight.step(3);
    let bytes = straight.save();
    let mut back = Economy::load(&bytes).unwrap();
    assert_eq!(back.model, straight.model);
    assert_eq!(back.save(), bytes);
    straight.step(7);
    back.step(7);
    assert_eq!(back.save(), straight.save());
    assert_eq!(back.periods(), 10);
}

#[test]
fn an_economy_that_kept_the_whole_past_goes_over_on_any_day() {
    // computed with the whole past, then the same economy once on with the whole past and once with the fixed size
    let mut whole = austria(4, 5, 4);
    whole.step(11);
    let mut fixed = Economy::load(&whole.save()).unwrap().with_bounded_past();
    assert_eq!(fixed.periods(), 11);
    assert_eq!(fixed.figures(), whole.figures());
    assert_eq!(fixed.agents(), whole.agents());
    whole.step(1);
    fixed.step(1);
    assert_eq!(fixed.periods(), 12);
    close(
        fixed.model.agg.Y_e,
        whole.model.agg.Y_e,
        1e-9,
        "expected GDP of the first period after",
    );
    close(
        fixed.model.agg.pi_e,
        whole.model.agg.pi_e,
        1e-9,
        "expected inflation of the first period after",
    );
    // the same again changes nothing
    let twice = Economy::load(&fixed.save()).unwrap().with_bounded_past();
    assert_eq!(twice.save(), fixed.save());
}

#[test]
fn a_state_of_format_5_is_read_and_keeps_the_whole_past() {
    // format 5 is format 11 without the owners' profits at its end (for none, five numbers of 0), without the working
    // days before them (for none, seven numbers of 0 and then the days worked by every firm since its last plan),
    // without the owners' rule before them (a byte), without the crown's rule and outlays before it (a byte and a
    // number), without the two numbers of the spending out of savings before them and without the byte before those,
    // which says whether the past has a fixed size
    let mut e = austria(6, 5, 4);
    e.step(3);
    let mut bytes = e.save();
    let firms = e.model.firms.len();
    assert_eq!(bytes.split_off(bytes.len() - 20), [0u8; 20]);
    let worked = bytes.split_off(bytes.len() - 4 - 8 * firms);
    assert_eq!(worked[..4], (firms as u32).to_le_bytes());
    assert_eq!(bytes.split_off(bytes.len() - 28), [0u8; 28]);
    assert_eq!(bytes.pop(), Some(0));
    let crown = bytes.split_off(bytes.len() - 9);
    assert_eq!(crown, [&[0u8][..], &0f64.to_le_bytes()].concat());
    let tail = bytes.split_off(bytes.len() - 16);
    assert_eq!(tail, [0f64.to_le_bytes(), (-1f64).to_le_bytes()].concat());
    assert_eq!(bytes.pop(), Some(0));
    assert_eq!(bytes[4..8], FORMAT.to_le_bytes());
    bytes[4..8].copy_from_slice(&5u32.to_le_bytes());
    let mut back = Economy::load(&bytes).unwrap();
    assert_eq!(back.model, e.model);
    e.step(5);
    back.step(5);
    assert_eq!(back.save(), e.save());
}
