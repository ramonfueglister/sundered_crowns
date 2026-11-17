# Portraits

Status: **carried over, not yet in the game.** The portrait generator of Apoleia (Ramon's earlier project) builds
and draws in Sundered Crowns as it did there. No window of the game shows a portrait yet, because the game has no
persons yet (thread "Personensystem als ECS entwerfen").

Since 15.11.2026 (Ramon: build the state of the rounds in cleanly) there is a first set of dress of the game's own
beside Apoleia's Roman one: simple people of England 1356, see below. It is a draft by eye, not sourced.

Ramon, 15.11.2026: the style stays the realistic look of Apoleia's portraits, adapted to 1356, later for every
country of the world; the takeover is to be a clean refactoring, not a rewrite by feel. So the first step, this
one, changes nothing: same people in, same pictures out, measured.

## What there is

| Part | Where | What it does |
|---|---|---|
| Builder | `portrait/` (Rust, WebAssembly) | From a person (68 bytes of genes, sex, age, estate, occupation, origin, food, mourning, wealth, worn clothes) to the triangles of head and shoulders: MakeHuman's head morphed by the genes, skin, eyes, hair, beard, clothes, headwear, jewellery |
| Genes | `portrait/src/dna.rs` | 34 genes of two alleles, one byte each; a child takes one allele of each gene from either parent, plus a small mutation |
| Dress | `portrait/src/dress.rs` | Sets of dress as tables, chosen by where a family comes from; no set: Apoleia's Roman dress |
| Stage profile | `src/portrait/profile.ts` | Light and materials per set of dress; Apoleia's portraits keep Apoleia's |
| Pipeline | `tools/portrait/pipeline/` | Blender scripts that wrote the draped clothes and hair (not part of the build) |
| Files of the real look | `public/portrait/` (29 MB) | The head (1.1 MB), data files (4.1 MB: hair and beard cards, draped clothes, skin shading), images (16 MB: skin by age and sex, wrinkle maps, hair, cloth, eyes) |
| Stage | `src/portrait/` (three.js) | Lights, frames and draws one portrait; materials per kind of surface |
| Test page | `portrait-test.html` | The twelve test people; `?origin=England` puts them into the dress of 1356, `?female=1&age=17` and `?gene=27:135,28:95` set sex, age and genes of all of them, `?only=930000,930003` draws these alone, `?turn=-1.25` shows every head from the side, `?without=_cap.` leaves out the surfaces whose image name contains the text, `?sample=england` draws England's own sample of 36 people (`tests/portrait/sample_england.json`) in place of the twelve, `?set=exposure:0.5,skin.tint.1:0.75,sky.top:ffe9d6` sets values of the stage's profile by their path (a number, or a colour as six hex digits) |

`npm run portrait:build` builds the WebAssembly file and the list of files into `public/portrait/` (both are in the
repository, because the site is built where there is no Rust).

Use:

```ts
const assets = await loadPortraitAssets();                 // builder, head, data files (about 5.7 MB, once)
const stage = new PortraitStage({ images: assets.images, url: assets.url });
await stage.draw(assets.builder.build(person));            // the picture is on stage.renderer.domElement
```

## The dress of England 1356 (draft)

A person whose family comes from "England" (`PortraitPerson.origin`) is dressed from the table `ENGLAND_1356` in
`portrait/src/dress.rs`; every other origin still gets Apoleia's Roman dress, unchanged to the byte. A further
country is meant to be a further table and its files, not code. That is only half true yet: the table chooses among
the parts the builder knows (a gown, a hood up or back, a veil, a wimple, three hairstyles); a part of another kind
(a hat, a turban, a cloak) needs code once.

| What | In the table | State |
|---|---|---|
| Gown (cote) with a round neck, long sleeves | `gown`, six wool colours | cut and colours by eye |
| Hood (men): up, thrown back, or none, by chance per person; none under 14 | `hood`, `hood_from` | shares 4 : 3 : 3 invented |
| Veil of linen for women from 20, with a wimple from 50 | `veil_from`, `wimple_from` | ages invented |
| Hair: cut round with a fringe (men), flat under a hood, none under the veil (it hides all of it; a bun until round 69); girls from 7 and women too young for the veil a centre parting and two plaits in front of the shoulders | `hair`, `hair_receding`, `hair_bald`, `hair_curly`, `hair_hooded`, `hair_veiled`, `hair_girl` | by eye |
| Children: a braincase as large against the face as a real child's, by age and sex (round 100; MakeHuman's child is a grown head made small) | `skull`, `skull_of` | fitted to a survey of children's heads (Snyder and others 1977); where the braincase begins and the band it fades over by anatomy and by eye |
| Children: a mouth as broad against a grown one's as a real child's, by age and sex (round 101; until then one weight for all ages, by eye) | `child_mouth`, `child_mouth_of` | fitted to the same survey |
| Children: a nose as long against a grown one's as a real child's (round 102; MakeHuman's child has a grown face's proportions) | `child_nose`, `child_nose_of` | fitted to the same survey where a nose was too long (boys, girls of two); the lower face is still too short (tried in rounds 101 and 102 and dropped); where the face's front begins and how a strain sets in by anatomy and by eye |
| Faces: relaxed lids, a closed mouth with the lips on each other from corner to corner (round 99), the eyeballs deeper in their sockets (they came through the lower lid), for women a jaw that runs in to the chin (until round 96 a shifted gene of the jaw, `jaw_women`), cheeks filled out between cheekbone and jaw (round 97) and a thicker neck (round 98), redder lips, more flush on cheeks and nose | `lids`, `mouth_shut`, `seam_shut`, `eye_forward`, `rest` with `lower_only`, `cheek_fill`, `neck`, `lips`, `flush` | by eye, against the reference |

**Sources.** Each row of the table names what it rests on (`sources`). All of them were read only as summaries
(proposal of 15.11.2026), none in the original, and no value is taken from a source. Everything is PLACEHOLDER
until the cut, the colours and the headwear are checked against sources (e.g. the Luttrell Psalter's working
people, finds of cloth from London). No estates yet: a noble of England wears the same gown as a villein.

**Calmed clothes** (`real_look.rs`, `calm`): a garment bound to the head's triangles follows every small bump of a
morphed body and crumples. The builder now takes only the smooth part of the movement (24 passes over the
neighbours) and keeps a least distance to the body per layer (gown 0.07 to 0.09, what lies over it 0.13 to 0.17,
on the head at most 0.05). Apoleia's own clothes are bound as before.

**Stage profile** (`src/portrait/profile.ts`, by eye): key light more from the side, less light from all round,
skin with a soft reddish edge of the shadow (wrap lighting, where Godot scatters inside the skin) and slight
blotches, the lid's shadow on the eyeball and shade in its corners, the eye less white and less coloured, thin
lashes; hair with a sheen of strands (two bands along the strand after Kajiya & Kay 1989, as in Scheuermann 2004);
the rim light throws shadows, so that it does not shine through the head onto the side of the nose.
Hair keeps its colour on its shaded side (wrap lighting, `sheen.wrap`: hair passes light round, a plain surface
does not).

**Tone, measured (round 41).** Until round 40 the lit half of a face was nearly as bright as white linen and
pale yellow: the tone mapping (ACES) takes the colour out of what is that bright. Measured in CIELAB at spots
set by hand on one screenshot of Crusader Kings III (a ruler, his wife, a small portrait of the heir) and on four
of ours:

| | L | a | b |
|---|---|---|---|
| CK3, lit skin (five spots) | 38 to 61 | 14 to 21 | 14 to 26 |
| CK3, shaded cheek | 20 to 24 | 12 to 18 | 9 to 18 |
| ours until round 40, lit skin | 80 to 81 | 6 to 8 | 18 to 21 |
| ours until round 40, shaded cheek | 37 to 53 | 23 to 24 | 24 to 29 |
| ours since round 41, lit skin | 67 to 69 | 10 to 12 | 22 to 26 |
| ours since round 41, shaded cheek | 24 to 38 | 18 to 23 | 16 to 24 |

So the exposure went from 0.8 to 0.46, the skin got a slight tint towards red (`skin.tint`), the light from
below (fill and the sky's ground) lost its brown, and the flush of the cheeks went back from 1.35 to 1 (it had
been raised against the pale skin and now read as rouge). Further towards their numbers (exposure 0.42, tint
1 / 0.9 / 0.95: lit skin L 64, a 14 to 16) the darker skins turned brick red, so it stops short: our lit skin is
still paler and less red than theirs, our shaded half more coloured. One screenshot of a dim hall is a thin
base: the numbers say where the tone lies, not that it is right.

**In the game's panel (round 42).** The person's panel shows a portrait at 224 x 280 on parchment, not small on
a dark ground as the rounds had judged it. There the head filled a third of the height above shoulders in their
whole width. The 1356 profile frames it closer (`close` 1.3: chin to crown nearly half the height, as in CK3's
character window). The white of the eye went back to 1.3 (at 1.5 it stared on the light ground), and the red
edge of the skin's shadow is narrower (`wrap` 0.18 / 0.15 / 0.13: the shaded cheek at a 11 to 20, b 13 to 22).
The rounds were judged in this panel until round 48 (see round 49 for the panel as it is now).

**What the panel showed (round 43).** At that size Apoleia's hair for a head that loses it reads as rows of
scales (short locks, white on the old), its chin beard as a tuft of long strands, and the short beards as black
on brown-haired men. The dress table now names its own hair for such heads (`hair_receding`, `hair_bald`: the
hair of 1356 with the hairline gone back, and as a horseshoe round a bare top; `styles.py` `BOB_LINE`) and which
beard is worn in place of each of Apoleia's (`beards`: none on the chin alone, no philosopher's; unsourced). The
painted layer of short hairs is drawn lighter and lit round its shaded side as the cards are (`cap` in the
profile): its image is far darker than the cards', which at the lower exposure turned a brown beard black.
A mood shows less strongly (`mood` 1 in the dress table, Apoleia's 1.7 was drawn for a small picture): a sad
mouth on an old face read as a mask.
The full beard is the dress's own (`beard_full`): Apoleia's hangs in long single strands that read as wool. Until
round 52 it was `beard_trim` (round 45), from fewer and broader cards; since round 53 it is `beard_crop`, without cards (see
there).

**Curls, plaits, white dots (round 46).** A head with curls wore Apoleia's `curly01`, which reads at the panel's
size as ridges of short locks: the dress table names its own (`hair_curly`: `bob05`, the hair of 1356 from
narrower strands that swing and stand off the head; `styles.py` `BOB_WAVE`). The plaits' hairline lies lower and
the hair above it stands further off (the forehead was high under a flat cap). Single white pixels at the parting
and the head's outline came from the stage, not from the hair: the light that bleeds round the edge of a shadow
(`wrap`) also went into three.js' highlight, whose term for grazing angles divides by the angle to the light. The
wrap now lights the diffuse part only (`materials.ts` `wrapped`); near-white pixels over twelve girls went from
174 to 0.

**Hair colour, measured (round 47).** The twelve test people are Apoleia's, most of them dark. A person of the
game's England draws the genes of hair and skin from other ranges (`dna.rs`, pool of Gallia: lightness 50 to 220,
red 20 to 170 of 255), so the test page can now set genes (`?gene=27:135,28:95`: both alleles of lightness and
red). With the middle of those ranges every man had bright orange hair. Two causes, two changes:

| hair above the brows, CIELAB (10th, 50th, 90th percentile) | L | chroma |
|---|---|---|
| CK3, the ruler's red hair in the light | 10, 22, 66 | 10, 24, 33 |
| CK3, his beard | 10, 24, 39 | 17, 27, 34 |
| CK3, the heir's red-blond hair | 23, 37, 56 | 16, 26, 36 |
| ours before, middle of England's ranges | 25, 33, 40 | 29, 37, 44 |
| ours before, strongly red | 33, 43, 50 | 36, 44, 50 |
| ours now, middle of England's ranges (brown) | 23, 32, 39 | 15, 21, 25 |
| ours now, strongly red | 33, 42, 50 | 25, 31, 36 |
| ours now, blond | 39, 49, 58 | 18, 24, 27 |

1. The stage drew hair about one and a half times as coloured as the reddest hair in the screenshot. The 1356
   profile leaves 0.7 of the colour in hair and its painted layer (`sheen.colour`, `cap.colour`).
2. Apoleia mixes red into hair in step with the red gene from 0 on, so the middle of England's range is already a
   quarter red. The dress table sets from which strength of the gene red shows at all and where it is full
   (`hair_red` 0.45 to 0.74): of founders of that pool about 5 in 100 have clearly red hair, about 18 in 100 a
   tint, the rest are brown to blond. The 5 in 100 is an estimate from a press report of carriers (34 to 40 in 100
   in Yorkshire and south-east Scotland, BritainsDNA 2013), not a count and not of 1356: PLACEHOLDER. The pool
   itself is unchanged (it belongs to the persons' simulation and is in the saved world).

White hair read as wool: bright all over, and the sheen that shows the strands of dark hair does not show on
white. Hair as light as white now gets its darker strands drawn darker (`sheen.light`), and its painted layer
lighter (`cap.light`), so that a white moustache (painted) matches the white beard (cards). Tried and dropped:
less flush for old men (the red patch on their far cheek is the key light past the nose, not the flush).

**Skin of England's people, measured (round 48).** Round 41 measured the test people, whose skin is darker than
any the game draws for England (skin gene 0 to 80 of 255). Faces of that pool, the box between brows and mouth,
CIELAB at the 50th and 90th percentile:

| | L | a | b |
|---|---|---|---|
| CK3, the ruler (in the light) | 42, 66 | 19, 24 | 23, 28 |
| CK3, his wife (in the dim) | 34, 45 | 13, 16 | 12, 16 |
| ours before, women of England's pool | 53 to 58, 73 to 75 | 7 to 8, 9 to 11 | 18 to 20, 20 to 22 |
| ours now | 49 to 53, 69 to 71 | 11 to 12, 13 to 15 | 19 to 21, 21 to 22 |

Their skin was paler and far less red than CK3's: Apoleia's lightest skin colours are a yellowish beige (a of
about 8). The tint towards red is stronger (`skin.tint` 1 / 0.82 / 0.86) and grows with the skin's lightness, so
that the dark skins of the test people stay as they were (round 41 had stopped where they turned brick red). The
exposure went from 0.46 to 0.43, and the cheeks' flush from 1 to 0.7 (`flush` in the dress table: on skin that
light it read as rouge). Still lighter and less red than the ruler; further it turned pink.

