//! A trial run of cities that trade (src/trade.rs): computes the cities of the calibrations given, day by day, and
//! prints every `every` days one line per city: day, city, real GDP of the last window, price level of the day,
//! real exports and imports of the last window, share without work, the merchants' money in the city, their stock
//! there; then one line with the merchants' checks (each as a share of the amount it is judged by).
//! With `alone` in place of `linked` every city computes on its own, with the port's rule for the rest of the
//! world: the same cities without merchants, to set the linked ones against.
//! usage: cities <days> <every> <seed> <plan> <window> <linked|alone> (<parameters.json> <initial_conditions.json>)…
use sc_economy::Economy;
use sc_economy::trade::Cities;

fn line(day: usize, c: usize, e: &Economy, stock: f64) {
    let f = e.figures();
    let without = f[12] / (f[10] + f[11] + f[12]);
    println!("{day} {c} {:.3} {:.5} {:.3} {:.3} {:.5} {:.3} {:.4}", f[1], f[15], f[8], f[9], without, e.model.rotw.D_RoW, stock);
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a.len() < 11 || a.len() % 2 != 1 || !["linked", "alone"].contains(&a[6].as_str()) {
        eprintln!("usage: cities <days> <every> <seed> <plan> <window> <linked|alone> (<parameters.json> <initial_conditions.json>)…");
        std::process::exit(2);
    }
    let n = |k: usize, what: &str| a[k].parse::<usize>().unwrap_or_else(|_| panic!("{what}: {}", a[k]));
    let (days, every, seed, plan, window) = (n(1, "days"), n(2, "every"), n(3, "seed") as u64, n(4, "plan"), n(5, "window"));
    let read = |p: &str| std::fs::read_to_string(p).unwrap_or_else(|e| panic!("{p}: {e}"));
    let mut cities: Vec<Economy> =
        a[7..].chunks(2).enumerate().map(|(c, f)| Economy::new(&read(&f[0]), &read(&f[1]), seed + c as u64, plan, window).expect("economy")).collect();
    let t0 = std::time::Instant::now();
    if a[6] == "alone" {
        for day in 0..=days {
            if day > 0 {
                cities.iter_mut().for_each(|e| e.step(1));
            }
            if day % every == 0 || day == days {
                cities.iter().enumerate().for_each(|(c, e)| line(day, c, e, 0.0));
            }
        }
        eprintln!("{days} days of {} cities on their own in {:.1} s", cities.len(), t0.elapsed().as_secs_f64());
        return;
    }
    let mut all = Cities::new(cities).expect("cities");
    for day in 0..=days {
        if day > 0 {
            all.step(1);
        }
        if day % every == 0 || day == days {
            for (c, e) in all.cities.iter().enumerate() {
                line(day, c, e, all.merchants.stock[c].iter().sum());
            }
            let checks: Vec<String> = all.checks().iter().map(|[off, scale]| format!("{:.2e}", if *scale > 0.0 { off / scale } else { *off })).collect();
            println!("# {day} checks {}", checks.join(" "));
        }
    }
    eprintln!("{days} days of {} cities in {:.1} s, state {} bytes", all.cities.len(), t0.elapsed().as_secs_f64(), all.save().len());
}
