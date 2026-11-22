//! The plaits of England 1356 as the builder puts them on a girl (the real look: a file of its own, see
//! tests/common).

mod common;

use common::{head, person};
use sc_portrait::{build, build_posed};

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

/// The corners of a strand: `tools/portrait/pipeline/styles.py` `ROUND`.
const ROUND: usize = 8;
/// Two plaits of three strands.
const STRANDS: usize = 6;
/// The corners of the thinner locks that follow each strand of a plait that hangs, at its loose end (round 183,
/// `styles.py` `PLAIT_ROPE_END`): four locks of eight pieces of six corners round, two triangles a corner.
const END_LOCKS: usize = 4 * 8 * 6 * 2 * 3;

/// The middle line of each of the two plaits: the mean of its three strands, piece by piece down the plait (a
/// piece: the band of triangles between two rings of a strand). Of plaits that hang: each strand is followed by
/// the thinner locks of its end, which are no part of the line.
fn middle_lines(pos: &[V3]) -> [Vec<V3>; 2] {
    let per_strand = pos.len() / STRANDS;
    let per_piece = 2 * ROUND * 3;
    let pieces = (per_strand - END_LOCKS) / per_piece;
    let piece = |strand: usize, s: usize| -> V3 {
        let at = strand * per_strand + s * per_piece;
        let sum = pos[at..at + per_piece].iter().fold([0f32; 3], |a, p| [a[0] + p[0], a[1] + p[1], a[2] + p[2]]);
        sum.map(|x| x / per_piece as f32)
    };
    [0, 1].map(|plait| (0..pieces).map(|s| { let m = [0, 1, 2].map(|k| piece(3 * plait + k, s)); [0, 1, 2].map(|a| (m[0][a] + m[1][a] + m[2][a]) / 3.0) }).collect())
}

/// The triangles of a surface with a corner that faces away from the triangle itself: where a tube is folded over.
fn turned_over(pos: &[V3], nrm: &[V3]) -> usize {
    pos.chunks_exact(3)
        .zip(nrm.chunks_exact(3))
        .filter(|(t, n)| {
            let face = cross(sub(t[1], t[0]), sub(t[2], t[0]));
            len(face) > 1e-7 && n.iter().any(|c| dot(*c, face) <= 0.0)
        })
        .count()
}

/// The breadth of the plait at a girl's left (from side to side), in slices of 1 cm upward from its lowest point.
fn breadths(pos: &[V3]) -> [f32; 16] {
    let low = pos.iter().filter(|p| p[0] > 0.0).map(|p| p[1]).fold(f32::MAX, f32::min);
    let mut span = [(f32::MAX, f32::MIN); 16];
    for p in pos.iter().filter(|p| p[0] > 0.0) {
        let i = ((p[1] - low) / 0.1) as usize;
        if i < span.len() {
            span[i] = (span[i].0.min(p[0]), span[i].1.max(p[0]));
        }
    }
    span.map(|(a, b)| (b - a).max(0.0))
}

/// Whether plaits are pinned up beside the cheeks (round 126, `DressSet::hair_looped`): they end above the chin;
/// plaits that hang reach the chest.
fn pinned_up(out: &sc_portrait::Portrait, rope: &sc_portrait::Surface) -> bool {
    rope.pos.iter().map(|p| p[1]).fold(f32::MAX, f32::min) > out.chin - 0.3
}

