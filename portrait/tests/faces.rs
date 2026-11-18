//! The faces of England's dress table held against measured heads: a survey of real ones (src/measure.rs) and the
//! place of a young woman's brows. These tests use the real look, which is set once for the whole program: they
//! stand in a file of their own so that the library's tests keep Apoleia's faceted look.

mod common;

use common::{head, person};
use sc_portrait::measure::{children, children_at, CHILDREN, CHILD_AGES, EAR_RIM, GLABELLA, BACK, arcs, arcs_from, face, far_at_mouth, far_cheek, jaw_front, lips, lower_face, marks, seam, ARCS, CHEEKBONES, CHIN, JAW, LIDS, LIPS, LIP_FOOT, LIP_TOP, LOWER_FACE, MEASURES, MENTON, SELLION, SKULL, STAGE_TURN, STOMION, SUBNASALE, TRAGION, neck_at, NECK, NECK_LEAN};
use sc_portrait::{build, cheek_field, lower_band, lower_share, morph_targets, morph_test, morph_test_measured, morph_test_measured_as, morph_test_mouth, morph_test_seam, face_front, mouth_field, real, seam_field, skull_field, Beard, Head, Look, CHEEK_FIELD, LIP_SEAM, LODS, neck_share, NECK_UNDER, SEAM_REACH};

#[test]
fn the_grown_of_england_have_faces_of_human_measure() {
    // Until round 69 the women's faces were as long as the men's and broader (face length 0.99 of the men's where
    // the survey's women have 0.92, the cheekbones 152 mm across, two and a half standard deviations over the
    // survey's women), and the men's were short: a woman read as a man. Now every measure the survey has lies
    // within half a standard deviation of its mean for either sex. Since round 95 the head's breadth over the
    // ears and its length are among them: until then a woman's head was 140.6 mm broad (1.1 standard deviations
    // under the survey's, the gene of the jaw narrowed the skull) and a man's 204.2 mm long (0.9 over).
    // Since round 107 this is the face as it is measured: a portrait shows it drawn on top of that (broader, with
    // larger eyes: `DressSet::style`, held by `the_grown_of_england_are_drawn_broader_than_they_are_measured`).
    let Some(h) = head() else { return };
    let mut sums = [vec![0.0; MEASURES.len()], vec![0.0; MEASURES.len()]];
    let n = 150;
    for k in 0..2 * n {
        let female = k % 2 == 0;
        let m = face(&h, &morph_test_measured(&h, &person(k, female, [24.0, 35.0, 50.0][(k / 2) as usize % 3])));
        for (s, x) in sums[female as usize].iter_mut().zip(&m) {
            *s += x / n as f32;
        }
    }
    for (k, &(name, men, women)) in MEASURES.iter().enumerate() {
        if men[0] == 0.0 {
            continue;
        }
        for (sex, ours, real) in [("men", sums[0][k], men), ("women", sums[1][k], women)] {
            assert!(((ours - real[0]) / real[1]).abs() < 0.5, "{name}, {sex}: {ours} mm, the survey {} ({})", real[0], real[1]);
        }
        // and a woman's is the smaller, by about as much as in the survey
        let (share, real) = (sums[1][k] / sums[0][k], women[0] / men[0]);
        assert!(share < 1.0 && (share - real).abs() < 0.06, "{name}: women {share} of men, the survey {real}");
    }
}

#[test]
fn the_grown_of_england_are_drawn_broader_than_they_are_measured() {
    // Round 107 set the sample beside real pictures of the reference, each face scaled to the same length from
    // the line of the eyes to the chin. In those lengths a face of the reference is about 1.5 broad and its
    // pupils stand 0.65 apart; ours, of human measure, 1.1 to 1.3 and 0.52 to 0.57 at the same landmarks: narrow,
    // long faces with small eyes beside broad ones with large eyes under a high head. The reference draws its
    // people; England's are drawn the same way on top of the face as it is measured (`DressSet::style`), and
    // this holds how far. Women: the cheekbones 151.4 mm apart (measured 135.5), the face 105.9 mm long (114.3),
    // the pupils 69.7 mm apart (61.5), the eye's opening 35.2 by 10.4 mm (29.6 by 8.9), the head 132.2 mm high
    // over the ears (120.2), the mouth as broad as measured. Men: 156.4 (143.1), 114.1 (123.8), 70.7 (64.5),
    // 36.5 by 10.0 (31.8 by 9.0), 137.8 (130.3). For its length a face is a fifth broader and its pupils stand a
    // fifth further apart: 1.43 and 0.66 of the length from sellion to the chin on women (1.19 and 0.54), 1.37
    // and 0.62 on men (1.16 and 0.52). (Read in millimetres on the head; the shares above are read in the
    // picture, on the turned head, from the line of the eyes.)
    let Some(h) = head() else { return };
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    let show = std::env::var("SHOW").is_ok();
    let n = 100;
    let name = |k: usize| MEASURES[k].0;
    for female in [true, false] {
        let (mut measured, mut drawn, mut height) = (vec![0.0f32; MEASURES.len()], vec![0.0f32; MEASURES.len()], [0.0f32; 2]);
        for k in 0..n {
            let p = person(2 * k + !female as u32, female, [24.0, 35.0, 50.0][k as usize % 3]);
            let (a, b) = (morph_test_measured(&h, &p), morph_test(&h, &p));
            for (s, x) in measured.iter_mut().zip(face(&h, &a)) {
                *s += x / n as f32;
            }
            for (s, x) in drawn.iter_mut().zip(face(&h, &b)) {
                *s += x / n as f32;
            }
            // (the height of the head over the ears: `children`'s fifth measure)
            height[0] += children(&h, &a)[4] / n as f32;
            height[1] += children(&h, &b)[4] / n as f32;
        }
        let share: Vec<f32> = (0..MEASURES.len()).map(|k| drawn[k] / measured[k]).collect();
        if show {
            for k in 0..MEASURES.len() {
                println!("{}, {}: measured {:.1} mm, drawn {:.1} mm ({:.3})", if female { "women" } else { "men" }, name(k), measured[k], drawn[k], share[k]);
            }
            println!("{}: the head over the ears measured {:.1} mm, drawn {:.1} mm ({:.3})", if female { "women" } else { "men" }, height[0], height[1], height[1] / height[0]);
            println!("{}: breadth at the cheekbones in lengths of the face, measured {:.3}, drawn {:.3}; between the pupils {:.3}, {:.3}", if female { "women" } else { "men" }, measured[4] / measured[0], drawn[4] / drawn[0], measured[6] / measured[0], drawn[6] / drawn[0]);
        }
        let sex = if female { "women" } else { "men" };
        let between = |k: usize, lo: f32, hi: f32| assert!(share[k] > lo && share[k] < hi, "{sex}, {}: drawn {} of measured ({} and {} mm)", name(k), share[k], drawn[k], measured[k]);
        between(0, 0.88, 0.96); // face length
        between(4, 1.07, 1.16); // breadth at the cheekbones
        // breadth at the jaw's corners: a woman's lower face runs in to the chin as the reference draws it (round
        // 115, `Style::jaw`), a man's by half as much
        if female { between(5, 0.98, 1.10) } else { between(5, 1.03, 1.20) }
        between(6, 1.07, 1.18); // between the pupils
        between(11, 1.12, 1.30); // the eye's opening, length
        between(12, 1.05, 1.35); // the eye's opening, height
        between(9, 0.95, 1.06); // lip length: a small mouth in the broader face
        between(13, 1.06, 1.15); // head breadth
        between(14, 0.99, 1.01); // head length: no deeper
        assert!(height[1] / height[0] > 1.04 && height[1] / height[0] < 1.12, "{sex}: the head over the ears drawn {} of measured", height[1] / height[0]);
        // what the sheets read: the face about a fifth broader for its length, the pupils as much further apart
        let (broad, apart) = ((drawn[4] / drawn[0]) / (measured[4] / measured[0]), (drawn[6] / drawn[0]) / (measured[6] / measured[0]));
        assert!(broad > 1.12 && broad < 1.28 && apart > 1.13 && apart < 1.30, "{sex}: for its length the face is drawn {broad} as broad, the pupils {apart} as far apart");
    }
    // A head that is MakeHuman's child is drawn as it is measured (its large braincase and eyes are the tables' of
    // `skull` and `eyes_child`, by a survey of children); between eleven and its adult form it grows into the
    // drawing; no other dress has one.
    for k in 0..12 {
        let female = k % 2 == 0;
        for age in [2.0, 5.0, 8.0, 11.0] {
            let p = person(k, female, age);
            // (but for the jaw's soft edge, which every drawn head has: round 117, `Style::edge`; there the skin
            // lies within 8 mm of the measured head's; 6 mm was seen, at the sharpest of the fold)
            let (drawn, mut measured) = (morph_test(&h, &p), morph_test_measured(&h, &p));
            let soft = drawn.iter().zip(&measured).map(|(a, b)| (0..3).map(|c| (a[c] - b[c]).abs()).fold(0.0f32, f32::max)).fold(0.0f32, f32::max);
            sc_portrait::jaw_soften(&h, &mut measured, set.style_edge_of(female, p.grown()));
            assert!(set.style_of(female, age) == 0.0 && drawn == measured && soft > 0.0 && soft < 0.08, "a child of {age} ({k}) is drawn another head ({soft} units off along the jaw's edge)");
        }
        let breadth = |age: f32| {
            let p = person(k, female, age);
            face(&h, &morph_test(&h, &p))[4] / face(&h, &morph_test_measured(&h, &p))[4]
        };
        let (young, grown) = (breadth(13.0), breadth(24.0));
        assert!(young > 1.01 && young < grown - 0.01 && set.style_of(female, 13.0) > 0.2 && set.style_of(female, 13.0) < 0.8, "person {k}: at 13 the face is drawn {young} as broad, grown {grown}");
        assert!(set.style_of(female, if female { 15.0 } else { 17.0 }) == 1.0 && set.style_of(female, 68.0) == 1.0);
        let mut roman = person(k, female, 35.0);
        roman.dress = sc_portrait::dress::Dress::Roman;
        assert!(morph_test(&h, &roman) == morph_test_measured(&h, &roman), "a Roman ({k}) is drawn another head");
    }
}

#[test]
fn the_red_of_the_lips_of_england_is_as_high_as_on_real_lips() {
    // The lips' red on the middle line, upper lip, lower lip and both, against a reference group of young adults
    // (src/measure.rs `LIPS`): within half a standard deviation of its mean for either sex.
    let Some(h) = head() else { return };
    let mut sums = [[0.0; 3], [0.0; 3]];
    let n = 150;
    for k in 0..2 * n {
        let female = k % 2 == 0;
        let m = lips(&morph_test(&h, &person(k, female, [24.0, 35.0, 50.0][(k / 2) as usize % 3])));
        for (s, x) in sums[female as usize].iter_mut().zip(&m) {
            *s += x / n as f32;
        }
    }
    for (k, &(name, men, women)) in LIPS.iter().enumerate() {
        for (sex, ours, real) in [("men", sums[0][k], men), ("women", sums[1][k], women)] {
            if std::env::var("SHOW").is_ok() {
                println!("{name}, {sex}: {ours:.1} mm, the reference {} ({})", real[0], real[1]);
            }
            assert!(((ours - real[0]) / real[1]).abs() < 0.5, "{name}, {sex}: {ours} mm, the reference {} ({})", real[0], real[1]);
        }
    }
}

#[test]
fn the_far_cheek_of_a_woman_of_england_has_no_pouch() {
    // Until round 77 the cheek that is turned away from the viewer had a pouch in its outline on many women: a
    // pad that stood out at the height of the nose's tip over a dent at the height of the mouth. It is MakeHuman's
    // target `cheek-bones-incr`, which lifts no cheekbone (the breadth at the cheekbones stays as it is) but lays
    // a pad on the front of the cheek, 17 mm under the cheekbone; a woman's face at rest had 0.15 of it and her
    // genes gave up to 0.7 more. On these 150 women the pad stood out 1.4 mm in the mean (the tenth
    // with most of it 2.7 mm and more, 3.4 mm at most) over a dent of 1.7 mm; now 0.7 mm (1.2 and more, 1.5 at
    // most) over 1.0 mm. (No measured outline of real faces read for this: the bounds lie between the two states,
    // PLACEHOLDER.)
    let Some(h) = head() else { return };
    // (the outline is read on a head turned as the stage turns it: the eyes are turned back by as much)
    assert_eq!(STAGE_TURN, sc_portrait::dress::Dress::England1356.set().unwrap().gaze[0]);
    let n = 150;
    let mut all: Vec<[f32; 2]> = (0..n).map(|k| far_cheek(&h, &morph_test(&h, &person(2 * k, true, [24.0, 35.0, 50.0][k as usize % 3])), STAGE_TURN)).collect();
    let mean = |i: usize| all.iter().map(|m| m[i]).sum::<f32>() / n as f32;
    let (pad, dent) = (mean(0), mean(1));
    all.sort_by(|a, b| b[0].total_cmp(&a[0]));
    let tenth = all[n as usize / 10][0];
    if std::env::var("SHOW").is_ok() {
        println!("the far cheek of {n} women: pad {pad:.2} mm in the mean, {tenth:.2} mm where the tenth with most of it begins, {:.2} mm at most; dent {dent:.2} mm", all[0][0]);
    }
    assert!(pad < 1.05, "a woman's far cheek stands out as a pad: {pad} mm in the mean");
    assert!(tenth < 1.9, "one woman in ten has a pad of {tenth} mm and more on her far cheek");
    assert!(dent < 1.35, "under the pad of a woman's far cheek the outline has a dent: {dent} mm in the mean");
}

#[test]
fn the_upper_lip_of_a_woman_of_england_does_not_stand_out_as_a_beak() {
    // Until round 71 a woman's upper lip stood 5.0 mm in front of her lower lip in the mean of these 24 and up to
    // 6.7 mm (MakeHuman's young woman, whose lower lip lies 3 mm further back than its base head's), which from
    // the side is a beak and from the front a dark bar over a pale crescent. With the lower lip's volume and the
    // jaw a little forward it is 3.0 mm in the mean and 4.6 mm at most. Seen from the side: the foremost point of
    // the upper lip's red against that of the lower lip's, within a centimetre of the middle line. (No measure of
    // real profiles read for this: the bounds lie between the two states, PLACEHOLDER.)
    let Some(h) = head() else { return };
    let red = real::rows("real/skin_lip.txt").expect("the lips' red");
    let front = |pp: &[[f32; 3]], upper: bool| {
        (0..pp.len()).filter(|&v| red[v][0] > 0.5 && (red[v][1] > 0.5) == upper && pp[v][0].abs() < 0.1).map(|v| pp[v][2]).fold(f32::MIN, f32::max)
    };
    let (n, mut sum, mut most) = (24, 0.0, f32::MIN);
    for k in 0..n {
        let pp = morph_test(&h, &person(2 * k, true, [24.0, 35.0, 50.0][k as usize % 3]));
        let over = 100.0 * (front(&pp, true) - front(&pp, false));
        if std::env::var("SHOW").is_ok() {
            println!("woman {k}: the upper lip {over:.1} mm in front of the lower");
        }
        sum += over / n as f32;
        most = most.max(over);
    }
    if std::env::var("SHOW").is_ok() {
        println!("the upper lip of {n} women: {sum:.2} mm in front of the lower in the mean, {most:.2} mm at most");
    }
    assert!(sum < 3.5 && most < 5.2, "the upper lip of {n} women: {sum} mm in front of the lower in the mean, {most} mm at most");
}

