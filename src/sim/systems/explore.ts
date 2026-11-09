// Expeditions (spec point 91): a squadron fitted out in one of our harbours, or a fleet of ours, sails for an unknown
// sea region; it charts the coasts and waters it passes and reports on arrival what it found. The plan shows cost,
// time, the risk of losing ships and what is required; the command and the AI use the same plan, so what is shown is
// what is paid and checked.
import type { Army, Explorer, GameState, I18n, Nation } from '../types';
import type { World } from '../world';
import { UNITS, B, BI, GOODS } from '../defs';
import { notice, chronicle } from '../ctx';
import { findPath, travelDays, unitCost, availableUnits, newArmy, seaNear } from './military';

/** Ships of a squadron fitted out for an expedition; expeditions a realm may have at sea at once. */
export const EXPEDITION_SHIPS = 3, MAX_EXPEDITIONS = 2;
/** Commerce & Learning for coastal voyages; for an ocean voyage (target farther than OCEAN_KM from the harbour) also
 *  the Age of Print and Horizons (era 1). */
export const COAST_TECH = 6, OCEAN_TECH = 10, OCEAN_ERA = 1, OCEAN_KM = 2500;
/** Provisions and crews' pay per ship and month at sea, times the price level; a squadron of light vessels fitted out
 *  for discovery costs half the price of the same ships built for war. */
export const PROVISIONS = 40, FIT_OUT = 0.5;
/** Beyond FAR_KM from the capital every place sailed through may cost a ship (LOSS_STEP), as explorersDay rolls it. */
export const FAR_KM = 3000, LOSS_STEP = 0.01;
/** An expedition charts everything within this distance of the waters it sails through. */
export const CHART_KM = 700;
const SAILORS_PER_SHIP = 50;

// ---------------- sea regions ----------------
/** German names of the seas (the map's sea zones carry English names). */
const SEA_DE: Record<string, string> = {
  'Northwest Passage': 'Nordwestpassage', 'Baffin Bay': 'Baffinbucht', 'Scoresby Sound': 'Scoresbysund', 'Kara Sea': 'Karasee', 'Barents Sea': 'Barentssee',
  'Greenland Sea': 'Grönlandsee', 'Norwegian Sea': 'Europäisches Nordmeer', 'Gulf of Boothia': 'Golf von Boothia', 'Disko Bay': 'Diskobucht', 'Foxe Basin': 'Foxebecken',
  'White Sea': 'Weißes Meer', 'Davis Strait': 'Davisstraße', 'Atlantic Ocean': 'Atlantischer Ozean', 'Vestfjorden': 'Vestfjord', 'Gulf of Ob': 'Obbusen',
  'Denmark Strait': 'Dänemarkstraße', 'Cumberland Sound': 'Cumberland-Sund', 'Gulf of Bothnia': 'Bottnischer Meerbusen', 'Hudson Bay': 'Hudsonbucht',
  'Hudson Strait': 'Hudsonstraße', 'Trondheimsfjord': 'Trondheimsfjord', 'Labrador Sea': 'Labradorsee', 'Gulf of Finland': 'Finnischer Meerbusen', 'North Sea': 'Nordsee',
  'Baltic Sea': 'Ostsee', 'Skagerrak': 'Skagerrak', 'Ungava Bay': 'Ungava-Bucht', 'Gulf of Riga': 'Rigaer Meerbusen', 'Sea of the Hebrides': 'Hebridensee',
  'Kattegat': 'Kattegat', 'Øresund': 'Öresund', 'Irish Sea': 'Irische See', 'Bay of Mecklenburg': 'Mecklenburger Bucht', 'Wadden Sea': 'Wattenmeer',
  'James Bay': 'James Bay', 'Bristol Channel': 'Bristolkanal', 'English Channel': 'Ärmelkanal', 'Gulf of Saint Lawrence': 'Sankt-Lorenz-Golf',
  'Saint Lawrence River': 'Sankt-Lorenz-Strom', 'Bay of Biscay': 'Golf von Biskaya', 'Caspian Sea': 'Kaspisches Meer', 'Black Sea': 'Schwarzes Meer',
  'Adriatic Sea': 'Adriatisches Meer', 'Gulf of Maine': 'Golf von Maine', 'Tyrrhenian Sea': 'Tyrrhenisches Meer', 'Gulf of Lion': 'Golfe du Lion',
  'Mediterranean Sea': 'Mittelmeer', 'Garabogazköl': 'Kara-Bogas-Gol', 'Balearic Sea': 'Balearisches Meer', 'Aegean Sea': 'Ägäisches Meer', 'Ionian Sea': 'Ionisches Meer',
  'Sea of Crete': 'Kretisches Meer', 'Pacific Ocean': 'Pazifischer Ozean', 'Alboran Sea': 'Alboránmeer', 'Río de la Plata': 'Río de la Plata', 'Indian Ocean': 'Indischer Ozean',
  'Gulf of Gabès': 'Golf von Gabès', 'Gulf of Sidra': 'Große Syrte', 'Gulf of Mexico': 'Golf von Mexiko', 'Persian Gulf': 'Persischer Golf', 'Gulf of Suez': 'Golf von Sues',
  'Gulf of Aqaba': 'Golf von Akaba', 'Red Sea': 'Rotes Meer', 'Arabian Sea': 'Arabisches Meer', 'Gulf of Oman': 'Golf von Oman', 'Florida Strait': 'Floridastraße',
  'Mozambique Channel': 'Straße von Mosambik', 'Caribbean Sea': 'Karibisches Meer', 'Bay of Campeche': 'Golf von Campeche', 'Bab-el-Mandeb': 'Bab al-Mandab',
  'Gulf of Aden': 'Golf von Aden', 'Bight of Benin': 'Bucht von Benin', 'Gulf of Guinea': 'Golf von Guinea', 'Bight of Biafra': 'Bucht von Biafra',
  'Marajó Bay': 'Marajó-Bucht', 'Ligurian Sea': 'Ligurisches Meer', 'Sargasso Sea': 'Sargassosee', 'Amazon': 'Amazonas', 'Eclipse Sound': 'Eclipse Sound',
};
const DIR_DE: Record<string, string> = {
  North: 'Nord', 'North-East': 'Nordost', East: 'Ost', 'South-East': 'Südost', South: 'Süd', 'South-West': 'Südwest', West: 'West', 'North-West': 'Nordwest', Central: 'Mitte',
};
/** Seas with more zones than this keep their quarter ("Atlantic Ocean (North-East)") as a region of their own. */
const LARGE_SEA = 30;

