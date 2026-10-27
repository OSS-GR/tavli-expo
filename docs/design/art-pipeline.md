# Art pipeline: rendering, themes, assets, sound, learning path

> Status: research and recommendation. Last review: 2026-10-26.
> The rendering choice needs its own ADR (see roadmap M0: "Decide rendering approach"). This doc is the input for that ADR.

## 1. Recommendation summary

1. **Render the board in 2D with `@shopify/react-native-skia`.** Do not use real-time 3D for MVP.
2. **MVP1 art = "textured vector".** Draw the board shapes (frame, points, bar) as Skia paths. Fill them with flat colors (a "Modern" theme) or with CC0 wood photo textures (a "Wood" theme). AI agents can build all of this in code. The owner needs no art skills yet.
3. **v1.0 art = pre-rendered Blender skins.** Model a real wooden tavli board in Blender. Render it from a top-down orthographic camera. Ship the renders as WebP images. Skia draws them. This gives a rich, "real wood" look at 2D cost.
4. **Every look is a theme ("skin").** A theme is a folder with a `theme.json` manifest plus images and sounds. The board code reads only the manifest. A new theme needs no code change.
5. **Dice:** MVP1 uses a 2D "toss" animation (move, spin, bounce, face flicker) in Reanimated. v1.0 uses Blender-rendered dice frames. The **outcome is always chosen first** (by the engine RNG, or by the server online). The animation only shows it. Never let physics decide the result.
6. **UI effects:** Lottie (played through Skia "Skottie" or `lottie-react-native`) for a few stock effects. Rive later, only if we need interactive state machines.
7. **Sound:** CC0 packs (Kenney) plus our own recordings of a real wooden board. Haptics with `expo-haptics`.
8. **Upgrade path to 3D:** keep a `BoardRenderer` boundary. The engine and the board layout (point positions) do not know how the board is drawn. Later we can add a 3D renderer (`react-native-filament` or `@react-three/fiber/native`) for one premium theme without touching game code.

## 2. Rendering approach

### 2.1 The three options

| | (a) Skia + pre-rendered Blender images | (b) Real-time 3D (`@react-three/fiber/native` + `expo-gl`, or `react-native-filament`) | (c) Pure vector (Skia paths, optional texture fills) |
|---|---|---|---|
| **Look** | Very rich. Real wood, soft light, inlay, depth. Fixed camera. | Richest. Camera can tilt. Real lights and shadows. | Clean, flat, modern. With wood texture fills it looks "good wood", not "photo wood". |
| **Performance** | Excellent. Draws a few images. 60–120 fps on old phones. | Medium. three.js runs in JS (Hermes). `expo-gl` frames go through JS. Filament is native C++ and faster. | Excellent. Fastest option. |
| **Battery** | Low. Redraw only on change. | High. A GPU render loop runs while the board is on screen, unless you build "render on demand". | Lowest. |
| **Effort** | Medium. Needs a Blender pipeline and a layout export. | High. 3D scene, lights, picking (tap on a point in 3D), loaders, device testing. | Low. All code. AI agents can do it alone. |
| **Asset size per theme** | 2–6 MB (board @1x/@2x/@3x WebP + checker and dice sprites). | 1–5 MB (GLB + textures). Plus three.js (~600 KB JS) or Filament native libs (several MB). | Under 100 KB for flat. 0.5–2 MB with texture fills. |
| **Scales to any screen** | Needs @1x/@2x/@3x and tablet sizes. | Yes. | Yes, perfectly. |
| **Dark mode / recolor** | Needs a new render per variant. | Easy (change material). | Trivial (change tokens). |
| **Fits a beginner owner** | Yes, after the learning path in §6. | No. Hard to debug. | Yes. |
| **Fits AI agents in a Linux container** | Yes. Blender runs headless with Python (§4.2). | Partly. Agents cannot see the result on a phone GPU. | Yes. |
| **Main risks** | Board orientation must be fixed before rendering. Checker shadows must be faked in 2D. | `expo-gl` + three.js on RN has a small community. KTX2 textures need a Basis transcoder (WASM), which is awkward in Hermes. Filament supports GLB only. Higher crash and memory risk. | Can look "cheap" if not polished. |

### 2.2 Why Skia for both (a) and (c)

