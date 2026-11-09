// Every action a player or the AI can take goes through applyCommand. It validates and mutates the state
// deterministically, so the same command list replays to the same game (single player, replays, world server).
import type { GameState, Command, CmdResult, Army, PeaceTerm, I18n, Nation, War } from './types';
import type { World } from './world';
import { BUILDINGS, B, BI, RECIPES, UNITS } from './defs';
import { clamp, notice, atWar, hasTreaty, bump } from './ctx';
import { findPath, recruit, hireMercenaries, appointGeneral, removeArmy, armyMen, newArmy, unitCost, assault, scorchEarth } from './systems/military';
import { availableCommanders, setCommander, raiseGeneral, generalCost } from './systems/commanders';
import { declareWar, evaluatePeace, concludePeace, computeScore, termCost, allowedTerms, cedeFits, TARIFF_CAP, DECLARE_GOALS, faithTermFits } from './systems/war';
import { sendEnvoy, startSpy } from './systems/diplomacy';
import { enactReform, grantPrivilege, revokePrivilege, estate, appointOfficial, lawEffect } from './systems/politics';
import { takeLoan, tariffMax } from './systems/economy';
import { setMethod } from './systems/administration';
import { setDuty, DUTY_INDEX } from './systems/duties';
import { investTech, takeDoctrine } from './systems/progress';
import { startAgent } from './systems/society';
import { startColony, charterCompany } from './systems/colonial';
import { launchExpedition } from './systems/explore';
import { startLandmark } from './systems/landmarks';
import { setMerchants, merchantCap } from './systems/trade';
import { answerEvent, takeDecision } from './systems/events';
import { claimGoal } from './systems/goals';
import { workshopOptions } from './setup';
import { LAW_INDEX } from './content/laws';
import { realmCommand } from './realmcmds';
import { setTaxRate } from './systems/government';

const OK: CmdResult = { ok: true };
const err = (e: string | I18n): CmdResult => (typeof e === 'string' ? { ok: false, err: e } : { ok: false, err: e.en, msg: e });

/**
 * Why a realm cannot start this building here now, gold aside (null = it can). The build command, the AI and the
 * building overview use the same rules.
 */
export function buildRefusal(s: GameState, w: World, nid: number, l: number, b: number, q?: BuildQueue): string | null {
  const def = BUILDINGS[b]; if (!def) return 'unknown building';
  const n = s.nations[nid];
  if (l < 0 || l >= w.L || s.loc.owner[l] !== nid) return 'not your location';
  if (s.loc.ctrl[l] !== nid) return 'occupied';
  if ((def.era ?? 0) > n.era) return 'not yet known';
  if (def.needsCoast && !w.coastal[l]) return 'needs a coast';
  const lvl = s.loc.buildings[l * B + b];
  let queued = 0, here = 0;
  if (q) { here = q.here.get(l) ?? 0; queued = q.same.get(l * B + b) ?? 0; }
  else for (const c of s.constructions) if (c.loc === l) { here++; if (c.building === b) queued++; }
  if (lvl + queued >= def.max) return 'fully built';
  if (here >= 2) return 'two works already under way here';
  if (b === BI.university && s.loc.dev[l] < 25) return 'needs a larger town';
  if (b === BI.admin && (q ? q.admin.has(nid) : s.constructions.some((c) => c.nation === nid && c.building === BI.admin))) return 'one seat at a time';
  return null;
}
/** The construction queue counted once (works per location, per location and building, realms raising a seat), for checking many places. */
export interface BuildQueue { here: Map<number, number>; same: Map<number, number>; admin: Set<number> }
export function buildQueue(s: GameState): BuildQueue {
  const q: BuildQueue = { here: new Map(), same: new Map(), admin: new Set() };
  for (const c of s.constructions) {
    q.here.set(c.loc, (q.here.get(c.loc) ?? 0) + 1);
    q.same.set(c.loc * B + c.building, (q.same.get(c.loc * B + c.building) ?? 0) + 1);
    if (c.building === BI.admin) q.admin.add(c.nation);
  }
  return q;
}

