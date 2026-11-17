//! The persons and firms of an economy one by one (economy feature 10, docs/ECONOMY_DESIGN.md): what
//! `Economy::agents` gives the world to write to the persons and firms of a city. Its rows are the port's own lists;
//! these tests hold them against the sums the engine reports and against the rules the port computes them by.
#![allow(non_snake_case)]

use sc_economy::{Economy, FIRM, PERSON, WORKER};

const CITIES: &str = include_str!("../../public/data/economy_cities.json");

/// A city of the game with the rules of the game (wages in money, the demand pull) and the seed given.
fn city(name: &str, seed: u64) -> Economy {
    let file: serde_json::Value = serde_json::from_str(CITIES).unwrap();
    let city = file["cities"].as_array().unwrap().iter().find(|c| c["name"] == name).unwrap_or_else(|| panic!("{name} is a city of the game"));
    let clock = &file["clock"];
    let (plan, window) = (clock["plan"].as_u64().unwrap() as usize, clock["window"].as_u64().unwrap() as usize);
    Economy::new(&city["parameters"].to_string(), &city["initial_conditions"].to_string(), seed, plan, window).unwrap().with_wages_in_money().with_demand_pull().unwrap()
}

/// The rows of `agents`, cut into its parts: workers, firms, owners of banks, persons who do not work.
fn rows(e: &Economy) -> (Vec<[f64; WORKER]>, Vec<[f64; FIRM]>, Vec<[f64; PERSON]>, Vec<[f64; PERSON]>) {
    let v = e.agents();
    let (nw, nf, nb, nx) = (v[0] as usize, v[1] as usize, v[2] as usize, v[3] as usize);
    assert_eq!(v.len(), 4 + WORKER * nw + FIRM * nf + PERSON * (nb + nx));
    let (w, rest) = v[4..].split_at(WORKER * nw);
    let (f, rest) = rest.split_at(FIRM * nf);
    let (b, x) = rest.split_at(PERSON * nb);
    (
        w.chunks(WORKER).map(|r| r.try_into().unwrap()).collect(),
        f.chunks(FIRM).map(|r| r.try_into().unwrap()).collect(),
        b.chunks(PERSON).map(|r| r.try_into().unwrap()).collect(),
        x.chunks(PERSON).map(|r| r.try_into().unwrap()).collect(),
    )
}

#[test]
fn every_person_and_firm_of_the_model_has_a_row() {
    let e = city("London", 1356);
    let (w, f, b, x) = rows(&e);
    let m = &e.model;
    // the persons of the model (src/agents.rs of the port, lines 207 to 213; BeforeIT.jl src/model_init/init_workers.jl,
    // lines 30 to 31): the workers, the owner of every firm, the owner of the bank, and who does not work
    assert_eq!((w.len(), f.len(), b.len(), x.len()), (m.w_act.len(), m.firms.len(), 1, 1));
    let active = m.prop.H_act;
    assert_eq!(w.len() + f.len() + b.len(), active, "the active persons are the workers and the owners");
}

#[test]
fn the_rows_add_up_to_the_figures_of_the_economy_every_day() {
    let mut e = city("London", 1356);
    let tau = e.model.prop.tau_INC;
    for day in 0..=120 {
        if day > 0 {
            e.step(1);
        }
        let (w, f, b, x) = rows(&e);
        let fig = e.figures();
        let mut drift = 0.0f64;
        // who has work, firm by firm (A.24): a worker's firm counts the worker
        let mut staff = vec![0usize; f.len()];
        for r in &w {
            if r[0] >= 0.0 {
                staff[r[0] as usize] += 1;
                // the worker is paid what the firm pays, and keeps it after the tax on income (A.53)
                let pay = f[r[0] as usize][4];
                assert_eq!(r[1], pay, "day {day}");
                if day == 0 {
                    assert_eq!(pay, 0.0, "in the starting position no period is computed: nothing is paid yet");
                } else {
                    assert!(pay > 0.0 && pay.is_finite(), "day {day}: a firm pays {pay}");
                    assert!((r[2] - pay * (1.0 - tau)).abs() <= 1e-12 * pay, "day {day}: an income of {} from a wage of {pay}", r[2]);
                    // wages in money: the firm's wage in money times the effort, up to the change of the price level in the day
                    let i = r[0] as usize;
                    let money = e.model.ext.wage[i] * e.model.firms.w_i[i] / e.model.firms.w_bar_i[i];
                    drift = drift.max((pay / money - 1.0).abs());
                }
            } else {
                assert_eq!(r[1], 0.0, "day {day}: no wage without work");
            }
        }
        for (i, r) in f.iter().enumerate() {
            assert_eq!(staff[i] as f64, r[1], "day {day}, firm {i}: the employees");
            assert!((0.0..3.0).contains(&r[0]) && r[0].fract() == 0.0);
            assert!(r[2] >= 0.0 && r[3] > 0.0);
        }
        let employed: usize = staff.iter().sum();
        assert_eq!(employed as f64, fig[10], "day {day}");
        assert_eq!((w.len() - employed) as f64, fig[12], "day {day}");
        assert_eq!((f.len() + b.len()) as f64, fig[11], "day {day}");
        // the savings of all persons are the deposits of the households
        let savings: f64 = w.iter().map(|r| r[3]).sum::<f64>() + f.iter().map(|r| r[6]).sum::<f64>() + b.iter().map(|r| r[1]).sum::<f64>() + x.iter().map(|r| r[1]).sum::<f64>();
        assert!((savings - fig[13]).abs() <= 1e-9 * fig[13].abs(), "day {day}: {savings} against {}", fig[13]);
        // measured: about 1.2 % on the first day (the price level of the start is 1, the first index is not), then
        // below 0.1 % a day; with London's agriculture at the factor of its harvest (economy feature 12) up to 0.22 %
        // on day 4
        assert!(drift < if day == 1 { 0.02 } else { 3e-3 }, "day {day}: the wage paid is {drift} off the wage in money");
        // nobody spends a negative amount
        assert!(w.iter().all(|r| r[4] >= 0.0) && f.iter().all(|r| r[7] >= 0.0));
    }
}

#[test]
fn the_rows_are_those_of_the_same_state_after_saving() {
    let mut e = city("Paris", 7);
    e.step(45);
    let again = Economy::load(&e.save()).unwrap();
    assert_eq!(e.agents(), again.agents());
}
