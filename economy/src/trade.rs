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
    /// per product: all goods ever bought and all goods ever sold, in real units (with routes: in the units of the
    /// stalls the goods were bought for)
    pub bought: Vec<f64>,
    pub sold: Vec<f64>,
    /// the worth and, per product, the stock at the start
    pub start: f64,
    pub start_stock: Vec<f64>,
    /// the routes between the cities (economy feature 17); `None`: every city lies a day from every other and
    /// carrying costs nothing
    pub routes: Option<Routes>,
}

/// The distance between the cities (economy feature 17): how long goods travel, what carrying them takes, and
/// what is on the way.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Routes {
    /// per city of origin and of destination: days of travel. 1: on offer the day after the purchase, as without
    /// routes. 0: no way, the two do not trade.
    pub days: Vec<Vec<usize>>,
    /// per city of origin and of destination: days of labour that carry a tonne
    pub labour: Vec<Vec<f64>>,
    /// per product: the tonnes of a real unit
    pub weight: Vec<f64>,
    /// by how much the stock the merchants keep in a city falls when the price at the stall rises against the
    /// price of the city's own firms: stock to keep = share · output · (stall / own)^(−elasticity)
    pub elasticity: f64,
    /// the days of the longest way, at least 1: the length of the ring of the goods on the way ([`Routes::longest`])
    pub horizon: usize,
    /// goods on the way and what they cost: per day of arrival, city of destination and product. The days are a
    /// ring of `horizon` days; the goods that arrive with the settling of period `t` lie at `t` modulo that length
    /// ([`Routes::slot`]).
    pub on_way: Vec<f64>,
    pub on_way_cost: Vec<f64>,
    /// per city of origin and of destination: carrying ordered for the next period, in real units of services
    pub carrying: Vec<Vec<f64>>,
    /// periods settled, and all that was ever paid for carrying
    pub period: usize,
    pub paid: f64,
    /// per city: the mean wage in money of a day at the start; per city and product: the price at the start. They
    /// fix the units of the stalls ([`Routes::unit`]).
    pub wage0: Vec<f64>,
    pub price0: Vec<Vec<f64>>,
}

impl Routes {
    /// The real units at the stall of city `d` that one real unit of product `g` bought in city `c` makes: 1 plus
    /// what carrying it cost at the start over its price at the start.
    pub fn unit(&self, c: usize, d: usize, g: usize) -> f64 {
        if self.price0[c][g] > 0.0 {
            1.0 + self.labour[c][d] * self.weight[g] * self.wage0[c] / self.price0[c][g]
        } else {
            1.0
        }
    }

    /// The days of the longest way of `days`, at least 1.
    pub fn longest(days: &[Vec<usize>]) -> usize {
        days.iter().flatten().copied().max().unwrap_or(0).max(1)
    }

    /// Where the goods of product `g` for city `d` lie that arrive with the settling of period `arrives`.
    pub fn slot(&self, arrives: usize, d: usize, g: usize) -> usize {
        ((arrives % self.horizon) * self.days.len() + d) * self.weight.len() + g
    }