#[test]
fn the_cheeks_of_england_are_redder_than_the_forehead() {
    // Until round 71 a face was one colour from forehead to chin (Apoleia's flush map has the nose's tip reddest
    // and a patch of 2.4 cm radius on each cheek): in the picture the cheek was no redder than the forehead
    // (CIELAB a* -1.1), where the reference's woman has +5. The skin's own colour as the builder paints it,
    // before any light: how much green is left beside the red, on the cheek (between the eye's outer corner,
    // the mouth's corner and the nose's wing) against the forehead above the nose's root. With Apoleia's map at
    // seven tenths the cheek's share is 0.97, with England's 0.85 to 0.89. (In the picture the lit cheek is
    // still no redder than the forehead: the stage's tone mapping takes the colour out of lit skin.)
    let Some(h) = head() else { return };
    let idx = &h.parts["body"][LODS - 1];
    let mark = |name: &str| marks().iter().find(|m| m.0 == name).unwrap().1;
    for k in 0..12 {
        let (female, age) = (k % 2 == 0, [24.0, 35.0, 50.0][(k / 2) as usize % 3]);
        let out = build(&h, &person(k, female, age), 1);
        let skin = out.surfaces.iter().find(|s| s.pos.len() >= idx.len() && s.tex.as_deref().is_some_and(|t| t.contains("skin"))).expect("the skin");
        let at = |v: usize| skin.pos[idx.iter().position(|&i| i as usize == v).unwrap()];
        // the colour of the skin nearest to a point
        let near = |q: [f32; 3]| {
            let d = |p: &[f32; 3]| (0..3).map(|a| (p[a] - q[a]).powi(2)).sum::<f32>();
            let v = (0..idx.len()).min_by(|&a, &b| d(&skin.pos[a]).total_cmp(&d(&skin.pos[b]))).unwrap();
            skin.col[v][1] / skin.col[v][0]
        };
        let (a, b, c) = (at(mark("eye's outer corner, left")), at(mark("mouth's corner, left")), at(mark("nose's wing, left")));
        let cheek = near(std::array::from_fn(|i| (a[i] + b[i] + c[i]) / 3.0));
        let (s, n) = (at(SELLION), at(mark("subnasale")));
        let forehead = near(std::array::from_fn(|i| s[i] + 0.45 * (s[i] - n[i])));
        if std::env::var("SHOW").is_ok() {
            println!("{} {k}: green beside red on the cheek {cheek:.3}, on the forehead {forehead:.3}, the cheek's share {:.3}", if female { "woman" } else { "man" }, cheek / forehead);
        }
        assert!(cheek < 0.93 * forehead, "{} {k}: green beside red on the cheek {cheek}, on the forehead {forehead}", if female { "woman" } else { "man" });
    }
}

#[test]
fn the_lips_of_england_are_as_light_against_the_skin_as_the_references() {
    // Round 71 set the lips' colour under a light that lit the face level and from the front. Under the light of
    // rounds 73 to 81 (from the side and above, a lit and a shaded half) the lips read darker against the lit
    // cheek than the reference's: a grown woman's lower lip 28.1 L darker (the reference's woman 22.9), a grown
    // man's 34.0 (the emperor's 25.8), while the skin over the upper lip stood as hers (5.2 against 4.4): the
    // paint, not the light. With more of the skin's own colour in the lips and less blood (round 82): 22.4 and
    // 25.2, and as red against the cheek as hers (a* +6.1, hers +6.2). Here the skin's own colour as the
    // builder paints it, before any light and before the skin's image: how light the lower lip's red is against
    // the cheek (linear light, weighed as the eye weighs red, green and blue). Until round 81 0.36 to 0.41 on
    // women and 0.36 to 0.40 on men; now 0.46 to 0.52 and 0.54 to 0.57 (in the picture a man's lower lip
    // still reads the darker against his cheek, 25.2 L against a woman's 22.4). The upper bounds are a tenth
    // over what is measured now, no more than a guard.
    // Round 103: those lips were read through three.js' ACES curve, which bends red, green and blue each on its
    // own and so draws a dark red darker and redder than it is painted. Since the picture is finished through a
    // curve that keeps a colour's hue (src/portrait/finish.ts), the same paint read 15 L under a woman's lit
    // cheek and less red than it (a* -1.9): the red has to be in the paint itself. Less of the skin's own colour
    // and a blood with half the green and blue for women, more red in a man's: 0.26 to 0.30 on women (24.5 L
    // under the lit cheek in the picture) and 0.50 to 0.55 on men. Round 106 read the men's lips on the men who
    // wear no beard over them (the mean over all men had a beard's hair in it): 18.5 L under the lit cheek, the
    // reference's emperor's 25.8. A man's are darker now, with less green and blue in the blood so that they keep
    // their red: 0.40 to 0.44 of the cheek's light (22.4 L under the lit cheek, a* 6.5 over it; his 7.1).
    // Round 107: a woman's keep more of the skin's colour (0.17, before 0.12): 0.30 to 0.35 of the cheek's light,
    // 22.1 L under the lit cheek in the picture and a* 5.0 over it (before 24.5 and 4.3; hers 22.9 and 6.2).
    // The men's lit cheek is darker on the broader face and their lips stood 20.4 L under it: a blood with less
    // of it (0.265, 0.030, 0.032; before 0.30, 0.05, 0.05).
    let Some(h) = head() else { return };
    let idx = &h.parts["body"][LODS - 1];
    let red = real::rows("real/skin_lip.txt").expect("the lips' red");
    let mark = |name: &str| marks().iter().find(|m| m.0 == name).unwrap().1;
    let light = |c: &[f32; 3]| 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    for k in 0..12 {
        let (female, age) = (k % 2 == 0, [24.0, 35.0, 50.0][(k / 2) as usize % 3]);
        let mut p = person(k, female, age);
        p.beard = Some(Beard::Shaven);
        let out = build(&h, &p, 1);
        let skin = out.surfaces.iter().find(|s| s.pos.len() >= idx.len() && s.tex.as_deref().is_some_and(|t| t.contains("skin"))).expect("the skin");
        let corner = |v: usize| idx.iter().position(|&i| i as usize == v);
        let at = |v: usize| skin.pos[corner(v).unwrap()];
        let lower: Vec<f32> = (0..red.len()).filter(|&v| red[v][0] > 0.9 && red[v][1] < 0.5).filter_map(corner).map(|c| light(&skin.col[c])).collect();
        assert!(lower.len() > 20, "the lower lip's red has {} vertices", lower.len());
        let lip = lower.iter().sum::<f32>() / lower.len() as f32;
        // the cheek: the skin within a centimetre of the middle between the eye's outer corner, the mouth's corner
        // and the nose's wing
        let (a, b, c) = (at(mark("eye's outer corner, left")), at(mark("mouth's corner, left")), at(mark("nose's wing, left")));
        let q: [f32; 3] = std::array::from_fn(|i| (a[i] + b[i] + c[i]) / 3.0);
        let near: Vec<f32> = (0..idx.len()).filter(|&v| (0..3).map(|i| (skin.pos[v][i] - q[i]).powi(2)).sum::<f32>() < 0.01).map(|v| light(&skin.col[v])).collect();
        let cheek = near.iter().sum::<f32>() / near.len() as f32;
        if std::env::var("SHOW").is_ok() {
            println!("{} {k}: the lower lip {:.3} of the cheek's light ({} corners of the cheek)", if female { "woman" } else { "man" }, lip / cheek, near.len());
        }
        let bounds = if female { (0.27, 0.38) } else { (0.35, 0.47) };
        assert!(lip / cheek > bounds.0 && lip / cheek < bounds.1, "{} {k}: the lower lip {} of the cheek's light", if female { "woman" } else { "man" }, lip / cheek);
    }
}

/// The brow as the builder made it and as MakeHuman's card lies on the same head (the binding of real_look.rs
/// `mh_hair2`), per corner of its triangles: how far the builder moved it, in millimetres, in the head's own
/// frame (the bust's lean taken out by two points of the skin), and where it stands along the eye.
fn brow_moved(h: &Head, p: &Look) -> Vec<([f32; 3], f32)> {
    let pp = morph_test(h, p);
    let out = build(h, p, 1);
    let idx = &h.parts["body"][LODS - 1];
    // the skin: its triangles' corners in the order of the head's own list (a strip that closes the lips after them)
    let skin = out.surfaces.iter().find(|s| s.pos.len() >= idx.len() && s.tex.as_deref().is_some_and(|t| t.contains("skin"))).expect("the skin");
    let at = |v: usize| skin.pos[idx.iter().position(|&i| i as usize == v).unwrap()];
    // the lean: the angle about the axis from ear to ear between the line sellion to menton as built and as morphed
    let dir = |a: [f32; 3], b: [f32; 3]| (b[2] - a[2]).atan2(b[1] - a[1]);
    let lean = dir(pp[SELLION], pp[MENTON]) - dir(at(SELLION), at(MENTON));
    let (cs, sn) = (lean.cos(), lean.sin());
    let rows = real::rows("real/eyebrow001.txt").expect("the brow's card");
    let (nv, nt) = (rows[0][0] as usize, rows[0][1] as usize);
    let (mut lo, mut hi) = ([[f32::MAX; 3]; 2], [[f32::MIN; 3]; 2]);
    for f in &rows[1..=nv] {
        for &i in &f[..3] {
            for a in 0..3 {
                for (k, q) in [h.base[i as usize], pp[i as usize]].iter().enumerate() {
                    lo[k][a] = lo[k][a].min(q[a]);
                    hi[k][a] = hi[k][a].max(q[a]);
                }
            }
        }
    }
    let card: Vec<[f32; 3]> = rows[1..=nv]
        .iter()
        .map(|f| std::array::from_fn(|a| (0..3).map(|k| f[3 + k] * pp[f[k] as usize][a]).sum::<f32>() + f[6 + a] * (hi[1][a] - lo[1][a]) / (hi[0][a] - lo[0][a]).max(1e-4)))
        .collect();
    let brow = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("eyebrow"))).expect("the brow");
    assert_eq!(brow.pos.len(), 3 * nt);
    let anchor = at(SELLION);
    rows[1 + nv..1 + nv + nt]
        .iter()
        .flat_map(|f| f[..3].to_vec())
        .zip(&brow.pos)
        .map(|(v, q)| {
            let (dy, dz) = (q[1] - anchor[1], q[2] - anchor[2]);
            let back = [q[0] - anchor[0], dy * cs - dz * sn, dz * cs + dy * sn];
            let was = card[v as usize];
            (std::array::from_fn(|a| 100.0 * (back[a] - (was[a] - pp[SELLION][a]))), was[0].abs())
        })
        .collect()
}

#[test]
fn a_woman_of_england_wears_her_brows_higher_than_makehuman_draws_them() {
    // MakeHuman's brow lies on the rim of the eye's socket, its upper edge 17 mm above the line through the eyes'
    // inner corners over the pupil; a young woman's lies at 19.8 mm (Matros, Garcia & Yaremchuk 2009). Low and
    // broad over the eye it made the women read as men, and as glowering (until round 69). From round 71 to 113
    // the band was drawn together as well (0.9, 0.7 before); since round 114 it is a little broader than
    // MakeHuman's (1.15): beside five faces of the reference the women's brows were thin lines.
    let Some(h) = head() else { return };
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    // (round 112: a person's brows are lighter or heavier by a gene of their own, `DressSet::brow_gene`, which
    // draws the band together or apart; here the gene is at its middle, the brow the table's)
    let person = |k: u32, female: bool, age: f32| {
        let mut p = person(k, female, age);
        p.genes[sc_portrait::look::BROW_T] = 128.0;
        p
    };
    for k in 0..6 {
        // a man's brow, and a child's, lie where MakeHuman's card lies: which also says that the lean is taken out
        for p in [person(2 * k + 1, false, 35.0), person(2 * k, true, 8.0)] {
            let most = brow_moved(&h, &p).iter().map(|(d, _)| d.iter().map(|x| x.abs()).fold(0.0, f32::max)).fold(0.0, f32::max);
            assert!(most < 0.05, "person {k}: moved by {most} mm");
        }
        let moved = brow_moved(&h, &person(2 * k, true, 35.0));
        // every corner goes up; on the average by the table's lift, and nowhere sideways
        let up = moved.iter().map(|(d, _)| d[1]).sum::<f32>() / moved.len() as f32;
        let (least, most) = (set.brow_lift[0].iter().copied().fold(f32::MAX, f32::min), set.brow_lift[0].iter().copied().fold(0.0, f32::max));
        assert!(up > least - 0.3 && up < most + 0.3, "woman {k}: up by {up} mm");
        let side = moved.iter().map(|(d, _)| d[0].abs()).fold(0.0, f32::max);
        assert!(side < 1.5 && moved.iter().all(|(d, _)| d[1] > 0.0), "woman {k}: sideways by {side} mm");
        // the band has another breadth than MakeHuman's: its upper corners go up by another length than its lower
        // ones, by the band's own breadth
        let (mut high, mut low) = (f32::MIN, f32::MAX);
        for (d, _) in &moved {
            high = high.max(d[1]);
            low = low.min(d[1]);
        }
        assert!(high - low > 1.0 && high - low < 6.0, "woman {k}: {low} to {high} mm");
        if std::env::var("SHOW").is_ok() {
            println!("woman {k}: up {up:.2} mm on the average, {low:.2} to {high:.2}, sideways {side:.2}");
        }
    }
}

#[test]
fn the_brows_and_lashes_of_england_are_drawn_with_its_own_images() {
    // Apoleia's image of the brow is MakeHuman's with the hairs' covering times 2.5: a closed band with a hard
    // rim, a dark bar at a game's size. MakeHuman's lashes are long single hairs: thin they do not show, dense
    // they are a doll's. Since round 76 England names an image of its own for each, on the cards of MakeHuman's.
    let Some(h) = head() else { return };
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    assert_eq!((set.brows, set.brow_image, set.lash_image), (["eyebrow001"; 2], "eyebrow1356", "Eyelashes1356"));
    for k in 0..4 {
        let out = build(&h, &person(k, k % 2 == 0, [5.0, 35.0][(k / 2) as usize % 2]), 1);
        let worn = |name: &str| out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains(name))).count();
        // (the image is there: without the file the builder would name a .png)
        assert_eq!((worn("/eyebrow1356.webp"), worn("/Eyelashes1356.webp")), (1, 1), "person {k}");
        assert_eq!((worn("/eyebrow001."), worn("/Eyelashes01.")), (0, 0), "person {k}");
    }
}

#[test]
fn a_scar_of_england_is_a_pale_line_in_the_skin() {
    // Until round 72 a scar was Apoleia's raised ribbon: a surface without the skin's image, with facets, in a
    // colour mixed for skin without an image. On a face of the real look it was a dark brown strip of bark (two
    // of the 36 people of the sample wore one). Now it is a ribbon in the skin's own image, normals and colours,
    // lighter along its middle.
    let Some(h) = head() else { return };
    let idx = &h.parts["body"][LODS - 1];
    let grey = |c: &[f32; 3]| 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    for k in 0..12 {
        let mut p = person(k, k % 2 == 0, 35.0);
        p.life.scars = 2;
        let out = build(&h, &p, 1);
        let skins: Vec<_> = out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains("skin"))).collect();
        assert_eq!(skins.len(), 2, "person {k}: the skin and its scars");
        let (skin, scar) = (skins[0], skins[1]);
        assert!(skin.pos.len() >= idx.len() && !scar.pos.is_empty() && scar.pos.len() % 3 == 0, "person {k}: {} corners", scar.pos.len());
        assert!(scar.tex == skin.tex && scar.nmap == skin.nmap && scar.uv.len() == scar.pos.len() && scar.nrm.len() == scar.pos.len(), "person {k}: in the skin's image");
        // on the skin: no corner further from a corner of the skin than the skin's triangles are long (on cheek
        // and forehead up to 2 cm)
        let (mut dark, mut light) = (f32::MAX, 0f32);
        for ((q, c), uv) in scar.pos.iter().zip(&scar.col).zip(&scar.uv) {
            let near = (0..idx.len()).min_by(|&a, &b| dist(q, &skin.pos[a]).total_cmp(&dist(q, &skin.pos[b]))).unwrap();
            assert!(dist(q, &skin.pos[near]) < 0.2, "person {k}: a corner {} off the skin", dist(q, &skin.pos[near]));
            // against the skin beside it: as light at its edges, lighter along its middle, nowhere dark. The skin
            // beside it is the corner next to it in the image they share (next to it in space a scar by the eye
            // has a corner of the lid's dark edge, which lies elsewhere in the image)
            let d2 = |a: &[f32; 2], b: &[f32; 2]| (a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2);
            let beside = (0..idx.len()).min_by(|&a, &b| d2(uv, &skin.uv[a]).total_cmp(&d2(uv, &skin.uv[b]))).unwrap();
            let against = grey(c) / grey(&skin.col[beside]);
            dark = dark.min(against);
            light = light.max(against);
        }
        if std::env::var("SHOW").is_ok() {
            println!("person {k}: {} corners, {dark:.2} to {light:.2} of the skin's lightness beside them", scar.pos.len());
        }
        assert!(dark > 0.8 && light > 1.1 && light < 1.6, "person {k}: {dark} to {light} of the skin's lightness");
    }
}

