// Where the water lies on the depth picture (public/map/depth.png with the coast's distance beside it: sea_coast.ts
// `withCoast`), and what the picture says there, for the sea's colour (sea.ts).
import * as THREE from 'three/webgpu';
import {
  dFdx,
  dFdy,
  dot,
  float,
  floor,
  fract,
  length,
  mix,
  positionWorld,
  select,
  step,
  texture,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { COAST_REACH } from './sea_coast';

// The depth picture holds the depth d in metres as byte = 255 · ln(1 + d / 20) / ln(1 + 6000 / 20)
// (tools/worldprobe/build_depth.py D0, DEEPEST); the sea's colours go by its share, byte / 255.
/** the depth picture's share for the sea beyond the game map, of which no depths are known: open ocean (about 3000 m) */
const BEYOND = 0.88;
/** the depth's share where no depths are known (a stage without the world's map): water over the shelf */
const UNKNOWN = 0.2;

type Float = THREE.Node<'float'>;
type Vec2 = THREE.Node<'vec2'>;

/**
 * The picture's depth and coast's distance at `uv`, smoothed: the cubic B-spline over the four by four dots around
 * the place, by four reads between them (Sigg and Hadwiger, "Fast Third-Order Texture Filtering", GPU Gems 2, 2005,
 * chapter 20: two neighbouring dots weighted w and w' are one linear read at w' / (w + w') between them). `texels`:
 * the picture's size.
 */
function smoothed(picture: THREE.TextureNode, uv: Vec2, texels: Vec2): Vec2 {
  const at = uv.mul(texels).sub(0.5),
    first = floor(at),
    f = at.sub(first),
    g = f.oneMinus();
  // the spline's weights of the four dots along each axis (the dot before `first`, `first`, and the two after)
  const w0 = g.mul(g).mul(g).div(6),
    w1 = f.mul(f).mul(f.mul(3).sub(6)).add(4).div(6),
    w3 = f.mul(f).mul(f).div(6),
    w2 = w0.add(w1).add(w3).oneMinus();
  const near = w0.add(w1),
    far = w2.add(w3);
  const a = first.sub(0.5).add(w1.div(near)).div(texels),
    b = first.add(1.5).add(w3.div(far)).div(texels);
  const read = (u: Float, v: Float) => picture.sample(vec2(u, v)).rg;
  return read(a.x, a.y)
    .mul(near.x)
    .add(read(b.x, a.y).mul(far.x))
    .mul(near.y)
    .add(read(a.x, b.y).mul(near.x).add(read(b.x, b.y).mul(far.x)).mul(far.y));
}

/**
 * Where a point of the water lies on the depth picture, and the picture there: the depth's share (0: as shallow as
 * the coast) and the coast's distance in dots of the view; and both smoothed over the picture's dots, for a view in
 * which a dot of the picture is many dots wide (`shareSmooth`, and `coastBlocks`: the coast's distance in finest
 * blocks, `pFine` the place in those); with the uniforms the sea's `place` sets.
 */
export function readDepths(pFine: Vec2) {
  const none = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  none.needsUpdate = true;
  const depths = texture(none),
    known = uniform(0),
    toMap = uniform(new THREE.Matrix3()),
    round = uniform(0),
    // (the depth picture's size in dots, from the depth picture itself)
    texels = uniform(new THREE.Vector2(1, 1)),
    // (how far a finest block along the stage's x and z goes on the picture, in its dots: along u, and along v)
    alongU = uniform(new THREE.Vector2(1, 0)),
    alongV = uniform(new THREE.Vector2(0, 1)),
    blocksPerTexel = uniform(1);
  const at = toMap.mul(vec3(positionWorld.x, positionWorld.z, 1)),
    u = select(round.greaterThan(0), fract(at.x.div(round)).mul(round), at.x),
    v = at.y;
  const onMap = step(0, u).mul(step(u, 1)).mul(step(0, v)).mul(step(v, 1)),
    seen = depths.sample(vec2(u, v.oneMinus())),
    soft = smoothed(depths, vec2(u, v.oneMinus()), texels);
  const shareOf = (read: Float) => mix(float(UNKNOWN), mix(float(BEYOND), read, onMap), known);
  const texelsOf = (green: Float) =>
    mix(
      float(COAST_REACH),
      green
        .mul(255)
        .sub(128)
        .mul(COAST_REACH / 128),
      onMap,
    );
  // how many dots of the view a dot of the picture is wide: by how far a dot of the view reaches in finest blocks, and
  // how far a block goes on the picture (`alongU`, `alongV`, which `placed` reckons). Not by how far the place on the
  // picture itself moves from one dot of the view to the next: from near that is a thousandth of a dot of the picture,
  // a few steps of what a 32 bit number holds of a place on the whole map, and the widths came out a quarter too wide
  // or too narrow from dot to dot (fine dotted stripes across the sea's colour, which showed once the colour fell
  // faster into the offing)
  const onPicture = (step: Vec2) => vec2(dot(alongU, step), dot(alongV, step)).abs(),
    dotsPerTexel = float(1).div(length(onPicture(dFdx(pFine)).add(onPicture(dFdy(pFine)))).max(1e-6));
  /** Sets where the stage lies on the picture (Sea.place: `m` the six numbers of u and v, `blocks` the finest blocks to a block of the stage). */
  const placed = (m: readonly number[], blocks: number) => {
    toMap.value.set(m[0], m[1], m[2], m[3], m[4], m[5], 0, 0, 1);
    const { x: w, y: h } = texels.value;
    alongU.value.set(m[0] * w, m[1] * w).divideScalar(blocks);
    alongV.value.set(m[3] * h, m[4] * h).divideScalar(blocks);
    // (the picture lies turned on the stage, its dots as wide as high: a dot is the root of its area wide)
    blocksPerTexel.value = 1 / Math.sqrt(Math.max(Math.abs(alongU.value.cross(alongV.value)), 1e-12));
  };
  return {
    depths,
    known,
    placed,
    round,
    texels,
    share: shareOf(seen.r),
    shareSmooth: shareOf(soft.x),
    coastDots: texelsOf(seen.g).mul(dotsPerTexel),
    coastBlocks: mix(float(1e4), texelsOf(soft.y).mul(blocksPerTexel), known),
    dotsPerTexel,
  };
}
