// How a portrait is lit and what its surfaces are made of, per set of dress. Apoleia's Roman portraits keep exactly
// what Apoleia had in Godot (the comparison in tools/portrait/compare.mjs holds them to it). A set of dress of the
// game's own (portrait/src/dress.rs) names itself in front of the look ("england1356/...") and may bring its own
// profile here.
//
// The profile of 1356 was set by eye in rounds against screenshots of Crusader Kings III (docs/PORTRAITS.md), so
// every number in it is a PLACEHOLDER in the project's sense: chosen, not measured or sourced.

/** A light: where it stands seen from the point the camera looks at, its colour, Godot's energy. */
export interface StageLight { from: readonly [number, number, number]; colour: string; energy: number }

export interface StageProfile {
  key: string;
  lights: { key: StageLight; rim: StageLight; fill: StageLight };
  /** Whether the rim light throws shadows too. Without them it shines through the head from behind onto the side
   *  of the nose (Apoleia's stage has none). */
  rimShadow: boolean;
  sky: { top: string; ground: string; energy: number };
  exposure: number;
  /** How far the head is turned to the left (radians), and how far above the point it looks at the camera stands
   *  (in heights of the picture's view: above 0 it looks down on the face). */
  turn: number;
  rise: number;
  /** How much larger than the builder frames it the head stands in the picture (1 = as framed: the head and the
   *  shoulders in their whole width). */
  close: number;
  /** Sharpness of the images seen at a slant (anisotropic filtering, 1 = off). */
  anisotropy: number;
  /** Skin: null leaves it as the builder gives it. Else roughness, Godot's "specular", strength of the pores'
   *  normal map; how far light bleeds round the edge of its shadow per colour (wrap lighting, the usual stand-in
   *  for scattering inside skin); how blotchy (broad patches redder or paler) and speckled (fine, in brightness);
   *  how much of its colour is left (1 = all), and a tint over that, which grows with the lightness of the person's skin
   *  as a whole (none on dark skin, all of it on light skin: blood shows through light skin, melanin hides it; the
   *  same over the whole head, so that what is painted darker on it keeps its red). */
  skin: null | { rough: number; specular: number; pores: number; wrap: readonly [number, number, number]; blotch: number; speckle: number; colour: number; tint: readonly [number, number, number] };
  /** The eyeball: null as it is. Else the upper lid's shadow (darkening to `dark` between these heights of the
   *  ball's normal), the shade in the corners of the eye (darkening to `dark` between these distances to the side
   *  of the gaze), a tint, how much lighter the white of the eye and how much darker the iris are drawn than the
   *  image has them (`white`, `iris`: factors; the two are told apart by the image), how much of its colour is
   *  left (1 = all), how far its darks are lifted (the exponent
   *  on the colour: below 1 a dark iris shows its colour), the glint of the key light on it
   *  (roughness: the rougher the larger and fainter; Godot's "specular"), and how far light reaches round to the
   *  ball's shaded side (wrap lighting as on skin: the white of the eye lets light through; without it the side
   *  of each ball away from the key light is a dark sickle beside the iris). */
  eye: null | { lid: { from: number; to: number; dark: number }; corner: { from: number; to: number; dark: number }; tint: readonly [number, number, number]; white: number; iris: number; colour: number; lift: number; rough: number; specular: number; wrap: number };
  /** Lashes and brows: null as they are. Else roughness, "specular", and how dense the lashes and the brows are
   *  (1 = as painted). */
  brow: null | { rough: number; specular: number; lashes: number; brows: number };
  /** The painted layer of short hairs under the cards and of the short beards: null as it is. Else how much
   *  lighter it is drawn (factor on its colour: `tone` for dark hair, `light` for hair as light as white, between
   *  them by the hair's brightness), how much of its colour is left (as `sheen.colour`), and how far light reaches
   *  round to its shaded side (as `sheen.wrap`), and whether shadows fall on it (`shadow`: the edge of a shadow
   *  from the shadow map is a straight, hard line, which on skin reads as the chin's shadow and on a beard as a
   *  dark patch with corners), and how much of the lightening (`tone`, `light`) stubble takes (`stubble`: 1 = as the
   *  other layers, 0 = none: skin shows between its hairs, and drawn lighter it is a pale dust on the face). */
  cap: null | { tone: number; light: number; colour: number; wrap: number; shadow: boolean; stubble: number };
  /** Hair cards: roughness, "specular", anisotropy of the glint. */
  cards: { rough: number; specular: number; anisotropy: number };
  /** The sheen of hair as strands give it (Kajiya & Kay 1989, two bands as in Scheuermann 2004): null leaves the
   *  cards with their plain glint. Else a white band and a band in the hair's own colour: strength and sharpness
   *  (exponent) of each, how far each is shifted along the strand, how much the strands' image shifts the bands
   *  from strand to strand (their ragged look), how much darker the image's dark strands are drawn
   *  (exponent on the image, 1 = as painted), how much darker still on hair as light as white (`light`, a further
   *  exponent that grows with the hair's brightness: white hair has no sheen to show its strands by, so its darker
   *  strands give it depth), how much of the hair's colour is left (`colour`, 1 = all), and how much of the light
   *  that hair passes round to its shaded side reaches it (wrap lighting as on skin: 0 = none, 1 = Valve's half
   *  Lambert). */
  sheen: null | { white: number; whiteSharp: number; whiteShift: number; own: number; ownSharp: number; ownShift: number; ragged: number; strands: number; light: number; colour: number; wrap: number };
}

