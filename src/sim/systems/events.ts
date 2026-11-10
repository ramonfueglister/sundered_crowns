// Event engine: data-driven events with triggers, mean-time-to-happen and choices; decisions players can take.
// Content lives in src/sim/content/events/*.ts and src/sim/content/decisions.ts.
import { techBase } from './progress';
import type { GameState, Nation, I18n } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice, addOpinion, atWar, hasTreaty, allies } from '../ctx';
import { B, C, CL } from '../defs';
import { chance, rand, pick } from '../rng';
import { acceptProposal } from './diplomacy';
import { declareWar, nationLocs, nationDev } from './war';
import { estate } from './politics';
import { dayToDate } from '../calendar';
import { EVENTS } from '../content/events';
import { aiRecord } from './ai_log';
import { localName } from '../content/names';
import { DECISIONS } from '../content/decisions';

export interface EvApi {
  s: GameState; w: World; n: Nation; ctx: Record<string, number>; year: number; month: number;
  fx: Effects;
}
export interface EventOption { label: I18n; effect: (e: EvApi) => void; ai?: number | ((e: EvApi) => number); hint?: I18n }
export interface EventDef {
  id: string; title: I18n; text: I18n;
  mtth: number;                      // mean months to happen while the trigger holds
  trigger: (e: EvApi) => boolean;
  setup?: (e: EvApi) => boolean;     // choose locations / other realms into ctx; false aborts
  once?: boolean;                    // only once in the whole world
  oncePer?: boolean;                 // only once per realm
  cooldown?: number;                 // years before it can fire again for the same realm
  minYear?: number; maxYear?: number;
  options: EventOption[];
  art?: string;                      // illustration key (generated, see src/ui/art.ts)
  major?: boolean;                   // shown as a large popup / chronicle entry
}
export interface DecisionDef {
  id: string; name: I18n; desc: I18n;
  visible: (e: EvApi) => boolean;
  can: (e: EvApi) => string | I18n | null;  // null = allowed, otherwise the reason (English key of src/sim/refusals.ts, or I18n when it names a realm)
  effect: (e: EvApi) => void;
  ai?: (e: EvApi) => boolean;        // AI takes it when allowed and this returns true
  once?: boolean;                    // once per realm
}

