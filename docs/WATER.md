# Water

The sea, lakes and rivers of the 3D world are drawn by one material (`src/lookprobe/stage/materials.ts`) whose
colour, surface and what it gives back come from `src/lookprobe/sea.ts`. EU5's map is the bar of quality for how
the water changes with the distance (as a comparison only: nothing of its look or assets is copied); its colours are
the model's own, as clear and full as the land's.

## The gauntlet

EU5's water changes with the distance it is seen from, and the gauntlet holds each distance to its own kind:

| kind | scene | EU5 | what it looks like |
| --- | --- | --- | --- |
| diorama | `d60_valencia`, `d190_venezia` | none (EU5 cannot come this near) | the model's own: clear azure, a light rim along the coast, a calm swell, small white strokes |
| nah | `n1000_attika` | its nearest view (an island across the picture) | turquoise shallows, blue beyond, a swell and white strokes |
| mittel | `m3000_aegaeis` | a sea across the picture | smooth; light turquoise shelves, deep blue beyond |
| fern | `f12000_aegaeis` | half the Mediterranean | smooth; the shelves as light haloes round the coasts |

From some 36000 blocks across on the realms' paper map takes over (its sea: `src/worldprobe/paint.ts`).

`tools/lookprobe/gauntlet_water.py` finds the water in a picture (blue to cyan, not grey; foam and boats inside it
count as water, small islands do not) and measures, by each dot's distance from the shore, seven rows per scene:

| row | what | bar | EU5 |
| --- | --- | --- | --- |
| Streifen | share of the chop's energy in its single strongest wave (rows of regular waves) | ≤ 0.06 | 0.01–0.05 |
| Kräuselung | spread of lightness less its blur over 3 dots | ≤ 2.4 near, ≤ 1.2 from the middle distance | 1.8–2.4 nearest, 0.7–1.0 middle |
| Sättigung zum Land | median HSV saturation of the water over the land's beside it | ≥ 0.85 | 0.87–3.1 |
| Farbton offen | CIELAB hue of the water from 80 dots out | 215–275° | 217–270° |
| Ufer grüner | how much greener the water 4 to 20 dots out is than the open water | ≥ 5° | 0–29° |
| Flachwasser | how much lighter the water by the shore is than the open water | 3–15 L diorama, 4–15 nah, 5–25 farther | 5–12 nearest, 8–23 middle, 9 far |
| Flocken | share of the water at least 14 lighter than its surroundings (white strokes, glints) | 0.05–1 % diorama, 0.03–0.5 % nah, ≤ 0.05 % farther | 0.07–0.39 % nearest, 0 farther |

The saturation row holds the water to the rest of the world: the land of the model is far fuller in colour than
EU5's, so its water must be too (EU5's water is about as full as its land, or fuller). It counts HSV's saturation,
the share of the fullest colour a screen shows at that hue, not CIELAB's chroma, which would hold a blue to a
green's fullness that no blue of the water's lightness reaches.

The bars were read off 16 screenshots of EU5 from its Steam page (19 November 2026) and 23 of the players' most
liked screenshots from its Steam community (20 November), each cut to its water without the panels; they are in the
project's files under `wasser/referenz_eu5` and `wasser/referenz_eu5/zoomstufen` (not in the repository).

```
npx vite --port 5199 &
PROBE_URL=http://localhost:5199 tools/lookprobe/water_shots.sh /tmp/water     # ~4 min, all five at once
python3 tools/lookprobe/gauntlet_water.py --gauntlet /tmp/water
python3 tools/lookprobe/gauntlet_water.py some.png[:x0,y0,x1,y1]                # the measurements of any picture
```

## Round 3 (20 November 2026): the near view

Round 2 was right from the middle distance on; from near three things were still off: the white flecks were small
specks strewn evenly over the water and read as snow, the light rim along the coast was as uneven as the patches of
light and shade of the water's corners, and the coast had no surf line.

- **The rim by the corners' hue:** the corners' colours (terrain.ts, prebuilt in the tables) are WATER_SHALLOW at the
  coast, mixed towards WATER_DEEP within some 8 columns, and each mix made a tenth lighter or darker in broad
  patches. Round 2 read how near the coast a point lies from the corners' lightness, so the patches went into the
  rim; now it is read from their green over their blue, which a lighter or darker shade leaves as it is (the mix's
  share worked back exactly from that ratio; the corners are bytes, which leaves it some 6 % uncertain). The rim
  is now as wide along the whole coast as the mix is, and the patches come from the corners' blue against the
  mix's.
