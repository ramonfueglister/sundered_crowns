// The fields by the season on the stage (people feature 12). Every piece of the world brings its season map
// (worldprobe/season_codes.ts), which goes into a layer of a texture all pieces share, as the colours of the joined
// tops do (fields.ts); a mesh of the piece knows its layer (`userData.season`: the map's first column x0, z0, its
// layer, −1 for none, and 1 where the mesh is what stands on the ground, 0 where it is the ground). A second, small
// texture holds what each kind of field shows on the world's day (season_look.ts): by part, the colour of the season
// and its share against the piece's own, and the share of its sheaves' height. The materials turn a corner's or a
// dot's colour by the first (materials.ts, face_materials.ts), and a sheaf's height above its ground by the other.
// (TSL types its userData nodes loosely: each is cast to the kind of value it holds.)
import * as THREE from 'three/webgpu';
import { abs, dot, float, int, ivec2, mix, select, texture, userData, vec2, vec3, type vec4 } from 'three/tsl';
import { FAR_LOOK, SEASON_CODES, SEASON_SIDE, type SeasonMap } from '../../worldprobe/season_codes';
import { createFields } from './fields';
import { LOOK_NUMBERS, LUMA, PART, PARTS, SOWINGS, fillLook } from './season_look';

type Num = THREE.Node<'float'>;
type Two = THREE.Node<'vec2'>;
type Three = THREE.Node<'vec3'>;
type Four = THREE.Node<'vec4'>;
/** what turns a colour of the piece into the day's */
type Tint = (c: Three) => Three;

/** OWN RULE: a sheaf kept down sinks this far into its ground, so that its top does not flicker with the ground's */
const SUNK = 0.05;
/** what stands on a field column is its crop only from this high over the ground on (a way's ribbon lies lower,
 *  world.ts RIBBON_LIFT; the lowest sheaf at the first far step stands 0.53 high), or with its sides on the ground */
const CROP_FROM = 0.3;

/** the day the fields show, the same on every stage of the page; null: the summer the pieces are built in */
let shown: { day: number; startYear: number } | null = null;
const looks = new Set<{ data: Float32Array; tex: THREE.DataTexture }>();

/**
 * Has the fields on the stage show the world's day `day` (the world begun on 1 January `startYear`, the year its pieces
 * are built for). Returns whether that changed what they show: then the stage is to draw a new picture.
 */
export function fieldsOnDay(day: number, startYear: number): boolean {
  if (shown && shown.day === day && shown.startYear === startYear) return false;
  shown = { day, startYear };
  for (const l of looks) {
    fillLook(l.data, shown);
    l.tex.needsUpdate = true;
  }
  return true;
}