    /// The goods of product `g` on the way to city `d`, and all goods of the product on the way.
    fn to(&self, d: usize, g: usize) -> f64 {
        (0..self.horizon).map(|t| self.on_way[self.slot(t, d, g)]).sum()
    }
    fn of(&self, g: usize) -> f64 {
        (0..self.days.len()).map(|d| self.to(d, g)).sum()
    }
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

/// The parts of an order of city `d` for product `g` that go to each city of origin (0 for `d` itself). The merchants
/// pick a seller as every buyer of the port does (`create_weighted_sampler`: half by price, half by what the seller
/// offers, its production plus its stock), among the firms of the product in all other cities; the part of a city
/// is the sum of the weights of its firms. So a city counts by the number of its firms and by what they offer, not
/// by what it sells: of two cities with the same prices the one twice as large gets twice the orders, and a city
/// whose sales fall keeps its part as long as its firms offer goods.
pub fn origins(cities: &[Economy], d: usize, g: usize) -> Vec<f64> {
    origins_with(cities, d, g, &vec![0.0; cities.len()])
}

/// [`origins`] with what carrying a unit from each city of origin costs added to the price of its firms; a city
/// with an infinite cost (no way) gets no part.
pub fn origins_with(cities: &[Economy], d: usize, g: usize, carry: &[f64]) -> Vec<f64> {
    Sellers::of(cities).parts(d, g, carry)
}

/// What the firms of every city offer, product by product, for the choice of the cities of origin of an order
/// ([`origins_with`]): per city and product the sum of `exp(−2 · price)` and the sum of production plus stock over
/// its firms of the product. Found once for all the orders of a period: a seller's weight with carrying,
/// `exp(−2 · (price + carry))`, is `exp(−2 · price) · exp(−2 · carry)`, and the carrying is the same for all firms of
/// a city. Before, every order of every city went through every firm of every city (550 cities, 12,000 firms: four
/// fifths of the time of a day of the economies).
pub struct Sellers {
    /// per product, then per city (product by product, so that an order reads one run of memory)
    cheap: Vec<f64>,
    size: Vec<f64>,
    n: usize,
}

impl Sellers {
    pub fn of(cities: &[Economy]) -> Sellers {
        let G = cities.first().map_or(0, |e| e.model.prop.G);
        let n = cities.len();
        let (mut cheap, mut size) = (vec![0.0; G * n], vec![0.0; G * n]);
        for (c, e) in cities.iter().enumerate() {
            let f = &e.model.firms;
            for i in 0..f.len() {
                let g = f.G_i[i];
                if g < G {
                    cheap[g * n + c] += libm::exp(-2.0 * f.P_i[i]);
                    size[g * n + c] += f.Y_i[i] + f.S_i[i];
                }
            }
        }
        Sellers { cheap, size, n }
    }

    /// The parts of an order of city `d` for product `g` that go to each city of origin, with what carrying a unit
    /// from each costs (infinite: no way, no part).
    pub fn parts(&self, d: usize, g: usize, carry: &[f64]) -> Vec<f64> {
        let mut out = Vec::new();
        self.parts_into(d, g, carry, &mut out);
        out
    }

