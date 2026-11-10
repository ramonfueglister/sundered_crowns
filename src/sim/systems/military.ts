// Armies and fleets: recruitment, movement on the location graph (A*), supply & attrition, zone of control,
// battles in phases over several days, sieges with random events, occupation, naval blockades, transport.
import type { GameState, Army, Battle, Siege, Nation, Regiment, I18n, BattleSideRep } from '../types';
import type { World } from '../world';
import { EDGE_RIVER, EDGE_STRAIT } from '../world';
import { type Ctx, type System, clamp, chronicle, notice, newId, addExpense, enemiesOf, atWar, hasTreaty, allies, bump } from '../ctx';
import { UNITS, U, TERRAIN_DEF, TERRAINS, B, BI, C, CL, GI } from '../defs';
import { rand, chance, hash01 } from '../rng';
import { dayToDate } from '../calendar';
import { lawEffect, ageOf, characterDies, councilBonus } from './politics';
import { commanderSkill, commanderMorale, battleLessons, appointBest } from './commanders';
import { personName } from '../content/names';
import { genCoa } from '../content/heraldry';
import { GROUP_OF } from '../content/peoples';
import { integrationYield } from './economy';
import { MinHeap } from '../setup';
import { warScoreEvent, ownedLocs } from './war';
import { forgetTrade } from './trade';

export const UPKEEP_SCALE = 1500, COST_SCALE = 900;
export const BASE_SPEED_KM = 20; // medieval army ~15–25 km/day

export function armyMen(a: Army): number { let m = 0; for (const r of a.regs) m += r.men; return m; }
export function isFleet(a: Army) { return a.fleet; }
export function armyStrength(s: GameState, a: Army): number {
  const n = s.nations[a.owner];
  let v = 0;
  for (const r of a.regs) { const u = UNITS[r.type]; v += r.men * (u.shock + u.fire + u.def) / 3 * (u.kind === 'ship' ? 100 : 1); }
  return v * (0.5 + a.morale * 0.5) * techMult(n, s);
}
/** Discipline: warfare knowledge, discipline effects and the marshal (systems/politics.ts councilBonus). */
export function techMult(n: Nation | undefined, s?: GameState) { return n ? 1 + (n.tech[2] - 1) * 0.06 + lawEffect(n, 'discipline') + (s ? councilBonus(s, n, 'marshal') : 0) : 1; }

/** Units available to a nation now (era, culture, government). */
export function availableUnits(s: GameState, n: Nation, naval: boolean): number[] {
  const out: number[] = [];
  const cult = s.loc ? '' : '';
  void cult;
  for (let i = 0; i < U; i++) {
    const u = UNITS[i];
    if ((u.kind === 'ship') !== naval) continue;
    if (u.era > n.era || n.era > u.until) continue;
    if (u.govs && !u.govs.includes(n.gov)) continue;
    if (u.cultures) { const cn = cultureId(n.culture); if (!u.cultures.includes(cn)) continue; }
    out.push(i);
  }
  return out;
}
import { ALL_CULTURES, FAITHS, FAITH_INDEX } from '../content/peoples';
function cultureId(i: number) { return ALL_CULTURES[i] || 'unknown'; }

export function unitCost(s: GameState, n: Nation, unit: number, men: number) {
  const u = UNITS[unit];
  const k = u.kind === 'ship' ? men * SHIP_SCALE : men / 1000;
  return u.cost * k * COST_SCALE * 0.1 * s.priceLevel * (1 + n.inflation);
}

/** Default bilingual name of a realm's army or fleet ("Portuguese host" / "Portugiesisches Heer"). */
export function armyName(n: Nation, fleet: boolean): I18n {
  const en = `${n.adj.en} ${fleet ? 'fleet' : 'host'}`;
  const adj = (n.adj.de || '').trim(), noun = fleet ? 'Flotte' : 'Heer';
  let de: string;
  if (/sch$/.test(adj)) de = `${adj.charAt(0).toUpperCase()}${adj.slice(1)}${fleet ? 'e' : 'es'} ${noun}`; // portugiesisch → Portugiesisches Heer
  else if (/er$/.test(adj) && adj !== n.short.de) de = `${adj} ${noun}`;                                    // Nürnberger Heer
  else de = `${noun} von ${n.short.de || adj}`;                                                              // Heer von Lisboa
  return { en, de };
}
/** Army names are bilingual; saves from before kept a plain (English) string. */
export function armyNameText(a: Army, lang: 'en' | 'de' = 'en'): string { return typeof a.name === 'string' ? a.name : a.name[lang] ?? a.name.en; }

export function newArmy(s: GameState, owner: number, loc: number, regs: Regiment[], fleet = false, name?: I18n | string): Army {
  const n = s.nations[owner];
  const a: Army = {
    id: newId(s), owner, loc, name: name ?? armyName(n, fleet), regs, morale: 1, general: 0, path: [], progress: 0,
    fleet, carrying: [], embarkedOn: 0, siege: -1, battle: 0, supplyDeficit: 0, retreating: false, lastMoveDay: s.day,
  };
  setFullStrength(a);
  s.armies.push(a);
  return a;
}

// ---------------- pathfinding ----------------
/** Realms that own at least one fleet can ferry armies across sea zones (refreshed daily). */
export const FLEET_OWNERS = new Set<number>();
export function refreshFleetOwners(s: GameState) { FLEET_OWNERS.clear(); for (const a of s.armies) if (a.fleet && a.regs.length) FLEET_OWNERS.add(a.owner); }
export function canEnter(s: GameState, w: World, a: Army, to: number): boolean {
  if (a.fleet) return to >= w.L || (w.coastal[to] === 1 && s.loc.owner[to] >= 0 && friendlyPort(s, a.owner, to));
  if (to >= w.L) return FLEET_OWNERS.has(a.owner) && !a.rebels && !a.hostile; // ferried by the realm's ships
  if (w.terrain[to] === TERRAINS.indexOf('wasteland')) return false;
  const o = s.loc.owner[to];
  if (o < 0 || o === a.owner) return true;
  if (a.rebels || a.hostile) return true;
  if (atWar(s, a.owner, o)) return true;
  if (s.nations[o].overlord === a.owner || s.nations[a.owner].overlord === o) return true;
  if (hasTreaty(s, a.owner, o, 'access') || hasTreaty(s, a.owner, o, 'alliance')) return true;
  return false;
}
function friendlyPort(s: GameState, n: number, l: number) { const o = s.loc.owner[l]; return o === n || hasTreaty(s, n, o, 'alliance') || hasTreaty(s, n, o, 'access') || s.nations[o]?.overlord === n || atWar(s, n, o); }

export function moveSpeed(s: GameState, w: World, a: Army, to: number, day = s.day): number {
  if (a.fleet) {
    let sp = 90;
    for (const r of a.regs) sp = Math.min(sp, 90 * UNITS[r.type].speed);
    return sp;
  }
  if (to >= w.L) return 55; // ferried armies: slow, but no terrain
  let sp = BASE_SPEED_KM;
  let slow = 1; for (const r of a.regs) slow = Math.min(slow, UNITS[r.type].speed);
  sp *= slow;
  const t = TERRAIN_DEF[TERRAINS[w.terrain[to]]];
  sp *= w.pass[to] ? Math.max(0.75, t.move) : t.move;
  const road = s.loc.buildings[to * B + BI.road];
  sp *= 1 + road * 0.15;
  // winter: snow slows armies in the north and east
  sp *= 1 - 0.45 * s.loc.snow[to];
  const n = s.nations[a.owner];
  if (n) sp *= 1 + lawEffect(n, 'speed') + (s.chars[a.general]?.traits.includes('energetic') ? 0.1 : 0);
  return Math.max(3, sp);
}

/** A* over the location graph; cost = travel days. Returns path excluding the start. */
let PG: Float64Array | null = null, PP: Int32Array | null = null, PS: Int32Array | null = null, PSV = 0;
let PSP: Float64Array | null = null, PSS: Int32Array | null = null; // speed into each node, worked out once per search
let PHEAP: MinHeap | null = null; // created on first use (setup.ts imports the systems)
// per-search answers of canEnter by realm (stamped, so nothing is cleared between searches)
let OK_ST = new Int32Array(0), OK_V = new Uint8Array(0), OKV = 0;
export function findPath(s: GameState, w: World, a: Army, from: number, to: number, maxNodes = 20000): number[] | null {
  if (from === to) return [];
  const N = w.N;
  if (!PG || PG.length !== N) { PG = new Float64Array(N); PP = new Int32Array(N); PS = new Int32Array(N); PSP = new Float64Array(N); PSS = new Int32Array(N); }
  const g = PG, prev = PP!, st = PS!, spV = PSP!, spS = PSS!; const sv = ++PSV;
  const goalX = w.x[to], goalY = w.y[to];
  const heap = (PHEAP ??= new MinHeap()); heap.clear();
  st[from] = sv; g[from] = 0; prev[from] = -1; heap.push(0, from);
  const kmpx = w.kmPerPx[to];
  const maxSpeed = a.fleet ? 110 : BASE_SPEED_KM * 1.6;
  let visited = 0;
  // per-call caches: which realms' land this army may enter, and its speed factors
  if (OK_ST.length < s.nations.length) { OK_ST = new Int32Array(s.nations.length + 64); OK_V = new Uint8Array(s.nations.length + 64); }
  const okSt = OK_ST, okV = OK_V, okv = ++OKV;
  const waste = TERRAINS.indexOf('wasteland');
  const enter = (v: number): boolean => {
    if (a.fleet || v >= w.L) return canEnter(s, w, a, v);
    if (w.terrain[v] === waste) return false;
    const o = s.loc.owner[v];
    if (o < 0 || o === a.owner) return true;
    if (o >= okSt.length) return canEnter(s, w, a, v);
    if (okSt[o] !== okv) { okSt[o] = okv; okV[o] = canEnter(s, w, a, v) ? 1 : 0; }
    return okV[o] === 1;
  };
  let speedOf: (v: number) => number;
  if (a.fleet) { const sp = moveSpeed(s, w, a, to); speedOf = () => sp; }
  else {
    let slow = 1; for (const r of a.regs) slow = Math.min(slow, UNITS[r.type].speed);
    const n = s.nations[a.owner];
    const k = BASE_SPEED_KM * slow * (n ? 1 + lawEffect(n, 'speed') + (s.chars[a.general]?.traits.includes('energetic') ? 0.1 : 0) : 1);
    const tm = TERRAINS.map((x) => TERRAIN_DEF[x].move);
    const bld = s.loc.buildings, snow = s.loc.snow, terr = w.terrain, pass = w.pass, L = w.L;
    speedOf = (v: number) => {
      if (v >= L) return 55;
      const m = tm[terr[v]];
      const sp = k * (pass[v] ? Math.max(0.75, m) : m) * (1 + bld[v * B + BI.road] * 0.15) * (1 - 0.45 * snow[v]);
      return sp > 3 ? sp : 3;
    };
  }
  const adjS = w.adjStart, adj = w.adj, adjKm = w.adjKm, adjF = w.adjFlag, X = w.x, Y = w.y, L = w.L;
  let found = false;
  while (heap.size) {
    const u = heap.popVal();
    if (u === to) { found = true; break; }
    if (++visited > maxNodes) return null;
    const gu = g[u];
    for (let e = adjS[u]; e < adjS[u + 1]; e++) {
      const v = adj[e];
      if (!enter(v)) continue;
      const f = adjF[e];
      if (!a.fleet && (f & EDGE_STRAIT) && straitBlocked(s, w, a.owner, u, v)) continue;
      let sp: number; if (spS[v] === sv) sp = spV[v]; else { sp = speedOf(v); spV[v] = sp; spS[v] = sv; }
      let cost = adjKm[e] / sp;
      if (!a.fleet && (f & EDGE_RIVER)) cost += 0.5;
      if (!a.fleet && v >= L && u < L) cost += 4; // embarking takes days
      const ng = gu + cost;
      if (st[v] !== sv || ng < g[v]) {
        st[v] = sv; g[v] = ng; prev[v] = u;
        const dx = X[v] - goalX, dy = Y[v] - goalY;
        heap.push(ng + Math.sqrt(dx * dx + dy * dy) * kmpx / maxSpeed, v);
      }
    }
  }
  if (!found && st[to] !== sv) return null;
  const path: number[] = [];
  let c = to, guard = 0;
  while (c !== from && guard++ < 100000) { path.push(c); c = prev[c]; if (c < 0) return null; }
  return path.reverse();
}

function straitBlocked(s: GameState, w: World, nation: number, a: number, b: number): boolean {
  // enemy fleet in an adjacent sea zone blocks the crossing
  const en = enemiesOf(s, nation);
  if (!en.size) return false;
  for (const f of s.armies) {
    if (!f.fleet || !en.has(f.owner)) continue;
    if (f.loc >= w.L && (w.distKm(f.loc, a) < 120 || w.distKm(f.loc, b) < 120)) return true;
  }
  return false;
}

