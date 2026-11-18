//! How much the faces of England differ from each other (round 112): the spread of their measures beside the
//! surveys', a face that is as full as its owner is heavy, and the genes that came with the round (dna.rs: the
//! last 16), which a dress with a table draws and Apoleia's does not.

mod common;

use common::{head, person};
use sc_portrait::dna::GENES;
use sc_portrait::dress::Dress;
use sc_portrait::measure::{face, far_at_mouth, lips, lower_face, neck, nose_rise, LIPS, MEASURES, NECK_LEAN};
use sc_portrait::{build, morph_test, morph_test_measured, Look};

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

/// The standard deviation of a row of numbers.
fn sd(v: &[f32]) -> f32 {
    let m = v.iter().sum::<f32>() / v.len() as f32;
    (v.iter().map(|x| (x - m).powi(2)).sum::<f32>() / (v.len() - 1) as f32).sqrt()
}

fn gene(name: &str) -> usize {
    GENES.iter().position(|g| *g == name).unwrap_or_else(|| panic!("no gene {name}"))
}

/// A person with one gene set (both alleles).
fn with(p: &Look, name: &str, value: f32) -> Look {
    let mut q = p.clone();
    q.genes[gene(name)] = value;
    q
}

#[test]
fn the_faces_of_england_differ_from_each_other_as_real_faces_do() {
    // Up to round 111 the breadths and lengths of the skull spread as the survey's (src/measure.rs `MEASURES`),
    // and what makes a face its owner's did not: the nose stood out by 1.4 mm more or less (real noses 2.7), the
    // red of the lips was 0.9 mm higher or lower (real lips 2.8 to 3.0), a head was 4.5 to 5.2 mm longer or
    // shorter (7.2 to 7.4) and a neck 9 to 11 mm thicker or thinner (lean people 20 to 28). 120 grown men and
    // 120 grown women, the face as it is measured: each spread as a share of the real one.
    let Some(h) = head() else { return };
    let n = 120;
    for female in [false, true] {
        let mut rows: Vec<Vec<f32>> = Vec::new();
        for i in 0..n {
            let pp = morph_test_measured(&h, &person(2 * i + female as u32, female, [24.0, 35.0, 50.0][i as usize % 3]));
            let mut m = face(&h, &pp);
            m.extend(lips(&pp));
            m.push(neck(&h, &pp));
            rows.push(m);
        }
        let k = female as usize;
        let who = if female { "women" } else { "men" };
        let real = |name: &str| -> (usize, f32) {
            if let Some(i) = MEASURES.iter().position(|m| m.0.starts_with(name)) {
                (i, [MEASURES[i].1, MEASURES[i].2][k][1])
            } else if let Some(i) = LIPS.iter().position(|m| m.0.starts_with(name)) {
                (MEASURES.len() + i, [LIPS[i].1, LIPS[i].2][k][1])
            } else {
                assert_eq!(name, "neck");
                (MEASURES.len() + LIPS.len(), NECK_LEAN[k][1])
            }
        };
        // what the round was for: from a third or a half of the real spread to most of it
        // (the two lips each: one gene makes both fuller and one makes one of them the fuller, where real lips
        // have more ways to differ; they have two thirds and three quarters of the real spread, before a half)
        for (name, least, most) in [
            ("nose protrusion", 0.85, 1.15),
            ("the red of both lips", 0.7, 1.1),
            ("the upper lip's red", 0.55, 1.1),
            ("the lower lip's red", 0.65, 1.1),
            ("head length", 0.7, 1.1),
            ("lip length", 0.8, 1.1),
            ("neck", 0.6, 1.0),
            // and what spread as the survey's still does
            ("face length", 0.85, 1.2),
            ("sellion to subnasale", 0.85, 1.15),
            ("breadth at the cheekbones", 0.85, 1.15),
            ("breadth at the jaw's corners", 0.75, 1.15),
            ("between the pupils", 0.85, 1.2),
            ("nose breadth", 0.85, 1.2),
            ("head breadth", 0.85, 1.3),
        ] {
            let (col, real) = real(name);
            let ours = sd(&rows.iter().map(|r| r[col]).collect::<Vec<_>>());
            if show() {
                println!("{who}, {name}: spread {ours:.2} mm, real {real} mm: {:.2} of it", ours / real);
            }
            assert!(ours / real > least && ours / real < most, "{who}, {name}: spread {ours} mm, {} of the real {real} mm", ours / real);
        }
    }
}

