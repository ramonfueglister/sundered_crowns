// Exploration (shared knowledge per cultural sphere) and colonisation of unclaimed land.
import type { GameState, Nation } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice, mod, bump } from '../ctx';
import { C, CL } from '../defs';
import { findPath, armyMen, newArmy, availableUnits } from './military';
import { lawEffect } from './politics';
import { chance, rand } from '../rng';

export function knows(s: GameState, n: Nation, l: number): boolean {
  if (s.flags.revealAll) return true;
  const e = s.explored[n.knows]; return !e || e[l] === 1;
}
function reveal(s: GameState, w: World, n: Nation, center: number, km: number) {
  const e = s.explored[n.knows]; if (!e) return 0;
  let k = 0;
  // cheap radius reveal: BFS limited by distance
  const seen = new Set<number>([center]); const q = [center];
  while (q.length) {
    const u = q.pop()!;
    if (!e[u]) { e[u] = 1; k++; }
    for (let j = w.adjStart[u]; j < w.adjStart[u + 1]; j++) { const v = w.adj[j]; if (!seen.has(v) && w.distKm(center, v) < km) { seen.add(v); q.push(v); } }
  }
  return k;
}

export function colonialRange(n: Nation) { return 300 + n.tech[1] * 70 + lawEffect(n, 'colonial_range') * 1000; }
export function colonySlots(n: Nation) { return n.tech[1] >= 9 ? 1 + Math.floor((n.tech[1] - 9) / 5) + (lawEffect(n, 'colonists') | 0) : 0; }

/** Send a fleet beyond the known world toward a sea zone; it reveals coasts as it sails. */
export function startExplorer(s: GameState, w: World, n: Nation, fleet: number, to: number): string | null {
  const f = s.armies.find((a) => a.id === fleet && a.owner === n.id && a.fleet); if (!f) return 'need a fleet';
  if (n.tech[1] < 6) return 'our navigators lack the knowledge (Commerce 6)';
  if (to < w.L) return 'choose a sea zone';
  // explorers may sail into unknown waters: temporary knowledge override for the pathfinder
  const p = findPath(s, w, f, f.loc, to, 60000); if (!p) return 'no route';
  f.path = p; f.progress = 0; f.mission = 'explore';
  if (!s.explorers.some((x) => x.id === f.id)) s.explorers.push({ id: f.id, nation: n.id, loc: f.loc, path: p, progress: 0, fleet: true, char: f.general });
  return null;
}

export function canColonize(s: GameState, w: World, n: Nation, loc: number): string | null {
  if (loc < 0 || loc >= w.L) return 'not land';
  if (s.loc.owner[loc] >= 0) return 'already claimed';
  if (!knows(s, n, loc)) return 'unknown land';
  if (s.loc.colonist[loc] >= 0) return 'someone is already settling here';
  if (s.colonies.filter((c) => c.nation === n.id).length >= colonySlots(n)) return 'no colonists available';
  // within range of own land (any coastal location or neighbour)
  let near = false;
  for (let e = w.adjStart[loc]; e < w.adjStart[loc + 1] && !near; e++) { const v = w.adj[e]; if (v < w.L && s.loc.owner[v] === n.id) near = true; }
  if (!near) {
    let bd = Infinity;
    for (let i = 0; i < w.L; i++) if (s.loc.owner[i] === n.id && w.coastal[i]) { const d = w.distKm(i, loc); if (d < bd) bd = d; }
    if (bd > colonialRange(n) || !w.coastal[loc]) return 'out of colonial range';
  }
  return null;
}
export function startColony(s: GameState, w: World, n: Nation, loc: number): string | null {
  const e = canColonize(s, w, n, loc); if (e) return e;
  const cost = 40 * s.priceLevel;
  if (n.treasury < cost) return 'not enough gold';
  n.treasury -= cost; n.expenseAcc.colonists = (n.expenseAcc.colonists || 0) + cost;
  s.colonies.push({ loc, nation: n.id, settlers: 200, progress: 0, started: s.day });
  s.loc.colonist[loc] = n.id;
  return null;
}

function coloniesMonth(s: GameState, w: World) {
  for (const c of s.colonies.slice()) {
    const n = s.nations[c.nation];
    if (!n?.alive || s.loc.owner[c.loc] >= 0) { s.colonies.splice(s.colonies.indexOf(c), 1); s.loc.colonist[c.loc] = -1; continue; }
    const upkeep = 3 * s.priceLevel;
    n.treasury -= upkeep; n.expenseAcc.colonists = (n.expenseAcc.colonists || 0) + upkeep;
    let native = 0; for (let k = 0; k < C; k++) native += s.loc.pop[c.loc * C + k];
    c.settlers += 25 * (1 + lawEffect(n, 'colonial_growth') + mod(n, 'colonial_growth'));
    c.progress += 100 / 36 * (1 + lawEffect(n, 'colonial_growth'));
    // natives may resist
    if (native > 2000 && chance(s.rng, Math.min(0.12, native / 200000))) {
      c.settlers *= 0.7; c.progress = Math.max(0, c.progress - 10);
      if (s.playerNations.includes(n.id)) notice(s, n.id, 'natives', { en: `Natives attacked our settlers at ${w.names[c.loc]}.`, de: `Einheimische haben unsere Siedler bei ${w.names[c.loc]} angegriffen.` }, { loc: c.loc });
    }
    if (c.progress >= 100) {
      s.colonies.splice(s.colonies.indexOf(c), 1);
      s.loc.colonist[c.loc] = -1;
      s.loc.owner[c.loc] = n.id; s.loc.ctrl[c.loc] = n.id; s.loc.core[c.loc] = n.id; s.loc.integ[c.loc] = 0.6;
      s.loc.control[c.loc] = 0.3;
      // settlers become the new majority unless natives are many
      const base = c.loc * C;
      s.loc.pop[base + CL.peasants] += c.settlers * 0.7; s.loc.pop[base + CL.artisans] += c.settlers * 0.15; s.loc.pop[base + CL.burghers] += c.settlers * 0.1; s.loc.pop[base + CL.clergy] += c.settlers * 0.05;
      if (c.settlers * 1.5 > native) { s.loc.minCulture[c.loc] = s.loc.culture[c.loc]; s.loc.minFaith[c.loc] = s.loc.faith[c.loc]; s.loc.minShare[c.loc] = clamp(native / (native + c.settlers), 0, 0.9); s.loc.culture[c.loc] = n.culture; s.loc.faith[c.loc] = n.faith; }
      s.flags.ownershipDirty = s.day; bump();
      n.stats.locsGained++;
      chronicle(s, n.id, 'colony', { en: `${n.short.en} founded a settlement at ${w.names[c.loc]}.`, de: `${n.short.de} gründete eine Siedlung bei ${w.names[c.loc]}.` }, c.loc);
      if (s.playerNations.includes(n.id)) notice(s, n.id, 'colony', { en: `Our colony at ${w.names[c.loc]} is established.`, de: `Unsere Kolonie bei ${w.names[c.loc]} ist gegründet.` }, { loc: c.loc });
    }
  }
}

