//! (round 145) A mantle's facing of fur and its clasp.
//!
//! The mantle is one sheet (`tools/portrait/pipeline/mantle.py`): the builder carries, calms, lifts and poses it
//! as one cloth. Its file marks the triangles of the facing, the fur the mantle is lined with turned out along
//! both front edges and round the neck, and on either front edge the place where a brooch sits: by whole numbers
//! added to a triangle's place across the image, which repeats with every whole number (`MARK` for fur, twice
//! that under a brooch). Here, when everything stands as it is drawn, the sheet is taken apart into its cloth and
//! its fur, the fur is given its pile (round 165, pile.rs), and the clasp is laid on it: a brooch of gold with a
//! stone on either edge and a cord from one to the other, drawn taut over the gown between them.

use crate::geo::{add, cross, dot, len, madd, mul, norm, sub, Mat, Rgb, Surface, V3};

/// What is added to a fur triangle's place across the image.
pub const MARK: f32 = 64.0;
/// A brooch: its radius, how far its middle stands over the fur, how far its rim is sunk into it, and the radius
/// of its stone (units of 10 cm). PLACEHOLDER, by eye.
pub const BROOCH: f32 = 0.16;
pub const BROOCH_UP: f32 = 0.05;
pub const BROOCH_IN: f32 = 0.03;
pub const STONE: f32 = 0.065;
/// The cord: how thick, how far over the gown it runs, and how far it hangs between the brooches. PLACEHOLDER.
pub const CORD: f32 = 0.028;
pub const CORD_OFF: f32 = 0.03;
pub const CORD_SAG: f32 = 0.04;

/// What `face` draws with.
pub struct Facing {
    /// The fur's image.
    pub image: String,
    /// The colours of the mantle's cloth, of its fur, of the clasp's gold, stone and cord (linear).
    pub cloth: Rgb,
    pub fur: Rgb,
    pub gold: Rgb,
    pub stone: Rgb,
    pub cord: Rgb,
}

/// Takes the mantle (`sheet`, drawn white) apart: its cloth stays in `sheet`, dyed; returned are its fur and, where
/// the file marks two brooches, the clasp's gold, stone and cord. `under`: what the cord has to run over (the gown
/// and the linen at its neck).
pub fn face(sheet: &mut Surface, under: &[&Surface], f: &Facing) -> Vec<Surface> {
    let mut fur = Surface::new(sheet.mat);
    fur.tex = Some(f.image.clone());
    let mut cloth = Surface::new(sheet.mat);
    cloth.tex = sheet.tex.clone();
    cloth.nmap = sheet.nmap.clone();
    // (which of the fur's triangles lie under a brooch)
    let mut marked: Vec<bool> = Vec::new();
    for t in (0..sheet.pos.len()).step_by(3) {
        let kind = (sheet.uv[t][0] / MARK).round().max(0.0);
        let (to, dye) = if kind > 0.0 { (&mut fur, f.fur) } else { (&mut cloth, f.cloth) };
        for i in t..t + 3 {
            to.pos.push(sheet.pos[i]);
            to.nrm.push(sheet.nrm[i]);
            to.uv.push([sheet.uv[i][0] - kind * MARK, sheet.uv[i][1]]);
            to.col.push(std::array::from_fn(|c| sheet.col[i][c] * dye[c]));
        }
        if kind > 0.0 {
            marked.push(kind > 1.0);
        }
    }
    *sheet = cloth;
    // (round 165) the fur's pile; a brooch sits on the fur as it lies then (four triangles for each of the file's)
    crate::pile::raise(&mut fur);
    let mut marks: Vec<(V3, V3)> = (0..fur.pos.len()).filter(|i| marked[i / 12]).map(|i| (fur.pos[i], fur.nrm[i])).collect();
    let mut out = vec![fur];
    // the two brooches: the marked corners fall into two heaps, one on either front edge
    marks.sort_by(|a, b| a.0[0].total_cmp(&b.0[0]));
    let Some(cut) = (1..marks.len()).max_by(|&a, &b| (marks[a].0[0] - marks[a - 1].0[0]).total_cmp(&(marks[b].0[0] - marks[b - 1].0[0]))) else { return out };
    if cut < 3 || marks.len() - cut < 3 {
        return out;
    }
    let at = |m: &[(V3, V3)]| -> (V3, V3) {
        let (mut c, mut n) = ([0f32; 3], [0f32; 3]);
        for (q, d) in m {
            c = add(c, *q);
            n = add(n, norm(*d));
        }
        (mul(c, 1.0 / m.len() as f32), norm(n))
    };
    let ends = [at(&marks[..cut]), at(&marks[cut..])];
    let mut gold = Surface::new(crate::fasten::METAL);
    let mut stone = Surface::new(Mat { rough: 0.12, metal: 0.0, double: false });
    for (c, n) in ends {
        brooch(&mut gold, &mut stone, c, n, f);
    }
    // the cord: from one brooch's middle to the other's, taut over what lies between them
    let (a, b) = (madd(ends[0].0, ends[0].1, BROOCH_UP), madd(ends[1].0, ends[1].1, BROOCH_UP));
    let way = sub(b, a);
    let span = len(way);
    let front = norm(sub(add(ends[0].1, ends[1].1), mul(way, dot(add(ends[0].1, ends[1].1), way) / (span * span).max(1e-9))));
    let down = norm(cross(way, front));
    const N: usize = 24;
    // how far in front of the line the gown stands, by the place along it
    let mut high = [f32::MIN; N + 1];
    high[0] = 0.0;
    high[N] = 0.0;
    for s in under {
        for q in &s.pos {
            let d = sub(*q, a);
            let t = dot(d, way) / (span * span).max(1e-9);
            if t <= 0.04 || t >= 0.96 || dot(d, down).abs() > 0.1 {
                continue;
            }
            let k = (t * N as f32).round() as usize;
            let z = dot(d, front);
            if z > -0.4 {
                high[k] = high[k].max(z + CORD_OFF + CORD);
            }
        }
    }
    // a taut cord: the upper hull of those heights
    let mut hull: Vec<usize> = Vec::new();
    for k in (0..=N).filter(|&k| high[k] > f32::MIN) {
        while hull.len() > 1 {
            let (i, j) = (hull[hull.len() - 2], hull[hull.len() - 1]);
            if (high[j] - high[i]) * (k - i) as f32 <= (high[k] - high[i]) * (j - i) as f32 {
                hull.pop();
            } else {
                break;
            }
        }
        hull.push(k);
    }
    let line: Vec<(V3, V3)> = (0..=N)
        .map(|k| {
            let j = hull.iter().position(|&h| h >= k).unwrap_or(hull.len() - 1).max(1);
            let (i0, i1) = (hull[j - 1], hull[j]);
            let h = high[i0] + (high[i1] - high[i0]) * (k - i0) as f32 / (i1 - i0).max(1) as f32;
            let t = k as f32 / N as f32;
            (madd(madd(madd(a, way, t), front, h), down, CORD_SAG * 4.0 * t * (1.0 - t)), front)
        })
        .collect();
    let mut cord = Surface::new(Mat { rough: 0.6, metal: 0.0, double: false });
    tube(&mut cord, &line, CORD, f.cord);
    out.extend([gold, stone, cord]);
    out
}

