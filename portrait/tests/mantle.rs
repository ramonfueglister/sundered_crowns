//! A crowned head's mantle (round 145): one cloth round the shoulders over the gown, faced with fur along both
//! front edges and round the neck, and held by two brooches with a cord between them (the real look: files of its
//! own, see tests/common).

mod common;

use common::{head, person_of};
use sc_portrait::dress::{COURT_1356, CROWNED_1356, ENGLAND_1356};
use sc_portrait::mantle::{BROOCH, CORD, MARK};
use sc_portrait::{build, Surface};

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

type V3 = [f32; 3];

fn dist(a: &V3, b: &V3) -> f32 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
}

fn mean(cols: &[[f32; 3]]) -> [f32; 3] {
    std::array::from_fn(|a| cols.iter().map(|c| c[a]).sum::<f32>() / cols.len().max(1) as f32)
}

/// The surfaces drawn with an image whose name holds `name`.
fn with<'a>(s: &'a [Surface], name: &str) -> Vec<&'a Surface> {
    s.iter().filter(|s| !s.pos.is_empty() && s.tex.as_deref().is_some_and(|t| t.contains(name))).collect()
}

/// The mantle's parts: its cloth, its fur, and what has no image: the brooches' gold (metal, not the crown's and
/// not the buttons': the piece of metal that lies on the fur), their stones and the cord.
struct Parts<'a> {
    cloth: &'a Surface,
    fur: &'a Surface,
    gold: &'a Surface,
    stone: &'a Surface,
    cord: &'a Surface,
}

fn parts<'a>(s: &'a [Surface], k: u32) -> Parts<'a> {
    let d = &CROWNED_1356;
    let fur = with(s, d.mantle_fur);
    let cloth: Vec<&Surface> = with(s, d.mantle).into_iter().filter(|c| !c.tex.as_deref().unwrap().contains(d.mantle_fur)).collect();
    assert_eq!((cloth.len(), fur.len()), (1, 1), "person {k}: the mantle's cloth and fur");
    let plain = |f: &dyn Fn(&Surface) -> bool| s.iter().filter(|s| s.tex.is_none() && !s.pos.is_empty() && f(s)).collect::<Vec<_>>();
    // of the pieces of metal and of stone the smallest are the brooches' (the crown's are of thousands of triangles)
    let gold = *plain(&|s| s.mat.metal == 1.0).iter().min_by_key(|s| s.pos.len()).unwrap_or_else(|| panic!("person {k}: no brooch"));
    let stone = *plain(&|s| s.mat.metal == 0.0 && s.mat.rough < 0.2).iter().min_by_key(|s| s.pos.len()).unwrap_or_else(|| panic!("person {k}: no stone"));
    let cord = plain(&|s| s.mat.metal == 0.0 && s.mat.rough > 0.5 && s.mat.rough < 0.7);
    assert_eq!(cord.len(), 1, "person {k}: the cord");
    Parts { cloth: cloth[0], fur: fur[0], gold, stone, cord: cord[0] }
}

/// The people the tests look at: both sexes, from a child of five to an old one.
fn people() -> impl Iterator<Item = (u32, bool, f32)> {
    (0..16u32).map(|k| (k, k % 2 == 0, [24.0f32, 50.0, 68.0, 13.0, 5.0, 35.0, 8.0, 17.0][(k / 2) as usize % 8]))
}

