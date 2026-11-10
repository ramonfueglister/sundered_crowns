// Internal politics: laws & reforms, Powers of the Realm, value axes, council, rulers, succession, Concord & Mandate.
import type { GameState, Nation, Character, Estate, I18n } from '../types';
import type { World } from '../world';
import { type Ctx, type System, DAY_EPOCH, clamp, chronicle, notice, newId, addExpense, addOpinion } from '../ctx';
import { addIncome } from '../ctx'; // fix-econ: what an estate pays for a privilege
import { LAWS, LAW_INDEX, VALUES } from '../content/laws';
import { rand, chance, hash01, pick, seedRng } from '../rng';
import { dayToDate, dateToDay } from '../calendar';
import { FAITHS, GROUP_TRADITIONS } from '../content/peoples';
import { dutyDiscontent } from './duties';
import { classSums, influenceTargets, resentment, INFLUENCE_DRIFT, govSuccessor, govMandateParts, estateName, type ClassSums } from './government';

// Every effect key is read through lawEffect(): laws, value axes, the tradition of the realm's culture group and all
// timed and permanent modifiers (privileges, doctrines, innovations, landmarks, events) are summed into one table.
// mod() (ctx.ts) sums the modifiers alone and is no longer used to read effects, so nothing is counted twice and no
// source is left out. The keys and their meaning are listed in src/sim/effects.ts.
// Effect keys get a slot in a numeric table; law options and value axes are resolved to [slot, value, ...] once.
const EK = new Map<string, number>();
function ekey(k: string): number { let i = EK.get(k); if (i === undefined) { i = EK.size; EK.set(k, i); } return i; }
/** Every effect key the table has met so far: laws, value axes, traditions and every modifier any realm has held
 *  (tests/effects_wired.test.ts checks each against the registry src/sim/effects.ts). */
export function effectKeysSeen(): string[] { if (!LAW_FX) resolveFx(); return [...EK.keys()]; }
function flatFx(fx: Record<string, number>): number[] { const a: number[] = []; for (const k in fx) a.push(ekey(k), fx[k]); return a; }
let LAW_FX: number[][][] | null = null, VAL_LO: number[][] = [], VAL_HI: number[][] = [], TRAD_FX: Record<string, number[]> = {};
function resolveFx() {
  LAW_FX = LAWS.map((L) => L.options.map((o) => flatFx(o.effects)));
  VAL_LO = VALUES.map((v) => flatFx(v.effectsLow)); VAL_HI = VALUES.map((v) => flatFx(v.effectsHigh));
  TRAD_FX = Object.fromEntries(Object.entries(GROUP_TRADITIONS).map(([g, t]) => [g, flatFx(t.effects)]));
}
/** Legal exemption of class c from the crown's taxes and duties, 0..1 (exempt_<class> effects; systems/economy.ts). */
export function classExempt(n: Nation, c: number): number { return clamp(lawEffect(n, `exempt_${c}`), 0, 1); }
/** Culture group of a realm's ruling culture, whose tradition it follows. */
export function traditionGroup(n: Nation): string { return GROUP_OF[ALL_CULTURES[n.culture]] ?? 'other'; }
/** The tradition of a realm's culture group (always part of lawEffect). */
export function traditionOf(n: Nation) { const g = traditionGroup(n); return { group: g, ...(GROUP_TRADITIONS[g] ?? GROUP_TRADITIONS.other) }; }
const LE_CACHE = new WeakMap<Nation, { e: number; m: Float64Array }>();
/** Sum of an effect over laws, value axes and modifiers. Whole table built once per nation per day. */
export function lawEffect(n: Nation, key: string): number {
  let c = LE_CACHE.get(n);
  if (!c) { c = { e: DAY_EPOCH.v, m: buildEffects(n, null) }; LE_CACHE.set(n, c); }
  else if (c.e !== DAY_EPOCH.v) { c.e = DAY_EPOCH.v; c.m = buildEffects(n, c.m); }
  const k = EK.get(key);
  return k === undefined || k >= c.m.length ? 0 : c.m[k];
}
/** The laws' share of the table (summed first, so later additions are unchanged). Laws change rarely: the sum is kept
 *  per nation while the same laws hold the same options in the same order. */
const LAW_PART = new WeakMap<Nation, { ids: string[]; opts: number[]; m: Float64Array }>();
function lawPart(n: Nation): Float64Array {
  const c = LAW_PART.get(n);
  if (c) {
    let k = 0, ok = true;
    for (const id in n.laws) { if (c.ids[k] !== id || c.opts[k] !== n.laws[id]) { ok = false; break; } k++; }
    if (ok && k === c.ids.length) return c.m;
  }
  const ids: string[] = [], opts: number[] = [];
  const m = new Float64Array(EK.size);
  for (const id in n.laws) {
    ids.push(id); opts.push(n.laws[id]);
    const li = LAW_INDEX[id]; if (!LAWS[li]) continue;
    const fx = LAW_FX![li][n.laws[id]]; if (!fx) continue;
    for (let j = 0; j < fx.length; j += 2) { const v = fx[j + 1]; if (v) m[fx[j]] += v; }
  }
  LAW_PART.set(n, { ids, opts, m });
  return m;
}
/** Same sums, in the same order, as adding each law option's, value axis', the tradition's and every modifier's
 *  effects into a map. */
function buildEffects(n: Nation, reuse: Float64Array | null): Float64Array {
  if (!LAW_FX) resolveFx();
  for (const md of n.modifiers) for (const k in md.effects) ekey(k);
  // the previous day's table is overwritten when it still has the right size
  const m = reuse && reuse.length === EK.size ? reuse : new Float64Array(EK.size);
  const lp = lawPart(n);
  m.set(lp); if (lp.length < m.length) m.fill(0, lp.length);
  for (let a = 0; a < VALUES.length; a++) {
    const val = n.values[a] || 0; if (!val) continue;
    const fx = val < 0 ? VAL_LO[a] : VAL_HI[a];
    for (let j = 0; j < fx.length; j += 2) { const v = fx[j + 1] * Math.abs(val) / 100; if (v) m[fx[j]] += v; }
  }
  const tr = TRAD_FX[traditionGroup(n)];
  if (tr) for (let j = 0; j < tr.length; j += 2) m[tr[j]] += tr[j + 1];
  for (const md of n.modifiers) for (const k in md.effects) { const v = md.effects[k]; if (v) m[EK.get(k)!] += v; }
  return m;
}

// ---------------- Powers of the Realm ----------------
export const ESTATES: { id: string; name: { en: string; de: string }; desc: { en: string; de: string } }[] = [
  { id: 'magnates', name: { en: 'Magnates', de: 'Magnaten' }, desc: { en: 'The great lords: they lead armies and hold the countryside.', de: 'Die großen Herren: sie führen Heere und beherrschen das Land.' } },
  { id: 'prelates', name: { en: 'Prelates', de: 'Prälaten' }, desc: { en: 'Bishops and abbots: they hold land, souls and learning.', de: 'Bischöfe und Äbte: sie halten Land, Seelen und Gelehrsamkeit.' } },
  { id: 'burghers', name: { en: 'Burghers', de: 'Bürger' }, desc: { en: 'Merchants and guilds of the towns: they hold the money.', de: 'Kaufleute und Zünfte der Städte: sie halten das Geld.' } },
  { id: 'commons', name: { en: 'Commons', de: 'Gemeine' }, desc: { en: 'Peasants and labourers: they pay, fight and revolt.', de: 'Bauern und Tagelöhner: sie zahlen, kämpfen und rebellieren.' } },
];
export const PRIVILEGES: { id: string; estate: string; name: { en: string; de: string }; grant: Record<string, number>; effects: Record<string, number>; resent?: Record<string, number> }[] = [
  { id: 'magnate_command', estate: 'magnates', name: { en: 'Hereditary commands', de: 'Erbliche Befehlsgewalt' }, grant: { authority: 25 }, effects: { manpower: 0.15, control: -0.05 }, resent: { commons: -5 } },
  { id: 'magnate_tax', estate: 'magnates', name: { en: 'Exemption from the hearth tax', de: 'Befreiung von der Herdsteuer' }, grant: { treasury_months: 3 }, effects: { hearth_exempt_nobles: 1, tax: -0.08 }, resent: { burghers: -6, commons: -6 } },
  { id: 'magnate_council', estate: 'magnates', name: { en: 'Seats in the royal council', de: 'Sitze im Kronrat' }, grant: { concord: 15 }, effects: { authority_gain: -0.2 }, resent: { burghers: -5 } },
  { id: 'prelate_tithe', estate: 'prelates', name: { en: 'Untouchable tithes', de: 'Unantastbarer Zehnt' }, grant: { mandate: 10 }, effects: { tax: -0.05, conversion: 0.2 }, resent: { commons: -5, burghers: -3 } },
  { id: 'prelate_schools', estate: 'prelates', name: { en: 'Church control of schools', de: 'Kirchliche Schulaufsicht' }, grant: { concord: 10 }, effects: { research: -0.05, literacy: 0.01 }, resent: { burghers: -3 } },
  { id: 'burgher_monopoly', estate: 'burghers', name: { en: 'Trade monopolies', de: 'Handelsmonopole' }, grant: { treasury_months: 4 }, effects: { trade: -0.06, tax: 0.03 }, resent: { commons: -4, magnates: -3 } },
  { id: 'burgher_loans', estate: 'burghers', name: { en: 'Crown loans on easy terms', de: 'Kronkredite zu leichten Bedingungen' }, grant: { authority: 10 }, effects: { interest: -0.02 }, resent: { magnates: -3 } },
  { id: 'commons_charters', estate: 'commons', name: { en: 'Village charters', de: 'Dorfbriefe' }, grant: { concord: 10 }, effects: { unrest: -3, tax: -0.03 }, resent: { magnates: -8 } },
  // eight more, so that each Power has four (systems/government.ts: demands, assembly concessions, resentment)
  { id: 'magnate_serfs', estate: 'magnates', name: { en: 'Lordship over the villages', de: 'Herrschaft über die Dörfer' }, grant: { authority: 15 }, effects: { serfdom: 0.2, manpower: 0.05, growth: -0.02 }, resent: { commons: -15 } },
  { id: 'prelate_courts', estate: 'prelates', name: { en: 'Church courts', de: 'Geistliche Gerichtsbarkeit' }, grant: { mandate: 8 }, effects: { unrest: -1, control: -0.03, tolerance: -0.1 }, resent: { burghers: -5, magnates: -5 } },
  { id: 'prelate_lands', estate: 'prelates', name: { en: 'Lands in mortmain', de: 'Güter der Toten Hand' }, grant: { concord: 8 }, effects: { exempt_4: 0.5, conversion: 0.1 }, resent: { commons: -5, magnates: -3 } },
  { id: 'burgher_charters', estate: 'burghers', name: { en: 'Town liberties', de: 'Stadtfreiheiten' }, grant: { treasury_months: 3 }, effects: { trade: 0.04, production: 0.02, control: -0.03 }, resent: { magnates: -8 } },
  { id: 'burgher_seats', estate: 'burghers', name: { en: 'Burghers in the council', de: 'Bürger im Rat' }, grant: { authority: 15 }, effects: { tax: 0.03, estate_power: 0.05, authority_gain: -0.1 }, resent: { magnates: -10 } },
  { id: 'commons_arms', estate: 'commons', name: { en: 'Right to bear arms', de: 'Waffenrecht der Bauern' }, grant: { concord: 5 }, effects: { home_defence: 0.1, manpower: 0.05, control: -0.03 }, resent: { magnates: -12 } },
  { id: 'commons_pastures', estate: 'commons', name: { en: 'Common pastures', de: 'Allmende' }, grant: { concord: 8 }, effects: { growth: 0.03, unrest: -2, production: -0.02 }, resent: { magnates: -6 } },
  { id: 'commons_tribunes', estate: 'commons', name: { en: 'Tribunes of the people', de: 'Volkstribune' }, grant: { mandate: 5 }, effects: { unrest: -2, corruption: -0.3, authority_gain: -0.1 }, resent: { magnates: -8, burghers: -4 } },
];

