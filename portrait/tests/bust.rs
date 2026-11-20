//! The bust under the shoulders (round 124): the body's data below the old cut, the gown that hangs on it down to
//! below the picture's foot, the cloth over the gown lifted off it and a woman's bust held by her gown (the real
//! look: a file of its own, see tests/common).

mod common;

use common::{head, person};
use sc_portrait::dress::ENGLAND_1356;
use sc_portrait::layers::{lift, sink, tuck, GAP, PASS, REACH, THROUGH, UNDER};
use sc_portrait::pose::{hold_bust, BUST_SIDE, FRONT, FRONT_TOP};
use sc_portrait::{build, Mat, Surface};

type V3 = [f32; 3];

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

fn dist(a: V3, b: V3) -> f32 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
}

/// How close the stage of England stands (src/portrait/profile.ts `close`), and how far under the picture's top
/// its foot lies, in heights of the picture (src/portrait/stage.ts `framing`: the middle 0.36 under the top).
const CLOSE: f32 = 0.85;
const FOOT: f32 = 0.86;

#[test]
fn the_head_file_carries_the_body_down_to_the_waist() {
    // Until round 124 the body's data ended at the upper arms and under the collar bones (the cut of
    // tools/portrait/pipeline: above 34 cm of the base's height, within 28.5 cm of the middle), and a gown had
    // nothing to hang on below it. The file now carries the trunk to under the waist and the arms to the elbows
    // (`extend_head.py`), as a part of its own that is not drawn: it carries cloth.
    let Some(h) = head() else { return };
    let bust = h.parts.get("bust").expect("the part of the bust");
    let body = h.body_full();
    let low = |ids: &[u32]| ids.iter().map(|&v| h.base[v as usize][1]).fold(f32::MAX, f32::min);
    let (skin, under) = (low(body), low(&bust[0]));
    let new: std::collections::HashSet<u32> = bust[0].iter().copied().filter(|v| !body.contains(v)).collect();
    // (the targets that move a vertex of the bust alone: the body's weight, age, sex and breasts reach it)
    let moving = h.targets.values().filter(|t| t.ids.iter().any(|&v| new.contains(&(v as u32)))).count();
    if show() {
        println!("{} vertices; the skin ends at {skin:.2}, the bust at {under:.2}; {} vertices of the bust alone, {moving} of {} targets move them", h.n, new.len(), h.targets.len());
    }
    assert!(skin > 3.4, "the skin that is drawn ends where it did, {skin}");
    assert!(under < 1.9 && under > 1.5, "the bust ends under the waist, {under}");
    assert!(new.len() > 700, "{} vertices of the bust alone", new.len());
    assert!(moving > 80, "{moving} targets move the bust");
    // the front middle line, which holds a woman's bust (src/pose.rs): of the file, from over the breasts down
    assert!(FRONT.iter().all(|&v| v < h.n) && FRONT_TOP < h.n, "the front middle line is of the file");
    assert!(FRONT.windows(2).all(|w| h.base[w[0]][1] > h.base[w[1]][1]), "the front middle line runs downward");
    assert!(FRONT.iter().all(|&v| h.base[v][0].abs() < 0.02), "the front middle line lies in the middle");
    assert!(h.base[FRONT_TOP][1] > h.base[FRONT[0]][1] + 0.3, "the hold begins over the breasts");
}

