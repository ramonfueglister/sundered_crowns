//! How a gown is closed in front (round 129). Until then every gown of England was a sack pulled over the head:
//! a plain front from the neck to the picture's foot. A gown that lies on the body is opened to put it on, and
//! closed again down the front: a woman's with a lace through eyelets on both edges or with a row of buttons, a
//! man's (round 131) with a row of buttons.
//!
//! Both are laid on the gown as it lies on the person (after the bust is held, before the body is turned), along
//! the gown's front middle line from under its neckline down: the places are read off the gown's own triangles,
//! so that lace and buttons lie on a broad chest and on a narrow one, and what a veil's fall, a wimple or a hood's
//! cape covers is left out. They are of the gown's cloth and colour (`dress::DressSet::fastens`, where the source
//! is named), and drawn with the gown's image.

use crate::geo::{add, cross, madd, mul, norm, sub, Rgb, Surface, V3};

/// How a gown is closed in front.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Fasten {
    /// Not at all: pulled over the head.
    None,
    /// Edge to edge, with one lace that runs through eyelets on both edges.
    Laced,
    /// With ball buttons of the gown's cloth at the edge of the opening.
    Buttons,
}

/// All lengths in base units of 10 cm.
/// How far under the neckline's edge the first eyelet or button lies, and how far down the front they go at most
/// (the gown hangs to under the waist, build.rs).
pub const BELOW: f32 = 0.16;
pub const LENGTH: f32 = 4.5;
/// From eyelet to eyelet along the edge, how far an eyelet lies from the edge, how far the lace's way across
/// goes down, and how thick the lace is. The first is the source's ("around 2cm"), the others by eye: PLACEHOLDER.
pub const EYELETS: f32 = 0.2;
pub const EYELET_IN: f32 = 0.13;
pub const LACE_SLANT: f32 = 0.07;
pub const LACE: f32 = 0.017;
/// How far the two laced edges stand apart: the linen worn under the gown shows between them. By eye:
/// PLACEHOLDER (the source says nothing on it).
pub const GAP: f32 = 0.05;
/// A button's radius (11 mm across: the English buttons the source lists are 9 to 16 mm) and from button to
/// button (the source: "set very closely together", without a measure; by eye: PLACEHOLDER).
pub const BUTTON: f32 = 0.055;
pub const BUTTONS: f32 = 0.2;
/// The line where the edge with the buttonholes ends beside the buttons, and the shade at each laced edge: its
/// breadth, how far it lies over the gown, and how dark it is (the shade between two layers of cloth).
const EDGE: f32 = 0.018;
const EDGE_OFF: f32 = 0.006;
const EDGE_DARK: f32 = 0.5;
/// How far under the neckline's edge the opening begins to show (the edge is a roll of cloth: on its top a band
/// would stand off it).
const TOP: f32 = 0.03;
/// The step in which the gown's front is read downward.
const STEP: f32 = 0.01;

/// A place on the gown's front: where it is, how the gown faces there, its place in the gown's image and how that
/// place moves with a step to the side and upward, and the gown's colour there.
#[derive(Clone, Copy)]
struct At {
    q: V3,
    n: V3,
    uv: [f32; 2],
    du: [[f32; 2]; 2],
    col: Rgb,
}

/// The gown's triangles that face the front within reach of the middle line, and what covers them.
struct Front<'a> {
    gown: &'a Surface,
    tris: Vec<usize>,
    over: Vec<[V3; 3]>,
}

