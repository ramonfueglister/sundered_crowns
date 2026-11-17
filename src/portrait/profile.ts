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
   *  edge is the softer the further the thing that throws it stands off the skin. */
  shadow: { map: number; strength: number; radius: number; spread: number; lights: number };
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
   *  person's; in full on a child up to eleven, `Portrait.young`). `zone`: how much stronger the highlight is on
   *  the forehead's middle and the nose's back than on the rest of the face (0 = no stronger, 1 = twice). */
  skin: null | { rough: number; specular: number; pores: number; wrap: readonly [number, number, number]; finer: number; fit: number; blotch: number; speckle: number; colour: number; tint: readonly [number, number, number]; relief: number; oil: number; fuzz: number; child: number; zone: number };
  /** The eyeball: null as it is. Else the upper lid's shadow (darkening to `dark` between these heights of the
   *  ball's normal), the shade in the corners of the eye (darkening to `dark` between these distances to the side
   *  of the gaze), a tint, how much lighter the white of the eye and how much darker the iris are drawn than the
   *  image has them (`white`, `iris`: factors; the two are told apart by the image), how much of its colour is
   *  left (1 = all), how far its darks are lifted (the exponent
   *  on the colour: below 1 a dark iris shows its colour), the glint of the key light on it
   *  (roughness: the rougher the larger and fainter; Godot's "specular"), and how far light reaches round to the
   *  ball's shaded side (wrap lighting as on skin: the white of the eye lets light through; without it the side
   *  of each ball away from the key light is a dark sickle beside the iris), and the cornea: how far the surface's
   *  normal leans outward at the iris' rim (the tangent of the angle; 0 = a plain ball. A cornea of 7.8 mm radius
   *  on a ball of 12 mm leans 20 degrees further out at the rim of an iris of 11.7 mm: 0.36). */
  eye: null | { lid: { from: number; to: number; dark: number }; corner: { from: number; to: number; dark: number }; tint: readonly [number, number, number]; white: number; iris: number; colour: number; lift: number; rough: number; specular: number; wrap: number; cornea: number; ring: number };
  /** Lashes and brows: null as they are. Else roughness, "specular", and how dense the lashes and the brows are
   *  (1 = as painted). */
  brow: null | { rough: number; specular: number; lashes: number; brows: number };
  /** The painted layer of short hairs under the cards and of the short beards: null as it is. Else how much
   *  lighter it is drawn (factor on its colour: `tone` for dark hair, `light` for hair as light as white, between
   *  them by the hair's brightness), how much of its colour is left (as `sheen.colour`), and how far light reaches
   *  round to its shaded side (as `sheen.wrap`), and whether shadows fall on it (`shadow`: the edge of a shadow
   *  from the shadow map is a straight, hard line, which on skin reads as the chin's shadow and on a beard as a
   *  dark patch with corners), and how much of the lightening (`tone`, `light`) stubble takes (`stubble`: 1 = as the
   *  other layers, 0 = none: skin shows between its hairs, and drawn lighter it is a pale dust on the face).
   *  `beard`: the same four values for the layer of a beard (an image named `beard_`, stubble aside). They are
   *  for a beard that is its layer alone, without cards over it, as England's are: such a layer is the beard
   *  one sees, not the shade under hair, and wants the lightness of the head's hair and a lit and a shaded side. */
  cap: null | { tone: number; light: number; colour: number; wrap: number; shadow: boolean; stubble: number;
    beard: { tone: number; light: number; colour: number; wrap: number } };
  /** Hair cards, the round strands of a plait and the locks of a head's hair: roughness, "specular", anisotropy
   *  of the glint. */
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
  shadow: { map: 512, strength: 0.7, radius: 1, spread: 0, lights: 1 },
  exposure: 0.92,
  turn: -0.35, rise: 0.08, close: 1,
  anisotropy: 1,
  skin: null, eye: null, brow: null, cap: null,
  cards: { rough: 0.55, specular: 0.3, anisotropy: 0.5 },
  sheen: null,
  finish: null,
};

