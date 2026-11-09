// Internal politics: laws & reforms, Powers of the Realm, value axes, council, rulers, succession, Concord & Mandate.
import type { GameState, Nation, Character, Estate, I18n } from '../types';
import type { World } from '../world';
import { type Ctx, type System, DAY_EPOCH, clamp, chronicle, notice, newId, addExpense, addOpinion } from '../ctx';
import { LAWS, LAW_INDEX, VALUES } from '../content/laws';
import { rand, chance, hash01, pick, seedRng } from '../rng';
import { dayToDate, dateToDay } from '../calendar';
import { FAITHS, GROUP_TRADITIONS } from '../content/peoples';
import { dutyDiscontent } from './duties';

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
export const PRIVILEGES: { id: string; estate: string; name: { en: string; de: string }; grant: Record<string, number>; effects: Record<string, number> }[] = [
  { id: 'magnate_command', estate: 'magnates', name: { en: 'Hereditary commands', de: 'Erbliche Befehlsgewalt' }, grant: { authority: 25 }, effects: { manpower: 0.15, control: -0.05 } },
  { id: 'magnate_tax', estate: 'magnates', name: { en: 'Exemption from the hearth tax', de: 'Befreiung von der Herdsteuer' }, grant: { treasury_months: 3 }, effects: { hearth_exempt_nobles: 1, tax: -0.08 } },
  { id: 'magnate_council', estate: 'magnates', name: { en: 'Seats in the royal council', de: 'Sitze im Kronrat' }, grant: { concord: 15 }, effects: { authority_gain: -0.2 } },
  { id: 'prelate_tithe', estate: 'prelates', name: { en: 'Untouchable tithes', de: 'Unantastbarer Zehnt' }, grant: { mandate: 10 }, effects: { tax: -0.05, conversion: 0.2 } },
  { id: 'prelate_schools', estate: 'prelates', name: { en: 'Church control of schools', de: 'Kirchliche Schulaufsicht' }, grant: { concord: 10 }, effects: { research: -0.05, literacy: 0.01 } },
  { id: 'burgher_monopoly', estate: 'burghers', name: { en: 'Trade monopolies', de: 'Handelsmonopole' }, grant: { treasury_months: 4 }, effects: { trade: -0.06, tax: 0.03 } },
  { id: 'burgher_loans', estate: 'burghers', name: { en: 'Crown loans on easy terms', de: 'Kronkredite zu leichten Bedingungen' }, grant: { authority: 10 }, effects: { interest: -0.02 } },
  { id: 'commons_charters', estate: 'commons', name: { en: 'Village charters', de: 'Dorfbriefe' }, grant: { concord: 10 }, effects: { unrest: -3, tax: -0.03 } },
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
import { givenName, personName, houseName, localName, familyForm } from '../content/names';
import { christianClaimants, pressLater, houseMember, inheritClaims, unwed } from './dynasty';
function nameFor(s: GameState, n: Nation, female: boolean, rng: number[] = s.rng): string {
  return givenName(rng, n.culture, female);
}
/** A name in German, for the German half of a notice or chronicle line (content/names.ts localName). */
const de = (c: Character | undefined | null) => localName(c?.name ?? '?', 'de', !!c?.female);
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

function findHeir(s: GameState, n: Nation, dead: Character): number {
  const law = LAWS[LAW_INDEX.succession].options[n.laws.succession ?? 0].id;
  const kids = dead.children.map((k) => s.chars[k]).filter((c) => c && c.alive);
  kids.sort((a, b) => a.born - b.born);
  if (law === 'primogeniture') { const m = kids.find((c) => !c.female); if (m) return m.id; }
  if (law === 'cognatic' && kids.length) return kids[0].id;
  if (law === 'seniority') {
    // eldest living dynast: brothers first
    const sib = Object.values(s.chars).filter((c) => c.alive && c.nation === n.id && c.dynasty === dead.dynasty && c.id !== dead.id && !c.female && ageOf(s, c) > 16).sort((a, b) => a.born - b.born);
    if (sib.length) return sib[0].id;
  }
  if (n.heir && s.chars[n.heir]?.alive) return n.heir;
  const m = kids.find((c) => !c.female) || kids[0];
  return m ? m.id : 0;
}

export function succession(s: GameState, w: World, n: Nation) {
  const dead = s.chars[n.ruler];
  n.flags.ruler_changed = s.day;
  const law = LAWS[LAW_INDEX.succession].options[n.laws.succession ?? 0].id;
  let next = 0;
  let contested = false;
  const elected = law === 'office' ? ablestOfficial(s, n) : null;
  if (elected) {
    // election to office: the council and court choose the ablest of their own; no regency, no claim of blood
    next = elected.id;
    for (const off in n.council) if (n.council[off] === next) delete n.council[off];
    n.candidates = (n.candidates ?? []).filter((id) => id !== next);
  } else if (law === 'elective' || law === 'office') {
    // electors (Magnates or Burghers) choose: heir if any and capable, else a new noble
    const cand = n.heir && s.chars[n.heir]?.alive ? s.chars[n.heir] : null;
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
      const claimants = christianClaimants(s, n).map((c) => c.nation);
      if (claimants.length) {
        const k = claimants[0];
        const other = s.nations[k];
        // personal union: the claimant's ruler inherits; nation becomes junior partner
        const ownJuniors = s.nations.some((x) => x.alive && x.overlord === n.id && x.subjectType === 'personal_union');
        if (other.overlord < 0 && n.overlord < 0 && !s.wars.some((wr) => wr.att.includes(k) && wr.def.includes(n.id))) {
          // the greater crown is the seat of the union: a small claimant's realm joins it as the junior partner
          const flip = !s.playerNations.includes(k) && !s.nations.some((x) => x.alive && x.overlord === k) && (s.playerNations.includes(n.id) || ownJuniors || nationDevOf(s, n.id) > nationDevOf(s, k) * 1.5);
          if (flip) {
            other.overlord = n.id; other.subjectType = 'personal_union'; other.subjectSince = s.day;
            n.ruler = other.ruler; n.heir = other.heir; n.consort = other.consort; n.regent = other.regent || 0; n.dynasty = other.dynasty;
            // juniors still share the dead ruler: the caller gives each its chance to leave, else they follow the new ruler
            chronicle(s, n.id, 'union', { en: `The crown of ${n.short.en} passed to ${s.chars[other.ruler]?.name} of ${other.short.en}, who now rules both: ${other.short.en} is the junior partner.`, de: `Die Krone von ${n.short.de} ging an ${de(s.chars[other.ruler])} von ${other.short.de}, der nun beide regiert: ${other.short.de} ist der Juniorpartner.` });
            notice(s, other.id, 'union', { en: 'Personal union formed', de: 'Personalunion entstanden' });
            notice(s, n.id, 'union', { en: `${dead?.name ?? '?'} died without heirs: ${s.chars[other.ruler]?.name} of ${other.short.en} inherits our crown and rules both realms.`, de: `${de(dead)} starb ohne Erben: ${de(s.chars[other.ruler])} von ${other.short.de} erbt unsere Krone und regiert beide Reiche.` }, { loc: n.capital });
            return;
          }
          n.overlord = k; n.subjectType = 'personal_union'; n.subjectSince = s.day; n.dynasty = other.dynasty;
          n.ruler = other.ruler; n.heir = other.heir; n.consort = other.consort;
          chronicle(s, n.id, 'union', { en: `${n.short.en} passed by inheritance to ${other.short.en}: a personal union under ${s.chars[other.ruler]?.name}.`, de: `${n.short.de} fiel durch Erbschaft an ${other.short.de}: Personalunion unter ${de(s.chars[other.ruler])}.` });
          notice(s, n.id, 'union', { en: 'Personal union formed', de: 'Personalunion entstanden' });
          return;
        }
        // the claimant cannot take the crown now (at war with us, or itself a subject): it keeps a claim to press
        pressLater(s, k, n);
      }
      // a lord of a native house takes the crown
      const c = newChar(s, n, { born: s.day - Math.floor((30 + rand(s.rng) * 20) * 365), role: 'ruler', female: false, dynasty: houseName(s.rng, n.culture) || `${w.names[n.capital] ?? 'House'}` });
      next = c.id; n.dynasty = c.dynasty; contested = true;
    }
  }
  const heir = s.chars[next];
  if (!heir) return;
  const oldName = dead?.name ?? '?';
  n.ruler = next; heir.role = 'ruler';
  if (n.heir === next) n.heir = 0;
  // new consort if spouse alive
  n.consort = heir.spouse && s.chars[heir.spouse]?.alive ? heir.spouse : 0;
  const age = ageOf(s, heir);
  // Mandate of a new ruler
  const strife = lawEffect(n, 'succession_strife') + (n.gov === 'nomadic_horde' ? 0.3 : 0);
  n.mandate = clamp(n.mandate * 0.5 + 30 + heir.skills[1] * 4 - (contested ? 20 : 0), 0, 100);
  // regency
  if (age < 16) {
    n.regent = newChar(s, n, { born: s.day - 40 * 365, role: 'courtier', female: chance(s.rng, 0.4) }).id;
    n.mandate = clamp(n.mandate - 10 - lawEffect(n, 'regency_strife') * 20, 0, 100);
    notice(s, n.id, 'regency', { en: `A regency council rules for the child ${heir.name}.`, de: `Ein Regentschaftsrat regiert für das Kind ${de(heir)}.` });
  } else n.regent = 0;
  chronicle(s, n.id, 'succession', { en: `${oldName} of ${n.short.en} died; ${heir.name} ${heir.dynasty ? '(' + heir.dynasty + ') ' : ''}succeeded at age ${Math.floor(age)}.`, de: `${de(dead)} von ${n.short.de} starb; ${de(heir)} ${heir.dynasty ? '(' + heir.dynasty + ') ' : ''}folgte im Alter von ${Math.floor(age)} Jahren.` });
  notice(s, n.id, 'ruler_death', { en: `${oldName} has died. Long live ${heir.name}!`, de: `${de(dead)} ist gestorben. Es lebe ${de(heir)}!` }, { loc: n.capital });
  s.flags[`ruler_death_${n.id}`] = s.day;
  // disputed succession → civil war
  const strifeChance = clamp(0.04 + strife * 0.3 + (contested ? 0.25 : 0) + (n.mandate < 25 ? 0.15 : 0) + (estate(n, 'magnates').influence > 65 ? 0.1 : 0) + (age < 16 ? 0.08 : 0), 0, 0.8);
  if (chance(s.rng, strifeChance) && n.capital >= 0) {
    s.flags[`civil_war_pending_${n.id}`] = s.day + 30;
    notice(s, n.id, 'succession_crisis', { en: `The succession of ${heir.name} is disputed! A pretender is gathering the discontented lords.`, de: `Die Nachfolge von ${de(heir)} ist umstritten! Ein Thronprätendent sammelt die unzufriedenen Herren.` }, { loc: n.capital });
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

/** Election to office: the ablest grown official or candidate at court (skills, then loyalty; never kin by right). */
export function ablestOfficial(s: GameState, n: Nation): Character | null {
  let best: Character | null = null, bv = -1;
  const ids = [...Object.values(n.council), ...(n.candidates ?? [])];
  for (const id of ids) {
    const c = s.chars[id];
    if (!c || !c.alive || c.nation !== n.id || c.id === n.ruler) continue;
    const age = ageOf(s, c); if (age < 25 || age > 72) continue;
    const v = c.skills[0] + c.skills[1] + c.skills[2] + (c.loyalty ?? 50) / 100;
    if (v > bv || (v === bv && best && c.id < best.id)) { bv = v; best = c; }
  }
  return best;
}
export function pickNewHeir(s: GameState, n: Nation) {
  const r = s.chars[n.ruler]; if (!r) return;
  const law = LAWS[LAW_INDEX.succession].options[n.laws.succession ?? 0].id;
  // elected to office: the presumptive successor is whoever the council would choose today
  if (law === 'office') { const b = ablestOfficial(s, n); n.heir = b ? b.id : 0; return; }
  const kids = r.children.map((k) => s.chars[k]).filter((c) => c && c.alive).sort((a, b) => a.born - b.born);
  const h = law === 'primogeniture' ? kids.find((c) => !c.female) : kids[0];
  n.heir = h ? h.id : 0;
  if (h) h.role = 'heir';
}

/** A character of nation n dies (of age, in battle, ...): a ruler's crown passes by succession (and with it any
 *  crown held in personal union), an heir is replaced, consort, regent and council seats fall vacant. */
export function characterDies(s: GameState, w: World, n: Nation, cid: number) {
  const c = s.chars[cid]; if (!c || !c.alive) return;
  c.alive = false; c.died = s.day;
  if (cid === n.ruler && s.nations[n.id].ruler === cid) {
    // only the true ruler of this nation (personal unions share the ruler)
    succession(s, w, n);
    for (const other of s.nations) if (other.alive && other.id !== n.id && other.ruler === cid) {
      // a junior crown in personal union may choose its own ruler when the shared one dies
      if (other.overlord === n.id && other.subjectType === 'personal_union' && chance(s.rng, unionBreakChance(s, other, n))) {
        other.overlord = -1; other.subjectType = null; other.libertyDesire = 0;
        const c = newChar(s, other, { born: s.day - Math.floor((25 + rand(s.rng) * 25) * 365), role: 'ruler', female: false, dynasty: other.dynasty });
        other.ruler = c.id; other.heir = 0; other.consort = 0; other.regent = 0; pickNewHeir(s, other);
        chronicle(s, other.id, 'union', { en: `On the death of ${c0name(s, cid)} the estates of ${other.short.en} chose their own ruler: the union with ${n.short.en} is over.`, de: `Nach dem Tod von ${de(s.chars[cid])} wählten die Stände von ${other.short.de} einen eigenen Herrscher: die Union mit ${n.short.de} ist beendet.` });
        notice(s, n.id, 'union_ended', { en: `${other.short.en} has chosen its own ruler and left our union.`, de: `${other.short.de} hat einen eigenen Herrscher gewählt und unsere Union verlassen.` }, { loc: other.capital });
        continue;
      }
      other.ruler = n.ruler; other.heir = n.heir;
    }
  } else if (cid === n.heir) { n.heir = 0; pickNewHeir(s, n); notice(s, n.id, 'heir_death', { en: `The heir ${c.name} has died.`, de: `${c.female ? 'Die Thronfolgerin' : 'Der Thronfolger'} ${de(c)} ist gestorben.` }); }
  else if (cid === n.consort) { n.consort = 0; }
  else if (cid === n.regent) { n.regent = 0; }
  else { for (const off in n.council) if (n.council[off] === cid) delete n.council[off]; }
}

function characterMonth(s: GameState, w: World, n: Nation) {
  // ruler, heir, consort, officials age and may die; births to the ruling couple
  for (const cid of [n.ruler, n.heir, n.consort, n.regent, ...Object.values(n.council)]) {
    const c = s.chars[cid]; if (!c || !c.alive) continue;
    // a ruler shared in personal union lives and dies with the senior crown's turn
    if (cid === n.ruler && n.overlord >= 0 && n.subjectType === 'personal_union' && s.nations[n.overlord]?.ruler === cid) continue;
    const age = ageOf(s, c);
    if (age > 50) c.health = Math.max(0.2, c.health - 0.002);
    if (chance(s.rng, monthlyDeathChance(age, c))) characterDies(s, w, n, cid);
  }
  const r = s.chars[n.ruler];
  if (n.regent && r && ageOf(s, r) >= 16) { n.regent = 0; notice(s, n.id, 'majority', { en: `${r.name} has come of age and rules in person.`, de: `${de(r)} ist volljährig und regiert selbst.` }); n.mandate = clamp(n.mandate + 10, 0, 100); }
  // marriage of an unmarried adult ruler: a member of a house bound to ours by a marriage treaty, else the daughter
  // or son of a noble family of our own people (systems/dynasty.ts)
  if (r && r.alive && !n.consort && unwed(s, r) && ageOf(s, r) > 16 && ageOf(s, r) < 55 && chance(s.rng, 0.04)) {
    const born = r.born + Math.floor((rand(s.rng) * 12 - 4) * 365);
    let sp: Character | null = null;
    for (const t of s.treaties) {
      if (t.type !== 'marriage' || (t.a !== n.id && t.b !== n.id) || t.until <= s.day) continue;
      const B = s.nations[t.a === n.id ? t.b : t.a]; if (!B?.alive) continue;
      sp = houseMember(s, B, !r.female, r.born);
      if (sp) { sp.nation = n.id; sp.claims = [...new Set([...(sp.claims ?? []), B.id])]; break; }
    }
    if (!sp) { const g = nameFor(s, n, !r.female), h = houseName(s.rng, n.culture); sp = newChar(s, n, { name: g, female: !r.female, born, role: 'consort', dynasty: h ? familyForm(h, n.culture, !r.female) : n.dynasty }); }
    sp.role = 'consort'; sp.spouse = r.id; r.spouse = sp.id; n.consort = sp.id;
  }
  // births
  const cons = s.chars[n.consort];
  if (r && cons && r.alive && cons.alive) {
    const mother = r.female ? r : cons;
    const ma = ageOf(s, mother);
    if (ma > 16 && ma < 42 && r.children.length < 9 && chance(s.rng, 0.022)) {
      const child = newChar(s, n, { born: s.day, role: 'courtier', dynasty: r.female ? cons.dynasty : r.dynasty, father: r.female ? cons.id : r.id, mother: mother.id, skills: [Math.floor(rand(s.rng) * 6), Math.floor(rand(s.rng) * 6), Math.floor(rand(s.rng) * 6)] });
      r.children.push(child.id); cons.children.push(child.id);
      inheritClaims(child, r, cons); // a foreign-born parent's claim on the throne of their house
      if (!n.heir || (!s.chars[n.heir]?.alive)) pickNewHeir(s, n);
      else { const law = LAWS[LAW_INDEX.succession].options[n.laws.succession ?? 0].id; if (law === 'primogeniture' && s.chars[n.heir]?.female && !child.female) pickNewHeir(s, n); }
      if (n.heir === child.id) notice(s, n.id, 'heir_born', { en: `An heir is born: ${child.name}!`, de: `${child.female ? 'Eine Thronfolgerin' : 'Ein Thronfolger'} ist geboren: ${de(child)}!` }, { loc: n.capital });
    }
  }
  // children grow up: if no heir, check
  if (!n.heir || !s.chars[n.heir]?.alive) pickNewHeir(s, n);
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
function fillCouncil(s: GameState, n: Nation) {
  for (const off of OFFICES) {
    const c = s.chars[n.council[off.id]];
    if (c && c.alive) continue;
    const nc = newChar(s, n, { ...courtPerson(s, n, false), born: s.day - Math.floor((30 + rand(s.rng) * 25) * 365), role: 'official', female: false });
    nc.loyalty = 40 + rand(s.rng) * 50; nc.corruption = rand(s.rng) * 0.3; nc.ambition = rand(s.rng);
    n.council[off.id] = nc.id;
  }
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
  return out;
}
export const sumParts = (p: [unknown, number][]) => { let v = 0; for (const x of p) v += x[1]; return v; };

function nationPoliticsMonth(s: GameState, w: World, n: Nation) {
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
  // estates: contentment drifts to 50 + privileges effect; influence from privileges, laws and economy
  for (const e of n.estates) {
    const priv = e.privileges.length * 6;
    e.contentment = clamp(e.contentment + (50 + priv - dutyDiscontent(n, e.id, (c) => classExempt(n, c)) - e.contentment) * 0.03, 0, 100);
    e.influence = clamp(e.influence + (priv * 0.05) - 0.03 + (e.id === 'burghers' ? lawEffect(n, 'trade') * 0.5 : 0), 5, 100);
  }
  // normalise influence to 100
  let tot = 0; for (const e of n.estates) tot += e.influence;
  for (const e of n.estates) e.influence = e.influence / tot * 100;
  // an overmighty power provokes a crisis
  for (const e of n.estates) {
    if (e.influence > 60 && e.contentment < 40 && !n.flags[`estate_crisis_${e.id}`]) {
      n.flags[`estate_crisis_${e.id}`] = s.day;
      n.concord = clamp(n.concord - 25, -100, 100);
      n.modifiers.push({ id: `estate_crisis_${e.id}`, until: s.day + 365 * 2, label: { en: `Overmighty ${e.id}`, de: `Übermächtige ${e.id}` }, effects: { tax: -0.15, unrest: 4, authority_gain: -0.3 } });
      notice(s, n.id, 'estate_crisis', { en: `The ${e.id} have grown overmighty and defy the crown!`, de: `Die ${e.id} sind übermächtig geworden und trotzen der Krone!` });
      chronicle(s, n.id, 'crisis', { en: `In ${n.short.en} the ${e.id} defied the crown.`, de: `In ${n.short.de} trotzten die ${e.id} der Krone.` });
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
  if (p.grant.authority) n.authority += p.grant.authority;
  if (p.grant.concord) n.concord = clamp(n.concord + p.grant.concord, -100, 100);
  if (p.grant.mandate) n.mandate = clamp(n.mandate + p.grant.mandate, 0, 100);
  if (p.grant.treasury_months) n.treasury += (n.income.tax || 10) * p.grant.treasury_months;
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
      if (n.ruler && s.chars[n.ruler] && ageOf(s, s.chars[n.ruler]) < 16) n.regent = newChar(s, n, { born: s.day - 40 * 365, role: 'courtier' }).id;
    }
  },
  monthly({ s, w }) {
    for (const n of s.nations) {
      if (!n.alive) continue;
      characterMonth(s, w, n);
      nationPoliticsMonth(s, w, n);
      officialsMonth(s, n);
      if (s.day % 365 < 31) fillCouncil(s, n);
      // every court has candidates for office, the AI's as the player's (the AI appoints the ablest, ai_statecraft.ts)
      refreshCandidates(s, n, s.day % 365 < 31);
      n.modifiers = n.modifiers.filter((m) => m.until > s.day);
    }
  },
};
