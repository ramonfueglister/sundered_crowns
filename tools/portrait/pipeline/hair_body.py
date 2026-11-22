# Hair as a modelled body (round 109), built in Blender: a dark shell over the skull, and on it layers of thick
# bundles that run from the whorl to the line the hair is cut at, each a ridge with flanks. Until round 108 a
# head's hair was some 950 narrow locks, each begun where its strands were rooted: scales all over the head and a
# fringe of stepped bands. A bundle here begins under the bundles above it and shows its length and its end only.
# Since rounds 171 and 172 the bundles are fine strands (below), and no cut frays into wisps at its end (rounds
# 138 to 170 did: `fray`, taken out in round 172 when the last cut that used it, `page01`, became strands).
#
# Runs with Blender's Python (inside Blender, `blender -b -P hair_body.py -- ...`, or the `bpy` module from pip):
#   python hair_body.py base.obj outdir name [cut: another name's, if not its own]
# Writes `<name>_body.txt` (the builder's `mh_rope` reads it: points bound to the head, a shade for each, and
# triangles with their places in the image), `<name>_body_view.obj` to look at, and with `BLEND=path` the Blender
# file. Coordinates are MakeHuman's base.obj: y up, the face towards +z, 0.1 = 1 cm. Angles are seen from the hair
# scripts' centre of the head (`hairlib.Head.hc`): the hairline lies near 20 degrees, the brows near -25.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import bpy
from hairlib import Head, dirs, ang, unit, tangent, bind_points, in_blender, bake_ao

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
base, out, name = argv[:3]
cut = argv[3] if len(argv) > 3 else name

STEP = 0.02          # a bundle's way is traced in steps of 2 mm
VSCALE = 0.75        # the image's height to a unit of a bundle's length (10 cm), as the locks' image
W = dirs(180, 52)    # the whorl

# A cut: where the hair ends in front of the face and at the sides and back (degrees), how high it stands
# (`lift`: a factor on every height below) and how round its bundles are (`round`: a factor on every `flat`), the
# shell under the bundles (its height over the skin, how far above the cut it ends, its tone), how much thinner
# the hair is at its ends and over what length, and the layers of bundles from the lowest to the topmost.
# `comb`: the hair is combed, neighbours lie the same way: how far all bundles swing to the side together and the
# length of that swing along the hair (the swing's place changes slowly round the head), and how far the bundles
# of a side lean one way together at their ends, over what length before the end.
# A layer: how many bundles round the head (`n`); their breadth as a share of the room each has between its
# neighbours at the cut (`fit`; `vary`: how far a bundle's place is off the even one, as a share of the even room:
# broad and narrow bundles side by side, and none missing) or in units (`w`: least, greatest: single strands);
# how high a bundle's ridge stands over its middle, as a share of its half breadth (`flat`); its middle's height
# over the skin (`h`); how far from the whorl its bundles begin (`roots`, radians: one of these in turn round the
# head) or how long they are (`long`: least, greatest); how far up or down the cut's line a bundle ends (`ends`,
# degrees: least, greatest); the length of its slanted end (`tip`); how far it swings to the side by itself
# (least, greatest) and the length of that swing as a share of its own (least, greatest): a bow; how much it
# leans over to one flank (`roll`); its tone against the hair's colour. `curl` (a cut's): how far a bundle swings
# to the side and off the head, and the length of a wave: curly hair. `turn` (a cut's, round 133): at the
# sides and behind each bundle's end is turned out and up into a roll (not over the forehead: from 45 degrees
# round, in full from 70): through how many degrees (least, greatest), the roll's radius (least, greatest: of the
# roll's middle over the topmost layer), how far at most it runs to the side for each radian turned (a corkscrew,
# not a hoop), how much of the shade the bake gives the turned band's underside is taken back, how much of the
# roll's length the bundle's slanted end may take, and how much of its breadth the bundle has left where it ends.
# A layer's `point` (round 141; how much of the slant its end is cut at is left, and a power on the way along its
# end by which it narrows): a lock, broad along its length, narrowing over `tip` to a point near its middle, as a
# leaf does. From round 141 to 170 a bowl cut had two layers of such locks over its two layers of bundles; since
# round 171 it is of strands (below).
# All PLACEHOLDER by eye, beside the reference's bowl cuts (docs/PORTRAITS.md, round 109).
# (round 147) `cut` -5 degrees (-12.5 until then): the fringe ends on the middle of the forehead, as the
# reference's bowl cuts do; at -12.5 it ended two fingers over the eyes, on the brows in a picture.
# (round 171) A bowl cut of fine strands, made and looked at in the Blender on Ramon's Mac (through its MCP add-on;
# docs/PORTRAITS.md). Beside the reference's bowl cut, a close cap of fine hair with a thick round rim, the cut of
# rounds 109 to 168 was a thatch: 128 bundles and locks of 1 to 4 cm, each a ridge, standing 2 cm and more off
# the head. Now three layers of 70, 200 and 180 strands, the upper two some 5 mm broad and nearly flat, 1 cm off
# the head, no locks and no wisps. A layer's new keys: `m` (corners across a strand: 3, the lowest layer's 5),
# `across` (the image's breadth in units: a strand takes of the image what it is broad, so the image's hairs are
# as fine on it as on a bundle), `ring` (a ring every so far along it), `tuck` (over how long before its end a
# strand turns in to the head through a quarter of a circle, and how high over the skin it ends: the rim is
# round, and closed below), `blunt` (how much of its breadth it has left at its end), `tones` (how far a strand's
# tone is off the layer's), `clump` (False: the layer has no clumps). A cut's new keys: `clump` (how many clumps
# round the head; how much of the way to its clump's middle a strand goes at its end; over what length before
# the end; how uneven the clumps' places are; by how many degrees a clump ends above or below the cut's line:
# strands end together in clumps a finger broad, with small notches between them, as the reference's fringe
# does), `corner` (from how many degrees round the head, and over how many, the fringe's line steps down to the
# sides': 57 and 3, a step; no strand ends on it, `rim()`: until then, over 45 to 70 degrees, strands ended one
# under the other down the temple, a ladder), `curl`'s fourth number (how far a strand's waves are off its
# neighbours': combed waves). `FLAT`: the lift of hair under a hood, a hat, a circlet and round a bare top
# (0.38: as high as the bundles were there, 0.5 cm; at 0.45 hair came through a lord's circlet on three heads
# of eighty, at 0.22 a hood's rim stood open over it). All PLACEHOLDER by eye, in Blender and in the portrait.
# (round 177) A fringe of pointed tufts, made and looked at in the same Blender. Round 171's fringe was a ruled
# line with square notches and a step down at the temple; the reference's bowl cuts, looked at again at three times
# their size, end in points a finger broad and of uneven length, and their fringe runs round the temple into the
# sides. A cut's `tuft` (how many degrees above its clump's line a strand at the clump's border ends; the power of
# the way from the clump's middle to its border by which it does; how much of that the cut has at the sides and
# back; by how many degrees more a clump of the fringe ends above or below the cut's line): a clump ends in a
# point. With it `clump` is 28 clumps whose strands go a third of the way to the middle (36 and four fifths: with
# the points that was a row of spikes) and `corner` 48 and 18 (57 and 3: the step). All PLACEHOLDER by eye.
# (round 178) Locks, made and looked at in the same Blender. Since round 171 every strand lay by itself: its own
# height, its own lean, its own tone and its own place in the image, so the top of a bowl cut was a field of fine
# stripes, a wig of straw; the reference's is a close cap of broad locks. A cut's `lock`: the strands that end in
# one clump lie in one arch from the whorl to their ends. Its numbers: how much higher the strand at a clump's
# middle lies than one at its border (units of 10 cm: 1.6 mm; each strand leans as the arch does where it lies);
# how much higher one border lies than the middle and the other lower (to either side by chance, a half to the
# whole of it): locks overlap as tiles do; from what angle from the whorl, and over how many more (radians), the
# arch comes in: none where the strands begin; how far a lock's tone is off the hair's; how much a strand keeps
# of its own tone, lean and height; how much of the image's breadth a lock takes to either side of its middle
# (strands side by side take neighbouring places of the image, so its hairs run on from strand to strand); how
# much lower than the full arch a lock's may be (uneven); how much of its own arch (`flat`) a strand keeps.
# 0 as the first: none, and the files are round 177's. A cut's `low` (hair that lies flat, `FLAT`): its locks'
# highest place is the height its strands had. All PLACEHOLDER by eye.
# (round 179) Round 178's locks were all one clump broad and ran side by side from the whorl to the rim: ribs. The
# reference's are of uneven breadth and lie over one another. `lock`'s tenth number: the chance by which a clump
# joins the one before it round the head (three at most to a lock; 0: every lock one clump). Its eleventh and
# twelfth: by how much a lock bows to one side (units of 10 cm: up to 7 mm, each lock by its own chance) and over
# what length before its end (12 cm; the end stays where the fringe has it). With `0,0,1` as the last three the
# files are round 178's. All PLACEHOLDER by eye.
# (round 172) Parted hair of fine strands, made and looked at in the same Blender (docs/PORTRAITS.md): `PARTED`
# and the cuts made of it, below.
_e = lambda k, d: [float(t) for t in os.environ.get(k, d).split(',')]
BOWL = dict(
    cut=-5.0, end=-43.0, corner=tuple(_e('CORNER', '48,18')), over=(8, 6, 35, 30), lift=1.0, round=1.0,
    comb=(0.012, 1.6, 0.05, 0.8),
    shell=dict(h=0.05, up=7.0, shade=0.7),
    thin=0.0, thin_over=0.5,
    clump=tuple(_e('CLUMP', '28,0.35,0.6,0.45,1.5')),
    tuft=tuple(_e('TUFT', '3.5,1.3,0.4,1.5')),
    lock=tuple(_e('LOCK', '0.016,0.016,0.15,0.5,0.06,0.4,0.3,0.6,0.2,0.45,0.07,1.2')),
    layers=[
        dict(n=70, fit=3.2, vary=0.3, flat=0.12, h=0.066, long=(1.2, 1.8), ends=(-0.3, 0.3), tip=(0.09, 0.12), tuck=(0.09, 0.02), blunt=0.8, point=(0.0, 2.0), m=5, across=0.3, ring=0.09, clump=False, wave=(0.002, 0.006, 1.2, 2.2), roll=0.1, tone=0.9, seed=3),
        dict(n=200, fit=1.9, vary=0.4, flat=0.22, h=0.082, roots=(0.1, 0.55, 0.3, 0.55), ends=(-0.5, 0.5), tip=(0.1, 0.13), tuck=(0.1, 0.02), blunt=0.7, point=(0.15, 2.0), m=3, across=0.3, ring=0.09, wave=(0.002, 0.006, 1.2, 2.2), roll=0.3, tone=1.0, tones=0.07, seed=5),
        dict(n=180, fit=1.6, vary=0.45, flat=0.26, h=0.098, roots=(0.1, 0.4, 0.25, 0.5), ends=(-0.4, 1.0), tip=(0.11, 0.14), tuck=(0.11, 0.025), blunt=0.6, point=(0.2, 2.0), m=3, across=0.3, ring=0.09, wave=(0.003, 0.008, 1.2, 2.2), roll=0.35, tone=1.04, tones=0.07, seed=11),
    ],
)

