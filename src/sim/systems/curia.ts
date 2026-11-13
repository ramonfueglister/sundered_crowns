// The Curia (spec points 60 and 78): the College of Cardinals, the conclave that chooses a pope, and what a realm of
// the Latin Church can ask of Rome.
//
// Twenty-four cardinals sit in the College. Each year some die, and the pope gives their red hats to the realms with
// the best claim per hat they already hold (D'Hondt): the size of the realm, its favour with the Curia, the pope's own
// country and the Holy See's own curial clergy. A realm in good standing can also buy a red hat at once.
//
// When the ruler of the Holy See dies, the cardinals meet in conclave. Each realm's cardinals vote as one bloc for
// the candidate they lean to (their own realm, the curial party, friends and allies, the gifts they took); a pope
// needs two thirds of the votes, and after three rounds without one the most votes win. The country the pope comes
// from gains standing and favour while he reigns. A player whose realm holds red hats casts its bloc itself.
//
// The Curia also sells indulgences (gold now, at the price of the Church's good name) and can be asked to proclaim a
// crusade against a realm of another family of faiths: for five years every realm of the Latin Church may fight it as
// a holy war, and those who do march with more heart.
import type { GameState, Nation, I18n, Command } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice, addOpinion, atWar, hasTreaty, addIncome, addExpense } from '../ctx';
import { nationDev, bordering } from './war';
import { totalOpinion } from './diplomacy';
import { FAITH_INDEX, FAITHS } from '../content/peoples';
import { hash01 } from '../rng';
import { aiApply } from './ai_log';

type Row = [string | I18n, number];
const T = (en: string, de: string): I18n => ({ en, de });
const sumRows = (r: Row[]) => r.reduce((p, x) => p + x[1], 0);
const YEAR = 365;
export const isHuman = (s: GameState, id: number) => s.playerNations.includes(id) || !!s.nations[id]?.playerId;

/** Seats in the College that the pope fills each year; bought red hats may raise it to HAT_MAX. */
export const COLLEGE = 24, HAT_MAX = 30;
/** A conclave sits for 30 days a round; after the third round without two thirds the most votes win. */
export const CONCLAVE_DAYS = 30, CONCLAVE_ROUNDS = 3, CONCLAVE_MAJORITY = 2 / 3;
/** A red hat bought at once: favour, gold (two months of taxes), and once in five years. */
export const RED_HAT_FAVOUR = 25, RED_HAT_YEARS = 5;
/** Gifts to the cardinals of a realm for our candidacy (+15 a gift, at most 60; each adds a tenth of a point to the
 *  Curia's corruption). */
export const SIMONY_STEP = 15, SIMONY_MAX = 60, SIMONY_CORRUPTION = 0.1;
/** Indulgences: a month and a half of taxes for 10 favour, once in three years; the Church's corruption rises by a half and the
 *  realm's own pressure for church reform by a fifth for ten years. */
export const INDULGENCE_FAVOUR = 10, INDULGENCE_YEARS = 3, INDULGENCE_CORRUPTION = 0.5, INDULGENCE_REFORM = 0.2;
/** A crusade: 50 favour (35 for the pope's own country and the Holy See), lasts 5 years, at most one in 15 years;
 *  the crusaders at war with its target gain 10 % morale. */
export const CRUSADE_FAVOUR = 50, CRUSADE_FAVOUR_PAPAL = 35, CRUSADE_YEARS = 5, CRUSADE_GAP = 15, CRUSADE_MORALE = 0.1;
/** What the pope's own country gains while he reigns (a modifier, renewed monthly). */
export const PATRON_EFFECTS = { prestige: 0.3, curia: 3 };

