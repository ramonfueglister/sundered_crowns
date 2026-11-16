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
| Hair: cut round with a fringe (men), flat under a hood, a bun under the veil; girls from 7 and women too young for the veil a centre parting and two plaits in front of the shoulders | `hair`, `hair_receding`, `hair_bald`, `hair_curly`, `hair_hooded`, `hair_veiled`, `hair_girl` | by eye |
| Faces: relaxed lids, a closed mouth, the eyeballs deeper in their sockets (they came through the lower lid), softer jaw for women, redder lips, more flush on cheeks and nose | `lids`, `mouth_shut`, `eye_forward`, `jaw_women`, `lips`, `flush` | by eye, against the reference |

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
  (`src/portrait/stage.ts`). At full strength three.js' shadows were darker and sharper than Godot's (mean colour
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
