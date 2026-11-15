// Interface texts in English and German. Texts from the world (realm and culture names) are already bilingual.
import { signal } from '@preact/signals';
import type { I18n } from '../sim/i18n';

const saved = (() => { try { return localStorage.getItem('sc.lang'); } catch { return null; } })();
export const lang = signal<'en' | 'de'>(saved === 'de' || saved === 'en' ? saved : (navigator.language || 'en').startsWith('de') ? 'de' : 'en');
export function setLang(l: 'en' | 'de') { lang.value = l; try { localStorage.setItem('sc.lang', l); } catch { /* private mode */ } }

/** The current language's text of a bilingual value. */
export function L(t: I18n | string | undefined | null): string { if (!t) return ''; if (typeof t === 'string') return t; return t[lang.value] ?? t.en; }

const S = {
  title: ['Sundered Crowns', 'Sundered Crowns'],
  tagline: ['A persistent world, 1356 onwards', 'Eine persistente Welt, ab 1356'],
  enter: ['Enter the world', 'Welt betreten'],
  display_name: ['Display name', 'Anzeigename'],
  dev_login: ['Development server: sign in with a display name only.', 'Entwicklungsserver: Anmeldung nur mit Anzeigename.'],
  email: ['E-mail address', 'E-Mail-Adresse'],
  send_link: ['Send sign-in link', 'Anmeldelink senden'],
  link_sent: ['Check your mail for the sign-in link.', 'Prüfe deine E-Mails auf den Anmeldelink.'],
  sign_out: ['Sign out', 'Abmelden'],
  connecting: ['Connecting to the world…', 'Verbinde mit der Welt…'],
  disconnected: ['The connection to the world was lost. Reconnecting…', 'Die Verbindung zur Welt ist abgerissen. Verbinde neu…'],
  no_webgpu: ['This browser cannot draw the map: it needs WebGPU (a current Chrome, Edge or Safari).', 'Dieser Browser kann die Karte nicht zeichnen: Er braucht WebGPU (aktuelles Chrome, Edge oder Safari).'],
  players: ['Players', 'Spieler'],
  realm: ['Realm', 'Reich'],
  your_realm: ['Your realm', 'Dein Reich'],
  no_realm: ['You rule no realm yet. Pick one on the map.', 'Du regierst noch kein Reich. Wähle eines auf der Karte.'],
  claim: ['Take up this crown', 'Diese Krone übernehmen'],
  abdicate: ['Abdicate', 'Abdanken'],
  ruled_by: ['Ruled by', 'Regiert von'],
  no_player: ['No player', 'Kein Spieler'],
  places: ['Places', 'Orte'],
  capital: ['Capital', 'Hauptstadt'],
  owner: ['Owner', 'Besitzer'],
  nobody: ['Nobody', 'Niemand'],
  terrain: ['Terrain', 'Gelände'],
  resource: ['Resource', 'Rohstoff'],
  culture: ['Culture', 'Kultur'],
  faith: ['Faith', 'Glaube'],
  population: ['Population', 'Bevölkerung'],
  harvest: ['Grain harvest', 'Getreideernte'],
  harvest_year: ['Food in the year', 'Nahrung im Jahr'],
  harvest_head: ['Per head and day', 'Pro Kopf und Tag'],
  harvest_land: ['Land', 'Landfläche'],
  harvest_yield: ['Yield of the soil', 'Ertragskraft des Bodens'],
  harvest_farmers: ['In agriculture', 'In der Landwirtschaft'],
  arable: ['Cultivated land', 'Bestellte Fläche'],
  arable_state: ['Land', 'Lage'],
  arable_free: ['land to spare', 'freies Land'],
  arable_limit: ['at the land limit', 'an der Landgrenze'],
  arable_none: ['no land with a yield', 'kein Land mit Ertrag'],
  arable_yield: ['Yield of the cultivated soil', 'Ertragskraft des bestellten Bodens'],
  economy_england: ['Economy of England', 'Volkswirtschaft England'],
  economy_note: ['All of England in {year}, at the scale 1:100', 'Ganz England im Jahr {year}, im Massstab 1:100'],
  economy_note_days: ['All of England, the last 365 days up to {date}, at the scale 1:100', 'Ganz England, die letzten 365 Tage bis zum {date}, im Massstab 1:100'],
  economy_gdp: ['Real GDP', 'Reales BIP'],
  economy_level: ['Level ({base} = 100)', 'Stand ({base} = 100)'],
  economy_prices: ['Price level ({base} = 100)', 'Preisniveau ({base} = 100)'],
  economy_prices_today: ['Price level today ({base} = 100)', 'Preisniveau heute ({base} = 100)'],
  economy_consumption: ['Household consumption', 'Konsum der Haushalte'],
  economy_crown: ['Crown spending', 'Ausgaben der Krone'],
  economy_investment: ['Investment', 'Investitionen'],
  economy_exports: ['Exports', 'Ausfuhr'],
  economy_imports: ['Imports', 'Einfuhr'],
  economy_employed: ['At work', 'Beschäftigte'],
  economy_unemployed: ['Without work', 'Ohne Arbeit'],
  economy_coin_households: ['Coin of households', 'Münzgeld der Haushalte'],
  economy_coin_firms: ['Coin of firms', 'Münzgeld der Betriebe'],
  economy_halted: ['The economy stands still since {why}', 'Die Volkswirtschaft steht still seit {why}'],
  no_data: ['no data', 'keine Daten'],
  close: ['Close', 'Schließen'],
  paused: ['Paused', 'Angehalten'],
  settings: ['Settings', 'Einstellungen'],
  language: ['Language', 'Sprache'],
  map_tools: ['Map tools', 'Kartenwerkzeuge'],
  to_my_realm: ['To my realm', 'Zu meinem Reich'],
  whole_map: ['Whole map', 'Ganze Karte'],
  fullscreen: ['Full screen', 'Vollbild'],
  music: ['Music', 'Musik'],
  music_on: ['Turn on', 'Einschalten'],
  music_off: ['Turn off', 'Ausschalten'],
  music_volume: ['Music volume', 'Lautstärke der Musik'],
  music_next: ['Next piece', 'Nächstes Stück'],
  music_is_off: ['Music is off', 'Musik ist aus'],
  music_waiting: ['Starts with your next click', 'Beginnt mit deinem nächsten Klick'],
  music_credit: ['Music: made for Apoleia with AI (Suno).', 'Musik: für Apoleia mit KI erzeugt (Suno).'],
  arms_credit: ['Lion of Saint Mark: after Samhanin,', 'Markuslöwe: nach Samhanin,'],
} as const satisfies Record<string, readonly [string, string]>;
export type TextKey = keyof typeof S;