#[test]
fn a_face_of_england_is_as_full_as_its_owner_is_heavy() {
    // MakeHuman's targets of weight make the body and the neck heavier and leave the face: up to round 111 the
    // thinnest and the heaviest person had one face over necks of two sizes, and a hungry year showed on nobody's
    // cheeks. Now the face follows the weight as it shows (the gene, and what the person has had to eat):
    // `DressSet::fullness`.
    let Some(h) = head() else { return };
    let jaw = MEASURES.iter().position(|m| m.0.starts_with("breadth at the jaw")).unwrap();
    let still = ["between the pupils", "head breadth", "head length", "nose breadth"].map(|n| MEASURES.iter().position(|m| m.0.starts_with(n)).unwrap());
    // the neck's smallest loop, the breadth at the jaw's corners, how far the far cheek's outline runs in from
    // the cheekbone to the mouth (`far_at_mouth`: a lean cheek much, a full one little), and the skull's measures
    let read = |p: &Look| {
        let pp = morph_test_measured(&h, p);
        let m = face(&h, &pp);
        (neck(&h, &pp), m[jaw], far_at_mouth(&h, &pp, 0.35), still.map(|i| m[i]))
    };
    let mut grown_jaw = 0.0;
    for (k, female, age) in [(0u32, true, 24.0f32), (2, true, 35.0), (4, true, 50.0), (1, false, 24.0), (3, false, 35.0), (5, false, 50.0)] {
        let p = person(k, female, age);
        let who = format!("{} {k} of {age}", if female { "woman" } else { "man" });
        let [thin, mid, full] = [60.0, 128.0, 196.0].map(|g| read(&with(&p, "weight", g)));
        if show() {
            println!("{who}: neck {:.0}, {:.0}, {:.0} mm; jaw {:.1}, {:.1}, {:.1} mm; the cheek runs in by {:.1}, {:.1}, {:.1} mm", thin.0, mid.0, full.0, thin.1, mid.1, full.1, thin.2, mid.2, full.2);
        }
        assert!(mid.0 - thin.0 > 15.0 && full.0 - mid.0 > 20.0, "{who}: the neck {}, {}, {} mm", thin.0, mid.0, full.0);
        assert!(mid.1 - thin.1 > 4.0 && full.1 - mid.1 > 7.0, "{who}: the jaw {}, {}, {} mm", thin.1, mid.1, full.1);
        assert!(thin.2 - mid.2 > 2.5 && mid.2 - full.2 > 4.0, "{who}: the cheek runs in by {}, {}, {} mm", thin.2, mid.2, full.2);
        // the skull is nobody's weight
        for i in 0..still.len() {
            assert!((thin.3[i] - full.3[i]).abs() < 0.05, "{who}: {} {} and {} mm", MEASURES[still[i]].0, thin.3[i], full.3[i]);
        }
        grown_jaw += (full.1 - thin.1) / 6.0;
        // a hungry year and a fat one show as the gene does (`Look::phen`: weight grows with food)
        let fed = |food: f32| {
            let mut q = with(&p, "weight", 128.0);
            q.life.food = food;
            read(&q)
        };
        let (hungry, well) = (fed(0.1), fed(1.0));
        assert!(mid.0 - hungry.0 > 20.0 && hungry.2 - mid.2 > 5.0, "{who}, hungry: the neck {} mm ({} fed), the cheek runs in by {} ({})", hungry.0, mid.0, hungry.2, mid.2);
        assert!(well.0 - mid.0 > 20.0 && mid.2 - well.2 > 4.0, "{who}, well fed: the neck {} mm ({} fed), the cheek runs in by {} ({})", well.0, mid.0, well.2, mid.2);
        // in Apoleia's dress the face is as it was: the jaw of the thinnest and of the heaviest are one
        let roman = |g: f32| {
            let mut q = with(&p, "weight", g);
            q.dress = Dress::Roman;
            read(&q).1
        };
        assert!((roman(60.0) - roman(196.0)).abs() < 1.0, "{who} in Apoleia's dress: the jaw {} and {} mm", roman(60.0), roman(196.0));
    }
    // a small child's face has less of it (a child shows a third of what it will: `Look::grown`)
    let mut child_jaw = 0.0;
    for (k, female) in [(0u32, true), (1, false)] {
        let p = person(k, female, 4.0);
        let (thin, full) = (read(&with(&p, "weight", 60.0)), read(&with(&p, "weight", 196.0)));
        assert!(full.1 > thin.1 + 2.0 && full.0 > thin.0, "a child of 4 ({k}): the jaw {} and {} mm", thin.1, full.1);
        child_jaw += (full.1 - thin.1) / 2.0;
    }
    if show() {
        println!("from the thinnest to the heaviest the jaw is {grown_jaw:.1} mm broader on the grown, {child_jaw:.1} on a child of 4");
    }
    assert!(child_jaw < 0.75 * grown_jaw, "a child of 4: {child_jaw} mm, the grown {grown_jaw}");
}

