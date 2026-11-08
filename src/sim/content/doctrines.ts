// Doctrines: 10 groups × 7 picks. Taking picks costs Insight (accumulated monthly). Effects become permanent modifiers.
// Effect keys are those read through lawEffect()/mod(): see docs/EFFECT_KEYS.md.
import type { I18n } from '../types';
export interface DoctrinePick { name: I18n; desc?: I18n; effects: Record<string, number> }
export interface DoctrineGroup { id: string; name: I18n; desc: I18n; era: number; picks: DoctrinePick[]; complete?: Record<string, number> }
export const DOCTRINES: DoctrineGroup[] = [
  { id: 'stewardship', name: { en: 'Stewardship', de: 'Haushalterschaft' }, desc: { en: 'Orderly finances and honest officials.', de: 'Geordnete Finanzen und ehrliche Beamte.' }, era: 0, picks: [
    { name: { en: 'Audited Ledgers', de: 'Geprüfte Rechnungsbücher' }, effects: { corruption: -0.05 } },
    { name: { en: 'Crown Domains', de: 'Krondomänen' }, effects: { tax: 0.05 } },
    { name: { en: 'Fair Weights', de: 'Gerechte Gewichte' }, effects: { trade: 0.05 } },
    { name: { en: 'Royal Mint', de: 'Königliche Münze' }, effects: { interest: 0.01 } },
    { name: { en: 'Granaries', de: 'Kornspeicher' }, effects: { unrest: -2 } },
    { name: { en: 'Clerks of the Exchequer', de: 'Schreiber der Schatzkammer' }, effects: { tax: 0.05, authority_gain: 0.1 } },
    { name: { en: 'Sound Coin', de: 'Gutes Geld' }, effects: { mandate_gain: 0.1 } },
  ], complete: { tax: 0.05 } },
];
export const DOCTRINE_INDEX: Record<string, number> = Object.fromEntries(DOCTRINES.map((d, i) => [d.id, i]));
