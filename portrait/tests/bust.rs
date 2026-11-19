//! The bust under the shoulders (round 124): the body's data below the old cut, the gown that hangs on it down to
//! below the picture's foot, the cloth over the gown lifted off it and a woman's bust held by her gown (the real
//! look: a file of its own, see tests/common).

mod common;

use common::{head, person};
use sc_portrait::layers::{lift, GAP, REACH};
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
