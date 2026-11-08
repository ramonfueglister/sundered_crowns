// Decisions a realm can take when conditions are met (forming realms, moving capitals, reforms of faith, ...).
// `can` returns null when allowed, otherwise the reason. AI realms take a decision when `ai` returns true (or is absent).
// Effects are real: names via n.name/n.short/n.adj, laws via n.laws, modifiers, cores via s.loc.core.
import type { DecisionDef, EvApi } from '../systems/events';
import { H } from '../systems/events';
import type { Nation, I18n } from '../types';
import type { World } from '../world';
import { transferLoc } from '../systems/war';
import { addOpinion, clamp, hasTreaty, opinion } from '../ctx';
import { FAITH_INDEX, GROUP_OF, ALL_CULTURES, FAITHS } from './peoples';
import { B, BI } from '../defs';
import { chance } from '../rng';
import { INNOVATIONS } from './innovations';

// ---------------- helpers ----------------
const LATIN = FAITH_INDEX.latin;
const REFORM = [FAITH_INDEX.evangelical, FAITH_INDEX.reformed, FAITH_INDEX.anglican_type, FAITH_INDEX.hussite];
const NAMES = new WeakMap<World, Map<string, number>>();
function loc(w: World, name: string): number {
  let m = NAMES.get(w);
  if (!m) { m = new Map(); for (let i = 0; i < w.L; i++) if (!m.has(w.names[i])) m.set(w.names[i], i); NAMES.set(w, m); }
  return m.get(name) ?? -1;
}
const owns = (e: EvApi, name: string) => { const l = loc(e.w, name); return l >= 0 && e.s.loc.owner[l] === e.n.id; };
const ownsCount = (e: EvApi, names: string[]) => names.filter((x) => owns(e, x)).length;
const nat = (e: EvApi, key: string): Nation | undefined => e.s.nations.find((x) => x.key === key && x.alive);
const human = (e: EvApi, n: Nation) => e.s.playerNations.includes(n.id) || !!n.playerId;
const months = (e: EvApi, k: number) => Math.max(10, e.n.income.tax || 10) * k;
const groupOf = (culture: number) => GROUP_OF[ALL_CULTURES[culture]];
const isMonarchy = (n: Nation) => !n.gov.includes('republic') && n.gov !== 'theocracy' && n.gov !== 'military_order';
/** A settled realm with courts, towns and written government (not a tribal league or a horde). */
const settled = (n: Nation) => n.gov !== 'tribal_federation' && n.gov !== 'nomadic_horde' && n.rank !== 'chiefdom' && n.rank !== 'tribe';
function rename(n: Nation, name: I18n, short: I18n, adj: I18n, rank?: string) { n.name = name; n.short = short; n.adj = adj; if (rank) n.rank = rank; }
/** Peacefully absorb another (AI) realm: all its land, treasury and subjects pass to us. */
function annex(e: EvApi, other: Nation) {
  const s = e.s;
  for (let i = 0; i < e.w.L; i++) if (s.loc.owner[i] === other.id) { transferLoc(s, i, e.n.id); s.loc.integ[i] = 0.5; s.loc.unrest[i] = Math.min(s.loc.unrest[i], 10); s.loc.core[i] = e.n.id; }
  e.n.treasury += Math.max(0, other.treasury); other.treasury = 0;
  for (const x of s.nations) if (x.alive && x.overlord === other.id) x.overlord = e.n.id;
  other.overlord = -1; // the realm ranking retires the empty realm (armies, treaties, wars) at the next month
  s.flags.ownershipDirty = s.day;
}
/** Establish rule (cores) over every location that passes the filter; held by others it becomes a claim. */
function cores(e: EvApi, f: (l: number) => boolean) { const s = e.s; for (let i = 0; i < e.w.L; i++) if (f(i) && (s.loc.owner[i] === e.n.id || s.loc.core[i] < 0 || s.nations[s.loc.core[i]]?.alive === false)) s.loc.core[i] = e.n.id; }
function permanent(e: EvApi, id: string, label: I18n, effects: Record<string, number>) { e.fx.modifier(id, 1e6, label, effects); }
/** The realm turns to a new faith: Powers of the Realm, the Curia and the neighbours react. */
function turnFaith(e: EvApi, faith: number, convertLand: (l: number) => boolean = () => false) {
  const s = e.s, n = e.n, old = n.faith;
  n.faith = faith;
  for (let i = 0; i < e.w.L; i++) if (s.loc.owner[i] === n.id && (i === n.capital || convertLand(i))) { s.loc.minFaith[i] = s.loc.faith[i]; s.loc.minShare[i] = 0.2; s.loc.faith[i] = faith; }
  e.fx.estate('prelates', -20); e.fx.estate('burghers', 5); e.fx.concord(-10);
  if (old === LATIN && faith !== LATIN) { e.fx.gold(6); n.excommunicated = false; e.fx.removeModifier('excommunicated'); delete s.papacy.curiaFavour[n.id]; }
  if (faith === LATIN) s.papacy.curiaFavour[n.id] = 20;
  for (const o of s.nations) {
    if (!o.alive || o.id === n.id) continue;
    if (o.faith === old) addOpinion(s, o.id, n.id, 'apostasy', -20, 365 * 20);
    if (o.faith === faith) { addOpinion(s, o.id, n.id, 'brethren', 15, 365 * 20); addOpinion(s, n.id, o.id, 'brethren', 15, 365 * 20); }
  }
  n.flags.faith_changed = s.day;
}
function faithShare(e: EvApi, faith: number) { let a = 0, t = 0; for (const l of H.locs(e.s, e.n.id)) { const d = Math.max(1, e.s.loc.dev[l]); t += d; if (e.s.loc.faith[l] === faith) a += d; } return t ? a / t : 0; }
/** The reform faith that is strongest in or around our realm, or -1. */
function nearbyReform(e: EvApi): number {
  let best = -1, bv = 0;
  for (const f of [FAITH_INDEX.evangelical, FAITH_INDEX.reformed]) {
    let v = faithShare(e, f) * 10;
    for (const o of H.neighbourNations(e)) if (e.s.nations[o].faith === f) v += 1;
    if (v > bv) { bv = v; best = f; }
  }
  return bv >= 1 ? best : -1;
}
const BANKING = ['bills_of_exchange', 'double_entry'].map((k) => INNOVATIONS.findIndex((x) => x.id === k));
/** Universities in the whole world (cached per day): AI foundations follow the historical pace of roughly 20 + 0.3 per year. */
const UNI_CACHE = { day: -1, n: 0 };
function worldUniversities(e: EvApi): number {
  if (UNI_CACHE.day !== e.s.day) { let k = 0; for (let i = 0; i < e.w.L; i++) if (e.s.loc.buildings[i * B + BI.university] > 0) k++; UNI_CACHE.day = e.s.day; UNI_CACHE.n = k; }
  return UNI_CACHE.n;
}
const sitActive = (e: EvApi, id: string) => e.s.situations.some((x) => x.id === id && x.active);
const iberia = (w: World, l: number) => w.lat[l] > 36 && w.lat[l] < 43.9 && w.lon[l] > -9.6 && w.lon[l] < 3.4;

