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
pub mod dress;
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
        Look { genes, female, age, stand, east: false, dress: crate::dress::Dress::Roman, seed, mood: Mood::Neutral, life: default_life(stand, age, seed), beard: None, hair: None, hat: None, jewel: None }
    }

    #[test]
    fn red_hair_is_rare_in_the_dress_of_england() {
        use crate::look::{GREY, HAIR_R};
        let hair = |dress, red: f32| {
            let mut p = look(false, 30.0, 1, 7);
            p.dress = dress;
            p.genes[GREY] = 0.0;
            p.genes[HAIR_R] = red;
            p.hair_colour()
        };
        let (roman, england) = (crate::dress::Dress::Roman, crate::dress::Dress::England1356);
        // the middle of the pool England draws from (alleles 20 to 170): red in Apoleia's hair, none in England's
        assert_ne!(hair(roman, 95.0), hair(roman, 0.0));
        assert_eq!(hair(england, 95.0), hair(england, 0.0));
        // the strongest gene is as red in both
        assert_eq!(hair(england, 255.0), hair(roman, 255.0));
        // and of all pairs of such alleles about 5 in 100 show a third of the red or more
        let set = england.set().unwrap();
        let (mut red, mut all) = (0, 0);
        for a in 20..=170 {
            for b in 20..=170 {
                let t = ((((a + b) as f32 / 2.0) / 255.0 - set.hair_red[0]) / (set.hair_red[1] - set.hair_red[0])).clamp(0.0, 1.0);
                red += (t * t * (3.0 - 2.0 * t) >= 0.4) as u32;
                all += 1;
            }
        }
        let share = red as f32 / all as f32;
        assert!((0.04..0.06).contains(&share), "{share}");
    }

    #[test]
    fn a_bust_leans_back_about_its_head() {
        let mut s = crate::geo::Surface::new(crate::geo::mat(0.5));
        s.pos = vec![[0.3, 8.0, 0.2], [0.3, 7.0, 1.2]];
        s.nrm = vec![[0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
        crate::build::lean_back(std::slice::from_mut(&mut s), 7.0, 0.2, 0.14);
        // the crown goes back and hardly down, the nose goes up and hardly back; nothing moves sideways
        assert!(s.pos[0][2] < 0.2 - 0.13 && s.pos[0][1] > 7.98, "{:?}", s.pos[0]);
        assert!(s.pos[1][1] > 7.0 + 0.13 && s.pos[1][2] > 1.18, "{:?}", s.pos[1]);
        assert!(s.pos.iter().all(|q| q[0] == 0.3));
        // normals turn with it and keep their length
        assert!(s.nrm[0][2] < -0.13 && s.nrm[1][1] > 0.13);
        assert!(s.nrm.iter().all(|n| (n.iter().map(|c| c * c).sum::<f32>() - 1.0).abs() < 1e-5));
    }

    #[test]
    fn a_boy_stands_as_a_woman_until_he_is_grown() {
        use crate::dress::by_sex;
        assert_eq!(by_sex(-0.1, 0.14, true, 1.0), -0.1);
        assert_eq!(by_sex(-0.1, 0.14, false, 0.0), -0.1);
        assert_eq!(by_sex(-0.1, 0.14, false, 1.0), 0.14);
        assert!((by_sex(-0.1, 0.14, false, 0.5) - 0.02).abs() < 1e-6);
    }

    #[test]
    fn the_face_at_rest_names_targets_the_head_has() {
        // a target the head does not have is left out without a word (morph.rs), so a misspelt name would do nothing
        let Some(h) = head() else { return };
        for (_, set) in crate::dress::SETS.iter() {
            for (name, women, men) in set.rest {
                assert!(h.targets.contains_key(*name), "{}: {name}", set.key);
                assert!(women.max(*men) > 0.0 && women.min(*men) >= 0.0 && women.max(*men) <= 1.0, "{}: {name}", set.key);
            }
        }
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
