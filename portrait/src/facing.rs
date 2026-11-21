//! (round 148) A hood's facing of fur.
//!
//! A hood that is lined with fur shows the fur where its lining is turned out: along the edge of its opening, round
//! the face of a hood on the head and round the neck of one thrown back. The hoods' files have no such part (they
//! are the villagers' hoods, of wool to the edge), so the facing is laid on the hood here, when everything stands
//! as it is drawn: a roll of fur along the opening's edge, lying on the wool from a little beyond the edge to the
//! facing's breadth within it. The hood itself stays as it is. (Round 164) The fur lies in tufts: the roll's top
//! and rims stand up to `TUFT` over its bed, here more and there less, and the fur between tufts is darker.
//!
//! The opening is found as `tools/portrait/pipeline/dag.py` finds a hood's hems: where the rolled hem's tube hangs
//! on the sheet (`tunic_bind.py`), an edge has more than two triangles; of the hemmed edges the opening's is the one
//! that lies highest (the other is the cape's, which a dagged hood does not have).

use crate::geo::{add, cross, dot, jround, len, lerp, madd, mix, mul, norm, sm, sub, Rgb, Rng, Surface, V3};
use std::collections::HashMap;

/// The facing's breadth on the wool from the opening's edge, how far it reaches beyond that edge (over the hem's
/// tube, whose radius is 0.035: `R_HEM`), and how far the fur stands over the wool and under it (units of 10 cm).
/// PLACEHOLDER, by eye: no source read gives a measure.
pub const BREADTH: f32 = 0.25;
pub const BEYOND: f32 = 0.07;
pub const PILE: f32 = 0.09;
pub const PILE_UNDER: f32 = 0.03;
/// How deep the wool and the hem's tube lie within the fur at least, and how far the fur stands off at most.
pub const CLEAR: f32 = 0.02;
pub const PILE_MOST: f32 = 0.25;
/// How often the edge's way and the roll's lie are evened out along the edge (a hood on the head has a tuck at
/// either corner of the jaw, which a roll of fur lies over), the corners round the roll, how much of the fur's
/// image goes on 10 cm, and how dark the fur is where it lies on the wool. PLACEHOLDER, by eye.
const EVEN: usize = 6;
pub const ROUND: usize = 16;
const IMAGE: f32 = 1.25;
const SHADE: f32 = 0.8;
/// (round 164) The fur lies in tufts: the roll has `FINER` rings for each corner of the edge, a tuft stands up to
/// `TUFT` over the roll's bed, is `TUFT_LONG` long along the edge, `TUFTS_ROUND` of them lie round the roll (an
/// even number: every second row is set off by half a tuft), and the fur between tufts is darker by up to
/// `HOLLOW`. PLACEHOLDER, by eye beside the reference's fur.
pub const FINER: usize = 2;
pub const TUFT: f32 = 0.06;
const TUFT_LONG: f32 = 0.12;
const TUFTS_ROUND: u32 = 8;
pub const HOLLOW: f32 = 0.55;

