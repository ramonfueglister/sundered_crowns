// Tax instruments beside the class taxes: a land tax on the owners of the land, a hearth tax per household and an
// excise on goods made and sold. They are set per realm with a slider (command { t: 'budget', key: 'land' |
// 'hearth' | 'excise' }), collected in every location by systems/economy.ts and resented by the Powers they hit.
import type { Nation } from '../types';

export interface DutyDef { id: 'land' | 'hearth' | 'excise'; ledger: string; max: number; step: number; estates: Record<string, number>; unrest: number }
/** estates: contentment target lost per unit of the rate; unrest: unrest points in every location per unit. */
export const DUTIES: DutyDef[] = [
  // a share of the value of harvests and raw goods, paid first by the lords and the church who own the land
  { id: 'land', ledger: 'land_tax', max: 0.1, step: 0.005, estates: { magnates: 150, prelates: 100 }, unrest: 20 },
  // marks per hundred people a month (times the price level): falls on every household alike, so on the poor most
  { id: 'hearth', ledger: 'hearth_tax', max: 1, step: 0.05, estates: { commons: 12 }, unrest: 6 },
  // a share of the value of crafts and raw goods brought to market, paid by artisans, burghers and labourers
  { id: 'excise', ledger: 'excise', max: 0.1, step: 0.005, estates: { burghers: 150 }, unrest: 30 },
];
export const DUTY_INDEX: Record<string, DutyDef> = Object.fromEntries(DUTIES.map((d) => [d.id, d]));

export function dutyRate(n: Nation, id: DutyDef['id']): number { return n.duties?.[id] ?? 0; }
/** How much a duty lowers the contentment an estate drifts toward (systems/politics.ts). */
export function dutyDiscontent(n: Nation, estate: string): number {
  if (!n.duties) return 0;
  let v = 0; for (const d of DUTIES) { const k = d.estates[estate]; if (k) v += (n.duties[d.id] ?? 0) * k; }
  return v;
}
/** Unrest the duties add in every location of the realm (systems/economy.ts). */
export function dutyUnrest(n: Nation): number {
  if (!n.duties) return 0;
  let v = 0; for (const d of DUTIES) v += (n.duties[d.id] ?? 0) * d.unrest;
  return v;
}
export function setDuty(n: Nation, id: string, value: number): string | null {
  const d = DUTY_INDEX[id]; if (!d) return 'unknown budget item';
  const v = Math.max(0, Math.min(d.max, Number.isFinite(value) ? value : 0));
  n.duties = { land: 0, hearth: 0, excise: 0, ...(n.duties ?? {}), [id]: Math.round(v / d.step) * d.step };
  return null;
}
