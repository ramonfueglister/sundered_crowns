// Wars: justifications, declarations, war score, war exhaustion, peace treaties with costed terms,
// AI acceptance with reasons, truces, Dread (expansion backlash) and the Common Front (coalitions).
import type { GameState, War, PeaceTerm, Nation, WarGoal } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice, newId, addOpinion, allies, atWar, hasTreaty, opinion, subjectsOf, topOverlord, treatiesOf } from '../ctx';
import { EPOCH } from '../ctx';
import { C, B, BI } from '../defs';
import { chance, rand } from '../rng';
import { lawEffect, estate } from './politics';

let NC: { e: number; s: GameState | null; locs: number[][]; dev: Float64Array } = { e: -1, s: null, locs: [], dev: new Float64Array(0) };
function natCache(s: GameState) {
  if (NC.e === EPOCH.v && NC.s === s) return NC;
  const N = s.nations.length; const locs: number[][] = Array.from({ length: N }, () => []); const dev = new Float64Array(N);
  const o = s.loc.owner;
  for (let i = 0; i < o.length; i++) { const k = o[i]; if (k >= 0 && k < N) { locs[k].push(i); dev[k] += s.loc.dev[i]; } }
  NC = { e: EPOCH.v, s, locs, dev }; return NC;
}
/** Locations owned by n (cached per step; do not mutate the returned array). */
export function nationLocs(s: GameState, n: number): number[] { return natCache(s).locs[n]?.slice() ?? []; }
export function nationLocsRO(s: GameState, n: number): readonly number[] { return natCache(s).locs[n] ?? []; }
export function locValue(s: GameState, l: number) { return Math.max(1, s.loc.dev[l]); }
export function nationDev(s: GameState, n: number) { return natCache(s).dev[n] ?? 0; }

export function hasCasusBelli(s: GameState, a: number, b: number): string | null {
  if (hasTreaty(s, a, b, 'claim')) return 'claim';
  const na = s.nations[a], nb = s.nations[b];
  if (na.rivals.includes(b)) return 'rivalry';
  if (na.faith !== nb.faith && (na.flags.holy_war || 0) > 0) return 'holy_war';
  if (s.flags[`cb_${a}_${b}`] && s.flags[`cb_${a}_${b}`] > s.day) return 'fabricated';
  if (nb.excommunicated && na.faith === nb.faith) return 'excommunicated';
  if (na.overlord === b) return 'independence';
  // reconquest of own core land held by b
  const o = s.loc.owner, core = s.loc.core;
  for (let i = 0; i < o.length; i++) if (o[i] === b && core[i] === a) return 'reconquest';
  return null;
}

