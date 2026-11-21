//! The hood of a hood thrown back (round 161): it hangs behind the neck, over the cape, from the roll the
//! opening's edge lies round the neck as down to a point (the real look: files of its own, see tests/common).

mod common;

use common::{closest, cloth, cross, dist, dot, head, person_of, sub};
use sc_portrait::dress::{Hood, COURT_1356, ENGLAND_1356};
use sc_portrait::pose::pose_of;
use sc_portrait::{build, build_posed, Portrait, Surface};

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

type V3 = [f32; 3];

fn mean(of: impl Iterator<Item = V3>) -> V3 {
    let (sum, n) = of.fold(([0f32; 3], 0), |(a, n), q| ([a[0] + q[0], a[1] + q[1], a[2] + q[2]], n + 1));
    sum.map(|v| v / n.max(1) as f32)
}

fn with<'a>(s: &'a [Surface], image: &str) -> Vec<&'a Surface> {
    s.iter().filter(|s| !s.pos.is_empty() && s.tex.as_deref().is_some_and(|t| t.contains(image))).collect()
}

/// The bag's rows of quads (5 from the edge to the crest and 30 down it) and the quads of a row (hood_back.rs
/// `RISE`, `DOWN`, `ACROSS`).
const ROWS: usize = 35;
const ACROSS: usize = 20;

/// What is read off a hood thrown back and its bag: how far under the cape's highest place the bag's lowest
/// lies, how broad the bag is within 3 cm of its lowest place and at its broadest, how far behind the head's
/// middle its nearest place lies, how far round from straight behind the head its point hangs (radians, as the
/// pose counts a turn), and how many places of the cloth under it stand more than 2 mm out of it: outside the
/// bag's surface where that is nearest to them, which is not at the bag's rim (there the cloth beside the bag is
/// outside it).
struct Hung {
    long: f32,
    point: f32,
    broad: f32,
    behind: f32,
    round: f32,
    through: usize,
}

fn hung(out: &Portrait, image: &str, gown: &str) -> Hung {
    let wool: Vec<&Surface> = with(&out.surfaces, image);
    let (cape, bag) = (wool[0], wool[1]);
    let top = cape.pos.iter().map(|q| q[1]).fold(f32::MIN, f32::max);
    let low = bag.pos.iter().map(|q| q[1]).fold(f32::MAX, f32::min);
    let across = |of: &mut dyn Iterator<Item = &V3>| -> f32 {
        let (lo, hi) = of.fold((f32::MAX, f32::MIN), |(lo, hi), q| (lo.min(q[0]), hi.max(q[0])));
        hi - lo
    };
    let tip = mean(bag.pos.iter().filter(|q| q[1] < low + 0.3).copied());
    let (lo, hi) = bag.pos.iter().fold(([f32::MAX; 3], [f32::MIN; 3]), |(lo, hi), q| (std::array::from_fn(|k| lo[k].min(q[k])), std::array::from_fn(|k| hi[k].max(q[k]))));
    // (a place stands out of the bag where the nearest of the bag lies square under it, and that is not of the
    // bag's rim, which comes round to the cloth beside it)
    let tris: Vec<[V3; 3]> = bag.pos.chunks_exact(3).map(|t| [t[0], t[1], t[2]]).collect();
    let through = [image, gown]
        .iter()
        .filter_map(|name| cloth(out, name))
        .flat_map(|c| c.pos)
        .filter(|q| (0..3).all(|k| q[k] > lo[k] - 0.1 && q[k] < hi[k] + 0.1))
        .filter(|q| {
            let (near, t) = tris.iter().map(|t| (dist(q, &closest(q, t)), t)).min_by(|a, b| a.0.total_cmp(&b.0)).unwrap();
            let (way, faces) = (sub(q, &closest(q, t)), cross(&sub(&t[1], &t[0]), &sub(&t[2], &t[0])));
            let i = tris.iter().position(|o| std::ptr::eq(o, t)).unwrap();
            let within = (1..ROWS - 2).contains(&(i / 2 / ACROSS)) && (3..ACROSS - 3).contains(&(i / 2 % ACROSS));
            within && near > 0.02 && dot(&way, &faces) > 0.9 * near * dot(&faces, &faces).sqrt()
        })
        .count();
    Hung {
        long: top - low,
        point: across(&mut bag.pos.iter().filter(|q| q[1] < low + 0.3)),
        broad: across(&mut bag.pos.iter()),
        behind: bag.pos.iter().map(|q| out.cz - q[2]).fold(f32::MAX, f32::min),
        round: (tip[0] - out.cx).atan2(out.cz - tip[2]),
        through,
    }
}

