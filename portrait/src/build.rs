//! The portrait's geometry (the Werkstatt's `morph` and `build`, ported):
//! the MakeHuman head morphed by the genes, age, mood and life; skin with
//! lips, brows, stubble, wrinkles and scars; eyes; men's hair as strands
//! with a growth direction; beards as sculpted masses in a cylinder grid
//! around the head axis; women's hair as wavy strand bands from the middle
//! parting to a bun, braid or veil; clothing as shells over the body;
//! headwear and jewellery by stand.

use crate::caster::Caster;
use crate::geo::*;
use crate::head::{Head, DELTA_SCALE};
use crate::look::*;
use std::f32::consts::PI;

const D2R: f32 = PI / 180.0;

/// Levels of detail of the body: about 1400, 3000, 6000 and 11160
/// triangles.
pub const LODS: usize = 4;

pub struct Portrait {
    /// One per material.
    pub surfaces: Vec<Surface>,
    /// Frame: the top of the head (or hat), the chin, and the head's centre
    /// in x and z.
    pub top: f32,
    pub chin: f32,
    pub cx: f32,
    pub cz: f32,
    /// Share of the picture's height the head fills: 0.53, more for a
    /// small child, whose short body would otherwise end inside the picture.
    pub fill: f32,
    pub tris: usize,
    /// Morph targets in use.
    pub targets: usize,
}

/// JavaScript's Math.round.
fn jround(x: f32) -> f32 {
    (x + 0.5).floor()
}

/// The morphed head and shoulders, for measuring faces (examples/face_measure.rs).
pub fn morph_test(h: &Head, p: &Look) -> Vec<V3> {
    morph(h, p).0
}

fn morph(h: &Head, p: &Look) -> (Vec<V3>, usize) {
    let mut pp = h.base.clone();
    let mut used = 0;
    let mut add = |name: &str, w: f32| {
        if w <= 1e-3 {
            return;
        }
        let Some(t) = h.targets.get(name) else { return };
        used += 1;
        let k = w * DELTA_SCALE;
        for (j, &i) in t.ids.iter().enumerate() {
            let d = t.d[j];
            let v = &mut pp[i as usize];
            v[0] += d[0] as f32 * k;
            v[1] += d[1] as f32 * k;
            v[2] += d[2] as f32 * k;
        }
    };
    // macro targets: sex × age × base type, sex × age × muscle × weight
    let yrs = p.age;
    let a = if yrs < 11.0 {
        (yrs - 1.0) / 10.0 * 0.1875
    } else if yrs < 25.0 {
        0.1875 + (yrs - 11.0) / 14.0 * 0.3125
    } else {
        (0.5 + (yrs - 25.0) / 65.0 * 0.5).min(1.0)
    };
    let age_w: Vec<(&str, f32)> = if a < 0.1875 {
        // MakeHuman's baby at one year, its child at eleven; the baby at
        // most two thirds, more puts a snout on the face and folds the arms
        // into the chest
        let baby = c01(1.0 - a / 0.1875) * 0.65;
        vec![("baby", baby), ("child", 1.0 - baby)]
    } else if a < 0.5 {
        vec![("child", 1.0 - (a - 0.1875) / 0.3125), ("young", (a - 0.1875) / 0.3125)]
    } else {
        vec![("young", 1.0 - (a - 0.5) * 2.0), ("old", (a - 0.5) * 2.0)]
    };
    let tri = |v: f32| -> Vec<(&str, f32)> {
        if v < 0.5 {
            vec![("min", 1.0 - 2.0 * v), ("average", 2.0 * v)]
        } else {
            vec![("average", 1.0 - (v - 0.5) * 2.0), ("max", (v - 0.5) * 2.0)]
        }
    };
    let (mu, wt) = (tri(p.phen(MUSCLE)), tri(p.phen(WEIGHT)));
    let (ea, eb, ec) = (p.g(TYP_A), p.g(TYP_B), p.g(TYP_C));
    let es = ea + eb + ec + 1e-3;
    let eth = [("african", ea / es), ("asian", eb / es), ("caucasian", ec / es)];
    let gen = if p.female { "female" } else { "male" };
    for &(ag, aw) in &age_w {
        for &(e, ew) in &eth {
            add(&format!("macrodetails/{e}-{gen}-{ag}"), aw * ew);
        }
        for &(m, mw) in &mu {
            for &(w, ww) in &wt {
                add(&format!("macrodetails/universal-{gen}-{ag}-{m}muscle-{w}weight"), aw * mw * ww);
            }
        }
    }
    // face
    // the real look (crate::real, or APOLEIA_FACE_MODULES alone): face genes
    // as factors of a face space;
    // APOLEIA_FACE_GAIN scales all of it (1.6: Ramon 31.10., recognisable
    // at portrait size; Rhodes et al., 1987, caricature advantage, not verified online)
    // (only the person's own genes go through the face space; a child's
    // face keeps its single targets, KID)
    let modules = crate::real::on("APOLEIA_FACE_MODULES");
    if modules {
        let gain: f32 = std::env::var("APOLEIA_FACE_GAIN").ok().and_then(|v| v.parse().ok()).unwrap_or(1.6);
        let gr = p.grown();
        // outliers softened: c·tanh(x/c) leaves a gene one spread from the
        // middle nearly as it is (-9 %) and pulls the far ends in (2 spreads
        // -27 %, 3 spreads -43 %) (Ramon 31.10. "etwas zurücknehmen"; c PLACEHOLDER)
        let soft: f32 = std::env::var("APOLEIA_FACE_SOFT").ok().and_then(|v| v.parse().ok()).unwrap_or(0.35);
        // the genes' parts summed per target first (several genes pull on the
        // same target), then each sum softened above `lim`: MakeHuman's
        // targets are made for 0..1, far past that they turn into caricature
        // (lim·tanh(v/lim), lim 1 PLACEHOLDER: 0.3 -3 %, 0.85 -19 %, 1.4 -> 0.89)
        let lim: f32 = std::env::var("APOLEIA_FACE_LIM").ok().and_then(|v| v.parse().ok()).unwrap_or(1.0);
        let mut sums: Vec<(&str, &str, &str, f32)> = Vec::new();
        for (k, loads) in FACE_MOD.iter().enumerate() {
            let xl = (p.g(k) - 128.0) / 127.0;
            let xl = if soft > 0.0 { soft * (xl / soft).tanh() } else { xl };
            let x = xl * (0.35 + 0.65 * gr) * gain;
            for &(n, lo, hi, w) in loads.iter() {
                let v = if !n.is_empty() && lo.is_empty() { (x * w).max(0.0) } else { x * w };
                match sums.iter_mut().find(|e| e.0 == n && e.1 == lo && e.2 == hi) {
                    Some(e) => e.3 += v,
                    None => sums.push((n, lo, hi, v)),
                }
            }
        }
        let dbg = std::env::var_os("APOLEIA_FACE_DEBUG").is_some();
        for (n, lo, hi, v) in sums {
            let v = if lim > 0.0 { lim * (v / lim).tanh() } else { v };
            if dbg && v.abs() > 0.6 {
                eprintln!("face target {n} {lo}/{hi}: {v:.2}");
            }
            if n.is_empty() {
                add(if v < 0.0 { "head/head-oval" } else { "head/head-square" }, v.abs() * 0.8);
            } else if lo.is_empty() {
                add(n, v.max(0.0));
            } else {
                let suf = if v < 0.0 { lo } else { hi };
                if n.contains('#') {
                    add(&format!("{}-{suf}", n.replace('#', "l")), v.abs());
                    add(&format!("{}-{suf}", n.replace('#', "r")), v.abs());
                } else {
                    add(&format!("{n}-{suf}"), v.abs());
                }
            }
        }
    }
    for (k, &(names, lo, hi)) in FACE.iter().enumerate() {
        let x = if modules { KID[k] * (1.0 - p.grown()) } else { p.face(k) };
        if names.is_empty() {
            if x < 0.0 {
                add("head/head-oval", -x * 0.8);
            } else {
                add("head/head-square", x * 0.8);
            }
            continue;
        }
        let list: Vec<String> = if names.len() == 1 && names[0].contains('#') {
            vec![names[0].replace('#', "l"), names[0].replace('#', "r")]
        } else {
            names.iter().map(|s| s.to_string()).collect()
        };
        for n in list {
            if x < 0.0 {
                add(&format!("{n}-{lo}"), -x);
            } else {
                add(&format!("{n}-{hi}"), x);
            }
        }
    }
    // children: a young, round head, full cheeks, open eyes
    let kid = 1.0 - p.grown();
    add("head/head-age-decr", kid * 0.8);
    add("head/head-round", kid * 0.4);
    add("eyebrows/eyebrows-trans-up", kid * 0.3);
    add("mouth/mouth-angles-up", kid * 0.5);
    add("mouth/mouth-lowerlip-volume-decr", kid * 0.3);
    for sd in ["l", "r"] {
        add(&format!("cheek/{sd}-cheek-volume-incr"), kid * 0.3);
        add(&format!("eyes/{sd}-eye-height2-incr"), kid * 0.4);
    }
    // age: thinner lips, the head a little lowered; ears and nose keep
    // growing, the tip of the nose sinks (Heathcote, 1995; Sforza et al.,
    // 2011; the weights eyeballed)
    let old = c01((yrs - 50.0) / 30.0);
    if old > 0.0 {
        add("mouth/mouth-upperlip-volume-decr", old * 0.5);
        add("mouth/mouth-lowerlip-volume-decr", old * 0.3);
        add("head/head-age-incr", old * 0.6);
    }
    let older = c01((yrs - 40.0) / 45.0);
    if older > 0.0 {
        for sd in ["l", "r"] {
            add(&format!("ears/{sd}-ear-scale-incr"), older * 0.5);
        }
        add("nose/nose-scale-vert-incr", older * 0.3);
        add("nose/nose-point-down", older * 0.4);
    }
    // real look: the soft tissue sinks with age. Fat in the midface thins and
    // slides down, bags form under the eyes, the brow and the upper lid sag,
    // the mouth corners drop, jowls and a soft double chin form (Coleman &
    // Grover, 2006; Mendelson & Wong, 2012; not verified online). From about
    // 38, full at 80; weights PLACEHOLDER
    let sag = c01((yrs - 38.0) / 42.0);
    if sag > 0.0 && crate::real::dir("APOLEIA_REAL").is_some() {
        for sd in ["l", "r"] {
            add(&format!("eyes/{sd}-eye-bag-incr"), sag * 0.7);
            add(&format!("eyes/{sd}-eye-bag-height-incr"), sag * 0.35);
            add(&format!("eyes/{sd}-eye-height1-decr"), sag * 0.3);
            add(&format!("cheek/{sd}-cheek-volume-decr"), sag * 0.45);
            add(&format!("cheek/{sd}-cheek-trans-down"), sag * 0.45);
        }
        add("eyebrows/eyebrows-trans-down", sag * 0.25);
        add("mouth/mouth-angles-down", sag * 0.3);
        add("neck/neck-double-incr", sag * 0.6);
    }
    let mood: &[(&str, f32)] = match p.mood {
        // a gentle closed-mouth smile: the corners up and a little apart,
        // the cheeks lifted (Ramon 31.10.: corners up 0.9 read as a smirk)
        Mood::Content => &[("mouth/mouth-angles-up", 0.45), ("mouth/mouth-scale-horiz-incr", 0.1), ("eyebrows/eyebrows-angle-up", 0.1), ("cheek/l-cheek-trans-up", 0.3), ("cheek/r-cheek-trans-up", 0.3)],
        Mood::Grim => &[("eyebrows/eyebrows-trans-down", 0.5), ("eyebrows/eyebrows-angle-down", 0.8), ("mouth/mouth-angles-down", 0.4), ("mouth/mouth-scale-vert-decr", 0.4)],
        // sad brows: the middle up, slanting (the angle alone at 0.9 pulled
        // the brow's tail down past the eye corner)
        Mood::Sad => &[("eyebrows/eyebrows-angle-up", 0.35), ("eyebrows/eyebrows-trans-up", 0.5), ("mouth/mouth-angles-down", 0.8), ("mouth/mouth-lowerlip-ext-up", 0.3)],
        Mood::Neutral => &[],
    };
    for &(n, w) in mood {
        add(n, w * 1.7);
    }
    // life: hunger hollows cheeks and temples, illness gives eye bags
    let l = p.life;
    let hung = c01((0.42 - l.food) / 0.42);
    if hung > 0.0 {
        for sd in ["l", "r"] {
            add(&format!("cheek/{sd}-cheek-volume-decr"), hung * 2.2);
            add(&format!("cheek/{sd}-cheek-bones-incr"), hung * 1.1);
            add(&format!("eyes/{sd}-eye-bag-incr"), hung * 0.6);
        }
        add("forehead/forehead-temple-decr", hung * 1.4);
        add("neck/neck-scale-horiz-decr", hung * 0.5);
    }
    // illness and mourning (sleepless, weeping) give eye bags
    if l.ill + l.mourn > 0.0 {
        for sd in ["l", "r"] {
            add(&format!("eyes/{sd}-eye-bag-incr"), l.ill * 0.7 + l.mourn * 0.5);
        }
    }
    // arms down from the A pose, softly weighted around the shoulder joint
    for sg in [1.0f32, -1.0] {
        let (mut px, mut py, mut n) = (0f32, 0f32, 0);
        for i in 0..h.n {
            let (bx, by) = (h.base[i][0] * sg, h.base[i][1]);
            if bx > 1.58 && bx < 1.78 && by > 4.95 && by < 5.55 {
                px += pp[i][0];
                py += pp[i][1];
                n += 1;
            }
        }
        if n == 0 {
            continue;
        }
        px /= n as f32;
        py /= n as f32;
        let ang = -sg * 0.66;
        for i in 0..h.n {
            let bx = h.base[i][0] * sg;
            if bx < 1.3 {
                continue;
            }
            let t = c01((bx - 1.3) / 0.5);
            let w = t * t * (3.0 - 2.0 * t);
            let (cs, sn) = ((ang * w).cos(), (ang * w).sin());
            let (dx, dy) = (pp[i][0] - px, pp[i][1] - py);
            pp[i][0] = px + dx * cs - dy * sn;
            pp[i][1] = py + dx * sn + dy * cs;
        }
    }
    (pp, used)
}

/// Area-weighted vertex normals over the triangles `idx`.
fn vnormals(p: &[V3], idx: &[u32]) -> Vec<V3> {
    let mut n = vec![[0f32; 3]; p.len()];
    for f in idx.chunks_exact(3) {
        let (a, b, c) = (f[0] as usize, f[1] as usize, f[2] as usize);
        let x = cross(sub(p[b], p[a]), sub(p[c], p[a]));
        for i in [a, b, c] {
            n[i] = add(n[i], x);
        }
    }
    n.iter().map(|&v| if len(v) > 0.0 { norm(v) } else { v }).collect()
}

/// A point on the morphed skin, with its normal.
struct Spot {
    p: V3,
    n: V3,
}

/// Everything the parts share while one portrait is built.
struct Ctx<'a> {
    h: &'a Head,
    pp: Vec<V3>,
    rng: Rng,
}

impl<'a> Ctx<'a> {
    fn base_c(&self, a: u32, b: u32, c: u32) -> V3 {
        let bs = &self.h.base;
        mul(add(add(bs[a as usize], bs[b as usize]), bs[c as usize]), 1.0 / 3.0)
    }

    fn mask3(m: &[f32], a: u32, b: u32, c: u32) -> f32 {
        (m[a as usize] + m[b as usize] + m[c as usize]) / 3.0
    }

    /// One facet per triangle of `idx` that passes `filter` (on the base
    /// centroid), coloured by `color`, each vertex moved `off` along `nor`.
    fn facets(&self, out: &mut Surface, idx: &[u32], filter: &dyn Fn(V3, u32, u32, u32) -> bool, color: &mut dyn FnMut(V3, u32, u32, u32) -> Rgb, off: Option<(&[V3], &dyn Fn(u32) -> f32)>) {
        for f in idx.chunks_exact(3) {
            let (a, b, c) = (f[0], f[1], f[2]);
            let cb = self.base_c(a, b, c);
            if !filter(cb, a, b, c) {
                continue;
            }
            let col = linear(color(cb, a, b, c));
            for v in [a, b, c] {
                let mut q = self.pp[v as usize];
                if let Some((nor, o)) = off {
                    let d = o(v);
                    if d != 0.0 {
                        q = madd(q, nor[v as usize], d);
                    }
                }
                out.pos.push(q);
                out.col.push(col);
            }
        }
    }

    /// Random points on the morphed skin of the triangles passing `filter`,
    /// `density` per unit of area.
    fn sample(&mut self, filter: &dyn Fn(V3, u32, u32, u32) -> bool, density: f32) -> Vec<Spot> {
        let mut out = Vec::new();
        let body = self.h.body_full();
        for f in body.chunks_exact(3) {
            let (a, b, c) = (f[0], f[1], f[2]);
            let cb = self.base_c(a, b, c);
            if !filter(cb, a, b, c) {
                continue;
            }
            let (pa, pb, pc) = (self.pp[a as usize], self.pp[b as usize], self.pp[c as usize]);
            let n = cross(sub(pb, pa), sub(pc, pa));
            let area = len(n) / 2.0;
            let n = norm(n);
            let k = density * area;
            let cnt = k.floor() as usize + if self.rng.next() < k.fract() { 1 } else { 0 };
            for _ in 0..cnt {
                let (mut u, mut v) = (self.rng.next(), self.rng.next());
                if u + v > 1.0 {
                    u = 1.0 - u;
                    v = 1.0 - v;
                }
                let w = 1.0 - u - v;
                out.push(Spot { p: madd(madd(mul(pa, w), pb, u), pc, v), n });
            }
        }
        out
    }
}

/// A tapered, bent triangular prism rooted on the skin at `r` (normal `n`),
/// growing along `dir`.
#[allow(clippy::too_many_arguments)]
fn strand(out: &mut Surface, r: V3, n: V3, dir: V3, ln: f32, w: f32, h: f32, col: Rgb, arch: f32, tip_shade: f32) {
    let mut d = madd(dir, n, -dot(dir, n));
    if dot(d, d) < 1e-6 {
        d = [0.0, -1.0, 0.0];
    }
    let d = norm(d);
    let sd = norm(cross(n, d));
    let root = madd(r, n, -0.012);
    let mid = madd(madd(root, d, ln * 0.55), n, ln * arch);
    let d2 = norm(madd(d, n, -arch * 0.9 - 0.18));
    let tip = madd(madd(mid, d2, ln * 0.5), n, -ln * arch * 0.15);
    let ring = |c: V3, ww: f32, hh: f32| [madd(c, sd, ww), madd(c, sd, -ww), madd(madd(c, n, hh), sd, ww * 0.15)];
    let (r0, r1) = (ring(root, w, h), ring(mid, w * 0.62, h * 0.7));
    let (c0, c1, c2) = (cmul(col, 0.8), col, cmul(col, tip_shade));
    for i in 0..3 {
        let j = (i + 1) % 3;
        out.put(r0[i], c0);
        out.put(r0[j], c0);
        out.put(r1[j], c1);
        out.put(r0[i], c0);
        out.put(r1[j], c1);
        out.put(r1[i], c1);
        out.put(r1[i], c1);
        out.put(r1[j], c1);
        out.put(tip, c2);
    }
}

