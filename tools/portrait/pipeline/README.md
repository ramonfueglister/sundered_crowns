# The pipeline of the real look's files

Apoleia's `tools/portrait-pipeline` (Blender scripts that drape clothes over MakeHuman's body, lay hair cards, and
bind both to the head's triangles so the builder can move them with a morphed head), with what the dress of England
1356 needed added: `tunic_sim.py` (neck opening `NECK`, `NDIP`; sleeves `SLEN`, `SFLARE`), `drape_sim.py` (kinds
`hood` and `cowl`; `UCUT`, `THMAX`, `OFF0`, `VTH`, `SK_OUT`, `CW_IN`, `CW_UP`, `CW_GAP`), `styles.py` (hairstyles `bob` and `plait`; `bob` with `BOB_CUT`: every strand is cut where it crosses the fringe's line in front of the face),
`tunic_bind.py` (`HEAD`, `HEM`, `HEMSMOOTH`, `TAUBIN`), `fabric_tex.py` (woven cloth as an image).

Not part of the game's build: the files they wrote are in `public/portrait/real/`. This folder is there so that
they can be written again.

Needs: `python3 -m venv venv && venv/bin/pip install bpy==5.2.3 numpy pillow` (PY below), and MakeHuman's body
`base.obj` (github.com/makehumancommunity/makehuman, makehuman/data/3dobjs/base.obj, CC0; B below).

## The files of England 1356, as written on 15.11.2026

Every value is a choice by eye from the rounds against the reference pictures (PLACEHOLDER), none is sourced.

| File | Call |
|---|---|
| gown `cloth_cote` | `SFLARE=0.0 SLEN=9 NECK=0.3 NDIP=0.2 FRIC=0.5 WIDE=0.5 BEND=1.5 LOOSE=0.45 $PY tunic_sim.py $B cote.obj 100`, bound with `XMAX=2.55 AO=9 TAUBIN=4 $PY tunic_bind.py $B cote.obj out cloth_cote` |
| hood up `cloth_hood_up` | `UCUT=22:4,30:3,38:2,46:1 FACE_LO=-46 TH0=-49 PINY=5.6 HEMY=4.9 LOOSE=0.35 BEND=1.5 MASS=0.6 $PY drape_sim.py $B cote.obj hood hood_up.obj 80` |
| hood thrown back `cloth_hood_down` | `CW_Y=5.62 COWL=0.24,0.75,0.24,0.6 CW_IN=1 CW_UP=0.35 CW_GAP=0.12 PINY=5.9 HEMY=4.9 BEND=1.5 MASS=0.6 $PY drape_sim.py $B cote.obj cowl hood_down.obj 80` (its inner edge on the neck, lifted towards the nape; only what lies above `PINY` is held, the roll in front sinks onto the shoulders in the simulation) |
| veil `cloth_veil_linen` | `FACE_HI=29 FACE_W=42 FACE_LO=-46 TH0=-20 UCUT=100:8 PINY=6.3 HEMY=4.6 OFF0=0.18 LOOSE=0.2 BEND=1.5 MASS=0.4 $PY drape_sim.py $B cote.obj hood veil.obj 80` (built as a hood that ends at the jaw in front and hangs down behind the shoulders) |
| wimple `cloth_wimple` | `UCUT=20:3,28:2,36:1 FACE_LO=-46 TH0=-49 THMAX=52 FACE_W=36 PINY=5.0 HEMY=5.45 LOOSE=0.12 BEND=2.0 $PY drape_sim.py $B cote.obj hood wimple.obj 2` |
| the four above, bound | `HEAD=1 HEM=all R_HEM=0.035 TAUBIN=10 HEMSMOOTH=60 AO=9 python3 tunic_bind.py $B x.obj out cloth_<name>` (veil: `R_HEM=0.03`) |
| hair `bob01` | `BOB_WAVE=0.03,0.05,0.9 BOB_K=520 BOB_W=0.26,0.4 BOB_FMIN=11 BOB_FW=62 BOB_FK=0.75 SEED=5 BOB_END=-26 BOB_FRINGE=40 python3 styles.py $B hair bob bob01` (since round 50 from more, narrower strands with a slight swing: locks in the outline instead of a smooth dome; until then without the first three switches, as `bob03` and `bob04` still are) |
| hair gone back at the temples `bob03`, a horseshoe round a bare top `bob04` | as `bob01` with `BOB_LINE=rec` and `BOB_LINE=bald`: `BOB_LINE=rec BOB_FMIN=11 BOB_FW=62 BOB_FK=0.75 SEED=5 BOB_END=-26 BOB_FRINGE=40 python3 styles.py $B hair bob bob03`; card images copied from `bob01.webp`, `bob01_n.webp` |
| wavy hair for a head with curls `bob05` | as `bob01` from more, narrower strands that swing: `BOB_WAVE=0.07,0.08,0.65 BOB_K=520 BOB_W=0.26,0.4 BOB_FMIN=11 BOB_FW=62 BOB_FK=0.75 SEED=5 BOB_END=-26 BOB_FRINGE=40 python3 styles.py $B hair bob bob05` (`BOB_WAVE`: how far a strand swings sideways, how far it stands off, the length of one wave; `hairlib.py` `cards_from_wisps(wave=)`); card images copied from `bob01.webp`, `bob01_n.webp`. A wave of 0.4 gave zigzags in the fringe. |
| full beard `beard_crop` | `python3 beards.py $B beard crop beard_crop` (since round 53: no cards, the painted layer of short hairs alone, standing off the skin: `hairlib.py` `paint_cap(lift=)`, `beards.py` `crop_lift`. `CROP_LIFT=0.03,0.06` how far on cheeks and jaw and at the chin, `CROP_DOWN=-0.25`, `CROP_TAUT=300` the layer under the jaw drawn taut from jaw to throat, `CROP_RAMP=1.5` how soon it is dense from its edge, `CROP_LC=0.08` length of a painted hair, `CROP_N=130000` their number). Its files: `beard_crop.txt.zst` (no cards: `0 0`), `beard_crop_cap.*`, `beard_crop_scalp.txt` |
| hair under a hood `bob02` | the same lying flat: `BOB_LIFT=0.015,0.03 BOB_FMIN=6 BOB_FW=62 BOB_FK=0.45 SEED=5 BOB_END=-26 BOB_FRINGE=46 python3 styles.py $B hairflat bob bob02` |
| hair of girls and young women `plait01` | `python3 styles.py $B plait plait plait01` (centre parting, the hair by the temples over the ears, two plaits; their way down in front of the shoulders is a table in the script, measured on `cote.obj`; `PLAIT_G`, `PLAIT_T`, `PLAIT_HL`, `PLAIT_LIFT`, `PLAIT_R`, `PLAIT_W`). Since round 46 the hairline lies 11 degrees lower and the hair stands further off the head (`PLAIT_HL` 11, `PLAIT_LIFT` 0.075,0.05; before 5 and 0.045,0.04: a high forehead under a flat cap of hair). Its card image is Apoleia's `braid01.webp` unchanged. |
| women's brows `eyebrow011` | MakeHuman's proxy (makehuman/data/eyebrows/eyebrow011, CC0; H its folder): `python3 convert.py $B $H out eyebrow011`, `ALPHA_GAIN=2.5 python3 tex.py $H out eyebrow011` (2.5 is what Apoleia's `eyebrow001.webp` was written with: its image comes out the same) |
| normals of the painted caps | `python3 nmap.py bob01_cap.png bob01_cap_n.png` (no third argument: `8` is the number of strands side by side in an image of cards and adds a round profile to each of eight columns. Until round 53 the caps of 1356 were written with it: eight upright bands of tilted normals, dark patches with straight edges on beard and hair. `bob01` to `bob05`, `plait01` rewritten from their images) |
| cloth images | `python3 fabric_tex.py out.png out_n.png wool 88`, `... linen 128` |

The image of the hair cards (`bob01.webp`, `bob02.webp`, with `_n`) is Apoleia's `roman01.webp` with blunt ends: its
rows along the strand remapped by `np.interp(v, [0, 0.6, 0.93, 1.0], [0, 0.6, 0.8, 1.0])`, so the fading of the last
two fifths happens in the last 7 per cent. Images go into the repository as WebP of at most 1024 pixels (quality 92,
normals 90), data files of more than a few hundred kB packed with zstd.

Tried and dropped: the full beard from cards (`python3 beards.py $B beard trim beard_trim`, the state of rounds 45 to 52, fewer and broader cards that hardly taper: rows of shingles, lighter than the painted layer under them; `TRIM_K=800` with narrower, shorter cards: a curtain of yarn); the layer of `beard_crop` hung from the jaw's outline as a skirt (a zigzag collar), and drawn taut freely (it cuts into the throat: it now moves along the skin's normal only and never inwards); the full beard's cards cut off before their strands thin out (`TRIM_V=0.68 python3 beards.py $B beard trim beard_trim`, `hairlib.py` `write_cards(vend=)`: square notches along the beard's lower edge, the rows of card ends stay); the veil as a grid of rays over head, neck and shoulders (kind `veil`: `VTH=29 OFF0=0.18 SKIRT=9 SK_OUT=0.07 LOOSE=0.6 BEND=4.0 MASS=0.3`, the state until round 28): its front edges cling to the neck as strings and its hem crumples on the upper arms; the same built as a hood down to the shoulders all round (`TH0=-49`): wings in front of the shoulders; a thicker, folded roll of the thrown-back hood (`FOLD=0.5`: stands off the neck); that hood with its inner edge on the gown's neckline and wholly held (`COWL=0.16,0.75,0.14,0.6 PINY=5.55`, the state until round 34: a flat board with two rings round the neck); a still thicker roll (`COWL=0.36,0.65,0.34,0.5`: a tube under the chin); plaits of Apoleia's width (`PLAIT_R=0.085,0.24 PLAIT_W=0.11`: cords), the hair straight from the parting to behind the ear (`PLAIT_G=104,-40` without the way by the temple: a pointed forehead, the ears bare), the hairline of the crown braid unchanged (`PLAIT_HL=0`: the forehead too high); the men's hair from twice as many, narrower strands (`BOB_K=900 BOB_W=0.2,0.32`: a slightly cleaner fringe at twice the triangles and file size, no difference at the game's size, the hair still reads as a smooth cap); the men's hair with strands standing off unevenly (`BOB_LIFT=0.045,0.14 BOB_FMIN=11 BOB_FW=62 BOB_FK=0.75 SEED=5 BOB_END=-26 BOB_FRINGE=40`: a slightly less even fringe, the outline stays a dome, no difference at the game's size); `SKIRT=6` for
the veil (flies out sideways); skin images of 2048 pixels (no visible difference at portrait size).