#[test]
fn the_gown_hangs_to_below_the_pictures_foot_and_its_sleeves_go_with_the_arms() {
    // Until round 124 the figure ended in ragged sleeves at the upper arm, and the picture stood so close that
    // its foot lay above them. Now the gown hangs on the bust down to under the waist, in one piece with what was
    // there (`bust_bind.py`), and the picture is a bust: its foot lies on the gown, with cloth to either side.
    // The arms come down from the base's spread pose (src/morph.rs), and the sleeves with them: bound to the
    // flank in part, they were torn into flags from the arm to the hip.
    let Some(h) = head() else { return };
    let (mut least, mut longest, mut widest) = (f32::MAX, 0f32, 0f32);
    for k in 0..40u32 {
        let age = [3.0, 8.0, 13.0, 17.0, 24.0, 35.0, 50.0, 70.0][k as usize % 8];
        let p = person(k, k % 2 == 0, age);
        let out = build(&h, &p, 1);
        let gown = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("/cloth_cote."))).unwrap_or_else(|| panic!("person {k}: no gown"));
        let hv = (out.top - out.chin).max(0.8) / (out.fill * CLOSE);
        let foot = out.top - FOOT * hv;
        // below the picture's foot: in the middle, and at the picture's sides (0.4 of its height either way: the
        // panel is four wide for five high) or as far out as the figure goes
        let lowest = |from: f32, to: f32| gown.pos.iter().filter(|q| (q[0] - out.cx).abs() >= from && (q[0] - out.cx).abs() < to).map(|q| q[1]).fold(f32::MAX, f32::min);
        let side = gown.pos.iter().filter(|q| q[1] < foot + 0.3).map(|q| (q[0] - out.cx).abs()).fold(0f32, f32::max);
        let (middle, outer) = (lowest(0.0, 1.0), lowest(0.7 * side.min(0.4 * hv), side.min(0.4 * hv)));
        least = least.min(foot - middle).min(foot - outer);
        assert!(middle < foot - 0.3, "person {k} of {age}: the gown ends {} over the picture's foot in the middle", middle - foot);
        assert!(outer < foot - 0.3, "person {k} of {age}: the gown ends {} over the picture's foot at the side", outer - foot);
        // no triangle of it torn: the longest edge of the gown, and how far out it reaches
        for t in gown.pos.chunks_exact(3) {
            longest = longest.max(dist(t[0], t[1])).max(dist(t[1], t[2])).max(dist(t[2], t[0]));
        }
        widest = widest.max(gown.pos.iter().map(|q| (q[0] - out.cx).abs()).fold(0f32, f32::max));
    }
    if show() {
        println!("the gown ends at least {least:.2} under the picture's foot; its longest edge {longest:.2}; it reaches {widest:.2} from the middle");
    }
    // (the longest are under the arm, where the old gown is sewn to the piece below it: 8 cm. A flag of a sleeve
    // bound to the flank reached from the arm to the hip, and the fan of a seam sewn across the arm was 12 cm long)
    assert!(longest < 1.0, "an edge of the gown {longest} long: torn");
    // (the spread arms of the base: the sleeve's end 3.6 from the middle)
    assert!(widest < 3.0, "the gown reaches {widest} from the middle: a sleeve stands off the arm");
}

/// A square of cloth of side 1 at depth `z` that faces `way` along z, in two triangles, with one corner at `at`.
fn square(z: f32, way: f32) -> Surface {
    let mut s = Surface::new(Mat { rough: 1.0, metal: 0.0, double: false });
    let c: [V3; 4] = [[0.0, 0.0, z], [1.0, 0.0, z], [1.0, 1.0, z], [0.0, 1.0, z]];
    let order = if way > 0.0 { [0, 1, 2, 0, 2, 3] } else { [0, 2, 1, 0, 3, 2] };
    for i in order {
        s.pos.push(c[i]);
        s.nrm.push([0.0, 0.0, way]);
    }
    s
}

