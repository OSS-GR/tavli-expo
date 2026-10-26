"""Check checker colors for contrast and color-blind safety.

  python3 -I docs/design/style/src/contrast.py

For each concept it reports:
  - WCAG 2.x contrast ratio and CIELAB lightness L* of the design tokens,
  - the same numbers measured from the rendered PNG (average of small
    patches, so grain, grooves and light are included),
  - L* of the two checkers under simulated protanopia, deuteranopia and
    tritanopia (Machado et al. 2009, severity 1.0, applied in linear RGB).
"""

import os

HERE = os.path.dirname(os.path.abspath(__file__))

TOKENS = {
    "A": {
        "png": "concept-a-olive-inlay.png",
        "checker.light": "#EADDC2",
        "checker.light.edge": "#6B5232",
        "checker.dark": "#4A2E1E",
        "checker.dark.ring": "#B89A78",
        "point.wenge": "#3B2A20",
        "point.mahogany": "#7E3521",
        "field.olive": "#D4BB8D",
        "frame.olive": "#8E6A40",
    },
    "B": {
        "png": "concept-b-walnut-kafeneio.png",
        "checker.light": "#ECE2CB",
        "checker.light.edge": "#6E5A3C",
        "checker.dark": "#1E1A17",
        "checker.dark.ring": "#8C8279",
        "point.ebony": "#2B1F19",
        "point.bone": "#CFB98E",
        "field.walnut": "#8A6038",
        "frame.walnut": "#3C2617",
    },
}

# Patches in screen points (393 x 852 layout from build.js), size in pt.
PW = (630 - 26 - 34 - 9 - 46) / 12
TOP0 = 116 + 13
BOT0 = TOP0 + 6 * PW + 34
PATCHES = {
    "field": (196.5, TOP0 + 1.5 * PW, 8),  # gap between point tips, top half
    "pointOdd": (350, TOP0 + 2.5 * PW, 7),  # point 15, near its base
    "pointEven": (350, TOP0 + 3.5 * PW, 7),  # point 16, near its base
    "checkerLight": (21 + 1.2 + 20, BOT0 + 0.5 * PW, 9),  # point 6
    "checkerDark": (21 + 1.2 + 20, BOT0 + 5.5 * PW, 9),  # point 1
}

MACHADO = {
    "protanopia": [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    "deuteranopia": [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    "tritanopia": [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum_lin(rl):
    return 0.2126 * rl[0] + 0.7152 * rl[1] + 0.0722 * rl[2]


def lum(rgb):
    return lum_lin([lin(c) for c in rgb])


def lstar(y):
    return 116 * (y ** (1 / 3)) - 16 if y > 216 / 24389 else y * 24389 / 27


def ratio(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


def sim(rgb, m):
    rl = [lin(c) for c in rgb]
    out = [max(0.0, min(1.0, sum(m[i][j] * rl[j] for j in range(3)))) for i in range(3)]
    return lstar(lum_lin(out))


def measure(png):
    from PIL import Image

    im = Image.open(os.path.join(HERE, "..", png)).convert("RGB")
    k = im.size[0] / 393
    res = {}
    for name, (x, y, s) in PATCHES.items():
        box = tuple(int(v * k) for v in (x - s / 2, y - s / 2, x + s / 2, y + s / 2))
        px = list(im.crop(box).convert("RGB").get_flattened_data()) if hasattr(im, "get_flattened_data") else list(im.crop(box).getdata())
        res[name] = tuple(sum(p[i] for p in px) / len(px) / 255 for i in range(3))
    return res


def hx(rgb):
    return "#%02X%02X%02X" % tuple(round(c * 255) for c in rgb)


def main():
    for cid, t in TOKENS.items():
        print(f"\n## Concept {cid}\n")
        names = [n for n in t if n != "png"]
        print("Token L* values:")
        for n in names:
            print(f"  {n:20s} {t[n]}  L*={lstar(lum(hex_rgb(t[n]))):5.1f}")
        light, dark = hex_rgb(t["checker.light"]), hex_rgb(t["checker.dark"])
        print("\nToken contrast ratios:")
        print(f"  checker.light vs checker.dark: {ratio(light, dark):.2f}:1")
        for n in names:
            if n.startswith("checker"):
                continue
            c = hex_rgb(t[n])
            edge, ring = hex_rgb(t["checker.light.edge"]), hex_rgb(t["checker.dark.ring"])
            print(f"  vs {n:16s} light {ratio(light, c):5.2f}  dark {ratio(dark, c):5.2f}"
                  f"  light.edge {ratio(edge, c):5.2f}  dark.ring {ratio(ring, c):5.2f}")
        m = measure(t["png"])
        print("\nMeasured in render (patch averages):")
        for n, c in m.items():
            print(f"  {n:13s} {hx(c)}  L*={lstar(lum(c)):5.1f}")
        print(f"  checkerLight vs checkerDark: {ratio(m['checkerLight'], m['checkerDark']):.2f}:1")
        for n in ("field", "pointOdd", "pointEven"):
            print(f"  checkerLight vs {n:9s} {ratio(m['checkerLight'], m[n]):5.2f}:1   checkerDark vs {n:9s} {ratio(m['checkerDark'], m[n]):5.2f}:1")
        print("\nColor-blind simulation (L* light / dark, difference):")
        for k, mat in MACHADO.items():
            a, b = sim(light, mat), sim(dark, mat)
            print(f"  {k:13s} {a:5.1f} / {b:5.1f}   dL*={a - b:5.1f}")


if __name__ == "__main__":
    main()
