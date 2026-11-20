//! How a woman's gown of England 1356 is closed in front (round 129): with a lace or with buttons of its own
//! cloth, laid on the gown as it lies on her (the real look: a file of its own, see tests/common).

mod common;

use common::{head, person};
use sc_portrait::dress::{ENGLAND_1356, PLAIN_1356};
use sc_portrait::fasten::{Fasten, BUTTON, BUTTONS, EYELETS, EYELET_IN, LACE, LACE_SLANT};
use sc_portrait::{build_posed, Surface};

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

fn far(a: &[f32; 3], b: &[f32; 3]) -> f32 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
}

fn middle(q: &[[f32; 3]]) -> [f32; 3] {
    let n = q.len() as f32;
    q.iter().fold([0.0; 3], |a, c| [a[0] + c[0] / n, a[1] + c[1] / n, a[2] + c[2] / n])
}

/// How far the place `p` is from the triangle (a, b, c) (Ericson 2005, Real-Time Collision Detection, 5.1.5).
fn off_triangle(p: &[f32; 3], a: &[f32; 3], b: &[f32; 3], c: &[f32; 3]) -> f32 {
    let sub = |x: &[f32; 3], y: &[f32; 3]| [x[0] - y[0], x[1] - y[1], x[2] - y[2]];
    let dot = |x: [f32; 3], y: [f32; 3]| x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
    let at = |v: f32, w: f32| far(p, &std::array::from_fn(|i| a[i] + v * (b[i] - a[i]) + w * (c[i] - a[i])));
    let (ab, ac, ap) = (sub(b, a), sub(c, a), sub(p, a));
    let (d1, d2) = (dot(ab, ap), dot(ac, ap));
    if d1 <= 0.0 && d2 <= 0.0 {
        return at(0.0, 0.0);
    }
    let bp = sub(p, b);
    let (d3, d4) = (dot(ab, bp), dot(ac, bp));
    if d3 >= 0.0 && d4 <= d3 {
        return at(1.0, 0.0);
    }
    let vc = d1 * d4 - d3 * d2;
    if vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0 {
        return at(d1 / (d1 - d3), 0.0);
    }
    let cp = sub(p, c);
    let (d5, d6) = (dot(ab, cp), dot(ac, cp));
    if d6 >= 0.0 && d5 <= d6 {
        return at(0.0, 1.0);
    }
    let vb = d5 * d2 - d1 * d6;
    if vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0 {
        return at(0.0, d2 / (d2 - d6));
    }
    let va = d3 * d6 - d5 * d4;
    if va <= 0.0 && d4 - d3 >= 0.0 && d5 - d6 >= 0.0 {
        let w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        return at(1.0 - w, w);
    }
    let k = 1.0 / (va + vb + vc);
    at(vb * k, vc * k)
}

/// The pieces a fastening's surface begins with (`of` triangles each, none further than `reach` from its middle):
/// their middles.
fn pieces(s: &Surface, of: usize, reach: f32) -> Vec<[f32; 3]> {
    s.pos.chunks_exact(of * 3).map(|c| (middle(c), c)).take_while(|(m, c)| c.iter().all(|q| far(q, m) < reach)).map(|(m, _)| m).collect()
}

#[test]
fn half_the_women_are_laced_and_two_in_ten_buttoned_from_fourteen() {
    let d = &ENGLAND_1356;
    let count = |age: f32, female: bool, kind: Fasten| (0..1_000_000u32).filter(|&s| d.fasten_of(female, age, s) == kind).count();
    assert_eq!((count(14.0, true, Fasten::Laced), count(60.0, true, Fasten::Laced), count(14.0, true, Fasten::Buttons), count(60.0, true, Fasten::Buttons)), (500_000, 500_000, 200_000, 200_000));
    // a girl's gown and a man's are pulled over the head, and so is every gown of the dress without a table
    assert_eq!((count(13.0, true, Fasten::None), count(30.0, false, Fasten::None)), (1_000_000, 1_000_000));
    assert!((0..1000).all(|s| PLAIN_1356.fasten_of(true, 30.0, s) == Fasten::None));
}

