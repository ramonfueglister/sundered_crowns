// Historical situations (world-level). Each has start conditions, monthly logic, stages and outcomes.
// Every situation must work without any human player: realms are found by key, checked for being alive, and AI
// realms make the choices (wars, obedience, conversion). Human realms are never made to declare wars; they are told.
import type { GameState, Nation, Situation, I18n } from '../types';
import type { World } from '../world';
import type { SituationDef } from '../systems/situations';
import { endSituation } from '../systems/situations';
import { seedPlague } from '../systems/society';
import { nearestLoc } from '../setup';
import { declareWar, nationLocsRO, nationDev, startCivilWar, require_military } from '../systems/war';
import { lawEffect } from '../systems/politics';
import { nationPower } from '../systems/ai';
import { greatGuns } from '../systems/military';
import { chronicle, notice, addOpinion, clamp, atWar, hasTreaty, opinion, allies } from '../ctx';
import { FAITH_INDEX, FAITHS, faithFamily, GROUP_OF, ALL_CULTURES } from './peoples';
import { INNOVATIONS } from './innovations';
import { rand, chance } from '../rng';
import { B, BI, C, UNITS } from '../defs';

// ---------------- helpers ----------------
const LATIN = FAITH_INDEX.latin;
const REFORM_FAITHS = [FAITH_INDEX.hussite, FAITH_INDEX.evangelical, FAITH_INDEX.reformed, FAITH_INDEX.anglican_type];
export const isReform = (f: number) => REFORM_FAITHS.includes(f);

function nat(s: GameState, key: string): Nation | undefined {
  for (const n of s.nations) if (n.key === key && n.alive) return n;
  return undefined;
}
function alive(s: GameState, id: number | undefined): Nation | undefined {
  if (id === undefined || id < 0) return undefined;
  const n = s.nations[id]; return n && n.alive ? n : undefined;
}
function human(s: GameState, id: number) { const n = s.nations[id]; return s.playerNations.includes(id) || !!n?.playerId; }
const NAME_CACHE = new WeakMap<World, Map<string, number>>();
export function locNamed(w: World, name: string): number {
  let m = NAME_CACHE.get(w);
  if (!m) { m = new Map(); for (let i = 0; i < w.L; i++) if (!m.has(w.names[i])) m.set(w.names[i], i); NAME_CACHE.set(w, m); }
  return m.get(name) ?? -1;
}
function setMod(s: GameState, n: Nation, id: string, years: number, label: I18n, effects: Record<string, number>) {
  n.modifiers = n.modifiers.filter((x) => x.id !== id);
  n.modifiers.push({ id, until: years >= 1000 ? 1e9 : s.day + Math.round(years * 365), label, effects });
}
function dropMod(n: Nation, id: string) { n.modifiers = n.modifiers.filter((x) => x.id !== id); }
function giveClaim(s: GameState, a: number, b: number, years: number) {
  if (!hasTreaty(s, a, b, 'claim')) s.treaties.push({ a: Math.min(a, b), b: Math.max(a, b), type: 'claim', since: s.day, until: s.day + Math.round(years * 365) });
}
function dropClaim(s: GameState, a: number, b: number) {
  s.treaties = s.treaties.filter((t) => !(t.type === 'claim' && ((t.a === a && t.b === b) || (t.a === b && t.b === a))));
}
function inAnyWar(s: GameState, id: number) { return s.wars.some((x) => x.att.includes(id) || x.def.includes(id)); }
/** An AI realm declares war (never a human one). Returns the war id or -1. */
function aiWar(s: GameState, w: World, a: number, b: number, goal: 'conquest' | 'faith' | 'reconquest' | 'coalition', locs: number[] = [], breakTruce = false): number {
  const A = alive(s, a), Bn = alive(s, b);
  if (!A || !Bn || a === b || human(s, a) || A.overlord >= 0) return -1;
  if (Bn.overlord === a || s.nations[topOver(s, b)]?.id === a) return -1; // never against our own subject
  if (atWar(s, a, b) || (hasTreaty(s, a, b, 'truce') && !(breakTruce && truceAge(s, a, b) >= 2))) return -1;
  const err = declareWar(s, w, a, b, goal, locs);
  if (err) return -1;
  return s.wars[s.wars.length - 1].id;
}
/** Years since the latest truce between a and b was made. A great campaign of a situation (the siege of the City,
 *  the war for Granada) may break a truce two years old, at the usual cost (see declareWar): truces from the many
 *  coalition and alliance wars between the two sides otherwise held these campaigns off for good. */
function truceAge(s: GameState, a: number, b: number): number {
  let since = -Infinity;
  for (const t of s.treaties) if (t.type === 'truce' && t.until > s.day && ((t.a === a && t.b === b) || (t.a === b && t.b === a))) since = Math.max(since, t.since);
  return since === -Infinity ? Infinity : (s.day - since) / 365;
}
function topOver(s: GameState, n: number): number { let k = n, g = 0; while (s.nations[k].overlord >= 0 && g++ < 10) k = s.nations[k].overlord; return k; }
function tell(s: GameState, text: I18n, who?: number[], loc?: number) {
  for (const p of s.playerNations) if (!who || who.includes(p)) notice(s, p, 'situation', text, loc !== undefined ? { loc } : {});
}
function world(s: GameState, text: I18n, nation = -1, loc?: number) { chronicle(s, nation, 'situation', text, loc); }
function avgUnrest(s: GameState, id: number) { const ls = nationLocsRO(s, id); let u = 0; for (const l of ls) u += s.loc.unrest[l]; return ls.length ? u / ls.length : 0; }
function neighboursOf(s: GameState, w: World, id: number): Set<number> {
  const out = new Set<number>();
  for (const l of nationLocsRO(s, id)) for (let e = w.adjStart[l]; e < w.adjStart[l + 1]; e++) { const v = w.adj[e]; if (v < w.L) { const o = s.loc.owner[v]; if (o >= 0 && o !== id) out.add(o); } }
  return out;
}
function innovationReached(s: GameState, key: string, loc: number) { const st = s.innovations.find((x) => x.key === key); return !!st && loc >= 0 && st.reached[loc] === 1; }
function innovationCount(s: GameState, key: string) { const st = s.innovations.find((x) => x.key === key); if (!st) return 0; let k = 0; for (let i = 0; i < st.reached.length; i++) k += st.reached[i]; return k; }
function adjDe(n: Nation) { const a = n.adj.de || n.short.de; return a.charAt(0).toUpperCase() + a.slice(1); }
/** Wrap a situation so that a content error can never break the tick; the error is kept for diagnostics. */
function guard(d: SituationDef): SituationDef {
  return {
    ...d,
    canStart: (s, w, y) => { try { return d.canStart(s, w, y); } catch { return false; } },
    start: (s, w, sit) => { try { d.start(s, w, sit); } catch (e) { sit.data.err = String(e); } },
    monthly: (s, w, sit, y, m) => { try { d.monthly(s, w, sit, y, m); } catch (e) { sit.data.err = String(e); sit.data.errs = (sit.data.errs || 0) + 1; } },
    outcomeText: d.outcomeText ? (s, sit) => { try { return d.outcomeText!(s, sit); } catch { return { en: `${d.name.en} has ended.`, de: `${d.name.de} ist beendet.` }; } } : undefined,
  };
}

// ---------------- faith spread (shared by the Hussite movement and the Reformation) ----------------
/** Spread a reform faith from location to location through Latin lands. */
/** `affinity` (optional) scales the chance per target location, e.g. a movement rooted in one people. */
function spreadFaith(s: GameState, w: World, faith: number, rate: number, seed: number, radiusKm: number, affinity?: (l: number) => number): number {
  const F = s.loc.faith, O = s.loc.owner; const add: number[] = [];
  const st = s.innovations.find((x) => x.key === 'printing_press');
  const curia = s.papacy.seat;
  for (let i = 0; i < w.L; i++) {
    if (F[i] !== faith) continue;
    for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) {
      const v = w.adj[e]; if (v >= w.L || F[v] !== LATIN) continue;
      const own = O[v]; if (own < 0) continue;
      const n = s.nations[own];
      let p = rate * (0.15 + s.loc.literacy[v] * 2) * (1 + s.loc.unrest[v] / 40);
      if (n.faith === faith) p *= 2.5; else if (n.faith !== LATIN) p *= 0.4;
      p *= clamp(1 + lawEffect(n, 'reform_pressure'), 0.3, 2);
      p *= 1 - clamp(lawEffect(n, 'conversion') * 0.5, 0, 0.5);
      if (st) p *= st.reached[v] ? 1.4 : 0.6;
      if (s.loc.buildings[v * B + BI.university] > 0) p *= 1.5;
      if (radiusKm > 0 && seed >= 0) p *= clamp(1 - w.distKm(seed, v) / radiusKm, 0, 1);
      if (curia >= 0) { const q = w.distKm(curia, v) / 1000; p *= clamp(q * q, 0.05, 1); } // the Curia's own lands hold fast
      if (affinity) p *= affinity(v);
      if (p > 0 && rand(s.rng) < clamp(p, 0, 0.35)) { add.push(v); break; }
    }
  }
  for (const v of add) { s.loc.minFaith[v] = LATIN; s.loc.minShare[v] = 0.3; F[v] = faith; s.loc.unrest[v] = clamp(s.loc.unrest[v] + 8, 0, 100); }
  return add.length;
}
/** Latin renewal: reform locations under Latin rulers drift back. */
function counterSpread(s: GameState, w: World, faith: number, rate: number) {
  const F = s.loc.faith, O = s.loc.owner; let k = 0;
  for (let i = 0; i < w.L; i++) {
    if (F[i] !== faith) continue;
    const own = O[i]; if (own < 0) continue;
    const n = s.nations[own]; if (n.faith !== LATIN) continue;
    const p = rate * (1 + clamp(lawEffect(n, 'conversion'), 0, 1) * 2 - clamp(lawEffect(n, 'tolerance'), 0, 1)) * s.loc.control[i];
    if (rand(s.rng) < p) { F[i] = LATIN; s.loc.minFaith[i] = faith; s.loc.minShare[i] = 0.2; k++; }
  }
  return k;
}
function faithShare(s: GameState, id: number, faith: number) {
  let a = 0, t = 0; for (const l of nationLocsRO(s, id)) { const d = Math.max(1, s.loc.dev[l]); t += d; if (s.loc.faith[l] === faith) a += d; } return t ? a / t : 0;
}
export function faithLocs(s: GameState, w: World, faith: number) { let k = 0; for (let i = 0; i < w.L; i++) if (s.loc.faith[i] === faith) k++; return k; }
/** A realm turns to a new faith: Powers of the Realm, the Curia and the neighbours react. */
export function convertRealm(s: GameState, w: World, n: Nation, faith: number) {
  const old = n.faith; if (old === faith) return;
  n.faith = faith;
  if (n.capital >= 0) s.loc.faith[n.capital] = faith;
  for (const e of n.estates) {
    if (e.id === 'prelates') e.contentment = clamp(e.contentment - 20, 0, 100);
    if (e.id === 'burghers') e.contentment = clamp(e.contentment + 6, 0, 100);
    if (e.id === 'magnates') e.contentment = clamp(e.contentment + 4, 0, 100);
  }
  if (isReform(faith) && old === LATIN) {
    n.treasury += Math.max(10, n.income.tax || 10) * 6; // church lands
    n.excommunicated = false; dropMod(n, 'excommunicated');
    delete s.papacy.curiaFavour[n.id];
  }
  if (faith === LATIN) s.papacy.curiaFavour[n.id] = 20;
  n.concord = clamp(n.concord - 10, -100, 100);
  for (const o of s.nations) {
    if (!o.alive || o.id === n.id) continue;
    if (o.faith === old) addOpinion(s, o.id, n.id, 'apostasy', -20, 365 * 20);
    if (o.faith === faith) { addOpinion(s, o.id, n.id, 'brethren', 15, 365 * 20); addOpinion(s, n.id, o.id, 'brethren', 15, 365 * 20); }
  }
  n.flags.faith_changed = s.day;
  const fn = { en: FAITH_NAMES[faith]?.en ?? 'a new faith', de: FAITH_NAMES[faith]?.de ?? 'einen neuen Glauben' };
  const t = { en: `${n.short.en} embraced the ${fn.en}.`, de: `${n.short.de} wandte sich der Konfession „${fn.de}“ zu.` };
  world(s, t, n.id, n.capital);
  tell(s, t);
}
const FAITH_NAMES: I18n[] = FAITHS.map((f) => f.name);

