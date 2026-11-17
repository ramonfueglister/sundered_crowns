//! The state of a model as bytes, and back.
//!
//! The port has no save format of its own, but every field of the model is public and its random number generator
//! hands out its state, so the shell can write the whole model without changing the port. Every struct is taken apart
//! field by field without `..`: when the port gains or loses a field, this file stops compiling instead of silently
//! saving half a model.
//!
//! Format (little endian): the tag `SCEC`, the format version, the four words of the random number generator, then the
//! parts of the model in the order of `AbstractModel`, the fields of the daily clock last. Lists start with their length. Numbers of agents and positions
//! are 32 bit (`u32::MAX` stands for "none"), amounts are the 64 bits of the float, so a state loads bit for bit.

use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};

use beforeit::{
    AbstractModel, Aggregates, Banks, CentralBank, Data, Firms, Government, Properties, RestOfTheWorld, Workers, Xoshiro,
};

use crate::Economy;
use crate::clock::DailyClock;
use crate::past::{Past, Phase, Series};
use crate::trade::{Cities, Merchants};

const TAG: &[u8; 4] = b"SCEC";
/// The tag of cities with their merchants ([`save_cities`]).
const TAG_CITIES: &[u8; 4] = b"SCET";
/// Version of the byte format of cities with their merchants.
pub const FORMAT_CITIES: u32 = 1;
/// Version of the byte format. A change to the pinned port that changes its state needs a new number and a step in
/// the world's upgrade chain (src/sim/upgrade.ts). 2: the fields of the daily clock. 3: the wages in money.
/// 4: the demand pull. 5: of the national accounts the clock keeps the series that the key figures sum, the port
/// keeps its last row. 6: the clock can keep the past in a fixed size ([`crate::past`]). States of formats 4 and 5
/// are still read and become format 6 when they are saved ([`load`]); they keep the whole past, as they had it.
pub const FORMAT: u32 = 6;
const NONE: u32 = u32::MAX;
/// The length of the last state of cities written ([`save_cities`]): how much room the next one is given at once.
/// It changes no byte of a state.
static SIZE: AtomicUsize = AtomicUsize::new(0);

// ---- writing

struct Out(Vec<u8>);

impl Out {
    fn bool(&mut self, v: bool) {
        self.0.push(v as u8);
    }
    fn u32(&mut self, v: u32) {
        self.0.extend_from_slice(&v.to_le_bytes());
    }
    fn u64(&mut self, v: u64) {
        self.0.extend_from_slice(&v.to_le_bytes());
    }
    fn i64(&mut self, v: i64) {
        self.0.extend_from_slice(&v.to_le_bytes());
    }
    fn f64(&mut self, v: f64) {
        self.0.extend_from_slice(&v.to_bits().to_le_bytes());
    }
    /// A count or a position. The format holds 32 bits; `u32::MAX` is kept for "none".
    fn n(&mut self, v: usize) {
        assert!((v as u64) < NONE as u64, "{v} does not fit the state format");
        self.u32(v as u32);
    }
    fn opt(&mut self, v: Option<usize>) {
        match v {
            Some(v) => self.n(v),
            None => self.u32(NONE),
        }
    }
    fn f64s(&mut self, v: &[f64]) {
        self.n(v.len());
        for &x in v {
            self.f64(x);
        }
    }
    fn i64s(&mut self, v: &[i64]) {
        self.n(v.len());
        for &x in v {
            self.i64(x);
        }
    }
    fn ns(&mut self, v: &[usize]) {
        self.n(v.len());
        for &x in v {
            self.n(x);
        }
    }
    fn opts(&mut self, v: &[Option<usize>]) {
        self.n(v.len());
        for &x in v {
            self.opt(x);
        }
    }
    fn f64ss(&mut self, v: &[Vec<f64>]) {
        self.n(v.len());
        for x in v {
            self.f64s(x);
        }
    }
    fn nss(&mut self, v: &[Vec<usize>]) {
        self.n(v.len());
        for x in v {
            self.ns(x);
        }
    }
    /// The positions by ID, sorted by ID: a hash map has no order of its own, the bytes must have one.
    fn map(&mut self, m: &HashMap<usize, usize>) {
        let mut pairs: Vec<(usize, usize)> = m.iter().map(|(&k, &v)| (k, v)).collect();
        pairs.sort_unstable();
        self.n(pairs.len());
        for (k, v) in pairs {
            self.n(k);
            self.n(v);
        }
    }
}

