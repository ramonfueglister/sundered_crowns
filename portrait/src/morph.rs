//! The head of a person: MakeHuman's base head moved by its morph targets, as the genes, age, sex, food and mood
//! of the person weigh them.

use crate::geo::*;
use crate::head::{Head, DELTA_SCALE};
use crate::look::*;
use crate::settings;

/// The morphed head and shoulders as a portrait shows them, for tests and tools.
pub fn morph_test(h: &Head, p: &Look) -> Vec<V3> {
    morph(h, p).0
}

/// The morphed head and shoulders without the drawing of a dress with a table (`DressSet::style`): the face as it
/// is measured, which the tests against the surveys of real heads read (examples/face_measure.rs).
pub fn morph_test_measured(h: &Head, p: &Look) -> Vec<V3> {
    morph_as(h, p, None, None, None, None, None, None, false).0
}

/// `morph_test_measured` with another value than the dress table's where one is given: the mouth's place
/// (`morph_test_mouth`), the braincase's factors (`morph_test_skull`), the weight of a wider mouth
/// (`morph_test_wide`), the factor on the nose's length (`morph_test_nose`).
pub fn morph_test_measured_as(h: &Head, p: &Look, mouth_at: Option<f32>, skull: Option<[f32; 3]>, wide: Option<f32>, nose: Option<f32>) -> Vec<V3> {
    morph_as(h, p, mouth_at, None, skull, wide, nose, None, false).0
}

/// `morph_test` with the mouth at another share of the way from nose to chin than the dress table's
/// (`DressSet::mouth_at`; 0: where the morph targets leave it), for tests that hold the table's value against the
/// head without it.
pub fn morph_test_mouth(h: &Head, p: &Look, mouth_at: f32) -> Vec<V3> {
    morph_as(h, p, Some(mouth_at), None, None, None, None, None, true).0
}

/// `morph_test` with another share of the lips' slit closed along the seam than the dress table's
/// (`DressSet::seam_shut`; 0: the mouth as it is closed in its middle alone), for tests that hold the table's
/// value against the head without it.
pub fn morph_test_seam(h: &Head, p: &Look, seam_shut: f32) -> Vec<V3> {
    morph_as(h, p, None, Some(seam_shut), None, None, None, None, true).0
}

/// `morph_test` with the braincase larger by other factors than the dress table's (`DressSet::skull`: breadth,
/// length, height; ones: the head as MakeHuman's targets leave it), for tests and for the tool that finds the
/// table's values (examples/face_measure.rs `--children --skull`).
pub fn morph_test_skull(h: &Head, p: &Look, by: [f32; 3]) -> Vec<V3> {
    morph_as(h, p, None, None, Some(by), None, None, None, true).0
}

/// `morph_test` with another weight for a wider mouth than the dress table's (`DressSet::child_mouth`; 0: the
/// mouth as MakeHuman's child and the rest of the table leave it), for tests and for the tool that finds the
/// table's values (examples/face_measure.rs `--children --mouth`).
pub fn morph_test_wide(h: &Head, p: &Look, wide: f32) -> Vec<V3> {
    morph_as(h, p, None, None, None, Some(wide), None, None, true).0
}

/// `morph_test` with another factor on the nose's length than the dress table's (`DressSet::child_nose`; 1: the
/// nose as MakeHuman's targets leave it), for tests and for the tool that finds the table's values
/// (examples/face_measure.rs `--children --nose`).
pub fn morph_test_nose(h: &Head, p: &Look, by: f32) -> Vec<V3> {
    morph_as(h, p, None, None, None, None, Some(by), None, true).0
}

/// The targets of MakeHuman a person's head is made of and the weight of each, in the order they are added (a target
/// may come more than once: from the genes, from the dress table's `rest`, from age or a mood), for tests and for
/// tools that ask what gives a face its form (examples/face_measure.rs `--made`).
pub fn morph_targets(h: &Head, p: &Look) -> Vec<(String, f32)> {
    let mut list = Vec::new();
    morph_as(h, p, None, None, None, None, None, Some(&mut list), true);
    list
}

/// Where on MakeHuman's base head a target of `DressSet::lower_only` fades out (heights, 1 unit = 10 cm): whole up to
/// the lowest of the cheekbones' landmarks, gone from the root of the nose (sellion) up, 23 mm higher. MakeHuman's
/// head forms are two things with next to nothing between them: a jaw, which ends under the cheekbones, and a
/// skull, which begins over the ears (in the band the triangular head moves a vertex by 0.9 mm at most, the
/// diamond by 4.4 at its upper end, where its skull begins; tests/faces.rs).
pub fn lower_band(h: &Head) -> [f32; 2] {
    [h.base[crate::measure::CHEEKBONES[2].0][1], h.base[crate::measure::SELLION][1]]
}

