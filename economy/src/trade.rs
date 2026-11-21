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
//! The rule of the merchants (a stock to keep, filled up daily) is ours: the port has no linked economies. Without
//! routes, travel takes one day between any two cities and costs nothing.
//!
//! With routes ([`Routes`], economy feature 17) there is distance between the cities:
//!
//! - Goods bought in a city for another lie at the stall there after the days of travel of the way, not the next
//!   day. Goods on the way are the merchants' and count at cost.
//! - Carrying is labour: every real unit of a product takes so many days of labour on a way. The merchants buy
//!   that labour as services in the city of origin on the day they buy the goods, at the price services have
//!   there, and lay it on the cost of the goods. So carrying is income of the city of origin, and the price at
//!   the stall is purchase plus carrying. For the choice of the origin the merchants reckon a day of labour at
//!   the mean wage of the city of origin.
//! - The stock to keep falls with the price at the stall against the price of the city's own firms, with the
//!   elasticity of the routes, and the merchants order ahead for the days an order travels.
//! - Two cities without a way between them (0 days) do not trade.
//! - At the start the merchants have on the way to every stall what it sells in a day, for every day an order
//!   travels: the position of merchants who have ordered day by day before the first day too.
//! - A real unit at a stall is what cost one unit of money at the start, carrying included: the calibration's
//!   price of an imported good is its price at the stall, and "real" is at the prices of the starting position
//!   everywhere in the model. So a unit bought in the city of origin lies at the stall as `1 + carrying / price`
//!   units ([`Routes::unit`], with the wage and the price of the origin at the start), and the stall begins at
//!   the calibration's price. When wages, prices or the origins change afterwards, the price at the stall moves.
//!   Without that, the starting position would be one of trade without cost, and the first goods to arrive
//!   would raise every price that has imports in it.
//!
//! The port does not record exports product by product,
//! so what the merchants bought counts as bought in the mix they ordered (the port's own reading of `c_E_g`).
#![allow(non_snake_case)] // the fields of the port carry the names of the paper's appendix

mod merchants;
mod routes;
mod sellers;

use beforeit::AbstractModel;

use crate::Economy;
use crate::clock::DailyClock;

pub use merchants::Merchants;
pub use routes::Routes;
use sellers::Sellers;
pub use sellers::origins;

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

