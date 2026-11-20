//! The workers who are away (economy feature 22, src/clock.rs `Absences`): on a day a worker is away, the labour of
//! the worker's firm is that of the workers who are there; the worker keeps the place and the wage, a firm that sold
//! all it had plans as if its workers had been there, and it does not buy again the materials they left unused.
//! Without absences
//! the economy computes as before, the absences are part of the state, a state of format 11 has none, and absences
//! that do not fit are refused. The calibration is the port's own data set for Austria (2010Q1), so these tests need
//! nothing from the game.
#![allow(non_snake_case)]

use beforeit::AUSTRIA2010Q1;
use sc_economy::Economy;
use sc_economy::clock::Absences;

/// Austria with a plan every 30 periods and windows of 365 periods, as the cities of the game, wages in money.
fn austria(seed: u64) -> Economy {
    Economy::new(
        &AUSTRIA2010Q1.parameters.to_json(),
        &AUSTRIA2010Q1.initial_conditions.to_json(),
        seed,
        30,
        365,
    )
    .unwrap()
    .with_wages_in_money()
}

fn bits(v: &[f64]) -> Vec<u64> {
    v.iter().map(|x| x.to_bits()).collect()
}

/// The employees of firm `i` (positions in the port's order of the workers).
fn employees(e: &Economy, i: usize) -> Vec<u32> {
    let m = &e.model;
    (0..m.w_act.len())
        .filter(|&h| m.w_act.O_h[h].map(|id| m.firms.index(id)) == Some(i))
        .map(|h| h as u32)
        .collect()
}

/// A firm with at least `n` employees whose output on the next day is bound by its labour.
fn firm_bound_by_labour(e: &Economy, n: usize) -> usize {
    let f = &e.model.firms;
    (0..f.len())
        .find(|&i| {
            let labour = f.N_i[i] as f64 * f.alpha_bar_i[i];
            f.N_i[i] as usize >= n
                && labour <= f.Q_s_i[i]
                && labour <= f.K_i[i] * f.kappa_i[i]
                && labour <= f.M_i[i] * f.beta_i[i]
        })
        .expect("a firm bound by its labour")
}

#[test]
fn without_absences_the_economy_computes_as_before() {
    let (mut a, mut b) = (austria(5), austria(5));
    b = b.with_absences(vec![], vec![], vec![]).unwrap();
    for day in 1..=20 {
        a.step(1);
        b.step(1);
        assert_eq!(bits(&a.figures()), bits(&b.figures()), "day {day}");
        assert_eq!(bits(&a.agents()), bits(&b.agents()), "day {day}");
    }
    assert_eq!(a.save(), b.save());
}

#[test]
fn a_firm_works_with_the_workers_who_are_there_and_pays_everybody() {
    let mut a = austria(7);
    a.step(3);
    let i = firm_bound_by_labour(&a, 4);
    let staff = employees(&a, i);
    // two of its workers are away on the next two days, counted from 0
    let mut b = a
        .clone()
        .with_absences(staff[..2].to_vec(), vec![0, 0], vec![1, 1])
        .unwrap();
    a.step(1);
    b.step(1);
    let (n, ya, yb) = (a.model.firms.N_i[i] as f64, a.model.firms.Y_i[i], b.model.firms.Y_i[i]);
    assert!(
        ((yb / ya) - (n - 2.0) / n).abs() < 1e-9,
        "the output of the day {yb} against {ya} with 2 of {n} workers away"
    );
    // the places stay, and those who are away are paid as those who are there
    assert_eq!(a.model.firms.N_i[i], b.model.firms.N_i[i]);
    let (wa, wb, rows) = (&a.model.w_act.w_h, &b.model.w_act.w_h, b.agents());
    for &h in &staff {
        let (h, row) = (h as usize, 4 + 5 * h as usize);
        assert_eq!(rows[row], i as f64, "the employer of worker {h}");
        assert_eq!(wb[h], wa[h], "the wage of worker {h}");
        assert!(wb[h] > 0.0);
    }
    assert_eq!(a.model.firms.w_i[i], b.model.firms.w_i[i]);
    assert_books(&b, "the day with two workers away");
}

