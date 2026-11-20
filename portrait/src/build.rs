//! The portrait's geometry (the Werkstatt's `morph` and `build`, ported):
//! the MakeHuman head morphed by the genes, age, mood and life; skin with
//! lips, brows, stubble, wrinkles and scars; eyes; men's hair as strands
//! with a growth direction; beards as sculpted masses in a cylinder grid
//! around the head axis; women's hair as wavy strand bands from the middle
//! parting to a bun, braid or veil; clothing as shells over the body;
//! headwear and jewellery by stand.

use crate::caster::Caster;
use crate::geo::*;
use crate::head::Head;
use crate::hair::*;
use crate::look::*;
use crate::morph::*;
use crate::real_look::*;
use std::f32::consts::PI;

/// Levels of detail of the body: about 1400, 3000, 6000 and 11160
/// triangles.
pub const LODS: usize = 4;

/// A scar of a dress with a table (dress.rs `ScarLine`): how far its ribbon stands off the skin (0.1 = 1 cm), and
/// into how many steps it is cut along its length.
const SCAR_OFF: f32 = 0.004;
const SCAR_STEPS: usize = 12;

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
    /// How much of a child's skin the person has: 1 for as long as the head is MakeHuman's child (up to eleven), 0
    /// from where it has its adult form on (`dress::child_share`), 0 in a look without a dress table. The stage
    /// draws a child's skin with less of the grown's pores, relief, blotches and speckle (src/portrait/profile.ts
    /// `skin.child`): the skin's images and the stage's noise are a grown person's.
    pub young: f32,
    /// (round 127) How the person carries the head (`DressSet::head_of`): turned further than the stage turns
    /// every head, and tilted (radians), and the place the tilt is about: the neck's foot (x and height). The
    /// stage turns the figure about the upright axis through the head's centre and tilts it about the axis from
    /// back to front through that place; the shoulders are tipped back by the tilt here, so that they stand as
    /// the pose has them (to within the bust's lean: the tilt's axis leans with the bust, the stage's does not,
    /// which leaves the shoulders turned by an eighth of the tilt). All 0 in a look without a dress table.
    pub head: [f32; 2],
    pub neck: [f32; 2],
    pub tris: usize,
    /// Morph targets in use.
    pub targets: usize,
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

/// (round 144) The crown of a dress with a table (`DressSet::crown`, tools/portrait/pipeline/crown.py): read and
/// carried as a fillet is, then taken apart by what each triangle is of, which the file says by the triangle's
/// place across its (empty) image, in fifths: gold, the circlet's stones of two kinds, a large fleuron's stone,
/// pearls. The triangles without area that tie a stone to the gold are left out. Gold is drawn as metal; a stone
/// is polished, a pearl a little dull (by eye: PLACEHOLDER).
/// (round 146) A circlet (`DressSet::circlet`) is the same script's file without fleurons, and read the same way.
fn crown(dir: &str, file: &str, d: &crate::dress::DressSet, pp: &[V3], base: &[V3]) -> Vec<Surface> {
    const KINDS: f32 = 5.0;
    let Some(all) = mh_rope(dir, file, "", pp, base, &|_| [1.0; 3]) else { return Vec::new() };
    let stone = |rough: f32| Surface::new(Mat { rough, metal: 0.0, double: false });
    let mut parts = [Surface::new(crate::fasten::METAL), stone(0.12), stone(0.3)];
    for t in (0..all.pos.len()).step_by(3) {
        if all.pos[t + 1] == all.pos[t + 2] {
            continue;
        }
        let (part, col) = match (all.uv[t][0] * KINDS) as usize {
            0 => (0, d.crown_gold),
            4 => (2, d.crown_stones[3]),
            k => (1, d.crown_stones[(k - 1).min(2)]),
        };
        let col = linear(hex(col));
        for i in t..t + 3 {
            parts[part].pos.push(all.pos[i]);
            parts[part].nrm.push(all.nrm[i]);
            parts[part].col.push(col);
        }
    }
    parts.into_iter().filter(|s| !s.pos.is_empty()).collect()
}

pub fn build(h: &Head, p: &Look, lod: usize) -> Portrait {
    build_posed(h, p, lod, None)
}