/** AI realms of the Latin church decide whether to follow their subjects into the new faith (yearly). */
function aiConversions(s: GameState, w: World, faiths: number[], hard: number, soft: number, m: number) {
  for (const n of s.nations) {
    if (!n.alive || n.faith !== LATIN || (n.id + m) % 12 !== 0 || n.capital < 0) continue;
    if (n.key === 'papal_states' || n.gov === 'theocracy') continue;
    let best = -1, bs = 0;
    for (const f of faiths) { const sh = faithShare(s, n.id, f); if (sh > bs) { bs = sh; best = f; } }
    if (best < 0 || bs < (n.isHRE ? soft : hard)) continue; // outside the Empire only a land already won over moves its crown
    if (human(s, n.id)) {
      if (!n.flags[`reform_hint_${best}`]) { n.flags[`reform_hint_${best}`] = s.day; notice(s, n.id, 'situation', { en: `Much of our realm has turned to the ${FAITH_NAMES[best].en}. We may adopt it through a decision.`, de: `Ein großer Teil unseres Reiches hat sich der Konfession „${FAITH_NAMES[best].de}“ zugewandt. Wir können sie durch eine Entscheidung annehmen.` }); }
      continue;
    }
    const emp = alive(s, s.empire.emperor);
    let p = bs >= hard ? 0.25 : 0.05;
    if (s.papacy.seat >= 0 && w.distKm(n.capital, s.papacy.seat) < 900) p *= 0.15; // under the eyes of the Curia
    if (!n.isHRE) p *= 0.35; // great crowns outside the Empire hold their churches tighter
    const size = nationLocsRO(s, n.id).length;
    if (size > 40) p *= 0.35; else if (size > 15) p *= 0.7;
    if (n.isHRE && emp && emp.id !== n.id && (n.rivals.includes(emp.id) || opinion(s, n.id, emp.id) < 0)) p += 0.1;
    if ((s.papacy.curiaFavour[n.id] ?? 0) < 20) p += 0.05;
    if (n.excommunicated) p += 0.15;
    const bur = n.estates.find((e) => e.id === 'burghers'); if (bur && bur.influence > 30) p += 0.05;
    if (lawEffect(n, 'reform_pressure') < -0.2) p *= 0.5;
    if (chance(s.rng, p)) convertRealm(s, w, n, best);
  }
}

const CHALICE_CULTURES = new Set(['czech', 'slovak']);

