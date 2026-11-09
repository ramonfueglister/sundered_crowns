// Wars: justifications, declarations, war score, war exhaustion, peace treaties with costed terms,
// AI acceptance with reasons, truces, Dread (expansion backlash) and the Common Front (coalitions).
import { deName } from '../content/names_de';
import type { GameState, War, PeaceTerm, Nation, WarGoal } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice, newId, addOpinion, allies, atWar, hasTreaty, opinion, subjectsOf, topOverlord, treatiesOf } from '../ctx';
import { EPOCH } from '../ctx';
import { C, B, BI } from '../defs';
import { chance, rand } from '../rng';
import { lawEffect, estate } from './politics';
import { GROUP_OF, ALL_CULTURES } from '../content/peoples';

// Per-nation location lists (OC) and development sums (DC), both refreshed lazily after an EPOCH bump.
// Owner and dev are written in many places, so instead of rebuilding on every bump each cache compares
// itself with a snapshot of the array it depends on and rebuilds only when that changed.
// The dev sums are taken when nationDev/nationLocs is first called after a bump (dev also drifts daily without
// a bump); ownedLocs() reads only the owner lists and leaves that moment alone.
/** Bitwise equality of two typed arrays of the same type (compared four bytes at a time where aligned). */
function sameBits(a: Int16Array | Float32Array, b: Int16Array | Float32Array): boolean {
  if (a.length !== b.length) return false;
  let i = 0;
  if ((a.byteOffset & 3) === 0 && (b.byteOffset & 3) === 0) {
    const n4 = a.byteLength >> 2;
    const x = new Int32Array(a.buffer, a.byteOffset, n4), y = new Int32Array(b.buffer, b.byteOffset, n4);
    for (let k = 0; k < n4; k++) if (x[k] !== y[k]) return false;
    i = (n4 * 4) / a.BYTES_PER_ELEMENT;
  }
  for (; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
let OC: { e: number; s: GameState | null; locs: number[][]; own: Int16Array } = { e: -1, s: null, locs: [], own: new Int16Array(0) };
let DC: { e: number; s: GameState | null; dev: Float64Array; devs: Float32Array; oc: number[][] | null } = { e: -1, s: null, dev: new Float64Array(0), devs: new Float32Array(0), oc: null };
function ownerCache(s: GameState) {
  if (OC.e === EPOCH.v && OC.s === s) return OC;
  const N = s.nations.length; const o = s.loc.owner, len = o.length;
  if (OC.s === s && OC.locs.length === N && OC.own.length === len) {
    if (sameBits(OC.own, o)) { OC.e = EPOCH.v; return OC; }
  }
  const locs: number[][] = Array.from({ length: N }, () => []);
  for (let i = 0; i < len; i++) { const k = o[i]; if (k >= 0 && k < N) locs[k].push(i); }
  OC = { e: EPOCH.v, s, locs, own: Int16Array.from(o) }; return OC;
}
function devCache(s: GameState) {
  if (DC.e === EPOCH.v && DC.s === s) return DC;
  const oc = ownerCache(s); const dv = s.loc.dev, len = dv.length;
  if (DC.s === s && DC.oc === oc.locs && DC.devs.length === len) {
    if (sameBits(DC.devs, dv)) { DC.e = EPOCH.v; return DC; }
  }
  const N = s.nations.length, o = s.loc.owner; const dev = new Float64Array(N);
  for (let i = 0; i < o.length; i++) { const k = o[i]; if (k >= 0 && k < N) dev[k] += dv[i]; }
  DC = { e: EPOCH.v, s, dev, devs: Float32Array.from(dv), oc: oc.locs }; return DC;
}
/** Locations owned by n (cached per step; do not mutate the returned array). */
export function nationLocs(s: GameState, n: number): number[] { devCache(s); return ownerCache(s).locs[n]?.slice() ?? []; }
export function nationLocsRO(s: GameState, n: number): readonly number[] { devCache(s); return ownerCache(s).locs[n] ?? []; }
/** Same as nationLocsRO, in ascending order, without touching the development sums. */
export function ownedLocs(s: GameState, n: number): readonly number[] { return ownerCache(s).locs[n] ?? []; }
/** All owner lists of s at once. The table stays the same object exactly while s.loc.owner is unchanged, so its
 *  identity can key caches derived from ownership. Do not mutate. */
export function ownerTable(s: GameState): readonly (readonly number[])[] { return ownerCache(s).locs; }
// Locations by controller (index ctrl + 2, so rebels -2 and nobody -1 have lists too). Control changes without
// an EPOCH bump during the military step, so every call compares the snapshot.
let CC: { s: GameState | null; locs: number[][]; snap: Int16Array } = { s: null, locs: [], snap: new Int16Array(0) };
function ctrlCache(s: GameState) {
  const c = s.loc.ctrl;
  if (CC.s === s && CC.locs.length === s.nations.length + 2 && sameBits(CC.snap, c)) return CC;
  const locs: number[][] = Array.from({ length: s.nations.length + 2 }, () => []);
  for (let i = 0; i < c.length; i++) { const k = c[i] + 2; if (k >= 0 && k < locs.length) locs[k].push(i); }
  CC = { s, locs, snap: Int16Array.from(c) }; return CC;
}
/** Locations controlled by c (ascending; -2 = rebels). Do not mutate. */
export function ctrlLocs(s: GameState, c: number): readonly number[] { return ctrlCache(s).locs[c + 2] ?? []; }
/** All of ctrlLocs at once, indexed by controller + 2 (one check of the cache for several lookups). Do not mutate. */
export function ctrlTable(s: GameState): readonly (readonly number[])[] { return ctrlCache(s).locs; }
export function locValue(s: GameState, l: number) { return Math.max(1, s.loc.dev[l]); }
export function nationDev(s: GameState, n: number) { return devCache(s).dev[n] ?? 0; }

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
  if (na.overlord >= 0 && na.subjectType !== 'tributary' && goalType !== 'independence') return 'subjects cannot declare wars';
  if (na.overlord === b && goalType !== 'independence') return 'we pay tribute to them';
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
  // never a war inside one's own realm of subjects (independence and civil wars are fought from within on purpose)
  if (goalType !== 'independence' && goalType !== 'civil_war' && (target === a || target === topOverlord(s, a))) return 'invalid';
  const def = [target, ...subjectsOf(s, target).filter((x) => s.nations[x].subjectType !== 'tributary' && x !== a)];
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

/** Every justification a has against b (hasCasusBelli returns the first of these). */
export function casusBelliAll(s: GameState, a: number, b: number): string[] {
  const out: string[] = [];
  const na = s.nations[a], nb = s.nations[b]; if (!na || !nb) return out;
  if (hasTreaty(s, a, b, 'claim')) out.push('claim');
  if (na.rivals.includes(b)) out.push('rivalry');
  if (na.faith !== nb.faith && (na.flags.holy_war || 0) > 0) out.push('holy_war');
  if (s.flags[`cb_${a}_${b}`] && s.flags[`cb_${a}_${b}`] > s.day) out.push('fabricated');
  if (nb.excommunicated && na.faith === nb.faith) out.push('excommunicated');
  if (na.overlord === b) out.push('independence');
  const o = s.loc.owner, core = s.loc.core;
  for (let i = 0; i < o.length; i++) if (o[i] === b && core[i] === a) { out.push('reconquest'); break; }
  return out;
}

/** War score: battles + share of enemy value occupied + ticking score from the war goal. */
/** Ascending list of the locations owned by the participants of a war (only these count for the score). */
const WL = new WeakMap<War, { locs: number[][]; key: string; idx: Int32Array }>();
function warLocs(s: GameState, war: War): Int32Array {
  const locs = ownerCache(s).locs; const key = war.att.join(',') + '|' + war.def.join(',');
  const c = WL.get(war);
  if (c && c.locs === locs && c.key === key) return c.idx;
  let n = 0; const seen = new Set<number>();
  for (const p of [...war.att, ...war.def]) if (!seen.has(p)) { seen.add(p); n += locs[p]?.length ?? 0; }
  const idx = new Int32Array(n); let k = 0;
  for (const p of seen) for (const i of locs[p] ?? []) idx[k++] = i;
  idx.sort();
  WL.set(war, { locs, key, idx }); return idx;
}
export function computeScore(s: GameState, war: War): number {
  const p = scoreParts(s, war);
  return clamp(p.battles + p.occupation + p.capital + p.ticking, -100, 100);
}
/** The parts of the war score from the attackers' side (before the ±100 cap). */
export function scoreParts(s: GameState, war: War): { battles: number; occupation: number; capital: number; ticking: number } {
  const att = new Set(war.att), def = new Set(war.def);
  let defTotal = 0, defOcc = 0, attTotal = 0, attOcc = 0;
  const o = s.loc.owner, c = s.loc.ctrl;
  for (const i of warLocs(s, war)) {
    const ow = o[i]; if (ow < 0) continue;
    const v = s.loc.dev[i];
    if (def.has(ow)) { defTotal += v; if (att.has(c[i])) defOcc += v; }
    else if (att.has(ow)) { attTotal += v; if (def.has(c[i])) attOcc += v; }
  }
  const occ = (defTotal > 0 ? defOcc / defTotal : 0) * 100 - (attTotal > 0 ? attOcc / attTotal : 0) * 100;
  // capital capture
  const capD = s.nations[war.defLead]?.capital, capA = s.nations[war.attLead]?.capital;
  const cap = (capD >= 0 && att.has(c[capD]) ? 15 : 0) - (capA >= 0 && def.has(c[capA]) ? 15 : 0);
  return { battles: war.battleScore, occupation: occ * 0.75, capital: cap, ticking: war.tickScore };
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
  // a subject fighting for its freedom does not give up for nothing while the war still goes its way
  const holdOut = white && war.goal.type === 'independence' && to === war.attLead && -score > -15 && nTo.warExhaustion < 50 && !s.playerNations.includes(to);
  if (holdOut) reasons.push(['fighting_for_freedom', -30]);
  return { accept: !holdOut && sum >= 0 && (white || score >= cost * 0.8), score: holdOut ? sum - 30 : sum, reasons };
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
        transferLoc(s, w, l, recv, k++);
      }
      s.nations[recv].stats.locsGained += t.locs.length; Ln.stats.locsLost += t.locs.length;
      // Dread grows with the value taken
      const val = t.locs.reduce((p, l) => p + locValue(s, l), 0);
      s.nations[recv].dread += val * 0.35;
      parts.push(`${t.locs.length} locations (${[...new Set(t.locs.map((l) => w.provinces[w.provOf[l]]?.name))].slice(0, 3).join(', ')})`);
      partsDe.push(`${t.locs.length} Orte (${[...new Set(t.locs.map((l) => deName(w.provinces[w.provOf[l]]?.name)))].slice(0, 3).join(', ')})`);
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

export function transferLoc(s: GameState, w: World, l: number, to: number, order = 0) {
  const from = s.loc.owner[l];
  s.loc.owner[l] = to; s.loc.ctrl[l] = to; EPOCH.v++;
  s.loc.integ[l] = 0; // conquered land starts unintegrated
  s.loc.unrest[l] = Math.max(s.loc.unrest[l], 20);
  s.flags.ownershipDirty = s.day;
  (s as any).ownerChanges = (s as any).ownerChanges || [];
  (s as any).ownerChanges.push({ loc: l, day: s.day, from, to, order });
  if ((s as any).ownerChanges.length > 2000) (s as any).ownerChanges.splice(0, 1000);
  // capital lost → the court moves to a great town near the old seat (not to a distant colony)
  const fn = s.nations[from];
  if (fn && fn.capital === l) {
    let best = -1, bd = -1;
    for (let i = 0; i < w.L; i++) if (s.loc.owner[i] === from) { const v = (s.loc.dev[i] + 1) / (1 + w.distKm(l, i) / 250); if (v > bd) { bd = v; best = i; } }
    fn.capital = best;
  }
}

/** End a war between two blocs (removes participants on the losing side from this war). */
export function concludePeace(s: GameState, w: World, war: War, from: number, to: number, terms: PeaceTerm[]) {
  const fromAtt = war.att.includes(from);
  const score = computeScore(s, war) * (fromAtt ? 1 : -1);
  const winner = score >= 0 || terms.length ? from : to;
  const loser = winner === from ? to : from;
  const pre = s.nations[war.attLead], legit = s.nations[war.goal.target];
  const leadersPeace = (from === war.attLead || from === war.defLead) && (to === war.attLead || to === war.defLead);
  const civil = war.goal.type === 'civil_war' && leadersPeace && pre?.flags.pretender_of === legit?.id && legit.alive;
  // a war of succession reunites the realm, unless a vast steppe realm ends it undecided: then the khanate splits for good
  const attScore = computeScore(s, war);
  const splits = civil && Math.abs(attScore) < 20 && (legit.gov === 'nomadic_horde' || legit.gov === 'tribal_federation') && nationLocs(s, legit.id).length + nationLocs(s, pre.id).length >= 120;
  if (civil && !splits) endCivilWar(s, w, war, pre, legit, attScore > 10);
  else {
    applyPeace(s, w, war, winner, loser, terms.length ? terms : [{ type: 'white_peace' }]);
    if (splits) {
      const city = w.names[pre.capital] ?? pre.short.en, cityDe = w.namesDe[pre.capital] ?? city;
      pre.name = { en: `Khanate of ${city}`, de: `Khanat ${cityDe}` }; pre.short = { en: city, de: cityDe }; pre.adj = { en: city, de: cityDe };
      delete pre.flags.pretender_of;
      chronicle(s, pre.id, 'independence', { en: `The war of succession in ${legit.short.en} ended undecided: the ${pre.name.en} goes its own way.`, de: `Der Erbfolgekrieg in ${legit.short.de} endete unentschieden: das ${pre.name.de} geht seinen eigenen Weg.` });
    }
  }
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
    if (!s.nations[war.attLead]?.alive || !s.nations[war.defLead]?.alive || war.attLead === war.defLead) { s.wars.splice(s.wars.indexOf(war), 1); continue; }
    // nobody fights on both sides (a realm that changed overlord mid-war leaves the side it no longer belongs to)
    const both = war.att.filter((x) => war.def.includes(x));
    if (both.length) { war.att = war.att.filter((x) => !both.includes(x) || x === war.attLead); war.def = war.def.filter((x) => !both.includes(x) || x === war.defLead); }
    // ticking score: attacker holds the war-goal target or the defender's capital
    const goalLocs = war.goal.locs.length ? war.goal.locs : [];
    let held = 0; for (const l of goalLocs) if (war.att.includes(s.loc.ctrl[l])) held++;
    // the attackers' hold on the goal ticks up; it only ebbs while they are not even besieging it
    const besieging = goalLocs.length > 0 && s.sieges.some((sg) => goalLocs.includes(sg.loc) && war.att.includes(sg.nation));
    if (goalLocs.length) war.tickScore = clamp(war.tickScore + (held / goalLocs.length > 0.5 ? 1 : besieging ? 0 : -0.5), -25, 25);
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

/** A war of succession ends with one realm again: the pretender's lands return, and if the pretender prevailed,
 *  the pretender wears the crown. */
function endCivilWar(s: GameState, w: World, war: War, pre: Nation, legit: Nation, pretenderWon: boolean) {
  for (const l of nationLocs(s, pre.id)) { transferLoc(s, w, l, legit.id); s.loc.ctrl[l] = legit.id; s.loc.core[l] = legit.id; }
  for (const a of s.armies) if (a.owner === pre.id) { a.owner = legit.id; a.path = []; a.siege = -1; }
  const sides = new Set([...war.att, ...war.def]);
  for (let i = 0; i < w.L; i++) { const o = s.loc.owner[i]; if (sides.has(o) && s.loc.ctrl[i] !== o && s.loc.ctrl[i] !== -2) s.loc.ctrl[i] = o; }
  if (pretenderWon && s.chars[pre.ruler]?.alive) {
    legit.ruler = pre.ruler; legit.heir = pre.heir; legit.consort = pre.consort; legit.regent = 0;
    if (s.chars[pre.ruler]) s.chars[pre.ruler].role = 'ruler';
    legit.dynasty = pre.dynasty || legit.dynasty; legit.mandate = 40;
  } else legit.mandate = clamp(legit.mandate + 15, 0, 100);
  pre.alive = false; pre.overlord = -1;
  s.treaties = s.treaties.filter((x) => x.a !== pre.id && x.b !== pre.id);
  const r = s.chars[legit.ruler]?.name ?? '';
  const text = pretenderWon
    ? { en: `The pretender prevailed in ${legit.short.en}: ${r} now wears the crown of a reunited realm.`, de: `Der Prätendent setzte sich in ${legit.short.de} durch: ${r} trägt nun die Krone des wiedervereinten Reiches.` }
    : { en: `The pretender in ${legit.short.en} submitted; the realm is whole again under ${r}.`, de: `Der Prätendent in ${legit.short.de} unterwarf sich; das Reich ist unter ${r} wieder vereint.` };
  chronicle(s, legit.id, 'peace', text);
  for (const p of s.playerNations) if (sides.has(p)) notice(s, p, 'peace', text, { loc: legit.capital });
  s.flags.lastPeaceDay = s.day;
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
  const bare = (x: string) => x.replace(/\s*\((pretender|Prätendent)\)$/, '');
  pre.name = { en: `${bare(n.short.en)} (pretender)`, de: `${bare(n.short.de)} (Prätendent)` }; pre.short = pre.name; pre.adj = n.adj; pre.faith = n.faith; pre.gov = n.gov;
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

/** Gathering the lands: the strongest crown of a people lays claim to small neighbours of the same people
 *  (Moscow and the Rus principalities, the French crown and its great fiefs, and so on). */
function gatheringYear(s: GameState, w: World) {
  const neigh = new Map<number, Set<number>>();
  const o = s.loc.owner;
  for (let i = 0; i < w.L; i++) {
    const a = o[i]; if (a < 0) continue;
    for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) { const v = w.adj[e]; if (v >= w.L) continue; const b = o[v]; if (b >= 0 && b !== a) { let st = neigh.get(a); if (!st) neigh.set(a, (st = new Set())); st.add(b); } }
  }
  for (const n of s.nations) {
    if (!n.alive || (n.overlord >= 0 && n.subjectType !== 'tributary') || !chance(s.rng, 0.2)) continue;
    const grp = GROUP_OF[ALL_CULTURES[n.culture]]; if (!grp || grp === 'other') continue;
    const dev = nationDev(s, n.id); if (dev < 80) continue;
    for (const b of [...(neigh.get(n.id) ?? [])].sort((x, y) => x - y)) {
      const bn = s.nations[b];
      if (!bn.alive || bn.overlord === n.id || GROUP_OF[ALL_CULTURES[bn.culture]] !== grp || nationDev(s, b) > dev * 0.5) continue;
      if (hasTreaty(s, n.id, b, 'claim') || hasTreaty(s, n.id, b, 'alliance')) continue;
      s.treaties.push({ a: Math.min(n.id, b), b: Math.max(n.id, b), type: 'claim', since: s.day, until: s.day + 365 * 25 });
      break;
    }
  }
}

export const war: System = {
  id: 'war',
  monthly({ s, w }) { warsMonth(s, w); dreadMonth(s, w); },
  yearly({ s, w }) { gatheringYear(s, w); },
};
