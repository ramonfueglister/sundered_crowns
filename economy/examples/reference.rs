//! The native reference for the WebAssembly build (tests/economy.test.ts): computes cities that trade from the two
//! JSON files of each city's calibration and prints the key figures of all cities after every period as the 16 hex
//! digits of each float, one period per line.
//! With `money` the firms pay wages in money (economy feature 7), with `prices` the port's wage. With `demand` they
//! plan by the demand pull of CANVAS (feature 8), with `costs` by the rule of the paper. The cities keep their past in
//! a fixed size (src/past.rs), as the engine founds them for the game.
//! usage: reference <periods> <plan> <window> <prices|money> <costs|demand> (<seed> <parameters.json> <initial_conditions.json>)…
use sc_economy::Economy;
use sc_economy::trade::Cities;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a.len() < 12 || (a.len() - 6) % 3 != 0 || !["prices", "money"].contains(&a[4].as_str()) || !["costs", "demand"].contains(&a[5].as_str()) {
        eprintln!("usage: reference <periods> <plan> <window> <prices|money> <costs|demand> (<seed> <parameters.json> <initial_conditions.json>)…");
        std::process::exit(2);
    }
    let read = |p: &str| std::fs::read_to_string(p).unwrap_or_else(|e| panic!("{p}: {e}"));
    let (plan, window) = (a[2].parse().expect("plan"), a[3].parse().expect("window"));
    let (money, pull) = (a[4] == "money", a[5] == "demand");
    let cities = a[6..]
        .chunks(3)
        .map(|c| {
            let e = Economy::new(&read(&c[1]), &read(&c[2]), c[0].parse().expect("seed"), plan, window).expect("economy");
            let e = if money { e.with_wages_in_money() } else { e };
            let e = if pull { e.with_demand_pull().expect("demand pull") } else { e };
            // as the engine founds the cities of the game (src/lib.rs)
            e.with_bounded_past()
        })
        .collect();
    let mut all = Cities::new(cities).expect("cities");
    let line = |all: &Cities| all.cities.iter().flat_map(Economy::figures).map(|x| format!("{:016x}", x.to_bits())).collect::<Vec<_>>().join(" ");
    println!("{}", line(&all));
    for _ in 0..a[1].parse::<usize>().expect("periods") {
        all.step(1);
        println!("{}", line(&all));
    }
}