export interface SeaRegion { id: number; key: string; name: I18n; zones: number[]; lon: number; lat: number }
interface Regions { list: SeaRegion[]; of: Int16Array }
const REGIONS = new WeakMap<World, Regions>();
/** The sea zones grouped into named regions (static: depends on the map only). */
export function seaRegions(w: World): Regions {
  const c = REGIONS.get(w); if (c) return c;
  const strip = (x: string) => x.replace(/\s+\d+$/, '');
  const baseOf = (x: string) => strip(x).replace(/\s*\([^)]*\)\s*$/, '');
  const count = new Map<string, number>();
  for (let j = w.L; j < w.N; j++) { const b = baseOf(w.names[j] ?? ''); count.set(b, (count.get(b) ?? 0) + 1); }
  const by = new Map<string, SeaRegion>(); const of = new Int16Array(w.N - w.L).fill(-1); const list: SeaRegion[] = [];
  for (let j = w.L; j < w.N; j++) {
    const en0 = strip(w.names[j] ?? ''), base = baseOf(en0);
    const key = (count.get(base) ?? 0) > LARGE_SEA ? en0 : base;
    let r = by.get(key);
    if (!r) {
      const dir = key !== base ? /\(([^)]*)\)/.exec(key)?.[1] ?? '' : '';
      const de = (SEA_DE[base] ?? base) + (dir ? ` (${DIR_DE[dir] ?? dir})` : '');
      r = { id: list.length, key, name: { en: key, de }, zones: [], lon: 0, lat: 0 }; by.set(key, r); list.push(r);
    }
    r.zones.push(j); r.lon += w.lon[j]; r.lat += w.lat[j]; of[j - w.L] = r.id;
  }
  for (const r of list) { r.lon /= r.zones.length; r.lat /= r.zones.length; }
  const out = { list, of }; REGIONS.set(w, out); return out;
}
export function regionOf(w: World, zone: number): SeaRegion | null { if (zone < w.L || zone >= w.N) return null; const r = seaRegions(w); return r.list[r.of[zone - w.L]] ?? null; }

const known = (s: GameState, n: Nation, l: number) => { if (s.flags.revealAll) return true; const e = s.explored[n.knows]; return !e || e[l] === 1; };

/** Sea regions with waters unknown to us: for each the zone an expedition would make for (the unknown zone nearest the
 *  middle of the region, so that the voyage crosses it), how much of it we know and how far it lies from our harbours. */