fn assert_books(e: &Economy, at: &str) {
    let [income, nominal, real, central_bank, banks, gdp] = e.checks();
    for v in [income, nominal, real, central_bank, banks] {
        assert!((v / gdp).abs() < 1e-9, "{at}: the books are off by {v} against {gdp}");
    }
}

#[test]
fn a_firm_does_not_buy_again_the_materials_its_workers_who_were_away_left_unused() {
    let mut a = austria(7);
    a.step(3);
    let i = firm_bound_by_labour(&a, 4);
    let staff = employees(&a, i);
    // two of its workers away on the next day
    let mut b = a
        .clone()
        .with_absences(staff[..2].to_vec(), vec![0, 0], vec![0, 0])
        .unwrap();
    a.step(1);
    b.step(1);
    // the materials of the output it did not make (A.13: M β per unit) lie unused in its stock
    let (fa, fb) = (&a.model.firms, &b.model.firms);
    let unused = b.model.ext.unused[i];
    assert!(unused > 0.0);
    assert!((unused - (fa.Y_i[i] - fb.Y_i[i]) / fb.beta_i[i]).abs() <= 1e-12 * unused);
    // on the next day it buys that much less, against the same economy that forgot them
    let mut c = b.clone();
    c.model.ext.unused.iter_mut().for_each(|x| *x = 0.0);
    b.step(1);
    c.step(1);
    let (bought, port) = (b.model.firms.DM_d_i[i], c.model.firms.DM_d_i[i]);
    assert!((bought - (port - unused).max(0.0)).abs() <= 1e-12 * port);
    assert!((b.model.ext.unused[i] - (unused - port).max(0.0)).abs() <= 1e-12 * port);
}

#[test]
fn an_absence_holds_from_its_first_to_its_last_period() {
    // worker 0 of firm 0 and worker 2 of firm 1 away from period 4 to 5 and 5 to 7; worker 1 without work
    let a = Absences::new(3, vec![0, 2, 1], vec![4, 5, 4], vec![5, 7, 9]).unwrap();
    let employer = [Some(10), None, Some(11)];
    let index = |id: usize| id - 10;
    let away: Vec<Vec<u32>> = (3..=8).map(|t| a.of_firms(2, &employer, index, t)).collect();
    assert_eq!(
        away,
        [vec![0, 0], vec![1, 0], vec![1, 1], vec![0, 1], vec![0, 1], vec![0, 0]]
    );
}

#[test]
fn the_absences_and_the_unused_materials_are_part_of_the_state_and_a_state_of_format_11_has_none() {
    let mut a = austria(9);
    a.step(2);
    let staff = employees(&a, firm_bound_by_labour(&a, 2));
    let plain = a.save();
    a = a.with_absences(staff[..2].to_vec(), vec![0, 3], vec![5, 4]).unwrap();
    a.step(2);
    let mut b = Economy::load(&a.save()).unwrap();
    assert_eq!(a.save(), b.save());
    assert_eq!(a.model.ext.absences, b.model.ext.absences);
    assert_eq!(a.model.ext.absences.first, [3, 6]);
    assert_eq!(bits(&a.model.ext.unused), bits(&b.model.ext.unused));
    assert!(a.model.ext.unused.iter().any(|&x| x > 0.0));
    a.step(6);
    b.step(6);
    assert_eq!(a.save(), b.save());
    // format 11 is format 12 without the absences and the unused materials at its end (for none, two numbers of 0)
    let mut old = plain.clone();
    assert_eq!(old.split_off(old.len() - 8), [0u8; 8]);
    old[4..8].copy_from_slice(&11u32.to_le_bytes());
    let back = Economy::load(&old).unwrap();
    assert!(back.model.ext.absences.is_empty());
    assert_eq!(back.save(), plain);
}

