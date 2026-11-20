//! The pose of England 1356 (round 123, src/pose.rs): the shoulders turned further than the head, the neck
//! twisting between the chin and its foot (the real look: a file of its own, see tests/common).

mod common;

use common::{head, person};
use sc_portrait::dress::ENGLAND_1356;
use sc_portrait::measure::{MENTON, PRONASALE, SELLION};
use sc_portrait::pose::{pose_of, NECK};
use sc_portrait::{build, build_posed, LODS};

type V3 = [f32; 3];

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

fn dist(a: &V3, b: &V3) -> f32 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
}

#[test]
fn the_head_keeps_its_place_and_the_shoulders_turn_as_one_piece() {
    // Until round 123 a portrait was one stiff piece and every person stood square to their own face. Now the
    // shoulders are turned further than the head. Held here against the same person built as one stiff piece:
    // nothing from the chin upward has moved by a digit (the face, its landmarks, the frame: what the gauntlet
    // reads stays read at the same places); what lies under the neck's foot has turned as one piece, by the
    // person's angle; and the skin of the neck between them is twisted, not torn.
    let Some(h) = head() else { return };
    let idx = &h.parts["body"][LODS - 1];
    for k in 0..12 {
        let p = person(k, k % 2 == 0, 24.0 + 3.0 * k as f32);
        let (stiff, posed) = (build_posed(&h, &p, 1, Some([0.0; 3])), build(&h, &p, 1));
        let asked = pose_of(ENGLAND_1356.pose, p.seed);
        assert_eq!((stiff.top, stiff.chin, stiff.cx, stiff.cz, stiff.fill), (posed.top, posed.chin, posed.cx, posed.cz, posed.fill), "person {k}: the frame");
        assert_eq!(stiff.surfaces.len(), posed.surfaces.len(), "person {k}: the surfaces");
        // (the bust leans back after the pose, by a tenth of a radian about the ears' axis: a place 15 cm in
        // front of that axis is 1.5 cm higher for it. So "from the chin upward" is read 3 cm over the chin's
        // height here, and the chin itself by its landmark)
        let (head_from, foot) = (stiff.chin + 0.3, stiff.chin - NECK * (stiff.top - 0.12 - stiff.chin) - 0.3);
        let (mut kept, mut moved) = (0usize, 0usize);
        for (a, b) in stiff.surfaces.iter().zip(&posed.surfaces) {
            assert_eq!((a.pos.len(), &a.tex), (b.pos.len(), &b.tex), "person {k}: a surface's corners");
            for (q, r) in a.pos.iter().zip(&b.pos) {
                if q[1] >= head_from {
                    assert!(q == r, "person {k}: a place of the head moved, {q:?} to {r:?} ({:?})", a.tex);
                    kept += 1;
                } else if q[1] < foot && q != r {
                    moved += 1;
                }
            }
        }
        assert!(kept > 20_000 && moved > 5_000, "person {k}: {kept} places of the head kept, {moved} under the neck moved");
        let skin = |o: &sc_portrait::Portrait| o.surfaces.iter().position(|s| s.pos.len() >= idx.len() && s.tex.as_deref().is_some_and(|t| t.contains("skin"))).expect("the skin");
        let (ss, sp) = (&stiff.surfaces[skin(&stiff)], &posed.surfaces[skin(&posed)]);
        for mark in [SELLION, PRONASALE, MENTON] {
            let i = idx.iter().position(|&v| v as usize == mark).unwrap();
            assert!(ss.pos[i] == sp.pos[i], "person {k}: landmark {mark} moved");
        }
        // under the neck's foot: one piece (the distances between its places are kept), turned by the angle asked
        let under: Vec<usize> = (0..ss.pos.len()).filter(|&i| ss.pos[i][1] < foot).step_by(97).collect();
        assert!(under.len() > 50, "person {k}: {} places of the skin under the neck", under.len());
        let mut worst = 0f32;
        for w in under.windows(2) {
            worst = worst.max((dist(&ss.pos[w[0]], &ss.pos[w[1]]) - dist(&sp.pos[w[0]], &sp.pos[w[1]])).abs());
        }
        // the shoulders' line: from the leftmost to the rightmost place of the skin under the neck, seen from above
        let (l, r) = under.iter().fold((under[0], under[0]), |(l, r), &i| (if ss.pos[i][0] < ss.pos[l][0] { i } else { l }, if ss.pos[i][0] > ss.pos[r][0] { i } else { r }));
        let way = |s: &sc_portrait::Surface| (s.pos[r][2] - s.pos[l][2]).atan2(s.pos[r][0] - s.pos[l][0]);
        let turned = way(sp) - way(ss);
        // the neck's skin: how much longer or shorter the edges of its triangles are
        let (mut long, mut short) = (1f32, 1f32);
        for t in 0..ss.pos.len() / 3 {
            for (a, b) in [(3 * t, 3 * t + 1), (3 * t + 1, 3 * t + 2), (3 * t + 2, 3 * t)] {
                let (d0, d1) = (dist(&ss.pos[a], &ss.pos[b]), dist(&sp.pos[a], &sp.pos[b]));
                if d0 > 1e-4 {
                    long = long.max(d1 / d0);
                    short = short.min(d1 / d0);
                }
            }
        }
        if show() {
            println!("person {k}: turn {:.3} tip {:.3}; the shoulders' line turned {turned:.3}; distances under the neck off by {:.4} mm at most; the neck's edges {short:.2} to {long:.2} of their length", asked.turn, asked.tip, 100.0 * worst);
            continue;
        }
        assert!(worst < 0.001, "person {k}: under the neck the distances changed by up to {} mm", 100.0 * worst);
        // (the tip and the bust's lean stand a little across the line seen from above: 0.03)
        assert!((turned - asked.turn).abs() < 0.03, "person {k}: the shoulders' line turned by {turned}, asked {}", asked.turn);
        // (round 127: the shoulders are tipped back by the head's tilt as well, which shortens the neck's side the
        // head is tilted to: the shortest edge of the twelve was 0.70 of its length without the tilt and is 0.64
        // with it, on a man turned by 0.31 and tilted by 0.06; looked at on a bare neck, no fold shows)
        assert!(long < 1.45 && short > 0.6, "person {k}: the neck's skin is drawn to {short} and {long} of its length");
    }
}