#[test]
fn a_hood_thrown_back_hangs_behind_the_neck() {
    // A hood thrown back was its cape with the opening's edge round the neck: a collar with no hood behind it.
    // On 120 men of 15 to 68, in the village and at court, as the builder stands them: who wears the hood thrown
    // back has the cape and, drawn after it with the same image, the hood behind the neck; who wears it on the
    // head or wears none has not. The bag's lowest place lies 30 to 36 cm under the cape's highest (32.3 to
    // 34.0 measured), it is 15 to 28 cm broad (17.8 to 24.9) and ends in a point under 3 cm broad (1.4 to 1.8),
    // all of it lies behind the head's middle (9.3 cm and more), its point hangs to the side the shoulders are
    // turned to, and no place of the cape or the gown stands out of it (with the bag laid square on the cloth
    // as it is seen from behind, without the rule that it hangs straight where the cloth falls away and
    // without the mouth held over the roll, 27 of 39 builds had such places, up to 14).
    // (round 163) The file of the hood thrown back is laid anew: its opening lies round the shoulders, a third
    // longer round, and the roll at the nape is 2.4 cm lower (tests/collar.rs). The bag is as broad as the
    // opening lies and is measured from the cape's highest place, so three of its measures went with the file and
    // their bounds with them: 26 to 33 cm under the cape's highest (28.6 to 30.3 measured), 22 to 33 cm broad
    // (25.0 to 30.1), the point under 4 cm (2.0 to 3.2). The builder's rule for the bag is as round 161 wrote it.
    let Some(h) = head() else { return };
    let (mut seen, mut other) = (0, 0);
    for (stand, d) in [(1, &ENGLAND_1356), (3, &COURT_1356)] {
        for k in 0..60u32 {
            let age = [15.0, 24.0, 35.0, 50.0, 58.0, 68.0][k as usize % 6];
            let p = person_of(2 * k + 1, false, age, stand);
            let hood = d.hood_of(false, p.age, p.seed);
            let out = build(&h, &p, 1);
            let Some((_, image)) = d.hood_file(hood, p.seed) else {
                assert!(with(&out.surfaces, d.hood_back).is_empty(), "person {k} of stand {stand}: a hood");
                other += 1;
                continue;
            };
            let wool = with(&out.surfaces, image);
            if hood != Hood::Back {
                assert_eq!(wool.len(), 1, "person {k} of stand {stand}: a hood on the head has nothing behind it");
                other += 1;
                continue;
            }
            assert_eq!(wool.len(), 2, "person {k} of stand {stand}: the cape and the hood behind it");
            assert_eq!(wool[1].pos.len(), 6 * ROWS * ACROSS, "person {k} of stand {stand}: the bag");
            assert!(wool[1].uv.iter().all(|uv| uv[1].abs() > 0.05), "person {k} of stand {stand}: a place of the bag has a hem's place in the image");
            let (m, turn) = (hung(&out, image, d.gown), pose_of(d.pose, p.seed).turn);
            seen += 1;
            if show() {
                println!("stand {stand} person {k}: long {:.3} point {:.3} broad {:.3} behind {:.3} round {:.3} (turned {turn:.3}) through {}", m.long, m.point, m.broad, m.behind, m.round, m.through);
            }
            assert!(m.long > 2.6 && m.long < 3.3, "person {k} of stand {stand}: the bag hangs {} under the cape's top", m.long);
            assert!(m.broad > 2.2 && m.broad < 3.3 && m.point < 0.4, "person {k} of stand {stand}: {} broad, {} at the point", m.broad, m.point);
            assert!(m.behind > 0.6, "person {k} of stand {stand}: the bag's nearest place lies {} behind the head's middle", m.behind);
            assert!(m.round * turn > 0.0, "person {k} of stand {stand}: the point hangs {} round, the shoulders are turned {turn}", m.round);
            assert_eq!(m.through, 0, "person {k} of stand {stand}: places of the cloth under the bag stand out of it");
        }
    }
    assert!(seen >= 15 && other >= 60, "{seen} hoods thrown back, {other} men without");
}

#[test]
fn the_hood_behind_goes_with_the_shoulders() {
    // The bag is laid on the cape while the body stands square, and the pose turns it with the cape (the two
    // tests of tests/pose.rs that hold the head to the digit hold what of the bag lies behind the head). On the
    // men of 40 who wear the hood thrown back, with the shoulders square and turned 0.35 either way: square,
    // the point hangs straight behind the head (within 0.01 radians, seen from the head's middle); turned, 0.25
    // to 0.32 round to that side (0.283 to 0.289 measured: the point lies further from the neck's axis than
    // from the head's middle); and turned as square nothing stands out of the bag.
    let Some(h) = head() else { return };
    let d = &ENGLAND_1356;
    let mut seen = 0;
    for k in 0..40u32 {
        let p = person_of(2 * k + 1, false, 35.0, 1);
        if d.hood_of(false, p.age, p.seed) != Hood::Back {
            continue;
        }
        seen += 1;
        for turn in [-0.35f32, 0.0, 0.35] {
            let out = build_posed(&h, &p, 1, Some([turn, turn, 0.0]));
            let m = hung(&out, d.hood_back, d.gown);
            if show() {
                println!("person {k} turn {turn}: long {:.2} behind {:.2} round {:.3} through {}", m.long, m.behind, m.round, m.through);
            }
            assert!(if turn == 0.0 { m.round.abs() < 0.01 } else { (0.25..0.32).contains(&(m.round * turn.signum())) }, "person {k}, turned {turn}: the point hangs {} round", m.round);
            assert_eq!(m.through, 0, "person {k}, turned {turn}: places of the cloth under the bag stand out of it");
        }
    }
    assert!(seen >= 5, "{seen} hoods thrown back");
}
