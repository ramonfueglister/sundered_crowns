// What an event option does, found by trying it: the option is answered on a copy of the state (copied lazily, piece by
// piece, as the option touches it), and the copy is compared with the real state. The real state and its random number
// generator are never written: every object the option reaches is a fresh copy. Options that draw random numbers are
// tried with three different seeds, and values that differ are shown as ranges.
import type { GameState, Nation, Character, I18n, Relation, Treaty, War, Army, PendingEvent, Notice } from '../sim/types';
import type { World } from '../sim/world';
import { answerEvent, eventDef, interpolate, type EvApi, Effects } from '../sim/systems/events';
import { EVENTS } from '../sim/content/events';
import { BUILDINGS, B, C } from '../sim/defs';
import { ESTATES, PRIVILEGES } from '../sim/systems/politics';
import { LAWS, VALUES } from '../sim/content/laws';
import { FAITHS, ALL_CULTURES, cultureLabel } from '../sim/content/peoples';
import { techCost, BRANCHES } from '../sim/systems/progress';
import { SITUATIONS } from '../sim/content/situations';
import { dayToDate } from '../sim/calendar';
import { hash01 } from '../sim/rng';
import { REFUSAL_COOLDOWN } from '../sim/systems/diplomacy';

/**
 * One line of an option's effects. `label` holds `{v}` where the value goes (the UI formats it in the player's
 * language, as a range when the trials differ); `unit` says how: int, pct (fraction shown in %), dec. `tone` +1 means
 * more is good for the player, -1 bad, 0 neither. `share` < 1: the line appeared only in some trials (a possible
 * outcome). `from`/`to`: the value before and after (first trial), for the breakdown tooltip. A modifier line carries
 * its effects for the UI's effect table; `{t:key}` in a label is a key of the UI text table.
 */
export interface FxLine {
  key: string; label: I18n; v?: number; lo?: number; hi?: number; unit?: 'int' | 'pct' | 'dec'; tone: number; share: number;
  from?: number; to?: number; years?: number; effects?: Record<string, number>; vals?: number[];
}
export interface OptionFx { lines: FxLine[]; random: boolean; trials: number; ms: number }

// ---------------------------------------------------------------- lazy copy of the state
type AnyObj = Record<string | symbol, any>;
const isIndex = (k: string | symbol) => typeof k === 'string' && k !== '' && (k as any) >>> 0 === +k;

/**
 * A view that reads the original and refuses every write (a write throws; the event code catches it). Used to test
 * event triggers, which only read, without copying every realm they look at. Typed arrays are handed out as copies.
 */
const RO = new WeakMap<object, any>();
export function readOnly<T>(x: T): T {
  if (x === null || typeof x !== 'object') return x;
  if (ArrayBuffer.isView(x)) return (x as any).slice();
  let p = RO.get(x as any); if (p) return p;
  p = new Proxy(x as any, {
    get(t, k) { const v = Reflect.get(t, k, t); return v !== null && typeof v === 'object' ? readOnly(v) : v; },
    set() { throw new Error('read-only'); }, deleteProperty() { throw new Error('read-only'); }, defineProperty() { throw new Error('read-only'); },
  });
  RO.set(x as any, p); return p;
}

/** An array whose elements are copied the first time they are read; the shell is a fresh array. */
class LazyArr<T> {
  copied = new Map<number, T>();
  proxy: T[];
  constructor(public orig: T[], public clone: (x: T) => T) {
    const shell = orig.slice();
    const copied = this.copied; const self = this;
    this.proxy = new Proxy(shell, {
      get(t, k, r) {
        if (isIndex(k)) {
          const i = +(k as string); const v = t[i];
          if (v !== null && typeof v === 'object' && i < orig.length && v === orig[i] && !copied.has(i)) { const c = self.clone(v); copied.set(i, c); t[i] = c; return c; }
          return v;
        }
        return Reflect.get(t, k, r);
      },
    });
  }
}
/** A record whose values are copied the first time they are read; the shell is a fresh object. */
class LazyRec<T> {
  copied = new Map<string, T>();
  proxy: Record<string, T>;
  constructor(public orig: Record<string, T>, public clone: (x: T) => T) {
    const shell: Record<string, T> = { ...orig };
    const copied = this.copied; const self = this;
    this.proxy = new Proxy(shell, {
      get(t, k, r) {
        if (typeof k === 'string' && Object.prototype.hasOwnProperty.call(t, k)) {
          const v = t[k];
          if (v !== null && typeof v === 'object' && v === orig[k] && !copied.has(k)) { const c = self.clone(v); copied.set(k, c); t[k] = c; return c; }
          return v;
        }
        return Reflect.get(t, k, r);
      },
      getOwnPropertyDescriptor(t, k) {
        const d = Reflect.getOwnPropertyDescriptor(t, k);
        if (d && typeof k === 'string') { const v = (this as any).get(t, k, t); d.value = v; }
        return d;
      },
    });
  }
}
const cloneNation = (n: Nation): Nation => { const h = n.history; const c = structuredClone({ ...n, history: [] }) as Nation; c.history = h; return c; };
const cloneTA = (a: any) => (ArrayBuffer.isView(a) ? (a as any).slice() : structuredClone(a));