export function expeditionTargets(s: GameState, w: World, n: Nation): { region: SeaRegion; to: number; unknown: number; km: number }[] {
  const ports = harbours(s, w, n);
  const from = ports.length ? ports : n.capital >= 0 ? [n.capital] : [];
  if (!from.length) return [];
  const out: { region: SeaRegion; to: number; unknown: number; km: number }[] = [];
  for (const r of seaRegions(w).list) {
    // the zone at the middle of the region
    let mid = r.zones[0], md = Infinity;
    const cl = Math.cos(r.lat * Math.PI / 180);
    for (const z of r.zones) { const dx = (w.lon[z] - r.lon) * cl, dy = w.lat[z] - r.lat, d = dx * dx + dy * dy; if (d < md) { md = d; mid = z; } }
    let unknown = 0, to = -1, bd = Infinity;
    for (const z of r.zones) {
      if (known(s, n, z)) continue;
      unknown++;
      const d = w.distKm(mid, z); if (d < bd) { bd = d; to = z; }
    }
    if (!unknown || to < 0) continue;
    let km = Infinity; for (const p of from) km = Math.min(km, w.distKm(p, to));
    out.push({ region: r, to, unknown, km: Math.round(km) });
  }
  return out.sort((a, b) => a.km - b.km || a.region.id - b.region.id);
}

/** Our harbours: coastal places we hold and control with a harbour. */
export function harbours(s: GameState, w: World, n: Nation): number[] {
  const out: number[] = [];
  for (let i = 0; i < w.L; i++) if (s.loc.owner[i] === n.id && s.loc.ctrl[i] === n.id && w.coastal[i] && s.loc.buildings[i * B + BI.port] > 0) out.push(i);
  return out;
}
/** The ship type for an expedition: the cheapest sea-going ship we can build (no galleys, transports or ships of the
 *  line), the faster one at the same price. */
export function expeditionShip(s: GameState, n: Nation): number {
  let best = -1;
  for (const u of availableUnits(s, n, true)) {
    const d = UNITS[u]; if (!d.sea || d.sea.galley || d.id === 'transport' || d.sea.cannons > 40) continue;
    if (best < 0 || d.cost < UNITS[best].cost || (d.cost === UNITS[best].cost && d.speed > UNITS[best].speed)) best = u;
  }
  return best;
}

export interface ExpeditionNeed { key: 'harbour' | 'commerce' | 'era' | 'slots' | 'sailors' | 'gold' | 'fleet' | 'route'; ok: boolean; have?: number; need?: number }
export interface ExpeditionPlan {
  to: number; region: I18n | null; fleet: number; port: number; start: number; unit: number; ships: number;
  path: number[]; days: number; km: number; ocean: boolean;
  cost: { ships: number; provisions: number; months: number; total: number };
  risk: { farSteps: number; loseOne: number; expected: number; loseAll: number };
  needs: ExpeditionNeed[]; refusal: string | null;
}

/** Everything about an expedition to sea zone `to` with fleet `fleet` (0: a squadron fitted out in the harbour nearest
 *  the target): the route, days, cost, risk and requirements; refusal says why it cannot sail (null: it can). */
