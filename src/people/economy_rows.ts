// What the person panel says about a person's part in the economy of the city (economy feature 10,
// src/sim/systems/economy.ts): the rows of its section "Wirtschaft". Text only, so it can be tested without a page.
// Money of the engine is in £ of the calibration; a day's amounts are shown in pence (240 d a pound).
import type { PersonDetail } from '../net/people';

/** The sectors of the calibration table (data/economy/england_1356.json), in its order. */
const SECTORS = ['Landwirtschaft', 'Gewerbe', 'Dienste'] as const;
const PENCE_PER_POUND = 240, PENCE_PER_SHILLING = 12;

/** An amount of a day in pence, from £: "2,1 d". */
export const pence = (pounds: number): string => `${(pounds * PENCE_PER_POUND).toFixed(1).replace('.', ',')} d`;
/** An amount in pounds, shillings and pence, from £: "£ 1 3 s 4 d", without the parts that are 0 in front. */
export function lsd(pounds: number): string {
  const d = Math.round(pounds * PENCE_PER_POUND), l = Math.floor(d / PENCE_PER_POUND), sh = Math.floor((d % PENCE_PER_POUND) / PENCE_PER_SHILLING);
  return [l ? `£ ${l}` : '', l || sh ? `${sh} s` : '', `${d % PENCE_PER_SHILLING} d`].filter(Boolean).join(' ');
}

/** The rows of the panel about the person's part in the economy of the city (economy feature 10): [label, value]. */
export function economyRows(p: PersonDetail): [string, string][] {
  const e = p.economy;
  if (!e) return [];
  if (e.role === 'none') return [['Erwerb', 'nicht erwerbstätig']];
  const firm = e.firm >= 0 ? `${SECTORS[e.sector] ?? 'Betrieb'}, ${e.employees} Beschäftigte` : '';
  const rows: [string, string][] = e.role === 'worker'
    ? (e.firm >= 0 ? [['Erwerb', p.female ? 'Arbeiterin' : 'Arbeiter'], ['Betrieb', firm], ['Lohn am Tag', pence(e.wage)]] : [['Erwerb', 'ohne Arbeit']])
    : e.role === 'owner' ? [['Erwerb', 'führt einen Betrieb'], ['Betrieb', firm]] : [['Erwerb', 'führt die Bank der Stadt']];
  return [...rows, ['Einkommen am Tag', pence(e.income)], ['Ausgaben am Tag', pence(e.spent)], ['Erspartes', lsd(e.savings)]];
}
