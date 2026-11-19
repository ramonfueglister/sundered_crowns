//! TRIAL (distance in trade). Per year and city: D_RoW, households' deposits, firms' deposits, loans, banks' equity,
//! L_G, E_CB, nominal GDP, real GDP, consumption, price level, real exports, real imports, share without work.
//! usage: distance <years> <seed> <plan> <window> <routes.txt|none> <tons per unit agriculture> <industry> (<parameters.json> <initial_conditions.json>)…
use sc_economy::Economy;
use sc_economy::trade::Cities;
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let n = |k: usize| a[k].parse::<usize>().unwrap();
    let (years, seed, plan, window) = (n(1), n(2) as u64, n(3), n(4));
    let dens = [a[6].parse::<f64>().unwrap(), a[7].parse::<f64>().unwrap(), 0.0];
    let read = |p: &str| std::fs::read_to_string(p).unwrap();
    let cities: Vec<Economy> = a[8..]
        .chunks(2)
        .enumerate()
        .map(|(c, f)| {
            let e = Economy::new(&read(&f[0]), &read(&f[1]), seed + c as u64, plan, window)
                .unwrap()
                .with_wages_in_money()
                .with_demand_pull()
                .unwrap()
                .with_savings_spent(
                    std::env::var("SAVINGS")
                        .ok()
                        .and_then(|v| v.parse::<f64>().ok())
                        .unwrap_or(0.4)
                        / 365.0,
                )
                .unwrap();
            let e = if std::env::var("CROWN").as_deref() == Ok("series") {
                e
            } else {
                e.with_crown_spending_revenue()
            };
            let e = if std::env::var("OWNER").as_deref() == Ok("paper") {
                e
            } else {
                e.with_owner_household()
            };
            e.with_bounded_past()
        })
        .collect();
    let k = cities.len();
    let mut all = Cities::new(cities).unwrap();
    if a[5] != "none" {
        let (mut days, mut labour) = (vec![vec![0; k]; k], vec![vec![0.0; k]; k]);
        for l in read(&a[5]).lines() {
            let p: Vec<&str> = l.split_whitespace().collect();
            let (c, d, t, lab) = (
                p[0].parse::<usize>().unwrap(),
                p[1].parse::<usize>().unwrap(),
                p[2].parse::<usize>().unwrap(),
                p[3].parse::<f64>().unwrap(),
            );
            if c < k && d < k {
                days[c][d] = t;
                labour[c][d] = lab;
            }
        }
        all = all
            .with_routes(
                days,
                labour,
                dens.to_vec(),
                std::env::var("THETA").ok().and_then(|v| v.parse().ok()).unwrap_or(2.0),
            )
            .unwrap();
    }
    let s = |v: &[f64]| v.iter().sum::<f64>();
    for y in 0..=years {
        if y > 0 {
            all.step(365);
        }
        for (c, e) in all.cities.iter().enumerate() {
            let m = &e.model;
            let f = e.figures();
            let dh = s(&m.w_act.D_h) + s(&m.w_inact.D_h) + s(&m.firms.D_h) + s(&m.banks.D_h);
            println!(
                "{y} {c} {:.1} {:.1} {:.1} {:.1} {:.1} {:.1} {:.1} {:.1} {:.3} {:.3} {:.3} {:.3} {:.3} {:.4}",
                m.rotw.D_RoW,
                dh,
                s(&m.firms.D_i),
                s(&m.firms.L_i),
                s(&m.banks.E_k),
                m.gov.L_G,
                m.cb.E_CB,
                f[3],
                f[1],
                f[5],
                f[15],
                f[8],
                f[9],
                f[12] / (f[10] + f[11] + f[12])
            );
        }
        let ch: Vec<String> = all
            .checks()
            .iter()
            .map(|[o, sc]| format!("{:.1e}", if *sc > 0.0 { o / sc } else { *o }))
            .collect();
        let (paid, transit) = all
            .merchants
            .routes
            .as_ref()
            .map_or((0.0, 0.0), |r| (r.paid, r.on_way_cost.iter().sum::<f64>()));
        println!(
            "# {y} checks {} carrying paid {:.1} goods on the way at cost {:.1}",
            ch.join(" "),
            paid,
            transit
        );
    }
}
