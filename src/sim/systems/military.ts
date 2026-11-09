// Armies and fleets: recruitment, movement on the location graph (A*), supply & attrition, zone of control,
// battles in phases over several days, sieges with random events, occupation, naval blockades, transport.
import type { GameState, Army, Battle, Siege, Nation, Regiment, I18n } from '../types';
import type { World } from '../world';
import { EDGE_RIVER, EDGE_STRAIT } from '../world';
import { type Ctx, type System, clamp, chronicle, notice, newId, addExpense, enemiesOf, atWar, hasTreaty, allies, bump } from '../ctx';
import { UNITS, U, TERRAIN_DEF, TERRAINS, B, BI, C, CL, GI } from '../defs';
import { rand, chance, hash01 } from '../rng';
import { dayToDate } from '../calendar';
import { lawEffect, ageOf, characterDies, councilBonus } from './politics';
import { integrationYield } from './economy';
import { MinHeap } from '../setup';
import { warScoreEvent, ownedLocs } from './war';

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
  const k = u.kind === 'ship' ? men : men / 1000;
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
      a.loc = next; a.path.shift(); a.progress = 0; a.lastMoveDay = s.day;
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
export function supplyLimit(s: GameState, w: World, l: number, owner: number): number {
  if (l >= w.L) return 1e9;
  const t = TERRAIN_DEF[TERRAINS[w.terrain[l]]];
  let pop = 0; for (let c = 0; c < C; c++) pop += s.loc.pop[l * C + c];
  let lim = (pop / 6) * t.supply * (1 - s.loc.devast[l]) * (1 - 0.5 * s.loc.snow[l]) * (0.6 + 0.4 * s.loc.harvest[l]);
  if (s.loc.owner[l] === owner) lim *= 1.25;
  if (s.flags[`scorched_${l}`] > s.day) lim *= 0.2;
  return Math.max(800, lim);
}

/** A fleet lying idle in a sea zone next to one of its realm's ports is in harbour: no storms, no wear. */
function dockedAtHome(s: GameState, w: World, a: Army): boolean {
  for (let e = w.adjStart[a.loc]; e < w.adjStart[a.loc + 1]; e++) { const v = w.adj[e]; if (v < w.L && s.loc.owner[v] === a.owner && s.loc.buildings[v * B + BI.port] > 0) return true; }
  return false;
}
export function attritionMonth(s: GameState, w: World) {
  // stack men per location
  const perLoc = new Map<number, number>();
  for (const a of s.armies) if (!a.fleet && !a.embarkedOn) perLoc.set(a.loc * 1000 + a.owner, (perLoc.get(a.loc * 1000 + a.owner) || 0) + armyMen(a));
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
    const men = perLoc.get(a.loc * 1000 + a.owner) || armyMen(a);
    const lim = supplyLimit(s, w, a.loc, a.owner);
    const t = TERRAIN_DEF[TERRAINS[w.terrain[a.loc]]];
    // in peace at home the regiments lie in winter quarters spread over the country: little is lost
    const quartered = s.loc.owner[a.loc] === a.owner && !a.rebels && !s.wars.some((x) => x.att.includes(a.owner) || x.def.includes(a.owner));
    let att = quartered ? 0.001 + t.attrition * 0.002 : 0.002 + t.attrition * 0.01;
    if (men > lim) att += quartered ? Math.min(0.01, (men / lim - 1) * 0.005) : Math.min(0.12, (men / lim - 1) * 0.05);
    att += s.loc.snow[a.loc] * 0.02;
    const n = s.nations[a.owner];
    if (n) att *= Math.max(0, 1 + lawEffect(n, 'attrition'));
    // faiths of the forest and the tundra know their own land (finnic_old, sami_old)
    if (n && s.loc.owner[a.loc] === a.owner) att *= clamp(1 + lawEffect(n, 'home_attrition'), 0.2, 2);
    if (s.loc.owner[a.loc] !== a.owner && atWar(s, a.owner, s.loc.owner[a.loc])) att += 0.005;
    a.supplyDeficit = men > lim ? men / lim - 1 : 0;
    for (const r of a.regs) r.men = Math.max(0, r.men * (1 - att));
    // foraging devastates the land
    if (!quartered && men > lim * 0.5) s.loc.devast[a.loc] = clamp(s.loc.devast[a.loc] + Math.min(0.15, men / lim * 0.03), 0, 1);
    // morale recovers in supply
    a.morale = clamp(a.morale + (a.supplyDeficit > 0 ? 0.03 : 0.12) * maintMorale(s, a), 0, maxMorale(s, a));
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
        log: [], naval: att.fleet, river: riverCrossing(w, att, loc),
      };
      for (const x of [...attSide, ...defSide]) { x.battle = b.id; x.path = []; x.siege = -1; }
      s.battles.push(b);
      if (s.playerNations.includes(att.owner) || s.playerNations.includes(def.owner)) notice(s, s.playerNations.includes(att.owner) ? att.owner : def.owner, 'battle', { en: `Battle of ${w.names[loc]} has begun!`, de: `Die Schlacht bei ${w.namesDe[loc]} hat begonnen!` }, { loc });
    }
  }
}
function riverCrossing(w: World, a: Army, loc: number): boolean { return false; }
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

