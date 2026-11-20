// Which pool of genes the founders of a culture draw their looks from (portrait round 111; Ramon, 18 November 2026:
// the portraits must be able to show every people of the world, as Apoleia's generator could).
//
// Until then a founder drew from the pool of the place (genes.ts `origin`: coarse boxes round the seven regions of
// Apoleia's Roman world), so the people of Beijing drew from the Greek pool and those of Delhi from the Syrian one.
// A person's looks go with the people they come from, not with the ground they stand on: a Jewish family of Troyes
// and a French one, a Genoese of Caffa and a Kipchak. So the pool is the culture's; only a person whose culture is
// not known draws by the place.
//
// PLACEHOLDER throughout, by what is commonly described of each people, not from tables read for this: the pools
// themselves (portrait/src/dna.rs `RANGES`) and which culture draws from which. A pool is one mix for many peoples
// (all of Africa south of the Sahel but the Horn and the Khoisan draw from one), and a culture draws from one pool
// alone, where real peoples are mixed (the Swahili coast, Malagasy, the Turks of Anatolia). The table is here to be
// corrected people by people.
import { GROUP_OF } from '../content/peoples';
import { Origin, origin } from './genes';

/** The pool of each culture group (src/sim/content/peoples.ts `CULTURE_GROUPS`). */
const GROUP_POOL: Record<string, Origin> = {
  british: Origin.Gallia,
  gallic: Origin.Gallia,
  carpathian: Origin.Gallia,
  low_lands: Origin.Germania,
  german: Origin.Germania,
  norse: Origin.Germania,
  west_slavic: Origin.Germania,
  east_slavic: Origin.Germania,
  baltic: Origin.Germania,
  finnic: Origin.Germania,
  northern: Origin.Germania,
  iberian: Origin.Italia,
  italian: Origin.Italia,
  south_slavic: Origin.Italia,
  hellenic: Origin.Graecia,
  jewish: Origin.Graecia,
  caucasian: Origin.Iran,
  iranian: Origin.Iran,
  turkic: Origin.Steppe,
  central_asian: Origin.Steppe,
  mongolic: Origin.Siberia,
  siberian: Origin.Siberia,
  arab: Origin.Arabia,
  berber: Origin.Maghreb,
  african: Origin.Guinea,
  american: Origin.America,
  western_american: Origin.America,
  sinic: Origin.China,
  tibeto_burman: Origin.Tibet,
  indic: Origin.Hindustan,
  dravidian: Origin.Deccan,
  tai: Origin.Indochina,
  austroasiatic: Origin.Indochina,
  austronesian: Origin.Indochina,
  aboriginal: Origin.Australia,
};

/** The cultures that draw from another pool than their group. */
const CULTURE_POOL: Record<string, Origin> = {
  // Turks west of the Caspian, among the peoples they settled with
  anatolian_turkish: Origin.Iran,
  azeri: Origin.Iran,
  // the Arabs outside the peninsula: Apoleia's own pools for Syria and Egypt, the Maghreb's
  levantine: Origin.Syria,
  iraqi_arab: Origin.Syria,
  egyptian_arab: Origin.Aegyptus,
  maghrebi: Origin.Maghreb,
  sindhi: Origin.Hindustan,
  // Africa: the Horn and the Sahel's herders, the Khoisan, and Madagascar's settlers from over the ocean
  amhara: Origin.Horn,
  nubian: Origin.Horn,
  somali: Origin.Horn,
  afar: Origin.Horn,
  beja: Origin.Horn,
  oromo: Origin.Horn,
  fulani: Origin.Horn,
  khoisan: Origin.Kalahari,
  malagasy: Origin.Oceania,
  inuit: Origin.Siberia,
  samoyed: Origin.Siberia,
  ob_ugric: Origin.Siberia,
  jurchen: Origin.Siberia,
  burmese: Origin.Indochina,
  arakanese: Origin.Indochina,
  sinhala: Origin.Deccan,
  dhivehi: Origin.Deccan,
  dakhini: Origin.Deccan,
  polynesian: Origin.Oceania,
  maori: Origin.Oceania,
};

/** The pool the founders of a culture draw from; undefined for a culture that is not known ('unknown') or not in
 *  the list. */
export function poolOfCulture(culture: string | undefined): Origin | undefined {
  if (!culture) return undefined;
  return CULTURE_POOL[culture] ?? GROUP_POOL[GROUP_OF[culture]];
}

/** The pool of a founder: the culture's, else the place's (longitude and latitude in degrees). */
export function poolOf(culture: string | undefined, lon: number, lat: number): Origin {
  return poolOfCulture(culture) ?? origin(lon, lat);
}

/** The dress of a culture in the portraits (portrait/src/dress.rs `Dress::of`): what the builder is given as a
 *  person's origin. England's table is the only dress of 1356 that is drawn, from sources on London, on Norse
 *  Greenland and on the fashion of England and France; the cultures of the Latin west wear it until their own is
 *  drawn (PLACEHOLDER: gown, hood and veil were worn from Iceland to Sicily, their cuts and colours were not the
 *  same). Every other culture is given as itself, and wears the builder's plain dress of 1356. */
const LATIN_WEST = new Set(['british', 'gallic', 'low_lands', 'german', 'norse', 'italian', 'iberian']);
export function dressOf(culture: string): string {
  return LATIN_WEST.has(GROUP_OF[culture]) && culture !== 'andalusi' ? 'England' : culture;
}
