//! The veil and the wimple of England 1356 as the builder puts them on a head (the real look: a file of its own,
//! see tests/common).

mod common;

use common::{head, person};
use sc_portrait::dress::Veil;
use sc_portrait::measure::{MENTON, SELLION};
use sc_portrait::{build, Head, Look, LODS};

type V3 = [f32; 3];

/// What a woman wears on her head, in the head's own frame, in centimetres: from the nose's root (sellion), x
/// across, y up along the line from the chin's lowest point to the nose's root (the bust leans), z to the front.
struct Worn {
    skin: Vec<V3>,
    veil: Vec<V3>,
    wimple: Vec<V3>,
    /// The hair's body (the bundles of a cut, drawn with the dress's image of a bundle).
    hair: Vec<V3>,
    chin: V3,
    images: Vec<String>,
}

fn worn(h: &Head, p: &Look) -> Worn {
    let out = build(h, p, 1);
    let idx = &h.parts["body"][LODS - 1];
    let named = |part: &str| out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(part)));
    // the skin: its triangles' corners in the order of the head's own list (a strip that closes the lips after them)
    let skin = out.surfaces.iter().find(|s| s.pos.len() >= idx.len() && s.tex.as_deref().is_some_and(|t| t.contains("skin"))).expect("the skin");
    let at = |v: usize| skin.pos[idx.iter().position(|&i| i as usize == v).unwrap()];
    let (s, m) = (at(SELLION), at(MENTON));
    let l = (s[1] - m[1]).hypot(s[2] - m[2]);
    let (uy, uz) = ((s[1] - m[1]) / l, (s[2] - m[2]) / l);
    let to = |q: &V3| -> V3 {
        let (dy, dz) = (q[1] - s[1], q[2] - s[2]);
        [10.0 * (q[0] - s[0]), 10.0 * (dy * uy + dz * uz), 10.0 * (dz * uy - dy * uz)]
    };
    // (each point once: a surface lists the corners of its triangles)
    let once = |pos: &[V3]| -> Vec<V3> {
        let mut seen = std::collections::HashSet::new();
        pos.iter().filter(|q| seen.insert(q.map(f32::to_bits))).map(to).collect()
    };
    let of = |part: &str| named(part).map_or(Vec::new(), |s| once(&s.pos));
    Worn {
        skin: once(&skin.pos),
        veil: of("cloth_veil"),
        wimple: of("cloth_wimple"),
        hair: of("hair1356_body"),
        chin: to(&m),
        images: out.surfaces.iter().filter_map(|s| s.tex.clone()).collect(),
    }
}

fn dist(a: &V3, b: &V3) -> f32 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
}

/// The first `n` women of this age who wear the veil this way (`DressSet::veils`: by a digit of the seed).
fn women(n: usize, age: f32, veil: Veil) -> Vec<(u32, Look)> {
    (0..200).map(|k| (k, person(2 * k, true, age))).filter(|(_, p)| p.veil() == veil).take(n).collect()
}

/// How far a point is from the nearest corner of a surface.
fn off(q: &V3, of: &[V3]) -> f32 {
    of.iter().map(|s| dist(q, s)).fold(f32::MAX, f32::min)
}