const LATIN = () => FAITH_INDEX.latin;
const alive = (s: GameState, id: number | undefined) => (id !== undefined && id >= 0 && s.nations[id]?.alive ? s.nations[id] : undefined);
export const isLatin = (n: Nation | undefined) => !!n && n.alive && n.faith === LATIN();
export const hats = (s: GameState, id: number) => s.papacy.cardinals?.[id] ?? 0;
export const collegeSize = (s: GameState) => Object.values(s.papacy.cardinals ?? {}).reduce((p, x) => p + x, 0);
export const favourOf = (s: GameState, id: number) => s.papacy.curiaFavour[id] ?? 0;
function setMod(s: GameState, n: Nation, id: string, label: I18n, effects: Record<string, number>, days = 40) {
  n.modifiers = n.modifiers.filter((m) => m.id !== id);
  if (Object.keys(effects).length) n.modifiers.push({ id, until: s.day + days, label, effects });
}
const dropMod = (n: Nation, id: string) => { n.modifiers = n.modifiers.filter((m) => m.id !== id); };
function addFavour(s: GameState, id: number, v: number) { s.papacy.curiaFavour[id] = clamp((s.papacy.curiaFavour[id] ?? 0) + v, 0, 100); }

// ---------------------------------------------------------------- the College of Cardinals
/** Why the pope would give a realm a red hat (zero or less: none). */
export function hatClaim(s: GameState, w: World, n: Nation): Row[] {
  const P = s.papacy;
  if (!isLatin(n) || n.overlord >= 0 || n.excommunicated) return [];
  const size = Math.sqrt(Math.max(0, nationDev(s, n.id))) * 0.5;
  const fav = favourOf(s, n.id);
  const base = size * (0.5 + fav / 200);
  const rows: Row[] = [[T('Size of the realm', 'Größe des Reiches'), +(size * 0.5).toFixed(1)]];
  if (fav) rows.push([T('Favour with the Curia', 'Gunst bei der Kurie'), +(size * fav / 200).toFixed(1)]);
  if (P.patron === n.id && P.patron !== P.holder) rows.push([T('The pope\'s own country', 'Das Land des Papstes'), +(base * 0.6).toFixed(1)]);
  if (P.holder === n.id) rows.push([T('The clergy of the Curia itself', 'Der Klerus der Kurie selbst'), +(base + 4).toFixed(1)]);
  if (P.seat >= 0 && n.capital >= 0 && w.distKm(n.capital, P.seat) < 700) rows.push([T('Close to the Holy See', 'Nahe dem Heiligen Stuhl'), +(base * 0.2).toFixed(1)]);
  return rows;
}
/** The realm that receives the next red hat: the highest claim per hat it already holds (D'Hondt), ties by id. */
function nextHat(s: GameState, w: World): number {
  let best = -1, bv = 0;
  for (const n of s.nations) {
    if (!isLatin(n) || n.overlord >= 0 || n.excommunicated) continue;
    const c = sumRows(hatClaim(s, w, n)); if (c <= 0) continue;
    const v = c / (hats(s, n.id) + 1);
    if (v > bv + 1e-9) { bv = v; best = n.id; }
  }
  return best;
}
function giveHat(s: GameState, id: number, k = 1) { const C = (s.papacy.cardinals ??= {}); C[id] = (C[id] ?? 0) + k; }
/** Fill the College up to its seats. */
function fillCollege(s: GameState, w: World) {
  let size = collegeSize(s);
  while (size < COLLEGE) { const id = nextHat(s, w); if (id < 0) break; giveHat(s, id); size++; }
}
/** Realms that are gone or left the Latin Church lose their cardinals. */
function pruneCollege(s: GameState) {
  const C = s.papacy.cardinals; if (!C) return;
  for (const k of Object.keys(C)) { const n = s.nations[+k]; if (!isLatin(n) || C[+k] <= 0) delete C[+k]; }
}
/** Seat the first College and the reigning pope's country (an old save without them gets them on its first month):
 *  the popes of Avignon were French, the others of the Holy See's own clergy. */
