//! Faces measured as with a caliper: distances between landmarks of the morphed head, in millimetres, to hold a
//! dress table's faces against a survey of real heads (examples/face_measure.rs, tests/faces.rs).
//!
//! The survey: Zhuang & Bradtmiller 2005, Head-and-face anthropometric survey of U.S. respirator users, Journal of
//! Occupational and Environmental Hygiene 2(11): 567-576; 2543 men and 1454 women of 18 to 66, weighted to the work
//! force of the United States (read from the copy at stacks.cdc.gov/view/cdc/190020). People of today and of
//! another country: what it is used for is how a woman's head differs from a man's and how the parts of a face
//! stand to each other, not the size of a head of 1356.
//!
//! The landmarks are vertices of MakeHuman's base head (head.bin's order), found by their place on it
//! (1 unit = 10 cm): the deepest point of the nose's root between the eyes (sellion), where nose and upper lip meet
//! (subnasale), the tip of the nose, the lowest point of the chin (menton), the corners of the mouth (the ends of
//! morph.rs `LIP_SEAM`), the corners of the eye's opening (morph.rs `EYE_CORNERS`) and the lids' edges over and
//! under the pupil; and per breadth a handful of vertices of which the widest pair counts, as a caliper finds the
//! widest place: the cheekbones in front of the ears, the jaw's corners under them, the wings of the nose, the
//! skull's sides over the ears; and for the head's length the brows' middle and the back of the head.

use crate::geo::V3;
use crate::head::Head;
use crate::morph::{EYE_CORNERS, LIP_SEAM};

pub const SELLION: usize = 132;
pub const SUBNASALE: usize = 343;
pub const PRONASALE: usize = 297;
pub const MENTON: usize = 747;
/// The edges where the lips meet, in the middle of the mouth (the upper lip's, the lower lip's).
pub const STOMION: [usize; 2] = [474, 493];
/// The red of the lips on the middle line: where it begins above and ends below, each between the last vertex in
/// the lips' colour and the first outside it (the file skin_lip.txt).
pub const LIP_TOP: [usize; 2] = [455, 466];
pub const LIP_FOOT: [usize; 2] = [496, 492];
pub const CHEEKBONES: [(usize, usize); 5] = [(5240, 2493), (3678, 867), (3144, 269), (3679, 868), (5236, 2489)];
pub const JAW: [(usize, usize); 4] = [(3703, 895), (5089, 2332), (3702, 894), (3797, 997)];
/// The skull's sides above the ears, from just over them to 4 cm higher: the survey's head breadth is the widest
/// place of the head above the ears.
pub const SKULL: [(usize, usize); 7] = [(3671, 860), (3781, 979), (5209, 2460), (3808, 1008), (3674, 863), (3780, 978), (3779, 977)];
/// The foremost point of the forehead between the brows, and the middle line of the back of the head, of which the
/// point furthest from it counts: the survey's head length.
pub const GLABELLA: usize = 227;
pub const BACK: [usize; 4] = [955, 2480, 962, 2470];
pub const NOSE: [(usize, usize); 3] = [(4992, 2230), (4908, 2142), (4924, 2160)];
/// The lids' edges over and under the pupil, of the eye at positive x and of the other.
pub const LIDS: [(usize, usize); 2] = [(2891, 2934), (1, 44)];

/// The landmarks by name, for tools that measure a picture at them (examples/face_measure.rs --marks finds each on
/// the skin's image, tools/portrait/face_colour.mjs reads the picture there). Left and right are the head's own:
/// its left is at positive x, which a viewer sees on the right.
pub fn marks() -> Vec<(&'static str, usize)> {
    let corner = |side: usize| LIP_SEAM[side].0[LIP_SEAM[side].0.len() - 1];
    vec![
        ("sellion", SELLION), ("subnasale", SUBNASALE), ("pronasale", PRONASALE), ("menton", MENTON),
        ("upper lip's edge", STOMION[0]), ("lower lip's edge", STOMION[1]),
        ("lips' top, inside", LIP_TOP[0]), ("lips' top, outside", LIP_TOP[1]),
        ("lips' foot, inside", LIP_FOOT[0]), ("lips' foot, outside", LIP_FOOT[1]),
        ("mouth's corner, left", corner(0)), ("mouth's corner, right", corner(1)),
        ("eye's inner corner, left", EYE_CORNERS[0][0]), ("eye's outer corner, left", EYE_CORNERS[0][1]),
        ("eye's inner corner, right", EYE_CORNERS[1][0]), ("eye's outer corner, right", EYE_CORNERS[1][1]),
        ("upper lid, left", LIDS[0].0), ("lower lid, left", LIDS[0].1),
        ("upper lid, right", LIDS[1].0), ("lower lid, right", LIDS[1].1),
        ("nose's wing, left", NOSE[0].0), ("nose's wing, right", NOSE[0].1),
        ("cheekbone, left", CHEEKBONES[1].0), ("cheekbone, right", CHEEKBONES[1].1),
    ]
}