/// A brooch at `c` on a surface that faces `n`: a round boss of gold, its rim sunk into the fur, and a stone in
/// its middle.
fn brooch(gold: &mut Surface, stone: &mut Surface, c: V3, n: V3, f: &Facing) {
    const SIDES: usize = 20;
    let side = norm(cross(n, if n[1].abs() < 0.9 { [0.0, 1.0, 0.0] } else { [1.0, 0.0, 0.0] }));
    let up = cross(n, side);
    // rings from the rim, sunk in, over a rounded edge to a shallow dome
    let rings: [(f32, f32); 6] = [(1.0, -BROOCH_IN), (1.0, 0.45 * BROOCH_UP), (0.9, 0.8 * BROOCH_UP), (0.62, 0.72 * BROOCH_UP), (0.5, 0.9 * BROOCH_UP), (0.0, BROOCH_UP)];
    // each corner with where the boss faces there (a round boss, not one of flat bands)
    let at = |r: usize, k: usize| -> (V3, V3) {
        let t = k as f32 / SIDES as f32 * std::f32::consts::TAU;
        let out = add(mul(side, t.cos()), mul(up, t.sin()));
        let (lo, hi) = (rings[r.saturating_sub(1)], rings[(r + 1).min(rings.len() - 1)]);
        let (dr, dz) = ((hi.0 - lo.0) * BROOCH, hi.1 - lo.1);
        let face = if rings[r].0 == 0.0 { n } else { norm(add(mul(out, dz), mul(n, -dr))) };
        (madd(madd(c, out, BROOCH * rings[r].0), n, rings[r].1), face)
    };
    for r in 0..rings.len() - 1 {
        for k in 0..SIDES {
            let (a, b, a1, b1) = (at(r, k), at(r, k + 1), at(r + 1, k), at(r + 1, k + 1));
            let quad: &[(V3, V3)] = if r + 2 < rings.len() { &[a, b, b1, a, b1, a1] } else { &[a, b, b1] };
            for (q, g) in quad {
                gold.pos.push(*q);
                gold.nrm.push(*g);
                gold.col.push(f.gold);
            }
        }
    }
    // the stone: the upper part of a ball
    let frame = |q: V3| -> V3 { madd(madd(madd(madd(c, n, 0.8 * BROOCH_UP), side, STONE * q[0]), up, STONE * q[1]), n, STONE * q[2]) };
    for t in crate::fasten::ball() {
        let t = t.map(norm);
        if t[0][2] + t[1][2] + t[2][2] < -0.6 {
            continue;
        }
        for q in t {
            stone.pos.push(frame(q));
            stone.nrm.push(norm(add(add(mul(side, q[0]), mul(up, q[1])), mul(n, q[2]))));
            stone.col.push(f.stone);
        }
    }
}

/// A round cord through `line` (each place with the direction it lies off the body), `r` thick, eight-sided.
fn tube(out: &mut Surface, line: &[(V3, V3)], r: f32, col: Rgb) {
    const SIDES: usize = 8;
    let ring = |k: usize| -> Vec<(V3, V3)> {
        let (q, off) = line[k];
        let way = norm(sub(line[(k + 1).min(line.len() - 1)].0, line[k.saturating_sub(1)].0));
        let side = norm(cross(way, off));
        let up = cross(side, way);
        (0..=SIDES)
            .map(|i| {
                let t = i as f32 / SIDES as f32 * std::f32::consts::TAU;
                let n = add(mul(up, t.cos()), mul(side, t.sin()));
                (madd(q, n, r), n)
            })
            .collect()
    };
    let rings: Vec<Vec<(V3, V3)>> = (0..line.len()).map(ring).collect();
    for w in rings.windows(2) {
        for i in 0..SIDES {
            for (q, n) in [w[0][i], w[0][i + 1], w[1][i + 1], w[0][i], w[1][i + 1], w[1][i]] {
                out.pos.push(q);
                out.nrm.push(n);
                out.col.push(col);
            }
        }
    }
}
