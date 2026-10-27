# Board screen (app)

> How the app draws the board and plays a turn. Code: `apps/mobile/src/features/board/`. Last review: 2026-10-27.

## Parts

| File | What it does |
|------|--------------|
| `geometry.ts` | Layout math in screen points: fit the board, point rects and triangles, stacks, bar, trays, hit-testing. Pure TypeScript. |
| `boardModel.ts` | Engine `BoardState` → what to draw: stacks per slot, placed checkers, badges, trays. Board flip lives here. |
| `asodio.ts` | Asodio for the screen: checkers to enter, the loading lock, the checkers the quarter lock freezes, a frozen army (A6). Pure TypeScript. |
| `paint.ts` | Theme gradients and colors → Skia props. |
| `skia/BoardScene.tsx` | The Skia drawing. Props only: no hooks, no React Native. The same scene renders in the app, in Jest and headless. |
| `skia/CheckerShape.tsx` | One checker from a theme `CheckerStyle`. |
| `BoardCanvas.tsx` | The Skia `<Canvas>`, the board theme from Settings (`useBoardTheme`) and the space the board may fill. |
| `useBoardAssets.ts` | Loads the theme images and the badge font. |
| `themeImages.ts` | The Metro `require` map for theme images (Metro only bundles literal requires). |
| `StaticBoard.tsx` | A board that only shows a position. An optional `theme` prop draws another theme (the board picker). |
| `positions.ts` | Fixed positions (start, mid-game, bear-off, Plakoto, Fevga, Asodio) for the dev screen, tests and screenshots. |
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
| `PlayerStrip.tsx` | A player strip: checker color, name, pip count, an optional note (Asodio: "12 to enter", "Army frozen"), match score, turn pill. |
| `GameCard.tsx`, `turnNotices.ts` | Cards over the board: no legal moves, "could not be opened". |
| `GameEndSheet.tsx` | Game end (wireframe 8): a sheet over the final board. |
| `Celebration.tsx` | The small win effect on the game-end sheet and the match-end screen. |
| `useAnnouncement.ts` | Reads a result to screen readers (`AccessibilityInfo.announceForAccessibility`). |
| `announcements.ts` | What the screen reads as the game goes on: each roll, and the other player's moves. |
| `seats.ts` | How each player is named on screen (name, strip label, turn pill, "you"). |
| `GameScreen.tsx` | The board screen: strips, board, cards and the controls row. Vs bot it also runs the bot turn (`features/bot/botTurn.ts`). |

The real route is `app/game/[id]/index.tsx`; match end is `app/game/[id]/match-end.tsx` (see [App shell](app-shell.md)). Dev route (release builds redirect it to Home):

- `app/dev/board.tsx`: the fixed positions (`positions.ts`: Portes start, mid-game, bear-off, Plakoto start, Plakoto pins, Fevga start, Asodio start, Asodio loading, Asodio frozen army), from White's and from Black's side. Each position has its direction (`SAMPLE_DIRECTIONS`). The Asodio positions show the frozen marks.

**Game flow and ADR-0003.** The engine's turn flow (#25) is already a pure reducer with every phase in it, so the app wraps it in a small Zustand store and adds no second state machine. ADR-0003 records this (updated in #29).

## Board themes