/// The mean wage in money of a day in a city (a firm's wage weighted by its employees): the wage in money of the
/// clock, or the port's real base wage times the consumer price level.
fn wage(e: &Economy) -> f64 {
    let (f, w) = (&e.model.firms, &e.model.ext.wage);
    let n: f64 = (0..f.len()).map(|i| f.N_i[i] as f64).sum();
    if n <= 0.0 {
        return 0.0;
    }
    // the port's base wage: what a firm pays is set in its first period only
    let paid = |i: usize| {
        if w.len() == f.len() {
            w[i]
        } else {
            f.w_bar_i[i] * e.model.agg.P_bar_HH
        }
    };
    (0..f.len()).map(|i| paid(i) * f.N_i[i] as f64).sum::<f64>() / n
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
            if e.model.ext.pays_in_money() != cities[0].model.ext.pays_in_money() {
                return Err(format!("city {c} pays wages in another way than city 0"));
            }
            if e.model.ext.demand_pull != cities[0].model.ext.demand_pull {
                return Err(format!("city {c} sets prices in another way than city 0"));
            }
        }
        let stock: Vec<Vec<f64>> = cities
            .iter()
            .map(|e| e.model.prop.c_I_g.iter().map(|c| c * e.model.rotw.Y_I).collect())
            .collect();
        let value: Vec<Vec<f64>> = cities
            .iter()
            .zip(&stock)
            .map(|(e, s)| (0..G).map(|g| s[g] * e.model.agg.P_bar_g[g]).collect())
            .collect();
        let share = cities.iter().map(|e| e.model.rotw.Y_I / output(e)).collect();
        let start_stock = (0..G).map(|g| stock.iter().map(|s| s[g]).sum()).collect();
        let n = cities.len();
        let merchants = Merchants {
            stock,
            value,
            orders: vec![vec![vec![0.0; G]; n]; n],
            share,
            bought: vec![0.0; G],
            sold: vec![0.0; G],
            start: 0.0,
            start_stock,
            routes: None,
        };
        let mut all = Cities { cities, merchants };
        all.merchants.start = all.worth();
        all.merchants.order(&all.cities);
        Ok(all)
    }

    /// The same cities with distance between them (economy feature 17, [`Routes`]): per city of origin and of
    /// destination the days of travel (0: no way) and the days of labour that carry a tonne; per product the tonnes
    /// of a real unit; and the elasticity of the stock to keep. The cities have not computed a period yet; the
    /// merchants order anew.
    pub fn with_routes(
        mut self,
        days: Vec<Vec<usize>>,
        labour: Vec<Vec<f64>>,
        weight: Vec<f64>,
        elasticity: f64,
    ) -> Result<Cities, String> {
        let (n, G) = (self.cities.len(), self.merchants.bought.len());
        if self.cities.iter().any(|e| e.periods() != 0) || self.merchants.routes.is_some() {
            return Err("routes are given to cities that have not computed a period and have none".into());
        }
        if days.len() != n
            || days.iter().any(|d| d.len() != n)
            || labour.len() != n
            || labour.iter().any(|l| l.len() != n)
            || weight.len() != G
        {
            return Err(format!("the routes do not fit {n} cities with {G} products"));
        }
        if labour
            .iter()
            .flatten()
            .chain(&weight)
            .any(|l| !(l.is_finite() && *l >= 0.0))
        {
            return Err("the labour of carrying and the weight of the goods are numbers, 0 or more".into());
        }
        if !(elasticity.is_finite() && elasticity >= 0.0) {
            return Err(format!("an elasticity of {elasticity} of the stock to keep: 0 or more"));
        }
        let horizon = Routes::longest(&days);
        let on_way = vec![0.0; horizon * n * G];
        let mut rt = Routes {
            days,
            labour,
            weight,
            elasticity,
            horizon,
            on_way_cost: on_way.clone(),
            on_way,
            carrying: vec![vec![0.0; n]; n],
            period: 0,
            paid: 0.0,
            wage0: Vec::new(),
            price0: Vec::new(),
        };
        // The starting position: the merchants have ordered every day before the first as they do from now on, so
        // what a stall sells in a day is on the way to it for every day an order travels, from each city of origin
        // in its part of the order, at the price the stall's goods have. Without that the first order would be
        // for all those days at once, and small cities would be bought empty on the first day.
        let m = &mut self.merchants;
        let wages: Vec<f64> = self.cities.iter().map(wage).collect();
        rt.wage0 = wages.clone();
        rt.price0 = self.cities.iter().map(|e| e.model.agg.P_bar_g[..G].to_vec()).collect();
        let sellers = Sellers::of(&self.cities);
        for d in 0..n {
            let keep = m.share[d] * output(&self.cities[d]);
            for g in 0..G {
                let daily = self.cities[d].model.prop.c_I_g[g] * keep;
                let price = if m.stock[d][g] > 0.0 {
                    m.value[d][g] / m.stock[d][g]
                } else {
                    self.cities[d].model.agg.P_bar_g[g]
                };
                let carry: Vec<f64> = (0..n)
                    .map(|c| {
                        if rt.days[c][d] == 0 {
                            f64::INFINITY
                        } else {
                            rt.labour[c][d] * rt.weight[g] * wages[c]
                        }
                    })
                    .collect();
                for (c, part) in sellers.parts(d, g, &carry).into_iter().enumerate() {
                    // bought on the day j before the first, the goods arrive with the settling of period days − 1 − j
                    for arrives in 0..rt.days[c][d].saturating_sub(1) {
                        let at = rt.slot(arrives, d, g);
                        rt.on_way[at] += part * daily;
                        rt.on_way_cost[at] += part * daily * price;
                    }
                }
                m.start_stock[g] += rt.to(d, g);
            }
        }
        m.routes = Some(rt);
        self.merchants.start = self.worth();
        self.merchants.order(&self.cities);
        Ok(self)
    }

    /// Computes `periods` periods: in each, every city computes its period with what the merchants want and bring,
    /// then the merchants settle. A city sees only what the merchants hold at the beginning of the period, so the
    /// order in which the cities compute changes nothing.
    pub fn step(&mut self, periods: usize) {
        for _ in 0..periods {
            let Cities { cities, merchants: m } = self;
            for (c, e) in cities.iter_mut().enumerate() {
                let prices = (0..m.stock[c].len())
                    .map(|g| {
                        if m.stock[c][g] > 0.0 {
                            m.value[c][g] / m.stock[c][g]
                        } else {
                            e.model.agg.P_bar_g[g]
                        }
                    })
                    .collect();
                // all products in one pass over the cities it ordered for, each summed in the order of the cities
                let mut orders = vec![-0.0; m.stock[c].len()]; // as Iterator::sum begins
                for o in &m.orders[c] {
                    for (sum, x) in orders.iter_mut().zip(o) {
                        *sum += x;
                    }
                }
                if let Some(r) = &m.routes {
                    *orders.last_mut().unwrap() += r.carrying[c].iter().sum::<f64>();
                }
                e.model.ext.trade = Some(Trade {
                    orders,
                    supply: m.stock[c].clone(),
                    prices,
                });
                e.step(1);
                e.model.ext.trade = None;
            }
            m.settle(cities);
        }
    }

    /// The worth of the merchants: their money in all cities and their stock at cost.
    pub fn worth(&self) -> f64 {
        let money: f64 = self.cities.iter().map(|e| e.model.rotw.D_RoW).sum();
        money
            + self.merchants.value.iter().flatten().sum::<f64>()
            + self
                .merchants
                .routes
                .as_ref()
                .map_or(0.0, |r| r.on_way_cost.iter().sum::<f64>())
    }

    /// What must be 0 up to rounding, each with the amount to judge it by: the change of the merchants' worth since
    /// the start (against their stock at cost and their money in every city, whichever its sign), and per product
    /// the goods that are neither in stock nor sold (against all goods they ever had).
    pub fn checks(&self) -> Vec<[f64; 2]> {
        let m = &self.merchants;
        let money: f64 = self.cities.iter().map(|e| e.model.rotw.D_RoW.abs()).sum();
        let mut v = vec![[self.worth() - m.start, money + m.value.iter().flatten().sum::<f64>()]];
        for g in 0..m.bought.len() {
            let stock: f64 = m.stock.iter().map(|s| s[g]).sum::<f64>() + m.routes.as_ref().map_or(0.0, |r| r.of(g));
            v.push([
                m.start_stock[g] + m.bought[g] - m.sold[g] - stock,
                m.start_stock[g] + m.bought[g],
            ]);
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
