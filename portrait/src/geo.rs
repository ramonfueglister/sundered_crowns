//! Small vector and colour helpers, and the triangle soup the parts are
//! built into.

pub type V3 = [f32; 3];

pub fn add(a: V3, b: V3) -> V3 {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
pub fn sub(a: V3, b: V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
pub fn mul(a: V3, s: f32) -> V3 {
    [a[0] * s, a[1] * s, a[2] * s]
}
/// a + b × s
pub fn madd(a: V3, b: V3, s: f32) -> V3 {
    [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]
}
pub fn dot(a: V3, b: V3) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
pub fn cross(a: V3, b: V3) -> V3 {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
pub fn len(a: V3) -> f32 {
    dot(a, a).sqrt()
}
/// Unit vector; a zero vector stays zero.
pub fn norm(a: V3) -> V3 {
    let l = len(a);
    if l > 0.0 {
        mul(a, 1.0 / l)
    } else {
        a
    }
}
pub fn mix(a: V3, b: V3, t: f32) -> V3 {
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

pub fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}
pub fn c01(t: f32) -> f32 {
    t.clamp(0.0, 1.0)
}
/// Smoothstep from a to b.
pub fn sm(a: f32, b: f32, x: f32) -> f32 {
    let t = c01((x - a) / (b - a));
    t * t * (3.0 - 2.0 * t)
}

/// The Werkstatt's mulberry32, so that the same seed gives the same draws.
pub struct Rng(u32);

impl Rng {
    pub fn new(seed: u32) -> Rng {
        Rng(seed)
    }
    pub fn next(&mut self) -> f32 {
        self.0 = self.0.wrapping_add(0x6D2B_79F5);
        let s = self.0;
        let mut t = (s ^ s >> 15).wrapping_mul(1 | s);
        t = t.wrapping_add((t ^ t >> 7).wrapping_mul(61 | t)) ^ t;
        ((t ^ t >> 14) as f64 / 4_294_967_296.0) as f32
    }
}

/// Stable noise per triangle from its vertex ids (the Werkstatt's `hash`).
pub fn hash(a: u32, b: u32, c: u32) -> f32 {
    let x = ((a as f64) * 12.9898 + (b as f64) * 78.233 + (c as f64) * 37.719).sin() * 43758.5453;
    (x - x.floor()) as f32
}

/// A colour in sRGB, as the Werkstatt mixes them; made linear only when a
/// triangle is put down.
pub type Rgb = [f32; 3];

pub fn hex(s: &str) -> Rgb {
    let s = s.trim_start_matches('#');
    let v = u32::from_str_radix(s, 16).unwrap_or(0);
    [((v >> 16) & 255) as f32 / 255.0, ((v >> 8) & 255) as f32 / 255.0, (v & 255) as f32 / 255.0]
}
pub fn cmix(a: Rgb, b: Rgb, t: f32) -> Rgb {
    mix(a, b, t)
}
pub fn cmul(a: Rgb, s: f32) -> Rgb {
    mul(a, s)
}
/// Colour stops evenly over 0..1.
pub fn chain(stops: &[&str], t: f32) -> Rgb {
    let t = c01(t) * (stops.len() - 1) as f32;
    let i = (t.floor() as usize).min(stops.len() - 2);
    cmix(hex(stops[i]), hex(stops[i + 1]), t - i as f32)
}
pub fn linear(c: Rgb) -> Rgb {
    let f = |c: f32| if c < 0.04045 { c * 0.077_399_38 } else { (c * 0.947_867_3 + 0.052_132_7).powf(2.4) };
    [f(c[0]), f(c[1]), f(c[2])]
}

/// The inverse of `linear`: linear light back to sRGB.
pub fn srgb(c: Rgb) -> Rgb {
    let f = |c: f32| if c < 0.003_130_8 { c * 12.92 } else { 1.055 * c.max(0.0).powf(1.0 / 2.4) - 0.055 };
    [f(c[0]), f(c[1]), f(c[2])]
}

/// How a part reflects light.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Mat {
    pub rough: f32,
    pub metal: f32,
    /// Drawn from both sides (hair, beard, cloth edges).
    pub double: bool,
}

pub const fn mat(rough: f32) -> Mat {
    Mat { rough, metal: 0.0, double: false }
}
pub const fn mat2(rough: f32) -> Mat {
    Mat { rough, metal: 0.0, double: true }
}

/// One material's triangles, three vertices each, counter-clockwise seen
/// from outside, colours linear.
#[derive(Clone, Debug)]
pub struct Surface {
    pub mat: Mat,
    pub pos: Vec<V3>,
    pub col: Vec<Rgb>,
    /// TEST: per-vertex texture coordinates and normals, and the texture
    /// file (MakeHuman hair cards); empty for faceted parts.
    pub uv: Vec<[f32; 2]>,
    pub nrm: Vec<V3>,
    pub tex: Option<String>,
    /// real look: a normal map other than the one beside the texture (name_n)
    pub nmap: Option<String>,
}

impl Surface {
    pub fn new(mat: Mat) -> Surface {
        Surface { mat, pos: Vec::new(), col: Vec::new(), uv: Vec::new(), nrm: Vec::new(), tex: None, nmap: None }
    }
    /// One vertex with an sRGB colour.
    pub fn put(&mut self, v: V3, c: Rgb) {
        self.pos.push(v);
        self.col.push(linear(c));
    }
    pub fn tri(&mut self, a: V3, b: V3, c: V3, col: Rgb) {
        let l = linear(col);
        self.pos.extend([a, b, c]);
        self.col.extend([l, l, l]);
    }
    /// a b c, a c d (the second slightly darker, as in the Werkstatt).
    pub fn quad(&mut self, a: V3, b: V3, c: V3, d: V3, col: Rgb) {
        self.tri(a, b, c, col);
        self.tri(a, c, d, cmul(col, 0.97));
    }
    pub fn tris(&self) -> usize {
        self.pos.len() / 3
    }
}

/// Rotation matrix of Euler angles applied X, then Y, then Z (three.js
/// order "XYZ").
pub fn euler(x: f32, y: f32, z: f32) -> [V3; 3] {
    let (a, b) = (x.cos(), x.sin());
    let (c, d) = (y.cos(), y.sin());
    let (e, f) = (z.cos(), z.sin());
    let (ae, af, be, bf) = (a * e, a * f, b * e, b * f);
    [[c * e, -c * f, d], [af + be * d, ae - bf * d, -b * c], [bf - ae * d, be + af * d, a * c]]
}
pub fn rot(m: &[V3; 3], v: V3) -> V3 {
    [dot(m[0], v), dot(m[1], v), dot(m[2], v)]
}

/// Icosahedron of radius 1 (three.js IcosahedronGeometry, detail 0).
pub fn icosahedron() -> (Vec<V3>, Vec<[usize; 3]>) {
    let t = (1.0 + 5f32.sqrt()) / 2.0;
    let v: Vec<V3> = [
        [-1.0, t, 0.0],
        [1.0, t, 0.0],
        [-1.0, -t, 0.0],
        [1.0, -t, 0.0],
        [0.0, -1.0, t],
        [0.0, 1.0, t],
        [0.0, -1.0, -t],
        [0.0, 1.0, -t],
        [t, 0.0, -1.0],
        [t, 0.0, 1.0],
        [-t, 0.0, -1.0],
        [-t, 0.0, 1.0],
    ]
    .iter()
    .map(|&p| norm(p))
    .collect();
    let f = vec![
        [0, 11, 5],
        [0, 5, 1],
        [0, 1, 7],
        [0, 7, 10],
        [0, 10, 11],
        [1, 5, 9],
        [5, 11, 4],
        [11, 10, 2],
        [10, 7, 6],
        [7, 1, 8],
        [3, 9, 4],
        [3, 4, 2],
        [3, 2, 6],
        [3, 6, 8],
        [3, 8, 9],
        [4, 9, 5],
        [2, 4, 11],
        [6, 2, 10],
        [8, 6, 7],
        [9, 8, 1],
    ];
    (v, f)
}

/// Octahedron of radius 1 (three.js OctahedronGeometry, detail 0).
pub fn octahedron() -> (Vec<V3>, Vec<[usize; 3]>) {
    let v = vec![[1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, -1.0, 0.0], [0.0, 0.0, 1.0], [0.0, 0.0, -1.0]];
    let f = vec![[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 2, 5], [1, 5, 3], [1, 3, 4], [1, 4, 2]];
    (v, f)
}