#[test]
fn cloth_over_the_gown_is_lifted_off_it() {
    // A veil's fall, a hood's cape and a wimple are each bound to the body on their own, and where a fold of the
    // gown stood further off the body than they, the gown came through them in specks and patches. They are set
    // a least distance outside the gown itself (src/layers.rs): here on a flat gown that faces +z at depth 0.
    let gown = square(0.0, 1.0);
    let places = |z: f32, way: f32, y: f32| {
        let mut s = Surface::new(Mat { rough: 1.0, metal: 0.0, double: true });
        s.pos = vec![[0.3, y, z], [0.6, y, z], [0.5, y + 0.2, z]];
        s.nrm = vec![[0.0, 0.0, way]; 3];
        s
    };
    // close outside the gown, and inside it: set to the gap
    for z in [0.02, -0.05, GAP - 0.01] {
        let mut over = places(z, 1.0, 0.3);
        assert_eq!(lift(&mut over, &gown, 2.0, GAP, REACH), 3, "at {z}");
        assert!(over.pos.iter().all(|q| (q[2] - GAP).abs() < 1e-5), "at {z}: lifted to {:?}", over.pos);
        assert!(over.pos.iter().zip(&places(z, 1.0, 0.3).pos).all(|(a, b)| a[0] == b[0] && a[1] == b[1]), "at {z}: along its own direction");
    }
    // far enough outside, beyond the reach either way, beside the gown, above the height, and where the cloth
    // faces against the gown (a fold's back, the rolled hem of a neck): left as it is
    for (z, way, y, below, what) in [(GAP + 0.01, 1.0, 0.3, 2.0, "outside the gap"), (REACH + 0.05, 1.0, 0.3, 2.0, "beyond the reach"), (-REACH - 0.05, 1.0, 0.3, 2.0, "beyond the reach inside"), (0.02, 1.0, 1.3, 2.0, "beside the gown"), (0.02, 1.0, 0.3, 0.2, "above the height"), (0.02, -1.0, 0.3, 2.0, "facing against")] {
        let mut over = places(z, way, y);
        assert_eq!(lift(&mut over, &gown, below, GAP, REACH), 0, "{what}");
        assert_eq!(over.pos, places(z, way, y).pos, "{what}");
    }
    // a gown that faces the other way at the same place (the inside of a fold) does not count
    let mut over = places(0.02, 1.0, 0.3);
    assert_eq!(lift(&mut over, &square(0.0, -1.0), 2.0, GAP, REACH), 0, "a gown facing against");
    // (round 139) nor does what the corner's line meets behind a place where it went in through the gown's
    // outside: the corner is not under that (a hem's corner looks along the cloth, in over the shoulder and out
    // at its back, and was lifted 2.6 cm). Without the layer it goes in through, it is under it and is lifted
    let behind = square(0.1, 1.0);
    let mut both = square(0.05, -1.0);
    both.pos.extend(&behind.pos);
    both.nrm.extend(&behind.nrm);
    let mut over = places(0.0, 1.0, 0.3);
    assert_eq!(lift(&mut over, &both, 2.0, GAP, REACH), 0, "behind where the line went in");
    let mut over = places(0.0, 1.0, 0.3);
    assert_eq!(lift(&mut over, &behind, 2.0, GAP, REACH), 3, "under a layer");
    assert!(over.pos.iter().all(|q| (q[2] - 0.1 - GAP).abs() < 1e-5), "under a layer: lifted to {:?}", over.pos);
    // (round 139) a corner beside the lifted ones goes part of the way with them, and the corners at one place
    // stay together: lifted each for itself, a lone corner stood out of a veil's fall as a crack. Here a second
    // triangle on the first one's edge, its third corner beside the gown
    let mut over = places(0.02, 1.0, 0.3);
    let beside: V3 = [1.3, 0.4, 0.02];
    over.pos.extend([over.pos[1], over.pos[2], beside]);
    over.nrm.extend([[0.0, 0.0, 1.0]; 3]);
    assert_eq!(lift(&mut over, &gown, 2.0, GAP, REACH), 5, "two triangles");
    assert!(over.pos[..5].iter().all(|q| (q[2] - GAP).abs() < 1e-5), "two triangles: lifted to {:?}", over.pos);
    assert!(over.pos[3] == over.pos[1] && over.pos[4] == over.pos[2], "the corners at one place stay together");
    assert!(over.pos[5][2] > 0.02 && over.pos[5][2] < GAP && over.pos[5][0] == beside[0] && over.pos[5][1] == beside[1], "the corner beside went along to {:?}", over.pos[5]);
}