#[test]
fn the_veil_of_england_lies_on_forehead_and_cheeks_and_falls_in_front_of_the_shoulders() {
    // Until round 70 the veil stood two centimetres off the head as a bathing cap with a flap behind: its rim
    // 1.5 cm off the cheeks, the ears to be seen inside it, nothing of it in front below the jaw, and the woman
    // read as bald. Now its rim lies on the forehead and on the cheeks in front of the ears, it falls from there
    // to the shoulders, and there is no hair under it that could come through.
    // (round 121: this is the veil of two women in ten now, `Veil::Closed`)
    let Some(h) = head() else { return };
    let closed = women(6, 30.0, Veil::Closed);
    assert_eq!(closed.len(), 6);
    for (k, p) in closed {
        let w = worn(&h, &p);
        assert!(!w.veil.is_empty(), "woman {k} wears no veil");
        assert!(!w.images.iter().any(|t| ["bun", "bob", "plait", "part", "hair1356"].iter().any(|hair| t.contains(hair))), "woman {k}: hair under the veil, {:?}", w.images);
        // over the middle of the forehead: the rim's lowest point, above the brows and below the hairline, on the skin
        let rim = w.veil.iter().filter(|q| q[0].abs() < 1.5 && q[2] > -5.0 && q[1] > 0.0).min_by(|a, b| a[1].total_cmp(&b[1])).expect("the veil over the forehead");
        let gap = off(rim, &w.skin);
        if std::env::var("SHOW").is_ok() {
            println!("woman {k}: rim {:.1} cm above the nose's root, {gap:.2} cm off the skin", rim[1]);
        }
        assert!(rim[1] > 2.0 && rim[1] < 6.5, "woman {k}: the rim {} cm above the nose's root", rim[1]);
        assert!(gap < 1.5, "woman {k}: the rim {gap} cm off the forehead");
        // at the height of the eyes: the rim on either cheek, the veil's foremost point there
        for side in [-1.0, 1.0] {
            let rim = w.veil.iter().filter(|q| q[0] * side > 0.0 && q[1].abs() < 1.0).max_by(|a, b| a[2].total_cmp(&b[2])).expect("the veil beside the eye");
            let gap = off(rim, &w.skin);
            if std::env::var("SHOW").is_ok() {
                println!("    beside the eye: {:.1} cm from the middle, {:.1} cm behind the nose's root, {gap:.2} cm off the skin", rim[0], -rim[2]);
            }
            // (the hem's own roll is 0.6 cm thick; the veil of round 69: 1.5 cm)
            assert!(gap < 1.3, "woman {k}: the rim {gap} cm off the cheek");
            // (the ear's hole lies some 10 cm behind the nose's root)
            assert!(rim[2] > -6.0, "woman {k}: the rim {} cm behind the nose's root, at the ear", -rim[2]);
        }
        // the ear's outermost point is under the veil (a veil close to the skull let the ears through, round 70)
        for side in [-1.0, 1.0] {
            let ear = w.skin.iter().filter(|q| q[1] > -7.0 && q[1] < 1.0 && q[2] > -14.0 && q[2] < -7.0).max_by(|a, b| (a[0] * side).total_cmp(&(b[0] * side))).expect("an ear");
            let over = w.veil.iter().filter(|q| dist(ear, q) < 1.5).map(|q| q[0] * side).fold(0.0, f32::max);
            if std::env::var("SHOW").is_ok() {
                println!("    the ear {:.1} cm from the middle, the veil round it up to {over:.1} cm", ear[0] * side);
            }
            assert!(over > ear[0] * side + 0.1, "woman {k}: the ear at {} cm, the veil round it at {over} cm", ear[0] * side);
        }
        // below the chin the veil hangs in front of the shoulders too, not only behind them
        let front = w.veil.iter().filter(|q| q[1] < w.chin[1] - 4.0 && q[2] > -7.0 && q[0].abs() > 3.0).count();
        if std::env::var("SHOW").is_ok() {
            println!("    {front} points of the veil hang in front below the chin");
        }
        assert!(front > 50, "woman {k}: {front} points of the veil in front below the chin");
    }
}

