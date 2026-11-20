// The stage's materials: every mesh on the stage is drawn with one of these, by the kind of lists it comes as (lists of
// floats or of bytes, faces on the grid of blocks, faces on no grid, the sea's, and those that glide to the next step).
// The faces' own are made in face_materials.ts.
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  attribute,
  dot,
  float,
  fract,
  materialColor,
  mix,
  positionGeometry,
  reflector,
  screenCoordinate,
  select,
  uniform,
  userData,
  vec2,
  vec3,
  vertexColor,
} from 'three/tsl';
import { hashBlur } from 'three/addons/tsl/display/hashBlur.js';
import { SEA_Y } from '../layout';
import { OPEN_WATER } from '../terrain';
import { type Sea, createSea } from '../sea';
import { flag } from './address';
import { faceMaterials } from './face_materials';
import { LOOK } from './look';
import { MOST } from './tones';

/** Makes the materials, and the water's mirror where it is drawn (it lies on `scene`). */
export function createMaterials(scene: THREE.Scene) {
  // The pieces come with directions and colours as bytes (worldprobe/small.ts). A corner's colour is then three
  // floats, or four bytes: the share each part has of the brightest, and half that brightest, of which 254 is one.
  // A colour of three floats has a one as its fourth number by the graphics card's rule, which a colour of bytes
  // never has: so both kinds are told apart here, at the corner, and what lies between the corners is the same for
  // both. (`?small=0`: all lists are floats, and a corner's colour is its three floats.) What a triangle shows
  // between its corners is kept within MOST (tones.ts).
  const smallLists = flag('small', true);
  const tone = attribute('color', 'vec4');
  const toned = () =>
    materialColor.mul(
      tone.rgb
        .mul(select(tone.a.lessThan(254.5 / 255), tone.a.mul((2 * 255) / 254), float(1)))
        .toVarying()
        .clamp(0, MOST),
    );
  const coloured = () => {
    const m = new THREE.MeshLambertNodeMaterial();
    m.colorNode = smallLists ? toned() : materialColor.mul(vertexColor().rgb.clamp(0, MOST));
    return m;
  };
  const solid = coloured();
  // every mesh is drawn on the dots of the picture whose value lies between its two marks (see `dissolve`); the
  // pattern is interleaved gradient noise, which has no stripes or clumps
  // (three's types give a userData node no kind of value: here and below each is cast to the kind it is read as)
  const dots = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189)),
    marks = userData('dots', 'vec2') as unknown as ReturnType<typeof vec2>,
    drawn = dots.greaterThanEqual(marks.x).and(dots.lessThan(marks.y));
  solid.maskNode = drawn;
  // what share of the dots a mesh is drawn on is written beside the picture, for putting the picture together from
  // the two sets of dots (see below): the dots from 0 up to a mark as half the mark, those from a mark up to 1 as a
  // half and half the mark; all of the dots is 0.5
  // (written by the picture's own pass alone, for everything on the stage: the mirror's and the shadows' passes have no such second picture)
  const shareCode = select(marks.x.greaterThan(0), marks.x.mul(0.5).add(0.5), marks.y.mul(0.5));
  /** everything on the stage carries its two marks, all the dots unless it is dissolved */
  const marked = (thing: THREE.Object3D) =>
    thing.traverse((part) => {
      part.userData.dots ??= new THREE.Vector2(0, 1);
      part.userData.ink ??= 1;
    });
  // whether a mesh is ground to the map's paper (1) or stands on the ground (0, see Stage.lay)
  // (a mesh that glides to the shape of the coarser step tells for each face what it ends up as, and is that by the
  // share it has glided: see `gliding` in face_materials.ts)
  const glided = userData('glide', 'float') as unknown as ReturnType<typeof float>;
  const inkOf = Fn((builder: { geometry: THREE.BufferGeometry }) => {
    const own = userData('ink', 'float') as unknown as ReturnType<typeof float>;
    return builder.geometry.hasAttribute('aim') ? mix(own, attribute('normal', 'vec4').w, glided) : own;
  })();
  // water: a soft mirror image of piers, hulls and houses is laid over the water colour
  let water = solid;
  const tint = uniform(new THREE.Color());
  let mirrored: ReturnType<typeof reflector> | null = null;
  /** how much of the mirror image the water shows, 1 near, 0 from afar (Stage.mirror) */
  const mirrorShare = uniform(1);
  if (flag('mirror', true)) {
    const mirror = reflector({ resolutionScale: 0.5 });
    mirrored = mirror;
    mirror.target.rotateX(-Math.PI / 2);
    mirror.target.position.y = SEA_Y;
    marked(mirror.target);
    scene.add(mirror.target);
    water = coloured();
    water.maskNode = drawn;
    // the mirror image is tinted like the water, so a white sail shows as a pale green shape, not as a light.
    // From afar what stands by the water is smaller than the mirror's blur, and the mirror shows the sky alone, which
    // is the picture's background: there it is not drawn (a whole second picture of the scene, every picture), and
    // the water takes the background's colour in its place (see Stage.mirror).
    // (the 24 looks into the mirror's picture that blur it are taken only where it is drawn)
    const sky = new THREE.Color(...OPEN_WATER),
      open = vec3(sky.r, sky.g, sky.b),
      blurred = hashBlur(mirror, float(LOOK.mirrorBlur), { repeats: float(24) }).rgb;
    water.emissiveNode = Fn(() => {
      const seen = open.toVar();
      If(mirrorShare.greaterThan(0), () => {
        seen.assign(mix(open, blurred, mirrorShare));
      });
      return seen;
    })().mul(tint);
    const reflecting = mirror.reflector as unknown as { updateBefore(frame: unknown): unknown },
      draw = reflecting.updateBefore.bind(reflecting);
    reflecting.updateBefore = (frame) => (mirrorShare.value > 0 ? draw(frame) : undefined);
  }
  // the faces' materials (face_materials.ts)
  const { placed, faced, fields, fieldFaced, fieldGliding, gliding, freed } = faceMaterials(drawn, glided);
  // The sea's faces: its level is on no 64th of a block, so the mesh says how far above their numbers its faces lie
  // (faces.ts `lift`); and they mirror as the sea's lists do.
  const seaFaced = new THREE.MeshLambertNodeMaterial();
  seaFaced.positionNode = placed.add(vec3(0, userData('lift', 'float') as unknown as ReturnType<typeof float>, 0));
  seaFaced.colorNode = faced.colorNode;
  seaFaced.maskNode = drawn;
  seaFaced.emissiveNode = water.emissiveNode;
  // The sea's depth and its surface (see `Stage.sea`, `?sea=0` leaves both out). Lists and faces of the sea take the
  // same nodes, so that the sea does not change where the view passes from one step to the next.
  let surface: Sea | null = null;
  if (water !== solid && flag('sea', true)) {
    // (the material's fields are typed for every kind of node: the mirror image is the tinted vec3 above, and a corner's
    // colour is materialColor times a vec3, in `coloured` and in face_materials.ts)
    surface = createSea(water.emissiveNode as THREE.Node<'vec3'>);
    water.colorNode = surface.colour(water.colorNode as THREE.Node<'vec3'>);
    seaFaced.colorNode = surface.colour(faced.colorNode as THREE.Node<'vec3'>);
    water.normalNode = seaFaced.normalNode = surface.normal;
    water.emissiveNode = seaFaced.emissiveNode = surface.mirror;
  }
  // Lists that move with the glide of the faces (`gliding`: the banks of the water, water above the sea, what stands
  // on the ground): each corner has the height it ends up at.
  const sinking = coloured();
  sinking.maskNode = drawn;
  sinking.positionNode = vec3(
    positionGeometry.x,
    mix(positionGeometry.y, attribute('sink', 'float'), glided),
    positionGeometry.z,
  );
  return {
    smallLists,
    solid,
    water,
    faced,
    fieldFaced,
    fieldGliding,
    fields,
    seaFaced,
    freed,
    gliding,
    sinking,
    surface,
    mirrored,
    tint,
    mirrorShare,
    shareCode,
    inkOf,
    marked,
  };
}
export type Materials = ReturnType<typeof createMaterials>;