/** Effects helpers used by content. Every mutation an event does should go through these so tooltips can describe them. */
export class Effects {
  constructor(private e: () => EvApi) {}
  get n() { return this.e().n; } get s() { return this.e().s; }
  concord(v: number) { this.n.concord = clamp(this.n.concord + v, -100, 100); }
  mandate(v: number) { this.n.mandate = clamp(this.n.mandate + v, 0, 100); }
  authority(v: number) { this.n.authority = Math.max(0, this.n.authority + v); }
  prestige(v: number) { this.n.prestige = clamp(this.n.prestige + v, -100, 100); }
  /** gold in months of tax income (negative = cost) */
  gold(months: number) { this.n.treasury += Math.max(10, this.n.income.tax || 10) * months; }
  goldFlat(v: number) { this.n.treasury += v * this.s.priceLevel; }
  manpower(frac: number) { this.n.manpower = clamp(this.n.manpower + this.n.maxManpower * frac, 0, this.n.maxManpower); }
  warExhaustion(v: number) { this.n.warExhaustion = clamp(this.n.warExhaustion + v, 0, 100); }
  inflation(v: number) { this.n.inflation = Math.max(0, this.n.inflation + v); }
  corruption(v: number) { this.n.corruption = clamp(this.n.corruption + v, 0, 1); }
  estate(id: string, contentment: number, influence = 0) { const es = this.n.estates.find((x) => x.id === id); if (es) { es.contentment = clamp(es.contentment + contentment, 0, 100); es.influence = clamp(es.influence + influence, 5, 100); } }
  value(axis: number, v: number) { this.n.values[axis] = clamp((this.n.values[axis] || 0) + v, -100, 100); }
  modifier(id: string, years: number, label: I18n, effects: Record<string, number>) {
    this.n.modifiers = this.n.modifiers.filter((m) => m.id !== id);
    this.n.modifiers.push({ id, until: this.s.day + Math.round(years * 365), label, effects });
  }
  removeModifier(id: string) { this.n.modifiers = this.n.modifiers.filter((m) => m.id !== id); }
  flag(k: string, v = 1) { this.n.flags[k] = v; }
  worldFlag(k: string, v = 1) { this.s.flags[k] = v; }
  opinion(other: number, v: number, years = 5, id = 'event') { if (other >= 0) addOpinion(this.s, other, this.n.id, id, v, years * 365, true); }
  myOpinion(other: number, v: number, years = 5, id = 'event') { if (other >= 0) addOpinion(this.s, this.n.id, other, id, v, years * 365, true); }
  unrest(loc: number, v: number) { if (loc >= 0) this.s.loc.unrest[loc] = clamp(this.s.loc.unrest[loc] + v, 0, 100); }
  unrestAll(v: number) { const o = this.s.loc.owner; for (let i = 0; i < o.length; i++) if (o[i] === this.n.id) this.s.loc.unrest[i] = clamp(this.s.loc.unrest[i] + v, 0, 100); }
  dev(loc: number, v: number) { if (loc >= 0) this.s.loc.dev[loc] = Math.max(1, this.s.loc.dev[loc] + v); }
  pop(loc: number, frac: number) { if (loc < 0) return; for (let c = 0; c < C; c++) this.s.loc.pop[loc * C + c] *= 1 + frac; }
  devastate(loc: number, v: number) { if (loc >= 0) this.s.loc.devast[loc] = clamp(this.s.loc.devast[loc] + v, 0, 1); }
  building(loc: number, b: number, d = 1) { if (loc >= 0) { const k = loc * B + b; this.s.loc.buildings[k] = Math.max(0, this.s.loc.buildings[k] + d); } }
  faithAt(loc: number, faith: number) { if (loc >= 0) { this.s.loc.minFaith[loc] = this.s.loc.faith[loc]; this.s.loc.minShare[loc] = 0.25; this.s.loc.faith[loc] = faith; } }
  convertRealm(faith: number) { this.n.faith = faith; }
  plague(loc: number, v = 0.8) { if (loc >= 0) this.s.loc.plague[loc] = Math.max(this.s.loc.plague[loc], v); }
  tech(branch: number, frac: number) { this.n.techProgress[branch] += techBase(this.n, branch) * frac; }
  insight(v: number) { this.n.flags.doctrine_pts = (this.n.flags.doctrine_pts || 0) + v; }
  war(target: number, goal: any = 'conquest') { const w = this.e().w; return declareWar(this.s, w, this.n.id, target, goal); }
  chronicle(text: I18n, loc?: number) { chronicle(this.s, this.n.id, 'event', text, loc); }
  ruler() { return this.s.chars[this.n.ruler]; }
  rulerSkill(k: 0 | 1 | 2, d: number) { const r = this.ruler(); if (r) r.skills[k] = clamp(r.skills[k] + d, 0, 6); }
  rulerTrait(t: string) { const r = this.ruler(); if (r && !r.traits.includes(t)) r.traits.push(t); }
  rulerHealth(d: number) { const r = this.ruler(); if (r) r.health = clamp(r.health + d, 0, 1); }
}