export function buildCost(s: GameState, n: Nation, b: number, level: number) {
  // fortress laws make walls cheaper (lords' castles) or dearer (bastions) to raise as well as to keep
  const fort = b === BI.fort ? Math.max(0.2, 1 + lawEffect(n, 'fort_cost')) : 1;
  return BUILDINGS[b].cost * (1 + level * 0.5) * s.priceLevel * (1 + n.inflation) * 6 * fort;
}

/** How many merchants a realm can place in markets (systems/trade.ts). */
export { merchantCap };

function myArmy(s: GameState, n: number, id: number): Army | null {
  const a = s.armies.find((x) => x.id === id);
  return a && a.owner === n && !a.rebels ? a : null; // rebels carry the realm's id but obey no one
}

export function applyCommand(s: GameState, w: World, cmd: Command): CmdResult {
  const r = applyCommandInner(s, w, cmd);
  if (r.ok) bump();
  return r;
}
function applyCommandInner(s: GameState, w: World, cmd: Command): CmdResult {
  const n = s.nations[cmd.n];
  if (!n || !n.alive) return err('no such realm');
  switch (cmd.t) {
    case 'move': {
      const a = myArmy(s, cmd.n, cmd.army); if (!a) return err('not your army');
      if (a.battle) return err('in battle');
      if (cmd.to < 0 || cmd.to >= w.N) return err('bad target');
      if (a.embarkedOn) {
        // moving an embarked army: land target → fleet sails to nearest sea and the army disembarks there
        const f = s.armies.find((x) => x.id === a.embarkedOn);
        if (f && cmd.to < w.L) {
          a.embarkedOn = 0; f.carrying = f.carrying.filter((x) => x !== a.id);
        } else return err('embarked');
      }
      if (a.retreating) return err('retreating');
      const p = findPath(s, w, a, a.loc, cmd.to);
      if (!p) return err('no route');
      a.path = p; a.progress = 0; a.siege = -1; a.mission = undefined;
      return OK;
    }
    case 'merge': {
      const list = cmd.armies.map((id) => myArmy(s, cmd.n, id)).filter((x): x is Army => !!x && !x.battle);
      if (list.length < 2) return err('need two armies');
      const host = list[0];
      for (const a of list.slice(1)) {
        if (a.loc !== host.loc || a.fleet !== host.fleet) continue;
        for (const r of a.regs) { const ex = host.regs.find((x) => x.type === r.type); if (ex) { ex.max = (ex.max ?? ex.men) + (r.max ?? r.men); ex.men += r.men; } else host.regs.push({ ...r }); }
        host.morale = Math.min(host.morale, a.morale);
        if (!host.general && a.general) host.general = a.general;
        if (a.fleet) host.carrying.push(...a.carrying);
        a.regs = []; a.carrying = []; removeArmy(s, a);
      }
      return OK;
    }
    case 'split': {
      const a = myArmy(s, cmd.n, cmd.army); if (!a) return err('not your army');
      if (a.battle) return err('in battle');
      if (armyMen(a) < 2) return err('too small');
      const regs = a.regs.map((r) => { const h = a.fleet ? Math.floor(r.men / 2) : r.men / 2; const hm = (r.max ?? r.men) * (h / Math.max(1e-9, r.men)); r.men -= h; r.max = Math.max(r.men, (r.max ?? r.men + h) - hm); return { type: r.type, men: h, max: hm }; }).filter((r) => r.men > 0);
      const b = newArmy(s, cmd.n, a.loc, regs, a.fleet);
      b.morale = a.morale;
      return OK;
    }
    case 'recruit': { const e = recruit(s, w, n, cmd.loc, cmd.unit, cmd.men); return e ? err(e) : OK; }
    case 'mercs': { const e = hireMercenaries(s, w, n, cmd.loc, clamp(cmd.company, 500, 12000)); return e ? err(e) : OK; }
    case 'disband': {
      const a = myArmy(s, cmd.n, cmd.army); if (!a) return err('not your army');
      if (a.battle) return err('in battle');
      if (!a.fleet && !a.mercenary) n.manpower = Math.min(n.maxManpower, n.manpower + armyMen(a) * 0.5);
      for (const cid of a.carrying) { const c = s.armies.find((x) => x.id === cid); if (c) c.embarkedOn = 0; }
      removeArmy(s, a);
      return OK;
    }
    case 'general': {
      // char 0: the ablest free commander; -1: raise a seasoned general for gold; else a person who may command
      // (systems/commanders.ts availableCommanders)
      const a = myArmy(s, cmd.n, cmd.army); if (!a) return err('not your army');
      if (a.rebels) return err('not your army');
      if (cmd.char === 0) { appointGeneral(s, n, a); return OK; }
      if (cmd.char === -1) {
        const cost = generalCost(s, n); if (n.treasury < cost) return err('not enough gold');
        n.treasury -= cost; n.expenseAcc.generals = (n.expenseAcc.generals || 0) + cost;
        setCommander(s, n, a, raiseGeneral(s, n, true, a.fleet)); return OK;
      }
      const c = s.chars[cmd.char]; if (!c || !c.alive || c.nation !== cmd.n) return err('no such person');
      if (!availableCommanders(s, n).some((x) => x.id === c.id)) return err('cannot lead an army');
      setCommander(s, n, a, c); return OK;
    }
    case 'landmark': { const e = startLandmark(s, w, n, String(cmd.id)); return e ? err(e) : OK; }
    case 'build': {
      const b = cmd.building, l = cmd.loc;
      const why = buildRefusal(s, w, cmd.n, l, b); if (why) return err(why);
      const def = BUILDINGS[b];
      const lvl = s.loc.buildings[l * B + b];
      const queued = s.constructions.filter((c) => c.loc === l && c.building === b).length;
      const cost = buildCost(s, n, b, lvl + queued);
      if (n.treasury < cost) return err('not enough gold');
      n.treasury -= cost; n.expenseAcc.construction = (n.expenseAcc.construction || 0) + cost;
      s.constructions.push({ loc: l, building: b, left: Math.max(30, Math.round(def.months * 30 * clamp(1 + lawEffect(n, 'build_time'), 0.3, 2))), nation: cmd.n, cost }); // build_time: e.g. the Andean labour duty
      return OK;
    }
    case 'declare': {
      if (s.flags.peaceful_start && s.day < s.flags.peaceful_start && s.playerNations.includes(cmd.n)) return err('the realm is still settling');
      // only the goals a realm may choose: a Common Front, a disputed crown and rebels are justified by their situation,
      // so a declaration naming them would be a free war with no cause and no cost
      if (!DECLARE_GOALS.includes(cmd.goal)) return err('invalid war goal');
      const e = declareWar(s, w, cmd.n, cmd.target, cmd.goal, cmd.locs ?? []); return e ? err(e) : OK;
    }
    case 'peace': {
      const war = s.wars.find((x) => x.id === cmd.war); if (!war) return err('no such war');
      const mySide = war.att.includes(cmd.n) ? war.att : war.def.includes(cmd.n) ? war.def : null;
      if (!mySide) return err('not in this war');
      const other = s.nations[cmd.to];
      if (!other || mySide.includes(cmd.to) || !(war.att.includes(cmd.to) || war.def.includes(cmd.to))) return err('not an enemy');
      const lead = cmd.n === war.attLead || cmd.n === war.defLead;
      if (!lead && cmd.to !== war.attLead && cmd.to !== war.defLead) return err('negotiate with the war leader');
      if (war.offers.some((o) => o.from === cmd.n && s.day - o.day < 30)) return err('wait before sending another offer');
      const st = sanitizeTerms(s, w, war, cmd.n, cmd.to, cmd.terms, !!cmd.concede);
      if (st.refused) return err(st.refused);
      const terms = st.terms;
      const humanTo = s.playerNations.includes(cmd.to) || !!other.playerId;
      if (humanTo) {
        war.offers.push({ from: cmd.n, to: cmd.to, terms, day: s.day, expires: s.day + 30, concede: !!cmd.concede });
        notice(s, cmd.to, 'peace_offer', { en: `${n.short.en} offers peace terms.`, de: `${n.short.de} bietet Friedensbedingungen an.` }, { war: war.id });
        return OK;
      }
      const ok = cmd.concede ? acceptsConcession(s, war, cmd.n, cmd.to, terms) : evaluatePeace(s, war, cmd.n, cmd.to, terms).accept;
      if (!ok) { war.offers.push({ from: cmd.n, to: cmd.to, terms, day: s.day, expires: s.day, concede: !!cmd.concede }); return err('refused'); }
      if (cmd.concede) concludePeace(s, w, war, cmd.to, cmd.n, terms);
      else concludePeace(s, w, war, cmd.n, cmd.to, terms);
      return OK;
    }
    case 'peace_answer': {
      const war = s.wars.find((x) => x.id === cmd.war); if (!war) return err('no such war');
      const o = war.offers[cmd.offer]; if (!o || o.to !== cmd.n) return err('no such offer');
      war.offers.splice(cmd.offer, 1);
      if (!cmd.accept) { notice(s, o.from, 'peace_refused', { en: `${n.short.en} rejected our peace offer.`, de: `${n.short.de} hat unser Friedensangebot abgelehnt.` }, { war: war.id }); return OK; }
      if (o.concede) concludePeace(s, w, war, o.to, o.from, o.terms); else concludePeace(s, w, war, o.from, o.to, o.terms);
      return OK;
    }
    case 'diplo': { const e = sendEnvoy(s, w, cmd.n, cmd.target, cmd.action, cmd.payload); return e ? err(e) : OK; }
    case 'law': {
      if (!(cmd.law in LAW_INDEX)) return err('unknown law');
      const e = enactReform(s, n, cmd.law, cmd.option); return e ? err(e) : OK;
    }
    case 'estate': {
      const e0 = n.estates.find((x) => x.id === cmd.estate); if (!e0) return err('unknown estate');
      if (cmd.action === 'grant' && cmd.privilege) { const e = grantPrivilege(s, n, cmd.privilege); return e ? err(e) : OK; }
      if (cmd.action === 'revoke' && cmd.privilege) { const e = revokePrivilege(s, n, cmd.privilege); return e ? err(e) : OK; }
      if (cmd.action === 'appease') {
        const cost = Math.max(20, (n.income.tax || 10) * 1.5);
        if (n.treasury < cost) return err('not enough gold');
        if ((n.flags[`appease_${cmd.estate}`] || 0) > s.day) return err('too soon');
        n.treasury -= cost; e0.contentment = clamp(e0.contentment + 12, 0, 100); n.flags[`appease_${cmd.estate}`] = s.day + 365;
        return OK;
      }
      if (cmd.action === 'summon') {
        // summon the assembly: buys Authority with estate goodwill
        if ((n.flags.assembly || 0) > s.day) return err('the assembly met recently');
        n.flags.assembly = s.day + 365 * 2;
        const e = estate(n, cmd.estate);
        n.authority += 25 + e.influence * 0.3; e.contentment = clamp(e.contentment - 8, 0, 100); e.influence = clamp(e.influence + 4, 5, 100);
        return OK;
      }
      return err('unknown action');
    }
    case 'tax': {
      if (cmd.cls < 0 || cmd.cls >= n.taxRate.length) return err('bad class');
      // raising taxes beyond what the assembly granted needs its vote (systems/government.ts)
      const e = setTaxRate(s, n, cmd.cls, cmd.rate); return e ? err(e) : OK;
    }
    case 'empire': case 'league': case 'powers': case 'assembly': case 'govern': case 'situation': { const e = realmCommand(s, w, n, cmd); return e ? err(e) : OK; }
    case 'budget': {
      if (cmd.key === 'army') n.armyMaint = clamp(cmd.value, 0.25, 1);
      else if (cmd.key === 'navy') n.navyMaint = clamp(cmd.value, 0.25, 1);
      else if (cmd.key === 'tariff') n.tariff = clamp(cmd.value, 0, (s.flags[`tariffcap_${cmd.n}`] ?? 0) > s.day ? Math.min(TARIFF_CAP, tariffMax(n)) : tariffMax(n)); // a peace may have capped our tolls
      else if (DUTY_INDEX[cmd.key]) { const e = setDuty(n, cmd.key, cmd.value); if (e) return err(e); }
      else if (cmd.key === 'coinage') {
        const nv = clamp(cmd.value, 0, 0.5);
        if (nv > n.coinage + 0.001) n.mandate = clamp(n.mandate - (nv - n.coinage) * 20, 0, 100);
        n.coinage = nv;
      } else return err('unknown budget item');
      return OK;
    }
    case 'event': { const e = answerEvent(s, w, cmd.n, cmd.pending, cmd.choice); return e ? err(e) : OK; }
    case 'tech': { const e = investTech(s, w, n, cmd.branch); return e ? err(e) : OK; }
    case 'doctrine': { const e = takeDoctrine(s, w, n, cmd.group); return e ? err(e) : OK; }
    case 'agent': { const e = startAgent(s, w, n, cmd.loc, cmd.kind); return e ? err(e) : OK; }
    case 'colonize': { const e = startColony(s, w, n, cmd.loc); return e ? err(e) : OK; }
    case 'method': { const e = setMethod(s, w, n, cmd.loc, cmd.method); return e ? err(e) : OK; }
    case 'charter': { const e = charterCompany(s, w, n, cmd.market); return e ? err(e) : OK; }
    case 'explore': { const e = launchExpedition(s, w, n, cmd.fleet, cmd.to); return e ? err(e) : OK; }
    case 'spy': { const e = startSpy(s, cmd.n, cmd.target, cmd.action); return e ? err(e) : OK; }
    case 'office': { const e = appointOfficial(s, n, cmd.office, cmd.char); return e ? err(e) : OK; }
    case 'loan': {
      if (cmd.take) {
        if (n.loans.length >= 8) return err('no lender will extend more credit');
        takeLoan(s, n, clamp(cmd.amount, 10, Math.max(50, (n.income.tax || 10) * 12))); return OK;
      }
      const l = n.loans[0]; if (!l) return err('no loans');
      if (n.treasury < l.amount) return err('not enough gold');
      n.treasury -= l.amount; n.loans.shift(); return OK;
    }
    case 'merchant': { const e = setMerchants(s, w, n, cmd.market, cmd.amount, cmd.steer); return e ? err(e) : OK; }
    case 'integrate': {
      const sub = s.nations[cmd.subject]; if (!sub || sub.overlord !== cmd.n) return err('not your subject');
      if (sub.subjectType === 'tributary') return err('tributaries cannot be integrated');
      if (sub.subjectType === 'colonial') return err('colonial realms cannot be integrated');
      if (s.day - sub.subjectSince < 365 * 10) return err('must be a subject for ten years');
      if (sub.libertyDesire > 50) return err('too restless');
      sub.flags.integrating = s.day; return OK;
    }
    case 'orders': { n.standingOrders = { ...cmd.orders }; return OK; }
    case 'decision': { const e = takeDecision(s, w, n, cmd.id); return e ? err(e) : OK; }
    case 'workshop': {
      const l = cmd.loc; if (s.loc.owner[l] !== cmd.n) return err('not your location');
      if (cmd.slot < 0 || cmd.slot > 2) return err('bad slot');
      if (cmd.slot >= 1 + s.loc.buildings[l * B + BI.workshop]) return err('build more workshops first');
      if (cmd.recipe >= 0 && !workshopOptions(w, l).includes(cmd.recipe) && !RECIPES[cmd.recipe]) return err('unknown recipe');
      if (cmd.recipe >= 0 && (RECIPES[cmd.recipe].minEra ?? 0) > n.era) return err('not yet known');
      s.loc.workshop[l * 3 + cmd.slot] = cmd.recipe + 1; s.flags['wsl_' + l] = 1; return OK;
    }
    case 'embark': {
      const a = myArmy(s, cmd.n, cmd.army), f = myArmy(s, cmd.n, cmd.fleet);
      if (!a || !f || a.fleet || !f.fleet) return err('need an army and a fleet');
      if (w.distKm(a.loc, f.loc) > 150 || !w.coastal[a.loc]) return err('fleet must lie off the coast');
      const cap = f.regs.reduce((p, r) => p + r.men * (UNITS[r.type].sea?.cargo ?? 300), 0);
      const used = f.carrying.reduce((p, id) => p + armyMen(s.armies.find((x) => x.id === id) || ({ regs: [] } as any)), 0);
      if (used + armyMen(a) > cap) return err('not enough ships');
      a.embarkedOn = f.id; a.path = []; a.siege = -1; f.carrying.push(a.id); a.loc = f.loc;
      return OK;
    }
    case 'assault': {
      const a = myArmy(s, cmd.n, cmd.army); if (!a) return err('not your army');
      const e = assault(s, w, a); return e ? err(e) : OK;
    }
    case 'scorch': { const e = scorchEarth(s, w, n, cmd.loc); return e ? err(e) : OK; }
    case 'goal': { const e = claimGoal(s, w, n, String(cmd.id)); return e ? err(e) : OK; }
    case 'cancel': return cancelOrder(s, w, cmd.n, cmd.kind, cmd.loc, cmd.item, cmd.nth);
    case 'batch': return batchOrders(s, w, cmd.n, cmd.cmds);
    case 'dev': return devCommand(s, w, cmd.n, cmd.action, cmd.payload);
  }
  return err('unknown command');
}

