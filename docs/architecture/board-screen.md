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
| `diceMotion.ts` | The roll animation as pure math (worklets): tumble pose and face flips. |
| `skia/DieShape.tsx`, `skia/AnimatedDie.tsx` | A die from the theme `DiceStyle`; the animated version tumbles and lands on the engine's value. |
| `DiceRow.tsx` | The dice in the controls row: 2 side by side, or 4 in a 2 x 2 grid for a double. Used dice fade. |
| `interaction.ts` | Which checkers can move and where (from `legalNextMoves`), in screen points; what a tap or a drop means. Pure; the pickers are worklets. |
| `flights.ts` | A move, a hit or an undo as short flights of checkers. Pure. |
| `skia/MovingCheckers.tsx` | The checker in flight and the checker under the finger (UI thread). |
| `InteractiveBoard.tsx` | The playing board: the pan gesture, selection, highlights and flights. |

The game itself lives in `apps/mobile/src/features/game/`:

| File | What it does |
|------|--------------|
| `gameStore.ts` | A Zustand store around the engine `MatchFlow` reducer, with the injected `Rng`. `turnView(flow)` computes what the screen shows (board mid-turn, legal moves, dice, pips). |
| `opening.ts`, `OpeningCard.tsx` | The opening roll card: one die per player, tie, result. |
| `PlayerStrip.tsx` | A player strip: checker color, name, pip count, match score, turn pill. |
| `GameCard.tsx`, `turnNotices.ts` | Cards over the board: no legal moves, game end, match end. |
| `seats.ts` | How each player is named on screen (name, strip label, turn pill, "you"). |
| `GameScreen.tsx` | The board screen: strips, board, cards and the controls row. Vs bot it also runs the bot turn (`features/bot/botTurn.ts`). |

The real route is `app/game/[id].tsx` (see [App shell](app-shell.md)). Dev route (release builds redirect it to Home):

- `app/dev/board.tsx`: the fixed positions, from White's and from Black's side.

**Game flow and ADR-0003.** The engine's turn flow (#25) is already a pure reducer with every phase in it, so the app wraps it in a small Zustand store and adds no second state machine. ADR-0003 records this (updated in #29).

## Drawing

- The board uses the theme's **portrait-rotated** layout (wireframe option B). `fitBoardWithShadow` keeps the aspect ratio and leaves room for the shadow, so the board fits an iPhone SE and large phones.
- Draw order follows `packages/themes/README.md`: shadow, image layers under the points, 24 vector points (color, wood tile, seam), image layers over the points, checkers and count badges, trays, highlights, lamp overlay.
- Until the images load, the board draws with the theme colors, so the first frame is never empty.
- A stack shows at most `checker.maxVisible` (5) checkers. The last one carries a count badge.
- **Bar checkers shrink to fit the bar.** In Walnut Kafeneio the bar is 34 pt and a checker 40 pt, so bar checkers get a radius of 94% of half the bar height.
- Checker colors stay with the player: White uses the theme's `light` style, Black the `dark` style.

## Dice

- The UI never picks dice. Every roll is an engine action (`roll`, `rollOpening`); the flow rolls with the `Rng` from `services.ts` (`createLocalRng`).
- The animation (`diceMotion.ts`) is a 2D tumble on the UI thread: the die spins, hops and grows, and its face flips through the other numbers in a fixed order. From 78% of the roll on, it shows the engine's value.
- **Opening roll:** a card with one die per player. In pass-and-play each player taps for their own die (`openingTaps="perPlayer"`); vs bot one tap rolls both (`"one"`). A tie says so and both roll again. The result stays 1.5 s; the starter then plays both opening dice.
- A haptic plays when the last die lands: the theme's `haptics.diceLand` pattern through the `Feedback` port (`@tavli/contracts`, adapter `@tavli/haptics-expo`). `features/feedback/feedback.ts` skips it when Settings → Haptics is off.

## Moving checkers

- **Touch** a checker that can move: it gets a ring, and each legal target gets a dashed ring and a ghost checker where it would land (theme `highlights`). Targets come from the engine (`legalNextMoves`); the app never decides what is legal.
- **Drag and drop:** one pan gesture (Gesture Handler 3, `usePanGesture`, `minDistance: 0`). The drag runs on the UI thread: the picked-up checker follows the finger through shared values. Only the result (picked up, dropped at x, y) goes to the JS thread.
- **Tap-tap:** a touch that moves less than 8 pt is a tap. Tap a checker, then tap a target. A target wins over another movable checker on that point. A tap may miss a target by 22 pt (wireframe, iPhone SE).
- A drop on the source cancels quietly. A drop anywhere else is illegal: the checker flies back in 160 ms, with the theme's `invalidMove` haptic.
- **Hit-testing uses the drawing rects.** Sources and targets use `slotRect` (the same point rect that holds the triangle and the stack), the bar halves and the trays.
- **Flights:** a move flies the checker to its landing place (200 ms); a hit sends the hit checker to the bar a moment later. While a checker flies, the checker at its landing place is hidden.
- Two dice that reach the same target (bearing off): the lower die is used, so the higher one stays.
- Haptics from the theme: `checkerPickUp`, `checkerPlace`, `checkerHit`, `invalidMove`.
- Not built: the optional double-tap shortcut (it would delay every single tap), and the dashed "last move" arrow from the wireframes.