#[test]
fn stubble_of_england_is_hairs_on_skin_and_no_paint_in_it() {
    // Apoleia paints the skin of the beard's zone towards a dark brown under any beard (the grains of its faceted
    // look), and the real look lays its layer of hairs over that. On England's stage a man with stubble had a
    // jaw 33 L darker than the same skin without it, two thirds of the way to a dark full beard (44 to 54): a
    // dirty mask over the lower face, with a line across the cheek where the paint ends and a pale patch over the
    // upper lip, which the paint leaves free (until round 79). England's skin keeps none of that paint under
    // stubble: the skin of a man with stubble is the skin he has shaven, and the stubble is the layer of hairs.
    let Some(h) = head() else { return };
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    assert_eq!((set.beard_stubble, set.stubble_paint), ("beard_stubble1356", 0.0));
    let skin = |out: &sc_portrait::Portrait| out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("skin"))).unwrap().col.clone();
    let grey = |c: &[[f32; 3]]| c.iter().map(|c| 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]).sum::<f32>() / c.len() as f32;
    for k in 0..6 {
        let mut p = person(2 * k + 1, false, [24.0, 35.0, 50.0][k as usize % 3]);
        p.beard = Some(Beard::Shaven);
        let shaven = build(&h, &p, 1);
        p.beard = Some(Beard::Stubble);
        let worn = build(&h, &p, 1);
        assert!(skin(&shaven) == skin(&worn), "person {k}: the skin under stubble is painted");
        let layers = |out: &sc_portrait::Portrait, name: &str| out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains(name))).count();
        assert_eq!((layers(&worn, "/beard_stubble1356_cap."), layers(&shaven, "/beard_stubble")), (1, 0), "person {k}");
        // a Roman keeps Apoleia's paint (his portrait is held byte for byte elsewhere): all of his skin taken
        // together, the body's too, is a tenth darker by it (0.89 to 0.91 of its lightness)
        p.dress = sc_portrait::dress::Dress::Roman;
        let roman = build(&h, &p, 1);
        p.beard = Some(Beard::Shaven);
        let against = grey(&skin(&roman)) / grey(&skin(&build(&h, &p, 1)));
        if std::env::var("SHOW").is_ok() {
            println!("person {k}: a Roman's skin under stubble has {against:.3} of its lightness shaven");
        }
        assert!(against < 0.95, "person {k}: {against}");
    }
}

fn dist(a: &[f32; 3], b: &[f32; 3]) -> f32 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
}

#[test]
fn a_woman_of_england_has_her_eyes_as_deep_in_her_head_as_real_women_have() {
    // Until round 74 a woman's eyes lay 2 to 5 mm deeper in her head than a man's (MakeHuman's woman): the ball's
    // front 10.4 mm before the skin beside the eye where a man's stands 13.5 mm before it, 1.1 mm before the skin
    // under the eye (a man's 3.5), the nose's root 13.6 mm in front of it (9.0). In real heads the sexes differ
    // by about a millimetre (src/measure.rs `EYE_SEX`). The skin over her lid leaned 39 degrees down where a man's
    // leans 22, and lay in shade in any light. Her eyes are brought forward with their lids (`DressSet::eye_out`):
    // now the difference between the sexes is within a millimetre and a half of the real one at all three places.
    let Some(h) = head() else { return };
    let (n, mut sums) = (60, [[0.0; 3]; 2]);
    for k in 0..2 * n {
        let female = k % 2 == 0;
        let m = sc_portrait::measure::eye_stands(&h, &morph_test(&h, &person(k, female, [24.0, 35.0, 50.0][(k / 2) as usize % 3])));
        for (s, x) in sums[female as usize].iter_mut().zip(&m) {
            *s += x / n as f32;
        }
    }
    for (k, &(name, real)) in sc_portrait::measure::EYE_SEX.iter().enumerate() {
        let ours = sums[1][k] - sums[0][k];
        if std::env::var("SHOW").is_ok() {
            println!("{name}: women {:.1} mm, men {:.1} mm, the difference {ours:.1} (real heads {real:.1})", sums[1][k], sums[0][k]);
        }
        assert!((ours - real).abs() < 1.5, "{name}: women {} mm, men {} mm, in real heads the difference is {real}", sums[1][k], sums[0][k]);
    }
}

#[test]
fn the_grown_of_england_hold_their_heads_as_people_do() {
    // MakeHuman's head stands bowed, a woman's as a man's: seen from the side its chin lies 9 mm behind the upright
    // line through the subnasale and its forehead 3 to 4 mm behind it, where a head held naturally has the chin 3 mm
    // and the forehead 8 mm behind that line (src/measure.rs `PROFILE`). Round 50 leaned the men back (0.14) and
    // the women further forward (-0.1, because their upturned noses read as seen from below): a woman held her
    // head 14 degrees lower than a man and looked up from under her brows, with her eyes in their shade (until
    // round 74). With the table's lean the four points of the profile lie within two of the reference's standard
    // deviations for either sex, and one and a half in the mean; with the old lean a woman's did not.
    let Some(h) = head() else { return };
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    let rms = |female: bool, lean: f32, show: bool| {
        let (n, mut sums) = (60, [0.0; 4]);
        for k in 0..n {
            let m = sc_portrait::measure::profile(&h, &morph_test(&h, &person(2 * k + !female as u32, female, [24.0, 35.0, 50.0][k as usize % 3])), lean);
            for (s, x) in sums.iter_mut().zip(&m) {
                *s += x / n as f32;
            }
        }
        let off: Vec<f32> = sc_portrait::measure::PROFILE.iter().zip(&sums).map(|(&(_, men, women), ours)| (ours - if female { women } else { men }[0]) / if female { women } else { men }[1]).collect();
        if show && std::env::var("SHOW").is_ok() {
            println!("{}, lean {lean}: {:?} mm, in standard deviations from the reference {:?}", if female { "women" } else { "men" }, sums, off);
        }
        (off.iter().map(|x| x * x).sum::<f32>() / 4.0).sqrt().max(if show { off.iter().fold(0.0, |m: f32, x| m.max(x.abs())) - 0.5 } else { 0.0 })
    };
    for female in [true, false] {
        let worst = rms(female, set.lean[if female { 0 } else { 1 }], true);
        assert!(worst < 1.5, "{}: {worst} standard deviations from the reference", if female { "women" } else { "men" });
    }
    assert!(rms(true, -0.1, false) > 3.0);
}

#[test]
fn the_mouth_of_england_lies_between_nose_and_chin_where_a_real_one_lies() {
    // Until round 92 the mouth of the grown lay right under the nose over a long chin: `rest` gives a woman's face
    // the survey's length with a longer nose and a longer chin, which moves the nose's foot and the chin away from
    // a mouth that stays. Of the height from the nose's foot to the chin's lowest point the upper lip took 0.22 on
    // a woman and 0.27 on a man, where real faces have 0.30 to 0.31 (src/measure.rs `LOWER_FACE`): an upper lip
    // of 14 mm over 50 mm of lower lip and chin. Now the mouth lies at the dress table's share (`mouth_at`).
    let Some(h) = head() else { return };
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    let show = std::env::var("SHOW").is_ok();
    let (lo, hi) = LOWER_FACE.iter().flat_map(|&(_, men, women)| [men[0], women[0]]).fold((f32::MAX, f32::MIN), |(lo, hi), x| (lo.min(x), hi.max(x)));
    assert!(set.mouth_at > lo && set.mouth_at < hi + 0.005, "the table's share {} and the real ones {lo} to {hi}", set.mouth_at);
    for female in [true, false] {
        let lean = set.lean[if female { 0 } else { 1 }];
        let (n, mut was, mut is, mut mm) = (60, 0.0, 0.0, [0.0; 2]);
        let mut own: Vec<f32> = Vec::new();
        for k in 0..n {
            let p = person(2 * k + !female as u32, female, [24.0, 35.0, 50.0, 68.0][k as usize % 4]);
            let (before, after) = (lower_face(&morph_test_mouth(&h, &p, 0.0), lean), lower_face(&morph_test(&h, &p), lean));
            // nose's foot and chin stay: the height between them is what it was
            assert!((before[2] - after[2]).abs() < 0.01, "person {k}: from the nose's foot to the chin {} mm, before {}", after[2], before[2]);
            // and everyone grown has the mouth at the table's share, or lower where it lay lower
            // (round 112: the share is the person's own, the table's moved by the gene of the mouth's height)
            let (share, at) = (after[0] / after[2], set.mouth_at_of(&p));
            own.push(at);
            assert!(share > at - 0.002 && share < 0.40, "person {k}: the upper lip takes {share} of the lower face, the person's share is {at}");
            assert!(share < at + 0.002 || (share - before[0] / before[2]).abs() < 1e-4, "person {k}: a mouth that lay lower was moved, {share}");
            // (the fault is the measured face's: the drawn one, round 107, has a shorter chin under the same mouth)
            let before = lower_face(&morph_test_measured_as(&h, &p, Some(0.0), None, None, None), lean);
            was += before[0] / before[2] / n as f32;
            is += share / n as f32;
            mm[0] += after[0] / n as f32;
            mm[1] += after[1] / n as f32;
        }
        if show {
            println!("{}: the upper lip's share of the lower face {is:.3}, without the table's share {was:.3}; upper lip {:.1} mm, lower lip and chin {:.1} mm", if female { "women" } else { "men" }, mm[0], mm[1]);
        }
        // the head without the table's share has the fault (women 0.22, men 0.27)
        assert!(was < if female { 0.24 } else { 0.285 }, "{}: {was} without the table's share", if female { "women" } else { "men" });
        assert!(is > lo && is < hi + 0.005, "{}: {is}, real faces {lo} to {hi}", if female { "women" } else { "men" });
        // the persons' own shares lie round the table's and spread by about 0.02 (`DressSet::mouth_gene`)
        let mean = own.iter().sum::<f32>() / n as f32;
        let sd = (own.iter().map(|x| (x - mean).powi(2)).sum::<f32>() / (n - 1) as f32).sqrt();
        if show {
            println!("{}: the persons' own shares {mean:.3} ({sd:.3})", if female { "women" } else { "men" });
        }
        assert!((mean - set.mouth_at).abs() < 0.008 && sd > 0.012 && sd < 0.03, "the persons' own shares: {mean} ({sd})");
    }
    // small children, whose mouths lie low enough as MakeHuman has them, keep theirs: in the mean of 40 the share
    // moves by less than 0.01
    let (n, mut was, mut is) = (40, 0.0, 0.0);
    for k in 0..n {
        let p = person(k, k % 2 == 0, [2.0, 5.0][(k / 2) as usize % 2]);
        let (before, after) = (lower_face(&morph_test_mouth(&h, &p, 0.0), set.lean[0]), lower_face(&morph_test(&h, &p), set.lean[0]));
        was += before[0] / before[2] / n as f32;
        is += after[0] / after[2] / n as f32;
    }
    if show {
        println!("children of 2 and 5: {is:.3}, without the table's share {was:.3}");
    }
    assert!(is - was < 0.01 && is >= was, "children of 2 and 5: {is}, before {was}");
    // The lips move as they are: every vertex that is lip (real/skin_lip.txt) goes the whole way, the nose's foot
    // and the chin's lowest point none of it, and the lips' red is as high as it was
    let lip = real::column("real/skin_lip.txt", 0.0);
    let red: Vec<usize> = (0..lip.len()).filter(|&v| lip[v] > 0.05).collect();
    assert!(red.len() > 200, "{} vertices of the lips", red.len());
    for &v in &red {
        assert!(mouth_field(&h, v) > 0.999, "vertex {v} of the lips goes {} of the way", mouth_field(&h, v));
    }
    assert!(mouth_field(&h, SUBNASALE) == 0.0 && mouth_field(&h, MENTON) == 0.0 && mouth_field(&h, SELLION) == 0.0);
    let p = person(0, true, 35.0);
    let (a, b) = (lips(&morph_test_mouth(&h, &p, 0.0)), lips(&morph_test(&h, &p)));
    assert!((0..3).all(|k| (a[k] - b[k]).abs() < 0.01), "the lips' red {b:?} mm, before {a:?}");
}

#[test]
fn the_jaw_of_england_has_no_dent_beside_the_chin() {
    // Until round 93 every face of England had a dent beside the chin, on the jaw's lower edge: lit from the side
    // a dark patch with a bump behind it, the chin a block set under the face. From round 50 the dress table's
    // `rest` held MakeHuman's `chin-jaw-drop-decr` at 0.6 as "the jaw closing the mouth". The target moves no jaw
    // and no lip. What it is, held here so that the name is not read so again: 25 vertices of skin on each side
    // of the chin, between the chin's lowest point and the mouth's line, lifted by up to 4.2 mm.
    let Some(h) = head() else { return };
    let show = std::env::var("SHOW").is_ok();
    let (decr, incr) = ("chin/chin-jaw-drop-decr", "chin/chin-jaw-drop-incr");
    let t = &h.targets[decr];
    let lip = real::column("real/skin_lip.txt", 0.0);
    let marks: Vec<usize> = [MENTON, SUBNASALE].into_iter().chain(STOMION).chain(LIP_TOP).chain(LIP_FOOT).chain(JAW.iter().flat_map(|&(a, b)| [a, b])).collect();
    let (mut most, mut sides) = (0.0f32, [0, 0]);
    for (j, &i) in t.ids.iter().enumerate() {
        let (v, at, up) = (i as usize, h.base[i as usize], t.d[j][1] as f32 / 30.0);
        assert!(at[0].abs() > 0.2 && at[0].abs() < 0.5, "vertex {v} lies {} mm from the middle", at[0] * 100.0);
        assert!(at[1] > h.base[MENTON][1] && at[1] < h.base[STOMION[0]][1], "vertex {v} lies at {}", at[1]);
        assert!(up > -0.05, "vertex {v} is moved down, {up} mm");
        assert!(!marks.contains(&v) && lip[v] < 0.05, "vertex {v} is a landmark of the face or lip");
        most = most.max(up);
        sides[(at[0] > 0.0) as usize] += 1;
    }
    assert!(sides == [25, 25] && most > 4.0 && most < 4.4, "{sides:?} vertices, lifted by up to {most} mm");
    // The table names neither of the two targets, and England's heads take nothing of the lifting one, whoever
    // asks for it (`DressSet::without`): the gene of the chin's height asked for up to 0.27 of it on a short
    // chin, 1.1 mm, which on a child's jaw still drew a faint shade. With the table's row the grown had 1.5 to
    // 3.5 mm. The other target, a jowl that hangs, stays the person's own: on about half of them, 1.5 mm at most.
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    assert!(set.rest.iter().all(|r| !r.0.contains("chin-jaw-drop")), "the table's rest moves the skin beside the chin");
    assert!(set.without.contains(&decr), "the table takes of {decr}");
    let hang = h.targets[incr].d.iter().map(|d| -(d[1] as f32) / 30.0).fold(0.0, f32::max);
    for (who, ages) in [("the grown", [24.0, 35.0, 50.0, 68.0]), ("children", [2.0, 5.0, 8.0, 13.0])] {
        let (n, mut with, mut far) = (120u32, 0u32, 0.0f32);
        for k in 0..n {
            let made = morph_targets(&h, &person(k, k % 2 == 0, ages[(k / 2) as usize % 4]));
            let weight = |name: &str| made.iter().filter(|m| m.0 == name).map(|m| m.1).sum::<f32>();
            assert!(weight(decr) == 0.0, "{who}, person {k}: the skin beside the chin lifted by {} mm", weight(decr) * most);
            let mm = weight(incr) * hang;
            assert!(mm < 1.6, "{who}, person {k}: a jowl of {mm} mm");
            with += (mm > 0.1) as u32;
            far = far.max(mm);
        }
        if show {
            println!("{who}: none lifted beside the chin; {with} of {n} with a jowl of more than 0.1 mm, {far:.2} mm at most");
        }
        assert!(with > n / 4 && with < 3 * n / 4, "{who}: {with} of {n} with a jowl");
    }
}

