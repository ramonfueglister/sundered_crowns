// Royal houses: marriages between ruling houses with real people, the claims their children inherit, the claimants
// to a throne whose house dies out, and the living members of a ruler's house for the government panel.
import type { GameState, Nation, Character, I18n } from '../types';
import type { World } from '../world';
import { chronicle, notice } from '../ctx';
import { rand } from '../rng';
import { newChar, ageOf, nextInLine, lineOfSuccession } from './politics';
import { LAWS, LAW_INDEX } from '../content/laws';
import { givenName, localName } from '../content/names';
import { FAITHS } from '../content/peoples';

const YEAR = 365;
const alive = (s: GameState, id: number | undefined) => { const c = id ? s.chars[id] : undefined; return c && c.alive ? c : undefined; };
/** A person without a living spouse. */
export const unwed = (s: GameState, c: Character) => !alive(s, c.spouse);

/** The late father of a ruler from the setup, so that brothers and sisters of the ruler have a common parent. */
function ensureFather(s: GameState, n: Nation, r: Character): Character {
  const f = alive(s, r.father) ?? (r.father ? s.chars[r.father] : undefined);
  if (f) return f;
  const p = newChar(s, n, { name: givenName(s.rng, n.culture, false), female: false, born: r.born - Math.floor((24 + rand(s.rng) * 12) * YEAR), dynasty: r.dynasty || n.dynasty, role: 'courtier', skills: [2, 2, 2], traits: [] });
  p.alive = false; p.died = Math.min(s.day, r.born + Math.floor((10 + rand(s.rng) * 20) * YEAR)); p.children.push(r.id); r.father = p.id;
  return p;
}

/** Brothers and sisters of a person (children of the same father or mother), living or dead. */
export function siblingsOf(s: GameState, c: Character): Character[] {
  const out = new Map<number, Character>();
  for (const pid of [c.father, c.mother]) { const p = pid ? s.chars[pid] : undefined; if (p) for (const k of p.children) { const x = s.chars[k]; if (x && x.id !== c.id) out.set(x.id, x); } }
  return [...out.values()].sort((a, b) => a.born - b.born || a.id - b.id);
}

/** A member of realm B's ruling house to marry a person born about `born`: an unwed son or daughter, brother or
 *  sister of B's ruler of marriageable age, else one born into the house (a child of the ruler younger than the heir,
 *  or a brother or sister). Never the ruler, the heir or whoever would inherit today (the eldest daughter when male
 *  primogeniture finds no son), never a person in office or at the head of a host of B, and never a child of the
 *  ruler born before the heir (who would stand ahead of the heir in line). */
/** The living member of B's ruling house who would be wed to a person born about `born` (see houseMember), without
 *  creating anyone: the ruler's unwed sons or daughters, brothers or sisters, grandchildren, nephews and nieces. */
export function existingHouseMember(s: GameState, B: Nation, female: boolean, born: number): Character | null {
  const r = alive(s, B.ruler); if (!r) return null;
  const next = nextInLine(s, B);
  const busy = (c: Character) => Object.values(B.council).includes(c.id) || s.armies.some((a) => a.owner === B.id && a.general === c.id);
  const fits = (c: Character | undefined) => !!c && c.alive && c.female === female && c.id !== B.ruler && c.id !== B.heir && c.id !== next && !busy(c) && unwed(s, c) && c.nation === B.id && ageOf(s, c) >= 14 && ageOf(s, c) <= 45 && Math.abs(c.born - born) < 15 * YEAR;
  const near = [...r.children.map((k) => s.chars[k]), ...siblingsOf(s, r)];
  const far = near.flatMap((c) => (c ? c.children.map((k) => s.chars[k]) : []));
  const kin = [...near, ...far].filter(fits) as Character[];
  kin.sort((a, b) => Math.abs(a.born - born) - Math.abs(b.born - born) || a.id - b.id);
  return kin[0] ?? null;
}
export function houseMember(s: GameState, B: Nation, female: boolean, born: number): Character | null {
  const r = alive(s, B.ruler); if (!r) return null;
  const found = existingHouseMember(s, B, female, born);
  if (found) return found;
  // born into the house: a child of the ruler when the ruler is old enough and the child comes after the heir in line
  // (younger than a child heir, and no son behind a daughter under male primogeniture), otherwise a sibling
  const target = Math.min(s.day - 15 * YEAR, Math.max(born - 6 * YEAR, s.day - 32 * YEAR));
  const h = alive(s, B.heir);
  const law = LAWS[LAW_INDEX.succession].options[B.laws.succession ?? 0]?.id;
  const asChild = target - r.born > 17 * YEAR && !!h && r.children.includes(h.id) && h.born < target && (law !== 'primogeniture' || female || !h.female);
  const parent = asChild ? r : ensureFather(s, B, r);
  const other = asChild ? alive(s, r.spouse) : undefined;
  const c = newChar(s, B, {
    name: freshGivenName(s, B.culture, female, parent), female, born: Math.max(target, parent.born + 17 * YEAR), dynasty: r.dynasty || B.dynasty, role: 'courtier',
    father: parent.female ? other?.id : parent.id, mother: parent.female ? parent.id : other?.id,
    skills: [Math.floor(rand(s.rng) * 5), Math.floor(rand(s.rng) * 5), Math.floor(rand(s.rng) * 5)],
  });
  parent.children.push(c.id); if (other) other.children.push(c.id);
  return c;
}

