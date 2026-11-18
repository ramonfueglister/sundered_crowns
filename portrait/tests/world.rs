//! The peoples of the world (round 111): founders of every pool of genes in the plain dress of 1356, tightly
//! curled hair, the lips' colour on dark skin and the skin's image on a flat nose root, as the builder makes
//! them (the real look: a file of its own, see tests/common).

mod common;

use common::{head, person};
use sc_portrait::dna::{founder, ORIGINS};
use sc_portrait::dress::Dress;
use sc_portrait::person::{look_of, Lived};
use sc_portrait::{build, Look, Portrait};

/// A founder of a pool, as examples/sample.rs founds the people of the world (SplitMix64), of a culture that has
/// no dress of its own.
fn of(pool: &str, k: u32, female: bool, age: f32) -> Look {
    let o = ORIGINS.iter().position(|p| *p == pool).unwrap_or_else(|| panic!("no pool {pool}"));
    let r: Vec<u64> = (0..2 * sc_portrait::NG as u64)
        .map(|i| {
            let mut z = (8000 + 100 * o as u64 + k as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15).wrapping_add(i.wrapping_mul(0xBF58_476D_1CE4_E5B9)).wrapping_add(1);
            z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
            z ^ (z >> 31)
        })
        .collect();
    let genes = founder(o as u8, |i| r[i as usize]).bytes();
    look_of(&genes, female, age, 1, "Bauern", 1000.0, 1000.0, 950000 + 100 * o as u32 + k, "somewhere", Lived { loss_days: None, rank: Some(0.5), clothes_pct: Some(100.0) })
}

fn images(out: &Portrait) -> Vec<&str> {
    out.surfaces.iter().filter_map(|s| s.tex.as_deref()).collect()
}

fn has(out: &Portrait, part: &str) -> bool {
    images(out).iter().any(|t| t.contains(part))
}

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

/// The colour of the skin at a place of its image.
fn skin_at(out: &Portrait, u: f32, v: f32) -> [f32; 3] {
    let s = out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains("/skin_"))).max_by_key(|s| s.pos.len()).expect("the skin");
    let k = (0..s.uv.len()).min_by(|&a, &b| {
        let d = |i: usize| (s.uv[i][0] - u).powi(2) + (s.uv[i][1] - v).powi(2);
        d(a).total_cmp(&d(b))
    });
    s.col[k.unwrap()]
}

#[test]
fn every_pool_founds_people_in_the_plain_dress_of_1356() {
    let Some(h) = head() else { return };
    for pool in ORIGINS {
        for (female, age) in [(true, 24.0), (false, 30.0), (true, 60.0), (false, 4.0)] {
            let p = of(pool, if female { 0 } else { 1 }, female, age);
            assert_eq!(p.dress, Dress::Plain1356, "{pool}");
            let out = build(&h, &p, 2);
            assert!(has(&out, "/skin_"), "{pool}: a skin");
            assert!(has(&out, "/cloth_cote") || has(&out, "/cloth_kirtle"), "{pool}: a gown: {:?}", images(&out));
            // no hood, no veil and no wimple: a head is bare, and has hair unless it has lost it
            for cloth in ["cloth_hood", "cloth_veil", "cloth_wimple"] {
                assert!(!has(&out, cloth), "{pool}, {} of {age}: wears {cloth}", if female { "a woman" } else { "a man" });
            }
            if female {
                assert!(has(&out, "_body.") || has(&out, "_fleece."), "{pool}: a woman of {age} has hair to see: {:?}", images(&out));
            }
        }
    }
}