export function declareWar(s: GameState, w: World, a: number, b: number, goalType: WarGoal['type'] = 'conquest', locs: number[] = []): string | null {
  const na = s.nations[a], nb = s.nations[b];
  if (!na?.alive || !nb?.alive || a === b) return 'invalid';
  if (atWar(s, a, b)) return 'already at war';
  if (hasTreaty(s, a, b, 'truce')) {
    // breaking a truce is possible but costly
    na.concord = clamp(na.concord - 30, -100, 100); na.prestige -= 20;
  }
  if (na.overlord >= 0 && goalType !== 'independence') return 'subjects cannot declare wars';
  if (hasTreaty(s, a, b, 'alliance')) { s.treaties = s.treaties.filter((t) => !(t.type === 'alliance' && ((t.a === a && t.b === b) || (t.a === b && t.b === a)))); na.prestige -= 10; }
  const cb = hasCasusBelli(s, a, b);
  if (!cb && goalType !== 'coalition' && goalType !== 'civil_war' && goalType !== 'independence') {
    // war without justification: heavy penalties
    na.concord = clamp(na.concord - 35, -100, 100); na.mandate = clamp(na.mandate - 15, 0, 100); na.dread += 15;
    for (const o of s.nations) if (o.alive && o.id !== a) addOpinion(s, o.id, a, 'unjust_war', -25, 365 * 5);
  }
  // assemblies must approve wars where the law requires it
  if (lawEffect(na, 'war_vote') > 0 && !s.playerNations.includes(a)) {
    const e = estate(na, 'burghers'); if (e && e.contentment < 35) return 'the assembly refused to fund the war';
  }
  const target = topOverlord(s, b);
  const def = [target, ...subjectsOf(s, target)];
  if (!def.includes(b)) def.push(b);
  const att = [a, ...subjectsOf(s, a).filter((x) => s.nations[x].subjectType !== 'tributary')];
  const war: War = {
    id: newId(s), name: warName(s, w, a, b, goalType), att, def, attLead: a, defLead: target,
    goal: { type: goalType, target: b, locs }, start: s.day, score: 0, battleScore: 0, tickScore: 0, battles: 0, lossesA: 0, lossesD: 0, offers: [],
  };
  s.wars.push(war);
  // call allies
  for (const al of allies(s, target)) if (!war.att.includes(al) && !war.def.includes(al) && willJoin(s, al, target, a, true)) { war.def.push(al); }
  for (const al of allies(s, a)) if (!war.att.includes(al) && !war.def.includes(al) && willJoin(s, al, a, target, false)) { war.att.push(al); }
  // guarantees
  for (const t of s.treaties) if (t.type === 'guarantee' && t.b === b && t.until > s.day && !war.att.includes(t.a) && !war.def.includes(t.a) && s.nations[t.a].alive) war.def.push(t.a);
  addOpinion(s, b, a, 'war_declared', -60, 365 * 10);
  chronicle(s, a, 'war', { en: `${na.short.en} declared war on ${nb.short.en}${cb ? '' : ' without just cause'}.`, de: `${na.short.de} erklärte ${nb.short.de} den Krieg${cb ? '' : ' ohne gerechten Grund'}.` });
  for (const p of s.playerNations) if (war.def.includes(p) || war.att.includes(p)) notice(s, p, 'war', { en: `${na.short.en} declared war on ${nb.short.en}!`, de: `${na.short.de} erklärte ${nb.short.de} den Krieg!` }, { war: war.id, loc: nb.capital });
  // the Empire's members expect the emperor to defend them
  return null;
}
function willJoin(s: GameState, ally: number, friend: number, enemy: number, defensive: boolean): boolean {
  const n = s.nations[ally];
  if (!n.alive || n.overlord >= 0 && n.overlord !== friend) return false;
  if (hasTreaty(s, ally, enemy, 'alliance')) return false;
  if (s.playerNations.includes(ally)) return true; // players are called; they can make separate peace
  const op = opinion(s, ally, friend) - opinion(s, ally, enemy) * 0.5 + (defensive ? 30 : 0) + (n.rivals.includes(enemy) ? 40 : 0);
  return op > 0 || chance(s.rng, 0.5);
}
function warName(s: GameState, w: World, a: number, b: number, goal: string) {
  const A = s.nations[a], Bn = s.nations[b];
  if (goal === 'independence') return { en: `${A.adj.en} War of Independence`, de: `${A.adj.de}er Unabhängigkeitskrieg` };
  if (goal === 'coalition') return { en: `War of the Common Front against ${Bn.short.en}`, de: `Krieg der Gemeinsamen Front gegen ${Bn.short.de}` };
  if (goal === 'civil_war') return { en: `${A.adj.en} War of Succession`, de: `${A.adj.de}er Erbfolgekrieg` };
  if (goal === 'faith') return { en: `${A.adj.en} Holy War against ${Bn.short.en}`, de: `Heiliger Krieg von ${A.short.de} gegen ${Bn.short.de}` };
  return { en: `${A.adj.en}–${Bn.adj.en} War`, de: `${A.short.de}isch-${Bn.short.de}ischer Krieg`.replace('isch-', '–').replace('ischer Krieg', ' Krieg') };
}

/** Battles, occupations: adjust war score of every war between the two sides. */
export function warScoreEvent(s: GameState, winner: number, loser: number, kind: 'battle' | 'occupy' | 'blockade', amount: number, loc?: number) {
  for (const war of s.wars) {
    const wa = war.att.includes(winner) && war.def.includes(loser);
    const wd = war.def.includes(winner) && war.att.includes(loser);
    if (!wa && !wd) continue;
    if (kind === 'battle') { war.battleScore = clamp(war.battleScore + (wa ? amount : -amount), -40, 40); war.battles++; }
  }
}