#[test]
fn a_girl_of_england_wears_plaits_of_round_strands() {
    // Until round 86 a plait was flat cards, ragged ribbons, each lit as one face turned away from the head: with
    // a light from the far side the whole plait shone pale. Now it is three strands plaited, each a closed tube
    // whose surface faces every way round, and it is solid: no card, drawn on one side only.
    let Some(h) = head() else { return };
    for (k, age) in [(0u32, 8.0f32), (2, 13.0), (4, 17.0), (14, 8.0), (16, 13.0), (18, 17.0)] {
        let out = build(&h, &person(k, true, age), 1);
        let named = |part: &str| out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(part)));
        let rope = named("/plait01_rope.").unwrap_or_else(|| panic!("girl {k}: the plaits' strands"));
        // the hair of the head: a body of bundles since round 109 (tests/hair_body.rs), over its painted layer, no cards
        assert!(named("/hair1356_body.").is_some(), "girl {k}: the hair of the head");
        assert!(named("/plait01_cap.").is_some(), "girl {k}: the painted layer under the hair");
        assert!(named("/plait01.").is_none(), "girl {k}: no cards");
        assert!(!rope.mat.double, "girl {k}: a strand is solid");
        assert_eq!(rope.pos.len() % (STRANDS * 2 * ROUND * 3), 0, "girl {k}: six strands of eight corners");
        // closed and facing outward: the faces of a closed surface add up to nothing, and what they enclose has a
        // size (a girl's two plaits hold between 100 and 400 cubic centimetres of hair; 1 is 10 cm)
        let (mut sum, mut area, mut volume) = ([0f32; 3], 0f32, 0f32);
        for (t, n) in rope.pos.chunks_exact(3).zip(rope.nrm.chunks_exact(3)) {
            let face = cross(sub(t[1], t[0]), sub(t[2], t[0]));
            sum = [sum[0] + face[0], sum[1] + face[1], sum[2] + face[2]];
            area += len(face);
            volume += dot(t[0], cross(t[1], t[2])) / 6.0;
            for c in n {
                assert!((len(*c) - 1.0).abs() < 1e-3 || len(*c) == 0.0, "girl {k}: a direction of length {}", len(*c));
            }
        }
        assert!(len(sum) / area < 0.01, "girl {k}: the strands are not closed, {}", len(sum) / area);
        // (round 126: plaits pinned up beside the cheeks are a third as long as plaits that hang, and narrower)
        let hold = if pinned_up(&out, rope) { 0.03..0.1 } else { 0.1..0.4 };
        assert!(hold.contains(&volume), "girl {k}: the plaits hold {volume} litres");
        // lit round: of the surface, as much faces the head as away from it, to the front as to the back (as
        // cards, all of a plait faced away from the head)
        for (axis, name) in [(0, "to the sides"), (2, "to front and back")] {
            let (mut plus, mut minus) = (0f32, 0f32);
            for (t, n) in rope.pos.chunks_exact(3).zip(rope.nrm.chunks_exact(3)) {
                let a = len(cross(sub(t[1], t[0]), sub(t[2], t[0])));
                let m = (n[0][axis] + n[1][axis] + n[2][axis]) / 3.0;
                if m > 0.5 {
                    plus += a;
                } else if m < -0.5 {
                    minus += a;
                }
            }
            assert!(plus / area > 0.15 && minus / area > 0.15, "girl {k}, {name}: {} and {} of the surface", plus / area, minus / area);
        }
    }
}

#[test]
fn a_plait_that_hangs_ends_in_loose_hair() {
    // Until round 183 a plait ran out as three strands ever thinner, to a point of 0.3 of their thickness: from
    // side to side it was narrower the nearer its end. Now it is plaited to 4.5 cm before its end, where it is
    // narrowest (as if bound), and below that its hair hangs loose in locks that spread: the plait has a waist.
    // Read from side to side in slices of 1 cm: the narrowest slice between 2 and 9 cm over the end is less than
    // 0.7 times as broad as the plait is 12 to 16 cm over its end, and below it the hair is more than 1.4 times
    // as broad again (now 0.38 to 0.59 and 1.8 to 2.5; round 180's file 0.85 to 1.14 and 0.67 to 0.74: no slice
    // below its narrowest is broader, and it fails both).
    let Some(h) = head() else { return };
    let mut seen = 0;
    for k in 0..12u32 {
        let age = [8.0, 10.0, 13.0][k as usize % 3];
        let out = build_posed(&h, &person(2 * k, true, age), 1, Some([0.0; 3]));
        let rope = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("/plait01_rope."))).expect("the plaits' strands");
        assert!(!pinned_up(&out, rope), "girl {k} of {age}: plaits pinned up");
        let broad = breadths(&rope.pos);
        let full = broad[12..].iter().copied().fold(0f32, f32::max);
        let (at, waist) = (2..9).map(|i| (i, broad[i])).fold((0, f32::MAX), |a, b| if b.1 < a.1 { b } else { a });
        let loose = broad[..at].iter().copied().fold(0f32, f32::max);
        if std::env::var("SHOW").is_ok() {
            println!("girl {k} of {age}: the plait is {full} broad, {} at its waist {at} cm over the end, {} below it", waist / full, loose / waist);
            continue;
        }
        assert!(waist < 0.7 * full, "girl {k} of {age}: the plait is {full} broad and {waist} at its narrowest");
        assert!(loose > 1.4 * waist, "girl {k} of {age}: below its waist of {waist} the plait is {loose} broad");
        seen += 1;
    }
    assert!(seen == 12 || std::env::var("SHOW").is_ok());
}