// ---- reading

struct In<'a> {
    b: &'a [u8],
    at: usize,
}

type Res<T> = Result<T, String>;

impl In<'_> {
    fn take(&mut self, n: usize) -> Res<&[u8]> {
        let end = self.at.checked_add(n).filter(|&e| e <= self.b.len());
        let Some(end) = end else {
            return Err(format!("the state ends at byte {}, {n} more are needed at {}", self.b.len(), self.at));
        };
        let s = &self.b[self.at..end];
        self.at = end;
        Ok(s)
    }
    fn bool(&mut self) -> Res<bool> {
        match self.take(1)?[0] {
            0 => Ok(false),
            1 => Ok(true),
            x => Err(format!("{x} is not a yes or no (byte {})", self.at - 1)),
        }
    }
    fn u32(&mut self) -> Res<u32> {
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }
    fn u64(&mut self) -> Res<u64> {
        Ok(u64::from_le_bytes(self.take(8)?.try_into().unwrap()))
    }
    fn i64(&mut self) -> Res<i64> {
        Ok(i64::from_le_bytes(self.take(8)?.try_into().unwrap()))
    }
    fn f64(&mut self) -> Res<f64> {
        Ok(f64::from_bits(self.u64()?))
    }
    fn n(&mut self) -> Res<usize> {
        match self.u32()? {
            NONE => Err(format!("a count is missing (byte {})", self.at - 4)),
            v => Ok(v as usize),
        }
    }
    fn opt(&mut self) -> Res<Option<usize>> {
        Ok(match self.u32()? {
            NONE => None,
            v => Some(v as usize),
        })
    }
    /// The length of a list whose entries take at least `size` bytes each (a broken length must not ask for memory
    /// the state cannot fill).
    fn len(&mut self, size: usize) -> Res<usize> {
        let n = self.n()?;
        if n.saturating_mul(size) > self.b.len() - self.at {
            return Err(format!("a list of {n} entries does not fit the rest of the state (byte {})", self.at - 4));
        }
        Ok(n)
    }
    fn f64s(&mut self) -> Res<Vec<f64>> {
        (0..self.len(8)?).map(|_| self.f64()).collect()
    }
    fn i64s(&mut self) -> Res<Vec<i64>> {
        (0..self.len(8)?).map(|_| self.i64()).collect()
    }
    fn ns(&mut self) -> Res<Vec<usize>> {
        (0..self.len(4)?).map(|_| self.n()).collect()
    }
    fn opts(&mut self) -> Res<Vec<Option<usize>>> {
        (0..self.len(4)?).map(|_| self.opt()).collect()
    }
    fn f64ss(&mut self) -> Res<Vec<Vec<f64>>> {
        (0..self.len(4)?).map(|_| self.f64s()).collect()
    }
    fn nss(&mut self) -> Res<Vec<Vec<usize>>> {
        (0..self.len(4)?).map(|_| self.ns()).collect()
    }
    fn map(&mut self) -> Res<HashMap<usize, usize>> {
        let n = self.len(8)?;
        let mut m = HashMap::with_capacity(n);
        for _ in 0..n {
            let (k, v) = (self.n()?, self.n()?);
            m.insert(k, v);
        }
        Ok(m)
    }
}

// ---- the parts of the model

fn put_workers(o: &mut Out, w: &Workers) {
    let Workers { del, lastid, id_to_index, ID, Y_h, D_h, K_h, w_h, O_h, C_d_h, I_d_h, C_h, I_h, B_h } = w;
    o.bool(*del);
    o.opt(*lastid);
    o.map(id_to_index);
    o.ns(ID);
    for v in [Y_h, D_h, K_h, w_h] {
        o.f64s(v);
    }
    o.opts(O_h);
    for v in [C_d_h, I_d_h, C_h, I_h] {
        o.f64s(v);
    }
    o.ns(B_h);
}

fn get_workers(i: &mut In) -> Res<Workers> {
    Ok(Workers {
        del: i.bool()?,
        lastid: i.opt()?,
        id_to_index: i.map()?,
        ID: i.ns()?,
        Y_h: i.f64s()?,
        D_h: i.f64s()?,
        K_h: i.f64s()?,
        w_h: i.f64s()?,
        O_h: i.opts()?,
        C_d_h: i.f64s()?,
        I_d_h: i.f64s()?,
        C_h: i.f64s()?,
        I_h: i.f64s()?,
        B_h: i.ns()?,
    })
}

