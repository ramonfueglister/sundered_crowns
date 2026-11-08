// Realm-level bookkeeping: construction, great-power ranking, scores, history, timelapse, the Empire and the Papacy.
import type { GameState, Nation } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice, addOpinion } from '../ctx';
import { B, BI, BUILDINGS, C } from '../defs';
import { armyStrength } from './military';
import { FAITH_INDEX } from '../content/peoples';
import { chance, rand } from '../rng';

function constructionsDay(s: GameState, w: World) {
  for (const c of s.constructions.slice()) {
    if (s.loc.owner[c.loc] !== c.nation) { s.constructions.splice(s.constructions.indexOf(c), 1); continue; }
    if (s.loc.ctrl[c.loc] !== c.nation) continue; // paused under occupation
    if (--c.left > 0) continue;
    s.constructions.splice(s.constructions.indexOf(c), 1);
    const k = c.loc * B + c.building;
    s.loc.buildings[k] = Math.min(BUILDINGS[c.building].max, s.loc.buildings[k] + 1);
    if (c.building === BI.fort) s.loc.garrison[c.loc] = s.loc.buildings[k] * 1000;
    s.flags.buildingsDirty = s.day;
    if (s.playerNations.includes(c.nation)) notice(s, c.nation, 'built', { en: `${BUILDINGS[c.building].name.en} completed in ${w.names[c.loc]}.`, de: `${BUILDINGS[c.building].name.de} in ${w.names[c.loc]} fertiggestellt.` }, { loc: c.loc });
  }
}

export interface NationStats { locs: number; pop: number; dev: number; army: number; navy: number }
export function nationStats(s: GameState, w: World): NationStats[] {
  const out: NationStats[] = s.nations.map(() => ({ locs: 0, pop: 0, dev: 0, army: 0, navy: 0 }));
  const o = s.loc.owner;
  for (let i = 0; i < w.L; i++) {
    const k = o[i]; if (k < 0) continue;
    const st = out[k]; st.locs++; st.dev += s.loc.dev[i];
    for (let c = 0; c < C; c++) st.pop += s.loc.pop[i * C + c];
  }
  for (const a of s.armies) { if (a.rebels || !out[a.owner]) continue; if (a.fleet) out[a.owner].navy += armyStrength(s, a); else out[a.owner].army += armyStrength(s, a); }
  return out;
}

/** Score: weighted dev, military, prestige, wealth, subjects. Drives the great-power ranking and leaderboards. */
function rankingMonth(s: GameState, w: World) {
  const st = nationStats(s, w);
  for (const n of s.nations) {
    if (!n.alive) { n.score = 0; continue; }
    const x = st[n.id];
    let sub = 0; for (const o of s.nations) if (o.alive && o.overlord === n.id) sub += st[o.id].dev * 0.5;
    n.score = x.dev + sub + x.army / 4000 + x.navy / 400 + Math.max(0, n.prestige) * 2 + Math.min(100, Math.max(0, n.treasury) / (500 * s.priceLevel));
    // monthly history (for graphs)
    if (s.day % 90 < 31) {
      n.history.push({ day: s.day, treasury: n.treasury, income: Object.values(n.income).reduce((p, v) => p + v, 0), expense: Object.values(n.expense).reduce((p, v) => p + v, 0), manpower: n.manpower, locs: x.locs, pop: x.pop, dev: x.dev });
      if (n.history.length > 1900) n.history.splice(0, n.history.length - 1900);
    }
    if (x.locs === 0 && n.alive) {
      n.alive = false;
      chronicle(s, n.id, 'fall', { en: `${n.short.en} ceased to exist.`, de: `${n.short.de} hörte auf zu bestehen.` });
      s.armies = s.armies.filter((a) => a.owner !== n.id || !!a.rebels);
      s.treaties = s.treaties.filter((t) => t.a !== n.id && t.b !== n.id);
      for (const war of s.wars) { war.att = war.att.filter((q) => q !== n.id); war.def = war.def.filter((q) => q !== n.id); }
      s.wars = s.wars.filter((war) => war.att.length && war.def.length && s.nations[war.attLead].alive && s.nations[war.defLead].alive);
      if (s.playerNations.includes(n.id)) { s.flags.playerFell = s.day; notice(s, n.id, 'fall', { en: 'Our realm has fallen.', de: 'Unser Reich ist untergegangen.' }); }
    }
  }
  const prev = s.ranking.slice(0, 8);
  s.ranking = s.nations.filter((n) => n.alive && n.overlord < 0).sort((a, b) => b.score - a.score).slice(0, 8).map((n) => n.id);
  for (const id of s.ranking) if (!prev.includes(id) && prev.length) chronicle(s, id, 'great_power', { en: `${s.nations[id].short.en} rose among the great powers.`, de: `${s.nations[id].short.de} stieg zur Großmacht auf.` });
}

function timelapseYear(s: GameState, w: World) {
  const o = new Uint16Array(w.L);
  for (let i = 0; i < w.L; i++) o[i] = s.loc.owner[i] + 1;
  s.timelapse.push({ day: s.day, owners: o });
}