/**
 * A view of the state that copies on first touch; `parts` keeps the copies for the comparison. `ro`: what is touched
 * from now on is only read (see freeze), for testing triggers.
 */
function lazyState(s: GameState, ro0 = false) {
  const shadow: AnyObj = {};
  const parts: { nations?: LazyArr<Nation>; chars?: LazyRec<Character>; loc?: LazyRec<any>; rel?: LazyRec<Relation>; armies?: LazyArr<Army>; treaties?: LazyArr<Treaty>; markets?: LazyArr<any> } = {};
  const mode = { ro: ro0 };
  const cl = <T,>(f: (x: T) => T) => (x: T): T => (mode.ro ? readOnly(x) : f(x));
  const st = new Proxy(s as unknown as AnyObj, {
    get(t, k) {
      if (k in shadow) return shadow[k];
      const v = t[k as any];
      if (v === null || typeof v !== 'object') return v;
      let c: any;
      switch (k) {
        case 'nations': c = (parts.nations = new LazyArr(v, cl(cloneNation))).proxy; break;
        case 'chars': c = (parts.chars = new LazyRec(v, cl((x: Character) => structuredClone(x)))).proxy; break;
        case 'loc': c = (parts.loc = new LazyRec(v, cloneTA)).proxy; break;
        case 'rel': c = (parts.rel = new LazyRec(v, cl((x: Relation) => structuredClone(x)))).proxy; break;
        case 'armies': c = (parts.armies = new LazyArr(v, cl((x: Army) => structuredClone(x)))).proxy; break;
        case 'treaties': c = (parts.treaties = new LazyArr(v, cl((x: Treaty) => ({ ...x })))).proxy; break;
        case 'markets': c = (parts.markets = new LazyArr(v, cl((x: any) => structuredClone(x)))).proxy; break;
        case 'chronicle': case 'notices': case 'timelapse': c = v.slice(); break; // entries are only pushed or dropped, never edited
        default: c = structuredClone(v);
      }
      shadow[k] = c; return c;
    },
    set(_t, k, v) { shadow[k] = v; return true; },
    has(t, k) { return k in shadow || k in t; },
    deleteProperty(_t, k) { shadow[k] = undefined; return true; },
  }) as unknown as GameState;
  return { st, shadow, parts, mode };
}

// ---------------------------------------------------------------- one trial
interface Fact { key: string; label: I18n; v?: number; unit?: FxLine['unit']; tone: number; from?: number; to?: number; years?: number; effects?: Record<string, number> }
const T = (en: string, de: string): I18n => ({ en, de });
const fill = (l: I18n, a: Record<string, string | I18n>): I18n => {
  const r = (str: string, lang: 'en' | 'de') => str.replace(/\{(\w+)\}/g, (m, k) => (k in a ? (typeof a[k] === 'string' ? (a[k] as string) : (a[k] as I18n)[lang]) : m));
  return { en: r(l.en, 'en'), de: r(l.de, 'de') };
};
const locN = (w: World, l: number): I18n => ({ en: w.names[l] ?? `#${l}`, de: w.namesDe[l] ?? w.names[l] ?? `#${l}` });
const natN = (s: GameState, k: number): I18n => s.nations[k]?.short ?? { en: '?', de: '?' };
const yearsLeft = (s: GameState, until: number) => (until > s.day && until < s.day + 365 * 200 ? Math.round((until - s.day) / 36.5) / 10 : undefined);

const NATION_NUM: [keyof Nation, I18n, FxLine['unit'], number][] = [
  ['treasury', T('{v} gold', '{v} Gold'), 'int', 1], ['manpower', T('{v} manpower', '{v} Wehrkraft'), 'int', 1], ['sailors', T('{v} sailors', '{v} Seeleute'), 'int', 1],
  ['prestige', T('Prestige {v}', 'Ansehen {v}'), 'dec', 1], ['concord', T('Concord {v}', 'Eintracht {v}'), 'dec', 1], ['mandate', T('Mandate {v}', 'Mandat {v}'), 'dec', 1],
  ['authority', T('Authority {v}', 'Autorität {v}'), 'dec', 1], ['warExhaustion', T('War exhaustion {v}', 'Kriegsmüdigkeit {v}'), 'dec', -1],
  ['inflation', T('Inflation {v}', 'Inflation {v}'), 'pct', -1], ['corruption', T('Corruption {v}', 'Korruption {v}'), 'pct', -1], ['dread', T('Dread {v}', 'Furcht {v}'), 'dec', -1],
  ['debt', T('Debt {v}', 'Schulden {v}'), 'int', -1], ['maxManpower', T('Manpower limit {v}', 'Wehrkraftgrenze {v}'), 'int', 1], ['libertyDesire', T('Wish for liberty {v}', 'Freiheitsdrang {v}'), 'dec', 0],
];
const TREATY: Record<string, I18n> = { alliance: T('Alliance', 'Bündnis'), marriage: T('Royal marriage', 'Königliche Heirat'), access: T('Military access', 'Durchmarschrecht'), guarantee: T('Guarantee', 'Garantie'),
  trade: T('Trade agreement', 'Handelsabkommen'), truce: T('Truce', 'Waffenstillstand'), tribute: T('Tribute', 'Tribut'), claim: T('Claim', 'Anspruch') };
