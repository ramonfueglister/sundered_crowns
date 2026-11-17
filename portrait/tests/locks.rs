//! The hair of England's men, boys and small children as the builder puts it on a head (the real look: a file of
//! its own, see tests/common): locks, since round 87.

mod common;

use common::{head, person};
use sc_portrait::{build, Beard, Portrait, Surface};

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
const IMAGE: &str = "/hair1356_locks.";
/// The share of the image's height that is a lock's length; below it its frayed end
/// (`tools/portrait/pipeline/hairlib.py` `LOCK_BODY`, `LOCK_END`).
const LOCK_BODY: f32 = 0.75;
const LOCK_END: f32 = 0.985;
/// The triangles of the cards the locks took the place of (`bob01`: 520 cards of 14 pieces of four).
const CARDS: usize = 29_120;

/// The image the locks of England's beards are drawn with (`DressSet::beard_lock_image`).
const BEARD_IMAGE: &str = "/beard1356_locks.";

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

#[test]
fn a_girl_wears_her_hair_parted_and_drawn_to_her_plaits() {
    // Until round 88 the hair of a girl's head was cards, as a man's was: blotched from the side where cards
    // lay over each other, a ragged tuft at the ear where it is gathered. Now it is locks, laid for hair that is
    // long, parted in the middle and drawn to one place below each ear (`styles.py`, style `plait`).
    let Some(h) = head() else { return };
    for (k, age) in [(0u32, 8.0f32), (2, 13.0), (4, 17.0), (14, 8.0), (16, 13.0), (18, 17.0), (6, 19.0)] {
        let out = build(&h, &person(k, true, age), 1);
        let who = format!("girl {k} of {age}");
        let hair = locks(&out).unwrap_or_else(|| panic!("{who}: locks"));
        assert!(hair.mat.double, "{who}: a lock is seen from both sides");
        let named = |part: &str| out.surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains(part)));
        assert!(named("/plait01_cap.") && named("/plait01_rope."), "{who}: the painted layer and the plaits");
        assert!(!named("/plait01."), "{who}: no cards beside the locks");
        let (skin, crown) = skin(&out);
        let height = crown - out.chin;
        // sleek: the hair lies closer to the skull than a man's cut (that: 1.0 to 1.5 cm over the crown)
        let top = hair.pos.iter().map(|p| p[1]).fold(f32::MIN, f32::max);
        assert!((0.03..0.09).contains(&(top - crown)), "{who}: the hair's top lies {} over the crown (1 is 10 cm)", top - crown);
        // parted: no fringe, the forehead is free
        let upper = crown - 0.3 * height;
        let broad = skin.pos.iter().filter(|p| p[1] > upper).map(|p| (p[0] - out.cx).abs()).fold(0f32, f32::max);
        let front = hair.pos.iter().filter(|p| (p[0] - out.cx).abs() < 0.25 * broad && p[2] > out.cz).map(|p| p[1]).fold(f32::MAX, f32::min);
        assert!((crown - front) / height < 0.2, "{who}: hair on the forehead down to {} of the head's height", (crown - front) / height);
        // the locks of either side meet in the parting: a lock begins before its strands' roots, so the
        // beginnings of both sides reach across the head's middle (300 to 370 triangles; begun at the middle of
        // their roots, a finger's breadth off the parting, 0 to 85: a bare strip between two rows of ends)
        let on_top = |p: &V3| p[1] > crown - 0.12 * height;
        let across = hair.pos.chunks_exact(3).zip(hair.uv.chunks_exact(3)).filter(|(t, u)| u.iter().any(|u| u[1] > LOCK_END - 1e-3) && t.iter().all(on_top) && t.iter().any(|p| p[0] > out.cx) && t.iter().any(|p| p[0] < out.cx)).count();
        assert!(across > 200, "{who}: {across} triangles of a lock's beginning lie across the parting");
        // drawn to the plait below the ear, on the neck: the lower part of the hair is nowhere further than
        // 1.8 cm from the skin (1.4 to 1.5; over "the farthest skin within reach", which the neck's slope
        // lifts, 2.0 to 2.4: a sheet of hair under the jaw)
        let low = hair.pos.iter().map(|p| p[1]).fold(f32::MAX, f32::min);
        assert!((0.65..0.84).contains(&((crown - low) / height)), "{who}: the hair ends {} of the head's height below the crown", (crown - low) / height);
        let off = hair.pos.iter().filter(|p| p[1] < crown - 0.62 * height).step_by(3).map(|p| skin.pos.iter().map(|q| len(sub(*p, *q))).fold(f32::MAX, f32::min)).fold(0f32, f32::max);
        assert!(off < 0.18, "{who}: hair {off} off the skin below the ear");
    }
}

