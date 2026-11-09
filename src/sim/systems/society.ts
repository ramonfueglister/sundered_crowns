// Control & integration of land, conversion and assimilation, plague, climate (seasons & snow).
import type { GameState, Nation } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice } from '../ctx';
import { B, BI, C } from '../defs';
import { MinHeap } from '../setup';
import { lawEffect, councilBonus } from './politics';
import { computeAdmin, capacityShare } from './administration';
import { overextension } from './economy';
import { ownedLocs } from './war';
import { GROUP_OF, ALL_CULTURES, faithFamily, FAITHS } from '../content/peoples';
import { chance } from '../rng';

// ---------------- control ----------------
/** Distance-based control from the capital and administrative seats (roads extend reach). */
let DIST: Float64Array | null = null; let STAMP: Int32Array | null = null; let DONE: Int32Array | null = null; let STAMPV = 0;
let CHEAP: MinHeap | null = null; // created on first use (setup.ts imports the systems)
export function computeControl(s: GameState, w: World, n: Nation) {
  const L = w.L, N = w.N;
  if (!DIST || DIST.length !== N) { DIST = new Float64Array(N); STAMP = new Int32Array(N); DONE = new Int32Array(N); }
  const dist = DIST, stamp = STAMP!, done = DONE!; const sv = ++STAMPV;
  const own = ownedLocs(s, n.id);
  if (!own.length) return;
  const heap = (CHEAP ??= new MinHeap()); heap.clear();
  const srcs = own.filter((i) => i === n.capital || s.loc.buildings[i * B + BI.admin] > 0);
  if (!srcs.length) srcs.push(own[0]);
  for (const i of srcs) { const d0 = i === n.capital ? 0 : 60; stamp[i] = sv; dist[i] = d0; heap.push(d0, i); }
  const reach = controlReach(n);
  // beyond 0.88/0.75 of the reach the target is at its 0.12 floor, the same as for land the search never
  // reaches, so it can stop there (distances inside the limit are unaffected)
  const lim = reach * 1.18;
  const owner = s.loc.owner, bld = s.loc.buildings, rough = w.rough, adjS = w.adjStart, adj = w.adj, adjKm = w.adjKm;
  // only the realm's own land is read afterwards: once all of it is settled (popped at its final distance) nothing
  // further can lower those distances, so the search ends there
  let left = own.length;
  while (heap.size) {
    const d = heap.peekKey(); const u = heap.popVal();
    if (d > (stamp[u] === sv ? dist[u] : Infinity) || d > lim) continue;
    if (u < L && owner[u] === n.id && done[u] !== sv) { done[u] = sv; if (--left === 0) break; }
    for (let e = adjS[u]; e < adjS[u + 1]; e++) {
      const v = adj[e];
      let cost = adjKm[e];
      if (v >= L) cost *= 1.6;
      else {
        if (owner[v] !== n.id) cost *= 1.8;
        cost /= 1 + bld[v * B + BI.road] * 0.25;
        cost *= 1 + rough[v] * 0.0004;
      }
      const nd = d + cost;
      if (nd < (stamp[v] === sv ? dist[v] : Infinity) && nd <= lim) { stamp[v] = sv; dist[v] = nd; heap.push(nd, v); }
    }
  }
  const far = reach * 2;
  const strain = 1 - overextControl(n); // an over-extended administration loses its grip everywhere
  for (const i of own) {
    const d = stamp[i] === sv ? dist[i] : far;
    const target = clamp(1 - d / reach * 0.75, 0.12, 1) * (s.loc.ctrl[i] === n.id ? 1 : 0.4) * strain;
    s.loc.control[i] += (target - s.loc.control[i]) * 0.25;
  }
}

/** How far the capital and seats of administration project control (km): administration and control effects, Governance. */
export function controlReach(n: Nation) { return 520 * Math.max(0.2, 1 + lawEffect(n, 'admin') + lawEffect(n, 'control') + n.tech[0] * 0.015); }
/** Share of control an over-extended realm loses everywhere (at most 30 %). */
export function overextControl(n: Nation) { return Math.min(0.3, overextension(n) * 0.15); }

