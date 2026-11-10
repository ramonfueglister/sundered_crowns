// Views of the realm pass: the Empire and its league, the great powers, the assembly's vote, the choice of the head of
// the realm and the demands of the Powers, and the window of a situation. Every number comes with the rows the
// simulation itself sums (breakdown tooltips).
import type { GameState, I18n, Nation } from '../sim/types';
import type { World } from '../sim/world';
import type { Query } from './protocol';
import {
  IMPERIAL_REFORMS, nextReform, authorityDrift, crownEffects, memberEffects, internalWars, electionCandidates, voteScore, electorChoice, tally,
  campaignCost, dietStance, dietTally, dietPasses, dietCooldown, dietWeight, dietVoters, league, leagueEligible, leagueEffects, LEAGUE_NAME, defendScore, obeyScore,
  ORDER_COST, ORDER_OBEYED, ORDER_DEFIED, BAN_EFFECTS, BAN_YEARS, LEAGUE_CALL_EXHAUSTION, LEAGUE_STAYED_OUT, pennyParts, PENNY_CAP, hasReform,
  lobbyCost, isLobby, isHuman, reformDef,
} from '../sim/systems/empire';
import { greatPowers, isGreatPower, scoreParts, growth, RISING, GP_EFFECTS, GP_REGARD, balanceThreat, interveneScore, mediationScore, protectScore, powersState, GP_COUNT, SPURNED } from '../sim/systems/powers';
import { assemblyVote, taxLevel, taxCeiling, needsTaxVote, needsWarVote, bribeCost, govProcess, partiesOf, electionTally, termYears, TERM_LIMIT, estateName, taxAsk, taxLevelParts, taxWeights, classSums, dutiesOf, grantFor, type AssemblyAsk } from '../sim/systems/government';
import { DUTIES } from '../sim/systems/duties';
import { PRIVILEGES, ageOf, lawEffect } from '../sim/systems/politics';
import { SITUATIONS } from '../sim/content/situations';
import { SIT_EXTRA } from '../sim/content/situation_actions';
import { sitActionRefusal } from '../sim/systems/situations';
import { nationStats } from '../sim/systems/realm';
import { hasTreaty } from '../sim/ctx';
import type { WarGoal } from '../sim/types';

type Row = [string | I18n, number];
const sum = (r: Row[]) => r.reduce((p, x) => p + x[1], 0);

export function realmAnswer(s: GameState, w: World, player: number, q: Query): any {
  switch (q.q) {
    case 'empire': return empireView(s, w, player);
    case 'powers': return powersView(s, w, player);
    case 'assembly': return assemblyView(s, player, q);
    case 'govern': return governView(s, w, player);
    case 'situation': return situationView(s, w, player, q.id);
  }
  return null;
}

