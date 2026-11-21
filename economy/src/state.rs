//! The state of a model as bytes, and back.
//!
//! The port has no save format of its own, but every field of the model is public and its random number generator
//! hands out its state, so the shell can write the whole model without changing the port. Every struct is taken apart
//! field by field without `..`: when the port gains or loses a field, this module stops compiling instead of silently
//! saving half a model.
//!
//! Format (little endian): the tag `SCEC`, the format version, the four words of the random number generator, then the
//! parts of the model in the order of `AbstractModel`, the fields of the daily clock last. Lists start with their
//! length. Numbers of agents and positions are 32 bit (`u32::MAX` stands for "none"), amounts are the 64 bits of the
//! float, so a state loads bit for bit.

mod agents;
mod bytes;
mod cities;
mod daily;
mod data;
mod params;

use beforeit::{AbstractModel, Xoshiro};

use crate::clock::DailyClock;
use agents::{
    get_aggregates, get_banks, get_central_bank, get_firms, get_government, get_rest_of_the_world, get_workers,
    put_aggregates, put_banks, put_central_bank, put_firms, put_government, put_rest_of_the_world, put_workers,
};
use bytes::{In, Out};
use daily::{get_clock, put_clock};
use data::{get_data, put_data};
use params::{get_properties, put_properties};

pub use cities::{FORMAT_CITIES, load_cities, save_cities};

const TAG: &[u8; 4] = b"SCEC";
/// Version of the byte format. A change to the pinned port that changes its state needs a new number and a step in
/// the world's upgrade chain (src/sim/upgrade.ts). 2: the fields of the daily clock. 3: the wages in money.
/// 4: the demand pull. 5: of the national accounts the clock keeps the series that the key figures sum, the port
/// keeps its last row. 6: the clock can keep the past in a fixed size ([`crate::past`]). 7: the spending out of
/// savings (economy feature 15). 8: the crown that buys with what it took in (economy feature 16). 9: firm and
/// owner as one household (economy feature 18). 10: the working days of the firms (economy feature 19). 11: the
/// profits the owners plan their spending on (economy feature 20). 12: the workers who are away and the materials
/// they left unused (economy feature 22). 13: the contracts of the workers (economy feature 23). 14: per absence
/// whether the family stands in (economy feature 24).
/// States of formats 4 to 13 are still read and become format 14 when they are saved ([`load`]); formats 4 and 5
/// keep the whole past, as they had it, none before 7 spends out of savings, none before 8 has a crown that buys with
/// its revenue, none before 9 has owners who bear losses, none before 10 has working days, none before 11 has the
/// profits of the owners (they are gathered anew from the first period that is computed), none before 12 has
/// workers who are away, none before 13 has contracts, and in none before 14 does the family stand in.
pub const FORMAT: u32 = 14;

/// The model and its random number generator as bytes. The same model always gives the same bytes.
pub fn save(model: &AbstractModel<DailyClock>, rng: &Xoshiro) -> Vec<u8> {
    let mut o = Out(Vec::new());
    put(&mut o, model, rng);
    o.0
}

fn put(o: &mut Out, model: &AbstractModel<DailyClock>, rng: &Xoshiro) {
    let AbstractModel {
        w_act,
        w_inact,
        firms,
        banks,
        cb,
        gov,
        rotw,
        agg,
        prop,
        data,
        ext,
    } = model;
    o.0.extend_from_slice(TAG);
    o.u32(FORMAT);
    for word in rng.state() {
        o.u64(word);
    }
    put_workers(o, w_act);
    put_workers(o, w_inact);
    put_firms(o, firms);
    put_banks(o, banks);
    put_central_bank(o, cb);
    put_government(o, gov);
    put_rest_of_the_world(o, rotw);
    put_aggregates(o, agg);
    put_properties(o, prop);
    put_data(o, data);
    put_clock(o, ext);
}

/// Reads the bytes of [`save`].
pub fn load(bytes: &[u8]) -> Result<(AbstractModel<DailyClock>, Xoshiro), String> {
    let mut i = In { b: bytes, at: 0 };
    if i.take(4)? != TAG {
        return Err("these bytes are not the state of an economy".into());
    }
    let format = i.u32()?;
    if !(4..=FORMAT).contains(&format) {
        return Err(format!(
            "state format {format}, this engine reads formats 4 to {FORMAT}"
        ));
    }
    let rng = Xoshiro::from_state([i.u64()?, i.u64()?, i.u64()?, i.u64()?])?;
    let mut model = AbstractModel {
        w_act: get_workers(&mut i)?,
        w_inact: get_workers(&mut i)?,
        firms: get_firms(&mut i)?,
        banks: get_banks(&mut i)?,
        cb: get_central_bank(&mut i)?,
        gov: get_government(&mut i)?,
        rotw: get_rest_of_the_world(&mut i)?,
        agg: get_aggregates(&mut i)?,
        prop: get_properties(&mut i)?,
        data: get_data(&mut i)?,
        ext: get_clock(&mut i, format)?,
    };
    if format == 4 {
        // the port's rows held the window: the clock takes the series the key figures sum, the port keeps its last row
        if model.data.collection_time.is_empty() {
            return Err("a state of format 4 without a row of the national accounts".into());
        }
        model.ext.accounts = vec![crate::accounts::summed(&model.data, 0)];
        crate::accounts::take_rows(&mut model);
    }
    let (a, households) = (
        &model.ext.attendance,
        model.w_act.len() + model.w_inact.len() + model.banks.len(),
    );
    if !a.is_empty() && a.household.len() != households {
        return Err(format!(
            "working days of {} households in a model of {households} households that own no firm",
            a.household.len()
        ));
    }
    if let Some(h) = model
        .ext
        .absences
        .worker
        .iter()
        .find(|&&h| h as usize >= model.w_act.len())
    {
        return Err(format!("an absence of the worker {h} of {}", model.w_act.len()));
    }
    let contracts = model.ext.contracts.len();
    if contracts != 0 && contracts != model.w_act.len() {
        return Err(format!(
            "contracts of {contracts} workers in an economy of {}",
            model.w_act.len()
        ));
    }
    let unused = model.ext.unused.len();
    if unused != 0 && unused != model.firms.len() {
        return Err(format!(
            "unused materials of {unused} firms in an economy of {}",
            model.firms.len()
        ));
    }
    if i.at != bytes.len() {
        return Err(format!("{} bytes are left over after the state", bytes.len() - i.at));
    }
    Ok((model, rng))
}
