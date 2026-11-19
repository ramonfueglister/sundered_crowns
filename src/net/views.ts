// What the world server tells clients about the state (shared so that tests can check the same views).
import type { WorldState } from '../sim/state';
import { ALIVE } from '../sim/state';
import type { I18n } from '../sim/i18n';
import type { World } from '../sim/world';
import type { CityEconomyDetail, PlaceDetail, RealmInfo } from './protocol';
import { FIGURE, FIGURES } from '../sim/economy/engine';
import { cityAt } from '../sim/systems/economy';
import { TERRAINS, RESOURCES } from '../sim/geo';
import { ALL_CULTURES, cultureLabel, FAITHS } from '../sim/content/peoples';
import { hectares, landLimitHa, soilOf } from '../sim/systems/cultivation';
import { kcalPerHeadDay } from '../sim/systems/harvest';
import { presentPersons } from '../sim/people/living';

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

/** The economy of the city of a place; undefined for a place without a city and in a world without economies. */
export function cityEconomyDetail(s: WorldState, w: World, i: number): CityEconomyDetail | undefined {
  const e = s.economy.cities, k = e ? cityAt(e, i) : -1;
  if (!e || k < 0) return undefined;
  const f = e.figures.subarray(k * FIGURES, (k + 1) * FIGURES), F = FIGURE;
  return {
    day: e.day, baseYear: w.cityEconomies.year, scale: w.cityEconomies.scale,
    realGdp: f[F.realGdp], realGdpIndex: 100 * f[F.realGdp] / f[F.realGdpStart], priceToday: 100 * f[F.priceLevel],
    consumption: f[F.consumption], crown: f[F.government], investment: f[F.investment], exports: f[F.exports], imports: f[F.imports],
    employed: f[F.employees] + f[F.owners], unemployed: f[F.unemployed],
    coinHouseholds: f[F.depositsHouseholds], coinFirms: f[F.depositsFirms],
    ...(e.halted ? { halted: e.halted } : {}),
  };
}

const NONE = { en: '—', de: '—' };

/** The persons of every place, grouped once a day (a click on a place reads only its own persons): person ids by the
 *  place of their family, ids of place p at start[p] … start[p + 1]. Rebuilt when the day, the persons or the families
 *  change in number (persons and families are only made and freed by the day's systems); who is alive and what a
 *  person is are read when asked. */
const grouped = new WeakMap<WorldState, { day: number; persons: number; families: number; start: Int32Array; ids: Int32Array }>();
const count = (t: { size: number; free: number[] }) => t.size * 65536 + t.free.length;
function personsByPlace(s: WorldState): { start: Int32Array; ids: Int32Array } {
  let g = grouped.get(s);
  if (g && g.day === s.day && g.persons === count(s.person) && g.families === count(s.family)) return g;
  const L = s.place.owner.length, P = s.person.cols, F = s.family.cols, start = new Int32Array(L + 1);
  const persons = presentPersons(s); // the dead without a part are never asked for (src/sim/people/living.ts)
  for (const id of persons) { const p = F.place[P.family[id]]; if (p >= 0 && p < L) start[p + 1]++; }
  for (let p = 0; p < L; p++) start[p + 1] += start[p];
  const ids = new Int32Array(start[L]), at = start.slice(0, L);
  for (const id of persons) { const p = F.place[P.family[id]]; if (p >= 0 && p < L) ids[at[p]++] = id; }
  g = { day: s.day, persons: count(s.person), families: count(s.family), start, ids };
  grouped.set(s, g);
  return g;
}

/** The culture and faith pairs of a place's living persons, most persons first, and how many of them live in its
 *  hamlets. */
function personsOfPlace(s: WorldState, place: number): { peoples: { culture: I18n; faith: I18n; persons: number }[]; farmers: number } {
  const P = s.person.cols, F = s.family.cols, n = new Map<number, number>(), { start, ids } = personsByPlace(s);
  let farmers = 0;
  for (let j = start[place]; j < start[place + 1]; j++) {
    const id = ids[j];
    if (!s.person.alive[id] || P.died[id] !== ALIVE) continue;
    const f = P.family[id];
    if (F.place[f] !== place) continue; // moved since the persons were grouped
    if (F.hamlet[f]) farmers++;
    const k = P.culture[id] * 256 + P.faith[id];
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  const peoples = [...n].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([k, persons]) => ({
    culture: cultureLabel(ALL_CULTURES[k >> 8] ?? 'unknown'), faith: FAITHS[k & 255]?.name ?? { en: '?', de: '?' }, persons,
  }));
  return { peoples, farmers };
}

export function placeDetail(s: WorldState, w: World, i: number): PlaceDetail | null {
  if (!Number.isInteger(i) || i < 0 || i >= w.L) return null;
  const { peoples, farmers } = personsOfPlace(s, i), first = peoples[0];
  const arable = s.place.arable[i], land = hectares(w, i);
  return {
    id: i, name: w.names[i], nameDe: w.namesDe[i], owner: s.place.owner[i], terrain: TERRAINS[w.terrain[i]], resource: RESOURCES[w.resource[i]],
    culture: first?.culture ?? NONE, faith: first?.faith ?? NONE, peoples, pop: Math.round(10 * s.place.pop[i]) / 10,
    harvest: {
      kcal: s.place.harvest[i], perHeadDay: kcalPerHeadDay(s.place.harvest[i], s.place.pop[i]),
      landYield: Number.isNaN(w.landYield[i]) ? null : w.landYield[i], hectares: land, farmers,
      arable: {
        hectares: arable, share: land > 0 ? arable / land : 0, landYield: arable > 0 ? soilOf(w, i, arable) / arable : null,
        atLimit: s.place.pop[i] > 0 && arable >= landLimitHa(w, i),
      },
    },
    cityEconomy: cityEconomyDetail(s, w, i),
  };
}