/// As `build`, in another pose than the dress table's (`DressSet::pose`: the least and the most turn of the
/// shoulders, the most tip). For tests: `Some([0.0; 3])` is the portrait as one stiff piece.
pub fn build_posed(h: &Head, p: &Look, lod: usize, pose: Option<[f32; 3]>) -> Portrait {
    let real = crate::real::folder();
    let lod = if real.is_some() { LODS - 1 } else { lod.min(LODS - 1) };
    let (pp, targets, arms) = morph(h, p);
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
    // a dress with a table: its wools instead of the stand's tunic colours, and none of the Roman pieces
    let garb = p.dress.set();
    let st0 = p.st();
    let st_dress;
    let st: &Stand = match garb {
        Some(d) => {
            st_dress = Stand { key: st0.key, bg: st0.bg, tunic: d.wool, toga: false, stripe: 0.0, work: st0.work, food: st0.food, palla: None, chlamys: None, sun: st0.sun };
            &st_dress
        }
        None => st0,
    };
    let hood = garb.map_or(crate::dress::Hood::None, |d| d.hood_of(fem, p.age, p.seed));
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
    // the full mix read as lipstick there. A dress with a table has its lips drawn per vertex, from the lips'
    // own outline: real_look.rs `real_skin`, `DressSet::lips`)
    let lip_c = cmix(skin, hex(if fem { "#9a3238" } else { "#8a3a36" }), match (real.is_some(), fem) {
        (true, true) => garb.map_or(0.3, |_| 0.0),
        (true, false) => garb.map_or(0.2, |_| 0.0),
        (false, true) => 0.55,
        (false, false) => 0.3,
    });
    let brow_c = cmix(skin, hair, (if fem { 0.4 } else { 0.55 }) * garb.filter(|_| real.is_some()).map_or(1.0, |d| d.brow_paint[if fem { 0 } else { 1 }]));
    // (a dress with a table says how much of this paint the skin under stubble keeps: `DressSet::stubble_paint`)
    let stub_paint = if beard == Beard::Stubble { garb.filter(|_| real.is_some()).map_or(1.0, |d| d.stubble_paint) } else { 1.0 };
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
    // real look: a Blender beard, if there is one for this style
    let real_beard: Option<(String, String)> = if real.is_some() {
        crate::real::folder().and_then(|d| {
            let n = match beard {
                Beard::Shaven => return None,
                Beard::Stubble => p.dress.set().map_or("beard_stubble", |d| d.beard_stubble),
                Beard::Short => p.dress.set().map_or("beard_short", |d| d.beard_short),
                Beard::Full => p.dress.set().map_or("beard_full", |d| d.beard_full),
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
            if beard != Beard::Shaven && stub_paint > 0.0 && in_beard(c, a, b, cc) {
                return cmul(cmix(skin, stub_c, (0.55 + 0.45 * hh) * stub_paint), 0.94 + 0.08 * hash(cc, a, b));
            }
            let cm = Ctx::mask3(&h.cheek, a, b, cc);
            if cm > 0.35 {
                col = cmix(col, hex("#c06a58"), garb.filter(|_| real.is_some()).map_or(if fem { 0.2 } else { 0.1 }, |d| d.cheeks[if fem { 0 } else { 1 }]) * cm);
            }
            let (ex, ey) = (c[0].abs() - 0.31, c[1] - 7.36);
            if c[2] > 1.1 && ey > -0.02 && (ex * 0.8).hypot(ey) < 0.15 {
                col = cmul(col, 1.0 - garb.filter(|_| real.is_some()).map_or(if fem { 0.2 } else { 0.1 }, |d| d.sockets[if fem { 0 } else { 1 }]));
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
                let k = (if beard == Beard::Stubble { 0.1 + 0.15 * cov } else { 0.07 }) * if real_beard.is_some() { 0.4 } else { 1.0 } * stub_paint;
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
            // (round 121: under a veil set back the hair shows over the forehead, and its scalp with it)
            let bare = !matches!(p.hat_style(), Hat::Cap | Hat::Pileus | Hat::Petasos) && !(long_hair && p.hair_style() == Hair::Veil && p.veil() != crate::dress::Veil::Back);
            let sf = if bare { mh_pick(p, long_hair).map(|(d, n)| format!("{d}/{}_scalp.txt", garb.map_or(n.as_str(), |g| g.under_of(&n)))).filter(|f| crate::real::exists(f)) } else { None };
            real_skin(&mut s, &h.parts["body"][lod], &x.pp, dir, p.age, fem, hair, sf, lf.sun, p.seed, garb.map_or((1.0, "skin_red.txt"), |d| (d.flush[if fem { 0 } else { 1 }] * d.flush_of(p), d.flush_map)), garb.map_or(0.0, |d| d.lash_line[if fem { 0 } else { 1 }] * d.eyes_of(fem, p.age)[1]), garb.map_or([1.0; 2], |d| d.lid_under), garb.map_or((0.5, "#140d08"), |d| d.lash_tone), garb.map(|d| d.lips_of(fem, p.age)), garb.is_some_and(|d| !fem && p.age < d.boy_skin), { let l = linear(skin); 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2] });
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
    // scars. A dress with a table may ask for a fine line in the skin itself (dress.rs `ScarLine`): a ribbon that
    // takes the skin's image, normals and colours from where it lies, lighter along its middle (the corners of the
    // skin's surface are those of the head's finest list, three per triangle). Else Apoleia's raised ribbon.
    let skin_at = garb.and_then(|d| d.scar.as_ref()).filter(|_| real.is_some()).and_then(|line| {
        let n = h.parts["body"][lod].len();
        let at = out.iter().position(|s| s.pos.len() >= n && s.uv.len() == s.pos.len() && s.nrm.len() == s.pos.len() && s.tex.as_deref().is_some_and(|t| t.contains("skin")));
        at.map(|si| (si, line))
    });
    if let (false, Some((si, line))) = (scars.is_empty(), skin_at) {
        let idx = &h.parts["body"][lod];
        let sk = &out[si];
        let front: Vec<usize> = (0..idx.len()).step_by(3).filter(|&f| (0..3).map(|q| h.base[idx[f + q] as usize][2]).sum::<f32>() > 2.1).collect();
        // the skin under a point of the base head's front view: its place, normal, place on the image and colour,
        // and which way round its triangle is wound
        let under = |xx: f32, yy: f32| -> Option<(V3, V3, [f32; 2], Rgb, f32)> {
            for &f in &front {
                let b = |q: usize| h.base[idx[f + q] as usize];
                let (x1, y1, x2, y2, x3, y3) = (b(0)[0], b(0)[1], b(1)[0], b(1)[1], b(2)[0], b(2)[1]);
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
                let at = |v: &[V3]| add(add(mul(v[f], l1), mul(v[f + 1], l2)), mul(v[f + 2], l3));
                let n = norm(at(&sk.nrm));
                let uv = [sk.uv[f][0] * l1 + sk.uv[f + 1][0] * l2 + sk.uv[f + 2][0] * l3, sk.uv[f][1] * l1 + sk.uv[f + 1][1] * l2 + sk.uv[f + 2][1] * l3];
                let wound = dot(cross(sub(sk.pos[f + 1], sk.pos[f]), sub(sk.pos[f + 2], sk.pos[f])), n).signum();
                return Some((madd(at(&sk.pos), n, SCAR_OFF), n, uv, at(&sk.col), wound));
            }
            None
        };
        let mut ss = Surface::new(sk.mat);
        (ss.tex, ss.nmap) = (sk.tex.clone(), sk.nmap.clone());
        for sc in &scars {
            let (dx, dy) = (sc.x1 - sc.x0, sc.y1 - sc.y0);
            let l = dx.hypot(dy).max(1e-6);
            let (px, py) = (-dy / l, dx / l);
            // across the scar: the skin's own colour at either edge, the scar's along the middle
            let mut rows = Vec::new();
            for k in 0..=SCAR_STEPS {
                let t = k as f32 / SCAR_STEPS as f32;
                let (cx, cy) = (lerp(sc.x0, sc.x1, t) + 0.006 * (t * 13.8).sin(), lerp(sc.y0, sc.y1, t));
                let w = line.half * (1.0 - 0.7 * (2.0 * t - 1.0).abs());
                if let (Some(a), Some(mut m), Some(b)) = (under(cx - px * w, cy - py * w), under(cx, cy), under(cx + px * w, cy + py * w)) {
                    // (faint at its ends)
                    let k = 1.0 - (2.0 * t - 1.0).abs().powi(4);
                    m.3 = std::array::from_fn(|c| m.3[c] * (1.0 + (line.tone[c] - 1.0) * k));
                    rows.push([a, m, b]);
                }
            }
            for pair in rows.windows(2) {
                for side in 0..2 {
                    let quad = [pair[0][side], pair[0][side + 1], pair[1][side + 1], pair[1][side]];
                    for t in [[0, 1, 2], [0, 2, 3]] {
                        let (a, b, c) = (quad[t[0]], quad[t[1]], quad[t[2]]);
                        // wound as the skin under it
                        let turn = dot(cross(sub(b.0, a.0), sub(c.0, a.0)), a.1) * a.4 < 0.0;
                        for q in if turn { [a, c, b] } else { [a, b, c] } {
                            ss.pos.push(q.0);
                            ss.nrm.push(q.1);
                            ss.uv.push(q.2);
                            ss.col.push(q.3);
                        }
                    }
                }
            }
        }
        out.push(ss);
    } else if !scars.is_empty() {
        // Apoleia's: narrow, slightly raised ribbons on the morphed skin (each point
        // found by triangle in the base mesh's front view)
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
            let ball = idx.iter().map(|&v| len(sub(x.pp[v as usize], c))).sum::<f32>() / idx.len() as f32;
            let mut seen = vec![false; h.n];
            for &v in idx {
                if !seen[v as usize] {
                    seen[v as usize] = true;
                    x.pp[v as usize][2] += garb.map_or(0.012, |d| d.eye_forward);
                }
            }
            if eye_tex.is_some() {
                let cell = ((p.u(EYE) * 15.0).round() as usize).min(15);
                let (cx, cy) = ((cell % 4) as f32, (cell / 4) as f32);
                // +u away from the nose; a child's iris fills more of the eye
                let temporal = if c[0] >= 0.0 { 1.0 } else { -1.0 };
                let mut ks = 1.0 / (1.0 + 0.23 * (1.0 - grown) * garb.map_or(1.0, |d| d.kid));
                // a dress that gives the iris in millimetres: the image has it at 27.5 degrees of the ball
                // (eye_tex.py), this ball has it where a disc of that size meets it (1 = 10 cm)
                if let Some(mm) = garb.map(|d| d.iris_of(fem, p.age)).filter(|&mm| mm > 0.0) {
                    ks = 27.5_f32.to_radians() / (mm / 200.0 / ball.max(1e-6)).min(1.0).asin();
                }
                let old = ((p.age - 45.0) / 35.0).clamp(0.0, 1.0);
                // where the eyes look, seen from the head: straight ahead, or turned as the dress asks (the ball's
                // image is laid round that direction, which on a ball is the same as turning the eye)
                let gaze = garb.map(|d| d.gaze_at(temporal, crate::dress::by_sex(d.lean[0], d.lean[1], fem, grown), d.head_of(p.seed))).filter(|g| *g != [0.0, 0.0]).map(|[yaw, pitch]| {
                    let g = [yaw.sin() * pitch.cos(), pitch.sin(), yaw.cos() * pitch.cos()];
                    let r = norm(cross([0.0, 1.0, 0.0], g));
                    (r, cross(g, r), g)
                });
                for &v in idx {
                    let mut q = sub(x.pp[v as usize], c);
                    if let Some((r, u, g)) = gaze {
                        q = [dot(q, r), dot(q, u), dot(q, g)];
                    }
                    let l = len(q).max(1e-9);
                    // (a smaller iris stretches the image: what would lie beyond its cell is the ball's back)
                    let rr = ((q[2] / l).clamp(-1.0, 1.0).acos() * ks / PI * 0.5).min(0.5);
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
    // (a dress with a table has hair under a veil set back, the Roman veil the builder's own; under a veil that
    // lies on forehead and cheeks there is none: `Veil::Closed`)
    let mh = if hatted_mh || veiled && garb.is_none() { None } else { mh_pick(p, long_hair) };
    let no_hair = veiled && garb.is_some() && p.veil() != crate::dress::Veil::Back;
    if let Some((dir, name)) = &mh {
        // hair thins with age: women diffusely over the crown (female pattern
        // hair loss, rising to about half of women past 80; Gan & Sinclair,
        // 2005, not verified online), more with the bald gene. Cards left out,
        // the painted cap of fine hairs lets the scalp show. Men keep their
        // cards (their short cut shows gaps as patches; the bald pattern does
        // the work). Shares PLACEHOLDER
        let thin = if fem { c01((p.age - 45.0) / 40.0) * (0.3 + 0.7 * p.u(BALD)) * 0.55 } else { 0.0 };
        // plaits hang below the head: their light is that of the side they hang on, not of the head's underside
        let hangs = garb.is_some_and(|d| name == d.hair_girl);
        if let Some(sf) = mh_hair2(dir, name, &x.pp, &h.base, hc, &|_| hair, hangs, (thin, p.seed ^ 0x3c6e_f372)) {
            out.push(sf);
        }
        // hair that is solid, each kind in a file of its own beside the cards: a cut's body (England's
        // `bob01_body`, `plait01_body`: modelled in Blender as layers of thick bundles, round 109; no cards and
        // no locks any more), drawn with the dress set's image of a bundle, and the round strands of its plaits
        // (England's `plait01_rope`), drawn with their own
        // (tightly curled hair, round 111: one mass, drawn with the image of its coils)
        let body_image = garb.map_or("", |d| d.coily.as_ref().filter(|_| d.is_coily(name)).map_or(d.body_image, |c| c.image));
        // (round 126: plaits pinned up are laid on a girl's hair: her body of hair, and her strands' image)
        let under = garb.map_or(name.as_str(), |g| g.under_of(name));
        let body = if crate::real::exists(&format!("{dir}/{name}_body.txt")) { name.as_str() } else { under };
        // (under a coif the hair's painted layer alone: the cap lies close on the skull, and a body of bundles
        // a centimetre thick under it made a helmet of it)
        let coifed = garb.is_some_and(|d| d.coif_of(fem, p.age, p.seed));
        if !coifed {
            if let Some(sf) = mh_rope(dir, &format!("{body}_body"), body_image, &x.pp, &h.base, &|_| hair) {
                out.push(sf);
            }
            if let Some(sf) = mh_rope(dir, &format!("{name}_rope"), &format!("{under}_rope"), &x.pp, &h.base, &|_| hair) {
                out.push(sf);
            }
        }
        // (round 128) a fillet on the hair: a stiff band of linen, bound and carried as a plait's strands are
        // (round 146) at court a circlet in its place: gilt metal with stones, read as the crown is
        // (round 147) and on a lord's head with nothing else on it
        if let Some((d, file)) = garb.and_then(|d| d.circlet_of(fem, p.age, p.seed).map(|f| (d, f))) {
            out.extend(crown(dir, file, d, &x.pp, &h.base));
        } else if let Some(d) = garb.filter(|d| d.fillet_of(fem, p.age, p.seed)) {
            if let Some(sf) = mh_rope(dir, d.fillet, "", &x.pp, &h.base, &|_| hex(d.linen)) {
                out.push(sf);
            }
        }
        // (round 144) a crown: gold, its stones and its pearls, bound and carried as the fillet is
        if let Some(d) = garb.filter(|d| !d.crown.is_empty()) {
            out.extend(crown(dir, d.crown, d, &x.pp, &h.base));
        }
        // (round 132) a man's coif: a close cap of linen over the hair and the ears with its strings under the
        // chin, bound and carried as the fillet is
        if let Some(d) = garb.filter(|_| coifed) {
            if let Some(sf) = mh_rope(dir, d.coif, d.fillet, &x.pp, &h.base, &|_| hex(d.linen)) {
                out.push(sf);
            }
        }
        // (round 134) a man's felt hat: a round crown and a broad brim over hair that lies flat, bound and carried
        // as the fillet is
        if let Some(d) = garb.filter(|d| d.hat_of(fem, p.age, p.seed)) {
            if let Some(sf) = mh_rope(dir, d.hat_file(p.seed), d.hat, &x.pp, &h.base, &|_| hex(d.hat_tone(p.seed))) {
                out.push(sf);
            }
        }
        // real look: a painted cap of fine hairs under the cards, if there is one
        // (grey and white fuzz is see-through: the cap fades towards the skin as
        // the hair greys, else its soft edge lays a pale band over the forehead)
        let cap_c = cmix(hair, skin, (0.7 * thin).max(0.75 * beard_grey));
        if let Some(sf) = mh_hair(dir, &format!("{}_cap", garb.map_or(name.as_str(), |g| g.under_of(name))), &x.pp, &h.base, hc, cap_c) {
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
        // a beard's locks (England's `beard_crop_locks`): solid as a head's, drawn with the dress set's image of
        // a beard's locks
        if let Some(sf) = mh_rope(dir, &format!("{name}_locks"), garb.map_or("", |d| d.beard_lock_image), &x.pp, &h.base, &bcol) {
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
            let brow = garb.map_or("eyebrow001", |d| d.brows[if fem { 0 } else { 1 }]);
            let young = garb.map_or(0.0, |d| d.brows_child * (1.0 - p.grown()));
            // a dress may have the brow grow higher on the forehead than MakeHuman's, which lies on the rim of the
            // eye's socket: along the skin, by where along the eye a hair stands
            let lift = garb.map(|d| d.brow_lift_of(fem, p.age)).filter(|l| *l != [0.0; 3]);
            // (round 112) and a person's own brows are lighter or heavier (`DressSet::brow_gene`)
            let weight = garb.map_or([1.0, 0.0], |d| d.brow_weight_of(p));
            let band = garb.map_or(1.0, |d| d.brow_band_of(fem, p.age)) * weight[0];
            let lash_tone = garb.map_or((0.5, "#140d08"), |d| d.lash_tone);
            for (name, col) in [(brow, cmix(cmix(cmul(bc, 0.75), skin, young), skin, weight[1])), ("Eyelashes01", cmix(cmul(bc, lash_tone.0), hex(lash_tone.1), 0.5))] {
                if let Some(mut sf) = mh_hair(dir, name, &x.pp, &h.base, hc, col) {
                    // a dress may draw another image on the brow's cards and on the lashes' (`DressSet::brow_image`,
                    // `lash_image`)
                    if let Some(img) = garb.map(|d| if name == brow { d.brow_image } else { d.lash_image }).filter(|i| !i.is_empty()) {
                        sf.tex = Some(crate::real::image(dir, img));
                    }
                    // a narrower band: every corner drawn towards the middle of those that stand at its place along
                    // the brow (the card is a strip of five corners across, columns a good 4 mm apart)
                    if band != 1.0 && name == brow {
                        let was = sf.pos.clone();
                        for q in sf.pos.iter_mut() {
                            let (mut c, mut n) = ([0.0; 3], 0.0);
                            for o in was.iter().filter(|o| (o[0] - q[0]).abs() < 0.02) {
                                c = add(c, *o);
                                n += 1.0;
                            }
                            *q = madd(mul(c, 1.0 / n), sub(*q, mul(c, 1.0 / n)), band);
                        }
                    }
                    if let Some(lift) = lift.filter(|_| name == brow) {
                        let eyes = crate::morph::eye_spans(h, &x.pp);
                        // (a corner is shared by up to six triangles: each place is looked up once)
                        let mut done: std::collections::HashMap<[u32; 3], V3> = std::collections::HashMap::new();
                        for (q, n) in sf.pos.iter_mut().zip(sf.nrm.iter_mut()) {
                            *q = *done.entry(q.map(f32::to_bits)).or_insert_with(|| {
                                let up = crate::dress::brow_lift_at(q[0].abs(), eyes[if q[0] < 0.0 { 1 } else { 0 }], lift) / 100.0;
                                let (d0, moved) = (sub(*q, hc), [q[0], q[1] + up, q[2]]);
                                let d1 = sub(moved, hc);
                                // as far off the skin as it was. The skin is the last the ray from the head's
                                // centre meets (before it, the inside of the eye's socket): a ray to the brow
                                // leaves the head through the face, and `outer_skin` takes a face that stands
                                // far out for a shoulder
                                let (r0, r1) = (cast_h.cast(d0, true), cast_h.cast(d1, true));
                                if r0 > 0.0 && r1 > 0.0 { madd(hc, norm(d1), r1 + len(d0) - r0) } else { moved }
                            });
                            *n = norm(sub(*q, hc));
                        }
                    }
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
        // (with a Blender hairstyle (real look) the bands stay away, and under a veil that hides all hair)
        if mh.is_none() && !no_hair {
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
            let vcol = match garb {
                Some(d) => hex(d.linen),
                None => dress(hex(st.palla.unwrap_or(["#e9e2d2", "#c8b68c", "#8396ad", "#a4664f", "#6f7d5c"][(p.seed % 5) as usize])), [0.0, 7.5, 0.0]),
            };
            // real look: the veil draped in Blender (round 121: a dress's veil set back is a cloth of its own,
            // drawn with the image of the veil that lies on forehead and cheeks)
            let (cloth, image) = match garb {
                Some(t) if p.veil() == crate::dress::Veil::Back => (t.veil_back, t.veil),
                Some(t) => (t.veil, ""),
                None => ("cloth_veil", ""),
            };
            let real_veil = if real.is_some() { crate::real::folder().and_then(|d| mh_cloth_as(&d, cloth, image, &x.pp, &h.base, &|_| vcol, None, if garb.is_some() { Layer::Over } else { Layer::Bound }, &arms)) } else { None };
            if let Some(s) = real_veil {
                // the wimple under the veil of older women
                if let Some(t) = garb.filter(|t| p.age >= t.wimple_from) {
                    if let Some(w) = crate::real::folder().and_then(|d| mh_cloth(&d, t.wimple, &x.pp, &h.base, &|_| vcol, None, Layer::Over, &arms)) {
                        out.push(w);
                    }
                }
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
    // real look: the tunic draped in Blender
    let zc0 = fit[2][0] * 0.2 + fit[2][1];
    // the patch grid as seen from the front (and from the back): a grid round the
    // body's axis fans out where the chest bulges and the shoulders slope back
    let cell = |v: V3| -> [f32; 2] { [v[0] / 0.6 + if v[2] < zc0 { 50.0 } else { 0.0 }, v[1] / 0.6] };
    // real look: the colour of a Blender garment at v: the cloth's dye as dress() gives
    // it, patches as pieces sewn on
    let toga_dye = hex("#efe9dc");
    let cloth_col = |base: Rgb, v: V3| -> Rgb {
        // patches as pieces sewn on: inside a cell of about 6 x 6 cm, with
        // a darker seam along the edge
        let q = cell(v);
        let (cx, cy) = (q[0].floor(), q[1].floor());
        let (fx, fy) = (q[0] - cx, q[1] - cy);
        // a cell's patch; neighbouring patches join into one larger piece
        let pc = |i: f32, j: f32| patched([i * 0.38 + 0.19, j * 0.38 + 0.19, 7.0]);
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
    // which cut of a dress's gown: a woman's or a man's, and whether a wimple covers its neck
    let cut = if fem { 0 } else { 1 };
    let tc2 = garb.filter(|d| d.parted_of(fem, p.age, p.seed)).map(|d| hex(d.wool[(p.seed as usize + 2) % d.wool.len()]));
    let wimpled = garb.is_some_and(|t| fem && p.age >= t.wimple_from);
    let real_tunic = if real.is_some() && !swaddled {
        crate::real::folder().and_then(|d| {
            let col = |v: V3| {
                if st.stripe > 0.0 && !fem && !st.toga && v[2] > 0.3 && (v[0].abs() - 0.4).abs() < st.stripe && v[1] < ym(5.35) {
                    return hex("#5e1a44");
                }
                // (round 144) mi-parti: a man's gown of two cloths, one on each side of the body
                cloth_col(if v[0] < 0.0 { tc2.unwrap_or(tc) } else { tc }, v)
            };
            // (a dress with a table cuts the gown's neck by who wears it; the cuts are of the gown's cloth)
            let (name, image) = match garb {
                Some(t) if !t.gown_cut[cut].is_empty() && !wimpled => (t.gown_cut[cut], t.gown),
                // (round 151: the round gown from a file of its own where the table has one, with the gown's image)
                Some(t) if !t.gown_file.is_empty() => (t.gown_file, t.gown),
                Some(t) => (t.gown, ""),
                None => ("cloth_tunic", ""),
            };
            let mut gown = mh_cloth_as(&d, name, image, &x.pp, &h.base, &col, Some(&cell), if garb.is_some() { Layer::Gown } else { Layer::Bound }, &arms)?;
            // (round 150) a table's own cloth for the gown, whatever its cut: the court's silk
            if let Some(t) = garb.filter(|t| !t.gown_image.is_empty()) {
                gown.tex = Some(crate::real::image(&d, t.gown_image));
            }
            Some(gown)
        })
    } else {
        None
    };
    let had_tunic = real_tunic.is_some();
    if let Some(s) = real_tunic {
        // what is worn under the gown and shows at its neck: a woman's smock, a man's shirt, of the dress's linen
        if let Some(t) = garb {
            // (nothing under a wimple: it covers the gown's neckline and what would show in it)
            let (name, image) = if wimpled { ("", "") } else { (t.under[cut], t.under_image) };
            if !name.is_empty() {
                let linen = hex(t.linen);
                if let Some(u) = crate::real::folder().and_then(|d| mh_cloth_as(&d, name, image, &x.pp, &h.base, &|_| linen, None, Layer::Under, &arms)) {
                    out.push(u);
                }
            }
        }
        out.push(s);
    }
    // the hood of a dress with a table, on the head or thrown back, in another of its wools
    if let (Some(d), true) = (garb, real.is_some()) {
        // (round 136: plain, or with the cape's hem dagged; the dagged file is drawn with the plain one's image)
        if let Some((name, image)) = d.hood_file(hood, p.seed) {
            let hc = hex(d.wool[((p.seed / 10) as usize + 3) % d.wool.len()]);
            if let Some(s) = crate::real::folder().and_then(|f| mh_cloth_as(&f, name, image, &x.pp, &h.base, &|v| cloth_col(hc, v), None, Layer::Over, &arms)) {
                out.push(s);
            }
        }
    }
    // (round 145) a mantle round the shoulders, over the gown
    if let (Some(d), true) = (garb.filter(|d| !d.mantle.is_empty()), real.is_some()) {
        // (drawn white: its cloth and its fur are dyed where they are taken apart, at the end)
        if let Some(s) = crate::real::folder().and_then(|f| mh_cloth_as(&f, d.mantle, "", &x.pp, &h.base, &|_| [1.0; 3], None, Layer::Over, &arms)) {
            out.push(s);
        }
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
        crate::real::folder().and_then(|d| mh_cloth(&d, "cloth_toga", &x.pp, &h.base, &|v| cloth_col(toga_dye, v), Some(&cell), Layer::Bound, &arms))
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
            crate::real::folder().and_then(|d| mh_cloth(&d, "cloth_palla", &x.pp, &h.base, &|v| cloth_col(dye, v), Some(&cell), Layer::Bound, &arms))
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
        let amulet = garb.is_none() && p.age >= 1.5 && p.age < if fem { 13.0 } else { 16.0 } && p.stand != SKLAVE;
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
    // the pose, where the dress has one: the shoulders turned further than the head, the neck twisting between
    // the chin and its foot (pose.rs). The neck stands where the skin between chin and shoulders has its middle
    // what lies over the gown lifted off it (a veil's fall, a hood's cape, a wimple)
    if let Some(d) = garb {
        if let Some(g) = merged.iter().position(|s| s.tex.as_deref().is_some_and(|t| t.contains(d.gown))) {
            let gown = std::mem::replace(&mut merged[g], Surface::new(mat(0.0)));
            for s in merged.iter_mut().filter(|s| s.tex.as_deref().is_some_and(|t| d.over_gown().iter().any(|n| !n.is_empty() && t.contains(n)))) {
                crate::layers::lift(s, &gown, y0, crate::layers::GAP, crate::layers::REACH);
            }
            merged[g] = gown;
        }
        // (round 139) and the veil off the wimple, which is worn under it: both were set as far outside the gown,
        // and the wimple's end stood through the veil's fall on the shoulder, a dark slit under it
        if let Some(w) = merged.iter().position(|s| !d.wimple.is_empty() && s.tex.as_deref().is_some_and(|t| t.contains(d.wimple))) {
            let wimple = std::mem::replace(&mut merged[w], Surface::new(mat(0.0)));
            for s in merged.iter_mut().filter(|s| s.tex.as_deref().is_some_and(|t| [d.veil, d.veil_back].iter().any(|n| !n.is_empty() && t.contains(n)))) {
                crate::layers::lift(s, &wimple, y0, crate::layers::GAP, crate::layers::REACH);
            }
            merged[w] = wimple;
        }
    }
    // a woman's bust held by her gown (before the body is turned: the body's middle line is the picture's still)
    if let Some(share) = garb.map(|d| d.bust).filter(|s| fem && *s > 0.0 && crate::pose::FRONT.iter().all(|&v| v < h.n)) {
        let line = crate::pose::FRONT.map(|v| [x.pp[v][1], x.pp[v][2]]);
        crate::pose::hold_bust(&mut merged, &line, x.pp[crate::pose::FRONT_TOP][1], crate::pose::BUST_SIDE, share);
    }
    // how a gown is closed in front: a lace or buttons laid on the gown as it lies now (fasten.rs), left out
    // where a veil's fall, a wimple or a hood's cape lies over it
    if let Some(d) = garb.filter(|_| crate::pose::FRONT.iter().all(|&v| v < h.n)) {
        let kind = d.fasten_of(fem, p.age, p.seed);
        if let Some(g) = merged.iter().position(|s| s.tex.as_deref().is_some_and(|t| t.contains(d.gown))).filter(|_| kind != crate::fasten::Fasten::None) {
            let over: Vec<&Surface> = merged.iter().filter(|s| s.tex.as_deref().is_some_and(|t| d.over_gown().iter().any(|n| !n.is_empty() && t.contains(n)))).collect();
            let middle = crate::pose::FRONT.iter().map(|&v| x.pp[v][0]).sum::<f32>() / crate::pose::FRONT.len() as f32;
            let behind = crate::pose::FRONT.iter().map(|&v| x.pp[v][2]).fold(f32::MAX, f32::min) - 0.3;
            let under = crate::real::folder().filter(|_| !d.under_image.is_empty()).map(|dir| (crate::real::image(&dir, d.under_image), linear(hex(d.linen))));
            let metal = Some(d.buttons).filter(|m| !m.is_empty()).map(|m| linear(hex(m)));
            let made = crate::fasten::fasten(&merged[g], &over, under, kind, metal, middle, y0, behind);
            merged.extend(made);
        }
    }
    let range = pose.or(garb.map(|d| d.pose)).unwrap_or([0.0; 3]);
    // how the person carries the head: the stage tilts the whole figure, the shoulders are tipped back by as much
    // (a pose asked for by the caller is taken as it is)
    let head = garb.map_or([0.0; 2], |d| d.head_of(p.seed));
    let mut stand = crate::pose::pose_of(range, p.seed);
    if pose.is_none() {
        stand.tip -= head[1];
    }
    let mut neck = [0.0; 3];
    if garb.is_some() || range != [0.0; 3] {
        let (mut lo, mut hi) = ([f32::MAX; 2], [f32::MIN; 2]);
        for &v in body_full {
            let b = h.base[v as usize];
            if b[1] > 5.7 && b[1] < 6.0 && b[0].abs() < 0.75 {
                let q = x.pp[v as usize];
                lo = [lo[0].min(q[0]), lo[1].min(q[2])];
                hi = [hi[0].max(q[0]), hi[1].max(q[2])];
            }
        }
        let (axis, foot) = ([(lo[0] + hi[0]) / 2.0, (lo[1] + hi[1]) / 2.0], y0 - crate::pose::NECK * (y1 - y0));
        crate::pose::pose(&mut merged, stand, axis, foot, y0);
        neck = [axis[0], foot, axis[1]];
    }
    // (round 137) What of the gown still stands through the cloth over it is set under that cloth (layers.rs
    // `sink`): the lift above moved that cloth's corners, and a fold of the gown between three of them came
    // through all the same. Done here, where everything stands as it is drawn: the pose shears the layers
    // against each other at the neck
    if let Some(d) = garb {
        // (round 139) first the wimple under the veil, and with it what lies beside what is sunk (`tuck`): the
        // veil's fall is of few long triangles, and the wimple's end and its rolled hem came through between
        // their corners. Before the gown, which is then set under both as they stand
        if let Some(w) = merged.iter().position(|s| !d.wimple.is_empty() && s.tex.as_deref().is_some_and(|t| t.contains(d.wimple))) {
            let mut wimple = std::mem::replace(&mut merged[w], Surface::new(mat(0.0)));
            for s in merged.iter().filter(|s| s.tex.as_deref().is_some_and(|t| [d.veil, d.veil_back].iter().any(|n| !n.is_empty() && t.contains(n)))) {
                crate::layers::tuck(&mut wimple, s, y0, crate::layers::UNDER, crate::layers::THROUGH, crate::layers::PASS);
            }
            merged[w] = wimple;
        }
        if let Some(g) = merged.iter().position(|s| s.tex.as_deref().is_some_and(|t| t.contains(d.gown))) {
            let mut gown = std::mem::replace(&mut merged[g], Surface::new(mat(0.0)));
            for s in merged.iter().filter(|s| s.tex.as_deref().is_some_and(|t| d.over_gown().iter().any(|n| !n.is_empty() && t.contains(n)))) {
                crate::layers::sink(&mut gown, s, y0, crate::layers::UNDER, crate::layers::THROUGH);
            }
            merged[g] = gown;
        }
        // (round 140) and the hair under a veil or a hood on the head: its bundles are bound to the skull as the
        // cloth is, each for itself, and over the ears a strand of them stood through a hood, a finger long
        if let Some(b) = merged.iter().position(|s| !d.body_image.is_empty() && s.tex.as_deref().is_some_and(|t| t.contains(d.body_image))) {
            let mut hair = std::mem::replace(&mut merged[b], Surface::new(mat(0.0)));
            for s in merged.iter().filter(|s| s.tex.as_deref().is_some_and(|t| [d.veil, d.veil_back, d.hood_up].iter().any(|n| !n.is_empty() && t.contains(n)))) {
                crate::layers::sink(&mut hair, s, f32::MAX, crate::layers::UNDER, crate::layers::THROUGH);
            }
            merged[b] = hair;
        }
    }
    // the bust leaning back, where the dress asks for it
    let lean = garb.map_or(0.0, |d| crate::dress::by_sex(d.lean[0], d.lean[1], fem, p.grown()));
    if lean != 0.0 {
        lean_back(&mut merged, (y0 + y1) / 2.0, hz / hn.max(1) as f32, lean);
        // (the neck's foot leans with the rest)
        neck[1] = (y0 + y1) / 2.0 + (neck[1] - (y0 + y1) / 2.0) * lean.cos() + (neck[2] - hz / hn.max(1) as f32) * lean.sin();
    }
    // the picture's foot (0.86 of its height below the top) stays above where the skin's data ends, on a stage
    // that stands as the builder frames it (a stage that shows more of the figure, as England's bust since round
    // 124, has its foot on the gown, which hangs on the bust's data to under the waist)
    let top = (y1 + 0.12).max(hat_top + 0.06);
    let low = body_full.iter().filter(|&&v| h.base[v as usize][0].abs() < 1.0).map(|&v| x.pp[v as usize][1]).fold(f32::MAX, f32::min);
    let fill = (0.86 * (top - y0).max(0.8) / (top - low - 0.1)).max(0.53);
    let young = garb.map_or(0.0, |d| crate::dress::child_share(d.adult[if fem { 0 } else { 1 }], p.age));
    // (round 145) the mantle's facing of fur and its clasp, on everything as it is drawn (mantle.rs)
    if let Some(d) = garb.filter(|d| !d.mantle.is_empty()) {
        if let (Some(m), Some(dir)) = (merged.iter().position(|s| s.tex.as_deref().is_some_and(|t| t.contains(d.mantle))), crate::real::folder()) {
            let mut sheet = std::mem::replace(&mut merged[m], Surface::new(mat(0.0)));
            let under: Vec<&Surface> = merged.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains(d.gown) || d.under.iter().any(|n| !n.is_empty() && t.contains(n)))).collect();
            let dye = d.mantle_dyes.map(|c| linear(hex(c)));
            let facing = crate::mantle::Facing { image: crate::real::image(&dir, d.mantle_fur), cloth: linear(hex(d.mantle_cloth)), fur: dye[0], gold: dye[1], stone: dye[2], cord: dye[3] };
            let made = crate::mantle::face(&mut sheet, &under, &facing);
            merged[m] = sheet;
            merged.extend(made);
        }
    }
    // (round 148) a hood's facing of fur, laid on the hood as it is drawn (facing.rs)
    if let (Some(d), Some(dir)) = (garb.filter(|d| !d.hood_fur.is_empty()), crate::real::folder()) {
        let hood = merged.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(d.hood_up) || t.contains(d.hood_back)));
        if let Some(fur) = hood.and_then(|h| crate::facing::face(h, &crate::real::image(&dir, d.hood_fur), linear(hex(d.hood_fur_dye)))) {
            merged.push(fur);
        }
    }
    let tris = merged.iter().map(|s| s.tris()).sum();
    Portrait { surfaces: merged, top, chin: y0, cx: hx / hn.max(1) as f32, cz: hz / hn.max(1) as f32, fill, young, head, neck: [neck[0], neck[1]], tris, targets }
}

/// Leans surfaces back by `a` radians about the axis from ear to ear at height `cy` and depth `cz`: what lies above
/// goes back, what lies in front goes up.
pub(crate) fn lean_back(surfaces: &mut [Surface], cy: f32, cz: f32, a: f32) {
    let (cs, sn) = (a.cos(), a.sin());
    for s in surfaces.iter_mut() {
        for q in s.pos.iter_mut() {
            let (dy, dz) = (q[1] - cy, q[2] - cz);
            *q = [q[0], cy + dy * cs + dz * sn, cz + dz * cs - dy * sn];
        }
        for n in s.nrm.iter_mut() {
            *n = [n[0], n[1] * cs + n[2] * sn, n[2] * cs - n[1] * sn];
        }
    }
}
