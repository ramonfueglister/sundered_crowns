//! CK3-like portraits of the simulated people (Ramon, 30.10.2026; drawn
//! first in the browser Portrait-Werkstatt,
//! https://claude.ai/artifact/JebbURXz29FK155RntzXLL, and ported from it):
//! head and shoulders of the MakeHuman base mesh (CC0) morphed by the
//! person's genes (apoleia_sim::dna), age, mood and life, faceted, with
//! hair, beard, clothing, headwear and jewellery built as geometry. The
//! game draws the result in the person window (sim/godot/src/portrait.rs,
//! app/scripts/ui/portrait_view.gd). docs/kit2/PORTRAITS.md.

mod build;
mod caster;
pub mod dna;
pub mod geo;
mod hair;
pub mod head;
pub mod look;
mod morph;
pub mod person;
pub mod real;
mod real_look;
mod settings;
mod wasm;
pub mod wire;

pub use build::{build, Portrait, LODS};
pub use morph::morph_test;
pub use geo::{Mat, Surface};
pub use head::Head;
pub use look::{default_life, Beard, Hair, Hat, Jewel, Life, Look, Mood, GENES, NG, STANDS};

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn head() -> Option<Head> {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../public/portrait/head.bin.zst");
        let bytes = std::fs::read(path).ok()?;
        Some(Head::load(&bytes).expect("head file"))
    }

    fn look(female: bool, age: f32, stand: usize, seed: u32) -> Look {
        let mut genes = [128.0; NG];
        for (i, g) in genes.iter_mut().enumerate() {
            *g = ((seed as usize * 37 + i * 101) % 200 + 28) as f32;
        }
        Look { genes, female, age, stand, east: false, seed, mood: Mood::Neutral, life: default_life(stand, age, seed), beard: None, hair: None, hat: None, jewel: None }
    }

    #[test]
    fn every_style_builds() {
        let Some(h) = head() else { return };
        let mut n = 0;
        for beard in [Beard::Shaven, Beard::Stubble, Beard::Short, Beard::Full, Beard::Philosopher, Beard::Chin] {
            for hat in [Hat::None, Hat::Cap, Hat::Pileus, Hat::Petasos, Hat::Wreath] {
                let mut p = look(false, 45.0, n % 7, 1000 + n as u32);
                p.beard = Some(beard);
                p.hat = Some(hat);
                p.life.scars = 2;
                let out = build(&h, &p, n % LODS);
                assert!(out.tris > 1000 && out.top > out.chin, "{beard:?} {hat:?}");
                n += 1;
            }
        }
        for hair in [Hair::Braid, Hair::Bun, Hair::Veil] {
            for jewel in [Jewel::None, Jewel::Earrings, Jewel::Chain, Jewel::Pearls] {
                let mut p = look(true, 30.0, n % 7, 2000 + n as u32);
                p.hair = Some(hair);
                p.jewel = Some(jewel);
                p.hat = Some(if n % 2 == 0 { Hat::Diadem } else { Hat::None });
                let out = build(&h, &p, n % LODS);
                assert!(out.tris > 1000, "{hair:?} {jewel:?}");
                for s in &out.surfaces {
                    assert_eq!(s.pos.len(), s.col.len());
                    assert!(s.pos.iter().all(|v| v.iter().all(|c| c.is_finite())), "{hair:?} {jewel:?} {:?}", s.mat);
                }
                n += 1;
            }
        }
        for age in [2.0, 9.0, 15.0, 70.0] {
            build(&h, &look(age < 10.0, age, 1, 7), 1);
        }
    }

    #[test]
    fn mourners_dress_and_groom_as_mourners() {
        for seed in 0..40 {
            let mut man = look(false, 35.0, 1, seed);
            let mut woman = look(true, 35.0, 3, seed);
            for p in [&mut man, &mut woman] {
                p.life.mourn = 1.0;
            }
            assert_ne!(man.beard_style(), Beard::Shaven);
            assert_eq!(woman.hair_style(), Hair::Veil);
            assert_eq!(woman.jewel_style(), Jewel::None);
        }
        let Some(h) = head() else { return };
        let mut p = look(true, 78.0, 2, 9);
        p.life = Life { mourn: 0.6, wealth: 0.1, worn: 1.0, sun: 0.9, ..p.life };
        assert!(build(&h, &p, 1).tris > 1000);
    }

    #[test]
    fn same_person_same_portrait() {
        let Some(h) = head() else { return };
        let p = look(false, 38.0, 5, 42);
        let (a, b) = (build(&h, &p, 1), build(&h, &p, 1));
        assert_eq!(a.tris, b.tris);
        assert_eq!(a.surfaces[0].pos, b.surfaces[0].pos);
    }
}