function estateDefaults(n: Nation): Estate[] {
  const gov = n.gov;
  const base: Record<string, number> = { magnates: 40, prelates: 25, burghers: 20, commons: 15 };
  if (gov.includes('republic')) { base.burghers = 50; base.magnates = 20; }
  if (gov === 'theocracy' || gov === 'military_order') { base.prelates = 50; base.magnates = 25; }
  if (gov === 'nomadic_horde' || gov === 'tribal_federation') { base.magnates = 60; base.burghers = 5; base.prelates = 10; }
  return ESTATES.map((e) => ({ id: e.id, influence: base[e.id], contentment: 50, privileges: [] }));
}

export function estate(n: Nation, id: string) { return n.estates.find((e) => e.id === id)!; }

// ---------------- characters ----------------
// Names come from the realm's people (content/names.ts): given names and noble families of its culture.
import { GROUP_OF, ALL_CULTURES } from '../content/peoples';
import { givenName, personName, houseName, localName, familyForm, localHouse } from '../content/names';
import { rulerTraitEffects } from '../content/traits';
import { christianClaimants, pressLater, houseMember, inheritClaims, unwed, houseWarning, freshGivenName } from './dynasty';
function nameFor(s: GameState, n: Nation, female: boolean, rng: number[] = s.rng): string {
  return givenName(rng, n.culture, female);
}
/** A name in German, for the German half of a notice or chronicle line (content/names.ts localName). */
const de = (c: Character | undefined | null) => localName(c?.name ?? '?', 'de', !!c?.female);
/** The same for a person of a ruling house (ruler, heir, kin), whose given names German writes in their German form. */
const deR = (c: Character | undefined | null) => localName(c?.name ?? '?', 'de', !!c?.female, true);
const TRAITS_GOOD = ['just', 'wise', 'brave', 'diligent', 'charming', 'pious', 'shrewd', 'patient', 'learned', 'energetic'];
const TRAITS_BAD = ['cruel', 'lazy', 'craven', 'greedy', 'rash', 'sickly', 'paranoid', 'weak_willed', 'profligate'];

export function ageOf(s: GameState, c: Character): number { return (s.day - c.born) / 365.25; }
export function newChar(s: GameState, n: Nation, opts: Partial<Character> = {}): Character {
  const id = newId(s);
  const female = opts.female ?? chance(s.rng, 0.5);
  const c: Character = {
    id, name: opts.name ?? nameFor(s, n, female), dynasty: opts.dynasty ?? n.dynasty, female, born: opts.born ?? s.day,
    skills: opts.skills ?? [Math.floor(rand(s.rng) * 5), Math.floor(rand(s.rng) * 5), Math.floor(rand(s.rng) * 5)] as [number, number, number],
    traits: opts.traits ?? (chance(s.rng, 0.5) ? [pick(s.rng, chance(s.rng, 0.6) ? TRAITS_GOOD : TRAITS_BAD)] : []),
    nation: n.id, alive: true, children: [], health: 1, role: opts.role ?? 'courtier', ...opts,
  } as Character;
  s.chars[id] = c;
  return c;
}

/** monthly mortality probability by age (Gompertz-like, from a fixed table for determinism) */
const MORT = [0.006, 0.0012, 0.0006, 0.0008, 0.0012, 0.0015, 0.0018, 0.0022, 0.0028, 0.0036, 0.0048, 0.0065, 0.009, 0.013, 0.019, 0.028, 0.042, 0.06, 0.09];
export function monthlyDeathChance(age: number, c: Character): number {
  const k = Math.max(0, Math.min(MORT.length - 1, Math.floor(age / 5)));
  let p = MORT[k];
  if (c.traits.includes('sickly') || c.traits.includes('ailing')) p *= 2.5;
  if (c.traits.includes('hardy')) p *= 0.6;
  p *= 1 + (1 - c.health) * 3;
  return p;
}

export function rulerAge(s: GameState, n: Nation) { const r = s.chars[n.ruler]; return r ? ageOf(s, r) : 40; }

/** True when c lives at the court of n (or of its ruler r, for a crown shared in personal union). A son or daughter
 *  married abroad keeps the claim on the house's throne (systems/dynasty.ts wed) but is no longer in line here: the
 *  claim passes the crown only when the house dies out, through successionClaims and a personal union. */
const atCourt = (n: Nation, r: Character, c: Character) => c.nation === n.id || c.nation === r.nation;
/** The line of succession of a hereditary crown after ruler r, first in line first: the ruler's descendants, then
 *  the descendants of the ruler's father (brothers and sisters, their children and grandchildren), then of the
 *  grandfather. Each person is followed by their own descendants, so a dead son's children come before his younger
 *  brothers. Under male primogeniture (and seniority or an elective crown, whose heir presumptive is found the same
 *  way) the men of the house in the male line come first (sons, grandsons by sons, brothers, their sons), then everyone
 *  else with sons before daughters; under cognatic primogeniture age alone decides. Only living people of this court
 *  count (atCourt): one married abroad passes the crown only through a claim (successionClaims). */
export function lineOfSuccession(s: GameState, n: Nation, r: Character, limit = 16): number[] {
  const law = LAWS[LAW_INDEX.succession].options[n.laws.succession ?? 0]?.id;
  const malePref = law !== 'cognatic';
  const kidsOf = (c: Character) => c.children.map((k) => s.chars[k]).filter((x): x is Character => !!x)
    .sort((a, b) => (malePref ? Number(a.female) - Number(b.female) : 0) || a.born - b.born || a.id - b.id);
  const parentOf = (c: Character) => (c.father && s.chars[c.father]) || (c.mother && s.chars[c.mother]) || undefined;
  const out: number[] = []; const inLine = new Set<number>();
  for (const maleOnly of malePref ? [true, false] : [false]) {
    const seen = new Set<number>([r.id]);
    const visit = (c: Character, depth: number) => {
      if (out.length >= limit || depth > 6 || seen.has(c.id) || (maleOnly && c.female)) return;
      seen.add(c.id);
      if (c.alive && atCourt(n, r, c) && !inLine.has(c.id)) { inLine.add(c.id); out.push(c.id); }
      for (const k of kidsOf(c)) visit(k, depth + 1);
    };
    for (const k of kidsOf(r)) visit(k, 1);
    let prev: Character = r, anc = parentOf(r);
    for (let up = 0; up < 2 && anc && out.length < limit; up++) {
      seen.add(anc.id);
      for (const k of kidsOf(anc)) if (k.id !== prev.id) visit(k, 1);
      prev = anc; anc = parentOf(anc);
    }
  }
  return out;
}
function findHeir(s: GameState, n: Nation, dead: Character): number {
  const law = LAWS[LAW_INDEX.succession].options[n.laws.succession ?? 0].id;
  if (law === 'seniority') {
    // eldest living dynast: brothers first
    const sib = Object.values(s.chars).filter((c) => c.alive && atCourt(n, dead, c) && c.dynasty === dead.dynasty && c.id !== dead.id && !c.female && ageOf(s, c) > 16).sort((a, b) => a.born - b.born);
    if (sib.length) return sib[0].id;
  }
  // by blood: the first in the line of succession, else an heir the realm named who is not of the line (a nephew
  // through a sister, a king of another house chosen by treaty)
  const line = lineOfSuccession(s, n, dead, 1);
  if (line.length) return line[0];
  const h = s.chars[n.heir];
  if (h && h.alive && h.id !== dead.id && atCourt(n, dead, h)) return h.id;
  return 0;
}
/** Who would take n's crown if the ruler died today: under a crown by blood the person findHeir names (the heir, or
 *  the eldest daughter when male primogeniture finds no son), under an elected crown the heir presumptive; 0 when the
 *  house would die out. Never married away (systems/dynasty.ts houseMember). */
