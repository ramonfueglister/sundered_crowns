// The landmarks in the land register (settlement feature 5, docs/SETTLEMENT_DESIGN.md; the rules in
// src/sim/settlement/landmarks.ts). Laid with the towns (src/sim/systems/lots.ts): the church of a town's see and
// its buildings known by name before its streets, which then grow round them; the convents and the ruler's
// residence after its parcels and hamlets, at its edge. The buildings that stand alone (abbeys, castles) last.
// Written once when a world is founded, or by the upgrade 32 → 33; nothing changes while the world runs.
import type { WorldState } from '../state';
import { LANDMARK_SCHEMA } from '../state';
import { createTable, spawn } from '../ecs';
import { FAITHS } from '../content/peoples';
import { namedOf, seeOf, type Named } from '../content/landmarks';
import {
  BIG_TOWN,
  LANDMARK_KIND,
  NO_YEAR,
  ORDERS,
  SIZE_ARCH,
  SIZE_GREAT_MOSQUE,
  SIZE_OF,
  URBAN,
  edgeBearing,
  ordersOf,
  type LandmarkKind,
} from '../settlement/landmarks';

/** A landmark as it is laid: its middle and size in metres from the town's centre (x east, z south). */
export interface Laid {
  kind: LandmarkKind;
  x: number;
  z: number;
  w: number;
  d: number;
  lat: number;
  lon: number;
  start: number;
  end: number;
  ruined: number;
  named: number;
  order: number;
}
/** what is in the way of a landmark: a box by its middle and size */
export interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
}
/** the ground of a town as the register sees it: whether the block of `m` metres at (bx, bz) can be built on */
export interface LandmarkGround {
  free: (bx: number, bz: number) => boolean;
  m: number;
}

/** the space kept between a landmark and what stands round it, in metres. PLACEHOLDER */
export const LANDMARK_GAP = 4;
/** how far a landmark moves from its spot to find ground, and in what steps, in metres. PLACEHOLDER */
const SEARCH = 80,
  STEP = 4;
/** where the search for a spot at the edge begins, as a share of how far the town reaches. PLACEHOLDER */
const EDGE = 0.7;

const overlaps = (a: Box, b: Box, gap: number) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + gap;

/** whether every block under a box is ground that can be built on */
function onGround(b: Box, g: LandmarkGround | null): boolean {
  if (!g) return true;
  const x0 = Math.floor((b.x - b.w / 2) / g.m),
    x1 = Math.ceil((b.x + b.w / 2) / g.m),
    z0 = Math.floor((b.z - b.d / 2) / g.m),
    z1 = Math.ceil((b.z + b.d / 2) / g.m);
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (!g.free(x, z)) return false;
  return true;
}

const realSize = (n: Named, fallback: readonly [number, number]): [number, number] =>
  n.l > 0 ? [n.l, n.w > 0 ? n.w : n.l] : [fallback[0], fallback[1]];

/** the index of each building known by name in the file */
const indexOf = (year: number) => new Map(namedOf(year).map((n, k) => [n, k]));

/**
 * The landmarks of a town that its streets grow round: the church of its see and its buildings known by name, each
 * at its real place in the town drawn together by URBAN, the church of a see without one at the centre (where the
 * world graphic stood the church before). Where its spot is taken by one laid before, or is not ground, it moves out
 * to the nearest spot round it that is (at most SEARCH metres). The cathedral first, then the rest in the order of
 * the file.
 */
