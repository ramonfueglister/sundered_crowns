# What was carried over from Apoleia, and what was changed

Source: github.com/ramonfueglister/apoleia at commit c30a10771cbe02d3c4fa63659d79e9a647e85e5f (Ramon's own
project; the code is his). The head model and its morph targets are MakeHuman's, CC0 (../makehuman/LICENSE.md).

| File here | From Apoleia | Change |
|---|---|---|
| `src/caster.rs`, `src/geo.rs`, `src/look.rs` | `sim/portrait/src/` | none |
| `src/build.rs` | `sim/portrait/src/build.rs` | two lines: whether an image is there is asked of `real::has` instead of the disk (`std::path::Path::exists`) |
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

Still as in Apoleia and to be replaced (docs/PORTRAITS.md): Roman clothes, hats and hairstyles, the seven Roman
origins, the German job names of Apoleia's simulation, switches read from environment variables in `build.rs`.
