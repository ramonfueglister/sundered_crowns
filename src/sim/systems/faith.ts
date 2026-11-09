// Faith mechanics: every faith in FAITHS has a mechanic of its own (spec point 78). Most of them work through a
// labelled modifier that this system refreshes each month (ids starting with "faith_"), so the effect shows in the
// realm's list of modifiers and in every breakdown that reads modifiers. The rest hook into the systems they change:
//   latin       Curia favour raises the Mandate; excommunication (diplomacy.ts) frees vassals and fellow Latins to attack
//   orthodox    the protector of the Patriarch's seat gains Mandate and Concord; if infidels take the seat, the
//               patriarchal authority passes to the strongest Orthodox realm
//   sunni       the protector of the holy cities gains Mandate and prestige; pilgrim caravans (decision) give Concord
//   shia        each shrine city held raises Concord and conversion
//   ibadi       a ruler who has lost the Mandate is replaced by an elected imam instead of facing revolt
//   jewish      tolerated Jewish communities raise trade and lower interest; persecution drives them to tolerant lands
//   tengri      a second faith can be embraced (decision): its land is no longer foreign (economy, society)
//   baltic_old  homeland defence in battle (military.ts); baptism of the ruler is a decision (decisions.ts)
//   finnic_old, sami_old  less attrition on home ground (military.ts)
//   coptic      Coptic land converts slowly (society.ts); Coptic scribes raise the tax of the realm they live in
//   ethiopian   the Mandate rests on the sacred line: an old dynasty gains, a new one loses
//   church_of_east  communities on trade routes (towns, markets and ports) raise trade
//   armenian_apostolic  Armenian communities anywhere in the realm raise trade
//   african_traditional  the Mandate grows with the age of the ruling dynasty
//   american_traditional homeland defence in battle
//   mesoamerican every battle won raises the Mandate (captives for the sacred calendar)
//   andean      labour duty: buildings are finished faster (commands.ts)
//   bosnian_church  tolerant (little unrest from other faiths), but Latin and Orthodox realms think less of it
//   syriac_orthodox Syriac land converts slowly; its scholars raise research
//   hindu       every temple (church building level) raises Mandate and Concord
//   hussite     homeland defence and morale in battle
//   evangelical princes can seize church lands (decision): gold and Authority, the prelates are angered
//   reformed    burghers prosper: trade and production
//   anglican_type the crown heads the church: Mandate and Authority
import type { GameState, Nation, I18n } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice } from '../ctx';
import { FAITHS, FAITH_INDEX } from '../content/peoples';
import { B, BI } from '../defs';
import { lawEffect, newChar, pickNewHeir } from './politics';
import { ownedLocs, nationDev } from './war';

const F = FAITH_INDEX;
export const MECH = (id: string): I18n => FAITHS[F[id]]?.mechanic ?? { en: id, de: id };
/** Faiths whose land resists conversion (agents work at this fraction of their usual pace). */
export const SLOW_CONVERSION: Record<number, number> = { [F.coptic]: 0.4, [F.syriac_orthodox]: 0.4 };

/** Set (or replace) a faith modifier that lasts until the next monthly refresh. */
function put(s: GameState, n: Nation, id: string, label: I18n, effects: Record<string, number>) {
  const fx: Record<string, number> = {};
  for (const k in effects) if (Math.abs(effects[k]) > 1e-9) fx[k] = effects[k];
  const old = n.modifiers.find((m) => m.id === id);
  if (!Object.keys(fx).length) { if (old) n.modifiers = n.modifiers.filter((m) => m !== old); return; }
  if (old) { old.until = s.day + 45; old.label = label; old.effects = fx; return; }
  n.modifiers.push({ id, until: s.day + 45, label, effects: fx });
}
function drop(n: Nation, id: string) { if (n.modifiers.some((m) => m.id === id)) n.modifiers = n.modifiers.filter((m) => m.id !== id); }

const NAMES = new WeakMap<World, Map<string, number>>();
export function locByName(w: World, name: string): number {
  let m = NAMES.get(w);
  if (!m) { m = new Map(); for (let i = 0; i < w.L; i++) if (!m.has(w.names[i])) m.set(w.names[i], i); NAMES.set(w, m); }
  return m.get(name) ?? -1;
}
/** The sovereign who answers for a location: its owner, or the owner's overlord if the owner is a subject. */
function sovereignOf(s: GameState, l: number): number {
  const o = s.loc.owner[l]; if (o < 0) return -1;
  const n = s.nations[o];
  return n.overlord >= 0 && n.subjectType !== 'tributary' && s.nations[n.overlord]?.alive ? n.overlord : o;
}
/** Stable number for a dynasty name (dynasties are strings; flags hold numbers). */
function dynHash(x: string): number { let h = 7; for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) | 0; return h; }
/** Years the ruling dynasty has held the throne (realms that existed at the start count as long established). */
export function dynastyYears(s: GameState, n: Nation): number {
  const h = dynHash(n.dynasty || '');
  if (n.flags.dyn_h === undefined) { n.flags.dyn_h = h; n.flags.dyn_since = s.day - (s.day === 0 ? 40 * 365 : 0); }
  else if (n.flags.dyn_h !== h) { n.flags.dyn_h = h; n.flags.dyn_since = s.day; }
  return (s.day - (n.flags.dyn_since ?? s.day)) / 365;
}