// ---------------- the situations ----------------
const DEFS: SituationDef[] = [
  {
    id: 'great_pestilence', name: { en: 'The Returning Pestilence', de: 'Die wiederkehrende Pestilenz' },
    desc: { en: 'The great mortality of 1347–51 returns in waves. Dense towns and ports suffer most; labour grows scarce and wages rise.', de: 'Das große Sterben von 1347–51 kehrt in Wellen zurück. Dichte Städte und Häfen leiden am meisten; Arbeitskraft wird knapp, Löhne steigen.' },
    stages: [{ en: 'Lull', de: 'Atempause' }, { en: 'Outbreak', de: 'Ausbruch' }],
    canStart: (s, w, y) => y >= 1356 && y < 1700,
    start: (s, w, sit) => { sit.data.next = 1361; },
    monthly: (s, w, sit, y, m) => {
      // historical waves: 1361 (pestis secunda), 1369, 1374, 1390, 1400, then roughly every 10–15 years
      if (y >= sit.data.next && m === 3) {
        const origins: [number, number][] = [[2.35, 48.85], [12.33, 45.44], [28.97, 41.01], [-0.12, 51.5], [14.25, 40.85], [4.35, 50.85]];
        const o = origins[(y * 7) % origins.length];
        seedPlague(s, w, nearestLoc(w, o[0], o[1]), 0.9);
        sit.stage = 1; sit.progress = 100; sit.data.last = y; sit.data.waves = (sit.data.waves || 0) + 1;
        const gaps = [8, 5, 16, 10, 12, 14, 11, 13];
        sit.data.next = y + gaps[Math.floor(y / 3) % gaps.length];
      } else if (sit.progress > 0) { sit.progress = Math.max(0, sit.progress - 5); if (!sit.progress) sit.stage = 0; }
      if (y >= 1700) endSituation(s, sit, 'receded');
    },
    outcomeText: (s, sit) => ({ en: `The pestilence has receded from Europe after ${sit.data.waves || 0} great waves.`, de: `Die Pestilenz ist nach ${sit.data.waves || 0} großen Wellen aus Europa gewichen.` }),
  },

  // ------------------------------------------------------------------------------------------------
  {
    id: 'crown_of_france', name: { en: 'The Contest for the Crown of France', de: 'Der Streit um die Krone Frankreichs' },
    desc: { en: 'The kings of England claim the French throne. Progress shows how much of the French realm the English crown and its allies hold: above zero England gains ground, below zero France recovers it.', de: 'Die Könige von England beanspruchen den französischen Thron. Der Fortschritt zeigt, wie viel vom französischen Reich die englische Krone und ihre Verbündeten halten: über null gewinnt England, unter null erobert Frankreich zurück.' },
    stages: [{ en: 'The Edwardian War', de: 'Der Eduardische Krieg' }, { en: 'Truces and Reconquest', de: 'Waffenstillstände und Rückeroberung' }, { en: 'The Lancastrian Conquest', de: 'Die Lancastrische Eroberung' }, { en: 'Recovery of the Realm', de: 'Wiederherstellung des Reiches' }],
    canStart: (s, w, y) => y >= 1337 && y < 1430 && !!nat(s, 'england') && !!nat(s, 'france'),
    start: (s, w, sit) => {
      const en = nat(s, 'england')!, fr = nat(s, 'france')!;
      sit.data.en = en.id; sit.data.fr = fr.id;
      // the French realm: everything France, its vassals and the English crown hold on the continent at the start
      const land: number[] = [];
      for (let i = 0; i < w.L; i++) {
        const o = s.loc.owner[i]; if (o < 0) continue;
        const on = s.nations[o];
        const french = o === fr.id || on.overlord === fr.id || (o === en.id && w.lon[i] > -5 && w.lat[i] < 51.2 && w.lat[i] > 42);
        const gall = GROUP_OF[ALL_CULTURES[s.loc.culture[i]]] === 'gallic' && w.lat[i] > 42 && w.lon[i] < 8;
        if (french || (gall && (on.overlord === fr.id || o === en.id))) land.push(i);
      }
      sit.data.land = land; sit.data.held = 0; sit.data.nextWar = 1369; sit.data.domMonths = 0;
      giveClaim(s, en.id, fr.id, 120);
    },
    monthly: (s, w, sit, y, m) => {
      const en = alive(s, sit.data.en), fr = alive(s, sit.data.fr);
      if (!en || !fr) { endSituation(s, sit, en ? 'france_fell' : 'england_fell'); return; }
      if (m % 3 === 0) {
        const land: number[] = sit.data.land; let held = 0;
        const side = new Set<number>([en.id, ...s.nations.filter((x) => x.alive && x.overlord === en.id).map((x) => x.id)]);
        for (const a of allies(s, en.id)) if (!allies(s, fr.id).includes(a)) side.add(a);
        for (const l of land) if (side.has(s.loc.owner[l]) || side.has(s.loc.ctrl[l])) held++;
        sit.data.held = held;
        const share = land.length ? held / land.length : 0;
        sit.progress = Math.round(clamp((share - 0.15) * 250, -100, 100));
        sit.data.domMonths = share > 0.55 ? (sit.data.domMonths || 0) + 3 : 0;
        sit.stage = y < 1369 ? 0 : y < 1415 ? 1 : share > 0.3 ? 2 : 3;
      }
      // the war is fought in bouts: whoever has the upper hand renews it once the truce runs out
      if (m === 4 && y >= sit.data.nextWar && !atWar(s, en.id, fr.id) && !hasTreaty(s, en.id, fr.id, 'truce')) {
        const att = sit.progress > 10 ? fr : (y >= 1410 ? en : (chance(s.rng, 0.5) ? fr : en));
        const def = att === fr ? en : fr;
        giveClaim(s, en.id, fr.id, 60);
        const land: number[] = sit.data.land;
        const goal = land.filter((l) => s.loc.owner[l] === def.id).sort((a, b) => s.loc.dev[b] - s.loc.dev[a]).slice(0, 6);
        if (aiWar(s, w, att.id, def.id, 'conquest', goal) >= 0) {
          sit.data.nextWar = y + 6 + Math.floor(rand(s.rng) * 8); sit.data.bouts = (sit.data.bouts || 0) + 1;
          world(s, { en: `The war between ${en.short.en} and ${fr.short.en} for the crown of France flared up again.`, de: `Der Krieg zwischen ${en.short.de} und ${fr.short.de} um die Krone Frankreichs flammte wieder auf.` }, att.id);
        } else sit.data.nextWar = y + 2;
      }
      // the burden of the long war and the rally of the realm
      setMod(s, en, 'crown_of_france', 1, { en: 'Claim to the French crown', de: 'Anspruch auf die französische Krone' }, { manpower: 0.05, mandate_gain: sit.progress > 30 ? 0.05 : -0.03 });
      if (y >= 1429 && sit.progress > 0) setMod(s, fr, 'rally_of_france', 1, { en: 'Rallying of the realm', de: 'Erhebung des Reiches' }, { morale: 0.1, manpower: 0.1 });
      else setMod(s, fr, 'rally_of_france', 1, { en: 'Defence of the realm', de: 'Verteidigung des Reiches' }, { fort_strength: 0.05, concord_gain: sit.progress > 30 ? -0.05 : 0.02 });
      // ends
      const share = (sit.data.land as number[]).length ? sit.data.held / (sit.data.land as number[]).length : 0;
      if ((sit.data.domMonths || 0) >= 36) { finishCrown(s, sit, en, fr, 'english_crown'); return; }
      if (y >= 1430 && share <= 0.01 && !atWar(s, en.id, fr.id)) { finishCrown(s, sit, en, fr, 'french_victory'); return; }
      if (y >= 1453 && !atWar(s, en.id, fr.id)) { finishCrown(s, sit, en, fr, share > 0.1 ? 'partition' : 'french_victory'); return; }
      if (y >= 1475) finishCrown(s, sit, en, fr, 'exhaustion');
    },
    outcomeText: (s, sit) => {
      const en = s.nations[sit.data.en], fr = s.nations[sit.data.fr];
      const o = sit.outcome;
      if (o === 'english_crown') return { en: `The kings of ${en.short.en} wear the crown of France: a dual monarchy rules both sides of the Channel.`, de: `Die Könige von ${en.short.de} tragen die Krone Frankreichs: eine Doppelmonarchie herrscht zu beiden Seiten des Kanals.` };
      if (o === 'french_victory') return { en: `${fr.short.en} has driven the English from the realm. The long contest is over.`, de: `${fr.short.de} hat die Engländer aus dem Reich vertrieben. Der lange Streit ist vorbei.` };
      if (o === 'partition') return { en: `A treaty divides France between ${en.short.en} and ${fr.short.en}.`, de: `Ein Vertrag teilt Frankreich zwischen ${en.short.de} und ${fr.short.de}.` };
      if (o === 'france_fell') return { en: `The French crown has fallen; the contest is moot.`, de: `Die französische Krone ist gefallen; der Streit ist gegenstandslos.` };
      if (o === 'england_fell') return { en: `The English crown has fallen; its claim to France dies with it.`, de: `Die englische Krone ist gefallen; ihr Anspruch auf Frankreich stirbt mit ihr.` };
      return { en: `Exhausted, ${en.short.en} and ${fr.short.en} let the claim to the French crown rest.`, de: `Erschöpft lassen ${en.short.de} und ${fr.short.de} den Anspruch auf die französische Krone ruhen.` };
    },
    involved: (s, sit) => [sit.data.en, sit.data.fr].filter((x) => x !== undefined),
  },

  // ------------------------------------------------------------------------------------------------
  {
    id: 'western_schism', name: { en: 'The Great Division of the Church', de: 'Die große Spaltung der Kirche' },
    desc: { en: 'Two men claim the throne of Saint Peter, one in Rome and one in Avignon. Every Latin realm must choose its obedience. Realms of opposite obedience distrust each other, and the scandal drives the call for a council of reform.', de: 'Zwei Männer beanspruchen den Stuhl Petri, einer in Rom und einer in Avignon. Jedes lateinische Reich muss seine Obödienz wählen. Reiche verschiedener Obödienz misstrauen einander, und der Skandal treibt den Ruf nach einem Reformkonzil.' },
    stages: [{ en: 'Two Popes', de: 'Zwei Päpste' }, { en: 'Rival Councils', de: 'Rivalisierende Konzile' }, { en: 'The Council of Union', de: 'Das Unionskonzil' }],
    canStart: (s, w, y) => y >= 1378 && y < 1420 && !!nat(s, 'papal_states') && !s.flags.schism_done,
    start: (s, w, sit) => {
      const P = s.papacy; const ps = nat(s, 'papal_states')!;
      const fr = nat(s, 'france');
      P.schism = true; P.holder = ps.id;
      P.antipope = fr && fr.faith === LATIN ? fr.id : -1;
      sit.data.rome = ps.id; sit.data.avignon = P.antipope;
      const rome = locNamed(w, 'Rome'); if (rome >= 0) P.seat = rome;
      for (const n of s.nations) if (n.alive && n.faith === LATIN) n.flags.obedience = chooseObedience(s, n, sit);
    },
    monthly: (s, w, sit, y, m) => {
      const P = s.papacy;
      const ps = alive(s, sit.data.rome);
      if (!ps) { finishSchism(s, sit, 'rome_fallen'); return; }
      if (!P.schism && s.day - sit.started > 31) { finishSchism(s, sit, 'council'); return; } // healed by a council elsewhere (event)
      let rome = 0, avi = 0;
      for (const n of s.nations) {
        if (!n.alive || n.faith !== LATIN) continue;
        if (n.flags.obedience === undefined) n.flags.obedience = chooseObedience(s, n, sit);
        const d = Math.max(1, nationDev(s, n.id)); if (n.flags.obedience === 1) avi += d; else rome += d;
      }
      const balance = rome + avi > 0 ? Math.min(rome, avi) / (rome + avi) * 2 : 0;
      sit.data.romeShare = rome + avi > 0 ? Math.round(rome / (rome + avi) * 100) : 100;
      P.reformPressure = clamp(P.reformPressure + 0.06 + 0.12 * balance, 0, 100);
      sit.progress = Math.round(P.reformPressure);
      sit.stage = P.reformPressure >= 55 && y >= 1409 ? 2 : P.reformPressure >= 35 ? 1 : 0;
      if (m === 1) {
        // a divided Christendom: mistrust between realms of different obedience, a shaken Mandate everywhere
        const latin = s.nations.filter((n) => n.alive && n.faith === LATIN && n.capital >= 0);
        for (const a of latin) {
          setMod(s, a, 'divided_church', 1.1, { en: 'Divided Church', de: 'Gespaltene Kirche' }, { mandate_gain: -0.03 });
          for (const b of latin) if (a.id !== b.id && a.flags.obedience !== b.flags.obedience && w.distKm(a.capital, b.capital) < 1300) addOpinion(s, a.id, b.id, 'schism', -15, 400);
        }
        const av = alive(s, sit.data.avignon); if (av) av.authority += 10; // the Avignon claimant's patron
      }
      if (sit.stage === 2 && m === 6 && (P.reformPressure >= 65 || chance(s.rng, 0.25))) { finishSchism(s, sit, 'council'); return; }
      if (y >= 1440) finishSchism(s, sit, 'exhaustion');
    },
    outcomeText: (s, sit) => {
      if (sit.outcome === 'council') { const em = s.nations[sit.data.convener ?? -1]; return { en: `A general council${em ? ` called by ${em.short.en}` : ''} deposed the rival popes and elected one pontiff. The Church is one again, but the call for reform remains.`, de: `Ein allgemeines Konzil${em ? `, einberufen von ${em.short.de},` : ''} setzte die rivalisierenden Päpste ab und wählte einen einzigen Papst. Die Kirche ist wieder geeint, doch der Ruf nach Reform bleibt.` }; }
      if (sit.outcome === 'rome_fallen') return { en: 'With the fall of the Roman see, the Avignon line remains the only claimant.', de: 'Mit dem Fall des römischen Stuhls bleibt die Linie von Avignon der einzige Anwärter.' };
      return { en: 'Weary of the scandal, the realms let the rival lines of popes die out. The Church is one again.', de: 'Des Skandals müde lassen die Reiche die rivalisierenden Papstlinien aussterben. Die Kirche ist wieder geeint.' };
    },
    involved: (s, sit) => [sit.data.rome, sit.data.avignon].filter((x) => x !== undefined && x >= 0),
  },

  // ------------------------------------------------------------------------------------------------
  {
    id: 'hussite_movement', name: { en: 'The Chalice Movement', de: 'Die Kelchbewegung' },
    desc: { en: 'A university preacher condemns the wealth of the clergy and the sale of indulgences. Where the Church is corrupt and the people restless, his followers spread from town to town. If a crown adopts the new church, crusades follow.', de: 'Ein Universitätsprediger verurteilt den Reichtum des Klerus und den Ablasshandel. Wo die Kirche verdorben und das Volk unruhig ist, verbreiten sich seine Anhänger von Stadt zu Stadt. Nimmt eine Krone die neue Kirche an, folgen Kreuzzüge.' },
    stages: [{ en: 'Preaching in the Chapel', de: 'Predigt in der Kapelle' }, { en: 'Crusades against the Chalice', de: 'Kreuzzüge gegen den Kelch' }, { en: 'Compacts', de: 'Kompaktaten' }],
    canStart: (s, w, y) => y >= 1400 && y < 1470 && !s.flags.hussite_done && s.papacy.reformPressure >= 30 && s.papacy.corruption >= 40 && hussiteSeed(s, w) >= 0 && chance(s.rng, 1 / 24),
    start: (s, w, sit) => {
      const seed = hussiteSeed(s, w); sit.data.seed = seed; sit.data.wars = 0; sit.data.nextCrusade = 0;
      s.loc.faith[seed] = FAITH_INDEX.hussite; s.loc.unrest[seed] = clamp(s.loc.unrest[seed] + 15, 0, 100);
      sit.data.owner = s.loc.owner[seed];
      const on = s.nations[s.loc.owner[seed]];
      world(s, { en: `A preacher in ${w.names[seed]} denounced the corruption of the Church; crowds take the chalice.`, de: `Ein Prediger in ${w.namesDe[seed]} prangerte die Verderbnis der Kirche an; die Menge nimmt den Kelch.` }, on?.id ?? -1, seed);
    },
    monthly: (s, w, sit, y, m) => {
      const H = FAITH_INDEX.hussite;
      // the chalice is a Czech movement: German and other towns take it up far more rarely
      if (m % 2 === 0) spreadFaith(s, w, H, 0.22, sit.data.seed, 380, (l) => (CHALICE_CULTURES.has(ALL_CULTURES[s.loc.culture[l]]) ? 1 : 0.15));
      const count = faithLocs(s, w, H); sit.progress = Math.min(100, count);
      aiConversions(s, w, [H], 0.5, 0.35, m);
      // the land of the preacher: once most of it holds the chalice, the estates force the crown to follow (or depose it)
      const home = alive(s, sit.data.owner);
      if (home && home.faith === LATIN && m === 5 && !human(s, home.id) && faithShare(s, home.id, H) >= 0.5 && chance(s.rng, 0.25)) convertRealm(s, w, home, H);
      const realms = s.nations.filter((n) => n.alive && n.faith === H);
      if (realms.length && sit.stage === 0) { sit.stage = 1; sit.data.realmSince = s.day; }
      // crusades: the Emperor (or the strongest Latin neighbour) marches against a heretic crown
      if (sit.stage === 1 && m === 3 && y >= sit.data.nextCrusade && sit.data.wars < 4) {
        for (const h of realms) {
          if (inAnyWar(s, h.id)) continue;
          const emp = alive(s, s.empire.emperor);
          let lead = emp && emp.faith === LATIN && emp.id !== h.id ? emp : undefined;
          if (!lead) { const ns = [...neighboursOf(s, w, h.id)].map((x) => s.nations[x]).filter((x) => x.faith === LATIN && x.overlord < 0).sort((a, b) => nationDev(s, b.id) - nationDev(s, a.id)); lead = ns[0]; }
          if (!lead) continue;
          giveClaim(s, lead.id, h.id, 20);
          const wid = aiWar(s, w, lead.id, h.id, 'faith', h.capital >= 0 ? [h.capital] : []);
          if (wid >= 0) {
            sit.data.wars++; sit.data.nextCrusade = y + 4;
            const war = s.wars.find((x) => x.id === wid);
            if (war) for (const nb of neighboursOf(s, w, h.id)) { const o = s.nations[nb]; if (o.alive && o.faith === LATIN && o.overlord < 0 && !human(s, o.id) && !war.att.includes(o.id) && !war.def.includes(o.id) && chance(s.rng, 0.4)) war.att.push(o.id); }
            world(s, { en: `A crusade was proclaimed against the chalice in ${h.short.en}.`, de: `Gegen den Kelch in ${h.short.de} wurde ein Kreuzzug ausgerufen.` }, lead.id, h.capital);
            tell(s, { en: `A crusade has been proclaimed against ${h.short.en}.`, de: `Gegen ${h.short.de} wurde ein Kreuzzug ausgerufen.` });
          }
        }
      }
      for (const h of realms) setMod(s, h, 'chalice_and_wagon', 1, { en: 'Chalice and wagon fort', de: 'Kelch und Wagenburg' }, { morale: 0.1, fort_strength: 0.1, manpower: 0.1 });
      const crusading = s.wars.some((x) => x.goal.type === 'faith' && realms.some((h) => x.def.includes(h.id)));
      if (sit.stage === 1 && !crusading && s.day - (sit.data.realmSince || s.day) > 365 * 12) sit.stage = 2;
      if (sit.stage === 2 && m === 8) { finishHussite(s, w, sit, 'compacts'); return; }
      if (count === 0 && s.day - sit.started > 365 * 3) { finishHussite(s, w, sit, 'suppressed'); return; }
      if (y >= 1480) finishHussite(s, w, sit, realms.length ? 'compacts' : 'minority');
    },
    outcomeText: (s, sit) => {
      if (sit.outcome === 'compacts') return { en: 'The Church made its peace with the chalice: the reformed church of the movement is tolerated where it rules.', de: 'Die Kirche schloss Frieden mit dem Kelch: die Kirche der Bewegung wird geduldet, wo sie herrscht.' };
      if (sit.outcome === 'suppressed') return { en: 'The chalice movement was stamped out; its preachers burned or fled.', de: 'Die Kelchbewegung wurde ausgerottet; ihre Prediger verbrannt oder geflohen.' };
      return { en: 'The chalice movement survives only as a minority in the shadow of the Latin Church.', de: 'Die Kelchbewegung überlebt nur als Minderheit im Schatten der lateinischen Kirche.' };
    },
    involved: (s) => s.nations.filter((n) => n.alive && n.faith === FAITH_INDEX.hussite).map((n) => n.id),
  },

  // ------------------------------------------------------------------------------------------------
  {
    id: 'reformation', name: { en: 'The Reformation', de: 'Die Reformation' },
    desc: { en: 'Printed pamphlets carry the protest against a corrupt Church across Europe. The new teaching spreads from town to town; princes choose whether to follow it, gaining church lands and losing the favour of the Curia.', de: 'Gedruckte Flugschriften tragen den Protest gegen eine verdorbene Kirche durch Europa. Die neue Lehre verbreitet sich von Stadt zu Stadt; Fürsten entscheiden, ob sie ihr folgen, gewinnen Kirchengut und verlieren die Gunst der Kurie.' },
    stages: [{ en: 'Theses on the Church Door', de: 'Thesen an der Kirchentür' }, { en: 'The Princes’ Reformation', de: 'Die Fürstenreformation' }, { en: 'The Second Reformation', de: 'Die Zweite Reformation' }, { en: 'Catholic Renewal', de: 'Katholische Erneuerung' }],
    canStart: (s, w, y) => y >= 1500 && y < 1700 && !s.flags.reformation_done
      && s.papacy.corruption >= 55 && (s.papacy.reformPressure >= 25 || s.papacy.corruption >= 70)
      && innovationCount(s, 'printing_press') >= 120 && reformSeed(s, w, -1) >= 0 && chance(s.rng, 1 / 18),
    start: (s, w, sit) => {
      const seed = reformSeed(s, w, -1); sit.data.seed = seed; sit.data.seed2 = -1;
      s.loc.faith[seed] = FAITH_INDEX.evangelical; s.loc.unrest[seed] = clamp(s.loc.unrest[seed] + 10, 0, 100);
      s.flags.reformation_start = s.day;
      const on = s.nations[s.loc.owner[seed]];
      world(s, { en: `A professor in ${w.names[seed]} published theses against the sale of indulgences. Printers carry them everywhere.`, de: `Ein Professor in ${w.namesDe[seed]} veröffentlichte Thesen gegen den Ablasshandel. Drucker tragen sie überallhin.` }, on?.id ?? -1, seed);
    },
    monthly: (s, w, sit, y, m) => {
      const E = FAITH_INDEX.evangelical, R = FAITH_INDEX.reformed;
      const years = (s.day - sit.started) / 365;
      const P = s.papacy;
      const rate = clamp(0.03 + P.corruption * 0.0006, 0.03, 0.09) * (sit.stage === 3 ? 0.5 : 1);
      if (m % 2 === 0) { spreadFaith(s, w, E, rate, -1, 0); if (sit.data.seed2 >= 0) spreadFaith(s, w, R, rate, -1, 0); }
      if (years >= 3) aiConversions(s, w, [E, R], 0.5, 0.35, m);
      // second reformation: a reformed church rises in a free city of the south-west
      if (sit.data.seed2 < 0 && years >= 12) {
        const g = locNamed(w, 'Geneva');
        const seed2 = g >= 0 && s.loc.faith[g] === LATIN ? g : reformSeed(s, w, sit.data.seed);
        if (seed2 >= 0) {
          sit.data.seed2 = seed2; s.loc.faith[seed2] = R;
          world(s, { en: `In ${w.names[seed2]} a stricter reformed church was founded.`, de: `In ${w.namesDe[seed2]} wurde eine strengere reformierte Kirche gegründet.` }, s.loc.owner[seed2], seed2);
        }
      }
      sit.stage = years < 3 ? 0 : years < 12 ? 1 : years < 28 ? 2 : 3;
      // Catholic renewal: the Curia cleans its house, Latin rulers win back towns
      if (sit.stage === 3) {
        if (m === 0) { P.corruption = clamp(P.corruption - 1.5, 0, 100); P.reformPressure = clamp(P.reformPressure - 2, 0, 100); }
        if (m % 3 === 0) { counterSpread(s, w, E, 0.01); counterSpread(s, w, R, 0.008); }
      }
      // the Curia's anger: protestant realms are distrusted by Latin ones
      if (m === 7) for (const n of s.nations) if (n.alive && (n.faith === E || n.faith === R)) setMod(s, n, 'church_lands_seized', 1.1, { en: 'Reformed church order', de: 'Reformierte Kirchenordnung' }, { tax: 0.03, authority_gain: 0.05 });
      const e = faithLocs(s, w, E), r = faithLocs(s, w, R);
      sit.data.evangelical = e; sit.data.reformed = r; sit.data.realms = s.nations.filter((n) => n.alive && isReform(n.faith)).length;
      sit.progress = Math.min(100, Math.round((e + r) / 15));
      if (e + r === 0 && years > 3) { s.flags.reformation_done = s.day; endSituation(s, sit, 'suppressed'); return; }
      if (years >= 130 || y >= 1700) { s.flags.reformation_done = s.day; endSituation(s, sit, 'settled'); }
    },
    outcomeText: (s, sit) => sit.outcome === 'suppressed'
      ? { en: 'The protest was smothered: the Latin Church remains the one church of the West.', de: 'Der Protest wurde erstickt: die lateinische Kirche bleibt die eine Kirche des Westens.' }
      : { en: `The confessional map of Europe has settled: ${sit.data.realms || 0} realms follow the reformed churches.`, de: `Die konfessionelle Landkarte Europas hat sich gefestigt: ${sit.data.realms || 0} Reiche folgen den reformierten Kirchen.` },
    involved: (s) => s.nations.filter((n) => n.alive && isReform(n.faith)).map((n) => n.id),
  },

  // ------------------------------------------------------------------------------------------------
  {
    id: 'ottoman_rise', name: { en: 'The Rise of the House of Osman', de: 'Der Aufstieg des Hauses Osman' },
    desc: { en: 'A frontier beylik of Anatolia crosses into Europe. Driven by the warrior spirit of the frontier, it turns on the divided Christian realms of the Balkans and, at last, on the City itself.', de: 'Ein Grenzfürstentum Anatoliens setzt nach Europa über. Getrieben vom Kriegergeist der Grenze wendet es sich gegen die zerstrittenen christlichen Reiche des Balkans und schließlich gegen die Stadt selbst.' },
    stages: [{ en: 'Beylik on the Straits', de: 'Fürstentum an den Meerengen' }, { en: 'Conquest of the Balkans', de: 'Eroberung des Balkans' }, { en: 'Siege of the City', de: 'Belagerung der Stadt' }],
    canStart: (s, w, y) => y >= 1356 && y < 1453 && !!nat(s, 'ottoman') && locNamed(w, 'Constantinople') >= 0 && s.loc.owner[locNamed(w, 'Constantinople')] !== nat(s, 'ottoman')!.id,
    start: (s, w, sit) => { sit.data.ott = nat(s, 'ottoman')!.id; sit.data.city = locNamed(w, 'Constantinople'); sit.data.nextWar = 0; sit.data.wars = 0; },
    monthly: (s, w, sit, y, m) => {
      const o = alive(s, sit.data.ott); const city: number = sit.data.city;
      if (!o) { endSituation(s, sit, 'collapse'); return; }
      if (s.loc.owner[city] === o.id) { delete o.flags.siege_focus; fallOfCity(s, w, sit, o); return; }
      const cityOwner = alive(s, s.loc.owner[city]);
      let europe = 0, nearCity = false;
      for (const l of nationLocsRO(s, o.id)) {
        if (w.lat[l] >= 40.3 && w.lon[l] <= 29.0 && w.lon[l] > 19) europe++;
        if (w.distKm(l, city) < 160) nearCity = true;
      }
      // the City is besieged in earnest from the turn of the century (the first great sieges came in the 1390s)
      sit.stage = y >= 1400 && nearCity ? 2 : europe > 0 ? 1 : 0;
      sit.progress = Math.round(clamp(europe * 2.5 + (sit.stage === 2 ? 40 : 0), 0, 100));
      // the frontier lords serve for land grants rather than pay
      setMod(s, o, 'frontier_warriors', 1, { en: 'Warriors of the frontier', de: 'Krieger der Grenze' }, { morale: 0.1, manpower: 0.6, cavalry: 0.1, army_cost: -0.3 });
      // fighters from all over Anatolia flock to a victorious banner
      o.manpower = Math.min(o.maxManpower, o.manpower + o.maxManpower * 0.015);
      // the land walls that held for a thousand years do not withstand the great guns of the new age: they hold only
      // while the sultan cannot cast such guns (see greatGuns)
      if (cityOwner && cityOwner.faith !== o.faith && !greatGuns(o)) setMod(s, cityOwner, 'land_walls', 1, { en: 'The great land walls', de: 'Die großen Landmauern' }, { fort_strength: 0.25 });
      else if (cityOwner) dropMod(cityOwner, 'land_walls');
      // in a war for the City the sultan calls his whole host to its walls and brings the great guns cast for it
      // (siege_focus: see militaryAI and the sieges in military.ts)
      if (sit.stage === 2 && s.wars.some((x) => x.attLead === o.id && x.goal.locs.includes(city))) o.flags.siege_focus = city;
      else delete o.flags.siege_focus;
      // a campaign season every quarter: the sultan only waits while he is already on the offensive somewhere
      const attacking = s.wars.some((x) => x.attLead === o.id); // wars he leads; being called in by an ally does not hold back his own campaign
      if (m % 3 === 1 && o.warExhaustion < 60 && !human(s, o.id)) {
        // the sultan picks fights he can win: his host and allies against the target and the allies likely to come
        // (far-away allies count half, allies of both sides not at all)
        const mine = allies(s, o.id);
        const myPow = nationPower(s, o.id) + mine.reduce((p, a) => p + nationPower(s, a), 0);
        const bloc = (x: number) => nationPower(s, x) + allies(s, x).filter((a) => a !== o.id && !mine.includes(a))
          .reduce((p, a) => p + nationPower(s, a) * (s.nations[a].capital >= 0 && s.nations[x].capital >= 0 && w.distKm(s.nations[a].capital, s.nations[x].capital) > 1200 ? 0.5 : 1), 0);
        // the siege of the City outranks any other campaign, once it can be won
        const cityWar = sit.stage === 2 && !!cityOwner && cityOwner.id !== o.id && !atWar(s, o.id, cityOwner.id) && truceAge(s, o.id, cityOwner.id) >= 2 && bloc(cityOwner.id) < myPow * 1.25;
        const tries: [number, number[]][] = [];
        if (cityWar) tries.push([cityOwner!.id, [city]]);
        else if (y >= sit.data.nextWar && !attacking) {
          const myDev = nationDev(s, o.id);
          const balkan = (x: Nation) => x.capital >= 0 && w.lat[x.capital] >= 40.3 && w.lon[x.capital] <= 29.5 && w.lon[x.capital] > 15;
          const cands = [...neighboursOf(s, w, o.id)].map((x) => s.nations[x]).filter((x) => x.alive && x.overlord < 0 && !atWar(s, o.id, x.id) && !hasTreaty(s, o.id, x.id, 'truce') && !hasTreaty(s, o.id, x.id, 'alliance')
            && (faithFamily(x.faith) === 'christian' || GROUP_OF[ALL_CULTURES[x.culture]] === 'turkic') && x.key !== 'mamluk' && !((x.flags.tribute_osman ?? 0) > s.day)
            && nationDev(s, x.id) < myDev * (balkan(x) && faithFamily(x.faith) === 'christian' ? 1.8 : 1.2) && bloc(x.id) < myPow * 0.9);
          // the Balkans first: divided Christian crowns of Europe; the City itself only late; Anatolian rivals when nothing else is open
          const score = (x: Nation) => nationDev(s, x.id) * 0.2 - (faithFamily(x.faith) === 'christian' ? 40 : 0) - (balkan(x) ? 150 : 0);
          cands.sort((a, b) => score(a) - score(b));
          for (const x of cands.slice(0, 3)) {
            const near = nationLocsRO(s, x.id).filter((l) => l !== city || y >= 1400).sort((a, b) => w.distKm(a, o.capital) - w.distKm(b, o.capital)).slice(0, 4);
            if (near.length) tries.push([x.id, near]);
          }
        }
        // the first target that can be fought this season (a refused declaration falls through to the next)
        for (const [target, goal] of tries) {
          giveClaim(s, o.id, target, 15);
          if (aiWar(s, w, o.id, target, 'conquest', goal, cityWar && target === cityOwner?.id) < 0) continue;
          sit.data.wars++; sit.data.nextWar = y + 3 + Math.floor(rand(s.rng) * 3);
          const t = s.nations[target];
          world(s, { en: `The ${o.adj.en} host marched against ${t.short.en}.`, de: `Das Heer von ${o.short.de} zog gegen ${t.short.de}.` }, o.id, t.capital);
          break;
        }
      }
      if (y >= 1500) { delete o.flags.siege_focus; endSituation(s, sit, 'city_endures'); }
    },
    outcomeText: (s, sit) => {
      const o = s.nations[sit.data.ott];
      if (sit.outcome === 'conquest') return { en: `Constantinople has fallen to ${o.short.en}. The City of the Caesars is the seat of a new empire on two continents.`, de: `Konstantinopel ist an ${o.short.de} gefallen. Die Stadt der Cäsaren ist der Sitz eines neuen Reiches auf zwei Kontinenten.` };
      if (sit.outcome === 'collapse') return { en: 'The House of Osman has fallen; its frontier empire is broken up.', de: 'Das Haus Osman ist gefallen; sein Grenzreich ist zerschlagen.' };
      return { en: 'The City has withstood every siege; the House of Osman never took it.', de: 'Die Stadt hat jeder Belagerung standgehalten; das Haus Osman hat sie nie genommen.' };
    },
    involved: (s, sit) => [sit.data.ott, s.loc.owner[sit.data.city]].filter((x) => x >= 0),
  },

  // ------------------------------------------------------------------------------------------------
  {
    id: 'horde_breaking', name: { en: 'The Breaking of the Horde', de: 'Das Zerbrechen der Horde' },
    desc: { en: 'Since the murder of Khan Berdibeg the throne of Sarai changes hands almost every year. The emirs of the western steppe, of the Volga towns and of the lands beyond the Yaik raise khans of their own, and the tributaries of the Rus watch to see who will collect the tribute.', de: 'Seit der Ermordung Khan Berdibegs wechselt der Thron von Sarai fast jedes Jahr. Die Emire der westlichen Steppe, der Wolgastädte und der Länder jenseits des Jaik erheben eigene Khane, und die Zinspflichtigen der Rus warten ab, wer den Tribut eintreiben wird.' },
    stages: [{ en: 'Khans of a season', de: 'Khane einer Saison' }, { en: 'A divided steppe', de: 'Eine geteilte Steppe' }],
    canStart: (s, w, y) => y >= 1356 && y < 1400 && !!nat(s, 'golden_horde') && nationLocsRO(s, nat(s, 'golden_horde')!.id).length >= 400,
    start: (s, w, sit) => { sit.data.h = nat(s, 'golden_horde')!.id; sit.data.split = 0; },
    monthly: (s, w, sit, y, m) => {
      const h = alive(s, sit.data.h);
      if (!h) { endSituation(s, sit, 'gone'); return; }
      // (a horde that holds together through its troubles may still break later, until 1430)
      if (y >= 1440 || (sit.stage === 0 && y >= 1430)) { dropMod(h, 'great_troubles'); endSituation(s, sit, sit.stage === 1 ? 'broken' : 'endures'); return; }
      if (sit.stage === 0) {
        setMod(s, h, 'great_troubles', 1, { en: 'Khans of a season', de: 'Khane einer Saison' }, { unrest: 2, tax: -0.1, morale: -0.05 });
        // purges of the emirs (unity) and rival khans backed from outside (strife) move the troubles (situation actions)
        sit.progress = Math.round(clamp((y - 1359) * 8 - (sit.data.unity || 0) + (sit.data.strife || 0), 0, 100));
        if (m === 0) { sit.data.unity = Math.max(0, (sit.data.unity || 0) - 3); sit.data.strife = Math.max(0, (sit.data.strife || 0) - 3); }
        // a player khan holds the realm together by his own wars; the AI horde breaks apart once
        if (m !== 6 || y < 1361 || human(s, h.id) || !chance(s.rng, 0.3 * clamp(sit.progress / 60, 0.3, 1.5))) return;
        // the emirs wait for peace: a split in the middle of a war would hand occupied land to an uninvolved realm
        if (s.wars.some((x) => x.att.includes(h.id) || x.def.includes(h.id))) return;
        const cap = h.capital; if (cap < 0) return;
        const cl = w.lon[cap], ca = w.lat[cap];
        const groups: { key: string; name: I18n; adj: I18n; locs: number[] }[] = [
          { key: 'horde_west', name: { en: 'Western Horde', de: 'Westliche Horde' }, adj: { en: 'Western Horde', de: 'Westhorden-' }, locs: [] },
          { key: 'horde_bolghar', name: { en: 'Khanate of Bolghar', de: 'Khanat Bolgar' }, adj: { en: 'Bolghar', de: 'Bolgar-' }, locs: [] },
          { key: 'horde_east', name: { en: 'Horde beyond the Yaik', de: 'Horde jenseits des Jaik' }, adj: { en: 'Eastern Horde', de: 'Osthorden-' }, locs: [] },
        ];
        for (const l of nationLocsRO(s, h.id)) {
          if (l === cap || s.loc.ctrl[l] !== h.id || w.distKm(l, cap) < 350) continue;
          if (w.lon[l] < cl - 6) groups[0].locs.push(l);
          else if (w.lon[l] > cl + 7) groups[2].locs.push(l);
          else if (w.lat[l] > ca + 5) groups[1].locs.push(l);
        }
        const { releaseNation, newArmy, availableUnits, khanFaith } = require_military();
        const made: number[] = [];
        for (const g of groups) {
          if (g.locs.length < 15) continue;
          g.locs.sort((a, b) => s.loc.dev[b] - s.loc.dev[a] || a - b);
          // the Horde's troops in the breakaway lands fall back to Sarai
          for (const a of s.armies) if (a.owner === h.id && g.locs.includes(a.loc)) {
            a.path = []; a.siege = -1;
            if (!a.fleet && !a.battle && !a.embarkedOn) { a.loc = cap; a.retreating = false; }
          }
          const nn = releaseNation(s, w, h, g.locs, h.culture) as Nation;
          nn.name = g.name; nn.short = g.name; nn.adj = g.adj; nn.rank = 'kingdom'; nn.faith = khanFaith(s, h, g.locs); nn.gov = h.gov;
          nn.rivals = [h.id]; nn.treasury = 100; nn.flags.horde_successor = 1;
          let pop = 0; for (const l of g.locs) for (let c = 0; c < C; c++) pop += s.loc.pop[l * C + c];
          nn.maxManpower = pop * 0.012; nn.manpower = nn.maxManpower * 0.4;
          // a steppe host: horse archers with a levy of the towns (never the last unit of the list, which is the artillery)
          const u: number[] = availableUnits(s, nn, false);
          const ha = UNITS.findIndex((x) => x.id === 'horse_archers'), lv = UNITS.findIndex((x) => x.id === 'levy');
          const cav = u.includes(ha) ? ha : u.find((i) => UNITS[i].kind === 'cav') ?? u[0];
          const foot = u.includes(lv) ? lv : u.find((i) => UNITS[i].kind === 'inf') ?? u[0];
          const men = Math.min(Math.max(4000, nn.maxManpower * 0.2), Math.max(2000, nn.maxManpower));
          newArmy(s, nn.id, g.locs[0], [{ type: cav, men: Math.round(men * 0.6) }, { type: foot, men: Math.round(men * 0.4) }]);
          if (!h.rivals.includes(nn.id)) h.rivals.push(nn.id);
          giveClaim(s, h.id, nn.id, 40);
          made.push(nn.id);
        }
        if (!made.length) return;
        for (const a of made) for (const b of made) if (a < b && !s.nations[a].rivals.includes(b)) { s.nations[a].rivals.push(b); s.nations[b].rivals.push(a); }
        sit.stage = 1; sit.data.split = y; sit.progress = 100;
        dropMod(h, 'great_troubles');
        world(s, { en: `The Horde has broken apart: rival khans now rule ${made.map((x) => s.nations[x].short.en).join(', ')}.`, de: `Die Horde ist zerbrochen: Rivalisierende Khane herrschen nun über ${made.map((x) => s.nations[x].short.de).join(', ')}.` }, h.id, s.nations[made[0]].capital);
        for (const p of s.playerNations) notice(s, p, 'situation', { en: 'The Horde has broken apart into rival khanates.', de: 'Die Horde ist in rivalisierende Khanate zerfallen.' }, { loc: h.capital });
        s.flags.ownershipDirty = s.day;
      }
    },
    outcomeText: (s, sit) => sit.outcome === 'broken'
      ? { en: 'The age of the united Horde is over; the steppe belongs to rival khanates.', de: 'Die Zeit der geeinten Horde ist vorbei; die Steppe gehört rivalisierenden Khanaten.' }
      : sit.outcome === 'gone' ? { en: 'The Horde is no more.', de: 'Die Horde ist nicht mehr.' }
      : { en: 'The khans of Sarai have mastered the troubles; the Horde endures.', de: 'Die Khane von Sarai haben die Unruhen gemeistert; die Horde besteht fort.' },
    involved: (s, sit) => [sit.data.h, ...s.nations.filter((n) => n.alive && n.flags.horde_successor).map((n) => n.id)].filter((x) => x >= 0),
  },
  // ------------------------------------------------------------------------------------------------
  {
    id: 'reconquista', name: { en: 'The Last Emirate of Iberia', de: 'Das letzte Emirat Iberiens' },
    desc: { en: 'Only the Nasrid emirate remains of Muslim Iberia, paying tribute to the crown of Castile. When the Christian kingdoms are strong and at peace with each other, the war for Granada begins.', de: 'Nur das Emirat der Nasriden ist vom muslimischen Iberien geblieben und zahlt der Krone Kastiliens Tribut. Sind die christlichen Königreiche stark und untereinander im Frieden, beginnt der Krieg um Granada.' },
    stages: [{ en: 'The Frontier of the Emirate', de: 'Die Grenze des Emirats' }, { en: 'The War for Granada', de: 'Der Krieg um Granada' }],
    canStart: (s, w, y) => y >= 1356 && y < 1500 && !!nat(s, 'granada'),
    start: (s, w, sit) => { const g = nat(s, 'granada')!; sit.data.g = g.id; sit.data.locs0 = Math.max(1, nationLocsRO(s, g.id).length); sit.data.city = locNamed(w, 'Granada'); },
    monthly: (s, w, sit, y, m) => {
      // whoever of another faith holds the city of Granada is the emirate this war is fought against (a sultan from
      // beyond the strait who took it inherits the war)
      const holder = sit.data.city >= 0 ? alive(s, s.loc.owner[sit.data.city]) : undefined;
      if (holder && faithFamily(holder.faith) !== 'christian' && holder.id !== sit.data.g) sit.data.g = holder.id;
      const g = alive(s, sit.data.g);
      // the champion's call to the walls of Granada lasts only while it leads a war for the city (set again below)
      const prev = s.nations[sit.data.champion ?? -1];
      if (prev) delete prev.flags.siege_focus;
      // the emirate's lands in Iberia (towns it won or settled beyond the sea are not part of this war)
      const iberia = g ? nationLocsRO(s, g.id).filter((l) => w.lat[l] >= 36 && (sit.data.city < 0 || w.distKm(l, sit.data.city) < 450)) : [];
      const now = iberia.length;
      sit.progress = Math.round(clamp((1 - now / sit.data.locs0) * 100, 0, 100));
      // done once the emirate has no Iberian town left, or has lost the city and keeps no more than a few castles
      const cityLost = sit.data.city >= 0 && faithFamily(s.nations[s.loc.owner[sit.data.city]]?.faith ?? -1) === 'christian';
      if (!g || now === 0 || (cityLost && now <= 3)) { finishReconquista(s, w, sit); return; }
      // the champion: Castile, or the strongest Christian realm bordering the emirate
      let c = nat(s, 'castile');
      if (!c || !neighboursOf(s, w, g.id).has(c.id)) {
        const ns = [...neighboursOf(s, w, g.id)].map((x) => s.nations[x]).filter((x) => x.alive && faithFamily(x.faith) === 'christian' && x.overlord < 0).sort((a, b) => nationDev(s, b.id) - nationDev(s, a.id));
        c = ns[0] ?? c;
      }
      if (!c) return;
      if (sit.data.champion !== undefined && sit.data.champion !== c.id) dropMod(s.nations[sit.data.champion], 'war_for_granada');
      sit.data.champion = c.id;
      // in the war for Granada the crown calls its whole host to the walls of the city and brings its siege train
      // (siege_focus: see militaryAI and the sieges in military.ts), while it leads a war against the emirate for it
      const city: number = sit.data.city;
      if (sit.stage === 1 && city >= 0 && s.loc.owner[city] === g.id && s.wars.some((x) => x.attLead === c!.id && x.def.includes(g.id) && x.goal.locs.includes(city))) c.flags.siege_focus = city;
      if (m !== 5) return;
      if (y >= 1520) { delete c.flags.siege_focus; dropMod(c, 'war_for_granada'); endSituation(s, sit, 'endures'); return; }
      giveClaim(s, c.id, g.id, 30);
      const crusade = (sit.data.crusade_until ?? 0) > s.day, parias = (sit.data.parias_until ?? 0) > s.day;
      const strong = nationDev(s, c.id) > nationDev(s, g.id) * (crusade ? 4 : 6) && (c.era >= 1 || crusade) && !parias;
      if (sit.stage === 0) {
        // tribute from the emirate to its overlord
        if (g.overlord === c.id && g.treasury > 0) { const t = Math.max(5, g.income.tax || 5) * 1.5; g.treasury -= t; c.treasury += t; }
        // (a champion fighting only defensive wars elsewhere may still begin, if the war has not worn him out)
        if (((y >= 1440 && !parias) || strong) && !s.wars.some((x) => x.attLead === c!.id) && c.warExhaustion < 40 && c.concord > -30) {
          sit.stage = 1;
          if (g.overlord === c.id) { g.overlord = -1; g.subjectType = null; }
          world(s, { en: `${g.short.en} refused its tribute; ${c.short.en} prepared the war for Granada.`, de: `${g.short.de} verweigerte den Tribut; ${c.short.de} rüstete zum Krieg um Granada.` }, c.id, g.capital);
        }
        return;
      }
      // the crown raises a crusading host for the fortress towns of the emirate
      setMod(s, c, 'war_for_granada', 1, { en: 'War for Granada', de: 'Krieg um Granada' }, { morale: 0.05, manpower: 0.1 });
      if (g.overlord === c.id) { g.overlord = -1; g.subjectType = null; } // tribute refused: the emirate stands alone
      if (g.overlord >= 0) return; // under another protector: wait
      if (!atWar(s, c.id, g.id) && c.warExhaustion < 50) {
        // the last towns of a small emirate are all at stake, the city of Granada first
        const goal = iberia.slice().sort((a, b) => s.loc.dev[b] - s.loc.dev[a]).slice(0, now <= 12 ? now : 10);
        if (city >= 0 && s.loc.owner[city] === g.id && !goal.includes(city)) goal.unshift(city);
        // a holy war (Castile holds no cores there, so it is no war of reconquest in the sense of declareWar)
        const wid = aiWar(s, w, c.id, g.id, 'faith', goal, true);
        if (wid >= 0) {
          // the emirate fights alone: allies beyond the strait, far away or Christian refuse the call to this war (a
          // player's realm is called as usual and decides for itself); their treaties with it stand
          const war = s.wars.find((x) => x.id === wid);
          const far = (x: number) => { const n = s.nations[x]; return !n || n.capital < 0 || w.lat[n.capital] < 36 || (city >= 0 && w.distKm(n.capital, city) > 600) || faithFamily(n.faith) === 'christian'; };
          if (war) war.def = war.def.filter((x) => x === war.defLead || s.nations[x]?.overlord === g.id || human(s, x) || !far(x));
          sit.data.wars = (sit.data.wars || 0) + 1;
          world(s, { en: `${c.short.en} marched on the emirate of ${g.short.en}.`, de: `${c.short.de} zog gegen das Emirat ${g.short.de}.` }, c.id, g.capital);
        }
      }
    },
    outcomeText: (s, sit) => {
      if (sit.outcome === 'endures') return { en: 'The emirate of Granada endures, a Muslim realm at the tip of Europe.', de: 'Das Emirat Granada besteht fort, ein muslimisches Reich an der Spitze Europas.' };
      const v = s.nations[sit.data.victor ?? -1];
      return { en: `The last emirate of Iberia has fallen${v ? ` to ${v.short.en}` : ''}. The long reconquest is complete.`, de: `Das letzte Emirat Iberiens ist gefallen${v ? `, erobert von ${v.short.de}` : ''}. Die lange Rückeroberung ist vollendet.` };
    },
    involved: (s, sit) => [sit.data.g, sit.data.champion].filter((x) => x !== undefined && x >= 0),
  },

  // ------------------------------------------------------------------------------------------------
  {
    id: 'age_of_discovery', name: { en: 'The Race for the Ocean Sea', de: 'Der Wettlauf um das Ozeanmeer' },
    desc: { en: 'Atlantic realms with skilled navigators send ships ever further south and west. Progress is the share of the Ocean Sea charted by Latin Christendom; each realm’s voyages and overseas holdings decide who leads the race.', de: 'Atlantische Reiche mit kundigen Seefahrern schicken Schiffe immer weiter nach Süden und Westen. Der Fortschritt ist der Anteil des Ozeanmeers, den die lateinische Christenheit kartiert hat; Fahrten und Überseebesitz jedes Reiches entscheiden, wer den Wettlauf anführt.' },
    stages: [{ en: 'The Atlantic Islands', de: 'Die Atlantischen Inseln' }, { en: 'Round the Southern Cape', de: 'Um das Südkap' }, { en: 'Lands beyond the Ocean', de: 'Länder jenseits des Ozeans' }, { en: 'Scramble for the Seas', de: 'Wettlauf um die Meere' }],
    canStart: (s, w, y) => y >= 1415 && y < 1650 && atlanticRealms(s, w).length > 0,
    start: (s, w, sit) => { sit.data.credit = {}; sit.data.milestones = {}; },
    monthly: (s, w, sit, y, m) => {
      const parts = atlanticRealms(s, w);
      for (const n of parts) setMod(s, n, 'ocean_venturers', 0.2, { en: 'Ocean venturers', de: 'Ozeanfahrer' }, { colonial_range: 0.05 });
      if (m !== 6) return;
      const credit: Record<string, number> = sit.data.credit;
      // the year's great voyage: the best-equipped Atlantic realm charts new waters
      let best: Nation | undefined, bv = -Infinity;
      for (const n of parts) {
        const v = n.tech[1] + (n.doctrines.seafaring || 0) * 1.5 + (n.doctrines.colonial || 0) + (n.innovations.length ? 0.5 : 0) + rand(s.rng) * 4 + (sit.data.fund?.[n.id] ?? 0);
        if (v > bv) { bv = v; best = n; }
      }
      if (best) {
        // caravels and the new charts open the far seas: in the first age only the near Atlantic and the African coast north of the line
        const k = best.era < 1 ? 1 : clamp(2 + Math.floor((best.tech[1] - 6) / 3), 2, 6);
        const got = chartVoyage(s, w, best, k, y);
        if (got > 0) credit[best.id] = (credit[best.id] || 0) + got;
        if (sit.data.fund) delete sit.data.fund[best.id]; // a funded voyage sails once
      }
      // milestones
      const E = s.explored[0]; const ms: Record<string, number> = sit.data.milestones;
      if (E) {
        let atl = 0, atlKnown = 0, cape = false, west = false;
        for (let i = w.L; i < w.N; i++) {
          if (w.lon[i] < -10 && w.lat[i] > -60 && w.lat[i] < 66) { atl++; if (E[i]) atlKnown++; }
          if (E[i] && w.lat[i] < -32 && w.lon[i] > 10 && w.lon[i] < 40) cape = true;
        }
        for (let i = 0; i < w.L && !west; i++) if (E[i] && w.lon[i] < -55 && w.lat[i] < 44) west = true; // the Americas proper, not the Norse north
        sit.progress = atl ? Math.round(atlKnown / atl * 100) : 0;
        if (cape && !ms.cape) { ms.cape = y; s.flags.cape_rounded = s.day; milestone(s, best, { en: 'rounded the southern cape of Africa', de: 'umsegelte das Südkap Afrikas' }); }
        if (west && !ms.west) { ms.west = y; s.flags.ocean_crossed = s.day; milestone(s, best, { en: 'reached lands across the Ocean Sea', de: 'erreichte Länder jenseits des Ozeanmeers' }); }
      }
      let scramble = false;
      for (const n of parts) { const ov = overseas(s, w, n.id); if (ov >= 10) scramble = true; credit[n.id] = Math.max(credit[n.id] || 0, 0); sit.data[`ov_${n.id}`] = ov; }
      sit.stage = scramble ? 3 : ms.west ? 2 : ms.cape ? 1 : 0;
      if (sit.progress >= 90 || y >= 1650) endSituation(s, sit, 'charted');
    },
    outcomeText: (s, sit) => {
      const credit: Record<string, number> = sit.data.credit || {};
      const lead = Object.entries(credit).sort((a, b) => b[1] - a[1])[0];
      const n = lead ? s.nations[+lead[0]] : undefined;
      return { en: `The Ocean Sea is charted${n ? `; the navigators of ${n.short.en} led the way` : ''}.`, de: `Das Ozeanmeer ist kartiert${n ? `; die Seefahrer von ${n.short.de} gingen voran` : ''}.` };
    },
    involved: (s, sit) => Object.keys(sit.data.credit || {}).map(Number),
  },

  // ------------------------------------------------------------------------------------------------
  {
    id: 'confessional_war', name: { en: 'The War of the Confessions', de: 'Der Krieg der Konfessionen' },
    desc: { en: 'The Empire is split between princes of the old and the new faith. A spark in one land sets the whole Empire ablaze; foreign crowns join for faith and for gain, and the land is laid waste until a peace congress settles the order of the Empire.', de: 'Das Reich ist gespalten zwischen Fürsten des alten und des neuen Glaubens. Ein Funke in einem Land setzt das ganze Reich in Brand; fremde Kronen greifen um des Glaubens und des Gewinns willen ein, und das Land wird verwüstet, bis ein Friedenskongress die Ordnung des Reiches regelt.' },
    stages: [{ en: 'Armed Camps', de: 'Bewaffnete Lager' }, { en: 'The Imperial War', de: 'Der Reichskrieg' }, { en: 'Foreign Intervention', de: 'Ausländische Einmischung' }, { en: 'The Peace Congress', de: 'Der Friedenskongress' }],
    canStart: (s, w, y) => y >= 1600 && y < 1760 && !s.flags.confessional_war_done && confessionalSplit(s) !== null && chance(s.rng, 1 / 12),
    start: (s, w, sit) => {
      const sp = confessionalSplit(s)!;
      sit.data.cath = sp.cath; sit.data.prot = sp.prot; sit.data.war = -1; sit.data.warStart = 0;
      for (const a of sp.cathMembers) for (const b of sp.protMembers) { addOpinion(s, a, b, 'confession', -30, 365 * 30); addOpinion(s, b, a, 'confession', -30, 365 * 30); }
      world(s, { en: `Envoys were thrown from a castle window: the princes of the Empire arm for a war of faith.`, de: `Gesandte wurden aus einem Burgfenster geworfen: die Fürsten des Reiches rüsten zum Glaubenskrieg.` }, sp.prot);
    },
    monthly: (s, w, sit, y, m) => {
      const sp = confessionalSplit(s);
      if (!sp) { finishConfessional(s, sit, 'confessional_unity'); return; }
      const war = s.wars.find((x) => x.id === sit.data.war);
      // devastation of the Empire wherever armies hold foreign ground
      if (war) {
        for (const id of [...war.att, ...war.def]) for (const l of nationLocsRO(s, id)) {
          if (s.loc.ctrl[l] !== s.loc.owner[l] && s.nations[id].isHRE) { s.loc.devast[l] = clamp(s.loc.devast[l] + 0.03, 0, 1); for (let c = 0; c < C; c++) s.loc.pop[l * C + c] *= 0.996; }
        }
      }
      if (war) { sit.data.warDays = (sit.data.warDays || 0) + 30; sit.data.warYears = Math.floor(sit.data.warDays / 365); }
      if (sit.stage === 0) {
        if (s.day - (sit.data.restart || sit.started) > 365) {
          // the leaders first; after a truce between them, any prince of one camp against the other camp's greatest
          const byDev = (a: number, b: number) => nationDev(s, b) - nationDev(s, a);
          const pairs: [number, number][] = [[sp.cath, sp.prot], [sp.prot, sp.cath]];
          for (const f of sp.protMembers.slice().sort(byDev).slice(0, 4)) if (f !== sp.prot) pairs.push([sp.cath, f]);
          for (const c of sp.cathMembers.slice().sort(byDev).slice(0, 4)) if (c !== sp.cath) pairs.push([c, sp.prot]);
          let wid = -1, lead = s.nations[sp.cath];
          for (const [a, b] of pairs) {
            giveClaim(s, a, b, 30);
            const B2 = s.nations[b];
            wid = aiWar(s, w, a, b, 'faith', B2.capital >= 0 ? [B2.capital] : []);
            if (wid >= 0) { lead = s.nations[s.nations[a].faith === LATIN ? a : b]; break; }
          }
          if (wid >= 0) {
            sit.stage = 1; sit.data.war = wid; sit.data.warStart = s.day;
            const wr = s.wars.find((x) => x.id === wid)!;
            const attCath = wr.att.includes(lead.id);
            for (const id of sp.cathMembers) joinWar(s, wr, id, attCath ? 'att' : 'def', 0.6);
            for (const id of sp.protMembers) joinWar(s, wr, id, attCath ? 'def' : 'att', 0.6);
            world(s, { en: 'The war of the confessions engulfed the Empire.', de: 'Der Krieg der Konfessionen erfasste das Reich.' }, lead.id);
            tell(s, { en: 'The war of the confessions has begun in the Empire.', de: 'Im Reich hat der Krieg der Konfessionen begonnen.' });
          } else if (!sit.data.rounds && s.day - sit.started > 365 * 10) finishConfessional(s, sit, 'uneasy_peace');
          else if (sit.data.rounds && s.day - sit.started > 365 * 35) finishConfessional(s, sit, 'peace_congress');
        }
        return;
      }
      if (!war) {
        // a short war settles nothing: the camps re-arm and fight again, until the Empire is exhausted
        if ((sit.data.warYears || 0) >= 8 || s.day - sit.started > 365 * 35) { finishConfessional(s, sit, 'peace_congress'); return; }
        sit.stage = 0; sit.data.war = -1; sit.data.restart = s.day; sit.data.rounds = (sit.data.rounds || 0) + 1;
        return;
      }
      if (sit.stage === 1 && s.day - sit.data.warStart > 365 * 4) {
        sit.stage = 2;
        const protSide = war.att.includes(sp.prot) ? 'att' : 'def';
        const emp = s.nations[sp.cath];
        const ext = s.nations.filter((n) => n.alive && !n.isHRE && n.overlord < 0 && isReform(n.faith) && n.capital >= 0 && emp.capital >= 0 && w.distKm(n.capital, emp.capital) < 1600).sort((a, b) => nationDev(s, b.id) - nationDev(s, a.id))[0];
        if (ext) joinWar(s, war, ext.id, protSide, 1);
        const rival = s.nations.filter((n) => n.alive && !n.isHRE && n.overlord < 0 && n.faith === LATIN && n.id !== emp.id && (n.rivals.includes(emp.id) || n.key === 'france') && n.capital >= 0 && w.distKm(n.capital, emp.capital) < 1500)[0];
        if (rival) joinWar(s, war, rival.id, protSide, 1);
        world(s, { en: `Foreign crowns entered the war of the confessions${ext ? `: ${ext.short.en}` : ''}${rival ? `${ext ? ' and ' : ': '}${rival.short.en}` : ''}.`, de: `Fremde Kronen traten in den Krieg der Konfessionen ein${ext ? `: ${ext.short.de}` : ''}${rival ? `${ext ? ' und ' : ': '}${rival.short.de}` : ''}.` });
      }
      const lead = s.nations[sp.cath];
      if (sit.stage >= 1 && (lead.warExhaustion > 70 || s.day - sit.data.warStart > 365 * 25)) sit.stage = 3;
      sit.progress = Math.round(clamp((s.day - sit.data.warStart) / 365 / 30 * 100, 0, 100));
      if (sit.stage === 3 && m === 9) finishConfessional(s, sit, 'peace_congress');
    },
    outcomeText: (s, sit) => {
      if (sit.outcome === 'peace_congress') return { en: 'A great peace congress ended the war of the confessions: each prince decides the faith of his land, and the Emperor’s authority is broken.', de: 'Ein großer Friedenskongress beendete den Krieg der Konfessionen: jeder Fürst bestimmt den Glauben seines Landes, und die Autorität des Kaisers ist gebrochen.' };
      if (sit.outcome === 'confessional_unity') return { en: 'One confession prevails in the Empire; the war of faith has ended.', de: 'Eine Konfession setzt sich im Reich durch; der Glaubenskrieg ist zu Ende.' };
      return { en: 'The armed camps of the Empire stood down without a general war.', de: 'Die bewaffneten Lager des Reiches rüsteten ab, ohne dass es zum allgemeinen Krieg kam.' };
    },
    involved: (s, sit) => [sit.data.cath, sit.data.prot].filter((x) => x !== undefined),
  },

  // ------------------------------------------------------------------------------------------------
  {
    id: 'age_of_revolution', name: { en: 'The Age of Revolution', de: 'Das Zeitalter der Revolution' },
    desc: { en: 'Enlightened ideas meet empty treasuries. Where absolute crowns rule over restless, indebted realms, pressure builds year by year until the people overthrow the old order; monarchies abroad unite against the new republics.', de: 'Aufgeklärte Ideen treffen auf leere Kassen. Wo absolute Kronen über unruhige, verschuldete Reiche herrschen, wächst der Druck Jahr um Jahr, bis das Volk die alte Ordnung stürzt; die Monarchien im Ausland verbünden sich gegen die neuen Republiken.' },
    stages: [{ en: 'The Enlightenment', de: 'Die Aufklärung' }, { en: 'Revolution', de: 'Revolution' }, { en: 'Wars of the Coalitions', de: 'Koalitionskriege' }],
    canStart: (s, w, y) => y >= 1760,
    start: (s, w, sit) => { sit.data.p = {}; sit.data.revs = []; sit.data.warAt = {}; sit.data.first = 0; },
    monthly: (s, w, sit, y, m) => {
      const P: Record<string, number> = sit.data.p; const revs: number[] = sit.data.revs; const warAt: Record<string, number> = sit.data.warAt;
      let maxP = 0;
      for (const n of s.nations) {
        if (!n.alive || n.overlord >= 0 || (n.id + m) % 12 !== 0) continue;
        if (!monarchy(n) || revs.includes(n.id) || n.flags.pretender_of !== undefined) continue;
        const ls = nationLocsRO(s, n.id); if (ls.length < 25 || n.capital < 0) continue;
        if (n.era < 3 || faithFamily(n.faith) !== 'christian' || w.lat[n.capital] < 35 || w.lon[n.capital] < -12 || w.lon[n.capital] > 45) continue; // the ideas of the age travel through Christendom's presses and salons
        let lit = 0; for (const l of ls) lit += s.loc.literacy[l]; lit /= ls.length;
        const tax = Math.max(5, n.income.tax || 5);
        const debtM = n.debt / tax;
        // pressure builds where unrest, debts, privilege and new ideas meet; it ebbs where the crown reforms
        const d = clamp((avgUnrest(s, n.id) - 20) / 10, -1, 2.5) + (debtM > 24 ? 1.5 : debtM > 12 ? 0.7 : 0) + (n.treasury < 0 ? 0.8 : 0)
          + (n.gov === 'absolute_monarchy' ? 0.5 : 0) + (lawEffect(n, 'serfdom') >= 0.6 ? 0.4 : 0) + lit * 2
          - Math.max(0, n.concord) / 30 - ((n.laws.diet ?? 0) >= 2 ? 0.8 : 0) + Math.max(0, y - 1770) / 30 + (revs.length ? 0.2 : 0);
        P[n.id] = Math.max(0, (P[n.id] || 0) * 0.9 + d);
      }
      // at most one great overthrow every few years, in the realm under the greatest strain: each one is felt across Europe
      if (m === 6 && y >= 1770 && s.day >= (sit.data.next || 0)) {
        let best = -1, bp = 8;
        for (const k in P) { const n = alive(s, +k); if (n && monarchy(n) && n.overlord < 0 && !revs.includes(n.id) && P[k] > bp) { bp = P[k]; best = n.id; } }
        if (best >= 0 && chance(s.rng, 0.6)) {
          const n = s.nations[best];
          revolution(s, w, sit, n); revs.push(n.id); if (!sit.data.first) sit.data.first = s.day; warAt[n.id] = s.day + 180; delete P[n.id];
          sit.data.next = s.day + 365 * 4;
        }
      }
      for (const k in P) maxP = Math.max(maxP, P[k]);
      // the monarchies strike back at the new republics
      for (const id of revs) {
        const r = alive(s, id); if (!r || !warAt[id] || warAt[id] > s.day) continue;
        delete warAt[id];
        const foes = [...neighboursOf(s, w, id)].map((x) => s.nations[x]).filter((x) => x.alive && x.overlord < 0 && monarchy(x) && !human(s, x.id)).sort((a, b) => nationDev(s, b.id) - nationDev(s, a.id));
        const lead = foes[0]; if (!lead) continue;
        giveClaim(s, lead.id, id, 10);
        const wid = aiWar(s, w, lead.id, id, 'coalition');
        if (wid >= 0) {
          const war = s.wars.find((x) => x.id === wid)!;
          for (const f of foes.slice(1)) if (opinion(s, f.id, id) < -10 || chance(s.rng, 0.35)) joinWar(s, war, f.id, 'att', 1);
          sit.data.wars = (sit.data.wars || 0) + 1;
          world(s, { en: `The crowned heads formed a coalition against the ${r.name.en}.`, de: `Die gekrönten Häupter verbündeten sich gegen die ${r.name.de}.` }, lead.id, r.capital);
        }
      }
      sit.stage = revs.some((id) => s.wars.some((x) => x.goal.type === 'coalition' && x.goal.target === id)) ? 2 : revs.length ? 1 : 0;
      sit.progress = Math.round(clamp(revs.length ? 50 + revs.length * 15 : maxP * 10, 0, 100));
      const quiet = !revs.some((id) => alive(s, id) && inAnyWar(s, id));
      if (revs.length && quiet && s.day - sit.data.first > 365 * 30) { endSituation(s, sit, 'new_order'); return; }
      if (y >= 1815) endSituation(s, sit, revs.length ? 'new_order' : 'reform_from_above');
    },
    outcomeText: (s, sit) => {
      const revs: number[] = sit.data.revs || [];
      if (!revs.length) return { en: 'The crowns reformed in time: the age of revolution passed without an overthrow.', de: 'Die Kronen reformierten rechtzeitig: das Zeitalter der Revolution verging ohne Umsturz.' };
      return { en: `The age of revolution is over. ${revs.length} realm(s) overthrew their crowns; a new order rules Europe.`, de: `Das Zeitalter der Revolution ist vorbei. ${revs.length} Reich(e) stürzten ihre Kronen; eine neue Ordnung beherrscht Europa.` };
    },
    involved: (s, sit) => (sit.data.revs || []).slice(),
  },
];
export const SITUATIONS: SituationDef[] = DEFS.map(guard);

