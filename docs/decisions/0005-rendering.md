# ADR-0005: Board rendering approach and art style

- **Status:** Proposed
- **Date:** 2026-10-26
- **Issue:** #8

## Context

The board must look good, run at 60 fps on mid-range phones, and support swappable themes. The owner is new to art; AI agents must be able to make most assets. Research: [`docs/design/art-pipeline.md`](../design/art-pipeline.md).

## Options

| Option | Look | Performance / battery | Effort | Agents can build it? |
|--------|------|-----------------------|--------|----------------------|
| **2D Skia + textures / pre-rendered Blender images** | Rich, can look 3D | Best | Low–medium | Yes |
| Real-time 3D (react-three-fiber / filament) | Best depth, camera moves | Worst; larger app | High | Partly |
| Pure flat vector | Clean, simple | Best | Lowest | Yes |

## Decision

1. Render the board in **2D with `@shopify/react-native-skia`**; animate with **Reanimated** on the UI thread.
2. **Style: traditional wooden only** (owner, 2026-10-26). Every theme is a wooden board style (e.g. olive, walnut, inlay). No modern flat theme.
3. **MVP1 look:** "textured vector" — shapes drawn in code, filled with **CC0** wood textures (Poly Haven, ambientCG).
4. **v1.0 look:** a "Kafeneio" wooden skin rendered top-down in **Blender** (headless, Cycles CPU) and exported as WebP @1x/@2x/@3x. The same script writes point positions into the theme file.
5. **Themes are data:** each skin is a folder with `theme.json` (layout, images, colors, sounds, haptics). The board code never hard-codes art.
6. **Dice:** the engine or server picks the result first; the animation only shows it. 2D toss in MVP1; pre-rendered frames in v1.0.
7. **Effects:** Lottie via Skia now; consider Rive later.
8. **3D later** only behind a `BoardRenderer` boundary, so it is a plug-in, not a rewrite.

## Consequences

- Fast start; small app; good battery life.
- The owner can learn Blender on the side (#15) without blocking MVP1.
- A true 3D board is possible later without touching game logic.
