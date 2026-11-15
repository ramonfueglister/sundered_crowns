//! Cities that trade with each other: every city is a whole economy of the port, and the rest of the world of a
//! city is the other cities (docs/ECONOMY_DESIGN.md, section 5).
//!
//! In the port the rest of the world is two random series: a demand for exports and a supply of imports, each an
//! AR(1) rule of its own (A.76, A.81). Nothing connects them, so goods come from nowhere and go nowhere. Here the
//! merchants stand between the cities and replace exactly that rule ([`import_export`], the port's
//! `rotw_import_export`); every other rule of a city is the port's (with the daily clock, [`crate::clock`]):
//!
//! - What the merchants buy in a city on a day (the port's foreign consumers, `C_l`) lies the next day at their
//!   stalls in the cities it was ordered for (the port's foreign sellers, `Y_m`), product by product.
//! - They sell at what the goods cost them, the export duty of the city of origin included (`P_m`). So their worth,
//!   money in all cities (`D_RoW`) plus stock at cost, never changes: no money is made or lost between the cities.
//! - In every city they want to have on offer every morning, product by product, what the calibration of the city
//!   gives as the supply of imports, as a share of the city's output. What they order today is bought tomorrow and
//!   on offer the day after, so they order what will be missing by then: the stock to keep minus what is left of
//!   today's stock if tomorrow sells the same part of it as today did. A stall that had nothing on offer today is
//!   expected to sell all it has.
//!   An order is split over the cities of origin as if the merchants picked a seller among the firms of all other
//!   cities with the weights of a buyer of the port (`create_weighted_sampler`): a city gets the larger part the
//!   more firms of the product it has, the cheaper they are and the more they offer.
//! - A city exports the products that are ordered from it: the mix of its exports (`c_E_g`, a constant of the
//!   calibration in the port) is the mix of the orders of the day.
//!
//! The rule of the merchants (a stock to keep, filled up daily) is ours: the port has no linked economies. Travel
//! takes one day between any two cities and costs nothing. The port does not record exports product by product,
//! so what the merchants bought counts as bought in the mix they ordered (the port's own reading of `c_E_g`).
#![allow(non_snake_case)] // the fields of the port carry the names of the paper's appendix

use beforeit::AbstractModel;

use crate::Economy;
use crate::clock::DailyClock;

/// What the merchants want from a city and bring to it in one period. The cities' model type reads it in place of
/// the port's random series; it is set for the length of a period only.
#[derive(Clone, Debug, PartialEq)]
pub struct Trade {
    /// per product: goods the merchants want to buy in the city, in real units
    pub orders: Vec<f64>,
    /// per product: goods at the merchants' stall, and the price they ask
    pub supply: Vec<f64>,
    pub prices: Vec<f64>,
}

/// The port's `rotw_import_export` for a city with merchants: `C_E`, `Y_I`, `C_d_l`, `Y_m` and `P_m`. The demand for
/// exports is the sum of the orders, and the mix of the exports (`prop.c_E_g`) becomes the mix of the orders; on a
/// day without orders it stays. The budget of a foreign consumer follows from both as in the port (A.82).
#[allow(clippy::type_complexity)]
pub fn import_export(m: &mut AbstractModel<DailyClock>, t: &Trade) -> (f64, f64, Vec<f64>, Vec<f64>, Vec<f64>) {
    let C_E: f64 = t.orders.iter().sum();
    if C_E > 0.0 {
        for (share, order) in m.prop.c_E_g.iter_mut().zip(&t.orders) {
            *share = order / C_E;
        }
    }
    let (c_E_g, P_bar_g, pi_e) = (&m.prop.c_E_g, &m.agg.P_bar_g, m.agg.pi_e);
    let L = m.rotw.C_d_l.len();
    let price: f64 = (0..c_E_g.len()).map(|g| c_E_g[g] * P_bar_g[g]).sum();
    let C_d_l = vec![C_E / L as f64 * price * (1.0 + pi_e); L];
    (C_E, t.supply.iter().sum(), C_d_l, t.supply.clone(), t.prices.clone())
}

/// The books of the merchants.
#[derive(Clone, Debug, PartialEq)]
pub struct Merchants {
    /// per city and product: the goods at the stall, and what they cost
    pub stock: Vec<Vec<f64>>,
    pub value: Vec<Vec<f64>>,
    /// per city of origin, city of destination and product: goods ordered for the next period, in real units
    pub orders: Vec<Vec<Vec<f64>>>,
    /// per city: the stock to keep, as a share of the city's real output of a period
    pub share: Vec<f64>,
    /// per product: all goods ever bought and all goods ever sold, in real units
    pub bought: Vec<f64>,
    pub sold: Vec<f64>,
    /// the worth and, per product, the stock at the start
    pub start: f64,
    pub start_stock: Vec<f64>,
}