export function ensureCuria(s: GameState, w: World) {
  const P = s.papacy;
  if (P.patron === undefined) {
    const avignon = w.names.findIndex((x, i) => i < w.L && x === 'Avignon');
    const fr = s.nations.find((n) => n.key === 'france' && n.alive);
    P.patron = avignon >= 0 && P.seat === avignon && fr ? fr.id : P.holder;
    P.lastConclave = s.day;
  }
  if (!P.cardinals) { P.cardinals = {}; fillCollege(s, w); }
  P.simony ??= {};
}
/** The yearly consistory: cardinals die (about one in twelve a year), and the pope gives their hats anew. Bought hats
 *  above the College's seats are not refilled. */
function consistory(s: GameState, w: World) {
  const C = s.papacy.cardinals ?? {}; const y = Math.floor(s.day / YEAR);
  for (const k of Object.keys(C).map(Number).sort((a, b) => a - b)) {
    const dead = Math.floor(C[k] * 0.08 + hash01(k, y, 7));
    C[k] -= Math.min(C[k], dead); if (C[k] <= 0) delete C[k];
  }
  fillCollege(s, w);
}

// ---------------------------------------------------------------- the conclave
/** The candidates (the realms whose man may be chosen): the Holy See's own curial party and the realms with the most
 *  red hats, and every player realm that holds one. An excommunicated realm cannot give a pope. */
