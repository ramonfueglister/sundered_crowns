// The stage of the game's own dress of 1356 (portrait/src/dress.rs): England's profile, and the plain dress under
// the same light. Set by eye in rounds against screenshots of Crusader Kings III (docs/PORTRAITS.md), so every
// number in it is a PLACEHOLDER in the project's sense: chosen, not measured or sourced.
import type { StageProfile } from './profile';

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
 *  Round 108: the clothes. On the sheets beside the reference the chest of six people read L 10 with a chroma of
 *  7, a black shape under the head, where the reference's clothes read 30 and 17. No light mends it (without the
 *  key's shadow 9.4, without the vignette 11.0, the fill or the bounce several times as strong 11.2): the
 *  builder's wools are a quarter as light as skin, and under the curve's straight part a value is drawn darker
 *  than it is. `cloth.wool` 2.6, as `cap.light` for hair: L 25, and with the stronger wools of that round
 *  (portrait/src/dress.rs `wool`) a chroma of 17. Linen is light enough as it is (1).
 *  Round 109: the hair of a head is a body of thick bundles, modelled (tools/portrait/pipeline/hair_body.py),
 *  in place of 950 narrow locks. The stage draws it as it drew the locks (materials.ts, kind 'rope'), and no
 *  value of this profile changed: where the body is dark between its bundles is baked into its corners' colour
 *  by the builder, not a matter of a light.
 *  Round 110: the gown is cut at the neck (a man's opened in a V, a woman's wide) and linen is worn under it
 *  and shows there (a shirt, a smock: one image, `cloth_smock`, which the stage draws as linen). No value of
 *  this profile changed.
 *  All values of this profile are PLACEHOLDER: held against one face of the reference, set by measure and by
 *  eye (docs/PORTRAITS.md).
 *  Round 112: `skin.zone` 7 (2.5). The faces differ more, the noses among them: narrow and broad in the bridge,
 *  small and large. A narrow or a small nose carries less of the highlight down its back, a broad or a large one
 *  hardly more, and of the sample's eight grown women five have a short nose: their nose's back stood 2.9 over
 *  the lit cheek (4.4 in round 111; the reference's 8). At 5 it is 4.0, at 7 4.8: nearer to the reference than
 *  any round before, and on the pictures a little more light on bridge and tip (seen on England's sample and on
 *  eight faces of other pools, dark ones among them).
 *  Round 113: that was a mistake. Beside the reference at twice the size the stripe was a pale, mottled patch on
 *  every nose's bridge and a white blob on its tip, there to pass a line read off one face; `skin.zone` is gone
 *  (what the reference has is a narrow streak on the nose's far flank, the rim light's gloss: read on five
 *  faces, docs/PORTRAITS.md, and not drawn yet). The shaded half of a face was grey, the rim light's blue let
 *  through its shadow: its chroma 9.6 under the lit cheek's on the women and 15.3 on the men, where four faces
 *  of the reference keep it within 2. The light a shadow lets through takes the colour of light that has been in
 *  skin (`skin.bleed` 1, 0.5, 0.35), the fill is a red light (`ff9a6a` at 0.2; `efe4da` at 0.14), the sky's
 *  ground warmer (`a0653f`; `8a6f5c`), the wrap redder (0.3, 0.16, 0.10; 0.2, 0.16, 0.13), and the skin keeps
 *  0.88 of its colour (the lit cheek's chroma went past the reference's with the red fill): 2.9 and 4.3 under
 *  now, the women's far cheek 17.8 L under the lit one. `pores` 0.4 (0.8): the pores' image has 110 by 150
 *  texels for a face and mottled the highlights. The skin's image is the one without the photographs' light
 *  for every head (portrait/src/real_look.rs).
 *  Round 114: the skin was salmon. Its colour had been held to one face of the reference since round 71 (the
 *  ruler designer's woman: lit cheek a* 22.9, hue 48); five large faces of the developer diaries read at the same
 *  place have L 60.3, a* 16.2, b* 25.6 in the mean (hue 57.7, chroma 30.3), and hers is the reddest of the six.
 *  Ours stood at 55.1, 23.5, 26.2. The tint takes less green (0.87; 0.75), the skin keeps 0.7 of its colour
 *  (0.88) and the picture is a little lighter (exposure 0.38; 0.35): 58.8, 17.1, 26.2 (hue 56.9, chroma 31.3),
 *  the men's 59.7, 16.1, 25.9. The eyes, set beside the five's eye by eye at one size: our lashes lay on the
 *  upper lid as a band of dark stripes (`brow.lashes` 0.3; 0.6), the iris had a hard dark rim (`eye.ring` 0.35;
 *  0.55), the brows were strokes of near black (`brow.brows` 0.95; 1.15, with the builder's `brow_soft`), and
 *  the white was a cooler grey than theirs (theirs a* 11, b* 19 at 12 L under the cheek; ours a* 7.4, b* 13.0
 *  at 15 under: the tint 0.84, 0.73, 0.57; 0.84, 0.77, 0.64, and the upper lid's shade lighter, 0.4; 0.3. Now
 *  a* 7.5, b* 14.8: a small step). What the eye still has and theirs do not: a black line round its opening
 *  and a pupil as a black dot in a light iris (the darkest third of a box round the pupil 52 L under the cheek
 *  at a* 1; theirs 22 to 49 under at a* 3 to 16). Tried and dropped: a darker iris (black holes, as before
 *  round 103), a softer toe of the tone curve (`finish.curve.black` 1.0: the eye's darks 8 L lighter, but the
 *  eye as a whole leaves the reference's by 4 and nothing else moves: the skin's red lies above the toe), a
 *  warm colour for the shade in the skin's folds (nothing to see).
 *  Round 116: the key light is twice as large (`shadow.spread` 20; 10). What round 114 left open as "cause not
 *  found" is the key's cast shadow after all: a man's nose stands out further and is broader than a woman's, and
 *  its shadow, hard at the edge, reached the place on the far cheek that is read (with no shadow at all the men's
 *  far cheek is 19.9 L under the lit one, with it 32.3; the women's 11.5 and 19.9). Under the larger light the
 *  shadow's edge is soft there: the men's 24.3 (the reference's 16.9), the women's 19.0 as before, the shade
 *  beside a woman's nose 30.7 (33.2; the reference's 34.5). At 24 and more that shade leaves the reference's by
 *  more than 4; a key more from the front (50 and 45 degrees off the face instead of 56) lights the women's far
 *  cheek as much as the men's and loses two lines.
 *  Round 118: the stare (docs/PORTRAITS.md). The white of the eye was grey beside warm skin (a 6.6, b 9.2 in
 *  CIELAB under skin of 14.0 and 20.9) and stood out by its colour: `eye.blush` warms it and leaves it as light
 *  (a 10.2, b 13.7; the reference's 7.5 to 14.1 and 15.6 to 18.2). The image's pupil is a hard pinpoint (0.29 of
 *  the iris): `eye.pupil` draws one of 0.42 with a soft edge. The eight key lights of round 116 threw eight
 *  points on the ball: `eye.rough` 0.22 (0.14) runs them together; at 0.25 the glint is faint and the eye dull.
 *  Round 119: the eye that glows in the shade (docs/PORTRAITS.md). `eye.wrapWhite` 0.1: the white of the eye takes
 *  less light from round the ball than the iris (`eye.wrap` 0.5 for both since round 60, when one key stood on
 *  the other side). On the half of the face turned from the key the white was lighter than the cheek under it
 *  (by 4.4 L on the grown women; on ten women of the reference it is 7.3 darker there and 6.7 darker on the lit
 *  half): skin went into shade and the ball did not follow. Now 4.7 darker in the shade, 10.4 on the lit half
 *  (9.2). The iris and the pupil keep their 0.5: with 0.15 on the whole ball the eye's middle was 5 L darker
 *  and left the reference's by 6.9 (limit 4).
 *  Round 122: hair as light and as coloured as its colour (docs/PORTRAITS.md). The image of a bundle and the
 *  shade baked between the bundles take half of a hair's colour, and `sheen.colour` 0.7 was set in round 47 for
 *  cards: brown hair read L 18.4 at the crown with a chroma of 11.5 (eleven heads; the reference's brown heads
 *  25 to 32 and 21 to 25). `sheen.tone` 1.6 on dark hair, `sheen.toneLight` 1 (blond and white hair were as
 *  light as the reference's), `sheen.colour` 0.85: L 26.5 and 18.6. With all of the colour a light brown was as
 *  coloured as the reference's reddest head. The painted layers in step: `cap.colour` 0.85, a short beard
 *  lighter by the same 1.6 (`cap.beard.tone` 8.8, `cap.beard.colour` 0.8). tools/portrait/hair_colour.mjs.
 *  Round 123: a softer light (docs/PORTRAITS.md). Four more faces of the reference's women were read at the
 *  gauntlet's places, and four of its lines are held to the five's mean since (far cheek 16.5 under the lit one,
 *  the shade beside the nose 26.9, the cheek beyond it 12.4, the nose's back 2.8 under): the one woman they
 *  were read on is the hardest lit of the five in all four. Held to that, the stage of round 122 was 0.5 L
 *  too dark on the cheek beyond the nose, 0.1 too light on the nose's back, and its men's far cheek 8.9 too
 *  dark. The key is larger again (`shadow.spread` 35; 20: a window a metre and a half wide a metre off): the
 *  men's far cheek 19.8 under the lit one (25.8; the reference's 16.9), the women's 15.7 (18.2). Under it the
 *  key reaches further round the nose and the shade beside it would be 24: `rimShadow` 0.9 (0.5) leaves a
 *  tenth of the rim to pass the head, 27.6. `sky.energy` 0.2 (0.12) lifts what faces up or down in the shade
 *  (the cheek beyond the nose 15.6 under; 16.9). The narrow streak of light on the far flank of the reference's
 *  noses is still not there: a light from the side (95 and 110 degrees round, the rim's shadow whole) lit the
 *  far half of the face as a second key.
 *  Round 124: a bust (docs/PORTRAITS.md). The figure has a body under the shoulders now, and the picture shows
 *  it: `close` 0.85 (1.12), the head from chin to crown on 0.45 of the height (0.59), the picture's foot under
 *  the chest. `shadow.reach` 0.68 keeps the box of the shadows as large on the figure as it was (0.9 of a
 *  picture's height at 1.12: 0.8 of the builder's frame either way), so that the shadows on the face are drawn
 *  with the same pixels. `rise` 0.11 (0.03) keeps the camera at the eyes' height, where the dress table's eyes
 *  look (with 0.03 it stood 5 cm under them in the wider picture, and the eyes looked 2 degrees over it).
 *  Round 158: a white sheen on black hair (docs/PORTRAITS.md). Black hair read L 5.2 at the crown (four heads,
 *  `gene=27:60`; the reference's dark head 17.9), a shape without form: the white band of the sheen was 0.3,
 *  set on brown hair, where the band in the hair's own colour shows the strands. The white band is the
 *  reflection off a hair's surface and stays as the hair gets darker (Marschner et al. 2003, "Light Scattering
 *  from Human Hair Fibers", section 2.1: "R highlight, since it is surface reflection, is white"): `sheen.white`
 *  2 on black hair, `sheen.whiteLight` 0.3 from a middle brown on, as sharp as before. L 13.1 on black, 15.7 on
 *  a dark brown (9.3), 24.7 on brown (24.4), blond as it was. Stronger and broader (2 at a sharpness of 60: L
 *  17) the heads read grey, not black. By eye: PLACEHOLDER.
 *  Round 159: a short beard in the face's light (docs/PORTRAITS.md). On light brown and blond hair, which half
 *  of England's men have since round 157, a short beard was a bright flat patch: its layer took no shadow
 *  (`cap.shadow`, off since round 53 for the hard edges shadows had until round 81) and light from a third of
 *  the way round its shaded side (`cap.beard.wrap` 0.3), so under a hood it was lit and the skin beside it was
 *  not (three hooded men, the beard's pixels: L 41.1 on light brown hair over skin that reads 32.5 without the
 *  beard). `cap.shadow` true, `cap.beard.wrap` 0: 33.3, a blond beard 37.3 (45.6), a brown one 26.2 (32.8), a
 *  black one 9.8 (11.3). The layer keeps its colour and its factors. By eye: PLACEHOLDER. */
export const ENGLAND_1356: StageProfile = {
  key: 'england1356',
  lights: {
    key: { from: [4.58, 4.0, 3.06], colour: '#fff0de', energy: 1.8 },
    rim: { from: [-3.55, 2.5, -4.25], colour: '#bcd0ff', energy: 1.5 },
    fill: { from: [-4.0, -1.0, 4.0], colour: '#ff9a6a', energy: 0.2 },
    bounce: { from: [0.0, -3.0, 5.0], colour: '#efe4da', energy: 0.1 },
  },
  sky: { top: '#e6ecff', ground: '#a0653f', energy: 0.2 },
  rimShadow: 0.9,
  shadow: { map: 1024, strength: 0.7, radius: 2, spread: 35, lights: 8, reach: 0.68 },
  exposure: 0.38,
  turn: -0.24,
  rise: 0.11,
  close: 0.85,
  anisotropy: 8,
  skin: {
    rough: 0.55,
    specular: 0.42,
    pores: 0.4,
    wrap: [0.3, 0.16, 0.1],
    finer: 1,
    fit: 1,
    blotch: 0.05,
    speckle: 0.1,
    colour: 0.7,
    tint: [1, 0.87, 0.77],
    relief: 0.0015,
    oil: 0.5,
    fuzz: 0.3,
    child: 0.3,
    bleed: [1, 0.5, 0.35],
  },
  eye: {
    corner: { from: 0.3, to: 0.8, dark: 0.35 },
    lid: { from: -0.35, to: 0.05, dark: 0.4 },
    tint: [0.84, 0.73, 0.57],
    white: 1.3,
    iris: 1.15,
    colour: 1.1,
    lift: 0.6,
    rough: 0.22,
    specular: 0.6,
    wrap: 0.5,
    wrapWhite: 0.1,
    cornea: 0.36,
    ring: 0.35,
    pupil: { size: 0.42, soft: 0.1, dark: 0.25 },
    blush: [1.27, 0.945, 0.76],
  },
  brow: { rough: 1, specular: 0.05, lashes: 0.3, brows: 0.95 },
  cap: {
    tone: 1.7,
    light: 2.6,
    colour: 0.85,
    wrap: 1,
    shadow: true,
    stubble: 0,
    beard: { tone: 8.8, light: 3.2, colour: 0.8, wrap: 0 },
  },
  cloth: {
    wool: 2.6,
    linen: 1,
    silk: { tone: 2.6, rough: 0.55, specular: 0.5 },
    figured: { gold: [1.2, 0.8, 0.22], cover: 0.7, rough: 0.4, metal: 0.2 },
  },
  cards: { rough: 0.72, specular: 0.2, anisotropy: 0.3 },
  sheen: {
    white: 2,
    whiteLight: 0.3,
    whiteSharp: 120,
    whiteShift: 0.1,
    own: 0.45,
    ownSharp: 40,
    ownShift: -0.1,
    ragged: 0.15,
    strands: 1.35,
    light: 0.5,
    colour: 0.85,
    tone: 1.6,
    toneLight: 1,
    wrap: 1,
  },
  finish: {
    fine: 2,
    curve: { contrast: 1.4, start: 0.22, length: 0.4, black: 1.5 },
    hue: 1,
    pale: 0.3,
    colour: 1.08,
    shade: [1, 1, 1],
    light: [1, 1, 1],
    backdrop: { inner: '#4a4e50', outer: '#15181b', at: [0.42, 0.36], reach: 0.75 },
    vignette: 0.25,
  },
};

/** The plain dress of 1356 (portrait/src/dress.rs `PLAIN_1356`: everybody whose own dress is not drawn yet) stands
 *  under England's light, so that the faces of the world are judged as England's are. */
export const PLAIN_1356: StageProfile = { ...ENGLAND_1356, key: 'plain1356' };
