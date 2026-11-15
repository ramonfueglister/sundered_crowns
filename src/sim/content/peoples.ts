// Cultures, culture groups and faiths of the start setup (names in English and German).
import type { I18n } from '../i18n';

export const CULTURE_GROUPS: Record<string, string[]> = {
  british: ['english', 'scottish', 'irish', 'welsh'],
  gallic: ['french', 'occitan', 'breton', 'picard', 'burgundian_fr'],
  iberian: ['castilian', 'portuguese', 'galician', 'catalan', 'aragonese', 'basque', 'andalusi'],
  low_lands: ['flemish', 'hollandic', 'frisian'],
  german: ['low_saxon', 'central_german', 'bavarian', 'alemannic', 'franconian', 'rhinelander', 'prussian_german'],
  italian: ['romansh', 'tuscan', 'lombard', 'venetian', 'ligurian', 'neapolitan', 'sicilian', 'sardinian', 'roman'],
  west_slavic: ['czech', 'slovak', 'polish', 'silesian', 'sorbian', 'pomeranian'],
  east_slavic: ['russian', 'ruthenian', 'novgorodian'],
  south_slavic: ['croatian', 'serbian', 'bosnian', 'bulgarian', 'slovene'],
  baltic: ['lithuanian', 'latvian', 'old_prussian', 'samogitian'],
  finnic: ['finnish', 'estonian', 'karelian', 'sami', 'mordvin', 'komi'],
  norse: ['swedish', 'danish', 'norwegian', 'icelandic'],
  carpathian: ['hungarian', 'vlach', 'szekely'],
  hellenic: ['greek', 'albanian'],
  caucasian: ['armenian', 'georgian', 'circassian', 'dagestani', 'assyrian'],
  turkic: ['anatolian_turkish', 'turkmen', 'tatar', 'bashkir', 'crimean', 'azeri', 'kipchak_nomad'],
  mongolic: ['mongol'],
  arab: ['maghrebi', 'egyptian_arab', 'levantine', 'iraqi_arab', 'bedouin', 'hejazi', 'yemeni'],
  berber: ['berber', 'tuareg', 'guanche'],
  iranian: ['persian', 'kurdish', 'lur', 'baluch', 'pashtun', 'sindhi', 'alan'],
  jewish: ['ashkenazi', 'sephardi'],
  african: ['mande', 'wolof', 'songhai', 'hausa', 'akan', 'yoruba', 'kongo', 'amhara', 'nubian', 'somali', 'kanuri', 'swahili', 'shona', 'edo', 'afar', 'bantu', 'beja', 'fulani', 'fur', 'igbo', 'khoisan', 'kru', 'luba', 'malagasy', 'mossi', 'nguni', 'nilotic', 'oromo', 'sotho', 'ubangian'],
  american: ['taino', 'carib', 'nahua', 'maya', 'mississippian', 'algonquian', 'iroquoian', 'tupi', 'muisca', 'quechua', 'guarani', 'purepecha', 'chimu', 'arawak', 'aymara', 'chibchan', 'chichimec', 'diaguita', 'ge', 'guaycuru', 'inuit', 'mapuche', 'mixtec', 'siouan', 'tehuelche'],
  northern: ['samoyed', 'ob_ugric', 'mari', 'chuvash'],
  other: ['unknown'],
};
export const GROUP_OF: Record<string, string> = {};
for (const [g, ms] of Object.entries(CULTURE_GROUPS)) for (const m of ms) GROUP_OF[m] = g;
export const ALL_CULTURES: string[] = Object.values(CULTURE_GROUPS).flat();