// ---------------- orders at scale: cancel, batch ----------------
/** Gold back when a construction is stopped: half of what the unbuilt part cost. */
export function constructionRefund(c: { building: number; left: number; cost: number }): number {
  const total = BUILDINGS[c.building].months * 30;
  return c.cost * 0.5 * clamp(c.left / Math.max(1, total), 0, 1);
}
/** Gold back when a levy is stopped before it is ready: half its price now; the men go back to the manpower pool. */
export function recruitRefund(s: GameState, n: Nation, r: { type: number; men: number }): number {
  return unitCost(s, n, r.type, r.men) * 0.5;
}
/**
 * Index in list of the realm's order for this place and item: the nth of them in queue order (0 = the oldest), as the
 * queue rows list them, or without nth the newest (-1 when there is none). Several levels of one building at one place
 * are built side by side, each adding a level, so any of them can be stopped; each pays back its own share.
 */
function orderAt<T extends { nation: number; loc: number }>(list: T[], nid: number, loc: number, same: (x: T) => boolean, nth?: number): number {
  let k = -1, seen = 0;
  for (let i = 0; i < list.length; i++) {
    const x = list[i]; if (x.nation !== nid || x.loc !== loc || !same(x)) continue;
    if (nth === undefined) k = i;
    else if (seen++ === nth) return i;
  }
  return k;
}
function cancelOrder(s: GameState, w: World, nid: number, kind: string, loc: number, item: number, nth?: number): CmdResult {
  const n = s.nations[nid];
  if (nth !== undefined && (!Number.isInteger(nth) || nth < 0)) return err('nothing under way');
  if (kind === 'build') {
    const k = orderAt(s.constructions, nid, loc, (c) => c.building === item, nth);
    if (k < 0) return err('nothing under way');
    const c = s.constructions[k];
    s.constructions.splice(k, 1);
    const back = constructionRefund(c);
    n.treasury += back; n.incomeAcc.refunds = (n.incomeAcc.refunds || 0) + back;
    return OK;
  }
  if (kind === 'recruit') {
    const k = orderAt(s.recruits, nid, loc, (r) => r.type === item, nth);
    if (k < 0) return err('nothing under way');
    const r = s.recruits[k];
    s.recruits.splice(k, 1);
    const back = recruitRefund(s, n, r);
    n.treasury += back; n.incomeAcc.refunds = (n.incomeAcc.refunds || 0) + back;
    if (UNITS[r.type].kind === 'ship') n.sailors += r.men * 50; else n.manpower = Math.min(n.maxManpower, n.manpower + r.men);
    return OK;
  }
  void w;
  return err('not this kind of order');
}
/** Orders a batch may carry: the province, area and realm actions of the building and levy overviews. */
const BATCH_KINDS = new Set<Command['t']>(['build', 'recruit', 'agent', 'cancel']);
export const BATCH_MAX = 400;
/**
 * Many orders at once, applied one after the other exactly as if sent singly (each validated and paid on its own, so
 * a batch costs what the single orders cost and stops paying when the gold runs out). ok when at least one went
 * through; done counts them; err names the first refusal.
 */
