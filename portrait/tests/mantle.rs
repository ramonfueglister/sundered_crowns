//! A crowned head's mantle (round 145): one cloth round the shoulders over the gown, faced with fur along both
//! front edges and round the neck, and held by two brooches with a cord between them (the real look: files of its
//! own, see tests/common).

mod common;

use common::{head, person_of};
use sc_portrait::dress::{COURT_1356, CROWNED_1356, ENGLAND_1356};
use sc_portrait::facing::{HOLLOW, TUFT};
use sc_portrait::mantle::{BROOCH, CORD, MARK};
use sc_portrait::pile::RIM;
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

/// The ermine's image (round 152; tools/portrait/pipeline/README.md): how much of the cloth it covers across the
/// facing and down it (units of 10 cm; mantle.py, `MANTLE_TAILS`), and where its two tails lie in it, across from
/// its left edge and down from its upper one, as fur_tex.py prints them. The tests do not read the image itself.
const COVERS: [f32; 2] = [0.7, 1.0];
const TAILS: [[f32; 4]; 2] = [[0.293, 0.418, 0.084, 0.383], [0.711, 0.818, 0.572, 0.869]];
/// How much of the image, from its upper edge, goes round a rolled hem (tunic_bind.py; the builder knows a hem's
/// triangles by it, real_look.rs).
const HEM: f32 = 0.05;

/// Whether a place in the fur's image lies in a tail or within `by` of one (the image repeats with every whole
/// number, and the stage draws it from its upper edge down).
fn in_a_tail(uv: [f32; 2], by: f32) -> bool {
    let within = |v: f32, lo: f32, hi: f32| [-1.0, 0.0, 1.0].iter().any(|w| v + w > lo - by && v + w < hi + by);
    TAILS.iter().any(|t| within(uv[0].rem_euclid(1.0), t[0], t[1]) && within(uv[1].rem_euclid(1.0), t[2], t[3]))
}

