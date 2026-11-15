//! The native reference for the WebAssembly build (tests/economy.test.ts): computes an economy from the two JSON files
//! of a calibration and prints the key figures after every period as the 16 hex digits of each float, one period per
//! line. usage: reference <parameters.json> <initial_conditions.json> <seed> <periods>
use sc_economy::Economy;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    if a.len() != 5 {
        eprintln!("usage: reference <parameters.json> <initial_conditions.json> <seed> <periods>");
        std::process::exit(2);
    }
    let read = |p: &str| std::fs::read_to_string(p).unwrap_or_else(|e| panic!("{p}: {e}"));
    let mut e = Economy::new(&read(&a[1]), &read(&a[2]), a[3].parse().expect("seed")).expect("economy");
    let line = |e: &Economy| e.figures().iter().map(|x| format!("{:016x}", x.to_bits())).collect::<Vec<_>>().join(" ");
    println!("{}", line(&e));
    for _ in 0..a[4].parse::<usize>().expect("periods") {
        e.step(1);
        println!("{}", line(&e));
    }
}
