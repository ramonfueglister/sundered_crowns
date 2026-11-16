// The monuments of data/content/landmarks.json that have a model of their own. 2 of 29 so far. A part is built by hand
// in code, or read from a file that tools/blender wrote from a measure file (public/models/landmarks/); the world's
// workers fetch those files once (worldprobe/models.ts) and resolve the parts with modelOf().
import type { Batch } from '../../lookprobe/batch';
import type { Model } from '../model';
import { hagiaSophia } from './hagia-sophia';
import { basilica, palace } from './st-marks';

/** A model in a file under public/models/landmarks/, with the ground and height it takes, in blocks. */
export interface FileModel { file: string; w: number; d: number; height: number }
/** One building of a monument, set off from the monument's site by (dx, dz) blocks. */
export interface MonumentPart { model: Model | FileModel; dx: number; dz: number }

export const isFile = (model: Model | FileModel): model is FileModel => 'file' in model;

/** The monuments that have a model, by their id in landmarks.json: each a group of buildings. */
export const MONUMENTS: Record<string, readonly MonumentPart[]> = {
  hagia_sophia: [{ model: { build: hagiaSophia, w: 18, d: 20, height: 14 }, dx: 0, dz: 0 }],
  // The group is laid out as the square is: the basilica's front faces +z (the real west, towards the Piazza) and +x is
  // the real south, towards the Piazzetta and the water. Offsets are blocks at the basilica's scale (13 blocks for its
  // 76 m, about 5.9 m a block); a block of the land is about 130 m, so the group lies far apart on the ground, like
  // every building of the diorama.
  st_marks_basilica: [
    { model: { build: basilica, w: 13, d: 11, height: 9 }, dx: 0, dz: 0 },
    // 12 m square and 106 m to the finial at 3.65 m a block (tools/blender/landmarks/campanile_san_marco_1356.json);
    // it stands free in the corner of the Piazza and the Piazzetta, in front of the basilica's south-west corner (the
    // real 50 m west of the front and 40 m south of the axis, read off the plan of the square, assumption ±10 m, would
    // be 8 and 7 blocks; the land of the lagoon's islands is too small for that, so it stands a block off the corner;
    // settle.ts moves a monument to the nearest free dry ground within 14 blocks and drops it beyond)
    { model: { file: 'campanile_san_marco_1356.glb', w: 3, d: 3, height: 29.1 }, dx: 4, dz: 8 },
    // the palace adjoins the basilica's south flank, its west front on the line of the basilica's front and its long
    // front on the water to the south (assumption from the plan of the square)
    { model: { build: palace, w: 9, d: 24, height: 9.4 }, dx: 11, dz: -7 },
  ],
};

/** Every file the monuments read, each once. */
export const MONUMENT_FILES: readonly string[] = [...new Set(Object.values(MONUMENTS).flat().map((p) => p.model).filter(isFile).map((m) => m.file))];

/** The model of a part: its own, or the one read from its file. A file model is the same batch wherever it stands. */
export function modelOf(part: MonumentPart, files: ReadonlyMap<string, Batch>): Model {
  const m = part.model;
  if (!isFile(m)) return m;
  const batch = files.get(m.file);
  if (!batch) throw new Error(`landmarks: ${m.file} is not loaded`);
  return { build: () => batch, w: m.w, d: m.d, height: m.height };
}
