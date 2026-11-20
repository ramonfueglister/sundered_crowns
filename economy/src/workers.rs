//! The workers of an economy as the game gives them (docs/ECONOMY_DESIGN.md): the workers who are away (economy
//! feature 22, sickness and childbed in the game) and the contract of every worker with the workers without work who
//! stand in for those who are away (economy feature 23).
//!
//! The contracts (people feature 10 in the game, `contracts` in src/sim/systems/economy.ts). A worker serves by the
//! year, as the famuli of the demesnes did "most commonly for the whole agricultural year" (Claridge, Delabastita and
//! Gibbs 2024, (In-kind) Wages and labour relations in the Middle Ages, working paper, p. 13), or works by the day.
//! Both are paid the port's wage of their firm (A.26), the servant in every period, worked or not, as in the port
//! (economy feature 19, rule 6; feature 22). The day labourer is paid for the periods he works only: the wage times the
//! factor of his firm's day ([`crate::clock::Attendance`]), nothing on a day of rest or on a day he is away. Over a
//! year without days away that is the servant's pay: day labourers worked as many days as it took to earn the annual
//! servant's pay (Humphries and Weisdorf 2019, Unreal wages?, Economic Journal 129, p. 6 of the accepted manuscript). A
//! household plans its spending on the wage of its contract per mean day, as the port plans on the wage of the period
//! (A.46 on A.53 expected); what it is paid in a period goes to its deposits.
//!
//! The stand-ins. On a day on which workers of a firm that works are away, the firm takes for every one of them a
//! worker without work of its economy who is not away himself, for that day, and pays him as a day labourer. Sick
//! tenants found "a family member or even a hired laborer" to take their place, and at Battle Abbey in 1420/21 "in
//! the absence of the ploughman who was sick for 84 days, a man was hired to drive the wagon and plough" (Owen, Brown
//! and Skinner 2025, Sick leave of customary tenants in late medieval England, Journal of British Studies 64, e92,
//! pp. 5 and 7). OWN RULE: every place of the day is filled while a worker without work is there; the sources show
//! the practice, not how often (the same paper finds "little evidence" of one man hired for another at Ramsey,
//! p. 7). The stand-ins are chosen by the port's rule for vacancies (A.1.1, `search_and_matching_labour` in
//! src/markets.rs of the port): the workers without work in random order, one to each firm with places open, the
//! firms in random order, round after round. A stand-in stays without an employer in the port's books.
//!
//! Without contracts the economy computes as before, number for number: they are given together, and absences
//! without contracts are economy feature 22 alone.

use beforeit::{AbstractModel, Randomness};

use crate::clock::DailyClock;
use crate::{Economy, trade};

/// The workers who are away (people feature 9, economy feature 22: sickness and childbed): per absence the worker,
/// in the port's order of the workers, and the first and the last period (counted from 1) of the run of days on which
/// that worker is away. On such a day the worker's firm works with the workers who are there; the worker keeps the
/// place and the wage. Empty: everybody is there, as in the port.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct Absences {
    pub worker: Vec<u32>,
    pub first: Vec<u32>,
    pub last: Vec<u32>,
}

impl Absences {
    /// Absences of `workers` workers: per absence the worker and the first and last period. Each worker is one of
    /// them, and no run of days ends before it begins.
    pub fn new(workers: usize, worker: Vec<u32>, first: Vec<u32>, last: Vec<u32>) -> Result<Absences, String> {
        if first.len() != worker.len() || last.len() != worker.len() {
            return Err(format!(
                "absences of {} workers with {} first and {} last days",
                worker.len(),
                first.len(),
                last.len()
            ));
        }
        if let Some(h) = worker.iter().find(|&&h| h as usize >= workers) {
            return Err(format!("an absence of the worker {h} of {workers}"));
        }
        if let Some(k) = (0..worker.len()).find(|&k| first[k] == 0 || last[k] < first[k]) {
            return Err(format!("an absence from period {} to {}", first[k], last[k]));
        }
        Ok(Absences { worker, first, last })
    }

    /// Whether nobody is away.
    pub fn is_empty(&self) -> bool {
        self.worker.is_empty()
    }

    /// Per worker of `workers` whether he is away in period `t`.
    pub fn of_workers(&self, workers: usize, t: usize) -> Vec<bool> {
        let mut away = vec![false; workers];
        for k in 0..self.worker.len() {
            if (self.first[k] as usize..=self.last[k] as usize).contains(&t) {
                away[self.worker[k] as usize] = true;
            }
        }
        away
    }