#[test]
fn the_ermines_tails_stand_whole_on_the_facing_and_hang_down_the_cloth() {
    // (round 152) The fur's place in its image is the facing's own: across it from the front edge, down it from the
    // neck. On sixteen crowned heads: where the fur ends (at the red cloth, and where a rolled hem hangs on it) no
    // tail is cut, and none lies on a hem; on the chest the image's way down is the cloth's way down, a tail
    // hangs; the image is drawn about as large as it is made for; and no triangle of the fur is without an area in
    // the image (the stage finds the relief's direction by it, and draws a triangle without one black).
    let Some(h) = head() else { return };
    let sub = |a: &V3, b: &V3| -> V3 { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] };
    let len = |a: V3| (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]).sqrt();
    let none = (f32::MAX, f32::MIN);
    let wide = |r: &mut (f32, f32), v: f32| *r = (r.0.min(v), r.1.max(v));
    let (mut ends, mut cut, mut hems, mut hangs, mut chest, mut flat, mut seen) = (0, 0, 0, 0f32, 0f32, 0, 0);
    let (mut across, mut down, mut tall) = (none, none, 0f32);
    for (k, female, age) in people() {
        let out = build(&h, &person_of(k, female, age, 4), 1);
        let m = parts(&out.surfaces, k);
        let fur = m.fur;
        let level = m.gold.pos.iter().map(|q| q[1]).sum::<f32>() / m.gold.pos.len() as f32;
        // the fur's sides, by their two corners: one that a single triangle has is where the fur ends at the cloth,
        // one that more than two have is where a rolled hem hangs on it
        let bits = |q: &V3| q.map(f32::to_bits);
        let mut sides: std::collections::HashMap<([u32; 3], [u32; 3]), u32> = std::collections::HashMap::new();
        let side = |a: &V3, b: &V3| if bits(a) < bits(b) { (bits(a), bits(b)) } else { (bits(b), bits(a)) };
        for t in (0..fur.pos.len()).step_by(3) {
            for c in 0..3 {
                *sides.entry(side(&fur.pos[t + c], &fur.pos[t + (c + 1) % 3])).or_insert(0) += 1;
            }
        }
        let (mut size_a, mut size_d, mut weight) = (0f32, 0f32, 0f32);
        for t in (0..fur.pos.len()).step_by(3) {
            for c in 0..3 {
                let (a, b) = (t + c, t + (c + 1) % 3);
                // (as far as a picture shows it, to 24 cm under the chin: the facing's columns that lie over an arm
                // end at the arm's end, in the middle of the image, 25 cm under the chin of a child of five and
                // 40 cm under a grown person's)
                if sides[&side(&fur.pos[a], &fur.pos[b])] != 2 && fur.pos[a][1].min(fur.pos[b][1]) > out.chin - 2.4 {
                    ends += 1;
                    let half = [(fur.uv[a][0] + fur.uv[b][0]) / 2.0, (fur.uv[a][1] + fur.uv[b][1]) / 2.0];
                    let in_one = [fur.uv[a], fur.uv[b], half].iter().any(|&uv| in_a_tail(uv, 0.03));
                    cut += usize::from(in_one);
                    if !show() {
                        assert!(!in_one, "person {k}: a tail at the fur's end, {:?} to {:?} in the image", fur.uv[a], fur.uv[b]);
                    }
                }
            }
            // the triangle on the cloth and in the image: which way on the cloth the image goes across and up
            let (e1, e2) = (sub(&fur.pos[t + 1], &fur.pos[t]), sub(&fur.pos[t + 2], &fur.pos[t]));
            let (d1, d2) = ([fur.uv[t + 1][0] - fur.uv[t][0], fur.uv[t + 1][1] - fur.uv[t][1]], [fur.uv[t + 2][0] - fur.uv[t][0], fur.uv[t + 2][1] - fur.uv[t][1]]);
            let det = d1[0] * d2[1] - d2[0] * d1[1];
            let area = len([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]) / 2.0;
            let hem = (0..3).all(|c| fur.uv[t + c][1].abs() <= HEM);
            // (a hem's image is laid along the hem, two of the cloth's lengths to one of the image's)
            if det.abs() * COVERS[0] * COVERS[1] / 2.0 < if hem { 0.002 } else { 0.02 } * area {
                flat += 1;
                assert!(show(), "person {k}: a triangle of the fur at {:?} without an area in the image", fur.pos[t]);
                continue;
            }
            if hem {
                hems += 1;
                assert!(!(0..3).any(|c| in_a_tail(fur.uv[t + c], 0.02)), "person {k}: a tail on a hem");
                continue;
            }
            let to_right: V3 = std::array::from_fn(|i| (e1[i] * d2[1] - e2[i] * d1[1]) / det);
            let down_way: V3 = std::array::from_fn(|i| (e2[i] * d1[0] - e1[i] * d2[0]) / det);
            // on the chest, in front, from under the brooches down to the picture's lower edge
            let front = (0..3).all(|c| fur.pos[t + c][2] > out.cz && fur.pos[t + c][1] < level - 0.3 && fur.pos[t + c][1] > out.chin - 2.4);
            // (within the image across, the whole triangle of the file: the pile divides each in four, pile.rs, and
            // the strip along the front edge, where the image lies some five times as broad, stays out as it did)
            let file = t / 12 * 12;
            if front && (file..file + 12).all(|i| fur.uv[i][0] > 0.0 && fur.uv[i][0] < 1.0) {
                chest += area;
                hangs += area * f32::from(down_way[1] < -0.7 * len(down_way));
                size_a += area * len(to_right);
                size_d += area * len(down_way);
                weight += area;
            }
        }
        assert!(weight > 0.5, "person {k}: {weight} of fur on the chest");
        wide(&mut across, size_a / weight);
        wide(&mut down, size_d / weight);
        // (the image is made for 7 cm across the facing where the mantle's sheet stands 12.5 cm off the body's axis,
        // and for 10 cm down it, on the base body: on a grown person's chest the facing is broader than that, and a
        // child's mantle is smaller all round; a woman's is narrower across for its length than a man's)
        // (round 165: read on the fur's pile, which lies 2 to 8 mm over the sheet in tufts: a tuft's slopes are
        // longer than the sheet under them, and where the sheet is round across, most on a child's shoulders, so
        // is the pile's top. The image covered 0.66 to 1.13 across and 0.64 to 1.18 down on the sheet and covers
        // 0.75 to 1.19 and 0.67 to 1.23 on the pile; across for its length 0.74 to 1.07 then and 0.78 to 1.13
        // now, on a child of five the most: held to 1.15, was 1.1)
        let (a, d) = (size_a / weight, size_d / weight);
        tall = tall.max(a / d * COVERS[1] / COVERS[0]);
        if !show() {
            assert!(a > 0.6 && a < 1.2 && d > 0.6 && d < 1.25 && a / d > 0.7 && a / d < 1.15, "person {k}: the image covers {a} by {d} of the cloth");
        }
        seen += 1;
    }
    if show() {
        println!("{seen} mantles: {ends} sides where the fur ends, {cut} of them in a tail; {hems} triangles of hems; {flat} triangles without an area in the image");
        println!("on the chest: {:.3} of the fur's image hangs down the cloth; the image covers {:.2}..{:.2} across and {:.2}..{:.2} down, a tail at most {tall:.2} times as broad for its length as in the image", hangs / chest, across.0, across.1, down.0, down.1);
    }
    assert!(ends > 16 * 300 && hems > 16 * 1000 && hangs > 0.9 * chest, "{ends} sides where the fur ends, {hems} triangles of hems, {hangs} of {chest} of the chest's fur hangs");
}