#[test]
fn no_two_stand_alike_and_none_past_the_range() {
    // The turn lies between the table's least and most and uses the whole of it, the shoulders' line tips either
    // way, and neither goes with the seed's digits that choose hood, hair and veil.
    let [least, most, tip] = ENGLAND_1356.pose;
    assert!(least > 0.0 && most > least && most < 0.7 && tip > 0.0 && tip < 0.1, "the range {:?}", ENGLAND_1356.pose);
    let all: Vec<_> = (0..1000u32).map(|s| pose_of(ENGLAND_1356.pose, 940_000 + s)).collect();
    assert!(all.iter().all(|p| p.turn >= least && p.turn <= most && p.tip.abs() <= tip));
    let third = (most - least) / 3.0;
    let (low, high) = (all.iter().filter(|p| p.turn < least + third).count(), all.iter().filter(|p| p.turn > most - third).count());
    assert!(low > 250 && high > 250, "{low} of 1000 in the lowest third of the turn, {high} in the highest");
    let left = all.iter().filter(|p| p.tip > 0.0).count();
    assert!(left > 400 && left < 600, "{left} of 1000 with the left shoulder higher");
    // people who share the last three digits of the seed (hood, hair and veil alike) do not share the pose
    let (a, b) = (pose_of(ENGLAND_1356.pose, 940_123), pose_of(ENGLAND_1356.pose, 941_123));
    assert!(a != b);
}

