// Cultures, culture groups and faiths. Mechanics are our own design.
import type { I18n } from '../types';

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

// Group-level traditions with real effects (applied through modifiers in the simulation)
export const GROUP_TRADITIONS: Record<string, { name: I18n; effects: Record<string, number> }> = {
  british: { name: { en: 'Yeoman archery', de: 'Freisassen-Bogenschützen' }, effects: { fire: 0.1, manpower: 0.05 } },
  gallic: { name: { en: 'Chivalric host', de: 'Ritterliches Heer' }, effects: { shock: 0.1, prestige: 0.5 } },
  iberian: { name: { en: 'Frontier societies', de: 'Grenzgesellschaften' }, effects: { manpower: 0.1, colonise: 0.15 } },
  low_lands: { name: { en: 'Polders and looms', de: 'Polder und Webstühle' }, effects: { production: 0.1, trade: 0.1 } },
  german: { name: { en: 'Town law', de: 'Stadtrecht' }, effects: { burghers: 0.1, production: 0.05 } },
  italian: { name: { en: 'Banking houses', de: 'Bankhäuser' }, effects: { trade: 0.15, interest: -0.01 } },
  west_slavic: { name: { en: 'Noble republic spirit', de: 'Adelsfreiheit' }, effects: { cavalry: 0.1, estates: 0.05 } },
  east_slavic: { name: { en: 'Endurance of the forest', de: 'Ausdauer der Wälder' }, effects: { attrition: -0.15, manpower: 0.1 } },
  south_slavic: { name: { en: 'Mountain fastnesses', de: 'Bergfesten' }, effects: { defence: 0.1 } },
  baltic: { name: { en: 'Forest warfare', de: 'Waldkrieg' }, effects: { defence: 0.1, attrition: -0.1 } },
  finnic: { name: { en: 'Wilderness lore', de: 'Wildniskunde' }, effects: { attrition: -0.2 } },
  norse: { name: { en: 'Seafarers', de: 'Seefahrer' }, effects: { naval: 0.15, sailors: 0.2 } },
  carpathian: { name: { en: 'Light horse', de: 'Leichte Reiterei' }, effects: { cavalry: 0.15 } },
  hellenic: { name: { en: 'Heirs of Rome', de: 'Erben Roms' }, effects: { prestige: 0.5, trade: 0.05 } },
  caucasian: { name: { en: 'Highland warriors', de: 'Bergkrieger' }, effects: { defence: 0.1, morale: 0.05 } },
  turkic: { name: { en: 'Horse peoples', de: 'Reitervölker' }, effects: { cavalry: 0.2, speed: 0.1 } },
  mongolic: { name: { en: 'Yasa discipline', de: 'Disziplin der Jassa' }, effects: { cavalry: 0.2, morale: 0.1 } },
  arab: { name: { en: 'Caravan trade', de: 'Karawanenhandel' }, effects: { trade: 0.15 } },
  berber: { name: { en: 'Desert riders', de: 'Wüstenreiter' }, effects: { attrition: -0.25, cavalry: 0.1 } },
  iranian: { name: { en: 'Courtly culture', de: 'Höfische Kultur' }, effects: { research: 0.1 } },
  jewish: { name: { en: 'Learned communities', de: 'Gelehrte Gemeinden' }, effects: { research: 0.05, trade: 0.05 } },
  african: { name: { en: 'Kinship networks', de: 'Verwandtschaftsnetze' }, effects: { unrest: -0.1 } },
  american: { name: { en: 'Ancestral lands', de: 'Land der Ahnen' }, effects: { defence: 0.15 } },
  northern: { name: { en: 'Taiga hunters', de: 'Taigajäger' }, effects: { attrition: -0.2 } },
  other: { name: { en: 'Local ways', de: 'Lokale Bräuche' }, effects: {} },
};