#[test]
fn the_fur_has_a_pile() {
    // (round 165) The fur was a part of the sheet, as flat as the cloth beside it. Now each of the file's triangles
    // is four (pile.rs), and the fur lies in tufts over the sheet: where the middle of a side of the file is darker
    // than the side's ends it lies under the line between them, the way the fur faces, and where it is lighter
    // over it (21 292 of 21 738 such sides on sixteen furs, away from the fur's border, where the pile rises from
    // the sheet), by as much as a tuft is high for the whole step from a hollow to a top (0.055 to 0.065; `TUFT`
    // is 0.06). Where the fur ends at the cloth it is not lifted: its border's corners there are the cloth's. A
    // rolled hem keeps its form: the middle of each of its sides lies between the side's ends.
    let Some(h) = head() else { return };
    let bits = |q: &V3| q.map(f32::to_bits);
    let sub = |a: &V3, b: &V3| -> V3 { [a[0] - b[0], a[1] - b[1], a[2] - b[2]] };
    let dot = |a: &V3, b: &V3| a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    let (mut fewest, mut loose, mut borders, mut lower, mut steps, mut high, mut bent, mut seen) = (usize::MAX, 0, 0, 0, 0, (f32::MAX, f32::MIN), 0f32, 0);
    for (k, female, age) in people() {
        let out = build(&h, &person_of(k, female, age, 4), 1);
        let m = parts(&out.surfaces, k);
        let fur = m.fur;
        assert_eq!(fur.pos.len() % 12, 0, "person {k}: four triangles for each of the file's");
        fewest = fewest.min(fur.pos.len() / 3);
        let mut sides: std::collections::HashMap<([u32; 3], [u32; 3]), u32> = std::collections::HashMap::new();
        let side = |a: &V3, b: &V3| if bits(a) < bits(b) { (bits(a), bits(b)) } else { (bits(b), bits(a)) };
        for t in (0..fur.pos.len()).step_by(3) {
            for c in 0..3 {
                *sides.entry(side(&fur.pos[t + c], &fur.pos[t + (c + 1) % 3])).or_insert(0) += 1;
            }
        }
        // the fur's border: the sides one triangle has. Half a side of the file each, from a corner of the file's
        // triangle (in pile.rs's order a triangle's 1st, 5th and 9th of twelve) to the side's middle: at the cloth
        // the corner is a corner of the cloth, and the middle lies on the cloth's side
        let cloth: std::collections::HashSet<[u32; 3]> = m.cloth.pos.iter().map(bits).collect();
        let mut border: Vec<V3> = Vec::new();
        for t in (0..fur.pos.len()).step_by(3) {
            for c in 0..3 {
                let (a, b) = (t + c, t + (c + 1) % 3);
                if sides[&side(&fur.pos[a], &fur.pos[b])] == 1 {
                    let corner = if a % 12 % 4 == 0 { a } else { b };
                    assert!(corner % 12 % 4 == 0, "person {k}: a side on the border between two middles");
                    border.push(fur.pos[corner]);
                    borders += 1;
                    loose += usize::from(!cloth.contains(&bits(&fur.pos[corner])));
                }
            }
        }
        let light = fur.col.iter().map(|c| c[1]).fold(0f32, f32::max);
        let hem = |t: usize| (t..t + 12).all(|i| fur.uv[i][1].abs() <= HEM);
        let (mut drop, mut shade) = (0f32, 0f32);
        for t in (0..fur.pos.len()).step_by(12) {
            let away = (0..3).all(|c| border.iter().all(|q| dist(q, &fur.pos[t + 4 * c]) > 2.0 * RIM));
            for (mid, a, b) in [(1, 0, 4), (5, 4, 8), (2, 8, 0)] {
                let between: V3 = std::array::from_fn(|i| (fur.pos[t + a][i] + fur.pos[t + b][i]) / 2.0);
                if hem(t) {
                    bent = bent.max(dist(&fur.pos[t + mid], &between));
                } else if away {
                    // how much darker the middle of a side is than its ends, in the whole step from a top to a
                    // hollow, and how far it lies under the line between them, the way the fur faces
                    let darker = ((fur.col[t + a][1] + fur.col[t + b][1]) / 2.0 - fur.col[t + mid][1]) / (HOLLOW * light);
                    let faces = &fur.nrm[t + mid];
                    let under = dot(&sub(&between, &fur.pos[t + mid]), faces) / dot(faces, faces).sqrt();
                    if darker.abs() > 0.05 {
                        steps += 1;
                        lower += usize::from(darker * under > 0.0);
                    }
                    drop += darker * under;
                    shade += darker * darker;
                }
            }
        }
        assert!(shade > 0.0, "person {k}: fur of one lightness");
        high = (high.0.min(drop / shade), high.1.max(drop / shade));
        seen += 1;
    }
    if show() {
        println!("{seen} furs of at least {fewest} triangles; of {borders} half sides on the fur's border {loose} not at a corner of the cloth; of {steps} sides whose middle is darker or lighter than their ends {lower} have it lower or higher; a tuft {:.3}..{:.3} high; a hem's side bent by at most {bent:.5}", high.0, high.1);
    }
    assert!(fewest > 16_000, "a fur of {fewest} triangles");
    // (on each fur 96 of 402 half sides lie on the sheet's own rim, where no cloth goes on)
    assert!(3 * loose < borders, "of {borders} half sides on the fur's border {loose} not at a corner of the cloth");
    assert!(steps > 16 * 300 && 10 * lower > 9 * steps, "of {steps} sides whose middle is darker or lighter than their ends {lower} have it lower or higher");
    assert!(high.0 > 0.7 * TUFT && high.1 < 1.3 * TUFT, "a tuft {high:?} high");
    assert!(bent < 1e-4, "a hem's side bent by {bent}");
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