function wed(s: GameState, X: Nation, a: Character, b: Character, Y: Nation) {
  a.spouse = b.id; b.spouse = a.id;
  b.nation = X.id;
  // the bride or groom carries a claim on the throne of the house they come from, and passes it to their children
  b.claims = [...new Set([...(b.claims ?? []), Y.id])];
  if (a.id === X.ruler) { X.consort = b.id; b.role = 'consort'; }
}

/** A royal marriage between the houses of realms a and b: an unwed ruler (else an unwed heir of fourteen or more) of
 *  one realm marries a member of the other ruling house, who joins their court with a claim on the throne of the
 *  realm they come from. Returns the couple, or null when neither house has anyone to wed (the treaty then binds the
 *  houses without a wedding). */
/** Who of realms a and b would wed under a marriage treaty, best first: an unwed ruler (else an unwed heir of
 *  fourteen or more) of one realm, and the realm whose house gives the bride or groom. */
function matchSeekers(s: GameState, a: number, b: number): { X: Nation; Y: Nation; p: Character; role: 'ruler' | 'heir' }[] {
  const A = s.nations[a], Bn = s.nations[b]; const out: { X: Nation; Y: Nation; p: Character; role: 'ruler' | 'heir' }[] = [];
  for (const role of ['ruler', 'heir'] as const) {
    for (const [X, Y] of [[A, Bn], [Bn, A]] as const) {
      const p = alive(s, role === 'ruler' ? X.ruler : X.heir); if (!p) continue;
      if (role === 'ruler' && alive(s, X.consort)) continue;
      if (role === 'ruler' && X.overlord >= 0 && X.subjectType === 'personal_union' && s.nations[X.overlord]?.ruler === p.id) continue;
      const age = ageOf(s, p);
      if (!unwed(s, p) || age < (role === 'ruler' ? 16 : 14) || age > 60) continue;
      out.push({ X, Y, p, role });
    }
  }
  return out;
}
/** fix-people: the wedding a marriage treaty between a and b would bring today, without changing anything (the
 *  diplomacy panel shows it before the envoy is sent). spouse null: the other house has nobody of the right age yet,
 *  and a member would be named at the wedding (houseMember). match null: neither house has anyone to wed, and the
 *  treaty binds the houses without a wedding. */
