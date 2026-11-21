//! The books of the merchants, and how they settle and order after every period of all cities.

use super::{Routes, Sellers, output, wage};
use crate::Economy;

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

impl Merchants {
    /// After a period of all cities: takes what was sold out of the stock, puts what was bought into the stock of
    /// the cities it was ordered for, and orders for the next period.
    pub(super) fn settle(&mut self, cities: &[Economy]) {
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
    pub(super) fn order(&mut self, cities: &[Economy]) {
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
