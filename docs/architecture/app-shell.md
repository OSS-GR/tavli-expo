# App shell: Home, new game, local matches

> How the app starts a local match (vs bot or pass-and-play) and what the screens around the board do. Code: `apps/mobile/src/app/` (routes) and `apps/mobile/src/features/{home,new-game,match,bot}/`. Last review: 2026-10-26.

## Routes

| Route | File | Screen |
|-------|------|--------|
| Home | `app/index.tsx` | `features/home/HomeScreen.tsx` |
| New game | `app/new-game.tsx?mode=bot\|local` | `features/new-game/NewGameScreen.tsx` |
| Board | `app/game/[id].tsx` | `features/match/MatchScreen.tsx` (wraps `GameScreen`) |
| Rules (stub) | `app/rules/[variant].tsx` | a short text page |
| Settings | `app/settings.tsx` | `features/settings/SettingsScreen.tsx` |

- Screens get callbacks (`onNewGame`, `onExit`, …). Only the route files call `router`.
- **Start game** saves the choices (`lastSetup.ts`, per mode), starts a session and calls `router.replace` to the board. So "back" from the board goes Home, not to the form.
- The board route has `gestureEnabled: false`: an iOS edge swipe would fight the checker drag.
- An unknown id shows "This game could not be opened." with a Home button.
- Links and params live in `features/match/routes.ts` (`newGameHref`, `gameHref`, `parseModeParam`, `parseIdParam`).

## Local matches

- `features/match/setup.ts`: the new-game choices (`MatchSetup`): mode, game (Portes), match length 1 / 3 / 5 / 7 (default 3), bot level, names. `sanitizeSetup` turns any saved value into a valid setup.
- `features/match/sessions.ts`: a session is the setup plus a game store (`createGameStore`). MVP1 keeps **one** match at a time; `start` replaces the one before. Ids are `local-<time>-<random>`.
- Vs bot the human plays **White** (bottom), the bot **Black**. The board never flips.
- Names come from the setup, in the app language (`features/match/seats.ts`): "You" / "Bot · Easy", or the typed names with "Player 1" / "Player 2" as the default. The engine only stores labels (`enginePlayers`). Texts about the human use `_you` strings ("You win the game!").

## Pass-and-play (#35)

- Two optional names (max 16 characters, trimmed). Empty names show "Player 1" / "Player 2" in the app language, so they follow a language switch.
- **Board view** on the new-game screen edits Settings → Board view (`features/settings/BoardViewPicker.tsx`), so both screens agree and a change from the in-game menu applies at once. **Flip** (default) turns the board to the player to move after each Confirm; **Fixed** keeps White at the bottom. **Face-to-face** shows locked (owner: after MVP1).
- The pill on the active strip names the player ("Maria's turn"), as wireframe 6 asks.
- No "pass the phone" screen: wireframe 6e says pass-and-play has no locked state. After Confirm the board flips and the next player sees the Roll button with their name.
- Each player taps for their own opening die.
- Everything is local: no network call anywhere in a pass-and-play match.

## The bot turn

- The app reaches the bot only through the `BotRunner` port. `services.ts` wires `InlineBotRunner` and lists the levels the bot can play (`botLevels`, from `features/bot/levels.ts`): it asks the bot once and drops levels that throw `NOT_IMPLEMENTED`. Today only **Easy** works, so Medium and Hard show locked ("coming soon").
- `features/bot/botTurn.ts` plays one bot turn: wait 0.5 s, **roll** (the flow's `Rng` rolls), ask the runner and wait `thinkingDelayMs` at the same time (the short "forced" range when there is only one legal play), play the moves **one by one, 0.4 s apart**, then **confirm**. It sends the same actions as a human, so each move flies on the board.
- `GameScreen` starts the bot turn when nothing covers the board (opening result, pass card, end cards) and the screen is not paused. The menu and screens on top (Settings) pause it; `cancel()` clears the timers and cancels the runner. On resume the bot keeps moves that start its plan, or takes them back.
- During the bot turn the board takes no touches and the controls row is a locked box: "Bot's turn…", then the bot's dice and "Bot rolled 4-2 and is moving…".
- Opening roll vs bot: one tap rolls both dice. A bot that cannot move shows the pass card for 2 s ("Bot cannot move. Your turn." in the wireframe).

## In-game menu and resign

- The menu button sits left of the top strip. The menu is a bottom sheet (`components/Sheet.tsx`, a React Native `Modal`): Resign game, Resign match, How to play, Settings, Exit to home, Resume.
- Who resigns (`features/match/resign.ts`): the human vs the bot; in pass-and-play the player to move. Nobody can resign the game during the opening roll.
- The resign dialog shows what the engine would score (`resignGame`): diplo (2) if the resigner has borne off no checker, else mono (1), and the match score after it. **Resign** is outlined, **Keep playing** is the main button.
- Resign match ends the match at once (`resignMatch`).
- The game-end card has **Home**; the match-end card has **Change settings** (new-game screen of the same mode, filled with the last choices) and **Home**.

## Differences from the wireframes

- The menu is a `Modal` sheet inside the board route, not a `menu.tsx` form-sheet route. So the board route stays `app/game/[id].tsx`, and Settings from the menu is a push, not a modal.
- Match end is still a card over the board, not `match-end.tsx`.
- Home has no board art yet (art task); the art area shows the tagline.
- "Play vs bot" says "Easy for now. Medium is coming soon." until Medium works.
- No "Continue game" card yet (#36), and no "Start a new game? Your saved game will end." dialog yet.

## Tests

- `features/bot/botTurn.test.ts`: the bot turn with a fake `BotRunner` (roll, moves, confirm, timing with fake timers, forced think time, cancel, resume, errors).
- `features/bot/levels.test.ts`: the level check.
- `features/match/match.test.ts`: setup, seats, routes and params, last choices, sessions, resign.
- `HomeScreen.test.tsx`, `NewGameScreen.test.tsx`, `MatchScreen.test.tsx`: the screens (vs bot turn, pause while the menu is open, resign game and match, pass-and-play names).
- `src/navigation.test.tsx`: the real routes with `expo-router/testing-library` (Home → New game → board → Home, the `mode` param, an unknown id). It replaces the library's own Reanimated mock with ours.
