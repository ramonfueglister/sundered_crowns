//! The native reference for the WebAssembly build (tests/economy.test.ts): computes cities that trade from the two
//! JSON files of each city's calibration and prints the key figures of all cities after every period as the 16 hex
//! digits of each float, one period per line.
//! With `money` the firms pay wages in money (economy feature 7), with `prices` the port's wage.
//! usage: reference <periods> <plan> <window> <prices|money> (<seed> <parameters.json> <initial_conditions.json>)…
use sc_economy::Economy;
use sc_economy::trade::Cities;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a.len() < 11 || (a.len() - 5) % 3 != 0 || !["prices", "money"].contains(&a[4].as_str()) {
        eprintln!("usage: reference <periods> <plan> <window> <prices|money> (<seed> <parameters.json> <initial_conditions.json>)…");
        std::process::exit(2);
    }
    let read = |p: &str| std::fs::read_to_string(p).unwrap_or_else(|e| panic!("{p}: {e}"));
    let (plan, window) = (a[2].parse().expect("plan"), a[3].parse().expect("window"));
    let money = a[4] == "money";
    let cities = a[5..]
        .chunks(3)
        .map(|c| {
            let e = Economy::new(&read(&c[1]), &read(&c[2]), c[0].parse().expect("seed"), plan, window).expect("economy");
            if money { e.with_wages_in_money() } else { e }
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
