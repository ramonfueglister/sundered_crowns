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
SIDES = ('+x', '-x', '+y', '-y')


def cornice(m: Model, half: float, z: float, h: float, out: float, colour):
    """A stepped cornice around the square of half side ``half``: a narrow lower step, a wider upper one."""
    m.box(-half - out / 2, -half - out / 2, z, half + out / 2, half + out / 2, z + h / 2, colour)
    m.box(-half - out, -half - out, z + h / 2, half + out, half + out, z + h, colour)


def build(data: dict) -> Model:
    m = Model.new(data['id'])
    b = lambda key: m2b(data, key)  # noqa: E731
    half = b('schaft_seite') / 2
    stone, marble, gold, dark = rgb('STONE'), rgb('MARBLE'), rgb('GOLD'), rgb('OPENING')
    colour = lambda key: rgb(int(data['masse'][key]['wert'].lstrip('#'), 16))  # noqa: E731
    brick, dado, copper = colour('farbe_schaft'), colour('farbe_dado'), colour('farbe_spitze')

    # the stone plinth, a little wider than the shaft, reaching half a block into the ground
    p = half + b('sockel_vorsprung')
    z0 = b('sockel_hoehe')
    m.box(-p, -p, -0.5, p, p, z0, stone, foot=0.8)

    # the fluted brick shaft: a core, and on each side five pilaster strips standing proud of it, so that the four
    # flutes between them are real recesses; the strips at the corners are shared by two sides
    z1 = z0 + b('schaft_hoehe')
    n, fw, depth = int(data['masse']['rillen_pro_seite']['wert']), b('rillen_breite'), b('rillen_tiefe')
    core = half - depth
    m.box(-core, -core, z0, core, core, z1, brick, foot=0.88)
    strip = (2 * half - n * fw) / (n + 1)
    for s in SIDES:
        for k in range(n + 1):
            u0 = k * (strip + fw)
            a, c = Model._on(s, -half, -half, half, half, u0, z0, 0), Model._on(s, -half, -half, half, half, u0 + strip, z0, -depth)
            m.box(min(a[0], c[0]), min(a[1], c[1]), z0, max(a[0], c[0]), max(a[1], c[1]), z1, brick, foot=0.88)
    # the eight small windows of the stair ramp, one above the other in one flute of one side
    wins, wh = int(data['masse']['schaft_fenster']['wert']), b('schaft_fenster_hoehe')
    uw = strip + fw / 2
    for k in range(wins):
        zc = z0 + (k + 1) * (z1 - z0) / (wins + 1)
        m.pane('+y', -half, -half, half, half, zc - wh / 2, zc + wh / 2, uw - fw * 0.3, uw + fw * 0.3, dark, -depth + 0.02)

    # the belfry: a white arcade on a cornice, open so that the dark bell chamber shows through the arches
    gh, go = b('gesims_hoehe'), b('gesims_vorsprung')
    cornice(m, half, z1, gh / 2, go, marble)
    z2 = z1 + gh / 2
    z3 = z2 + b('glockenstube_hoehe')
    arches, pier, thick = int(data['masse']['glockenstube_boegen_pro_seite']['wert']), b('glockenstube_pfeiler_breite'), b('glockenstube_mauerstaerke')
    m.box(-half + thick - 0.02, -half + thick - 0.02, z2, half - thick + 0.02, half - thick + 0.02, z3, shade(dark, 0.5), top=shade(dark, 0.5))
    for s in SIDES:
        m.arcade(s, -half, -half, half, half, z2, z3, arches, pier, thick, b('glockenstube_bogen_abstand_oben'), marble, sill=b('glockenstube_bruestung'))

    # the dado above it, brick with a white relief on each face, under the white band that carries the spire
    cornice(m, half, z3, gh / 2, go, marble)
    z4 = z3 + gh / 2 + b('dado_hoehe')
    m.box(-half, -half, z3 + gh / 2, half, half, z4, dado, foot=0.92)
    dh = b('dado_hoehe')
    for s in SIDES:
        m.pane(s, -half, -half, half, half, z3 + gh / 2 + dh * 0.25, z4 - dh * 0.25, half - dh * 0.25, half + dh * 0.25, marble, 0.05)
    cornice(m, half, z4, gh, go, marble)

    # the wooden spire in its copper plates, and the crowning figure on its white pedestal
    z5 = z4 + gh
    sh = b('spitze_hoehe')
    m.pyramid(0, 0, z5, half + go, sh, copper)
    fh, fwid = b('bekroenung_hoehe'), b('bekroenung_breite')
    m.box(-0.14, -0.14, z5 + sh - 0.05, 0.14, 0.14, z5 + sh + fh * 0.25, marble)
    m.box(-0.12, -0.12, z5 + sh + fh * 0.25, 0.12, 0.12, z5 + sh + fh, gold)
    m.box(-fwid / 2, -0.07, z5 + sh + fh * 0.45, fwid / 2, 0.07, z5 + sh + fh * 0.8, gold)
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
