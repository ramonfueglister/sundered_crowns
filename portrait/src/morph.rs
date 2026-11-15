//! The head of a person: MakeHuman's base head moved by its morph targets, as the genes, age, sex, food and mood
//! of the person weigh them.

use crate::geo::*;
use crate::head::{Head, DELTA_SCALE};
use crate::look::*;
use crate::settings;

/// The morphed head and shoulders, for measuring faces (examples/face_measure.rs).
pub fn morph_test(h: &Head, p: &Look) -> Vec<V3> {
    morph(h, p).0
}

pub(crate) fn morph(h: &Head, p: &Look) -> (Vec<V3>, usize) {
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
            // a dress with a table may read women's jaws softer on average (genes headF and jaw)
            let xl = match p.dress.set() {
                Some(d) if p.female && (k == 2 || k == 4) => xl + d.jaw_women,
                _ => xl,
            };
            let x = xl * (0.35 + 0.65 * gr) * gain;
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
                add(&format!("eyes/{sd}-eye-{t}"), crate::dress::by_sex(d.lids[0][k], d.lids[1][k], p.female, p.grown()));
            }
        }
        let child = 0.35 + 0.65 * p.grown();
        for &(n, women, men) in d.rest {
            add(n, crate::dress::by_sex(women, men, p.female, p.grown()) * child);
        }
        for &(n, girls, boys) in d.child {
            add(n, (if p.female { girls } else { boys }) * (1.0 - p.grown()));
        }
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

/// The lowest point of the upper lip and the highest of the lower lip in the middle of the mouth (vertices of
/// MakeHuman's base head; lib.rs tests that they are those).
pub(crate) const LIP_UPPER: usize = 474;
pub(crate) const LIP_LOWER: usize = 493;
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
