// Worker-side views of war (claude/war-pass): the declaration dialog, the army and siege panels, battle reports, the
// peace terms a war allows, and the army supply map mode. Every number comes from the same simulation function that
// applies it, so what the panels show is what happens.
import type { GameState, Siege, BattleRep, BattleSideRep, PeaceTerm, War } from '../sim/types';
import type { World } from '../sim/world';
import type { Legend } from './protocol';
import { UNITS } from '../sim/defs';
import { siegeSteps, armyMen, supplyParts, attritionParts, refillPlan, siegeOdds, assaultOdds, assaultRefusal, besiegersOf, scorched, scorchRefusal, blockadedPorts, maxMorale, SCORCH_SUPPLY } from '../sim/systems/military';
import { casusBelliAll, CB_GOALS, DECLARE_GOALS, declarationCost, declareRefusal, warGoalLocs, allowedTerms, cedeFits, GOAL_TERMS, faithTermFits, faithShare, nationDev, BATTLE_CAP, battleWorth } from '../sim/systems/war';
import { hasTreaty } from '../sim/ctx';
import { FAITHS } from '../sim/content/peoples';

// ---------------------------------------------------------------- declaring war
/** Our justifications against a realm and, for every war goal, whether we may declare it, what it costs and which towns
 *  it is fought for (warGoalLocs: the same list the AI's declarations use). */
export function declareView(s: GameState, w: World, player: number, target: number) {
  const n = s.nations[player], b = s.nations[target];
  if (!n || !b || player === target) return null;
  const cbs = casusBelliAll(s, player, target, w).map((kind) => ({ kind, goals: CB_GOALS[kind] }));
  const goals = DECLARE_GOALS.map((goal) => {
    const refusal = declareRefusal(s, w, player, target, goal);
    const c = declarationCost(s, w, player, target, goal);
    return {
      goal, refusal, cb: c.cb, unjust: c.unjust, truce: c.truce, ally: c.ally, rows: c.rows, opinionYears: c.opinionYears,
      locs: refusal ? [] : warGoalLocs(s, w, player, target, goal), terms: GOAL_TERMS[goal] ?? [],
    };
  }).filter((g) => g.refusal !== 'they are not our overlord');
  return { cbs, goals, truce: hasTreaty(s, player, target, 'truce'), ally: hasTreaty(s, player, target, 'alliance') };
}

// ---------------------------------------------------------------- sieges
/** A siege as its panel shows it: progress, garrison and its stores, breach, blockade, the odds of the monthly roll and
 *  the expected time, a readable log, and the assault our besiegers could make now. */
export function siegeView(s: GameState, w: World, sg: Siege, player: number) {
  const o = siegeOdds(s, w, sg);
  const mine = player >= 0 ? besiegersOf(s, sg).filter((a) => a.owner === player && !a.rebels) : [];
  const as = mine.length ? assaultOdds(s, w, sg, mine) : null;
  // the garrison starves slowly: faster when the sea is closed (siegesDay)
  const starve = 1 - Math.pow(sg.blockade ? 0.997 : 0.999, 30);
  return {
    loc: sg.loc, nation: sg.nation, defender: s.loc.ctrl[sg.loc], progress: sg.progress, need: siegeSteps(sg), days: sg.days,
    garrison: sg.garrison, garrison0: sg.garrison0 ?? sg.garrison, breach: sg.breach, blockade: sg.blockade, coastal: !!w.coastal[sg.loc],
    starve, starveRows: [['x_sg_starve_base', 0.001 * 30], ...(sg.blockade ? [['x_sg_starve_blockade', 0.002 * 30]] : [])] as [string, number][],
    odds: { parts: o.parts, bonus: o.bonus, need: o.need, pStep: o.pStep, pBreach: o.pBreach, battering: o.battering, pResupply: o.pResupply, steps: o.steps, days: o.days, men: o.men, art: o.art },
    log: sg.log.map((e) => { const k = e.indexOf(':'); return k < 0 ? { day: -1, kind: e } : { day: Number(e.slice(0, k)), kind: e.slice(k + 1) }; }).reverse(),
    assault: as && mine.length ? { army: mine[0].id, p: as.p, loss: as.loss, men: as.men, parts: as.parts, garrison: as.garrison, wait: as.wait, refusal: assaultRefusal(s, mine[0]) } : null,
  };
}

/** The sieges of the tick view: who besieges, the steps made and the steps the town needs (the map badge, the overview). */
export function siegesView(s: GameState): { loc: number; nation: number; progress: number; need: number; garrison: number }[] {
  return s.sieges.map((x) => ({ loc: x.loc, nation: x.nation, progress: x.progress, need: siegeSteps(x), garrison: x.garrison }));
}

