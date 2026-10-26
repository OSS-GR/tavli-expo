# Board screen (app)

> How the app draws the board and plays a turn. Code: `apps/mobile/src/features/board/`. Last review: 2026-10-26.

## Parts

| File | What it does |
|------|--------------|
| `geometry.ts` | Layout math in screen points: fit the board, point rects and triangles, stacks, bar, trays, hit-testing. Pure TypeScript. |
| `boardModel.ts` | Engine `BoardState` → what to draw: stacks per slot, placed checkers, badges, trays. Board flip lives here. |
| `paint.ts` | Theme gradients and colors → Skia props. |
| `skia/BoardScene.tsx` | The Skia drawing. Props only: no hooks, no React Native. The same scene renders in the app, in Jest and headless. |
| `skia/CheckerShape.tsx` | One checker from a theme `CheckerStyle`. |
| `BoardCanvas.tsx` | The Skia `<Canvas>`, the theme from Settings and the space the board may fill. |
| `useBoardAssets.ts` | Loads the theme images and the badge font. |
| `themeImages.ts` | The Metro `require` map for theme images (Metro only bundles literal requires). |
| `StaticBoard.tsx` | A board that only shows a position. |
| `positions.ts` | Fixed positions (start, mid-game, bear-off) for the dev screen, tests and screenshots. |

Dev route: `app/dev/board.tsx` shows the fixed positions and both views. Release builds redirect it to Home.

## Drawing

- The board uses the theme's **portrait-rotated** layout (wireframe option B). `fitBoardWithShadow` keeps the aspect ratio and leaves room for the shadow, so the board fits an iPhone SE and large phones.
- Draw order follows `packages/themes/README.md`: shadow, image layers under the points, 24 vector points (color, wood tile, seam), image layers over the points, checkers and count badges, trays, highlights, lamp overlay.
- Until the images load, the board draws with the theme colors, so the first frame is never empty.
- A stack shows at most `checker.maxVisible` (5) checkers. The last one carries a count badge.
- **Bar checkers shrink to fit the bar.** In Walnut Kafeneio the bar is 34 pt and a checker 40 pt, so bar checkers get a radius of 94% of half the bar height.
- Checker colors stay with the player: White uses the theme's `light` style, Black the `dark` style.

## Board flip

The theme numbers points from the view of the player at the bottom (the **viewer**). The engine numbers points in White's order. `boardModel.ts` maps each absolute point to the viewer's own number (`absoluteToOwn`). So the viewer always moves 24 → 1, with home at the bottom left. Turning the board to the other player is only a change of viewer: a left–right mirror, as the wireframes ask.

## Tests

- `geometry.test.ts` and `boardModel.test.ts`: the layout math (point → rect, stacks, badge, bar, trays, hit-testing) and the engine → slot mapping.
- `BoardScene.test.tsx`: a render smoke test. Jest replaces Skia with `apps/mobile/test/skiaMock.tsx`: every Skia component becomes a plain element, so the test counts what the board would draw.

## Screenshots

`pnpm --filter @tavli/mobile screenshots` renders PNGs into `apps/mobile/docs/screenshots/` with Skia's headless CanvasKit build (Vitest config in `apps/mobile/tools/screenshots/`). It draws the real `BoardScene`. Each PNG must stay under 300 KB.