#[test]
fn a_rolled_hem_goes_under_the_cloth_with_its_edge() {
    // (round 139) `sink` moves a corner against its own direction where that leads under the other cloth. Of a
    // rolled hem only the corners that face that cloth do; the roll's side faces along it and stayed, torn off
    // its edge: a row of slits where a wimple's hem lay under a veil. `tuck` takes it along. Here under a flat
    // cloth that faces +z at depth 0: a triangle that stands through it, and on its edge one of a roll's side,
    // which faces +x.
    let over = square(0.0, 1.0);
    let hem = || {
        let mut s = Surface::new(Mat { rough: 1.0, metal: 0.0, double: true });
        s.pos = vec![[0.3, 0.3, 0.03], [0.6, 0.3, 0.03], [0.5, 0.5, 0.03], [0.6, 0.3, 0.03], [0.5, 0.5, 0.03], [0.62, 0.42, 0.03]];
        s.nrm = vec![[0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [1.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 0.0, 0.0]];
        s
    };
    // sunk each corner for itself, the roll's side stays where it was
    let mut s = hem();
    assert_eq!(sink(&mut s, &over, 2.0, UNDER, THROUGH), 3);
    assert_eq!(s.pos[3..], hem().pos[3..], "sink leaves the roll's side");
    // tucked, the corners at one place stay together and the roll's own corner goes under the cloth with them
    let mut s = hem();
    assert_eq!(tuck(&mut s, &over, 2.0, UNDER, THROUGH, PASS), 3);
    assert!(s.pos[..3].iter().all(|q| (q[2] + UNDER).abs() < 1e-5), "sunk to {:?}", s.pos);
    assert!(s.pos[3] == s.pos[1] && s.pos[4] == s.pos[2], "the corners at one place stay together: {:?}", s.pos);
    assert!(s.pos[5][2] < 0.0 && s.pos[5][2] >= -UNDER - 1e-5, "the roll's corner went under the cloth: {:?}", s.pos[5]);
    // nothing through the cloth: nothing moved
    let mut s = hem();
    s.pos.iter_mut().for_each(|q| q[2] = -0.2);
    assert_eq!(tuck(&mut s, &over, 2.0, UNDER, THROUGH, PASS), 0);
    assert!(s.pos.iter().all(|q| q[2] == -0.2));
}

#[test]
fn what_of_the_gown_still_came_through_is_sunk_under_the_cloth_over_it() {
    // `lift` moves the corners of the cloth over the gown; a fold of the gown that stands up between three of
    // them came through all the same (round 137: specks of the gown's colour on a hood's cape). Such a place of
    // the gown is set a little inside the cloth over it (src/layers.rs `sink`): here under a flat cloth that
    // faces +z at depth 0.
    let over = square(0.0, 1.0);
    let places = |z: f32, way: f32, y: f32| {
        let mut s = Surface::new(Mat { rough: 1.0, metal: 0.0, double: true });
        s.pos = vec![[0.3, y, z], [0.6, y, z], [0.5, y + 0.2, z]];
        s.nrm = vec![[0.0, 0.0, way]; 3];
        s
    };
    // through the cloth, and close inside it: set to the gap inside
    for z in [0.03, THROUGH - 0.01, -0.01] {
        let mut gown = places(z, 1.0, 0.3);
        assert_eq!(sink(&mut gown, &over, 2.0, UNDER, THROUGH), 3, "at {z}");
        assert!(gown.pos.iter().all(|q| (q[2] + UNDER).abs() < 1e-5), "at {z}: sunk to {:?}", gown.pos);
        assert!(gown.pos.iter().zip(&places(z, 1.0, 0.3).pos).all(|(a, b)| a[0] == b[0] && a[1] == b[1]), "at {z}: against its own direction");
    }
    // far enough inside, further through than counts, beside the cloth, above the height, and where the gown
    // faces against the cloth: left as it is
    for (z, way, y, below, what) in [(-UNDER - 0.01, 1.0, 0.3, 2.0, "inside the gap"), (THROUGH + 0.05, 1.0, 0.3, 2.0, "too far through"), (0.03, 1.0, 1.3, 2.0, "beside the cloth"), (0.03, 1.0, 0.3, 0.2, "above the height"), (0.03, -1.0, 0.3, 2.0, "facing against")] {
        let mut gown = places(z, way, y);
        assert_eq!(sink(&mut gown, &over, below, UNDER, THROUGH), 0, "{what}");
        assert_eq!(gown.pos, places(z, way, y).pos, "{what}");
    }
}

#[test]
fn nothing_of_the_gown_comes_through_the_cloth_over_it() {
    // On 120 people of 15 to 68 as the builder stands them: under a hood's cape, a veil's fall and a wimple no
    // corner of the gown stands outside that cloth (counted below the frame's chin, as the builder lifts and
    // sinks there; a corner that is further through than `THROUGH` is not one of that place's layers).
    let Some(h) = head() else { return };
    let d = &ENGLAND_1356;
    let (mut through, mut worn, mut under) = (0, 0, 0);
    let mut worst = (0, 0u32);
    let mut spent = 0f32;
    for k in 0..120u32 {
        let p = person(k, k % 2 == 0, [15.0, 24.0, 35.0, 50.0, 58.0, 68.0][(k / 2) as usize % 6]);
        let out = build(&h, &p, 1);
        let Some(gown) = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(d.gown))) else { panic!("person {k}: no gown") };
        for over in out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| [d.veil, d.veil_back, d.wimple, d.hood_up, d.hood_back].iter().any(|n| t.contains(n)))) {
            worn += 1;
            let mut g = gown.clone();
            // (with no gap: only what stands outside the cloth is moved, and so counted)
            let t0 = std::time::Instant::now();
            let n = sink(&mut g, over, out.chin, 0.0, THROUGH);
            spent += t0.elapsed().as_secs_f32();
            if show() && n > 0 {
                let moved: Vec<(f32, f32)> = g.pos.iter().zip(&gown.pos).filter(|(a, b)| a != b).map(|(a, b)| (dist(*a, *b), out.chin - b[1])).collect();
                let deep = |lo: f32, hi: f32| moved.iter().filter(|m| m.0 >= lo && m.0 < hi).count();
                let high = |lo: f32, hi: f32| moved.iter().filter(|m| m.1 >= lo && m.1 < hi).count();
                println!("person {k} {}: {n} through {}; by under 1 mm {}, 1 to 3 mm {}, 3 mm and more {}; under the chin by under 0.2: {}, 0.2 to 1: {}, more: {}", if p.female { "woman" } else { "man" }, over.tex.as_deref().unwrap_or(""), deep(0.0, 0.01), deep(0.01, 0.03), deep(0.03, 9.0), high(-9.0, 0.2), high(0.2, 1.0), high(1.0, 99.0));
            }
            // (and how much of the gown lies close under that cloth at all)
            let mut g = gown.clone();
            under += sink(&mut g, over, out.chin, REACH, THROUGH);
            through += n;
            if n > worst.0 {
                worst = (n, k);
            }
        }
    }
    if show() {
        println!("{worn} cloths over a gown on 120 people; {under} corners of the gown under them, {through} through them (at most {} on person {}); looking takes {:.1} ms a cloth", worst.0, worst.1, 1000.0 * spent / worn as f32);
        return;
    }
    assert!(worn >= 80 && under > 100_000, "{worn} cloths over a gown, {under} corners under them");
    assert_eq!(through, 0, "{through} corners of the gown through the cloth over it, {} on person {}", worst.0, worst.1);
}

