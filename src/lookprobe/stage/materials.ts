// The stage's materials: every mesh on the stage is drawn with one of these, by the kind of lists it comes as (lists of
// floats or of bytes, faces on the grid of blocks, faces on no grid, the sea's, and those that glide to the next step).
import * as THREE from 'three/webgpu';
import { Fn, If, attribute, dot, float, fract, int, ivec2, materialColor, max, min, mix, positionGeometry, reflector, screenCoordinate, select, uniform, userData, vec2, vec3, vec4, vertexColor } from 'three/tsl';
import { hashBlur } from 'three/addons/tsl/display/hashBlur.js';
import { SEA_Y } from '../layout';
import { OPEN_WATER } from '../terrain';
import { type Sea, createSea } from '../sea';
import { FLIPPED, FACE_STEPS, RISES } from '../faces';
import { flag } from './address';
import { createFields } from './fields';
import { LOOK } from './look';

/** Makes the materials, and the water's mirror where it is drawn (it lies on `scene`). */
export function createMaterials(scene: THREE.Scene) {
  // The pieces come with directions and colours as bytes (worldprobe/small.ts). A corner's colour is then three
  // floats, or four bytes: the share each part has of the brightest, and half that brightest, of which 254 is one.
  // A colour of three floats has a one as its fourth number by the graphics card's rule, which a colour of bytes
  // never has: so both kinds are told apart here, at the corner, and what lies between the corners is the same for
  // both. (`?small=0`: all lists are floats, and a corner's colour is its three floats.)
  // What a triangle shows between its corners is kept within what a corner can show (no corner of a piece is
  // brighter than 1.05). Where a triangle stands almost on its edge to a camera, a bank of the water in the mirror's
  // picture, the colour worked out between its corners runs far out of that at a dot or two, and the mirror's blur
  // made a bright spot of each.
  const MOST = 1.1;
  const smallLists = flag('small', true);
  const tone = attribute('color', 'vec4') as unknown as ReturnType<typeof vec4>;
  const toned = () => materialColor.mul(tone.rgb.mul(select(tone.a.lessThan(254.5 / 255), tone.a.mul((2 * 255) / 254), float(1))).toVarying().clamp(0, MOST));
  const coloured = () => { const m = new THREE.MeshLambertNodeMaterial(); m.colorNode = smallLists ? toned() : materialColor.mul(vertexColor().rgb.clamp(0, MOST)); return m; };
  const solid = coloured();
  // every mesh is drawn on the dots of the picture whose value lies between its two marks (see `dissolve`); the
  // pattern is interleaved gradient noise, which has no stripes or clumps
  const dots = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189)), marks = userData('dots', 'vec2') as unknown as ReturnType<typeof vec2>;
  solid.maskNode = dots.greaterThanEqual(marks.x).and(dots.lessThan(marks.y));
  // what share of the dots a mesh is drawn on is written beside the picture, for putting the picture together from
  // the two sets of dots (see below): the dots from 0 up to a mark as half the mark, those from a mark up to 1 as a
  // half and half the mark; all of the dots is 0.5
  // (written by the picture's own pass alone, for everything on the stage: the mirror's and the shadows' passes have no such second picture)
  const shareCode = select(marks.x.greaterThan(0), marks.x.mul(0.5).add(0.5), marks.y.mul(0.5));
  /** everything on the stage carries its two marks, all the dots unless it is dissolved */
  const marked = (thing: THREE.Object3D) => thing.traverse((part) => { part.userData.dots ??= new THREE.Vector2(0, 1); part.userData.ink ??= 1; });
  // whether a mesh is ground to the map's paper (1) or stands on the ground (0, see Stage.lay)
  // (a mesh that glides to the shape of the coarser step tells for each face what it ends up as, and is that by the
  // share it has glided: see `gliding`)
  const glided = userData('glide', 'float') as unknown as ReturnType<typeof float>;
  const inkOf = Fn((builder: { geometry: THREE.BufferGeometry }) => {
    const own = userData('ink', 'float') as unknown as ReturnType<typeof float>;
    return builder.geometry.hasAttribute('aim') ? mix(own, (attribute('normal', 'vec4') as unknown as ReturnType<typeof vec4>).w, glided) : own;
  })() as unknown as ReturnType<typeof float>;
  // water: a soft mirror image of piers, hulls and houses is laid over the water colour
  let water = solid;
  const tint = uniform(new THREE.Color());
  let mirrored: ReturnType<typeof reflector> | null = null;
  /** how much of the mirror image the water shows, 1 near, 0 from afar (Stage.mirror) */
  const mirrorShare = uniform(1);
  if (flag('mirror', true)) {
    const mirror = mirrored = reflector({ resolutionScale: 0.5 });
    mirror.target.rotateX(-Math.PI / 2);
    mirror.target.position.y = SEA_Y;
    marked(mirror.target); scene.add(mirror.target);
    water = coloured();
    water.maskNode = solid.maskNode;
    // the mirror image is tinted like the water, so a white sail shows as a pale green shape, not as a light.
    // From afar what stands by the water is smaller than the mirror's blur, and the mirror shows the sky alone, which
    // is the picture's background: there it is not drawn (a whole second picture of the scene, every picture), and
    // the water takes the background's colour in its place (see Stage.mirror).
    // (the 24 looks into the mirror's picture that blur it are taken only where it is drawn)
    const sky = new THREE.Color(...OPEN_WATER), open = vec3(sky.r, sky.g, sky.b), blurred = hashBlur(mirror, float(LOOK.mirrorBlur), { repeats: float(24) }).rgb;
    water.emissiveNode = Fn(() => {
      const seen = open.toVar();
      If(mirrorShare.greaterThan(0), () => { seen.assign(mix(open, blurred, mirrorShare)); });
      return seen;
    })().mul(tint);
    const reflecting = mirror.reflector as unknown as { updateBefore(frame: unknown): unknown }, draw = reflecting.updateBefore.bind(reflecting);
    reflecting.updateBefore = (frame) => (mirrorShare.value > 0 ? draw(frame) : undefined);
  }
  // A mesh's rectangles on the grid of blocks come as faces (faces.ts), a row of numbers to each, and their corners
  // are made here: each of the four corners of a face's two triangles knows which of the face's four it is (one way
  // round and the other), and takes its place and its colour from the face's row by that. The numbers of 16 bits
  // reach the shader as shares of 32767 and are whole again before they are used, so a corner lies where the
  // builder put it, to the last bit.
  const lie = attribute('lie', 'vec4') as unknown as ReturnType<typeof vec4>, reach = attribute('reach', 'vec2') as unknown as ReturnType<typeof vec2>;
  const whole = (n: typeof lie.x) => n.mul(32767).add(0.5).floor();
  const kind = whole(lie.x), flipped = kind.greaterThanEqual(FLIPPED), axis = kind.sub(select(flipped, float(FLIPPED), float(0)));
  const corner = select(flipped, positionGeometry.y, positionGeometry.x);
  const level = whole(lie.y).div(FACE_STEPS), alongU = whole(select(corner.greaterThan(0.5).and(corner.lessThan(2.5)), lie.w, lie.z)).div(FACE_STEPS), alongV = whole(select(corner.greaterThan(1.5), reach.y, reach.x)).div(FACE_STEPS);
  // (both ends of a face's spans, whichever corner this is)
  const alongUOther = () => whole(select(corner.greaterThan(0.5).and(corner.lessThan(2.5)), lie.z, lie.w)).div(FACE_STEPS), alongVOther = () => whole(select(corner.greaterThan(1.5), reach.x, reach.y)).div(FACE_STEPS);
  const tones = [0, 1, 2, 3].map((k) => attribute(`tone${k}`, 'vec4') as unknown as ReturnType<typeof vec4>);
  const toneOf = select(corner.lessThan(0.5), tones[0], select(corner.lessThan(1.5), tones[1], select(corner.lessThan(2.5), tones[2], tones[3])));
  const faced = new THREE.MeshLambertNodeMaterial(), placed = select(axis.lessThan(0.5), vec3(level, alongU, alongV), select(axis.lessThan(1.5), vec3(alongU, level, alongV), vec3(alongU, alongV, level)));
  faced.positionNode = placed;
  // (a face's colours are always bytes: see `toned`)
  faced.colorNode = materialColor.mul(toneOf.rgb.mul(toneOf.a.mul((2 * 255) / 254)).toVarying().clamp(0, MOST));
  faced.maskNode = solid.maskNode;
  // The joined tops of a near piece's columns (faces.ts `Field`): placed as the faces are, but a face may span many
  // columns, so its colour is read from the mesh's field, its layer of the texture all such meshes share
  // (`userData.field`: the field's first column x0, z0 and its layer). Each column's four corners are mixed across
  // it as its own face's two triangles did. (A dot on a face's edge is kept to the face's own columns: its place
  // between the corners can come out a hair beyond the edge, and the face reaches a hair over it, worldprobe/tops.ts.)
  const fields = createFields(), fieldAt = userData('field', 'vec3') as unknown as ReturnType<typeof vec3>;
  const spot = vec2(placed.x, placed.z).toVarying(), bounds = vec4(min(alongU, alongUOther()), min(alongV, alongVOther()), max(alongU, alongUOther()), max(alongV, alongVOther())).toVarying();
  const within = spot.sub(fieldAt.xy), column = within.floor().clamp(bounds.xy.sub(fieldAt.xy).ceil(), bounds.zw.sub(fieldAt.xy).floor().sub(1)), across = within.sub(column).clamp(0, 1);
  const first = ivec2(column.mul(2));
  const fieldColour = (layer: Parameters<typeof int>[0]) => {
    const read = (dx: number, dz: number) => { const t = fields.node.load(first.add(ivec2(dx, dz))).depth(int(layer)); return t.rgb.mul(t.a.mul((2 * 255) / 254)); };
    return mix(mix(read(0, 0), read(1, 0), across.x), mix(read(0, 1), read(1, 1), across.x), across.y);
  };
  const fieldFaced = new THREE.MeshLambertNodeMaterial();
  fieldFaced.positionNode = placed;
  fieldFaced.colorNode = materialColor.mul(fieldColour(fieldAt.z).clamp(0, MOST));
  fieldFaced.maskNode = solid.maskNode;
  // Such tops of a far piece that glide to the shape of the coarser step (worldprobe/glide.ts): each moves to the level
  // it ends up at, and its colours to those of the field of where it ends (`userData.fieldEnd`, its layer).
  const fieldGliding = new THREE.MeshLambertNodeMaterial(), ends = attribute('aim', 'vec2') as unknown as ReturnType<typeof vec2>;
  fieldGliding.positionNode = vec3(alongU, mix(whole(lie.y), whole(ends.x), glided).div(FACE_STEPS), alongV);
  fieldGliding.colorNode = materialColor.mul(mix(fieldColour(fieldAt.z), fieldColour(userData('fieldEnd', 'float') as unknown as ReturnType<typeof float>), glided).clamp(0, MOST));
  fieldGliding.maskNode = solid.maskNode;
  // The sea's faces: its level is on no 64th of a block, so the mesh says how far above their numbers its faces lie
  // (faces.ts `lift`); and they mirror as the sea's lists do.
  const seaFaced = new THREE.MeshLambertNodeMaterial();
  seaFaced.positionNode = placed.add(vec3(0, userData('lift', 'float') as unknown as ReturnType<typeof float>, 0));
  seaFaced.colorNode = faced.colorNode; seaFaced.maskNode = solid.maskNode; seaFaced.emissiveNode = water.emissiveNode;
  // The sea's depth and its surface (see `Stage.sea`, `?sea=0` leaves both out). Lists and faces of the sea take the
  // same nodes, so that the sea does not change where the view passes from one step to the next.
  let surface: Sea | null = null;
  if (water !== solid && flag('sea', true)) {
    surface = createSea(water.emissiveNode);
    water.colorNode = surface.colour(water.colorNode!); seaFaced.colorNode = surface.colour(faced.colorNode!);
    water.normalNode = seaFaced.normalNode = surface.normal;
    water.emissiveNode = seaFaced.emissiveNode = surface.mirror;
  }
  // A mesh's upright and level rectangles on no grid come as faces of floats (faces.ts `Free`): a corner takes the
  // very floats the builder made, the level on the face's axis and an end of each of its two spans. The face's
  // direction tells its axis, and the fourth number beside it which way its triangles turn.
  const levelF = attribute('freeLevel', 'float') as unknown as ReturnType<typeof float>, spans = attribute('freeSpans', 'vec4') as unknown as ReturnType<typeof vec4>, towards4 = attribute('normal', 'vec4') as unknown as ReturnType<typeof vec4>;
  const cornerF = select(towards4.w.greaterThan(0.004), positionGeometry.y, positionGeometry.x);
  const alongUF = select(cornerF.greaterThan(0.5).and(cornerF.lessThan(2.5)), spans.y, spans.x), alongVF = select(cornerF.greaterThan(1.5), spans.w, spans.z);
  const toneF = select(cornerF.lessThan(0.5), tones[0], select(cornerF.lessThan(1.5), tones[1], select(cornerF.lessThan(2.5), tones[2], tones[3])));
  const freed = new THREE.MeshLambertNodeMaterial();
  freed.positionNode = select(towards4.x.abs().greaterThan(0.5), vec3(levelF, alongUF, alongVF), select(towards4.y.abs().greaterThan(0.5), vec3(alongUF, levelF, alongVF), vec3(alongUF, alongVF, levelF)));
  freed.colorNode = materialColor.mul(toneF.rgb.mul(toneF.a.mul((2 * 255) / 254)).toVarying().clamp(0, MOST));
  freed.maskNode = solid.maskNode;
  // Faces that glide to the shape of the next coarser step (worldprobe/glide.ts): each has the level or the span in
  // height it ends up at and the colours of its corners there, and the mesh says how far it has glided (0 … 1,
  // `Stage.glide`). A level face moves to its level there. An upright face's two ends in height move each to its own;
  // where they would pass each other the face has no height, since by then the column it faced stands above its own.
  const aimed = attribute('aim', 'vec2') as unknown as ReturnType<typeof vec2>;
  const rises = kind.greaterThanEqual(RISES), kindG = kind.sub(select(rises, float(RISES), float(0))), flippedG = kindG.greaterThanEqual(FLIPPED), axisG = kindG.sub(select(flippedG, float(FLIPPED), float(0)));
  const cornerG = select(flippedG, positionGeometry.y, positionGeometry.x), upright = axisG.lessThan(0.5).or(axisG.greaterThan(1.5)), alongX = axisG.lessThan(0.5);
  const u0 = whole(lie.z), u1 = whole(lie.w), v0 = whole(reach.x), v1 = whole(reach.y), from0 = select(alongX, u0, v0), from1 = select(alongX, u1, v1);
  const end0 = mix(from0, whole(aimed.x), glided), way = select(rises, float(1), select(from1.lessThan(from0), float(-1), float(1))), end1 = end0.add(way.mul(max(way.mul(mix(from1, whole(aimed.y), glided).sub(end0)), 0)));
  const levelG = select(upright, whole(lie.y), mix(whole(lie.y), whole(aimed.x), glided)).div(FACE_STEPS);
  const second = cornerG.greaterThan(0.5).and(cornerG.lessThan(2.5)), third = cornerG.greaterThan(1.5);
  const alongUG = select(second, select(alongX, end1, u1), select(alongX, end0, u0)).div(FACE_STEPS), alongVG = select(third, select(axisG.greaterThan(1.5), end1, v1), select(axisG.greaterThan(1.5), end0, v0)).div(FACE_STEPS);
  const aims = [0, 1, 2, 3].map((k) => attribute(`aimTone${k}`, 'vec4') as unknown as ReturnType<typeof vec4>);
  const pick = (four: typeof tones) => { const t = select(cornerG.lessThan(0.5), four[0], select(cornerG.lessThan(1.5), four[1], select(cornerG.lessThan(2.5), four[2], four[3]))); return t.rgb.mul(t.a.mul((2 * 255) / 254)); };
  const gliding = new THREE.MeshLambertNodeMaterial();
  gliding.positionNode = select(axisG.lessThan(0.5), vec3(levelG, alongUG, alongVG), select(axisG.lessThan(1.5), vec3(alongUG, levelG, alongVG), vec3(alongUG, alongVG, levelG)));
  gliding.colorNode = materialColor.mul(mix(pick(tones), pick(aims), glided).toVarying().clamp(0, MOST));
  gliding.maskNode = solid.maskNode;
  // Lists that move with such a glide (the banks of the water, water above the sea, what stands on the ground):
  // each corner has the height it ends up at.
  const sinking = coloured();
  sinking.maskNode = solid.maskNode;
  sinking.positionNode = vec3(positionGeometry.x, mix(positionGeometry.y, attribute('sink', 'float') as unknown as ReturnType<typeof float>, glided), positionGeometry.z);
  return { smallLists, solid, water, faced, fieldFaced, fieldGliding, fields, seaFaced, freed, gliding, sinking, surface, mirrored, tint, mirrorShare, shareCode, inkOf, marked };
}
export type Materials = ReturnType<typeof createMaterials>;