export function sideStats(s: GameState, w: World, armies: Army[], loc: number, defending: boolean, enemyKinds: number[]) {
  let shock = 0, fire = 0, def = 0, men = 0, morale = 0, cav = 0, inf = 0;
  const n = s.nations[armies[0]?.owner];
  const t = TERRAIN_DEF[TERRAINS[w.terrain[Math.min(loc, w.L - 1)]] ?? 'plains'];
  for (const a of armies) {
    const tm = techMult(s.nations[a.owner], s);
    for (const r of a.regs) {
      const u = UNITS[r.type];
      const k = u.kind === 'ship' ? r.men * 120 : r.men;
      const cavMult = u.kind === 'cav' ? (t.cav * (1 + (n ? lawEffect(n, 'cavalry') : 0))) : 1;
      // ships: naval strength (arsenals, admiralties, seafaring peoples) adds to guns and hulls alike
      const sea = u.sea && n ? 1 + lawEffect(n, 'naval') : 1;
      shock += k * u.shock * tm * cavMult * (1 + (n ? lawEffect(n, 'shock') : 0)); fire += k * u.fire * tm * (1 + (n ? lawEffect(n, 'fire') : 0)) * sea; def += k * u.def * tm * sea;
      men += k; morale += a.morale * k;
      if (u.kind === 'cav') cav += k; else inf += k;
      if (u.sea) { fire += r.men * u.sea.cannons * 8 * tm * sea; def += r.men * u.sea.hull * 3 * sea; }
    }
  }
  const gen = armies.map((a) => s.chars[a.general]).filter((c) => c && c.alive).sort((a, b) => b!.skills[2] - a!.skills[2])[0];
  const genSkill = gen ? gen.skills[2] : 0;
  // on their own land: militias and highlanders hold better when defending (defence); homeland faiths (baltic_old,
  // american_traditional, hussite) add defence and morale whether they attack or defend there
  const home = !!n && loc < w.L && s.loc.owner[loc] === n.id && !armies[0]?.rebels;
  const homeDef = home ? Math.max(0, lawEffect(n!, 'home_defence')) + (defending ? Math.max(0, lawEffect(n!, 'defence')) : 0) : 0;
  const homeMorale = home ? Math.max(0, lawEffect(n!, 'home_morale')) : 0;
  return { shock, fire, def, men, morale: men > 0 ? morale / men : 0, cav, inf, gen: genSkill, terrainDef: (defending ? t.defence : 0) + homeDef, homeMorale };
}