/// A sculpted mass (beard, moustache) in the cylinder grid around the head
/// axis: columns from `f0` to `f1` degrees, rows from `top` to `bot`.
struct Sculpt<'a> {
    f0: f32,
    f1: f32,
    rows: usize,
    bands: usize,
    blen: f32,
    tuft_h: f32,
    conv: f32,
    slant: f32,
    taper: f32,
    depth: f32,
    ridge: f32,
    wave: f32,
    wave_f: f32,
    chest_t: f32,
    col: &'a dyn Fn(f32) -> Rgb,
    cw: &'a [usize],
    pinch: f32,
    drift: f32,
    jit: f32,
    top: &'a dyn Fn(f32) -> f32,
    bot: &'a dyn Fn(f32, f32, f32) -> f32,
    thick: &'a dyn Fn(f32, f32, f32) -> f32,
}

/// The skin's radius around the beard axis, by angle and height.
struct Raster {
    rs: Vec<f32>,
    f0: f32,
    fs: f32,
    nf: usize,
    ya: f32,
    ys: f32,
    ny: usize,
}

impl Raster {
    fn at(&self, f: f32, y: f32) -> f32 {
        let fi = c01((f - self.f0) / self.fs / (self.nf - 1) as f32) * (self.nf - 1) as f32;
        let yj = c01((y - self.ya) / self.ys / (self.ny - 1) as f32) * (self.ny - 1) as f32;
        let i = (fi.floor() as usize).min(self.nf - 2);
        let j = (yj.floor() as usize).min(self.ny - 2);
        let (u, w) = (fi - i as f32, yj - j as f32);
        let r = |i: usize, j: usize| self.rs[i * self.ny + j];
        (r(i, j) * (1.0 - u) + r(i + 1, j) * u) * (1.0 - w) + (r(i, j + 1) * (1.0 - u) + r(i + 1, j + 1) * u) * w
    }
}

#[allow(clippy::too_many_arguments)]
fn sculpt(out: &mut Surface, rng: &mut Rng, o: &Sculpt, rs: &Raster, zc: f32, cols: f32, hs: f32, ym60: f32) {
    let nc = 3.max(jround((o.f1 - o.f0) / cols) as i32 | 1) as usize;
    let nr = o.rows;
    struct Cl {
        s: usize,
        w: usize,
        r: f32,
        d: f32,
    }
    // tufts: 2–4 columns make one lock; its edges are grooves, the middle a
    // ridge that ends in a point at the bottom
    let mut cl: Vec<Cl> = Vec::new();
    let mut s0 = 0;
    while s0 < nc - 1 {
        let mut w = o.cw[((rng.next() * o.cw.len() as f32) as usize).min(o.cw.len() - 1)];
        if s0 + w > nc - 1 {
            w = nc - 1 - s0;
        }
        let r = rng.next();
        let d = rng.next() - 0.5;
        cl.push(Cl { s: s0, w, r, d });
        s0 += w;
    }
    let cl_of = |ci: usize| cl.iter().find(|c| ci >= c.s && ci <= c.s + c.w).unwrap_or(cl.last().unwrap());
    let f_at = |ci: f32| o.f0 + (o.f1 - o.f0) * ci / (nc - 1) as f32;
    let sgn = |x: f32| if x > 0.0 { 1.0 } else if x < 0.0 { -1.0 } else { 0.0 };
    let (mut fr, mut bk, mut po, mut nrm) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for ci in 0..nc {
        let f = f_at(ci as f32);
        let a = f.abs();
        let sg = sgn(f);
        let c = cl_of(ci);
        let pos = 2.0 * (ci as f32 - c.s as f32) / c.w as f32 - 1.0;
        let ap = pos.abs();
        let fc0 = f_at(c.s as f32 + c.w as f32 / 2.0);
        let yt = (o.top)(a);
        let yb = (o.bot)(a, ap, c.r).min(yt - 0.04 * hs);
        let prof = 1.0 - 1.7 * ap * ap;
        let (mut fc, mut bc, mut nr_) = (Vec::new(), Vec::new(), Vec::new());
        let (mut rr, mut yp) = (-9f32, yt);
        for ri in 0..=nr {
            let v = ri as f32 / nr as f32;
            let y = yt + (yb - yt) * v;
            let cv = 1.0 - o.conv * sm(0.3, 1.0, v);
            let mut fv = f * cv + sg * o.slant * v;
            if ap < 0.99 {
                fv = lerp(fv, fc0 * cv + sgn(fc0) * o.slant * v, o.pinch * sm(0.55, 1.0, v));
            }
            fv += c.d * o.drift * sm(0.25, 1.0, v);
            let s = rs.at(fv, y);
            let mut rf = s + (o.thick)(a, v, yt - y) * hs;
            if y < ym60 {
                rf = rf.max(s + o.chest_t);
            }
            if ri > 0 {
                rf = rf.max(rr - o.taper * (yp - y));
            }
            rr = rf;
            yp = y;
            let r_f = rf + (o.ridge * (0.6 + 0.7 * c.r) * prof + o.wave * (v * o.wave_f + c.s as f32 * 1.9).sin()) * sm(0.0, 0.3, v) + (rng.next() - 0.5) * o.jit;
            let dep = o.depth * (1.0 - 0.8 * sm(0.7, 1.0, v)) + 0.008;
            let r_b = (r_f - 0.008).min((s - 0.014).max(r_f - dep));
            let (sn, cs) = ((fv * D2R).sin(), (fv * D2R).cos());
            fc.push([r_f * sn, y, zc + r_f * cs]);
            bc.push([r_b * sn, y, zc + r_b * cs]);
            nr_.push([sn, 0.0, cs]);
        }
        fr.push(fc);
        bk.push(bc);
        po.push(ap);
        nrm.push(nr_);
    }
    for ci in 0..nc - 1 {
        let lit = 0.7 + 0.32 * (1.0 - (po[ci] + po[ci + 1]) / 2.0);
        for ri in 0..nr {
            let v = (ri as f32 + 0.5) / nr as f32;
            let yy = (fr[ci][ri][1] + fr[ci + 1][ri + 1][1]) / 2.0;
            let base = cmul((o.col)(yy), lit * (0.8 + 0.2 * sm(0.0, 0.35, v)) * (0.92 + 0.14 * rng.next()));
            out.tri(fr[ci][ri], fr[ci + 1][ri], fr[ci + 1][ri + 1], base);
            out.tri(fr[ci][ri], fr[ci + 1][ri + 1], fr[ci][ri + 1], cmul(base, 0.97));
            let dk = cmul(base, 0.5);
            out.tri(bk[ci][ri], bk[ci + 1][ri + 1], bk[ci + 1][ri], dk);
            out.tri(bk[ci][ri], bk[ci][ri + 1], bk[ci + 1][ri + 1], dk);
        }
    }
    for ci in 0..nc - 1 {
        for ri in [0, nr] {
            let dk = cmul((o.col)(fr[ci][ri][1]), if ri > 0 { 0.68 } else { 0.62 });
            out.tri(fr[ci][ri], bk[ci][ri], bk[ci + 1][ri], dk);
            out.tri(fr[ci][ri], bk[ci + 1][ri], fr[ci + 1][ri], dk);
        }
    }
    for ci in [0, nc - 1] {
        for ri in 0..nr {
            let dk = cmul((o.col)(fr[ci][ri][1]), 0.72);
            out.tri(fr[ci][ri], bk[ci][ri], bk[ci][ri + 1], dk);
            out.tri(fr[ci][ri], bk[ci][ri + 1], fr[ci][ri + 1], dk);
        }
    }
    // shingle tufts: per lock and layer a flat point with a middle ridge,
    // staggered like roof tiles
    let up = |q: V3, n: V3, h: f32| [q[0] + n[0] * h, q[1], q[2] + n[2] * h];
    if o.bands > 0 {
        for (k, c) in cl.iter().enumerate() {
            let cc = c.s + jround(c.w as f32 / 2.0) as usize;
            for b in 0..o.bands {
                let v0 = (b as f32 + (k % 2) as f32 * 0.5 + 0.15 * (c.r - 0.5)) / o.bands as f32;
                if v0 > 0.92 {
                    continue;
                }
                let r0 = jround(v0 * nr as f32).max(0.0) as usize;
                let r1 = (nr as f32).min((r0 as f32 + 1.0).max(jround((v0 + o.blen / o.bands as f32) * nr as f32))) as usize;
                let rm = (r0 + r1) >> 1;
                let h = o.tuft_h * (0.7 + 0.6 * rng.next()) * if r0 > 0 { 1.0 } else { 0.5 };
                let l = up(fr[c.s][r0], nrm[c.s][r0], 0.004);
                let rr = up(fr[c.s + c.w][r0], nrm[c.s + c.w][r0], 0.004);
                let m = up(fr[cc][rm], nrm[cc][rm], h);
                let tp = up(fr[cc][r1], nrm[cc][r1], h * 0.35);
                let col = cmul((o.col)(m[1]), 0.98 + 0.16 * rng.next());
                out.tri(l, m, tp, col);
                out.tri(m, rr, tp, cmul(col, 0.94));
                out.tri(l, rr, m, cmul(col, 0.6));
            }
        }
    }
}

/// The skin seen from the head's centre along `d`: the farthest hit, since
/// the nearest can lie inside the head (the eye sockets), unless the
/// farthest is already the shoulder (more than 1.2 head sizes out); -1 when
/// nothing is hit.
fn outer_skin(cast: &Caster, d: V3, hs: f32) -> f32 {
    let (near, far) = (cast.cast(d, false), cast.cast(d, true));
    if far > 1.2 * hs {
        near
    } else {
        far
    }
}

/// Short hair as a sculpted cap, like the beard (Ramon, 31.10.2026: strands
/// read as noise at portrait size): a shell with real thickness over the
/// skull, cut into locks combed from the crown forward and down, each a
/// ridge with grooves at its edges, pinched to a point at the hairline, as
/// the comma-shaped locks of Tetrarchic and Constantinian portraits. Wavy
/// hair waves along the lock, curly hair is a thicker shell under curls.
/// `bald` (0..1.7) takes the front back and then the crown; `hidden` drops
/// what a hat covers.
#[allow(clippy::too_many_arguments)]
fn cap_hair(out: &mut Surface, rng: &mut Rng, cast: &Caster, hc: V3, hs: f32, hair: Rgb, curl: f32, bald: f32, age: f32, ear: (f32, f32, f32), hidden: &dyn Fn(V3) -> bool) {
    let dd = |th: f32, el: f32| [(el * D2R).cos() * (th * D2R).sin(), (el * D2R).sin(), (el * D2R).cos() * (th * D2R).cos()];
    let skin = |d: V3| {
        let r = outer_skin(cast, d, hs);
        if r > 0.0 {
            r
        } else {
            0.9 * hs
        }
    };
    let slerp = |a: V3, b: V3, t: f32| {
        let c = dot(a, b).clamp(-1.0, 1.0);
        let w = c.acos();
        if w < 1e-4 {
            return a;
        }
        let s = w.sin();
        norm(add(mul(a, ((1.0 - t) * w).sin() / s), mul(b, (t * w).sin() / s)))
    };
    // the hairline's height (degrees above the head's centre) by the angle
    // from the front; it recedes at the temples first, then in front
    let rec = c01((bald - 0.25) / 0.9);
    // (temple corners, sideburns in front of the ear, over the ear, nape)
    let (e0, e1, et) = ear;
    let line: [(f32, f32); 13] = [
        (0.0, 20.0 + 12.0 * rec),
        (25.0, 18.0 + 18.0 * rec),
        (40.0, 8.0 + 14.0 * rec),
        (e0 - 9.0, -8.0 + 8.0 * rec),
        (e0 - 5.0, -26.0 + 10.0 * rec),
        (e0 - 2.0, -33.0 + 10.0 * rec),
        (e0 + 2.0, et - 2.0),
        (e0 + 6.0, et + 2.0),
        (e1 - 4.0, et + 2.0),
        (e1 + 8.0, -16.0),
        (e1 + 22.0, -32.0),
        (150.0, -42.0),
        (180.0, -48.0),
    ];
    let hairline = |th: f32| {
        let a = th.abs().min(180.0);
        let k = line.iter().position(|q| q.0 >= a).unwrap_or(line.len() - 1).max(1);
        let (p0, p1) = (line[k - 1], line[k]);
        lerp(p0.1, p1.1, (a - p0.0) / (p1.0 - p0.0))
    };
    // the crown goes bald from the top down
    let top_bald = if bald > 0.4 { 92.0 - (bald - 0.4) * 78.0 } else { 999.0 };
    let whorl = norm(dd(180.0, 56.0));
    let kid = c01(age / 4.0);
    let thick = (0.055 + 0.03 * rng.next() + 0.045 * curl) * hs * lerp(0.35, 1.0, kid);
    let ridge_h = 0.032 * hs * (1.0 - sm(0.55, 0.85, curl)) * lerp(0.4, 1.0, kid);
    let wave = 0.014 * hs * sm(0.25, 0.55, curl) * (1.0 - sm(0.7, 0.9, curl));
    let (nc, nr) = (96usize, 12usize);
    // locks of two to four columns, from the back round to the back
    struct Lock {
        s: usize,
        w: usize,
        r: f32,
        d: f32,
    }
    let mut locks = Vec::new();
    let mut s0 = 0;
    while s0 < nc {
        let w = [3, 4, 4, 5, 6][((rng.next() * 5.0) as usize).min(4)].min(nc - s0);
        locks.push(Lock { s: s0, w, r: rng.next(), d: rng.next() - 0.5 });
        s0 += w;
    }
    let lock_of = |ci: usize| locks.iter().find(|l| ci >= l.s && ci <= l.s + l.w).unwrap_or(locks.last().unwrap());
    let th_of = |ci: f32| -180.0 + 360.0 * ci / nc as f32;
    let mut fr = vec![vec![[0f32; 3]; nr + 1]; nc + 1];
    let mut sk = fr.clone();
    let mut ok = vec![vec![false; nr + 1]; nc + 1];
    let mut lit = vec![0f32; nc + 1];
    for ci in 0..=nc {
        let l = lock_of(ci.min(nc - 1));
        let l = if ci == nc { &locks[0] } else { l };
        let cpos = if ci == nc { 0.0 } else { ci as f32 - l.s as f32 };
        let pos = 2.0 * cpos / l.w as f32 - 1.0;
        lit[ci] = 0.72 + 0.3 * (1.0 - pos.abs());
        let th = th_of(ci as f32);
        let thm = th_of(l.s as f32 + l.w as f32 / 2.0);
        // the lock's middle reaches below the hairline, most in front: the
        // point of a comma lock on the forehead; each lock ends a little
        // higher or lower and leans a little aside
        let tip = lerp(9.0, 3.0, sm(30.0, 80.0, thm.abs())) * (0.7 + 0.6 * l.r);
        let lean = l.d * lerp(10.0, 4.0, sm(30.0, 80.0, thm.abs()));
        for ri in 0..=nr {
            let v = ri as f32 / nr as f32;
            // towards its end the lock narrows to its middle (sideways
            // only, so that sideburns and the line over the ear stay)
            let tv = lerp(th, thm, 0.8 * sm(0.62, 1.0, v)) + lean * sm(0.3, 1.0, v);
            let tgt = norm(dd(tv, hairline(tv) - tip * (1.0 - pos * pos) + 2.0 * l.d));
            let d = slerp(whorl, tgt, v);
            let s = skin(d);
            let el = d[1].asin() / D2R;
            let tn = (thick * (1.0 - 0.75 * sm(0.5, 1.0, v))).max(0.014 * hs) + ridge_h * (0.6 + 0.7 * l.r) * (1.0 - pos * pos) * sm(0.0, 0.3, v) + wave * (v * 9.0 + l.s as f32 * 1.9).sin() * sm(0.1, 0.4, v) + (rng.next() - 0.5) * 0.004 * hs;
            let q = madd(hc, d, s + tn);
            fr[ci][ri] = q;
            sk[ci][ri] = madd(hc, d, s - 0.004 * hs);
            ok[ci][ri] = !(el > top_bald && th.abs() < 165.0) && !hidden(q);
        }
    }
    // no islands: below the first bald row from the end up, all is bald
    for row in ok.iter_mut() {
        if let Some(last) = (0..=nr).rev().find(|&ri| !row[ri]) {
            row[..=last].iter_mut().for_each(|o| *o = false);
        }
        if row.iter().filter(|&&o| o).count() < 4 {
            row.iter_mut().for_each(|o| *o = false);
        }
    }
    let col = |ci: usize, ri: usize, v: f32, rng: &mut Rng| cmul(hair, (lit[ci] + lit[ci + 1]) / 2.0 * (0.8 + 0.2 * sm(0.0, 0.35, v)) * (0.92 + 0.14 * rng.next()) * if ri.is_multiple_of(2) { 1.0 } else { 0.97 });
    for ci in 0..nc {
        for ri in 0..nr {
            if !(ok[ci][ri] && ok[ci + 1][ri] && ok[ci][ri + 1] && ok[ci + 1][ri + 1]) {
                continue;
            }
            let v = (ri as f32 + 0.5) / nr as f32;
            let c = col(ci, ri, v, rng);
            out.tri(fr[ci][ri], fr[ci + 1][ri + 1], fr[ci + 1][ri], c);
            out.tri(fr[ci][ri], fr[ci][ri + 1], fr[ci + 1][ri + 1], cmul(c, 0.97));
            // the edge where the hair ends: at the hairline, and towards a
            // bald crown above
            let dk = cmul(hair, 0.62);
            if ri + 1 < nr && !(ok[ci][ri + 2] && ok[ci + 1][ri + 2]) {
                let r1 = ri + 1;
                out.tri(fr[ci][r1], sk[ci][r1], sk[ci + 1][r1], dk);
                out.tri(fr[ci][r1], sk[ci + 1][r1], fr[ci + 1][r1], dk);
            }
            if ri > 0 && !(ok[ci][ri - 1] && ok[ci + 1][ri - 1]) {
                out.tri(fr[ci][ri], fr[ci + 1][ri], sk[ci + 1][ri], dk);
                out.tri(fr[ci][ri], sk[ci + 1][ri], sk[ci][ri], dk);
            }
        }
    }
    // curls on the shell
    if curl > 0.6 {
        let ico = icosahedron();
        let share = sm(0.6, 0.9, curl);
        for (ci, ri) in (0..nc).step_by(3).flat_map(|ci| (1..nr).map(move |ri| (ci, ri))) {
            let ci = (ci + (ri % 2) + (rng.next() * 2.0) as usize).min(nc - 1);
            if !ok[ci][ri] || rng.next() > share {
                continue;
            }
            let q = fr[ci][ri];
            let nd = norm(sub(q, hc));
            let r = (0.05 + 0.03 * rng.next()) * hs * lerp(0.5, 1.0, kid) * lerp(1.0, 0.7, ri as f32 / nr as f32);
            let m = euler(rng.next() * 3.0, rng.next() * 3.0, 0.0);
            solid(out, &ico, madd(q, nd, 0.25 * r), [r, r * 0.8, r], &m, cmul(hair, 0.82 + 0.25 * rng.next()));
        }
    }
}

