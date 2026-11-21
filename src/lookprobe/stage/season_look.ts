// What the fields show on the world's day, as the stage changes them (people feature 12, the fields by the season):
// the pieces of the world are built in the high summer of the year they are built for (blocks.ts `crops`,
// terrain_colours.ts, worldprobe/field_colours.ts) and tell the stage each field column's code and own number
// (worldprobe/season_codes.ts). Here, for every code and number, what the field is on the day (worldprobe/field_season.ts)
// becomes for each part of the field what its colour turns into, and the share of its sheaves' height (seasons.ts).
//
// A part's colour on the day is told as shares of colours: a share of the colour the piece is built in keeps the
// piece's own colours there, with their patches and shades; the rest is the colour of the season, taken in the
// brightness of the piece's own colour at that dot. So the earth of the paths in a field's soil turns with the field
// and does not go pink, as it would were the summer's colours scaled by the season's against them.
//
// The colours of the season are the palette's own: the young corn green as the oats (the green of spring corn in
// July), the ripe corn gold as the wheat, between them mixed by how ripe it is; the soil under the young corn as the
// oats' soil, under the ripe as the wheat's; a ploughed field the bare earth of the paths (DIRT); a field after its
// harvest the fallow's stubble.
import { type RGB, mix, rgb, shade } from '../batch';
import {
  HEDGE_GLOW,
  OATS,
  OATS_SIDE,
  OATS_TALL,
  OATS_TOP,
  SHEAF_TALLER,
  VINE_BODY,
  VINE_SIDE,
  WHEAT,
  WHEAT_GLOW,
  WHEAT_SIDE,
  WHEAT_TALL,
  WHEAT_TOP,
} from '../blocks';
import {
  DIRT,
  FALLOW_SHOWS,
  FIELD_SOIL,
  GRASS_A,
  GRASS_B,
  SOIL_FALLOW,
  SOIL_OATS,
  SOIL_WHEAT,
} from '../terrain_colours';
import {
  SEEN_FALLOW,
  SEEN_SPRING,
  SEEN_VINES,
  SEEN_WINTER,
  VINEYARD,
  field,
  tinted,
} from '../../worldprobe/field_colours';
import { CROP, type FieldLook, GROUND, YOUNG, fieldLook, vineLook } from '../../worldprobe/field_season';
import { SEASON_CODES, seasonOf } from '../../worldprobe/season_codes';

/** The parts of a field whose colour changes on its own: its soil, the tops, the sides and the shaded sides of its
 *  sheaves (blocks.ts `crops`: `top`, the box's colour, `away`), its colour from afar (far_fields.ts); and the share
 *  of its sheaves' height. */
export const PART = { soil: 0, top: 1, side: 2, away: 3, far: 4, tall: 5 } as const;
export const PARTS = 6;
/** the own numbers of the fields (0 … 255) fall into this many groups that show alike */
export const SOWINGS = 64;
/** the luminance of a colour of linear light (ITU-R BT.709): the brightness the season's colour is taken in */
export const LUMA = [0.2126, 0.7152, 0.0722] as const;
/**
 * Numbers to a code, part and group. A colour's part: the season's colour over the luminance of the colour the part
 * is built in, and the share of the season's colour against the piece's own (seasons.ts mixes a dot's colour c into
 * luminance(c) × the first three by the fourth). The height's part: the share of the sheaves' height, first.
 */
const NUMBERS = 4;
/** the numbers of all codes, parts and groups, as the stage's texture holds them: SOWINGS wide, SEASON_CODES × PARTS high */
export const LOOK_NUMBERS = SOWINGS * SEASON_CODES * PARTS * NUMBERS;

const luminance = (c: readonly number[]) => LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];
const mean = (cs: readonly RGB[]): RGB => {
  const sum = (k: number) => cs.reduce((a, c) => a + c[k], 0) / cs.length;
  return [sum(0), sum(1), sum(2)];
};

