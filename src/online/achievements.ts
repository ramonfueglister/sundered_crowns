// Achievements of the online world. Cosmetic only: they never change the simulation or give any advantage.
// The world server checks them against the authoritative game state (monthly and at the end of a season) and
// records them in Supabase (public.achievements). The client imports this file only to show names and descriptions.
import type { GameState, I18n, Nation } from '../sim/types';
import type { World } from '../sim/world';

/** What the server knows about a seat besides the game state. All day values are in-game day indices. */
export interface AchievementCtx {
  joinDay: number;
  join: { locs: number; battlesWon: number; warsWon: number };
  lastWarDay: number;        // last in-game day the realm was at war while held by this player (joinDay if never)
  seasonEnded: boolean;
  finalRank: number;         // 1-based rank among all realms at the season end (0 while running)
}

export interface AchievementDef {
  key: string;
  name: I18n;
  desc: I18n;
  icon: string; // short glyph shown in the panel
  check: (s: GameState, w: World, n: Nation, c: AchievementCtx) => boolean;
}

const YEAR = 365;
function ownedLocs(s: GameState, w: World, id: number): number[] {
  const out: number[] = []; for (let l = 0; l < w.L; l++) if (s.loc.owner[l] === id) out.push(l); return out;
}
const income = (n: Nation) => Object.values(n.income).reduce((p, v) => p + v, 0);
const atWar = (s: GameState, id: number) => s.wars.some((x) => x.att.includes(id) || x.def.includes(id));
const ruled = (s: GameState, c: AchievementCtx) => s.day - c.joinDay;

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first_crown', icon: '♔', name: { en: 'Take the Throne', de: 'Den Thron besteigen' },
    desc: { en: 'Take a seat in an online world.', de: 'Übernimm ein Reich in einer Online-Welt.' },
    check: () => true },
  { key: 'one_year', icon: '⌛', name: { en: 'A Year in Power', de: 'Ein Jahr an der Macht' },
    desc: { en: 'Rule your realm for one in-game year.', de: 'Regiere dein Reich ein Spieljahr lang.' },
    check: (s, _w, _n, c) => ruled(s, c) >= YEAR },
  { key: 'decade', icon: '⌛', name: { en: 'A Decade of Rule', de: 'Ein Jahrzehnt der Herrschaft' },
    desc: { en: 'Rule your realm for ten in-game years.', de: 'Regiere dein Reich zehn Spieljahre lang.' },
    check: (s, _w, _n, c) => ruled(s, c) >= 10 * YEAR },
  { key: 'century', icon: '⌛', name: { en: 'A Century Endured', de: 'Ein Jahrhundert überdauert' },
    desc: { en: 'Rule your realm for one hundred in-game years.', de: 'Regiere dein Reich hundert Spieljahre lang.' },
    check: (s, _w, _n, c) => ruled(s, c) >= 100 * YEAR },
  { key: 'first_victory', icon: '⚔', name: { en: 'First Victory in the Field', de: 'Erster Sieg im Feld' },
    desc: { en: 'Win a battle.', de: 'Gewinne eine Schlacht.' },
    check: (_s, _w, n, c) => n.stats.battlesWon - c.join.battlesWon >= 1 },
  { key: 'seasoned_commander', icon: '⚔', name: { en: 'Seasoned Commander', de: 'Erfahrener Feldherr' },
    desc: { en: 'Win 25 battles.', de: 'Gewinne 25 Schlachten.' },
    check: (_s, _w, n, c) => n.stats.battlesWon - c.join.battlesWon >= 25 },
  { key: 'victorious_peace', icon: '🕊', name: { en: 'Victorious Peace', de: 'Siegreicher Frieden' },
    desc: { en: 'End a war as the victor.', de: 'Beende einen Krieg als Sieger.' },
    check: (_s, _w, n, c) => n.stats.warsWon - c.join.warsWon >= 1 },
  { key: 'broad_domains', icon: '⛰', name: { en: 'Broad Domains', de: 'Weite Lande' },
    desc: { en: 'Double the number of locations you held when you took the throne (at least 20).', de: 'Verdopple die Zahl deiner Orte seit der Thronbesteigung (mindestens 20).' },
    check: (s, w, n, c) => { const k = ownedLocs(s, w, n.id).length; return k >= 20 && k >= c.join.locs * 2; } },
  { key: 'hundred_places', icon: '⛰', name: { en: 'A Realm of a Hundred Places', de: 'Ein Reich aus hundert Orten' },
    desc: { en: 'Hold 100 locations.', de: 'Besitze 100 Orte.' },
    check: (s, w, n) => ownedLocs(s, w, n.id).length >= 100 },
  { key: 'full_coffers', icon: '⛁', name: { en: 'Full Coffers', de: 'Volle Truhen' },
    desc: { en: 'Hold two years of income in the treasury.', de: 'Halte zwei Jahreseinnahmen in der Schatzkammer.' },
    check: (_s, _w, n) => { const i = income(n); return i > 0 && n.treasury >= i * 24; } },
  { key: 'no_lender', icon: '⛁', name: { en: 'Free of Lenders', de: 'Frei von Gläubigern' },
    desc: { en: 'Rule ten years and owe nothing to anyone.', de: 'Regiere zehn Jahre und schulde niemandem etwas.' },
    check: (s, _w, n, c) => ruled(s, c) >= 10 * YEAR && n.loans.length === 0 && n.debt <= 0 },
  { key: 'concord', icon: '☮', name: { en: 'Harmony of the Realm', de: 'Eintracht im Reich' },
    desc: { en: 'Reach a Concord of 75.', de: 'Erreiche eine Eintracht von 75.' },
    check: (_s, _w, n) => n.concord >= 75 },
  { key: 'mandate', icon: '♕', name: { en: 'Unquestioned Mandate', de: 'Unbestrittenes Mandat' },
    desc: { en: 'Reach a Mandate of 95.', de: 'Erreiche ein Mandat von 95.' },
    check: (_s, _w, n) => n.mandate >= 95 },
  { key: 'renowned', icon: '★', name: { en: 'Renowned', de: 'Ruhmreich' },
    desc: { en: 'Reach a Prestige of 80.', de: 'Erreiche ein Ansehen von 80.' },
    check: (_s, _w, n) => n.prestige >= 80 },
  { key: 'house_of_learning', icon: '✎', name: { en: 'House of Learning', de: 'Haus der Gelehrsamkeit' },
    desc: { en: 'Reach a combined Learning level of 30.', de: 'Erreiche eine gesamte Gelehrsamkeit von 30.' },
    check: (_s, _w, n) => n.tech[0] + n.tech[1] + n.tech[2] >= 30 },
  { key: 'new_age', icon: '☀', name: { en: 'Dawn of a New Age', de: 'Anbruch eines neuen Zeitalters' },
    desc: { en: 'Lead your realm into a new era.', de: 'Führe dein Reich in ein neues Zeitalter.' },
    check: (_s, _w, n) => n.era >= 1 },
  { key: 'master_builder', icon: '⌂', name: { en: 'Master Builder', de: 'Baumeister' },
    desc: { en: 'Have 40 building levels across your locations.', de: 'Besitze 40 Gebäudestufen in deinen Orten.' },
    check: (s, w, n) => { const B = s.loc.buildings.length / w.L; let k = 0; for (const l of ownedLocs(s, w, n.id)) for (let b = 0; b < B; b++) k += s.loc.buildings[l * B + b]; return k >= 40; } },
  { key: 'beyond_the_sea', icon: '⚓', name: { en: 'Beyond the Sea', de: 'Jenseits des Meeres' },
    desc: { en: 'Hold land across the Atlantic.', de: 'Besitze Land jenseits des Atlantiks.' },
    check: (s, w, n) => ownedLocs(s, w, n.id).some((l) => w.lon[l] < -30) },
  { key: 'unity_of_faith', icon: '✝', name: { en: 'Unity of Faith', de: 'Einheit des Glaubens' },
    desc: { en: 'Hold at least 15 locations, all of your faith.', de: 'Besitze mindestens 15 Orte, alle deines Glaubens.' },
    check: (s, w, n) => { const ls = ownedLocs(s, w, n.id); return ls.length >= 15 && ls.every((l) => s.loc.faith[l] === n.faith); } },
  { key: 'merchant_prince', icon: '⚖', name: { en: 'Merchant Prince', de: 'Handelsfürst' },
    desc: { en: 'Earn at least 40% of your income from trade and tariffs.', de: 'Erziele mindestens 40 % deiner Einnahmen aus Handel und Zöllen.' },
    check: (_s, _w, n) => { const i = income(n); return i > 10 && ((n.income.trade || 0) + (n.income.tariffs || 0) + (n.income.ventures || 0)) >= i * 0.4; } },
  { key: 'long_peace', icon: '🕊', name: { en: 'The Long Peace', de: 'Der lange Frieden' },
    desc: { en: 'Keep your realm out of war for 25 years.', de: 'Halte dein Reich 25 Jahre lang aus jedem Krieg heraus.' },
    check: (s, _w, n, c) => !atWar(s, n.id) && s.day - Math.max(c.lastWarDay, c.joinDay) >= 25 * YEAR },
  { key: 'bond_of_equals', icon: '⚭', name: { en: 'Bond of Equals', de: 'Bund unter Gleichen' },
    desc: { en: 'Conclude an alliance with a realm ruled by another player.', de: 'Schließe ein Bündnis mit einem Reich, das ein anderer Spieler regiert.' },
    check: (s, _w, n) => s.treaties.some((t) => t.type === 'alliance' && (t.a === n.id || t.b === n.id) && !!s.nations[t.a === n.id ? t.b : t.a]?.playerId) },
  { key: 'among_the_great', icon: '♛', name: { en: 'Among the Great', de: 'Unter den Großen' },
    desc: { en: 'Be ranked among the eight great powers.', de: 'Zähle zu den acht Großmächten.' },
    check: (s, _w, n) => s.ranking.slice(0, 8).includes(n.id) },
  { key: 'against_all_odds', icon: '⛨', name: { en: 'Against All Odds', de: 'Allen Widrigkeiten zum Trotz' },
    desc: { en: 'Still rule your realm when the season ends.', de: 'Regiere dein Reich noch, wenn die Saison endet.' },
    check: (_s, _w, n, c) => c.seasonEnded && n.alive },
  { key: 'crown_of_the_age', icon: '♚', name: { en: 'Crown of the Age', de: 'Krone des Zeitalters' },
    desc: { en: 'Finish a season with the highest score of all realms.', de: 'Beende eine Saison mit der höchsten Punktzahl aller Reiche.' },
    check: (_s, _w, _n, c) => c.seasonEnded && c.finalRank === 1 },
  { key: 'podium', icon: '♜', name: { en: 'Hall of Fame', de: 'Ruhmeshalle' },
    desc: { en: 'Finish a season among the ten highest-scoring realms.', de: 'Beende eine Saison unter den zehn Reichen mit den meisten Punkten.' },
    check: (_s, _w, _n, c) => c.seasonEnded && c.finalRank >= 1 && c.finalRank <= 10 },
];

/** Honours for the state of a realm count only after a year on the throne, so they reward the player's own rule
 *  rather than the choice of a large realm. */
export const AFTER_FIRST_YEAR = new Set(['hundred_places', 'full_coffers', 'concord', 'mandate', 'renowned', 'house_of_learning', 'master_builder',
  'beyond_the_sea', 'unity_of_faith', 'merchant_prince', 'among_the_great']);

export const ACHIEVEMENT_INDEX: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.key, a]));

/** Keys newly earned by this seat (not in `have`). */
export function checkAchievements(s: GameState, w: World, nation: number, ctx: AchievementCtx, have: Iterable<string>): string[] {
  const n = s.nations[nation]; if (!n) return [];
  const got = new Set(have); const out: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (got.has(a.key)) continue;
    if (!n.alive && a.key !== 'crown_of_the_age' && a.key !== 'podium') continue;
    if (AFTER_FIRST_YEAR.has(a.key) && s.day - ctx.joinDay < YEAR) continue;
    try { if (a.check(s, w, n, ctx)) out.push(a.key); } catch { /* a check never breaks the server */ }
  }
  return out;
}