export function nextInLine(s: GameState, n: Nation): number {
  const r = s.chars[n.ruler]; if (!r || !r.alive) return 0;
  const law = LAWS[LAW_INDEX.succession].options[n.laws.succession ?? 0].id;
  return law === 'elective' || law === 'office' ? n.heir : findHeir(s, n, r);
}

export function succession(s: GameState, w: World, n: Nation) {
  const dead = s.chars[n.ruler];
  n.flags.ruler_changed = s.day;
  const law = LAWS[LAW_INDEX.succession].options[n.laws.succession ?? 0].id;
  let next = 0;
  let contested = false;
  // every form but the hereditary monarchy lets the Powers choose (systems/government.ts)
  const chosen = govSuccessor(s, w, n);
  const elected = chosen || law !== 'office' ? null : ablestOfficial(s, n);
  if (chosen) { next = chosen; contested = !!n.flags.elect_contested && n.flags.elect_contested === s.day; } else if (elected) {
    // election to office: the council and court choose the ablest of their own; no regency, no claim of blood
    next = elected.id;
    for (const off in n.council) if (n.council[off] === next) delete n.council[off];
    n.candidates = (n.candidates ?? []).filter((id) => id !== next);
  } else if (law === 'elective' || law === 'office') {
    // electors (Magnates or Burghers) choose: heir if any and capable, else a new noble
    const cand = n.heir && s.chars[n.heir]?.alive && (!dead || atCourt(n, dead, s.chars[n.heir])) ? s.chars[n.heir] : null;
    const strength = cand ? cand.skills[0] + cand.skills[1] + cand.skills[2] : 0;
    if (cand && strength >= 6 && chance(s.rng, 0.6)) next = cand.id;
    else {
      // (an elective crown may pass to a lord of another native house)
      const c = newChar(s, n, { born: s.day - Math.floor((35 + rand(s.rng) * 20) * 365), role: 'ruler', female: false, dynasty: law === 'office' ? '' : chance(s.rng, 0.5) ? n.dynasty : houseName(s.rng, n.culture) || n.dynasty });
      next = c.id; if (c.dynasty) n.dynasty = c.dynasty;
    }
  } else {
    next = findHeir(s, n, dead);
    if (!next) {
      // extinction: the foreign house with the closest claim by blood (a daughter or son of this house married
      // abroad, or their children; else a realm bound by a marriage treaty) may inherit; otherwise a magnate takes the
      // crown (crowns pass through marriage between Christian realms; a sultanate or khanate whose house dies out
      // raises a new house of its own, so no beylik inherits the Ottoman throne through a bride; systems/dynasty.ts)
      // A marriage treaty without a wedding carries no blood: the partner may press a claim on the throne by war (a
      // cause for war for 25 years), but only a claim by blood passes the crown.
      const all = christianClaimants(s, n);
      for (const c of all) if (c.how === 'marriage') pressLater(s, c.nation, n);
      const claimants = all.filter((c) => c.how !== 'marriage').map((c) => c.nation);
      if (claimants.length) {
        const k = claimants[0];
        const other = s.nations[k];
        // personal union: the claimant's ruler inherits; nation becomes junior partner
        const ownJuniors = s.nations.some((x) => x.alive && x.overlord === n.id && x.subjectType === 'personal_union');
        if (other.overlord < 0 && n.overlord < 0 && !s.wars.some((wr) => wr.att.includes(k) && wr.def.includes(n.id))) {
          // the greater crown is the seat of the union: a small claimant's realm joins it as the junior partner
          // (a claimant that already shares its ruler with juniors of its own stays the seat; its vassals and tributaries
          // follow it into the greater crown's union, so a county never holds a kingdom as its junior partner)
          const flip = !s.playerNations.includes(k) && !s.nations.some((x) => x.alive && x.overlord === k && x.subjectType === 'personal_union') && (s.playerNations.includes(n.id) || ownJuniors || nationDevOf(s, n.id) > nationDevOf(s, k) * 1.5);
          if (flip) {
            for (const x of s.nations) if (x.alive && x.overlord === k && x.id !== n.id) x.overlord = n.id;
            other.overlord = n.id; other.subjectType = 'personal_union'; other.subjectSince = s.day;
            n.ruler = other.ruler; n.heir = other.heir; n.consort = other.consort; n.regent = other.regent || 0; n.dynasty = other.dynasty;
            // the court moves to the seat of the union: ruler, consort, heir and the ruler's children
            const r0 = s.chars[other.ruler];
            for (const id of [other.ruler, other.consort, other.heir, ...(r0?.children ?? [])]) { const c = s.chars[id]; if (c && c.alive && c.nation === other.id) c.nation = n.id; }
            // juniors still share the dead ruler: the caller gives each its chance to leave, else they follow the new ruler
            chronicle(s, n.id, 'union', { en: `The crown of ${n.short.en} passed to ${s.chars[other.ruler]?.name} of ${other.short.en}, who now rules both: ${other.short.en} is the junior partner.`, de: `Die Krone von ${n.short.de} ging an ${deR(s.chars[other.ruler])} von ${other.short.de}, der nun beide regiert: ${other.short.de} ist der Juniorpartner.` }, undefined, [other.id]);
            notice(s, other.id, 'union', { en: 'Personal union formed', de: 'Personalunion entstanden' });
            notice(s, n.id, 'union', { en: `${dead?.name ?? '?'} died without heirs: ${s.chars[other.ruler]?.name} of ${other.short.en} inherits our crown and rules both realms.`, de: `${deR(dead)} starb ohne Erben: ${deR(s.chars[other.ruler])} von ${other.short.de} erbt unsere Krone und regiert beide Reiche.` }, { loc: n.capital });
            return;
          }
          n.overlord = k; n.subjectType = 'personal_union'; n.subjectSince = s.day; n.dynasty = other.dynasty;
          n.ruler = other.ruler; n.heir = other.heir; n.consort = other.consort;
          chronicle(s, n.id, 'union', { en: `${n.short.en} passed by inheritance to ${other.short.en}: a personal union under ${s.chars[other.ruler]?.name}.`, de: `${n.short.de} fiel durch Erbschaft an ${other.short.de}: Personalunion unter ${deR(s.chars[other.ruler])}.` }, undefined, [other.id]);
          notice(s, n.id, 'union', { en: 'Personal union formed', de: 'Personalunion entstanden' });
          return;
        }
        // the claimant cannot take the crown now (at war with us, or itself a subject): it keeps a claim to press
        pressLater(s, k, n);
      }
      // a lord of a native house takes the crown
      const oldHouse = n.dynasty;
      const c = newChar(s, n, { born: s.day - Math.floor((30 + rand(s.rng) * 20) * 365), role: 'ruler', female: false, dynasty: houseName(s.rng, n.culture) || `${w.names[n.capital] ?? 'House'}` });
      next = c.id; n.dynasty = c.dynasty; contested = true;
      notice(s, n.id, 'house_extinct', { en: `The house of ${oldHouse || n.short.en} has died out. The magnates raised ${c.name} of the house of ${c.dynasty} to the throne; the succession is disputed.`, de: `Das Haus ${localHouse(oldHouse, 'de') || n.short.de} ist erloschen. Die Magnaten haben ${deR(c)} aus dem Haus ${localHouse(c.dynasty, 'de')} auf den Thron gehoben; die Nachfolge ist umstritten.` }, { loc: n.capital });
    }
  }
  const heir = s.chars[next];
  if (!heir) return;
  const oldName = dead?.name ?? '?';
  n.ruler = next; heir.role = 'ruler';
  if (n.heir === next) n.heir = 0;
  n.consort = consortOf(s, n, heir);
  const age = ageOf(s, heir);
  // Mandate of a new ruler
  const strife = lawEffect(n, 'succession_strife') + (n.gov === 'nomadic_horde' ? 0.3 : 0);
  n.mandate = clamp(n.mandate * 0.5 + 30 + heir.skills[1] * 4 - (contested ? 20 : 0), 0, 100);
  // regency
  if (age < 16) {
    n.regent = newChar(s, n, { born: s.day - 40 * 365, role: 'courtier', female: chance(s.rng, 0.4) }).id;
    n.mandate = clamp(n.mandate - 10 - lawEffect(n, 'regency_strife') * 20, 0, 100);
    notice(s, n.id, 'regency', { en: `A regency council rules for the child ${heir.name}.`, de: `Ein Regentschaftsrat regiert für das Kind ${deR(heir)}.` });
  } else n.regent = 0;
  chronicle(s, n.id, 'succession', { en: `${oldName} of ${n.short.en} died; ${heir.name} ${heir.dynasty ? '(' + heir.dynasty + ') ' : ''}succeeded at age ${Math.floor(age)}.`, de: `${deR(dead)} von ${n.short.de} starb; ${deR(heir)} ${heir.dynasty ? '(' + heir.dynasty + ') ' : ''}folgte im Alter von ${Math.floor(age)} Jahren.` });
  notice(s, n.id, 'ruler_death', { en: `${oldName} has died. Long live ${heir.name}!`, de: `${deR(dead)} ist gestorben. Es lebe ${deR(heir)}!` }, { loc: n.capital });
  s.flags[`ruler_death_${n.id}`] = s.day;
  // disputed succession → civil war
  const strifeChance = clamp(0.04 + strife * 0.3 + (contested ? 0.25 : 0) + (n.mandate < 25 ? 0.15 : 0) + (estate(n, 'magnates').influence > 65 ? 0.1 : 0) + (age < 16 ? 0.08 : 0), 0, 0.8);
  if (chance(s.rng, strifeChance) && n.capital >= 0) {
    s.flags[`civil_war_pending_${n.id}`] = s.day + 30;
    notice(s, n.id, 'succession_crisis', { en: `The succession of ${heir.name} is disputed! A pretender is gathering the discontented lords.`, de: `Die Nachfolge von ${deR(heir)} ist umstritten! Ein Thronprätendent sammelt die unzufriedenen Herren.` }, { loc: n.capital });
  }
  // new heir: eldest child
  pickNewHeir(s, n);
}

