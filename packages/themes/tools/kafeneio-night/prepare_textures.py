"""Download and grade the CC0 wood textures for the Kafeneio Night theme.

The graded JPGs are already in ./textures/. Run this only to change the grade.

Usage (from the repo root):
  1. Download the 2K diffuse JPGs from Poly Haven into a cache folder:
       python3 packages/themes/tools/kafeneio-night/prepare_textures.py --download /tmp/tex-cache
  2. Grade, resize and write them into ./textures/:
       python3 -I packages/themes/tools/kafeneio-night/prepare_textures.py /tmp/tex-cache
  3. Build the theme images again:
       pnpm --filter @tavli/themes build:assets -- kafeneio-night

Needs Python 3 with numpy and Pillow. All sources are CC0
(https://polyhaven.com/license). See packages/themes/LICENSES.md.

The grade is the one of tools/walnut-kafeneio/prepare_textures.py: each
output texture gets a target mean color (a palette token in theme.json).
Every pixel is mapped per channel with
  out = target * (pixel / mean) ** contrast
so the average color equals the token, and the grain keeps its own detail.
"""

import os
import sys
import urllib.request

SRC_URL = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/{id}/{id}_diff_2k.jpg"

# out name: (Poly Haven id, target mean hex, contrast, size px, jpeg quality)
TEXTURES = {
    "field-mahogany": ("dark_wood", "#4C2015", 1.2, 1024, 80),  # board.field
    "frame-black-walnut": ("black_walnut_veneer_02", "#2A160E", 1.9, 1024, 78),  # board.frame
    "point-rosewood": ("rosewood_veneer_02", "#341917", 2.3, 512, 82),  # board.point.dark
    "point-ash": ("ash_veneer", "#D9CDB2", 2.6, 512, 82),  # board.point.light
}


def hex_rgb(h):
    h = h.lstrip("#")
    return [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]


def download(cache):
    os.makedirs(cache, exist_ok=True)
    for pid in sorted({v[0] for v in TEXTURES.values()}):
        dst = os.path.join(cache, pid + ".jpg")
        if not os.path.exists(dst):
            print("download", pid)
            # Poly Haven refuses the default Python user agent.
            req = urllib.request.Request(
                SRC_URL.format(id=pid), headers={"User-Agent": "tavlaki-art-pipeline/1.0"}
            )
            with urllib.request.urlopen(req) as r, open(dst, "wb") as f:
                f.write(r.read())


def build(cache):
    import numpy as np
    from PIL import Image

    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "textures")
    os.makedirs(out_dir, exist_ok=True)
    for name, (pid, target, contrast, size, quality) in TEXTURES.items():
        im = Image.open(os.path.join(cache, pid + ".jpg")).convert("RGB")
        im = im.resize((size, size), Image.LANCZOS)
        a = np.asarray(im).astype(np.float64) / 255.0
        mean = a.reshape(-1, 3).mean(0)
        t = np.array(hex_rgb(target))
        g = t * np.power(np.clip(a / mean, 1e-4, None), contrast)
        # Re-center: the power curve shifts the mean a little.
        g = g * (t / g.reshape(-1, 3).mean(0))
        g = np.clip(g, 0, 1)
        out = Image.fromarray((g * 255 + 0.5).astype(np.uint8))
        path = os.path.join(out_dir, name + ".jpg")
        out.save(path, quality=quality, optimize=True, progressive=True)
        print(f"{name:20s} {pid:24s} -> {os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--download":
        download(sys.argv[2])
    elif len(sys.argv) == 2:
        build(sys.argv[1])
    else:
        print(__doc__)
        sys.exit(1)
