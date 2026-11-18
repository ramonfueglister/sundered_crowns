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
//!
//!   cargo run --release --example sample -- world 8 > ../tests/portrait/sample_world.json
//!
//! The people of the world (round 111): of every pool of genes a culture of the game draws from (`WORLD`: the pool
//! and one of its cultures, whose name the people carry as their origin, as the game gives it) so many founders,
//! women and men in turn: of 24, of 50, of 13, then a woman of 35 and a man of 68. Their numbers are 950000 + 100
//! times the pool's place in `WORLD` + the person's.

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

/// The pools the game's cultures draw from, each with one of its cultures (src/sim/people/pools.ts).
const WORLD: [(&str, &str); 22] = [
    ("Germania", "swedish"),
    ("Gallia", "french"),
    ("Italia", "tuscan"),
    ("Graecia", "greek"),
    ("Iran", "persian"),
    ("Syria", "levantine"),
    ("Arabia", "bedouin"),
    ("Aegyptus", "egyptian_arab"),
    ("Maghreb", "berber"),
    ("Horn", "amhara"),
    ("Guinea", "yoruba"),
    ("Kalahari", "khoisan"),
    ("Steppe", "tatar"),
    ("Siberia", "mongol"),
    ("China", "han"),
    ("Tibet", "tibetan"),
    ("Indochina", "khmer"),
    ("Hindustan", "hindustani"),
    ("Deccan", "tamil"),
    ("Oceania", "polynesian"),
    ("Australia", "australian_aboriginal"),
    ("America", "nahua"),
];

fn world(n: u32) {
    let ages = [24.0, 50.0, 13.0];
    let mut people = Vec::new();
    for (w, (pool, culture)) in WORLD.iter().enumerate() {
        let o = ORIGINS.iter().position(|k| k == pool).unwrap_or_else(|| panic!("no pool {pool}")) as u8;
        for k in 0..n {
            let r = draws(8000 + 100 * w as u64 + k as u64, 68);
            let d = founder(o, |i| r[i as usize]);
            let dna = d.bytes().iter().map(|b| b.to_string()).collect::<Vec<_>>().join(",");
            let female = k % 2 == 0;
            let age = match k {
                6 => 35.0,
                7 => 68.0,
                _ => ages[(k / 2) as usize % ages.len()],
            };
            people.push(format!(
                "  {{\"pid\":{},\"female\":{female},\"age\":{age:.1},\"stand\":1,\"job\":\"Bauern\",\"origin\":\"{culture}\",\"health\":1000,\"fed\":1000,\"rank\":0.5,\"clothes_pct\":100,\"dna\":[{dna}]}}",
                950000 + 100 * w as u32 + k
            ));
        }
    }
    println!("[\n{}\n]", people.join(",\n"));
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let [mode, n] = args.as_slice() {
        if mode == "world" {
            return world(n.parse().expect("how many people of each pool"));
        }
    }
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
