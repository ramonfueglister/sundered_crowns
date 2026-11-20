//! The hair of England's heads as the builder puts it on them (the real look: a file of its own, see
//! tests/common): a body of thick bundles, modelled in Blender (round 109, tools/portrait/pipeline/hair_body.py).
//! From round 87 to 108 it was locks, before that cards.

mod common;

use common::{head, person};
use sc_portrait::{build, Portrait, Surface};
use std::collections::HashMap;

type V3 = [f32; 3];

fn sub(a: V3, b: V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn cross(a: V3, b: V3) -> V3 {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
fn dot(a: V3, b: V3) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn len(a: V3) -> f32 {
    dot(a, a).sqrt()
}

/// The image all bundles of England's hair are drawn with (`DressSet::body_image`).
const IMAGE: &str = "/hair1356_body.";
/// The image's height to a unit of a bundle's length (`hair_body.py` `VSCALE`).
const VSCALE: f32 = 0.75;

/// The shell under the bundles is a grid of 5 degrees round the head, 45 degrees to the image's breadth
/// (`hair_body.py` `shell`): a step across it takes a ninth of the image.
fn shell_step(share: f32) -> bool {
    (share - 1.0 / 9.0).abs() < 1e-3
}
/// How far above the fringe's lowest end its depth is read, in the head's height: above the frayed ends.
const FRINGE_FROM: f32 = 0.07;

fn body(out: &Portrait) -> Option<&Surface> {
    out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(IMAGE)))
}

/// The skin of the head, and its highest point.
fn skin(out: &Portrait) -> (&Surface, f32) {
    let skin = out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains("/skin_"))).max_by_key(|s| s.pos.len()).expect("skin");
    (skin, skin.pos.iter().map(|p| p[1]).fold(f32::MIN, f32::max))
}

/// The pieces of a surface, its triangles gathered by the corners they share (a bundle is one piece, the shell
/// under the bundles another): for each how many triangles it has and how long it is as it was laid, read from
/// the image (units of 10 cm).
fn pieces(s: &Surface) -> Vec<(usize, f32)> {
    fn root(of: &mut [usize], mut i: usize) -> usize {
        while of[i] != i {
            of[i] = of[of[i]];
            i = of[i];
        }
        i
    }
    let mut place: HashMap<[u32; 3], usize> = HashMap::new();
    let ids: Vec<usize> = s.pos.iter().map(|p| { let n = place.len(); *place.entry(p.map(f32::to_bits)).or_insert(n) }).collect();
    let mut of: Vec<usize> = (0..place.len()).collect();
    for t in ids.chunks_exact(3) {
        let a = root(&mut of, t[0]);
        for &k in &t[1..] {
            let b = root(&mut of, k);
            of[b] = a;
        }
    }
    let mut found: HashMap<usize, (usize, f32, f32)> = HashMap::new();
    for (t, u) in ids.chunks_exact(3).zip(s.uv.chunks_exact(3)) {
        let e = found.entry(root(&mut of, t[0])).or_insert((0, f32::MAX, f32::MIN));
        e.0 += 1;
        for u in u {
            e.1 = e.1.min(u[1]);
            e.2 = e.2.max(u[1]);
        }
    }
    found.values().map(|&(n, lo, hi)| (n, (hi - lo) / VSCALE)).collect()
}

