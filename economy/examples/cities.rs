//! A trial run of cities that trade (src/trade.rs): computes the cities of the calibrations given, day by day, and
//! prints every `every` days one line per city: day, city, real GDP of the last window, price level of the day,
//! real exports and imports of the last window, share without work, the merchants' money in the city, their stock
//! there, and over the days since the line before: the part of the merchants' orders that the city filled, the part
//! of the stalls' goods that was sold, and the goods asked for at the stalls over the goods there; then one line
//! with the merchants' checks (each as a share of the amount it is judged by).
//! With `alone` in place of `linked` every city computes on its own, with the port's rule for the rest of the
//! world: the same cities without merchants, to set the linked ones against.
//! With `money` the firms pay wages in money (economy feature 7), with `prices` the port's wage. With `demand` they
//! plan by the demand pull of CANVAS (feature 8), with `costs` by the rule of the paper.
//! With `PAST=fixed` in the environment the cities keep their past in a fixed size (src/past.rs), as the cities of
//! the game do. Every line of a day is followed on the error output by the time since the start and the size of the
//! state.
//! usage: cities <days> <every> <seed> <plan> <window> <linked|alone> <prices|money> <costs|demand> (<parameters.json> <initial_conditions.json>)…
use sc_economy::Economy;
use sc_economy::trade::Cities;

/// What the merchants met in a city since the last line: goods ordered and bought, goods at the stalls, sold there
/// and asked for there.
#[derive(Clone, Copy, Default)]
struct Met {
    ordered: f64,
    bought: f64,
    offered: f64,
    sold: f64,
    asked: f64,
}

impl Met {
    fn add(&mut self, e: &Economy) {
        let r = &e.model.rotw;
        self.ordered += r.C_E;
        self.bought += if r.C_l > 0.0 { r.C_l / r.P_l } else { 0.0 };
        self.offered += r.Y_m.iter().sum::<f64>();
        self.sold += r.Q_m.iter().sum::<f64>();
        self.asked += r.Q_d_m.iter().sum::<f64>();
    }
}

fn line(day: usize, c: usize, e: &Economy, stock: f64, met: &mut Met) {
    let f = e.figures();
    let without = f[12] / (f[10] + f[11] + f[12]);
    let part = |a: f64, b: f64| if b > 0.0 { a / b } else { 0.0 };
    println!(
        "{day} {c} {:.3} {:.5} {:.3} {:.3} {:.5} {:.3} {:.4} {:.4} {:.4} {:.4}",
        f[1],
        f[15],
        f[8],
        f[9],
        without,
        e.model.rotw.D_RoW,
        stock,
        part(met.bought, met.ordered),
        part(met.sold, met.offered),
        part(met.asked, met.offered)
    );
    *met = Met::default();
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a.len() < 13
        || a.len() % 2 != 1
        || !["linked", "alone"].contains(&a[6].as_str())
        || !["prices", "money"].contains(&a[7].as_str())
        || !["costs", "demand"].contains(&a[8].as_str())
    {
        eprintln!(
            "usage: cities <days> <every> <seed> <plan> <window> <linked|alone> <prices|money> <costs|demand> (<parameters.json> <initial_conditions.json>)…"
        );
        std::process::exit(2);
    }
    let n = |k: usize, what: &str| a[k].parse::<usize>().unwrap_or_else(|_| panic!("{what}: {}", a[k]));
    let (days, every, seed, plan, window) = (
        n(1, "days"),
        n(2, "every"),
        n(3, "seed") as u64,
        n(4, "plan"),
        n(5, "window"),
    );
    let read = |p: &str| std::fs::read_to_string(p).unwrap_or_else(|e| panic!("{p}: {e}"));
    let (money, pull) = (a[7] == "money", a[8] == "demand");
    let fixed = std::env::var("PAST").is_ok_and(|v| v == "fixed");
    let mut cities: Vec<Economy> = a[9..]
        .chunks(2)
        .enumerate()
        .map(|(c, f)| {
            let e = Economy::new(&read(&f[0]), &read(&f[1]), seed + c as u64, plan, window).expect("economy");
            let e = if money { e.with_wages_in_money() } else { e };
            let e = if pull {
                e.with_demand_pull().expect("demand pull")
            } else {
                e
            };
            if fixed { e.with_bounded_past() } else { e }
        })
        .collect();
    let t0 = std::time::Instant::now();
    let mut met = vec![Met::default(); cities.len()];
    if a[6] == "alone" {
        for day in 0..=days {
            if day > 0 {
                cities.iter_mut().for_each(|e| e.step(1));
                cities.iter().zip(&mut met).for_each(|(e, m)| m.add(e));
            }
            if day % every == 0 || day == days {
                cities
                    .iter()
                    .enumerate()
                    .for_each(|(c, e)| line(day, c, e, 0.0, &mut met[c]));
            }
        }
        eprintln!(
            "{days} days of {} cities on their own in {:.1} s",
            cities.len(),
            t0.elapsed().as_secs_f64()
        );
        return;
    }
    let mut all = Cities::new(cities).expect("cities");
    for day in 0..=days {
        if day > 0 {
            all.step(1);
            all.cities.iter().zip(&mut met).for_each(|(e, m)| m.add(e));
        }
        if day % every == 0 || day == days {
            for (c, e) in all.cities.iter().enumerate() {
                line(day, c, e, all.merchants.stock[c].iter().sum(), &mut met[c]);
            }
            let checks: Vec<String> = all
                .checks()
                .iter()
                .map(|[off, scale]| format!("{:.2e}", if *scale > 0.0 { off / scale } else { *off }))
                .collect();
            println!("# {day} checks {}", checks.join(" "));
            eprintln!(
                "day {day}: {:.1} s, state {} bytes",
                t0.elapsed().as_secs_f64(),
                all.save().len()
            );
        }
    }
    eprintln!(
        "{days} days of {} cities in {:.1} s, state {} bytes",
        all.cities.len(),
        t0.elapsed().as_secs_f64(),
        all.save().len()
    );
}
