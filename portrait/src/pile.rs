//! (round 165) A fur's pile.
//!
//! The mantle's facing is a part of its sheet (`tools/portrait/pipeline/mantle.py`, mantle.rs): its fur was as
//! flat as the cloth beside it, a sheet of white with hairs drawn on it. Here the fur is given its pile, when
//! everything stands as it is drawn: each of its triangles is divided in four, and its corners are lifted off the
//! sheet the way the sheet faces, by the fur's bed and by tufts as the fur on a hood has them (facing.rs), here
//! more and there less; between tufts the fur is darker. Along the fur's border, where the cloth goes on, nothing
//! is lifted, and the pile rises from there: the fur lies on the mantle as a cushion, and no gap opens beside it.

use crate::facing::{corners, HOLLOW, TUFT};
use crate::geo::{add, cross, dot, len, lerp, madd, mul, norm, sm, sub, Rng, Surface, V3};
use std::collections::HashMap;

/// How far the fur's bed lies over the sheet, how far from the fur's border it has its whole pile, and how far
/// across a tuft is (units of 10 cm). PLACEHOLDER, by eye beside the reference's fur.
const BED: f32 = 0.02;
pub const RIM: f32 = 0.1;
const ACROSS: f32 = 0.16;

/// Gives `fur` its pile. Each triangle becomes four, in its place in the surface's order.
pub fn raise(fur: &mut Surface) {
    divide(fur);
    let (of, at) = corners(fur);
    // where the sheet faces at each corner
    let mut faces = vec![[0f32; 3]; at.len()];
    for (i, &v) in of.iter().enumerate() {
        faces[v] = add(faces[v], norm(fur.nrm[i]));
    }
    // how far each corner lies from the fur's border along the sheet: a border's edge has one triangle
    let sides = |t: usize| (0..3).map(move |k| (t + k, t + (k + 1) % 3));
    let mut count: HashMap<(usize, usize), u32> = HashMap::new();
    for t in (0..of.len()).step_by(3) {
        for (a, b) in sides(t) {
            *count.entry((of[a].min(of[b]), of[a].max(of[b]))).or_insert(0) += 1;
        }
    }
    let mut far = vec![f32::MAX; at.len()];
    for (&(a, b), _) in count.iter().filter(|(_, &n)| n == 1) {
        far[a] = 0.0;
        far[b] = 0.0;
    }
    // (as many times round as the whole pile lies corners from the border, and some more)
    for _ in 0..8 {
        for t in (0..of.len()).step_by(3) {
            for (a, b) in sides(t) {
                let (a, b) = (of[a], of[b]);
                let d = len(sub(at[a], at[b]));
                far[b] = far[b].min(far[a] + d);
                far[a] = far[a].min(far[b] + d);
            }
        }
    }
    // a rolled hem (its triangles lie within 0.05 of the image's edge, as the cloth files mark them; here the four
    // a triangle of the file was divided in) is as thick as half a tuft all the way: a tube too thin to carry tufts
    let hems: Vec<usize> = (0..of.len()).step_by(12).filter(|&t| (t..t + 12).all(|i| fur.uv[i][1].abs() <= 0.05)).collect();
    let mut stand: Vec<f32> = at.iter().map(tuft).collect();
    for &t in &hems {
        for i in t..t + 12 {
            stand[of[i]] = 0.5;
        }
    }
    let mut lifted: Vec<V3> = (0..at.len()).map(|v| madd(at[v], norm(faces[v]), sm(0.0, RIM, far[v]) * (BED + TUFT * stand[v]))).collect();
    // and keeps its form: the middle of a side lies between the side's ends (lifted by itself it would lie within
    // the tube's round, a dent between every two rings). In `divide`'s order: a triangle's corners are its 1st,
    // 5th and 9th, the middles of its sides its 2nd, 6th and 3rd
    for &t in &hems {
        for (mid, a, b) in [(1, 0, 4), (5, 4, 8), (2, 8, 0)] {
            lifted[of[t + mid]] = mul(add(lifted[of[t + a]], lifted[of[t + b]]), 0.5);
        }
    }
    // where the fur faces now: square to the triangles round each corner, on the side the sheet faced
    let mut turned = vec![[0f32; 3]; at.len()];
    for t in (0..of.len()).step_by(3) {
        let n = cross(sub(lifted[of[t + 1]], lifted[of[t]]), sub(lifted[of[t + 2]], lifted[of[t]]));
        let n = if dot(n, add(add(faces[of[t]], faces[of[t + 1]]), faces[of[t + 2]])) < 0.0 { mul(n, -1.0) } else { n };
        for k in 0..3 {
            turned[of[t + k]] = add(turned[of[t + k]], n);
        }
    }
    // (a hem faces as it did, round its tube: its few sides are not square to where the fur on it faces)
    for &t in &hems {
        for i in t..t + 12 {
            turned[of[i]] = faces[of[i]];
        }
    }
    for (i, &v) in of.iter().enumerate() {
        fur.pos[i] = lifted[v];
        fur.nrm[i] = norm(turned[v]);
        fur.col[i] = mul(fur.col[i], 1.0 - HOLLOW * (1.0 - stand[v]) * sm(0.0, RIM, far[v]));
    }
}

/// Divides each triangle of `s` in four, at the middles of its sides.
fn divide(s: &mut Surface) {
    let n = s.pos.len();
    let (pos, nrm, uv, col) = (std::mem::take(&mut s.pos), std::mem::take(&mut s.nrm), std::mem::take(&mut s.uv), std::mem::take(&mut s.col));
    for t in (0..n).step_by(3) {
        // a corner, or the middle of the side from a corner to the next
        let mut put = |c: usize, mid: bool| {
            let (a, b) = (t + c, t + if mid { (c + 1) % 3 } else { c });
            s.pos.push(mul(add(pos[a], pos[b]), 0.5));
            s.nrm.push(add(nrm[a], nrm[b]));
            s.uv.push([0.5 * (uv[a][0] + uv[b][0]), 0.5 * (uv[a][1] + uv[b][1])]);
            s.col.push(mul(add(col[a], col[b]), 0.5));
        };
        for (c, mid) in [(0, false), (0, true), (2, true), (0, true), (1, false), (1, true), (2, true), (1, true), (2, false), (0, true), (1, true), (2, true)] {
            put(c, mid);
        }
    }
}

/// How high the fur's tufts stand at a place, from 0 to 1: a draw at each corner of a grid of cubes `ACROSS` wide,
/// evened between them.
fn tuft(q: &V3) -> f32 {
    let cell = q.map(|v| (v / ACROSS).floor());
    let part: [f32; 3] = std::array::from_fn(|a| sm(0.0, 1.0, q[a] / ACROSS - cell[a]));
    let at = |x: f32, y: f32, z: f32| -> f32 {
        let key = |v: f32, by: u32| (v as i32 as u32).wrapping_mul(by);
        Rng::new(key(cell[0] + x, 73_856_093) ^ key(cell[1] + y, 19_349_663) ^ key(cell[2] + z, 83_492_791)).next()
    };
    let along = |y: f32, z: f32| lerp(at(0.0, y, z), at(1.0, y, z), part[0]);
    lerp(lerp(along(0.0, 0.0), along(1.0, 0.0), part[1]), lerp(along(0.0, 1.0), along(1.0, 1.0), part[1]), part[2])
}