fn put_firms(o: &mut Out, f: &Firms) {
    let Firms {
        del, lastid, id_to_index, ID, G_i, alpha_bar_i, beta_i, kappa_i, w_i, w_bar_i, delta_i, tau_Y_i, tau_K_i, N_i,
        Y_i, Q_i, Q_d_i, P_i, S_i, K_i, M_i, L_i, pi_bar_i, D_i, Pi_i, V_i, I_i, E_i, P_bar_i, P_CF_i, DS_i, DM_i, DL_i,
        DL_d_i, K_e_i, L_e_i, Q_s_i, I_d_i, DM_d_i, N_d_i, Pi_e_i, B_i, Y_h, C_d_h, I_d_h, C_h, I_h, K_h, D_h,
    } = f;
    o.bool(*del);
    o.opt(*lastid);
    o.map(id_to_index);
    o.ns(ID);
    o.ns(G_i);
    for v in [alpha_bar_i, beta_i, kappa_i, w_i, w_bar_i, delta_i, tau_Y_i, tau_K_i] {
        o.f64s(v);
    }
    o.i64s(N_i);
    for v in [Y_i, Q_i, Q_d_i, P_i, S_i, K_i, M_i, L_i, pi_bar_i, D_i, Pi_i] {
        o.f64s(v);
    }
    o.i64s(V_i);
    for v in [I_i, E_i, P_bar_i, P_CF_i, DS_i, DM_i, DL_i, DL_d_i, K_e_i, L_e_i, Q_s_i, I_d_i, DM_d_i] {
        o.f64s(v);
    }
    o.i64s(N_d_i);
    o.f64s(Pi_e_i);
    o.ns(B_i);
    for v in [Y_h, C_d_h, I_d_h, C_h, I_h, K_h, D_h] {
        o.f64s(v);
    }
}

fn get_firms(i: &mut In) -> Res<Firms> {
    Ok(Firms {
        del: i.bool()?,
        lastid: i.opt()?,
        id_to_index: i.map()?,
        ID: i.ns()?,
        G_i: i.ns()?,
        alpha_bar_i: i.f64s()?,
        beta_i: i.f64s()?,
        kappa_i: i.f64s()?,
        w_i: i.f64s()?,
        w_bar_i: i.f64s()?,
        delta_i: i.f64s()?,
        tau_Y_i: i.f64s()?,
        tau_K_i: i.f64s()?,
        N_i: i.i64s()?,
        Y_i: i.f64s()?,
        Q_i: i.f64s()?,
        Q_d_i: i.f64s()?,
        P_i: i.f64s()?,
        S_i: i.f64s()?,
        K_i: i.f64s()?,
        M_i: i.f64s()?,
        L_i: i.f64s()?,
        pi_bar_i: i.f64s()?,
        D_i: i.f64s()?,
        Pi_i: i.f64s()?,
        V_i: i.i64s()?,
        I_i: i.f64s()?,
        E_i: i.f64s()?,
        P_bar_i: i.f64s()?,
        P_CF_i: i.f64s()?,
        DS_i: i.f64s()?,
        DM_i: i.f64s()?,
        DL_i: i.f64s()?,
        DL_d_i: i.f64s()?,
        K_e_i: i.f64s()?,
        L_e_i: i.f64s()?,
        Q_s_i: i.f64s()?,
        I_d_i: i.f64s()?,
        DM_d_i: i.f64s()?,
        N_d_i: i.i64s()?,
        Pi_e_i: i.f64s()?,
        B_i: i.ns()?,
        Y_h: i.f64s()?,
        C_d_h: i.f64s()?,
        I_d_h: i.f64s()?,
        C_h: i.f64s()?,
        I_h: i.f64s()?,
        K_h: i.f64s()?,
        D_h: i.f64s()?,
    })
}