#[test]
fn the_gene_of_the_jaw_of_england_moves_the_jaw_and_not_the_skull() {
    // Until round 95 a narrow jaw came with a skull narrowed to a point and a wide jaw with a skull narrowed too:
    // the gene of the jaw asks for MakeHuman's diamond or triangular head, and each of them is two things, a jaw
    // and a skull, with nothing between them. Every woman of England had the diamond at about 0.9 (until round 96
    // the table shifted her gene towards the narrow jaw): the skull over the ears up to 15 mm narrower a side, a
    // head like an egg's point under plaits and veil. Round 96 added the head that is broad above and narrow
    // below (the women's rest): a jaw that runs in to the chin, and above it wider cheekbones and a wider skull.
    let Some(h) = head() else { return };
    let show = std::env::var("SHOW").is_ok();
    let band = lower_band(&h);
    let (menton, mm) = (h.base[MENTON][1], |d: [i16; 3]| (d.iter().map(|&c| (c as f32 / 30.0).powi(2)).sum::<f32>()).sqrt());
    assert!(band[0] < band[1] && lower_share(band[0], band) == 1.0 && lower_share(band[1], band) == 0.0);
    assert!((lower_share((band[0] + band[1]) / 2.0, band) - 0.5).abs() < 1e-3);
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    assert_eq!(set.lower_only, ["head/head-diamond", "head/head-triangular", "head/head-invertedtriangular"]);
    for (name, jaw_min, band_max, skull_min) in [("head/head-diamond", 6.0, 4.5, 20.0), ("head/head-triangular", 12.0, 4.5, 12.0), ("head/head-invertedtriangular", 7.0, 6.5, 4.0)] {
        // what the target is: how far it moves a vertex at most under the band, in it and over it
        let t = &h.targets[name];
        let mut most = [0.0f32; 3];
        for (j, &i) in t.ids.iter().enumerate() {
            let y = h.base[i as usize][1];
            let part = if y < band[0] { 0 } else if y < band[1] { 1 } else { 2 };
            most[part] = most[part].max(mm(t.d[j]));
        }
        if show {
            println!("{name}: moves a vertex by up to {:.1} mm under the cheekbones, {:.1} between them and the root of the nose ({:.0} to {:.0} mm over the menton), {:.1} above", most[0], most[1], (band[0] - menton) * 100.0, (band[1] - menton) * 100.0, most[2]);
        }
        assert!(most[0] > jaw_min && most[2] > skull_min && most[1] < band_max, "{name}: {most:?} mm");
    }
    // The same person with the gene at its two ends: with England's table nothing from the root of the nose up
    // moves and the head is as broad over the ears, while the jaw goes from narrow to wide. Without a table
    // (Apoleia's look, which stays as it is) the skull goes with the jaw.
    let (jaw, skull) = (MEASURES.iter().position(|m| m.0.starts_with("breadth at the jaw")).unwrap(), MEASURES.iter().position(|m| m.0.starts_with("head breadth")).unwrap());
    let (mut least, mut most_up, mut most_skull, mut roman) = (f32::MAX, 0.0f32, 0.0f32, f32::MAX);
    for k in 0..40 {
        let p = person(k, k % 2 == 0, [24.0, 35.0, 50.0][(k / 2) as usize % 3]);
        let ends = |p: &Look| {
            let (mut a, mut b) = (p.clone(), p.clone());
            (a.genes[4], b.genes[4]) = (0.0, 255.0);
            (morph_test(&h, &a), morph_test(&h, &b))
        };
        let (a, b) = ends(&p);
        let moved = |a: &[[f32; 3]], b: &[[f32; 3]]| (0..h.n).filter(|&v| h.base[v][1] >= band[1]).map(|v| 100.0 * dist(&a[v], &b[v])).fold(0.0, f32::max);
        let up = moved(&a, &b);
        let (fa, fb) = (face(&h, &a), face(&h, &b));
        assert!(up < 0.01, "person {k}: the gene of the jaw moves the head over the root of the nose by {up} mm");
        assert!((fa[skull] - fb[skull]).abs() < 0.01, "person {k}: the head {} and {} mm broad", fa[skull], fb[skull]);
        assert!(fb[jaw] - fa[jaw] > 12.0, "person {k}: the jaw {} and {} mm broad", fa[jaw], fb[jaw]);
        least = least.min(fb[jaw] - fa[jaw]);
        most_up = most_up.max(up);
        most_skull = most_skull.max((fa[skull] - fb[skull]).abs());
        let mut r = p.clone();
        r.dress = sc_portrait::dress::Dress::Roman;
        let (a, b) = ends(&r);
        roman = roman.min(moved(&a, &b));
    }
    if show {
        println!("the gene of the jaw from end to end, 40 grown: the jaw at least {least:.1} mm broader, the head over the root of the nose moved by {most_up:.3} mm at most, its breadth by {most_skull:.3}; without a table the skull moves by at least {roman:.1} mm");
    }
    assert!(roman > 10.0, "without a table the skull moves by {roman} mm only");
}

#[test]
fn a_tape_from_ear_to_ear_of_england_is_about_as_long_as_on_real_heads() {
    // How full a face is, the breadths do not tell: the survey's four arcs do, a tape laid from the notch over one
    // ear's flap to the other's, over the chin, under the nose, over the forehead and over the crown (round 96).
    // The men's lie within half a standard deviation of the survey's, and the women's over the forehead.
    // What is open: a woman's tape is 0.6 standard deviations short over the chin and 0.8 under the nose, her
    // cheeks are leaner than the survey's (whose people are of today's United States and heavier than those of
    // the fourteenth century; how much of the gap that is, nobody measured). No target of MakeHuman tried fills
    // them without a lump on the far cheek's outline (twelve variants, docs/PORTRAITS.md). Held here so that it
    // grows no further. Over the crown the survey's tape lies on hair, a woman's more: ours lies on the skin.
    let Some(h) = head() else { return };
    let show = std::env::var("SHOW").is_ok();
    let n = 150;
    let mut sums = [[0.0f32; 4]; 2];
    for k in 0..2 * n {
        let female = k % 2 == 0;
        // (the face as it is measured: a portrait's is drawn broader, `DressSet::style`)
        let m = arcs(&h, &morph_test_measured(&h, &person(k, female, [24.0, 35.0, 50.0][(k / 2) as usize % 3])));
        for (s, x) in sums[female as usize].iter_mut().zip(&m) {
            *s += x / n as f32;
        }
    }
    // how far a woman's mean may lie under the survey's, in its standard deviations
    let short = [0.8, 1.0, 0.5, 1.2];
    for (k, &(name, men, women)) in ARCS.iter().enumerate() {
        let (m, w) = ((sums[0][k] - men[0]) / men[1], (sums[1][k] - women[0]) / women[1]);
        if show {
            println!("{name}: men {:.1} mm (the survey {}, {m:+.2} SD), women {:.1} mm ({}, {w:+.2} SD), women {:.3} of men (the survey {:.3})", sums[0][k], men[0], sums[1][k], women[0], sums[1][k] / sums[0][k], women[0] / men[0]);
        }
        assert!(m.abs() < 0.5, "{name}, men: {} mm, the survey {} ({})", sums[0][k], men[0], men[1]);
        assert!(w < 0.5 && w > -short[k], "{name}, women: {} mm, the survey {} ({})", sums[1][k], women[0], women[1]);
        assert!(sums[1][k] < sums[0][k], "{name}: women {} mm, men {}", sums[1][k], sums[0][k]);
    }
    // The ear's landmark was placed by eye, to about 3 mm. What that is worth: the same tapes from each vertex
    // within 3 mm of it (the other ear's mirrored). No arc changes by more than 7 mm, half a standard deviation.
    let mirror = |v: usize| (0..h.n).min_by(|&a, &b| {
        let d = |u: usize| dist(&h.base[u], &[-h.base[v][0], h.base[v][1], h.base[v][2]]);
        d(a).total_cmp(&d(b))
    }).unwrap();
    assert!(mirror(TRAGION.0) == TRAGION.1, "the ears' landmarks are not each other's mirror: {} and {}", mirror(TRAGION.0), TRAGION.1);
    let near: Vec<usize> = (0..h.n).filter(|&v| v != TRAGION.0 && dist(&h.base[v], &h.base[TRAGION.0]) < 0.03).collect();
    assert!(near.len() >= 4, "{} vertices within 3 mm of the ear's landmark", near.len());
    let mut most = [0.0f32; 4];
    for k in 0..8 {
        let pp = morph_test(&h, &person(k, k % 2 == 0, [24.0, 35.0, 50.0][(k / 2) as usize % 3]));
        let at = arcs(&h, &pp);
        for &v in &near {
            let moved = arcs_from(&h, &pp, (v, mirror(v)));
            for (m, (a, b)) in most.iter_mut().zip(at.iter().zip(&moved)) {
                *m = m.max((a - b).abs());
            }
        }
    }
    if show {
        println!("the ear's landmark moved to one of {} vertices within 3 mm: the arcs change by up to {most:.1?} mm", near.len());
    }
    assert!(most.iter().all(|&m| m > 0.5 && m < 7.0), "the arcs change by up to {most:?} mm");
}

#[test]
fn a_woman_of_england_has_a_jaw_that_runs_in_to_her_chin() {
    // Until round 96 a woman's chin was broad and flat beside the references' small round one. The table shifted
    // her gene of the jaw towards MakeHuman's diamond, which narrows the cheeks at the mouth's height and hardly
    // the chin: the front of her jaw was as broad as a man's from the chin up to the mouth (5 mm over the chin's
    // lowest point 56.9 mm, a man's 54.8), under a face 8 % smaller. Now her gene is not shifted and her `rest`
    // holds the lower part of MakeHuman's head that is broad above and narrow below: the jaw runs in to the chin.
    // That a woman's jaw does so is anatomy's common knowledge; that the weight is 1 is held by the survey's
    // breadth at the jaw's corners (the first test of this file), the breadth near the chin itself no survey gave.
    let Some(h) = head() else { return };
    let show = std::env::var("SHOW").is_ok();
    let name = "head/head-invertedtriangular";
    let heights = [3.0, 5.0, 9.0, 11.0, 15.0, 19.0, 25.0, 31.0];
    let n = 150;
    let mut sums = [[0.0f32; 8]; 2];
    for k in 0..2 * n {
        let female = k % 2 == 0;
        let p = person(k, female, [24.0, 35.0, 50.0][(k / 2) as usize % 3]);
        let weight: f32 = morph_targets(&h, &p).iter().filter(|m| m.0 == name).map(|m| m.1).sum();
        assert!(weight == if female { 1.0 } else { 0.0 }, "person {k}: {name} at {weight}");
        // (the face as it is measured: the drawn one's chin is short, and 11 mm over it is another place)
        let pp = morph_test_measured(&h, &p);
        for (s, &over) in sums[female as usize].iter_mut().zip(&heights) {
            *s += jaw_front(&h, &pp, over) / n as f32;
        }
    }
    let share: Vec<f32> = (0..heights.len()).map(|k| sums[1][k] / sums[0][k]).collect();
    if show {
        println!("the jaw's front at {heights:?} mm over the menton: men {:.1?} mm, women {:.1?} mm, women as a share of men {share:.3?}", sums[0], sums[1]);
    }
    // 5 mm over the chin's lowest point a woman's jaw is narrower than a man's, and from 9 to 19 mm (up to under
    // the mouth) by about a tenth; before, 1.04 and 0.97 to 0.99
    assert!(share[1] < 0.98, "5 mm over the menton a woman's jaw is {} of a man's", share[1]);
    for k in 2..6 {
        assert!(share[k] > 0.86 && share[k] < 0.95, "{} mm over the menton a woman's jaw is {} of a man's", heights[k], share[k]);
    }
    // A small child of either sex has a third of it (as of all of the women's `rest`: a small child's face is not
    // a man's); a girl grows into the whole, a boy out of it.
    let of = |female: bool, age: f32| morph_targets(&h, &person(if female { 0 } else { 1 }, female, age)).iter().filter(|m| m.0 == name).map(|m| m.1).sum::<f32>();
    let (mut girl, mut boy) = (of(true, 2.0), of(false, 2.0));
    assert!(girl > 0.3 && girl < 0.45 && (girl - boy).abs() < 0.05, "at 2 a girl has {girl} of it and a boy {boy}");
    for age in [5.0, 8.0, 13.0, 17.0, 24.0] {
        let (g, b) = (of(true, age), of(false, age));
        if show {
            println!("at {age}: a girl has {g:.2} of {name}, a boy {b:.2}");
        }
        assert!(g >= girl && b <= boy.max(0.45) && g >= b, "at {age} a girl has {g} of it (before {girl}) and a boy {b} (before {boy})");
        (girl, boy) = (g, b);
    }
    assert!(girl == 1.0 && boy == 0.0, "grown, a woman has {girl} of it and a man {boy}");
    // What the table takes of the target (its part under the cheekbones, `DressSet::lower_only`) moves nothing of
    // the skull and the lowest of the cheekbones' landmarks by 1.6 mm a side; whole, the target would widen the
    // skull and the cheekbones. Taken off a woman's head again (the target's part times its weight, vertex by
    // vertex), her breadth over the cheekbones is the same to a millimetre, over the ears the same, and the front
    // of her jaw 9 mm over the chin's lowest point 12 mm broader (broader than it was with the shifted gene).
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    assert!(set.lower_only.contains(&name) && set.rest.iter().any(|r| r.0 == name && r.1 == 1.0 && r.2 == 0.0));
    let (t, band) = (&h.targets[name], lower_band(&h));
    let out = |v: usize, taken: bool| {
        let d = t.ids.iter().position(|&i| i as usize == v).map_or(0.0, |j| t.d[j][0] as f32 / 30.0 * h.base[v][0].signum());
        if taken { d * lower_share(h.base[v][1], band) } else { d }
    };
    let far = |marks: &[(usize, usize)], taken: bool| marks.iter().map(|&(a, b)| out(a, taken).abs().max(out(b, taken).abs())).fold(0.0, f32::max);
    let (skull, cheek, whole) = (far(&SKULL, true), far(&CHEEKBONES, true), [far(&SKULL, false), far(&CHEEKBONES, false)]);
    if show {
        println!("{name} at the landmarks, sideways a side: the skull {skull:.2} mm, the cheekbones {cheek:.2} mm; whole {whole:.1?} mm");
    }
    assert!(skull == 0.0 && cheek < 2.0, "the taken part moves the skull's landmarks by {skull} mm, the cheekbones' by {cheek}");
    assert!(whole[0] > 2.0 && whole[1] > 2.0, "whole, the target moves them by {whole:?} mm");
    let (at_cheek, at_skull) = (MEASURES.iter().position(|m| m.0.starts_with("breadth at the cheekbones")).unwrap(), MEASURES.iter().position(|m| m.0.starts_with("head breadth")).unwrap());
    let (mut most, mut front) = ([0.0f32; 2], [0.0f32; 2]);
    for k in (0..40).step_by(2) {
        let with = morph_test(&h, &person(k, true, [24.0, 35.0, 50.0][(k / 2) as usize % 3]));
        let mut without = with.clone();
        for (j, &i) in t.ids.iter().enumerate() {
            let share = lower_share(h.base[i as usize][1], band);
            for c in 0..3 {
                without[i as usize][c] -= t.d[j][c] as f32 / 3000.0 * share;
            }
        }
        let (a, b) = (face(&h, &with), face(&h, &without));
        most = [most[0].max((a[at_cheek] - b[at_cheek]).abs()), most[1].max((a[at_skull] - b[at_skull]).abs())];
        front = [front[0] + jaw_front(&h, &with, 9.0) / 20.0, front[1] + jaw_front(&h, &without, 9.0) / 20.0];
    }
    if show {
        println!("the target's part taken off 20 women: the breadth over the cheekbones changes by up to {:.2} mm, over the ears by {:.2}; the jaw's front 9 mm over the menton {:.1} mm with it, {:.1} without", most[0], most[1], front[0], front[1]);
    }
    assert!(most[0] < 1.0 && most[1] < 0.01, "the breadth over the cheekbones changes by {} mm, over the ears by {}", most[0], most[1]);
    assert!(front[1] - front[0] > 4.0, "the jaw's front 9 mm over the menton: {} mm with the target, {} without", front[0], front[1]);
}