/// What `face` measures, and the survey's mean and standard deviation for men and for women (0 where it has none).
pub const MEASURES: [(&str, [f32; 2], [f32; 2]); 15] = [
    ("face length (sellion to menton)", [122.7, 7.0], [113.4, 6.1]),
    ("sellion to subnasale", [52.0, 4.1], [48.2, 3.8]),
    ("subnasale to menton", [0.0, 0.0], [0.0, 0.0]),
    ("mouth's line to menton", [0.0, 0.0], [0.0, 0.0]),
    ("breadth at the cheekbones", [143.5, 6.9], [135.1, 6.5]),
    ("breadth at the jaw's corners", [120.4, 10.4], [110.1, 8.9]),
    ("between the pupils", [64.5, 3.6], [61.9, 3.5]),
    ("nose breadth", [36.6, 4.1], [33.2, 3.9]),
    ("nose protrusion", [21.1, 2.7], [19.8, 2.7]),
    ("lip length (mouth's corners)", [51.1, 4.2], [48.0, 4.0]),
    ("lips' height (red of both)", [0.0, 0.0], [0.0, 0.0]),
    ("eye's opening, length", [0.0, 0.0], [0.0, 0.0]),
    ("eye's opening, height", [0.0, 0.0], [0.0, 0.0]),
    ("head breadth (widest above the ears)", [153.0, 6.0], [146.8, 5.6]),
    ("head length (glabella to the back of the head)", [197.3, 7.4], [187.5, 7.2]),
];

/// The red of the lips on the middle line, and its mean and standard deviation for men and for women: the upper
/// lip's (labiale superius to stomion), the lower lip's (stomion to labiale inferius) and both (labiale superius to
/// labiale inferius). The reference group of Ferrario, Sforza, Tartaglia, Sozzi & Carù 2003, Three-dimensional lip
/// morphometry in adults operated on for cleft lip and palate, Plastic and Reconstructive Surgery 111(7):
/// 2149-2156: 89 men and 73 women, healthy young adults of northern Italy (tables I and II, read from the copy at
/// boa.unimib.it/handle/10281/15745; the standard deviations as a summary of that copy gave them). Their mouths
/// are 51.9 and 48.5 mm wide, as the survey's above. They measured between points touched on the face; ours are
/// heights as seen from the front (`lips`), which for points on a face's front is nearly the same.
pub const LIPS: [(&str, [f32; 2], [f32; 2]); 3] = [
    ("the upper lip's red", [6.84, 2.21], [6.62, 2.38]),
    ("the lower lip's red", [8.80, 2.73], [9.09, 2.76]),
    ("the red of both lips", [15.39, 2.98], [15.49, 2.77]),
];

/// The measures of `LIPS` on a morphed head (`morph_test`), in millimetres: heights as seen from the front (the
/// morphed head stands upright). The head's line where the lips meet is where they turn inward, 5 to 7 mm behind
/// their front, where a caliper's point lies on the front: the way through space from the upper lip's top to that
/// line is a third longer than the lip is high.
pub fn lips(pp: &[V3]) -> [f32; 3] {
    let (top, line, foot) = (between(pp[LIP_TOP[0]], pp[LIP_TOP[1]]), between(pp[STOMION[0]], pp[STOMION[1]]), between(pp[LIP_FOOT[0]], pp[LIP_FOOT[1]]));
    [100.0 * (top[1] - line[1]), 100.0 * (line[1] - foot[1]), 100.0 * (top[1] - foot[1])]
}

fn dist(a: V3, b: V3) -> f32 {
    100.0 * (0..3).map(|k| (a[k] - b[k]).powi(2)).sum::<f32>().sqrt()
}

fn between(a: V3, b: V3) -> V3 {
    std::array::from_fn(|k| (a[k] + b[k]) / 2.0)
}

/// The measures of `MEASURES` on a morphed head (`morph_test`), in millimetres.
pub fn face(h: &Head, pp: &[V3]) -> Vec<f32> {
    let widest = |pairs: &[(usize, usize)]| pairs.iter().map(|&(a, b)| dist(pp[a], pp[b])).fold(0.0, f32::max);
    let middle = |part: &str| {
        let idx = &h.parts[part][0];
        let mut c = [0.0; 3];
        for &v in idx {
            for k in 0..3 {
                c[k] += pp[v as usize][k] / idx.len() as f32;
            }
        }
        c
    };
    let corner = |side: usize| pp[LIP_SEAM[side].0[LIP_SEAM[side].0.len() - 1]];
    vec![
        dist(pp[SELLION], pp[MENTON]),
        dist(pp[SELLION], pp[SUBNASALE]),
        dist(pp[SUBNASALE], pp[MENTON]),
        dist(between(pp[STOMION[0]], pp[STOMION[1]]), pp[MENTON]),
        widest(&CHEEKBONES),
        widest(&JAW),
        dist(middle("leye"), middle("reye")),
        widest(&NOSE),
        dist(pp[PRONASALE], pp[SUBNASALE]),
        dist(corner(0), corner(1)),
        dist(between(pp[LIP_TOP[0]], pp[LIP_TOP[1]]), between(pp[LIP_FOOT[0]], pp[LIP_FOOT[1]])),
        (dist(pp[EYE_CORNERS[0][0]], pp[EYE_CORNERS[0][1]]) + dist(pp[EYE_CORNERS[1][0]], pp[EYE_CORNERS[1][1]])) / 2.0,
        (dist(pp[LIDS[0].0], pp[LIDS[0].1]) + dist(pp[LIDS[1].0], pp[LIDS[1].1])) / 2.0,
        widest(&SKULL),
        BACK.iter().map(|&v| dist(pp[GLABELLA], pp[v])).fold(0.0, f32::max),
    ]
}