export function conclaveCandidates(s: GameState): number[] {
  const P = s.papacy; const out: number[] = [];
  const ok = (id: number) => { const n = s.nations[id]; return isLatin(n) && !n.excommunicated; };
  if (P.holder >= 0 && ok(P.holder)) out.push(P.holder);
  const C = P.cardinals ?? {};
  const byHats = Object.keys(C).map(Number).filter((id) => ok(id) && !out.includes(id)).sort((a, b) => C[b] - C[a] || a - b);
  for (const id of byHats) { if (out.length >= 5) break; out.push(id); }
  for (const p of s.playerNations) if (ok(p) && hats(s, p) > 0 && !out.includes(p)) out.push(p);
  return out;
}
/** Why the cardinals of realm el lean toward candidate c (they vote for the highest sum). */
export function cardinalScore(s: GameState, w: World, el: number, c: number): Row[] {
  const P = s.papacy; const cn = s.nations[c];
  const rows: Row[] = [];
  if (el === c) rows.push([T('A man of our own realm', 'Ein Mann aus unserem Reich'), 50]);
  if (c === P.holder) rows.push([T('A man of the Curia', 'Ein Mann der Kurie'), 15]);
  if (el !== c) {
    rows.push(['r_opinion', Math.round(totalOpinion(s, w, el, c) * 0.3)]);
    if (hasTreaty(s, el, c, 'alliance')) rows.push(['r_allied', 20]);
    if (hasTreaty(s, el, c, 'marriage')) rows.push(['r_royal_marriage', 10]);
    if (s.nations[el]?.rivals.includes(c)) rows.push(['r_rival', -50]);
    if (atWar(s, el, c)) rows.push(['r_at_war', -100]);
  }
  const fav = favourOf(s, c); if (fav) rows.push([T('Their standing with the Curia', 'Ihr Ansehen bei der Kurie'), Math.round(fav * 0.2)]);
  if (P.seat >= 0 && cn?.capital >= 0 && w.distKm(cn.capital, P.seat) < 800) rows.push([T('Close to the Holy See', 'Nahe dem Heiligen Stuhl'), 10]);
  if (c === P.patron) rows.push([T('The late pope\'s party', 'Die Partei des verstorbenen Papstes'), 5]);
  const gift = P.simony?.[`${c}>${el}`] ?? 0; if (gift) rows.push([T('Gifts to the cardinals', 'Geschenke an die Kardinäle'), gift]);
  rows.push(['x_el_whim', Math.round(hash01(el, c, P.conclave?.opened ?? P.lastConclave ?? 0) * 8)]);
  return rows;
}
/** The candidate realm el's cardinals would choose now (a player's own vote if cast, else none). */
export function cardinalChoice(s: GameState, w: World, el: number): number {
  const P = s.papacy;
  if (isHuman(s, el)) return P.conclave?.votes[el] ?? -1;
  let best = -1, bv = -Infinity;
  for (const c of P.conclave?.candidates ?? conclaveCandidates(s)) { const v = sumRows(cardinalScore(s, w, el, c)); if (v > bv || (v === bv && c < best)) { bv = v; best = c; } }
  return best;
}
/** Votes (red hats) per candidate if the conclave voted now, and the votes cast. */
export function conclaveTally(s: GameState, w: World): { votes: Record<number, number>; cast: number } {
  const votes: Record<number, number> = {}; let cast = 0;
  for (const [k, v] of Object.entries(s.papacy.cardinals ?? {})) {
    const c = cardinalChoice(s, w, +k); if (c < 0 || v <= 0) continue;
    votes[c] = (votes[c] ?? 0) + v; cast += v;
  }
  return { votes, cast };
}
function openConclave(s: GameState, w: World) {
  const P = s.papacy;
  P.conclave = { opened: s.day, closes: s.day + CONCLAVE_DAYS, round: 1, candidates: conclaveCandidates(s), votes: {} };
  for (const p of s.playerNations) if (isLatin(s.nations[p])) notice(s, p, 'conclave', hats(s, p) > 0
    ? T('The pope is dead. Our cardinals go into conclave and await our word on whom to elect.', 'Der Papst ist tot. Unsere Kardinäle ziehen ins Konklave und erwarten unser Wort, wen sie wählen sollen.')
    : T('The pope is dead. The cardinals have gone into conclave to elect his successor.', 'Der Papst ist tot. Die Kardinäle sind ins Konklave gezogen, um seinen Nachfolger zu wählen.'));
}
function closeConclave(s: GameState, w: World) {
  const P = s.papacy; const cv = P.conclave!;
  const { votes, cast } = conclaveTally(s, w);
  const cands = cv.candidates.filter((c) => isLatin(s.nations[c]));
  let winner = -1, best = -1;
  for (const c of cands) { const v = votes[c] ?? 0; if (v > best || (v === best && winner >= 0 && s.nations[c].score > s.nations[winner].score)) { best = v; winner = c; } }
  if (winner < 0) { P.conclave = null; P.lastConclave = s.day; return; }
  if (cast > 0 && best < cast * CONCLAVE_MAJORITY && cv.round < CONCLAVE_ROUNDS) {
    cv.round++; cv.closes = s.day + CONCLAVE_DAYS;
    for (const p of s.playerNations) if (hats(s, p) > 0) notice(s, p, 'conclave', T(`The conclave found no two-thirds majority (${best} of ${cast}). The cardinals vote again.`, `Das Konklave fand keine Zweidrittelmehrheit (${best} von ${cast}). Die Kardinäle stimmen erneut ab.`));
    return;
  }
  electPope(s, winner, best, cast);
}
function electPope(s: GameState, winner: number, best: number, cast: number) {
  const P = s.papacy; const prev = P.patron ?? -1;
  P.conclave = null; P.lastConclave = s.day; P.simony = {};
  if (prev >= 0 && prev !== winner && s.nations[prev]) dropMod(s.nations[prev], 'papal_patron');
  P.patron = winner;
  const wn = s.nations[winner];
  addFavour(s, winner, 15);
  wn.flags.popes = (wn.flags.popes ?? 0) + 1;
  const curial = winner === P.holder;
  const text = curial
    ? T(`The cardinals elected a man of the Curia as pope (${best} of ${cast} votes).`, `Die Kardinäle wählten einen Mann der Kurie zum Papst (${best} von ${cast} Stimmen).`)
    : T(`The cardinals elected a pope from ${wn.short.en} (${best} of ${cast} votes).`, `Die Kardinäle wählten einen Papst aus ${wn.short.de} (${best} von ${cast} Stimmen).`);
  chronicle(s, winner, 'pope', text, P.seat >= 0 ? P.seat : undefined, P.holder >= 0 ? [P.holder] : undefined);
  for (const p of s.playerNations) if (isLatin(s.nations[p])) notice(s, p, 'pope', p === winner && !curial ? T('A son of our realm has been elected pope!', 'Ein Sohn unseres Reiches wurde zum Papst gewählt!') : text);
}