    /// Per firm the workers it employs who are away in period `t`: `employer` is the firm of every worker (the
    /// port's `O_h`), `index` the position of a firm by its id.
    pub fn of_firms(
        &self,
        firms: usize,
        employer: &[Option<usize>],
        index: impl Fn(usize) -> usize,
        t: usize,
    ) -> Vec<u32> {
        let mut away = vec![0; firms];
        for k in 0..self.worker.len() {
            if !(self.first[k] as usize..=self.last[k] as usize).contains(&t) {
                continue;
            }
            if let Some(id) = employer[self.worker[k] as usize] {
                away[index(id)] += 1;
            }
        }
        away
    }
}

/// The contract of a worker who serves by the year ([`DailyClock::contracts`]).
pub const BY_THE_YEAR: u8 = 0;
/// The contract of a worker who works by the day.
pub const BY_THE_DAY: u8 = 1;

/// A pay of the period that is not the port's: the worker, the firm whose wage it is, and how much more than the
/// port's pay of the period, in units of that wage.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pay {
    pub worker: usize,
    pub firm: usize,
    pub more: f64,
}

/// What the contracts and the absences make of the period that is being computed: set after the port's labour market
/// and read by the production and the books of the same period, so it is not part of the state.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Today {
    /// per firm the workers without work who stand in for its workers who are away (empty: none)
    pub stand_ins: Vec<u32>,
    /// the pays of the period that are not the port's
    pub pays: Vec<Pay>,
    /// per firm what it pays more than the port in the period, in units of its wage (empty: nothing)
    pub more: Vec<f64>,
    /// the workers away from firms that work in the period, and the stand-ins: to measure, read by no rule
    pub away: u32,
    pub stood_in: u32,
}

/// The period of `m` that is being computed, after the port's labour market: who stands in for whom and who is paid
/// what (see the module). Empty without contracts.
pub fn today<R: Randomness + ?Sized>(m: &AbstractModel<DailyClock>, rng: &mut R) -> Today {
    let c = &m.ext;
    if c.contracts.is_empty() {
        return Today::default();
    }
    let (f, w) = (&m.firms, &m.w_act);
    let t = c.periods_computed(m.agg.t) + 1;
    let gone = c.absences.of_workers(w.len(), t);
    let mut open = vec![0u32; f.len()];
    let mut pays = Vec::new();
    for h in 0..w.len() {
        let Some(id) = w.O_h[h] else { continue };
        let i = f.index(id);
        let a = c.attendance.factor(i, t);
        if gone[h] && a > 0.0 {
            open[i] += 1;
        }
        if c.contracts[h] == BY_THE_DAY {
            let paid = if gone[h] { 0.0 } else { a };
            if paid != 1.0 {
                pays.push(Pay {
                    worker: h,
                    firm: i,
                    more: paid - 1.0,
                });
            }
        }
    }
    let away = open.iter().sum();
    let mut stand_ins = Vec::new();
    let mut firms: Vec<usize> = (0..f.len()).filter(|&i| open[i] > 0).collect();
    if !firms.is_empty() {
        stand_ins = vec![0u32; f.len()];
        let mut idle: Vec<usize> = (0..w.len()).filter(|&h| w.O_h[h].is_none() && !gone[h]).collect();
        rng.shuffle(&mut idle);
        let mut next = 0;
        while next < idle.len() && !firms.is_empty() {
            rng.shuffle(&mut firms);
            for &i in &firms {
                pays.push(Pay {
                    worker: idle[next],
                    firm: i,
                    more: c.attendance.factor(i, t),
                });
                stand_ins[i] += 1;
                open[i] -= 1;
                next += 1;
                if next == idle.len() {
                    break;
                }
            }
            firms.retain(|&i| open[i] > 0);
        }
    }
    let mut more = Vec::new();
    if !pays.is_empty() {
        more = vec![0.0; f.len()];
        for p in &pays {
            more[p.firm] += p.more;
        }
    }
    let stood_in = stand_ins.iter().sum();
    Today {
        stand_ins,
        pays,
        more,
        away,
        stood_in,
    }
}

/// Per firm what it pays more than the port in the period, in money with the employer's contributions, as the port
/// books its wages (A.30: `(1 + tau_SIF) w_i N_i P_bar_HH`). Empty: nothing.
pub fn wages_more(m: &AbstractModel<DailyClock>) -> Vec<f64> {
    let (f, k) = (&m.firms, (1.0 + m.prop.tau_SIF) * m.agg.P_bar_HH);
    m.ext
        .today
        .more
        .iter()
        .enumerate()
        .map(|(i, x)| k * f.w_i[i] * x)
        .collect()
}

/// Adds to the realised incomes `y` of the workers (A.53) what they are paid more than the port's pay, net of the
/// taxes on wages as there.
pub fn add_pays(m: &AbstractModel<DailyClock>, y: &mut [f64]) {
    let p = &m.prop;
    let net = (1.0 - p.tau_SIW - p.tau_INC * (1.0 - p.tau_SIW)) * m.agg.P_bar_HH;
    for x in &m.ext.today.pays {
        y[x.worker] += x.more * m.firms.w_i[x.firm] * net;
    }
}

