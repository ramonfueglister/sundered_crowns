//! (round 162) A girl under seven wears her hair down: parted in the middle and hanging to over the shoulders
//! (the real look: a file of its own, see tests/common; the cut `loose01` of tools/portrait/pipeline/hair_body.py,
//! `DressSet::hair_small_girl`).

mod common;

use common::{closest, cloth, cross, dist, dot, head, person_of, skin, sub, V3};
use sc_portrait::{build, build_posed, Portrait, Surface};

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

/// The image all bundles of England's hair are drawn with (`DressSet::body_image`).
const IMAGE: &str = "/hair1356_body.";

fn named(out: &Portrait, part: &str) -> bool {
    out.surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains(part)))
}

/// What is read off a head of hair: how far under the chin its lowest place lies (centimetres); how far down the
/// forehead hair lies in front of the face's middle (in the head's height from the crown); how broad it is at the
/// chin's height, in its greatest breadth; and of its corners under the chin (every fifth), how many there are,
/// how many lie more than 1 mm under the gown's cloth and how deep at most (centimetres), and how many more than
/// 1 mm under the skin (inside the triangle nearest to them, by the way that triangle faces: the skin's away
/// from the body, the gown's away from the skin).
struct Down {
    below: f32,
    forehead: f32,
    hangs: f32,
    ends: usize,
    in_cloth: usize,
    deep: f32,
    in_skin: usize,
}

fn down(out: &Portrait) -> Down {
    let hair: &Surface = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(IMAGE))).expect("a body of hair");
    let sk = skin(out);
    let crown = sk.iter().flatten().map(|p| p[1]).fold(f32::MIN, f32::max);
    let height = crown - out.chin;
    let low = hair.pos.iter().map(|p| p[1]).fold(f32::MAX, f32::min);
    let upper = crown - 0.3 * height;
    let broad = sk.iter().flatten().filter(|p| p[1] > upper).map(|p| (p[0] - out.cx).abs()).fold(0f32, f32::max);
    let front = hair.pos.iter().filter(|p| (p[0] - out.cx).abs() < 0.25 * broad && p[2] > out.cz).map(|p| p[1]).fold(f32::MAX, f32::min);
    let across = |of: &mut dyn Iterator<Item = &V3>| of.map(|p| (p[0] - out.cx).abs()).fold(0f32, f32::max);
    let hangs = across(&mut hair.pos.iter().filter(|p| (p[1] - out.chin).abs() < 0.1)) / across(&mut hair.pos.iter());
    // (how far inside a triangle: nearest to it, against the way it faces; inside from 1 mm)
    let depth = |q: &V3, tris: &[([V3; 3], V3)]| -> f32 {
        let Some((on, faces)) = tris.iter().map(|(t, faces)| (closest(q, t), faces)).min_by(|a, b| dist(q, &a.0).total_cmp(&dist(q, &b.0))) else { return 0.0 };
        -dot(&sub(q, &on), faces)
    };
    let unit = |v: V3| -> V3 {
        let l = dot(&v, &v).sqrt().max(1e-9);
        [v[0] / l, v[1] / l, v[2] / l]
    };
    let near = |t: &[V3; 3]| t[0][1] < out.chin + 0.1 && t[0][1] > low - 0.3;
    let skin_near: Vec<([V3; 3], V3)> = sk.iter().filter(|t| near(t)).map(|t| (*t, unit(cross(&sub(&t[1], &t[0]), &sub(&t[2], &t[0]))))).collect();
    let gown: Vec<([V3; 3], V3)> = cloth(out, "/cloth_cote")
        .expect("the gown")
        .tris
        .iter()
        .filter(|t| !t.hem && near(&t.at))
        .map(|t| {
            // (a gown's triangle faces away from the skin under it)
            let n = unit(cross(&sub(&t.at[1], &t.at[0]), &sub(&t.at[2], &t.at[0])));
            let under = skin_near.iter().map(|(s, _)| closest(&t.at[0], s)).min_by(|a, b| dist(&t.at[0], a).total_cmp(&dist(&t.at[0], b))).expect("skin under the gown");
            (t.at, if dot(&sub(&t.at[0], &under), &n) < 0.0 { [-n[0], -n[1], -n[2]] } else { n })
        })
        .collect();
    let ends: Vec<&V3> = hair.pos.iter().filter(|p| p[1] < out.chin).step_by(5).collect();
    Down {
        below: 10.0 * (out.chin - low),
        forehead: (crown - front) / height,
        hangs,
        ends: ends.len(),
        in_cloth: ends.iter().filter(|q| depth(q, &gown) > 0.01).count(),
        deep: 10.0 * ends.iter().map(|q| depth(q, &gown)).fold(0f32, f32::max),
        in_skin: ends.iter().filter(|q| depth(q, &skin_near) > 0.01).count(),
    }
}

