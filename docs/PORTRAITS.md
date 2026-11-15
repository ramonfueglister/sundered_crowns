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
| Test page | `portrait-test.html` | The twelve test people; `?origin=England` puts them into the dress of 1356 |

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
| Hair: cut round with a fringe (men), flat under a hood, a bun under the veil; girls from 7 and women too young for the veil a centre parting and two plaits in front of the shoulders | `hair`, `hair_receding`, `hair_bald`, `hair_hooded`, `hair_veiled`, `hair_girl` | by eye |
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
The rounds are judged in this panel from now on.

**What the panel showed (round 43).** At that size Apoleia's hair for a head that loses it reads as rows of
scales (short locks, white on the old), its chin beard as a tuft of long strands, and the short beards as black
on brown-haired men. The dress table now names its own hair for such heads (`hair_receding`, `hair_bald`: the
hair of 1356 with the hairline gone back, and as a horseshoe round a bare top; `styles.py` `BOB_LINE`) and which
beard is worn in place of each of Apoleia's (`beards`: none on the chin alone, no philosopher's; unsourced). The
painted layer of short hairs is drawn lighter and lit round its shaded side as the cards are (`cap` in the
profile): its image is far darker than the cards', which at the lower exposure turned a brown beard black.
A mood shows less strongly (`mood` 1 in the dress table, Apoleia's 1.7 was drawn for a small picture): a sad
mouth on an old face read as a mask.
The full beard is the dress's own (`beard_full`: `beard_trim`, cut close below the chin, from fewer and broader
cards): Apoleia's hangs in long single strands that read as wool.

**Reference.** The rounds were held against screenshots of Crusader Kings III (Ramon: until that level). Not
reached. Cloth, hoods, veil, the fringe and the tone of the skin are close; the fine forms of the face (lids,
nostrils, edge of the lips), the outline of the hair (a smooth dome) and white hair and beards (no depth, they read as knitted) are not; the thrown-back hood closes round the neck since
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
