// Where the figures of a piece of the world stand and go: walkers in the streets of the walled towns, people about the
// houses of villages and farms, and farmers at work in the fields. Runs in the world's web workers, after settle().
//
// Every figure is decided by its own column alone (a hash of the world block), and only the piece that owns that
// column adds it, so the same figure stands at the same place in every piece and none is doubled at a piece's edge.
// A walker goes back and forth along a straight way of free ground; the graphics card moves it (material.ts), the
// processor does nothing per frame.
import { hash2 } from '../lookprobe/batch';
import { type Ground, Mat, N, idx } from '../lookprobe/layout';
import { ESTATES, HAIR, HOSE, LOAD_COLOURS, Mode, SKIN, pickEstate } from './estates';
import { Load } from './kit';
import { type TownPerson, townPeople } from './people';

/** A walled town as settle() laid it out: its gazetteer index, its middle and the half side of its square, in world blocks. */
export interface Town {
  site: number;
  cx: number;
  cz: number;
  half: number;
}
/** What settle() leaves on the ground (worldprobe/settle.ts): 1 where built (2 on town paving), the town paving, the
 *  crops, and the walled towns (absent from older builds). */
export interface SettledGround {
  used: Uint8Array;
  town: Uint8Array;
  field: Uint8Array;
  towns?: readonly Town[];
}

/**
 * Where the persons of a town walk: each person aims at a column of the town's square drawn from a hash of their id,
 * in world blocks, so that every piece of the world agrees without seeing the others; a person shows where that column
 * is street, and of two persons aiming at one column the first. A town shows a share of its persons, as large as the
 * share of street in its square.
 */
const aims = new Map<string, Map<number, TownPerson>>();
const key = (wx: number, wz: number) => wx * 1048576 + wz;
function aimsOf(t: Town): Map<number, TownPerson> | undefined {
  const people = townPeople(t.site);
  if (!people?.length) return undefined;
  const k = `${t.site}:${t.cx}:${t.cz}:${t.half}:${people.length}`;
  let m = aims.get(k);
  if (!m) {
    m = new Map();
    for (const p of people) {
      // a ruler is not left to chance: the piece that holds the middle of the town stands them in a street (crowd)
      if (p.ruler !== undefined) continue;
      const at = key(
        t.cx - t.half + Math.floor(hash2(p.id, 1, 920) * 2 * t.half),
        t.cz - t.half + Math.floor(hash2(p.id, 2, 920) * 2 * t.half),
      );
      if (!m.has(at)) m.set(at, p);
    }
    aims.set(k, m);
  }
  return m;
}
/** Estates a woman or a man of the town is shown in, until the person system gives each household its estate. */
const FEMALE = new Set(['Bäuerin', 'Bürgerin']);

/**
 * The figures of a piece as flat lists, four numbers per figure in each, ready for instanced attributes:
 * a: start of the way (x, y, z) and the phase; b: end of the way (x, y, z) and the pace in blocks a second (0 on the spot);
 * c: mode, load, cut, headwear; d: colours of skin, garment, hose, headwear; e: colour of the load and of the hair, the
 * facing of a figure on the spot, and the person it is (id + 1; 0 for an anonymous figure). Colours are 0xRRGGBB as numbers.
 */
export interface Figures {
  count: number;
  a: Float32Array;
  b: Float32Array;
  c: Float32Array;
  d: Float32Array;
  e: Float32Array;
  /** the piece's ground in the world, in blocks of the finest step */
  ox?: number;
  oz?: number;
  /**
   * where a far step draws them (worldprobe/crowd.ts): how wide and how tall a block of the finest step, in which the
   * figures are given, is in the piece's blocks; without it the piece's blocks are the finest
   */
  scale?: [number, number];
}

/**
 * Share of the free columns that hold a figure: of the town streets, of the ground round the houses of villages and
 * farms, of the grass strips round the fields. Assumptions, set by eye; to be replaced by the people of the person
 * system (1 person for 100 inhabitants, the diorama's scale) once it exists.
 */
