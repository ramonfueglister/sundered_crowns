// Static world data (geography). Built once from the baked map files; identical in browser and world server.
import { participation } from './systems/work';
import { deName } from './content/names_de';
import { refineNames } from './content/placenames';
import { TERRAINS, RESOURCE_INDEX } from './geo';
import type { EconomyClock, EconomyEngine, EconomyRules } from './economy/engine';
import { foodNeedCost, type CalibrationTable } from './economy/calibration';
import type { Chronicle } from './content/chronicle';
import type { Borders } from './content/borders';
import type { Ground } from './content/ground';
import type { Tilth } from './content/tilth';
import type { WayNet } from './roads';

interface GeoJson {
  W: number;
  H: number;
  lon0: number;
  lon1: number;
  latN: number;
  latS: number;
  L: number;
  S: number;
  loc: {
    x: number[];
    y: number[];
    lon: number[];
    lat: number[];
    area: number[];
    elev: number[];
    rough: number[];
    emax: number[];
    name: (string | null)[];
    alt: (string | null)[];
    size: number[];
    pop: (number | null)[];
    region_key: (string | null)[];
  };
  edges: [number, number, number, number, number][];
  straits: [number, number, string][];
  passes: [number, string][];
  provinces: { name: string; locs: number[]; capital: number; area: number; region: string }[];
  areas: { name: string; provinces: number[]; region: string }[];
  rivers: { name: string; rank: number; pts: [number, number][] }[];
}
interface WorldJson {
  terrain: string[];
  resource: string[];
  name: string[];
  coastal: boolean[];
  temp: number[];
  arid: number[];
  forest: number[];
}
/** Land productivity per place (public/data/land.json, written by tools/geo/build_land.py). */
export interface LandJson {
  /** Caloric Suitability Index of the place (Galor and Özak 2016); null where the data set has no value */
  yield: (number | null)[];
  /** England: places = the places inside its outline, on which cultivation and harvest are calibrated;
   *  land = index × hectares of England as one piece of land (the calibration of the harvest before cultivated land) */
  england: { land: number; places: number[] };
  /** The land of each place sorted by yield, best soil first: mean yield of the land between two consecutive edges
   *  (shares of the place's land); a place has one step for every edge that starts below its fertile share, and its
   *  last step ends there. fertile: the share of the place's land with a yield above zero. */
  curve: { edges: number[]; fertile: number[]; steps: number[] };
}
/** The calibration of cultivated land and harvest on England (public/data/cultivation.json, written by
 *  tools/sim/calibrate_cultivation.ts; sources in docs/ECONOMY_DESIGN.md, feature 2). */
export interface CultivationJson {
  /** s: the largest share of a place's land that becomes arable */
  landLimit: number;
  /** c: hectares of arable per head while a place has land to spare */
  arablePerHead: number;
  /** T_E: the land of England in the harvest equation, so that England's places bring in England's harvest of 1300–09 */
  englandLand: number;
}

/** The economy of the world: the engine that computes a period, and the calibration table of the cities' economies
 *  (data/economy/england_1356.json; docs/ECONOMY_DESIGN.md, features 3 to 11). The world calibrates every city from
 *  the table when it founds the economies (src/sim/systems/economy.ts). */
interface EconomySetup {
  engine: EconomyEngine;
  table: CalibrationTable;
}

export const EDGE_RIVER = 1,
  EDGE_STRAIT = 2,
  EDGE_COAST = 4,
  EDGE_SEA = 8;

interface Province {
  id: number;
  name: string;
  locs: number[];
  capital: number;
  area: number;
  region: string;
}
interface Area {
  id: number;
  name: string;
  provinces: number[];
  region: string;
}

