//! What the tests of the real look share: the head with the files of public/portrait, and people of England's pool.
//! The real look is set once for the whole program, so each of these tests' files is a program of its own
//! (the library's tests keep Apoleia's faceted look).
#![allow(dead_code)]

use sc_portrait::dna::{founder, ORIGINS};
use sc_portrait::person::{look_of, Lived};
use sc_portrait::{real, Head, Look};
use std::path::Path;
use std::sync::Once;

static REAL: Once = Once::new();

/// The head and the files of the real look from public/portrait; None where they are not there.
pub fn head() -> Option<Head> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../public/portrait");
    let bytes = std::fs::read(dir.join("head.bin.zst")).ok()?;
    REAL.call_once(|| {
        for entry in std::fs::read_dir(dir.join("real")).expect("the folder of the real look") {
            let path = entry.unwrap().path();
            let name = format!("real/{}", path.file_name().unwrap().to_str().unwrap());
            if name.ends_with(".webp") || name.ends_with(".png") {
                real::name(&name);
            } else {
                real::put(&name, std::fs::read(&path).unwrap());
            }
        }
        real::set_real(Some("real".to_string()));
    });
    Some(Head::load(&bytes).expect("the head"))
}

/// A founder of the pool England draws from, as examples/sample.rs founds them (SplitMix64).
pub fn person(k: u32, female: bool, age: f32) -> Look {
    let r: Vec<u64> = (0..68u64)
        .map(|i| {
            let mut z = (8000 + k as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15).wrapping_add(i.wrapping_mul(0xBF58_476D_1CE4_E5B9)).wrapping_add(1);
            z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
            z ^ (z >> 31)
        })
        .collect();
    let pool = ORIGINS.iter().position(|o| *o == "Gallia").unwrap() as u8;
    let genes = founder(pool, |i| r[i as usize]).bytes();
    look_of(&genes, female, age, 1, "Bauern", 1000.0, 1000.0, 940000 + k, "England", Lived { loss_days: None, rank: Some(0.5), clothes_pct: Some(100.0) })
}
