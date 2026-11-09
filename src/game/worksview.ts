// Worker-side views for managing a realm at scale: the building overview (every building type, where it can stand,
// price, estimated yield and payback), the levy overview (where the men come from, harbours, the queue), and the
// orders for one province or area from the location panel. Data only; the orders are the ordinary build, recruit and
// agent commands, sent as one batch.
import type { GameState, I18n } from '../sim/types';
import type { World } from '../sim/world';
import { B, BI, BUILDINGS, UNITS } from '../sim/defs';
import { buildQueue, constructionRefund, recruitRefund, buildCost } from '../sim/commands';
import { buildSpots, buildingGain, manpowerOf } from '../sim/systems/planning';
import { nationLocsRO } from '../sim/systems/war';
import { availableUnits, unitCost } from '../sim/systems/military';
import { agentSlots } from '../sim/systems/society';
import { FAITHS, ALL_CULTURES, cultureLabel } from '../sim/content/peoples';

/** [location, level after queued works, price, estimated crown gain per month] */
type Spot = [number, number, number, number];
const RECRUIT_DAYS = (type: number) => (UNITS[type].kind === 'ship' ? 120 : UNITS[type].kind === 'cav' ? 60 : 30);
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** Province and area of each location, with their names (for the filters here and the grouped peace demands). */
export function placesOf(w: World, locs: readonly number[]) {
  const provs: Record<number, string> = {}, areas: Record<number, string> = {};
  const areaOfProv = new Map<number, number>();
  w.areas.forEach((a) => a.provinces.forEach((p) => areaOfProv.set(p, a.id)));
  const rows: [number, number, number][] = [];
  const names: Record<number, I18n> = {};
  for (const l of locs) {
    if (!(l >= 0 && l < w.L)) continue;
    const p = w.provOf[l], a = p >= 0 ? areaOfProv.get(p) ?? -1 : -1;
    if (p >= 0) provs[p] = w.provinces[p].name; if (a >= 0) areas[a] = w.areas[a].name;
    rows.push([l, p, a]); names[l] = { en: w.names[l], de: w.namesDe[l] };
  }
  return { provs, areas, rows, names };
}

/** Building and levy overview of the player's realm (spec 22, 108). */
export function worksView(s: GameState, w: World, player: number) {
  const n = s.nations[player]; if (!n) return null;
  const locs = nationLocsRO(s, n.id);
  const places = placesOf(w, locs);
  const q = buildQueue(s);
  const types = BUILDINGS.map((b, k) => {
    const spots = buildSpots(s, w, n, k, locs, q);
    return { id: k, key: b.id, name: b.name, desc: b.desc, months: b.months, max: b.max, base: b.cost * 6, known: (b.era ?? 0) <= n.era,
      built: locs.reduce((p, l) => p + s.loc.buildings[l * B + k], 0),
      other: buildingGain(s, w, n, spots[0]?.loc ?? n.capital, k).other,
      spots: spots.map((x): Spot => [x.loc, x.level, round(x.cost, 1), round(x.gain, 3)]) };
  });
  // nth: the row's place among the realm's orders for the same place and item, which the cancel command names
  const seen = new Map<string, number>();
  const nthOf = (loc: number, item: number) => { const key = `${loc}:${item}`; const v = seen.get(key) ?? 0; seen.set(key, v + 1); return v; };
  const queue = s.constructions.filter((c) => c.nation === player).map((c) => ({ loc: c.loc, building: c.building, nth: nthOf(c.loc, c.building), left: c.left, total: BUILDINGS[c.building].months * 30, cost: c.cost, refund: constructionRefund(c) }));
  // levies: every controlled location with the men it adds to the manpower limit, and its harbour
  const levy: [number, number, number][] = [];
  for (const l of locs) if (s.loc.ctrl[l] === player && !s.sieges.some((x) => x.loc === l)) levy.push([l, round(manpowerOf(s, l), 1), w.coastal[l] ? s.loc.buildings[l * B + BI.port] : -1]);
  levy.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const units = availableUnits(s, n, false).concat(availableUnits(s, n, true)).map((u) => ({ id: u, name: UNITS[u].name, kind: UNITS[u].kind, cost: unitCost(s, n, u, UNITS[u].kind === 'ship' ? 2 : 1000), per: UNITS[u].kind === 'ship' ? 2 : 1000, days: RECRUIT_DAYS(u), upkeep: UNITS[u].upkeep }));
  seen.clear();
  const recruits = s.recruits.filter((r) => r.nation === player).map((r) => ({ loc: r.loc, type: r.type, nth: nthOf(r.loc, r.type), men: r.men, left: r.left, total: RECRUIT_DAYS(r.type), refund: recruitRefund(s, n, r) }));
  return { treasury: n.treasury, inflation: n.inflation, priceLevel: s.priceLevel, manpower: n.manpower, maxManpower: n.maxManpower, sailors: n.sailors,
    ...places, types, queue, levy, units, recruits };
}