#[test]
fn nothing_of_the_wimple_comes_through_the_veil() {
    // (round 139) The wimple is worn under the veil. Both were set as far outside the gown, each for itself, and
    // the wimple's end stood through the veil's fall on the shoulder with a dark slit under it, its rolled hem
    // in a ridge across the veil's back. On the women of 120 people who wear both, as the builder stands them:
    // no corner of the wimple stands outside the veil (counted as for the gown above).
    let Some(h) = head() else { return };
    let d = &ENGLAND_1356;
    let (mut through, mut worn, mut under) = (0, 0, 0);
    let mut worst = (0, 0u32);
    for k in 0..120u32 {
        let p = person(k, k % 2 == 0, [15.0, 24.0, 35.0, 50.0, 58.0, 68.0][(k / 2) as usize % 6]);
        let out = build(&h, &p, 1);
        let Some(wimple) = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(d.wimple))) else { continue };
        for veil in out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| [d.veil, d.veil_back].iter().any(|n| t.contains(n)))) {
            worn += 1;
            let mut w = wimple.clone();
            let n = sink(&mut w, veil, out.chin, 0.0, THROUGH);
            if show() && n > 0 {
                let far = w.pos.iter().zip(&wimple.pos).map(|(a, b)| dist(*a, *b)).fold(0f32, f32::max);
                println!("person {k}: {n} corners of the wimple through {}, by up to {:.1} mm", veil.tex.as_deref().unwrap_or(""), 100.0 * far);
            }
            let mut w = wimple.clone();
            under += sink(&mut w, veil, out.chin, REACH, THROUGH);
            through += n;
            if n > worst.0 {
                worst = (n, k);
            }
        }
    }
    if show() {
        println!("{worn} wimples under a veil on 120 people; {under} corners of the wimple under the veil, {through} through it (at most {} on person {})", worst.0, worst.1);
        return;
    }
    assert!(worn >= 15 && under > 10_000, "{worn} wimples under a veil, {under} corners under it");
    assert_eq!(through, 0, "{through} corners of the wimple through the veil, {} on person {}", worst.0, worst.1);
}