#[test]
fn the_cheek_of_a_woman_of_england_keeps_its_breadth_to_the_mouth() {
    // Until round 97 a woman's cheek ran straight from the cheekbone to the chin: lean, under cheekbones that
    // stood out. As a picture shows the cheek turned away, its outline lay 13.3 mm inside its top at the mouth's
    // height (`far_at_mouth`, 200 grown women); on the reference's woman about 6 (one screenshot, a pixel
    // 1.4 mm). No target of MakeHuman's fills a cheek there and leaves cheekbones and jaw at the survey's. The
    // table's `cheek_fill` moves the skin between cheekbone and jaw out along its normal, 6 mm where the field
    // is whole (`CHEEK_FIELD`): 8.2 mm. The amount is by eye on that one face, PLACEHOLDER; the bounds here lie
    // between the two states.
    let Some(h) = head() else { return };
    let show = std::env::var("SHOW").is_ok();
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    assert!(set.cheek_fill[0] > 0.0 && set.cheek_fill[1] == 0.0, "the table fills cheeks by {:?} mm", set.cheek_fill);
    // The field: no landmark of the face is in it, nothing of the lips' red, nothing that faces the head's
    // middle (what lies inside the mouth); it is the same on both sides, lies where `CHEEK_FIELD` says and is
    // whole somewhere.
    let field = cheek_field(&h);
    let lip = real::column("real/skin_lip.txt", 0.0);
    let pairs = |p: &[(usize, usize)]| p.iter().flat_map(|&(a, b)| [a, b]).collect::<Vec<usize>>();
    let marks: Vec<usize> = [MENTON, SUBNASALE, SELLION, CHIN, TRAGION.0, TRAGION.1].into_iter().chain(STOMION).chain(LIP_TOP).chain(LIP_FOOT).chain(pairs(&JAW)).chain(pairs(&CHEEKBONES)).chain(pairs(&SKULL)).collect();
    for &v in &marks {
        assert!(field[v].0 == 0.0, "the landmark {v} goes {} of the cheek's way", field[v].0);
    }
    let (m, (ys, zs)) = (h.base[MENTON], CHEEK_FIELD);
    let (mut sides, mut most, mut red) = ([0.0f32; 2], (0.0f32, 0usize), 0.0f32);
    for (v, &(w, n)) in field.iter().enumerate() {
        if w == 0.0 {
            continue;
        }
        let b = h.base[v];
        let (y, z) = ((b[1] - m[1]) * 100.0, (b[2] - m[2]) * 100.0);
        assert!(y < ys[0] && y > ys[2] && z > zs[0] && z < zs[3], "vertex {v} in the field lies {y} mm over the chin and {z} mm before it");
        assert!(n[0] * b[0].signum() > 0.2, "vertex {v} in the field faces {n:?}");
        sides[(b[0] > 0.0) as usize] += w;
        red = red.max(w * lip[v]);
        if w > most.0 {
            most = (w, v);
        }
    }
    let at = h.base[most.1];
    if show {
        println!("the cheek's field: sums {sides:?} on the two sides, whole ({:.2}) {:.0} mm over the chin's lowest point, {:.0} mm behind it and {:.0} mm from the middle; the lips' red takes {red:.3} of it at most", most.0, (at[1] - m[1]) * 100.0, (m[2] - at[2]) * 100.0, at[0].abs() * 100.0);
    }
    assert!((sides[0] - sides[1]).abs() < 0.01 * sides[0] && most.0 > 0.95 && red < 0.05, "sums {sides:?}, at most {}, on the lips' red {red}", most.0);
    // Who has how much: a grown woman all, a grown man none, a small child of either sex a third of the women's.
    let of = |female: bool, age: f32| set.cheek_fill_of(female, person(0, female, age).grown());
    assert!(of(true, 24.0) == set.cheek_fill[0] && of(false, 24.0) == 0.0, "grown: a woman {} mm, a man {}", of(true, 24.0), of(false, 24.0));
    let (girl, boy) = (of(true, 2.0), of(false, 2.0));
    assert!(girl > 0.3 * set.cheek_fill[0] && girl < 0.45 * set.cheek_fill[0] && (girl - boy).abs() < 0.05 * girl, "at 2: a girl {girl} mm, a boy {boy}");
    assert!(of(true, 13.0) > girl && of(false, 13.0) < boy, "at 13: a girl {} mm, a boy {}", of(true, 13.0), of(false, 13.0));
    // On people. The outline at the mouth's height, and the same heads with the fill taken off again: the
    // breadths at the cheekbones and at the jaw's corners, the head's breadth and the lips' length are the
    // same, the far cheek has no more of a pad.
    let pos = |name: &str| MEASURES.iter().position(|m| m.0.starts_with(name)).unwrap();
    let same = [pos("breadth at the cheekbones"), pos("breadth at the jaw"), pos("head breadth"), pos("face length"), pos("nose breadth")];
    let lips_at = pos("lip length");
    let n = 60;
    let (mut sums, mut worst, mut lips_most) = ([0.0f32; 5], 0.0f32, 0.0f32);
    for k in 0..n {
        let p = person(2 * k, true, [24.0, 35.0, 50.0][k as usize % 3]);
        let with = morph_test(&h, &p);
        let mut without = with.clone();
        for (q, &(w, nrm)) in without.iter_mut().zip(&field) {
            for c in 0..3 {
                q[c] -= nrm[c] * w * set.cheek_fill[0] / 100.0;
            }
        }
        let (a, b) = (face(&h, &with), face(&h, &without));
        for &i in &same {
            worst = worst.max((a[i] - b[i]).abs());
        }
        lips_most = lips_most.max((a[lips_at] - b[lips_at]).abs());
        let (ca, cb) = (far_cheek(&h, &with, STAGE_TURN), far_cheek(&h, &without, STAGE_TURN));
        for (s, x) in sums.iter_mut().zip([far_at_mouth(&h, &with, STAGE_TURN), far_at_mouth(&h, &without, STAGE_TURN), ca[0], cb[0], ca[1]]) {
            *s += x / n as f32;
        }
    }
    let men = (0..n).map(|k| far_at_mouth(&h, &morph_test(&h, &person(2 * k + 1, false, [24.0, 35.0, 50.0][k as usize % 3])), STAGE_TURN)).sum::<f32>() / n as f32;
    if show {
        println!("{n} grown women: the far cheek's outline at the mouth's height {:.1} mm inside its top, {:.1} without the fill ({n} men {men:.1}); its pad {:.2} mm, {:.2} without; the dent under it {:.2} mm; breadths and lengths differ by {worst:.3} mm at most, the lips' length by {lips_most:.2}", sums[0], sums[1], sums[2], sums[3], sums[4]);
    }
    // (round 115: the drawn lower face runs in to the chin, `Style::jaw`, about as far as on the reference's woman
    // A of round 114; the woman traced in round 97 had about 6 mm. The fill still keeps 5 mm of the breadth.)
    assert!(sums[0] > 9.0 && sums[0] < 15.0 && sums[1] > sums[0] + 4.0, "the far cheek's outline at the mouth's height: {} mm inside its top, {} without the fill", sums[0], sums[1]);
    assert!(men > 11.0, "a man's far cheek lies {men} mm inside its top at the mouth's height");
    assert!(sums[2] < sums[3] + 0.2 && sums[4] < 1.0, "the pad {} mm ({} without the fill), the dent {}", sums[2], sums[3], sums[4]);
    assert!(worst < 0.01 && lips_most < 0.01, "the fill moves a breadth by {worst} mm, the lips' length by {lips_most}");
}

#[test]
fn the_neck_of_a_woman_of_england_is_as_thick_as_a_lean_womans() {
    // Until round 98 the smallest loop round a grown woman's neck was 290.5 mm and a man's 366.1: a woman's
    // 0.79 of a man's, where the survey has 0.835 (339.5 and 406.7 mm, on people heavier than ours) and lean
    // young people 0.886 (315.2 and 355.6; `NECK_LEAN`). The men's lies between the lean and the survey's; the
    // women's was thin by either. The table's `neck` gives a grown woman two of MakeHuman's targets, of which
    // a head takes the part under the jaw (`neck_share`): 314.3 mm.
    let Some(h) = head() else { return };
    let show = std::env::var("SHOW").is_ok();
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    assert!(!set.neck.is_empty() && set.neck.iter().all(|r| r.1 > 0.0 && r.2 == 0.0 && h.targets.contains_key(r.0)), "the table's neck: {:?}", set.neck);
    // The part taken: the landmarks at the jaw's corners, the cheekbones, the ears and the skull are not in
    // it, and no landmark of the face is moved by it (whole, the first target moves a jaw's corner by 2 mm);
    // of each target some vertices are taken whole and some not at all (what lies at the jaw).
    let pairs = |p: &[(usize, usize)]| p.iter().flat_map(|&(a, b)| [a, b]).collect::<Vec<usize>>();
    for v in [TRAGION.0, TRAGION.1].into_iter().chain(pairs(&JAW)).chain(pairs(&CHEEKBONES)).chain(pairs(&SKULL)) {
        assert!(neck_share(&h, v) == 0.0, "the landmark {v} takes {} of a target of the neck", neck_share(&h, v));
    }
    let marks: Vec<usize> = [MENTON, SUBNASALE, SELLION, CHIN, TRAGION.0, TRAGION.1].into_iter().chain(STOMION).chain(pairs(&JAW)).chain(pairs(&CHEEKBONES)).chain(pairs(&SKULL)).collect();
    let mut whole_moves = 0.0f32;
    for &(name, women, _) in set.neck {
        let t = &h.targets[name];
        for (j, &i) in t.ids.iter().enumerate() {
            if marks.contains(&(i as usize)) {
                let far = (t.d[j][0] as f32).hypot(t.d[j][1] as f32).hypot(t.d[j][2] as f32) / 30.0 * women;
                whole_moves = whole_moves.max(far);
                assert!(far * neck_share(&h, i as usize) == 0.0, "{name} moves the landmark {i} by {} mm", far * neck_share(&h, i as usize));
            }
        }
    }
    assert!(whole_moves > 0.5, "whole, the neck's targets move a landmark by {whole_moves} mm at most");
    for &(name, _, _) in set.neck {
        let t = &h.targets[name];
        let (whole, none) = (t.ids.iter().filter(|&&i| neck_share(&h, i as usize) == 1.0).count(), t.ids.iter().filter(|&&i| neck_share(&h, i as usize) == 0.0).count());
        if show {
            println!("{name}: {} vertices, {whole} taken whole, {none} not at all", t.ids.len());
        }
        assert!(whole * 3 > t.ids.len() && whole < t.ids.len(), "{name}: {whole} of {} vertices whole, {none} not at all", t.ids.len());
    }
    assert!(NECK_UNDER.2[0] < NECK_UNDER.2[1]);
    // Who has how much: the grown their sex's, a child what it has grown.
    let of = |female: bool, age: f32| set.neck_of(1.0, 0.0, female, person(0, female, age).grown());
    assert!(of(true, 24.0) == 1.0 && of(false, 24.0) == 0.0 && of(false, 8.0) == 0.0, "grown: a woman {}, a man {}; a boy of 8 {}", of(true, 24.0), of(false, 24.0), of(false, 8.0));
    assert!(of(true, 2.0) < 0.05 && of(true, 8.0) > 0.3 && of(true, 8.0) < 0.7 && of(true, 13.0) > 0.8, "a girl of 2 {}, of 8 {}, of 13 {}", of(true, 2.0), of(true, 8.0), of(true, 13.0));
    // On people: the loop with the table's neck and with it taken off again, and what else that moves.
    let pos = |name: &str| MEASURES.iter().position(|m| m.0.starts_with(name)).unwrap();
    let same = [pos("breadth at the cheekbones"), pos("breadth at the jaw"), pos("head breadth"), pos("head length"), pos("face length"), pos("lip length")];
    let n = 60;
    let (mut sums, mut worst, mut arc_most) = ([0.0f32; 5], 0.0f32, 0.0f32);
    for k in 0..n {
        let age = [24.0, 35.0, 50.0][k as usize % 3];
        let with = morph_test(&h, &person(2 * k, true, age));
        let mut without = with.clone();
        for &(name, women, _) in set.neck {
            let t = &h.targets[name];
            for (j, &i) in t.ids.iter().enumerate() {
                for c in 0..3 {
                    without[i as usize][c] -= t.d[j][c] as f32 / 3000.0 * women * neck_share(&h, i as usize);
                }
            }
        }
        let (a, b) = (face(&h, &with), face(&h, &without));
        for &i in &same {
            worst = worst.max((a[i] - b[i]).abs());
        }
        for (x, y) in arcs(&h, &with).iter().zip(arcs(&h, &without)) {
            arc_most = arc_most.max((x - y).abs());
        }
        let (na, nb, man) = (neck_at(&h, &with), neck_at(&h, &without), neck_at(&h, &morph_test(&h, &person(2 * k + 1, false, age))));
        for (s, x) in sums.iter_mut().zip([na[0], nb[0], man[0], na[2], nb[2]]) {
            *s += x / n as f32;
        }
    }
    if show {
        println!("{n} grown women: the neck's smallest loop {:.1} mm, {:.1} without the table's neck ({n} men {:.1}); it lies {:.1} mm over the chin's lowest point, {:.1} without; breadths and lengths differ by {worst:.3} mm at most, an arc from ear to ear by {arc_most:.3}", sums[0], sums[1], sums[2], sums[3], sums[4]);
    }
    let ([men, women], survey) = (NECK_LEAN, NECK[0]);
    // a woman's within a third of the lean women's standard deviation of their mean, and thin without
    assert!((sums[0] - women[0]).abs() < women[1] / 3.0 && sums[1] < women[0] - women[1], "a woman's neck {} mm round, {} without the table's (lean women {} ({}))", sums[0], sums[1], women[0], women[1]);
    // a man's between the lean men's and the survey's
    assert!(sums[2] > men[0] && sums[2] < survey.1[0], "a man's neck {} mm round (lean men {}, the survey {})", sums[2], men[0], survey.1[0]);
    // a woman's as a share of a man's between the survey's and the lean people's
    let share = sums[0] / sums[2];
    assert!(share > survey.2[0] / survey.1[0] && share < women[0] / men[0], "a woman's neck {share} of a man's (the survey {}, lean people {})", survey.2[0] / survey.1[0], women[0] / men[0]);
    // the thinnest place stays where it was (no waist over the part made thicker), and the face is as it was
    assert!((sums[3] - sums[4]).abs() < 4.0, "the thinnest place {} mm over the chin's lowest point, {} without", sums[3], sums[4]);
    assert!(worst < 0.01 && arc_most < 0.5, "the table's neck moves a breadth by {worst} mm, an arc from ear to ear by {arc_most}");
}

#[test]
fn a_boy_of_england_before_his_beard_has_the_skin_of_a_girl() {
    // (round 106) MakeHuman's image of a young man's skin has the shade of a shaven beard round mouth and jaw: a
    // boy of eight wore a man's stubble. Up to the dress table's `boy_skin` a boy wears the girls' image; from
    // there on, and without a dress table, the men's as before; a girl's and a woman's are what they were.
    let Some(h) = head() else { return };
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    assert!(set.boy_skin >= 12.0 && set.boy_skin <= 15.0, "a boy's skin up to {}", set.boy_skin);
    let image = |p: &Look| build(&h, p, 1).surfaces.iter().find_map(|s| s.tex.clone().filter(|t| t.contains("/skin_"))).expect("the skin");
    for k in 0..4 {
        for (age, wants) in [(2.0, "skin_young_female"), (8.0, "skin_young_female"), (13.0, "skin_young_female"), (14.0, "skin_young_male"), (24.0, "skin_young_male"), (60.0, "skin_old_male")] {
            let mut p = person(k, false, age);
            assert!(image(&p).contains(wants), "boy {k} of {age}: {}", image(&p));
            p.dress = sc_portrait::dress::Dress::Roman;
            assert!(image(&p).contains("_male"), "a Roman boy {k} of {age}: {}", image(&p));
        }
        for age in [8.0, 24.0] {
            assert!(image(&person(k, true, age)).contains("skin_young_female"));
        }
    }
}