const IN_STREET = 0.09,
  ABOUT_HOUSE = 0.035,
  IN_FIELD = 0.05;
/** Comfortable walking pace 1.3–1.4 m/s (Bohannon 1997, Age and Ageing 26); a block is 1.7 m / 1.2 ≈ 1.4 m. */
const PACE = 0.95;
/** A way is at most this many blocks long; shorter ways make figures that turn more often. Drawing value. */
const LONGEST_WAY = 14;
const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

/**
 * What a figure asks of the ground at a block of the finest step (its x, z in the piece): whether it is free to stand
 * or walk on (street: the paving of a town that nothing stands on; else ground on which nothing stands, grows or is
 * paved), whether a house stands within two blocks, the crop that grows on it (0: none), and how high it lies, in
 * blocks of the figure's height.
 */
export interface Where {
  free(x: number, z: number, street: boolean): boolean;
  nearHouse(x: number, z: number): boolean;
  field(x: number, z: number): number;
  h(x: number, z: number): number;
}
/** Figures as lists of numbers, before they are made into the lists of `Figures`. */
type Gathered = number[][];
export const gathered = (): Gathered => [[], [], [], [], []];

/**
 * The figure, if any, at a block of the finest step: x, z in the piece, wx, wz in the world (which draw who it is),
 * `person` the person of a town who stands there, `inTown` whether the block lies in a town whose street holds its
 * persons and not chance.
 */
export function place(
  out: Gathered,
  w: Where,
  x: number,
  z: number,
  wx: number,
  wz: number,
  person?: TownPerson,
  inTown = false,
) {
  const lot = hash2(wx, wz, 401);
  // farmers work from the strip of grass round a field, facing their crop: inside it the crop would hide them
  const street = w.free(x, z, true),
    field = !street && w.free(x, z, false) ? DIRS.findIndex(([dx, dz]) => w.field(x + dx, z + dz) > 0) : -1;
  let kind: 'street' | 'house' | 'field' | null = null;
  if (street && (person || (!inTown && lot < IN_STREET))) kind = 'street';
  else if (field >= 0 && lot < IN_FIELD) kind = 'field';
  else if (!street && lot < ABOUT_HOUSE && w.free(x, z, false) && w.nearHouse(x, z)) kind = 'house';
  if (!kind) return;
  const h = (k: number) => hash2(wx, wz, 410 + k);
  // who: farmers in the fields (vines are tended standing, with a basket), the rest by the share of town or village
  const crop = field >= 0 ? w.field(x + DIRS[field][0], z + DIRS[field][1]) : 0;
  const shown = kind === 'street' ? person : undefined;
  const e =
    kind === 'field'
      ? crop === 2
        ? 1
        : 3
      : shown
        ? pickEstate(h(0), (q) => (FEMALE.has(q.name) === shown.female ? q.townShare : 0))
        : pickEstate(h(0), (q) => (kind === 'street' ? q.townShare : q.mode === Mode.Work ? 0 : q.villageShare));
  const estate = ESTATES[e];
  // a ruler stands on the spot, so that the map mode of the rulers finds them where it says
  let mode =
    kind === 'field'
      ? crop === 2
        ? Mode.Stand
        : Mode.Work
      : shown?.ruler !== undefined
        ? Mode.Stand
        : estate.mode;
  // the way: straight on over free ground of even height, as far as it goes
  const [dx, dz] = DIRS[Math.floor(h(1) * 4)],
    want = 2 + Math.floor(h(2) * (LONGEST_WAY - 1));
  let len = 0;
  if (mode === Mode.Walk)
    while (len < want) {
      const nx = x + dx * (len + 1),
        nz = z + dz * (len + 1);
      if (!w.free(nx, nz, kind === 'street') || Math.abs(w.h(nx, nz) - w.h(x + dx * len, z + dz * len)) > 1) break;
      len++;
    }
  if (mode === Mode.Walk && len < 2) mode = Mode.Stand;
  // the figure keeps to one side of the way, so that two ways in one street do not run into each other
  const side = (h(3) - 0.5) * 0.7,
    sx = x + 0.5 + dz * side,
    sz = z + 0.5 + dx * side,
    y = w.h(x, z);
  const ex = sx + dx * len,
    ez = sz + dz * len,
    ey = w.h(x + dx * len, z + dz * len);
  const pick = (list: readonly number[], k: number) => list[Math.floor(h(k) * list.length)];
  out[0].push(sx, y, sz, h(4) * 100);
  out[1].push(ex, mode === Mode.Walk ? ey : y, ez, mode === Mode.Walk ? PACE * (0.8 + 0.4 * h(5)) : 0);
  out[2].push(mode, estate.load, estate.cut, estate.head);
  out[3].push(pick(SKIN, 6), pick(estate.tunic, 7), pick(HOSE, 8), pick(estate.headwear, 9));
  out[4].push(
    estate.load === Load.None ? 0 : pick(LOAD_COLOURS[estate.load], 10),
    pick(HAIR, 11),
    kind === 'field' ? Math.atan2(DIRS[field][0], DIRS[field][1]) : h(12) * Math.PI * 2,
    shown ? shown.id + 1 : 0,
  );
}
/** The lists of a piece's figures from those gathered. */
export function figuresOf(out: Gathered, ox: number, oz: number, scale?: [number, number]): Figures {
  const [a, b, c, d, e] = out.map((l) => new Float32Array(l));
  return { count: a.length / 4, a, b, c, d, e, ox, oz, ...(scale ? { scale } : {}) };
}