    /// [`Sellers::parts`] into a list that is used again for every order of a period (the merchants place 550 · G
    /// orders a period: a new list for each, and three more inside, were a third of the time of their orders).
    /// The same sums in the same order, so the parts are the same to the last bit.
    pub fn parts_into(&self, d: usize, g: usize, carry: &[f64], out: &mut Vec<f64>) {
        let n = self.n;
        let (cheap, size) = (&self.cheap[g * n..(g + 1) * n], &self.size[g * n..(g + 1) * n]);
        out.clear();
        out.resize(n, 0.0);
        let (mut cheap_sum, mut size_sum) = (-0.0, -0.0); // as Iterator::sum begins
        for c in 0..n {
            if carry[c].is_finite() {
                // exp(−0) is 1 to the last bit: carrying that costs nothing (a weightless product) needs no exp
                out[c] = if carry[c] == 0.0 {
                    cheap[c]
                } else {
                    libm::exp(-2.0 * carry[c]) * cheap[c]
                };
                if c != d {
                    cheap_sum += out[c];
                    size_sum += size[c];
                }
            }
        }
        if cheap_sum <= 0.0 || size_sum <= 0.0 {
            out.fill(0.0); // no firm of the other cities makes the product
            return;
        }
        for c in 0..n {
            out[c] = if c == d {
                0.0
            } else {
                let size = if carry[c].is_finite() { size[c] } else { 0.0 };
                0.5 * out[c] / cheap_sum + 0.5 * size / size_sum
            };
        }
    }
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
                self.value[c][g] = if left > 0.0 {
                    self.value[c][g] * (left / self.stock[c][g])
                } else {
                    0.0
                };
                self.stock[c][g] = left.max(0.0);
                self.sold[g] += r.Q_m[g];
            }
        }
        // purchases: the goods (nominal exports over the mean price paid) and their cost with the duty, to the
        // cities and products they were ordered for, in the shares of the orders
        let period = self.routes.as_ref().map_or(0, |r| r.period);
        // goods that arrive today
        if let Some(rt) = &mut self.routes {
            for d in 0..n {
                for g in 0..self.bought.len() {
                    let at = rt.slot(period, d, g);
                    self.stock[d][g] += std::mem::take(&mut rt.on_way[at]);
                    self.value[d][g] += std::mem::take(&mut rt.on_way_cost[at]);
                }
            }
        }
        let mut asked = vec![0.0; self.bought.len()];
        for (c, e) in cities.iter().enumerate() {
            let (r, p) = (&e.model.rotw, &e.model.prop);
            let carrying: f64 = self.routes.as_ref().map_or(0.0, |rt| rt.carrying[c].iter().sum());
            // the orders of the city in the order of the cities and products they are for, summed as Iterator::sum
            // does (a flattening iterator over 550 lists a city was a sixth of the time of a day in WebAssembly)
            let mut ordered = -0.0;
            for o in &self.orders[c] {
                for x in o {
                    ordered += x;
                }
            }
            let ordered = ordered + carrying;
            if r.C_l <= 0.0 || ordered <= 0.0 {
                continue;
            }
            let (goods, cost) = (r.C_l / r.P_l, (1.0 + p.tau_EXPORT) * r.C_l);
            for d in 0..n {
                // what carrying to this city cost, laid on the goods bought for it by what carrying each asked for
                let carry_cost = self
                    .routes
                    .as_ref()
                    .map_or(0.0, |rt| rt.carrying[c][d] / ordered * cost);
                let lines: f64 = self.orders[c][d].iter().sum();
                // nothing ordered from this city for that one (most pairs of 550 cities): nothing to book
                if lines == 0.0 && carry_cost == 0.0 {
                    continue;
                }
                for g in 0..self.bought.len() {
                    asked[g] = self
                        .routes
                        .as_ref()
                        .map_or(0.0, |rt| self.orders[c][d][g] * rt.labour[c][d] * rt.weight[g]);
                }
                let asked_sum: f64 = asked.iter().sum();
                for g in 0..self.bought.len() {
                    let part = self.orders[c][d][g] / ordered;
                    let on = if asked_sum > 0.0 {
                        asked[g] / asked_sum
                    } else if lines > 0.0 {
                        self.orders[c][d][g] / lines
                    } else {
                        0.0
                    };
                    // in the units of the stall it is for
                    let got = part * goods * self.routes.as_ref().map_or(1.0, |rt| rt.unit(c, d, g));
                    let paid = part * cost + on * carry_cost;
                    self.bought[g] += got;
                    match &mut self.routes {
                        Some(rt) if rt.days[c][d] > 1 => {
                            let at = rt.slot(period + rt.days[c][d] - 1, d, g);
                            rt.on_way[at] += got;
                            rt.on_way_cost[at] += paid;
                        }
                        _ => {
                            self.stock[d][g] += got;
                            self.value[d][g] += paid;
                        }
                    }
                }
                if let Some(rt) = &mut self.routes {
                    // carrying is only ever ordered with goods
                    assert!(
                        lines > 0.0 || carry_cost == 0.0,
                        "carrying from city {c} to city {d} without goods"
                    );
                    rt.paid += carry_cost;
                }
            }
        }
        if let Some(rt) = &mut self.routes {
            rt.period += 1;
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
        if let Some(rt) = &mut self.routes {
            for row in rt.carrying.iter_mut() {
                row.fill(0.0);
            }
        }
        let G = self.bought.len();
        let wages: Vec<f64> = if self.routes.is_some() {
            cities.iter().map(wage).collect()
        } else {
            Vec::new()
        };
        let sellers = Sellers::of(cities);
        let n = cities.len();
        // Read once a period what every order reads of every city of origin. The books hold per city of origin a
        // list of the cities of destination, so the column of one city of destination lies across n lists: read
        // for every order and every product, those were n cache misses each (550 · 3 orders, 550 cities).
        let last_price: Vec<f64> = cities.iter().map(|e| e.model.agg.P_bar_g[G - 1]).collect();
        // the goods on the way to every city and product, the days in the order of the ring as Routes::to sums them
        let way: Vec<f64> = match &self.routes {
            Some(rt) => {
                let mut way = vec![-0.0; n * G];
                for t in 0..rt.horizon {
                    for (sum, x) in way
                        .iter_mut()
                        .zip(&rt.on_way[rt.slot(t, 0, 0)..rt.slot(t, 0, 0) + n * G])
                    {
                        *sum += x;
                    }
                }
                way
            }
            None => Vec::new(),
        };
        // the lists of an order, used again for every order of the period: carrying, parts, the column of the
        // routes to the city of destination, and its orders and carrying before they go into the books
        let (mut carry, mut parts) = (vec![0.0; n], Vec::with_capacity(n));
        let (mut days, mut labour) = (vec![0usize; n], vec![0.0; n]);
        let (mut ordered, mut carried) = (vec![0.0; n * G], vec![0.0; n]);
        for d in 0..n {
            let (r, keep) = (&cities[d].model.rotw, self.share[d] * output(&cities[d]));
            if let Some(rt) = &self.routes {
                for c in 0..n {
                    days[c] = rt.days[c][d];
                    labour[c] = rt.labour[c][d];
                }
            }
            ordered.fill(0.0);
            carried.fill(0.0);
            for g in 0..G {
                let sells = if r.Y_m[g] > 0.0 { r.Q_m[g] / r.Y_m[g] } else { 1.0 };
                // what carrying a unit from each city costs in money there (infinite: no way), and the parts of the order
                match &self.routes {
                    Some(rt) => {
                        for c in 0..n {
                            carry[c] = if days[c] == 0 {
                                f64::INFINITY
                            } else {
                                labour[c] * rt.weight[g] * wages[c]
                            };
                        }
                    }
                    None => carry.fill(0.0),
                }
                sellers.parts_into(d, g, &carry, &mut parts);
                // goods on the way count as stock; the stall also needs what it sells while an order travels
                let (on_way, lead) = match &self.routes {
                    Some(_) => {
                        let mut lead = -0.0;
                        for c in 0..n {
                            lead += parts[c] * (days[c].max(1) - 1) as f64;
                        }
                        (way[d * G + g], lead)
                    }
                    None => (0.0, 0.0),
                };
                let target = match &self.routes {
                    Some(rt) => {
                        // the stock to keep falls with the price at the stall against that of the city's own firms
                        let (stall, own) = (
                            if self.stock[d][g] > 0.0 {
                                self.value[d][g] / self.stock[d][g]
                            } else {
                                0.0
                            },
                            cities[d].model.agg.P_bar_g[g],
                        );
                        let rel = if stall > 0.0 && own > 0.0 { stall / own } else { 1.0 };
                        cities[d].model.prop.c_I_g[g] * keep * libm::pow(rel, -rt.elasticity)
                    }
                    None => cities[d].model.prop.c_I_g[g] * keep,
                };
                let missing = target * (1.0 + lead * sells) - (1.0 - sells) * self.stock[d][g] - on_way;
                if missing > 0.0 {
                    for (c, &w) in parts.iter().enumerate() {
                        // what is missing at the stall, in the units of the city of origin (Routes::unit)
                        let unit = match &self.routes {
                            Some(rt) if rt.price0[c][g] > 0.0 => {
                                1.0 + labour[c] * rt.weight[g] * rt.wage0[c] / rt.price0[c][g]
                            }
                            _ => 1.0,
                        };
                        let order = w * missing / unit;
                        ordered[c * G + g] = order;
                        if self.routes.is_some() {
                            let price = last_price[c];
                            if w > 0.0 && price > 0.0 {
                                carried[c] += order * carry[c] / price;
                            }
                        }
                    }
                }
            }
            for c in 0..n {
                self.orders[c][d].copy_from_slice(&ordered[c * G..(c + 1) * G]);
            }
            if let Some(rt) = &mut self.routes {
                for c in 0..n {
                    rt.carrying[c][d] = carried[c];
                }
            }
        }
    }
}
