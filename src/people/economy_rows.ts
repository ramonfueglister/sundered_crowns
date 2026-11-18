// What the person panel says about a person's part in the economy of the city (economy feature 10,
// src/sim/systems/economy.ts): the rows of its section "Wirtschaft", and about the household of the person's family
// (economy feature 11, src/sim/systems/household.ts): the rows of its section "Haushalt". Text only, so it can be
// tested without a page.
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
  const firm: [string, string][] = e.firm >= 0 ? [['Betrieb', SECTORS[e.sector] ?? 'Betrieb'], ['Beschäftigte im Betrieb', String(e.employees)]] : [];
  const rows: [string, string][] = e.role === 'worker'
    ? (e.firm >= 0 ? [['Erwerb', p.female ? 'Arbeiterin' : 'Arbeiter'], ...firm, ['Lohn am Tag', pence(e.wage)]] : [['Erwerb', 'ohne Arbeit']])
    : e.role === 'owner' ? [['Erwerb', 'führt einen Betrieb'], ...firm] : [['Erwerb', 'führt die Bank der Stadt']];
  return [...rows, ['Einkommen am Tag', pence(e.income)], ['Ausgaben am Tag', pence(e.spent)], ['Erspartes', lsd(e.savings)]];
}

/** The rows of the panel about the household of the person's family (economy feature 11): [label, value]. The
 *  family is the purse: its income and spending are those of all its members, and the person consumes a share of
 *  the spending by baskets. Since feature 15 also what the food the family needs costs a day, and the part of it
 *  the family covered (not shown for a family of a place without an economy). */
export function householdRows(p: PersonDetail): [string, string][] {
  const h = p.household;
  if (!h) return [];
  return [
    ['Personen', String(h.persons)], ['davon erwerbstätig', String(h.working)],
    ['Einkommen am Tag', pence(h.income)], ['Ausgaben am Tag', pence(h.spent)],
    ['Eigener Verbrauch am Tag', pence(h.consumed)], ['Erspartes', lsd(h.savings)],
    ...(h.need > 0 ? [['Nahrungsbedarf am Tag', pence(h.need)], ['davon gedeckt', `${Math.round(100 * h.fed)} %`]] as [string, string][] : []),
  ];
}