/** War score: battles + share of enemy value occupied + ticking score from the war goal. */
export function computeScore(s: GameState, war: War): number {
  const att = new Set(war.att), def = new Set(war.def);
  let defTotal = 0, defOcc = 0, attTotal = 0, attOcc = 0;
  const o = s.loc.owner, c = s.loc.ctrl;
  for (let i = 0; i < o.length; i++) {
    const ow = o[i]; if (ow < 0) continue;
    const v = s.loc.dev[i];
    if (def.has(ow)) { defTotal += v; if (att.has(c[i])) defOcc += v; }
    else if (att.has(ow)) { attTotal += v; if (def.has(c[i])) attOcc += v; }
  }
  const occ = (defTotal > 0 ? defOcc / defTotal : 0) * 100 - (attTotal > 0 ? attOcc / attTotal : 0) * 100;
  // capital capture
  const capD = s.nations[war.defLead]?.capital, capA = s.nations[war.attLead]?.capital;
  const cap = (capD >= 0 && att.has(c[capD]) ? 15 : 0) - (capA >= 0 && def.has(c[capA]) ? 15 : 0);
  return clamp(war.battleScore + occ * 0.75 + cap + war.tickScore, -100, 100);
}

// ---------------- peace ----------------
export function termCost(s: GameState, war: War, t: PeaceTerm, from: number, to: number): number {
  const loserDev = Math.max(10, [...(war.att.includes(to) ? war.att : war.def)].reduce((p, n) => p + nationDev(s, n), 0));
  switch (t.type) {
    case 'cede': return (t.locs || []).reduce((p, l) => p + locValue(s, l), 0) / loserDev * 100 * 1.6 + (t.locs?.length ? 3 : 0);
    case 'gold': return clamp((t.amount || 0) / Math.max(1, (s.nations[to].income.tax || 10) * 12) * 25, 1, 60);
    case 'release': return 25;
    case 'vassal': return 60;
    case 'break_alliance': return 10;
    case 'faith': return 40;
    case 'humiliate': return 15;
    case 'independence': return 40;
    case 'concession': return 5;
    case 'white_peace': return 0;
  }
  return 10;
}

/** AI willingness: positive = accepts. Returns reasons for the UI. */
export function evaluatePeace(s: GameState, war: War, from: number, to: number, terms: PeaceTerm[]): { accept: boolean; score: number; reasons: [string, number][] } {
  const reasons: [string, number][] = [];
  const fromAtt = war.att.includes(from);
  const score = computeScore(s, war) * (fromAtt ? 1 : -1); // war score from the offerer's perspective
  const cost = terms.reduce((p, t) => p + termCost(s, war, t, from, to), 0);
  const white = terms.length === 0 || terms.every((t) => t.type === 'white_peace');
  reasons.push(['war_score', Math.round(score)]);
  reasons.push(['demands', -Math.round(cost)]);
  const nTo = s.nations[to];
  const ex = Math.round(nTo.warExhaustion * 0.4); if (ex) reasons.push(['war_exhaustion', ex]);
  const dur = Math.round(Math.min(20, (s.day - war.start) / 365 * 2)); if (dur) reasons.push(['war_length', dur]);
  if (nTo.treasury < 0) reasons.push(['empty_treasury', 10]);
  const capLost = nTo.capital >= 0 && s.loc.ctrl[nTo.capital] !== to; if (capLost) reasons.push(['capital_occupied', 10]);
  const sum = score - cost + ex + dur + (nTo.treasury < 0 ? 10 : 0) + (capLost ? 10 : 0) + (white ? 5 : 0);
  if (!white && score < cost * 0.8) reasons.push(['not_enough_war_score', -20]);
  return { accept: sum >= 0 && (white || score >= cost * 0.8), score: sum, reasons };
}