export function marriagePreview(s: GameState, a: number, b: number) {
  const seekers = matchSeekers(s, a, b);
  const person = (c: Character, Z: Nation) => ({ id: c.id, name: c.name, female: c.female, age: Math.floor(ageOf(s, c)), rel: c.id === Z.ruler ? 'ruler' : c.id === Z.heir ? 'heir' : relTo(s, Z, c) });
  // as royalMatch: a living member of the other house first, else the first seeker with a member named at the wedding
  let match: { realm: number; house: number; person: ReturnType<typeof person>; spouse: ReturnType<typeof person> | null; female: boolean } | null = null;
  for (const k of seekers) { const m = existingHouseMember(s, k.Y, !k.p.female, k.p.born); if (m) { match = { realm: k.X.id, house: k.Y.id, person: person(k.p, k.X), spouse: person(m, k.Y), female: m.female }; break; } }
  const k0 = seekers.find((k) => !!alive(s, k.Y.ruler));
  if (!match && k0) match = { realm: k0.X.id, house: k0.Y.id, person: person(k0.p, k0.X), spouse: null, female: !k0.p.female };
  // the members of the other house who could one day be wed, for the panel
  const B = s.nations[b]; const v = dynastyView(s, B);
  const members = (v?.members ?? []).filter((x) => x.abroad < 0 && x.rel !== 'parent').slice(0, 8).map((x) => ({ name: x.name, female: x.female, age: x.age, rel: x.rel, wed: !!x.spouse?.alive }));
  return { match, members };
}
/** How a member of Z's house is related to its ruler (for the preview). */
function relTo(s: GameState, Z: Nation, c: Character): string {
  const r = s.chars[Z.ruler]; if (!r) return 'kin';
  if (r.children.includes(c.id)) return 'child';
  if (siblingsOf(s, r).some((x) => x.id === c.id)) return 'sibling';
  if (r.children.some((k) => s.chars[k]?.children.includes(c.id))) return 'grandchild';
  if (siblingsOf(s, r).some((x) => x.children.includes(c.id))) return 'nephew';
  return 'kin';
}
/** A given name for a child that none of its living brothers or sisters bears (two daughters both named Inés). */
export function freshGivenName(s: GameState, culture: number, female: boolean, ...parents: (Character | undefined)[]): string {
  const taken = new Set<string>();
  for (const p of parents) for (const k of p?.children ?? []) { const x = s.chars[k]; if (x?.alive) taken.add(x.name.split(' ')[0]); }
  let g = givenName(s.rng, culture, female);
  for (let k = 0; k < 8 && taken.has(g); k++) g = givenName(s.rng, culture, female);
  return g;
}

export function royalMatch(s: GameState, w: World, a: number, b: number): { realm: number; person: number; spouse: number } | null {
  // a living member of the other house first (an unwed heir before a member made up for an old widower), then one born
  // into the house for the first who seeks a match
  const seekers = matchSeekers(s, a, b);
  const pick = seekers.map((k) => ({ k, m: existingHouseMember(s, k.Y, !k.p.female, k.p.born) })).find((x) => x.m);
  for (const { X, Y, p } of pick ? [pick.k] : seekers) {
    const m = pick?.m ?? houseMember(s, Y, !p.female, p.born); if (!m) continue;
    wed(s, X, p, m, Y);
    const nm = (c: Character, l: 'en' | 'de') => localName(c.name, l, c.female);
    chronicle(s, X.id, 'marriage', { en: `${nm(p, 'en')} of ${X.short.en} married ${nm(m, 'en')} of the house of ${Y.short.en}.`, de: `${nm(p, 'de')} von ${X.short.de} heiratete ${nm(m, 'de')} aus dem Haus von ${Y.short.de}.` });
    for (const k of [X.id, Y.id]) if (s.playerNations.includes(k)) notice(s, k, 'marriage', { en: `${nm(p, 'en')} of ${X.short.en} weds ${nm(m, 'en')} of ${Y.short.en}, who keeps a claim on the throne of ${Y.short.en} and passes it to their children: should the house of ${Y.short.en} die out, its crown may pass to ${X.short.en}.`, de: `${nm(p, 'de')} von ${X.short.de} heiratet ${nm(m, 'de')} von ${Y.short.de}. ${m.female ? 'Sie' : 'Er'} behält einen Anspruch auf den Thron von ${Y.short.de} und vererbt ihn an die Kinder: Erlischt das Haus von ${Y.short.de}, kann dessen Krone an ${X.short.de} fallen.` });
    return { realm: X.id, person: p.id, spouse: m.id };
  }
  return null;
}

/** Claims a newborn inherits from its parents (never one on its own realm). */
export function inheritClaims(child: Character, ...parents: (Character | undefined)[]) {
  const set = new Set<number>();
  for (const p of parents) for (const k of p?.claims ?? []) if (k !== child.nation) set.add(k);
  if (set.size) child.claims = [...set].sort((x, y) => x - y);
}

export interface SuccessionClaim { nation: number; char: number; rank: number; how: 'blood' | 'descent' | 'marriage' }
/** Who could claim realm n's throne by blood, best first: living people who carry a claim on it (a daughter or son of
 *  its house married abroad ranks above their children, and a claimant who rules or will rule a realm presses the
 *  claim for it), then realms bound to it by a marriage treaty without a wedding. Each claimant realm is listed once,
 *  with its best claim. Used when a house dies out (systems/politics.ts succession) and available to war goals. */