#[test]
fn the_lips_of_england_lie_on_each_other_from_corner_to_corner() {
    // MakeHuman's closed mouth is a slit from corner to corner (1.0 mm at its widest on the base head), and the
    // targets of a face open it beside the middle, where closing the middle does not reach: until round 99 the
    // lips' edges of a grown person stood 1.9 to 2.1 mm apart at the widest place (a child's 1.2 to 1.5), and
    // the strip that closes the slit lay in the light as a pale line across the whole mouth. The table's
    // `seam_shut` lays the lips on each other (morph.rs `lips_meet`): every point of either edge comes to lie
    // on the middle between the two; what is left (0.4 mm at the most) is what the straight pieces between the
    // points of the one edge miss of the other's bends.
    let Some(h) = head() else { return };
    let show = std::env::var("SHOW").is_ok();
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    assert!(set.seam_shut == 1.0, "the table's seam_shut: {}", set.seam_shut);
    assert!(seam(&h, &h.base) > 0.8 && seam(&h, &h.base) < 1.2, "the base head's slit: {} mm", seam(&h, &h.base));
    // The field: each lip's edge goes its whole way (the upper lip's down, the lower lip's up), every other
    // landmark of the face none, the borders of the lips' red among them; the field is a few hundred vertices
    // round the mouth and the same on both sides.
    let field = seam_field(&h);
    for side in &LIP_SEAM {
        assert!(side.0.iter().all(|&v| field[v].0 == 1.0) && side.1.iter().all(|&v| field[v].0 == -1.0), "the lips' edges go their whole way");
        assert!(field[side.0[0]].1 == 0.0 && field[side.0[side.0.len() - 1]].1 == 1.0, "from the middle to the corner");
    }
    let edges: Vec<usize> = marks().into_iter().filter(|(name, _)| name.contains("lip's edge") || name.contains("mouth's corner")).map(|m| m.1).collect();
    assert!(edges.len() == 4, "the landmarks on the lips' edges: {edges:?}");
    for (name, v) in marks() {
        assert!(edges.contains(&v) || field[v].0 == 0.0, "the landmark {name} goes {} of the lips' way", field[v].0);
    }
    for v in LIP_TOP.into_iter().chain(LIP_FOOT).chain([MENTON, SUBNASALE]) {
        assert!(field[v].0 == 0.0, "the landmark {v} goes {} of the lips' way", field[v].0);
    }
    let taking = field.iter().filter(|f| f.0 != 0.0).count();
    let (left, right) = ((0..h.base.len()).filter(|&v| field[v].0 != 0.0 && h.base[v][0] > 1e-4).count(), (0..h.base.len()).filter(|&v| field[v].0 != 0.0 && h.base[v][0] < -1e-4).count());
    if show {
        println!("the field: {taking} vertices, {left} left of the middle and {right} right of it; reach {SEAM_REACH} mm");
    }
    assert!(taking > 200 && taking < 400 && left == right, "{taking} vertices, {left} and {right}");
    // On people of every age: the slit with and without, and what else moves.
    let pos = |name: &str| MEASURES.iter().position(|m| m.0.starts_with(name)).unwrap();
    let (mut most, mut least_without, mut way, mut n) = (0.0f32, f32::MAX, 0.0f32, 0);
    for k in 0..48u32 {
        let (female, age) = (k % 2 == 0, [2.0, 5.0, 8.0, 13.0, 17.0, 24.0, 35.0, 50.0, 68.0][(k / 2) as usize % 9]);
        let p = person(k, female, age);
        let (with, without) = (morph_test(&h, &p), morph_test_seam(&h, &p, 0.0));
        let (a, b) = (seam(&h, &with), seam(&h, &without));
        most = most.max(a);
        least_without = least_without.min(b);
        assert!(a < 0.5, "{} of {age} ({k}): the lips' edges {a} mm apart at the most", if female { "a woman" } else { "a man" });
        // (round 112: lips differ more from person to person; the narrowest slit of a child is 0.99 mm, a girl's of two)
        assert!(b > if age >= 17.0 { 1.6 } else { 0.9 }, "{} of {age} ({k}): without the table's value the slit is {b} mm", if female { "a woman" } else { "a man" });
        // only heights change, by no more than the slit; the middle between the lips keeps its height
        for v in 0..with.len() {
            assert!(with[v][0] == without[v][0] && with[v][2] == without[v][2], "{k}: the vertex {v} moves sideways or in depth");
            way = way.max((with[v][1] - without[v][1]).abs() * 100.0);
            assert!((with[v][1] - without[v][1]).abs() * 100.0 <= b / 2.0 + 0.01 && (field[v].0 != 0.0 || with[v][1] == without[v][1]), "{k}: the vertex {v} moves {} mm", (with[v][1] - without[v][1]) * 100.0);
        }
        let line = |pp: &[[f32; 3]]| (pp[STOMION[0]][1] + pp[STOMION[1]][1]) / 2.0;
        assert!((line(&with) - line(&without)).abs() < 1e-5, "{k}: the line between the lips moves");
        // and every measure of the face and of the lips' red stays
        let (fa, fb) = (face(&h, &with), face(&h, &without));
        for m in 0..MEASURES.len() {
            assert!((fa[m] - fb[m]).abs() < 0.01, "{k}: {} {} with, {} without", MEASURES[m].0, fa[m], fb[m]);
        }
        let (la, lb) = (lips(&with), lips(&without));
        for m in 0..LIPS.len() {
            assert!((la[m] - lb[m]).abs() < 0.01, "{k}: {} {} with, {} without", LIPS[m].0, la[m], lb[m]);
        }
        assert!(fa[pos("lip length")] > 30.0);
        n += 1;
    }
    if show {
        println!("{n} people: the lips' edges at most {most:.2} mm apart, without the table's value at least {least_without:.2}; a vertex moves {way:.2} mm at the most");
    }
}

#[test]
fn a_child_of_england_has_a_braincase_as_large_against_its_face_as_a_real_childs() {
    // MakeHuman's child and baby are a grown head made small, the braincase with the face. A real child's
    // braincase is nearly grown when its face is not: at two the head's circumference is 0.88 to 0.90 of a
    // grown one's and its length 0.89 to 0.92, the breadth at the cheekbones 0.78 to 0.82 (the survey of
    // measure.rs `CHILDREN`). Until round 100 the faces of England's children had the survey's breadth and
    // their braincases were far too small: at two the circumference 432 and 415 mm where the survey has 502
    // and 487 (4.3 and 4.8 of its standard deviations under it), at eight still 2.0 and 3.6 under. A grown face
    // on a small head, in the picture's frame a large face: a child read as a small adult. The table's `skull`
    // makes the braincase larger by age and sex (morph.rs `skull_grow`), so that its breadth, its length and its
    // height over the ears stand to the grown of England as the survey's children stand to its grown; the
    // circumference, which the table was not fitted to, then does too. The face, the ears and the neck stay.
    let Some(h) = head() else { return };
    // (All of this on the face as it is measured: the grown are drawn on top of it since round 107,
    // `DressSet::style`, and a child's share of the grown is the survey's against the measured grown.)
    let morph_test = |h: &Head, p: &Look| morph_test_measured(h, p);
    let morph_test_skull = |h: &Head, p: &Look, by: [f32; 3]| morph_test_measured_as(h, p, None, Some(by), None, None);
    let morph_test_wide = |h: &Head, p: &Look, wide: f32| morph_test_measured_as(h, p, None, None, Some(wide), None);
    let morph_test_nose = |h: &Head, p: &Look, by: f32| morph_test_measured_as(h, p, None, None, None, Some(by));
    let _ = (&morph_test_skull, &morph_test_wide, &morph_test_nose);
    let show = std::env::var("SHOW").is_ok();
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    // The table: ages rising, each factor from 1 to 1.25 and no larger than at the age before, ones in its last
    // row; and ones for everyone whose head has its adult form (a girl's at 15, a boy's at 17).
    assert!(set.skull.len() >= 2 && set.skull.windows(2).all(|w| w[0].0 < w[1].0), "the table's ages rise");
    for w in set.skull.windows(2) {
        for (a, b) in [(w[0].1, w[1].1), (w[0].2, w[1].2)] {
            assert!((0..3).all(|k| (1.0..=1.25).contains(&a[k]) && b[k] <= a[k] && b[k] >= 1.0), "{} to {}: {a:?} and {b:?}", w[0].0, w[1].0);
        }
    }
    let last = set.skull.last().unwrap();
    assert!(last.1 == [1.0; 3] && last.2 == [1.0; 3] && last.0 <= set.adult[0].min(set.adult[1]), "the table ends in ones at {}", last.0);
    for (female, age) in [(true, 15.0), (true, 24.0), (false, 17.0), (false, 68.0)] {
        assert!(set.skull_of(female, age) == [1.0; 3], "{age}: {:?}", set.skull_of(female, age));
    }
    assert!(set.skull_of(true, 0.0) == set.skull[0].1 && set.skull_of(false, 1.0) == set.skull[0].2, "before the first age that age's");
    let between = set.skull_of(true, (set.skull[0].0 + set.skull[1].0) / 2.0);
    assert!((0..3).all(|k| (between[k] - (set.skull[0].1[k] + set.skull[1].1[k]) / 2.0).abs() < 1e-6), "between two ages in a straight line: {between:?}");
    // The field: nothing of the face, of the eyes, of the ears, of the neck; all of the crown and of the back
    // of the head; the same left and right.
    let field = skull_field(&h);
    let b = &h.base;
    for (name, v) in marks() {
        assert!(field[v] == 0.0, "the landmark {name} is {} of the braincase", field[v]);
    }
    let pairs = CHEEKBONES.into_iter().chain(JAW).chain([TRAGION]);
    for v in [SELLION, SUBNASALE, MENTON, GLABELLA, CHIN, sc_portrait::measure::FOREHEAD].into_iter().chain(pairs.flat_map(|p| [p.0, p.1])) {
        assert!(field[v] == 0.0, "the landmark {v} is {} of the braincase", field[v]);
    }
    for part in ["leye", "reye"] {
        assert!(h.parts[part][0].iter().all(|&v| field[v as usize] == 0.0), "an eye is of the braincase");
    }
    let t = b[TRAGION.0];
    let (mut ears, mut neck) = (0, 0);
    let mut skin = vec![false; b.len()];
    h.body_full().iter().for_each(|&v| skin[v as usize] = true);
    for v in 0..b.len() {
        // the ear: the skin that stands out from the head beside tragion, up to the ear's upper rim (the old
        // cap of hair, which England's heads do not wear, lies out there too and is no ear)
        if skin[v] && b[v][0].abs() > t[0] + 0.025 && b[v][1] < t[1] + EAR_RIM && b[v][1] > t[1] - 0.5 {
            ears += 1;
            assert!(field[v] == 0.0, "the ear's vertex {v} is {} of the braincase", field[v]);
        }
        if b[v][1] < b[MENTON][1] {
            neck += 1;
            assert!(field[v] == 0.0, "the vertex {v} under the chin is {} of the braincase", field[v]);
        }
    }
    assert!(ears > 200 && neck > 1000, "{ears} vertices of the ears, {neck} under the chin");
    let top = h.body_full().iter().map(|&v| v as usize).max_by(|&i, &j| b[i][1].total_cmp(&b[j][1])).unwrap();
    assert!(field[top] == 1.0 && field[BACK[2]] == 1.0 && field[BACK[3]] == 1.0, "the crown {} and the back of the head {} {}", field[top], field[BACK[2]], field[BACK[3]]);
    // up the skull's side over the ear (the seven places of the head's breadth, from just over the ear to 4 cm
    // higher): a third of it at the lowest, rising without a step back, all of it from the fifth on
    let side: Vec<f32> = SKULL.iter().map(|p| field[p.0]).collect();
    assert!(SKULL.iter().all(|p| field[p.0] == field[p.1]), "left as right");
    assert!(side[0] > 0.2 && side[0] < 0.45 && side[4..].iter().all(|f| *f == 1.0) && side.windows(2).all(|w| w[0] <= w[1]), "up the skull's side: {side:?}");
    let taking = field.iter().filter(|f| **f > 0.0).count();
    if show {
        println!("the field: {taking} of {} vertices, {} in full; up the skull's side {side:?}", field.len(), field.iter().filter(|f| **f == 1.0).count());
    }
    assert!(taking > 400 && taking < 600, "{taking} vertices of the braincase");
    // On children: what moves and what stays, and the measures beside the survey's.
    let n = 20u32;
    let grown: Vec<[f32; 11]> = [false, true].iter().map(|&female| mean((0..n).map(|k| children(&h, &morph_test(&h, &person(k, female, 24.0)))))).collect();
    // how far the head reaches behind the ears (from tragion's depth to the rearmost skin over it), in mm
    let behind = |pp: &[[f32; 3]]| {
        let (ty, tz) = ((pp[TRAGION.0][1] + pp[TRAGION.1][1]) / 2.0, (pp[TRAGION.0][2] + pp[TRAGION.1][2]) / 2.0);
        (tz - h.body_full().iter().map(|&v| pp[v as usize]).filter(|q| q[1] > ty).fold(f32::MAX, |z, q| z.min(q[2]))) * 100.0
    };
    let grown_behind: Vec<f32> = [false, true].iter().map(|&female| (0..n).map(|k| behind(&morph_test(&h, &person(k, female, 24.0)))).sum::<f32>() / n as f32).collect();
    // The survey's depth from the ear to sellion, boys and girls together, by its sixteen groups of age (cm):
    // the face before the ear grows as the face does. Its head length less this depth is, roughly, the head
    // behind the ear: 95 mm at two, 91 on the oldest. The braincase behind the ear is grown at two.
    const EAR_TO_SELLION: [f32; 16] = [8.0, 8.4, 8.6, 8.8, 8.8, 8.9, 9.0, 9.3, 9.5, 9.4, 9.6, 9.8, 9.9, 10.0, 9.9, 10.2];
    let survey_behind = |age: f32| {
        let j = CHILD_AGES.iter().position(|a| *a > age + 0.5).unwrap_or(16).clamp(1, 15);
        let f = ((age + 0.5 - CHILD_AGES[j - 1]) / (CHILD_AGES[j] - CHILD_AGES[j - 1])).clamp(0.0, 1.0);
        (children_at(2, false, age)[0] + children_at(2, true, age)[0]) / 2.0 - 10.0 * (EAR_TO_SELLION[j - 1] + f * (EAR_TO_SELLION[j] - EAR_TO_SELLION[j - 1]))
    };
    let (mut stretch, mut squeeze, mut way) = (1.0f32, 1.0f32, 0.0f32);
    for age in [2.0f32, 5.0, 8.0, 11.0] {
        for female in [false, true] {
            let who = format!("{} of {age}", if female { "girls" } else { "boys" });
            let (mut with_all, mut without_all) = (Vec::new(), Vec::new());
            let (mut back_with, mut back_without) = (0.0f32, 0.0f32);
            for k in 0..n {
                let p = person(k, female, age);
                let (with, without) = (morph_test(&h, &p), morph_test_skull(&h, &p, [1.0; 3]));
                // what is not of the braincase stays where it is; what is moves outwards, upwards, and no
                // further than the crown does
                for v in 0..with.len() {
                    if field[v] == 0.0 {
                        assert!(with[v] == without[v], "{who} ({k}): the vertex {v} moves");
                    } else {
                        // (a vertex at the field's floor that lies under the ear's height moves down with its
                        // share of next to nothing: a ten-thousandth of a millimetre is let pass)
                        assert!(with[v][0].abs() >= without[v][0].abs() && with[v][1] >= without[v][1] - 1e-6, "{who} ({k}): the vertex {v} moves inwards or down");
                        way = way.max(dist(&with[v], &without[v]));
                    }
                }
                // the skin is stretched evenly: no edge of it much longer or shorter than before
                if k < 4 {
                    for tri in h.body_full().chunks_exact(3) {
                        for e in 0..3 {
                            let (i, j) = (tri[e] as usize, tri[(e + 1) % 3] as usize);
                            let (before, after) = (dist(&without[i], &without[j]), dist(&with[i], &with[j]));
                            if before > 0.005 {
                                stretch = stretch.max(after / before);
                                squeeze = squeeze.min(after / before);
                            }
                        }
                    }
                }
                // every measure of the face stays (the head's breadth and length, the last two, do not)
                let (fa, fb) = (face(&h, &with), face(&h, &without));
                for m in 0..MEASURES.len() - 2 {
                    assert!(fa[m] == fb[m], "{who} ({k}): {} {} with, {} without", MEASURES[m].0, fa[m], fb[m]);
                }
                // (a boy's breadth is the grown share from eleven on: there the table leaves it)
                let broader = if set.skull_of(female, age)[0] > 1.0 { fa[13] > fb[13] + 2.0 } else { fa[13] == fb[13] };
                assert!(broader && fa[14] > fb[14] + 2.0, "{who} ({k}): the head {} by {} mm, without {} by {}", fa[13], fa[14], fb[13], fb[14]);
                assert!(lips(&with) == lips(&without), "{who} ({k}): the lips' red");
                with_all.push(children(&h, &with));
                without_all.push(children(&h, &without));
                back_with += behind(&with) / n as f32;
                back_without += behind(&without) / n as f32;
            }
            // a check the table was not fitted to: the head behind the ear stands to the grown's as the survey's
            // does (which has it as long at two as on the grown), and without the table it was a child's face's
            // share of it
            let (ours, before, real) = (back_with / grown_behind[female as usize], back_without / grown_behind[female as usize], survey_behind(age) / survey_behind(18.0));
            if show {
                println!("{who}: behind the ear {back_with:.1} mm, of the grown {ours:.3} (without {back_without:.1}, {before:.3}), the survey {real:.3}");
            }
            assert!((ours - real).abs() < 0.08, "{who}: behind the ear {ours} of the grown, the survey {real}");
            assert!(age > 8.0 || real - before > 0.15, "{who}: behind the ear without the table {before} of the grown, the survey {real}");
            let (with, without) = (mean(with_all.into_iter()), mean(without_all.into_iter()));
            // the face's and the neck's measures are what they were
            for m in 5..11 {
                assert!((with[m] - without[m]).abs() < 0.01, "{who}: {} {} with, {} without", CHILDREN[m].name, with[m], without[m]);
            }
            // the braincase stands to the grown of England as the survey's children stand to its oldest
            // (circumference, breadth, length, tragion to the top of the head: the table was fitted to the last
            // three on 60 children of each sex, to 0.1 in 100)
            for m in [0, 1, 2, 4] {
                let (survey, oldest) = (children_at(m, female, age), children_at(m, female, 18.0));
                let (ours, before, real) = (with[m] / grown[female as usize][m], without[m] / grown[female as usize][m], survey[0] / oldest[0]);
                if show {
                    println!("{who}: {:<32} {:6.1} mm ({:+.1} SD; without {:6.1}, {:+.1}), of the grown {ours:.3} (without {before:.3}), the survey {real:.3}", CHILDREN[m].name, with[m], (with[m] - survey[0]) / survey[1], without[m], (without[m] - survey[0]) / survey[1]);
                }
                assert!((ours - real).abs() < 0.015, "{who}: {} {ours} of the grown, the survey {real}", CHILDREN[m].name);
                assert!(((with[m] - survey[0]) / survey[1]).abs() < 1.0, "{who}: {} {} mm, the survey {} ({})", CHILDREN[m].name, with[m], survey[0], survey[1]);
                // and without the table it did not: by 0.07 and more at two and five, by 0.03 and more after
                // (the breadth of boys from eight on was near: 0.02 at eight, 0.02 over at eleven)
                if m != 1 || age < 8.0 || female {
                    assert!(real - before > if age < 8.0 { 0.07 } else if age < 11.0 { 0.03 } else { 0.01 }, "{who}: {} without the table {before} of the grown, the survey {real}", CHILDREN[m].name);
                }
            }
            // the head's circumference without the table, in the survey's standard deviations
            let s = children_at(0, female, age);
            assert!(age > 8.0 || (without[0] - s[0]) / s[1] < -1.8, "{who}: without the table the circumference is {} mm, the survey {} ({})", without[0], s[0], s[1]);
        }
    }
    if show {
        println!("a vertex moves {:.1} mm at the most; an edge of the skin grows to {stretch:.3} of its length at the most and shrinks to {squeeze:.3}", way * 100.0);
    }
    // (The band in which the braincase grows away from what stays, over the ears and round the back of the
    // head, is drawn out: the head behind the ear is a quarter longer than without the table and the ear stays
    // where it is. An edge of it comes to twice its length on girls of two, the largest of all.)
    assert!(way * 100.0 < 35.0 && stretch < 2.1 && squeeze > 0.9, "{} mm, {stretch}, {squeeze}", way * 100.0);
    // The grown, and the young whose head has its adult form, are what they were, to the bit.
    for (k, female, age) in [(0u32, true, 24.0f32), (1, false, 24.0), (2, true, 15.0), (3, false, 13.0), (4, true, 68.0), (5, false, 50.0)] {
        let p = person(k, female, age);
        assert!(morph_test(&h, &p) == morph_test_skull(&h, &p, [1.0; 3]), "a person of {age} ({k}) has another head");
    }
}

