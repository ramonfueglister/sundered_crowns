//! The cities of the state that the last call handed out, kept beside it ([`LAST`]).

use std::cell::RefCell;
use std::rc::Rc;

use super::out::OUT;
use crate::trade::Cities;

thread_local! {
    /// The cities of the state that the last [`sce_step`] or [`sce_create`] handed out, beside that state. A
    /// call that is given exactly these bytes again (the world server computes day after day) takes the cities
    /// from here instead of reading the bytes; any other bytes are read. So the answers stay a function of the
    /// bytes alone. The bytes are the same list as the result in [`OUT`], not a copy: the state of a world is
    /// tens of megabytes, and the memory of an instance never shrinks.
    /// The bytes are `None` after [`sce_advance_last`] until [`sce_save_last`] writes them: the world computes
    /// day after day and needs the bytes of its economies only for a snapshot.
    pub(super) static LAST: RefCell<Option<Last>> = const { RefCell::new(None) };
}

/// What [`LAST`] holds: the bytes of a state (or `None` until they are written) and its cities.
pub(super) type Last = (Option<Rc<Vec<u8>>>, Cities);

/// The cities of a state, taken out of [`LAST`] when the bytes are those it holds. The result of the call before
/// is given up first, so that the bytes it shares with [`LAST`] are free before the next state is written.
pub(super) fn take(state: &[u8]) -> Result<Cities, String> {
    OUT.with(|o| *o.borrow_mut() = Rc::new(Vec::new()));
    match LAST.with(|l| l.borrow_mut().take()) {
        Some((Some(bytes), all)) if *bytes == state => Ok(all),
        _ => Cities::load(state),
    }
}

/// The cities that [`LAST`] holds, for the calls that are told to take them without being given their bytes.
pub(super) fn take_last() -> Result<Cities, String> {
    OUT.with(|o| *o.borrow_mut() = Rc::new(Vec::new()));
    LAST.with(|l| l.borrow_mut().take())
        .map(|(_, all)| all)
        .ok_or_else(|| "no state is kept from the call before".to_string())
}

/// What `f` says about the cities that [`LAST`] holds.
pub(super) fn look_last<T>(f: impl FnOnce(&Cities) -> T) -> Result<T, String> {
    LAST.with(|l| {
        l.borrow()
            .as_ref()
            .map(|(_, all)| f(all))
            .ok_or_else(|| "no state is kept from the call before".to_string())
    })
}

/// Hands out the state of `all` and keeps both in [`LAST`].
pub(super) fn keep(all: Cities) -> Rc<Vec<u8>> {
    let bytes = Rc::new(all.save());
    LAST.with(|l| *l.borrow_mut() = Some((Some(bytes.clone()), all)));
    bytes
}

/// What `f` says about the cities of a state, which stay in [`LAST`] when they are the ones there.
pub(super) fn look<T>(state: &[u8], f: impl FnOnce(&Cities) -> T) -> Result<T, String> {
    LAST.with(|l| match &*l.borrow() {
        Some((Some(bytes), all)) if **bytes == state => Ok(f(all)),
        _ => Cities::load(state).map(|all| f(&all)),
    })
}