/// Ellipse-free polyhedron put down at `c`, radius `r`, rotated by `m`,
/// scaled per axis by `s`.
fn solid(out: &mut Surface, shape: &(Vec<V3>, Vec<[usize; 3]>), c: V3, s: V3, m: &[V3; 3], col: Rgb) {
    let (v, f) = shape;
    let w: Vec<V3> = v.iter().map(|q| add(c, rot(m, [q[0] * s[0], q[1] * s[1], q[2] * s[2]]))).collect();
    for t in f {
        out.tri(w[t[0]], w[t[1]], w[t[2]], col);
    }
}

/// A small octahedron (jewel, pearl, chain link).
fn gem(out: &mut Surface, c: V3, r: f32, col: Rgb) {
    let v = [[r, 0.0, 0.0], [-r, 0.0, 0.0], [0.0, r, 0.0], [0.0, -r, 0.0], [0.0, 0.0, r], [0.0, 0.0, -r]].map(|o| add(c, o));
    for [a, b, d] in [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]] {
        out.tri(v[a], v[b], v[d], col);
    }
}

/// Builds the portrait of `p` at level of detail `lod` (0..LODS).
/// Real look: the skin smooth and textured (APOLEIA_REAL names the folder with
/// uvs.txt and skin_<age>_<sex>.png): each vertex the mean colour of its
/// facets, normals averaged, the UVs of the base mesh (at a seam the corner
/// UVs that lie closest together).
#[allow(clippy::too_many_arguments)]
fn real_skin(s: &mut Surface, idx: &[u32], pp: &[V3], dir: &str, age: f32, female: bool, hair: Rgb, scalp_file: Option<String>, sun: f32, seed: u32) {
    let Some(rows) = crate::real::rows(&format!("{dir}/uvs.txt")) else { return };
    let uvs: Vec<Vec<[f32; 2]>> = rows.iter().map(|f| f.chunks_exact(2).map(|c| [c[0], 1.0 - c[1]]).collect()).collect();
    if s.pos.len() != idx.len() {
        return;
    }
    let n = pp.len();
    let (mut acc, mut wsum) = (vec![[0f32; 3]; n], vec![0f32; n]);
    for (k, f) in idx.chunks_exact(3).enumerate() {
        let a = 0.5 * len(cross(sub(pp[f[1] as usize], pp[f[0] as usize]), sub(pp[f[2] as usize], pp[f[0] as usize])));
        let c = s.col[3 * k];
        for &v in f {
            acc[v as usize] = madd(acc[v as usize], c, a);
            wsum[v as usize] += a;
        }
    }
    let nrm = vnormals(pp, idx);
    // real look: the facets' colours softened over the neighbouring vertices, so
    // that lips, brows and wrinkles fade into the skin instead of ending at
    // a facet's edge (APOLEIA_SKIN_SOFT passes, PLACEHOLDER 2)
    let soft: usize = std::env::var("APOLEIA_SKIN_SOFT").ok().and_then(|v| v.parse().ok()).unwrap_or(2);
    if soft > 0 {
        let mut nbv: Vec<Vec<u32>> = vec![Vec::new(); n];
        for f in idx.chunks_exact(3) {
            for j in 0..3 {
                let (a, b) = (f[j] as usize, f[(j + 1) % 3]);
                if !nbv[a].contains(&b) {
                    nbv[a].push(b);
                }
                if !nbv[b as usize].contains(&f[j]) {
                    nbv[b as usize].push(f[j]);
                }
            }
        }
        let mut cv: Vec<V3> = (0..n).map(|v| mul(acc[v], 1.0 / wsum[v].max(1e-9))).collect();
        for _ in 0..soft {
            let prev = cv.clone();
            for v in 0..n {
                if nbv[v].is_empty() || wsum[v] <= 0.0 {
                    continue;
                }
                let mut m = [0f32; 3];
                let mut k = 0.0;
                for &q in &nbv[v] {
                    if wsum[q as usize] > 0.0 {
                        m = add(m, prev[q as usize]);
                        k += 1.0;
                    }
                }
                if k > 0.0 {
                    cv[v] = mix(prev[v], mul(m, 1.0 / k), 0.5);
                }
            }
        }
        for v in 0..n {
            acc[v] = mul(cv[v], wsum[v]);
        }
    }
    // real look: the scalp under hair cards darkened towards the hair's colour
    let scalp: Vec<f32> = scalp_file.or_else(|| std::env::var("APOLEIA_REAL_SCALP").ok()).map(|f| crate::real::column(&f, 0.0)).unwrap_or_default();
    let hl = mul(linear(hair), 0.55);
    // real look: shade in the eye sockets, nostrils, mouth corners and ear folds
    // (skin_ao.txt, per vertex of the base head); PLACEHOLDER strength
    let ao: Vec<f32> = crate::real::column(&format!("{dir}/skin_ao.txt"), 1.0);
    let ao_k: f32 = std::env::var("APOLEIA_SKIN_AO").ok().and_then(|v| v.parse().ok()).unwrap_or(0.7);
    // real look: blood under thin skin, nose, cheeks, ears and chin a little
    // redder (skin_red.txt, 0..1 per vertex); haemoglobin takes green and
    // blue away (after Jimenez et al., 2010, not verified online). Strength
    // PLACEHOLDER: weaker on dark skin, where melanin hides it, a little
    // more on old men (weathered, broken veins)
    let red: Vec<f32> = crate::real::column(&format!("{dir}/skin_red.txt"), 0.0);
    let red_k: f32 = std::env::var("APOLEIA_SKIN_RED").ok().and_then(|v| v.parse().ok()).unwrap_or(0.6) * if female { 1.0 } else { 1.0 + 0.5 * ((age - 40.0) / 30.0).clamp(0.0, 1.0) };
    // real look: age wrinkles. A "wrinkle age": years in the sun add some (the
    // weathered farmer looks older than the scribe of his age), and people
    // differ by a few years (PLACEHOLDER 14 and 4 years)
    let wage = age + 14.0 * (sun - 0.5) + 4.0 * (Rng::new(seed ^ 0x7f4a_7c15).next() * 2.0 - 1.0);
    // each line group (wrinkle_lines.txt: onset, span, depth men, women, shade)
    // deepens with the wrinkle age; its broad fold darkens the skin
    // continuously (wrinkle_fold.txt, one column per group and vertex), the
    // crisp crease comes from the normal map below
    let groups = crate::real::rows(&format!("{dir}/wrinkle_lines.txt"));
    let folds = crate::real::rows(&format!("{dir}/wrinkle_fold.txt"));
    let gdepth: Vec<f32> = groups
        .as_ref()
        .map(|g| g.iter().map(|r| if r.len() < 5 { 0.0 } else { (if female { r[3] } else { r[2] }) * c01((wage - r[0]) / r[1]).powf(0.7) * r[4] }).collect())
        .unwrap_or_default();
    // texture mean 0.88 in sRGB is about 0.755 in linear light
    let lift = 1.0 / 0.755;
    s.uv.clear();
    s.nrm.clear();
    for (k, f) in idx.chunks_exact(3).enumerate() {
        let none = vec![[0f32, 0.0]];
        let l: Vec<&Vec<[f32; 2]>> = f.iter().map(|&v| uvs.get(v as usize).filter(|u| !u.is_empty()).unwrap_or(&none)).collect();
        let mut best = ([0f32; 2], [0f32; 2], [0f32; 2]);
        let mut bd = f32::MAX;
        for &a in l[0] {
            for &b in l[1] {
                for &c in l[2] {
                    let d = (a[0] - b[0]).hypot(a[1] - b[1]) + (b[0] - c[0]).hypot(b[1] - c[1]) + (c[0] - a[0]).hypot(c[1] - a[1]);
                    if d < bd {
                        bd = d;
                        best = (a, b, c);
                    }
                }
            }
        }
        for (j, &v) in f.iter().enumerate() {
            let mut c = mul(acc[v as usize], 1.0 / wsum[v as usize].max(1e-9));
            if let Some(&m) = scalp.get(v as usize) {
                // (only darker: under grey or white hair the scalp stays skin)
                c = mix(c, [c[0].min(hl[0]), c[1].min(hl[1]), c[2].min(hl[2])], 0.8 * m);
            }
            if let Some(&r) = red.get(v as usize) {
                let lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
                let k = r * red_k * (lum / 0.35).clamp(0.15, 1.0);
                c = [c[0], c[1] * (1.0 - 0.45 * k), c[2] * (1.0 - 0.4 * k)];
            }
            if let Some(&a) = ao.get(v as usize) {
                c = mul(c, 1.0 - ao_k * (1.0 - a.max(0.0)).powf(1.3));
            }
            if let Some(fv) = folds.as_ref().and_then(|f| f.get(v as usize)) {
                let dark: f32 = fv.iter().zip(&gdepth).map(|(w, d)| w * d).sum();
                c = mul(c, 1.0 - dark.min(0.5));
            }
            s.col[3 * k + j] = [(c[0] * lift).min(1.0), (c[1] * lift).min(1.0), (c[2] * lift).min(1.0)];
            s.nrm.push(nrm[v as usize]);
        }
        s.uv.extend([best.0, best.1, best.2]);
    }
    let a = if age < 30.0 { "young" } else if age < 55.0 { "middleage" } else { "old" };
    let sex = if female { "female" } else { "male" };
    s.tex = Some(crate::real::image(dir, &format!("skin_{a}_{sex}")));
    // the pores with the creases of the nearest wrinkle age below, in steps
    // of 8 years from 38 (skin_<age>_<sex>_w<E>_n); younger: pores only
    s.nmap = (0..7)
        .map(|k| 86 - 8 * k)
        .filter(|&e| e as f32 <= wage)
        .map(|e| crate::real::image(dir, &format!("skin_{a}_{sex}_w{e}_n")))
        .find(|f| crate::real::has(f));
}

/// Real look: which hairstyle (Blender cards) a person wears, when
/// APOLEIA_MH_DIR names a folder of converted hairs (name.txt, name.png);
/// APOLEIA_MH_MEN / APOLEIA_MH_WOMEN list names, one picked by the seed.
fn mh_pick(p: &Look, long_hair: bool) -> Option<(String, String)> {
    let dir = crate::real::dir("APOLEIA_MH_DIR")?;
    // APOLEIA_MH_AUTO: the style from the person's genes, age, sex and stand
    if crate::real::on("APOLEIA_MH_AUTO") {
        let r = Rng::new(p.seed ^ 0x2545_f491).next();
        let name = if p.age < 7.0 {
            // small children: short loose hair
            "crop01"
        } else if long_hair {
            match p.hair_style() {
                Hair::Braid => "braid01",
                Hair::Veil => return None,
                _ => "bun01",
            }
        } else {
            let bald = if p.female { 0.0 } else { c01((p.age - 22.0) / 38.0) * p.u(BALD) * 1.7 };
            let modern = std::env::var("APOLEIA_ERA").is_ok_and(|e| e == "1900");
            if bald > 0.75 {
                "bald01"
            } else if bald > 0.4 {
                "receding01"
            } else if p.u(CURL) > 0.62 {
                "curly01"
            } else if modern {
                "sidepart01"
            } else if p.stand <= 1 && r < 0.6 || p.age < 13.0 && r < 0.5 {
                // working people and many boys: cropped short
                "crop01"
            } else {
                "roman01"
            }
        };
        return Some((dir, name.to_string()));
    }
    let list = std::env::var(if long_hair { "APOLEIA_MH_WOMEN" } else { "APOLEIA_MH_MEN" }).unwrap_or_else(|_| if long_hair { "Braid01".into() } else { "short02".into() });
    let names: Vec<&str> = list.split(',').filter(|n| !n.is_empty()).collect();
    if names.is_empty() {
        return None;
    }
    Some((dir, names[p.seed as usize % names.len()].to_string()))
}

/// Real look: a MakeHuman hair (.mhclo fitted as MakeHuman does: each vertex a
/// weighted sum of three body vertices plus an offset scaled with the head)
/// on this person's morphed head, as textured cards.
fn mh_hair(dir: &str, name: &str, pp: &[V3], base: &[V3], hc: V3, hair: Rgb) -> Option<Surface> {
    mh_hair2(dir, name, pp, base, hc, &|_| hair, false, (0.0, 0))
}

/// Real look: a Blender garment (name.txt bound like the hair, name.png): smooth
/// normals from its own triangles, the colour per vertex.
/// where mh_cloth cuts a cell (fractions of it): the border, the patch's edge
/// and its seam
const CLOTH_CUTS: [f32; 5] = [0.0, 0.1, 0.14, 0.86, 0.9];

fn mh_cloth(dir: &str, name: &str, pp: &[V3], base: &[V3], color: &dyn Fn(V3) -> Rgb, cells: Option<&dyn Fn(V3) -> [f32; 2]>) -> Option<Surface> {
    let rows = crate::real::rows(&format!("{dir}/{name}.txt"))?;
    let mut it = rows.iter();
    let head = it.next()?;
    let (nv, nt) = (*head.first()? as usize, *head.get(1)? as usize);
    let mut refs = Vec::with_capacity(nv);
    let (mut lo0, mut hi0, mut lo1, mut hi1) = ([f32::MAX; 3], [f32::MIN; 3], [f32::MAX; 3], [f32::MIN; 3]);
    for _ in 0..nv {
        let f = it.next()?;
        let r = [f[0] as usize, f[1] as usize, f[2] as usize];
        for &i in &r {
            for a in 0..3 {
                lo0[a] = lo0[a].min(base[i][a]);
                hi0[a] = hi0[a].max(base[i][a]);
                lo1[a] = lo1[a].min(pp[i][a]);
                hi1[a] = hi1[a].max(pp[i][a]);
            }
        }
        refs.push((r, [f[3], f[4], f[5]], [f[6], f[7], f[8]]));
    }
    let _ = (lo0, hi0, lo1, hi1);
    // the offset is in the bound triangle's frame (normal, first edge, across),
    // scaled with the triangle's size
    let vs: Vec<V3> = refs
        .iter()
        .map(|(r, w, o)| {
            let (a, b, c) = (pp[r[0]], pp[r[1]], pp[r[2]]);
            let (a0, b0, c0) = (base[r[0]], base[r[1]], base[r[2]]);
            let cr = cross(sub(b, a), sub(c, a));
            let cr0 = cross(sub(b0, a0), sub(c0, a0));
            let k = (dot(cr, cr).sqrt() / dot(cr0, cr0).sqrt().max(1e-9)).sqrt();
            let n = norm(cr);
            let e1 = norm(sub(b, a));
            let e2 = cross(n, e1);
            let on: V3 = std::array::from_fn(|i| w[0] * a[i] + w[1] * b[i] + w[2] * c[i]);
            madd(madd(madd(on, n, o[0] * k), e1, o[1] * k), e2, o[2] * k)
        })
        .collect();
    let mut tris = Vec::with_capacity(nt);
    for _ in 0..nt {
        let f = it.next()?;
        tris.push(([f[0] as usize, f[1] as usize, f[2] as usize], [[f[3], 1.0 - f[4]], [f[5], 1.0 - f[6]], [f[7], 1.0 - f[8]]]));
    }
    let mut vn = vec![[0f32; 3]; nv];
    for (t, _) in &tris {
        let n = cross(sub(vs[t[1]], vs[t[0]]), sub(vs[t[2]], vs[t[0]]));
        for &i in t {
            vn[i] = add(vn[i], n);
        }
    }
    let mut s = Surface::new(mat2(0.95));
    s.tex = Some(crate::real::image(dir, name));
    // shade in the folds per vertex (name_ao.txt), if there is one
    let ao: Vec<f32> = crate::real::column(&format!("{dir}/{name}_ao.txt"), 1.0);
    // a corner: position, uv, normal, cell coordinates, fold shade
    type Cn = (V3, [f32; 2], V3, [f32; 2], f32);
    let lerp_cn = |a: &Cn, b: &Cn, t: f32| -> Cn {
        let l3 = |x: V3, y: V3| -> V3 { std::array::from_fn(|i| x[i] + (y[i] - x[i]) * t) };
        let l2 = |x: [f32; 2], y: [f32; 2]| -> [f32; 2] { [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t] };
        (l3(a.0, b.0), l2(a.1, b.1), l3(a.2, b.2), l2(a.3, b.3), a.4 + (b.4 - a.4) * t)
    };
    for (t, uv) in &tris {
        let corners: Vec<Cn> = (0..3).map(|k| (vs[t[k]], uv[k], vn[t[k]], cells.map_or([0.0, 0.0], |f| f(vs[t[k]])), ao.get(t[k]).copied().unwrap_or(1.0))).collect();
        // cut along the cells' borders, so that a patch is a whole piece with straight edges
        let mut polys = vec![corners];
        if cells.is_some() {
            for ax in 0..2 {
                let mut next = Vec::new();
                for poly in polys {
                    let lo = poly.iter().map(|c| c.3[ax]).fold(f32::MAX, f32::min);
                    let hi = poly.iter().map(|c| c.3[ax]).fold(f32::MIN, f32::max);
                    if hi - lo > 3.0 {
                        next.push(poly);
                        continue;
                    }
                    let mut rest = poly;
                    // the lines: each cell's border plus the patch's inset edge and seam
                    let mut lines = Vec::new();
                    let mut base_l = lo.floor();
                    while base_l <= hi {
                        for f in CLOTH_CUTS {
                            let l = base_l + f;
                            if l > lo && l <= hi {
                                lines.push(l);
                            }
                        }
                        base_l += 1.0;
                    }
                    for line in lines {
                        let (mut below, mut above) = (Vec::new(), Vec::new());
                        for i in 0..rest.len() {
                            let (a, b) = (&rest[i], &rest[(i + 1) % rest.len()]);
                            let (qa, qb) = (a.3[ax], b.3[ax]);
                            if qa < line {
                                below.push(*a);
                            } else {
                                above.push(*a);
                            }
                            if (qa < line) != (qb < line) {
                                let c = lerp_cn(a, b, (line - qa) / (qb - qa));
                                below.push(c);
                                above.push(c);
                            }
                        }
                        if below.len() >= 3 {
                            next.push(below);
                        }
                        rest = above;
                    }
                    if rest.len() >= 3 {
                        next.push(rest);
                    }
                }
                polys = next;
            }
        }
        for poly in &polys {
            let mut cen = [0f32; 3];
            for c in poly {
                cen = add(cen, c.0);
            }
            let l = linear(color(mul(cen, 1.0 / poly.len() as f32)));
            for k in 1..poly.len() - 1 {
                for c in [&poly[0], &poly[k], &poly[k + 1]] {
                    s.pos.push(c.0);
                    s.col.push(mul(l, c.4));
                    s.uv.push(c.1);
                    s.nrm.push(norm(c.2));
                }
            }
        }
    }
    Some(s)
}