#[test]
fn a_bust_is_held_towards_the_bodys_front_line() {
    // MakeHuman's breasts stand under a gown as two points, where a gown of 1356 is cut close over the chest and
    // holds it. What stands in front of the body's front middle line is brought nearer to it by a share
    // (src/pose.rs `hold_bust`): here on a line that runs straight down at depth 1 from height 5 to 3, the hold
    // beginning at height 5.5.
    let line = [[5.0, 1.0], [4.0, 1.0], [3.0, 1.0]];
    let held = |q: V3, n: V3, share: f32| -> (V3, V3) {
        let mut s = Surface::new(Mat { rough: 1.0, metal: 0.0, double: false });
        s.pos.push(q);
        s.nrm.push(n);
        hold_bust(std::slice::from_mut(&mut s), &line, 5.5, BUST_SIDE, share);
        (s.pos[0], s.nrm[0])
    };
    // in front of the line: nearer by the share, at its own height and side; under the line's end too
    for y in [4.5, 3.5, 2.0] {
        let (q, n) = held([0.4, y, 1.6], [0.0, 0.0, 1.0], 0.5);
        assert!((q[2] - 1.3).abs() < 1e-5 && q[0] == 0.4 && q[1] == y, "at {y}: {q:?}");
        assert!((n[2] - 1.0).abs() < 1e-3, "at {y}: a flat place still faces forward, {n:?}");
    }
    // behind the line, above where the hold begins, beyond the side, and with no share: as it was
    for (q, share, what) in [([0.4, 4.5, 0.8], 0.5, "behind the line"), ([0.4, 5.6, 1.6], 0.5, "above the hold"), ([BUST_SIDE[1] + 0.1, 4.5, 1.6], 0.5, "beyond the side"), ([0.4, 4.5, 1.6], 0.0, "no share")] {
        assert_eq!(held(q, [0.0, 0.0, 1.0], share).0, q, "{what}");
    }
    // growing in between: less than the whole over the line's first point and towards the side, and evenly
    // (no step: 1 cm of height changes the depth by less than 1 mm)
    let part = held([0.4, 5.25, 1.6], [0.0, 0.0, 1.0], 0.5).0[2];
    assert!(part > 1.35 && part < 1.55, "half way up to where the hold begins: {part}");
    let aside = held([(BUST_SIDE[0] + BUST_SIDE[1]) / 2.0, 4.5, 1.6], [0.0, 0.0, 1.0], 0.5).0[2];
    assert!(aside > 1.35 && aside < 1.55, "half way out to the side: {aside}");
    let mut last = held([0.4, 5.6, 1.6], [0.0, 0.0, 1.0], 0.5).0[2];
    for i in 1..=80 {
        let z = held([0.4, 5.6 - 0.01 * i as f32, 1.6], [0.0, 0.0, 1.0], 0.5).0[2];
        assert!((z - last).abs() < 0.012 && z <= last + 1e-6, "a step at height {}: {last} to {z}", 5.6 - 0.01 * i as f32);
        last = z;
    }
    // a surface's direction goes with it: a slope that is made flatter faces more upright to it
    let (_, n) = held([0.4, 4.5, 1.6], [0.0, 0.6, 0.8], 0.5);
    let l = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
    assert!((l - 1.0).abs() < 1e-3, "a direction of length {l}");
    assert!(n[1] < 0.4 && n[2] > 0.9, "a slope held to half its depth faces {n:?}");
}

