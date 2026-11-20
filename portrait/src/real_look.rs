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
pub(crate) fn real_skin(s: &mut Surface, idx: &[u32], pp: &[V3], dir: &str, age: f32, female: bool, hair: Rgb, scalp_file: Option<String>, sun: f32, seed: u32, flush: (f32, &str), lash_line: f32, lid_under: [f32; 2], lash_tone: (f32, &str), lips: Option<(&crate::dress::Lips, f32)>, girls_image: bool, tone: f32) {
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
    // real look: the lash line. Where the lashes grow the lid's edge is dark with their roots (skin_lash.txt, 0..1
    // per vertex; tools/portrait/pipeline/skin_lash.py); the lashes' cards themselves point at the viewer there
    // and show only further out. Only a dress with a table asks for it (`lash_line`); the colour is the lashes'
    // (build.rs, `DressSet::lash_tone`), and only ever darker than the skin (white lashes leave the lid as it is)
    let lash: Vec<f32> = if lash_line > 0.0 { crate::real::column(&format!("{dir}/skin_lash.txt"), 0.0) } else { Vec::new() };
    // the lower lid's rim in that table: skin_lash.py writes the lower lid at half weight (`LOWER=0.5`), so a
    // value up to a half is the lower lid's, and how much of a half says how near the rim
    let under = |v: usize| lash.get(v).map_or(0.0, |&l| if l <= 0.5 { l * 2.0 } else { 0.0 });
    let lash_c = mix(mul(linear(hair), lash_tone.0), linear(hex(lash_tone.1)), 0.5);
    // real look: the lips. Where the red of the lips is (skin_lip.txt, per vertex how much lip, 0..1, and how
    // much of that upper lip; tools/portrait/pipeline/skin_lip.py) a share of the skin's own colour is kept and
    // the colour of the blood under it added: lips are skin without its horn layer, so they go with the skin's
    // colour a little and are not one red for everyone; the upper lip times its own factor. Only a dress with a
    // table asks for it (`lips`, crate::dress::Lips); without, the builder's facets carry the lips (build.rs)
    let lip = lips.and_then(|_| crate::real::rows(&format!("{dir}/skin_lip.txt")));
    let lip: &[Vec<f32>] = lip.as_ref().map_or(&[], |l| &l[..]);
    let lip_k = lips.map_or((1.0, [0.0; 3], 1.0, 1.0), |(l, share)| (l.skin, l.blood, l.upper, share));
    // (round 111) the lips of dark skin: melanin lies in the lips' skin too and hides the blood under it, as it
    // does in the skin around them (the stage's tint, materials.ts `skinLook`). One red for every skin stood on
    // dark skin as a salmon mouth, painted on. From `Lips::dark`'s luminance of the person's skin downward less of
    // the blood's colour shows (`through`), and what it loses of it the lips keep of the skin's own colour
    let through = lips.map_or(1.0, |(l, _)| (tone / l.dark[0]).min(1.0).powf(l.dark[1]));
    let lip_k = (lip_k.0 + (1.0 - lip_k.0) * (1.0 - through), mul(lip_k.1, through), lip_k.2, lip_k.3);
    // (round 111) the skin's image is painted from photographs, with their light in it: light on the nose's root
    // and back and in lines from the root under the eyes, a shade beside the root (a fifth lighter than the cheeks
    // on the men's). `skin_paint.py` writes each image once more with that light taken out (`_flat`). Round 111
    // drew only a head whose nose root is low with it, on which the painted light lay as a pale stripe on a plane
    // between the eyes. (Round 113) Every head of a dress with a table is drawn with it: the stage lights the face,
    // and a second light painted under it, from another side, stood on every face as a pale, greyish band from
    // the nose's root under the eyes, most on the side the key light falls on
    let flat_image = lips.map(|_| crate::real::image(dir, &format!("skin_{}_{}_flat", if age < 30.0 { "young" } else if age < 55.0 { "middleage" } else { "old" }, if female || girls_image { "female" } else { "male" })))
        .filter(|f| crate::real::has(f));
    // real look: blood under thin skin, nose, cheeks, ears and chin a little
    // redder (skin_red.txt, 0..1 per vertex, or the file a dress names); haemoglobin takes green and
    // blue away (after Jimenez et al., 2010, not verified online). Strength
    // PLACEHOLDER: weaker on dark skin, where melanin hides it, a little
    // more on old men (weathered, broken veins)
    let red: Vec<f32> = crate::real::column(&format!("{dir}/{}", flush.1), 0.0);
    let red_k: f32 = settings::SKIN_RED * flush.0 * if female { 1.0 } else { 1.0 + 0.5 * ((age - 40.0) / 30.0).clamp(0.0, 1.0) };
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
    // the two edges of the lips' seam (see below): no shade of the mouth's inside on them, which the strip closes;
    // the upper lip's edge has the strip's share of the lips' colour, so that the lip's underside lightens towards
    // the seam (on the lower lip's edge, which lies in the light, that share stood as a pale rim)
    let seam: f32 = lips.map_or(0.0, |(l, _)| l.seam);
    let mut on_seam = vec![0f32; n];
    if seam > 0.0 {
        for side in &crate::morph::LIP_SEAM {
            for (edge, k) in [(&side.0[..], seam), (&side.1[..], 1.0)] {
                for &v in edge.iter().filter(|&&v| v < n) {
                    on_seam[v] = k;
                }
            }
        }
    }
    // the skin's colour per vertex
    let vc: Vec<V3> = (0..n)
        .map(|v| {
            let mut c = mul(acc[v], 1.0 / wsum[v].max(1e-9));
            if let Some(&m) = scalp.get(v) {
                // (only darker: under grey or white hair the scalp stays skin)
                c = mix(c, [c[0].min(hl[0]), c[1].min(hl[1]), c[2].min(hl[2])], 0.8 * m);
            }
            if let Some(&[on_lip, upper]) = lip.get(v).map(|r| &r[..]) {
                c = mix(c, mul(add(mul(c, lip_k.0), lip_k.1), 1.0 + (lip_k.2 - 1.0) * upper), on_lip * lip_k.3);
            }
            if let Some(&r) = red.get(v) {
                let lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
                let k = r * red_k * (lum / 0.35).clamp(0.15, 1.0);
                c = [c[0], c[1] * (1.0 - 0.45 * k), c[2] * (1.0 - 0.4 * k)];
            }
            if on_seam[v] > 0.0 {
                c = mul(c, on_seam[v]);
            } else if let Some(&a) = ao.get(v) {
                c = mul(c, 1.0 - ao_k * (1.0 - a.max(0.0)).powf(1.3) * (1.0 - (1.0 - lid_under[1]) * under(v)));
            }
            if let Some(&l) = lash.get(v) {
                let l = l * (1.0 - (1.0 - lid_under[0]) * under(v));
                c = mix(c, [c[0].min(lash_c[0]), c[1].min(lash_c[1]), c[2].min(lash_c[2])], (l * lash_line).min(1.0));
            }
            if let Some(fv) = folds.as_ref().and_then(|f| f.get(v)) {
                let dark: f32 = fv.iter().zip(&gdepth).map(|(w, d)| w * d).sum();
                c = mul(c, 1.0 - dark.min(0.5));
            }
            [(c[0] * lift).min(1.0), (c[1] * lift).min(1.0), (c[2] * lift).min(1.0)]
        })
        .collect();
    s.uv.clear();
    s.nrm.clear();
    let none = vec![[0f32, 0.0]];
    for (k, f) in idx.chunks_exact(3).enumerate() {
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
            s.col[3 * k + j] = vc[v as usize];
            s.nrm.push(nrm[v as usize]);
        }
        s.uv.extend([best.0, best.1, best.2]);
    }
    // real look: the seam of the lips. MakeHuman's closed mouth is a slit of a millimetre between the edges where
    // the lips turn inward, the lower edge some millimetres behind the upper: one looks through it into the
    // mouth, which is black, and no target closes it beside the middle (a dress with a table lays the lips on
    // each other: morph.rs `lips_meet`; the edges then stand at one height, one behind the other). A strip from
    // edge to edge closes it, in
    // the lips' colour times `seam`, facing the way the lips do (crate::morph::LIP_SEAM, the two edges from the
    // middle outward on either side)
    if seam > 0.0 {
        for (up, lo) in crate::morph::LIP_SEAM.iter().map(|side| (&side.0[..], &side.1[..])) {
            if up.iter().chain(lo).any(|&v| v >= n) {
                continue;
            }
            let mut face = [0f32; 3];
            for &v in up.iter().chain(lo) {
                face = add(face, nrm[v]);
            }
            let face = mul(face, 1.0 / len(face).max(1e-9));
            let (mut i, mut j) = (0, 0);
            while i + 1 < up.len() || j + 1 < lo.len() {
                // the next vertex along either edge, whichever is less far along its own (the edges have 11 and 8
                // vertices; by their count, not by where they lie, so that every head gets the same strip)
                let upper = j + 1 >= lo.len() || (i + 1 < up.len() && (i + 1) * (lo.len() - 1) <= (j + 1) * (up.len() - 1));
                let mut t = if upper { [up[i], lo[j], up[i + 1]] } else { [up[i], lo[j], lo[j + 1]] };
                if upper {
                    i += 1;
                } else {
                    j += 1;
                }
                if dot(cross(sub(pp[t[1]], pp[t[0]]), sub(pp[t[2]], pp[t[0]])), face) < 0.0 {
                    t.swap(1, 2);
                }
                for v in t {
                    s.pos.push(pp[v]);
                    s.col.push(mul(vc[v], seam / on_seam[v]));
                    s.nrm.push(face);
                    s.uv.push(uvs.get(v).and_then(|u| u.first()).copied().unwrap_or([0.0, 0.0]));
                }
            }
        }
    }
    let a = if age < 30.0 { "young" } else if age < 55.0 { "middleage" } else { "old" };
    // a boy before his beard wears the girls' image where the dress table says so (`DressSet::boy_skin`): the
    // men's has the shade of a shaven beard round the mouth and coarser pores
    let sex = if female || girls_image { "female" } else { "male" };
    s.tex = Some(match flat_image {
        Some(f) => f,
        None => crate::real::image(dir, &format!("skin_{a}_{sex}")),
    });
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
        let bald = if p.female { 0.0 } else { c01((p.age - 22.0) / 38.0) * p.u(BALD) * 1.7 };
        let coily = p.dress.set().and_then(|d| d.coily_of(p.u(CURL)));
        let name = if let Some(c) = coily.filter(|_| !(long_hair && p.age >= 7.0 && p.hair_style() == Hair::Veil)) {
            // (round 111) tightly curled hair: one mass, by sex, age and how much of it is left (under a veil that
            // hides all hair there is none, as below; under a hood on the head it is the cut that lies closest)
            let hooded = p.dress.set().is_some_and(|d| d.hood_of(p.female, p.age, p.seed) == crate::dress::Hood::Up);
            if p.age < 7.0 {
                c.small
            } else if long_hair {
                c.women
            } else if bald > 0.75 && !hooded {
                c.bald
            } else if bald > 0.4 || hooded {
                c.thin
            } else {
                c.men
            }
        } else if p.age < 7.0 {
            // small children: short loose hair
            p.dress.set().map_or("crop01", |d| d.hair_small)
        } else if long_hair {
            match p.hair_style() {
                Hair::Braid => p.dress.set().map_or("braid01", |d| d.hair_girl),
                Hair::Veil => match p.dress.set() {
                    // (the hair under a veil set back; a veil on forehead and cheeks hides all hair and has none
                    // under it)
                    Some(d) if p.veil() == crate::dress::Veil::Back => d.hair_veiled,
                    _ => return None,
                },
                _ => "bun01",
            }
        } else {
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
                if d.hood_of(p.female, p.age, p.seed) == crate::dress::Hood::Up { d.hair_hooded } else { d.hair_of(p.seed, p.age) }
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
                Layer::Under => CLOTH_OFF_UNDER,
                Layer::Gown => CLOTH_OFF_GOWN,
                _ if rest[i][1] < CLOTH_NECK_Y => CLOTH_OFF_OVER,
                _ => CLOTH_OFF_HEAD,
            };
            let want = (o[0] * k).min(hi).max(lo);
            if want > 0.0 && d < want {
                madd(v, n, want - d)
            } else if layer == Layer::Under && d > hi {
                // what is worn under the gown stays under it: no further off the skin than the gown's least
                madd(v, n, hi - d)
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
    /// Calmed, on the skin under the gown (a shirt, a smock: round 110).
    Under,
    /// Calmed (see mh_cloth), over what is worn next to the body.
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
/// The same for what is worn under the gown: it lies on the skin, and nowhere as far off it as the gown's least.
/// Such a garment has no rolled hem (this hold would crush one). PLACEHOLDER, by eye.
const CLOTH_OFF_UNDER: [f32; 2] = [0.015, 0.045];
const CLOTH_OFF_OVER: [f32; 2] = [0.13, 0.17];
const CLOTH_OFF_HEAD: [f32; 2] = [0.0, 0.05];
/// Below this height (base units) a garment over the gown lies on the gown, above it on the head.
const CLOTH_NECK_Y: f32 = 5.9;

pub(crate) fn mh_cloth(dir: &str, name: &str, pp: &[V3], base: &[V3], color: &dyn Fn(V3) -> Rgb, cells: Option<&dyn Fn(V3) -> [f32; 2]>, layer: Layer) -> Option<Surface> {
    mh_cloth_as(dir, name, "", pp, base, color, cells, layer)
}

/// `mh_cloth` for a garment that may have no image of its own beside it: it is drawn with `image`'s then (a second
/// cut of one cloth: a woman's gown with the men's image, a shirt with the smock's).
#[allow(clippy::too_many_arguments)]
pub(crate) fn mh_cloth_as(dir: &str, name: &str, image: &str, pp: &[V3], base: &[V3], color: &dyn Fn(V3) -> Rgb, cells: Option<&dyn Fn(V3) -> [f32; 2]>, layer: Layer) -> Option<Surface> {
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
    let own = crate::real::image(dir, name);
    s.tex = Some(if image.is_empty() || crate::real::has(&own) { own } else { crate::real::image(dir, image) });
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

/// The points of a file bound to the body (`tools/portrait/pipeline/hairlib.py` `write_bound`: the number of points
/// and of triangles, then a row for each point: three corners of the base body, their weights, the way from there),
/// where the morphed body carries them, and the rows of its triangles (three points, three places in the image).
fn bound<'a>(rows: &'a [Vec<f32>], pp: &[V3], base: &[V3]) -> Option<(Vec<V3>, &'a [Vec<f32>])> {
    let head = rows.first()?;
    let (nv, nt) = (*head.first()? as usize, *head.get(1)? as usize);
    if nt == 0 || rows.len() < 1 + nv + nt {
        return None;
    }
    let mut refs = Vec::with_capacity(nv);
    let (mut lo0, mut hi0, mut lo1, mut hi1) = ([f32::MAX; 3], [f32::MIN; 3], [f32::MAX; 3], [f32::MIN; 3]);
    for f in &rows[1..=nv] {
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
    let vs = refs
        .iter()
        .map(|(r, w, o)| std::array::from_fn(|a| w[0] * pp[r[0]][a] + w[1] * pp[r[1]][a] + w[2] * pp[r[2]][a] + o[a] * sc[a]))
        .collect();
    Some((vs, &rows[1 + nv..1 + nv + nt]))
}

/// How often a plait's way with the body is evened out along it (`mh_rope`): after n rounds over a tube of
/// eight corners a place is the mean of about the square root of 2 n / 3 rings up and down, here 14 rings of
/// 2.5 mm, 3.5 cm. A file of shorter pieces says a number of its own (the third of its first line): the locks
/// of a head's hair 3. A lock is some 15 rings long and with 300 rounds moves as one stiff piece: on a child's
/// head, smaller than the base's, the hair stood 2.7 cm over the crown and the fringe hung over the eyes
/// (tests/locks.rs).
const ROPE_EVEN: usize = 300;

/// Real look: hair that is solid (`name`.txt, `hairlib.py` `write_tubes`): the round strands of a plait, each a
/// closed tube; the locks of a beard, each an arched band that is open below (`locks_from_wisps`); and the body
/// of a head's hair (round 109, `hair_body.py`: layers of thick bundles, each such a band, over a shell).
/// The surface's direction is read from the triangles (a corner's is the mean of its triangles', weighted by
/// their size), so that a strand is lit round: bright on the side towards a light, dark on the other. As hair
/// cards (`mh_hair2`: the direction from the head's centre to the card) a plait was one face turned away from
/// the head, and a head's hair one smooth dome whatever way its cards lay.
///
/// Each ring of a strand is bound to the one triangle of the body nearest to it: jaw, neck, shoulder, chest in
/// turn down a plait. On another body than the base's these go different ways, and where the plait passes from
/// one to the next it had a kink (its middle line turned up to 74 degrees within 2 cm on girls of 8 to 19; as it
/// is laid, 23). So a plait keeps the form it was laid in, and goes with the body by the way its points are
/// carried, evened out along the plait (tests/plait.rs).
///
/// `image`: the image of the surface where the file has none of its own beside it (the bundles of every cut of
/// a dress set are drawn with one image, `DressSet::body_image`). `color`: the hair's colour at a place (a head's
/// hair has one; a beard greys first at the chin).
pub(crate) fn mh_rope(dir: &str, name: &str, image: &str, pp: &[V3], base: &[V3], color: &dyn Fn(V3) -> Rgb) -> Option<Surface> {
    let rows = crate::real::rows(&format!("{dir}/{name}.txt"))?;
    let (carried, tris) = bound(&rows, pp, base)?;
    let (laid, _) = bound(&rows, base, base)?;
    let idx: Vec<u32> = tris.iter().flat_map(|f| [f[0] as u32, f[1] as u32, f[2] as u32]).collect();
    // points laid at one place are one point (a strand begins and ends as a point, its ring's corners all there):
    // they go one way and stay together
    let mut first = std::collections::HashMap::new();
    let one: Vec<usize> = laid.iter().enumerate().map(|(i, p)| *first.entry(p.map(f32::to_bits)).or_insert(i)).collect();
    let mut beside: Vec<Vec<u32>> = vec![Vec::new(); laid.len()];
    for f in idx.chunks_exact(3) {
        for (a, b) in [(f[0], f[1]), (f[1], f[2]), (f[2], f[0])] {
            let (a, b) = (one[a as usize], one[b as usize]);
            if a != b {
                if !beside[a].contains(&(b as u32)) {
                    beside[a].push(b as u32);
                }
                if !beside[b].contains(&(a as u32)) {
                    beside[b].push(a as u32);
                }
            }
        }
    }
    let mut way: Vec<V3> = carried.iter().zip(&laid).map(|(&c, &l)| sub(c, l)).collect();
    let mut next = way.clone();
    // (a file may say how often itself: the third number of its first line)
    for _ in 0..rows[0].get(2).map_or(ROPE_EVEN, |&n| n as usize) {
        for (i, near) in beside.iter().enumerate() {
            if !near.is_empty() {
                let sum = near.iter().fold([0f32; 3], |s, &j| add(s, way[j as usize]));
                next[i] = mul(sum, 1.0 / near.len() as f32);
            }
        }
        std::mem::swap(&mut way, &mut next);
    }
    let vs: Vec<V3> = laid.iter().zip(&one).map(|(&l, &i)| add(l, way[i])).collect();
    let nn = vnormals(&vs, &idx);
    // a closed surface (every edge between two triangles: a plait's strands) is seen from outside only; one that
    // is not (the arched bands of a head's locks) from both sides. A triangle with two corners at one place (at
    // a strand's point) is no triangle and has no edges
    let mut edges = std::collections::HashMap::new();
    for f in idx.chunks_exact(3) {
        let f = [one[f[0] as usize], one[f[1] as usize], one[f[2] as usize]];
        if f[0] != f[1] && f[1] != f[2] && f[2] != f[0] {
            for (a, b) in [(f[0], f[1]), (f[1], f[2]), (f[2], f[0])] {
                *edges.entry((a.min(b), a.max(b))).or_insert(0u32) += 1;
            }
        }
    }
    let closed = edges.values().all(|&n| n == 2);
    let mut s = Surface::new(if closed { mat(0.6) } else { mat2(0.6) });
    // its own image beside the file, else the one given
    let own = crate::real::image(dir, name);
    s.tex = Some(if crate::real::has(&own) || image.is_empty() { own } else { crate::real::image(dir, image) });
    for f in tris {
        for k in 0..3 {
            let i = f[k] as usize;
            s.pos.push(vs[i]);
            // (a point may say how light it is against the hair's colour, the tenth number of its row: a hair
            // body's bundles are each of a tone, and darker where they come up from under the others)
            // Light hair is less dark in its own shade than dark hair is: light goes through it and comes back
            // out of it. The shade's power falls with the colour's lightness (PLACEHOLDER by eye: white hair
            // with the full shade was stone with black joints)
            let c = linear(color(vs[i]));
            let shade = rows[1 + i].get(9).copied().unwrap_or(1.0);
            let shade = if shade < 1.0 { shade.max(0.0).powf(1.0 - 0.7 * (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]).clamp(0.0, 1.0).sqrt()) } else { shade };
            s.col.push(c.map(|c| c * shade));
            s.uv.push([f[3 + 2 * k], 1.0 - f[4 + 2 * k]]);
            s.nrm.push(nn[i]);
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
    let (vs, tris) = bound(&rows, pp, base)?;
    let nv = vs.len();
    let mut s = Surface::new(mat2(0.6));
    s.tex = Some(crate::real::image(dir, name));
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
        for f in tris {
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
