//! CK3-like portraits of the simulated people (Ramon, 30.10.2026; drawn
//! first in the browser Portrait-Werkstatt,
//! https://claude.ai/artifact/JebbURXz29FK155RntzXLL, and ported from it):
//! head and shoulders of the MakeHuman base mesh (CC0) morphed by the
//! person's genes (apoleia_sim::dna), age, mood and life, faceted, with
//! hair, beard, clothing, headwear and jewellery built as geometry. The
//! game draws the result in the person window (sim/godot/src/portrait.rs,
//! app/scripts/ui/portrait_view.gd). docs/kit2/PORTRAITS.md.

mod build;
mod caster;
pub mod dna;
pub mod dress;
pub mod geo;
mod hair;
pub mod head;
pub mod look;
pub mod measure;
mod morph;
pub mod person;
pub mod real;
mod real_look;
mod settings;
mod wasm;
pub mod wire;

pub use build::{build, Portrait, LODS};
pub use morph::{morph_targets, morph_test, morph_test_mouth, mouth_field, MOUTH_FIELD};
pub use geo::{Mat, Surface};
pub use head::Head;
pub use look::{default_life, Beard, Hair, Hat, Jewel, Life, Look, Mood, GENES, NG, STANDS};

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn head() -> Option<Head> {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../public/portrait/head.bin.zst");
        let bytes = std::fs::read(path).ok()?;
        Some(Head::load(&bytes).expect("head file"))
    }

    fn look(female: bool, age: f32, stand: usize, seed: u32) -> Look {
        let mut genes = [128.0; NG];
        for (i, g) in genes.iter_mut().enumerate() {
            *g = ((seed as usize * 37 + i * 101) % 200 + 28) as f32;
        }
        Look { genes, female, age, stand, east: false, dress: crate::dress::Dress::Roman, seed, mood: Mood::Neutral, life: default_life(stand, age, seed), beard: None, hair: None, hat: None, jewel: None }
    }

    #[test]
    fn red_hair_is_rare_in_the_dress_of_england() {
        use crate::look::{GREY, HAIR_R};
        let hair = |dress, red: f32| {
            let mut p = look(false, 30.0, 1, 7);
            p.dress = dress;
            p.genes[GREY] = 0.0;
            p.genes[HAIR_R] = red;
            p.hair_colour()
        };
        let (roman, england) = (crate::dress::Dress::Roman, crate::dress::Dress::England1356);
        // the middle of the pool England draws from (alleles 20 to 170): red in Apoleia's hair, none in England's
        assert_ne!(hair(roman, 95.0), hair(roman, 0.0));
        assert_eq!(hair(england, 95.0), hair(england, 0.0));
        // the strongest gene is as red in both
        assert_eq!(hair(england, 255.0), hair(roman, 255.0));
        // and of all pairs of such alleles about 5 in 100 show a third of the red or more
        let set = england.set().unwrap();
        let (mut red, mut all) = (0, 0);
        for a in 20..=170 {
            for b in 20..=170 {
                let t = ((((a + b) as f32 / 2.0) / 255.0 - set.hair_red[0]) / (set.hair_red[1] - set.hair_red[0])).clamp(0.0, 1.0);
                red += (t * t * (3.0 - 2.0 * t) >= 0.4) as u32;
                all += 1;
            }
        }
        let share = red as f32 / all as f32;
        assert!((0.04..0.06).contains(&share), "{share}");
    }

    #[test]
    fn a_bust_leans_back_about_its_head() {
        let mut s = crate::geo::Surface::new(crate::geo::mat(0.5));
        s.pos = vec![[0.3, 8.0, 0.2], [0.3, 7.0, 1.2]];
        s.nrm = vec![[0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
        crate::build::lean_back(std::slice::from_mut(&mut s), 7.0, 0.2, 0.14);
        // the crown goes back and hardly down, the nose goes up and hardly back; nothing moves sideways
        assert!(s.pos[0][2] < 0.2 - 0.13 && s.pos[0][1] > 7.98, "{:?}", s.pos[0]);
        assert!(s.pos[1][1] > 7.0 + 0.13 && s.pos[1][2] > 1.18, "{:?}", s.pos[1]);
        assert!(s.pos.iter().all(|q| q[0] == 0.3));
        // normals turn with it and keep their length
        assert!(s.nrm[0][2] < -0.13 && s.nrm[1][1] > 0.13);
        assert!(s.nrm.iter().all(|n| (n.iter().map(|c| c * c).sum::<f32>() - 1.0).abs() < 1e-5));
    }

    #[test]
    fn a_boy_stands_as_a_woman_until_he_is_grown() {
        use crate::dress::by_sex;
        assert_eq!(by_sex(-0.1, 0.14, true, 1.0), -0.1);
        assert_eq!(by_sex(-0.1, 0.14, false, 0.0), -0.1);
        assert_eq!(by_sex(-0.1, 0.14, false, 1.0), 0.14);
        assert!((by_sex(-0.1, 0.14, false, 0.5) - 0.02).abs() < 1e-6);
    }

    #[test]
    fn a_head_is_grown_when_the_dress_says_so() {
        use crate::dress::head_years;
        // up to MakeHuman's child of eleven and from its adult of 25 on the years stay as they are
        for yrs in [1.0, 8.0, 11.0, 25.0, 40.0, 80.0] {
            assert_eq!(head_years(15.0, yrs), yrs);
        }
        // between them the head gets from child to adult by `adult`, evenly, and stays an adult's
        assert_eq!(head_years(15.0, 13.0), 18.0);
        assert_eq!(head_years(15.0, 15.0), 25.0);
        assert_eq!(head_years(15.0, 20.0), 25.0);
        assert_eq!(head_years(17.0, 14.0), 18.0);
        // a dress without an earlier age leaves MakeHuman's
        assert_eq!(head_years(25.0, 17.0), 17.0);
        // a girl of 17 of England is far nearer to herself at 25 than a Roman one is
        let Some(h) = head() else { return };
        let apart = |dress| {
            let mut young = look(true, 17.0, 1, 7);
            young.dress = dress;
            let mut adult = young.clone();
            adult.age = 25.0;
            let (a, b) = (morph_test(&h, &young), morph_test(&h, &adult));
            a.iter().zip(&b).map(|(p, q)| (0..3).map(|k| (p[k] - q[k]).abs()).fold(0.0, f32::max)).fold(0.0, f32::max)
        };
        let (roman, england) = (apart(crate::dress::Dress::Roman), apart(crate::dress::Dress::England1356));
        assert!(england < roman * 0.25, "{england} {roman}");
    }

    #[test]
    fn a_childs_face_lasts_as_long_as_its_head_is_a_childs() {
        use crate::dress::child_share;
        // all child up to MakeHuman's child of eleven, none from the age the dress gives the head its adult form
        for yrs in [0.0, 2.0, 8.0, 11.0] {
            assert_eq!(child_share(15.0, yrs), 1.0);
        }
        assert_eq!(child_share(15.0, 13.0), 0.5);
        assert_eq!(child_share(15.0, 15.0), 0.0);
        assert_eq!(child_share(17.0, 14.0), 0.5);
        assert_eq!(child_share(17.0, 40.0), 0.0);
        // a dress may draw single genes of the face less strongly; one it does not name stays as it is
        let set = crate::dress::Dress::England1356.set().unwrap();
        let at = |name: &str| GENES.iter().position(|g| *g == name).unwrap();
        assert!(set.gene_gain(at("lips")) < 1.0);
        assert_eq!(set.gene_gain(at("mouthW")), 1.0);
    }

    #[test]
    fn men_of_england_wear_their_hair_in_three_lengths() {
        let set = crate::dress::Dress::England1356.set().unwrap();
        let mut n = std::collections::BTreeMap::new();
        for seed in 0..1000u32 {
            *n.entry(set.hair_of(seed)).or_insert(0) += 1;
        }
        // the shares are tenths of the people, and the same person keeps the same hair
        assert_eq!(n.into_iter().collect::<Vec<_>>(), vec![("bob01", 500), ("bob06", 300), ("bob07", 200)]);
        assert_eq!(set.hair_of(4711), set.hair_of(4711));
        // each length is a hair the repository has
        if let Some(dir) = crate::real::folder() {
            for name in set.hair_lengths.iter().map(|h| h.0).chain([set.hair]) {
                assert!(crate::real::exists(&format!("{dir}/{name}_cap.txt")), "{name}");
            }
        }
    }

    #[test]
    fn the_face_at_rest_names_targets_the_head_has() {
        // a target the head does not have is left out without a word (morph.rs), so a misspelt name would do nothing
        let Some(h) = head() else { return };
        for (_, set) in crate::dress::SETS.iter() {
            for name in set.mouth_shut.iter().chain(set.mouth_part).map(|t| t.0).chain(set.child.iter().map(|t| t.0)) {
                assert!(h.targets.contains_key(name), "{}: {name}", set.key);
            }
            for (gene, gain) in set.genes {
                assert!(GENES.contains(gene) && *gain >= 0.0, "{}: {gene}", set.key);
            }
            for (name, women, men) in set.rest {
                assert!(h.targets.contains_key(*name), "{}: {name}", set.key);
                assert!(women.max(*men) > 0.0 && women.min(*men) >= 0.0 && women.max(*men) <= 1.0, "{}: {name}", set.key);
            }
        }
    }

    #[test]
    fn a_mouth_at_rest_is_closed_in_the_dress_of_england() {
        use crate::morph::{lip_gap, morph, LIP_LOWER, LIP_UPPER};
        let Some(h) = head() else { return };
        // the two vertices are the lips' meeting point in the middle of MakeHuman's closed mouth
        let (up, lo) = (h.base[LIP_UPPER], h.base[LIP_LOWER]);
        assert!(up[0].abs() < 1e-3 && lo[0].abs() < 1e-3, "in the middle");
        assert!(up[1] > lo[1] && up[1] - lo[1] < 0.01, "touching: {} over {}", up[1], lo[1]);
        assert!(h.lip[LIP_UPPER] > 0.2 && h.lip[LIP_LOWER] > 0.2, "on the lips");
        let (mut widest_roman, mut n) = (0f32, 0);
        for female in [false, true] {
            for age in [4.0, 8.0, 13.0, 17.0, 24.0, 35.0, 50.0, 68.0, 85.0] {
                for seed in 0..12 {
                    for mood in [Mood::Neutral, Mood::Content, Mood::Grim, Mood::Sad] {
                        let mut p = look(female, age, 1, 500 + seed);
                        p.mood = mood;
                        widest_roman = widest_roman.max(lip_gap(&h, &morph(&h, &p).0).abs());
                        p.dress = crate::dress::Dress::England1356;
                        let gap = lip_gap(&h, &morph(&h, &p).0);
                        assert!(gap.abs() < 0.002, "{} of {age}, seed {seed}, {mood:?}: lips {gap} apart", if female { "woman" } else { "man" });
                        n += 1;
                    }
                }
            }
        }
        // (Apoleia's mouths, which stay as they are, stand up to this far open or closed)
        assert!(n == 864 && widest_roman > 0.01, "{widest_roman}");
    }

    #[test]
    fn parting_or_closing_the_lips_moves_their_edges_and_leaves_the_lower_lips_foot() {
        // Until round 71 lips that lay in each other were parted with MakeHuman's `mouth-lowerlip-middle-up`,
        // which, against its name, drags the lower lip's foot down four times as far as its edge: with a cupid's
        // bow on the upper lip the lower lip of every such mouth became a V. Whatever a dress parts or closes a
        // mouth with moves the lips' edges, and the foot of the lower lip's red by less than half as far.
        use crate::head::DELTA_SCALE;
        use crate::measure::LIP_FOOT;
        use crate::morph::{LIP_LOWER, LIP_UPPER};
        let Some(h) = head() else { return };
        let set = crate::dress::Dress::England1356.set().unwrap();
        for (what, with) in [("closing", set.mouth_shut), ("parting", set.mouth_part)] {
            let moved = |v: usize| -> f32 {
                with.iter()
                    .map(|&(name, share)| {
                        let t = &h.targets[name];
                        t.ids.iter().position(|&i| i as usize == v).map_or(0.0, |j| share * t.d[j][1] as f32 * DELTA_SCALE)
                    })
                    .sum()
            };
            let gap = moved(LIP_UPPER) - moved(LIP_LOWER);
            assert!(gap.abs() > 0.01, "{what}: the lips move {gap} apart per weight");
            for foot in LIP_FOOT {
                assert!(moved(foot).abs() < 0.5 * gap.abs(), "{what}: the lower lip's foot moves {}, the lips {gap} apart", moved(foot));
            }
        }
    }

    #[test]
    fn the_seam_of_the_lips_runs_from_the_middle_of_the_mouth_to_its_corners() {
        use crate::geo::{len, sub};
        use crate::morph::{LIP_LOWER, LIP_SEAM, LIP_UPPER};
        let Some(h) = head() else { return };
        for (side, sign) in LIP_SEAM.iter().zip([1f32, -1.0]) {
            assert_eq!((side.0[0], side.1[0]), (LIP_UPPER, LIP_LOWER), "from where the lips meet in the middle");
            for edge in [&side.0[..], &side.1[..]] {
                for w in edge.windows(2) {
                    let (a, b) = (h.base[w[0]], h.base[w[1]]);
                    assert!(b[0] * sign > a[0] * sign && len(sub(a, b)) < 0.09, "outward, step by step: {} {}", w[0], w[1]);
                }
            }
            // the upper lip's edge lies over the lower lip's, a millimetre at most, and in front of it
            for &u in &side.0 {
                let up = h.base[u];
                let lo = side.1.iter().map(|&v| h.base[v]).min_by(|a, b| (a[0] - up[0]).abs().total_cmp(&(b[0] - up[0]).abs())).unwrap();
                assert!(up[1] > lo[1] && up[1] - lo[1] < 0.012 && up[2] > lo[2], "{u}: {up:?} over {lo:?}");
            }
            // and both end at the corner of the mouth
            let (eu, el) = (h.base[side.0[side.0.len() - 1]], h.base[side.1[side.1.len() - 1]]);
            assert!(eu[0].abs() > 0.24 && len(sub(eu, el)) < 0.03, "{eu:?} {el:?}");
        }
        // the two sides mirror each other
        for (a, b) in LIP_SEAM[0].0.iter().chain(&LIP_SEAM[0].1).zip(LIP_SEAM[1].0.iter().chain(&LIP_SEAM[1].1)) {
            let (p, q) = (h.base[*a], h.base[*b]);
            assert!(len(sub([-p[0], p[1], p[2]], q)) < 1e-4, "{a} {b}");
        }
    }

    #[test]
    fn the_corners_of_the_eyes_lie_at_the_ends_of_their_opening() {
        use crate::geo::{len, sub};
        use crate::morph::{eye_spans, EYE_CORNERS};
        let Some(h) = head() else { return };
        for (k, part) in ["leye", "reye"].iter().enumerate() {
            let ball = &h.parts[*part][0];
            let mid = ball.iter().fold([0f32; 3], |c, &v| std::array::from_fn(|a| c[a] + h.base[v as usize][a] / ball.len() as f32));
            let (inner, outer) = (h.base[EYE_CORNERS[k][0]], h.base[EYE_CORNERS[k][1]]);
            // on either side of the pupil, 27 to 28 mm apart (MakeHuman's eye is large), at the pupil's height
            assert!(inner[0].abs() < mid[0].abs() && outer[0].abs() > mid[0].abs(), "{part}");
            assert!((0.27..0.285).contains(&len(sub(inner, outer))), "{part}: {}", len(sub(inner, outer)));
            assert!((inner[1] - mid[1]).abs() < 0.02 && (outer[1] - mid[1]).abs() < 0.02, "{part}");
            // and where the brow's lift is told by: its inner end, the pupil, the outer corner, outward in this order
            let xs = eye_spans(&h, &h.base)[k];
            assert!(xs[0] > inner[0].abs() && xs[0] < xs[1] && xs[1] < xs[2] && (xs[2] - outer[0].abs()).abs() < 1e-6, "{xs:?}");
        }
        // the two eyes mirror each other
        for j in 0..2 {
            let (p, q) = (h.base[EYE_CORNERS[0][j]], h.base[EYE_CORNERS[1][j]]);
            assert!(len(sub([-p[0], p[1], p[2]], q)) < 1e-4);
        }
    }

    #[test]
    fn an_eye_comes_forward_with_its_lids_and_the_rim_of_its_socket_stays() {
        use crate::measure::{ball, CHEEKBONES, LIDS, NOSE, PRONASALE, SELLION};
        use crate::morph::{eyes_out, EYE_CORNERS};
        let Some(h) = head() else { return };
        let (by, mut pp) = (0.02, h.base.clone());
        eyes_out(&h, &mut pp, by);
        let moved = |v: usize| pp[v][2] - h.base[v][2];
        // nothing moves sideways, up or down, nothing back and nothing further than the ball
        for v in 0..h.n {
            assert!(pp[v][0] == h.base[v][0] && pp[v][1] == h.base[v][1] && (0.0..=by + 1e-6).contains(&moved(v)), "{v}");
        }
        for (k, part) in ["leye", "reye"].iter().enumerate() {
            // the ball as it is
            assert!(h.parts[*part][0].iter().all(|&v| (moved(v as usize) - by).abs() < 1e-6), "{part}");
            // the lids' edges with it, the corners half as far (there the bone is near)
            assert!((moved(LIDS[k].0) - by).abs() < 1e-6 && (moved(LIDS[k].1) - by).abs() < 1e-6, "{part}: lids");
            for c in EYE_CORNERS[k] {
                assert!((0.3 * by..0.7 * by).contains(&moved(c)), "{part}: corner by {}", moved(c));
            }
        }
        // the face about the sockets stays: the nose's root, tip and wings, the cheekbones
        for v in [SELLION, PRONASALE].into_iter().chain(NOSE.iter().chain(&CHEEKBONES).flat_map(|p| [p.0, p.1])) {
            assert_eq!(moved(v), 0.0, "{v}");
        }
        // and so does all that lies behind the balls (the same field reaches through the head)
        let back = ball(&h, &h.base, 0).0[2] - ball(&h, &h.base, 0).1;
        assert!((0..h.n).all(|v| h.base[v][2] > back || moved(v) == 0.0));
    }

    #[test]
    fn a_ball_is_set_in_its_socket_so_that_the_pupil_stands_between_the_lids() {
        use crate::measure::{ball, LIDS};
        use crate::morph::{pupils_set, PUPIL_MOST};
        let Some(h) = head() else { return };
        let share_of = |pp: &[[f32; 3]], k: usize| (ball(&h, pp, k).0[1] - pp[LIDS[k].1][1]) / (pp[LIDS[k].0][1] - pp[LIDS[k].1][1]);
        let mut pp = h.base.clone();
        pupils_set(&h, &mut pp, 0.57, |_| 0.0);
        for (k, part) in ["leye", "reye"].iter().enumerate() {
            assert!((share_of(&pp, k) - 0.57).abs() < 1e-3, "{part}: {}", share_of(&pp, k));
            // the ball as a whole, up or down only
            let by = pp[h.parts[*part][0][0] as usize][1] - h.base[h.parts[*part][0][0] as usize][1];
            assert!(h.parts[*part][0].iter().all(|&v| (pp[v as usize][1] - h.base[v as usize][1] - by).abs() < 1e-6 && pp[v as usize][0] == h.base[v as usize][0] && pp[v as usize][2] == h.base[v as usize][2]), "{part}");
        }
        // nothing else moves: the lids stay
        let balls: std::collections::HashSet<u32> = h.parts["leye"][0].iter().chain(&h.parts["reye"][0]).copied().collect();
        assert!((0..h.n).all(|v| balls.contains(&(v as u32)) || pp[v] == h.base[v]));
        // an eye looking down has its ball set higher, and no ball leaves its socket
        let (mut down, mut far) = (h.base.clone(), h.base.clone());
        pupils_set(&h, &mut down, 0.57, |_| -0.1);
        pupils_set(&h, &mut far, 5.0, |_| 0.0);
        assert!(ball(&h, &down, 0).0[1] > ball(&h, &pp, 0).0[1]);
        assert!((ball(&h, &far, 0).0[1] - ball(&h, &h.base, 0).0[1] - PUPIL_MOST).abs() < 1e-5);
    }

    #[test]
    fn a_brow_is_lifted_evenly_between_its_inner_end_the_pupil_and_the_eyes_corner() {
        use crate::dress::brow_lift_at;
        let (xs, lift) = ([0.2, 0.3, 0.45], [1.0, 3.0, 6.0]);
        for (x, mm) in [(0.2, 1.0), (0.25, 2.0), (0.3, 3.0), (0.375, 4.5), (0.45, 6.0)] {
            assert!((brow_lift_at(x, xs, lift) - mm).abs() < 1e-5, "{x}");
        }
        // beyond the ends as at the ends: the brow's inner end and its tail
        assert_eq!(brow_lift_at(0.1, xs, lift), 1.0);
        assert_eq!(brow_lift_at(0.6, xs, lift), 6.0);
        // a child's brow is MakeHuman's: no lift, the whole band; a grown woman has all of both, a man none
        let set = crate::dress::Dress::England1356.set().unwrap();
        assert_eq!(set.brow_lift_of(true, 8.0), [0.0; 3]);
        assert_eq!(set.brow_band_of(true, 8.0), 1.0);
        assert_eq!(set.brow_lift_of(true, 30.0), set.brow_lift[0]);
        assert_eq!(set.brow_band_of(true, 30.0), set.brow_band[0]);
        assert!(set.brow_lift[0].iter().all(|mm| *mm > 0.0) && set.brow_band[0] < 1.0);
        assert_eq!((set.brow_lift_of(false, 30.0), set.brow_band_of(false, 30.0)), ([0.0; 3], 1.0));
        // a girl of 13 is half way (her head has its adult form at 15)
        assert!((set.brow_lift_of(true, 13.0)[1] - set.brow_lift[0][1] / 2.0).abs() < 1e-5);
    }

    #[test]
    fn every_style_builds() {
        let Some(h) = head() else { return };
        let mut n = 0;
        for beard in [Beard::Shaven, Beard::Stubble, Beard::Short, Beard::Full, Beard::Philosopher, Beard::Chin] {
            for hat in [Hat::None, Hat::Cap, Hat::Pileus, Hat::Petasos, Hat::Wreath] {
                let mut p = look(false, 45.0, n % 7, 1000 + n as u32);
                p.beard = Some(beard);
                p.hat = Some(hat);
                p.life.scars = 2;
                let out = build(&h, &p, n % LODS);
                assert!(out.tris > 1000 && out.top > out.chin, "{beard:?} {hat:?}");
                n += 1;
            }
        }
        for hair in [Hair::Braid, Hair::Bun, Hair::Veil] {
            for jewel in [Jewel::None, Jewel::Earrings, Jewel::Chain, Jewel::Pearls] {
                let mut p = look(true, 30.0, n % 7, 2000 + n as u32);
                p.hair = Some(hair);
                p.jewel = Some(jewel);
                p.hat = Some(if n % 2 == 0 { Hat::Diadem } else { Hat::None });
                let out = build(&h, &p, n % LODS);
                assert!(out.tris > 1000, "{hair:?} {jewel:?}");
                for s in &out.surfaces {
                    assert_eq!(s.pos.len(), s.col.len());
                    assert!(s.pos.iter().all(|v| v.iter().all(|c| c.is_finite())), "{hair:?} {jewel:?} {:?}", s.mat);
                }
                n += 1;
            }
        }
        for age in [2.0, 9.0, 15.0, 70.0] {
            build(&h, &look(age < 10.0, age, 1, 7), 1);
        }
    }

    #[test]
    fn mourners_dress_and_groom_as_mourners() {
        for seed in 0..40 {
            let mut man = look(false, 35.0, 1, seed);
            let mut woman = look(true, 35.0, 3, seed);
            for p in [&mut man, &mut woman] {
                p.life.mourn = 1.0;
            }
            assert_ne!(man.beard_style(), Beard::Shaven);
            assert_eq!(woman.hair_style(), Hair::Veil);
            assert_eq!(woman.jewel_style(), Jewel::None);
        }
        let Some(h) = head() else { return };
        let mut p = look(true, 78.0, 2, 9);
        p.life = Life { mourn: 0.6, wealth: 0.1, worn: 1.0, sun: 0.9, ..p.life };
        assert!(build(&h, &p, 1).tris > 1000);
    }

    #[test]
    fn same_person_same_portrait() {
        let Some(h) = head() else { return };
        let p = look(false, 38.0, 5, 42);
        let (a, b) = (build(&h, &p, 1), build(&h, &p, 1));
        assert_eq!(a.tris, b.tris);
        assert_eq!(a.surfaces[0].pos, b.surfaces[0].pos);
    }
}