export class World {
  W: number;
  H: number;
  L: number;
  S: number;
  N: number;
  lon0: number;
  lon1: number;
  latN: number;
  latS: number;
  x: Float32Array;
  y: Float32Array;
  lat: Float32Array;
  lon: Float32Array;
  area: Float32Array;
  elev: Float32Array;
  rough: Float32Array;
  terrain: Uint8Array;
  resource: Uint8Array;
  coastal: Uint8Array;
  pass: Uint8Array;
  temp: Float32Array;
  arid: Float32Array;
  forest: Float32Array;
  /** land productivity A of each place: potential calories per hectare and year (NaN: no data) */
  landYield: Float32Array;
  /** T_E, the land of England in the harvest equation (src/sim/systems/harvest.ts) */
  landEngland: number;
  /** s and c of cultivated land (src/sim/systems/cultivation.ts) */
  landLimit: number;
  arablePerHead: number;
  /** yield curve of each place, best soil first: the steps of place i are landSteps[landStepStart[i] … landStepStart[i + 1]),
   *  step k covers the land between the shares landEdges[k − 1] and landEdges[k], cut off at landFertile[i] */
  landEdges: Float64Array;
  landFertile: Float64Array;
  landStepStart: Int32Array;
  landSteps: Float32Array;
  /** 1 for the places inside the outline of England (land.json) */
  england: Uint8Array;
  /** the engine of the economies and what the cities' economies are calibrated from: the table, the year its
   *  starting position stands for, the scale the model computes at (1:100), the daily clock and the rules of the
   *  firms and households, and what the food a basket needs costs per day at the prices of the start (£, economy
   *  feature 15). Which places have an economy is part of the state of a world (`CityEconomies.places`): they are the
   *  cities of its start year */
  economyEngine: EconomyEngine;
  cityEconomies: {
    year: number;
    scale: number;
    clock: EconomyClock;
    rules: EconomyRules;
    foodNeed: number;
    table: CalibrationTable;
  };
  names: string[];
  namesDe: string[];
  altNames: (string | null)[];
  townSize: Uint8Array;
  adjStart: Int32Array;
  adj: Int32Array;
  adjKm: Float32Array;
  adjFlag: Uint8Array;
  provOf: Int32Array;
  provinces: Province[];
  areas: Area[];
  regions: string[];
  regionOf: Uint8Array; // per province
  rivers: GeoJson['rivers'];
  kmPerPx: Float32Array; // per location