#[test]
fn lace_and_buttons_lie_on_the_gown_down_its_front() {
    // On forty women and girls of 10 to 68 and ten men (heads and bodies of every form the pool has), standing
    // as their seed turns them: who has a lace or buttons by her seed has them and nobody else. The fastening
    // is of the gown's cloth (its image); every one of its triangles is wound as its corners face; the buttons
    // are balls of 11 mm whose middles stand a third of a ball off the gown (neither sunk in it nor floating),
    // 2 cm from one to the next, ten of them and more; the lace crosses 2 cm apart, each way across as long as
    // from eyelet to eyelet and lying on the gown, eight of them and more; between the laced edges lies linen, in
    // the smock's image.
    let Some(h) = head() else { return };
    let (mut laced, mut buttoned, mut plain) = (0, 0, 0);
    for k in 0..50u32 {
        let (female, age) = (k < 40, [10.0, 14.0, 17.0, 24.0, 35.0, 50.0, 68.0][(k % 7) as usize]);
        let p = person(2 * k + if female { 0 } else { 1 }, female, age);
        let kind = ENGLAND_1356.fasten_of(female, age, p.seed);
        let out = build_posed(&h, &p, 1, None);
        let of = |name: &str| out.surfaces.iter().filter(|s| s.tex.as_deref().is_some_and(|t| t.contains(name))).collect::<Vec<_>>();
        let (gowns, linens) = (of(ENGLAND_1356.gown), of(ENGLAND_1356.under[0]));
        let wimpled = female && age >= ENGLAND_1356.wimple_from;
        assert_eq!(gowns.len(), if kind == Fasten::None { 1 } else { 2 }, "person {k} of {age}: {kind:?}");
        // (linen: her smock or his shirt at the neck, none under a wimple; and what shows between laced edges)
        assert_eq!(linens.len(), usize::from(!wimpled) + usize::from(kind == Fasten::Laced), "person {k} of {age}: {kind:?}");
        if kind == Fasten::None {
            plain += 1;
            continue;
        }
        let (gown, f) = (gowns[0], gowns[1]);
        assert!(f.pos.len() == f.nrm.len() && f.pos.len() == f.uv.len() && f.pos.len() == f.col.len());
        // wound as its corners face
        let inward = f.pos.chunks_exact(3).zip(f.nrm.chunks_exact(3)).filter(|(t, n)| {
            let e = |a: [f32; 3], b: [f32; 3]| [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
            let (u, v) = (e(t[1], t[0]), e(t[2], t[0]));
            let c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
            (0..3).map(|a| c[a] * (n[0][a] + n[1][a] + n[2][a])).sum::<f32>() <= 0.0
        }).count();
        // on the gown: how far each piece's middle is from the gown's triangles near it
        let (lo, hi) = f.pos.iter().fold(([f32::MAX; 3], [f32::MIN; 3]), |(lo, hi), q| (std::array::from_fn(|a| lo[a].min(q[a])), std::array::from_fn(|a| hi[a].max(q[a]))));
        let near: Vec<&[[f32; 3]]> = gown.pos.chunks_exact(3).filter(|t| t.iter().any(|q| (0..3).all(|a| q[a] > lo[a] - 0.3 && q[a] < hi[a] + 0.3))).collect();
        let off_gown = |at: &[[f32; 3]]| at.iter().map(|m| near.iter().map(|t| off_triangle(m, &t[0], &t[1], &t[2])).fold(f32::MAX, f32::min)).fold((f32::MAX, f32::MIN), |(lo, hi), d| (lo.min(d), hi.max(d)));
        let (n, step, size, off) = match kind {
            Fasten::Buttons => {
                // (the topmost lies where the neck's twist ends, pose.rs, and is turned with it: round to 5 %)
                let at = pieces(f, 80, 1.05 * BUTTON);
                let round = f.pos[..at.len() * 240].chunks_exact(240).zip(&at).all(|(c, m)| c.iter().all(|q| (far(q, m) - BUTTON).abs() < 0.05 * BUTTON));
                assert!(round, "person {k}: a button that is no ball");
                buttoned += 1;
                (at.len(), at.windows(2).map(|w| far(&w[0], &w[1])).fold((f32::MAX, f32::MIN), |(lo, hi), d| (lo.min(d), hi.max(d))), (2.0 * BUTTON, 2.0 * BUTTON), off_gown(&at))
            }
            _ => {
                let at = pieces(f, 36, EYELET_IN + 4.0 * LACE);
                let long = f.pos[..at.len() * 108].chunks_exact(108).map(|c| c.iter().flat_map(|a| c.iter().map(move |b| far(a, b))).fold(0f32, f32::max)).fold((f32::MAX, f32::MIN), |(lo, hi), d| (lo.min(d), hi.max(d)));
                // the linen between the edges: narrow, on the gown, down the front as far as the lace goes
                let gap = linens.last().unwrap();
                let (glo, ghi) = gap.pos.iter().fold((f32::MAX, f32::MIN), |(lo, hi), q| (lo.min(q[1]), hi.max(q[1])));
                assert!(ghi > hi[1] - 0.1 && glo < lo[1] + 0.1 && gap.pos.iter().all(|q| q[0] > lo[0] - 0.01 && q[0] < hi[0] + 0.01), "person {k}: the linen between the edges from {glo:.2} to {ghi:.2}, the lace from {:.2} to {:.2}", lo[1], hi[1]);
                laced += 1;
                (at.len(), at.windows(2).map(|w| far(&w[0], &w[1])).fold((f32::MAX, f32::MIN), |(lo, hi), d| (lo.min(d), hi.max(d))), long, off_gown(&at))
            }
        };
        if show() {
            println!("person {k:2} of {age:2} {kind:?}: {n} pieces, {:.3} to {:.3} apart, {:.3} to {:.3} long, {:.3} to {:.3} off the gown, {} triangles, {inward} wound inward, from y {:.2} to {:.2} (chin {:.2})", step.0, step.1, size.0, size.1, off.0, off.1, f.pos.len() / 3, lo[1], hi[1], out.chin);
        }
        assert_eq!(inward, 0, "person {k}: triangles wound against their corners");
        let (least, apart, across, stands) = match kind {
            Fasten::Buttons => (10, BUTTONS, (2.0 * BUTTON, 2.0 * BUTTON), (0.4 * BUTTON, 0.8 * BUTTON)),
            _ => (8, EYELETS, (2.0 * EYELET_IN, (2.0 * EYELET_IN).hypot(LACE_SLANT) + 6.0 * LACE), (0.0, 3.0 * LACE)),
        };
        assert!(off.0 >= stands.0 && off.1 <= stands.1, "person {k}: {:.3} to {:.3} off the gown", off.0, off.1);
        assert!(n >= least && n <= 23, "person {k} of {age}: {n} pieces");
        assert!(step.0 > 0.85 * apart && step.1 < 1.15 * apart, "person {k}: {:.3} to {:.3} apart", step.0, step.1);
        assert!(size.0 >= across.0 - 0.001 && size.1 <= across.1 + 0.001, "person {k}: {:.3} to {:.3} long", size.0, size.1);
        // below the chin, and none of it above the gown's neckline
        assert!(hi[1] < out.chin && hi[1] <= gown.pos.iter().map(|q| q[1]).fold(f32::MIN, f32::max), "person {k}: up to {:.2}", hi[1]);
    }
    assert!(laced >= 8 && buttoned >= 3 && plain >= 20, "{laced} laced, {buttoned} buttoned, {plain} plain");
}

#[test]
fn what_lies_over_the_gown_hides_the_fastening() {
    // A sheet for a gown (2 by 5, upright, facing the front, its upper edge at 5) and a second sheet 1 cm in front
    // of its upper part, down to 3: buttons and lace begin below where the second ends, and without it under the
    // upper edge. (On England's women nothing lies over the gown's front middle: the wimple ends at its neckline.)
    let sheet = |z: f32, low: f32| {
        let mut s = Surface::new(sc_portrait::geo::mat2(0.95));
        s.tex = Some("real/cloth_cote.webp".to_string());
        let mut y = low;
        while y < 5.0 {
            for i in 0..8 {
                let (x0, x1, y1) = (-1.0 + 0.25 * i as f32, -0.75 + 0.25 * i as f32, y + 0.25);
                for q in [[x0, y, z], [x1, y, z], [x1, y1, z], [x0, y, z], [x1, y1, z], [x0, y1, z]] {
                    s.pos.push(q);
                    s.nrm.push([0.0, 0.0, 1.0]);
                    s.uv.push([q[0], q[1]]);
                    s.col.push([0.5; 3]);
                }
            }
            y += 0.25;
        }
        s
    };
    let (gown, over) = (sheet(1.0, 0.0), sheet(1.1, 3.0));
    for kind in [Fasten::Buttons, Fasten::Laced] {
        let top = |over: &[&Surface]| {
            let made = sc_portrait::fasten::fasten(&gown, over, Some(("real/cloth_smock.webp".to_string(), [0.8; 3])), kind, 0.0, 6.0, 0.0);
            assert_eq!(made.len(), if kind == Fasten::Laced { 2 } else { 1 });
            (made.iter().flat_map(|s| s.pos.iter()).map(|q| q[1]).fold(f32::MIN, f32::max), made[0].pos.len() / 3)
        };
        let ((bare, all), (covered, some)) = (top(&[]), top(&[&over]));
        if show() {
            println!("{kind:?}: up to {bare:.2} with {all} triangles, under the second sheet up to {covered:.2} with {some}");
        }
        assert!(bare > 4.9 && bare <= 5.0 && covered > 2.75 && covered <= 3.0 && some < all, "{kind:?}: up to {bare:.2}, covered up to {covered:.2}");
    }
    assert!(sc_portrait::fasten::fasten(&gown, &[], None, Fasten::None, 0.0, 6.0, 0.0).is_empty());
}
