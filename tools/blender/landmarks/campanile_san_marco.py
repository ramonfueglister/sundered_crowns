"""The Campanile di San Marco as it stood in 1356, built from the measures in campanile_san_marco_1356.json.

    python3 tools/blender/landmarks/campanile_san_marco.py [--out public/models/landmarks] [--preview out.png]

Every length comes from the measure file (value, unit, source or assumption); this script only arranges them. Blocks
are the game's unit; Z is up until the glTF export turns the model to Y up. Prints triangles and height at the end.
"""
from __future__ import annotations

import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from lib.diorama import Model, clear_scene, export_glb, load_measures, m2b, render_preview, rgb, shade  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))


def build(data: dict) -> Model:
    m = Model.new(data['id'])
    half = m2b(data, 'schaft_seite') / 2
    plinth, shaft_h = m2b(data, 'sockel_hoehe'), m2b(data, 'schaft_hoehe')
    belfry_h, dado_h, spire_h = m2b(data, 'glockenstube_hoehe'), m2b(data, 'dado_hoehe'), m2b(data, 'spitze_hoehe')
    brick, stone, marble, copper, dark = rgb('BRICK'), rgb('STONE'), rgb('MARBLE'), rgb('COPPER'), rgb('OPENING')

    # the stone plinth, a little wider than the shaft
    p = half + m2b(data, 'sockel_vorsprung')
    m.box(-p, -p, -0.5, p, p, plinth, stone)

    # the brick shaft with its pilaster strips: the strips stand a touch proud and paler, the fields between them darker
    z0, z1 = plinth, plinth + shaft_h
    m.box(-half, -half, z0, half, half, z1, brick)
    n, w = int(data['masse']['lisenen_pro_seite']['wert']), m2b(data, 'lisenen_breite')
    side = 2 * half
    for s in ('+x', '-x', '+y', '-y'):
        for k in range(n):
            u = (side / n) * (k + 0.5)
            m.pane(s, -half, -half, half, half, z0 + 0.1, z1 - 0.1, u - w / 2, u + w / 2, shade(brick, 1.18), 0.06)
            if k > 0:
                # the shadow of the recessed field between two strips
                m.pane(s, -half, -half, half, half, z0 + 0.3, z1 - 0.3, u - side / n + w / 2 + 0.02, u - w / 2 - 0.02, shade(brick, 0.86), 0.02)

    # the belfry of 1329: a stone arcade on a thin cornice
    z2 = z1 + belfry_h
    m.box(-half - 0.08, -half - 0.08, z1, half + 0.08, half + 0.08, z1 + 0.14, marble)
    m.box(-half, -half, z1 + 0.14, half, half, z2, stone)
    arches = int(data['masse']['glockenstube_boegen_pro_seite']['wert'])
    aw = side / arches
    for s in ('+x', '-x', '+y', '-y'):
        for k in range(arches):
            uc = aw * (k + 0.5)
            m.arch(s, -half, -half, half, half, uc, z1 + 0.14 + belfry_h * 0.12, aw * 0.3, z2 - belfry_h * 0.35, dark)

    # the dado above it, brick again, and the eaves board of the spire
    z3 = z2 + dado_h
    m.box(-half - 0.1, -half - 0.1, z2, half + 0.1, half + 0.1, z2 + 0.14, marble)
    m.box(-half, -half, z2 + 0.14, half, half, z3, brick)
    m.box(-half - 0.12, -half - 0.12, z3, half + 0.12, half + 0.12, z3 + 0.12, shade(copper, 0.8))

    # the wooden spire in its copper plates, not yet gilded
    m.pyramid(0, 0, z3 + 0.12, half + 0.12, spire_h, copper)
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, 'public', 'models', 'landmarks'))
    ap.add_argument('--preview', default=None)
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    data = load_measures(os.path.join(HERE, 'campanile_san_marco_1356.json'))
    clear_scene()
    model = build(data)
    obj = model.to_object()
    height = max(v.co.z for v in obj.data.vertices)
    export_glb(obj, os.path.join(args.out, f"{data['id']}_{data['zustand']}.glb"))
    print(f"{data['id']} {data['zustand']}: {model.triangles()} triangles, {height:.1f} blocks high "
          f"({height * data['massstab']['meter_pro_block']:.0f} m), footprint {m2b(data, 'schaft_seite') + 2 * m2b(data, 'sockel_vorsprung'):.1f} blocks")
    if args.preview:
        render_preview(args.preview, height)


if __name__ == '__main__':
    main()
