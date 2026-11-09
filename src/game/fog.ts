// Fog of war (spec point 104): what one realm knows. The world server sends each player only this, and the
// single-player worker applies the same filter, so both behave alike. In single player the observer and a game with
// everything revealed (dev tools) see all; online the fog is decided per session (only admins see all), so a world-wide
// flag never lifts it for the players.
//
// Known land: the explored map of the realm's knowledge group (unknown land stays terra incognita, without owners).
// Sight (armies, fleets, battles, sieges): our own land and that of our subjects, overlord and allies; every place
// next to it; two steps around each of our hosts and fleets; and what our spies report from their target's heartland.
// Wars, peace treaties and the chronicle stay public: news travels.
import type { GameState } from '../sim/types';
import type { World } from '../sim/world';
import type { ArmyLite, TickView } from './protocol';
import { allies, subjectsOf } from '../sim/ctx';

export interface Sight {
  nation: number;
  /** realms whose armies we always see: ourselves, subjects, overlord, allies */
  friends: Set<number>;
  /** 1 = armies at this location (land or sea, 0..N) are visible */
  see: Uint8Array;
  /** 1 = known location (0..N); null = everything known */
  known: Uint8Array | null;
}

/** The radius (in steps between neighbouring places) our hosts and fleets see around them. */
export const ARMY_SIGHT = 2;
/** The radius our spies see around their target's capital. */
export const SPY_SIGHT = 2;

/** Single player: whether the fog applies to a viewer at all (observer mode and "reveal all" see everything).
 *  The world server does not use it: there these flags are world-wide state. */
export function fogActive(s: GameState, nation: number | null): boolean {
  return nation !== null && nation >= 0 && !!s.nations[nation] && !s.observer && !s.flags.revealAll;
}

export function friendsOf(s: GameState, nation: number): Set<number> {
  const out = new Set<number>([nation]);
  const n = s.nations[nation]; if (!n) return out;
  for (const x of subjectsOf(s, nation)) out.add(x);
  if (n.overlord >= 0) out.add(n.overlord);
  for (const x of allies(s, nation)) out.add(x);
  return out;
}

/** Known locations of a realm (its knowledge group's explored map), or null when everything is known.
 *  `honourReveal` false ignores the world-wide "reveal all" flag (the world server decides the fog per session). */
export function knownOf(s: GameState, w: World, nation: number, honourReveal = true): Uint8Array | null {
  const n = s.nations[nation]; if (!n || (honourReveal && s.flags.revealAll)) return null;
  const e = s.explored[n.knows]; if (!e) return null;
  const out = new Uint8Array(w.N); for (let i = 0; i < w.N && i < e.length; i++) out[i] = e[i] ? 1 : 0;
  return out;
}

function spread(w: World, see: Uint8Array, from: number, steps: number) {
  if (from < 0 || from >= w.N) return;
  let ring = [from]; see[from] = 1;
  const seen = new Set<number>(ring);
  for (let k = 0; k < steps; k++) {
    const next: number[] = [];
    for (const i of ring) for (const j of w.neighbours(i)) { if (seen.has(j)) continue; seen.add(j); see[j] = 1; next.push(j); }
    ring = next;
  }
}

export function sightOf(s: GameState, w: World, nation: number, honourReveal = true): Sight {
  const friends = friendsOf(s, nation);
  const see = new Uint8Array(w.N);
  const own = s.loc.owner, ctrl = s.loc.ctrl;
  for (let i = 0; i < w.L; i++) {
    if (!friends.has(own[i]) && !friends.has(ctrl[i])) continue;
    see[i] = 1;
    for (const j of w.neighbours(i)) see[j] = 1;
  }
  for (const a of s.armies) if (friends.has(a.owner) && !a.rebels) spread(w, see, a.loc, ARMY_SIGHT);
  for (const sp of s.spies) if (sp.nation === nation) { const t = s.nations[sp.target]; if (t?.alive && t.capital >= 0) spread(w, see, t.capital, SPY_SIGHT); }
  return { nation, friends, see, known: knownOf(s, w, nation, honourReveal) };
}

/** An army is visible when it belongs to a friend or stands where we can see. */
export function armyVisible(sight: Sight, a: { owner: number; loc: number; rebels?: any }): boolean {
  return (sight.friends.has(a.owner) && !a.rebels) || sight.see[a.loc] === 1;
}

/** Visible armies; foreign hosts show only their next step, not where they are going. */
export function fogArmies(list: ArmyLite[], sight: Sight): ArmyLite[] {
  const out: ArmyLite[] = [];
  for (const a of list) {
    if (!armyVisible(sight, a)) continue;
    out.push(sight.friends.has(a.owner) && !a.rebels ? a : { ...a, path: a.path.slice(0, 1) });
  }
  return out;
}
export function fogBattles(list: TickView['battles'], sight: Sight): TickView['battles'] {
  return list.filter((b) => sight.see[b.loc] === 1 || sight.friends.has(b.att) || sight.friends.has(b.def));
}
export function fogSieges(s: GameState, list: TickView['sieges'], sight: Sight): TickView['sieges'] {
  return list.filter((x) => sight.see[x.loc] === 1 || sight.friends.has(x.nation) || sight.friends.has(s.loc.owner[x.loc]));
}