/// How much the bundles of a hair turn along their way (round 130): for each bundle (a piece, as above) the line
/// through the middles of its cross-sections (the corners that share a place along the image), and on it the
/// sum of the angles between one step and the next, by the line's length (radians per 10 cm). The middle one
/// of all bundles with eight cross-sections and more. Straight hair turns as the head under it is round.
fn turning(s: &Surface) -> f32 {
    fn root(of: &mut [usize], mut i: usize) -> usize {
        while of[i] != i {
            of[i] = of[of[i]];
            i = of[i];
        }
        i
    }
    let mut place: HashMap<[u32; 3], usize> = HashMap::new();
    let ids: Vec<usize> = s.pos.iter().map(|p| { let n = place.len(); *place.entry(p.map(f32::to_bits)).or_insert(n) }).collect();
    let mut of: Vec<usize> = (0..place.len()).collect();
    for t in ids.chunks_exact(3) {
        let a = root(&mut of, t[0]);
        for &k in &t[1..] {
            let b = root(&mut of, k);
            of[b] = a;
        }
    }
    // (per piece and place along the image: the corners there, each once)
    let mut rows: HashMap<usize, std::collections::BTreeMap<i32, HashMap<usize, V3>>> = HashMap::new();
    for (k, &id) in ids.iter().enumerate() {
        rows.entry(root(&mut of, id)).or_default().entry((s.uv[k][1] * 2000.0).round() as i32).or_default().insert(id, s.pos[k]);
    }
    let mut turns: Vec<f32> = Vec::new();
    for piece in rows.values() {
        // (a ring of the bundle itself: five corners and more; a wisp of a frayed end, round 138, has four at most)
        let piece: Vec<_> = piece.values().filter(|row| row.len() >= 5).collect();
        if piece.len() < 8 {
            continue;
        }
        let line: Vec<V3> = piece.iter().map(|row| { let n = row.len() as f32; row.values().fold([0.0; 3], |a, p| [a[0] + p[0] / n, a[1] + p[1] / n, a[2] + p[2] / n]) }).collect();
        // (its middle half: a bundle begins across the parting in a sharp bow and ends in a slanted point)
        let line = &line[line.len() / 4..line.len() - line.len() / 4];
        let step: Vec<V3> = line.windows(2).map(|w| [w[1][0] - w[0][0], w[1][1] - w[0][1], w[1][2] - w[0][2]]).collect();
        let len = |v: &V3| (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
        let long: f32 = step.iter().map(len).sum();
        let turned: f32 = step.windows(2).map(|w| ((w[0][0] * w[1][0] + w[0][1] * w[1][1] + w[0][2] * w[1][2]) / (len(&w[0]) * len(&w[1])).max(1e-9)).clamp(-1.0, 1.0).acos()).sum();
        if long > 0.3 {
            turns.push(turned / long);
        }
    }
    turns.sort_by(|a, b| a.partial_cmp(b).expect("a number"));
    turns.get(turns.len() / 2).copied().unwrap_or(0.0)
}

/// The points the bundles of a hair end in (round 138): for each bundle (a piece, as above) how many places it
/// has where a triangle has two corners at one place (a band that narrows to nothing ends in one; a band that
/// ends at a breadth has none), and how far apart along the bundle the first and the last of them lie (read from
/// the image, units of 10 cm).
fn points(s: &Surface) -> Vec<(usize, f32)> {
    fn root(of: &mut [usize], mut i: usize) -> usize {
        while of[i] != i {
            of[i] = of[of[i]];
            i = of[i];
        }
        i
    }
    let mut place: HashMap<[u32; 3], usize> = HashMap::new();
    let ids: Vec<usize> = s.pos.iter().map(|p| { let n = place.len(); *place.entry(p.map(f32::to_bits)).or_insert(n) }).collect();
    let mut of: Vec<usize> = (0..place.len()).collect();
    for t in ids.chunks_exact(3) {
        let a = root(&mut of, t[0]);
        for &k in &t[1..] {
            let b = root(&mut of, k);
            of[b] = a;
        }
    }
    let mut found: HashMap<usize, HashMap<usize, f32>> = HashMap::new();
    for (t, u) in ids.chunks_exact(3).zip(s.uv.chunks_exact(3)) {
        let piece = found.entry(root(&mut of, t[0])).or_default();
        for (a, b) in [(0, 1), (1, 2), (2, 0)] {
            if t[a] == t[b] {
                piece.insert(t[a], u[a][1]);
            }
        }
    }
    found.values().map(|at| (at.len(), at.values().fold((f32::MAX, f32::MIN), |r, v| (r.0.min(*v), r.1.max(*v))))).map(|(n, r)| (n, if n > 0 { (r.1 - r.0) / VSCALE } else { 0.0 })).collect()
}

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

#[test]
fn a_head_of_england_wears_a_body_of_thick_bundles() {
    // Until round 87 the hair of a head was cards (520 flat strips, a cap of paper), until round 108 locks (some
    // 950 narrow arched bands, each begun where its strands were rooted: scales all over the head and a fringe
    // of stepped bands, a thatch beside the reference's hair). Now a cut is modelled: a hundred and more thick
    // bundles in layers, each an arched band that runs from under the bundles above it to the line of the cut,
    // over a shell, each of a tone of its own and darker in the furrows between them.
    let Some(h) = head() else { return };
    // loose hair in three lengths, under a hood, a horseshoe round a bare top, gone back at the temples; small
    // children of either sex; girls
    for (k, female, age) in [(1u32, false, 8.0f32), (3, false, 13.0), (45, false, 13.0), (5, false, 17.0), (21, false, 24.0), (25, false, 50.0), (27, false, 68.0), (28, true, 2.0), (31, false, 5.0), (0, true, 8.0), (4, true, 17.0)] {
        let out = build(&h, &person(k, female, age), 1);
        let who = format!("person {k} of {age}");
        let hair = body(&out).unwrap_or_else(|| panic!("{who}: a body of hair"));
        let named = |part: &str| out.surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains(part)));
        let cards = out.surfaces.iter().filter_map(|s| s.tex.as_deref()).find(|t| (t.contains("/bob0") || t.contains("/plait01")) && !t.contains("_cap.") && !t.contains("_rope."));
        assert_eq!(cards, None, "{who}: no cards beside the body");
        assert!(!named("/hair1356_locks."), "{who}: no locks beside the body");
        assert!(named("_cap."), "{who}: the painted layer under the hair");
        // a band is not a closed surface: it is seen from both sides
        assert!(hair.mat.double, "{who}: a bundle is seen from both sides");
        assert_eq!((hair.uv.len(), hair.nrm.len(), hair.col.len()), (hair.pos.len(), hair.pos.len(), hair.pos.len()), "{who}: every corner has its place in the image, its direction and its colour");
        let n = hair.pos.len() / 3;
        // few and long: the bundles (the shell aside, the piece of most triangles on a cut that has one)
        let mut found = pieces(hair);
        found.sort_by(|a, b| a.1.partial_cmp(&b.1).expect("a number"));
        let long = found[found.len() / 2].1;
        // how broad a bundle is: the side of a triangle that lies across it (its two corners at one height of the
        // image) by the share of the image's breadth it takes (until round 138 always a sixth; a bundle with a
        // frayed end has its corners where its wisps part)
        let mut across: Vec<f32> = Vec::new();
        for (t, u) in hair.pos.chunks_exact(3).zip(hair.uv.chunks_exact(3)) {
            for (a, b) in [(0, 1), (1, 2), (2, 0)] {
                let share = (u[a][0] - u[b][0]).abs();
                if (u[a][1] - u[b][1]).abs() < 1e-5 && share > 0.02 && !shell_step(share) {
                    across.push(len(sub(t[a], t[b])) / share);
                }
            }
        }
        // (where it is broad: the upper quarter of these; a bundle is narrow where it begins and where it ends)
        across.sort_by(|a, b| a.partial_cmp(b).expect("a number"));
        let broad = across[across.len() * 3 / 4];
        // the upper side of a bundle faces away from the head, and its corners' directions are its own surface's
        let (_, crown) = skin(&out);
        let centre = [out.cx, crown - 0.45 * (crown - out.chin), out.cz];
        let (mut area, mut outward, mut own) = (0f32, 0f32, 0f32);
        for (t, c) in hair.pos.chunks_exact(3).zip(hair.nrm.chunks_exact(3)) {
            let face = cross(sub(t[1], t[0]), sub(t[2], t[0]));
            let mid = [0, 1, 2].map(|a| (t[0][a] + t[1][a] + t[2][a]) / 3.0);
            area += len(face);
            if dot(face, sub(mid, centre)) > 0.0 {
                outward += len(face);
            }
            for d in c {
                assert!((len(*d) - 1.0).abs() < 1e-3 || len(*d) == 0.0, "{who}: a direction of length {}", len(*d));
                own += len(face) / 3.0 * (1.0 - dot(*d, sub(mid, centre)) / len(sub(mid, centre)).max(1e-9));
            }
        }
        // each bundle of a tone, and dark where it lies under others: how light the corners are, the darkest
        // tenth against the lightest
        let mut light: Vec<f32> = hair.col.iter().map(|c| 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]).collect();
        light.sort_by(|a, b| a.partial_cmp(b).expect("a number"));
        let shade = light[light.len() / 10] / light[light.len() * 9 / 10].max(1e-9);
        if show() {
            println!("{who}: {n} triangles in {} pieces, the median piece {long:.2} long and a bundle {broad:.3} broad where it is broad; {:.3} of the surface faces away from the head, lit by its own form {:.3}; the darkest tenth {shade:.2} of the lightest", found.len(), outward / area, own / area);
        }
        assert!((12_000..80_000).contains(&n), "{who}: {n} triangles");
        assert!((40..260).contains(&found.len()), "{who}: {} pieces (the locks were some 950)", found.len());
        assert!(long > 0.5, "{who}: the median bundle is {long} long (1 is 10 cm)");
        // (round 141: a bowl cut's upper layers are broad locks, and the measure reads them with the bundles: 2.4 to
        // 2.8 cm where it was 1.7 to 2.2, 3.5 on the horseshoe round a bare top where it was 3.1)
        assert!((0.1..0.42).contains(&broad), "{who}: a bundle is {broad} broad where it is broad (1 is 10 cm)");
        assert!(outward / area > 0.85, "{who}: {} of the bundles' surface faces away from the head", outward / area);
        assert!(own / area > 0.02, "{who}: the bundles are lit as cards were ({})", own / area);
        assert!(shade < 0.85, "{who}: the hair is of one tone (the darkest tenth {shade} of the lightest)");
    }
}

