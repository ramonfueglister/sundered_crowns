//! The check of all cities together over many years (docs/ECONOMY_DESIGN.md, sections 14 and 15): computes the
//! cities of the calibrations given with the rules of the game, day by day, and prints one line a year with sums
//! over all cities: the deposits of the firms, their loans, the equity of the banks, the deposits of the workers, of
//! the owners of firms and of the owners of banks; then, summed over the days of the year, the profits and the
//! losses of the firms, the stock they built (at their prices), what the banks wrote off, the consumption the
//! households wanted and got; then real GDP of the last window over that of the start (100), the same for the
//! weakest city, the highest share without work of a city, the lowest and the highest money of the merchants in a
//! city over its GDP, the number of banks with negative equity, the largest of the merchants' checks, and the lowest
//! and the highest debt of the crown of a city over its GDP (negative: a hoard).
//! `savings` is the share of what a household holds above its target that it spends in a year (economy feature 15),
//! 0 for the port's rule. With `revenue` the crown buys with what it took in (feature 16), with `series` by the
//! series of the paper.
//! usage: longrun <years> <seed> <savings per year> <series|revenue> (<parameters.json> <initial_conditions.json>)…
#![allow(non_snake_case)]
use sc_economy::Economy;
use sc_economy::trade::Cities;

const PLAN: usize = 30;
const WINDOW: usize = 365;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a.len() < 7 || (a.len() - 5) % 2 != 0 || !["series", "revenue"].contains(&a[4].as_str()) {
        eprintln!("usage: longrun <years> <seed> <savings per year> <series|revenue> (<parameters.json> <initial_conditions.json>)…");
        std::process::exit(2);
    }
    let (years, seed): (usize, u64) = (a[1].parse().expect("years"), a[2].parse().expect("seed"));
    let savings: f64 = a[3].parse().expect("savings");
    let read = |p: &str| std::fs::read_to_string(p).unwrap_or_else(|e| panic!("{p}: {e}"));
    let revenue = a[4] == "revenue";
    let cities: Vec<Economy> = a[5..]
        .chunks(2)
        .enumerate()
        .map(|(c, f)| {
            let e = Economy::new(&read(&f[0]), &read(&f[1]), seed + c as u64, PLAN, WINDOW).expect("economy");
            let e = e.with_wages_in_money().with_demand_pull().expect("demand pull").with_savings_spent(savings / WINDOW as f64).expect("savings");
            let e = if revenue { e.with_crown_spending_revenue() } else { e };
            e.with_bounded_past()
        })
        .collect();
    let mut all = Cities::new(cities).expect("cities");
    let s = |v: &[f64]| v.iter().sum::<f64>();
    let start: Vec<f64> = all.cities.iter().map(|e| e.figures()[2]).collect();
    println!("year D_i L_i E_k D_workers D_owners D_bankers | profits losses stock written_off wanted got | GDP weakest without_work merchants_low merchants_high banks_negative check crown_low crown_high");
    for y in 1..=years {
        let (mut profits, mut losses, mut stock, mut off, mut wanted, mut got) = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        for _ in 0..WINDOW {
            let before: Vec<f64> = all.cities.iter().map(|e| s(&e.model.banks.E_k)).collect();
            all.step(1);
            for (c, e) in all.cities.iter().enumerate() {
                let m = &e.model;
                let f = &m.firms;
                for i in 0..f.Pi_i.len() {
                    if f.Pi_i[i] > 0.0 { profits += f.Pi_i[i] } else { losses -= f.Pi_i[i] }
                    stock += f.P_i[i] * f.DS_i[i];
                }
                // what the equity of the banks fell by beyond their profits after dividends (A.67): written off
                let pk = s(&m.banks.Pi_k);
                let kept = pk - m.prop.theta_DIV * (1.0 - m.prop.tau_FIRM) * pk.max(0.0) - m.prop.tau_FIRM * pk.max(0.0);
                off += (kept - (s(&m.banks.E_k) - before[c])).max(0.0);
                wanted += s(&m.w_act.C_d_h) + s(&m.w_inact.C_d_h) + s(&f.C_d_h) + s(&m.banks.C_d_h);
                got += s(&m.w_act.C_h) + s(&m.w_inact.C_h) + s(&f.C_h) + s(&m.banks.C_h);
            }
        }
        let t = |g: &dyn Fn(&Economy) -> f64| all.cities.iter().map(g).sum::<f64>();
        let fig: Vec<[f64; sc_economy::FIGURES]> = all.cities.iter().map(Economy::figures).collect();
        let gdp = fig.iter().map(|f| f[1]).sum::<f64>() / start.iter().sum::<f64>() * 100.0;
        let weakest = fig.iter().zip(&start).map(|(f, s)| f[1] / s * 100.0).fold(f64::INFINITY, f64::min);
        let idle = fig.iter().map(|f| f[12] / (f[10] + f[11] + f[12])).fold(0.0, f64::max);
        let merchants: Vec<f64> = all.cities.iter().zip(&fig).map(|(e, f)| e.model.rotw.D_RoW / f[3]).collect();
        let crown: Vec<f64> = all.cities.iter().zip(&fig).map(|(e, f)| e.model.gov.L_G / f[3]).collect();
        let negative = all.cities.iter().filter(|e| s(&e.model.banks.E_k) < 0.0).count();
        let check = all.checks().iter().map(|[o, sc]| if *sc > 0.0 { (o / sc).abs() } else { o.abs() }).fold(0.0, f64::max);
        println!(
            "{y} {:.0} {:.0} {:.0} {:.0} {:.0} {:.0} | {:.0} {:.0} {:.0} {:.0} {:.0} {:.0} | {:.1} {:.1} {:.3} {:.2} {:.2} {} {:.0e} {:.2} {:.2}",
            t(&|e| s(&e.model.firms.D_i)), t(&|e| s(&e.model.firms.L_i)), t(&|e| s(&e.model.banks.E_k)),
            t(&|e| s(&e.model.w_act.D_h) + s(&e.model.w_inact.D_h)), t(&|e| s(&e.model.firms.D_h)), t(&|e| s(&e.model.banks.D_h)),
            profits, losses, stock, off, wanted, got,
            gdp, weakest, idle, merchants.iter().cloned().fold(f64::INFINITY, f64::min), merchants.iter().cloned().fold(f64::NEG_INFINITY, f64::max), negative, check,
            crown.iter().cloned().fold(f64::INFINITY, f64::min), crown.iter().cloned().fold(f64::NEG_INFINITY, f64::max),
        );
    }
}