const SKILL: I18n[] = [T('Governance', 'Verwaltung'), T('Statecraft', 'Staatskunst'), T('Generalship', 'Feldherrnkunst')];
/** Location fields compared, with their label and unit; `pop` is compared as the location's total. */
const LOC_FIELDS: [string, I18n, I18n, FxLine['unit'], number][] = [
  ['unrest', T('Unrest in {loc} {v}', 'Unruhe in {loc} {v}'), T('Unrest in {k} locations {v}', 'Unruhe in {k} Orten {v}'), 'dec', -1],
  ['dev', T('Development of {loc} {v}', 'Entwicklung von {loc} {v}'), T('Development in {k} locations {v}', 'Entwicklung in {k} Orten {v}'), 'dec', 1],
  ['devast', T('Devastation in {loc} {v}', 'Verwüstung in {loc} {v}'), T('Devastation in {k} locations {v}', 'Verwüstung in {k} Orten {v}'), 'pct', -1],
  ['plague', T('Plague in {loc} {v}', 'Pest in {loc} {v}'), T('Plague in {k} locations {v}', 'Pest in {k} Orten {v}'), 'pct', -1],
  ['control', T('Control of {loc} {v}', 'Kontrolle über {loc} {v}'), T('Control of {k} locations {v}', 'Kontrolle über {k} Orte {v}'), 'pct', 1],
  ['integ', T('Integration of {loc} {v}', 'Eingliederung von {loc} {v}'), T('Integration of {k} locations {v}', 'Eingliederung von {k} Orten {v}'), 'pct', 1],
  ['literacy', T('Literacy in {loc} {v}', 'Bildung in {loc} {v}'), T('Literacy in {k} locations {v}', 'Bildung in {k} Orten {v}'), 'pct', 1],
  ['harvest', T('Harvest in {loc} {v}', 'Ernte in {loc} {v}'), T('Harvest in {k} locations {v}', 'Ernte in {k} Orten {v}'), 'pct', 1],
  ['garrison', T('Garrison of {loc} {v}', 'Besatzung von {loc} {v}'), T('Garrison in {k} locations {v}', 'Besatzung in {k} Orten {v}'), 'int', 1],
];