#[test]
fn the_head_is_tilted_from_the_neck_and_the_shoulders_stay() {
    // Round 127: a person carries the head turned and tilted by angles of their own (`DressSet::head`). The head
    // is not moved for it: the portrait says the angles, the stage turns and tilts the whole figure, and the
    // shoulders are tipped back by the tilt here. Held against the same person built in the table's pose without
    // that (a pose handed to the builder is taken as it is): the head has not moved by a digit, and what lies
    // under the neck's foot stands, once the stage has tilted it about the place the portrait names, where it
    // stood before, to within what the bust's lean leaves (the tilt's axis leans with the bust, the stage's does
    // not: 3 mm at the shoulder's end at the most tilt).
    let Some(h) = head() else { return };
    let idx = &h.parts["body"][LODS - 1];
    let (mut most, mut tilted) = (0f32, 0usize);
    for k in 0..12 {
        let p = person(k, k % 2 == 0, 24.0 + 3.0 * k as f32);
        let (plain, carried) = (build_posed(&h, &p, 1, Some(ENGLAND_1356.pose)), build(&h, &p, 1));
        let [yaw, tilt] = ENGLAND_1356.head_of(p.seed);
        assert_eq!((plain.head, carried.head), ([yaw, tilt], [yaw, tilt]), "person {k}: the angles the portrait says");
        assert_eq!(plain.neck, carried.neck, "person {k}: the neck's foot");
        let (head_from, foot) = (plain.chin + 0.3, plain.chin - NECK * (plain.top - 0.12 - plain.chin) - 0.3);
        assert!((carried.neck[1] - (plain.chin - NECK * (plain.top - 0.12 - plain.chin))).abs() < 0.15, "person {k}: the neck's foot at {}", carried.neck[1]);
        for (a, b) in plain.surfaces.iter().zip(&carried.surfaces) {
            assert_eq!((a.pos.len(), &a.tex), (b.pos.len(), &b.tex), "person {k}: a surface's corners");
            for (q, r) in a.pos.iter().zip(&b.pos) {
                assert!(q[1] < head_from || q == r, "person {k}: a place of the head moved, {q:?} to {r:?} ({:?})", a.tex);
            }
        }
        let skin = |o: &sc_portrait::Portrait| o.surfaces.iter().position(|s| s.pos.len() >= idx.len() && s.tex.as_deref().is_some_and(|t| t.contains("skin"))).expect("the skin");
        let (sa, sb) = (&plain.surfaces[skin(&plain)], &carried.surfaces[skin(&carried)]);
        // as the stage tilts a place: about the axis from back to front through the neck's foot
        let (c, s, n) = (tilt.cos(), tilt.sin(), carried.neck);
        let stage = |q: &V3| -> V3 { [n[0] + (q[0] - n[0]) * c - (q[1] - n[1]) * s, n[1] + (q[0] - n[0]) * s + (q[1] - n[1]) * c, q[2]] };
        let (mut off, mut untilted, mut places) = (0f32, 0f32, 0usize);
        for i in (0..sa.pos.len()).filter(|&i| sa.pos[i][1] < foot) {
            off = off.max(dist(&sa.pos[i], &stage(&sb.pos[i])));
            untilted = untilted.max(dist(&sa.pos[i], &sb.pos[i]));
            places += 1;
        }
        if show() {
            println!("person {k}: head turned {yaw:.3}, tilted {tilt:.3}; {places} places under the neck stand {:.1} mm off at most on the stage ({:.1} mm as built)", 100.0 * off, 100.0 * untilted);
            continue;
        }
        assert!(places > 5_000, "person {k}: {places} places of the skin under the neck");
        assert!(off < 0.05, "person {k}: the shoulders stand {} mm off where the pose has them", 100.0 * off);
        if tilt.abs() > 0.03 {
            assert!(untilted > 2.0 * off && untilted > 0.05, "person {k}: tilted by {tilt}, and the shoulders were tipped back by {} mm only", 100.0 * untilted);
            tilted += 1;
        }
        most = most.max(off);
    }
    assert!(show() || tilted >= 4, "{tilted} of 12 with a head tilted by more than 0.03");
    let _ = most;
}

