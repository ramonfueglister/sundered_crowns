//! The properties of the model, the values that stay fixed during a run, as bytes and back (the port's
//! src/params.rs).

use beforeit::Properties;

use super::bytes::{In, Out, Res};

pub(super) fn put_properties(o: &mut Out, p: &Properties) {
    let Properties {
        G,
        T_prime,
        H_act,
        H_inact,
        J,
        L,
        I_s,
        I,
        H,
        tau_INC,
        tau_FIRM,
        tau_VAT,
        tau_SIF,
        tau_SIW,
        tau_EXPORT,
        tau_CF,
        tau_G,
        theta_UB,
        psi,
        psi_H,
        mu,
        theta_DIV,
        theta,
        zeta,
        zeta_LTV,
        zeta_b,
        omega_pi,
        theta_calvo,
        overdrafts_in_capital_ratio,
        b_CF_g,
        b_CFH_g,
        b_HH_g,
        c_G_g,
        c_E_g,
        c_I_g,
        a_sg,
        C,
        D_H,
        K_H,
        sb_other,
        E_k,
        r_bar,
        n_banks,
    } = p;
    for v in [G, T_prime, H_act, H_inact, J, L] {
        o.n(*v);
    }
    o.ns(I_s);
    o.n(*I);
    o.n(*H);
    for v in [
        tau_INC,
        tau_FIRM,
        tau_VAT,
        tau_SIF,
        tau_SIW,
        tau_EXPORT,
        tau_CF,
        tau_G,
        theta_UB,
        psi,
        psi_H,
        mu,
        theta_DIV,
        theta,
        zeta,
        zeta_LTV,
        zeta_b,
        omega_pi,
        theta_calvo,
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

pub(super) fn get_properties(i: &mut In) -> Res<Properties> {
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
