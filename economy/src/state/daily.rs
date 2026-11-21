//! The fields of the daily clock as bytes and back ([`crate::clock`]), the last part of a state.

use crate::clock::{Attendance, DailyClock, OWNER_PLANS, OwnerProfit};
use crate::past::{Past, Phase, Series};
use crate::workers::{Absences, BY_THE_DAY, Today};

use super::bytes::{In, Out, Res};

pub(super) fn put_clock(o: &mut Out, c: &DailyClock) {
    // `trade` is set for the length of a period only (src/trade.rs): a saved economy has none
    let DailyClock {
        plan,
        window,
        demand,
        periods,
        worked,
        start,
        accounts,
        wage,
        real_wage,
        demand_pull,
        savings,
        norm,
        crown_revenue,
        crown_outlays,
        owner,
        borne: _,
        past,
        trade: _,
        attendance,
        owner_profit,
        absences,
        lost: _,
        unused,
        contracts,
        today: _,
    } = c;
    o.n(*plan);
    o.n(*window);
    o.f64s(demand);
    o.n(periods.len());
    for &x in periods {
        o.u32(x);
    }
    o.f64(start[0]);
    o.f64(start[1]);
    o.f64s(wage);
    o.f64s(real_wage);
    o.bool(*demand_pull);
    o.n(accounts.len());
    for row in accounts {
        for &x in row {
            o.f64(x);
        }
    }
    o.bool(past.is_some());
    if let Some(Past { periods, Y, pi }) = past {
        o.n(*periods);
        for Series {
            log,
            origin,
            history,
            early,
            days,
            sum,
            phases,
        } in [Y, pi]
        {
            o.bool(*log);
            o.f64(*origin);
            o.n(*history);
            o.f64(early[0]);
            o.f64(early[1]);
            o.f64s(days);
            o.f64(*sum);
            for &Phase { last, x, xx, xy } in phases {
                for v in [last, x, xx, xy] {
                    o.f64(v);
                }
            }
        }
    }
    o.f64(*savings);
    o.f64(*norm);
    o.bool(*crown_revenue);
    o.f64(*crown_outlays);
    o.bool(*owner);
    let Attendance {
        from,
        days,
        kinds,
        factor,
        day,
        calendar,
        household,
    } = attendance;
    o.n(*from);
    o.n(*days);
    o.n(*kinds);
    o.f64s(factor);
    o.bytes(day);
    o.bytes(calendar);
    o.bytes(household);
    o.f64s(worked);
    let OwnerProfit {
        ended,
        ended_periods,
        open,
        open_periods,
        ends,
    } = owner_profit;
    o.f64s(ended);
    o.f64s(ended_periods);
    o.f64s(open);
    o.f64s(open_periods);
    o.n(ends.len());
    for &x in ends {
        o.u32(x);
    }
    let Absences {
        worker,
        first,
        last,
        family,
    } = absences;
    o.n(worker.len());
    for k in 0..worker.len() {
        o.u32(worker[k]);
        o.u32(first[k]);
        o.u32(last[k]);
        o.bool(family[k]);
    }
    o.f64s(unused);
    o.bytes(contracts);
}

fn get_series(i: &mut In, window: usize) -> Res<Series> {
    let (log, origin, history, early, days, sum) =
        (i.bool()?, i.f64()?, i.n()?, [i.f64()?, i.f64()?], i.f64s()?, i.f64()?);
    if days.len() != window || history < 2 {
        return Err(format!(
            "a past of {} periods with {history} entries of history and windows of {window} periods",
            days.len()
        ));
    }
    let mut phases = Vec::with_capacity(window);
    for _ in 0..window {
        phases.push(Phase {
            last: i.f64()?,
            x: i.f64()?,
            xx: i.f64()?,
            xy: i.f64()?,
        });
    }
    Ok(Series {
        log,
        origin,
        history,
        early,
        days,
        sum,
        phases,
    })
}

