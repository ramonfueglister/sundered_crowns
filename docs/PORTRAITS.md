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
