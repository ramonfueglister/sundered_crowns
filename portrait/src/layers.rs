//! What lies over what (round 124). A veil's fall, a hood's cape and a wimple lie on the gown's shoulders. Each
//! garment is bound to the body on its own and held a least distance off it (real_look.rs `calm`: the gown 0.7 cm,
//! what lies over it 1.3 cm), and where a fold of the gown stands further off the body than the cloth over it,
//! the gown came through: specks on a veil's end, a patch of the gown's colour on the shoulder. Here the cloth
//! over the gown is lifted off the gown itself, and after the pose what of the gown still came through is sunk.

use crate::geo::{Surface, V3};
use std::collections::HashMap;

/// How far outside the gown the cloth over it is set (base units of 10 cm), and how far in front of a place of
/// that cloth the gown is looked for. PLACEHOLDER, by eye: at 0.02 the stage's shadow of the veil on the gown
/// under it still flickers through.
pub const GAP: f32 = 0.08;
pub const REACH: f32 = 0.25;
/// (round 137) How far inside the cloth over it a place of the gown is set that still came through it, and how
/// far through at most (further, and the two are not layers of one place). PLACEHOLDER, by eye.
pub const UNDER: f32 = 0.02;
pub const THROUGH: f32 = 0.1;
/// The least share of a corner's direction that lies along the gown's for the two to be layers of one place.
const ALONG: f32 = 0.6;
/// The side of the cells the gown's triangles are sorted into (base units of 10 cm), and of those the cloth over
/// it is sorted into for `sink`, which looks less far.
const CELL: f32 = 0.3;
const CELL_OVER: f32 = 0.2;

/// A quick hash for the cells' and corners' keys (the standard one cost more than the triangles looked at).
#[derive(Default)]
struct Mix(u64);

impl std::hash::Hasher for Mix {
    fn finish(&self) -> u64 {
        self.0
    }
    fn write(&mut self, bytes: &[u8]) {
        for chunk in bytes.chunks(4) {
            let v = chunk.iter().rev().fold(0u64, |v, &b| (v << 8) | b as u64);
            self.0 = (self.0.rotate_left(5) ^ v).wrapping_mul(0x517c_c1b7_2722_0a95);
        }
    }
}

type Quick<K, V> = HashMap<K, V, std::hash::BuildHasherDefault<Mix>>;

fn cell(q: V3, side: f32) -> [i32; 3] {
    [(q[0] / side).floor() as i32, (q[1] / side).floor() as i32, (q[2] / side).floor() as i32]
}

