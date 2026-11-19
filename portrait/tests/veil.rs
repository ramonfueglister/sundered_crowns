//! The veil and the wimple of England 1356 as the builder puts them on a head (the real look: a file of its own,
//! see tests/common).

mod common;

use common::{head, person};
use sc_portrait::dress::Veil;
use sc_portrait::measure::{MENTON, SELLION};
use sc_portrait::{build, Head, Look, LODS};

type V3 = [f32; 3];

/// What a woman wears on her head, in the head's own frame, in centimetres: from the nose's root (sellion), x
/// across, y up along the line from the chin's lowest point to the nose's root (the bust leans), z to the front.
struct Worn {
    skin: Vec<V3>,
    veil: Vec<V3>,
    wimple: Vec<V3>,
    /// The hair's body (the bundles of a cut, drawn with the dress's image of a bundle).
    hair: Vec<V3>,
    chin: V3,
    images: Vec<String>,
}

fn worn(h: &Head, p: &Look) -> Worn {
    let out = build(h, p, 1);
    let idx = &h.parts["body"][LODS - 1];
    let named = |part: &str| out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(part)));
    // the skin: its triangles' corners in the order of the head's own list (a strip that closes the lips after them)
    let skin = out.surfaces.iter().find(|s| s.pos.len() >= idx.len() && s.tex.as_deref().is_some_and(|t| t.contains("skin"))).expect("the skin");
    let at = |v: usize| skin.pos[idx.iter().position(|&i| i as usize == v).unwrap()];
    let (s, m) = (at(SELLION), at(MENTON));
    let l = (s[1] - m[1]).hypot(s[2] - m[2]);
    let (uy, uz) = ((s[1] - m[1]) / l, (s[2] - m[2]) / l);
    let to = |q: &V3| -> V3 {
        let (dy, dz) = (q[1] - s[1], q[2] - s[2]);
        [10.0 * (q[0] - s[0]), 10.0 * (dy * uy + dz * uz), 10.0 * (dz * uy - dy * uz)]
    };
    // (each point once: a surface lists the corners of its triangles)
    let once = |pos: &[V3]| -> Vec<V3> {
        let mut seen = std::collections::HashSet::new();
        pos.iter().filter(|q| seen.insert(q.map(f32::to_bits))).map(to).collect()
    };
    let of = |part: &str| named(part).map_or(Vec::new(), |s| once(&s.pos));
    Worn {
        skin: once(&skin.pos),
        veil: of("cloth_veil"),
        wimple: of("cloth_wimple"),
        hair: of("hair1356_body"),
        chin: to(&m),
        images: out.surfaces.iter().filter_map(|s| s.tex.clone()).collect(),
    }
}

fn dist(a: &V3, b: &V3) -> f32 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
}

/// The first `n` women of this age who wear the veil this way (`DressSet::veils`: by a digit of the seed).
fn women(n: usize, age: f32, veil: Veil) -> Vec<(u32, Look)> {
    (0..200).map(|k| (k, person(2 * k, true, age))).filter(|(_, p)| p.veil() == veil).take(n).collect()
}

/// How far a point is from the nearest corner of a surface.
fn off(q: &V3, of: &[V3]) -> f32 {
    of.iter().map(|s| dist(q, s)).fold(f32::MAX, f32::min)
}