export function coreLandmarks(
  year: number,
  site: number,
  people: number,
  g: LandmarkGround | null,
  draw = URBAN,
): Laid[] {
  const index = indexOf(year),
    here = namedOf(year).filter((n) => n.site === site),
    see = seeOf(year, site),
    out: Laid[] = [];
  const seeKind =
    see === 'mosque'
      ? LANDMARK_KIND.mosque
      : see === 'orthodox'
        ? LANDMARK_KIND.orthodox
        : see
          ? LANDMARK_KIND.cathedral
          : null;
  const seeSize =
    see === 'archbishop'
      ? SIZE_ARCH
      : see === 'mosque' && people >= BIG_TOWN
        ? SIZE_GREAT_MOSQUE
        : seeKind !== null
          ? SIZE_OF[seeKind]
          : SIZE_OF[LANDMARK_KIND.church];
  // the building known by name that is the church of the see, where there is one
  const seeNamed = seeKind === null ? undefined : here.find((n) => n.kind === seeKind);
  const wanted: { n?: Named; kind: LandmarkKind; x: number; z: number; w: number; d: number }[] = [];
  // a town laid by its real plan (draw other than URBAN) is drawn together as its plan, round the church of its see,
  // where the plan has its centre (src/sim/content/town_plans.ts)
  const [ox, oz] = draw !== URBAN && seeNamed ? [seeNamed.east, seeNamed.south] : [0, 0];
  if (seeKind !== null) {
    const [l, w] = seeNamed ? realSize(seeNamed, seeSize) : [seeSize[0], seeSize[1]];
    wanted.push({
      n: seeNamed,
      kind: seeKind,
      x: seeNamed ? (seeNamed.east - ox) * draw : 0,
      z: seeNamed ? (seeNamed.south - oz) * draw : 0,
      w: l,
      d: w,
    });
  }
  for (const n of here) {
    if (n === seeNamed || n.kind === LANDMARK_KIND.convent) continue;
    const [l, w] = realSize(
      n,
      n.kind === LANDMARK_KIND.cathedral && see === 'archbishop' ? SIZE_ARCH : SIZE_OF[n.kind],
    );
    wanted.push({ n, kind: n.kind, x: (n.east - ox) * draw, z: (n.south - oz) * draw, w: l, d: w });
  }
  for (const q of wanted) {
    const at = placeNear(q, out, g);
    out.push({
      kind: q.kind,
      x: at.x,
      z: at.z,
      w: q.w,
      d: q.d,
      lat: q.n ? q.n.lat : NaN,
      lon: q.n ? q.n.lon : NaN,
      start: q.n?.start ?? NO_YEAR,
      end: q.n?.end ?? NO_YEAR,
      ruined: q.n?.ruined ?? NO_YEAR,
      named: q.n ? index.get(q.n)! : -1,
      order: 255,
    });
  }
  return out;
}

/** the nearest spot to `q` (rings of STEP metres, the nearest first) clear of `laid` and on ground; its own where none is */
function placeNear(q: Box, laid: readonly Box[], g: LandmarkGround | null): { x: number; z: number } {
  const fits = (x: number, z: number) => {
    const b = { x, z, w: q.w, d: q.d };
    return !laid.some((o) => overlaps(b, o, LANDMARK_GAP)) && onGround(b, g);
  };
  if (fits(q.x, q.z)) return { x: q.x, z: q.z };
  for (let r = STEP; r <= SEARCH; r += STEP) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / STEP));
    for (let k = 0; k < n; k++) {
      const a = (k * 2 * Math.PI) / n,
        x = q.x + r * Math.cos(a),
        z = q.z + r * Math.sin(a);
      if (fits(x, z)) return { x, z };
    }
  }
  // nowhere near: clear of the others at least, the ground aside
  for (let r = STEP; ; r += STEP)
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8,
        x = q.x + r * Math.cos(a),
        z = q.z + r * Math.sin(a),
        b = { x, z, w: q.w, d: q.d };
      if (!laid.some((o) => overlaps(b, o, LANDMARK_GAP))) return { x, z };
    }
}

/**
 * The landmarks at the edge of a town: the convents of the mendicant orders a Latin town of `people` of the time had
 * (ordersOf), and the residence of its ruler where it is the seat of a realm and has none known by name. Each on the
 * first ground out from the town along its bearing (edgeBearing) that is clear of everything in `taken` (the parcels,
 * the streets, the landmarks, the hamlets) and is ground.
 */
