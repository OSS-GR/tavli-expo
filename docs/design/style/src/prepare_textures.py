"""Prepare the CC0 wood textures used by the two board concepts.

Usage:
  1. Download the 2K diffuse JPGs from Poly Haven into a cache folder:
       python3 prepare_textures.py --download /path/to/cache
  2. Grade, resize and write them into ../textures/:
       python3 -I prepare_textures.py /path/to/cache

All sources are CC0 (https://polyhaven.com/license). See ../LICENSES.md.

How the grade works: each output texture gets a target mean color (a design
token in ../palette.md). Every pixel is mapped per channel with
  out = target * (pixel / mean) ** contrast
so the average color equals the token, and the grain keeps its own detail.
Skia can do the same at runtime with an image shader plus a color filter.
"""

import os
import sys
import urllib.request

SRC_URL = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/{id}/{id}_diff_2k.jpg"

# out name: (Poly Haven id, target mean hex, contrast, size px, jpeg quality)
TEXTURES = {
    # Concept A: light olive wood with geometric inlay
    "a-field-olive": ("smoked_walnut_veneer", "#D4BB8D", 1.1, 1024, 80),
    "a-frame-olive-streak": ("smoked_walnut_veneer", "#8E6A40", 1.9, 1024, 80),
    "a-point-wenge": ("flamed_black_veneer", "#3B2A20", 2.6, 512, 82),
    "a-point-mahogany": ("sapele_veneer", "#7E3521", 1.8, 512, 82),
    "a-checker-maple": ("white_maple_veneer", "#EADDC2", 2.2, 256, 85),
    "a-checker-walnut": ("european_walnut_veneer_04", "#4A2E1E", 3.2, 256, 85),
    # Concept B: dark walnut kafeneio board
    "b-field-walnut": ("walnut_veneer_02", "#8A6038", 1.5, 1024, 80),
    "b-frame-worn-walnut": ("wood_table_worn", "#3C2617", 1.25, 1024, 80),
    "b-point-ebony": ("flamed_black_veneer", "#2B1F19", 2.6, 512, 82),
    "b-point-bone": ("white_maple_veneer", "#CFB98E", 2.4, 512, 82),
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
            req = urllib.request.Request(SRC_URL.format(id=pid), headers={"User-Agent": "tavlaki-art-pipeline/1.0"})
            with urllib.request.urlopen(req) as r, open(dst, "wb") as f:
                f.write(r.read())


def build(cache):
    import numpy as np
    from PIL import Image

    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "textures")
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
        print(f"{name:24s} {pid:28s} -> {os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--download":
        download(sys.argv[2])
    elif len(sys.argv) == 2:
        build(sys.argv[1])
    else:
        print(__doc__)
        sys.exit(1)
