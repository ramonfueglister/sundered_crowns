// Chronicle export (spec point 85): the chronicle of a game as Markdown in the chosen language, or as JSON with both
// languages, for the chronicle panel and the end screen. The formatting is pure (tests/chronexport.test.ts); only
// downloadText touches the browser.
import type { ChronEntry, I18n } from '../sim/types';
import { dayToDate, fmtDate } from '../sim/calendar';

export interface ChronNation { id: number; name: I18n; short: I18n }
export interface ChronExport {
  entries: ChronEntry[]; startYear: number; endDay: number; lang: 'en' | 'de';
  nations: ChronNation[]; player: number;
  /** only the entries of the player's realm */
  own?: boolean;
  /** how the game ended, already in the chosen language (end screen) */
  ending?: string;
}

/** Headings of the chronicle kinds (Markdown export). */
const KIND: Record<string, [string, string]> = {
  war: ['War', 'Krieg'], peace: ['Peace', 'Frieden'], battle: ['Battle', 'Schlacht'], siege: ['Siege', 'Belagerung'], event: ['Event', 'Ereignis'],
  doctrine: ['Doctrine', 'Lehre'], great_power: ['Great power', 'Großmacht'], ruler: ['Ruler', 'Herrscher'], succession: ['Succession', 'Thronfolge'],
  tech: ['Learning', 'Wissen'], era: ['Era', 'Zeitalter'], colony: ['Colony', 'Kolonie'], discovery: ['Discovery', 'Entdeckung'], revolt: ['Revolt', 'Aufstand'],
  faith: ['Faith', 'Glaube'], reform: ['Reform', 'Reform'], victory: ['Victory', 'Sieg'], fall: ['Fall of a realm', 'Untergang eines Reiches'],
  independence: ['Independence', 'Unabhängigkeit'], union: ['Union', 'Union'], civil_war: ['Civil war', 'Bürgerkrieg'], situation: ['Situation', 'Lage'], emperor: ['Emperor', 'Kaiser'],
  alliance: ['Alliance', 'Bündnis'], marriage: ['Marriage', 'Heirat'], vassal: ['Vassal', 'Vasall'], goal: ['Goal', 'Ziel'], bankruptcy: ['Bankruptcy', 'Bankrott'],
  decision: ['Decision', 'Beschluss'], coalition: ['Common Front', 'Gemeinsame Front'], crisis: ['Crisis', 'Krise'], innovation: ['Innovation', 'Neuerung'],
  landmark: ['Landmark', 'Wahrzeichen'], integration: ['Integration', 'Eingliederung'], excommunication: ['Excommunication', 'Kirchenbann'], explore: ['Exploration', 'Erkundung'],
  company: ['Company', 'Kompanie'], embargo: ['Embargo', 'Embargo'], election: ['Election', 'Wahl'], diet: ['Diet', 'Reichstag'], rebels: ['Rebels', 'Aufständische'],
};
export const kindLabel = (k: string, lang: 'en' | 'de') => KIND[k]?.[lang === 'de' ? 1 : 0] ?? k.replace(/_/g, ' ');

function select(x: ChronExport): ChronEntry[] {
  return x.entries.filter((e) => !x.own || x.player < 0 || e.nation === x.player);
}
const nameOf = (x: ChronExport, id: number, full = false) => { const n = x.nations.find((m) => m.id === id); return n ? (full ? n.name : n.short)[x.lang] : ''; };
/** Markdown special characters in running text (so a name like "*Lion*" stays plain text). */
const esc = (s: string) => s.replace(/([\\`*_[\]#|<>])/g, '\\$1');

/** The chronicle as a Markdown document: a heading, the span of years, one section per year, one line per entry. */
export function chronicleMarkdown(x: ChronExport): string {
  const de = x.lang === 'de'; const list = select(x);
  const realm = x.player >= 0 ? nameOf(x, x.player, true) : '';
  const y0 = x.startYear, y1 = dayToDate(x.endDay, x.startYear).y;
  const out: string[] = [];
  out.push(`# ${de ? 'Chronik' : 'Chronicle'}${realm ? (de ? `: ${esc(realm)}` : ` of ${esc(realm)}`) : ''}`, '');
  out.push(`${de ? 'Sundered Crowns, die Jahre' : 'Sundered Crowns, the years'} ${y0}${de ? ' bis ' : ' to '}${y1}. ${list.length} ${de ? (list.length === 1 ? 'Eintrag' : 'Einträge') : (list.length === 1 ? 'entry' : 'entries')}${x.own && x.player >= 0 ? (de ? ' des eigenen Reiches' : ' of our own realm') : ''}.`, '');
  if (x.ending) out.push(`**${esc(x.ending)}**`, '');
  let year = -1;
  for (const e of list) {
    const y = dayToDate(e.day, x.startYear).y;
    if (y !== year) { year = y; out.push(`## ${y}`, ''); }
    const who = e.nation >= 0 && e.nation !== x.player ? ` (${esc(nameOf(x, e.nation))})` : '';
    out.push(`- ${fmtDate(e.day, x.startYear, x.lang)}, ${kindLabel(e.kind, x.lang)}${who}: ${esc(e.text[x.lang])}`);
  }
  if (!list.length) out.push(de ? '_Die Chronik ist leer._' : '_The chronicle is empty._');
  return out.join('\n') + '\n';
}

/** The chronicle as JSON: both languages, the date as text and as day number, the realm's names. */
export function chronicleJson(x: ChronExport): string {
  const list = select(x);
  const ids = [...new Set(list.map((e) => e.nation).filter((n) => n >= 0))];
  return JSON.stringify({
    game: 'Sundered Crowns', startYear: x.startYear, endYear: dayToDate(x.endDay, x.startYear).y, player: x.player, own: !!x.own, ending: x.ending,
    nations: Object.fromEntries(ids.map((id) => { const n = x.nations.find((m) => m.id === id); return [id, n ? { name: n.name, short: n.short } : null]; })),
    entries: list.map((e) => ({ day: e.day, date: { en: fmtDate(e.day, x.startYear, 'en'), de: fmtDate(e.day, x.startYear, 'de') }, year: dayToDate(e.day, x.startYear).y, kind: e.kind, nation: e.nation, loc: e.loc, text: e.text })),
  }, null, 1);
}

/** File name of an export ("chronik-portugal-1356-1444.md"). */
export function exportName(x: ChronExport, ext: 'md' | 'json'): string {
  const realm = x.player >= 0 ? nameOf(x, x.player) : 'world';
  const slug = realm.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'world';
  return `${x.lang === 'de' ? 'chronik' : 'chronicle'}-${slug}-${x.startYear}-${dayToDate(x.endDay, x.startYear).y}.${ext}`;
}

/** Offers a text file for download. */
export function downloadText(name: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
