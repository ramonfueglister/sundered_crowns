# Water

The sea, lakes and rivers of the 3D world are drawn by one material (`src/lookprobe/stage/materials.ts`) whose
colour, surface and what it gives back come from `src/lookprobe/sea.ts`. EU5's map is the bar of quality (as a
comparison only: nothing of its look or assets is copied).

## The gauntlet

`tools/lookprobe/gauntlet_water.py` finds the water in a picture (blue to cyan, not grey; foam and boats inside it
count as water) and measures, by each dot's distance from the shore:

| row | what | bar (EU5) |
| --- | --- | --- |
| Streifen | share of the ripples' energy in their single strongest wave (rows of regular waves) | ≤ 0.06 (EU5 0.01–0.02) |
| Kräuselung | spread of lightness less its blur over 3 dots | 1.3–2.7 (EU5 1.3–2.7) |
| Farbe offen | CIELAB of the water from 80 dots out | ΔE ≤ 8 to 47/-11/-15 near, 42/-6/-15 farther |
| Farbe Ufer | CIELAB 4 to 20 dots out | ΔE ≤ 8 to 49/-8/-15 near, 52/-11/-12 farther |
| Flachwasser | how much lighter the water by the shore is than the open water | 1.5–15 L (EU5 2–15) |
| Glanz | share of the water at least 14 lighter than its surroundings (glints, white crests) | 0.1–1 % near, ≤ 0.5 % farther (EU5 0.03–0.45 %) |

The bar was read off 16 screenshots of EU5 from its Steam page (19 November 2026); the seven that show coasts are in
the project's files under `wasser/referenz_eu5` (not in the repository). Five scenes, six rows each:

```
npx vite --port 5199 &
PROBE_URL=http://localhost:5199 tools/lookprobe/water_shots.sh /tmp/water     # ~3.5 min, all five at once
python3 tools/lookprobe/gauntlet_water.py --gauntlet /tmp/water
python3 tools/lookprobe/gauntlet_water.py some.png[:x0,y0,x1,y1]                # the measurements of any picture
```

## Round 1 (19 November 2026): 7 → 30 of 30

Before, six long-crested sine waves made the surface: from near they stood in rows and showed as corrugated stripes
(0.5 to 0.8), the water was a light green turquoise (ΔE 13 to 20 off), the coast had no lighter band (1 L), from
the middle distance on the sea was smooth (0.2), and nothing glinted.

- **Waves from a picture:** `waveTexture` makes a 256² height field once at the start, random phases with power
  falling as k⁻⁴ (every octave holds the same share of the slopes), mostly with the wind, by an inverse FFT, so it
  repeats seamlessly. It is laid over the world at the two octaves whose texels are 1.4 to 2.8 dots wide there,
  faded from one to the next: the sea is rippled alike from every distance, never finer than a dot. The octave is
  chosen by the geometric mean of a dot's width and height on the water (by the larger side the slanted view
  stretched the waves into streaks across the picture). Every other octave is turned a quarter round; the coarse ones
  take the view's place modulo 65536 blocks, the fine ones modulo 1024.
- **Colour:** muted blues (`OPEN`, `COAST`, `OCEAN`, `ABYSS`), darker in the nearest views against their brighter
  light. The colours of the water's corners (terrain.ts, prebuilt in the tables) are only read back for how near the
  coast a point lies: no table had to be rebuilt.
- **The coast's band:** the corners' band is a column or two wide (the sea's faces merge the open water). Wider out,
  the depth picture now carries the coast's signed distance beside the depth (`withCoast`, computed at load from
  `public/map/depth.png`), and the water is lighter within 46 dots of the coast; from near, where a dot of the depth
  picture is wider than 110 to 220 dots, the band is the corners' alone.
- **Glints and crests:** from near the light the water mirrors stands across the water from the eye, 2.3 to 3 spreads
  of the slope above the eye's own height, so only the steeper waves glint; crests that are high and steep break
  white where the wind is strong.

Before and after: project files `wasser/runden/vorher_nachher.jpg` and `nah_vorher_nachher_eu5.jpg`.

**What is still open:** the waves stand still (EU5's move; moving them needs pictures drawn by the clock, which the
on-demand stage avoids); EU5's water is a little more saturated than ours although within the bar; rivers keep the
coast's light turquoise all along; the coast's band from the depth picture is soft and can stand a few dots off the
blocky coast at the middle distance; no surf line at the beach.