- One drawing engine for all themes. Vector themes and image themes share the same code path.
- Skia works with Reanimated. Drag gestures and animations run on the UI thread, not the JS thread.
- Skia has an `Atlas` API for many sprites (checkers, particles). It can also play Lottie files (Skottie) inside the same canvas.
- Skia has image shaders. We can fill a vector point (triangle) with a tiled wood texture. That is the "textured vector" middle ground.

### 2.3 Upgrade path

| Stage | Renderer | Themes |
|---|---|---|
| MVP1 | Skia, vector + texture fills | "Modern" (flat) and "Wood" (CC0 textures) |
| v1.0 | Skia, adds image layers | Add "Kafeneio" (Blender pre-rendered). Add a high-contrast theme. |
| Later | Optional 3D renderer behind the same `BoardRenderer` interface | One premium 3D theme, or a 3D dice tray only. Only if tests on old Android phones are good. |

The key design rule: **board layout is data**. The theme manifest holds the position of every point, the bar and the trays in normalized coordinates (0..1). Game code maps "point 13" to a position through the manifest. The renderer only draws.

## 3. Art style and themes

### 3.1 Style directions

| Theme idea | Mood | Board | Checkers (πούλια) | Dice (ζάρια) | Effort |
|---|---|---|---|---|---|
| **Kafeneio Classic** (v1.0 flagship) | Old Greek café. Warm, nostalgic. | Olive wood or walnut box. Inlaid points in light and dark wood. Meander (Greek key) border. Brass hinges. | Turned wood, dark walnut vs light olive or maple. | Off-white bone look, black or red pips. | Blender |
| **Modern** (MVP1) | Clean, flat, calm. | Flat colors, rounded points, soft shadows. | Flat discs with a subtle ring. | Flat rounded squares. | Code only |
| **Wood** (MVP1) | Simple wooden board. | Vector shapes filled with CC0 wood textures. | Vector discs with texture fill and a gradient. | Flat dice with wood tint. | Code + CC0 textures |
| **Aegean** | Island summer. White and blue. | Whitewash wood, blue points. | White and deep blue. | White with blue pips. | Code |
| **Marble Night** | Dark mode, premium. | Dark marble, gold lines. | Black onyx vs ivory. | Gold pips. | Code or Blender |
| **High Contrast** (accessibility) | Max readability. | Plain, high contrast. | White and black, one side with a marker (ring or dot). | Large pips. | Code |

Tips:
- Keep the board **calm**. The checkers, highlights and dice must stand out from it.
- Decide **portrait or landscape** before any Blender render. Pre-rendered light looks wrong if you rotate the image.
- Build a mood board first (Pinterest, own photos of real boards, kafeneio photos). Use real Greek boards as reference, but do not copy a brand's design or logo.

### 3.2 Theme ("skin") manifest sketch

One folder per theme in `packages/themes/<id>/`. Example `theme.json`:

```json
{
  "$schema": "../theme.schema.json",
  "id": "kafeneio-classic",
  "version": "1.0.0",
  "name": { "en": "Kafeneio Classic", "el": "Καφενείο Κλασικό" },
  "author": "Tavli team",
  "license": "Proprietary. Textures: CC0 (Poly Haven, ambientCG). See credits.md",
  "minAppVersion": "1.0.0",
  "kind": "image",
  "preview": "preview.webp",
  "orientation": "landscape",

  "board": {
    "aspectRatio": 1.6,
    "layers": [
      { "id": "base", "image": "board.webp", "scales": [1, 2, 3] },
      { "id": "frameShadow", "image": "frame-shadow.webp", "scales": [1, 2, 3], "blend": "multiply" }
    ],
    "layout": {
      "units": "normalized",
      "points": [
        { "index": 1, "base": [0.92, 0.95], "tip": [0.92, 0.58], "width": 0.06 }
      ],
      "bar": { "rect": [0.47, 0.05, 0.06, 0.90] },
      "bearOff": {
        "white": { "rect": [0.965, 0.52, 0.03, 0.43] },
        "black": { "rect": [0.965, 0.05, 0.03, 0.43] }
      },
      "diceArea": { "left": [0.25, 0.5], "right": [0.75, 0.5] }
    }
  },

  "checkers": {
    "diameter": 0.055,
    "stack": { "step": 1.0, "maxVisible": 5, "overflow": "counter" },
    "white": { "image": "checker-white.webp", "scales": [1, 2, 3] },
    "black": { "image": "checker-black.webp", "scales": [1, 2, 3] },
    "shadow": { "type": "drop", "dx": 0.002, "dy": 0.004, "blur": 0.006, "opacity": 0.35 },
    "marker": { "black": "none", "white": "none" }
  },

  "dice": {
    "style": "sprite-sequence",
    "size": 0.07,
    "atlas": "dice-atlas.webp",
    "atlasMap": "dice-atlas.json",
    "sequences": { "tumble": "tumble_*", "land": ["land_1", "land_2", "land_3", "land_4", "land_5", "land_6"] },
    "fps": 30
  },

  "colors": {
    "legalTarget": "#F2C14E",
    "selected": "#FFFFFF",
    "lastMove": "#56B4E9",
    "hint": "#009E73"
  },

  "sounds": {
    "checkerPlace": ["sounds/checker-place-1.m4a", "sounds/checker-place-2.m4a", "sounds/checker-place-3.m4a"],
    "checkerHit": "sounds/checker-hit.m4a",
    "diceRoll": ["sounds/dice-roll-1.m4a", "sounds/dice-roll-2.m4a"],
    "bearOff": "sounds/bear-off.m4a",
    "gameWin": "sounds/game-win.m4a"
  },

  "haptics": { "checkerPlace": "light", "checkerHit": "medium", "invalidMove": "warning", "gameWin": "success" },

  "accessibility": {
    "checkerContrastRatio": 4.8,
    "colorBlindChecked": ["protanopia", "deuteranopia", "tritanopia"],
    "hasHighContrastVariant": false
  }
}
```

Notes:
- `kind` is `vector`, `image` or (later) `3d`. A `vector` theme replaces `layers` and images with colors and texture fills.
- `points` lists all 24 points (only one shown). The Blender script writes these numbers automatically (§4.2 step 4). For vector themes, a layout generator writes them.
- `scales` tells the loader which `@1x/@2x/@3x` files exist. File names follow `board@2x.webp`.
- A JSON Schema (`theme.schema.json`) and a CI check validate every theme: files exist, sizes fit the budget, contrast numbers are present.
- Later, themes can be downloaded (CDN + hash check) and sold as in-app purchases. The manifest format does not change.

## 4. Asset pipeline

### 4.1 Tools

| Tool | Use | License / cost |
|---|---|---|
| **Blender 5.2 LTS** (released 2026-07-14, supported to July 2028) | Model, texture, light and render the board, checkers and dice. | Free, GPL. Your renders are yours. |
| **Figma** or **Penpot** | Wireframes, UI kit, prototypes. | Figma has a free tier. Penpot is open source and free, with native design tokens (2.16/2.17 in 2026). |
| **Node + `sharp`** | Resize, convert to WebP, pack atlases. Agents run it in CI. | Apache-2.0. |
| **ImageMagick** | Quick image checks and edits. | Free. |
| **glTF-Transform** CLI | Only for the later 3D path: optimize GLB, resize textures, compress. | MIT. |
| **KTX-Software (`toktx`)** | Only for the later 3D path: KTX2/Basis textures. | Apache-2.0. |
| **Audacity** | Edit and clean sound recordings. | Free, GPL. |

### 4.2 Blender pipeline (headless, scripted by AI agents)

Agents work in a Linux container with no GPU. That is fine for Blender with **Cycles on CPU**.

| Engine | Headless in a GPU-less container? | Use |
|---|---|---|
| **Cycles (CPU)** | Yes. Reliable. Slower. Use denoising (OpenImageDenoise runs on CPU). | All final renders by agents. |
| **EEVEE** | No (not reliably). EEVEE needs a GPU / graphics context. | Owner's own computer, for fast previews. |

Steps:

1. **Install.** Download the Blender 5.2 LTS Linux tarball from blender.org into `/opt/blender`. It may need a few system libs (for example `libxi6 libxkbcommon0 libsm6 libgl1`). Run `blender --version` to check.
2. **Build the scene with Python.** A script, for example `tools/art/blender/build_board.py`, creates the board from parameters: size, frame width, point shape, inlay colors. It loads CC0 PBR textures (color, roughness, normal maps). Run it with:
   `blender -b -P tools/art/blender/build_board.py -- --theme kafeneio-classic`
   Keep scripts in git. Keep `.blend` files in Git LFS, or rebuild them from scripts.
3. **Camera.** Use an **orthographic, top-down** camera. Then 3D positions map to image pixels exactly. Light with a CC0 HDRI (Poly Haven) plus one soft key light.
4. **Export the layout.** The same script projects each point, bar and tray to 2D and writes the `layout` block of `theme.json`. No hand-measuring.
5. **Render in separate passes** (all with transparent background, "Film > Transparent"):
   - `board` with no checkers.
   - `checker-white`, `checker-black`: one checker each, top-down, same light.
   - Optional `frame-shadow` and a shadow-catcher pass, so 2D checkers get believable shadows.
   - `dice`: frames (see §4.5).
   Example: `blender -b scene.blend -E CYCLES -o //out/board_#### -f 1 -- --cycles-device CPU`
6. **Render settings.** Master size: 4096 px on the long side. Cycles 128–256 samples plus denoise. Expect minutes per frame on CPU. Batch dice frames overnight if needed.
7. **Post-process with Node.** Script `tools/art/export.mjs`: resize the masters to @1x/@2x/@3x, convert to WebP (quality ~85, lossless for flat UI), pack sprites into atlases, write `atlas.json`, update `theme.json`.
8. **Check in CI.** Validate the manifest, file sizes and contrast. Make a contact sheet (`preview.webp`) so a human can review the PR.

### 4.3 Image sizes

React Native uses points. Phones are @2x or @3x. The widest phones are about 440 pt (1320 px at @3x). iPads go up to about 1366 pt on the long side at @2x.

| Asset | @1x | @2x | @3x | Tablet (optional @2x-large) | Format |
|---|---|---|---|---|---|
| Board (long side, landscape) | 900 px | 1800 px | 2700 px | 2800 px | WebP q85 |
| Checker | 64 px | 128 px | 192 px | 256 px | WebP with alpha |
| Die face / dice frame | 64 px | 128 px | 192 px | 256 px | WebP in an atlas |
| App icon | 1024 px master | | | | PNG (store needs PNG) |

Rules:
- Load only the scale the device needs. Do not ship 4096 px masters in the app.
- Keep one theme under ~5 MB bundled. The app ships 2 themes. Others download later.
- iOS 14+ and Android both decode WebP. Skia decodes WebP.
- Keep atlases at 2048×2048 or smaller. Old Android GPUs can fail on larger textures.

### 4.4 3D export (later only)

- Export glTF 2.0 binary (`.glb`) from Blender's built-in exporter.
- Optimize with glTF-Transform (resize textures to 1024 or 2048 px, meshopt or Draco).
- KTX2 textures save GPU memory, but test the loader first. three.js `KTX2Loader` needs a Basis transcoder (WASM/worker), which is hard on Hermes. `react-native-filament` loads GLB.

### 4.5 Dice roll animation

| Option | Look | Size | Effort | Notes |
|---|---|---|---|---|
| **2D toss in Reanimated** (MVP1) | Good. Top-down die slides, spins, bounces. Faces flicker, then land. | ~0 (reuse die faces) | Low | Fast to build. Works in every theme. |
| **Pre-rendered sprite sequence** (v1.0) | Very good. Real 3D tumble with light. | ~0.5–1.5 MB per dice set | Medium | Render one shared "tumble" loop (~16 frames) plus 6 short "land on N" endings (~8 frames each). Pick the ending that matches the result. Make dice in Blender with rigid-body physics, then render. |
| **Physics in app** (`cannon-es`, Rapier) + 3D | Best, fully dynamic. | Physics lib + 3D renderer | High | Physics decides the face. To show a fixed result, you must re-map the die faces after the simulation. Costs battery and risk. Not for MVP. |
| **Lottie / Rive** | Stylized, cartoon. | 20–200 KB | Medium (needs animation skills) | Good for a "Modern" theme. |

Hard rule: **the result comes first**. The engine RNG (offline) or the server (online) decides the dice. The animation is only a show.

