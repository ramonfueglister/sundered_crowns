// The glide from a step of the map to the next coarser one. A coarser step has blocks twice as wide: where the view
// changed steps, every hill, wood and town of the picture changed its shape at once, and the land its grain. Now a
// piece of a far step knows what the piece of the coarser step over it shows at each of its columns, the height of
// the coarser column there and the colours of its top, and over the last stretch before the border the stage moves
// each column towards that (stage/materials.ts `gliding`, pieces.ts `GLIDE`): four columns close up into the one block that
// takes their place. At the border the piece shows what the coarser piece shows, column for column, so the change of
// steps changes nothing on the land. A view at rest anywhere in that stretch shows one step, with its columns part
// of the way: nothing is drawn twice. (Continuous distance-dependent level of detail, Strugar 2009, does the same for
// a height field: a vertex moves to where the coarser mesh has it before the meshes change places.)
//
// What glides:
//  - the tops of the land's columns and what they carry, their sides, and the colours of both. Between two columns
//    that the coarser step sets apart in height a side is added that has no height until they part.
//  - the coast. A column of land that is water in the coarser step sinks to that step's bed, and the water that is
//    to stand over it lies under it from the start. A column of water that is land in the coarser step has a top
//    that comes up from its bed. So the coast moves to the coarser step's coast column by column, each as its top
//    passes the water's level.
//  - water above the sea's level (lakes, rivers) moves to the level the coarser step has it at.
//  - the banks of the water (shore.ts), which are no faces but lists: the piece's own sink under the water, and
//    those of the coarser piece, which the piece carries too, come up from under it (stage/materials.ts `sinking`: each corner
//    of such a list knows the height it ends up at).
//  - the beds of such water, which are not drawn: the sides of the land that stand in the water follow them, so
//    they reach under the water at whatever level it ends.
//  - what stands on the ground as a thing of its own (the landmarks of the finest far step), which the coarser step
//    does not have: it goes down into its column. The houses drawn as houses (houses.ts) that the coarser step draws
//    too end where it has them, corner by corner; the others go down into their columns.
//  - what the columns carry as faces inside a column (the crowns of the woods, lookprobe/terrain_woods.ts `woodsOf`):
//    the piece's own go down into their column, and those of the coarser piece, which the piece carries too, come up
//    from under it to where that piece has them.
// What stays as it is and changes at the border, in the short dissolve as before (pieces.ts): the colours of the
// water, and the sea where the coarser step has water above the sea's level.
//
// The targets are worked out where the piece is built, from the tables of the two pieces (table.ts): the coarser one
// has a table built ahead, and the part of it that lies over the piece is drawn here for its colours.
import { Batch } from '../lookprobe/batch';
import type { Shape } from '../lookprobe/shape';
import { type Above, read } from './glide_above';
import { columnsOf } from './glide_columns';
import { aimFaces, comingCrowns, comingFaces } from './glide_faces';
import { ownBanks, raisedWater, sinkingWater, theirBanks, thingsDown } from './glide_lists';
import { faced, small } from './small';
import { type Table, drawBanks, drawLand } from './table';

/**
 * Gives a piece its targets in the piece of the coarser step over it (see the head of the file): `shapes` are the
 * piece's meshes as the worker hands them over (small.ts `faced`, `small`), `fine` the table of its columns and
 * `parent` that of the coarser piece. The faces of the land get `aim` and `aimCol`, and the fourth byte of their
 * direction says whether the column they end up on is ground to the map's paper; the ground gets the tops and sides
 * that are to come and the coarser piece's banks, the water what is to stand where land sinks; the lists that move
 * get `sink`. `step`: the piece's step of the map. Returns how many columns glide.
 */
export function glide(
  shapes: { ground: Shape; carried?: Shape; things?: Shape; water?: Shape; raised?: Shape },
  fine: Table,
  parent: Table,
  bakedSky: boolean,
  step: number,
): number {
  const pn = parent.side,
    own = fine.part;
  // the coarser piece's own columns over this piece, drawn for their colours
  const qx = Math.floor((fine.ox + own.x0) / 2) - parent.ox,
    qz = Math.floor((fine.oz + own.z0) / 2) - parent.oz,
    wide = (own.x1 - own.x0) / 2,
    deep = (own.z1 - own.z0) / 2;
  if (qx < 1 || qz < 1 || qx + wide >= pn || qz + deep >= pn) return 0;
  const quarter = { x0: qx, z0: qz, x1: qx + wide, z1: qz + deep },
    drawn = drawLand(parent, bakedSky, quarter, step + 1);
  const above: Above = {
    side: pn,
    tops: new Float32Array(pn * pn * 12),
    has: new Uint8Array(pn * pn),
    ink: new Uint8Array(pn * pn),
    sides: new Map(),
  };
  read(above, faced(drawn.ground).faces, 1);
  const theirCarried = drawn.carried ? faced(drawn.carried).faces : undefined;
  read(above, theirCarried, 0);

  const c = columnsOf(fine, parent, above);
  if (!c.gliding) return 0;
  aimFaces(c, shapes.ground, 127);
  aimFaces(c, shapes.carried, 0, true);
  if (!shapes.ground.faces?.aim) return c.gliding;
  comingFaces(c, shapes.ground);
  if (shapes.carried && theirCarried) comingCrowns(c, shapes.carried, theirCarried);

  // The lists: what is no face moves by the height each of its corners ends up at.
  if (c.water) {
    ownBanks(c, shapes.ground);
    theirBanks(c, shapes.ground, small(c.theirs ? drawBanks(parent, bakedSky, quarter) : new Batch()));
  }
  const raised = shapes.raised;
  if (raised?.pos.length) raisedWater(c, raised);
  if (c.coast && shapes.water && raised) sinkingWater(c, shapes.water, raised);
  if (shapes.things?.pos.length) thingsDown(c, shapes.things);
  return c.gliding;
}