#[test]
fn no_two_carry_the_head_alike_and_none_past_the_range() {
    let [turn, tilt] = ENGLAND_1356.head;
    assert!(turn > 0.0 && turn < 0.2 && tilt > 0.0 && tilt < 0.15, "the range {:?}", ENGLAND_1356.head);
    let all: Vec<_> = (0..1000u32).map(|s| ENGLAND_1356.head_of(940_000 + s)).collect();
    assert!(all.iter().all(|h| h[0].abs() <= turn && h[1].abs() <= tilt));
    for (k, most) in [(0, turn), (1, tilt)] {
        let (low, high) = (all.iter().filter(|h| h[k] < -most / 3.0).count(), all.iter().filter(|h| h[k] > most / 3.0).count());
        assert!(low > 250 && high > 250, "angle {k}: {low} of 1000 in the lowest third, {high} in the highest");
    }
    // the tilt does not go with the turn, nor with the shoulders' tip
    let same = all.iter().filter(|h| (h[0] > 0.0) == (h[1] > 0.0)).count();
    assert!(same > 400 && same < 600, "{same} of 1000 turned and tilted to the same side");
    let with = (0..1000u32).filter(|s| (pose_of(ENGLAND_1356.pose, 940_000 + s).tip > 0.0) == (all[*s as usize][1] > 0.0)).count();
    assert!(with > 400 && with < 600, "{with} of 1000 tilted to the side the shoulders tip to");
    // the eyes are turned back by the head's own turn: straight on a head carried straight, as `gaze_of` has them
    assert_eq!(ENGLAND_1356.gaze_at(1.0, 0.1, [0.0, 0.0]), ENGLAND_1356.gaze_of(1.0, 0.1));
    let (plain, turned) = (ENGLAND_1356.gaze_of(1.0, 0.0), ENGLAND_1356.gaze_at(1.0, 0.0, [0.05, 0.0]));
    assert!((plain[0] - turned[0] - 0.05).abs() < 1e-5 && (plain[1] - turned[1]).abs() < 1e-5, "{plain:?} and {turned:?}");
}

#[test]
fn a_beards_locks_stay_on_the_jaw() {
    // A full beard hangs from the jaw to below the chin, in front of the neck. Turned with the neck by its height
    // its tip would stand 2 cm beside the chin it grows from: its locks stay with the head whole.
    let Some(h) = head() else { return };
    let idx = &h.parts["body"][LODS - 1];
    let (mut seen, mut hang) = (0, 0);
    for k in 0..40 {
        let p = person(2 * k + 1, false, 45.0);
        let (stiff, posed) = (build_posed(&h, &p, 1, Some([0.0; 3])), build(&h, &p, 1));
        // the chin's lowest point, as built (the frame's chin is its height before the bust leans back)
        let skin = stiff.surfaces.iter().find(|s| s.pos.len() >= idx.len() && s.tex.as_deref().is_some_and(|t| t.contains("skin"))).expect("the skin");
        let menton = skin.pos[idx.iter().position(|&v| v as usize == MENTON).unwrap()][1];
        for (a, b) in stiff.surfaces.iter().zip(&posed.surfaces) {
            if a.tex.as_deref().is_some_and(|t| t.contains("beard") && t.contains("_locks")) {
                assert!(a.pos == b.pos && a.nrm == b.nrm, "man {k}: his beard's locks moved");
                seen += 1;
                hang += a.pos.iter().any(|q| q[1] < menton - 0.1) as usize;
            }
        }
    }
    assert!(seen >= 3 && hang >= 1, "{seen} men of 40 with a beard of locks, {hang} of them to 1 cm below the chin");
}
