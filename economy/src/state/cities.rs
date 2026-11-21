//! Cities and their merchants as bytes and back: the state of every city, then the books of the merchants
//! ([`crate::trade`]).

use std::sync::atomic::{AtomicUsize, Ordering};

use crate::Economy;
use crate::trade::{Cities, Merchants, Routes};

use super::bytes::{In, NONE, Out, Res};
use super::put;

/// The tag of cities with their merchants ([`save_cities`]).
const TAG_CITIES: &[u8; 4] = b"SCET";
/// Version of the byte format of cities with their merchants. 2: the routes between the cities (economy feature
/// 17); format 1 is still read, as cities without routes.
pub const FORMAT_CITIES: u32 = 2;

/// The length of the last state of cities written ([`save_cities`]): how much room the next one is given at once.
/// It changes no byte of a state.
static SIZE: AtomicUsize = AtomicUsize::new(0);

/// Cities and their merchants as bytes: the tag `SCET`, the format version, the number of cities, the state of every
/// city ([`save`](super::save)) with its length before it, then the books of the merchants. The same cities always
/// give the same bytes.
pub fn save_cities(all: &Cities) -> Vec<u8> {
    let Cities { cities, merchants } = all;
    let Merchants {
        stock,
        value,
        orders,
        share,
        bought,
        sold,
        start,
        start_stock,
        routes,
    } = merchants;
    // the bytes are written into one list that is as long as the state of the call before, with a little room: the
    // state of a world is tens of megabytes, and a list that grows by doubling would hold it twice over
    let hint = SIZE.load(Ordering::Relaxed);
    let mut o = Out(Vec::with_capacity(hint + hint / 256 + 4096));
    o.0.extend_from_slice(TAG_CITIES);
    o.u32(FORMAT_CITIES);
    o.n(cities.len());
    for e in cities {
        let at = o.0.len();
        o.u32(0);
        put(&mut o, &e.model, &e.rng);
        let len = o.0.len() - at - 4;
        assert!((len as u64) < NONE as u64, "{len} does not fit the state format");
        o.0[at..at + 4].copy_from_slice(&(len as u32).to_le_bytes());
    }
    for v in [stock, value] {
        o.f64ss(v);
    }
    o.n(orders.len());
    for v in orders {
        o.f64ss(v);
    }
    for v in [share, bought, sold] {
        o.f64s(v);
    }
    o.f64(*start);
    o.f64s(start_stock);
    o.bool(routes.is_some());
    // the length of the ring follows from the days
    if let Some(Routes {
        days,
        labour,
        weight,
        elasticity,
        horizon: _,
        on_way,
        on_way_cost,
        carrying,
        period,
        paid,
        wage0,
        price0,
    }) = routes
    {
        for row in days {
            o.n(row.len());
            for d in row {
                o.n(*d);
            }
        }
        o.f64ss(labour);
        o.f64s(weight);
        o.f64(*elasticity);
        o.f64s(on_way);
        o.f64s(on_way_cost);
        o.f64ss(carrying);
        o.n(*period);
        o.f64(*paid);
        o.f64s(wage0);
        o.f64ss(price0);
    }
    SIZE.store(o.0.len(), Ordering::Relaxed);
    o.0
}

/// Reads the bytes of [`save_cities`].
pub fn load_cities(bytes: &[u8]) -> Result<Cities, String> {
    let mut i = In { b: bytes, at: 0 };
    if i.take(4)? != TAG_CITIES {
        return Err("these bytes are not the state of cities".into());
    }
    let format = i.u32()?;
    if !(1..=FORMAT_CITIES).contains(&format) {
        return Err(format!(
            "state format {format} of cities, this engine reads formats 1 to {FORMAT_CITIES}"
        ));
    }
    let n = i.len(4)?;
    let mut cities = Vec::with_capacity(n);
    for c in 0..n {
        let len = i.n()?;
        cities.push(Economy::load(i.take(len)?).map_err(|e| format!("city {c}: {e}"))?);
    }
    let (stock, value) = (i.f64ss()?, i.f64ss()?);
    let orders = (0..i.len(4)?).map(|_| i.f64ss()).collect::<Res<Vec<_>>>()?;
    let (share, bought, sold) = (i.f64s()?, i.f64s()?, i.f64s()?);
    let (start, start_stock) = (i.f64()?, i.f64s()?);
    // format 1 knows no routes
    let routes = if format >= 2 && i.bool()? {
        let mut days = Vec::with_capacity(n);
        for _ in 0..n {
            let len = i.len(4)?;
            days.push((0..len).map(|_| i.n()).collect::<Res<Vec<_>>>()?);
        }
        let horizon = Routes::longest(&days);
        Some(Routes {
            days,
            horizon,
            labour: i.f64ss()?,
            weight: i.f64s()?,
            elasticity: i.f64()?,
            on_way: i.f64s()?,
            on_way_cost: i.f64s()?,
            carrying: i.f64ss()?,
            period: i.n()?,
            paid: i.f64()?,
            wage0: i.f64s()?,
            price0: i.f64ss()?,
        })
    } else {
        None
    };
    let merchants = Merchants {
        stock,
        value,
        orders,
        share,
        bought,
        sold,
        start,
        start_stock,
        routes,
    };
    if i.at != bytes.len() {
        return Err(format!("{} bytes are left over after the state", bytes.len() - i.at));
    }
    // the books must fit the cities: a list of another length would be read past its end in the next period
    let G = cities.first().map_or(0, |e: &Economy| e.model.prop.G);
    let per_city = |v: &[Vec<f64>], len: usize| v.len() == n && v.iter().all(|x| x.len() == len);
    let m = &merchants;
    let fits = n >= 2
        && cities.iter().all(|e| e.model.prop.G == G)
        && per_city(&m.stock, G)
        && per_city(&m.value, G)
        && m.orders.len() == n
        && m.orders.iter().all(|o| per_city(o, G))
        && m.share.len() == n
        && [&m.bought, &m.sold, &m.start_stock].iter().all(|v| v.len() == G)
        && m.routes.as_ref().is_none_or(|r| {
            r.days.len() == n
                && r.days.iter().all(|d| d.len() == n)
                && per_city(&r.labour, n)
                && r.weight.len() == G
                && per_city(&r.carrying, n)
                && r.on_way.len() == r.horizon * n * G
                && r.on_way_cost.len() == r.on_way.len()
                && r.wage0.len() == n
                && r.price0.len() == n
                && r.price0.iter().all(|p| p.len() == G)
                && r.elasticity.is_finite()
        });
    if !fits {
        return Err(format!(
            "the books of the merchants do not fit {n} cities with {G} products"
        ));
    }
    Ok(Cities { cities, merchants })
}