// ---------------- situation internals ----------------
function finishCrown(s: GameState, sit: Situation, en: Nation, fr: Nation, outcome: string) {
  dropClaim(s, en.id, fr.id); dropMod(en, 'crown_of_france'); dropMod(fr, 'rally_of_france');
  if (outcome === 'english_crown') {
    en.prestige = clamp(en.prestige + 30, -100, 100);
    setMod(s, en, 'dual_monarchy', 50, { en: 'Dual monarchy', de: 'Doppelmonarchie' }, { mandate_gain: 0.05, unrest: 1 });
    setMod(s, fr, 'conquered_crown', 30, { en: 'A crown in foreign hands', de: 'Eine Krone in fremder Hand' }, { concord_gain: -0.1, unrest: 2 });
  } else if (outcome === 'french_victory') {
    fr.prestige = clamp(fr.prestige + 25, -100, 100); fr.concord = clamp(fr.concord + 15, -100, 100);
    setMod(s, fr, 'realm_restored', 30, { en: 'The realm restored', de: 'Das Reich wiederhergestellt' }, { mandate_gain: 0.05, concord_gain: 0.05 });
    en.prestige = clamp(en.prestige - 20, -100, 100);
    setMod(s, en, 'lost_crown', 15, { en: 'The lost crown of France', de: 'Die verlorene Krone Frankreichs' }, { concord_gain: -0.05 });
  } else if (outcome === 'partition') {
    en.prestige = clamp(en.prestige + 10, -100, 100); fr.prestige = clamp(fr.prestige - 5, -100, 100);
  }
  endSituation(s, sit, outcome);
}