export function expeditionPlan(s: GameState, w: World, n: Nation, to: number, fleet = 0): ExpeditionPlan {
  const needs: ExpeditionNeed[] = [];
  const plan: ExpeditionPlan = {
    to, region: regionOf(w, to)?.name ?? null, fleet, port: -1, start: -1, unit: -1, ships: 0, path: [], days: 0, km: 0, ocean: false,
    cost: { ships: 0, provisions: 0, months: 0, total: 0 }, risk: { farSteps: 0, loseOne: 0, expected: 0, loseAll: 0 }, needs, refusal: null,
  };
  const fail = (why: string) => { plan.refusal ??= why; };
  if (to < w.L || to >= w.N) { fail('choose a sea zone'); return plan; }
  let f: Army | undefined;
  if (fleet) {
    f = s.armies.find((a) => a.id === fleet && a.owner === n.id && a.fleet);
    needs.push({ key: 'fleet', ok: !!f && !f.battle });
    if (!f) { fail('need a fleet'); return plan; }
    if (f.battle) fail('in battle');
    plan.start = f.loc; plan.ships = f.regs.reduce((p, r) => p + r.men, 0); plan.unit = f.regs[0]?.type ?? -1;
    if (s.explorers.some((x) => x.id === f!.id)) fail('already under way');
  } else {
    const ports = harbours(s, w, n);
    needs.push({ key: 'harbour', ok: ports.length > 0, have: ports.length, need: 1 });
    if (!ports.length) { fail('needs a harbour'); }
    let bd = Infinity; for (const p of ports) { const d = w.distKm(p, to); if (d < bd) { bd = d; plan.port = p; } }
    plan.start = plan.port >= 0 ? seaNear(w, plan.port) : -1;
    plan.unit = expeditionShip(s, n); plan.ships = EXPEDITION_SHIPS;
    if (plan.unit < 0) fail('unit not available');
    const sailors = plan.ships * SAILORS_PER_SHIP;
    needs.push({ key: 'sailors', ok: n.sailors >= sailors, have: Math.floor(n.sailors), need: sailors });
    if (n.sailors < sailors) fail('not enough sailors');
    if (plan.unit >= 0) plan.cost.ships = unitCost(s, n, plan.unit, plan.ships) * FIT_OUT;
  }
  plan.km = plan.start >= 0 ? Math.round(w.distKm(plan.start, to)) : 0;
  plan.ocean = plan.km > OCEAN_KM;
  needs.push({ key: 'commerce', ok: n.tech[1] >= (plan.ocean ? OCEAN_TECH : COAST_TECH), have: n.tech[1], need: plan.ocean ? OCEAN_TECH : COAST_TECH });
  if (n.tech[1] < COAST_TECH) fail('our navigators lack the knowledge (Commerce 6)');
  else if (plan.ocean && n.tech[1] < OCEAN_TECH) fail('an ocean voyage needs Commerce 10');
  if (plan.ocean) { needs.push({ key: 'era', ok: n.era >= OCEAN_ERA, have: n.era, need: OCEAN_ERA }); if (n.era < OCEAN_ERA) fail('an ocean voyage needs the Age of Print and Horizons'); }
  const busy = s.explorers.filter((x) => x.nation === n.id && x.since !== undefined).length;
  needs.push({ key: 'slots', ok: busy < MAX_EXPEDITIONS, have: busy, need: MAX_EXPEDITIONS });
  if (busy >= MAX_EXPEDITIONS) fail('two expeditions are already at sea');
  // the route and its length (a squadron to be fitted out is planned from the sea by its harbour)
  if (plan.start >= 0 && plan.unit >= 0) {
    const probe = (f ?? { id: -1, owner: n.id, loc: plan.start, fleet: true, regs: [{ type: plan.unit, men: plan.ships }], progress: 0, path: [], general: 0 }) as Army;
    const p = findPath(s, w, probe, plan.start, to, 60000);
    needs.push({ key: 'route', ok: !!p });
    if (!p) fail('no route');
    else {
      plan.path = p; plan.days = Math.ceil(travelDays(s, w, { ...probe, loc: plan.start, progress: 0 } as Army, p));
      for (const z of p) if (n.capital >= 0 && w.distKm(z, n.capital) > FAR_KM) plan.risk.farSteps++;
    }
  }
  const k = plan.risk.farSteps, q = LOSS_STEP;
  plan.risk.loseOne = 1 - Math.pow(1 - q, k);
  plan.risk.expected = Math.min(plan.ships, k * q);
  // all ships lost: at least `ships` losses among k chances
  let pAll = 0;
  if (plan.ships > 0 && k >= plan.ships) { let below = 0, c = 1; for (let j = 0; j < plan.ships; j++) { below += c * Math.pow(q, j) * Math.pow(1 - q, k - j); c = c * (k - j) / (j + 1); } pAll = Math.max(0, 1 - below); }
  plan.risk.loseAll = pAll;
  plan.cost.months = Math.max(1, Math.ceil(plan.days / 30));
  plan.cost.provisions = PROVISIONS * s.priceLevel * plan.ships * plan.cost.months;
  plan.cost.total = plan.cost.ships + plan.cost.provisions;
  needs.push({ key: 'gold', ok: n.treasury >= plan.cost.total, have: Math.floor(n.treasury), need: Math.ceil(plan.cost.total) });
  if (n.treasury < plan.cost.total) fail('not enough gold');
  return plan;
}

/** Send a fleet beyond the known world toward a sea zone; it reveals coasts as it sails. */
export function startExplorer(s: GameState, w: World, n: Nation, fleet: number, to: number): string | null {
  const f = s.armies.find((a) => a.id === fleet && a.owner === n.id && a.fleet); if (!f) return 'need a fleet';
  if (n.tech[1] < COAST_TECH) return 'our navigators lack the knowledge (Commerce 6)';
  if (to < w.L) return 'choose a sea zone';
  const p = findPath(s, w, f, f.loc, to, 60000); if (!p) return 'no route';
  f.path = p; f.progress = 0; f.mission = 'explore';
  if (!s.explorers.some((x) => x.id === f.id)) s.explorers.push({ id: f.id, nation: n.id, loc: f.loc, path: p, progress: 0, fleet: true, char: f.general });
  return null;
}