// ---------------- the Orthodox patriarchate ----------------
/** The realm that protects the Patriarch (s.flags.patriarch), kept up to date: the Orthodox holder of the seat, or,
 *  once infidels hold it, the strongest Orthodox realm (the authority stays there while that realm stands). */
export function patriarchProtector(s: GameState, w: World): number {
  const seat = locByName(w, 'Constantinople');
  if (seat >= 0) {
    const sov = sovereignOf(s, seat);
    if (sov >= 0 && s.nations[sov].faith === F.orthodox) { s.flags.patriarch = sov; s.flags.patriarch_seat_lost = 0; return sov; }
    const own = s.loc.owner[seat];
    if (own >= 0 && s.nations[own].faith === F.orthodox) { s.flags.patriarch = own; s.flags.patriarch_seat_lost = 0; return own; }
  }
  const cur = s.flags.patriarch ?? -1;
  if (!s.flags.patriarch_seat_lost) { s.flags.patriarch_fallen = cur; s.flags.patriarch_seat_lost = 1; } // the seat has just fallen: its protector loses the authority
  else if (cur >= 0 && s.nations[cur]?.alive && s.nations[cur].faith === F.orthodox && cur !== s.flags.patriarch_fallen) return cur;
  // the seat is in infidel hands: the authority passes to the strongest other Orthodox sovereign realm
  let best = -1, bv = -Infinity;
  for (const n of s.nations) if (n.alive && n.faith === F.orthodox && n.overlord < 0 && n.id !== s.flags.patriarch_fallen && n.score > bv) { bv = n.score; best = n.id; }
  if (best !== cur && best >= 0) {
    const b = s.nations[best];
    chronicle(s, best, 'faith', { en: `With the patriarchal seat in infidel hands, the Orthodox world looked to ${b.short.en} as its protector.`, de: `Da der Sitz des Patriarchen in der Hand Ungläubiger ist, blickt die orthodoxe Welt auf ${b.short.de} als ihren Schutzherrn.` });
  }
  s.flags.patriarch = best;
  return best;
}

// ---------------- communities living in a realm ----------------
interface Census { jewish: number; coptic: number; syriac: number; armenian: number; eastRoute: number; temples: number; shrines: number; holy: number }
const SHRINES = ['Karbala', 'Najaf', 'Mashhad'];
const HOLY_CITIES = ['Mecca', 'Medina'];
function census(s: GameState, w: World): Census[] {
  const out: Census[] = s.nations.map(() => ({ jewish: 0, coptic: 0, syriac: 0, armenian: 0, eastRoute: 0, temples: 0, shrines: 0, holy: 0 }));
  const lc = s.loc;
  for (let i = 0; i < w.L; i++) {
    const o = lc.owner[i]; if (o < 0) continue;
    const c = out[o]; const f = lc.faith[i], mf = lc.minShare[i] > 0.02 ? lc.minFaith[i] : -1;
    if (f === F.jewish || mf === F.jewish) c.jewish++;
    if (f === F.coptic || mf === F.coptic) c.coptic++;
    if (f === F.syriac_orthodox || mf === F.syriac_orthodox) c.syriac++;
    if (f === F.armenian_apostolic || mf === F.armenian_apostolic) c.armenian++;
    if ((f === F.church_of_east || mf === F.church_of_east) && (w.coastal[i] || w.townSize[i] > 0 || lc.buildings[i * B + BI.market] > 0 || isHub(s, i))) c.eastRoute++;
    if (lc.faith[i] === s.nations[o].faith) c.temples += lc.buildings[i * B + BI.church];
  }
  for (const nm of SHRINES) { const l = locByName(w, nm); if (l >= 0 && lc.owner[l] >= 0) out[lc.owner[l]].shrines++; }
  for (const nm of HOLY_CITIES) { const l = locByName(w, nm); const sv = l >= 0 ? sovereignOf(s, l) : -1; if (sv >= 0) out[sv].holy++; }
  return out;
}
function isHub(s: GameState, l: number) { for (const m of s.markets) if (m.hub === l) return true; return false; }

