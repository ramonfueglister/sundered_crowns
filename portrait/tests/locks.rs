//! The hair of England's men, boys and small children as the builder puts it on a head (the real look: a file of
//! its own, see tests/common): locks, since round 87.

mod common;

use common::{head, person};
use sc_portrait::{build, Portrait, Surface};

type V3 = [f32; 3];

fn sub(a: V3, b: V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn cross(a: V3, b: V3) -> V3 {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
fn dot(a: V3, b: V3) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn len(a: V3) -> f32 {
    dot(a, a).sqrt()
}

/// The image all locks of England's hair are drawn with (`DressSet::lock_image`).
const IMAGE: &str = "/hair1356_rope.";
/// The share of the image's height that is a lock's length; below it its frayed end
/// (`tools/portrait/pipeline/hairlib.py` `LOCK_BODY`, `LOCK_END`).
const LOCK_BODY: f32 = 0.75;
const LOCK_END: f32 = 0.985;
/// The triangles of the cards the locks took the place of (`bob01`: 520 cards of 14 pieces of four).
const CARDS: usize = 29_120;

fn locks(out: &Portrait) -> Option<&Surface> {
    out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(IMAGE)))
}

/// The skin of the head, and its highest point.
fn skin(out: &Portrait) -> (&Surface, f32) {
    let skin = out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains("/skin_"))).max_by_key(|s| s.pos.len()).expect("skin");
    (skin, skin.pos.iter().map(|p| p[1]).fold(f32::MIN, f32::max))
}

#[test]
fn a_man_of_england_wears_locks() {
    // Until round 87 the hair of men, boys and small children was cards: 520 flat strips, blended, throwing no
    // shadow, each lit as one face turned away from the head's centre, each ending in a straight edge: a cap of
    // paper strips with a fringe like a comb. Now it is locks: arched bands (the upper half of a lens in
    // section), solid, lit by the direction of their own surface, frayed at both ends by their image. No cards.
    let Some(h) = head() else { return };
    // loose hair in three lengths, under a hood, a horseshoe round a bare top, gone back at the temples; small
    // children of either sex
    for (k, female, age) in [(1u32, false, 8.0f32), (3, false, 13.0), (45, false, 13.0), (5, false, 17.0), (21, false, 24.0), (25, false, 50.0), (27, false, 68.0), (28, true, 2.0), (31, false, 5.0)] {
        let out = build(&h, &person(k, female, age), 1);
        let who = format!("person {k} of {age}");
        let hair = locks(&out).unwrap_or_else(|| panic!("{who}: locks"));
        let cards = out.surfaces.iter().filter_map(|s| s.tex.as_deref()).find(|t| t.contains("/bob0") && !t.contains("_cap."));
        assert_eq!(cards, None, "{who}: no cards beside the locks");
        assert!(out.surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains("/bob0") && t.contains("_cap."))), "{who}: the painted layer under the hair");
        // a band is not a closed surface: it is seen from both sides
        assert!(hair.mat.double, "{who}: a lock is seen from both sides");
        let n = hair.pos.len() / 3;
        assert!(n > CARDS / 2 && n < CARDS * 13 / 10, "{who}: {n} triangles of locks, the cards had {CARDS}");
        assert_eq!((hair.uv.len(), hair.nrm.len()), (hair.pos.len(), hair.pos.len()), "{who}: every corner has its place in the image and its direction");
        // the upper side of a lock faces away from the head: the directions of its corners are its own surface's
        // (a card's were the direction from the head's centre)
        let (_, crown) = skin(&out);
        let centre = [out.cx, crown - 0.45 * (crown - out.chin), out.cz];
        let (mut area, mut outward, mut own) = (0f32, 0f32, 0f32);
        for (t, c) in hair.pos.chunks_exact(3).zip(hair.nrm.chunks_exact(3)) {
            let face = cross(sub(t[1], t[0]), sub(t[2], t[0]));
            let mid = [0, 1, 2].map(|a| (t[0][a] + t[1][a] + t[2][a]) / 3.0);
            area += len(face);
            if dot(face, sub(mid, centre)) > 0.0 {
                outward += len(face);
            }
            for d in c {
                assert!((len(*d) - 1.0).abs() < 1e-3 || len(*d) == 0.0, "{who}: a direction of length {}", len(*d));
                // how far a corner's direction is from the direction a card would have had there
                own += len(face) / 3.0 * (1.0 - dot(*d, sub(mid, centre)) / len(sub(mid, centre)).max(1e-9));
            }
        }
        assert!(outward / area > 0.9, "{who}: {} of the locks' surface faces away from the head", outward / area);
        assert!(own / area > 0.02, "{who}: the locks are lit as cards were ({})", own / area);
        // the image: a lock's length in its upper part, both its ends in the frayed part below, and never the
        // image's lower edge (there its top shows again)
        let v: Vec<f32> = hair.uv.iter().map(|u| u[1]).collect();
        assert!(v.iter().all(|&v| (-1e-4..=LOCK_END + 1e-4).contains(&v)), "{who}: a place below the image's last hairs");
        let frayed = v.iter().filter(|&&v| v > LOCK_BODY + 1e-3).count() as f32 / v.len() as f32;
        assert!((0.15..0.6).contains(&frayed), "{who}: {frayed} of the locks' corners lie in the frayed part");
    }
}

#[test]
fn locks_lie_on_a_head_of_any_size() {
    // A lock is bound to the head ring by ring and goes with it; its way with the head is evened out along it a
    // few times only (the file's own count). Evened out to the end, as a plait's is, a lock moves as one stiff
    // piece: on a child of two the hair then stood 2.7 cm over the crown as a hat (on the head it was laid on,
    // 1.4) and the fringe hung over the eyes (0.49 of the head's height below the crown; now 0.37).
    let Some(h) = head() else { return };
    for (k, female, age) in [(28u32, true, 2.0f32), (29, false, 2.0), (30, true, 5.0), (31, false, 5.0), (1, false, 8.0), (3, false, 13.0), (45, false, 13.0), (21, false, 24.0), (27, false, 68.0)] {
        let out = build(&h, &person(k, female, age), 1);
        let who = format!("person {k} of {age}");
        let hair = locks(&out).unwrap_or_else(|| panic!("{who}: locks"));
        let (skin, crown) = skin(&out);
        let top = hair.pos.iter().map(|p| p[1]).fold(f32::MIN, f32::max);
        assert!((0.07..0.18).contains(&(top - crown)), "{who}: the hair's top lies {} over the crown (1 is 10 cm)", top - crown);
        // the fringe: the lowest corner of the locks in front of the face's middle fifth
        let upper = crown - 0.3 * (crown - out.chin);
        let broad = skin.pos.iter().filter(|p| p[1] > upper).map(|p| (p[0] - out.cx).abs()).fold(0f32, f32::max);
        let fringe = hair.pos.iter().filter(|p| (p[0] - out.cx).abs() < 0.25 * broad && p[2] > out.cz).map(|p| p[1]).fold(f32::MAX, f32::min);
        let ends = (crown - fringe) / (crown - out.chin);
        assert!((0.27..0.42).contains(&ends), "{who}: the fringe ends {ends} of the head's height below the crown");
    }
}