# The cuts by the name of their file: England's men, boys and small children (`portrait/src/dress.rs`
# `ENGLAND_1356`)
CUTS = {
    'bob01': BOWL,                                          # to the ear's lower end
    'bob06': dict(BOWL, end=-31.0),                         # to above the ear
    'bob07': dict(BOWL, end=-51.0),                         # to the jaw
    'bob02': dict(BOWL, lift=_e('FLAT', '0.38')[0], round=0.6, low=True),   # under a hood: lying flat
    'bob03': dict(BOWL, recede=(34.0, 11.0, 22.0)),         # gone back at the temples: the fringe's line rises there
    'bob04': dict(BOWL, lift=_e('FLAT', '0.38')[0], round=0.6, bare=True, low=True),    # a horseshoe round a bare top
    'bob05': dict(BOWL, curl=tuple(_e('CURL', '0.035,0.022,0.65,0.3'))),          # curls
    # a small child's: to the ear's lobe, closer to the head. (round 167) Its fringe ends where a man's does, on
    # the middle of the forehead; until then it was cut at 2 degrees, in the forehead's upper half (round 105,
    # when a man's ended on the brows), and under it the larger part of a child's face was bare forehead.
    'bob08': dict(BOWL, end=-38.0, lift=0.75),
    # to the jaw, its ends turned out and up (round 133); all PLACEHOLDER by eye
    'bob09': dict(BOWL, end=_e('TURN_END', '-62')[0], turn=tuple(_e('TURN', '140,220,0.11,0.13,0.003,0.85,0.3,0.5'))),
}
# A girl's and a young woman's hair: parted in the middle, drawn down over the ears to the place below each ear
# where her plait begins (`styles.py`, style `plait`: `to` that place, `by` the temple the front hair goes by,
# `line` the hairline's table). No shell: the hair lies close, and the painted layer on the scalp is under it.
# Its layers: `part` bundles begin side by side along the parting, from the forehead over the top and down the
# back of the head (`n` on each side); `edge` bundles begin along the hairline from the forehead's middle to in
# front of the ear, where the hair comes out of the skin; `under` bundles begin anywhere in the hair below them.
# `rise`: how much higher a bundle lies for every unit it has run (those that have come furthest lie on top where
# all run together); `gather`: how near the place below the ear a bundle ends (radians: least, greatest) and how
# much of its breadth it has left there.
# (round 172) Until then 44 bundles under, 11 along the hairline and 24 and 7 along the parting on each side, of
# 1.7 to 2.2 cm: thick rolls with dark furrows between them, in Blender and in the portrait. Now the layer
# underneath is 44 broad flat bands (2 to 3.2 cm, `flat` 0.1) that close the head, and over it lie strands as a
# bowl cut's (`m`, `across`, `ring`, `blunt`, `tones`: see `BOWL`): 50 along the hairline, 140 along the parting
# that take 2.3 times their room there (they lie over one another: at 1.9 grey hair showed dark gaps between
# them) and 90 of 4 to 6 mm on top (`PART_N`, `PART_FIT`). `short` (the layer underneath): by how many degrees
# its bands end above the cut's line on hair that is cut, so that no broad band shows under the strands' ends.
# All PLACEHOLDER by eye.
# (round 180) Locks, as a bowl cut's since round 178, made and looked at in the same Blender. The strands over
# the layer underneath lay each by itself (its own height, lean, tone and place in the image): parted hair was a
# field of fine light and dark stripes, the reference's is smooth with a few broad soft locks. `lock`: strands
# that begin side by side, along the parting or along the hairline, lie in one arch to their ends. Its numbers:
# how much higher the strand at a lock's middle lies than one at its border (units of 10 cm: 1 mm; each strand
# leans as the arch does where it lies); how much higher one border lies than the middle and the other lower
# (0.8 mm, to either side by chance); how far a lock's tone is off the hair's; how much a strand keeps of its
# own tone, lean and height; how much of the image's breadth a lock takes to either side of its middle; how
# much lower than the full arch a lock's may be; how much of its own arch (`flat`) a strand keeps; how many
# locks a side begin along the parting and how many along the hairline; the chance by which a border between
# two is left out (locks of uneven breadth; one of more than one takes the image there and back, as round
# 179's). The layer underneath has none. 0 as the first: none, and the files are round 172's and 175's. With
# arch and lean of 1.6 and 1.4 mm dark slits opened between the locks. All PLACEHOLDER by eye.
PARTED = dict(
    parted=True, to=(92.0, -44.0), by=(60.0, 4.0), over=(8, 6, 35, 30, -50, -42), trend=14, lift=1.0, round=1.0,
    line=[(0, 8), (20, 4.9), (32, -2.4), (44, -8.4), (58, -13), (66, -17.5), (71, -24), (75, -20), (78, -12), (84, -12), (102, -12), (112, -16), (126, -28), (145, -40), (165, -46), (180, -48)],
    comb=(0.012, 0.7, 0.0, 1.0),
    shell=dict(h=0.02),
    lock=tuple(_e('PART_LOCK', '0.010,0.008,0.06,0.4,0.3,0.6,0.3,15,5,0.3')),
    layers=[
        dict(kind='under', n=44, w=(0.2, 0.32), flat=_e('PART_UFLAT', '0.1')[0], h=0.03, rise=0.012, gather=(0.1, 0.3, 0.35), short=_e('PART_SHORT', '4')[0], m=5, across=0.3, ring=0.09, wave=(0.002, 0.006, 1.2, 2.2), roll=0.1, tone=0.9, seed=3),
        dict(kind='edge', n=int(_e('PART_N', '50,140,90')[0]), fit=_e('PART_FIT', '2.3')[0], vary=0.3, flat=0.22, h=0.036, rise=0.016, gather=(0.1, 0.3, 0.3), blunt=0.6, m=3, across=0.3, ring=0.09, tones=0.07, wave=(0.002, 0.006, 1.2, 2.2), roll=0.3, tone=0.97, seed=4),
        dict(kind='part', n=int(_e('PART_N', '50,140,90')[1]), fit=_e('PART_FIT', '2.3')[0], vary=0.35, flat=0.22, h=0.05, rise=0.02, gather=(0.06, 0.2, 0.3), blunt=0.6, m=3, across=0.3, ring=0.09, tones=0.07, wave=(0.002, 0.006, 1.2, 2.2), roll=0.3, tone=1.0, seed=5),
        dict(kind='part', n=int(_e('PART_N', '50,140,90')[2]), w=(0.04, 0.06), flat=0.26, h=0.062, rise=0.02, gather=(0.1, 0.5, 0.5), blunt=0.5, m=3, across=0.3, ring=0.09, tones=0.07, wave=(0.003, 0.008, 1.0, 1.8), roll=0.35, tone=1.05, seed=7),
    ],
)
# (round 175) The hair of one who wears plaits runs on to the plait. `PARTED`'s bundles end 0.06 to 0.5 radians
# before the place below the ear (`gather`: about half a centimetre to 4.5 cm). As fine strands (round 172) they
# ended there one by one in a ragged ring round the plait's beginning, and behind it skin showed between them (in
# Blender beside round 174's plait, and in the portrait from three quarters and from the side). `PLAIT_NEAR`:
# each layer's least and greatest way to the place, times this (0.15: about 1 to 7 mm; with 0.3 single ends
# still stood beside the plait in Blender; 1 writes round 172's file). The other parted cuts keep `PARTED`'s.
# PLACEHOLDER by eye.
NEAR = _e('PLAIT_NEAR', '0.15')[0]
CUTS['plait01'] = dict(PARTED, layers=[dict(L, gather=(NEAR * L['gather'][0], NEAR * L['gather'][1], L['gather'][2])) for L in PARTED['layers']])
# A woman's hair under a veil that is set back on the head (round 121; `portrait/src/dress.rs` `hair_veiled`,
# `Veil::Back`): parted as a girl's, laid over the ears and on to the nape, where it is pinned up under the veil
# (`to`: there is no plait; `by`: lower at the temple, so that the hair covers the ear down to its lobe). In
# front of the veil's rim it is fuller than a girl's and begins lower on the forehead (`lift`; `PART_DROP`:
# degrees at the forehead's middle, none from 60 degrees to the side); under the veil it lies as flat as hers
# (`veil`: the veil's rim as a table like `line`, read off the draped veil `cloth_veil_back` in this script's
# angles; over how many degrees in front of the rim the hair comes to its full height; how much of the lift is
# left under the cloth). The painted layer and the scalp under it are the girl's. All PLACEHOLDER by eye.
VEIL_RIM = [(0, 50.6), (33, 47.5), (45, 40.4), (53, 21), (60, 8), (68, -14), (77, -34), (85, -45), (120, -45)]
CUTS['part01'] = dict(
    PARTED, to=tuple(_e('PART_TO', '130,-58')), by=tuple(_e('PART_BY', '64,-14')), lift=_e('PART_LIFT', '1.5')[0],
    veil=(VEIL_RIM, *_e('PART_VEIL', '10,0')),
    line=[(th, el - _e('PART_DROP', '2.5')[0] * max(0.0, min(1.0, (60 - th) / 28))) for th, el in PARTED['line']],
)
# A man's hair parted in the middle and cut at the jaw (round 125; `portrait/src/dress.rs` `hair_lengths`): the
# parted hair's bundles, not drawn to a plait but falling free past the temple and over the ear, and cut where
# they cross a level line (`end`, degrees, as a bowl cut's; `ends`: how far above or below it a bundle ends).
# `to` lies far below the ear, so that the hair's way there is down; it stands as high off the head as a bowl
# cut's (`lift`) and swings as combed hair does (`comb`). Its bundles keep their breadth to the end (`gather`'s
# third number 1). The parting runs on down the back of the head as a girl's does. No painted layer and no scalp
# of its own: the builder takes the girl's (`DressSet::under_of`). All PLACEHOLDER by eye, beside the reference's
# men with hair to the jaw.
# (round 172) Of strands: they end together in clumps as a bowl cut's do (`clump`, as `BOWL`'s: 30 clumps round
# the head) and blunt, and turn in to the head over their last 1.2 cm (`tuck`: how long before the end, how high
# over the skin they end, times the cut's `lift`). Until then each bundle ended in pointed wisps of its own
# (`fray`), a saw at the jaw.
CUTS['page01'] = dict(
    PARTED, to=tuple(_e('PAGE_TO', '100,-85')), by=tuple(_e('PAGE_BY', '64,-14')), lift=_e('PAGE_LIFT', '2.2')[0],
    end=_e('PAGE_END', '-50')[0], ends=tuple(_e('PAGE_ENDS', '-2.5,2.5')), comb=tuple(_e('PAGE_COMB', '0.025,0.9,0,1')),
    layers=[dict(L, gather=(0.05, 0.1, 1.0)) for L in PARTED['layers']],
    clump=tuple(_e('PART_CLUMP', '30,0.8,0.6,0.45,1.5')), tuck=tuple(_e('PAGE_TUCK', '0.12,0.03')),
)
# The same in waves (round 130): `waves`: how far the bundles swing to the side and off the head, the length of a
# wave, and how far from a bundle's beginning the waves begin. All PLACEHOLDER by eye.
CUTS['page02'] = dict(CUTS['page01'], waves=tuple(_e('PAGE_WAVES', '0.055,0.04,0.7,0.3')))
# A small girl's hair, worn down (round 162; `portrait/src/dress.rs` `hair_small`): parted as `page01`, not cut at
# the jaw but hanging to over the shoulders (`end`), and hanging: from the head's middle down it lies in no
# direction nearer the head's upright than it does above (`hang`: from how many degrees down), where `page01`
# goes in under the ear to the neck. Closer to the head than a man's (`lift`). All PLACEHOLDER by eye.
# (round 172) Of strands that end in clumps, as `page01`, but hanging straight to their ends (no `tuck`), and
# ending within 1.5 degrees of the line (3 until then: fine strands of such different lengths were a ragged hem
# in the first pass in Blender).
CUTS['loose01'] = dict(
    CUTS['page01'], to=tuple(_e('LOOSE_TO', '170,-87')), end=_e('LOOSE_END', '-60')[0], ends=tuple(_e('LOOSE_ENDS', '-1.5,1.5')), lift=_e('LOOSE_LIFT', '1.7')[0],
    hang=_e('LOOSE_HANG', '0')[0], part_to=_e('LOOSE_PART', '-25')[0], tuck=None, clump=tuple(_e('LOOSE_CLUMP', '30,0.8,0.6,0.45,1.5')),
)
# Tightly curled hair (round 111): no bundles and no strands that run anywhere. Each hair is a coil of a few
# millimetres, and a head of them is one springy mass that stands off the skull the same height all round, its
# surface small tufts side by side, its edge the hairline itself. `h`: how high the mass stands over the skin;
# `edge`: its height at the hairline as a share of that, and over how many degrees inside the line it comes to its
# full height; `ragged`: by how many degrees the mass ends inside or outside the line, and the size of that
# unevenness (units): no hairline is drawn with a compass; `tufts`: sizes of the tufts and how high each size
# stands (two sizes, one on the other); `bare`: a horseshoe round a bare top (`bare`'s line); `grid`:
# degrees between the rays from the whorl, and the rings along a ray; `line`: the hairline (parted hair's);
# `shade`: its tone. All PLACEHOLDER by eye: no picture of the reference shows such hair (its pictures here are of
# Europeans), and nothing was read on how it was worn in 1356.
COILY = dict(
    coily=True, over=(8, 6, 35, 30), lift=1.0, round=1.0, line=PARTED['line'],
    h=0.16, edge=(0.03, 10.0), ragged=(1.6, 0.05), tufts=((0.06, 0.02), (0.028, 0.011)), grid=(2.0, 72), shade=0.92,
)
CUTS['coil01'] = COILY                                  # a man's: a thumb's breadth high
CUTS['coil02'] = dict(COILY, h=0.36, edge=(0.03, 12.0), tufts=((0.08, 0.03), (0.035, 0.014)))  # a woman's: fuller
CUTS['coil03'] = dict(COILY, h=0.07, edge=(0.05, 6.0), tufts=((0.05, 0.012), (0.025, 0.007)))   # a small child's, and a head that loses its hair: close
CUTS['coil04'] = dict(COILY, h=0.09, edge=(0.05, 6.0), tufts=((0.05, 0.012), (0.025, 0.007)), bare=True)   # a horseshoe round a bare top
C = CUTS[cut]
LIFT, ROUND = C['lift'], C['round']
SEED = sum(map(ord, cut))          # each cut with random numbers of its own: no two cuts wear the same bundles

