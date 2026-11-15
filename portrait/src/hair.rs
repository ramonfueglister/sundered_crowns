//! Hair of the simple look, built as geometry: single strands, masses sculpted in a grid round the head (beards,
//! women's hair), and the cap of strands on the skull.

use crate::caster::Caster;
use crate::geo::*;

/// A tapered, bent triangular prism rooted on the skin at `r` (normal `n`),
/// growing along `dir`.
#[allow(clippy::too_many_arguments)]
pub(crate) fn strand(out: &mut Surface, r: V3, n: V3, dir: V3, ln: f32, w: f32, h: f32, col: Rgb, arch: f32, tip_shade: f32) {
    let mut d = madd(dir, n, -dot(dir, n));
    if dot(d, d) < 1e-6 {
        d = [0.0, -1.0, 0.0];
    }
    let d = norm(d);
    let sd = norm(cross(n, d));
    let root = madd(r, n, -0.012);
    let mid = madd(madd(root, d, ln * 0.55), n, ln * arch);
    let d2 = norm(madd(d, n, -arch * 0.9 - 0.18));
    let tip = madd(madd(mid, d2, ln * 0.5), n, -ln * arch * 0.15);
    let ring = |c: V3, ww: f32, hh: f32| [madd(c, sd, ww), madd(c, sd, -ww), madd(madd(c, n, hh), sd, ww * 0.15)];
    let (r0, r1) = (ring(root, w, h), ring(mid, w * 0.62, h * 0.7));
    let (c0, c1, c2) = (cmul(col, 0.8), col, cmul(col, tip_shade));
    for i in 0..3 {
        let j = (i + 1) % 3;
        out.put(r0[i], c0);
        out.put(r0[j], c0);
        out.put(r1[j], c1);
        out.put(r0[i], c0);
        out.put(r1[j], c1);
        out.put(r1[i], c1);
        out.put(r1[i], c1);
        out.put(r1[j], c1);
        out.put(tip, c2);
    }
}

/// A sculpted mass (beard, moustache) in the cylinder grid around the head
/// axis: columns from `f0` to `f1` degrees, rows from `top` to `bot`.
pub(crate) struct Sculpt<'a> {
    pub(crate) f0: f32,
    pub(crate) f1: f32,
    pub(crate) rows: usize,
    pub(crate) bands: usize,
    pub(crate) blen: f32,
    pub(crate) tuft_h: f32,
    pub(crate) conv: f32,
    pub(crate) slant: f32,
    pub(crate) taper: f32,
    pub(crate) depth: f32,
    pub(crate) ridge: f32,
    pub(crate) wave: f32,
    pub(crate) wave_f: f32,
    pub(crate) chest_t: f32,
    pub(crate) col: &'a dyn Fn(f32) -> Rgb,
    pub(crate) cw: &'a [usize],
    pub(crate) pinch: f32,
    pub(crate) drift: f32,
    pub(crate) jit: f32,
    pub(crate) top: &'a dyn Fn(f32) -> f32,
    pub(crate) bot: &'a dyn Fn(f32, f32, f32) -> f32,
    pub(crate) thick: &'a dyn Fn(f32, f32, f32) -> f32,
}

/// The skin's radius around the beard axis, by angle and height.
pub(crate) struct Raster {
    pub(crate) rs: Vec<f32>,
    pub(crate) f0: f32,
    pub(crate) fs: f32,
    pub(crate) nf: usize,
    pub(crate) ya: f32,
    pub(crate) ys: f32,
    pub(crate) ny: usize,
}