/** The season maps' texture, the texture of what the fields show, and what the materials read of them. */
export function createSeasons() {
  const maps = createFields(SEASON_SIDE),
    data = new Float32Array(LOOK_NUMBERS);
  fillLook(data, shown);
  const tex = new THREE.DataTexture(data, SOWINGS, SEASON_CODES * PARTS, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  looks.add({ data, tex });
  const look = texture(tex),
    luma = vec3(...LUMA),
    at = userData('season', 'vec4') as unknown as ReturnType<typeof vec4>;

  /** the season map at a column of the mesh's own blocks: the code, the field's number, the height of the ground */
  const mapAt = (column: Two) => {
    const c = column.sub(vec2(at.x, at.y)),
      inside = c.x
        .greaterThanEqual(0)
        .and(c.y.greaterThanEqual(0))
        .and(c.x.lessThan(SEASON_SIDE))
        .and(c.y.lessThan(SEASON_SIDE))
        .and(at.z.greaterThanEqual(0)),
      // (the bytes come as shares of 255)
      t = maps.node.load(ivec2(c.clamp(0, SEASON_SIDE - 1))).depth(int(at.z.max(0)));
    return {
      code: select(inside, t.x.mul(255).round(), float(0)),
      sowing: t.y.mul(255).round(),
      height: t.z.mul(255).round().add(t.w.mul(255).round().mul(256)),
    };
  };
  /** the numbers of a code (FAR_LOOK taken off), a field's number and a part (season_look.ts) */
  const numbersOf = (code: Num, sowing: Num, part: Num) =>
    look.load(ivec2(int(sowing.div(256 / SOWINGS).floor()), int(code.mul(PARTS).add(part))));
  /** a colour turned by a part's numbers: into the season's colour in its own brightness, by the share of the season's */
  const tintBy =
    (n: Four): Tint =>
    (c) =>
      mix(c, vec3(dot(c, luma)).mul(n.rgb), n.a);

  /** What turns the colour of a dot of the ground at `spot` (the mesh's own blocks; on the column it lies on). */
  const ground = (spot: Two): Tint => {
    const m = mapAt(spot.floor()),
      far = m.code.greaterThanEqual(FAR_LOOK);
    return tintBy(
      numbersOf(
        m.code.sub(select(far, float(FAR_LOOK), float(0))),
        m.sowing,
        select(far, float(PART.far), float(PART.soil)),
      ),
    );
  };

  /**
   * What stands on the ground at the corner `p` (the mesh's own blocks) facing `n`: what turns its colour, and where
   * the corner lies, lower where the sheaves it belongs to are lower. A corner of what stands on a field column is a
   * sheaf's or a vine's where it lies higher than CROP_FROM over the ground or is the foot of a side; it is taken
   * to the column it stands on (a side to the column behind it), and where that is none, to the column before (a
   * sheaf of the first far step on a balk's column is its field's: worldprobe/crops.ts `cropAt`), or else to the one
   * north of it (the last row of a field's vines reaches a hair over its balk: blocks.ts `crops`).
   */
  const standing = (p: Three, n: Three) => {
    const column = vec2(p.x, p.z).sub(vec2(n.x, n.z).mul(0.25)).floor(),
      own = mapAt(column),
      west = mapAt(column.sub(vec2(1, 0))),
      north = mapAt(column.sub(vec2(0, 1))),
      none = own.code.equal(0),
      nor = west.code.equal(0),
      code = select(none, select(nor, north.code, west.code), own.code),
      sowing = select(none, select(nor, north.sowing, west.sowing), own.sowing),
      above = p.y.sub(own.height);
    const crop = code
      .greaterThan(0)
      .and(code.lessThan(FAR_LOOK))
      .and(above.greaterThan(CROP_FROM).or(abs(above).lessThan(0.01).and(abs(n.y).lessThan(0.5))));
    const part = select(
      n.y.greaterThan(0.5),
      float(PART.top),
      select(n.x.lessThan(-0.5).or(n.z.greaterThan(0.5)), float(PART.away), float(PART.side)),
    );
    const its = select(crop, code, float(0)),
      tall = numbersOf(its, sowing, float(PART.tall)).x,
      foot = own.height.sub(SUNK);
    return {
      tint: tintBy(numbersOf(its, sowing, part)),
      position: vec3(p.x, select(crop, foot.add(p.y.sub(foot).mul(tall)), p.y), p.z),
    };
  };

  /** For lists, which may be the ground or what stands on it: `standing` or `ground`, as the mesh says. */
  const either = (p: Three, n: Three) => {
    const s = standing(p, n),
      g = ground(vec2(p.x, p.z).sub(vec2(n.x, n.z).mul(0.5))),
      thing = at.w.greaterThan(0.5),
      tint: Tint = (c) => select(thing, s.tint(c), g(c));
    return { tint, position: select(thing, s.position, p) };
  };

  return {
    ground,
    standing,
    either,
    /** A layer for a piece's season map, as its meshes carry it in `userData.season` (with 0 for the ground). */
    take(map: SeasonMap): THREE.Vector4 {
      return new THREE.Vector4(map.x0, map.z0, maps.take(map.cols), 0);
    },
    /** A piece's layer given back as the piece leaves the stage. */
    give(layer: number) {
      maps.give(layer);
    },
  };
}
export type Seasons = ReturnType<typeof createSeasons>;