function c0name(s: GameState, cid: number) { return s.chars[cid]?.name ?? '?'; }
/** Chance that a junior crown leaves a personal union at the shared ruler's death: unions of equals are fragile,
 *  old unions that have grown together hold. */
export function unionBreakChance(s: GameState, junior: Nation, senior: Nation): number {
  const years = (s.day - (junior.subjectSince || 0)) / 365;
  const size = nationDevOf(s, junior.id) / Math.max(1, nationDevOf(s, senior.id));
  return clamp(0.25 + Math.min(0.3, size * 0.4) + junior.libertyDesire / 250 - Math.max(0, years - 40) * 0.01, 0.05, 0.75);
}
function nationDevOf(s: GameState, id: number) { let d = 0; const o = s.loc.owner; for (let i = 0; i < o.length; i++) if (o[i] === id) d += s.loc.dev[i]; return d; }

/** Election to office: the ablest grown official or candidate at court (skills, then loyalty; never kin by right).
 *  A theocracy, a military order or a republic chooses among its men only (the custom of the age; the AI keeps to it
 *  in its appointments too, ai_statecraft.ts offices). */
export function ablestOfficial(s: GameState, n: Nation): Character | null {
  let best: Character | null = null, bv = -1;
  const menOnly = n.gov === 'theocracy' || n.gov === 'military_order' || n.gov.includes('republic');
  const ids = [...Object.values(n.council), ...(n.candidates ?? [])];
  for (const id of ids) {
    const c = s.chars[id];
    if (!c || !c.alive || c.nation !== n.id || c.id === n.ruler || (menOnly && c.female)) continue;
    const age = ageOf(s, c); if (age < 25 || age > 72) continue;
    const v = c.skills[0] + c.skills[1] + c.skills[2] + (c.loyalty ?? 50) / 100;
    if (v > bv || (v === bv && best && c.id < best.id)) { bv = v; best = c; }
  }
  return best;
}
/** The consort of a new ruler: the living spouse at this court (never a person who rules or lives at another court); 0 if none. */
export function consortOf(s: GameState, n: Nation, ruler: Character): number {
  const sp = ruler.spouse ? s.chars[ruler.spouse] : undefined;
  return sp && sp.alive && (sp.nation === n.id || sp.nation === ruler.nation) && !s.nations.some((x) => x.alive && x.id !== n.id && x.ruler === sp.id) ? sp.id : 0;
}
export function pickNewHeir(s: GameState, n: Nation) {
  const r = s.chars[n.ruler]; if (!r) return;
  const law = LAWS[LAW_INDEX.succession].options[n.laws.succession ?? 0].id;
  // elected to office: the presumptive successor is whoever the council would choose today
  if (law === 'office') { const b = ablestOfficial(s, n); n.heir = b ? b.id : 0; return; }
  // the first in the line of succession; failing the line, an heir named before who still lives at court
  const old = s.chars[n.heir];
  const line = lineOfSuccession(s, n, r, 1);
  const keep = old && old.alive && old.id !== r.id && atCourt(n, r, old) ? old.id : 0;
  n.heir = line[0] ?? keep;
  if (old && old.id !== n.heir && old.role === 'heir') old.role = 'courtier';
  const h = s.chars[n.heir];
  if (h) h.role = 'heir';
}

/** True when realm x is bound to `top` in personal union (directly or through another junior crown). */
function inUnionUnder(s: GameState, x: Nation, top: Nation): boolean {
  let y = x;
  for (let k = 0; k < 8 && y.overlord >= 0 && y.subjectType === 'personal_union'; k++) { y = s.nations[y.overlord]; if (!y) return false; if (y.id === top.id) return true; }
  return false;
}
/** The crown of n passes on at the death of its ruler cid, and with it every crown held in personal union under n
 *  (a junior crown may choose its own ruler instead). */
/** The ruler's traits act on the realm as one modifier, which every breakdown names as its source (content/traits.ts).
 *  A child under a regent does not yet govern: the traits wait for the majority. Synced monthly and on succession. */
export function syncRulerTraits(s: GameState, n: Nation) {
  const r = s.chars[n.ruler];
  const fx = r?.alive && !n.regent ? rulerTraitEffects(r.traits) : {};
  const i = n.modifiers.findIndex((m) => m.id === 'ruler_traits');
  if (!Object.keys(fx).length) { if (i >= 0) n.modifiers.splice(i, 1); return; }
  const md = { id: 'ruler_traits', until: 1e9, label: { en: "The ruler's traits", de: 'Eigenschaften des Herrschers' }, effects: fx };
  if (i >= 0) n.modifiers[i] = md; else n.modifiers.push(md);
}
function crownPasses(s: GameState, w: World, n: Nation, cid: number) {
  succession(s, w, n);
  syncRulerTraits(s, n);
  for (const other of s.nations) if (other.alive && other.id !== n.id && other.ruler === cid && inUnionUnder(s, other, n)) {
    // a junior crown in personal union may choose its own ruler when the shared one dies
    if (other.overlord === n.id && other.subjectType === 'personal_union' && chance(s.rng, unionBreakChance(s, other, n))) {
      other.overlord = -1; other.subjectType = null; other.libertyDesire = 0;
      const c = newChar(s, other, { born: s.day - Math.floor((25 + rand(s.rng) * 25) * 365), role: 'ruler', female: false, dynasty: other.dynasty });
      other.ruler = c.id; other.heir = 0; other.consort = 0; other.regent = 0; pickNewHeir(s, other);
      chronicle(s, other.id, 'union', { en: `On the death of ${c0name(s, cid)} the estates of ${other.short.en} chose their own ruler: the union with ${n.short.en} is over.`, de: `Nach dem Tod von ${deR(s.chars[cid])} wählten die Stände von ${other.short.de} einen eigenen Herrscher: die Union mit ${n.short.de} ist beendet.` }, undefined, [n.id]);
      notice(s, n.id, 'union_ended', { en: `${other.short.en} has chosen its own ruler and left our union.`, de: `${other.short.de} hat einen eigenen Herrscher gewählt und unsere Union verlassen.` }, { loc: other.capital });
      continue;
    }
    // the union holds: the junior crown shares the new ruler, heir, consort and regency
    other.ruler = n.ruler; other.heir = n.heir; other.consort = n.consort; other.regent = n.regent;
  }
}

/** A character of nation n dies (of age, in battle, ...): a ruler's crown passes by succession (and with it any
 *  crown held in personal union), an heir is replaced, consort, regent and council seats fall vacant. The person's
 *  places at every other court are cleared too (a son or daughter married abroad, a crown shared in a union), so that
 *  no realm keeps a dead ruler, heir or consort. */
export function characterDies(s: GameState, w: World, n: Nation, cid: number) {
  const c = s.chars[cid]; if (!c || !c.alive) return;
  c.alive = false; c.died = s.day;
  for (const X of [n, ...s.nations]) {
    if (X !== n && (X.id === n.id || !X.alive)) continue;
    if (X.ruler === cid) {
      // the senior crown of a union passes the crown on; its junior crowns follow it or choose their own ruler
      let top = X;
      for (let k = 0; k < 8 && top.overlord >= 0 && top.subjectType === 'personal_union' && s.nations[top.overlord]?.ruler === cid; k++) top = s.nations[top.overlord];
      crownPasses(s, w, top, cid);
    }
    if (X.heir === cid) { X.heir = 0; pickNewHeir(s, X); notice(s, X.id, 'heir_death', { en: `The heir ${c.name} has died.`, de: `${c.female ? 'Die Thronfolgerin' : 'Der Thronfolger'} ${deR(c)} ist gestorben.` }); }
    if (X.consort === cid) X.consort = 0;
    if (X.regent === cid) X.regent = 0;
    let wasOfficial = false;
    for (const off in X.council) if (X.council[off] === cid) { delete X.council[off]; wasOfficial = true; }
    if (wasOfficial && X.alive) fillCouncil(s, X, c);
  }
}