/** Effects of the realm's faith and of the communities living in it, as [modifier id, label, effects]. */
export function faithEffects(s: GameState, w: World, n: Nation, c: Census): [string, I18n, Record<string, number>][] {
  const out: [string, I18n, Record<string, number>][] = [];
  const f = FAITHS[n.faith]?.id;
  switch (f) {
    case 'latin': {
      const fav = s.papacy.curiaFavour[n.id] ?? 0;
      out.push(['faith_latin', MECH('latin'), { mandate: Math.round(fav / 10) }]);
      break;
    }
    case 'orthodox':
      if (s.flags.patriarch === n.id) out.push(['faith_orthodox', MECH('orthodox'), { mandate: 8, concord: 6 }]); // see patriarchProtector
      break;
    case 'sunni':
      if (c.holy > 0 && n.overlord < 0) out.push(['faith_sunni', MECH('sunni'), { mandate: 5 * c.holy }]);
      break;
    case 'shia': if (c.shrines > 0) out.push(['faith_shia', MECH('shia'), { concord: 3 * c.shrines, conversion: 0.1 * c.shrines }]); break;
    case 'ibadi': out.push(['faith_ibadi', MECH('ibadi'), { unrest: -1 }]); break;
    case 'baltic_old': out.push(['faith_baltic_old', MECH('baltic_old'), { home_defence: 0.25, fort_strength: 0.1 }]); break;
    case 'finnic_old': case 'sami_old': out.push([`faith_${f}`, MECH(f), { home_attrition: -0.4 }]); break;
    case 'ethiopian': {
      const y = dynastyYears(s, n);
      out.push(['faith_ethiopian', MECH('ethiopian'), { mandate: y >= 25 ? 10 : -8 }]);
      break;
    }
    case 'african_traditional': out.push(['faith_african_traditional', MECH('african_traditional'), { mandate: Math.round(Math.min(10, dynastyYears(s, n) / 5)) }]); break;
    case 'american_traditional': out.push(['faith_american_traditional', MECH('american_traditional'), { home_defence: 0.3 }]); break;
    case 'andean': out.push(['faith_andean', MECH('andean'), { build_time: -0.3 }]); break;
    case 'bosnian_church': out.push(['faith_bosnian_church', MECH('bosnian_church'), { tolerance: 0.5 }]); break;
    case 'hindu': if (c.temples > 0) out.push(['faith_hindu', MECH('hindu'), { mandate: Math.min(10, c.temples), concord: Math.min(10, c.temples) }]); break;
    case 'hussite': out.push(['faith_hussite', MECH('hussite'), { home_defence: 0.35, home_morale: 0.25 }]); break;
    case 'reformed': out.push(['faith_reformed', MECH('reformed'), { trade: 0.1, production: 0.05 }]); break;
    case 'anglican_type': out.push(['faith_anglican_type', MECH('anglican_type'), { mandate: 6, authority_gain: 0.2 }]); break;
  }
  // communities of other faiths whose gifts serve the realm they live in
  if (c.jewish > 0) {
    const tol = lawEffect(n, 'tolerance');
    if (tol >= 0.2 || n.faith === F.jewish) out.push(['faith_jewish', MECH('jewish'), { trade: Math.min(0.08, 0.01 * c.jewish), interest: -Math.min(0.02, 0.004 * c.jewish) }]);
  }
  if (c.coptic > 0) out.push(['faith_coptic', MECH('coptic'), { tax: Math.min(0.05, 0.005 * c.coptic) }]);
  if (c.syriac > 0) out.push(['faith_syriac_orthodox', MECH('syriac_orthodox'), { research: Math.min(0.05, 0.01 * c.syriac) }]);
  if (c.armenian > 0) out.push(['faith_armenian_apostolic', MECH('armenian_apostolic'), { trade: Math.min(0.08, 0.008 * c.armenian) }]);
  if (c.eastRoute > 0) out.push(['faith_church_of_east', MECH('church_of_east'), { trade: Math.min(0.1, 0.02 * c.eastRoute) }]);
  return out;
}
const ALL_IDS = new Set(FAITHS.map((x) => `faith_${x.id}`));

function faithMonth(s: GameState, w: World) {
  patriarchProtector(s, w);
  const cs = census(s, w);
  for (const n of s.nations) {
    if (!n.alive) continue;
    const fx = faithEffects(s, w, n, cs[n.id]);
    const keep = new Set<string>();
    for (const [id, label, e] of fx) { put(s, n, id, label, e); keep.add(id); }
    for (const m of n.modifiers.slice()) if (ALL_IDS.has(m.id) && !keep.has(m.id)) drop(n, m.id);
    if (n.faith === F.ibadi) imamElection(s, w, n);
    if (n.faith === F.mesoamerican) captives(s, n);
  }
}