// ---------------------------------------------------------------- armies
/** One army of ours in detail: regiments with their full strength and what they would take in this month, the supply
 *  of the place and the attrition it causes (by cause), and the siege it lies before. */
export function armyView(s: GameState, w: World, player: number, id: number) {
  const a = s.armies.find((x) => x.id === id); if (!a || a.owner !== player) return null;
  const plan = refillPlan(s, w, a);
  const n = s.nations[a.owner];
  const sup = a.fleet || a.loc >= w.L ? null : supplyParts(s, w, a.loc, a.owner);
  const at = a.fleet ? null : attritionParts(s, w, a);
  const sg = a.siege >= 0 ? s.sieges.find((x) => x.loc === a.siege) : undefined;
  return {
    id: a.id, loc: a.loc, fleet: a.fleet, men: armyMen(a), morale: a.morale, maxMorale: maxMorale(s, a),
    regs: plan.regs.map((r) => ({ type: r.type, name: UNITS[r.type].name, kind: UNITS[r.type].kind, men: r.men, max: r.max, want: r.want })),
    refill: { block: plan.block, men: plan.men, gold: plan.gold, manpower: n?.manpower ?? 0, treasury: n?.treasury ?? 0 },
    supply: sup, attrition: at ? { rows: at.rows, mult: at.mult, total: at.total, men: at.men, limit: at.limit, quartered: at.quartered } : null,
    siege: sg ? siegeView(s, w, sg, player) : null, scorched: a.loc < w.L && scorched(s, a.loc),
  };
}

// ---------------------------------------------------------------- places
/** What the war does to a place: scorched earth (until when, and whether we may burn it now), a blockade of its port
 *  or market, the men it feeds for our armies, and its siege. */
export function locWar(s: GameState, w: World, l: number, player: number) {
  if (l < 0 || l >= w.L) return null;
  const blk = w.coastal[l] ? blockadedPorts(s, w) : null;
  const m = s.loc.market[l];
  return {
    scorchedUntil: scorched(s, l) ? s.flags[`scorched_${l}`] : 0,
    scorch: player >= 0 && s.loc.owner[l] === player ? { refusal: scorchRefusal(s, w, player, l), supply: SCORCH_SUPPLY } : null,
    blockadedBy: blk?.get(l) ?? -1,
    marketBlockedUntil: m >= 0 && (s.flags[`blockade_${m}`] ?? 0) > s.day ? s.flags[`blockade_${m}`] : 0,
    supply: player >= 0 ? supplyParts(s, w, l, player) : null,
    siege: (() => { const sg = s.sieges.find((x) => x.loc === l); return sg ? siegeView(s, w, sg, player) : null; })(),
  };
}

// ---------------------------------------------------------------- battle reports
const sideSum = (x: BattleSideRep, k: 'start' | 'end') => x.troops.reduce((p, r) => p + r[k], 0);
/** A battle report with the names the panel needs. */
export function battleView(s: GameState, w: World, id: number) {
  const r = (s.battleReports ?? []).find((x) => x.id === id); if (!r) return null;
  const side = (x: BattleSideRep) => ({ ...x, troops: x.troops.map((tr) => ({ ...tr, name: UNITS[tr.type]?.name, kind: UNITS[tr.type]?.kind })), start: sideSum(x, 'start'), end: sideSum(x, 'end') });
  return { ...r, att: side(r.att), def: side(r.def), name: { en: w.names[r.loc] ?? '', de: w.namesDe[r.loc] ?? '' } };
}
/** Short rows for lists of battles: those of a war (the greatest first), or the player's latest. */
export function battleList(s: GameState, war: number | undefined, player: number) {
  const all = (s.battleReports ?? []) as BattleRep[];
  const pick = war !== undefined ? all.filter((r) => r.wars.includes(war)) : all.filter((r) => r.att.nation === player || r.def.nation === player);
  return pick.map((r) => ({ id: r.id, loc: r.loc, day: r.day1, naval: r.naval, att: r.att.nation, def: r.def.nation, attRebels: r.att.rebels, defRebels: r.def.rebels,
    menA: sideSum(r.att, 'start'), menD: sideSum(r.def, 'start'), lossA: r.lossA, lossD: r.lossD, winner: r.winner }))
    .sort((a, b) => (war !== undefined ? b.lossA + b.lossD - (a.lossA + a.lossD) : b.day - a.day) || b.id - a.id).slice(0, 12);
}