pub(super) fn get_clock(i: &mut In, format: u32) -> Res<DailyClock> {
    let (plan, window) = (i.n()?, i.n()?);
    if plan == 0 || window == 0 {
        return Err(format!(
            "a clock with a plan every {plan} periods and windows of {window} periods"
        ));
    }
    let demand = i.f64s()?;
    let n = i.len(4)?;
    let mut periods = Vec::with_capacity(n);
    for _ in 0..n {
        periods.push(i.u32()?);
    }
    let start = [i.f64()?, i.f64()?];
    let (wage, real_wage) = (i.f64s()?, i.f64s()?);
    if wage.len() != real_wage.len() || (!wage.is_empty() && wage.len() != demand.len()) {
        return Err(format!(
            "a clock with wages in money of {} firms, real wages of {} and {} firms",
            wage.len(),
            real_wage.len(),
            demand.len()
        ));
    }
    let demand_pull = i.bool()?;
    // format 4 has no rows of the clock: `load` takes them from the port's rows
    let mut accounts = Vec::new();
    if format >= 5 {
        let n = i.len(8 * crate::SUMMED)?;
        if n == 0 || n > window {
            return Err(format!(
                "a clock with {n} rows of the national accounts and windows of {window} periods"
            ));
        }
        for _ in 0..n {
            let mut row = [0.0; crate::SUMMED];
            for x in &mut row {
                *x = i.f64()?;
            }
            accounts.push(row);
        }
    }
    // formats before 6 keep the whole past in the port's lists
    let past = if format >= 6 && i.bool()? {
        Some(Past {
            periods: i.n()?,
            Y: get_series(i, window)?,
            pi: get_series(i, window)?,
        })
    } else {
        None
    };
    // formats before 7 know no spending out of savings
    let (savings, norm) = if format >= 7 { (i.f64()?, i.f64()?) } else { (0.0, -1.0) };
    if !(0.0..=1.0).contains(&savings) {
        return Err(format!(
            "a clock with a share of {savings} of the savings spent per period"
        ));
    }
    // formats before 8 know the paper's series of the crown's purchases only
    let (crown_revenue, crown_outlays) = if format >= 8 {
        (i.bool()?, i.f64()?)
    } else {
        (false, 0.0)
    };
    let owner = format >= 9 && i.bool()?;
    // formats before 10 know no working days: every period is one
    // and before 10 the factors of the days since a firm's last plan are their number, with the starting position
    let (attendance, worked) = if format >= 10 {
        let (from, days, kinds, factor, day, calendar, household) =
            (i.n()?, i.n()?, i.n()?, i.f64s()?, i.bytes()?, i.bytes()?, i.bytes()?);
        let worked = i.f64s()?;
        if worked.len() != demand.len() || worked.iter().any(|w| !(w.is_finite() && *w >= 0.0)) {
            return Err(format!(
                "a clock with the worked days of {} firms and {} firms",
                worked.len(),
                demand.len()
            ));
        }
        let attendance = if calendar.is_empty() {
            Attendance::default()
        } else {
            if calendar.len() != demand.len() {
                return Err(format!(
                    "working days of {} firms in a clock of {} firms",
                    calendar.len(),
                    demand.len()
                ));
            }
            Attendance::new(from, days, kinds, factor, day, calendar, household)?
        };
        (attendance, worked)
    } else {
        (Attendance::default(), periods.iter().map(|&p| p as f64 + 1.0).collect())
    };
    // formats before 11 know no profits of the owners: they are gathered anew
    let owner_profit = if format >= 11 {
        let (ended, ended_periods, open, open_periods) = (i.f64s()?, i.f64s()?, i.f64s()?, i.f64s()?);
        let n = i.len(4)?;
        let mut ends = Vec::with_capacity(n);
        for _ in 0..n {
            ends.push(i.u32()?);
        }
        let firms = open.len();
        if (firms != 0 && firms != demand.len())
            || open_periods.len() != firms
            || ends.len() != firms
            || ended.len() != OWNER_PLANS * firms
            || ended_periods.len() != OWNER_PLANS * firms
            || ended.iter().chain(&open).any(|x| !x.is_finite())
            || ended_periods
                .iter()
                .chain(&open_periods)
                .any(|x| !(x.is_finite() && *x >= 0.0))
        {
            return Err(format!(
                "a clock with the profits of the owners of {firms} firms and {} firms",
                demand.len()
            ));
        }
        OwnerProfit {
            ended,
            ended_periods,
            open,
            open_periods,
            ends,
        }
    } else {
        OwnerProfit::default()
    };
    // formats before 12 know no workers who are away; the workers of an economy are checked when it is given
    // absences ([`crate::Economy::with_absences`])
    // formats before 14 know no family that stands in ([`crate::workers`])
    let absences = if format >= 12 {
        let n = i.len(if format >= 14 { 13 } else { 12 })?;
        let (mut worker, mut first, mut last) = (Vec::with_capacity(n), Vec::with_capacity(n), Vec::with_capacity(n));
        let mut family = Vec::with_capacity(n);
        for _ in 0..n {
            worker.push(i.u32()?);
            first.push(i.u32()?);
            last.push(i.u32()?);
            family.push(format >= 14 && i.bool()?);
        }
        Absences::new(usize::MAX, worker, first, last)?.with_family(family)?
    } else {
        Absences::default()
    };
    let unused = if format >= 12 { i.f64s()? } else { Vec::new() };
    // formats before 13 know no contracts; the workers of an economy are checked when the state is read ([`load`])
    let contracts = if format >= 13 { i.bytes()? } else { Vec::new() };
    if let Some(&x) = contracts.iter().find(|&&x| x > BY_THE_DAY) {
        return Err(format!("a contract of the kind {x}"));
    }
    Ok(DailyClock {
        plan,
        window,
        demand,
        periods,
        worked,
        start,
        accounts,
        wage,
        real_wage,
        demand_pull,
        savings,
        norm,
        crown_revenue,
        crown_outlays,
        owner,
        borne: Vec::new(),
        past,
        trade: None,
        attendance,
        owner_profit,
        absences,
        lost: Vec::new(),
        unused,
        contracts,
        today: Today::default(),
    })
}
