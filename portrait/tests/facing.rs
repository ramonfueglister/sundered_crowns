//! A lord's hood faced with fur (round 148): a roll of white fur along the edge of the hood's opening, round the
//! face of a hood on the head and round the neck of one thrown back (the real look: files of its own, see
//! tests/common).

mod common;

use common::{head, person_of};
use sc_portrait::dress::{Hood, COURT_1356, ENGLAND_1356};
use sc_portrait::facing::{BEYOND, BREADTH, PILE, PILE_MOST};
use sc_portrait::{build, Surface};

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

type V3 = [f32; 3];

fn sub(a: V3, b: V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn dot(a: V3, b: V3) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn len(a: V3) -> f32 {
    dot(a, a).sqrt()
}

fn mean(of: &[V3]) -> V3 {
    let sum = of.iter().fold([0f32; 3], |a, q| [a[0] + q[0], a[1] + q[1], a[2] + q[2]]);
    sum.map(|v| v / of.len().max(1) as f32)
}

fn with<'a>(s: &'a [Surface], image: &str) -> Vec<&'a Surface> {
    s.iter().filter(|s| !s.pos.is_empty() && s.tex.as_deref().is_some_and(|t| t.contains(image))).collect()
}

/// The corners along the edge of a hood's opening in the files (tools/portrait/pipeline/README.md: the hood on
/// the head, closed under the chin, and the hood thrown back), the corners round the roll (facing.rs), and the
/// files' triangles, plain and dagged (tests/hood.rs).
const EDGE: [usize; 2] = [114, 96];
const ROUND: usize = 12;
const PLAIN: [usize; 2] = [11980, 5568];
const DAGGED: [usize; 2] = [12004, 6275];

/// The roll's rings: the corners round it at each place along the edge (two triangles for each of the `ROUND`
/// pieces between two rings, each beginning with the first ring's corner).
fn rings(fur: &Surface) -> Vec<Vec<V3>> {
    fur.pos.chunks_exact(6 * ROUND).map(|ring| ring.chunks_exact(6).map(|quad| quad[0]).collect()).collect()
}

#[test]
fn a_lords_hood_is_faced_with_fur_and_a_villagers_is_not() {
    // Only the court's table has a fur for its hoods. On 120 men of 15 to 68: a lord who wears a hood, on the
    // head or thrown back, has one roll of fur with a ring for every corner of the opening's edge, and the hood
    // under it is whole, plain or dagged; the same man as a villager, a lord without a hood, a crowned head and a
    // lady have none. The fur is pale and nearly without colour, lighter than the wool it lies on.
    assert!(ENGLAND_1356.hood_fur.is_empty() && !COURT_1356.hood_fur.is_empty());
    let Some(h) = head() else { return };
    let d = &COURT_1356;
    let (mut seen, mut bare) = ([0, 0], 0);
    let (mut pale, mut strong) = ((f32::MAX, f32::MIN), f32::MIN);
    for k in 0..120u32 {
        let age = [15.0, 24.0, 35.0, 50.0, 58.0, 68.0][k as usize % 6];
        let p = person_of(2 * k + 1, false, age, 3);
        let hood = d.hood_of(false, p.age, p.seed);
        let out = build(&h, &p, 1);
        let furs = with(&out.surfaces, d.hood_fur);
        let Some((file, image)) = d.hood_file(hood, p.seed) else {
            assert!(furs.is_empty(), "person {k}: fur without a hood");
            bare += 1;
            continue;
        };
        let back = usize::from(hood == Hood::Back);
        seen[back] += 1;
        assert_eq!(furs.len(), 1, "person {k}: the hood's fur");
        assert_eq!(furs[0].pos.len(), 6 * ROUND * EDGE[back], "person {k}: a ring for every corner of the edge");
        let wool = with(&out.surfaces, image);
        assert_eq!(wool.len(), 1, "person {k}: the hood");
        assert_eq!(wool[0].pos.len(), 3 * if file == d.hood_dagged[back] { DAGGED[back] } else { PLAIN[back] }, "person {k}: the hood under the fur is whole");
        // (of the roll's upper side: the side that lies on the wool is drawn darker)
        let light = |c: &[f32; 3]| 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        let top = furs[0].col.iter().map(light).fold(f32::MIN, f32::max);
        let fur = mean(&furs[0].col.iter().filter(|c| light(c) > 0.99 * top).copied().collect::<Vec<_>>());
        let dye = mean(&wool[0].col);
        let strength = fur.iter().cloned().fold(f32::MIN, f32::max) / fur.iter().cloned().fold(f32::MAX, f32::min);
        pale = (pale.0.min(light(&fur)), pale.1.max(light(&fur)));
        strong = strong.max(strength);
        assert!(light(&fur) > 0.7 && strength < 1.25 && light(&fur) > 2.0 * light(&dye), "person {k}: fur {fur:?} on wool {dye:?}");
        // nobody else
        for (stand, female) in [(1, false), (4, false), (3, true)] {
            let out = build(&h, &person_of(2 * k + 1 - u32::from(female), female, age, stand), 1);
            assert!(with(&out.surfaces, d.hood_fur).is_empty(), "person {k} of stand {stand}, female {female}: fur");
        }
    }
    assert!(seen[0] > 20 && seen[1] > 15 && bare > 15, "{seen:?} hoods and {bare} lords without");
    if show() {
        println!("{} lords with a hood on the head, {} with one thrown back, {bare} without; the fur's light {:.2} to {:.2}, its colour's strength at most {strong:.2}", seen[0], seen[1], pale.0, pale.1);
    }
}