fn put_banks(o: &mut Out, b: &Banks) {
    let Banks {
        del, lastid, id_to_index, ID, E_k, Pi_k, Pi_e_k, D_k, r, Y_h, C_d_h, I_d_h, C_h, I_h, K_h, D_h, firms, w_act,
        w_inact,
    } = b;
    o.bool(*del);
    o.opt(*lastid);
    o.map(id_to_index);
    o.ns(ID);
    for v in [E_k, Pi_k, Pi_e_k, D_k, r, Y_h, C_d_h, I_d_h, C_h, I_h, K_h, D_h] {
        o.f64s(v);
    }
    for v in [firms, w_act, w_inact] {
        o.nss(v);
    }
}

fn get_banks(i: &mut In) -> Res<Banks> {
    Ok(Banks {
        del: i.bool()?,
        lastid: i.opt()?,
        id_to_index: i.map()?,
        ID: i.ns()?,
        E_k: i.f64s()?,
        Pi_k: i.f64s()?,
        Pi_e_k: i.f64s()?,
        D_k: i.f64s()?,
        r: i.f64s()?,
        Y_h: i.f64s()?,
        C_d_h: i.f64s()?,
        I_d_h: i.f64s()?,
        C_h: i.f64s()?,
        I_h: i.f64s()?,
        K_h: i.f64s()?,
        D_h: i.f64s()?,
        firms: i.nss()?,
        w_act: i.nss()?,
        w_inact: i.nss()?,
    })
}

fn put_central_bank(o: &mut Out, c: &CentralBank) {
    let CentralBank { r_bar, r_G, rho, r_star, pi_star, xi_pi, xi_gamma, E_CB } = c;
    for v in [r_bar, r_G, rho, r_star, pi_star, xi_pi, xi_gamma, E_CB] {
        o.f64(*v);
    }
}

fn get_central_bank(i: &mut In) -> Res<CentralBank> {
    Ok(CentralBank {
        r_bar: i.f64()?,
        r_G: i.f64()?,
        rho: i.f64()?,
        r_star: i.f64()?,
        pi_star: i.f64()?,
        xi_pi: i.f64()?,
        xi_gamma: i.f64()?,
        E_CB: i.f64()?,
    })
}

fn put_government(o: &mut Out, g: &Government) {
    let Government { alpha_G, beta_G, sigma_G, Y_G, C_G, L_G, sb_inact, sb_other, C_d_j, C_j, P_j } = g;
    for v in [alpha_G, beta_G, sigma_G, Y_G, C_G, L_G, sb_inact, sb_other] {
        o.f64(*v);
    }
    o.f64s(C_d_j);
    o.f64(*C_j);
    o.f64(*P_j);
}

fn get_government(i: &mut In) -> Res<Government> {
    Ok(Government {
        alpha_G: i.f64()?,
        beta_G: i.f64()?,
        sigma_G: i.f64()?,
        Y_G: i.f64()?,
        C_G: i.f64()?,
        L_G: i.f64()?,
        sb_inact: i.f64()?,
        sb_other: i.f64()?,
        C_d_j: i.f64s()?,
        C_j: i.f64()?,
        P_j: i.f64()?,
    })
}

fn put_rest_of_the_world(o: &mut Out, r: &RestOfTheWorld) {
    let RestOfTheWorld {
        alpha_E, beta_E, sigma_E, alpha_I, beta_I, sigma_I, Y_EA, gamma_EA, pi_EA, alpha_pi_EA, beta_pi_EA,
        sigma_pi_EA, alpha_Y_EA, beta_Y_EA, sigma_Y_EA, D_RoW, Y_I, C_E, C_d_l, C_l, Y_m, Q_m, Q_d_m, P_m, P_l,
    } = r;
    for v in [
        alpha_E, beta_E, sigma_E, alpha_I, beta_I, sigma_I, Y_EA, gamma_EA, pi_EA, alpha_pi_EA, beta_pi_EA,
        sigma_pi_EA, alpha_Y_EA, beta_Y_EA, sigma_Y_EA, D_RoW, Y_I, C_E,
    ] {
        o.f64(*v);
    }
    o.f64s(C_d_l);
    o.f64(*C_l);
    for v in [Y_m, Q_m, Q_d_m, P_m] {
        o.f64s(v);
    }
    o.f64(*P_l);
}

