//! The builder as the game calls it from the browser (src/portrait/builder.ts): hand the head and the files of the
//! real look in, then ask for portraits. Texts and bytes go in through memory from `scp_alloc`; a result lies at
//! `scp_out_ptr` with `scp_out_len` bytes until the next call. Every call answers 1 (the result is what was asked
//! for) or 0 (the result is the reason as text).
#![cfg(target_arch = "wasm32")]

use crate::{build, real, wire, Head};
use std::cell::RefCell;

thread_local! {
    static OUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static HEAD: RefCell<Option<Head>> = const { RefCell::new(None) };
}

fn answer(r: Result<Vec<u8>, String>) -> u32 {
    let (ok, bytes) = match r {
        Ok(b) => (1, b),
        Err(e) => (0, e.into_bytes()),
    };
    OUT.with(|o| *o.borrow_mut() = bytes);
    ok
}

/// SAFETY: `ptr` and `len` describe memory from [`scp_alloc`] that the caller has filled.
unsafe fn bytes<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
    if len == 0 { &[] } else { unsafe { std::slice::from_raw_parts(ptr, len) } }
}

unsafe fn text<'a>(ptr: *const u8, len: usize) -> Result<&'a str, String> {
    std::str::from_utf8(unsafe { bytes(ptr, len) }).map_err(|e| format!("a path is not text: {e}"))
}

/// Memory for an input of `len` bytes.
#[unsafe(no_mangle)]
pub extern "C" fn scp_alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// Gives memory from [`scp_alloc`] back.
///
/// # Safety
///
/// `ptr` came from `scp_alloc(len)` and is not used afterwards.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn scp_free(ptr: *mut u8, len: usize) {
    drop(unsafe { Vec::from_raw_parts(ptr, 0, len.max(1)) });
}

/// The head: the bytes of public/portrait/head.bin.zst.
///
/// # Safety
///
/// The pointer and length describe memory from [`scp_alloc`] that the caller has filled.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn scp_head(ptr: *const u8, len: usize) -> u32 {
    answer(Head::load(unsafe { bytes(ptr, len) }).map_err(|e| e.0.to_string()).map(|h| {
        HEAD.with(|slot| *slot.borrow_mut() = Some(h));
        Vec::new()
    }))
}

/// A data file of the real look, by its path (folder/name).
///
/// # Safety
///
/// As [`scp_head`].
#[unsafe(no_mangle)]
pub unsafe extern "C" fn scp_file(path: *const u8, path_len: usize, ptr: *const u8, len: usize) -> u32 {
    answer(unsafe { text(path, path_len) }.map(|p| {
        real::put(p, unsafe { bytes(ptr, len) }.to_vec());
        Vec::new()
    }))
}

/// An image of the real look is there, by its path (the renderer loads it).
///
/// # Safety
///
/// As [`scp_head`].
#[unsafe(no_mangle)]
pub unsafe extern "C" fn scp_image(path: *const u8, path_len: usize) -> u32 {
    answer(unsafe { text(path, path_len) }.map(|p| {
        real::name(p);
        Vec::new()
    }))
}

/// Switches the real look on (the folder its files were handed in under) or off (an empty text).
///
/// # Safety
///
/// As [`scp_head`].
#[unsafe(no_mangle)]
pub unsafe extern "C" fn scp_real(folder: *const u8, len: usize) -> u32 {
    answer(unsafe { text(folder, len) }.map(|f| {
        real::set_real((!f.is_empty()).then(|| f.to_string()));
        Vec::new()
    }))
}

/// The piece on the head every portrait wears from now on, by its key in dress.rs `HEADWEAR` (an empty or unknown
/// text: what each person's dress says), to look at one piece on many faces.
///
/// # Safety
///
/// As [`scp_head`].
#[unsafe(no_mangle)]
pub unsafe extern "C" fn scp_headwear(key: *const u8, len: usize) -> u32 {
    answer(unsafe { text(key, len) }.map(|k| {
        crate::dress::try_headwear(k);
        Vec::new()
    }))
}

/// The portrait of a person (wire.rs describes both).
///
/// # Safety
///
/// As [`scp_head`].
#[unsafe(no_mangle)]
pub unsafe extern "C" fn scp_build(person: *const u8, len: usize) -> u32 {
    answer(HEAD.with(|slot| {
        let slot = slot.borrow();
        let head = slot.as_ref().ok_or("the head is not loaded")?;
        let asked = wire::person(unsafe { bytes(person, len) })?;
        Ok(wire::portrait(&build(head, &asked.look, asked.lod), &asked.look))
    }))
}

/// Where the result of the last call lies, and how long it is.
#[unsafe(no_mangle)]
pub extern "C" fn scp_out_ptr() -> *const u8 {
    OUT.with(|o| o.borrow().as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn scp_out_len() -> usize {
    OUT.with(|o| o.borrow().len())
}