impl Front<'_> {
    /// Where the line from far in front of the figure at (x, y) meets the gown first.
    fn at(&self, x: f32, y: f32) -> Option<At> {
        let g = self.gown;
        let mut best: Option<At> = None;
        for &t in &self.tris {
            let (a, b, c) = (g.pos[t], g.pos[t + 1], g.pos[t + 2]);
            if y < a[1].min(b[1]).min(c[1]) || y > a[1].max(b[1]).max(c[1]) {
                continue;
            }
            let d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
            if d.abs() < 1e-12 {
                continue;
            }
            let u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
            let v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
            let w = 1.0 - u - v;
            if u < 0.0 || v < 0.0 || w < 0.0 {
                continue;
            }
            let z = u * a[2] + v * b[2] + w * c[2];
            if best.as_ref().is_some_and(|h| h.q[2] >= z) {
                continue;
            }
            let face = norm(cross(sub(b, a), sub(c, a)));
            let n = if g.nrm.len() == g.pos.len() { norm(add(add(mul(g.nrm[t], u), mul(g.nrm[t + 1], v)), mul(g.nrm[t + 2], w))) } else { face };
            let (uv, du) = if g.uv.len() == g.pos.len() {
                let (ta, tb, tc) = (g.uv[t], g.uv[t + 1], g.uv[t + 2]);
                // (the image's place as a function of x and y on this triangle)
                let grad = |k: usize| {
                    let (p, q) = (tb[k] - ta[k], tc[k] - ta[k]);
                    let (e1, e2) = ([b[0] - a[0], b[1] - a[1]], [c[0] - a[0], c[1] - a[1]]);
                    let det = e1[0] * e2[1] - e1[1] * e2[0];
                    [(p * e2[1] - q * e1[1]) / det, (q * e1[0] - p * e2[0]) / det]
                };
                ([u * ta[0] + v * tb[0] + w * tc[0], u * ta[1] + v * tb[1] + w * tc[1]], [grad(0), grad(1)])
            } else {
                ([0.0; 2], [[0.0; 2]; 2])
            };
            let col = add(add(mul(g.col[t], u), mul(g.col[t + 1], v)), mul(g.col[t + 2], w));
            best = Some(At { q: [x, y, z], n: if n[2] > 0.0 { n } else { face }, uv, du, col });
        }
        best
    }

    /// Whether another cloth lies over a place of the gown (a wimple, a veil's fall, a hood's cape).
    fn covered(&self, a: &At) -> bool {
        self.over.iter().any(|t| crate::layers::meets(a.q, a.n, t[0], t[1], t[2]).is_some_and(|d| d > -0.05 && d < 0.6))
    }

    /// The gown's front down the line at `x` beside the middle, from the height `from`: a place every `STEP` of
    /// height, each with how far down the cloth it lies from the first, until the gown ends or `length` is gone.
    fn line(&self, x: f32, from: f32, length: f32) -> Vec<(f32, At)> {
        let (mut out, mut y, mut gone, mut missed): (Vec<(f32, At)>, f32, f32, u32) = (Vec::new(), from, 0.0, 0);
        while gone < length && missed < 8 {
            match self.at(x, y) {
                Some(a) => {
                    if let Some((_, last)) = out.last() {
                        gone += crate::geo::len(sub(a.q, last.q));
                    }
                    out.push((gone, a));
                    missed = 0;
                }
                None => missed += 1,
            }
            y -= STEP;
        }
        out
    }
}