/** The senior crown at the head of the personal unions x belongs to (x itself when it is in none). */
function unionTop(s: GameState, x: Nation): Nation {
  let y = x;
  for (let k = 0; k < 8 && y.overlord >= 0 && y.subjectType === 'personal_union' && s.nations[y.overlord]; k++) y = s.nations[y.overlord];
  return y;
}
/** Every court keeps its own people. A crown that shares its ruler with a realm it is no longer bound to by personal
 *  union (it won its independence in a war, became another's vassal, or its overlord was annexed) has its estates
 *  choose a ruler of their own; a ruler whose own realm is gone (a pretender who won the crown) brings that court
 *  along; an heir or consort who lives at another court is replaced. Runs daily, before the other systems. */
export function settleCourts(s: GameState, w: World) {
  for (const n of s.nations) {
    if (!n.alive) continue;
    let r = s.chars[n.ruler];
    if (r && r.alive && r.nation !== n.id) {
      const R = s.nations[r.nation];
      if (!R || !R.alive) {
        // the ruler's realm is gone: its court joins this one
        for (const k in s.chars) { const c = s.chars[k]; if (c.alive && c.nation === r.nation) c.nation = n.id; }
      } else if (unionTop(s, n).id !== unionTop(s, R).id) {
        if (R.ruler === r.id) {
          // the union is over, but the crown still sat on the other ruler's head: the estates choose their own ruler
          const c = newChar(s, n, { ...courtPerson(s, n, false), born: s.day - Math.floor((25 + rand(s.rng) * 25) * 365), role: 'ruler', female: false });
          if (c.dynasty) n.dynasty = c.dynasty;
          n.ruler = c.id; n.heir = 0; n.consort = 0; n.regent = 0; pickNewHeir(s, n);
          chronicle(s, n.id, 'union', { en: `The crowns of ${n.short.en} and ${R.short.en} parted: the estates of ${n.short.en} chose ${c.name} as their own ruler.`, de: `Die Kronen von ${n.short.de} und ${R.short.de} trennten sich: die Stände von ${n.short.de} wählten ${deR(c)} zum eigenen Herrscher.` }, undefined, [R.id]);
          notice(s, n.id, 'union', { en: `Our estates have chosen ${c.name} to rule us.`, de: `Unsere Stände haben ${deR(c)} zum Herrscher gewählt.` }, { loc: n.capital });
        } else r.nation = n.id; // a member of another house who wears this crown lives here
      }
    }
    r = s.chars[n.ruler];
    if (!r) continue;
    const here = (id: number) => { const c = s.chars[id]; return !!c && c.alive && (c.nation === n.id || c.nation === r!.nation || (!!s.nations[c.nation]?.alive && unionTop(s, s.nations[c.nation]).id === unionTop(s, n).id)); };
    if (n.consort && !here(n.consort)) n.consort = 0;
    if (n.heir && s.chars[n.heir]?.alive && !here(n.heir)) { n.heir = 0; pickNewHeir(s, n); }
  }
}

/** Everyone the other draws leave out ages and may die as well: the rest of a ruling house wherever they live
 *  (children, brothers and sisters, nephews, a queen mother, a widowed queen, the wives and husbands of princes), the
 *  candidates at court, a dismissed official, a retired commander, the court of a realm that is gone. Rulers, heirs,
 *  consorts, regents and officials draw in characterMonth, commanders in commanders.ts (generalsMonth), so nobody
 *  draws twice. The draw is a side stream of the game's seed (rng.ts hash01): the number of people alive does not
 *  shift the main stream. (Before, only the ruler's descendants and the father's line drew, so a mother, a dowager or
 *  the spouse of a prince lived for ever.) */
function othersMonth(s: GameState, w: World) {
  const own = new Set<number>();
  for (const n of s.nations) {
    if (!n.alive) continue;
    for (const id of [n.ruler, n.heir, n.consort, n.regent, ...Object.values(n.council)]) if (id) own.add(id);
    for (const id of n.generals ?? []) if (s.chars[id]?.nation === n.id) own.add(id);
  }
  for (const k in s.chars) {
    const c = s.chars[k];
    if (!c.alive || own.has(c.id) || c.born > s.day) continue;
    if (hash01(s.seed, c.id, s.day) >= monthlyDeathChance(ageOf(s, c), c)) continue;
    const home = s.nations[c.nation];
    if (home?.alive) characterDies(s, w, home, c.id);
    else { c.alive = false; c.died = s.day; } // of a realm that is gone: no crown or office of a living realm passes with them
  }
}
/** A bride or groom for p (a ruler or an heir): a member of a house bound to ours by a marriage treaty, else the
 *  daughter or son of a noble family of our own people (systems/dynasty.ts houseMember). */
function spouseFor(s: GameState, n: Nation, p: Character, role: 'consort' | 'courtier'): Character {
  const born = p.born + Math.floor((rand(s.rng) * 12 - 4) * 365);
  let sp: Character | null = null;
  for (const t of s.treaties) {
    if (t.type !== 'marriage' || (t.a !== n.id && t.b !== n.id) || t.until <= s.day) continue;
    const B = s.nations[t.a === n.id ? t.b : t.a]; if (!B?.alive) continue;
    sp = houseMember(s, B, !p.female, p.born);
    if (sp) { sp.nation = n.id; sp.claims = [...new Set([...(sp.claims ?? []), B.id])]; break; }
  }
  if (!sp) { const g = nameFor(s, n, !p.female), h = houseName(s.rng, n.culture); sp = newChar(s, n, { name: g, female: !p.female, born, role, dynasty: h ? familyForm(h, n.culture, !p.female) : n.dynasty }); }
  sp.role = role;
  return sp;
}
/** A child to the couple a and b, now and then: a given name none of its living brothers and sisters bears, the
 *  father's house, and the claims a foreign-born parent carries. */
function bear(s: GameState, n: Nation, a: Character, b: Character): Character | null {
  const mother = a.female ? a : b, father = a.female ? b : a;
  const ma = ageOf(s, mother);
  if (!(ma > 16 && ma < 42 && a.children.length < 9 && chance(s.rng, 0.022))) return null;
  const female = chance(s.rng, 0.5);
  const child = newChar(s, n, { born: s.day, female, name: freshGivenName(s, n.culture, female, father, mother), role: 'courtier', dynasty: father.dynasty, father: father.id, mother: mother.id, skills: [Math.floor(rand(s.rng) * 6), Math.floor(rand(s.rng) * 6), Math.floor(rand(s.rng) * 6)] });
  a.children.push(child.id); b.children.push(child.id);
  inheritClaims(child, a, b); // a foreign-born parent's claim on the throne of their house
  return child;
}
function characterMonth(s: GameState, w: World, n: Nation) {
  syncRulerTraits(s, n);
  // a crown shared in personal union: the senior crown's court lives, weds and bears children, and this one follows it
  const O = n.overlord >= 0 && n.subjectType === 'personal_union' && s.nations[n.overlord]?.ruler === n.ruler ? s.nations[n.overlord] : null;
  // ruler, heir, consort, officials age and may die; births to the ruling couple
  // (each person once: a consort or heir who holds an office draws one death and ages one month, not two)
  for (const cid of new Set([n.ruler, n.heir, n.consort, n.regent, ...Object.values(n.council)])) {
    const c = s.chars[cid]; if (!c || !c.alive) continue;
    // the shared ruler, heir, consort and regent live and die with the senior crown's turn
    if (O && (cid === O.ruler || cid === O.heir || cid === O.consort || cid === O.regent)) continue;
    const age = ageOf(s, c);
    if (age > 50) c.health = Math.max(0.2, c.health - 0.002);
    if (chance(s.rng, monthlyDeathChance(age, c))) characterDies(s, w, n, cid);
  }
  if (O && O.ruler === n.ruler) { n.heir = O.heir; n.consort = O.consort; n.regent = O.regent; return; }
  const r = s.chars[n.ruler];
  // (the rest of the house ages and may die in othersMonth, once a month for every court)
  if (n.regent && r && ageOf(s, r) >= 16) { n.regent = 0; notice(s, n.id, 'majority', { en: `${r.name} has come of age and rules in person.`, de: `${deR(r)} ist volljährig und regiert selbst.` }); n.mandate = clamp(n.mandate + 10, 0, 100); }
  // marriage of an unmarried adult ruler: a member of a house bound to ours by a marriage treaty, else the daughter
  // or son of a noble family of our own people (systems/dynasty.ts)
  if (r && r.alive && !n.consort && unwed(s, r) && ageOf(s, r) > 16 && ageOf(s, r) < 55 && chance(s.rng, 0.04)) {
    const sp = spouseFor(s, n, r, 'consort');
    sp.spouse = r.id; r.spouse = sp.id; n.consort = sp.id;
  }
  // an unwed heir of age marries as well, the same way, and the heir's children are born into the line (before, only
  // the ruling couple married and had children, so a young king's brothers and nephews were all the line he had)
  const h = s.chars[n.heir];
  if (h && h.alive && h.nation === n.id && h.id !== n.ruler && unwed(s, h) && ageOf(s, h) > 16 && ageOf(s, h) < 45 && chance(s.rng, 0.03)) {
    const sp = spouseFor(s, n, h, 'courtier');
    sp.spouse = h.id; h.spouse = sp.id;
    if (s.playerNations.includes(n.id)) {
      // fix-people: the bride or groom is named with the family, as the given name alone says nothing: a member of a
      // ruling house by the house ("Anna aus dem Haus Luxemburg"), a daughter of the nobility by her family name
      // ("Matilda Percy", "Anna von Stolberg"); a name that already carries a house or a style stays as it is
      const fam = sp.dynasty && sp.dynasty !== h.dynasty && sp.dynasty !== n.dynasty && !/,| of | von | de | d'|\(/.test(sp.name) && !sp.name.includes(sp.dynasty.slice(0, 5)) ? sp.dynasty : '';
      const royal = !!fam && s.nations.some((x) => x.dynasty === fam);
      const en = !fam ? sp.name : royal ? `${sp.name} of the house of ${fam}` : `${sp.name} ${fam}`;
      const deSp = !fam ? deR(sp) : royal ? `${deR(sp)} aus dem Haus ${localHouse(fam, 'de')}` : localName(`${sp.name} ${fam}`, 'de', !!sp.female, true);
      notice(s, n.id, 'marriage', { en: `The heir ${h.name} has married ${en}.`, de: `${h.female ? 'Die Thronfolgerin' : 'Der Thronfolger'} ${deR(h)} hat ${deSp} geheiratet.` });
    }
  }
  const hs = h && h.alive && h.nation === n.id && h.id !== n.ruler ? s.chars[h.spouse ?? 0] : undefined;
  if (h && hs?.alive && hs.spouse === h.id) bear(s, n, h, hs);
  // births
  const cons = s.chars[n.consort];
  if (r && cons && r.alive && cons.alive) {
    const child = bear(s, n, r, cons);
    if (child) {
      pickNewHeir(s, n); // a newborn son may come before a daughter, a brother or a nephew
      if (n.heir === child.id) notice(s, n.id, 'heir_born', { en: `An heir is born: ${child.name}!`, de: `${child.female ? 'Eine Thronfolgerin' : 'Ein Thronfolger'} ist geboren: ${deR(child)}!` }, { loc: n.capital });
    }
  }
  // children grow up: if no heir, check
  if (!n.heir || !s.chars[n.heir]?.alive) pickNewHeir(s, n);
  houseWarning(s, n);
}

