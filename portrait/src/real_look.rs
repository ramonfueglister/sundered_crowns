//! The parts of the real look that come from files (crate::real): the textured skin, and hair, beards and clothes
//! made in Blender, each bound to the base head and carried along with this person's morphed head.

use crate::geo::*;
use crate::look::*;
use crate::morph::vnormals;
use crate::settings;

/// Builds the portrait of `p` at level of detail `lod` (0..LODS).
/// Real look: the skin smooth and textured (the folder of the real look holds
/// uvs.txt and skin_<age>_<sex>.png): each vertex the mean colour of its
/// facets, normals averaged, the UVs of the base mesh (at a seam the corner
/// UVs that lie closest together).
#[allow(clippy::too_many_arguments)]
pub(crate) fn real_skin(s: &mut Surface, idx: &[u32], pp: &[V3], dir: &str, age: f32, female: bool, hair: Rgb, scalp_file: Option<String>, sun: f32, seed: u32, flush: f32) {
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
    // a facet's edge (settings::SKIN_SOFT passes)
    let soft = settings::SKIN_SOFT;
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
    let scalp: Vec<f32> = scalp_file.map(|f| crate::real::column(&f, 0.0)).unwrap_or_default();
    let hl = mul(linear(hair), 0.55);
    // real look: shade in the eye sockets, nostrils, mouth corners and ear folds
    // (skin_ao.txt, per vertex of the base head); PLACEHOLDER strength
    let ao: Vec<f32> = crate::real::column(&format!("{dir}/skin_ao.txt"), 1.0);
    let ao_k = settings::SKIN_AO;
    // real look: blood under thin skin, nose, cheeks, ears and chin a little
    // redder (skin_red.txt, 0..1 per vertex); haemoglobin takes green and
    // blue away (after Jimenez et al., 2010, not verified online). Strength
    // PLACEHOLDER: weaker on dark skin, where melanin hides it, a little
    // more on old men (weathered, broken veins)
    let red: Vec<f32> = crate::real::column(&format!("{dir}/skin_red.txt"), 0.0);
    let red_k: f32 = settings::SKIN_RED * flush * if female { 1.0 } else { 1.0 + 0.5 * ((age - 40.0) / 30.0).clamp(0.0, 1.0) };
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
pub(crate) fn mh_pick(p: &Look, long_hair: bool) -> Option<(String, String)> {
    let dir = crate::real::folder()?;
    // the style from the person's genes, age, sex and stand
    {
        let r = Rng::new(p.seed ^ 0x2545_f491).next();
        let name = if p.age < 7.0 {
            // small children: short loose hair
            "crop01"
        } else if long_hair {
            match p.hair_style() {
                Hair::Braid => p.dress.set().map_or("braid01", |d| d.hair_girl),
                Hair::Veil => match p.dress.set() {
                    Some(d) => d.hair_veiled,
                    None => return None,
                },
                _ => "bun01",
            }
        } else {
            let bald = if p.female { 0.0 } else { c01((p.age - 22.0) / 38.0) * p.u(BALD) * 1.7 };
            // a dress with a table has its own hair for a head that loses it (under the hood on the head the
            // hair lies flat, and a bare top has no cards that could come through the hood)
            let bare = p.dress.set().filter(|d| d.hood_of(p.female, p.age, p.seed) != crate::dress::Hood::Up);
            if bald > 0.75 {
                bare.map_or("bald01", |d| d.hair_bald)
            } else if bald > 0.4 {
                p.dress.set().map_or("receding01", |d| bare.map_or(d.hair_hooded, |d| d.hair_receding))
            } else if p.u(CURL) > 0.62 {
                p.dress.set().map_or("curly01", |d| bare.map_or(d.hair_hooded, |d| d.hair_curly))
            } else if let Some(d) = p.dress.set() {
                // under the hood on the head the hair lies flat
                if d.hood_of(p.female, p.age, p.seed) == crate::dress::Hood::Up { d.hair_hooded } else { d.hair }
            } else if p.stand <= 1 && r < 0.6 || p.age < 13.0 && r < 0.5 {
                // working people and many boys: cropped short
                "crop01"
            } else {
                "roman01"
            }
        };
        Some((dir, name.to_string()))
    }
}

/// Real look: a MakeHuman hair (.mhclo fitted as MakeHuman does: each vertex a
/// weighted sum of three body vertices plus an offset scaled with the head)
/// on this person's morphed head, as textured cards.
pub(crate) fn mh_hair(dir: &str, name: &str, pp: &[V3], base: &[V3], hc: V3, hair: Rgb) -> Option<Surface> {
    mh_hair2(dir, name, pp, base, hc, &|_| hair, false, (0.0, 0))
}

/// Real look: a Blender garment (name.txt bound like the hair, name.png): smooth
/// normals from its own triangles, the colour per vertex.
/// where mh_cloth cuts a cell (fractions of it): the border, the patch's edge
/// and its seam
pub(crate) const CLOTH_CUTS: [f32; 5] = [0.0, 0.1, 0.14, 0.86, 0.9];

/// A calmed garment. Each vertex follows its own body triangle; neighbours bound to different
/// triangles (an ear, the jaw, the neck) would move apart and crumple the
/// cloth. So only the smooth part of the movement is kept: the shift from
/// the garment's own shape (the same binding on the unmorphed body) is
/// averaged over the cloth's neighbours.
#[allow(clippy::type_complexity)]
fn calm(refs: &[([usize; 3], [f32; 3], [f32; 3])], tris: &[([usize; 3], [[f32; 2]; 3])], vs: Vec<V3>, pp: &[V3], base: &[V3], layer: Layer) -> Vec<V3> {
    let nv = vs.len();
    let rest: Vec<V3> = refs
        .iter()
        .map(|(r, w, o)| {
            let (a, b, c) = (base[r[0]], base[r[1]], base[r[2]]);
            let n = norm(cross(sub(b, a), sub(c, a)));
            let e1 = norm(sub(b, a));
            let e2 = cross(n, e1);
            let on: V3 = std::array::from_fn(|i| w[0] * a[i] + w[1] * b[i] + w[2] * c[i]);
            madd(madd(madd(on, n, o[0]), e1, o[1]), e2, o[2])
        })
        .collect();
    let mut nbr: Vec<Vec<u32>> = vec![Vec::new(); nv];
    for (t, _) in tris {
        for k in 0..3 {
            let (i, j) = (t[k], t[(k + 1) % 3]);
            if !nbr[i].contains(&(j as u32)) {
                nbr[i].push(j as u32);
            }
            if !nbr[j].contains(&(i as u32)) {
                nbr[j].push(i as u32);
            }
        }
    }
    let mut shift: Vec<V3> = (0..nv).map(|i| sub(vs[i], rest[i])).collect();
    for _ in 0..CLOTH_CALM {
        let next: Vec<V3> = (0..nv)
            .map(|i| {
                if nbr[i].is_empty() {
                    return shift[i];
                }
                let mut m = [0f32; 3];
                for &j in &nbr[i] {
                    m = add(m, shift[j as usize]);
                }
                let k = 1.0 / nbr[i].len() as f32;
                [0.5 * shift[i][0] + 0.5 * m[0] * k, 0.5 * shift[i][1] + 0.5 * m[1] * k, 0.5 * shift[i][2] + 0.5 * m[2] * k]
            })
            .collect();
        shift = next;
    }
    // the calmed cloth must not sink into the body: each vertex a little off its
    // own triangle (along the triangle's normal), if it was bound that far off
    (0..nv)
        .map(|i| {
            let v = add(rest[i], shift[i]);
            let (r, w, o) = &refs[i];
            let (a, b, c) = (pp[r[0]], pp[r[1]], pp[r[2]]);
            let (a0, b0, c0) = (base[r[0]], base[r[1]], base[r[2]]);
            let cr = cross(sub(b, a), sub(c, a));
            let cr0 = cross(sub(b0, a0), sub(c0, a0));
            let k = (dot(cr, cr).sqrt() / dot(cr0, cr0).sqrt().max(1e-9)).sqrt();
            let n = norm(cr);
            let on: V3 = std::array::from_fn(|q| w[0] * a[q] + w[1] * b[q] + w[2] * c[q]);
            let d = dot(sub(v, on), n);
            let [lo, hi] = match layer {
                Layer::Gown => CLOTH_OFF_GOWN,
                _ if rest[i][1] < CLOTH_NECK_Y => CLOTH_OFF_OVER,
                _ => CLOTH_OFF_HEAD,
            };
            let want = (o[0] * k).min(hi).max(lo);
            if want > 0.0 && d < want {
                madd(v, n, want - d)
            } else {
                v
            }
        })
        .collect()
}

/// How a garment follows a body other than the one it was draped on.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Layer {
    /// Each vertex with its own body triangle, as Apoleia binds its garments.
    Bound,
    /// Calmed (see mh_cloth), next to the body.
    Gown,
    /// Calmed, lying over the gown.
    Over,
}