#[test]
fn the_wimple_of_an_older_woman_lies_under_her_veil() {
    // The wimple is pinned up under the veil: above the jaw none of it may come through the veil's cloth (as its
    // hem did while the veil's rim came down on the skin and the wimple stood off it, in round 70).
    let Some(h) = head() else { return };
    let closed = women(6, 60.0, Veil::Closed);
    assert_eq!(closed.len(), 6);
    for (k, p) in closed {
        let w = worn(&h, &p);
        assert!(!w.veil.is_empty() && !w.wimple.is_empty(), "woman {k} wears no veil and wimple");
        let (mut n, mut out, mut most) = (0, 0, 0.0f32);
        for q in w.wimple.iter().filter(|q| q[1] > w.chin[1] + 5.0) {
            let over = w.veil.iter().min_by(|a, b| dist(q, a).total_cmp(&dist(q, b))).unwrap();
            // (only where the veil is near: beside the face's opening the wimple shows, as it should)
            if dist(q, over) < 1.0 {
                n += 1;
                // how much further off the skin than the veil over it (the veil's own normal says less: where
                // the veil folds, behind the jaw, it points every way)
                let above = off(q, &w.skin) - off(over, &w.skin);
                most = most.max(above);
                out += (above > 0.15) as usize;
            }
        }
        if std::env::var("SHOW").is_ok() {
            println!("woman {k}: {n} points of the wimple under the veil, {out} of them outside it, at most by {most:.2} cm");
        }
        assert!(n > 200, "woman {k}: {n} points of the wimple under the veil");
        assert!(out * 100 < n, "woman {k}: {out} of {n} points of the wimple outside the veil, at most by {most} cm");
    }
}

#[test]
fn a_veil_set_back_shows_the_hair_over_the_forehead_and_keeps_it_under_the_cloth() {
    // Round 121: until then every grown woman of England wore the veil on forehead and cheeks, and none showed a
    // hair. Five in ten now wear it set back over parted hair (`Veil::Back`, `cloth_veil_back`, `part01`): its rim
    // lies behind the hairline, the hair shows in front of it, covers the ears, has no plaits, and does not come
    // through the cloth behind the rim.
    let Some(h) = head() else { return };
    for age in [30.0, 60.0] {
        let back = women(6, age, Veil::Back);
        assert_eq!(back.len(), 6);
        for (k, p) in back {
            let w = worn(&h, &p);
            assert!(!w.veil.is_empty() && !w.hair.is_empty(), "woman {k} of {age}: no veil or no hair under it, {:?}", w.images);
            assert!(w.images.iter().any(|t| t.contains("plait01_cap")) && !w.images.iter().any(|t| t.contains("_rope")), "woman {k} of {age}: a girl's painted layer and no plaits, {:?}", w.images);
            assert_eq!(w.wimple.is_empty(), age < 50.0, "woman {k} of {age}: the wimple");
            // over the middle of the forehead: the veil's rim, and the hair's lowest point in front of it
            // (the rim lies on the top of the head, further behind the nose's root than a closed veil's)
            let rim = w.veil.iter().filter(|q| q[0].abs() < 1.5 && q[2] > -9.0 && q[1] > 0.0).min_by(|a, b| a[1].total_cmp(&b[1])).expect("the veil over the forehead");
            let line = w.hair.iter().filter(|q| q[0].abs() < 1.5 && q[2] > -9.0 && q[1] > 0.0).min_by(|a, b| a[1].total_cmp(&b[1])).expect("hair over the forehead");
            // the ear's outermost point is under the hair
            let mut ears = [0.0f32; 2];
            for (e, side) in [-1.0f32, 1.0].into_iter().enumerate() {
                let ear = w.skin.iter().filter(|q| q[1] > -7.0 && q[1] < 1.0 && q[2] > -14.0 && q[2] < -7.0).max_by(|a, b| (a[0] * side).total_cmp(&(b[0] * side))).expect("an ear");
                let over = w.hair.iter().filter(|q| dist(ear, q) < 1.5).map(|q| q[0] * side).fold(0.0, f32::max);
                ears[e] = over - ear[0] * side;
            }
            // behind the rim (a finger's breadth behind its rearmost place, beside the eyes): the hair under the
            // veil's cloth, no further off the skin than the cloth over it
            let beside = [-1.0f32, 1.0].map(|side| w.veil.iter().filter(|q| q[0] * side > 0.0 && q[1].abs() < 1.0).map(|q| q[2]).fold(f32::MIN, f32::max));
            let behind = beside[0].min(beside[1]).min(rim[2]) - 1.5;
            let (mut n, mut out, mut most) = (0, 0, 0.0f32);
            for q in w.hair.iter().filter(|q| q[2] < behind) {
                let over = w.veil.iter().min_by(|a, b| dist(q, a).total_cmp(&dist(q, b))).unwrap();
                if dist(q, over) < 1.0 {
                    n += 1;
                    let above = off(q, &w.skin) - off(over, &w.skin);
                    most = most.max(above);
                    out += (above > 0.15) as usize;
                }
            }
            let front = w.veil.iter().filter(|q| q[1] < w.chin[1] - 4.0 && q[2] > -7.0 && q[0].abs() > 3.0).count();
            if std::env::var("SHOW").is_ok() {
                println!("woman {k} of {age}: the rim {:.1} cm above the nose's root, the hair from {:.1} cm; the hair {:.1} and {:.1} cm outside the ears; the rim beside the eyes {:.1} and {:.1} cm behind the nose's root; {n} points of hair near the cloth, {out} outside it, at most by {most:.2} cm; {front} points of the veil in front below the chin", rim[1], line[1], ears[0], ears[1], -beside[0], -beside[1]);
            }
            assert!(rim[1] > 6.5 && rim[1] < 12.0, "woman {k} of {age}: the rim {} cm above the nose's root", rim[1]);
            assert!(rim[1] - line[1] > 2.0, "woman {k} of {age}: hair from {} cm, the rim at {} cm", line[1], rim[1]);
            assert!(ears[0] > 0.1 && ears[1] > 0.1, "woman {k} of {age}: the hair {ears:?} cm outside the ears");
            assert!(n > 200 && out * 50 < n, "woman {k} of {age}: {out} of {n} points of the hair outside the veil, at most by {most} cm");
            assert!(front > 50, "woman {k} of {age}: {front} points of the veil in front below the chin");
        }
    }
}