// ---------------- helpers for content ----------------
export const H = {
  year: (s: GameState) => dayToDate(s.day, s.startYear).y,
  locs: (s: GameState, n: number) => nationLocs(s, n),
  dev: (s: GameState, n: number) => nationDev(s, n),
  atWar: (s: GameState, n: number) => s.wars.some((x) => x.att.includes(n) || x.def.includes(n)),
  atWarWith: atWar, hasTreaty, allies,
  randomLoc(e: EvApi, filter?: (l: number) => boolean): number {
    const ls = nationLocs(e.s, e.n.id).filter((l) => !filter || filter(l));
    return ls.length ? ls[Math.floor(rand(e.s.rng) * ls.length)] : -1;
  },
  biggestLoc(e: EvApi, filter?: (l: number) => boolean): number {
    let b = -1, bd = -1; for (const l of nationLocs(e.s, e.n.id)) if ((!filter || filter(l)) && e.s.loc.dev[l] > bd) { bd = e.s.loc.dev[l]; b = l; } return b;
  },
  neighbourNations(e: EvApi): number[] {
    const out = new Set<number>(); const { s, w } = e;
    for (const l of nationLocs(s, e.n.id)) for (let j = w.adjStart[l]; j < w.adjStart[l + 1]; j++) { const v = w.adj[j]; if (v < w.L) { const o = s.loc.owner[v]; if (o >= 0 && o !== e.n.id) out.add(o); } }
    return [...out];
  },
  pickNeighbour(e: EvApi, filter?: (o: number) => boolean): number { const l = H.neighbourNations(e).filter((o) => !filter || filter(o)); return l.length ? pick(e.s.rng, l) : -1; },
  faith: (id: string) => FAITH_ID(id),
  classShare(e: EvApi, cls: number) { let a = 0, t = 0; for (const l of nationLocs(e.s, e.n.id)) for (let c = 0; c < C; c++) { const p = e.s.loc.pop[l * C + c]; t += p; if (c === cls) a += p; } return t ? a / t : 0; },
  avgUnrest(e: EvApi) { const ls = nationLocs(e.s, e.n.id); return ls.length ? ls.reduce((p, l) => p + e.s.loc.unrest[l], 0) / ls.length : 0; },
  estateOf(e: EvApi, id: string) { return estate(e.n, id); },
  isPlayer: (s: GameState, n: number) => s.playerNations.includes(n),
  CL,
};
import { FAITH_INDEX } from '../content/peoples';
function FAITH_ID(id: string) { return FAITH_INDEX[id] ?? -1; }

// ---------------- engine ----------------
const EV_INDEX: Record<string, EventDef> = {};
export function eventDef(id: string) { if (!Object.keys(EV_INDEX).length) for (const d of EVENTS) EV_INDEX[d.id] = d; return EV_INDEX[id]; }

function api(s: GameState, w: World, n: Nation, ctx: Record<string, number>): EvApi {
  const d = dayToDate(s.day, s.startYear);
  const e: EvApi = { s, w, n, ctx, year: d.y, month: d.m, fx: null as any };
  e.fx = new Effects(() => e);
  return e;
}
export function interpolate(s: GameState, w: World, n: Nation, ctx: Record<string, number>, t: I18n): I18n {
  const r = s.chars[n.ruler];
  const rep = (str: string, lang: 'en' | 'de') => str
    .replace(/\{nation\}/g, n.short[lang]).replace(/\{adj\}/g, n.adj[lang])
    .replace(/\{ruler\}/g, r ? localName(r.name, lang, r.female) : '—')
    .replace(/\{loc\}/g, ctx.loc !== undefined && ctx.loc >= 0 ? (lang === 'de' ? w.namesDe : w.names)[ctx.loc] : '—')
    .replace(/\{other\}/g, ctx.other !== undefined && s.nations[ctx.other] ? s.nations[ctx.other].short[lang] : '—')
    .replace(/\{year\}/g, String(dayToDate(s.day, s.startYear).y))
    .replace(/\{amount\}/g, String(Math.round(ctx.amount ?? 0)));
  return { en: rep(t.en, 'en'), de: rep(t.de, 'de') };
}
/** The other realm a chronicle entry of an event concerns: the one its title names ({other}), if any. */
function namedOther(d: { title: I18n }, ctx: Record<string, number>): number[] | undefined {
  return d.title.en.includes('{other}') && ctx.other !== undefined && ctx.other >= 0 ? [ctx.other] : undefined;
}

