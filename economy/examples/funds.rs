//! TRIAL (distance in trade). Per year and city: D_RoW, households' deposits, firms' deposits, loans, banks' equity,
//! L_G, E_CB, nominal GDP, real GDP, consumption, price level, real exports, real imports, share without work.
//! usage: distance <years> <seed> <plan> <window> <routes.txt|none> <tons per unit agriculture> <industry> (<parameters.json> <initial_conditions.json>)…
use sc_economy::Economy;
use sc_economy::trade::Cities;
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let n = |k: usize| a[k].parse::<usize>().unwrap();
    let (years, seed, plan, window) = (n(1), n(2) as u64, n(3), n(4));
    let dens = [a[6].parse::<f64>().unwrap(), a[7].parse::<f64>().unwrap(), 0.0];
    let read = |p: &str| std::fs::read_to_string(p).unwrap();
    let cities: Vec<Economy> = a[8..].chunks(2).enumerate().map(|(c, f)| {
        let e = Economy::new(&read(&f[0]), &read(&f[1]), seed + c as u64, plan, window).unwrap().with_wages_in_money().with_demand_pull().unwrap().with_savings_spent(std::env::var("SAVINGS").ok().and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.4) / 365.0).unwrap(); let e = if std::env::var("CROWN").as_deref() == Ok("series") { e } else { e.with_crown_spending_revenue() }; let e = if std::env::var("OWNER").as_deref() == Ok("paper") { e } else { e.with_owner_household() }; e.with_bounded_past()
    }).collect();
    let k = cities.len();
    let mut all = Cities::new(cities).unwrap();
    if a[5] != "none" {
        let (mut days, mut labour) = (vec![vec![0; k]; k], vec![vec![0.0; k]; k]);
        for l in read(&a[5]).lines() {
            let p: Vec<&str> = l.split_whitespace().collect();
            let (c, d, t, lab) = (p[0].parse::<usize>().unwrap(), p[1].parse::<usize>().unwrap(), p[2].parse::<usize>().unwrap(), p[3].parse::<f64>().unwrap());
            if c < k && d < k { days[c][d] = t; labour[c][d] = lab; }
        }
        all = all.with_routes(days, labour, dens.to_vec(), std::env::var("THETA").ok().and_then(|v| v.parse().ok()).unwrap_or(2.0)).unwrap();
    }
    let s = |v: &[f64]| v.iter().sum::<f64>();
    // flow of funds of the firms of every city, summed over the days: [losses not borne, stock built at price,
    // investment less depreciation, materials bought less used, dividends, profits, sales to all, wages]
    let mut acc = vec![[0.0f64; 8]; k];
    let mut own = [0u64; 4]; let mut deep = 0.0f64;
    let start: Vec<[f64; 6]> = all.cities.iter().map(|e| { let m = &e.model; [s(&m.firms.D_i) - s(&m.firms.L_i), s(&m.w_act.D_h) + s(&m.w_inact.D_h) + s(&m.firms.D_h) + s(&m.banks.D_h), m.rotw.D_RoW, s(&m.banks.E_k), m.gov.L_G, e.figures()[1]] }).collect();
    for day in 0..years * 365 {
        all.step(1);
        for (c, e) in all.cities.iter().enumerate() {
            let m = &e.model; let f = &m.firms; let p = &m.prop;
            for i in 0..f.len() {
                let pi = f.Pi_i[i];
                own[0] += 1; if pi < 0.0 { own[1] += 1; } if f.D_h[i] < 0.0 { own[2] += 1; deep = deep.min(f.D_h[i] / (f.P_i[i] * f.Y_i[i]).max(1e-9)); } if f.D_i[i] < 0.0 { own[3] += 1; }
                acc[c][0] += pi.min(0.0);
                acc[c][1] += f.P_i[i] * f.DS_i[i];
                acc[c][2] += f.P_CF_i[i] * f.I_i[i] - f.delta_i[i] / f.kappa_i[i] * f.P_CF_i[i] * f.Y_i[i];
                acc[c][3] += f.DM_i[i] * f.P_bar_i[i] - 1.0 / f.beta_i[i] * f.P_bar_i[i] * f.Y_i[i];
                acc[c][4] += p.theta_DIV * (1.0 - p.tau_FIRM) * pi.max(0.0);
                acc[c][5] += pi;
                acc[c][6] += f.P_i[i] * f.Q_i[i];
                acc[c][7] += f.w_i[i] * f.N_i[i] as f64 * m.agg.P_bar_HH;
            }
        }
        if (day + 1) % 3650 == 0 || day + 1 == years * 365 {
            for (c, e) in all.cities.iter().enumerate() {
                let m = &e.model; let f = e.figures();
                let now = [s(&m.firms.D_i) - s(&m.firms.L_i), s(&m.w_act.D_h) + s(&m.w_inact.D_h) + s(&m.firms.D_h) + s(&m.banks.D_h), m.rotw.D_RoW, s(&m.banks.E_k), m.gov.L_G, f[1]];
                println!("F {} {c} firms_net {:.1} households {:.1} merchants {:.1} bank_equity {:.1} crown_debt {:.1} | losses {:.1} stock {:.1} invest_less_depr {:.1} materials {:.1} | dividends {:.1} profits {:.1} sales {:.1} wages {:.1} | gdp {:.1} gdp0 {:.1} exp {:.2} imp {:.2}", (day + 1) / 365, now[0] - start[c][0], now[1] - start[c][1], now[2] - start[c][2], now[3] - start[c][3], now[4] - start[c][4], acc[c][0], acc[c][1], acc[c][2], acc[c][3], acc[c][4], acc[c][5], acc[c][6], acc[c][7], f[1], start[c][5], f[8], f[9]);
            }
        }
    }
    let neg: usize = all.cities.iter().map(|e| e.model.firms.D_h.iter().filter(|d| **d < 0.0).count()).sum();
    let debt: f64 = all.cities.iter().map(|e| e.model.firms.D_h.iter().filter(|d| **d < 0.0).sum::<f64>()).sum();
    let banks = all.cities.iter().filter(|e| e.model.banks.E_k.iter().sum::<f64>() < 0.0).count();
    println!("O firm_days {} loss_days {} owner_below_zero_days {} firm_below_zero_days {} deepest_in_days_of_output {:.2} owners_below_zero_at_end {} their_debt {:.1} banks_negative {}", own[0], own[1], own[2], own[3], deep, neg, debt, banks);
}
