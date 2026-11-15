//! A sample of people as the game founds them, for the portrait test page: founders of one pool of genes, of
//! given ages and both sexes, in the form of tests/portrait/people.json.
//!
//!   cargo run --release --example sample -- England Gallia 36 > ../tests/portrait/sample_england.json
//!
//! The test people of tests/portrait/people.json are Apoleia's twelve (mostly Italia): a face judged on them alone
//! is judged on genes the game's England does not draw. The ages of the first 28 go round 8, 13, 17, 24, 35, 50, 68,
//! those of the people after them round 2 and 5 (small children wear other hair and have another head: round 56
//! found them only by chance), women and men in turn; every person is fed, healthy and of the middle of its
//! village.

use sc_portrait::dna::{founder, ORIGINS};

/// SplitMix64, as in examples/genes.rs.
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

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (origin, pool, n) = match args.as_slice() {
        [origin, pool, n] => (origin.as_str(), pool.as_str(), n.parse::<u32>().expect("how many people")),
        _ => panic!("sample <origin of the people> <pool of genes> <how many>"),
    };
    let o = ORIGINS.iter().position(|k| *k == pool).unwrap_or_else(|| panic!("no pool {pool}: {ORIGINS:?}")) as u8;
    let (ages, small) = ([8.0, 13.0, 17.0, 24.0, 35.0, 50.0, 68.0], [2.0, 5.0]);
    let people: Vec<String> = (0..n)
        .map(|k| {
            let r = draws(7000 + k as u64, 68);
            let d = founder(o, |i| r[i as usize]);
            let dna = d.bytes().iter().map(|b| b.to_string()).collect::<Vec<_>>().join(",");
            let (female, age) = (k % 2 == 0, if k < 28 { ages[(k / 2) as usize % ages.len()] } else { small[(k / 2) as usize % small.len()] });
            format!(
                "  {{\"pid\":{},\"female\":{female},\"age\":{age:.1},\"stand\":1,\"job\":\"Bauern\",\"origin\":\"{origin}\",\"health\":1000,\"fed\":1000,\"rank\":0.5,\"clothes_pct\":100,\"dna\":[{dna}]}}",
                940000 + k
            )
        })
        .collect();
    println!("[\n{}\n]", people.join(",\n"));
}
