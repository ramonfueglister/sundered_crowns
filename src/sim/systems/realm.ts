// Realm-level bookkeeping: construction, great-power ranking, scores, history, timelapse, the Empire and the Papacy.
import type { GameState, Nation } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice, addOpinion } from '../ctx';
import { B, BI, BUILDINGS, C, UNITS } from '../defs';
import { armyStrength, releaseNation, newArmy, availableUnits, greatGuns, khanFaith } from './military';
import { nationLocsRO, nationDev } from './war';
import { FAITH_INDEX } from '../content/peoples';
import { chance, rand } from '../rng';
import { lawEffect } from './politics';

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
    if (s.playerNations.includes(c.nation)) notice(s, c.nation, 'built', { en: `${BUILDINGS[c.building].name.en} completed in ${w.names[c.loc]}.`, de: `${BUILDINGS[c.building].name.de} in ${w.namesDe[c.loc]} fertiggestellt.` }, { loc: c.loc });
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
  // men under arms per realm, for the history graphs (sampled with the history below)
  const sample = s.day % 90 < 31; let men: Float64Array | null = null;
  if (sample) { men = new Float64Array(s.nations.length); for (const a of s.armies) if (!a.rebels && !a.fleet && a.owner >= 0 && a.owner < men.length) for (const r of a.regs) men[a.owner] += r.men; }
  for (const n of s.nations) {
    if (!n.alive) { n.score = 0; continue; }
    const x = st[n.id];
    let sub = 0; for (const o of s.nations) if (o.alive && o.overlord === n.id) sub += st[o.id].dev * 0.5;
    n.score = x.dev + sub + x.army / 4000 + x.navy / 400 + Math.max(0, n.prestige) * 2 + Math.min(100, Math.max(0, n.treasury) / (500 * s.priceLevel));
    // monthly history (for graphs)
    if (sample) {
      n.history.push({ day: s.day, treasury: n.treasury, income: Object.values(n.income).reduce((p, v) => p + v, 0), expense: Object.values(n.expense).reduce((p, v) => p + v, 0), manpower: n.manpower, locs: x.locs, pop: x.pop, dev: x.dev, army: Math.round(men![n.id]), score: Math.round(n.score * 10) / 10 });
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
// the election, imperial authority, the diet and the league: systems/empire.ts

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
/** Favour with the Curia a Latin realm gains a year: 1, plus up to 2 from content prelates, plus curia effects
 *  (clerical immunity pleases Rome, taxing the clergy angers it). */
export function curiaGain(n: Nation): number {
  return 1 + (n.estates.find((e) => e.id === 'prelates')?.contentment ?? 50) / 50 + lawEffect(n, 'curia');
}
function papacyYear(s: GameState) {
  const P = s.papacy;
  for (const n of s.nations) {
    if (!n.alive || n.faith !== FAITH_INDEX.latin) { delete P.curiaFavour[n.id]; continue; }
    P.curiaFavour[n.id] = clamp((P.curiaFavour[n.id] || 0) + curiaGain(n), 0, 100);
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
  chronicle(s, target, 'excommunication', { en: `The ruler of ${t.short.en} was excommunicated at the urging of ${n.short.en}.`, de: `Der Herrscher von ${t.short.de} wurde auf Betreiben von ${n.short.de} exkommuniziert.` }, undefined, [by]);
  return null;
}

/** How far the steppe order of a horde has faded (0 to 1.5, kept on the horde by steppeYear). */
export function steppeFade(h: Nation): number { return h.gov === 'nomadic_horde' ? h.flags.steppe_fade ?? 0 : 0; }
/** The steppe order fades as the settled realms around a horde cast great guns that its riders cannot match (the share
 *  of its settled neighbours, by development, that have them), and further once the ocean routes are open and
 *  the caravan trade turns to the sea (+0.5). A horde's grip loosens: less tax and morale, more unrest, and its
 *  tributaries strain harder to be free (see libertyParts). Nothing is decided by it: a horde that keeps winning its
 *  wars can still hold together. */
function steppeYear(s: GameState, w: World) {
  const own = s.loc.owner;
  for (const n of s.nations) {
    if (!n.alive) continue;
    n.modifiers = n.modifiers.filter((m) => m.id !== 'steppe_fading');
    if (n.gov !== 'nomadic_horde') { delete n.flags.steppe_fade; continue; }
    const seen = new Set<number>(); let tot = 0, armed = 0;
    for (const l of nationLocsRO(s, n.id)) for (let e = w.adjStart[l]; e < w.adjStart[l + 1]; e++) {
      const v = w.adj[e]; if (v >= w.L) continue;
      const o = own[v]; if (o < 0 || o === n.id || seen.has(o)) continue;
      seen.add(o);
      const x = s.nations[o]; if (!x.alive || x.gov === 'nomadic_horde') continue;
      const d = nationDev(s, o); tot += d; if (greatGuns(x)) armed += d;
    }
    const k = Math.round(((tot > 0 ? armed / tot : 0) + (s.flags.ocean_open || s.flags.west_route_found ? 0.5 : 0)) * 10) / 10;
    n.flags.steppe_fade = k;
    if (k <= 0) continue;
    n.modifiers.push({ id: 'steppe_fading', until: s.day + 400, label: { en: 'The steppe order fades', de: 'Die Ordnung der Steppe verblasst' }, effects: { tax: -0.08 * k, morale: -0.08 * k, unrest: 2 * k } });
  }
}

/** A great horde sheds its far lands as khanates of their own (as Kazan, Crimea and Astrakhan broke from the Great
 *  Horde) once its order has faded (see steppeYear): a horde of 200 or more places at peace may lose the largest block
 *  of land far from its seat, the likelier the more restless that land is. */
function steppeSplitYear(s: GameState, w: World) {
  for (const h of s.nations.slice()) {
    if (!h.alive || h.gov !== 'nomadic_horde' || h.capital < 0 || h.overlord >= 0 || s.playerNations.includes(h.id) || h.playerId) continue;
    if (steppeFade(h) < 0.3) continue;
    const locs = nationLocsRO(s, h.id); if (locs.length < 200) continue;
    if (s.wars.some((x) => x.att.includes(h.id) || x.def.includes(h.id))) continue;
    // the far lands in four quarters around the seat: the fullest quarter breaks away
    const cap = h.capital; const q: number[][] = [[], [], [], []];
    for (const l of locs) {
      if (l === cap || s.loc.ctrl[l] !== h.id || w.distKm(l, cap) < 400) continue;
      const dx = w.lon[l] - w.lon[cap], dy = w.lat[l] - w.lat[cap];
      q[Math.abs(dx) * 0.6 > Math.abs(dy) ? (dx < 0 ? 0 : 1) : (dy > 0 ? 2 : 3)].push(l);
    }
    let g = q[0]; for (const x of q) if (x.length > g.length) g = x;
    if (g.length < 15) continue;
    // the far land breaks away the more readily the more restless it is (about one year in ten at an unrest of 20)
    let unrest = 0; for (const l of g) unrest += s.loc.unrest[l];
    if (!chance(s.rng, clamp((unrest / g.length - 15) / 50, 0, 0.3))) continue;
    g = g.slice().sort((a, b) => s.loc.dev[b] - s.loc.dev[a] || a - b);
    // the horde's troops in the breakaway lands fall back to its seat
    for (const a of s.armies) if (a.owner === h.id && g.includes(a.loc)) { a.path = []; a.siege = -1; if (!a.fleet && !a.battle && !a.embarkedOn) { a.loc = cap; a.retreating = false; } }
    const nn = releaseNation(s, w, h, g, h.culture, khanFaith(s, h, g)); // the khanate's own faith, set before its arms are drawn
    const town = w.names[g[0]], townDe = w.namesDe[g[0]];
    nn.name = { en: `Khanate of ${town}`, de: `Khanat ${townDe}` }; nn.short = { en: town, de: townDe }; nn.adj = { en: town, de: townDe };
    nn.rank = 'kingdom'; nn.gov = h.gov; nn.treasury = 100; nn.flags.horde_successor = 1;
    nn.rivals = [h.id]; if (!h.rivals.includes(nn.id)) h.rivals.push(nn.id);
    let pop = 0; for (const l of g) for (let c = 0; c < C; c++) pop += s.loc.pop[l * C + c];
    nn.maxManpower = pop * 0.012; nn.manpower = nn.maxManpower * 0.4;
    const u = availableUnits(s, nn, false);
    const ha = UNITS.findIndex((x) => x.id === 'horse_archers'), lv = UNITS.findIndex((x) => x.id === 'levy');
    const cav = u.includes(ha) ? ha : u.find((i) => UNITS[i].kind === 'cav') ?? u[0];
    const foot = u.includes(lv) ? lv : u.find((i) => UNITS[i].kind === 'inf') ?? u[0];
    const men = Math.min(Math.max(3000, nn.maxManpower * 0.2), Math.max(2000, nn.maxManpower));
    if (cav !== undefined && foot !== undefined) newArmy(s, nn.id, g[0], [{ type: cav, men: Math.round(men * 0.6) }, { type: foot, men: Math.round(men * 0.4) }]);
    chronicle(s, nn.id, 'independence', { en: `${h.short.en} lost its far lands: a khan of their own now rules from ${town}.`, de: `${h.short.de} verlor seine fernen Länder: Ein eigener Khan herrscht nun von ${townDe} aus.` }, g[0], [h.id]);
    for (const p of s.playerNations) notice(s, p, 'independence', { en: `The ${nn.name.en} broke away from ${h.short.en}.`, de: `Das ${nn.name.de} hat sich von ${h.short.de} gelöst.` }, { loc: g[0] });
  }
}

export const realm: System = {
  id: 'realm',
  init(s, w) { empireInit(s); papacyInit(s, w); rankingMonth(s, w); timelapseYear(s, w); },
  daily({ s, w }) { constructionsDay(s, w); },
  monthly({ s, w }) { rankingMonth(s, w); },
  yearly({ s, w }) { timelapseYear(s, w); papacyYear(s); steppeYear(s, w); steppeSplitYear(s, w); },
};
void BI;