- **The strokes:** the flecks' waves are longer (4 to 11 texels instead of 3 to 8) and run within a narrower spread
  of the wind (the cosine's 12th power instead of its 8th), so that a crest breaks white as a short stroke across
  the wind, not as a speck; the picture of them is bent by a smooth field of up to 2.5 texels, so that the strokes
  curve a little. The flecks' octaves are no longer turned a quarter round against each other (two octaves faded
  into each other crossed as small X's), only by 0.45 radians; they are a little less white (0.8) and a little more
  frequent. A narrower band of waves made the strokes longer still, but its crests came in groups of parallel
  strokes, which the stripes row caught (0.064 at `d60_valencia`); with the band from 24 to 64 waves across the
  picture and the stronger bend it is 0.02.
- **No surf line:** a line of foam along the coast would need to know a beach from a quay: the water's corners carry
  only how far the coast is, and in Venice's canals, a column or two wide, such a line would cover the water. It
  would need a field of its own in the tables (and a rebuild of them).

The gauntlet was 35 of 35 before (round 2 on today's main) and is after; this round's changes are in what it does
not hold: weighted by their size, the white flecks are now 13 to 22 dots long from near (5 to 7 before; EU5's
nearest view: 5 to 11, in clusters of many small flecks, which ours are not), and the rim is as wide along the whole
coast. Before and after: project files `wasser/runden/runde3_vorher_nachher.jpg`; the gauntlet's rows
`runde3_gauntlet_vorher.txt` and `runde3_gauntlet_nachher.txt`.

## Round 2 (20 November 2026): each distance its own water, in the model's colours

Round 1 had been measured close to EU5's nearest view at every distance, and Ramon found it looked neither like EU5
nor like the rest of the world: one photographic wind sea from a street to a continent, a muted grey blue beside a
land of clear bright colours (its water was 0.56 to 0.79 as saturated as the land from near and in the middle
distance; EU5's is 0.87 to 3.1). Its own bar had been read partly off pictures with panels, labels and the lines
between sea zones. Held to the new bar it reaches 24 of 35 rows (the chop at every distance, the saturation, no
white flecks where EU5 has them); round 2 reaches 35 of 35.

- **Colour from the depth:** `RAMP` runs from light turquoise at the coast through a clear blue over the shelf (some
  30 m), a deeper blue at its edge (some 150 m) and over the slope (700 m) to a dark blue over the deep sea (3000 m),
  as full in colour as the land. The sea's shelves and its deep basins now show from the middle distance on, as on
  EU5's map. From near, all the picture lies within a dot or two of the depth picture, whose depth runs down to the
  coast's across them: there the water beyond the corners' band takes the shelf's colour.
- **The coast:** from near the corners' band is a light turquoise rim a column or two wide; wider out the halo from
  the depth picture's coast distance (40 dots) draws the shallows round every island.
- **The surface by distance:** the fine wind sea is gone. From near and to the nearest of EU5's distances a calm
  swell of long waves (2 to 14 across the wave picture) mirrors the sky and what stands by the water, and white
  strokes break where a short crest running with the wind rises above 2.35 spreads (lower in the gusts); the strokes
  are laid an octave coarser than the swell, so that each is 4 to 20 dots long and never a grey hatching. Both fade
  out between 0.5 and 1.3 blocks to a dot (some 800 to 2000 blocks across the picture): from there the sea lies
  smooth, its colour the depth's alone.

- **The backdrop:** `OPEN_WATER` (terrain.ts), the picture's backdrop and the colour the mirror gives back where
  nothing stands by the water, is the shelf's blue as lit, no longer the turquoise of the water's corners: beyond the
  farthest pieces it showed as a turquoise wedge against the blue sea. (The corners' colours themselves are kept in
  the prebuilt tables and stay as they were.)

Before and after, with EU5 at a like distance: project files `wasser/runden/runde2_vorher_nachher_eu5.jpg` and
`runde2_nah_vorher_nachher.jpg`; the gauntlet's rows `runde2_gauntlet_vorher.txt` and `runde2_gauntlet_nachher.txt`.

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

**What was still open** after round 1 (and is after round 3, but for the colour and the coast's rim from near): the
waves stand still (EU5's move; moving them needs pictures drawn by the clock, which the on-demand stage avoids);
rivers keep the coast's light turquoise all along; the coast's band from the depth picture is soft and can stand a
few dots off the blocky coast at the middle distance; no surf line at the beach (from near the corners' rim stands
in for it).
