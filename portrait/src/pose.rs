//! How the body stands under the head (round 123). Until then a portrait was one stiff piece: head, neck and
//! shoulders all faced the same way, and the stage turned the whole of it (src/portrait/profile.ts `turn`), so
//! that every person of a sample stood in the one pose, square to their own face. People sit for a picture with
//! the shoulders turned further away than the face, the head brought round towards whoever looks, and no two of
//! them alike.
//!
//! The pose is a twist of the neck: everything from the chin upward keeps its place to the last digit (the
//! face, its landmarks and what the gauntlet reads on it do not move), everything from the neck's foot downward
//! turns about the upright axis through the neck by the person's angle, and the neck between them twists (`share`).
//! It is applied to the finished surfaces, to all of them alike, so that cloth, hair and skin stay on each
//! other: a hood's cape and a veil's fall go with the shoulders, their upper part stays with the head. A beard's
//! locks hang from the jaw and stay with the head whole (`stays`).

use crate::geo::{c01, hash, sm, Surface, V3};

/// A person's pose: how far the shoulders are turned further than the head (radians about the upright axis,
/// towards the side the stage turns the head to when positive), and how far the shoulders' line is tipped (radians
/// about the axis from back to front: the left shoulder higher when positive).
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Pose {
    pub turn: f32,
    pub tip: f32,
}

/// The pose of the person with this seed, from a dress table's range: the turn between its least and its most,
/// the tip up to its most either way. Both by draws of their own, so that neither goes with hood, hair or veil
/// (which take the seed's digits).
pub fn pose_of(range: [f32; 3], seed: u32) -> Pose {
    Pose { turn: range[0] + (range[1] - range[0]) * hash(seed, 1231, 7), tip: range[2] * (2.0 * hash(seed, 1232, 11) - 1.0) }
}

/// How far under the chin the neck's foot lies, in heights of the head (chin to crown): from there downward
/// everything turns as one piece. On MakeHuman's base 5 cm, a little under where the shoulders' line meets the
/// neck, so that the shoulders' inner ends lag a little behind their outer ends, as the muscle between neck and
/// shoulder does. With the foot at 4 cm (0.17) and the turn rising as a smooth step, the neck's skin was drawn to
/// 1.67 of its length at a turn of 0.39 (tests/pose.rs).
pub const NECK: f32 = 0.21;

/// How much of the pose a place at height `y` takes: none from `top` (the chin) upward, all of it from `foot`
/// (the neck's foot) downward. Between them half evenly and half as a smooth step: an even rise twists the neck
/// least (the smooth step's steepest place is half again as steep) but has an edge at either end.
pub fn share(y: f32, foot: f32, top: f32) -> f32 {
    1.0 - 0.5 * (sm(foot, top, y) + c01((y - foot) / (top - foot)))
}

/// Whether a surface stays with the head whole: a beard's locks, which hang from the jaw to below the chin.
fn stays(s: &Surface) -> bool {
    s.tex.as_deref().is_some_and(|t| t.contains("beard") && t.contains("_locks"))
}

/// How fast that share changes with the height (per unit of height; 0 outside the neck).
fn share_rise(y: f32, foot: f32, top: f32) -> f32 {
    let u = (y - foot) / (top - foot);
    if u <= 0.0 || u >= 1.0 {
        0.0
    } else {
        -0.5 * (6.0 * u * (1.0 - u) + 1.0) / (top - foot)
    }
}

/// Turns and tips what lies under the chin: `axis` is where the neck stands (x, z), `foot` and `top` the heights
/// between which the neck twists.
pub fn pose(surfaces: &mut [Surface], p: Pose, axis: [f32; 2], foot: f32, top: f32) {
    if p.turn == 0.0 && p.tip == 0.0 {
        return;
    }
    // about the upright axis (towards -x for a positive turn: the stage turns the head to that side), then about
    // the axis from back to front
    let turned = |q: V3, t: f32| -> V3 {
        let (c, s) = ((p.turn * t).cos(), (-p.turn * t).sin());
        [q[0] * c + q[2] * s, q[1], -q[0] * s + q[2] * c]
    };
    let tipped = |q: V3, t: f32| -> V3 {
        let (c, s) = ((p.tip * t).cos(), (p.tip * t).sin());
        [q[0] * c - q[1] * s, q[0] * s + q[1] * c, q[2]]
    };
    for s in surfaces.iter_mut().filter(|s| !stays(s)) {
        // (what lies from the chin upward is left as it is, to the last digit)
        for k in 0..s.pos.len() {
            let q = s.pos[k];
            if q[1] >= top {
                continue;
            }
            let (t, rise) = (share(q[1], foot, top), share_rise(q[1], foot, top));
            let r = turned([q[0] - axis[0], q[1] - foot, q[2] - axis[1]], t);
            let d = tipped(r, t);
            s.pos[k] = [axis[0] + d[0], foot + d[1], axis[1] + d[2]];
            if let Some(n) = s.nrm.get_mut(k) {
                // A surface's direction turns with its place, and within the neck it leans as well: there a
                // place higher up is turned less than one below it, so that an upright wall stands slanted after
                // it. `w` is how a place moves as the share changes with the height; the direction is what stays
                // at right angles to the surface (the transposed inverse of how the places move). Without it the
                // strands of a plait that hangs past the neck were lit as if they stood upright (tests/plait.rs)
                let (m, up) = (tipped(turned(*n, t), t), tipped(turned([0.0, 1.0, 0.0], t), t));
                let about = tipped([r[2], 0.0, -r[0]], t);
                let w: V3 = std::array::from_fn(|a| rise * (-p.turn * about[a] + p.tip * [-d[1], d[0], 0.0][a]));
                let (wm, wu) = (w[0] * m[0] + w[1] * m[1] + w[2] * m[2], w[0] * up[0] + w[1] * up[1] + w[2] * up[2]);
                let out: V3 = std::array::from_fn(|a| m[a] - up[a] * wm / (1.0 + wu));
                let l = (out[0] * out[0] + out[1] * out[1] + out[2] * out[2]).sqrt();
                *n = if l > 1e-6 && (n[0] != 0.0 || n[1] != 0.0 || n[2] != 0.0) { [out[0] / l, out[1] / l, out[2] / l] } else { *n };
            }
        }
    }
}