export function applyPeace(s: GameState, w: World, war: War, winner: number, loser: number, terms: PeaceTerm[]) {
  const W = s.nations[winner], Ln = s.nations[loser];
  const parts: string[] = []; const partsDe: string[] = [];
  let waveOrigin = W.capital;
  for (const t of terms) {
    if (t.type === 'cede' && t.locs) {
      const recv = t.to ?? winner;
      let k = 0;
      for (const l of t.locs) {
        const prev = s.loc.owner[l];
        if (prev < 0) continue;
        transferLoc(s, l, recv, k++);
      }
      s.nations[recv].stats.locsGained += t.locs.length; Ln.stats.locsLost += t.locs.length;
      // Dread grows with the value taken
      const val = t.locs.reduce((p, l) => p + locValue(s, l), 0);
      s.nations[recv].dread += val * 0.35;
      parts.push(`${t.locs.length} locations (${[...new Set(t.locs.map((l) => w.provinces[w.provOf[l]]?.name))].slice(0, 3).join(', ')})`);
      partsDe.push(`${t.locs.length} Orte (${[...new Set(t.locs.map((l) => w.provinces[w.provOf[l]]?.name))].slice(0, 3).join(', ')})`);
    }
    if (t.type === 'gold') { const amt = Math.min(t.amount || 0, Math.max(0, Ln.treasury) + (Ln.income.tax || 0) * 6); Ln.treasury -= amt; W.treasury += amt; parts.push(`${Math.round(amt)} marks`); partsDe.push(`${Math.round(amt)} Mark`); }
    if (t.type === 'vassal') { Ln.overlord = winner; Ln.subjectType = 'vassal'; Ln.subjectSince = s.day; Ln.libertyDesire = 30; parts.push('vassalage'); partsDe.push('Vasallität'); }
    if (t.type === 'break_alliance') { s.treaties = s.treaties.filter((x) => !(x.type === 'alliance' && (x.a === loser || x.b === loser) && (t.nation === undefined || x.a === t.nation || x.b === t.nation))); parts.push('alliances broken'); partsDe.push('Bündnisse gelöst'); }
    if (t.type === 'faith') { Ln.faith = W.faith; Ln.concord = clamp(Ln.concord - 30, -100, 100); parts.push('change of faith'); partsDe.push('Glaubenswechsel'); }
    if (t.type === 'humiliate') { Ln.prestige -= 30; W.prestige += 20; Ln.mandate = clamp(Ln.mandate - 10, 0, 100); parts.push('humiliation'); partsDe.push('Demütigung'); }
    if (t.type === 'independence') { Ln.overlord === winner ? null : null; const sub = s.nations[t.nation ?? winner]; sub.overlord = -1; sub.subjectType = null; parts.push('independence'); partsDe.push('Unabhängigkeit'); }
    if (t.type === 'release' && t.locs?.length) {
      // release a nation from the loser's land
      const { releaseNation } = require_military();
      const nn = releaseNation(s, w, Ln, t.locs, s.loc.culture[t.locs[0]]);
      parts.push(`release of ${nn.short.en}`); partsDe.push(`Freilassung von ${nn.short.de}`);
    }
  }
  // restore control of everything else
  const sides = new Set([...war.att, ...war.def]);
  for (let i = 0; i < s.loc.owner.length; i++) {
    const o = s.loc.owner[i];
    if (sides.has(o) && s.loc.ctrl[i] !== o && s.loc.ctrl[i] !== -2) s.loc.ctrl[i] = o;
  }
  // winner prestige
  W.prestige = clamp(W.prestige + 10, -100, 100); W.stats.warsWon++;
  const text = terms.length && !terms.every((t) => t.type === 'white_peace')
    ? { en: `Peace between ${W.short.en} and ${Ln.short.en}: ${parts.join(', ')}.`, de: `Frieden zwischen ${W.short.de} und ${Ln.short.de}: ${partsDe.join(', ')}.` }
    : { en: `White peace between ${W.short.en} and ${Ln.short.en}.`, de: `Frieden ohne Gebietsänderung zwischen ${W.short.de} und ${Ln.short.de}.` };
  chronicle(s, winner, 'peace', text);
  for (const p of s.playerNations) if (sides.has(p)) notice(s, p, 'peace', text, { loc: Ln.capital });
  s.flags.lastPeaceDay = s.day; (s as any).lastPeace = { day: s.day, winner, loser, origin: waveOrigin };
}
let _mil: any = null;
function require_military() { return _mil; }
export function _setMilitary(m: any) { _mil = m; }

