// Laws of the realm: 32 laws with 3–5 options each. Each option has effects (read by the simulation through
// lawEffect), a reform cost in Authority, a duration, and reactions of the Powers of the Realm.
// Effect keys used by systems: serfdom (0..1), tolerance (0..1), exempt_<class>, tax_farming, tax, trade, production,
// manpower, shock, fire, discipline, unrest, research, control, mandate_gain, concord_gain, army_cost, colonise,
// conversion, literacy, corruption, admin, values.<axis>
import type { I18n } from '../types';

export interface LawOption { id: string; name: I18n; effects: Record<string, number>; estates: Record<string, number>; desc?: I18n; gov?: string[]; minEra?: number }
export interface LawDef { id: string; name: I18n; group: string; options: LawOption[]; default: (gov: string, rank: string, faith: string) => number }

const o = (id: string, en: string, de: string, effects: Record<string, number>, estates: Record<string, number> = {}, extra: Partial<LawOption> = {}): LawOption => ({ id, name: { en, de }, effects, estates, ...extra });
const fix = (k: number) => () => k;

export const LAWS: LawDef[] = [
  { id: 'succession', name: { en: 'Succession', de: 'Thronfolge' }, group: 'crown', default: (g) => (g === 'elective_monarchy' ? 2 : g === 'nomadic_horde' || g === 'tribal_federation' ? 3 : g.includes('republic') || g === 'theocracy' || g === 'military_order' ? 4 : 0), options: [
    o('primogeniture', 'Male primogeniture', 'Männliche Primogenitur', { mandate_gain: 0.1, succession_strife: -0.3 }, { magnates: -2 }),
    o('cognatic', 'Cognatic primogeniture', 'Kognatische Primogenitur', { mandate_gain: 0.05, succession_strife: -0.2, foreign_claims: 0.3 }, { magnates: -3 }),
    o('elective', 'Elective crown', 'Wahlkönigtum', { mandate_gain: -0.1, succession_strife: 0.1, estate_power: 0.15 }, { magnates: 8, prelates: 3 }),
    o('seniority', 'Seniority among kin', 'Seniorat', { succession_strife: 0.4, mandate_gain: -0.05 }, { magnates: 3 }),
    o('office', 'Election to office', 'Wahl ins Amt', { mandate_gain: 0, succession_strife: 0 }, { burghers: 5 }),
  ] },
  { id: 'serfdom', name: { en: 'Bondage of the peasantry', de: 'Bindung der Bauern' }, group: 'society', default: (g, r) => (g === 'nomadic_horde' ? 1 : 2), options: [
    o('free', 'Free peasantry', 'Freie Bauern', { serfdom: 0, growth: 0.05, unrest: -2, manpower: -0.05 }, { commons: 10, magnates: -12 }),
    o('copyhold', 'Copyhold tenure', 'Pachtrecht', { serfdom: 0.3, unrest: -1 }, { commons: 4, magnates: -4 }),
    o('manorial', 'Manorial dues', 'Grundherrschaft', { serfdom: 0.6 }, {}),
    o('bound', 'Bound to the soil', 'Schollenbindung', { serfdom: 1, manpower: 0.1, unrest: 3, growth: -0.03 }, { magnates: 10, commons: -12 }),
  ] },
  { id: 'army', name: { en: 'Army organisation', de: 'Heeresverfassung' }, group: 'military', default: fix(0), options: [
    o('feudal', 'Feudal host', 'Lehnsheer', { manpower: 0.15, discipline: -0.05, army_cost: -0.2 }, { magnates: 6 }),
    o('contract', 'Contract companies', 'Soldverträge', { mercenary_cost: -0.25, army_cost: 0.05 }, { burghers: 3, magnates: -3 }),
    o('militia', 'Town and county militia', 'Landwehr', { manpower: 0.25, discipline: -0.08, defence: 0.1 }, { commons: 4 }),
    o('standing', 'Standing army', 'Stehendes Heer', { discipline: 0.12, army_cost: 0.2, control: 0.05 }, { magnates: -8, commons: -3 }, { minEra: 1 }),
    o('conscription', 'Cantonal conscription', 'Kantonssystem', { manpower: 0.4, discipline: 0.08, unrest: 2 }, { commons: -8 }, { minEra: 3 }),
  ] },
  { id: 'taxation', name: { en: 'Tax collection', de: 'Steuererhebung' }, group: 'economy', default: fix(1), options: [
    o('dues', 'Customary dues', 'Herkömmliche Abgaben', { tax: -0.15, unrest: -2 }, { magnates: 3, commons: 3 }),
    o('farming', 'Tax farming', 'Steuerpacht', { tax_farming: 1, corruption: 0.04 }, { burghers: 5 }),
    o('direct', 'Royal collectors', 'Königliche Steuereinnehmer', { tax: 0.12, admin: -0.1 }, { burghers: -3, magnates: -3 }),
    o('excise', 'General excise', 'Allgemeine Akzise', { tax: 0.2, unrest: 2, trade: -0.05 }, { burghers: -6 }, { minEra: 2 }),
  ] },
  { id: 'tolerance', name: { en: 'Religious policy', de: 'Religionspolitik' }, group: 'faith', default: fix(1), options: [
    o('enforced', 'Enforced orthodoxy', 'Erzwungene Rechtgläubigkeit', { tolerance: 0, conversion: 0.4, unrest: 1 }, { prelates: 10 }),
    o('established', 'Established church', 'Staatskirche', { tolerance: 0.25, conversion: 0.15 }, { prelates: 4 }),
    o('protected', 'Protected minorities', 'Geschützte Minderheiten', { tolerance: 0.6, trade: 0.05 }, { prelates: -5, burghers: 3 }),
    o('freedom', 'Freedom of conscience', 'Gewissensfreiheit', { tolerance: 1, trade: 0.08, research: 0.05 }, { prelates: -12, burghers: 6 }, { minEra: 2 }),
  ] },
  { id: 'justice', name: { en: 'Justice', de: 'Rechtsprechung' }, group: 'crown', default: fix(0), options: [
    o('lords', 'Lords’ courts', 'Herrengerichte', { control: -0.05 }, { magnates: 6 }),
    o('royal', 'Royal courts', 'Königsgerichte', { control: 0.08, authority: 0.5 }, { magnates: -4 }),
    o('roman', 'Learned Roman law', 'Gelehrtes Römisches Recht', { control: 0.1, admin: 0.1, research: 0.03 }, { prelates: 2, magnates: -6 }),
    o('parlement', 'Sovereign high court', 'Oberstes Gericht', { control: 0.06, unrest: -2 }, { burghers: 5 }, { minEra: 2 }),
  ] },
  { id: 'guilds', name: { en: 'Guild rights', de: 'Zunftrecht' }, group: 'economy', default: fix(1), options: [
    o('none', 'Open trades', 'Gewerbefreiheit', { production: 0.08, unrest: 1 }, { burghers: -6 }),
    o('chartered', 'Chartered guilds', 'Privilegierte Zünfte', { production: 0, quality: 0.1 }, { burghers: 6 }),
    o('closed', 'Closed guilds', 'Geschlossene Zünfte', { production: -0.06, unrest: -2, innovation_block: 0.5 }, { burghers: 10 }),
    o('state', 'State supervision', 'Staatsaufsicht', { production: 0.05, tax: 0.03 }, { burghers: -4 }, { minEra: 2 }),
  ] },
  { id: 'censorship', name: { en: 'Control of writings', de: 'Schriftenkontrolle' }, group: 'faith', default: fix(1), options: [
    o('none', 'Unchecked writing', 'Freie Schrift', { research: 0.06, reform_pressure: 0.2 }, { prelates: -6 }),
    o('episcopal', 'Episcopal censorship', 'Bischöfliche Zensur', { research: 0, reform_pressure: -0.1 }, { prelates: 3 }),
    o('index', 'Index of forbidden books', 'Index verbotener Bücher', { research: -0.06, reform_pressure: -0.3, unrest: 1 }, { prelates: 8 }),
  ] },
  { id: 'trade', name: { en: 'Trade policy', de: 'Handelspolitik' }, group: 'economy', default: fix(1), options: [
    o('free', 'Open ports', 'Offene Häfen', { trade: 0.1, tariff_max: 0.05 }, { burghers: 3 }),
    o('staple', 'Staple rights', 'Stapelrecht', { trade: 0.05, tariff_max: 0.15 }, { burghers: 6 }),
    o('protection', 'Protected trades', 'Schutzzölle', { trade: -0.05, production: 0.06, tariff_max: 0.3 }, { burghers: 2 }),
    o('monopoly', 'Royal monopolies', 'Königliche Monopole', { tax: 0.08, trade: -0.08 }, { burghers: -8 }),
  ] },
  { id: 'nobility', name: { en: 'Noble privileges', de: 'Adelsvorrechte' }, group: 'estates', default: fix(1), options: [
    o('limited', 'Limited privileges', 'Begrenzte Vorrechte', { exempt_5: 0, control: 0.05 }, { magnates: -10 }),
    o('customary', 'Customary exemptions', 'Gewohnheitsrechte', { exempt_5: 0.5 }, {}),
    o('full', 'Full immunity', 'Volle Immunität', { exempt_5: 1, manpower: 0.1, control: -0.08 }, { magnates: 12 }),
  ] },
  { id: 'clergy_tax', name: { en: 'Taxation of the clergy', de: 'Besteuerung des Klerus' }, group: 'estates', default: fix(1), options: [
    o('taxed', 'Clergy taxed', 'Klerus besteuert', { exempt_4: 0, curia: -5 }, { prelates: -10 }),
    o('subsidy', 'Voluntary subsidies', 'Freiwillige Subsidien', { exempt_4: 0.6 }, {}),
    o('immune', 'Clerical immunity', 'Geistliche Immunität', { exempt_4: 1, curia: 5 }, { prelates: 10 }),
  ] },
  { id: 'towns', name: { en: 'Town charters', de: 'Stadtrechte' }, group: 'estates', default: fix(1), options: [
    o('lordly', 'Under the lord', 'Unter dem Stadtherrn', { tax: 0.03, trade: -0.05 }, { burghers: -6 }),
    o('chartered', 'Chartered towns', 'Privilegierte Städte', { trade: 0.04 }, { burghers: 4 }),
    o('free', 'Self-governing towns', 'Selbstverwaltete Städte', { trade: 0.1, exempt_3: 0.4, control: -0.04 }, { burghers: 10 }),
  ] },
  { id: 'administration', name: { en: 'Administration', de: 'Verwaltung' }, group: 'crown', default: fix(0), options: [
    o('household', 'Royal household', 'Königlicher Haushalt', { admin: 0, corruption: 0.02 }, {}),
    o('chancery', 'Chancery and exchequer', 'Kanzlei und Schatzamt', { admin: 0.15, tax: 0.03 }, { prelates: 2 }),
    o('councils', 'Governing councils', 'Ratsbehörden', { admin: 0.25, corruption: -0.02 }, { magnates: -3 }, { minEra: 1 }),
    o('bureaucracy', 'Salaried officials', 'Besoldetes Beamtentum', { admin: 0.4, corruption: -0.04, army_cost: 0.03 }, { magnates: -6, burghers: 3 }, { minEra: 2 }),
  ] },
  { id: 'regional', name: { en: 'Provincial rule', de: 'Provinzherrschaft' }, group: 'crown', default: fix(1), options: [
    o('appanages', 'Appanages to princes', 'Apanagen an Prinzen', { control: -0.08, mandate_gain: 0.05 }, { magnates: 5 }),
    o('lieutenants', 'Royal lieutenants', 'Königliche Statthalter', { control: 0.04 }, {}),
    o('intendants', 'Intendants', 'Intendanten', { control: 0.12, unrest: 1 }, { magnates: -6 }, { minEra: 2 }),
  ] },
  { id: 'mint', name: { en: 'Coinage', de: 'Münzwesen' }, group: 'economy', default: fix(0), options: [
    o('seigneurial', 'Many mints', 'Viele Münzherren', { trade: -0.05 }, { magnates: 3 }),
    o('royal', 'Royal mint', 'Königliche Münze', { tax: 0.03, inflation_resist: 0.3 }, {}),
    o('bank', 'Public bank', 'Öffentliche Bank', { interest: -0.015, trade: 0.05 }, { burghers: 5 }, { minEra: 2 }),
  ] },
  { id: 'poor', name: { en: 'Poor relief', de: 'Armenfürsorge' }, group: 'society', default: fix(0), options: [
    o('charity', 'Church charity', 'Kirchliche Mildtätigkeit', {}, { prelates: 2 }),
    o('town', 'Town almshouses', 'Städtische Armenhäuser', { unrest: -1.5, tax: -0.01 }, { burghers: 2 }),
    o('poor_law', 'Poor law', 'Armengesetz', { unrest: -3, tax: -0.03, growth: 0.02 }, { commons: 5 }, { minEra: 2 }),
  ] },
  { id: 'vagrancy', name: { en: 'Labour laws', de: 'Arbeitsgesetze' }, group: 'society', default: fix(0), options: [
    o('none', 'No wage laws', 'Keine Lohngesetze', { unrest: -1 }, { commons: 3 }),
    o('statute', 'Statute of labourers', 'Arbeiterstatut', { production: 0.03, unrest: 2 }, { magnates: 4, commons: -6 }),
    o('workhouse', 'Workhouses', 'Arbeitshäuser', { production: 0.05, unrest: 1 }, { burghers: 3, commons: -4 }, { minEra: 3 }),
  ] },
  { id: 'education', name: { en: 'Learning', de: 'Bildung' }, group: 'society', default: fix(0), options: [
    o('cloister', 'Cloister schools', 'Klosterschulen', { literacy: 0 }, { prelates: 2 }),
    o('cathedral', 'Cathedral & town schools', 'Dom- und Stadtschulen', { literacy: 0.02, research: 0.03 }, { burghers: 2 }),
    o('universities', 'Patronage of universities', 'Förderung der Universitäten', { literacy: 0.03, research: 0.08, tax: -0.02 }, {}),
    o('schools', 'Village schools', 'Dorfschulen', { literacy: 0.06, research: 0.06, tax: -0.03 }, { commons: 4 }, { minEra: 2 }),
  ] },
  { id: 'naval', name: { en: 'Naval organisation', de: 'Seewesen' }, group: 'military', default: fix(0), options: [
    o('levied', 'Levied merchant ships', 'Ausgehobene Handelsschiffe', { naval_cost: -0.2, naval: -0.1 }, { burghers: -2 }),
    o('arsenal', 'State arsenal', 'Staatliches Arsenal', { naval: 0.1, naval_cost: 0.05 }, {}),
    o('privateers', 'Letters of marque', 'Kaperbriefe', { trade_raid: 0.3, trade: -0.02 }, { burghers: 2 }),
    o('admiralty', 'Admiralty', 'Admiralität', { naval: 0.2, naval_cost: 0.1, sailors: 0.2 }, {}, { minEra: 2 }),
  ] },
  { id: 'mercenaries', name: { en: 'Hired soldiers', de: 'Söldnerwesen' }, group: 'military', default: fix(1), options: [
    o('forbidden', 'Native soldiers only', 'Nur Landeskinder', { mercenary_cost: 0.5, morale: 0.05 }, { commons: 2 }),
    o('allowed', 'Hired companies allowed', 'Söldner erlaubt', {}, {}),
    o('preferred', 'Free companies', 'Freie Kompanien', { mercenary_cost: -0.2, unrest: 1 }, { magnates: -2 }),
  ] },
  { id: 'fortress', name: { en: 'Fortress policy', de: 'Festungspolitik' }, group: 'military', default: fix(0), options: [
    o('castles', 'Lords’ castles', 'Adelsburgen', { fort_cost: -0.2, control: -0.03 }, { magnates: 4 }),
    o('royal', 'Royal fortresses', 'Königliche Festungen', { fort_strength: 0.15 }, { magnates: -3 }),
    o('bastions', 'Bastion system', 'Bastionärsystem', { fort_strength: 0.4, fort_cost: 0.3 }, {}, { minEra: 2 }),
  ] },
  { id: 'diet', name: { en: 'Assembly of estates', de: 'Ständeversammlung' }, group: 'estates', default: (g) => (g.includes('republic') ? 2 : 1), options: [
    o('none', 'Rule without assembly', 'Herrschaft ohne Stände', { authority: 1, unrest: 1.5 }, { magnates: -6, burghers: -6 }),
    o('occasional', 'Occasional estates', 'Gelegentliche Ständetage', { estate_power: 0.05 }, {}),
    o('regular', 'Regular parliament', 'Regelmäßiges Parlament', { tax: 0.06, unrest: -2, estate_power: 0.2, war_vote: 1 }, { burghers: 6, magnates: 4 }),
  ] },
  { id: 'colonies', name: { en: 'Overseas ventures', de: 'Überseeunternehmen' }, group: 'economy', default: fix(0), options: [
    o('none', 'No ventures', 'Keine Unternehmungen', {}, {}),
    o('crown', 'Crown expeditions', 'Kronexpeditionen', { colonise: 0.2, tax: -0.01 }, {}, { minEra: 1 }),
    o('companies', 'Chartered companies', 'Handelskompanien', { colonise: 0.3, trade: 0.06 }, { burghers: 6 }, { minEra: 2 }),
  ] },
  { id: 'nomadism', name: { en: 'Way of life', de: 'Lebensweise' }, group: 'society', default: (g) => (g === 'nomadic_horde' ? 0 : g === 'tribal_federation' ? 1 : 2), options: [
    o('nomadic', 'Pastoral nomadism', 'Nomadische Weidewirtschaft', { cavalry: 0.25, control: -0.15, growth: -0.05, manpower: 0.3 }, {}),
    o('mixed', 'Mixed herding and farming', 'Gemischte Wirtschaft', { cavalry: 0.1, control: -0.05 }, {}),
    o('settled', 'Settled life', 'Sesshaftigkeit', { growth: 0.03 }, {}),
  ] },
  { id: 'clan', name: { en: 'Clan obligations', de: 'Sippenpflichten' }, group: 'estates', default: fix(1), options: [
    o('strong', 'Strong clans', 'Starke Sippen', { manpower: 0.15, control: -0.06 }, { magnates: 6 }),
    o('balanced', 'Balanced', 'Ausgeglichen', {}, {}),
    o('weak', 'Crown over clans', 'Krone über Sippen', { control: 0.06, unrest: 1 }, { magnates: -6 }),
  ] },
  { id: 'marriage', name: { en: 'Dynastic marriage policy', de: 'Heiratspolitik' }, group: 'crown', default: fix(1), options: [
    o('native', 'Marry at home', 'Heirat im Land', { mandate_gain: 0.05 }, { magnates: 3 }),
    o('alliances', 'Marriage alliances', 'Heiratsbündnisse', { diplomacy: 0.1, foreign_claims: 0.2 }, {}),
    o('imperial', 'Imperial marriages', 'Kaiserliche Heiraten', { diplomacy: 0.15, foreign_claims: 0.4, prestige: 0.3 }, { magnates: -2 }),
  ] },
  { id: 'jewry', name: { en: 'Status of Jewish communities', de: 'Stellung der jüdischen Gemeinden' }, group: 'faith', default: fix(1), options: [
    o('expelled', 'Expulsion', 'Vertreibung', { trade: -0.06, interest: 0.02, unrest: -0.5 }, { prelates: 4 }),
    o('protected', 'Under crown protection', 'Unter Kronschutz', { trade: 0.03, interest: -0.01 }, {}),
    o('equal', 'Equal standing', 'Gleichstellung', { trade: 0.06, research: 0.02 }, { prelates: -4 }, { minEra: 3 }),
  ] },
  { id: 'church_lands', name: { en: 'Church lands', de: 'Kirchengut' }, group: 'faith', default: fix(0), options: [
    o('untouched', 'Untouched', 'Unangetastet', {}, { prelates: 3 }),
    o('taxed', 'Taxed', 'Besteuert', { tax: 0.04 }, { prelates: -5 }),
    o('secularised', 'Secularised', 'Säkularisiert', { tax: 0.08, authority: 1 }, { prelates: -15 }, { minEra: 2 }),
  ] },
  { id: 'press', name: { en: 'Printing', de: 'Buchdruck' }, group: 'society', default: fix(0), options: [
    o('none', 'Manuscripts', 'Handschriften', {}, {}),
    o('licensed', 'Licensed presses', 'Lizenzierte Druckereien', { research: 0.05, literacy: 0.02 }, {}, { minEra: 1 }),
    o('free', 'Free presses', 'Freie Druckereien', { research: 0.1, literacy: 0.04, reform_pressure: 0.3 }, { prelates: -5 }, { minEra: 1 }),
  ] },
  { id: 'officers', name: { en: 'Officer corps', de: 'Offizierskorps' }, group: 'military', default: fix(0), options: [
    o('birth', 'Command by birth', 'Befehl nach Geburt', { morale: 0.05 }, { magnates: 4 }),
    o('purchase', 'Purchased commissions', 'Gekaufte Patente', { army_cost: -0.05, discipline: -0.03 }, { burghers: 3 }),
    o('merit', 'Promotion by merit', 'Beförderung nach Verdienst', { discipline: 0.08, shock: 0.05 }, { magnates: -5 }, { minEra: 2 }),
  ] },
  { id: 'roads', name: { en: 'Roads and posts', de: 'Straßen und Post' }, group: 'economy', default: fix(0), options: [
    o('local', 'Local upkeep', 'Örtlicher Unterhalt', {}, {}),
    o('tolls', 'Toll roads', 'Mautstraßen', { tax: 0.02, trade: -0.02 }, { magnates: 2 }),
    o('royal', 'Royal roads and posts', 'Königliche Straßen und Post', { control: 0.06, speed: 0.08, tax: -0.02 }, {}, { minEra: 1 }),
  ] },
  { id: 'inquisition', name: { en: 'Heresy trials', de: 'Ketzerprozesse' }, group: 'faith', default: fix(0), options: [
    o('none', 'No tribunals', 'Keine Tribunale', {}, {}),
    o('episcopal', 'Episcopal courts', 'Bischofsgerichte', { reform_pressure: -0.15, conversion: 0.1 }, { prelates: 3 }),
    o('tribunal', 'Standing tribunal', 'Ständiges Tribunal', { reform_pressure: -0.4, conversion: 0.25, unrest: 2, research: -0.04 }, { prelates: 8 }),
  ] },
  { id: 'regency', name: { en: 'Regency rules', de: 'Regentschaftsregeln' }, group: 'crown', default: fix(0), options: [
    o('mother', 'Queen-mother regent', 'Königinmutter als Regentin', { regency_strife: 0.2 }, {}),
    o('council', 'Regency council', 'Regentschaftsrat', { regency_strife: 0.05 }, { magnates: 4 }),
    o('uncle', 'Eldest kinsman', 'Ältester Verwandter', { regency_strife: 0.35, mandate_gain: 0.02 }, {}),
  ] },
  { id: 'land_market', name: { en: 'Land tenure', de: 'Bodenrecht' }, group: 'society', default: fix(0), options: [
    o('entailed', 'Entailed estates', 'Fideikommisse', { growth: -0.01 }, { magnates: 6 }),
    o('saleable', 'Saleable land', 'Verkäuflicher Boden', { production: 0.03, trade: 0.03 }, { burghers: 4, magnates: -2 }),
    o('enclosure', 'Enclosures', 'Einhegungen', { production: 0.06, unrest: 2.5, growth: 0.02 }, { burghers: 4, commons: -8 }, { minEra: 2 }),
  ] },
];
export const LAW_INDEX: Record<string, number> = Object.fromEntries(LAWS.map((l, i) => [l.id, i]));