// ---------------------------------------------------------------- what a realm can ask of Rome
export function redHatGold(n: Nation) { return Math.max(25, Math.round((n.income.tax || 10) * 2)); }
export function simonyCost(n: Nation) { return Math.max(15, Math.round((n.income.tax || 10) * 1.5)); }
export function indulgenceGold(n: Nation) { return Math.max(10, Math.round((n.income.tax || 5) * 1.5)); }
export function crusadeFavour(s: GameState, n: Nation) { return n.id === s.papacy.patron || n.id === s.papacy.holder ? CRUSADE_FAVOUR_PAPAL : CRUSADE_FAVOUR; }
const standing = (n: Nation): string | null => (!isLatin(n) ? 'not of the Latin church' : n.excommunicated ? 'we are excommunicated' : null);

export function redHatRefusal(s: GameState, n: Nation): string | null {
  const st = standing(n); if (st) return st;
  if (n.overlord >= 0) return 'subjects cannot do this';
  if (favourOf(s, n.id) < RED_HAT_FAVOUR) return 'not enough favour with the Curia';
  if (s.day - (n.flags.red_hat ?? -1e9) < RED_HAT_YEARS * YEAR) return 'too soon';
  if (collegeSize(s) >= HAT_MAX) return 'the College is full';
  if (n.treasury < redHatGold(n)) return 'not enough gold';
  return null;
}
export function buyRedHat(s: GameState, n: Nation): string | null {
  const e = redHatRefusal(s, n); if (e) return e;
  const g = redHatGold(n); const h = alive(s, s.papacy.holder);
  addExpense(n, 'curia', g); if (h && h.id !== n.id) addIncome(h, 'curia', g);
  addFavour(s, n.id, -RED_HAT_FAVOUR); giveHat(s, n.id); n.flags.red_hat = s.day;
  chronicle(s, n.id, 'curia', T(`A churchman of ${n.short.en} was raised to the College of Cardinals.`, `Ein Kirchenmann aus ${n.short.de} wurde ins Kardinalskollegium erhoben.`));
  return null;
}
export function simonyRefusal(s: GameState, n: Nation, target: number): string | null {
  const st = standing(n); if (st) return st;
  if (!(s.papacy.conclave?.candidates ?? conclaveCandidates(s)).includes(n.id)) return 'not a candidate';
  if (target === n.id || hats(s, target) <= 0) return 'they have no cardinals';
  if ((s.papacy.simony?.[`${n.id}>${target}`] ?? 0) >= SIMONY_MAX) return 'they cannot be swayed further';
  if (n.treasury < simonyCost(n)) return 'not enough gold';
  return null;
}
/** Gifts to a realm's cardinals for our candidacy at the next (or present) conclave. */
export function simony(s: GameState, n: Nation, target: number): string | null {
  const e = simonyRefusal(s, n, target); if (e) return e;
  const g = simonyCost(n); const t = s.nations[target];
  addExpense(n, 'curia', g); addIncome(t, 'gifts', g);
  const S = (s.papacy.simony ??= {}); const k = `${n.id}>${target}`;
  S[k] = Math.min(SIMONY_MAX, (S[k] ?? 0) + SIMONY_STEP);
  s.papacy.corruption = clamp(s.papacy.corruption + SIMONY_CORRUPTION, 0, 100);
  addOpinion(s, target, n.id, 'gift', 10, YEAR * 2, true);
  return null;
}
export function conclaveVote(s: GameState, n: Nation, cand: number): string | null {
  const cv = s.papacy.conclave;
  if (!cv) return 'no conclave is sitting';
  if (hats(s, n.id) <= 0) return 'we have no cardinals';
  if (!cv.candidates.includes(cand) || !isLatin(s.nations[cand])) return 'not a candidate';
  cv.votes[n.id] = cand;
  return null;
}
export function indulgenceRefusal(s: GameState, n: Nation): string | null {
  const st = standing(n); if (st) return st;
  if (favourOf(s, n.id) < INDULGENCE_FAVOUR) return 'not enough favour with the Curia';
  if (s.day - (n.flags.indulgence ?? -1e9) < INDULGENCE_YEARS * YEAR) return 'too soon';
  return null;
}
export function sellIndulgences(s: GameState, n: Nation): string | null {
  const e = indulgenceRefusal(s, n); if (e) return e;
  addIncome(n, 'indulgences', indulgenceGold(n));
  addFavour(s, n.id, -INDULGENCE_FAVOUR); n.flags.indulgence = s.day;
  s.papacy.corruption = clamp(s.papacy.corruption + INDULGENCE_CORRUPTION, 0, 100);
  setMod(s, n, 'indulgences', T('Indulgences sold', 'Ablasshandel'), { reform_pressure: INDULGENCE_REFORM }, YEAR * 10);
  return null;
}
/** Realms against which a crusade may be proclaimed: of another family of faiths, bordering a realm of the Latin
 *  Church. */