function aiChoice(e: EvApi, d: EventDef): number {
  let best = 0, bv = -Infinity;
  d.options.forEach((o, k) => { const v = (typeof o.ai === 'function' ? o.ai(e) : o.ai ?? (k === 0 ? 1 : 0.5)) + rand(e.s.rng) * 0.3; if (v > bv) { bv = v; best = k; } });
  return best;
}

export function fireEvent(s: GameState, w: World, n: Nation, d: EventDef, ctx: Record<string, number> = {}): boolean {
  const e = api(s, w, n, ctx);
  if (d.setup && !d.setup(e)) return false;
  if (d.once) s.flags[`ev_${d.id}`] = s.day;
  n.flags[`ev_${d.id}`] = s.day;
  // an online player who is away gets the event too, with a shorter deadline; after it the court decides (polish pass)
  const away = !!n.playerId && s.flags[`offline_${n.id}`] > 0;
  const human = s.playerNations.includes(n.id) || !!n.playerId;
  if (human) {
    s.pending.push({ id: s.nextId++, event: d.id, nation: n.id, day: s.day, expires: s.day + (away ? AWAY_EVENT_DAYS : 90), ctx: { ...ctx } });
    return true;
  }
  const k = aiChoice(e, d);
  d.options[k].effect(e);
  if (d.major) chronicle(s, n.id, 'event', interpolate(s, w, n, ctx, d.title), ctx.loc, namedOther(d, ctx));
  return true;
}

function eligible(s: GameState, n: Nation, d: EventDef, year: number) {
  if (d.minYear && year < d.minYear) return false;
  if (d.maxYear && year > d.maxYear) return false;
  if (d.once && s.flags[`ev_${d.id}`] !== undefined) return false;
  const last = n.flags[`ev_${d.id}`];
  if (last !== undefined) { if (d.oncePer) return false; if (s.day - last < (d.cooldown ?? 10) * 365) return false; }
  if (s.pending.some((p) => p.nation === n.id && p.event === d.id)) return false;
  return true;
}

function eventsMonth(s: GameState, w: World, m: number, y: number) {
  const defs = EVENTS;
  for (const n of s.nations) {
    if (!n.alive || n.capital < 0) continue;
    if ((n.id + m) % 3 !== 0) continue; // each realm checked every three months
    if (s.pending.filter((p) => p.nation === n.id && !p.event.startsWith('diplo_')).length >= 4) continue;
    const e = api(s, w, n, {});
    const order = defs.length; const off = Math.floor(rand(s.rng) * order);
    for (let k = 0; k < order; k++) {
      const d = defs[(k + off) % order];
      if (!eligible(s, n, d, y)) continue;
      let ok = false; try { ok = d.trigger(e); } catch { ok = false; }
      if (!ok) continue;
      if (!chance(s.rng, 1 - Math.exp(-3 / Math.max(1, d.mtth)))) continue;
      e.ctx = {};
      if (fireEvent(s, w, n, d, e.ctx)) break;
    }
  }
  // expire unanswered events (the court decides)
  for (const p of s.pending.slice()) if (p.expires <= s.day) answerEvent(s, w, p.nation, p.id, -1, true);
}

/** Days an event waits for an online player who is away before the court decides it (and lists it for their return). */
export const AWAY_EVENT_DAYS = 30;
/** Events decided for online players after their deadline, for the summary when they come back (src/online/catchup.ts). */
function recordAuto(s: GameState, nation: number, event: string, title: I18n, option: I18n, loc?: number) {
  const list = (s.autoEvents ??= []);
  list.push({ nation, day: s.day, event, title, option, loc });
  if (list.length > 300) list.splice(0, list.length - 300);
}

