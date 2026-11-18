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
        // how broad a bundle is: six steps from flank to flank, each the side of a triangle that lies across it
        // (its two corners at one height of the image)
        let mut across: Vec<f32> = Vec::new();
        for (t, u) in hair.pos.chunks_exact(3).zip(hair.uv.chunks_exact(3)) {
            for (a, b) in [(0, 1), (1, 2), (2, 0)] {
                if (u[a][1] - u[b][1]).abs() < 1e-5 && ((u[a][0] - u[b][0]).abs() - 1.0 / 6.0).abs() < 1e-3 {
                    across.push(6.0 * len(sub(t[a], t[b])));
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
        assert!((0.1..0.32).contains(&broad), "{who}: a bundle is {broad} broad where it is broad (1 is 10 cm)");
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
            if ((u[a][0] - u[b][0]).abs() - 1.0 / 6.0).abs() > 1e-3 {
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
        // the bundles over the forehead, a centimetre and more above the lowest end of the fringe, across the
        // middle of the head's breadth (three fifths of it as a rule): how many lie over each other at 84 places
        // seen from the front
        let (skin, crown) = skin(&out);
        let height = crown - out.chin;
        let broad = skin.pos.iter().filter(|p| p[1] > crown - 0.3 * height).map(|p| (p[0] - out.cx).abs()).fold(0f32, f32::max);
        let fringe = hair.pos.iter().filter(|p| (p[0] - out.cx).abs() < fringed.min(0.25) * broad && p[2] > out.cz).map(|p| p[1]).fold(f32::MAX, f32::min);
        let mut deep: Vec<u32> = Vec::new();
        for row in 0..4 {
            let y = fringe + (0.03 + 0.012 * row as f32) * height;
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
        let (median, tenth) = (deep[deep.len() / 2], deep[deep.len() / 10]);
        if show() {
            println!("{who}: the fringe is {median} bundles deep in the median, {tenth} at its thinnest tenth");
        }
        // (the forelock of the hair gone back ends ragged, its line rising to either side: its teeth leave places bare)
        let least = if fringed < 0.3 { 0 } else { 1 };
        assert!(median >= 2 && tenth >= least, "{who}: the fringe is {median} bundles deep in the median and {tenth} at its thinnest tenth");
    }
}