#[test]
fn a_body_of_hair_lies_on_a_head_of_any_size() {
    // A bundle is bound to the head ring by ring and goes with it; its way with the head is evened out along it a
    // few times only (the file's own count), as a lock's was: evened out to the end, a piece moves stiffly, and
    // on a child's head, smaller than the base's, the hair stood over the crown as a hat with the fringe over
    // the eyes.
    let Some(h) = head() else { return };
    for (k, female, age) in [(28u32, true, 2.0f32), (29, false, 2.0), (30, true, 5.0), (31, false, 5.0), (1, false, 8.0), (3, false, 13.0), (45, false, 13.0), (21, false, 24.0), (27, false, 68.0)] {
        let out = build(&h, &person(k, female, age), 1);
        let who = format!("person {k} of {age}");
        let hair = body(&out).unwrap_or_else(|| panic!("{who}: a body of hair"));
        let (skin, crown) = skin(&out);
        let top = hair.pos.iter().map(|p| p[1]).fold(f32::MIN, f32::max);
        // the fringe: the lowest corner of the bundles in front of the face's middle fifth
        let upper = crown - 0.3 * (crown - out.chin);
        let broad = skin.pos.iter().filter(|p| p[1] > upper).map(|p| (p[0] - out.cx).abs()).fold(0f32, f32::max);
        let fringe = hair.pos.iter().filter(|p| (p[0] - out.cx).abs() < 0.25 * broad && p[2] > out.cz).map(|p| p[1]).fold(f32::MAX, f32::min);
        // where it ends on the face: over the eyes' middle by a share of the way from the eyes down to the chin
        let balls = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("eyeball"))).unwrap_or_else(|| panic!("{who}: eyes"));
        let eyes = balls.pos.iter().map(|p| p[1]).sum::<f32>() / balls.pos.len() as f32;
        let ends = (fringe - eyes) / (eyes - out.chin);
        if show() {
            println!("{who}: the hair's top {:.3} over the crown, the fringe ends {ends:.3} of the way from eyes to chin over the eyes ({:.0} mm)", top - crown, (fringe - eyes) * 100.0);
        }
        // a body that stands: 1.3 to 2.3 cm over the crown (the locks 0.7 to 1.8; under a hood less, see below)
        assert!((0.10..0.26).contains(&(top - crown)), "{who}: the hair's top lies {} over the crown (1 is 10 cm)", top - crown);
        // a small child wears a cut of its own (round 105, `DressSet::hair_small`), its fringe in the upper half
        // of the forehead; the grown's ends two fingers over the eyes
        let bounds = if age < 7.0 { 0.40..0.70 } else { 0.12..0.34 };
        assert!(bounds.contains(&ends), "{who}: the fringe ends {ends} of the way from eyes to chin over the eyes ({} mm)", (fringe - eyes) * 100.0);
    }
    // under a hood the hair lies flat: the hood's own form stays the head's outline
    for (k, age) in [(5u32, 17.0f32), (7, 24.0), (9, 35.0)] {
        let out = build(&h, &person(k, false, age), 1);
        let who = format!("person {k} of {age}");
        if !out.surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains("/bob02_cap."))) {
            continue;
        }
        let hair = body(&out).unwrap_or_else(|| panic!("{who}: a body of hair"));
        let (_, crown) = skin(&out);
        let top = hair.pos.iter().map(|p| p[1]).fold(f32::MIN, f32::max);
        if show() {
            println!("{who}: under a hood, the hair's top {:.3} over the crown", top - crown);
        }
        assert!(top - crown < 0.07, "{who}: hair under a hood stands {} over the crown (1 is 10 cm)", top - crown);
    }
}

