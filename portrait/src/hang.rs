//! (round 155) How a veil hangs.
//!
//! A veil is bound to the body place by place (real_look.rs `mh_cloth_as`), so it goes where the body goes: over
//! the skull, in under the back of the head to the nape, and out again over the shoulders. On the body it was
//! draped on its back runs straight down; on the women of England's pool, whose necks are thinner and whose heads
//! are carried further forward, and who lean back as they are drawn, its deepest place lay 3.5 cm further in than
//! the cloth on the head above it (the mean of 47 veils, `portrait/tests/veil.rs`), and the veil read as a ball
//! with a ledge under it, a bathing cap with a cape. A cloth that is laid over a head hangs from it: in every
//! direction from the head's upright it lies no further in than it does on the head above.
//!
//! This is done when the pose has turned the shoulders under the head (pose.rs), and as the figure is drawn: the
//! builder leans the bust back afterwards (`lean_back`) and the stage tilts the head towards a shoulder
//! (src/portrait/stage.ts `standing`), and a cloth hangs down in the picture, not along the body's own upright.

use crate::geo::{c01, Surface, V3};
use std::collections::HashMap;

/// How far below the cloth's highest place the cloth is taken to lie on the head's top, where nothing hangs,
/// how far in front of the ears the hanging sets in, and over what distance below the one and behind the other
/// it comes to its full measure (base units of 10 cm). Further to the front a veil's rim lies on the forehead
/// and its ends on the breast, as they were draped. PLACEHOLDER, by eye.
const TOP: f32 = 0.25;
const FRONT: f32 = 0.5;
const FADE: f32 = 0.3;
/// How the cloth on the head holds the cloth beside it out: by how much less for each degree it lies to the side
/// (base units of 10 cm), up to how many degrees, and how much further in than that a place may lie before it
/// hangs. OWN RULE, by eye: a cloth spans the hollow behind an ear and does not go into it. A veil's columns
/// stand 3.75 degrees apart seen from the head's middle (`drape_sim.py`, 96 round the head), and held only by
/// what lies within 2 degrees of it, a place behind the ear hung 5 mm further in than those next to it, which
/// had the ear within their 2 degrees. A head's breadth changes by less than the 1 mm a degree (0.4 a radian
/// at most, beside the ears), so that the cloth on the head, which lies as it should, is not moved.
const SLOPE: f32 = 0.01;
const WEDGE: f32 = 10.0;
const SLACK: f32 = 0.01;
/// Up to what second texture coordinate a corner is a rolled hem's (`tunic_bind.py`: a hem's tube has its own,
/// up to 0.05; the cloth's are its height as draped, halved).
const HEM: f32 = 0.05;
/// How often the heights of the places that hang are evened, and how far each time overshoots (successive
/// over-relaxation, Young 1954, "Iterative methods for solving partial difference equations of elliptic type",
/// Trans. AMS 76). After that many, what is left of the pull would move a place's height by less than a tenth
/// of a millimetre (measured on five veils: 0.04 to 0.08 mm).
const EVEN: usize = 80;
const OVER: f32 = 1.7;