export function transferLoc(s: GameState, l: number, to: number, order = 0) {
  const from = s.loc.owner[l];
  s.loc.owner[l] = to; s.loc.ctrl[l] = to; EPOCH.v++;
  s.loc.integ[l] = 0; // conquered land starts unintegrated
  s.loc.unrest[l] = Math.max(s.loc.unrest[l], 20);
  s.flags.ownershipDirty = s.day;
  (s as any).ownerChanges = (s as any).ownerChanges || [];
  (s as any).ownerChanges.push({ loc: l, day: s.day, from, to, order });
  if ((s as any).ownerChanges.length > 2000) (s as any).ownerChanges.splice(0, 1000);
  // capital lost → move capital
  const fn = s.nations[from];
  if (fn && fn.capital === l) {
    let best = -1, bd = -1;
    for (let i = 0; i < s.loc.owner.length; i++) if (s.loc.owner[i] === from && s.loc.dev[i] > bd) { bd = s.loc.dev[i]; best = i; }
    fn.capital = best;
  }
}

/** End a war between two blocs (removes participants on the losing side from this war). */
export function concludePeace(s: GameState, w: World, war: War, from: number, to: number, terms: PeaceTerm[]) {
  const fromAtt = war.att.includes(from);
  const score = computeScore(s, war) * (fromAtt ? 1 : -1);
  const winner = score >= 0 || terms.length ? from : to;
  const loser = winner === from ? to : from;
  applyPeace(s, w, war, winner, loser, terms.length ? terms : [{ type: 'white_peace' }]);
  // if the offer was between the war leaders, the whole war ends; otherwise only the separate peace
  const leaders = (from === war.attLead || from === war.defLead) && (to === war.attLead || to === war.defLead);
  const ending = leaders ? [...war.att, ...war.def] : [from === war.attLead || from === war.defLead ? to : from];
  for (const n of ending) {
    for (const other of (war.att.includes(n) ? war.def : war.att)) {
      s.treaties.push({ a: Math.min(n, other), b: Math.max(n, other), type: 'truce', since: s.day, until: s.day + 365 * 5 });
    }
  }
  if (leaders) s.wars.splice(s.wars.indexOf(war), 1);
  else {
    war.att = war.att.filter((x) => !ending.includes(x)); war.def = war.def.filter((x) => !ending.includes(x));
    if (!war.att.length || !war.def.length) s.wars.splice(s.wars.indexOf(war), 1);
  }
  // armies in now-foreign territory are sent home
  for (const a of s.armies) {
    if (a.fleet || a.rebels) continue;
    const o = s.loc.owner[a.loc];
    if (o >= 0 && o !== a.owner && !atWar(s, a.owner, o) && !hasTreaty(s, a.owner, o, 'access') && !hasTreaty(s, a.owner, o, 'alliance')) {
      const cap = s.nations[a.owner].capital; if (cap >= 0) { a.loc = cap; a.path = []; a.siege = -1; }
    }
  }
  for (const sg of s.sieges.slice()) if (!s.armies.some((a) => a.siege === sg.loc)) s.sieges.splice(s.sieges.indexOf(sg), 1);
}

// ---------------- Dread & Common Front ----------------
function dreadMonth(s: GameState, w: World) {
  for (const n of s.nations) {
    if (!n.alive) continue;
    n.dread = Math.max(0, n.dread * 0.992 - 0.05 - lawEffect(n, 'dread_decay') * 0.1);
  }
  // nations fearing a strong, dreadful neighbour join a Common Front
  for (const agg of s.nations) {
    if (!agg.alive || agg.dread < 25) { if (agg.flags.front) delete agg.flags.front; continue; }
    const members: number[] = [];
    const capA = agg.capital; if (capA < 0) continue;
    for (const o of s.nations) {
      if (!o.alive || o.id === agg.id || o.overlord >= 0 || o.capital < 0) continue;
      if (hasTreaty(s, o.id, agg.id, 'alliance') || o.overlord === agg.id) continue;
      const d = w.distKm(o.capital, capA);
      if (d > 1400) continue;
      const fear = agg.dread * (1 - d / 1600) - opinion(s, o.id, agg.id) * 0.3 - (o.faith === agg.faith ? 5 : -10);
      if (fear > 20) members.push(o.id);
    }
    agg.flags.front = members.length;
    (s as any).fronts = (s as any).fronts || {};
    (s as any).fronts[agg.id] = members;
    // declare if strong enough
    if (members.length >= 3 && !s.wars.some((x) => x.goal.type === 'coalition' && x.goal.target === agg.id) && chance(s.rng, 0.08)) {
      const strengthF = members.reduce((p, m) => p + nationDev(s, m), 0);
      const strengthA = nationDev(s, agg.id) + allies(s, agg.id).reduce((p, m) => p + nationDev(s, m) * 0.5, 0);
      if (strengthF > strengthA * 0.9) {
        const lead = members.sort((a, b) => nationDev(s, b) - nationDev(s, a))[0];
        const err = declareWar(s, w, lead, agg.id, 'coalition');
        if (!err) {
          const war = s.wars[s.wars.length - 1];
          for (const m of members) if (!war.att.includes(m) && !war.def.includes(m)) war.att.push(m);
          chronicle(s, lead, 'coalition', { en: `A Common Front of ${members.length} realms rose against ${agg.short.en}.`, de: `Eine Gemeinsame Front von ${members.length} Reichen erhob sich gegen ${agg.short.de}.` });
          notice(s, agg.id, 'coalition', { en: `A Common Front of ${members.length} realms has declared war on us!`, de: `Eine Gemeinsame Front von ${members.length} Reichen hat uns den Krieg erklärt!` }, { war: war.id });
        }
      }
    }
  }
}