H = Head(base)
hc = H.hc
cover = C['over']


def beside(th, el):
    g = np.clip((np.abs(th) - cover[2]) / cover[3], 0, 1)
    g = g * g * (3 - 2 * g)
    if len(cover) > 4:
        # hair that goes on down the neck lies on the neck: nothing of the bow below, all of it above
        e = np.clip((el - cover[4]) / (cover[5] - cover[4]), 0, 1)
        g = g * e * e * (3 - 2 * e)
    return g


# the skin as hair takes it: past the ears in one bow (`hairlib.py` `write_locks`, `<key>_LOCK_OVER`, `_TREND`)
OVER = H.covered(cover[0], cover[1], beside, trend=C.get('trend', 0.0))
if 'hang' in C:
    # hair that hangs (round 162): going down from `hang` degrees, no nearer the head's upright than above
    _low = OVER.EL <= C['hang']
    _rho = (OVER.R * np.cos(np.radians(OVER.EL))[None, :])[:, _low]
    OVER.R = OVER.R.copy()
    OVER.R[:, _low] = np.maximum.accumulate(_rho[:, ::-1], axis=1)[:, ::-1] / np.cos(np.radians(OVER.EL[_low]))[None, :]
# what the points are bound to: hair that goes on below the ear lies on the neck, and goes with it
BIND = Head(base, ymin=3.9, hc=H.hc) if C.get('parted') else H


def smooth(g):
    g = np.clip(g, 0, 1)
    return g * g * (3 - 2 * g)