/// The place `s` down a line (between the two read places beside it).
fn along(line: &[(f32, At)], s: f32) -> Option<At> {
    let k = line.iter().position(|(d, _)| *d >= s)?;
    let (d1, b) = line[k];
    if k == 0 {
        return Some(b);
    }
    let (d0, a) = line[k - 1];
    let t = if d1 > d0 { (s - d0) / (d1 - d0) } else { 0.0 };
    let l2 = |p: [f32; 2], q: [f32; 2]| [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    Some(At { q: crate::geo::mix(a.q, b.q, t), n: norm(crate::geo::mix(a.n, b.n, t)), uv: l2(a.uv, b.uv), du: b.du, col: crate::geo::mix(a.col, b.col, t) })
}

/// One corner of the fastening: at `q`, facing `n`, drawn with the gown's image as it lies at `a`, `by` to the
/// side and upward of it in the cloth (a ball or a cord has cloth all round, and each corner its own place in the
/// image: with the corners' places taken from where they stand before the gown, the cloth of a side seen edge-on
/// had no breadth in the image, and the stage, which reads the weave's relief by how the image lies on a
/// triangle, drew such triangles black).
fn put(out: &mut Surface, a: &At, q: V3, n: V3, by: [f32; 2], shade: f32) {
    out.pos.push(q);
    out.nrm.push(n);
    out.col.push(mul(a.col, shade));
    out.uv.push([a.uv[0] + a.du[0][0] * by[0] + a.du[0][1] * by[1], a.uv[1] + a.du[1][0] * by[0] + a.du[1][1] * by[1]]);
}

/// A ball of 80 triangles: the icosahedron, each face divided in four.
fn ball() -> Vec<[V3; 3]> {
    let (v, f) = crate::geo::icosahedron();
    let mid = |a: V3, b: V3| norm(add(a, b));
    let mut out = Vec::with_capacity(80);
    for t in f {
        let (a, b, c) = (v[t[0]], v[t[1]], v[t[2]]);
        let (ab, bc, ca) = (mid(a, b), mid(b, c), mid(c, a));
        out.extend([[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]);
    }
    out
}

/// A round cord through `pts` (each with the direction the gown faces there), `r` thick, six-sided; its cloth
/// laid round it from the side that lies on the gown.
fn cord(out: &mut Surface, a: &At, pts: &[(V3, V3)], r: f32) {
    const SIDES: usize = 6;
    let ring = |k: usize| -> Vec<(V3, V3, [f32; 2])> {
        let (q, up) = pts[k];
        let way = norm(sub(pts[(k + 1).min(pts.len() - 1)].0, pts[k.saturating_sub(1)].0));
        let side = norm(cross(way, up));
        let up = cross(side, way);
        (0..=SIDES)
            .map(|i| {
                // (from under the cord round its top and under it again)
                let t = (i as f32 / SIDES as f32 - 0.5) * std::f32::consts::TAU;
                let n = sub(mul(up, t.cos()), mul(side, t.sin()));
                (madd(q, n, r), n, [q[0] - a.q[0] - side[0] * r * t, q[1] - a.q[1] - side[1] * r * t])
            })
            .collect()
    };
    let rings: Vec<Vec<(V3, V3, [f32; 2])>> = (0..pts.len()).map(ring).collect();
    for w in rings.windows(2) {
        for i in 0..SIDES {
            for (q, n, by) in [w[0][i], w[1][i + 1], w[0][i + 1], w[0][i], w[1][i], w[1][i + 1]] {
                put(out, a, q, n, by, 1.0);
            }
        }
    }
}

/// A narrow band down the gown, just over it: `wide` across, its middle `aside` of the line, between the places
/// `s0` and `s1` down the line, left out where another cloth covers the gown. Drawn with the gown's image and
/// `shade` of its colour, or in `linen` (the colour, with places in the image by the band's place alone).
fn band(out: &mut Surface, f: &Front, line: &[(f32, At)], s0: f32, s1: f32, aside: f32, wide: f32, shade: f32, linen: Option<Rgb>) {
    let mut last: Option<At> = None;
    let mut s = s0;
    while s <= s1 {
        let Some(a) = along(line, s) else { break };
        let here = (!f.covered(&a)).then_some(a);
        // (round 142: and left out between two places where the gown faces opposite ways, the underside of the
        // neck's rolled edge and the cloth under it: a piece laid across them was wound against its corners)
        if let (Some(p), Some(q)) = (last, here.filter(|q| last.is_none_or(|p| crate::geo::dot(p.n, q.n) > 0.0))) {
            for (a, side) in [(&p, -1.0), (&q, -1.0), (&q, 1.0), (&p, -1.0), (&q, 1.0), (&p, 1.0)] {
                let c = add(madd(a.q, a.n, EDGE_OFF), [aside + side * wide / 2.0, 0.0, 0.0]);
                match linen {
                    Some(col) => {
                        out.pos.push(c);
                        out.nrm.push(a.n);
                        out.col.push(mul(col, shade));
                        out.uv.push([c[0] * 0.5, c[1] * 0.5]);
                    }
                    None => put(out, a, c, a.n, [c[0] - a.q[0], c[1] - a.q[1]], shade),
                }
            }
        }
        last = here;
        s += 0.04;
    }
}

/// The lace or the buttons of a gown, as surfaces: one of the gown's cloth and, between laced edges, one of the
/// linen under it. Empty where the gown has no front at the middle line `x` below the height `from`, or where all
/// of it is covered.
/// `gown`: its triangles as they lie on the person; `over`: the cloths that may lie over it; `behind`: a depth
/// behind the chest's skin and in front of the nape (the rolled edge of the neckline at the nape faces the front
/// too); `under`: the image and the colour of the linen worn under the gown.
pub fn fasten(gown: &Surface, over: &[&Surface], under: Option<(String, Rgb)>, kind: Fasten, x: f32, from: f32, behind: f32) -> Vec<Surface> {
    if kind == Fasten::None {
        return Vec::new();
    }
    const REACH: f32 = 0.4;
    let near = |t: &[V3]| t.iter().any(|q| (q[0] - x).abs() < REACH) && t.iter().all(|q| q[2] > behind) && cross(sub(t[1], t[0]), sub(t[2], t[0]))[2] > 0.0;
    let f = Front {
        gown,
        tris: (0..gown.pos.len() / 3).map(|t| t * 3).filter(|&t| near(&gown.pos[t..t + 3])).collect(),
        over: over.iter().flat_map(|s| s.pos.chunks_exact(3)).filter(|t| t.iter().any(|q| (q[0] - x).abs() < 2.0 * REACH)).map(|t| [t[0], t[1], t[2]]).collect(),
    };
    // the neckline's edge at the middle: the first height below `from` where the gown faces the front squarely
    let mut top = from;
    while top > from - 6.0 && !f.at(x, top).is_some_and(|a| a.n[2] > 0.5) {
        top -= STEP;
    }
    let mid = f.line(x, top, BELOW + LENGTH);
    let end = mid.last().map_or(0.0, |m| m.0);
    if end < BELOW + 2.0 * EYELETS {
        return Vec::new();
    }
    let mut out = Surface::new(gown.mat);
    (out.tex, out.nmap) = (gown.tex.clone(), gown.nmap.clone());
    let mut linen = Surface::new(gown.mat);
    match kind {
        Fasten::None => {}
        Fasten::Laced => {
            // the two edges stand a little apart and the linen under the gown shows between them, in each edge's
            // shade
            if let Some((image, col)) = under {
                linen.tex = Some(image);
                band(&mut linen, &f, &mid, TOP, end, 0.0, GAP, 0.8, Some(col));
            }
            // the lace's ways across them (each 36 triangles), each from an eyelet on the wearer's right down to the next on her
            // left (one lace run through both edges in a spiral: what shows are its ways across, all slanting
            // alike; back it goes under the cloth)
            let mut s = BELOW;
            while s + LACE_SLANT <= end {
                let places = (along(&mid, s), along(&mid, s + LACE_SLANT / 2.0), along(&mid, s + LACE_SLANT));
                if let (Some(hi), Some(m), Some(lo)) = places {
                    if let (Some(a), Some(b), false) = (f.at(x - EYELET_IN, hi.q[1]), f.at(x + EYELET_IN, lo.q[1]), f.covered(&m)) {
                        // (out of one eyelet, over both edges, into the other)
                        let over = |e: &At| madd(crate::geo::mix(e.q, m.q, 0.35), m.n, 1.6 * LACE);
                        cord(&mut out, &m, &[(madd(a.q, a.n, -LACE), a.n), (over(&a), m.n), (over(&b), m.n), (madd(b.q, b.n, -LACE), b.n)], LACE);
                    }
                }
                s += EYELETS;
            }
            // (after the lace, as after the buttons: the surface begins with them, each a piece of its own)
            for side in [-1.0, 1.0] {
                band(&mut out, &f, &mid, TOP, end, side * (GAP + EDGE) / 2.0, EDGE, EDGE_DARK, None);
            }
        }
        Fasten::Buttons => {
            // the buttons stand at the edge of the opening (each 80 triangles); the edge with the buttonholes ends
            // beside them
            let shape = ball();
            let mut s = BELOW;
            while s <= end {
                if let Some(a) = along(&mid, s).filter(|a| !f.covered(a)) {
                    let c = madd(a.q, a.n, 0.6 * BUTTON);
                    // (the button's cloth drawn together behind it: each corner as far from the middle of the
                    // cloth as it lies round the ball from the ball's front)
                    let e1 = norm(cross([0.0, 1.0, 0.0], a.n));
                    let e2 = cross(a.n, e1);
                    for t in &shape {
                        for n in t {
                            let round = crate::geo::dot(*n, a.n).clamp(-1.0, 1.0).acos();
                            let (px, py) = (crate::geo::dot(*n, e1), crate::geo::dot(*n, e2));
                            let k = BUTTON * round / px.hypot(py).max(1e-6);
                            put(&mut out, &a, madd(c, *n, BUTTON), *n, [px * k, py * k], 1.0);
                        }
                    }
                }
                s += BUTTONS;
            }
            band(&mut out, &f, &mid, TOP, end, BUTTON + EDGE, EDGE, EDGE_DARK, None);
        }
    }
    [out, linen].into_iter().filter(|s| !s.pos.is_empty()).collect()
}