### 4.6 Lottie vs Rive for UI effects

| | Lottie | Rive |
|---|---|---|
| What it is | Plays an animation exported from After Effects or made in LottieFiles. | Animations plus a **state machine** that reacts to input and data. |
| RN package | `lottie-react-native`, or Skottie inside `@shopify/react-native-skia` | `@rive-app/react-native` (new Nitro runtime; needs Expo SDK 53+ and `react-native-nitro-modules`). Legacy: `rive-react-native`. |
| Free assets | Huge library on LottieFiles. Check each file's license. | Smaller community library. |
| Performance | Fine for small effects. Callstack measured Lottie much slower than Rive on an old Android phone in one test. | Fast. Small files. |
| Learning | Easy to use stock files. Hard to make your own. | Editor is friendly, but the state machine takes learning. Check the Rive plan: some export and production features may need a paid plan. |
| **Use in Tavli** | **MVP/v1.0**: win confetti, "double" burst, loading spinner. Play through Skottie to stay in one canvas. | **Later**: animated mascot, interactive menu buttons, if a designer joins. |

### 4.7 Free asset sources (CC0 first)

| Source | What | License | Attribution |
|---|---|---|---|
| **Poly Haven** | HDRIs, PBR textures (wood, marble, fabric), models | CC0 | Not required |
| **ambientCG** | PBR textures and materials | CC0 1.0 | Not required |
| **Kenney** (kenney.nl) | UI packs, icons, sounds (has casino / board-game sounds) | CC0 | Not required |
| **Google Fonts** | Fonts with Greek: Inter, Noto Sans / Noto Serif, Fira Sans, GFS Didot | SIL OFL | Keep license file |
| **Lucide / Phosphor / Material Symbols** | UI icons | ISC / MIT / Apache-2.0 | Keep license notice |
| **LottieFiles** free animations | UI effects | Per-file license. Check each one. | Varies |

Keep a `credits.md` in every theme folder. Record the source URL and license of every file, even CC0 ones.

### 4.8 AI tools for art (and license notes)

| Use | Tool ideas | Notes |
|---|---|---|
| Icons and simple shapes | AI agents write SVG directly. Recraft for vector icons. | Code you or an agent writes is yours. Check the icons for clarity at 24 px. |
| Mood boards and concept art | Image models (OpenAI image generation, Adobe Firefly, Midjourney) | Fine for ideas. Check each tool's current terms for commercial use. Midjourney needs a paid plan, and big companies need a higher tier. |
| Tileable textures | Prefer CC0 photo-scanned textures (better for wood). AI texture tools are optional. | AI textures often tile badly or look "plastic". |
| Store screenshots, marketing | Real renders of the game | Do not show fake features. |

Legal notes:
- In the US, purely AI-generated images are not protected by copyright (US Copyright Office report on copyrightability, January 2025). Others could copy them. Our hand-made and edited work is protected.
- Do not prompt for other games' art, brand names or living artists' styles.
- Model licenses vary when you run models locally (for example, some Stable Diffusion versions have revenue limits). Read them before use.
- Record AI-made assets in `credits.md` ("AI-assisted, tool X, date").

## 5. Sound and haptics

### 5.1 Sound sources

| Source | License | OK for a commercial app? |
|---|---|---|
| **Own recordings** of a real wooden board, checkers and dice | Ours | Yes. Best and most authentic. A phone and a quiet room are enough. Clean in Audacity. |
| **Kenney** audio packs | CC0 | Yes, no credit needed |
| **Freesound.org** CC0 sounds | CC0 | Yes |
| **Freesound.org** CC BY sounds | CC BY | Yes, but we **must credit** the author (credits screen) |
| **Freesound.org** CC BY-NC or Sampling+ | Non-commercial | **No** |
| **Sonniss GDC Game Audio Bundle** | Royalty-free, commercial use allowed | Yes. Read the bundle license (no reselling raw files). |
| **Pixabay** sound effects | Pixabay Content License | Usually yes. Read the license. |

Recording tips:
- Record 5–10 takes of each sound: checker place, checker stack, hit, dice in hand, dice on wood, bear off.
- Play a random take each time. This avoids the "machine gun" effect.
- Export short mono files as AAC (`.m4a`) at 44.1 kHz. Keep each under 1 second where possible.
- Normalize loudness so all sounds feel the same volume.
- Play sounds with `expo-audio`. Preload them at board start for low delay.