/// How far along `d` from `o` the line meets the triangle (a, b, c), if it does.
fn meets(o: V3, d: V3, a: V3, b: V3, c: V3) -> Option<f32> {
    let sub = |p: V3, q: V3| [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
    let cross = |p: V3, q: V3| [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    let dot = |p: V3, q: V3| p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    let (e1, e2) = (sub(b, a), sub(c, a));
    let h = cross(d, e2);
    let det = dot(e1, h);
    if det.abs() < 1e-9 {
        return None;
    }
    let s = sub(o, a);
    let u = dot(s, h) / det;
    let q = cross(s, e1);
    let v = dot(d, q) / det;
    (u >= 0.0 && v >= 0.0 && u + v <= 1.0).then(|| dot(e2, q) / det)
}

#[test]
fn the_sleeves_cover_the_arms() {
    // The skin of the arms is drawn down to the elbows, under the sleeves. Where the old gown is sewn to the piece
    // below it, the kirtle's right sleeve was sewn as a fan from one point under the arm to the whole of the old
    // sleeve's edge over it (`bust_bind.py`, by the shorter of the two next seams): the fan went straight through
    // the arm, and from the side a woman's arm was bare between shoulder and elbow; from the front the fan's edges
    // stood out behind a girl's arm as a row of teeth. Held here: from the arm's skin outward there is cloth.
    let Some(h) = head() else { return };
    for k in 0..16u32 {
        let age = [8.0, 13.0, 24.0, 35.0, 50.0, 70.0, 5.0, 17.0][k as usize % 8];
        let fem = k % 2 == 0;
        let out = build(&h, &person(k, fem, age), 1);
        let gown = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("/cloth_cote."))).expect("the gown");
        let skin = out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains("skin"))).max_by_key(|s| s.pos.len()).expect("the skin");
        // the arms' skin: the outer quarter of the skin's breadth, from under the shoulders' height down (nearer
        // the middle the skin is the chest's, which a wide neck shows)
        let wide = skin.pos.iter().map(|q| (q[0] - out.cx).abs()).fold(0f32, f32::max);
        let arm: Vec<usize> = (0..skin.pos.len()).filter(|&i| skin.pos[i][1] < out.chin - 0.6 * wide && (skin.pos[i][0] - out.cx).abs() > 0.72 * wide).collect();
        assert!(arm.len() > 300, "person {k}: {} places of the arms' skin", arm.len());
        let near: Vec<&[V3]> = gown.pos.chunks_exact(3).filter(|t| t.iter().any(|q| (q[0] - out.cx).abs() > 0.5 * wide && q[1] < out.chin - 0.3 * wide)).collect();
        let bare = arm.iter().step_by(7).filter(|&&i| !near.iter().any(|t| meets(skin.pos[i], skin.nrm[i], t[0], t[1], t[2]).is_some_and(|at| at > 0.0 && at < 1.5))).count();
        let share = bare as f32 / arm.iter().step_by(7).count() as f32;
        if show() {
            println!("{} {k} of {age}: {:.1} % of the arms' skin with no cloth over it", if fem { "woman" } else { "man" }, 100.0 * share);
        }
        assert!(share < 0.05, "{} {k} of {age}: {} of the arms' skin with no cloth over it", if fem { "woman" } else { "man" }, share);
    }
}

