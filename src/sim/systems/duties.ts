// Tax instruments beside the class taxes: a land tax on the owners of the land, a hearth tax per household and an
// excise on goods made and sold. They are set per realm with a slider (command { t: 'budget', key: 'land' |
// 'hearth' | 'excise' }), collected in every location by systems/economy.ts and resented by the Powers they hit.
import type { Nation } from '../types';
import { C, CL } from '../defs';

export interface DutyDef { id: 'land' | 'hearth' | 'excise'; ledger: string; max: number; step: number; estates: Record<string, number>; unrest: number; classes: number[]; payers: Record<string, number>; shiftTo?: string }
/** estates: contentment target lost per unit of the rate; unrest: unrest points in every location per unit;
 *  classes: the classes that pay it (systems/economy.ts collectDuties); payers: the class of each resentful estate,
 *  whose legal exemption (exempt_<class>) spares the estate both the duty and the resentment; shiftTo: the estate
 *  that pays, and resents, what the exempt ones do not (the land tax of exempt lords falls on the peasants). */
export const DUTIES: DutyDef[] = [
  // a share of the value of harvests and raw goods, paid first by the lords and the church who own the land
  { id: 'land', ledger: 'land_tax', max: 0.1, step: 0.005, estates: { magnates: 150, prelates: 100 }, unrest: 20, classes: [CL.nobles, CL.clergy, CL.peasants], payers: { magnates: CL.nobles, prelates: CL.clergy }, shiftTo: 'commons' },
  // marks per hundred people a month (times the price level): falls on every household alike, so on the poor most
  { id: 'hearth', ledger: 'hearth_tax', max: 1, step: 0.05, estates: { commons: 12 }, unrest: 6, classes: Array.from({ length: C }, (_, c) => c), payers: { commons: CL.peasants } },
  // a share of the value of crafts and raw goods brought to market, paid by artisans, burghers and labourers
  { id: 'excise', ledger: 'excise', max: 0.1, step: 0.005, estates: { burghers: 150 }, unrest: 30, classes: [CL.artisans, CL.burghers, CL.labourers, CL.wage_workers], payers: { burghers: CL.burghers } },
];
export const DUTY_INDEX: Record<string, DutyDef> = Object.fromEntries(DUTIES.map((d) => [d.id, d]));

export function dutyRate(n: Nation, id: DutyDef['id']): number { return n.duties?.[id] ?? 0; }
/** Contentment target an estate loses per unit of a duty: less by the legal exemption of the class that pays for it
 *  (exempt(c), 0..1; systems/politics.ts classExempt). */
export function dutyWeight(d: DutyDef, estate: string, exempt: (c: number) => number): number {
  let v = 0;
  const k = d.estates[estate];
  if (k) { const c = d.payers[estate]; v += k * (c === undefined ? 1 : 1 - exempt(c)); }
  if (d.shiftTo === estate) for (const e in d.estates) { const c = d.payers[e]; if (c !== undefined) v += d.estates[e] * exempt(c); }
  return v;
}
/** The estates that resent a duty, with what they lose per unit of the rate (an estate shifted to only when it is). */
export function dutyEstates(d: DutyDef, exempt: (c: number) => number): [string, number][] {
  const out: [string, number][] = Object.keys(d.estates).map((e) => [e, dutyWeight(d, e, exempt)]);
  if (d.shiftTo && !(d.shiftTo in d.estates)) { const v = dutyWeight(d, d.shiftTo, exempt); if (v > 0) out.push([d.shiftTo, v]); }
  return out;
}
/** How much the duties lower the contentment an estate drifts toward (systems/politics.ts). */
export function dutyDiscontent(n: Nation, estate: string, exempt: (c: number) => number = () => 0): number {
  if (!n.duties) return 0;
  let v = 0; for (const d of DUTIES) v += (n.duties[d.id] ?? 0) * dutyWeight(d, estate, exempt);
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