#[test]
fn a_girl_wears_her_hair_parted_and_drawn_to_her_plaits() {
    // A girl's and a young woman's hair is parted in the middle and drawn to one place below each ear, where
    // her plait begins (`hair_body.py`, the parted cut): bundles that begin side by side along the parting,
    // others along the hairline, all running together below the ear.
    let Some(h) = head() else { return };
    for (k, age) in [(0u32, 8.0f32), (2, 13.0), (4, 17.0), (14, 8.0), (16, 13.0), (18, 17.0), (6, 19.0)] {
        let out = build(&h, &person(k, true, age), 1);
        let who = format!("girl {k} of {age}");
        let hair = body(&out).unwrap_or_else(|| panic!("{who}: a body of hair"));
        assert!(hair.mat.double, "{who}: a bundle is seen from both sides");
        let named = |part: &str| out.surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains(part)));
        assert!(named("/plait01_cap.") && named("/plait01_rope."), "{who}: the painted layer and the plaits");
        assert!(!named("/plait01."), "{who}: no cards beside the body");
        let (skin, crown) = skin(&out);
        let height = crown - out.chin;
        // sleek: the hair lies closer to the skull than a man's cut
        let top = hair.pos.iter().map(|p| p[1]).fold(f32::MIN, f32::max);
        // parted: no fringe, the forehead is free
        let upper = crown - 0.3 * height;
        let broad = skin.pos.iter().filter(|p| p[1] > upper).map(|p| (p[0] - out.cx).abs()).fold(0f32, f32::max);
        let front = hair.pos.iter().filter(|p| (p[0] - out.cx).abs() < 0.25 * broad && p[2] > out.cz).map(|p| p[1]).fold(f32::MAX, f32::min);
        // the bundles of either side begin across the parting, under those of the other side: triangles on top
        // of the head that lie across its middle
        let on_top = |p: &V3| p[1] > crown - 0.12 * height;
        let across = hair.pos.chunks_exact(3).filter(|t| t.iter().all(on_top) && t.iter().any(|p| p[0] > out.cx) && t.iter().any(|p| p[0] < out.cx)).count();
        // drawn to the plait below the ear, on the neck
        let low = hair.pos.iter().map(|p| p[1]).fold(f32::MAX, f32::min);
        let off = hair.pos.iter().filter(|p| p[1] < crown - 0.62 * height).step_by(3).map(|p| skin.pos.iter().map(|q| len(sub(*p, *q))).fold(f32::MAX, f32::min)).fold(0f32, f32::max);
        if show() {
            println!("{who}: the hair's top {:.3} over the crown, hair on the forehead down to {:.3} of the head's height, {across} triangles across the parting, the hair ends {:.3} of the head's height below the crown and stands {off:.3} off the skin below the ear at most", top - crown, (crown - front) / height, (crown - low) / height);
        }
        assert!((0.03..0.12).contains(&(top - crown)), "{who}: the hair's top lies {} over the crown (1 is 10 cm)", top - crown);
        assert!((crown - front) / height < 0.2, "{who}: hair on the forehead down to {} of the head's height", (crown - front) / height);
        assert!(across > 40, "{who}: {across} triangles of a bundle's beginning lie across the parting");
        assert!((0.6..0.84).contains(&((crown - low) / height)), "{who}: the hair ends {} of the head's height below the crown", (crown - low) / height);
        assert!(off < 0.2, "{who}: hair {off} off the skin below the ear");
    }
}

