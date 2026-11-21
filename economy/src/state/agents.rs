//! The agents of the model as bytes and back: workers, firms, banks, the central bank, the government, the rest of
//! the world, and the economy-wide aggregates (the structs of the port's src/agents.rs).

use beforeit::{Aggregates, Banks, CentralBank, Firms, Government, RestOfTheWorld, Workers};

use super::bytes::{In, Out, Res};

pub(super) fn put_workers(o: &mut Out, w: &Workers) {
    let Workers {
        del,
        lastid,
        id_to_index,
        ID,
        Y_h,
        D_h,
        K_h,
        w_h,
        O_h,
        C_d_h,
        I_d_h,
        C_h,
        I_h,
        B_h,
    } = w;
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

pub(super) fn get_workers(i: &mut In) -> Res<Workers> {
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

pub(super) fn put_firms(o: &mut Out, f: &Firms) {
    let Firms {
        del,
        lastid,
        id_to_index,
        ID,
        G_i,
        alpha_bar_i,
        beta_i,
        kappa_i,
        w_i,
        w_bar_i,
        delta_i,
        tau_Y_i,
        tau_K_i,
        N_i,
        Y_i,
        Q_i,
        Q_d_i,
        P_i,
        S_i,
        K_i,
        M_i,
        L_i,
        pi_bar_i,
        D_i,
        Pi_i,
        V_i,
        I_i,
        E_i,
        P_bar_i,
        P_CF_i,
        DS_i,
        DM_i,
        DL_i,
        DL_d_i,
        K_e_i,
        L_e_i,
        Q_s_i,
        I_d_i,
        DM_d_i,
        N_d_i,
        Pi_e_i,
        B_i,
        Y_h,
        C_d_h,
        I_d_h,
        C_h,
        I_h,
        K_h,
        D_h,
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
    for v in [
        I_i, E_i, P_bar_i, P_CF_i, DS_i, DM_i, DL_i, DL_d_i, K_e_i, L_e_i, Q_s_i, I_d_i, DM_d_i,
    ] {
        o.f64s(v);
    }
    o.i64s(N_d_i);
    o.f64s(Pi_e_i);
    o.ns(B_i);
    for v in [Y_h, C_d_h, I_d_h, C_h, I_h, K_h, D_h] {
        o.f64s(v);
    }
}

pub(super) fn get_firms(i: &mut In) -> Res<Firms> {
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

pub(super) fn put_banks(o: &mut Out, b: &Banks) {
    let Banks {
        del,
        lastid,
        id_to_index,
        ID,
        E_k,
        Pi_k,
        Pi_e_k,
        D_k,
        r,
        Y_h,
        C_d_h,
        I_d_h,
        C_h,
        I_h,
        K_h,
        D_h,
        firms,
        w_act,
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

pub(super) fn get_banks(i: &mut In) -> Res<Banks> {
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

pub(super) fn put_central_bank(o: &mut Out, c: &CentralBank) {
    let CentralBank {
        r_bar,
        r_G,
        rho,
        r_star,
        pi_star,
        xi_pi,
        xi_gamma,
        E_CB,
    } = c;
    for v in [r_bar, r_G, rho, r_star, pi_star, xi_pi, xi_gamma, E_CB] {
        o.f64(*v);
    }
}

pub(super) fn get_central_bank(i: &mut In) -> Res<CentralBank> {
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

pub(super) fn put_government(o: &mut Out, g: &Government) {
    let Government {
        alpha_G,
        beta_G,
        sigma_G,
        Y_G,
        C_G,
        L_G,
        sb_inact,
        sb_other,
        C_d_j,
        C_j,
        P_j,
    } = g;
    for v in [alpha_G, beta_G, sigma_G, Y_G, C_G, L_G, sb_inact, sb_other] {
        o.f64(*v);
    }
    o.f64s(C_d_j);
    o.f64(*C_j);
    o.f64(*P_j);
}

pub(super) fn get_government(i: &mut In) -> Res<Government> {
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

pub(super) fn put_rest_of_the_world(o: &mut Out, r: &RestOfTheWorld) {
    let RestOfTheWorld {
        alpha_E,
        beta_E,
        sigma_E,
        alpha_I,
        beta_I,
        sigma_I,
        Y_EA,
        gamma_EA,
        pi_EA,
        alpha_pi_EA,
        beta_pi_EA,
        sigma_pi_EA,
        alpha_Y_EA,
        beta_Y_EA,
        sigma_Y_EA,
        D_RoW,
        Y_I,
        C_E,
        C_d_l,
        C_l,
        Y_m,
        Q_m,
        Q_d_m,
        P_m,
        P_l,
    } = r;
    for v in [
        alpha_E,
        beta_E,
        sigma_E,
        alpha_I,
        beta_I,
        sigma_I,
        Y_EA,
        gamma_EA,
        pi_EA,
        alpha_pi_EA,
        beta_pi_EA,
        sigma_pi_EA,
        alpha_Y_EA,
        beta_Y_EA,
        sigma_Y_EA,
        D_RoW,
        Y_I,
        C_E,
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

pub(super) fn get_rest_of_the_world(i: &mut In) -> Res<RestOfTheWorld> {
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

pub(super) fn put_aggregates(o: &mut Out, a: &Aggregates) {
    let Aggregates {
        Y,
        pi_,
        P_bar,
        P_bar_g,
        P_bar_HH,
        P_bar_CF,
        P_bar_h,
        P_bar_CF_h,
        Y_e,
        gamma_e,
        pi_e,
        epsilon_Y_EA,
        epsilon_E,
        epsilon_I,
        t,
    } = a;
    o.f64s(Y);
    o.f64s(pi_);
    o.f64(*P_bar);
    o.f64s(P_bar_g);
    for v in [
        P_bar_HH,
        P_bar_CF,
        P_bar_h,
        P_bar_CF_h,
        Y_e,
        gamma_e,
        pi_e,
        epsilon_Y_EA,
        epsilon_E,
        epsilon_I,
    ] {
        o.f64(*v);
    }
    o.n(*t);
}

pub(super) fn get_aggregates(i: &mut In) -> Res<Aggregates> {
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