export function successionClaims(s: GameState, n: Nation): SuccessionClaim[] {
  const best = new Map<number, SuccessionClaim>();
  for (const k in s.chars) {
    const c = s.chars[k];
    if (!c.alive || !c.claims?.includes(n.id) || c.nation === n.id) continue;
    const X = s.nations[c.nation]; if (!X?.alive) continue;
    const rank = (c.dynasty && c.dynasty === n.dynasty ? 3 : 2) + (X.ruler === c.id || X.heir === c.id || X.consort === c.id ? 1 : 0);
    const cur = best.get(X.id);
    if (!cur || rank > cur.rank || (rank === cur.rank && c.id < cur.char)) best.set(X.id, { nation: X.id, char: c.id, rank, how: rank >= 3 && c.dynasty === n.dynasty ? 'blood' : 'descent' });
  }
  for (const t of s.treaties) {
    if (t.type !== 'marriage' || (t.a !== n.id && t.b !== n.id) || t.until <= s.day) continue;
    const k = t.a === n.id ? t.b : t.a;
    if (!s.nations[k]?.alive || best.has(k)) continue;
    best.set(k, { nation: k, char: s.nations[k].ruler, rank: 1, how: 'marriage' });
  }
  return [...best.values()].sort((x, y) => y.rank - x.rank || x.nation - y.nation);
}
/** Claimants who may inherit a Christian crown by marriage (a sultanate or khanate whose house dies out raises a
 *  new house of its own; see succession). */
export function christianClaimants(s: GameState, n: Nation): SuccessionClaim[] {
  const christian = (x: Nation) => FAITHS[x.faith]?.family === 'christian';
  if (!christian(n)) return [];
  return successionClaims(s, n).filter((c) => christian(s.nations[c.nation]));
}

/** A claim on a throne the claimant could not take up at once (at war with the realm, or itself a subject): a claim
 *  treaty for 25 years, a justification for war (war.ts hasCasusBelli). */
export function pressLater(s: GameState, claimant: number, n: Nation) {
  if (s.treaties.some((t) => t.type === 'claim' && t.a === claimant && t.b === n.id && t.until > s.day)) return;
  s.treaties.push({ a: claimant, b: n.id, type: 'claim', since: s.day, until: s.day + 25 * YEAR });
  const C = s.nations[claimant];
  chronicle(s, claimant, 'claim', { en: `${C.short.en} claims the throne of ${n.short.en}, whose house has died out.`, de: `${C.short.de} erhebt Anspruch auf den Thron von ${n.short.de}, dessen Haus erloschen ist.` });
  if (s.playerNations.includes(claimant)) notice(s, claimant, 'claim', { en: `The house of ${n.short.en} has died out. Our claim on its throne gives us a cause for war for 25 years.`, de: `Das Haus von ${n.short.de} ist erloschen. Unser Anspruch auf den Thron gibt uns 25 Jahre lang einen Kriegsgrund.` });
}