export const DECISIONS: DecisionDef[] = [
  {
    id: 'royal_progress', name: { en: 'Royal Progress', de: 'Königlicher Umritt' },
    desc: { en: 'The ruler travels the realm to show the crown. Costs gold, raises Concord and Mandate. Only for settled monarchies of at least five locations, once in five years.', de: 'Der Herrscher bereist das Reich. Kostet Gold, stärkt Eintracht und Mandat. Nur für sesshafte Monarchien mit mindestens fünf Orten, einmal in fünf Jahren.' },
    visible: (e) => isMonarchy(e.n) && settled(e.n),
    can: (e) => (e.n.flags.progress_until || 0) > e.s.day ? 'too soon' : H.locs(e.s, e.n.id).length < 5 ? 'our realm is too small for a progress' : e.n.treasury < (e.n.income.tax || 10) * 2 ? 'not enough gold' : H.atWar(e.s, e.n.id) ? 'not while at war' : null,
    effect: (e) => { e.fx.gold(-2); e.fx.concord(10); e.fx.mandate(5); e.n.flags.progress_until = e.s.day + 365 * 5; },
    ai: (e) => e.n.concord < -25 && chance(e.s.rng, 0.3),
  },

  // ---------------- forming realms ----------------
  {
    id: 'form_spain', name: { en: 'Union of the Spanish Crowns', de: 'Vereinigung der spanischen Kronen' }, once: true,
    desc: { en: 'Castile and Aragon become one kingdom of Spain. The partner crown is absorbed if it is our subject or bound to us by marriage; all of Iberia outside Portugal becomes our rightful land.', de: 'Kastilien und Aragón werden ein Königreich Spanien. Die Partnerkrone geht in uns auf, wenn sie unser Untertan oder durch Heirat an uns gebunden ist; ganz Iberien außer Portugal wird unser rechtmäßiges Land.' },
    visible: (e) => (e.n.key === 'castile' || e.n.key === 'aragon') && !e.s.flags.formed_spain,
    can: (e) => {
      if (e.n.era < 1) return 'only from the Age of Print and Horizons';
      if (e.n.overlord >= 0) return 'we are not sovereign';
      const other = nat(e, e.n.key === 'castile' ? 'aragon' : 'castile');
      if (other) {
        const bound = other.overlord === e.n.id || (hasTreaty(e.s, e.n.id, other.id, 'marriage') && opinion(e.s, other.id, e.n.id) >= 30 && e.n.score >= other.score);
        if (!bound || human(e, other)) return `${other.short.en} must be our subject or a friendly marriage partner`;
        return null;
      }
      return ownsCount(e, ['Toledo', 'Zaragoza', 'Barcelona', 'Seville']) >= 3 ? null : 'hold three of Toledo, Zaragoza, Barcelona and Seville';
    },
    effect: (e) => {
      const other = nat(e, e.n.key === 'castile' ? 'aragon' : 'castile');
      if (other && !human(e, other)) annex(e, other);
      rename(e.n, { en: 'Kingdom of Spain', de: 'Königreich Spanien' }, { en: 'Spain', de: 'Spanien' }, { en: 'Spanish', de: 'spanisch' }, 'kingdom');
      cores(e, (l) => iberia(e.w, l) && ALL_CULTURES[e.s.loc.culture[l]] !== 'portuguese');
      e.fx.prestige(20); e.fx.mandate(10); e.fx.worldFlag('formed_spain', e.s.day); e.fx.flag('formed_spain', e.s.day);
    },
  },
  {
    id: 'form_great_britain', name: { en: 'Union of the British Crowns', de: 'Vereinigung der britischen Kronen' }, once: true,
    desc: { en: 'England and Scotland become one kingdom of Great Britain, ruling all the British Isles by right.', de: 'England und Schottland werden ein Königreich Großbritannien, das rechtmäßig über alle Britischen Inseln herrscht.' },
    visible: (e) => (e.n.key === 'england' || e.n.key === 'scotland') && !e.s.flags.formed_britain,
    can: (e) => {
      if (e.n.era < 2) return 'only from the Age of Confessions';
      const other = nat(e, e.n.key === 'england' ? 'scotland' : 'england');
      if (other && other.overlord !== e.n.id) return `${other.short.en} must be our subject`;
      if (other && human(e, other)) return 'cannot absorb another ruler';
      if (!other && !(owns(e, 'London') && owns(e, 'Edinburgh'))) return 'hold London and Edinburgh';
      return null;
    },
    effect: (e) => {
      const other = nat(e, e.n.key === 'england' ? 'scotland' : 'england');
      if (other) annex(e, other);
      rename(e.n, { en: 'Kingdom of Great Britain', de: 'Königreich Großbritannien' }, { en: 'Great Britain', de: 'Großbritannien' }, { en: 'British', de: 'britisch' }, 'kingdom');
      cores(e, (l) => groupOf(e.s.loc.culture[l]) === 'british');
      e.fx.prestige(20); e.fx.worldFlag('formed_britain', e.s.day);
    },
  },
  {
    id: 'unify_italy', name: { en: 'Crown of Italy', de: 'Krone Italiens' }, once: true,
    desc: { en: 'Proclaim a kingdom of all Italy. Every Italian land becomes our rightful land.', de: 'Ein Königreich ganz Italiens ausrufen. Jedes italienische Land wird unser rechtmäßiges Land.' },
    visible: (e) => groupOf(e.n.culture) === 'italian' && e.n.gov !== 'theocracy' && !e.s.flags.formed_italy,
    can: (e) => e.n.era < 3 ? 'only in the Age of Reason' : ownsCount(e, ['Rome', 'Milan', 'Naples', 'Florence', 'Venice', 'Turin']) < 4 ? 'hold four of Rome, Milan, Naples, Florence, Venice and Turin' : e.n.overlord >= 0 ? 'we are not sovereign' : null,
    effect: (e) => {
      rename(e.n, { en: 'Kingdom of Italy', de: 'Königreich Italien' }, { en: 'Italy', de: 'Italien' }, { en: 'Italian', de: 'italienisch' }, 'kingdom');
      if (e.n.gov.includes('republic')) e.n.gov = 'feudal_monarchy';
      cores(e, (l) => groupOf(e.s.loc.culture[l]) === 'italian');
      e.fx.prestige(25); e.fx.worldFlag('formed_italy', e.s.day);
    },
  },
  {
    id: 'form_germany', name: { en: 'Kingdom of the Germans', de: 'Königreich der Deutschen' }, once: true,
    desc: { en: 'Unite the German lands under one crown. Every German land becomes our rightful land.', de: 'Die deutschen Lande unter einer Krone vereinen. Jedes deutsche Land wird unser rechtmäßiges Land.' },
    visible: (e) => groupOf(e.n.culture) === 'german' && !e.s.flags.formed_germany,
    can: (e) => e.n.era < 3 ? 'only in the Age of Reason' : ownsCount(e, ['Cologne', 'Nuremberg', 'Hamburg', 'Berlin', 'Leipzig', 'Augsburg', 'Vienna', 'Munich', 'Mainz', 'Dresden']) < 6 ? 'hold six of Cologne, Nuremberg, Hamburg, Berlin, Leipzig, Augsburg, Vienna, Munich, Mainz and Dresden' : e.n.overlord >= 0 ? 'we are not sovereign' : null,
    effect: (e) => {
      rename(e.n, { en: 'Kingdom of Germany', de: 'Königreich Deutschland' }, { en: 'Germany', de: 'Deutschland' }, { en: 'German', de: 'deutsch' }, 'kingdom');
      cores(e, (l) => groupOf(e.s.loc.culture[l]) === 'german');
      e.fx.prestige(25); e.fx.authority(50); e.fx.worldFlag('formed_germany', e.s.day);
    },
  },
  {
    id: 'proclaim_tsardom', name: { en: 'Proclaim the Tsardom', de: 'Das Zarentum ausrufen' }, once: true,
    desc: { en: 'The grand prince takes the title of Tsar of all the Rus. If the City of the Caesars has fallen, Moscow claims its mantle.', de: 'Der Großfürst nimmt den Titel eines Zaren der ganzen Rus an. Ist die Stadt der Cäsaren gefallen, beansprucht Moskau ihr Erbe.' },
    visible: (e) => e.n.key === 'moscow' && e.n.faith === FAITH_INDEX.orthodox,
    can: (e) => e.n.overlord >= 0 ? 'throw off the overlord first' : !owns(e, 'Moscow') || !owns(e, 'Novgorod') ? 'hold Moscow and Novgorod' : e.n.era < 1 && !e.s.flags.constantinople_fallen ? 'not before the Age of Print' : e.n.authority < 60 ? 'need 60 Authority' : null,
    effect: (e) => {
      rename(e.n, { en: 'Tsardom of Russia', de: 'Zarentum Russland' }, { en: 'Russia', de: 'Russland' }, { en: 'Russian', de: 'russisch' }, 'empire');
      e.fx.authority(-60); e.fx.prestige(20); e.fx.mandate(10);
      cores(e, (l) => groupOf(e.s.loc.culture[l]) === 'east_slavic' && ALL_CULTURES[e.s.loc.culture[l]] !== 'ruthenian');
      if (e.s.flags.constantinople_fallen) permanent(e, 'third_rome', { en: 'Heir of the Caesars', de: 'Erbe der Cäsaren' }, { mandate_gain: 0.05, authority_gain: 0.05 });
    },
  },
  {
    id: 'union_of_krewo', name: { en: 'Union of Poland and Lithuania', de: 'Union von Polen und Litauen' }, once: true,
    desc: { en: 'The grand duke of Lithuania marries the queen of Poland and is baptised. Lithuania enters a personal union under the Polish crown and joins the Latin Church.', de: 'Der Großfürst von Litauen heiratet die Königin von Polen und lässt sich taufen. Litauen tritt in eine Personalunion unter der polnischen Krone und schließt sich der lateinischen Kirche an.' },
    visible: (e) => (e.n.key === 'poland' || e.n.key === 'lithuania') && !e.s.flags.union_of_krewo,
    can: (e) => {
      const pl = nat(e, 'poland'), lt = nat(e, 'lithuania');
      if (!pl || !lt) return 'both crowns must exist';
      if (e.year < 1380) return 'not before 1380';
      if (pl.overlord >= 0 || lt.overlord >= 0) return 'both crowns must be sovereign';
      if (H.atWarWith(e.s, pl.id, lt.id)) return 'not while they are at war';
      const other = e.n.id === pl.id ? lt : pl;
      if (human(e, other)) return 'the other crown must agree';
      if (opinion(e.s, other.id, e.n.id) < -20) return 'relations are too poor';
      return null;
    },
    effect: (e) => {
      const pl = nat(e, 'poland')!, lt = nat(e, 'lithuania')!;
      lt.overlord = pl.id; lt.subjectType = 'personal_union'; lt.subjectSince = e.s.day; lt.libertyDesire = 10;
      if (lt.faith !== LATIN) { const old = lt.faith; lt.faith = LATIN; if (lt.capital >= 0) e.s.loc.faith[lt.capital] = LATIN; e.s.papacy.curiaFavour[lt.id] = 30; void old; }
      e.s.treaties.push({ a: Math.min(pl.id, lt.id), b: Math.max(pl.id, lt.id), type: 'alliance', since: e.s.day, until: e.s.day + 365 * 200 });
      pl.prestige = clamp(pl.prestige + 15, -100, 100); lt.mandate = clamp(lt.mandate + 10, 0, 100);
      lt.flags.dec_union_of_krewo = e.s.day; pl.flags.dec_union_of_krewo = e.s.day; e.fx.worldFlag('union_of_krewo', e.s.day);
      for (const o of e.s.nations) if (o.alive && o.faith === LATIN && o.key !== 'teutonic_order') addOpinion(e.s, o.id, lt.id, 'baptism', 20, 365 * 20);
    },
    ai: (e) => e.year >= 1385,
  },
  {
    id: 'baptism_of_the_grand_duke', name: { en: 'Baptism of the Grand Duke', de: 'Taufe des Großfürsten' }, once: true,
    desc: { en: 'The ruler and the court accept baptism in the Latin rite. The crusading orders lose their pretext; the old groves fall silent.', de: 'Der Herrscher und der Hof nehmen die Taufe nach lateinischem Ritus an. Die Kreuzritterorden verlieren ihren Vorwand; die alten Haine verstummen.' },
    visible: (e) => e.n.faith === FAITH_INDEX.baltic_old,
    can: (e) => e.n.authority < 30 ? 'need 30 Authority' : null,
    effect: (e) => {
      turnFaith(e, LATIN, (l) => e.s.loc.control[l] > 0.6 && e.s.loc.faith[l] === FAITH_INDEX.baltic_old);
      e.fx.authority(-30); e.fx.prestige(10);
      for (const o of e.s.nations) if (o.alive && o.faith === LATIN) addOpinion(e.s, o.id, e.n.id, 'baptism', 20, 365 * 20);
      const to = nat(e, 'teutonic_order'); if (to) e.fx.myOpinion(to.id, -20, 20, 'baptism');
    },
    ai: (e) => e.year >= 1386,
  },

  // ---------------- faith ----------------
  {
    id: 'adopt_reformed_faith', name: { en: 'Embrace the Reformed Teaching', de: 'Die reformierte Lehre annehmen' }, once: true,
    desc: { en: 'Follow the new teaching that has taken root in and around our lands. The crown seizes church lands (gold) but the prelates and the Curia turn against us.', de: 'Der neuen Lehre folgen, die in und um unsere Lande Wurzeln geschlagen hat. Die Krone zieht Kirchengut ein (Gold), doch die Prälaten und die Kurie wenden sich gegen uns.' },
    visible: (e) => e.n.faith === LATIN && e.n.gov !== 'theocracy' && (e.s.flags.reformation_start !== undefined),
    can: (e) => nearbyReform(e) < 0 ? 'no reformed church in or near our lands' : null,
    effect: (e) => { const f = nearbyReform(e); if (f >= 0) { turnFaith(e, f, (l) => e.s.loc.faith[l] === LATIN && e.s.loc.control[l] > 0.7 && (l * 7) % 3 === 0); e.fx.authority(25); } },
    ai: () => false, // AI realms decide inside the Reformation situation
  },
  {
    id: 'return_to_the_old_church', name: { en: 'Return to the Old Church', de: 'Rückkehr zur alten Kirche' }, once: true,
    desc: { en: 'Most of our people still follow the Latin rite. Make peace with the Curia and restore the old church.', de: 'Der größte Teil unseres Volkes folgt noch dem lateinischen Ritus. Frieden mit der Kurie schließen und die alte Kirche wiederherstellen.' },
    visible: (e) => REFORM.includes(e.n.faith),
    can: (e) => faithShare(e, LATIN) < 0.5 ? 'most of our land must be of the Latin rite' : e.n.authority < 50 ? 'need 50 Authority' : null,
    effect: (e) => { turnFaith(e, LATIN); e.fx.authority(-50); e.fx.estate('prelates', 30); },
    ai: (e) => faithShare(e, LATIN) > 0.65,
  },
  {
    id: 'national_church', name: { en: 'Crown over Church', de: 'Krone über Kirche' }, once: true,
    desc: { en: 'Break with the Curia and declare the ruler supreme head of a national church. Church courts and revenues pass to the crown.', de: 'Mit der Kurie brechen und den Herrscher zum obersten Haupt einer Nationalkirche erklären. Kirchengerichte und Einkünfte gehen an die Krone.' },
    visible: (e) => e.n.faith === LATIN && (e.n.rank === 'kingdom' || e.n.rank === 'empire') && e.s.flags.reformation_start !== undefined,
    can: (e) => (e.s.papacy.curiaFavour[e.n.id] ?? 0) >= 40 && !e.n.excommunicated ? 'we are still in good standing with the Curia' : e.n.authority < 100 ? 'need 100 Authority' : e.n.mandate < 50 ? 'need 50 Mandate' : null,
    effect: (e) => {
      turnFaith(e, FAITH_INDEX.anglican_type, (l) => e.s.loc.faith[l] === LATIN && e.s.loc.culture[l] === e.n.culture);
      e.fx.authority(-100);
      permanent(e, 'crown_over_church', { en: 'Crown over church', de: 'Krone über Kirche' }, { mandate_gain: 0.05, authority_gain: 0.1 });
    },
    ai: (e) => (e.s.papacy.curiaFavour[e.n.id] ?? 0) < 15 && e.n.mandate > 55 && e.s.day - (e.s.flags.reformation_start ?? e.s.day) > 365 * 10 && !e.n.isHRE && chance(e.s.rng, 0.3),
  },
  {
    id: 'obedience_rome', name: { en: 'Obedience to the Roman Pope', de: 'Obödienz zum römischen Papst' },
    desc: { en: 'Recognise the pope in Rome during the division of the Church.', de: 'Während der Kirchenspaltung den Papst in Rom anerkennen.' },
    visible: (e) => e.s.papacy.schism && e.n.faith === LATIN && e.n.flags.obedience === 1,
    can: (e) => (e.n.flags.obedience_until || 0) > e.s.day ? 'too soon' : e.n.authority < 20 ? 'need 20 Authority' : null,
    effect: (e) => { e.n.flags.obedience = 0; e.n.flags.obedience_until = e.s.day + 3650; e.fx.authority(-20); if (e.s.papacy.antipope >= 0) e.fx.opinion(e.s.papacy.antipope, -20, 10, 'obedience'); if (e.s.papacy.holder >= 0) e.fx.opinion(e.s.papacy.holder, 20, 10, 'obedience'); },
    ai: () => false,
  },
  {
    id: 'obedience_avignon', name: { en: 'Obedience to the Pope of Avignon', de: 'Obödienz zum Papst von Avignon' },
    desc: { en: 'Recognise the pope in Avignon during the division of the Church.', de: 'Während der Kirchenspaltung den Papst in Avignon anerkennen.' },
    visible: (e) => e.s.papacy.schism && e.s.papacy.antipope >= 0 && e.n.faith === LATIN && e.n.flags.obedience !== 1,
    can: (e) => (e.n.flags.obedience_until || 0) > e.s.day ? 'too soon' : e.n.authority < 20 ? 'need 20 Authority' : null,
    effect: (e) => { e.n.flags.obedience = 1; e.n.flags.obedience_until = e.s.day + 3650; e.fx.authority(-20); if (e.s.papacy.antipope >= 0) e.fx.opinion(e.s.papacy.antipope, 20, 10, 'obedience'); if (e.s.papacy.holder >= 0) e.fx.opinion(e.s.papacy.holder, -20, 10, 'obedience'); },
    ai: () => false,
  },

  // ---------------- government ----------------
  {
    id: 'found_university', name: { en: 'Found a University', de: 'Eine Universität gründen' },
    desc: { en: 'Endow a studium generale in our greatest town without one (development 15 or more). Needs Commerce & Learning 3, a capital of development 15 and 12 months of taxes; at most one foundation in 30 years, and one university plus one per 30 locations.', de: 'Ein Studium generale in unserer größten Stadt ohne Universität stiften (Entwicklung 15 oder mehr). Erfordert Handel & Gelehrsamkeit 3, eine Hauptstadt mit Entwicklung 15 und 12 Monatssteuern; höchstens eine Gründung in 30 Jahren und eine Universität plus eine je 30 Orte.' },
    visible: (e) => settled(e.n) && e.n.capital >= 0 && H.locs(e.s, e.n.id).length >= 5,
    can: (e) => (e.n.flags.university_until || 0) > e.s.day ? 'too soon after the last foundation'
      : e.n.tech[1] < 3 ? 'need Commerce & Learning 3'
      : e.s.loc.dev[e.n.capital] < 15 ? 'our capital must reach development 15'
      : e.n.treasury < months(e, 12) ? 'not enough gold (12 months of taxes)'
      : H.locs(e.s, e.n.id).filter((l) => e.s.loc.buildings[l * B + BI.university] > 0).length >= 1 + Math.floor(H.locs(e.s, e.n.id).length / 30) ? 'our realm already has as many universities as it can sustain (one, and one more per 30 locations)'
      : H.biggestLoc(e, (l) => e.s.loc.buildings[l * B + BI.university] === 0 && e.s.loc.dev[l] >= 15) < 0 ? 'no town large enough without a university' : null,
    effect: (e) => {
      const l = H.biggestLoc(e, (x) => e.s.loc.buildings[x * B + BI.university] === 0 && e.s.loc.dev[x] >= 15);
      if (l < 0) return;
      e.fx.gold(-12); e.fx.building(l, BI.university, 1); e.fx.prestige(3); e.fx.estate('prelates', 5);
      e.n.flags.university_until = e.s.day + 365 * 30;
      e.fx.chronicle({ en: `A university was founded in ${e.w.names[l]}.`, de: `In ${e.w.namesDe[l]} wurde eine Universität gegründet.` }, l);
    },
    ai: (e) => e.n.treasury > months(e, 30) && !H.atWar(e.s, e.n.id) && H.locs(e.s, e.n.id).length >= 12 && worldUniversities(e) < 20 + (e.year - 1356) * 0.3 && chance(e.s.rng, 0.05),
  },
  {
    id: 'move_capital', name: { en: 'Move the Capital', de: 'Die Hauptstadt verlegen' },
    desc: { en: 'Move the seat of government to our richest town. Costs Authority and gold; the old capital resents it.', de: 'Den Regierungssitz in unsere reichste Stadt verlegen. Kostet Autorität und Gold; die alte Hauptstadt grollt.' },
    visible: (e) => e.n.capital >= 0,
    can: (e) => {
      if ((e.n.flags.capital_moved || -1e9) > e.s.day - 365 * 50) return 'the capital was moved recently';
      if (H.atWar(e.s, e.n.id)) return 'not while at war';
      const b = H.biggestLoc(e); if (b < 0 || b === e.n.capital) return 'the capital is already our greatest town';
      if (e.s.loc.dev[e.n.capital] > e.s.loc.dev[b] * 0.6) return 'the capital is still great enough';
      return e.n.authority < 50 ? 'need 50 Authority' : e.n.treasury < months(e, 4) ? 'not enough gold' : null;
    },
    effect: (e) => {
      const b = H.biggestLoc(e), old = e.n.capital;
      e.n.capital = b; e.fx.authority(-50); e.fx.gold(-4); e.fx.concord(-5); e.fx.unrest(old, 10);
      e.n.flags.capital_moved = e.s.day; e.s.flags.ownershipDirty = e.s.day;
      e.fx.chronicle({ en: `The court moved from ${e.w.names[old]} to ${e.w.names[b]}.`, de: `Der Hof zog von ${e.w.namesDe[old]} nach ${e.w.namesDe[b]}.` }, b);
    },
    ai: (e) => { const b = H.biggestLoc(e); return b >= 0 && H.locs(e.s, e.n.id).length >= 8 && e.s.loc.dev[e.n.capital] < e.s.loc.dev[b] * 0.35 && chance(e.s.rng, 0.15); },
  },
  {
    id: 'codify_laws', name: { en: 'Codify the Laws', de: 'Die Gesetze kodifizieren' }, once: true,
    desc: { en: 'Learned jurists gather the customs of the land into one written code under royal courts of learned law.', de: 'Gelehrte Juristen fassen die Gewohnheiten des Landes in ein geschriebenes Gesetzbuch unter königlichen Gerichten gelehrten Rechts.' },
    visible: () => true,
    can: (e) => e.n.tech[0] < 10 ? 'need Governance 10' : e.n.authority < 80 ? 'need 80 Authority' : H.locs(e.s, e.n.id).length < 8 ? 'our realm is too small for a code of laws' : null,
    effect: (e) => {
      e.n.laws.justice = Math.max(e.n.laws.justice ?? 0, 2);
      e.fx.authority(-80); e.fx.estate('magnates', -10); e.fx.estate('prelates', 3);
      permanent(e, 'codified_law', { en: 'Codified law', de: 'Kodifiziertes Recht' }, { control: 0.05, admin: 0.05 });
    },
    ai: (e) => e.n.authority >= 120 && H.locs(e.s, e.n.id).length >= 30 && chance(e.s.rng, 0.02),
  },
  {
    id: 'convene_estates', name: { en: 'Convene the Estates General', de: 'Die Generalstände einberufen' },
    desc: { en: 'Summon the Powers of the Realm to grant taxes and air their grievances. Brings gold and Concord, but the crown must listen.', de: 'Die Mächte des Reiches einberufen, um Steuern zu bewilligen und Beschwerden vorzubringen. Bringt Gold und Eintracht, doch die Krone muss zuhören.' },
    visible: (e) => isMonarchy(e.n) && settled(e.n),
    can: (e) => (e.n.flags.estates_until || 0) > e.s.day ? 'the estates met recently' : H.locs(e.s, e.n.id).length < 5 ? 'our realm is too small for estates general' : e.n.concord >= 10 && e.n.treasury >= 0 ? 'no need: the realm is calm and solvent' : null,
    effect: (e) => {
      e.fx.gold(6); e.fx.concord(10); e.fx.authority(-30);
      for (const id of ['magnates', 'prelates', 'burghers', 'commons']) e.fx.estate(id, 5, id === 'burghers' || id === 'magnates' ? 3 : 0);
      if ((e.n.laws.diet ?? 1) === 0) e.n.laws.diet = 1;
      e.n.flags.estates_until = e.s.day + 365 * 20;
    },
    ai: (e) => H.locs(e.s, e.n.id).length >= 10 && (e.n.concord < -40 || (e.n.treasury < 0 && e.n.debt > months(e, 12))) && chance(e.s.rng, 0.1),
  },
  {
    id: 'absolute_monarchy', name: { en: 'Proclaim Sovereign Rule', de: 'Unumschränkte Herrschaft ausrufen' }, once: true,
    desc: { en: 'The crown rules without the estates: no assembly, one will, one administration.', de: 'Die Krone herrscht ohne die Stände: keine Versammlung, ein Wille, eine Verwaltung.' },
    visible: (e) => isMonarchy(e.n) && e.n.gov !== 'absolute_monarchy' && e.n.gov !== 'nomadic_horde' && e.n.gov !== 'tribal_federation',
    can: (e) => {
      if (e.n.era < 2) return 'only from the Age of Confessions and Absolutism';
      if (e.n.authority < 150) return 'need 150 Authority';
      if (e.n.mandate < 60) return 'need 60 Mandate';
      const m = e.n.estates.find((x) => x.id === 'magnates'); if (m && m.influence >= 50) return 'the magnates are too powerful';
      return null;
    },
    effect: (e) => {
      e.n.gov = 'absolute_monarchy';
      if (e.n.laws.diet !== undefined) e.n.laws.diet = 0;
      e.fx.authority(-150); e.fx.concord(-10); e.fx.estate('magnates', -15, -5); e.fx.estate('burghers', -10);
      permanent(e, 'absolute_rule', { en: 'Sovereign rule', de: 'Unumschränkte Herrschaft' }, { authority_gain: 0.2, control: 0.05, admin: 0.05 });
    },
    ai: (e) => (e.n.rank === 'kingdom' || e.n.rank === 'empire') && H.locs(e.s, e.n.id).length >= 20 && chance(e.s.rng, 0.04),
  },
  {
    id: 'abolish_serfdom', name: { en: 'Abolish Serfdom', de: 'Die Leibeigenschaft aufheben' }, once: true,
    desc: { en: 'Free the peasants from bondage to the soil. The magnates rage; the commons and the treasury gain in the long run.', de: 'Die Bauern aus der Bindung an die Scholle befreien. Die Magnaten toben; die Gemeinen und die Staatskasse gewinnen auf Dauer.' },
    visible: (e) => (e.n.laws.serfdom ?? 0) > 0,
    can: (e) => e.n.era < 3 ? 'only in the Age of Reason' : e.n.authority < 100 ? 'need 100 Authority' : e.n.reform ? 'a reform is already under way' : null,
    effect: (e) => {
      e.n.laws.serfdom = 0;
      e.fx.authority(-100); e.fx.estate('magnates', -20, -5); e.fx.estate('commons', 25, 5);
      e.fx.modifier('emancipation', 25, { en: 'Emancipation of the peasants', de: 'Bauernbefreiung' }, { unrest: -2, production: 0.04 });
    },
    ai: (e) => e.year >= 1770 && e.n.authority >= 150 && e.n.tech[0] >= 26 && H.locs(e.s, e.n.id).length >= 20 && (e.n.estates.find((x) => x.id === 'magnates')?.influence ?? 50) < 40 && chance(e.s.rng, 0.01),
  },

  // ---------------- economy and the sea ----------------
  {
    id: 'charter_public_bank', name: { en: 'Charter a Public Bank', de: 'Eine öffentliche Bank gründen' }, once: true,
    desc: { en: 'A bank of deposit under public guarantee lends to the crown at low interest.', de: 'Eine Depositenbank unter öffentlicher Bürgschaft leiht der Krone zu niedrigem Zins.' },
    visible: (e) => (e.n.estates.find((x) => x.id === 'burghers')?.influence ?? 0) >= 15,
    can: (e) => e.n.era < 1 ? 'only from the Age of Print and Horizons' : e.n.tech[1] < 10 ? 'need Commerce & Learning 10' : !e.n.innovations.includes(BANKING[0]) || !e.n.innovations.includes(BANKING[1]) ? 'we must know bills of exchange and double-entry bookkeeping' : e.n.treasury < months(e, 8) ? 'not enough gold' : null,
    effect: (e) => { e.fx.gold(-8); e.fx.estate('burghers', 10, 3); permanent(e, 'public_bank', { en: 'Public bank', de: 'Öffentliche Bank' }, { interest: 0.01, trade: 0.03 }); },
    ai: (e) => e.n.treasury > months(e, 14) && (e.n.estates.find((x) => x.id === 'burghers')?.influence ?? 0) >= 25 && H.locs(e.s, e.n.id).length >= 15 && chance(e.s.rng, 0.02),
  },
  {
    id: 'found_admiralty', name: { en: 'Found an Admiralty', de: 'Eine Admiralität gründen' }, once: true,
    desc: { en: 'A board of admiralty with dockyards, pilots and charts. Fleets keep the sea longer and reach further.', de: 'Ein Admiralitätsamt mit Werften, Lotsen und Seekarten. Flotten halten länger See und reichen weiter.' },
    visible: (e) => e.n.capital >= 0 && H.locs(e.s, e.n.id).some((l) => e.w.coastal[l] === 1),
    can: (e) => e.n.era < 1 ? 'only from the Age of Print and Horizons' : H.locs(e.s, e.n.id).length < 5 ? 'our realm is too small for an admiralty' : !H.locs(e.s, e.n.id).some((l) => e.s.loc.buildings[l * B + BI.port] > 0) ? 'need a harbour' : e.n.treasury < months(e, 6) ? 'not enough gold' : null,
    effect: (e) => { e.fx.gold(-6); permanent(e, 'admiralty', { en: 'Admiralty', de: 'Admiralität' }, { attrition: -0.05, colonial_range: 0.05, trade: 0.02 }); },
    ai: (e) => e.n.treasury > months(e, 12) && e.w.coastal[e.n.capital] === 1 && H.locs(e.s, e.n.id).length >= 15 && chance(e.s.rng, 0.05),
  },
  {
    id: 'found_trading_company', name: { en: 'Charter a Trading Company', de: 'Eine Handelskompanie privilegieren' }, once: true,
    desc: { en: 'Merchants receive a royal charter and a monopoly for trade beyond the sea; shares gather the capital.', de: 'Kaufleute erhalten einen königlichen Freibrief und ein Monopol für den Handel jenseits des Meeres; Anteile sammeln das Kapital.' },
    visible: (e) => H.locs(e.s, e.n.id).some((l) => e.w.coastal[l] === 1),
    can: (e) => e.n.era < 2 ? 'only from the Age of Confessions' : H.locs(e.s, e.n.id).length < 5 ? 'our realm is too small for a trading company' : e.n.tech[1] < 14 ? 'need Commerce & Learning 14' : e.n.treasury < months(e, 10) ? 'not enough gold' : null,
    effect: (e) => {
      e.fx.gold(-10); e.fx.estate('burghers', 10, 5);
      if (e.n.laws.colonies !== undefined) e.n.laws.colonies = Math.max(e.n.laws.colonies, 2);
      permanent(e, 'trading_company', { en: 'Chartered trading company', de: 'Privilegierte Handelskompanie' }, { trade: 0.06, colonial_growth: 0.15, colonists: 1 });
    },
    ai: (e) => e.n.treasury > months(e, 15) && H.locs(e.s, e.n.id).length >= 15 && ((e.n.doctrines.seafaring || 0) > 2 || (e.n.laws.colonies ?? 0) > 0) && chance(e.s.rng, 0.05),
  },
];
void FAITHS; void iberia;