/** Ibadi: a ruler who has lost the Mandate is replaced by an imam the community elects for his piety. */
export function imamElection(s: GameState, w: World, n: Nation) {
  if (n.mandate >= 25 || (n.flags.imam_elected ?? -1e9) > s.day - 365 * 5 || n.overlord >= 0) return;
  const old = s.chars[n.ruler];
  if (old) { old.role = 'courtier'; }
  const c = newChar(s, n, { born: s.day - Math.floor(45 * 365), role: 'ruler', female: false, skills: [3, 4, 2], traits: ['pious'], dynasty: n.dynasty });
  n.ruler = c.id; n.regent = 0; pickNewHeir(s, n);
  n.mandate = 60; n.concord = clamp(n.concord + 10, -100, 100);
  n.flags.imam_elected = s.day;
  chronicle(s, n.id, 'succession', { en: `The community of ${n.short.en} deposed its ruler and elected ${c.name} as imam.`, de: `Die Gemeinde von ${n.short.de} setzte ihren Herrscher ab und wählte ${c.name} zum Imam.` });
  notice(s, n.id, 'succession', { en: `Our ruler lost the trust of the community: ${c.name} was elected imam.`, de: `Unser Herrscher verlor das Vertrauen der Gemeinde: ${c.name} wurde zum Imam gewählt.` }, { loc: n.capital });
  void w;
}
/** Mesoamerican: captives taken in victorious battles feed the sacred calendar and raise the Mandate. */
export function captives(s: GameState, n: Nation) {
  const won = n.stats.battlesWon, seen = n.flags.captives_seen ?? won;
  if (won > seen) n.mandate = clamp(n.mandate + Math.min(10, 3 * (won - seen)), 0, 100);
  n.flags.captives_seen = won;
}

/** Jewish communities leave realms that persecute them for tolerant neighbours. */
function migrationYear(s: GameState, w: World) {
  const lc = s.loc;
  for (let i = 0; i < w.L; i++) {
    if (lc.minFaith[i] !== F.jewish || lc.minShare[i] <= 0.02) continue;
    const o = lc.owner[i]; if (o < 0) continue;
    const n = s.nations[o];
    if (n.faith === F.jewish || lawEffect(n, 'tolerance') >= 0.2) continue;
    const moved = Math.min(lc.minShare[i], 0.04);
    lc.minShare[i] -= moved;
    // the nearest market town of a tolerant realm takes them in
    let best = -1, bd = Infinity;
    for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) {
      const v = w.adj[e]; if (v >= w.L) continue;
      for (let e2 = w.adjStart[v]; e2 < w.adjStart[v + 1]; e2++) {
        const u = w.adj[e2]; if (u >= w.L || u === i) continue;
        const ou = lc.owner[u]; if (ou < 0 || ou === o) continue;
        if (lawEffect(s.nations[ou], 'tolerance') < 0.2 && s.nations[ou].faith !== F.jewish) continue;
        if (lc.minShare[u] > 0.02 && lc.minFaith[u] !== F.jewish) continue;
        const d = w.distKm(i, u) - w.townSize[u] * 50;
        if (d < bd) { bd = d; best = u; }
      }
    }
    if (best >= 0) {
      if (lc.minFaith[best] !== F.jewish) { lc.minFaith[best] = F.jewish; lc.minCulture[best] = lc.minCulture[i]; lc.minShare[best] = 0; }
      lc.minShare[best] = Math.min(0.3, lc.minShare[best] + moved);
    }
  }
}

/** A Sunni protector of the holy cities gains prestige every year. */
function holyCitiesYear(s: GameState, w: World) {
  for (const nm of HOLY_CITIES) {
    const l = locByName(w, nm); const sv = l >= 0 ? sovereignOf(s, l) : -1;
    if (sv >= 0 && s.nations[sv].faith === F.sunni) s.nations[sv].prestige = clamp(s.nations[sv].prestige + 2, -100, 100);
  }
}

/** Second faith of a Tengri realm (index), or -1. */
export function secondFaith(n: Nation): number { return n.faith === F.tengri && n.flags.second_faith ? n.flags.second_faith - 1 : -1; }
/** Whether land of faith f counts as the realm's own faith (the realm's faith, or a Tengri realm's second faith). */
export function ownFaith(n: Nation, f: number): boolean { return f === n.faith || f === secondFaith(n); }

export const faith: System = {
  id: 'faith',
  init(s, w) { for (const n of s.nations) dynastyYears(s, n); faithMonth(s, w); },
  monthly({ s, w }) { faithMonth(s, w); },
  yearly({ s, w }) { migrationYear(s, w); holyCitiesYear(s, w); },
};
void nationDev; void ownedLocs;