function batchOrders(s: GameState, w: World, nid: number, cmds: Command[]): CmdResult {
  if (!Array.isArray(cmds) || !cmds.length) return err('nothing to do');
  if (cmds.length > BATCH_MAX) return err('too many orders at once');
  let done = 0, first: CmdResult | null = null;
  for (const c of cmds) {
    const r = c && BATCH_KINDS.has(c.t) ? applyCommandInner(s, w, { ...c, n: nid } as Command) : err('not this kind of order');
    if (r.ok) done++; else if (!first) first = r;
  }
  if (!done) return first ?? err('nothing to do');
  return first ? { ok: true, done, err: first.err, ...(first.msg ? { msg: first.msg } : {}) } : { ok: true, done };
}

/**
 * The terms of an offer, checked against the war: each war goal allows its own terms (systems/war.ts GOAL_TERMS), towns
 * must belong to the losing side (and fit the goal: own land in a reconquest, land of our faith in a holy war). Terms
 * the goal does not allow are dropped and named in `refused`. The player and the AI send their offers through here.
 */
export function sanitizeTerms(s: GameState, w: World, war: War, from: number, to: number, terms: PeaceTerm[], concede: boolean): { terms: PeaceTerm[]; refused: string | null } {
  const out: PeaceTerm[] = [];
  let refused: string | null = null;
  const loserSide: number[] = concede ? (war.att.includes(from) ? war.att : war.def) : (war.att.includes(to) ? war.att : war.def);
  const winner = concede ? to : from, loser = concede ? from : to;
  const attWins = war.att.includes(winner);
  const allowed = allowedTerms(war, attWins);
  for (const t of (Array.isArray(terms) ? terms : []).slice(0, 8)) {
    if (!t || !allowed.has(t.type)) { refused = 'that term does not fit the war goal'; continue; }
    if (t.type === 'cede') {
      const recv = concede ? to : (t.to ?? from);
      const all = t.locs || [];
      if (all.some((l) => l >= 0 && l < w.L && !cedeFits(s, w, war, attWins, recv, l))) refused = 'that town does not fit the war goal';
      const locs = all.filter((l) => l >= 0 && l < w.L && loserSide.includes(s.loc.owner[l]) && (s.nations[s.loc.owner[l]].capital !== l || all.length === 1) && cedeFits(s, w, war, attWins, recv, l));
      if (locs.length) out.push({ type: 'cede', locs: [...new Set(locs)], to: concede ? to : (t.to ?? from) });
    } else if (t.type === 'convert' || t.type === 'release') {
      const f = s.nations[winner].faith;
      const locs = (t.locs || []).filter((l) => l >= 0 && l < w.L && loserSide.includes(s.loc.owner[l]) && (t.type !== 'convert' || s.loc.faith[l] !== f));
      if (locs.length) out.push({ type: t.type, locs: [...new Set(locs)] });
    } else if (t.type === 'gold') out.push({ type: 'gold', amount: clamp(t.amount || 0, 0, 1e6) });
    else if (t.type === 'throne') {
      const L = s.nations[loser];
      if (L.gov.includes('republic') || L.gov === 'theocracy' || L.gov === 'military_order' || loser !== (war.att.includes(loser) ? war.attLead : war.defLead)) { refused = 'they have no throne to give'; continue; }
      out.push({ type: 'throne', mode: t.mode === 'claimant' ? 'claimant' : 'union' });
    } else if (t.type === 'faith') {
      if (s.nations[loser].faith === s.nations[winner].faith) { refused = 'they share our faith'; continue; }
      if (!faithTermFits(s, winner, loser)) { refused = 'their realm is too great to change its faith'; continue; }
      out.push({ type: 'faith' });
    } else if (t.type === 'independence') {
      // only the subject that declared the war for its freedom is set free, and only from the overlord that lost (the
      // defeated leader, or the overlord the war was declared on): a nation named by the sender is ignored (it could
      // otherwise free any third realm's subjects)
      const sub = s.nations[war.attLead];
      if (!sub || sub.overlord < 0 || (sub.overlord !== loser && sub.overlord !== war.goal.target)) { refused = 'the freed realm is not their subject'; continue; }
      out.push({ type: 'independence', nation: war.attLead });
    } else out.push({ type: t.type, ...(t.nation !== undefined ? { nation: t.nation } : {}) });
  }
  return { terms: out, refused };
}
function acceptsConcession(s: GameState, war: any, from: number, to: number, terms: PeaceTerm[]) {
  const score = computeScore(s, war) * (war.att.includes(to) ? 1 : -1); // from the receiver's perspective
  const gain = terms.reduce((p, t) => p + termCost(s, war, t, to, from), 0);
  // a host before the walls of a town the war was declared for holds out for that town (see evaluatePeace)
  const goal: number[] = war.goal?.locs ?? [];
  const offered = new Set(terms.flatMap((t) => (t.type === 'cede' ? t.locs ?? [] : [])));
  if (to === war.attLead && !s.playerNations.includes(to) && s.nations[to].warExhaustion < 60
    && s.sieges.some((x) => war.att.includes(x.nation) && goal.includes(x.loc) && !offered.has(x.loc))) return false;
  return score < 10 || gain >= score * 0.5 || s.nations[to].warExhaustion > 40;
}