/** Builds the figures of a ground. `own` says whether a column belongs to this piece. */
export function crowd(g: Ground, s: SettledGround, own: (x: number, z: number) => boolean): Figures {
  const ox = g.ox ?? 0,
    oz = g.oz ?? 0,
    out = gathered();
  const w: Where = {
    free(x, z, street) {
      if (x < 1 || z < 1 || x >= N - 1 || z >= N - 1) return false;
      const i = idx(x, z);
      return (
        !g.wet[i] &&
        (street ? s.town[i] === 1 && s.used[i] === 2 : s.used[i] === 0 && s.town[i] === 0 && g.mat[i] !== Mat.Rock)
      );
    },
    nearHouse(x, z) {
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const i = idx(x + dx, z + dz);
          if (s.used[i] === 1 && !s.field[i] && !s.town[i]) return true;
        }
      return false;
    },
    field: (x, z) => s.field[idx(x, z)],
    h: (x, z) => g.h[idx(x, z)],
  };
  const towns = (s.towns ?? []).flatMap((t) => {
    const aims = aimsOf(t);
    return aims ? [{ t, aims }] : [];
  });
  // the rulers of a town always stand in it: the piece that holds the town's middle puts each in the free street
  // column nearest the middle that it holds, one column to a ruler
  const rulerAt = new Map<number, TownPerson>();
  for (const { t } of towns) {
    const cx = t.cx - ox,
      cz = t.cz - oz;
    if (cx < 0 || cz < 0 || cx >= N || cz >= N || !own(cx, cz)) continue;
    for (const p of townPeople(t.site) ?? []) {
      if (p.ruler === undefined) continue;
      search: for (let r = 0; r <= t.half + 2; r++)
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const x = cx + dx,
              z = cz + dz;
            if (!w.free(x, z, true) || !own(x, z) || rulerAt.has(key(x + ox, z + oz))) continue;
            rulerAt.set(key(x + ox, z + oz), p);
            break search;
          }
    }
  }
  for (let z = 2; z < N - 2; z++)
    for (let x = 2; x < N - 2; x++) {
      if (!own(x, z)) continue;
      const wx = x + ox,
        wz = z + oz;
      // in a town with persons the street holds them, not chance
      const town = towns.find(({ t }) => Math.abs(wx - t.cx) <= t.half && Math.abs(wz - t.cz) <= t.half);
      place(out, w, x, z, wx, wz, rulerAt.get(key(wx, wz)) ?? town?.aims.get(key(wx, wz)), !!town);
    }
  return figuresOf(out, ox, oz);
}
