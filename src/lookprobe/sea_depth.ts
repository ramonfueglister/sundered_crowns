// Where the water lies on the depth picture (public/map/depth.png with the coast's distance beside it: sea_coast.ts
// `withCoast`), and what the picture says there, for the sea's colour (sea.ts).
import * as THREE from 'three/webgpu';
import {
  float,
  floor,
  fract,
  fwidth,
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
 * The picture's depth at `uv`, smoothed: the cubic B-spline over the four by four dots around the place, by four
 * reads between them (Sigg and Hadwiger, "Fast Third-Order Texture Filtering", GPU Gems 2, 2005, chapter 20: two
 * neighbouring dots weighted w and w' are one linear read at w' / (w + w') between them). `texels`: the picture's size.
 */
function smoothed(picture: THREE.TextureNode, uv: Vec2, texels: Vec2): Float {
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
  const read = (u: Float, v: Float) => picture.sample(vec2(u, v)).r;
  return read(a.x, a.y)
    .mul(near.x)
    .add(read(b.x, a.y).mul(far.x))
    .mul(near.y)
    .add(read(a.x, b.y).mul(near.x).add(read(b.x, b.y).mul(far.x)).mul(far.y));
}

/**
 * Where a point of the water lies on the depth picture, and the picture there: the depth's share (0: as shallow as
 * the coast; `shareSmooth`: smoothed over the picture's dots, for a view in which a dot of it is many dots wide) and
 * the coast's distance in dots of the picture; with the uniforms the sea's `place` sets.
 */
export function readDepths() {
  const none = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  none.needsUpdate = true;
  const depths = texture(none),
    known = uniform(0),
    toMap = uniform(new THREE.Matrix3()),
    round = uniform(0);
  const at = toMap.mul(vec3(positionWorld.x, positionWorld.z, 1)),
    u = select(round.greaterThan(0), fract(at.x.div(round)).mul(round), at.x),
    v = at.y;
  const onMap = step(0, u).mul(step(u, 1)).mul(step(0, v)).mul(step(v, 1)),
    seen = depths.sample(vec2(u, v.oneMinus()));
  // (the depth picture's size in dots, from the depth picture itself)
  const texels = uniform(new THREE.Vector2(1, 1));
  const shareOf = (read: Float) => mix(float(UNKNOWN), mix(float(BEYOND), read, onMap), known);
  const coastTexels = mix(
    float(COAST_REACH),
    seen.g
      .mul(255)
      .sub(128)
      .mul(COAST_REACH / 128),
    onMap,
  );
  const dotsPerTexel = float(1).div(length(fwidth(vec2(at.x, at.y).mul(texels))).max(1e-6));
  return {
    depths,
    known,
    toMap,
    round,
    texels,
    share: shareOf(seen.r),
    shareSmooth: shareOf(smoothed(depths, vec2(u, v.oneMinus()), texels)),
    coastDots: coastTexels.mul(dotsPerTexel),
    dotsPerTexel,
  };
}