/// How far the front of the skin stands forward under the point (x, y) of the head seen from the front (the
/// foremost of the skin's triangles over it); None beside the head.
pub fn skin_front(h: &Head, pp: &[V3], x: f32, y: f32) -> Option<f32> {
    let idx = &h.parts["body"][crate::LODS - 1];
    let mut front: Option<f32> = None;
    for t in idx.chunks_exact(3) {
        let (a, b, c) = (pp[t[0] as usize], pp[t[1] as usize], pp[t[2] as usize]);
        let (v0, v1, v2) = ([b[0] - a[0], b[1] - a[1]], [c[0] - a[0], c[1] - a[1]], [x - a[0], y - a[1]]);
        let den = v0[0] * v1[1] - v1[0] * v0[1];
        if den.abs() < 1e-14 {
            continue;
        }
        let (w1, w2) = ((v2[0] * v1[1] - v1[0] * v2[1]) / den, (v0[0] * v2[1] - v2[0] * v0[1]) / den);
        if w1 >= 0.0 && w2 >= 0.0 && w1 + w2 <= 1.0 {
            let z = a[2] + w1 * (b[2] - a[2]) + w2 * (c[2] - a[2]);
            front = Some(front.map_or(z, |f| f.max(z)));
        }
    }
    front
}

/// The ears' landmark of the survey's arcs, at the head's left and right: the notch over the flap in front of the
/// ear's opening (tragion). Placed by eye on a drawing of the mesh, to about 3 mm.
pub const TRAGION: (usize, usize) = (5410, 2665);
/// Where the survey's tape crosses the chin: "the most protruding point on the bottom edge of the chin, along the
/// jawline" (its report's list of landmarks), in the middle, where the chin's front turns under. And a point of
/// the forehead about 1 cm over the brows' ridge, in the middle.
pub const CHIN: usize = 2262;
pub const FOREHEAD: usize = 237;

/// What `arcs` measures, and the survey's mean and standard deviation for men and for women (its bitragion chin,
/// subnasale, frontal and coronal arc; table VI of the same paper).
pub const ARCS: [(&str, [f32; 2], [f32; 2]); 4] = [
    ("arc from ear to ear over the chin", [331.2, 15.5], [303.9, 14.9]),
    ("arc from ear to ear under the nose", [294.8, 13.2], [277.5, 13.1]),
    ("arc from ear to ear over the forehead", [304.1, 13.0], [287.4, 11.9]),
    ("arc from ear to ear over the crown", [350.7, 13.9], [339.3, 15.0]),
];