function diff(s: GameState, w: World, nid: number, lz: ReturnType<typeof lazyState>, notices0: number): Fact[] {
  const out: Fact[] = [];
  const { st, shadow, parts } = lz;
  const me = s.nations[nid];
  const add = (f: Fact) => { if (f.v === undefined || Math.abs(f.v) > 1e-6) out.push(f); };
  // ---- the realm's own numbers
  const n2 = parts.nations?.copied.get(nid);
  if (n2) {
    for (const [k, label, unit, tone] of NATION_NUM) { const a = me[k] as number, b = n2[k] as number; if (typeof a === 'number' && typeof b === 'number' && Math.abs(b - a) > (unit === 'pct' ? 1e-4 : 0.05)) add({ key: `n.${String(k)}`, label, v: b - a, unit, tone, from: a, to: b }); }
    const ins0 = me.flags.doctrine_pts || 0, ins1 = n2.flags.doctrine_pts || 0;
    if (Math.abs(ins1 - ins0) > 0.05) add({ key: 'n.insight', label: T('Insight {v}', 'Einsicht {v}'), v: ins1 - ins0, unit: 'dec', tone: 1, from: ins0, to: ins1 });
    for (let b = 0; b < 3; b++) {
      if (n2.tech[b] !== me.tech[b]) add({ key: `n.tech${b}`, label: fill(T('{b} level {v}', '{b} Stufe {v}'), { b: BRANCHES[b]?.name ?? SKILL[b] }), v: n2.tech[b] - me.tech[b], unit: 'int', tone: 1 });
      else if (Math.abs(n2.techProgress[b] - me.techProgress[b]) > 0.01) { const cost = Math.max(1, techCost(s, me, b)); add({ key: `n.techp${b}`, label: fill(T('Progress in {b} {v} of a level', 'Fortschritt in {b} {v} einer Stufe'), { b: BRANCHES[b]?.name ?? SKILL[b] }), v: (n2.techProgress[b] - me.techProgress[b]) / cost, unit: 'pct', tone: 1 }); }
    }
    VALUES.forEach((a, k) => { const d = (n2.values[k] || 0) - (me.values[k] || 0); if (Math.abs(d) > 0.05) add({ key: `n.val${k}`, label: fill(T('{lo} / {hi} {v}', '{lo} / {hi} {v}'), { lo: a.low, hi: a.high }), v: d, unit: 'dec', tone: 0, from: me.values[k] || 0, to: n2.values[k] || 0 }); });
    for (const L of LAWS) { const a = me.laws[L.id], b = n2.laws[L.id]; if (a !== b && b !== undefined && L.options[b]) out.push({ key: `n.law.${L.id}`, label: fill(T('Law: {law} becomes “{opt}”', 'Gesetz: {law} wird „{opt}“'), { law: L.name, opt: L.options[b].name }), tone: 0 }); }
    if (n2.faith !== me.faith) out.push({ key: 'n.faith', label: fill(T('The realm turns to {f}', 'Das Reich wechselt zu {f}'), { f: FAITHS[n2.faith]?.name ?? '?' }), tone: 0 });
    if (n2.gov !== me.gov) out.push({ key: 'n.gov', label: T('The form of government changes', 'Die Regierungsform ändert sich'), tone: 0 });
    if (n2.capital !== me.capital && n2.capital >= 0) out.push({ key: 'n.capital', label: fill(T('Capital moves to {loc}', 'Hauptstadt wird {loc}'), { loc: locN(w, n2.capital) }), tone: 0 });
    if (n2.overlord !== me.overlord) out.push({ key: 'n.overlord', label: n2.overlord >= 0 ? fill(T('We become a subject of {x}', 'Wir werden Untertan von {x}'), { x: natN(s, n2.overlord) }) : T('We are free of our overlord', 'Wir sind frei von unserem Oberherrn'), tone: n2.overlord >= 0 ? -1 : 1 });
    if (n2.excommunicated !== me.excommunicated) out.push({ key: 'n.excom', label: n2.excommunicated ? T('The ruler is cast out of the Church', 'Der Herrscher wird gebannt') : T('The ban of the Church is lifted', 'Der Kirchenbann wird aufgehoben'), tone: n2.excommunicated ? -1 : 1 });
    for (const e2 of n2.estates) {
      const e1 = me.estates.find((x) => x.id === e2.id); if (!e1) continue; const nm = ESTATES.find((x) => x.id === e2.id)?.name ?? T(e2.id, e2.id);
      if (Math.abs(e2.contentment - e1.contentment) > 0.05) add({ key: `n.est.${e2.id}.c`, label: fill(T('{e}: contentment {v}', '{e}: Zufriedenheit {v}'), { e: nm }), v: e2.contentment - e1.contentment, unit: 'dec', tone: 1, from: e1.contentment, to: e2.contentment });
      if (Math.abs(e2.influence - e1.influence) > 0.05) add({ key: `n.est.${e2.id}.i`, label: fill(T('{e}: influence {v}', '{e}: Einfluss {v}'), { e: nm }), v: e2.influence - e1.influence, unit: 'dec', tone: 0, from: e1.influence, to: e2.influence });
      for (const p of e2.privileges) if (!e1.privileges.includes(p)) out.push({ key: `n.priv+${p}`, label: fill(T('Privilege granted: {p}', 'Vorrecht gewährt: {p}'), { p: PRIVILEGES.find((x) => x.id === p)?.name ?? p }), tone: 0 });
      for (const p of e1.privileges) if (!e2.privileges.includes(p)) out.push({ key: `n.priv-${p}`, label: fill(T('Privilege revoked: {p}', 'Vorrecht entzogen: {p}'), { p: PRIVILEGES.find((x) => x.id === p)?.name ?? p }), tone: 0 });
    }
    for (const m of n2.modifiers) {
      const o = me.modifiers.find((x) => x.id === m.id);
      if (o && o.until === m.until && JSON.stringify(o.effects) === JSON.stringify(m.effects)) continue;
      out.push({ key: `n.mod.${m.id}`, label: fill(T('“{m}”', '„{m}“'), { m: m.label }), tone: 0, years: yearsLeft(s, m.until), effects: m.effects });
    }
    for (const m of me.modifiers) if (!n2.modifiers.some((x) => x.id === m.id)) out.push({ key: `n.mod-${m.id}`, label: fill(T('“{m}” ends', '„{m}“ endet'), { m: m.label }), tone: 0 });
    // the court
    const ch = parts.chars;
    for (const [role, id0, id1, lab] of [['heir', me.heir, n2.heir, T('New heir: {c}', 'Neuer Erbe: {c}')], ['ruler', me.ruler, n2.ruler, T('New ruler: {c}', 'Neuer Herrscher: {c}')], ['regent', me.regent, n2.regent, T('Regent: {c}', 'Regent: {c}')], ['consort', me.consort, n2.consort, T('Consort: {c}', 'Gemahl: {c}')]] as const) {
      if (id0 !== id1 && id1) { const c = (st.chars as any)[id1] as Character | undefined; if (c) out.push({ key: `n.${role}`, label: fill(lab, { c: c.name }), tone: 0 }); }
    }
    const r0 = s.chars[me.ruler], r1 = ch?.copied.get(String(me.ruler));
    if (r0 && r1) {
      for (let k = 0; k < 3; k++) if (r1.skills[k] !== r0.skills[k]) add({ key: `c.skill${k}`, label: fill(T('Ruler: {s} {v}', 'Herrscher: {s} {v}'), { s: SKILL[k] }), v: r1.skills[k] - r0.skills[k], unit: 'int', tone: 1, from: r0.skills[k], to: r1.skills[k] });
      for (const tr of r1.traits) if (!r0.traits.includes(tr)) out.push({ key: `c.trait+${tr}`, label: T(`Ruler becomes {t:trait_${tr}}`, `Herrscher wird {t:trait_${tr}}`), tone: 0 });
      for (const tr of r0.traits) if (!r1.traits.includes(tr)) out.push({ key: `c.trait-${tr}`, label: T(`Ruler is no longer {t:trait_${tr}}`, `Herrscher ist nicht mehr {t:trait_${tr}}`), tone: 0 });
      if (Math.abs(r1.health - r0.health) > 1e-3) add({ key: 'c.health', label: T('Ruler\'s health {v}', 'Gesundheit des Herrschers {v}'), v: r1.health - r0.health, unit: 'pct', tone: 1, from: r0.health, to: r1.health });
      if (r0.alive && !r1.alive) out.push({ key: 'c.dies', label: fill(T('{c} dies', '{c} stirbt'), { c: r0.name }), tone: -1 });
    }
  }
  // ---- other realms touched (their opinion of us lives in rel)
  if (parts.rel) {
    const seen = new Set<string>();
    for (const [k, r1] of parts.rel.copied) seen.add(k);
    for (const k of Object.keys(parts.rel.proxy)) if (!(k in parts.rel.orig)) seen.add(k);
    for (const k of seen) {
      const [a, b] = k.split('>').map(Number); if (a !== nid && b !== nid) continue;
      const r0 = parts.rel.orig[k], r1 = parts.rel.proxy[k] as Relation | undefined; if (!r1) continue;
      const op = (r?: Relation) => (r ? r.mods.reduce((p, m) => p + m.v, 0) : 0);
      const d = op(r1) - op(r0); if (Math.abs(d) < 0.5) continue;
      const until = Math.max(...r1.mods.filter((m) => !r0 || !r0.mods.some((x) => x.id === m.id && x.v === m.v && x.until === m.until)).map((m) => m.until), 0);
      if (b === nid) add({ key: `o.${a}`, label: fill(T('Opinion of {x} of us {v}', 'Meinung von {x} über uns {v}'), { x: natN(s, a) }), v: d, unit: 'int', tone: 1, from: op(r0), to: op(r1), years: yearsLeft(s, until) });
      else add({ key: `oo.${b}`, label: fill(T('Our opinion of {x} {v}', 'Unsere Meinung von {x} {v}'), { x: natN(s, b) }), v: d, unit: 'int', tone: 0, from: op(r0), to: op(r1), years: yearsLeft(s, until) });
    }
  }
  if (parts.treaties) {
    const key = (t: Treaty) => `${t.type}:${Math.min(t.a, t.b)}:${Math.max(t.a, t.b)}`;
    const live = (arr: Treaty[]) => new Set(arr.filter((t) => (t.a === nid || t.b === nid) && t.until > s.day).map(key));
    const before = live(s.treaties), after = live((st as any).treaties as Treaty[]);
    for (const k of after) if (!before.has(k)) { const [ty, x, y] = k.split(':'); const o = +x === nid ? +y : +x; out.push({ key: `t+${k}`, label: fill(T('{t} with {x}', '{t} mit {x}'), { t: TREATY[ty] ?? T(ty, ty), x: natN(s, o) }), tone: ty === 'tribute' ? -1 : 1 }); }
    for (const k of before) if (!after.has(k)) { const [ty, x, y] = k.split(':'); const o = +x === nid ? +y : +x; out.push({ key: `t-${k}`, label: fill(T('{t} with {x} ends', '{t} mit {x} endet'), { t: TREATY[ty] ?? T(ty, ty), x: natN(s, o) }), tone: ty === 'tribute' ? 1 : -1 }); }
  }
  if ('wars' in shadow) {
    const mine = (ws: War[]) => ws.filter((x) => x.att.includes(nid) || x.def.includes(nid));
    const before = new Set(mine(s.wars).map((x) => x.id)), after = mine(shadow.wars as War[]);
    for (const x of after) if (!before.has(x.id)) out.push({ key: `w+${x.att.includes(nid) ? x.defLead : x.attLead}`, label: fill(T('War: {w}', 'Krieg: {w}'), { w: x.name }), tone: -1 });
    for (const id of before) if (!after.some((x) => x.id === id)) { const x = s.wars.find((y) => y.id === id)!; out.push({ key: `w-${id}`, label: fill(T('The war ends: {w}', 'Der Krieg endet: {w}'), { w: x.name }), tone: 1 }); }
  }
  // ---- the land
  const lc = parts.loc;
  if (lc) {
    const L = w.L;
    for (const [f, one, many, unit, tone] of LOC_FIELDS) {
      const a = lc.orig[f] as Float32Array, b = lc.copied.get(f) as Float32Array | undefined; if (!b) continue;
      const ch: number[] = []; for (let i = 0; i < L; i++) if (Math.abs(b[i] - a[i]) > (unit === 'pct' ? 1e-4 : 0.01)) ch.push(i);
      if (!ch.length) continue;
      if (ch.length <= 3) for (const i of ch) add({ key: `l.${f}.${i}`, label: fill(one, { loc: locN(w, i) }), v: b[i] - a[i], unit, tone: s.loc.owner[i] === nid ? tone : 0, from: a[i], to: b[i] });
      else add({ key: `l.${f}`, label: fill(many, { k: String(ch.length) }), v: ch.reduce((p, i) => p + b[i] - a[i], 0) / ch.length, unit, tone: ch.every((i) => s.loc.owner[i] === nid) ? tone : 0 });
    }
    const p0 = lc.orig.pop as Float32Array, p1 = lc.copied.get('pop') as Float32Array | undefined;
    if (p1) {
      const ch: [number, number][] = [];
      for (let i = 0; i < L; i++) { let a = 0, b = 0; for (let c = 0; c < C; c++) { a += p0[i * C + c]; b += p1[i * C + c]; } if (a > 0 && Math.abs(b - a) / a > 1e-4) ch.push([i, (b - a) / a]); }
      if (ch.length && ch.length <= 3) for (const [i, d] of ch) add({ key: `l.pop.${i}`, label: fill(T('Population of {loc} {v}', 'Bevölkerung von {loc} {v}'), { loc: locN(w, i) }), v: d, unit: 'pct', tone: s.loc.owner[i] === nid ? 1 : 0 });
      else if (ch.length) add({ key: 'l.pop', label: fill(T('Population of {k} locations {v}', 'Bevölkerung von {k} Orten {v}'), { k: String(ch.length) }), v: ch.reduce((p, x) => p + x[1], 0) / ch.length, unit: 'pct', tone: 1 });
    }
    const b0 = lc.orig.buildings as Uint8Array, b1 = lc.copied.get('buildings') as Uint8Array | undefined;
    if (b1) for (let k = 0; k < b0.length; k++) if (b1[k] !== b0[k]) { const l = Math.floor(k / B), bi = k % B; add({ key: `l.b.${k}`, label: fill(T('{b} in {loc} {v}', '{b} in {loc} {v}'), { b: BUILDINGS[bi].name, loc: locN(w, l) }), v: b1[k] - b0[k], unit: 'int', tone: s.loc.owner[l] === nid ? 1 : 0 }); }
    for (const [f, lab, list] of [['faith', T('{loc} turns to {x}', '{loc} wechselt zu {x}'), (k: number) => FAITHS[k]?.name], ['culture', T('{loc} takes up the {x} culture', '{loc} nimmt die Kultur {x} an'), (k: number) => cultureLabel(ALL_CULTURES[k] || 'unknown')]] as const) {
      const a = lc.orig[f] as Uint8Array, b = lc.copied.get(f) as Uint8Array | undefined; if (!b) continue;
      const ch: number[] = []; for (let i = 0; i < L; i++) if (a[i] !== b[i]) ch.push(i);
      for (const i of ch.slice(0, 3)) out.push({ key: `l.${f}.${i}`, label: fill(lab, { loc: locN(w, i), x: list(b[i]) ?? '?' }), tone: 0 });
      if (ch.length > 3) out.push({ key: `l.${f}+`, label: fill(T('… and {k} more locations', '… und {k} weitere Orte'), { k: String(ch.length - 3) }), tone: 0 });
    }
    const o0 = lc.orig.owner as Int16Array, o1 = lc.copied.get('owner') as Int16Array | undefined;
    if (o1) for (let i = 0; i < L; i++) if (o0[i] !== o1[i] && (o0[i] === nid || o1[i] === nid)) out.push({ key: `l.own.${i}`, label: o1[i] === nid ? fill(T('{loc} becomes ours', '{loc} wird unser'), { loc: locN(w, i) }) : fill(T('{loc} is lost to {x}', '{loc} geht an {x}'), { loc: locN(w, i), x: o1[i] >= 0 ? natN(s, o1[i]) : T('no one', 'niemand') }), tone: o1[i] === nid ? 1 : -1 });
    const c0 = lc.orig.core as Int16Array, c1 = lc.copied.get('core') as Int16Array | undefined;
    if (c1) { let k = 0; for (let i = 0; i < L; i++) if (c0[i] !== c1[i] && c1[i] === nid) k++; if (k) out.push({ key: 'l.core', label: k === 1 ? T('A rightful claim to one location', 'Rechtmäßiger Anspruch auf einen Ort') : fill(T('A rightful claim to {k} locations', 'Rechtmäßiger Anspruch auf {k} Orte'), { k: String(k) }), tone: 1 }); }
  }
  // ---- armies that rise or vanish
  if (parts.armies) {
    const ids0 = new Set(s.armies.map((a) => a.id));
    for (const a of (st.armies as Army[])) {
      if (ids0.has(a.id)) continue;
      const men = a.regs.reduce((p, r) => p + r.men, 0);
      if (a.rebels || a.hostile) add({ key: `a.reb.${a.loc}`, label: fill(T('Rebels rise near {loc}: {v} men', 'Aufständische erheben sich bei {loc}: {v} Mann'), { loc: locN(w, a.loc) }), v: men, unit: 'int', tone: 0 });
      else if (a.owner === nid) add({ key: `a.new.${a.loc}`, label: fill(T('New host at {loc}: {v} men', 'Neues Heer in {loc}: {v} Mann'), { loc: locN(w, a.loc) }), v: men, unit: 'int', tone: 0 });
    }
  }
  // ---- what follows: events queued for us, and events that become possible
  if ('pending' in shadow) for (const p of shadow.pending as PendingEvent[]) {
    if (p.nation !== nid || s.pending.some((x) => x.id === p.id)) continue;
    const d = eventDef(p.event); out.push({ key: `e.${p.event}`, label: fill(T('Follows: {e}', 'Folgt: {e}'), { e: d ? interpolate(st, w, (st.nations as Nation[])[nid], p.ctx, d.title) : T(p.event, p.event) }), tone: 0 });
  }
  if ('papacy' in shadow) {
    const f0 = s.papacy.curiaFavour[nid] ?? 0, f1 = shadow.papacy.curiaFavour[nid] ?? 0;
    if (Math.abs(f1 - f0) > 0.05) add({ key: 'p.favour', label: T('Favour with the Curia {v}', 'Gunst bei der Kurie {v}'), v: f1 - f0, unit: 'dec', tone: 1, from: f0, to: f1 });
  }
  if ('situations' in shadow) for (const x of shadow.situations as GameState['situations']) {
    const o = s.situations.find((y) => y.id === x.id); const d = SITUATIONS.find((y) => y.id === x.id);
    if (o && Math.abs(x.progress - o.progress) > 0.05) add({ key: `sit.${x.id}`, label: fill(T('{x}: progress {v}', '{x}: Fortschritt {v}'), { x: d?.name ?? T(x.id, x.id) }), v: x.progress - o.progress, unit: 'dec', tone: 0, from: o.progress, to: x.progress });
  }
  if ('notices' in shadow) for (const x of (shadow.notices as Notice[])) if (x.id > notices0 && x.nation === nid && x.kind !== 'goal') out.push({ key: `nt.${x.kind}.${x.loc ?? ''}`, label: x.text, tone: 0 });
  return out;
}

