// The materials of a mesh's faces (../faces.ts): its rectangles on the grid of blocks (`faced`), the joined tops of a
// near piece's columns coloured from the shape's field (`fieldFaced`) and such tops that glide (`fieldGliding`), the
// faces that glide to the shape of the next coarser step (`gliding`), and the rectangles on no grid (`freed`). The
// fields among them show the world's day (seasons.ts): the ground's faces take the colour their column shows, what
// stands on the ground the colour and the height its sheaf's corner shows.
// (TSL types its attribute and userData nodes loosely: each is cast to the kind of value it holds.)
import * as THREE from 'three/webgpu';
import {
  attribute,
  float,
  int,
  ivec2,
  materialColor,
  max,
  min,
  mix,
  positionGeometry,
  select,
  userData,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { FACE_STEPS, FLIPPED, RISES } from '../faces';
import { createFields } from './fields';
import type { Seasons } from './seasons';
import { MOST, atCorner, bytesColour } from './tones';

/**
 * A mesh's rectangles on the grid of blocks come as faces (faces.ts), a row of numbers to each, and their corners
 * are made here: each of the four corners of a face's two triangles knows which of the face's four it is (one way
 * round and the other), and takes its place and its colour from the face's row by that. The numbers of 16 bits
 * reach the shader as shares of 32767 and are whole again before they are used, so a corner lies where the
 * builder put it, to the last bit.
 */
function onGrid() {
  const lie = attribute('lie', 'vec4'),
    reach = attribute('reach', 'vec2');
  const whole = (n: typeof lie.x) => n.mul(32767).add(0.5).floor();
  const kind = whole(lie.x),
    flipped = kind.greaterThanEqual(FLIPPED),
    axis = kind.sub(select(flipped, float(FLIPPED), float(0)));
  const corner = select(flipped, positionGeometry.y, positionGeometry.x);
  const level = whole(lie.y).div(FACE_STEPS),
    alongU = whole(select(corner.greaterThan(0.5).and(corner.lessThan(2.5)), lie.w, lie.z)).div(FACE_STEPS),
    alongV = whole(select(corner.greaterThan(1.5), reach.y, reach.x)).div(FACE_STEPS);
  // (both ends of a face's spans, whichever corner this is)
  const alongUOther = () =>
      whole(select(corner.greaterThan(0.5).and(corner.lessThan(2.5)), lie.z, lie.w)).div(FACE_STEPS),
    alongVOther = () => whole(select(corner.greaterThan(1.5), reach.x, reach.y)).div(FACE_STEPS);
  const tones = [0, 1, 2, 3].map((k) => attribute(`tone${k}`, 'vec4'));
  const placed = select(
    axis.lessThan(0.5),
    vec3(level, alongU, alongV),
    select(axis.lessThan(1.5), vec3(alongU, level, alongV), vec3(alongU, alongV, level)),
  );
  const towards = attribute('normal', 'vec4');
  /** the column a dot of a face lies on, from a corner at `at`: a level face's own, an upright face's behind it */
  const spotOf = (at: typeof placed) => vec2(at.x, at.z).sub(vec2(towards.x, towards.z).mul(0.5)).toVarying();
  return { lie, reach, whole, kind, corner, alongU, alongV, alongUOther, alongVOther, tones, placed, spotOf };
}
type Grid = ReturnType<typeof onGrid>;

/**
 * The joined tops of a near piece's columns (faces.ts `Field`): placed as the faces are, but a face may span many
 * columns, so its colour is read from the mesh's field, its layer of the texture all such meshes share
 * (`userData.field`: the field's first column x0, z0 and its layer). Each column's four corners are mixed across
 * it as its own face's two triangles did. (A dot on a face's edge is kept to the face's own columns: its place
 * between the corners can come out a hair beyond the edge, and the face reaches a hair over it, worldprobe/tops.ts.)
 */
function fieldMaterials(g: Grid, mask: THREE.Node<'bool'>, glided: ReturnType<typeof float>, seasons: Seasons) {
  const { lie, whole, alongU, alongV, alongUOther, alongVOther, placed } = g;
  // (three's types give a userData node no kind of value: here and below each is cast to the kind it is read as)
  const fields = createFields(),
    fieldAt = userData('field', 'vec3') as unknown as ReturnType<typeof vec3>;
  const spot = vec2(placed.x, placed.z).toVarying(),
    bounds = vec4(
      min(alongU, alongUOther()),
      min(alongV, alongVOther()),
      max(alongU, alongUOther()),
      max(alongV, alongVOther()),
    ).toVarying();
  const within = spot.sub(fieldAt.xy),
    column = within.floor().clamp(bounds.xy.sub(fieldAt.xy).ceil(), bounds.zw.sub(fieldAt.xy).floor().sub(1)),
    across = within.sub(column).clamp(0, 1);
  const first = ivec2(column.mul(2));
  const fieldColour = (layer: Parameters<typeof int>[0]) => {
    const read = (dx: number, dz: number) => bytesColour(fields.node.load(first.add(ivec2(dx, dz))).depth(int(layer)));
    return mix(mix(read(0, 0), read(1, 0), across.x), mix(read(0, 1), read(1, 1), across.x), across.y);
  };
  // (the column's colour by the season: the field's first column is the season map's, the piece's own first)
  const season = seasons.ground(column.add(vec2(fieldAt.x, fieldAt.y)).add(0.5));
  const fieldFaced = new THREE.MeshLambertNodeMaterial();
  fieldFaced.positionNode = placed;
  fieldFaced.colorNode = materialColor.mul(season(fieldColour(fieldAt.z).clamp(0, MOST)).clamp(0, MOST));
  fieldFaced.maskNode = mask;
  // Such tops of a far piece that glide to the shape of the coarser step (worldprobe/glide.ts): each moves to the level
  // it ends up at, and its colours to those of the field of where it ends (`userData.fieldEnd`, its layer).
  const fieldGliding = new THREE.MeshLambertNodeMaterial(),
    ends = attribute('aim', 'vec2');
  fieldGliding.positionNode = vec3(alongU, mix(whole(lie.y), whole(ends.x), glided).div(FACE_STEPS), alongV);
  fieldGliding.colorNode = materialColor.mul(
    season(
      mix(
        fieldColour(fieldAt.z),
        fieldColour(userData('fieldEnd', 'float') as unknown as ReturnType<typeof float>),
        glided,
      ).clamp(0, MOST),
    ).clamp(0, MOST),
  );
  fieldGliding.maskNode = mask;
  return { fields, fieldFaced, fieldGliding };
}

/**
 * Faces that glide to the shape of the next coarser step (worldprobe/glide.ts): each has the level or the span in
 * height it ends up at and the colours of its corners there, and the mesh says how far it has glided (0 … 1,
 * `Stage.glide`). A level face moves to its level there. An upright face's two ends in height move each to its own;
 * where they would pass each other the face has no height, since by then the column it faced stands above its own.
 */
function glidingMaterial(g: Grid, mask: THREE.Node<'bool'>, glided: ReturnType<typeof float>, seasons: Seasons) {
  const { lie, reach, whole, kind, tones } = g;
  const aimed = attribute('aim', 'vec2');
  const rises = kind.greaterThanEqual(RISES),
    kindG = kind.sub(select(rises, float(RISES), float(0))),
    flippedG = kindG.greaterThanEqual(FLIPPED),
    axisG = kindG.sub(select(flippedG, float(FLIPPED), float(0)));
  const cornerG = select(flippedG, positionGeometry.y, positionGeometry.x),
    upright = axisG.lessThan(0.5).or(axisG.greaterThan(1.5)),
    alongX = axisG.lessThan(0.5);
  const u0 = whole(lie.z),
    u1 = whole(lie.w),
    v0 = whole(reach.x),
    v1 = whole(reach.y),
    from0 = select(alongX, u0, v0),
    from1 = select(alongX, u1, v1);
  const end0 = mix(from0, whole(aimed.x), glided),
    way = select(rises, float(1), select(from1.lessThan(from0), float(-1), float(1))),
    end1 = end0.add(way.mul(max(way.mul(mix(from1, whole(aimed.y), glided).sub(end0)), 0)));
  const levelG = select(upright, whole(lie.y), mix(whole(lie.y), whole(aimed.x), glided)).div(FACE_STEPS);
  const second = cornerG.greaterThan(0.5).and(cornerG.lessThan(2.5)),
    third = cornerG.greaterThan(1.5);
  const alongUG = select(second, select(alongX, end1, u1), select(alongX, end0, u0)).div(FACE_STEPS),
    alongVG = select(third, select(axisG.greaterThan(1.5), end1, v1), select(axisG.greaterThan(1.5), end0, v0)).div(
      FACE_STEPS,
    );
  const aims = [0, 1, 2, 3].map((k) => attribute(`aimTone${k}`, 'vec4'));
  const pick = (four: typeof tones) => bytesColour(atCorner(cornerG, four));
  const gliding = new THREE.MeshLambertNodeMaterial(),
    at = select(
      axisG.lessThan(0.5),
      vec3(levelG, alongUG, alongVG),
      select(axisG.lessThan(1.5), vec3(alongUG, levelG, alongVG), vec3(alongUG, alongVG, levelG)),
    );
  gliding.positionNode = at;
  gliding.colorNode = materialColor.mul(
    seasons
      .ground(g.spotOf(at))(mix(pick(tones), pick(aims), glided).toVarying().clamp(0, MOST))
      .clamp(0, MOST),
  );
  gliding.maskNode = mask;
  return gliding;
}

/**
 * A mesh's upright and level rectangles on no grid come as faces of floats (faces.ts `Free`): a corner takes the
 * very floats the builder made, the level on the face's axis and an end of each of its two spans. The face's
 * direction tells its axis, and the fourth number beside it which way its triangles turn.
 */
function freeMaterial(tones: Grid['tones'], mask: THREE.Node<'bool'>, seasons: Seasons) {
  const levelF = attribute('freeLevel', 'float'),
    spans = attribute('freeSpans', 'vec4'),
    towards4 = attribute('normal', 'vec4');
  const cornerF = select(towards4.w.greaterThan(0.004), positionGeometry.y, positionGeometry.x);
  const alongUF = select(cornerF.greaterThan(0.5).and(cornerF.lessThan(2.5)), spans.y, spans.x),
    alongVF = select(cornerF.greaterThan(1.5), spans.w, spans.z);
  const toneF = atCorner(cornerF, tones);
  const freed = new THREE.MeshLambertNodeMaterial(),
    standing = seasons.standing(
      select(
        towards4.x.abs().greaterThan(0.5),
        vec3(levelF, alongUF, alongVF),
        select(towards4.y.abs().greaterThan(0.5), vec3(alongUF, levelF, alongVF), vec3(alongUF, alongVF, levelF)),
      ),
      towards4.xyz,
    );
  freed.positionNode = standing.position;
  freed.colorNode = materialColor.mul(standing.tint(bytesColour(toneF)).toVarying().clamp(0, MOST));
  freed.maskNode = mask;
  return freed;
}

/**
 * The faces' materials: `mask` tells the dots of the picture a mesh is drawn on (see `marks` in materials.ts),
 * `glided` how far a mesh that glides has glided, `seasons` what the fields show on the world's day. `placed` is where
 * a face's corner lies and `facedColour` a face's colour as the piece has it, for the sea's faces.
 */
export function faceMaterials(mask: THREE.Node<'bool'>, glided: ReturnType<typeof float>, seasons: Seasons) {
  const g = onGrid();
  const faced = new THREE.MeshLambertNodeMaterial();
  faced.positionNode = g.placed;
  // (a face's colours are always bytes: see `toned` in materials.ts)
  const cornerColour = bytesColour(atCorner(g.corner, g.tones)).toVarying().clamp(0, MOST),
    facedColour = materialColor.mul(cornerColour);
  faced.colorNode = materialColor.mul(seasons.ground(g.spotOf(g.placed))(cornerColour).clamp(0, MOST));
  faced.maskNode = mask;
  const { fields, fieldFaced, fieldGliding } = fieldMaterials(g, mask, glided, seasons);
  return {
    placed: g.placed,
    corner: g.corner,
    faced,
    facedColour,
    fields,
    fieldFaced,
    fieldGliding,
    gliding: glidingMaterial(g, mask, glided, seasons),
    freed: freeMaterial(g.tones, mask, seasons),
    /** one more material of the faces on no grid, for a kind of them that is drawn in its own way (materials.ts: water above the sea) */
    freedAnew: () => freeMaterial(g.tones, mask, seasons),
  };
}