/// Lets `veil` hang from the head: each place at least as far out from the upright through the middle of the
/// cloth's top as the cloth lies in its direction at its height or above. `ears` is the middle between the
/// ears: well in front of it the cloth stays as it is. `lean` and `tilt` are how far the bust is leant back and
/// the figure tilted before it is drawn (radians, as `lean_back` and the stage turn them). Returns how many places
/// hang.
pub fn hang(veil: &mut Surface, ears: V3, lean: f32, tilt: f32) -> usize {
    let ((cl, sl), (ct, st)) = ((lean.cos(), lean.sin()), (tilt.cos(), tilt.sin()));
    let drawn = |q: V3| -> V3 {
        let y = q[1] * cl + q[2] * sl;
        [q[0] * ct - y * st, q[0] * st + y * ct, q[2] * cl - q[1] * sl]
    };
    let built = |q: V3| -> V3 {
        let y = q[1] * ct - q[0] * st;
        [q[0] * ct + q[1] * st, y * cl - q[2] * sl, q[2] * cl + y * sl]
    };
    // the cloth's places, each once (a surface lists the corners of its triangles), and the places beside each
    let mut ids: HashMap<[u32; 3], usize> = HashMap::new();
    let of: Vec<usize> = veil
        .pos
        .iter()
        .map(|q| {
            let n = ids.len();
            *ids.entry(q.map(f32::to_bits)).or_insert(n)
        })
        .collect();
    let mut at = vec![[0f32; 3]; ids.len()];
    for (i, &v) in of.iter().enumerate() {
        at[v] = drawn(veil.pos[i]);
    }
    let mut beside: Vec<Vec<usize>> = vec![Vec::new(); at.len()];
    for t in of.chunks_exact(3) {
        for c in 0..3 {
            for other in [t[(c + 1) % 3], t[(c + 2) % 3]] {
                if other != t[c] && !beside[t[c]].contains(&other) {
                    beside[t[c]].push(other);
                }
            }
        }
    }
    let apart = |a: usize, b: usize| (0..3).map(|k| (at[a][k] - at[b][k]).powi(2)).sum::<f32>().sqrt();
    // the cloth itself, without the tubes of its rolled hems: those go with the edge they are rolled on
    let mut sheet = vec![veil.uv.len() != veil.pos.len(); at.len()];
    for (&v, uv) in of.iter().zip(&veil.uv) {
        sheet[v] |= uv[1].abs() > HEM;
    }
    // where each place lies round the upright through the middle of the cloth's top: how far out, and in what
    // direction (degrees, by which they are sorted into 360 bins)
    let crest = at.iter().map(|q| q[1]).fold(f32::MIN, f32::max);
    let top: Vec<&V3> = at.iter().filter(|q| q[1] > crest - TOP).collect();
    let axis = [0, 2].map(|k| top.iter().map(|q| q[k]).sum::<f32>() / top.len() as f32);
    let round: Vec<[f32; 2]> = at.iter().map(|q| [(q[0] - axis[0]).hypot(q[2] - axis[1]), (q[2] - axis[1]).atan2(q[0] - axis[0]).to_degrees()]).collect();
    let bin = |deg: f32| (deg.floor() as i32).rem_euclid(360) as usize;
    let mut bins: Vec<Vec<usize>> = vec![Vec::new(); 360];
    for (v, r) in round.iter().enumerate() {
        bins[bin(r[1])].push(v);
    }
    // How far out the cloth on the head lies in a direction, at a height or above it. On the head: from the ears'
    // height up, where a skull is at its broadest (to the sides at euryon, to the back at opisthocranion). OWN
    // RULE: with the shoulders counted as well, the cape that hangs in under their points was moved too, and
    // where the shoulders' breadth changes fast from one direction to the next, by up to 2 cm against the
    // directions beside it.
    let low = drawn(ears)[1];
    let reach = |deg: f32, y: f32| {
        let span = WEDGE.ceil() as usize + 1;
        (0..=2 * span)
            .flat_map(|b| &bins[(bin(deg) + 360 + b - span) % 360])
            .filter(|&&u| at[u][1] >= y.max(low))
            .map(|&u| (round[u][0], ((round[u][1] - deg + 540.0).rem_euclid(360.0) - 180.0).abs()))
            .filter(|(_, turn)| *turn <= WEDGE)
            .map(|(r, turn)| r - SLOPE * turn)
            .fold(0f32, f32::max)
    };
    let short = |v: usize, y: f32| reach(round[v][1], y) - SLACK - round[v][0];
    let front = drawn(ears)[2] + FRONT;
    let part: Vec<f32> = at.iter().map(|q| c01((front - q[2]) / FADE) * c01((crest - TOP - q[1]) / FADE)).collect();
    let hangs: Vec<bool> = (0..at.len()).map(|v| sheet[v] && part[v] > 0.0 && round[v][0] > 1e-3 && short(v, at[v][1]) > 0.0).collect();
    // How high each of them hangs: the cloth between where it lies on the head and where it lies on the shoulders
    // is drawn out or pushed together evenly, each place where the pull of the places beside it is in balance (a
    // spring's pull goes by its length). Under the back of the head a veil is draped with a pleat, its rings
    // going down, up and down again within half a centimetre, and where the cloth went in under the head it lay
    // level: moved out only, its rings lay on each other in the fall. With them the places next to them, which
    // lie far enough out but among them (in the pleat one stood 13 mm off those round it, alone). Not the
    // cloth's edge: nothing pulls at it from beyond, and it would go up into the cloth.
    let mut sides: Vec<[usize; 2]> =
        of.chunks_exact(3).flat_map(|t| [0, 1, 2].map(|c| [t[c].min(t[(c + 1) % 3]), t[c].max(t[(c + 1) % 3])])).collect();
    sides.sort_unstable();
    let mut edge: Vec<bool> = (0..at.len()).map(|v| beside[v].iter().any(|&u| !sheet[u])).collect();
    for run in sides.chunk_by(|a, b| a == b).filter(|run| run.len() == 1) {
        edge[run[0][0]] = true;
        edge[run[0][1]] = true;
    }
    let mut high: Vec<f32> = at.iter().map(|q| q[1]).collect();
    let free: Vec<usize> = (0..at.len()).filter(|&v| sheet[v] && !edge[v] && part[v] > 0.0 && (hangs[v] || beside[v].iter().any(|&u| hangs[u]))).collect();
    for turn in 0..EVEN {
        let mut even = |v: usize| {
            let (mut sum, mut pull) = (0.0, 0.0);
            for &u in beside[v].iter().filter(|&&u| sheet[u]) {
                let w = 1.0 / apart(u, v).max(1e-4);
                sum += w * high[u];
                pull += w;
            }
            if pull > 0.0 {
                high[v] += OVER * (sum / pull - high[v]);
            }
        };
        if turn % 2 == 0 {
            free.iter().for_each(|&v| even(v));
        } else {
            free.iter().rev().for_each(|&v| even(v));
        }
    }
    // how far each of them is moved: out to where the cloth on the head lies above the height it has now; and a
    // hem's tube as the cloth's edge beside it, ring by ring from the edge
    let mut by: Vec<Option<V3>> = vec![None; at.len()];
    for v in (0..at.len()).filter(|&v| hangs[v] || high[v] != at[v][1]) {
        let out = 1.0 + short(v, high[v]).max(0.0) / round[v][0];
        let to = [axis[0] + (at[v][0] - axis[0]) * out, high[v], axis[1] + (at[v][2] - axis[1]) * out];
        by[v] = Some(std::array::from_fn(|k| part[v] * (to[k] - at[v][k])));
    }
    let mut seen = sheet.clone();
    loop {
        let ring: Vec<(usize, V3)> = (0..at.len())
            .filter(|&v| !seen[v] && beside[v].iter().any(|&u| seen[u]))
            .map(|v| {
                let from: Vec<V3> = beside[v].iter().filter(|&&u| seen[u]).map(|&u| by[u].unwrap_or([0.0; 3])).collect();
                (v, std::array::from_fn(|k| from.iter().map(|d| d[k]).sum::<f32>() / from.len() as f32))
            })
            .collect();
        if ring.is_empty() {
            break;
        }
        for (v, d) in ring {
            seen[v] = true;
            by[v] = (d != [0.0; 3]).then_some(d);
        }
    }
    // The cloth's direction at a place that moved and at the places beside it, from its triangles as they lie
    // now, on the side of them it was on before (a rolled hem's inside faces in). Not on the side it faced
    // before: the middle of a pleat that is drawn out faced the head, and faces away from it now.
    let faces = |pos: &[V3]| {
        let mut faces = vec![[0f32; 3]; at.len()];
        for (t, q) in of.chunks_exact(3).zip(pos.chunks_exact(3)) {
            let (a, b): (V3, V3) = (std::array::from_fn(|k| q[1][k] - q[0][k]), std::array::from_fn(|k| q[2][k] - q[0][k]));
            let g = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
            for &v in t {
                faces[v] = std::array::from_fn(|k| faces[v][k] + g[k]);
            }
        }
        faces
    };
    let before = faces(&veil.pos);
    for (i, &v) in of.iter().enumerate() {
        if let Some(d) = by[v] {
            veil.pos[i] = built(std::array::from_fn(|k| at[v][k] + d[k]));
        }
    }
    if veil.nrm.len() == veil.pos.len() {
        let now = faces(&veil.pos);
        for (i, &v) in of.iter().enumerate() {
            let (old, was, g) = (veil.nrm[i], before[v], now[v]);
            let l = (g[0] * g[0] + g[1] * g[1] + g[2] * g[2]).sqrt();
            if (by[v].is_some() || beside[v].iter().any(|&u| by[u].is_some())) && l > 1e-9 && old != [0.0; 3] {
                let side = if was[0] * old[0] + was[1] * old[1] + was[2] * old[2] < 0.0 { -1.0 } else { 1.0 };
                veil.nrm[i] = g.map(|c| side * c / l);
            }
        }
    }
    hangs.iter().filter(|h| **h).count()
}
