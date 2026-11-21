//! The interface of the WebAssembly file (src/sim/economy/engine.ts is the other side). The caller copies its inputs
//! into memory from [`sce_alloc`], calls a function, and reads the result at [`sce_out_ptr`]. A function returns 1
//! when the result is what was asked for and 0 when it is the text of an error. A rule of the port that fails stops
//! the instance; its message is then at [`sce_panic_ptr`].

mod inputs;
mod last;
mod out;
mod panic;

use std::rc::Rc;

use super::Economy;
use inputs::{bytes, cities, working_days};
use last::{LAST, keep, look, look_last, take, take_last};
use out::{OUT, answer, float_lists, floats};
use panic::{PANIC, hook};

/// Memory for an input of `len` bytes.
#[unsafe(no_mangle)]
pub extern "C" fn sce_alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// Gives memory from [`sce_alloc`] back.
///
/// # Safety
///
/// `ptr` came from `sce_alloc(len)` and is not used afterwards.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sce_free(ptr: *mut u8, len: usize) {
    drop(unsafe { Vec::from_raw_parts(ptr, 0, len.max(1)) });
}

/// New cities that trade with each other, from a list of cities (for every city the 64-bit seed, then the
/// port's parameters and initial conditions as JSON, each with its length in 32 bits before it) and the two
/// lengths of the daily clock ([`Economy::new`], [`Cities::new`]) and the kind of wages: 0 for the port's wage
/// that follows the consumer prices, 1 for the wage in money ([`Economy::with_wages_in_money`]); and the kind
/// of prices: 0 for the paper's rule of costs, 1 for the demand pull of CANVAS ([`Economy::with_demand_pull`]);
/// and the share of the savings above their target that households spend per period, 0 for the port's rule
/// ([`Economy::with_savings_spent`]); and the crown: 0 buys by the paper's series, 1 with what it took in
/// ([`Economy::with_crown_spending_revenue`]); and the owner of a firm: 0 is paid the paper's profit and bears no
/// loss, 1 is one household with the firm ([`Economy::with_owner_household`]). Result: their state.
///
/// # Safety
///
/// The pointer and the length describe memory from [`sce_alloc`] that the caller has filled.
///
/// [`Cities::new`]: crate::trade::Cities::new
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sce_create(
    list: *const u8,
    len: usize,
    plan: u32,
    window: u32,
    wage: u32,
    prices: u32,
    savings: f64,
    crown: u32,
    owner: u32,
) -> u32 {
    hook();
    answer(
        cities(
            unsafe { bytes(list, len) },
            plan as usize,
            window as usize,
            wage,
            prices,
            savings,
            crown,
            owner,
        )
        .map(keep),
    )
}

/// The cities of a state that has not computed a period, with distance between them (economy feature 17,
/// [`Cities::with_routes`]). The routes are, little endian: the elasticity of the stock to keep and, per
/// product, the tonnes of a real unit (64-bit floats); then for every city of origin and every city of
/// destination the days of travel (32 bits, 0 for no way) and the days of labour that carry a tonne (64-bit
/// float). Result: their state.
///
/// # Safety
///
/// As [`sce_create`], for both pairs of pointer and length.
///
/// [`Cities::with_routes`]: crate::trade::Cities::with_routes
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sce_routes(state: *const u8, len: usize, routes: *const u8, routes_len: usize) -> u32 {
    hook();
    answer((|| {
        let all = take(unsafe { bytes(state, len) })?;
        let (n, G) = (all.cities.len(), all.merchants.bought.len());
        let r = unsafe { bytes(routes, routes_len) };
        if r.len() != 8 + 8 * G + 12 * n * n {
            return Err(format!(
                "routes of {} bytes do not fit {n} cities with {G} products",
                r.len()
            ));
        }
        let f = |at: usize| f64::from_le_bytes(r[at..at + 8].try_into().unwrap());
        let weight = (0..G).map(|g| f(8 + 8 * g)).collect();
        let (mut days, mut labour, mut at) = (vec![vec![0; n]; n], vec![vec![0.0; n]; n], 8 + 8 * G);
        for c in 0..n {
            for d in 0..n {
                days[c][d] = u32::from_le_bytes(r[at..at + 4].try_into().unwrap()) as usize;
                labour[c][d] = f(at + 4);
                at += 12;
            }
        }
        Ok(keep(all.with_routes(days, labour, weight, f(0))?))
    })())
}

