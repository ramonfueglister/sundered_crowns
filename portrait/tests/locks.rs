//! The full beard of England's men as the builder puts it on a jaw (the real look: a file of its own, see
//! tests/common): locks, since round 90; the short beard's strands, since round 176. (A head's hair was locks
//! from round 87 to 108; it is a modelled body now, tests/hair_body.rs.)

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

/// The pieces of a beard (corners at one place are one corner): how much of the image's breadth lies on each.
fn strands(s: &Surface) -> Vec<f32> {
    pieces(s).into_iter().map(|p| p.0).collect()
}

/// The pieces of a beard: how much of the image's breadth lies on each, and how long it is (the diagonal of the
/// box round its corners; 1 is 10 cm).
fn pieces(s: &Surface) -> Vec<(f32, f32)> {
    boxes(s).into_iter().map(|(across, low, high)| (across, len(sub(high, low)))).collect()
}

/// The pieces of a beard: how much of the image's breadth lies on each, and the box round its corners.
fn boxes(s: &Surface) -> Vec<(f32, V3, V3)> {
    fn root(of: &mut [usize], mut i: usize) -> usize {
        while of[i] != i {
            of[i] = of[of[i]];
            i = of[i];
        }
        i
    }
    let mut at = std::collections::HashMap::new();
    let ids: Vec<usize> = s
        .pos
        .iter()
        .map(|p| {
            let n = at.len();
            *at.entry(p.map(f32::to_bits)).or_insert(n)
        })
        .collect();
    let mut of: Vec<usize> = (0..at.len()).collect();
    for t in ids.chunks_exact(3) {
        let a = root(&mut of, t[0]);
        for &k in &t[1..] {
            let b = root(&mut of, k);
            of[b] = a;
        }
    }
    let mut span = std::collections::HashMap::new();
    for ((&i, uv), q) in ids.iter().zip(&s.uv).zip(&s.pos) {
        let e = span.entry(root(&mut of, i)).or_insert((f32::MAX, f32::MIN, [f32::MAX; 3], [f32::MIN; 3]));
        *e = (e.0.min(uv[0]), e.1.max(uv[0]), [e.2[0].min(q[0]), e.2[1].min(q[1]), e.2[2].min(q[2])], [e.3[0].max(q[0]), e.3[1].max(q[1]), e.3[2].max(q[2])]);
    }
    span.values().map(|r| (r.1 - r.0, r.2, r.3)).collect()
}

#[test]
fn a_full_beard_of_england_is_locks_over_its_painted_layer() {
    // Until round 90 a full beard was its painted layer alone: a smooth shell 3 to 6 mm off the jaw, with the
    // jaw's outline and a ruled upper edge on the cheek. Now locks lie over that layer (`beards.py`, style `crop`
    // with `CROP_LOCKS`): short and wavy, solid, each with a lit and a shaded flank, their ends the beard's
    // outline. They lie over the beard's form, not the skin's, and end where the beard does: left to run their
    // length they hang 0.17 to 0.22 of the head's height below the chin (as built 0.02 at most), and laid over
    // the skin itself they went down the throat as a collar (the first trial).
    // Round 173: the locks are fine strands (modelled in the Blender on Ramon's Mac, docs/PORTRAITS.md): some
    // 2070 flat bands of 2 to 5 mm where they were 390 locks of 0.9 to 1.8 cm, fat noodles beside a head's hair
    // of strands (rounds 171, 172). The image lies on a strand in true scale (a part of its breadth), and a
    // strand is darker where it lies under the others. So the bound on the locks' triangles (8 000 to 30 000;
    // the old file 25 824) is the strands' now, and their number and breadth are held.
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
        assert!((40_000..90_000).contains(&n), "{who}: {n} triangles of strands");
        // fine strands: 1500 to 2800 of them, the image a seventh to less than a half of its breadth on one
        // (measured: 2072 strands, 0.22 in the median, 0.13 to 0.37; round 172's locks 390, each with the whole image)
        let mut across = strands(beard);
        across.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let mid = across[across.len() / 2];
        // a strand in the shade of the others is darker: on a young man, whose beard is of one colour, the
        // lightest corner is more than twice as light as the darkest (measured: 2.2 times; the locks had no shade)
        let tone = |c: &V3| c[0] + c[1] + c[2];
        let (dim, lit) = beard.col.iter().map(tone).fold((f32::MAX, f32::MIN), |(d, l), c| (d.min(c), l.max(c)));
        if std::env::var("SHOW").is_ok() {
            println!("{who}: {} strands, the image {:.3} of its breadth on one in the median ({:.3} to {:.3}), the lightest corner {:.2} times the darkest", across.len(), mid, across[0], across[across.len() - 1], lit / dim);
        }
        assert!((1500..2800).contains(&across.len()), "{who}: {} strands", across.len());
        assert!(mid > 0.14 && mid < 0.45, "{who}: the image lies {mid} of its breadth on a strand");
        assert!(age > 30.0 || lit > 2.0 * dim, "{who}: the lightest corner is {} times the darkest", lit / dim);
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
    // who wears stubble, or no beard, wears no locks on the jaw (until round 176 a short beard had none either:
    // it has strands of its own now, the next test)
    for beard in [Beard::Shaven, Beard::Stubble] {
        let mut p = person(1, false, 35.0);
        p.beard = Some(beard);
        assert!(!build(&h, &p, 1).surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains(BEARD_IMAGE))), "locks on a jaw without a beard");
    }
}