function battleDay(s: GameState, w: World, b: Battle) {
  const A = b.att.map((id) => s.armies.find((x) => x.id === id)!).filter((x) => x && armyMen(x) > 0);
  const D = b.def.map((id) => s.armies.find((x) => x.id === id)!).filter((x) => x && armyMen(x) > 0);
  if (!A.length || !D.length) return endBattle(s, w, b, A.length ? 'att' : 'def');
  b.days++;
  const sa = sideStats(s, w, A, b.loc, false, []), sd = sideStats(s, w, D, b.loc, true, []);
  // phases: 0 ranged (2 days), 1 melee, 2 pursuit
  const phase = b.days <= 2 ? 0 : 1;
  b.phase = phase;
  const ra = 0.85 + rand(s.rng) * 0.3, rd = 0.85 + rand(s.rng) * 0.3;
  const riverPen = b.river ? 0.8 : 1;
  const winterPen = 1 - 0.2 * s.loc.snow[Math.min(b.loc, w.L - 1)];
  const genA = 1 + sa.gen * 0.06, genD = 1 + sd.gen * 0.06;
  let dmgToD: number, dmgToA: number;
  if (b.naval) {
    dmgToD = sa.fire * 0.004 * ra * genA; dmgToA = sd.fire * 0.004 * rd * genD;
  } else if (phase === 0) {
    dmgToD = sa.fire * 0.012 * ra * genA * riverPen; dmgToA = sd.fire * 0.012 * rd * genD;
  } else {
    dmgToD = (sa.shock * 0.02 + sa.fire * 0.006) * ra * genA * riverPen * winterPen; dmgToA = (sd.shock * 0.02 + sd.fire * 0.006) * rd * genD * winterPen;
  }
  dmgToD /= 1 + sd.terrainDef + sd.def / Math.max(1, sd.men) * 0.25;
  dmgToA /= 1 + sa.terrainDef + sa.def / Math.max(1, sa.men) * 0.25; // an attacker's terrainDef is only its homeland defence
  // casualties & morale
  const lossD = Math.min(sd.men, dmgToD) * (b.naval ? 1 / 120 : 1), lossA = Math.min(sa.men, dmgToA) * (b.naval ? 1 / 120 : 1);
  applyLosses(D, lossD); applyLosses(A, lossA);
  b.lossA += lossA; b.lossD += lossD;
  const mA = ((dmgToA / Math.max(1, sa.men)) * 3.2 + 0.03) / (1 + sa.homeMorale), mD = ((dmgToD / Math.max(1, sd.men)) * 3.2 + 0.03) / (1 + sd.homeMorale);
  for (const a of A) a.morale = Math.max(0, a.morale - mA);
  for (const d of D) d.morale = Math.max(0, d.morale - mD);
  const moA = A.reduce((p, x) => p + x.morale, 0) / A.length, moD = D.reduce((p, x) => p + x.morale, 0) / D.length;
  if (b.days === 1) b.log.push(`${sa.men | 0} vs ${sd.men | 0}`);
  if (moA <= 0.05 || moD <= 0.05 || b.days > 12) {
    const winner = moA > moD ? 'att' : 'def';
    // pursuit: cavalry of the winner cuts down the fleeing side
    const win = winner === 'att' ? sa : sd; const lose = winner === 'att' ? D : A;
    const pursuit = Math.min(armyMenList(lose) * 0.3, win.cav * 0.15 + armyMenList(lose) * 0.05);
    applyLosses(lose, pursuit);
    if (winner === 'att') b.lossD += pursuit; else b.lossA += pursuit;
    endBattle(s, w, b, winner);
  }
}
function armyMenList(l: Army[]) { return l.reduce((p, x) => p + armyMen(x), 0); }
function applyLosses(list: Army[], loss: number) {
  const tot = armyMenList(list); if (tot <= 0) return;
  for (const a of list) for (const r of a.regs) r.men = Math.max(0, r.men - loss * r.men / tot);
}