export function t(k: TextKey, vars?: Record<string, string | number>): string {
  let s: string = S[k][lang.value === 'de' ? 1 : 0];
  if (vars) for (const [a, b] of Object.entries(vars)) s = s.replaceAll(`{${a}}`, String(b));
  return s;
}

const TERRAIN_DE: Record<string, string> = {
  plains: 'Ebene', farmland: 'Ackerland', forest: 'Wald', hills: 'Hügel', mountains: 'Gebirge', marsh: 'Sumpf', steppe: 'Steppe',
  desert: 'Wüste', jungle: 'Dschungel', tundra: 'Tundra', wasteland: 'Ödland',
};
const RESOURCE_DE: Record<string, string> = {
  none: '–', grain: 'Getreide', livestock: 'Vieh', fish: 'Fisch', timber: 'Holz', wool: 'Wolle', flax: 'Flachs', cotton: 'Baumwolle', furs: 'Pelze',
  horses: 'Pferde', honey: 'Honig', salt: 'Salz', stone: 'Stein', iron_ore: 'Eisenerz', copper: 'Kupfer', tin: 'Zinn', gold: 'Gold', silver: 'Silber',
  saltpeter: 'Salpeter', alum: 'Alaun', amber: 'Bernstein', grapes: 'Trauben', olives: 'Oliven', dyes: 'Farbstoffe', silk: 'Seide', spices: 'Gewürze',
  sugarcane: 'Zuckerrohr', tobacco: 'Tabak', coffee: 'Kaffee',
};
const words = (id: string) => id.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
export const terrainName = (id: string) => (lang.value === 'de' ? TERRAIN_DE[id] ?? id : words(id));
export const resourceName = (id: string) => (lang.value === 'de' ? RESOURCE_DE[id] ?? id : id === 'none' ? '–' : words(id));
export const num = (v: number) => Math.round(v).toLocaleString(lang.value === 'de' ? 'de-DE' : 'en-GB');
/** A share as per cent with one decimal. */
export const pct = (v: number) => `${(100 * v).toLocaleString(lang.value === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 1 })} %`;
/** An amount of money in pounds. */
export const pounds = (v: number) => `£ ${num(v)}`;
/** An index with one decimal (100 = the base). */
export const index = (v: number) => v.toLocaleString(lang.value === 'de' ? 'de-DE' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** A large amount of kilocalories in millions or billions. */
export function kcalText(v: number): string {
  const de = lang.value === 'de', f = (x: number) => x.toLocaleString(de ? 'de-DE' : 'en-GB', { maximumSignificantDigits: 3 });
  if (v >= 1e9) return `${f(v / 1e9)} ${de ? 'Mrd.' : 'bn'} kcal`;
  if (v >= 1e6) return `${f(v / 1e6)} ${de ? 'Mio.' : 'm'} kcal`;
  return `${num(v)} kcal`;
}