export function cultureName(id: string): string {
  return id.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ').trim();
}
const CULTURE_DE: Record<string, string> = {
  english: 'Englisch', scottish: 'Schottisch', irish: 'Irisch', welsh: 'Walisisch', french: 'Französisch', occitan: 'Okzitanisch',
  breton: 'Bretonisch', picard: 'Pikardisch', burgundian_fr: 'Burgundisch', castilian: 'Kastilisch', portuguese: 'Portugiesisch',
  galician: 'Galicisch', catalan: 'Katalanisch', aragonese: 'Aragonesisch', basque: 'Baskisch', andalusi: 'Andalusisch',
  flemish: 'Flämisch', hollandic: 'Holländisch', frisian: 'Friesisch', low_saxon: 'Niedersächsisch', central_german: 'Mitteldeutsch',
  bavarian: 'Bairisch', alemannic: 'Alemannisch', franconian: 'Fränkisch', rhinelander: 'Rheinländisch', prussian_german: 'Preußisch',
  romansh: 'Rätoromanisch', tuscan: 'Toskanisch', lombard: 'Lombardisch', venetian: 'Venezianisch', ligurian: 'Ligurisch',
  neapolitan: 'Neapolitanisch', sicilian: 'Sizilianisch', sardinian: 'Sardisch', roman: 'Römisch', czech: 'Tschechisch', slovak: 'Slowakisch',
  polish: 'Polnisch', silesian: 'Schlesisch', sorbian: 'Sorbisch', pomeranian: 'Pommersch', russian: 'Russisch', ruthenian: 'Ruthenisch',
  novgorodian: 'Nowgoroder', croatian: 'Kroatisch', serbian: 'Serbisch', bosnian: 'Bosnisch', bulgarian: 'Bulgarisch', slovene: 'Slowenisch',
  lithuanian: 'Litauisch', latvian: 'Lettisch', old_prussian: 'Altpreußisch', samogitian: 'Schemaitisch', finnish: 'Finnisch',
  estonian: 'Estnisch', karelian: 'Karelisch', sami: 'Samisch', mordvin: 'Mordwinisch', komi: 'Komi', swedish: 'Schwedisch',
  danish: 'Dänisch', norwegian: 'Norwegisch', icelandic: 'Isländisch', hungarian: 'Ungarisch', vlach: 'Walachisch', szekely: 'Szeklerisch',
  greek: 'Griechisch', albanian: 'Albanisch', armenian: 'Armenisch', georgian: 'Georgisch', circassian: 'Tscherkessisch',
  dagestani: 'Dagestanisch', assyrian: 'Assyrisch', anatolian_turkish: 'Anatolisch-Türkisch', turkmen: 'Turkmenisch', tatar: 'Tatarisch',
  bashkir: 'Baschkirisch', crimean: 'Krimtatarisch', azeri: 'Aserbaidschanisch', kipchak_nomad: 'Kiptschakisch', mongol: 'Mongolisch',
  maghrebi: 'Maghrebinisch', egyptian_arab: 'Ägyptisch-Arabisch', levantine: 'Levantinisch', iraqi_arab: 'Irakisch-Arabisch',
  bedouin: 'Beduinisch', hejazi: 'Hedschasisch', yemeni: 'Jemenitisch', berber: 'Berberisch', tuareg: 'Tuareg', guanche: 'Guanchisch',
  persian: 'Persisch', kurdish: 'Kurdisch', lur: 'Lurisch', baluch: 'Belutschisch', pashtun: 'Paschtunisch', sindhi: 'Sindhi', alan: 'Alanisch',
  ashkenazi: 'Aschkenasisch', sephardi: 'Sephardisch', nubian: 'Nubisch', somali: 'Somalisch', swahili: 'Swahili', amhara: 'Amharisch',
  taino: 'Taíno', carib: 'Karibisch', maya: 'Maya', mississippian: 'Mississippisch', algonquian: 'Algonkin', iroquoian: 'Irokesisch',
  inuit: 'Inuit', samoyed: 'Samojedisch', ob_ugric: 'Obugrisch', mari: 'Mari', chuvash: 'Tschuwaschisch', unknown: 'Unbekannt',
};
/** Culture name in both languages. */
export function cultureLabel(id: string): I18n { const en = cultureName(id); return { en, de: CULTURE_DE[id] ?? en }; }