export function travelDays(s: GameState, w: World, a: Army, path: number[]): number {
  let d = 0, cur = a.loc;
  for (const p of path) { d += w.distKm(cur, p) / moveSpeed(s, w, a, p); cur = p; }
  return d - a.progress / Math.max(1, moveSpeed(s, w, a, path[0] ?? a.loc));
}

// ---------------- zone of control ----------------
export function computeFortZones(s: GameState, w: World) {
  const z = s.loc.fortZone; z.fill(-1);
  for (let i = 0; i < w.L; i++) {
    const f = s.loc.buildings[i * B + BI.fort];
    if (!f || s.loc.ctrl[i] < 0) continue;
    const c = s.loc.ctrl[i];
    z[i] = c;
    for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) { const v = w.adj[e]; if (v < w.L && z[v] < 0) z[v] = c; }
  }
}

// ---------------- daily army update ----------------
function armyDay(s: GameState, w: World, a: Army) {
  if (a.battle) return;
  if (a.retreating && !a.path.length) a.retreating = false; // a retreat ends when the road ends, however it ended
  if (a.embarkedOn) { const f = s.armies.find((x) => x.id === a.embarkedOn); if (f) a.loc = f.loc; else a.embarkedOn = 0; return; }
  if (!a.fleet && a.loc >= w.L) {
    // ferried army caught at sea by an enemy fleet: heavy losses, forced back toward land
    for (const f of s.armies) if (f.fleet && f.loc === a.loc && !f.battle && atWar(s, f.owner, a.owner)) {
      for (const r of a.regs) r.men *= 0.75;
      a.morale *= 0.5;
      if (a.path.length && a.path[a.path.length - 1] >= w.L) a.path = [];
      if (!a.path.length) { const back = retreatTarget(s, w, a); if (back >= 0 && back !== a.loc) { const p = findPath(s, w, a, a.loc, back); if (p) a.path = p; } }
      break;
    }
  }
  if (a.path.length) {
    const next = a.path[0];
    if (!canEnter(s, w, a, next)) { a.path = []; a.progress = 0; return; }
    a.siege = -1;
    a.progress += moveSpeed(s, w, a, next);
    const dist = w.distKm(a.loc, next);
    if (a.progress >= dist) {
      const from = a.loc;
      a.prevLoc = from; a.loc = next; a.path.shift(); a.progress = 0; a.lastMoveDay = s.day;
      if (a.fleet) for (const cid of a.carrying) { const c = s.armies.find((x) => x.id === cid); if (c) c.loc = a.loc; }
      // zone of control: entering hostile fort zone stops the march unless heading to the fort itself
      if (!a.fleet && a.path.length) {
        const zc = s.loc.fortZone[next];
        if (zc >= 0 && zc !== a.owner && atWar(s, a.owner, zc) && s.loc.buildings[next * B + BI.fort] === 0) {
          const nn = a.path[0];
          if (s.loc.fortZone[nn] === zc && s.loc.buildings[nn * B + BI.fort] === 0 && s.loc.fortZone[from] === zc) { a.path = []; }
        }
      }
      // disembark when a carried army's target is land
      if (a.fleet && a.path.length === 0) {
        for (const cid of a.carrying.slice()) {
          const c = s.armies.find((x) => x.id === cid);
          if (c && c.path.length && c.path[0] < w.L) { c.embarkedOn = 0; a.carrying.splice(a.carrying.indexOf(cid), 1); }
        }
      }
      a.retreating = a.path.length > 0 && a.retreating;
    }
  }
}

// ---------------- supply & attrition (monthly) ----------------
/**
 * How many men a place feeds for a realm's armies, as factors: the people (one soldier per six), the land, devastation,
 * snow, the harvest, fields and roads, our own land, scorched earth. The product (at least 800) is the supply limit.
 */
export function supplyParts(s: GameState, w: World, l: number, owner: number): { rows: [string, number][]; total: number } {
  if (l >= w.L) return { rows: [], total: 1e9 };
  const t = TERRAIN_DEF[TERRAINS[w.terrain[l]]];
  let pop = 0; for (let c = 0; c < C; c++) pop += s.loc.pop[l * C + c];
  const rows: [string, number][] = [
    ['x_sp_people', pop / 6], ['x_sp_terrain', t.supply], ['x_sp_devastation', 1 - s.loc.devast[l]], ['x_sp_snow', 1 - 0.5 * s.loc.snow[l]],
    ['x_sp_harvest', 0.6 + 0.4 * s.loc.harvest[l]], ['x_sp_farms', 1 + 0.1 * s.loc.buildings[l * B + BI.farm]], ['x_sp_roads', 1 + 0.05 * s.loc.buildings[l * B + BI.road]],
  ];
  if (s.loc.owner[l] === owner) rows.push(['x_sp_own', 1.25]);
  if (scorched(s, l)) rows.push(['x_sp_scorched', SCORCH_SUPPLY]);
  let lim = 1; for (const [, v] of rows) lim *= v;
  return { rows, total: Math.max(800, lim) };
}
export function supplyLimit(s: GameState, w: World, l: number, owner: number): number { return supplyParts(s, w, l, owner).total; }
/** Scorched earth: the supply of a place is cut to a fifth until the day stored in the flag. */
export const SCORCH_SUPPLY = 0.2;
export function scorched(s: GameState, l: number): boolean { return (s.flags[`scorched_${l}`] ?? 0) > s.day; }

/** A fleet lying idle in a sea zone next to one of its realm's ports is in harbour: no storms, no wear. */
function dockedAtHome(s: GameState, w: World, a: Army): boolean {
  for (let e = w.adjStart[a.loc]; e < w.adjStart[a.loc + 1]; e++) { const v = w.adj[e]; if (v < w.L && s.loc.owner[v] === a.owner && s.loc.buildings[v * B + BI.port] > 0) return true; }
  return false;
}
/** Men of a realm standing at each place (they share its supply). */
function menByPlace(s: GameState): Map<number, number> {
  const perLoc = new Map<number, number>();
  for (const a of s.armies) if (!a.fleet && !a.embarkedOn) perLoc.set(a.loc * 1000 + a.owner, (perLoc.get(a.loc * 1000 + a.owner) || 0) + armyMen(a));
  return perLoc;
}
/**
 * The share of an army lost to attrition this month, by cause (each row already multiplied by the laws and the
 * home-ground factor, so the rows add up to the total), plus the supply limit and the men sharing it. The monthly
 * attrition (attritionMonth) applies exactly this.
 */
export function attritionParts(s: GameState, w: World, a: Army, menHere?: number) {
  const rows: [string, number][] = [], mult: [string, number][] = [];
  if (a.loc >= w.L) return { rows: [['x_at_at_sea', 0.01]] as [string, number][], mult, total: 0.01, men: armyMen(a), limit: 1e9, quartered: false };
  const men = menHere ?? (menByPlace(s).get(a.loc * 1000 + a.owner) || armyMen(a));
  const lim = supplyLimit(s, w, a.loc, a.owner);
  const t = TERRAIN_DEF[TERRAINS[w.terrain[a.loc]]];
  // in peace at home the regiments lie in winter quarters spread over the country: little is lost
  const quartered = s.loc.owner[a.loc] === a.owner && !a.rebels && !s.wars.some((x) => x.att.includes(a.owner) || x.def.includes(a.owner));
  const pre: [string, number][] = [['x_at_base', quartered ? 0.001 : 0.002], ['x_at_terrain', quartered ? t.attrition * 0.002 : t.attrition * 0.01]];
  if (men > lim) pre.push(['x_at_oversupply', quartered ? Math.min(0.01, (men / lim - 1) * 0.005) : Math.min(0.12, (men / lim - 1) * 0.05)]);
  if (s.loc.snow[a.loc] > 0) pre.push(['x_at_winter', s.loc.snow[a.loc] * 0.02]);
  const n = s.nations[a.owner];
  let M = 1;
  if (n) { const k = Math.max(0, 1 + lawEffect(n, 'attrition')); M *= k; if (k !== 1) mult.push(['x_at_laws', k]); }
  // faiths of the forest and the tundra know their own land (finnic_old, sami_old)
  if (n && s.loc.owner[a.loc] === a.owner) { const k = clamp(1 + lawEffect(n, 'home_attrition'), 0.2, 2); M *= k; if (k !== 1) mult.push(['x_at_home', k]); }
  for (const [k, v] of pre) rows.push([k, v * M]);
  if (s.loc.owner[a.loc] !== a.owner && atWar(s, a.owner, s.loc.owner[a.loc])) rows.push(['x_at_enemy_land', 0.005]);
  const total = rows.reduce((p, x) => p + x[1], 0);
  return { rows, mult, total, men, limit: lim, quartered };
}
export function attritionMonth(s: GameState, w: World) {
  // stack men per location
  const perLoc = menByPlace(s);
  for (const a of s.armies) {
    if (a.fleet) {
      // storms and scurvy at sea; ships wear out
      if (a.loc >= w.L && !(a.path.length === 0 && dockedAtHome(s, w, a))) {
        const storm = stormRisk(s, w, a.loc);
        for (const r of a.regs) r.men = Math.max(0, r.men * (1 - 0.01 - storm * 0.05));
      }
      continue;
    }
    if (a.embarkedOn) continue;
    if (a.loc >= w.L) { for (const r of a.regs) r.men *= 0.99; continue; } // ferried: seasickness, little else
    const at = attritionParts(s, w, a, perLoc.get(a.loc * 1000 + a.owner) || armyMen(a));
    const men = at.men, lim = at.limit;
    a.supplyDeficit = men > lim ? men / lim - 1 : 0;
    for (const r of a.regs) r.men = Math.max(0, r.men * (1 - at.total));
    // foraging devastates the land
    if (!at.quartered && men > lim * 0.5) s.loc.devast[a.loc] = clamp(s.loc.devast[a.loc] + Math.min(0.15, men / lim * 0.03), 0, 1);
    // morale recovers in supply
    a.morale = clamp(a.morale + (a.supplyDeficit > 0 ? 0.03 : 0.12) * maintMorale(s, a), 0, maxMorale(s, a));
  }
}

// ---------------- scorched earth ----------------
/** Days scorched land feeds no army. */
export const SCORCH_DAYS = 180;
/** Enemy armies (of a war, not rebels) in or next to a place or about to march into it. */
function invadersNear(s: GameState, w: World, n: number, l: number): Army[] {
  const en = enemiesOf(s, n); if (!en.size) return [];
  const out: Army[] = [];
  for (const a of s.armies) {
    if (a.fleet || a.rebels || !en.has(a.owner) || a.embarkedOn) continue;
    if (a.loc === l || a.path.slice(0, 3).includes(l) || (a.loc < w.L && isNeighbour(w, a.loc, l))) out.push(a);
  }
  return out;
}
function isNeighbour(w: World, a: number, b: number): boolean { for (let e = w.adjStart[a]; e < w.adjStart[a + 1]; e++) if (w.adj[e] === b) return true; return false; }
/** Why a realm cannot scorch this place now (null = it can): its own held land, at war, with an invader in or next to
 *  it or marching into it, and not already burnt. */
export function scorchRefusal(s: GameState, w: World, n: number, l: number): string | null {
  if (l < 0 || l >= w.L || s.loc.owner[l] !== n || s.loc.ctrl[l] !== n) return 'not your location';
  if (scorched(s, l)) return 'already scorched';
  if (!invadersNear(s, w, n, l).length) return 'no enemy army near';
  return null;
}
/** Scorched earth: burn the fields and stores before the invader. The place is devastated (its yields fall), its people
 *  are restless, and for half a year it feeds a fifth of the men it would (supplyParts) - the enemy's as well as ours. */
export function scorchEarth(s: GameState, w: World, n: Nation, l: number): string | null {
  const why = scorchRefusal(s, w, n.id, l); if (why) return why;
  s.loc.devast[l] = clamp(s.loc.devast[l] + 0.5, 0, 1);
  s.loc.unrest[l] = Math.min(100, s.loc.unrest[l] + 15);
  s.flags[`scorched_${l}`] = s.day + SCORCH_DAYS;
  if (s.playerNations.includes(n.id)) notice(s, n.id, 'scorched', { en: `The fields of ${w.names[l]} were burnt before the enemy.`, de: `Die Felder von ${w.namesDe[l]} wurden vor dem Feind verbrannt.` }, { loc: l });
  return null;
}
/** The AI burns the land in front of an invader much stronger than its own hosts (at most two places a month). */
export function aiScorch(s: GameState, w: World, n: Nation, enemyArmies: Army[], eStr: Float64Array, myStr: number) {
  if ((n.flags.scorch_day ?? -1e9) > s.day - 30) return;
  let invading = 0; const cand: number[] = [];
  enemyArmies.forEach((e, j) => {
    if (e.rebels || e.loc >= w.L || s.loc.owner[e.loc] !== n.id) return;
    invading += eStr[j];
    for (const l of e.path.slice(0, 3)) if (l < w.L && !cand.includes(l)) cand.push(l);
  });
  if (!invading || invading < Math.max(1, myStr) * 2.5) return;
  let k = 0;
  for (const l of cand.sort((x, y) => x - y)) {
    if (k >= 2) break;
    if (!scorchRefusal(s, w, n.id, l) && l !== n.capital) { scorchEarth(s, w, n, l); k++; }
  }
  if (k) n.flags.scorch_day = s.day;
}