fn get_rest_of_the_world(i: &mut In) -> Res<RestOfTheWorld> {
    Ok(RestOfTheWorld {
        alpha_E: i.f64()?,
        beta_E: i.f64()?,
        sigma_E: i.f64()?,
        alpha_I: i.f64()?,
        beta_I: i.f64()?,
        sigma_I: i.f64()?,
        Y_EA: i.f64()?,
        gamma_EA: i.f64()?,
        pi_EA: i.f64()?,
        alpha_pi_EA: i.f64()?,
        beta_pi_EA: i.f64()?,
        sigma_pi_EA: i.f64()?,
        alpha_Y_EA: i.f64()?,
        beta_Y_EA: i.f64()?,
        sigma_Y_EA: i.f64()?,
        D_RoW: i.f64()?,
        Y_I: i.f64()?,
        C_E: i.f64()?,
        C_d_l: i.f64s()?,
        C_l: i.f64()?,
        Y_m: i.f64s()?,
        Q_m: i.f64s()?,
        Q_d_m: i.f64s()?,
        P_m: i.f64s()?,
        P_l: i.f64()?,
    })
}

fn put_aggregates(o: &mut Out, a: &Aggregates) {
    let Aggregates {
        Y, pi_, P_bar, P_bar_g, P_bar_HH, P_bar_CF, P_bar_h, P_bar_CF_h, Y_e, gamma_e, pi_e, epsilon_Y_EA, epsilon_E,
        epsilon_I, t,
    } = a;
    o.f64s(Y);
    o.f64s(pi_);
    o.f64(*P_bar);
    o.f64s(P_bar_g);
    for v in [P_bar_HH, P_bar_CF, P_bar_h, P_bar_CF_h, Y_e, gamma_e, pi_e, epsilon_Y_EA, epsilon_E, epsilon_I] {
        o.f64(*v);
    }
    o.n(*t);
}

fn get_aggregates(i: &mut In) -> Res<Aggregates> {
    Ok(Aggregates {
        Y: i.f64s()?,
        pi_: i.f64s()?,
        P_bar: i.f64()?,
        P_bar_g: i.f64s()?,
        P_bar_HH: i.f64()?,
        P_bar_CF: i.f64()?,
        P_bar_h: i.f64()?,
        P_bar_CF_h: i.f64()?,
        Y_e: i.f64()?,
        gamma_e: i.f64()?,
        pi_e: i.f64()?,
        epsilon_Y_EA: i.f64()?,
        epsilon_E: i.f64()?,
        epsilon_I: i.f64()?,
        t: i.n()?,
    })
}

fn put_properties(o: &mut Out, p: &Properties) {
    let Properties {
        G, T_prime, H_act, H_inact, J, L, I_s, I, H, tau_INC, tau_FIRM, tau_VAT, tau_SIF, tau_SIW, tau_EXPORT, tau_CF,
        tau_G, theta_UB, psi, psi_H, mu, theta_DIV, theta, zeta, zeta_LTV, zeta_b, omega_pi, theta_calvo,
        overdrafts_in_capital_ratio, b_CF_g, b_CFH_g, b_HH_g, c_G_g, c_E_g, c_I_g, a_sg, C, D_H, K_H, sb_other, E_k,
        r_bar, n_banks,
    } = p;
    for v in [G, T_prime, H_act, H_inact, J, L] {
        o.n(*v);
    }
    o.ns(I_s);
    o.n(*I);
    o.n(*H);
    for v in [
        tau_INC, tau_FIRM, tau_VAT, tau_SIF, tau_SIW, tau_EXPORT, tau_CF, tau_G, theta_UB, psi, psi_H, mu, theta_DIV,
        theta, zeta, zeta_LTV, zeta_b, omega_pi, theta_calvo,
    ] {
        o.f64(*v);
    }
    o.bool(*overdrafts_in_capital_ratio);
    for v in [b_CF_g, b_CFH_g, b_HH_g, c_G_g, c_E_g, c_I_g] {
        o.f64s(v);
    }
    o.f64ss(a_sg);
    for row in C {
        for v in row {
            o.f64(*v);
        }
    }
    for v in [D_H, K_H, sb_other, E_k, r_bar] {
        o.f64(*v);
    }
    o.n(*n_banks);
}