function chooseObedience(s: GameState, n: Nation, sit: Situation): number {
  const AVIGNON = ['france', 'scotland', 'naples', 'castile', 'aragon', 'navarre', 'savoy', 'burgundy', 'brittany_blois', 'cyprus', 'armagnac', 'foix_bearn', 'lorraine', 'bar', 'provence'];
  const ROME = ['england', 'hungary', 'poland', 'portugal', 'venice', 'florence', 'milan', 'denmark', 'sweden', 'norway', 'flanders', 'teutonic_order', 'genoa', 'bohemia', 'austria', 'papal_states'];
  const av = sit.data.avignon as number, ro = sit.data.rome as number;
  if (n.id === av) return 1;
  if (n.id === ro) return 0;
  let v = AVIGNON.includes(n.key) ? 40 : ROME.includes(n.key) || n.isHRE ? -40 : 0;
  if (av >= 0) {
    v += (opinion(s, n.id, av) - opinion(s, n.id, ro)) * 0.3;
    if (n.rivals.includes(av)) v -= 40;
    if (hasTreaty(s, n.id, av, 'alliance')) v += 30;
    if (n.overlord === av) v += 50;
  } else v -= 50;
  if (hasTreaty(s, n.id, ro, 'alliance')) v -= 30;
  v += (rand(s.rng) - 0.5) * 20;
  return v > 0 ? 1 : 0;
}
function finishSchism(s: GameState, sit: Situation, outcome: string) {
  const P = s.papacy;
  P.schism = false; P.antipope = -1;
  if (outcome === 'council') {
    P.reformPressure = clamp(P.reformPressure - 25, 0, 100); P.corruption = clamp(P.corruption - 5, 0, 100);
    const em = alive(s, s.empire.emperor);
    if (em && em.faith === LATIN) { sit.data.convener = em.id; em.prestige = clamp(em.prestige + 15, -100, 100); em.mandate = clamp(em.mandate + 10, 0, 100); }
  }
  for (const n of s.nations) { delete n.flags.obedience; dropMod(n, 'divided_church'); }
  s.flags.schism_done = s.day;
  endSituation(s, sit, outcome);
}

