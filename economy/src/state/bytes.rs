//! The numbers, lists and maps of a state as bytes ([`Out`]) and back ([`In`]): little endian, counts and positions
//! in 32 bits with [`NONE`] for "none", amounts as the 64 bits of the float.

use std::collections::HashMap;

/// A count or position that is not there.
pub(super) const NONE: u32 = u32::MAX;

pub(super) struct Out(pub(super) Vec<u8>);

impl Out {
    pub(super) fn bool(&mut self, v: bool) {
        self.0.push(v as u8);
    }
    pub(super) fn u32(&mut self, v: u32) {
        self.0.extend_from_slice(&v.to_le_bytes());
    }
    pub(super) fn u64(&mut self, v: u64) {
        self.0.extend_from_slice(&v.to_le_bytes());
    }
    pub(super) fn i64(&mut self, v: i64) {
        self.0.extend_from_slice(&v.to_le_bytes());
    }
    pub(super) fn f64(&mut self, v: f64) {
        self.0.extend_from_slice(&v.to_bits().to_le_bytes());
    }
    /// A count or a position. The format holds 32 bits; `u32::MAX` is kept for "none".
    pub(super) fn n(&mut self, v: usize) {
        assert!((v as u64) < NONE as u64, "{v} does not fit the state format");
        self.u32(v as u32);
    }
    pub(super) fn opt(&mut self, v: Option<usize>) {
        match v {
            Some(v) => self.n(v),
            None => self.u32(NONE),
        }
    }
    pub(super) fn f64s(&mut self, v: &[f64]) {
        self.n(v.len());
        for &x in v {
            self.f64(x);
        }
    }
    pub(super) fn bytes(&mut self, v: &[u8]) {
        self.n(v.len());
        self.0.extend_from_slice(v);
    }
    pub(super) fn i64s(&mut self, v: &[i64]) {
        self.n(v.len());
        for &x in v {
            self.i64(x);
        }
    }
    pub(super) fn ns(&mut self, v: &[usize]) {
        self.n(v.len());
        for &x in v {
            self.n(x);
        }
    }
    pub(super) fn opts(&mut self, v: &[Option<usize>]) {
        self.n(v.len());
        for &x in v {
            self.opt(x);
        }
    }
    pub(super) fn f64ss(&mut self, v: &[Vec<f64>]) {
        self.n(v.len());
        for x in v {
            self.f64s(x);
        }
    }
    pub(super) fn nss(&mut self, v: &[Vec<usize>]) {
        self.n(v.len());
        for x in v {
            self.ns(x);
        }
    }
    /// The positions by ID, sorted by ID: a hash map has no order of its own, the bytes must have one.
    pub(super) fn map(&mut self, m: &HashMap<usize, usize>) {
        let mut pairs: Vec<(usize, usize)> = m.iter().map(|(&k, &v)| (k, v)).collect();
        pairs.sort_unstable();
        self.n(pairs.len());
        for (k, v) in pairs {
            self.n(k);
            self.n(v);
        }
    }
}

pub(super) struct In<'a> {
    pub(super) b: &'a [u8],
    pub(super) at: usize,
}

pub(super) type Res<T> = Result<T, String>;

impl In<'_> {
    pub(super) fn take(&mut self, n: usize) -> Res<&[u8]> {
        let end = self.at.checked_add(n).filter(|&e| e <= self.b.len());
        let Some(end) = end else {
            return Err(format!(
                "the state ends at byte {}, {n} more are needed at {}",
                self.b.len(),
                self.at
            ));
        };
        let s = &self.b[self.at..end];
        self.at = end;
        Ok(s)
    }
    pub(super) fn bool(&mut self) -> Res<bool> {
        match self.take(1)?[0] {
            0 => Ok(false),
            1 => Ok(true),
            x => Err(format!("{x} is not a yes or no (byte {})", self.at - 1)),
        }
    }
    pub(super) fn u32(&mut self) -> Res<u32> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }
    pub(super) fn u64(&mut self) -> Res<u64> {
        Ok(u64::from_le_bytes(self.take(8)?.try_into().unwrap()))
    }
    pub(super) fn i64(&mut self) -> Res<i64> {
        Ok(i64::from_le_bytes(self.take(8)?.try_into().unwrap()))
    }
    pub(super) fn f64(&mut self) -> Res<f64> {
        Ok(f64::from_bits(self.u64()?))
    }
    pub(super) fn n(&mut self) -> Res<usize> {
        match self.u32()? {
            NONE => Err(format!("a count is missing (byte {})", self.at - 4)),
            v => Ok(v as usize),
        }
    }
    pub(super) fn opt(&mut self) -> Res<Option<usize>> {
        Ok(match self.u32()? {
            NONE => None,
            v => Some(v as usize),
        })
    }
    /// The length of a list whose entries take at least `size` bytes each (a broken length must not ask for memory
    /// the state cannot fill).
    pub(super) fn len(&mut self, size: usize) -> Res<usize> {
        let n = self.n()?;
        if n.saturating_mul(size) > self.b.len() - self.at {
            return Err(format!(
                "a list of {n} entries does not fit the rest of the state (byte {})",
                self.at - 4
            ));
        }
        Ok(n)
    }
    pub(super) fn f64s(&mut self) -> Res<Vec<f64>> {
        (0..self.len(8)?).map(|_| self.f64()).collect()
    }
    pub(super) fn bytes(&mut self) -> Res<Vec<u8>> {
        let n = self.len(1)?;
        Ok(self.take(n)?.to_vec())
    }
    pub(super) fn i64s(&mut self) -> Res<Vec<i64>> {
        (0..self.len(8)?).map(|_| self.i64()).collect()
    }
    pub(super) fn ns(&mut self) -> Res<Vec<usize>> {
        (0..self.len(4)?).map(|_| self.n()).collect()
    }
    pub(super) fn opts(&mut self) -> Res<Vec<Option<usize>>> {
        (0..self.len(4)?).map(|_| self.opt()).collect()
    }
    pub(super) fn f64ss(&mut self) -> Res<Vec<Vec<f64>>> {
        (0..self.len(4)?).map(|_| self.f64s()).collect()
    }
    pub(super) fn nss(&mut self) -> Res<Vec<Vec<usize>>> {
        (0..self.len(4)?).map(|_| self.ns()).collect()
    }
    pub(super) fn map(&mut self) -> Res<HashMap<usize, usize>> {
        let n = self.len(8)?;
        let mut m = HashMap::with_capacity(n);
        for _ in 0..n {
            let (k, v) = (self.n()?, self.n()?);
            m.insert(k, v);
        }
        Ok(m)
    }
}
