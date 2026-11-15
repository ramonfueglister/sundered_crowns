//! The native reference for the WebAssembly build (tests/economy.test.ts): computes cities that trade from the two
//! JSON files of each city's calibration and prints the key figures of all cities after every period as the 16 hex
//! digits of each float, one period per line.
//! usage: reference <periods> <plan> <window> (<seed> <parameters.json> <initial_conditions.json>)…
use sc_economy::Economy;
use sc_economy::trade::Cities;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a.len() < 10 || (a.len() - 4) % 3 != 0 {
        eprintln!("usage: reference <periods> <plan> <window> (<seed> <parameters.json> <initial_conditions.json>)…");
        std::process::exit(2);
    }
    let read = |p: &str| std::fs::read_to_string(p).unwrap_or_else(|e| panic!("{p}: {e}"));
    let (plan, window) = (a[2].parse().expect("plan"), a[3].parse().expect("window"));
    let cities = a[4..].chunks(3).map(|c| Economy::new(&read(&c[1]), &read(&c[2]), c[0].parse().expect("seed"), plan, window).expect("economy")).collect();
    let mut all = Cities::new(cities).expect("cities");
    let line = |all: &Cities| all.cities.iter().flat_map(Economy::figures).map(|x| format!("{:016x}", x.to_bits())).collect::<Vec<_>>().join(" ");
    println!("{}", line(&all));
    for _ in 0..a[1].parse::<usize>().expect("periods") {
        all.step(1);
        println!("{}", line(&all));
    }
}