/// Real look: as mh_hair, the colour per vertex; `hang`: normals outward from the
/// vertical axis below hc (for beards hanging below the chin); `thin`: the share
/// of cards left out (thinning hair in age) and the seed that picks them.
#[allow(clippy::too_many_arguments)]
fn mh_hair2(dir: &str, name: &str, pp: &[V3], base: &[V3], hc: V3, color: &dyn Fn(V3) -> Rgb, hang: bool, thin: (f32, u32)) -> Option<Surface> {
    let rows = crate::real::rows(&format!("{dir}/{name}.txt"))?;
    let mut it = rows.iter();
    let head = it.next()?;
    let (nv, nt) = (*head.first()? as usize, *head.get(1)? as usize);
    if nt == 0 {
        return None;
    }
    let mut refs = Vec::with_capacity(nv);
    let (mut lo0, mut hi0, mut lo1, mut hi1) = ([f32::MAX; 3], [f32::MIN; 3], [f32::MAX; 3], [f32::MIN; 3]);
    for _ in 0..nv {
        let f = it.next()?;
        let r = [f[0] as usize, f[1] as usize, f[2] as usize];
        for &i in &r {
            for a in 0..3 {
                lo0[a] = lo0[a].min(base[i][a]);
                hi0[a] = hi0[a].max(base[i][a]);
                lo1[a] = lo1[a].min(pp[i][a]);
                hi1[a] = hi1[a].max(pp[i][a]);
            }
        }
        refs.push((r, [f[3], f[4], f[5]], [f[6], f[7], f[8]]));
    }
    let sc: V3 = std::array::from_fn(|a| (hi1[a] - lo1[a]) / (hi0[a] - lo0[a]).max(1e-4));
    let vs: Vec<V3> = refs
        .iter()
        .map(|(r, w, o)| std::array::from_fn(|a| w[0] * pp[r[0]][a] + w[1] * pp[r[1]][a] + w[2] * pp[r[2]][a] + o[a] * sc[a]))
        .collect();
    let flat = std::env::var_os("APOLEIA_MH_FLAT").is_some();
    let mut s = Surface::new(mat2(if flat { 0.85 } else { 0.6 }));
    s.tex = Some(crate::real::image(dir, name));
    let red = name.ends_with("_cap") && std::env::var_os("APOLEIA_DEBUG_CAP").is_some();
    let tris: Vec<&Vec<f32>> = it.by_ref().take(nt).collect();
    if tris.len() < nt {
        return None;
    }
    // thinning: whole cards (triangles joined by shared corners) left out
    let mut card: Vec<usize> = (0..nv).collect();
    if thin.0 > 0.0 {
        fn root(c: &mut [usize], mut i: usize) -> usize {
            while c[i] != i {
                c[i] = c[c[i]];
                i = c[i];
            }
            i
        }
        for f in &tris {
            let a = root(&mut card, f[0] as usize);
            for k in 1..3 {
                let b = root(&mut card, f[k] as usize);
                card[b] = a;
            }
        }
        for i in 0..nv {
            card[i] = root(&mut card, i);
        }
    }
    for f in tris {
        if thin.0 > 0.0 && Rng::new(thin.1 ^ (card[f[0] as usize] as u32).wrapping_mul(0x9e37_79b9)).next() < thin.0 {
            continue;
        }
        for k in 0..3 {
            let v = vs[f[k] as usize];
            s.pos.push(v);
            s.col.push(if red { [1.0, 0.0, 0.0] } else { linear(color(v)) });
            s.uv.push([f[3 + 2 * k], 1.0 - f[4 + 2 * k]]);
            if !flat {
                let mut d = sub(v, hc);
                if hang {
                    d[1] = d[1].max(0.0);
                }
                s.nrm.push(norm(d));
            }
        }
    }
    Some(s)
}