// ---------------- integration ----------------
function integrationMonth(s: GameState, w: World) {
  const o = s.loc.owner;
  computeAdmin(s, w); // load and capacity of every realm, shared out below
  for (let i = 0; i < w.L; i++) {
    const own = o[i]; if (own < 0) continue;
    const n = s.nations[own];
    if (s.loc.integ[i] >= 1) { if (s.loc.core[i] !== own) s.loc.core[i] = own; continue; }
    const sameC = s.loc.culture[i] === n.culture ? 1.5 : GROUP_OF[ALL_CULTURES[s.loc.culture[i]]] === GROUP_OF[ALL_CULTURES[n.culture]] ? 1.15 : 0.8;
    const sameF = s.loc.faith[i] === n.faith ? 1 : faithFamily(s.loc.faith[i]) === faithFamily(n.faith) ? 0.75 : 0.5;
    // the administration's capacity is shared out over all land being integrated at once
    const rate = 1 / 120 * s.loc.control[i] * sameC * sameF * Math.max(0, 1 + lawEffect(n, 'integration')) * capacityShare(n);
    s.loc.integ[i] = Math.min(1, s.loc.integ[i] + rate);
    if (s.loc.core[i] >= 0 && s.loc.core[i] !== own && !s.nations[s.loc.core[i]]?.alive && s.loc.integ[i] > 0.5) s.loc.core[i] = own;
  }
}

// ---------------- conversion & assimilation ----------------
export function agentSlots(n: Nation) { return 1 + Math.floor(n.tech[0] / 8) + (lawEffect(n, 'agents') | 0); }
export function startAgent(s: GameState, w: World, n: Nation, loc: number, kind: 'faith' | 'culture'): string | null {
  if (loc < 0 || loc >= w.L || s.loc.owner[loc] !== n.id) return 'not your location';
  if (kind === 'faith' && s.loc.faith[loc] === n.faith) return 'already of our faith';
  if (kind === 'culture' && s.loc.culture[loc] === n.culture) return 'already of our culture';
  if (s.agents.some((a) => a.loc === loc && a.kind === kind)) return 'already working there';
  if (s.agents.filter((a) => a.nation === n.id).length >= agentSlots(n)) return 'no free preachers or officials';
  const cost = 15 * s.priceLevel * (1 + s.loc.dev[loc] / 20);
  if (n.treasury < cost) return 'not enough gold';
  n.treasury -= cost; n.expenseAcc.agents = (n.expenseAcc.agents || 0) + cost;
  s.agents.push({ nation: n.id, loc, kind, progress: 0 });
  return null;
}
function agentsMonth(s: GameState, w: World) {
  for (const a of s.agents.slice()) {
    const n = s.nations[a.nation];
    if (!n?.alive || s.loc.owner[a.loc] !== a.nation) { s.agents.splice(s.agents.indexOf(a), 1); continue; }
    const dev = s.loc.dev[a.loc];
    let rate = 100 / (18 + dev * 0.4) * s.loc.control[a.loc];
    if (a.kind === 'faith') {
      rate *= Math.max(0.1, 1 + councilBonus(s, n, 'chaplain') * 3 + lawEffect(n, 'conversion'));
      const fam = faithFamily(s.loc.faith[a.loc]) === faithFamily(n.faith);
      rate *= fam ? 1.2 : 0.7;
    } else rate *= 0.6 * (GROUP_OF[ALL_CULTURES[s.loc.culture[a.loc]]] === GROUP_OF[ALL_CULTURES[n.culture]] ? 1.6 : 1) * (1 + lawEffect(n, 'assimilation'));
    a.progress += rate;
    s.loc.unrest[a.loc] = Math.min(100, s.loc.unrest[a.loc] + (a.kind === 'faith' ? 1.2 : 0.6) * (1 - lawEffect(n, 'tolerance')));
    if (a.progress >= 100) {
      s.agents.splice(s.agents.indexOf(a), 1);
      if (a.kind === 'faith') { s.loc.minFaith[a.loc] = s.loc.faith[a.loc]; s.loc.faith[a.loc] = n.faith; }
      else { s.loc.minCulture[a.loc] = s.loc.culture[a.loc]; s.loc.culture[a.loc] = n.culture; }
      s.loc.minShare[a.loc] = 0.15;
      if (s.playerNations.includes(n.id)) notice(s, n.id, 'converted', { en: `${w.names[a.loc]} has adopted our ${a.kind === 'faith' ? 'faith' : 'culture'}.`, de: `${w.namesDe[a.loc]} hat unseren ${a.kind === 'faith' ? 'Glauben' : 'Kultur'} angenommen.` }, { loc: a.loc });
    }
  }
}
function assimilationYear(s: GameState, w: World) {
  for (let i = 0; i < w.L; i++) {
    const own = s.loc.owner[i]; if (own < 0) continue;
    const n = s.nations[own];
    // minorities shrink slowly where tolerated, quickly where persecuted
    if (s.loc.minShare[i] > 0) s.loc.minShare[i] = Math.max(0, s.loc.minShare[i] - 0.004 - Math.max(0, -lawEffect(n, 'tolerance')) * 0.02);
    // long integrated land of a sister culture slowly takes the ruling culture
    if (s.loc.culture[i] !== n.culture && s.loc.integ[i] >= 1 && GROUP_OF[ALL_CULTURES[s.loc.culture[i]]] === GROUP_OF[ALL_CULTURES[n.culture]]) {
      if (((i * 7919 + s.day) >>> 0) % 1000 < 3 * s.loc.control[i]) { s.loc.minCulture[i] = s.loc.culture[i]; s.loc.minShare[i] = 0.3; s.loc.culture[i] = n.culture; }
    }
  }
}

