//! Rays from a point inside the head out to the morphed skin: the far hit
//! (skull, ear, nape), or the near one where the far one lies well behind
//! it (shoulder or back instead of ear or skin). A cube map around the
//! point buckets the triangles.

use crate::geo::V3;

const GR: usize = 10;

pub struct Caster<'a> {
    c: [f64; 3],
    p: &'a [V3],
    tris: &'a [u32],
    cells: Vec<Vec<u32>>,
}

fn cell(x: f64, y: f64, z: f64) -> (usize, i32, i32) {
    let (ax, ay, az) = (x.abs(), y.abs(), z.abs());
    let (f, m, u, v) = if ax >= ay && ax >= az {
        (if x > 0.0 { 0 } else { 1 }, ax, y, z)
    } else if ay >= az {
        (if y > 0.0 { 2 } else { 3 }, ay, x, z)
    } else {
        (if z > 0.0 { 4 } else { 5 }, az, x, y)
    };
    let q = |w: f64| (((w / m + 1.0) / 2.0 * GR as f64).floor() as i32).min(GR as i32 - 1);
    (f, q(u), q(v))
}

fn key(f: usize, i: i32, j: i32) -> usize {
    (f * GR + i as usize) * GR + j as usize
}

impl<'a> Caster<'a> {
    /// Rays from `c` against the triangles `tris` (indices into `p`).
    pub fn new(c: V3, p: &'a [V3], tris: &'a [u32]) -> Caster<'a> {
        let c = [c[0] as f64, c[1] as f64, c[2] as f64];
        let mut cells = vec![Vec::new(); 6 * GR * GR];
        for t in (0..tris.len()).step_by(3) {
            let cs: Vec<(usize, i32, i32)> = (0..3)
                .map(|q| {
                    let v = p[tris[t + q] as usize];
                    cell(v[0] as f64 - c[0], v[1] as f64 - c[1], v[2] as f64 - c[2])
                })
                .collect();
            if cs[0].0 == cs[1].0 && cs[1].0 == cs[2].0 {
                let (i0, i1) = (cs.iter().map(|c| c.1).min().unwrap(), cs.iter().map(|c| c.1).max().unwrap());
                let (j0, j1) = (cs.iter().map(|c| c.2).min().unwrap(), cs.iter().map(|c| c.2).max().unwrap());
                for i in i0..=i1 {
                    for j in j0..=j1 {
                        cells[key(cs[0].0, i, j)].push(t as u32);
                    }
                }
            } else {
                for &(f, ci, cj) in &cs {
                    for di in -1..=1 {
                        for dj in -1..=1 {
                            let (i, j) = (ci + di, cj + dj);
                            if i >= 0 && i < GR as i32 && j >= 0 && j < GR as i32 {
                                cells[key(f, i, j)].push(t as u32);
                            }
                        }
                    }
                }
            }
        }
        Caster { c, p, tris, cells }
    }

    /// Distance along `d` to the skin, -1 when the ray hits nothing; with
    /// `far` always the farthest hit.
    pub fn cast(&self, d: V3, far: bool) -> f32 {
        let (mut dx, mut dy, mut dz) = (d[0] as f64, d[1] as f64, d[2] as f64);
        let (f0, i0, j0) = cell(dx, dy, dz);
        let dl = (dx * dx + dy * dy + dz * dz).sqrt();
        dx /= dl;
        dy /= dl;
        dz /= dl;
        let (mut best, mut near) = (-1f64, 1e9f64);
        let c = self.c;
        for di in -1..=1 {
            for dj in -1..=1 {
                let (i, j) = (i0 + di, j0 + dj);
                if i < 0 || i >= GR as i32 || j < 0 || j >= GR as i32 {
                    continue;
                }
                for &t in &self.cells[key(f0, i, j)] {
                    let t = t as usize;
                    let v = |q: usize| {
                        let p = self.p[self.tris[t + q] as usize];
                        [p[0] as f64, p[1] as f64, p[2] as f64]
                    };
                    let (a, b, cc) = (v(0), v(1), v(2));
                    let (e1x, e1y, e1z) = (b[0] - a[0], b[1] - a[1], b[2] - a[2]);
                    let (e2x, e2y, e2z) = (cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]);
                    let (px, py, pz) = (dy * e2z - dz * e2y, dz * e2x - dx * e2z, dx * e2y - dy * e2x);
                    let det = e1x * px + e1y * py + e1z * pz;
                    if det.abs() < 1e-12 {
                        continue;
                    }
                    let iv = 1.0 / det;
                    let (tx, ty, tz) = (c[0] - a[0], c[1] - a[1], c[2] - a[2]);
                    let u = (tx * px + ty * py + tz * pz) * iv;
                    if !(0.0..=1.0).contains(&u) {
                        continue;
                    }
                    let (qx, qy, qz) = (ty * e1z - tz * e1y, tz * e1x - tx * e1z, tx * e1y - ty * e1x);
                    let w = (dx * qx + dy * qy + dz * qz) * iv;
                    if w < 0.0 || u + w > 1.0 {
                        continue;
                    }
                    let tt = (e2x * qx + e2y * qy + e2z * qz) * iv;
                    if tt <= 0.0 {
                        continue;
                    }
                    best = best.max(tt);
                    near = near.min(tt);
                }
            }
        }
        if best < 0.0 {
            -1.0
        } else if far || best - near < 0.3 {
            best as f32
        } else {
            near as f32
        }
    }
}