#[test]
fn a_crowned_head_wears_a_mantle_and_nobody_else() {
    let Some(h) = head() else { return };
    assert!(ENGLAND_1356.mantle.is_empty() && COURT_1356.mantle.is_empty() && !CROWNED_1356.mantle.is_empty());
    let (mut share, mut seen) = (0f32, 0);
    for (k, female, age) in people() {
        for stand in [1u8, 3] {
            let out = build(&h, &person_of(k, female, age, stand), 1);
            assert!(with(&out.surfaces, CROWNED_1356.mantle).is_empty(), "person {k} of stand {stand} in a mantle");
        }
        let out = build(&h, &person_of(k, female, age, 4), 1);
        let m = parts(&out.surfaces, k);
        // one sheet taken apart: all of the file's triangles, the marks taken off their places in the image
        let (nc, nf) = (m.cloth.pos.len() / 3, m.fur.pos.len() / 3);
        assert!(nc > 2000 && nf > 2000, "person {k}: {nc} triangles of cloth, {nf} of fur");
        for s in [m.cloth, m.fur] {
            assert_eq!((s.uv.len(), s.nrm.len()), (s.pos.len(), s.pos.len()), "person {k}");
            assert!(s.uv.iter().all(|u| u[0].abs() < MARK / 2.0), "person {k}: a mark left on {:?}", s.tex);
        }
        // the cloth is dyed (red: its red four times its blue), the fur is white (no part of its colour under
        // 0.8 of its strongest) and lighter than the cloth
        let (c, f) = (mean(&m.cloth.col), mean(&m.fur.col));
        assert!(c[0] > 4.0 * c[2] && c[0] > 4.0 * c[1], "person {k}: the cloth {c:?}");
        assert!(f.iter().cloned().fold(f32::MAX, f32::min) > 0.8 * f[0] && f[1] > 3.0 * c[0], "person {k}: the fur {f:?} on cloth {c:?}");
        // it lies on the shoulders and goes down out of the picture: from above the gown's neck (within a hand
        // under the chin) to below the gown's chest
        let (lo, hi) = m.cloth.pos.iter().chain(&m.fur.pos).fold((f32::MAX, f32::MIN), |(lo, hi), q| (lo.min(q[1]), hi.max(q[1])));
        assert!(hi > out.chin - 1.0 && hi < out.chin + 0.6 && lo < out.chin - 2.0, "person {k}: the mantle from {lo} to {hi}, the chin at {}", out.chin);
        share += nf as f32 / (nc + nf) as f32;
        seen += 1;
    }
    if show() {
        println!("{seen} crowned heads in a mantle; of its triangles {:.2} are of fur", share / seen as f32);
    }
}

#[test]
fn the_mantle_is_open_in_front_and_its_fur_lies_along_the_opening() {
    let Some(h) = head() else { return };
    let (mut gap, mut seen) = (f32::MAX, 0);
    for (k, female, age) in people() {
        let out = build(&h, &person_of(k, female, age, 4), 1);
        let m = parts(&out.surfaces, k);
        let gown: Vec<&Surface> = with(&out.surfaces, CROWNED_1356.gown).into_iter().chain(with(&out.surfaces, CROWNED_1356.gown_cut[0])).chain(with(&out.surfaces, CROWNED_1356.gown_cut[1])).collect();
        assert!(!gown.is_empty(), "person {k}: no gown");
        // the figure's middle, and its front: the gown's corners furthest forward
        let mid = m.gold.pos.iter().map(|q| q[0]).sum::<f32>() / m.gold.pos.len() as f32;
        let level = m.gold.pos.iter().map(|q| q[1]).sum::<f32>() / m.gold.pos.len() as f32;
        // at the brooches' height and a hand below it nothing of the mantle lies before the middle of the chest: the
        // nearest of its corners in front of the body to either side
        let front = gown.iter().flat_map(|s| &s.pos).filter(|q| (q[1] - level).abs() < 0.3).map(|q| q[2]).fold(f32::MIN, f32::max);
        let open = m.cloth.pos.iter().chain(&m.fur.pos).filter(|q| q[1] < level + 0.1 && q[1] > level - 1.0 && q[2] > front - 0.5).map(|q| (q[0] - mid).abs()).fold(f32::MAX, f32::min);
        assert!(open > 0.2, "person {k}: the mantle closes to {open} of the middle");
        gap = gap.min(open);
        // the cloth's own corners there lie further from the middle than the fur's: the fur is the facing of the edge
        let edge = |s: &Surface| s.pos.iter().filter(|q| q[1] < level + 0.1 && q[1] > level - 1.0 && q[2] > front - 0.5).map(|q| (q[0] - mid).abs()).fold(f32::MAX, f32::min);
        assert!(edge(m.fur) + 0.3 < edge(m.cloth), "person {k}: the fur begins {} from the middle, the cloth {}", edge(m.fur), edge(m.cloth));
        seen += 1;
    }
    if show() {
        println!("{seen} mantles: open in front by at least {:.2} to either side of the middle", gap);
    }
}

