//! The inputs of the calls as the caller writes them: memory it filled, the list of new cities, and the working
//! days of the cities.

use crate::Economy;
use crate::trade::Cities;

/// SAFETY: `ptr` and `len` describe memory from [`sce_alloc`] that the caller has filled.
///
/// [`sce_alloc`]: super::sce_alloc
pub(super) unsafe fn bytes<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
    if len == 0 {
        &[]
    } else {
        unsafe { std::slice::from_raw_parts(ptr, len) }
    }
}

/// The cities of a list as [`sce_create`] takes it: for every city the 64-bit seed, then the parameters and the
/// initial conditions of the port (JSON), each with its length in 32 bits before it; all little endian.
///
/// [`sce_create`]: super::sce_create
#[allow(clippy::too_many_arguments)] // the arguments of sce_create, one by one
pub(super) fn cities(
    mut list: &[u8],
    plan: usize,
    window: usize,
    wage: u32,
    prices: u32,
    savings: f64,
    crown: u32,
    owner: u32,
) -> Result<Cities, String> {
    fn take<'a>(list: &mut &'a [u8], n: usize) -> Result<&'a [u8], String> {
        if list.len() < n {
            return Err(format!("the list of cities ends {} bytes early", n - list.len()));
        }
        let (head, rest) = list.split_at(n);
        *list = rest;
        Ok(head)
    }
    fn text<'a>(list: &mut &'a [u8], what: &str, c: usize) -> Result<&'a str, String> {
        let n = u32::from_le_bytes(take(list, 4)?.try_into().unwrap()) as usize;
        std::str::from_utf8(take(list, n)?).map_err(|e| format!("{what} of city {c} are not text: {e}"))
    }
    if wage > 1 {
        return Err(format!(
            "wages of kind {wage}: 0 is the port's wage that follows the prices, 1 the wage in money"
        ));
    }
    if prices > 1 {
        return Err(format!(
            "prices of kind {prices}: 0 is the paper's rule of costs, 1 the demand pull of CANVAS"
        ));
    }
    if crown > 1 {
        return Err(format!(
            "a crown of kind {crown}: 0 buys by the paper's series, 1 with what it took in"
        ));
    }
    if owner > 1 {
        return Err(format!(
            "an owner of kind {owner}: 0 is paid the paper's profit and bears no loss, 1 is one household with the firm"
        ));
    }
    let mut all = Vec::new();
    while !list.is_empty() {
        let c = all.len();
        let seed = u64::from_le_bytes(take(&mut list, 8)?.try_into().unwrap());
        let p = text(&mut list, "the parameters", c)?;
        let ic = text(&mut list, "the initial conditions", c)?;
        let e = Economy::new(p, ic, seed, plan, window).map_err(|e| format!("city {c}: {e}"))?;
        let e = if wage == 1 { e.with_wages_in_money() } else { e };
        let e = if prices == 1 {
            e.with_demand_pull().map_err(|e| format!("city {c}: {e}"))?
        } else {
            e
        };
        let e = e.with_savings_spent(savings).map_err(|e| format!("city {c}: {e}"))?;
        let e = if crown == 1 { e.with_crown_spending_revenue() } else { e };
        let e = if owner == 1 { e.with_owner_household() } else { e };
        // the cities of the game run for centuries: their past has a fixed size
        all.push(e.with_bounded_past());
    }
    Cities::new(all)
}

/// The cities with the working days of their firms and households (economy feature 19) as bytes: per city the number
/// of its calendars, of the kinds of a day and of the days (32 bits each), per calendar and kind the factor of the
/// flows (64-bit floats), per calendar the kind of every day (a byte each), the number of its firms (32 bits) and the
/// calendar of every firm (a byte each), the number of its other households (32 bits) and the calendar of each (a byte
/// each, [`Economy::with_working_days`]).
pub(super) fn working_days(all: &mut Cities, mut r: &[u8]) -> Result<(), String> {
    fn take_bytes<'a>(r: &mut &'a [u8], n: usize) -> Result<&'a [u8], String> {
        if r.len() < n {
            return Err(format!(
                "the working days end after {} more bytes, {n} were read",
                r.len()
            ));
        }
        let (head, rest) = r.split_at(n);
        *r = rest;
        Ok(head)
    }
    let u32_ = |r: &mut &[u8]| -> Result<usize, String> {
        Ok(u32::from_le_bytes(take_bytes(r, 4)?.try_into().unwrap()) as usize)
    };
    let mut cities = Vec::with_capacity(all.cities.len());
    for (c, e) in std::mem::take(&mut all.cities).into_iter().enumerate() {
        let (calendars, kinds, n) = (u32_(&mut r)?, u32_(&mut r)?, u32_(&mut r)?);
        let factor = take_bytes(&mut r, 8 * calendars * kinds)?
            .chunks_exact(8)
            .map(|b| f64::from_le_bytes(b.try_into().unwrap()))
            .collect();
        let day = take_bytes(&mut r, calendars * n)?.to_vec();
        let firms = u32_(&mut r)?;
        let calendar = take_bytes(&mut r, firms)?.to_vec();
        let households = u32_(&mut r)?;
        let household = take_bytes(&mut r, households)?.to_vec();
        cities.push(
            e.with_working_days(n, kinds, factor, day, calendar, household)
                .map_err(|e| format!("city {c}: {e}"))?,
        );
    }
    if !r.is_empty() {
        return Err(format!(
            "{} bytes of working days are left over after the cities",
            r.len()
        ));
    }
    all.cities = cities;
    Ok(())
}
