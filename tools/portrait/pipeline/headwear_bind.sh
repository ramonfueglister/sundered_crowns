#!/bin/sh
# Binds the soft headwear that headwear_soft.py (and bascinet.py) wrote into out/, and puts every headwear file
# into public/portrait/real (data files over 100 kB packed with zstd). Rigid pieces (metal_helm_great,
# metal_bascinet, metal_crown) are written by headwear_lib.write_rigid into out/bound and only copied.
#   sh headwear_bind.sh [name ...]      (default: all; names as below, e.g. hat_straw)
set -e
cd "$(dirname "$0")"
REAL=../../../public/portrait/real
bind() { # obj name, file name, own uv (1/0)
  uv=""; [ "$3" = 1 ] && uv="out/$1_uv.txt"
  HEAD=1 HEM=all R_HEM=0.025 TAUBIN=2 HEMSMOOTH=20 AO=6 UVFILE=$uv python3 -I tunic_bind.py base.obj "out/$1.obj" out/bound "$2" | grep -E "verts"
  rm -f "out/bound/$2.png"
}
ALL="aventail coif_linen mail_coif mail_coif_skirt hat_felt hat_straw"
for n in ${@:-$ALL}; do
  case $n in
    aventail) bind aventail metal_mail_aventail 0 ;;
    coif_linen) bind coif_linen cloth_coif_linen 1 ;;
    mail_coif) bind mail_coif metal_mail_coif 1 ;;
    mail_coif_skirt) bind mail_coif_skirt metal_mail_coif_skirt 0 ;;
    hat_felt) bind hat_felt cloth_hat_felt 1 ;;
    hat_straw) bind hat_straw cloth_hat_straw 1 ;;
    *) echo "unknown: $n"; exit 1 ;;
  esac
done
for f in out/bound/*; do
  b=$(basename "$f")
  case $b in
    *.txt) if [ "$(wc -c < "$f")" -gt 100000 ]; then rm -f "$REAL/$b"; zstd -q -19 -f "$f" -o "$REAL/$b.zst"; else rm -f "$REAL/$b.zst"; cp "$f" "$REAL/$b"; fi ;;
    *) cp "$f" "$REAL/$b" ;;
  esac
done