#[test]
fn two_brooches_on_the_fur_hold_it_with_a_cord_that_runs_over_the_gown() {
    let Some(h) = head() else { return };
    let d = &CROWNED_1356;
    let mut worst = (0f32, f32::MAX, f32::MAX, 0f32);
    for (k, female, age) in people() {
        let out = build(&h, &person_of(k, female, age, 4), 1);
        let m = parts(&out.surfaces, k);
        // two brooches: the gold's corners fall into two heaps of the same size, one to either side, each no
        // broader than a brooch and a little
        let mid = m.gold.pos.iter().map(|q| q[0]).sum::<f32>() / m.gold.pos.len() as f32;
        let (left, right): (Vec<V3>, Vec<V3>) = m.gold.pos.iter().partition(|q| q[0] < mid);
        assert_eq!(left.len(), right.len(), "person {k}: the brooches' gold");
        let middle = |h: &[V3]| -> V3 { std::array::from_fn(|a| h.iter().map(|q| q[a]).sum::<f32>() / h.len() as f32) };
        let (a, b) = (middle(&left), middle(&right));
        for (heap, c) in [(&left, a), (&right, b)] {
            let broad = heap.iter().map(|q| dist(q, &c)).fold(0f32, f32::max);
            assert!(broad < 1.3 * BROOCH, "person {k}: a brooch {broad} about its middle");
            // on the fur: its middle within a brooch's radius of the fur, and further from the cloth
            let on = |s: &Surface| s.pos.iter().map(|q| dist(q, &c)).fold(f32::MAX, f32::min);
            worst.0 = worst.0.max(on(m.fur));
            assert!(on(m.fur) < BROOCH && on(m.fur) < on(m.cloth), "person {k}: a brooch {} off the fur, {} off the cloth", on(m.fur), on(m.cloth));
        }
        // at one height, on the chest under the chin
        assert!((a[1] - b[1]).abs() < 0.25 && a[1] < out.chin && a[1] > out.chin - 2.0, "person {k}: the brooches at {} and {}, the chin at {}", a[1], b[1], out.chin);
        worst.1 = worst.1.min(dist(&a, &b));
        assert!(dist(&a, &b) > 0.8, "person {k}: the brooches {} apart", dist(&a, &b));
        // a stone on each
        let (sl, sr): (Vec<V3>, Vec<V3>) = m.stone.pos.iter().partition(|q| q[0] < mid);
        assert!(sl.len() == sr.len() && !sl.is_empty() && dist(&middle(&sl), &a) < BROOCH && dist(&middle(&sr), &b) < BROOCH, "person {k}: the stones");
        // the cord goes from one to the other
        let ends = |c: &V3| m.cord.pos.iter().map(|q| dist(q, c)).fold(f32::MAX, f32::min);
        assert!(ends(&a) < BROOCH && ends(&b) < BROOCH, "person {k}: the cord ends {} and {} off the brooches", ends(&a), ends(&b));
        let (x0, x1) = m.cord.pos.iter().fold((f32::MAX, f32::MIN), |(lo, hi), q| (lo.min(q[0]), hi.max(q[0])));
        assert!(x0 > a[0] - BROOCH && x1 < b[0] + BROOCH, "person {k}: the cord from {x0} to {x1}, the brooches at {} and {}", a[0], b[0]);
        // and over the gown and the linen at its neck: no corner of theirs beside a place of the cord (within its
        // own thickness across) stands in front of the cord's front there
        let under: Vec<&Surface> = [d.gown, d.gown_cut[0], d.gown_cut[1], d.under[0], d.under[1]].iter().filter(|n| !n.is_empty()).flat_map(|n| with(&out.surfaces, n)).collect();
        for ring in m.cord.pos.chunks_exact(48) {
            let c = middle(ring);
            let fore = ring.iter().map(|q| q[2]).fold(f32::MIN, f32::max);
            let before = under.iter().flat_map(|s| &s.pos).filter(|q| (q[0] - c[0]).abs() < CORD && (q[1] - c[1]).abs() < CORD).map(|q| q[2]).fold(f32::MIN, f32::max);
            if before > f32::MIN {
                worst.2 = worst.2.min(fore - before);
                assert!(fore > before, "person {k}: the gown {} in front of the cord at {c:?}", before - fore);
            }
        }
        worst.3 = worst.3.max(m.cord.pos.len() as f32 / 3.0);
    }
    if show() {
        println!("a brooch's middle at most {:.3} off the fur; the brooches at least {:.2} apart; the cord's front at least {:.3} before the gown under it; a cord of {} triangles", worst.0, worst.1, worst.2, worst.3);
    }
}