def flow(d):
    """The way hair lies: away from the whorl on top, down at the sides (the bob's of `styles.py`); parted hair
    from the parting down the side, in front by the temple, to the place below the ear (its `plait`'s)."""
    th, el = ang(d)
    if C.get('parted'):
        side = np.where(d[..., 0] >= 0, 1.0, -1.0)
        to = dirs(side * C['to'][0], C['to'][1] + 0 * side)
        by = dirs(side * C['by'][0], C['by'][1] + 0 * side)
        f = (np.clip((C['by'][0] - 5 - np.abs(th)) / 20, 0, 1) * np.clip((el - C['by'][1]) / 12, 0, 1))[..., None]
        k = np.clip((el - 35) / 40, 0, 1)[..., None]
        across = tangent(side[..., None] * np.array([1.0, 0, 0]), d)
        return unit((1 - k) * tangent((1 - f) * to + f * by - d, d) + k * across)
    t = tangent(d - W, d)
    a = np.arccos(np.clip((d * W).sum(-1), -1, 1))
    whorl = unit(t + 0.25 * np.exp(-a / 0.45)[..., None] * np.cross(d, t))
    down = tangent(np.broadcast_to(np.array([0, -1.0, 0]), d.shape).copy(), d)
    w = np.clip((62 - el) / 35, 0, 1)[..., None]
    return unit((1 - w) * whorl + w * down)


def level(th):
    """The line the hair is cut at, in degrees: the fringe's in front of the face, the cut's at the sides and back."""
    corner = C.get('corner', (45, 25))
    f = smooth((np.abs(th) - corner[0]) / corner[1])
    front = C['cut']
    if 'recede' in C:
        at, wide, up = C['recede']
        front = front + up * np.exp(-0.5 * ((np.abs(th) - at) / wide) ** 2)
    return front * (1 - f) + C['end'] * f


def bare(th):
    """The upper edge of a horseshoe of hair round a bare top (`styles.py` `BARE`), in degrees."""
    return np.interp(np.abs(th), [0, 45, 60, 80, 100, 130, 180], [-30, -6, 16, 30, 35, 40, 42]) + 2.5 * np.sin(np.radians(th) * 9 + 1.0)


def rim(n, rng, jitter=0.25):
    """n places on the cut's line, each a little off the even one, and the room each has between its neighbours
    (a place is the middle of its room: no room is left out). Round the whole head, or round as much of it as a
    horseshoe has hair."""
    th = np.arange(0, 360, 0.25)
    th = np.where(th > 180, th - 360, th)                  # from the face's middle round by one side, the back, the other
    if C.get('bare'):
        th = th[bare(th) - level(th) > 14]
    P = OVER.at(dirs(th, level(th)), 0.1)
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    if 'corner' in C:
        # (round 171) no strand ends on the step from the fringe down to the sides: the edge there is the flank
        # of the side's first strand, not a ladder of ends
        seg[seg > 0.02] = 0.0
    run = np.concatenate([[0], np.cumsum(seg)])
    whole = run[-1] + (0 if C.get('bare') else np.linalg.norm(P[0] - P[-1]))
    if C.get('bare'):
        n = max(4, int(round(n * whole / 6.2)))
    at = (np.arange(n) + rng.uniform(-jitter, jitter, n) + (0.5 if C.get('bare') else rng.random())) * whole / n
    right = 0.5 * (at + np.roll(at, -1))
    left = np.roll(right, 1)
    if C.get('bare'):
        left[0], right[-1] = 0.0, whole
    else:
        right[-1] = 0.5 * (at[-1] + at[0] + whole)
        left[0] = right[-1] - whole
    k = np.clip(np.searchsorted(run, 0.5 * (left + right) % whole), 0, len(th) - 1)
    return th[k], right - left


def trace_back(d0, stop, most, under):
    """From each end up against the hair's way, until so near the whorl (`stop`, radians), so long (`most`), or
    (a horseshoe) so near under its upper edge (`under`, degrees). Returns for each bundle its directions from
    its beginning to its end."""
    d = d0.copy()
    ways = [[p] for p in d0]
    alive = np.ones(len(d0), bool)
    for i in range(1, int(np.max(most) / STEP) + 1):
        dn = unit(d - flow(d) * (STEP / OVER.skin(d))[:, None])
        a = np.arccos(np.clip(dn @ W, -1, 1))
        alive &= (a > stop) & (i * STEP <= most)
        if C.get('bare'):
            th, el = ang(dn)
            alive &= bare(th) - el > under
        if not alive.any():
            break
        d = np.where(alive[:, None], dn, d)
        for k in np.where(alive)[0]:
            ways[k].append(d[k])
    return [np.array(w[::-1]) for w in ways]