fn get_properties(i: &mut In) -> Res<Properties> {
    Ok(Properties {
        G: i.n()?,
        T_prime: i.n()?,
        H_act: i.n()?,
        H_inact: i.n()?,
        J: i.n()?,
        L: i.n()?,
        I_s: i.ns()?,
        I: i.n()?,
        H: i.n()?,
        tau_INC: i.f64()?,
        tau_FIRM: i.f64()?,
        tau_VAT: i.f64()?,
        tau_SIF: i.f64()?,
        tau_SIW: i.f64()?,
        tau_EXPORT: i.f64()?,
        tau_CF: i.f64()?,
        tau_G: i.f64()?,
        theta_UB: i.f64()?,
        psi: i.f64()?,
        psi_H: i.f64()?,
        mu: i.f64()?,
        theta_DIV: i.f64()?,
        theta: i.f64()?,
        zeta: i.f64()?,
        zeta_LTV: i.f64()?,
        zeta_b: i.f64()?,
        omega_pi: i.f64()?,
        theta_calvo: i.f64()?,
        overdrafts_in_capital_ratio: i.bool()?,
        b_CF_g: i.f64s()?,
        b_CFH_g: i.f64s()?,
        b_HH_g: i.f64s()?,
        c_G_g: i.f64s()?,
        c_E_g: i.f64s()?,
        c_I_g: i.f64s()?,
        a_sg: i.f64ss()?,
        C: {
            let mut c = [[0.0; 3]; 3];
            for row in &mut c {
                for v in row {
                    *v = i.f64()?;
                }
            }
            c
        },
        D_H: i.f64()?,
        K_H: i.f64()?,
        sb_other: i.f64()?,
        E_k: i.f64()?,
        r_bar: i.f64()?,
        n_banks: i.n()?,
    })
}

fn put_data(o: &mut Out, d: &Data) {
    let Data {
        collection_time, nominal_gdp, real_gdp, nominal_gva, real_gva, nominal_household_consumption,
        real_household_consumption, nominal_government_consumption, real_government_consumption,
        nominal_capitalformation, real_capitalformation, nominal_fixed_capitalformation, real_fixed_capitalformation,
        nominal_fixed_capitalformation_dwellings, real_fixed_capitalformation_dwellings, nominal_exports, real_exports,
        nominal_imports, real_imports, operating_surplus, compensation_employees, wages, taxes_production,
        gdp_deflator_growth_ea, real_gdp_ea, euribor, nominal_sector_gva, real_sector_gva, credit_new_per_bank,
        credit_stock_per_bank, equity_per_bank, reserves_per_bank, roe_per_bank,
    } = d;
    o.ns(collection_time);
    for v in [
        nominal_gdp, real_gdp, nominal_gva, real_gva, nominal_household_consumption, real_household_consumption,
        nominal_government_consumption, real_government_consumption, nominal_capitalformation, real_capitalformation,
        nominal_fixed_capitalformation, real_fixed_capitalformation, nominal_fixed_capitalformation_dwellings,
        real_fixed_capitalformation_dwellings, nominal_exports, real_exports, nominal_imports, real_imports,
        operating_surplus, compensation_employees, wages, taxes_production, gdp_deflator_growth_ea, real_gdp_ea,
        euribor,
    ] {
        o.f64s(v);
    }
    for v in [
        nominal_sector_gva, real_sector_gva, credit_new_per_bank, credit_stock_per_bank, equity_per_bank,
        reserves_per_bank, roe_per_bank,
    ] {
        o.f64ss(v);
    }
}