// ---------------------------------------------------------------- peace terms
/** What the player may demand in a war (the terms its goal allows, the occupied towns that fit it) and its battles. */
export function warView(s: GameState, w: World, player: number, id: number) {
  const war = s.wars.find((x) => x.id === id); if (!war) return null;
  const att = war.att.includes(player);
  const allowed = [...allowedTerms(war, att)];
  const theirSide = att ? war.def : war.att, ourSide = att ? war.att : war.def;
  const fits: number[] = [];
  for (let l = 0; l < w.L; l++) if (theirSide.includes(s.loc.owner[l]) && ourSide.includes(s.loc.ctrl[l]) && cedeFits(s, w, war, att, player, l)) fits.push(l);
  const enemyLead = att ? war.defLead : war.attLead, L = s.nations[enemyLead];
  const throne = !!L && !(L.gov.includes('republic') || L.gov === 'theocracy' || L.gov === 'military_order');
  // towns of the enemy side we hold that do not share our faith (a holy war may convert them)
  const f = s.nations[player]?.faith;
  const convert = fits.filter((l) => s.loc.faith[l] !== f);
  // whether their whole realm may be made to take our faith (faithTermFits), with the two numbers the rule weighs
  const faith = L && L.faith !== f ? { fit: att ? faithTermFits(s, player, enemyLead) : null, weight: nationDev(s, enemyLead) / Math.max(1, nationDev(s, player)),
    people: faithShare(s, enemyLead, f), oldFaith: FAITHS[L.faith]?.family === 'traditional' } : null;
  return { id, goal: war.goal.type, cb: war.goal.cb ?? null, goalLocs: war.goal.locs, attacker: att, allowed, fits, convert, throne,
    sameFaith: !!L && L.faith === f, faith, blockScore: war.blockScore ?? 0, battles: battleList(s, id, player), log: warBattleLog(s, war, att) };
}
/** Every battle behind a war's battle score, from our side (att: we are among the attackers): the battles logged one by
 *  one (newest first), the older ones summed, and what older saves scored before the log existed, so that the rows add
 *  up to the battle score exactly. A row links to its full report while that is kept. */
export function warBattleLog(s: GameState, war: War, att: boolean) {
  const sign = att ? 1 : -1;
  const kept = new Set((s.battleReports ?? []).map((r) => r.id));
  const rows = (war.battleLog ?? []).map((b) => {
    // what the battle was worth and why (battleWorth): the loser's dead, and the blow to the losing side of this war
    const v = battleWorth(b.lossL, b.side ?? 0), k = b.raw < 0 ? -sign : sign;
    return { day: b.day, loc: b.loc, naval: b.naval, win: b.win, lose: b.lose, lossW: b.lossW, lossL: b.lossL, side: b.side ?? 0,
      dead: v.dead * k, blow: v.blow * k, score: b.score * sign, raw: b.raw * sign, report: b.report !== undefined && kept.has(b.report) ? b.report : null };
  }).reverse();
  const rest = war.battleLogRest ? { n: war.battleLogRest.n, score: war.battleLogRest.score * sign } : null;
  const total = war.battleScore * sign;
  const listed = rows.reduce((p, r) => p + r.score, 0) + (rest?.score ?? 0);
  // a war from an older save scored battles before they were logged
  const unlogged = Math.abs(total - listed) > 1e-6 ? total - listed : 0;
  return { rows, rest, unlogged, total, cap: BATTLE_CAP, count: war.battles };
}
export type WarTermType = PeaceTerm['type'];

// ---------------------------------------------------------------- map mode
/** Men each place feeds for the realm's armies (supplyParts): red where an army starves, green where a host can winter. */
export function armySupplyColors(s: GameState, w: World, focus: number, put: (i: number, c: [number, number, number], a?: number) => void, ramp: (t: number, stops: [number, number, number][]) => [number, number, number]): Legend {
  const STOPS: [number, number, number][] = [[170, 40, 35], [220, 120, 50], [235, 205, 90], [130, 185, 90], [45, 125, 70]];
  const f = s.nations[focus] ? focus : -1;
  for (let i = 0; i < w.L; i++) {
    if (scorched(s, i)) { put(i, [60, 40, 35]); continue; }
    const lim = supplyParts(s, w, i, f).total;
    put(i, ramp(Math.log(lim / 800) / Math.log(60), STOPS));
  }
  const at = (men: number) => `rgb(${ramp(Math.log(men / 800) / Math.log(60), STOPS).join(',')})`;
  return {
    title: { en: 'Army supply: men fed per place', de: 'Heeresversorgung: ernährte Männer je Ort' },
    items: [
      { color: at(800), label: { en: 'under 1,500', de: 'unter 1.500' } }, { color: at(3000), label: { en: '3,000', de: '3.000' } }, { color: at(8000), label: { en: '8,000', de: '8.000' } },
      { color: at(20000), label: { en: '20,000', de: '20.000' } }, { color: at(48000), label: { en: 'over 40,000', de: 'über 40.000' } }, { color: 'rgb(60,40,35)', label: { en: 'Scorched earth', de: 'Verbrannte Erde' } },
    ],
  };
}
