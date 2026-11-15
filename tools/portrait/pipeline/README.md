# The pipeline of the real look's files

Apoleia's `tools/portrait-pipeline` (Blender scripts that drape clothes over MakeHuman's body, lay hair cards, and
bind both to the head's triangles so the builder can move them with a morphed head), with what the dress of England
1356 needed added: `tunic_sim.py` (neck opening `NECK`, `NDIP`; sleeves `SLEN`, `SFLARE`), `drape_sim.py` (kinds
`hood` and `cowl`; `UCUT`, `THMAX`, `OFF0`, `VTH`, `SK_OUT`, `CW_IN`, `CW_UP`, `CW_GAP`), `styles.py` (hairstyle `bob`, with `BOB_CUT`: every strand is cut where it crosses the fringe's line in front of the face),
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
| hair `bob01` | `BOB_FMIN=11 BOB_FW=62 BOB_FK=0.75 SEED=5 BOB_END=-26 BOB_FRINGE=40 python3 styles.py $B hair bob bob01` |
| hair under a hood `bob02` | the same lying flat: `BOB_LIFT=0.015,0.03 BOB_FMIN=6 BOB_FW=62 BOB_FK=0.45 SEED=5 BOB_END=-26 BOB_FRINGE=46 python3 styles.py $B hairflat bob bob02` |
| normals of the painted caps | `python3 nmap.py bob01_cap.png bob01_cap_n.png 8` |
| cloth images | `python3 fabric_tex.py out.png out_n.png wool 88`, `... linen 128` |

The image of the hair cards (`bob01.webp`, `bob02.webp`, with `_n`) is Apoleia's `roman01.webp` with blunt ends: its
rows along the strand remapped by `np.interp(v, [0, 0.6, 0.93, 1.0], [0, 0.6, 0.8, 1.0])`, so the fading of the last
two fifths happens in the last 7 per cent. Images go into the repository as WebP of at most 1024 pixels (quality 92,
normals 90), data files of more than a few hundred kB packed with zstd.

Tried and dropped: the veil as a grid of rays over head, neck and shoulders (kind `veil`: `VTH=29 OFF0=0.18 SKIRT=9 SK_OUT=0.07 LOOSE=0.6 BEND=4.0 MASS=0.3`, the state until round 28): its front edges cling to the neck as strings and its hem crumples on the upper arms; the same built as a hood down to the shoulders all round (`TH0=-49`): wings in front of the shoulders; a thicker, folded roll of the thrown-back hood (`FOLD=0.5`: stands off the neck); that hood with its inner edge on the gown's neckline and wholly held (`COWL=0.16,0.75,0.14,0.6 PINY=5.55`, the state until round 34: a flat board with two rings round the neck); a still thicker roll (`COWL=0.36,0.65,0.34,0.5`: a tube under the chin); `SKIRT=6` for
the veil (flies out sideways); skin images of 2048 pixels (no visible difference at portrait size).
