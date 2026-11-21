//! (round 161) The hood of a hood thrown back.
//!
//! A hood pulled off the head hangs behind the neck, and its cape stays round the shoulders (`dress.rs`, the
//! sources of England's table). The file of a hood thrown back (`cloth_hood_down`) is that cape with the edge of
//! the hood's opening laid round the neck as a roll, and nothing behind it: a collar. The hood itself is laid on
//! here, while the body stands square (the pose turns it with the cape afterwards): a flat bag of the hood's wool
//! that hangs from the rear half of the opening's edge down the back, over the cape, and ends in a point.
//!
//! It lies on what is seen from behind. The cloth under it is read as a depth over the plane across the back (each
//! triangle drawn into a grid of cells, the hindmost kept, and where the cloth falls away under it, straight down
//! from there: a cape stands off the back). The bag's mouth rises from beside the opening's edge to the crest of the
//! roll behind the neck; from the crest a column of the bag runs down that surface, and the bag stands off it by its
//! thickness.

use crate::facing::{corners, opening, BREADTH};
use crate::geo::{add, cross, dot, len, madd, mul, norm, sm, sub, Surface, V3};

/// How far the bag hangs from the crest of the roll behind the neck to its point, along the cloth (units of 10 cm).
/// PLACEHOLDER, by eye: a hood is some 25 cm deep from its opening to the back of the head, and no source read
/// gives a measure.
const LONG: f32 = 3.2;
/// Half the bag's breadth in half breadths of the opening as it lies round the neck: on the crest, and where it is
/// broadest, `BROADEST` of its length down; from there it runs in to the point. PLACEHOLDER, by eye.
const BROAD: [f32; 2] = [1.0, 1.1];
const BROADEST: f32 = 0.15;
/// How thick the bag is in its middle: on the crest, where it is thickest (`THICKEST` of its length down, where the
/// hood's cloth lies bunched under the nape), and at the point. Two layers of wool with what air is between them.
/// PLACEHOLDER, by eye.
const THICK: [f32; 3] = [0.3, 0.4, 0.06];
const THICKEST: f32 = 0.12;
/// The folds a hood that hangs flat falls into, from under the nape to the point: how many across the bag, and
/// how much thinner the bag is between two of them. PLACEHOLDER, by eye.
const FOLDS: f32 = 1.5;
const FOLD: f32 = 0.35;
/// How far the bag's underside is held off the cloth under it.
const CLEAR: f32 = 0.012;
/// The grid the cloth under the bag is read into: a cell's side, and how far the depth is evened out for the way
/// the bag stands off it (cells either way, twice).
const CELL: f32 = 0.025;
const EVEN: usize = 6;
/// How far beside a corner of the mouth the roll's corners are held under it (the mouth's corners lie about as far
/// apart).
const BESIDE: f32 = 0.2;
/// The bag's rows of corners from beside the edge up to the crest and down it, its corners across it, and how dark
/// its rim is drawn (it lies in its own shade there).
const RISE: usize = 5;
const DOWN: usize = 30;
const ACROSS: usize = 20;
const SHADE: f32 = 0.8;

/// The depth of the hindmost cloth over the plane across the back: `x` to the side, `y` up, the depth towards
/// `back`, all from the opening's middle.
struct Behind {
    x0: f32,
    y0: f32,
    nx: usize,
    ny: usize,
    z: Vec<f32>,
}

impl Behind {
    /// A place in cells, from the first cell's middle and no further than the last's.
    /// (`max` and `min`, not `clamp`: f32's `clamp` says its bounds when they are crossed, and the code that writes
    /// a number out is 25 kB of the builder's file, which has none otherwise)
    fn cells(&self, x: f32, y: f32) -> (f32, f32) {
        (((x - self.x0) / CELL - 0.5).max(0.0).min(self.nx as f32 - 1.001), ((y - self.y0) / CELL - 0.5).max(0.0).min(self.ny as f32 - 1.001))
    }
    /// The depth at a place, between the four cells round it; of those that hold no cloth the others stand in.
    fn at(&self, x: f32, y: f32) -> Option<f32> {
        let (fx, fy) = self.cells(x, y);
        let (i, j) = (fx as usize, fy as usize);
        let (mut sum, mut weight) = (0.0, 0.0);
        for (di, dj) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
            let z = self.z[(j + dj) * self.nx + i + di];
            let w = (if di == 0 { 1.0 - fx.fract() } else { fx.fract() }) * (if dj == 0 { 1.0 - fy.fract() } else { fy.fract() });
            if z > f32::MIN && w > 0.0 {
                sum += z * w;
                weight += w;
            }
        }
        (weight > 0.0).then(|| sum / weight)
    }
    /// The hindmost of the four cells round a place.
    fn most(&self, x: f32, y: f32) -> Option<f32> {
        let (fx, fy) = self.cells(x, y);
        let (i, j) = (fx as usize, fy as usize);
        [(0, 0), (1, 0), (0, 1), (1, 1)].iter().map(|(di, dj)| self.z[(j + dj) * self.nx + i + di]).filter(|z| *z > f32::MIN).reduce(f32::max)
    }
    /// The grid with each cell the mean of the cells up to `r` either way that hold cloth.
    fn evened(&self, r: usize) -> Behind {
        let mut z = self.z.clone();
        for across in [true, false] {
            let from = z.clone();
            for j in 0..self.ny {
                for i in 0..self.nx {
                    let (mut sum, mut n) = (0.0, 0);
                    let (k, most) = if across { (i, self.nx) } else { (j, self.ny) };
                    for d in k.saturating_sub(r)..(k + r + 1).min(most) {
                        let z = from[if across { j * self.nx + d } else { d * self.nx + i }];
                        if z > f32::MIN {
                            sum += z;
                            n += 1;
                        }
                    }
                    z[j * self.nx + i] = if n > 0 { sum / n as f32 } else { f32::MIN };
                }
            }
        }
        Behind { z, ..*self }
    }
}