/** Answer the pending event on a lazy copy with the given random state; returns the facts and whether chance was drawn. */
function trial(s: GameState, w: World, p: PendingEvent, choice: number, rng: number[]) {
  const lz = lazyState(s);
  lz.shadow.rng = rng.slice();
  const notices0 = s.notices.length ? s.notices[s.notices.length - 1].id : 0;
  const before = rng.join(',');
  answerEvent(lz.st, w, p.nation, p.id, choice);
  const facts = diff(s, w, p.nation, lz, notices0);
  return { facts, drew: (lz.shadow.rng as number[]).join(',') !== before, lz };
}

/** Events that the answered copy makes possible for the realm (their trigger turns true), as “can lead to”. */
function newlyPossible(lz: ReturnType<typeof lazyState>, w: World, p: PendingEvent, base: Set<string>): Fact[] {
  lz.mode.ro = true; // from here on the copy is only read: realms not yet copied are read in place, never written
  const now = triggered(lz.st, w, p.nation);
  const out: Fact[] = [];
  for (const id of now) if (!base.has(id)) { const d = eventDef(id); if (d) out.push({ key: `e?${id}`, label: fill(T('Can lead to: {e}', 'Kann folgen: {e}'), { e: interpolate(lz.st, w, (lz.st.nations as Nation[])[p.nation], {}, d.title) }), tone: 0 }); }
  return out;
}
/** Ids of events whose trigger holds for the realm (on a copy: triggers may draw random numbers). */
function triggered(st: GameState, w: World, nid: number): Set<string> {
  const n = (st.nations as Nation[])[nid]; const out = new Set<string>();
  const d = dayToDate(st.day, st.startYear);
  const e: EvApi = { s: st, w, n, ctx: {}, year: d.y, month: d.m, fx: null as unknown as Effects }; e.fx = new Effects(() => e);
  for (const ev of EVENTS) {
    if (ev.minYear && d.y < ev.minYear) continue; if (ev.maxYear && d.y > ev.maxYear) continue;
    if (ev.once && st.flags[`ev_${ev.id}`] !== undefined) continue;
    const last = n.flags[`ev_${ev.id}`]; if (last !== undefined && (ev.oncePer || st.day - last < (ev.cooldown ?? 10) * 365)) continue;
    let ok = false; try { ok = ev.trigger(e); } catch { ok = false; }
    if (ok) out.add(ev.id);
  }
  return out;
}

