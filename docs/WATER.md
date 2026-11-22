# Water

The sea, lakes and rivers of the 3D world are drawn by one material (`src/lookprobe/stage/materials.ts`) whose
colour, surface and what it gives back come from `src/lookprobe/sea.ts`. EU5's map is the bar of quality for how
the water changes with the distance (as a comparison only: nothing of its look or assets is copied); its colours are
the model's own, as clear and full as the land's. Since round 5 the water is calmer than EU5's from its nearest
distance on, as the low-poly worlds' water is, and its coasts have foam (Ramon's word, 20 November 2026); since
round 6 the foam runs in smooth bows, since round 8 the bed shows through the shallows and the open water is rippled,
since round 9 the lakes and rivers above the sea have the sea's water too (until then they were flat sheets of
one colour, drawn as the land is), and since round 10 a depth has one colour at every distance.

## The gauntlet

EU5's water changes with the distance it is seen from, and the gauntlet holds each distance to its own kind:

| kind | scene | EU5 | what it looks like |
| --- | --- | --- | --- |
| diorama | `d60_valencia`, `d190_venezia` | none (EU5 cannot come this near) | the model's own: clear azure, a light rim along the coast with lines of foam coming in, a calm swell, small white strokes; it moves |
| nah | `n1000_attika` | its nearest view (an island across the picture) | turquoise shallows, blue beyond; calm (EU5 has a swell and white strokes here) |
| mittel | `m3000_aegaeis` | a sea across the picture | smooth; light turquoise shelves, deep blue beyond |
| fern | `f12000_aegaeis` | half the Mediterranean | smooth; the shelves as light haloes round the coasts |

From some 36000 blocks across on the realms' paper map takes over (its sea: `src/worldprobe/paint.ts`).

`tools/lookprobe/gauntlet_water.py` finds the water in a picture (blue to cyan, not grey; foam and boats inside it
count as water, small islands do not) and measures, by each dot's distance from the shore, seven rows per scene, and
four more where the water moves (the diorama: pictures at 0, 1/30 and 0.5 seconds, `water_frames.mjs`):

| row | what | bar | EU5 |
| --- | --- | --- | --- |
| Streifen | share of the chop's energy in its single strongest wave (rows of regular waves) | ≤ 0.06 | 0.01–0.05 |
| Kräuselung | spread of lightness less its blur over 3 dots | ≤ 2.4 diorama, ≤ 1.2 from EU5's nearest distance | 1.8–2.4 nearest, 0.7–1.0 middle |
| Sättigung zum Land | median HSV saturation of the water over the land's beside it | ≥ 0.85 | 0.87–3.1 |
| Farbton offen | CIELAB hue of the water from 80 dots out | 215–275° | 217–270° |
| Ufer grüner | how much greener the water 4 to 20 dots out is than the open water | ≥ 5° | 0–29° |
| Flachwasser | how much lighter the water by the shore is than the open water | 3–15 L diorama, 4–15 nah, 5–25 farther | 5–12 nearest, 8–23 middle, 9 far |
| Flocken | share of the water at least 14 lighter than its surroundings (white strokes, glints) | 0.05–1 % diorama, ≤ 0.05 % farther | 0.07–0.39 % nearest, 0 farther |
| Bewegung | mean change of the water's lightness in half a second | ≥ 0.8 | none (no moving pictures) |
| Flimmern | share of the water whose lightness changes by more than 20 from one picture to the next (1/30 s) | ≤ 0.3 % | none |
| Schaumsaum | how many points of % more of the water within 4 columns of the shore is white (saturation < 0.3, L > 72) than of the open water, over the three pictures | ≤ 1.0 (a least of 1.0 until round 8) | 0.1–0.9 nearest (rounds 5 and 6: 4–5) |
| Schaumbögen | how many degrees the direction of the foam's lines (white shapes by the coast at least 40 dots long) turns to a dot along them, on the median | ≤ 1.3 | none (round 5: 2.2 Valencia, 2.1 Venice) |

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
PROBE_URL=http://localhost:5199 node tools/lookprobe/water_frames.mjs /tmp/w/d60 "lon=-0.33&lat=39.45&wide=60" 36x0.0833
                                                                   # a row of stills of the moving water (3 s)