#[test]
fn hair_that_is_cut_runs_to_the_cut_and_wears_as_much_of_the_image_as_it_is_long() {
    // Round 89, two things the fringe of a man's cut showed.
    // The image. Its length part was laid along a lock once up and back whatever the lock's length: on a lock
    // of three centimetres a hand's length of hair, pressed together two to three times on every head (the
    // median; six times and more on the shortest locks, where hairs that sway turn into a dark net of crossing
    // lines: the block at the temple of a short cut, the scales of a bald head's horseshoe). Now a short lock
    // wears as much of the image as it is long.
    // The cut. A strand ended where its length ended, and the length followed from the height of its root. On
    // top of the head the hair runs away from the whorl, so strands that set off forward ended on the top and
    // on the forehead: lock ends all over the head, and one layer of locks, with holes, where the fringe ends.
    // Now every strand runs to the line the hair is cut at, and the fringe is several locks deep.
    let Some(h) = head() else { return };
    for (k, female, age, fringed) in [(1u32, false, 8.0f32, true), (3, false, 13.0, true), (45, false, 13.0, true), (5, false, 17.0, true), (21, false, 24.0, true), (25, false, 50.0, false), (27, false, 68.0, true), (28, true, 2.0, true), (31, false, 5.0, true)] {
        let out = build(&h, &person(k, female, age), 1);
        let who = format!("person {k} of {age}");
        let hair = locks(&out).unwrap_or_else(|| panic!("{who}: locks"));
        // how much of the image's height lies on a unit of a lock's length (1 is 10 cm), triangle by triangle
        // of the length part: the two corners of one ring have one height in the image, the third another
        let mut dense: Vec<f32> = Vec::new();
        for (t, u) in hair.pos.chunks_exact(3).zip(hair.uv.chunks_exact(3)) {
            if u.iter().any(|u| u[1] > LOCK_BODY - 1e-3) {
                continue;
            }
            let (a, b, c) = if (u[0][1] - u[1][1]).abs() < 1e-5 {
                (0, 1, 2)
            } else if (u[1][1] - u[2][1]).abs() < 1e-5 {
                (1, 2, 0)
            } else if (u[0][1] - u[2][1]).abs() < 1e-5 {
                (0, 2, 1)
            } else {
                continue;
            };
            let mid = [0, 1, 2].map(|i| 0.5 * (t[a][i] + t[b][i]));
            let (along, image) = (len(sub(t[c], mid)), (u[c][1] - u[a][1]).abs());
            if along > 1e-4 && image > 1e-6 {
                dense.push(image / along);
            }
        }
        dense.sort_by(|a, b| a.partial_cmp(b).expect("a number"));
        let at = |share: f32| dense[((dense.len() - 1) as f32 * share) as usize];
        // the image is made for LOCK_BODY of its height to a unit: 0.75; measured 0.68 to 1.04 in the median and
        // 1.16 to 1.62 at the 99th hundredth (a child's head is smaller, and where the image turns round on a
        // short lock it is laid 1.57 times as close); before 1.54 to 2.72 and 4.54 to 6.75
        assert!(at(0.5) < 1.3 && at(0.99) < 2.2, "{who}: the image is pressed together along the locks: {} in the median, {} at the 99th hundredth of a unit's {LOCK_BODY}", at(0.5), at(0.99));
        if !fringed {
            continue;
        }
        // the locks over the forehead, a centimetre and more above the lowest end of the fringe, across the
        // middle three fifths of the head's breadth: how many lie over each other at 84 places seen from the front
        let (skin, crown) = skin(&out);
        let height = crown - out.chin;
        let broad = skin.pos.iter().filter(|p| p[1] > crown - 0.3 * height).map(|p| (p[0] - out.cx).abs()).fold(0f32, f32::max);
        let fringe = hair.pos.iter().filter(|p| (p[0] - out.cx).abs() < 0.25 * broad && p[2] > out.cz).map(|p| p[1]).fold(f32::MAX, f32::min);
        let mut deep: Vec<u32> = Vec::new();
        for row in 0..4 {
            let y = fringe + (0.03 + 0.012 * row as f32) * height;
            for col in -10..=10 {
                let x = out.cx + 0.3 * broad * col as f32 / 10.0;
                let over = hair.pos.chunks_exact(3).filter(|t| {
                    let d = (t[1][1] - t[2][1]) * (t[0][0] - t[2][0]) + (t[2][0] - t[1][0]) * (t[0][1] - t[2][1]);
                    let w0 = ((t[1][1] - t[2][1]) * (x - t[2][0]) + (t[2][0] - t[1][0]) * (y - t[2][1])) / d;
                    let w1 = ((t[2][1] - t[0][1]) * (x - t[2][0]) + (t[0][0] - t[2][0]) * (y - t[2][1])) / d;
                    t[0][2] > out.cz && d.abs() > 1e-12 && w0 >= 0.0 && w1 >= 0.0 && w0 + w1 <= 1.0
                });
                deep.push(over.count() as u32);
            }
        }
        deep.sort();
        // measured: 3 to 6 locks in the median and 1 to 2 at the lowest tenth; before 0 to 1 and 0
        let (median, tenth) = (deep[deep.len() / 2], deep[deep.len() / 10]);
        assert!(median >= 2 && tenth >= 1, "{who}: the fringe is {median} locks deep in the median and {tenth} at its thinnest tenth");
    }
}