#[test]
fn a_short_beard_of_england_is_short_strands_over_its_painted_layer() {
    // Until round 176 a short beard was its painted layer alone (round 62): a dark shell on the jaw with one
    // outline, beside a full beard of strands (round 173). Now short strands lie over that layer (`beards.py`,
    // style `short` with the full beard's switches; modelled in the Blender on Ramon's Mac, docs/PORTRAITS.md):
    // flat bands of 1.2 to 2 mm, 5 to 10 mm long, pointed, drawn with the image of the full beard's strands, each
    // of a tone of its own and darker where it lies under the others. They keep to the skin: a short beard has
    // no form of its own as a full one has.
    let Some(h) = head() else { return };
    for (k, age) in [(1u32, 24.0f32), (3, 35.0), (5, 50.0), (7, 68.0), (9, 35.0), (11, 50.0), (13, 68.0)] {
        let mut p = person(k, false, age);
        p.beard = Some(Beard::Short);
        let out = build(&h, &p, 1);
        let who = format!("person {k} of {age}");
        let found: Vec<&Surface> = out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains(BEARD_IMAGE))).collect();
        assert_eq!(found.len(), 1, "{who}: one surface of a beard's strands");
        let beard = found[0];
        assert!(beard.mat.double, "{who}: a strand is seen from both sides");
        assert!(out.surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains("/beard_short1356_cap."))), "{who}: the painted layer under the strands");
        let n = beard.pos.len() / 3;
        let mut of = pieces(beard);
        of.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
        let (mid, longest) = (of[of.len() / 2].1, of[of.len() - 1].1);
        let tone = |c: &V3| c[0] + c[1] + c[2];
        let (dim, lit) = beard.col.iter().map(tone).fold((f32::MAX, f32::MIN), |(d, l), c| (d.min(c), l.max(c)));
        let (skin, crown) = skin(&out);
        let height = crown - out.chin;
        let (low, high) = beard.pos.iter().fold((f32::MAX, f32::MIN), |(l, t), q| (l.min(q[1]), t.max(q[1])));
        let near: Vec<&V3> = skin.pos.iter().filter(|q| q[1] < out.chin + 0.5 * height && q[1] > low - 0.1).collect();
        let mut off: Vec<f32> = beard.pos.iter().step_by(7).map(|q| near.iter().map(|s| len(sub(*q, **s))).fold(f32::MAX, f32::min)).collect();
        off.sort_by(|a, b| a.partial_cmp(b).unwrap());
        // the same man with a full beard: its strands are several times as long and stand further off the skin
        p.beard = Some(Beard::Full);
        let full = build(&h, &p, 1);
        let full = full.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(BEARD_IMAGE))).unwrap_or_else(|| panic!("{who}: a full beard's strands"));
        let mut full_of: Vec<f32> = pieces(full).into_iter().map(|p| p.1).collect();
        full_of.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let full_mid = full_of[full_of.len() / 2];
        if std::env::var("SHOW").is_ok() {
            println!("{who}: {} strands, {n} triangles, {mid:.3} long in the median and {longest:.3} at most (a full beard's {full_mid:.3}; 1 is 10 cm), the lightest corner {:.2} times the darkest, lowest {:.3} of the head's height below the chin, highest {:.3} below the crown, off the skin {:.4} in the median and {:.3} at most", of.len(), lit / dim, (out.chin - low) / height, (crown - high) / height, off[off.len() / 2], off[off.len() - 1]);
        }
        // measured: 5258 strands of 42 064 triangles (the full beard's 2072 of 67 224)
        assert!((4500..6500).contains(&of.len()), "{who}: {} strands", of.len());
        assert!((30_000..55_000).contains(&n), "{who}: {n} triangles of strands");
        // short: 6.3 to 6.6 mm in the median, 0.18 to 0.20 of the same man's full beard's (3.2 to 3.7 cm)
        assert!(mid > 0.04 && mid < 0.1 && mid < 0.3 * full_mid, "{who}: a strand is {mid} long in the median, a full beard's {full_mid} (1 is 10 cm)");
        // a strand in the shade of the others is darker (measured: the lightest corner 1.84 to 3.17 times the darkest)
        assert!(lit > 1.5 * dim, "{who}: the lightest corner is {} times the darkest", lit / dim);
        // it keeps to its zone: down to the throat under the jaw (0.03 to 0.05 of the head's height below the
        // chin, where its painted layer ends), nothing of it above the eyes' height
        assert!((out.chin - low) / height < 0.08, "{who}: the beard reaches {} of the head's height below the chin", (out.chin - low) / height);
        assert!((crown - high) / height > 0.45, "{who}: the beard begins {} of the head's height below the crown", (crown - high) / height);
        // and to the skin: its corners 4.1 to 4.3 mm from the skin's nearest corner in the median, 9 to 12 mm at
        // most (the full beard's, by the same measure, 7.0 to 7.5 and 17 to 18: the measure is as coarse as the
        // skin's corners lie apart)
        assert!(off[off.len() / 2] < 0.055 && off[off.len() - 1] < 0.15, "{who}: the strands stand {} off the skin in the median, {} at most (1 is 10 cm)", off[off.len() / 2], off[off.len() - 1]);
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