/** The living members of the ruler's house with their claims (government panel). */
export function dynastyView(s: GameState, n: Nation) {
  const r = s.chars[n.ruler];
  if (!r) return null;
  const row = (c: Character, rel: string) => ({ id: c.id, name: c.name, dynasty: c.dynasty, female: c.female, age: Math.floor(ageOf(s, c)), rel, skills: c.skills, traits: c.traits,
    claims: (c.claims ?? []).filter((k) => s.nations[k]?.alive), spouse: c.spouse && s.chars[c.spouse] ? { name: s.chars[c.spouse].name, dynasty: s.chars[c.spouse].dynasty, female: s.chars[c.spouse].female, alive: s.chars[c.spouse].alive } : null,
    heir: c.id === n.heir, abroad: c.nation !== n.id ? c.nation : -1, role: c.role ?? '' });
  const out: ReturnType<typeof row>[] = [row(r, 'ruler')];
  const seen = new Set<number>([r.id]);
  const add = (c: Character | undefined, rel: string) => { if (!c || !c.alive || seen.has(c.id)) return; seen.add(c.id); out.push(row(c, rel)); };
  add(alive(s, n.consort) ?? alive(s, r.spouse), 'consort');
  add(alive(s, n.heir), 'heir');
  for (const k of r.children) { const c = s.chars[k]; add(c, 'child'); if (c) for (const g of c.children) add(s.chars[g], 'grandchild'); }
  for (const c of siblingsOf(s, r)) { add(c, 'sibling'); for (const g of c.children) add(s.chars[g], 'nephew'); }
  for (const pid of [r.father, r.mother]) add(pid ? s.chars[pid] : undefined, 'parent');
  // the line of succession (a crown by blood): who comes after the heir, and the kin of the line not listed yet
  const hereditary = !['elective', 'office'].includes(LAWS[LAW_INDEX.succession].options[n.laws.succession ?? 0]?.id ?? '');
  const lineIds = hereditary ? lineOfSuccession(s, n, r, 12) : [];
  for (const id of lineIds) add(s.chars[id], 'kin');
  const line = lineIds.slice(0, 5).map((id) => ({ id, name: s.chars[id].name, female: s.chars[id].female, age: Math.floor(ageOf(s, s.chars[id])) }));
  // who would inherit if the house died out today: only a claim by blood passes the crown (systems/politics.ts
  // succession); a marriage treaty without a wedding gives a claim to press by war
  const claimants = successionClaims(s, n).slice(0, 4).map((c) => ({ nation: c.nation, char: c.char, name: s.chars[c.char]?.name ?? '', female: !!s.chars[c.char]?.female, rank: c.rank, how: c.how }));
  const blood = christianClaimants(s, n).find((c) => c.how !== 'marriage');
  // the warning: the house rests on one person (or none) of its own line
  const inLine = lineIds.length || (n.heir && s.chars[n.heir]?.alive ? 1 : 0);
  const warn: 'none' | 'last' | null = !hereditary ? null : inLine === 0 ? 'none' : inLine === 1 ? 'last' : null;
  return { house: r.dynasty || n.dynasty, members: out, claimants, line, warn, hereditary,
    fallback: blood ? { nation: blood.nation, name: s.chars[blood.char]?.name ?? '', female: !!s.chars[blood.char]?.female } : null };
}

/** fix-people: a player is told when the line of the ruling house is down to one person or none (checked each month,
 *  told once each time the line shrinks to it). */
export function houseWarning(s: GameState, n: Nation) {
  if (!s.playerNations.includes(n.id)) return;
  const v = dynastyView(s, n); if (!v || !v.hereditary) return;
  const k = v.warn === 'none' ? 0 : v.warn === 'last' ? 1 : 2;
  const was = n.flags.house_line ?? 2;
  n.flags.house_line = k;
  if (k >= was || k === 2) return;
  const r = s.chars[n.ruler];
  const nm = (c: { name: string; female: boolean } | null | undefined, l: 'en' | 'de') => (c ? localName(c.name, l, c.female) : '');
  const fb = v.fallback ? s.nations[v.fallback.nation] : null;
  const then: I18n = fb ? { en: `the crown would pass to ${nm(v.fallback, 'en')} of ${fb.short.en}, who has a claim by blood`, de: `ginge die Krone an ${nm(v.fallback, 'de')} von ${fb.short.de}, ${v.fallback!.female ? 'die' : 'der'} einen Anspruch durch Blut hat` }
    : { en: 'the magnates would raise a lord of another house to the throne, and the succession would be disputed', de: 'höben die Magnaten einen Herrn aus einem anderen Haus auf den Thron, und die Nachfolge wäre umstritten' };
  if (k === 1) {
    const last = v.line[0] ?? (s.chars[n.heir] ? { name: s.chars[n.heir].name, female: s.chars[n.heir].female } : null);
    const erbe = last?.female ? 'die Erbin' : 'der Erbe';
    notice(s, n.id, 'house_warning', { en: `Our house rests on one heir: ${nm(last, 'en')}. Should both ${nm(r, 'en')} and the heir die, ${then.en}. A marriage and children would secure the line.`, de: `Unser Haus ruht auf ${last?.female ? 'einer einzigen Erbin' : 'einem einzigen Erben'}: ${nm(last, 'de')}. Stürben ${nm(r, 'de')} und ${erbe}, ${then.de}. Eine Heirat und Kinder würden die Linie sichern.` }, { loc: n.capital });
  } else {
    notice(s, n.id, 'house_warning', { en: `No one of our house can inherit the crown. Should ${nm(r, 'en')} die, ${then.en}.`, de: `Niemand aus unserem Haus kann die Krone erben. Stürbe ${nm(r, 'de')}, ${then.de}.` }, { loc: n.capital });
  }
}