#[test]
fn the_genes_of_round_112_show_in_the_dress_of_england_and_not_in_apoleias() {
    // Apoleia's 21 genes of the face move whole regions together (look.rs `FACE_MOD`): brows with lids, the eyes'
    // corners with the brows' angle, both lips at once, the chin with the jaw. The 16 genes after them (dna.rs)
    // move what was left: each shows on a grown face in England's dress, and none in Apoleia's.
    let Some(h) = head() else { return };
    let far = |a: &[[f32; 3]], b: &[[f32; 3]]| a.iter().zip(b).map(|(x, y)| ((x[0] - y[0]).powi(2) + (x[1] - y[1]).powi(2) + (x[2] - y[2]).powi(2)).sqrt()).fold(0f32, f32::max) * 100.0;
    let shape = ["headD", "chinW", "eyeT", "lid", "eyeH", "eyeP", "mouthH", "mouthC", "lipB", "mouthF", "noseB", "neckL", "bags", "folds"];
    assert_eq!(&GENES[34..], &[&shape[..], &["browT", "ruddy"]].concat()[..], "the genes of round 112");
    for (k, female, age) in [(6u32, true, 24.0f32), (7, false, 30.0)] {
        let p = person(k, female, age);
        for name in shape {
            let (lo, hi) = (with(&p, name, 60.0), with(&p, name, 196.0));
            let moved = far(&morph_test(&h, &lo), &morph_test(&h, &hi));
            if show() {
                println!("person {k}, {name}: the skin moves by {moved:.1} mm at most between a low and a high gene");
            }
            // (the neck's length moves the shoulders under it: 27 mm between the shortest and the longest)
            assert!(moved > 1.5 && moved < 35.0, "person {k}, {name}: the skin moves by {moved} mm at most");
            let roman = |q: &Look| {
                let mut q = q.clone();
                q.dress = Dress::Roman;
                morph_test(&h, &q)
            };
            assert!(roman(&lo) == roman(&hi), "person {k}, {name}: Apoleia's dress draws it");
        }
        let set = Dress::England1356.set().unwrap();
        // which lip is the fuller: the one grows as the other shrinks
        let red = |q: &Look| lips(&morph_test(&h, q));
        let (upper, lower) = (red(&with(&p, "lipB", 60.0)), red(&with(&p, "lipB", 196.0)));
        assert!(upper[0] > lower[0] + 1.5 && lower[1] > upper[1] + 1.5 && (upper[2] - lower[2]).abs() < 2.5, "person {k}: the lips' red {upper:?} and {lower:?} mm");
        // how high the mouth lies between nose and chin (`DressSet::mouth_gene`)
        let lean = set.lean[if female { 0 } else { 1 }];
        let share = |q: &Look| {
            let m = lower_face(&morph_test(&h, q), lean);
            m[0] / m[2]
        };
        let (high, low) = (share(&with(&p, "mouthH", 60.0)), share(&with(&p, "mouthH", 196.0)));
        assert!(low - high > 0.04 && low - high < 0.12, "person {k}: the upper lip takes {high} and {low} of the lower face");
        // the brows' weight: the band broader, and a light brow's hairs nearer the skin's colour
        let (light, heavy) = (set.brow_weight_of(&with(&p, "browT", 60.0)), set.brow_weight_of(&with(&p, "browT", 196.0)));
        assert!(light[0] < 0.7 && heavy[0] > 1.3 && light[1] > 0.2 && heavy[1] == 0.0, "person {k}: the brows {light:?} and {heavy:?}");
        assert_eq!(set.brow_weight_of(&with(&p, "browT", 128.0)), [1.0, 0.0]);
        // the cheeks' blood: the skin of a ruddy face is redder against its green than a pale one's
        let (pale, ruddy) = (set.flush_of(&with(&p, "ruddy", 60.0)), set.flush_of(&with(&p, "ruddy", 196.0)));
        assert!(pale < 0.7 && ruddy > 1.3 && set.flush_of(&with(&p, "ruddy", 128.0)) == 1.0, "person {k}: the flush {pale} and {ruddy}");
        let redness = |q: &Look| {
            let out = build(&h, q, 1);
            let skin = out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains("/skin_"))).max_by_key(|s| s.pos.len()).expect("the skin");
            skin.col.iter().map(|c| c[0] / c[1].max(1e-4)).sum::<f32>() / skin.col.len() as f32
        };
        let (pale, ruddy) = (redness(&with(&p, "ruddy", 60.0)), redness(&with(&p, "ruddy", 196.0)));
        if show() {
            println!("person {k}: red over green of the skin {pale:.3} pale and {ruddy:.3} ruddy");
        }
        assert!(ruddy > pale + 0.005, "person {k}: red over green of the skin {pale} pale and {ruddy} ruddy");
    }
    // a child shows a third of a gene and grows into the rest
    let (child, grown) = (person(6, true, 2.0), person(6, true, 24.0));
    let moved = |p: &Look| far(&morph_test(&h, &with(p, "eyeT", 60.0)), &morph_test(&h, &with(p, "eyeT", 196.0)));
    assert!(moved(&child) < 0.6 * moved(&grown) && moved(&child) > 0.0, "the eyes' tilt on a child of 2: {} mm, grown {}", moved(&child), moved(&grown));
}

