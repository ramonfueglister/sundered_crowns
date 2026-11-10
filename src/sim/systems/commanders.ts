// Commanders: who can lead an army (the ruler, the heir, grown kin, nobles at court, the realm's generals), new
// generals raised from the realm's own people, what a commander brings to battle (generalship and traits), what
// battles teach them, and their ageing and death. Also keeps the register of characters lean: people long dead and no
// longer needed are dropped once a year.
import type { GameState, Nation, Army, Character } from '../types';
import type { World } from '../world';
import { type System, clamp, newId, notice } from '../ctx';
import { rand, chance } from '../rng';
import { ageOf, monthlyDeathChance, characterDies } from './politics';
import { personName, localName } from '../content/names';
import { siblingsOf } from './dynasty';

const YEAR = 365;
/** Traits a commander can have or win in the field, with what they do in battle (systems/military.ts sideStats).
 *  skill: added to generalship (each point is 6 % more damage dealt); morale: less morale lost under fire. Speed is
 *  'energetic' (10 % faster marches, military.ts). */
export const COMMANDER_TRAITS: Record<string, { skill: number; morale: number; speed?: number; name: { en: string; de: string } }> = {
  tactician: { skill: 1, morale: 0, name: { en: 'Tactician', de: 'Taktiker' } },
  veteran: { skill: 0, morale: 0.1, name: { en: 'Veteran', de: 'Kriegserfahren' } },
  brave: { skill: 0, morale: 0.05, name: { en: 'Brave', de: 'Tapfer' } },
  rash: { skill: 0.5, morale: -0.05, name: { en: 'Rash', de: 'Unbesonnen' } },
  cautious: { skill: -0.5, morale: 0.08, name: { en: 'Cautious', de: 'Vorsichtig' } },
  wounded: { skill: -1, morale: 0, name: { en: 'Wounded', de: 'Verwundet' } },
  energetic: { skill: 0, morale: 0, speed: 0.1, name: { en: 'Energetic', de: 'Tatkräftig' } },
};
/** Generalship a commander brings to battle: the skill plus or minus traits (0..8). */
export function commanderSkill(c: Character | undefined | null): number {
  if (!c) return 0;
  let v = c.skills[2];
  for (const t of c.traits) v += COMMANDER_TRAITS[t]?.skill ?? 0;
  return clamp(v, 0, 8);
}
/** Morale steadiness from traits (a share of morale loss avoided; military.ts sideStats). */
export function commanderMorale(c: Character | undefined | null): number {
  if (!c) return 0;
  let v = 0; for (const t of c.traits) v += COMMANDER_TRAITS[t]?.morale ?? 0;
  return v;
}
/** Parts of a commander's battle value for the breakdown tooltip: [label key or name, value]. */
export function commanderParts(c: Character): { skill: [string | { en: string; de: string }, number][]; morale: [string | { en: string; de: string }, number][] } {
  const skill: [string | { en: string; de: string }, number][] = [['x_generalship', c.skills[2]]];
  const morale: [string | { en: string; de: string }, number][] = [];
  for (const t of c.traits) { const d = COMMANDER_TRAITS[t]; if (!d) continue; if (d.skill) skill.push([d.name, d.skill]); if (d.morale) morale.push([d.name, d.morale]); }
  return { skill, morale };
}

/** Gold for raising a new, seasoned general: two months of taxes, at least 25 (scaled by prices). */
export function generalCost(s: GameState, n: Nation): number { return Math.round(Math.max(25 * s.priceLevel, (n.income.tax || 10) * 2)); }

const alive = (s: GameState, id: number | undefined) => { const c = id ? s.chars[id] : undefined; return c && c.alive ? c : undefined; };
/** The army or fleet a person leads, if any. */
export function commandOf(s: GameState, id: number): Army | undefined { return s.armies.find((a) => a.general === id); }

/** Everyone who could lead an army of realm n: the ruler and heir (grown, not too old), grown sons, daughters,
 *  brothers and sisters of the ruler at court, the nobles waiting at court for office, and the realm's generals.
 *  Officials keep to their offices; a regent rules. */