#[test]
fn a_plait_hangs_without_a_kink_on_every_body() {
    // Each ring of a strand is bound to the nearest triangle of the body: jaw, neck, shoulder and chest in turn.
    // On a body that is not the base's these move apart, and the plait had a kink where it passed from one to the
    // next: its middle line turned up to 74 degrees within 2 cm, and on girls of 8 strands folded over
    // themselves. The builder evens the plait's way with the body out along it (`mh_rope`): 23 degrees, which is
    // the turn the plait is laid with below the ear.
    let Some(h) = head() else { return };
    let (mut worst, mut posed, mut pinned, mut hanging) = (0f32, 0f32, 0, 0);
    for k in 0..40u32 {
        let age = [8.0, 10.0, 13.0, 15.0, 17.0, 19.0][k as usize % 6];
        // (the plait as the body carries it, in no pose. The pose of round 123 turns the shoulders under the head
        // and draws a plait that hangs past the neck aslant: its rings stay level, so a strand is flatter there
        // and a corner of it may face a right angle away from one of its triangles, which is no fold)
        let out = build_posed(&h, &person(2 * k, true, age), 1, Some([0.0; 3]));
        let rope = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("/plait01_rope."))).expect("the plaits' strands");
        // no strand is folded over itself: every corner faces as the triangles round it do
        assert_eq!(turned_over(&rope.pos, &rope.nrm), 0, "girl {k} of {age}: triangles folded over");
        if pinned_up(&out, rope) {
            // (round 126) plaits pinned up turn by intent, from below the ear up in front of it: they are held to
            // their place instead. Girls wear theirs hanging; a pinned plait lies beside the cheek, between the
            // chin's height and the forehead's, within 2.5 cm of the skin, and in her pose it is where it was (it is
            // above the chin, where the pose moves nothing)
            assert!(age >= 15.0, "girl {k} of {age}: plaits pinned up");
            pinned += 1;
            let skin = out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains("/skin_"))).max_by_key(|s| s.pos.len()).expect("skin");
            let crown = skin.pos.iter().map(|p| p[1]).fold(f32::MIN, f32::max);
            let (low, high) = rope.pos.iter().fold((f32::MAX, f32::MIN), |(l, h), p| (l.min(p[1]), h.max(p[1])));
            assert!(low > out.chin - 0.1 && high < crown - 0.15 * (crown - out.chin), "girl {k} of {age}: the pinned plaits lie from {} over the chin to {} under the crown", low - out.chin, crown - high);
            let off = rope.pos.iter().step_by(7).map(|p| skin.pos.iter().map(|q| len(sub(*p, *q))).fold(f32::MAX, f32::min)).fold(0f32, f32::max);
            assert!(off < 0.25, "girl {k} of {age}: a pinned plait stands {off} off the skin");
            let stood = build(&h, &person(2 * k, true, age), 1);
            let stood = stood.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("/plait01_rope."))).expect("the plaits' strands");
            assert!(stood.pos.iter().zip(&rope.pos).filter(|(a, _)| a[1] >= out.chin).all(|(a, b)| a == b), "girl {k} of {age}: the pose moves a pinned plait above the chin");
            continue;
        }
        hanging += 1;
        // and in her pose: how far the middle line turns then
        let stood = build(&h, &person(2 * k, true, age), 1);
        let stood = stood.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("/plait01_rope."))).expect("the plaits' strands");
        for line in middle_lines(&stood.pos) {
            for s in 16..line.len() - 16 {
                let (a, b) = (sub(line[s], line[s - 8]), sub(line[s + 8], line[s]));
                posed = posed.max((dot(a, b) / (len(a) * len(b))).clamp(-1.0, 1.0).acos().to_degrees());
            }
        }
        for line in middle_lines(&rope.pos) {
            // how far the plait's middle line turns within 2 cm (8 pieces of 2.5 mm), in degrees; the first and the
            // last 4 cm left out (the strands begin and end as points)
            for s in 16..line.len() - 16 {
                let (a, b) = (sub(line[s], line[s - 8]), sub(line[s + 8], line[s]));
                worst = worst.max((dot(a, b) / (len(a) * len(b))).clamp(-1.0, 1.0).acos().to_degrees());
            }
        }
    }
    if std::env::var("SHOW").is_ok() {
        println!("a plait turns {worst} degrees within 2 cm as laid, {posed} in the pose; {hanging} wear plaits hanging, {pinned} pinned up");
    }
    // (of the 20 who are 15 and older, six in ten pin them up: `DressSet::looped`)
    assert!((6..=18).contains(&pinned) && hanging >= 20, "{pinned} wear their plaits pinned up, {hanging} hanging");
    assert!(worst < 30.0, "a plait turns {worst} degrees within 2 cm");
    assert!(posed < 40.0, "in the pose a plait turns {posed} degrees within 2 cm");
}