// ---------------- council ----------------
export const OFFICES = [
  { id: 'chancellor', name: { en: 'Chancellor', de: 'Kanzler' }, skill: 1, effect: 'diplomacy' },
  { id: 'treasurer', name: { en: 'Treasurer', de: 'Schatzmeister' }, skill: 0, effect: 'tax' },
  { id: 'marshal', name: { en: 'Marshal', de: 'Marschall' }, skill: 2, effect: 'discipline' },
  { id: 'chaplain', name: { en: 'Chaplain', de: 'Hofkaplan' }, skill: 1, effect: 'conversion' },
  { id: 'spymaster', name: { en: 'Spymaster', de: 'Meister der Geheimnisse' }, skill: 1, effect: 'spy' },
];
export function councilBonus(s: GameState, n: Nation, office: string): number {
  const c = s.chars[n.council[office]]; if (!c || !c.alive) return 0;
  return officeBonusOf(c, office);
}
/** The bonus a person would give in an office (skill for the office, reduced by corruption). */
export function officeBonusOf(c: Character, office: string): number {
  const off = OFFICES.find((o) => o.id === office); if (!off) return 0;
  return (c.skills[off.skill] / 6) * 0.1 * (1 - (c.corruption ?? 0));
}
/** A person of the realm's own people and nobility, named as that people names them (content/names.ts). */
export function courtPerson(s: GameState, n: Nation, female: boolean, rng: number[] = s.rng): { name: string; dynasty: string } {
  const p = personName(rng, n.culture, female);
  return { name: p.name, dynasty: p.dynasty };
}
/** The office in the German genitive ("das Amt des Kanzlers"). */
const OFFICE_GEN_DE: Record<string, string> = { chancellor: 'des Kanzlers', treasurer: 'des Schatzmeisters', marshal: 'des Marschalls', chaplain: 'des Hofkaplans', spymaster: 'des Meisters der Geheimnisse' };
/** Fill the vacant seats of the council. A seat goes to the ablest candidate at court for that office (officeBonusOf),
 *  else to a new man of the realm's nobility; the player is told who died and who holds the office now. */
function fillCouncil(s: GameState, n: Nation, dead?: Character) {
  for (const off of OFFICES) {
    const c = s.chars[n.council[off.id]];
    if (c && c.alive) continue;
    const best = n.ruler && s.day > 0 ? ablestFor(s, n, off.id) : null; // (the council of the start is drawn as before)
    let nc: Character;
    if (best) { nc = best; nc.role = 'official'; nc.loyalty ??= 60; nc.corruption ??= 0; nc.ambition ??= 0.3; n.candidates = (n.candidates ?? []).filter((id) => id !== nc.id); }
    else {
      nc = newChar(s, n, { ...courtPerson(s, n, false), born: s.day - Math.floor((30 + rand(s.rng) * 25) * 365), role: 'official', female: false });
      nc.loyalty = 40 + rand(s.rng) * 50; nc.corruption = rand(s.rng) * 0.3; nc.ambition = rand(s.rng);
    }
    n.council[off.id] = nc.id;
    if (s.playerNations.includes(n.id) && s.day > 0) {
      const was = dead ? { en: `${dead.name} has died. `, de: `${de(dead)} ist gestorben. ` } : { en: '', de: '' };
      notice(s, n.id, 'council', { en: `${was.en}${nc.name} holds the office of ${off.name.en.toLowerCase()} now${best ? ', the ablest at court' : ''}.`, de: `${was.de}${de(nc)} übernimmt das Amt ${OFFICE_GEN_DE[off.id]}${best ? (nc.female ? ' als Fähigste am Hof' : ' als Fähigster am Hof') : ''}.` });
    }
  }
}
/** The candidate at court who would serve best in an office (officeCandidates, officeBonusOf), or null. The heir is
 *  left out: the heir is named by hand or not at all. */
export function ablestFor(s: GameState, n: Nation, office: string): Character | null {
  let best: Character | null = null, bb = -1;
  for (const c of officeCandidates(s, n)) {
    if (c.id === n.heir) continue;
    const b = officeBonusOf(c, office);
    if (b > bb + 1e-9 || (Math.abs(b - bb) <= 1e-9 && best && c.id < best.id)) { best = c; bb = b; }
  }
  return best;
}
/** The ablest candidate for one office when that person would serve it better than its holder (any candidate for a
 *  vacant seat), else null: the single-office "appoint the ablest" and the row the council panel shows. */
export function ablestGain(s: GameState, n: Nation, office: string): Character | null {
  const c = ablestFor(s, n, office); const cur = s.chars[n.council[office]];
  return c && (!cur?.alive || officeBonusOf(c, office) > officeBonusOf(cur, office) + 1e-9) ? c : null;
}
/** fix-people: the appointments "fill the council with the ablest" makes, in the order it makes them. Each step gives
 *  the office whose holder an abler candidate beats by the most to that candidate; nobody is picked twice, sitting
 *  officials are not moved (they are not candidates, officeCandidates) and the heir is left out. Each entry is an
 *  appointment at OFFICE_COST Authority; gain is how much the office's bonus rises. The council panel shows exactly
 *  this plan and appointAblest('*') carries it out (before, the panel ranked each office on its own and could name one
 *  person for four offices, while the command appointed office by office and re-seated officials it had just dismissed). */
export function ablestPlan(s: GameState, n: Nation): { office: string; char: number; gain: number }[] {
  const pool = officeCandidates(s, n).filter((c) => c.id !== n.heir);
  const left = OFFICES.map((o) => o.id);
  const plan: { office: string; char: number; gain: number }[] = [];
  for (;;) {
    let best: { office: string; char: number; gain: number } | null = null;
    for (const o of left) {
      const cur = s.chars[n.council[o]]; const base = cur?.alive ? officeBonusOf(cur, o) : 0;
      for (const c of pool) {
        const g = officeBonusOf(c, o) - base;
        if (cur?.alive ? g <= 1e-9 : g < -1e-9) continue;
        // the largest gain; on a tie the office named first, then the lower id
        if (!best || g > best.gain + 1e-9 || (Math.abs(g - best.gain) <= 1e-9 && (left.indexOf(o) < left.indexOf(best.office) || (o === best.office && c.id < best.char)))) best = { office: o, char: c.id, gain: g };
      }
    }
    if (!best) break;
    plan.push(best);
    left.splice(left.indexOf(best.office), 1);
    pool.splice(pool.findIndex((c) => c.id === best!.char), 1);
  }
  return plan;
}
/** Appoint the ablest candidate to an office (ablestGain), or ('*') carry out ablestPlan as far as the Authority goes,
 *  each appointment at the usual cost (the 'office' command with char -1). */