#[test]
fn a_child_of_england_has_a_mouth_as_broad_against_a_grown_ones_as_a_real_childs() {
    // MakeHuman's child has a narrow mouth, and since round 55 the table's `child` made every child's wider by
    // one weight, chosen by eye against a pout (`mouth-scale-horiz-incr` 0.45). Held against the survey of
    // children's heads (measure.rs `CHILDREN`) that was too much for the small and too little for a girl of
    // eleven: the mouth of a child of two was 37.0 and 35.7 mm broad where the survey has 33 (0.74 and 0.77
    // of England's grown, the survey's children 0.69 and 0.72 of its oldest group), a flat stroke across a small
    // face. The table's `child_mouth` has the weight by age and sex, fitted so that the mouth's breadth stands
    // to the grown of England as the survey's children's stands to its oldest group's.
    let Some(h) = head() else { return };
    // (All of this on the face as it is measured: the grown are drawn on top of it since round 107,
    // `DressSet::style`, and a child's share of the grown is the survey's against the measured grown.)
    let morph_test = |h: &Head, p: &Look| morph_test_measured(h, p);
    let morph_test_skull = |h: &Head, p: &Look, by: [f32; 3]| morph_test_measured_as(h, p, None, Some(by), None, None);
    let morph_test_wide = |h: &Head, p: &Look, wide: f32| morph_test_measured_as(h, p, None, None, Some(wide), None);
    let morph_test_nose = |h: &Head, p: &Look, by: f32| morph_test_measured_as(h, p, None, None, None, Some(by));
    let _ = (&morph_test_skull, &morph_test_wide, &morph_test_nose);
    let show = std::env::var("SHOW").is_ok();
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    // The table: ages rising, weights of a target (under 1), nothing in its last row; nothing for the grown.
    assert!(set.child_mouth.len() >= 2 && set.child_mouth.windows(2).all(|w| w[0].0 < w[1].0), "the table's ages rise");
    assert!(set.child_mouth.iter().all(|row| row.1[0].abs() <= 1.0 && row.2[0].abs() <= 1.0), "weights of a target");
    let last = set.child_mouth.last().unwrap();
    assert!(last.1 == [0.0] && last.2 == [0.0] && last.0 <= set.adult[0].min(set.adult[1]), "the table ends in nothing at {}", last.0);
    for (female, age) in [(true, 15.0), (true, 24.0), (false, 17.0), (false, 68.0)] {
        assert!(set.child_mouth_of(female, age) == 0.0, "{age}: {}", set.child_mouth_of(female, age));
    }
    assert!(set.child_mouth_of(true, 0.0) == set.child_mouth[0].1[0] && set.child_mouth_of(false, 1.0) == set.child_mouth[0].2[0], "before the first age that age's");
    let between = set.child_mouth_of(false, (set.child_mouth[0].0 + set.child_mouth[1].0) / 2.0);
    assert!((between - (set.child_mouth[0].2[0] + set.child_mouth[1].2[0]) / 2.0).abs() < 1e-6, "between two ages in a straight line: {between}");
    assert!(!set.child.iter().any(|row| row.0.contains("mouth-scale-horiz")), "the one weight for every child is gone");
    let n = 20u32;
    let grown: Vec<[f32; 11]> = [false, true].iter().map(|&female| mean((0..n).map(|k| children(&h, &morph_test(&h, &person(k, female, 24.0)))))).collect();
    for age in [2.0f32, 5.0, 8.0, 11.0, 13.0] {
        for female in [false, true] {
            let who = format!("{} of {age}", if female { "girls" } else { "boys" });
            // what round 55 gave a child of this age: 0.45, fading as the head gets its adult form
            let was = 0.45 * sc_portrait::dress::child_share(set.adult[if female { 0 } else { 1 }], age);
            let (mut with_all, mut none_all, mut was_all) = (Vec::new(), Vec::new(), Vec::new());
            for k in 0..n {
                let p = person(k, female, age);
                let (with, none) = (morph_test(&h, &p), morph_test_wide(&h, &p, 0.0));
                // the nose, the chin, the cheekbones, the jaw and the ears stay where they are
                for v in [SELLION, SUBNASALE, MENTON, GLABELLA].into_iter().chain(CHEEKBONES.into_iter().chain(JAW).chain([TRAGION]).flat_map(|q| [q.0, q.1])) {
                    assert!(with[v] == none[v], "{who} ({k}): the landmark {v} moves");
                }
                with_all.push(children(&h, &with));
                none_all.push(children(&h, &none));
                was_all.push(children(&h, &morph_test_wide(&h, &p, was)));
            }
            let (with, none, was_so) = (mean(with_all.into_iter()), mean(none_all.into_iter()), mean(was_all.into_iter()));
            // every other measure of the survey's is what it is without the table
            for m in (0..11).filter(|m| *m != 9) {
                assert!((with[m] - none[m]).abs() < 0.01, "{who}: {} {} with, {} without", CHILDREN[m].name, with[m], none[m]);
            }
            let (survey, oldest) = (children_at(9, female, age), children_at(9, female, 18.0));
            let g = grown[female as usize][9];
            let (ours, bare, before, real) = (with[9] / g, none[9] / g, was_so[9] / g, survey[0] / oldest[0]);
            if show {
                println!("{who}: the mouth {:.1} mm broad ({:+.1} SD), of the grown {ours:.3}; MakeHuman's {:.1}, {bare:.3}; round 55's {:.1} ({:+.1} SD), {before:.3}; the survey {:.1}, {real:.3}", with[9], (with[9] - survey[0]) / survey[1], none[9], was_so[9], (was_so[9] - survey[0]) / survey[1], survey[0]);
            }
            assert!((ours - real).abs() < 0.008, "{who}: the mouth {ours} of the grown's, the survey {real}");
            assert!(((with[9] - survey[0]) / survey[1]).abs() < 0.6, "{who}: the mouth {} mm, the survey {} ({})", with[9], survey[0], survey[1]);
            // the one weight of round 55 was too much for the small
            // (0.014 on girls of five since round 105: a child's leaner cheek, `child`, draws the mouth's corners
            // in by 0.1 mm)
            assert!(age > 5.0 || before - real > if female { 0.012 } else { 0.03 }, "{who}: with round 55's weight {before} of the grown's, the survey {real}");
            // and MakeHuman's own child's mouth is narrow at every age
            assert!(real - bare > 0.008, "{who}: without the table {bare} of the grown's, the survey {real}");
        }
    }
    // The grown, and the young whose head has its adult form, are what they were, to the bit.
    for (k, female, age) in [(0u32, true, 24.0f32), (1, false, 24.0), (2, true, 15.0), (3, false, 17.0), (4, true, 68.0), (5, false, 50.0)] {
        let p = person(k, female, age);
        assert!(morph_test(&h, &p) == morph_test_wide(&h, &p, 0.0), "a person of {age} ({k}) has another head");
    }
}

#[test]
fn a_child_of_england_has_a_nose_as_long_against_a_grown_ones_as_a_real_childs() {
    // MakeHuman's child has a grown face's proportions: at two a boy's nose was 34.9 mm long from sellion to its
    // foot and a girl's 32.9, where the survey of children's heads (measure.rs `CHILDREN`) has 29 (2.0 and 1.3
    // of its standard deviations over; 0.67 of England's grown, the survey's children 0.56 and 0.62 of its
    // oldest group), a boy's still 1.1 over at five and eight. MakeHuman's target for a shorter nose folds it
    // (round 101). The table's `child_nose` has a factor on the nose's length by age and sex, and morph.rs
    // `nose_set` moves heights only: the face's front between the lower lids and the nose's foot is shortened
    // evenly, and what the nose loses the skin between its foot and the chin gains, the lips' red left as high
    // as it is, the chin where it is.
    let Some(h) = head() else { return };
    // (All of this on the face as it is measured: the grown are drawn on top of it since round 107,
    // `DressSet::style`, and a child's share of the grown is the survey's against the measured grown.)
    let morph_test = |h: &Head, p: &Look| morph_test_measured(h, p);
    let morph_test_skull = |h: &Head, p: &Look, by: [f32; 3]| morph_test_measured_as(h, p, None, Some(by), None, None);
    let morph_test_wide = |h: &Head, p: &Look, wide: f32| morph_test_measured_as(h, p, None, None, Some(wide), None);
    let morph_test_nose = |h: &Head, p: &Look, by: f32| morph_test_measured_as(h, p, None, None, None, Some(by));
    let _ = (&morph_test_skull, &morph_test_wide, &morph_test_nose);
    let show = std::env::var("SHOW").is_ok();
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    // The table: ages rising, factors that shorten a nose and by no more than a fifth, ones in its last row; ones
    // for the grown.
    assert!(set.child_nose.len() >= 2 && set.child_nose.windows(2).all(|w| w[0].0 < w[1].0), "the table's ages rise");
    assert!(set.child_nose.iter().all(|row| [row.1[0], row.2[0]].iter().all(|f| *f > 0.8 && *f <= 1.0)), "factors that shorten a nose");
    let last = set.child_nose.last().unwrap();
    assert!(last.1 == [1.0] && last.2 == [1.0] && last.0 <= set.adult[0].min(set.adult[1]), "the table ends in ones at {}", last.0);
    for (female, age) in [(true, 15.0), (true, 24.0), (false, 17.0), (false, 68.0)] {
        assert!(set.child_nose_of(female, age) == 1.0, "{age}: {}", set.child_nose_of(female, age));
    }
    assert!(set.child_nose_of(true, 0.0) == set.child_nose[0].1[0] && set.child_nose_of(false, 1.0) == set.child_nose[0].2[0], "before the first age that age's");
    let between = set.child_nose_of(false, (set.child_nose[0].0 + set.child_nose[1].0) / 2.0);
    assert!((between - (set.child_nose[0].2[0] + set.child_nose[1].2[0]) / 2.0).abs() < 1e-6, "between two ages in a straight line: {between}");
    // The field: all of the nose, the mouth and the chin; nothing of the ears and of the eyeballs; the same left
    // and right.
    let field = face_front(&h);
    for v in [SELLION, SUBNASALE, MENTON, GLABELLA].into_iter().chain(STOMION).chain(LIP_TOP).chain(LIP_FOOT) {
        assert!(field[v] == 1.0, "the landmark {v} is {} of the face's front", field[v]);
    }
    assert!(field[TRAGION.0] == 0.0 && field[TRAGION.1] == 0.0, "the ears are none of it");
    let balls: Vec<usize> = ["leye", "reye"].iter().flat_map(|part| h.parts[*part][0].iter().map(|v| *v as usize)).collect();
    assert!(balls.len() > 100 && balls.iter().all(|&v| field[v] == 0.0), "the eyeballs are none of it");
    for (a, b) in CHEEKBONES.into_iter().chain(JAW) {
        assert!((field[a] - field[b]).abs() < 1e-4, "{a} and {b}: {} left, {} right", field[a], field[b]);
    }
    let n = 20u32;
    let grown: Vec<[f32; 11]> = [false, true].iter().map(|&female| mean((0..n).map(|k| children(&h, &morph_test(&h, &person(k, female, 24.0)))))).collect();
    let (mut stretch, mut squeeze, mut way) = (1.0f32, 1.0f32, 0.0f32);
    for age in [2.0f32, 5.0, 8.0, 11.0, 13.0] {
        for female in [false, true] {
            let who = format!("{} of {age}", if female { "girls" } else { "boys" });
            let by = set.child_nose_of(female, age);
            let (mut with_all, mut none_all, mut red, mut lip) = (Vec::new(), Vec::new(), [0.0f32; 2], [0.0f32; 2]);
            for k in 0..n {
                let p = person(k, female, age);
                let (with, none) = (morph_test(&h, &p), morph_test_nose(&h, &p, 1.0));
                if by == 1.0 {
                    assert!(with == none, "{who} ({k}): a factor of 1 moves the head");
                }
                let (lid, foot, chin) = (none[LIDS[0].1][1].min(none[LIDS[1].1][1]), none[SUBNASALE][1], none[MENTON][1]);
                // heights only; nothing at and over the lower lids' edges, nothing under the chin, nothing that
                // is not of the face's front; what moves goes up, and nothing further than the nose's foot,
                // which goes up by what the nose is shorter
                let up = (1.0 - by) * (none[SELLION][1] - foot);
                for v in 0..with.len() {
                    assert!(with[v][0] == none[v][0] && with[v][2] == none[v][2], "{who} ({k}): the vertex {v} moves sideways or in depth");
                    let d = with[v][1] - none[v][1];
                    if field[v] == 0.0 || none[v][1] >= lid || none[v][1] < chin {
                        assert!(d == 0.0, "{who} ({k}): the vertex {v} moves by {d}");
                    }
                    assert!(d > -1e-5 && d < up + 1e-5, "{who} ({k}): the vertex {v} moves by {d}, the nose's foot by {up}");
                    way = way.max(d);
                }
                assert!((with[SUBNASALE][1] - foot - up).abs() < 1e-4, "{who} ({k}): the nose's foot goes up by {}, not {up}", with[SUBNASALE][1] - foot);
                assert!((with[MENTON][1] - chin).abs() < 1e-5, "{who} ({k}): the chin moves by {}", with[MENTON][1] - chin);
                for v in balls.iter().copied().chain(LIDS.into_iter().flat_map(|l| [l.0, l.1])).chain([TRAGION.0, TRAGION.1]) {
                    assert!(with[v] == none[v], "{who} ({k}): an eye or an ear moves at {v}");
                }
                // the skin is shortened and drawn out evenly: no edge of it much shorter or longer than before
                if k < 4 {
                    for tri in h.body_full().chunks_exact(3) {
                        for e in 0..3 {
                            let (i, j) = (tri[e] as usize, tri[(e + 1) % 3] as usize);
                            let (before, after) = (dist(&none[i], &none[j]), dist(&with[i], &with[j]));
                            if before > 0.005 {
                                stretch = stretch.max(after / before);
                                squeeze = squeeze.min(after / before);
                            }
                        }
                    }
                }
                // the lips' red is as high as it was, and the mouth lies between the nose's foot and the chin
                // where it lay (`DressSet::mouth_at`)
                let lean = sc_portrait::dress::by_sex(set.lean[0], set.lean[1], female, p.grown());
                for (j, pp) in [&none, &with].into_iter().enumerate() {
                    red[j] += lips(pp)[2] / n as f32;
                    let f = lower_face(pp, lean);
                    lip[j] += f[0] / f[2] / n as f32;
                }
                with_all.push(children(&h, &with));
                none_all.push(children(&h, &none));
            }
            let (with, none) = (mean(with_all.into_iter()), mean(none_all.into_iter()));
            // every other measure of the survey's is what it is without the table
            for m in (0..11).filter(|m| *m != 8) {
                assert!((with[m] - none[m]).abs() < 0.01, "{who}: {} {} with, {} without", CHILDREN[m].name, with[m], none[m]);
            }
            assert!((red[1] - red[0]).abs() < 0.2, "{who}: the lips' red {} mm high, {} without the table", red[1], red[0]);
            assert!((lip[1] - lip[0]).abs() < 0.02, "{who}: the upper lip {} of the way from the nose's foot to the chin, {} without the table", lip[1], lip[0]);
            let (survey, oldest) = (children_at(8, female, age), children_at(8, female, 18.0));
            let g = grown[female as usize][8];
            let (ours, bare, real) = (with[8] / g, none[8] / g, survey[0] / oldest[0]);
            if show {
                println!("{who}: the nose {:.1} mm long ({:+.1} SD), of the grown {ours:.3}; MakeHuman's {:.1} ({:+.1} SD), {bare:.3}; the survey {:.1}, {real:.3}; the lips' red {:.1} mm ({:.1}), the upper lip {:.3} of the way to the chin ({:.3})", with[8], (with[8] - survey[0]) / survey[1], none[8], (none[8] - survey[0]) / survey[1], survey[0], red[1], red[0], lip[1], lip[0]);
            }
            if by < 1.0 {
                // a nose that was too long stands to the grown as the survey's children's stands to its oldest
                // group's, and without the table it was longer than that
                assert!((ours - real).abs() < 0.012, "{who}: the nose {ours} of the grown's, the survey {real}");
                assert!(bare - real > 0.02, "{who}: without the table {bare} of the grown's, the survey {real}");
            } else {
                // a nose that is no longer than the survey's share is left as it is
                assert!(bare - real < 0.012, "{who}: the nose {bare} of the grown's, the survey {real}, and the table leaves it");
            }
            assert!(((with[8] - survey[0]) / survey[1]).abs() < 0.75, "{who}: the nose {} mm, the survey {} ({})", with[8], survey[0], survey[1]);
        }
    }
    if show {
        println!("a vertex moves up {:.1} mm at the most; an edge of the skin grows to {stretch:.3} of its length at the most and shrinks to {squeeze:.3}", way * 100.0);
    }
    assert!(way * 100.0 < 8.0 && stretch < 1.35 && squeeze > 0.7, "{} mm, {stretch}, {squeeze}", way * 100.0);
    // The grown, and the young whose head has its adult form, are what they were, to the bit.
    for (k, female, age) in [(0u32, true, 24.0f32), (1, false, 24.0), (2, true, 15.0), (3, false, 17.0), (4, true, 68.0), (5, false, 50.0)] {
        let p = person(k, female, age);
        assert!(morph_test(&h, &p) == morph_test_nose(&h, &p, 1.0), "a person of {age} ({k}) has another head");
    }
}