export function availableCommanders(s: GameState, n: Nation): Character[] {
  const out: Character[] = []; const seen = new Set<number>();
  const add = (c: Character | undefined) => {
    if (!c || !c.alive || seen.has(c.id) || c.nation !== n.id || c.id === n.regent) return;
    const age = ageOf(s, c); if (age < 16 || age > 70) return;
    for (const o in n.council) if (n.council[o] === c.id) return;
    seen.add(c.id); out.push(c);
  };
  add(alive(s, n.ruler)); add(alive(s, n.heir));
  const r = alive(s, n.ruler);
  if (r) { for (const k of r.children) add(s.chars[k]); for (const c of siblingsOf(s, r)) add(c); }
  for (const id of n.candidates ?? []) add(s.chars[id]);
  for (const id of n.generals ?? []) add(s.chars[id]);
  return out;
}

/** Make c the commander of army a (taking c from any other command). */
export function setCommander(s: GameState, n: Nation, a: Army, c: Character) {
  for (const o of s.armies) if (o.general === c.id) o.general = 0;
  a.general = c.id;
  if (c.role === 'courtier' || c.role === 'general' || c.role === 'admiral' || !c.role) c.role = a.fleet ? 'admiral' : 'general';
  n.candidates = (n.candidates ?? []).filter((id) => id !== c.id);
  const g = (n.generals ??= []); if (!g.includes(c.id) && c.id !== n.ruler && c.id !== n.heir) g.push(c.id);
}

/** A new commander from the realm's own people: a seasoned captain when paid for (generalship 2 to 5), else a lord
 *  of the levy (1 to 4). Uses the game's random sequence. */
export function raiseGeneral(s: GameState, n: Nation, paid: boolean, fleet = false): Character {
  const p = personName(s.rng, n.culture, false);
  const skill = paid ? 2 + Math.floor(rand(s.rng) * 4) : 1 + Math.floor(rand(s.rng) * 4);
  const pool = ['brave', 'cautious', 'energetic', 'rash', 'tactician'];
  const traits = chance(s.rng, paid ? 0.45 : 0.3) ? [pool[Math.floor(rand(s.rng) * (paid ? 5 : 4))]] : [];
  const c: Character = { id: newId(s), name: p.name, dynasty: p.dynasty, female: false, born: s.day - Math.floor((25 + rand(s.rng) * 25) * YEAR), skills: [1, 1, skill], traits, nation: n.id, alive: true, children: [], health: 1, role: fleet ? 'admiral' : 'general', xp: 0 };
  s.chars[c.id] = c;
  (n.generals ??= []).push(c.id);
  return c;
}

/** Pick the ablest free commander for an army (the AI's choice and the automatic one for a host without a leader):
 *  the ruler or heir only when a fine general (4 or more), otherwise the best of the realm's generals, kin and nobles
 *  at court; when none is any good (below 2), a new lord of the levy is raised at no cost. Returns the person's id. */
export function appointBest(s: GameState, n: Nation, a: Army): number {
  let best: Character | null = null, bv = -1;
  for (const c of availableCommanders(s, n)) {
    if (commandOf(s, c.id)) continue;
    const v = commanderSkill(c);
    if ((c.id === n.ruler || c.id === n.heir) && (c.skills[2] < 4 || ageOf(s, c) > 60)) continue;
    if (c.female && c.id !== n.ruler) continue; // (the player may choose a woman to lead; the AI keeps to the custom of the age)
    if (v > bv || (v === bv && best && c.id < best.id)) { bv = v; best = c; }
  }
  // a poor leader is replaced by a new lord of the levy, unless the realm already keeps more generals than hosts
  const hosts = s.armies.filter((x) => x.owner === n.id && !x.rebels).length;
  if (!best || (bv < 2 && (n.generals ?? []).length < hosts + 2)) best = raiseGeneral(s, n, false, a.fleet);
  setCommander(s, n, a, best);
  return best.id;
}

/** What a battle teaches the commanders on both sides (systems/military.ts endBattle): experience for all, more for
 *  the victors; a victor may grow in generalship or become a tactician, a seasoned one a veteran; a beaten one may be
 *  wounded. */
export function battleLessons(s: GameState, winners: Army[], losers: Army[]) {
  for (const [list, won] of [[winners, true], [losers, false]] as const) for (const a of list) {
    const c = alive(s, a.general); if (!c) continue;
    c.xp = (c.xp ?? 0) + (won ? 2 : 1);
    if (won && c.skills[2] < 6 && chance(s.rng, 0.1)) c.skills[2]++;
    if (won && c.skills[2] >= 3 && !c.traits.includes('tactician') && chance(s.rng, 0.06)) c.traits.push('tactician');
    if ((c.xp ?? 0) >= 8 && !c.traits.includes('veteran')) c.traits.push('veteran');
    if (!won && !c.traits.includes('wounded') && chance(s.rng, 0.1)) { c.traits.push('wounded'); c.health = Math.max(0.2, c.health - 0.3); }
  }
}