// ---------------- reinforcements (monthly) ----------------
/** Share of a regiment's full strength that comes back in a month at most. */
export const REFILL_RATE = 0.06;
/** Where an army can take in new men: our own or an ally's or subject's land that we or they hold, not fighting or
 *  besieging, within the place's supply. Returns the reason it cannot, or null. */
export function refillBlock(s: GameState, w: World, a: Army): string | null {
  if (a.fleet || a.rebels || a.hostile) return 'x_rf_no';
  if (a.battle) return 'x_rf_battle';
  if (a.siege >= 0) return 'x_rf_siege';
  if (a.loc >= w.L || a.embarkedOn) return 'x_rf_sea';
  const o = s.loc.owner[a.loc], c = s.loc.ctrl[a.loc];
  const friend = (x: number) => x === a.owner || (x >= 0 && (hasTreaty(s, a.owner, x, 'alliance') || s.nations[x]?.overlord === a.owner || s.nations[a.owner]?.overlord === x));
  if (!friend(o) || !friend(c)) return 'x_rf_foreign';
  if (a.supplyDeficit > 0) return 'x_rf_supply';
  return null;
}
/** Men and gold the regiments of an army would take in this month (the realm's manpower and treasury permitting). */
export function refillPlan(s: GameState, w: World, a: Army) {
  const n = s.nations[a.owner];
  const block = refillBlock(s, w, a);
  const regs = a.regs.map((r) => {
    const max = r.max ?? r.men;
    const want = block || UNITS[r.type].kind === 'ship' ? 0 : Math.min(Math.max(0, max - r.men), max * REFILL_RATE * (n ? 0.5 + 0.5 * n.armyMaint : 1));
    return { type: r.type, men: r.men, max, want };
  });
  const men = regs.reduce((p, r) => p + r.want, 0);
  const gold = n ? regs.reduce((p, r) => p + unitCost(s, n, r.type, r.want) * (a.mercenary ? 0.75 : 0.5), 0) : 0;
  return { block, regs, men, gold };
}
/** Regiments refill slowly from the realm's manpower (mercenaries from gold alone) while resting in friendly land. */
export function reinforceMonth(s: GameState, w: World) {
  for (const a of s.armies) {
    const n = s.nations[a.owner];
    if (!n?.alive || a.fleet || a.rebels || a.hostile || n.treasury <= 0) continue;
    const plan = refillPlan(s, w, a);
    if (plan.men < 1) continue;
    // scale down to what the realm can pay and spare (mercenaries need no levies)
    const k = Math.min(1, n.treasury / Math.max(1e-9, plan.gold), a.mercenary ? 1 : n.manpower / plan.men);
    if (k <= 0) continue;
    plan.regs.forEach((p, i) => { if (p.want > 0) a.regs[i].men += p.want * k; });
    if (!a.mercenary) n.manpower -= plan.men * k;
    const gold = plan.gold * k;
    n.treasury -= gold; n.expenseAcc.reinforcements = (n.expenseAcc.reinforcements || 0) + gold;
  }
}
/** Full strength of every regiment: what it was raised or merged to (set for old saves and new regiments). */
export function setFullStrength(a: Army) { for (const r of a.regs) if (r.max === undefined || r.max < r.men) r.max = r.men; }

// ---------------- blockades (monthly) ----------------
/** Coastal places shut off by an enemy fleet in a neighbouring sea zone: place -> the blockading realm. */
export function blockadedPorts(s: GameState, w: World): Map<number, number> {
  const out = new Map<number, number>();
  for (const f of s.armies) {
    if (!f.fleet || f.loc < w.L || f.battle || armyMen(f) < 1) continue;
    const en = enemiesOf(s, f.owner); if (!en.size) continue;
    for (let e = w.adjStart[f.loc]; e < w.adjStart[f.loc + 1]; e++) {
      const v = w.adj[e]; if (v >= w.L || !w.coastal[v]) continue;
      const o = s.loc.owner[v];
      if (o >= 0 && en.has(o) && !out.has(v)) out.set(v, f.owner);
    }
  }
  return out;
}
/** Monthly: fleets off enemy ports cut their sea trade (the economy reads blockade_<market>, economy.ts tradeBlocked)
 *  and win war score by the share of the enemy's coast they shut (warScoreEvent 'blockade'). */
export function blockadeMonth(s: GameState, w: World) {
  const blk = blockadedPorts(s, w);
  // the war score from blockades fades unless the ships stay on station
  for (const war of s.wars) if (war.blockScore) war.blockScore = Math.abs(war.blockScore) < 0.05 ? 0 : war.blockScore * 0.85;
  if (!blk.size) return;
  // markets: shut when their hub or half of their harboured coast is blockaded
  const portDev = new Float64Array(s.markets.length), shut = new Float64Array(s.markets.length);
  for (let i = 0; i < w.L; i++) if (w.coastal[i] && s.loc.buildings[i * B + BI.port] > 0) { const m = s.loc.market[i]; portDev[m] += s.loc.dev[i]; if (blk.has(i)) shut[m] += s.loc.dev[i]; }
  for (const m of s.markets) if (blk.has(m.hub) || (portDev[m.id] > 0 && shut[m.id] >= portDev[m.id] * 0.5)) s.flags[`blockade_${m.id}`] = s.day + 35;
  // war score: by blockading realm and blockaded realm, the share of the blockaded realm's coast shut
  const coast = new Map<number, number>(), pair = new Map<string, number>();
  for (const [l, by] of blk) { const k = `${by}_${s.loc.owner[l]}`; pair.set(k, (pair.get(k) ?? 0) + Math.max(1, s.loc.dev[l])); coast.set(s.loc.owner[l], 0); }
  for (const o of coast.keys()) { let d = 0; for (const i of ownedLocs(s, o)) if (w.coastal[i]) d += Math.max(1, s.loc.dev[i]); coast.set(o, d); }
  for (const [k, d] of [...pair].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const [by, o] = k.split('_').map(Number);
    warScoreEvent(s, by, o, 'blockade', 3 * Math.min(1, d / Math.max(1, coast.get(o) ?? 1)));
  }
}

/** Maximum morale: morale effects and half the marshal's bonus, times what the realm spends on upkeep. */
export function maxMorale(s: GameState, a: Army) {
  const n = s.nations[a.owner];
  return (1 + (n ? lawEffect(n, 'morale') + councilBonus(s, n, 'marshal') * 0.5 : 0)) * maintMorale(s, a);
}
/** Ill-paid soldiers fight without heart: at full upkeep 1, at the lowest (25 %) 0.625 of maximum morale and of its recovery. */
export function maintMorale(s: GameState, a: Army) {
  const n = s.nations[a.owner]; if (!n || a.rebels || a.hostile) return 1;
  return 0.5 + 0.5 * clamp(a.fleet ? n.navyMaint : n.armyMaint, 0.25, 1);
}
export function stormRisk(s: GameState, w: World, sea: number): number {
  const d = dayToDate(s.day, s.startYear);
  const winter = d.m >= 9 || d.m <= 2 ? 1 : 0;
  const lat = w.lat[sea]; const atlantic = w.lon[sea] < -5 || (lat > 50 && w.lon[sea] < 10);
  return winter * (atlantic ? 1 : 0.4) * (lat > 45 ? 1 : 0.5);
}

// ---------------- battles ----------------
function startBattles(s: GameState, w: World) {
  const byLoc = new Map<number, Army[]>();
  for (const a of s.armies) { if (a.embarkedOn || a.battle) continue; const k = a.loc; let l = byLoc.get(k); if (!l) byLoc.set(k, (l = [])); l.push(a); }
  for (const [loc, list] of byLoc) {
    if (list.length < 2) continue;
    // find two hostile sides
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const A = list[i], D = list[j];
      if (A.battle || D.battle) continue;
      if (A.fleet !== D.fleet) continue;
      if (!hostile(s, A, D)) continue;
      // attacker = the one that moved in most recently
      const att = A.lastMoveDay >= D.lastMoveDay ? A : D, def = att === A ? D : A;
      const attSide = list.filter((x) => !x.battle && x.fleet === att.fleet && !hostile(s, x, att) && hostile(s, x, def));
      const defSide = list.filter((x) => !x.battle && x.fleet === att.fleet && !hostile(s, x, def) && hostile(s, x, att));
      if (!attSide.includes(att)) attSide.push(att);
      if (!defSide.includes(def)) defSide.push(def);
      const b: Battle = {
        id: newId(s), loc, day0: s.day, phase: 0, days: 0, att: attSide.map((x) => x.id), def: defSide.map((x) => x.id),
        attNation: att.owner, defNation: def.owner, lossA: 0, lossD: 0, startA: attSide.reduce((p, x) => p + armyMen(x), 0), startD: defSide.reduce((p, x) => p + armyMen(x), 0),
        log: [], naval: att.fleet, river: !att.fleet && riverCrossing(s, w, att, loc),
      };
      for (const x of [...attSide, ...defSide]) { x.battle = b.id; x.path = []; x.siege = -1; }
      s.battles.push(b);
      if (s.playerNations.includes(att.owner) || s.playerNations.includes(def.owner)) notice(s, s.playerNations.includes(att.owner) ? att.owner : def.owner, 'battle', { en: `Battle of ${w.names[loc]} has begun!`, de: `Die Schlacht bei ${w.namesDe[loc]} hat begonnen!` }, { loc });
    }
  }
}
/** The edge flags between two neighbouring places (0 when they are not neighbours). */
export function edgeFlag(w: World, a: number, b: number): number {
  for (let e = w.adjStart[a]; e < w.adjStart[a + 1]; e++) if (w.adj[e] === b) return w.adjFlag[e];
  return 0;
}
/** An attack across a river: the attacker reached the field in the last two days over a river between the two places
 *  (the rivers of the map, world.ts EDGE_RIVER). The crossing costs the attacker a fifth of its blows (battleDay). */
export function riverCrossing(s: GameState, w: World, a: Army, loc: number): boolean {
  if (a.fleet || a.prevLoc === undefined || a.prevLoc === loc || a.prevLoc >= w.L || loc >= w.L || s.day - a.lastMoveDay > 1) return false;
  return (edgeFlag(w, a.prevLoc, loc) & EDGE_RIVER) !== 0;
}
export const RIVER_PENALTY = 0.8;
export function hostile(s: GameState, a: Army, b: Army): boolean {
  if (a.owner === b.owner && !a.rebels && !b.rebels) return false; // rebels carry the owner they rise against
  if (a.rebels || b.rebels || a.hostile || b.hostile) {
    if (a.rebels && b.rebels) return false;
    const r = a.rebels ? a : b, o = a.rebels ? b : a;
    if (r.hostile) return true;
    return o.owner === r.rebels!.target || s.nations[o.owner]?.overlord === r.rebels!.target || allies(s, r.rebels!.target).includes(o.owner);
  }
  return atWar(s, a.owner, b.owner);
}

/** Men of a side by kind: horse, foot, shot, guns, and the pikes and close-order foot that stand against horse. */
export function unitMix(armies: Army[]) {
  let men = 0, cav = 0, inf = 0, ranged = 0, art = 0, pikes = 0;
  for (const a of armies) for (const r of a.regs) {
    const u = UNITS[r.type]; if (u.kind === 'ship') continue;
    men += r.men;
    if (u.kind === 'cav') cav += r.men; else if (u.kind === 'ranged') ranged += r.men; else if (u.kind === 'art') art += r.men; else inf += r.men;
    if (u.kind === 'inf' && u.def >= 1.4) pikes += r.men;
  }
  return { men, cav, inf, ranged, art, pikes };
}
const OPEN = new Set(['plains', 'farmland', 'steppe', 'desert']);
/**
 * Strength of one side of a battle at loc. enemy: the armies it faces (their unit mix shapes the fight: horse rides
 * down foot without pikes in the open, pikes and close-order foot blunt the horse, guns breach the walls a defender
 * stands behind). mods lists these effects for the battle report.
 */