function hussiteSeed(s: GameState, w: World): number {
  const prague = locNamed(w, 'Prague');
  if (prague >= 0 && s.loc.faith[prague] === LATIN && s.loc.owner[prague] >= 0) return prague;
  let best = -1, bv = -Infinity;
  for (let i = 0; i < w.L; i++) {
    if (s.loc.faith[i] !== LATIN || s.loc.owner[i] < 0 || s.loc.buildings[i * B + BI.university] === 0) continue;
    const v = s.loc.unrest[i] + s.loc.dev[i] * 0.2; if (v > bv) { bv = v; best = i; }
  }
  return best;
}
function finishHussite(s: GameState, w: World, sit: Situation, outcome: string) {
  s.flags.hussite_done = s.day;
  if (outcome === 'compacts') for (const n of s.nations) if (n.alive && n.faith === FAITH_INDEX.hussite) {
    for (const o of s.nations) if (o.alive && o.faith === LATIN) addOpinion(s, o.id, n.id, 'compacts', 10, 365 * 20);
    setMod(s, n, 'compacts', 30, { en: 'Compacts with the Church', de: 'Kompaktaten mit der Kirche' }, { concord_gain: 0.05 });
  }
  endSituation(s, sit, outcome);
  void w;
}

function reformSeed(s: GameState, w: World, avoid: number): number {
  const st = s.innovations.find((x) => x.key === 'printing_press'); if (!st) return -1;
  const emp = s.empire.emperor;
  let best = -1, bv = -Infinity;
  for (let i = 0; i < w.L; i++) {
    if (!st.reached[i] || s.loc.faith[i] !== LATIN) continue;
    const o = s.loc.owner[i]; if (o < 0) continue;
    const n = s.nations[o]; if (n.faith !== LATIN || n.gov === 'theocracy') continue;
    const uni = s.loc.buildings[i * B + BI.university];
    if (!uni && s.loc.dev[i] < 25) continue;
    if (avoid >= 0 && w.distKm(i, avoid) < 450) continue;
    const nearCuria = s.papacy.seat >= 0 && w.distKm(i, s.papacy.seat) < 700 ? 40 : 0; // the Curia watches its own doorstep
    const v = Math.min(30, s.loc.unrest[i]) + s.loc.literacy[i] * 100 + uni * 25 + (n.isHRE ? 80 : 0) + (o !== emp ? 10 : 0) + lawEffect(n, 'reform_pressure') * 30 - nearCuria + ((i * 2654435761) >>> 0) % 10;
    if (v > bv) { bv = v; best = i; }
  }
  return best;
}