function explorersDay(s: GameState, w: World) {
  for (const ex of s.explorers.slice()) {
    const f = s.armies.find((a) => a.id === ex.id);
    const n = s.nations[ex.nation];
    if (!f || !n?.alive) { s.explorers.splice(s.explorers.indexOf(ex), 1); continue; }
    if (f.loc !== ex.loc) {
      ex.loc = f.loc;
      const k = reveal(s, w, n, f.loc, 260);
      if (k > 0 && s.playerNations.includes(n.id) && chance(s.rng, 0.1)) notice(s, n.id, 'discovery', { en: `Our navigators charted new waters near ${w.names[f.loc]}.`, de: `Unsere Seefahrer kartierten neue Gewässer bei ${w.names[f.loc]}.` }, { loc: f.loc });
      // first sighting of a new continent
      if (w.lon[f.loc] < -40 && !s.flags[`newworld_${n.id}`]) {
        s.flags[`newworld_${n.id}`] = s.day;
        chronicle(s, n.id, 'discovery', { en: `Sailors of ${n.short.en} sighted unknown lands across the Ocean Sea.`, de: `Seeleute aus ${n.short.de} sichteten unbekannte Länder jenseits des Ozeans.` }, f.loc);
      }
      // long voyages cost ships
      if (w.distKm(f.loc, n.capital) > 3000 && chance(s.rng, 0.01)) for (const r of f.regs) r.men = Math.max(0, r.men - 1);
    }
    if (!f.path.length) s.explorers.splice(s.explorers.indexOf(ex), 1);
  }
}

/** AI colonial ambition: nations with colonists pick the best reachable unclaimed land. */
function aiColonize(s: GameState, w: World) {
  for (const n of s.nations) {
    if (!n.alive || s.playerNations.includes(n.id) || n.playerId) continue;
    if (colonySlots(n) <= s.colonies.filter((c) => c.nation === n.id).length) continue;
    if (n.treasury < 80 * s.priceLevel) continue;
    let best = -1, bv = -Infinity;
    const off = Math.floor(rand(s.rng) * 37);
    for (let i = off; i < w.L; i += 37) {
      if (s.loc.owner[i] >= 0 || s.loc.colonist[i] >= 0 || !knows(s, n, i)) continue;
      let native = 0; for (let k = 0; k < C; k++) native += s.loc.pop[i * C + k];
      const v = s.loc.dev[i] * 0.5 + (w.coastal[i] ? 10 : 0) - native / 5000 + rand(s.rng) * 5;
      if (v > bv && !canColonize(s, w, n, i)) { bv = v; best = i; }
    }
    if (best >= 0) startColony(s, w, n, best);
  }
}

/** AI exploration: Atlantic realms send explorers once their navigators are able. */
function aiExplore(s: GameState, w: World, year: number) {
  for (const n of s.nations) {
    if (!n.alive || s.playerNations.includes(n.id) || n.playerId || n.tech[1] < 7 || n.capital < 0) continue;
    if (w.lon[n.capital] > 10 || !w.coastal[n.capital] && n.capital >= 0 && w.lon[n.capital] > -2) continue;
    if (s.explorers.some((x) => x.nation === n.id) || !chance(s.rng, 0.25)) continue;
    let f = s.armies.find((a) => a.owner === n.id && a.fleet && !a.battle && !a.path.length);
    if (!f) continue;
    // pick an unknown sea zone in the Atlantic
    const e = s.explored[n.knows];
    let tgt = -1, bd = Infinity;
    for (let i = w.L; i < w.N; i++) {
      if (e && e[i]) continue;
      if (w.lon[i] > -5) continue;
      const d = w.distKm(f.loc, i) + rand(s.rng) * 800;
      if (d < bd) { bd = d; tgt = i; }
    }
    if (tgt >= 0) startExplorer(s, w, n, f.id, tgt);
    void year;
  }
}

export const colonial: System = {
  id: 'colonial',
  init(s) { s.loc.colonist.fill(-1); },
  daily({ s, w }) { explorersDay(s, w); },
  monthly({ s, w, date }) {
    coloniesMonth(s, w);
    if (date.m % 3 === 1) aiColonize(s, w);
    if (date.m === 4) aiExplore(s, w, date.y);
  },
};
void armyMen; void newArmy; void availableUnits;