export function sideStats(s: GameState, w: World, armies: Army[], loc: number, defending: boolean, enemy: Army[]) {
  let shock = 0, fire = 0, def = 0, men = 0, morale = 0, cav = 0, inf = 0, cavShock = 0, disc = 0;
  const n = s.nations[armies[0]?.owner];
  const terr = TERRAINS[w.terrain[Math.min(loc, w.L - 1)]] ?? 'plains';
  const t = TERRAIN_DEF[terr];
  const mods: [string, number][] = [];
  // horse in the open against foot without pikes, and with no horse of its own to screen it
  const mine = unitMix(armies), foe = unitMix(enemy);
  const naval = loc >= w.L || armies.some((a) => a.fleet);
  let cavOpen = 1;
  if (!naval && OPEN.has(terr) && mine.cav > 0 && foe.men > 0) {
    const pk = foe.pikes / foe.men, screen = foe.cav / foe.men < mine.cav / Math.max(1, mine.men) ? 1 : 0.5;
    cavOpen = 1 + 0.3 * (1 - Math.min(1, pk / 0.3)) * screen;
    if (cavOpen > 1.005) mods.push(['x_bm_cav_open', cavOpen - 1]);
  }
  for (const a of armies) {
    const tm = techMult(s.nations[a.owner], s);
    for (const r of a.regs) {
      const u = UNITS[r.type];
      const k = u.kind === 'ship' ? r.men * 120 : r.men;
      const cavMult = u.kind === 'cav' ? (t.cav * (1 + (n ? lawEffect(n, 'cavalry') : 0)) * cavOpen) : 1;
      // ships: naval strength (arsenals, admiralties, seafaring peoples) adds to guns and hulls alike
      const sea = u.sea && n ? 1 + lawEffect(n, 'naval') : 1;
      const sh = k * u.shock * tm * cavMult * (1 + (n ? lawEffect(n, 'shock') : 0));
      shock += sh; if (u.kind === 'cav') cavShock += sh;
      fire += k * u.fire * tm * (1 + (n ? lawEffect(n, 'fire') : 0)) * sea; def += k * u.def * tm * sea;
      men += k; morale += a.morale * k; disc += k * u.morale;
      if (u.kind === 'cav') cav += k; else inf += k;
      if (u.sea) { fire += r.men * u.sea.cannons * 8 * tm * sea; def += r.men * u.sea.hull * 3 * sea; }
    }
  }
  // pikes and close-order foot blunt the enemy's horse (less so in broken country, where squares cannot form)
  const rough = t.defence >= 0.15;
  const pikeCut = !naval && mine.men > 0 ? 0.35 * Math.min(1, mine.pikes / mine.men / 0.3) * (rough ? 0.7 : 1) : 0;
  if (pikeCut > 0.005 && foe.cav > 0) mods.push(['x_bm_pikes', pikeCut]);
  // the ablest commander present leads; traits add to or take from his generalship and steady the men (commanders.ts)
  const gen = armies.map((a) => s.chars[a.general]).filter((c) => c && c.alive).sort((a, b) => commanderSkill(b) - commanderSkill(a) || a!.id - b!.id)[0];
  const genSkill = commanderSkill(gen);
  // on their own land: militias and highlanders hold better when defending (defence); homeland faiths (baltic_old,
  // american_traditional, hussite) add defence and morale whether they attack or defend there
  const home = !!n && loc < w.L && s.loc.owner[loc] === n.id && !armies[0]?.rebels;
  const homeDef = home ? Math.max(0, lawEffect(n!, 'home_defence')) + (defending ? Math.max(0, lawEffect(n!, 'defence')) : 0) : 0;
  const homeMorale = home ? Math.max(0, lawEffect(n!, 'home_morale')) : 0;
  // walls: a defender standing at its own fort holds better, unless the attackers bring guns to batter them
  let walls = 0;
  if (defending && !naval && loc < w.L && n && s.loc.ctrl[loc] === n.id) {
    const f = s.loc.buildings[loc * B + BI.fort];
    if (f > 0) {
      walls = 0.08 * f;
      const guns = foe.men > 0 ? Math.min(1, foe.art / foe.men / 0.05) : 0;
      if (guns > 0) mods.push(['x_bm_guns_walls', -walls * guns]);
      walls *= 1 - guns;
      if (walls > 0.001) mods.push(['x_bm_walls', walls]);
    }
  }
  return { shock, fire, def, men, morale: men > 0 ? morale / men : 0, cav, inf, cavShock, pikeCut, gen: genSkill, genName: gen?.name ?? '', terrainDef: (defending ? t.defence : 0) + homeDef + walls, homeMorale: Math.max(-0.5, homeMorale + commanderMorale(gen)), disc: men > 0 ? disc / men : 1, mods };
}
type SideStats = ReturnType<typeof sideStats>;

/** Average morale of a side. */
function sideMorale(l: Army[]) { return l.length ? l.reduce((p, x) => p + x.morale, 0) / l.length : 0; }
/** Morale at which a side breaks and leaves the field. */
export const MORALE_BREAK = 0.15;
/** Troops of a side by unit type. */
function troopsOf(l: Army[]): Map<number, number> { const m = new Map<number, number>(); for (const a of l) for (const r of a.regs) m.set(r.type, (m.get(r.type) ?? 0) + r.men); return m; }
/** A side of the report as the battle opens: commanders, troops, morale and the factors of its strength. */
function openSide(s: GameState, w: World, b: Battle, list: Army[], st: SideStats, attacker: boolean): BattleSideRep {
  const gens = list.map((a) => s.chars[a.general]).filter((c) => c && c.alive).map((c) => ({ name: c!.name, skill: commanderSkill(c) }));
  const t = TERRAIN_DEF[TERRAINS[w.terrain[Math.min(b.loc, w.L - 1)]] ?? 'plains'];
  const n = s.nations[list[0]?.owner];
  const parts: [string, number][] = [
    ['x_bp_men', st.men * (b.naval ? 1 / 120 : 1)], ['x_bp_quality', st.men > 0 ? (st.shock + st.fire + st.def) / 3 / st.men / Math.max(0.01, techMult(n, s)) : 0],
    ['x_bp_discipline', techMult(n, s)], ['x_bp_general', 1 + st.gen * 0.06], ['x_bp_morale', 0.6 + 0.4 * st.morale],
  ];
  if (!attacker && st.terrainDef) parts.push(['x_bp_defence', 1 + st.terrainDef]);
  if (attacker && st.terrainDef) parts.push(['x_bp_home', 1 + st.terrainDef]);
  if (attacker && b.river) parts.push(['x_bp_river', RIVER_PENALTY]);
  const snow = s.loc.snow[Math.min(b.loc, w.L - 1)];
  if (!b.naval && snow > 0.05) parts.push(['x_bp_winter', 1 - 0.2 * snow]);
  if (!b.naval && t.cav !== 1 && st.cav > 0) parts.push(['x_bp_terrain_cav', t.cav]);
  const tr = troopsOf(list);
  return { nation: list[0]?.owner ?? -1, rebels: list.some((a) => !!a.rebels), armies: list.map((a) => a.id), generals: gens,
    troops: [...tr].sort((x, y) => x[0] - y[0]).map(([type, men]) => ({ type, start: men, end: men })), morale0: sideMorale(list), morale: sideMorale(list), parts, mods: st.mods };
}

function battleDay(s: GameState, w: World, b: Battle) {
  const A = b.att.map((id) => s.armies.find((x) => x.id === id)!).filter((x) => x && armyMen(x) > 0);
  const D = b.def.map((id) => s.armies.find((x) => x.id === id)!).filter((x) => x && armyMen(x) > 0);
  if (!A.length || !D.length) return endBattle(s, w, b, A.length ? 'att' : 'def');
  b.days++;
  const sa = sideStats(s, w, A, b.loc, false, D), sd = sideStats(s, w, D, b.loc, true, A);
  if (!b.rep) {
    const terr = TERRAINS[w.terrain[Math.min(b.loc, w.L - 1)]] ?? 'plains';
    b.rep = { id: b.id, loc: b.loc, day0: b.day0, day1: s.day, naval: b.naval, river: b.river, terrain: b.loc < w.L ? terr : 'sea', snow: s.loc.snow[Math.min(b.loc, w.L - 1)],
      fort: b.loc < w.L ? s.loc.buildings[b.loc * B + BI.fort] : 0, att: openSide(s, w, b, A, sa, true), def: openSide(s, w, b, D, sd, false), days: [], lossA: 0, lossD: 0, pursuit: 0, winner: '', reasons: [], wars: [] };
  }
  // phases: 0 ranged (2 days), 1 melee, 2 pursuit
  const phase = b.days <= 2 ? 0 : 1;
  b.phase = phase;
  const ra = 0.85 + rand(s.rng) * 0.3, rd = 0.85 + rand(s.rng) * 0.3;
  const riverPen = b.river ? RIVER_PENALTY : 1;
  const winterPen = 1 - 0.2 * s.loc.snow[Math.min(b.loc, w.L - 1)];
  const genA = 1 + sa.gen * 0.06, genD = 1 + sd.gen * 0.06;
  // a shaken side strikes weaker blows
  const moA = sideMorale(A), moD = sideMorale(D);
  const heartA = 0.6 + 0.4 * Math.min(1, moA), heartD = 0.6 + 0.4 * Math.min(1, moD);
  // pikes blunt the horse of the other side
  const shockA = sa.shock - sa.cavShock * sd.pikeCut, shockD = sd.shock - sd.cavShock * sa.pikeCut;
  let dmgToD: number, dmgToA: number;
  if (b.naval) {
    dmgToD = sa.fire * 0.004 * ra * genA * heartA; dmgToA = sd.fire * 0.004 * rd * genD * heartD;
  } else if (phase === 0) {
    dmgToD = sa.fire * 0.012 * ra * genA * riverPen * heartA; dmgToA = sd.fire * 0.012 * rd * genD * heartD;
  } else {
    dmgToD = (shockA * 0.02 + sa.fire * 0.006) * ra * genA * riverPen * winterPen * heartA; dmgToA = (shockD * 0.02 + sd.fire * 0.006) * rd * genD * winterPen * heartD;
  }
  dmgToD /= 1 + sd.terrainDef + sd.def / Math.max(1, sd.men) * 0.25;
  dmgToA /= 1 + sa.terrainDef + sa.def / Math.max(1, sa.men) * 0.25; // an attacker's terrainDef is only its homeland defence
  // casualties & morale
  const lossD = Math.min(sd.men, dmgToD) * (b.naval ? 1 / 120 : 1), lossA = Math.min(sa.men, dmgToA) * (b.naval ? 1 / 120 : 1);
  applyLosses(D, lossD); applyLosses(A, lossA);
  b.lossA += lossA; b.lossD += lossD;
  // morale falls with the blows taken, slower for steady troops (the units' own morale) and on home ground
  const mA = ((dmgToA / Math.max(1, sa.men)) * 3.2 + 0.03) / (1 + sa.homeMorale) / Math.max(0.5, sa.disc);
  const mD = ((dmgToD / Math.max(1, sd.men)) * 3.2 + 0.03) / (1 + sd.homeMorale) / Math.max(0.5, sd.disc);
  for (const a of A) a.morale = Math.max(0, a.morale - mA);
  for (const d of D) d.morale = Math.max(0, d.morale - mD);
  const nmA = sideMorale(A), nmD = sideMorale(D);
  b.rep.days.push({ day: b.days, phase, lossA, lossD, moraleA: nmA, moraleD: nmD });
  if (b.days === 1) b.log.push(`${sa.men | 0} vs ${sd.men | 0}`);
  if (nmA <= MORALE_BREAK || nmD <= MORALE_BREAK || b.days > 12) {
    const winner = nmA > nmD ? 'att' : 'def';
    // the beaten side breaks and flees; the winner's horse cuts down the fleeing, more so in a rout (the side broke
    // early or while the winners still stood firm)
    const win = winner === 'att' ? sa : sd; const lose = winner === 'att' ? D : A;
    const loseMo = winner === 'att' ? nmD : nmA, winMo = winner === 'att' ? nmA : nmD;
    const broke = loseMo <= MORALE_BREAK;
    const routed = broke && (winMo >= 0.45 || b.days <= 3);
    const pursuit = Math.min(armyMenList(lose) * (routed ? 0.45 : 0.3), (win.cav * 0.15 + armyMenList(lose) * 0.05) * (routed ? 1.75 : 1) * (b.naval ? 0 : 1));
    applyLosses(lose, pursuit);
    if (winner === 'att') b.lossD += pursuit; else b.lossA += pursuit;
    const side = winner === 'att' ? b.rep.def : b.rep.att;
    side.broke = broke; side.routed = routed; b.rep.pursuit = pursuit;
    endBattle(s, w, b, winner);
  }
}
function armyMenList(l: Army[]) { return l.reduce((p, x) => p + armyMen(x), 0); }
function applyLosses(list: Army[], loss: number) {
  const tot = armyMenList(list); if (tot <= 0) return;
  for (const a of list) for (const r of a.regs) r.men = Math.max(0, r.men - loss * r.men / tot);
}