// ---------------- plague ----------------
// s.loc.plague[i] > 0: an outbreak of that intensity (0..1) is raging. < 0: the place was struck recently and its
// survivors resist the next wave; the value climbs back to 0 over PLAGUE_IMMUNE_MONTHS and the place grows
// susceptible again, so waves return every 10–15 years. Waves travel along roads, along coasts by ship and between
// the hubs of linked markets with the merchants; they die out where everyone has had it.
const PLAGUE_DECAY = 0.1; // intensity a local outbreak loses per month (≈ 5–9 months)
const PLAGUE_IMMUNE_MONTHS = 12 * 11;
const PLAGUE_PORT_CHANCE = 0.06; // per month and draw (two draws among the market hubs), for a port long spared
export function seedPlague(s: GameState, w: World, loc: number, intensity = 0.8) {
  if (loc < 0 || loc >= w.L) return;
  s.loc.plague[loc] = Math.max(s.loc.plague[loc], intensity);
}
/** Deterministic uniform [0,1) from three integers (target, source/salt, day). */
function plagueHash(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x7f4a7c15) | 0, 0xc2b2ae35) ^ Math.imul(c | 0, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** 0..1: how readily a place takes the sickness (1 = never struck, or long ago). */
export function plagueSusceptibility(s: GameState, i: number) { const p = s.loc.plague[i]; return p >= 0 ? 1 : (1 + p) * (1 + p); }
/** How hard an outbreak strikes a place: crowded towns and ports worst. */
function plagueCap(s: GameState, w: World, i: number) { return Math.min(0.95, 0.42 + 0.4 * Math.min(1, s.loc.dev[i] / 22) + (w.coastal[i] ? 0.08 : 0)); }
/** Spreading force of an outbreak of intensity p (weak sporadic cases barely travel). */
const plagueForce = (p: number) => clamp((p - 0.22) / 0.45, 0, 1.4);
export function plagueMonth(s: GameState, w: World, month: number) {
  const P = s.loc.plague, L = w.L, dev = s.loc.dev, day = s.day;
  const season = month >= 4 && month <= 9 ? 1 : month === 3 || month === 10 ? 0.6 : 0.3; // fleas need warmth
  const add: number[] = []; // pairs (target, intensity)
  const tryInfect = (v: number, src: number, p: number, prob: number, salt: number) => {
    if (P[v] > 0.02) return;
    const sus = P[v] >= 0 ? 1 : (1 + P[v]) * (1 + P[v]);
    if (sus <= 0.01 || plagueHash(v, src * 8 + salt, day) >= prob * sus) return;
    add.push(v, Math.min(plagueCap(s, w, v), p + 0.15) * (0.55 + 0.45 * sus));
  };
  for (let i = 0; i < L; i++) {
    const p = P[i];
    if (p <= 0.02) { P[i] = p < 0 ? Math.min(0, p + 1 / PLAGUE_IMMUNE_MONTHS) : 0; continue; }
    const f = plagueForce(p) * season;
    if (f > 0) {
      const portI = w.coastal[i] ? Math.min(1.5, 0.25 + dev[i] / 18) : 0;
      for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) {
        const v = w.adj[e];
        if (v < L) { tryInfect(v, i, p, 0.8 * f * (0.6 + Math.min(1, dev[v] / 18)), 0); continue; }
        if (!portI) continue;
        // ships carry it to the ports of this sea zone and, from greater ports, of the neighbouring zones
        for (let e2 = w.adjStart[v]; e2 < w.adjStart[v + 1]; e2++) {
          const u = w.adj[e2];
          if (u < L) { if (u !== i && w.coastal[u]) tryInfect(u, i, p, 0.09 * f * portI * Math.min(1.5, 0.15 + dev[u] / 18), 1); continue; }
          if (portI < 0.7) continue;
          for (let e3 = w.adjStart[u]; e3 < w.adjStart[u + 1]; e3++) {
            const x = w.adj[e3];
            if (x < L && x !== i && w.coastal[x] && dev[x] > 8) tryInfect(x, i, p, 0.035 * f * portI * Math.min(1.5, dev[x] / 18), 2);
          }
        }
      }
    }
    // the outbreak burns out; the survivors keep their resistance for about a decade
    P[i] = p - PLAGUE_DECAY > 0.02 ? p - PLAGUE_DECAY : -1;
  }
  // merchants carry it between the hubs of linked markets
  for (const m of s.markets) {
    const p = P[m.hub]; if (p <= 0.3) continue;
    const f = plagueForce(p) * season;
    for (const lk of m.links) if (!lk.ocean) tryInfect(s.markets[lk.to].hub, m.hub, p, (lk.sea ? 0.3 : 0.2) * f, 3);
  }
  for (let k = 0; k < add.length; k += 2) { const v = add[k]; if (P[v] <= 0.02 && add[k + 1] > P[v]) P[v] = add[k + 1]; }
}