#[test]
fn the_cloth_over_an_ear_lies_the_right_way_up_and_no_hair_comes_through_it() {
    // (round 140) A veil or a hood over an ear is bound to triangles of the ear's folds, which face anywhere.
    // Held off them along their own directions (real_look.rs `calm`) the cloth over the ear was crumpled and
    // some of its triangles lay turned over: black holes at the ear, seen from the side and, on the near side,
    // from the front. On the head the cloth is held off along its own direction now. On 120 people of 15 to
    // 68, over each ear (within 7 cm of the tragion and behind it, where the veil's rolled rim does not reach):
    // how many triangles of a veil or of a hood on the head face against their corners' directions (288 before,
    // up to 9 on a person; none now); and above the chin, how many corners of the skin stand through that
    // cloth, counted as `sink` counts, with no gap (84 before, 72 now: not what this round mends; round 154: 36,
    // since the cloth round a place that is held off the skin goes with it on the head as well).
    // And the hair under it: over the ears a strand of a man's hair stood through his hood, a finger long
    // (17 954 corners of the hair's bundles through the hoods of 26 men, up to 1 356 on one; 1 318 through
    // women's veils, where none was seen). The builder sets the hair under the cloth now: none.
    use sc_portrait::dress::ENGLAND_1356;
    use sc_portrait::layers::{sink, THROUGH};
    use sc_portrait::measure::TRAGION;
    let Some(h) = head() else { return };
    let d = &ENGLAND_1356;
    let show = std::env::var("SHOW").is_ok();
    let idx = &h.parts["body"][LODS - 1];
    let ears: Vec<usize> = [TRAGION.0, TRAGION.1].iter().map(|v| idx.iter().position(|i| *i as usize == *v).expect("the tragion is drawn")).collect();
    let (mut worn, mut turned, mut through, mut triangles, mut hairs) = (0, 0, 0, 0, 0);
    let mut worst = (0, 0u32);
    for k in 0..120u32 {
        let p = person(k, k % 2 == 0, [15.0, 24.0, 35.0, 50.0, 58.0, 68.0][(k / 2) as usize % 6]);
        let out = build(&h, &p, 1);
        let skin = out.surfaces.iter().find(|s| s.pos.len() >= idx.len() && s.tex.as_deref().is_some_and(|t| t.contains("skin"))).expect("the skin");
        for cloth in out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| [d.veil, d.veil_back, d.hood_up].iter().any(|n| t.contains(n)))) {
            worn += 1;
            let mut n = 0;
            for (q, m) in cloth.pos.chunks_exact(3).zip(cloth.nrm.chunks_exact(3)) {
                let c: V3 = std::array::from_fn(|a| (q[0][a] + q[1][a] + q[2][a]) / 3.0);
                if !ears.iter().any(|&e| dist(&c, &skin.pos[e]) < 0.7 && c[2] < skin.pos[e][2] - 0.1) {
                    continue;
                }
                triangles += 1;
                let (e1, e2): (V3, V3) = (std::array::from_fn(|a| q[1][a] - q[0][a]), std::array::from_fn(|a| q[2][a] - q[0][a]));
                let g = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
                let mean: V3 = std::array::from_fn(|a| m[0][a] + m[1][a] + m[2][a]);
                // (of 5 mm2 and more: where the cloth turns in under the skull its file has slivers of a tenth
                // of that which lie so on every head; and only where the three corners face one way: on the
                // veil's rolled rim a triangle joins the outside to the inside, and has no way up)
                let agree = (0..3).all(|a| (0..3).map(|b| m[a][b] * m[(a + 1) % 3][b]).sum::<f32>() > 0.0);
                if agree && g[0] * mean[0] + g[1] * mean[1] + g[2] * mean[2] < 0.0 && (g[0] * g[0] + g[1] * g[1] + g[2] * g[2]).sqrt() / 2.0 >= 0.0005 {
                    n += 1;
                }
            }
            turned += n;
            if n > worst.0 {
                worst = (n, k);
            }
            // (the skin above the chin that stands outside the cloth: `sink` counts below a height, so both
            // are stood on their heads)
            let mut s = skin.clone();
            s.pos.iter_mut().for_each(|q| q[1] = -q[1]);
            s.nrm.iter_mut().for_each(|q| q[1] = -q[1]);
            s.pos.chunks_exact_mut(3).for_each(|t| t.swap(1, 2));
            s.nrm.chunks_exact_mut(3).for_each(|t| t.swap(1, 2));
            let mut c = cloth.clone();
            c.pos.iter_mut().for_each(|q| q[1] = -q[1]);
            c.pos.chunks_exact_mut(3).for_each(|t| t.swap(1, 2));
            through += sink(&mut s, &c, -out.chin, 0.0, THROUGH);
            if let Some(hair) = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(d.body_image))) {
                hairs += sink(&mut hair.clone(), cloth, f32::MAX, 0.0, THROUGH);
            }
            if show && n > 0 {
                println!("person {k}: {n} triangles of {} turned over at the ears", cloth.tex.as_deref().unwrap_or(""));
            }
        }
    }
    if show {
        println!("{worn} cloths on a head on 120 people, {triangles} triangles over the ears; {turned} turned over (at most {} on person {}); {through} corners of the skin through the cloth above the chin; {hairs} of hair", worst.0, worst.1);
        return;
    }
    assert!(worn >= 60 && triangles > 30_000, "{worn} cloths on a head, {triangles} triangles over the ears");
    assert_eq!(turned, 0, "{turned} triangles over the ears turned over, {} on person {}", worst.0, worst.1);
    assert!(through <= 50, "{through} corners of the skin through the cloth on a head");
    assert_eq!(hairs, 0, "{hairs} corners of the hair through the cloth on a head");
}