/** Send an expedition (the explore command): fit out the squadron if asked, pay what the plan shows and sail. */
export function launchExpedition(s: GameState, w: World, n: Nation, fleet: number, to: number): string | null {
  const p = expeditionPlan(s, w, n, to, fleet); if (p.refusal) return p.refusal;
  let id = fleet;
  if (!fleet) {
    n.sailors -= p.ships * SAILORS_PER_SHIP;
    const a = newArmy(s, n.id, p.start, [{ type: p.unit, men: p.ships }], true, { en: `${n.adj.en} expedition`, de: `Expedition (${n.short.de})` });
    id = a.id;
  }
  n.treasury -= p.cost.total; n.expenseAcc.expeditions = (n.expenseAcc.expeditions || 0) + p.cost.total;
  const e = startExplorer(s, w, n, id, to); if (e) return e;
  const ex = s.explorers.find((x) => x.id === id);
  if (ex) { ex.to = to; ex.since = s.day; ex.found = 0; ex.lands = 0; ex.met = []; ex.goods = []; }
  return null;
}

// ---------------- on the way and on arrival ----------------
/** A place the expedition charted (called by explorersDay for each newly known place). */
export function expeditionSaw(s: GameState, w: World, ex: Explorer, l: number) {
  ex.found = (ex.found ?? 0) + 1;
  if (l >= w.L) return;
  ex.lands = (ex.lands ?? 0) + 1;
  const o = s.loc.owner[l], me = s.nations[ex.nation];
  // a realm is new to us when its capital was unknown until this voyage (seen now, or not yet)
  const c = o >= 0 ? s.nations[o]?.capital ?? -1 : -1;
  if (o >= 0 && o !== ex.nation && me && !(ex.met ??= []).includes(o) && (c < 0 || l === c || !known(s, me, c))) ex.met.push(o);
  const g = w.resource[l]; if (g >= 0 && !(ex.goods ??= []).includes(g) && ex.goods.length < 12) ex.goods.push(g);
}

const list = (xs: string[]) => xs.length ? xs.join(', ') : '—';
/** The expedition reached its goal: a report of what it found (the fleet stays where it arrived). */
export function expeditionArrived(s: GameState, w: World, n: Nation, ex: Explorer, f: Army) {
  const days = s.day - (ex.since ?? s.day);
  const r = ex.to !== undefined ? regionOf(w, ex.to) : null;
  const met = (ex.met ?? []).map((o) => s.nations[o]).filter(Boolean);
  const goods = (ex.goods ?? []).slice(0, 6).map((g) => GOODS[g]?.name).filter(Boolean) as I18n[];
  const where = r?.name ?? { en: w.names[f.loc], de: w.namesDe[f.loc] };
  const text: I18n = {
    en: `Our expedition reached the ${where.en} after ${days} days: ${ex.found ?? 0} places charted, ${ex.lands ?? 0} of them on land. Realms met: ${list(met.map((x) => x.short.en))}. Goods seen: ${list(goods.map((g) => g.en))}.`,
    de: `Unsere Expedition ist nach ${days} Tagen am Ziel (${where.de}): ${ex.found ?? 0} Orte kartiert, ${ex.lands ?? 0} davon an Land. Neue Reiche: ${list(met.map((x) => x.short.de))}. Gesehene Güter: ${list(goods.map((g) => g.de))}.`,
  };
  if (s.playerNations.includes(n.id)) notice(s, n.id, 'expedition', text, { loc: f.loc });
  if ((ex.lands ?? 0) > 0) chronicle(s, n.id, 'discovery', { en: `An expedition of ${n.short.en} charted ${ex.lands} places on the coasts of the ${where.en}.`, de: `Eine Expedition aus ${n.short.de} kartierte ${ex.lands} Orte an den Küsten: ${where.de}.` }, f.loc);
  f.mission = undefined;
}
/** The expedition's ships were all lost. */
export function expeditionLost(s: GameState, w: World, n: Nation, ex: Explorer) {
  if (!s.playerNations.includes(n.id)) return;
  const r = ex.to !== undefined ? regionOf(w, ex.to) : null;
  notice(s, n.id, 'expedition_lost', { en: `Our expedition to the ${r?.name.en ?? 'unknown waters'} was lost at sea after charting ${ex.found ?? 0} places.`, de: `Unsere Expedition (${r?.name.de ?? 'unbekannte Gewässer'}) ging auf See verloren, nachdem sie ${ex.found ?? 0} Orte kartiert hatte.` }, { loc: ex.loc });
}
