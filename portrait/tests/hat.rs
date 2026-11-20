//! A man's felt hat of England 1356 (round 134): a round crown and a broad brim over hair that lies flat (the real
//! look: a file of its own, see tests/common).

mod common;

use common::{head, person};
use sc_portrait::dress::{Hood, ENGLAND_1356, PLAIN_1356};
use sc_portrait::{build, Surface};

fn show() -> bool {
    std::env::var("SHOW").is_ok()
}

/// The crown's triangles in the file (tools/portrait/pipeline/hat.py: 96 round, 20 rings); the brim's come after
/// them.
const CAP: usize = 3744;
const ALL: usize = 6816;

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

/// The crown's sheet by direction from the place `c`: for each cell the triangles that reach into it.
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

    /// How far out the crown's sheet lies over the place `q`, seen from the middle (the farthest of its layers).
    fn over(&self, q: &V3) -> Option<f32> {
        let d = sub(q, &self.c);
        let r = dot(&d, &d).sqrt();
        let d = [d[0] / r, d[1] / r, d[2] / r];
        let (t, e) = cell(&d);
        self.cells[t * 30 + e].iter().filter_map(|&k| met(&self.c, &d, self.tris[k as usize])).fold(None, |m: Option<f32>, f| Some(m.map_or(f, |m| m.max(f))))
    }
}

#[test]
fn two_men_in_ten_wear_a_hat_from_fifteen() {
    let d = &ENGLAND_1356;
    let count = |age: f32, female: bool| (0..100_000u32).filter(|&s| d.hat_of(female, age, s)).count();
    assert_eq!((count(14.0, false), count(15.0, false), count(68.0, false), count(40.0, true)), (0, 20_000, 20_000, 0));
    // never on a hood that is on the head, never with a coif; under it the hair of a covered head; one in ten
    // over a hood thrown back, one in ten bare-headed otherwise
    assert!((0..100_000u32).all(|s| !d.hat_of(false, 40.0, s) || d.hood_of(false, 40.0, s) != Hood::Up && !d.coif_of(false, 40.0, s) && d.head_covered(false, 40.0, s)));
    assert_eq!((0..100_000u32).filter(|&s| d.hat_of(false, 40.0, s) && d.hood_of(false, 40.0, s) == Hood::Back).count(), 10_000);
    // every colour is drawn
    let tones: std::collections::BTreeSet<&str> = (0..100_000_000u32).step_by(1_000_000).map(|s| d.hat_tone(s)).collect();
    assert_eq!(tones.len(), d.hat_tones.len());
    assert!((0..1000).all(|s| !PLAIN_1356.hat_of(false, 40.0, s)));
}