#[test]
fn no_place_of_the_cloth_over_an_ear_stands_alone_as_a_point() {
    // (round 154) From the side and from behind a veil had a point over either ear, a pyramid up to 1.2 cm high
    // on one place of the cloth: the place is bound to a triangle of the ear's folds that it lies 2.4 cm beside,
    // and was held off that triangle's plane by itself (real_look.rs `calm`). A man's hood had the same, and
    // smaller ones where a place does lie on its triangle and was held off it alone. On the 120 people of the
    // test above, over each ear as there: how far a place of a veil or of a hood on the head stands off the
    // middle of the places next to it. 102 of 40 322 stood off by more than 6 mm, 28 by more than 1 cm, at most
    // by 22.7 mm (a man's hood); none over 6 mm now, at most 5.4 mm. (18 stand between 5 and 5.4 mm off: what
    // they are was not looked into.)
    use sc_portrait::dress::ENGLAND_1356;
    use sc_portrait::measure::TRAGION;
    use std::collections::HashMap;
    // (round 155) not more than 5 cm under the ear: a veil hangs from the head now, and 5.5 to 6 cm under the ears
    // its fall meets the cloth that lies on the shoulders in a fold, along which a place stands 6 to 8 mm off
    // the middle of the places next to it (the two under it lie 2 cm further out), as along any fold. With
    // round 154's rule taken out, 29 places within these 5 cm stand more than 6 mm off, up to 15 mm.
    const LOW: f32 = 0.5;


    let Some(h) = head() else { return };
    let d = &ENGLAND_1356;
    let idx = &h.parts["body"][LODS - 1];
    let ears: Vec<usize> = [TRAGION.0, TRAGION.1].iter().map(|v| idx.iter().position(|i| *i as usize == *v).expect("the tragion is drawn")).collect();
    let (mut worn, mut places, mut points, mut worst) = (0, 0, 0, (0.0f32, 0u32));
    for k in 0..120u32 {
        let p = person(k, k % 2 == 0, [15.0, 24.0, 35.0, 50.0, 58.0, 68.0][(k / 2) as usize % 6]);
        let out = build(&h, &p, 1);
        let skin = out.surfaces.iter().find(|s| s.pos.len() >= idx.len() && s.tex.as_deref().is_some_and(|t| t.contains("skin"))).expect("the skin");
        for cloth in out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| [d.veil, d.veil_back, d.hood_up].iter().any(|n| t.contains(n)))) {
            worn += 1;
            // the cloth's places, each once (a surface lists the corners of its triangles), and the places next
            // to each along a triangle's side
            let mut ids: HashMap<[u32; 3], usize> = HashMap::new();
            let of: Vec<usize> = cloth
                .pos
                .iter()
                .map(|q| {
                    let n = ids.len();
                    *ids.entry(q.map(f32::to_bits)).or_insert(n)
                })
                .collect();
            let mut at = vec![[0f32; 3]; ids.len()];
            for (i, &v) in of.iter().enumerate() {
                at[v] = cloth.pos[i];
            }
            let mut next: Vec<Vec<usize>> = vec![Vec::new(); ids.len()];
            for t in of.chunks_exact(3) {
                for c in 0..3 {
                    for other in [t[(c + 1) % 3], t[(c + 2) % 3]] {
                        if !next[t[c]].contains(&other) {
                            next[t[c]].push(other);
                        }
                    }
                }
            }
            for v in (0..at.len()).filter(|&v| next[v].len() > 2 && ears.iter().any(|&e| dist(&at[v], &skin.pos[e]) < 0.7 && at[v][2] < skin.pos[e][2] - 0.1 && at[v][1] > skin.pos[e][1] - LOW)) {
                places += 1;
                let middle: V3 = std::array::from_fn(|a| next[v].iter().map(|&w| at[w][a]).sum::<f32>() / next[v].len() as f32);
                let off = dist(&at[v], &middle);
                points += (off > 0.06) as usize;
                if off > worst.0 {
                    worst = (off, k);
                }
            }
        }
    }
    if std::env::var("SHOW").is_ok() {
        println!("{worn} cloths on a head on 120 people, {places} places over the ears; {points} stand more than 6 mm off the middle of the places next to them, at most {:.1} mm on person {}", worst.0 * 100.0, worst.1);
        return;
    }
    assert!(worn >= 60 && places > 15_000, "{worn} cloths on a head, {places} places over the ears");
    assert_eq!(points, 0, "{points} places over the ears stand alone, at most by {} mm on person {}", worst.0 * 100.0, worst.1);
}

