"""The Campanile di San Marco as it stood in 1356, built from the measures in campanile_san_marco_1356.json.

    python3 tools/blender/landmarks/campanile_san_marco.py [--out public/models/landmarks] [--preview out.png]

Every length comes from the measure file (value, unit, source or assumption); this script only arranges them. Blocks
are the game's unit; Z is up until the glTF export turns the model to Y up. Prints triangles and height at the end.
"""
from __future__ import annotations

import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from lib.diorama import Model, clear_scene, export_glb, load_measures, m2b, render_preview, rgb, shade  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
SIDES = ('+x', '-x', '+y', '-y')


def cornice(m: Model, half: float, z: float, h: float, out: float, colour, shadow=None):
    """A stepped cornice around the square of half side ``half``: a narrow lower step, a wider upper one, and a
    thin shadow line on the wall below it when ``shadow`` is given."""
    m.box(-half - out / 2, -half - out / 2, z, half + out / 2, half + out / 2, z + h / 2, colour)
    m.box(-half - out, -half - out, z + h / 2, half + out, half + out, z + h, colour)
    if shadow is not None:
        for s in SIDES:
            m.pane(s, -half, -half, half, half, z - 0.07, z, 0, 2 * half, shadow, 0.03)


def speckle(k: int, amount: float) -> float:
    """A deterministic shade factor in 1 ± amount for field k (a hash, so every build gives the same model)."""
    x = math.sin(k * 12.9898 + 78.233) * 43758.5453
    return 1 + amount * (2 * (x - math.floor(x)) - 1)


def spire_ribs(m: Model, z0: float, half: float, height: float, w: float, colour):
    """Pale ribs along the four edges of the pyramid: a slim strip on each face beside the edge, lifted a touch off
    the face so that it does not flicker into it. They stop just short of the apex."""
    apex = (0.0, 0.0, z0 + height)
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        corner = (sx * half, sy * half, z0)
        for along in ((0, -sy * w, 0), (-sx * w, 0, 0)):
            p1 = (corner[0] + along[0], corner[1] + along[1], z0)
            mix = lambda a, t: (a[0] + (apex[0] - a[0]) * t, a[1] + (apex[1] - a[1]) * t, a[2] + (apex[2] - a[2]) * t)  # noqa: E731
            quad = [corner, p1, mix(p1, 0.96), mix(corner, 0.96)]
            # the face's normal: the one of the two faces that this strip lies in
            face_out = (sx, 0, 0) if along[1] != 0 else (0, sy, 0)
            n = (face_out[0] * height, face_out[1] * height, half)
            k = 0.03 / math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2)
            m._add_faces([(x + n[0] * k, y + n[1] * k, z + n[2] * k) for x, y, z in quad], [(0, 1, 2, 3)], colour, ('along', n))