#[test]
fn two_men_in_ten_wear_their_hair_parted_and_cut_at_the_jaw() {
    // Round 125. Until then every man of England wore the one bowl cut, in three lengths. Two in ten now wear
    // their hair parted in the middle, falling over the ears and cut at the jaw (`hair_body.py` `page01`; since
    // round 130 one of the two in waves, `page02`: the same cut, its bundles swinging to the side and off the head,
    // `DressSet::hair_parted`): a girl's parting and hairline (her painted layer is under it), no plaits, the hair
    // standing as high off the head as a bowl cut does and ending level, above the neck.
    let Some(h) = head() else { return };
    let parted = |out: &Portrait| out.surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains("/plait01_cap.")));
    let (mut found, mut with_hair) = (0, 0);
    let mut names = std::collections::BTreeMap::new();
    for k in (1..160u32).step_by(2) {
        // (men of 29: from 30 one man in ten wears a coif, round 132, and has no body of hair under it)
        let out = build(&h, &person(k, false, 29.0), 1);
        let Some(hair) = body(&out) else { continue };
        with_hair += 1;
        if !parted(&out) {
            continue;
        }
        found += 1;
        let who = format!("man {k}");
        // a boy with the same seed wears the bowl cut still
        assert!(!parted(&build(&h, &person(k, false, 10.0), 1)), "{who} as a boy of 10: parted hair");
        assert!(!out.surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains("/plait01_rope."))), "{who}: plaits");
        let (skin, crown) = skin(&out);
        let height = crown - out.chin;
        let top = hair.pos.iter().map(|p| p[1]).fold(f32::MIN, f32::max);
        // no fringe: the forehead is free in the middle
        let broad = skin.pos.iter().filter(|p| p[1] > crown - 0.3 * height).map(|p| (p[0] - out.cx).abs()).fold(0f32, f32::max);
        let front = hair.pos.iter().filter(|p| (p[0] - out.cx).abs() < 0.25 * broad && p[2] > out.cz).map(|p| p[1]).fold(f32::MAX, f32::min);
        let on_top = |p: &V3| p[1] > crown - 0.12 * height;
        let across = hair.pos.chunks_exact(3).filter(|t| t.iter().all(on_top) && t.iter().any(|p| p[0] > out.cx) && t.iter().any(|p| p[0] < out.cx)).count();
        // cut level at the jaw: the lowest tenth of the hair's corners lies within a narrow band of height
        let mut ys: Vec<f32> = hair.pos.iter().map(|p| p[1]).collect();
        ys.sort_by(|a, b| a.partial_cmp(b).expect("a number"));
        let (low, tenth) = (ys[0], ys[ys.len() / 10]);
        // beside the face it stands off the head: the hair's breadth at the height of the mouth against the skin's
        let band = |p: &&V3| (p[1] - (out.chin + 0.3 * height)).abs() < 0.04 * height;
        let (wide_hair, wide_skin) = (hair.pos.iter().filter(band).map(|p| (p[0] - out.cx).abs()).fold(0f32, f32::max), skin.pos.iter().filter(band).map(|p| (p[0] - out.cx).abs()).fold(0f32, f32::max));
        // waved or straight (round 130): how much its bundles turn along their way
        let name = sc_portrait::dress::ENGLAND_1356.hair_of(person(k, false, 29.0).seed, 29.0);
        let turns = turning(hair);
        *names.entry(name).or_insert(0) += 1;
        // (measured on nine men: straight 0.83 to 1.00, waved 1.62 to 2.14)
        assert!(sc_portrait::dress::ENGLAND_1356.hair_parted.contains(&name) && (turns > 1.3) == (name == "page02"), "{who}: {name}, its bundles turn by {turns} radians in 10 cm");
        if show() {
            println!("{who}: {name}, its bundles turn by {turns:.2} radians in 10 cm");
            println!("{who}: top {:.3} over the crown, forehead free down to {:.3}, {across} across the parting, ends {:.3} below the crown (lowest tenth from {:.3}), {:.3} broader than the skin a side at the mouth's height", top - crown, (crown - front) / height, (crown - low) / height, (crown - tenth) / height, wide_hair - wide_skin);
        }
        assert!((0.08..0.3).contains(&(top - crown)), "{who}: the hair's top lies {} over the crown (1 is 10 cm)", top - crown);
        assert!((crown - front) / height < 0.2, "{who}: hair on the forehead down to {} of the head's height", (crown - front) / height);
        assert!(across > 40, "{who}: {across} triangles of a bundle's beginning lie across the parting");
        assert!((0.62..0.9).contains(&((crown - low) / height)), "{who}: the hair ends {} of the head's height below the crown", (crown - low) / height);
        assert!((tenth - low) / height < 0.15, "{who}: the hair's end is ragged over {} of the head's height", (tenth - low) / height);
        assert!((0.05..0.5).contains(&(wide_hair - wide_skin)), "{who}: the hair stands {} off the head beside the mouth", wide_hair - wide_skin);
    }
    if show() {
        println!("{found} of {with_hair} men with hair on the head wear it parted");
    }
    assert!(found >= 4, "{found} of {with_hair} men wear their hair parted");
    // (round 130) one in ten straight, one in ten in waves: both are worn
    assert!(names.len() == 2 && names.values().all(|&n| n >= 2), "{names:?}");
}

