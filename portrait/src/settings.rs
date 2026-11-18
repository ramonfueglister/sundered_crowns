//! The strengths of the real look that Apoleia let its test renders override through environment variables. Here
//! they are fixed at the values Apoleia shipped with. Each is a choice by eye (PLACEHOLDER in Apoleia's words), not
//! a measured value.

/// How far a face gene moves its morph targets (1.6: Ramon 31.10.2026, faces recognisable without caricature).
pub const FACE_GAIN: f32 = 1.6;

/// Outliers softened: c·tanh(x/c) leaves a gene one spread from the middle nearly as it is (−9 %) and pulls the far
/// ends in (2 spreads −27 %, 3 spreads −43 %); this is c. 0 switches the softening off.
pub const FACE_SOFT: f32 = 0.35;

/// The summed pull on one morph target is softened above this (lim·tanh(v/lim)): MakeHuman's targets are made for
/// 0..1, far past that they turn into caricature. 0 switches the softening off.
pub const FACE_LIM: f32 = 1.0;

/// Passes of smoothing over the skin's colours per vertex, so that lips, brows and wrinkles fade into the skin
/// instead of ending at a facet's edge.
pub const SKIN_SOFT: usize = 2;

/// Strength of the shade in eye sockets, nostrils, mouth corners and ear folds (skin_ao.txt).
pub const SKIN_AO: f32 = 0.7;

/// Strength of the redness of nose, cheeks, ears and chin (skin_red.txt).
pub const SKIN_RED: f32 = 0.6;

/// (round 111) From which nose root on the skin's image has its painted light taken back, and where all of it
/// (real_look.rs `root_flat`): how far the root stands in front of the eyes' inner corners, over the distance
/// between the corners. England's sample has 0.24 to 0.63 (round 112, in which noses differ more; 0.26 to 0.57
/// before it: one of the 36, a boy with a small nose, is drawn with the flat image), MakeHuman's east Asian head
/// 0.14, a head half of it 0.26. By eye, PLACEHOLDER.
pub const ROOT_FLAT: [f32; 2] = [0.30, 0.18];