function fallOfCity(s: GameState, w: World, sit: Situation, o: Nation) {
  const city: number = sit.data.city;
  o.capital = city;
  o.name = { en: 'Ottoman Empire', de: 'Osmanisches Reich' }; o.rank = 'empire';
  o.prestige = clamp(o.prestige + 30, -100, 100); o.mandate = clamp(o.mandate + 15, 0, 100);
  setMod(s, o, 'conqueror_of_the_city', 50, { en: 'Conqueror of the City', de: 'Eroberer der Stadt' }, { mandate_gain: 0.05, authority_gain: 0.1, trade: 0.05 });
  dropMod(o, 'frontier_warriors');
  for (const n of s.nations) if (n.alive && faithFamily(n.faith) === 'christian' && n.id !== o.id) addOpinion(s, n.id, o.id, 'fall_of_the_city', n.faith === FAITH_INDEX.orthodox ? -40 : -20, 365 * 30);
  s.flags.constantinople_fallen = s.day;
  endSituation(s, sit, 'conquest');
  void w;
}

function finishReconquista(s: GameState, w: World, sit: Situation) {
  const city: number = sit.data.city;
  const v = alive(s, city >= 0 ? s.loc.owner[city] : sit.data.champion) ?? alive(s, sit.data.champion);
  if (v) {
    sit.data.victor = v.id;
    v.prestige = clamp(v.prestige + 25, -100, 100); v.mandate = clamp(v.mandate + 10, 0, 100);
    setMod(s, v, 'reconquest_complete', 30, { en: 'The reconquest complete', de: 'Die Rückeroberung vollendet' }, { mandate_gain: 0.05, morale: 0.05 });
    if (v.faith === LATIN) s.papacy.curiaFavour[v.id] = clamp((s.papacy.curiaFavour[v.id] || 0) + 25, 0, 100);
    for (const n of s.nations) if (n.alive && n.faith === v.faith && n.id !== v.id) addOpinion(s, n.id, v.id, 'reconquest', 15, 365 * 20);
    dropMod(v, 'war_for_granada');
  }
  const champ = s.nations[sit.data.champion ?? -1];
  if (champ) { delete champ.flags.siege_focus; dropMod(champ, 'war_for_granada'); }
  s.flags.reconquista_done = s.day;
  endSituation(s, sit, 'completed');
  void w;
}

