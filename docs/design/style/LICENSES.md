# Licenses and credits for `docs/design/style/`

> Last review: 2026-11-01.

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

## App icons (ISC)

The line icons in the app (`apps/mobile/src/components/icons.ts`, #342) are path data copied from [Lucide](https://lucide.dev) v0.460.0: settings, bot, users, globe, book-open, history, play, graduation-cap, chevron-right, chevron-left and check; for the Settings rows (#360) check-check, lightbulb, fast-forward, flip-vertical-2, gauge, volume-2, vibrate, languages, image, smartphone, house, palette, list, trash-2, bell, chart-column and shield; for Play a friend (#358) link; for the match end (#361) trophy; for Join with a code (#333) keyboard; for block and report (#435) flag and user-x; for Settings → Account (#402) user, log-out and key-round; for error popups (#462) circle-alert; for What's new (#471) sparkles; for Friends on Home (#486) handshake; for the game dock and the turn clock (#499) clock, undo-2 and dices; for Leaderboards (#502) lock, circle-help and swords; for Friends and Add a friend (#503) user-plus, send, ellipsis, info, search, share, message-circle, rotate-ccw, chevron-down and clipboard. License: [ISC](https://github.com/lucide-icons/lucide/blob/main/LICENSE). Circles and rectangles are rewritten as paths; the play triangle is redrawn. No package is installed.

> ISC License. Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022. Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies. THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

## App font (SIL OFL 1.1)

The app embeds **Piazzolla** SemiBold and Bold (#493) for titles and numbers: `apps/mobile/assets/fonts/Piazzolla-SemiBold.ttf` and `Piazzolla-Bold.ttf`, with the license next to them in `OFL.txt`. Source: the `@expo-google-fonts/piazzolla` 0.4.2 package, which copies the Google Fonts release. License: [SIL Open Font License 1.1](https://openfontlicense.org). Copyright 2018 The Piazzolla Project Authors (https://github.com/huertatipografica/piazzolla). The files are unchanged, so the Reserved Font Name rules do not apply. Every other text in the app uses the phone's system font.