  /** the chronicle of rulers of the start year of the world this build plays (src/sim/content/chronicle.ts), null
   *  without one: then no realm has a holder. Set by the loader (tools/sim/load.ts) */
  chronicle: Chronicle | null = null;
  /** how the persons of the chronicle die (src/sim/systems/rulers.ts): 'chronicle' on the days of the sources (the
   *  game), 'drawn' on days of their own from the life table and the rate of murder of rulers, the chronicle being
   *  only the plan (a free world to measure how far a world goes from history: tools/sim/drift_check.ts) */
  rulerDeaths: 'chronicle' | 'drawn' = 'chronicle';
  /** the chronicle of borders of the start year (src/sim/content/borders.ts), null without one: then the borders stay
   *  as the setup has them. Set by the loader (tools/sim/load.ts) */
  borders: Borders | null = null;
  /** the building ground of the towns of the start year (src/sim/content/ground.ts), null without one: then the land
   *  register lays its parcels without regard to the ground */
  ground: Ground | null = null;
  /** the dry ground round the towns of the start year (public/data/dry_<year>.json: no water, no rock, farther out
   *  than the building ground and nothing said of steps and buildings), null without one: then the land register
   *  lays its hamlets by the building ground, as far as that reaches */
  dry: Ground | null = null;
  /** the rivers round the towns of the start year (public/data/rivers_<year>.json: a river's water, not a lake's or
   *  the sea's), null without one: then the towns have no bridges */
  riverGround: Ground | null = null;
  /** the ground round the towns of the start year that the fields can lie on (public/data/tilth_<year>.json,
   *  src/sim/content/tilth.ts), null without one: then the land register lays the fields round the hamlets without
   *  regard to the ground */
  tilth: Tilth | null = null;
  /** the ways between the places of the map in the start year (public/data/roads_<year>.json, the latest year at or
   *  before it; src/sim/roads.ts), null without any: then goods go over land on the straight line between places.
   *  Set by the loader (tools/sim/load.ts) */
  ways: WayNet | null = null;
  /** the farming year of every land place (FARM_YEAR, src/sim/people/farm_year.ts: by its region and its climate,
   *  public/data/place_climate.json), null without the climate: then every place follows the north's. Set by the
   *  loader (tools/sim/load.ts) */
  farmYear: Uint8Array | null = null;
  constructor(geo: GeoJson, wj: WorldJson, land: LandJson, cultivation: CultivationJson, economy: EconomySetup) {
    this.W = geo.W;
    this.H = geo.H;
    this.L = geo.L;
    this.S = geo.S;
    this.N = geo.L + geo.S;
    this.lon0 = geo.lon0;
    this.lon1 = geo.lon1;
    this.latN = geo.latN;
    this.latS = geo.latS;
    const N = this.N,
      L = this.L;
    this.x = Float32Array.from(geo.loc.x);
    this.y = Float32Array.from(geo.loc.y);
    this.lat = Float32Array.from(geo.loc.lat);
    this.lon = Float32Array.from(geo.loc.lon);
    this.area = Float32Array.from(geo.loc.area);
    this.elev = Float32Array.from(geo.loc.elev);
    this.rough = Float32Array.from(geo.loc.rough);
    this.terrain = new Uint8Array(L);
    this.resource = new Uint8Array(L);
    this.coastal = new Uint8Array(L);
    this.pass = new Uint8Array(L);
    this.temp = Float32Array.from(wj.temp.slice(0, L));
    this.arid = Float32Array.from(wj.arid.slice(0, L));
    this.forest = Float32Array.from(wj.forest);
    for (let i = 0; i < L; i++) {
      this.terrain[i] = TERRAIN_INDEX.get(wj.terrain[i]) ?? 0;
      this.resource[i] = RESOURCE_INDEX[wj.resource[i]] ?? 0;
      this.coastal[i] = wj.coastal[i] ? 1 : 0;
    }
    for (const [l] of geo.passes) this.pass[l - 1] = 1;
    const soil = soilOf(land, L);
    this.landYield = soil.yield;
    this.landEngland = cultivation.englandLand;
    this.landLimit = cultivation.landLimit;
    this.arablePerHead = cultivation.arablePerHead;
    this.landEdges = soil.edges;
    this.landFertile = soil.fertile;
    this.landStepStart = soil.stepStart;
    this.landSteps = soil.steps;
    this.england = soil.england;
    this.economyEngine = economy.engine;
    const t = economy.table,
      { clock, rules } = economyRulesOf(t);
    participation.men = t.inputs.participation.value.men;
    participation.women = t.inputs.participation.value.women;
    this.cityEconomies = { year: t.year, scale: t.scale.value, clock, rules, foodNeed: foodNeedCost(t), table: t };
    this.names = new Array(N);
    for (let i = 0; i < N; i++) this.names[i] = (i < L ? wj.name[i] : geo.loc.name[i]) || `#${i}`;
    this.names = refineNames(this.names, this.lon, this.lat, L); // unnamed districts get names from their neighbours
    this.namesDe = this.names.map((n) => deName(n));
    this.altNames = geo.loc.alt.slice(0, L);
    this.townSize = Uint8Array.from(geo.loc.size.slice(0, L).map((v) => v || 0));
    this.kmPerPx = new Float32Array(N);
    const kmpp0 = ((this.lon1 - this.lon0) / this.W) * 111.32;
    for (let i = 0; i < N; i++) this.kmPerPx[i] = kmpp0 * Math.cos((this.lat[i] * Math.PI) / 180);
    const ways = adjacencyOf(geo, this.x, this.y, this.kmPerPx);
    this.adjStart = ways.start;
    this.adj = ways.next;
    this.adjKm = ways.km;
    this.adjFlag = ways.flag;
    const parts = provincesOf(geo, L);
    this.provOf = parts.provOf;
    this.provinces = parts.provinces;
    this.areas = parts.areas;
    this.regions = parts.regions;
    this.regionOf = parts.regionOf;
    this.rivers = geo.rivers;
  }
  isSea(i: number) {
    return i >= this.L;
  }
  neighbours(i: number): Int32Array {
    return this.adj.subarray(this.adjStart[i], this.adjStart[i + 1]);
  }
  distKm(a: number, b: number): number {
    const dx = this.x[a] - this.x[b],
      dy = this.y[a] - this.y[b];
    return Math.sqrt(dx * dx + dy * dy) * (this.kmPerPx[a] + this.kmPerPx[b]) * 0.5;
  }
  pxToLonLat(px: number, py: number): [number, number] {
    const lon = this.lon0 + (px / this.W) * (this.lon1 - this.lon0);
    const ymax = Math.asinh(Math.tan((this.latN * Math.PI) / 180)),
      ymin = Math.asinh(Math.tan((this.latS * Math.PI) / 180));
    const Y = ymax - (py / this.H) * (ymax - ymin);
    return [lon, (Math.atan(Math.sinh(Y)) * 180) / Math.PI];
  }
}

/** the index of each terrain in TERRAINS (a name it does not know counts as the first) */
const TERRAIN_INDEX = new Map<string, number>(TERRAINS.map((name, i) => [name, i]));

/** The land of the places (land.json): their yield and the steps of their yield curves, and which lie in England. */
function soilOf(land: LandJson, L: number) {
  if (land.yield.length !== L) throw new Error(`land.json has ${land.yield.length} places, the map has ${L}`);
  const yields = Float32Array.from(land.yield, (v) => v ?? NaN);
  const c = land.curve;
  if (c.fertile.length !== L)
    throw new Error(`land.json has a yield curve for ${c.fertile.length} places, the map has ${L}`);
  const stepStart = new Int32Array(L + 1);
  for (let i = 0; i < L; i++) {
    let n = 0; // one step for every edge that starts below the fertile share
    while (n < c.edges.length && (n === 0 ? 0 : c.edges[n - 1]) < c.fertile[i]) n++;
    stepStart[i + 1] = stepStart[i] + n;
  }
  if (stepStart[L] !== c.steps.length)
    throw new Error(`land.json has ${c.steps.length} steps of the yield curve, the places need ${stepStart[L]}`);
  const england = new Uint8Array(L);
  for (const i of land.england.places) england[i] = 1;
  return {
    yield: yields,
    edges: Float64Array.from(c.edges),
    fertile: Float64Array.from(c.fertile),
    stepStart,
    steps: Float32Array.from(c.steps),
    england,
  };
}