export function edgeLandmarks(
  latin: boolean,
  people: number,
  residence: LandmarkKind | null,
  taken: readonly Box[],
  g: LandmarkGround | null,
): Laid[] {
  const out: Laid[] = [],
    laid: Box[] = [...taken];
  const want: { kind: LandmarkKind; order: number }[] = latin
    ? ordersOf(people).map((k) => ({ kind: LANDMARK_KIND.convent, order: k }))
    : [];
  if (residence !== null) want.push({ kind: residence, order: 255 });
  const reach = Math.max(0, ...taken.map((b) => Math.max(Math.abs(b.x) + b.w / 2, Math.abs(b.z) + b.d / 2)));
  want.forEach((q, k) => {
    const [w, d] = SIZE_OF[q.kind],
      a = edgeBearing(k),
      ca = Math.cos(a),
      sa = Math.sin(a);
    let at: Box | null = null;
    // from the outer part of the town outwards: not in a gap between its parcels
    for (let r = Math.round((EDGE * reach) / STEP) * STEP; r <= reach + 400 && !at; r += STEP) {
      const b = { x: r * ca, z: r * sa, w, d };
      if (!laid.some((o) => overlaps(b, o, LANDMARK_GAP)) && onGround(b, g)) at = b;
    }
    if (!at)
      for (let r = Math.round((EDGE * reach) / STEP) * STEP; !at; r += STEP) {
        const b = { x: r * ca, z: r * sa, w, d };
        if (!laid.some((o) => overlaps(b, o, LANDMARK_GAP))) at = b;
      }
    laid.push(at);
    out.push({
      kind: q.kind,
      x: at.x,
      z: at.z,
      w,
      d,
      lat: NaN,
      lon: NaN,
      start: NO_YEAR,
      end: NO_YEAR,
      ruined: NO_YEAR,
      named: -1,
      order: q.order,
    });
  });
  return out;
}

/** the buildings known by name that stand alone, outside the towns, at their real place */
export function aloneLandmarks(year: number): Laid[] {
  return namedOf(year).flatMap((n, k): Laid[] => {
    if (n.site >= 0) return [];
    const [l, w] = realSize(n, SIZE_OF[n.kind]);
    return [
      {
        kind: n.kind,
        x: 0,
        z: 0,
        w: l,
        d: w,
        lat: n.lat,
        lon: n.lon,
        start: n.start,
        end: n.end,
        ruined: n.ruined,
        named: k,
        order: 255,
      },
    ];
  });
}

/** whether the faith of the realm that holds `place` is the Latin church (where the mendicants had their convents) */
export function latinAt(s: WorldState, place: number): boolean {
  const r = s.place.owner[place];
  return r >= 0 && FAITHS[s.realm.cols.faith[r]]?.id === 'latin';
}

/** what residence the seat of a realm in `place` gets: a palace where its realm is Muslim, a castle elsewhere; null
 *  where no realm has its capital there */
export function residenceAt(s: WorldState, place: number): LandmarkKind | null {
  const R = s.realm.cols;
  for (let r = 0; r < s.realm.size; r++)
    if (R.capital[r] === place)
      return FAITHS[R.faith[r]]?.family === 'muslim' ? LANDMARK_KIND.palace : LANDMARK_KIND.castle;
  return null;
}

/** a new, empty table of the landmarks */
export const newLandmarks = (s: WorldState) => {
  s.landmark = createTable(LANDMARK_SCHEMA, 2048);
};

/** writes landmarks into the register */
export function writeLandmarks(s: WorldState, place: number, site: number, laid: readonly Laid[]): void {
  const T = s.landmark,
    C = T.cols;
  for (const q of laid) {
    const id = spawn(T);
    C.kind[id] = q.kind;
    C.place[id] = place;
    C.site[id] = site;
    C.x[id] = q.x;
    C.z[id] = q.z;
    C.lat[id] = q.lat;
    C.lon[id] = q.lon;
    C.w[id] = q.w;
    C.d[id] = q.d;
    C.start[id] = q.start;
    C.end[id] = q.end;
    C.ruined[id] = q.ruined;
    C.named[id] = q.named;
    C.order[id] = q.order;
  }
}

/** the landmarks of a town in the register, as boxes */
export function landmarkBoxes(s: WorldState, site: number): Box[] {
  const C = s.landmark?.cols,
    out: Box[] = [];
  for (let i = 0; C && i < s.landmark.size; i++)
    if (s.landmark.alive[i] && C.site[i] === site) out.push({ x: C.x[i], z: C.z[i], w: C.w[i], d: C.d[i] });
  return out;
}

/** the name of a landmark in the register, in German */
export function landmarkName(s: WorldState, id: number): string {
  const C = s.landmark.cols,
    n = C.named[id];
  if (n >= 0) return namedOf(s.startYear)[n]?.name.de ?? '';
  if (C.order[id] !== 255) return `Konvent der ${ORDERS[C.order[id]].de}`;
  return (
    ['Kathedrale', 'Kathedrale', 'Freitagsmoschee', 'Konvent', 'Abtei', 'Burg', 'Palast', 'Kirche', 'Monument'][
      C.kind[id]
    ] ?? ''
  );
}
