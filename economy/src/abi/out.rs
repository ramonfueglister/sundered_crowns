//! The result of a call, where the caller reads it ([`OUT`]), and lists of numbers as its bytes.

use std::cell::RefCell;
use std::rc::Rc;

thread_local! {
    /// The result of the last call.
    pub(super) static OUT: RefCell<Rc<Vec<u8>>> = RefCell::new(Rc::new(Vec::new()));
}

pub(super) fn answer(r: Result<Rc<Vec<u8>>, String>) -> u32 {
    let (ok, bytes) = match r {
        Ok(b) => (1, b),
        Err(e) => (0, Rc::new(e.into_bytes())),
    };
    OUT.with(|o| *o.borrow_mut() = bytes);
    ok
}

pub(super) fn floats(v: impl IntoIterator<Item = f64>) -> Rc<Vec<u8>> {
    let v = v.into_iter();
    let mut out = Vec::with_capacity(8 * v.size_hint().0);
    for x in v {
        out.extend_from_slice(&x.to_le_bytes());
    }
    Rc::new(out)
}

/// The lists of every city one after the other as [`floats`]: one list of bytes of the right length at once
/// (the persons and firms of 550 cities are 1.3 million numbers: byte by byte through a flattening iterator,
/// they were a tenth of the time of a day of the world).
pub(super) fn float_lists(lists: impl IntoIterator<Item = Vec<f64>>) -> Rc<Vec<u8>> {
    let lists: Vec<Vec<f64>> = lists.into_iter().collect();
    let mut out = Vec::with_capacity(8 * lists.iter().map(Vec::len).sum::<usize>());
    for l in &lists {
        for x in l {
            out.extend_from_slice(&x.to_le_bytes());
        }
    }
    Rc::new(out)
}
