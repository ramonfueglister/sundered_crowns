// The landmarks of the land register as the world graphic builds them (settlement feature 5): what model stands for
// each kind, at the real size the register gives (its metres east-west and north-south), the long side of a church
// east-west with its choir to the east, and as far built as the year has it (src/sim/settlement/landmarks.ts
// `builtIn`): a building under way stands as the part built so far, from its east end, one not yet begun not at all.
import { Batch } from '../lookprobe/batch';
import * as THREE from 'three';
import { MONUMENTS, castle, domedChurch, lighthouse, m, modelOf, mosque, type Model, type Style } from '../buildings';
import { BUILT, LANDMARK_KIND, builtIn } from '../sim/settlement/landmarks';
import { namedOf } from '../sim/content/landmarks';

/** a landmark of the register: [kind, x, z, w, d, named, order, start, end, ruined] (tools/sim/write_lots.ts) */
export type LandmarkRow = readonly number[];
/** one that stands alone: [kind, lat, lon, w, d, named, start, end, ruined] */
export type AloneRow = readonly number[];

/** the smallest part of a building under way that is drawn, as a share of its length. PLACEHOLDER */
const LEAST_BUILT = 0.4;
/** what a ruin keeps of its height. PLACEHOLDER */
const RUIN = 0.35;
/** how high a castle or palace stands at most, in metres: brought to its real ground evenly, its towers would rise
 *  far above what any stood (the keep of the Louvre 31 m, the White Tower 27 m). PLACEHOLDER */
const CASTLE_TALL = 30;

const CASTLE: Model = { build: () => castle(), w: 14, d: 14, height: 12 };
const LIGHTHOUSE: Model = { build: () => lighthouse(), w: 4, d: 4, height: 10 };
const DOMED: Model = { build: (r) => domedChurch(r, 1.6), w: 12, d: 17, height: 11 };
const MOSQUE: Model = { build: (r) => mosque(r, 1.6), w: 15, d: 15, height: 8 };

/** the model a kind is built from in a tradition (before it is brought to its real size) */
function baseOf(kind: number, shape: string, style: Style): Model {
  if (shape === 'mosque') return MOSQUE;
  if (shape === 'domed') return DOMED;
  if (shape === 'lighthouse') return LIGHTHOUSE;
  switch (kind) {
    case LANDMARK_KIND.orthodox: return DOMED;
    case LANDMARK_KIND.mosque: return MOSQUE;
    case LANDMARK_KIND.convent: case LANDMARK_KIND.church: return style.church;
    case LANDMARK_KIND.castle: case LANDMARK_KIND.palace: return CASTLE;
    case LANDMARK_KIND.monument: return DOMED;
    default: return style.great; // a cathedral, an abbey
  }
}

/** the model of a building known by name that has one of its own (buildings/landmarks): its parts as one, centred */
function ownModel(id: string, files: ReadonlyMap<string, Batch>): Model | null {
  const parts = MONUMENTS[id];
  if (!parts?.length) return null;
  const ms = parts.map((p) => ({ p, model: modelOf(p, files) }));
  const x0 = Math.min(...ms.map(({ p, model }) => p.dx - model.w / 2)), x1 = Math.max(...ms.map(({ p, model }) => p.dx + model.w / 2));
  const z0 = Math.min(...ms.map(({ p, model }) => p.dz - model.d / 2)), z1 = Math.max(...ms.map(({ p, model }) => p.dz + model.d / 2));
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, mat = new THREE.Matrix4();
  return {
    build: (r) => { const b = new Batch(); for (const { p, model } of ms) b.append(model.build(r), mat.makeTranslation(p.dx - cx, 0, p.dz - cz)); return b; },
    w: x1 - x0, d: z1 - z0, height: Math.max(...ms.map(({ model }) => model.height)),
  };
}

/** A landmark brought to its place in the world: its model, `w` × `d` blocks, and whether it is drawn at all. */
export interface Shown { model: Model; w: number; d: number }

/**
 * The model of a landmark of `w` × `d` metres (east-west, north-south) as it stands in `year`, null when there is
 * nothing to draw (not yet begun, or drawn with another: the Doge's Palace with St Mark's). A model is turned so that
 * its long side runs as the landmark's does, the front of a church (+z of the model) to the west, and scaled evenly so
 * that its long side has the landmark's length.
 */
export function shownOf(kind: number, named: number, wM: number, dM: number, start: number, end: number, ruined: number, year: number, style: Style, files: ReadonlyMap<string, Batch>): Shown | null {
  const n = named >= 0 ? namedOf(year)[named] ?? null : null;
  if (n?.shape === 'within') return null;
  const built = builtIn(start, end, ruined, year);
  if (built.state === BUILT.not_yet) return null;
  const base = (n?.model ? ownModel(n.model, files) : null) ?? baseOf(kind, n?.shape ?? '', style);
  const W = Math.max(2, Math.round(m(wM))), D = Math.max(2, Math.round(m(dM)));
  // the model's long side is its z; it runs east-west where the landmark is longer that way
  const turn = W >= D && base.d >= base.w, long = Math.max(W, D), k = long / Math.max(base.w, base.d);
  const share = built.state === BUILT.building ? Math.max(LEAST_BUILT, built.share) : 1, ks0 = k * share;
  const fort = base === CASTLE, low = (built.state === BUILT.ruin ? RUIN : 1) * (fort ? Math.min(1, m(CASTLE_TALL) / (base.height * ks0)) : 1);
  const mat = new THREE.Matrix4(), scale = new THREE.Matrix4();
  // the part built so far stands at the east end of the ground (a church was built from its choir)
  const ks = ks0, shift = turn ? (W - W * share) / 2 : 0;
  const model: Model = {
    build: (r) => {
      const b = new Batch();
      mat.makeRotationY(turn ? -Math.PI / 2 : 0).multiply(scale.makeScale(ks, ks * low, ks)).setPosition(shift, 0, 0);
      b.append(base.build(r), mat);
      return b;
    },
    w: W, d: D, height: base.height * ks * low,
  };
  return { model, w: W, d: D };
}
