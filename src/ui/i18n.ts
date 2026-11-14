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
  no_data: ['no data', 'keine Daten'],
  close: ['Close', 'Schließen'],
  paused: ['Paused', 'Angehalten'],
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
/** A large amount of kilocalories in millions or billions. */
export function kcalText(v: number): string {
  const de = lang.value === 'de', f = (x: number) => x.toLocaleString(de ? 'de-DE' : 'en-GB', { maximumSignificantDigits: 3 });
  if (v >= 1e9) return `${f(v / 1e9)} ${de ? 'Mrd.' : 'bn'} kcal`;
  if (v >= 1e6) return `${f(v / 1e6)} ${de ? 'Mio.' : 'm'} kcal`;
  return `${num(v)} kcal`;
}
