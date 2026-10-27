# Licenses and sources for `@tavli/themes`

> Last review: 2026-10-27. Every file that ships in a theme folder is listed here.

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

The Olive Inlay sources in `tools/olive-inlay/textures/` are copies of the Concept A textures of issue #13 (`docs/design/style/textures/a-*.jpg`, graded by `docs/design/style/src/prepare_textures.py`).

| Graded source in `tools/olive-inlay/textures/` | Poly Haven asset                                                     | Author(s)           | License |
| ---------------------------------------------- | -------------------------------------------------------------------- | ------------------- | ------- |
| `field-olive.jpg`                              | [Smoked Walnut Veneer](https://polyhaven.com/a/smoked_walnut_veneer) | Jenelle van Heerden | CC0 1.0 |
| `frame-olive-streak.jpg`                       | [Smoked Walnut Veneer](https://polyhaven.com/a/smoked_walnut_veneer) | Jenelle van Heerden | CC0 1.0 |
| `point-wenge.jpg`                              | [Flamed Black Veneer](https://polyhaven.com/a/flamed_black_veneer)   | Jenelle van Heerden | CC0 1.0 |
| `point-mahogany.jpg`                           | [Sapele Veneer](https://polyhaven.com/a/sapele_veneer)               | Jenelle van Heerden | CC0 1.0 |

The Kafeneio Night sources in `tools/kafeneio-night/textures/` were downloaded from Poly Haven (2K diffuse JPGs) and graded by `tools/kafeneio-night/prepare_textures.py` for issue #144.

| Graded source in `tools/kafeneio-night/textures/` | Poly Haven asset                                                         | Author(s)                                     | License |
| ------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------- | ------- |
| `field-mahogany.jpg`                              | [Dark Wood](https://polyhaven.com/a/dark_wood)                           | Dario Barresi, Dimitrios Savva, Rico Cilliers | CC0 1.0 |
| `frame-black-walnut.jpg`                          | [Black Walnut Veneer 02](https://polyhaven.com/a/black_walnut_veneer_02) | Jenelle van Heerden                           | CC0 1.0 |
| `point-rosewood.jpg`                              | [Rosewood Veneer 02](https://polyhaven.com/a/rosewood_veneer_02)         | Jenelle van Heerden                           | CC0 1.0 |
| `point-ash.jpg`                                   | [Ash Veneer](https://polyhaven.com/a/ash_veneer)                         | Jenelle van Heerden                           | CC0 1.0 |

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

## Theme `olive-inlay`

Each image ships as `name.webp` (@1x), `name@2x.webp` and `name@3x.webp`. All are made by `pnpm --filter @tavli/themes build:assets -- olive-inlay`.

| Files in `olive-inlay/`                         | What                                                                                    | Made from                                                           | License                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------- |
| `theme.json`                                    | Manifest                                                                                | Our own work                                                        | Project                   |
| `board-portrait*.webp`, `board-landscape*.webp` | Frame, bar, trays, empty field; dog-tooth banding and meander bands                     | Our own drawing, filled with `field-olive` and `frame-olive-streak` | Project; textures CC0 1.0 |
| `shade-portrait*.webp`, `shade-landscape*.webp` | Inlaid point cores with maple stringing, and the frame's inner shadow (over the points) | Our own drawing, filled with `point-wenge` and `point-mahogany`     | Project; textures CC0 1.0 |
| `point-wenge*.webp`                             | Tile for the dark points                                                                | `point-wenge.jpg`, resized                                          | CC0 1.0                   |
| `point-mahogany*.webp`                          | Tile for the light points                                                               | `point-mahogany.jpg`, resized                                       | CC0 1.0                   |
| `sounds/*.m4a`                                  | The game sounds                                                                         | Copies of the Walnut Kafeneio sounds (see [Sounds](#sounds))        | CC0 1.0                   |

The meander (Greek key) and the dog-tooth banding are traditional patterns, drawn in code. No maker's design is copied.

## Theme `kafeneio-night`

Each image ships as `name.webp` (@1x), `name@2x.webp` and `name@3x.webp`. All are made by `pnpm --filter @tavli/themes build:assets -- kafeneio-night`.

| Files in `kafeneio-night/`                      | What                                                                                     | Made from                                                              | License                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------- |
| `theme.json`                                    | Manifest                                                                                 | Our own work                                                           | Project                   |
| `board-portrait*.webp`, `board-landscape*.webp` | Frame, bar, trays, empty field; brass corner plates, nails, hinges, clasps and stringing | Our own drawing, filled with `field-mahogany` and `frame-black-walnut` | Project; textures CC0 1.0 |
| `shade-portrait*.webp`, `shade-landscape*.webp` | Dark field edges and the frame's inner shadow, drawn over the points                     | Our own drawing (no third-party pixels)                                | Project                   |
| `point-rosewood*.webp`                          | Tile for the dark points                                                                 | `point-rosewood.jpg`, resized                                          | CC0 1.0                   |
| `point-ash*.webp`                               | Tile for the light points                                                                | `point-ash.jpg`, resized                                               | CC0 1.0                   |
| `sounds/*.m4a`                                  | The game sounds                                                                          | Copies of the Walnut Kafeneio sounds (see [Sounds](#sounds))           | CC0 1.0                   |

The brass work is drawn in code. No maker's design is copied.

## Previews

`preview/*.png` are renders of the themes made by `tools/preview.mjs`. They are not shipped in the app. Same sources and licenses as the theme.

## Used outside this package: app icon and splash

`apps/mobile/assets/icon/tools/build-icons.mjs` reads the four graded textures above and the Walnut Kafeneio palette. It makes the app icon, the Android adaptive icon layers, the splash images (`apps/mobile/assets/icon/*.png`) and the concept previews (`apps/mobile/assets/icon-concepts/*.png`). The shapes (checkers, points, die, Τ, brass ring) are our own drawing. License: project art; textures CC0 1.0, same sources as the table above. No font is used: the Τ is drawn as a path.

## Fonts

No font is shipped. The preview draws the count badge with the machine's default sans-serif font.

## Sounds

All third-party sounds are **CC0 1.0** ([deed](https://creativecommons.org/publicdomain/zero/1.0/)). CC0 needs no credit. We list them anyway. Each license was checked on the source page and, for Kenney, in the `License.txt` inside the zip.

`tools/walnut-kafeneio/build_sounds.py` downloads the sources (it checks a SHA-256 for each), then cuts, mixes, normalizes and encodes them. The raw sources are not in the repo.

### Sources

| Source                                                                                                     | Author                      | License | Files used                                                                          |
| ---------------------------------------------------------------------------------------------------------- | --------------------------- | ------- | ----------------------------------------------------------------------------------- |
| [Boardgame piece wobbles](https://opengameart.org/content/boardgame-piece-wobbles) (OpenGameArt)           | Aidan_Walker                | CC0 1.0 | `wobble02.ogg`–`wobble05.ogg`: a wooden game piece on a wooden table                |
| [Wooden dice on wooden table roll](https://opengameart.org/content/wooden-dice-on-wodden-table-roll) (OGA) | Wuzzy                       | CC0 1.0 | `Holzwürfel_auf_Holztisch_1.flac`, `_3.flac`, `_4.flac`                             |
| [Impact Sounds](https://kenney.nl/assets/impact-sounds) 1.0                                                | Kenney Vleugels (kenney.nl) | CC0 1.0 | `impactWood_light_000.ogg`, `impactWood_light_002.ogg`, `impactWood_medium_000.ogg` |
| [Casino Audio](https://kenney.nl/assets/casino-audio) 1.1                                                  | Kenney Vleugels (kenney.nl) | CC0 1.0 | `dice-grab-1.ogg`                                                                   |
| [Music Jingles](https://kenney.nl/assets/music-jingles)                                                    | Kenney Vleugels (kenney.nl) | CC0 1.0 | `jingles_PIZZI10.ogg`, `jingles_STEEL10.ogg`                                        |

### Files in `walnut-kafeneio/sounds/` (and the same files in `olive-inlay/sounds/` and `kafeneio-night/sounds/`)

Mono AAC (`.m4a`), 44.1 kHz, 64 kbit/s. About 54 KB in total (the limit is 500 KB, checked by `themes.test.ts`).

| File                     | Event          | Made from                                                                              | License |
| ------------------------ | -------------- | -------------------------------------------------------------------------------------- | ------- |
| `checker-place-1..3.m4a` | `checkerPlace` | One tap each from `wobble04`, `wobble03`, `wobble05`, with a little `impactWood_light` | CC0 1.0 |
| `checker-hit.m4a`        | `checkerHit`   | Taps from `wobble02`, `wobble05`, `wobble04` plus `impactWood_medium_000`              | CC0 1.0 |
| `bear-off.m4a`           | `bearOff`      | `impactWood_light_000` slowed down, plus taps from `wobble03`, `wobble04`              | CC0 1.0 |
| `dice-roll-1.m4a`, `-2`  | `diceRoll`     | Wuzzy dice takes 1, 3 and 4, mixed as two dice, hiss removed                           | CC0 1.0 |
| `dice-land.m4a`          | `diceLand`     | The last small hits of Wuzzy dice takes 3 and 4                                        | CC0 1.0 |
| `invalid-move.m4a`       | `invalidMove`  | A tap from `wobble04`, slowed, muffled and played twice                                | CC0 1.0 |
| `turn-start.m4a`         | `turnStart`    | Part of `dice-grab-1`, very quiet                                                      | CC0 1.0 |
| `game-win.m4a`           | `gameWin`      | `jingles_PIZZI10` with a little `jingles_STEEL10`                                      | CC0 1.0 |
| `match-win.m4a`          | `matchWin`     | The same, then both again a fifth higher                                               | CC0 1.0 |