## Turn: undo, confirm, turn indicator

- **Controls row** (wireframes 6b–6f): one big Roll button before the roll; then **Undo · dice · Confirm**.
- **Undo** takes back the last single move (`undo` action); the checker flies back, and a hit checker comes back from the bar. Disabled (dashed) when there is nothing to undo.
- **Confirm** is enabled only when the engine says `canConfirm` (all dice used, or no move left). Then a hint shows: "All dice used. Confirm or undo."
- **Auto-confirm** (Settings, default off): each move is sent with `autoConfirm`, so the engine ends a complete turn at once.
- **Turn indicator:** the active player's strip gets a thick border and a pill: "YOUR TURN", or "PLAYING" for the bot. Pip counts follow the moves of the turn; Settings → Show pip counts hides them.
- **No legal moves:** the engine passes the turn by itself. The card says who rolled what and that the turn passes; the dice stay, faded. It closes on OK or after 3 s. Until then the board stays with the player who passed (flip).
- **Game end:** winner, Mono / Diplo chip, score, "Next game" (the winner starts). **Match end:** winner, score, "Rematch" (the last winner starts, no opening roll).
- The opening result closes after 1.5 s, or at once on a tap.

### Differences from the wireframes

- The game-end and match-end screens are cards over the board (no `match-end` route yet). The in-game menu is in [App shell](app-shell.md).
- No dashed "last move" arrow and no double-tap shortcut yet.
- The dice in the controls row are 40 pt (wireframe: about 44 pt), so Undo, the dice and Confirm fit on an iPhone SE.
- In pass-and-play the pill says "YOUR TURN" for both players; the strip already shows the name.

## Board flip

The theme numbers points from the view of the player at the bottom (the **viewer**). The engine numbers points in White's order. `boardModel.ts` maps each absolute point to the viewer's own number (`absoluteToOwn`). So the viewer always moves 24 → 1, with home at the bottom left. Turning the board to the other player is only a change of viewer: a left–right mirror, as the wireframes ask.

## Tests

- `geometry.test.ts` and `boardModel.test.ts`: the layout math (point → rect, stacks, badge, bar, trays, hit-testing) and the engine → slot mapping.
- `dice.test.ts`, `gameStore.test.ts`, `GameScreen.test.tsx`: the roll animation math, the dice layout, the store over the engine flow, and the dice and opening card on screen.
- `interaction.test.ts`: sources and targets on the drawing rects, tap and drop rules, flights for a move, a hit and an undo. `GameScreen.moves.test.tsx`: drag, tap-tap, an illegal drop and tap-to-roll through the screen.
- Jest fakes Gesture Handler with `apps/mobile/test/gestureHandlerMock.tsx`; `touch(testID, path)` drives the board's pan gesture like a finger.
- Jest fakes Reanimated with `apps/mobile/test/reanimatedMock.ts`: animations end at once and call their end callback.
- `GameScreen.turn.test.tsx`: undo, confirm, auto-confirm, the turn indicator (flip and fixed), pip counts on and off, the pass card (OK and 3 s), game end, next game, match end and rematch. `GameScreen.match.test.tsx` plays a whole match with taps only (to 1 by default; `FULL_MATCH=1` plays to 3).
- `BoardScene.test.tsx`: a render smoke test. Jest replaces Skia with `apps/mobile/test/skiaMock.tsx`: every Skia component becomes a plain element, so the test counts what the board would draw.

## Screenshots

`pnpm --filter @tavli/mobile screenshots` renders PNGs into `apps/mobile/docs/screenshots/` with Skia's headless CanvasKit build (Vitest config in `apps/mobile/tools/screenshots/`). It draws the real `BoardScene` and dice. Each PNG must stay under 300 KB.

- `board-start.png`: the Portes start, White at the bottom.
- `board-midgame-black-view.png`: Black's view (flip): count badge, bar, tray.
- `play-moving.png`: a turn in progress (wireframe 6c): 13/7 played, the checker on 8 picked up, its target lit, the used 6 faded. The strips and buttons are React Native views, so they are not in the picture.
