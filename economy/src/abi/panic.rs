//! The message of a rule that failed, kept where the caller can read it after the instance has stopped.

use std::cell::UnsafeCell;
use std::sync::Once;

pub(super) struct Panic(pub(super) UnsafeCell<([u8; 1024], usize)>);
// SAFETY: a WebAssembly instance runs on one thread.
unsafe impl Sync for Panic {}
pub(super) static PANIC: Panic = Panic(UnsafeCell::new(([0; 1024], 0)));
static HOOK: Once = Once::new();

/// Keeps the message of a failing rule where the caller can read it after the instance has stopped: what
/// failed and where in the source (from `src/` on, so the text does not depend on the machine that built it).
pub(super) fn hook() {
    HOOK.call_once(|| {
        std::panic::set_hook(Box::new(|info| {
            let payload = info.payload();
            let said = payload
                .downcast_ref::<&str>()
                .copied()
                .or_else(|| payload.downcast_ref::<String>().map(String::as_str));
            let mut text = said.unwrap_or("a rule failed").to_string();
            if let Some(l) = info.location() {
                let file = l.file();
                let short = file.rfind("/src/").map_or(file, |i| &file[i + 1..]);
                text.push_str(&format!(" ({short}:{})", l.line()));
            }
            // SAFETY: one thread, and nothing else holds a reference into the buffer while the hook runs.
            let (buf, len) = unsafe { &mut *PANIC.0.get() };
            let n = text.len().min(buf.len());
            buf[..n].copy_from_slice(&text.as_bytes()[..n]);
            *len = n;
        }));
    });
}
