//! (round 166) No points on a small child's chest (the real look: a file of its own, see tests/common).

mod common;

use common::{head, person};
use sc_portrait::build;
use std::collections::HashMap;

type V3 = [f32; 3];

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

/// How close the stage of England stands (src/portrait/profile.ts `close`), and how far under the picture's top
/// its foot lies, in heights of the picture (tests/bust.rs).
const CLOSE: f32 = 0.85;
const FOOT: f32 = 0.86;

#[test]
fn a_small_childs_gown_has_few_points_on_the_chest() {
    // Until round 166 every small child's gown, a boy's as well, had a point on either side of the chest and
    // sharp creases beside it: from the front two tips, from the side a nipple. The body has none (on a child of
    // two no corner of its chest stands more than 1.6 mm off the mean of its neighbours). They were of two kinds:
    // points in the gown's own shape, which the builder laid on the child, and points where the gown is held off
    // the body. Where the gown's own shape has a point, its folds are evened now (real_look.rs `CLOTH_POINT`,
    // `CLOTH_FOLD_EVEN`).
    // Counted here: the corners of the gown's front in the picture, between the arms and 3 cm and more from a
    // hem, that stand more than 3 mm off the mean of their neighbours, the way the gown faces; on eight children
    // each. Girls and boys of two had 41 and 64 and have 9 and 19, of five 71 and 76 and have 35 and 11: held to
    // six in ten of what they were. The corner that stood furthest: 5.7 and 9.7 mm at two, 9.7 and 14.3 at five;
    // 5.7 and 5.1, 9.7 and 3.7 now. What is left on the girls is the hold's, as far off as it was, and is not
    // held here.
    let Some(h) = head() else { return };
    let key = |q: V3| -> [i32; 3] { std::array::from_fn(|a| (q[a] * 2000.0).round() as i32) };
    for (age, female, were) in [(2.0f32, true, 41), (2.0, false, 64), (5.0, true, 71), (5.0, false, 76)] {
        let (mut most, mut points) = (0f32, 0);
        for k in 0..8u32 {
            let out = build(&h, &person(2 * k + u32::from(!female), female, age), 1);
            let gown = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("/cloth_cote"))).unwrap_or_else(|| panic!("child {k} of {age}: no gown"));
            // (a corner: its place, its direction, the sum of its neighbours' places, their number)
            let mut corners: HashMap<[i32; 3], (V3, V3, V3, f32)> = HashMap::new();
            let mut hems: Vec<V3> = Vec::new();
            for t in 0..gown.pos.len() / 3 {
                if (0..3).all(|e| gown.uv[3 * t + e][1].abs() <= 0.05) {
                    hems.push(gown.pos[3 * t]);
                    continue;
                }
                for e in 0..3 {
                    let (i, j) = (3 * t + e, 3 * t + (e + 1) % 3);
                    for (i, j) in [(i, j), (j, i)] {
                        let (q, other) = (gown.pos[i], gown.pos[j]);
                        let c = corners.entry(key(q)).or_insert((q, gown.nrm[i], [0.0; 3], 0.0));
                        (c.2, c.3) = ([c.2[0] + other[0], c.2[1] + other[1], c.2[2] + other[2]], c.3 + 1.0);
                    }
                }
            }
            let high = out.top - out.chin;
            let foot = out.top - FOOT * high.max(0.8) / (out.fill * CLOSE);
            for (q, n, sum, c) in corners.values() {
                let l = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt().max(1e-9);
                if n[2] < 0.5 * l || q[1] < foot || (q[0] - out.cx).abs() > 0.6 * high || hems.iter().any(|r| (0..3).map(|a| (q[a] - r[a]).powi(2)).sum::<f32>() < 0.09) {
                    continue;
                }
                let off = (0..3).map(|a| (q[a] - sum[a] / c) * n[a] / l).sum::<f32>();
                points += usize::from(off > 0.03);
                most = most.max(off);
            }
        }
        if show() {
            println!("eight {} of {age}: {points} corners of the gown's chest stand more than 3 mm off their neighbours ({were} before), the furthest {:.1} mm", if female { "girls" } else { "boys" }, 100.0 * most);
        }
        assert!(10 * points < 6 * were, "eight {} of {age}: {points} corners of the gown's chest stand in a point, {were} before", if female { "girls" } else { "boys" });
    }
}