export function appointAblest(s: GameState, n: Nation, office: string): string | null {
  if (office === '*') {
    const plan = ablestPlan(s, n);
    if (!plan.length) return 'no abler candidate at court';
    let done = 0;
    for (const p of plan) {
      if (n.authority < OFFICE_COST) break;
      const e = appointOfficial(s, n, p.office, p.char); if (e) return done ? null : e;
      done++;
    }
    return done ? null : 'not enough Authority';
  }
  if (!OFFICES.some((x) => x.id === office)) return 'unknown office';
  const c = ablestGain(s, n, office);
  return c ? appointOfficial(s, n, office, c.id) : 'no abler candidate at court';
}
// ---------------- candidates for office ----------------
export const OFFICE_COST = 10; // Authority per appointment
const CANDIDATES = 3;
const holdsOffice = (n: Nation, id: number) => { for (const o of OFFICES) if (n.council[o.id] === id) return o.id; return null; };
/** True while the person leads one of the realm's armies or fleets. */
const commanding = (s: GameState, id: number) => s.armies.some((a) => a.general === id);
/** Who could be appointed: the court's candidates plus adult kin of the ruler (never the ruler or the regent). */
export function officeCandidates(s: GameState, n: Nation): Character[] {
  const out: Character[] = []; const seen = new Set<number>();
  const add = (id: number | undefined) => {
    const c = id ? s.chars[id] : undefined;
    if (!c || seen.has(c.id) || !c.alive || c.nation !== n.id || c.id === n.ruler || c.id === n.regent || ageOf(s, c) < 16 || holdsOffice(n, c.id)) return;
    seen.add(c.id); out.push(c);
  };
  for (const id of n.candidates ?? []) add(id);
  const r = s.chars[n.ruler];
  if (r) { add(n.consort); for (const k of r.children) add(k); }
  return out;
}
/** Keep a few candidates at court. Uses its own random stream so the main sequence of the game is not shifted. */
function refreshCandidates(s: GameState, n: Nation, yearly: boolean) {
  const pool = (n.candidates ?? []).filter((id) => { const c = s.chars[id]; return c && c.alive && c.nation === n.id && ageOf(s, c) < 70 && !holdsOffice(n, id) && !commanding(s, id); });
  // the longest-waiting candidate leaves court (and the game: nobody refers to them any more)
  if (yearly && pool.length >= CANDIDATES) { const gone = pool.shift()!; const c = s.chars[gone]; if (c && c.role === 'courtier' && !c.spouse && !c.children.length) delete s.chars[gone]; }
  if (pool.length >= CANDIDATES) { n.candidates = pool; return; }
  // keyed by the game's seed too, so each new game has its own court (still independent of the main random sequence)
  const rng = seedRng(Math.floor(hash01(n.id, s.day, (0x0ff1ce ^ (s.seed | 0)) | 0) * 4294967296));
  while (pool.length < CANDIDATES) {
    const skills: [number, number, number] = [Math.floor(rand(rng) * 4), Math.floor(rand(rng) * 4), Math.floor(rand(rng) * 4)];
    skills[Math.floor(rand(rng) * 3)] += 1 + Math.floor(rand(rng) * 3); // each candidate is good at one thing
    const female = rand(rng) < 0.15;
    const c = newChar(s, n, {
      ...courtPerson(s, n, female, rng), female, born: s.day - Math.floor((24 + rand(rng) * 30) * 365), skills, role: 'courtier',
      traits: rand(rng) < 0.5 ? [TRAITS_GOOD[Math.floor(rand(rng) * TRAITS_GOOD.length)]] : [],
    });
    c.loyalty = 40 + rand(rng) * 50; c.corruption = rand(rng) * 0.3; c.ambition = rand(rng);
    pool.push(c.id);
  }
  n.candidates = pool;
}
/** Appoint a person to an office. Returns an error text or null. */
export function appointOfficial(s: GameState, n: Nation, office: string, charId: number): string | null {
  const off = OFFICES.find((o) => o.id === office); if (!off) return 'unknown office';
  const c = s.chars[charId]; if (!c || !c.alive || c.nation !== n.id) return 'no such person';
  if (c.id === n.ruler || c.id === n.regent) return 'the ruler cannot hold an office';
  if (ageOf(s, c) < 16) return 'too young for office';
  if (n.council[office] === c.id) return 'already holds this office';
  if (n.authority < OFFICE_COST) return 'not enough Authority';
  n.authority -= OFFICE_COST;
  const other = holdsOffice(n, c.id); if (other) delete n.council[other];
  const prev = s.chars[n.council[office]];
  if (prev && prev.alive && prev.id !== c.id) {
    // the dismissed official is offended and waits at court for another chance
    prev.loyalty = clamp((prev.loyalty ?? 50) - 15, 0, 100); prev.role = 'courtier';
    (n.candidates ??= []).push(prev.id);
  }
  n.council[office] = c.id; c.role = 'official';
  if (c.loyalty === undefined) c.loyalty = 60;
  if (c.corruption === undefined) c.corruption = 0;
  if (c.ambition === undefined) c.ambition = 0.3;
  n.candidates = (n.candidates ?? []).filter((id) => id !== c.id);
  return null;
}

export function officialsMonth(s: GameState, n: Nation) {
  for (const off of OFFICES) {
    const c = s.chars[n.council[off.id]]; if (!c || !c.alive) continue;
    if (c.id === n.ruler) { delete n.council[off.id]; continue; } // an official who inherited the throne leaves the council
    // corruption creeps up; ambitious officials intrigue when loyalty is low
    c.corruption = clamp((c.corruption ?? 0) + (c.ambition ?? 0.5) * 0.002 - (n.laws.administration ? 0.001 : 0), 0, 1);
    c.loyalty = clamp((c.loyalty ?? 50) + (n.mandate - 50) * 0.01 - (c.ambition ?? 0.5) * 0.05, 0, 100);
    if (off.id === 'treasurer') { const graft = treasurerGraft(c, n.income.tax || 0); if (graft > 0) addExpense(n, 'graft', graft); }
    if ((c.loyalty ?? 50) < 15 && chance(s.rng, 0.05)) {
      // fall from grace: dismissed in disgrace; a faction is angered
      delete n.council[off.id];
      estate(n, 'magnates').contentment -= 5; n.concord = clamp(n.concord - 5, -100, 100);
      notice(s, n.id, 'intrigue', { en: `${off.name.en} ${c.name} was caught intriguing and has fallen from grace.`, de: `${off.name.de} ${de(c)} wurde bei Intrigen ertappt und ist in Ungnade gefallen.` });
    }
  }
}

/** What a treasurer skims off the taxes each month: his corruption, less the more able he is at governance. */
export function treasurerGraft(c: Character, tax: number): number { return (c.corruption ?? 0) * tax * 0.04 * (1 - c.skills[0] / 12); }

// ---------------- Authority, Concord, Mandate, estates ----------------
export function authorityGain(s: GameState, n: Nation): number {
  const r = s.chars[n.ruler];
  const sk = r ? r.skills[0] + r.skills[1] * 0.5 : 2;
  return (1 + sk * 0.4 + n.mandate / 50) * (1 + lawEffect(n, 'authority_gain')) + lawEffect(n, 'authority');
}

/** What Concord drifts toward, by cause: the contentment of the Powers of the Realm, war exhaustion, laws and
 *  values, excommunication and each modifier with a Concord effect (faith mechanics, pilgrimages, situations...). */
export function concordParts(s: GameState, n: Nation): [string | I18n, number][] {
  let content = 0, infl = 0;
  for (const e of n.estates) { content += e.contentment * e.influence; infl += e.influence; }
  const avgContent = infl > 0 ? content / infl : 50;
  const out: [string | I18n, number][] = [['powers_content', (avgContent - 50) * 1.2 * (1 + lawEffect(n, 'estate_power'))], ['war_exhaustion', -n.warExhaustion * 0.3],
    ['laws_values', lawEffect(n, 'concord_gain') * 50 + lawEffect(n, 'concord')]];
  if (n.excommunicated) out.push(['excommunicated', -20]);
  return out;
}
/** What Mandate drifts toward, by cause: the ruler's statecraft, prestige, laws, values, traditions and modifiers
 *  (faith mechanics among them; lawEffect sums them all), a regency and excommunication. */
export function mandateParts(s: GameState, n: Nation): [string | I18n, number][] {
  const r = s.chars[n.ruler];
  const out: [string | I18n, number][] = [['base', 45], ['ruler_statecraft', r ? r.skills[1] * 5 : 10], ['prestige', n.prestige * 0.1],
    ['laws_values', lawEffect(n, 'mandate_gain') * 100 + lawEffect(n, 'mandate')]];
  if (n.regent) out.push(['regency', -15]);
  if (n.excommunicated) out.push(['excommunicated', -25]);
  out.push(...govMandateParts(s, n));
  return out;
}
export const sumParts = (p: [unknown, number][]) => { let v = 0; for (const x of p) v += x[1]; return v; };