/** Resistance at the start: in 1356 the survivors of the great mortality of 1347–51 are still largely spared for a
 *  few years (the next wave is due around 1361); in later starts the last wave lies a varying number of years back. */
function plagueInit(s: GameState, w: World) {
  if (s.startYear >= 1720) return;
  const P = s.loc.plague;
  for (let i = 0; i < w.L; i++) {
    if (P[i] !== 0) continue;
    const h = plagueHash(i, s.startYear, 0x1347);
    P[i] = s.startYear < 1360 ? -(0.52 + 0.16 * h) : -0.85 * h;
  }
}
/** Sporadic outbreaks in great ports until the plague retreats from Europe: ships bring it from the Levant and the
 *  Black Sea, and where a town has long been spared it may start a new wave. */
export function plaguePorts(s: GameState, w: World, y: number) {
  if (y >= 1720) return;
  const ms = s.markets; if (!ms.length) return;
  for (let k = 0; k < 2; k++) {
    const i = ms[Math.floor(plagueHash(s.day, k, 0x5eed) * ms.length)].hub;
    // (Old World only: the sickness cannot cross the ocean before the ships do)
    if (w.coastal[i] && w.lon[i] > -30 && plagueSusceptibility(s, i) > 0.5 && chance(s.rng, PLAGUE_PORT_CHANCE)) seedPlague(s, w, i, 0.6);
  }
}

// ---------------- climate: seasons and snow ----------------
export function monthTemp(w: World, i: number, m: number): number {
  const lat = w.lat[i], lon = w.lon[i];
  const amp = clamp(7 + (Math.abs(lat) - 30) * 0.28 + Math.max(0, lon - 12) * 0.13 - (w.coastal[i] ? 3 : 0), 3, 22);
  const phase = Math.cos(((m - 6.5) / 12) * Math.PI * 2); // +1 mid-July
  return w.temp[i] + amp * phase * (lat < 0 ? -1 : 1);
}
function climateMonth(s: GameState, w: World, m: number) {
  const cold = s.flags.little_ice_age ? s.flags.little_ice_age / 100 : 0; // situation-driven cooling in °C
  for (let i = 0; i < w.L; i++) {
    const t = monthTemp(w, i, m) - cold;
    s.loc.snow[i] = clamp(-t / 7 + (w.elev[i] > 1200 ? 0.3 : 0), 0, 1);
  }
}

export const society: System = {
  id: 'society',
  init(s, w) {
    for (const n of s.nations) if (n.alive) computeControl(s, w, n);
    for (let i = 0; i < w.L; i++) if (s.loc.owner[i] >= 0) s.loc.control[i] = Math.max(s.loc.control[i], 0.2);
    climateMonth(s, w, 0);
    plagueInit(s, w);
  },
  monthly({ s, w, date }) {
    // control for a third of the realms each month (all of them if borders changed recently)
    const all = (s.flags.ownershipDirty ?? -999) > s.day - 31;
    for (const n of s.nations) if (n.alive && (all || (n.id + date.m) % 3 === 0)) computeControl(s, w, n);
    integrationMonth(s, w);
    agentsMonth(s, w);
    plagueMonth(s, w, date.m);
    climateMonth(s, w, date.m);
    plaguePorts(s, w, date.y);
  },
  yearly({ s, w }) { assimilationYear(s, w); },
};
void chronicle; void FAITHS; void C;