def plated_spire(m: Model, z0: float, half: float, height: float, rows: int, colour):
    """A pyramid of ``rows`` stacked frusta, every other row a touch darker: the plate rows of a copper roof."""
    for k in range(rows):
        z, zt = z0 + height * k / rows, z0 + height * (k + 1) / rows
        h0, h1 = half * (1 - k / rows), half * (1 - (k + 1) / rows)
        c = shade(colour, (1.0 if k % 2 == 0 else 0.82) * (1 + 0.12 * k / rows))
        if k == rows - 1:
            m.pyramid(0, 0, z, h0, zt - z, c)
        else:
            m.pyramid(0, 0, z, h0, zt - z, c, top_half=h1)


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
    fleck, field = data['masse']['backstein_flecken']['wert'], 1.5
    rows = max(1, round((z1 - z0) / field))
    for si, s in enumerate(SIDES):
        for k in range(n + 1):
            u0 = k * (strip + fw)
            a, c = Model._on(s, -half, -half, half, half, u0, z0, 0), Model._on(s, -half, -half, half, half, u0 + strip, z0, -depth)
            x0, x1, y0, y1 = min(a[0], c[0]), max(a[0], c[0]), min(a[1], c[1]), max(a[1], c[1])
            # the strip in fields of about a block and a half, each its own shade of brick
            for r in range(rows):
                za, zb = z0 + (z1 - z0) * r / rows, z0 + (z1 - z0) * (r + 1) / rows
                m.box(x0, y0, za, x1, y1, zb, shade(brick, speckle(si * 1000 + k * 100 + r, fleck)), foot=0.88 if r == 0 else 1.0)
        # the flute floors speckled too, as panes on the core
        for k in range(n):
            u0 = (k + 1) * strip + k * fw
            for r in range(rows):
                za, zb = z0 + (z1 - z0) * r / rows, z0 + (z1 - z0) * (r + 1) / rows
                m.pane(s, -half, -half, half, half, za, zb, u0, u0 + fw, shade(brick, speckle(si * 1000 + 500 + k * 100 + r, fleck)), -depth + 0.015)
    # the eight small windows of the stair ramp, one above the other in one flute of one side
    wins, wh, wside = int(data['masse']['schaft_fenster']['wert']), b('schaft_fenster_hoehe'), data['masse']['schaft_fenster_seite']['wert']
    uw = strip + fw / 2
    for k in range(wins):
        zc = z0 + (k + 1) * (z1 - z0) / (wins + 1)
        m.pane(wside, -half, -half, half, half, zc - wh / 2, zc + wh / 2, uw - fw * 0.3, uw + fw * 0.3, dark, -depth + 0.03)

    # the belfry: a white arcade on a cornice, open so that the dark bell chamber shows through the arches
    gh, go = b('gesims_hoehe'), b('gesims_vorsprung')
    cornice(m, half, z1, gh / 2, go, marble, shadow=shade(brick, 0.7))
    z2 = z1 + gh / 2
    z3 = z2 + b('glockenstube_hoehe')
    arches, pier, thick = int(data['masse']['glockenstube_boegen_pro_seite']['wert']), b('glockenstube_pfeiler_breite'), b('glockenstube_mauerstaerke')
    m.box(-half + thick - 0.02, -half + thick - 0.02, z2, half - thick + 0.02, half - thick + 0.02, z3, shade(dark, 0.5), top=shade(dark, 0.5))
    for s in SIDES:
        m.arcade(s, -half, -half, half, half, z2, z3, arches, pier, thick, b('glockenstube_bogen_abstand_oben'), marble, sill=b('glockenstube_bruestung'))

    # the dado above it, brick with a white relief on each face, under the white band that carries the spire
    cornice(m, half, z3, gh / 2, go, marble, shadow=shade(marble, 0.75))
    z4 = z3 + gh / 2 + b('dado_hoehe')
    m.box(-half, -half, z3 + gh / 2, half, half, z4, dado, foot=0.92)
    dh = b('dado_hoehe')
    for s in SIDES:
        m.pane(s, -half, -half, half, half, z3 + gh / 2 + dh * 0.25, z4 - dh * 0.25, half - dh * 0.25, half + dh * 0.25, marble, 0.05)
        # the figure of the relief: a mark of the dado's own red inside the white field
        m.pane(s, -half, -half, half, half, z3 + gh / 2 + dh * 0.38, z4 - dh * 0.38, half - dh * 0.12, half + dh * 0.12, shade(dado, 0.9), 0.07)
    cornice(m, half, z4, gh, go, marble, shadow=shade(dado, 0.7))

    # the wooden spire in its copper plates, and the crowning figure on its white pedestal
    z5 = z4 + gh
    sh = b('spitze_hoehe')
    plated_spire(m, z5, half + go, sh, int(data['masse']['spitze_plattenreihen']['wert']), copper)
    spire_ribs(m, z5, half + go, sh, b('spitze_grate_breite'), shade(marble, data['masse']['spitze_grate_helligkeit']['wert']))
    fh, fwid, mh = b('bekroenung_hoehe'), b('bekroenung_breite'), b('bekroenung_mast_hoehe')
    m.box(-0.1, -0.1, z5 + sh - 0.05, 0.1, 0.1, z5 + sh + mh, marble)
    m.box(-0.13, -0.13, z5 + sh + mh, 0.13, 0.13, z5 + sh + mh + fh, gold)
    m.box(-fwid / 2, -0.07, z5 + sh + mh + fh * 0.3, fwid / 2, 0.07, z5 + sh + mh + fh * 0.75, gold)
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
