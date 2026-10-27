# Licenses and credits for `docs/design/style/`

> Last review: 2026-10-26.

## Our own work

All mockups, sketches and sources in this folder were made for this project:

- `concept-a-olive-inlay.png`, `concept-a-olive-inlay@3x.webp`
- `concept-b-walnut-kafeneio.png`, `concept-b-walnut-kafeneio@3x.webp`
- `orientation.png`
- `olive-inlay-theme.webp` (a render of the `olive-inlay` theme; same sources as that theme, see `packages/themes/LICENSES.md`)
- `kafeneio-night-theme.webp` (a render of the `kafeneio-night` theme, issue #144; same sources as that theme, see `packages/themes/LICENSES.md`)
- everything in `src/` (scripts and generated SVGs)

The board, checkers, dice, inlay patterns (dog-tooth, meander), hinges and UI are drawn in code. No art from other apps or makers is used.

## Wood textures (CC0)

Every file in `textures/` is a graded, resized copy of a CC0 texture from [Poly Haven](https://polyhaven.com). License: [CC0 1.0](https://polyhaven.com/license). No credit is required. We list them anyway, as `art-pipeline.md` §4.7 asks.

The grade (target color and contrast) is in `src/prepare_textures.py`. Source files are the 2K diffuse JPGs.

| File in `textures/` | Poly Haven asset | Author(s) |
|---------------------|------------------|-----------|
| `a-field-olive.jpg` | [Smoked Walnut Veneer](https://polyhaven.com/a/smoked_walnut_veneer) | Jenelle van Heerden |
| `a-frame-olive-streak.jpg` | [Smoked Walnut Veneer](https://polyhaven.com/a/smoked_walnut_veneer) | Jenelle van Heerden |
| `a-point-wenge.jpg` | [Flamed Black Veneer](https://polyhaven.com/a/flamed_black_veneer) | Jenelle van Heerden |
| `a-point-mahogany.jpg` | [Sapele Veneer](https://polyhaven.com/a/sapele_veneer) | Jenelle van Heerden |
| `a-checker-maple.jpg` | [White Maple Veneer](https://polyhaven.com/a/white_maple_veneer) | Jenelle van Heerden |
| `a-checker-walnut.jpg` | [European Walnut Veneer 04](https://polyhaven.com/a/european_walnut_veneer_04) | Jenelle van Heerden |
| `b-field-walnut.jpg` | [Walnut Veneer 02](https://polyhaven.com/a/walnut_veneer_02) | Jenelle van Heerden |
| `b-frame-worn-walnut.jpg` | [Wood Table Worn](https://polyhaven.com/a/wood_table_worn) | Dimitrios Savva, Rico Cilliers |
| `b-point-ebony.jpg` | [Flamed Black Veneer](https://polyhaven.com/a/flamed_black_veneer) | Jenelle van Heerden |
| `b-point-bone.jpg` | [White Maple Veneer](https://polyhaven.com/a/white_maple_veneer) | Jenelle van Heerden |

## Fonts used in the renders

Fonts are **not** committed. The renders use fonts installed on the build machine:

- **Inter** (UI text, Greek included) — SIL Open Font License 1.1.
- **Liberation Serif** (match score) — SIL Open Font License 1.1.

If the app ships a font, add its license file next to it.

## References

The photos and pages in `mood-board.md` are **links only**. We did not download them into the repo, and we do not embed them. Their own licenses apply.