/** The daily clock and the rules of the firms and households of the cities' economies, as the calibration table `t`
 *  has them; throws where the table asks for one the engine does not know. */
function economyRulesOf(t: CalibrationTable): Pick<World['cityEconomies'], 'clock' | 'rules'> {
  const clock = { plan: t.clock.plan_days.value, window: t.clock.days_per_year.value },
    wage = t.cities.wage.value,
    prices = t.cities.prices.value;
  if (!(Number.isInteger(clock.plan) && clock.plan >= 1 && Number.isInteger(clock.window) && clock.window > 1))
    throw new Error(`the economy of ${t.case} has a year of ${clock.window} days and a plan every ${clock.plan} days`);
  if (wage !== 'prices' && wage !== 'money')
    throw new Error(`the economy of ${t.case} pays wages in the way "${wage}", the engine knows 'prices' and 'money'`);
  if (prices !== 'costs' && prices !== 'demand')
    throw new Error(
      `the economy of ${t.case} sets prices in the way "${prices}", the engine knows 'costs' and 'demand'`,
    );
  const crown = t.cities.crown.value;
  if (crown !== 'series' && crown !== 'revenue')
    throw new Error(`the crown of ${t.case} buys in the way "${crown}", the engine knows 'series' and 'revenue'`);
  const owner = t.cities.owner.value;
  if (owner !== 'paper' && owner !== 'household')
    throw new Error(
      `the owners of ${t.case} hold their firms in the way "${owner}", the engine knows 'paper' and 'household'`,
    );
  const spent = t.cities.savings_spent_per_year.value;
  if (!(spent >= 0 && spent <= clock.window))
    throw new Error(`the households of ${t.case} spend ${spent} of their savings above the target in a year`);
  return { clock, rules: { wage, prices, savings: spent / clock.window, crown, owner } };
}

/** The ways between the places as compressed rows (CSR): the neighbours of place i are next[start[i] … start[i + 1]),
 *  sorted, with the km to each and how they are joined (EDGE_*). */
function adjacencyOf(geo: GeoJson, x: Float32Array, y: Float32Array, kmPerPx: Float32Array) {
  const N = geo.L + geo.S;
  const lists: [number, number][][] = Array.from({ length: N }, () => []);
  for (const [a1, b1, kind, , rf] of geo.edges) {
    const a = a1 - 1,
      b = b1 - 1;
    let f = 0;
    if (kind === 0 && rf > 0.3) f |= EDGE_RIVER;
    if (kind === 1) f |= EDGE_COAST;
    if (kind === 2) f |= EDGE_SEA;
    lists[a].push([b, f]);
    lists[b].push([a, f]);
  }
  for (const [a1, b1] of geo.straits) {
    lists[a1 - 1].push([b1 - 1, EDGE_STRAIT]);
    lists[b1 - 1].push([a1 - 1, EDGE_STRAIT]);
  }
  const start = new Int32Array(N + 1);
  let tot = 0;
  for (let i = 0; i < N; i++) {
    lists[i].sort((p, q) => p[0] - q[0]);
    start[i] = tot;
    tot += lists[i].length;
  }
  start[N] = tot;
  const next = new Int32Array(tot),
    km = new Float32Array(tot),
    flag = new Uint8Array(tot);
  let k = 0;
  for (let i = 0; i < N; i++)
    for (const [j, f] of lists[i]) {
      next[k] = j;
      flag[k] = f;
      const dx = x[i] - x[j],
        dy = y[i] - y[j];
      km[k] = Math.sqrt(dx * dx + dy * dy) * (kmPerPx[i] + kmPerPx[j]) * 0.5;
      k++;
    }
  return { start, next, km, flag };
}

/** The provinces, areas and regions of the map, and the province of each of the L land places (-1: none). */
function provincesOf(geo: GeoJson, L: number) {
  const provOf = new Int32Array(L).fill(-1);
  const provinces: Province[] = geo.provinces.map((p, i) => ({
    id: i,
    name: p.name,
    locs: p.locs.map((v) => v - 1),
    capital: p.capital - 1,
    area: p.area,
    region: p.region,
  }));
  for (const p of provinces) for (const l of p.locs) provOf[l] = p.id;
  const areas: Area[] = geo.areas.map((a, i) => ({ id: i, name: a.name, provinces: a.provinces, region: a.region }));
  const regions = [...new Set(provinces.map((p) => p.region))].sort();
  const regionOf = new Uint8Array(provinces.length);
  for (const p of provinces) regionOf[p.id] = regions.indexOf(p.region);
  return { provOf, provinces, areas, regions, regionOf };
}