export function crusadeTargets(s: GameState, w: World): number[] {
  const latin = s.nations.filter((x) => isLatin(x) && x.capital >= 0);
  const fam = FAITHS[LATIN()]?.family;
  return s.nations.filter((t) => t.alive && t.capital >= 0 && FAITHS[t.faith]?.family !== fam && latin.some((x) => bordering(s, w, x.id, t.id))).map((t) => t.id);
}
export function crusadeRefusal(s: GameState, w: World | null, n: Nation, target?: number): string | null {
  const P = s.papacy; const st = standing(n); if (st) return st;
  if (P.crusade && s.day < P.crusade.until) return 'a crusade is already under way';
  if (s.day - (P.lastCrusade ?? -1e9) < CRUSADE_GAP * YEAR) return 'too soon';
  if (favourOf(s, n.id) < crusadeFavour(s, n)) return 'not enough favour with the Curia';
  if (target !== undefined) {
    const t = s.nations[target];
    if (!t?.alive || FAITHS[t.faith]?.family === FAITHS[LATIN()]?.family) return 'not of another faith';
    if (w && !crusadeTargets(s, w).includes(target)) return 'no realm of our church borders them';
  }
  return null;
}
export function proclaimCrusade(s: GameState, w: World, n: Nation, target: number): string | null {
  const e = crusadeRefusal(s, w, n, target); if (e) return e;
  const P = s.papacy; const t = s.nations[target];
  addFavour(s, n.id, -crusadeFavour(s, n));
  P.crusade = { target, by: n.id, start: s.day, until: s.day + CRUSADE_YEARS * YEAR };
  P.lastCrusade = s.day;
  n.prestige += 10;
  const text = T(`At the urging of ${n.short.en} the pope proclaimed a crusade against ${t.short.en}.`, `Auf Betreiben von ${n.short.de} rief der Papst zum Kreuzzug gegen ${t.short.de} auf.`);
  chronicle(s, n.id, 'crusade', text, t.capital >= 0 ? t.capital : undefined, [target]);
  for (const p of s.playerNations) if (p === target || isLatin(s.nations[p])) notice(s, p, 'crusade', p === target
    ? T(`The pope has proclaimed a crusade against us. For ${CRUSADE_YEARS} years every realm of the Latin Church may fall upon us.`, `Der Papst hat zum Kreuzzug gegen uns aufgerufen. ${CRUSADE_YEARS} Jahre lang darf jedes Reich der lateinischen Kirche über uns herfallen.`)
    : text);
  return null;
}
/** Whether a fights b under the banner of a crusade (systems/war.ts reads it as a cause for holy war). */
export function crusadeAgainst(s: GameState, a: number, b: number): boolean {
  const c = s.papacy.crusade;
  return !!c && c.target === b && s.day < c.until && isLatin(s.nations[a]);
}