impl Raster {
    pub(crate) fn at(&self, f: f32, y: f32) -> f32 {
        let fi = c01((f - self.f0) / self.fs / (self.nf - 1) as f32) * (self.nf - 1) as f32;
        let yj = c01((y - self.ya) / self.ys / (self.ny - 1) as f32) * (self.ny - 1) as f32;
        let i = (fi.floor() as usize).min(self.nf - 2);
        let j = (yj.floor() as usize).min(self.ny - 2);
        let (u, w) = (fi - i as f32, yj - j as f32);
        let r = |i: usize, j: usize| self.rs[i * self.ny + j];
        (r(i, j) * (1.0 - u) + r(i + 1, j) * u) * (1.0 - w) + (r(i, j + 1) * (1.0 - u) + r(i + 1, j + 1) * u) * w
    }
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn sculpt(out: &mut Surface, rng: &mut Rng, o: &Sculpt, rs: &Raster, zc: f32, cols: f32, hs: f32, ym60: f32) {
    let nc = 3.max(jround((o.f1 - o.f0) / cols) as i32 | 1) as usize;
    let nr = o.rows;
    struct Cl {
        s: usize,
        w: usize,
        r: f32,
        d: f32,
    }
    // tufts: 2–4 columns make one lock; its edges are grooves, the middle a
    // ridge that ends in a point at the bottom
    let mut cl: Vec<Cl> = Vec::new();
    let mut s0 = 0;
    while s0 < nc - 1 {
        let mut w = o.cw[((rng.next() * o.cw.len() as f32) as usize).min(o.cw.len() - 1)];
        if s0 + w > nc - 1 {
            w = nc - 1 - s0;
        }
        let r = rng.next();
        let d = rng.next() - 0.5;
        cl.push(Cl { s: s0, w, r, d });
        s0 += w;
    }
    let cl_of = |ci: usize| cl.iter().find(|c| ci >= c.s && ci <= c.s + c.w).unwrap_or(cl.last().unwrap());
    let f_at = |ci: f32| o.f0 + (o.f1 - o.f0) * ci / (nc - 1) as f32;
    let sgn = |x: f32| if x > 0.0 { 1.0 } else if x < 0.0 { -1.0 } else { 0.0 };
    let (mut fr, mut bk, mut po, mut nrm) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for ci in 0..nc {
        let f = f_at(ci as f32);
        let a = f.abs();
        let sg = sgn(f);
        let c = cl_of(ci);
        let pos = 2.0 * (ci as f32 - c.s as f32) / c.w as f32 - 1.0;
        let ap = pos.abs();
        let fc0 = f_at(c.s as f32 + c.w as f32 / 2.0);
        let yt = (o.top)(a);
        let yb = (o.bot)(a, ap, c.r).min(yt - 0.04 * hs);
        let prof = 1.0 - 1.7 * ap * ap;
        let (mut fc, mut bc, mut nr_) = (Vec::new(), Vec::new(), Vec::new());
        let (mut rr, mut yp) = (-9f32, yt);
        for ri in 0..=nr {
            let v = ri as f32 / nr as f32;
            let y = yt + (yb - yt) * v;
            let cv = 1.0 - o.conv * sm(0.3, 1.0, v);
            let mut fv = f * cv + sg * o.slant * v;
            if ap < 0.99 {
                fv = lerp(fv, fc0 * cv + sgn(fc0) * o.slant * v, o.pinch * sm(0.55, 1.0, v));
            }
            fv += c.d * o.drift * sm(0.25, 1.0, v);
            let s = rs.at(fv, y);
            let mut rf = s + (o.thick)(a, v, yt - y) * hs;
            if y < ym60 {
                rf = rf.max(s + o.chest_t);
            }
            if ri > 0 {
                rf = rf.max(rr - o.taper * (yp - y));
            }
            rr = rf;
            yp = y;
            let r_f = rf + (o.ridge * (0.6 + 0.7 * c.r) * prof + o.wave * (v * o.wave_f + c.s as f32 * 1.9).sin()) * sm(0.0, 0.3, v) + (rng.next() - 0.5) * o.jit;
            let dep = o.depth * (1.0 - 0.8 * sm(0.7, 1.0, v)) + 0.008;
            let r_b = (r_f - 0.008).min((s - 0.014).max(r_f - dep));
            let (sn, cs) = ((fv * D2R).sin(), (fv * D2R).cos());
            fc.push([r_f * sn, y, zc + r_f * cs]);
            bc.push([r_b * sn, y, zc + r_b * cs]);
            nr_.push([sn, 0.0, cs]);
        }
        fr.push(fc);
        bk.push(bc);
        po.push(ap);
        nrm.push(nr_);
    }
    for ci in 0..nc - 1 {
        let lit = 0.7 + 0.32 * (1.0 - (po[ci] + po[ci + 1]) / 2.0);
        for ri in 0..nr {
            let v = (ri as f32 + 0.5) / nr as f32;
            let yy = (fr[ci][ri][1] + fr[ci + 1][ri + 1][1]) / 2.0;
            let base = cmul((o.col)(yy), lit * (0.8 + 0.2 * sm(0.0, 0.35, v)) * (0.92 + 0.14 * rng.next()));
            out.tri(fr[ci][ri], fr[ci + 1][ri], fr[ci + 1][ri + 1], base);
            out.tri(fr[ci][ri], fr[ci + 1][ri + 1], fr[ci][ri + 1], cmul(base, 0.97));
            let dk = cmul(base, 0.5);
            out.tri(bk[ci][ri], bk[ci + 1][ri + 1], bk[ci + 1][ri], dk);
            out.tri(bk[ci][ri], bk[ci][ri + 1], bk[ci + 1][ri + 1], dk);
        }
    }
    for ci in 0..nc - 1 {
        for ri in [0, nr] {
            let dk = cmul((o.col)(fr[ci][ri][1]), if ri > 0 { 0.68 } else { 0.62 });
            out.tri(fr[ci][ri], bk[ci][ri], bk[ci + 1][ri], dk);
            out.tri(fr[ci][ri], bk[ci + 1][ri], fr[ci + 1][ri], dk);
        }
    }
    for ci in [0, nc - 1] {
        for ri in 0..nr {
            let dk = cmul((o.col)(fr[ci][ri][1]), 0.72);
            out.tri(fr[ci][ri], bk[ci][ri], bk[ci][ri + 1], dk);
            out.tri(fr[ci][ri], bk[ci][ri + 1], fr[ci][ri + 1], dk);
        }
    }
    // shingle tufts: per lock and layer a flat point with a middle ridge,
    // staggered like roof tiles
    let up = |q: V3, n: V3, h: f32| [q[0] + n[0] * h, q[1], q[2] + n[2] * h];
    if o.bands > 0 {
        for (k, c) in cl.iter().enumerate() {
            let cc = c.s + jround(c.w as f32 / 2.0) as usize;
            for b in 0..o.bands {
                let v0 = (b as f32 + (k % 2) as f32 * 0.5 + 0.15 * (c.r - 0.5)) / o.bands as f32;
                if v0 > 0.92 {
                    continue;
                }
                let r0 = jround(v0 * nr as f32).max(0.0) as usize;
                let r1 = (nr as f32).min((r0 as f32 + 1.0).max(jround((v0 + o.blen / o.bands as f32) * nr as f32))) as usize;
                let rm = (r0 + r1) >> 1;
                let h = o.tuft_h * (0.7 + 0.6 * rng.next()) * if r0 > 0 { 1.0 } else { 0.5 };
                let l = up(fr[c.s][r0], nrm[c.s][r0], 0.004);
                let rr = up(fr[c.s + c.w][r0], nrm[c.s + c.w][r0], 0.004);
                let m = up(fr[cc][rm], nrm[cc][rm], h);
                let tp = up(fr[cc][r1], nrm[cc][r1], h * 0.35);
                let col = cmul((o.col)(m[1]), 0.98 + 0.16 * rng.next());
                out.tri(l, m, tp, col);
                out.tri(m, rr, tp, cmul(col, 0.94));
                out.tri(l, rr, m, cmul(col, 0.6));
            }
        }
    }
}

/// The skin seen from the head's centre along `d`: the farthest hit, since
/// the nearest can lie inside the head (the eye sockets), unless the
/// farthest is already the shoulder (more than 1.2 head sizes out); -1 when
/// nothing is hit.
pub(crate) fn outer_skin(cast: &Caster, d: V3, hs: f32) -> f32 {
    let (near, far) = (cast.cast(d, false), cast.cast(d, true));
    if far > 1.2 * hs {
        near
    } else {
        far
    }
}

/// Short hair as a sculpted cap, like the beard (Ramon, 31.10.2026: strands
/// read as noise at portrait size): a shell with real thickness over the
/// skull, cut into locks combed from the crown forward and down, each a
/// ridge with grooves at its edges, pinched to a point at the hairline, as
/// the comma-shaped locks of Tetrarchic and Constantinian portraits. Wavy
/// hair waves along the lock, curly hair is a thicker shell under curls.
/// `bald` (0..1.7) takes the front back and then the crown; `hidden` drops
/// what a hat covers.
#[allow(clippy::too_many_arguments)]
pub(crate) fn cap_hair(out: &mut Surface, rng: &mut Rng, cast: &Caster, hc: V3, hs: f32, hair: Rgb, curl: f32, bald: f32, age: f32, ear: (f32, f32, f32), hidden: &dyn Fn(V3) -> bool) {
    let dd = |th: f32, el: f32| [(el * D2R).cos() * (th * D2R).sin(), (el * D2R).sin(), (el * D2R).cos() * (th * D2R).cos()];
    let skin = |d: V3| {
        let r = outer_skin(cast, d, hs);
        if r > 0.0 {
            r
        } else {
            0.9 * hs
        }
    };
    let slerp = |a: V3, b: V3, t: f32| {
        let c = dot(a, b).clamp(-1.0, 1.0);
        let w = c.acos();
        if w < 1e-4 {
            return a;
        }
        let s = w.sin();
        norm(add(mul(a, ((1.0 - t) * w).sin() / s), mul(b, (t * w).sin() / s)))
    };
    // the hairline's height (degrees above the head's centre) by the angle
    // from the front; it recedes at the temples first, then in front
    let rec = c01((bald - 0.25) / 0.9);
    // (temple corners, sideburns in front of the ear, over the ear, nape)
    let (e0, e1, et) = ear;
    let line: [(f32, f32); 13] = [
        (0.0, 20.0 + 12.0 * rec),
        (25.0, 18.0 + 18.0 * rec),
        (40.0, 8.0 + 14.0 * rec),
        (e0 - 9.0, -8.0 + 8.0 * rec),
        (e0 - 5.0, -26.0 + 10.0 * rec),
        (e0 - 2.0, -33.0 + 10.0 * rec),
        (e0 + 2.0, et - 2.0),
        (e0 + 6.0, et + 2.0),
        (e1 - 4.0, et + 2.0),
        (e1 + 8.0, -16.0),
        (e1 + 22.0, -32.0),
        (150.0, -42.0),
        (180.0, -48.0),
    ];
    let hairline = |th: f32| {
        let a = th.abs().min(180.0);
        let k = line.iter().position(|q| q.0 >= a).unwrap_or(line.len() - 1).max(1);
        let (p0, p1) = (line[k - 1], line[k]);
        lerp(p0.1, p1.1, (a - p0.0) / (p1.0 - p0.0))
    };
    // the crown goes bald from the top down
    let top_bald = if bald > 0.4 { 92.0 - (bald - 0.4) * 78.0 } else { 999.0 };
    let whorl = norm(dd(180.0, 56.0));
    let kid = c01(age / 4.0);
    let thick = (0.055 + 0.03 * rng.next() + 0.045 * curl) * hs * lerp(0.35, 1.0, kid);
    let ridge_h = 0.032 * hs * (1.0 - sm(0.55, 0.85, curl)) * lerp(0.4, 1.0, kid);
    let wave = 0.014 * hs * sm(0.25, 0.55, curl) * (1.0 - sm(0.7, 0.9, curl));
    let (nc, nr) = (96usize, 12usize);
    // locks of two to four columns, from the back round to the back
    struct Lock {
        s: usize,
        w: usize,
        r: f32,
        d: f32,
    }
    let mut locks = Vec::new();
    let mut s0 = 0;
    while s0 < nc {
        let w = [3, 4, 4, 5, 6][((rng.next() * 5.0) as usize).min(4)].min(nc - s0);
        locks.push(Lock { s: s0, w, r: rng.next(), d: rng.next() - 0.5 });
        s0 += w;
    }
    let lock_of = |ci: usize| locks.iter().find(|l| ci >= l.s && ci <= l.s + l.w).unwrap_or(locks.last().unwrap());
    let th_of = |ci: f32| -180.0 + 360.0 * ci / nc as f32;
    let mut fr = vec![vec![[0f32; 3]; nr + 1]; nc + 1];
    let mut sk = fr.clone();
    let mut ok = vec![vec![false; nr + 1]; nc + 1];
    let mut lit = vec![0f32; nc + 1];
    for ci in 0..=nc {
        let l = lock_of(ci.min(nc - 1));
        let l = if ci == nc { &locks[0] } else { l };
        let cpos = if ci == nc { 0.0 } else { ci as f32 - l.s as f32 };
        let pos = 2.0 * cpos / l.w as f32 - 1.0;
        lit[ci] = 0.72 + 0.3 * (1.0 - pos.abs());
        let th = th_of(ci as f32);
        let thm = th_of(l.s as f32 + l.w as f32 / 2.0);
        // the lock's middle reaches below the hairline, most in front: the
        // point of a comma lock on the forehead; each lock ends a little
        // higher or lower and leans a little aside
        let tip = lerp(9.0, 3.0, sm(30.0, 80.0, thm.abs())) * (0.7 + 0.6 * l.r);
        let lean = l.d * lerp(10.0, 4.0, sm(30.0, 80.0, thm.abs()));
        for ri in 0..=nr {
            let v = ri as f32 / nr as f32;
            // towards its end the lock narrows to its middle (sideways
            // only, so that sideburns and the line over the ear stay)
            let tv = lerp(th, thm, 0.8 * sm(0.62, 1.0, v)) + lean * sm(0.3, 1.0, v);
            let tgt = norm(dd(tv, hairline(tv) - tip * (1.0 - pos * pos) + 2.0 * l.d));
            let d = slerp(whorl, tgt, v);
            let s = skin(d);
            let el = d[1].asin() / D2R;
            let tn = (thick * (1.0 - 0.75 * sm(0.5, 1.0, v))).max(0.014 * hs) + ridge_h * (0.6 + 0.7 * l.r) * (1.0 - pos * pos) * sm(0.0, 0.3, v) + wave * (v * 9.0 + l.s as f32 * 1.9).sin() * sm(0.1, 0.4, v) + (rng.next() - 0.5) * 0.004 * hs;
            let q = madd(hc, d, s + tn);
            fr[ci][ri] = q;
            sk[ci][ri] = madd(hc, d, s - 0.004 * hs);
            ok[ci][ri] = !(el > top_bald && th.abs() < 165.0) && !hidden(q);
        }
    }
    // no islands: below the first bald row from the end up, all is bald
    for row in ok.iter_mut() {
        if let Some(last) = (0..=nr).rev().find(|&ri| !row[ri]) {
            row[..=last].iter_mut().for_each(|o| *o = false);
        }
        if row.iter().filter(|&&o| o).count() < 4 {
            row.iter_mut().for_each(|o| *o = false);
        }
    }
    let col = |ci: usize, ri: usize, v: f32, rng: &mut Rng| cmul(hair, (lit[ci] + lit[ci + 1]) / 2.0 * (0.8 + 0.2 * sm(0.0, 0.35, v)) * (0.92 + 0.14 * rng.next()) * if ri.is_multiple_of(2) { 1.0 } else { 0.97 });
    for ci in 0..nc {
        for ri in 0..nr {
            if !(ok[ci][ri] && ok[ci + 1][ri] && ok[ci][ri + 1] && ok[ci + 1][ri + 1]) {
                continue;
            }
            let v = (ri as f32 + 0.5) / nr as f32;
            let c = col(ci, ri, v, rng);
            out.tri(fr[ci][ri], fr[ci + 1][ri + 1], fr[ci + 1][ri], c);
            out.tri(fr[ci][ri], fr[ci][ri + 1], fr[ci + 1][ri + 1], cmul(c, 0.97));
            // the edge where the hair ends: at the hairline, and towards a
            // bald crown above
            let dk = cmul(hair, 0.62);
            if ri + 1 < nr && !(ok[ci][ri + 2] && ok[ci + 1][ri + 2]) {
                let r1 = ri + 1;
                out.tri(fr[ci][r1], sk[ci][r1], sk[ci + 1][r1], dk);
                out.tri(fr[ci][r1], sk[ci + 1][r1], fr[ci + 1][r1], dk);
            }
            if ri > 0 && !(ok[ci][ri - 1] && ok[ci + 1][ri - 1]) {
                out.tri(fr[ci][ri], fr[ci + 1][ri], sk[ci + 1][ri], dk);
                out.tri(fr[ci][ri], sk[ci + 1][ri], sk[ci][ri], dk);
            }
        }
    }
    // curls on the shell
    if curl > 0.6 {
        let ico = icosahedron();
        let share = sm(0.6, 0.9, curl);
        for (ci, ri) in (0..nc).step_by(3).flat_map(|ci| (1..nr).map(move |ri| (ci, ri))) {
            let ci = (ci + (ri % 2) + (rng.next() * 2.0) as usize).min(nc - 1);
            if !ok[ci][ri] || rng.next() > share {
                continue;
            }
            let q = fr[ci][ri];
            let nd = norm(sub(q, hc));
            let r = (0.05 + 0.03 * rng.next()) * hs * lerp(0.5, 1.0, kid) * lerp(1.0, 0.7, ri as f32 / nr as f32);
            let m = euler(rng.next() * 3.0, rng.next() * 3.0, 0.0);
            solid(out, &ico, madd(q, nd, 0.25 * r), [r, r * 0.8, r], &m, cmul(hair, 0.82 + 0.25 * rng.next()));
        }
    }
}