#[test]
fn tightly_curled_hair_is_a_mass_of_its_own() {
    let Some(h) = head() else { return };
    // south of the Sahara every founder's curl lies over the table's threshold: no bundles, on anyone
    for pool in ["Guinea", "Kalahari"] {
        for k in 0..6 {
            for (female, age) in [(k % 2 == 0, 24.0), (k % 2 == 0, 4.0), (k % 2 == 0, 13.0)] {
                let out = build(&h, &of(pool, k, female, age), 2);
                assert!(has(&out, "hair1356_fleece."), "{pool} {k}, {age}: {:?}", images(&out));
                assert!(!has(&out, "hair1356_body.") && !has(&out, "_rope."), "{pool} {k}, {age}: bundles or plaits beside it: {:?}", images(&out));
            }
        }
    }
    // an old man who has lost his hair on top: the horseshoe, or the bare head's painted layer alone
    let old: Vec<Portrait> = (0..12).map(|k| build(&h, &of("Guinea", 2 * k + 1, false, 68.0), 2)).collect();
    assert!(old.iter().all(|out| !has(out, "hair1356_body.")));
    // nobody of the pools with straight or wavy hair wears it, and nobody of England's sample
    for pool in ["Germania", "China", "America", "Hindustan"] {
        for k in 0..6 {
            assert!(!has(&build(&h, &of(pool, k, k % 2 == 0, 24.0), 2), "_fleece."), "{pool} {k}");
        }
    }
    for k in 0..36 {
        assert!(!has(&build(&h, &person(k, k % 2 == 0, 30.0), 2), "_fleece."), "England {k}");
    }
}

#[test]
fn every_head_of_a_dress_with_a_table_is_drawn_without_the_light_painted_into_the_skins_image() {
    let Some(h) = head() else { return };
    // MakeHuman's images of the skin have the light of the photographs they are made from painted round the
    // nose's root. Round 111 took the image without it for a head whose root is flat; since round 113 every head
    // of a dress with a table takes it, since the stage lights the face (on every face the painted light stood
    // as a pale band from the nose's root under the eyes). Apoleia's dress keeps the image as it is
    for pool in ["China", "Siberia", "Guinea"] {
        for k in 0..12 {
            assert!(has(&build(&h, &of(pool, k, k % 2 == 0, 30.0), 2), "_flat."), "{pool} {k}");
        }
    }
    for k in 0..36 {
        for age in [3.0, 9.0, 30.0, 60.0] {
            assert!(has(&build(&h, &person(k, k % 2 == 0, age), 2), "_flat."), "England {k} of {age}");
        }
    }
    let roman = Look { dress: Dress::Roman, ..person(1, true, 30.0) };
    assert!(!has(&build(&h, &roman, 2), "_flat."), "Apoleia's dress");
}

#[test]
fn lips_show_less_blood_through_dark_skin() {
    let Some(h) = head() else { return };
    // how much redder the lower lip is than the skin over the upper lip (red over green, lip against skin), on
    // founders of Guinea and on the same people with a pale skin
    let red = |p: &Look| {
        let out = build(&h, p, 2);
        let (lip, by) = (skin_at(&out, 0.918, 0.5168), skin_at(&out, 0.890, 0.5168));
        (lip[0] / lip[1].max(1e-4)) / (by[0] / by[1].max(1e-4))
    };
    for k in 0..6 {
        let dark = of("Guinea", k, k % 2 == 0, 30.0);
        let mut pale = dark.clone();
        pale.genes[26] = 30.0;
        let (d, p) = (red(&dark), red(&pale));
        if show() {
            println!("Guinea {k}: the lower lip's red against the skin's: {d:.2}, with a pale skin {p:.2}");
        }
        assert!(d > 1.0, "Guinea {k}: a lip without any red ({d:.2})");
        assert!(d - 1.0 < 0.6 * (p - 1.0), "Guinea {k}: as red on dark skin ({d:.2}) as on pale ({p:.2})");
    }
    // England's lips are as they were: every founder's skin is lighter than where the rule begins
    let e = sc_portrait::dress::Dress::England1356.set().unwrap();
    assert!(e.lips.iter().all(|l| l.dark[0] <= 0.38));
}