#[test]
fn a_small_girl_wears_her_hair_down() {
    // Until round 162 every child under seven wore one cut, `bob08`, and a girl of five was a boy in the picture.
    // A girl under seven wears her hair down (`DressSet::hair_small_girl`, `loose01`): parted in the middle with
    // the forehead free (hair down to 0.12 to 0.17 of the head's height from the crown; a boy's fringe to 0.20 to
    // 0.22), on a girl's painted layer and scalp, without plaits; hanging to 2.8 to 3.9 cm under the chin, over
    // the shoulders, and at the chin's height 0.85 to 0.95 as broad as at its broadest (the man's cut to the
    // jaw, `page01`, has no hair at the chin's height on the first of these girls). None of it lies in the skin.
    // Behind, the collar stands off the nape and the innermost ends hang into it: of the corners under the chin
    // 7 to 19 in some 1 500 to 2 300 lie under the gown's cloth, by 0.4 to 0.6 cm at most; held to one in fifty
    // and 1 cm. A boy of her age wears the small child's cut as before, and a girl of seven her plaits.
    let Some(h) = head() else { return };
    for k in 0..8u32 {
        for (age, stand) in [(2.0f32, 1u8), (4.0, 1), (6.0, 1), (5.0, 3)] {
            let who = format!("girl {k} of {age}, stand {stand}");
            let out = build(&h, &person_of(2 * k, true, age, stand), 1);
            assert!(named(&out, "/plait01_cap.") && !named(&out, "/plait01_rope."), "{who}: a girl's painted layer, and no plaits");
            let m = down(&out);
            if show() {
                println!("{who}: ends {:.1} cm under the chin, hair on the forehead down to {:.3}, at the chin {:.2} of its breadth, of {} corners under the chin {} in the gown ({:.2} cm at most), {} in the skin", m.below, m.forehead, m.hangs, m.ends, m.in_cloth, m.deep, m.in_skin);
            }
            assert!(m.forehead < 0.18, "{who}: hair on the forehead down to {} of the head's height", m.forehead);
            assert!((2.0..5.0).contains(&m.below), "{who}: the hair ends {} cm under the chin", m.below);
            assert!(m.hangs > 0.8, "{who}: at the chin's height the hair is {} of its greatest breadth", m.hangs);
            assert!(50 * m.in_cloth < m.ends && m.deep < 1.0, "{who}: of {} corners of the hair under the chin {} in the gown, {} cm at most", m.ends, m.in_cloth, m.deep);
            assert_eq!(m.in_skin, 0, "{who}: corners of the hair in the skin");
        }
        let boy = build(&h, &person_of(2 * k + 1, false, 5.0, 1), 1);
        assert!(named(&boy, "/bob08_cap.") && !named(&boy, "/plait01_cap."), "boy {k} of five: the small child's cut");
        let girl = build(&h, &person_of(2 * k, true, 7.0, 1), 1);
        assert!(named(&girl, "/plait01_rope."), "girl {k} of seven: plaits");
    }
}

#[test]
fn hair_worn_down_stays_out_of_the_gown_when_the_shoulders_turn() {
    // The hair's ends hang over the shoulders, which the pose turns under the head: with the shoulders square
    // and turned 0.35 either way nothing of the hair lies in the skin, and no more of it in the collar's back than
    // one corner in fifty of those under the chin (7 to 14 in some 1 500 to 2 300 on four girls), by 1.0 cm at
    // most when turned (0.6 square); held to 1.3 cm.
    let Some(h) = head() else { return };
    for k in 0..4u32 {
        for turn in [-0.35f32, 0.0, 0.35] {
            let out = build_posed(&h, &person_of(2 * k, true, 5.0, 1), 1, Some([turn, turn, 0.0]));
            let m = down(&out);
            if show() {
                println!("girl {k}, turned {turn}: of {} corners under the chin {} in the gown ({:.2} cm at most), {} in the skin", m.ends, m.in_cloth, m.deep, m.in_skin);
            }
            assert!(50 * m.in_cloth < m.ends && m.deep < 1.3 && m.in_skin == 0, "girl {k}, turned {turn}: of {} corners of the hair under the chin {} in the gown ({} cm at most), {} in the skin", m.ends, m.in_cloth, m.deep, m.in_skin);
        }
    }
}