/** Apoleia's stage (app/scripts/ui/portrait_cache.gd) and materials (sim/godot/src/portrait.rs). */
export const APOLEIA: StageProfile = {
  key: 'apoleia',
  lights: {
    key: { from: [-3.5, 4.5, 5.0], colour: '#fff0dc', energy: 2.0 },
    rim: { from: [3.5, 2.5, -4.0], colour: '#bcd0ff', energy: 1.4 },
    fill: { from: [3.0, -1.0, 5.0], colour: '#ffe2c8', energy: 0.35 },
  },
  sky: { top: '#e6ecff', ground: '#5a3d2a', energy: 0.75 },
  rimShadow: false,
  exposure: 0.92,
  turn: -0.35, rise: 0.08, close: 1,
  anisotropy: 1,
  skin: null, eye: null, brow: null, cap: null,
  cards: { rough: 0.55, specular: 0.3, anisotropy: 0.5 },
  sheen: null,
};

/** England 1356: the key light more from the side and less light from all round than Apoleia's, so that a face has
 *  a lit and a shaded half; a rim light with shadows; matt, blotchy, less coloured skin with a soft edge of the
 *  shadow; eyes shaded by the lid and in their corners, with a glint; thin lashes and brows that do not read as
 *  painted; hair with a sheen of strands that keeps its colour in the shade. Exposure, the skin's tint and the
 *  colour of the light from below were set in round 41 so that lit skin lies where it does in one screenshot of
 *  CK3 (CIELAB, docs/PORTRAITS.md), again in round 48 on the light skin England's people have, and in round 47 the colour left in hair so that red hair is as coloured as
 *  the reddest there; the rest by eye. Round 50 (the faces read as lifeless): the glint in the eye small and sharp
 *  instead of a broad grey sheen, light skin redder and the picture a little darker (the face's median against the
 *  ruler's there: a 12 against 19, L 55 against 42; now a 14, L 53). Round 54: the skin's colour and tint set
 *  per band of lightness instead of by one median (the ruler's skin there keeps a 16 to 19 from its darkest
 *  shade to its lightest; ours fell to a 10 in the shade and to a 11 in the light: grey shadows, pale lights.
 *  With colour 1.1 and this tint a 14 to 21; the lightest band still paler than there). The table is in
 *  docs/PORTRAITS.md. Round 55: stubble is not drawn lighter (`cap.stubble`). Round 60: the key light lower
 *  (24 degrees above the head instead of 37: from 37 the upper lip, which faces down, lay in shade and read as a
 *  dark gap, an open mouth, and the eyes lay in dark sockets) and a little weaker, so that the share of the
 *  lightest band of skin stays where it was; light reaches round the eyeball (`eye.wrap`). Round 65: the eye
 *  measured against the one face of CK3 that is large enough (docs/PORTRAITS.md): there the white of the eye is
 *  the lightest thing in the face and the iris nearly black; ours was grey beside a mid-grey iris (L 40 beside
 *  17). The white lighter and the iris darker (`eye.white`, `eye.iris`: L 57 beside 12; there 65 beside 14), and
 *  the shade in the eye's corners begins further out (it lay over all the white that shows beside the iris).
 *  Round 68: held beside a woman's eye of CK3 at the same size, the white there is warm and no lighter than the
 *  cheek beside the iris (L -0.5 against the cheek, a 6, b 18) and dark in the corners; ours was a cold light
 *  grey from corner to corner (L +3 to +8, a 2, b 10). A warm tint, the white lighter by what the tint takes, and
 *  the shade of corners and upper lid deeper and from further in (now L -2, a 3, b 15, the corners -22). All
 *  PLACEHOLDER (see above). */
export const ENGLAND_1356: StageProfile = {
  key: 'england1356',
  lights: {
    key: { from: [-5.0, 2.6, 3.2], colour: '#fff0de', energy: 1.8 },
    rim: { from: [3.5, 2.5, -4.0], colour: '#bcd0ff', energy: 0.8 },
    fill: { from: [3.0, -1.0, 5.0], colour: '#efe4da', energy: 0.15 },
  },
  sky: { top: '#e6ecff', ground: '#4d443c', energy: 0.3 },
  rimShadow: true,
  exposure: 0.41,
  turn: -0.24, rise: 0.02, close: 1.3,
  anisotropy: 8,
  skin: { rough: 0.72, specular: 0.35, pores: 1.5, wrap: [0.18, 0.15, 0.13], blotch: 0.11, speckle: 0.10, colour: 1.1, tint: [1, 0.72, 0.82] },
  eye: { corner: { from: 0.3, to: 0.8, dark: 0.35 }, lid: { from: -0.35, to: 0.05, dark: 0.5 }, tint: [0.84, 0.77, 0.64], white: 1.85, iris: 0.7, colour: 0.85, lift: 0.8, rough: 0.07, specular: 0.6, wrap: 0.5 },
  brow: { rough: 1, specular: 0.05, lashes: 0.3, brows: 0.6 },
  cap: { tone: 1.7, light: 2.6, colour: 0.7, wrap: 1, shadow: false, stubble: 0 },
  cards: { rough: 0.72, specular: 0.2, anisotropy: 0.3 },
  sheen: { white: 0.3, whiteSharp: 120, whiteShift: 0.1, own: 0.45, ownSharp: 40, ownShift: -0.1, ragged: 0.15, strands: 1.35, light: 1.5, colour: 0.7, wrap: 1 },
};

const PROFILES = [ENGLAND_1356];

/** The profile of a portrait, from the name of its look: the set of dress in front of the slash, else Apoleia's. */
export function profileOf(look: string): StageProfile {
  const slash = look.indexOf('/');
  return (slash > 0 && PROFILES.find(p => p.key === look.slice(0, slash))) || APOLEIA;
}
