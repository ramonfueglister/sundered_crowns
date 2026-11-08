// Small helpers shared by event content files. Kept cheap: triggers run for every realm every three months.
import type { EvApi } from '../../systems/events';
import { H } from '../../systems/events';
import { nationLocsRO } from '../../systems/war';
import { ageOf } from '../../systems/politics';
import { B, BI } from '../../defs';
import { faithFamily } from '../peoples';
import type { World } from '../../world';

const NAME_CACHE = new WeakMap<World, Map<string, number>>();
/** Land location id by its map name, or -1. */
export function locByName(w: World, name: string): number {
  let m = NAME_CACHE.get(w);
  if (!m) { m = new Map(); for (let i = 0; i < w.L; i++) if (w.names[i] && !m.has(w.names[i])) m.set(w.names[i], i); NAME_CACHE.set(w, m); }
  return m.get(name) ?? -1;
}
/** Does the realm own the named location? */
export function owns(e: EvApi, name: string): boolean { const l = locByName(e.w, name); return l >= 0 && e.s.loc.owner[l] === e.n.id; }
/** Owner of the named location (-1 if unknown or unowned). */
export function ownerOf(e: EvApi, name: string): number { const l = locByName(e.w, name); return l >= 0 ? e.s.loc.owner[l] : -1; }
export function isKey(e: EvApi, ...keys: string[]) { return keys.includes(e.n.key); }
export function nationByKey(e: EvApi, key: string) { return e.s.nations.find((x) => x.key === key && x.alive); }
export function faithIs(e: EvApi, ...ids: string[]) { return ids.some((id) => e.n.faith === H.faith(id)); }
export function christian(e: EvApi) { return faithFamily(e.n.faith) === 'christian'; }
export function muslim(e: EvApi) { return faithFamily(e.n.faith) === 'muslim'; }
export function latin(e: EvApi) { return e.n.faith === H.faith('latin'); }
export function protestant(e: EvApi) { return faithIs(e, 'evangelical', 'reformed', 'anglican_type', 'hussite'); }
export function inc(e: EvApi) { return Math.max(10, e.n.income.tax || 10); }
export function rich(e: EvApi, months: number) { return e.n.treasury > inc(e) * months; }
export function nLocs(e: EvApi) { return nationLocsRO(e.s, e.n.id).length; }
export function est(e: EvApi, id: string) { return e.n.estates.find((x) => x.id === id) ?? { id, influence: 0, contentment: 50, privileges: [] }; }
export function ruler(e: EvApi) { return e.s.chars[e.n.ruler]; }
export function rulerAge(e: EvApi) { const r = ruler(e); return r ? ageOf(e.s, r) : 40; }
export function heir(e: EvApi) { const h = e.n.heir ? e.s.chars[e.n.heir] : undefined; return h && h.alive ? h : undefined; }
export function heirAge(e: EvApi) { const h = heir(e); return h ? ageOf(e.s, h) : -1; }
export function monarchy(e: EvApi) { return e.n.gov.includes('monarchy'); }
export function republic(e: EvApi) { return e.n.gov.includes('republic'); }
export function settled(e: EvApi) { return e.n.gov !== 'nomadic_horde' && e.n.gov !== 'tribal_federation'; }
export function hasBuilding(e: EvApi, loc: number, b: string) { return loc >= 0 && e.s.loc.buildings[loc * B + BI[b]] > 0; }
export function anyBuilding(e: EvApi, b: string) { const bi = BI[b]; for (const l of nationLocsRO(e.s, e.n.id)) if (e.s.loc.buildings[l * B + bi] > 0) return true; return false; }
/** Average harvest factor of the realm's lands (1 = normal). */
export function avgHarvest(e: EvApi) { const ls = nationLocsRO(e.s, e.n.id); if (!ls.length) return 1; let t = 0; for (const l of ls) t += e.s.loc.harvest[l]; return t / ls.length; }
export function plagueLoc(e: EvApi, min = 0.2) { for (const l of nationLocsRO(e.s, e.n.id)) if (e.s.loc.plague[l] > min) return l; return -1; }
export function coastal(e: EvApi) { return e.n.capital >= 0 && !!e.w.coastal[e.n.capital]; }
export function hasCoast(e: EvApi) { for (const l of nationLocsRO(e.s, e.n.id)) if (e.w.coastal[l]) return true; return false; }
/** Realm's capital lies at or west of this longitude (Atlantic-facing). */
export function atlantic(e: EvApi) { return e.n.capital >= 0 && e.w.lon[e.n.capital] < 0 && hasCoast(e); }
export function townLoc(e: EvApi, min = 4) { return H.randomLoc(e, (l) => e.w.townSize[l] >= min); }
export function capitalOr(e: EvApi, l: number) { return l >= 0 ? l : e.n.capital; }
/** Most populous towns first: picks among the realm's larger towns, else the capital. */
export function bigTown(e: EvApi) { const l = townLoc(e, 5); return l >= 0 ? l : e.n.capital; }
export function atWar(e: EvApi) { return H.atWar(e.s, e.n.id); }
export function big(e: EvApi, locs = 20) { return nLocs(e) >= locs; }
export function eraAtLeast(e: EvApi, k: number) { return e.n.era >= k; }
/** A random living neighbour of the same faith family, or -1. */
export function neighbourOfFaith(e: EvApi, same: boolean) {
  return H.pickNeighbour(e, (o) => (faithFamily(e.s.nations[o].faith) === faithFamily(e.n.faith)) === same);
}
export function setOther(e: EvApi, o: number) { e.ctx.other = o; return o >= 0; }
let NW_DAY = -1, NW_VAL = false, NW_STATE: object | null = null;
/** Has any realm reached the lands across the Ocean (or has a western route been proven)? Cached per day. */
export function newWorldKnown(e: EvApi): boolean {
  if (NW_DAY !== e.s.day || NW_STATE !== e.s) {
    NW_DAY = e.s.day; NW_STATE = e.s;
    NW_VAL = !!e.s.flags.west_route_found || Object.keys(e.s.flags).some((k) => k.startsWith('newworld_'));
  }
  return NW_VAL;
}