function devCommand(s: GameState, w: World, n: number, action: string, p: any): CmdResult {
  if (!s.flags.devtools) return err('developer tools are disabled');
  const N = s.nations[n];
  switch (action) {
    case 'gold': N.treasury += p?.amount ?? 1000; return OK;
    case 'manpower': N.manpower = N.maxManpower; return OK;
    case 'authority': N.authority += 100; return OK;
    case 'annex': { const l = p?.loc; if (l >= 0 && l < w.L) { s.loc.owner[l] = n; s.loc.ctrl[l] = n; s.flags.ownershipDirty = s.day; } return OK; }
    case 'tech': for (let k = 0; k < 3; k++) N.tech[k] = Math.min(30, N.tech[k] + 1); return OK;
    case 'reveal': s.flags.revealAll = 1; return OK;
    case 'observer': s.observer = !s.observer; return OK;
    case 'army': newArmy(s, n, p?.loc ?? N.capital, [{ type: 0, men: p?.men ?? 10000 }]); return OK;
    case 'switch': if (s.nations[p?.nation]?.alive) { s.playerNations = [p.nation]; } return OK;
    // the emperor's line ends: the electors meet at the start of the next month (to try the election dialog)
    case 'imperial_election': { const em = s.nations[s.empire.emperor]; if (em) { s.empire.lastElection = s.day; em.flags.ruler_changed = s.day + 1; } return OK; }
  }
  return err('unknown dev action');
}
void atWar; void hasTreaty;