#[test]
fn a_full_beard_of_england_is_locks_over_its_painted_layer() {
    // Until round 90 a full beard was its painted layer alone: a smooth shell 3 to 6 mm off the jaw, with the
    // jaw's outline and a ruled upper edge on the cheek. Now locks lie over that layer (`beards.py`, style `crop`
    // with `CROP_LOCKS`): short and wavy, solid, each with a lit and a shaded flank, their ends the beard's
    // outline. They lie over the beard's form, not the skin's, and end where the beard does: left to run their
    // length they hang 0.17 to 0.22 of the head's height below the chin (as built 0.02 at most), and laid over
    // the skin itself they went down the throat as a collar (the first trial).
    let Some(h) = head() else { return };
    for (k, age) in [(1u32, 24.0f32), (3, 35.0), (5, 50.0), (7, 68.0), (9, 35.0), (11, 50.0), (13, 68.0)] {
        let mut p = person(k, false, age);
        p.beard = Some(Beard::Full);
        let out = build(&h, &p, 1);
        let who = format!("person {k} of {age}");
        let found: Vec<&Surface> = out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains(BEARD_IMAGE))).collect();
        assert_eq!(found.len(), 1, "{who}: one surface of a beard's locks");
        let beard = found[0];
        assert!(beard.mat.double, "{who}: a lock is seen from both sides");
        assert!(out.surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains("/beard_crop_cap."))), "{who}: the painted layer under the locks");
        // a head's locks are a surface of their own, with their own image
        assert!(locks(&out).is_none_or(|hair| !std::ptr::eq(hair, beard)), "{who}: the beard's locks are drawn with the hair's image");
        let n = beard.pos.len() / 3;
        assert!((8_000..30_000).contains(&n), "{who}: {n} triangles of locks");
        let (skin, crown) = skin(&out);
        let height = crown - out.chin;
        // the beard ends under the jaw: nothing of it lower than a tenth of the head's height below the chin,
        // and nothing of it above the eyes' height
        let (low, high) = beard.pos.iter().fold((f32::MAX, f32::MIN), |(l, t), p| (l.min(p[1]), t.max(p[1])));
        assert!((out.chin - low) / height < 0.1, "{who}: the beard hangs {} of the head's height below the chin", (out.chin - low) / height);
        assert!((crown - high) / height > 0.45, "{who}: the beard begins {} of the head's height below the crown", (crown - high) / height);
        // it has a thickness: its corners stand 3 mm off the skin in the median, the farthest less than 3 cm
        let near: Vec<&V3> = skin.pos.iter().filter(|q| q[1] < out.chin + 0.5 * height && q[1] > low - 0.1).collect();
        let mut off: Vec<f32> = beard.pos.iter().step_by(7).map(|p| near.iter().map(|q| len(sub(*p, **q))).fold(f32::MAX, f32::min)).collect();
        off.sort_by(|a, b| a.partial_cmp(b).unwrap());
        if std::env::var("SHOW").is_ok() {
            println!("{who}: {n} triangles, lowest {:.3} of the head's height below the chin, off the skin {:.3} in the median and {:.3} at most", (out.chin - low) / height, off[off.len() / 2], off[off.len() - 1]);
        }
        assert!(off[off.len() / 2] > 0.03 && off[off.len() - 1] < 0.3, "{who}: the locks stand {} off the skin in the median, {} at most (1 is 10 cm)", off[off.len() / 2], off[off.len() - 1]);
        // a beard greys from the chin: on an old man its colour is not one (a head's hair has one)
        let (dark, light) = beard.col.iter().map(|c| c[0] + c[1] + c[2]).fold((f32::MAX, f32::MIN), |(d, l), c| (d.min(c), l.max(c)));
        assert!(age < 68.0 || light > 1.02 * dark, "{who}: a beard of one colour");
    }
    // who wears another beard, or none, wears no locks on the jaw
    for beard in [Beard::Shaven, Beard::Stubble, Beard::Short] {
        let mut p = person(1, false, 35.0);
        p.beard = Some(beard);
        assert!(!build(&h, &p, 1).surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains(BEARD_IMAGE))), "locks on a jaw without a full beard");
    }
}