#[test]
fn one_man_in_ten_wears_his_hair_to_the_jaw_with_its_ends_turned_out() {
    // Round 133. Of the two men in ten whose bowl cut reaches the jaw, one has its ends turned out and up in rolls
    // at the sides and behind (`hair_body.py` `bob09`, `turn`; `DressSet::hair_dressed`): the cut `bob07` with
    // its hairline (that cut's painted layer is under it), a little longer, so that the rolls lie where the plain
    // cut ends. The head of hair is broadest at its ends, where the plain cut is narrower than above them; the
    // fringe hangs as the plain cut's. A boy with the same seed wears the plain cut.
    let Some(h) = head() else { return };
    let d = &sc_portrait::dress::ENGLAND_1356;
    // the hair's greatest breadth to one side in the lowest third of its height against that above 0.45 of it, how far its fringe stands in front of the skin of the forehead, and how far below the
    // crown it ends (in the head's height)
    let measures = |out: &Portrait| {
        let hair = body(out).expect("a body of hair");
        let (skin, crown) = skin(out);
        let height = crown - out.chin;
        let (low, top) = hair.pos.iter().fold((f32::MAX, f32::MIN), |(lo, hi), p| (lo.min(p[1]), hi.max(p[1])));
        let wide = |from: f32, to: f32| hair.pos.iter().filter(|p| p[1] >= low + from * (top - low) && p[1] <= low + to * (top - low)).map(|p| (p[0] - out.cx).abs()).fold(0f32, f32::max);
        let broad = skin.pos.iter().filter(|p| p[1] > crown - 0.3 * height).map(|p| (p[0] - out.cx).abs()).fold(0f32, f32::max);
        let middle = |p: &&V3| (p[0] - out.cx).abs() < 0.25 * broad && p[2] > out.cz && p[1] > crown - 0.45 * height;
        let fringe = hair.pos.iter().filter(middle).map(|p| p[2]).fold(f32::MIN, f32::max) - skin.pos.iter().filter(middle).map(|p| p[2]).fold(f32::MIN, f32::max);
        (wide(0.0, 0.33) - wide(0.45, 1.0), fringe, (crown - low) / height)
    };
    let (mut turned, mut plain) = (Vec::new(), Vec::new());
    for k in (1..400u32).step_by(2) {
        // (men of 29: from 30 one man in ten wears a coif, round 132)
        let p = person(k, false, 29.0);
        let name = d.hair_of(p.seed, p.age);
        if name != "bob09" && name != "bob07" || d.head_covered(false, p.age, p.seed) {
            continue;
        }
        let out = build(&h, &p, 1);
        // (a head that loses its hair, or has curls, wears those cuts whatever its seed draws)
        if !out.surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains("/bob07_cap."))) {
            continue;
        }
        let who = format!("man {k}");
        let (out_at_ends, fringe, ends) = measures(&out);
        if show() {
            println!("{who}: {name}, {:.1} mm broader a side in its lowest third than above it, the fringe {:.1} mm in front of the forehead, ends {ends:.3} of the head's height below the crown", 100.0 * out_at_ends, 100.0 * fringe);
        }
        if name == "bob09" {
            assert_eq!(d.under_of(name), "bob07");
            // a boy with the same seed: the plain cut
            let boy = person(k, false, 10.0);
            assert_eq!(d.hair_of(boy.seed, boy.age), "bob07", "{who} as a boy of 10");
            turned.push((out_at_ends, fringe, ends));
        } else {
            plain.push((out_at_ends, fringe, ends));
        }
    }
    if show() {
        println!("{} men with turned ends, {} with the plain cut to the jaw", turned.len(), plain.len());
        return;
    }
    assert!(turned.len() >= 5 && plain.len() >= 5, "{} men with turned ends, {} with the plain cut to the jaw", turned.len(), plain.len());
    // (round 141: read as the lowest third of the hair's height against what lies above 0.45 of it. Until then
    // the lowest quarter against all above 0.3, where the broadest place above was the rolls' own upper side:
    // 2.3 to 5.5 mm, and with a bowl cut's locks standing a little further off the head at the ears -1.8 to
    // 4.2. Read so, on 5 and 14 men: the rolls 24.7 to 30.2 mm broader a side than the hair above them (24.6 to
    // 28.7 before the locks), the plain cut's ends 6.2 to 11.8 (6.5 to 12.6))
    assert!(turned.iter().all(|m| m.0 > 0.2) && plain.iter().all(|m| m.0 < 0.15), "broader at the ends than above them: turned {turned:?}, plain {plain:?}");
    let most = plain.iter().map(|m| m.1).fold(f32::MIN, f32::max);
    assert!(turned.iter().all(|m| m.1 < most + 0.03), "the fringe of a head with turned ends stands further off the forehead than any plain one ({most}): {turned:?}");
    assert!(turned.iter().all(|m| (0.6..0.9).contains(&m.2)), "where the turned hair ends: {turned:?}");
}

