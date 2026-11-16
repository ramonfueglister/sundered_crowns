# What was carried over from Apoleia, and what was changed

Source: github.com/ramonfueglister/apoleia at commit c30a10771cbe02d3c4fa63659d79e9a647e85e5f (Ramon's own
project; the code is his). The head model and its morph targets are MakeHuman's, CC0 (../makehuman/LICENSE.md).

| File here | From Apoleia | Change |
|---|---|---|
| `src/caster.rs`, `src/look.rs` | `sim/portrait/src/` | none |
| `src/geo.rs` | `sim/portrait/src/geo.rs` | none, plus four small helpers moved in from `build.rs` (`D2R`, `jround`, `solid`, `gem`) |
| `src/build.rs`, `src/morph.rs`, `src/hair.rs`, `src/real_look.rs` | `sim/portrait/src/build.rs` (2,853 lines) | split by part, the functions moved as they were; whether an image is there is asked of `real::has` instead of the disk; the switches Apoleia's test renders set through environment variables are gone (see below) |
| `src/settings.rs` | values inside `build.rs` | the six strengths that environment variables could override, fixed at Apoleia's values |
| `src/head.rs` | `sim/portrait/src/head.rs` | one line: the head file is unpacked by `real::unpack` (zstd in plain Rust, `ruzstd`) instead of the C library, which does not build for the browser |
| `src/real.rs` | `sim/portrait/src/real.rs` | rewritten: the files are handed in by the caller instead of read from a folder on disk; the functions the builder calls keep their names and answers |
| `src/lib.rs` | `sim/portrait/src/lib.rs` | module list, path of the head file in the tests |
| `src/dna.rs` | `sim/src/dna.rs` | without the ECS component of Apoleia's engine and without the two functions that read Apoleia's 25 km grid |
| `src/person.rs` | `sim/godot/src/portrait.rs` (`look_stand`, `outdoors`, `scar_chance`, `life_of`, `look_of`) | without the hooks for test renders that read environment variables |
| `src/wire.rs`, `src/wasm.rs`, `examples/reference.rs` | new | the bytes between game and builder, the calls from the browser, the numbers for the tests |
| `public/portrait/head.bin.zst`, `public/portrait/real/` | `app/assets/portrait/` | none (same bytes; Godot's `.gdignore` left out) |

Not carried over: Apoleia's bridge to Godot (materials, light, picture cache); `src/portrait/` of the game does that
work with three.js.

Held against Apoleia: `examples/reference.rs`, run on Apoleia's own crate and on this one on the same machine, gave
the same bytes for all twelve test people (tests/portrait/people.txt), real look on. tests/portrait/golden.json is
Apoleia's output; tests/portrait.test.ts holds the WebAssembly build against it.

Environment variables removed (none of them was set in Apoleia's game, only in its test renders): the folders and
switches of the real look's parts (`APOLEIA_REAL`, `APOLEIA_MH_DIR`, `APOLEIA_MH_AUTO`, `APOLEIA_MH_BEARD`,
`APOLEIA_MH_CLOTHES`, `APOLEIA_FACE_MODULES`: all follow the one switch `real::set_real` now), the strengths
(`APOLEIA_FACE_GAIN`, `_FACE_SOFT`, `_FACE_LIM`, `_SKIN_SOFT`, `_SKIN_AO`, `_SKIN_RED`: `settings.rs`), and the test
hooks (`APOLEIA_FACE_DEBUG`, `_REAL_SCALP`, `_ERA`, `_MH_MEN`, `_MH_WOMEN`, `_MH_FLAT`, `_DEBUG_CAP`, `_DEBUG_CELLS`,
`_DEBUG_TOGA`). With `_ERA` went the one hairstyle only it could choose (`sidepart01`; its files are still there).

The split and the removal changed no portrait: `examples/reference.rs` gives the same bytes before and after, real
look and simple look, for all twelve test people.

Still as in Apoleia and to be replaced (docs/PORTRAITS.md): Roman clothes, hats and hairstyles, the seven Roman
origins, the German job names of Apoleia's simulation; `build()` itself is still one function of 1,640 lines.

Added beside Apoleia's code (15.11.2026), without changing a Roman portrait (`examples/reference.rs`, same bytes):
`dress.rs` (sets of dress as tables; England 1356), the choice of a set in `person.rs`, `look.rs`, `build.rs`,
`morph.rs` and `real_look.rs` (every branch behind `p.dress.set()`), `real_look.rs` `calm` (smooth movement and
least distance for the game's own garments; Apoleia's are bound as before), the look's name with the set in front
(`wire.rs`), `examples/genes.rs` (founders and children as numbers for the game's simulation of persons).
Since then: `hair_girl` in the dress table (England: `plait01`, a parting and two plaits, in place of Apoleia's
crown braid), its cards lit as hanging hair (`build.rs`, only for that file); Roman bytes unchanged.
`hair_receding`, `hair_bald` (England: `bob03`, `bob04`, in place of Apoleia's short locks and painted horseshoe;
`real_look.rs` `mh_pick`) and `beards` (which beard a dress wears in place of each of Apoleia's; `look.rs`
`beard_style`), `beard_full` (the file of the full beard, `build.rs`) and `mood` (how strongly a mood shows,
`morph.rs`; Apoleia's 1.7) in the dress table; Roman bytes unchanged.
`hair_curly` (England: `bob05`, wavy hair in place of Apoleia's `curly01`; `real_look.rs` `mh_pick`); Roman bytes
unchanged.
`hair_red` in the dress table (from which strength of the red gene hair shows red, `look.rs` `hair_colour`;
Apoleia's: from 0 on, in step with the gene); Roman bytes unchanged.
`rest` (targets of the face at rest under every mood, `morph.rs`), `lean` (the bust leaning back or forward per
sex, `build.rs` `lean_back`) and `gaze` (where the eyes look, `build.rs`: the eyeball's image laid round that
direction) in the dress table; Roman bytes unchanged.
`rest` holds a weight for women and one for men; `dress.rs` `by_sex` lets a boy grow from the women's value to the
men's (`rest`, `lean`, gaze), and a child's face takes a third of `rest` and of `mouth_shut`, growing to all
(`morph.rs`); Roman bytes unchanged.
`adult` (from which age the head has its adult form, `dress.rs` `head_years`, `morph.rs`), `lids` per sex, `brows`
(which of MakeHuman's brows women and men wear, `build.rs`; `eyebrow011` added from MakeHuman, CC0) and
`brow_paint` (how much of the brow's colour is painted on the skin under it, `build.rs`) in the dress table; Roman
bytes unchanged.
The full beard of England is `beard_crop` (round 53): a file without cards, its painted layer standing off the
skin (pipeline: `beards.py` style `crop`, `hairlib.py` `paint_cap(lift=)`); `beard_trim` removed. The stage may
light a painted layer without shadows (`profile.ts` `cap.shadow`, `stage.ts`); Apoleia's profile is unchanged.
The normal maps of the painted layers of 1356 rewritten without `nmap.py`'s profile for cards; Roman bytes
unchanged.
Round 54: what Apoleia stacks for its faceted look is a value of the dress table and 0 for 1356: `kid` (Apoleia's
own child's face over MakeHuman's child: `look.rs` `KID`, the block of targets in `morph.rs`, the larger iris in
`build.rs`), `cheeks` and `sockets` (red and shade painted on the skin, `build.rs`). The mouth at rest is closed
by its measured gap (`morph.rs` `lip_gap`; `mouth_shut`, `mouth_part` name the targets), `child` holds targets of
a child's face. Everyone wears `eyebrow001` again (`eyebrow011` removed). `examples/sample.rs` writes a sample of
founders of a pool for the test page. Roman bytes unchanged.
Round 55 (stage only): the skin's tint of the 1356 profile goes by the person's skin as a whole (`materials.ts`
`skinTone`), stubble's painted layer is not drawn lighter (`profile.ts` `cap.stubble`); `beard_crop` written anew
with its neckline below the tip of the chin. Apoleia's profile and Roman bytes unchanged.
Round 56: `hair_small` (the hair of children under seven, `real_look.rs`; Apoleia's `crop01` stays for Roman
portraits), `brows_child` (`build.rs`), `genes` (how strongly single genes of the face show in the real look's face
space, `morph.rs`; `lips` 0.4 for 1356), `child` follows the head's child share (`dress.rs` `child_share`).
`examples/sample.rs` adds children of two and five. Roman bytes unchanged.
Rounds 57 to 59: `plait01` and `bob04` written anew (pipeline switches, see `tools/portrait/pipeline/README.md`);
`hair_lengths` in the dress table (`dress.rs` `hair_of`, `real_look.rs`) with the new `bob06`, `bob07`. Roman
bytes unchanged.
Round 60: `DressSet::converge` and `gaze_of` (each eye turned towards the nose; `build.rs` eyes), `gaze` -0.1 for
1356. Roman bytes unchanged.
Round 62: `DressSet::beard_short` (the file of the short beard; `build.rs`), `beard_short1356` for 1356. Roman
bytes unchanged.
Round 65: `DressSet::lash_line` (the lid's edge drawn towards the lashes' colour where they grow; `real_look.rs`
`real_skin` reads `skin_lash.txt` only when a dress asks for it), 0.75 for women and 0.65 for men of 1356; in
`rest` the brows higher, men's eyes larger, cheekbones and a leaner head. Roman bytes unchanged.
Round 66: `DressSet::lips` is a `Lips` per sex (was: how far the builder's lip facets are mixed towards red; a
dress with a table now leaves those facets in the skin's colour). `real_look.rs` `real_skin`: the skin's colour is
worked out per vertex and then given to the corners (the same numbers as before, in the same order); where
`skin_lip.txt` says lip, a share of the skin's colour plus the blood's (`skin`, `blood`), the upper lip times
`upper`; and a strip of 34 triangles appended to the skin that closes the slit between the lips (`morph.rs`
`LIP_SEAM`, the two edges where the lips turn inward; `seam`), whose edges take no shade from `skin_ao.txt`. All
of it only when a dress asks for it. Roman bytes unchanged.

Round 67: `DressSet::beard_stubble` (the file of the stubble; `build.rs`), `beard_stubble1356` for 1356. Roman
bytes unchanged.

Round 68: `DressSet::iris_mm` (the iris's size across; `build.rs`: the ball's image is laid round the gaze so that
its iris, 27.5 degrees of the ball, has that size on this ball; 0 leaves it as it is), `DressSet::eyes_child` and
`eyes_of` (a child's share of lids and lash line; `morph.rs`, `build.rs`), the image radius of the ball kept inside
its cell (no change where the iris is not scaled). Roman bytes unchanged.

Round 69: `DressSet::brow_lift`, `brow_band`, `brow_lift_of`, `brow_band_of` and `brow_lift_at` (`dress.rs`); the
hairs of the brow's cards drawn together and moved up over the skin when a dress asks for it (`build.rs`;
`morph.rs` `eye_spans`, `EYE_CORNERS`: where the brow's inner end, the pupil and the eye's outer corner lie on
this head); `jaw_women` shifts the gene of the jaw only, no longer the one of the head's form (`morph.rs`); in
`rest` the measures of a woman's and a man's face fitted to a survey's means. New, not Apoleia's: `src/measure.rs`
(a face's measures in millimetres, the survey's numbers), `examples/face_measure.rs`, `tests/faces.rs`. Roman
bytes unchanged.

Round 70: a dress whose `hair_veiled` is empty has no hair under the veil (`real_look.rs` `mh_pick`; `build.rs`
then draws none of its own either); `DressSet::veiled`; the targets of the ears are left out for a woman who wears
the veil of a dress with a table (`morph.rs`: linen bound to a grown ear came through the veil over it). The
pipeline's `drape_sim.py` gets `FACE_ON` and `EARS` (Apoleia's script, changed in the game's copy only); veil and
wimple of England written anew. New, not Apoleia's: `tests/veil.rs`, `tests/common/mod.rs`. Roman bytes unchanged.

Round 71: `real_skin` takes the flush as a strength and the name of its map (a dress names its own,
`DressSet::flush_map`; without a dress Apoleia's `skin_red.txt` at 1) and the lips with the share of their colour
a person has (`DressSet::lips_of`, `Lips::child`); `DressSet::flush` per sex; `mouth_part` parts the lips with
the targets that shut them (negative shares) instead of `mouth-lowerlip-middle-up`; four rows in `rest` for the
form of the mouth. The pipeline's `skin_red.py` gets its zones as switches (`CHEEK`, `WING`, `TIP`, `BRIDGE`,
`CHIN`, `EARS`; Apoleia's script, changed in the game's copy only; its defaults write `skin_red.txt` number for
number). New, not Apoleia's: `real/skin_flush.txt`, `measure.rs` `marks`, `lips`, `LIPS`, three tests in
`tests/faces.rs`, one in `src/lib.rs`, `tools/portrait/face_colour.mjs`. Roman bytes unchanged.

Round 72: a dress with a table may ask for a scar as a line in the skin (`DressSet::scar`, `ScarLine`; `build.rs`
builds it from the skin's own surface); without it Apoleia's raised ribbon, as before. New, not Apoleia's: a test
in `tests/faces.rs`. Roman bytes unchanged.

Round 73: nothing in the crate. The stage's profile for England lights a face from the other side of the camera
and from higher up (`src/portrait/profile.ts`, the game's own file); Apoleia's stage is as it was. Roman bytes
unchanged.

Round 74: a dress with a table may bring a grown head's eyes forward with their lids (`DressSet::eye_out`,
`morph.rs` `eyes_out`, `EYE_FIELD`) and set each eyeball up or down in its socket so that the pupil stands
between the lids (`DressSet::pupil`, `pupils_set`); England's lean is the same way for both sexes. The brow's
lift takes the last skin its ray meets instead of `outer_skin` (which is as it was, for Apoleia's hair). New,
not Apoleia's: `measure.rs` `skin_front`, `ball`, `eye_stands`, `EYE_SEX`, `profile`, `PROFILE`,
`lids_to_pupil`, three tests in `tests/faces.rs`, two in `src/lib.rs`; `examples/face_measure.rs --dump` also
writes the skin's triangles and the eyeballs' vertices. Roman bytes unchanged.

Round 75: nothing in the builder. England's `gaze` turns the eyes to the camera (its first value had the wrong
sign since round 50). The stage's reckoning of camera and frame is a function of its own (`src/portrait/stage.ts`
`framing`, the game's file). Roman bytes unchanged.

Round 76: a dress with a table may name another image for the brow's cards and for the lashes'
(`DressSet::brow_image`, `lash_image`; `build.rs` sets the surface's image, the cards are MakeHuman's as
before). New, not Apoleia's: `real/eyebrow1356.webp` (MakeHuman's `eyebrow001` written without `ALPHA_GAIN`,
its tail faded; Apoleia's `eyebrow001.webp` is the same image with the covering times 2.5),
`real/Eyelashes1356.webp` (Apoleia's `Eyelashes01.webp` blurred into a fringe), the pipeline's `brow_tail.py`
and `lash_soft.py`, a test in `tests/faces.rs`. Roman bytes unchanged.

Round 77: nothing in the builder. England's dress table shows the gene of the cheeks at 0.4 (`genes`) and gives
women none of `cheek-bones-incr` at rest (`rest`): that target of MakeHuman's is a pad on the front of the
cheek, which on a woman was a pouch in the outline of the cheek turned away from the viewer. New, not Apoleia's:
`measure.rs` `far_cheek`, `CHEEK`, `STAGE_TURN`, a test in `tests/faces.rs`; `examples/face_measure.rs` prints
the two numbers as measures 17 and 18. Roman bytes unchanged.

Round 78: nothing in the builder. England's dress table paints the upper lip 1.15 times the lips' colour
(`Lips::upper`, before 1.5): the stage's profile for England has a fill light from below and in front since
(`src/portrait/profile.ts`, the game's own file), which lights what faces down; Apoleia's stage is as it was.
Roman bytes unchanged.

Round 79: a dress with a table says how much of Apoleia's paint the skin under stubble keeps
(`DressSet::stubble_paint`, `build.rs` `stub_paint`; England none: the skin of a man with stubble is his skin
shaven). England's layer of stubble is written anew with a real beard's number of hairs (the pipeline's
`beards.py`: `STUB_N`, `STUB_BASE`, `STUB_L`, and a line that prints the zone's area and its hairs;
`hairlib.py` keeps the number of hairs drawn). New, not Apoleia's: a test in `tests/faces.rs`. Apoleia's
stubble and Roman bytes unchanged.

Round 80: nothing in the builder. The stage's profile for England draws the layer of a short or a full beard
with values of its own (`src/portrait/profile.ts` `cap.beard`, `src/portrait/materials.ts` `capLook`, the
game's own files): England's beards are that layer alone, and were drawn as the shade under a head of hair.
Apoleia's stage is as it was. Roman bytes unchanged.

Round 81: nothing in the builder. The stage's profile for England has a key light with a size, drawn as eight
lights that share its energy, so that shadows have soft edges (`src/portrait/profile.ts` `shadow`,
`src/portrait/stage.ts` `keyPlaces`, the game's own files). Apoleia's stage has one light without size as
before; its shadow's map and strength moved from a constant into its profile. Roman bytes and the comparison
with Godot unchanged.

Round 82: England's dress table mixes the lips anew (`dress.rs` `Lips`: more of the skin's own colour, less
blood, a blood with less red for men; the strip's factor `seam` 1.3, before 1.6). No code of the builder
changed. New, not Apoleia's: a test in `tests/faces.rs`. Roman bytes unchanged.

Round 83: the stage only (`src/portrait/profile.ts`, `stage.ts`; the game's own files). A profile's lights
have a fourth, `bounce` (what chest and ground throw back), and `rimShadow` is a strength instead of yes or no.
Apoleia's stage has no bounce (energy 0: the light is left out) and no rim shadow (0), as before; its pictures
are the same pixel for pixel, and the comparison with Godot is unchanged. In the builder a comment alone.
