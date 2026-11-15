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

/** What settle() leaves on the ground (worldprobe/settle.ts): 1 where built (2 on town paving), the town paving, the crops. */
export interface SettledGround { used: Uint8Array; town: Uint8Array; field: Uint8Array }

/**
 * The figures of a piece as flat lists, four numbers per figure in each, ready for instanced attributes:
 * a: start of the way (x, y, z) and the phase; b: end of the way (x, y, z) and the pace in blocks a second (0 on the spot);
 * c: mode, load, cut, headwear; d: colours of skin, garment, hose, headwear; e: colour of the load and of the hair, the
 * facing of a figure on the spot, unused. Colours are 0xRRGGBB as numbers.
 */
export interface Figures { count: number; a: Float32Array; b: Float32Array; c: Float32Array; d: Float32Array; e: Float32Array }

/**
 * Share of the free columns that hold a figure: of the town streets, of the ground round the houses of villages and
 * farms, of the grass strips round the fields. Assumptions, set by eye; to be replaced by the people of the person
 * system (1 person for 100 inhabitants, the diorama's scale) once it exists.
 */
const IN_STREET = 0.09, ABOUT_HOUSE = 0.035, IN_FIELD = 0.05;
/** Comfortable walking pace 1.3–1.4 m/s (Bohannon 1997, Age and Ageing 26); a block is 1.7 m / 1.2 ≈ 1.4 m. */
const PACE = 0.95;
/** A way is at most this many blocks long; shorter ways make figures that turn more often. Drawing value. */
const LONGEST_WAY = 14;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;

/** Builds the figures of a ground. `own` says whether a column belongs to this piece. */
export function crowd(g: Ground, s: SettledGround, own: (x: number, z: number) => boolean): Figures {
  const ox = g.ox ?? 0, oz = g.oz ?? 0, out: number[][] = [[], [], [], [], []];
  const free = (x: number, z: number, street: boolean) => {
    if (x < 1 || z < 1 || x >= N - 1 || z >= N - 1) return false;
    const i = idx(x, z);
    return !g.wet[i] && (street ? s.town[i] === 1 && s.used[i] === 2 : s.used[i] === 0 && s.town[i] === 0 && g.mat[i] !== Mat.Rock);
  };
  const nearHouse = (x: number, z: number) => {
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const i = idx(x + dx, z + dz); if (s.used[i] === 1 && !s.field[i] && !s.town[i]) return true; }
    return false;
  };
  for (let z = 2; z < N - 2; z++) for (let x = 2; x < N - 2; x++) {
    if (!own(x, z)) continue;
    const wx = x + ox, wz = z + oz, i = idx(x, z), lot = hash2(wx, wz, 401);
    // farmers work from the strip of grass round a field, facing their crop: inside it the crop would hide them
    const street = free(x, z, true), field = !street && free(x, z, false) ? DIRS.findIndex(([dx, dz]) => s.field[idx(x + dx, z + dz)] > 0) : -1;
    let kind: 'street' | 'house' | 'field' | null = null;
    if (street && lot < IN_STREET) kind = 'street';
    else if (field >= 0 && lot < IN_FIELD) kind = 'field';
    else if (!street && lot < ABOUT_HOUSE && free(x, z, false) && nearHouse(x, z)) kind = 'house';
    if (!kind) continue;
    const h = (k: number) => hash2(wx, wz, 410 + k);
    // who: farmers in the fields (vines are tended standing, with a basket), the rest by the share of town or village
    const crop = field >= 0 ? s.field[idx(x + DIRS[field][0], z + DIRS[field][1])] : 0;
    const e = kind === 'field' ? (crop === 2 ? 1 : 3) : pickEstate(h(0), (q) => (kind === 'street' ? q.townShare : q.mode === Mode.Work ? 0 : q.villageShare));
    const estate = ESTATES[e];
    let mode = kind === 'field' ? (crop === 2 ? Mode.Stand : Mode.Work) : estate.mode;
    // the way: straight on over free ground of even height, as far as it goes
    const [dx, dz] = DIRS[Math.floor(h(1) * 4)], want = 2 + Math.floor(h(2) * (LONGEST_WAY - 1));
    let len = 0;
    if (mode === Mode.Walk) while (len < want) {
      const nx = x + dx * (len + 1), nz = z + dz * (len + 1);
      if (!free(nx, nz, kind === 'street') || Math.abs(g.h[idx(nx, nz)] - g.h[idx(x + dx * len, z + dz * len)]) > 1) break;
      len++;
    }
    if (mode === Mode.Walk && len < 2) mode = Mode.Stand;
    // the figure keeps to one side of the way, so that two ways in one street do not run into each other
    const side = (h(3) - 0.5) * 0.7, sx = x + 0.5 + dz * side, sz = z + 0.5 + dx * side, y = g.h[i];
    const ex = sx + dx * len, ez = sz + dz * len, ey = g.h[idx(x + dx * len, z + dz * len)];
    const pick = (list: readonly number[], k: number) => list[Math.floor(h(k) * list.length)];
    out[0].push(sx, y, sz, h(4) * 100);
    out[1].push(ex, mode === Mode.Walk ? ey : y, ez, mode === Mode.Walk ? PACE * (0.8 + 0.4 * h(5)) : 0);
    out[2].push(mode, estate.load, estate.cut, estate.head);
    out[3].push(pick(SKIN, 6), pick(estate.tunic, 7), pick(HOSE, 8), pick(estate.headwear, 9));
    out[4].push(estate.load === Load.None ? 0 : pick(LOAD_COLOURS[estate.load], 10), pick(HAIR, 11), kind === 'field' ? Math.atan2(DIRS[field][0], DIRS[field][1]) : h(12) * Math.PI * 2, 0);
  }
  const [a, b, c, d, e] = out.map((l) => new Float32Array(l));
  return { count: a.length / 4, a, b, c, d, e };
}

/** No figures: for the coarser steps of the map, where a block is wider than a person is tall. */
export const noFigures = (): Figures => ({ count: 0, a: new Float32Array(0), b: new Float32Array(0), c: new Float32Array(0), d: new Float32Array(0), e: new Float32Array(0) });