/// How far along `d` from `o` the line meets the triangle (a, b, c), if it does (Möller and Trumbore 1997).
pub(crate) fn meets(o: V3, d: V3, a: V3, b: V3, c: V3) -> Option<f32> {
    let sub = |p: V3, q: V3| [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
    let cross = |p: V3, q: V3| [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    let dot = |p: V3, q: V3| p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    let (e1, e2) = (sub(b, a), sub(c, a));
    let h = cross(d, e2);
    let det = dot(e1, h);
    if det.abs() < 1e-9 {
        return None;
    }
    let s = sub(o, a);
    let u = dot(s, h) / det;
    let q = cross(s, e1);
    let v = dot(d, q) / det;
    (u >= 0.0 && v >= 0.0 && u + v <= 1.0).then(|| dot(e2, q) / det)
}

/// Lifts `over` off `under`: a corner of `over` below the height `below` that lies inside `under`, or less than
/// `gap` outside it, is moved to `gap` outside it, along its own direction (both cloths' triangles are wound
/// outward, tools/portrait/pipeline/tunic_bind.py). Only where `under` is met within `reach` of the corner and
/// faces nearly as the cloth over it does (`ALONG`): further off, or where the two stand across each other, they
/// are not two layers of one place (a veil's fall beside the neck faces the shoulder a hand's breadth away).
/// Returns how many corners moved.
pub fn lift(over: &mut Surface, under: &Surface, below: f32, gap: f32, reach: f32) -> usize {
    if over.nrm.len() != over.pos.len() {
        return 0;
    }
    let grid = sorted(under, CELL);
    let mut moved = 0;
    for k in 0..over.pos.len() {
        let (p, n) = (over.pos[k], over.nrm[k]);
        if p[1] >= below || (n[0] == 0.0 && n[1] == 0.0 && n[2] == 0.0) {
            continue;
        }
        // along the corner's direction, `reach` either way: where the gown is met, how far the corner stands
        // outside it there; the least of these is what counts
        let least = met(under, &grid, CELL, p, n, reach).into_iter().map(|at| -at).fold(None, |m: Option<f32>, o| Some(m.map_or(o, |m| m.min(o))));
        if let Some(out) = least.filter(|out| *out < gap) {
            over.pos[k] = std::array::from_fn(|a| p[a] + n[a] * (gap - out));
            moved += 1;
        }
    }
    moved
}

/// (round 137) Sinks `under` beneath `over`, after `lift`: a corner of `under` below the height `below` that
/// still stands outside `over`, by less than `through`, or less than `gap` inside it, is moved to `gap` inside
/// it, against its own direction. `lift` moves the corners of the cloth over the gown; a fold of the gown that
/// stands up between three of them came through all the same, as a speck of the gown's colour on a hood's cape.
/// What is moved lies under the other cloth and is not seen. Returns how many corners moved.
pub fn sink(under: &mut Surface, over: &Surface, below: f32, gap: f32, through: f32) -> usize {
    if under.nrm.len() != under.pos.len() {
        return 0;
    }
    let grid = sorted(over, CELL_OVER);
    // (the gown is far larger than what lies over it: nothing is looked for outside that cloth's box, and a
    // corner that several triangles share is looked up once)
    let (lo, hi) = over.pos.iter().fold(([f32::MAX; 3], [f32::MIN; 3]), |(lo, hi), q| (std::array::from_fn(|a| lo[a].min(q[a] - through)), std::array::from_fn(|a| hi[a].max(q[a] + through))));
    let mut known: Quick<[u32; 6], f32> = Quick::default();
    let mut moved = 0;
    for k in 0..under.pos.len() {
        let (p, n) = (under.pos[k], under.nrm[k]);
        if p[1] >= below || (0..3).any(|a| p[a] < lo[a] || p[a] > hi[a]) || (n[0] == 0.0 && n[1] == 0.0 && n[2] == 0.0) {
            continue;
        }
        // (how far the corner goes in: under the innermost of the other cloth's layers that count; from where it
        // then lies another may be within reach, a rolled hem's far side: looked for up to three times)
        let shift = *known.entry([p[0].to_bits(), p[1].to_bits(), p[2].to_bits(), n[0].to_bits(), n[1].to_bits(), n[2].to_bits()]).or_insert_with(|| {
            let mut shift = 0.0;
            for _ in 0..3 {
                let q: V3 = std::array::from_fn(|a| p[a] + n[a] * shift);
                match met(over, &grid, CELL_OVER, q, n, through).into_iter().filter(|at| *at < gap).fold(None, |m: Option<f32>, o| Some(m.map_or(o, |m| m.min(o)))) {
                    Some(at) => shift += at - gap,
                    None => break,
                }
            }
            shift
        });
        if shift != 0.0 {
            under.pos[k] = std::array::from_fn(|a| p[a] + n[a] * shift);
            moved += 1;
        }
    }
    moved
}

/// A surface's triangles by the cells of side `side` they reach into.
fn sorted(s: &Surface, side: f32) -> Quick<[i32; 3], Vec<u32>> {
    let mut grid: Quick<[i32; 3], Vec<u32>> = Quick::default();
    for (t, tri) in s.pos.chunks_exact(3).enumerate() {
        let (lo, hi) = tri.iter().fold(([i32::MAX; 3], [i32::MIN; 3]), |(lo, hi), &q| {
            let c = cell(q, side);
            (std::array::from_fn(|a| lo[a].min(c[a])), std::array::from_fn(|a| hi[a].max(c[a])))
        });
        for i in lo[0]..=hi[0] {
            for j in lo[1]..=hi[1] {
                for k in lo[2]..=hi[2] {
                    grid.entry([i, j, k]).or_default().push(t as u32);
                }
            }
        }
    }
    grid
}

/// Where the line through `p` along `n` meets the surface within `reach` either way, on triangles that face
/// nearly as `n` does (`ALONG`): how far along `n` each time.
fn met(s: &Surface, grid: &Quick<[i32; 3], Vec<u32>>, side: f32, p: V3, n: V3, reach: f32) -> Vec<f32> {
    let (from, to): (V3, V3) = (std::array::from_fn(|a| p[a] - n[a] * reach), std::array::from_fn(|a| p[a] + n[a] * reach));
    let (c0, c1) = (cell(from, side), cell(to, side));
    let mut out = Vec::new();
    let mut seen: Vec<u32> = Vec::new();
    for i in c0[0].min(c1[0])..=c0[0].max(c1[0]) {
        for j in c0[1].min(c1[1])..=c0[1].max(c1[1]) {
            for l in c0[2].min(c1[2])..=c0[2].max(c1[2]) {
                for &t in grid.get(&[i, j, l]).map_or(&[][..], |v| v) {
                    if seen.contains(&t) {
                        continue;
                    }
                    seen.push(t);
                    let q = &s.pos[3 * t as usize..3 * t as usize + 3];
                    let Some(at) = meets(p, n, q[0], q[1], q[2]).filter(|at| at.abs() < reach) else { continue };
                    let (e1, e2): (V3, V3) = (std::array::from_fn(|a| q[1][a] - q[0][a]), std::array::from_fn(|a| q[2][a] - q[0][a]));
                    let g = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
                    let along = (g[0] * n[0] + g[1] * n[1] + g[2] * n[2]) / (g[0] * g[0] + g[1] * g[1] + g[2] * g[2]).sqrt().max(1e-9);
                    // (a triangle that faces the other way is the back of a fold or of the neck's rolled hem:
                    // counted, it drew the cloth in under the hem, a row of notches along a neckline)
                    if along < ALONG {
                        continue;
                    }
                    out.push(at);
                }
            }
        }
    }
    out
}