pub fn build(h: &Head, p: &Look, lod: usize) -> Portrait {
    let real = crate::real::dir("APOLEIA_REAL");
    let lod = if real.is_some() { LODS - 1 } else { lod.min(LODS - 1) };
    let (pp, targets) = morph(h, p);
    let mut x = Ctx { h, pp, rng: Rng::new(p.seed ^ 0x5bd1_e995) };
    let body_full = h.body_full();
    let mut uniq = Vec::new();
    {
        let mut seen = vec![false; h.n];
        for &v in body_full {
            if !seen[v as usize] {
                seen[v as usize] = true;
                uniq.push(v);
            }
        }
    }
    let fem = p.female;
    // girls under three have short hair like the boys
    let long_hair = fem && p.age >= 3.0;
    let grown = p.grown();
    let st = p.st();
    let lf = p.life;
    let hung = c01((0.42 - lf.food) / 0.42);
    let hair = p.hair_colour();
    let usk = p.u(SKIN);
    // skin: the sun tans (more on light skin), hunger makes it sallow, illness pale
    let skin = cmix(cmix(cmix(p.skin(), hex("#9a6440"), 0.24 * lf.sun * (1.0 - 0.6 * usk)), hex("#c8bc9c"), 0.2 * hung), hex("#ddd6ca"), 0.28 * lf.ill);
    // what the clothes tell, at the facet's place `c` (base): the dye by the
    // wealth around (undyed wool for the poorest, deeper colour for the
    // better off), fading and patches where the household lacks clothing,
    // dark cloth in mourning (the toga pulla). PLACEHOLDER strengths.
    let patch = hex(st.tunic[(p.seed as usize + 1) % st.tunic.len()]);
    // the same without patches, and the patch test alone (for the Blender tunic)
    let dress0 = |col: Rgb| -> Rgb {
        let mut k = col;
        if lf.wealth < 0.35 {
            k = cmix(k, hex("#b3a589"), (0.35 - lf.wealth) / 0.35 * 0.55);
        } else if lf.wealth > 0.7 {
            let g = (k[0] + k[1] + k[2]) / 3.0;
            let t = (lf.wealth - 0.7) / 0.3 * 0.35;
            k = [c01(k[0] + (k[0] - g) * t), c01(k[1] + (k[1] - g) * t), c01(k[2] + (k[2] - g) * t)];
        }
        if lf.worn > 0.0 {
            k = cmix(k, hex("#9c9484"), lf.worn * 0.35);
        }
        k
    };
    let patched = |c: V3| -> bool {
        let cell = |v: f32| ((v / 0.38).floor() + 64.0) as u32;
        lf.worn > 0.0 && hash(cell(c[0]), cell(c[1]), cell(c[2]) + 7 + (p.seed % 997)) < (lf.worn - 0.25).max(0.0) * 0.2
    };
    let dress = |col: Rgb, c: V3| -> Rgb {
        let mut k = col;
        if lf.wealth < 0.35 {
            k = cmix(k, hex("#b3a589"), (0.35 - lf.wealth) / 0.35 * 0.55);
        } else if lf.wealth > 0.7 {
            let g = (k[0] + k[1] + k[2]) / 3.0;
            let t = (lf.wealth - 0.7) / 0.3 * 0.35;
            k = [c01(k[0] + (k[0] - g) * t), c01(k[1] + (k[1] - g) * t), c01(k[2] + (k[2] - g) * t)];
        }
        if lf.worn > 0.0 {
            k = cmix(k, hex("#9c9484"), lf.worn * 0.35);
            let cell = |v: f32| ((v / 0.38).floor() + 64.0) as u32;
            if hash(cell(c[0]), cell(c[1]), cell(c[2]) + 7) < (lf.worn - 0.25).max(0.0) * 0.2 {
                k = cmul(cmix(k, patch, 0.8), 0.8);
            }
        }
        cmix(k, hex("#2f2b28"), 0.65 * lf.mourn)
    };
    // wrinkles as darker facets along the usual lines; age counts, the sun deepens them
    const WR: [[f32; 5]; 8] = [
        [0.19, 6.93, 0.27, 6.62, 32.0],
        [0.5, 7.38, 0.63, 7.43, 28.0],
        [0.5, 7.34, 0.63, 7.29, 30.0],
        [0.5, 7.36, 0.64, 7.36, 34.0],
        [0.0, 7.78, 0.36, 7.79, 30.0],
        [0.0, 7.86, 0.3, 7.87, 40.0],
        [0.22, 7.26, 0.45, 7.23, 42.0],
        [0.27, 6.6, 0.25, 6.42, 55.0],
    ];
    let seg_d = |px: f32, py: f32, x0: f32, y0: f32, x1: f32, y1: f32| {
        let (dx, dy) = (x1 - x0, y1 - y0);
        let t = c01(((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy));
        (px - x0 - dx * t).hypot(py - y0 - dy * t)
    };
    let wrinkle = |c: V3| {
        if c[2] < 0.9 {
            return 0.0;
        }
        let ax = c[0].abs();
        let mut k = 0f32;
        for [x0, y0, x1, y1, a0] in WR {
            let w = c01((p.age - a0) / 30.0) * (0.55 + 0.8 * lf.sun);
            if w <= 0.0 {
                continue;
            }
            k = k.max(w * c01(1.0 - seg_d(ax, c[1], x0, y0, x1, y1) / 0.032));
        }
        k
    };
    // age spots on forehead, temples and cheeks after 50, more after years
    // in the sun: (x, y, radius) on the face (PLACEHOLDER, eyeballed)
    let spots: Vec<(f32, f32, f32)> = {
        let mut r = Rng::new(p.seed ^ 0x5be0_cd19);
        let n = (c01((p.age - 50.0) / 30.0) * (0.4 + 0.9 * lf.sun) * 8.0).round() as usize;
        (0..n)
            .map(|_| {
                let (zone, sg) = (r.next(), if r.next() < 0.5 { -1.0 } else { 1.0 });
                let (x, y) = if zone < 0.45 {
                    (r.next() * 0.5, 7.62 + r.next() * 0.3)
                } else if zone < 0.7 {
                    (0.5 + r.next() * 0.18, 7.3 + r.next() * 0.35)
                } else {
                    (0.33 + r.next() * 0.3, 6.92 + r.next() * 0.25)
                };
                (sg * x, y, 0.05 + 0.04 * r.next())
            })
            .collect()
    };
    let scars = p.scars();
    // (real look: with the textured skin a scar only a shade paler and pinker
    // than the skin around it, the raised ribbon catches the light; PLACEHOLDER)
    let scar_c = match (real.is_some(), usk < 0.45) {
        (false, true) => cmix(skin, hex("#c06a62"), 0.62),
        (false, false) => cmix(skin, hex("#efcdb8"), 0.7),
        (true, true) => cmul(cmix(skin, hex("#b9706a"), 0.35), 0.82),
        (true, false) => cmul(cmix(skin, hex("#e0a89c"), 0.35), 0.82),
    };
    let nb = vnormals(&x.pp, body_full);
    let curl = p.u(CURL);
    let bald = if fem { 0.0 } else { c01((p.age - 22.0) / 38.0) * p.u(BALD) * 1.7 };
    let beard = p.beard_style();
    let cov = p.u(BEARD_G);
    // (real look: with the textured skin lips only a little redder than the skin;
    // the full mix read as lipstick there)
    let lip_c = cmix(skin, hex(if fem { "#9a3238" } else { "#8a3a36" }), match (real.is_some(), fem) {
        (true, true) => 0.3,
        (true, false) => 0.2,
        (false, true) => 0.55,
        (false, false) => 0.3,
    });
    let brow_c = cmix(skin, hair, if fem { 0.4 } else { 0.55 });
    let stub_c = cmix(skin, cmix(hex("#33271f"), hair, 0.3), (if p.age < 20.0 { 0.22 } else { 0.4 }) + 0.22 * cov);
    let in_brow = |c: V3| {
        let ax = c[0].abs();
        if !(0.1..=0.6).contains(&ax) || c[2] < 1.0 {
            return false;
        }
        let yc = 7.565 + 0.035 * ((ax - 0.1) / 0.5 * PI).sin() - 0.02 * (ax - 0.1);
        (c[1] - yc).abs() < if fem { 0.035 } else { 0.055 }
    };
    let in_beard = |c: V3, a: u32, b: u32, cc: u32| {
        if c[1] < 6.08 || (c[1] < 6.3 && c[2] < 0.75) || c[2] < 0.2 {
            return false;
        }
        let ax = c[0].abs();
        if Ctx::mask3(&h.lip, a, b, cc) > 0.3 || Ctx::mask3(&h.nose, a, b, cc) > 0.2 {
            return false;
        }
        let top = (if ax < 0.3 {
            6.79
        } else if ax < 0.55 {
            6.8 - (ax - 0.3) * 0.3
        } else {
            6.76 + (ax - 0.55) * 1.3
        }) + if ax > 0.3 { (cov - 0.5) * 0.18 } else { 0.0 };
        if ax > 0.82 {
            return false;
        }
        c[1] < top && (c[2] > 0.5 || c[1] < 6.5)
    };
    // real look: a Blender beard (APOLEIA_MH_BEARD names the folder), if there is one for this style
    let real_beard: Option<(String, String)> = if real.is_some() {
        crate::real::dir("APOLEIA_MH_BEARD").and_then(|d| {
            let n = match beard {
                Beard::Shaven => return None,
                Beard::Stubble => "beard_stubble",
                Beard::Short => "beard_short",
                Beard::Full => "beard_full",
                Beard::Philosopher => "beard_phil",
                Beard::Chin => "beard_chin",
            };
            crate::real::exists(&format!("{d}/{n}_cap.txt")).then(|| (d, n.to_string()))
        })
    } else {
        None
    };
    let mut out: Vec<Surface> = Vec::new();

    // skin
    {
        let mut s = Surface::new(mat(0.62));
        let mut color = |c: V3, a: u32, b: u32, cc: u32| -> Rgb {
            let hh = hash(a, b, cc);
            let mut col = cmul(skin, 0.95 + 0.08 * hh);
            if Ctx::mask3(&h.lip, a, b, cc) > 0.42 {
                return cmul(lip_c, 0.95 + 0.08 * hh);
            }
            if in_brow(c) {
                return cmul(brow_c, 0.9 + 0.15 * hh);
            }
            if beard != Beard::Shaven && in_beard(c, a, b, cc) {
                return cmul(cmix(skin, stub_c, 0.55 + 0.45 * hh), 0.94 + 0.08 * hash(cc, a, b));
            }
            let cm = Ctx::mask3(&h.cheek, a, b, cc);
            if cm > 0.35 {
                col = cmix(col, hex("#c06a58"), (if fem { 0.2 } else { 0.1 }) * cm);
            }
            let (ex, ey) = (c[0].abs() - 0.31, c[1] - 7.36);
            if c[2] > 1.1 && ey > -0.02 && (ex * 0.8).hypot(ey) < 0.15 {
                col = cmul(col, if fem { 0.8 } else { 0.9 });
            }
            if Ctx::mask3(&h.ear, a, b, cc) > 0.3 {
                col = cmix(col, hex("#c06a58"), 0.08);
            }
            if c[1] > 6.0 && c[1] < 6.15 && c[2] > 0.4 {
                col = cmul(col, 0.94);
            }
            // (real look: the wrinkles come from the skin's fold shade and normal map)
            let wk = if real.is_some() { 0.0 } else { wrinkle(c) };
            if wk > 0.0 {
                col = cmul(col, 1.0 - 0.26 * wk);
            }
            if lf.sun > 0.3 {
                col = cmul(col, 1.0 + (hh - 0.5) * 0.12 * lf.sun);
            }
            if c[2] > 1.05 && ey < -0.04 && ey > -0.16 && ex.abs() < 0.16 && (lf.ill > 0.0 || hung > 0.0 || lf.mourn > 0.0) {
                col = cmix(col, hex("#6e4a52"), 0.18 * lf.ill + 0.12 * hung + 0.14 * lf.mourn);
            }
            if c[2] > 0.6 && spots.iter().any(|&(x, y, r)| (c[0] - x).hypot(c[1] - y) < r) && Ctx::mask3(&h.nose, a, b, cc) < 0.2 {
                col = cmix(col, hex("#6e4428"), 0.42 + 0.12 * hh);
            }
            col
        };
        x.facets(&mut s, &h.parts["body"][lod], &|_, _, _, _| true, &mut color, None);
        if let Some(dir) = &real {
            // a shadow of beard in the skin's colour instead of grains
            if beard == Beard::Stubble || (beard != Beard::Shaven && !fem) {
                let dc = linear(cmix(hex("#2b211b"), hair, 0.35));
                let k = (if beard == Beard::Stubble { 0.1 + 0.15 * cov } else { 0.07 }) * if real_beard.is_some() { 0.4 } else { 1.0 };
                for (t, f) in h.parts["body"][lod].chunks_exact(3).enumerate() {
                    let (a, b, c) = (f[0], f[1], f[2]);
                    if in_beard(x.base_c(a, b, c), a, b, c) {
                        for j in 0..3 {
                            s.col[3 * t + j] = mix(s.col[3 * t + j], dc, k);
                        }
                    }
                }
            }
            // the scalp under the hair this person wears (name_scalp.txt beside it), if bare-headed
            let bare = !matches!(p.hat_style(), Hat::Cap | Hat::Pileus | Hat::Petasos) && !(long_hair && p.hair_style() == Hair::Veil);
            let sf = if bare { mh_pick(p, long_hair).map(|(d, n)| format!("{d}/{n}_scalp.txt")).filter(|f| crate::real::exists(f)) } else { None };
            real_skin(&mut s, &h.parts["body"][lod], &x.pp, dir, p.age, fem, hair, sf, lf.sun, p.seed);
        }
        out.push(s);
    }

    let mut strands = Surface::new(mat2(0.78));
    // the head morph moves and scales the head: fit base -> morph per axis,
    // so that the thresholds of the base mesh fit
    let fit: Vec<[f32; 2]> = (0..3)
        .map(|k| {
            let (mut n, mut b, mut m, mut bb, mut bm) = (0f64, 0f64, 0f64, 0f64, 0f64);
            for &v in &uniq {
                let bs = h.base[v as usize];
                if bs[1] < 6.0 || bs[0].abs() > 1.0 {
                    continue;
                }
                let (xx, yy) = (bs[k] as f64, x.pp[v as usize][k] as f64);
                n += 1.0;
                b += xx;
                m += yy;
                bb += xx * xx;
                bm += xx * yy;
            }
            let sl = (n * bm - b * m) / (n * bb - b * b);
            [sl as f32, ((m - sl * b) / n) as f32]
        })
        .collect();
    let hs = fit[1][0];
    let ym = |y: f32| fit[1][0] * y + fit[1][1];
    // the head's centre in morph space; rays from here hit skull, ears and nape
    let hc = [fit[0][1], ym(7.7), fit[2][0] * 0.45 + fit[2][1]];
    let pp_snapshot = x.pp.clone();
    let cast_h = Caster::new(hc, &pp_snapshot, body_full);

    // --- beard: a sculpted mass in the cylinder grid around the head axis ---
    let grey_start = 22.0 + (1.0 - p.u(GREY)) * 32.0;
    let beard_grey = c01((p.age - grey_start) / 25.0);
    if beard != Beard::Shaven && beard != Beard::Stubble && real_beard.is_none() {
        // a little lighter than the hair, greys first at the chin
        let b_col = |by: f32| cmix(cmul(hair, 1.12), hex("#d6d1c9"), beard_grey * 0.6 * c01((ym(6.8) - by) / (0.6 * hs)));
        let zc = fit[2][0] * 0.35 + fit[2][1];
        let (f0, fs, nf, ya, ys, ny) = (-120f32, 1.5f32, 161usize, ym(5.3), 0.02 * hs, 131usize);
        let mut rsv = vec![-1f32; nf * ny];
        let (mut pf, mut py, mut pr) = (vec![0f32; h.n], vec![0f32; h.n], vec![0f32; h.n]);
        for &v in &uniq {
            let q = x.pp[v as usize];
            let (xx, zz) = (q[0], q[2] - zc);
            pf[v as usize] = xx.atan2(zz) / D2R;
            py[v as usize] = q[1];
            pr[v as usize] = xx.hypot(zz);
        }
        for f in body_full.chunks_exact(3) {
            let (a, b, c) = (f[0] as usize, f[1] as usize, f[2] as usize);
            if pf[a].abs().max(pf[b].abs()).max(pf[c].abs()) > 135.0 {
                continue;
            }
            let (fl, fh) = (pf[a].min(pf[b]).min(pf[c]), pf[a].max(pf[b]).max(pf[c]));
            let (yl, yh) = (py[a].min(py[b]).min(py[c]), py[a].max(py[b]).max(py[c]));
            if yh < ya || yl > ya + ys * (ny - 1) as f32 {
                continue;
            }
            let i0 = ((fl - f0) / fs).ceil().max(0.0) as usize;
            let i1 = ((fh - f0) / fs).floor().min((nf - 1) as f32);
            let j0 = ((yl - ya) / ys).ceil().max(0.0) as usize;
            let j1 = ((yh - ya) / ys).floor().min((ny - 1) as f32);
            if i1 < 0.0 || j1 < 0.0 {
                continue;
            }
            let (i1, j1) = (i1 as usize, j1 as usize);
            let (x1, y1, x2, y2, x3, y3) = (pf[a], py[a], pf[b], py[b], pf[c], py[c]);
            let den = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
            if den.abs() < 1e-9 {
                continue;
            }
            for i in i0..=i1 {
                for j in j0..=j1 {
                    let (xx, yy) = (f0 + i as f32 * fs, ya + j as f32 * ys);
                    let l1 = ((y2 - y3) * (xx - x3) + (x3 - x2) * (yy - y3)) / den;
                    let l2 = ((y3 - y1) * (xx - x3) + (x1 - x3) * (yy - y3)) / den;
                    let l3 = 1.0 - l1 - l2;
                    if l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4 {
                        continue;
                    }
                    let r = l1 * pr[a] + l2 * pr[b] + l3 * pr[c];
                    if r > rsv[i * ny + j] {
                        rsv[i * ny + j] = r;
                    }
                }
            }
        }
        for i in 0..nf {
            let mut last = -1f32;
            for j in (0..ny).rev() {
                if rsv[i * ny + j] < 0.0 {
                    rsv[i * ny + j] = last;
                } else {
                    last = rsv[i * ny + j];
                }
            }
            last = -1.0;
            for j in 0..ny {
                if rsv[i * ny + j] < 0.0 {
                    rsv[i * ny + j] = last;
                } else {
                    last = rsv[i * ny + j];
                }
            }
        }
        let rs = Raster { rs: rsv, f0, fs, nf, ya, ys, ny };
        // the jaw line: the skin's steepest recession towards the neck, sought
        // near the base mesh's mean jaw line
        const JM: [[f32; 2]; 6] = [[0.0, 6.14], [11.0, 6.15], [25.0, 6.25], [44.0, 6.6], [71.0, 6.8], [95.0, 6.9]];
        let jm = |a: f32| {
            for k in 1..JM.len() {
                if a <= JM[k][0] {
                    return lerp(JM[k - 1][1], JM[k][1], (a - JM[k - 1][0]) / (JM[k][0] - JM[k - 1][0]));
                }
            }
            6.9
        };
        let jaw_raw = |f: f32| {
            let m = jm(f.abs());
            let (mut best, mut bd) = (ym(m), -1f32);
            let mut y = ym(m - 0.22);
            while y < ym(m + 0.15) {
                let d = rs.at(f, y + ys) - rs.at(f, y - ys);
                if d > bd {
                    bd = d;
                    best = y;
                }
                y += ys / 2.0;
            }
            best
        };
        let jw: Vec<f32> = (0..=90).map(|k| jaw_raw(k as f32) * 0.5 + jaw_raw(-(k as f32)) * 0.5).collect();
        let yj = |a: f32| {
            let k = (jround(a) as i32).min(90);
            let (mut s, mut n) = (0f32, 0);
            for d in -3..=3 {
                let q = k + d;
                if !(0..=90).contains(&q) {
                    continue;
                }
                s += jw[q as usize];
                n += 1;
            }
            s / n as f32
        };
        // mouth, nose, ear from the masks of the morphed skin
        let (mut mc, mut y_lo, mut y_up, mut y_cor, mut fe) = (6f32, 99f32, -99f32, ym(6.62), 90f32);
        for &v in &uniq {
            let v = v as usize;
            let af = pf[v].abs();
            if h.lip[v] > 0.42 {
                if af > mc {
                    mc = af;
                    y_cor = py[v];
                }
                if af < 6.0 {
                    y_lo = y_lo.min(py[v]);
                    y_up = y_up.max(py[v]);
                }
            }
            if h.ear[v] > 0.6 && py[v] > ym(6.9) && py[v] < ym(7.5) && pr[v] > 0.55 * hs {
                fe = fe.min(af);
            }
        }
        if y_lo > 90.0 {
            y_lo = ym(6.5);
            y_up = ym(6.74);
        }
        let f_max = 55f32.max(72f32.min(fe - 6.0));
        let y_side = ym(7.6);
        let cols = [8.0, 6.0, 4.6, 4.0][lod];
        let mut bm = Surface::new(mat2(0.82));
        // the bottom edge: round, pointed, straight or forked
        let shape_of = |k: usize| -> fn(f32) -> f32 {
            match k {
                0 => |u| (1.0 - u * u).max(0.0).sqrt(),
                1 => |u| (1.0 - u).max(0.0).powf(1.3),
                2 => |u| 1.0 - sm(0.45, 0.95, u),
                _ => |u| (1.0 - u * u).max(0.0).sqrt() * (1.0 - 0.28 * (-u * u * 60.0).exp()),
            }
        };
        let len_f = 0.8 + 0.45 * x.rng.next();
        // (the Werkstatt draws both picks, whichever style is used)
        let pick_voll = [0, 0, 1, 2, 3][((x.rng.next() * 5.0) as usize).min(4)];
        let pick_phil = [1, 0, 3, 1][((x.rng.next() * 4.0) as usize).min(3)];
        struct B0 {
            t: f32,
            tc: f32,
            drop: f32,
            taper: f32,
            depth: f32,
            ridge: f32,
            tuft: f32,
            wave: f32,
            conv: f32,
            shape: usize,
            chest: f32,
            cw: &'static [usize],
            pinch: f32,
            drift: f32,
            jit: f32,
            bands: usize,
            blen: f32,
            tuft_h: f32,
        }
        let b0 = match beard {
            Beard::Short => B0 { t: 0.038, tc: 0.03, drop: 0.06, taper: 1.4, depth: 0.08, ridge: 0.008, tuft: 0.035, wave: 0.003, conv: 0.0, shape: 0, chest: 0.1, cw: &[2, 3], pinch: 0.3, drift: 0.5, jit: 0.008, bands: 2, blen: 1.1, tuft_h: 0.012 },
            Beard::Full => B0 { t: 0.075, tc: 0.2, drop: 0.45, taper: 0.38, depth: 0.5, ridge: 0.03, tuft: 0.12, wave: 0.012, conv: 0.12, shape: pick_voll, chest: 0.13, cw: &[2, 3, 3], pinch: 0.6, drift: 2.5, jit: 0.014, bands: 3, blen: 1.25, tuft_h: 0.035 },
            Beard::Philosopher => B0 { t: 0.08, tc: 0.24, drop: 1.0, taper: 0.2, depth: 0.55, ridge: 0.032, tuft: 0.16, wave: 0.015, conv: 0.22, shape: pick_phil, chest: 0.15, cw: &[2, 3, 3], pinch: 0.6, drift: 3.0, jit: 0.016, bands: 4, blen: 1.25, tuft_h: 0.04 },
            _ => B0 { t: 0.04, tc: 0.14, drop: 0.45, taper: 0.45, depth: 0.35, ridge: 0.02, tuft: 0.08, wave: 0.008, conv: 0.4, shape: 1, chest: 0.12, cw: &[2, 3], pinch: 0.5, drift: 1.5, jit: 0.012, bands: 2, blen: 1.2, tuft_h: 0.03 },
        };
        let shape = shape_of(b0.shape);
        let chest_t = if st.toga { b0.chest.max(0.22) } else { b0.chest };
        let chin = beard == Beard::Chin;
        let f_r = if chin { mc + 4.0 + 3.0 * cov } else { f_max };
        let cheek_ex = 1.7 - 1.0 * cov;
        let y_c0 = y_cor + 0.02 * hs;
        let top = |a: f32| {
            if a <= mc * 0.6 {
                return y_lo - 0.02 * hs;
            }
            if a <= mc + 4.0 {
                return lerp(y_lo - 0.02 * hs, y_c0, sm(mc * 0.6, mc + 4.0, a));
            }
            if chin {
                return y_c0;
            }
            y_c0 + (y_side - y_c0) * c01((a - mc - 4.0) / (f_max - mc - 4.0)).powf(cheek_ex)
        };
        let bot = |a: f32, ap: f32, rnd: f32| {
            let sh = shape(c01(a / f_r));
            yj(a) - hs * (b0.drop * len_f * sh + ((1.0 - ap).max(0.0).powf(0.8) - 0.15) * b0.tuft * (0.5 + 0.9 * rnd) * (1.0 - 0.4 * curl) * (0.4 + 0.6 * sh))
        };
        let thick = |a: f32, v: f32, dy: f32| {
            (b0.t * (0.8 + 0.4 * cov) * (1.0 - 0.55 * sm(0.72, 1.0, a / f_r)) + b0.tc * len_f * (1.0 - c01(a / f_r)).powf(1.2) * sm(0.05, 0.5, v)) * sm(0.0, 0.07, dy) + 0.004
        };
        sculpt(
            &mut bm,
            &mut x.rng,
            &Sculpt {
                f0: -f_r,
                f1: f_r,
                rows: jround(6.0 + 8.0 * b0.drop * len_f) as usize,
                bands: b0.bands,
                blen: b0.blen,
                tuft_h: b0.tuft_h * (1.0 + 0.8 * curl),
                conv: b0.conv,
                slant: 0.0,
                taper: b0.taper,
                depth: b0.depth,
                ridge: b0.ridge * (1.0 + 0.6 * curl),
                wave: b0.wave + 0.035 * curl * if beard == Beard::Short { 0.2 } else { 1.0 },
                wave_f: 6.0 + 10.0 * curl,
                chest_t,
                col: &b_col,
                cw: b0.cw,
                pinch: b0.pinch,
                drift: b0.drift * (1.0 + curl),
                jit: b0.jit,
                top: &top,
                bot: &bot,
                thick: &thick,
            },
            &rs,
            zc,
            cols,
            hs,
            ym(6.0),
        );
        // moustache
        struct M0 {
            ext: f32,
            t: f32,
            over: f32,
            droop: f32,
            tuft: f32,
            slant: f32,
            ridge: f32,
        }
        let chin_moustache = x.rng.next() < 0.6;
        let m0 = match beard {
            Beard::Short => Some(M0 { ext: 1.0, t: 0.024, over: 0.0, droop: 0.03, tuft: 0.012, slant: 5.0, ridge: 0.004 }),
            Beard::Full => Some(M0 { ext: 4.0, t: 0.042, over: 0.05, droop: 0.1, tuft: 0.03, slant: 8.0, ridge: 0.009 }),
            Beard::Philosopher => Some(M0 { ext: 6.0, t: 0.05, over: 0.08, droop: 0.2, tuft: 0.04, slant: 10.0, ridge: 0.011 }),
            _ if chin_moustache => Some(M0 { ext: 0.0, t: 0.022, over: 0.0, droop: 0.04, tuft: 0.012, slant: 5.0, ridge: 0.004 }),
            _ => None,
        };
        if let Some(m0) = m0 {
            let f_m = mc + m0.ext;
            let m_top = y_up + 0.11 * hs;
            let mcol = b_col(ym(6.8));
            sculpt(
                &mut bm,
                &mut x.rng,
                &Sculpt {
                    f0: -f_m,
                    f1: f_m,
                    rows: 4,
                    bands: 1,
                    blen: 1.0,
                    tuft_h: m0.t * 0.4,
                    conv: 0.0,
                    slant: m0.slant,
                    taper: 0.7,
                    depth: 0.07,
                    ridge: m0.ridge,
                    wave: 0.004 * curl,
                    wave_f: 5.0,
                    chest_t: 0.0,
                    col: &|_| mcol,
                    cw: &[2],
                    pinch: 0.4,
                    drift: 0.6,
                    jit: 0.005,
                    top: &|a| m_top - 0.07 * hs * (a / f_m).powf(1.5),
                    bot: &|a, ap, rnd| y_up - hs * (m0.over + m0.droop * (a / f_m).powi(2) + ((1.0 - ap).max(0.0).powf(0.8) - 0.15) * m0.tuft * (0.5 + 0.9 * rnd)),
                    thick: &|a, _v, dy| m0.t * (1.0 - 0.5 * (a / f_m).powi(2)) * sm(0.0, 0.03, dy) + 0.006,
                },
                &rs,
                zc,
                cols,
                hs,
                ym(6.0),
            );
        }
        out.push(bm);
    }
    // stubble: many tiny dark facets just above the skin, grainy rather than tinted
    if real.is_none() && (beard == Beard::Stubble || (beard != Beard::Shaven && !fem)) {
        let density = if beard == Beard::Stubble { (700.0 + 900.0 * cov) * if p.age < 20.0 { 0.5 } else { 1.0 } } else { 260.0 };
        let dots = x.sample(&|c, a, b, cc| in_beard(c, a, b, cc), density);
        let mut sd = Surface::new(mat2(0.9));
        let dc = cmix(hex("#2b211b"), hair, 0.35);
        for d in &dots {
            let n = d.n;
            let mut t1 = cross([1.0, 0.0, 0.0], n);
            if dot(t1, t1) < 1e-4 {
                t1 = [0.0, 1.0, 0.0];
            }
            let t1 = norm(t1);
            let t2 = cross(n, t1);
            let s0 = (0.009 + 0.008 * x.rng.next()) * hs;
            let o = madd(d.p, n, 0.003);
            let a0 = x.rng.next() * std::f32::consts::TAU;
            let cc = cmul(dc, 0.8 + 0.4 * x.rng.next());
            let l = linear(cc);
            for k in 0..3 {
                let a = a0 + k as f32 * 2.094;
                sd.pos.push(madd(madd(o, t1, a.cos() * s0), t2, a.sin() * s0));
                sd.col.push(l);
            }
        }
        out.push(sd);
    }
    // scars: narrow, slightly raised ribbons on the morphed skin (each point
    // found by triangle in the base mesh's front view)
    if !scars.is_empty() {
        let front: Vec<usize> = (0..body_full.len()).step_by(3).filter(|&f| (0..3).map(|q| h.base[body_full[f + q] as usize][2]).sum::<f32>() > 2.1).collect();
        let surf = |xx: f32, yy: f32| -> Option<(V3, V3)> {
            for &f in &front {
                let (a, b, c) = (body_full[f] as usize, body_full[f + 1] as usize, body_full[f + 2] as usize);
                let (x1, y1, x2, y2, x3, y3) = (h.base[a][0], h.base[a][1], h.base[b][0], h.base[b][1], h.base[c][0], h.base[c][1]);
                let den = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
                if den.abs() < 1e-9 {
                    continue;
                }
                let l1 = ((y2 - y3) * (xx - x3) + (x3 - x2) * (yy - y3)) / den;
                let l2 = ((y3 - y1) * (xx - x3) + (x1 - x3) * (yy - y3)) / den;
                let l3 = 1.0 - l1 - l2;
                if l1 < 0.0 || l2 < 0.0 || l3 < 0.0 {
                    continue;
                }
                let (pa, pb, pc) = (x.pp[a], x.pp[b], x.pp[c]);
                let q = add(add(mul(pa, l1), mul(pb, l2)), mul(pc, l3));
                let mut n = norm(cross(sub(pb, pa), sub(pc, pa)));
                if n[2] < 0.0 {
                    n = mul(n, -1.0);
                }
                return Some((q, n));
            }
            None
        };
        let mut ss = Surface::new(mat2(0.5));
        for sc in &scars {
            let mut pts = Vec::new();
            for k in 0..=6 {
                let t = k as f32 / 6.0;
                if let Some((q, n)) = surf(lerp(sc.x0, sc.x1, t) + 0.006 * (k as f32 * 2.3).sin(), lerp(sc.y0, sc.y1, t)) {
                    pts.push((q, n, (0.024 - 0.014 * (t - 0.5).abs() * 2.0) * hs));
                }
            }
            for k in 0..pts.len().saturating_sub(1) {
                let ((qa, na, wa), (qb, nb2, wb)) = (pts[k], pts[k + 1]);
                let dir = norm(sub(qb, qa));
                let sa = mul(norm(cross(na, dir)), wa);
                let sb = mul(norm(cross(nb2, dir)), wb);
                let (oa, ob) = (madd(qa, na, 0.005), madd(qb, nb2, 0.005));
                let (a1, a2, b1, b2) = (add(oa, sa), sub(oa, sa), add(ob, sb), sub(ob, sb));
                let rh = if real.is_some() { 0.007 } else { 0.011 };
                let ridge = mix(madd(qa, na, rh), madd(qb, nb2, rh), 0.5);
                let (lit, dim) = (cmul(scar_c, 1.06), cmul(scar_c, 0.92));
                ss.put(a1, scar_c);
                ss.put(b1, scar_c);
                ss.put(ridge, lit);
                ss.put(a2, dim);
                ss.put(ridge, lit);
                ss.put(b2, dim);
                ss.put(a1, scar_c);
                ss.put(ridge, scar_c);
                ss.put(a2, scar_c);
                ss.put(b1, scar_c);
                ss.put(b2, scar_c);
                ss.put(ridge, scar_c);
            }
        }
        out.push(ss);
    }
    // eyes
    {
        let mut se = Surface::new(mat(0.18));
        let iris = p.eye_colour();
        // real look: a textured eyeball (eyeball.png: 4x4 iris colours along the
        // eye colour chain, each cell the whole ball mapped around the gaze),
        // shaded where the lids hang over it (skin_ao.txt); PLACEHOLDER
        let eye_tex = real.as_ref().map(|d| crate::real::image(d, "eyeball")).filter(|f| crate::real::has(f));
        let eye_ao: Vec<f32> = match (&real, &eye_tex) {
            (Some(d), Some(_)) => crate::real::column(&format!("{d}/skin_ao.txt"), 1.0),
            _ => Vec::new(),
        };
        for k in ["leye", "reye"] {
            let idx = &h.parts[k][0];
            let mut c = [0f32; 3];
            for &v in idx {
                c = add(c, x.pp[v as usize]);
            }
            c = mul(c, 1.0 / idx.len() as f32);
            let mut seen = vec![false; h.n];
            for &v in idx {
                if !seen[v as usize] {
                    seen[v as usize] = true;
                    x.pp[v as usize][2] += 0.012;
                }
            }
            if eye_tex.is_some() {
                let cell = ((p.u(EYE) * 15.0).round() as usize).min(15);
                let (cx, cy) = ((cell % 4) as f32, (cell / 4) as f32);
                // +u away from the nose; a child's iris fills more of the eye
                let temporal = if c[0] >= 0.0 { 1.0 } else { -1.0 };
                let ks = 1.0 / (1.0 + 0.23 * (1.0 - grown));
                let old = ((p.age - 45.0) / 35.0).clamp(0.0, 1.0);
                for &v in idx {
                    let q = sub(x.pp[v as usize], c);
                    let l = len(q).max(1e-9);
                    let rr = (q[2] / l).clamp(-1.0, 1.0).acos() * ks / PI * 0.5;
                    let rho = q[0].hypot(q[1]).max(1e-9);
                    let a = eye_ao.get(v as usize).copied().unwrap_or(1.0).clamp(0.0, 1.0);
                    // linear shade, stored for the sRGB vertex colour
                    let m = (1.0 - 0.7 * (1.0 - a).powf(1.2)).powf(1.0 / 2.2);
                    se.pos.push(x.pp[v as usize]);
                    se.col.push([m, m * (1.0 - 0.03 * old), m * (1.0 - 0.1 * old)]);
                    se.uv.push([(cx + 0.5 + rr * temporal * q[0] / rho) / 4.0, (cy + 0.5 - rr * q[1] / rho) / 4.0]);
                }
                continue;
            }
            let pp = &x.pp;
            let mut color = |_: V3, a: u32, b: u32, cc: u32| {
                let m = mul(add(add(pp[a as usize], pp[b as usize]), pp[cc as usize]), 1.0 / 3.0);
                let q = sub(m, c);
                let d = q[2] / len(q);
                // a child's iris and pupil fill more of the eye
                if d > 0.985 - 0.006 * (1.0 - grown) {
                    hex("#0d0806")
                } else if d > 0.875 - 0.05 * (1.0 - grown) {
                    cmul(iris, if d > 0.95 { 0.85 } else { 1.15 })
                } else {
                    hex("#f4efe7")
                }
            };
            x.facets(&mut se, idx, &|_, _, _, _| true, &mut color, None);
        }
        if real.is_some() {
            let both: Vec<u32> = h.parts["leye"][0].iter().chain(h.parts["reye"][0].iter()).copied().collect();
            let nn = vnormals(&x.pp, &both);
            se.nrm = both.iter().map(|&v| nn[v as usize]).collect();
        }
        se.tex = eye_tex;
        out.push(se);
    }
    let kid = p.age < 13.0;
    // under a hat or cap the hair of the crown stays inside it; what grows
    // just above the band still shows below it
    let hatted = matches!(p.hat_style(), Hat::Cap | Hat::Pileus | Hat::Petasos);
    let under_hat = |q: V3| {
        let d = sub(q, hc);
        let th = d[0].atan2(d[2]);
        hatted && d[1].atan2(d[0].hypot(d[2])) / D2R > lerp(26.0, 6.0, (1.0 - th.cos()) / 2.0) + 4.0
    };
    let hatted_mh = hatted;
    let veiled = long_hair && p.hair_style() == Hair::Veil;
    let mh = if hatted_mh || veiled { None } else { mh_pick(p, long_hair) };
    if let Some((dir, name)) = &mh {
        // hair thins with age: women diffusely over the crown (female pattern
        // hair loss, rising to about half of women past 80; Gan & Sinclair,
        // 2005, not verified online), more with the bald gene. Cards left out,
        // the painted cap of fine hairs lets the scalp show. Men keep their
        // cards (their short cut shows gaps as patches; the bald pattern does
        // the work). Shares PLACEHOLDER
        let thin = if fem { c01((p.age - 45.0) / 40.0) * (0.3 + 0.7 * p.u(BALD)) * 0.55 } else { 0.0 };
        if let Some(sf) = mh_hair2(dir, name, &x.pp, &h.base, hc, &|_| hair, false, (thin, p.seed ^ 0x3c6e_f372)) {
            out.push(sf);
        }
        // real look: a painted cap of fine hairs under the cards, if there is one
        // (grey and white fuzz is see-through: the cap fades towards the skin as
        // the hair greys, else its soft edge lays a pale band over the forehead)
        let cap_c = cmix(hair, skin, (0.7 * thin).max(0.75 * beard_grey));
        if let Some(sf) = mh_hair(dir, &format!("{name}_cap"), &x.pp, &h.base, hc, cap_c) {
            out.push(sf);
        }
    }
    // real look: the Blender beard: cards hanging from the lower face's centre, and the
    // painted layer of short hairs; a little lighter than the hair, greys first at the chin
    if let Some((dir, name)) = &real_beard {
        let hcb = [fit[0][1], ym(6.9), fit[2][0] * 0.35 + fit[2][1]];
        let bcol = |v: V3| cmix(cmul(hair, 1.12), hex("#d6d1c9"), beard_grey * 0.6 * c01((ym(6.8) - v[1]) / (0.6 * hs)));
        if let Some(sf) = mh_hair2(dir, name, &x.pp, &h.base, hcb, &bcol, true, (0.0, 0)) {
            out.push(sf);
        }
        if let Some(sf) = mh_hair2(dir, &format!("{name}_cap"), &x.pp, &h.base, hcb, &bcol, false, (0.0, 0)) {
            out.push(sf);
        }
    }
    if !long_hair && mh.is_none() {
        let mut cap = Surface::new(mat(0.85));
        // the ear seen from the head's centre: from and to (degrees from
        // the front), and its top (degrees up)
        let mut ear = (180f32, 0f32, -90f32);
        for &v in &uniq {
            if h.ear[v as usize] > 0.9 {
                let d = sub(x.pp[v as usize], hc);
                let th = d[0].atan2(d[2]).abs() / D2R;
                let el = (d[1] / dot(d, d).sqrt()).asin() / D2R;
                ear = (ear.0.min(th), ear.1.max(th), ear.2.max(el));
            }
        }
        cap_hair(&mut cap, &mut x.rng, &cast_h, hc, hs, hair, curl, bald, p.age, ear, &under_hat);
        out.push(cap);
    }
    // brows: two rows of short strands along the brow arch, up at the inner
    // end, down at the outer
    {
        let front: Vec<usize> = (0..body_full.len())
            .step_by(3)
            .filter(|&f| {
                let c = x.base_c(body_full[f], body_full[f + 1], body_full[f + 2]);
                c[2] >= 0.95 && c[1] >= 7.4 && c[1] <= 7.75
            })
            .collect();
        // a child's brows are thin and light
        let bc = cmix(skin, cmul(cmix(hair, hex("#2a1d14"), if p.u(HAIR_L) > 0.6 { 0.35 } else { 0.15 }), 0.9), 0.5 + 0.5 * grown);
        let brow_at = |xx: f32, yy: f32| {
            let mut best = front[0];
            let mut bd = f32::MAX;
            for &f in &front {
                let c = x.base_c(body_full[f], body_full[f + 1], body_full[f + 2]);
                let d = (c[0] - xx).powi(2) + (c[1] - yy).powi(2);
                if d < bd {
                    bd = d;
                    best = f;
                }
            }
            let (pa, pb, pc) = (x.pp[body_full[best] as usize], x.pp[body_full[best + 1] as usize], x.pp[body_full[best + 2] as usize]);
            (mul(add(add(pa, pb), pc), 1.0 / 3.0), norm(cross(sub(pb, pa), sub(pc, pa))))
        };
        let (thick, ns) = ((if fem { 0.75 } else { 1.1 }) * (0.55 + 0.45 * grown), if fem { 6 } else { 7 });
        let mut todo = Vec::new();
        for sg in [-1f32, 1.0] {
            for row in 0..2 {
                for k in 0..ns {
                    let t = (k as f32 + row as f32 * 0.45) / ns as f32;
                    if fem && t > 0.97 {
                        continue;
                    }
                    if scars.iter().any(|s| s.bx.is_some_and(|bx| (sg * (0.12 + 0.44 * t) - bx).abs() < 0.035)) {
                        continue;
                    }
                    let ax = 0.12 + 0.44 * t;
                    let y = 7.565 + 0.035 * (t * PI).sin() - 0.02 * (ax - 0.1) + (row as f32 - 0.5) * 0.022 * thick;
                    let (sp, sn) = brow_at(sg * ax, y);
                    let up = if t < 0.35 { 0.55 - t } else if t > 0.7 { -0.35 } else { 0.05 };
                    todo.push((sp, sn, [sg, up, 0.0], t));
                }
            }
        }
        for (sp, sn, dir, t) in todo {
            let ln = (0.12 + 0.03 * x.rng.next()) * if t < 0.2 { 0.85 } else { 1.0 };
            let col = cmul(bc, 0.85 + 0.25 * x.rng.next());
            if real.is_none() {
                strand(&mut strands, sp, sn, dir, ln, 0.04 * thick * (1.0 - 0.45 * t), 0.018 * thick, col, 0.03, 1.05);
            }
        }
        // real look: MakeHuman brows and lashes as textured cards
        if let Some(dir) = &real {
            // (lashes a very dark shade of the brows' colour, not black; PLACEHOLDER)
            for (name, col) in [("eyebrow001", cmul(bc, 0.75)), ("Eyelashes01", cmix(cmul(bc, 0.5), hex("#140d08"), 0.5))] {
                if let Some(sf) = mh_hair(dir, name, &x.pp, &h.base, hc, col) {
                    out.push(sf);
                }
            }
        }
    }
    out.push(strands);

    // --- women's hair c. 300: middle parting, wavy strand bands over the
    // ears to the nape; on top a braid, a bun or a veil ---
    if long_hair {
        let hst = p.hair_style();
        let dd = |t: f32, e: f32| [(e * D2R).cos() * (t * D2R).sin(), (e * D2R).sin(), (e * D2R).cos() * (t * D2R).cos()];
        let ang = |a: V3, b: V3| dot(a, b).clamp(-1.0, 1.0).acos();
        let mut last_r = 0.95 * hs;
        let mut rr = |d: V3, _far: bool| {
            let r = outer_skin(&cast_h, d, hs);
            if r > 0.0 {
                last_r = r;
                r
            } else {
                last_r
            }
        };
        let at = |d: V3, r: f32| madd(hc, d, r);
        let mut hm = Surface::new(mat2(0.8));
        let veil = hst == Hair::Veil;
        let ek = if hst == Hair::Braid { -40.0 } else { -30.0 };
        let kk = norm(dd(180.0, ek));
        // Catmull-Rom through control directions, spaced by arc length
        let path = |cp: &[V3], t: f32| -> V3 {
            let ls: Vec<f32> = cp.windows(2).map(|w| ang(w[0], w[1])).collect();
            let tot: f32 = ls.iter().sum();
            let mut xx = t * tot;
            let mut i = 0;
            while i < ls.len() - 1 && xx > ls[i] {
                xx -= ls[i];
                i += 1;
            }
            let u = if ls[i] > 0.0 { (xx / ls[i]).min(1.0) } else { 0.0 };
            let p0 = if i > 0 { cp[i - 1] } else { mix(cp[0], cp[1], -1.0) };
            let (p1, p2) = (cp[i], cp[i + 1]);
            let p3 = if i + 2 < cp.len() { cp[i + 2] } else { mix(cp[i + 1], cp[i], -1.0) };
            let f = |k: usize| 0.5 * (2.0 * p1[k] + (-p0[k] + p2[k]) * u + (2.0 * p0[k] - 5.0 * p1[k] + 4.0 * p2[k] - p3[k]) * u * u + (-p0[k] + 3.0 * p1[k] - 3.0 * p2[k] + p3[k]) * u * u * u);
            norm([f(0), f(1), f(2)])
        };
        let waves = (3.0 + jround(3.0 * curl)) * if kid { 0.6 } else { 1.0 };
        let w_a = (0.03 + 0.018 * curl) * hs;
        // bands from the parting, three or four to a lock
        let ns = [9, 12, 15, 18][lod];
        let nt = ([10, 13, 16, 19][lod] as f32).max(jround(waves * [2.0, 3.0, 4.0, 4.0][lod] * 2.0 + 3.0)) as usize;
        let cap_t = |s: f32, t: f32| {
            (0.035 + (if veil { 0.03 } else { 0.15 }) * (PI * (t * 1.12).min(1.0)).sin().max(0.0).powf(0.8) * (1.0 - 0.35 * s) * (0.3 + 0.7 * sm(0.0, 0.35, s)) + 0.015 * (1.0 - s).powi(4) * sm(0.02, 0.12, t)) * hs
        };
        // a band's place in its lock: ridge height (-0.3 at the grooves, 1 on
        // the crest) and light (0 at the grooves, 1 on the crest)
        let lock_pos = |i: usize| {
            let w = 3 + (i / 3 + p.seed as usize) % 2;
            let f = (i % w) as f32 / w as f32 * 2.0 - 1.0 + 1.0 / w as f32;
            (1.0 - 1.3 * f * f, 1.0 - f.abs())
        };
        // (with a Blender hairstyle (real look) the bands stay away)
        if mh.is_none() {
        for sg in [1f32, -1.0] {
            let (mut g, mut sk) = (Vec::new(), Vec::new());
            for i in 0..=ns {
                let s = i as f32 / ns as f32;
                let gm = (16.0 + 92.0 * s.powf(1.25)) * D2R;
                let p0 = norm([sg * 0.016 * (1.0 - s), gm.sin(), gm.cos()]);
                let t_ = norm(mix(dd(sg * 58.0, -14.0), dd(sg * 179.0, 34.0), s));
                let e_ = norm(mix(dd(sg * 98.0, -38.0), dd(sg * 182.0, -4.0), s));
                let ridge = lock_pos(i).0;
                let (mut col, mut skr) = (Vec::new(), Vec::new());
                for j in 0..=nt {
                    let t = j as f32 / nt as f32;
                    let d = path(&[p0, t_, e_, kk], t);
                    let r = rr(d, true);
                    let w = (t * PI * 2.0 * waves + (i % 2) as f32 * 0.5).sin() * w_a * sm(0.05, 0.2, t) * (1.0 - sm(0.75, 1.0, t));
                    col.push(at(d, r + cap_t(s, t) + ridge * 0.03 * hs * sm(0.0, 0.15, t) + w));
                    skr.push(at(d, r - 0.006 * hs));
                }
                g.push(col);
                sk.push(skr);
            }
            for i in 0..ns {
                for j in 0..nt {
                    let t = (j as f32 + 0.5) / nt as f32;
                    let crest = 0.5 + 0.5 * (t * PI * 2.0 * waves + 0.9).sin();
                    let lit = 0.74 + 0.26 * (lock_pos(i).1 + lock_pos(i + 1).1) / 2.0;
                    let c = cmul(hair, lit * (0.84 + 0.2 * crest) * (0.96 + 0.06 * x.rng.next()));
                    if sg > 0.0 {
                        hm.quad(g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1], c);
                    } else {
                        hm.quad(g[i][j], g[i][j + 1], g[i + 1][j + 1], g[i + 1][j], c);
                    }
                }
            }
            // close the edges: the forehead's (first strand) and the parting
            for j in 0..nt {
                hm.quad(g[0][j], g[0][j + 1], sk[0][j + 1], sk[0][j], cmul(hair, 0.62));
            }
            for i in 0..ns {
                hm.quad(g[i][0], g[i + 1][0], sk[i + 1][0], sk[i][0], cmul(hair, 0.55));
            }
            // nape: from the hairline behind the ear up to the bun
            let (nu, nv) = ([3, 4, 5, 6][lod], [4, 5, 6, 7][lod]);
            let (mut l2, mut s2) = (Vec::new(), Vec::new());
            for i in 0..=nu {
                let u = i as f32 / nu as f32;
                let h0 = norm(mix(dd(sg * 98.0, -40.0), dd(sg * 181.0, -64.0), u));
                let (mut col, mut skr) = (Vec::new(), Vec::new());
                for j in 0..=nv {
                    let t = j as f32 / nv as f32;
                    let d = norm(mix(h0, kk, t));
                    let r = rr(d, true);
                    col.push(at(d, r + (0.03 + 0.05 * (PI * t).sin()) * hs + if i % 2 == 1 { 0.008 * hs } else { 0.0 }));
                    skr.push(at(d, r - 0.006 * hs));
                }
                l2.push(col);
                s2.push(skr);
            }
            for i in 0..nu {
                for j in 0..nv {
                    let c = cmul(hair, (if i % 2 == 1 { 0.95 } else { 0.8 }) * (0.94 + 0.08 * x.rng.next()));
                    if sg > 0.0 {
                        hm.quad(l2[i][j], l2[i + 1][j], l2[i + 1][j + 1], l2[i][j + 1], c);
                    } else {
                        hm.quad(l2[i][j], l2[i][j + 1], l2[i + 1][j + 1], l2[i + 1][j], c);
                    }
                }
            }
            for i in 0..nu {
                hm.quad(l2[i][0], l2[i + 1][0], s2[i + 1][0], s2[i][0], cmul(hair, 0.6));
            }
        }
        let nk = kk;
        let ak = [1.0, 0.0, 0.0];
        let bk = norm(cross(nk, ak));
        let q = at(kk, rr(kk, true) + 0.04 * hs);
        // a tube along a centre line, pentagonal, light and dark as if plaited
        let tube = |hm: &mut Surface, pts: &[V3], rad: &dyn Fn(f32) -> f32, col_f: &dyn Fn(usize) -> Rgb| {
            const SIDES: usize = 5;
            let mut prev: Option<Vec<V3>> = None;
            for k in 0..pts.len() {
                let (c, nx, pv) = (pts[k], pts[(k + 1).min(pts.len() - 1)], pts[k.saturating_sub(1)]);
                let tg = norm(sub(nx, pv));
                let u = norm(cross(tg, nk));
                let v = norm(cross(tg, u));
                let r = rad(k as f32 / (pts.len() - 1) as f32);
                let ring: Vec<V3> = (0..SIDES)
                    .map(|q| {
                        let a = q as f32 / SIDES as f32 * PI * 2.0;
                        madd(c, add(mul(u, a.cos()), mul(v, a.sin())), r)
                    })
                    .collect();
                if let Some(pr) = &prev {
                    let cc = col_f(k);
                    for q in 0..SIDES {
                        let q2 = (q + 1) % SIDES;
                        hm.quad(pr[q], pr[q2], ring[q2], ring[q], cmul(cc, if q % 2 == 1 { 0.9 } else { 1.0 }));
                    }
                } else {
                    for q in 1..SIDES - 1 {
                        hm.tri(ring[0], ring[q], ring[q + 1], cmul(col_f(0), 0.7));
                    }
                }
                prev = Some(ring);
            }
            let pr = prev.unwrap();
            for q in 1..SIDES - 1 {
                hm.tri(pr[0], pr[q + 1], pr[q], cmul(col_f(pts.len() - 1), 0.7));
            }
        };
        if hst == Hair::Bun || hst == Hair::Veil {
            // nape bun: two turns of a plait, narrowing outwards
            let segs = [14, 18, 22, 24][lod];
            let sz = if kid { 0.7 } else { 1.0 };
            let pts: Vec<V3> = (0..=segs)
                .map(|k| {
                    let f = k as f32 / segs as f32;
                    let a = f * 2.0 * PI * 2.0;
                    let rad = lerp(0.25, 0.07, f) * hs * sz;
                    let hh = lerp(0.07, 0.2, f) * hs * sz;
                    madd(madd(q, nk, hh), add(mul(ak, a.cos()), mul(bk, a.sin())), rad)
                })
                .collect();
            if !veil {
                tube(&mut hm, &pts, &|f| (0.1 - 0.035 * f) * hs * sz, &|k| cmul(hair, if k % 2 == 1 { 0.8 } else { 0.98 }));
            }
        }
        }
        if hst == Hair::Braid && mh.is_none() {
            // braid from the nape over the back of the head up to the crown,
            // a herringbone of staggered leaves
            let nb = [8, 10, 12, 13][lod];
            // (over the crown to the top of the forehead, as Helena wears it)
            let (e0, e1) = (ek + 6.0, 150.0);
            for k in 0..nb {
                for side in [-1f32, 1.0] {
                    let f = (k as f32 + if side > 0.0 { 0.5 } else { 0.0 }) / nb as f32;
                    let e = lerp(e0, e1, f);
                    let d = dd(180.0, e);
                    let r = rr(d, true) + (lerp(0.2, 0.11, sm(0.55, 1.0, f)) + 0.03 * (PI * f).sin()) * hs;
                    let c = at(d, r);
                    let up = norm([0.0, (e * D2R).cos(), (e * D2R).sin()]);
                    let wv = (1.0 - 0.45 * f) * hs;
                    let ax = norm(add(mul([1.0, 0.0, 0.0], -side * 0.55), up));
                    let la = norm(cross(ax, d));
                    let cc = [c[0] + side * 0.09 * wv, c[1], c[2]];
                    let (l, w, hh) = (0.16 * wv, 0.085 * wv, 0.07 * wv);
                    let (pa, pb, pc, pd) = (madd(cc, ax, l), madd(cc, ax, -l), madd(cc, la, w), madd(cc, la, -w));
                    let (pt, pu) = (madd(cc, d, hh), madd(cc, d, -hh * 0.6));
                    let col = cmul(hair, if side > 0.0 { 0.95 } else { 0.85 });
                    hm.tri(pa, pc, pt, col);
                    hm.tri(pc, pb, pt, cmul(col, 0.9));
                    hm.tri(pb, pd, pt, cmul(col, 0.85));
                    hm.tri(pd, pa, pt, cmul(col, 0.95));
                    let dim = cmul(col, 0.6);
                    hm.tri(pa, pu, pc, dim);
                    hm.tri(pc, pu, pb, dim);
                    hm.tri(pb, pu, pd, dim);
                    hm.tri(pd, pu, pa, dim);
                }
            }
        }
        out.push(hm);
        if veil {
            // the palla drawn over the head: open around the face, falling
            // in folds onto the shoulders
            let vcol = dress(hex(st.palla.unwrap_or(["#e9e2d2", "#c8b68c", "#8396ad", "#a4664f", "#6f7d5c"][(p.seed % 5) as usize])), [0.0, 7.5, 0.0]);
            // real look: the veil draped in Blender (APOLEIA_MH_CLOTHES)
            let real_veil = if real.is_some() { crate::real::dir("APOLEIA_MH_CLOTHES").and_then(|d| mh_cloth(&d, "cloth_veil", &x.pp, &h.base, &|_| vcol, None)) } else { None };
            if let Some(s) = real_veil {
                out.push(s);
            } else {
            const VE: [[f32; 2]; 7] = [[44.0, 0.0], [30.0, 36.0], [12.0, 60.0], [-8.0, 74.0], [-35.0, 86.0], [-60.0, 94.0], [-80.0, 98.0]];
            let th_e = |e: f32| {
                if e >= 44.0 {
                    return 0.0;
                }
                for k in 1..VE.len() {
                    if e >= VE[k][0] {
                        return lerp(VE[k][1], VE[k - 1][1], (e - VE[k][0]) / (VE[k - 1][0] - VE[k][0]));
                    }
                }
                98.0
            };
            let (nr, nc) = ([10, 12, 15, 17][lod], [16, 20, 26, 30][lod]);
            let nf = 5.0 + (p.seed % 3) as f32;
            let ph = x.rng.next() * 6.0;
            let e_at = |r: usize| lerp(86.0, -64.0, (r as f32 / nr as f32).powf(0.85));
            let mut gv: Vec<Vec<V3>> = Vec::new();
            let mut prev_r: Option<Vec<f32>> = None;
            for r in 0..=nr {
                let e = e_at(r);
                let th0 = th_e(e);
                let (mut row, mut rads) = (Vec::new(), Vec::new());
                for c in 0..=nc {
                    let cc = -1.0 + 2.0 * c as f32 / nc as f32;
                    let d = dd(180.0 + cc * (180.0 - th0), e);
                    let mut rad = rr(d, e < -20.0) + (0.15 + 0.12 * (-(ang(d, kk) / 0.5).powi(2)).exp()) * hs;
                    if let Some(pr) = &prev_r {
                        if e < -5.0 {
                            let de = (e_at(r - 1) - e) * PI / 180.0;
                            let fall = pr[c] * (e_at(r - 1) * D2R).cos() / (e * D2R).cos() * 0.985;
                            rad = fall.max(rad.min(fall + 0.4 * hs * de));
                        }
                    }
                    rads.push(rad);
                    let fold = (cc * nf * PI + ph).sin() * 0.035 * hs * sm(40.0, -50.0, e);
                    row.push(at(d, rad + fold));
                }
                gv.push(row);
                prev_r = Some(rads);
            }
            let mut vm = Surface::new(mat2(0.95));
            for r in 0..nr {
                for c in 0..nc {
                    let cc = -1.0 + 2.0 * (c as f32 + 0.5) / nc as f32;
                    let shade = 0.86 + 0.14 * (cc * nf * PI + ph + 0.6).sin();
                    let col = cmul(vcol, shade * (0.95 + 0.06 * x.rng.next()));
                    vm.tri(gv[r][c], gv[r][c + 1], gv[r + 1][c + 1], col);
                    vm.tri(gv[r][c], gv[r + 1][c + 1], gv[r + 1][c], cmul(col, 0.97));
                }
            }
            out.push(vm);
            }
        }
    }

    // clothing: a tunic over the tights helper's place, toga and cloak as
    // further shells
    let tc = hex(st.tunic[(p.seed as usize) % st.tunic.len()]);
    // a baby in its first year is swaddled: linen bands wound crosswise
    // around the body up to the neck (fasciae; Soranus, Gynaecology 2.14-15)
    let swaddled = p.age < 1.0;
    // the angle round the base mesh's axis, 0 in front, 1 at the back
    let theta = |c: V3| (c[0].atan2(c[2] - 0.45)).abs() / PI;
    let neck_ok = |c: V3| {
        let front = c[2] > 0.25;
        if c[1] > 6.3 {
            return false;
        }
        let t = theta(c);
        c[1] < lerp(if fem { 5.6 } else { 5.5 }, 5.9, c01(t * 1.6)) - 0.12 * c01(1.0 - c[0].abs() / 0.6) * if front { 1.0 } else { 0.0 }
    };
    let wt = p.phen(WEIGHT);
    // real look: the tunic draped in Blender (APOLEIA_MH_CLOTHES names the folder)
    let zc0 = fit[2][0] * 0.2 + fit[2][1];
    // the patch grid as seen from the front (and from the back): a grid round the
    // body's axis fans out where the chest bulges and the shoulders slope back
    let cell = |v: V3| -> [f32; 2] { [v[0] / 0.6 + if v[2] < zc0 { 50.0 } else { 0.0 }, v[1] / 0.6] };
    // real look: the colour of a Blender garment at v: the cloth's dye as dress() gives
    // it, patches as pieces sewn on
    let dbg_cells = std::env::var_os("APOLEIA_DEBUG_CELLS").is_some();
    let toga_dye = hex(if std::env::var_os("APOLEIA_DEBUG_TOGA").is_some() { "#c04040" } else { "#efe9dc" });
    let cloth_col = |base: Rgb, v: V3| -> Rgb {
        // patches as pieces sewn on: inside a cell of about 6 x 6 cm, with
        // a darker seam along the edge
        let q = cell(v);
        let (cx, cy) = (q[0].floor(), q[1].floor());
        let (fx, fy) = (q[0] - cx, q[1] - cy);
        let dbg = dbg_cells;
        // a cell's patch; neighbouring patches join into one larger piece
        let pc = |i: f32, j: f32| patched([i * 0.38 + 0.19, j * 0.38 + 0.19, 7.0]) || dbg && (i + j) as i32 % 2 == 0;
        let plain = cmix(dress0(base), hex("#2f2b28"), 0.65 * lf.mourn);
        if !pc(cx, cy) {
            return plain;
        }
        let side = |f: f32| if f < 0.1 { -1.0 } else if f > 0.9 { 1.0 } else { 0.0 };
        let (sx, sy) = (side(fx), side(fy));
        if sx != 0.0 && !pc(cx + sx, cy) || sy != 0.0 && !pc(cx, cy + sy) || sx != 0.0 && sy != 0.0 && !pc(cx + sx, cy + sy) {
            return plain;
        }
        // PLACEHOLDER: the patch half the other cloth, a little darker
        let k = cmix(cmul(cmix(dress0(base), patch, 0.5), 0.9), hex("#2f2b28"), 0.65 * lf.mourn);
        let seam = |f: f32, i: f32, j: f32| (0.1..0.14).contains(&f) && !pc(i, j);
        let seam2 = |f: f32, i: f32, j: f32| f <= 0.9 && f > 0.86 && !pc(i, j);
        if seam(fx, cx - 1.0, cy) || seam2(fx, cx + 1.0, cy) || seam(fy, cx, cy - 1.0) || seam2(fy, cx, cy + 1.0) {
            return cmul(k, 0.7);
        }
        k
    };
    let real_tunic = if real.is_some() && !swaddled {
        crate::real::dir("APOLEIA_MH_CLOTHES").and_then(|d| {
            let col = |v: V3| {
                if st.stripe > 0.0 && !fem && !st.toga && v[2] > 0.3 && (v[0].abs() - 0.4).abs() < st.stripe && v[1] < ym(5.35) {
                    return hex("#5e1a44");
                }
                cloth_col(tc, v)
            };
            mh_cloth(&d, "cloth_tunic", &x.pp, &h.base, &col, Some(&cell))
        })
    } else {
        None
    };
    let had_tunic = real_tunic.is_some();
    if let Some(s) = real_tunic {
        out.push(s);
    }
    if !had_tunic {
        let mut s = Surface::new(mat(0.95));
        let off = 0.06 + 0.03 * wt;
        x.facets(
            &mut s,
            body_full,
            &|c, _, _, _| neck_ok(c),
            &mut |c, a, b, cc| {
                let hh = hash(a, b, cc);
                if swaddled {
                    let u = (c[1] + 0.7 * c[0] * if c[1] > 5.2 { 1.0 } else { -1.0 }) / 0.3;
                    let f = u - u.floor();
                    let band = if f < 0.14 {
                        "#8f7f62"
                    } else if (u.floor() as i32) % 2 == 0 {
                        "#dccfb3"
                    } else {
                        "#bfae8c"
                    };
                    return cmul(hex(band), 0.94 + 0.08 * hh);
                }
                if st.stripe > 0.0 && !fem && !st.toga && c[2] > 0.3 && c[1] < 5.35 && (c[0].abs() - 0.4).abs() < st.stripe {
                    return cmul(hex("#5e1a44"), 0.92 + 0.1 * hh);
                }
                cmul(dress(tc, c), 0.88 + 0.14 * hh)
            },
            Some((&nb, &|_| off)),
        );
        out.push(s);
    }
    // real look: the toga draped in Blender
    let real_toga = if st.toga && !fem && !swaddled && real.is_some() {
        crate::real::dir("APOLEIA_MH_CLOTHES").and_then(|d| mh_cloth(&d, "cloth_toga", &x.pp, &h.base, &|v| cloth_col(toga_dye, v), Some(&cell)))
    } else {
        None
    };
    let had_toga = real_toga.is_some();
    if let Some(s) = real_toga {
        out.push(s);
    }
    if st.toga && !fem && !swaddled && !had_toga {
        let in_toga = |c: V3| {
            let [xx, yy, zz] = c;
            if !neck_ok(c) {
                return false;
            }
            if xx > 0.7 && yy > 4.7 {
                return true;
            }
            let t = ((xx - 1.25) * -1.95 + (yy - 5.5) * -1.8) / (1.95 * 1.95 + 1.8 * 1.8);
            let (px, py) = (1.25 - 1.95 * t, 5.5 - 1.8 * t);
            zz > -0.3 && (xx - px).hypot(yy - py) < 0.42
        };
        let mut s = Surface::new(mat(0.95));
        let off = 0.16 + 0.03 * wt;
        x.facets(&mut s, body_full, &|c, _, _, _| in_toga(c), &mut |c, a, b, cc| cmul(dress(hex("#efe9dc"), c), 0.84 + 0.2 * hash(a, b, cc)), Some((&nb, &|_| off)));
        out.push(s);
    }
    let cloak = match (st.chlamys, st.palla) {
        (Some(c), _) if !fem => Some(c),
        (_, Some(c)) if fem => Some(c),
        _ => None,
    };
    // real look: the women's palla draped in Blender
    let real_palla = match (cloak, swaddled) {
        (Some(c), false) if fem && real.is_some() => {
            let dye = hex(c);
            crate::real::dir("APOLEIA_MH_CLOTHES").and_then(|d| mh_cloth(&d, "cloth_palla", &x.pp, &h.base, &|v| cloth_col(dye, v), Some(&cell)))
        }
        _ => None,
    };
    let had_palla = real_palla.is_some();
    if let Some(s) = real_palla {
        out.push(s);
    }
    if let (Some(cloak), false, false) = (cloak, swaddled, had_palla) {
        let open = |c: V3| {
            if !neck_ok(c) {
                return false;
            }
            !(c[2] > 0.2 && c[0] > (if fem { -0.85 } else { -1.0 }) && c[0] < if fem { 0.85 } else { 0.75 })
        };
        let mut s = Surface::new(mat(0.9));
        let off = 0.14 + 0.03 * wt;
        let cc = hex(cloak);
        x.facets(&mut s, body_full, &|c, _, _, _| open(c), &mut |c, a, b, c3| cmul(dress(cc, c), 0.85 + 0.2 * hash(a, b, c3)), Some((&nb, &|_| off)));
        out.push(s);
        if !fem {
            let mut g = Surface::new(Mat { rough: 0.32, metal: 0.85, double: false });
            let at = madd(x.pp[h.fibula], nb[h.fibula], 0.2);
            solid(&mut g, &icosahedron(), at, [0.11; 3], &euler(0.0, 0.0, 0.0), hex("#d8b04c"));
            out.push(g);
        }
    }

    // --- headwear and jewellery by stand ---
    let hw = p.hat_style();
    let jw = p.jewel_style();
    let mut hat_top = -1e9f32;
    {
        let dd = |t: f32, e: f32| [(e * D2R).cos() * (t * D2R).sin(), (e * D2R).sin(), (e * D2R).cos() * (t * D2R).cos()];
        let at2 = |d: V3, r: f32| madd(hc, d, r);
        let rh = |d: V3| {
            let r = cast_h.cast(d, false);
            if r > 0.0 {
                r
            } else {
                0.9 * hs
            }
        };
        let hair_off = (if long_hair {
            0.16
        } else if bald > 0.9 {
            0.03
        } else {
            0.085 + 0.04 * curl
        }) * hs;
        let (mut a0, mut g0, mut w0) = (Surface::new(mat2(0.95)), Surface::new(Mat { rough: 0.35, metal: 0.8, double: false }), Surface::new(mat(0.3)));
        // hat band: on the forehead in front, lower on the back of the head
        let band = |nn: usize, lift: f32, off: f32| -> Vec<V3> {
            (0..nn)
                .map(|k| {
                    let th = k as f32 / nn as f32 * 360.0;
                    let e = lerp(26.0, 6.0, (1.0 - (th * D2R).cos()) / 2.0) + lift;
                    let d = dd(th, e);
                    at2(d, rh(d) + off)
                })
                .collect()
        };
        let cen = |ring: &[V3]| mul(ring.iter().fold([0.0; 3], |s, &q| add(s, q)), 1.0 / ring.len() as f32);
        let up = |ring: &[V3], hh: f32, sc: f32, back: f32| -> Vec<V3> {
            let c = cen(ring);
            ring.iter().map(|q| [c[0] + (q[0] - c[0]) * sc, q[1] + hh, c[2] + (q[2] - c[2]) * sc - back * hh]).collect()
        };
        let loft = |s: &mut Surface, a: &[V3], b: &[V3], col: Rgb| {
            for k in 0..a.len() {
                let k2 = (k + 1) % a.len();
                let c = cmul(col, 0.9 + 0.12 * ((k * 5) % 3) as f32 / 2.0);
                s.tri(a[k], a[k2], b[k2], c);
                s.tri(a[k], b[k2], b[k], cmul(c, 0.96));
            }
        };
        let fan = |s: &mut Surface, ring: &[V3], apex: V3, col: Rgb| {
            for k in 0..ring.len() {
                s.tri(ring[k], ring[(k + 1) % ring.len()], apex, cmul(col, 0.93 + 0.1 * (k % 2) as f32));
            }
        };
        let felt = hex(["#5f5446", "#6e5f4a", "#4d4b45", "#7a6a52"][(p.seed % 4) as usize]);
        match hw {
            Hat::Cap => {
                // Pannonian felt cap: a low cylinder with a flat top, as the Tetrarchs wear in Venice
                // (a little wider at the top, the upper edge rounded)
                let b0 = band(32, 0.0, hair_off);
                let rings: Vec<Vec<V3>> = [(0.0, 1.0), (0.12, 1.02), (0.22, 1.03), (0.27, 1.0), (0.295, 0.9)].iter().map(|&(hh, sc)| up(&b0, hh * hs, sc, 0.15)).collect();
                for i in 0..rings.len() - 1 {
                    loft(&mut a0, &rings[i], &rings[i + 1], cmul(felt, [0.96, 1.0, 1.04, 1.1][i]));
                }
                let last = &rings[rings.len() - 1];
                let c = cen(last);
                fan(&mut a0, last, [c[0], c[1] + 0.02 * hs, c[2]], cmul(felt, 1.12));
                let (r0, r1) = (up(&b0, -0.005 * hs, 1.03, 0.0), up(&b0, 0.06 * hs, 1.035, 0.0));
                loft(&mut a0, &r0, &r1, cmul(felt, 0.78));
                loft(&mut a0, &r1, &up(&b0, 0.06 * hs, 1.0, 0.0), cmul(felt, 0.9));
                hat_top = hat_top.max(c[1] + 0.02 * hs);
            }
            Hat::Pileus => {
                // felt cap of workers and freedmen: a rolled rim, then a
                // rounded cone leaning a little back
                let col = hex(["#6b5440", "#7a7266", "#9a8f78", "#5e3b2c"][(p.seed / 4 % 4) as usize]);
                let b0 = band(24, -1.0, hair_off + 0.01 * hs);
                let rim = [up(&b0, 0.0, 1.0, 0.0), up(&b0, 0.02 * hs, 1.045, 0.0), up(&b0, 0.055 * hs, 1.05, 0.0), up(&b0, 0.08 * hs, 1.0, 0.0)];
                for i in 0..3 {
                    loft(&mut a0, &rim[i], &rim[i + 1], cmul(col, [0.82, 1.0, 0.9][i]));
                }
                let cone: Vec<Vec<V3>> = [(0.08, 1.0), (0.2, 0.97), (0.31, 0.88), (0.41, 0.72), (0.49, 0.5), (0.54, 0.26)].iter().map(|&(hh, sc)| up(&b0, hh * hs, sc, 0.15)).collect();
                for i in 0..cone.len() - 1 {
                    loft(&mut a0, &cone[i], &cone[i + 1], cmul(col, 0.94 + 0.05 * (i % 2) as f32));
                }
                let last = &cone[cone.len() - 1];
                let c = cen(last);
                fan(&mut a0, last, [c[0], c[1] + 0.025 * hs, c[2] - 0.01 * hs], cmul(col, 1.04));
                hat_top = hat_top.max(c[1] + 0.025 * hs);
            }
            Hat::Petasos => {
                // straw sun hat: a rounded crown with a cord band, a wide brim
                // with an upper and an under side and a rim, drooping to the
                // sides and back. Woven straw shows as rings of light and
                // dark; a flat thin brim read as a halo (Ramon, 31.10.2026).
                let straw = cmix(hex("#b8975a"), hex("#8a6a3e"), 0.15 + 0.3 * hash(p.seed, 3, 7));
                let n = 32;
                let b0 = band(n, 0.0, hair_off + 0.01 * hs);
                let crown: Vec<Vec<V3>> = [(0.0, 1.0), (0.1, 1.0), (0.19, 0.96), (0.27, 0.86), (0.32, 0.68), (0.345, 0.4)].iter().map(|&(hh, sc)| up(&b0, hh * hs, sc, 0.05)).collect();
                for i in 0..crown.len() - 1 {
                    loft(&mut a0, &crown[i], &crown[i + 1], cmul(straw, [1.0, 1.04, 0.96, 1.06, 1.0][i]));
                }
                let c = cen(&crown[crown.len() - 1]);
                fan(&mut a0, &crown[crown.len() - 1], [c[0], c[1] + 0.012 * hs, c[2]], cmul(straw, 1.08));
                // the cord: a darker band around the foot of the crown
                let cord = cmix(hex("#4a3424"), hex("#7a2e22"), hash(p.seed, 5, 1).round());
                let (k0, k1) = (up(&b0, 0.03 * hs, 1.035, 0.05), up(&b0, 0.085 * hs, 1.03, 0.05));
                loft(&mut a0, &k0, &k1, cord);
                loft(&mut a0, &up(&b0, 0.03 * hs, 1.0, 0.05), &k0, cmul(cord, 0.7));
                loft(&mut a0, &k1, &up(&b0, 0.085 * hs, 1.0, 0.05), cmul(cord, 1.1));
                // the brim in rings out from the head; it droops more at the
                // back than in front, so the face stays free
                let c0 = cen(&b0);
                let width = (0.5 + 0.06 * hash(p.seed, 9, 2)) * hs;
                let thick = 0.035 * hs;
                let ts = [0.0f32, 0.25, 0.5, 0.75, 1.0];
                let top: Vec<Vec<V3>> = ts
                    .iter()
                    .map(|&t| {
                        b0.iter()
                            .enumerate()
                            .map(|(k, q)| {
                                let th = k as f32 / n as f32 * 2.0 * PI;
                                let (dx, dz) = (q[0] - c0[0], q[2] - c0[2]);
                                let l = dx.hypot(dz).max(1e-6);
                                let w = width * t * (1.0 + 0.05 * (k as f32 * 1.7).sin());
                                let droop = lerp(0.55, 1.0, (1.0 - th.cos()) / 2.0) * (0.02 + 0.2 * t * t) * hs;
                                [q[0] + dx / l * w, q[1] - droop, q[2] + dz / l * w]
                            })
                            .collect()
                    })
                    .collect();
                let under: Vec<Vec<V3>> = top.iter().map(|r| r.iter().map(|q| [q[0], q[1] - thick, q[2]]).collect()).collect();
                for i in 0..ts.len() - 1 {
                    // upper side outer to inner, under side inner to outer
                    loft(&mut a0, &top[i + 1], &top[i], cmul(straw, if i % 2 == 0 { 1.02 } else { 0.9 }));
                    loft(&mut a0, &under[i], &under[i + 1], cmul(straw, if i % 2 == 0 { 0.6 } else { 0.54 }));
                }
                loft(&mut a0, &under[ts.len() - 1], &top[ts.len() - 1], cmul(straw, 0.78));
                hat_top = hat_top.max(crown[crown.len() - 1].iter().fold(-1e9f32, |m, q| m.max(q[1])));
            }
            Hat::Diadem => {
                // jewelled diadem: a gold band, pearls on top, a stone over the forehead
                let b0 = band(28, 1.0, hair_off + 0.012 * hs);
                let b1 = band(28, 5.0, hair_off + 0.018 * hs);
                loft(&mut g0, &b0, &b1, hex("#d8b04c"));
                for (k, q) in b1.iter().enumerate() {
                    if k % 2 == 0 {
                        gem(&mut w0, [q[0], q[1] + 0.02 * hs, q[2]], 0.026 * hs, hex("#f2ece0"));
                    }
                }
                let fq = b1[0];
                gem(&mut g0, [fq[0], fq[1] + 0.03 * hs, fq[2] + 0.02 * hs], 0.05 * hs, hex("#7a1a2a"));
            }
            Hat::Wreath => {
                // a gold laurel wreath: two branches from the nape to the
                // forehead, the leaves pointing forward in pairs, one tilted
                // up and out, one down and out, a midrib folded up
                let mut leaves = Surface::new(Mat { rough: 0.4, metal: 0.6, double: true });
                // on the hair like a hat band: on the forehead in front,
                // lower on the back of the head
                let ring = |a: f32| {
                    let th = a / D2R;
                    let d = dd(th, lerp(30.0, 8.0, (1.0 - a.cos()) / 2.0));
                    at2(d, rh(d) + hair_off + 0.03 * hs)
                };
                let per = 15;
                for sg in [1f32, -1.0] {
                    for k in 0..per {
                        let f = k as f32 / (per - 1) as f32;
                        let a = sg * lerp(PI * 0.94, 0.16, f);
                        let at = ring(a);
                        // along the ring towards the front, outwards, up
                        let tan = norm(sub(ring(a - sg * 0.05), at));
                        let out_ = norm(sub(at, hc));
                        for (j, tilt) in [0.55f32, -0.4].into_iter().enumerate() {
                            let ln = (0.2 + 0.04 * hash(k as u32, j as u32, 11)) * hs * lerp(0.75, 1.0, f);
                            let wd = 0.42 * ln;
                            let ax = norm(add(add(mul(tan, 1.0), mul([0.0, 1.0, 0.0], tilt)), mul(out_, 0.3)));
                            let side = norm(cross(ax, out_));
                            let base = madd(at, ax, -0.02);
                            let tip = madd(base, ax, ln);
                            let mid = madd(madd(base, ax, 0.45 * ln), out_, 0.08 * ln);
                            let (l, r) = (madd(madd(base, ax, 0.42 * ln), side, wd * 0.5), madd(madd(base, ax, 0.42 * ln), side, -wd * 0.5));
                            let c = cmul(hex("#c9a640"), 0.86 + 0.24 * hash(k as u32, j as u32, sg.to_bits()));
                            let (b, t, m) = (base, tip, mid);
                            leaves.tri(b, l, m, c);
                            leaves.tri(m, l, t, cmul(c, 1.08));
                            leaves.tri(b, m, r, cmul(c, 0.86));
                            leaves.tri(m, t, r, cmul(c, 0.94));
                        }
                    }
                }
                out.push(leaves);
                hat_top = hat_top.max(ym(8.3));
            }
            Hat::None => {}
        }
        // earrings at the lowest point of the earlobe, a chain around the base of the neck
        if jw != Jewel::None {
            let gold = hex("#d8b04c");
            let pearl = hex("#f2ece0");
            for sg in [1f32, -1.0] {
                let (mut lo, mut ly) = (usize::MAX, 1e9f32);
                for &v in &uniq {
                    let v = v as usize;
                    let q = x.pp[v];
                    let s = if q[0] > 0.0 { 1.0 } else if q[0] < 0.0 { -1.0 } else { 0.0 };
                    if h.ear[v] > 0.5 && s == sg && q[1] < ly && h.base[v][1] > 6.8 {
                        ly = q[1];
                        lo = v;
                    }
                }
                if lo == usize::MAX {
                    continue;
                }
                let q = [x.pp[lo][0] + sg * 0.015 * hs, x.pp[lo][1] - 0.035 * hs, x.pp[lo][2]];
                gem(&mut g0, q, 0.028 * hs, gold);
                gem(&mut g0, [q[0], q[1] - 0.075 * hs, q[2]], 0.042 * hs, gold);
                if jw == Jewel::Pearls {
                    gem(&mut w0, [q[0], q[1] - 0.15 * hs, q[2]], 0.04 * hs, pearl);
                }
            }
            if jw == Jewel::Chain || jw == Jewel::Pearls {
                let nc = [fit[0][1], ym(6.12), fit[2][0] * 0.25 + fit[2][1]];
                let cn = Caster::new(nc, &pp_snapshot, body_full);
                let step = if jw == Jewel::Pearls { 6 } else { 5 };
                let mut th = -96;
                while th <= 96 {
                    let thf = th as f32;
                    let e = -10.0 - 16.0 * (thf * D2R).cos().powi(2);
                    let d = dd(thf, e);
                    let r = cn.cast(d, false);
                    if r >= 0.0 {
                        let q = madd(nc, d, r + 0.03 * hs);
                        if jw == Jewel::Pearls {
                            gem(&mut w0, q, 0.032 * hs, pearl);
                        } else {
                            gem(&mut g0, q, 0.022 * hs, gold);
                        }
                    }
                    th += step;
                }
                if jw == Jewel::Chain {
                    let d = dd(0.0, -26.0);
                    let r = cn.cast(d, false);
                    if r > 0.0 {
                        let q = madd(nc, d, r + 0.05 * hs);
                        gem(&mut g0, [q[0], q[1] - 0.06 * hs, q[2]], 0.05 * hs, hex("#2e6a5a"));
                    }
                }
            }
        }
        // a freeborn child's amulet on a cord: the boy's round bulla until
        // he takes the man's toga, the girl's crescent lunula until she
        // marries; gold in the upper stands, bronze, or leather for the
        // poor ("nodus tantum et signum de paupere loro", Juvenal 5.165).
        // Slaves' children wear none.
        let amulet = p.age >= 1.5 && p.age < if fem { 13.0 } else { 16.0 } && p.stand != SKLAVE;
        if amulet {
            let nc = [fit[0][1], ym(6.12), fit[2][0] * 0.25 + fit[2][1]];
            let cn = Caster::new(nc, &pp_snapshot, body_full);
            let cord = hex("#3b2a1c");
            let mut th = -96;
            while th <= 96 {
                let thf = th as f32;
                let d = dd(thf, -12.0 - 18.0 * (thf * D2R).cos().powi(2));
                let r = cn.cast(d, false);
                if r >= 0.0 {
                    gem(&mut a0, madd(nc, d, r + 0.03 * hs), 0.02 * hs, cord);
                }
                th += 5;
            }
            let d = dd(0.0, -30.0);
            let r = cn.cast(d, false);
            if r > 0.0 {
                let q = madd(nc, d, r + 0.1);
                let q = [q[0], q[1] - 0.1 * hs, q[2]];
                let (metal, col) = match p.stand {
                    DECURIO | SENATOR | KAISER => (true, hex("#d8b04c")),
                    HAENDLER | HANDWERKER => (true, hex("#b07a3c")),
                    _ => (false, hex("#6b4a2b")),
                };
                let sf = if metal { &mut g0 } else { &mut a0 };
                if fem {
                    // the crescent, horns up
                    for k in 0..9 {
                        let t = (k as f32 / 8.0 - 0.5) * 2.4;
                        let at = [q[0] + 0.12 * hs * t.sin(), q[1] - 0.085 * hs * t.cos() + 0.02 * hs, q[2]];
                        gem(sf, at, (0.04 - 0.015 * (t / 1.2).abs()) * hs, col);
                    }
                } else {
                    solid(sf, &icosahedron(), q, [0.11 * hs, 0.11 * hs, 0.05 * hs], &euler(0.0, 0.0, 0.3), col);
                }
            }
        }
        for v in a0.pos.iter().chain(&g0.pos) {
            hat_top = hat_top.max(v[1]);
        }
        out.extend([a0, g0, w0]);
    }
    // the frame from the head's size
    let (mut y0, mut y1, mut hx, mut hz, mut hn) = (1e9f32, -1e9f32, 0f32, 0f32, 0);
    for &v in body_full {
        let b = h.base[v as usize];
        if b[1] > 6.1 && b[0].abs() < 0.95 {
            let q = x.pp[v as usize];
            y0 = y0.min(q[1]);
            y1 = y1.max(q[1]);
            hx += q[0];
            hz += q[2];
            hn += 1;
        }
    }
    // one surface per material
    let mut merged: Vec<Surface> = Vec::new();
    for s in out.into_iter().filter(|s| !s.pos.is_empty()) {
        if let Some(m) = merged.iter_mut().find(|m| m.mat == s.mat && m.tex.is_none() && s.tex.is_none() && m.nrm.is_empty() && s.nrm.is_empty()) {
            m.pos.extend(s.pos);
            m.col.extend(s.col);
        } else {
            merged.push(s);
        }
    }
    let tris = merged.iter().map(|s| s.tris()).sum();
    // the picture's foot (0.86 of its height below the top) stays above
    // where the chest's data ends
    let top = (y1 + 0.12).max(hat_top + 0.06);
    let low = body_full.iter().filter(|&&v| h.base[v as usize][0].abs() < 1.0).map(|&v| x.pp[v as usize][1]).fold(f32::MAX, f32::min);
    let fill = (0.86 * (top - y0).max(0.8) / (top - low - 0.1)).max(0.53);
    Portrait { surfaces: merged, top, chin: y0, cx: hx / hn.max(1) as f32, cz: hz / hn.max(1) as f32, fill, tris, targets }
}
