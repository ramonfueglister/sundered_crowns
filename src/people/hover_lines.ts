// The lines of the card a figure shows while the pointer rests on it (hover.ts): text only, so it can be tested
// without a page.
import type { PersonDetail } from '../net/people';

/** The sectors of the calibration table (data/economy/england_1356.json), in its order. */
const SECTORS = ['Landwirtschaft', 'Gewerbe', 'Dienste'] as const;
/** Below this age a person is a child (as the figures: src/figures/people.ts FIGURE_FROM_AGE). */
const CHILD_UNTIL = 14;

/** The lines of the card: a title and [label, value] rows. Text only, so it can be tested without a page. */
export function hoverLines(p: PersonDetail): { title: string; rows: [string, string][] } {
  const h = p.history, title = `${h ? h.name : p.female ? 'Frau' : 'Mann'}${p.alive ? '' : ' †'}`, rows: [string, string][] = [];
  rows.push(['Alter', p.age === null ? 'unbekannt' : `${Math.floor(p.age)} Jahre`]);
  if (h?.crowns.length) rows.push([h.crowns.length > 1 ? 'Kronen' : 'Krone', h.crowns.map((c) => c.name).join(', ')]);
  else if (h?.house) rows.push(['Haus', h.house]);
  const work = workOf(p);
  if (work) rows.push(['Erwerb', work]);
  if (p.town) rows.push(['Wohnt', p.dwelling === 'parcel' ? `Parzelle in ${p.town}` : p.dwelling === 'farmstead' ? `Hof bei ${p.town}` : p.town]);
  // a world server older than these fields sends no spouse and no children
  const children = p.children ?? [];
  const kin = [p.spouse >= 0 ? 'verheiratet' : '', children.length ? `${children.length} ${children.length === 1 ? 'Kind' : 'Kinder'}` : ''].filter(Boolean);
  if (kin.length) rows.push(['Familie', kin.join(', ')]);
  if (p.household && p.household.persons > 1) rows.push(['Haushalt', `${p.household.persons} Personen, ${p.household.working} erwerbstätig`]);
  // only the IQ: the Big Five are numbers of the simulation, and no word for them was agreed (Ramon, 19 Nov 2026)
  rows.push(['Merkmale', `IQ ${p.iq}`]);
  return { title, rows };
}

/** What the person does for a living, in a few words; null in a world without economies of the cities. */
function workOf(p: PersonDetail): string | null {
  const e = p.economy;
  if (!e) return null;
  const sector = SECTORS[e.sector] ?? 'Betrieb';
  if (e.role === 'worker') return e.firm >= 0 ? `${p.female ? 'Arbeiterin' : 'Arbeiter'}, ${sector}` : 'ohne Arbeit';
  if (e.role === 'owner') return `führt einen Betrieb, ${sector}`;
  if (e.role === 'banker') return 'führt die Bank der Stadt';
  return p.age !== null && p.age < CHILD_UNTIL ? 'Kind' : 'nicht erwerbstätig';
}