/** England 1356: the key light on the side of the camera the head is turned away from and less light from all
 *  round than Apoleia's, so that a face has a lit and a shaded half (round 73, see below; until then the key
 *  stood on the side the head is turned to); a rim light with shadows; matt, blotchy, less coloured skin with a soft edge of the
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
 *  the shade of corners and upper lid deeper and from further in (now L -2, a 3, b 15, the corners -22).
 *  Round 71: the skin of CK3's faces has a soft sheen on forehead, nose and cheekbone; ours was matt as chalk
 *  (roughness 0.72, specular 0.35) under pores so strong that any sheen broke into a greasy sparkle. Smoother,
 *  more specular, the pores at half their strength, and the picture a little darker by what the sheen adds (the
 *  lit cheek of the grown women stays at L 67). Read at landmarks (tools/portrait/face_colour.mjs) the back of
 *  the nose is still no lighter than the cheek (L -2.0; there +8.2), and lit skin is still paler than there
 *  (chroma 30 against 34): ACES tone mapping takes the colour out of what is lit, whatever the skin's
 *  own colour is (three.js' Neutral and AgX tone mappings tried: too orange, too pale).
 *  Round 72: seen very large the eye was a plain ball of glass, the key light's glint a dot on the white beside
 *  the iris. The eye has a cornea (`eye.cornea`), so the glint lies on the iris, and the eye is a little rougher
 *  (0.14, before 0.07: a larger, softer glint, which the game's size still shows). The brows less dense
 *  (`brow.brows` 0.5, before 0.6): read along a line from the upper lid to the forehead at the reference's size, a
 *  woman's brow was 34.5 L darker than her forehead where the reference's woman's is 26.4; now 30.5 (the men's
 *  36.3 and 31.8).
 *  Round 73 (Ramon on round 72: still "Zombie-Modus"): the light, not the eye. Measured at the same size, the
 *  white of our eyes, the brow and the skin under it were as dark as the reference's or darker; what differed was that
 *  the reference's face has a shaded half (the far cheek 28 L darker than the lit one; ours 14), shade under
 *  brow, nose and lower lip, and lit skin of a full colour (chroma 34; ours 30). Our key light stood level (24
 *  degrees up) on the side the head is turned to: it lit the whole face flat and so brightly that the tone
 *  mapping washed the lit cheek pale, which rounds 54 and 71 had tried to mend through the skin's colour. Now
 *  the key stands on the other side of the camera, 60 degrees round from where the face looks and 32 degrees
 *  up (the broad side of the face lit, the far cheek and the far side of the nose in shade); the rim light
 *  behind the head on the shaded side, where it draws the far cheek's edge without lighting the cheek; the
 *  light from below warmer and lighter (what a tunic throws back), the sky and the fill weaker, the exposure
 *  set so that the women's lit cheek lies where the reference's woman's does. Grown women, the reference's
 *  woman in brackets: lit cheek L 59.0, a 22.5, b 27.2 (56.1, 22.9, 25.4; before 67.1, 17.8, 23.7), the
 *  shaded cheek 26 L darker (28; before 14), upper lip L 17 (21; before 26). Higher, the upper lip turns into a
 *  dark bar (37 degrees: L 13.5).
 *  Round 74: the women's heads were bowed and their eyes lay too deep (portrait/src/dress.rs `lean`, `eye_out`,
 *  `pupil`); upright, their faces took more light and the shaded half and the upper lip grew light (the shaded
 *  cheek 18 L darker, the reference 28). The key 4 degrees further round (64) and 1.5 lower (30.5): grown women's
 *  lit cheek L 61.0, a 21.5, chroma 34.2 (the reference 56.1, 22.9, 34.2), the shaded cheek 27.1 L darker (27.7),
 *  lips L 20.8 and 33.6 (21.0, 33.3), brow 38.9 darker than the skin over it (37.9), the skin between lid and
 *  brow 24.4 darker than that over the brow (17.9; in round 73 46.3). Further round, the upper lip goes dark (76
 *  degrees: L 12); lower (26 degrees), the shade under the brow goes and with it the eye's depth.
 *  Round 75: `turn` and the dress table's `gaze` belong together (portrait/src/dress.rs): the eyes look at the
 *  camera when the gaze's first value is this turn with the other sign (tests/portrait.test.ts).
 *  Round 76: brows and lashes have images of England's own (portrait/src/dress.rs `brow_image`, `lash_image`):
 *  the brow's hairs soft as MakeHuman drew them, where Apoleia's image is a closed band with a hard rim, and
 *  the lashes a soft fringe, where MakeHuman's are single hairs. Both are drawn more densely in turn
 *  (`brow.brows` 0.8, before 0.5; `brow.lashes` 0.6, before 0.3). Grown women's brow 38.2 L darker than the
 *  skin over it and 0.045 of the face broad at half its darkness (the reference 37.9 and 0.045; before 38.9 and
 *  0.050); the lid's rim as dark as before (the painted line under the lashes weaker, `lash_line`).
 *  Round 78: shade fell into black where no light of the stage reached: read down the face's middle line, the
 *  neck under the chin was 53 L darker than the lit cheek (the reference's woman 42), and the skin between lid
 *  and brow 24 darker than that over the brow (18). The fill light stood level on the far side, where it lit
 *  the far cheek and little else. It is now what chest and ground throw back: from below and in front (30
 *  degrees below, a little to the key's side) and stronger (0.35, before 0.12). Under the chin 42 to 43 L
 *  darker than the lit cheek, the far cheek as before (27.7; the reference 27.7), the skin under the brow 20.7.
 *  The upper lip, which faces down, had been painted half as light again for want of this light
 *  (portrait/src/dress.rs `Lips::upper` 1.5): now 1.15, and as dark as before (L 20.7, the reference 21.0). The
 *  exposure a little lower (0.375, before 0.4) and the brows a little denser (0.85, before 0.8), by what the
 *  fill adds: lit cheek L 61.5, brow 37.4 darker than the skin over it (37.9). Tried: more light from the sky
 *  (0.3: under the chin 51), a lighter ground (49), the old fill stronger (0.3: under the chin 45, but the far
 *  cheek 4 L lighter and the upper lip 5), the fill from steeper below (the far cheek 3 L darker, nothing
 *  gained under the chin), the key higher with the new fill (36 and 40 degrees: the far cheek 7 and 11 L
 *  lighter).
 *  Round 80: a short or a full beard of England is its painted layer alone, with no cards over it, but was
 *  drawn with the values of the layer under the hair of the head, the shade between the cards: a brown beard
 *  13.5 L darker than the same man's hair and as dark on the lit side as on the far one, a black shape (the
 *  reference's emperor: 2 to 8 L lighter than his hair, the lit side 18 L lighter than the far one). The
 *  layer of a beard has values of its own (`cap.beard`): lit jaw 2.4 L lighter than the man's hair, the far
 *  jaw 9.1 L darker. Hair, its under-layer and stubble as before.
 *  Round 81: shadows had hard edges (a dark wedge with a straight edge beside a man's nose, a hood's line
 *  across the forehead), because the key was a light without size. It has one now (`shadow.spread` 10 degrees
 *  to either side, as a window a metre broad seen from three metres), drawn as 8 lights over its disc. A
 *  broad light reaches further round the face (the women's far cheek 23.8 L darker than the lit one, before
 *  27.7): the key stands 6 degrees further round for it (70 from the face's front; far cheek 27.9, the
 *  reference 27.7). The face is 2 L darker with it (lit cheek 59.4, lips 18.3 and 31.3).
 *  Round 83: the skin between the nose and the far eye was a black wedge (on the women 55 L darker than the
 *  nose's back, the reference's woman 35; a man's eye 60 L darker than his lit cheek, the reference's emperor's
 *  41). That side of the nose faces a quarter turn away from the face's front: the key does not reach it, the
 *  light from below (on the key's side since round 78) hardly, and the rim light, which shines on it from 36
 *  degrees off its normal, lay in the head's shadow. On the reference's woman a pale bluish streak lies along
 *  the nose's far side (read as the light behind her). Three changes: the rim light's shadow is half as dark
 *  (`rimShadow` 0.5: the stage has no light that goes through the nose or comes back off the cheek, and this
 *  stands for it); the fill is the photographer's again, in front on the side away from the key and about
 *  level (0.18), where it reaches the far eye's socket; what chest and ground throw back is a light of its own
 *  from the middle (`bounce` 0.15). Grown women: beside the nose 36 L under its back, eye 39.7 under the lit
 *  cheek (40.2), under the chin 41 to 36 (42 to 36), the far cheek 24.3 (the reference 27.7 where the tool
 *  reads it; its cheek falls from L 39 to 20 within a tenth of the face's length there). Men's eye 50.3. Tried:
 *  the key nearer the front (60 degrees: the far cheek 20.8 and the wedge still 51; at 50 the far cheek 13.4),
 *  more sky (0.35: wedge 50), fills alone at 45 to 63 degrees round without the rim's change (wedge 44 to 49),
 *  three.js' neutral and AgX tone mapping in place of ACES (lighter shade, but the skin salmon and flat, or
 *  pale).
 *  Round 84: the pale streak the rim light draws down a man's nose ran in zigzag, the edge of the nose's own
 *  shade was bent, and a bald head had corners in its outline. The noses themselves are of human measure (24
 *  heads in mm, docs/PORTRAITS.md), and neither the rim's shadow (held 6 to 25 mm off the surface, its edge
 *  blurred 3 to 10 times as wide, a map of 4096, or none at all) nor the pores' normal map made the zigzag: the
 *  head's net is coarse there (triangles of 8 mm along the nose's back), and a highlight and the edge of a
 *  shade are bent at every edge of a triangle. The skin is now drawn as the smooth surface its net stands for
 *  (`skin.finer` 1 after one round of fitting, `skin.fit` 1: more rounds wave round the eyes; twice split
 *  looks the same as once). Faces measure as before to within 3 L. Tried and not kept: the light inside skin
 *  by d'Eon & Luebke's measured profile, read from a table by the angle to the light and the surface's
 *  curvature (Penner & Borshukov 2011), on top of `skin.wrap`: skin passes light on over a few millimetres,
 *  which at a portrait's size changes 340 of 564 480 pixels by 8 of 255 or more (lid rims, nostrils); three
 *  times as wide, which nothing measured stands for, it draws a red seam in the lid's fold. In place of the
 *  wrap it leaves the faces harder: the wrap is about what a lamp of the key's breadth reaches round a surface
 *  (10 degrees: 0.17), and stays.
 *  Round 85: a pale grey patch lay on the skin between the nose and the far eye, broad on children. It was the
 *  rim light's gloss: the rim stood 49 degrees round from straight behind the head, 2 degrees in front of the
 *  plane of the cheek beside the nose, and skin that a light skims shines pale towards whoever looks at it
 *  from the other side (grey skin in that field, of its lighter half: children 16.4 %, grown women 10.8 %; the
 *  reference's woman 6.2 %, on whom the streak is 3 mm wide along the nose's flank). The rim now stands 40
 *  degrees round, 8 degrees behind that plane, at the height it had: children 8.3 %, women 6.2 %. The grey
 *  gloss had also been much of the light on the far side of the face (with the rim there and nothing else
 *  changed, the far cheek 2.5 L darker on the women and 5.6 on the men, the shade beside the nose 6.3 and
 *  7.5): the fill, which reaches that side from the front in the skin's own colour, is half as strong again
 *  for it (0.28: the women's far cheek 23.5 L under the lit one, before 23.2, the men's 32.6, before 30.3;
 *  the shade beside a woman's nose L 20.6, before 23.0, the reference 29.8; a man's eye 47.4 under his lit
 *  cheek, before 49.6, the reference's emperor's 40.6). Tried: the rim level with the head where it stood
 *  (children 6.4 %, the faces best of all; but hair that hangs straight down shines most under a level
 *  light, and a girl's far plait was 11.5 L lighter, a pale lilac); that at half its energy (plait 3 L
 *  lighter, the shade beside the nose 6 L darker); 35 and 25 degrees round (children 6.3 and 3.1 %, the
 *  shade beside a man's nose 7 and 11 L darker than it was); less of the rim's shadow at 40 degrees (0.35:
 *  children 11.6 %).
 *  Round 86: a girl's plaits are round strands, solid, in the stage's shadows (materials.ts `rope`), and the
 *  rim level with the head no longer lights the far plait (L 12.6, with the rim as it is 12.2). Read on every
 *  group it is still not the better light for the faces: grey share beside the nose children 6.4 %, the young
 *  10.7, women 9.1, men 11.1 (as it is 8.3, 6.5, 6.2, 7.9). The lights stay as round 85 left them.
 *  Round 87: the hair of a man's, a boy's and a small child's head is locks, solid as a plait's strands
 *  (materials.ts `rope`, cut out where the locks' image is empty: frayed ends), no longer cards: it throws
 *  a shadow on the forehead and each lock has a lit and a shaded flank. Nothing of this profile changed for
 *  it; hair above the brows reads 2 L darker (eight heads, median 25.5, with cards 27.3).
 *  Round 88: the head hair of girls and young women is locks too, parted and drawn sleek to the plaits: no
 *  hair of England's dress is cards any more (this profile's `cards` is the look of its solid hair).
 *  Round 90: a full beard is locks over its painted layer (the builder's `<beard>_locks`, drawn as a head's
 *  locks are). `sheen.light` 0.5 (1.5 until then): the further darkening of the image's dark strands on light
 *  hair was set for cards, which had no depth of their own; on locks, which are lit by their form and throw
 *  shadows, it drew white hair and white beards as grey wool.
 *  Round 94: a pale grey patch still lay between the nose and the far eye of every face, with a cloudy edge.
 *  It was the rim light's highlight in the rim's own shadow: `rimShadow` 0.5 let half of it through the head,
 *  and three.js lets a light's highlight through with the light. From a place in a lamp's shadow the lamp is
 *  not seen, and a highlight is the lamp seen in the skin: the skin's highlight now takes each shadow whole
 *  (materials.ts `hidden`; the light let through stays, it stands for light off the cheek and through the
 *  nose). Grey share of that field: children 1.0 % (8.3), the young 4.4 (7.0), women 3.5 (6.3), men 6.3 (7.8);
 *  what is left lies where the rim light itself falls, a streak down the nose's far flank as on the
 *  reference's emperor. Nothing of this profile changed. The shade beside the nose is darker for it: women
 *  40.8 L under the nose's back (37.9; the reference's woman 35), men 34.9 (30.4); far cheek, eye and the rest
 *  of the face as they were (within 0.1 L; the women's nose's back 0.5 darker). Tried and not kept: less of
 *  the rim's shadow (0.35 and 0.25: the shade beside a woman's nose 39.6 and 38.9, a man's 33.1 and 32.1; by
 *  a rough reckoning the half let through is already twice what the lit far cheek throws back at the nose),
 *  the fill at 0.35 (38.8 and 32.8, but the women's far cheek 22.2 L under the lit one where the reference's
 *  is 27.7, and fill and the light from below together more than a quarter of the key).
 *  Round 103: after 102 rounds on single measures the pictures still read as plastic (Ramon). Held as whole
 *  pictures against what a portrait of the reference has, four things were the stage's, not the builder's.
 *  The curve: three.js' ACES bends red, green and blue each on its own, so lit skin went yellow and pale and
 *  was pulled back by tints; the picture is now drawn in linear light at twice the size and finished by
 *  `finish` (finish.ts): a curve that keeps a colour's hue, each pixel the mean of four. The ground: the
 *  panel's blue under a warm face made the skin orange by contrast; the picture brings its own, a neutral
 *  dark grey that is lighter behind the head, and darkens towards its corners. The skin: one smooth gloss on a
 *  face of 70 texels; it has a fine relief, a gloss that differs from place to place, a soft sheen at grazing
 *  angles (`relief`, `oil`, `fuzz`), and red light that reaches a little further round than green and blue
 *  (`wrap` 0.2, 0.16, 0.13; tried 0.45, 0.26, 0.18 with the key 60 degrees round: the far cheek 9.5 L under
 *  the lit one, the face a balloon). The eyes: an iris at 0.7 of its image was a dark hole at the panel's
 *  size; 1.3, its colour fuller, a darker ring at its rim (`iris`, `colour`, `lift`, `ring`). The key light
 *  stands 70 degrees round as before and 36 above (31 before: for the shade under brow, nose and lip), the
 *  rim is stronger (1.5; it has a dark ground to stand against now), fill, bounce and sky weaker (0.24, 0.1,
 *  0.12), and the head is nearer (`close` 1.12, before 1.3). Grown women: lit cheek L 55.7, a* 22.4, b* 26.6
 *  (the reference's 56.1, 22.9, 25.4), far cheek 22.1 under it (27.7; round 102 24.1; men 32.3), lower lip
 *  24.5 under and a* 4.5 over (22.9, 6.2; the lips' paint, dress.rs `Lips`), eye 30.5 under (37.5).
 *  Round 105: a child's skin (`skin.child`). The skin's images, their pores and the stage's relief, blotches and
 *  speckle are a grown person's; on a child of two they drew leather. The builder says how much of a child a
 *  person still is (`Portrait.young`), and a child's skin has 0.3 of all four (by eye; tried 1 and 0).
 *  Round 106: the stage held against the reference's numbers line by line (tools/portrait/gauntlet.mjs; 15 of
 *  19 lines passed, now all). The fill 0.14 (0.24): a woman's far cheek 24.5 under the lit one (22.1; 27.7)
 *  and the shade beside her nose 33.6 under it (30.6; 34 to 35). `skin.zone` 2.5: the nose's back 4.3 over the
 *  lit cheek (2.3; 8). The eye under a darker lid (`lid.dark` 0.3, `white` 1.75, `iris` 1.15; 0.5, 1.95,
 *  1.3): a woman's 36.8 under her cheek (30.5; 40.2), a man's 43.7 (37.4; 40.6).
 *  Round 107: the faces set beside real pictures of the reference at the same size, and drawn as it draws them
 *  (portrait/src/dress.rs `Style`: broad, with large eyes). In the larger opening between the lids the white
 *  at 1.75 was a white patch beside the iris, where the reference's is a grey that hardly stands out of the
 *  face: 1.3. The reference's brows are a dark, closed band, ours were single hairs over the skin: 1.15 (0.85).
 *  All values of this profile are PLACEHOLDER: held against one face of the reference, set by measure and by
 *  eye (docs/PORTRAITS.md). */
