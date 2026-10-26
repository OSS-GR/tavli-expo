# @tavli/themes

Board themes ("skins") for Tavlaki. A theme is **data**: a `theme.json` manifest plus WebP images. The board renderer reads only the manifest. It never hard-codes art, colors or positions (ADR-0005).

This package is pure TypeScript plus assets. It has no React, no network and no vendor code.

![Walnut Kafeneio, Portes start position, rendered from the manifest](preview/walnut-kafeneio.png)

## Folder layout

```
packages/themes/
  src/                     TypeScript: types, validation, registry, layout math
  walnut-kafeneio/         One folder per theme. Everything here ships in the app.
    theme.json             The manifest
    board-portrait.webp    Image layers, @1x, @2x and @3x
    ...
  tools/
    build-assets.mjs       Builds the images and the layout block of theme.json
    preview.mjs            Renders preview/*.png from the manifest
    lib/                   Geometry, Chromium and canvas helpers
    walnut-kafeneio/       Art source of one theme: design.mjs, textures/, prepare_textures.py
  preview/                 Preview renders (not shipped)
  LICENSES.md              Source and license of every asset
```

## Use a theme

```ts
import {
  getLayout,
  getTheme,
  imageFileName,
  pickScale,
  stackCenters,
  getPoint,
} from '@tavli/themes';

const theme = getTheme('walnut-kafeneio'); // validated, palette tokens resolved
const layout = getLayout(theme); // the default: 'portrait-rotated'
const stack = stackCenters(layout, getPoint(layout, 13), 5); // normalized checker centers
const board = theme.images['boardPortrait']!;
const file = imageFileName(board, pickScale(board, 3)); // 'board-portrait@3x.webp'
```

Multiply normalized values by the drawn board size: `x * boardWidth`, `y * boardHeight`. Lengths in "width units" (radius, spacing) are multiplied by `boardWidth`.

## The manifest

`src/types.ts` has the full type, with a comment on every field. `src/validate.ts` checks it at load time.

