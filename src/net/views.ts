// What the world server tells clients about the state (shared so that tests can check the same views).
import type { WorldState } from '../sim/state';
import type { World } from '../sim/world';
import type { EconomyDetail, PlaceDetail, RealmInfo } from './protocol';
import { FIGURE } from '../sim/economy/engine';
import { TERRAINS, RESOURCES } from '../sim/geo';
import { ALL_CULTURES, cultureLabel, FAITHS } from '../sim/content/peoples';
import { hectares, landLimitHa, soilOf } from '../sim/systems/cultivation';
import { farmers, kcalPerHeadDay } from '../sim/systems/harvest';

export function realmInfos(s: WorldState, rulerName: (uid: string) => string | null): RealmInfo[] {
  const count = new Int32Array(s.realm.size);
  for (let i = 0; i < s.place.owner.length; i++) { const o = s.place.owner[i]; if (o >= 0) count[o]++; }
  const out: RealmInfo[] = [];
  for (let r = 0; r < s.realm.size; r++) {
    if (!s.realm.alive[r]) continue;
    const t = s.realmText[r], uid = s.ruler[r];
    out.push({
      id: r, key: t.key, name: t.name, short: t.short, adjective: t.adjective, color: s.realm.cols.color[r], capital: s.realm.cols.capital[r], faith: s.realm.cols.faith[r],
      places: count[r], ruler: uid ? (rulerName(uid) ?? '?') : null,
    });
  }
  return out;
}

/** England's economy as a place in England shows it; undefined for other places and in a world without it. */
export function economyDetail(s: WorldState, w: World, i: number): EconomyDetail | undefined {
  const e = s.economy.england;
  if (!e || !w.england[i]) return undefined;
  const f = e.figures, F = FIGURE;
  return {
    country: 'england', year: e.year, baseYear: w.englandEconomy.year, scale: w.englandEconomy.scale,
    realGdp: f[F.realGdp], realGdpIndex: 100 * f[F.realGdp] / f[F.realGdpStart],
    priceIndex: 100 * (f[F.nominalGdp] / f[F.realGdp]) / (f[F.nominalGdpStart] / f[F.realGdpStart]),
    consumption: f[F.consumption], crown: f[F.government], investment: f[F.investment], exports: f[F.exports], imports: f[F.imports],
    employed: f[F.employees] + f[F.owners], unemployed: f[F.unemployed],
    coinHouseholds: f[F.depositsHouseholds], coinFirms: f[F.depositsFirms],
    ...(e.halted ? { halted: e.halted } : {}),
  };
}

export function placeDetail(s: WorldState, w: World, i: number): PlaceDetail | null {
  if (!Number.isInteger(i) || i < 0 || i >= w.L) return null;
  const f = FAITHS[s.place.faith[i]];
  const arable = s.place.arable[i], land = hectares(w, i);
  return {
    id: i, name: w.names[i], nameDe: w.namesDe[i], owner: s.place.owner[i], terrain: TERRAINS[w.terrain[i]], resource: RESOURCES[w.resource[i]],
    culture: cultureLabel(ALL_CULTURES[s.place.culture[i]] ?? 'unknown'), faith: f ? f.name : { en: '?', de: '?' }, pop: Math.round(s.place.pop[i]),
    harvest: {
      kcal: s.place.harvest[i], perHeadDay: kcalPerHeadDay(s.place.harvest[i], s.place.pop[i]),
      landYield: Number.isNaN(w.landYield[i]) ? null : w.landYield[i], hectares: land, farmers: farmers(s.place.pop[i]),
      arable: {
        hectares: arable, share: land > 0 ? arable / land : 0, landYield: arable > 0 ? soilOf(w, i, arable) / arable : null,
        atLimit: s.place.pop[i] > 0 && arable >= landLimitHa(w, i),
      },
    },
    economy: economyDetail(s, w, i),
  };
}