/** Owners and controllers with unknown land masked out (-1). Returns the same arrays when everything is known. */
export function fogOwners(owner: Int16Array, ctrl: Int16Array, known: Uint8Array | null): { owner: Int16Array; ctrl: Int16Array } {
  if (!known) return { owner, ctrl };
  const o = new Int16Array(owner), c = new Int16Array(ctrl);
  for (let i = 0; i < o.length; i++) if (i < known.length && !known[i]) { o[i] = -1; c[i] = -1; }
  return { owner: o, ctrl: c };
}

/** Map-mode colours with unknown places left blank. */
export function fogColors(rgba: Uint8Array, known: Uint8Array | null): Uint8Array {
  if (!known) return rgba;
  for (let i = 0; i < known.length && i * 4 + 3 < rgba.length; i++) if (!known[i]) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = rgba[i * 4 + 3] = 0; }
  return rgba;
}

/** Applies the fog to the parts of a tick view that show armies (in place; returns it). */
export function fogTick<T extends Pick<TickView, 'armies' | 'battles' | 'sieges'>>(s: GameState, v: T, sight: Sight): T {
  v.armies = fogArmies(v.armies, sight); v.battles = fogBattles(v.battles, sight); v.sieges = fogSieges(s, v.sieges, sight);
  return v;
}

/** Query answers under the fog (single-player worker): the observer and "reveal all" (dev tools) see everything. */
export function fogAnswer(s: GameState, w: World, nation: number, q: { q: string; [k: string]: any }, data: any): any {
  if (!fogActive(s, nation)) return data;
  return fogAnswerWith(s, w, () => sightOf(s, w, nation), q, data);
}

/** Query answers under a given sight: no details of unknown land, no armies, sieges or foreign agents out of sight, no
 *  paths of other realms' hosts, no owners of unknown land in the timelapse. 'none' is a viewer without a realm (online:
 *  a connection that has not taken a seat): it knows the land (to pick a realm) but sees no armies at all. The sight is
 *  asked for only by the queries that need it. */
export function fogAnswerWith(s: GameState, w: World, getSight: () => Sight | 'none', q: { q: string; [k: string]: any }, data: any): any {
  if (data === null || data === undefined) return data;
  switch (q.q) {
    case 'loc': {
      const sight = getSight(); const l = Number(q.loc);
      if (sight === 'none') {
        const out = { ...data };
        if ('armies' in out) out.armies = []; if ('fleets' in out) out.fleets = [];
        if ('siege' in out) out.siege = null; if ('agents' in out) out.agents = [];
        if (out.war) out.war = { ...out.war, siege: null, blockadedBy: -1 };
        return out;
      }
      if (sight.known && !sight.known[l]) return { unknown: true, id: l, sea: l >= w.L, name: w.names[l] };
      const vis = (a: any) => armyVisible(sight, { owner: a.owner, loc: l, rebels: a.rebels });
      const out = { ...data };
      if (Array.isArray(out.armies)) out.armies = out.armies.filter(vis);
      if (Array.isArray(out.fleets)) out.fleets = out.fleets.filter(vis);
      // a siege tells who besieges: shown in sight, or when a friend besieges or is besieged (as in the tick)
      if (out.siege) out.siege = fogSieges(s, [out.siege], sight).length ? out.siege : null;
      // the siege window and the fleet off the coast (war pass, src/game/warview.ts locWar) under the same rule
      if (out.war) {
        const wv = { ...out.war };
        if (wv.siege && !out.siege) wv.siege = null;
        if (wv.blockadedBy >= 0 && sight.see[l] !== 1 && !sight.friends.has(wv.blockadedBy) && !sight.friends.has(s.loc.owner[l])) wv.blockadedBy = -1;
        out.war = wv;
      }
      // conversion agents out of sight: only our own
      if (Array.isArray(out.agents) && sight.see[l] !== 1) out.agents = out.agents.filter((a: any) => a.nation === sight.nation);
      return out;
    }
    case 'path': {
      const sight = getSight(); if (sight === 'none') return null;
      const a = s.armies.find((x) => x.id === q.army);
      return a && a.owner === sight.nation ? data : null;
    }
    case 'timelapse': {
      // the frames store owner + 1 (0 = nobody): unknown land shows as nobody's; once the game has ended all is shown
      if (s.ended) return data;
      const sight = getSight(); if (sight === 'none' || !sight.known) return data;
      const known = sight.known;
      return (data as { day: number; owners: Uint16Array }[]).map((f) => {
        const o = new Uint16Array(f.owners);
        for (let i = 0; i < o.length; i++) if (i >= known.length || !known[i]) o[i] = 0;
        return { day: f.day, owners: o };
      });
    }
  }
  return data;
}
