//! A man's coif of England 1356 (round 132): a close cap of linen over the hair and the ears, tied under the chin
//! (the real look: a file of its own, see tests/common).

mod common;

use common::{head, person};
use sc_portrait::dress::{Hood, ENGLAND_1356, PLAIN_1356};
use sc_portrait::{build, Surface};

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

/// The cap's triangles in the file (tools/portrait/pipeline/coif.py: 96 round, 30 rings and the turned edge); the
/// strings' come after them.
const CAP: usize = 6048;
const ALL: usize = 6504;

type V3 = [f32; 3];

fn sub(a: &V3, b: &V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn dot(a: &V3, b: &V3) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn cross(a: &V3, b: &V3) -> V3 {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/// How far along the line from `o` in the direction `d` the triangle is met (Möller and Trumbore 1997).
fn met(o: &V3, d: &V3, t: &[V3]) -> Option<f32> {
    let (e1, e2) = (sub(&t[1], &t[0]), sub(&t[2], &t[0]));
    let p = cross(d, &e2);
    let det = dot(&e1, &p);
    if det.abs() < 1e-12 {
        return None;
    }
    let s = sub(o, &t[0]);
    let u = dot(&s, &p) / det;
    let q = cross(&s, &e1);
    let v = dot(d, &q) / det;
    let far = dot(&e2, &q) / det;
    (u >= 0.0 && v >= 0.0 && u + v <= 1.0 && far > 0.0).then_some(far)
}

/// The direction's cell of 6 degrees round the head and up.
fn cell(d: &V3) -> (usize, usize) {
    let r = dot(d, d).sqrt();
    ((((d[0].atan2(d[2]).to_degrees() + 180.0) / 6.0) as usize).min(59), (((d[1] / r).clamp(-1.0, 1.0).asin().to_degrees() + 90.0) / 6.0).min(29.0) as usize)
}

/// The cap's sheet by direction from the place `c`: for each cell the triangles that reach into it.
struct Cap<'a> {
    c: V3,
    tris: Vec<&'a [V3]>,
    cells: Vec<Vec<u32>>,
}

impl<'a> Cap<'a> {
    fn new(s: &'a Surface, c: V3) -> Self {
        let tris: Vec<&[V3]> = s.pos[..CAP * 3].chunks_exact(3).collect();
        let mut cells = vec![Vec::new(); 60 * 30];
        for (k, t) in tris.iter().enumerate() {
            let at: Vec<(usize, usize)> = t.iter().map(|q| cell(&sub(q, &c))).collect();
            let (e0, e1) = (at.iter().map(|a| a.1).min().unwrap(), at.iter().map(|a| a.1).max().unwrap());
            let (t0, t1) = (at.iter().map(|a| a.0).min().unwrap(), at.iter().map(|a| a.0).max().unwrap());
            // (a triangle over the line behind the head, or round the top: every cell round at its heights)
            let round: Vec<usize> = if t1 - t0 > 30 || e1 >= 27 { (0..60).collect() } else { (t0..=t1).collect() };
            for e in e0.saturating_sub(1)..=(e1 + 1).min(29) {
                for &t in &round {
                    cells[t * 30 + e].push(k as u32);
                }
            }
        }
        Cap { c, tris, cells }
    }

    /// How far out the cap's sheet lies over the place `q`, seen from the middle (the farthest of its layers).
    fn over(&self, q: &V3) -> Option<f32> {
        let d = sub(q, &self.c);
        let r = dot(&d, &d).sqrt();
        let d = [d[0] / r, d[1] / r, d[2] / r];
        let (t, e) = cell(&d);
        self.cells[t * 30 + e].iter().filter_map(|&k| met(&self.c, &d, self.tris[k as usize])).fold(None, |m: Option<f32>, f| Some(m.map_or(f, |m| m.max(f))))
    }
}

#[test]
fn one_man_in_ten_wears_a_coif_from_thirty() {
    let d = &ENGLAND_1356;
    let count = |age: f32, female: bool| (0..100_000u32).filter(|&s| d.coif_of(female, age, s)).count();
    assert_eq!((count(29.0, false), count(30.0, false), count(68.0, false), count(40.0, true)), (0, 10_000, 10_000, 0));
    // bare-headed otherwise, and with the hair that lies under a hood
    assert!((0..100_000u32).all(|s| !d.coif_of(false, 40.0, s) || d.hood_of(false, 40.0, s) == Hood::None && d.head_covered(false, 40.0, s)));
    assert!((0..100_000u32).all(|s| d.head_covered(false, 40.0, s) == (d.coif_of(false, 40.0, s) || d.hood_of(false, 40.0, s) == Hood::Up)));
    assert!((0..1000).all(|s| !PLAIN_1356.coif_of(false, 40.0, s)));
}

#[test]
fn the_cap_lies_over_hair_and_ears_and_is_tied_under_the_chin() {
    // On 150 men of 30 to 68 (heads of every form the pool has): who wears the coif by his seed has it and
    // nobody else. It is the file's sheet and strings, seen from both sides, on a head whose hair is its painted
    // layer alone; nothing of the head comes through the sheet (skin, ears, what is painted on the scalp: no
    // corner of theirs lies further out than the sheet over it); the sheet lies close (over the crown within a
    // centimetre of the skin); its edge crosses the forehead over the brows, lies below the ears at the sides
    // and over the nape behind, and the strings end under the chin.
    let Some(h) = head() else { return };
    let (mut with, mut without) = (0, 0);
    for k in 0..150 {
        let p = person(2 * k + 1, false, [30.0, 35.0, 42.0, 50.0, 58.0, 68.0][k as usize % 6]);
        let wears = ENGLAND_1356.coif_of(false, p.age, p.seed);
        if !wears && k >= 40 {
            // (the first forty are built whether or not: nobody else has it)
            continue;
        }
        let out = build(&h, &p, 1);
        let cap = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains(ENGLAND_1356.fillet)));
        assert_eq!(cap.is_some(), wears, "person {k} of {}", p.age);
        let Some(s) = cap else {
            without += 1;
            continue;
        };
        with += 1;
        assert!(s.mat.double && s.pos.len() == ALL * 3, "person {k}: {} corners, seen from both sides: {}", s.pos.len(), s.mat.double);
        assert!(!out.surfaces.iter().any(|s| s.tex.as_deref().is_some_and(|t| t.contains("_body."))), "person {k}: a body of hair under the coif");
        let sheet = &s.pos[..CAP * 3];
        let range = |q: &[V3], a: usize| q.iter().fold((f32::MAX, f32::MIN), |(lo, hi), q| (lo.min(q[a]), hi.max(q[a])));
        let ((x0, x1), (_, y1), (z0, z1)) = (range(sheet, 0), range(sheet, 1), range(sheet, 2));
        let c = [(x0 + x1) / 2.0, y1 - 0.75 * (x1 - x0) / 2.0, (z0 + z1) / 2.0];
        let over = Cap::new(s, c);
        // the sheet's outer side faces out (the turned edge, its last 384 triangles, faces in)
        let inward = sheet[..(CAP - 384) * 3].chunks_exact(3).zip(s.nrm.chunks_exact(3)).filter(|(t, n)| dot(&sub(&t[0], &c), &n[0]) <= 0.0).count();
        assert_eq!(inward, 0, "person {k}: {inward} of the sheet's triangles face in");
        // what comes through: corners of the head's other surfaces up to 3 cm outside the sheet over them
        let (mut through, mut worst, mut under, mut close, mut room) = (0, 0f32, 0, f32::MIN, f32::MAX);
        let mut whose = Vec::new();
        let mut at = [0f32; 2];
        for o in out.surfaces.iter().filter(|o| !std::ptr::eq(*o, s)) {
            let mut n = 0;
            for q in o.pos.iter().step_by(3) {
                let Some(far) = over.over(q) else { continue };
                let d = sub(q, &c);
                let r = dot(&d, &d).sqrt();
                under += 1;
                room = room.min(far - r);
                if r > far && r < far + 0.3 {
                    n += 1;
                    if r - far > worst {
                        worst = r - far;
                        at = [d[0].atan2(d[2]).to_degrees(), (d[1] / r).asin().to_degrees()];
                    }
                }
                if d[1] / r > 0.9 && o.tex.as_deref().is_some_and(|t| t.contains("skin")) {
                    close = close.max(far - r);
                }
            }
            if n > 0 {
                whose.push((o.tex.clone().unwrap_or_default(), n));
            }
            through += n;
        }
        let eye = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("eyeball"))).expect("the eyes");
        let eyes = eye.pos.iter().map(|q| q[1]).sum::<f32>() / eye.pos.len() as f32;
        // the edge: the sheet's lowest corners in front, at the sides and behind
        let low = |f: &dyn Fn(&V3) -> bool| sheet.iter().filter(|q| f(q)).map(|q| q[1]).fold(f32::MAX, f32::min);
        let (front, side, back) = (low(&|q| q[0].abs() < 0.1 && q[2] > c[2]), low(&|q| (q[2] - c[2]).abs() < 0.15), low(&|q| q[0].abs() < 0.1 && q[2] < c[2]));
        let strings = &s.pos[CAP * 3..];
        let knot = strings.iter().fold([0.0, f32::MAX, 0.0], |m, q| if q[1] < m[1] { *q } else { m });
        if show() {
            println!(
                "person {k:3} of {}: {} corners under the sheet, {through} through it (by {:.1} mm at most, {:.0} degrees round and {:.0} up) {whose:?}; up to {:.1} mm over the crown's skin, at least {:.1} mm of room; edge {:.1} cm over the eyes in front, {:.1} under them at the sides, {:.1} behind; the cap {:.1} cm broad; strings down to {:.2} at x {:.2}, {:.2} in front of the middle (the frame's chin {:.2})",
                p.age,
                under,
                100.0 * worst,
                at[0],
                at[1],
                100.0 * close,
                100.0 * room,
                10.0 * (front - eyes),
                10.0 * (eyes - side),
                10.0 * (eyes - back),
                10.0 * (x1 - x0),
                knot[1],
                knot[0],
                knot[2] - c[2],
                out.chin
            );
            continue;
        }
        assert_eq!(through, 0, "person {k}: {whose:?} through the cap by {worst}");
        assert!(under > 1500, "person {k}: {under} corners under the sheet");
        assert!(close < 0.12, "person {k}: the cap {close} over the crown");
        assert!(front - eyes > 0.35 && front - eyes < 0.8, "person {k}: the edge {} over the eyes", front - eyes);
        assert!(eyes - side > 0.3 && eyes - side < 0.75 && eyes - back > 0.2, "person {k}: the edge {} under the eyes at the sides, {} behind", eyes - side, eyes - back);
        // (the frame's chin is the lowest of the neck's skin that counts to the head, a little under the chin)
        assert!(knot[1] > out.chin && knot[1] < out.chin + 0.35 && knot[0].abs() < 0.2 && knot[2] > c[2] + 0.3, "person {k}: the strings end at {knot:?}, the frame's chin at {}", out.chin);
    }
    assert!(show() || (with >= 8 && without >= 30), "{with} with a coif, {without} without");
}
