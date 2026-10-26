# Palettes, checker contrast and dice

> Issue #13. Last review: 2026-10-26. Numbers come from `src/contrast.py`. Run it again after any color change.

## How to read this

- **Tokens** are the design values. Wood tokens are the **average color** of the graded texture: `src/prepare_textures.py` maps each texture so its mean equals the token. The grain adds detail around it.
- **Contrast** is the WCAG 2.x ratio. The art pipeline asks for **at least 3:1** between the two checkers and between a checker and the board (WCAG 1.4.11, non-text contrast).
- **L\*** is CIELAB lightness (0 = black, 100 = white). A big L\* gap means the checkers differ in lightness, not only in hue. That is what keeps them apart for every kind of color blindness.
- **Measured** values are averages of small patches in the rendered PNG. They include grain, grooves, shading and the lamp light in B.
- Names follow the token groups in `art-pipeline.md` §7.3 (`color.*`). They can move into `packages/ui/tokens/*.json` (DTCG) later.

## Concept A: olive inlay

### Board and checkers

| Token | Hex | L\* | Use |
|-------|-----|-----|-----|
| `color.board.frame` | `#8E6A40` | 47.5 | Olive frame, streaky grain (texture `a-frame-olive-streak`) |
| `color.board.field` | `#D4BB8D` | 77.0 | Light olive field (texture `a-field-olive`) |
| `color.board.point.dark` | `#3B2A20` | 18.8 | Wenge points (texture `a-point-wenge`) |
| `color.board.point.light` | `#7E3521` | 32.0 | Mahogany points and cores (texture `a-point-mahogany`) |
| `color.board.inlay.light` | `#E7D7B6` | 86.5 | Maple stringing, dog-tooth and meander light part |
| `color.board.inlay.dark` | `#2E1E14` | 13.0 | Dog-tooth and meander dark part |
| `color.board.seam` | `#2A1A10` | 11.1 | Inlay seams, fold line |
| `color.checker.light` | `#EADDC2` | 88.5 | Cream (maple) checker (texture `a-checker-maple`) |
| `color.checker.light.edge` | `#6B5232` | 36.7 | 1.1 pt outline on cream checkers |
| `color.checker.dark` | `#4A2E1E` | 22.0 | Dark walnut checker (texture `a-checker-walnut`) |
| `color.checker.dark.ring` | `#B89A78` | 65.5 | 1.1 pt polished edge ring on dark checkers |
| `color.highlight.select` / `.target` | `#F2C14E` | 80.5 | Selected checker ring, legal target ring |
| `color.highlight.halo` | `#2A1A10` | 11.1 | Dark halo under every highlight (9.98:1 with the gold) |

### UI

| Token | Hex | Use |
|-------|-----|-----|
| `color.ui.bg` | `#F6EFE1` → `#D9C8A8` | Warm cream, radial, with fine noise |
| `color.ui.text` | `#33261A` | Main text (11.7:1 on the background) |
| `color.ui.textDim` | `#7A6650` | Secondary text (4.4:1) |
| `color.ui.turn` | `#C98A1B` | Turn ring around your avatar |
| `color.ui.turnText` | `#7A4A0E` | "Σειρά σου" |
| `color.ui.button.primary` | `#4A2E1E` on `#F3EAD7` text | Confirm ("Τέλος"), 10.3:1 |
| `color.ui.button.secondary` | `#F4ECDB`, border `#CDBB98`, text `#4A3423` | Undo ("Πίσω") |

### Contrast (tokens)

| Pair | Ratio | Pass 3:1? |
|------|-------|-----------|
| **cream checker vs dark checker** | **9.18:1** (ΔL\* 66.5) | Yes |
| cream checker vs wenge point | 10.16:1 | Yes |
| cream checker vs mahogany point | 6.46:1 | Yes |
| cream checker vs olive field | 1.38:1 | No, fill alone |
| → cream checker **edge** vs olive field | 3.92:1 | Yes |
| dark checker vs olive field | 6.64:1 | Yes |
| dark checker vs wenge point | 1.11:1 | No, fill alone |
| dark checker vs mahogany point | 1.42:1 | No, fill alone |
| → dark checker **ring** vs wenge point | 5.16:1 | Yes |
| → dark checker **ring** vs mahogany point | 3.28:1 | Yes |

Measured in the render: cream vs dark checker **8.89:1**; cream vs field 1.57:1; dark vs field 5.66:1; dark vs wenge 1.18:1; dark vs mahogany 1.19:1. The edge and the ring do the work where the fills are close.

## Concept B: walnut kafeneio

### Board and checkers