/// The taxes and contributions on what the workers are paid more than the port's pay (A.59, as on wages there).
pub fn taxes_on_pays(m: &AbstractModel<DailyClock>) -> f64 {
    let p = &m.prop;
    let rate = p.tau_SIF + p.tau_SIW + p.tau_INC * (1.0 - p.tau_SIW);
    let paid: f64 = m
        .ext
        .today
        .more
        .iter()
        .enumerate()
        .map(|(i, x)| m.firms.w_i[i] * x)
        .sum();
    rate * paid * m.agg.P_bar_HH
}

impl Economy {
    /// The same economy with the workers who are away from its next period on (economy feature 22, [`Absences`]):
    /// per absence the worker, in the port's order of the workers, and the first and the last day of the absence,
    /// counted from 0 for the next period. They take the place of the absences it had.
    pub fn with_absences(mut self, worker: Vec<u32>, first: Vec<u32>, last: Vec<u32>) -> Result<Economy, String> {
        let next = self.periods() + 1;
        let periods = |days: Vec<u32>| -> Result<Vec<u32>, String> {
            days.into_iter()
                .map(|d| u32::try_from(next + d as usize).map_err(|_| format!("an absence on the day {d}")))
                .collect()
        };
        let (first, last) = (periods(first)?, periods(last)?);
        self.model.ext.absences = Absences::new(self.model.w_act.len(), worker, first, last)?;
        Ok(self)
    }

    /// The same economy with contracts (economy feature 23): the workers who work by the day, in the port's order of
    /// the workers; every other worker serves by the year. They take the place of the contracts it had.
    pub fn with_contracts(mut self, by_the_day: &[u32]) -> Result<Economy, String> {
        let workers = self.model.w_act.len();
        let mut contracts = vec![BY_THE_YEAR; workers];
        for &h in by_the_day {
            let at = contracts
                .get_mut(h as usize)
                .ok_or_else(|| format!("a contract of the worker {h} of {workers}"))?;
            *at = BY_THE_DAY;
        }
        self.model.ext.contracts = contracts;
        Ok(self)
    }
}

/// Reads the next 32-bit number of `r`, of the list `what`.
fn next_u32(r: &mut &[u8], what: &str) -> Result<u32, String> {
    if r.len() < 4 {
        return Err(format!("the {what} end after {} more bytes, 4 were read", r.len()));
    }
    let (head, rest) = r.split_at(4);
    *r = rest;
    Ok(u32::from_le_bytes([head[0], head[1], head[2], head[3]]))
}

/// The cities with the workers who are away (economy feature 22) as bytes: per city the number of its absences (32
/// bits), then per absence the worker, the first and the last day, counted from 0 for the next period (32 bits each,
/// [`Economy::with_absences`]).
pub fn absences(all: &mut trade::Cities, mut r: &[u8]) -> Result<(), String> {
    let mut cities = Vec::with_capacity(all.cities.len());
    for (c, e) in std::mem::take(&mut all.cities).into_iter().enumerate() {
        let n = next_u32(&mut r, "absences")? as usize;
        let (mut worker, mut first, mut last) = (Vec::new(), Vec::new(), Vec::new());
        for _ in 0..n {
            worker.push(next_u32(&mut r, "absences")?);
            first.push(next_u32(&mut r, "absences")?);
            last.push(next_u32(&mut r, "absences")?);
        }
        cities.push(
            e.with_absences(worker, first, last)
                .map_err(|e| format!("city {c}: {e}"))?,
        );
    }
    if !r.is_empty() {
        return Err(format!("{} bytes of absences are left over after the cities", r.len()));
    }
    all.cities = cities;
    Ok(())
}

/// The cities with their contracts (economy feature 23) as bytes: per city the number of its workers who work by the
/// day (32 bits), then each of them (32 bits, [`Economy::with_contracts`]).
pub fn contracts(all: &mut trade::Cities, mut r: &[u8]) -> Result<(), String> {
    let mut cities = Vec::with_capacity(all.cities.len());
    for (c, e) in std::mem::take(&mut all.cities).into_iter().enumerate() {
        let n = next_u32(&mut r, "contracts")? as usize;
        let by_the_day = (0..n)
            .map(|_| next_u32(&mut r, "contracts"))
            .collect::<Result<Vec<u32>, String>>()?;
        cities.push(e.with_contracts(&by_the_day).map_err(|e| format!("city {c}: {e}"))?);
    }
    if !r.is_empty() {
        return Err(format!("{} bytes of contracts are left over after the cities", r.len()));
    }
    all.cities = cities;
    Ok(())
}