#[test]
fn absences_that_do_not_fit_are_refused() {
    let e = austria(1);
    let workers = e.model.w_act.len() as u32;
    // a worker the economy does not have, a run of days that ends before it begins, lists of other lengths
    assert!(e.clone().with_absences(vec![workers], vec![0], vec![0]).is_err());
    assert!(e.clone().with_absences(vec![0], vec![2], vec![1]).is_err());
    assert!(e.clone().with_absences(vec![0, 1], vec![0], vec![0, 0]).is_err());
    assert!(e.clone().with_absences(vec![workers - 1], vec![0], vec![0]).is_ok());
    assert!(Absences::new(1, vec![0], vec![0], vec![0]).is_err());
}

#[test]
fn a_firm_that_sold_all_it_had_plans_as_if_its_workers_had_been_there() {
    let mut a = austria(11);
    a.step(3);
    // the firms of Austria sell all they have; every third gets a stock of a hundred days of its output
    for i in (0..a.model.firms.len()).step_by(3) {
        a.model.firms.S_i[i] = 100.0 * a.model.firms.Y_i[i];
    }
    let stock = a.model.firms.S_i.clone();
    // every other worker away on the next day
    let away: Vec<u32> = (0..a.model.w_act.len() as u32).step_by(2).collect();
    let n = away.len();
    let mut b = a.clone().with_absences(away, vec![0; n], vec![0; n]).unwrap();
    a.step(1);
    b.step(1);
    let (fa, fb) = (&a.model.firms, &b.model.firms);
    let (mut sold_out, mut not) = (0, 0);
    for i in 0..fa.len() {
        // the day before the market was the same in both: what a made is what b would have made with all its workers
        let lost = fa.Y_i[i] - fb.Y_i[i];
        let added = b.model.ext.demand[i] - a.model.ext.demand[i];
        assert_eq!(a.model.ext.worked[i], b.model.ext.worked[i], "firm {i}");
        if fb.Q_d_i[i] >= (fb.Y_i[i] + stock[i]) * (1.0 - 1e-12) {
            // it sold all it had: what its workers who were away would have made counts to the demand of its plan
            assert!(
                (added - lost).abs() <= 1e-9 * lost.max(1.0),
                "firm {i}: {added} added for {lost} lost"
            );
            sold_out += (lost > 0.0) as usize;
        } else {
            // it did not: what it sold is the demand, and the absences took nothing from it
            assert_eq!(added, 0.0, "firm {i}");
            not += (lost > 0.0) as usize;
        }
    }
    assert!(sold_out > 0 && not > 0, "{sold_out} firms sold out and {not} did not");
}

#[test]
fn a_firm_whose_workers_are_all_away_makes_nothing_and_goes_on_planning() {
    let mut a = austria(7);
    a.step(3);
    let i = firm_bound_by_labour(&a, 1);
    let staff = employees(&a, i);
    let n = staff.len();
    // everybody of the firm away for 40 days: more than a plan of 30 days
    let mut b = a.with_absences(staff, vec![0; n], vec![39; n]).unwrap();
    for day in 1..=40 {
        b.step(1);
        let f = &b.model.firms;
        assert_eq!(f.Y_i[i], 0.0, "day {day}");
        // it bought no materials for the days, and still pays the wage its workers' effort would earn
        assert!(f.w_i[i] > 0.0, "day {day}: the wage {}", f.w_i[i]);
        assert!(
            f.Q_s_i[i] > 0.0 && f.P_i[i] > 0.0,
            "day {day}: supply {} and price {}",
            f.Q_s_i[i],
            f.P_i[i]
        );
        assert!(b.figures().iter().all(|x| x.is_finite()), "day {day}");
    }
    b.step(1);
    assert!(b.model.firms.Y_i[i] > 0.0);
}
