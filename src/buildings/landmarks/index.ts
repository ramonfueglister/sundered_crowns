// The monuments of data/content/landmarks.json that have a model of their own. 2 of 29 so far.
import type { Model } from '../model';
import { hagiaSophia } from './hagia-sophia';
import { basilica, campanile, palace } from './st-marks';

/** One building of a monument, set off from the monument's site by (dx, dz) blocks. */
export interface MonumentPart { model: Model; dx: number; dz: number }

/** The monuments that have a model, by their id in landmarks.json: each a group of buildings. */
export const MONUMENTS: Record<string, readonly MonumentPart[]> = {
  hagia_sophia: [{ model: { build: hagiaSophia, w: 18, d: 20, height: 14 }, dx: 0, dz: 0 }],
  st_marks_basilica: [
    { model: { build: basilica, w: 13, d: 11, height: 9 }, dx: 0, dz: 0 },
    { model: { build: campanile, w: 4, d: 4, height: 20 }, dx: 10, dz: 0 },
    { model: { build: palace, w: 9, d: 24, height: 9.4 }, dx: 0, dz: 14 },
  ],
};
