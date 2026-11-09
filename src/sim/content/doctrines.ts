// Doctrines: 10 groups × 7 picks. Taking picks costs Insight (accumulated monthly). Effects become permanent modifiers.
// Effect keys are those read through lawEffect()/mod(): see docs/ARCHITECTURE.md ("Effect keys").
// `era` is the age (0–3, see ERAS in systems/progress.ts) from which a group can be started.
import type { I18n } from '../types';
export interface DoctrinePick { name: I18n; desc?: I18n; effects: Record<string, number> }
export interface DoctrineGroup { id: string; name: I18n; desc: I18n; era: number; picks: DoctrinePick[]; complete?: Record<string, number> }

const p = (en: string, de: string, effects: Record<string, number>): DoctrinePick => ({ name: { en, de }, effects });

export const DOCTRINES: DoctrineGroup[] = [
  // ---------------- Age of Plague and Crowns (era 0) ----------------
  { id: 'stewardship', name: { en: 'Stewardship', de: 'Haushalterschaft' }, desc: { en: 'Orderly finances and honest officials.', de: 'Geordnete Finanzen und ehrliche Beamte.' }, era: 0, picks: [
    { name: { en: 'Audited Ledgers', de: 'Geprüfte Rechnungsbücher' }, effects: { corruption: -0.05 } },
    { name: { en: 'Crown Domains', de: 'Krondomänen' }, effects: { tax: 0.05 } },
    { name: { en: 'Fair Weights', de: 'Gerechte Gewichte' }, effects: { trade: 0.05 } },
    { name: { en: 'Royal Mint', de: 'Königliche Münze' }, effects: { interest: -0.01 } },
    { name: { en: 'Granaries', de: 'Kornspeicher' }, effects: { unrest: -2 } },
    { name: { en: 'Clerks of the Exchequer', de: 'Schreiber der Schatzkammer' }, effects: { tax: 0.05, authority_gain: 0.1 } },
    { name: { en: 'Sound Coin', de: 'Gutes Geld' }, effects: { mandate_gain: 0.1 } },
  ], complete: { tax: 0.05 } },

  { id: 'statecraft', name: { en: 'Statecraft', de: 'Staatskunst' }, desc: { en: 'Bind the provinces to the crown: officials, seats of government and one law for all.', de: 'Die Provinzen an die Krone binden: Beamte, Regierungssitze und ein Recht für alle.' }, era: 0, picks: [
    p('Royal Bailiffs', 'Königliche Amtleute', { control: 0.05 }),
    p('Chancery Scribes', 'Kanzleischreiber', { admin: 0.05 }),
    p('Itinerant Justices', 'Reisende Richter', { unrest: -1, control: 0.03 }),
    p('Councils of the Realm', 'Reichsräte', { authority_gain: 0.1 }),
    p('Provincial Governors', 'Provinzstatthalter', { integration: 0.1 }),
    p('Oaths of Fealty', 'Treueide', { mandate_gain: 0.05, concord_gain: 0.05 }),
    p('Crown over Custom', 'Krone vor Herkommen', { admin: 0.08, corruption: -0.03 }),
  ], complete: { control: 0.08, integration: 0.1 } },

  { id: 'piety', name: { en: 'Faith & Piety', de: 'Glaube & Frömmigkeit' }, desc: { en: 'A ruler close to the altar: preachers, pilgrimages and a united flock.', de: 'Ein Herrscher nah am Altar: Prediger, Wallfahrten und eine geeinte Herde.' }, era: 0, picks: [
    p('Mendicant Preachers', 'Bettelordenprediger', { conversion: 0.1 }),
    p('Royal Pilgrimages', 'Königliche Wallfahrten', { mandate_gain: 0.05 }),
    p('Holy Relics', 'Heilige Reliquien', { concord_gain: 0.05 }),
    p('Confraternities', 'Bruderschaften', { unrest: -1 }),
    p('Missions to the Heathen', 'Mission unter den Heiden', { conversion: 0.12 }),
    p('Parish Schools', 'Pfarrschulen', { research: 0.03, assimilation: 0.05 }),
    p('Defender of the Faith', 'Verteidiger des Glaubens', { morale: 0.05, mandate_gain: 0.05 }),
  ], complete: { conversion: 0.15, concord_gain: 0.05 } },

  { id: 'chivalry', name: { en: 'Cavalry & Nobility', de: 'Reiterei & Adel' }, desc: { en: 'The mounted nobility as the backbone of the realm and its host.', de: 'Der berittene Adel als Rückgrat des Reiches und seines Heeres.' }, era: 0, picks: [
    p('Knightly Tournaments', 'Ritterturniere', { cavalry: 0.05 }),
    p('Orders of Chivalry', 'Ritterorden', { morale: 0.05 }),
    p('Remount Studs', 'Gestüte', { cavalry: 0.05, speed: 0.03 }),
    p('Noble Levies', 'Adelsaufgebot', { manpower: 0.08 }),
    p('Code of Honour', 'Ehrenkodex', { mandate_gain: 0.05 }),
    p('Heavy Lances', 'Schwere Lanzen', { cavalry: 0.08 }),
    p('Service Nobility', 'Dienstadel', { authority_gain: 0.08, army_cost: -0.04 }),
  ], complete: { cavalry: 0.1, morale: 0.05 } },

  // ---------------- Age of Print and Horizons (era 1) ----------------
  { id: 'commerce', name: { en: 'Trade & Banking', de: 'Handel & Bankwesen' }, desc: { en: 'Fairs, exchange banks and merchant law make the realm rich.', de: 'Messen, Wechselbanken und Kaufmannsrecht machen das Reich reich.' }, era: 1, picks: [
    p('Chartered Fairs', 'Privilegierte Messen', { trade: 0.05 }),
    p('Bills of Exchange', 'Wechselbriefe', { interest: -0.01 }),
    p('Merchant Courts', 'Kaufmannsgerichte', { trade: 0.04, corruption: -0.02 }),
    p('Craft Privileges', 'Handwerksprivilegien', { production: 0.05 }),
    p('Exchange Banks', 'Wechselbanken', { interest: -0.01, tax: 0.03 }),
    p('Staple Towns', 'Stapelstädte', { trade: 0.06 }),
    p('Crown Credit', 'Kronkredit', { interest: -0.015, mercenary_cost: -0.05 }),
  ], complete: { trade: 0.08, production: 0.04 } },

  { id: 'seafaring', name: { en: 'Seafaring & Colonial Enterprise', de: 'Seefahrt & Kolonialunternehmen' }, desc: { en: 'Charts, pilots and hardy crews open the seas; settlers and charters follow.', de: 'Seekarten, Lotsen und zähe Mannschaften erschließen die Meere; Siedler und Freibriefe folgen.' }, era: 1, picks: [
    p('School of Pilots', 'Lotsenschule', { colonial_range: 0.08 }),
    p('Sea Charts', 'Seekarten', { attrition: -0.04 }),
    p('Ocean Hulls', 'Hochseerümpfe', { colonial_range: 0.1 }),
    p('Settler Charters', 'Siedlerfreibriefe', { colonists: 1 }),
    p('Plantations', 'Pflanzungen', { trade: 0.04, colonial_growth: 0.1 }),
    p('Convoy System', 'Geleitzüge', { attrition: -0.04, trade: 0.03 }),
    p('Empire beyond the Sea', 'Reich jenseits des Meeres', { colonists: 1, colonial_growth: 0.1 }),
  ], complete: { colonial_range: 0.15, colonial_growth: 0.1 } },

  { id: 'humanism', name: { en: 'Learning & Humanism', de: 'Gelehrsamkeit & Humanismus' }, desc: { en: 'Scholars, printers and patrons of the new learning.', de: 'Gelehrte, Drucker und Förderer der neuen Gelehrsamkeit.' }, era: 1, picks: [
    p('Patronage of Scholars', 'Förderung der Gelehrten', { research: 0.05 }),
    p('Libraries', 'Bibliotheken', { research: 0.04 }),
    p('Tolerance of Opinion', 'Duldung der Meinungen', { tolerance: 0.1, unrest: -1 }),
    p('Learned Councillors', 'Gelehrte Räte', { admin: 0.04, authority_gain: 0.05 }),
    p('Vernacular Letters', 'Volkssprachliche Dichtung', { assimilation: 0.1, concord_gain: 0.03 }),
    p('Academies', 'Akademien', { research: 0.06 }),
    p('Republic of Letters', 'Gelehrtenrepublik', { research: 0.05, tolerance: 0.1 }),
  ], complete: { research: 0.08 } },

  // ---------------- Age of Confessions and Absolutism (era 2) ----------------
  { id: 'diplomacy', name: { en: 'Diplomacy', de: 'Diplomatie' }, desc: { en: 'Resident envoys, cyphers and the balance of power.', de: 'Ständige Gesandte, Chiffren und das Gleichgewicht der Mächte.' }, era: 2, picks: [
    p('Resident Envoys', 'Ständige Gesandte', { dread_decay: 0.1 }),
    p('Cypher Office', 'Chiffrierkanzlei', { agents: 1 }),
    p('Marriage Brokers', 'Heiratsvermittler', { mandate_gain: 0.05 }),
    p('Law of Nations', 'Völkerrecht', { dread_decay: 0.15 }),
    p('Court Ceremonial', 'Hofzeremoniell', { concord_gain: 0.05, authority_gain: 0.05 }),
    p('Subsidy Treaties', 'Subsidienverträge', { mercenary_cost: -0.08 }),
    p('Balance of Power', 'Gleichgewicht der Mächte', { dread_decay: 0.2, mandate_gain: 0.05 }),
  ], complete: { dread_decay: 0.2, authority_gain: 0.1 } },

  { id: 'infantry', name: { en: 'Infantry Warfare', de: 'Fußvolk' }, desc: { en: 'Pike, shot and drill: the foot soldier rules the field.', de: 'Pike, Feuerwaffe und Drill: der Fußsoldat beherrscht das Feld.' }, era: 2, picks: [
    p('Pike Squares', 'Gevierthaufen', { morale: 0.05 }),
    p('Drill Books', 'Exerzierbücher', { discipline: 0.05 }),
    p('Musketeers', 'Musketiere', { fire: 0.08 }),
    p('Regimental Depots', 'Regimentsdepots', { manpower: 0.08, attrition: -0.03 }),
    p('Regular Pay', 'Geregelter Sold', { army_cost: -0.05, discipline: 0.03 }),
    p('Volley Fire', 'Salvenfeuer', { fire: 0.1 }),
    p('Professional Officers', 'Berufsoffiziere', { discipline: 0.06, morale: 0.04 }),
  ], complete: { discipline: 0.05, fire: 0.05 } },

  // ---------------- Age of Reason and Revolution (era 3) ----------------
  { id: 'siegecraft', name: { en: 'Siegecraft & Fortification', de: 'Belagerungs- & Festungskunst' }, desc: { en: 'Engineers, star forts and the science of the siege.', de: 'Ingenieure, Sternfestungen und die Wissenschaft der Belagerung.' }, era: 3, picks: [
    p('Corps of Engineers', 'Ingenieurkorps', { fort_strength: 0.08 }),
    p('Bastioned Fronts', 'Bastionierte Fronten', { fort_strength: 0.1 }),
    p('Magazines', 'Magazine', { attrition: -0.05 }),
    p('Siege Parks', 'Belagerungsparks', { fire: 0.05 }),
    p('Frontier Fortresses', 'Grenzfestungen', { fort_strength: 0.1, control: 0.03 }),
    p('Military Roads', 'Militärstraßen', { speed: 0.05 }),
    p('Science of the Siege', 'Wissenschaft der Belagerung', { fort_strength: 0.12, discipline: 0.03 }),
  ], complete: { fort_strength: 0.15, attrition: -0.05 } },
];
export const DOCTRINE_INDEX: Record<string, number> = Object.fromEntries(DOCTRINES.map((d, i) => [d.id, i]));