// ---------------- society value axes (8) ----------------
export const VALUES: { id: string; low: I18n; high: I18n; effectsLow: Record<string, number>; effectsHigh: Record<string, number> }[] = [
  { id: 'crown', low: { en: 'Many Lords', de: 'Viele Herren' }, high: { en: 'One Crown', de: 'Eine Krone' }, effectsLow: { unrest: -2, control: -0.1, manpower: 0.1 }, effectsHigh: { control: 0.12, tax: 0.08, unrest: 1 } },
  { id: 'bondage', low: { en: 'Free Commons', de: 'Freie Gemeinen' }, high: { en: 'Bound Commons', de: 'Gebundene Gemeinen' }, effectsLow: { production: 0.06, growth: 0.02 }, effectsHigh: { manpower: 0.1, tax: 0.03, unrest: 2 } },
  { id: 'tradition', low: { en: 'Old Custom', de: 'Altes Herkommen' }, high: { en: 'New Learning', de: 'Neue Gelehrsamkeit' }, effectsLow: { concord_gain: 0.1, mandate_gain: 0.05 }, effectsHigh: { research: 0.15 } },
  { id: 'faith', low: { en: 'One Faith', de: 'Ein Glaube' }, high: { en: 'Many Faiths', de: 'Viele Glauben' }, effectsLow: { conversion: 0.3, morale: 0.05 }, effectsHigh: { tolerance: 0.3, trade: 0.06 } },
  { id: 'sea', low: { en: 'Land', de: 'Land' }, high: { en: 'Sea', de: 'See' }, effectsLow: { manpower: 0.1, defence: 0.05 }, effectsHigh: { naval: 0.15, trade: 0.08, colonise: 0.15 } },
  { id: 'quality', low: { en: 'The Many', de: 'Die Masse' }, high: { en: 'The Few', de: 'Die Auslese' }, effectsLow: { manpower: 0.15, army_cost: -0.08 }, effectsHigh: { discipline: 0.08, morale: 0.08 } },
  { id: 'purse', low: { en: 'Plough', de: 'Pflug' }, high: { en: 'Purse', de: 'Geldbeutel' }, effectsLow: { growth: 0.03, unrest: -1 }, effectsHigh: { trade: 0.12, production: 0.04 } },
  { id: 'sword', low: { en: 'Pen', de: 'Feder' }, high: { en: 'Sword', de: 'Schwert' }, effectsLow: { diplomacy: 0.1, dread_decay: 0.2 }, effectsHigh: { shock: 0.08, prestige: 0.3, dread: 0.2 } },
];
