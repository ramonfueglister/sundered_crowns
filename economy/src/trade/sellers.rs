//! The cities of origin of an order: what the firms of every city offer, and the part of an order each city gets.

use crate::Economy;

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
fn origins_with(cities: &[Economy], d: usize, g: usize, carry: &[f64]) -> Vec<f64> {
    Sellers::of(cities).parts(d, g, carry)
}

/// What the firms of every city offer, product by product, for the choice of the cities of origin of an order
/// ([`origins_with`]): per city and product the sum of `exp(−2 · price)` and the sum of production plus stock over
/// its firms of the product. Found once for all the orders of a period: a seller's weight with carrying,
/// `exp(−2 · (price + carry))`, is `exp(−2 · price) · exp(−2 · carry)`, and the carrying is the same for all firms of
/// a city. Before, every order of every city went through every firm of every city (550 cities, 12,000 firms: four
/// fifths of the time of a day of the economies).
pub(super) struct Sellers {
    /// per product, then per city (product by product, so that an order reads one run of memory)
    cheap: Vec<f64>,
    size: Vec<f64>,
    n: usize,
}

impl Sellers {
    pub(super) fn of(cities: &[Economy]) -> Sellers {
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
    pub(super) fn parts(&self, d: usize, g: usize, carry: &[f64]) -> Vec<f64> {
        let mut out = Vec::new();
        self.parts_into(d, g, carry, &mut out);
        out
    }

    /// [`Sellers::parts`] into a list that is used again for every order of a period (the merchants place 550 · G
    /// orders a period: a new list for each, and three more inside, were a third of the time of their orders).
    /// The same sums in the same order, so the parts are the same to the last bit.
    pub(super) fn parts_into(&self, d: usize, g: usize, carry: &[f64], out: &mut Vec<f64>) {
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