function warsMonth(s: GameState, w: World) {
  for (const war of s.wars.slice()) {
    if (!s.nations[war.attLead]?.alive || !s.nations[war.defLead]?.alive) { s.wars.splice(s.wars.indexOf(war), 1); continue; }
    // ticking score: attacker holds the war-goal target or the defender's capital
    const goalLocs = war.goal.locs.length ? war.goal.locs : [];
    let held = 0; for (const l of goalLocs) if (war.att.includes(s.loc.ctrl[l])) held++;
    if (goalLocs.length) war.tickScore = clamp(war.tickScore + (held / goalLocs.length > 0.5 ? 1 : -0.5), -25, 25);
    else war.tickScore = clamp(war.tickScore + (war.battleScore > 5 ? 0.3 : war.battleScore < -5 ? -0.3 : 0), -15, 15);
    war.score = computeScore(s, war);
    for (const n of [...war.att, ...war.def]) { const nn = s.nations[n]; if (nn) nn.warExhaustion = clamp(nn.warExhaustion + 0.35, 0, 100); }
    // offers expire
    war.offers = war.offers.filter((o) => o.expires > s.day);
  }
  // civil wars pending from disputed successions
  for (const n of s.nations) {
    const t = s.flags[`civil_war_pending_${n.id}`];
    if (t && t <= s.day && n.alive) { delete s.flags[`civil_war_pending_${n.id}`]; startCivilWar(s, w, n); }
  }
}

export function startCivilWar(s: GameState, w: World, n: Nation) {
  const locs = nationLocs(s, n.id);
  if (locs.length < 6) return;
  // the pretender takes the lands furthest from the capital
  const cap = n.capital;
  locs.sort((a, b) => w.distKm(b, cap) - w.distKm(a, cap));
  const take = locs.slice(0, Math.floor(locs.length * 0.4));
  const { releaseNation, newArmy, availableUnits } = require_military();
  const pre = releaseNation(s, w, n, take, n.culture) as Nation;
  pre.name = { en: `${n.short.en} (pretender)`, de: `${n.short.de} (Prätendent)` }; pre.short = pre.name; pre.adj = n.adj; pre.faith = n.faith; pre.gov = n.gov;
  pre.color = n.color.map((v) => Math.min(255, v + 45)) as any;
  pre.flags.pretender_of = n.id;
  for (const l of take) s.loc.core[l] = n.id;
  const units = availableUnits(s, pre, false);
  newArmy(s, pre.id, take[0], [{ type: units[0], men: Math.max(3000, n.maxManpower * 0.15) }]);
  const err = declareWar(s, w, pre.id, n.id, 'civil_war');
  chronicle(s, n.id, 'civil_war', { en: `Civil war broke out in ${n.short.en} over the disputed succession.`, de: `In ${n.short.de} brach über die umstrittene Thronfolge ein Bürgerkrieg aus.` });
  notice(s, n.id, 'civil_war', { en: `Civil war! A pretender has seized part of the realm.`, de: `Bürgerkrieg! Ein Prätendent hat einen Teil des Reiches an sich gerissen.` }, { loc: take[0] });
  void err;
}

export const war: System = {
  id: 'war',
  monthly({ s, w }) { warsMonth(s, w); dreadMonth(s, w); },
};