/// How often a calmed garment's shift from its own shape is averaged over its neighbours (PLACEHOLDER).
const CLOTH_CALM: usize = 24;
/// The least and the most a calmed garment is held off the body triangle it is bound to, in base units of 10 cm:
/// the gown; what lies over the gown below the neck; the same on the head. Below the least the body's finer bumps
/// poke through, above the most the cloth crumples again. PLACEHOLDER, by eye.
const CLOTH_OFF_GOWN: [f32; 2] = [0.07, 0.09];
const CLOTH_OFF_OVER: [f32; 2] = [0.13, 0.17];
const CLOTH_OFF_HEAD: [f32; 2] = [0.0, 0.05];
/// Below this height (base units) a garment over the gown lies on the gown, above it on the head.
const CLOTH_NECK_Y: f32 = 5.9;

pub(crate) fn mh_cloth(dir: &str, name: &str, pp: &[V3], base: &[V3], color: &dyn Fn(V3) -> Rgb, cells: Option<&dyn Fn(V3) -> [f32; 2]>, layer: Layer) -> Option<Surface> {
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
    let vs = if layer == Layer::Bound { vs } else { calm(&refs, &tris, vs, pp, base, layer) };
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
pub(crate) fn mh_hair2(dir: &str, name: &str, pp: &[V3], base: &[V3], hc: V3, color: &dyn Fn(V3) -> Rgb, hang: bool, thin: (f32, u32)) -> Option<Surface> {
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
    let mut s = Surface::new(mat2(0.6));
    s.tex = Some(crate::real::image(dir, name));
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
            s.col.push(linear(color(v)));
            s.uv.push([f[3 + 2 * k], 1.0 - f[4 + 2 * k]]);
            let mut d = sub(v, hc);
            if hang {
                d[1] = d[1].max(0.0);
            }
            s.nrm.push(norm(d));
        }
    }
    Some(s)
}