#[test]
fn a_full_beard_ends_in_tufts() {
    // Round 182. Round 173's full beard was a close mat with one closed outline, where the reference's ends in
    // pointed tufts. Its strands are gathered into 40 tufts now, each ending in a point, and the points reach
    // further out of the beard's zone than the strands at a tuft's border (`beards.py`, `CROP_LOCK_TUFT`).
    // Read here: the beard's lower outline from the front, the lowest corner in each strip of 2 mm to 5 cm
    // either side of the face's middle, and how far a strip's lowest place lies off the mean of the nine strips
    // round it (1.8 cm). Measured: 0.91 to 1.64 mm on average on these seven; round 173's file 0.35 to 0.54,
    // and fails. The bound is 0.7 mm: PLACEHOLDER, by these two rounds.
    let Some(h) = head() else { return };
    for (k, age) in [(1u32, 24.0f32), (3, 35.0), (5, 50.0), (7, 68.0), (9, 35.0), (11, 50.0), (13, 68.0)] {
        let mut p = person(k, false, age);
        p.beard = Some(Beard::Full);
        let out = build(&h, &p, 1);
        let who = format!("person {k} of {age}");
        let beard = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(BEARD_IMAGE))).unwrap_or_else(|| panic!("{who}: a beard's locks"));
        let mut low = [f32::MAX; 50];
        for q in &beard.pos {
            let i = ((q[0] - out.cx + 0.5) / 0.02).floor();
            if (0.0..50.0).contains(&i) {
                low[i as usize] = low[i as usize].min(q[1]);
            }
        }
        assert!(low.iter().all(|y| *y < f32::MAX), "{who}: the beard goes from side to side under the chin");
        let off: Vec<f32> = (4..46).map(|i| (low[i] - low[i - 4..=i + 4].iter().sum::<f32>() / 9.0).abs()).collect();
        let mean = off.iter().sum::<f32>() / off.len() as f32;
        let most = off.iter().copied().fold(0f32, f32::max);
        if std::env::var("SHOW").is_ok() {
            println!("{who}: the lower outline lies {:.2} mm off its own mean over 1.8 cm on average, {:.2} at most", 100.0 * mean, 100.0 * most);
            continue;
        }
        assert!(mean > 0.007, "{who}: the beard's lower outline lies {} mm off its own mean over 1.8 cm: one closed line", 100.0 * mean);
    }
}

