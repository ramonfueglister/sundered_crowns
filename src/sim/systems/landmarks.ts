// Landmarks (point 24): each famous building gives its holder national effects and prestige that grow with every
// stage; a stage is built over three years for gold. AI realms build when they are rich. The holder changes with the
// owner of the location, so a landmark is a prize of war (see locValue in war.ts).
import type { GameState, Nation } from '../types';
import type { World } from '../world';
import { type System, clamp, chronicle, notice } from '../ctx';
import { LANDMARKS, landmarkCost, LANDMARK_MONTHS } from '../content/landmarks';
import { chance } from '../rng';

export interface LandmarkState { id: string; loc: number; tier: number; work: number; holder: number }

/** The landmarks of this game (located on the map once, kept in the state so saves and replays agree). */
export function landmarksOf(s: GameState, w: World): LandmarkState[] {
  if (!s.landmarks) {
    s.landmarks = [];
    for (const d of LANDMARKS) { const loc = w.names.indexOf(d.place); if (loc >= 0 && loc < w.L) s.landmarks.push({ id: d.id, loc, tier: d.built, work: 0, holder: -1 }); }
  }
  return s.landmarks;
}
export const landmarkDef = (id: string) => LANDMARKS.find((d) => d.id === id)!;
export function landmarkPrice(s: GameState, n: Nation, id: string, tier: number) { return Math.round(landmarkCost(landmarkDef(id), tier) * s.priceLevel * (1 + n.inflation)); }

/** Extra worth of a location in war and peace for the landmark that stands there. */
const AT = new WeakMap<object, Map<number, LandmarkState>>();
export function landmarkValue(s: GameState, l: number): number {
  const ls = s.landmarks; if (!ls) return 0;
  let m = AT.get(ls);
  if (!m) { m = new Map(); for (const x of ls) m.set(x.loc, x); AT.set(ls, m); }
  const x = m.get(l);
  return x ? 6 + x.tier * 6 : 0;
}

/** Starts the next stage (a command; returns an error text or null). */
export function startLandmark(s: GameState, w: World, n: Nation, id: string): string | null {
  const x = landmarksOf(s, w).find((q) => q.id === id); if (!x) return 'unknown landmark';
  const d = landmarkDef(id);
  if (s.loc.owner[x.loc] !== n.id) return 'not your location';
  if (s.loc.ctrl[x.loc] !== n.id) return 'occupied';
  if (x.work) return 'already building';
  if (x.tier >= d.max) return 'fully built';
  const cost = landmarkPrice(s, n, id, x.tier);
  if (n.treasury < cost) return 'not enough gold';
  n.treasury -= cost;
  x.work = s.day + Math.round(LANDMARK_MONTHS * 30.44);
  return null;
}

function landmarksMonth(s: GameState, w: World) {
  for (const x of landmarksOf(s, w)) {
    const d = landmarkDef(x.id); const o = s.loc.owner[x.loc];
    // building stops when the place changes hands or is occupied, and resumes when it is held again
    if (x.work && (o !== x.holder && x.holder >= 0 || s.loc.ctrl[x.loc] !== o)) x.work += 30;
    if (x.work && s.day >= x.work) {
      x.work = 0; x.tier = Math.min(d.max, x.tier + 1);
      const text = { en: `${d.name.en} in ${w.names[x.loc]} has reached stage ${x.tier} of ${d.max}.`, de: `${d.name.de} in ${w.namesDe[x.loc]} hat die Ausbaustufe ${x.tier} von ${d.max} erreicht.` };
      if (o >= 0) { chronicle(s, o, 'landmark', text, x.loc); notice(s, o, 'built', text, { loc: x.loc }); }
    }
    // the holder's bonus
    if (o !== x.holder) {
      const prev = s.nations[x.holder];
      if (prev) prev.modifiers = prev.modifiers.filter((m) => m.id !== `landmark_${x.id}`);
      if (x.holder >= 0 && o >= 0 && prev) {
        const t = { en: `${d.name.en} passed from ${prev.short.en} to ${s.nations[o].short.en}.`, de: `${d.name.de} ging von ${prev.short.de} an ${s.nations[o].short.de} über.` };
        chronicle(s, o, 'landmark', t, x.loc, [x.holder]);
        for (const p of [o, x.holder]) if (s.playerNations.includes(p)) notice(s, p, 'landmark', t, { loc: x.loc });
      }
      x.holder = o;
    }
    const n = s.nations[o];
    if (!n || !n.alive) continue;
    const fx: Record<string, number> = {}; for (const k in d.fx) fx[k] = d.fx[k] * x.tier;
    n.modifiers = n.modifiers.filter((m) => m.id !== `landmark_${x.id}`);
    if (x.tier > 0) n.modifiers.push({ id: `landmark_${x.id}`, until: 1e9, label: { en: `${d.name.en} (stage ${x.tier})`, de: `${d.name.de} (Stufe ${x.tier})` }, effects: fx });
    n.prestige = clamp(n.prestige + d.prestige * x.tier, -100, 100);
    // a rich AI realm builds on
    if (!x.work && x.tier < d.max && !s.playerNations.includes(o) && !n.playerId && s.loc.ctrl[x.loc] === o) {
      const cost = landmarkPrice(s, n, x.id, x.tier);
      if (n.treasury > cost * 3 && !s.wars.some((wr) => wr.att.includes(o) || wr.def.includes(o)) && chance(s.rng, 0.015)) startLandmark(s, w, n, x.id);
    }
  }
}

export const landmarks: System = {
  id: 'landmarks',
  init(s, w) { landmarksOf(s, w); landmarksMonth(s, w); },
  monthly({ s, w }) { landmarksMonth(s, w); },
};