#[test]
fn a_veil_hangs_from_the_head_and_does_not_go_in_under_it() {
    // (round 155) A veil is bound to the body place by place, and went where the body goes: in under the back of
    // the head to the nape and out again over the shoulders, a ball with a ledge under it; under the ears and the
    // back of the head its rings lay folded on each other, the middle of the fold facing the head. It hangs from
    // the head now (hang.rs). On the 47 veils of 120 people, as the stage stands them, of the cloth's places
    // behind the ears and more than 5.5 cm under its top: how far a place lies further in, from the upright
    // through the middle of the cloth's top, than the cloth on the head above it (from the ears' height up) in
    // its direction. A veil's deepest place lay 35.3 mm in on average and 46.9 mm at most, 54 399 of 114 958
    // places more than 5 mm; 2.3 mm on average and 4.1 mm at most now, no place more than 5 mm (the builder
    // lets a place lie 1 mm in and 1 mm more for each degree the cloth above lies to the side, and this looks
    // 1 degree to either side: 2 mm; where the rest comes from was not looked into). 15 366 triangles behind
    // the ears faced the head; none does. And the hems are whole: 3 places of a hem's tube lie more than 2.5 cm
    // off their cloth, as before.
    use sc_portrait::dress::ENGLAND_1356;
    use sc_portrait::measure::TRAGION;
    use std::collections::HashSet;
    let Some(h) = head() else { return };
    let d = &ENGLAND_1356;
    let idx = &h.parts["body"][LODS - 1];
    let ears: Vec<usize> = [TRAGION.0, TRAGION.1].iter().map(|v| idx.iter().position(|i| *i as usize == *v).expect("the tragion is drawn")).collect();
    let (mut worn, mut places, mut deep, mut inward, mut loose) = (0, 0, 0, 0, 0);
    let mut steps: Vec<(f32, u32)> = Vec::new();
    for k in 0..120u32 {
        let p = person(k, k % 2 == 0, [15.0, 24.0, 35.0, 50.0, 58.0, 68.0][(k / 2) as usize % 6]);
        let out = build(&h, &p, 1);
        let skin = out.surfaces.iter().find(|s| s.pos.len() >= idx.len() && s.tex.as_deref().is_some_and(|t| t.contains("skin"))).expect("the skin");
        // as the stage stands the figure: tilted towards a shoulder (src/portrait/stage.ts `standing`)
        let (c, s) = (out.head[1].cos(), out.head[1].sin());
        let stood = |q: &V3| -> V3 { [q[0] * c - q[1] * s, q[0] * s + q[1] * c, q[2]] };
        let ear = stood(&std::array::from_fn(|a| (skin.pos[ears[0]][a] + skin.pos[ears[1]][a]) / 2.0));
        for cloth in out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| [d.veil, d.veil_back].iter().any(|n| t.contains(n)))) {
            worn += 1;
            // the cloth's corners as they stand, and which are the cloth's own (a rolled hem's tube has texture
            // coordinates of its own, up to 0.05: `tunic_bind.py`)
            let at: Vec<V3> = cloth.pos.iter().map(stood).collect();
            let own: Vec<bool> = cloth.uv.iter().map(|uv| uv[1].abs() > 0.05).collect();
            let mut seen = HashSet::new();
            let sheet: Vec<V3> = (0..at.len()).filter(|&i| own[i] && seen.insert(at[i].map(f32::to_bits))).map(|i| at[i]).collect();
            // round the upright through the middle of the cloth's top (its places within 2.5 cm of its highest)
            let crest = sheet.iter().map(|q| q[1]).fold(f32::MIN, f32::max);
            let top: Vec<&V3> = sheet.iter().filter(|q| q[1] > crest - 0.25).collect();
            let axis = [0, 2].map(|a| top.iter().map(|q| q[a]).sum::<f32>() / top.len() as f32);
            let round = |q: &V3| ((q[0] - axis[0]).hypot(q[2] - axis[1]), (q[2] - axis[1]).atan2(q[0] - axis[0]).to_degrees());
            // how far a place behind the ears lies further in than the cloth on the head above it (from the ears'
            // height up) in its direction (to within a degree either way)
            let turned: Vec<(f32, f32)> = sheet.iter().map(round).collect();
            let mut step = 0.0f32;
            for v in (0..sheet.len()).filter(|&v| sheet[v][2] < ear[2] && sheet[v][1] < crest - 0.55) {
                let far = (0..sheet.len()).filter(|&u| sheet[u][1] >= sheet[v][1].max(ear[1]) && ((turned[u].1 - turned[v].1 + 540.0).rem_euclid(360.0) - 180.0).abs() <= 1.0).map(|u| turned[u].0).fold(0.0f32, f32::max);
                step = step.max(far - turned[v].0);
                places += 1;
                deep += (far - turned[v].0 > 0.05) as usize;
            }
            steps.push((step, k));
            // what of the cloth behind the ears faces the head: the middle of a pleat
            for t in (0..at.len()).step_by(3).filter(|&t| own[t] && own[t + 1] && own[t + 2]) {
                let (a, b): (V3, V3) = (std::array::from_fn(|i| at[t + 1][i] - at[t][i]), std::array::from_fn(|i| at[t + 2][i] - at[t][i]));
                let n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
                let m: V3 = std::array::from_fn(|i| (at[t][i] + at[t + 1][i] + at[t + 2][i]) / 3.0);
                let l = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
                let r = (m[0] - axis[0]).hypot(m[2] - axis[1]);
                inward += (m[2] < ear[2] && m[1] < crest - 0.55 && l > 1e-9 && r > 0.3 && (n[0] * (m[0] - axis[0]) + n[2] * (m[2] - axis[1])) / (l * r) < -0.3) as usize;
            }
            // a hem's tube stays on the edge it is rolled on
            let mut seen = HashSet::new();
            loose += (0..at.len()).filter(|&i| !own[i] && seen.insert(at[i].map(f32::to_bits)) && off(&at[i], &sheet) > 0.25).count();
        }
    }
    let most = |of: &[(f32, u32)]| of.iter().copied().fold((0.0f32, 0u32), |a, b| if b.0 > a.0 { b } else { a });
    let mean = |of: &[(f32, u32)]| of.iter().map(|s| s.0).sum::<f32>() / of.len() as f32;
    if std::env::var("SHOW").is_ok() {
        println!("{worn} veils on 120 people, {places} places behind the ears; a veil's deepest place lies {:.1} mm in under the cloth above it on average, at most {:.1} mm on person {}; {deep} places lie more than 5 mm in; {inward} triangles behind the ears face the head; {loose} places of a hem lie more than 2.5 cm off their cloth", mean(&steps) * 100.0, most(&steps).0 * 100.0, most(&steps).1);
        return;
    }
    assert!(worn >= 40 && places > 100_000, "{worn} veils, {places} places behind the ears");
    assert!(most(&steps).0 <= 0.05 && deep == 0, "{deep} places lie more than 5 mm in under the cloth above them, at most {} mm on person {}", most(&steps).0 * 100.0, most(&steps).1);
    assert!(inward <= 10, "{inward} triangles of a veil behind the ears face the head");
    assert!(loose <= 3, "{loose} places of a hem lie more than 2.5 cm off their cloth");
}