// ---------------- the Empire ----------------
const ELECTOR_KEYS = ['bohemia', 'palatinate', 'saxony', 'brandenburg', 'archbishopric_mainz', 'archbishopric_cologne', 'archbishopric_trier'];
function empireInit(s: GameState) {
  const E = s.empire;
  E.members = s.nations.filter((n) => n.isHRE).map((n) => n.id);
  E.electors = s.nations.filter((n) => n.elector || ELECTOR_KEYS.includes(n.key)).map((n) => n.id).slice(0, 7);
  for (const id of E.electors) s.nations[id].elector = true;
  const boh = s.nations.find((n) => n.key === 'bohemia');
  E.emperor = s.startYear < 1400 && boh ? boh.id : (s.nations.find((n) => n.key === 'austria')?.id ?? E.electors[0] ?? -1);
}
function empireYear(s: GameState, w: World) {
  const E = s.empire;
  E.members = s.nations.filter((n) => n.alive && n.isHRE).map((n) => n.id);
  E.electors = E.electors.filter((id) => s.nations[id]?.alive);
  const em = s.nations[E.emperor];
  if (!em?.alive || (em.flags.ruler_changed && em.flags.ruler_changed > E.lastElection)) {
    // election: electors vote by opinion, size and faith
    const cands = s.nations.filter((n) => n.alive && n.isHRE && n.overlord < 0).sort((a, b) => b.score - a.score).slice(0, 6);
    const votes = new Map<number, number>();
    for (const el of E.electors) {
      let best = -1, bv = -Infinity;
      for (const c of cands) { const v = c.score * 0.05 + (c.id === E.emperor ? 25 : 0) + (s.nations[el].faith === c.faith ? 10 : -30) + (c.id === el ? 40 : 0) + rand(s.rng) * 15; if (v > bv) { bv = v; best = c.id; } }
      if (best >= 0) votes.set(best, (votes.get(best) || 0) + 1);
    }
    const winner = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (winner !== undefined && winner !== E.emperor) {
      E.emperor = winner;
      chronicle(s, winner, 'emperor', { en: `The electors chose the ruler of ${s.nations[winner].short.en} as Emperor.`, de: `Die Kurfürsten wählten den Herrscher von ${s.nations[winner].short.de} zum Kaiser.` });
    }
    E.lastElection = s.day;
  }
  // imperial authority: peace inside the Empire raises it, wars between members lower it
  let internal = 0;
  for (const war of s.wars) if (war.att.some((x) => s.nations[x]?.isHRE) && war.def.some((x) => s.nations[x]?.isHRE)) internal++;
  E.authority = clamp(E.authority + 2 - internal * 3, 0, 100);
  if (em?.alive) em.prestige = clamp(em.prestige + 1, -100, 100);
}

// ---------------- the Papacy ----------------
function papacyInit(s: GameState, w: World) {
  const P = s.papacy;
  const ps = s.nations.find((n) => n.key === 'papal_states');
  P.holder = ps ? ps.id : -1;
  // 1309–1377 the popes reside at Avignon
  const avignon = w.names.findIndex((x, i) => i < w.L && x === 'Avignon');
  const rome = w.names.findIndex((x, i) => i < w.L && x === 'Roma' || x === 'Rome');
  P.seat = s.startYear < 1377 && avignon >= 0 ? avignon : rome;
  for (const n of s.nations) if (n.faith === FAITH_INDEX.latin) P.curiaFavour[n.id] = 10;
}
function papacyYear(s: GameState) {
  const P = s.papacy;
  for (const n of s.nations) {
    if (!n.alive || n.faith !== FAITH_INDEX.latin) { delete P.curiaFavour[n.id]; continue; }
    P.curiaFavour[n.id] = clamp((P.curiaFavour[n.id] || 0) + 1 + (n.estates.find((e) => e.id === 'prelates')?.contentment ?? 50) / 50, 0, 100);
    if (n.excommunicated && chance(s.rng, 0.15)) { n.excommunicated = false; n.modifiers = n.modifiers.filter((m) => m.id !== 'excommunicated'); }
  }
  P.corruption = clamp(P.corruption + 0.3, 0, 100);
  P.reformPressure = clamp(P.reformPressure + P.corruption * 0.004 + (P.schism ? 0.5 : 0), 0, 100);
}
export function excommunicate(s: GameState, by: number, target: number): string | null {
  const P = s.papacy; const n = s.nations[by], t = s.nations[target];
  if (!t || t.faith !== FAITH_INDEX.latin) return 'not of the Latin church';
  if ((P.curiaFavour[by] || 0) < 50) return 'not enough favour with the Curia';
  P.curiaFavour[by] -= 50; t.excommunicated = true;
  t.modifiers.push({ id: 'excommunicated', until: s.day + 365 * 10, label: { en: 'Excommunicated', de: 'Exkommuniziert' }, effects: { mandate_gain: -0.5, concord_gain: -0.3 } });
  for (const o of s.nations) if (o.alive && o.faith === FAITH_INDEX.latin && o.id !== target) addOpinion(s, o.id, target, 'excommunicated', -25, 365 * 10);
  chronicle(s, target, 'excommunication', { en: `The ruler of ${t.short.en} was excommunicated at the urging of ${n.short.en}.`, de: `Der Herrscher von ${t.short.de} wurde auf Betreiben von ${n.short.de} exkommuniziert.` });
  return null;
}

export const realm: System = {
  id: 'realm',
  init(s, w) { empireInit(s); papacyInit(s, w); rankingMonth(s, w); timelapseYear(s, w); },
  daily({ s, w }) { constructionsDay(s, w); },
  monthly({ s, w }) { rankingMonth(s, w); },
  yearly({ s, w }) { timelapseYear(s, w); empireYear(s, w); papacyYear(s); },
};
void BI;