// ---------------- ageing, death, the register ----------------
function generalsMonth(s: GameState, w: World, n: Nation) {
  const keep: number[] = [];
  const bereft: { a: Army | undefined; c: Character }[] = [];
  for (const id of n.generals ?? []) {
    const c = s.chars[id];
    if (!c || !c.alive || c.nation !== n.id) continue;
    if (c.id === n.ruler || c.id === n.heir || c.id === n.consort || c.id === n.regent || Object.values(n.council).includes(c.id)) continue; // they age with the court (politics.ts)
    const age = ageOf(s, c);
    if (age > 50) c.health = Math.max(0.2, c.health - 0.002);
    if (chance(s.rng, monthlyDeathChance(age, c))) {
      const a = commandOf(s, c.id);
      characterDies(s, w, n, c.id);
      if (a) a.general = 0;
      bereft.push({ a, c });
      continue;
    }
    if (age >= 70 && c.role !== 'courtier') {
      // retirement: the old commander leaves the field (and goes on ageing here until death)
      const a = commandOf(s, c.id); if (a) a.general = 0;
      c.role = 'courtier';
    }
    keep.push(id);
  }
  // in peace a realm keeps no more idle generals than it has hosts and three more: the least able goes home
  const hosts = s.armies.filter((x) => x.owner === n.id && !x.rebels).length;
  const idle = keep.filter((id) => !commandOf(s, id) && s.chars[id].role !== 'courtier');
  if (idle.length > hosts + 3) {
    const worst = idle.sort((x, y) => commanderSkill(s.chars[x]) - commanderSkill(s.chars[y]) || y - x)[0];
    const c = s.chars[worst]; c.role = 'courtier';
    keep.splice(keep.indexOf(worst), 1);
    if (!c.spouse && !c.children.length) delete s.chars[worst];
  }
  n.generals = keep;
  // a great host (over 3000 men, as in military.ts monthly) whose commander died takes the ablest free one at once,
  // instead of marching a month without a leader; the player is told who leads it now
  for (const { a, c } of bereft) {
    const men = a ? a.regs.reduce((m, r) => m + r.men, 0) : 0;
    const next = a && !a.fleet && !a.rebels && s.armies.includes(a) && men > 3000 ? s.chars[appointBest(s, n, a)] : undefined;
    if (!s.playerNations.includes(n.id)) continue;
    const en = !a ? '' : next ? `; ${next.name} takes command of the army` : ', leaving the army without a commander';
    const de = !a ? '' : next ? `; ${localName(next.name, 'de', next.female)} übernimmt den Befehl über das Heer` : '; das Heer ist ohne Befehlshaber';
    notice(s, n.id, 'general_death', { en: `${c.name} has died${en}.`, de: `${localName(c.name, 'de', c.female)} ist gestorben${de}.` }, a ? { army: a.id } : {});
  }
}

/** Drop the records of people dead ten years or more whom nothing refers to (no living child or spouse, no office,
 *  no army). */
export function pruneCharacters(s: GameState) {
  const keep = new Set<number>();
  for (const n of s.nations) { for (const id of [n.ruler, n.heir, n.consort, n.regent, ...Object.values(n.council), ...(n.candidates ?? []), ...(n.generals ?? [])]) keep.add(id); }
  for (const a of s.armies) if (a.general) keep.add(a.general);
  for (const e of s.explorers) if (e.char) keep.add(e.char);
  for (const k in s.chars) {
    const c = s.chars[k];
    if (!c.alive) continue;
    keep.add(c.id);
    if (c.spouse) keep.add(c.spouse);
    if (c.father) keep.add(c.father);
    if (c.mother) keep.add(c.mother);
  }
  let gone = 0;
  for (const k in s.chars) {
    const c = s.chars[k];
    if (c.alive || keep.has(c.id) || s.day - (c.died ?? 0) < 10 * YEAR) continue;
    delete s.chars[k]; gone++;
  }
  if (gone) for (const k in s.chars) { const c = s.chars[k]; if (c.children.length) c.children = c.children.filter((x) => !!s.chars[x]); }
}

export const commanders: System = {
  id: 'commanders',
  monthly({ s, w }) {
    for (const n of s.nations) if (n.alive) generalsMonth(s, w, n);
  },
  yearly({ s }) { pruneCharacters(s); },
};