/** a colour on the day as shares of colours, which sum to one */
type Shares = readonly (readonly [number, RGB])[];
/** shares by how ripe the corn is: the young's colour, the ripe's */
const byRipe = (r: number, young: RGB, ripe: RGB): Shares => [
  [1 - r, young],
  [r, ripe],
];
/** a part's numbers for a colour of the day `shares`, where the piece has built the part in the colour `built` */
function turned(built: RGB, shares: Shares): number[] {
  let share = 0;
  const into = [0, 0, 0];
  for (const [w, c] of shares) {
    if (w <= 0 || (c[0] === built[0] && c[1] === built[1] && c[2] === built[2])) continue;
    share += w;
    for (let k = 0; k < 3; k++) into[k] += w * c[k];
  }
  if (share < 1e-6) return [1, 1, 1, 0];
  const by = luminance(built) * share;
  return [into[0] / by, into[1] / by, into[2] / by, share];
}
/** the numbers of a part kept as the piece has it */
const KEPT = [1, 1, 1, 0];

/** the meadow a field's top is mixed into (terrain_colours.ts `topColor`, before its patches) */
const GRASS = mix(GRASS_A, GRASS_B, 0.5);
const soil = (c: RGB, share = FIELD_SOIL) => mix(GRASS, c, share);
/** the sheaves of wheat and of oats (blocks.ts `crops`): their parts' colours and their height in the mean */
const WHEAT_SHEAF = {
    top: shade(mean(WHEAT), WHEAT_TOP),
    side: WHEAT_SIDE,
    away: WHEAT_GLOW,
    tall: WHEAT_TALL + SHEAF_TALLER / 2,
  },
  OATS_SHEAF = {
    top: shade(mean(OATS), OATS_TOP),
    side: OATS_SIDE,
    away: HEDGE_GLOW,
    tall: OATS_TALL + SHEAF_TALLER / 2,
  };
const sheafOf = (first: number) => (first === CROP.spring ? OATS_SHEAF : WHEAT_SHEAF);
/** a field from afar (far_fields.ts): the crop's tops with their sides, as seen, green and gold; the stubble in the grass */
const CORN_FAR = [
    tinted(field(mean(OATS), true, OATS_SIDE), SEEN_SPRING),
    tinted(field(mean(WHEAT), true, WHEAT_SIDE), SEEN_WINTER),
  ],
  STUBBLE_FAR = mix(GRASS, tinted(SOIL_FALLOW, SEEN_FALLOW), FALLOW_SHOWS);
/** OWN RULE: from above a sheaf covers 0.8 × 0.8 of its block (blocks.ts `crops`); the young corn so much of the field,
 *  the corn grown tall all of it, as the far step has it */
const COVERS_YOUNG = 0.64;
/** OWN RULE: the bare stocks of the vines in winter, grey-brown wood, and their leaves turned yellow after the vintage, by eye */
const VINE_WOOD = rgb(0x6c5236),
  VINE_TURNED = rgb(0xd4a43c);
/** the vines (blocks.ts `crops`): a green body under a head in the sun; from afar their colour with the ground between */
const STOCKS = mix(VINE_BODY, VINE_SIDE, 0.5),
  VINES_FAR = tinted(VINEYARD, SEEN_VINES),
  vineFar = (c: RGB) => tinted(mix(c, WHEAT_SIDE, 0.3), SEEN_VINES);

/** What a field of the course `first` (CROP) shows by part, in the colours of the summer it is built in. */
function builtOf(first: number) {
  return {
    soil:
      first === CROP.fallow ? soil(SOIL_FALLOW, FALLOW_SHOWS) : soil(first === CROP.spring ? SOIL_OATS : SOIL_WHEAT),
    sheaf: sheafOf(first),
    far: first === CROP.fallow ? STUBBLE_FAR : CORN_FAR[first === CROP.spring ? 0 : 1],
  };
}