/** A command of the Curia (player and AI alike). */
export function curiaCommand(s: GameState, w: World, n: Nation, cmd: Extract<Command, { t: 'curia' }>): string | null {
  switch (cmd.action) {
    case 'red_hat': return buyRedHat(s, n);
    case 'simony': return simony(s, n, cmd.target ?? -1);
    case 'vote': return conclaveVote(s, n, cmd.target ?? -1);
    case 'indulgence': return sellIndulgences(s, n);
    case 'crusade': return proclaimCrusade(s, w, n, cmd.target ?? -1);
  }
  return 'unknown action';
}

// ---------------------------------------------------------------- the AI
/** The red hats a realm thinks its due: its share of the Latin Church's development, rounded down (a small realm
 *  expects none). */
export function fairShare(s: GameState, n: Nation): number {
  let tot = 0; for (const x of s.nations) if (isLatin(x) && x.overlord < 0) tot += nationDev(s, x.id);
  return Math.floor(tot > 0 ? nationDev(s, n.id) / tot * COLLEGE : 0);
}
function aiConclave(s: GameState, w: World) {
  const cv = s.papacy.conclave; if (!cv) return;
  // AI candidates woo the realms whose cardinals are closest to voting for them
  for (const c of cv.candidates) {
    const n = s.nations[c]; if (!isLatin(n) || isHuman(s, c) || n.treasury < simonyCost(n) * 3 || hash01(c, s.day, 31) > 0.4) continue;
    let best = -1, gap = Infinity;
    for (const k of Object.keys(s.papacy.cardinals ?? {}).map(Number)) {
      if (k === c || isHuman(s, k)) continue;
      const ch = cardinalChoice(s, w, k); if (ch === c || ch < 0) continue;
      const d = sumRows(cardinalScore(s, w, k, ch)) - sumRows(cardinalScore(s, w, k, c));
      if (d < gap && d < 45 && !simonyRefusal(s, n, k)) { gap = d; best = k; }
    }
    if (best >= 0) aiApply(s, w, { t: 'curia', n: c, action: 'simony', target: best }, 'cu:conclave');
  }
}
function aiCuriaYear(s: GameState, w: World) {
  let targets: number[] | null = null;
  const y = Math.floor(s.day / YEAR);
  const open = !crusadeOpenRefusal(s);
  for (const n of s.nations) {
    if (!isLatin(n) || isHuman(s, n.id) || n.excommunicated) continue;
    const fav = favourOf(s, n.id);
    // a frontier realm of the Church (bordering an unbelieving realm not much stronger than itself) saves its favour
    // for a crusade; a zealous or pious crown, a military order, the pope's country and the Holy See ask more often
    let foe = -1;
    if (n.overlord < 0) {
      targets ??= crusadeTargets(s, w);
      const own = nationDev(s, n.id);
      foe = targets.filter((x) => nationDev(s, x) < own * 2 && bordering(s, w, n.id, x)).sort((a, b) => nationDev(s, b) - nationDev(s, a) || a - b)[0] ?? -1;
    }
    if (foe >= 0 && open && fav >= crusadeFavour(s, n) && !crusadeRefusal(s, null, n)) {
      const zeal = n.personality === 'zealot' || n.gov === 'military_order' || !!s.chars[n.ruler]?.traits.includes('pious') || n.id === s.papacy.patron || n.id === s.papacy.holder;
      if (hash01(n.id, y, 43) < (zeal ? 0.5 : 0.2)) { aiApply(s, w, { t: 'curia', n: n.id, action: 'crusade', target: foe }, 'cu:crusade'); continue; }
    }
    const keep = foe >= 0 ? crusadeFavour(s, n) : 0; // favour a frontier realm keeps back
    // a red hat when we hold fewer than our share and the chest is full
    if (fav - RED_HAT_FAVOUR >= Math.max(30, keep) && hats(s, n.id) < fairShare(s, n) && n.treasury > redHatGold(n) * 4 && !redHatRefusal(s, n)) {
      aiApply(s, w, { t: 'curia', n: n.id, action: 'red_hat' }, 'cu:hat');
      continue;
    }
    // indulgences when the chest is empty
    if ((n.treasury < 0 || n.debt > 0) && fav >= 30 && fav - INDULGENCE_FAVOUR >= keep && !indulgenceRefusal(s, n) && hash01(n.id, y, 41) < 0.25) {
      aiApply(s, w, { t: 'curia', n: n.id, action: 'indulgence' }, 'cu:gold');
    }
  }
}
/** Whether the Church can proclaim a crusade at all now (none under way, the last long enough ago). */
function crusadeOpenRefusal(s: GameState): string | null {
  const P = s.papacy;
  if (P.crusade && s.day < P.crusade.until) return 'a crusade is already under way';
  if (s.day - (P.lastCrusade ?? -1e9) < CRUSADE_GAP * YEAR) return 'too soon';
  return null;
}