/**
 * Orders for the province or area of a location: per building type the places in it where it can be built, and the
 * places of another faith or culture for preachers and officials.
 */
export function scopeView(s: GameState, w: World, player: number, loc: number, scope: 'province' | 'area') {
  const n = s.nations[player]; if (!n || loc < 0 || loc >= w.L) return null;
  const p = w.provOf[loc]; if (p < 0) return null;
  const area = w.areas.find((a) => a.provinces.includes(p));
  const provs = scope === 'province' || !area ? [p] : area.provinces;
  const all: number[] = []; for (const x of provs) for (const l of w.provinces[x].locs) all.push(l);
  const mine = all.filter((l) => s.loc.owner[l] === player);
  const q = buildQueue(s);
  const types = BUILDINGS.map((b, k) => ({ id: k, name: b.name, months: b.months, spots: buildSpots(s, w, n, k, mine, q).map((x): Spot => [x.loc, x.level, round(x.cost, 1), round(x.gain, 3)]) }))
    .filter((x) => x.spots.length);
  const busy = s.agents.filter((a) => a.nation === player).length;
  const agentCost = (l: number) => 15 * s.priceLevel * (1 + s.loc.dev[l] / 20);
  const agents = (['faith', 'culture'] as const).map((kind) => ({ kind,
    spots: mine.filter((l) => (kind === 'faith' ? s.loc.faith[l] !== n.faith : s.loc.culture[l] !== n.culture) && !s.agents.some((a) => a.loc === l && a.kind === kind))
      .sort((a, b) => s.loc.dev[b] - s.loc.dev[a] || a - b).map((l) => [l, round(agentCost(l), 1), kind === 'faith' ? s.loc.faith[l] : s.loc.culture[l]] as [number, number, number]),
  }));
  return { scope, name: scope === 'province' || !area ? w.provinces[p].name : area.name, total: all.length, mine: mine.length, treasury: n.treasury,
    names: Object.fromEntries(mine.map((l) => [l, { en: w.names[l], de: w.namesDe[l] }])), types,
    agents: agents.map((a) => ({ ...a, label: a.spots.map(([, , v]) => (a.kind === 'faith' ? FAITHS[v]?.name : cultureLabel(ALL_CULTURES[v] || 'unknown'))) })),
    freeAgents: Math.max(0, agentSlots(n) - busy), slots: agentSlots(n) };
}

/** The estimate behind one place's gain, for its tooltip: the extra crown income from each class, and the price. */
export function gainDetail(s: GameState, w: World, player: number, loc: number, b: number) {
  const n = s.nations[player]; if (!n || !BUILDINGS[b]) return null;
  const g = buildingGain(s, w, n, loc, b);
  let queued = 0; for (const c of s.constructions) if (c.loc === loc && c.building === b) queued++;
  const level = s.loc.buildings[loc * B + b] + queued;
  return { ...g, cost: buildCost(s, n, b, level), level, base: BUILDINGS[b].cost * 6, priceLevel: s.priceLevel, inflation: n.inflation };
}