def bundles(L, rng):
    """The bands of one layer: for each its rings (n rings of m corners), their places in the image, the point each
    ring is bound to the head by, and a shade for each ring."""
    th_end, room = rim(L['n'], rng, L.get('vary', 0.25))
    n = len(th_end)
    ends = rng.uniform(L['ends'][0], L['ends'][1], n)
    clump = C.get('clump') if L.get('clump', True) else None
    tuft = C.get('tuft')
    lock = C.get('lock') if clump and C.get('lock', (0,))[0] > 0 else None
    if tuft:
        corner = C.get('corner', (45, 25))
        front = 1 - smooth((np.abs(th_end) - corner[0]) / corner[1])
    if clump:
        # (round 171) strands that end together: the cut's clumps are the same for all its layers, each strand
        # belongs to the one whose middle is nearest on the cut's line and ends as high as it does
        crng = np.random.default_rng(SEED + 4241)
        th_c, _ = rim(int(clump[0]), crng, clump[3])
        gap = np.abs((th_end[:, None] - th_c[None, :] + 180) % 360 - 180)
        near = gap.argmin(1)
        ends = ends + crng.uniform(-clump[4], clump[4], len(th_c))[near]
        d_clump = dirs(th_c, level(th_c))[near]
        two = np.sort(gap, axis=1)[:, :2]
        if tuft:
            # (round 177) a clump ends in a point: the strand at its middle ends on the clump's line, one at its
            # border `tuft[0]` degrees above it (a power `tuft[1]` of the way from the middle to the border), and
            # a clump of the fringe ends up to `tuft[3]` degrees further above or below the cut's line
            ends = ends + crng.uniform(-tuft[3], tuft[3], len(th_c))[near] * front
            ends = ends + tuft[0] * (tuft[2] + (1 - tuft[2]) * front) * (two[:, 0] / np.maximum(0.5 * two.sum(1), 1e-6)) ** tuft[1]
        if lock:
            # (round 178) a clump is a lock: where across it a strand ends (-1 and 1: its borders), to which side
            # the lock leans, its tone, its place in the image and its arch's height (drawn after the fringe's
            # numbers: the fringe is round 177's)
            across_c = ((th_end - th_c[near] + 180) % 360 - 180) / np.maximum(0.5 * two.sum(1), 1e-6)
            lean_c = crng.choice([-1.0, 1.0], len(th_c)) * crng.uniform(0.5, 1.0, len(th_c))
            tone_c = np.clip(crng.lognormal(0, lock[4], len(th_c)), 0.8, 1.25)
            u_c = crng.uniform(-0.08, 0.08, len(th_c))
            high_c = crng.uniform(1 - lock[7], 1.0, len(th_c))
            # (round 179) locks of uneven breadth: a clump joins the one before it round the head by the chance
            # `lock[9]`, three at most to a lock; a lock's strands lie in one arch across all of it, and it has
            # one lean, tone and place in the image. And a lock goes its own way: a bow to one side (`bow_c`)
            first = np.arange(len(th_c))
            for i in np.where(crng.random(len(th_c)) < lock[9])[0]:
                if i > 0 and i - first[i - 1] < 3:
                    first[i] = first[i - 1]
            many = np.bincount(first, minlength=len(th_c))[first]
            wide_c = many[near]
            across_c = np.where(wide_c == 1, across_c, 2 * (near - first[near] + 0.5 * (across_c + 1)) / wide_c - 1)
            own = first[near]
            lean_c, tone_c, u_c, high_c = lean_c[own], tone_c[own], u_c[own], high_c[own]
            bow_c = crng.uniform(-1.0, 1.0, len(th_c))[own]
    elif tuft:
        # (a layer without clumps ends above the fringe's notches, so skin shows between the points)
        ends = ends + (tuft[0] + tuft[3]) * (tuft[2] + (1 - tuft[2]) * front)
    d_end = dirs(th_end, level(th_end) + ends)
    if 'roots' in L:
        stop = np.array([L['roots'][k % len(L['roots'])] for k in range(n)]) * rng.uniform(0.85, 1.2, n)
        most = np.full(n, 6.0)
        under = rng.uniform(1.0, 14.0, n)
    else:
        stop = np.full(n, 0.08)
        most = rng.uniform(L['long'][0], L['long'][1], n)
        under = rng.uniform(8.0, 20.0, n)
    ways = trace_back(d_end, stop, most, under)
    # how many bundles of the layer there are at a distance from the whorl: there a bundle has that share of the
    # way round the whorl for itself, and is no broader
    begun = np.sort([np.arccos(np.clip(w[0] @ W, -1, 1)) for w in ways])
    curl, turn = C.get('curl'), C.get('turn')
    out_ = []
    for k, D in enumerate(ways):
        if len(D) < 12:
            continue
        run0 = np.arange(len(D)) * STEP
        total = run0[-1]
        width = L['fit'] * room[k] if 'fit' in L else rng.uniform(L['w'][0], L['w'][1])
        tl = min(rng.uniform(L['tip'][0], L['tip'][1]), 0.45 * total)
        rl = min(0.3, 0.3 * total)
        # rings: one every 5 mm along its length (curly hair: every 3), closer in its end
        run = np.concatenate([np.arange(0, total - tl, (0.05 if 'ring' in L else 0.03) if curl else L.get('ring', 0.05)), total - tl + tl * np.linspace(0, 1, 9) ** 0.8])
        rolled = None
        # (a turned end: not over the forehead, where the fringe hangs as it is cut; the rolls of all layers lie
        # in one another, round one middle `turn[2..3]` over the topmost layer, so a lower layer's is the wider;
        # a ring every 1.2 mm of it, and it begins before the bundle narrows to its point)
        # (round 171) strands roll together: each near the middle of the cut's angles and radii, and hardly to the
        # side; each rolled by itself, a head of fine strands ended in a fringe of claws
        near = 0.15 if 'across' in L else 1.0
        mid = lambda lo, hi: 0.5 * (lo + hi) + near * (rng.uniform(lo, hi) - 0.5 * (lo + hi))
        deg = mid(turn[0], turn[1]) * smooth((abs(th_end[k]) - 45) / 25) if turn else 0.0
        if deg > 20:
            R = mid(turn[2], turn[3]) + 0.88 * LIFT * (max(l['h'] for l in C['layers']) - L['h'])
            lf = min(R * np.radians(deg), 0.4 * total)
            tl = min(tl, turn[6] * lf)
            before = np.arange(0, total - lf - 0.02, 0.05)
            run = np.concatenate([before, total - lf + np.linspace(0, lf, max(int(lf / (0.02 if 'across' in L else 0.012)) + 1, 8))])
            rolled = (len(before), np.clip((run - (total - lf)) / R, 0, None), R, near * rng.uniform(-turn[4], turn[4]))
        d = unit(np.stack([np.interp(run, run0, D[:, i]) for i in range(3)], -1))
        a = np.arccos(np.clip(d @ W, -1, 1))
        fan = np.inf if C.get('bare') else 1.15 * 2 * np.pi * np.sin(np.minimum(a, np.pi / 2)) * OVER.skin(d) / np.maximum(np.searchsorted(begun, a, side='right'), 1)
        e = np.clip((run - (total - tl)) / tl, 0, 1)                 # 0..1 along its end
        r = np.clip(run / rl, 0, 1)                                   # 0..1 along its beginning
        # (a turned end keeps `turn`'s eighth number of its breadth: a roll does not end in a claw)
        # (a lock, round 141: its end narrows by a power of the way along it, and is cut at less of a slant)
        pt = L.get('point', (1.0, 1.0)) if rolled is None else (1.0, 1.0)
        hw = 0.5 * np.minimum(width, fan) * (0.25 + 0.75 * smooth(r)) * (1 - (1 - max(turn[7], L.get('blunt', 0.0)) if rolled else 1 - L.get('blunt', 0.0)) * e ** pt[1])
        # its way: a swing to either side as long as the bundle and longer (a bow, not a wave), and its end cut
        # at a slant, the point on one flank's line
        side = unit(np.cross(d, unit(np.gradient(d, axis=0))))
        A, lam = rng.uniform(L['wave'][0], L['wave'][1]), total * rng.uniform(L['wave'][2], L['wave'][3])
        off = A * np.sin(2 * np.pi * run / lam + rng.uniform(0, 2 * np.pi)) * smooth(run / 0.4) + pt[0] * rng.choice([-1, 1]) * rng.uniform(0.5, 0.95) * hw[np.argmax(e > 0) - 1] * e ** 1.3
        # combed: neighbours swing together, and the bundles of a side lean one way together at their ends
        # (both by the way still to go to the end: bundles side by side have the same, wherever they began)
        tk, cb = np.radians(th_end[k]), C['comb']
        off = off + cb[0] * np.sin(2 * np.pi * (total - run) / cb[1] + 2.5 * np.sin(2 * tk + 0.3 + SEED) + 1.5 * np.sin(5 * tk + 1.1)) * smooth(run / 0.4)
        off = off + cb[2] * np.sin(2 * tk + 0.8 + SEED) * np.exp(-(total - run) / cb[3])
        if clump:
            # (towards its clump's middle over the clump's length before the end, by a share of the way there)
            off = off + clump[1] * rng.uniform(0.6, 1.0) * ((d_clump[k] - d[-1]) @ side[-1]) * OVER.skin(d[-1:])[0] * smooth((run - (total - clump[2])) / clump[2])
        if lock:
            # (round 179) over `lock[11]` before its end a lock bows to one side, by up to `lock[10]`: locks
            # lie over their neighbours here and leave them there; its end stays where the fringe has it
            off = off + lock[10] * bow_c[k] * np.sin(np.pi * np.clip((total - run) / lock[11], 0, 1)) ** 2 * smooth(run / 0.4)
        up = 0.0
        if curl:
            # (neighbours wave nearly together: a head of waves, not of worms)
            ph = 2.5 * np.sin(2 * tk + 0.3 + SEED) + (curl[3] if len(curl) > 3 else 0.9) * rng.uniform(-1, 1, 2) + np.array([0, 1.3])
            ramp = smooth(run / (0.5 * curl[2]))
            lc = curl[2] * rng.uniform(0.92, 1.1)
            # (round 171, a cut's fourth number of `curl`: how far a strand's waves are off its neighbours') fine
            # strands wave by the way still to go to the end, as they are combed: side by side they have the same
            # wherever they began, and a head of them waves; by the way from each one's beginning it was a wickerwork
            way = run if len(curl) < 4 else (total - run) * curl[2] / lc * rng.uniform(0.97, 1.03)
            off = off + curl[0] * ramp * np.sin(2 * np.pi * way / lc + ph[0])
            up = curl[1] * ramp * (0.5 + 0.5 * np.sin(2 * np.pi * way / lc + ph[1]))
        d = unit(d + side * (off / OVER.skin(d))[:, None])
        # its height over the skin: it comes up from under the shell, and the hair is thinner towards its ends
        thin = 1 - C['thin'] * smooth((run - (total - C['thin_over'])) / C['thin_over'])
        low = C['shell']['h'] - 0.03
        h = LIFT * (low + (L['h'] - low) * smooth(run / 0.35)) * thin + LIFT * rng.uniform(-0.006, 0.006) * (lock[5] if lock else 1.0) + up
        if 'tuck' in L:
            # (round 171) the end turns in to the head over a quarter of a circle: a rim that is thick and round
            te = np.clip((run - (total - L['tuck'][0])) / L['tuck'][0], 0, 1)
            h = h - (h - LIFT * L['tuck'][1]) * (1 - np.sqrt(1 - te ** 2))
        ht = ROUND * L['flat'] * hw * (lock[8] if lock else 1.0)
        h = np.maximum(h, ht + 0.004)                                 # its flanks stay off the skin
        roll = L['roll'] * rng.uniform(-1, 1) * ROUND
        tone = float(np.clip(rng.lognormal(0, L.get('tones', 0.1)), 0.78, 1.25))
        u_mid = None
        if lock:
            # (round 178) the strands of a clump lie in one arch, each leaning as the arch does at its place
            # (`roll` is a height for each unit across the strand; a clump is taken as no narrower than 6 mm
            # there: on the fringe's corner clumps are close in angle)
            s_, a_ = across_c[k], np.arccos(np.clip(d @ W, -1, 1))
            g = smooth((a_ - lock[2]) / lock[3])
            # (`low`, hair worn under a hood, a hat or a band: a lock's highest place is as high as the strands
            # lay without locks; with the arch about that height hair came through a lord's circlet)
            top = 0.5 * lock[0] * high_c[k] + lock[1] * abs(lean_c[k]) if C.get('low') else 0.0
            h = np.maximum(h + LIFT * (lock[0] * high_c[k] * (0.5 - s_ ** 2) + lock[1] * lean_c[k] * s_ - top) * g, ht + 0.004)
            broad = wide_c[k] * np.radians(0.5 * two[k].sum()) * OVER.skin(d[-1:])[0] * np.cos(np.radians(level(th_end[k])))
            lie = np.sign((dirs(th_end[k] + 1.0, level(th_end[k])) - dirs(th_end[k] - 1.0, level(th_end[k]))) @ side[-1])
            roll = roll * lock[5] - lie * LIFT * (-2 * lock[0] * high_c[k] * s_ + lock[1] * lean_c[k]) / max(broad, 0.06) * g
            tone = tone_c[k] * tone ** lock[5]
            # (round 179: a lock of more clumps than one takes the same breadth of the image, there and back: the
            # image is one lock's, darker at its borders, and laid on across a broad lock's whole breadth its
            # borders fell in the lock's middle, dark bands; so its hairs are as fine on a broad lock, too)
            u_mid = 0.5 + u_c[k] + lock[6] * (s_ if wide_c[k] == 1 else 1 - 2 * abs((s_ * wide_c[k] + 1) / 2 % 2 - 1))
        out_ += lay(d, h, hw, ht, roll, run, L['tone'] * tone * (0.7 + 0.3 * smooth(run / 0.3)), rng, m=L.get('m', 7), rolled=rolled, across=L.get('across'), u_mid=u_mid)
    return out_