#[test]
fn a_childs_gown_has_folds_as_large_against_the_child_as_a_grown_ones_and_no_shelf_across_the_chest() {
    // Round 142, on 48 people of 2 to 50, eight of each age, as much of the gown as the picture shows. A child's
    // head is large against its trunk, so the picture of a child of two shows the gown to under the armpits, where
    // a grown person's ends at the chest.
    // The gown was set on the body with its arms down, each point with its own triangle: a sleeve swung down by the
    // whole of the arm's turn, the cloth in the armpit stayed with the trunk, and the calming made a shelf of the
    // two, across the chest, with a spike at either end. And the gown's own folds stood on every body as large as
    // they were draped, on a chest half as broad as the base's as well. Of the gown's edges in the picture 3.32 %
    // were turned over 90 degrees on the children of two (the middle one of eight), 2.72 % at five, 2.48 % at
    // eight, against 1.02 % at 24; and a corner stood 10.44, 9.96 and 10.18 thousandths of the head's height off
    // the mean of its neighbours, against 8.62 at 24. Now 2.44, 2.19 and 1.87 % (0.90 % at 24), and 8.63, 9.04 and
    // 9.04 thousandths against 8.57.
    use std::collections::HashMap;
    let Some(h) = head() else { return };
    let ages = [2.0f32, 5.0, 8.0, 13.0, 24.0, 50.0];
    let key = |q: V3| -> [i32; 3] { std::array::from_fn(|a| (q[a] * 2000.0).round() as i32) };
    let sub = |a: V3, b: V3| -> V3 { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] };
    let faces = |t: &[V3]| -> V3 {
        let (u, v) = (sub(t[1], t[0]), sub(t[2], t[0]));
        [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    };
    let mut by_age: Vec<Vec<[f32; 2]>> = vec![Vec::new(); ages.len()];
    for k in 0..48u32 {
        let a = (k / 2) as usize % ages.len();
        let out = build(&h, &person(k, k % 2 == 0, ages[a]), 1);
        let gown = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("/cloth_cote."))).unwrap_or_else(|| panic!("person {k}: no gown"));
        let high = out.top - out.chin;
        let foot = out.top - FOOT * high.max(0.8) / (out.fill * CLOSE);
        let tris: Vec<&[V3]> = gown.pos.chunks_exact(3).collect();
        let mut edges: HashMap<([i32; 3], [i32; 3]), Vec<usize>> = HashMap::new();
        // (a corner: its place, the sum of its neighbours' places, their number)
        let mut corners: HashMap<[i32; 3], (V3, V3, f32)> = HashMap::new();
        for (ti, t) in tris.iter().enumerate() {
            for e in 0..3 {
                let (p0, p1) = (t[e], t[(e + 1) % 3]);
                let (a, b) = (key(p0), key(p1));
                edges.entry(if a < b { (a, b) } else { (b, a) }).or_default().push(ti);
                for (at, q, other) in [(a, p0, p1), (b, p1, p0)] {
                    let c = corners.entry(at).or_insert((q, [0.0; 3], 0.0));
                    (c.1, c.2) = ([c.1[0] + other[0], c.1[1] + other[1], c.1[2] + other[2]], c.2 + 1.0);
                }
            }
        }
        let (mut n, mut over) = (0, 0);
        for v in edges.values().filter(|v| v.len() == 2 && tris[v[0]][0][1] >= foot) {
            let (f, g) = (faces(tris[v[0]]), faces(tris[v[1]]));
            n += 1;
            over += usize::from(f[0] * g[0] + f[1] * g[1] + f[2] * g[2] < 0.0);
        }
        let (mut off, mut m) = (0f32, 0);
        for (q, sum, c) in corners.values().filter(|c| c.0[1] >= foot) {
            off += dist(*q, [sum[0] / c, sum[1] / c, sum[2] / c]);
            m += 1;
        }
        assert!(n > 2000 && m > 1000, "person {k} of {}: {n} edges and {m} corners of the gown in the picture", ages[a]);
        by_age[a].push([100.0 * over as f32 / n as f32, 1000.0 * off / m as f32 / high]);
    }
    let middle = |a: usize, what: usize| -> f32 {
        let mut v: Vec<f32> = by_age[a].iter().map(|t| t[what]).collect();
        v.sort_by(|x, y| x.partial_cmp(y).unwrap());
        v[v.len() / 2]
    };
    if show() {
        for (a, age) in ages.iter().enumerate() {
            println!("age {age:2}: {:.2} % of the gown's edges in the picture turned over 90 degrees; a corner {:.2} thousandths of the head's height off the mean of its neighbours (the middle one of {})", middle(a, 0), middle(a, 1), by_age[a].len());
        }
    }
    let grown = middle(4, 1).max(middle(5, 1));
    for (a, most) in [(0, 2.8), (1, 2.5), (2, 2.1)] {
        assert!(middle(a, 0) < most, "at {}: {:.2} % of the gown's edges turned over", ages[a], middle(a, 0));
        assert!(middle(a, 1) < 1.06 * grown, "at {}: a corner {:.2} off the mean of its neighbours, on the grown {grown:.2}", ages[a], middle(a, 1));
    }
    // (and the grown are not rougher for it: 1.02 and 1.09 % before)
    assert!(middle(4, 0) < 1.0 && middle(5, 0) < 1.05, "the grown: {:.2} and {:.2} % of the gown's edges turned over", middle(4, 0), middle(5, 0));
}
