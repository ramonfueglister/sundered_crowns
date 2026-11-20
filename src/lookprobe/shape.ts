// What the stage draws, as the builders of the world hand it over (in the workers too: so this file imports types alone,
// and the stage's own code is not part of what the pieces are made of, tools/stamp/piece_key.ts).
import type { Batch } from './batch';
import type { Figures } from '../figures/stage';
import type { Faces, Field, Free } from './faces';

/**
 * A mesh as flat lists: three numbers per corner for position, direction and colour. A `Batch` is one. Or, where
 * `small`, direction and colour as four bytes per corner each (worldprobe/small.ts): 20 bytes to a corner, not 36.
 */
export interface Shape {
  pos: ArrayLike<number>;
  nor: ArrayLike<number>;
  col: ArrayLike<number>;
  /** the ball around all its points, middle and radius, where its builder has worked it out (else the stage does, on the page's thread) */
  ball?: [number, number, number, number];
  small?: boolean;
  /**
   * its rectangles on the grid of blocks, taken out of the lists (faces.ts): the stage draws them beside what the
   * lists hold, as a mesh of its own. Not of what `more` adds.
   */
  faces?: Faces;
  /** its upright and level rectangles on no grid, taken out of the lists likewise (faces.ts `Free`) */
  free?: Free;
  /** the level tops of its columns, taken out of `faces` and joined where they lie side by side at one height (faces.ts `Field`) */
  tops?: Field;
  /**
   * Of lists that move as the mesh glides to the shape of the next coarser step (worldprobe/glide.ts): the height each
   * corner ends up at.
   */
  sink?: Float32Array;
}
export interface StageScene<S extends Shape = Batch> {
  ground: S;
  things: S;
  /** the sea, which mirrors what stands beside it */
  water: S;
  /** water above sea level (lakes, rivers): drawn plain, because the mirror lies at sea level */
  raised?: S;
  /** what the columns of the ground carry as part of themselves (terrain.ts `carried`): ground to a click, but to the map's paper what stands on the ground */
  carried?: S;
  /** the people standing and walking on it (figures/crowd.ts) */
  figures?: Figures;
  counts: Record<string, number>;
}