def free(d):
    """How high parted hair stands at a place, as a factor: the cut's `lift`, and under a veil (`veil`) what is
    left of it over 1, from a finger's breadth in front of the rim."""
    if 'veil' not in C:
        return LIFT + 0 * d[..., 0]
    rim, band, left = C['veil']
    rim = np.array(rim, float)
    th, el = ang(d)
    return 1 + (LIFT - 1) * (left + (1 - left) * smooth((np.interp(np.abs(th), rim[:, 0], rim[:, 1]) - el) / band))


def parted(L, rng):
    """The bands of one layer of parted hair, as `bundles` gives a cut's."""
    line = np.array(C['line'], float)
    to0, to1 = C['to']
    front = np.interp(0, line[:, 0], line[:, 1]) + 6           # the parting begins a centimetre behind the hairline
    # degrees along the parting: over the top, down the back (as far as the place the hair goes to, or `part_to`)
    span = (90 - front) + (90 - C.get('part_to', to1))
    out_ = []
    for sgn in (1.0, -1.0):
        n = L['n']
        if L['kind'] == 'part':
            jit = L.get('vary', 0.25)
            at = (np.arange(n) + rng.uniform(-jit, jit, n) + 0.5) * span / n
            right = 0.5 * (at + np.roll(at, -1)); left = np.roll(right, 1)
            left[0], right[-1] = 0.0, span
            mid = 0.5 * (left + right)
            begin_at = lambda m: np.where((m <= 90 - front)[:, None], dirs(0 * m, front + m), dirs(180 + 0 * m, 90 - (m - (90 - front))))
            d0 = begin_at(mid)
            d0 = unit(d0 + sgn * np.array([0.004, 0, 0]))
            room = np.radians(right - left) * OVER.skin(d0)
            key = np.radians(mid)
            reach = (0.0, span)
        elif L['kind'] == 'edge':
            jit = L.get('vary', 0.25)
            at = 4 + (np.arange(n) + rng.uniform(-jit, jit, n) + 0.5) * 62 / n
            right = 0.5 * (at + np.roll(at, -1)); left = np.roll(right, 1)
            left[0], right[-1] = 4.0, 66.0
            mid = 0.5 * (left + right)
            begin_at = lambda m: dirs(sgn * m, np.interp(m, line[:, 0], line[:, 1]) + 3.5)
            d0 = begin_at(mid)
            reach = (4.0, 66.0)
            room = np.linalg.norm(OVER.at(dirs(sgn * right, np.interp(right, line[:, 0], line[:, 1]) + 3.5), 0 * mid) - OVER.at(dirs(sgn * left, np.interp(left, line[:, 0], line[:, 1]) + 3.5), 0 * mid), axis=1)
            key = np.radians(mid)
        else:
            # anywhere in the hair of this side, a finger's breadth and more inside the hairline
            P = unit(np.random.default_rng(L['seed'] + (0 if sgn > 0 else 1)).normal(size=(n * 40, 3)))
            th, el = ang(P)
            P = P[(P[:, 0] * sgn > 0.1) & (el - np.interp(np.abs(th), line[:, 0], line[:, 1]) > 6)][:n]
            d0, room, key = P, np.zeros(len(P)), np.radians(ang(P)[1])
        near = rng.uniform(L['gather'][0], L['gather'][1], len(d0))
        lock = C.get('lock') if L['kind'] != 'under' and C.get('lock', (0,))[0] > 0 else None
        if lock:
            # (round 180) strands that begin side by side lie in one lock: the locks' borders along the parting
            # (the same for both of its layers) and along the hairline, each side of the head its own; a border
            # is left out by the chance `lock[9]`, so locks are of uneven breadth. For each strand: where across
            # its lock it begins (-1 and 1: the borders), how many locks' breadth its lock has, and the lock's
            # lean, tone, place in the image and height
            lrng = np.random.default_rng(SEED + 5171 + (0 if sgn > 0 else 1) + (0 if L['kind'] == 'part' else 10))
            nl = int(lock[7] if L['kind'] == 'part' else lock[8])
            edge = reach[0] + (reach[1] - reach[0]) * np.clip((np.arange(nl + 1) + lrng.uniform(-0.3, 0.3, nl + 1)) / nl, 0, 1)
            keep = lrng.random(nl + 1) >= lock[9]
            keep[0] = keep[-1] = True
            edge[0], edge[-1] = reach
            edge = edge[keep]
            of = np.clip(np.searchsorted(edge, mid) - 1, 0, len(edge) - 2)
            across_l = 2 * (mid - edge[of]) / (edge[of + 1] - edge[of]) - 1
            many_l = np.maximum(np.rint((edge[of + 1] - edge[of]) * nl / (reach[1] - reach[0])), 1)
            broad_l = 0.5 * np.linalg.norm(OVER.at(begin_at(edge[of + 1]), 0 * mid) - OVER.at(begin_at(edge[of]), 0 * mid), axis=1)
            along_l = begin_at(mid + 0.5) - begin_at(mid - 0.5)
            lean_l = (lrng.choice([-1.0, 1.0], len(edge)) * lrng.uniform(0.5, 1.0, len(edge)))[of]
            tone_l = np.clip(lrng.lognormal(0, lock[2], len(edge)), 0.8, 1.25)[of]
            u_l = lrng.uniform(-0.08, 0.08, len(edge))[of]
            high_l = lrng.uniform(1 - lock[5], 1.0, len(edge))[of]
        # (hair that is cut: each bundle ends where it crosses the cut's line, a little above or below it)
        low = C['end'] + L.get('short', 0.0) + rng.uniform(C['ends'][0], C['ends'][1], len(d0)) if 'end' in C else None
        clump = C.get('clump') if low is not None else None
        if clump:
            # (round 172) strands that end together, as a bowl cut's: clumps round the head, the same for all
            # layers, each ending a little above or below the cut's line; a strand belongs to the clump it is
            # nearest when it comes to the line
            crng = np.random.default_rng(SEED + 4241)
            th_c = np.sort((np.arange(int(clump[0])) + crng.uniform(-clump[3], clump[3], int(clump[0]))) * 360 / int(clump[0]) - 180)
            up_c = crng.uniform(-clump[4], clump[4], len(th_c))
            nearest = lambda p: np.abs((ang(p)[0][:, None] - th_c[None, :] + 180) % 360 - 180).argmin(1)
        G = dirs(sgn * to0, to1)
        d = d0.copy()
        ways = [[p] for p in d0]
        alive = np.ones(len(d0), bool)
        for i in range(1, int(4.0 / STEP)):
            dn = unit(d + flow(d) * (STEP / OVER.skin(d))[:, None])
            alive &= np.arccos(np.clip(dn @ G, -1, 1)) > near
            if low is not None:
                alive &= ang(dn)[1] > low + (up_c[nearest(dn)] if clump else 0.0)
            if not alive.any():
                break
            d = np.where(alive[:, None], dn, d)
            for k in np.where(alive)[0]:
                ways[k].append(d[k])
        for k, way in enumerate(ways):
            if len(way) < 12:
                continue
            D = np.array(way)
            if L['kind'] == 'part':
                # it begins across the parting, under the hair of the other side
                D = np.concatenate([unit(D[:1] - sgn * np.array([0.012, 0, 0])), D])
            run0 = np.arange(len(D)) * STEP
            total = run0[-1]
            width = L['fit'] * room[k] if 'fit' in L else rng.uniform(L['w'][0], L['w'][1])
            tl = min(0.1, 0.3 * total)
            rl = 0.12 if L['kind'] == 'part' else min(0.3, 0.3 * total)
            run = np.concatenate([np.arange(0, total - tl, L.get('ring', 0.05)), total - tl + tl * np.linspace(0, 1, 5)])
            d = unit(np.stack([np.interp(run, run0, D[:, i]) for i in range(3)], -1))
            a = np.arccos(np.clip(d @ G, -1, 1))
            e = np.clip((run - (total - tl)) / tl, 0, 1)
            r = np.clip(run / rl, 0, 1)
            # drawn to one place: the nearer it, the narrower
            g = L['gather'][2] + (1 - L['gather'][2]) * smooth((a - near[k]) / 0.8)
            begin = 1.0 if L['kind'] == 'part' else 0.25 + 0.75 * smooth(r)
            hw = 0.5 * width * g * begin * (1 - (1 - L.get('blunt', 0.2)) * e)
            side = unit(np.cross(d, unit(np.gradient(d, axis=0))))
            A, lam = rng.uniform(L['wave'][0], L['wave'][1]), total * rng.uniform(L['wave'][2], L['wave'][3])
            cb = C['comb']
            off = A * np.sin(2 * np.pi * run / lam + rng.uniform(0, 2 * np.pi)) * smooth(run / 0.4)
            off = off + cb[0] * np.sin(2 * np.pi * run / cb[1] + 2.5 * np.sin(1.3 * key[k] + SEED)) * smooth(run / 0.3) * smooth((a - near[k]) / 0.4)
            up = 0.0
            if 'waves' in C:
                # waved hair: the bundles of a side swing together, to the side and off the head, by the way still
                # to go to the cut (bundles side by side have the same, wherever they began), each a little off
                # its neighbours
                ws, wu, wl, w0 = C['waves']
                ph = 2 * np.pi * (total - run) / (wl * rng.uniform(0.98, 1.02)) + 1.2 * np.sin(1.3 * key[k] + SEED) + rng.uniform(-0.2, 0.2)
                ramp = smooth((run - w0) / 0.4)
                off = off + ws * ramp * np.sin(ph)
                up = wu * ramp * (0.5 + 0.5 * np.sin(ph + 1.3))
            if clump:
                # (towards its clump's middle over the clump's length before the end, by a share of the way there)
                mid_c = dirs(th_c[nearest(d[-1:])], ang(d[-1:])[1])[0]
                off = off + clump[1] * rng.uniform(0.6, 1.0) * ((mid_c - d[-1]) @ side[-1]) * OVER.skin(d[-1:])[0] * smooth((run - (total - clump[2])) / clump[2])
            d = unit(d + side * (off / OVER.skin(d))[:, None])
            lift = free(d)
            h = lift * (L['h'] + L['rise'] * run) * (0.2 + 0.8 * smooth(r)) + lift * rng.uniform(-0.004, 0.004) * (lock[3] if lock else 1.0) + up
            if C.get('tuck') and low is not None:
                # (round 172) hair cut at the jaw turns in at its end, as a bowl cut's rim: over the cut's `tuck`
                # (how long before the end, how high over the skin it ends there)
                te = np.clip((run - (total - C['tuck'][0])) / C['tuck'][0], 0, 1)
                h = h - (h - lift * C['tuck'][1]) * (1 - np.sqrt(1 - te ** 2))
            ht = ROUND * L['flat'] * hw * (lock[6] if lock else 1.0)
            h = np.maximum(h, ht + 0.004)
            roll = L['roll'] * rng.uniform(-1, 1) * ROUND
            tone = float(np.clip(rng.lognormal(0, L.get('tones', 0.1)), 0.78, 1.25))
            u_mid = None
            if lock:
                # (round 180) the strands of a lock lie in one arch, each leaning as the arch does at its place;
                # the arch comes in over the first 3 cm and is as much lower as the lock is narrower where the
                # hair is drawn together; one tone a lock, and neighbouring places of the image
                s_, in_ = across_l[k], smooth(run / 0.3)
                h = np.maximum(h + lift * (lock[0] * high_l[k] * (0.5 - s_ ** 2) + lock[1] * lean_l[k] * s_) * g * in_, ht + 0.004)
                lie = np.sign(along_l[k] @ side[min(4, len(side) - 1)])
                roll = roll * lock[3] - lie * lift * (-2 * lock[0] * high_l[k] * s_ + lock[1] * lean_l[k]) / max(broad_l[k], 0.05) * in_
                tone = tone_l[k] * tone ** lock[3]
                u_mid = 0.5 + u_l[k] + lock[4] * (s_ if many_l[k] == 1 else 1 - 2 * abs((s_ * many_l[k] + 1) / 2 % 2 - 1))
            out_ += lay(d, h, hw, ht, roll, run, L['tone'] * tone * (0.75 + 0.25 * smooth(run / 0.2)), rng, m=L.get('m', 7), across=L.get('across'), u_mid=u_mid)
    return out_


