//! The contracts of the workers (economy feature 23, src/workers.rs): a servant is paid in every period, a day
//! labourer only for the periods he works, at the wage times the factor of his firm's day; on a day on which workers
//! of a firm are away, workers without work who are not away themselves stand in for them, as far as there are any,
//! and are paid as day labourers; where the game says so, an adult of the worker's family stands in first (economy
//! feature 24), paid into the household of the worker who is away. The books balance, contracts with nobody away and
//! every day a mean day change nothing, the contracts and the family's stand-ins are part of the state, a state of
//! format 12 has no contracts and one of format 13 no family that stands in, and what does not fit is refused. The
//! calibration is the port's own data set for Austria (2010Q1), so these tests need nothing from the game.
#![allow(non_snake_case)]

use beforeit::AUSTRIA2010Q1;
use sc_economy::Economy;
use sc_economy::workers::{BY_THE_DAY, BY_THE_YEAR};

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

/// The workers without work.
fn without_work(e: &Economy) -> Vec<u32> {
    let w = &e.model.w_act;
    (0..w.len()).filter(|&h| w.O_h[h].is_none()).map(|h| h as u32).collect()
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

/// The wage of firm `i` in the last period after the taxes on wages, as a worker's income holds it (A.53).
fn net_wage(e: &Economy, i: usize) -> f64 {
    let m = &e.model;
    let p = &m.prop;
    m.firms.w_i[i] * (1.0 - p.tau_SIW - p.tau_INC * (1.0 - p.tau_SIW)) * m.agg.P_bar_HH
}

/// The income the port gives worker `h` for the last period (A.53, realised).
fn port_income(e: &Economy, h: usize) -> f64 {
    let m = &e.model;
    let (p, w) = (&m.prop, &m.w_act);
    let wage = if w.O_h[h].is_some() {
        w.w_h[h] * (1.0 - p.tau_SIW - p.tau_INC * (1.0 - p.tau_SIW))
    } else {
        p.theta_UB * w.w_h[h]
    };
    (wage + m.gov.sb_other) * m.agg.P_bar_HH
}

fn assert_books(e: &Economy, at: &str) {
    let [income, nominal, real, central_bank, banks, gdp] = e.checks();
    for v in [income, nominal, real, central_bank, banks] {
        assert!((v / gdp).abs() < 1e-9, "{at}: the books are off by {v} against {gdp}");
    }
}

fn close(a: f64, b: f64, at: &str) {
    assert!(
        (a - b).abs() <= 1e-9 * a.abs().max(b.abs()).max(1e-12),
        "{at}: {a} against {b}"
    );
}

#[test]
fn contracts_with_nobody_away_and_every_day_a_mean_day_change_nothing() {
    let (mut a, mut b) = (austria(5), austria(5));
    let workers: Vec<u32> = (0..b.model.w_act.len() as u32).step_by(2).collect();
    b = b.with_contracts(&workers).unwrap();
    for day in 1..=20 {
        a.step(1);
        b.step(1);
        assert_eq!(bits(&a.figures()), bits(&b.figures()), "day {day}");
        assert_eq!(bits(&a.agents()), bits(&b.agents()), "day {day}");
    }
}

#[test]
fn workers_without_work_stand_in_for_those_who_are_away() {
    let mut a = austria(7);
    a.step(3);
    let i = firm_bound_by_labour(&a, 4);
    let staff = employees(&a, i);
    assert!(without_work(&a).len() >= 2);
    // two of its workers away on the next day, with contracts (b) and without (c, economy feature 22 alone)
    let away = |e: Economy| e.with_absences(staff[..2].to_vec(), vec![0, 0], vec![0, 0]).unwrap();
    let mut b = away(a.clone().with_contracts(&[]).unwrap());
    let mut c = away(a.clone());
    a.step(1);
    b.step(1);
    c.step(1);
    let (ya, yb, yc) = (a.model.firms.Y_i[i], b.model.firms.Y_i[i], c.model.firms.Y_i[i]);
    // with the stand-ins the firm makes what it makes with all its workers, without them less
    close(yb, ya, "the output with two stand-ins");
    assert!(yc < ya);
    let today = &b.model.ext.today;
    assert_eq!(today.stand_ins[i], 2);
    assert_eq!((today.away, today.stood_in), (2, 2));
    assert!(
        b.model.ext.unused.iter().all(|&x| x == 0.0),
        "no materials were left unused"
    );
    // each stand-in is paid the firm's wage for the day on top of what the port gives him, and stays without work
    let stand_ins: Vec<usize> = today.pays.iter().filter(|p| p.firm == i).map(|p| p.worker).collect();
    assert_eq!(stand_ins.len(), 2);
    for &h in &stand_ins {
        assert!(b.model.w_act.O_h[h].is_none());
        close(
            b.model.w_act.Y_h[h],
            port_income(&b, h) + net_wage(&b, i),
            "the income of a stand-in",
        );
    }
    assert_books(&b, "the day with two stand-ins");
}

#[test]
fn a_day_labourer_is_paid_for_the_days_he_works_and_a_servant_for_every_day() {
    let mut a = austria(7);
    a.step(3);
    let i = firm_bound_by_labour(&a, 4);
    let staff = employees(&a, i);
    let (gone_by_day, there_by_day, gone_by_year) = (staff[0], staff[1], staff[2]);
    let mut b = a
        .with_contracts(&[gone_by_day, there_by_day])
        .unwrap()
        .with_absences(vec![gone_by_day, gone_by_year], vec![0, 0], vec![0, 0])
        .unwrap();
    assert_eq!(b.model.ext.contracts[gone_by_day as usize], BY_THE_DAY);
    assert_eq!(b.model.ext.contracts[gone_by_year as usize], BY_THE_YEAR);
    b.step(1);
    let y = |h: u32| b.model.w_act.Y_h[h as usize];
    // without working days every day is a mean day: the day labourer who is there gets the port's pay
    close(
        y(there_by_day),
        port_income(&b, there_by_day as usize),
        "the day labourer who is there",
    );
    close(
        y(gone_by_year),
        port_income(&b, gone_by_year as usize),
        "the servant who is away",
    );
    close(
        y(gone_by_day),
        port_income(&b, gone_by_day as usize) - net_wage(&b, i),
        "the day labourer who is away",
    );
    // the places stay
    assert_eq!(
        b.model.w_act.O_h[gone_by_day as usize].map(|id| b.model.firms.index(id)),
        Some(i)
    );
    assert_books(&b, "the day of a day labourer who is away");
}

#[test]
fn a_day_labourer_is_paid_the_factor_of_the_day_and_over_the_week_what_a_servant_is_paid() {
    let (firms, households) = {
        let m = &austria(9).model;
        (m.firms.len(), m.w_act.len() + m.w_inact.len() + m.banks.len())
    };
    // five working days, a half day and a day of rest: the factors of seven mean days
    let f = 7.0 / 5.5;
    let factor = vec![f, 0.5 * f, 0.0];
    let day: Vec<u8> = (0..14).map(|d| [0, 0, 0, 0, 0, 1, 2][d % 7]).collect();
    let mut b = austria(9);
    b.step(2);
    let h = (0..b.model.w_act.len())
        .find(|&h| b.model.w_act.O_h[h].is_some())
        .unwrap();
    let mut b = b
        .with_working_days(14, 3, factor.clone(), day.clone(), vec![0; firms], vec![0; households])
        .unwrap()
        .with_contracts(&[h as u32])
        .unwrap();
    let mut paid = 0.0;
    for d in 0..14 {
        b.step(1);
        let i = b
            .model
            .firms
            .index(b.model.w_act.O_h[h].expect("the worker keeps the place"));
        let a = factor[day[d] as usize];
        close(
            b.model.w_act.Y_h[h] - port_income(&b, h),
            (a - 1.0) * net_wage(&b, i),
            &format!("day {d}"),
        );
        paid += a - 1.0;
        assert_books(&b, &format!("day {d}"));
    }
    assert!(
        paid.abs() < 1e-12,
        "over two weeks the day labourer is paid {paid} wages more than a servant"
    );
}

#[test]
fn a_worker_without_work_who_is_away_does_not_stand_in_and_the_places_stay_open_when_there_is_nobody() {
    let mut a = austria(7);
    a.step(3);
    let i = firm_bound_by_labour(&a, 2);
    let staff = employees(&a, i);
    // every worker without work is away too
    let mut away = without_work(&a);
    away.push(staff[0]);
    let n = away.len();
    let mut b = a
        .clone()
        .with_contracts(&[])
        .unwrap()
        .with_absences(away, vec![0; n], vec![0; n])
        .unwrap();
    b.step(1);
    assert_eq!((b.model.ext.today.away, b.model.ext.today.stood_in), (1, 0));
    // every other worker away: more places than workers without work, who all stand in
    let every_other: Vec<u32> = (0..a.model.w_act.len() as u32).step_by(2).collect();
    let n = every_other.len();
    let idle = without_work(&a).iter().filter(|&&h| h % 2 == 1).count() as u32;
    let mut c = a
        .with_contracts(&[])
        .unwrap()
        .with_absences(every_other, vec![0; n], vec![0; n])
        .unwrap();
    c.step(1);
    let today = &c.model.ext.today;
    assert!(
        today.away > idle && idle > 0,
        "{} away, {idle} without work",
        today.away
    );
    assert_eq!(today.stood_in, idle);
    assert_books(&c, "the day with every other worker away");
}

#[test]
fn the_contracts_are_part_of_the_state_and_a_state_of_format_12_has_none() {
    let mut a = austria(9);
    a.step(2);
    let plain = a.save();
    let staff = employees(&a, firm_bound_by_labour(&a, 2));
    a = a
        .with_contracts(&staff)
        .unwrap()
        .with_absences(staff[..1].to_vec(), vec![0], vec![2])
        .unwrap();
    a.step(2);
    let mut b = Economy::load(&a.save()).unwrap();
    assert_eq!(a.save(), b.save());
    assert_eq!(a.model.ext.contracts, b.model.ext.contracts);
    a.step(3);
    b.step(3);
    assert_eq!(a.save(), b.save());
    // format 12 is format 13 without the contracts at its end (for none, a number of 0)
    let mut old = plain.clone();
    assert_eq!(old.split_off(old.len() - 4), [0u8; 4]);
    old[4..8].copy_from_slice(&12u32.to_le_bytes());
    let back = Economy::load(&old).unwrap();
    assert!(back.model.ext.contracts.is_empty());
    assert_eq!(back.save(), plain);
}

#[test]
fn contracts_that_do_not_fit_are_refused() {
    let e = austria(1);
    let workers = e.model.w_act.len() as u32;
    assert!(e.clone().with_contracts(&[workers]).is_err());
    assert!(e.clone().with_contracts(&[workers - 1]).is_ok());
    // a contract of another kind in a state
    let mut bytes = e.with_contracts(&[0]).unwrap().save();
    let at = bytes.len() - workers as usize;
    assert_eq!(bytes[at], BY_THE_DAY);
    bytes[at] = 2;
    assert!(Economy::load(&bytes).is_err());
}

#[test]
fn the_family_stands_in_first_and_is_paid_into_the_household_of_the_worker_who_is_away() {
    let mut a = austria(7);
    a.step(3);
    let i = firm_bound_by_labour(&a, 4);
    let staff = employees(&a, i);
    assert!(without_work(&a).len() >= 2);
    // three of its workers away on the next day: a day labourer and a servant whose families stand in, and a servant
    // whose family does not
    let (by_day, by_year, alone) = (staff[0], staff[1], staff[2]);
    let mut b = a
        .clone()
        .with_contracts(&[by_day])
        .unwrap()
        .with_absences(vec![by_day, by_year, alone], vec![0; 3], vec![0; 3])
        .unwrap()
        .with_family(vec![true, true, false])
        .unwrap();
    a.step(1);
    b.step(1);
    close(
        b.model.firms.Y_i[i],
        a.model.firms.Y_i[i],
        "the output with three stand-ins",
    );
    let today = &b.model.ext.today;
    assert_eq!(today.stand_ins[i], 3);
    assert_eq!((today.away, today.by_family, today.stood_in), (3, 2, 1));
    // the day labourer's household has what he would have earned, the servant's his wage and the family's pay
    let y = |h: u32| b.model.w_act.Y_h[h as usize];
    close(
        y(by_day),
        port_income(&b, by_day as usize),
        "the day labourer whose family stands in",
    );
    close(
        y(by_year),
        port_income(&b, by_year as usize) + net_wage(&b, i),
        "the servant whose family stands in",
    );
    close(
        y(alone),
        port_income(&b, alone as usize),
        "the servant whose family does not",
    );
    // one worker without work stands in for the third
    let hired: Vec<usize> = today
        .pays
        .iter()
        .filter(|p| b.model.w_act.O_h[p.worker].is_none())
        .map(|p| p.worker)
        .collect();
    assert_eq!(hired.len(), 1);
    assert_books(&b, "the day with the family's stand-ins");
}

#[test]
fn the_family_stands_in_when_there_is_no_worker_without_work() {
    let mut a = austria(7);
    a.step(3);
    let i = firm_bound_by_labour(&a, 2);
    let staff = employees(&a, i);
    // every worker without work is away, and so is one of the firm's workers, for whom his family stands in
    let mut away = without_work(&a);
    away.push(staff[0]);
    let n = away.len();
    let mut family = vec![false; n];
    family[n - 1] = true;
    let mut b = a
        .clone()
        .with_contracts(&[])
        .unwrap()
        .with_absences(away, vec![0; n], vec![0; n])
        .unwrap()
        .with_family(family)
        .unwrap();
    a.step(1);
    b.step(1);
    let today = &b.model.ext.today;
    assert_eq!((today.away, today.by_family, today.stood_in), (1, 1, 0));
    close(
        b.model.firms.Y_i[i],
        a.model.firms.Y_i[i],
        "the output with the family's stand-in",
    );
    assert_books(&b, "the day with no worker without work");
}

#[test]
fn the_family_s_stand_ins_are_part_of_the_state_and_a_state_of_format_13_has_none() {
    let mut a = austria(9);
    a.step(2);
    let staff = employees(&a, firm_bound_by_labour(&a, 2));
    let away = |e: Economy, family: bool| {
        e.with_contracts(&staff)
            .unwrap()
            .with_absences(staff[..1].to_vec(), vec![0], vec![2])
            .unwrap()
            .with_family(vec![family])
            .unwrap()
    };
    let (mut with, without) = (away(a.clone(), true), away(a, false));
    let (on, off) = (with.save(), without.save());
    with.step(2);
    let mut b = Economy::load(&with.save()).unwrap();
    assert_eq!(with.save(), b.save());
    assert_eq!(b.model.ext.absences.family, [true]);
    with.step(3);
    b.step(3);
    assert_eq!(with.save(), b.save());
    // the two states differ in the one byte of the family; format 13 is format 14 without it
    let at: Vec<usize> = (0..on.len()).filter(|&k| on[k] != off[k]).collect();
    assert_eq!((on.len(), at.len(), on[at[0]], off[at[0]]), (off.len(), 1, 1, 0));
    let mut old = off.clone();
    old.remove(at[0]);
    old[4..8].copy_from_slice(&13u32.to_le_bytes());
    let back = Economy::load(&old).unwrap();
    assert_eq!(back.model.ext.absences.family, [false]);
    assert_eq!(back.save(), off);
}

#[test]
fn a_word_on_the_family_that_does_not_fit_is_refused() {
    let e = austria(1).with_absences(vec![0, 1], vec![0, 0], vec![0, 0]).unwrap();
    assert!(e.clone().with_family(vec![true]).is_err());
    assert!(e.clone().with_family(vec![true, false]).is_ok());
    // a family that is neither yes nor no in a state: the byte in which the two states differ
    let yes = e.clone().with_family(vec![false, true]).unwrap().save();
    let no = e.with_family(vec![false, false]).unwrap().save();
    let at = (0..yes.len()).find(|&k| yes[k] != no[k]).unwrap();
    let mut bytes = yes;
    bytes[at] = 2;
    assert!(Economy::load(&bytes).is_err());
}
