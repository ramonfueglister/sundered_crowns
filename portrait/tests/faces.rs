//! The faces of England's dress table held against measured heads: a survey of real ones (src/measure.rs) and the
//! place of a young woman's brows. These tests use the real look, which is set once for the whole program: they
//! stand in a file of their own so that the library's tests keep Apoleia's faceted look.

mod common;

use common::{head, person};
use sc_portrait::measure::{face, far_cheek, lips, marks, LIPS, MEASURES, MENTON, SELLION, STAGE_TURN};
use sc_portrait::{build, morph_test, real, Head, Look, LODS};

#[test]
fn the_grown_of_england_have_faces_of_human_measure() {
    // Until round 69 the women's faces were as long as the men's and broader (face length 0.99 of the men's where
    // the survey's women have 0.92, the cheekbones 152 mm across, two and a half standard deviations over the
    // survey's women), and the men's were short: a woman read as a man. Now every measure the survey has lies
    // within half a standard deviation of its mean for either sex.
    let Some(h) = head() else { return };
    let mut sums = [vec![0.0; MEASURES.len()], vec![0.0; MEASURES.len()]];
    let n = 150;
    for k in 0..2 * n {
        let female = k % 2 == 0;
        let m = face(&h, &morph_test(&h, &person(k, female, [24.0, 35.0, 50.0][(k / 2) as usize % 3])));
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
fn a_woman_of_england_wears_her_brows_higher_and_narrower_than_makehuman_draws_them() {
    // MakeHuman's brow lies on the rim of the eye's socket, its upper edge 17 mm above the line through the eyes'
    // inner corners over the pupil; a young woman's lies at 19.8 mm (Matros, Garcia & Yaremchuk 2009). Low and
    // broad over the eye it made the women read as men, and as glowering (until round 69).
    let Some(h) = head() else { return };
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
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
        assert!(side < 1.0 && moved.iter().all(|(d, _)| d[1] > 0.0), "woman {k}: sideways by {side} mm");
        // the band is narrower: its upper corners go up less than its lower ones, by the band's own breadth
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
        for (q, c) in scar.pos.iter().zip(&scar.col) {
            let near = (0..idx.len()).min_by(|&a, &b| dist(q, &skin.pos[a]).total_cmp(&dist(q, &skin.pos[b]))).unwrap();
            assert!(dist(q, &skin.pos[near]) < 0.2, "person {k}: a corner {} off the skin", dist(q, &skin.pos[near]));
            // against the skin beside it: as light at its edges, lighter along its middle, nowhere dark
            let against = grey(c) / grey(&skin.col[near]);
            dark = dark.min(against);
            light = light.max(against);
        }
        if std::env::var("SHOW").is_ok() {
            println!("person {k}: {} corners, {dark:.2} to {light:.2} of the skin's lightness beside them", scar.pos.len());
        }
        assert!(dark > 0.8 && light > 1.1 && light < 1.6, "person {k}: {dark} to {light} of the skin's lightness");
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
fn the_lids_of_england_stand_to_the_pupil_as_real_lids_do() {
    // In an eye that looks straight ahead the upper lid covers the upper 1 to 2 mm of the iris and the lower lid
    // just reaches its lower edge: the pupil stands a little above the middle of the opening (Stanford's
    // Neuro-ophthalmology Illustrated, chapter 1: margin reflex distance 4 to 5 mm, opening 9 to 12 mm). The
    // eye looks at the viewer whatever the bust's lean, and MakeHuman's lids do not follow it: until round 74 a
    // woman's upper lid stood 2.0 mm over her pupil (half the iris covered, the lower lid 0.5 mm under its edge),
    // and on a head held upright the white showed over the iris. Each ball is set so that the pupil stands at
    // `DressSet::pupil` of the opening: no white over an iris, hardly any under it, more of it covered above than
    // below.
    let Some(h) = head() else { return };
    let set = sc_portrait::dress::Dress::England1356.set().unwrap();
    let iris = set.iris_mm / 2.0;
    for k in 0..84 {
        let (female, age) = (k % 2 == 0, [2.0, 5.0, 8.0, 13.0, 17.0, 24.0, 35.0, 50.0, 68.0][(k / 2) as usize % 9]);
        let p = person(k, female, age);
        let lean = sc_portrait::dress::by_sex(set.lean[0], set.lean[1], female, p.grown());
        let [over, under] = sc_portrait::measure::lids_to_pupil(&h, &morph_test(&h, &p), set.gaze_of(1.0, lean)[1]);
        if std::env::var("SHOW").is_ok() {
            println!("{} of {age}: the upper lid {over:.1} mm over the pupil, the lower lid {under:.1} mm under it", if female { "woman" } else { "man" });
        }
        assert!(((under / (over + under)) - set.pupil).abs() < 0.01, "person {k}: {over} mm over, {under} mm under");
        // (an eye that is open wider than the iris is high shows a little white under it, as wide eyes do)
        assert!(over < iris - 0.5 && under < iris + 1.0 && over < under, "person {k}: {over} mm over, {under} mm under, the iris {iris} mm");
    }
}