/// The roll of fur along the edge of `hood`'s opening, drawn with `image` in the colour `fur` (linear). Nothing is
/// returned for a garment without a hemmed edge.
pub fn face(hood: &Surface, image: &str, fur: Rgb) -> Option<Surface> {
    let (of, at) = corners(hood);
    // the hood's own middle: inside the head or the neck, so the wool's outside faces away from it
    let middle = mul(at.iter().fold([0f32; 3], |a, q| add(a, *q)), 1.0 / at.len() as f32);
    let (edge, closed) = opening(&of, &at)?;
    let n = edge.len();
    if n < 8 {
        return None;
    }
    let way: Vec<V3> = edge.iter().map(|&v| at[v]).collect();
    let step = |i: usize, by: isize| -> usize { if closed { (i as isize + by).rem_euclid(n as isize) as usize } else { (i as isize + by).clamp(0, n as isize - 1) as usize } };
    // the wool the roll lies on: the corners that lie about the facing's breadth from the edge, straight through
    // the air
    let pieces: Vec<(V3, V3)> = (0..if closed { n } else { n - 1 }).map(|i| (way[i], way[step(i, 1)])).collect();
    let far: Vec<f32> = at.iter().map(|q| pieces.iter().map(|&(a, b)| off(*q, a, b)).fold(f32::MAX, f32::min)).collect();
    // (from half to twice the breadth: a hood thrown back has no corner nearer than 3 cm at the nape, where its
    // edge is lifted and its sheet stretched)
    let rim: Vec<usize> = (0..at.len()).filter(|&v| (0.5 * BREADTH..2.0 * BREADTH).contains(&far[v])).collect();
    let mut lie: Vec<V3> = way
        .iter()
        .map(|&p| {
            let near: Vec<V3> = rim.iter().map(|&v| sub(at[v], p)).filter(|d| len(*d) < 2.5 * BREADTH).collect();
            mul(near.iter().fold([0f32; 3], |a, d| add(a, *d)), 1.0 / near.len().max(1) as f32)
        })
        .collect();
    let mut way = way;
    let even = |of: &[V3]| -> Vec<V3> { (0..n).map(|i| mul(add(add(of[step(i, -1)], mul(of[i], 2.0)), of[step(i, 1)]), 0.25)).collect() };
    for _ in 0..EVEN {
        (way, lie) = (even(&way), even(&lie));
    }
    // across the roll at each place along the edge: ahead along the edge, into the wool square to the edge, and off
    // the wool on its outside
    let frames: Vec<[V3; 3]> = (0..n)
        .map(|i| {
            let ahead = norm(sub(way[step(i, 1)], way[step(i, -1)]));
            let into = norm(sub(lie[i], mul(ahead, dot(lie[i], ahead))));
            let up = cross(ahead, into);
            [ahead, into, if dot(up, sub(way[i], middle)) < 0.0 { mul(up, -1.0) } else { up }]
        })
        .collect();
    let (half, mid) = ((BREADTH + BEYOND) / 2.0, (BREADTH - BEYOND) / 2.0);
    // how far the fur stands off there: by its pile, and so far that the wool under it and the hem's tube lie
    // `CLEAR` within it (the wool is not flat from the edge to the facing's breadth: it bulges round the head)
    let under: Vec<usize> = (0..at.len()).filter(|&v| far[v] < BREADTH).collect();
    let mut high: Vec<f32> = (0..n)
        .map(|i| {
            let [ahead, into, up] = frames[i];
            under
                .iter()
                .map(|&v| sub(at[v], way[i]))
                .filter(|d| dot(*d, ahead).abs() < 0.15)
                .map(|d| ((dot(d, into) - mid) / half, dot(d, up)))
                .filter(|(across, _)| across.abs() < 0.9)
                .map(|(across, over)| (over + CLEAR) / (1.0 - across * across).sqrt())
                .fold(PILE, f32::max)
                .min(PILE_MOST)
        })
        .collect();
    for _ in 0..2 {
        high = (0..n).map(|i| high[step(i, -1)].max(high[i]).max(high[step(i, 1)])).collect();
    }
    for _ in 0..EVEN {
        high = (0..n).map(|i| (high[step(i, -1)] + 2.0 * high[i] + high[step(i, 1)]) / 4.0).collect();
    }
    // the roll's bed at each place along the edge, `FINER` places for each of its corners: its middle on the edge's
    // way, across it, how thick it is, and how far along the edge it lies
    let places = FINER * if closed { n } else { n - 1 };
    let mut beds: Vec<(V3, V3, V3, f32, f32)> = Vec::with_capacity(places + 1);
    for k in 0..=places {
        let (i, t) = ((k / FINER) % n, (k % FINER) as f32 / FINER as f32);
        let j = step(i, 1);
        let at = mix(way[i], way[j], t);
        let along = beds.last().map_or(0.0, |b| b.4 + len(sub(at, b.0)));
        beds.push((at, norm(mix(frames[i][1], frames[j][1], t)), norm(mix(frames[i][2], frames[j][2], t)), lerp(high[i], high[j], t), along));
    }
    // (a whole number of tufts along an edge that comes round)
    let tufts = jround(beds[places].4 / TUFT_LONG).max(1.0);
    let per = tufts / beds[places].4.max(1e-6);
    let mut s = Surface::new(hood.mat);
    s.tex = Some(image.to_string());
    // a ring of corners round the roll at each place: where the corner lies, where the bed faces there, where it
    // lies in the image, and its colour
    let rings: Vec<Vec<(V3, V3, [f32; 2], Rgb)>> = beds
        .iter()
        .map(|&(at, into, up, high, along)| {
            (0..=ROUND)
                .map(|j| {
                    let a = (j % ROUND) as f32 / ROUND as f32;
                    let (c, h) = ((a * std::f32::consts::TAU).cos(), (a * std::f32::consts::TAU).sin());
                    let tall = if h >= 0.0 { high } else { PILE_UNDER };
                    let face = norm(add(mul(into, c / half), mul(up, h / tall)));
                    // tufts on the roll's top and on both its rims, none under it
                    let stand = tuft(along * per, a * TUFTS_ROUND as f32, tufts as u32) * sm(-0.5, 0.0, h);
                    let q = madd(madd(madd(at, into, mid + half * c), up, tall * h), face, TUFT * stand);
                    let dark = (if h < 0.0 { SHADE } else { 1.0 }) * (1.0 - HOLLOW * (1.0 - stand) * sm(-0.5, 0.0, h));
                    (q, face, [along * IMAGE, j as f32 / ROUND as f32 * 2.0 * (BREADTH + BEYOND) * IMAGE], mul(fur, dark))
                })
                .collect()
        })
        .collect();
    // where the fur faces at each corner: square to its neighbours along the edge and round the roll, on the side
    // the bed faces
    let ring = |k: isize| -> &Vec<(V3, V3, [f32; 2], Rgb)> { &rings[if closed { (k + places as isize) as usize % places } else { k.max(0).min(places as isize) as usize }] };
    let faces: Vec<Vec<V3>> = (0..=places as isize)
        .map(|k| {
            (0..=ROUND)
                .map(|j| {
                    let (before, after) = ((j + ROUND - 1) % ROUND, (j + 1) % ROUND);
                    let face = norm(cross(sub(ring(k + 1)[j].0, ring(k - 1)[j].0), sub(ring(k)[after].0, ring(k)[before].0)));
                    if dot(face, ring(k)[j].1) < 0.0 { mul(face, -1.0) } else { face }
                })
                .collect()
        })
        .collect();
    for k in 0..places {
        for j in 0..ROUND {
            // (wound so that a triangle faces where its corners face: the stage lights a cloth's back as its back)
            let quad = [(k, j), (k + 1, j), (k + 1, j + 1), (k, j + 1)];
            let at = |c: usize| rings[quad[c].0][quad[c].1];
            let turned = dot(cross(sub(at(1).0, at(0).0), sub(at(2).0, at(0).0)), add(at(0).1, at(2).1)) < 0.0;
            for c in if turned { [0, 2, 1, 0, 3, 2] } else { [0, 1, 2, 0, 2, 3] } {
                let (q, _, uv, col) = at(c);
                s.pos.push(q);
                s.nrm.push(faces[quad[c].0][quad[c].1]);
                s.uv.push(uv);
                s.col.push(col);
            }
        }
    }
    Some(s)
}