fn get_data(i: &mut In) -> Res<Data> {
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

fn put_clock(o: &mut Out, c: &DailyClock) {
    // `trade` is set for the length of a period only (src/trade.rs): a saved economy has none
    let DailyClock { plan, window, demand, periods, start, accounts, wage, real_wage, demand_pull, past, trade: _ } = c;
    o.n(*plan);
    o.n(*window);
    o.f64s(demand);
    o.n(periods.len());
    for &x in periods {
        o.u32(x);
    }
    o.f64(start[0]);
    o.f64(start[1]);
    o.f64s(wage);
    o.f64s(real_wage);
    o.bool(*demand_pull);
    o.n(accounts.len());
    for row in accounts {
        for &x in row {
            o.f64(x);
        }
    }
    o.bool(past.is_some());
    if let Some(Past { periods, Y, pi }) = past {
        o.n(*periods);
        for Series { log, origin, history, early, days, sum, phases } in [Y, pi] {
            o.bool(*log);
            o.f64(*origin);
            o.n(*history);
            o.f64(early[0]);
            o.f64(early[1]);
            o.f64s(days);
            o.f64(*sum);
            for &Phase { last, x, xx, xy } in phases {
                for v in [last, x, xx, xy] {
                    o.f64(v);
                }
            }
        }
    }
}

fn get_series(i: &mut In, window: usize) -> Res<Series> {
    let (log, origin, history, early, days, sum) = (i.bool()?, i.f64()?, i.n()?, [i.f64()?, i.f64()?], i.f64s()?, i.f64()?);
    if days.len() != window || history < 2 {
        return Err(format!("a past of {} periods with {history} entries of history and windows of {window} periods", days.len()));
    }
    let mut phases = Vec::with_capacity(window);
    for _ in 0..window {
        phases.push(Phase { last: i.f64()?, x: i.f64()?, xx: i.f64()?, xy: i.f64()? });
    }
    Ok(Series { log, origin, history, early, days, sum, phases })
}

fn get_clock(i: &mut In, format: u32) -> Res<DailyClock> {
    let (plan, window) = (i.n()?, i.n()?);
    if plan == 0 || window == 0 {
        return Err(format!("a clock with a plan every {plan} periods and windows of {window} periods"));
    }
    let demand = i.f64s()?;
    let n = i.len(4)?;
    let mut periods = Vec::with_capacity(n);
    for _ in 0..n {
        periods.push(i.u32()?);
    }
    let start = [i.f64()?, i.f64()?];
    let (wage, real_wage) = (i.f64s()?, i.f64s()?);
    if wage.len() != real_wage.len() || (!wage.is_empty() && wage.len() != demand.len()) {
        return Err(format!("a clock with wages in money of {} firms, real wages of {} and {} firms", wage.len(), real_wage.len(), demand.len()));
    }
    let demand_pull = i.bool()?;
    // format 4 has no rows of the clock: `load` takes them from the port's rows
    let mut accounts = Vec::new();
    if format >= 5 {
        let n = i.len(8 * crate::SUMMED)?;
        if n == 0 || n > window {
            return Err(format!("a clock with {n} rows of the national accounts and windows of {window} periods"));
        }
        for _ in 0..n {
            let mut row = [0.0; crate::SUMMED];
            for x in &mut row {
                *x = i.f64()?;
            }
            accounts.push(row);
        }
    }
    // formats before 6 keep the whole past in the port's lists
    let past = if format >= 6 && i.bool()? { Some(Past { periods: i.n()?, Y: get_series(i, window)?, pi: get_series(i, window)? }) } else { None };
    Ok(DailyClock { plan, window, demand, periods, start, accounts, wage, real_wage, demand_pull, past, trade: None })
}

/// The model and its random number generator as bytes. The same model always gives the same bytes.
pub fn save(model: &AbstractModel<DailyClock>, rng: &Xoshiro) -> Vec<u8> {
    let mut o = Out(Vec::new());
    put(&mut o, model, rng);
    o.0
}

fn put(o: &mut Out, model: &AbstractModel<DailyClock>, rng: &Xoshiro) {
    let AbstractModel { w_act, w_inact, firms, banks, cb, gov, rotw, agg, prop, data, ext } = model;
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
        return Err(format!("state format {format}, this engine reads formats 4 to {FORMAT}"));
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
        model.ext.accounts = vec![crate::summed(&model.data, 0)];
        crate::take_rows(&mut model);
    }
    if i.at != bytes.len() {
        return Err(format!("{} bytes are left over after the state", bytes.len() - i.at));
    }
    Ok((model, rng))
}

// ---- cities that trade

/// Cities and their merchants as bytes: the tag `SCET`, the format version, the number of cities, the state of every
/// city ([`save`]) with its length before it, then the books of the merchants. The same cities always give the same
/// bytes.
pub fn save_cities(all: &Cities) -> Vec<u8> {
    let Cities { cities, merchants } = all;
    let Merchants { stock, value, orders, share, bought, sold, start, start_stock } = merchants;
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
    if format != FORMAT_CITIES {
        return Err(format!("state format {format} of cities, this engine reads format {FORMAT_CITIES}"));
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
    let merchants = Merchants { stock, value, orders, share, bought, sold, start: i.f64()?, start_stock: i.f64s()? };
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
        && [&m.bought, &m.sold, &m.start_stock].iter().all(|v| v.len() == G);
    if !fits {
        return Err(format!("the books of the merchants do not fit {n} cities with {G} products"));
    }
    Ok(Cities { cities, merchants })
}