#[test]
fn hair_that_is_cut_runs_to_the_cut_and_wears_the_image_along_its_length() {
    // The image of a bundle is laid along it at one scale, whatever its length (it goes on at its lower edge),
    // and the fringe is several bundles deep: the layers lie over each other where the hair is cut.
    let Some(h) = head() else { return };
    // (the last number: how far to either side of the face's middle the fringe is looked at, in the head's half
    // breadth: none on the bald man, and the hair gone back at the temples has its fringe in the middle only)
    for (k, female, age, fringed) in [(1u32, false, 8.0f32, 0.3f32), (3, false, 13.0, 0.3), (45, false, 13.0, 0.3), (5, false, 17.0, 0.3), (21, false, 24.0, 0.3), (25, false, 50.0, 0.0), (27, false, 68.0, 0.1), (28, true, 2.0, 0.3), (31, false, 5.0, 0.3)] {
        let out = build(&h, &person(k, female, age), 1);
        let who = format!("person {k} of {age}");
        let hair = body(&out).unwrap_or_else(|| panic!("{who}: a body of hair"));
        // how much of the image's height lies on a unit of a bundle's length (1 is 10 cm), triangle by triangle:
        // the two corners of one ring have one height in the image, the third another
        let mut dense: Vec<f32> = Vec::new();
        for (t, u) in hair.pos.chunks_exact(3).zip(hair.uv.chunks_exact(3)) {
            let (a, b, c) = if (u[0][1] - u[1][1]).abs() < 1e-5 {
                (0, 1, 2)
            } else if (u[1][1] - u[2][1]).abs() < 1e-5 {
                (1, 2, 0)
            } else if (u[0][1] - u[2][1]).abs() < 1e-5 {
                (0, 2, 1)
            } else {
                continue;
            };
            if shell_step((u[a][0] - u[b][0]).abs()) {
                continue;                                  // the shell's triangles
            }
            let mid = [0, 1, 2].map(|i| 0.5 * (t[a][i] + t[b][i]));
            let (along, image) = (len(sub(t[c], mid)), (u[c][1] - u[a][1]).abs());
            if along > 1e-4 && image > 1e-6 {
                dense.push(image / along);
            }
        }
        dense.sort_by(|a, b| a.partial_cmp(b).expect("a number"));
        let at = |share: f32| dense[((dense.len() - 1) as f32 * share) as usize];
        if show() {
            println!("{who}: the image lies {:.2} of its height to a unit in the median, {:.2} at the 99th hundredth", at(0.5), at(0.99));
        }
        assert!(at(0.5) > 0.5 * VSCALE && at(0.5) < 1.6 * VSCALE && at(0.99) < 3.0 * VSCALE, "{who}: the image is pressed together or drawn out along the bundles: {} in the median, {} at the 99th hundredth of a unit's {VSCALE}", at(0.5), at(0.99));
        if fringed == 0.0 {
            continue;
        }
        // the bundles over the forehead, above where they fray (round 138: FRINGE_FROM of the head's height and
        // more above the lowest end of the fringe; a centimetre until then), across the middle of the head's
        // breadth (three fifths of it as a rule): how many lie over each other at 84 places seen from the front
        let (skin, crown) = skin(&out);
        let height = crown - out.chin;
        let broad = skin.pos.iter().filter(|p| p[1] > crown - 0.3 * height).map(|p| (p[0] - out.cx).abs()).fold(0f32, f32::max);
        let fringe = hair.pos.iter().filter(|p| (p[0] - out.cx).abs() < fringed.min(0.25) * broad && p[2] > out.cz).map(|p| p[1]).fold(f32::MAX, f32::min);
        let mut deep: Vec<u32> = Vec::new();
        for row in 0..4 {
            let y = fringe + (FRINGE_FROM + 0.012 * row as f32) * height;
            for col in -10..=10 {
                let x = out.cx + fringed * broad * col as f32 / 10.0;
                let over = hair.pos.chunks_exact(3).filter(|t| {
                    let d = (t[1][1] - t[2][1]) * (t[0][0] - t[2][0]) + (t[2][0] - t[1][0]) * (t[0][1] - t[2][1]);
                    let w0 = ((t[1][1] - t[2][1]) * (x - t[2][0]) + (t[2][0] - t[1][0]) * (y - t[2][1])) / d;
                    let w1 = ((t[2][1] - t[0][1]) * (x - t[2][0]) + (t[0][0] - t[2][0]) * (y - t[2][1])) / d;
                    t[0][2] > out.cz && d.abs() > 1e-12 && w0 >= 0.0 && w1 >= 0.0 && w0 + w1 <= 1.0
                });
                deep.push(over.count() as u32);
            }
        }
        deep.sort();
        // (a fringe's teeth leave places bare at its edge: on the man of 24 eight of the 84 places up to round 111
        // and nine since round 112, whose brows stand out more or less and carry the fringe's lowest end a
        // millimetre with them. So the thinnest eighth is read, not the thinnest tenth)
        let (median, eighth) = (deep[deep.len() / 2], deep[deep.len() / 8]);
        if show() {
            println!("{who}: the fringe is {median} bundles deep in the median, {eighth} at its thinnest eighth, {} of {} places bare", deep.iter().filter(|n| **n == 0).count(), deep.len());
        }
        // (the forelock of the hair gone back ends ragged, its line rising to either side: its teeth leave places bare)
        let least = if fringed < 0.3 { 0 } else { 1 };
        assert!(median >= 2 && eighth >= least, "{who}: the fringe is {median} bundles deep in the median and {eighth} at its thinnest eighth");
    }
}