- Three boards ship: **Walnut Kafeneio** (default), **Olive Inlay** and **Kafeneio Night** (dark, #144) (`packages/themes`). All have the same geometry, so only the art changes.
- The player picks one in **Settings → Board** (`features/settings/BoardThemePicker.tsx`): one radio row per bundled theme, with a small `StaticBoard` of the start position in that theme, and the theme's name and description in the app language. The choice saves at once as `boardTheme` (an unknown id falls back to the default).
- `boardTheme` is separate from `theme` (the app colors, `@tavli/ui`, Settings → Look).
- `useBoardTheme()` reads `boardTheme`. The game screen, the tutorial, the rules pictures (`StartPicture`) and every `StaticBoard` use it. The game sounds come from the board theme too.
- A new theme needs its images in `themeImages.ts` and its sounds in `features/feedback/themeSounds.ts`; tests check both maps. The picker lists it by itself.

## Drawing

- The board uses the theme's **portrait-rotated** layout (wireframe option B). `fitBoardWithShadow` keeps the aspect ratio and leaves room for the shadow, so the board fits an iPhone SE and large phones.
- Draw order follows `packages/themes/README.md`: shadow, image layers under the points, 24 vector points (color, wood tile, seam), image layers over the points, pinned checkers (Plakoto, Asodio), checkers (frozen ones shaded, Asodio) and count badges, trays, highlights, lamp overlay.
- Until the images load, the board draws with the theme colors, so the first frame is never empty.
- A stack shows at most `checker.maxVisible` (5) checkers. The last one carries a count badge.
- **Bar checkers shrink to fit the bar.** In Walnut Kafeneio the bar is 34 pt and a checker 40 pt, so bar checkers get a radius of 94% of half the bar height.
- Checker colors stay with the player: White uses the theme's `light` style, Black the `dark` style.

## Plakoto, Fevga and Asodio

The board reads the game from the engine state: `rules.movement.direction` gives the direction (`turnView`, `GameScreen`), and the legal moves come from the engine (`legalNextMoves`) as in Portes. So drag, tap, hints, undo and confirm work the same in every game. Plakoto and Fevga never use the bar; only Portes hits. Asodio uses the bar halves for its checkers that are not entered yet (see [Asodio](#asodio)).

- **Plakoto pins.** A pinned checker lies under the checkers that pin it. It sits at the base of the point, where a lone checker would be; the stack on top starts `PIN_PEEK` (0.6) checker radii further along the point, so the pinned checker peeks out on the base side (wireframe 17's small picture). It also gets a ring in the theme's badge color (`PIN_RING_WIDTH`), so a pin never looks like a normal stack. The pinned checker is not part of the stack: `countIn` does not count it, `pinnedIn` says it is there, and `layoutBoard` returns it in `pins` (key `<slot>:pinned`). Touch, ghost targets and flights use the same pinned stack positions (`stackGeometry(…, pinned)`), so a pin lands exactly where it is drawn. A pin is a plain move: no checker flies to the bar.
- **Screen readers:** the board has a label, "Board", plus one line per pinned checker ("Bob's checker on point 24 is pinned", in the owner's own numbers). Asodio adds its own lines (below).
- **Fevga** (`direction: "parallel"`): both players start on their own point 24, in diagonally opposite corners (for White at the bottom: White on layout 24, Black on layout 12), and both move the same way round. This is only the point mapping in `boardModel.ts` (`absoluteToOwn`); the drawing and hit-testing rects are the same as in Portes. Tests check it in the portrait and the landscape layout.
- The `plakoto` and `fevga` presets keep the Tavli rotation (Portes → Plakoto → Fevga), so a match of the `plakoto` preset starts with Portes. For a match of one game only, override the rotation: `resolveRules('plakoto', { match: { rotation: ['plakoto'] } })` (the tests do this).
- The trays stay where the theme puts them. In Fevga the top player's home is the top right, but its tray stays at the bottom right.

### Asodio

The owner version (`asodio.kafeneio`, `docs/rules/asodio.md` A1–A6). The engine decides every move; `features/board/asodio.ts` only reads the board and the rules, so the screen can say why a checker does not move.

- **The "to enter" stacks.** A checker that is not entered yet (`board.outside`) waits on its player's half of the bar. In the portrait layout each half sits right above that player's starting quarter (spot 6, own point 19), so a checker enters a short hop away. The stack always shows its count badge, even when every checker is drawn (`StackModel.toEnter`). The owner version pins and never hits, so nothing else uses the bar. The strip under the name says "12 to enter".
- **Entering.** Tap or drag from the stack to spot `d` (own point `25 - d`), like any other move: the engine's moves come `from: 'outside'`, and `slotOfOrigin('outside')` is the bar half. A double enters four on one spot, one tap pair each (A1). Undo flies the checker back to the stack. While loading, only the stack has moves (A2), because the engine lists only entries.
- **Loading lock.** While all 15 are still outside (`firstEntryGate`), a note over the board says "Roll 1-2 or a double to start" before the roll (`loading-lock-hint`; "Roll a double to start" with `firstEntryGateRolls: "doubleOnly"`). A roll that does not open the board is a pass; the pass card says "Board locked" and what opens it. An opening roll is never a double, so most games start with a pass (the pass card then replaces the opening result).
- **Frozen checkers.** The quarter lock freezes every checker in front of the player's rear quarter (`frozenPoints`). They get a soft dark shade and a thin frost ring (`FROZEN_MARK` in `BoardScene.tsx`), quiet on purpose: "waits", not "danger". Both players' frozen checkers are marked, all the time (`asodioMarks` → `layoutBoard(…, marks)` → `PlacedChecker.frozen`). Nothing is marked while loading: every checker is still in the starting quarter.
- **Frozen army (A6).** When every checker in the rear quarter is pinned (`armyFrozen`), the player passes until it is free. The strip says "Army frozen", the pinned checker shows the Plakoto pin ring, the rest are shaded, and the pass card is titled "Army frozen" and says the last checker is pinned.
- **Pins** use the Plakoto drawing (`PIN_PEEK`, `PIN_RING_WIDTH`).
- **Draw** (A5, `reason: 'deadlock'`): the game-end sheet says "The game is a draw", the chip "Draw · 0 points" and the reason "No checker can ever move again." The next game starts with a new opening roll. A Plakoto draw (both mothers pinned) uses the same chip with its own reason.
- **Screen readers:** the board label adds "Ann has 12 checkers to enter" (or "You have …"), "Bob's checkers on points 18, 16 are frozen" and "Ann's last checker is pinned: the whole army is frozen". The strips read their notes too.
- **Next player:** the pass card names the player to move from the engine (`state.toMove`), never "the other one", because some Asodio presets give the same player another roll.
- The app plays only the owner version. Other presets (hits, a chosen double after 1-2, extra rolls) work in the engine, but the screen has no card for the `chooseDouble` question yet.

### The mother question (Plakoto)

With `motherRule: "offerConcede"` (the app default) the engine flow stops in `awaiting-answer` after a turn that pins a mother, and `currentPrompt` names the pinned player.

- **A person answers** (pass-and-play, or you vs the bot): a card over the board (wireframe 17), "Bob, your mother is pinned" (or "Your mother is pinned"), what happened and what Resign costs, and two buttons of equal weight: **Resign (lose 2)** and **Play on**. It cannot be closed without a choice. In pass-and-play the pinned player answers; with Flip on, the board turns to them first. The answer is the engine action `answer`.
- **The bot answers** its own question in its turn (`botStep` → `'answer'` in `features/bot/botTurn.ts`). It asks the runner (`BotRunner.chooseAnswer`, #106; easy and medium play on). A runner without `chooseAnswer` (the method is optional), or an answer the question does not offer, falls back to "play on" (`botAnswer`); if the engine still refuses, the bot turn reports an error instead of waiting forever. A note over the board says "Bot plays on." for 2 s (`BOT_ANSWER_NOTE_MS`). If the bot resigns, the game-end sheet says so.

## Dice

- The UI never picks dice. Every roll is an engine action (`roll`, `rollOpening`); the flow rolls with the `Rng` from `services.ts` (`createLocalRng`).
- The animation (`diceMotion.ts`) is a 2D tumble on the UI thread: the die spins, hops and grows, and its face flips through the other numbers in a fixed order. From 78% of the roll on, it shows the engine's value.
- **Opening roll:** a card with one die per player. In pass-and-play each player taps for their own die (`openingTaps="perPlayer"`); vs bot one tap rolls both (`"one"`). A tie says so and both roll again. The result stays 1.5 s; the starter then plays both opening dice.
- A haptic and a sound play when the last die lands (`feedback.event('diceLand')`).

## Sound and haptics

- One call per game event: `feedback.event('checkerPlace')`. `features/feedback/feedback.ts` (`createGameFeedback`) looks up the theme's `sounds[event]` and `haptics[event]` and plays both. It drops an event that comes too soon after the same one (`MIN_GAP_MS`, e.g. 70 ms for checker clicks).
- Two ports: `SoundPlayer` (adapter `@tavli/audio-expo`, expo-audio) and `Feedback` (haptics, adapter `@tavli/haptics-expo`). `appSound` follows Settings → Sound, `appFeedback` follows Settings → Haptics.
- `features/game/gameFeedback.ts` (`useGameFeedback`, used by `GameScreen`) reads the engine's event log after each store change: a roll plays `diceRoll`; a move plays `checkerPlace`, `checkerHit` (hit or pin) or `bearOff`; the next player's turn plays `turnStart`; the end plays `gameWin` or `matchWin`. An action the engine refuses plays `invalidMove`. So drag, tap, bot and replay all sound the same, and screens need no extra calls.
- UI-only events (`diceLand`, `checkerPickUp`) use the `event` function that `useGameFeedback` returns.
- The theme's sounds are preloaded when the game screen opens. Sounds mix with other apps' audio and follow the phone's silent switch.

## Moving checkers

- **Touch** a checker that can move: it gets a ring, and each legal target gets a dashed ring and a ghost checker where it would land (theme `highlights`). Targets come from the engine (`legalNextMoves`); the app never decides what is legal.
- **Drag and drop:** one pan gesture (Gesture Handler 3, `usePanGesture`, `minDistance: 0`). The drag runs on the UI thread: the picked-up checker follows the finger through shared values. Only the result (picked up, dropped at x, y) goes to the JS thread.
- **Tap-tap:** a touch that moves less than 8 pt is a tap. Tap a checker, then tap a target. A target wins over another movable checker on that point. A tap may miss a target by 22 pt (wireframe, iPhone SE). A swipe that does not start on a movable checker does nothing.
- A drop on the source cancels quietly. A drop anywhere else is illegal: the checker flies back in 160 ms, with the theme's `invalidMove` haptic. A drag the system cancels (a call, the app goes to the background) also flies back, with no move.
- **Hit-testing uses the drawing rects.** Sources and targets use `slotRect` (the same point rect that holds the triangle and the stack), the bar halves and the trays.
- **Flights:** a move flies the checker to its landing place (200 ms); a hit sends the hit checker to the bar a moment later; a pin (Plakoto) only flies the pinner. While a checker flies, the checker at its landing place is hidden. The move that ends a turn (auto-confirm) has no flight when the board turns to the next player.
- Two dice that reach the same target (bearing off): the lower die is used, so the higher one stays.
- Haptics from the theme: `checkerPickUp`, `checkerPlace`, `checkerHit`, `invalidMove`.
- **Tutorial props** (#128): `cue` rings every movable checker while none is selected ("touch this one"; `BoardHighlights.cues`, drawn like the selected ring). `onMissTap` reports a tap that missed every target after a checker was picked. Games use neither.
- Not built: the optional double-tap shortcut (it would delay every single tap), and the dashed "last move" arrow from the wireframes.

## Turn: undo, confirm, turn indicator

- **Controls row** (wireframes 6b–6f): one big Roll button before the roll; then **Undo · dice · Confirm**.
- **Undo** takes back the last single move (`undo` action); the checker flies back, and a hit checker comes back from the bar. Disabled (dashed) when there is nothing to undo.
- **Confirm** is enabled only when the engine says `canConfirm` (all dice used, or no move left). Then a hint shows: "All dice used. Confirm or undo."
- **Auto-confirm** (Settings, default off): each move is sent with `autoConfirm`, so the engine ends a complete turn at once.
- **Turn indicator:** the active player's strip gets a thick border and a pill: "YOUR TURN", "PLAYING" for the bot, or the player's name in pass-and-play ("MARIA'S TURN"). Pip counts follow the moves of the turn; Settings → Show pip counts hides them.
- **No legal moves:** the engine passes the turn by itself. The card says who rolled what and that the turn passes; the dice stay, faded. It closes on OK or after 3 s. Until then the board stays with the player who passed (flip). Asodio has two more titles: "Board locked" (the loading lock) and "Army frozen" (A6).
- **Game end** (`GameEndSheet`): a sheet over the final board, with a dim layer over the rest. Winner (or "The game is a draw"), Mono / Diplo chip (diplo filled; "Draw · 0 points" for a draw), a reason line ("Bob did not bear off any checker." for a diplo, "Maria resigned.", "No checker can ever move again." for an Asodio deadlock), the match box ("You 2 – 0 Bot", "First to 3 points"), **Next game** (the winner starts) and **Home** (a text button).
- **Match end:** no sheet for the last game. The final position stays for `MATCH_END_DELAY_MS` (1 s), so the last checker lands, then `GameScreen` calls `onMatchOver` and the route opens the match-end screen ([App shell](app-shell.md)). It waits while the screen is paused (menu or Settings on top).
- **Celebration** (`Celebration.tsx`): only when a person wins (`isHumanWin` in `gameFeedback.ts`, the same rule as the win jingle). Vs the bot, a bot win shows none. Fourteen confetti pieces fly out on one shared Reanimated value, and the icon pops (🎉 on game end, 🏆 on match end). With the system **Reduce motion** setting on (`useReducedMotion`), only the still icon shows. Screen readers skip it.
- **Screen readers:** the game-end sheet and the match-end screen announce the result when they show ("Ann wins the game! Diplo · +2 points … Ann 2 – 0 Bob"). The sheet is modal for VoiceOver (`accessibilityViewIsModal`). Titles are headers; every button has a label and is at least 44 pt tall.
- **Cards hide what they cover (#153).** While a card shows over the board (opening, pass, "Board locked", "Army frozen", mother question), screen readers skip the board layer (`game-board-layer`: `importantForAccessibility="no-hide-descendants"` and `accessibilityElementsHidden`), like the tutorial's mother card (#151). The strips, the menu button and the controls stay reachable (the opening card needs the Roll button). While the game-end sheet shows, or the menu or a resign dialog is open (`covered`, from `MatchScreen`), they skip the whole screen under it (`game-content`). The menu and dialogs are a `Modal` (`components/Sheet.tsx`). When a card or the game-end sheet opens, focus moves to its title (`useFocusOnShow`, `features/accessibility/focus.ts`, through `AccessibilityInfo.sendAccessibilityEvent`); the card is then announced as before. The cards over the board, the game-end sheet and `Sheet` scroll when a large font makes them taller than the space they have. The status notes over the board (loading lock, "Bot plays on.", "All dice used") sit outside the hidden layer, so screen readers still hear them. A new pass is a new card (`key={pass.key}`): focus moves again and it is read again. The game-end confetti is drawn outside the sheet's scroll view, so nothing clips it.
- **Check on a device (#153):** (1) the card title may be read twice: once by the focus move and once at the start of the announcement. We keep the full announcement, so nothing is lost if the focus move fails. (2) `Sheet` uses `maxHeight: '100%'` with a top inset margin; with a large font on Android edge-to-edge it may reach under the status bar. (3) Focus is not moved back when the menu, a dialog or the game-end sheet closes; check where VoiceOver and TalkBack land. (4) Focus moves with no delay; on iOS it may need a short one.
- The opening result closes after 1.5 s, or at once on a tap anywhere on the board.
- A rematch opens a new board screen, so the closed cards of the last match are forgotten.

### Differences from the wireframes

- The celebration is a small Reanimated effect, not a Lottie file (ADR-0005 says Lottie via Skia). It is a stand-in until the art task adds a Lottie win effect; the place and the "only a person's win" rule stay the same. The in-game menu is in [App shell](app-shell.md).
- No dashed "last move" arrow and no double-tap shortcut yet.
- The dice in the controls row are 40 pt (wireframe: about 44 pt), so Undo, the dice and Confirm fit on an iPhone SE.

## Accessibility

The Skia board takes no screen reader actions, so a screen reader user plays with buttons (#134). Code: `apps/mobile/src/features/accessibility/`.

- **Move list** (`MoveList.tsx`, `moveList.ts`): a row of buttons under the bottom strip, one per legal next move. The moves are the board's moves (`legal`, from `legalNextMoves`), so the list never decides what is legal. Two dice that reach the same target give one button, with the lower die (the tap-tap rule). The checker furthest back comes first.
- **Labels** use the mover's own point numbers, like the rest of the screen: "Checker from point 13 to point 8, hits", "From the bar to point 22", "Enter on point 22" (Asodio, from `outside`), "Bear off from point 6", ", pins" for a pin. The button shows the short form ("13 → 8 · hit"); the screen reader reads the full one. Strings are in `game.moveList` (en and el).
- A button plays the move like a tap-tap: same `playMove`, same auto-confirm, same flight (none before the board has its size). **Undo** and **Confirm** stay the normal buttons ("↶ Undo" reads "Undo"). The list hides while a card covers the board, during the bot's turn and when no move is left.
- **When it shows** (`screenReader.ts`): Settings → Accessibility → Move list. `auto` (default) shows it while a screen reader is on (`AccessibilityInfo.isScreenReaderEnabled` and the `screenReaderChanged` event); `on` shows it for everyone; `off` never.
- **Tutorial:** the lesson's own moves (`lessonMoves`) feed the list, so it offers only the moves the lesson teaches, and each lesson (Portes, Plakoto and Fevga, #149, Asodio, #159) can be finished with it.
- **Announcements** (`announceForAccessibility`, `features/game/announcements.ts`): after a roll, "Bob rolled 5-3." (or "You rolled 5-3."); after another player's turn, "Bob played: Checker from point 13 to point 8; …. Your turn." Vs the bot only the bot's turns are read; in pass-and-play every turn, for the next player. Each event has a key, so the same text is read again for a new roll. The opening card, the cards over the board (pass, mother question) and the game-end sheet read themselves (no more Android-only live regions), so nothing is read twice: the dice line skips the opening dice and a pass (the pass card says the roll).
- **Text size:** text follows the system font. No text has a line limit (`numberOfLines`) or sits in a fixed-height box. Only decorative glyphs in fixed circles (menu, gear, back, the "2P" badge, the opening "?") keep their size (`allowFontScaling={false}`, hidden from screen readers). `apps/mobile/test/textScaling.ts` checks these rules on Home, New game, the game screen, its cards (opening, pass, mother question), the game menu and a resign dialog, the game-end sheet and match end, in English and Greek.
- **Contrast:** `packages/ui/src/themes.test.ts` checks every text and background pair the app uses against WCAG AA (4.5:1). `textDisabled` was raised to `#A89274` (it was 3.1:1), so locked labels like "Coming soon" stay readable.

## Board flip

The theme numbers points from the view of the player at the bottom (the **viewer**). The engine numbers points in White's order. `boardModel.ts` maps each absolute point to the viewer's own number (`absoluteToOwn`). So the viewer always moves 24 → 1, with home at the bottom left. Turning the board to the other player is only a change of viewer: a left–right mirror, as the wireframes ask.

## Tests

- `geometry.test.ts` and `boardModel.test.ts`: the layout math (point → rect, stacks, badge, bar, trays, hit-testing) and the engine → slot mapping.
- `dice.test.ts`, `gameStore.test.ts`, `GameScreen.test.tsx`: the roll animation math, the dice layout, the store over the engine flow, and the dice and opening card on screen.
- `interaction.test.ts`: sources and targets on the drawing rects, tap and drop rules, flights for a move, a hit and an undo. `GameScreen.moves.test.tsx`: drag, tap-tap, an illegal drop and tap-to-roll through the screen.
- Jest fakes Gesture Handler with `apps/mobile/test/gestureHandlerMock.tsx`; `touch(testID, path)` drives the board's pan gesture like a finger.
- Jest fakes Reanimated with `apps/mobile/test/reanimatedMock.ts`: animations end at once and call their end callback. `Animated.View` is a plain view and `useAnimatedStyle` runs once. Spy on `useReducedMotion` to test reduce motion.
- `GameScreen.turn.test.tsx`: undo, confirm, auto-confirm, the turn indicator (flip and fixed), pip counts on and off, the pass card (OK and 3 s), the game-end sheet (diplo with reason, mono, celebration, announcement, Home), next game, and `onMatchOver` after the delay. `GameScreen.match.test.tsx` plays a whole match with taps only (to 1 by default; `FULL_MATCH=1` plays to 3) and ends on `onMatchOver`.
- Plakoto and Fevga: `boardModel.test.ts` (pins under their pinners, the Plakoto start, the Fevga start and its same-way movement, drawing and hit-testing in portrait and landscape), `interaction.test.ts` (a pin's ghost, landing and flights), `BoardScene.test.tsx` (pin rings, the Fevga start) and `botTurn.test.ts` (the bot plays on). `GameScreen.variants.test.tsx` plays a whole Plakoto game and a whole Fevga game with taps only, and tests the mother card (play on, resign, board label, vs bot both ways).
- Asodio: `asodio.test.ts` (the loading lock, the quarter lock and A6 with the owner edge cases #14–#17 and #19, the "to enter" stacks and their badge, the frozen marks, entering by tap with a 1-2 and a double, flights to and from the stack), `BoardScene.test.tsx` (the stack counts, the frozen shade). `GameScreen.asodio.test.tsx` plays two whole games with taps only (one ends in a deadlock draw and checks the game-end sheet, one is borne off), and tests the locked opening, entering four with 3-3 and undo, a 1-2, the frozen army card and labels, and the real Easy bot entering.
- Accessibility: `moveList.test.ts` (labels in en and el, one button per target, the order, the bar, bearing off, Asodio entering), `announcements.test.ts`, `GameScreen.moveList.test.tsx` (a whole Portes game and a Plakoto mother question with buttons only, `auto` with a screen reader, the announcements vs the bot), `TutorialScreen.test.tsx` (every lesson with the move list), `GameScreen.cards.test.tsx` (each card hides the board from screen readers and gives it back when it closes, focus moves to the card) and `textScaling.test.tsx`.
- `BoardScene.test.tsx`: a render smoke test. Jest replaces Skia with `apps/mobile/test/skiaMock.tsx`: every Skia component becomes a plain element, so the test counts what the board would draw.
- The `GameScreen.*.test.tsx` files run on fake timers (`runOnFakeTimers()` from `apps/mobile/test/clock.ts`). The screen closes the opening result, the pass card and the bot's answer note on timers, so on a real clock a busy machine could close a card before the test taps it (#152). The other tests that render the game screen do the same: `MatchScreen.test.tsx`, `src/navigation.test.tsx` and `textScaling.test.tsx` (#160).

## Screenshots

`pnpm --filter @tavli/mobile screenshots` renders PNGs into `apps/mobile/docs/screenshots/` with Skia's headless CanvasKit build (Vitest config in `apps/mobile/tools/screenshots/`). It draws the real `BoardScene` and dice. Each PNG must stay under 300 KB.

- `board-start.png`: the Portes start, White at the bottom.
- `board-midgame-black-view.png`: Black's view (flip): count badge, bar, tray.
- `play-moving.png`: a turn in progress (wireframe 6c): 13/7 played, the checker on 8 picked up, its target lit, the used 6 faded. The strips and buttons are React Native views, so they are not in the picture.
