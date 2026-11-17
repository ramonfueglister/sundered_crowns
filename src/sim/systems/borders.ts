// The borders: places change hands on the days of the chronicle of borders (src/sim/content/borders.ts). Ramon,
// 16 November 2026: real history as a replay, the map changes as in EU4/EU5 in front of the replay.
//
// - A place goes to the realm the chronicle names, whoever holds it that day.
// - A realm that is not in the world yet (the Kingdom of Poland, the Swiss Confederation, Bavaria as a kingdom ...)
//   comes into it with its first places: a row of the realm table with the name of the source, no holder (the ruler
//   lists of these realms are still to come), the culture and faith of its capital, and a colour of its own drawn
//   from its key (no source gives realm colours). Its rank is the title word of its name, else a duchy, as the setup's
//   default.
// - A realm takes the name of the polity it has become on the day the chronicle says (Moscow the Tsardom of Russia in
//   1547): the name of the source, and for the map the name after its title ("Great Britain").
// - A realm that loses its capital takes the place it still holds with the most people as its capital (the lowest
//   id on a tie); a realm without a capital takes one so with its next places. A realm that holds no place stays in
//   the table: its title may go on.
import type { WorldState } from '../state';
import { RANKS } from '../state';
import { spawn } from '../ecs';
import type { World } from '../world';
import type { System } from '../schedule';
import { type Borders, firstBorderEventOn } from '../content/borders';
import { hash01 } from '../rng';

const index = new WeakMap<WorldState, { realms: Map<string, number>; n: number }>();
function realmIndex(s: WorldState) {
  let x = index.get(s);
  if (!x || x.n !== s.realmText.length) {
    x = { realms: new Map(s.realmText.map((t, k) => [t.key, k])), n: s.realmText.length };
    index.set(s, x);
  }
  return x.realms;
}

/** The rank of a realm from the title word of its name ("Kingdom of Bavaria" → kingdom), else a duchy. */
export function rankOfName(name: string): number {
  const n = name.toLowerCase();
  const words: [RegExp, (typeof RANKS)[number]][] = [
    [/\bgrand duchy\b/, 'grand_duchy'], [/\bprince-?bishopric\b|\bbishopric\b/, 'prince_bishopric'], [/\barchbishopric\b/, 'archbishopric'],
    [/\bempire\b|\btsardom\b/, 'empire'], [/\bkingdom\b|\bkingdoms\b/, 'kingdom'], [/\bduchy\b|\bduchies\b/, 'duchy'],
    [/\bprincipality\b/, 'principality'], [/\bmargraviate\b/, 'margraviate'], [/\blandgraviate\b/, 'landgraviate'],
    [/\bcounty\b|\bearldom\b/, 'county'], [/\blordship\b/, 'lordship'], [/\b(free|imperial) city\b/, 'free_city'],
    [/\brepublic\b|\bconfederation\b/, 'republic'], [/\border\b/, 'order'], [/\bdespotate\b/, 'despotate'],
    [/\bsultanate\b/, 'sultanate'], [/\bemirate\b|\bimamate\b/, 'emirate'], [/\bbeylik\b/, 'beylik'], [/\bkhanate\b/, 'khanate'],
  ];
  for (const [re, rank] of words) if (re.test(n)) return RANKS.indexOf(rank);
  return RANKS.indexOf('duchy');
}

/** A colour of its own for a realm that comes in on the way: hue from its key, muted as the map's colours. */
export function colorOfKey(key: string): number {
  let h = 0x811c9dc5; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  const hue = hash01(h >>> 0, 1, 0) * 360, sat = 0.35 + 0.2 * hash01(h >>> 0, 2, 0), light = 0.4 + 0.2 * hash01(h >>> 0, 3, 0);
  const c = (1 - Math.abs(2 * light - 1)) * sat, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = light - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  const u8 = (v: number) => Math.round((v + m) * 255);
  return (u8(r) << 16) | (u8(g) << 8) | u8(b);
}

/** The place of a realm with the most people (the lowest id on a tie), −1 when it holds none. */
function largestPlace(s: WorldState, realm: number): number {
  const o = s.place.owner, pop = s.place.pop;
  let best = -1;
  for (let i = 0; i < o.length; i++) if (o[i] === realm && (best < 0 || pop[i] > pop[best])) best = i;
  return best;
}

/** A realm that comes in on the way, with the places it comes with. */
function addRealm(s: WorldState, b: Borders, key: string, places: Int32Array): number {
  const info = b.realms.get(key);
  const name = info?.name ?? key, short = info?.short ?? name;
  const id = spawn(s.realm), R = s.realm.cols;
  let cap = -1;
  for (const p of places) if (p < s.place.owner.length && (cap < 0 || s.place.pop[p] > s.place.pop[cap])) cap = p;
  R.capital[id] = cap; R.holder[id] = -1; R.color[id] = colorOfKey(key);
  R.culture[id] = cap >= 0 ? s.place.culture[cap] : 0; R.faith[id] = cap >= 0 ? s.place.faith[cap] : 0;
  R.rank[id] = rankOfName(name);
  const text = { en: name, de: name }, shortText = { en: short, de: short };
  s.realmText.push({ key, name: text, short: shortText, adjective: shortText });
  s.ruler.push('');
  return id;
}

/** Applies every change of the chronicle of borders from day `from` up to and including day `to`; returns the number
 *  of places that moved. */
export function playBorders(s: WorldState, w: World, from: number, to: number): number {
  const b = w.borders;
  if (!b || b.year !== s.startYear) return 0;
  const o = s.place.owner, R = s.realm.cols;
  let moved = 0;
  for (let i = firstBorderEventOn(b, from); i < b.events.length && b.events[i].day <= to; i++) {
    const e = b.events[i];
    if (e.name) { // a new name: the polity's, in English as the source gives it (German labels still to come)
      const r = realmIndex(s).get(e.to);
      if (r !== undefined) {
        const t = s.realmText[r], name = { en: e.name.name, de: e.name.name }, short = { en: e.name.short, de: e.name.short };
        s.realmText[r] = { key: t.key, name, short, adjective: short };
      }
      continue;
    }
    let r = realmIndex(s).get(e.to);
    if (r === undefined) r = addRealm(s, b, e.to, e.places);
    const losers = new Set<number>();
    for (const p of e.places) {
      if (p >= o.length || o[p] === r) continue;
      if (o[p] >= 0) losers.add(o[p]);
      o[p] = r; moved++;
    }
    for (const l of losers) { const c = R.capital[l]; if (c >= 0 && o[c] !== l) R.capital[l] = largestPlace(s, l); }
    if (R.capital[r] < 0) R.capital[r] = largestPlace(s, r);
  }
  return moved;
}

/** The borders of a new world (or of an older one brought up to date): every change up to the day it has reached. */
export function foundBorders(s: WorldState, w: World): number {
  return playBorders(s, w, Number.MIN_SAFE_INTEGER, s.day);
}

/** Every day: what the chronicle of borders says for that day. */
export const borders: System = {
  id: 'borders',
  run(s, w, t) { playBorders(s, w, t.day, t.day); },
};