export interface FaithDef { id: string; name: I18n; family: string; color: string; mechanic: I18n; mechanicDesc: I18n; holySites: string[] }
export const FAITHS: FaithDef[] = [
  { id: 'latin', name: { en: 'Latin Church', de: 'Lateinische Kirche' }, family: 'christian', color: '#d8c36a', mechanic: { en: 'Favour of the Curia', de: 'Gunst der Kurie' }, mechanicDesc: { en: 'Papal favour raises Mandate; the pope can excommunicate rulers, freeing their vassals and neighbours to attack.', de: 'Gunst des Papstes stärkt das Mandat; der Papst kann Herrscher bannen und so Vasallen und Nachbarn freie Hand geben.' }, holySites: ['Rome', 'Santiago de Compostela', 'Jerusalem'] },
  { id: 'orthodox', name: { en: 'Orthodox Church', de: 'Orthodoxe Kirche' }, family: 'christian', color: '#c97a3d', mechanic: { en: 'Patriarchal blessing', de: 'Patriarchensegen' }, mechanicDesc: { en: 'The ruler who protects the seat of the Patriarch gains Mandate and Concord; losing it to infidels shifts authority to another Orthodox realm.', de: 'Wer den Sitz des Patriarchen schützt, gewinnt Mandat und Eintracht; fällt er an Ungläubige, geht die Autorität auf ein anderes orthodoxes Reich über.' }, holySites: ['Constantinople', 'Kiev', 'Mount Athos'] },
  { id: 'sunni', name: { en: 'Sunni Islam', de: 'Sunnitischer Islam' }, family: 'muslim', color: '#2e7d32', mechanic: { en: 'Pilgrimage and the Caliph’s shadow', de: 'Pilgerfahrt und Schatten des Kalifen' }, mechanicDesc: { en: 'Holding the holy cities grants prestige and Mandate to the protector; pious rulers gain Concord from pilgrimages.', de: 'Der Schutzherr der heiligen Städte gewinnt Ansehen und Mandat; fromme Herrscher gewinnen Eintracht durch Pilgerfahrten.' }, holySites: ['Mecca', 'Medina', 'Jerusalem'] },
  { id: 'shia', name: { en: 'Shia Islam', de: 'Schiitischer Islam' }, family: 'muslim', color: '#1b5e20', mechanic: { en: 'Shrines of the Imams', de: 'Schreine der Imame' }, mechanicDesc: { en: 'Control of the shrine cities of Iraq strengthens Concord and conversion.', de: 'Die Kontrolle der Schreinstädte des Irak stärkt Eintracht und Bekehrung.' }, holySites: ['Karbala', 'Najaf', 'Mashhad'] },
  { id: 'ibadi', name: { en: 'Ibadi Islam', de: 'Ibaditischer Islam' }, family: 'muslim', color: '#33691e', mechanic: { en: 'Elected imamate', de: 'Gewähltes Imamat' }, mechanicDesc: { en: 'Rulers are chosen for piety; low Mandate leads to a new election instead of revolt.', de: 'Herrscher werden nach Frömmigkeit gewählt; geringes Mandat führt zu Neuwahl statt Aufstand.' }, holySites: ['Nizwa'] },
  { id: 'jewish', name: { en: 'Judaism', de: 'Judentum' }, family: 'jewish', color: '#5c6bc0', mechanic: { en: 'Protected communities', de: 'Schutzgemeinden' }, mechanicDesc: { en: 'Jewish minorities raise trade and credit where tolerated; persecution drives them to migrate.', de: 'Jüdische Minderheiten stärken Handel und Kredit, wo sie geduldet sind; Verfolgung treibt sie zur Auswanderung.' }, holySites: ['Jerusalem'] },
  { id: 'tengri', name: { en: 'Tengri worship', de: 'Tengri-Glaube' }, family: 'traditional', color: '#90a4ae', mechanic: { en: 'Syncretic steppe', de: 'Synkretische Steppe' }, mechanicDesc: { en: 'Can adopt one secondary faith, gaining its unity bonuses without conflict.', de: 'Kann einen zweiten Glauben annehmen und dessen Einheitsboni konfliktfrei nutzen.' }, holySites: [] },
  { id: 'baltic_old', name: { en: 'Old Baltic faith', de: 'Alter baltischer Glaube' }, family: 'traditional', color: '#8d6e63', mechanic: { en: 'Sacred groves', de: 'Heilige Haine' }, mechanicDesc: { en: 'Strong defence of the homeland; baptism of the ruler is a dramatic decision that can win allies.', de: 'Starke Verteidigung der Heimat; die Taufe des Herrschers ist eine dramatische Entscheidung, die Verbündete bringen kann.' }, holySites: ['Vilnius'] },
  { id: 'finnic_old', name: { en: 'Old Finnic faith', de: 'Alter finnischer Glaube' }, family: 'traditional', color: '#a1887f', mechanic: { en: 'Spirits of the land', de: 'Geister des Landes' }, mechanicDesc: { en: 'Reduced attrition at home.', de: 'Weniger Zermürbung im eigenen Land.' }, holySites: [] },
  { id: 'sami_old', name: { en: 'Sámi faith', de: 'Samischer Glaube' }, family: 'traditional', color: '#bcaaa4', mechanic: { en: 'Spirits of the land', de: 'Geister des Landes' }, mechanicDesc: { en: 'Reduced attrition at home.', de: 'Weniger Zermürbung im eigenen Land.' }, holySites: [] },
  { id: 'coptic', name: { en: 'Coptic Church', de: 'Koptische Kirche' }, family: 'christian', color: '#ad8b4e', mechanic: { en: 'Endurance under rule', de: 'Beharrung unter Fremdherrschaft' }, mechanicDesc: { en: 'Coptic minorities convert very slowly and keep scribal skills that raise tax efficiency.', de: 'Koptische Minderheiten bekehren sich nur langsam und erhöhen durch Schreiberkunst die Steuerkraft.' }, holySites: ['Alexandria'] },
  { id: 'ethiopian', name: { en: 'Ethiopian Church', de: 'Äthiopische Kirche' }, family: 'christian', color: '#bf8b3e', mechanic: { en: 'Solomonic kingship', de: 'Salomonisches Königtum' }, mechanicDesc: { en: 'Ruler Mandate is tied to the dynasty’s sacred descent.', de: 'Das Mandat des Herrschers hängt an der heiligen Abstammung der Dynastie.' }, holySites: ['Aksum'] },
  { id: 'church_of_east', name: { en: 'Church of the East', de: 'Kirche des Ostens' }, family: 'christian', color: '#9e8f5e', mechanic: { en: 'Missions along the roads', de: 'Mission entlang der Straßen' }, mechanicDesc: { en: 'Communities along trade routes raise trade.', de: 'Gemeinden entlang der Handelswege stärken den Handel.' }, holySites: [] },
  { id: 'armenian_apostolic', name: { en: 'Armenian Church', de: 'Armenische Kirche' }, family: 'christian', color: '#b26a3a', mechanic: { en: 'Diaspora merchants', de: 'Kaufleute der Diaspora' }, mechanicDesc: { en: 'Armenian communities strengthen long-distance trade.', de: 'Armenische Gemeinden stärken den Fernhandel.' }, holySites: ['Etchmiadzin'] },
  { id: 'african_traditional', name: { en: 'African traditional faiths', de: 'Afrikanische Religionen' }, family: 'traditional', color: '#795548', mechanic: { en: 'Ancestor veneration', de: 'Ahnenverehrung' }, mechanicDesc: { en: 'Strong Mandate for established dynasties.', de: 'Starkes Mandat für alteingesessene Dynastien.' }, holySites: [] },
  { id: 'american_traditional', name: { en: 'Native American faiths', de: 'Indigene Religionen Amerikas' }, family: 'traditional', color: '#6d4c41', mechanic: { en: 'Sacred land', de: 'Heiliges Land' }, mechanicDesc: { en: 'Strong defence of home territory.', de: 'Starke Verteidigung des eigenen Landes.' }, holySites: [] },
  { id: 'mesoamerican', name: { en: 'Mesoamerican faith', de: 'Mesoamerikanische Religion' }, family: 'traditional', color: '#e65100', mechanic: { en: 'Sacred calendar', de: 'Heiliger Kalender' }, mechanicDesc: { en: 'Wars of capture raise Mandate.', de: 'Gefangenenkriege stärken das Mandat.' }, holySites: [] },
  { id: 'andean', name: { en: 'Andean faith', de: 'Andine Religion' }, family: 'traditional', color: '#ff8f00', mechanic: { en: 'Children of the Sun', de: 'Kinder der Sonne' }, mechanicDesc: { en: 'Labour obligations raise building speed.', de: 'Arbeitspflichten beschleunigen den Bau.' }, holySites: [] },
  { id: 'bosnian_church', name: { en: 'Bosnian Church', de: 'Bosnische Kirche' }, family: 'christian', color: '#a0785a', mechanic: { en: 'Krstjani elders', de: 'Älteste der Krstjani' }, mechanicDesc: { en: 'A loose church: tolerant, low unrest from other faiths, but no outside protector.', de: 'Eine lockere Kirche: tolerant, wenig Unruhe durch andere Glauben, aber ohne äußeren Schutzherrn.' }, holySites: [] },
  { id: 'syriac_orthodox', name: { en: 'Syriac Church', de: 'Syrische Kirche' }, family: 'christian', color: '#b09a6e', mechanic: { en: 'Endurance under rule', de: 'Beharrung unter Fremdherrschaft' }, mechanicDesc: { en: 'Minorities that convert very slowly and preserve learning.', de: 'Minderheiten, die sich nur langsam bekehren und Gelehrsamkeit bewahren.' }, holySites: [] },
  { id: 'hindu', name: { en: 'Hindu traditions', de: 'Hinduistische Traditionen' }, family: 'dharmic', color: '#ff7043', mechanic: { en: 'Temple patronage', de: 'Tempelstiftungen' }, mechanicDesc: { en: 'Temple building raises Mandate and Concord.', de: 'Tempelbau stärkt Mandat und Eintracht.' }, holySites: [] },
  { id: 'hussite', name: { en: 'Hussite Church', de: 'Hussitische Kirche' }, family: 'christian', color: '#7e57c2', mechanic: { en: 'Chalice and wagon', de: 'Kelch und Wagenburg' }, mechanicDesc: { en: 'Fierce defenders: big bonus to defence and morale at home.', de: 'Wehrhafte Verteidiger: großer Bonus auf Verteidigung und Moral im eigenen Land.' }, holySites: ['Prague'] },
  { id: 'evangelical', name: { en: 'Evangelical Church', de: 'Evangelische Kirche' }, family: 'christian', color: '#5e35b1', mechanic: { en: 'Secularised church lands', de: 'Säkularisiertes Kirchengut' }, mechanicDesc: { en: 'Princes may seize church lands for gold and Authority at the cost of clergy anger.', de: 'Fürsten können Kirchengut für Gold und Autorität einziehen, zum Zorn des Klerus.' }, holySites: ['Wittenberg'] },
  { id: 'reformed', name: { en: 'Reformed Church', de: 'Reformierte Kirche' }, family: 'christian', color: '#3949ab', mechanic: { en: 'Discipline of the elect', de: 'Zucht der Erwählten' }, mechanicDesc: { en: 'Burghers prosper: more trade and production.', de: 'Bürger gedeihen: mehr Handel und Produktion.' }, holySites: ['Geneva'] },
  { id: 'anglican_type', name: { en: 'National Church', de: 'Nationalkirche' }, family: 'christian', color: '#8e24aa', mechanic: { en: 'Crown over church', de: 'Krone über Kirche' }, mechanicDesc: { en: 'The ruler heads the church: more Mandate and Authority.', de: 'Der Herrscher steht der Kirche vor: mehr Mandat und Autorität.' }, holySites: [] },
];
export const FAITH_INDEX: Record<string, number> = Object.fromEntries(FAITHS.map((f, i) => [f.id, i]));
export function faithFamily(i: number) { return FAITHS[i]?.family ?? 'traditional'; }