def lay(d, h, hw, ht, roll, run, shade, rng, m=7, rolled=None, across=None, u_mid=None):
    """A band laid over the skin: its middle's directions, its height, half breadth and half thickness ring by
    ring, how much it leans to one flank. Returns it as a list of one piece: its rings, their places in the image,
    the points they are bound by, a shade for each ring and for each ring how far it is turned off the head (0:
    not).
    `rolled`: from that ring on the band leaves the skin and turns out and up in a roll (each ring's angle, the
    radius, the way to the side for a radian): the ring where it begins, carried round, as broad as the band is
    there; the roll is bound by the place it begins at."""
    turn = np.linspace(-np.pi / 2, np.pi / 2, m)
    c = OVER.at(d, h)
    n0 = unit(c - hc)
    b = unit(np.cross(unit(np.gradient(c, axis=0)), n0))

    def arch(c_, b_, h_, hw_, ht_, a_):
        # the band's surface at the angles `a_` across it (a quarter turn to either flank), ring by ring
        lat = hw_[:, None] * np.sin(a_)
        dd = unit(c_[:, None, :] + b_[:, None, :] * lat[..., None] - hc)
        return hc + dd * (OVER.skin(dd) + h_[:, None] + ht_[:, None] * (2 * np.cos(a_) - 1) + np.asarray(roll)[..., None] * lat)[..., None]

    rings = arch(c, b, h, hw, ht, turn[None, :])
    out = np.zeros(len(c))
    if rolled is not None:
        i0, phi, R, drift = rolled
        t0 = unit(c[i0] - c[i0 - 1])
        n = unit(c[i0] - hc)
        n = unit(n - t0 * (n @ t0))
        b0 = np.cross(t0, n)
        rel = rings[i0] - c[i0]
        lt, ln, lb = rel @ t0, rel @ n, rel @ b0
        # (the band's arch turns over as it rolls: its ridge stays on the side that is seen)
        out = smooth((phi - 0.8) / 1.4)
        lit = smooth(phi / 1.0)
        for k in range(i0 + 1, len(c)):
            s, cp, sp = hw[k] / hw[i0], np.cos(phi[k]), np.sin(phi[k])
            cen = c[i0] + t0 * R * sp + n * R * (1 - cp) + b0 * drift * phi[k]
            rings[k] = cen + s * (lb[:, None] * b0 + lt[:, None] * (t0 * cp + n * sp) + (1 - 2 * out[k]) * ln[:, None] * (n * cp - t0 * sp))
        c = c.copy()
        c[i0 + 1:] = c[i0]
        out = lit
    flip = rng.random() >= 0.5
    u = np.linspace(0, 1, m)
    u = 1 - u if flip else u
    v0 = rng.random()
    uv = np.stack(np.broadcast_arrays(u[None, :], (v0 + run * VSCALE)[:, None]), -1)
    if across:
        # (round 171) a strand takes as much of the image's breadth as it is broad: the image's hairs are as fine
        # on a strand of 5 mm as on a bundle of 3 cm
        lat = hw[:, None] * np.sin(turn)[None, :] / across
        mid = rng.uniform(0.5 * hw.max() / across, 1 - 0.5 * hw.max() / across)
        uv[..., 0] = (mid if u_mid is None else u_mid) + (-lat if flip else lat)
    return [(rings, uv, c, shade, out)]


def shell():
    """The shell under the bundles: the skull's form a little off the skin, from the top (a horseshoe: from under
    its upper edge, where it comes out of the skin) to just above the cut."""
    S = C['shell']
    th = np.arange(-180, 180, 5.0)
    q = np.linspace(0, 1, 22)[1:]
    thin = 1 - C['thin'] * smooth((q - 0.75) / 0.25)
    if C.get('bare'):
        th = th[bare(th) - level(th) > 14]
        q = np.linspace(0, 1, 12)
        thin = (1 - C['thin']) * smooth(q / 0.3)
        top_el = bare(th) - 5.0
    else:
        top_el = np.full(len(th), 90.0)
    el = top_el[None, :] + (level(th)[None, :] + S['up'] - top_el[None, :]) * q[:, None]
    d = dirs(np.broadcast_to(th[None, :], el.shape), el)
    P = OVER.at(d, np.maximum(LIFT * S['h'] * thin[:, None] * np.ones_like(el), 0.003))
    n = len(th)
    verts = list(P.reshape(-1, 3))
    uvs = [(t / 45.0, 1.5 * qq) for qq in q for t in th]
    tris = []
    closed = not C.get('bare')
    for i in range(len(q) - 1):
        for j in range(n):
            if (th[(j + 1) % n] - th[j]) % 360 > 6:       # a horseshoe is open in front of the face
                continue
            # (counter-clockwise seen from outside: the builder reads the surface's direction from the triangles)
            a, b_, c_, d_ = i * n + j, i * n + (j + 1) % n, (i + 1) * n + j, (i + 1) * n + (j + 1) % n
            tris += [(a, c_, b_), (b_, c_, d_)]
    if closed:
        verts.append(OVER.at(np.array([0, 1.0, 0]), np.array(LIFT * S['h'])))
        uvs.append((0.5, 0.0))
        for j in range(n):
            tris.append((len(verts) - 1, j, (j + 1) % n))
    return np.array(verts), uvs, tris, S['shade']


