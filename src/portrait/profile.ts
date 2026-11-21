// How a portrait is lit and what its surfaces are made of, per set of dress. Apoleia's Roman portraits keep exactly
// what Apoleia had in Godot (the comparison in tools/portrait/compare.mjs holds them to it). A set of dress of the
// game's own (portrait/src/dress.rs) names itself in front of the look ("england1356/...") and may bring its own
// profile here (profile_1356.ts).
import { ENGLAND_1356, PLAIN_1356 } from './profile_1356';

/** A light: where it stands seen from the point the camera looks at, its colour, Godot's energy. */
export interface StageLight { from: readonly [number, number, number]; colour: string; energy: number }

export interface StageProfile {
  key: string;
  /** The lights by a photographer's names: the key, the rim behind the head, the fill that lightens the shade the
   *  camera sees, and `bounce`: what chest and ground throw back at a face from below (energy 0 = none). */
  lights: { key: StageLight; rim: StageLight; fill: StageLight; bounce: StageLight };
  /** How dark the rim light's shadow falls (0 = it throws none, as on Apoleia's stage; 1 = no rim light in it).
   *  Without a shadow the rim shines through the head from behind onto the far side of the nose. What a shadow
   *  lets through is light without a highlight on a profile's skin (materials.ts `hidden`). */
  rimShadow: number;
  /** The shadows: pixels of a shadow's map (its side), how dark the key light's shadow falls (1 = no key light in
   *  it), how far the edge of a shadow is blurred in the map (three.js' `radius`, pixels of the map), and the size
   *  of the key light: `spread` is the half angle under which it is seen from the head (degrees; 0 = a light
   *  without size, as the sun through a hole: every shadow has a hard edge) and `lights` the number of lights it
   *  is drawn as, spread evenly over its disc (stage.ts `keyPlaces`). A light with a size throws a shadow whose
   *  edge is the softer the further the thing that throws it stands off the skin. `reach`: how far the box in
   *  which shadows are thrown reaches to either side of the point the camera looks at, in heights of the picture
   *  (the map's pixels are shared out over it: a picture that shows more of the figure has a coarser shadow on the
   *  face, unless the box stays as it was). */
  shadow: { map: number; strength: number; radius: number; spread: number; lights: number; reach: number };
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
   *  same over the whole head, so that what is painted darker on it keeps its red). `finer`: how many times each
   *  of its triangles is split in four to draw it as the smooth surface its net stands for, after `fit` rounds
   *  of moving the net so that this surface keeps to the builder's corners (subdivide.ts; 0 = the net as built).
   *  `child`: how much of the pores, the relief, the blotches and the speckle a child's skin has (1 = a grown
   *  person's; in full on a child up to eleven, `Portrait.young`). `bleed`: the colour of the light a shadow on skin lets
   *  through (where a light's shadow is not at full strength, `shadow.strength`, `rimShadow`), as a factor on
   *  the lamp's colour: light that has been in skin comes out of it red (materials.ts `hidden`). */
  skin: null | { rough: number; specular: number; pores: number; wrap: readonly [number, number, number]; finer: number; fit: number; blotch: number; speckle: number; colour: number; tint: readonly [number, number, number]; relief: number; oil: number; fuzz: number; child: number; bleed: readonly [number, number, number] };
  /** The eyeball: null as it is. Else the upper lid's shadow (darkening to `dark` between these heights of the
   *  ball's normal), the shade in the corners of the eye (darkening to `dark` between these distances to the side
   *  of the gaze), a tint, how much lighter the white of the eye and how much darker the iris are drawn than the
   *  image has them (`white`, `iris`: factors; the two are told apart by the image), how much of its colour is
   *  left (1 = all), how far its darks are lifted (the exponent
   *  on the colour: below 1 a dark iris shows its colour), the glint of the key light on it
   *  (roughness: the rougher the larger and fainter; Godot's "specular"), and how far light reaches round to the
   *  ball's shaded side (wrap lighting as on skin: the white of the eye lets light through; without it the side
   *  of each ball away from the key light is a dark sickle beside the iris; `wrap` on the iris and the pupil,
   *  which the cornea gathers light for from the side, `wrapWhite` on the white), and the cornea: how far the surface's
   *  normal leans outward at the iris' rim (the tangent of the angle; 0 = a plain ball. A cornea of 7.8 mm radius
   *  on a ball of 12 mm leans 20 degrees further out at the rim of an iris of 11.7 mm: 0.36), `ring`: how much
   *  darker the iris is in a ring at its rim, the pupil: its radius as a share of the iris' (0 = as the image has
   *  it, 0.29), how soft its edge is (the same share, to either side) and how dark it is drawn (a factor on the
   *  iris under it), and `blush`: a colour on the white of the eye alone (1, 1, 1 = none). */
  eye: null | { lid: { from: number; to: number; dark: number }; corner: { from: number; to: number; dark: number }; tint: readonly [number, number, number]; white: number; iris: number; colour: number; lift: number; rough: number; specular: number; wrap: number; wrapWhite: number; cornea: number; ring: number; pupil: { size: number; soft: number; dark: number }; blush: readonly [number, number, number] };
  /** Lashes and brows: null as they are. Else roughness, "specular", and how dense the lashes and the brows are
   *  (1 = as painted). */
  brow: null | { rough: number; specular: number; lashes: number; brows: number };
  /** The painted layer of short hairs under the cards and of the short beards: null as it is. Else how much
   *  lighter it is drawn (factor on its colour: `tone` for dark hair, `light` for hair as light as white, between
   *  them by the hair's brightness), how much of its colour is left (as `sheen.colour`), and how far light reaches
   *  round to its shaded side (as `sheen.wrap`), and whether shadows fall on it (`shadow`: under a light without size the
   *  edge of a shadow from the shadow map is a straight, hard line, which on skin reads as the chin's shadow and
   *  on a beard as a dark patch with corners), and how much of the lightening (`tone`, `light`) stubble takes (`stubble`: 1 = as the
   *  other layers, 0 = none: skin shows between its hairs, and drawn lighter it is a pale dust on the face).
   *  `beard`: the same four values for the layer of a beard (an image named `beard_`, stubble aside). They are
   *  for a beard that is its layer alone, without cards over it, as England's are: such a layer is the beard
   *  one sees, not the shade under hair, and wants the lightness of the head's hair and a lit and a shaded side. */
  cap: null | { tone: number; light: number; colour: number; wrap: number; shadow: boolean; stubble: number;
    beard: { tone: number; light: number; colour: number; wrap: number } };
  /** Cloth: null draws it with the colours the builder gives it. Else how many times lighter wool is drawn
   *  (`wool`: gown and hood) and linen (`linen`: a cloth whose image is named `_veil`, `_wimple` or `_smock`).
   *  The builder's wools are a cloth's own colour, a quarter as light as skin; under a light set for the face,
   *  and through a tone curve that draws the darks together, a gown of them is a black shape under the head.
   *  As `cap.light` is for hair. `silk` (round 150: a cloth whose image is named `_silk`): how many times lighter
   *  it is drawn, its roughness and its "specular" (wool and linen: 0.95 and 0.15, a matt cloth). `figured`
   *  (round 156: a silk whose image is named `_figured`): the colour of the gold thread its figure is woven of
   *  (in linear light, as it is drawn: not multiplied by `silk.tone`'s dye), its roughness and its share of metal. */
  cloth: null | { wool: number; linen: number; silk: { tone: number; rough: number; specular: number }; figured: { gold: [number, number, number]; rough: number; metal: number } };
  /** Hair cards, the round strands of a plait and the locks of a head's hair: roughness, "specular", anisotropy
   *  of the glint. */
  cards: { rough: number; specular: number; anisotropy: number };
  /** The sheen of hair as strands give it (Kajiya & Kay 1989, two bands as in Scheuermann 2004): null leaves the
   *  cards with their plain glint. Else a white band and a band in the hair's own colour: strength and sharpness
   *  (exponent) of each (the white band's strength is `white` on black hair and `whiteLight` on hair from a middle
   *  brown on, a brightness of 0.08, where `tone` begins to fall: round 158), how far each is
   *  shifted along the strand, how much the strands' image shifts the bands
   *  from strand to strand (their ragged look), how much darker the image's dark strands are drawn
   *  (exponent on the image, 1 = as painted), how much darker still on hair as light as white (`light`, a further
   *  exponent that grows with the hair's brightness: white hair has no sheen to show its strands by, so its darker
   *  strands give it depth), how much of the hair's colour is left (`colour`, 1 = all), how much lighter the hair
   *  is drawn (factor on its colour: `tone` for dark hair, `toneLight` for hair as light as white, between them by
   *  the hair's brightness, as `cap.tone` and `cap.light` for the painted layer: the strands' image and the shade
   *  baked between the bundles take half of a hair's colour away before any light falls on it), and how much of
   *  the light that hair passes round to its shaded side reaches it (wrap lighting as on skin: 0 = none, 1 =
   *  Valve's half Lambert). */
  sheen: null | { white: number; whiteLight: number; whiteSharp: number; whiteShift: number; own: number; ownSharp: number; ownShift: number; ragged: number; strands: number; light: number; colour: number; tone: number; toneLight: number; wrap: number };
  /** The finish of the picture (finish.ts): null draws it straight onto the canvas through three.js' ACES curve,
   *  as Apoleia's. Else the picture is drawn in linear light `fine` times as fine a side as the canvas (each pixel
   *  of the canvas the mean of fine x fine pixels: the edges of hair, which are cut out and not blended, come out
   *  soft) and brought to the screen through a tone curve of its own: `curve` (its slope in the middle, where
   *  its straight part starts and how far it runs, and how tightly the darks are drawn together), `hue` (1 = the
   *  curve keeps a colour's hue, 0 = it bends red, green and blue each on its own, as three.js' curves do),
   *  `pale` (how much of its colour what is nearly white loses), `colour` (how much colour the picture as a
   *  whole keeps, 1 = all), a tint of the darks and of the lights (`shade`, `light`: factors on red, green and
   *  blue), the `backdrop` (null: none, the picture stands on whatever the page shows; else its colour round the
   *  point `at`, x and y from the top left in shares of the picture, and towards the corners, and how far from
   *  that point the outer colour is reached), and how much darker the corners are (`vignette`). */
  finish: null | {
    fine: number;
    curve: { contrast: number; start: number; length: number; black: number };
    hue: number; pale: number; colour: number;
    shade: readonly [number, number, number]; light: readonly [number, number, number];
    backdrop: null | { inner: string; outer: string; at: readonly [number, number]; reach: number };
    vignette: number;
  };
}