/// The mean of each of the eleven measures of a head (measure.rs `children`) over some heads.
fn mean(heads: impl Iterator<Item = [f32; 11]>) -> [f32; 11] {
    let all: Vec<[f32; 11]> = heads.collect();
    std::array::from_fn(|m| all.iter().map(|x| x[m]).sum::<f32>() / all.len() as f32)
}

#[test]
fn the_lids_of_england_stand_to_the_pupil_as_real_lids_do() {
    // In an eye that looks straight ahead the upper lid covers the upper 1 to 2 mm of the iris and the lower lid
    // just reaches its lower edge: the pupil stands a little above the middle of the opening (Stanford's
    // Neuro-ophthalmology Illustrated, chapter 1: margin reflex distance 4 to 5 mm, opening 9 to 12 mm). The
    // eye looks at the viewer whatever the bust's lean, and MakeHuman's lids do not follow it: until round 74 a
    // woman's upper lid stood 2.0 mm over her pupil (half the iris covered, the lower lid 0.5 mm under its edge),
    // and on a head held upright the white showed over the iris. Each ball is set so that the pupil stands at
    // `DressSet::pupil` of the opening: no white over an iris, hardly any under it, more of it covered above than
    // below.
    // Since round 107 that is the face as it is measured. The face as a portrait shows it is drawn with larger
    // eyes that are open wider (`DressSet::style`: the lids higher, the iris larger with the opening): its
    // pupil stands at the same share of the opening, and its lids cut its larger iris above and reach it below.
    let Some(h) = head() else { return };
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    let iris = set.iris_mm / 2.0;
    for k in 0..84 {
        let (female, age) = (k % 2 == 0, [2.0, 5.0, 8.0, 13.0, 17.0, 24.0, 35.0, 50.0, 68.0][(k / 2) as usize % 9]);
        let p = person(k, female, age);
        let lean = sc_portrait::dress::by_sex(set.lean[0], set.lean[1], female, p.grown());
        let [over, under] = sc_portrait::measure::lids_to_pupil(&h, &morph_test_measured(&h, &p), set.gaze_of(1.0, lean)[1]);
        let [drawn_over, drawn_under] = sc_portrait::measure::lids_to_pupil(&h, &morph_test(&h, &p), set.gaze_of(1.0, lean)[1]);
        let drawn_iris = set.iris_of(female, age) / 2.0;
        if std::env::var("SHOW").is_ok() {
            println!("{} of {age}: the upper lid {over:.1} mm over the pupil, the lower lid {under:.1} mm under it; drawn {drawn_over:.1} and {drawn_under:.1}, the iris {drawn_iris:.2} mm", if female { "woman" } else { "man" });
        }
        assert!(((under / (over + under)) - set.pupil).abs() < 0.01, "person {k}: {over} mm over, {under} mm under");
        // (an eye that is open wider than the iris is high shows a little white under it, as wide eyes do)
        assert!(over < iris - 0.5 && under < iris + 1.0 && over < under, "person {k}: {over} mm over, {under} mm under, the iris {iris} mm");
        assert!(((drawn_under / (drawn_over + drawn_under)) - set.pupil).abs() < 0.01, "person {k}, drawn: {drawn_over} mm over, {drawn_under} mm under");
        assert!(drawn_over < drawn_iris - 0.5 && drawn_under < drawn_iris + 1.0 && drawn_over < drawn_under, "person {k}, drawn: {drawn_over} mm over, {drawn_under} mm under, the iris {drawn_iris} mm");
        // a child's eyes are its own (the tables of `eyes_child`); the grown's are open wider than they are measured
        if age <= 11.0 {
            assert!(drawn_over == over && drawn_under == under && drawn_iris == iris, "person {k} of {age} has other eyes drawn");
        } else if age >= 17.0 {
            assert!(drawn_over + drawn_under > over + under + 0.5 && drawn_iris == set.style.iris_mm / 2.0, "person {k} of {age}: the opening {} mm, measured {}", drawn_over + drawn_under, over + under);
        }
    }
}

/// Round 115: the drawn lower face runs in to the chin (`Style::jaw`, morph.rs `jaw_narrow`). Its field leaves the
/// cheekbones, the ears and the face's middle (nose, the lips' middle, the chin's front) where they are; a grown
/// woman's outline is narrower at the mouth and under it than at the eyes by what the sheets read, and a small
/// child's head has none of it.
#[test]
fn the_drawn_lower_face_runs_in_to_the_chin() {
    let Some(h) = head() else { return };
    let field = sc_portrait::jaw_field(&h);
    for &(a, b) in &CHEEKBONES {
        // (the band begins at the lowest of them on the base head: under a hundredth, a tenth of a millimetre)
        assert!(field[a] < 0.01 && field[b] < 0.01, "the field moves a cheekbone's landmark: {} {}", field[a], field[b]);
    }
    assert!(field[TRAGION.0] < 1e-6 && field[TRAGION.1] < 1e-6, "the field moves an ear");
    // (round 117) the jaw's sides come in, not the cheeks' front and not the chin's own end (`chin_round` has that)
    assert!(field[MENTON] < 1e-6, "the field at the chin's lowest point: {}", field[MENTON]);
    assert!(field[JAW[0].0] > 0.4 && field[JAW[0].1] > 0.4, "the field at the jaw's corners: {} {}", field[JAW[0].0], field[JAW[0].1]);
    // across the face at the mouth's height, 15 mm in front of the jaw's corners and further forward (as
    // examples/outline.rs reads the picture, here straight from in front)
    let across = |pp: &[[f32; 3]], y: f32| {
        let back = JAW.iter().map(|&(a, b)| pp[a][2] + pp[b][2]).sum::<f32>() / (2 * JAW.len()) as f32 + 0.15;
        let (mut lo, mut hi) = (f32::MAX, f32::MIN);
        for t in h.body_full().chunks_exact(3) {
            for k in 0..3 {
                let (p, q) = (pp[t[k] as usize], pp[t[(k + 1) % 3] as usize]);
                if (p[1] - y) * (q[1] - y) < 0.0 {
                    let f = (y - p[1]) / (q[1] - p[1]);
                    if p[2] + f * (q[2] - p[2]) > back {
                        let x = p[0] + f * (q[0] - p[0]);
                        lo = lo.min(x);
                        hi = hi.max(x);
                    }
                }
            }
        }
        (hi - lo) * 100.0
    };
    let n = 40;
    let (mut drawn, mut plain, mut lips_moved, mut nose_moved) = (0.0f32, 0.0f32, 0.0f32, 0.0f32);
    for k in 0..n {
        let p = person(2 * k, true, [24.0, 35.0, 50.0][k as usize % 3]);
        let with = morph_test(&h, &p);
        // the same head with the narrowing taken off again
        let k_jaw = p.dress.set().unwrap().style_jaw_of(true, p.grown(), p.age);
        assert!(k_jaw > 0.0, "a grown woman of England has no narrowing");
        let side = sc_portrait::JAW_NARROW.2;
        let mut without = with.clone();
        for (v, q) in without.iter_mut().enumerate() {
            let t = ((h.base[v][0].abs() - side[0]) / (side[1] - side[0])).clamp(0.0, 1.0);
            q[0] /= 1.0 - k_jaw * field[v] * t * t * (3.0 - 2.0 * t);
        }
        let mouth = |pp: &[[f32; 3]]| (pp[STOMION[0]][1] + pp[STOMION[1]][1]) / 2.0;
        drawn += across(&with, mouth(&with)) / n as f32;
        plain += across(&without, mouth(&without)) / n as f32;
        let (a, b) = (face(&h, &with), face(&h, &without));
        let pos = |name: &str| MEASURES.iter().position(|m| m.0.starts_with(name)).unwrap();
        lips_moved = lips_moved.max((a[pos("lip length")] - b[pos("lip length")]).abs());
        nose_moved = nose_moved.max((a[pos("nose breadth")] - b[pos("nose breadth")]).abs());
    }
    if std::env::var("SHOW").is_ok() {
        println!("{n} grown women: across the face at the mouth {drawn:.1} mm, {plain:.1} without the narrowing; the lips' length moves by {lips_moved:.2} mm, the nose's breadth by {nose_moved:.2}");
    }
    assert!(drawn < plain - 8.0 && drawn > plain - 22.0, "across the face at the mouth: {drawn} mm, {plain} without the narrowing");
    assert!(lips_moved < 1.5 && nose_moved < 0.01, "the narrowing moves the lips' length by {lips_moved} mm, the nose's breadth by {nose_moved}");
    let child = person(1, true, 5.0);
    assert!(child.dress.set().unwrap().style_jaw_of(true, child.grown(), child.age) == 0.0, "a child of five has the narrowing");
}

/// Round 117: the chin's end is drawn in to a round and the jaw's lower edge soft (`Style::chin`, `Style::edge`;
/// morph.rs `chin_round`, `jaw_soften`). Their fields leave the mouth, the nose, the cheekbones and the ears where
/// they are, and the chin's middle its place; on a grown woman's measured head the skin along the jaw's edge
/// bends less from facet to facet after them, the lips keep their length, and a small child's head has the soft
/// edge alone (the fold is the mesh's, at every age).
#[test]
fn the_drawn_chin_is_round_and_the_jaws_edge_soft() {
    let Some(h) = head() else { return };
    let (chin, edge) = (sc_portrait::chin_field(&h), sc_portrait::jaw_edge_field(&h));
    for v in CHEEKBONES.iter().flat_map(|&(a, b)| [a, b]).chain([TRAGION.0, TRAGION.1, STOMION[0], STOMION[1], LIP_TOP[0], LIP_TOP[1]]) {
        assert!(chin[v] < 1e-6 && edge[v] < 1e-6, "a field moves the landmark {v}: {} {}", chin[v], edge[v]);
    }
    assert!(chin[MENTON] < 1e-6, "the chin's middle is drawn aside: {}", chin[MENTON]);
    assert!(edge[MENTON] > 0.9, "the edge's field at the chin's lowest point: {}", edge[MENTON]);
    // (which stays all the same: the face's length and the mouth's place are measured from it)
    let p = person(0, true, 24.0);
    let (plain, mut soft) = (morph_test_measured(&h, &p), morph_test_measured(&h, &p));
    sc_portrait::jaw_soften(&h, &mut soft, 0.5);
    assert!(soft[MENTON] == plain[MENTON] && soft != plain, "the soft edge moves the chin's lowest point, or nothing");
    // how far the skin bends from facet to facet along the jaw's edge: the mean angle between the normals of
    // two triangles that share an edge whose ends take more than half of the field, in degrees
    let fold = |pp: &[[f32; 3]]| {
        let normal = |t: &[u32]| {
            let (a, b, c) = (pp[t[0] as usize], pp[t[1] as usize], pp[t[2] as usize]);
            let (u, v) = ([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
            let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
            let l = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt().max(1e-12);
            [n[0] / l, n[1] / l, n[2] / l]
        };
        let mut sides: std::collections::HashMap<(u32, u32), Vec<[f32; 3]>> = std::collections::HashMap::new();
        for t in h.body_full().chunks_exact(3) {
            if t.iter().all(|&v| (v as usize) < edge.len() && edge[v as usize] > 0.5) {
                for k in 0..3 {
                    let (a, b) = (t[k].min(t[(k + 1) % 3]), t[k].max(t[(k + 1) % 3]));
                    sides.entry((a, b)).or_default().push(normal(t));
                }
            }
        }
        let angles: Vec<f32> = sides.values().filter(|n| n.len() == 2).map(|n| (n[0][0] * n[1][0] + n[0][1] * n[1][1] + n[0][2] * n[1][2]).clamp(-1.0, 1.0).acos().to_degrees()).collect();
        (angles.iter().sum::<f32>() / angles.len() as f32, angles.iter().cloned().fold(0.0f32, f32::max))
    };
    let n = 40;
    let (mut before, mut after, mut sharpest, mut lips_moved, mut nose_moved) = ([0.0f32; 2], [0.0f32; 2], 0.0f32, 0.0f32, 0.0f32);
    for k in 0..n {
        let p = person(2 * k, true, [24.0, 35.0, 50.0][k as usize % 3]);
        let set = p.dress.set().unwrap();
        let (k_chin, k_edge) = (set.style_chin_of(true, p.grown(), p.age), set.style_edge_of(true, p.grown()));
        assert!(k_chin > 0.0 && k_edge > 0.0, "a grown woman of England has no round chin or no soft edge");
        let plain = morph_test_measured(&h, &p);
        let mut with = plain.clone();
        sc_portrait::chin_round(&h, &mut with, k_chin);
        sc_portrait::jaw_soften(&h, &mut with, k_edge);
        let (a, b) = (fold(&plain), fold(&with));
        before = [before[0] + a.0 / n as f32, before[1] + a.1 / n as f32];
        after = [after[0] + b.0 / n as f32, after[1] + b.1 / n as f32];
        sharpest = sharpest.max(b.1);
        let (a, b) = (face(&h, &with), face(&h, &plain));
        let pos = |name: &str| MEASURES.iter().position(|m| m.0.starts_with(name)).unwrap();
        lips_moved = lips_moved.max((a[pos("lip length")] - b[pos("lip length")]).abs());
        nose_moved = nose_moved.max((a[pos("nose breadth")] - b[pos("nose breadth")]).abs());
    }
    if std::env::var("SHOW").is_ok() {
        println!("{n} grown women, the skin along the jaw's edge bends from facet to facet by {:.1} degrees in the mean and {:.1} at the sharpest fold; drawn {:.1} and {:.1} (the sharpest of all {sharpest:.1}); the lips' length moves by {lips_moved:.3} mm, the nose's breadth by {nose_moved:.3}", before[0], before[1], after[0], after[1]);
    }
    assert!(after[0] < 0.8 * before[0] && after[1] < 0.7 * before[1], "the jaw's edge bends by {:?} degrees (mean, sharpest), drawn by {:?}", before, after);
    assert!(lips_moved < 0.01 && nose_moved < 0.01, "the round chin and the soft edge move the lips' length by {lips_moved} mm, the nose's breadth by {nose_moved}");
    let child = person(1, true, 5.0);
    let set = child.dress.set().unwrap();
    assert!(set.style_chin_of(true, child.grown(), child.age) == 0.0 && set.style_edge_of(true, child.grown()) > 0.0, "a child of five has the round chin or no soft edge");
}
