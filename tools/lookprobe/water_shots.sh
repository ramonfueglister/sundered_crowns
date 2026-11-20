#!/usr/bin/env bash
# Takes the pictures of the water gauntlet's scenes (gauntlet_water.py SCENES) with the world probe, all at once.
# Usage: tools/lookprobe/water_shots.sh <folder> [extra address options]   (the dev server must run; PROBE_URL as shot.mjs)
set -u
out=${1:?folder}; extra=${2:-}
mkdir -p "$out"
here=$(dirname "$0")
# (where the water moves, the scene is taken at the moments MOMENTS too: water_frames.mjs)
python3 -c "import sys; sys.path.insert(0, '$here'); from gauntlet_water import SCENES, MOVES, MOMENTS; [print(n, a, ','.join(map(str, MOMENTS)) if k in MOVES else '') for n, a, k in SCENES]" |
{ while read -r name address moments; do
  if [ -n "$moments" ]; then
    node "$here/water_frames.mjs" "$out/$name" "$address${extra:+&$extra}" "$moments" 2>&1 | tail -1 | cut -c1-120 > "$out/$name.log" &
  else
    PROBE_PAGE=world-probe.html node "$here/shot.mjs" "$out/$name.png" "$address${extra:+&$extra}" 2>&1 | grep -v 'GL Driver' | tail -1 | cut -c1-120 > "$out/$name.log" &
  fi
done; wait; }
