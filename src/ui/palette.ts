// Colour-blind palette (spec point 4): realm colours for the political map that stay apart for people with red-green
// colour blindness (deuteranopia and protanopia). The map modes switch their ramps in src/game/view.ts.
//
// The palette is built from the Okabe–Ito colours, each in three shades. Every realm keeps a preferred colour (from its
// id, so it does not change from month to month); where two neighbouring realms would look alike to a red-green
// colour-blind eye, the later one takes the next colour that does not.
import type { GeoJson } from '../sim/world';

type RGB = [number, number, number];
const BASE: RGB[] = [[0, 114, 178], [230, 159, 0], [86, 180, 233], [240, 228, 66], [213, 94, 0], [204, 121, 167], [0, 158, 115]];
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t)) as RGB;
const SHADES: RGB[] = [...BASE, ...BASE.map((c) => mix(c, [255, 255, 255], 0.45)), ...BASE.map((c) => mix(c, [20, 20, 30], 0.35))];

// ---------------- what a red-green colour-blind eye sees (Machado, Oliveira & Fernandes 2009, severity 1) ----------------
const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const DEUTAN = [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881];
const PROTAN = [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998];
function simulate(c: RGB, m: number[]): [number, number, number] {
  const r = lin(c[0]), g = lin(c[1]), b = lin(c[2]);
  return [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b];
}
/** Distance of two colours as the less distinct of the two red-green colour-blind views (linear RGB, 0..√3). */
export function cvdDistance(a: RGB, b: RGB): number {
  let d = Infinity;
  for (const m of [DEUTAN, PROTAN]) { const x = simulate(a, m), y = simulate(b, m); d = Math.min(d, Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])); }
  return d;
}
/** Neighbouring realms must be at least this far apart in both colour-blind views. */
export const CVD_MIN_DIST = 0.12;
/** The shades, without any that a red-green colour-blind eye cannot tell from an earlier one (dark orange and
 *  vermilion look the same to it). */
export const CVD_PALETTE: RGB[] = SHADES.filter((c, i) => SHADES.slice(0, i).every((d) => cvdDistance(c, d) >= 0.03));

/** Pairs of neighbouring realms under the given owners (from the map's location edges). */
export function realmNeighbours(owner: ArrayLike<number>, geo: Pick<GeoJson, 'edges' | 'L'>): Map<number, Set<number>> {
  const nb = new Map<number, Set<number>>();
  const add = (a: number, b: number) => { let s = nb.get(a); if (!s) nb.set(a, (s = new Set())); s.add(b); };
  for (const e of geo.edges) {
    // the edges count locations from 1; only land borders (kind 0) make realms neighbours on the map
    if (e[2] !== 0) continue;
    const a = e[0] - 1, b = e[1] - 1; if (a < 0 || b < 0 || a >= geo.L || b >= geo.L) continue;
    const oa = owner[a], ob = owner[b]; if (oa < 0 || ob < 0 || oa === ob) continue;
    add(oa, ob); add(ob, oa);
  }
  return nb;
}

const pref = (id: number) => ((id * 2654435761) >>> 0) % CVD_PALETTE.length;
/** Palette index per realm: the preferred colour unless a neighbour already looks alike; deterministic for the same owners. */
export function assignCvdColors(realms: number[], nb: Map<number, Set<number>>, prev?: Map<number, number>): Map<number, number> {
  const out = new Map<number, number>();
  const order = [...realms].sort((a, b) => (nb.get(b)?.size ?? 0) - (nb.get(a)?.size ?? 0) || a - b);
  for (const r of order) {
    const taken = [...(nb.get(r) ?? [])].map((x) => out.get(x)).filter((x): x is number => x !== undefined);
    const ok = (k: number) => taken.every((t) => t !== k && cvdDistance(CVD_PALETTE[k], CVD_PALETTE[t]) >= CVD_MIN_DIST);
    const first = prev?.get(r) ?? pref(r);
    let pick = -1;
    for (let i = 0; i < CVD_PALETTE.length; i++) { const k = (first + i) % CVD_PALETTE.length; if (ok(k)) { pick = k; break; } }
    if (pick < 0) { // no colour clears the bar: take the one furthest from the neighbours
      let best = -1; for (let k = 0; k < CVD_PALETTE.length; k++) { const d = Math.min(...taken.map((t) => cvdDistance(CVD_PALETTE[k], CVD_PALETTE[t])), 9); if (d > best) { best = d; pick = k; } }
    }
    out.set(r, pick);
  }
  return out;
}

let last: Map<number, number> | undefined;
/** Realm colours (3 bytes per realm) for the political map in the colour-blind palette. */
export function cvdRealmColors(owner: ArrayLike<number>, geo: Pick<GeoJson, 'edges' | 'L'>, count: number): Uint8Array {
  const realms = new Set<number>(); for (let i = 0; i < geo.L && i < owner.length; i++) if (owner[i] >= 0) realms.add(owner[i]);
  last = assignCvdColors([...realms], realmNeighbours(owner, geo), last);
  const out = new Uint8Array(count * 3);
  for (let r = 0; r < count; r++) { const c = CVD_PALETTE[last.get(r) ?? pref(r)]; out[r * 3] = c[0]; out[r * 3 + 1] = c[1]; out[r * 3 + 2] = c[2]; }
  return out;
}
/** The colour of one realm in the current colour-blind assignment (armies, labels). */
export function cvdColorOf(id: number): RGB { return CVD_PALETTE[last?.get(id) ?? pref(id)]; }
