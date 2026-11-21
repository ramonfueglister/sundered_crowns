"""Colour for the atlas probe (probe.py): sRGB 0 … 255 taken to linear light, mixed there, and back; and the realms'
colours held in a band of lightness and chroma in OKLCH (Björn Ottosson, "A perceptual color space for image
processing", 2020, whose matrices these are).
"""

import numpy as np


def lin(c):
    return np.where(
        np.asarray(c, np.float32) / 255 <= 0.04045,
        np.asarray(c, np.float32) / 255 / 12.92,
        ((np.asarray(c, np.float32) / 255 + 0.055) / 1.055) ** 2.4,
    )


def srgb(v):
    return np.where(v <= 0.0031308, v * 12.92, 1.055 * np.clip(v, 0, None) ** (1 / 2.4) - 0.055)


def mix(a, b, t):
    return a + (b - a) * (t[..., None] if isinstance(t, np.ndarray) else t)


def oklch_band(hexes, l_low, l_high, c_most):
    c = lin(np.array([[int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)] for h in hexes], np.float32))
    l = 0.4122214708 * c[:, 0] + 0.5363325363 * c[:, 1] + 0.0514459929 * c[:, 2]
    m = 0.2119034982 * c[:, 0] + 0.6806995451 * c[:, 1] + 0.1073969566 * c[:, 2]
    s = 0.0883024619 * c[:, 0] + 0.2817188376 * c[:, 1] + 0.6299787005 * c[:, 2]
    l, m, s = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
    A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
    B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    C = np.hypot(A, B)
    hue = np.arctan2(B, A)
    L = l_low + (l_high - l_low) * np.clip((L - 0.25) / 0.6, 0, 1)
    C = np.minimum(C, c_most)
    return L, C, hue


def from_oklch(L, C, hue):
    A, B = C * np.cos(hue), C * np.sin(hue)
    l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
    m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
    s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
    return np.clip(
        np.stack(
            [
                4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
            ],
            -1,
        ),
        0,
        1,
    )