function empireView(s: GameState, w: World, me: number) {
  const E = s.empire; const n = s.nations[me];
  const el = E.election;
  const cands = el ? el.candidates : electionCandidates(s);
  const t = tally(s, w);
  const drift = authorityDrift(s);
  const r = nextReform(s);
  const dt = dietTally(s);
  const rd = reformDef(E.diet?.proposal ?? r?.id ?? ''); // the reform the tally is about
  const lg = league(s);
  return {
    emperor: E.emperor, authority: E.authority, members: E.members, electors: E.electors, reforms: E.reforms, isMember: !!n?.isHRE, elector: E.electors.includes(me), isEmperor: E.emperor === me,
    drift, driftSum: sum(drift), lastYear: E.authLast ?? {}, thisYear: E.authLog ?? {},
    crown: crownEffects(s), member: memberEffects(s), internalWars: internalWars(s).map((x) => ({ id: x.id, name: x.name, att: x.attLead, def: x.defLead, ordered: (E.orders ?? []).some((o) => o.war === x.id && o.answer === 0) })),
    lastElection: E.lastElection,
    election: el ? { closes: el.closes, myVote: el.votes[me] ?? -1 } : null,
    candidates: cands.map((c) => ({ id: c, votes: t[c] ?? 0 })),
    electorViews: E.electors.map((x) => {
      const choice = electorChoice(s, w, x);
      return { id: x, human: s.playerNations.includes(x), choice, rows: choice >= 0 ? voteScore(s, w, x, choice) : [], forMe: me !== choice && cands.includes(me) ? voteScore(s, w, x, me) : null, favour: E.favour?.[`${me}>${x}`] ?? 0, cost: n && s.nations[x] && isLobby(s, n, s.nations[x]) ? lobbyCost(s, n, s.nations[x]) : null };
    }),
    campaignCost: n ? campaignCost(s, n) : 0,
    reformList: IMPERIAL_REFORMS.map((x) => ({ id: x.id, name: x.name, desc: x.desc, cost: x.cost, passed: E.reforms.includes(x.id) })),
    next: r ? { id: r.id, name: r.name, cost: r.cost, stance: n && n.isHRE ? dietStance(s, n, r) : [] } : null,
    diet: E.diet ? { proposal: E.diet.proposal, ends: E.diet.ends, mine: E.diet.votesFor.includes(me) ? 1 : E.diet.votesAgainst.includes(me) ? -1 : 0 } : null,
    dietTally: { yes: dt.yes, no: dt.no, total: dt.total, passes: dietPasses(dt), votes: Object.entries(dt.votes).map(([id, v]) => ({ id: +id, v, weight: dietWeight(s.nations[+id]) })) },
    // every voting member with its vote and reasons on the reform before the diet, and, for the emperor while the
    // diet sits, what lobbying it costs (systems/empire.ts lobbyCost) and the favour it already has
    dietMembers: rd && n?.isHRE ? dietVoters(s).map((id) => { const x = s.nations[id]; const rows = isHuman(s, id) ? [] : dietStance(s, x, rd);
      return { id, weight: dietWeight(x), elector: E.electors.includes(id), human: isHuman(s, id), vote: dt.votes[id] ?? 0, sum: sum(rows), rows, favour: E.favour?.[`${E.emperor}>${id}`] ?? 0,
        cost: n && isLobby(s, n, x) ? lobbyCost(s, n, x) : null }; }) : [],
    dietReady: s.day - (E.lastDiet ?? -1e9) >= dietCooldown(s) ? 0 : (E.lastDiet ?? 0) + dietCooldown(s),
    voters: dietVoters(s).length,
    calls: (E.calls ?? []).filter((c) => c.answer === 0).map((c) => ({ ...c, rows: s.nations[E.emperor]?.alive ? defendScore(s, w, s.nations[E.emperor], c) : [] })),
    orders: (E.orders ?? []).filter((o) => o.answer === 0).map((o) => { const war = s.wars.find((x) => x.id === o.war); return { ...o, rows: war ? obeyScore(s, war) : [] }; }),
    league: lg ? {
      name: LEAGUE_NAME, members: lg.members, leader: lg.leader, strength: lg.strength, member: lg.members.includes(me), eligible: n ? leagueEligible(s, w, n) : false, effects: n ? leagueEffects(s, n) : {},
      calls: (lg.calls ?? []).filter((c) => c.to === me).map((c) => ({ ...c, warName: s.wars.find((x) => x.id === c.war)?.name ?? null, exhausted: !!n && n.warExhaustion >= LEAGUE_CALL_EXHAUSTION })),
      callExhaustion: LEAGUE_CALL_EXHAUSTION, stayedOut: LEAGUE_STAYED_OUT,
    } : null,
    // the Common Penny this month (systems/empire.ts pennyParts): what the members' taxes would raise at this
    // authority, less what the cap holds back
    penny: hasReform(s, 'common_penny') ? (() => { const pp = pennyParts(s); const r = (pp.rate * 100).toFixed(2);
      return { paid: pp.paid, rows: [
        [{ en: `Members' taxes ${Math.round(pp.base)} x ${r} % (3 % at authority 100)`, de: `Steuern der Glieder ${Math.round(pp.base)} x ${r} % (3 % bei Autorität 100)` }, pp.uncapped],
        [{ en: `At most ${PENNY_CAP * 100} % of the emperor's taxes (${Math.round(pp.cap)})`, de: `Höchstens ${PENNY_CAP * 100} % der Steuern des Kaisers (${Math.round(pp.cap)})` }, pp.paid - pp.uncapped],
      ] as Row[] }; })() : null,
    // the emperor's order to make peace, in the numbers the simulation uses (systems/empire.ts answerOrder)
    orderTerms: { cost: ORDER_COST, obeyed: ORDER_OBEYED, defied: ORDER_DEFIED, concord: BAN_EFFECTS.concord, mandate: BAN_EFFECTS.mandate, years: BAN_YEARS },
  };
}