#[test]
fn the_veil_of_england_lies_on_forehead_and_cheeks_and_falls_in_front_of_the_shoulders() {
    // Until round 70 the veil stood two centimetres off the head as a bathing cap with a flap behind: its rim
    // 1.5 cm off the cheeks, the ears to be seen inside it, nothing of it in front below the jaw, and the woman
    // read as bald. Now its rim lies on the forehead and on the cheeks in front of the ears, it falls from there
    // to the shoulders, and there is no hair under it that could come through.
    // (round 121: this is the veil of two women in ten now, `Veil::Closed`)
    let Some(h) = head() else { return };
    let closed = women(6, 30.0, Veil::Closed);
    assert_eq!(closed.len(), 6);
    for (k, p) in closed {
        let w = worn(&h, &p);
        assert!(!w.veil.is_empty(), "woman {k} wears no veil");
        assert!(!w.images.iter().any(|t| ["bun", "bob", "plait", "part", "hair1356"].iter().any(|hair| t.contains(hair))), "woman {k}: hair under the veil, {:?}", w.images);
        // over the middle of the forehead: the rim's lowest point, above the brows and below the hairline, on the skin
        let rim = w.veil.iter().filter(|q| q[0].abs() < 1.5 && q[2] > -5.0 && q[1] > 0.0).min_by(|a, b| a[1].total_cmp(&b[1])).expect("the veil over the forehead");
        let gap = off(rim, &w.skin);
        if std::env::var("SHOW").is_ok() {
            println!("woman {k}: rim {:.1} cm above the nose's root, {gap:.2} cm off the skin", rim[1]);
        }
        assert!(rim[1] > 2.0 && rim[1] < 6.5, "woman {k}: the rim {} cm above the nose's root", rim[1]);
        assert!(gap < 1.5, "woman {k}: the rim {gap} cm off the forehead");
        // at the height of the eyes: the rim on either cheek, the veil's foremost point there
        for side in [-1.0, 1.0] {
            let rim = w.veil.iter().filter(|q| q[0] * side > 0.0 && q[1].abs() < 1.0).max_by(|a, b| a[2].total_cmp(&b[2])).expect("the veil beside the eye");
            let gap = off(rim, &w.skin);
            if std::env::var("SHOW").is_ok() {
                println!("    beside the eye: {:.1} cm from the middle, {:.1} cm behind the nose's root, {gap:.2} cm off the skin", rim[0], -rim[2]);
            }
            // (the hem's own roll is 0.6 cm thick; the veil of round 69: 1.5 cm)
            assert!(gap < 1.3, "woman {k}: the rim {gap} cm off the cheek");
            // (the ear's hole lies some 10 cm behind the nose's root)
            assert!(rim[2] > -6.0, "woman {k}: the rim {} cm behind the nose's root, at the ear", -rim[2]);
        }
        // the ear's outermost point is under the veil (a veil close to the skull let the ears through, round 70)
        for side in [-1.0, 1.0] {
            let ear = w.skin.iter().filter(|q| q[1] > -7.0 && q[1] < 1.0 && q[2] > -14.0 && q[2] < -7.0).max_by(|a, b| (a[0] * side).total_cmp(&(b[0] * side))).expect("an ear");
            let over = w.veil.iter().filter(|q| dist(ear, q) < 1.5).map(|q| q[0] * side).fold(0.0, f32::max);
            if std::env::var("SHOW").is_ok() {
                println!("    the ear {:.1} cm from the middle, the veil round it up to {over:.1} cm", ear[0] * side);
            }
            assert!(over > ear[0] * side + 0.1, "woman {k}: the ear at {} cm, the veil round it at {over} cm", ear[0] * side);
        }
        // below the chin the veil hangs in front of the shoulders too, not only behind them
        let front = w.veil.iter().filter(|q| q[1] < w.chin[1] - 4.0 && q[2] > -7.0 && q[0].abs() > 3.0).count();
        if std::env::var("SHOW").is_ok() {
            println!("    {front} points of the veil hang in front below the chin");
        }
        assert!(front > 50, "woman {k}: {front} points of the veil in front below the chin");
    }
}

#[test]
fn the_wimple_of_an_older_woman_lies_under_her_veil() {
    // The wimple is pinned up under the veil: above the jaw none of it may come through the veil's cloth (as its
    // hem did while the veil's rim came down on the skin and the wimple stood off it, in round 70).
    let Some(h) = head() else { return };
    let closed = women(6, 60.0, Veil::Closed);
    assert_eq!(closed.len(), 6);
    for (k, p) in closed {
        let w = worn(&h, &p);
        assert!(!w.veil.is_empty() && !w.wimple.is_empty(), "woman {k} wears no veil and wimple");
        let (mut n, mut out, mut most) = (0, 0, 0.0f32);
        for q in w.wimple.iter().filter(|q| q[1] > w.chin[1] + 5.0) {
            let over = w.veil.iter().min_by(|a, b| dist(q, a).total_cmp(&dist(q, b))).unwrap();
            // (only where the veil is near: beside the face's opening the wimple shows, as it should)
            if dist(q, over) < 1.0 {
                n += 1;
                // how much further off the skin than the veil over it (the veil's own normal says less: where
                // the veil folds, behind the jaw, it points every way)
                let above = off(q, &w.skin) - off(over, &w.skin);
                most = most.max(above);
                out += (above > 0.15) as usize;
            }
        }
        if std::env::var("SHOW").is_ok() {
            println!("woman {k}: {n} points of the wimple under the veil, {out} of them outside it, at most by {most:.2} cm");
        }
        assert!(n > 200, "woman {k}: {n} points of the wimple under the veil");
        assert!(out * 100 < n, "woman {k}: {out} of {n} points of the wimple outside the veil, at most by {most} cm");
    }
}

