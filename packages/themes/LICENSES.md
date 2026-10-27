# Licenses and sources for `@tavli/themes`

> Last review: 2026-10-26. Every file that ships in a theme folder is listed here.

## Our own work

The code in `src/` and `tools/`, the board art and the previews were made for the Tavlaki project. No art from other apps or makers is used. The board shapes, hinges, wear, shadows, checkers and dice are drawn in code.

## Third-party sources

All third-party pixels are **CC0 1.0** wood textures from [Poly Haven](https://polyhaven.com) ([license](https://polyhaven.com/license)). CC0 needs no credit. We list them anyway, as `docs/design/art-pipeline.md` §4.7 asks.

The source files are the 2K diffuse JPGs. `tools/walnut-kafeneio/prepare_textures.py` grades them (mean color = palette token) and resizes them. The graded copies came from the Concept B textures of issue #13 (`docs/design/style/textures/b-*.jpg`).

| Graded source in `tools/walnut-kafeneio/textures/` | Poly Haven asset                                                   | Author(s)                      | License |
| -------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------ | ------- |
| `field-walnut.jpg`                                 | [Walnut Veneer 02](https://polyhaven.com/a/walnut_veneer_02)       | Jenelle van Heerden            | CC0 1.0 |
| `frame-worn-walnut.jpg`                            | [Wood Table Worn](https://polyhaven.com/a/wood_table_worn)         | Dimitrios Savva, Rico Cilliers | CC0 1.0 |
| `point-ebony.jpg`                                  | [Flamed Black Veneer](https://polyhaven.com/a/flamed_black_veneer) | Jenelle van Heerden            | CC0 1.0 |
| `point-bone.jpg`                                   | [White Maple Veneer](https://polyhaven.com/a/white_maple_veneer)   | Jenelle van Heerden            | CC0 1.0 |

## Theme `walnut-kafeneio`

Each image ships as `name.webp` (@1x), `name@2x.webp` and `name@3x.webp`. All are made by `pnpm --filter @tavli/themes build:assets`.

| Files in `walnut-kafeneio/`                     | What                                                           | Made from                                                           | License                   |
| ----------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------- |
| `theme.json`                                    | Manifest                                                       | Our own work                                                        | Project                   |
| `board-portrait*.webp`                          | Board turned 90°: frame, bar, hinges, trays, empty field       | Our own drawing, filled with `field-walnut` and `frame-worn-walnut` | Project; textures CC0 1.0 |
| `board-landscape*.webp`                         | Classic landscape board, same parts                            | Same as above                                                       | Project; textures CC0 1.0 |
| `shade-portrait*.webp`, `shade-landscape*.webp` | Wear, scratches, grime and frame shadow, drawn over the points | Our own drawing (no third-party pixels)                             | Project                   |
| `point-ebony*.webp`                             | Tile for the dark points                                       | `point-ebony.jpg`, resized                                          | CC0 1.0                   |
| `point-bone*.webp`                              | Tile for the light points                                      | `point-bone.jpg`, resized                                           | CC0 1.0                   |

## Previews

`preview/*.png` are renders of the theme made by `tools/preview.mjs`. They are not shipped in the app. Same sources and licenses as the theme.

## Used outside this package: app icon and splash

`apps/mobile/assets/icon/tools/build-icons.mjs` reads the four graded textures above and the Walnut Kafeneio palette. It makes the app icon, the Android adaptive icon layers, the splash images (`apps/mobile/assets/icon/*.png`) and the concept previews (`apps/mobile/assets/icon-concepts/*.png`). The shapes (checkers, points, die, Τ, brass ring) are our own drawing. License: project art; textures CC0 1.0, same sources as the table above. No font is used: the Τ is drawn as a path.

## Fonts

No font is shipped. The preview draws the count badge with the machine's default sans-serif font.

## Sounds

None yet. Sound keys in `theme.json` are names only; files come in #39 and #40. Add every sound file to this list when it arrives.