/** choice -1 = automatic (AI preference). auto: the deadline passed (an online player's choice is then recorded). Returns error or null. */
export function answerEvent(s: GameState, w: World, nation: number, pendingId: number, choice: number, auto = false): string | null {
  const p = s.pending.find((x) => x.id === pendingId && x.nation === nation); if (!p) return 'no such event';
  const n = s.nations[nation];
  s.pending.splice(s.pending.indexOf(p), 1);
  if (p.event.startsWith('diplo_')) {
    const action = p.event.slice(6);
    if (auto && n.playerId) { const from = s.nations[p.ctx.from]; recordAuto(s, nation, p.event, { en: `Proposal of ${from?.short.en ?? '?'} (${action})`, de: `Vorschlag von ${from?.short.de ?? '?'} (${action})` }, { en: 'Declined', de: 'Abgelehnt' }); }
    if (choice === 0 && s.nations[p.ctx.from]?.alive) {
      acceptProposal(s, w, p.ctx.from, nation, action);
      notice(s, p.ctx.from, 'diplo_accept', { en: `${n.short.en} accepted our proposal (${action}).`, de: `${n.short.de} hat unseren Vorschlag angenommen (${action}).` });
    } else addOpinion(s, p.ctx.from, nation, 'refused_us', -10, 365);
    return null;
  }
  const d = eventDef(p.event); if (!d) return 'unknown event';
  const e = api(s, w, n, p.ctx);
  const k = choice < 0 || choice >= d.options.length ? aiChoice(e, d) : choice;
  if (auto && n.playerId) recordAuto(s, nation, p.event, interpolate(s, w, n, p.ctx, d.title), interpolate(s, w, n, p.ctx, d.options[k].label), p.ctx.loc);
  d.options[k].effect(e);
  if (d.major) chronicle(s, nation, 'event', interpolate(s, w, n, p.ctx, d.title), p.ctx.loc, namedOther(d, p.ctx));
  return null;
}

// ---------------- decisions ----------------
export function decisionsFor(s: GameState, w: World, n: Nation) {
  const e = api(s, w, n, {});
  return DECISIONS.filter((d) => !(d.once && n.flags[`dec_${d.id}`] !== undefined)).filter((d) => { try { return d.visible(e); } catch { return false; } })
    .map((d) => ({ d, why: (() => { try { return d.can(e); } catch (x) { return 'error' as string | I18n | null; } })() }));
}
export function takeDecision(s: GameState, w: World, n: Nation, id: string): string | I18n | null {
  const d = DECISIONS.find((x) => x.id === id); if (!d) return 'unknown decision';
  if (d.once && n.flags[`dec_${d.id}`] !== undefined) return 'already taken';
  const e = api(s, w, n, {});
  if (!d.visible(e)) return 'not available';
  const why = d.can(e); if (why) return why;
  d.effect(e);
  n.flags[`dec_${d.id}`] = s.day;
  chronicle(s, n.id, 'decision', { en: `${n.short.en}: ${d.name.en}.`, de: `${n.short.de}: ${d.name.de}.` });
  return null;
}
function aiDecisions(s: GameState, w: World, m: number) {
  for (const n of s.nations) {
    if (!n.alive || s.playerNations.includes(n.id) || n.playerId || (n.id + m) % 12 !== 0) continue;
    const e = api(s, w, n, {});
    for (const d of DECISIONS) {
      if (d.once && n.flags[`dec_${d.id}`] !== undefined) continue;
      try { if (d.visible(e) && !d.can(e) && (d.ai ? d.ai(e) : true) && !takeDecision(s, w, n, d.id)) aiRecord(s, { t: 'decision', n: n.id, id: d.id }); } catch { /* content error: skip */ }
    }
  }
}

export const events: System = {
  id: 'events',
  monthly({ s, w, date }) { eventsMonth(s, w, date.m, date.y); aiDecisions(s, w, date.m); },
};
