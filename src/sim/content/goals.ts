// Goal trees ("ambitions of the realm"): per-nation trees for the great realms of 1356 and a generic tree for all others.
// A goal is checked (staggered) by systems/goals.ts once all goals in `req` are done; when `check` holds, it is marked in
// n.goalsDone and `reward` is applied once. Descriptions are generated from the conditions and rewards so that the text
// always matches what the code does.
import type { EvApi } from '../systems/events';
import type { I18n, Nation } from '../types';
import type { World } from '../world';
import { nationLocsRO, nationDev } from '../systems/war';
import { clamp, hasTreaty } from '../ctx';
import { FAITH_INDEX, GROUP_OF, ALL_CULTURES } from './peoples';
import { DOCTRINES, DOCTRINE_INDEX } from './doctrines';
import { INNOVATIONS } from './innovations';
import { B, BI } from '../defs';
import { deName } from './names_de';
import { CODE_PROCLAIM } from './situations';

export interface GoalDef {
  nation?: string; // nation key, or undefined = generic tree for realms without their own
  id: string; name: I18n; desc: I18n;
  req?: string[];  // prerequisite goal ids
  check(e: EvApi): boolean;
  reward(e: EvApi): void;
  /** the conditions one by one (text, test, progress) and the reward texts, for the goal tree and the tracker */
  conds: GoalCond[]; rews: I18n[]; flav?: I18n;
}

// ---------------- condition and reward builders ----------------
/**
 * A condition: text, test and (for counted conditions) progress as [current, required]; place conditions name their
 * places so the goal tree can show which are held.
 */
export interface GoalCond { t: I18n; f: (e: EvApi) => boolean; p?: (e: EvApi) => [number, number]; places?: string[]; building?: number; prog?: (e: EvApi) => CondProg }
/** How far a condition is: the count shown (cur of max, where it counts), the share done (0..1) and, for a condition
 *  that holds only from a year on, that year and the share of the time to it that has passed. */
export interface CondProg { cur?: number; max?: number; frac: number; from?: number; timeFrac?: number }
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** The progress of a condition: met is 1; a counted one cur / max; one with a year gate (C.after) never more than
 *  the share of the time to that year that has passed, so it cannot look done while the year is still to come. */