#[test]
fn a_veil_set_back_shows_the_hair_over_the_forehead_and_keeps_it_under_the_cloth() {
    // Round 121: until then every grown woman of England wore the veil on forehead and cheeks, and none showed a
    // hair. Five in ten now wear it set back over parted hair (`Veil::Back`, `cloth_veil_back`, `part01`): its rim
    // lies behind the hairline, the hair shows in front of it, covers the ears, has no plaits, and does not come
    // through the cloth behind the rim.
    let Some(h) = head() else { return };
    for age in [30.0, 60.0] {
        let back = women(6, age, Veil::Back);
        assert_eq!(back.len(), 6);
        for (k, p) in back {
            let w = worn(&h, &p);
            assert!(!w.veil.is_empty() && !w.hair.is_empty(), "woman {k} of {age}: no veil or no hair under it, {:?}", w.images);
            assert!(w.images.iter().any(|t| t.contains("plait01_cap")) && !w.images.iter().any(|t| t.contains("_rope")), "woman {k} of {age}: a girl's painted layer and no plaits, {:?}", w.images);
            assert_eq!(w.wimple.is_empty(), age < 50.0, "woman {k} of {age}: the wimple");
            // over the middle of the forehead: the veil's rim, and the hair's lowest point in front of it
            // (the rim lies on the top of the head, further behind the nose's root than a closed veil's)
            let rim = w.veil.iter().filter(|q| q[0].abs() < 1.5 && q[2] > -9.0 && q[1] > 0.0).min_by(|a, b| a[1].total_cmp(&b[1])).expect("the veil over the forehead");
            let line = w.hair.iter().filter(|q| q[0].abs() < 1.5 && q[2] > -9.0 && q[1] > 0.0).min_by(|a, b| a[1].total_cmp(&b[1])).expect("hair over the forehead");
            // the ear's outermost point is under the hair
            let mut ears = [0.0f32; 2];
            for (e, side) in [-1.0f32, 1.0].into_iter().enumerate() {
                let ear = w.skin.iter().filter(|q| q[1] > -7.0 && q[1] < 1.0 && q[2] > -14.0 && q[2] < -7.0).max_by(|a, b| (a[0] * side).total_cmp(&(b[0] * side))).expect("an ear");
                let over = w.hair.iter().filter(|q| dist(ear, q) < 1.5).map(|q| q[0] * side).fold(0.0, f32::max);
                ears[e] = over - ear[0] * side;
            }
            // behind the rim (a finger's breadth behind its rearmost place, beside the eyes): the hair under the
            // veil's cloth, no further off the skin than the cloth over it
            let beside = [-1.0f32, 1.0].map(|side| w.veil.iter().filter(|q| q[0] * side > 0.0 && q[1].abs() < 1.0).map(|q| q[2]).fold(f32::MIN, f32::max));
            let behind = beside[0].min(beside[1]).min(rim[2]) - 1.5;
            let (mut n, mut out, mut most) = (0, 0, 0.0f32);
            for q in w.hair.iter().filter(|q| q[2] < behind) {
                let over = w.veil.iter().min_by(|a, b| dist(q, a).total_cmp(&dist(q, b))).unwrap();
                if dist(q, over) < 1.0 {
                    n += 1;
                    let above = off(q, &w.skin) - off(over, &w.skin);
                    most = most.max(above);
                    out += (above > 0.15) as usize;
                }
            }
            let front = w.veil.iter().filter(|q| q[1] < w.chin[1] - 4.0 && q[2] > -7.0 && q[0].abs() > 3.0).count();
            if std::env::var("SHOW").is_ok() {
                println!("woman {k} of {age}: the rim {:.1} cm above the nose's root, the hair from {:.1} cm; the hair {:.1} and {:.1} cm outside the ears; the rim beside the eyes {:.1} and {:.1} cm behind the nose's root; {n} points of hair near the cloth, {out} outside it, at most by {most:.2} cm; {front} points of the veil in front below the chin", rim[1], line[1], ears[0], ears[1], -beside[0], -beside[1]);
            }
            assert!(rim[1] > 6.5 && rim[1] < 12.0, "woman {k} of {age}: the rim {} cm above the nose's root", rim[1]);
            assert!(rim[1] - line[1] > 2.0, "woman {k} of {age}: hair from {} cm, the rim at {} cm", line[1], rim[1]);
            assert!(ears[0] > 0.1 && ears[1] > 0.1, "woman {k} of {age}: the hair {ears:?} cm outside the ears");
            assert!(n > 200 && out * 50 < n, "woman {k} of {age}: {out} of {n} points of the hair outside the veil, at most by {most} cm");
            assert!(front > 50, "woman {k} of {age}: {front} points of the veil in front below the chin");
        }
    }
}