Done for Walnut Kafeneio (issue #39): CC0 sounds from Kenney and OpenGameArt, built by `packages/themes/tools/walnut-kafeneio/build_sounds.py` into `walnut-kafeneio/sounds/` (about 54 KB). Sources and licenses: `packages/themes/LICENSES.md`. How the app plays them: `docs/architecture/board-screen.md` (Sound and haptics). Own recordings of a real board can replace them later.

### 5.2 Haptics

Use `expo-haptics`.

| Event | Haptic |
|---|---|
| Pick up checker | `selectionAsync()` |
| Place checker | `impactAsync(Light)` |
| Hit (capture) / pin (Plakoto) | `impactAsync(Medium)` |
| Dice land | `impactAsync(Light)` twice, timed to the animation |
| Invalid move | `notificationAsync(Warning)` |
| Win game | `notificationAsync(Success)` |

Add settings toggles for sound and haptics. Respect the phone's silent mode for sound. Android haptics differ a lot between phones. Test on 2–3 devices.

## 6. Beginner learning path (owner)

Goal: in about 6 weeks, at a few hours per week, render your own tavli board. Pair with an AI agent: the agent writes the Python script, you open the `.blend` file and tweak it by hand.

| Week | Learn | Practice | Free resources |
|---|---|---|---|
| 1 | Blender interface, navigation, basic modeling | Blender Guru "Donut" parts 1–4 | Blender Guru Blender 4.0 Beginner Donut Tutorial (works in 5.x with small UI changes) |
| 2 | Modeling a box, bevel, array and mirror modifiers | Model the board box, the frame and 12 points with an array | Blender Studio training; Grant Abbitt beginner videos; Blender manual "Modifiers" |
| 3 | Materials, PBR, UV unwrap, Node Wrangler | Apply Poly Haven / ambientCG wood. Make light and dark inlay. | Donut tutorial (shading parts); Poly Haven and ambientCG texture pages |
| 4 | Lighting, HDRI, cameras, Cycles settings | Top-down orthographic camera. Transparent background. Render the board and one checker. | Donut tutorial (lighting and rendering parts); Blender manual "Cycles" |
| 5 | Rigid body physics, simple animation | Drop two dice on the board. Render 24 frames. | Blender manual "Rigid Body" |
| 6 | Python basics in Blender | Read the agent's `build_board.py`. Change one parameter and re-render from the command line. | Blender Python API docs; Blender manual "Command line rendering" |

After that: watch tutorials on wood carving / inlay shaders and on Greek key (meander) patterns with curves.

## 7. App design process

### 7.1 Steps

1. **Mood board** (1–2 days). Real boards, kafeneio photos, competitor apps. Pick 2 directions.
2. **Wireframes** (low detail, grey boxes). Screens: home, new game, board, match end, settings, theme picker, rules. Decide board orientation here.
3. **UI kit.** Colors, type, spacing, buttons, dialogs, board overlays (highlights, hints). Use the Apple and Material design kits as references.
4. **Clickable prototype.** Test the board screen with 3–5 people. Watch them move checkers. Fix confusion before coding.
5. **Design tokens** go to code (§7.3). Then build in Expo.

### 7.2 Figma vs Penpot

| | Figma | Penpot |
|---|---|---|
| Cost | Free tier, paid for teams | Free, open source, can self-host |
| Community kits | Huge (Apple, Material, game UI kits) | Smaller |
| Design tokens | Variables (and plugins like Tokens Studio) | Native tokens (W3C DTCG style), improving in 2026 |
| AI agent access | Dev Mode / MCP server (paid seats for some features) | Open APIs, plugins API, MCP server |
| **Pick** | **Figma** if the owner wants the most tutorials and kits | **Penpot** if we want free and open tokens that sync to the repo |

Either is fine. Pick one and stay with it.

### 7.3 Design tokens

- Store tokens in `packages/ui/tokens/*.json` in the W3C Design Tokens Community Group (DTCG) format.
- Generate TypeScript with Style Dictionary.
- Theme manifests reference tokens for overlays (highlight, selection), so one theme change updates the whole UI.
- Token groups: `color.*`, `space.*`, `radius.*`, `font.*`, `motion.*` (durations and easing), `elevation.*`.

### 7.4 Accessibility (checker colors and more)

- **Contrast, not hue.** The two checker colors must differ in **lightness**, not only in color. Aim for at least 3:1 contrast between the two checkers and against the board (WCAG 2.2, 1.4.11 non-text contrast). Light vs dark checkers (ivory vs walnut, white vs black) work for all color-blind types.
- **Avoid red vs green** as the only difference. Also avoid red vs brown and blue vs purple.
- **Add a shape cue.** Offer "checker markers" in settings: a ring or dot on one side.
- **Highlights:** use an outline or glow shape plus color. Use the Okabe-Ito color-blind safe palette for accents (for example orange `#E69F00`, sky blue `#56B4E9`, bluish green `#009E73`).
- **Test** each theme with a color-blind simulator (Coblis, or the Figma / Penpot plugins). Store the results in the manifest's `accessibility` block.
- Support Dynamic Type for text, VoiceOver / TalkBack labels for board points ("Point 13, 3 black checkers"), and a "reduce motion" option that shortens dice animations.

## 8. Effort estimate (one developer + AI agents)

| Item | Effort |
|---|---|
| Skia board renderer + layout + "Modern" and "Wood" themes (MVP1) | 1.5–3 weeks |
| 2D dice toss + Lottie win effect + sounds + haptics (MVP1) | 1 week |
| Theme manifest, schema, CI checks | 2–4 days |
| Blender pipeline scripts (agent) + first "Kafeneio" skin (owner learning in parallel) | 3–5 weeks calendar |
| Each extra Blender skin after the first | ~1 week |
| Pre-rendered dice sequences | 3–5 days |

## 9. Sources

- Blender 5.2 LTS release: https://www.blender.org/download/releases/5-2/
- Blender manual, command line rendering: https://docs.blender.org/manual/en/latest/advanced/command_line/render.html
- Blender manual, rigid body: https://docs.blender.org/manual/en/latest/physics/rigid_body/index.html
- Blender Python API: https://docs.blender.org/api/current/
- Blender Guru, Blender 4.0 Beginner Donut Tutorial: https://www.blenderguru.com/tutorials/blender-4-beginner-donut-tutorial
- Blender Studio training: https://studio.blender.org/training/
- Grant Abbitt (YouTube): https://www.youtube.com/@grabbitt
- React Native Skia docs: https://shopify.github.io/react-native-skia/
- React Three Fiber, install (native): https://r3f.docs.pmnd.rs/getting-started/installation
- react-native-filament: https://github.com/margelo/react-native-filament
- glTF-Transform: https://gltf-transform.dev
- KTX-Software: https://github.com/KhronosGroup/KTX-Software
- Rive React Native runtime: https://rive.app/docs/runtimes/react-native
- lottie-react-native: https://github.com/lottie-react-native/lottie-react-native
- Callstack, Lottie vs Rive: https://callstack.com/blog/lottie-vs-rive-optimizing-mobile-app-animation
- Poly Haven license: https://polyhaven.com/license
- ambientCG license: https://docs.ambientcg.com/license/
- Kenney assets: https://kenney.nl/assets
- Freesound FAQ (licenses): https://freesound.org/help/faq/
- Sonniss GDC bundle: https://sonniss.com/gameaudiogdc
- US Copyright Office, AI reports: https://www.copyright.gov/ai/
- Expo Haptics: https://docs.expo.dev/versions/latest/sdk/haptics/
- Expo Audio: https://docs.expo.dev/versions/latest/sdk/audio/
- Penpot, what's coming (June 2026): https://community.penpot.app/t/not-a-roadmap-but-whats-coming-in-penpot-june-2026/10628
- Design Tokens Community Group: https://www.designtokens.org/
- Style Dictionary: https://styledictionary.com
- Apple Design Resources: https://developer.apple.com/design/resources/
- WCAG 2.2 non-text contrast: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- Coblis color-blindness simulator: https://www.color-blindness.com/coblis-color-blindness-simulator/

Items marked "check" or "test" above are not fully verified. Confirm them in a spike before writing the rendering ADR.