/// Cities and the merchants between them.
#[derive(Clone, Debug, PartialEq)]
pub struct Cities {
    pub cities: Vec<Economy>,
    pub merchants: Merchants,
}

/// The real output of a city in a period, as the mean of the last window.
fn output(e: &Economy) -> f64 {
    e.figures()[1] / e.model.ext.window as f64
}

/// The parts of an order of city `d` for product `g` that go to each city of origin (0 for `d` itself). The merchants
/// pick a seller as every buyer of the port does (`create_weighted_sampler`: half by price, half by what the seller
/// offers, its production plus its stock), among the firms of the product in all other cities; the part of a city
/// is the sum of the weights of its firms. So a city counts by the number of its firms and by what they offer, not
/// by what it sells: of two cities with the same prices the one twice as large gets twice the orders, and a city
/// whose sales fall keeps its part as long as its firms offer goods.
pub fn origins(cities: &[Economy], d: usize, g: usize) -> Vec<f64> {
    let of = |e: &Economy, w: &dyn Fn(usize) -> f64| -> f64 {
        let f = &e.model.firms;
        (0..f.len()).filter(|&i| f.G_i[i] == g).map(w).sum()
    };
    let cheap: Vec<f64> = cities.iter().map(|e| of(e, &|i| libm::exp(-2.0 * e.model.firms.P_i[i]))).collect();
    let size: Vec<f64> = cities.iter().map(|e| of(e, &|i| e.model.firms.Y_i[i] + e.model.firms.S_i[i])).collect();
    let others = |v: &[f64]| (0..v.len()).filter(|&c| c != d).map(|c| v[c]).sum::<f64>();
    let (cheap_sum, size_sum) = (others(&cheap), others(&size));
    if cheap_sum <= 0.0 || size_sum <= 0.0 {
        return vec![0.0; cities.len()]; // no firm of the other cities makes the product
    }
    (0..cities.len()).map(|c| if c == d { 0.0 } else { 0.5 * cheap[c] / cheap_sum + 0.5 * size[c] / size_sum }).collect()
}

impl Cities {
    /// Links economies that have not computed a period yet. At the start the merchants have in every city the
    /// supply of imports of its starting position, at the prices of the starting position, and have ordered that
    /// much again for the first period.
    pub fn new(cities: Vec<Economy>) -> Result<Cities, String> {
        if cities.len() < 2 {
            return Err(format!("{} city: trade needs two", cities.len()));
        }
        let G = cities[0].model.prop.G;
        let (plan, window) = (cities[0].model.ext.plan, cities[0].model.ext.window);
        for (c, e) in cities.iter().enumerate() {
            if e.periods() != 0 {
                return Err(format!("city {c} has computed {} periods already", e.periods()));
            }
            if e.model.prop.G != G {
                return Err(format!("city {c} has {} products, city 0 has {G}", e.model.prop.G));
            }
            if (e.model.ext.plan, e.model.ext.window) != (plan, window) {
                return Err(format!("city {c} runs on another clock than city 0"));
            }
        }
        let stock: Vec<Vec<f64>> = cities.iter().map(|e| e.model.prop.c_I_g.iter().map(|c| c * e.model.rotw.Y_I).collect()).collect();
        let value: Vec<Vec<f64>> = cities.iter().zip(&stock).map(|(e, s)| (0..G).map(|g| s[g] * e.model.agg.P_bar_g[g]).collect()).collect();
        let share = cities.iter().map(|e| e.model.rotw.Y_I / output(e)).collect();
        let start_stock = (0..G).map(|g| stock.iter().map(|s| s[g]).sum()).collect();
        let n = cities.len();
        let merchants =
            Merchants { stock, value, orders: vec![vec![vec![0.0; G]; n]; n], share, bought: vec![0.0; G], sold: vec![0.0; G], start: 0.0, start_stock };
        let mut all = Cities { cities, merchants };
        all.merchants.start = all.worth();
        all.merchants.order(&all.cities);
        Ok(all)
    }

