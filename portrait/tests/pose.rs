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
        assert!(long < 1.45 && short > 0.65, "person {k}: the neck's skin is drawn to {short} and {long} of its length");
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