const TRIALS = 3;
/**
 * The effects of every option of a pending event, tried on copies of the state. Three trials with different random
 * states; lines that differ become ranges, lines seen in some trials only are marked as possible.
 */
export function eventOptionFx(s: GameState, w: World, nid: number, pendingId: number): OptionFx[] | null {
  const p = s.pending.find((x) => x.id === pendingId && x.nation === nid); if (!p) return null;
  const nOpts = p.event.startsWith('diplo_') || p.event === 'call_to_arms' ? 2 : eventDef(p.event)?.options.length ?? 0;
  const seeds: number[][] = [s.rng.slice()];
  for (let k = 1; k < TRIALS; k++) seeds.push(s.rng.map((v, i) => (Math.floor(hash01(v, pendingId, k * 4 + i) * 4294967296) >>> 0) || 1));
  // what can already happen, before any answer (on a copy, so a trigger's random draw stays there)
  const base = (() => { const lz = lazyState(s, true); lz.shadow.rng = s.rng.slice(); return triggered(lz.st, w, nid); })();
  const res: OptionFx[] = [];
  for (let k = 0; k < nOpts; k++) {
    const t0 = now();
    const first = trial(s, w, p, k, seeds[0]);
    const runs = [first.facts];
    if (first.drew) for (let j = 1; j < TRIALS; j++) runs.push(trial(s, w, p, k, seeds[j]).facts);
    const lines = merge(runs);
    for (const f of newlyPossible(first.lz, w, p, base)) if (!lines.some((l) => l.key === f.key)) lines.push({ ...f, share: 1 });
    // fix-people: a declined offer is not made again for some years (diplomacy.ts noteRefusal); the copy holds it in a
    // flag the comparison does not show, so it is named here, in the visible lines and not only in the hint
    const F = p.event.startsWith('diplo_') && k === 1 ? s.nations[p.ctx.from] : undefined; const yrs = REFUSAL_COOLDOWN[p.event.slice(6)];
    if (F && yrs) lines.push({ key: 'o.cooldown', label: { en: `${F.short.en} will not ask again for ${yrs} years`, de: `${F.short.de} ${/^Die /.test(F.short.de) ? 'fragen' : 'fragt'} ${yrs} Jahre lang nicht wieder` }, tone: 0, share: 1 });
    res.push({ lines, random: first.drew && runs.length > 1 && lines.some((l) => l.share < 1 || (l.lo !== undefined && l.hi !== undefined && l.hi - l.lo > 1e-6)), trials: runs.length, ms: now() - t0 });
  }
  return res;
}
function merge(runs: Fact[][]): FxLine[] {
  const by = new Map<string, { f: Fact; vals: number[]; n: number }>();
  for (const run of runs) for (const f of run) {
    const x = by.get(f.key);
    if (x) { x.n++; if (f.v !== undefined) x.vals.push(f.v); } else by.set(f.key, { f, vals: f.v !== undefined ? [f.v] : [], n: 1 });
  }
  const out: FxLine[] = [];
  for (const { f, vals, n } of by.values()) {
    const line: FxLine = { key: f.key, label: f.label, unit: f.unit, tone: f.tone, share: n / runs.length, from: f.from, to: f.to, years: f.years, effects: f.effects };
    if (vals.length) { line.lo = Math.min(...vals); line.hi = Math.max(...vals); line.v = vals[0]; line.vals = vals; }
    out.push(line);
  }
  // order: the realm's numbers first, then estates, court, other realms, land, what follows
  const rank = (k: string) => (k.startsWith('n.est') ? 2 : k.startsWith('n.') ? 1 : k.startsWith('c.') ? 3 : k.startsWith('o') || k.startsWith('t') || k.startsWith('w') ? 4 : k.startsWith('l.') || k.startsWith('a.') ? 5 : k.startsWith('e') ? 7 : 6);
  return out.sort((a, b) => rank(a.key) - rank(b.key));
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// The worker (and the world server, per world) keeps the answers per pending event and day: they only change when the
// state moves on. The cache is the view's own and never feeds back into the simulation.
const CACHE = new WeakMap<GameState, Map<string, OptionFx[] | null>>();
export function eventOptionFxCached(s: GameState, w: World, nid: number, pendingId: number): OptionFx[] | null {
  let m = CACHE.get(s); if (!m) CACHE.set(s, (m = new Map()));
  const key = `${nid}:${pendingId}:${s.day}`;
  if (m.has(key)) return m.get(key)!;
  const r = eventOptionFx(s, w, nid, pendingId);
  if (m.size > 16) m.clear();
  m.set(key, r);
  return r;
}