/// A tape drawn tight from one ear's landmark to the other's across a third point, in millimetres: the skin cut
/// by the plane through the three, of which the part on the third point's side of the line between the ears
/// counts, and round it the tightest line from outside (a tape lies across a hollow, not in it). The ears
/// themselves are left out but for the two landmarks. `over`: the third point; None for the arc over the crown,
/// whose plane stands upright through the two ears.
fn arc(h: &Head, pp: &[V3], ears: (usize, usize), over: Option<V3>) -> f32 {
    let sub = |a: V3, b: V3| [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    let dot = |a: V3, b: V3| a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    let cross = |a: V3, b: V3| [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    let unit = |a: V3| {
        let l = dot(a, a).sqrt();
        [a[0] / l, a[1] / l, a[2] / l]
    };
    let (a, b) = (pp[ears.0], pp[ears.1]);
    let u = unit(sub(b, a));
    // in the plane and square to the line between the ears, towards the third point
    let v = match over {
        Some(c) => {
            let w = sub(c, a);
            let along = dot(w, u);
            unit([w[0] - along * u[0], w[1] - along * u[1], w[2] - along * u[2]])
        }
        None => unit([-u[1] * u[0], 1.0 - u[1] * u[1], -u[1] * u[2]]),
    };
    let n = cross(u, v);
    let mut pts: Vec<[f32; 2]> = vec![[0.0, 0.0], [dot(sub(b, a), u), 0.0]];
    for t in h.body_full().chunks_exact(3) {
        for k in 0..3 {
            let (i, j) = (t[k] as usize, t[(k + 1) % 3] as usize);
            let (di, dj) = (dot(sub(pp[i], a), n), dot(sub(pp[j], a), n));
            if di * dj < 0.0 {
                let f = di / (di - dj);
                if h.ear[i] + f * (h.ear[j] - h.ear[i]) > 0.2 {
                    continue;
                }
                let p = sub([pp[i][0] + f * (pp[j][0] - pp[i][0]), pp[i][1] + f * (pp[j][1] - pp[i][1]), pp[i][2] + f * (pp[j][2] - pp[i][2])], a);
                let at = [dot(p, u), dot(p, v)];
                if at[1] > 0.0 {
                    pts.push(at);
                }
            }
        }
    }
    // the tightest line round the points (Andrew's chain); its length without the line between the ears
    pts.sort_by(|p, q| p[0].total_cmp(&q[0]).then(p[1].total_cmp(&q[1])));
    let turn = |o: [f32; 2], p: [f32; 2], q: [f32; 2]| (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
    let mut hull: Vec<[f32; 2]> = Vec::new();
    for half in 0..2 {
        let start = hull.len();
        let order: Vec<[f32; 2]> = if half == 0 { pts.clone() } else { pts.iter().rev().copied().collect() };
        for p in order {
            while hull.len() >= start + 2 && turn(hull[hull.len() - 2], hull[hull.len() - 1], p) <= 0.0 {
                hull.pop();
            }
            hull.push(p);
        }
        hull.pop();
    }
    let round: f32 = (0..hull.len()).map(|k| (hull[k][0] - hull[(k + 1) % hull.len()][0]).hypot(hull[k][1] - hull[(k + 1) % hull.len()][1])).sum();
    100.0 * (round - pts_line(a, b))
}

fn pts_line(a: V3, b: V3) -> f32 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
}

/// The measures of `ARCS` on a morphed head (`morph_test`), in millimetres.
pub fn arcs(h: &Head, pp: &[V3]) -> [f32; 4] {
    arcs_from(h, pp, TRAGION)
}

/// The same from another pair of vertices as the ears' landmark: how much the measures hang on where it was put.
pub fn arcs_from(h: &Head, pp: &[V3], ears: (usize, usize)) -> [f32; 4] {
    [arc(h, pp, ears, Some(pp[CHIN])), arc(h, pp, ears, Some(pp[SUBNASALE])), arc(h, pp, ears, Some(pp[FOREHEAD])), arc(h, pp, ears, None)]
}

/// What `neck` measures, with the survey's circumference of the neck.
pub const NECK: [(&str, [f32; 2], [f32; 2]); 1] = [("neck circumference (the smallest loop)", [406.7, 32.6], [339.5, 30.9])];

/// The same measure on lean young people, men and women, mean and standard deviation in mm: 41 men and 109
/// women of 18 to 20 with a body mass index of 21.7 and 21.0 in the mean (Hingorjo, Qureshi & Mehdi 2012,
/// Neck circumference as a useful marker of obesity, Journal of the Pakistan Medical Association 62(1); the
/// tape just under the larynx, square to the neck's axis; those of them of normal weight: 354.5 and 312.6).
/// 60 Japanese women of 18 to 20 with an index of 20.5: 316 (20) (Nitta and others 2017, Hiroshima Journal of
/// Medical Sciences 66(4): 109-115; the mean of three heights round the larynx). A neck grows with weight:
/// 370 mm on a man and 340 on a woman part those under an index of 25 from those over (Ben-Noun, Sohar &
/// Laor 2001, Obesity Research; 460 men and 519 women; the neck goes with the index at r 0.83 and 0.71). The
/// survey's people are of the United States of 2003 and heavier; people of the fourteenth century who worked
/// the land were lean: for the neck, which is soft tissue, these are the nearer measure. All three read as a
/// reading tool's account of the paper's page, not line by line.
pub const NECK_LEAN: [[f32; 2]; 2] = [[355.6, 27.7], [315.2, 19.6]];

/// How far behind the chin's lowest point the upright stands on which `neck` sets its planes, in units: inside
/// the neck of a grown head (whose neck reaches from 4 to 14 cm behind that point).
const NECK_BEHIND: f32 = 0.9;

/// The length of the tightest line round the part of the skin's cut with a plane that goes round the point
/// `at`, in units: the plane holds the direction from ear to ear and is tilted by `tilt` (radians; its front
/// lower than its back). None where no part of the cut goes round the point.
fn loop_round(h: &Head, pp: &[V3], at: V3, tilt: f32) -> Option<f32> {
    let (c, s) = (tilt.cos(), tilt.sin());
    let over = |p: V3| (p[1] - at[1]) * c + (p[2] - at[2]) * s;
    let tris = h.body_full();
    // the cut: per triangle the points where its edges pass through the plane; triangles that share a cut
    // edge are of one part of the cut
    let mut part: Vec<usize> = (0..tris.len() / 3).collect();
    fn root(part: &mut [usize], mut i: usize) -> usize {
        while part[i] != i {
            part[i] = part[part[i]];
            i = part[i];
        }
        i
    }
    let mut pts: Vec<(usize, [f32; 2])> = Vec::new();
    let mut edges: Vec<((usize, usize), usize)> = Vec::new();
    for (k, t) in tris.chunks_exact(3).enumerate() {
        for e in 0..3 {
            let (i, j) = (t[e] as usize, t[(e + 1) % 3] as usize);
            let (di, dj) = (over(pp[i]), over(pp[j]));
            if (di > 0.0) != (dj > 0.0) {
                let f = di / (di - dj);
                let q = [pp[i][0] + f * (pp[j][0] - pp[i][0]) - at[0], pp[i][1] + f * (pp[j][1] - pp[i][1]) - at[1], pp[i][2] + f * (pp[j][2] - pp[i][2]) - at[2]];
                pts.push((k, [q[0], q[2] * c - q[1] * s]));
                edges.push(((i.min(j), i.max(j)), k));
            }
        }
    }
    edges.sort();
    for w in edges.windows(2) {
        if w[0].0 == w[1].0 {
            let (a, b) = (root(&mut part, w[0].1), root(&mut part, w[1].1));
            part[a] = b;
        }
    }
    let mut by_part: Vec<(usize, [f32; 2])> = pts.iter().map(|&(k, q)| (root(&mut part, k), q)).collect();
    by_part.sort_by(|a, b| a.0.cmp(&b.0).then(a.1[0].total_cmp(&b.1[0])).then(a.1[1].total_cmp(&b.1[1])));
    let turn = |o: [f32; 2], p: [f32; 2], q: [f32; 2]| (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
    let mut least: Option<f32> = None;
    let mut from = 0;
    while from < by_part.len() {
        let to = from + by_part[from..].iter().take_while(|q| q.0 == by_part[from].0).count();
        let group: Vec<[f32; 2]> = by_part[from..to].iter().map(|q| q.1).collect();
        from = to;
        if group.len() < 6 {
            continue;
        }
        // the tightest line round the part (Andrew's chain; the points are in order already)
        let mut hull: Vec<[f32; 2]> = Vec::new();
        for half in 0..2 {
            let start = hull.len();
            let order: Vec<[f32; 2]> = if half == 0 { group.clone() } else { group.iter().rev().copied().collect() };
            for p in order {
                while hull.len() >= start + 2 && turn(hull[hull.len() - 2], hull[hull.len() - 1], p) <= 0.0 {
                    hull.pop();
                }
                hull.push(p);
            }
            hull.pop();
        }
        if hull.len() < 3 || !(0..hull.len()).all(|k| turn(hull[k], hull[(k + 1) % hull.len()], [0.0, 0.0]) > 0.0) {
            continue;
        }
        let round: f32 = (0..hull.len()).map(|k| (hull[k][0] - hull[(k + 1) % hull.len()][0]).hypot(hull[k][1] - hull[(k + 1) % hull.len()][1])).sum();
        if least.is_none_or(|l| round < l) {
            least = Some(round);
        }
    }
    least
}

/// The neck's circumference on a morphed head, in millimetres, with where it was found: the tilt of the tape's
/// plane (degrees; its front lower than its back) and its height over the chin's lowest point on the upright
/// `NECK_BEHIND` that point (mm). The tape lies round the neck under the larynx, square to the neck's axis
/// (so the study of `NECK_LEAN` says; the survey's own words were not read); the head's net has no larynx,
/// so this is the smallest loop round the neck: of all planes that
/// hold the direction from ear to ear, tilted by 0 to 45 degrees and set from 5 cm under to 2 cm over the
/// chin's lowest point, the one whose cut round the neck has the shortest taut line (a tape lies taut over
/// hollows). The smallest loop is no longer than the one under the larynx: the measure reads a neck as thin
/// as it can be read.
pub fn neck_at(h: &Head, pp: &[V3]) -> [f32; 3] {
    let m = pp[MENTON];
    let read = |tilt: f32, up: f32| loop_round(h, pp, [m[0], m[1] + up / 100.0, m[2] - NECK_BEHIND], tilt.to_radians());
    let mut best = [f32::MAX, 0.0, 0.0];
    // coarsely, then round the best by degrees and millimetres
    for (tilts, ups, step) in [((0.0, 45.0), (-50.0, 20.0), (3.0, 5.0)), ((-3.0, 3.0), (-5.0, 5.0), (1.0, 1.0))] {
        let around = if step.0 < 3.0 { [best[1], best[2]] } else { [0.0, 0.0] };
        let mut tilt = tilts.0;
        while tilt <= tilts.1 {
            let mut up = ups.0;
            while up <= ups.1 {
                if let Some(round) = read(around[0] + tilt, around[1] + up) {
                    if round * 100.0 < best[0] {
                        best = [round * 100.0, around[0] + tilt, around[1] + up];
                    }
                }
                up += step.1;
            }
            tilt += step.0;
        }
    }
    best
}

/// The measure of `NECK` on a morphed head (`morph_test`), in millimetres.
pub fn neck(h: &Head, pp: &[V3]) -> f32 {
    neck_at(h, pp)[0]
}

/// What `jaw_front` measures at 5 mm (no survey read for it: the zeros).
pub const JAW_FRONT: [(&str, [f32; 2], [f32; 2]); 1] = [("the jaw's front 5 mm over the menton", [0.0; 2], [0.0; 2])];

/// How broad the front of the jaw is just over the chin, in millimetres: `over` mm above the chin's lowest point
/// (the head as MakeHuman holds it), twice as far as the skin reaches to one side of the middle, of the skin that
/// lies no more than 1 cm behind that point (the neck and the jaw's corners lie further back). A chin that is
/// a broad base under the face has much of it; a jaw that runs in to the chin little.
pub fn jaw_front(h: &Head, pp: &[V3], over: f32) -> f32 {
    let (y, back) = (pp[MENTON][1] + over / 100.0, pp[MENTON][2] - 0.10);
    let mut out = 0.0f32;
    for t in h.body_full().chunks_exact(3) {
        for k in 0..3 {
            let (p, q) = (pp[t[k] as usize], pp[t[(k + 1) % 3] as usize]);
            if (p[1] - y) * (q[1] - y) < 0.0 {
                let f = (y - p[1]) / (q[1] - p[1]);
                if p[2] + f * (q[2] - p[2]) > back {
                    out = out.max((p[0] + f * (q[0] - p[0])).abs() * 200.0);
                }
            }
        }
    }
    out
}

/// How far the stage turns a head of England away from the camera, in radians (src/portrait/profile.ts
/// `ENGLAND_1356.turn`, there with the other sign; the dress table's `gaze` turns the eyes back by as much,
/// which tests hold): the turn at which `far_cheek` is read.
pub const STAGE_TURN: f32 = 0.24;

/// What `far_cheek` measures (no survey read for it: the zeros).
pub const CHEEK: [(&str, [f32; 2], [f32; 2]); 2] = [("the far cheek's pad", [0.0; 2], [0.0; 2]), ("the dent under that pad", [0.0; 2], [0.0; 2])];

/// The outline of the cheek that is turned away from the viewer, as a picture shows a head turned by `turn`
/// (radians): at every 2 mm of height, from 6 mm under the lower lid down to 12 mm over the menton, the skin that
/// stands furthest towards the picture's edge (the skin's triangles cut by level planes; what lies less than
/// 12 mm in front of the jaw's corners is left out: the ear). In millimetres: how much further out than at its
/// top the outline stands at most (the cheek's pad), and how far it lies inside the tightest line round it from
/// outside at most (the dent under the pad). A pad over a dent reads as a pouch in the cheek.
pub fn far_cheek(h: &Head, pp: &[V3], turn: f32) -> [f32; 2] {
    let line = far_outline(h, pp, turn);
    if line.is_empty() {
        return [0.0; 2];
    }
    // the tightest line round the outline from outside: the upper hull of its points
    let mut hull: Vec<[f32; 2]> = Vec::new();
    for &q in &line {
        while hull.len() >= 2 {
            let (a, b) = (hull[hull.len() - 2], hull[hull.len() - 1]);
            if (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) >= 0.0 {
                hull.pop();
            } else {
                break;
            }
        }
        hull.push(q);
    }
    let mut dent = 0.0f32;
    for w in hull.windows(2) {
        for q in line.iter().filter(|q| q[0] > w[0][0] && q[0] < w[1][0]) {
            dent = dent.max(w[0][1] + (w[1][1] - w[0][1]) * (q[0] - w[0][0]) / (w[1][0] - w[0][0]) - q[1]);
        }
    }
    [line.iter().map(|q| q[1]).fold(f32::MIN, f32::max) - line[0][1], dent]
}

/// The outline `far_cheek` reads: (mm under the lower lid, mm towards the picture's edge), every 2 mm of height.
pub fn far_outline(h: &Head, pp: &[V3], turn: f32) -> Vec<[f32; 2]> {
    let (c, s) = (turn.cos(), turn.sin());
    let back = JAW.iter().map(|&(a, b)| pp[a][2] + pp[b][2]).sum::<f32>() / (2 * JAW.len()) as f32 + 0.12;
    let top = pp[LIDS[0].1][1];
    // (height under the lid, how far out), mm
    let mut line: Vec<[f32; 2]> = Vec::new();
    let mut at = 6.0;
    while at < (top - pp[MENTON][1]) * 100.0 - 12.0 {
        let y = top - at / 100.0;
        let mut out = f32::MIN;
        for t in h.body_full().chunks_exact(3) {
            for k in 0..3 {
                let (p, q) = (pp[t[k] as usize], pp[t[(k + 1) % 3] as usize]);
                if (p[1] - y) * (q[1] - y) < 0.0 {
                    let f = (y - p[1]) / (q[1] - p[1]);
                    let (x, z) = (p[0] + f * (q[0] - p[0]), p[2] + f * (q[2] - p[2]));
                    if z > back && x < 0.0 {
                        out = out.max(-(x * c - z * s) * 100.0);
                    }
                }
            }
        }
        if out > f32::MIN {
            line.push([at, out]);
        }
        at += 2.0;
    }
    line
}

/// What `far_at_mouth` measures (no survey read for it: the zeros).
pub const FAR_MOUTH: [(&str, [f32; 2], [f32; 2]); 1] = [("the far cheek at the mouth, inside its top", [0.0; 2], [0.0; 2])];

/// How far inside its place 10 mm under the lower lid the far cheek's outline (`far_outline`) lies at the height
/// of the line between the lips, in mm: how much a face narrows from the cheekbone to the mouth as a picture
/// shows it. A cheek that runs straight from the cheekbone to the chin reads as lean; a full one keeps its
/// breadth to the mouth and turns in under it. On the one woman of the reference whose outline was traced
/// (round 97; her face scaled to ours from lid to chin, a pixel 1.4 mm) about 6 mm.
pub fn far_at_mouth(h: &Head, pp: &[V3], turn: f32) -> f32 {
    let line = far_outline(h, pp, turn);
    let mouth = (pp[LIDS[0].1][1] - (pp[STOMION[0]][1] + pp[STOMION[1]][1]) / 2.0) * 100.0;
    let at = |x: f32| {
        line.windows(2).find(|w| w[0][0] <= x && x <= w[1][0]).map_or(f32::NAN, |w| w[0][1] + (w[1][1] - w[0][1]) * (x - w[0][0]) / (w[1][0] - w[0][0]))
    };
    at(10.0) - at(mouth)
}

/// An eyeball's middle and radius (the eye at positive x for 0, the other for 1).
pub fn ball(h: &Head, pp: &[V3], k: usize) -> (V3, f32) {
    let idx = &h.parts[["leye", "reye"][k]][0];
    let n = idx.len().max(1) as f32;
    let c = idx.iter().fold([0.0; 3], |c, &v| std::array::from_fn(|a| c[a] + pp[v as usize][a] / n));
    (c, idx.iter().map(|&v| dist(pp[v as usize], c) / 100.0).sum::<f32>() / n)
}

/// How a woman's eye stands in her head against a man's, in millimetres (women minus men), as `eye_stands`
/// measures it. Beside the eye: Hertel's exophthalmometer reads how far the cornea stands in front of the bone's
/// rim beside the eye's outer corner, 16.5 mm in white men and 15.4 mm in white women (eyewiki.org,
/// Exophthalmometry, after Erb et al. 2003 and Migliori & Gladstone 1984). Under and over the eye: the cornea
/// stands 11.6 mm in front of the bone's rim under the eye in men and 12.4 mm in women, and 5.3 and 6.3 mm
/// behind the rim over it (Shin, Lee, Koh & Song 2017, Three-dimensional and topographic relationships between
/// the orbital margins with reference to assessment of eyeball protrusion, Anatomy & Cell Biology 50: 41-47;
/// computed tomography of 70 men and 71 women of Korea, 20 to 30 years old; read from a summary of the paper's
/// table). Bone, where `eye_stands` reads skin: only the difference between the sexes is held against these,
/// which is about a millimetre each way and smaller than a head's own spread (2 mm).
pub const EYE_SEX: [(&str, f32); 3] = [("the ball in front of the skin beside the eye", 15.4 - 16.5), ("the ball in front of the skin under the eye", 12.4 - 11.6), ("the brow's ridge in front of the ball", 6.3 - 5.3)];

/// Where the eye at positive x stands in the morphed head (`morph_test`), in millimetres: the ball's front before
/// the skin 6 mm beside the eye's outer corner (where the exophthalmometer's foot rests), before the skin 8 mm
/// under the lower lid's edge, and behind the foremost skin 10 to 24 mm over the upper lid's edge (the brow's
/// ridge), the last two on the pupil's line.
pub fn eye_stands(h: &Head, pp: &[V3]) -> [f32; 3] {
    let front = h.parts["leye"][0].iter().map(|&v| pp[v as usize][2]).fold(f32::MIN, f32::max);
    let (outer, upper, lower) = (pp[EYE_CORNERS[0][1]], pp[LIDS[0].0], pp[LIDS[0].1]);
    let at = |x: f32, y: f32| skin_front(h, pp, x, y).expect("skin about the eye");
    let ridge = (10..=24).map(|k| at(upper[0], upper[1] + k as f32 * 0.01)).fold(f32::MIN, f32::max);
    [100.0 * (front - at(outer[0] + 0.06, outer[1])), 100.0 * (front - at(upper[0], lower[1] - 0.08)), 100.0 * (ridge - front)]
}

/// Points of the profile, and how far each stands in front (+) of the upright line through the subnasale on a
/// head held as people hold theirs (natural head position), mean and standard deviation for men and for women in
/// millimetres: the forehead's foremost point between the brows (glabella), the foremost of the upper lip and of
/// the lower lip, and the chin's foremost point (soft tissue pogonion). Arnett, Jelic, Kim, Cummings, Beress,
/// Worley, Chung & Bergman 1999, Soft tissue cephalometric analysis: diagnosis and treatment planning of
/// dentofacial deformity, American Journal of Orthodontics and Dentofacial Orthopedics 116(3): 239-253; 20 white
/// men and 26 white women with faces judged as balanced (the table of projections to the true vertical line,
/// read from a copy of the paper).
pub const PROFILE: [(&str, [f32; 2], [f32; 2]); 4] = [("glabella", [-8.0, 2.5], [-8.5, 2.4]), ("upper lip", [3.3, 1.7], [3.7, 1.2]), ("lower lip", [1.0, 2.2], [1.9, 1.4]), ("chin", [-3.5, 1.8], [-2.6, 1.9])];

/// The points of `PROFILE` on a morphed head (`morph_test`) whose bust leans back by `lean` radians (the dress
/// table's `lean`): how far each stands in front of the upright line through the subnasale, in millimetres. Each
/// is the foremost of the skin within 3 mm of the middle line: over the nose's root, between nose and mouth, under
/// the mouth, over the chin's foot.
pub fn profile(h: &Head, pp: &[V3], lean: f32) -> [f32; 4] {
    let mut seen = vec![false; pp.len()];
    let mut mid: Vec<V3> = Vec::new();
    for &v in &h.parts["body"][crate::LODS - 1] {
        let q = pp[v as usize];
        if !seen[v as usize] && q[0].abs() < 0.03 && q[2] > pp[SUBNASALE][2] - 0.4 {
            seen[v as usize] = true;
            mid.push(q);
        }
    }
    let (sn, mouth) = (pp[SUBNASALE], between(pp[STOMION[0]], pp[STOMION[1]]));
    let front = |y0: f32, y1: f32| mid.iter().filter(|q| q[1] > y0 && q[1] < y1).fold([0.0, 0.0, f32::MIN], |f, q| if q[2] > f[2] { *q } else { f });
    let (cs, sn_) = (lean.cos(), lean.sin());
    [front(pp[SELLION][1] + 0.06, pp[SELLION][1] + 0.25), front(mouth[1] + 0.01, sn[1] - 0.03), front(mouth[1] - 0.12, mouth[1] - 0.01), front(pp[MENTON][1] + 0.02, pp[MENTON][1] + 0.22)]
        .map(|q| 100.0 * ((q[2] - sn[2]) * cs - (q[1] - sn[1]) * sn_))
}

/// The heights of the lower face on the middle line, each as a share of the height from the subnasale to the
/// chin's lowest point (menton), and that share for men and for women: the upper lip (subnasale to the line where
/// the lips meet) and the lower lip with the chin (that line to menton). Two readings of real faces, a row each.
/// Arnett and others 1999 (as `PROFILE`; the table's facial lengths, read from a copy of the paper): on
/// radiographs of 20 men and 26 women in natural head position with the lips at rest, upper lip 24.4 (SD 2.5) and
/// 21.0 (1.9) mm, the gap between the lips 2.4 and 3.3, lower lip and chin 54.3 (2.4) and 46.9 (2.3), the lower
/// third 81.1 (4.7) and 71.1 (3.5). Farkas, Katic, Hreczko, Deutsch & Munro 1984, Anthropometric proportions in
/// the upper lip-lower lip-chin area of the lower face in young white adults, American Journal of Orthodontics
/// 86(1): 52-60, measured on the face with the lips closed (not read itself: its means as Woelfel, Igarashi & Dong
/// 2014, Journal of Advanced Prosthodontics 6(6): 483-490, cite them): subnasale to stomion 22.3 and 20.1 mm,
/// stomion to gnathion 50.7 and 43.4, subnasale to gnathion 72.6 and 64.3. A radiograph is enlarged and its chin
/// point is the soft tissue's: the millimetres of the two differ, the shares agree.
pub const LOWER_FACE: [(&str, [f32; 2], [f32; 2]); 2] = [
    ("Arnett and others 1999, lips at rest", [24.4 / 81.1, 54.3 / 81.1], [21.0 / 71.1, 46.9 / 71.1]),
    ("Farkas and others 1984, lips closed", [22.3 / 72.6, 50.7 / 72.6], [20.1 / 64.3, 43.4 / 64.3]),
];

/// The heights of `LOWER_FACE` on a morphed head (`morph_test`) whose bust leans back by `lean` radians, in
/// millimetres along the upright line, as a radiograph in natural head position shows them: the upper lip
/// (subnasale to the line where the lips meet), the lower lip and chin (that line to menton), and from the
/// subnasale to menton. The lips' line is taken at the height of the head's seam between the lips and at the
/// depth of the lips' front (the seam itself lies 5 to 7 mm inside the mouth).
pub fn lower_face(pp: &[V3], lean: f32) -> [f32; 3] {
    let (cs, sn_) = (lean.cos(), lean.sin());
    let up = |q: V3| 100.0 * (q[1] * cs + q[2] * sn_);
    let seam = between(pp[STOMION[0]], pp[STOMION[1]]);
    let front = pp[LIP_TOP[0]][2].max(pp[LIP_FOOT[0]][2]);
    let line = up([seam[0], seam[1], front]);
    [up(pp[SUBNASALE]) - line, line - up(pp[MENTON]), up(pp[SUBNASALE]) - up(pp[MENTON])]
}

/// How the lids of the eye at positive x stand to the pupil of a morphed head (`morph_test`) whose eye looks
/// `pitch` radians up from straight ahead, in millimetres: the upper lid's edge over the pupil and the lower
/// lid's under it (the margin reflex distances of a clinic).
pub fn lids_to_pupil(h: &Head, pp: &[V3], pitch: f32) -> [f32; 2] {
    let (c, r) = ball(h, pp, 0);
    let pupil = c[1] + r * pitch.sin();
    [100.0 * (pp[LIDS[0].0][1] - pupil), 100.0 * (pupil - pp[LIDS[0].1][1])]
}
