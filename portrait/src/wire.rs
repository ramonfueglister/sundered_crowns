//! The bytes that cross between the game and the builder: a person going in, a portrait coming out. Both sides
//! read and write them by hand (src/portrait/wire.ts is the other side), all numbers little-endian.
//!
//! Person: lod u8, female u8, stand u8, known u8 (bit 0 loss_days, bit 1 rank, bit 2 clothes_pct), pid u32,
//! age f32, health f32, fed f32, loss_days f32, rank f32, clothes_pct f32, the 68 bytes of the genes, job and
//! origin as texts.
//!
//! Portrait: top, chin, cx, cz, fill f32, tris u32, the two background colours of the look (sRGB, 6 f32), the
//! look's name as text, the number of surfaces u32; then per surface rough f32, metal f32, double u8, texture and
//! normal map as texts (empty for none), vertices u32, texture coordinates u32, normals u32 (counts, 0 for none),
//! then positions (3 f32 each), colours (3 f32 each, linear), texture coordinates (2 f32 each), normals (3 f32
//! each). A text is its length in bytes as u16 and its UTF-8 bytes.

use crate::look::{Look, STANDS};
use crate::person::{look_of, Lived};
use crate::{Portrait, NG};

/// A person as the bytes describe them, and the level of detail asked for.
pub struct Asked {
    pub look: Look,
    pub lod: usize,
}

struct Reader<'a> {
    b: &'a [u8],
    o: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8], String> {
        let s = self.b.get(self.o..self.o + n).ok_or("the person's bytes end too early")?;
        self.o += n;
        Ok(s)
    }
    fn u8(&mut self) -> Result<u8, String> {
        Ok(self.take(1)?[0])
    }
    fn u32(&mut self) -> Result<u32, String> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }
    fn f32(&mut self) -> Result<f32, String> {
        Ok(f32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }
    fn text(&mut self) -> Result<&'a str, String> {
        let n = u16::from_le_bytes(self.take(2)?.try_into().unwrap()) as usize;
        std::str::from_utf8(self.take(n)?).map_err(|_| "a text of the person is not UTF-8".to_string())
    }
}

/// Reads a person.
pub fn person(bytes: &[u8]) -> Result<Asked, String> {
    let mut r = Reader { b: bytes, o: 0 };
    let lod = r.u8()?.min(3) as usize;
    let female = r.u8()? != 0;
    let stand = r.u8()?.min(3);
    let known = r.u8()?;
    let pid = r.u32()?;
    let (age, health, fed) = (r.f32()?, r.f32()?, r.f32()?);
    let (loss_days, rank, clothes_pct) = (r.f32()?, r.f32()?, r.f32()?);
    let genes = r.take(2 * NG)?;
    let job = r.text()?;
    let origin = r.text()?;
    if r.o != bytes.len() {
        return Err("the person's bytes are longer than a person".to_string());
    }
    let lived = Lived {
        loss_days: (known & 1 != 0).then_some(loss_days),
        rank: (known & 2 != 0).then_some(rank),
        clothes_pct: (known & 4 != 0).then_some(clothes_pct),
    };
    Ok(Asked { look: look_of(genes, female, age, stand, job, health, fed, pid, origin, lived), lod })
}

fn text(out: &mut Vec<u8>, s: &str) {
    out.extend((s.len() as u16).to_le_bytes());
    out.extend(s.as_bytes());
}

fn floats<const N: usize>(out: &mut Vec<u8>, v: &[[f32; N]]) {
    for q in v {
        for x in q {
            out.extend(x.to_le_bytes());
        }
    }
}

/// Writes a portrait and the background of its look.
pub fn portrait(p: &Portrait, look: &Look) -> Vec<u8> {
    let st = &STANDS[look.stand.min(STANDS.len() - 1)];
    let mut out = Vec::with_capacity(64 + p.tris * 3 * 44);
    for x in [p.top, p.chin, p.cx, p.cz, p.fill] {
        out.extend(x.to_le_bytes());
    }
    out.extend((p.tris as u32).to_le_bytes());
    floats(&mut out, &st.bg.map(crate::geo::hex));
    text(&mut out, st.key);
    out.extend((p.surfaces.len() as u32).to_le_bytes());
    for s in &p.surfaces {
        out.extend(s.mat.rough.to_le_bytes());
        out.extend(s.mat.metal.to_le_bytes());
        out.push(s.mat.double as u8);
        text(&mut out, s.tex.as_deref().unwrap_or(""));
        text(&mut out, s.nmap.as_deref().unwrap_or(""));
        for n in [s.pos.len(), s.uv.len(), s.nrm.len()] {
            out.extend((n as u32).to_le_bytes());
        }
        floats(&mut out, &s.pos);
        floats(&mut out, &s.col);
        floats(&mut out, &s.uv);
        floats(&mut out, &s.nrm);
    }
    out
}