export const ENGLAND_1356: StageProfile = {
  key: 'england1356',
  lights: {
    key: { from: [4.58, 4.0, 3.06], colour: '#fff0de', energy: 1.8 },
    rim: { from: [-3.55, 2.5, -4.25], colour: '#bcd0ff', energy: 1.5 },
    fill: { from: [-4.0, -1.0, 4.0], colour: '#efe4da', energy: 0.14 },
    bounce: { from: [0.0, -3.0, 5.0], colour: '#efe4da', energy: 0.1 },
  },
  sky: { top: '#e6ecff', ground: '#8a6f5c', energy: 0.12 },
  rimShadow: 0.5,
  shadow: { map: 1024, strength: 0.7, radius: 2, spread: 10, lights: 8 },
  exposure: 0.35,
  turn: -0.24, rise: 0.03, close: 1.12,
  anisotropy: 8,
  skin: { rough: 0.55, specular: 0.42, pores: 0.8, wrap: [0.2, 0.16, 0.13], finer: 1, fit: 1, blotch: 0.05, speckle: 0.10, colour: 1.0, tint: [1, 0.75, 0.77], relief: 0.0015, oil: 0.5, fuzz: 0.3, child: 0.3, zone: 2.5 },
  eye: { corner: { from: 0.3, to: 0.8, dark: 0.35 }, lid: { from: -0.35, to: 0.05, dark: 0.3 }, tint: [0.84, 0.77, 0.64], white: 1.3, iris: 1.15, colour: 1.1, lift: 0.6, rough: 0.14, specular: 0.6, wrap: 0.5, cornea: 0.36, ring: 0.55 },
  brow: { rough: 1, specular: 0.05, lashes: 0.6, brows: 1.15 },
  cap: { tone: 1.7, light: 2.6, colour: 0.7, wrap: 1, shadow: false, stubble: 0, beard: { tone: 5.5, light: 3.2, colour: 0.65, wrap: 0.3 } },
  cards: { rough: 0.72, specular: 0.2, anisotropy: 0.3 },
  sheen: { white: 0.3, whiteSharp: 120, whiteShift: 0.1, own: 0.45, ownSharp: 40, ownShift: -0.1, ragged: 0.15, strands: 1.35, light: 0.5, colour: 0.7, wrap: 1 },
  finish: {
    fine: 2,
    curve: { contrast: 1.4, start: 0.22, length: 0.4, black: 1.5 },
    hue: 1, pale: 0.3, colour: 1.08,
    shade: [1, 1, 1], light: [1, 1, 1],
    backdrop: { inner: '#4a4e50', outer: '#15181b', at: [0.42, 0.36], reach: 0.75 },
    vignette: 0.25,
  },
};

const PROFILES = [ENGLAND_1356];

/** The profile of a portrait, from the name of its look: the set of dress in front of the slash, else Apoleia's. */
export function profileOf(look: string): StageProfile {
  const slash = look.indexOf('/');
  return (slash > 0 && PROFILES.find(p => p.key === look.slice(0, slash))) || APOLEIA;
}