| Token | Hex | L\* | Use |
|-------|-----|-----|-----|
| `color.board.frame` | `#3C2617` | 17.5 | Worn dark walnut frame, bar and trays (texture `b-frame-worn-walnut`) |
| `color.board.field` | `#8A6038` | 44.3 | Mid walnut field (texture `b-field-walnut`) |
| `color.board.point.dark` | `#2B1F19` | 13.0 | Ebony points (texture `b-point-ebony`) |
| `color.board.point.light` | `#CFB98E` | 76.0 | Aged bone / maple points (texture `b-point-bone`) |
| `color.board.brass` | `#C99A3E` (light `#F3D58A`, dark `#7A531A`) | 66.4 | Hinges, clasp plates, corner caps |
| `color.board.wear` | `#F0D9AE` at 10–35 % | | Rubbed spots and scratches |
| `color.light.lamp` | `#FFC070` at 32 % → black at 50 % | | Warm overhead lamp (soft-light blend) |
| `color.checker.light` | `#ECE2CB` | 90.1 | Ivory resin checker, dished centre |
| `color.checker.light.edge` | `#6E5A3C` | 39.5 | 1.1 pt outline on ivory checkers |
| `color.checker.dark` | `#1E1A17` | 9.6 | Black resin checker, dished centre |
| `color.checker.dark.ring` | `#8C8279` | 55.0 | 1.1 pt polished edge ring on black checkers |
| `color.highlight.select` / `.target` | `#F2C14E` | 80.5 | Same gold as A |
| `color.highlight.halo` | `#120A05` | 3.2 | Dark halo (11.7:1 with the gold) |

### UI

| Token | Hex | Use |
|-------|-----|-----|
| `color.ui.bg` | `#3B2A1D` → `#120C07` | Dark warm brown, radial, with fine noise |
| `color.ui.text` | `#F1E6CF` | Main text (13.3:1) |
| `color.ui.textDim` | `#BFA987` | Secondary text (7.7:1) |
| `color.ui.turn` / `.turnText` | `#F2C14E` / `#F6D27A` | Turn ring and "Σειρά σου" |
| `color.ui.button.primary` | brass `#C89B45`, text `#22160C` | Confirm, 6.9:1 |
| `color.ui.button.secondary` | `#2E1F15`, border `#6A4E35`, text `#EADCC0` | Undo |

### Contrast (tokens)

| Pair | Ratio | Pass 3:1? |
|------|-------|-----------|
| **ivory checker vs black checker** | **13.42:1** (ΔL\* 80.5) | Yes |
| ivory checker vs ebony point | 12.42:1 | Yes |
| ivory checker vs walnut field | 4.28:1 | Yes |
| ivory checker vs bone point | 1.48:1 | No, fill alone |
| → ivory checker **edge** vs bone point | 3.44:1 | Yes |
| black checker vs bone point | 9.04:1 | Yes |
| black checker vs walnut field | 3.14:1 | Yes (just) |
| black checker vs ebony point | 1.08:1 | No, fill alone |
| → black checker **ring** vs ebony point | 4.25:1 | Yes |

Measured in the render: ivory vs black checker **12.70:1**; ivory vs field 4.03:1; black vs field 3.15:1; black vs bone 7.09:1; black vs ebony 1.03:1 (the ring covers this).

Note: the first render had black vs field at 2.52:1, because the dome and dish highlights made the black checker look grey. We cut those highlights. Keep black-checker highlights small when the Blender skin is made.

## Color-blind check

We simulated protanopia, deuteranopia and tritanopia (Machado et al. 2009, full severity). The checkers are told apart by lightness, so the gap stays large:

| Concept | Protanopia L\* (light / dark) | Deuteranopia | Tritanopia |
|---------|------------------------------|--------------|------------|
| A cream / walnut | 87.7 / 20.3 (Δ 67.5) | 88.9 / 23.0 (Δ 66.0) | 88.3 / 21.8 (Δ 66.5) |
| B ivory / black | 89.5 / 9.4 (Δ 80.2) | 90.5 / 9.8 (Δ 80.7) | 90.0 / 9.6 (Δ 80.4) |

Highlights use a gold core plus a dark halo, a dashed ring for targets and a solid ring for the selected checker. So shape, not only color, tells them apart.

### Why not red and cream checkers in B?

Red is a classic kafeneio choice (see mood board #3). We tested it and rejected it as the default:

- A typical red resin checker (`#A3241C`) has L\* 36. The walnut field has L\* 44. That is only **1.35:1**. The checker would sink into the board.
- `art-pipeline.md` §7.4 says to avoid red vs brown. With protanopia the red drops to L\* 29, a dark brown on a brown board.
- Ivory and black keep a 13:1 gap. We can still offer red and cream as an option, with a light edge ring like the black checker.

## Dice

| | Concept A | Concept B |
|-|-----------|-----------|
| Look | Bone-cream, rounded square, soft dome shading | Old ivory, same shape |
| Face / side / edge | `#F3EAD7` / `#CDBB98` / `#8F7A55` | `#F1E8D3` / `#C9BB9C` / `#857352` |
| Pips | Walnut `#3B2416` (12.1:1 on the face) | Black `#151210` (15.3:1); the **ace pip is red** `#A3241C` (6.1:1), as on many Greek sets |
| Size | 33 pt (about 80 % of a point width), corner radius 6.5 pt, pip radius 3.3 pt | same |
| Shadow | offset (2.6, 4) pt, blur 2.6 pt, 50 % | same |
| Place | On the board, in the gap of the bottom half, tilted −11° and +9° | same |

Motion follows ADR-0005: the engine picks the result first. MVP1 shows a 2D toss (slide, spin, bounce, land). The faces in the mockups are the landing frames.
