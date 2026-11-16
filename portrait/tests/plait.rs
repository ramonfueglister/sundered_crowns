//! The plaits of England 1356 as the builder puts them on a girl (the real look: a file of its own, see
//! tests/common).

mod common;

use common::{head, person};
use sc_portrait::build;

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

/// The middle line of each of the two plaits: the mean of its three strands, piece by piece down the plait (a
/// piece: the band of triangles between two rings of a strand).
fn middle_lines(pos: &[V3]) -> [Vec<V3>; 2] {
    let per_strand = pos.len() / STRANDS;
    let per_piece = 2 * ROUND * 3;
    let pieces = per_strand / per_piece;
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
        // the hair of the head: locks since round 88 (tests/locks.rs), over its painted layer, no cards
        assert!(named("/hair1356_locks.").is_some(), "girl {k}: the hair of the head");
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
        assert!((0.1..0.4).contains(&volume), "girl {k}: the plaits hold {volume} litres");
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
fn a_plait_hangs_without_a_kink_on_every_body() {
    // Each ring of a strand is bound to the nearest triangle of the body: jaw, neck, shoulder and chest in turn.
    // On a body that is not the base's these move apart, and the plait had a kink where it passed from one to the
    // next: its middle line turned up to 74 degrees within 2 cm, and on girls of 8 strands folded over
    // themselves. The builder evens the plait's way with the body out along it (`mh_rope`): 23 degrees, which is
    // the turn the plait is laid with below the ear.
    let Some(h) = head() else { return };
    let mut worst = 0f32;
    for k in 0..40u32 {
        let age = [8.0, 10.0, 13.0, 15.0, 17.0, 19.0][k as usize % 6];
        let out = build(&h, &person(2 * k, true, age), 1);
        let rope = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("/plait01_rope."))).expect("the plaits' strands");
        // no strand is folded over itself: every corner faces as the triangles round it do
        assert_eq!(turned_over(&rope.pos, &rope.nrm), 0, "girl {k} of {age}: triangles folded over");
        for line in middle_lines(&rope.pos) {
            // how far the plait's middle line turns within 2 cm (8 pieces of 2.5 mm), in degrees; the first and the
            // last 4 cm left out (the strands begin and end as points)
            for s in 16..line.len() - 16 {
                let (a, b) = (sub(line[s], line[s - 8]), sub(line[s + 8], line[s]));
                worst = worst.max((dot(a, b) / (len(a) * len(b))).clamp(-1.0, 1.0).acos().to_degrees());
            }
        }
    }
    assert!(worst < 30.0, "a plait turns {worst} degrees within 2 cm");
}