```

## Round 10 (22 November 2026): one colour for a depth, a deeper offing

Ramon's "ok" to what was still open after round 9: the tone of the open sea from near, and the colour tipping from
teal to blue as the view rises.

- **One colour for a depth at every distance.** Round 9 gave each stop of `RAMP` a second, greener colour for the
  near view, which gave way to the first within one doubling of the distance (130 to 280 blocks across). A lake went
  from hue 235° at 100 blocks across to 252° at 300. EU5's water changes its colour with the depth, not with the
  distance (213° over its shallows, 242° to 261° over deep water, in its nearest views alike). `RAMP` has one set of
  colours again, halfway in CIELAB between the two sets of round 9. The lake is 244° to 245° from 100 to 450 blocks
  across; the far views are 4° to 5° less violet than they were (Attica 1000: 255°, was 260°).
- **The offing's depth fades evenly.** From near the sea is at least as deep in colour as it lies from the coast
  (`OFFING`). That went by the near view's switch too; it now fades over three doublings (`NEAR_UNTIL`, 150 to 1200
  blocks across in a picture 1672 dots wide), so a shallow sea does not grow lighter at once as the view rises.
- **A deeper offing** (`OFFING` 0.1 to 0.55 over 3 to 60 blocks, was 0.06 to 0.5 over 4 to 80) and **quieter
  ripples**: the strokes of lighter water are a third fainter and their troughs twice as dark (`RIPPLE_SHARE` 0.2,
  `TROUGH` 0.16, were 0.3 and 0.08). The strokes lay on the water as the white lines of a drawing; EU5's ripples have
  a light and a dark side.

Measured as in round 9 (EU5's nearest views | round 9 | round 10, at Valencia 60, Venice 100 and 190): the open
water's colour L 43–61, a −3 to −19, b −11 to −21 | 54–58, −18 to −22, −16 to −23 | 53–55, −17 to −19, −19 to −25;
the lightness blurred over 25 dots, between its 5th and 95th hundredth, 11–21 | 9–13 | 8–16 (Valencia 16, Venice 10
and 8: the lagoon is no less even than it was). The gauntlet is 43 of 43; Valencia's open hue is 229° (was 217°, at
the bar's green end). Still short of EU5: over deep water its near sea is darker and greyer (L 42 to 44, chroma 14
to 21 in two of its nearest views; ours is L 53 to 55, chroma 27 to 28), and it has soft foam round its whitecaps;
Venice's lagoon is still a light, even blue from 300 blocks across; WebGPU and retina were not seen in the cloud.
Before and after: project files `wasser/runden/runde10_*`.

## Round 9 (21 November 2026): lakes and rivers, a greener near sea

Ramon's "weiter" after round 8. Two things were open: water above the sea had none of the new water, and the open sea
from near was one light blue beyond its shallows, bluer than EU5's.

- **Lakes and rivers.** Water above the sea (terrain.ts `buildWater`, the stage's `raised`) was drawn with the land's
  material: a flat sheet of its corners' colour. It now has three materials of its own (`stage/materials.ts`: `lake`
  for its lists, `lakeSinking` for lists that glide between two steps of the view, `lakeFreed` for its rectangles on
  no grid) with the sea's colour, swell, ripples, flecks and glitter. It gives the open sky back, not the mirror's
  picture, which is taken at the sea's level. The depth picture knows no depth there, so the water is as deep in
  colour as it lies from its banks (`INLAND`), over a bed that falls steeply (`BED_INLAND_*`: under the sea's
  shelving bed a river three columns wide was a pale band); no surf runs up its banks. The upright sheets of its
  falls stay as they were. Seen at Lake Geneva from 100 to 1200 blocks across and at Paris from 60 to 420: no jump
  from one step of the view to the next.
- **The near sea's colour.** Each stop of `RAMP` has a second colour for the near view (until round 10): greener, a
  teal that darkens to a slate blue. It darkens faster and further into the offing (`OFFING` 0.06 to 0.5 over 4 to 80 blocks, was 0.1
  to 0.34 over 8 to 110) and lies in lighter and darker patches over the bed's banks and hollows (`RELIEF`,
  `bedRelief`). From some 300 blocks across nothing changes.
- **Fine stripes.** The steeper fall into the offing showed dotted stripes a few dots apart. The width of a dot of the
  depth picture was reckoned from how far the place on the picture moves from one dot of the view to the next; from
  near that is a thousandth of a dot of the picture, a few steps of what a 32 bit number holds of a place on the
  whole map, and the width came out a quarter off from dot to dot. `sea_depth.ts` now reckons it from the view's step
  in finest blocks (exact) and the stage's place on the picture.

Measured with one script on pictures cut to their water (EU5's nearest views | round 8 | round 9, at Valencia 60,
Venice 100 and 190): the open water's colour L 43–61, a −3 to −19, b −11 to −21 | 56–59, −17 to −21, −21 to −26 |
54–58, −18 to −22, −16 to −23; the lightness of the water blurred over 25 dots, between its 5th and 95th hundredth,
11–21 | 7–8 | 9–13. The gauntlet is 43 of 43; Valencia's open hue is 217°, at the green end of its bar (215°) and of
EU5's pictures. Still short of EU5: its near water is deeper and richer in tone, with soft foam round its whitecaps;
the colour changes more than before between the near view and 300 blocks across; WebGPU, retina and a lake's glide
between two steps were not seen in the cloud. Before and after: project files `wasser/runden/runde9_*`.

## Round 8 (21 November 2026): the near water itself

Ramon, on a sketch of piers and boats that was to liven up the coast: "das wasser ist das problem nicht die umgebung".
(Round 7, a set of low-poly prototypes, was turned down and is not in the game.)

- **The bed shows through the shallows** (`sea_bed.ts`): sand at the water's edge, turquoise over it, then the sea's
  blue, by Beer-Lambert's law over a bed that falls evenly from the water's edge, flat or steep by the depth picture.
- **Ripples** under the flecks: the flecks' own waves at a lower line, as strokes of lighter water with darker
  troughs; the flecks are half as large and come in groups that drift at the waves' group velocity. The swell is two
  and a half times fainter.
- **The shore:** a thin line at the water's edge and faint lines coming in, where rounds 5 and 6 had two thick rows
  of foam. The gauntlet's foam row turned round with it: a most of 1.0, read off EU5's nearest pictures.

Before and after: project files `wasser/runden/runde8_*`.

## Round 6 (21 November 2026): the foam in smooth bows, clear flecks

Ramon asked "bist du glücklich mit der grafik?", and from near the answer was no: the lines of foam ran in zigzags,
and the open water had grey smudges among its white strokes.

- **Why the lines were jagged.** The distance to the coast is read from the colour of the water's corners, and the
  stage has those as bytes (`worldprobe/small.ts`). WATER_SHALLOW and WATER_DEEP differ by 3 % in their green to
  their blue, which the bytes tell in some seven steps: a corner's distance is off by a quarter of a column on the
  mean, each corner its own way, and a line drawn by it kinks at every corner.
- **The corners' distance, smoothed** (`sea_corners.ts`): where the stage makes the mesh of the sea's faces, each
  corner takes the distance of the plane that fits the corners within 3 columns of it best. The faces carry it as a
  byte to a corner beside their colours, and `sea_shore.ts` draws the foam by it. A plane, not a mean: a piece knows
  its own sea alone, and at its edge a mean lies to one side, so that the lines of two pieces would not meet. On a
  coast that bends, the smoothed distance is off by 0.07 of a column (the bytes' own: 0.25) and two pieces agree at
  their edge to 0.04 (`tests/worldprobe/sea_corners.test.ts`). It takes under 10 ms for a piece that is all coast,
  and next to nothing for a piece of open sea; the pieces' key does not change (the stage's code, not the builders').
- **The lines** run on to where the land's edge shows (1.9 columns, was 2.2) and are gone as they meet it; they are
  white (were 0.9 of it), thinner towards the ends of their dashes, sway a little along the coast, each of the two its
  own way, and the wash lies behind them, out to sea (it lay before them).
- **The flecks** of two octaves were drawn each by itself and then mixed: one half faded in was a grey smudge. Now
  the two octaves' waves are added first and the flecks drawn of the sum: every fleck is white.

The gauntlet has a row for the bows (Schaumbögen: how fast the foam's lines turn, in degrees to a dot along them). It
was 43 of 43, round 5 by the same bars 41 of 43 (its foam turned 2.2 and 2.1 degrees to a dot, now 0.9 and 1.0). Before
and after, and the foam coming in: project files `wasser/runden/runde6_*`.

## Round 5 (20 November 2026): calm water, foam along the coast

Ramon on round 4: "leider ist das mülli... weil man sieht extrem weit rausgezoomt immer noch wellen. auch gibt es
schöneres wasser auch im poly bereich nicht?" Two things were wrong, and the water now follows the low-poly worlds'
rather than EU5's nearest view.

- **The waves reached too far, twice as far on a screen of fine dots.** How far the swell and the flecks reached went
  by the picture's dots: on a screen that draws two dots for every one (the stage draws at the screen's pixel ratio,
  up to 2), the swell reached twice as many blocks out, some 6000 across the picture. Now it goes by the screen's
  dots (`RATIO`), and reaches far less: fully up to some 400 blocks across a picture 1672 dots wide, gone from 1000;
  the flecks and the glitter up to 200, gone from 500 (before: 3000 and 2200). From EU5's nearest distance on the
  sea is calm.
- **Foam along the coast** (`sea_shore.ts`): lines of foam come in to the shore, one every 2.25 seconds, from some
  4.5 columns out to 2.2, growing as they come and fading before they reach the land, with a lighter wash behind
  them, broken into dashes by the flecks' waves. How far a point lies from the coast is read back from the water's
  corners (terrain.ts mixes them by k = smooth(0.4, 8, d)); in a canal or a river, a column or two wide, d stays
  under two columns and no line comes. A line shows only where d rises from the coast (by at least 0.3 to 0.6 of a
  column to a column): in a canal's middle, as far from both banks, it is flat, and a line passing its depth lit the
  whole middle white. They show up to some 800 blocks across, gone from 1500.
- **No light lines on the bed of the shallows:** they read as scribbles. The rim along the coast takes a little more
  of the coast's colour from near instead (0.85, was 0.7), so that the shallows stay as light.

The gauntlet follows: 'nah' is held to the middle distance's chop and flecks and no longer moves, and the diorama has a
third row of motion, the foam along the coast (Schaumsaum: how many points of % more of the water within 4 columns of
the shore is white than of the open water; round 4 0.42 and 0.14). The water mask counts the foam by the coast as water,
as it did the foam within the water, so that the foam does not move the shore: light dots within 6 dots of the water,
bluish, or white in the sun's warm light (the land's pale stone by the water is darker or redder). Without it Venice's
shallows measured 2.8 instead of 3.8, the same picture by round 4's mask 4.2. It was 41 of 41, round 4 by the same bars
37 of 41 (no foam along the coast; 'nah' too rough, chop 1.23 and flecks 0.13 %). A live picture on a screen of two dots
a point could not be taken in the cloud (the software renderer does not finish a live picture while the water moves);
the reach holds there by its making: `RATIO` is the pixel ratio the stage draws at (stage/index.ts:155), so such a
screen shows the water as a still of 1672 dots does. Before and after, and the foam coming in: project files
`wasser/runden/runde5_*`.

## Round 4 (20 November 2026): the water moves

Ramon found round 3 still not really beautiful, and asked for the water to move. The surface is still drawn from the
one wave picture; it now drifts, and two things were added that only show from near.

- **Motion:** each octave of the swell is read twice, the second time turned by 0.8 radians, and both drift with the
  wind, the second at two thirds the pace: the two cross and the swell changes as it runs, rather than sliding by as
  one sheet. A wider octave drifts fewer of its spans a second, by the fourth root of its span (on the sea longer
  waves run faster by the square root; by that, the water from EU5's nearest distance looked all but still). The
  flecks' waves drift 1.6 times as fast, and each fleck lives some 3.5 seconds: its line rises and falls by up to 1.1
  spreads, in each patch of the swell at another time, so that the flecks come and go in groups. Nothing of the mesh
  moves (the pictures' motion vectors stay nil). The stage draws every picture while the swell shows in the middle
  of the picture (and half as far again, for the nearer bottom of it), as it does for walking figures and without
  redrawing the shadows of what stands still (KeptShadow); a still of fixed size (`?w=`) shows the water at
  `?seatime=` seconds (0).
- **The swell reaches farther:** it shows fully up to 0.8 finest blocks to a dot and is gone from 1.8 (0.7 and 1.6
  before), and it is a little stronger (slopes of 0.028 instead of 0.022), so that the water from EU5's nearest
  distance moves too; the flecks and the glitter keep the old reach (to 0.5 and 1.3), or they grow more than EU5's
  nearest view shows.
- **Light on the bed of the shallows:** from nearest, within the light rim along the coast, thin light lines where
  either of two pictures of the swell at half its span, drifting apart, crosses its middle: the light the shallows'
  waves gather on the sand, as a network that shifts.
- **Glitter:** small points where two of the flecks' pictures an octave finer than the swell, turned apart and
  drifting against each other, both peak: they meet and part again, so the points twinkle; more at a slant.
- **No surf line from the depth behind the water:** a line of foam where the water meets the land could be read from
  the scene's depth behind the water, but the scene's pass draws with 4 samples (MSAA), and a copy of its depth
  under WebGPU cannot be tried in the cloud. It stays open.

The gauntlet has two new rows, where the water moves (above); their bars are not read off EU5, of which no moving
pictures were at hand. It was 38 of 41 before (round 3 on today's main: the water stood still, its motion 0 in the
three near scenes) and is 41 of 41 after: motion 1.14 and 1.32 in the dioramas, 0.88 from EU5's nearest distance,
flicker at most 0.01 %; the flecks stay within their bars (0.47, 0.67, 0.13 %). Before and after, and the water
moving: project files `wasser/runden/runde4_*`; the gauntlet's rows `runde4_gauntlet_vorher.txt` and
`runde4_gauntlet_nachher.txt`.

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