#[test]
fn the_fur_lies_on_the_wool_along_the_opening_and_leaves_the_face_free() {
    // On the same men: a hood on the head has its fur round the face, from under the chin to over the brow and on
    // both sides, and nothing of it before the face from 4.5 cm over the chin to 19 cm over it; a hood thrown back has it round the neck, under the
    // chin in front and up to the nape behind. Either way the roll lies on the hood (no corner of it further from the wool than the roll is thick
    // and broad), it is no broader and no thicker than facing.rs says, and no corner of the wool under its middle
    // stands through its top.
    let Some(h) = head() else { return };
    let d = &COURT_1356;
    let wide = |r: &mut (f32, f32), v: f32| *r = (r.0.min(v), r.1.max(v));
    let none = (f32::MAX, f32::MIN);
    let (mut under, mut over, mut side, mut brow, mut jaw, mut neck, mut off, mut broad, mut thick, mut through) = (none, none, none, none, none, none, none, none, none, none);
    let mut seen = [0, 0];
    for k in 0..120u32 {
        let p = person_of(2 * k + 1, false, [15.0, 24.0, 35.0, 50.0, 58.0, 68.0][k as usize % 6], 3);
        let hood = d.hood_of(false, p.age, p.seed);
        let Some((_, image)) = d.hood_file(hood, p.seed) else { continue };
        let out = build(&h, &p, 1);
        let (fur, wool) = (with(&out.surfaces, d.hood_fur)[0], with(&out.surfaces, image)[0]);
        let ys = fur.pos.iter().map(|q| q[1]).fold(none, |r, y| (r.0.min(y), r.1.max(y)));
        let xs = fur.pos.iter().map(|q| q[0] - out.cx).fold(none, |r, x| (r.0.min(x), r.1.max(x)));
        seen[usize::from(hood == Hood::Back)] += 1;
        if hood == Hood::Up {
            // before the face's middle, a hand broad: how high the roll under the chin comes, and how low the
            // roll over the brow
            let high = fur.pos.iter().filter(|q| (q[0] - out.cx).abs() < 0.4 && q[1] < out.chin + 1.0).map(|q| q[1]).fold(f32::MIN, f32::max);
            let low = fur.pos.iter().filter(|q| (q[0] - out.cx).abs() < 0.3 && q[1] > out.chin + 1.0).map(|q| q[1]).fold(f32::MAX, f32::min);
            wide(&mut under, ys.0 - out.chin);
            wide(&mut over, ys.1 - out.chin);
            wide(&mut side, xs.0.abs().min(xs.1));
            wide(&mut brow, low - out.chin);
            wide(&mut jaw, high - out.chin);
            if !show() {
                assert!(high < out.chin + 0.45, "person {k}: the fur's upper rim {high} before the chin at {}", out.chin);
                assert!(ys.0 < out.chin && ys.0 > out.chin - 1.0 && ys.1 > out.chin + 1.9, "person {k}: fur from {} to {}, the chin at {}", ys.0, ys.1, out.chin);
                assert!(xs.0 < -0.8 && xs.1 > 0.8, "person {k}: fur from {} to {} of the middle", xs.0, xs.1);
                assert!(low > out.chin + 1.9, "person {k}: the fur's lower rim {low} over the brow, the chin at {}", out.chin);
            }
        } else {
            wide(&mut neck, ys.1 - out.chin);
            if !show() {
                assert!(ys.1 < out.chin + 0.9 && ys.0 > out.chin - 1.6, "person {k}: fur from {} to {}, the chin at {}", ys.0, ys.1, out.chin);
                assert!(xs.0 < -0.6 && xs.1 > 0.6, "person {k}: fur from {} to {} of the middle", xs.0, xs.1);
            }
        }
        // on the wool, and no corner of the wool through the roll's top
        let rings = rings(fur);
        for (i, ring) in rings.iter().enumerate() {
            let c = mean(ring);
            // (round the roll: the first corner furthest in the wool, a quarter on the top, half round beyond the
            // edge, three quarters under)
            let (across, tall) = (len(sub(ring[0], ring[ROUND / 2])), len(sub(ring[ROUND / 4], ring[3 * ROUND / 4])));
            let up = sub(ring[ROUND / 4], ring[3 * ROUND / 4]).map(|v| v / tall);
            let top = dot(sub(ring[ROUND / 4], c), up);
            let (mut near, mut highest) = (f32::MAX, f32::MIN);
            for q in &wool.pos {
                let to = sub(*q, c);
                near = near.min(len(to));
                if len(to) < 0.1 {
                    highest = highest.max(dot(to, up) - top);
                }
            }
            wide(&mut off, near);
            wide(&mut broad, across);
            wide(&mut thick, tall);
            if highest > f32::MIN {
                wide(&mut through, highest);
            }
            if !show() {
                assert!(near < 0.12, "person {k}, ring {i}: the roll's middle {near} from the wool");
                assert!((across - (BREADTH + BEYOND)).abs() < 0.01, "person {k}, ring {i}: the roll {across} broad");
                assert!(tall > PILE && tall < PILE_MOST + 0.04, "person {k}, ring {i}: the roll {tall} thick");
                assert!(highest < 0.0, "person {k}, ring {i}: wool {highest} over the roll's top");
            }
        }
    }
    assert!(seen[0] > 20 && seen[1] > 15, "{seen:?} hoods");
    if show() {
        println!("on the head ({}): fur from {:.2}..{:.2} under the chin to {:.2}..{:.2} over it, to the sides at least {:.2}, its lower rim at the brow {:.2}..{:.2} over the chin, its upper rim before the chin {:.2}..{:.2} over it", seen[0], under.0, under.1, over.0, over.1, side.0, brow.0, brow.1, jaw.0, jaw.1);
        println!("thrown back ({}): the fur's top {:.2}..{:.2} over the chin", seen[1], neck.0, neck.1);
        println!("the roll's middle {:.3}..{:.3} from the wool, {:.3}..{:.3} broad, {:.3}..{:.3} thick; the wool under its middle {:.3}..{:.3} over its top", off.0, off.1, broad.0, broad.1, thick.0, thick.1, through.0, through.1);
    }
}