/** Battle reports kept: every battle a human realm fought in and the great ones, newest last. */
const REPORTS_KEPT = 80;
function endBattle(s: GameState, w: World, b: Battle, winner: 'att' | 'def') {
  const W = (winner === 'att' ? b.att : b.def).map((id) => s.armies.find((x) => x.id === id)).filter(Boolean) as Army[];
  const Lz = (winner === 'att' ? b.def : b.att).map((id) => s.armies.find((x) => x.id === id)).filter(Boolean) as Army[];
  for (const a of [...W, ...Lz]) a.battle = 0;
  const wn = winner === 'att' ? b.attNation : b.defNation, ln = winner === 'att' ? b.defNation : b.attNation;
  const lossW = winner === 'att' ? b.lossA : b.lossD, lossL = winner === 'att' ? b.lossD : b.lossA;
  // the report: troops and morale at the end, the outcome and why
  const rep = b.rep;
  if (rep) {
    const close = (side: BattleSideRep, list: Army[]) => {
      const tr = troopsOf(list);
      for (const x of side.troops) x.end = tr.get(x.type) ?? 0;
      side.morale = sideMorale(list);
    };
    close(rep.att, (winner === 'att' ? W : Lz)); close(rep.def, (winner === 'att' ? Lz : W));
    rep.lossA = b.lossA; rep.lossD = b.lossD; rep.winner = winner; rep.day1 = s.day;
    rep.reasons = battleReasons(s, w, b, winner);
    rep.wars = s.wars.filter((x) => (x.att.includes(b.attNation) && x.def.includes(b.defNation)) || (x.def.includes(b.attNation) && x.att.includes(b.defNation))).map((x) => x.id);
  }
  // generals may die
  // (a ruler or heir leading the host dies like any other: the crown passes on)
  for (const a of Lz) if (a.general && chance(s.rng, 0.08)) {
    const g = s.chars[a.general];
    if (g) {
      notice(s, a.owner, 'general_death', { en: `${g.name} fell at ${w.names[b.loc]}.`, de: `${g.name} fiel bei ${w.namesDe[b.loc]}.` }, { loc: b.loc });
      a.general = 0;
      const owner = s.nations[a.owner];
      if (owner) characterDies(s, w, owner, g.id); else { g.alive = false; g.died = s.day; }
    }
  }
  // losers retreat to the nearest friendly location
  for (const a of Lz) {
    if (armyMen(a) < (a.fleet ? 1 : 50)) { removeArmy(s, a); continue; } // fleets count hulls, armies men
    a.morale = Math.min(a.morale, 0.15);
    const dest = retreatTarget(s, w, a);
    if (dest >= 0) { const p = findPath(s, w, a, a.loc, dest, 4000); if (p) { a.path = p; a.retreating = true; } }
  }
  for (const a of W) a.morale = Math.min(maxMorale(s, a), a.morale + 0.1);
  battleLessons(s, W, Lz); // experience, new traits and wounds for the commanders (commanders.ts)
  // rebels are told apart by their armies (a rebel stack carries its realm's id): the rebel side earns or loses no
  // prestige, war exhaustion or war score
  const rebW = W.some((a) => a.rebels), rebL = Lz.some((a) => a.rebels);
  const wnN = rebW ? undefined : s.nations[wn], lnN = rebL ? undefined : s.nations[ln];
  if (wnN) { wnN.stats.battlesWon++; wnN.prestige = clamp(wnN.prestige + 2 + lossL / 2000, -100, 100); }
  if (lnN) { lnN.stats.battlesLost++; lnN.prestige = clamp(lnN.prestige - 2, -100, 100); lnN.warExhaustion = clamp(lnN.warExhaustion + lossL / 3000 + 1, 0, 100); }
  if (wnN) wnN.warExhaustion = clamp(wnN.warExhaustion + lossW / 5000, 0, 100);
  // manpower lost permanently comes out of population (peasants/labourers)
  const big = lossW + lossL > 1500;
  const kind = b.naval ? 'naval battle' : 'battle';
  const text = {
    en: `${wnN?.short.en ?? 'Rebels'} defeated ${lnN?.short.en ?? 'rebels'} in the ${kind} of ${w.names[b.loc]} (${Math.round(lossW)} vs ${Math.round(lossL)} lost).`,
    de: `${wnN ? wnN.short.de + ' besiegte' : 'Rebellen besiegten'} ${lnN?.short.de ?? 'Rebellen'} in der ${b.naval ? 'Seeschlacht' : 'Schlacht'} bei ${w.namesDe[b.loc]} (${Math.round(lossW)} gegen ${Math.round(lossL)} Verluste).`,
  };
  if (big) chronicle(s, rebW ? ln : wn, 'battle', text, b.loc);
  s.flags[`last_battle_${b.loc}`] = s.day;
  const human = s.playerNations.includes(wn) || s.playerNations.includes(ln);
  if (rep && (human || lossW + lossL > 3000)) {
    const list = (s.battleReports ??= []);
    list.push(rep);
    if (list.length > REPORTS_KEPT) {
      // drop the oldest report no human realm fought in, else the oldest
      const k = list.findIndex((r) => !s.playerNations.includes(r.att.nation) && !s.playerNations.includes(r.def.nation));
      list.splice(k >= 0 && k < list.length - 1 ? k : 0, 1);
    }
  }
  // one notice per player realm: won when its own (non-rebel) armies are among the winners; it opens the report
  for (const p of new Set([wn, ln])) if (s.playerNations.includes(p)) notice(s, p, W.some((a) => a.owner === p && !a.rebels) ? 'battle_won' : 'battle_lost', text, { loc: b.loc, ...(rep ? { report: rep.id } : {}) });
  if (!rebW && !rebL) warScoreEvent(s, wn, ln, 'battle', Math.min(25, 2 + (lossL + 1) / 1500), b.loc);
  delete b.rep;
  s.battles.splice(s.battles.indexOf(b), 1);
  s.flags.lastBattleResult = s.day;
  (s as any).lastBattle = { loc: b.loc, winner: wn, loser: ln, winnerRebels: rebW, loserRebels: rebL, lossW, lossL, days: b.days, naval: b.naval, day: s.day, reasons: rep?.reasons ?? battleReasons(s, w, b, winner), report: rep?.id };
}
/** Why the battle went as it did: terrain, a river crossing, winter, numbers, generals, the unit mix and a rout. */
function battleReasons(s: GameState, w: World, b: Battle, winner: string): string[] {
  const r: string[] = [];
  const t = TERRAINS[w.terrain[Math.min(b.loc, w.L - 1)]];
  if (!b.naval && TERRAIN_DEF[t].defence > 0.2) r.push(`terrain:${t}`);
  if (b.river) r.push('river');
  if (!b.naval && s.loc.snow[Math.min(b.loc, w.L - 1)] > 0.3) r.push('winter');
  r.push(b.startA > b.startD * 1.3 ? 'numbers_att' : b.startD > b.startA * 1.3 ? 'numbers_def' : 'even');
  const rep = b.rep;
  if (rep) {
    const ga = Math.max(0, ...rep.att.generals.map((g) => g.skill)), gd = Math.max(0, ...rep.def.generals.map((g) => g.skill));
    if (Math.abs(ga - gd) >= 2) r.push(ga > gd ? 'general_att' : 'general_def');
    for (const [side, x] of [['att', rep.att], ['def', rep.def]] as const) for (const [k] of x.mods) r.push(`${k}:${side}`);
    if (rep.att.routed || rep.def.routed) r.push('rout');
    else if (rep.att.broke || rep.def.broke) r.push('morale_broke');
  }
  void winner;
  return r;
}
function retreatTarget(s: GameState, w: World, a: Army): number {
  let best = -1, bd = Infinity;
  const n = s.nations[a.owner];
  if (a.fleet) {
    for (let i = 0; i < w.L; i++) if (w.coastal[i] && s.loc.owner[i] === a.owner) { const d = w.distKm(a.loc, i); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  // a beaten host does not fall back into an enemy army (a besieged capital would only bring it back to battle the
  // next day): it seeks a place it holds that no enemy stands in, and only when there is none the nearest it holds
  const en = enemiesOf(s, a.owner);
  const held = new Set<number>(); for (const x of s.armies) if (!x.fleet && en.has(x.owner)) held.add(x.loc);
  for (let e = w.adjStart[a.loc]; e < w.adjStart[a.loc + 1]; e++) {
    const v = w.adj[e]; if (v >= w.L) continue;
    if (s.loc.ctrl[v] === a.owner && !held.has(v)) return v;
  }
  if (n && n.capital >= 0 && s.loc.ctrl[n.capital] === a.owner && !held.has(n.capital)) return n.capital;
  let any = -1, ad = Infinity;
  for (let i = 0; i < w.L; i++) if (s.loc.ctrl[i] === a.owner) {
    const d = w.distKm(a.loc, i);
    if (!held.has(i)) { if (d < bd) { bd = d; best = i; } } else if (d < ad) { ad = d; any = i; }
  }
  return best >= 0 ? best : any;
}
export function removeArmy(s: GameState, a: Army) {
  const k = s.armies.indexOf(a); if (k >= 0) s.armies.splice(k, 1);
  for (const f of s.armies) if (f.carrying.includes(a.id)) f.carrying.splice(f.carrying.indexOf(a.id), 1);
}

// ---------------- sieges & occupation ----------------
/** Whether a realm casts great guns that batter town walls: it has adopted the bombards, or its warfare (level 7)
 *  lets it cast them on its own. */
export function greatGuns(n: Nation | undefined): boolean { return !!n && (n.tech[2] >= 7 || n.modifiers.some((m) => m.id === 'inv_bombards')); }
/** Whether a realm builds bastion fortresses, whose low earthen walls do not crumble under cannon. */
export function bastions(n: Nation | undefined): boolean { return !!n && n.modifiers.some((m) => m.id === 'inv_trace_italienne'); }
/** Artillery (men in the guns) a host needs to batter the walls of a fort of this level. */
export const GUNS_PER_FORT = 250;
/** The armies working a siege: those besieging the place, standing there, not marching or fighting. */
export function besiegersOf(s: GameState, sg: Siege): Army[] { return s.armies.filter((a) => a.siege === sg.loc && a.loc === sg.loc && !a.battle && !a.path.length); }
/** A fleet of the besiegers' side (or not hostile to them) in a sea zone next to the town shuts it off from the sea. */
function siegeBlockade(s: GameState, w: World, l: number, besiegers: Army[]): boolean {
  return w.coastal[l] === 1 && s.armies.some((f) => f.fleet && f.loc >= w.L && besiegers.some((b) => b.owner === f.owner || !hostile(s, f, b)) && w.distKm(f.loc, l) < 150);
}
/** Strength of the walls: fort level, fortress laws and the defenders' warfare. */
function fortStrength(s: GameState, l: number): number {
  const fort = s.loc.buildings[l * B + BI.fort];
  const defN = s.nations[s.loc.ctrl[l]];
  return fort * (1 + (defN ? lawEffect(defN, 'fort_strength') : 0)) * (defN ? 1 + (defN.tech[2] - 1) * 0.03 : 1);
}
/**
 * The monthly siege roll and what it depends on: 1d14 + the besiegers' bonus against 10 + twice the walls' strength.
 * parts: the bonus by cause; p: chance a month brings the siege one step on; breach: chance it opens a breach; days:
 * the expected days until the town falls (4 steps, 3 under blockade). The siege itself (siegesDay) rolls exactly this.
 */
export function siegeOdds(s: GameState, w: World, sg: Siege) {
  const besiegers = besiegersOf(s, sg);
  const l = sg.loc;
  const fort = s.loc.buildings[l * B + BI.fort];
  const defN = s.nations[s.loc.ctrl[l]];
  let men = 0, art = 0;
  for (const a of besiegers) for (const r of a.regs) { men += r.men; if (UNITS[r.type].kind === 'art') art += r.men; }
  // siege craft of the besiegers (great guns, engineers: the best of the allied camps directs the works) and the
  // weight of numbers against the garrison. A realm whose whole host is called to a great siege (siege_focus, set by
  // a situation such as the siege of the City) brings the great guns cast for it: +2 there, and only with artillery.
  let craft = 0, guns = false;
  for (const a of besiegers) {
    const bes = s.nations[a.owner]; if (!bes || a.rebels) continue;
    craft = Math.max(craft, lawEffect(bes, 'siege') + (art > 0 && bes.flags.siege_focus === l ? 2 : 0));
    if (greatGuns(bes)) guns = true;
  }
  const parts: [string, number][] = [
    ['x_sg_artillery', art > 0 ? 2 + Math.min(3, art / 500) : 0], ['x_sg_blockade', sg.blockade ? 2 : 0], ['x_sg_breach', sg.breach],
    ['x_sg_numbers', Math.min(3, Math.floor(men / Math.max(1, sg.garrison * 2)))], ['x_sg_time', Math.floor(sg.days / 120)], ['x_sg_craft', craft],
  ];
  const bonus = parts.reduce((p, x) => p + x[1], 0);
  const need = 10 + fortStrength(s, l) * 2;
  // chance of a step: a natural 14, or roll + bonus reaches the walls' strength (rolls 1..14)
  let pStep = 0, pBreach = 0;
  for (let r = 1; r <= 14; r++) { if (r === 14 || r + bonus >= need) pStep += 1 / 14; if (r + bonus >= need + 4) pBreach += 1 / 14; }
  const battering = guns && art >= GUNS_PER_FORT * fort && !bastions(defN);
  if (battering) pBreach = 1; // great guns widen the breach every month
  // a coastal town not blockaded may be resupplied from the sea (a roll of 3 sets the siege back a step)
  const pResupply = !sg.blockade && w.coastal[l] ? 1 / 14 : 0;
  const steps = Math.max(0, (sg.blockade ? 3 : 4) - sg.progress);
  const net = Math.max(0.01, pStep - pResupply);
  const days = steps <= 0 ? 0 : Math.round(steps / net * 30 - (sg.days % 30));
  return { parts, bonus, need, pStep, pBreach, battering, pResupply, steps, days: Math.max(0, days), men, art, garrison: sg.garrison, besiegers };
}
function siegeLog(s: GameState, sg: Siege, kind: string) { sg.log.push(`${s.day}:${kind}`); if (sg.log.length > 30) sg.log.splice(0, sg.log.length - 30); }
function siegesDay(s: GameState, w: World) {
  const L = w.L;
  for (const a of s.armies) {
    if (a.fleet || a.battle || a.path.length || a.embarkedOn || a.loc >= L) continue;
    const l = a.loc;
    const ctrl = s.loc.ctrl[l];
    if (ctrl === a.owner) { a.siege = -1; continue; }
    const target = a.rebels ? a.rebels.target : -1;
    const hostileCtrl = a.rebels ? (ctrl === target || (ctrl >= 0 && s.nations[ctrl]?.overlord === target)) : (ctrl >= 0 && atWar(s, a.owner, ctrl));
    const ownerBack = s.loc.owner[l] === a.owner && ctrl !== a.owner && ((ctrl === -2 && !a.rebels) || (ctrl >= 0 && atWar(s, a.owner, ctrl))); // liberating own land, also from rebels
    if (!hostileCtrl && !ownerBack && !(ctrl < 0 && a.hostile)) continue;
    // enemy army present? no siege
    if (s.armies.some((x) => x !== a && x.loc === l && !x.fleet && hostile(s, x, a))) continue;
    const fort = s.loc.buildings[l * B + BI.fort];
    if (!fort) {
      // unfortified: occupied after a few days' presence
      s.loc.occTimer[l] += armyMen(a) / 3000 + 0.4;
      if (s.loc.occTimer[l] >= 3) { occupy(s, w, l, a.rebels ? -2 : (s.loc.owner[l] === a.owner ? a.owner : a.owner), a); s.loc.occTimer[l] = 0; }
      continue;
    }
    let sg = s.sieges.find((x) => x.loc === l);
    if (!sg) {
      const g = (s.loc.garrison[l] || fort * 1000) * (0.4 + 0.6 * (s.nations[s.loc.owner[l]]?.flags.fort_pay ?? 1));
      sg = { loc: l, nation: a.owner, progress: 0, days: 0, garrison: g, garrison0: g, breach: 0, blockade: false, log: [] };
      s.sieges.push(sg);
      siegeLog(s, sg, 'begun');
      a.siege = l;
      if (s.playerNations.includes(ctrl)) notice(s, ctrl, 'siege', { en: `${w.names[l]} is under siege!`, de: `${w.namesDe[l]} wird belagert!` }, { loc: l });
    }
    if (sg.nation !== a.owner && !s.armies.some((x) => x.siege === l && x.owner === sg!.nation)) sg.nation = a.owner;
    a.siege = l;
  }
  for (const sg of s.sieges.slice()) {
    const besiegers = besiegersOf(s, sg);
    if (!besiegers.length) {
      // a sortie or a relief army is fought before the walls: the siege works stand until the battle is decided
      if (s.battles.some((b) => b.loc === sg.loc)) continue;
      s.sieges.splice(s.sieges.indexOf(sg), 1); continue;
    }
    sg.days++;
    const l = sg.loc;
    // blockade: a fleet of the besiegers' side in an adjacent sea zone
    const blk = siegeBlockade(s, w, l, besiegers);
    if (blk && !sg.blockade) siegeLog(s, sg, 'blockade');
    sg.blockade = blk;
    if (sg.days % 30 === 0) {
      // monthly siege roll: 1d14 + bonuses vs fort level (siegeOdds lists the same numbers for the siege panel)
      const roll = 1 + Math.floor(rand(s.rng) * 14);
      const o = siegeOdds(s, w, sg);
      if (roll === 14 || roll + o.bonus >= o.need) { sg.progress += 1; siegeLog(s, sg, 'progress'); }
      if (roll + o.bonus >= o.need + 4) { sg.breach = Math.min(3, sg.breach + 1); siegeLog(s, sg, 'breach'); }
      // great guns batter the old high walls (enough artillery for the fort's level, and a realm that casts such guns):
      // each month the breach widens, and once it is wide open the bombardment bleeds the garrison. Bastion fortresses
      // (trace_italienne) do not crumble this way.
      else if (o.battering) {
        if (sg.breach < 3) { sg.breach++; siegeLog(s, sg, 'breach'); } else { sg.garrison = Math.max(300, sg.garrison * 0.9); siegeLog(s, sg, 'bombarded'); }
      }
      if (roll <= 2) {
        // disease in the camp
        for (const a of besiegers) for (const r of a.regs) r.men *= 0.93;
        siegeLog(s, sg, 'disease');
      }
      if (roll === 3 && !sg.blockade && w.coastal[l]) { sg.progress = Math.max(0, sg.progress - 1); siegeLog(s, sg, 'resupplied'); }
      if (sg.progress >= 4 || (sg.blockade && sg.progress >= 3)) {
        siegeLog(s, sg, 'fallen');
        occupy(s, w, l, besiegers[0].rebels ? -2 : besiegers[0].owner, besiegers[0]);
        s.sieges.splice(s.sieges.indexOf(sg), 1);
        for (const a of besiegers) a.siege = -1;
        continue;
      }
    }
    // garrison starves slowly
    sg.garrison = Math.max(100, sg.garrison * (sg.blockade ? 0.997 : 0.999));
  }
}

/**
 * Storming the walls now instead of waiting: the chance the assault carries the town and the men it costs. The odds
 * grow with numbers against the garrison, the breach, guns and the besiegers' morale, and fall with the walls. The
 * assault itself (assault) uses exactly these numbers.
 */
export function assaultOdds(s: GameState, w: World, sg: Siege, armies: Army[]) {
  let men = 0, art = 0, mo = 0;
  for (const a of armies) for (const r of a.regs) { men += r.men; mo += r.men * a.morale; if (UNITS[r.type].kind === 'art') art += r.men; }
  const morale = men > 0 ? mo / men : 0;
  const fort = s.loc.buildings[sg.loc * B + BI.fort];
  const walls = Math.max(1, fortStrength(s, sg.loc));
  const parts: [string, number][] = [
    ['x_as_numbers', clamp(men / Math.max(1, sg.garrison * (2 + walls)) * 0.35, 0, 0.6)],
    ['x_as_breach', sg.breach * 0.15], ['x_as_guns', men > 0 ? Math.min(0.1, art / men) : 0], ['x_as_morale', (morale - 0.7) * 0.2],
  ];
  const p = clamp(parts.reduce((q, x) => q + x[1], 0), 0.03, 0.9);
  // the attackers lose more against higher walls and a stronger garrison, fewer through a breach
  const loss = Math.min(men * 0.4, sg.garrison * (1.5 + fort * 0.5) * (1 - sg.breach * 0.15));
  return { p, loss, men, parts, garrison: sg.garrison, wait: sg.lastAssault !== undefined ? Math.max(0, sg.lastAssault + 30 - s.day) : 0 };
}
/** Assault: storm the walls now at heavy cost (all our armies besieging the place go in together). */
/** Why this army cannot storm the walls it besieges now (null = it can); the siege panel shows the same reason. */
export function assaultRefusal(s: GameState, a: Army): string | null {
  const sg = s.sieges.find((x) => x.loc === a.loc); if (!sg || a.siege !== a.loc) return 'no siege here';
  if (a.battle) return 'in battle';
  if (sg.days < 10) return 'the siege works are not ready';
  if (sg.lastAssault !== undefined && s.day - sg.lastAssault < 30) return 'the troops need time before another assault';
  if (!besiegersOf(s, sg).some((x) => x.owner === a.owner && !x.rebels && armyMen(x) > 0)) return 'no siege here';
  return null;
}
export function assault(s: GameState, w: World, a: Army): string | null {
  const why = assaultRefusal(s, a); if (why) return why;
  const sg = s.sieges.find((x) => x.loc === a.loc)!;
  const armies = besiegersOf(s, sg).filter((x) => x.owner === a.owner && !x.rebels);
  const o = assaultOdds(s, w, sg, armies);
  if (o.men <= 0) return 'no siege here';
  sg.lastAssault = s.day;
  for (const x of armies) for (const r of x.regs) r.men = Math.max(0, r.men - o.loss * r.men / o.men);
  if (chance(s.rng, o.p)) {
    siegeLog(s, sg, 'stormed');
    occupy(s, w, a.loc, a.owner, a); s.sieges.splice(s.sieges.indexOf(sg), 1);
    for (const x of armies) x.siege = -1;
    if (s.playerNations.includes(a.owner)) notice(s, a.owner, 'siege_won', { en: `Our troops stormed ${w.names[a.loc]} (${Math.round(o.loss)} men lost).`, de: `Unsere Truppen haben ${w.namesDe[a.loc]} gestürmt (${Math.round(o.loss)} Mann verloren).` }, { loc: a.loc });
    return null;
  }
  sg.garrison *= 0.8;
  for (const x of armies) x.morale *= 0.6;
  siegeLog(s, sg, 'assault_failed');
  if (s.playerNations.includes(a.owner)) notice(s, a.owner, 'assault_failed', { en: `The assault on ${w.names[a.loc]} was repulsed (${Math.round(o.loss)} men lost).`, de: `Der Sturm auf ${w.namesDe[a.loc]} wurde abgeschlagen (${Math.round(o.loss)} Mann verloren).` }, { loc: a.loc });
  return null; // the assault was made (the outcome is told in a notice and the siege log)
}

export function occupy(s: GameState, w: World, l: number, by: number, army?: Army) {
  const owner = s.loc.owner[l];
  const prevCtrl = s.loc.ctrl[l];
  if (by === -2 && army?.rebels) {
    // rebels hold the location (ctrl = -2 means rebel-held)
    s.loc.ctrl[l] = -2 as any;
  } else {
    // returning own land
    s.loc.ctrl[l] = (owner >= 0 && (owner === by || !atWar(s, by, owner)) ? owner : by) as any;
  }
  s.loc.garrison[l] = s.loc.buildings[l * B + BI.fort] * 300;
  s.loc.devast[l] = clamp(s.loc.devast[l] + 0.15, 0, 1);
  // control spreads to unfortified enemy locations of the same province
  const p = w.provOf[l];
  if (p >= 0 && s.loc.buildings[l * B + BI.fort] > 0) {
    for (const k of w.provinces[p].locs) {
      if (k === l) continue;
      if (s.loc.buildings[k * B + BI.fort] > 0) continue;
      if (s.loc.ctrl[k] === prevCtrl) s.loc.ctrl[k] = s.loc.ctrl[l];
    }
  }
  if (owner >= 0 && by >= 0 && by !== owner) {
    warScoreEvent(s, by, owner, 'occupy', 0, l);
    const cap = s.nations[owner]?.capital === l;
    if (cap) notice(s, owner, 'capital_lost', { en: `Our capital ${w.names[l]} has fallen to the enemy!`, de: `Unsere Hauptstadt ${w.namesDe[l]} ist in Feindeshand!` }, { loc: l });
    if (s.loc.buildings[l * B + BI.fort] >= 2 || cap) chronicle(s, by, 'siege', { en: `${s.nations[by].short.en} took ${w.names[l]}${cap ? `, capital of ${s.nations[owner].short.en}` : ''}.`, de: `${s.nations[by].short.de} nahm ${w.namesDe[l]} ein${cap ? `, Hauptstadt von ${s.nations[owner].short.de}` : ''}.` }, l);
  }
  s.flags.ownershipDirty = s.day;
}

// ---------------- recruitment ----------------
export function recruit(s: GameState, w: World, n: Nation, loc: number, unit: number, men: number): string | null {
  const u = UNITS[unit]; if (!u) return 'unknown unit';
  if (!availableUnits(s, n, u.kind === 'ship').includes(unit)) return 'unit not available';
  if (s.loc.owner[loc] !== n.id || s.loc.ctrl[loc] !== n.id) return 'not your location';
  if (u.kind === 'ship' && (!w.coastal[loc] || s.loc.buildings[loc * B + BI.port] === 0)) return 'needs a harbour';
  const cost = unitCost(s, n, unit, men);
  if (n.treasury < cost) return 'not enough gold';
  const mp = u.kind === 'ship' ? men * 50 : men;
  if (u.kind !== 'ship' && n.manpower < mp) return 'not enough manpower';
  if (u.kind === 'ship' && n.sailors < mp) return 'not enough sailors';
  n.treasury -= cost; n.expenseAcc.recruitment = (n.expenseAcc.recruitment || 0) + cost;
  if (u.kind === 'ship') n.sailors -= mp; else n.manpower -= mp;
  // take men from population (peasants & labourers)
  const base = loc * C;
  const take = Math.min(mp * 0.5, s.loc.pop[base + CL.peasants] * 0.05);
  s.loc.pop[base + CL.peasants] -= take;
  // a capable marshal drills recruits faster (up to a fifth)
  const drill = u.kind === 'ship' ? 1 : 1 - 2 * councilBonus(s, n, 'marshal');
  s.recruits.push({ loc, nation: n.id, type: unit, men, left: Math.max(1, Math.round((u.kind === 'ship' ? 120 : u.kind === 'cav' ? 60 : 30) * drill)), army: 0 });
  return null;
}
function recruitsDay(s: GameState, w: World) {
  for (const r of s.recruits.slice()) {
    r.left--;
    if (r.left > 0) continue;
    s.recruits.splice(s.recruits.indexOf(r), 1);
    const n = s.nations[r.nation]; if (!n?.alive || s.loc.owner[r.loc] !== r.nation) continue;
    const isShip = UNITS[r.type].kind === 'ship';
    let target = s.armies.find((a) => a.owner === r.nation && !a.rebels && a.loc === (isShip ? seaNear(w, r.loc) : r.loc) && a.fleet === isShip && !a.path.length && !a.battle);
    if (isShip) {
      const sea = seaNear(w, r.loc);
      if (!target) target = newArmy(s, r.nation, sea >= 0 ? sea : r.loc, [], true);
    } else if (!target) target = newArmy(s, r.nation, r.loc, []);
    const reg = target.regs.find((x) => x.type === r.type);
    if (reg) { reg.men += r.men; reg.max = (reg.max ?? reg.men - r.men) + r.men; } else target.regs.push({ type: r.type, men: r.men, max: r.men });
    if (s.playerNations.includes(r.nation)) notice(s, r.nation, 'recruited', { en: `${UNITS[r.type].name.en} ready at ${w.names[r.loc]}.`, de: `${UNITS[r.type].name.de} bereit in ${w.namesDe[r.loc]}.` }, { loc: r.loc });
  }
}
export function seaNear(w: World, l: number): number {
  for (let e = w.adjStart[l]; e < w.adjStart[l + 1]; e++) if (w.adj[e] >= w.L) return w.adj[e];
  return -1;
}

/** Up-front price of a free company of `size` men (the UI shows the same number). */
export function mercenaryCost(s: GameState, n: Nation, size: number): number {
  return size / 1000 * 18 * COST_SCALE * 0.1 * s.priceLevel * (1 + lawEffect(n, 'mercenary_cost')) * 3;
}
/** Parts of mercenaryCost for a breakdown tooltip: base price, price level and modifiers (multiplied in this order). */
export function mercenaryCostParts(s: GameState, n: Nation, size: number): { base: number; priceLevel: number; modifier: number; total: number } {
  return { base: size / 1000 * 18 * COST_SCALE * 0.1 * 3, priceLevel: s.priceLevel, modifier: lawEffect(n, 'mercenary_cost'), total: mercenaryCost(s, n, size) };
}
export function hireMercenaries(s: GameState, w: World, n: Nation, loc: number, size: number): string | null {
  if (s.loc.owner[loc] !== n.id) return 'not your location';
  const cost = mercenaryCost(s, n, size);
  if (n.treasury < cost) return 'not enough gold';
  n.treasury -= cost; n.expenseAcc.mercenaries = (n.expenseAcc.mercenaries || 0) + cost;
  const units = availableUnits(s, n, false);
  const inf = units.find((u) => UNITS[u].kind === 'inf' && UNITS[u].id !== 'levy') ?? units[0];
  const rng = units.find((u) => UNITS[u].kind === 'ranged') ?? inf;
  const cav = units.find((u) => UNITS[u].kind === 'cav') ?? inf;
  const names: I18n[] = [{ en: 'White Company', de: 'Weiße Kompanie' }, { en: 'Great Company', de: 'Große Kompanie' }, { en: 'Company of the Star', de: 'Kompanie vom Stern' },
    { en: 'Company of St George', de: 'Kompanie des heiligen Georg' }, { en: 'Black Band', de: 'Schwarze Bande' }, { en: 'Swiss Reisläufer', de: 'Schweizer Reisläufer' },
    { en: 'Catalan Company', de: 'Katalanische Kompanie' }, { en: 'Company of the Hat', de: 'Kompanie vom Hut' }];
  const a = newArmy(s, n.id, loc, [{ type: inf, men: size * 0.5 }, { type: rng, men: size * 0.3 }, { type: cav, men: size * 0.2 }], false, names[(s.day + n.id) % names.length]);
  a.mercenary = true;
  return null;
}

// ---------------- upkeep & manpower (monthly) ----------------
/** Ships are priced on the regiments' scale (price and upkeep per thousand men) as if each ship were this many thousand
 *  men: a war galley of 1356 costs about what 150 to 250 men-at-arms do (the pay of its rowers and marines), not what
 *  1,000 of them do. Their goods (grain for the crew, timber and pitch) are listed per ship already. */
export const SHIP_SCALE = 0.06;
/** What a regiment of army `a` costs its realm a month: the gold of its upkeep and the goods it eats at the prices of
 *  market m (half of their value is paid from the chest); `book` also puts the goods on the market's demand. */
/** The gold part of a unit's monthly upkeep for `men` men (ships: `men` ships) at full maintenance, without the goods
 *  they eat: its upkeep per thousand men (ships: × SHIP_SCALE each) × price level × its cost effects. */
export function unitUpkeep(s: GameState, n: Nation, unit: number, men: number): number {
  const u = UNITS[unit]; const ship = u.kind === 'ship';
  // (lawEffect holds laws, values, tradition and modifiers alike; ships pay naval_cost instead of army_cost)
  return u.upkeep * (ship ? men * SHIP_SCALE : men / 1000) * UPKEEP_SCALE * 0.1 * s.priceLevel * clamp(1 + lawEffect(n, ship ? 'naval_cost' : 'army_cost'), 0.3, 2);
}
function regimentUpkeep(s: GameState, n: Nation, a: Army, r: Regiment, m: GameState['markets'][number] | undefined, book: boolean): number {
  const u = UNITS[r.type];
  const ship = u.kind === 'ship';
  const k = ship ? r.men : r.men / 1000; // the goods are listed per ship and per thousand men
  let c = unitUpkeep(s, n, r.type, r.men) * (a.mercenary ? 2.2 : 1);
  if (m) for (const [gid, q] of u.goods) { const gi = GI[gid]; if (book) m.dAcc[gi] += q * k; c += q * k * m.price[gi] * 0.5; }
  return c * (ship ? n.navyMaint : n.armyMaint);
}
/** This month's upkeep of every realm's armies and of its fleets (each army eats from the market of the place it
 *  stands in, a fleet from its capital's); `book` also puts the goods they eat on those markets' demand. */
export function upkeepCosts(s: GameState, w: World, book = false): { army: Float64Array; navy: Float64Array } {
  const army = new Float64Array(s.nations.length), navy = new Float64Array(s.nations.length);
  for (const a of s.armies) {
    if (a.rebels || a.hostile) continue;
    const n = s.nations[a.owner]; if (!n) continue;
    const mloc = a.loc < w.L ? a.loc : n.capital >= 0 ? n.capital : 0;
    const m = s.markets[s.loc.market[mloc]];
    for (const r of a.regs) { const c = regimentUpkeep(s, n, a, r, m, book); if (UNITS[r.type].kind === 'ship') navy[a.owner] += c; else army[a.owner] += c; }
  }
  return { army, navy };
}
/** Garrison pay of a realm's forts this month: the full pay, and what it pays — a realm pays its garrisons only what
 *  it can bear: beyond a third of last month's revenue the walls are left to the militia. */
export function fortPay(s: GameState, n: Nation): { forts: number; full: number; pay: number } {
  let forts = 0;
  for (const i of ownedLocs(s, n.id)) forts += s.loc.buildings[i * B + BI.fort];
  const full = forts * 2.5 * s.priceLevel * Math.max(0.2, 1 + lawEffect(n, 'fort_cost'));
  const gross = Object.values(n.income).reduce((p, v) => p + Math.max(0, v), 0);
  return { forts, full, pay: Math.min(full, gross * 0.33) };
}
/** A realm's manpower limit and the sailors its coasts give a month (the limit of sailors is four times that): levies
 *  from the peasants and labourers of the land it holds and controls, fewer where control is weak and from land still
 *  being integrated (integrationYield), times its manpower effects; sailors from the labourers of its coasts, more with
 *  harbours. The top bar, its breakdown (src/game/view.ts explainRealm) and the start of the game use this. */
export function manpowerOf(s: GameState, w: World, n: Nation): { max: number; sail: number } {
  let mp = 0, sail = 0;
  for (const i of ownedLocs(s, n.id)) {
    if (s.loc.ctrl[i] !== n.id) continue;
    const base = i * C;
    mp += (s.loc.pop[base + CL.peasants] + s.loc.pop[base + CL.labourers]) * 0.012 * (0.4 + 0.6 * s.loc.control[i]) * integrationYield(s.loc.integ[i]);
    if (w.coastal[i]) sail += s.loc.pop[base + CL.labourers] * 0.02 * (1 + s.loc.buildings[i * B + BI.port]);
  }
  return { max: mp * Math.max(0.1, 1 + lawEffect(n, 'manpower')), sail: sail * Math.max(0.1, 1 + lawEffect(n, 'sailors')) };
}
function upkeepMonth(s: GameState, w: World) {
  const { army, navy } = upkeepCosts(s, w, true);
  for (const n of s.nations) {
    if (!n.alive) continue;
    if (army[n.id] > 0) addExpense(n, 'army', army[n.id]);
    if (navy[n.id] > 0) addExpense(n, 'navy', navy[n.id]);
    // garrisons of forts
    const fp = fortPay(s, n);
    if (fp.forts) { addExpense(n, 'fortresses', fp.pay); n.flags.fort_pay = Math.round((fp.pay / fp.full) * 100) / 100; } else delete n.flags.fort_pay;
    // manpower and sailors refill toward their limits
    const mo = manpowerOf(s, w, n);
    n.maxManpower = mo.max;
    n.manpower = Math.min(n.maxManpower, n.manpower + n.maxManpower / 120);
    n.sailors = Math.min(mo.sail * 4, n.sailors + mo.sail / 10);
    // unpaid armies lose morale and desert
    if (n.treasury < 0) for (const a of s.armies) if (a.owner === n.id) { a.morale *= 0.8; if (a.mercenary) for (const r of a.regs) r.men *= 0.85; }
  }
}

// ---------------- rebels ----------------
const REBEL_NAMES: Record<string, I18n> = {
  peasant: { en: 'Peasant host', de: 'Aufständische Bauern' }, faith: { en: 'Faith zealots', de: 'Glaubenseiferer' },
  separatist: { en: 'Separatists', de: 'Separatisten' }, noble: { en: 'Rebel lords', de: 'Aufständische Herren' },
};
const REBEL_KIND_DE: Record<string, string> = { peasant: 'Bauern', faith: 'Glaubenseiferer', separatist: 'Separatisten', noble: 'Adel' };
function rebelsMonth(s: GameState, w: World) {
  for (let i = 0; i < w.L; i++) {
    const u = s.loc.unrest[i]; const o = s.loc.owner[i];
    if (o < 0 || u < 55) continue;
    if (!chance(s.rng, (u - 50) / 900)) continue;
    if (s.armies.some((a) => a.rebels && w.distKm(a.loc, i) < 200)) continue;
    const n = s.nations[o];
    let pop = 0; for (let c = 0; c < C; c++) pop += s.loc.pop[i * C + c];
    const size = clamp(pop * 0.02, 800, 14000);
    const faithDiff = s.loc.faith[i] !== n.faith, cultDiff = s.loc.culture[i] !== n.culture;
    const faction = faithDiff ? 'faith' : cultDiff ? 'separatist' : s.loc.sol[i * C] < 0.4 ? 'peasant' : 'noble';
    const units = availableUnits(s, n, false);
    const levy = units.find((x) => UNITS[x].id === 'levy') ?? units[0];
    const a = newArmy(s, o, i, [{ type: levy, men: size }], false, REBEL_NAMES[faction]);
    a.owner = o; a.rebels = { faction, demand: faction === 'peasant' ? 'concessions' : faction === 'separatist' ? 'independence' : faction === 'faith' ? 'faith' : 'concessions', target: o };
    s.loc.unrest[i] = 20;
    notice(s, o, 'revolt', { en: `Revolt! ${armyNameText(a, 'en')} rise at ${w.names[i]}.`, de: `Aufstand! ${armyNameText(a, 'de')} erheben sich bei ${w.namesDe[i]}.` }, { loc: i });
    chronicle(s, o, 'revolt', { en: `A ${faction} revolt broke out in ${w.names[i]} (${n.short.en}).`, de: `Ein Aufstand (${REBEL_KIND_DE[faction] ?? faction}) brach in ${w.namesDe[i]} (${n.short.de}) aus.` }, i);
  }
  // rebels that hold enough land enforce their demands
  for (const a of s.armies.filter((x) => x.rebels)) {
    const t = a.rebels!.target; const n = s.nations[t];
    let held = 0; for (let i = 0; i < w.L; i++) if (s.loc.ctrl[i] === -2 && s.loc.owner[i] === t) held++;
    if (n && held >= 3) enforceRebels(s, w, n, a, held);
  }
}
function enforceRebels(s: GameState, w: World, n: Nation, a: Army, held: number) {
  const f = a.rebels!.faction;
  const locs: number[] = []; for (let i = 0; i < w.L; i++) if (s.loc.ctrl[i] === -2 && s.loc.owner[i] === n.id) locs.push(i);
  if (f === 'separatist' && locs.length >= 3) {
    // break away as a new nation
    const nn = releaseNation(s, w, n, locs, s.loc.culture[locs[0]], landFaith(s, locs));
    chronicle(s, nn.id, 'independence', { en: `Rebels in ${w.names[locs[0]]} broke away from ${n.short.en} and founded ${nn.short.en}.`, de: `Rebellen bei ${w.namesDe[locs[0]]} sagten sich von ${n.short.de} los und gründeten ${nn.short.de}.` }, locs[0]);
  } else {
    for (const l of locs) s.loc.ctrl[l] = n.id as any;
    if (f === 'peasant') { n.taxRate = n.taxRate.map((t) => t * 0.8); n.modifiers.push({ id: 'peasant_concessions', until: s.day + 365 * 5, label: { en: 'Concessions to the commons', de: 'Zugeständnisse an die Gemeinen' }, effects: { unrest: -6, tax: -0.05 } }); }
    else if (f === 'noble') { const e = n.estates.find((x) => x.id === 'magnates'); if (e) { e.influence += 15; e.contentment = 70; } n.authority = Math.max(0, n.authority - 80); }
    else if (f === 'faith') { n.laws.tolerance = Math.min(3, (n.laws.tolerance ?? 1) + 1); }
    n.concord = clamp(n.concord - 20, -100, 100);
    notice(s, n.id, 'rebels_win', { en: `The rebels have forced the crown to yield.`, de: `Die Rebellen haben die Krone zum Nachgeben gezwungen.` });
    chronicle(s, n.id, 'revolt', { en: `Rebels forced concessions from ${n.short.en}.`, de: `Rebellen erzwangen Zugeständnisse von ${n.short.de}.` });
  }
  removeArmy(s, a);
  s.flags.ownershipDirty = s.day;
}

/** The faith most of these places hold (weighted by development), if it holds more than half of them; else -1.
 *  A people that wins its own realm keeps its own faith (see the release of land in a peace, separatist rebels and the
 *  khanates that break from a horde). */
export function landFaith(s: GameState, locs: readonly number[]): number {
  const by = new Map<number, number>(); let tot = 0;
  for (const l of locs) { const d = Math.max(1, s.loc.dev[l]); tot += d; by.set(s.loc.faith[l], (by.get(s.loc.faith[l]) ?? 0) + d); }
  let best = -1, bv = 0;
  for (const [f, v] of by) if (v > bv || (v === bv && f < best)) { bv = v; best = f; }
  return bv > tot * 0.5 ? best : -1;
}
/** The faith of a khanate that breaks from a horde: the horde's own, unless its new lands mostly keep the old faiths of
 *  the steppe and the forest; then the khan returns to the steppe faith (Tengri), which may embrace theirs beside it. */
export function khanFaith(s: GameState, from: Nation, locs: readonly number[]): number {
  const lf = landFaith(s, locs);
  return lf >= 0 && lf !== from.faith && FAITHS[lf]?.family === 'traditional' ? FAITH_INDEX.tengri : from.faith;
}
/** A realm released from `from` on the land `locs`, of the people `culture`; `faith` (when given and not -1) is the
 *  new realm's own faith, set before its arms are drawn (a people set free keeps its faith: landFaith, khanFaith);
 *  otherwise it keeps the faith of the realm it came from. */
export function releaseNation(s: GameState, w: World, from: Nation, locs: number[], culture: number, faith = -1): Nation {
  // reuse a dead nation with a capital among these locations if possible
  let nn = s.nations.find((x) => !x.alive && locs.includes(x.capital));
  if (!nn) {
    const id = s.nations.length;
    const nm = w.names[locs[0]], nmDe = w.namesDe?.[locs[0]] ?? nm;
    const hue = hash01(id, 5);
    const col: [number, number, number] = [Math.floor(80 + hue * 150), Math.floor(80 + hash01(id, 6) * 150), Math.floor(80 + hash01(id, 7) * 150)];
    nn = JSON.parse(JSON.stringify({ ...from, loans: [], history: [], modifiers: [], wars: [] }));
    Object.assign(nn!, {
      id, key: `released_${id}`, name: { en: `${nm}`, de: `${nmDe}` }, short: { en: nm, de: nmDe }, adj: { en: nm, de: nmDe }, color: col, color2: col.map((v) => v - 50),
      rank: 'duchy', culture, capital: locs[0], treasury: 50, debt: 0, manpower: 1000, overlord: -1, subjectType: null, rivals: [from.id], dread: 0, isHRE: false, elector: false,
      playerId: null, ai: true, stats: { battlesWon: 0, battlesLost: 0, locsGained: 0, locsLost: 0, warsWon: 0 }, goalsDone: [], flags: {}, coa: null, alive: true,
      candidates: [], generals: [], aiLog: [],
      income: {}, expense: {}, incomeAcc: {}, expenseAcc: {}, credit: {}, creditAcc: {}, // a new realm starts with books of its own
    });
    s.nations.push(nn!);
    nn!.ruler = 0;
  }
  if (!nn!.alive) { forgetTrade(s, nn!.id); nn!.incomeAcc = {}; nn!.expenseAcc = {}; nn!.creditAcc = {}; } // a realm brought back starts without its old merchants, embargoes and books
  if (faith >= 0) nn!.faith = faith;
  // a ruler of the land's own people and a house of its nobility, arms of its own (content/names.ts, heraldry.ts)
  if (!s.chars[nn!.ruler]?.alive || s.chars[nn!.ruler]?.nation !== nn!.id) releasedRuler(s, nn!, culture);
  if (!nn!.coa) nn!.coa = genCoa(nn!.id * 7919 + s.seed, GROUP_OF[ALL_CULTURES[culture]] ?? 'other', FAITHS[nn!.faith]?.family === 'muslim', w.names[locs[0]]);
  nn!.alive = true;
  for (const l of locs) { s.loc.owner[l] = nn!.id; s.loc.ctrl[l] = nn!.id; s.loc.core[l] = nn!.id; }
  s.flags.ownershipDirty = s.day; bump();
  return nn!;
}

// ---------------- generals ----------------
/** The ablest free commander takes the army (commanders.ts appointBest): a fine general among the ruler, heir, kin,
 *  nobles at court and the realm's generals, else a new lord of the levy of the realm's own people. */
export function appointGeneral(s: GameState, n: Nation, a: Army): number { return appointBest(s, n, a); }
/** The first ruler of a realm the game creates: a grown lord of the land's people, of one of its noble houses. */
function releasedRuler(s: GameState, nn: Nation, culture: number) {
  const p = personName(s.rng, culture, false);
  const given = p.name.replace(p.dynasty, '').trim() || p.name;
  const r = { id: newId(s), name: given, dynasty: p.dynasty || w0name(nn), female: false, born: s.day - Math.floor((28 + rand(s.rng) * 20) * 365), skills: [1 + Math.floor(rand(s.rng) * 4), 1 + Math.floor(rand(s.rng) * 4), 1 + Math.floor(rand(s.rng) * 4)] as [number, number, number], traits: chance(s.rng, 0.5) ? ['ambitious'] : [], nation: nn.id, alive: true, children: [], health: 1, role: 'ruler' as const };
  s.chars[r.id] = r; nn.ruler = r.id; nn.heir = 0; nn.consort = 0; nn.regent = 0; nn.council = {}; nn.dynasty = r.dynasty;
}
const w0name = (nn: Nation) => nn.short.en;

export const military: System = {
  id: 'military',
  init(s, w) {
    // starting armies: proportional to population & government
    for (const n of s.nations) {
      if (!n.alive || n.capital < 0) continue;
      let pop = 0, locs = 0;
      for (let i = 0; i < w.L; i++) if (s.loc.owner[i] === n.id) { locs++; for (let c = 0; c < C; c++) pop += s.loc.pop[i * C + c]; }
      n.maxManpower = pop * 0.012; n.manpower = n.maxManpower * 0.6;
      n.sailors = 500;
      const size = clamp(pop * 0.0025, 500, 30000);
      const units = availableUnits(s, n, false);
      const pickU = (id: string, fb: number) => (units.includes(UNITS.findIndex((u) => u.id === id)) ? UNITS.findIndex((u) => u.id === id) : fb);
      const levy = pickU('levy', units[0]);
      const maa = pickU('men_at_arms', levy);
      const rng = pickU('longbowmen', pickU('crossbowmen', pickU('horse_archers', maa)));
      const cav = pickU('horse_archers', pickU('knights', maa));
      const nomad = n.gov === 'nomadic_horde';
      const regs = nomad ? [{ type: cav, men: size * 0.8 }, { type: levy, men: size * 0.2 }] : [{ type: levy, men: size * 0.45 }, { type: maa, men: size * 0.25 }, { type: rng, men: size * 0.15 }, { type: cav, men: size * 0.15 }];
      const a = newArmy(s, n.id, n.capital, regs.filter((r) => r.men > 0));
      appointGeneral(s, n, a);
      if (w.coastal[n.capital] && (n.gov === 'merchant_republic' || pop > 2e6)) {
        const sea = seaNear(w, n.capital);
        const ships = availableUnits(s, n, true);
        if (sea >= 0 && ships.length) newArmy(s, n.id, sea, [{ type: ships.includes(UNITS.findIndex((u) => u.id === 'galley')) && w.lat[n.capital] < 46 ? UNITS.findIndex((u) => u.id === 'galley') : ships[0], men: n.gov === 'merchant_republic' ? 20 : 8 }], true);
      }
    }
    computeFortZones(s, w);
    refreshFleetOwners(s);
  },
  daily({ s, w }) {
    refreshFleetOwners(s);
    for (const a of s.armies.slice()) armyDay(s, w, a);
    startBattles(s, w);
    for (const b of s.battles.slice()) battleDay(s, w, b);
    siegesDay(s, w);
    recruitsDay(s, w);
    // drop empty armies
    for (const a of s.armies.slice()) if (!a.battle && armyMen(a) < 1 && !(a.fleet && a.carrying.length)) removeArmy(s, a);
    if (s.flags.ownershipDirty === s.day || s.day % 10 === 0) computeFortZones(s, w);
  },
  monthly({ s, w }) {
    attritionMonth(s, w);
    reinforceMonth(s, w);
    blockadeMonth(s, w);
    upkeepMonth(s, w);
    rebelsMonth(s, w);
    // generals for armies without one
    for (const a of s.armies) if ((!a.general || !s.chars[a.general]?.alive) && !a.rebels && !a.fleet && armyMen(a) > 3000 && s.nations[a.owner]) appointGeneral(s, s.nations[a.owner], a);
  },
};