const ATL_CACHE = new WeakMap<World, number[]>();
function atlanticCoast(w: World): number[] {
  let a = ATL_CACHE.get(w);
  if (a) return a;
  a = [];
  for (let i = 0; i < w.L; i++) {
    if (!w.coastal[i] || w.lat[i] < 35 || w.lat[i] > 62 || w.lon[i] > 2 || w.lon[i] < -12) continue;
    let ocean = false;
    for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) { const v = w.adj[e]; if (v >= w.L && w.lon[v] < -4) ocean = true; }
    if (ocean) a.push(i);
  }
  ATL_CACHE.set(w, a); return a;
}
export function atlanticRealms(s: GameState, w: World): Nation[] {
  const ids = new Set<number>();
  for (const l of atlanticCoast(w)) { const o = s.loc.owner[l]; if (o >= 0) ids.add(o); }
  return [...ids].map((i) => s.nations[i]).filter((n) => n.alive && n.overlord < 0 && n.flags.pretender_of === undefined && n.tech[1] >= 6 && faithFamily(n.faith) === 'christian');
}
function overseas(s: GameState, w: World, id: number) { let k = 0; for (const l of nationLocsRO(s, id)) if (w.lon[l] < -25 || (w.lat[l] < 15 && w.lon[l] < 60)) k++; return k; }
/** Reveal k unknown sea zones on the edge of the known ocean (and their coasts) for this realm's sphere. */
function chartVoyage(s: GameState, w: World, n: Nation, k: number, y: number): number {
  const E = s.explored[n.knows]; if (!E) return 0;
  const cand: [number, number][] = [];
  for (let i = w.L; i < w.N; i++) {
    if (E[i]) continue;
    if (w.lon[i] > 60 || w.lat[i] > 66) continue;
    if (n.era < 1 && (w.lat[i] < 0 || w.lon[i] < -32)) continue;
    let edge = false;
    for (let e = w.adjStart[i]; e < w.adjStart[i + 1] && !edge; e++) { const v = w.adj[e]; if (v >= w.L && E[v] && (w.lon[v] < -4 || w.lat[v] < 28)) edge = true; }
    if (!edge) continue;
    const pref = y < 1490 ? w.lat[i] : w.lon[i]; // first south along Africa, then west
    cand.push([i, pref + rand(s.rng) * 12]);
  }
  cand.sort((a, b) => a[1] - b[1]);
  let got = 0;
  for (const [i] of cand.slice(0, k)) {
    E[i] = 1; got++;
    for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) { const v = w.adj[e]; if (v < w.L) E[v] = 1; }
  }
  return got;
}
function milestone(s: GameState, n: Nation | undefined, what: I18n) {
  if (!n) return;
  n.prestige = clamp(n.prestige + 15, -100, 100);
  const t = { en: `Navigators of ${n.short.en} ${what.en}.`, de: `Seefahrer aus ${n.short.de} ${what.de}.` };
  world(s, t, n.id); tell(s, t);
}

export function confessionalSplit(s: GameState): { cath: number; prot: number; cathMembers: number[]; protMembers: number[] } | null {
  const mem = s.nations.filter((n) => n.alive && n.isHRE && n.overlord < 0);
  const cath = mem.filter((n) => n.faith === LATIN), prot = mem.filter((n) => isReform(n.faith));
  if (cath.length < 3 || prot.length < 3) return null;
  const dc = cath.reduce((p, n) => p + nationDev(s, n.id), 0), dp = prot.reduce((p, n) => p + nationDev(s, n.id), 0);
  if (dc < (dc + dp) * 0.15 || dp < (dc + dp) * 0.15) return null;
  const emp = alive(s, s.empire.emperor);
  const byDev = (a: Nation, b: Nation) => nationDev(s, b.id) - nationDev(s, a.id);
  const cl = emp && emp.faith === LATIN ? emp : cath.sort(byDev)[0];
  const pl = emp && isReform(emp.faith) ? emp : prot.sort(byDev)[0];
  return { cath: cl.id, prot: pl.id, cathMembers: cath.map((n) => n.id), protMembers: prot.map((n) => n.id) };
}
function joinWar(s: GameState, war: { att: number[]; def: number[] }, id: number, side: 'att' | 'def', p: number) {
  const n = s.nations[id];
  if (!n?.alive || n.overlord >= 0 || war.att.includes(id) || war.def.includes(id)) return;
  if (human(s, id)) { notice(s, id, 'situation', { en: 'Our brethren in faith call on us to join their war.', de: 'Unsere Glaubensbrüder rufen uns auf, in ihren Krieg einzutreten.' }); return; }
  const foes = side === 'att' ? war.def : war.att;
  if (foes.some((f) => hasTreaty(s, id, f, 'alliance') || hasTreaty(s, id, f, 'truce'))) return;
  if (!chance(s.rng, p)) return;
  (side === 'att' ? war.att : war.def).push(id);
}
function finishConfessional(s: GameState, sit: Situation, outcome: string) {
  s.flags.confessional_war_done = s.day;
  if (outcome === 'peace_congress') {
    s.empire.authority = clamp(s.empire.authority - 25, 0, 100);
    for (const n of s.nations) if (n.alive && n.isHRE) {
      setMod(s, n, 'peace_of_the_confessions', 50, { en: 'Peace of the confessions', de: 'Konfessionsfrieden' }, { authority_gain: 0.05, tolerance: 0.1 });
      n.warExhaustion = Math.max(0, n.warExhaustion - 20);
    }
  }
  endSituation(s, sit, outcome);
}

export function monarchy(n: Nation) { return !n.gov.includes('republic') && n.gov !== 'theocracy' && n.gov !== 'military_order' && n.gov !== 'nomadic_horde' && n.gov !== 'tribal_federation'; }
function revolution(s: GameState, w: World, sit: Situation, n: Nation) {
  const oldName = n.short.en;
  n.gov = 'revolutionary_republic';
  n.name = { en: `${n.adj.en} Republic`, de: `${adjDe(n)}e Republik` };
  const set = (law: string, opt: number) => { if (n.laws[law] !== undefined) n.laws[law] = opt; };
  set('serfdom', 0); set('nobility', 0); set('clergy_tax', 0); set('succession', 4); set('diet', 2); if (n.era >= 2) set('tolerance', 3);
  for (const e of n.estates) {
    if (e.id === 'magnates') { e.contentment = 10; e.influence = Math.max(5, e.influence * 0.4); }
    if (e.id === 'prelates') { e.contentment = 15; e.influence = Math.max(5, e.influence * 0.6); }
    if (e.id === 'burghers' || e.id === 'commons') { e.contentment = 70; e.influence = Math.min(100, e.influence * 1.4); }
  }
  n.concord = clamp(n.concord - 30, -100, 100); n.mandate = 40; n.authority += 50;
  n.loans = []; n.debt = 0; n.inflation += 0.1;
  for (const l of nationLocsRO(s, n.id)) s.loc.unrest[l] *= 0.5;
  setMod(s, n, 'revolutionary_fervour', 15, { en: 'Revolutionary fervour', de: 'Revolutionärer Eifer' }, { morale: 0.1, manpower: 0.15, unrest: -2 });
  for (const o of s.nations) if (o.alive && o.id !== n.id && monarchy(o) && o.capital >= 0 && n.capital >= 0 && w.distKm(o.capital, n.capital) < 1600) addOpinion(s, o.id, n.id, 'regicide', -40, 365 * 20);
  n.flags.revolution = s.day;
  const t = { en: `Revolution in ${oldName}! The crown has been overthrown and the ${n.name.en} proclaimed.`, de: `Revolution in ${n.short.de}! Die Krone wurde gestürzt und die ${n.name.de} ausgerufen.` };
  world(s, t, n.id, n.capital); tell(s, t);
  if (nationLocsRO(s, n.id).length >= 20 && chance(s.rng, 0.4)) startCivilWar(s, w, n);
  void sit;
}
