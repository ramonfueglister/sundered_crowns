//! The routes between the cities that trade (economy feature 17).

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
    pub(super) fn to(&self, d: usize, g: usize) -> f64 {
        (0..self.horizon).map(|t| self.on_way[self.slot(t, d, g)]).sum()
    }
    pub(super) fn of(&self, g: usize) -> f64 {
        (0..self.days.len()).map(|d| self.to(d, g)).sum()
    }
}