    /// Computes `periods` periods: in each, every city computes its period with what the merchants want and bring,
    /// then the merchants settle. A city sees only what the merchants hold at the beginning of the period, so the
    /// order in which the cities compute changes nothing.
    pub fn step(&mut self, periods: usize) {
        for _ in 0..periods {
            let Cities { cities, merchants: m } = self;
            for (c, e) in cities.iter_mut().enumerate() {
                let prices = (0..m.stock[c].len())
                    .map(|g| if m.stock[c][g] > 0.0 { m.value[c][g] / m.stock[c][g] } else { e.model.agg.P_bar_g[g] })
                    .collect();
                let orders = (0..m.stock[c].len()).map(|g| m.orders[c].iter().map(|o| o[g]).sum()).collect();
                e.model.ext.trade = Some(Trade { orders, supply: m.stock[c].clone(), prices });
                e.step(1);
                e.model.ext.trade = None;
            }
            m.settle(cities);
        }
    }

    /// The worth of the merchants: their money in all cities and their stock at cost.
    pub fn worth(&self) -> f64 {
        let money: f64 = self.cities.iter().map(|e| e.model.rotw.D_RoW).sum();
        money + self.merchants.value.iter().flatten().sum::<f64>()
    }

    /// What must be 0 up to rounding, each with the amount to judge it by: the change of the merchants' worth since
    /// the start (against their stock at cost and their money in every city, whichever its sign), and per product
    /// the goods that are neither in stock nor sold (against all goods they ever had).
    pub fn checks(&self) -> Vec<[f64; 2]> {
        let m = &self.merchants;
        let money: f64 = self.cities.iter().map(|e| e.model.rotw.D_RoW.abs()).sum();
        let mut v = vec![[self.worth() - m.start, money + m.value.iter().flatten().sum::<f64>()]];
        for g in 0..m.bought.len() {
            let stock: f64 = m.stock.iter().map(|s| s[g]).sum();
            v.push([m.start_stock[g] + m.bought[g] - m.sold[g] - stock, m.start_stock[g] + m.bought[g]]);
        }
        v
    }

    /// The state as bytes (see [`crate::state`]).
    pub fn save(&self) -> Vec<u8> {
        crate::state::save_cities(self)
    }

    /// Reads the bytes of [`Cities::save`].
    pub fn load(bytes: &[u8]) -> Result<Cities, String> {
        crate::state::load_cities(bytes)
    }
}

impl Merchants {
    /// After a period of all cities: takes what was sold out of the stock, puts what was bought into the stock of
    /// the cities it was ordered for, and orders for the next period.
    fn settle(&mut self, cities: &[Economy]) {
        let n = cities.len();
        // sales: a stall sold at the mean cost of its stock, so the stock that is left keeps its cost per unit
        for (c, e) in cities.iter().enumerate() {
            let r = &e.model.rotw;
            for g in 0..r.Q_m.len() {
                let left = self.stock[c][g] - r.Q_m[g];
                self.value[c][g] = if left > 0.0 { self.value[c][g] * (left / self.stock[c][g]) } else { 0.0 };
                self.stock[c][g] = left.max(0.0);
                self.sold[g] += r.Q_m[g];
            }
        }
        // purchases: the goods (nominal exports over the mean price paid) and their cost with the duty, to the
        // cities and products they were ordered for, in the shares of the orders
        for (c, e) in cities.iter().enumerate() {
            let (r, p) = (&e.model.rotw, &e.model.prop);
            let ordered: f64 = self.orders[c].iter().flatten().sum();
            if r.C_l <= 0.0 || ordered <= 0.0 {
                continue;
            }
            let (goods, cost) = (r.C_l / r.P_l, (1.0 + p.tau_EXPORT) * r.C_l);
            for d in 0..n {
                for g in 0..self.bought.len() {
                    let part = self.orders[c][d][g] / ordered;
                    self.bought[g] += part * goods;
                    self.stock[d][g] += part * goods;
                    self.value[d][g] += part * cost;
                }
            }
        }
        self.order(cities);
    }

    /// Orders for the next period: what a stall will lack of its share of the city's output after one more period
    /// of sales, product by product. The stall is expected to sell the part of its stock that it sold in the last
    /// period, and all of it when it had nothing on offer (so also before the first period).
    fn order(&mut self, cities: &[Economy]) {
        for row in self.orders.iter_mut().flatten() {
            row.fill(0.0);
        }
        for d in 0..cities.len() {
            let (r, keep) = (&cities[d].model.rotw, self.share[d] * output(&cities[d]));
            for g in 0..self.bought.len() {
                let sells = if r.Y_m[g] > 0.0 { r.Q_m[g] / r.Y_m[g] } else { 1.0 };
                let missing = cities[d].model.prop.c_I_g[g] * keep - (1.0 - sells) * self.stock[d][g];
                if missing > 0.0 {
                    for (c, w) in origins(cities, d, g).into_iter().enumerate() {
                        self.orders[c][d][g] = w * missing;
                    }
                }
            }
        }
    }
}
