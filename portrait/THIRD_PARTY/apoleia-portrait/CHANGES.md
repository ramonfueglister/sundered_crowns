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
