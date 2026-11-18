//! The full beard of England's men as the builder puts it on a jaw (the real look: a file of its own, see
//! tests/common): locks, since round 90. (A head's hair was locks from round 87 to 108; it is a modelled body
//! now, tests/hair_body.rs.)

mod common;

use common::{head, person};
use sc_portrait::measure::lips;
use sc_portrait::{build, morph_test, Beard, Portrait, Surface};

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

/// The image the bundles of England's head hair are drawn with (`DressSet::body_image`).
const IMAGE: &str = "/hair1356_body.";

/// The image the locks of England's beards are drawn with (`DressSet::beard_lock_image`).
const BEARD_IMAGE: &str = "/beard1356_locks.";

fn head_hair(out: &Portrait) -> Option<&Surface> {
    out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(IMAGE)))
}

/// The skin of the head, and its highest point.
fn skin(out: &Portrait) -> (&Surface, f32) {
    let skin = out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains("/skin_"))).max_by_key(|s| s.pos.len()).expect("skin");
    (skin, skin.pos.iter().map(|p| p[1]).fold(f32::MIN, f32::max))
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
        // a head's hair is a surface of its own, with its own image
        assert!(head_hair(&out).is_none_or(|hair| !std::ptr::eq(hair, beard)), "{who}: the beard's locks are drawn with the hair's image");
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

#[test]
fn a_full_beard_closes_round_the_mouth_and_keeps_to_the_jaw() {
    // Round 90's locks left a ring round the mouth that the painted layer alone filled: the zone's mouth is the
    // base's, with fuller lips than a man of England's and a margin. The moustache's strands were cut there
    // after a few millimetres (chips on the upper lip) and the chin's locks began a centimetre below the lower
    // lip. And the zone ran backwards below the ear: in profile a bib on the side of the neck. Since round 91
    // the locks have a mouth of their own, the moustache its own strands along the lip, and the zone's back edge
    // comes down in front of the jaw's angle (`beards.py`: `CROP_LOCK_MOUTH`, `CROP_M_LOCKS`, `CROP_BACK`).
    let Some(h) = head() else { return };
    let mut bad: Vec<String> = Vec::new();
    for (k, age) in [(1u32, 24.0f32), (3, 35.0), (5, 50.0), (7, 68.0), (9, 35.0), (11, 50.0), (13, 68.0)] {
        let mut p = person(k, false, age);
        p.beard = Some(Beard::Full);
        let out = build(&h, &p, 1);
        let who = format!("person {k} of {age}");
        let beard = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(BEARD_IMAGE))).unwrap_or_else(|| panic!("{who}: a beard's locks"));
        let (skin, crown) = skin(&out);
        let height = crown - out.chin;
        // the band the locks leave free at the middle of the face: the widest gap between the heights of their
        // corners there, from under the nose to the chin. It is the mouth, as high as this man's lips are (round
        // 112: the red of the lips is 10 to 19 mm high from man to man): the hairs of the moustache and under the
        // lower lip hang over the red's edges, and no ring of skin lies bare round it
        let mut ys: Vec<f32> = beard.pos.iter().filter(|q| (q[0] - out.cx).abs() < 0.012 * height * 10.0 / 2.3 && q[1] > out.chin + 0.05 * height && q[1] < out.chin + 0.4 * height && q[2] > out.cz).map(|q| q[1]).collect();
        ys.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let free = ys.windows(2).map(|w| w[1] - w[0]).fold(0f32, f32::max) / height;
        // the beard's back edge: its hindmost corner in front of the ear (0.3 to 0.35 of the head's height above
        // the chin) and near the neckline (up to 0.1 above the chin), against the head's depth (from the hindmost
        // skin of the head to the foremost, the tip of the nose). The edge comes down, it does not run backwards
        // onto the side of the neck
        let (back, front) = skin.pos.iter().filter(|q| q[1] > out.chin).fold((f32::MAX, f32::MIN), |(b, f), q| (b.min(q[2]), f.max(q[2])));
        let hind = |from: f32, to: f32| (beard.pos.iter().filter(|q| q[1] > out.chin + from * height && q[1] < out.chin + to * height).map(|q| q[2]).fold(f32::MAX, f32::min) - back) / (front - back);
        let (ear, neck) = (hind(0.3, 0.35), hind(-1.0, 0.1));
        if std::env::var("SHOW").is_ok() {
            println!("{who}: the mouth's free band {free:.3} of the head's height, the beard's hindmost corner in front of the ear {ear:.3} and near the neckline {neck:.3} of the head's depth, {} triangles", beard.pos.len() / 3);
        }
        // measured: 0.028 to 0.053 of the head's height free, 0.63 to 0.80 of what the red of the two lips is
        // high (round 90's files 0.102 to 0.120 of the head's height on lips of 13 mm: a ring of 6 to 8 mm round
        // the lips, twice the lips' height)
        let red = lips(&morph_test(&h, &p))[2];
        let of_lips = free * height * 100.0 / red;
        if std::env::var("SHOW").is_ok() {
            println!("{who}: the red of the lips {red:.1} mm high, the free band {of_lips:.2} of it");
        }
        if !(of_lips > 0.55 && of_lips < 1.3) {
            bad.push(format!("{who}: the locks leave {free} of the head's height free at the mouth, {of_lips} of what the lips' red is high ({red} mm)"));
        }
        // measured: near the neckline 0.001 in front of to 0.019 behind the edge in front of the ear (round 90's
        // files 0.075 to 0.100 behind it: a bib)
        if !(ear - neck < 0.04) {
            bad.push(format!("{who}: the beard's back edge runs {} of the head's depth backwards on its way down", ear - neck));
        }
    }
    assert!(bad.is_empty(), "{bad:#?}");
}