function powersView(s: GameState, w: World, me: number) {
  const st = nationStats(s, w);
  const P = powersState(s);
  const gps = greatPowers(s);
  const n = s.nations[me];
  const all = s.nations.filter((x) => x.alive && x.overlord < 0).sort((a, b) => b.score - a.score);
  // the score is reckoned at the start of each month (systems/realm.ts), the parts are today's: what changed since is
  // shown as not yet counted, so the rows add up to the score the ranking uses
  const parts = (x: Nation): Row[] => { const r = scoreParts(s, w, x, st); const d = x.score - r.reduce((p, q) => p + q[1], 0); return Math.abs(d) > 0.05 ? [...r, ['x_gp_unreckoned', d]] : r; };
  const row = (x: Nation, i: number) => ({ id: x.id, rank: i + 1, score: x.score, parts: parts(x), gp: gps.includes(x.id), growth: growth(s, x.id), alarm: (x.flags.gp_alarm ?? -1e9) > s.day - 400, mine: x.id === me });
  const ranking = all.slice(0, 14).map(row);
  // our own standing, also below the fourteen shown: rank among the sovereign realms, score with its parts, and what
  // the last great power holds (the gap to close; a subject is not ranked)
  const myIdx = all.findIndex((x) => x.id === me);
  if (myIdx >= 14) ranking.push(row(all[myIdx], myIdx));
  const last = all[GP_COUNT - 1], next = myIdx > 0 ? all[myIdx - 1] : null;
  const mine = n ? { rank: myIdx >= 0 ? myIdx + 1 : null, of: all.length, score: n.score, parts: parts(n), subject: n.overlord >= 0, isGP: isGreatPower(s, me),
    lastGP: last ? { id: last.id, score: last.score } : null, gap: last && !isGreatPower(s, me) ? Math.max(0, last.score - n.score) : 0,
    next: next ? { id: next.id, score: next.score, gap: Math.max(0, next.score - n.score) } : null, growth: growth(s, me) } : null;
  return {
    count: GP_COUNT, effects: GP_EFFECTS, regard: GP_REGARD, rising: RISING, me, isGP: isGreatPower(s, me), mine,
    ranking,
    wars: s.wars.filter((x) => !['civil_war', 'rebels', 'independence', 'coalition'].includes(x.goal.type)).map((x) => ({
      id: x.id, name: x.name, att: x.attLead, def: x.defLead, threat: balanceThreat(s, x), mine: x.att.includes(me) || x.def.includes(me),
      intervene: n && isGreatPower(s, me) ? interveneScore(s, w, n, x) : null, mediation: n && isGreatPower(s, me) ? mediationScore(s, n, x) : null,
    })),
    protectors: n && !isGreatPower(s, me) ? gps.filter((g) => s.nations[g]?.alive).map((g) => ({ id: g, rows: protectScore(s, w, s.nations[g], n), has: hasTreaty(s, g, me, 'guarantee'), asked: (n.flags[`petition_${g}`] ?? 0) > s.day })) : [],
    petitions: P.petitions.filter((p) => p.to === me).map((p) => ({ ...p, rows: n ? protectScore(s, w, n, s.nations[p.from]) : [] })),
    // mediation offered to us as a war leader: what an AI leader would weigh, and what refusing costs
    offers: (P.offers ?? []).filter((o) => o.to === me).map((o) => { const war = s.wars.find((x) => x.id === o.war); const gp = s.nations[o.gp];
      return { ...o, warName: war?.name ?? null, def: war?.defLead ?? -1, rows: war && gp?.alive ? mediationScore(s, gp, war) : [] }; }),
    spurned: SPURNED,
    protecting: s.treaties.filter((t) => t.type === 'guarantee' && t.a === me && t.until > s.day).map((t) => t.b),
    log: P.log.slice(-12).reverse(),
  };
}

function assemblyView(s: GameState, me: number, q: Extract<Query, { q: 'assembly' }>) {
  const n = s.nations[me]; if (!n) return null;
  let ask: AssemblyAsk; let tax: Exclude<ReturnType<typeof taxAsk>, string> | null = null;
  if (q.kind === 'tax') {
    const a = taxAsk(s, n, q.cls, q.rate, q.duty, q.value); if (typeof a === 'string') return null;
    tax = a; ask = { kind: 'tax', level: a.level, rates: a.rates, duties: a.duties };
  } else ask = { kind: 'war', target: q.target ?? -1, goal: (q.goal ?? 'conquest') as WarGoal['type'] };
  const r = assemblyVote(s, n, ask, q.bribe ?? [], q.concede, tax?.cs);
  // the tax level asked and now, row by row (the rows add up to each), and what a yes would grant
  const tl = tax ? { now: tax.now, nowRows: taxLevelParts(n.taxRate, tax.wts, dutiesOf(n)), rows: taxLevelParts(tax.rates, tax.wts, tax.duties), grant: grantFor(tax.level), duties: tax.duties, rates: tax.rates } : null;
  return {
    ...r, kind: q.kind, level: ask.kind === 'tax' ? ask.level : 0, ceiling: taxCeiling(n), needed: ask.kind === 'tax' ? ask.level > (tax?.now ?? 0) + 1e-9 && needsTaxVote(n, ask.level, tax?.now) : needsWarVote(s, n, (ask as any).target, (ask as any).goal),
    bribeCost: bribeCost(n), treasury: n.treasury, target: q.target, goal: q.goal, cls: q.cls, rate: q.rate, duty: q.duty, value: q.value, tax: tl,
    dutyDefs: DUTIES.map((d) => ({ id: d.id, max: d.max, step: d.step })),
    estates: r.estates.map((e) => ({ ...e, concessionName: e.concession ? PRIVILEGES.find((p) => p.id === e.concession)?.name : undefined })),
    taxVote: lawEffect(n, 'tax_vote') > 0, warVote: lawEffect(n, 'war_vote') > 0,
  };
}

