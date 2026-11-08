// Control & integration of land, conversion and assimilation, plague, climate (seasons & snow).
import type { GameState, Nation } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice, mod } from '../ctx';
import { B, BI, C } from '../defs';
import { MinHeap } from '../setup';
import { lawEffect, councilBonus } from './politics';
import { GROUP_OF, ALL_CULTURES, faithFamily, FAITHS } from '../content/peoples';
import { chance } from '../rng';

// ---------------- control ----------------
/** Distance-based control from the capital and administrative seats (roads extend reach). */
export function computeControl(s: GameState, w: World, n: Nation) {
  const L = w.L;
  const own: number[] = [];
  for (let i = 0; i < L; i++) if (s.loc.owner[i] === n.id) own.push(i);
  if (!own.length) return;
  const dist = new Map<number, number>();
  const heap = new MinHeap();
  const srcs = own.filter((i) => i === n.capital || s.loc.buildings[i * B + BI.admin] > 0);
  if (!srcs.length) srcs.push(own[0]);
  for (const i of srcs) { dist.set(i, i === n.capital ? 0 : 60); heap.push(dist.get(i)!, i); }
  const reach = 520 * (1 + lawEffect(n, 'admin') + mod(n, 'control') + n.tech[0] * 0.015);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > (dist.get(u) ?? Infinity)) continue;
    if (d > reach * 1.6) continue;
    for (let e = w.adjStart[u]; e < w.adjStart[u + 1]; e++) {
      const v = w.adj[e];
      let cost = w.adjKm[e];
      if (v >= L) cost *= 1.6; // across the sea: harder to govern
      else {
        if (s.loc.owner[v] !== n.id) cost *= 1.8; // through foreign land
        cost /= 1 + s.loc.buildings[v * B + BI.road] * 0.25;
        cost *= 1 + w.rough[v] * 0.0004;
      }
      const nd = d + cost;
      if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); heap.push(nd, v); }
    }
  }
  for (const i of own) {
    const d = dist.get(i) ?? reach * 2;
    const target = clamp(1 - d / reach * 0.75, 0.12, 1) * (s.loc.ctrl[i] === n.id ? 1 : 0.4);
    s.loc.control[i] += (target - s.loc.control[i]) * 0.25;
  }
}

// ---------------- integration ----------------
function integrationMonth(s: GameState, w: World) {
  const o = s.loc.owner;
  for (let i = 0; i < w.L; i++) {
    const own = o[i]; if (own < 0) continue;
    const n = s.nations[own];
    if (s.loc.integ[i] >= 1) { if (s.loc.core[i] !== own) s.loc.core[i] = own; continue; }
    const sameC = s.loc.culture[i] === n.culture ? 1.5 : GROUP_OF[ALL_CULTURES[s.loc.culture[i]]] === GROUP_OF[ALL_CULTURES[n.culture]] ? 1.15 : 0.8;
    const sameF = s.loc.faith[i] === n.faith ? 1 : faithFamily(s.loc.faith[i]) === faithFamily(n.faith) ? 0.75 : 0.5;
    const rate = 1 / 120 * s.loc.control[i] * sameC * sameF * (1 + lawEffect(n, 'integration'));
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
      rate *= 1 + councilBonus(s, n, 'chaplain') * 3 + lawEffect(n, 'conversion') + mod(n, 'conversion');
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
      if (s.playerNations.includes(n.id)) notice(s, n.id, 'converted', { en: `${w.names[a.loc]} has adopted our ${a.kind === 'faith' ? 'faith' : 'culture'}.`, de: `${w.names[a.loc]} hat unseren ${a.kind === 'faith' ? 'Glauben' : 'Kultur'} angenommen.` }, { loc: a.loc });
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
export function seedPlague(s: GameState, w: World, loc: number, intensity = 0.8) {
  if (loc < 0 || loc >= w.L) return;
  s.loc.plague[loc] = Math.max(s.loc.plague[loc], intensity);
}
function plagueMonth(s: GameState, w: World, month: number) {
  const P = s.loc.plague; const add: [number, number][] = [];
  const summer = month >= 4 && month <= 9 ? 1.4 : 0.6;
  for (let i = 0; i < w.L; i++) {
    const p = P[i]; if (p <= 0.01) { P[i] = 0; continue; }
    for (let e = w.adjStart[i]; e < w.adjStart[i + 1]; e++) {
      let v = w.adj[e];
      if (v >= w.L) { // ships carry it along the coast
        for (let e2 = w.adjStart[v]; e2 < w.adjStart[v + 1]; e2++) { const u = w.adj[e2]; if (u < w.L && w.coastal[u] && P[u] < 0.05 && ((u * 31 + s.day) % 100) < p * 6 * summer) add.push([u, p * 0.8]); }
        continue;
      }
      if (P[v] > 0.05) continue;
      const density = Math.min(2, s.loc.dev[v] / 15);
      if (((v * 131 + i * 7 + s.day) % 1000) < p * 220 * summer * (0.3 + density)) add.push([v, p * 0.9]);
    }
    P[i] = Math.max(0, p - 0.18);
  }
  for (const [v, p] of add) if (P[v] < 0.05) P[v] = Math.min(1, p);
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
  },
  monthly({ s, w, date }) {
    // control for a third of the realms each month (all of them if borders changed recently)
    const all = (s.flags.ownershipDirty ?? -999) > s.day - 31;
    for (const n of s.nations) if (n.alive && (all || (n.id + date.m) % 3 === 0)) computeControl(s, w, n);
    integrationMonth(s, w);
    agentsMonth(s, w);
    plagueMonth(s, w, date.m);
    climateMonth(s, w, date.m);
    // sporadic outbreaks in great ports until the plague retreats from Europe
    if (date.y < 1720) for (let k = 0; k < 2; k++) {
      const i = Math.floor((((s.day * 2654435761) >>> 0) + k * 977) % w.L);
      if (w.coastal[i] && s.loc.dev[i] > 18 && chance(s.rng, 0.02)) seedPlague(s, w, i, 0.6);
    }
  },
  yearly({ s, w }) { assimilationYear(s, w); },
};
void chronicle; void FAITHS; void C;