| Key                     | What                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `id`, `version`, `name` | Folder name, semver, name in `en` and `el`                                               |
| `description`, `kind`   | Short text in both languages; `image` (image layers + vector points) or `vector`         |
| `license`               | Short license notes and the file with the full list (`LICENSES.md`)                      |
| `palette`               | Color tokens (from `docs/design/style/palette.md`). Other fields use them as `{token}`.  |
| `images`                | Every image: file name, scales, @1x size                                                 |
| `layouts`               | Board geometry for `portrait-rotated` (default) and `landscape`                          |
| `points`                | Dark and light point woods: fallback color and texture tile                              |
| `checkers`              | Light and dark checker styles (fill, rim, highlight, ring, dish, grooves), shadow, badge |
| `highlights`            | Selected checker ring and legal target ring                                              |
| `dice`                  | Face, pips (red ace pip), corner radius, shading, shadow                                 |
| `sounds`, `haptics`     | Event names. Sounds are `null` for now (files come in #39, #40).                         |
| `accessibility`         | Checker contrast (the tests compute it again) and the color-blind checks done            |

### Units

- **Normalized** rects and points: 0..1 of the board width (`x`, `w`) and height (`y`, `h`).
- **Width units** for layout lengths (checker radius, stack spacing, die size, tile size): fractions of the board width.
- **Radius units** inside a checker style: fractions of the checker radius.
- **Die units** inside the dice style: fractions of the die size.

### Layouts

Point numbers are from the view of the player at the **bottom** of the screen. That player moves 24 → 1 and bears off into `trays.player`. The renderer maps engine points to these slots (and mirrors them for the other player's view).

| Layout                       | Board        | Your home    | Trays       | Use                                    |
| ---------------------------- | ------------ | ------------ | ----------- | -------------------------------------- |
| `portrait-rotated` (default) | 377 × 630 pt | bottom-left  | bottom edge | Phone in portrait (wireframe option B) |
| `landscape`                  | 630 × 377 pt | bottom-right | right edge  | Tablets, face-to-face play             |

Portrait order: the left column holds 12 → 7, the bar, then 6 → 1. The right column holds 13 → 18, the bar, then 19 → 24.

Each layout has:

- `points`: 24 slots. Each has a `rect` (hit area and stack area), a `base` side (where the triangle base is; stacks grow away from it) and a `tone`.
- `bar.player` / `bar.opponent`: where hit checkers wait. `trays.player` / `trays.opponent`: bear-off trays.
- `diceArea`, `fields` (the two recesses), `pointShape` (triangle depth and seam), `checker` (radius, spacing, `maxVisible: 5`), `dice` (size, tilt), `shadow` and an optional `overlay` (the lamp).

A stack shows at most `maxVisible` checkers. Above that, the last checker gets a count badge (`stackCenters` returns `badge`). If a stack does not fit, the spacing shrinks.

## Draw order for the Skia renderer

1. `layout.shadow` under the board (a blurred rounded rect).
2. Layers with `z: "underPoints"` (`board-*`): frame, bar, hinges, trays, wood field.
3. The 24 points: a triangle path (`pointTriangle`), filled with the point `fill`, then with an image shader of the `texture` tile. Scale the tile to `tileSize × boardWidth`, rotate it by `tileRotation`. Then stroke the `seam`.
4. Layers with `z: "overPoints"` (`shade-*`): wear, grime and the frame's inner shadow.
5. Checkers (`stackCenters`), with the count badge. Borne-off checkers in the trays (`trayRects`).
6. Highlights, then dice (`diceCenters`).
7. `layout.overlay`: the warm lamp, with a soft-light blend, over everything.

Light comes from the top-left of the screen in both layouts. The landscape images are drawn again for that light; they are not a rotated copy.

### Why the points are vectors

The points are paths in the manifest, filled with a small wood tile. They are not baked into the board image:

- **Sharp at every size.** Skia draws path edges with anti-aliasing at the device resolution. A baked image gets soft edges when it is scaled to a phone that is not exactly 377 pt wide.
- **One source of truth.** The triangle drawn on screen is the same data the hit test and the highlights use. Art and layout cannot drift apart.
- **Cheap.** 24 paths with one image shader are nothing for Skia. The tiles weigh 2–13 KB each, and both layouts share them.
- **Easy to change.** Another wood or color is a manifest change, not a new render.

The "shade" layer then puts wear and the frame shadow over the points, so they still look inlaid.

## Assets

- WebP, file names in the React Native style: `board.webp` (@1x), `board@2x.webp`, `board@3x.webp`. Metro picks the right scale. `scales` lists the files on disk.
- @1x pixels = points at the layout's `referenceSize`. For a bigger board, pass `pixelRatio × drawnWidth / referenceWidth` to `pickScale`.
- Budget: **under 2 MB per theme** (a test checks it). Walnut Kafeneio is about 1.1 MB.

## Scripts

```sh
pnpm --filter @tavli/themes build:assets   # images + layout block of theme.json (add `-- <id>` for one theme)
pnpm --filter @tavli/themes preview        # preview/*.png from theme.json
pnpm --filter @tavli/themes preview -- --debug   # *-debug.png with every layout rect outlined (not committed)
pnpm --filter @tavli/themes test
```

Both tools need Node 22.18 or newer and Playwright with Chromium on the machine (`require('playwright')` must work). Chromium draws the SVG art and encodes the WebP, so no native image library is needed. The build gives the same bytes on every run with the same Chromium.

`build:assets` writes only the `images` and `layouts` keys of `theme.json`. Edit every other key by hand.

To change a wood grade, run `tools/walnut-kafeneio/prepare_textures.py` (Python, numpy, Pillow). Its header says how.

## Add a theme

1. Make a folder `tools/<id>/` with a `design.mjs` that exports the geometry and the layer SVGs (copy `walnut-kafeneio`). Put its CC0 textures in `tools/<id>/textures/`.
2. Add the id to `THEMES` in `tools/build-assets.mjs` and run `build:assets`. Or, for a Blender skin, export the images and the layout block from Blender (`docs/design/art-pipeline.md` §4.2).
3. Write the rest of `<id>/theme.json` by hand: name, palette, points, checkers, highlights, dice, sounds, haptics.
4. Add it to `BUNDLED` in `src/registry.ts`.
5. Run `pnpm test`. The tests check every bundled theme: the manifest, 24 points with no overlaps, every rect inside 0..1, every file on disk at the right size, no unused files, the 2 MB budget, and contrast (checkers ≥ 7:1, checker vs point ≥ 3:1 by fill or outline, checker vs field ≥ 3:1).
6. Run `preview` and look at the PNG. Then list every new file in `LICENSES.md`.