function governView(s: GameState, w: World, me: number) {
  const n = s.nations[me]; if (!n) return null;
  const proc = govProcess(n);
  const t = proc === 'heredity' ? null : electionTally(s, n);
  return {
    process: proc, gov: n.gov, termYears: proc === 'republic' ? termYears(n) : 0, termLimit: TERM_LIMIT, term: n.flags.term ?? 1,
    nextElection: proc === 'republic' ? n.flags.next_election ?? 0 : 0, lastMargin: n.flags.elect_margin, elected: n.flags.elected,
    parties: partiesOf(n), backed: n.backed ?? 0, backCost: 25,
    candidates: t ? t.cands.map((c) => { const ch = s.chars[c.id]; return { id: c.id, name: ch?.name, dynasty: ch?.dynasty, age: ch ? Math.floor(ageOf(s, ch)) : 0, skills: ch?.skills, traits: ch?.traits, party: c.party, partyName: c.party === 'crown' || c.party === 'incumbent' ? null : estateName(c.party), votes: c.votes, share: t.total > 0 ? c.votes / t.total * 100 : 0, by: c.by.map((b) => ({ ...b, name: estateName(b.estate) })) }; }) : [],
    winner: t?.winner ?? 0, total: t?.total ?? 0,
    heir: n.heir, heirName: s.chars[n.heir]?.name,
    demand: n.demand ? { ...n.demand, estateName: estateName(n.demand.estate), privName: PRIVILEGES.find((p) => p.id === n.demand!.privilege)?.name, effects: PRIVILEGES.find((p) => p.id === n.demand!.privilege)?.effects, resent: PRIVILEGES.find((p) => p.id === n.demand!.privilege)?.resent } : null,
    ...(() => { const cs = classSums(s); const wts = taxWeights(n, cs); const rows = taxLevelParts(n.taxRate, wts, dutiesOf(n)); const lv = taxLevel(n.taxRate, wts, dutiesOf(n));
      return { taxLevel: lv, taxLevelRows: rows, taxRates: n.taxRate, taxCeiling: taxCeiling(n, lv) }; })(),
    taxVote: lawEffect(n, 'tax_vote') > 0, warVote: lawEffect(n, 'war_vote') > 0,
    privileges: PRIVILEGES.map((p) => ({ id: p.id, estate: p.estate, name: p.name, effects: p.effects, resent: p.resent ?? {}, grant: p.grant })),
    snubs: n.estates.filter((e) => (n.flags[`snub_${e.id}`] ?? 0) > s.day).map((e) => e.id),
  };
}

function situationView(s: GameState, w: World, me: number, id: string) {
  const sit = s.situations.find((x) => x.id === id); const d = SITUATIONS.find((x) => x.id === id); const ex = SIT_EXTRA[id];
  if (!sit || !d) return null;
  const n: Nation | undefined = s.nations[me];
  const dr = ex ? ex.drivers(s, w, sit, me) : null;
  return {
    id, name: d.name, desc: d.desc, stage: sit.stage, progress: sit.progress, started: sit.started, active: sit.active, outcome: sit.outcome,
    stages: (d.stages ?? []).map((x, i) => ({ name: x, info: ex?.stageInfo[i] })),
    sides: ex ? ex.sides(s, w, sit) : [{ name: { en: 'Involved', de: 'Beteiligt' }, members: d.involved ? d.involved(s, sit) : [] }],
    drivers: dr,
    actions: ex && n ? ex.actions.map((a) => {
      const targets = a.targets ? a.targets(s, w, n, sit) : null;
      const refusal = targets ? (targets.length ? (targets.map((t) => sitActionRefusal(s, w, n, sit, a, t)).find((x) => !x) === undefined ? sitActionRefusal(s, w, n, sit, a, targets[0]) : null) : 'invalid target') : sitActionRefusal(s, w, n, sit, a);
      return { id: a.id, name: a.name, desc: typeof a.desc === 'function' ? a.desc(s, w, n, sit) : a.desc, cost: a.cost(s, n), cooldown: a.cooldown, targets, refusal, ready: n.flags[`sit_${id}_${a.id}`] ?? 0 };
    }) : [],
  };
}