/// How high the fur's tufts stand at a place `u` tufts along the edge and `v` tufts round the roll, from 0 to 1;
/// `along` tufts come round the edge. Every second row round the roll is set off by half a tuft.
fn tuft(u: f32, v: f32, along: u32) -> f32 {
    let row = |r: f32| -> f32 {
        let r = r as u32 % TUFTS_ROUND;
        let u = u + 0.5 * (r % 2) as f32;
        let at = |i: f32| Rng::new((i as u32 % along) * 7919 + r * 104_729 + 164).next();
        lerp(at(u.floor()), at(u.floor() + 1.0), sm(0.0, 1.0, u - u.floor()))
    };
    lerp(row(v.floor()), row(v.floor() + 1.0), sm(0.0, 1.0, v - v.floor()))
}

/// A hood's corners, each once (a corner of the file is drawn once for each of its triangles, bit for bit): which
/// of them each drawn corner is, and where they lie.
pub(crate) fn corners(hood: &Surface) -> (Vec<usize>, Vec<V3>) {
    let mut ids: HashMap<[u32; 3], usize> = HashMap::new();
    let of: Vec<usize> = hood
        .pos
        .iter()
        .map(|q| {
            let n = ids.len();
            *ids.entry(q.map(f32::to_bits)).or_insert(n)
        })
        .collect();
    let mut at = vec![[0f32; 3]; ids.len()];
    for (i, &v) in of.iter().enumerate() {
        at[v] = hood.pos[i];
    }
    (of, at)
}

/// The edge of a hood's opening, corner after corner along it, and whether it comes round to its beginning: of the
/// edges with more than two triangles, those that hang together and lie highest.
pub(crate) fn opening(of: &[usize], at: &[V3]) -> Option<(Vec<usize>, bool)> {
    let sides = |t: usize| (0..3).map(move |k| (of[t + k].min(of[t + (k + 1) % 3]), of[t + k].max(of[t + (k + 1) % 3])));
    let mut count: HashMap<(usize, usize), u32> = HashMap::new();
    for t in (0..of.len()).step_by(3) {
        for side in sides(t) {
            *count.entry(side).or_insert(0) += 1;
        }
    }
    // a hemmed edge: the same two corners more than twice (taken in the triangles' order, each once)
    let mut next: Vec<Vec<usize>> = vec![Vec::new(); at.len()];
    for t in (0..of.len()).step_by(3) {
        for (a, b) in sides(t) {
            if count.insert((a, b), 0).is_some_and(|n| n > 2) {
                next[a].push(b);
                next[b].push(a);
            }
        }
    }
    // each hem walked from one of its ends, or from its lowest corner when it has none
    let mut seen = vec![false; at.len()];
    let mut best: Option<(f32, Vec<usize>, bool)> = None;
    let ends = (0..at.len()).filter(|&v| next[v].len() == 1);
    for s in ends.chain((0..at.len()).filter(|&v| next[v].len() > 1)) {
        if seen[s] {
            continue;
        }
        let mut walk = vec![s];
        seen[s] = true;
        while let Some(&v) = next[walk[walk.len() - 1]].iter().find(|&&v| !seen[v]) {
            seen[v] = true;
            walk.push(v);
        }
        let closed = walk.len() > 2 && next[walk[walk.len() - 1]].contains(&s);
        let height = walk.iter().map(|&v| at[v][1]).sum::<f32>() / walk.len() as f32;
        if best.as_ref().is_none_or(|b| height > b.0) {
            best = Some((height, walk, closed));
        }
    }
    best.map(|(_, walk, closed)| (walk, closed))
}

/// How far `q` lies from the piece of an edge from `a` to `b`.
fn off(q: V3, a: V3, b: V3) -> f32 {
    let way = sub(b, a);
    let t = (dot(sub(q, a), way) / dot(way, way).max(1e-12)).clamp(0.0, 1.0);
    len(sub(q, madd(a, way, t)))
}