export function condProgress(c: GoalCond, e: EvApi): CondProg {
  if (c.prog) return c.prog(e);
  let ok = false; try { ok = c.f(e); } catch { ok = false; }
  const p = c.p?.(e);
  if (!p) return { frac: ok ? 1 : 0 };
  // a condition not met never reads as done, even when its count is reached (a subject as strong as the last great
  // power, a treasury full but in debt)
  return { cur: p[0], max: p[1], frac: ok ? 1 : Math.min(0.99, clamp01(p[0] / Math.max(1e-9, p[1]))) };
}
type Cond = GoalCond;
interface Rew { t: I18n; f: (e: EvApi) => void }
const NAMES = new WeakMap<World, Map<string, number>>();
function loc(w: World, name: string): number {
  let m = NAMES.get(w);
  if (!m) { m = new Map(); for (let i = 0; i < w.L; i++) if (!m.has(w.names[i])) m.set(w.names[i], i); NAMES.set(w, m); }
  return m.get(name) ?? -1;
}
/** All location names used by goals (checked by tools/sim/check_content.ts). */
export const GOAL_PLACES = new Set<string>();
/** Place names joined for a goal text: the map's names in English, their German forms in German (Wien, Meißen). */
const list = (names: string[], lang: 'en' | 'de') => { const xs = lang === 'de' ? names.map(deName) : names; return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${lang === 'en' ? 'and' : 'und'} ${xs[xs.length - 1]}`; };
const owns = (e: EvApi, name: string) => { const l = loc(e.w, name); return l >= 0 && e.s.loc.owner[l] === e.n.id; };
const ownsOrSubject = (e: EvApi, name: string) => { const l = loc(e.w, name); if (l < 0) return false; const o = e.s.loc.owner[l]; return o === e.n.id || (o >= 0 && e.s.nations[o].overlord === e.n.id); };
const nat = (e: EvApi, key: string): Nation | undefined => e.s.nations.find((x) => x.key === key && x.alive);
const BRANCH: I18n[] = [{ en: 'Governance', de: 'Staatskunst' }, { en: 'Commerce', de: 'Handel' }, { en: 'Warfare', de: 'Kriegswesen' }];
function countLocs(e: EvApi, f: (l: number) => boolean) { let k = 0; for (const l of nationLocsRO(e.s, e.n.id)) if (f(l)) k++; return k; }
function buildings(e: EvApi, b: number) { let k = 0; for (const l of nationLocsRO(e.s, e.n.id)) k += e.s.loc.buildings[l * B + b]; return k; }
const inBox = (e: EvApi, box: [number, number, number, number]) => countLocs(e, (l) => e.w.lat[l] >= box[0] && e.w.lat[l] <= box[1] && e.w.lon[l] >= box[2] && e.w.lon[l] <= box[3]);
const overseasLocs = (e: EvApi) => countLocs(e, (l) => e.w.lon[l] < -25 || (e.w.lat[l] < 15 && e.w.lon[l] < 55));
/** The progress nearer to its mark (for “a or b”); a side without progress counts as nothing done. */
const better = (a?: [number, number], b?: [number, number]): [number, number] => { const f = (x?: [number, number]) => (x ? x[0] / Math.max(1e-9, x[1]) : -1); return (f(a) >= f(b) ? a : b) ?? [0, 1]; };
/** The score of the realm at place i of the great-power ranking (our own when the ranking is still empty). */
const rankScore = (e: EvApi, i: number) => { const id = e.s.ranking[i]; return id !== undefined && e.s.nations[id] ? Math.max(1, e.s.nations[id].score) : Math.max(1, e.n.score); };
/** Location index of a goal place name (first location with that name), -1 when the map has none. */
export function goalPlace(w: World, name: string): number { return loc(w, name); }

const C = {
  own: (...names: string[]): Cond => { names.forEach((x) => GOAL_PLACES.add(x)); return { t: { en: `hold ${list(names, 'en')}`, de: `${list(names, 'de')} besitzen` }, f: (e) => names.every((x) => owns(e, x)), p: (e) => [names.filter((x) => owns(e, x)).length, names.length], places: names }; },
  control: (...names: string[]): Cond => { names.forEach((x) => GOAL_PLACES.add(x)); return { t: { en: `hold ${list(names, 'en')} directly or through a subject`, de: `${list(names, 'de')} selbst oder durch einen Untertan besitzen` }, f: (e) => names.every((x) => ownsOrSubject(e, x)), p: (e) => [names.filter((x) => ownsOrSubject(e, x)).length, names.length], places: names }; },
  ownK: (k: number, names: string[]): Cond => { names.forEach((x) => GOAL_PLACES.add(x)); return { t: { en: `hold ${k} of ${list(names, 'en')}`, de: `${k} von ${list(names, 'de')} besitzen` }, f: (e) => names.filter((x) => owns(e, x)).length >= k, p: (e) => [names.filter((x) => owns(e, x)).length, k], places: names }; },
  /** `t` is the place with its preposition: “in the Canary Islands” / “auf den Kanarischen Inseln”. */
  region: (k: number, t: I18n, box: [number, number, number, number]): Cond => ({ t: { en: `hold ${k} location${k > 1 ? 's' : ''} ${t.en}`, de: `${k} Ort${k > 1 ? 'e' : ''} ${t.de} besitzen` }, f: (e) => inBox(e, box) >= k, p: (e) => [inBox(e, box), k] }),
  locs: (k: number): Cond => ({ t: { en: `rule ${k} locations`, de: `${k} Orte beherrschen` }, f: (e) => nationLocsRO(e.s, e.n.id).length >= k, p: (e) => [nationLocsRO(e.s, e.n.id).length, k] }),
  dev: (k: number): Cond => ({ t: { en: `reach a total development of ${k}`, de: `eine Gesamtentwicklung von ${k} erreichen` }, f: (e) => nationDev(e.s, e.n.id) >= k, p: (e) => [nationDev(e.s, e.n.id), k] }),
  tech: (b: number, k: number): Cond => ({ t: { en: `reach ${BRANCH[b].en} ${k}`, de: `${BRANCH[b].de} ${k} erreichen` }, f: (e) => e.n.tech[b] >= k, p: (e) => [e.n.tech[b], k] }),
  techAll: (k: number): Cond => ({ t: { en: `reach level ${k} in all branches of knowledge`, de: `Stufe ${k} in allen Wissenszweigen erreichen` }, f: (e) => e.n.tech.every((x) => x >= k), p: (e) => [Math.min(...e.n.tech), k] }),
  era: (k: number, t: I18n): Cond => ({ t: { en: `enter the ${t.en}`, de: `das ${t.de} erreichen` }, f: (e) => e.n.era >= k, p: (e) => [e.n.era, k] }),
  prestige: (k: number): Cond => ({ t: { en: `have ${k} prestige`, de: `${k} Ansehen haben` }, f: (e) => e.n.prestige >= k, p: (e) => [e.n.prestige, k] }),
  mandate: (k: number): Cond => ({ t: { en: `have ${k} Mandate`, de: `${k} Mandat haben` }, f: (e) => e.n.mandate >= k, p: (e) => [e.n.mandate, k] }),
  concord: (k: number): Cond => ({ t: { en: `have ${k} Concord`, de: `${k} Eintracht haben` }, f: (e) => e.n.concord >= k, p: (e) => [e.n.concord, k] }),
  treasury: (m: number): Cond => ({ t: { en: `hold ${m} months of taxes in the treasury`, de: `${m} Monatssteuern im Schatz halten` }, f: (e) => e.n.treasury >= Math.max(10, e.n.income.tax || 10) * m && e.n.debt <= 0, p: (e) => [e.n.debt > 0 ? 0 : e.n.treasury, Math.max(10, e.n.income.tax || 10) * m] }),
  subjects: (k: number): Cond => ({ t: { en: `have ${k} subject realm${k > 1 ? 's' : ''}`, de: `${k} Untertanenreich${k > 1 ? 'e' : ''} haben` }, f: (e) => e.s.nations.filter((x) => x.alive && x.overlord === e.n.id).length >= k, p: (e) => [e.s.nations.filter((x) => x.alive && x.overlord === e.n.id).length, k] }),
  subject: (key: string, t: I18n): Cond => ({ t: { en: `make ${t.en} our subject or annex it`, de: `${t.de} zum Untertan machen oder einverleiben` }, f: (e) => { const o = e.s.nations.find((x) => x.key === key); return !!o && (!o.alive || o.overlord === e.n.id); } }),
  gone: (key: string, t: I18n): Cond => ({ t: { en: `${t.en} no longer exists`, de: `${t.de} besteht nicht mehr` }, f: (e) => { const o = e.s.nations.find((x) => x.key === key); return !o || !o.alive; } }),
  ally: (key: string, t: I18n): Cond => ({ t: { en: `be allied with ${t.en}`, de: `mit ${t.de} verbündet sein` }, f: (e) => { const o = nat(e, key); return !!o && hasTreaty(e.s, e.n.id, o.id, 'alliance'); } }),
  sovereign: (): Cond => ({ t: { en: 'owe allegiance to no overlord', de: 'keinem Oberherrn untertan sein' }, f: (e) => e.n.overlord < 0 }),
  warsWon: (k: number): Cond => ({ t: { en: `win ${k} war${k > 1 ? 's' : ''}`, de: `${k} Krieg${k > 1 ? 'e' : ''} gewinnen` }, f: (e) => e.n.stats.warsWon >= k, p: (e) => [e.n.stats.warsWon, k] }),
  battles: (k: number): Cond => ({ t: { en: `win ${k} battles`, de: `${k} Schlachten gewinnen` }, f: (e) => e.n.stats.battlesWon >= k, p: (e) => [e.n.stats.battlesWon, k] }),
  doctrine: (g: string, k: number): Cond => { const d = DOCTRINES[DOCTRINE_INDEX[g]]; return { t: { en: `take ${k} picks of the doctrine “${d.name.en}”`, de: `${k} Lehrsätze der Doktrin „${d.name.de}“ annehmen` }, f: (e) => (e.n.doctrines[g] || 0) >= k, p: (e) => [e.n.doctrines[g] || 0, k] }; },
  doctrines: (k: number): Cond => ({ t: { en: `take ${k} doctrine picks in all`, de: `insgesamt ${k} Lehrsätze annehmen` }, f: (e) => Object.values(e.n.doctrines).reduce((p, x) => p + x, 0) >= k, p: (e) => [Object.values(e.n.doctrines).reduce((p, x) => p + x, 0), k] }),
  innovation: (id: string): Cond => { const k = INNOVATIONS.findIndex((x) => x.id === id); const iv = INNOVATIONS[k]; return { t: { en: `adopt ${iv.name.en}`, de: `${iv.name.de} übernehmen` }, f: (e) => e.n.innovations.includes(k) }; },
  innovations: (k: number): Cond => ({ t: { en: `adopt ${k} innovations`, de: `${k} Neuerungen übernehmen` }, f: (e) => e.n.innovations.length >= k, p: (e) => [e.n.innovations.length, k] }),
  decision: (id: string, t: I18n): Cond => ({ t: { en: `take the decision “${t.en}”`, de: `die Entscheidung „${t.de}“ treffen` }, f: (e) => e.n.flags[`dec_${id}`] !== undefined }),
  building: (b: string, k: number, t: I18n): Cond => ({ t: { en: `have ${k} ${t.en}`, de: `${k} ${t.de} haben` }, f: (e) => buildings(e, BI[b]) >= k, p: (e) => [buildings(e, BI[b]), k], building: BI[b] }),
  law: (law: string, min: number, t: I18n): Cond => ({ t: { en: `enact “${t.en}”`, de: `„${t.de}“ einführen` }, f: (e) => (e.n.laws[law] ?? 0) >= min }),
  lawIs: (law: string, opt: number, t: I18n): Cond => ({ t: { en: `enact “${t.en}”`, de: `„${t.de}“ einführen` }, f: (e) => e.n.laws[law] === opt }),
  gov: (gov: string, t: I18n): Cond => ({ t: { en: `rule as ${t.en}`, de: `als ${t.de} herrschen` }, f: (e) => e.n.gov === gov }),
  faith: (f: string, t: I18n): Cond => ({ t: { en: `follow the ${t.en}`, de: `der ${t.de} folgen` }, f: (e) => e.n.faith === FAITH_INDEX[f] }),
  faithUnity: (k: number): Cond => ({ t: { en: `have ${Math.round(k * 100)}% of our land share our faith`, de: `${Math.round(k * 100)} % unseres Landes teilen unseren Glauben` }, f: (e) => { const ls = nationLocsRO(e.s, e.n.id); return ls.length > 0 && ls.filter((l) => e.s.loc.faith[l] === e.n.faith).length / ls.length >= k; }, p: (e) => { const ls = nationLocsRO(e.s, e.n.id); return [ls.length ? Math.round(ls.filter((l) => e.s.loc.faith[l] === e.n.faith).length / ls.length * 100) : 0, Math.round(k * 100)]; } }),
  /** Progress: our score against the score of the last great power (the eighth of the ranking). */
  greatPower: (): Cond => ({ t: { en: 'be counted among the great powers', de: 'zu den Großmächten zählen' }, f: (e) => e.s.ranking.includes(e.n.id), p: (e) => [Math.round(e.n.score), Math.round(rankScore(e, e.s.ranking.length - 1))] }),
  /** Progress: our score against the foremost power's. */
  topPower: (): Cond => ({ t: { en: 'be the foremost power of the world', de: 'die erste Macht der Welt sein' }, f: (e) => e.s.ranking[0] === e.n.id, p: (e) => [Math.round(e.n.score), Math.round(rankScore(e, 0))] }),
  emperor: (): Cond => ({ t: { en: 'hold the imperial crown', de: 'die Kaiserkrone tragen' }, f: (e) => e.s.empire.emperor === e.n.id }),
  overseas: (k: number): Cond => ({ t: { en: `hold ${k} locations beyond the Ocean Sea`, de: `${k} Orte jenseits des Ozeanmeers besitzen` }, f: (e) => overseasLocs(e) >= k, p: (e) => [overseasLocs(e), k] }),
  situation: (id: string, outcomes: string[], t: I18n): Cond => ({ t, f: (e) => e.s.situations.some((x) => x.id === id && !x.active && outcomes.includes(x.outcome || '')) }),
  worldFlag: (k: string, t: I18n): Cond => ({ t, f: (e) => e.s.flags[k] !== undefined }),
  /** The side further along counts (a side met makes the whole condition met). */
  either: (a: Cond, b: Cond): Cond => ({ t: { en: `${a.t.en} or ${b.t.en}`, de: `${a.t.de} oder ${b.t.de}` }, f: (e) => a.f(e) || b.f(e), p: a.p || b.p ? (e) => better(a.p?.(e), b.p?.(e)) : undefined, places: a.places || b.places ? [...(a.places ?? []), ...(b.places ?? [])] : undefined, building: a.building ?? b.building,
    prog: (e) => {
      const pa = condProgress(a, e), pb = condProgress(b, e);
      // on a tie the side with a count or a year gate is shown (it says more than a plain "not yet")
      if (pa.frac !== pb.frac) return pa.frac > pb.frac ? pa : pb;
      return pa.max !== undefined || pa.from !== undefined ? pa : pb;
    } }),
  /** Holds only from year y: before it the progress is the smaller of the inner condition's and the share of the time
   *  from the start of the game to y that has passed (both shown in the goal's tooltip). */
  after: (y: number, c: Cond): Cond => ({ t: { en: `${c.t.en} (from ${y})`, de: `${c.t.de} (ab ${y})` }, f: (e) => e.year >= y && c.f(e), p: c.p, places: c.places, building: c.building,
    prog: (e) => {
      const inner = condProgress(c, e);
      if (e.year >= y) return inner;
      const t0 = e.s.startYear, tf = clamp01((e.year - t0) / Math.max(1, y - t0));
      return { ...inner, frac: Math.min(inner.frac, tf), from: y, timeFrac: tf };
    } }),
  capitalAt: (name: string): Cond => { GOAL_PLACES.add(name); return { t: { en: `have the capital in ${name}`, de: `die Hauptstadt in ${deName(name)} haben` }, f: (e) => e.n.capital === loc(e.w, name) }; },
  imperialReforms: (k: number): Cond => ({ t: { en: `see ${k} imperial reforms passed by the diet`, de: `${k} Reichsreformen vom Reichstag beschlossen sehen` }, f: (e) => e.s.empire.reforms.length >= k, p: (e) => [e.s.empire.reforms.length, k] }),
  imperialAuthority: (k: number): Cond => ({ t: { en: `raise imperial authority to ${k} as emperor`, de: `als Kaiser die Reichsautorität auf ${k} heben` }, f: (e) => e.s.empire.emperor === e.n.id && e.s.empire.authority >= k, p: (e) => [e.s.empire.emperor === e.n.id ? Math.round(e.s.empire.authority) : 0, k] }),
  electedEmperor: (k: number): Cond => ({ t: { en: k > 1 ? `win ${k} imperial elections` : 'win an imperial election', de: k > 1 ? `${k} Kaiserwahlen gewinnen` : 'eine Kaiserwahl gewinnen' }, f: (e) => (e.n.flags.elected_emperor ?? 0) >= k, p: (e) => [e.n.flags.elected_emperor ?? 0, k] }),
  estateContent: (id: string, k: number, t: I18n): Cond => ({ t: { en: `keep ${t.en} at ${k} contentment`, de: `${t.de} bei ${k} Zufriedenheit halten` }, f: (e) => (e.n.estates.find((x) => x.id === id)?.contentment ?? 0) >= k, p: (e) => [Math.round(e.n.estates.find((x) => x.id === id)?.contentment ?? 0), k] }),
  /** The code of the Bohemian crown proclaimed; progress: the situation's bar against the mark for proclaiming it. */
  codeProclaimed: (): Cond => ({ t: { en: 'proclaim the code of the Bohemian crown', de: 'das Gesetzbuch der böhmischen Krone verkünden' },
    f: (e) => e.s.situations.some((x) => x.id === 'kings_code' && !x.active && x.outcome === 'proclaimed' && x.data.b === e.n.id),
    p: (e) => { const x = e.s.situations.find((q) => q.id === 'kings_code' && q.data.b === e.n.id); return [x ? (x.outcome === 'proclaimed' ? CODE_PROCLAIM : x.active ? Math.max(0, x.progress) : 0) : 0, CODE_PROCLAIM]; } }),
};

const R = {
  prestige: (v: number): Rew => ({ t: { en: `+${v} prestige`, de: `+${v} Ansehen` }, f: (e) => e.fx.prestige(v) }),
  gold: (m: number): Rew => ({ t: { en: `${m} months of taxes`, de: `${m} Monatssteuern` }, f: (e) => e.fx.gold(m) }),
  mandate: (v: number): Rew => ({ t: { en: `+${v} Mandate`, de: `+${v} Mandat` }, f: (e) => e.fx.mandate(v) }),
  concord: (v: number): Rew => ({ t: { en: `+${v} Concord`, de: `+${v} Eintracht` }, f: (e) => e.fx.concord(v) }),
  authority: (v: number): Rew => ({ t: { en: `+${v} Authority`, de: `+${v} Autorität` }, f: (e) => e.fx.authority(v) }),
  insight: (v: number): Rew => ({ t: { en: `+${v} Insight`, de: `+${v} Einsicht` }, f: (e) => e.fx.insight(v) }),
  manpower: (f: number): Rew => ({ t: { en: `${Math.round(f * 100)}% of our manpower restored`, de: `${Math.round(f * 100)} % der Wehrkraft aufgefüllt` }, f: (e) => e.fx.manpower(f) }),
  tech: (b: number, f: number): Rew => ({ t: { en: `progress in ${BRANCH[b].en}`, de: `Fortschritt in ${BRANCH[b].de}` }, f: (e) => e.fx.tech(b, f) }),
  mod: (id: string, years: number, label: I18n, effects: Record<string, number>): Rew => ({ t: { en: `“${label.en}”${years >= 100 ? '' : ` for ${years} years`}`, de: `„${label.de}“${years >= 100 ? '' : ` für ${years} Jahre`}` }, f: (e) => e.fx.modifier(`goal_${id}`, years >= 100 ? 1e6 : years, label, effects) }),
  cores: (t: I18n, f: (e: EvApi, l: number) => boolean): Rew => ({ t: { en: `rightful claim to ${t.en}`, de: `rechtmäßiger Anspruch auf ${t.de}` }, f: (e) => { const s = e.s; for (let i = 0; i < e.w.L; i++) if (f(e, i) && (s.loc.owner[i] === e.n.id || s.loc.core[i] < 0)) s.loc.core[i] = e.n.id; } }),
  estate: (id: string, v: number, t: I18n): Rew => ({ t: { en: `${t.en} +${v} contentment`, de: `${t.de} +${v} Zufriedenheit` }, f: (e) => e.fx.estate(id, v) }),
};
const box = (lat0: number, lat1: number, lon0: number, lon1: number) => (e: EvApi, l: number) => e.w.lat[l] >= lat0 && e.w.lat[l] <= lat1 && e.w.lon[l] >= lon0 && e.w.lon[l] <= lon1;
const culture = (g: string) => (e: EvApi, l: number) => GROUP_OF[ALL_CULTURES[e.s.loc.culture[l]]] === g;

function G(nation: string | undefined, id: string, en: string, de: string, req: string[], conds: Cond[], rews: Rew[], flav?: I18n): GoalDef {
  const full = nation ? `${nation}.${id}` : `any.${id}`;
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const desc: I18n = {
    en: `${flav ? flav.en + ' ' : ''}Requires: ${conds.map((c) => c.t.en).join('; ')}. Reward: ${rews.map((r) => r.t.en).join(', ')}.`,
    de: `${flav ? flav.de + ' ' : ''}Bedingung: ${conds.map((c) => cap(c.t.de)).join('; ')}. Belohnung: ${rews.map((r) => r.t.de).join(', ')}.`,
  };
  return {
    nation, id: full, name: { en, de }, desc, req: req.map((r) => (r.includes('.') ? r : nation ? `${nation}.${r}` : `any.${r}`)),
    check: (e) => conds.every((c) => c.f(e)),
    reward: (e) => { for (const r of rews) r.f(e); },
    conds, rews: rews.map((r) => r.t), flav,
  };
}

const ERA1 = { en: 'Age of Print and Horizons', de: 'Zeitalter von Druck und Horizonten' };
const ERA2 = { en: 'Age of Confessions and Absolutism', de: 'Zeitalter der Konfessionen und des Absolutismus' };
const ERA3 = { en: 'Age of Reason and Revolution', de: 'Zeitalter der Vernunft und Revolution' };
const T = (en: string, de: string): I18n => ({ en, de });

// ---------------- England ----------------
const ENGLAND: GoalDef[] = [
  G('england', 'calais', 'The Key to France', 'Der Schlüssel zu Frankreich', [], [C.own('Calais')], [R.prestige(10), R.mod('calais', 20, T('Wool staple of Calais', 'Wollstapel von Calais'), { trade: 0.05 })]),
  G('england', 'guyenne', 'Hold Guyenne', 'Guyenne halten', [], [C.own('Bordeaux', 'Bayonne')], [R.gold(6), R.mandate(5)]),
  G('england', 'normandy', 'The Duchy of Our Fathers', 'Das Herzogtum unserer Väter', ['calais'], [C.own('Rouen', 'Caen')], [R.prestige(15), R.cores(T('Normandy', 'die Normandie'), box(48.3, 50.1, -2, 1.8))]),
  G('england', 'french_crown', 'King of France', 'König von Frankreich', ['normandy', 'guyenne'], [C.either(C.own('Paris'), C.situation('crown_of_france', ['english_crown', 'partition'], T('win the contest for the French crown', 'den Streit um die französische Krone gewinnen')))], [R.prestige(30), R.mandate(10)]),
  G('england', 'scotland', 'Hammer of the Scots', 'Hammer der Schotten', [], [C.either(C.control('Edinburgh'), C.subject('scotland', T('Scotland', 'Schottland')))], [R.prestige(15), R.cores(T('the British Isles', 'die Britischen Inseln'), culture('british'))]),
  G('england', 'ireland', 'Lordship of Ireland', 'Herrschaft über Irland', [], [C.own('Dublin', 'Cork', 'Galway')], [R.authority(40), R.mod('ireland', 30, T('Lord of Ireland', 'Herr über Irland'), { manpower: 0.05 })]),
  G('england', 'parliament', 'Crown in Parliament', 'Krone im Parlament', [], [C.lawIs('diet', 2, T('Regular parliament', 'Regelmäßiges Parlament')), C.concord(20)], [R.mod('parliament', 100, T('Crown in Parliament', 'Krone im Parlament'), { concord_gain: 0.05, tax: 0.03 })]),
  G('england', 'navy', 'Wooden Walls', 'Hölzerne Mauern', [], [C.building('port', 6, T('harbour levels', 'Hafenstufen'))], [R.mod('navy', 100, T('Wooden walls', 'Hölzerne Mauern'), { attrition: -0.05, colonial_range: 0.05 })]),
  G('england', 'wool', 'Merchants of the Staple', 'Kaufleute des Stapels', [], [C.tech(1, 6), C.treasury(12)], [R.mod('wool', 30, T('Merchants of the Staple', 'Kaufleute des Stapels'), { trade: 0.06 })]),
  G('england', 'church', 'Supreme Head of the Church', 'Oberstes Haupt der Kirche', [], [C.after(1500, C.either(C.faith('anglican_type', T('National Church', 'Nationalkirche')), C.faithUnity(0.9)))], [R.authority(60), R.mandate(10)]),
  G('england', 'britain', 'Great Britain', 'Großbritannien', ['scotland'], [C.decision('form_great_britain', T('Union of the British Crowns', 'Vereinigung der britischen Kronen'))], [R.prestige(20), R.insight(50)]),
  G('england', 'americas', 'Plantations across the Sea', 'Pflanzungen jenseits des Meeres', ['navy'], [C.overseas(5)], [R.mod('americas', 50, T('Plantations', 'Pflanzungen'), { colonial_growth: 0.1, trade: 0.03 })]),
  G('england', 'company', 'Company of Merchants', 'Kompanie der Kaufleute', ['americas'], [C.decision('found_trading_company', T('Charter a Trading Company', 'Eine Handelskompanie privilegieren'))], [R.gold(12)]),
  G('england', 'great_power', 'Mistress of the Seas', 'Herrin der Meere', ['navy', 'parliament'], [C.greatPower(), C.overseas(15)], [R.prestige(25), R.mod('mistress', 100, T('Mistress of the seas', 'Herrin der Meere'), { trade: 0.05 })]),
];

// ---------------- France ----------------
const FRANCE: GoalDef[] = [
  G('france', 'calais', 'Drive Out the English', 'Die Engländer vertreiben', [], [C.own('Calais', 'Bordeaux')], [R.prestige(25), R.concord(15)]),
  G('france', 'normandy', 'Secure Normandy', 'Die Normandie sichern', [], [C.own('Rouen', 'Caen')], [R.gold(6), R.mandate(5)]),
  G('france', 'brittany', 'Brittany to the Crown', 'Die Bretagne an die Krone', ['normandy'], [C.control('Rennes', 'Nantes')], [R.authority(40), R.cores(T('Brittany', 'die Bretagne'), box(47, 49, -5, -1))]),
  G('france', 'burgundy', 'The Burgundian Inheritance', 'Das burgundische Erbe', [], [C.own('Dijon')], [R.prestige(15)]),
  G('france', 'provence', 'Gate to the Middle Sea', 'Tor zum Mittelmeer', [], [C.own('Marseille', 'Avignon')], [R.mod('provence', 30, T('Mediterranean ports', 'Mittelmeerhäfen'), { trade: 0.05 })]),
  G('france', 'ordinance', 'A Standing Royal Army', 'Ein stehendes königliches Heer', [], [C.either(C.innovation('ordinance_companies'), C.lawIs('army', 3, T('Standing army', 'Stehendes Heer')))], [R.mod('ordinance', 100, T('Royal ordinance', 'Königliche Ordonnanz'), { discipline: 0.03 })]),
  G('france', 'flanders', 'The Cloth Towns', 'Die Tuchstädte', ['calais'], [C.own('Bruges', 'Ghent')], [R.gold(12), R.cores(T('Flanders', 'Flandern'), box(50.5, 51.4, 2.3, 4.3))]),
  G('france', 'italy', 'Claims in Italy', 'Ansprüche in Italien', ['provence'], [C.ownK(1, ['Milan', 'Naples', 'Genoa'])], [R.prestige(15)]),
  G('france', 'rhine', 'Natural Frontiers', 'Natürliche Grenzen', ['burgundy'], [C.own('Strasbourg', 'Metz')], [R.prestige(15), R.cores(T('the left bank of the Rhine', 'das linke Rheinufer'), box(48, 51.5, 4.5, 8.3))]),
  G('france', 'pyrenees', 'Frontier of the Pyrenees', 'Grenze der Pyrenäen', [], [C.own('Perpignan', 'Pamplona')], [R.mod('pyrenees', 30, T('Pyrenean frontier', 'Pyrenäengrenze'), { fort_strength: 0.05 })]),
  G('france', 'absolute', 'The State Is the King', 'Der Staat ist der König', ['ordinance'], [C.gov('absolute_monarchy', T('a sovereign monarchy', 'unumschränkte Monarchie'))], [R.authority(80), R.mandate(10)]),
  G('france', 'canal', 'Canal of the Two Seas', 'Kanal der zwei Meere', [], [C.either(C.innovation('canal_locks'), C.building('canal', 1, T('canal', 'Kanal')))], [R.mod('canal', 100, T('Canal of the two seas', 'Kanal der zwei Meere'), { trade: 0.03, production: 0.03 })]),
  G('france', 'colonies', 'New France', 'Neufrankreich', [], [C.overseas(5)], [R.mod('colonies', 50, T('New France', 'Neufrankreich'), { colonial_growth: 0.1 })]),
  G('france', 'first', 'First Among Crowns', 'Erste unter den Kronen', ['calais', 'absolute'], [C.topPower()], [R.prestige(30)]),
];

// ---------------- Castile ----------------
const CASTILE: GoalDef[] = [
  G('castile', 'strait', 'Guard the Strait', 'Die Meerenge bewachen', [], [C.own('Gibraltar', 'Tarifa')], [R.mod('strait', 30, T('Guardians of the strait', 'Wächter der Meerenge'), { trade: 0.03, fort_strength: 0.05 })]),
  G('castile', 'granada', 'The Last Emirate', 'Das letzte Emirat', ['strait'], [C.own('Granada', 'Málaga', 'Almería')], [R.prestige(25), R.mandate(10), R.mod('granada', 30, T('Crusading crown', 'Kreuzzugskrone'), { morale: 0.05 })]),
  G('castile', 'navarre', 'The Pass of Roncevaux', 'Der Pass von Roncesvalles', [], [C.control('Pamplona')], [R.authority(30)]),
  G('castile', 'spain', 'Unite the Spanish Crowns', 'Die spanischen Kronen vereinen', [], [C.decision('form_spain', T('Union of the Spanish Crowns', 'Vereinigung der spanischen Kronen'))], [R.prestige(20), R.insight(50)]),
  G('castile', 'canaries', 'The Fortunate Isles', 'Die Glücklichen Inseln', [], [C.region(2, T('in the Canary Islands', 'auf den Kanarischen Inseln'), [27.5, 29.5, -18.5, -13])], [R.mod('canaries', 50, T('Atlantic waystation', 'Atlantische Zwischenstation'), { colonial_range: 0.08 })]),
  G('castile', 'indies', 'The Indies of the West', 'Die westlichen Indien', ['canaries'], [C.overseas(5)], [R.gold(12), R.prestige(15)]),
  G('castile', 'silver', 'Fleets of Silver', 'Silberflotten', ['indies'], [C.overseas(20)], [R.mod('silver', 50, T('Treasure fleets', 'Schatzflotten'), { tax: 0.05, trade: 0.03 })]),
  G('castile', 'portugal', 'One Crown for Iberia', 'Eine Krone für Iberien', ['spain'], [C.either(C.control('Lisbon'), C.subject('portugal', T('Portugal', 'Portugal')))], [R.prestige(20)]),
  G('castile', 'naples', 'Kingdoms in Italy', 'Königreiche in Italien', ['spain'], [C.ownK(1, ['Naples', 'Milan', 'Palermo'])], [R.prestige(15), R.gold(6)]),
  G('castile', 'tercio', 'The Tercios', 'Die Tercios', [], [C.either(C.innovation('pike_and_shot'), C.doctrine('infantry', 3))], [R.mod('tercio', 100, T('Tercios', 'Tercios'), { discipline: 0.03, morale: 0.03 })]),
  G('castile', 'faith', 'Defender of the Faith', 'Verteidiger des Glaubens', ['granada'], [C.faithUnity(0.9)], [R.mandate(10), R.mod('faith', 30, T('One faith, one crown', 'Ein Glaube, eine Krone'), { concord_gain: 0.05 })]),
  G('castile', 'great_power', 'An Empire on Which the Sun Never Sets', 'Ein Reich, in dem die Sonne nie untergeht', ['silver', 'naples'], [C.greatPower(), C.locs(300)], [R.prestige(30)]),
];

// ---------------- Aragon ----------------
const ARAGON: GoalDef[] = [
  G('aragon', 'sicily', 'The Sicilian Vespers Avenged', 'Die Sizilianische Vesper gerächt', [], [C.control('Palermo')], [R.prestige(15)]),
  G('aragon', 'sardinia', 'Sardinia Pacified', 'Sardinien befriedet', [], [C.own('Cagliari')], [R.gold(4), R.mod('sardinia', 20, T('Sardinian salt', 'Sardisches Salz'), { trade: 0.03 })]),
  G('aragon', 'mallorca', 'Kingdom of Mallorca', 'Königreich Mallorca', [], [C.own('Palma')], [R.authority(20)]),
  G('aragon', 'valencia', 'Garden of Valencia', 'Garten von Valencia', [], [C.own('Valencia'), C.dev(300)], [R.mod('valencia', 30, T('Huerta of Valencia', 'Huerta von Valencia'), { production: 0.04 })]),
  G('aragon', 'naples', 'Crown of Naples', 'Krone von Neapel', ['sicily'], [C.control('Naples')], [R.prestige(20), R.gold(8)]),
  G('aragon', 'corsica', 'Corsica', 'Korsika', ['sardinia'], [C.ownK(1, ['Ajaccio', 'Bastia'])], [R.prestige(5)]),
  G('aragon', 'athens', 'The Duchy of Athens', 'Das Herzogtum Athen', ['sicily'], [C.ownK(1, ['Athens', 'Thebes'])], [R.prestige(15)]),
  G('aragon', 'consulate', 'Consulate of the Sea', 'Konsulat des Meeres', [], [C.doctrine('commerce', 3)], [R.mod('consulate', 100, T('Consulate of the sea', 'Konsulat des Meeres'), { trade: 0.05 })]),
  G('aragon', 'ports', 'Mistress of the Western Sea', 'Herrin des westlichen Meeres', ['mallorca'], [C.building('port', 6, T('harbour levels', 'Hafenstufen'))], [R.mod('ports', 50, T('Catalan fleets', 'Katalanische Flotten'), { attrition: -0.05 })]),
  G('aragon', 'spain', 'Unite the Spanish Crowns', 'Die spanischen Kronen vereinen', [], [C.decision('form_spain', T('Union of the Spanish Crowns', 'Vereinigung der spanischen Kronen'))], [R.prestige(20), R.insight(50)]),
  G('aragon', 'cortes', 'Liberties of the Cortes', 'Freiheiten der Cortes', [], [C.lawIs('diet', 2, T('Regular parliament', 'Regelmäßiges Parlament')), C.concord(30)], [R.mod('cortes', 50, T('Pactism', 'Paktismus'), { unrest: -1, concord_gain: 0.05 })]),
  G('aragon', 'empire', 'Empire of the Middle Sea', 'Reich des Mittelmeers', ['naples', 'athens', 'ports'], [C.greatPower()], [R.prestige(25)]),
];

// ---------------- Portugal ----------------
const PORTUGAL: GoalDef[] = [
  G('portugal', 'ceuta', 'Across the Strait', 'Über die Meerenge', [], [C.own('Ceuta')], [R.prestige(15), R.mod('ceuta', 30, T('African crusade', 'Afrikanischer Kreuzzug'), { morale: 0.03, colonial_range: 0.05 })]),
  G('portugal', 'sovereign', 'Never Under Castile', 'Niemals unter Kastilien', [], [C.sovereign(), C.ally('england', T('England', 'England'))], [R.mandate(10), R.mod('alliance', 50, T('The oldest alliance', 'Das älteste Bündnis'), { dread_decay: 0.1 })]),
  G('portugal', 'islands', 'Islands of the Ocean', 'Inseln des Ozeans', [], [C.region(2, T('on the Atlantic islands', 'auf den Atlantischen Inseln'), [30, 40, -32, -15])], [R.mod('islands', 50, T('Island sugar', 'Inselzucker'), { trade: 0.04 })]),
  G('portugal', 'navigators', 'School of Navigators', 'Schule der Seefahrer', [], [C.either(C.innovation('caravel'), C.doctrine('seafaring', 3))], [R.insight(40), R.mod('navigators', 100, T('Navigators', 'Seefahrer'), { colonial_range: 0.08 })]),
  G('portugal', 'guinea', 'The Gold Coast', 'Die Goldküste', ['islands'], [C.region(1, T('in Guinea', 'in Guinea'), [0, 15, -18, 10])], [R.gold(10)]),
  G('portugal', 'cape', 'Round the Cape', 'Um das Kap', ['navigators'], [C.worldFlag('cape_rounded', T('the southern cape of Africa has been rounded', 'das Südkap Afrikas wurde umsegelt'))], [R.prestige(20), R.tech(1, 0.5)]),
  G('portugal', 'brazil', 'Land of the True Cross', 'Land vom Wahren Kreuz', ['guinea'], [C.region(2, T('in the southern lands across the ocean', 'in den südlichen Ländern jenseits des Ozeans'), [-35, 5, -60, -34])], [R.mod('brazil', 50, T('Brazilwood', 'Brasilholz'), { trade: 0.04, colonial_growth: 0.1 })]),
  G('portugal', 'tangier', 'The African Strongholds', 'Die afrikanischen Festungen', ['ceuta'], [C.own('Tangier')], [R.prestige(10)]),
  G('portugal', 'overseas', 'Empire of the Seas', 'Reich der Meere', ['brazil', 'cape'], [C.overseas(15)], [R.prestige(25)]),
  G('portugal', 'company', 'House of the Indies', 'Haus der Indien', ['overseas'], [C.decision('found_trading_company', T('Charter a Trading Company', 'Eine Handelskompanie privilegieren'))], [R.gold(15)]),
  G('portugal', 'colonial', 'Settlers of the Empire', 'Siedler des Reiches', [], [C.doctrine('seafaring', 7)], [R.mod('colonial', 50, T('Settler families', 'Siedlerfamilien'), { colonial_growth: 0.1 })]),
];

// ---------------- Venice ----------------
const VENICE: GoalDef[] = [
  G('venice', 'dalmatia', 'Lord of Dalmatia', 'Herr Dalmatiens', [], [C.own('Zara', 'Klis')], [R.prestige(10), R.cores(T('Dalmatia', 'Dalmatien'), box(42.3, 44.6, 14.5, 18.6))]),
  G('venice', 'terraferma', 'The Terraferma', 'Die Terraferma', [], [C.own('Padua', 'Verona', 'Vicenza')], [R.mod('terraferma', 50, T('Terraferma', 'Terraferma'), { manpower: 0.1, production: 0.03 })]),
  G('venice', 'lombardy', 'Up to the Adda', 'Bis an die Adda', ['terraferma'], [C.own('Brescia', 'Bergamo')], [R.gold(8)]),
  G('venice', 'crete', 'Kingdom of Candia', 'Königreich Candia', [], [C.own('Candia')], [R.mod('crete', 50, T('Cretan wine and sugar', 'Kretischer Wein und Zucker'), { trade: 0.04 })]),
  G('venice', 'negroponte', 'Negroponte', 'Negroponte', ['crete'], [C.own('Negroponte')], [R.prestige(10)]),
  G('venice', 'corfu', 'Gate of the Adriatic', 'Tor zur Adria', ['dalmatia'], [C.own('Corfu')], [R.mod('corfu', 50, T('Gate of the Adriatic', 'Tor zur Adria'), { fort_strength: 0.05, trade: 0.02 })]),
  G('venice', 'morea', 'The Eyes of the Republic', 'Die Augen der Republik', ['crete'], [C.own('Modon', 'Coron')], [R.gold(6)]),
  G('venice', 'cyprus', 'The Cypriot Crown', 'Die zyprische Krone', ['crete'], [C.ownK(1, ['Famagusta', 'Nicosia'])], [R.prestige(15), R.mod('cyprus', 30, T('Levant trade', 'Levantehandel'), { trade: 0.05 })]),
  G('venice', 'arsenal', 'The Great Arsenal', 'Das große Arsenal', [], [C.building('port', 5, T('harbour levels', 'Hafenstufen'))], [R.mod('arsenal', 100, T('The Arsenal', 'Das Arsenal'), { attrition: -0.05 })]),
  G('venice', 'bank', 'Bank of the Rialto', 'Bank am Rialto', [], [C.decision('charter_public_bank', T('Charter a Public Bank', 'Eine öffentliche Bank gründen'))], [R.mod('rialto', 100, T('Rialto bankers', 'Bankiers am Rialto'), { interest: -0.01 })]),
  G('venice', 'commerce', 'Queen of the Adriatic', 'Königin der Adria', ['arsenal'], [C.doctrine('commerce', 7)], [R.prestige(20)]),
  G('venice', 'treasury', 'The Golden Republic', 'Die goldene Republik', ['commerce'], [C.treasury(24)], [R.prestige(20), R.mandate(10)]),
];

// ---------------- Ottomans ----------------
const OTTOMAN: GoalDef[] = [
  G('ottoman', 'gallipoli', 'Bridgehead in Europe', 'Brückenkopf in Europa', [], [C.own('Gallipoli')], [R.prestige(10), R.mod('gallipoli', 30, T('Frontier of Rumelia', 'Grenze Rumeliens'), { manpower: 0.05 })]),
  G('ottoman', 'adrianople', 'Seat in Rumelia', 'Sitz in Rumelien', ['gallipoli'], [C.own('Adrianople')], [R.authority(30), R.cores(T('Thrace', 'Thrakien'), box(40.3, 42.2, 25.5, 29.0))]),
  G('ottoman', 'anatolia', 'Master of the Beyliks', 'Herr der Beyliks', [], [C.own('Ankara', 'Konya')], [R.prestige(15), R.cores(T('Anatolia', 'Anatolien'), culture('turkic'))]),
  G('ottoman', 'bulgaria', 'Conquest of Bulgaria', 'Eroberung Bulgariens', ['adrianople'], [C.own('Tarnovo', 'Varna')], [R.gold(6)]),
  G('ottoman', 'thessalonica', 'Thessalonica', 'Thessalonike', ['adrianople'], [C.own('Thessalonica')], [R.mod('salonica', 30, T('Port of Thessalonica', 'Hafen von Thessalonike'), { trade: 0.03 })]),
  G('ottoman', 'janissaries', 'The New Troops', 'Die neue Truppe', [], [C.either(C.lawIs('army', 3, T('Standing army', 'Stehendes Heer')), C.doctrine('infantry', 2))], [R.mod('janissaries', 100, T('Slave infantry of the Porte', 'Sklaveninfanterie der Pforte'), { discipline: 0.04, morale: 0.03 })]),
  G('ottoman', 'city', 'The Red Apple', 'Der Rote Apfel', ['thessalonica', 'bulgaria'], [C.own('Constantinople')], [R.prestige(30), R.authority(60)]),
  G('ottoman', 'serbia', 'The Serbian Despotate', 'Das serbische Despotat', ['bulgaria'], [C.own('Smederevo')], [R.prestige(10)]),
  G('ottoman', 'trebizond', 'The Black Sea a Turkish Lake', 'Das Schwarze Meer ein türkischer See', ['city'], [C.control('Trebizond', 'Caffa')], [R.mod('black_sea', 50, T('Black Sea trade', 'Schwarzmeerhandel'), { trade: 0.05 })]),
  G('ottoman', 'egypt', 'The Conquest of Egypt', 'Die Eroberung Ägyptens', ['city'], [C.own('Cairo', 'Damascus')], [R.gold(15), R.prestige(20)]),
  G('ottoman', 'holy_cities', 'Servant of the Two Holy Cities', 'Diener der beiden heiligen Städte', ['egypt'], [C.control('Mecca', 'Medina')], [R.mandate(15), R.mod('caliph', 100, T('Protector of the holy cities', 'Schutzherr der heiligen Städte'), { mandate_gain: 0.05 })]),
  G('ottoman', 'buda', 'The Gates of Hungary', 'Die Tore Ungarns', ['serbia'], [C.own('Belgrade', 'Buda')], [R.prestige(20)]),
  G('ottoman', 'rhodes', 'Rhodes', 'Rhodos', ['city'], [C.own('Rhodes')], [R.mod('rhodes', 30, T('Mastery of the Aegean', 'Herrschaft über die Ägäis'), { attrition: -0.03 })]),
  G('ottoman', 'vienna', 'The Golden Apple', 'Der Goldene Apfel', ['buda'], [C.own('Vienna')], [R.prestige(30)]),
  G('ottoman', 'baghdad', 'Baghdad', 'Bagdad', ['egypt'], [C.own('Baghdad')], [R.prestige(15), R.gold(8)]),
];

// ---------------- Moscow ----------------
const MOSCOW: GoalDef[] = [
  G('moscow', 'yoke', 'Stand on the River', 'Stehen am Fluss', [], [C.sovereign()], [R.prestige(20), R.mandate(10)]),
  G('moscow', 'tver', 'Humble Tver', 'Twer demütigen', [], [C.control('Tver')], [R.authority(30)]),
  G('moscow', 'ryazan', 'Gather the Rus', 'Die Rus sammeln', [], [C.control('Ryazan'), C.locs(60)], [R.cores(T('the Russian lands', 'die russischen Lande'), culture('east_slavic'))]),
  G('moscow', 'novgorod', 'Lord Novgorod the Great', 'Herr Groß-Nowgorod', ['tver'], [C.own('Novgorod')], [R.gold(10), R.mod('novgorod', 30, T('Furs of the north', 'Pelze des Nordens'), { trade: 0.05 })]),
  G('moscow', 'pskov', 'Pskov', 'Pskow', ['novgorod'], [C.own('Pskov')], [R.prestige(5)]),
  G('moscow', 'tsar', 'Tsar of All the Rus', 'Zar der ganzen Rus', ['yoke', 'novgorod'], [C.decision('proclaim_tsardom', T('Proclaim the Tsardom', 'Das Zarentum ausrufen'))], [R.prestige(20), R.insight(40)]),
  G('moscow', 'kazan', 'Kazan', 'Kasan', ['yoke'], [C.own('Kazan')], [R.prestige(15), R.cores(T('the Volga', 'die Wolga'), box(45, 57, 44, 52))]),
  G('moscow', 'astrakhan', 'The Volga to the Sea', 'Die Wolga bis zum Meer', ['kazan'], [C.own('Hajji Tarkhan')], [R.mod('volga', 50, T('Volga trade', 'Wolgahandel'), { trade: 0.05 })]),
  G('moscow', 'smolensk', 'Smolensk', 'Smolensk', ['ryazan'], [C.own('Smolensk')], [R.prestige(10)]),
  G('moscow', 'kiev', 'Mother of Russian Cities', 'Mutter der russischen Städte', ['smolensk'], [C.own('Kiev')], [R.prestige(20), R.mandate(10)]),
  G('moscow', 'siberia', 'Beyond the Stone Belt', 'Jenseits des Steinernen Gürtels', ['kazan'], [C.region(3, T('in Siberia', 'in Sibirien'), [54, 70, 60, 80])], [R.gold(10), R.mod('siberia', 50, T('Sable tribute', 'Zobeltribut'), { trade: 0.04 })]),
  G('moscow', 'baltic', 'Window on the West', 'Fenster nach Westen', ['novgorod'], [C.ownK(1, ['Riga', 'Narva', 'Reval'])], [R.mod('baltic', 100, T('Baltic port', 'Ostseehafen'), { trade: 0.05, research: 0.03 })]),
  G('moscow', 'army', 'New Order Regiments', 'Regimenter der neuen Ordnung', [], [C.era(2, ERA2), C.doctrine('infantry', 3)], [R.mod('new_order', 100, T('New order regiments', 'Regimenter der neuen Ordnung'), { discipline: 0.04 })]),
];

// ---------------- Poland ----------------
const POLAND: GoalDef[] = [
  G('poland', 'krakow_uni', 'Academy of Kraków', 'Akademie zu Krakau', [], [C.building('university', 1, T('university', 'Universität'))], [R.insight(30), R.prestige(5)]),
  G('poland', 'red_ruthenia', 'Red Ruthenia', 'Rotreußen', [], [C.own('Lemberg')], [R.cores(T('Red Ruthenia', 'Rotreußen'), box(48.5, 51, 22, 26.5)), R.gold(5)]),
  G('poland', 'mazovia', 'Mazovia', 'Masowien', [], [C.control('Warsaw', 'Płock')], [R.authority(25)]),
  G('poland', 'lithuania', 'Union with Lithuania', 'Union mit Litauen', [], [C.either(C.decision('union_of_krewo', T('Union of Poland and Lithuania', 'Union von Polen und Litauen')), C.subject('lithuania', T('Lithuania', 'Litauen')))], [R.prestige(20), R.manpower(0.3)]),
  G('poland', 'danzig', 'Access to the Sea', 'Zugang zum Meer', ['lithuania'], [C.own('Danzig')], [R.mod('danzig', 50, T('Vistula grain trade', 'Weichselgetreidehandel'), { trade: 0.06 })]),
  G('poland', 'marienburg', 'Humble the Order', 'Den Orden demütigen', ['danzig'], [C.either(C.own('Marienburg'), C.subject('teutonic_order', T('the Teutonic Order', 'den Deutschen Orden')))], [R.prestige(20)]),
  G('poland', 'silesia', 'Silesia', 'Schlesien', [], [C.own('Breslau')], [R.prestige(10), R.cores(T('Silesia', 'Schlesien'), box(49.8, 51.7, 15, 18.9))]),
  G('poland', 'sejm', 'The Sejm', 'Der Sejm', [], [C.lawIs('diet', 2, T('Regular parliament', 'Regelmäßiges Parlament'))], [R.mod('sejm', 100, T('Golden liberty', 'Goldene Freiheit'), { concord_gain: 0.05, cavalry: 0.05 })]),
  G('poland', 'kiev', 'Kiev', 'Kiew', ['lithuania'], [C.control('Kiev')], [R.prestige(15)]),
  G('poland', 'black_sea', 'From Sea to Sea', 'Von Meer zu Meer', ['kiev'], [C.region(1, T('on the Black Sea coast', 'an der Schwarzmeerküste'), [44, 47, 28, 34])], [R.prestige(25)]),
  G('poland', 'hussars', 'Winged Horsemen', 'Geflügelte Reiter', [], [C.doctrine('chivalry', 4)], [R.mod('hussars', 100, T('Winged hussars', 'Geflügelte Husaren'), { cavalry: 0.08 })]),
  G('poland', 'great_power', 'The Commonwealth', 'Die Adelsrepublik', ['lithuania', 'danzig'], [C.greatPower()], [R.prestige(25)]),
];

// ---------------- Hungary ----------------
const HUNGARY: GoalDef[] = [
  G('hungary', 'croatia', 'Crown of Croatia', 'Krone Kroatiens', [], [C.own('Zágráb')], [R.authority(20)]),
  G('hungary', 'dalmatia', 'Dalmatian Coast', 'Dalmatinische Küste', ['croatia'], [C.own('Zara')], [R.mod('dalmatia', 30, T('Dalmatian ports', 'Dalmatinische Häfen'), { trade: 0.04 })]),
  G('hungary', 'bosnia', 'Ban of Bosnia', 'Ban von Bosnien', [], [C.either(C.control('Jajce'), C.subject('bosnia', T('Bosnia', 'Bosnien')))], [R.prestige(10)]),
  G('hungary', 'wallachia', 'Overlord of the Danube', 'Oberherr der Donau', [], [C.either(C.subject('wallachia', T('Wallachia', 'die Walachei')), C.subject('moldavia', T('Moldavia', 'die Moldau')))], [R.prestige(15)]),
  G('hungary', 'belgrade', 'Bulwark of Christendom', 'Bollwerk der Christenheit', [], [C.own('Belgrade')], [R.mod('bulwark', 50, T('Bulwark of Christendom', 'Bollwerk der Christenheit'), { fort_strength: 0.08, morale: 0.03 })]),
  G('hungary', 'mines', 'Gold of the Mountains', 'Gold der Berge', [], [C.building('mine', 3, T('mine works', 'Bergwerksstufen'))], [R.mod('mines', 50, T('Mountain towns', 'Bergstädte'), { tax: 0.04 })]),
  G('hungary', 'black_army', 'The Black Army', 'Das Schwarze Heer', [], [C.either(C.lawIs('army', 3, T('Standing army', 'Stehendes Heer')), C.law('army', 1, T('Contract companies', 'Soldverträge')))], [R.mod('black_army', 50, T('The Black Army', 'Das Schwarze Heer'), { discipline: 0.03, mercenary_cost: -0.05 })]),
  G('hungary', 'library', 'Library of the King', 'Bibliothek des Königs', [], [C.doctrine('humanism', 2)], [R.insight(40)]),
  G('hungary', 'vienna', 'Lord of Vienna', 'Herr von Wien', ['black_army'], [C.own('Vienna')], [R.prestige(20)]),
  G('hungary', 'bohemia', 'Crown of Saint Wenceslas', 'Krone des heiligen Wenzel', ['vienna'], [C.control('Prague')], [R.prestige(20)]),
  G('hungary', 'endure', 'Hold the Danube', 'Die Donau halten', ['belgrade'], [C.after(1530, C.own('Buda', 'Belgrade'))], [R.mandate(15), R.prestige(15)]),
  G('hungary', 'great_power', 'Kingdom of Three Seas', 'Königreich der drei Meere', ['dalmatia', 'wallachia'], [C.greatPower()], [R.prestige(25)]),
];

// ---------------- Bohemia ----------------
const BOHEMIA: GoalDef[] = [
  G('bohemia', 'university', 'University of Prague', 'Universität Prag', [], [C.building('university', 1, T('university', 'Universität'))], [R.insight(30), R.prestige(5)]),
  G('bohemia', 'moravia', 'Margraviate of Moravia', 'Markgrafschaft Mähren', [], [C.control('Brno')], [R.authority(20)]),
  G('bohemia', 'silesia', 'Duchies of Silesia', 'Herzogtümer Schlesiens', [], [C.control('Breslau')], [R.prestige(10), R.cores(T('Silesia', 'Schlesien'), box(49.8, 51.7, 15, 18.9))]),
  G('bohemia', 'lusatia', 'The Lusatias', 'Die Lausitzen', ['silesia'], [C.control('Bautzen')], [R.gold(5)]),
  G('bohemia', 'brandenburg', 'The March of Brandenburg', 'Die Mark Brandenburg', ['lusatia'], [C.control('Berlin')], [R.prestige(15)]),
  G('bohemia', 'mines', 'Silver of Kuttenberg', 'Silber von Kuttenberg', [], [C.building('mine', 2, T('mine works', 'Bergwerksstufen'))], [R.mod('kuttenberg', 50, T('Silver of Kuttenberg', 'Silber von Kuttenberg'), { tax: 0.05 })]),
  G('bohemia', 'emperor', 'The Imperial Crown', 'Die Kaiserkrone', [], [C.emperor()], [R.prestige(20), R.mandate(10)]),
  G('bohemia', 'chalice', 'Peace of the Chalice', 'Friede des Kelches', [], [C.either(C.situation('hussite_movement', ['compacts', 'minority', 'suppressed'], T('the chalice movement has come to rest', 'die Kelchbewegung ist zur Ruhe gekommen')), C.after(1480, C.concord(20)))], [R.concord(15), R.mod('chalice', 30, T('Religious peace', 'Religionsfriede'), { unrest: -1 })]),
  G('bohemia', 'austria', 'Danube Lands', 'Donaulande', ['moravia'], [C.control('Vienna')], [R.prestige(20)]),
  G('bohemia', 'meissen', 'Meissen', 'Meißen', ['lusatia'], [C.control('Meissen')], [R.gold(6)]),
  G('bohemia', 'great_power', 'Heart of the Empire', 'Herz des Reiches', ['emperor', 'silesia'], [C.greatPower()], [R.prestige(25)]),
  // the Empire: the diet's reforms, the majesty of the crown, an election won
  G('bohemia', 'reform', 'Reform of the Empire', 'Reform des Reiches', ['emperor'], [C.imperialReforms(2)], [R.authority(30), R.mod('reform', 30, T('Reformer of the Empire', 'Erneuerer des Reiches'), { authority_gain: 0.05 })]),
  G('bohemia', 'majesty', 'Majesty of the Crown', 'Majestät der Krone', ['emperor'], [C.imperialAuthority(70)], [R.prestige(15), R.mandate(10)]),
  G('bohemia', 'election', 'The Crown Stays in Prague', 'Die Krone bleibt in Prag', ['emperor'], [C.electedEmperor(1)], [R.prestige(20), R.mod('election', 30, T('House of emperors', 'Kaiserhaus'), { diplomacy: 0.1 })]),
  // the estates: the code of the crown against the lords, and Powers at peace with it
  G('bohemia', 'code', 'Law of the Land', 'Landrecht', [], [C.codeProclaimed()], [R.authority(40)], T('The lords rejected the king’s code of land law; carry it, and the royal courts stand over theirs.', 'Die Herren verwarfen das Landrecht des Königs; setzt es durch, und die königlichen Gerichte stehen über den ihren.')),
  G('bohemia', 'estates', 'Lords and Towns Content', 'Herren und Städte zufrieden', [], [C.estateContent('magnates', 60, T('the magnates', 'die Magnaten')), C.estateContent('burghers', 60, T('the burghers', 'die Bürger'))], [R.concord(10), R.estate('burghers', 10, T('Burghers', 'Bürger'))]),
  // Silesia: Schweidnitz and Jauer, then the duchies under the crown itself
  G('bohemia', 'schweidnitz', 'Schweidnitz and Jauer', 'Schweidnitz und Jauer', ['silesia'], [C.control('Świdnica', 'Jawor')], [R.prestige(10), R.gold(4)]),
  G('bohemia', 'silesian_duchies', 'The Silesian Duchies', 'Die schlesischen Herzogtümer', ['schweidnitz'], [C.ownK(4, ['Legnica', 'Opole', 'Brzeg', 'Opava', 'Głogów', 'Racibórz'])], [R.authority(25), R.mod('silesian_duchies', 30, T('Crown lands of Silesia', 'Krongut in Schlesien'), { tax: 0.03 })]),
  // the chalice: after the peace, one kingdom again
  G('bohemia', 'one_kingdom', 'One Kingdom Again', 'Wieder ein Königreich', ['chalice'], [C.faithUnity(0.8), C.concord(40)], [R.concord(10), R.prestige(10)]),
];

// ---------------- Austria ----------------
const AUSTRIA: GoalDef[] = [
  G('austria', 'tyrol', 'The Tyrol', 'Tirol', [], [C.own('Hall in Tirol')], [R.mod('tyrol', 50, T('Tyrolean silver', 'Tiroler Silber'), { tax: 0.03 })]),
  G('austria', 'carinthia', 'Inner Austria', 'Innerösterreich', [], [C.own('Graz', 'Sankt Veit an der Glan')], [R.authority(25)]),
  G('austria', 'trieste', 'Port on the Adriatic', 'Hafen an der Adria', ['carinthia'], [C.own('Trieste')], [R.mod('trieste', 50, T('Adriatic port', 'Adriahafen'), { trade: 0.04 })]),
  G('austria', 'emperor', 'Crown of the Empire', 'Krone des Reiches', [], [C.emperor()], [R.prestige(25), R.mandate(10)]),
  G('austria', 'bohemia', 'Crown of Bohemia', 'Krone Böhmens', ['emperor'], [C.control('Prague')], [R.prestige(20)]),
  G('austria', 'hungary', 'Crown of Saint Stephen', 'Krone des heiligen Stephan', ['emperor'], [C.control('Buda')], [R.prestige(20), R.manpower(0.3)]),
  G('austria', 'low_countries', 'Burgundian Inheritance', 'Burgundisches Erbe', ['emperor'], [C.ownK(2, ['Brussels', 'Antwerp', 'Ghent', 'Bruges'])], [R.gold(12)]),
  G('austria', 'milan', 'Imperial Italy', 'Reichsitalien', ['emperor'], [C.control('Milan')], [R.prestige(15)]),
  G('austria', 'vienna', 'The City Holds', 'Die Stadt hält stand', [], [C.after(1530, C.own('Vienna')), C.after(1530, C.sovereign())], [R.mandate(15), R.mod('vienna', 50, T('Bulwark on the Danube', 'Bollwerk an der Donau'), { fort_strength: 0.08 })]),
  G('austria', 'reform', 'Enlightened Rule', 'Aufgeklärte Herrschaft', [], [C.era(3, ERA3), C.decision('abolish_serfdom', T('Abolish Serfdom', 'Die Leibeigenschaft aufheben'))], [R.concord(15), R.insight(50)]),
  G('austria', 'great_power', 'Let Others Wage War', 'Mögen andere Kriege führen', ['bohemia', 'hungary'], [C.greatPower()], [R.prestige(25)]),
];

// ---------------- Papal States ----------------
const PAPAL: GoalDef[] = [
  G('papal_states', 'rome', 'Return to Rome', 'Rückkehr nach Rom', [], [C.capitalAt('Rome')], [R.mandate(15), R.prestige(15)]),
  G('papal_states', 'romagna', 'Recover the Romagna', 'Die Romagna zurückgewinnen', [], [C.own('Bologna', 'Ravenna')], [R.authority(30)]),
  G('papal_states', 'umbria', 'Patrimony of Saint Peter', 'Patrimonium Petri', [], [C.own('Perugia')], [R.gold(4)]),
  G('papal_states', 'avignon', 'The Comtat', 'Das Comtat', [], [C.own('Avignon')], [R.gold(4)]),
  G('papal_states', 'schism', 'One Shepherd', 'Ein Hirte', [], [C.situation('western_schism', ['council', 'exhaustion', 'rome_fallen'], T('the division of the Church has ended', 'die Spaltung der Kirche ist beendet'))], [R.prestige(20), R.mandate(10)]),
  G('papal_states', 'reconquest', 'Crusade in Iberia', 'Kreuzzug in Iberien', [], [C.worldFlag('reconquista_done', T('the last emirate of Iberia has fallen', 'das letzte Emirat Iberiens ist gefallen'))], [R.prestige(10)]),
  G('papal_states', 'basilica', 'A New Basilica', 'Eine neue Basilika', ['rome'], [C.building('church', 6, T('church levels', 'Kirchenstufen'))], [R.mandate(10), R.mod('basilica', 100, T('Splendour of Rome', 'Glanz Roms'), { mandate_gain: 0.05 })]),
  G('papal_states', 'ferrara', 'Ferrara and Urbino', 'Ferrara und Urbino', ['romagna'], [C.own('Ferrara', 'Urbino')], [R.prestige(10)]),
  G('papal_states', 'holy_league', 'Holy League', 'Heilige Liga', [], [C.ally('venice', T('Venice', 'Venedig'))], [R.mod('league', 30, T('Holy League', 'Heilige Liga'), { morale: 0.03 })]),
  G('papal_states', 'renewal', 'Catholic Renewal', 'Katholische Erneuerung', [], [C.situation('reformation', ['settled', 'suppressed'], T('the Reformation has run its course', 'die Reformation ist zu Ende gegangen'))], [R.prestige(15), R.mandate(10)]),
];

// ---------------- Mamluks ----------------
const MAMLUK: GoalDef[] = [
  G('mamluk', 'jerusalem', 'Keeper of Jerusalem', 'Hüter Jerusalems', [], [C.own('Jerusalem', 'Damascus')], [R.mandate(10)]),
  G('mamluk', 'aleppo', 'Frontier of Aleppo', 'Grenze von Aleppo', [], [C.own('Aleppo')], [R.mod('aleppo', 30, T('Syrian frontier', 'Syrische Grenze'), { fort_strength: 0.05 })]),
  G('mamluk', 'holy_cities', 'Servant of the Holy Cities', 'Diener der heiligen Städte', [], [C.control('Mecca', 'Medina')], [R.prestige(20), R.mod('holy', 100, T('Protector of the holy cities', 'Schutzherr der heiligen Städte'), { mandate_gain: 0.05 })]),
  G('mamluk', 'alexandria', 'Spice Port of Alexandria', 'Gewürzhafen Alexandria', [], [C.own('Alexandria'), C.building('market', 4, T('market levels', 'Marktstufen'))], [R.mod('spice', 50, T('Spice trade', 'Gewürzhandel'), { trade: 0.06 })]),
  G('mamluk', 'cyprus', 'Tribute of Cyprus', 'Tribut Zyperns', [], [C.either(C.subject('cyprus', T('Cyprus', 'Zypern')), C.own('Famagusta'))], [R.gold(8)]),
  G('mamluk', 'aden', 'Gate of Tears', 'Tor der Tränen', ['holy_cities'], [C.own('Aden')], [R.mod('aden', 50, T('Red Sea trade', 'Handel des Roten Meeres'), { trade: 0.05 })]),
  G('mamluk', 'nubia', 'The Upper Nile', 'Der obere Nil', [], [C.region(3, T('in Nubia', 'in Nubien'), [15, 22.5, 29, 36])], [R.gold(6)]),
  G('mamluk', 'cilicia', 'The Armenian Kingdom', 'Das armenische Königreich', ['aleppo'], [C.gone('armenia_cilicia', T('Cilician Armenia', 'Kleinarmenien'))], [R.prestige(10)]),
  G('mamluk', 'guns', 'Guns for the Sultanate', 'Geschütze für das Sultanat', [], [C.either(C.innovation('arquebus'), C.doctrine('infantry', 2))], [R.mod('guns', 100, T('Firearms', 'Feuerwaffen'), { fire: 0.05 })]),
  G('mamluk', 'endure', 'Lords of Egypt', 'Herren Ägyptens', ['guns'], [C.after(1520, C.own('Cairo')), C.sovereign()], [R.mandate(15), R.prestige(20)]),
  G('mamluk', 'great_power', 'Sultan of Two Seas', 'Sultan zweier Meere', ['holy_cities', 'alexandria'], [C.greatPower()], [R.prestige(25)]),
];

// ---------------- Lithuania ----------------
const LITHUANIA: GoalDef[] = [
  G('lithuania', 'baptism', 'The Baptism', 'Die Taufe', [], [C.either(C.decision('baptism_of_the_grand_duke', T('Baptism of the Grand Duke', 'Taufe des Großfürsten')), C.decision('union_of_krewo', T('Union of Poland and Lithuania', 'Union von Polen und Litauen')))], [R.prestige(10), R.mandate(10)]),
  G('lithuania', 'samogitia', 'Samogitia', 'Schemaiten', [], [C.region(3, T('in Samogitia', 'in Schemaiten'), [55, 56.4, 21, 24])], [R.authority(20)]),
  G('lithuania', 'polotsk', 'Polotsk', 'Polozk', [], [C.control('Polotsk')], [R.gold(4)]),
  G('lithuania', 'kiev', 'Mother of Cities', 'Mutter der Städte', [], [C.control('Kiev')], [R.prestige(15), R.cores(T('Ruthenia', 'Ruthenien'), box(48, 53, 24, 34))]),
  G('lithuania', 'volhynia', 'Volhynia', 'Wolhynien', [], [C.control('Lutsk')], [R.manpower(0.2)]),
  G('lithuania', 'smolensk', 'Smolensk', 'Smolensk', ['polotsk'], [C.own('Smolensk')], [R.prestige(10)]),
  G('lithuania', 'black_sea', 'From the Baltic to the Black Sea', 'Von der Ostsee bis zum Schwarzen Meer', ['kiev'], [C.region(1, T('on the Black Sea coast', 'an der Schwarzmeerküste'), [44, 47, 28, 34])], [R.prestige(25)]),
  G('lithuania', 'order', 'The Great War with the Order', 'Der große Krieg mit dem Orden', ['baptism'], [C.either(C.gone('teutonic_order', T('the Teutonic Order', 'der Deutsche Orden')), C.warsWon(3))], [R.prestige(20), R.mod('order', 30, T('Victors over the Order', 'Sieger über den Orden'), { morale: 0.05 })]),
  G('lithuania', 'novgorod', 'Protector of Novgorod', 'Schutzherr Nowgorods', ['smolensk'], [C.control('Novgorod')], [R.gold(8)]),
  G('lithuania', 'statute', 'The Lithuanian Statute', 'Das Litauische Statut', [], [C.decision('codify_laws', T('Codify the Laws', 'Die Gesetze kodifizieren'))], [R.mod('statute', 100, T('Lithuanian statute', 'Litauisches Statut'), { control: 0.03, unrest: -1 })]),
  G('lithuania', 'great_power', 'Grand Duchy of the Rus', 'Großfürstentum der Rus', ['kiev', 'smolensk'], [C.greatPower()], [R.prestige(25)]),
];

// ---------------- generic tree ----------------
const GENERIC: GoalDef[] = [
  G(undefined, 'sovereign', 'Sovereign Crown', 'Souveräne Krone', [], [C.sovereign(), C.mandate(55)], [R.prestige(5), R.mandate(5)]),
  G(undefined, 'treasury', 'A Full Treasury', 'Ein voller Schatz', [], [C.treasury(12)], [R.mod('treasury', 20, T('Sound finances', 'Gesunde Finanzen'), { interest: -0.005, corruption: -0.01 })]),
  G(undefined, 'learning', 'Seat of Learning', 'Sitz der Gelehrsamkeit', [], [C.building('university', 1, T('university', 'Universität'))], [R.insight(30)]),
  G(undefined, 'doctrine', 'A Guiding Doctrine', 'Eine leitende Doktrin', [], [C.doctrines(3)], [R.insight(25)]),
  G(undefined, 'victory', 'Victorious Arms', 'Siegreiche Waffen', [], [C.warsWon(1)], [R.prestige(10), R.manpower(0.2)]),
  G(undefined, 'growth', 'A Growing Realm', 'Ein wachsendes Reich', ['sovereign'], [C.dev(150)], [R.authority(30), R.concord(5)]),
  G(undefined, 'alliances', 'Friends Abroad', 'Freunde in der Fremde', [], [{ t: T('have 2 allies', '2 Verbündete haben'), f: (e) => e.s.treaties.filter((t) => t.type === 'alliance' && t.until > e.s.day && (t.a === e.n.id || t.b === e.n.id)).length >= 2, p: (e) => [e.s.treaties.filter((t) => t.type === 'alliance' && t.until > e.s.day && (t.a === e.n.id || t.b === e.n.id)).length, 2] }], [R.mod('friends', 20, T('Trusted friends', 'Vertraute Freunde'), { dread_decay: 0.05 })]),
  G(undefined, 'knowledge', 'New Knowledge', 'Neues Wissen', ['learning'], [C.innovations(4)], [R.tech(1, 0.5), R.insight(20)]),
  G(undefined, 'harmony', 'Harmony of the Estates', 'Eintracht der Stände', [], [C.concord(25), { t: T('keep every Power of the Realm content (≥ 40)', 'alle Mächte des Reiches zufrieden halten (≥ 40)'), f: (e) => e.n.estates.length > 0 && e.n.estates.every((x) => x.contentment >= 40), p: (e) => [e.n.estates.filter((x) => x.contentment >= 40).length, Math.max(1, e.n.estates.length)] }], [R.mod('harmony', 20, T('Harmony of the estates', 'Eintracht der Stände'), { concord_gain: 0.05 })]),
  G(undefined, 'unity', 'One Faith', 'Ein Glaube', [], [C.faithUnity(0.95), C.locs(5)], [R.mandate(10)]),
  G(undefined, 'new_age', 'A New Age', 'Ein neues Zeitalter', ['knowledge'], [C.era(1, ERA1)], [R.insight(40), R.prestige(5)]),
  G(undefined, 'regional', 'Regional Power', 'Regionalmacht', ['growth', 'victory'], [C.dev(400), C.subjects(1)], [R.prestige(20)]),
  G(undefined, 'reason', 'Age of Reason', 'Zeitalter der Vernunft', ['new_age'], [C.era(3, ERA3)], [R.insight(60), R.concord(10)]),
  G(undefined, 'great', 'Among the Great', 'Unter den Großen', ['regional'], [C.greatPower()], [R.prestige(30)]),
];

export const GOALS: GoalDef[] = [...ENGLAND, ...FRANCE, ...CASTILE, ...ARAGON, ...PORTUGAL, ...VENICE, ...OTTOMAN, ...MOSCOW, ...POLAND, ...HUNGARY, ...BOHEMIA, ...AUSTRIA, ...PAPAL, ...MAMLUK, ...LITHUANIA, ...GENERIC];
/** Nation keys that have their own tree (everyone else uses the generic one). */
export const GOAL_NATIONS = new Set(GOALS.map((g) => g.nation).filter((x): x is string => !!x));
export const GOAL_INDEX: Record<string, GoalDef> = Object.fromEntries(GOALS.map((g) => [g.id, g]));
void clamp;