/// How much of a target of `DressSet::lower_only` a vertex at the base's height `y` takes (1 below the band, 0
/// above it, a smooth step between).
pub fn lower_share(y: f32, band: [f32; 2]) -> f32 {
    let t = ((band[1] - y) / (band[1] - band[0])).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// Where on MakeHuman's base head a target of `DressSet::neck` fades out, in mm: a plane through the point this
/// far over and before the chin's lowest point, tilted by so many degrees (its front lower than its back: the
/// plane of a tape round the neck where it is thinnest, as measure.rs `neck_at` finds it on grown women), and
/// how far over that plane a target is taken whole and from where not at all. The jaw's landmarks lie 51 mm
/// and more over the plane and take nothing (whole, `neck-scale-horiz-incr` moves a jaw's corner by 2 mm per
/// unit); the chin's lowest point lies 35 mm over it, in the band, and is moved by neither target of
/// England's. With the band 10 mm lower the neck gets a waist over the part made thicker (the smallest loop
/// moves up into it by 8 mm and more).
pub const NECK_UNDER: ([f32; 2], f32, [f32; 2]) = ([-1.0, -90.0], 22.0, [20.0, 40.0]);

/// How much of a target of `DressSet::neck` the vertex `v` of the base head takes (1 under the band of
/// `NECK_UNDER`, 0 over it, a smooth step between).
pub fn neck_share(h: &Head, v: usize) -> f32 {
    let (b, m, (at, tilt, band)) = (h.base[v], h.base[crate::measure::MENTON], NECK_UNDER);
    let (y, z) = ((b[1] - m[1]) * 100.0 - at[0], (b[2] - m[2]) * 100.0 - at[1]);
    1.0 - sm(band[0], band[1], y * tilt.to_radians().cos() + z * tilt.to_radians().sin())
}

/// Where the braincase begins on MakeHuman's base head (`skull_field`), in units (1 unit = 10 cm): its floor
/// lies this far over glabella at the forehead (2 cm: the lower forehead stays with the face, whose breadth it
/// has in the survey of measure.rs `CHILDREN`, and a fringe lies on it), this far over tragion at the ear's
/// depth (just over the ear's upper rim, which reaches 20.5 mm over tragion) and, behind a point this far behind
/// tragion, runs down to this far over tragion at the back of the head (the nape). PLACEHOLDER: by anatomy and
/// by eye, as `SKULL_REACH` and `SKULL_CENTRE` are; the factors of `DressSet::skull` are fitted with these.
pub const SKULL_FLOOR: [f32; 4] = [0.20, 0.25, 0.10, -0.05];
/// How far over that floor a vertex is of the braincase in full, in units (a smooth step from the floor up).
/// In this band the skin is drawn out, since the braincase grows and what lies under the floor stays: an edge
/// of it to twice its length at the most, on girls of two (tests/faces.rs).
pub const SKULL_REACH: f32 = 0.40;
/// How far behind glabella the upright stands from which the braincase grows in length, in units: the forehead
/// stands about there over the brows, so it keeps its place, and all of the length is added behind it. That is
/// where a child's head has it: the survey's depth from the ear to sellion grows as the face does (0.78 of the
/// oldest group's at two) and its head length less that depth is as long at two as on the grown (95 and 91 mm).
/// Ours behind the ear: 96 and 97 mm at two (74 and 71 before round 100), 96 and 95 on the grown.
pub const SKULL_CENTRE: f32 = 0.30;

/// How much of the braincase each vertex of the base head is (`skull_grow`): 0 on the face, on the ears and on
/// the neck (at and under the floor of `SKULL_FLOOR`), 1 from `SKULL_REACH` over it.
pub fn skull_field(h: &Head) -> Vec<f32> {
    skull_field_over(h, SKULL_REACH)
}

/// `skull_field` with another band over the floor than `SKULL_REACH` (the drawn face's: `STYLE_REACH`).
fn skull_field_over(h: &Head, reach: f32) -> Vec<f32> {
    use crate::measure::{GLABELLA, TRAGION};
    let b = &h.base;
    let (ty, tz, g) = ((b[TRAGION.0][1] + b[TRAGION.1][1]) / 2.0, (b[TRAGION.0][2] + b[TRAGION.1][2]) / 2.0, b[GLABELLA]);
    let back = h.body_full().iter().map(|&v| b[v as usize]).filter(|q| q[1] > ty).fold(f32::MAX, |z, q| z.min(q[2]));
    let (front, ear, nape, turn) = (g[1] + SKULL_FLOOR[0], ty + SKULL_FLOOR[1], ty + SKULL_FLOOR[3], tz - SKULL_FLOOR[2]);
    let level = |z: f32| ear + (front - ear) * (z - tz) / (g[2] - tz);
    b.iter()
        .map(|q| {
            let floor = if q[2] >= turn { level(q[2]) } else { level(turn) + (nape - level(turn)) * c01((turn - q[2]) / (turn - back)) };
            sm(0.0, reach, q[1] - floor)
        })
        .collect()
}

/// How far over the braincase's floor a vertex takes the drawn face's larger braincase in full
/// (`Style::skull`), in units: the whole height of the crown over the floor, so that the skin is drawn out
/// evenly from the forehead to the crown. Over `SKULL_REACH`, which a child's braincase grows over, a tenth more
/// height drew the forehead's skin out by three tenths in a band of 4 cm, where a fringe begins: the skin came
/// through the hair between the locks' roots (round 107). PLACEHOLDER, by eye.
pub const STYLE_REACH: f32 = 1.0;

/// The braincase made larger by the factors `by` (its breadth, its length, its height), each vertex by its share
/// of `skull_field`: sideways from the middle, backwards and forwards from the upright `SKULL_CENTRE` behind the
/// person's glabella, upwards from the height of the person's tragion. What lies at or under the field's floor
/// does not move: the face, the ears, the neck.
pub(crate) fn skull_grow(h: &Head, pp: &mut [V3], by: [f32; 3]) {
    skull_grow_over(h, pp, by, SKULL_REACH)
}

/// `skull_grow` over another band above the floor (`skull_field_over`).
pub(crate) fn skull_grow_over(h: &Head, pp: &mut [V3], by: [f32; 3], reach: f32) {
    use crate::measure::{GLABELLA, TRAGION};
    let (ty, cz) = ((pp[TRAGION.0][1] + pp[TRAGION.1][1]) / 2.0, pp[GLABELLA][2] - SKULL_CENTRE);
    for (v, w) in skull_field_over(h, reach).into_iter().enumerate().take(pp.len()) {
        if w > 0.0 {
            pp[v][0] *= 1.0 + w * (by[0] - 1.0);
            pp[v][2] = cz + (pp[v][2] - cz) * (1.0 + w * (by[1] - 1.0));
            pp[v][1] = ty + (pp[v][1] - ty) * (1.0 + w * (by[2] - 1.0));
        }
    }
}

/// Where the face's front begins on MakeHuman's base head (`face_front`), in units before tragion (1 unit =
/// 10 cm): nothing of it up to the first (the ear, the neck's front, the back of the jaw's corner), all of it
/// from the second (the nose, the mouth, the chin, the cheeks' front). PLACEHOLDER: by anatomy and by eye.
pub const FACE_FRONT: [f32; 2] = [0.18, 0.48];
/// The heights of `nose_set`, in units: how far under the lower lid's edge the nose's band has its whole
/// strain (the skin over the eyeball's lower half moves next to nothing), and over how far a strain sets in
/// at a border (the nose's foot, the edges of the lips' red, the chin). PLACEHOLDER: by anatomy and by eye.
pub const NOSE_HEIGHTS: [f32; 2] = [0.06, 0.02];
/// The step of heights in which `nose_ways` adds up the ways, in units (a twentieth of a millimetre).
const NOSE_STEP: f32 = 0.0005;

/// How much of the face's front each vertex of the base head is (`nose_set`): by its depth before tragion, a
/// smooth step between the two of `FACE_FRONT`. The eyeballs are not of it: a ball keeps its form.
pub fn face_front(h: &Head) -> Vec<f32> {
    use crate::measure::TRAGION;
    let tz = (h.base[TRAGION.0][2] + h.base[TRAGION.1][2]) / 2.0;
    let balls = [ball_of(h, 0), ball_of(h, 1)];
    let ball = |v: usize| balls.iter().any(|b| b.get(v).copied().unwrap_or(false));
    h.base.iter().enumerate().map(|(v, q)| if ball(v) { 0.0 } else { sm(FACE_FRONT[0], FACE_FRONT[1], q[2] - tz) }).collect()
}

/// How far up `nose_set` moves the skin at each height of a person's head: the height of the lower lids' edge
/// under the pupils, the height of the chin's lowest point and, from the one down to the other in steps of
/// `NOSE_STEP`, the way up at each. The nose's
/// band (from the lids' edge to the nose's foot) is shortened evenly so that the nose is `by` times as long
/// from sellion to its foot; what the nose loses the skin between its foot and the chin gains, drawn out
/// evenly, the lips' red keeping its height; the chin's lowest point stays.
fn nose_ways(pp: &[V3], by: f32) -> ([f32; 2], Vec<f32>) {
    use crate::measure::{LIDS, LIP_FOOT, LIP_TOP, MENTON, SELLION, SUBNASALE};
    let mid = |a: usize, b: usize| (pp[a][1] + pp[b][1]) / 2.0;
    // (the lower of the two lids' edges under the pupils: neither moves)
    let (lid, se, sn, me) = (pp[LIDS[0].1][1].min(pp[LIDS[1].1][1]), pp[SELLION][1], pp[SUBNASALE][1], pp[MENTON][1]);
    let (red_top, red_foot) = (mid(LIP_TOP[0], LIP_TOP[1]).min(sn), mid(LIP_FOOT[0], LIP_FOOT[1]).max(me));
    let [ramp, soft] = NOSE_HEIGHTS;
    // how much of the nose's strain and of the lower face's the skin at a height has (each begins at its
    // border with nothing: the nose's foot and the edges of the lips' red are moved by what lies over them)
    let nose = |y: f32| sm(lid, lid - ramp, y) * sm(sn, sn + soft, y);
    let lower = |y: f32| sm(sn, sn - soft, y) * sm(me, me + soft, y) * (1.0 - sm(red_top + soft, red_top, y) * sm(red_foot - soft, red_foot, y));
    let n = ((lid - me) / NOSE_STEP).ceil() as usize + 1;
    let at = |k: usize| lid - k as f32 * NOSE_STEP;
    // the two bands' lengths as the strains weigh them
    let (ln, ll) = (0..n).fold((0.0, 0.0), |(a, b), k| (a + nose(at(k)) * NOSE_STEP, b + lower(at(k)) * NOSE_STEP));
    // the nose's foot goes up by what the nose loses
    let up = (1.0 - by) * (se - sn);
    let (en, el) = (if ln > 0.0 { up / ln } else { 0.0 }, if ll > 0.0 { up / ll } else { 0.0 });
    let mut way = 0.0;
    let ways = (0..n)
        .map(|k| {
            let here = way;
            way += (en * nose(at(k)) - el * lower(at(k))) * NOSE_STEP;
            here
        })
        .collect();
    ([lid, me], ways)
}

/// A child's nose as long against a grown one's as a real child's (`DressSet::child_nose`): the skin of the
/// face's front (`face_front`) moved up by the ways of `nose_ways`. Heights only; nothing over the lower lids'
/// edges moves, nor the chin's lowest point and what lies under it, the ears, the neck or the back of the jaw.
pub(crate) fn nose_set(h: &Head, pp: &mut [V3], by: f32) {
    let ([lid, chin], ways) = nose_ways(pp, by);
    for (v, w) in face_front(h).into_iter().enumerate().take(pp.len()) {
        let t = (lid - pp[v][1]) / NOSE_STEP;
        if w > 0.0 && t > 0.0 && pp[v][1] >= chin && (t as usize) + 1 < ways.len() {
            let (k, f) = (t as usize, t.fract());
            pp[v][1] += w * (ways[k] + f * (ways[k + 1] - ways[k]));
        }
    }
}

pub(crate) fn morph(h: &Head, p: &Look) -> (Vec<V3>, usize) {
    morph_as(h, p, None, None, None, None, None, None, true)
}

#[allow(clippy::too_many_arguments)]
/// (`drawn`: with the drawing of a dress with a table, `DressSet::style`, as a portrait shows the head; without
/// it the face as it is measured)
fn morph_as(h: &Head, p: &Look, mouth_at: Option<f32>, seam_shut: Option<f32>, skull: Option<[f32; 3]>, wide: Option<f32>, nose: Option<f32>, mut list: Option<&mut Vec<(String, f32)>>, drawn: bool) -> (Vec<V3>, usize) {
    let mut pp = h.base.clone();
    let mut used = 0;
    // targets a dress with a table takes nothing of (`DressSet::without`)
    let without: &[&str] = p.dress.set().map_or(&[], |d| d.without);
    // Ears under a veil keep MakeHuman's form: they are hidden there, and linen is bound to the skin under it. The
    // wimple, close on the skin, went out with an ear that is large or has grown with age, the veil over it,
    // further off, did not: the wimple came through the veil at the ears (round 70)
    let ears_hidden = p.dress.set().is_some_and(|d| d.veiled(p.female, p.age));
    // targets a dress with a table takes the part below the cheekbones of only (`DressSet::lower_only`)
    let lower: &[&str] = p.dress.set().map_or(&[], |d| d.lower_only);
    let band = lower_band(h);
    let mut add = |name: &str, w: f32| {
        if w <= 1e-3 || ears_hidden && name.starts_with("ears/") || without.contains(&name) {
            return;
        }
        let Some(t) = h.targets.get(name) else { return };
        used += 1;
        if let Some(list) = list.as_deref_mut() {
            list.push((name.to_string(), w));
        }
        let k = w * DELTA_SCALE;
        let part = lower.contains(&name);
        for (j, &i) in t.ids.iter().enumerate() {
            let d = t.d[j];
            let k = if part { k * lower_share(h.base[i as usize][1], band) } else { k };
            let v = &mut pp[i as usize];
            v[0] += d[0] as f32 * k;
            v[1] += d[1] as f32 * k;
            v[2] += d[2] as f32 * k;
        }
    };
    // macro targets: sex × age × base type, sex × age × muscle × weight
    let yrs = p.age;
    // a dress with a table may say from which age a head has its adult form (MakeHuman's: 25)
    let yrs = p.dress.set().map_or(yrs, |d| crate::dress::head_years(d.adult[if p.female { 0 } else { 1 }], yrs));
    let a = if yrs < 11.0 {
        (yrs - 1.0) / 10.0 * 0.1875
    } else if yrs < 25.0 {
        0.1875 + (yrs - 11.0) / 14.0 * 0.3125
    } else {
        (0.5 + (yrs - 25.0) / 65.0 * 0.5).min(1.0)
    };
    let yrs = p.age;
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
    // the real look (crate::real): face genes
    // as factors of a face space;
    // settings::FACE_GAIN scales all of it (1.6: Ramon 31.10., recognisable
    // at portrait size; Rhodes et al., 1987, caricature advantage, not verified online)
    // (only the person's own genes go through the face space; a child's
    // face keeps its single targets, KID)
    let modules = crate::real::folder().is_some();
    if modules {
        let gain = settings::FACE_GAIN;
        let gr = p.grown();
        // outliers softened: c·tanh(x/c) leaves a gene one spread from the
        // middle nearly as it is (-9 %) and pulls the far ends in (2 spreads
        // -27 %, 3 spreads -43 %) (Ramon 31.10. "etwas zurücknehmen"; c PLACEHOLDER)
        let soft = settings::FACE_SOFT;
        // the genes' parts summed per target first (several genes pull on the
        // same target), then each sum softened above `lim`: MakeHuman's
        // targets are made for 0..1, far past that they turn into caricature
        // (lim·tanh(v/lim), lim 1 PLACEHOLDER: 0.3 -3 %, 0.85 -19 %, 1.4 -> 0.89)
        let lim = settings::FACE_LIM;
        let mut sums: Vec<(&str, &str, &str, f32)> = Vec::new();
        for (k, loads) in FACE_MOD.iter().enumerate() {
            let xl = (p.g(k) - 128.0) / 127.0;
            let xl = if soft > 0.0 { soft * (xl / soft).tanh() } else { xl };
            let x = xl * (0.35 + 0.65 * gr) * gain * p.dress.set().map_or(1.0, |d| d.gene_gain(k));
            for &(n, lo, hi, w) in loads.iter() {
                let v = if !n.is_empty() && lo.is_empty() { (x * w).max(0.0) } else { x * w };
                match sums.iter_mut().find(|e| e.0 == n && e.1 == lo && e.2 == hi) {
                    Some(e) => e.3 += v,
                    None => sums.push((n, lo, hi, v)),
                }
            }
        }
        for (n, lo, hi, v) in sums {
            let v = if lim > 0.0 { lim * (v / lim).tanh() } else { v };
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
        let x = if modules { KID[k] * (1.0 - p.grown()) * p.dress.set().map_or(1.0, |d| d.kid) } else { p.face(k) };
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
    let kid = (1.0 - p.grown()) * p.dress.set().map_or(1.0, |d| d.kid);
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
    if sag > 0.0 && crate::real::folder().is_some() {
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
    // lids at rest, where a dress with a table asks for them
    if let Some(d) = p.dress.set() {
        for sd in ["l", "r"] {
            for (k, t) in ["height1-decr", "height2-decr", "height3-decr", "eyefold-down"].iter().enumerate() {
                // (a child's lids stand higher: the three heights, not the fold)
                // (and the drawn face's stand higher still, `Style::lids`)
                let child = if k < 3 { d.eyes_of(p.female, p.age)[0] * if drawn { d.style_lids_of(p.female, p.age) } else { 1.0 } } else { 1.0 };
                add(&format!("eyes/{sd}-eye-{t}"), crate::dress::by_sex(d.lids[0][k], d.lids[1][k], p.female, p.grown()) * child);
            }
        }
        let child = 0.35 + 0.65 * p.grown();
        // the face at rest, and on it the face as it is drawn (`DressSet::style`): added to a row of `rest`, or
        // a row of its own
        let more = |n: &str| if drawn { d.style_face_of(n, p.female, p.grown(), p.age) } else { 0.0 };
        for &(n, women, men) in d.rest {
            add(n, crate::dress::by_sex(women, men, p.female, p.grown()) * child + more(n));
        }
        for (k, row) in d.style.face.iter().enumerate() {
            if !d.rest.iter().any(|r| r.0 == row.0) && !d.style.face[..k].iter().any(|r| r.0 == row.0) {
                add(row.0, more(row.0));
            }
        }
        let young = crate::dress::child_share(d.adult[if p.female { 0 } else { 1 }], p.age);
        for &(n, girls, boys) in d.child {
            add(n, (if p.female { girls } else { boys }) * young);
        }
        // a child's mouth as broad against a grown one's as a real child's (`DressSet::child_mouth`): of the pair
        // of targets the one the weight's sign asks for
        let w = wide.unwrap_or(d.child_mouth_of(p.female, p.age));
        add(if w > 0.0 { crate::dress::CHILD_MOUTH.0 } else { crate::dress::CHILD_MOUTH.1 }, w.abs());
    }
    let strength = p.dress.set().map_or(1.7, |d| d.mood);
    for &(n, w) in mood {
        add(n, w * strength);
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
    // the mouth at rest, where a dress with a table asks for it: closed by as much as it stands open, and opened
    // by as much as the lips lie in each other (MakeHuman's young heads stand a little open; genes, age and moods
    // each move the lips: a fixed weight on top of them left some mouths open and pressed others to a pout)
    if let Some(d) = p.dress.set() {
        let gap = lip_gap(h, &pp);
        let with = if gap > 0.0 { d.mouth_shut } else { d.mouth_part };
        // how far a weight of 1 on each target moves the lips apart in the middle
        let at = |t: &crate::head::Target, v: usize| t.ids.iter().position(|&i| i as usize == v).map_or(0.0, |j| t.d[j][1] as f32 * DELTA_SCALE);
        let per: f32 = with.iter().filter_map(|&(name, share)| h.targets.get(name).map(|t| share * (at(t, LIP_UPPER) - at(t, LIP_LOWER)))).sum();
        if per * gap < -1e-9 {
            let w = (-gap / per).min(MOUTH_MOST);
            for &(name, share) in with {
                let Some(t) = h.targets.get(name) else { continue };
                used += 1;
                if let Some(list) = list.as_deref_mut() {
                    list.push((name.to_string(), w * share));
                }
                let k = w * share * DELTA_SCALE;
                for (j, &i) in t.ids.iter().enumerate() {
                    let dd = t.d[j];
                    let v = &mut pp[i as usize];
                    v[0] += dd[0] as f32 * k;
                    v[1] += dd[1] as f32 * k;
                    v[2] += dd[2] as f32 * k;
                }
            }
        }
    }
    // the lips laid on each other from corner to corner, where a dress with a table asks for it
    // (`DressSet::seam_shut`); after the middle of the mouth is closed
    if let Some(share) = p.dress.set().map(|d| seam_shut.unwrap_or(d.seam_shut)).filter(|s| *s > 0.0) {
        lips_meet(h, &mut pp, share);
    }
    // the neck thicker under the jaw, where a dress with a table asks for it (`DressSet::neck`, `neck_share`)
    if let Some(d) = p.dress.set() {
        for &(name, women, men) in d.neck {
            let w = d.neck_of(women, men, p.female, p.grown());
            let Some(t) = h.targets.get(name).filter(|_| w > 1e-3) else { continue };
            used += 1;
            if let Some(list) = list.as_deref_mut() {
                list.push((name.to_string(), w));
            }
            for (j, &i) in t.ids.iter().enumerate() {
                let k = w * DELTA_SCALE * neck_share(h, i as usize);
                for c in 0..3 {
                    pp[i as usize][c] += t.d[j][c] as f32 * k;
                }
            }
        }
    }
    // the cheeks filled out between cheekbone and jaw, where a dress with a table asks for it
    // (`DressSet::cheek_fill`, `cheek_fill_of`)
    if let Some(mm) = p.dress.set().map(|d| d.cheek_fill_of(p.female, p.grown())).filter(|mm| *mm > 0.0) {
        cheek_fill(h, &mut pp, mm);
    }
    // the mouth set between nose and chin where a real one lies, where a dress with a table asks for it
    // (`DressSet::mouth_at`); after the lips are closed, which moves the line where they meet
    if let Some((d, at)) = p.dress.set().map(|d| (d, mouth_at.unwrap_or(d.mouth_at))).filter(|(_, at)| *at > 0.0) {
        mouth_set(h, &mut pp, at, crate::dress::by_sex(d.lean[0], d.lean[1], p.female, p.grown()));
    }
    // the eyes brought forward with their lids, where a dress with a table asks for it (`DressSet::eye_out`)
    if let Some(mm) = p.dress.set().map(|d| d.eye_out_of(p.female, p.age)).filter(|mm| *mm != 0.0) {
        eyes_out(h, &mut pp, mm / 100.0);
    }
    // and each ball set in its socket so that the pupil stands between the lids as a real one does (`DressSet::pupil`)
    if let Some(d) = p.dress.set().filter(|d| d.pupil > 0.0) {
        let lean = crate::dress::by_sex(d.lean[0], d.lean[1], p.female, p.grown());
        pupils_set(h, &mut pp, d.pupil, |side| d.gaze_of(side, lean)[1]);
    }
    // a child's nose as long against a grown one's as a real child's, where a dress with a table asks for it
    // (`DressSet::child_nose`); heights of the face's front between the lower lids and the chin only
    if let Some(by) = p.dress.set().map(|d| nose.unwrap_or(d.child_nose_of(p.female, p.age))).filter(|by| *by != 1.0) {
        nose_set(h, &mut pp, by);
    }
    // a child's braincase as large against its face as a real child's, where a dress with a table asks for it
    // (`DressSet::skull`); the face and the ears stay
    if let Some(by) = p.dress.set().map(|d| skull.unwrap_or(d.skull_of(p.female, p.age))).filter(|by| by.iter().any(|k| *k != 1.0)) {
        skull_grow(h, &mut pp, by);
    }
    // and the drawn face's braincase larger on top of that (`Style::skull`), over the whole height of the crown
    if let Some(by) = p.dress.set().filter(|_| drawn).map(|d| d.style_skull_of(p.female, p.age)).filter(|by| by.iter().any(|k| *k != 1.0)) {
        skull_grow_over(h, &mut pp, by, STYLE_REACH);
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

/// The field in which the mouth is moved down (`mouth_set`), on the base head (1 unit = 10 cm). By height: in
/// full between the first two (the lips' red lies between 6.489 and 6.719 on the base head, the peaks of the
/// upper lip's bow higher than its middle: real/skin_lip.txt; tests/faces.rs holds that all of it moves in full),
/// nothing at the nose's foot (subnasale) and above it and nothing at the chin's lowest point (menton) and below
/// it. Sideways: in full to this far from the middle line and nothing from that far (the mouth's corners lie at
/// 0.24, the cheek turns back from 0.5). In depth: nothing behind the first and all in front of the second (the
/// nape lies at the mouth's height too).
pub const MOUTH_FIELD: ([f32; 2], [f32; 2], [f32; 2]) = ([6.725, 6.485], [0.28, 0.55], [0.6, 0.9]);

/// How much of the mouth's way down (`mouth_set`) a vertex of the base head goes: `MOUTH_FIELD`.
pub fn mouth_field(h: &Head, v: usize) -> f32 {
    use crate::measure::{MENTON, SUBNASALE};
    let (b, (lips, side, depth)) = (&h.base, MOUTH_FIELD);
    let (q, nose, chin) = (b[v], b[SUBNASALE][1], b[MENTON][1]);
    if q[1] >= nose || q[1] <= chin {
        return 0.0;
    }
    let wy = if q[1] > lips[0] { 1.0 - sm(lips[0], nose, q[1]) } else if q[1] < lips[1] { sm(chin, lips[1], q[1]) } else { 1.0 };
    wy * (1.0 - sm(side[0], side[1], q[0].abs())) * sm(depth[0], depth[1], q[2])
}

/// The field in which a cheek is filled out (`cheek_fill`), on MakeHuman's base head, in mm from the chin's lowest
/// point: heights (nothing from the first up, all at the second, nothing from the third down) and depths (nothing
/// behind the first, all between the second and the third, nothing in front of the fourth). In height from under
/// the cheekbones' landmarks (the lowest lies 90 mm up) to over the chin, most a little over the mouth's line
/// (which lies 45 mm up). In depth from in front of the jaw's corners (their landmarks lie 44 to 69 mm behind
/// the chin's lowest point and stay) to behind the mouth's corners (the lips' red begins 7 mm in front of it
/// and stays). PLACEHOLDER: the extents are by eye on the base head, between landmarks that must not move.
pub const CHEEK_FIELD: ([f32; 3], [f32; 4]) = ([88.0, 52.0, 17.0], [-43.0, -28.0, -6.0, 7.0]);

/// Base normals turned at least this far and fully this far to the side take part in `cheek_fill` (the share of
/// the normal that points away from the head's middle): the side of the face, not its front and not what lies
/// inside the mouth.
const CHEEK_SIDE: [f32; 2] = [0.2, 0.5];

/// How much of `cheek_fill`'s way the vertex `v` of the base head goes, whose normal on the base is `n`.
pub fn cheek_field_at(h: &Head, v: usize, n: V3) -> f32 {
    let (b, m, (ys, zs)) = (h.base[v], h.base[crate::measure::MENTON], CHEEK_FIELD);
    let (y, z) = ((b[1] - m[1]) * 100.0, (b[2] - m[2]) * 100.0);
    if y >= ys[0] || y <= ys[2] || z <= zs[0] || z >= zs[3] {
        return 0.0;
    }
    let wy = if y > ys[1] { 1.0 - sm(ys[1], ys[0], y) } else { sm(ys[2], ys[1], y) };
    wy * sm(zs[0], zs[1], z) * (1.0 - sm(zs[2], zs[3], z)) * sm(CHEEK_SIDE[0], CHEEK_SIDE[1], n[0] * b[0].signum())
}

/// The same for every vertex of the base head, with the skin's normals on the base (0 for what is not skin).
pub fn cheek_field(h: &Head) -> Vec<(f32, V3)> {
    let n = vnormals(&h.base, h.body_full());
    (0..h.base.len()).map(|v| (if len(n[v]) > 0.0 { cheek_field_at(h, v, n[v]) } else { 0.0 }, n[v])).collect()
}

/// Fills out the cheeks of a morphed head: the skin between the cheekbone and the jaw moves out along the base
/// head's normal, by `mm` where `CHEEK_FIELD` is whole. A shape of our own, since none of MakeHuman's targets
/// fills a cheek there without widening the cheekbones or the jaw's corners or laying a pad on the cheek at the
/// nose's height (docs/PORTRAITS.md, rounds 96 and 97). The landmarks of the cheekbones, the jaw's corners, the
/// mouth and the chin stay where they are.
pub(crate) fn cheek_fill(h: &Head, pp: &mut [V3], mm: f32) {
    for (q, (w, n)) in pp.iter_mut().zip(cheek_field(h)) {
        if w > 0.0 {
            for c in 0..3 {
                q[c] += n[c] * w * mm / 100.0;
            }
        }
    }
}

/// Moves the mouth of a morphed head down so that the line where the lips meet lies `share` of the way from the
/// nose's foot to the chin's lowest point (`measure::lower_face`, on a bust leaning back by `lean`), if it lies
/// higher; a mouth that lies lower stays. The lips move as they are, with their corners and what lies in the
/// mouth; the skin between nose and upper lip is drawn out and the chin's pressed together by as much
/// (`MOUTH_FIELD`); nose and chin stay where they are. MakeHuman's own `mouth-trans-down` moves the nose's foot
/// down by more than half of the lips' way and presses the 9 mm under the lower lip alone.
pub(crate) fn mouth_set(h: &Head, pp: &mut [V3], share: f32, lean: f32) {
    let m = crate::measure::lower_face(pp, lean);
    let down = (share * m[2] - m[0]) / 100.0 / lean.cos();
    if down <= 0.0 {
        return;
    }
    for (v, q) in pp.iter_mut().enumerate().take(h.base.len()) {
        q[1] -= down * mouth_field(h, v);
    }
}

/// How far from the lips' edges the lips still move when they are laid on each other (`lips_meet`), in mm on
/// MakeHuman's base head: all at the edge, nothing from here on. The red of a grown lip is 7 to 9 mm high in the
/// middle of the base head's mouth, so its upper and lower border stay where they are. PLACEHOLDER: by eye,
/// between the edge and the border.
pub const SEAM_REACH: f32 = 6.0;

/// How far a point lies from a line of points (the nearest place on its pieces).
fn from_line(q: V3, line: &[V3]) -> f32 {
    line.windows(2)
        .map(|w| {
            let (d, r) = (sub(w[1], w[0]), sub(q, w[0]));
            let t = (dot(r, d) / dot(d, d).max(1e-12)).clamp(0.0, 1.0);
            len(sub(r, [d[0] * t, d[1] * t, d[2] * t]))
        })
        .fold(f32::MAX, f32::min)
}

/// The height of a line of points, each with its share of a way, at the share `along` of that way (the shares
/// rise; before the first and after the last point their heights).
fn height_at(line: &[(f32, f32)], along: f32) -> f32 {
    line.windows(2)
        .find(|w| along <= w[1].0)
        .map_or(line[line.len() - 1].1, |w| w[0].1 + (w[1].1 - w[0].1) * ((along - w[0].0) / (w[1].0 - w[0].0).max(1e-9)).clamp(0.0, 1.0))
}

/// The two edges of the lips on one side of a head (`LIP_SEAM`: the upper lip's and the lower lip's), each
/// point with its share of the way from the middle of the mouth to its corner, read sideways on the base head
/// (so that every head has the same shares), and its height on the head `pp`.
fn seam_heights(h: &Head, pp: &[V3], side: usize) -> [Vec<(f32, f32)>; 2] {
    let of = |e: &[usize]| -> Vec<(f32, f32)> { e.iter().map(|&i| (h.base[i][0] / h.base[e[e.len() - 1]][0], pp[i][1])).collect() };
    [of(&LIP_SEAM[side].0), of(&LIP_SEAM[side].1)]
}

/// How far the lips' edges of the head `pp` stand apart along the seam, in mm (the upper lip's over the lower
/// lip's: above 0 a slit, below 0 the lips lie in each other): at each point of the upper lip's edge and then
/// at each of the lower lip's, from the middle of the mouth out to the corner (between the points the edges
/// run straight, so the widest place is among these), on the side at positive x and on the other.
pub fn seam_gaps(h: &Head, pp: &[V3]) -> [Vec<f32>; 2] {
    std::array::from_fn(|side| {
        let [up, lo] = seam_heights(h, pp, side);
        up.iter().map(|&(along, y)| y - height_at(&lo, along)).chain(lo.iter().map(|&(along, y)| height_at(&up, along) - y)).map(|g| g * 100.0).collect()
    })
}

/// For every vertex of the base head: which lip it moves with when the lips are laid on each other and how
/// much of their way it goes (above 0 with the upper lip, down; below 0 with the lower lip, up; 1 at the lip's
/// edge, 0 from `SEAM_REACH` away from it), and where along the seam it lies (0 the middle of the mouth, 1 its
/// corner and beyond). What lies over the middle between the two edges goes with the upper lip.
pub fn seam_field(h: &Head) -> Vec<(f32, f32)> {
    let lines: Vec<[Vec<V3>; 2]> = LIP_SEAM.iter().map(|side| [side.0.iter().map(|&i| h.base[i]).collect(), side.1.iter().map(|&i| h.base[i]).collect()]).collect();
    let heights: Vec<[Vec<(f32, f32)>; 2]> = (0..2).map(|side| seam_heights(h, &h.base, side)).collect();
    h.base
        .iter()
        .map(|&b| {
            let side = if b[0] >= 0.0 { 0 } else { 1 };
            let [up, lo] = &lines[side];
            let along = (b[0] / up[up.len() - 1][0]).clamp(0.0, 1.0);
            let upper = b[1] > (height_at(&heights[side][0], along) + height_at(&heights[side][1], along)) / 2.0;
            let far = from_line(b, if upper { up } else { lo }) * 100.0;
            ((if upper { 1.0 } else { -1.0 }) * (1.0 - sm(0.0, SEAM_REACH, far)), along)
        })
        .collect()
}

/// Lays the lips of a morphed head on each other along the whole seam: at each place between the middle of
/// the mouth and its corner the upper lip's edge comes down and the lower lip's comes up by half of what they
/// stand apart there (times `share`), and each lip follows its edge by `seam_field`. MakeHuman's closed mouth
/// is a slit of 0.7 to 1 mm from corner to corner, and the targets of a face open it further beside the middle
/// (to 1.9 mm on a grown woman of England), where the closing of the middle (`lip_gap`) does not reach: the
/// strip that closes the slit (real_look.rs) lay in the light as a pale line from corner to corner. Only
/// heights change: the corners keep their distance, and the middle between the lips its height. Every point
/// of either edge then lies on the middle between the two; the edges have their points at different places
/// (11 and 8), so between them up to 0.4 mm are left where one edge bends and the other runs straight.
pub(crate) fn lips_meet(h: &Head, pp: &mut [V3], share: f32) {
    let heights: Vec<[Vec<(f32, f32)>; 2]> = (0..2).map(|side| seam_heights(h, pp, side)).collect();
    for (v, (w, along)) in seam_field(h).into_iter().enumerate().take(pp.len()) {
        if w != 0.0 {
            let [up, lo] = &heights[if h.base[v][0] >= 0.0 { 0 } else { 1 }];
            pp[v][1] -= w * share * (height_at(up, along) - height_at(lo, along)) / 2.0;
        }
    }
}

/// The field in which an eye is brought forward (`eyes_out`), in halves of the opening's length: how far it
/// reaches sideways and up and down from the opening's middle, and the share of that way on which all moves in
/// full. With an opening of 29 mm: in full to 2 mm over the upper lid's edge and under the lower lid's, nothing
/// from 8 mm over and under them and from 5 mm beside the corners (where the bone's rim lies), half at the corners.
pub(crate) const EYE_FIELD: [f32; 3] = [1.33, 0.84, 0.5];

/// Which of the head's vertices are the eyeball `k`'s (the eye at positive x for 0).
fn ball_of(h: &Head, k: usize) -> Vec<bool> {
    let mut ball = vec![false; h.n];
    for &v in &h.parts[["leye", "reye"][k]][0] {
        ball[v as usize] = true;
    }
    ball
}

/// Brings the eyes forward by `by` (head units), each with its lids and the skin on it: the ball as it is, the
/// skin in full where it lies on the ball and less and less towards the rim of the socket (`EYE_FIELD`), where it
/// stays. MakeHuman's targets move an eye up, down, in and out, none forward.
pub(crate) fn eyes_out(h: &Head, pp: &mut [V3], by: f32) {
    for k in 0..2 {
        let (ball, (c, r)) = (ball_of(h, k), crate::measure::ball(h, pp, k));
        let (inner, outer) = (pp[EYE_CORNERS[k][0]], pp[EYE_CORNERS[k][1]]);
        let (upper, lower) = (pp[crate::measure::LIDS[k].0], pp[crate::measure::LIDS[k].1]);
        let (mx, my, half) = ((inner[0] + outer[0]) / 2.0, (upper[1] + lower[1]) / 2.0, (outer[0] - inner[0]).abs() / 2.0);
        for (v, q) in pp.iter_mut().enumerate() {
            if ball[v] {
                q[2] += by;
                continue;
            }
            let rho = ((q[0] - mx) / (EYE_FIELD[0] * half)).hypot((q[1] - my) / (EYE_FIELD[1] * half));
            // (the head's back lies behind the same ellipse: only what stands before the ball's middle)
            if rho < 1.0 && q[2] > c[2] - r {
                q[2] += by * (1.0 - sm(EYE_FIELD[2], 1.0, rho)) * sm(c[2] - r, c[2], q[2]);
            }
        }
    }
}

/// How far at most a ball is moved up or down in its socket to set the pupil between the lids (`pupils_set`; head
/// units).
pub(crate) const PUPIL_MOST: f32 = 0.04;

/// Moves each eyeball up or down in its socket so that the pupil, looking `pitch` up from straight ahead (by the
/// side of the eye, 1 for the one at positive x), stands at `share` of the way from the lower lid's edge to the
/// upper lid's. The lids stay: MakeHuman has no target that moves both the same way.
pub(crate) fn pupils_set(h: &Head, pp: &mut [V3], share: f32, pitch: impl Fn(f32) -> f32) {
    for k in 0..2 {
        let (ball, (c, r)) = (ball_of(h, k), crate::measure::ball(h, pp, k));
        let (upper, lower) = (pp[crate::measure::LIDS[k].0][1], pp[crate::measure::LIDS[k].1][1]);
        let pupil = c[1] + r * pitch(if k == 0 { 1.0 } else { -1.0 }).sin();
        let up = (lower + share * (upper - lower) - pupil).clamp(-PUPIL_MOST, PUPIL_MOST);
        for (v, q) in pp.iter_mut().enumerate() {
            if ball[v] {
                q[1] += up;
            }
        }
    }
}

/// The lowest point of the upper lip and the highest of the lower lip in the middle of the mouth (vertices of
/// MakeHuman's base head; lib.rs tests that they are those).
pub(crate) const LIP_UPPER: usize = 474;
pub(crate) const LIP_LOWER: usize = 493;
/// The two edges where the lips turn inward, from the middle of the mouth outward to its corner, on either side:
/// the upper lip's and the lower lip's (vertices of MakeHuman's base head; lib.rs tests that they lie on the lips
/// and run outward). Between them the closed mouth is a slit (real_look.rs `real_skin` closes it).
pub const LIP_SEAM: [([usize; 11], [usize; 8]); 2] = [
    ([474, 3335, 3334, 3333, 3332, 5203, 3331, 3285, 3284, 3296, 3293], [493, 3348, 3342, 3336, 3303, 3310, 3298, 3356]),
    ([474, 473, 472, 471, 470, 2453, 469, 419, 418, 430, 427], [493, 487, 481, 475, 437, 444, 432, 501]),
];
/// The corners of the eye's opening, inner and outer, of the eye at positive x and of the other (vertices of
/// MakeHuman's base head; lib.rs tests that they lie at the ends of the opening).
pub(crate) const EYE_CORNERS: [[usize; 2]; 2] = [[2958, 2911], [68, 21]];

/// Along each eye, as distances from the middle of the face: a sixth of the opening outward of its inner corner
/// (where MakeHuman's brow begins), the pupil, and the outer corner. The eye at positive x first.
pub(crate) fn eye_spans(h: &Head, pp: &[V3]) -> [[f32; 3]; 2] {
    std::array::from_fn(|k| {
        let ball = &h.parts[["leye", "reye"][k]][0];
        let pupil = ball.iter().map(|&v| pp[v as usize][0]).sum::<f32>() / ball.len().max(1) as f32;
        let (inner, outer) = (pp[EYE_CORNERS[k][0]][0].abs(), pp[EYE_CORNERS[k][1]][0].abs());
        [inner + (outer - inner) / 6.0, pupil.abs(), outer]
    })
}

/// The most a mouth is closed or opened by (the weight on the targets' shares; MakeHuman's targets are made
/// for 0 to 1).
const MOUTH_MOST: f32 = 2.5;

/// How far the lips of a head stand apart in the middle of the mouth, measured against MakeHuman's base head,
/// whose mouth is closed: above 0 the mouth stands open, below 0 the lips lie in each other.
pub(crate) fn lip_gap(h: &Head, pp: &[V3]) -> f32 {
    (pp[LIP_UPPER][1] - pp[LIP_LOWER][1]) - (h.base[LIP_UPPER][1] - h.base[LIP_LOWER][1])
}

/// Area-weighted vertex normals over the triangles `idx`.
pub(crate) fn vnormals(p: &[V3], idx: &[u32]) -> Vec<V3> {
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