function nationPoliticsMonth(s: GameState, w: World, n: Nation, cs: ClassSums) {
  n.authority = clamp(n.authority + authorityGain(s, n), 0, 300);
  // Concord drifts toward a target from contentment of powers (weighed by a strong assembly, estate_power), war exhaustion and effects
  const target = sumParts(concordParts(s, n));
  n.concord = clamp(n.concord + (target - n.concord) * 0.04, -100, 100);
  // Mandate drifts with the ruler's statecraft, prestige and faith unity
  const mTarget = sumParts(mandateParts(s, n));
  n.mandate = clamp(n.mandate + (mTarget - n.mandate) * 0.03, 0, 100);
  n.prestige = clamp(n.prestige * 0.995 + lawEffect(n, 'prestige'), -100, 100);
  // weariness fades only in peace (an ally called into a war tires more slowly than its leader, see warsMonth)
  const inWar = s.wars.some((x) => x.att.includes(n.id) || x.def.includes(n.id));
  if (!inWar) n.warExhaustion = Math.max(0, n.warExhaustion - 1.5);
  n.corruption = clamp(n.corruption + lawEffect(n, 'corruption') * 0.01 - 0.0005, 0, 0.6);
  // estates: contentment drifts to 50 + privileges effect - duties - the other Powers' privileges they resent;
  // influence drifts toward the Power's share of the people and the wealth, weighed by standing, laws and privileges
  const tgt = influenceTargets(s, n, cs);
  for (const e of n.estates) {
    const priv = e.privileges.length * 6;
    e.contentment = clamp(e.contentment + (50 + priv - dutyDiscontent(n, e.id, (c) => classExempt(n, c)) + resentment(n, e.id) - e.contentment) * 0.03, 0, 100);
    e.influence = clamp(e.influence + ((tgt[e.id] ?? e.influence) - e.influence) * INFLUENCE_DRIFT, 5, 100);
  }
  // normalise influence to 100
  let tot = 0; for (const e of n.estates) tot += e.influence;
  for (const e of n.estates) e.influence = e.influence / tot * 100;
  // an overmighty power provokes a crisis
  for (const e of n.estates) {
    if (e.influence > 60 && e.contentment < 40 && !n.flags[`estate_crisis_${e.id}`]) {
      n.flags[`estate_crisis_${e.id}`] = s.day;
      n.concord = clamp(n.concord - 25, -100, 100);
      const nm = estateName(e.id);
      n.modifiers.push({ id: `estate_crisis_${e.id}`, until: s.day + 365 * 2, label: { en: `Overmighty ${nm.en}`, de: `Übermächtige ${nm.de}` }, effects: { tax: -0.15, unrest: 4, authority_gain: -0.3 } });
      notice(s, n.id, 'estate_crisis', { en: `The ${nm.en} have grown overmighty and defy the crown!`, de: `Die ${nm.de} sind übermächtig geworden und trotzen der Krone!` });
      chronicle(s, n.id, 'crisis', { en: `In ${n.short.en} the ${nm.en} defied the crown.`, de: `In ${n.short.de} trotzten die ${nm.de} der Krone.` });
    } else if (e.influence < 50 && n.flags[`estate_crisis_${e.id}`] && s.day - n.flags[`estate_crisis_${e.id}`] > 730) delete n.flags[`estate_crisis_${e.id}`];
  }
  // reforms in progress
  if (n.reform) {
    n.reform.left -= 30;
    if (n.reform.left <= 0) {
      const L = LAWS[LAW_INDEX[n.reform.law]]; const opt = L.options[n.reform.option];
      n.laws[n.reform.law] = n.reform.option;
      for (const [eid, dv] of Object.entries(opt.estates)) { const e = n.estates.find((x) => x.id === eid); if (e) { e.contentment = clamp(e.contentment + dv * 1.5, 0, 100); e.influence = clamp(e.influence + dv * 0.4, 5, 100); } }
      // value axis drift from reform group
      shiftValuesForLaw(n, L.group, n.reform.option, L.options.length);
      notice(s, n.id, 'reform', { en: `Reform completed: ${L.name.en} — ${opt.name.en}.`, de: `Reform abgeschlossen: ${L.name.de} — ${opt.name.de}.` });
      if (s.playerNations.includes(n.id) || n.rank === 'kingdom' || n.rank === 'empire') chronicle(s, n.id, 'reform', { en: `${n.short.en} enacted “${opt.name.en}”.`, de: `${n.short.de} führte „${opt.name.de}“ ein.` });
      n.reform = undefined;
    }
  }
  // value axes drift slowly toward what laws, faith, government and geography imply
  valueDrift(s, w, n);
}

function shiftValuesForLaw(n: Nation, group: string, opt: number, nopt: number) {
  const frac = nopt > 1 ? opt / (nopt - 1) : 0;
  const push = (axis: number, v: number) => { n.values[axis] = clamp((n.values[axis] || 0) + v, -100, 100); };
  if (group === 'crown') push(0, (frac - 0.4) * 15);
  if (group === 'society') push(1, (frac - 0.5) * 10);
  if (group === 'faith') push(3, (frac - 0.5) * 12);
  if (group === 'economy') push(6, (frac - 0.4) * 10);
  if (group === 'military') push(5, (frac - 0.4) * 10);
}

function valueDrift(s: GameState, w: World, n: Nation) {
  const v = n.values;
  const serf = lawEffect(n, 'serfdom');
  v[1] = clamp(v[1] + ((serf - 0.5) * 80 - v[1]) * 0.003, -100, 100);
  const coast = n.capital >= 0 && w.coastal[n.capital] ? 30 : -20;
  v[4] = clamp(v[4] + (coast - v[4]) * 0.002, -100, 100);
  v[2] = clamp(v[2] + ((n.tech[0] + n.tech[1] - 2) * 4 - 30 - v[2]) * 0.002, -100, 100);
  const tol = lawEffect(n, 'tolerance');
  v[3] = clamp(v[3] + ((tol - 0.4) * 100 - v[3]) * 0.003, -100, 100);
  v[7] = clamp(v[7] * 0.998 + (s.wars.some((x) => x.att.includes(n.id) || x.def.includes(n.id)) ? 0.3 : -0.1), -100, 100);
}

export function enactReform(s: GameState, n: Nation, law: string, option: number): string | I18n | null {
  const L = LAWS[LAW_INDEX[law]]; if (!L) return 'unknown law';
  const opt = L.options[option]; if (!opt) return 'unknown option';
  if ((n.laws[law] ?? 0) === option) return 'already in force';
  if (n.reform) return 'a reform is already under way';
  if ((opt.minEra ?? 0) > n.era) return 'not yet possible in this era';
  if (opt.gov && !opt.gov.includes(n.gov)) return 'not possible for this government';
  const cost = reformCost(n, law, option);
  if (n.authority < cost) return 'not enough Authority';
  // assembly may block reforms against powerful estates
  for (const [eid, dv] of Object.entries(opt.estates)) {
    const e = n.estates.find((x) => x.id === eid);
    if (e && dv < -5 && e.influence > 55 && e.contentment < 45) { const nm = ESTATES.find((x) => x.id === eid)?.name ?? { en: eid, de: eid }; return { en: `The ${nm.en} block the reform`, de: `Die ${nm.de} blockieren die Reform` }; }
  }
  n.authority -= cost;
  n.reform = { law, option, left: 120 + Math.abs(option - (n.laws[law] ?? 0)) * 90 };
  for (const [eid, dv] of Object.entries(opt.estates)) { const e = n.estates.find((x) => x.id === eid); if (e && dv < 0) e.contentment = clamp(e.contentment + dv * 0.5, 0, 100); }
  return null;
}
export function reformCost(n: Nation, law: string, option: number) { return 40 + Math.abs(option - (n.laws[law] ?? 0)) * 25; }

export function grantPrivilege(s: GameState, n: Nation, pid: string): string | null {
  const p = PRIVILEGES.find((x) => x.id === pid); if (!p) return 'unknown';
  const e = estate(n, p.estate); if (e.privileges.includes(pid)) return 'already granted';
  e.privileges.push(pid);
  e.contentment = clamp(e.contentment + 20, 0, 100); e.influence = clamp(e.influence + 8, 5, 100);
  for (const [eid, dv] of Object.entries(p.resent ?? {})) { const o = n.estates.find((x) => x.id === eid); if (o) o.contentment = clamp(o.contentment + dv, 0, 100); }
  if (p.grant.authority) n.authority += p.grant.authority;
  if (p.grant.concord) n.concord = clamp(n.concord + p.grant.concord, -100, 100);
  if (p.grant.mandate) n.mandate = clamp(n.mandate + p.grant.mandate, 0, 100);
  if (p.grant.treasury_months) addIncome(n, 'privileges', (n.income.tax || 10) * p.grant.treasury_months);
  n.modifiers.push({ id: `priv_${pid}`, until: 1e9, label: p.name, effects: p.effects });
  return null;
}
export function revokePrivilege(s: GameState, n: Nation, pid: string): string | null {
  const p = PRIVILEGES.find((x) => x.id === pid); if (!p) return 'unknown';
  const e = estate(n, p.estate); const k = e.privileges.indexOf(pid); if (k < 0) return 'not granted';
  if (n.authority < 50) return 'not enough Authority';
  n.authority -= 50; e.privileges.splice(k, 1); e.contentment = clamp(e.contentment - 30, 0, 100); e.influence = clamp(e.influence - 6, 5, 100);
  n.modifiers = n.modifiers.filter((m) => m.id !== `priv_${pid}`);
  return null;
}

export const politics: System = {
  id: 'politics',
  init(s, w) {
    for (const n of s.nations) {
      for (const L of LAWS) n.laws[L.id] = Math.min(L.options.length - 1, L.default(n.gov, n.rank, FAITHS[n.faith]?.id ?? 'latin'));
      n.values = [0, 30, -40, -50, 0, 0, -10, 10];
      if (n.gov.includes('republic')) { n.values[6] = 50; n.values[4] = 30; n.values[0] = -20; }
      if (n.gov === 'nomadic_horde') { n.values[0] = -50; n.values[5] = -30; n.values[7] = 50; }
      if (n.gov === 'theocracy' || n.gov === 'military_order') { n.values[3] = -80; n.values[7] = 30; }
      n.estates = estateDefaults(n);
      fillCouncil(s, n);
      refreshCandidates(s, n, false);
      if (!n.heir) pickNewHeir(s, n); // a house researched without a named heir (Castile: the king's daughters)
      if (n.ruler && s.chars[n.ruler] && ageOf(s, s.chars[n.ruler]) < 16) n.regent = newChar(s, n, { born: s.day - 40 * 365, role: 'courtier' }).id;
      syncRulerTraits(s, n);
    }
  },
  daily({ s, w }) { settleCourts(s, w); },
  monthly({ s, w }) {
    const cs = classSums(s);
    for (const n of s.nations) {
      if (!n.alive) continue;
      characterMonth(s, w, n);
      nationPoliticsMonth(s, w, n, cs);
      officialsMonth(s, n);
      fillCouncil(s, n); // a vacant seat is filled within the month (it was left empty up to a year)
      // every court has candidates for office, the AI's as the player's (the AI appoints the ablest, ai_statecraft.ts)
      refreshCandidates(s, n, s.day % 365 < 31);
      n.modifiers = n.modifiers.filter((m) => m.until > s.day);
    }
    othersMonth(s, w);
  },
};