**In the navy panel (round 49).** Since 15.11.2026 (PR #21) the person's panel is the game's navy and gold
HUD: the portrait stands about 268 px wide on a dark blue ground (`src/people/panel.css`), not on parchment. The
rounds are judged there now. The panel drew the picture at 224 x 280 and the page scaled it up, which made it
soft; it is drawn at 448 x 560 (`src/people/panel.ts`). On the dark ground the rim light (as strong as three
quarters of the key light, bluish) made the plait on the far side a pale, see-through grey: its energy went from
1.4 to 0.8. The eyeball had been brightened for the parchment (`eye.tint` 1.3) and light eyes stared, children's
most: back to 1.08, with more shade from the upper lid (`eye.lid.dark` 0.65). White hair's darker strands a little
less dark (`sheen.light` 1.5: at 2 it read as striped).

**Lifeless faces (round 50).** Ramon on the state of round 49: "Zombie-Modus", not CK3's level. Held large
against the ruler's face in CK3, the causes were pose and expression more than surface:

| what read as lifeless | cause | now |
|---|---|---|
| the head bowed, seen from above, sunk between the shoulders, the brow hanging over the eyes | MakeHuman's man stands with the head pushed forward; its woman holds hers up and was seen from below | `lean` in the dress table, per sex (men 0.14 back, women 0.1 forward, radians), turned in the builder about the head's centre (`build.rs` `lean_back`) |
| the eyes looking past the viewer | the eyeballs look straight ahead of a head that the stage turns away | `gaze` in the dress table (-0.2): the ball's image is laid round that direction, the lean taken out of it |
| heavy lids | `lids` had been set against a stare on parchment | half as far down (0.1 / 0.3 / 0.1 / 0.3) |
| a broad grey sheen on the eyeball, no point of light; then the whites far brighter than the face | `eye.rough` 0.2 spread the key light's glint; `eye.tint` above 1 | `eye.rough` 0.07, `eye.specular` 0.6; `eye.tint` 0.84 / 0.82 / 0.8 |
| the mouth's corners down, the lower lip a pale block that stands out from the side as a pout | MakeHuman's base, and `mouth_shut` pushing the lower lip up | `rest` in the dress table: targets under every mood (corners and cheeks up a little, brows up, the jaw closing the mouth, less lower lip); `mouth_shut` 0.6 / 0.45; lips redder (`lips` 0.7 / 0.5) |
| a mourner's mouth as an upturned U | the mood's targets at full weight | `mood` 0.6 |
| pale skin | measured again in the face's box: median a 12 against the ruler's 19, L 55 against 42 | `skin.tint` 1 / 0.78 / 0.8, exposure 0.41: a 14, L 53 (further it turned pink; CK3's wife in half shade has a 13) |

The straight men's hair (`bob01`) is built from more, narrower strands with a slight swing (`BOB_WAVE=0.03,0.05,0.9`):
its outline shows locks instead of a smooth dome. Tried and dropped: the full beard's cards cut off before the
strands thin out (`TRIM_V=0.68`: square notches along its lower edge). Not solved by this round: the women's and
children's mouths still stand a little open or pout, children's eyes are large and round, women's brows are as
heavy as men's, the full beard reads as rows of shingles at a large size, and the gown lies round the neck as a
mound that hides it (CK3 shows neck and shoulders).

**Neck, boys, women's mouths (round 51).** The "mound round the neck" was not the gown: with the Roman dress and
with the genes for weight and muscle at their ends the men's necks showed. It is the cape of the thrown-back hood
(three men in ten wear it so) on the short neck MakeHuman's man has. `rest` in the dress table now holds a weight
for women and one for men, and men get a longer neck (`neck/neck-scale-vert-incr` 0.4; at 0.5 it read as
stretched). A boy took the men's values from birth: a long neck and a bust leaning back on a child's body. He now
grows from the women's values to the men's as he grows up (`dress.rs` `by_sex`, for `rest`, `lean` and the gaze),
and a child's face takes a third of the resting targets, growing to all of them. The women's mouth read as open
at the panel's size because the upper lip lay in shadow as a dark line: the upper lip is taller and fuller, the
lower lip flatter, and `mouth_shut` is 0.75 / 0.6. The lips of round 50 read as painted: `lips` 0.55 / 0.45.
Still open: women's brows as heavy as men's, children's eyes large and round, the full beard as rows of shingles.

**Girls with a child's head, women that read as children (round 52).** Seen from the front and from the side
(`?turn=0`, `?turn=-1.3`), not only as the panel shows them:

| what was wrong | cause | now |
|---|---|---|
| a girl of 17 with a high round forehead over a small face | MakeHuman's head grows evenly from its child of ten to its adult of 25: at 17 it is more than half a child's | `adult` in the dress table (15 for women, 17 for men, Apoleia's own ages for "grown"): the head has its adult form from then on (`dress.rs` `head_years`). Face width, upper face height and the lower jaw's height reach adult size at 12 in girls and at 15 in boys (Farkas, Posnick & Hreczko 1992, Cleft Palate-Craniofacial Journal 29: 308-315, read from the abstract); the ages chosen are later than those, PLACEHOLDER |
| a woman's brows as a broad dark bar low over the eye, as a man's | everyone wore MakeHuman's `eyebrow001`, and Apoleia paints the brow's colour on the skin under it (made for the faceted look, which has no hairs) | `brows` in the dress table: women wear `eyebrow011` (finer, tapering); `brow_paint` 0.25 for women, 0.6 for men; the brows a little higher and level (`rest`) |
| a woman's eyes as slits | the lids of round 50 were set on the man | `lids` per sex (women: only the fold, 0.3); the eyes a little larger (`rest`) |
| a woman of 28 under her veil reads as a child of ten | MakeHuman's woman has a round head with a short nose and chin; `jaw_women` and the jaw that closes the mouth shorten the chin further | women's weights in `rest`: chin and nose longer, the head more oval, the forehead lower |

Tried and dropped: the brows drawn 0.05 higher than MakeHuman lays them (they sink into the forehead, and what
reads as a bar is the shade of the socket, which stays); the mouth narrower and further back (a puckered mouth
with a dark gap); a chin longer still (0.7: pointed). The change at the panel's size is small: the women read as
women of their age, not as CK3's. Open: the full and the white beard as rows of shingles are now what stands out
most; children's eyes large and dark; men all wear one cut of hair.

**The full beard, and dark patches on every painted layer (round 53).** Held large beside CK3's, the full and the
white beard were rows of shingles (the ends of the cards in rows), lighter than the painted layer of short hairs
under them, with dark patches that had straight edges.

| what was wrong | cause | now |
|---|---|---|
| rows of shingles, a second colour | hair cards a few centimetres long cannot lie as a dense beard: each ends in a visible edge, and their image is lighter than the painted layer's | `beard_crop` has no cards: the painted layer alone, standing off the skin by 0.03 units on cheeks and jaw and 0.06 at the chin (the head is about two units tall), drawn taut from the jaw to the throat (`tools/portrait/pipeline/beards.py` style `crop`, `hairlib.py` `paint_cap(lift=)`). One surface, one colour, a soft edge |
| dark patches with straight upright edges on the beard, fainter on the hair's painted layer | the normal maps of all painted layers of 1356 were written with `nmap.py ... 8`. The third argument is for images of cards (eight strands side by side, each given a round profile): on a painted layer it tilts the normals in eight upright bands (mean red per column 88 to 174 of 255; now within 2) | `bob01` to `bob05_cap_n`, `plait01_cap_n` and the beard's written without it. Apoleia's own files were right |
| a dark triangle with straight sides under the mouth | the shadow map's edge of the chin's shadow: soft enough on skin, a hard line on a layer that stands off it | the painted layer takes no shadows (`cap.shadow` in the profile, `stage.ts`); it is shaded by its own normals |

How the cause was found: shadows off, drawing order (a depth pass for the layer), the walls of the mouth's hollow
and the vertex data were each ruled out before the image was looked at column by column. The test page's new
`?without=_cap.` leaves out every surface whose image name contains the text, which shows a layer alone or a
head without it. Tried and dropped: see `tools/portrait/pipeline/README.md`.
Still open: the beard reaches far down the throat (Apoleia's zone of the beard) and its outline is one shape for
every man; children's eyes large and dark; men all wear one cut of hair; flat light on flat skin.

**Judged on England's own people, measured per band of lightness (round 54).** Ramon on round 53: "zombie mode,
not at CK3's level". Two things had hidden what he saw. The rounds were judged on Apoleia's twelve test people in
England's dress, who are not the people the game has: `tests/portrait/sample_england.json` now holds 28 founders (36 since round 56)
of the pool England draws from (women and men of 8 to 68, four of each; written by
`cargo run --release --example sample -- England Gallia 28` in `portrait/`), and the test page draws them with
`?sample=england`. And the skin had been set by one median of the lit face. Per band of lightness (CIELAB, men of
30 beside the ruler in the screenshot):

| L | CK3 a | CK3 b | ours before a | b | ours now a | b |
|---|---|---|---|---|---|---|
| 20 to 30 | 16 | 15 | 10 | 10 | 14 | 12 |
| 30 to 40 | 16 | 19 | 15 | 18 | 20 | 22 |
| 40 to 50 | 17 | 21 | 16 | 22 | 21 | 26 |
| 50 to 60 | 18 | 25 | 15 | 23 | 20 | 27 |
| 60 to 70 | 19 | 27 | 13 | 23 | 17 | 27 |
| 70 to 80 | 18 | 27 | 11 | 21 | 13 | 23 |

CK3's skin keeps its red from the darkest shade to the lightest; ours lost it at both ends: grey shadows and pale
lights, which is what dead skin looks like. Now `skin.colour` 1.1 and `skin.tint` [1, 0.72, 0.82]
(`src/portrait/profile.ts`). The lightest band is still paler than there. One screenshot, one ruler: PLACEHOLDER.
The test page's `?set=exposure:0.5,skin.colour:1.1,skin.tint.1:0.75,sky.top:ffe9d6` sets values of the profile by
their path, so that a round of trials needs no build.

| what was wrong | cause | now |
|---|---|---|
| dark bars between the lips of every full beard, light dots beside them (they read as teeth) | the beard's zone leaves the mouth free by an ellipse round it, tested at the point where a ray from the head's centre hits the head. Rays through the gap between the lips hit the mouth's hollow behind them, outside the ellipse, and hairs were rooted there | for `crop` the ellipse is tested by the ray's direction (where it crosses the plane z = 1.5), not by where it hits (`beards.py`) |
| the full beard reached down to the collar | Apoleia's zone of the beard, whose neckline lies low on the throat | `crop` ends under the jaw (`CROP_NECK`, in this round `6.2,0.3,0.95,0.4`, see round 55: height at the chin, how much higher towards the ear, from where and over what depth) |
| every woman frowned | MakeHuman's `eyebrow011` (women's since round 52) sits slanted on these heads, the inner end low over the eye; so do `eyebrow005` and `eyebrow002` | everyone wears `eyebrow001`, which sits level; how heavy it reads is the profile's `brow.brows`. `eyebrow011` is removed |
| mouths a little open, or pouting | `mouth_shut` was two fixed weights on `mouth-upperlip-ext-down` and `mouth-lowerlip-ext-up`, which do not move the middle of the lips at all (vertices 474 and 493), and the weights that made up for it (lip volumes, heights) gave the pout. MakeHuman's young heads stand open by 0.005 to 0.025 units, and genes, age and moods move the lips too | the mouth is closed by exactly its measured gap, and opened by as much as the lips lie in each other (`morph.rs` `lip_gap`; `mouth_shut`, `mouth_part` in the dress table name the targets and their shares). Test: 864 faces of England (2 sexes, 9 ages, 12 sets of genes, 4 moods) have their lips within 0.002 units; the mouth hacks of rounds 50 and 51 are gone from `rest` |
| red patches on the cheeks down to the jaw, a darker band over the eyes | Apoleia paints both on the skin for its faceted look (cheeks 0.2 / 0.1, sockets 0.2 / 0.1); the real look has its red from `flush` and the shade from its light | `cheeks`, `sockets` in the dress table, 0 for 1356 |
| children as dolls: bulging forehead, huge dark eyes | Apoleia lays its own child's face (`KID`, a block of targets, an iris 23 % larger) over MakeHuman's child, which is a child already | `kid` in the dress table, 0 for 1356; `child` holds targets of a child's face per sex (lids lower over the large eyes) |

Tried and dropped: the colour of the key light warmer (`ffdcc4`: a 21 to 24, too red in the middle bands);
`brow_paint` and `sockets` alone against the frown (what stays is the shade under the brow ridge, which is right);
`FACE_GAIN` 1.0 in place of 1.6 (hardly visible: `FACE_SOFT` squashes the genes; left as Apoleia has it); for
girls the mouth further back and less deep (a sunken, old mouth), its corners up by 1.0 (a smirk), narrower and
lower (pursed).
Still open: children of 8 keep a pouting mouth that stands forward and large eyes (MakeHuman's child); the plaits'
hairline lies high, so that girls have a bare forehead; women's lower faces are wide and the women look alike;
stubble reads as a grey-green patch with a hard edge (round 55); the bald head's ring of hair as a dark flap; every
man wears one cut of hair; flat light; the eye has no cornea.

**Stubble as dead skin (round 55).** On England's sample a man with stubble had a grey-green lower face with a
hard edge, a grey-haired one a pale dust over it.

| what was wrong | cause | now |
|---|---|---|
| the lower face olive under stubble and under every short beard | the tint of round 48 grew with the lightness of each point of the skin. What is painted darker on light skin (Apoleia's shadow of the beard, folds) took less of the red and turned olive, where in living skin the darker places are the redder ones | the tint goes by the person's skin as a whole: the median of the skin's colours, one value over the head (`materials.ts` `skinTone`, `skinLook`). England's sample has 0.44 to 0.63 and takes all of the tint; the lit skin measures as in round 54 |
| stubble as a pale dust on a grey-haired man | the painted layers are drawn lighter (`cap.tone`, `cap.light`, round 44: under cards the layer turned a brown beard black); stubble has no cards and lies on skin | `cap.stubble` in the profile: how much of that lightening stubble takes, 0 for 1356 |
| a hole in the full beard at the tip of the chin, skin showing | the neckline of round 54 lay at 6.2 in front, and the chin's underside lies at 6.155 to 6.2 | `CROP_NECK` default `6.1,0.3,1.0,0.4`; the beard ends under the chin a little behind its tip |

Still open: the shadow of the beard on the skin ends at the edges of triangles (a hard line on the cheek); the
bald head's ring of hair shows the root ends of its broad cards as blocks and hangs as a flap beside the face;
and what round 54 lists.

**Children (round 56).** The sample of round 54 began at eight. Children of two and five, looked at by chance,
were old men with shaven heads; a girl of eleven of the test people had the mouth of a duck.

| what was wrong | cause | now |
|---|---|---|
| small children with half the head a bare forehead | under seven everyone wore Apoleia's `crop01`, cropped short, which begins far back on a child's large skull | `hair_small` in the dress table: the hair of 1356 with its fringe (`bob01`), girls and boys alike (PLACEHOLDER, nothing read) |
| a child of two with an old man's face | MakeHuman's brows are an adult's, dense and dark | `brows_child` 0.6: a child's brows mixed towards the colour of its skin, fading as it grows up |
| a pout, strongest at eleven | the gene `lips` (thin to full) correlates -0.91 with how far the lips stand apart before the mouth is closed: Apoleia draws its genes large (`FACE_GAIN` 1.6, made for the faceted look at the size of a coin), full lips lie in each other by up to 0.012 units and stand forward, and MakeHuman's child has a narrow mouth with full lips already. The child's own targets faded with `Look::grown`, which is at four fifths when a girl is eleven and her head still all child | `genes` in the dress table: how strongly single genes of the face show in the real look (`lips` 0.4; every other as it was). `child` holds a wider mouth with thinner lips and follows the head: in full while the head is MakeHuman's child (to eleven), none where it has its adult form (`dress.rs` `child_share`) |

The sample has 36 people now: after the 28 come eight children of two and five (`examples/sample.rs`).
How the cause of the pout was found: three changes to the child's targets left the picture as it was, which showed
that the weight lay elsewhere; the solver that closes the mouth then printed gap and weight for 864 faces.
Still open: small children look past the viewer and some frown; girls and boys under seven look the same; what
rounds 54 and 55 list.

**Girls' hairline (round 57).** Girls with plaits had a square, bare forehead: the hairline of the plaits is that
of Apoleia's crown braid, with a corner above each temple, as on a man whose hair goes back there. It lies 7
degrees lower at the temples now and runs as one arc from the parting to the ears (`styles.py` `PLAIT_TEMPLE`;
`plait01*` written anew). Still open there: the parting shows as a dark stripe, darkest on blond hair (between the
cards' faded roots the painted layer shows, which is darker than the cards; a parting shows scalp, which is
lighter).

**The bald head's ring of hair (round 58).** `bob04` stood off the skull as far as the full hair does (a dark
flap beside the face) and showed the root ends of its broad strands as blocks. Written anew lying close to the
skull, from more and narrower strands (`BOB_LIFT=0.025,0.03 BOB_K=640 BOB_W=0.2,0.3`). Still open: from the side
its upper edge is a row of steps (the root ends of the strands), and it is the full hair's length.

**Men's hair in three lengths (round 59).** Every man of England wore `bob01`: one head for a whole town. The
dress table's `hair_lengths` names other lengths of the same cut with their shares in ten, picked by the person's
seed (`dress.rs` `hair_of`): `bob06` to above the ear (3 in 10), `bob07` to the jaw (2 in 10), the rest `bob01`.
Lengths and shares are PLACEHOLDER, by eye. Under the hood on the head, on heads with curls and on heads that
lose their hair nothing changes; nor for small children.

**Mouths that read as open, eyes that look out of their corners (round 60).** Three things that made the faces
of England's sample read as absent, all found on the sample at the panel's size and then large:

| what was wrong | cause | now |
|---|---|---|
| women's mouths read as slightly open, a dark line over a bright lower lip (the mouth is closed since round 54) | the key light stood 37 degrees above the head. The upper lip faces down and lay in shade, and so did the eyes in their sockets | the key light 24 degrees above the head (`lights.key.from` y 4.5 to 2.6) and a little weaker (energy 1.9 to 1.8), so that the share of the lightest band of skin stays about where it was (L 70 to 80 on the measured woman: 10 in 100 before, 22 with the lower light alone, 16 now). The colours per band are unchanged (the table of round 54 holds) |
| a glance out of the corner of the eye, small children nearly wall-eyed | `gaze` (-0.2) turned the eyes back by 0.2 of the 0.24 the head is turned: the irises stood in the corners of the eyes, the near eye's against the outer corner | `gaze` -0.1 (the head's turn is -0.24): the eyes come back less than half way, the irises stand in the middle of the eyes. Each eye is turned 0.03 towards the nose on top of that (`converge`, new in the dress table; `dress.rs` `gaze_of`): the lines of sight meet about a metre in front of the face instead of standing parallel, as eyes do that look at somebody |
| a dark grey sickle beside each iris, on the side away from the key light | the eyeball was lit as a hard ball: its half away from the light dark. The white of an eye lets light through | `eye.wrap` 0.5 in the profile: light reaches round the ball as it does round skin (`materials.ts` `eyeLook`) |

Tried and dropped: more light from below instead of a lower key light (`sky.ground` lighter, `sky.energy` 0.4,
`lights.fill.energy` 0.45: the upper lip hardly changes); the key light at 28 degrees (y 3.2: the lip still dark)
and at 20 (y 2.2: the face flatter); `gaze` 0 (straight ahead of the head: calm, but past the viewer), -0.3 (more
of the corner glance); `converge` 0.06 (no gain over 0.03 at the panel's size); `eye.wrap` 1 (the ball a flat
white); denser lashes (`brow.lashes` 0.6, 0.7: the lower lashes show as spikes). All values PLACEHOLDER, by eye;
the test page's `?set=` and four builds served the trials. Picture: `runde60_england_vorher_nachher.png` (rows in
pairs, round 59 above round 60: women, men, small children).
Still open: the hood's hem is a black cord round the face and across the chest; every mouth is the same calm
line; what the rounds before list.

**The black cord round hood, veil and neckline (round 61).** Every garment's edge was drawn as a black cord: round
the face under a hood, round a veil, as a ring round the neck. It is the hem, a thin tube along the edge
(`tunic_bind.py`), and it was black for two reasons. Its fold shade: the shade in the folds measures how far a
point lies below the cloth smoothed over a few centimetres, and against that the tube is a valley all along (0.5
to 0.7 of the cloth's colour). And, the larger part, its own shadow: the tube was wound inward, so the builder's
normals pointed into it; the stage looks up a shadow from a point a little off the surface along the normal
(three.js' `normalBias`), which here lay inside the tube, behind its own wall. How it was found: the shade set to 1
left the hem black; set to 4 it was light grey, so the hem was the cord; without shadows on cloth it was as dark as
cloth in shade; a shadow map of four times the size changed nothing, so it was not the map's coarseness. Now the
tube is wound outward and has no shade of its own (`HEM_AO`), and gown, both hoods, veil and wimple are written
anew: number for number the same files but for the order of the corners of the hems' triangles and the hems' shade.
A test holds the hems of England's sample to it (`tests/portrait.test.ts`; it fails on the files as they were).
Picture: `runde61_saum_vorher_nachher.png`.
Still open: the hem still reads as a cord of the cloth's colour where the hood's front edges hang free beside the
neck (a hood of the time closes under the chin); the moustache of the full beard hangs over the mouth, its tips on
the lower lip read as teeth at the panel's size.

**Hairs of the beard over the mouth that read as teeth (round 62).** Men with a short beard showed a row of dark
bars on the lower lip, at the panel's size a row of teeth in a slightly open mouth. The short beard was Apoleia's
(`beard_short`): its hairs are rooted in the gap between the lips too (a ray from the head's centre through the gap
hits the mouth's hollow, which the test by depth takes for skin of the upper lip), and the hairs of the upper lip run
on over the line of the mouth. On Apoleia's mouths they lie in the gap; on a mouth closed by raising the lower lip
(round 54) they lie on that lip. First the full beard was taken for the cause, because its moustache did run on over
the mouth line as well, less visibly; it is written anew too.

| what | now |
|---|---|
| short beard | `beard_short` in the dress table: England wears `beard_short1356`, the same beard written with the mouth left free by the direction of the ray and the moustache ending over the mouth (`beards.py` `LIPS=1`). Apoleia's file is untouched and still worn by everyone else |
| full beard `beard_crop` | the hairs of the upper lip end at an arch over the mouth (`MOUTH_CUT`; `hairlib.py` `paint_cap(cut=)`: how much of a hair is drawn along its way); the layer's mesh is the same number for number |

A trap on the way: `git stash` during the test of round 61 left the development server without the gown's files
(it answered with the page instead), and the builder fell back to Apoleia's faceted tunic without a word; the
pictures of that quarter of an hour were thrown away. In the built site the files are copied, the fallback stays
silent there too if a file is missing (open).
Picture: `runde62_bart_vorher_nachher.png` (short beard before and after, full beard before and after).
Still open: stubble is Apoleia's file too (its hairs are too short to show on the lip, not checked large on every
mouth; they do show, round 67); one outline for all beards.

**The hood closed under the chin, and hems that are part of the cloth (round 63).** The hood worn on the head was
open in front down to the chest, and its front edges hung beside the neck as cords. Three causes, found one after the
other:

| what | cause | now |
|---|---|---|
| no cloth under the chin | the hood's cloth is laid on rays from the head's centre; in front and downwards such a ray ends in the mouth's cavity, so the rows under the chin lay inside the head and the front was cut open instead (`UCUT`) | where the face's oval has cut the last row of rays, that row is laid on the skin the ray leaves the head through, under the jaw (`drape_sim.py` `CHIN=-60`: the ray's angle in the middle); the rings below hang from the jaw (`TH0=-36`), and the hood lies closer round the neck (`THROAT=0.7,6.9,300,0.9`) |
| a pointed lappet at each corner of the jaw | the hem's line is smoothed after the draping, the cloth's own edge moves with it, the next row of the cloth did not: where the smoothing takes a corner off, that row stood out beyond the hem | below the cheeks the cloth beside the edge goes with it, less from ring to ring, and stays off the skin (`tunic_bind.py` `HEMFOLLOW=4,6.9,0.1`) |
| the hem a finger's breadth above the cloth's edge, the throat showing between them; cords beside the cheeks | the hem's tube was a mesh of its own, each of its points bound to its own nearest triangle of the body. On another body than the one the garment was draped on the builder evens out a garment's shift along its own triangles (`calm` in `real_look.rs`): tube and cloth were evened out apart. Measured on the built portrait of a man with a full chin: tube at 7.10 to 7.17, the cloth's edge at 7.03 | the tube is welded to the cloth: the corner of its ring that faces the cloth is the cloth's own edge vertex, and its other corners are bound with that vertex. For every hem of England: gown, hood on the head and thrown back, veil, wimple (all five written anew) |

The builder is untouched. Two new tests: a part of every hem's triangles has a corner on the cloth (none before),
and a hooded man's hem runs in front of his throat between the gown's neckline and the face (150 points or more of it
in the sample, none before).

Tried and dropped on the way: the old hood without the cut (a bib standing in front of chin and mouth: its rows
start in the mouth); the last row laid on the throat by rays from outside (the rim climbs over the sides of the chin:
kinks); the hood close to the neck with the rows under the jaw kept (`TH0=-49`: the cloth follows the underside of
the jaw inwards, the cheeks' cloth hangs over it as lappets); the cloth laid on the skin round the chin, and the rim
smoothed in the draping script (both sank the cloth beside the rim into the neck); the neck part left free in the
simulation (`PINY=6.55`: the rim sags as a loop to the collar bones, the throat bare); the rim at the chin's own
underside (`CHIN=-50`: a full chin shows through it); the cloth following the hem over seven rings (a ridge down the
cape).
Picture: `runde63_kapuze_vorher_nachher.png` (four hooded men, a boy, a veiled woman; before above, after below).
Still open: a small tuck in the cloth at each corner of the jaw and a crease down the cape below it (seen large,
not at the panel's size); the hood thrown back is still a wide flat collar without folds; the veil keeps the
smoothing of its hem without the cloth following; the wimple stands round the neck as a ring (round 64).

**The wimple under the chin (round 64).** The wimple of the older women stood round the neck as a ring with the
throat bare in its middle: it had the hood's fault (round 63), its rows under the chin lay in the mouth's cavity and
its front was cut open instead (`UCUT`). It is built as the hood now: the last row under the jaw (`CHIN=-60`), the
rings below hanging from the jaw (`TH0=-36`), the opening for the face a little wider (`FACE_W=38`: at 36 the rim
is ragged at the corners of the jaw, at 32 the jaw comes through the cloth), bound with `HEMFOLLOW=4,6.9,0.1`. Its
hem lies on the throat, no more than 3 cm in front of the skin (before: 5 to 7 cm in front, or inside the head). The
test of round 63 holds both garments to that now.
Picture: `runde64_wimpel_vorher_nachher.png` (two women as the panel shows them, from the front and from the side;
before on the left, after on the right).
Still open: the wimple's cape lies on the shoulders as a wide flat collar; seen from above the inside of its sides
shows beside the jaw.

**Eyes that lie in the face without an outline (round 65).** A face of the sample held at the same size beside
the one face in the screenshots of CK3 that is large enough to measure (the woman of the ruler designer, 110 pixels
wide). The spread of light over the whole face was the same as there already (lit third L 60 against 51 to 56,
shaded third 36 against 23 to 32: rounds 41 to 60). What differed lay in the eye:

| CIELAB L (in brackets: against the lit cheek) | CK3 | round 64 | round 65 |
|---|---|---|---|
| lit cheek | 53 | 63 | 63 |
| white of the eye, beside the iris | 65 (+11) | 40 (-23) | 57 (-6) |
| iris | 14 (-40) | 17 (-47) | 12 (-51) |
| the lid's edge over the white (its darkest row) | 19 (-35) | 29 (-34) | 18 (-45) |
| under the eye | 38 (-15) | 50 (-13) | 42 (-21) |

There the white of the eye is the lightest thing in the face, the iris nearly black, and a dark line of lashes
runs round the opening: an eye that is all contrast. Ours was a grey white beside a mid-grey iris with a thin
line round it, grey in grey; at the panel's size the eyes were two pale spots.

| What | Cause | Now |
|---|---|---|
| the white of the eye grey | the shade in the eye's corners began at a third of the way to the side and so lay over all the white that shows beside the iris; a tint and the lid's shade on top | `eye.white` 1.6 (the white alone, told from the iris by the image: light in every colour), the corners' shade from half way out (`eye.corner` 0.5 to 0.9) |
| the iris as light as the shaded white | the image's irises are light, and `eye.lift` lightens darks further | `eye.iris` 0.7 |
| no line of lashes | MakeHuman's lashes are long single hairs in clumps. Dense enough to darken the lid they stand off it as spikes, which is why the stage draws them at three tenths (`brow.lashes`) | the lid's edge itself is drawn towards the lashes' colour where they grow (`lash_line` in the dress table, 0.75 women, 0.65 men; `skin_lash.txt`, real_look.rs `real_skin`), never lighter than the skin (white lashes leave the lid as it is) |
| the brow on the upper lid | from the pupil to the brow 0.41 of the eye's width (there 0.6 to 0.75) | `rest`: brows up 1.0 for both (0.6, 0.25); MakeHuman's target moves them 2 mm at most, so they are still lower than there |
| men's eyes slits in a wide flat face | MakeHuman's man, and a well-fed sample | `rest`: men's eyes larger (0.5), cheekbones (0.4, 0.5) and a leaner head (0.2, 0.5) for both |

The test builds the 36 people of the sample and holds the skin within reach of the eyeball against the lid further
out (0.36 to 0.59 with the lash line, 0.73 to 0.83 without); a second one writes every material of the profile
into three.js' own shaders, so that a piece a new three.js no longer has is noticed there.
Picture: `runde65_augen_vorher_nachher.png` (ten grown people of the sample at the panel's size, before above,
after below).
Tried and dropped (tools/portrait/pipeline/README.md): MakeHuman's skin images at full contrast and 2048 pixels, a
shade file for the hollows of the face with longer rays, the lash line as a band on the lashes' cards.
Still open: one face in CK3 is a thin base for these numbers (the others are 30 to 60 pixels wide); the skin
round the eye is flat (no fold of the upper lid, no shade under the brow: the brow sits too low for either); the
iris's colour hardly shows at the panel's size; the eyes look past the viewer (round 60), which the lighter white
shows more.

**Lips that were a salmon band over a black slit (round 66).** Three mouths in the screenshots of CK3 are large
enough to measure (the woman of the ruler designer, 30 pixels wide; the emperor and his wife in the game's panel,
15 and 10), held against a woman and a man of the sample at twice the panel's size (940006, 940009). CIELAB,
in brackets against the lit cheek:

| | CK3 man | CK3 woman | our man, round 65 | our woman, round 65 | our man, round 66 | our woman, round 66 |
|---|---|---|---|---|---|---|
| lit cheek, L | 67 | 59 | 71 | 63 | 71 | 63 |
| lower lip, L | 46 (-21) | 39 (-21) | 47 (-25) | 40 (-23) | 44 (-28) | 41 (-22) |
| lower lip, a* and b* | 26, 22 | 27, 21 | 31, 24 | 43, 29 | 25, 21 | 28, 24 |
| lower lip, redder than the cheek by (a*) | 6 | 9 | 17 | 18 | 11 | 3 |
| upper lip, L | 37 (-30) | 23 (-36) | 28 (-44) | 21 (-42) | 32 (-39) | 27 (-36) |
| the line between the lips, L | 26 (-41) | 12 (-47) | 6 (-65) | 4 (-60) | 20 (-52) | 7 (-56) |

(The third mouth, the emperor's wife, stands in shade: lower lip 3 darker than her cheek and 8 redder, upper lip
11, the line 17 darker.) There a lip is skin's own colour taken down by a fifth of the scale and turned a little
towards red, the same a* and b* on a fair man and a tanned woman; the upper lip is a lip, a third darker; the line
between them is dark red. Ours was as dark as that but twice as red, the same red mixed into every skin, as a
broad band without an outline; the upper lip a dark bar, the line black.

| What | Cause | Now |
|---|---|---|
| a band, not lips | the builder's lips are every facet that MakeHuman's targets for full lips move, softened over the neighbours | the red of the lips per vertex, read from MakeHuman's own skin image where its paint is redder than skin (`skin_lip.txt`, `tools/portrait/pipeline/skin_lip.py`): the head's mesh has its edges along the lips' outline |
| salmon on everyone | one red (`#9a3238`, `#8a3a36`) mixed into the skin at 0.55 and 0.45 | `Lips` in the dress table: a quarter of the skin's own colour kept, the blood's colour added (`skin` 0.25, `blood` 0.2, 0.095, 0.07 in linear light); fairer skin, fairer lips |
| the upper lip a dark bar | it faces down, away from the key light, and the stage has no light thrown back up by the lower lip and the chest (twice the light from the ground lifts it by 1.5 to 2 L) | its colour times 1.5 (`upper`) |
| the line black | MakeHuman's closed mouth is a slit: between the edges where the lips turn inward lies a millimetre, the lower edge 1 to 6 mm behind the upper, and no target closes it beside the middle (seen in sections through a built head, its positions written out by the builder for the purpose). One looked into the mouth | a strip of 34 triangles from edge to edge closes it (morph.rs `LIP_SEAM`, real_look.rs `real_skin`), in the lips' colour times 1.6 (`seam`), as the upper lip's edge is: it lies in the lips' own shade, where the stage has no light that comes through flesh |

The tests: the crate holds the two edges of the seam to MakeHuman's head (from the middle of the mouth outward
to its corners, the upper over the lower, mirrored); tests/portrait.test.ts builds the 36 people of the sample
and holds the strip to the lips (every corner of it a corner of the skin, from one corner of the mouth to the
other), to a flesh colour, and to the skin it goes with (0.85 between the skin's and the strip's tone over the
sample). It fails without the strip.
Pictures: `runde66_mund_vorher_nachher.png` (ten grown people of the sample at the panel's size, before above,
after below), `runde66_mund_nah_vorher_nachher.png` (six mouths at twice that size).
Tried and dropped: the lips' colour as factors on the skin's colour alone (a fair man's lips came out grey, a
tanned woman's too red: the reference has the same lip on both); no shade of the mouth's inside on the lips (no
difference: what was black was not the lips); the strip at half the lips' colour, and at 1.6 times with the lips'
edges left as they were (as black as the slit: 2 to 8 L); the strip's share of the colour on the lower lip's edge
as well (a pale rim along the lower lip, which lies in the light).
Still open: these numbers rest on two people of ours and three mouths of 10 to 30 pixels; the man's upper lip is
9 L darker than there and the woman's line 5 to 19 L; the strip is lighter than the skin and dark only because it
stands in shade (a light from below, or a mouth that opens, would show it pale); lips are smooth, without their
creases and without a highlight on the lower lip; the upper lip is thin, with hardly a bow; the lower lip stands
4 to 6 mm behind the upper; one line for every mouth.

**Stubble that lay on the lower lip (round 67).** Seen large, a man with stubble had a row of dark dashes along
the line of his mouth, on the lower lip. They are hairs of Apoleia's stubble: as its short beard (round 62), it
roots hairs in the gap between the lips, and a mouth closed by raising the lower lip carries them on that lip.
England wears stubble of its own (`beard_stubble` in the dress table: `beard_stubble1356`, written with
`beards.py` `LIPS=1`, which leaves the mouth free by the direction of the ray from the head's centre). Before
the change the documented call was run again and gave Apoleia's layer number for number (`beard_stubble_cap.txt`
identical, the image's alpha identical at the installed size); the new layer has the same triangles, its image
has no hairs in the gap and a few more beside the lower lip, where the mouth's zone had been cut by the point a
ray hits. Apoleia's file is untouched and still worn by everyone else. Test: England's sample wears
`beard_stubble1356` and no `beard_stubble`, a Roman the other way round (`tests/portrait.test.ts`); it holds the
name only, not what is painted. Picture: `runde67_stoppeln_vorher_nachher.png`.

**A doll's eyes (round 68).** Held beside the reference at the panel's size, the sample still looked out of
round, wide, bright eyes. One eye of the woman in the screenshots (27 pixels long) and one of ours, scaled to
the same length, side by side; ours also from the front, where lengths can be read:

| | CK3 | a real eye | ours before | ours now |
|---|---|---|---|---|
| iris across | | 11.71 mm (SD 0.42) | 14 to 17 mm | 11.7 mm |
| iris across, of the opening's length | 0.44 | 0.46 | 0.60 (woman), 0.58 (man) | 0.46, 0.48 |
| opening's height, of its length | about 0.26 | 0.34 | 0.35 | 0.30 |
| white beside the iris, against the cheek | L -0.5, a 6, b 18 | | L +3 to +8, a 2, b 10 | L -2, a 3, b 15 |
| white in the corner of the eye, against the cheek | dark | | L -9 | L -22 |
| dark band of lashes over the eye, of 27 pixels | about 3 | | about 1.5 | about 2.5 |

The real eye: white-to-white corneal diameter of 390 people of 10 to 80 (Rüfer, Schröder & Erb 2005, Cornea 24:
259-261, from the abstract); opening between the lids 25.6 mm long (SD 2.0) and 8.7 mm high (SD 1.3) in 380
adults in Adelaide (Rana et al. 2023, International Ophthalmology 43: 2695-2701).

| What was wrong | Cause | Now |
|---|---|---|
| irises half as large again as real ones | MakeHuman's eyeball is 30 mm across (a real one 24), the ball's image has the iris at 27.5 degrees of the ball (right for a real ball), and `rest` scales the eyes up on top of that (rounds 52, 65) | `iris_mm` in the dress table: 11.7. The builder lays the image round the gaze so that the iris has that size on the ball as built (`build.rs`), on every head: a child's small head has the larger iris in its opening that children have |
| eyes wide open round them | with an iris of real size the old lids showed white under it (a stare) | `lids`: the three heights at 0.15, 0.4, 0.15 (women) and 0.1, 0.35, 0.1 (men), the gaze 0.04 downwards (MakeHuman's opening lies lower than the ball's middle): the upper lid lies over the top of the iris, the lower at its edge |
| a cold, light white from corner to corner | one tint, a shade that began far out | stage profile: `eye.tint` warm, `eye.white` 1.85 (what the tint takes), the corners' shade from 0.3 to 0.8 of the ball's side down to 0.35, the upper lid's down to 0.5 |
| a thin line of lashes | `skin_lash.txt` held the line within 2.5 to 5 mm of the eyeball | written with `LINE=0.035,0.11` (now the script's default), `lash_line` 0.85 and 0.75 |
| children with narrowed, lined eyes (after the above) | the adults' lids and lash line on a child | `eyes_child`: 0.6 of the lids' heights and half the lash line on a head that is MakeHuman's child, fading as the head grows (`eyes_of`); the lids' entry in `child` is gone |

Tests: the iris of all 36 people of the sample, measured on the built head, is within one standard deviation of
the real mean, and the same head as a Roman has one of more than 13.5 mm (`tests/portrait.test.ts`; fails with
`iris_mm` 0); a child's share of lids and lash line by the head's age (`portrait/src/dress.rs`).
Pictures: `runde68_augen_vorher_nachher.png` (seven grown people and seven children at the panel's size, before
above after), `runde68_auge_nah_ck3_vorher_nachher.png` (the eye of CK3's woman, ours before, ours now, at the
same length).
Tried and dropped: the iris as a factor on the image's (0.75: right on the grown, too small on small children,
whose balls are smaller, and too large on people with the gene for large eyes); the lids at 0.3, 0.7, 0.3 (the
opening 0.27 as high as long, as the reference's: the women looked tired, and it is further from a real eye
than from the reference); the lash line in full on both lids (`LINE=0.04,0.085 LOWER=0.8`, `lash_line` 1: kohl
round the eye); the same iris, lids and lash line on children.
Still open: one eye of CK3 of 27 pixels and one woman of ours are a thin base; the opening is still higher than
the reference's and lower than a real one; seen large a hair's breadth of white shows under some irises; the
opening between the lids is about a tenth shorter than a real one for the head's size (the eyes look small in
a broad face); the white of the eye has no veins or wet rim, the iris no depth (no cornea), and the lashes
themselves are still thin single hairs; brows are flat bands.

**A woman's face larger than a man's (round 69).** At the panel's size the women of the sample read as men in
a veil: broad, long faces, a heavy brow low over the eye. Pictures do not say why (what a face measures in a
picture depends on camera and tilt), so the faces are now measured as with a caliper, on the morphed head, in
millimetres (`portrait/src/measure.rs`), and held against a survey of real heads: Zhuang & Bradtmiller 2005,
Head-and-face anthropometric survey of U.S. respirator users, Journal of Occupational and Environmental Hygiene
2(11): 567-576 (2543 men, 1454 women of 18 to 66; read from the copy at stacks.cdc.gov/view/cdc/190020).
200 grown women and 200 grown men of England, the face at rest, mean in mm (in brackets: how many of the
survey's standard deviations from its mean):

| | men before | men now | survey's men | women before | women now | survey's women |
|---|---|---|---|---|---|---|
| face length (sellion to menton) | 115.2 (-1.1) | 123.0 (0.0) | 122.7 | 114.5 (+0.2) | 113.6 (0.0) | 113.4 |
| sellion to subnasale | 50.8 (-0.3) | 52.7 (+0.2) | 52.0 | 49.1 (+0.2) | 49.1 (+0.2) | 48.2 |
| breadth at the cheekbones | 143.5 (0.0) | 143.5 (0.0) | 143.5 | 152.2 (+2.6) | 134.9 (0.0) | 135.1 |
| breadth at the jaw's corners | 117.1 (-0.3) | 121.2 (+0.1) | 120.4 | 110.0 (0.0) | 110.0 (0.0) | 110.1 |
| between the pupils | 61.7 (-0.8) | 64.4 (0.0) | 64.5 | 61.0 (-0.3) | 61.7 (-0.1) | 61.9 |
| nose breadth | 36.8 (0.0) | 37.2 (+0.2) | 36.6 | 36.8 (+0.9) | 33.5 (+0.1) | 33.2 |
| nose protrusion | 18.4 (-1.0) | 21.1 (0.0) | 21.1 | 19.9 (0.0) | 19.9 (0.0) | 19.8 |
| lip length (mouth's corners) | 46.6 (-1.1) | 49.5 (-0.4) | 51.1 | 43.8 (-1.0) | 46.4 (-0.4) | 48.0 |

A woman's face as a share of a man's, before, now, and in the survey: length 0.99, 0.92, 0.92; cheekbones 1.06,
0.94, 0.94; nose breadth 1.00, 0.90, 0.91; from the mouth's line to the chin (the survey has no such measure)
1.07, 0.97. Without a survey's number: the red of the lips 15.9 and 16.3 mm high, the opening of the eye
31.8 x 8.9 and 29.6 x 8.8 mm (a real one 25.6 x 8.7, round 68: MakeHuman's eye stays large).

| What was wrong | Cause | Now |
|---|---|---|
| women's faces broader than men's, 17 mm more across the cheekbones than a real woman's | `rest` gave women MakeHuman's oval head (0.3), and `jaw_women` shifted the gene of the head's form towards it as well: that head is 11 mm broader at each cheekbone, not softer at the jaw | no oval head in `rest`, `jaw_women` (-0.2) shifts the gene of the jaw only, the head a little narrower (`head-scale-horiz-decr` 0.1) |
| women's faces as long as men's, the chin longer | `chin-height-incr` 0.35 for women (round 56, by eye), none for men | 0.3 and 0.15; the men's head longer (`head-scale-vert-incr` 0.2) |
| men's faces short, eyes close together, flat noses, small mouths | MakeHuman's base head (face length 117 mm) with the leaner head of round 65 | `head-square` 0.3 (the jaw's corners), `eye-trans-out` 0.3 (women 0.2), `nose-scale-depth-incr` 0.55, `mouth-scale-horiz-incr` 0.3 (women 0.4) |
| a woman's nose as broad as a man's | one nose for both | `nose-scale-horiz-decr` 0.4 for women |
| hard cheeks on women | cheekbones 0.4 and a leaner head (round 65) on a face that was too broad already | cheekbones 0.15, `head-fat-decr` 0 |
| a brow low and heavy over a woman's eye | MakeHuman draws one brow for both sexes, on the rim of the eye's socket | `brow_lift` and `brow_band` in the dress table, see below |

The brow. Its upper edge above the line through the eyes' inner corners, in mm, on 60 grown women (men: 60),
beside 36 real women of 20 to 30 (Matros, Garcia & Yaremchuk 2009, Plastic and Reconstructive Surgery 124:
1296-1301; the numbers read from the summary at dryaremchuk.com, the journal's volume and pages from memory;
that a man's lies lower and more level: Sclafani & Jung 2010, Archives of Facial Plastic Surgery 12(2), from the
abstract, without numbers):

| | at the eye's inner corner | over the pupil | at the eye's outer corner | the band over the pupil |
|---|---|---|---|---|
| real young women | 15.7 | 19.8 | 21.3 | |
| our women before | 18.0 | 16.9 | 16.9 | 12.0 to 16.9 |
| our women now | 19.7 | 19.6 | 19.5 | 15.7 to 19.6 |
| our men (unchanged) | 17.6 | 16.5 | 18.0 | |

`brow_lift` (mm along the skin near the brow's inner end, over the pupil, over the eye's outer corner: 3.0, 3.0,
3.5 for women, none for men) moves the hairs of the brow's cards up over the skin, `brow_band` (0.7 for women)
draws the band's hairs together (`build.rs`; where the three places lie on this head: `morph.rs` `eye_spans`).
Both grow in with the head's adult form: a child's brow is MakeHuman's. Over the pupil the women's brow is where
a real one is. Its inner end is higher and its outer end lower than measured, on purpose: lifted by the measured
numbers (the inner end down by 2 mm, the outer up by 4) MakeHuman's brow, heavy at its inner end, slants and
reads as a frown.

Tests (`portrait/tests/faces.rs`, a process of its own because the real look is global state): on 150 grown
women and 150 grown men every measure the survey has lies within half a standard deviation of the survey's
mean, and a woman's is smaller than a man's by the survey's share within 0.06 (fails with the values of round
68); a woman's brow is lifted by what the table says and narrower, a man's and a child's lie where MakeHuman
draws them. In `portrait/src/lib.rs`: the eye's corners lie at the ends of its opening; the lift between its
three places. To measure a sample: `cargo run --release --example face_measure -- England Gallia 400
../public/portrait --grown` in `portrait/` (`--target <name>` shows by how many mm one of MakeHuman's targets
moves the landmarks, which is how the weights above were found instead of by eye).
Pictures: `runde69_frauen_maenner_vorher_nachher.png` (eight women, eight men at the panel's size, before above
after), `runde69_frau_nah_ck3.png` (CK3's woman beside three of ours, close).
Tried and dropped: the brow lifted by the measured numbers, and rising outward without `eyebrows-angle-up`
(a frown, stern); the camera higher (`rise` 0.08 and 0.14: hardly a difference).
Still open: the survey is of people of the United States of today, used for how a woman's head stands to a
man's and the parts of a face to each other, not for the size of a head of 1356; the spread of the measures
comes from the genes as before and was not fitted (the jaw's is narrower than the survey's: SD 6.4 and 8.4
against 8.9 and 10.4); the lips are 1.6 mm shorter than the survey's on both sexes; no measure of depth but the
nose's (profile of forehead, jaw and chin unmeasured); beside CK3's woman ours still have the heavier jaw and
chin (hers is idealised, ours the mean of real women), brownish lips that are flat in the shade, a skin without
form, and the veil sits far back (a high bare forehead, the ears show); the brow keeps MakeHuman's shape (heavy
inner end, the outer part lower than measured); the outline of the far cheek on girls of 13 to 17 has a pouch;
how much darker eyes and lips are than the skin on a woman than on a man (Russell 2009, Perception 38:
1211-1219) is not measured; all weights but the means they are fitted to are PLACEHOLDER; CK3's framing of the
bust needs a posed body.

**A veil that was a bathing cap (round 70).** The gap named last in round 69: beside the reference's veiled
woman (the emperor's wife in the screenshots) ours read as bald. Her veil lies on the forehead, runs down the
cheeks in front of the ears and falls from there to the shoulders; one sees face and linen, nothing else. Ours,
seen from the front and from the side and without it:

| What was wrong | Cause | Now |
|---|---|---|
| the ears, the temples and a bare head behind them inside the veil's opening | the veil was a hood 2 cm and more off the head all round (room for Apoleia's bun): its rim stood 1.5 cm off the cheeks, and from the front one looked into it | round the face the cloth lies on the skin: `drape_sim.py` `FACE_ON` (7 mm at the rim above the cheekbones, its full distance seven edges of the grid further in), and the smoothed rim, which sinks into the forehead, is lifted back with the cloth beside it (`tunic_bind.py` `HEMFOLLOW` with a height above the head). Measured on the built heads of six women: the rim 0.7 to 1.1 cm off the cheek at the height of the eyes, the hem's own roll of 0.6 cm included |
| a cap that ended at the jaw in front, with a flap behind the shoulders | below the jaw the cloth was cut away for 100 degrees to either side of the front (round 29: the first try of a veil down to the shoulders clung to the neck and stood out as wings) | cut away for 52 degrees only (`UCUT=52:8`): it falls from the cheeks to the shoulders in front of them too, and hangs free from the cheekbones down |
| a head like an egg | the veil 1.8 cm off the skull, over a bun | 1 cm off (`OFF0=0.1`), with 1 cm more over the ears (`EARS`: at 1 cm they came through), and no hair under it: `hair_veiled` is empty for England, the builder then draws none (`real_look.rs` `mh_pick`, `build.rs`) |
| from the side a knot of hair came through the veil behind the crown | Apoleia's `bun01` under a veil that did not cover it | no hair under the veil |
| the wimple of the older women over the veil (seen once the veil lay on the skin) | the wimple stood 1.2 cm and more off the head, as a hood of its own | the wimple lies on the skin (`OFF0=0.03`, `FACE_ON=0.02,4`), its opening is wider than the veil's (`FACE_W=48`), its hem thinner and close (`R_HEM=0.02`, `HEMFOLLOW` 0.04): its sides are under the veil from the forehead to the jaw, it shows under the chin and round the throat |
| on a woman with large ears the wimple came through the veil at the ears (found by the new test, not in a picture) | linen is bound to the skin under it. The wimple, close on the ear, went out with an ear that is large or has grown with age (`ears/*-ear-scale-incr`), the veil further off did not | ears under a veil keep MakeHuman's form: `morph.rs` leaves out every target of the ears for a woman who wears the veil (`DressSet::veiled`); they are hidden there |

The rim over the forehead is where it was (3.7 to 4.8 cm above the nose's root on six women; on the first of
them 3.7 before and now, and its lowest point touched the forehead before, too): what read as a bare forehead up
to the hairline was the cloth standing up behind the rim and the bare temples beside it.

Tests (`portrait/tests/veil.rs`, with `portrait/tests/common/mod.rs` for what the tests of the real look share):
on six women of 30 the veil's rim is within 1.3 cm of the skin of the cheek at the height of the eyes and in
front of the ear (the veil of round 69: 1.5 cm, fails), the ear's outermost point is under the veil, more than
50 points of the veil hang in front below the chin, and no image of hair is worn; on six women of 60 no point
of the wimple above the jaw is further off the skin than the veil over it.
Pictures: `runde70_schleier_vorher_nachher.png` (eight veiled women at the panel's size, before above after),
`runde70_schleier_nah_ck3.png` (the reference's veiled woman, ours before, three of ours now),
`runde70_schleier_drei_ansichten.png` (a woman of 24 and two with a wimple: as the panel shows them, from the
front, from the side).
Tried and dropped: the rim 3 mm off the skin without the lift (a ragged edge without a hem: the rim is in the
forehead); the veil 1 cm off the skull without room for the ears; the wimple with its hem lifted 1 cm off the
skin as the hood's (a hook of hem outside the veil at the jaw); the wimple of round 64 under the new veil (its rim
inside the veil's opening and through the veil above it: three hems along the cheek).
Still open: the reference's veil lies lower on the forehead under a circlet and is of thinner cloth with folds,
ours is a smooth shell with one crease behind the jaw where its held part ends; the hem's line over the forehead
wavers by a millimetre or two seen large; from the side a sliver of the wimple shows at that crease on some
heads; seen from the side there is a dark gap between rim and temple; the veil is held on the head down to the
jaw and hangs only below (it does not swing or lie differently from person to person); where the rim sits and
how the veil is worn are by eye against one figure of the reference, of another century and rank (PLACEHOLDER;
a townswoman's or countrywoman's kerchief of 1356 is not sourced); men's ears under the hood are still morphed
(no second cloth there).

**Lips and skin of a woman's face (round 71).** Ramon on the state of round 70: "zombie mode, not CK3's level".
Held large beside the reference's one face that is large enough (the woman of the ruler designer), a woman of
ours had a brown flat band for a mouth, a face of one colour from forehead to chin, and skin as matt as chalk.
This round measured first, with a new instrument: `tools/portrait/face_colour.mjs` photographs the sample and
reads the colour (CIELAB) of forehead, cheeks, the nose's back, lips and chin at landmarks, which are places on
the skin's image and so the same on every head (`measure.rs` `marks`; `face_measure --marks` writes where they
lie on the image, the test page says where each lies in a picture, `?at=`). The reference's face was read at the
same places, set by hand. Means of the eight grown women of the sample:

| | round 70 | now | the reference's woman |
|---|---|---|---|
| lit cheek, L | 67.4 | 67.1 | 56.1 |
| lit cheek, a* / b* / hue | 16.7 / 25.5 / 57 degrees | 17.8 / 23.7 / 53 degrees | 22.9 / 25.4 / 48 degrees |
| the cheek redder than the forehead (a*) | -1.1 | 0.0 | +5.0 |
| shaded cheek, a* | 20.4 | 24.3 | 21.1 |
| the nose's back against the lit cheek (L) | -1.9 | -2.0 | +8.2 |
| the chin against the lit cheek (L) | -7.2 | -9.2 | -11.6 |
| lower lip, L (against the lit cheek) | 43.2 (-24.2) | 41.3 (-25.8) | 33.3 (-22.9) |
| lower lip, a* / b* / hue | 25.8 / 23.7 / 43 degrees | 27.5 / 20.7 / 37 degrees | 29.2 / 21.0 / 36 degrees |
| upper lip, L | 29.7 | 26.2 | 21.0 |

(The emperor of the screenshots, a smaller face: lit cheek L 65.5, a* 20.0, b* 27.1; lower lip L 39.6, a* 27.1,
b* 19.5, hue 36 degrees.)

| What was wrong | Cause | Now |
|---|---|---|
| lips brown-orange | the lips kept a quarter of the skin's colour and their blood had too much green in it (hue 43 degrees where the reference has 36) | `Lips::skin` 0.2 and a redder blood: 37 degrees. A child's lips have six tenths of that colour (`Lips::child`: at a woman's strength a girl of eight wore paint) |
| a flat band for a mouth, from the side an upper lip that stands out as a beak | MakeHuman's upper lip has no bow and its young woman's lower lip lies 3 mm further back than the base head's: on 24 women the upper lip's red stood 5.0 mm in front of the lower lip's in the mean, 6.7 mm at most | a cupid's bow, a lower lip with volume, the women's lower jaw 1.4 mm forward (`rest`: `mouth-cupidsbow-incr`, `mouth-lowerlip-volume-incr`, `mouth-upperlip-volume-incr`, `chin-prognathism-incr`): 3.0 mm in the mean, 4.6 mm at most |
| with the bow, a lower lip that ended in a point (a V) on every mouth whose lips had lain in each other | such lips were parted with `mouth-lowerlip-middle-up`, which for each millimetre it parts the lips draws the lower lip's foot down by four (MakeHuman's names say where the lip's red grows to, not where its edge goes) | parted by the targets that shut them, taken back (`mouth_part` with negative shares) |
| a face of one colour | Apoleia's flush map has the nose's tip reddest and on each cheek a patch of 2.4 cm radius at three quarters of that | a flush map of England's own (`real/skin_flush.txt`, `DressSet::flush_map`): the cheek's patch with a radius of 3.3 cm, lower and further to the front, at full weight; the nose's tip, wings and bridge at six, five and three tenths; women 0.7, men 0.5 (`flush` per sex: at the women's strength an old man's cheeks glowed) |
| skin matt as chalk | roughness 0.72, specular 0.35, and pores so strong that any sheen broke into a greasy sparkle | roughness 0.5, specular 0.5, pores 0.8 (stage profile), the picture a little darker by what the sheen adds (exposure 0.385) |

The red of the lips against real ones (heights as seen from the front; Ferrario, Sforza, Tartaglia, Sozzi & Carù
2003, Plastic and Reconstructive Surgery 111(7): 2149-2156, 89 men and 73 women, `measure.rs` `LIPS`), means of
150 grown women and 150 grown men: the women's upper lip 6.6 mm (round 70: 6.9; real 6.62), lower lip 8.5 (8.1;
9.09), both 15.1 (15.1; 15.49); the men's 6.3 (6.6; 6.84), 8.7 (8.3; 8.80), 15.0 (14.9; 15.39). The form of the
mouth did not cost the measures of the face (women's sellion to subnasale +0.4 SD, every other within 0.4).

Tests: `tests/faces.rs` `the_red_of_the_lips_of_england_is_as_high_as_on_real_lips` (each height within half a
standard deviation; held before the round too: it guards the form),
`the_upper_lip_of_a_woman_of_england_does_not_stand_out_as_a_beak` (24 women: under 3.5 mm in the mean, 5.2 mm
at most; round 70 fails with 5.0 and 6.7),
`the_cheeks_of_england_are_redder_than_the_forehead` (the builder's colour before any light: green beside red
on the cheek under 0.93 of the forehead's; 0.85 to 0.89 now, 0.97 with Apoleia's map); `src/lib.rs`
`parting_or_closing_the_lips_moves_their_edges_and_leaves_the_lower_lips_foot` (fails with
`mouth-lowerlip-middle-up`).
Pictures: `runde71_frauen_vorher_nachher.png` (four women large, before above after),
`runde71_profil_vorher_nachher.png` (the same from the side), `runde71_frau_nah_ck3.png` (the reference's woman,
two of ours before, the same two now), `runde71_stichprobe.png` (the whole sample at the panel's size).
Tried and dropped: more sheen with the old pores (roughness 0.45, specular 0.7, pores 1.5: a greasy sparkle);
three.js' Neutral tone mapping (orange, oversaturated) and AgX (pale) instead of ACES; `skin.colour` 1.2 (lit
skin no redder, shaded skin orange); the flush times 1.5 by age (old men glowing).
Still open, and measured: lit skin is as pale as before (the lit cheek's chroma 29.6, the reference's 34; ACES
tone mapping takes the colour out of what is lit, so the flush shows in half-shade: the shaded cheek is now
redder than the reference's, the lit cheek no redder than the forehead, where the reference has +5); the nose's
back is no lighter than the cheek (there +8); the upper lip still stands 3 mm in front of the lower, and on the
first woman of the sample the profile still shows an overbite; the lips are as matt as the skin (no wetness of
their own). Seen beside the reference: brows thin sharp lines (there thick and soft), the eyes pale in sockets
with little shade, skin still smooth; one woman of the sample strongly orange; a dark stroke on the forehead of
another under the veil's rim (there before this round; a scar, see round 72). One face of the reference is a thin
base for these numbers, and it is a ruler of another century with paint on her lips: form and colour of the
mouth, the flush and the sheen are PLACEHOLDER by eye and by that one face; only the lips' height is sourced.

**Scars, eyes and brows (round 72).** Three things seen when the faces of round 71 were held large beside the
reference's.

| What was wrong | Cause | Now |
|---|---|---|
| a dark brown strip with facets on a cheek, a dark stroke through a brow (two of the 36 people of the sample; in round 71 the stroke was noted as a gap without knowing what it was) | a scar. Apoleia's scar is a raised ribbon of its own, without the skin's image and in a colour mixed for skin without one: on a face of the real look, bark | a dress with a table asks for a line in the skin itself (`dress.rs` `ScarLine`, `build.rs`): a ribbon that takes the skin's image, normals and colours from where it lies, lighter and pinker along its middle, fading into the skin at both edges and both ends. It is a small surface of skin of its own, and takes the tone of the person's skin as a whole on the stage (`materials.ts` `portraitSkinTone`). Romans keep Apoleia's ribbon |
| eyes of glass: the key light's glint a dot on the white beside the iris | the eye is a plain ball. A real eye has a cornea, a cap of a smaller ball over the iris, on which the lights of a room are mirrored | over the iris the normal leans outward from the iris' middle, up to the rim (`eye.cornea` 0.36: a cornea of 7.8 mm radius on a ball of 12 mm leans 20 degrees further out at the rim of an iris of 11.7 mm; these radii from memory, not read). The glint lies on the iris; the eye a little rougher (0.14), so that the glint is larger and softer and shows at the game's size |
| brows as dark bars | measured, see below | the women's band 0.9 of MakeHuman's (`brow_band`, before 0.7), the brows drawn less densely (`brow.brows` 0.5, before 0.6) |

The brow measured: the lightness along a line from the upper lid over the pupil up to the forehead, on the side
of the lit cheek, in steps of the face's length (`face_colour.mjs --brow`), ours at the size of the reference's
face (88 pixels from sellion to menton; a soft picture reads broader and paler).

| | the reference's woman | our grown women, round 71 | now | our grown men, round 71 | now |
|---|---|---|---|---|---|
| the brow darker than the forehead (L) | 26.4 | 34.5 | 30.5 | 36.3 | 31.8 |
| the brow broad at half its darkness (lengths of the face) | 0.045 | 0.036 | 0.036 | 0.044 | 0.045 |
| the brow above the upper lid (lengths of the face) | 0.115 | 0.099 | 0.096 | 0.078 | 0.076 |

So the brows were darker than the reference's, not paler, and the women's narrower: the narrowing of round 69
(by eye) went the wrong way by this measure. The darkness is nearer now; the women's breadth is not (a broader
band drawn less densely is as broad at half its darkness as before): the reference's brow has soft edges and
tapers, ours is MakeHuman's band with a hard edge and a thin tail.
Also measured, and other than it looked: across the opening of the eye from corner to corner our eyes are not
lighter than the reference's (mean L against the lit cheek -33 where she has -29): what reads as staring is not
the white's lightness.

Tests: `tests/faces.rs` `a_scar_of_england_is_a_pale_line_in_the_skin` (a second surface in the skin's image,
on the skin, 0.9 to 1.4 of the lightness of the skin beside it; Apoleia's ribbon has no image and fails);
`tests/portrait.test.ts`: the eye's shader holds the cornea, and a scar's material takes the tone of the skin as
a whole (with its own it takes another tint). The Roman portraits of the real look are held by
`tests/portrait.test.ts` (golden), which is what noticed that the first form of the scar changed them too: it is
a value of the dress table since.
Pictures: `runde72_frauen_vorher_nachher.png` (four women large, before above after),
`runde72_narben_vorher_nachher.png`, `runde72_auge_nah_ck3.png` (the reference's eye, two of ours before and
now), `runde72_stichprobe.png`.
Still open: the brow's form (the reference's is arched, thick at its inner end and tapers to a point; ours a
band with a hard edge and a hook at its tail); the lashes are thin single hairs, seen large like a spider's legs,
where the reference has a dark fringe above and below the eye; the iris is a flat disc with a hard pupil (the
image's fibres and rim are too fine for the size it is drawn at); little shade in the socket beside the nose;
the eyes are rounder and wider open than the reference's. The scar's breadth and colour, the cornea's lean and
the brows' density are PLACEHOLDER by eye and by one face of the reference.

**The light (round 73).** Ramon on the state of round 72: still "Zombie-Modus", not the reference's level. The
rounds since 50 had looked for that in the face's parts (lids, gaze, lips, the eye's white, brows). Held beside
the reference's woman at her size and measured, the parts were not it:

| at the reference's size (a face of 88 pixels), round 72 | the reference's woman | our grown women | our grown men |
|---|---|---|---|
| across the eye's opening against the lit cheek, mean (L) | -31.2 | -30.8 | -35.4 |
| the brow against the lightest skin above it on the same line (L) | -37.9 | -38.8 | -38.1 |
| the lightest skin between lid and brow against the skin above the brow (L) | -17.9 | -26.4 | -15.0 |

The eye, the brow and the skin under it were as dark as hers or darker. What differed was the light on the
face as a whole (`face_colour.mjs`, places as in round 71; her shaded cheek read by hand at the same place):

| | the reference's woman | our grown women, round 72 | now | our grown men, round 72 | now |
|---|---|---|---|---|---|
| lit cheek L | 56.1 | 67.1 | 59.0 | 67.7 | 67.4 |
| lit cheek a* / b* | 22.9 / 25.4 | 17.8 / 23.7 | 22.5 / 27.2 | 17.3 / 24.3 | 15.9 / 22.4 |
| lit cheek chroma | 34.2 | 29.6 | 35.3 | 29.8 | 27.4 |
| the shaded cheek against the lit one (L) | -27.7 | -14.3 | -26.4 | -24.9 | -35.3 |
| shaded cheek a* | 20.4 | 24.3 | 22.4 | 22.2 | 18.5 |
| the lit cheek redder than the forehead (a*) | +5.0 | 0.0 | +2.2 | +1.9 | -3.5 |
| the nose's back against the lit cheek (L) | +2.6 | -2.0 | +1.3 | -6.5 | -6.7 |
| lower lip L | 33.3 | 41.3 | 33.1 | 42.6 | 34.4 |
| upper lip L | 21.0 | 26.2 | 17.0 | 29.9 | 22.7 |

(Her nose's back was given as +8.2 in round 71, read further up; +2.6 is the place the tool reads on ours. The
men's cheeks lie under stubble and beards, which the reference's woman has not: the men's columns say what
changed, not how near they are.)

Her face has a lit and a shaded half, shade under the brow, the nose and the lower lip, and lit skin of a full
colour. Ours was lit from the side the head is turned to, level (24 degrees up): the whole face in light, no
shaded half, no shade under anything, and the lit cheek so bright that the tone mapping washed its colour out.
Rounds 54 and 71 had tried to mend that paleness through the skin's own colour and written it down to the tone
mapping; round 60 had lowered the light because the upper lip in shade "read as a dark gap" and the eyes "lay
in dark sockets", both of which the reference has. Now (`src/portrait/profile.ts`):

| | round 72 | now |
|---|---|---|
| key light | from (-5.0, 2.6, 3.2): on the side the head is turned to, 43 degrees round from where the face looks, 24 degrees up | from (4.2, 3.6, 4.0): on the other side of the camera, 60 degrees round, 32 degrees up. The broad side of the face is lit, the far cheek and the far side of the nose lie in shade |
| rim light | from (3.5, 2.5, -4.0), energy 0.8 | from (-4.2, 2.5, -3.6), energy 1.0: behind the head on the shaded side, where it draws the far cheek's edge against the ground without lighting the cheek beside the nose (from (-5, 2.5, -2.5) at 1.1 it lay on the far cheek as a pale patch and turned the far eye's white blue) |
| fill light | from (3, -1, 5), energy 0.15 | from (-3, -1, 5), energy 0.12 |
| light from all round | energy 0.3, from below `#4d443c` | energy 0.2, from below `#8a6f5c` (what a tunic throws back: shade under brow, nose and chin stays warm) |
| exposure | 0.385 | 0.4 |

Tried and measured on the way (grown women; the first value the lit cheek's L, then the shaded cheek against
it, then the upper lip's L): the old side raised to 40 degrees, all else as in round 72, 62.9 / -6.2 / 19.6
(shade under the brow, but no shaded half); the new side at 37 degrees 58.1 / -21.4 / 13.5 (the upper lip a
dark bar); at 32 degrees 59.0 / -26.4 / 17.0. Seen from the front, from the side and turned the other way the faces hold
(`runde73_ansichten.png`).

Other than assumed, and left as it is: the skin between a woman's lid and brow is now 46 L darker than the
skin above the brow (the reference's 18, our men's 21). It is shade under the brow, not paint: without the
lash line only the first two millimetres above the lid's edge get lighter, without the baked shade
(`SKIN_AO`) nothing changes, with the women's heads held 7 degrees further back 4 L (and their nostrils show).
The men's lit cheek is as light as before and paler (chroma 27.4; the reference's emperor, a small face, L
65.5 and chroma 33.7): males' cheeks take the new light more fully than females' (boys 64.0 / 31.4, girls
60.3 / 35.8), and at that lightness the tone mapping takes the colour.

A correction to round 72: the brow was read there against the forehead on the face's middle line. On the
reference that place lies 10 L darker than the forehead above the brow (her light comes from the side), so her
brow read 26.4 where against the skin above it on the same line it is 37.9. Ours after round 72 read 30.5
against the middle of the forehead ("still darker than hers") and 38.8 against the skin above the brow (the
men's 38.1): at her level. `face_colour.mjs --brow` now prints both, the lid's rim as well, and with `--line`
the line itself. In the new light a woman's brow lies in the shade of the socket (48.1 against the skin above
it, the men's 37.7): to be looked at with the brow's form.

Tests: `tests/portrait.test.ts` "England's stage lights a face from above and from the side it is turned away
from" (the key on the other side of the camera, 45 to 75 degrees round and 30 to 45 degrees up; the rim behind
the head on the shaded side and not on the cheek beside the nose; fill and sky under 0.15 of the key; Apoleia's
stage as it was). The Roman portraits and the comparison with Godot are untouched (Apoleia's profile).
Pictures: `runde73_licht_vorher_nachher.png` (eight people, before above after), `runde73_neben_ck3.png` (the
reference's woman and three of ours at her size, before above after), `runde73_ansichten.png` (front, side,
turned the other way), `runde73_stichprobe.png`.
Still open: the women's dark sockets and the men's pale lit cheek (above); the upper lip is darker than the
reference's (17 against 21); a face in a hood worn up lies half in the hood's shade, and a man whose eyes are
wide open by his genes (the opening 10 mm high) still stares out of it; the white of the men's far eye is
lighter against the shaded cheek than the reference's; and what round 72 left: the brow's form and soft edge,
lashes as a dark fringe, the iris' depth. All values PLACEHOLDER: one face of the reference, by measure and by
eye.

**A woman's eyes, her head and her lids (round 74).** Round 73 left the skin between a woman's lid and brow 46 L
darker than the skin over the brow (the reference 18, our men 21), and had ruled out paint, the lash line and
the baked shade. Under a light without direction that skin is as light as the skin over the brow (-1 for women,
0 for men): the band was shade, and shade comes from form and posture. Three causes, each measured on the
morphed heads (`examples/face_measure.rs --dump`, `src/measure.rs`):

1. *The eye lay too deep.* MakeHuman's female form sets the eye deeper in the head than its male one.

   | grown, mm (60 of each) | women before | women now | men | women minus men, now | real heads |
   |---|---|---|---|---|---|
   | the ball's front before the skin 6 mm beside the outer corner | 10.4 | 12.4 | 13.4 | -1.0 | -1.1 |
   | the ball's front before the skin 8 mm under the lower lid | 1.1 | 3.3 | 3.8 | -0.4 | +0.8 |
   | the brow's ridge in front of the ball | 10.3 | 8.2 | 8.0 | +0.2 | +1.0 |

   Real heads: Hertel's exophthalmometer reads the cornea 16.5 mm in front of the bone's rim beside the eye in
   white men and 15.4 mm in white women (eyewiki.org, Exophthalmometry, after Erb et al. 2003 and Migliori &
   Gladstone 1984); in computed tomography the cornea lies 5.3 (men) and 6.3 mm (women) behind the rim over the
   eye and 11.6 and 12.4 mm in front of the rim under it (Shin, Lee, Koh & Song 2017, Anatomy & Cell Biology 50:
   41-47, 141 people of Korea; read from a summary of the table, which column is which sex inferred). About a
   millimetre between the sexes; ours had 2 to 5. The skin 3 to 9 mm over a woman's lid leaned 38 to 40 degrees
   from upright, a man's 20 to 28: it faced the ground. A grown woman's eyes are now brought forward by 2 mm
   (`DressSet::eye_out`, the least-squares fit to the three differences; 2.5 would give exactly the men's
   profile), the ball as it is, the lids and the skin on the ball in full, less and less towards the bone's rim
   (`morph.rs` `eyes_out`, `EYE_FIELD`). The skin over the lid now leans 23 to 30 degrees. Girls stand as boys
   up to 8; the gap opens from 13, and the move grows with the head's adult form.
   Tried first and dropped: MakeHuman's own field for moving an eye up, turned forward. It carries the fold over
   the lid along with the lid, and the lean of that skin stayed at 35 degrees.
2. *The head was bowed.* Round 50 leaned the men back by 0.14 and the women forward by 0.1, on the belief that
   MakeHuman's woman stands upright. She does not: as morphed, both stand the same (the line from chin to
   glabella 8.7 and 8.6 degrees off upright, the top forward). With the old lean a woman held her head 14 degrees
   lower than a man and looked up from under her brows. Against people holding their heads naturally (Arnett et
   al. 1999, American Journal of Orthodontics and Dentofacial Orthopedics 116(3): 239-253: glabella, lips and
   chin in front of the upright line through the subnasale, 20 men and 26 women; `measure.rs` `PROFILE`) the
   women's old lean lay 4.4 standard deviations off in the mean, no lean 2.4. The best fit is 0.12 for women
   (0.6 off; glabella -11.4 mm against -8.5, upper lip 3.1 against 3.7, lower lip 1.3 against 1.9, chin -3.2
   against -2.6) and 0.10 for men (1.1 off: glabella -12.6 against -8.0, lips 1.8 and -1.3 against 3.3 and 1.0,
   chin -3.2 against -3.5; at 0.14 it was 1.5). `DressSet::lean` is now `[0.12, 0.10]`.
3. *The lids did not suit the pupil.* The eye looks at the viewer however the head leans; the lids stay. On the
   bowed women the upper lid lay 2.0 mm over the pupil and the lower 6.3 under it (a sullen look from under the
   lid); upright at 0.14 it was 5.9 and 2.4, white over the iris and the lower lid across it (startled, and seen
   from below). A real upper lid lies 4 to 5 mm over the pupil and covers the upper 1 to 2 mm of the iris, the
   lower lid just reaches the iris's foot (Neuro-ophthalmology Illustrated ch. 1 at
   neuro-ophthalmology.stanford.edu; eyewiki.org, Margin to reflex distance). Each ball is now set up or down in
   its socket (by 4 mm at most) so that the pupil stands at 0.57 of the way from the lower lid's edge to the
   upper lid's (`DressSet::pupil`, `morph.rs` `pupils_set`): that is an iris of 11.7 mm with its upper 1.5 mm
   covered and its foot at the lower lid. MakeHuman has no target that moves both lids the same way, so the ball
   moves, not the lids.

A test that was there already found a bug on the way: with the eye 2 mm further out, the brow's lift took the
inside of the eye's socket for the skin at one corner of each brow card and threw it 2 cm forward
(`outer_skin`'s rule for shoulders). The lift now takes the last skin its ray meets (`build.rs`).

With the heads upright the faces take the light more fully: the women's shaded cheek came to 18 L under the lit
one (the reference 28) and the upper lip to L 22. The key light now stands 64 degrees round from where the face
looks and 30.5 up (from (4.53, 3.47, 3.76); before 60 and 32). Read as in round 73 (`face_colour.mjs`, with
`--brow` at the reference's size):

| | the reference's woman | grown women, round 73 | now | grown men, round 73 | now |
|---|---|---|---|---|---|
| the lightest skin between lid and brow against the skin over the brow (L) | -17.9 | -46.3 | -24.4 | -21.0 | -21.3 |
| the brow against the skin over it (L) | -37.9 | -48.1 | -38.9 | -37.7 | -37.2 |
| lit cheek L | 56.1 | 59.0 | 61.0 | 67.4 | 65.4 |
| lit cheek a* / chroma | 22.9 / 34.2 | 22.5 / 35.3 | 21.5 / 34.2 | 15.9 / 27.4 | 17.2 / 29.2 |
| the shaded cheek against the lit one (L) | -27.7 | -26.4 | -27.1 | -35.3 | -36.1 |
| upper lip L | 21.0 | 17.0 | 20.8 | 22.7 | 21.2 |
| lower lip L | 33.3 | 33.1 | 33.6 | 34.4 | 32.6 |

Tried on the way (grown women: the shaded cheek against the lit one, the lips, the skin between lid and brow):
the eye forward alone, bowed as before, -25.6, 17.5 / 33.1, -30.3; upright alone (0.14), the eye as it was,
-18.4, 23.0 / 35.3, -32.4; both (at 0.14), in round 73's light, -18.1, 22.7 / 35.3, -23.8. The key at 68 degrees round and
32 up -29.2, 17.5 / 32.2, -26.0 (the upper lip dark again); at 76 the upper lip L 12; at 60 and 26 up -27.3,
25.8 / 34.6, -21.0 (the shade under the brow nearly gone, and the eye's depth with it).

Tests: `tests/faces.rs` "a woman of England has her eyes as deep in her head as real women have" (the
difference between the sexes within 1.5 mm of the real one at the three places), "the grown of England hold
their heads as people do" (the profile within the survey's spread; the old lean fails), "the lids of England
stand to the pupil as real lids do" (84 people of all ages: the share, the upper lid on the iris, no white over
it); `src/lib.rs` "an eye comes forward with its lids and the rim of its socket stays" and "a ball is set in its
socket so that the pupil stands between the lids". The Roman portraits are byte for byte as they were.
Pictures: `runde74_frauen_vorher_nachher.png` (the eight grown women of the sample, round 73 above round 74),
`runde74_neben_ck3.png` (the reference's woman and three of ours at her size, before above after),
`runde74_profil_vorher_nachher.png` (four women and two men from the side), `runde74_stichprobe.png`.
Still open, and not hidden: the skin between a woman's lid and brow is 24 L darker than that over the brow
where the reference has 18; her lid's rim is darker than a man's (-61 against -53; under a light without
direction -53 and -46: the lash line) and her lit cheek 5 L lighter than the reference's; the men's lit cheek
is still pale (L 65, chroma 29). By our reading of Arnett's landmarks the skin over the bone's rim under a
woman's eye lies 2.7 mm deeper against the nose's wing than in his women (a man's 0.1) and the skin under the
pupil 4.2 mm (a man's 3.0): the field that brings the eye forward does not reach there. The opening between the
lids is 8.9 mm high in grown women and 9.1 in men, at the low end of what a clinic expects (9 to 12): the upper
lid lies 3.8 mm over the pupil (4 to 5) and covers 2 mm of the iris, the lower lid 0.8 mm of it; a boy of 13
with a wide opening shows 0.4 mm of white under the iris. Upturned noses show their nostrils on the upright
heads. The men's
forehead lies 1.85 of the survey's standard deviations behind the line (MakeHuman's form). The surveys are of
people of today, one of them of Korea, and read bone where ours reads skin: used for the difference between the
sexes only. And what rounds 72 and 73 left: the brow's form and soft edge, lashes as a dark fringe, the iris'
depth, faces half in a hood's shade.

**Eyes that look at whoever looks at the picture (round 75).** Held large beside the reference's woman, ours
looked past the viewer with much white beside the iris; she looks at the viewer. The stage turns the person away
from the camera by `turn` (-0.24: the head to its right), and the dress table's `gaze` is meant to turn the eyes
back. Its first value had the turn's own sign since round 50 (-0.2, since round 60 -0.1): that turns the eyes
to the head's right as well, further away. Round 60 saw the result of -0.2, "a glance out of the corner of the
eye", took it for eyes turned too far back and halved the value. Measured on the built heads as the stage
frames them (the middle of the iris by least squares from the ball's image, against the line from the ball to
the camera; `tests/portrait.test.ts`), the 36 people of the sample:

| | round 74 | now |
|---|---|---|
| `gaze` (to the head's left, upwards), `converge` | -0.1, -0.04; 0.03 | 0.24, 0; 0.03 |
| the eyes look beside the camera by (degrees) | 19.1 to 20.2 (away from it) | 0.9 at most |
| below (-) or above the camera by | -2.8 to -1.4 | -0.8 to +0.8 |

The second value was -0.04 since round 68, so that no white showed under an iris of real size; since round 74
the ball is set between the lids for any gaze (`pupil`), and the camera stands at the eyes' height. The colours
read on the faces are as in round 74 (the lid's rim of the women -59.4 against the skin over the brow, before
-61.1). `framing` in `src/portrait/stage.ts` is the stage's own reckoning of camera and frame, for the test.
Tried on the way: the lashes at 0.7 and at full strength instead of 0.3 (`brow.lashes`): single hairs that
stand off the lid like a doll's; the reference has a soft dark fringe. Measured at the reference's size, along
the lit eye from corner to corner, ours were already near hers before this round (mean -32.6 L against the lit
cheek, hers -28.5; the white +6.1 and +0.7; the iris -58 and -49): what differed was where the eyes look.
Test: "the eyes of a person of England look at whoever looks at the picture" (every eye of the sample within
1.5 degrees of the camera both ways; on a stage that turns the person the other way the same eyes look more
than 20 degrees past it; a Roman looks straight ahead of the head). Pictures:
`runde75_blick_vorher_nachher.png` (eight people, round 74 above round 75), `runde75_neben_ck3.png`,
`runde75_stichprobe.png`.
Still open: what round 74 left, and for the eyes the lashes as a soft fringe, the brow's soft edge and tapering
tail, an iris with depth; the reference's eye is narrower (the upper lid lower over the iris).

**Brows of soft hairs, lashes as a fringe (round 76).** Seen large, a brow of ours was a flat dark band with a
hard rim, the reference's is hairs, darkest in its core, that thin out into the skin. Rounds 69 to 72 had
worked on that band through its breadth (`brow_band`) and how densely it is drawn (`brow.brows`). The cause
lies one step earlier: Apoleia wrote its image of the brow, `eyebrow001.webp`, from MakeHuman's with the hairs'
covering times 2.5 (`tools/portrait/pipeline/tex.py`, `ALPHA_GAIN`; written again that way, the covering of no pixel
differs from Apoleia's). MakeHuman's own image has single hairs with soft edges, a mean covering of 0.040; times 2.5
they close into a band, 0.079. England now has an image of its own, MakeHuman's as it is, on the same cards
(`DressSet::brow_image`, `eyebrow1356.webp`), drawn more densely in turn. Read at the reference's size (the
lightness along a line from the upper lid up to the forehead; `tools/portrait/face_colour.mjs --brow`):

| grown women, men | brow darker than the skin over it (L) | broad at half its darkness (of the face) |
|---|---|---|
| the reference's woman | 37.9 | 0.045 |
| round 75 (Apoleia's image, `brow.brows` 0.5) | 38.9, 37.2 | 0.050, 0.039 |
| MakeHuman's image drawn in full (1) | 43.8, 41.6 | 0.041, 0.037 |
| now (MakeHuman's image, 0.8) | 38.2, 36.6 | 0.045, 0.036 |

Girls of 8 to 17 read 37.6 and 0.033, boys 32.8 and 0.029. The thin streak in which MakeHuman's brow ends, on
the head a drawn line from the brow's tail down towards the temple, is faded out (`brow_tail.py`).

The lashes: MakeHuman's are long single hairs. Thin (0.3, until now) they do not show; dense they stand off
the lid as a doll's (round 75). Seen from the front at a portrait's distance a row of lashes is a soft dark
edge on the upper lid that runs out past the eye's outer corner. England's image of them is MakeHuman's hairs
blurred (`DressSet::lash_image`, `Eyelashes1356.webp`, `lash_soft.py`: by 3 pixels of 512, the covering times
1.5), the lower lid's strips at 0.15 of that: the lower lashes hang towards the viewer and show in full, the
upper ones are seen from below; left alike, the lower lid gets a band of kohl. The stage draws them at 0.6.
The line painted on the lid's edge under them (`lash_line`) is weaker by as much as keeps the lid's rim as dark
as it was, 0.65 and 0.55 for women and men (before 0.85, 0.75): the rim reads -59.5 and -53.8 L against the
skin over the brow (round 75: -59.4, -54.0; with the fringe on the old line -62.2, -55.9; the reference's
woman about -46). Along the lit eye from corner to corner the mean is -34.6 and -37.6 against the lit cheek
(round 75: -35.0, -38.1; hers -28.5).

Tried and dropped: MakeHuman's brow image written with the covering times 1.5 (the hairs close up again, the
brow reads black); blurs of the lashes of 4 to 6 pixels at twice the covering and more (a bar of mascara);
the lower lid's strips in full or at a third (kohl); the painted line at 0.55 and 0.45 (an old woman's lid
then has no dark edge of its own left: the test of round 65 caught it); the hairs' grey carried out under the
pixels of the brow's image that no hair covers, which are black (no effect: the covering falls off so gently
that the black never shows).
A trap: the stage knows brows and lashes by their image's name (`surfaceKind`: `eyebrow...`, `Eyelashes...`).
Named `lashes1356.webp`, the fringe was drawn as a hair card, with a depth pass of its own, and the rim read
-63.7 instead of -62.2; nothing failed. The test now holds the kind and the density of both.
Tests: "people of England wear the dress of 1356, everyone else Apoleia's" (England's brows and lashes are
England's images on MakeHuman's cards, drawn as brows and lashes at the profile's densities; a Roman's are
Apoleia's) and `the_brows_and_lashes_of_england_are_drawn_with_its_own_images` (`portrait/tests/faces.rs`).
Pictures: `runde76_brauen_wimpern_vorher_nachher.png` (six people, round 75 above round 76),
`runde76_augen_neben_ck3.png` (the reference's woman's eyes, three women of ours before and after),
`runde76_neben_ck3.png`, `runde76_stichprobe.png`.
Still open: what round 74 left. A woman's lid rim is still 13 L darker than the reference's woman's and the
skin between lid and brow 6 L; a man's brow is narrower than a woman's by this measure (0.036: his is not
lifted and lies nearer the lid, the line may not span it); the lower lid has next to no lashes; the iris is
flat; the reference's eye is narrower. Beside the reference the thing that now differs most on a woman is not
in the eyes: the far cheek's outline has a pouch at the height of the nose's tip.

**The far cheek without a pouch (round 77).** Beside the reference, the outline of a woman's cheek that is
turned away from the viewer had a pouch: it stood out at the height of the nose's tip and fell back in at the
height of the mouth.
The measure is `measure::far_cheek` (`portrait/src/measure.rs`): the head turned as the stage turns it (0.24
radians), the skin's triangles cut by level planes every 2 mm from 6 mm under the lower lid to 12 mm over the
chin's lowest point, and at each height the skin that stands furthest towards the picture's edge. Two numbers,
in millimetres: the pad (how much further out than at its top the outline stands at most) and the dent under it
(how far the outline lies inside the tightest line round it from outside). `cargo run --release --example
face_measure` prints both as measures 17 and 18.

| 150 of each sex, 24 to 50 | pad before | pad now | dent before | dent now |
|---|---|---|---|---|
| women, mean (spread) | 1.4 (0.8) | 0.7 (0.3) | 1.7 (1.2) | 1.0 (0.6) |
| women, the tenth with most of it from | 2.7 | 1.2 | | |
| women, most | 3.4 | 1.5 | | |
| men, mean (spread) | 0.9 (0.7) | 0.6 (0.3) | 3.6 (1.2) | 3.5 (0.6) |

On the eight grown women of the sample the pad went from 2.1 to 1.0 mm and the dent from 2.6 to 1.5 mm.

How the cause was found. MakeHuman's young woman alone has a pad of 0.4 mm and a dent of 0.4 mm, with England's
face at rest 0.9 and 0.9. The eight women's heads were then built again from the list of their targets, leaving
out each target in turn: without `cheek-bones-incr` (they had 0.15 to 0.72 of it) the pad fell by 1.65 mm and
the dent by 1.5 mm in the mean; next came `cheek-volume-decr` (dent 0.7; the age's sag and the gene of the
cheeks), `chin-height-incr` (dent 0.5) and `head-diamond` (dent 0.2). `cheek-bones-incr` moves none of the
landmarks at which the breadth at the cheekbones is measured: it lays a pad on the front of the cheek, whose
furthest point lies 21 mm under the lower lid, 17 mm under the cheekbone. A woman's face at rest had 0.15 of it
(round 65: 0.4, round 69: 0.15), and her genes added up to 0.7 (the gene of the cheeks most of it, which
hollows the cheek under the pad as well).
Changed in the dress table: the gene of the cheeks shows at 0.4 of Apoleia's strength (`genes`), and the women
have none of `cheek-bones-incr` at rest (`rest`). 0.4 is by eye, PLACEHOLDER: no measured outline of real faces
was read, and the reference's own outline cannot be read to the millimetre (1.3 mm to a pixel, the ear and an
earring lie over it). The survey's measures are as they were (women's breadth at the cheekbones 135.1 mm, at
the jaw's corners 109.6), the colours too (women's lit cheek L 61.1, the shaded one 28.0 darker, the
reference's 27.7).
Tried before the cause was known, on the women's face at rest, and dropped: `cheek-volume-decr` 0.5,
`cheek-trans-up` 0.5 and `cheek-inner-decr` 0.5 (next to nothing), `head-fat-decr` 0.27 and 0.5 (a smaller pad
over a deeper dent), `cheek-bones-decr` with `cheek-volume-incr` and `head-fat-incr` 0.4 (they fill the dent
and widen the jaw of the sample's eight women from 112.5 to 115 to 121 mm; the survey's women have 110). A
negative weight in `rest` does nothing.
Test: `the_far_cheek_of_a_woman_of_england_has_no_pouch` (`portrait/tests/faces.rs`; its bounds lie between
the two states).
Pictures: `runde77_wange_vorher_nachher.png` (seven women, round 76 above round 77),
`runde77_wange_neben_ck3_vorher_nachher.png`, `runde77_stichprobe.png`.
Still open: the women of 68 keep a dent under the cheek (2.6 and 2.7 mm: the age's sag, whose weights are
Apoleia's and unsourced); the men's outline has a dent of 3.5 mm that was not looked at (a lean head and
cheekbones at rest; under a beard it does not show); what rounds 74 and 76 left.

**Shade that fell into black (round 78).** Held beside the reference at the game's size, the shade of our
faces was black where hers is dark skin: under the chin, under the brow, under the nose. Measured down the
face's middle line from the chin's lowest point over the jaw's underside to the neck, against the lit cheek
(L; steps of 3 % of the face's length from sellion to menton; six women of 17 to 35 of the sample, whose necks
are bare; the reference's woman read by hand one hundredth further down, at 4 to 28 %):

| below the chin's lowest point (% of the face) | 0 | 3 | 6 | 9 | 12 | 15 | 18 | 21 | 24 | 27 |
|---|---|---|---|---|---|---|---|---|---|---|
| round 77 | -53 | -52 | -51 | -50 | -49 | -44 | -38 | -33 | -33 | -30 |
| now | -42 | -43 | -43 | -43 | -42 | -39 | -34 | -30 | -31 | -29 |
| the reference's woman | | -40 | -41 | -42 | -42 | -39 | -36 | -34 | -32 | -30 |

The cause was the stage, not the skin. Its fill light stood level on the far side of the face (from (-3, -1,
5), 10 degrees below, energy 0.12): it lit the far cheek and little else. Skin that faces down had the light
from all round and nothing more (energy 0.2, from below `#8a6f5c`). On a real bust that skin is lit by what
chest and ground throw back. The fill is now that light (`src/portrait/profile.ts`): from (1.5, -3, 5), 30
degrees below and in front, a little to the key's side, energy 0.35 (a fifth of the key's).

Tried and measured on the way (grown women; under the chin against the lit cheek, the far cheek against the
lit cheek, the upper lip's L; round 77: -53, -28.0, 20.8):

| trial | under the chin | far cheek | upper lip |
|---|---|---|---|
| light from all round at 0.3 (before 0.2) | -51 | | |
| its ground colour lighter (`#c9a58c`) | -49 | | |
| the old fill at 0.3 | -45 | -23.8 | 25.5 |
| the fill from (1.5, -3, 5) at 0.35 | -42 to -43 | -27.8 | 27.2 |
| from (0, -3, 5) at 0.3 | much the same | -26.9 | |
| from (3, -4, 5) at 0.4 | much the same | -29.4 | |
| from steeper below, two trials | nothing gained | -30.4, -31.2 | |
| the key at 36 and at 40 degrees with the new fill | | -20.6, -16.6 | |

Also tried and dropped: shade baked into the skin (the share of the hemisphere over each vertex that the head
itself hides, rays of 12 cm, over head and neck). The neck under the chin keeps 0.92 to 0.95 of its light by
that measure: a chin hides little of what a neck sees. The black there was want of light, not want of baked
shade; Apoleia's baked shade (`skin_ao.txt`, rays of 3.5 cm, the face only) is as it was.

With that light a makeshift of round 66 goes: the upper lip, which faces down, was painted half as light again
(`Lips::upper` 1.5 in `portrait/src/dress.rs`) so as not to be a dark bar over the mouth. Under the new fill
that read 27.2 (the reference 21.0); it is now 1.15 (at 1.0: 18.3). The strip that closes the lips takes the
upper lip's colour on its upper edge and went darker with it (its red 0.95 to 1.40 of the skin's, before 1.12
to 1.41; the factor `seam` is as it was, 1.6), and still the line between the lips reads lighter in the
picture, because the fill reaches it. The exposure is a little lower (0.375, before 0.4) and the brows a little
denser (`brow.brows` 0.85, before 0.8), by what the fill adds.

| at the reference's size, against her | the reference's woman | our grown women, round 77 | now | our grown men, round 77 | now |
|---|---|---|---|---|---|
| lit cheek L | 56.1 | 61.1 | 61.5 | 65.6 | 66.2 |
| lit cheek chroma | 34.2 | 34.0 | 34.0 | 28.9 | 28.9 |
| the far cheek against the lit one (L) | -27.7 | -28.0 | -27.7 | -36.1 | -36.4 |
| upper lip L | 21.0 | 20.8 | 20.7 | 21.2 | 22.3 |
| lower lip L | 33.3 | 33.6 | 33.5 | 32.6 | 32.6 |
| the line between the lips against the lit cheek (L) | -41 to -47 | -58.0 | -54.1 | -59.1 | -56.5 |
| the brow against the skin above it (L) | -37.9 | -38.2 | -37.4 | -36.6 | -35.6 |
| the brow's breadth at half its darkness (faces) | 0.045 | 0.045 | 0.041 | 0.036 | 0.034 |
| the lightest skin between lid and brow against the skin above the brow (L) | -17.9 | -24.4 | -20.7 | -21.5 | -18.7 |
| the lid's rim against the skin above the brow (L) | about -46 | -59.5 | -58.5 | -53.8 | -53.6 |
| the nose's back against the lit cheek (L) | +2.6 | 0.0 | -1.6 | -6.4 | -8.0 |

Seen large, the eyes have no second glint from the fill, and the nostrils and the hoods are as before.
Tests (`tests/portrait.test.ts`): 'England's stage lights a face from above and from the side it is turned away
from' holds the fill below and in front (20 to 45 degrees below) and between 0.15 and 0.25 of the key's energy
(before: under 0.15); 'the lips of a person of England close over the mouth, in a colour that goes with the
skin' has the strip's new range (its red over 0.9 of the skin's, before over 1.05).
Pictures: `runde78_vorher_nachher.png` (four women and two men, round 77 above round 78),
`runde78_neben_ck3_vorher_nachher.png`, `runde78_stichprobe.png`.
What it cost, and what is still open: the nose's back is 1.6 L darker than the lit cheek (before level with
it; the reference's is lighter), and a woman's brow reads narrower again (0.041; the fill lights the skin
under it). Across the neck, on the key's side, the neck's flank stands in the key's light (1 to 17 L darker
than the lit cheek at 14 % under the chin; the reference's 25 to 36: her neck lies in even shade), not looked
into. The line between the lips is still 7 to 13 L darker than hers, the lid's rim 12. The men's far half
(-36) and the hard edge of the shade that hood and fringe throw across a man's face are as they were. What
rounds 74, 76 and 77 left.

**Stubble that was a mask (round 79).** In the sample at the game's size, four of the eight grown men had a
dirty brown lower face with a line across the cheek and a pale grey patch over the upper lip. They are the four
who wear stubble. The reference's men have beards or none; none of its screenshots shows stubble large enough
to read, so this round is held against the same faces without stubble and against what is known of real beards.

Measured on the four (`940007`, `940009`, `940023`, `940025`), on the lit side, against the lit cheek (L; the
cheek as `face_colour.mjs` reads it; the jaw beside the chin; the skin over the upper lip beside the philtrum),
with the builder's parts left out in turn (a scratch switch in `build.rs`, not committed):

| | jaw | over the upper lip |
|---|---|---|
| the same skin without stubble | -6.8 | +3.2 |
| Apoleia's paint in the skin alone | -24.2 | +0.4 |
| the layer of hairs alone | -29.5 | -17.4 |
| both, as it was | -39.8 | -19.4 |
| a dark full beard on two other men (the same skin without: -8.5, -10.4) | -62.2, -54.3 | |
| now | -16.0 | -4.4 |

A jaw with stubble was 33 L darker than the same jaw without, two thirds of the way to a dark full beard (44
to 54 darker). Two things lay over each other:

- Apoleia paints the skin of the beard's zone towards a dark brown, facet by facet, under any beard (`build.rs`
  `stub_c`, `in_beard`: 0.2 to 0.6 of that colour on a grown man). These are the grains of its faceted look; in
  the real look they stayed under the layer of hairs. The paint ends at the zone's edge, a line from the
  mouth's corner to the ear, and the zone leaves the skin over the upper lip free: there the layer's hairs lay
  on light skin, as a pale patch beside the painted jaw.
- The layer of hairs (`beard_stubble1356_cap`, Apoleia's with the mouth left free, round 67) has 38 363 hairs on a
  zone of 251 square centimetres of skin, 153 to the square centimetre, over a dark shade of its own of up to
  0.3 (`beards.py` now prints zone and hairs). Real beards have 19 to 55 hairs to the square centimetre (van
  Eemeren 2004, J. Cosmet. Sci. 55 (6), 547 to 548: the range over his shaven subjects; read from the journal's
  page of the abstract through a tool's summary, not from the paper).

Now. England's skin keeps none of Apoleia's paint under stubble (`DressSet::stubble_paint` 0; other beards and
Romans as before). England's layer is written anew with 12 402 hairs, 49 to the square centimetre, and a shade
of 0.12 at most (`LIPS=1 STUB_N=21000 STUB_BASE=0.12 python3 beards.py $B beard stubble beard_stubble1356`; the
hairs' length is Apoleia's, 1.3 mm, three days' growth at 0.4 mm a day, a rate from memory and not looked up;
the layer's triangles are the same, its image covers 0.41 of what it did). The jaw is 9.2 L darker than without
stubble, the skin over the upper lip 7.6: one stubble over both, where before the two differed by 10 L. Its
hue against the same skin: a -2.2, b -3.8 (before a -5.1, b -11.5: a grey mask). The mean chin of the eight
grown men, bearded ones included, went from L 27.5 to 40.1; cheeks, lips, brows and eyes measure as in round 78.

The density is within the measured range. The shade of 0.12 is by eye (PLACEHOLDER): it stands for the shafts
that show through the skin and for hairs too short to draw, and no measured colour of a stubbled jaw was found
(two searches; the one paper that looked likely could not be opened). By reckoning, hairs of 0.12 mm breadth
(from memory) and 1.3 mm length at 49 to the square centimetre cover 8 hundredths of the skin, which would take
about 2 L; ours takes 9 with its shade. Tried: 59 hairs to the square centimetre with a shade of 0.08 (jaw 7.8
darker than without, the hairs read as pepper) and with 0.15 (10.7).

Test: `stubble_of_england_is_hairs_on_skin_and_no_paint_in_it` (`portrait/tests/faces.rs`): the skin of six men
with stubble is, number for number, their skin shaven, they wear England's layer, and a Roman keeps Apoleia's
paint (all of his skin together 0.89 to 0.91 as light as shaven). It holds the skin, not what the layer's
image shows: that is held by the call above, which writes the image.
Pictures: `runde79_stoppeln_vorher_nachher.png` (the four men as the panel shows them, round 78 above round
79), `runde79_stoppeln_teile.png` (three of them large: as it was, the paint alone, the hairs alone, now),
`runde79_stichprobe.png`.
Still open: seen large, the hairs are single dark dashes, each about 0.4 mm broad (the image has 1024 pixels;
a real hair is a third of that); all point one way; the stubble of a man of 24 is as dense as that of a man of
50, and a boy of 17 can wear it; the gene of the beard's growth, which set the paint's strength, no longer
shows in stubble. The paint is still under England's short and full beards, where the hairs
hide it except at the beard's edge on the cheek. The dark full beards are a hard, nearly black shape. What
round 78 left.

**Full beards that were a black shape (round 80).** Round 79 left the dark full beards as a hard, nearly black
shape. Held beside the reference's emperor (the screenshot of emperor and wife, his face five times enlarged),
read as round 79 read stubble (L and chroma; the hair of the head on the crown's lit side, the jaw beside the
chin, the chin under the lower lip, the skin over the upper lip, the jaw on the far side):

| | hair | lit jaw | chin | over the lip | far jaw |
|---|---|---|---|---|---|
| the reference's emperor | 20.5 (lit side), 26.3 (over the forehead) | 28.2 | 26.8 | 32.6 | 10.3 |
| `940021`, brown, full beard, before | 23.9 | 10.4 | 9.0 | 10.3 | 7.9 |
| now | 23.9 | 26.3 | 21.4 | 25.7 | 17.2 |
| `940011`, bald, dark full beard, before | | 5.3 | 4.8 | 3.8 | 4.1 |
| now | | 17.0 | 14.2 | 13.2 | 10.8 |
| `940019`, short beard under a hood, before | | 5.1 | 3.9 | 16.2 | 2.6 |
| now | | 12.4 | 8.8 | 23.6 | 5.2 |
| `940013`, white, before | | 67.4 | 63.6 | 68.0 | 62.8 |
| now | | 65.8 | 58.1 | 66.4 | 52.8 |
| `940027`, white, before | 60.0 | 65.7 | 63.1 | 68.0 | 62.1 |
| now | 60.0 | 63.1 | 56.9 | 66.0 | 50.9 |

The emperor's beard is 2 to 8 L lighter than his hair, of 5 to 7 more chroma (32.9 against 25.9 and 28.4), and
its lit side 18 L lighter than its far side. Ours was 13.5 L darker than the same man's hair and the same on
both sides (2.5 apart): no colour and no form, so a black shape. The white beards had the same want of form
(4 to 5 apart), which on white reads as a flat white bib.

Cause. England's beards are their painted layer alone, without hair cards over it (the full beard since round
53, when Apoleia's cards, which hang as long single strands, were left out; the short beard was a layer from
the start). The stage went on drawing that layer with the values written for the layer under the hair of the
head (`profile.ts` `cap`): there it is the shade between the cards, so it is dark (`tone` 1.7) and lit all the
way round as the cards over it are (`wrap` 1). A beard that is its layer alone is the beard one sees.

Now. The layer of a beard has values of its own (`cap.beard`; `materials.ts` `capLook` tells it by the image's
name, `beard_`, stubble aside): `tone` 5.5, `light` 3.2, `colour` 0.65, `wrap` 0.3. The lit jaw of the brown
beard is 2.4 L lighter than the man's hair and of 5.2 more chroma, its far side 9.1 L darker. The hair of the
head, its under-layer and stubble are drawn as before: of 35 pictures of the sample the five men with a short
or a full beard change, the other 30 are the same pixel for pixel. Over the hair's colours (`940021` with the gene
of the hair's lightness at 0, 64, 128, 192, 255, and red), hair and lit jaw: 6.1 and 1.9, 12.0 and 10.5, 26.3
and 30.9, 44.0 and 47.8, 59.3 and 63.9, red 31.9 and 37.4.

The four values are set by measure against one face of the reference and by eye (PLACEHOLDER). Tried: the
under-layer's own values raised for all layers (`cap.tone` 3: lit jaw 19.5, and the shade under the head's hair
lighter with it); `wrap` 0.5 with `tone` 5 (lit 26.2, far 19.8: 6 apart, too flat); `tone` 6, `light` 3.4,
`wrap` 0.2 (27.0 and 16.4).

Test (`tests/portrait.test.ts`): `a beard of England is a layer of its own to the stage, not the shade under a
head of hair`: every beard in England's sample is a layer and none a set of cards; the full and the short beard
compile with `cap.beard`'s values, a head's under-layer with `cap`'s, stubble with neither; the three have
three programs. It holds what the stage is told, not what the picture shows: the numbers above are read from
pictures by a scratch script.
Pictures: `runde80_baerte_vorher_nachher.png` (the five men, round 79 above round 80),
`runde80_neben_ck3_vorher_nachher.png` (the emperor; `940021` and `940011` before and now),
`runde80_haarfarben.png` (one man with six colours of hair), `runde80_stichprobe.png`.
Still open: a beard is a painted shell on the jaw. It has no strands that stand out of its outline and no
curls as the emperor's, and its upper edge on the cheek is a line of short hairs. Its lit and far side are 9 L
apart, the reference's 18 (no shadow falls on a layer: `cap.shadow`). Black hair and its beard are near black
(L 6 and 2; no black-haired face of the reference was read). A boy of 17 can wear a short beard. Apoleia's
paint is still in the skin under short and full beards. What rounds 78 and 79 left.

**Shadows with hard edges (round 81).** Seen large, a man's face had a dark wedge with a straight edge beside
the nose on the far cheek, with a notch at the nose's root, and a hood threw a line across the forehead. The
reference's shades all run out softly. The men's noses are larger than the women's, so it showed on them.

Cause. The stage's key light was a light without size, as the sun through a hole: whatever throws a shadow
throws it with a hard edge, and the shadow's map (512 pixels across head and shoulders, a pixel about 2 pixels
of the panel's picture) drew that edge in steps. A real light in a room has a size, a window or a lamp with a
shade; the edge of a shadow is then as broad as the angle under which the light is seen times how far the thing
that throws the shadow stands off the skin: narrow under a fringe, broad under a hood.

Now. England's key light has a size (`profile.ts` `shadow`: `spread` 10 degrees to either side, as a window a
metre broad seen from three metres) and is drawn as 8 lights spread evenly over its disc, which share its
energy and throw a shadow each (`stage.ts` `keyPlaces`: a sunflower's seeds, equal shares of the disc; their
mean direction is the key's). The sum of 8 lights is the light of an area sampled at 8 places, in one pass of
three.js' own lights and shadows; the maps have 1024 pixels and a blur of 2. Apoleia's stage has one light
without size as before (`spread` 0; its map and strength moved from a constant of `stage.ts` into its profile).

A broad light reaches further round the face: with the key where it stood, the women's far cheek was 23.8 L
darker than the lit one (before 27.7, the reference 27.7; at 15 degrees 22.4). The key stands 6 degrees
further round for it (70 degrees from the face's front, before 64; `from` 4.88, 3.47, 3.29). Grown women and
men of the sample, `face_colour.mjs`:

| | lit cheek L | chroma | far cheek | upper lip | lower lip | brow | under the brow | under the chin |
|---|---|---|---|---|---|---|---|---|
| the reference's woman | 56.1 | 34.2 | -27.7 | 21.0 | 33.3 | 37.9 | -17.9 | -40 to -42 |
| women, round 80 | 61.5 | 34.0 | -27.7 | 20.7 | 33.5 | 37.4 | -20.7 | -42 to -43 |
| women, now | 59.4 | 34.8 | -27.9 | 18.3 | 31.3 | 37.1 | -21.5 | -39 to -41 |
| men, round 80 | 66.3 | 28.9 | -36.5 | 23.5 | 32.6 | 35.6 | -18.7 | |
| men, now | 64.2 | 30.3 | -36.0 | 21.5 | 30.3 | 35.1 | -19.3 | |

The whole face is 2 L darker (the key lights its front less): the lit cheek is nearer the reference's, the
lips are 2 to 3 L darker than hers; against the lit cheek the lips stand as before (upper -41.1, before -40.8;
the reference's -35.1). The brown beard of round 80: lit jaw 2.0 L lighter than the man's hair (2.4), far jaw
9.8 L darker than the lit one (9.1).

How hard the shade beside the nose is, read as lightness along level lines from the nose's back across the
far cheek (three heights between the nose's root and its wings, steps of 2.2 % of the face's length; the
largest rise over one step between the darkest place beside the nose and the cheek beyond it; a scratch
script): four men before 5.8 L in the mean of twelve lines, 11.9 at most; now 3.8 and 8.3. The reference's
woman, read the same way: 5 and 5 on two lines (9 and 11 on two more that a pale streak on her nose's flank
crosses). The measure is coarse (it reads form and thrown shadow together); the pictures show the change.

Tried: the map at 1024 pixels without a size (the wedge's edge sharper still, its steps gone); sizes of 6, 10,
15 and 20 degrees with the key where it stood (from 10 on the wedge is soft; larger takes more of the far
cheek's shade); the key 4 degrees further round (far cheek -26.4); shadows on the painted layers of hair and
beard again, which round 53 took off them for their hard edges (`cap.shadow`: the far jaw of one brown beard
12.0 instead of 14.9, the other four beards as they were: left off).

Cost. A material of England's reads 9 shadows instead of 2, with the surface's image and its normals 11 images
(WebGL 2 promises 16). On the software driver here the sample's 35 pictures at the panel's size take 107
seconds instead of 48. On a graphics card it was not measured.

Test (`tests/portrait.test.ts`): `England's key light has a size, so that the shadows it throws have soft
edges`: the size lies between 6 and 20 degrees and is drawn as at least 6 lights within the 16 images; the
lights lie on the disc, fill it to its rim, no two at one place, each as far away as the key, their mean
direction the key's; a light without size or drawn as one light is the key itself, and Apoleia's is that. It
holds where the lights stand, not that they share the key's energy (that is the stage's, which needs a
graphics context): a stage that draws a Roman, a person of England, the Roman again and the person again gave
the same pictures for each (a scratch script), and the comparison with Godot is unchanged.
Before pictures: `?set=shadow.spread:0,shadow.lights:1,shadow.map:512,shadow.radius:1,lights.key.from.0:4.53,lights.key.from.2:3.76`
gives round 80's sample pixel for pixel.
Pictures: `runde81_schatten_vorher_nachher.png` (three men and three women, round 80 above round 81),
`runde81_neben_ck3_vorher_nachher.png` (the reference's woman; a woman and a man before and now),
`runde81_stichprobe.png`.
Still open: size and number of the lights are by eye beside one face of the reference, PLACEHOLDER; no shadow
of hers could be read for its breadth. The lips are 2 to 3 L darker than hers, and darker against the cheek
than hers by 6 L as before: their colour and the exposure want a round of their own. The shade beside a man's
nose is deeper than the reference's (down to 13 where the nose's back is 62; hers 34 under 65), and the men's
far cheek is 36 L darker than the lit one as before. The nose's own form is flat planes with a ridge. Seen
large, the lights' eight shadows could show as steps behind something far off the skin; none was seen. What
rounds 78 to 80 left.

**Lips that were too dark against the skin (round 82).** Round 81 left the lips 2 to 3 L darker than the
reference's. Read against the lit cheek of the same face, which is what the eye does, they had been too dark
since the light of round 73; rounds 73 to 78 held the lips' lightness as such against hers, with a lit cheek
5 L lighter than hers.

`face_colour.mjs`, grown women and men of the sample, against the lit cheek (L; a* for how much redder):

| | lower lip | its red (a*) | upper lip | skin over the upper lip | line between the lips |
|---|---|---|---|---|---|
| the reference's woman | -22.9 | +6.2 | -35.1 | -4.4 | -41 to -47 |
| women, round 81 | -28.1 | +6.3 | -41.1 | -5.2 | -54 (round 78) |
| women, now | -22.4 | +6.1 | -36.7 | -5.0 | -49.7 |
| the reference's emperor | -25.8 | +7.1 | | | |
| men, round 81 | -34.0 | +10.3 | -42.7 | | |
| men, now | -25.2 | +8.6 | -38.9 | | -50.9 |

The skin over the upper lip stood as hers before and after: the light on the mouth is right, the lips' paint
was too dark. Round 71 had set it under a light that lit the face level and from the front (lower lip 24
darker than the cheek, hers 23); a lip faces forward and a little down, and the light of round 73, from the
side and above, lights it less than a cheek.

Now (`portrait/src/dress.rs` `Lips`). A lip keeps more of the skin's own colour and takes less blood: women
0.30 of the skin (before 0.2) and blood 0.21, 0.078, 0.069 (before 0.2, 0.068, 0.06); men 0.42 and 0.165,
0.073, 0.074 (before 0.2 and 0.2, 0.072, 0.066: a man's lips were 4 a* redder against his cheek than a
woman's against hers, the emperor's 1). The strip that closes the lips has the lips' colour times a factor;
the factor is smaller by as much as the lips are lighter (`seam` 1.3, before 1.6), so that the strip keeps
its colour (0.95 to 1.28 of the skin's red; before 0.95 to 1.40). The line between the lips reads 4 L
lighter all the same: at the game's size it is the lips' own shade more than the strip (round 78).

Three trials: skin and blood both times 1.3 (lower lip -22.0, but a* +8.8 on women and +12.5 on men: too
red); more skin and less blood (-21.0 and +6.4; men -24.2 and +9.5); the values above. PLACEHOLDER: held
against two faces of the reference, the emperor's a small one (lips of 10 to 30 pixels) and the woman's a
ruler's with paint on her lips.

Tests. `the_lips_of_england_are_as_light_against_the_skin_as_the_references` (`portrait/tests/faces.rs`): the
skin's own colour as the builder paints it, before light and image: the lower lip's red has 0.46 to 0.52 of
the cheek's light on six women and 0.54 to 0.57 on six men (until round 81 0.36 to 0.41 and 0.36 to 0.40;
the bounds lie between; fails on round 81). The test of the lips' strip (`tests/portrait.test.ts`) keeps its
bounds; its comment has the new ranges.
Pictures: `runde82_lippen_vorher_nachher.png` (three women and three men, round 81 above round 82),
`runde82_neben_ck3_vorher_nachher.png` (the reference's woman; two women before and now),
`runde82_stichprobe.png`.
Still open: the women's lit cheek is 3 L lighter than the reference's (59.4 against 56.1) and the men's as
light as the emperor's (64.2 against 65.5): the exposure is left as it is, the two faces of the reference
are 9 L apart. The reference's lips have a sheen and creases, ours are as matt as the skin. A man's lower
lip is 1.5 a* redder against his cheek than the emperor's and less blue (b* -4.7 against -7.5). The line
between the lips is 3 to 9 L darker than hers. What rounds 78 to 81 left.

**The black wedge beside the nose (round 83).** Held beside the reference at the game's size, the skin between
the nose and the far eye was a black wedge on our faces, and a man's far eye a dark hole; on hers that skin is
dark brown and a pale streak lies along the nose's far side.

Scratch `edge81.mjs` reads L along level lines from the nose's back across the far cheek; taken at half and at
0.65 of the nose's length, four women and four shaven men of the sample. The other columns are
`face_colour.mjs` on the eight grown women and men, against the lit cheek (L).

| | beside the nose, under its back | the cheek beyond, under the nose's back | far cheek | eye | under the chin |
|---|---|---|---|---|---|
| the reference's woman | -34 to -35 | -16 | -27.7 | -40.2 | -40 to -42, then -39, -36 |
| women, round 82 | -54.8 | -30.9 | -27.9 | -45.0 | -39 to -41, then -39, -36 |
| women, now | -36.2 | -26.1 | -24.3 | -39.7 | -41 to -38, then -37, -36 |
| the reference's emperor | | | -20.9 | -40.6 | |
| men, round 82 | -32.2 | -25.1 | -36.0 | -59.6 | |
| men, now | -24.0 | -20.2 | -30.9 | -50.3 | |

The cause, seen by drawing each light of the stage alone. That side of the nose faces a quarter turn away from
the face's front. The key (70 degrees round on the other side) does not reach it; the light from below stood on
the key's side since round 78 and hardly reached it; the sky is weak; and the rim light, which shines on it
from 36 degrees off its normal, lay in the head's shadow there. The reference's pale bluish streak lies on
that very side: read here as her rim light (the reference's lights are not known, this is read off the
picture).

Now (`src/portrait/profile.ts`, `src/portrait/stage.ts`):
- `rimShadow` is a strength (before: yes or no) and England's is 0.5: half of the rim light passes the head's
  shadow. The stage computes no light that goes through a nose or comes back off a cheek, and this stands for
  it. It is the one light that reaches the nose's far side and not the far cheek beside it (which faces half a
  radian round and gets 0.03 of the rim).
- The fill is the photographer's again: from (-4, -1, 4), in front on the side away from the key and about
  level, energy 0.18. It reaches the far eye's socket.
- What chest and ground throw back (round 78) is a light of its own, `bounce`: from (0, -3, 5), the middle,
  energy 0.15 (before on the key's side, 0.35, under the name of the fill). A light without energy is left out
  of the materials (Apoleia's stage has no bounce and no rim shadow; its pictures are the same pixel for pixel).

Tried, and what each gave (women; beside the nose / far cheek):

| | beside the nose | far cheek |
|---|---|---|
| the key at 60 degrees round | -50.9 | -20.8 |
| the key at 50 degrees | | -13.4 |
| the key at 45, 35 degrees | -37.2, -28.5 | |
| sky 0.35 | -50.1 | -25.5 |
| the old light from below moved to the far side (-2.5) | -45.2 | -24.3 |
| fill 0.12 to 0.22 at 45 to 63 degrees with the light from below at 0.3 to 0.15, rim shadow whole | -44.1 to -49.1 | -23.5 to -25.3 |
| the same lights, rim shadow 0.5 | -35.8 to -37.6 | -23.7 to -25.0 |
| no fill, rim shadow 0.3, light from below 0.3 from the middle | -37.2 | -26.8 (men's eye -58.6) |

A key nearer the front lights the far cheek long before it lights the wedge, and the face loses its shaded
half (round 73). Any light from the front reaches the far cheek at least as well as the nose's far side. Three.js'
neutral and AgX tone mapping in place of ACES were looked at for the same reason (ACES darkens what is dark):
the shade is lighter, but the skin salmon and flat under the first and pale under the second; every colour of
the profile would have to be set again. Not kept.

The far cheek reads 3.4 L lighter than the reference's where `face_colour.mjs` reads it. Her cheek falls from
L 39 to 20 within a tenth of the face's length there (a place set by hand reads -16.9), and her cheek beside the
nose is 7 L lighter than ours (48 against 42): the far side as a whole is nearer hers than before. The rest of the face stands
(women: lit cheek L 59.0, chroma 34.9; lips -37.1 and -21.2; brow 37.5; forehead -5.9; nose's back level with
the cheek, before -1.3; chin -6.7).

Tests. `England's stage lights a face from above and from the side it is turned away from`
(`tests/portrait.test.ts`) holds: the rim on the nose's far side (above 0.6 of its light) with a shadow of 0.3
to 0.7; the bounce below and in front from the middle; the fill in front on the far side, level; each above
0.05 and both together between 0.15 and 0.25 of the key; Apoleia's fill as it was, no bounce, no rim shadow.
Round 82's look, pixel for pixel:
`?set=rimShadow:1,lights.fill.energy:0,lights.bounce.energy:0.35,lights.bounce.from.0:1.5`.
Pictures: `runde83_keil_vorher_nachher.png` (a woman, two men and a boy, round 82 and now),
`runde83_neben_ck3_vorher_nachher.png`, `runde83_stichprobe.png`.
Still open: the streak beside the nose is the rim's cool colour, pale grey on warm skin, and broad on
children, whose flat faces throw no shadow on it (it was there before and is a little stronger); its edge is
jagged on a man's nose (the rim's shadow map). The men's eye is 10 L darker than the emperor's and their far
cheek 10 L (hoods, fringes). Forehead 6 L darker than the lit cheek (hers level) and the nose's back level
(hers 8 L lighter): a key nearer the front would mend both and was not kept for the far cheek's sake. The
upper lip is 2 L darker than hers (less light from below). PLACEHOLDER, all three values.

**A streak in zigzag down the nose: the skin as a smooth surface (round 84).** Round 83 left the pale streak
beside a man's nose with a jagged edge and named the rim light's shadow map for it; round 81 had called the
nose "flat planes with a ridge". Neither holds.

The noses are of human measure. Against the survey of real heads (the table above: nose protrusion men 21.1,
the survey 21.1; women 19.9, 19.8; sellion to subnasale 52.7 and 49.1, the survey 52.0 and 48.2). And their
backs are round: on 24 grown heads of the sample (`face_measure --dump`, scratch `nose84.py`) the back is 7.8,
13.6 and 18.5 mm broad at 1, 3 and 6 mm under its ridge on men (an arch of about 7.6 mm radius), 3.4, 7.4 and
11.5 mm on women; it leans 29.9 and 27.5 degrees.

What made the zigzag, by drawing a man's nose large (672 by 840) with one thing changed at a time:

| changed | the streak |
|---|---|
| the rim's shadow held 6, 8, 12, 25 mm off the surface (`normalBias`) | zigzag, a little broader |
| its edge blurred 3, 6, 10 times as wide | zigzag |
| the shadow map at 4096 | the same picture |
| no rim shadow at all | zigzag, brighter |
| no pores (`skin.pores` 0) | zigzag |
| no highlight (`skin.specular` 0) | the thin bright line is gone; the edge of the nose's shade is still bent |
| no rim light | no streak; the nose's outline against the far cheek is bent |

So it is the highlight of the rim light and the edge of the nose's own shade, and both are bent where the
head's net has an edge: the net is coarse there, triangles of 8 mm along the nose's back
(`runde84_netz_nase.png`; the whole body has 11 194 triangles). Lit square on, a coarse net does not show,
the light is passed evenly from corner to corner; a highlight and the edge of a shade are lines, and a line
across such triangles has a bend at every edge.

Now (`src/portrait/subdivide.ts`, `mesh.ts`, `profile.ts` `skin.finer` and `skin.fit`). The stage draws the
skin as the smooth surface its net stands for: Loop's subdivision surface (Loop 1987), with the weights of
Pixar's OpenSubdiv (`opensubdiv/sdc/loopScheme.h`, read for this). Every triangle is split in four; each corner
is set on the surface the splitting would arrive at if it went on (the limit position) with that surface's
normal (the tangent masks). Edges with one triangle on them (the mouth's and the eyes' openings) keep to the
rules of a border. Colour and the place in the image are halved along the edges of a corner's own triangle,
so the image's seams stay. Only the skin: cloth, hair, eyeballs are as built.

Loop's surface lies inside its net where the net is rounded outwards. Before the splitting the net is
therefore moved once by what each corner's limit position is off (one round of progressive interpolation:
Cheng and others 2009, read for this). Measured on the head (from a little under the chin up) of a man, a
woman and a girl of 8 of the sample:

| | a corner of the built head off the surface (mm): mean, twentieth worst | the nose's tip | triangles off the surface they are lit as (degrees, mean) |
|---|---|---|---|
| as built | 0 | 0 | 9.0 to 9.8 |
| split once, not fitted | 0.56 to 0.74, 1.6 to 2.1 | -0.15 to -0.37 | 4.1 to 4.3 |
| split once, one round (now) | 0.24 to 0.33, 0.7 to 1.0 | within 0.11 | 4.6 to 4.9 |
| two rounds | 0.15 to 0.20, 0.4 to 0.6 | within 0.13 | 4.8 to 5.3 |
| fitted to the end | 0 | 0 | waves |
| split twice, one round | | | 2.3 to 2.5 |

Fitted to the end, the surface goes through every corner and waves between them round the eyes and along the
nose (the net is not even there); the waves begin to show at two rounds. Split twice looks the same as once
at 672 by 840. The corners furthest off (5 to 6 mm) lie inside the mouth. A portrait takes 55 to 65 ms longer
to draw (node, one head; the game draws one on a click).

The face reads as before (`face_colour.mjs` and `edge81.mjs` as in round 83, against the lit cheek, L):

| | lit cheek | far cheek | forehead | nose's back | lips | eye | beside the nose |
|---|---|---|---|---|---|---|---|
| women, round 83 | 59.0 | -24.3 | -5.9 | 0.0 | -37.1, -21.2 | -39.7 | -36.2 |
| women, now | 58.3 | -23.2 | -5.3 | +1.1 | -34.3, -20.3 | -39.0 | -36.4 |
| men, round 83 | 63.4 | -30.9 | -13.3 | -6.4 | -38.7, -23.7 | -50.3 | -24.0 |
| men, now | 62.6 | -30.3 | -13.6 | -5.8 | -37.4, -23.0 | -49.6 | -26.1 |

Of the sample's 35 pictures none shows skin through a beard, a hood or a veil; a bald head's outline is round
where it had corners.

Tried and not kept: the light inside skin. Skin passes light on under its surface and lets it out a little way
off, red furthest; games draw it by a table read by the angle to the light and by how tightly the surface is
curved (Penner & Borshukov 2011, Pre-Integrated Skin Shading), filled from the measured profile of skin (d'Eon
& Luebke 2007, GPU Gems 3 chapter 14: six Gaussians of 0.0064 to 7.41 mm², the weights per colour summing to
1). Built with the curvature per corner from the head's own form (the nose's tip 9.4 and 9.8 mm radius; half of
all corners tighter than 24 mm, a tenth tighter than 5.8, a hundredth tighter than 1.9). What the measured skin
shows of a light that stands level with the surface (red, green, blue; 1 = the light square on): 0.008 at
50 mm radius, 0.053, 0.012, 0.008 at 8 mm, 0.103, 0.025, 0.016 at 4 mm, 0.171, 0.049, 0.031 at 2 mm. The
profile's wrap gives 0.15, 0.13, 0.12 everywhere. In place of the wrap the table leaves a face
harder and darker in its shade; on top of it, it changes 340 of 564 480 pixels by 8 of 255 or more on a woman,
253 on a man, 931 on a girl of 8 (lid rims, nostrils, corners of the mouth). With the skin's profile three
times as wide, which no measure stands for, 6279, 3903 and 8152, and a red seam in the lid's fold. Skin passes
light on over millimetres; a face in these pictures is about half a millimetre a pixel at 672 by 840 and
three times that in the game's panel. The wrap stays (it
is about what a lamp of the key's breadth reaches round a surface: 10 degrees, 0.17) and the table is not in
the code; its source and what it changed in the materials are kept beside the pictures
(`charaktere/versuch1356/runde84_hautstreuung/`). Read for it: the ring's formula from two weblogs that give
it (Dong 2019, Pesce 2011, the second with Penner's integral as code and the first four rows of weights); the
chapter's page says the weights sum to 1, its table is an image: the last two rows and the unit are from
memory.

Tests (`tests/portrait_skin.test.ts`). Corners at one place are one corner. An icosahedron becomes a ball
(round to 1.5 %, the normals along the radius; inside its net without fitting, nearer with each round, through
the corners in the end). A flat sheet stays flat with its border where it was, and what its corners carry is
halved along the edges. A triangle without area is left out. The skin of three people of England: four times
the corners; a corner of the head off by less than 0.4 mm in the mean after one round (more than 0.5
without); the triangles less than 0.6 times as far off the surface as built; the stage's geometry is that
surface. Apoleia's skin and surfaces without normals are drawn as built (Apoleia's pictures are the same
pixel for pixel).
Pictures: `runde84_nase_vorher_nachher.png` (four men's noses, round 83 and now),
`runde84_umriss_vorher_nachher.png` (two bald heads), `runde84_netz_nase.png`, `runde84_stichprobe.png`.
Still open: the streak is a line now, not yet a quiet one: beside it the skin between nose and cheek still
shows the net's unevenness as faint second lines on some men, and it is still pale grey on warm skin and
broad on children. Only the skin is finer: the eyeball, the cloth and the painted layers of hair are the
builder's nets. What round 83 left (men's eye, forehead, nose's back, upper lip).

**A pale grey patch beside the nose: the rim light behind the cheek's plane (round 85).** Rounds 83 and 84
left the streak beside the nose "pale grey on warm skin and broad on children". On a child it was no streak:
the field between the nose and the far eye was pale grey, as a smear of chalk.

It is the rim light's gloss. Drawn alone (`?set=lights.key.energy:0,lights.fill.energy:0,lights.bounce.energy:0,
sky.energy:0,exposure:1.2`, picture `runde85_licht_von_hinten_allein.png`) the rim paints exactly that field;
it stays with `skin.wrap` at 0 and with the rim's shadow whole. The rim stood 49 degrees round from straight
behind the head: 2 degrees in front of the plane of the cheek beside the nose (which faces half a radian round
from the face's front; the test's `facing(rim, 0.5)` was +0.029). A light that skims a skin shines pale on it
towards whoever looks from the other side, and on a child's flat face that plane is the whole field. On the
reference's woman and emperor the streak is narrow (about 3 mm) and runs along the nose's far flank only.

Measured (`grey share`: in the field from the nose's middle line to the far eye's outer corner, from 0.45 of
the way from the sellion to the nose's wings down to the wings, the share of pixels lighter than the field's
median with less than 0.7 of the lit cheek's chroma; 448 by 560; the reference's woman read the same way:
6.2 %):

| | children of 2 to 8 | girls of 13, 17, boys of 8, 13 | grown women | grown men |
|---|---|---|---|---|
| round 84 | 16.4 % | 12.5 % | 10.8 % | 12.7 % |
| now | 8.3 % | 6.5 % | 6.2 % | 7.9 % |

Now the rim stands 40 degrees round (from (-3.55, 2.5, -4.25), before (-4.2, 2.5, -3.6)): 8 degrees behind
that plane (`facing` -0.123), at the height it had. It still shines on the nose's far flank (43 degrees off
its normal, before 36).

The gloss had been doing a second thing: it was much of the light on the far side of the face. With the rim
moved and nothing else changed, the far cheek is 2.5 L darker on the women and 5.6 on the men, the shade
beside the nose 6.3 and 7.5. The fill reaches that side from the front, in the skin's own colour, and is half
as strong again for it (`lights.fill.energy` 0.28, before 0.18).

What was tried (shade beside the nose as L, from the lit cheek, the nose's back and the shade under it; far
plait: the picture-left plait of six girls, L; the reference's woman has 29.8 beside the nose):

| rim light, fill | grey share children, women | beside the nose women, men | far cheek under the lit one women, men | far plait |
|---|---|---|---|---|
| round 84: 49 degrees round, 24 up, fill 0.18 | 16.4 %, 10.8 % | 23.0, 30.7 | 23.2, 30.3 | 15.2 |
| 49 round, 10 / 5 / 3 degrees up, fill 0.18 | 14.6 / 10.9 / 8.6 % (children) | | | |
| 49 round, level, fill 0.18 | 6.9 %, 9.5 % | 16.2, 31.7 | 25.7, 31.8 | |
| 49 round, level, fill 0.28 | 6.4 %, 9.1 % | 20.1, 34.2 | 23.5, 28.9 | 26.7 |
| the same at half the rim's energy | 1.0 %, 2.7 % | 17.0, 26.3 | 23.6, 31.4 | 18.5 |
| 35 round, level, fill 0.28 | 1.8 %, 4.0 % | 15.1, 27.2 | 23.8, 34.0 | 37.4 |
| 35 round, 24 up, fill 0.28 | 6.3 %, 4.7 % | 18.7, 23.3 | 23.7, 33.6 | 17.6 |
| 25 round, 24 up, fill 0.28 | 3.1 %, 2.6 % | 15.2, 19.7 | 23.8, 34.1 | 17.8 |
| 40 round, 24 up, fill 0.18 | 8.9 % (children) | 16.7, 23.2 | 25.7, 35.9 | |
| 40 round, 24 up, fill 0.28, rim shadow 0.35 | 11.6 %, 7.8 % | 22.0, 28.9 | 23.4, 32.3 | 17.3 |
| 40 round, 24 up, fill 0.28: now | 8.3 %, 6.2 % | 20.6, 26.5 | 23.5, 32.6 | 17.3 |

The rim level with the head is the best light for the faces (the gloss then lies on what faces level and to
the side: the nose's flank, the far cheek's turn), and it was the first choice of this round. (Round 86
corrects this: read on all four groups the level rim is better for small children only, see there.) It is not
kept because of the hair: a girl's far plait turned a pale lilac, 11.5 L lighter (`runde85_versuch_waagrecht_zopf.png`).
The stage draws hair's sheen after Kajiya & Kay: brightest where the strand stands square to the direction
half way between light and eye. The strands are taken as running down along the head; with the rim 24 degrees
up that direction rises 27 degrees, with the rim level it is level, and every strand that hangs straight down
is at the sheen's peak. And a plait's normals point outward from the head's axis, not from the plait's own
(`portrait/src/real_look.rs`), so the plait's whole breadth faces a light from the far side, where a rope
shows such a light only its far flank. Every light that takes more gloss off the face takes light out of the
shade beside the nose: the gloss was that shade's light.

The whole face against the lit cheek (16 grown people, `tools/portrait/face_colour.mjs`; beside the nose and
the cheek beyond it against the nose's back):

| | women, round 84 | women, now | reference's woman | men, round 84 | men, now |
|---|---|---|---|---|---|
| lit cheek L, chroma | 58.3, 35.4 | 59.3, 35.2 | 56.1, 34.2 | 62.6, 31.1 | 63.3, 31.0 |
| far cheek | -23.2 | -23.5 | -27.7 | -30.3 | -32.6 |
| forehead | -5.3 | -4.5 | -0.3 | -13.6 | -12.0 |
| nose's back | +1.1 | -0.8 | +8.2 | -5.8 | -6.4 |
| above the lip | -2.4 | -2.7 | -4.4 | -19.1 | -18.4 |
| chin | -6.1 | -5.1 | -11.6 | -23.4 | -22.5 |
| upper, lower lip | -34.3, -20.3 | -33.2, -20.1 | -35.1, -22.9 | -37.4, -23.0 | -36.0, -22.3 |
| eye | -39.0 | -37.7 | -40.2 | -49.6 | -47.4 (the emperor's -40.6) |
| beside the nose | -36.4 | -37.9 | -34 to -35 | -26.1 | -30.4 |
| cheek beyond | -25.0 | -24.5 | -16 | -20.5 | -21.9 |

On the sample's sheet 3.0 % of the pixels differ from round 84 by more than 8 of 255 (mean 1.0): darker on
the far temple, the far cheek's turn and beside the nose, a little lighter wherever the fill reaches. Hair,
hoods, veils and bald heads are as before; the far plait is 2 L lighter.

Test (`tests/portrait.test.ts`, 'England's stage lights a face from above and from the side it is turned away
from'): the rim stands behind the plane of the cheek beside the nose (`facing(rim, 0.5)` under -0.05) and 15
to 35 degrees above the head; the fill is more than 0.13 of the key and stronger than the bounce; the bounds
of round 83 stay (the rim on the nose's far flank, fill and bounce together under a quarter of the key).
Pictures: `runde85_fleck_vorher_nachher.png` (a girl of 8, two small children, a girl of 13, two women, a man;
round 84 above, now below), `runde85_licht_von_hinten_allein.png`, `runde85_versuch_waagrecht_zopf.png`,
`runde85_stichprobe.png`.
Still open: the patch is halved, not gone: on children a narrower pale band still lies beside the nose (8.3 %
where the reference's woman has 6.2). The shade beside the nose is 2 L darker on the women and 4 on the men
than in round 84 (the reference's woman 9 L lighter than ours), the men's far cheek 2 L darker (the emperor's
12 L lighter than theirs). The nose's back is 0.8 L under the lit cheek on the women (the reference's 8.2
over it), the women's eye 2.5 L lighter than hers, the chin a further 1 L too light. The rim level with the
head waits for plaits drawn as ropes and for a sheen that knows the head's shadow (round 86 has both, tried
the level rim again and left it). PLACEHOLDER, both values.

**A plait is three round strands, plaited (round 86).** A girl's plaits were hair cards: three rows of flat
cards, 1.9 cm broad, along three ways that swing 1.3 cm to either side every 3.4 cm, the whole 4.5 cm broad.
The cards' image is strands with gaps and thin tips, so the outline was ragged; the ways crossed the plait's
middle 67 degrees off its length, a zigzag; and every card was lit as a face turned away from the head (the
builder gives a card the direction from the head's middle to it), a plait as one flat thing. Round 85 found
the last of these the hard way: a light from the far side lit the far plait's whole breadth.

Now each plait is three closed tubes (`tools/portrait/pipeline/styles.py`, style `plait`; written by
`hairlib.py` `write_tubes` as `plait01_rope.txt`). A strand's middle swings 8.5 mm to either side and 3 mm in
depth at twice the rate, the three a third of a swing apart: that is a plait, each strand over one and under
the next. A strand is 12.4 mm broad and 9 mm thick, eight corners round, a ring every 2.5 mm; one swing is
6.2 cm long, so that the strands cross the middle 41 degrees off the plait's length. The plait is 2.9 cm
broad and 1.5 cm thick on the base body (PLACEHOLDER by eye: no plait was measured; the hairstyle itself is
unsourced as before). Below the ear the three begin as one bundle and part over 3 cm; the last seventh runs
out thin; both ends are round. The plait's line down the gown is the table the cards had, now smoothed until
it turns over a hand's breadth (it turned 40 degrees within 2 cm below the ear). 12 384 triangles, 6 240
points; the 54 cards of the plaits (2 592 triangles) are gone from `plait01.txt`, the 320 cards of the head's
hair in it are the same rows, number for number.

The strands' image (`plait01_rope.webp`, 128 by 512, 9 kB; `rope_tex.py`) is the middle of one tile of the
cards' image, where the hairs lie close, its gaps filled with the hairs beside them at 0.7 of their
brightness: a strand of a plait is solid. It is laid across a strand from flank to flank over the front and
back again behind, and down the strand and up again: no seam.

In the builder (`portrait/src/real_look.rs` `mh_rope`) a corner's direction is read from the strand's own
triangles, so that a strand is lit round. And a plait goes with the body in one piece: each ring is bound to
the triangle of the body nearest to the plait's middle there, jaw, neck, shoulder and chest in turn, and on a
body other than the base's these go different ways. The plait had kinks where it passed from one to the next,
its middle line turning up to 74 degrees within 2 cm (40 girls of 8 to 19), and on girls of 8 strands folded
over themselves. Now a plait keeps the form it was laid in, and the way the body carries its points is evened
out along it (300 rounds of each point taking the mean of its neighbours, about 3.5 cm up and down): 23
degrees at most, the turn it is laid with below the ear. The last folds, eight triangles near the end of a
girl of 8's plaits, went with a flatter swing in depth (3 mm, first 4) and an end that runs out smoothly.

On the stage a strand is a kind of its own (`materials.ts`, `rope`, known by its image's name): hair with the
cards' roughness, glint and sheen of strands, but solid. It is drawn with the solid surfaces, hides what is
behind it, throws shadows (on neck and gown) and takes them. The cards' sheen and their light round the
shaded side come from every light whether it reaches the card or not; a strand's are part of each light's own
share, which three.js darkens by that light's shadow. So the far plait now hangs in the head's shadow:

| the picture-left plait of six girls | L | chroma |
|---|---|---|
| round 85 (cards) | 17.3 | 7.9 |
| strands, sheen as the cards have it (read on the first laying of the strands) | 17.5 | 14.2 |
| strands in the stage's shadows: now | 12.2 | 10.2 |

Twice the chroma at the same lightness: the cards' plait was grey with the rim's sheen. In the shadow it is 5 L
darker, as the far cheek beside it is.

A side effect on the head's hair. A hair file's offsets from the skin are scaled by how much smaller the part
of the body is that the file is bound to. With the plaits in it that part was head and chest together, now it
is the head: for a girl of 8 the scale across was 0.66 and is 0.83, at 13 0.83 and 0.91, at 17 0.94 and 1.04.
The hair of the head stands off by the head's own measure, as every other hairstyle's does. A girl of 8 is 3 %
broader across the hair, the older ones 1 % or less.

The rim light level with the head, tried again (round 85 gave it up for the plait). The plait is no longer in
the way: 12.6 against 12.2 L (as cards 26.7 against 17.3). But read on all four groups it is not the better
light for the faces. Grey share beside the nose (round 85's measure):

| rim light | children of 2 to 8 | girls of 13, 17, boys of 8, 13 | grown women | grown men |
|---|---|---|---|---|
| now: 40 degrees round, 24 up | 8.3 % | 6.5 % | 6.2 % | 7.9 % |
| 49 round, level | 6.4 % | 10.7 % | 9.1 % | 11.1 % |

Round 85 called the level rim "the best light for the faces" on the children's share and the men's shade
beside the nose; it had not read the young and the men's share. The rim stays where it is. The other level
lights of round 85's table (35 degrees round: 1.8 % and 4.0 %) take the gloss off and leave the shade beside
the nose 5 L darker on the women; that is a choice about faces alone now and stays open.

Everything else is as it was: of the sample's 35 portraits the 29 without plaits are the same pixel for
pixel, the Roman ones too. Building a girl's portrait takes 30 ms where a woman's or a boy's takes 21 (on this
machine, not as WebAssembly): the evening out.

Tests: `portrait/tests/plait.rs`: `a_girl_of_england_wears_plaits_of_round_strands` (a surface of its own,
one-sided; closed: its faces add up to nothing; it encloses 0.1 to 0.4 litres; of its surface more than 15 %
faces each of the four ways, to and from the head, front and back), `a_plait_hangs_without_a_kink_on_every_body`
(40 girls: no triangle folded over, the middle line turns less than 30 degrees within 2 cm). `tests/portrait.test.ts`,
'a plait is solid hair: drawn with the solid surfaces, in the stage's shadows' (one material, not blended,
writing depth; the sheen inside three.js' function for one light, on cards after all lights), and girls of 7
to 19 wear the strands' surface.
Pictures: `runde86_zopf_vorher_nachher.png` (six girls, round 85 above), `runde86_zopf_gross.png`,
`runde86_zopf_von_der_seite.png` (from both sides and from the front), `runde86_licht_waagrecht_nochmals.png`
(now above, the rim level below), `runde86_stichprobe.png`.
Still open: the hair of the head is cards as before, with a ragged tuft at the ear where it is gathered, and
its sheen knows no shadow (above a plait in the head's shadow the hair still shines). On dark hair the far
plait is nearly black in that shadow (L 4.4). The sheen takes a strand as running down along the head, not
along its own way across the plait. The strands pass through each other a little where they cross (they are
laid by a formula, not pressed together). The plait's end is a plain round tip without band or tuft; it lies
below the picture's edge. All measures PLACEHOLDER.

**A head's hair is locks (round 87).** The hair of men, boys and small children was 520 cards a head (420 to
640 by cut): flat strips of 2 to 4 cm, blended over each other and over a painted layer on the skull. Three
things kept it flat. Every card was lit as a face turned away from the head's centre (the builder's direction for a card),
so the hair was one smooth dome whatever way its strips lay. Blended surfaces throw no shadow on this stage:
none on the forehead under the fringe, none from one strip on the next. And a card ends where its image
ends, in a straight edge: a fringe like a comb, and beside the ear a tuft of strips that followed the ear's
skin outward (round 86 left it open as "a ragged tuft at the ear").

Now the hair is 420 locks (`tools/portrait/pipeline/hairlib.py` `locks_from_wisps`; `styles.py`, style `bob`
with `BOB_LOCKS`). A lock is one bundle of the grown strands, as a card was (the strands sorted into bundles
by K-means; hair as bundles that are each drawn as one body is the cluster model of Yang and others 2000 and
the wisp model of Choe and Ko 2005, both named from memory and not read for this round), drawn as an arched
band along the bundle's middle line: in section the upper half of
a lens of five corners from flank to flank, 2.2 to 4 cm broad (four times the bundle's mean spread, as a card)
and 12 % of that thick, open below. It lies 3 mm over the skin at its root and rises to 1.1 cm over a run of
5 cm, so that a lock that began further up lies over one that begins here. A ring every 1.4 cm, in wavy hair
every 0.7 (with 1.4 a wave was a zigzag). Its first 15 % (2 cm at most) and its last 30 % (2.5 cm at most)
run out narrower and flatter. Beside the face a lock does not follow the skin but the highest skin within 8
degrees round it, smoothed (`Head.covered`): it passes over the ear as hair does. Over the brows that
envelope let the fringe hang lower, so it is used from 35 degrees round the head on.

| file | cards before | locks now |
|---|---|---|
| `bob01` (to the ear) | 29 120 triangles | 26 976 |
| `bob06` (above the ear), `bob07` (to the jaw) | 29 120, 29 120 | 24 544, 29 168 |
| `bob02` (under a hood) | 23 520 | 26 704 |
| `bob03` (gone back at the temples), `bob04` (horseshoe) | 23 520, 35 840 | 28 640, 25 568 |
| `bob05` (wavy) | 29 120 | 36 400 |

All locks are drawn with one image (`hair1356_locks.webp`, 256 by 1024, 47 kB, with normals 9 kB;
`lock_tex.py`): 420 single hairs of 2.6 pixels side by side, drawn one over the other from the lowest to the
topmost, the lower ones darker, with broad streaks of tone across the lock. Its upper three quarters are a
lock's length, the same read downward and upward, and are laid back and forth along a lock of any length
without a seam. The last quarter is a lock's end: there the hairs end one after the other, each run out to a
point, in a few points across the lock, and between them the image is empty. Both ends of a lock are drawn
with that part: the fringe is frayed, and so is the beginning of a lock on the crown (drawn with the length's
part it began as a blunt bar). The image's mean tone is 0.815 where it covers (the cards' 0.809), so that a
person's hair colour stays what it was.

In the builder the locks are a file of their own beside the painted layer (`bob01_locks.txt.zst`, read by
`real_look.rs` `mh_rope` as a plait's strands are): a corner's direction is its own surface's. A surface
that is not closed is drawn from both sides (the builder counts the edges: a plait's strand is closed and
stays one-sided). A lock goes with the head ring by ring, and its way is evened out along it three times
only, a number the file says itself. With the plait's 300 rounds a lock, some 15 rings long, moved as one
stiff piece: on a child of two, whose head is smaller than the one the hair was laid on, the hair stood 2.7
cm over the crown (now 1.0 to 1.5 on nine heads of 2 to 68) and the fringe hung over the eyes, 0.49 of the
head's height below the crown (now 0.30 to 0.40).

On the stage locks are the kind a plait's strands are (`materials.ts`, `rope`): solid, drawn with the solid
surfaces, throwing and taking shadows, their sheen part of each light's own share. Where the image covers
less than half, nothing is drawn (`LOCK_OPAQUE`), in the picture and in the shadow. Not three.js'
`alphaToCoverage`: its part-covered edge is written into the picture as a part-clear pixel, and the picture
stands on whatever the page shows behind it.

What it gives, read on pictures (`runde87_haar_vorher_nachher.png`): the fringe ends in points of different
length and throws a shadow on the forehead; locks lie over each other with a lit and a shaded flank; the hair
passes over the ear and ends in single points below it; wavy hair is waves (`gene=30:250`). Hair above the
brows of eight heads from fair to black (CIELAB, tenth, median and ninth tenth, means): 21.1 / 27.3 / 36.3
with cards, 19.3 / 25.5 / 33.6 now: 2 L darker, the shade between the locks; chroma the same (median 23.2 and
23.1 on the fair boy). The reference's heir has 22.5 / 36.8 / 55.9, a span of 33 L where a fair boy's of ours
has 17 (28.4 / 36.2 / 45.1; with cards 15).

Of the sample's 35 portraits 20 changed (13 men and boys, the 7 small children); the 14 women and girls and
an old man whose hood shows no hair are the same pixel for pixel, the Roman ones too. The seven files and the
one image are 2.8 MB in the repository where the cards and their images were 5.6. Building a portrait takes
20.3 ms where it took 15.0 (the mean of seven heads with hair, best of 40 runs each, on this machine, not as
WebAssembly): a lock file's points are bound twice, as laid and as carried, and its directions are read from
its triangles.

Tried and dropped: locks as closed tubes of eight corners (94 080 triangles a head) and of six (they look
like planks; an underside that faces the rim light shows as pale slivers between the locks); 300 locks of
1.2 to 2 cm (spikes with bare scalp between); locks 2.5 times as broad as their bundle's spread (gaps in the
fringe, bare temples); the first image at a mean tone of 0.47 (every head nearly black); the image running to
its lower edge (it repeats, so its solid top showed as a thin line across each lock's end: the last rows are
empty and a lock's end stops at 0.985 of the image's height).

Tests: `portrait/tests/locks.rs`: `a_man_of_england_wears_locks` (nine heads of all cuts: one surface with
the locks' image, no cards, the painted layer under it, seen from both sides, between half and 1.3 times the
cards' triangles, more than 0.9 of the surface facing away from the head, corner directions that are not a
card's, a share of 0.15 to 0.6 of the corners in the image's frayed part and none below its last hairs),
`locks_lie_on_a_head_of_any_size` (nine heads of 2 to 68: the hair's top 0.7 to 1.8 cm over the crown, the
fringe 0.27 to 0.42 of the head's height below it). `tests/portrait.test.ts`: 'a lock of hair is solid, open
below, and frayed where its image is empty' (one material, not blended, both sides, cut out at
`LOCK_OPAQUE`, the sheen from each light as it arrives; a plait's strands one-sided), and in the dress test:
whoever wears a man's cut wears one surface of locks and no cards.
Pictures: `runde87_haar_vorher_nachher.png` (cards above, locks below: six heads large, twelve at the game's
size), `runde87_haar_wellen_kapuze_seite.png` (wavy hair, under a hood, from the side), `runde87_stichprobe.png`.
Still open: everyone with the same cut has the same locks, the same gap in the fringe at the same place (one
file per cut; the cards had that too, less visibly). The fringe's points are long and narrow, cut paper more
than hair, and a block of locks stands at the temple seen from the side. The horseshoe of a bald head is
scaly and has a ragged upper edge. The painted layer shows as a band at the nape from behind. The locks'
relief is weaker than the reference's sculpted locks (the span above). A lock's sheen still takes its hairs
as running down along the head. The hair of girls and young women (`plait01`) is cards as before. All
measures PLACEHOLDER, by eye: no head of hair was measured, and the cuts themselves are unsourced as before.

**A girl's hair, parted and drawn to her plaits, is locks (round 88).** Round 87 left the head hair of girls
and young women as cards (320, under the plaits of round 86). Seen large from the side it was blotched: cards
lie over each other at different depths and are blended in an order that is right for one of them only, so
that patches of a centimetre stand dark in the hair; at the ear, where the hair is gathered, a tuft of card
ends stood off; at the parting the outline had a notch (`runde88_maedchenhaar_vorher_nachher.png`, upper half).

Now it is 300 locks (`styles.py`, style `plait` with `PLAIT_LOCKS`, written as `plait01_locks`; the lock files
of round 87 are named `<hair>_locks` too since this round, and their image `hair1356_locks.webp`: `_rope` is
the name of a plait's strands). The lock of a man's cut did not do for this hair, which is long, parted and
drawn to one place below each ear. What was tried, in order:

| trial | what showed |
|---|---|
| a man's locks as they were (breadth 2.6 to 4.2 cm, 10 % thick) | no blotches, no tuft; but ragged ends standing up along the parting, and under the jaw a sheet of hair standing off the neck |
| the bow over the ear ended in the ear's height (none of it 40 degrees below level, all of it at 22) | the sheet gone, but small steps all over the hair above the plait |
| a lock begins 1.5 cm before its strands' roots | the parting is a line: the locks of either side meet in it (a wisp's roots lie on a patch as broad as the wisp and the band began in that patch's middle, a finger's breadth off the parting) |
| ends drawn whole, narrow, into the plait's beginning | no flap of frayed ends over the plait; the steps as before |
| locks higher by 0.25 mm for every centimetre they have run, 6 % thick, each higher or lower by 0.3 mm only | the steps as before: they were not locks cutting through each other, as thought |
| beginnings frayed over 6 cm, locks up to 5 cm broad | the steps as before, and a hole behind the ear: dropped |
| the bow taken over the skin's own trend, down to the hair's end | the steps gone: they were the ear's own forms, which the hair followed where the bow ended. And the sheet's cause: from the head's middle the neck is further away the lower one looks (9.7 cm at 40 degrees below level, 12.7 at 60, beside the ear), and "the farthest skin within 8 degrees" lifts the hair by what the neck gains in 8 degrees, 1.3 cm in front of the ear's lobe. Left: a smaller sheet, and a sawtooth line where two neighbours of one height cut through each other |
| that bow to below the ear's lobe (all of it above 42 degrees below level, none below 50), each lock higher or lower by 1 mm | as built: sleek to the plait, no steps, no sheet, no sawtooth |

In `hairlib.py`: `locks_from_wisps(back=)`, a fourth number of `layer` (the rise per unit run), a fifth of
`tip` (0: the end drawn with the image's length part, hair that is gathered and not cut), `Head.covered(trend=)`
(the farthest skin is looked for in what the skin stands off its own mean over 14 degrees). The lock writing
of both styles is one function now (`styles.py` `write_locks`, the switches read under the style's name:
`BOB_LOCK_...`, `PLAIT_LOCK_...`); the seven files of round 87 come out of it byte for byte (checked on
`bob01`, `bob04`, `bob05`). In the builder a style can have both kinds of solid hair, each in its own file:
`<hair>_locks` with the dress set's lock image, `<hair>_rope` with its own (`build.rs`); the stage knows solid
hair by either name (`materials.ts`).

Numbers. On seven girls of 8 to 19 (`portrait/tests/locks.rs`): the hair's top 0.5 to 0.65 cm over the crown
(a man's cut 1.0 to 1.5); the forehead free (the lowest hair in front of the face's middle 0.12 to 0.15 of
the head's height below the crown); 308 to 373 triangles of a lock's beginning lie across the parting (begun
at the middle of their roots 0 to 85); below the ear the hair is nowhere further than 1.4 to 1.5 cm from the
skin (with round 87's bow 2.0 to 2.4). The field above the brows of the six girls of the sample: its darkest
tenth is 2.1 L lighter (the parting's dark stripe and the dark patches), its median 0.6 L darker. No measure
was found that tells the cards' blotches from the locks' own streaks (tried: the share of the hair from the
side that is 5 L darker than a square of 41 pixels round it, 9.8 % before and 10.0 % now; the same over
patches of a centimetre, 11.1 and 11.5 %, on a field that takes in skin): that finding rests on the pictures.
28 032 triangles where the cards had 17 920; `plait01_locks.txt.zst` is 384 kB where cards and their two
images were 685. Building a girl's portrait takes 28.6 ms where it took 24.0 (best of 40, six girls, native).
Of the sample's 35 portraits the six girls changed; the other 29 are the same pixel for pixel, with the lock
files renamed, and the Roman ones too.

Tests: `portrait/tests/locks.rs`, `a_girl_wears_her_hair_parted_and_drawn_to_her_plaits` (the numbers above as
bounds: fails on locks begun at their roots' middle and on round 87's bow); `portrait/tests/plait.rs`: a girl
wears locks, the painted layer and the strands, no cards; `tests/portrait.test.ts`: whoever wears hair in
England wears one surface of locks over the cut's painted layer and no cards.
Pictures: `runde88_maedchenhaar_vorher_nachher.png` (cards above, locks below: four girls from the front, two
from both sides), `runde88_stichprobe.png`.
Still open: the hair is one sleek shell of streaks; the reference's parted hair has strands that lift off and
a soft outline. Where locks overlap, a lighter and a darker streak meet in a straight edge. At the front end
of the parting a speck of skin shows. The hairline on the forehead is the painted layer's, a soft band. Every
girl has the same locks. The sheen takes the hairs as running down along the head, which on hair drawn back
over the ear is wrong by up to a quarter turn. England has no hair cards left; Apoleia's styles are cards as
before. All measures PLACEHOLDER, by eye; the hairstyle is unsourced as before.

**Hair that is cut: a fringe several locks deep, ends that are hair (round 89).** Round 87 left open that the
points of a man's fringe are long and narrow, cut paper more than hair, that a block stands at the temple and
that the horseshoe of a bald head is scaly. Rendered large, these were four things with four causes
(`runde89_fransen_vorher_nachher.png`, upper half):

- The ends. A lock ended over its last 2.5 cm nearly as broad as it was (0.8 of its breadth), and the image's
  frayed part has few hairs that end early: two or three long narrow points to a lock, with hard edges.
- The edge of the painted layer. The layer of painted hair on the skin (`<name>_cap`) still covered where its
  net ends: along the net's rim 0.57 in the mean, in front of the ears 0.73, over a half on 81 % of that part
  (`cap_edge.py`). It ended in the straight edges of the skin's triangles. Under a head of hair nobody sees
  that; where a short cut leaves the temple bare it is a dark shape with corners.
- The block itself. With that edge made soft the block still stood. Rendered four times as large it was one
  short lock with a dark cross-hatch on it. A lock wore the whole length part of the lock image whatever its
  own length, and that part is drawn for 10 cm: on a lock of 3 cm hairs that sway over a hand's length are
  pressed into a finger's breadth and turn into a net of crossing lines. Measured on nine heads, the share of
  the image's height a lock wears per unit of its length (0.75 as the image is drawn): in the median 1.5 to
  2.7, in the highest hundredth 4.5 to 6.8.
- Gaps in the fringe, and scales. Over the forehead lay one layer of locks, with holes to the skin, and lock
  ends lay all over the top of the head. A strand's length followed from the height of its root, as if all
  hair hung straight down. But on top the hair runs away from the whorl: a strand that sets off from the
  crown forward ended on top of the head or on the forehead, and only the strands rooted at the hairline
  reached the fringe's line.

What was tried, in order (four men and boys from the front, two from the side, each time):

| trial | what showed |
|---|---|
| a lock's end at most 1.2 cm long instead of 2.5 | the points shorter, the ends blunt blocks |
| the end drawn in to 0.35 of the lock's breadth, the image with more hairs ending early (`POINTS` 0.85) | every lock a spike |
| the end 1.8 cm, drawn in to half the breadth, and longer or shorter by 40 %, broader or narrower by a quarter of the lock from lock to lock, `POINTS` 0.75 | points of different lengths and breadths, finer; the holes in the fringe and the block as before |
| the painted layer fading out from 1 to 6 degrees outside the hairline | its edge gone (covering along the rim 0.000); the block as before: it was not the layer's |
| a lock wears as much of the image as it is long | the block gone, and the dark net on every short lock with it |
| all hair of the front long enough to reach the fringe (no common line) | the forehead covered, but a thatch: lock ends at every height |
| every strand cut where it crosses one line, the line rising and falling by 3 degrees | the forehead covered several locks deep; the edge a helmet's, drawn with a ruler |
| a lock ends up to 1.5 cm before its strands do, by chance | the edge is hair cut by hand |
| the sides and the back cut at a line too, every strand running to it | as built: no lock ends on top of the head but those of the layers, the nape cut where the cut says |

In `hairlib.py`: `locks_from_wisps(vary=)` (per lock, with random numbers of its own: the end longer or
shorter, broader or narrower, the lock shorter than its strands), and the rule for the image along a lock
(the length part laid from its lower end up and back: all of it on a lock of 20 cm or more, on a shorter one
only so far up that the image keeps its scale; no switch); `outside` (for every direction the angle to the
nearest place inside the hairline) and `paint_cap(fade=)`. In `styles.py` the style `bob` cuts: `BOB_CUT` (the
fringe's line, 14 degrees below level seen from the hair scripts' head centre), `BOB_END` (the line at the
sides and the back), `BOB_CUT_VARY`, `BOB_ROUND`, and lengths that let a strand reach the cut on any way
(`BOB_SIDE_K`, `BOB_FK`, `BOB_FRINGE`, `BOB_FW`); `write_locks` reads `<key>_LOCK_VARY`. `lock_tex.py`: `POINTS`
0.75. `cap_edge.py` (new): the painted layer's covering along its net's rim. The seven cuts are written anew
(calls in `tools/portrait/pipeline/README.md`); `BOB_END` of the three lengths was set anew by measure, since
a strand used to overshoot it by what its length gave it (`bob01` -43, `bob06` -31, `bob07` -51 where they
were -26, -12, -38). The hair under a hood (`bob02`) is cut as the others and lies lower and thinner (lift 0.8
to 1.5 mm, locks 7 % thick and 0.8 to 2.2 mm over the skin): cut long, its locks stood in front of the hood's
rim. The girls' locks (`plait01_locks`) come out of the same call as in round 88, changed by the rule for
the image alone; their plaits, painted layer and scalp are the same byte for byte. No Rust source changed.

Numbers, old against new, on the nine heads of the test (men, boys, small children):

| | round 88 | round 89 |
|---|---|---|
| image per unit of a lock's length (0.75 as drawn), median over a head's triangles | 1.54 to 2.72 | 0.68 to 1.04 |
| the same, highest hundredth | 4.54 to 6.75 | 1.16 to 1.62 |
| locks over each other in the fringe (84 places above its lower edge), median | 0 to 1 | 3 to 6 |
| the same, lowest tenth | 0 | 1 to 2 |
| the fringe's lowest corner below the crown, share of the head's height | 0.298 to 0.373 | 0.286 to 0.345 |
| lowest lock beside the ear, `bob06` / `bob01` / `bob07` | 0.49 to 0.52 / 0.651 / 0.726 | 0.49 to 0.53 / 0.673 / 0.746 |
| lowest lock at the back, `bob06` / `bob01` / `bob07` | 0.74 to 0.87 whatever the cut | 0.61 to 0.64 / 0.701 / 0.803 |
| the painted layer's covering along its net's rim (in front of the ears) | 0.573 (0.729) | 0.000 (0.000) |
| triangles of a cut's locks | 24 544 to 36 400 | 28 688 to 42 912 |
| building a man's portrait, best of 40, native | 17.6 ms | 18.1 to 18.8 ms |

The back is the plainest finding among them: until now the hair of the nape hung to the neck whatever the
cut, since a strand rooted high at the back had the length to get there. Girls: the median of the image's
measure 0.98 to 1.08 where it was 1.52 to 1.67; 105 triangles at the plaits' beginnings below the ear stay
pressed (to 18 and 24 times), where the lock's rings fall together because the strand runs straight away from
the head's centre: there before this round, hidden by the plait's beginning, not mended. Of the sample's 35
portraits 26 changed (the 20 men, boys and small children with hair to see; the six girls by 0.8 to 3.1 % of
their pixels); nine are the same pixel for pixel (the eight veiled women and the bald old man in his hood),
and the Roman ones.

Tests: `portrait/tests/locks.rs`, `hair_that_is_cut_runs_to_the_cut_and_wears_as_much_of_the_image_as_it_is_long`
(the image's measure in the median below 1.3 and in the highest hundredth below 2.2; the fringe at least two
locks deep in the median and one in the lowest tenth; it fails on round 88's files on both). The three tests
of rounds 87 and 88 hold on the new files with their bounds as they were. The soft edge of the painted layer
is not held by a test: the builder's tests read no images; `cap_edge.py` is the check, run by hand.
Pictures: `runde89_fransen_vorher_nachher.png` (round 88 above, round 89 below: four men and boys from the
front, two from the side), `runde89_stichprobe.png`.
Still open: the fringe's edge is fairly even from temple to temple, a bowl cut; the reference's fringes part
and fall in tufts. On top of the head the ends of the layers still show as small steps, fewer than the scales
were. The front edge of the bald head's horseshoe is the straight side of a lock, with steps. White hair shows
the image's dark gaps between hairs strongly. Seen from behind there is a dark dot at the whorl. Whoever wears
the same cut wears the same locks. `bob05` and `bob07` are worn by nobody in the sample: they were measured
on the test's heads and not looked at in a portrait this round. Beards are a painted shell as before. All
measures PLACEHOLDER, by eye; the cut itself is unsourced as before.

**A full beard of locks over its painted layer (round 90).** After rounds 87 to 89 the hair of the head is
locks, each lit by its own form. Beside it the full beard (`beard_crop`) was the last hair that is a painted
shell (rounds 53 to 80): a smooth surface 3 to 6 mm off the jaw with hairs drawn on it, lit as one form, its
outline the layer's own edge, a ruled line on the cheek (`runde90_bart_vorher_nachher.png`, upper row). As a
measure of that, the relief round the lit jaw: in a disc of 0.075 of the face's breadth, the lightness of
the darkest tenth, the median and the lightest tenth of its pixels (`beard90.mjs`, four men of the sample).
The span between the tenths was 4.6 to 8.8 L. There is no such number for the reference: its faces are about
a third as large in the screenshots.

What was tried, in order (the four men with the full beard from the front, two from the side, each time):

| trial | what showed |
|---|---|
| a: 360 locks of 0.7 to 1.4 cm laid over the skin plus a thickness, with a bow under the jaw; strands of 2 cm on the cheeks, 3 at the chin, 1.2 on the upper lip | the beard ran down the throat to the collar bones as a collar (a step laid on the neck's slope is far longer than on the jaw), and read as pellets |
| b: the locks over the beard's own form (the painted layer's lifted surface), strands cut 4.5 mm outside the beard's zone | the right outline; the locks grains of rice, the upper edge on the cheek scalloped |
| c: 300 locks of 0.9 to 1.8 cm, 18 % as thick as broad; strands of 3.2, 4.5 and 1.4 cm; ends longer and less drawn in, beginnings pointed; waves (1.2 mm sideways, 0.6 mm off the beard, 1.5 cm long) | wavy tufts, a soft edge on the cheek; the outline below smooth |
| d: strands cut 10.5 mm outside the zone, the layer 4 mm off cheeks and jaw and 9 mm at the chin | tufts at the outline, a fuller chin |
| e: the image of the locks with lighter gaps between the hairs (`DEEP=0.12`) | a white beard whiter, a brown one without strands: not kept |
| the stage's `sheen.light` 1.5, 0.5 and 0 | grey wool, white hair with strands, plastic: 0.5 |
| g: the layer comes to its full distance over 13.5 mm from its edge instead of 6 (`CROP_EDGE=9,1`) | the edge on the cheek thinner; as built |
| s1: the short beard (`beard_short1356`) as locks too (340 locks, the layer 1.5 to 3.5 mm off, strands of 2, 2.6 and 1 cm) | on the boy of 17 a dark full beard: the short beard stays painted |

As built. In `beards.py`, the style `crop` with `CROP_LOCKS` in front writes `beard_crop_locks.txt` beside
its painted layer: the beard's form is the layer's surface (the skin lifted by `crop_lift`), cast into the
head's table of directions (`hairlib.py` `farthest`, taken out of `Head.__init__` for it); 9 000 roots in
the zone, each a strand grown along the beard's flow over that form (`CROP_LOCK_L`: 3.2 cm on the cheeks,
4.5 at the chin, 1.4 on the upper lip, each by 15 % more or less), cut where it comes to the lips and where
it leaves the zone by more than `CROP_LOCK_CUT` (7 units of 1.5 mm); a strand with fewer than four points
left is dropped. The strands are gathered into 300 locks as a head's hair is (`write_locks`, which moved
from `styles.py` to `hairlib.py` and takes the form the locks lie over; `styles.py` calls it under its own
head): 0.9 to 1.8 cm broad, 18 % as thick, on the layer at their beginning and 3.5 mm over it after
1.2 cm, with waves (`CROP_LOCK_WAVE`). `CROP_EDGE`: over how far from its edge the layer comes to its full
distance. The layer itself is written with `CROP_LIFT=0.04,0.09`; its images and its scalp came out the same
byte for byte, its net differs. `lock_tex.py` draws the image of a beard's locks
(`beard1356_locks.webp`: 300 hairs, broader, swaying more than a head's). In the builder a beard may bring
locks as a head of hair does: `build.rs` reads `<beard>_locks`, `real_look.rs` `mh_rope` takes the hair's
colour by place (a beard greys first at the chin), `DressSet::beard_lock_image` names the image. On the
stage they are solid hair as a head's locks (kind `rope`, by the image's name); `sheen.light` 0.5 where it
was 1.5 is the one stage value changed, and it changes all light hair of England: the further darkening of
the image's dark strands was made for cards, and on solid locks it turned white hair to grey wool (round
89's open point). Every cut and the plaits written anew with round 89's calls are the same byte for byte
(41 files), and so are the three beards with the calls as documented before this round.

Numbers, old against new (the sample's four men with the full beard: 940011, 940013, 940021, 940027):

| | round 89 | round 90 |
|---|---|---|
| relief round the lit jaw, lightest tenth less darkest tenth (L) | 4.6, 8.6, 7.4, 8.8 | 10.0, 13.2, 10.3, 17.4 |
| the same disc, darkest tenth / median / lightest tenth, 940021 (brown) | 20.8 / 24.2 / 28.2 | 20.8 / 25.2 / 31.1 |
| the same, 940027 (white) | 56.1 / 61.1 / 64.9 | 58.2 / 64.2 / 75.6 |
| 940021: beard on the lit jaw / at the chin / over the lip / on the far jaw (L; his hair 18.6) | 25.2 / 20.7 / 25.0 / 17.0 | 26.1 / 30.6 / 28.0 / 16.9 |
| 940027: his hair / lit jaw / chin / far jaw | 52.7 / 61.7 / 55.8 / 50.5 | 59.8 / 62.9 / 73.9 / 50.0 |
| lit jaw less far jaw, 940021 (the reference's emperor: 18) | 8.2 | 9.2 |
| triangles of a full beard's locks | none | 16 528 |
| the locks' lowest point below the chin, share of the head's height (seven heads of the test) | | -0.009 to 0.020 |
| the locks off the skin, median / at most | | 6.7 to 7.2 mm / 1.45 to 1.56 cm |
| building a man's portrait as the test draws him and with the full beard, best of 40, native (two men) | | 13.0 and 18.4 ms, 20.2 and 27.9 ms |

Of the sample's 35 portraits 18 changed: the four full beards, and 14 people with hair light enough for
`sheen.light` to count (by at most 19 of 255 in a channel; two of them in fewer than 30 pixels by one step).
The Roman pictures are the same pixel for pixel.

Tests: `portrait/tests/locks.rs`, `a_full_beard_of_england_is_locks_over_its_painted_layer` (seven men
given the full beard: one surface of a beard's locks, seen from both sides, over the painted layer, 8 000
to 30 000 triangles, nothing of it lower than a tenth of the head's height below the chin (locks left to
run their length hang 0.17 to 0.22 below it and fail on one head of the seven; the bound is by that
measure), nothing of it higher than 0.45 of the head's height below the crown, off the skin in the
median more than 3 mm and at most less than 3 cm, not of one colour on a man of 68; no other beard brings
locks). `tests/portrait.test.ts`, `a full
beard of England is locks over its painted layer, and light hair keeps its strands` (the sample's four,
solid and cut out as a head's locks, an image of their own; `sheen.light` between 0 and 1 and in the
program). Pictures: `runde90_bart_vorher_nachher.png` (round 89 above, round 90 below), `runde90_stichprobe.png`.
Still open: on the upper lip the short locks stand as small scales, on a white beard with grey gaps between
them, and so along the beard's upper edge. From the far side the beard's back edge below the ear and its
line on the neck are straight: the zone's border. The outline below is fairly even from the front. Lit to
far side 9 L where the reference has 18. The short beard is a painted layer still (as locks it read as a
full beard), stubble as it was. Every man with the full beard wears the same locks and the same outline;
a boy of 17 can wear a beard. The chin of a brown beard is now 12 L lighter than the man's hair (the
reference's emperor: 2 to 8), since the locks there catch the key light. All measures PLACEHOLDER, by eye,
`sheen.light` by eye on three values.

**A moustache of its own, a beard that closes round the mouth and keeps to the jaw (round 91).** Round 90
left small scales on the upper lip and a straight back edge below the ear. Rendered four times as large
(1792 x 2240) and once with the locks alone (`?without=beard_crop_cap`), these were four things
(`runde91_mund_profil_vorher_nachher.png`, upper row):

- Chips on the upper lip. There the beard's flow runs out and down, into the mouth. A strand of a
  moustache's length was cut at the lips after a few millimetres, and the locks made of such strands, as
  broad as the beard's (0.9 to 1.8 cm on a lip 1.4 cm high), stood on the lip as a row of chips.
- A bare ring round the mouth. The zone leaves the mouth free as an ellipse 0.39 by 0.12 (7.8 by 2.4 cm):
  the base's full lips with a margin. A man of England's lips are thinner. The locks ended 5 to 8 mm above
  his upper lip and began as far below his lower one; the painted layer alone filled the ring. On seven
  heads the band the locks leave free at the middle of the face was 0.102 to 0.120 of the head's height.
- A row of flames at the chin. A lock began in the middle of its strands' roots, half a patch inside the
  edge of the hair, and its beginning was a point (a quarter of its breadth over 1 cm): good under other
  locks, a row of spearheads where nothing lies over it, under the lip and along the cheek.
- In profile, a bib. The line that ends the zone in front of the ear ran backwards on its way down (z 0.6
  at the ear's lobe, 0.25 at the height of the neckline) and met the neckline in a corner: the beard covered
  the side of the neck behind the jaw, with two ruled edges. Its hindmost corner near the neckline lay
  0.075 to 0.100 of the head's depth behind its edge in front of the ear (1.5 to 2 cm). That was the
  painted layer's own outline, not the locks'.

What was tried, in order (two men from the front with mouth and jaw large, one from both sides; from trial
8 two men in profile from both sides):

| trial | what showed |
|---|---|
| 1: the upper lip's roots as the moustache's own: strands that sweep out along the lip, 44 locks of 3.5 to 7 mm | no chips; thin wavy twigs with the painted layer between them |
| 2: 90 locks of 5 to 10 mm, flatter (22 % as thick as broad), waves a quarter as far | a moustache from the front and from the side; a strip of painted layer between it and the lip |
| 3: a lock's beginning broad and flat (0.8 of its breadth over 6 mm) and 3 mm before the middle of its roots | no flames; a ruled line of beginnings under the lip |
| 4: a lock begins where the foremost of its strands are rooted; waves 2.2 cm long instead of 1.5 | the line softer and where the hair's edge is; the waves read as hair, not as a zigzag |
| 5: the beginning 3 mm long instead of 6 | a hard edge under the lip: not kept |
| 6: the locks alone rendered: the ring; a mouth of their own for the locks, 0.36 by 0.055 above and 0.075 below the line of the lips | the moustache down to the lip, the chin's locks from under the lower lip; the upper lip covered |
| 7: 0.07 above the line | the upper lip's edge shows; as built |
| 8: strands cut 3 mm outside the zone at the back instead of 10.5, each sooner by chance | the bib as before: it is the painted layer |
| 9: the zone's back line straight down in front of the jaw's angle (z 0.47 and 0.42), the corner rounded with 1.5 cm; strands cut 7.5 mm outside the zone at the back and each up to 0.6 sooner | in profile the beard keeps to the jaw; as built |

As built, all in the pipeline; no Rust source and nothing of the stage changed. `beards.py`, style `crop`:
`CROP_M_LOCKS` (the moustache apart: 2 400 roots on the upper lip, strands of 2 cm along a flow that turns
along the mouth's outline, `CROP_M_FLOW`; gathered into 90 locks of their own by `write_locks(write=False)`
and written into the beard's file with `extra=`; the beard's other locks are made without those roots),
`CROP_LOCK_MOUTH` (the mouth the locks leave free: roots, cut and the moustache's flow take it, the painted
layer keeps the zone's), `CROP_LOCK_CUT` with up to five numbers (in front, at the back, between which
depths, the share by chance), `CROP_BACK` (the zone's back line and the radius of its corner: this one
changes the painted layer, its net and the scalp file). `hairlib.py`: `locks_from_wisps(first=)` and
`<key>_LOCK_FIRST` (a lock begins where the foremost of its strands are rooted). The call is in
`tools/portrait/pipeline/README.md`; without the new switches it writes round 90's files byte for byte, and
every cut, the plaits and the beards as documented before come out as they were.

Numbers, old against new (seven heads of the test given the full beard; the sample's four):

| | round 90 | round 91 |
|---|---|---|
| the band the locks leave free at the middle of the face, share of the head's height | 0.102 to 0.120 | 0.039 to 0.051 |
| the beard's hindmost corner near the neckline behind its edge in front of the ear, share of the head's depth | 0.075 to 0.100 | -0.001 to 0.019 |
| locks / triangles | 300 / 16 528 | 390 / 25 824 |
| the zone / hairs painted on the layer | 233.5 cm2 / 71 939 | 228.1 cm2 / 68 344 |
| the locks' lowest point below the chin, share of the head's height | -0.009 to 0.020 | -0.022 to 0.016 |
| the locks off the skin, median / at most | 6.7 to 7.2 mm / 1.45 to 1.56 cm | 6.3 to 6.9 mm / 1.55 to 1.62 cm |
| relief round the lit jaw, lightest tenth less darkest tenth (L), 940011, 940013, 940021, 940027 | 10.0, 13.2, 10.3, 17.4 | 8.6, 14.1, 9.8, 14.6 |
| 940021: chin against his hair (L; the reference's emperor 2 to 8 lighter) | 12.0 lighter | 7.6 lighter |
| 940021: lit jaw / far jaw (L; the reference's lit side 18 lighter) | 26.1 / 16.9 | 18.7 / 13.7 |
| `beard_crop_locks.txt.zst` | 235 kB | 366 kB |
| building a man's portrait with the full beard, best of 40, native (two men; without it 13.4 and 21.8 ms) | 18.4 and 27.9 ms | 22.7 and 31.5 ms |

The relief is what it was. The lit jaw of the brown beard reads 7 L darker at the place measured and its
lit side is 5 L lighter than the far side where it was 9: a measure over a few pixels, on locks laid anew
(my reading; the pictures show no darker beard), and further from the reference's 18 either way. Of the
sample's 35 portraits four changed (the full beards, 10 to 11 % of their pixels); 31 and the Roman pictures
are the same pixel for pixel.

Tests: `portrait/tests/locks.rs`, `a_full_beard_closes_round_the_mouth_and_keeps_to_the_jaw` (seven men
given the full beard: the locks leave between 0.03 and 0.085 of the head's height free at the middle of the
face, and the beard's hindmost corner near the neckline lies less than 0.04 of the head's depth behind its
edge in front of the ear; it fails on round 90's files on both, on all seven). The test of round 90 holds
with its bounds as they were. Pictures: `runde91_bart_vorher_nachher.png` (round 90 above, round 91 below),
`runde91_mund_profil_vorher_nachher.png` (mouth and jaw of two men large, two profiles),
`runde91_stichprobe.png`.
Still open: the moustache covers most of the upper lip's red on some men (a full moustache; whether the
mouth reads worse for it was judged by eye only). In profile the outline below is one straight line from
the chin to the corner, with a fringe of the painted layer's short hairs. The chin's locks begin in a row
under the lower lip. Where the moustache meets the beard at the corner of the mouth the locks cross. Lit
to far side as far from the reference as before. The short beard and stubble as they were; every man the
same beard. One man's mouth was measured against (the ring was read off renders of 940021), and the
locks' mouth is the same for every man. All measures PLACEHOLDER, by eye.

**The mouth between nose and chin where a real one lies (round 92).** After six rounds on hair and beards the
faces were held beside the reference's again, large, from the front and from the side
(`runde92_mund_vorher_nachher.png`, upper row). A grown woman's mouth lay right under her nose over a long,
heavy chin: from the front a third more chin than face above it would bear, from the side a muzzle. The
survey's measures (round 69) did not show it: face length, the nose's length and the lips are at its means.
It has no measure for where the mouth lies between them.

Measured on the morphed head (`measure::lower_face`: heights along the upright line of a bust leaning as the
dress table leans it; 120 people each): of the height from the nose's foot (subnasale) to the chin's lowest
point (menton), the upper lip, down to the line where the lips meet, took

| | upper lip, mm | lower lip and chin, mm | the upper lip's share (SD) | after: mm | after: share (SD) |
|---|---|---|---|---|---|
| women of 24, 35, 50 | 13.9 | 50.3 | 0.216 (0.037) | 19.9 / 44.3 | 0.310 (0.000) |
| men of 24, 35, 50 | 19.0 | 52.3 | 0.266 (0.030) | 22.2 / 49.1 | 0.311 (0.004) |
| women of 68 | 12.8 | 52.9 | 0.194 | 20.4 / 45.4 | 0.310 |
| men of 68 | 17.8 | 50.0 | 0.262 | 21.1 / 46.7 | 0.311 |
| girls of 17 | 14.1 | 49.7 | 0.220 | 19.8 / 44.1 | 0.310 |
| boys of 17 | 19.2 | 53.5 | 0.264 | 22.6 / 50.1 | 0.311 |
| girls of 13 | 14.4 | 45.1 | 0.241 | 18.4 / 41.0 | 0.310 |
| boys of 13 | 18.2 | 45.8 | 0.284 | 20.1 / 44.0 | 0.314 |
| girls of 8 | 14.7 | 36.0 | 0.289 | 15.9 / 34.7 | 0.315 |
| boys of 8 | 16.4 | 37.5 | 0.304 | 17.2 / 36.7 | 0.319 |
| girls of 5 | 14.6 | 31.9 | 0.313 | 15.0 / 31.5 | 0.322 |
| boys of 5 | 15.6 | 33.2 | 0.319 | 15.8 / 32.9 | 0.325 |
| girls of 2 | 14.3 | 28.3 | 0.336 | 14.4 / 28.3 | 0.337 |
| boys of 2 | 14.9 | 29.3 | 0.337 | 14.9 / 29.2 | 0.337 |

Real faces: 0.295 (women) and 0.301 (men) with the lips at rest and 3.3 and 2.4 mm apart (Arnett and others
1999, the table of facial lengths: upper lip 21.0 of 71.1 mm and 24.4 of 81.1; the paper round 74 took the
profile from), 0.313 and 0.307 with the lips closed (Farkas, Katic, Hreczko, Deutsch & Munro 1984: 20.1 of
64.3 mm and 22.3 of 72.6; not read itself, its means as Woelfel, Igarashi & Dong 2014 cite them). MakeHuman's
base head has 0.295. A woman's upper lip was 6 mm too short and her chin as much too long; a man's 3 mm.

The cause, found as round 77 found the cheek's (every `add` of `morph.rs` traced for 60 women and 60 men, and
each target's share in the two heights summed): `rest` gives a woman's face the survey's length with
`chin/chin-height-incr` (0.3 and the genes: 8.6 mm more chin under the mouth) and its nose's length with
`nose/nose-scale-vert-incr` (0.4 and the genes: the nose's foot 2.4 mm lower, the upper lip as much shorter). Nose's foot and
chin moved away from a mouth that stayed where it was. Age adds to it (the nose grows down).

What was weighed: MakeHuman's own `mouth/mouth-trans-down` moves the lips 8.8 mm at weight 1 and the nose's
foot 4.8 mm with them, so that the nose would have to be shortened again with `nose-scale-vert-decr`, which
lifts the nose's wings more than its foot (another nose); and it takes the lips' whole way out of the 9 mm
under the lower lip. Making the face longer with `head-scale-vert-incr` in place of nose and chin keeps the
mouth's place but needs three large weights against each other and makes the whole skull higher (hair, veil).
Built instead: the mouth is set, as round 74 set the pupil between the lids. `morph.rs` `mouth_set`: after
the lips are closed, the mouth of a head whose upper lip takes less than the dress table's `mouth_at` (0.31)
is moved down to it; a mouth that lies lower stays. The lips move as they are, with their corners (`MOUTH_FIELD`,
`mouth_field`: on the base head in full where the lips' red lies, nothing at the nose's foot and above, nothing
at the chin's lowest point and below, fading out sideways from 2.8 to 5.5 cm): the skin between nose and lip
is drawn out, the chin's pressed together, nose and chin stay. Beards, bound to the skin, go with it. Roman
portraits have no table and are untouched.

All of the survey's measures and the lips' red are what they were (`face_measure`: from the mouth's line to
the chin 47.6 mm on women where it was 52.9, 52.3 on men where it was 55.2; nothing else moved). Of the
sample's 35 portraits 25 changed, in 0.3 to 6.2 % of their pixels by more than 8 of 255 in a channel: everyone
from 13 on but a boy of 13 and a man of 24 whose mouths lay low enough, two children of 8 and one small child.
Seven are the same pixel for pixel (those two and five small children), three within less than 0.05 % of
their pixels (two children of 8, a small child). The Roman pictures are the same pixel for pixel.

Tests: `portrait/tests/faces.rs`, `the_mouth_of_england_lies_between_nose_and_chin_where_a_real_one_lies` (60
women and 60 men of 24 to 68: without the table's share, `morph_test_mouth(.., 0.0)`, the women's mean is
under 0.24 and the men's under 0.285; with it everyone lies at it, or lower where the mouth lay lower, and
the height from nose's foot to chin is the same to 0.01 mm; 40 children of 2 and 5 move by less than 0.01 in
the mean; every vertex of the lips' red goes the whole way, nose's foot, chin and nose's root none; the
lips' red is as high as before). Pictures: `runde92_mund_vorher_nachher.png` (a girl of 17 from the front, as
the panel turns her and from the side, and a woman of 35; before above),
`runde92_gesichter_vorher_nachher.png` (seven women and five men as the panel shows them, before above),
`runde92_stichprobe.png`.
Still open: everyone grown has the same share, where real faces differ (no spread was read; ours had 0.03 to
0.04, which was the fault's own). The source for closed lips is cited through another paper. Children's
mouths were not held against children's measures. The dark dent beside the chin on the lit side, the broad
flat chin of the women and the pale patch beside the nose are as they were. The moustache's locks are drawn
out with the skin under them (3 mm on a man). 0.31 lies between two readings: no PLACEHOLDER, but one
number for both sexes and all ages.

**The jaw without a dent beside the chin (round 93).** Round 92 left "the dark dent beside the chin on the lit
side" open. Held large (896 by 1120), every grown face had it: on the jaw's lower edge, two to four centimetres
beside the chin's middle, a dark patch with a bump behind it, and the chin as a block set under the face
(`runde93_kinn_vorher_nachher.png`, upper row).

Light or form: the same heads drawn without shadows, with the key light alone, without it, and without the
pores, and the dent is in every one of them. It is form. A head written out (`face_measure --dump`) and drawn
as grey clay shows a groove from under the mouth's corner down to the jaw's edge (`runde93_kinn_ton.png`, left).

The cause, found by leaving targets out: the targets a girl of 17 is made of were listed (99 of them) and her
head summed again without one group at a time. Without MakeHuman's macro targets, without those of the cheeks,
the mouth or the head the groove stays; without the chin's the jaw is smooth; and of the chin's ten it is one,
`chin/chin-jaw-drop-decr`. That target stood in the dress table's `rest` at 0.6 for both sexes since round 50,
entered there as "the jaw closing the mouth". It moves no jaw and no lip. It moves 25 vertices of skin on each
side of the chin, 22 to 46 mm from the middle and 6 to 29 mm above the chin's lowest point on the base head,
upward by up to 4.2 mm; none of them is a landmark of the face, none is lip. MakeHuman's name means the soft
tissue on the jaw's edge, which hangs (`-incr`, a jowl) or is lifted (`-decr`). At 0.6 the skin there was
lifted by 2.5 mm, and since it faces down and outward that is 1.8 mm into the surface: a dent beside the chin
on everyone. The mouth is closed by its own rule (`mouth_shut`, as far as it stands open), which the row never
helped.

The row is gone. That left the person's own gene of the chin's height, which asks for the same target on a
short chin (up to 0.27 of it, 1.1 mm): with the row gone a girl of 13 with 0.15 of it still had a faint shade
where the dent had been. England's heads now take nothing of `-decr`, whoever asks (`DressSet::without`); the
jowl that hangs on a long chin (`-incr`) stays the person's own. The skin beside the chin at the vertex both
targets move most, upward, 120 people each, mm:

| | before: mean (from, to) | the row gone, the gene left | now |
|---|---|---|---|
| the grown of 24 to 68, and of 17 | 2.39 (1.19, 3.47) | -0.13 (-1.33, 0.95) | -0.33 (-1.33, 0.00) |
| children of 13 | 2.22 (1.10, 3.35) | -0.12 (-1.29, 0.92) | -0.31 (-1.29, 0.00) |
| children of 8 | 1.54 (0.75, 2.35) | -0.09 (-0.91, 0.65) | -0.22 (-0.91, 0.00) |
| children of 5 | 1.11 (0.55, 1.67) | -0.06 (-0.65, 0.46) | -0.16 (-0.65, 0.00) |
| children of 2 | 0.86 (0.42, 1.25) | -0.05 (-0.49, 0.35) | -0.12 (-0.49, 0.00) |

No landmark is moved, so every measure of the survey, the lips' red and the mouth's place are what they were
(`face_measure`, 200 grown of each sex, with the row and without: the same to the last digit printed). All 35
portraits of the sample changed, each in 0.05 to 0.54 % of its pixels by more than 8 of 255 in a channel: the
two patches beside the chin. The Roman pictures are the same pixel for pixel (a head without a dress table
has no `rest` and no `without`).

A measure of the dent itself was looked for and not found, which is why the test holds the cause. Tried on the
heads before and after the row went: the height of the edge where the skin's normal looks 45 degrees down, on
cuts round the chin (a hump of 5.6 mm on the girl before and 1.3 after, but it jumps on old faces and finds no
edge on some); fixed rows of the mesh along the jaw's edge (no hump: the lift is 1.6 mm on an edge that rises
by 26); the patch against an affine fit of its surroundings (-1.8 mm before, -3.8 after, on a base head that
reads 0 and has no dent); the patch over a membrane spanned by its surroundings (women 3.1 mm before and 4.4
after, men 2.5 and 4.0, the base head 2.9: the two states overlap).

New and kept: `morph_targets` (`morph.rs`) lists the targets a head is made of with their weights, and
`face_measure --made <person>` prints them with how many vertices each moves and how far. Rounds 77, 92 and
this one each built that list by hand to find a cause.

Tests: `portrait/tests/faces.rs`, `the_jaw_of_england_has_no_dent_beside_the_chin`, the fifteenth (what the
target is: 25 vertices a side, 2 to 5 cm from the middle, between chin and mouth, none moved down, none a
landmark or lip, 4.0 to 4.4 mm at most; the table's `rest` names neither of the two targets and its `without`
names the lifting one; of 120 grown and 120 children no head has any of it, and between a quarter and three
quarters of them have a jowl, of less than 1.6 mm). With the row, or without the table's `without`, it fails.
Pictures: `runde93_kinn_vorher_nachher.png` (three women of 17, 35 and 50 and three men of 17, 35 and 24, the
lower face; before above), `runde93_kinn_ton.png` (the girl's head as clay, with the row and without),
`runde93_stichprobe.png`.
Still open: half of the people now have the base head's jaw edge exactly and the other half a jowl of up to
1.3 mm; real jaws differ both ways, and no measured outline of one was read (the list is by eye, PLACEHOLDER).
Age draws its jowls with the cheek's targets; the target made for them (`-incr`) is not used for age. A speck
of three pixels of lit skin on the shaded side of the chin, at this size only, is not explained. The pale
stripe beside the nose on the far cheek, the women's square jaw and the flat lower lip are as they were.

**A highlight only of a lamp that is seen: the pale patch beside the nose (round 94).** Round 93 left "the pale
stripe beside the nose on the far cheek" open. Held large, every face had it: a pale, bluish grey patch with a
cloudy, wavy edge from the far eye's inner corner down the nose's far flank to the nostril, at the game's size
a whitish smear beside the nose, plainest on children (`runde94_nase_vorher_nachher.png`, upper row). Round 85
had read it as the rim light's gloss and moved the rim behind the plane of the cheek; a patch stayed (of the
field between the nose and the far eye grey on children 8.3 %, the reference's woman 6.2 %).

Which light: four heads drawn large with one thing changed at a time. Without the pores the patch is the same;
without the fill it is the same; without the rim light it is gone and the far side of the face is skin in
shade. With no shadow of the rim it is a broad band, with the rim's shadow full (1 in place of 0.5) a narrow
streak along the nose's flank. So it is the rim light's highlight, and most of it lies where the rim light's
own shadow lies: on skin that faces the lamp behind the head but has the cheek or the head between itself and
the lamp.

The cause is the half shadow of round 83 (`rimShadow` 0.5). It lets half of the rim light through the head,
to stand for light the stage does not have: what the lit far cheek throws back at the nose, and what goes
through the nose. three.js darkens a light's highlight by the same share as the light. But a highlight is the
lamp itself, seen in the skin, and from a place in the lamp's shadow the lamp is not seen: light that comes
back off a cheek has no highlight where the lamp's would be. Where a lamp skims the skin and the eye looks
along it from the other side, a highlight is at its strongest, so half of it was a pale patch, and its edge
was the edge of the head's shadow thrown along a surface it skims: cloudy and bent.

Now the skin's highlight takes each light's shadow whole, and the light keeps what the profile's shadow lets
through (`materials.ts` `hidden`: the loop over the lights is the skin's own; of a lamp of which a share is
seen through a shadow of any strength the highlight keeps that share, so a soft edge stays soft). It holds for
the key light too (its shadow is 0.7 strong); there it changes 0.10 to 0.64 % of a picture's pixels by more
than 2 of 255 and none by more than 18 (six people, the rim's shadow full in both): a band on the cheek under
a veil's or a hood's edge. No value of the profile changed.

| grey share of the field between the nose and the far eye | before | now |
|---|---|---|
| children of 2 to 8 (6) | 8.3 % | 1.0 % |
| the young, 13 and 17 (8) | 7.0 % | 4.4 % |
| grown women (8) | 6.3 % | 3.5 % |
| grown men (8) | 7.8 % | 6.3 % |
| the reference's woman | 6.2 % | |

What is left lies where the rim light itself falls: a streak down the nose's far flank, as on the reference's
emperor, and on men the skin between the nose and the far eye. The face against its lit cheek reads as it did
(16 grown, `face_colour.mjs`: far cheek, forehead, lips, chin and eye within 0.1 L; the women's nose's back
0.5 darker). The shade beside the nose is darker, since the patch had been part of its light: women 40.8 L
under the nose's back (before 37.9; the reference's woman 35), men 34.9 (30.4). With the rim's shadow full it
would be 47.5 and 40.6: of the 9.6 L the half shadow gave a woman's nose, 6.7 were light and stay, 2.9 were
highlight and are gone (a man's: 5.7 and 4.5). All 35 portraits of the sample changed, each in 0.18 to 0.91 %
of its pixels by more than 8 of 255. The Roman pictures are the same pixel for pixel (Apoleia's skin keeps
three.js' own loop).

Tried and not kept, to give the shade beside the nose its 3 L back: less of the rim's shadow (0.35 and 0.25:
women 39.6 and 38.9, men 33.1 and 32.1; by a rough reckoning the half let through is already about twice what
a far cheek lit by the rim throws back at the nose's flank, a quarter of the rim's light off the cheek, of
which the flank sees a third); the fill at 0.35 (38.8 and 32.8, but the women's far cheek 22.2 L under the lit
one where the reference's is 27.7, and fill and the light from below together more than a quarter of the key,
which the stage's test forbids).

Tests: `tests/portrait.test.ts`, "the skin of England shows no highlight of a lamp that is hidden" (the skin's
shader has its own loop over the lights and multiplies each light's highlight by what the loop found; the
shader's own line of arithmetic is run in the test: of a lamp seen to 0, a quarter, a half and wholly through
a shadow of the rim's, the key's, full and nearly no strength, the light keeps what the shadow lets through and
the highlight the share seen; hair, beards, cloth and Apoleia's skin are lit as they were). Without the change
it fails. vitest 1072.
Pictures: `runde94_nase_vorher_nachher.png` (boys of 8 and 13, a girl of 8, a woman of 35, men of 17 and 35;
before above), `runde94_nase_gross.png` (a woman of 35 and a man of 17 large, before and after),
`runde94_stichprobe.png`.
Still open: the shade beside a woman's nose is 5.8 L darker than the reference's; the stage has no light that
comes back off skin, and the half shadow that stands for it is by eye (PLACEHOLDER). Hair, beards and cloth
still take the rim's sheen through its half shadow (a white beard's far half, the inside of a hood). The
women's square jaw and the flat lower lip are as they were.

**A jaw that does not shape the skull: the pointed head (round 95).** Round 94 left "the women's square jaw"
open. Measured first (`face_measure --grown`, 150 women and 150 men): the jaw is as broad as the survey's
(women 109.6 mm at the jaw's corners against 110.1, men 120.4 against 120.4), the cheekbones as well (135.1
and 143.1), and the jaw's corner lies 27 mm above and 64 mm behind the chin's lowest point on a woman, its
lower edge rising by 23 degrees as on a man. So it is not the jaw.

Held beside the reference's woman with the veil taken off (`without=veil`), ours had a skull like the point of
an egg: narrow over the ears and narrower upwards, the cheekbones standing out against it, the cheek hollow
under them. A diamond, and that is its name. The gene of the jaw (`look.rs` `FACE_MOD`) asks for MakeHuman's
`head-diamond` on a narrow jaw (2.9 per unit of the gene) and for `head-triangular` on a wide one (1.3). The
dress table shifts a woman's gene towards the narrow jaw (`jaw_women` -0.2, times the faces' gain of 1.6): the
diamond lay on nearly every woman at 0.9, and on every man whose gene is under the middle.

What the two targets are, on MakeHuman's base head (heights over the chin's lowest point; `tests/faces.rs`
prints them with `SHOW=1`): each is a jaw and a skull with next to nothing between.

| | under the cheekbones (to 93 mm) | 93 to 116 mm | above the root of the nose |
|---|---|---|---|
| `head-diamond` moves a vertex by at most | 7.2 mm | 4.4 mm | 22.4 mm |
| `head-triangular` | 13.0 mm | 0.9 mm | 13.4 mm |

The diamond narrows the head's outline by 2 to 5 mm a side at the jaw, and over the ears by 2 mm, 4 cm higher
by 11 mm and 7 cm higher by 15 mm a side. The triangular head widens the jaw by 8 to 15 mm a side and narrows
the skull by up to 12. Apoleia draws heads so, to be told apart at the size of a coin; in the real look it is
a head no one has.

Now England's heads take of these two targets the part under the cheekbones only (`DressSet::lower_only`;
`morph.rs` `lower_band`, `lower_share`: whole up to the lowest of the cheekbones' landmarks, nothing from the
root of the nose up, a smooth step between). Nothing was fitted. The survey has the head's breadth over the
ears and its length (Zhuang & Bradtmiller 2005, table VI, read in this round from the same copy: head breadth
153.0 mm, SD 6.0, for men and 146.8, SD 5.6, for women; head length 197.3, SD 7.4, and 187.5, SD 7.2); both
are measured now (`measure.rs` `SKULL`, `GLABELLA`, `BACK`) and held by the test of round 69.

| mean of the grown, mm | before | now | the survey (SD) |
|---|---|---|---|
| head breadth over the ears, women | 140.6 | 144.5 | 146.8 (5.6) |
| the same, men | 150.1 | 152.4 | 153.0 (6.0) |
| 4 cm above the widest place, women (60) | 115.8 | 134.4 | |
| the same, men (60) | 128.0 | 139.4 | |
| 5.5 cm above it, women | 99.4 | 121.1 | |
| the same, men | 114.3 | 127.2 | |
| breadth at the jaw's corners, women and men | 109.6, 120.4 | 109.6, 120.4 | 110.1 (8.9), 120.4 (10.4) |
| head length, women | 187.4 | 187.4 | 187.5 (7.2) |
| the same, men | 204.2 | 197.2 | 197.3 (7.4) |

A woman's head was 1.1 standard deviations narrower than the survey's and is 0.4 narrower now; 4 cm higher it
gained 19 mm in the mean and up to 29 on one head, and the spread there halved (SD 10.3 to 5.7): the skull no
longer goes with the jaw. The men's heads were 7 mm longer than the survey's (0.9 SD), which the new measure
showed: MakeHuman's man. Men now take `head-back-scale-depth-decr` at 0.28 (`rest`), which moves the back of
the head and no landmark of the face. Where on a head the 7 mm are too many the survey does not say; they are
taken from the part no portrait shows.

Seen (`runde95_schaedel_vorher_nachher.png`): the hair of a girl with plaits, a veil and a bald man's head
are round where they rose to a point; the face under them reads broader at the forehead and no longer as a
diamond. All 35 portraits of the sample changed, each in 0.5 to 7.7 % of its pixels by more than 8 of 255;
nothing comes through hair, veil or hood. Apoleia's heads keep both targets whole: Roman bytes and pictures
unchanged.

The lower face is as it was, and beside the reference's women it is still lean: theirs are full at the
mouth's height with a small round chin, ours narrow there with a broad, flat chin whose corners show. Tried as
portraits on six women and not kept (`runde95_untergesicht_varianten.png`): MakeHuman's inverted triangle at
0.6 (the chin narrower and more pointed, the face longer and leaner still); `chin-width-decr` 0.6 more (the
chin a little narrower, its corners stay); `cheek-volume-incr` 0.6 (a pouch on the far cheek over a narrow
jaw). None is nearer the reference, and no measure says how full a real cheek is there. The survey has one:
the arcs from ear to ear over the chin, under the nose, over the forehead and over the crown (bitragion chin
arc 303.9 mm, SD 14.9, on women and 331.2, SD 15.5, on men). They start at the tragion, which is not placed
on this head yet.

Tests: `tests/faces.rs`, a sixteenth, "the gene of the jaw of England moves the jaw and not the skull" (what
the two targets move under, in and over the band; the same 40 people with the gene at either end: no vertex
from the root of the nose up moves, the head's breadth is the same, the jaw 16 mm broader at least; without a
table the skull moves by 12 mm at least). The test of round 69 now holds the head's breadth and length as
well: with the heads of round 94 it fails on both. `lib.rs`: the names in `without` and `lower_only` are
targets the head has. cargo 26/16/6/2/2, vitest 1072.
Pictures: `runde95_schaedel_vorher_nachher.png` (girls of 13 and 17, a woman of 35, two bald men of 50, a
child of 5; before above), `runde95_untergesicht_varianten.png` (a woman of 17 and a woman of 24 without her
veil: now, inverted triangle, narrower chin, fuller cheeks), `runde95_stichprobe.png`.
Still open: the lean lower face and the broad chin (next: the arcs, for which the tragion has to be found);
the pad of the far cheekbone; the head's height and the forehead's breadth are not held against the survey
(no height read; the landmark of the minimum frontal breadth, 102.9 mm on women, is not placed); MakeHuman's
`head-square` and `head-oval` (gene of the head's form, men's `rest`) move the skull as well and were not
looked at; the flat lower lip.

**How full a face is, measured; and a woman's jaw that runs in to her chin (round 96).** Round 95 left the
lower face lean beside the reference and no measure to say so. The survey has one (Zhuang & Bradtmiller 2005,
table VI, the same copy): four arcs, a tape from the notch over one ear's flap (tragion) to the other's, over
the chin, under the nose, over the forehead and over the crown. Three landmarks were placed for them
(`measure.rs`): `TRAGION` (by eye on a drawing of the mesh, to about 3 mm), `CHIN` (the survey's report names
it: "the most protruding point on the bottom edge of the chin, along the jawline"; 4 mm over the chin's lowest
point and 13 mm before it) and `FOREHEAD` (35 mm over the root of the nose, about 1 cm over the brows' ridge;
where the survey laid this tape its report's text, cut off in the copy read, did not give: by the usage of
the army's surveys, from memory, PLACEHOLDER). `arcs` cuts the skin with the plane through the three points
(over the crown: the upright plane through both ears), leaves the ears' own vertices out, takes the cut's
convex hull, as a tape lies taut over hollows, and gives the hull's length less the straight line between the
ears.

What the landmarks' places are worth: the ear's point 1 mm further back makes the three front arcs 1.5 to
2 mm longer; 1 mm higher, the chin's arc 1.3 mm longer, the one under the nose 0.7, the forehead's 0.6
shorter and the crown's 1.6 shorter. From any of the 11 vertices within 3 mm of it the arcs change by up to
5.2, 5.5, 5.4 and 6.6 mm (the test), under half a standard deviation. Over the chin's foremost point in place
of the survey's point the chin's arc is 5.5 mm (women) and 7 mm (men) shorter. The forehead's arc grows by
0.5 mm per mm the point is put higher.

| arc from ear to ear, mean of 200 grown men and 200 grown women, mm | men | the survey (SD) | SDs off | women | the survey (SD) | SDs off | women of men, ours and the survey's |
|---|---|---|---|---|---|---|---|
| over the chin | 326.8 | 331.2 (15.5) | -0.3 | 294.8 | 303.9 (14.9) | -0.6 | 0.902, 0.918 |
| under the nose | 291.6 | 294.8 (13.2) | -0.2 | 267.5 | 277.5 (13.1) | -0.8 | 0.917, 0.941 |
| over the forehead | 309.0 | 304.1 (13.0) | +0.4 | 285.1 | 287.4 (11.9) | -0.2 | 0.923, 0.945 |
| over the crown | 346.4 | 350.7 (13.9) | -0.3 | 324.1 | 339.3 (15.0) | -1.0 | 0.936, 0.967 |

The men lie at the survey's. The women's faces are leaner than its women's: 9 mm of tape are missing over the
chin and 10 under the nose, which says in numbers what the eye saw beside the reference. Two things the
numbers do not settle. The survey's people are workers of the United States of 2003, heavier than people of
the fourteenth century, and soft arcs grow with weight; how much of the gap that is, no source read says.
And over the crown the survey's tape lies on hair, a woman's more than a man's; ours lies on the skin. With
round 95's shapes the women's four arcs were 294.7, 266.9, 284.4 and 323.9 mm: what follows below changed
the chin and left the arcs where they were.

**Fuller cheeks, tried and not kept.** Twelve variants of the women's `rest` were rendered on six women (two
of them without the veil) and held beside the reference; none was kept
(`runde96_wangen_varianten.png` shows four of them between round 95 and now). `cheek-volume-incr` 0.4 (a
pouch at the nose's height, the far cheek's pad 1.7 mm); the same at 0.3 with `head-fat-incr` 0.15; at 0.3
with `cheek-bones-incr` 0.2 and `chin-prominent-incr` 0.15; at 0.5 with `cheek-bones-decr` 0.3 (the pouch
stays); the same with `head-square` 0.15 and `laugh-lines-out` 0.5 (ages the face); `head-fat-incr` 0.25 (a
pouch, the pad 1.3 mm, the jaw 5.4 mm broader); the same with the gene of the jaw shifted further to the
narrow side, by -0.35, and at 0.4 with -0.45; the gene not shifted at all (a heavier, squarer jaw, 115.5 mm);
that with `chin-width-decr` 0.5 and `chin-bones-decr` 0.3; `cheek-inner-incr` 0.8 (a swollen ridge beside
the nose); the same at 1.0 with `cheek-volume-incr` 0.2. The reason is the same each time: the outline of a
woman's far cheek has its widest place at a soft pad at the nose's height, and whatever MakeHuman adds under
the cheekbone stands out there as a lump (round 77 found the same for `cheek-bones-incr`). Other things
learned on the way: the weight macros (`universal-*-maxweight`) move nothing of the face in this head file;
`head-scale-depth-incr` lengthens all front arcs (15 to 21 mm per unit) by lengthening the head (21.8 mm);
`chin-prominent-incr` gives the chin's arc 12.9 mm per unit, but the chin's place is held by the profile of
round 74. So the women's lean cheeks stay open: no target of MakeHuman's fills them, it would take a shape of
our own.

**The broad flat chin.** It is not the light: with the bounce light off (`lights.bounce.energy:0`) and the
sky at a tenth the chin's lower edge is the same flat line; and not the camera, which stands 2.57 picture
heights away. It is the shape. A new measure, `jaw_front`: the breadth of the jaw's front (what lies less
than 10 cm behind the chin) at a height over the chin's lowest point. On 200 grown women and 200 grown men:

| mm over the chin's lowest point | 3 | 5 | 7 | 9 | 11 | 15 | 19 | 25 | 31 | 39 |
|---|---|---|---|---|---|---|---|---|---|---|
| men, mm | 48.1 | 54.8 | 61.0 | 65.0 | 68.1 | 74.0 | 77.8 | 81.3 | 84.6 | 87.7 |
| women until round 95 | 47.6 | 56.9 | 61.1 | 64.6 | 67.7 | 72.4 | 75.4 | 79.6 | 84.1 | 89.9 |
| as a share of men | 0.99 | 1.04 | 1.00 | 0.99 | 0.99 | 0.98 | 0.97 | 0.98 | 0.99 | 1.03 |
| women now | 47.9 | 52.7 | 56.4 | 59.3 | 62.0 | 66.0 | 69.2 | 73.9 | 78.8 | 86.0 |
| as a share of men | 1.00 | 0.96 | 0.92 | 0.91 | 0.91 | 0.89 | 0.89 | 0.91 | 0.93 | 0.98 |

Every breadth the survey has is 4 to 9 % smaller on a woman; from her chin to her mouth a woman of England
was as broad as a man, under a face 8 % shorter. The cause: the table shifted a woman's gene of the jaw
towards MakeHuman's diamond (`jaw_women`, on nearly every woman at 0.9), and the diamond's lower part narrows
the cheeks at the mouth's height and hardly the chin. Now the gene is not shifted (the field is gone, and
half the women have the wide side of the gene again), and the women's `rest` holds MakeHuman's
`head-invertedtriangular` at 1.0, of which England's heads take the part under the cheekbones
(`DressSet::lower_only`, as of the two heads of round 95). Whole, that target is a head broad above and
narrow below: it moves a vertex by up to 8.0 mm under the cheekbones, 5.9 mm in the band up to the root of
the nose and 4.8 mm above, and would widen the skull's and the cheekbones' landmarks by 3.8 and 4.4 mm a
side. Its lower part is a jaw that runs in to the chin.

That a woman's jaw does so is anatomy's common knowledge; no measured outline of a chin was read. The weight
of 1 is held by what the survey has, the breadth at the jaw's corners: 110.5 mm (the survey's 110.1; 109.9
before), with a spread of 8.0 (6.5 before, the survey's 8.9). That the chin is the place the breadth had to
come from is by eye beside the reference: PLACEHOLDER. What else it moved, all of the survey's measures on
the same 400 (in the survey's standard deviations, men and women): face length +0.0 and +0.1 (a woman's
0.8 mm longer than before), root of the nose to under the nose +0.2 and +0.3, cheekbones -0.0 and +0.1
(0.4 mm broader), jaw's corners +0.1 and +0.0, pupils -0.0 and -0.1, nose breadth +0.2 and +0.3 (0.6 mm
broader), nose protrusion +0.1 and +0.2, lip length -0.4 and -0.4, head breadth -0.0 and -0.4, head length
+0.0 and +0.0. The target draws the mouth's corners in by 4.2 mm; the women's row of the mouth's breadth
went from 0.4 to 0.85 and holds the lips' length at 46.5 mm (46.4 before). The far cheek's pad on women is
0.5 mm (0.7 before). A small child of either sex has a third of the women's `rest`, as before, and so of
this; a girl grows into it (0.96 at 13), a boy out of it (0.14 at 13, none at 17).

Seen (`runde96_kinn_vorher_nachher.png`, `runde96_frauen_vorher_nachher.png`, `runde96_ohne_schleier.png`):
the chin is narrower and round where it was a flat line with two corners, and the jaw's edge runs to it in
one line. All women and girls of the sample changed, in 3.9 to 7.5 % of the pixels by more than 8 of 255,
small children in 1.3 to 2.7 %, boys of 8 and 13 in 0.2 to 1.6 %, no man of 17 or older in any. Girls, old
women under the wimple and small children were looked at one by one: sound. Honest about the rest: at the
mouth's height the far outline is 2 to 3 mm narrower than before, so the face is a little leaner still, not
fuller; the mouth reads wide beside the narrower chin; on one of the six women a small notch shows in the
chin's lower edge. Beside the reference's woman the chin is nearer, the cheeks are not. Apoleia's heads are
untouched: Roman bytes and pictures unchanged.

**The neck,** measured in passing with a tool that is not kept and changed in nothing: the smallest loop
round the neck is 287.7 mm on the women and 365.4 on the men, where the survey has 339.5 (SD 30.9) and 406.7
(32.6): 1.7 and 1.3 standard deviations thin. The survey measured at the larynx, on heavier people. Open.

Tests: `tests/faces.rs`, 18 now. "A tape from ear to ear of England is about as long as on real heads" (the
men's four arcs within half a standard deviation; the women's over the forehead too, over the chin no more
than 0.8 short, under the nose 1.0, over the crown 1.2: the open gap, held so that it does not grow; the
ear's landmark moved to each vertex within 3 mm changes no arc by 7 mm). "A woman of England has a jaw that
runs in to her chin" (5 mm over the chin's lowest point under 0.98 of a man's, from 9 to 19 mm between 0.86
and 0.95; every grown woman has the target at 1 and no man any; children as above; the part taken moves no
landmark of the skull, the lowest of the cheekbones' by 1.6 mm a side and the breadth over the cheekbones by
under 1 mm; taken off again, the jaw's front is 12 mm broader 9 mm over the chin). The test of round 95 now
holds three heads in `lower_only`. `examples/face_measure.rs` prints the four arcs and the jaw's front after
the far cheek's two measures. cargo 26/18/6/2/2, vitest 1072.
Pictures: `runde96_kinn_vorher_nachher.png` (mouth and chin of four women: the reference, round 95, now),
`runde96_frauen_vorher_nachher.png` (six women, before above), `runde96_ohne_schleier.png` (the reference's
woman, two of ours without the veil before and now), `runde96_wangen_varianten.png` (one woman: round 95,
cheek volume 0.4, head fat 0.25, inner cheek 0.8, the gene not shifted, now), `runde96_stichprobe.png`.
Still open: the women's lean cheeks (the arcs under the nose and over the chin; a shape of our own in place
of MakeHuman's targets); the ear's landmark, placed by eye (no second survey's distances from the ear could
be read: Farkas' depths and the 3D Facial Norms tables were not reachable); the crown's arc under hair; the
thin necks; the forehead's least breadth (102.9 mm on women, 105.5 on men) and the head's height, not held;
the chin's breadth by eye; the wide mouth beside the chin; the flat lower lip; `head-square` and `head-oval`
still move the skull.

**A woman's cheek that keeps its breadth to the mouth: a shape of our own (round 97).** Round 96 left the
women's cheeks lean and found no target of MakeHuman's that fills them. This round first reads again what was
measured, then says where the cheek is lean, and fills it there.

*The arcs, read again.* Round 96 said "the women's faces are leaner than the survey's women's" from the raw
gaps (9 mm over the chin, 10 under the nose). Within each sex the picture is another. An arc as a share of
the forehead's arc of the same heads: over the chin the survey has 1.089 on men and 1.057 on women, ours
1.058 and 1.034; under the nose the survey 0.969 and 0.966, ours 0.944 and 0.938. By that the men's lower
arcs are as short as the women's. And a woman's arc as a share of a man's is low on all four arcs, the
forehead's (0.923, the survey 0.945) and the crown's (0.936, 0.967) too, where no cheek lies: that points to
the size of the women's heads (their breadth is 0.4 standard deviations small) and to the ear's landmark,
not to the cheeks alone. So the arcs do not single out a woman's cheeks. What does is the eye, and a line
that can be measured.

*The line.* As a picture shows a head of England, turned by 0.24, the cheek turned away from the viewer is
an outline. `measure.rs` `far_outline` gives it every 2 mm from under the lower lid (how far the skin
reaches towards the picture's edge), and `far_at_mouth` how far it has run in at the height of the mouth's
line, from where it stood 10 mm under the lid. The same line was traced on the reference's woman (one
screenshot, the skin's edge found from outside in; from her lower lid to her chin 77 pixels, taken as
106 mm, so a pixel is 1.4 mm; how far her head is turned is not known):

| mm under the lower lid | 18 | 26 | 34 | 42 | 50 | 58 | 66 | 74 | 82 |
|---|---|---|---|---|---|---|---|---|---|
| the reference's woman, mm from her outline's top | | 0.0 | -0.8 | -1.9 | -3.3 | -6.2 | -9.2 | -12.9 | -17.2 |
| 24 grown women until round 96 | -0.2 | -1.4 | -3.6 | -6.6 | -9.6 | -12.3 | -15.0 | -18.0 | -21.2 |
| the same women now | -0.2 | -0.7 | -1.2 | -2.3 | -4.0 | -6.8 | -10.7 | -15.1 | -19.3 |

Hers is a bow: it keeps its breadth down to the mouth and turns in under it. Ours was a straight line from
the cheekbone to the chin, a V, under cheekbones that stood out: that is what read as lean. On 200 grown
women the outline lay 13.3 mm inside its top at the mouth's height, on hers about 6. (A man's lies 12.3 mm
in, with a dent of 3.6 mm under the cheekbone's pad; men were not looked at this round.)

*What MakeHuman's targets do there.* The part under the cheekbones of each, at weight 1, on those 24 women
(the outline in mm at 26, 50 and 74 mm under the lid; then the survey's two breadths and what else moves):

| target | outline at 26, 50, 74 | cheekbones | jaw's corners | else |
|---|---|---|---|---|
| `head-round` | +7.6, +5.4, +3.7 | +20.0 | +13.5 | the far cheek's pad +3.5 |
| `head-oval` | +7.1, +3.0, +1.6 | +18.6 | +8.2 | the pad +3.5 |
| `head-fat-incr` | +7.0, +11.6, +12.9 | +1.9 | +21.4 | the jaw's front at 5 mm +13.8, the pad +4.1 |
| `head-square` | 0.0, +3.9, +9.5 | 0.0 | +13.3 | the jaw's front +10.9 |
| `head-rectangular` | 0.0, +2.9, +7.4 | 0.0 | +7.6 | the jaw's front +10.6 |
| `head-triangular` | +1.1, +9.4, +12.7 | +0.8 | +22.7 | the jaw's front +10.8 |
| `head-invertedtriangular` | -0.2, -2.0, -3.5 | +3.0 | -5.0 | the jaw's front -11.5 (round 96's chin) |
| `head-diamond` | 0.0, -2.1, -5.0 | 0.0 | -7.0 | the jaw's front -7.6 |
| `cheek-volume-incr` | +5.3, +8.4, +1.7 | 0.0 | +5.6 | the pad +3.9, the arc under the nose +14.3 |
| `cheek-trans-down` | +0.5, +0.2, 0.0 | 0.0 | 0.0 | |
| `cheek-inner-incr` | 0.0, 0.0, 0.0 | 0.0 | 0.0 | the arc under the nose +3.0 |

Each that fills the cheek at the mouth's height widens the cheekbones or the jaw's corners, both at the
survey's, broadens the chin that round 96 narrowed, or lays the pad on the cheek at the nose's height that
round 96's twelve variants showed. None is a cheek.

*The shape.* `morph.rs` `cheek_fill`, after the targets: the skin between the cheekbone and the jaw moves
out along the base head's normal, by a number of millimetres where the field is whole
(`DressSet::cheek_fill`, women and men; England 6 and 0). The field (`CHEEK_FIELD`, `cheek_field_at`) is
laid on MakeHuman's base head in millimetres from the chin's lowest point: in height nothing from 88 mm up
(the lowest of the cheekbones' landmarks lies at 90), all at 52, nothing from 17 down; in depth nothing
further back than 43 mm behind that point (the foremost of the jaw's landmarks lies 43.7 behind), all from
28 to 6 behind, nothing from 7 in front (where the lips' red begins); and only skin whose normal points to
the side by more than 0.2 takes part, wholly from 0.5, so that the front of the face and what lies inside
the mouth stay. The same on both sides. Cloth, veil, wimple and hair are bound to the morphed skin and go
with it. A small child has a third of the women's, as of the women's `rest`; a girl grows into it, a boy
out of it (`cheek_fill_of`).

Rendered on six women, two of them without the veil, beside the reference: 4 mm with the field's peak at
54 mm and its foot at 22; 6 mm the same; 6 mm with 50 and 12; 6 mm with 52 and 17. The last was kept, by
eye beside the reference and by its outline beside the traced one; at the size of a portrait the four are
near each other (`runde97_varianten.png`). That field first reached from 46 mm behind the chin to 14 in
front. The test then found that it took one of the jaw's landmarks along by a hundredth of the way and the
lips' red by up to 0.115 of it (0.7 mm; the lips' length grew from 46.5 to 47.0 mm), and the picture showed
a fold beside the mouth's corner. With the depths as above no landmark and nothing of the lips' red moves,
and the fold is fainter.

*Numbers,* 200 grown women and 200 grown men, before and now. The far cheek at the mouth's height, inside
its top: women 13.3 to 8.2 mm (SD 3.8), men 12.3 as before. Its pad 0.5 mm (0.5), the dent under it 0.6
(1.0). The arc over the chin 294.8 to 298.3 mm (the survey 303.9; -0.6 to -0.4 standard deviations), under
the nose 267.5 to 270.7 (277.5; -0.8 to -0.5); as a share of a man's 0.902 to 0.913 (the survey 0.918) and
0.917 to 0.928 (0.941). The breadth at the cheekbones 135.4, at the jaw's corners 110.5, the head's breadth
144.4, the face's length 114.1, the nose's breadth 34.2, the lips' length 46.5: all as they were. The jaw's
front 5 mm over the chin 52.7 to 53.0. Men: nothing changed. With the fill at 0 every measure equals round
96's.

What holds the amount: one traced face. The mean outline now lies within 0.7 mm of hers down to 58 mm under
the lid and 1.5 to 2.2 mm inside hers below that. The survey holds it only as a bound (the arcs stay short
of the survey's, a woman's share of a man's stays under the survey's). 6 mm and the field's extents are by
eye: PLACEHOLDER.

Seen (`runde97_frauen_vorher_nachher.png`, `runde97_ohne_schleier.png`): the cheek is full down to the
mouth and the cheekbones no longer stand out over a hollow; the face reads younger and softer. All women and
girls of the sample changed, in 1.7 to 2.9 % of the pixels by more than 8 of 255, small children in 0.5 to
1.2 %, boys of 8 and 13 in 0.1 to 0.4 %, no man of 17 or older in any. Veils and wimples were looked at on
each woman: no skin shows through cloth. Honest about the rest: under the mouth our cheek still runs in
2 mm sooner than hers; a faint fold beside the mouth's corner is left on some women where the filled cheek
meets the mouth, which does not move; the mouth still reads wide; the reference's woman has a rounder,
shorter face than ours as a whole, which no cheek mends. Apoleia's heads are untouched: Roman bytes and
pictures unchanged.

Tests: `tests/faces.rs`, 19 now. "The cheek of a woman of England keeps its breadth to the mouth": the
table fills women's cheeks and not men's; no landmark of the face is in the field and nothing of the lips'
red; every vertex in it lies inside `CHEEK_FIELD` and faces sideways; the two sides are equal; a grown woman
has all of it, a grown man none, a child of 2 a third, a girl of 13 more, a boy of 13 less; on 60 grown
women the far cheek at the mouth's height lies between 6.0 and 9.5 mm inside its top (8.4) and over 12 with
the fill taken off again (13.6), on 60 men over 11 (12.7); the pad is no larger, the dent under 1 mm; the
breadths at the cheekbones and the jaw's corners, the head's breadth, the face's length, the nose's breadth
and the lips' length are the same to a hundredth of a millimetre. `examples/face_measure.rs` prints the far
cheek at the mouth as measure 26. cargo 26/19/6/2/2, vitest 1072.
Pictures: `runde97_frauen_vorher_nachher.png` (six women, before above), `runde97_ohne_schleier.png` (the
reference's woman, two of ours without the veil before and now), `runde97_varianten.png` (one woman: round
96, the four variants, now), `runde97_referenz_umriss.png` (the traced edge on the reference),
`runde97_stichprobe.png`.
Still open: the amount and the field by eye on one face; a man's cheek (its dent of 3.6 mm) not looked at;
the lower cheek 2 mm short of the trace; the fold beside the mouth; the wide mouth; the women's small heads
and the ear's landmark behind the short arcs; the thin necks; the forehead's least breadth and the head's
height, not held; the chin's breadth by eye; the flat lower lip; `head-square` and `head-oval` still move
the skull.

**A woman's neck as thick as a lean woman's (round 98).** Round 96 measured the necks in passing with a tool
that was not kept: thin beside the survey's, the women's most. This round the measure is in the repository,
the question which necks are thin is put to sources on lean people, and the women's neck is made thicker.

*The measure.* `measure.rs` `neck_at`: the smallest loop round the neck. Of all planes that hold the
direction from ear to ear, tilted by 0 to 45 degrees (the front lower than the back) and set from 5 cm under
to 2 cm over the chin's lowest point (on the upright 9 cm behind it), the one whose cut with the skin, the
part of it that goes round that upright, has the shortest taut line (a tape lies taut over hollows); sought
in steps of 3 degrees and 5 mm, then of 1 degree and 1 mm round the best. A tape is laid round a neck just
under the larynx, square to the neck's axis (so the study of lean people below; the survey's own words on
it were not read). The head's net has no larynx. The smallest loop is no longer than the one under the
larynx, so the measure reads a neck as thin as it can be read. On grown heads the loop is found tilted by
20 to 23 degrees, within 3 mm of the height of the chin's lowest point.

*Which necks are thin.* 200 grown women and 200 grown men: 290.5 mm (SD 9.0) and 366.1 (11.2). The survey
(Zhuang & Bradtmiller 2005) has 339.5 (30.9) and 406.7 (32.6): ours 1.6 and 1.2 standard deviations thin.
But the survey's people are of the United States of 2003, and a neck is soft tissue that grows with weight:
370 mm on a man and 340 on a woman part those with a body mass index under 25 from those over (Ben-Noun,
Sohar & Laor 2001, Obesity Research; 460 men and 519 women; the neck goes with the index at r 0.83 and
0.71), so the survey's means are those of people at that border. People who worked the land in the
fourteenth century were lean. Two studies of lean young people: 41 men and 109 women of 18 to 20 with an
index of 21.7 and 21.0 have 355.6 (27.7) and 315.2 (19.6) mm, those of them of normal weight 354.5 and
312.6 (Hingorjo, Qureshi & Mehdi 2012, Journal of the Pakistan Medical Association 62(1)); 60 Japanese
women of 18 to 20 with an index of 20.5 have 316 (20) (Nitta and others 2017, Hiroshima Journal of Medical
Sciences 66(4): 109-115). All three were read as a reading tool's account of the paper's page, not line by
line; the measured data of the army's survey of 1988 (lean people too, with their heads' measures) could
not be fetched (the host is not allowed, the report is a scan without text).

| the neck's loop, mm | men | women | a woman's of a man's |
|---|---|---|---|
| the survey (people of the United States, 2003) | 406.7 (32.6) | 339.5 (30.9) | 0.835 |
| lean young people (Hingorjo and others 2012) | 355.6 (27.7) | 315.2 (19.6) | 0.886 |
| ours until round 97 | 366.1 (11.2) | 290.5 (9.0) | 0.793 |
| ours now | 366.1 (11.2) | 314.3 (9.0) | 0.858 |

A man's neck lies between the lean men's and the survey's: it stays. A woman's was thin by either measure,
1.3 of the lean women's standard deviations under their mean, and thin against the men's: 0.79 of a man's,
under both sources' shares. MakeHuman's young woman has that neck.

*What makes it thicker.* MakeHuman's targets of the neck, each whole and at weight 1 on 24 grown women (mm):

| target | the neck's loop | else |
|---|---|---|
| `neck-scale-horiz-incr` | +29.0 | the jaw's corners +5.7 |
| `neck-scale-depth-incr` | +26.8 | the chin's lowest point 3.8 forward, the face 0.7 shorter |
| `neck-back-scale-depth-incr` | +16.8 | nothing of the face |
| `neck-double-incr` | +8.2 | the chin's lowest point 2.3 lower, the jaw's front -6.0 |
| `neck-scale-vert-decr` | -7.7 | the head 27.7 lower |
| `neck-trans-out`, `-forward`, `-backward`, `-up`, `-down` | -1.3 to +0.0 | |

The first makes the neck broader, the third deeper at the nape. The first also widens the jaw's corners,
which are at the survey's. So a head takes of the table's targets of the neck (`DressSet::neck`) only the
part under the jaw (`morph.rs` `neck_share`, `NECK_UNDER`): whole up to 20 mm over the plane of the smallest
loop, nothing from 40 mm over it; the jaw's landmarks lie 51 mm and more over it. With the band 10 mm lower
the neck got a waist over the part made thicker (the smallest loop moved up by 8 to 16 mm). The gene of the
neck, which uses the first target for thin and thick necks from person to person, is taken whole as before:
nothing changes for men. England's table: `neck-scale-horiz-incr` 0.45 and `neck-back-scale-depth-incr`
0.7 for women, none for men. The two together because the loop then stays as round as it was: 92 mm broad
and 92 deep before, 100 and 100 now (ten women; ten men's 116 and 120); the broader target alone leaves the
depth as it is. A child has none of it and grows into it with `Look::grown` (`neck_of`): MakeHuman's
child keeps a child's neck, for which no measure was read. Girls of the sample: of 2 unchanged (227 mm), of
5 +5 mm (232 and 240), of 8 +12.5 (252 and 255), of 13 +23 (293), of 17 +23.5 (311 and 316).

On the same 400 every other measure is the same to the last digit printed: cheekbones, the jaw's corners,
head breadth and length, the arcs from ear to ear, the lips, the far cheek. The weights are chosen so that
the mean meets the lean women's (314.3 against 315.2 and 316): fitted to a sourced value, not by eye. What
is by eye: that the two targets share the gain as they do (PLACEHOLDER; no measured shape of a neck's
section was read).

Seen (`runde98_hals_vorher_nachher.png`, `runde98_ohne_schleier.png`): the neck no longer reads as a stalk
under the head; its sides run from under the ear down and out to the shoulders. Girls with plaits show it
most; under a veil the throat between the veil's sides is broader, a wimple lies round the thicker neck
without skin showing through. All women and girls from 8 of the sample changed, in 3.5 to 5.5 % of the
pixels by more than 8 of 255, girls of 5 in 0.9 %, girls of 2 in 0.06 %, no boy and no man in any. Honest
about the rest: the nape's gain (a third of it) is not seen in a portrait from the front; the spread of
our necks is small (SD 9 mm, lean people's 20, those of normal weight among them 14): people differ less in
the neck than real people do; a woman's neck is still 0.8 of the survey's standard deviations under the
survey's; the men's were not changed and children's were not held against anything; the smallest loop is a
lower bound of what a tape under the larynx reads. Apoleia's heads are untouched: Roman bytes and pictures
unchanged.

Tests: `tests/faces.rs`, 20 now. "The neck of a woman of England is as thick as a lean woman's": the table
gives women targets of the neck and men none; the landmarks of the jaw's corners, cheekbones, ears and skull
take nothing of them and no landmark is moved (whole, the targets move one by more than 0.5 mm); of each
target more than a third of the vertices are taken whole and not all; a grown woman has all, a man
and a boy none, a girl of 2 under 0.05, of 8 between 0.3 and 0.7, of 13 over 0.8; on 60 grown women the
loop lies within a third of the lean women's standard deviation of their mean (313.8) and more than one
whole deviation under it with the table's neck taken off again (290.0); 60 men's between the lean men's and
the survey's (365.3); a woman's as a share of a man's between the survey's and the lean people's; the
thinnest place stays within 4 mm of where it was; breadths, lengths and the lips' length are the same to a
hundredth of a millimetre and the arcs from ear to ear to half a millimetre. `examples/face_measure.rs`
prints the neck as measure 27. cargo 26/20/6/2/2, vitest 1072.
Pictures: `runde98_hals_vorher_nachher.png` (girls of 5, 8, 13 and 17, women of 24, 50 and 68; before
above), `runde98_ohne_schleier.png` (the reference's woman, two of ours without the veil before and now),
`runde98_stichprobe.png`.
Still open: the spread of the necks; children's necks (a boy of 8 has 280 mm, a girl of 8 253: no source
read); the measure's place against a larynx the net does not have; how the gain is shared between breadth
and nape; and from round 97: the amount of the cheek's fill by eye on one face, a man's cheek, the fold
beside the mouth, the wide mouth, the women's small heads and the ear's landmark behind the short arcs, the
forehead's least breadth and the head's height, the chin's breadth by eye, the flat lower lip,
`head-square` and `head-oval`.

**Lips that lie on each other from corner to corner (round 99).** Open since round 97: the mouth reads
wide. In round 98's sample the small children's mouths read widest: a flat stroke across the face.

*Is the mouth wide?* By the caliper it is not. The corners of a grown woman's mouth lie 46.5 mm apart (SD
3.2; 200 women), the survey's women's 48.0 (4.0); a man's 49.5, the survey's 51.1: both 0.4 standard
deviations narrow. Against the distance between the pupils a woman's mouth is 0.754, the survey's 0.775; on
the reference's woman about 0.78 (corners and pupils read by eye off one screenshot enlarged six times: 39
of its pixels over 50, so not better than to 0.03). For children a source was read (Sforza, Laino,
D'Alessio, Dellavia, Grandi & Ferrario 2007, Angle Orthodontist 77(6): 1026-1033; Italian children measured
in three dimensions, its reference groups; through a reading tool's account of the paper's tables, not line
by line):

| between the mouth's corners, mm | girls | boys | the sample's two girls and two boys |
|---|---|---|---|
| of 4 to 5 (ours of 5) | 36.9 (3.6) | 39.8 (5.0) | 36.6, 35.5 and 36.9, 41.3 |
| of 6 to 7 | 40.9 (4.9) | 41.7 (4.5) | |
| of 8 to 9 (ours of 8) | 42.4 (3.7) | 43.3 (3.8) | 38.9, 37.4 and 40.9, 40.3 |

Ours of five are as broad as the source's, ours of eight 2.4 to 5.0 mm narrower. (The red of both lips of
its children of 4 to 5 is 12.4 and 12.8 mm high, of ours of five 14.6 to 15.4; of 8 to 9 15.1 and 14.1, of
ours 14.6 to 15.9.) Nothing here asks for a narrower mouth, and none was made.

*What made it read wide.* In the picture a mouth was a dark line with a pale line under it, both from
corner to corner, ending in a small hook at each corner: a stroke as long as the mouth and harder than
anything else in the face. Drawn without colour (the dumped head lit from one side, and cuts through the
lips; scratch tools, not in the repository) the cause shows: the lips do not lie on each other. MakeHuman's
closed mouth is a slit between the edges where the lips turn inward, 0.7 mm in the middle of the base head
and 1.0 at its widest; the targets of a face open it beside the middle, and the table's `mouth_shut` (round
53) closes the middle alone, to the base head's own slit. `measure.rs` `seam` (`morph.rs` `seam_gaps`): how
far the upper lip's edge stands over the lower lip's where that is most, read at every point of either edge.

| the slit at its widest, mm | men | women | the sample's children of 2, 5, 8 |
|---|---|---|---|
| MakeHuman's base head | 1.0 | | |
| until round 98 (200 and 200 grown) | 2.1 (0.1) | 1.9 (0.1) | 1.2 to 1.5 |
| now | 0.1 (0.0) | 0.2 (0.0) | 0.3 to 0.4 |

Towards the corners the lower lip's edge also lies behind the upper's (3.3 and 3.5 mm at the corner on the
two women looked at, where their slit is widest too). The strip that closes the slit (real_look.rs) runs
from edge to edge: there it was a ledge up to 2 mm high and 3 deep, facing up and forward into the key
light, in the lips' colour times 1.3. That is the pale line; the hooks were its ends.

*The fix.* `morph.rs` `lips_meet`, after the middle is closed: at each place between the middle of the
mouth and its corner the upper lip's edge comes down and the lower lip's comes up, each by half of what they
stand apart there, and each lip follows its edge with a share that falls from all at the edge to nothing
6 mm from it (`seam_field`, `SEAM_REACH`; PLACEHOLDER: by eye between the edge and the border of the lips'
red, 7 to 9 mm away on the base head). Half each, so that the line between the lips keeps its height (the
mouth's place of round 92 and the heights of the upper and lower red hold). Only heights change; the corners
keep their distance. Where a point lies along the seam is read on the base head, so every head has the same
field: 294 vertices, the same on both sides. A vertex moves by 1.1 mm at the most (48 people of 2 to 68).
After it every point of either edge lies on the middle between the two edges; what is left is what the
straight pieces of one edge (11 points) miss of the other's bends (8 points). A second and a third pass
leave 0.29 and 0.21 mm at the most where one leaves 0.42 (48 people), a sixth 0.09: they draw the two edges
towards a line without bends. One pass is kept. `DressSet::seam_shut`: 1 for England; Apoleia's heads have
no table and stay (Roman bytes and pictures unchanged).

On 200 grown women and 200 grown men each of the 27 measures is the same to the last digit printed.

*The line in the picture* (a scratch tool on the test page's landmarks, 8 grown women and 8 grown men at
896 by 1120: the darkest place on three upright lines through the lips, in the middle and half way to each
corner, in L against the lit cheek):

| the line between the lips, L under the lit cheek | women | men |
|---|---|---|
| until round 98 | 48.3, 48.9, 48.5 | 51.2, 51.6, 53.1 |
| lips on each other, `Lips::seam` 1.3 (kept) | 45.8, 48.0, 47.2 | 51.3, 50.3, 52.5 |
| the same with `seam` 1.0 | 48.1, 49.2, 49.3 | 53.3, 52.4, 53.7 |
| the same with `seam` 1.6 | 43.6, 47.6, 46.8 | 49.8, 49.1, 52.3 |

The reference's woman has 41 to 47 (round 82). The strip's colour stays as it was: with the lips closed
it lightens the upper lip's edge alone, and a woman's line lies at the dark end of the reference's or 1 L
under it (before 1 to 2 L under it).

Seen (`runde99_mund_vorher_nachher.png`, `runde99_form.png`): one clean line where the lips meet; the
double line and the hooks at the corners are gone; the upper lip reads a little fuller, because its
underside no longer ends over a gap. On some mouths a pale hairline is left under the line on the lit side.
It is not the strip: with the lower lip's edge at 0.6 of its colour (tried, not kept) the picture is the
same, so it is the gloss on the lower lip's rim, which a real lower lip has too, broader. At the size of
the game's panel the change is small (`runde99_paare.png`): of each of the sample's 35 pictures 0.14 to
0.42 % of the pixels change by more than 2 of 255.

Honest about the rest. The mouth's form is as it was: a lower lip as full at the corners as in the middle
and a thin upper lip, where the reference's lips are full in the middle and run out to the corners. The
small children's mouths are still a flat stroke with a fold beside each corner (`runde99_stichprobe.png`,
the lowest row): by the numbers above their mouths are not too broad, so the fault lies in the form of
lips and cheeks, and a child's face needs a round of its own, against children's measures (the tables by
age of Kesterke and others 2016, Biology of Sex Differences 7: 23, are in a supplement that was not read).
And seen on the way: in the picture a nose reads narrower than the caliper has it (two women: 30.2 and 39.3
mm between the wings' landmarks, about 23 and 29 between what the eye takes for the wings): the nostrils
show from the front as two dark hooks, and the wings beside them have no groove against the cheek on the
lit side. A narrow-looking nose makes the mouth under it look broad. Not touched.

Tests: `tests/faces.rs`, 21 now. "The lips of England lie on each other from corner to corner": the table
closes all of the slit; the base head's slit is 0.8 to 1.2 mm; the points of the lips' edges go their whole
way, down on the upper lip and up on the lower, and no other landmark of the face goes any of it (the
borders of the lips' red, nose's foot and chin among them); the field is 200 to 400 vertices, as many on
one side as on the other; on 48 people of 2 to 68 the slit is under 0.5 mm with the table and over 1.0
(children) and 1.6 mm (from 17) without it; no vertex moves sideways or in depth, none outside the field
moves, none by more than half the slit; the line between the lips keeps its height; the 15 measures of the
face and the 3 of the lips' red are the same to a hundredth of a millimetre. The library's test of the
closed mouth holds both steps: closed in the middle to the base head's slit without `seam_shut`, and the
edges at one height with it (864 heads). `examples/face_measure.rs` prints the slit as measure 28 and
`--dump` writes MakeHuman's head before any target as `base.f32`.
Pictures: `runde99_mund_vorher_nachher.png` (two women and two small children large; before above),
`runde99_form.png` (the shape alone, lit from the left: two women, a man, a child of two; before above),
`runde99_paare.png` (ten of the sample as the panel shows them; before above), `runde99_stichprobe.png`.
Still open: the lips' form; small children's faces; the nose's wings; and from the rounds before: the
spread of the necks, the amount of the cheek's fill by eye on one face, a man's cheek, the fold beside the
mouth, the women's small heads and the ear's landmark behind the short arcs, the forehead's least breadth
and the head's height, the chin's breadth by eye, `head-square` and `head-oval`.

**A child's braincase (round 100).** Open since round 99: the small children's faces. In the sample's
lowest row a child of two or five read as a small adult: a face that fills its head.

*What a child's head measures.* A survey of children's heads was read: Snyder, Schneider, Owings, Reynolds,
Golomb & Schork 1977, Anthropometry of infants, children, and youths to age 18 for product safety design
(University of Michigan, Highway Safety Research Institute, UM-HSRI-77-17; children of the United States),
from the tables NIST's AnthroKids serves: mean and standard deviation by sex in sixteen groups of age from 2
to 19, eleven measures of head, face and neck (`measure.rs` `CHILDREN`, `children_at`; read through a
reading tool's account of each table, not line by line). A real child's braincase is nearly grown when its
face is not: at two the head's circumference is 0.88 (boys) and 0.90 (girls) of the oldest group's, its
length 0.89 and 0.92, and the breadth at the cheekbones 0.78 and 0.82. Kesterke and others 2016 (Biology of
Sex Differences 7: 23, table 4) have the same: at 3 to 6 the cranium at 88 to 91 in 100 of its adult size,
the face at 80 to 84, the nose at 74 to 78.

*What ours measured.* `measure.rs` `children` reads the survey's eleven measures off a morphed head, each as
the survey describes it (`examples/face_measure.rs --children`). The face of England's children was right
and the braincase was not: at two the breadth at the cheekbones was 110.7 and 107.8 mm against the survey's
109 and 108, and the head's circumference 433.6 and 415.6 against 502 and 487, which is 4.3 and 4.8 of the
survey's standard deviations under it. MakeHuman's child and baby are a grown head made small, the
braincase with the face. In a picture framed from the crown to the chin that is a large face.

(Two measures had to be made right first. The head's breadth read the skin round the ear's root, and with
the head file's own field of the ear, which is broad and covers the skull's side, it read too little: now
the ear is told by where it lies on the base head (`EAR_RIM`: further out than the skull's side and no
higher than 22.5 mm over tragion). The circumference is a taut loop in the plane through glabella and the
furthest point of the back of the head, the ears left out. England's grown then stand at 565.5 and 531.4 mm
of circumference against the survey's oldest group's 572 and 543, 153.8 and 144.9 of breadth against 154
and 149, 196.2 and 186.9 of length against 200 and 186.)

*The fix.* `DressSet::skull`: per age the factors by which a child's braincase is larger in breadth, in
length and in height over the ears, girls' and boys'; `morph.rs` `skull_grow` after all targets. Each vertex
takes the share `skull_field` gives it on the base head: nothing at and under a floor that lies 2 cm over
glabella at the forehead, just over the ear's upper rim at the ear's depth, and runs down to the nape behind
the ear; all of it from 4 cm over that floor (`SKULL_FLOOR`, `SKULL_REACH`). 480 of 7001 vertices, 258 in
full. The breadth grows from the middle, the height from tragion's, the length from an upright 3 cm behind
glabella (`SKULL_CENTRE`), so that the forehead keeps its place and the length is added behind. The face,
the eyes, the ears and the neck do not move.

The factors are fitted (`fit100.py`, a scratch tool: 60 girls and 60 boys an age, by the secant method to
0.1 in 100) so that breadth, length and tragion to the top of the head stand to England's own grown as the
survey's children stand to its oldest group. The shares are fitted, not the sizes: England's grown keep
their own heads.

| age | girls: breadth, length, height | boys: breadth, length, height |
|---|---|---|
| 2 | 1.141, 1.229, 1.191 | 1.150, 1.182, 1.198 |
| 5 | 1.126, 1.199, 1.149 | 1.106, 1.128, 1.129 |
| 8 | 1.093, 1.165, 1.101 | 1.050, 1.079, 1.065 |
| 11 | 1.053, 1.106, 1.053 | 1, 1.018, 1.027 |
| 13 | 1.037, 1.066, 1.033 | 1, 1, 1 |
| 15 | 1, 1, 1 | 1, 1, 1 |

Between two ages in a straight line; under two the two-year-olds'. Where the fit asked for less than 1 (a
boy's breadth from 11: 0.96; all of a boy's from 13: 0.96 to 1.02) the table has 1: a braincase is not made
smaller, and a boy's head is what it was from 13 on.

| mm, 60 an age and sex: before, now (the survey, its SD) | head circumference | head breadth | head length | tragion to the top |
|---|---|---|---|---|
| boys of 2 | 433.6, now 490.9 (502, 16) | 119.0, now 135.8 (136, 6) | 151.8, now 174.7 (178, 7) | 95.2, now 114.0 (115, 8) |
| girls of 2 | 415.6, now 478.0 (487, 15) | 113.9, now 128.3 (132, 5) | 145.8, now 172.8 (172, 6) | 92.3, now 110.0 (112, 6) |
| boys of 5 | 464.0, now 507.5 (514, 14.5) | 127.9, now 140.3 (140.5, 5) | 162.5, now 180.0 (183.5, 7) | 103.1, now 116.4 (117.5, 7.5) |
| girls of 5 | 438.1, now 496.0 (503.5, 14.5) | 120.5, now 133.7 (137.5, 4.5) | 154.3, now 179.3 (178.5, 7.5) | 98.3, now 112.9 (115, 7.5) |
| boys of 8 | 494.3, now 520.8 (526, 16) | 137.6, now 142.9 (143, 5) | 172.4, now 183.9 (187.5, 7) | 111.7, now 119.0 (120, 8.5) |
| girls of 8 | 460.9, now 510.5 (519, 16) | 127.4, now 137.1 (141, 4.5) | 162.8, now 184.9 (184, 5) | 103.9, now 114.4 (116.5, 8) |
| girls of 13 | 507.3, now 528.7 (538.5, 16.5) | 138.8, now 142.4 (146.5, 5) | 179.1, now 189.0 (188, 6) | 114.6, now 118.4 (120.5, 7) |

The circumference was not fitted and lands within 1.2 in 100 of its share. Children of every age from 2 to
17 now lie within one standard deviation of the survey in all four (circumference 0.2 to 0.9 under it,
breadth from 0.9 under to 0.2 over, length from 0.8 under to 0.2 over, tragion to the top from 0.6 under to 0.1 over);
before, up to 4.8 under. The head's height from menton to vertex, 16 and 18 mm short at two, is 3 mm over
and at the survey's.

*A check the table was not fitted to.* The survey's depth from the ear to sellion grows as the face does
(0.78 of the oldest group's at two, both sexes together), so its head length less that depth, roughly the
head behind the ear, is as long at two as on the grown: 95 and 91 mm. Ours behind the ear (20 an age and
sex): 95.6 and 97.0 mm at two, where it was 74.1 and 70.9, and 95.9 and 94.9 on the grown. The length is
added where a child's head has it.

*What stays.* On 400 grown people each of the 28 measures is the same to the last digit printed; of the
sample's 35 pictures the 22 of people from 17 on and of the boys of 13 are the same pixel for pixel. On the
children every measure of the face (13 of them), the lips' red, the breadth at the cheekbones, the nose, the
mouth and the neck are what they were. The hair is bound to the skin and goes with the skull; a fringe ends
where it did, 19 to 31 mm over the eyes. One test of the hair had held the fringe's end as a share of the
head's height under the crown (0.27 to 0.42): on a boy of two whose fringe ends 19 mm over his eyes as
before, that share is now 0.43, because the crown lies 2 cm higher. It is held against the eyes now.

Seen (`runde100_kinder_vorher_nachher.png`, `runde100_fuenf_acht_vorher_nachher.png`,
`runde100_seite_vorher_nachher.png`, `runde100_ohne_locken.png`, `runde100_stichprobe.png`): the face of a
small child is smaller in its picture, under a larger head of hair, and the head reaches further back
behind the ear; the children of the lowest row read as children at first sight. Without the locks the
forehead is high and round, and the painted hairline, drawn for a grown head, stands high on it.

Honest about the rest. The features in that smaller face are still a grown person's: at two the nose is
34.9 and 32.9 mm long from sellion to its foot where the survey has 29 (2.0 and 1.3 standard deviations
over), and the face from sellion to the chin 77.1 and 73.5 mm where it has 82 and 80, so from the nose's
foot to the chin a child of two has 42 and 41 mm where a real one has about 53 and 51. The mouth is 37.0
and 35.7 mm broad against 33. The mouth is still a flat stroke with a fold beside each corner. That is the
next round. Further: boys' cheekbones are broad at 8 and 13 (1.3 and 1.7 over), boys' heads high from 13 on (menton to vertex 1.1
to 1.7 over); girls' necks are 0.9 to 1.3 under the survey at 2 to 8; "from tragion to tragion" reads 9 to 24 mm
over the survey at every age, which is the landmark or the net at the ear and not the children; our
children differ less from each other than real ones (a breadth's SD 2.7 mm at two against 6). In the band
where the braincase grows away from what stays, the skin is drawn out: an edge of it to twice its length on
girls of two; no fold shows in the pictures. The hair's cap is a little thicker on a child, since its
offsets go with the head's size. Children under two take the two-year-olds' factors (the survey's infants
were not read). `SKULL_FLOOR`, `SKULL_REACH` and `SKULL_CENTRE` are PLACEHOLDERS, by anatomy and by eye.
The survey is of children of the 1970s, used for shares, not sizes.

Tests: `tests/faces.rs`, 22 now. "A child of England has a braincase as large against its face as a real
child's": the table (ages rising, factors from 1 to 1.25 that fall with age, ones for the grown); the field
(nothing of the face's landmarks, the eyes, the ears, what lies under the chin; all of the crown and the
back of the head; the same left and right); on 20 girls and 20 boys of 2, 5, 8 and 11 what is not of the
braincase does not move at all and what is moves outwards and upwards, by 29.2 mm at the most; 13 measures
of the face and the lips' red are identical; breadth, length, tragion to the top and circumference stand to
the grown within 0.015 of the survey's share and lie within one of its standard deviations, and without
the table they were 0.07 and more short at two and five; the head behind the ear within 0.08 of the
survey's share; the grown, a girl of 15 and a boy of 13 are the same to the bit. `tests/locks.rs`: the
fringe's end against the eyes.
Pictures: `runde100_kinder_vorher_nachher.png` (four of two and two of five; before above),
`runde100_fuenf_acht_vorher_nachher.png` (two of five, four of eight; before above),
`runde100_seite_vorher_nachher.png` (from the side; before above), `runde100_ohne_locken.png` (without the
locks, front and side), `runde100_stichprobe.png`.
Still open: a small child's nose, lower face and mouth against the survey; and as before the lips' form,
the nose's wings, the spread of the necks, the cheek's fill by eye, a man's cheek, the fold beside the
mouth, the women's small heads, the forehead's least breadth, the chin's breadth by eye, `head-square` and
`head-oval`.

**A child's mouth (round 101).** Open since round 100: in a small child's face the features were a grown
person's. Three of the survey's measures say how (60 girls and 60 boys an age; boys, then girls):

| mm at two | ours | what the survey's share of England's grown asks for | the survey |
|---|---|---|---|
| nose, sellion to its foot | 34.9, 32.9 | 29.1, 30.2 | 29, 29 |
| lower face, sellion to menton | 77.1, 73.5 | 84.4, 83.4 | 82, 80 |
| mouth's breadth | 37.0, 35.7 | 34.2, 33.4 | 33, 33 |

The nose 3 to 6 mm too long, the face under the brow 7 to 10 mm too short, so from the nose's foot to the
chin 42 and 41 mm where a real child of two has about 53 and 51; the mouth 2 to 3 mm too broad. The first
two are MakeHuman's child, which has a grown face's proportions. The third was ours: MakeHuman's child has
a narrow mouth (32.7 and 31.4 mm at two; against the grown 0.02 to 0.13 under the survey's share at every
age), and round 55 widened it by eye with one weight for all ages (`mouth-scale-horiz-incr` at 0.45 in
`DressSet::child`): too much on the small (0.05 over the share at two, a grown mouth on a small face) and
too little on the girls of 8 and 11 (0.015 and 0.035 under).

*Tried: all three by measure.* Three weights per age and sex (`nose-scale-vert-decr`, under 0 its `-incr`;
`chin-height-incr`; `mouth-scale-horiz-incr`), fitted so that nose, lower face and mouth stand to England's
own grown as the survey's children stand to its oldest group (`fit101.py`, a scratch tool). The fit met all
three to 0.1 mm, and the head's height from menton to vertex, which was not fitted, came within 2.2 in 100
of its share (before, 1.3 to 7.9 under).

| age | boys: nose, chin, mouth | girls: nose, chin, mouth |
|---|---|---|
| 2 | 1.197, 0.357, 0.164 | 0.544, 0.486, 0.216 |
| 5 | 0.779, 0.322, 0.265 | -0.023, 0.551, 0.362 |
| 8 | 0.661, 0.231, 0.333 | -0.670, 0.537, 0.521 |
| 11 | 0.470, 0.111, 0.234 | -1.065, 0.577, 0.626 |
| 13 | 0.319, 0.069, 0.084 | -0.398, 0.368, 0.169 |

The numbers were right and the faces were worse (`runde101_verworfen_nase_kinn.png`). The target that
shortens a nose pushes its foot up by 4.8 mm at its full weight; from 0.6 on the nose is squashed, with a
crease across its bridge and the skin under it smeared, and a boy of two needs 1.2. The target that
lengthens a chin pulls its point down (20 mm at its full weight): the lower face is as long as the survey's
and reads as a long, heavy chin, a grown one's; at half the weight too. Each was looked at alone: the mouth
a clear gain, the nose and the chin not. A real child's lower face is not long by its chin, and its nose is
not a grown one pushed together: these two need a child's form of the head of its own, which MakeHuman's
targets for a grown face do not give. Nose and chin were dropped; the code keeps no trace of them.

*Kept: the mouth's breadth.* `DressSet::child_mouth`: per age the weight of `mouth-scale-horiz-incr`, girls'
and boys' (`CHILD_MOUTH`, `child_mouth_of`; morph.rs after the `child` list); the row of round 55 is gone
from `child`. The weights are the fit's, with the nose and the chin left as they are (the mouth's breadth
does not depend on them: the same to 0.1 mm).

| age | girls | boys | mouth now, mm (round 100; the survey, its SD): girls | boys |
|---|---|---|---|---|
| 2 | 0.216 | 0.164 | 33.4 (35.7; 33, 4) | 34.2 (37.0; 33, 4) |
| 5 | 0.362 | 0.265 | 36.5 (37.3; 36, 3.5) | 37.3 (39.1; 36, 4) |
| 8 | 0.521 | 0.333 | 40.0 (39.3; 39.5, 3.5) | 40.4 (41.6; 39, 4) |
| 11 | 0.626 | 0.234 | 43.0 (41.4; 42.5, 5) | 42.0 (44.1; 40.5, 3.5) |
| 13 | 0.169 | 0.084 | 43.6 (44.1; 43, 4.5) | 44.1 (46.1; 42.5, 4) |
| 15 | 0 | 0 | 46.6 (the same) | 46.7 (the same) |

Between two ages in a straight line, under two the two-year-olds', none from 15 on (the fit asked for 0.05
and -0.05 there). A girl's weight is larger than a boy's because MakeHuman's girl has the narrower mouth
and the survey's girl the mouth nearer a grown woman's; it falls from 11 to 13 because MakeHuman's child
fades into its grown form there and brings its own breadth. At every year of age from 2 to 15 (the ages
between the table's measured too) the mouth lies 0.1 to 0.4 of the survey's standard deviations over it,
as England's grown lie over its oldest group (0.5 and 0.1): the share is the survey's, the size England's.

*What stays.* The mouth's breadth is the only measure that moves: on 20 girls and 20 boys of 2, 5, 8, 11
and 13 the landmarks of nose, chin, brow, cheekbones, jaw and ear are where they were to the bit, the ten
other measures of the survey the same to 0.01 mm. On 400 grown people each of the 28 measures is the same
to the last digit printed as in round 100; of the sample's 35 pictures the 20 of people from 17 on are the
same pixel for pixel, the 15 of children of 2 to 13 change in 0.0 to 0.3 in 100 of their pixels (by more than 8 of 255).

Seen (`runde101_kinder_vorher_nachher.png`, `runde101_fuenf_acht_vorher_nachher.png`,
`runde101_stichprobe.png`): a small child's mouth is smaller in its face, which reads rounder for it; on
the girls of eight and eleven a little broader. A modest gain, not the round's aim.

Honest about the rest. A small child's nose is as long and its lower face as short as before: at two the
nose 2.0 and 1.3 standard deviations over the survey (boys, girls), at five and eight the boys' 1.1 over;
the lower face 1.0 and 1.6 under at two, the girls' 1.4 to 1.6 under through eight and 1.1 under at eleven.
The girls' noses of 8 to 11 are 0.4 to 0.6 short. The two lip rows left in `child` (thinner lips) are by
eye. The rest as in round 100: boys' cheekbones broad from 8 (1.3 to 1.7 over), girls' necks thin at 2 to
11 (0.9 to 1.3 under), "from tragion to tragion" 9 to 24 mm over at every age, the skin drawn out in the
band over the ear.

Tests: `tests/faces.rs`, 23 now. "A child of England has a mouth as broad against a grown one's as a real
child's": the table (ages rising, weights within 1, zeros from where the head is grown, read in a straight
line between the ages, no row of the mouth's breadth left in `child`); on 20 girls and 20 boys of 2, 5, 8,
11 and 13 nothing but the mouth moves (seven landmarks to the bit, ten measures to 0.01 mm); the mouth
stands to the grown within 0.008 of the survey's share and within 0.6 of its standard deviations; round
55's weight was over the share by more than 0.03 (boys) and 0.015 (girls) up to five, MakeHuman's own is
under it by more than 0.008 at every age; the grown, a girl of 15 and a boy of 17 are the same to the bit.
`examples/face_measure.rs --children --mouth b,g` measures with other weights.
Pictures: `runde101_kinder_vorher_nachher.png` (four of two, two of five; round 100 above),
`runde101_fuenf_acht_vorher_nachher.png` (round 100 above), `runde101_stichprobe.png`,
`runde101_verworfen_nase_kinn.png` (two of two: round 100 beside nose, chin and mouth by measure, which was
dropped).
Still open: a small child's nose and lower face (a child's form of the head of its own); and as before the
lips' form, the nose's wings, the spread of the necks, the cheek's fill by eye, a man's cheek, the fold
beside the mouth, the women's small heads, the forehead's least breadth, the chin's breadth by eye,
`head-square` and `head-oval`.

**A child's nose (round 102).** Open since round 101: a small child's nose was long and its lower face
short, and MakeHuman's targets for the two deform the face. This round tried a form of its own.

*The form.* Not a target, but a shift of heights (`morph.rs` `nose_set`, `nose_ways`, `face_front`): every
vertex of the face's front is moved up or down by an amount that depends on its height alone, so that a
band of the face is shortened or drawn out evenly, as a whole, with nothing folded. The face's front is the
skin from 48 mm before tragion on the base head (nose, mouth, chin, the cheeks' front), fading to nothing
18 mm before it (`FACE_FRONT`: the ears, the neck and the back of the jaw stay; the eyeballs are left out).
The heights are the person's own: the lower lids' edge under the pupils, the nose's foot, the edges of the
lips' red, the chin's lowest point. A strain sets in over 6 mm under the lids (the skin over the eyeball
moves next to nothing) and over 2 mm at each other border (`NOSE_HEIGHTS`).

*Tried: nose and lower face by measure.* First with two factors per age and sex: the band from the lids to
the nose's foot shortened until the nose has the survey's share of England's grown, and the skin from the
nose's foot to the chin drawn out until the lower face (sellion to the chin) has its share too, the lips'
red kept as high as it is (it is 2 mm high already against Sforza and others 2007 at five). At two that is
the nose's foot 5.8 mm (boys) and 2.7 mm (girls) higher and the chin 7.3 and 9.9 mm lower: the nose 29.1
and 30.2 mm (the survey 29), the lower face 84.4 and 83.5 (82 and 80), exact by construction, and no crease
or smear anywhere. Looked at (`runde102_varianten_zweijaehrige.png`, `runde102_varianten_fuenfjaehrige.png`:
round 101, the nose alone, the nose with half of the lower face's gain, the nose with all of it): the
shorter nose is a gain, a small nose set high as a small child has it; the longer lower face is not. With
all of it, and with half, the face under the mouth is long and heavy, an older child's or a grown one's,
as in round 101, though here the skin was drawn out evenly from the nose's foot to the chin. So it is not
the target's fault: on this head a lower face as high as the survey's reads wrong. (A guess, not measured:
a real small child's lower face is as broad as it is high, with full cheeks down to the jaw, and ours runs
in to the chin; the survey has no breadth of the jaw to hold that against.) The lower face's factor was
dropped; the code keeps no trace of it.

*Kept: the nose.* `DressSet::child_nose`: per age the factor on the nose's length, girls' and boys'
(`child_nose_of`). What the nose loses the skin between its foot and the chin gains, the lips' red left as
it is, the chin where it is: from the nose's foot to the chin a boy of two has 48 mm where he had 42 (the
survey's share asks for 55).

| age | girls | boys | nose now, mm (round 101; the survey, its SD): girls | boys |
|---|---|---|---|---|
| 2 | 0.918 | 0.834 | 30.2 (32.9; 29, 3) | 29.1 (34.9; 29, 3) |
| 5 | 1 | 0.903 | 35.4 (the same; 34, 4) | 34.6 (38.3; 34.5, 3.5) |
| 8 | 1 | 0.921 | 37.9 (the same; 39, 3) | 38.6 (41.9; 38.5, 3) |
| 11 | 1 | 0.952 | 40.5 (the same; 43, 4) | 43.2 (45.4; 43, 4) |
| 13 | 1 | 0.969 | 44.8 (the same; 44.5, 3.5) | 46.2 (47.7; 46, 4) |
| 15 | 1 | 1 | 49.0 (the same) | 50.0 (the same) |

The factors are the survey's share of England's grown over what the nose measured (60 girls and 60 boys an
age; the shift scales every nose by the factor, so no search was needed). Between two ages in a straight
line, under two the two-year-olds'. A boy's nose now lies within 0.4 of the survey's standard deviations at
every year of age from 2 to 15 (before, 2.0 over at two, 1.1 over at five and eight). Girls from five on
are left: at five their nose is at the share, from 8 to 12 it is 0.4 to 0.6 short, and a longer nose over
a chin that stays would take its length from the lower face, which is short.

*What stays.* Heights only: no vertex moves sideways or in depth. Nothing at or over the lower lids' edges
moves, nothing under the chin's lowest point, no eyeball, no ear; the chin's lowest point stays to a
thousandth of a millimetre. The ten other measures of the survey are the same to 0.01 mm (the mouth's
breadth, the breadth at the cheekbones, the head's height among them); the lips' red is as high as it was
to 0.1 mm; of the way from the nose's foot to the chin the upper lip takes 0.32 where it took 0.33 (boys of
two; `mouth_at` 0.31). An edge of the skin grows to 1.27 of its length at the most and shrinks to 0.75. On 400 grown people each of the 28 measures is the same to the last digit printed as in round
101; of the sample's 35 pictures 26 are the same pixel for pixel (everyone from 17 on, every girl from
five on), the nine of boys of 2 to 13 and girls of two change in 1.0 to 4.2 in 100 of their pixels (by more
than 8 of 255).

Seen (`runde102_kinder_vorher_nachher.png`, `runde102_bub_zwei_gross.png`,
`runde102_seite_vorher_nachher.png`, `runde102_fuenf_acht_vorher_nachher.png`, `runde102_stichprobe.png`):
a boy of two has a small nose set high, turned up a little from the side, and reads younger; on the girls
of two and the boys of five and eight the same in small. The clearest gain of the three rounds on the
children's faces for the boys, next to none for the girls.

Honest about the rest. The lower face is as short as before against the survey: at two 1.0 and 1.6
standard deviations under (boys, girls), the girls' 1.4 to 1.6 under through eight and 1.1 under at eleven;
lengthening it was tried twice and looked worse both times. The girls' noses of 8 to 12 are 0.4 to 0.6
short and were left. A small child's mouth is still a flat stroke with a fold beside each corner.
`FACE_FRONT` and `NOSE_HEIGHTS` are PLACEHOLDERS, by anatomy and by eye. The rest as in rounds 100 and 101.

Tests: `tests/faces.rs`, 24 now. "A child of England has a nose as long against a grown one's as a real
child's": the table (ages rising, factors between 0.8 and 1, ones from where the head is grown, read in a
straight line between the ages); the field (all of nose, mouth and chin, nothing of the ears and the
eyeballs, the same left and right); on 20 girls and 20 boys of 2, 5, 8, 11 and 13 heights only, nothing
at or over the lower lids, under the chin or off the face's front moves, what moves goes up and no further
than the nose's foot, which goes up by what the nose is shorter; the chin stays; ten measures of the survey
to 0.01 mm, the lips' red to 0.2 mm, the upper lip's share to 0.02; where the table shortens a nose it
stands to the grown within 0.012 of the survey's share and was more than 0.02 over it, where the table
leaves it, it was not over the share; an edge of the skin between 0.7 and 1.35 of its length; the grown, a
girl of 15 and a boy of 17 are the same to the bit. `examples/face_measure.rs --children --nose b,g`
measures with other factors.
Pictures: `runde102_kinder_vorher_nachher.png` (four of two, two of five; round 101 above),
`runde102_bub_zwei_gross.png` (a boy of two large, front and side, round 101 first),
`runde102_seite_vorher_nachher.png`, `runde102_fuenf_acht_vorher_nachher.png`, `runde102_stichprobe.png`,
`runde102_varianten_zweijaehrige.png` and `runde102_varianten_fuenfjaehrige.png` (what was tried: round
101, the nose alone, with half and with all of the lower face's gain).
Still open: a small child's lower face and the form of its mouth; and as before the lips' form, the nose's
wings, the spread of the necks, the cheek's fill by eye, a man's cheek, the fold beside the mouth, the
women's small heads, the forehead's least breadth, the chin's breadth by eye, `head-square` and
`head-oval`.

**Reference.** The rounds were held against screenshots of Crusader Kings III (Ramon: until that level). Not
reached. Cloth, hoods, veil, the fringe and the tone of the skin are close; the fine forms of the face (lids,
nostrils, edge of the lips), stubble, children and the variety of faces and of hair are not; the thrown-back hood closes round the neck since
round 35, but has no folds across its cloth.

**Genes.** The pools of the founders are still Apoleia's seven Roman-era regions (`dna.rs` `origin`). Places
outside them fall into the nearest box, which is wrong: Mexico draws as Africa, the Volga as Graecia, Persia and
Baghdad as Syria. New pools and new sets of dress need sources and Ramon's choice.

## Measured against Apoleia

1. **The triangles.** `portrait/examples/reference.rs` run on Apoleia's own crate and on the game's, same machine,
   twelve test people, real look on: the same bytes. As WebAssembly the sums of positions, colours, texture
   coordinates and normals agree within rounding (`tests/portrait.test.ts`; sin, cos and pow differ in the last
   digits between a machine's library and WebAssembly).
2. **The pictures.** `tools/portrait/compare.mjs` holds the stage's pictures against the ones Apoleia's game rendered
   in Godot 4.7.2 for the same people (`tests/portrait/godot/`, 336 x 420). Over the pixels either picture covers,
   both on mid grey, 15.11.2026:

   | | mean | worst person |
   |---|---|---|
   | pixels covered by only one of the two (outline) | 0.2 % | 0.2 % |
   | mean absolute colour difference (0..255) | 6.3 | 8.9 |
   | difference of the mean colour (0..255, per channel) | −3.3 | −6.6 |

   Both renders ran on a software graphics driver in the cloud (Godot: llvmpipe, three.js: SwiftShader). Neither was
   checked on a real graphics card.

## Where the stage deviates from Godot

- **No light scattering inside skin.** Godot's skin mode softens the shading of faces; three.js has no counterpart.
  Faces come out a little harder and darker in the shadows.
- **The shadow of the key light is calibrated, not derived**: map of 512 pixels, strength 0.7
  (Apoleia's profile, `shadow` in `src/portrait/profile.ts`; until round 81 a constant of `stage.ts`). At full strength three.js' shadows were darker and sharper than Godot's (mean colour
  difference 8.0 instead of 7.0, measured before the textures repeated).
- **Hair cards** are drawn in two passes (depth of their opaque parts, then blended), which stands in for Godot's
  "alpha with depth pre-pass". Fine strands at the edge of beards differ.
- Veils and cloaks come out up to 4 units darker.

## What is still Apoleia and has to go (next steps, each needs Ramon's yes where it is a choice)

- Roman clothes, hats and hairstyles (`build.rs`, `look.rs`) for every origin but England; the seven Roman origins and their ranges without
  source (`dna.rs`: only Germania and Aegyptus rest on Howells' skull measurements, the rest is marked
  PLACEHOLDER); the German job names of Apoleia's simulation (`person.rs`).
- `build()` in `portrait/src/build.rs` is still one function of 1,640 lines whose parts share some hundred local
  values (the free functions around it are split off into `morph.rs`, `hair.rs`, `real_look.rs`). It is to be cut
  up together with the new clothes and headwear, which replace about half of it.
- Cultures, clothes and hairstyles as data instead of code, so that a new culture needs data only.
- Loading: the 4.1 MB of data files are loaded together on the first portrait; not measured on a slow line.
- Speed: a portrait of the real look has 44,000 to 119,000 triangles and takes 40 to 160 ms to build in WebAssembly
  (cloud machine). Drawing was only timed on the software driver (0.3 to 1.6 s), which says nothing about a real
  graphics card.
- Licences not checked online: the skin images come from MakeHuman's system assets (stated CC0 in Apoleia's
  repository); Howells' data set is published, its terms of use were not checked.
