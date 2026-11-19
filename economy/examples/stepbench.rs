//! Times `Cities::step` on a saved state and prints a hash of the state after it (to compare two builds).
//! usage: stepbench <state.bin> <periods>
use sc_economy::trade::Cities;
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let bytes = std::fs::read(&a[1]).unwrap();
    let n: usize = a[2].parse().unwrap();
    let mut c = Cities::load(&bytes).unwrap();
    let t = std::time::Instant::now();
    c.step(n);
    let ms = t.elapsed().as_secs_f64() * 1000.0 / n as f64;
    let mut h: u64 = 0xcbf29ce484222325;
    for b in c.save() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    println!("{ms:.1} ms/period, hash {h:016x}");
}
