//! The time series the model collects, as bytes and back (the port's src/data.rs).

use beforeit::Data;

use super::bytes::{In, Out, Res};

pub(super) fn put_data(o: &mut Out, d: &Data) {
    let Data {
        collection_time,
        nominal_gdp,
        real_gdp,
        nominal_gva,
        real_gva,
        nominal_household_consumption,
        real_household_consumption,
        nominal_government_consumption,
        real_government_consumption,
        nominal_capitalformation,
        real_capitalformation,
        nominal_fixed_capitalformation,
        real_fixed_capitalformation,
        nominal_fixed_capitalformation_dwellings,
        real_fixed_capitalformation_dwellings,
        nominal_exports,
        real_exports,
        nominal_imports,
        real_imports,
        operating_surplus,
        compensation_employees,
        wages,
        taxes_production,
        gdp_deflator_growth_ea,
        real_gdp_ea,
        euribor,
        nominal_sector_gva,
        real_sector_gva,
        credit_new_per_bank,
        credit_stock_per_bank,
        equity_per_bank,
        reserves_per_bank,
        roe_per_bank,
    } = d;
    o.ns(collection_time);
    for v in [
        nominal_gdp,
        real_gdp,
        nominal_gva,
        real_gva,
        nominal_household_consumption,
        real_household_consumption,
        nominal_government_consumption,
        real_government_consumption,
        nominal_capitalformation,
        real_capitalformation,
        nominal_fixed_capitalformation,
        real_fixed_capitalformation,
        nominal_fixed_capitalformation_dwellings,
        real_fixed_capitalformation_dwellings,
        nominal_exports,
        real_exports,
        nominal_imports,
        real_imports,
        operating_surplus,
        compensation_employees,
        wages,
        taxes_production,
        gdp_deflator_growth_ea,
        real_gdp_ea,
        euribor,
    ] {
        o.f64s(v);
    }
    for v in [
        nominal_sector_gva,
        real_sector_gva,
        credit_new_per_bank,
        credit_stock_per_bank,
        equity_per_bank,
        reserves_per_bank,
        roe_per_bank,
    ] {
        o.f64ss(v);
    }
}

pub(super) fn get_data(i: &mut In) -> Res<Data> {
    Ok(Data {
        collection_time: i.ns()?,
        nominal_gdp: i.f64s()?,
        real_gdp: i.f64s()?,
        nominal_gva: i.f64s()?,
        real_gva: i.f64s()?,
        nominal_household_consumption: i.f64s()?,
        real_household_consumption: i.f64s()?,
        nominal_government_consumption: i.f64s()?,
        real_government_consumption: i.f64s()?,
        nominal_capitalformation: i.f64s()?,
        real_capitalformation: i.f64s()?,
        nominal_fixed_capitalformation: i.f64s()?,
        real_fixed_capitalformation: i.f64s()?,
        nominal_fixed_capitalformation_dwellings: i.f64s()?,
        real_fixed_capitalformation_dwellings: i.f64s()?,
        nominal_exports: i.f64s()?,
        real_exports: i.f64s()?,
        nominal_imports: i.f64s()?,
        real_imports: i.f64s()?,
        operating_surplus: i.f64s()?,
        compensation_employees: i.f64s()?,
        wages: i.f64s()?,
        taxes_production: i.f64s()?,
        gdp_deflator_growth_ea: i.f64s()?,
        real_gdp_ea: i.f64s()?,
        euribor: i.f64s()?,
        nominal_sector_gva: i.f64ss()?,
        real_sector_gva: i.f64ss()?,
        credit_new_per_bank: i.f64ss()?,
        credit_stock_per_bank: i.f64ss()?,
        equity_per_bank: i.f64ss()?,
        reserves_per_bank: i.f64ss()?,
        roe_per_bank: i.f64ss()?,
    })
}
