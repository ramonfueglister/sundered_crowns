//! (round 160) A gown that is worn on the skin lies on it at the neck, and a small girl at court wears the round
//! gown (the real look: a file of its own, see tests/common).

mod common;

use common::{closest, cloth, cross, dist, dot, head, person, person_of, skin, sub, Cloth, V3};
use sc_portrait::dress::{COURT_1356, ENGLAND_1356};
use sc_portrait::{build, Portrait};

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

/// A gown's neck as it lies on a person: how far its hem's roll stands off the skin, on average and at most
/// (centimetres); how many places of its cloth lie within 4 cm of the hem, how many of those more than 1 mm under
/// the skin, and how far under it at most (centimetres).
fn neck(out: &Portrait) -> (f32, f32, usize, usize, f32) {
    let c: Cloth = cloth(out, "/cloth_cote").expect("the gown");
    let sk = skin(out);
    let hems: Vec<V3> = (0..c.pos.len()).filter(|&i| c.hem[i]).map(|i| c.pos[i]).collect();
    // (how far a point lies from the skin, and on which side of it: by the face of the skin's triangle nearest to it)
    let off = |q: &V3| -> (f32, bool) {
        let (t, on) = sk.iter().filter(|t| dist(q, &t[0]) < 0.6).map(|t| (t, closest(q, t))).min_by(|a, b| dist(q, &a.1).total_cmp(&dist(q, &b.1))).expect("skin near the gown's neck");
        (dist(q, &on), dot(&sub(q, &on), &cross(&sub(&t[1], &t[0]), &sub(&t[2], &t[0]))) < 0.0)
    };
    let (sum, most) = hems.iter().map(|q| off(q).0).fold((0f32, 0f32), |(sum, most), d| (sum + d, most.max(d)));
    let (mut near, mut under, mut deep) = (0, 0, 0f32);
    for (i, q) in c.pos.iter().enumerate() {
        if c.hem[i] || hems.iter().all(|e| dist(q, e) > 0.4) {
            continue;
        }
        let (d, inside) = off(q);
        near += 1;
        if inside && d > 0.01 {
            (under, deep) = (under + 1, deep.max(d));
        }
    }
    (10.0 * sum / hems.len() as f32, 10.0 * most, near, under, 10.0 * deep)
}

/// How broad a gown's neck is: from its hem's outermost point on one side to that on the other (centimetres).
fn breadth(out: &Portrait) -> f32 {
    let c = cloth(out, "/cloth_cote").expect("the gown");
    let side = |s: f32| (0..c.pos.len()).filter(|&i| c.hem[i]).map(|i| c.pos[i][0] * s).fold(f32::MIN, f32::max);
    10.0 * (side(1.0) + side(-1.0))
}

#[test]
fn a_gown_worn_on_the_skin_lies_on_it_at_the_neck() {
    // The builder holds a gown 7 mm off the body it is bound to, so that the body's finer bumps stay under a cloth
    // that was draped on another body. At the edge of a neck cut out to the shoulders that showed: the hem stood
    // over the skin as a tub's rim, with a look into the gown from in front. At court no linen is worn under a
    // lady's gown, and the gown is brought in to the skin towards its neck's hem (real_look.rs `Layer::Bare`,
    // `CLOTH_LIE`): the hem's roll lies on the skin. In the village the smock lies under the gown, and its neck
    // is as it was.
    let Some(h) = head() else { return };
    for k in 0..8 {
        for (who, p, bare) in [("village woman", person(2 * k, true, 30.0), false), ("lady", person_of(2 * k, true, 30.0, 3), true), ("girl of ten", person_of(2 * k, true, 10.0, 3), true), ("girl of four", person_of(2 * k, true, 4.0, 3), true), ("queen", person_of(2 * k, true, 30.0, 4), true)] {
            let (mean, most, near, under, deep) = neck(&build(&h, &p, 1));
            if show() {
                println!("{who} {k}: the hem {mean:.2} cm off the skin, at most {most:.2}; {under} of {near} places of the cloth near it under the skin, by up to {deep:.2} cm");
                continue;
            }
            assert!(near > 1000, "{who} {k}: {near} places of the cloth within 4 cm of the neck's hem");
            if bare {
                // (measured on these 32: 0.49 to 0.53 cm, at most 0.83 to 1.06; without the rule 0.88 to 1.14, at
                // most 1.18 to 1.71. The roll is 5.6 mm thick and its lowest side is brought to 2.5 mm off the skin)
                assert!(mean < 0.65 && most < 1.25, "{who} {k}: the hem of the neck {mean} cm off the skin, at most {most}");
                // (one place on one girl of ten, 5 mm under the skin where the cut meets the arm; without the rule
                // four on her)
                assert!(under <= 2, "{who} {k}: {under} of {near} places of the cloth near the hem under the skin, by up to {deep} cm");
            } else {
                // (1.06 to 1.12)
                assert!(mean > 0.9 && under == 0, "{who} {k}: the hem of the neck {mean} cm off the skin over the smock, {under} places under the skin");
            }
        }
    }
}

#[test]
fn a_small_girl_at_court_wears_the_round_gown() {
    // The court's wide neck is a woman's fashion (round 149), and on a small child's body the cut reaches out to
    // the arms. A girl under seven wears the round gown, close at the throat, as the village's children do; from
    // seven the wide cut. A boy's cut is worn at every age, at court as in the village.
    assert_eq!((COURT_1356.gown_cut_from, ENGLAND_1356.gown_cut_from), ([7.0, 0.0], [0.0, 0.0]));
    let Some(h) = head() else { return };
    for k in 0..4 {
        let at = |age: f32, stand: u8| breadth(&build(&h, &person_of(2 * k, true, age, stand), 1));
        let (small, seven, village) = (at(6.99, 3), at(7.0, 3), at(6.99, 1));
        if show() {
            println!("girl {k}: the neck {small:.1} cm broad the day before she is seven, {seven:.1} on that day; in the village {village:.1}");
            continue;
        }
        assert!(small < 14.0 && seven > small + 10.0, "girl {k}: the neck {small} cm broad before seven, {seven} from seven");
        assert!(small < village, "girl {k}: the round gown's neck {small} cm broad, the village's cut {village}");
    }
}
