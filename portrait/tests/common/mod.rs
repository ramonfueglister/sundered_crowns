//! What the tests of the real look share: the head with the files of public/portrait, people of England's pool, and
//! a built person's garments and skin as points and triangles.
//! The real look is set once for the whole program, so each of these tests' files is a program of its own
//! (the library's tests keep Apoleia's faceted look).
#![allow(dead_code)]

use sc_portrait::dna::{founder, ORIGINS};
use sc_portrait::person::{look_of, Lived};
use sc_portrait::{real, Head, Look, Portrait};
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

/// A founder of the pool England draws from, as examples/sample.rs founds them (SplitMix64): one of the common
/// people.
pub fn person(k: u32, female: bool, age: f32) -> Look {
    person_of(k, female, age, 1)
}

/// The same founder as the game hands over a person of the simulation's stand `stand` (src/portrait/wire.ts): 1
/// one of the common people, 3 a person of rank, 4 a crowned head (round 144).
pub fn person_of(k: u32, female: bool, age: f32, stand: u8) -> Look {
    let r: Vec<u64> = (0..2 * sc_portrait::NG as u64)
        .map(|i| {
            let mut z = (8000 + k as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15).wrapping_add(i.wrapping_mul(0xBF58_476D_1CE4_E5B9)).wrapping_add(1);
            z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
            z ^ (z >> 31)
        })
        .collect();
    let pool = ORIGINS.iter().position(|o| *o == "Gallia").unwrap() as u8;
    let genes = founder(pool, |i| r[i as usize]).bytes();
    look_of(&genes, female, age, stand, if stand > 1 { "Adel" } else { "Bauern" }, 1000.0, 1000.0, 940000 + k, "England", Lived { loss_days: None, rank: Some(0.5), clothes_pct: Some(100.0) })
}

pub type V3 = [f32; 3];

/// A triangle, and whether it is of the hem's roll.
pub struct Tri {
    pub at: [V3; 3],
    pub hem: bool,
}

/// A garment's points, each once, and whether a point is of the hem's roll alone (the roll's texture
/// coordinates run a twentieth of the image round it); its triangles.
pub struct Cloth {
    pub pos: Vec<V3>,
    pub hem: Vec<bool>,
    pub tris: Vec<Tri>,
}

pub fn cloth(out: &Portrait, image: &str) -> Option<Cloth> {
    let s = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(image)))?;
    assert_eq!(s.uv.len(), s.pos.len(), "{image}: texture coordinates for every corner");
    let mut c = Cloth { pos: Vec::new(), hem: Vec::new(), tris: Vec::new() };
    let mut seen = std::collections::HashSet::new();
    // (the cloth's triangles first: a point the roll shares with the cloth is the cloth's)
    for of_hem in [false, true] {
        for t in 0..s.pos.len() / 3 {
            let hem = (0..3).all(|k| s.uv[t * 3 + k][1].abs() <= 0.05);
            if hem != of_hem {
                continue;
            }
            let at = [s.pos[t * 3], s.pos[t * 3 + 1], s.pos[t * 3 + 2]];
            c.tris.push(Tri { at, hem });
            for q in at {
                if seen.insert(q.map(f32::to_bits)) {
                    c.pos.push(q);
                    c.hem.push(hem);
                }
            }
        }
    }
    Some(c)
}

pub fn sub(a: &V3, b: &V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

pub fn dot(a: &V3, b: &V3) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

pub fn dist(a: &V3, b: &V3) -> f32 {
    let d = sub(a, b);
    dot(&d, &d).sqrt()
}

/// The point of a triangle closest to a point (Ericson, Real-Time Collision Detection, 5.1.5).
pub fn closest(p: &V3, [a, b, c]: &[V3; 3]) -> V3 {
    let (ab, ac, ap) = (sub(b, a), sub(c, a), sub(p, a));
    let (d1, d2) = (dot(&ab, &ap), dot(&ac, &ap));
    let at = |v: f32, w: f32| [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
    if d1 <= 0.0 && d2 <= 0.0 {
        return at(0.0, 0.0);
    }
    let bp = sub(p, b);
    let (d3, d4) = (dot(&ab, &bp), dot(&ac, &bp));
    if d3 >= 0.0 && d4 <= d3 {
        return at(1.0, 0.0);
    }
    let vc = d1 * d4 - d3 * d2;
    if vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0 {
        return at(d1 / (d1 - d3), 0.0);
    }
    let cp = sub(p, c);
    let (d5, d6) = (dot(&ab, &cp), dot(&ac, &cp));
    if d6 >= 0.0 && d5 <= d6 {
        return at(0.0, 1.0);
    }
    let vb = d5 * d2 - d1 * d6;
    if vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0 {
        return at(0.0, d2 / (d2 - d6));
    }
    let va = d3 * d6 - d5 * d4;
    if va <= 0.0 && d4 - d3 >= 0.0 && d5 - d6 >= 0.0 {
        let w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        return at(1.0 - w, w);
    }
    let k = 1.0 / (va + vb + vc);
    at(vb * k, vc * k)
}

/// The skin's triangles.
pub fn skin(out: &Portrait) -> Vec<[V3; 3]> {
    let s = out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains("skin"))).max_by_key(|s| s.pos.len()).expect("the skin");
    s.pos.chunks_exact(3).map(|t| [t[0], t[1], t[2]]).collect()
}

pub fn cross(a: &V3, b: &V3) -> V3 {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