/// The hood of the hood thrown back `hood`, hanging behind the neck over `hood`'s cape and the cloth `under` it,
/// on a body that stands square (its back faces -z). Nothing for a garment without a hemmed edge.
pub fn hang(hood: &Surface, under: &[&Surface]) -> Option<Surface> {
    let (of, at) = corners(hood);
    let (edge, closed) = opening(&of, &at)?;
    if !closed || edge.len() < 8 {
        return None;
    }
    let way: Vec<V3> = edge.iter().map(|&v| at[v]).collect();
    let middle = mul(way.iter().fold([0f32; 3], |a, q| add(a, *q)), 1.0 / way.len() as f32);
    let (up, back) = ([0.0, 1.0, 0.0], [0.0, 0.0, -1.0]);
    let side = cross(up, back);
    let local = |q: V3| -> V3 {
        let d = sub(q, middle);
        [dot(d, side), dot(d, up), dot(d, back)]
    };
    // the opening's edge, its half breadth, and its rear half from one side to the other
    let rim: Vec<V3> = way.iter().map(|&q| local(q)).collect();
    let half = rim.iter().map(|q| q[0].abs()).fold(0.0, f32::max);
    let n = rim.len();
    let rear: Vec<V3> = {
        let start = (0..n).find(|&i| rim[i][2] <= 0.0 && rim[(i + 1) % n][2] > 0.0)?;
        let mut run: Vec<V3> = (1..=n).map(|k| rim[(start + k) % n]).take_while(|q| q[2] > 0.0).collect();
        if run.first()?[0] > run.last()?[0] {
            run.reverse();
        }
        run
    };
    if rear.len() < 3 {
        return None;
    }
    // the edge's height and depth at a place across (beyond the rear half's ends, theirs)
    let edge_at = |x: f32| -> [f32; 2] {
        let x = x.max(rear[0][0]).min(rear[rear.len() - 1][0]);
        let w = rear.windows(2).find(|w| (w[0][0].min(w[1][0])..=w[0][0].max(w[1][0])).contains(&x)).unwrap_or(&rear[..2]);
        let t = if (w[1][0] - w[0][0]).abs() < 1e-6 { 0.0 } else { (x - w[0][0]) / (w[1][0] - w[0][0]) };
        [w[0][1] + (w[1][1] - w[0][1]) * t, w[0][2] + (w[1][2] - w[0][2]) * t]
    };
    // the cloth behind the neck, drawn into the grid
    let reach = half * BROAD[1] + 0.3;
    let top = rim.iter().map(|q| q[1]).fold(f32::MIN, f32::max) + 0.2;
    let (nx, ny) = ((2.0 * reach / CELL).ceil() as usize, ((top + LONG + 0.6) / CELL).ceil() as usize);
    let mut seen = Behind { x0: -reach, y0: top - ny as f32 * CELL, nx, ny, z: vec![f32::MIN; nx * ny] };
    for s in std::iter::once(hood).chain(under.iter().copied()) {
        for t in s.pos.chunks_exact(3) {
            let [a, b, c] = [local(t[0]), local(t[1]), local(t[2])];
            let area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
            if area.abs() < 1e-9 || a[2].max(b[2]).max(c[2]) < -0.5 {
                continue;
            }
            let cells = |lo: f32, o: f32, n: usize| (((lo - o) / CELL - 0.5).ceil().max(0.0) as usize).min(n);
            let (i0, i1) = (cells(a[0].min(b[0]).min(c[0]), seen.x0, nx), cells(a[0].max(b[0]).max(c[0]), seen.x0, nx));
            let (j0, j1) = (cells(a[1].min(b[1]).min(c[1]), seen.y0, ny), cells(a[1].max(b[1]).max(c[1]), seen.y0, ny));
            for j in j0..j1 {
                for i in i0..i1 {
                    let (x, y) = (seen.x0 + (i as f32 + 0.5) * CELL, seen.y0 + (j as f32 + 0.5) * CELL);
                    let wb = ((x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1])) / area;
                    let wc = ((b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1])) / area;
                    if wb >= 0.0 && wc >= 0.0 && wb + wc <= 1.0 {
                        let z = a[2] + (b[2] - a[2]) * wb + (c[2] - a[2]) * wc;
                        let cell = &mut seen.z[j * nx + i];
                        *cell = cell.max(z);
                    }
                }
            }
        }
    }
    // the surface the bag lies on: where the cloth falls away under it (under the roll, at the cape's hem, which
    // stands off the back) a cloth hangs straight down, so the depth of each cell is the hindmost from there up
    for j in (0..ny - 1).rev() {
        for i in 0..nx {
            seen.z[j * nx + i] = seen.z[j * nx + i].max(seen.z[(j + 1) * nx + i]);
        }
    }
    // (evened out for the way the bag stands off it, since a bag lies across the cape's folds, and nowhere under
    // the cloth as it is)
    let flat = seen.evened(EVEN).evened(EVEN);
    let lies = |x: f32, y: f32| -> Option<f32> { Some(flat.at(x, y)?.max(seen.at(x, y)?)) };
    let off = |x: f32, y: f32| -> V3 {
        let e = 2.0 * CELL;
        let slope = |a: Option<f32>, b: Option<f32>| a.zip(b).map_or(0.0, |(a, b)| (a - b) / (2.0 * e));
        norm([-slope(flat.at(x + e, y), flat.at(x - e, y)), -slope(flat.at(x, y + e), flat.at(x, y - e)), 1.0])
    };
    // the crest of the roll the edge lies round the neck as, seen from behind (the highest cloth there that is
    // not of the opening's front half): from there a column of the bag runs down
    let crest = |x: f32| -> Option<[f32; 2]> { (0..ny).rev().map(|j| seen.y0 + (j as f32 + 0.5) * CELL).find_map(|y| lies(x, y).filter(|z| *z > -0.15 * half).map(|z| [y, z])) };
    // how much of the hood's image goes on a length of cloth (over its triangles' first sides, a hem's roll left
    // out: its image runs a twentieth of the way round it), and the hood's wool where no fold shades it (the mean
    // of its lightest tenth)
    let image = {
        let sides = hood.pos.chunks_exact(3).zip(hood.uv.chunks_exact(3)).filter(|(_, uv)| uv.iter().any(|c| c[1].abs() > 0.05));
        let (drawn, long) = sides.fold((0.0, 0.0), |(drawn, long), (p, uv)| (drawn + (uv[1][0] - uv[0][0]).hypot(uv[1][1] - uv[0][1]), long + len(sub(p[1], p[0]))));
        drawn / long.max(1e-6)
    };
    let wool = {
        let light = |c: &V3| c[0] + c[1] + c[2];
        let most = hood.col.iter().map(light).fold(0.0, f32::max);
        let (sum, n) = hood.col.iter().filter(|c| light(c) >= 0.9 * most).fold(([0f32; 3], 0), |(sum, n), c| (add(sum, *c), n + 1));
        mul(sum, 1.0 / n.max(1) as f32)
    };
    // the hood's corners behind the neck, from the edge's height up: the roll
    let low = rear.iter().map(|q| q[1]).fold(f32::MAX, f32::min) - 0.1;
    let roll: Vec<V3> = at.iter().map(|&q| local(q)).filter(|q| q[1] > low && q[2] > -0.2 * half).collect();
    // the bag's corners: down it by the way along the cloth, across it from rim to rim (closer at the rims, where
    // it comes round to the cloth under it)
    let world = |q: V3| add(add(mul(side, q[0]), mul(up, q[1])), mul(back, q[2]));
    let mut rows: Vec<Vec<(V3, [f32; 2], f32, V3)>> = Vec::with_capacity(RISE + DOWN + 1);
    for i in 0..=RISE + DOWN {
        // (the first rows rise from beside the opening's edge to the crest: the hood's mouth, which faces the neck)
        let (rise, down) = if i < RISE { (i as f32 / RISE as f32, 0.0) } else { (1.0, (i - RISE) as f32 / DOWN as f32) };
        let broad = half * if down < BROADEST { BROAD[0] + (BROAD[1] - BROAD[0]) * sm(0.0, BROADEST, down) } else { BROAD[1] * (1.0 - ((down - BROADEST) / (1.0 - BROADEST)).powf(1.15)) };
        // (the mouth rises steeply from the edge: the roll's top between edge and crest lies under it)
        let thick = (1.0 - (1.0 - rise) * (1.0 - rise)) * if down < THICKEST { THICK[0] + (THICK[1] - THICK[0]) * sm(0.0, THICKEST, down) } else { THICK[1] + (THICK[2] - THICK[1]) * sm(THICKEST, 1.0, down) };
        let mut row = Vec::with_capacity(ACROSS + 1);
        for j in 0..=ACROSS {
            let u = (std::f32::consts::FRAC_PI_2 * (2.0 * j as f32 / ACROSS as f32 - 1.0)).sin();
            let x = u * broad.max(0.03);
            // from the edge to the crest, then down the column from the crest, cell by cell, until the way along
            // the cloth is `down` of the length
            let (from, to) = (edge_at(x), crest(x)?);
            // (the mouth begins a facing's breadth from the edge: the edge itself lies on the bag, as the rim of
            // the collar, and a lord's fur with it)
            let gap = (to[0] - from[0]).hypot(to[1] - from[1]);
            let share = 1.0 - (1.0 - rise) * (1.0 - (BREADTH / gap.max(1e-6)).min(0.8));
            let [mut y, mut z] = [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share];
            let mut left = down * LONG;
            while left > 0.0 {
                let next = lies(x, y - CELL).map_or(z, |cloth| cloth.max(z));
                let step = CELL.hypot(next - z);
                if step >= left {
                    (y, z) = (y - CELL * left / step, z + (next - z) * left / step);
                    break;
                }
                (y, z, left) = (y - CELL, next, left - step);
            }
            let round = (1.0 - u.abs().powf(2.5)).max(0.0).powf(0.4);
            let fold = 1.0 - FOLD * sm(0.0, 0.3, down) * (0.5 - 0.5 * (std::f32::consts::TAU * FOLDS * u).cos());
            // (square to what it lies on, and up from the edge, where the mouth begins)
            let out = norm(madd(mul(off(x, y), rise), [0.0, 1.0, 0.0], 1.0 - rise));
            let mut q = madd([x, y, z], out, CLEAR + thick * round * fold);
            if rise < 1.0 {
                // (the mouth lies over the roll's top, which the depth seen from behind does not show)
                let over = roll.iter().map(|v| sub(*v, q)).filter(|d| len(madd(*d, out, -dot(*d, out))) < BESIDE).map(|d| dot(d, out) + CLEAR).fold(0.0, f32::max);
                q = madd(q, out, over);
            } else if let Some(cloth) = seen.most(q[0], q[1]) {
                q[2] = q[2].max(cloth + CLEAR);
            }
            row.push((add(middle, world(q)), [x * image, 0.5 + (down * LONG - (1.0 - share) * gap) * image], SHADE + (1.0 - SHADE) * sm(0.0, 0.5, round), world(out)));
        }
        rows.push(row);
    }
    // (no place of the bag at a hem's place in the image, which lies within a twentieth of its edge at 0: the
    // whole bag is shifted until its first place stands a tenth above it; the wool's image goes on unbroken)
    let first = rows.iter().flatten().map(|c| c.1[1]).fold(f32::MAX, f32::min);
    rows.iter_mut().flatten().for_each(|c| c.1[1] += 0.1 - first);
    // which way a corner faces: square to the bag there, away from the cloth under it
    let faces: Vec<Vec<V3>> = (0..=RISE + DOWN)
        .map(|i| {
            (0..=ACROSS)
                .map(|j| {
                    let along = sub(rows[(i + 1).min(RISE + DOWN)][j].0, rows[i.saturating_sub(1)][j].0);
                    let across = sub(rows[i][(j + 1).min(ACROSS)].0, rows[i][j.saturating_sub(1)].0);
                    let f = norm(cross(along, across));
                    if dot(f, rows[i][j].3) < 0.0 { mul(f, -1.0) } else { f }
                })
                .collect()
        })
        .collect();
    let mut s = Surface::new(hood.mat);
    (s.tex, s.nmap) = (hood.tex.clone(), hood.nmap.clone());
    for i in 0..RISE + DOWN {
        for j in 0..ACROSS {
            let quad = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)];
            let p = quad.map(|(a, b)| rows[a][b].0);
            // (wound so that a triangle faces where its corners face: the stage lights a cloth's back as its back)
            let turned = dot(cross(sub(p[1], p[0]), sub(p[2], p[0])), add(faces[i][j], faces[i + 1][j + 1])) < 0.0;
            for c in if turned { [0, 2, 1, 0, 3, 2] } else { [0, 1, 2, 0, 2, 3] } {
                let (a, b) = quad[c];
                s.pos.push(rows[a][b].0);
                s.nrm.push(faces[a][b]);
                s.uv.push(rows[a][b].1);
                s.col.push(mul(wool, rows[a][b].2));
            }
        }
    }
    Some(s)
}