/// The cities of a state with the working days of their firms from their next period on (economy feature 19,
/// [`Economy::with_working_days`]). The days are, little endian, for every city in its order: the number of its
/// calendars, of the kinds of a day and of the days (32 bits each), per calendar and kind the factor of a firm's
/// flows (64-bit floats), per calendar the kind of every day (a byte each), the number of its firms (32 bits) and
/// the calendar of every firm (a byte each), the number of its other households (32 bits) and the calendar of each
/// (a byte each, [`Economy::with_working_days`]). Result: their state.
///
/// # Safety
///
/// As [`sce_create`], for both pairs of pointer and length.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sce_working_days(state: *const u8, len: usize, days: *const u8, days_len: usize) -> u32 {
    hook();
    answer((|| {
        let mut all = take(unsafe { bytes(state, len) })?;
        working_days(&mut all, unsafe { bytes(days, days_len) })?;
        Ok(keep(all))
    })())
}

/// The cities of a state with the workers who are away from their next period on, as [`crate::workers::absences`]
/// reads them (economy feature 22). Result: their state.
///
/// # Safety
///
/// As [`sce_create`], for both pairs of pointer and length.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sce_absences(state: *const u8, len: usize, list: *const u8, list_len: usize) -> u32 {
    hook();
    answer((|| {
        let mut all = take(unsafe { bytes(state, len) })?;
        crate::workers::absences(&mut all, unsafe { bytes(list, list_len) })?;
        Ok(keep(all))
    })())
}

/// The cities of a state with their contracts from their next period on, as [`crate::workers::contracts`] reads
/// them (economy feature 23). Result: their state.
///
/// # Safety
///
/// As [`sce_create`], for both pairs of pointer and length.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sce_contracts(state: *const u8, len: usize, list: *const u8, list_len: usize) -> u32 {
    hook();
    answer((|| {
        let mut all = take(unsafe { bytes(state, len) })?;
        crate::workers::contracts(&mut all, unsafe { bytes(list, list_len) })?;
        Ok(keep(all))
    })())
}

/// Computes `periods` periods from a state. Result: the state after them.
///
/// # Safety
///
/// As [`sce_create`].
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sce_step(state: *const u8, len: usize, periods: u32) -> u32 {
    hook();
    answer((|| {
        let mut all = take(unsafe { bytes(state, len) })?;
        // cities from before the past of a fixed size take it on the day they are computed again
        all.cities = std::mem::take(&mut all.cities)
            .into_iter()
            .map(Economy::with_bounded_past)
            .collect();
        all.step(periods as usize);
        Ok(keep(all))
    })())
}

/// As [`sce_step`], from the state that the call before handed out (kept in [`LAST`]), without being given its
/// bytes again: the caller saves copying tens of megabytes into the instance and comparing them every day.
#[unsafe(no_mangle)]
pub extern "C" fn sce_step_last(periods: u32) -> u32 {
    hook();
    answer((|| {
        let mut all = take_last()?;
        all.cities = std::mem::take(&mut all.cities)
            .into_iter()
            .map(Economy::with_bounded_past)
            .collect();
        all.step(periods as usize);
        Ok(keep(all))
    })())
}

/// As [`sce_step_last`], but the state after the periods stays in [`LAST`] without its bytes: the result is
/// empty, and [`sce_save_last`] gives the bytes when they are needed. Writing the state of a world (some 50 MB)
/// every day took as long as computing the day.
#[unsafe(no_mangle)]
pub extern "C" fn sce_advance_last(periods: u32) -> u32 {
    hook();
    answer((|| {
        let mut all = take_last()?;
        all.cities = std::mem::take(&mut all.cities)
            .into_iter()
            .map(Economy::with_bounded_past)
            .collect();
        all.step(periods as usize);
        LAST.with(|l| *l.borrow_mut() = Some((None, all)));
        Ok(Rc::new(Vec::new()))
    })())
}