function endBattle(s: GameState, w: World, b: Battle, winner: 'att' | 'def') {
  const W = (winner === 'att' ? b.att : b.def).map((id) => s.armies.find((x) => x.id === id)).filter(Boolean) as Army[];
  const Lz = (winner === 'att' ? b.def : b.att).map((id) => s.armies.find((x) => x.id === id)).filter(Boolean) as Army[];
  for (const a of [...W, ...Lz]) a.battle = 0;
  const wn = winner === 'att' ? b.attNation : b.defNation, ln = winner === 'att' ? b.defNation : b.attNation;
  const lossW = winner === 'att' ? b.lossA : b.lossD, lossL = winner === 'att' ? b.lossD : b.lossA;
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
  // one notice per player realm: won when its own (non-rebel) armies are among the winners
  for (const p of new Set([wn, ln])) if (s.playerNations.includes(p)) notice(s, p, W.some((a) => a.owner === p && !a.rebels) ? 'battle_won' : 'battle_lost', text, { loc: b.loc });
  if (!rebW && !rebL) warScoreEvent(s, wn, ln, 'battle', Math.min(25, 2 + (lossL + 1) / 1500), b.loc);
  s.battles.splice(s.battles.indexOf(b), 1);
  s.flags.lastBattleResult = s.day;
  (s as any).lastBattle = { loc: b.loc, winner: wn, loser: ln, winnerRebels: rebW, loserRebels: rebL, lossW, lossL, days: b.days, naval: b.naval, day: s.day, reasons: battleReasons(s, w, b, winner) };
}
function battleReasons(s: GameState, w: World, b: Battle, winner: string): string[] {
  const r: string[] = [];
  const t = TERRAINS[w.terrain[Math.min(b.loc, w.L - 1)]];
  if (TERRAIN_DEF[t].defence > 0.2) r.push(`terrain:${t}`);
  if (b.river) r.push('river');
  if (s.loc.snow[Math.min(b.loc, w.L - 1)] > 0.3) r.push('winter');
  r.push(b.startA > b.startD * 1.3 ? 'numbers_att' : b.startD > b.startA * 1.3 ? 'numbers_def' : 'even');
  return r;
}
function retreatTarget(s: GameState, w: World, a: Army): number {
  let best = -1, bd = Infinity;
  const n = s.nations[a.owner];
  if (a.fleet) {
    for (let i = 0; i < w.L; i++) if (w.coastal[i] && s.loc.owner[i] === a.owner) { const d = w.distKm(a.loc, i); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  const en = enemiesOf(s, a.owner);
  for (let e = w.adjStart[a.loc]; e < w.adjStart[a.loc + 1]; e++) {
    const v = w.adj[e]; if (v >= w.L) continue;
    if (s.loc.ctrl[v] === a.owner && !s.armies.some((x) => x.loc === v && en.has(x.owner))) return v;
  }
  if (n && n.capital >= 0 && s.loc.ctrl[n.capital] === a.owner) return n.capital;
  for (let i = 0; i < w.L; i++) if (s.loc.ctrl[i] === a.owner) { const d = w.distKm(a.loc, i); if (d < bd) { bd = d; best = i; } }
  return best;
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
      sg = { loc: l, nation: a.owner, progress: 0, days: 0, garrison: (s.loc.garrison[l] || fort * 1000) * (0.4 + 0.6 * (s.nations[s.loc.owner[l]]?.flags.fort_pay ?? 1)), breach: 0, blockade: false, log: [] };
      s.sieges.push(sg);
      a.siege = l;
      if (s.playerNations.includes(ctrl)) notice(s, ctrl, 'siege', { en: `${w.names[l]} is under siege!`, de: `${w.namesDe[l]} wird belagert!` }, { loc: l });
    }
    if (sg.nation !== a.owner && !s.armies.some((x) => x.siege === l && x.owner === sg!.nation)) sg.nation = a.owner;
    a.siege = l;
  }
  for (const sg of s.sieges.slice()) {
    const besiegers = s.armies.filter((a) => a.siege === sg.loc && a.loc === sg.loc && !a.battle && !a.path.length);
    if (!besiegers.length) {
      // a sortie or a relief army is fought before the walls: the siege works stand until the battle is decided
      if (s.battles.some((b) => b.loc === sg.loc)) continue;
      s.sieges.splice(s.sieges.indexOf(sg), 1); continue;
    }
    sg.days++;
    const l = sg.loc;
    const fort = s.loc.buildings[l * B + BI.fort];
    const defN = s.nations[s.loc.ctrl[l]];
    const fortStr = fort * (1 + (defN ? lawEffect(defN, 'fort_strength') : 0)) * (defN ? 1 + (defN.tech[2] - 1) * 0.03 : 1);
    let men = 0, art = 0;
    for (const a of besiegers) for (const r of a.regs) { men += r.men; if (UNITS[r.type].kind === 'art') art += r.men; }
    // blockade: an enemy fleet in an adjacent sea zone
    sg.blockade = w.coastal[l] === 1 && s.armies.some((f) => f.fleet && besiegers.some((b) => b.owner === f.owner || !hostile(s, f, b)) && w.distKm(f.loc, l) < 150 && f.loc >= w.L);
    if (sg.days % 30 === 0) {
      // monthly siege roll: 1d14 + bonuses vs fort level
      const roll = 1 + Math.floor(rand(s.rng) * 14);
      // siege craft of the besiegers (great guns, engineers: the best of the allied camps directs the works) and the
      // weight of numbers against the garrison
      // A realm whose whole host is called to a great siege (siege_focus, set by a situation such as the siege of the
      // City) brings the great guns cast for it: +2 there, and only with artillery in the camp.
      let craft = 0, guns = false;
      for (const a of besiegers) {
        const bes = s.nations[a.owner]; if (!bes || a.rebels) continue;
        craft = Math.max(craft, lawEffect(bes, 'siege') + (art > 0 && bes.flags.siege_focus === l ? 2 : 0));
        if (greatGuns(bes)) guns = true;
      }
      const bonus = (art > 0 ? 2 + Math.min(3, art / 500) : 0) + (sg.blockade ? 2 : 0) + sg.breach + Math.min(3, Math.floor(men / Math.max(1, sg.garrison * 2))) + Math.floor(sg.days / 120) + craft;
      const need = 10 + fortStr * 2;
      if (roll === 14 || roll + bonus >= need) sg.progress += 1;
      if (roll + bonus >= need + 4) { sg.breach = Math.min(3, sg.breach + 1); sg.log.push('breach'); }
      // great guns batter the old high walls (enough artillery for the fort's level, and a realm that casts such guns):
      // each month the breach widens, and once it is wide open the bombardment bleeds the garrison. Bastion fortresses
      // (trace_italienne) do not crumble this way.
      else if (guns && art >= GUNS_PER_FORT * fort && !bastions(defN)) {
        if (sg.breach < 3) { sg.breach++; sg.log.push('breach'); } else sg.garrison = Math.max(300, sg.garrison * 0.9);
      }
      if (roll <= 2) {
        // disease in the camp
        for (const a of besiegers) for (const r of a.regs) r.men *= 0.93;
        sg.log.push('disease');
      }
      if (roll === 3 && !sg.blockade && w.coastal[l]) { sg.progress = Math.max(0, sg.progress - 1); sg.log.push('resupplied'); }
      if (sg.progress >= 4 || (sg.blockade && sg.progress >= 3)) {
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

/** Assault: storm the walls now at heavy cost. */
export function assault(s: GameState, w: World, a: Army): string | null {
  const sg = s.sieges.find((x) => x.loc === a.loc); if (!sg) return 'no siege';
  const men = armyMen(a);
  const fort = s.loc.buildings[a.loc * B + BI.fort];
  const chanceWin = clamp(men / (sg.garrison * (2 + fort)) * 0.35 + sg.breach * 0.15, 0.03, 0.9);
  const loss = Math.min(men * 0.4, sg.garrison * (1.5 + fort * 0.5));
  for (const r of a.regs) r.men = Math.max(0, r.men - loss * r.men / men);
  if (chance(s.rng, chanceWin)) { occupy(s, w, a.loc, a.owner, a); s.sieges.splice(s.sieges.indexOf(sg), 1); return null; }
  sg.garrison *= 0.8;
  a.morale *= 0.6;
  return 'assault repulsed';
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
    if (reg) reg.men += r.men; else target.regs.push({ type: r.type, men: r.men });
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
function upkeepMonth(s: GameState, w: World) {
  const army = new Float64Array(s.nations.length), navy = new Float64Array(s.nations.length);
  // armies consume goods from the market of the location they stand in (or the capital's market for fleets)
  for (const a of s.armies) {
    if (a.rebels || a.hostile) continue;
    const n = s.nations[a.owner]; if (!n) continue;
    const mloc = a.loc < w.L ? a.loc : n.capital >= 0 ? n.capital : 0;
    const m = s.markets[s.loc.market[mloc]];
    for (const r of a.regs) {
      const u = UNITS[r.type];
      const k = u.kind === 'ship' ? r.men : r.men / 1000;
      // (lawEffect holds laws, values, tradition and modifiers alike; ships pay naval_cost instead of army_cost)
      let c = u.upkeep * k * UPKEEP_SCALE * 0.1 * s.priceLevel * (a.mercenary ? 2.2 : 1) * clamp(1 + lawEffect(n, u.kind === 'ship' ? 'naval_cost' : 'army_cost'), 0.3, 2);
      if (m) for (const [gid, q] of u.goods) { const gi = GI[gid]; m.dAcc[gi] += q * k; c += q * k * m.price[gi] * 0.5; }
      if (u.kind === 'ship') navy[a.owner] += c * n.navyMaint; else army[a.owner] += c * n.armyMaint;
    }
  }
  for (const n of s.nations) {
    if (!n.alive) continue;
    if (army[n.id] > 0) addExpense(n, 'army', army[n.id]);
    if (navy[n.id] > 0) addExpense(n, 'navy', navy[n.id]);
    // garrisons of forts
    let forts = 0;
    // manpower: from peasant & labourer population of controlled, integrated land
    let mp = 0, sail = 0;
    for (const i of ownedLocs(s, n.id)) {
      forts += s.loc.buildings[i * B + BI.fort];
      if (s.loc.ctrl[i] !== n.id) continue;
      const base = i * C;
      // land still being integrated sends fewer levies (integrationYield, systems/economy.ts)
      mp += (s.loc.pop[base + CL.peasants] + s.loc.pop[base + CL.labourers]) * 0.012 * (0.4 + 0.6 * s.loc.control[i]) * integrationYield(s.loc.integ[i]);
      if (w.coastal[i]) sail += s.loc.pop[base + CL.labourers] * 0.02 * (1 + s.loc.buildings[i * B + BI.port]);
    }
    sail *= Math.max(0.1, 1 + lawEffect(n, 'sailors'));
    if (forts) {
      // a realm pays its garrisons only what it can bear: beyond a third of its revenue the walls are left to the militia
      const full = forts * 2.5 * s.priceLevel * Math.max(0.2, 1 + lawEffect(n, 'fort_cost'));
      const gross = Object.values(n.income).reduce((p, v) => p + Math.max(0, v), 0);
      const pay = Math.min(full, gross * 0.33);
      addExpense(n, 'fortresses', pay);
      n.flags.fort_pay = Math.round((pay / full) * 100) / 100;
    } else delete n.flags.fort_pay;
    const mpMult = Math.max(0.1, 1 + lawEffect(n, 'manpower'));
    n.maxManpower = mp * mpMult;
    n.manpower = Math.min(n.maxManpower, n.manpower + n.maxManpower / 120);
    n.sailors = Math.min(sail * 4, n.sailors + sail / 10);
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
    const nn = releaseNation(s, w, n, locs, s.loc.culture[locs[0]]);
    const lf = landFaith(s, locs); if (lf >= 0) nn.faith = lf;
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
export function releaseNation(s: GameState, w: World, from: Nation, locs: number[], culture: number): Nation {
  // reuse a dead nation with a capital among these locations if possible
  let nn = s.nations.find((x) => !x.alive && locs.includes(x.capital));
  if (!nn) {
    const id = s.nations.length;
    const nm = w.names[locs[0]];
    const hue = hash01(id, 5);
    const col: [number, number, number] = [Math.floor(80 + hue * 150), Math.floor(80 + hash01(id, 6) * 150), Math.floor(80 + hash01(id, 7) * 150)];
    nn = JSON.parse(JSON.stringify({ ...from, loans: [], history: [], modifiers: [], wars: [] }));
    Object.assign(nn!, {
      id, key: `released_${id}`, name: { en: `${nm}`, de: `${nm}` }, short: { en: nm, de: nm }, adj: { en: nm, de: nm }, color: col, color2: col.map((v) => v - 50),
      rank: 'duchy', culture, capital: locs[0], treasury: 50, debt: 0, manpower: 1000, overlord: -1, subjectType: null, rivals: [from.id], dread: 0, isHRE: false, elector: false,
      playerId: null, ai: true, stats: { battlesWon: 0, battlesLost: 0, locsGained: 0, locsLost: 0, warsWon: 0 }, goalsDone: [], flags: {}, coa: null, alive: true,
    });
    s.nations.push(nn!);
    const r = { id: newId(s), name: 'Lord of ' + nm, dynasty: nm, female: false, born: s.day - 35 * 365, skills: [2, 2, 3] as [number, number, number], traits: ['ambitious'], nation: id, alive: true, children: [], health: 1, role: 'ruler' as const };
    s.chars[r.id] = r; nn!.ruler = r.id; nn!.heir = 0; nn!.consort = 0; nn!.regent = 0; nn!.council = {};
  }
  nn!.alive = true;
  for (const l of locs) { s.loc.owner[l] = nn!.id; s.loc.ctrl[l] = nn!.id; s.loc.core[l] = nn!.id; }
  s.flags.ownershipDirty = s.day; bump();
  return nn!;
}

// ---------------- generals ----------------
export function appointGeneral(s: GameState, n: Nation, a: Army): number {
  const r = s.chars[n.ruler];
  // ruler leads in person if a good general and not already commanding
  const used = new Set(s.armies.filter((x) => x.owner === n.id).map((x) => x.general));
  if (r && r.alive && r.skills[2] >= 4 && !used.has(r.id) && ageOf(s, r) > 16 && ageOf(s, r) < 60) { a.general = r.id; return r.id; }
  const c = { id: newId(s), name: `${['Sir', 'Lord', 'Count', 'Captain'][Math.floor(rand(s.rng) * 4)]} ${['Hugh', 'Bertrand', 'Konrad', 'Pedro', 'Giovanni', 'Jan', 'Mikhail', 'Osman', 'Arnaud', 'Ulrich'][Math.floor(rand(s.rng) * 10)]}`, dynasty: '', female: false, born: s.day - Math.floor((25 + rand(s.rng) * 25) * 365), skills: [1, 1, 1 + Math.floor(rand(s.rng) * 5)] as [number, number, number], traits: chance(s.rng, 0.3) ? [['brave', 'cautious', 'energetic', 'rash'][Math.floor(rand(s.rng) * 4)]] : [], nation: n.id, alive: true, children: [], health: 1, role: 'general' as const };
  s.chars[c.id] = c; a.general = c.id; return c.id;
}

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
    upkeepMonth(s, w);
    rebelsMonth(s, w);
    // generals for armies without one
    for (const a of s.armies) if ((!a.general || !s.chars[a.general]?.alive) && !a.rebels && !a.fleet && armyMen(a) > 3000 && s.nations[a.owner]) appointGeneral(s, s.nations[a.owner], a);
  },
};
