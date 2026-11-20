//! A man's hood with its cape's hem dagged (round 136): three hoods in ten have the hem cut into tongues
//! (the real look: a file of its own, see tests/common).

mod common;

use common::{head, person};
use sc_portrait::build;
use sc_portrait::dress::{Hood, ENGLAND_1356, PLAIN_1356};
use std::collections::HashMap;

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

/// The files' triangles (tools/portrait/pipeline/README.md): the plain hood on the head and thrown back, and
/// the same with the hem dagged.
const PLAIN: [usize; 2] = [11980, 5568];
const DAGGED: [usize; 2] = [12004, 6275];

#[test]
fn three_hoods_in_ten_are_dagged() {
    let d = &ENGLAND_1356;
    let dagged = |hood: Hood, s: u32| d.hood_file(hood, s).map(|(file, _)| file) == Some(d.hood_dagged[usize::from(hood == Hood::Back)]);
    let n = (0..100_000u32).filter(|&s| dagged(Hood::Up, s)).count();
    assert!((29_000..31_000).contains(&n), "{n} of 100 000 hoods dagged");
    // the same men whether the hood is on the head or thrown back, and whatever the seed's last digit says
    assert!((0..100_000u32).all(|s| dagged(Hood::Up, s) == dagged(Hood::Back, s)));
    for digit in 0..10u32 {
        let n = (0..100_000u32).filter(|s| s % 10 == digit && dagged(Hood::Up, *s)).count();
        assert!((2_700..3_300).contains(&n), "{n} of 10 000 hoods dagged where the seed ends in {digit}");
    }
    // a hood is drawn with the plain hood's image either way; no hood, no file
    assert!((0..1000u32).all(|s| d.hood_file(Hood::Up, s).unwrap().1 == d.hood_up && d.hood_file(Hood::Back, s).unwrap().1 == d.hood_back && d.hood_file(Hood::None, s).is_none()));
    assert!((0..1000u32).all(|s| PLAIN_1356.hood_file(Hood::Up, s) == Some((PLAIN_1356.hood_up, PLAIN_1356.hood_up))));
}

#[test]
fn a_dagged_cape_ends_in_tongues_where_the_plain_one_ends_in_its_hem() {
    // On 150 men of 15 to 68: who draws the dagged hood by his seed has that file and nobody else, drawn
    // with the plain hood's image. A plain hood has no open edge (its edges are rolled hems, tubes); the
    // dagged one's open edge is the cut round its tongues: more than twice as long as the hem was, and it
    // rises and falls by the tongues' depth; and the cape hangs as far down under the chin as a plain one.
    let Some(h) = head() else { return };
    let d = &ENGLAND_1356;
    let (mut with, mut without) = ([0, 0], [0, 0]);
    let (mut reach, mut cut, mut deep) = ([(f32::MAX, f32::MIN); 2], (f32::MAX, f32::MIN), (f32::MAX, f32::MIN));
    for k in 0..150 {
        let p = person(2 * k + 1, false, [15.0, 24.0, 35.0, 50.0, 58.0, 68.0][k as usize % 6]);
        let hood = d.hood_of(false, p.age, p.seed);
        let Some((file, image)) = d.hood_file(hood, p.seed) else { continue };
        let back = usize::from(hood == Hood::Back);
        let dagged = file == d.hood_dagged[back];
        let out = build(&h, &p, 1);
        let s = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(image))).unwrap_or_else(|| panic!("person {k}: no hood"));
        assert_eq!(s.pos.len(), 3 * if dagged { DAGGED[back] } else { PLAIN[back] }, "person {k}: dagged {dagged}, thrown back {back}");
        // the open edge: every side of a triangle that no other triangle has
        let key = |q: &[f32; 3]| [q[0].to_bits(), q[1].to_bits(), q[2].to_bits()];
        let mut sides: HashMap<([u32; 3], [u32; 3]), (u32, [f32; 3], [f32; 3])> = HashMap::new();
        for t in s.pos.chunks_exact(3) {
            for i in 0..3 {
                let (a, b) = (t[i], t[(i + 1) % 3]);
                let (ka, kb) = (key(&a), key(&b));
                sides.entry(if ka < kb { (ka, kb) } else { (kb, ka) }).or_insert((0, a, b)).0 += 1;
            }
        }
        let open: Vec<_> = sides.values().filter(|e| e.0 == 1).collect();
        let long: f32 = open.iter().map(|e| (0..3).map(|a| (e.1[a] - e.2[a]).powi(2)).sum::<f32>().sqrt()).sum();
        let low = s.pos.iter().map(|q| q[1]).fold(f32::MAX, f32::min);
        let wide = |r: &mut (f32, f32), v: f32| *r = (r.0.min(v), r.1.max(v));
        wide(&mut reach[usize::from(dagged)], out.chin - low);
        if dagged {
            with[back] += 1;
            // (in front, where the hem hangs level: how far the open edge rises over its lowest place)
            let front = open.iter().filter(|e| e.1[2] > 0.6 && e.1[0].abs() < 1.2).map(|e| e.1[1]).fold((f32::MAX, f32::MIN), |r, y| (r.0.min(y), r.1.max(y)));
            wide(&mut cut, long);
            wide(&mut deep, front.1 - front.0);
            if !show() {
                assert!(long > 22.0 && long < 40.0, "person {k}: an open edge of {long}");
                assert!(front.1 - front.0 > 0.3 && front.1 - front.0 < 0.95, "person {k}: the edge rises by {}", front.1 - front.0);
            }
        } else {
            without[back] += 1;
            assert!(open.is_empty(), "person {k}: a plain hood with {} open sides, {long} long", open.len());
        }
    }
    if show() {
        println!("dagged {with:?} (on the head, thrown back), plain {without:?}; the cape's lowest place under the frame's chin: plain {:.2} to {:.2}, dagged {:.2} to {:.2}; the cut {:.1} to {:.1} long, rising {:.2} to {:.2} in front", reach[0].0, reach[0].1, reach[1].0, reach[1].1, cut.0, cut.1, deep.0, deep.1);
        return;
    }
    assert!(with[0] >= 4 && with[1] >= 4 && without[0] >= 10 && without[1] >= 10, "dagged {with:?}, plain {without:?}");
    assert!(reach[1].0 > reach[0].0 - 0.2 && reach[1].1 < reach[0].1 + 0.2, "the cape under the chin: plain {:?}, dagged {:?}", reach[0], reach[1]);
}