/// Result: the bytes of the state kept in [`LAST`], written now if [`sce_advance_last`] left them out.
#[unsafe(no_mangle)]
pub extern "C" fn sce_save_last() -> u32 {
    hook();
    answer(LAST.with(|l| match &mut *l.borrow_mut() {
        Some((Some(bytes), _)) => Ok(bytes.clone()),
        Some((none, all)) => {
            let bytes = Rc::new(all.save());
            *none = Some(bytes.clone());
            Ok(bytes)
        }
        None => Err("no state is kept from the call before".to_string()),
    }))
}

/// As [`sce_figures`], of the state kept in [`LAST`].
#[unsafe(no_mangle)]
pub extern "C" fn sce_figures_last() -> u32 {
    hook();
    answer(look_last(|all| floats(all.cities.iter().flat_map(Economy::figures))))
}

/// As [`sce_agents`], of the state kept in [`LAST`].
#[unsafe(no_mangle)]
pub extern "C" fn sce_agents_last() -> u32 {
    hook();
    answer(look_last(|all| float_lists(all.cities.iter().map(Economy::agents))))
}

/// Of the state kept in [`LAST`], per city the workers away from firms that worked in its last period, those of
/// their families who stood in for them and the workers without work who stood in for them (economy features 23
/// and 24, [`crate::workers::Today`]): three 64-bit floats a city. A measure for the tools; no rule and no state
/// reads it.
#[unsafe(no_mangle)]
pub extern "C" fn sce_stand_ins_last() -> u32 {
    hook();
    answer(look_last(|all| {
        floats(all.cities.iter().flat_map(|e| {
            let t = &e.model.ext.today;
            [t.away as f64, t.by_family as f64, t.stood_in as f64]
        }))
    }))
}

/// Result: the key figures of every city of a state, [`super::FIGURES`] 64-bit floats a city.
///
/// # Safety
///
/// As [`sce_create`].
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sce_figures(state: *const u8, len: usize) -> u32 {
    hook();
    answer(look(unsafe { bytes(state, len) }, |all| {
        floats(all.cities.iter().flat_map(Economy::figures))
    }))
}

/// Result: the persons and firms of every city of a state one by one, as 64-bit floats: the lists of
/// [`Economy::agents`], one city after the other.
///
/// # Safety
///
/// As [`sce_create`].
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sce_agents(state: *const u8, len: usize) -> u32 {
    hook();
    answer(look(unsafe { bytes(state, len) }, |all| {
        float_lists(all.cities.iter().map(Economy::agents))
    }))
}

/// Result: what must be 0 in a state, as 64-bit floats: for every city the six numbers of [`Economy::checks`],
/// then for the merchants the pairs of [`Cities::checks`] (what is off, and the amount to judge it by).
///
/// # Safety
///
/// As [`sce_create`].
///
/// [`Cities::checks`]: crate::trade::Cities::checks
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sce_checks(state: *const u8, len: usize) -> u32 {
    hook();
    answer(look(unsafe { bytes(state, len) }, |all| {
        floats(
            all.cities
                .iter()
                .flat_map(Economy::checks)
                .chain(all.checks().into_iter().flatten()),
        )
    }))
}

/// Where the result of the last call lies, and how long it is.
#[unsafe(no_mangle)]
pub extern "C" fn sce_out_ptr() -> *const u8 {
    OUT.with(|o| o.borrow().as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn sce_out_len() -> usize {
    OUT.with(|o| o.borrow().len())
}

/// Where the message of the rule that stopped the instance lies, and how long it is.
#[unsafe(no_mangle)]
pub extern "C" fn sce_panic_ptr() -> *const u8 {
    PANIC.0.get() as *const u8
}

#[unsafe(no_mangle)]
pub extern "C" fn sce_panic_len() -> usize {
    // SAFETY: one thread; the hook is not running while the caller asks.
    unsafe { (*PANIC.0.get()).1 }
}