// ---------------------------------------------------------------- the months and years
function curiaMonth(s: GameState, w: World) {
  ensureCuria(s, w);
  const P = s.papacy;
  pruneCollege(s);
  // the pope's own country
  const pat = alive(s, P.patron);
  if (pat && isLatin(pat)) setMod(s, pat, 'papal_patron', T('A pope of our country', 'Ein Papst aus unserem Land'), { ...PATRON_EFFECTS });
  // the crusade: its armies march with more heart; it ends when its time is up or its target is gone or converted
  if (P.crusade) {
    const c = P.crusade; const t = s.nations[c.target];
    const over = s.day >= c.until || !t?.alive || FAITHS[t.faith]?.family === FAITHS[LATIN()]?.family;
    for (const n of s.nations) {
      if (!n.alive) continue;
      const on = !over && isLatin(n) && atWar(s, n.id, c.target);
      if (on) setMod(s, n, 'crusader', T('On crusade', 'Auf Kreuzzug'), { morale: CRUSADE_MORALE }); else if (n.modifiers.some((m) => m.id === 'crusader')) dropMod(n, 'crusader');
    }
    if (over) {
      chronicle(s, c.by, 'crusade', T(`The crusade against ${t?.short.en ?? '?'} came to an end.`, `Der Kreuzzug gegen ${t?.short.de ?? '?'} ging zu Ende.`), undefined, [c.target]);
      P.crusade = null;
    }
  }
  // the conclave
  const h = alive(s, P.holder);
  if (P.conclave) aiConclave(s, w);
  else if (h && isLatin(h) && (h.flags.ruler_changed ?? -1) > (P.lastConclave ?? 0)) openConclave(s, w);
}
function curiaYear(s: GameState, w: World) {
  ensureCuria(s, w);
  consistory(s, w);
  const S = s.papacy.simony;
  if (S && !s.papacy.conclave) for (const k in S) { S[k] = Math.floor(S[k] * 0.8); if (S[k] <= 0) delete S[k]; }
  aiCuriaYear(s, w);
}

export const curia: System = {
  id: 'curia',
  init(s, w) { ensureCuria(s, w); },
  // a conclave closes on its day (each round lasts 30 days, not until the next month)
  daily({ s, w }) { if (s.papacy.conclave && s.day >= s.papacy.conclave.closes) closeConclave(s, w); },
  monthly({ s, w }) { curiaMonth(s, w); },
  yearly({ s, w }) { curiaYear(s, w); },
};