export interface FaithDef { id: string; name: I18n; family: string; color: string }
export const FAITHS: FaithDef[] = [
  { id: 'latin', name: { en: 'Latin Church', de: 'Lateinische Kirche' }, family: 'christian', color: '#d8c36a' },
  { id: 'orthodox', name: { en: 'Orthodox Church', de: 'Orthodoxe Kirche' }, family: 'christian', color: '#c97a3d' },
  { id: 'sunni', name: { en: 'Sunni Islam', de: 'Sunnitischer Islam' }, family: 'muslim', color: '#2e7d32' },
  { id: 'shia', name: { en: 'Shia Islam', de: 'Schiitischer Islam' }, family: 'muslim', color: '#1b5e20' },
  { id: 'ibadi', name: { en: 'Ibadi Islam', de: 'Ibaditischer Islam' }, family: 'muslim', color: '#33691e' },
  { id: 'jewish', name: { en: 'Judaism', de: 'Judentum' }, family: 'jewish', color: '#5c6bc0' },
  { id: 'tengri', name: { en: 'Tengri worship', de: 'Tengri-Glaube' }, family: 'traditional', color: '#90a4ae' },
  { id: 'baltic_old', name: { en: 'Old Baltic faith', de: 'Alter baltischer Glaube' }, family: 'traditional', color: '#8d6e63' },
  { id: 'finnic_old', name: { en: 'Old Finnic faith', de: 'Alter finnischer Glaube' }, family: 'traditional', color: '#a1887f' },
  { id: 'sami_old', name: { en: 'Sámi faith', de: 'Samischer Glaube' }, family: 'traditional', color: '#bcaaa4' },
  { id: 'coptic', name: { en: 'Coptic Church', de: 'Koptische Kirche' }, family: 'christian', color: '#ad8b4e' },
  { id: 'ethiopian', name: { en: 'Ethiopian Church', de: 'Äthiopische Kirche' }, family: 'christian', color: '#bf8b3e' },
  { id: 'church_of_east', name: { en: 'Church of the East', de: 'Kirche des Ostens' }, family: 'christian', color: '#9e8f5e' },
  { id: 'armenian_apostolic', name: { en: 'Armenian Church', de: 'Armenische Kirche' }, family: 'christian', color: '#b26a3a' },
  { id: 'african_traditional', name: { en: 'African traditional faiths', de: 'Afrikanische Religionen' }, family: 'traditional', color: '#795548' },
  { id: 'american_traditional', name: { en: 'Native American faiths', de: 'Indigene Religionen Amerikas' }, family: 'traditional', color: '#6d4c41' },
  { id: 'mesoamerican', name: { en: 'Mesoamerican faith', de: 'Mesoamerikanische Religion' }, family: 'traditional', color: '#e65100' },
  { id: 'andean', name: { en: 'Andean faith', de: 'Andine Religion' }, family: 'traditional', color: '#ff8f00' },
  { id: 'bosnian_church', name: { en: 'Bosnian Church', de: 'Bosnische Kirche' }, family: 'christian', color: '#a0785a' },
  { id: 'syriac_orthodox', name: { en: 'Syriac Church', de: 'Syrische Kirche' }, family: 'christian', color: '#b09a6e' },
  { id: 'hindu', name: { en: 'Hindu traditions', de: 'Hinduistische Traditionen' }, family: 'dharmic', color: '#ff7043' },
  { id: 'hussite', name: { en: 'Hussite Church', de: 'Hussitische Kirche' }, family: 'christian', color: '#7e57c2' },
  { id: 'evangelical', name: { en: 'Evangelical Church', de: 'Evangelische Kirche' }, family: 'christian', color: '#5e35b1' },
  { id: 'reformed', name: { en: 'Reformed Church', de: 'Reformierte Kirche' }, family: 'christian', color: '#3949ab' },
  { id: 'anglican_type', name: { en: 'National Church', de: 'Nationalkirche' }, family: 'christian', color: '#8e24aa' },
];
export const FAITH_INDEX: Record<string, number> = Object.fromEntries(FAITHS.map((f, i) => [f.id, i]));
export function faithFamily(i: number) { return FAITHS[i]?.family ?? 'traditional'; }