#[test]
fn a_full_beard_grows_thin_towards_the_cheek() {
    // Round 184. The full beard's upper edge on the cheek was one dark line from the mouth's corner to the ear:
    // layer and strands began there in full. Now the beard grows thin over 2 cm from that edge (`beards.py`,
    // `CROP_CHEEK`): fewer painted hairs and less shade in the layer, which comes off the skin as slowly, and
    // fewer, shorter and narrower bands of strands. Read here, of the strands alone: the band that reaches highest in each
    // strip of 2 mm from 4.5 to 8.5 cm either side of the face's middle (there the beard's upper edge is the
    // cheek's), and how much of the image's breadth lies on one of those in the median, against the median of all
    // the beard's bands (the image lies on a band in true scale, so that is the band's breadth). Measured: 0.61
    // to 0.70 of it on these seven; round 182's file 1.00 on all seven, and fails. The bound is 0.8: PLACEHOLDER,
    // by these two rounds. The layer's cover is read by no test here: it lies in its image.
    let Some(h) = head() else { return };
    for (k, age) in [(1u32, 24.0f32), (3, 35.0), (5, 50.0), (7, 68.0), (9, 35.0), (11, 50.0), (13, 68.0)] {
        let mut p = person(k, false, age);
        p.beard = Some(Beard::Full);
        let out = build(&h, &p, 1);
        let who = format!("person {k} of {age}");
        let beard = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(BEARD_IMAGE))).unwrap_or_else(|| panic!("{who}: a beard's locks"));
        let median = |v: &mut Vec<f32>| {
            v.sort_by(|a, b| a.partial_cmp(b).unwrap());
            v[v.len() / 2]
        };
        let bands = boxes(beard);
        let all = median(&mut bands.iter().map(|b| b.0).collect());
        let mut top: [Option<&(f32, V3, V3)>; 40] = [None; 40];
        for b in &bands {
            let x = 0.5 * (b.1[0] + b.2[0]) - out.cx;
            let i = ((x.abs() - 0.45) / 0.02).floor();
            if (0.0..20.0).contains(&i) {
                let at = &mut top[i as usize + if x > 0.0 { 20 } else { 0 }];
                if at.is_none_or(|t| b.2[1] > t.2[1]) {
                    *at = Some(b);
                }
            }
        }
        let edge = median(&mut top.iter().flatten().map(|b| b.0).collect());
        if std::env::var("SHOW").is_ok() {
            println!("{who}: the highest bands of {} strips are {:.2} as broad as the beard's ({:.3} of the image for {:.3})", top.iter().flatten().count(), edge / all, edge, all);
            continue;
        }
        assert!(top.iter().flatten().count() > 30, "{who}: {} strips of the cheek with a band", top.iter().flatten().count());
        assert!(edge < 0.8 * all, "{who}: the bands at the beard's upper edge on the cheek are {} as broad as the beard's: it begins in full", edge / all);
    }
}
