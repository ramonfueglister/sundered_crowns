//! Genes of founders and children as numbers, for the game's own copy of founder() and child() (the simulation of
//! persons, in TypeScript) to be held against this crate: tests/portrait/genes_golden.json.
//!
//!   cargo run --release --example genes > ../tests/portrait/genes_golden.json
//!
//! Every case carries the random draws it was made with (hex, 64 bits each, in the order r(0), r(1), ...), so the
//! other side needs no hash of its own to follow: founders take two draws a gene, children one. Also the origin of some
//! places (longitude, latitude).

use sc_portrait::dna::{child, founder, origin, Dna, ORIGINS};

/// SplitMix64: only to have draws that fill all 64 bits.
fn draws(seed: u64, n: usize) -> Vec<u64> {
    (0..n as u64)
        .map(|k| {
            let mut z = seed.wrapping_mul(0x9E37_79B9_7F4A_7C15).wrapping_add(k.wrapping_mul(0xBF58_476D_1CE4_E5B9)).wrapping_add(1);
            z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
            z ^ (z >> 31)
        })
        .collect()
}

fn hex(d: &[u64]) -> String {
    d.iter().map(|v| format!("\"{v:016x}\"")).collect::<Vec<_>>().join(",")
}

fn bytes(d: &Dna) -> String {
    d.bytes().iter().map(|b| b.to_string()).collect::<Vec<_>>().join(",")
}

fn main() {
    let mut founders = Vec::new();
    let mut made = Vec::new();
    for o in 0..ORIGINS.len() as u8 {
        for n in 0..3u64 {
            let r = draws(100 * o as u64 + n, 2 * sc_portrait::NG);
            let d = founder(o, |k| r[k as usize]);
            founders.push(format!("    {{\"origin\":{o},\"draws\":[{}],\"dna\":[{}]}}", hex(&r), bytes(&d)));
            made.push(d);
        }
    }
    let mut children = Vec::new();
    for n in 0..12usize {
        let (f, m) = (made[(5 * n) % made.len()], made[(7 * n + 3) % made.len()]);
        let r = draws(9000 + n as u64, sc_portrait::NG);
        let d = child(&f, &m, |k| r[k as usize]);
        children.push(format!("    {{\"father\":[{}],\"mother\":[{}],\"draws\":[{}],\"dna\":[{}]}}", bytes(&f), bytes(&m), hex(&r), bytes(&d)));
    }
    let places = [(-0.1, 51.5), (2.35, 48.85), (12.5, 41.9), (13.4, 52.5), (23.7, 38.0), (36.3, 33.5), (31.2, 30.0), (10.2, 36.8), (-3.7, 40.4), (28.98, 41.0)];
    let origins: Vec<String> = places.iter().map(|&(lon, lat)| format!("    {{\"lon\":{lon},\"lat\":{lat},\"origin\":{}}}", origin(lon, lat))).collect();
    println!("{{\n  \"origins\":[{}],", ORIGINS.iter().map(|o| format!("\"{o}\"")).collect::<Vec<_>>().join(","));
    println!("  \"founders\":[\n{}\n  ],\n  \"children\":[\n{}\n  ],\n  \"places\":[\n{}\n  ]\n}}", founders.join(",\n"), children.join(",\n"), origins.join(",\n"));
}
