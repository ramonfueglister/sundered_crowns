//! The fillet of England 1356 (round 128): a stiffened band of linen on the hair of women in plaits (the real
//! look: a file of its own, see tests/common).

mod common;

use common::{head, person};
use sc_portrait::build;
use sc_portrait::dress::{Veil, ENGLAND_1356, PLAIN_1356};

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

#[test]
fn three_in_ten_of_the_women_in_plaits_wear_a_fillet_from_fifteen() {
    let d = &ENGLAND_1356;
    let count = |age: f32, female: bool| (0..100_000u32).filter(|&s| d.fillet_of(female, age, s)).count();
    // every girl of 15 to 19 is in plaits, three in ten of the women of 20 to 29
    assert_eq!((count(14.0, true), count(17.0, true), count(25.0, true), count(35.0, true), count(25.0, false)), (0, 30_000, 9_000, 0, 0));
    assert!((0..100_000u32).all(|s| !d.fillet_of(true, 25.0, s) || d.veil_of(true, 25.0, s) == Veil::None));
    assert!((0..1000).all(|s| !PLAIN_1356.fillet_of(true, 17.0, s)));
}

#[test]
fn the_band_stands_round_the_forehead_on_the_hair() {
    // On forty young women (heads of every form the pool has): who wears the band by her seed has it and nobody
    // else; it is one closed band (480 corners) that lies round the head between the eyes and the crown, its foot
    // over the forehead above the eyes, its top not above the hair's crown by more than a centimetre, about as
    // broad as the hair, and no hair comes through it anywhere round the head.
    let Some(h) = head() else { return };
    let (mut with, mut without) = (0, 0);
    for k in (0..80).step_by(2) {
        let p = person(k, true, 17.0 + (k % 5) as f32 * 3.0);
        let out = build(&h, &p, 1);
        let band = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(ENGLAND_1356.fillet)));
        assert_eq!(band.is_some(), ENGLAND_1356.fillet_of(true, p.age, p.seed), "person {k} of {}", p.age);
        let Some(b) = band else {
            without += 1;
            continue;
        };
        with += 1;
        assert!(!b.mat.double && b.pos.len() == 960 * 3, "person {k}: {} corners, seen from both sides: {}", b.pos.len(), b.mat.double);
        let hair = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("_body."))).expect("the hair");
        let eye = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("eyeball"))).expect("the eyes");
        let eyes = eye.pos.iter().map(|q| q[1]).sum::<f32>() / eye.pos.len() as f32;
        let range = |s: &sc_portrait::Surface, a: usize| s.pos.iter().fold((f32::MAX, f32::MIN), |(lo, hi), q| (lo.min(q[a]), hi.max(q[a])));
        let front = b.pos.iter().filter(|q| q[0].abs() < 0.15 && q[2] > out.cz).fold((f32::MAX, f32::MIN), |(lo, hi), q| (lo.min(q[1]), hi.max(q[1])));
        let (crown, (hx0, hx1), (bx0, bx1), (by0, by1)) = (range(hair, 1).1, range(hair, 0), range(b, 0), range(b, 1));
        // hair that comes through the band: round the band's middle in 72 directions, corners of the hair at the
        // band's height there (half a centimetre inside its foot and its top) that stand further out than it
        let mid = [(bx0 + bx1) / 2.0, (range(b, 2).0 + range(b, 2).1) / 2.0];
        let bin = |q: &[f32; 3]| (((q[0] - mid[0]).atan2(q[2] - mid[1]).to_degrees() + 180.0) / 5.0).min(71.0) as usize;
        let far = |q: &[f32; 3]| (q[0] - mid[0]).hypot(q[2] - mid[1]);
        let mut ring = [(f32::MAX, f32::MIN, 0f32); 72];
        for q in &b.pos {
            let r = &mut ring[bin(q)];
            *r = (r.0.min(q[1]), r.1.max(q[1]), r.2.max(far(q)));
        }
        // (round 132) the band's outer side faces out: of its triangles those whose normals point away from the
        // band's middle lie further from it than those whose normals point towards it (until then the band was
        // wound inside out, and its front was lit as the inside of a ring is)
        let (mut away, mut toward) = ((0f32, 0), (0f32, 0));
        for (t, n) in b.pos.chunks_exact(3).zip(b.nrm.chunks_exact(3)) {
            let f = (far(&t[0]) + far(&t[1]) + far(&t[2])) / 3.0;
            let side = if (t[0][0] - mid[0]) * n[0][0] + (t[0][2] - mid[1]) * n[0][2] > 0.0 { &mut away } else { &mut toward };
            *side = (side.0 + f, side.1 + 1);
        }
        let faces_out = away.0 / away.1 as f32 - toward.0 / toward.1 as f32;
        let through = hair.pos.iter().filter(|q| { let r = ring[bin(q)]; q[1] > r.0 + 0.05 && q[1] < r.1 - 0.05 && far(q) > r.2 }).count();
        if show() {
            println!("person {k} of {}: eyes {eyes:.2}, band's front {:.2} to {:.2} ({:.1} cm over the eyes), crown {crown:.2}, band {by0:.2} to {by1:.2}; band {:.1} cm broad, hair {:.1}; {through} corners of hair through it; the sides facing out lie {:.1} mm further out than those facing in", p.age, front.0, front.1, 10.0 * (front.0 - eyes), 10.0 * (bx1 - bx0), 10.0 * (hx1 - hx0), 100.0 * faces_out);
            continue;
        }
        assert!(front.0 - eyes > 0.25 && front.0 - eyes < 0.7, "person {k}: the band's foot {} cm over the eyes", 10.0 * (front.0 - eyes));
        assert!(by1 < crown + 0.1 && by0 > eyes, "person {k}: the band from {by0} to {by1}, eyes {eyes}, crown {crown}");
        assert!(bx1 - bx0 > hx1 - hx0 - 0.3 && bx1 - bx0 < hx1 - hx0 + 0.35, "person {k}: the band {} cm broad, the hair {}", 10.0 * (bx1 - bx0), 10.0 * (hx1 - hx0));
        assert_eq!(through, 0, "person {k}: hair through the band");
        assert!(faces_out > 0.005, "person {k}: the band's sides that face out lie {faces_out} further out than those that face in");
    }
    assert!(show() || (with >= 5 && without >= 15), "{with} with a band, {without} without");
}
