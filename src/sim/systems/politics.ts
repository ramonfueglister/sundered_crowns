// Internal politics: laws & reforms, Powers of the Realm, value axes, council, rulers, succession, Concord & Mandate.
import type { GameState, Nation, Character, Estate } from '../types';
import type { World } from '../world';
import { type Ctx, type System, DAY_EPOCH, clamp, chronicle, notice, newId, mod, addExpense, addOpinion } from '../ctx';
import { LAWS, LAW_INDEX, VALUES } from '../content/laws';
import { rand, chance, hash01, pick } from '../rng';
import { dayToDate, dateToDay } from '../calendar';
import { FAITHS } from '../content/peoples';

const LE_CACHE = new WeakMap<Nation, { e: number; m: Map<string, number> }>();
const MOD_ONLY = new Set(['tax', 'trade', 'production', 'unrest']); // read through mod() instead
/** Sum of an effect over laws, value axes and modifiers. Whole table built once per nation per day. */
export function lawEffect(n: Nation, key: string): number {
  let c = LE_CACHE.get(n);
  if (!c || c.e !== DAY_EPOCH.v) { c = { e: DAY_EPOCH.v, m: buildEffects(n) }; LE_CACHE.set(n, c); }
  return c.m.get(key) ?? 0;
}
function buildEffects(n: Nation): Map<string, number> {
  const m = new Map<string, number>();
  const add = (k: string, v: number) => { if (v) m.set(k, (m.get(k) ?? 0) + v); };
  for (const id in n.laws) {
    const L = LAWS[LAW_INDEX[id]]; if (!L) continue;
    const opt = L.options[n.laws[id]]; if (!opt) continue;
    for (const k in opt.effects) add(k, opt.effects[k]);
  }
  for (let a = 0; a < VALUES.length; a++) {
    const val = n.values[a] || 0; if (!val) continue;
    const eff = val < 0 ? VALUES[a].effectsLow : VALUES[a].effectsHigh;
    for (const k in eff) add(k, eff[k] * Math.abs(val) / 100);
  }
  for (const md of n.modifiers) for (const k in md.effects) if (!MOD_ONLY.has(k)) add(k, md.effects[k]);
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
  { id: 'magnate_tax', estate: 'magnates', name: { en: 'Exemption from the hearth tax', de: 'Befreiung von der Herdsteuer' }, grant: { treasury_months: 3 }, effects: { tax: -0.08 } },
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
const MALE_NAMES: Record<string, string[]> = {
  gallic: ['Jean', 'Charles', 'Louis', 'Philippe', 'Pierre', 'Guillaume', 'Robert', 'Henri'],
  british: ['Edward', 'Henry', 'Richard', 'John', 'Thomas', 'William', 'Robert', 'David'],
  german: ['Heinrich', 'Friedrich', 'Otto', 'Ludwig', 'Albrecht', 'Johann', 'Konrad', 'Rudolf', 'Wilhelm'],
  italian: ['Giovanni', 'Francesco', 'Galeazzo', 'Niccolò', 'Pietro', 'Lorenzo', 'Matteo', 'Luchino'],
  iberian: ['Pedro', 'Juan', 'Alfonso', 'Enrique', 'Fernando', 'Jaime', 'Duarte', 'Sancho'],
  west_slavic: ['Kazimierz', 'Władysław', 'Bolesław', 'Václav', 'Jan', 'Siemowit', 'Přemysl'],
  east_slavic: ['Ivan', 'Dmitry', 'Vasily', 'Mikhail', 'Yury', 'Semyon', 'Andrei', 'Oleg'],
  south_slavic: ['Stefan', 'Lazar', 'Tvrtko', 'Ivan', 'Vukašin', 'Đurađ', 'Marko'],
  hellenic: ['Ioannes', 'Manuel', 'Andronikos', 'Theodoros', 'Michael', 'Konstantinos', 'Demetrios'],
  turkic: ['Orhan', 'Murad', 'Bayezid', 'Mehmed', 'Süleyman', 'Ahmed', 'Mahmud', 'Ali'],
  arab: ['Muhammad', 'Ahmad', 'Hasan', 'Ali', 'Yusuf', 'Ibrahim', 'Abu Bakr', 'Umar'],
  norse: ['Magnus', 'Haakon', 'Valdemar', 'Erik', 'Olaf', 'Christopher', 'Knut'],
  carpathian: ['Lajos', 'Mircea', 'Vlad', 'Stephen', 'Dan', 'János', 'Mátyás'],
  baltic: ['Algirdas', 'Kęstutis', 'Jogaila', 'Vytautas', 'Skirgaila', 'Kaributas'],
};
const FEMALE_NAMES: Record<string, string[]> = {
  gallic: ['Jeanne', 'Isabelle', 'Marie', 'Blanche', 'Marguerite', 'Catherine'],
  british: ['Isabella', 'Joan', 'Philippa', 'Margaret', 'Eleanor', 'Mary'],
  german: ['Elisabeth', 'Margarethe', 'Anna', 'Katharina', 'Agnes', 'Mechthild'],
  italian: ['Caterina', 'Beatrice', 'Bianca', 'Giovanna', 'Lucia', 'Costanza'],
  iberian: ['Leonor', 'Juana', 'María', 'Isabel', 'Constanza', 'Blanca'],
  default: ['Anna', 'Maria', 'Helena', 'Sophia', 'Elena', 'Fatima', 'Aisha', 'Zeynep'],
};
import { GROUP_OF, ALL_CULTURES } from '../content/peoples';
function nameFor(s: GameState, n: Nation, female: boolean): string {
  const grp = GROUP_OF[ALL_CULTURES[n.culture]] || 'default';
  const pool = female ? (FEMALE_NAMES[grp] || FEMALE_NAMES.default) : (MALE_NAMES[grp] || MALE_NAMES.german);
  return pick(s.rng, pool);
}
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
  if (law === 'elective' || law === 'office') {
    // electors (Magnates or Burghers) choose: heir if any and capable, else a new noble
    const cand = n.heir && s.chars[n.heir]?.alive ? s.chars[n.heir] : null;
    const strength = cand ? cand.skills[0] + cand.skills[1] + cand.skills[2] : 0;
    if (cand && strength >= 6 && chance(s.rng, 0.6)) next = cand.id;
    else {
      const c = newChar(s, n, { born: s.day - Math.floor((35 + rand(s.rng) * 20) * 365), role: 'ruler', female: false, dynasty: law === 'office' ? '' : pick(s.rng, ['', n.dynasty]) || n.dynasty });
      next = c.id; if (c.dynasty) n.dynasty = c.dynasty;
    }
  } else {
    next = findHeir(s, n, dead);
    if (!next) {
      // extinction: a foreign dynasty with a marriage tie may claim; otherwise a magnate takes the crown
      const claimants = s.treaties.filter((t) => t.type === 'marriage' && (t.a === n.id || t.b === n.id)).map((t) => (t.a === n.id ? t.b : t.a)).filter((k) => s.nations[k].alive);
      if (claimants.length) {
        const k = claimants[0];
        const other = s.nations[k];
        // personal union: the claimant's ruler inherits; nation becomes junior partner
        if (other.overlord < 0 && n.overlord < 0 && !s.wars.some((wr) => wr.att.includes(k) && wr.def.includes(n.id))) {
          n.overlord = k; n.subjectType = 'personal_union'; n.subjectSince = s.day; n.dynasty = other.dynasty;
          n.ruler = other.ruler; n.heir = other.heir; n.consort = other.consort;
          chronicle(s, n.id, 'union', { en: `${n.short.en} passed by inheritance to ${other.short.en}: a personal union under ${s.chars[other.ruler]?.name}.`, de: `${n.short.de} fiel durch Erbschaft an ${other.short.de}: Personalunion unter ${s.chars[other.ruler]?.name}.` });
          notice(s, n.id, 'union', { en: 'Personal union formed', de: 'Personalunion entstanden' });
          return;
        }
      }
      const c = newChar(s, n, { born: s.day - Math.floor((30 + rand(s.rng) * 20) * 365), role: 'ruler', female: false, dynasty: `${w.names[n.capital] ?? 'House'}` });
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
    notice(s, n.id, 'regency', { en: `A regency council rules for the child ${heir.name}.`, de: `Ein Regentschaftsrat regiert für das Kind ${heir.name}.` });
  } else n.regent = 0;
  chronicle(s, n.id, 'succession', { en: `${oldName} of ${n.short.en} died; ${heir.name} ${heir.dynasty ? '(' + heir.dynasty + ') ' : ''}succeeded at age ${Math.floor(age)}.`, de: `${oldName} von ${n.short.de} starb; ${heir.name} ${heir.dynasty ? '(' + heir.dynasty + ') ' : ''}folgte im Alter von ${Math.floor(age)} Jahren.` });
  notice(s, n.id, 'ruler_death', { en: `${oldName} has died. Long live ${heir.name}!`, de: `${oldName} ist gestorben. Es lebe ${heir.name}!` }, { loc: n.capital });
  s.flags[`ruler_death_${n.id}`] = s.day;
  // disputed succession → civil war
  const strifeChance = clamp(0.04 + strife * 0.3 + (contested ? 0.25 : 0) + (n.mandate < 25 ? 0.15 : 0) + (estate(n, 'magnates').influence > 65 ? 0.1 : 0) + (age < 16 ? 0.08 : 0), 0, 0.8);
  if (chance(s.rng, strifeChance) && n.capital >= 0) {
    s.flags[`civil_war_pending_${n.id}`] = s.day + 30;
    notice(s, n.id, 'succession_crisis', { en: `The succession of ${heir.name} is disputed! A pretender is gathering the discontented lords.`, de: `Die Nachfolge von ${heir.name} ist umstritten! Ein Thronprätendent sammelt die unzufriedenen Herren.` }, { loc: n.capital });
  }
  // new heir: eldest child
  pickNewHeir(s, n);
}

export function pickNewHeir(s: GameState, n: Nation) {
  const r = s.chars[n.ruler]; if (!r) return;
  const kids = r.children.map((k) => s.chars[k]).filter((c) => c && c.alive).sort((a, b) => a.born - b.born);
  const law = LAWS[LAW_INDEX.succession].options[n.laws.succession ?? 0].id;
  const h = law === 'primogeniture' ? kids.find((c) => !c.female) : kids[0];
  n.heir = h ? h.id : 0;
  if (h) h.role = 'heir';
}

function characterMonth(s: GameState, w: World, n: Nation) {
  // ruler, heir, consort, officials age and may die; births to the ruling couple
  for (const cid of [n.ruler, n.heir, n.consort, n.regent, ...Object.values(n.council)]) {
    const c = s.chars[cid]; if (!c || !c.alive) continue;
    const age = ageOf(s, c);
    if (age > 50) c.health = Math.max(0.2, c.health - 0.002);
    if (chance(s.rng, monthlyDeathChance(age, c))) {
      c.alive = false; c.died = s.day;
      if (cid === n.ruler && s.nations[n.id].ruler === cid) {
        // only the true ruler of this nation (personal unions share the ruler)
        for (const other of s.nations) if (other.alive && other.ruler === cid) { if (other.overlord >= 0 && other.subjectType === 'personal_union' && other.id !== n.id) continue; }
        succession(s, w, n);
        for (const other of s.nations) if (other.alive && other.id !== n.id && other.ruler === cid) { other.ruler = n.ruler; other.heir = n.heir; }
      } else if (cid === n.heir) { n.heir = 0; pickNewHeir(s, n); notice(s, n.id, 'heir_death', { en: `The heir ${c.name} has died.`, de: `Der Thronfolger ${c.name} ist gestorben.` }); }
      else if (cid === n.consort) { n.consort = 0; }
      else if (cid === n.regent) { n.regent = 0; }
      else { for (const off in n.council) if (n.council[off] === cid) delete n.council[off]; }
    }
  }
  const r = s.chars[n.ruler];
  if (n.regent && r && ageOf(s, r) >= 16) { n.regent = 0; notice(s, n.id, 'majority', { en: `${r.name} has come of age and rules in person.`, de: `${r.name} ist volljährig und regiert selbst.` }); n.mandate = clamp(n.mandate + 10, 0, 100); }
  // marriage of an unmarried adult ruler
  if (r && r.alive && !n.consort && ageOf(s, r) > 16 && ageOf(s, r) < 55 && chance(s.rng, 0.04)) {
    const sp = newChar(s, n, { female: !r.female, born: r.born + Math.floor((rand(s.rng) * 12 - 4) * 365), role: 'consort', dynasty: 'noble house' });
    sp.spouse = r.id; r.spouse = sp.id; n.consort = sp.id;
  }
  // births
  const cons = s.chars[n.consort];
  if (r && cons && r.alive && cons.alive) {
    const mother = r.female ? r : cons;
    const ma = ageOf(s, mother);
    if (ma > 16 && ma < 42 && r.children.length < 9 && chance(s.rng, 0.022)) {
      const child = newChar(s, n, { born: s.day, role: 'courtier', dynasty: r.female ? cons.dynasty : r.dynasty, father: r.female ? cons.id : r.id, mother: mother.id, skills: [Math.floor(rand(s.rng) * 6), Math.floor(rand(s.rng) * 6), Math.floor(rand(s.rng) * 6)] });
      r.children.push(child.id); cons.children.push(child.id);
      if (!n.heir || (!s.chars[n.heir]?.alive)) pickNewHeir(s, n);
      else { const law = LAWS[LAW_INDEX.succession].options[n.laws.succession ?? 0].id; if (law === 'primogeniture' && s.chars[n.heir]?.female && !child.female) pickNewHeir(s, n); }
      if (n.heir === child.id) notice(s, n.id, 'heir_born', { en: `An heir is born: ${child.name}!`, de: `Ein Thronfolger ist geboren: ${child.name}!` }, { loc: n.capital });
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
  const off = OFFICES.find((o) => o.id === office)!;
  return (c.skills[off.skill] / 6) * 0.1 * (1 - (c.corruption ?? 0));
}
function fillCouncil(s: GameState, n: Nation) {
  for (const off of OFFICES) {
    const c = s.chars[n.council[off.id]];
    if (c && c.alive) continue;
    const nc = newChar(s, n, { born: s.day - Math.floor((30 + rand(s.rng) * 25) * 365), role: 'official', female: false, dynasty: pick(s.rng, ['de Vere', 'von Stein', 'Orsini', 'Colonna', 'Lannoy', 'Rožmberk', 'Tęczyński', 'Hunyadi', 'Strozzi', 'Mendoza', 'Percy', 'Neville', 'Wittelsbach', 'Gonzaga']) });
    nc.loyalty = 40 + rand(s.rng) * 50; nc.corruption = rand(s.rng) * 0.3; nc.ambition = rand(s.rng);
    n.council[off.id] = nc.id;
  }
}
export function officialsMonth(s: GameState, n: Nation) {
  for (const off of OFFICES) {
    const c = s.chars[n.council[off.id]]; if (!c || !c.alive) continue;
    // corruption creeps up; ambitious officials intrigue when loyalty is low
    c.corruption = clamp((c.corruption ?? 0) + (c.ambition ?? 0.5) * 0.002 - (n.laws.administration ? 0.001 : 0), 0, 1);
    c.loyalty = clamp((c.loyalty ?? 50) + (n.mandate - 50) * 0.01 - (c.ambition ?? 0.5) * 0.05, 0, 100);
    if (off.id === 'treasurer') { const graft = (c.corruption ?? 0) * (n.income.tax || 0) * 0.04; if (graft > 0) addExpense(n, 'graft', graft); }
    if ((c.loyalty ?? 50) < 15 && chance(s.rng, 0.05)) {
      // fall from grace: dismissed in disgrace; a faction is angered
      delete n.council[off.id];
      estate(n, 'magnates').contentment -= 5; n.concord = clamp(n.concord - 5, -100, 100);
      notice(s, n.id, 'intrigue', { en: `${off.name.en} ${c.name} was caught intriguing and has fallen from grace.`, de: `${off.name.de} ${c.name} wurde bei Intrigen ertappt und ist in Ungnade gefallen.` });
    }
  }
}

// ---------------- Authority, Concord, Mandate, estates ----------------
export function authorityGain(s: GameState, n: Nation): number {
  const r = s.chars[n.ruler];
  const sk = r ? r.skills[0] + r.skills[1] * 0.5 : 2;
  return (1 + sk * 0.4 + n.mandate / 50) * (1 + lawEffect(n, 'authority_gain')) + lawEffect(n, 'authority');
}

function nationPoliticsMonth(s: GameState, w: World, n: Nation) {
  n.authority = clamp(n.authority + authorityGain(s, n), 0, 300);
  // Concord drifts toward a target from contentment of powers, unrest and war exhaustion
  let content = 0, infl = 0;
  for (const e of n.estates) { content += e.contentment * e.influence; infl += e.influence; }
  const avgContent = infl > 0 ? content / infl : 50;
  const target = (avgContent - 50) * 1.2 - n.warExhaustion * 0.3 + lawEffect(n, 'concord_gain') * 50 + (n.excommunicated ? -20 : 0) + mod(n, 'concord');
  n.concord = clamp(n.concord + (target - n.concord) * 0.04, -100, 100);
  // Mandate drifts with the ruler's statecraft, prestige and faith unity
  const r = s.chars[n.ruler];
  const mTarget = 45 + (r ? r.skills[1] * 5 : 10) + n.prestige * 0.1 + lawEffect(n, 'mandate_gain') * 100 + (n.regent ? -15 : 0) + (n.excommunicated ? -25 : 0) + mod(n, 'mandate');
  n.mandate = clamp(n.mandate + (mTarget - n.mandate) * 0.03, 0, 100);
  n.prestige = clamp(n.prestige * 0.995, -100, 100);
  n.warExhaustion = Math.max(0, n.warExhaustion - (s.wars.some((x) => x.att.includes(n.id) || x.def.includes(n.id)) ? 0 : 0.6));
  n.corruption = clamp(n.corruption + lawEffect(n, 'corruption') * 0.01 - 0.0005, 0, 0.6);
  // estates: contentment drifts to 50 + privileges effect; influence from privileges, laws and economy
  for (const e of n.estates) {
    const priv = e.privileges.length * 6;
    e.contentment = clamp(e.contentment + (50 + priv - e.contentment) * 0.03, 0, 100);
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
      chronicle(s, n.id, 'reform', { en: `${n.short.en} enacted “${opt.name.en}”.`, de: `${n.short.de} führte „${opt.name.de}“ ein.` });
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

export function enactReform(s: GameState, n: Nation, law: string, option: number): string | null {
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
    if (e && dv < -5 && e.influence > 55 && e.contentment < 45) return `${eid} block the reform`;
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
      n.modifiers = n.modifiers.filter((m) => m.until > s.day);
    }
  },
};