def lattice(P, seed):
    """Smooth noise over space, 0 to 1: random values at the corners of a grid of unit cubes, blended between."""
    i = np.floor(P).astype(np.int64)
    f = P - i
    f = f * f * (3 - 2 * f)
    out_ = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                x, y, z = i[..., 0] + dx, i[..., 1] + dy, i[..., 2] + dz
                hsh = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (seed * 2654435761)
                hsh = (hsh ^ (hsh >> 13)) * 1274126177
                r = ((hsh ^ (hsh >> 16)) & 0xffff) / 65535.0
                out_ = out_ + r * np.where(dx, f[..., 0], 1 - f[..., 0]) * np.where(dy, f[..., 1], 1 - f[..., 1]) * np.where(dz, f[..., 2], 1 - f[..., 2])
    return out_


def fleece():
    """Tightly curled hair: one mass over the skull from the whorl to the hairline, as rays from the whorl (no
    ray's end is seen from the front), its surface tufts. As `shell` gives its own: points, their places in the
    image, triangles, tone."""
    line = np.array(C['line'], float)
    step, rings = C['grid']
    phi = np.radians(np.arange(0, 360, step))
    e1 = unit(np.cross(W, np.array([1.0, 0, 0])))
    e2 = np.cross(W, e1)
    ray = np.cos(phi)[:, None] * e1 + np.sin(phi)[:, None] * e2

    def at(a):
        return np.cos(a)[..., None] * W + np.sin(a)[..., None] * ray

    # how far along each ray the hairline lies
    a = np.radians(np.arange(1.0, 175.0, 0.25))
    D = at(a[:, None] * np.ones(len(phi))[None, :])
    th, el = ang(D)
    inside = el > np.interp(np.abs(th), line[:, 0], line[:, 1])
    far = a[np.argmax(~inside, axis=0)]
    # (evened out round the whorl: a ray's end is not a corner of the line's table)
    for _ in range(2):
        far = 0.25 * np.roll(far, 1) + 0.5 * far + 0.25 * np.roll(far, -1)
    # (and uneven at the size of a tuft)
    rag, size = C['ragged']
    far = far + np.radians(rag) * (2 * lattice(OVER.at(at(far), 0 * far) / size, SEED + 7) - 1)
    t = np.linspace(0, 1, rings + 1)[1:]
    d = at(t[:, None] * far[None, :])
    rim_ = d[-1]
    # how far inside the hairline a point is, in degrees (to the line's nearest point)
    near = np.degrees(np.arccos(np.clip(np.einsum('ijk,lk->ijl', d, rim_), -1, 1))).min(-1)
    grow = smooth(near / C['edge'][1])
    if C.get('bare'):
        # a horseshoe: nothing above its upper edge, and coming up from the skin below it
        th_, el_ = ang(d)
        top = smooth((bare(th_) - el_) / 9.0)
        grow = grow * top
    h = LIFT * C['h'] * (C['edge'][0] + (1 - C['edge'][0]) * grow)
    P0 = OVER.at(d, h)
    for k, (size, high) in enumerate(C['tufts']):
        h = h + LIFT * high * (2 * lattice(P0 / size + 31.7 * k, SEED + k) - 1) * (0.25 + 0.75 * grow)
    # its edge goes into the skin: a mass that ended a hair's breadth over the skin would end in a line of light
    P = OVER.at(d, np.where(grow < 0.02, -0.012, np.maximum(h, 0.003)))
    n = len(phi)
    verts = [OVER.at(W, np.array(LIFT * C['h']))] + list(P.reshape(-1, 3))
    uvs = [(0.0, 0.0)] + [(float(ph) * 0.95, float(tt * fa) * 0.95) for tt in t for ph, fa in zip(phi, far)]
    tris = [(0, 1 + (j + 1) % n, 1 + j) for j in range(n)]
    for i in range(rings - 1):
        for j in range(n):
            q0, q1, q2, q3 = 1 + i * n + j, 1 + i * n + (j + 1) % n, 1 + (i + 1) * n + j, 1 + (i + 1) * n + (j + 1) % n
            tris += [(q0, q1, q2), (q1, q3, q2)]
    if C.get('bare'):
        # (no triangle on the bare top)
        on = np.concatenate([[0.0], top.reshape(-1)]) > 0.0
        tris = [t_ for t_ in tris if on[list(t_)].any()]
    V = np.array(verts)
    # counter-clockwise seen from outside (the builder reads the surface's direction from the triangles)
    q = np.array(tris[len(tris) // 2])
    if np.dot(np.cross(V[q[1]] - V[q[0]], V[q[2]] - V[q[0]]), V[q[0]] - hc) < 0:
        tris = [(t_[0], t_[2], t_[1]) for t_ in tris]
    # a triangle's places in the image: the seam where the rays have come round once is a jump of the image there
    tuv = []
    for t_ in tris:
        uv = [list(uvs[i]) for i in t_]
        us = [u for u, _ in uv]
        if max(us) - min(us) > np.pi * 0.95:
            uv = [[u + (2 * np.pi * 0.95 if u < np.pi * 0.95 else 0), v] for u, v in uv]
        tuv.append(tuple(tuple(x) for x in uv))
    return V, tuv, tris, C['shade']


verts, anchors, shades, tris, tri_uv, turned = [], [], [], [], [], []
if C.get('coily'):
    sv, stuv, stris, sshade = fleece()
    verts, anchors, shades = list(sv), list(sv), [sshade] * len(sv)
    tris, tri_uv = list(stris), list(stuv)
for L in C.get('layers', []):
    for rings, uv, anc, shade, over in (parted if C.get('parted') else bundles)(L, np.random.default_rng(L['seed'] + 100 * SEED)):
        n, m = rings.shape[:2]
        o = len(verts)
        turned += [(o + i * m + j, w) for i, w in enumerate(over) if w > 0 for j in range(m)]
        verts += list(rings.reshape(-1, 3))
        anchors += list(np.repeat(anc, m, axis=0))
        shades += list(np.repeat(shade, m))
        for s in range(n - 1):
            for j in range(m - 1):
                a, b_, c_, d_ = o + s * m + j, o + s * m + j + 1, o + (s + 1) * m + j, o + (s + 1) * m + j + 1
                ua, ub, uc, ud = uv[s, j], uv[s, j + 1], uv[s + 1, j], uv[s + 1, j + 1]
                tris.append((a, b_, c_)); tri_uv.append((tuple(ua), tuple(ub), tuple(uc)))
                tris.append((b_, d_, c_)); tri_uv.append((tuple(ub), tuple(ud), tuple(uc)))
if not C.get('parted') and not C.get('coily'):
    sv, suv, stris, sshade = shell()
    o = len(verts)
    verts += list(sv)
    anchors += list(sv)
    shades += [sshade] * len(sv)
    for t in stris:
        tris.append(tuple(o + i for i in t)); tri_uv.append(tuple(suv[i] for i in t))
verts = np.array(verts); anchors = np.array(anchors); shades = np.array(shades)

# The same as a Blender object (to look at, to work on by hand, to bake), in base.obj's coordinates
# (round 171) In a Blender that is open (run through its MCP add-on) the hair is made in a scene of its own, and
# nothing of the scene that is open there is touched (`hairlib.py` `in_blender`)
scene, ob = in_blender(name + '_body', verts, tris, tri_uv, os.environ.get('SCENE'))
# The shade between the bundles, baked in Blender (Cycles, ambient occlusion per corner, the head standing in the
# hair): a furrow between two ridges, a bundle's beginning under its neighbours and the shell behind them see
# less of the sky than a ridge does. `AO=dist,samples,floor,power` (0: none): how far a place looks, how often,
# how dark a place that sees nothing is drawn, and the measure's power.
AO = [float(t) for t in os.environ.get('AO', '0.15,96,0.4,1.0').split(',')]
if AO[0] > 0:
    ao = bake_ao(scene, ob, [('head', H.V, H.T)], AO[0] * max(LIFT, 0.4), AO[1])
    # (a band that is turned over shows its underside, which the bake reads as facing the head: `turn`'s sixth
    # number of the way to an open place's shade is given back to it)
    for i, w in turned:
        ao[i] += (1 - ao[i]) * w * C['turn'][5]
    shades = shades * (AO[2] + (1 - AO[2]) * np.clip(ao, 0, 1) ** AO[3])
if os.environ.get('BLEND'):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(os.environ['BLEND']))

os.makedirs(out, exist_ok=True)
bind = bind_points(BIND, verts, anchors)
with open(os.path.join(out, name + '_body.txt'), 'w') as f:
    f.write(f'{len(bind)} {len(tris)} {int(os.environ.get("EVEN", "6"))}\n')
    for (r, w_, o_), s in zip(bind, shades):
        f.write(' '.join(map(str, r)) + ' ' + ' '.join(f'{x:.6f}' for x in list(w_) + list(o_)) + f' {s:.3f}\n')
    for t, uv in zip(tris, tri_uv):
        # v as in OBJ files (up from the bottom): the reader flips it
        f.write(' '.join(map(str, t)) + ' ' + ' '.join(f'{u:.6f} {1 - v:.6f}' for u, v in uv) + '\n')
with open(os.path.join(out, name + '_body_view.obj'), 'w') as f:
    for p in verts:
        f.write('v %.5f %.5f %.5f\n' % tuple(p))
    for t in tris:
        f.write('f %d %d %d\n' % (t[0] + 1, t[1] + 1, t[2] + 1))
print(cut, name, 'corners', len(verts), 'triangles', len(tris))