#[test]
fn hair_that_is_cut_ends_in_wisps() {
    // Round 138. Until then a bundle of a man's hair ended as it was broad, cut at a slant: one point each, and a
    // fringe and a cut's edge that were a row of teeth. Now a bundle that is cut keeps its breadth to its end and
    // is parted there into wisps side by side, two to seven by its breadth, each narrowing to a point of its own
    // and each of a length of its own (`hair_body.py` `fray`, `lay(frayed=)`). Turned ends (`bob09`: at the sides
    // and behind) and hair drawn to a plait or pinned up under a veil end as they did.
    let Some(h) = head() else { return };
    let d = &sc_portrait::dress::ENGLAND_1356;
    let mut seen = std::collections::BTreeMap::new();
    let mut read = |p: &sc_portrait::look::Look, who: &str| {
        let out = build(&h, p, 1);
        let Some(hair) = body(&out) else { return (0, 0, 0, 0) };
        // (the cut by its painted layer and the seed's draw: a head that loses its hair or has curls wears those)
        let cap = out.surfaces.iter().filter_map(|s| s.tex.as_deref()).find(|t| t.contains("_cap.") && !t.contains("beard")).map(|t| t.rsplit('/').next().unwrap_or(t).trim_end_matches(".webp").trim_end_matches("_cap").to_string()).unwrap_or_default();
        let drawn = d.hair_of(p.seed, p.age);
        let name = if p.female || d.under_of(drawn) != cap { cap } else { drawn.to_string() };
        let mut found = points(hair);
        found.sort_by_key(|f| f.0);
        let n = found.len();
        let many = found.iter().filter(|f| f.0 >= 2).count();
        let median = found[n / 2].0;
        let mut apart: Vec<f32> = found.iter().filter(|f| f.0 >= 2).map(|f| f.1).collect();
        apart.sort_by(|a, b| a.partial_cmp(b).expect("a number"));
        let between = apart.get(apart.len() / 2).copied().unwrap_or(0.0);
        if show() {
            println!("{who}: {name}, {n} pieces, {many} with two points and more, the median piece {median}, the most {}; their points {:.1} mm apart along the bundle in the median, {:.1} at most", found[n - 1].0, 100.0 * between, 100.0 * apart.last().copied().unwrap_or(0.0));
        }
        let e = seen.entry(name).or_insert((0usize, 0usize, 0usize, f32::MAX, 0f32));
        *e = (e.0 + 1, e.1 + n, e.2 + many, e.3.min(between), e.4.max(apart.last().copied().unwrap_or(0.0)));
        (n, many, median, found[n - 1].0)
    };
    // men of 29 and boys of 8 without a hood (their seeds' last digit), girls, and women under a veil set back
    for k in (1..240u32).step_by(2) {
        for age in [8.0f32, 29.0] {
            let p = person(k, false, age);
            if d.head_covered(false, p.age, p.seed) {
                continue;
            }
            read(&p, &format!("man {k} of {age}"));
        }
    }
    for k in (0..40u32).step_by(2) {
        let (n, many, _, most) = read(&person(k, true, 12.0), &format!("girl {k}"));
        // hair drawn to a plait narrows and ends at a breadth: no wisps
        assert!(n > 0 && many == 0 && most <= 1, "girl {k}: {many} of {n} bundles end in two points and more (the most {most})");
    }
    if show() {
        println!("{seen:?}");
        return;
    }
    for name in ["bob01", "bob06", "bob07", "bob09", "page01", "page02"] {
        let (heads, pieces, many, least, most) = *seen.get(name).unwrap_or_else(|| panic!("nobody wears {name}: {seen:?}"));
        let share = many as f32 / pieces as f32;
        // (measured: 99 hundredths of a cut's pieces and all of a parted cut's, the shell being the rest; 56 of
        // the turned cut's 206 on two heads, whose bundles at the sides and behind end in rolls; a bundle's
        // points 5.6 to 6.5 mm apart along it in the median, 10.8 at most)
        // (round 141: of a bowl cut's 129 pieces 86 are bundles, which fray; its 42 locks end in one point each,
        // as leaves: two thirds of the pieces where it was 99 hundredths, 48 of the turned cut's 258)
        let (enough, most_frayed) = if name == "bob09" { (0.15, 0.3) } else if name.starts_with("bob") { (0.6, 0.75) } else { (0.8, 1.01) };
        assert!(heads >= 2 && share > enough && share < most_frayed, "{name}: on {heads} heads {many} of {pieces} pieces end in two points and more");
        assert!(least > 0.01 && most < 0.2, "{name}: a bundle's points lie {least} apart along it in the median at least, {most} at most (1 is 10 cm)");
    }
}