/** Apoleia's stage (app/scripts/ui/portrait_cache.gd) and materials (sim/godot/src/portrait.rs). */
export const APOLEIA: StageProfile = {
  key: 'apoleia',
  lights: {
    key: { from: [-3.5, 4.5, 5.0], colour: '#fff0dc', energy: 2.0 },
    rim: { from: [3.5, 2.5, -4.0], colour: '#bcd0ff', energy: 1.4 },
    fill: { from: [3.0, -1.0, 5.0], colour: '#ffe2c8', energy: 0.35 },
    bounce: { from: [0.0, -3.0, 5.0], colour: '#000000', energy: 0 },
  },
  sky: { top: '#e6ecff', ground: '#5a3d2a', energy: 0.75 },
  rimShadow: 0,
  // measured, not derived: with this map and strength the pictures come closest to Godot's, whose shadows are
  // softer and lighter than three.js' at full strength (tools/portrait/compare.mjs, docs/PORTRAITS.md)
  shadow: { map: 512, strength: 0.7, radius: 1, spread: 0, lights: 1, reach: 0.9 },
  exposure: 0.92,
  turn: -0.35, rise: 0.08, close: 1,
  anisotropy: 1,
  skin: null, eye: null, brow: null, cap: null, cloth: null,
  cards: { rough: 0.55, specular: 0.3, anisotropy: 0.5 },
  sheen: null,
  finish: null,
};

const PROFILES = [ENGLAND_1356, PLAIN_1356];

/** The profile of a portrait, from the name of its look: the set of dress in front of the slash, else Apoleia's. */
export function profileOf(look: string): StageProfile {
  const slash = look.indexOf('/');
  return (slash > 0 && PROFILES.find(p => p.key === look.slice(0, slash))) || APOLEIA;
}
