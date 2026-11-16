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
//! widest place: the cheekbones in front of the ears, the jaw's corners under them, the wings of the nose.

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
pub const NOSE: [(usize, usize); 3] = [(4992, 2230), (4908, 2142), (4924, 2160)];
/// The lids' edges over and under the pupil, of the eye at positive x and of the other.
pub const LIDS: [(usize, usize); 2] = [(2891, 2934), (1, 44)];

/// What `face` measures, and the survey's mean and standard deviation for men and for women (0 where it has none).
pub const MEASURES: [(&str, [f32; 2], [f32; 2]); 13] = [
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
];

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
    ]
}