#[test]
fn the_hat_sits_over_the_hair_and_its_brim_stands_clear_of_the_face() {
    // On 150 men of 15 to 68 (heads of every form the pool has): who wears the hat by his seed has it and
    // nobody else. It is the file's sheet, seen from both sides, with the hat's own image; nothing of the head
    // comes through the crown (skin, ears, the hair under it: no corner of theirs lies further out than the
    // sheet over it); the crown's line crosses the forehead over the brows; the brim stands out round the head
    // and stays over the eyes in front; hair shows under it behind.
    let Some(h) = head() else { return };
    let (mut with, mut without) = (0, 0);
    for k in 0..150 {
        let p = person(2 * k + 1, false, [15.0, 24.0, 35.0, 50.0, 58.0, 68.0][k as usize % 6]);
        let wears = ENGLAND_1356.hat_of(false, p.age, p.seed);
        if !wears && k >= 40 {
            // (the first forty are built whether or not: nobody else has it)
            continue;
        }
        let out = build(&h, &p, 1);
        let hat = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("/cloth_hat.")));
        assert_eq!(hat.is_some(), wears, "person {k} of {}", p.age);
        let Some(s) = hat else {
            without += 1;
            continue;
        };
        with += 1;
        assert!(s.mat.double && s.pos.len() == ALL * 3, "person {k}: {} corners, seen from both sides: {}", s.pos.len(), s.mat.double);
        let sheet = &s.pos[..CAP * 3];
        let brim = &s.pos[CAP * 3..];
        let range = |q: &[V3], a: usize| q.iter().fold((f32::MAX, f32::MIN), |(lo, hi), q| (lo.min(q[a]), hi.max(q[a])));
        let ((x0, x1), (y0, y1), (z0, z1)) = (range(sheet, 0), range(sheet, 1), range(sheet, 2));
        // (a place inside the crown a little over its line: every part of the crown is seen from there)
        let c = [(x0 + x1) / 2.0, y0 + 0.15, (z0 + z1) / 2.0];
        let over = Cap::new(s, c);
        let inward = sheet.chunks_exact(3).zip(s.nrm.chunks_exact(3)).filter(|(t, n)| dot(&sub(&t[0], &c), &n[0]) <= 0.0).count();
        assert_eq!(inward, 0, "person {k}: {inward} of the crown's triangles face in");
        // what comes through: corners of the head's other surfaces up to 3 cm outside the crown over them
        let (mut through, mut worst, mut under, mut room) = (0, 0f32, 0, f32::MAX);
        let mut whose = Vec::new();
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
                    worst = worst.max(r - far);
                }
            }
            if n > 0 {
                whose.push((o.tex.clone().unwrap_or_default(), n));
            }
            through += n;
        }
        let eye = out.surfaces.iter().find(|s| s.tex.as_deref().is_some_and(|t| t.contains("eyeball"))).expect("the eyes");
        let eyes = eye.pos.iter().map(|q| q[1]).sum::<f32>() / eye.pos.len() as f32;
        let low = |of: &[V3], f: &dyn Fn(&V3) -> bool| of.iter().filter(|q| f(q)).map(|q| q[1]).fold(f32::MAX, f32::min);
        let (line, brim_front) = (low(sheet, &|q| q[0].abs() < 0.1 && q[2] > c[2]), low(brim, &|q| (q[0] - c[0]).abs() < 0.3 && q[2] > c[2]));
        let ((bx0, bx1), _, _) = (range(brim, 0), 0, 0);
        let hair = out.surfaces.iter().filter(|o| o.tex.as_deref().is_some_and(|t| t.contains("_body."))).flat_map(|o| o.pos.iter()).map(|q| q[1]).fold(f32::MAX, f32::min);
        let line_back = low(sheet, &|q| q[0].abs() < 0.1 && q[2] < c[2]);
        if show() {
            println!(
                "person {k:3} of {}: {under} corners under the crown, {through} through it (by {:.1} mm at most) {whose:?}, at least {:.1} mm of room; the line {:.1} cm over the eyes, the brim's lowest in front {:.1} cm over them; the crown {:.1} cm broad and {:.1} high, the hat {:.1} cm broad; hair down to {:.1} cm under the line behind",
                p.age,
                100.0 * worst,
                100.0 * room,
                10.0 * (line - eyes),
                10.0 * (brim_front - eyes),
                10.0 * (x1 - x0),
                10.0 * (y1 - y0),
                10.0 * (bx1 - bx0),
                10.0 * (line_back - hair)
            );
            continue;
        }
        assert_eq!(through, 0, "person {k}: {whose:?} through the crown by {worst}");
        assert!(under > 1500, "person {k}: {under} corners under the crown");
        assert!(line - eyes > 0.3 && line - eyes < 0.8, "person {k}: the line {} over the eyes", line - eyes);
        assert!(brim_front - eyes > 0.15, "person {k}: the brim {} over the eyes in front", brim_front - eyes);
        assert!((bx1 - bx0) - (x1 - x0) > 0.8 && (bx1 - bx0) - (x1 - x0) < 1.4, "person {k}: the hat {} broader than its crown", (bx1 - bx0) - (x1 - x0));
        assert!(hair == f32::MAX || line_back - hair > 0.2, "person {k}: hair down to {} under the line behind", line_back - hair);
    }
    assert!(show() || (with >= 15 && without >= 25), "{with} with a hat, {without} without");
}
