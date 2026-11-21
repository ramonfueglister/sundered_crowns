//! (round 163) A hood thrown back lies round the shoulders: the opening its wearer's face looked out of, as long
//! round as on the head, low on the chest in front and off the throat (the real look: a file of its own, see
//! tests/common; `cloth_hood_down` of tools/portrait/pipeline/README.md).

mod common;

use common::{dist, head, person_of, V3};
use sc_portrait::dress::{Hood, COURT_1356};
use sc_portrait::{build, Portrait};

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

/// The corners round the roll of fur along a hood's opening (facing.rs).
const ROUND: usize = 12;

/// The way of the opening's edge on a lord's hood, read off its fur: the middle of each ring of the roll, which
/// lies along the edge a centimetre within it (two triangles for each of the `ROUND` pieces between two rings,
/// each beginning with the first ring's corner). A villager wears the same file without the fur.
fn way(out: &Portrait) -> Vec<V3> {
    let fur = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(COURT_1356.hood_fur))).expect("a lord's hood has fur");
    fur.pos
        .chunks_exact(6 * ROUND)
        .map(|ring| {
            let sum = ring.chunks_exact(6).fold([0f32; 3], |a, quad| [a[0] + quad[0][0], a[1] + quad[0][1], a[2] + quad[0][2]]);
            sum.map(|v| v / ROUND as f32)
        })
        .collect()
}

/// An edge's length round (centimetres).
fn round(way: &[V3]) -> f32 {
    10.0 * (0..way.len()).map(|i| dist(&way[i], &way[(i + 1) % way.len()])).sum::<f32>()
}

#[test]
fn a_hood_thrown_back_lies_round_the_shoulders() {
    // Until round 163 the edge of a hood's opening was 68 to 80 cm round on the head and 51 to 60 thrown back
    // (seven lords): the same hood, a quarter shorter round, and its roll lay on the throat as a neck brace, the
    // fur's middle 2.6 to 2.9 cm under the chin's lowest place in front and 8.2 to 9.9 cm to either side of the
    // head's middle. On 120 lords of 15 to 68, read off the fur: the edge thrown back is 70.9 to 79.6 cm round
    // (mean 75.4; on the head 68.1 to 80.4, mean 74.9), its foremost place lies 5.3 to 7.8 cm under the chin, and
    // it reaches 11.3 to 12.6 cm to either side. Held: over 62 cm round and in the mean within a tenth of the mean
    // on the head, over 4.5 cm under the chin, over 10.5 cm to the side.
    let Some(h) = head() else { return };
    let d = &COURT_1356;
    let (mut on, mut back): (Vec<f32>, Vec<f32>) = (Vec::new(), Vec::new());
    let (mut under, mut aside) = ((f32::MAX, f32::MIN), (f32::MAX, f32::MIN));
    for k in 0..120u32 {
        let age = [15.0, 24.0, 35.0, 50.0, 58.0, 68.0][k as usize % 6];
        let p = person_of(2 * k + 1, false, age, 3);
        let hood = d.hood_of(false, p.age, p.seed);
        if hood == Hood::None {
            continue;
        }
        let out = build(&h, &p, 1);
        let way = way(&out);
        if hood == Hood::Up {
            on.push(round(&way));
            continue;
        }
        let front = way.iter().fold(way[0], |a, q| if q[2] > a[2] { *q } else { a });
        let (low, wide) = (10.0 * (out.chin - front[1]), 10.0 * way.iter().map(|q| (q[0] - out.cx).abs()).fold(0f32, f32::max));
        back.push(round(&way));
        under = (under.0.min(low), under.1.max(low));
        aside = (aside.0.min(wide), aside.1.max(wide));
        assert!(round(&way) > 62.0, "lord {k}: the opening thrown back is {} cm round", round(&way));
        assert!(low > 4.5, "lord {k}: the opening's foremost place lies {low} cm under the chin");
        assert!(wide > 10.5, "lord {k}: the opening reaches {wide} cm to the side");
    }
    assert!(on.len() > 20 && back.len() > 15, "{} hoods on the head, {} thrown back", on.len(), back.len());
    let mean = |of: &[f32]| of.iter().sum::<f32>() / of.len() as f32;
    let range = |of: &[f32]| (of.iter().cloned().fold(f32::MAX, f32::min), of.iter().cloned().fold(f32::MIN, f32::max));
    if show() {
        println!("the opening's edge on the head {:?} cm round (mean {:.1}), thrown back {:?} (mean {:.1}); in front {under:?} cm under the chin, to the side {aside:?} cm", range(&on), mean(&on), range(&back), mean(&back));
    }
    assert!((mean(&back) / mean(&on) - 1.0).abs() < 0.1, "the opening is {} cm round on the head and {} thrown back", mean(&on), mean(&back));
}
