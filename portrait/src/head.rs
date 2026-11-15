//! The head and shoulders of the MakeHuman base mesh with its morph targets
//! (app/assets/portrait/head.bin.zst, made by tools/portrait/build_head.js).

use std::collections::HashMap;

/// Deltas are stored as i16 in 1/3000.
pub const DELTA_SCALE: f32 = 1.0 / 3000.0;

pub struct Target {
    pub ids: Vec<u16>,
    pub d: Vec<[i16; 3]>,
}

pub struct Head {
    /// Vertex count.
    pub n: usize,
    pub base: Vec<[f32; 3]>,
    /// Triangle lists per part, by level of detail: body 4, tights 2,
    /// hair, leye, reye 1.
    pub parts: HashMap<String, Vec<Vec<u32>>>,
    pub targets: HashMap<String, Target>,
    /// Per vertex, how much the lips, nose, cheeks, ears move under their
    /// targets, 0..1 (the Werkstatt's masks).
    pub lip: Vec<f32>,
    pub nose: Vec<f32>,
    pub cheek: Vec<f32>,
    pub ear: Vec<f32>,
    /// The base vertex nearest the right shoulder front, where the cloak's
    /// brooch sits.
    pub fibula: usize,
}

#[derive(Debug)]
pub struct Bad(pub &'static str);

struct Reader<'a> {
    b: &'a [u8],
    o: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8], Bad> {
        let s = self.b.get(self.o..self.o + n).ok_or(Bad("head: file too short"))?;
        self.o += n;
        Ok(s)
    }
    fn u32(&mut self) -> Result<u32, Bad> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }
    fn name(&mut self) -> Result<String, Bad> {
        let l = self.take(1)?[0] as usize;
        String::from_utf8(self.take(l)?.to_vec()).map_err(|_| Bad("head: bad name"))
    }
    fn u16s(&mut self, n: usize) -> Result<Vec<u16>, Bad> {
        Ok(self.take(2 * n)?.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect())
    }
}

impl Head {
    /// From the zstd-packed file's bytes.
    pub fn load(packed: &[u8]) -> Result<Head, Bad> {
        let raw = crate::real::unpack(packed).ok_or(Bad("head: not a zstd frame"))?;
        let mut r = Reader { b: &raw, o: 0 };
        if r.take(8)? != b"APOLHEAD" {
            return Err(Bad("head: not a head file"));
        }
        if r.u32()? != 1 {
            return Err(Bad("head: unknown version"));
        }
        let n = r.u32()? as usize;
        let base: Vec<[f32; 3]> = r
            .take(12 * n)?
            .chunks_exact(12)
            .map(|c| [0, 4, 8].map(|k| f32::from_le_bytes(c[k..k + 4].try_into().unwrap())))
            .collect();
        let mut parts = HashMap::new();
        for _ in 0..r.u32()? {
            let name = r.name()?;
            let mut levels = Vec::new();
            for _ in 0..r.u32()? {
                let c = r.u32()? as usize;
                levels.push(r.u16s(c)?.into_iter().map(|i| i as u32).collect::<Vec<u32>>());
            }
            parts.insert(name, levels);
        }
        let mut targets = HashMap::new();
        for _ in 0..r.u32()? {
            let name = r.name()?;
            let c = r.u32()? as usize;
            let ids = r.u16s(c)?;
            let d = r.u16s(3 * c)?.chunks_exact(3).map(|q| [q[0] as i16, q[1] as i16, q[2] as i16]).collect();
            targets.insert(name, Target { ids, d });
        }
        for p in ["body", "tights", "leye", "reye"] {
            if !parts.contains_key(p) {
                return Err(Bad("head: part missing"));
            }
        }
        if parts["body"].len() < 4 {
            return Err(Bad("head: body levels missing"));
        }
        let mask = |names: &[&str]| {
            let mut m = vec![0f32; n];
            for t in names.iter().filter_map(|k| targets.get(*k)) {
                for (j, &i) in t.ids.iter().enumerate() {
                    let d = t.d[j];
                    m[i as usize] += ((d[0] as f32).powi(2) + (d[1] as f32).powi(2) + (d[2] as f32).powi(2)).sqrt();
                }
            }
            let mx = m.iter().cloned().fold(0.0, f32::max);
            let mx = if mx > 0.0 { mx } else { 1.0 };
            m.iter_mut().for_each(|v| *v /= mx);
            m
        };
        let lip = mask(&["mouth/mouth-upperlip-volume-incr", "mouth/mouth-lowerlip-volume-incr"]);
        let nose = mask(&["nose/nose-scale-vert-incr", "nose/nose-scale-horiz-incr"]);
        let cheek = mask(&["cheek/l-cheek-volume-incr", "cheek/r-cheek-volume-incr"]);
        let ear = mask(&["ears/l-ear-scale-incr", "ears/r-ear-scale-incr"]);
        let mut fibula = 0;
        let mut best = f32::MAX;
        for &i in parts["body"].last().unwrap() {
            let b = base[i as usize];
            let d = ((b[0] + 1.05).powi(2) + (b[1] - 5.3).powi(2) + (b[2] - 0.55).powi(2)).sqrt();
            if d < best {
                best = d;
                fibula = i as usize;
            }
        }
        Ok(Head { n, base, parts, targets, lip, nose, cheek, ear, fibula })
    }

    /// The full body triangles.
    pub fn body_full(&self) -> &[u32] {
        self.parts["body"].last().unwrap()
    }
}