#[test]
fn a_scooped_nose_keeps_a_back_that_rises_from_its_root() {
    // The gene of the nose's hump shows more strongly than Apoleia draws it, so that noses differ as real ones do.
    // On its lower half that scooped the nose's back until its upper third lay in one plane with the root: the
    // light the skin's image has on root and back, and the stage's highlight down the back, lay there as a pale
    // band from eye to eye (England's sample at 1.7 on both halves: six of 36 with the back less than 0.06 of the
    // distance between the eyes' inner corners in front of the root, the least 0.007; round 111 three and 0.038).
    // The lower half keeps Apoleia's strength (`DressSet::genes_low`); a nose's size goes by its length instead
    let Some(h) = head() else { return };
    let set = Dress::England1356.set().unwrap();
    assert!(set.gene_gain(gene("hump"), -0.5) < set.gene_gain(gene("hump"), 0.5));
    let rise: Vec<f32> = (0..240u32).map(|k| nose_rise(&morph_test(&h, &person(k, k % 2 == 0, [24.0, 35.0, 50.0][(k / 2) as usize % 3])))).collect();
    let (least, low) = (rise.iter().copied().fold(f32::MAX, f32::min), rise.iter().filter(|r| **r < 0.06).count());
    if show() {
        println!("the nose's back in front of its root, 240 grown founders: {least:.3} at the least, {low} under 0.06");
    }
    // measured 0.038 and 7
    assert!(least > 0.03, "{least}");
    assert!(low <= 12, "{low}");
    // and the lower the hump's gene, the less the back rises, still
    let p = person(6, true, 24.0);
    let at = |v: f32| nose_rise(&morph_test(&h, &with(&p, "hump", v)));
    assert!(at(60.0) < at(128.0) - 0.02 && at(128.0) < at(196.0) - 0.02, "{} {} {}", at(60.0), at(128.0), at(196.0));
}