/** The numbers of a field of corn or fallow by part, on its day `f` (null: as it is built). */
function cornParts(first: number, f: FieldLook | null): number[][] {
  // the summer it is built in: all as it is, but that no sheaf stands on the fallow
  if (!f) return [KEPT, KEPT, KEPT, KEPT, KEPT, [first === CROP.fallow ? 0 : 1, 0, 0, 0]];
  const b = builtOf(first),
    standing = f.ground === GROUND.sown,
    r = f.ripe,
    tall = standing ? (f.height * sheafOf(f.crop).tall) / b.sheaf.tall : 0;
  const ground: Shares =
    f.ground === GROUND.earth
      ? [[1, soil(DIRT)]]
      : standing
        ? byRipe(r, soil(SOIL_OATS), soil(SOIL_WHEAT))
        : [[1, soil(SOIL_FALLOW, FALLOW_SHOWS)]];
  const covers = Math.max(0, Math.min(1, COVERS_YOUNG + ((1 - COVERS_YOUNG) * (f.height - YOUNG)) / (1 - YOUNG))),
    far: Shares = !standing
      ? [[1, f.ground === GROUND.earth ? tinted(DIRT, SEEN_FALLOW) : STUBBLE_FAR]]
      : [
          ...byRipe(r, CORN_FAR[0], CORN_FAR[1]).map(([w, c]) => [w * covers, c] as const),
          ...byRipe(r, tinted(SOIL_OATS, SEEN_FALLOW), tinted(SOIL_WHEAT, SEEN_FALLOW)).map(
            ([w, c]) => [w * (1 - covers), c] as const,
          ),
        ];
  return [
    turned(b.soil, ground),
    turned(b.sheaf.top, byRipe(r, OATS_SHEAF.top, WHEAT_SHEAF.top)),
    turned(b.sheaf.side, byRipe(r, OATS_SHEAF.side, WHEAT_SHEAF.side)),
    turned(b.sheaf.away, byRipe(r, OATS_SHEAF.away, WHEAT_SHEAF.away)),
    turned(b.far, far),
    [tall, 0, 0, 0],
  ];
}

/** The numbers of a vineyard by part: its soil as it is, its stocks and leaves by the season, from afar likewise. */
function vineParts(v: { leaf: number; turned: number } | null): number[][] {
  if (!v) return [KEPT, KEPT, KEPT, KEPT, KEPT, [1, 0, 0, 0]];
  // the leaves in green as they are built, those turned yellow, and the bare wood
  const shares = (green: RGB, by: (c: RGB) => RGB): Shares => [
    [v.leaf * (1 - v.turned), green],
    [v.leaf * v.turned, by(VINE_TURNED)],
    [1 - v.leaf, by(VINE_WOOD)],
  ];
  const stocks = turned(
    STOCKS,
    shares(STOCKS, (c) => c),
  );
  // (from afar a vineyard is VINEYARD, the body with the ground between the rows, tinted as it is seen: far_fields.ts)
  return [KEPT, stocks, stocks, stocks, turned(VINES_FAR, shares(VINES_FAR, vineFar)), [1, 0, 0, 0]];
}

/**
 * The numbers of every code, part and group of own numbers on the world's day `day` (the world begun on 1 January
 * `startYear`, which is the year the pieces are built for), into `into` (LOOK_NUMBERS); without a day as the pieces
 * are built. The code 0, no field, keeps everything as it is.
 */
export function fillLook(into: Float32Array, on: { day: number; startYear: number } | null) {
  const put = (code: number, j: number, parts: number[][]) => {
    for (const [part, n] of parts.entries()) into.set(n, ((code * PARTS + part) * SOWINGS + j) * NUMBERS);
  };
  for (let code = 0; code < SEASON_CODES; code++) {
    const what = seasonOf(code);
    for (let j = 0; j < SOWINGS; j++) {
      if (!what) put(code, j, [KEPT, KEPT, KEPT, KEPT, KEPT, [1, 0, 0, 0]]);
      else if (what.first === CROP.vine)
        put(code, j, vineParts(on ? vineLook(on.day, on.startYear, what.farmYear) : null));
      else {
        const u = (j + 0.5) / SOWINGS;
        put(
          code,
          j,
          cornParts(
            what.first,
            on ? fieldLook(on.day, on.startYear, what.farmYear, what.first, what.courses, on.startYear, u) : null,
          ),
        );
      }
    }
  }
}
