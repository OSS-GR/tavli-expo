# App shell: Home, new game, local matches

> How the app starts a local match (vs bot or pass-and-play) and what the screens around the board do. Code: `apps/mobile/src/app/` (routes) and `apps/mobile/src/features/{home,new-game,match,bot}/`. Last review: 2026-10-27.

## Routes

| Route | File | Screen |
|-------|------|--------|
| Home | `app/index.tsx` | `features/home/HomeScreen.tsx` |
| New game | `app/new-game.tsx?mode=bot\|local` | `features/new-game/NewGameScreen.tsx` |
| Board | `app/game/[id]/index.tsx` | `features/match/MatchScreen.tsx` (wraps `GameScreen`) |
| Match end | `app/game/[id]/match-end.tsx` | `features/match/MatchEndScreen.tsx` |
| Rules (stub) | `app/rules/[variant].tsx` | a short text page |
| Settings | `app/settings.tsx` | `features/settings/SettingsScreen.tsx` |
| First launch | `app/welcome/language.tsx`, `app/welcome/privacy.tsx` | `features/welcome/` |

- **Welcome gate (#61, #116).** `app/_layout.tsx` wraps the routes in two `Stack.Protected` groups on the consent answer. Until the user answers, every app route redirects to `/welcome/language`, so a deep link or a restored route cannot skip consent. After the answer, the welcome routes redirect to Home. **A new route file must be listed in the app group**; `features/welcome/welcomeFlow.test.tsx` fails until it is.
- Screens get callbacks (`onNewGame`, `onExit`, …). Only the route files call `router`.
- **Start game** saves the choices (`lastSetup.ts`, per mode), starts a session and calls `router.replace` to the board. So "back" from the board goes Home, not to the form.
- The board route has `gestureEnabled: false`: an iOS edge swipe would fight the checker drag.
- An unknown id shows "This game could not be opened." with a Home button (`MissingGame.tsx`), on the board and on match end.
- Links and params live in `features/match/routes.ts` (`newGameHref`, `gameHref`, `matchEndHref`, `parseModeParam`, `parseIdParam`).

## Local matches

- `features/match/setup.ts`: the new-game choices (`MatchSetup`): mode, game (Portes), match length 1 / 3 / 5 / 7 (default 3), bot level, names. `sanitizeSetup` turns any saved value into a valid setup.
- `features/match/sessions.ts`: a session is the setup plus a game store (`createGameStore`). MVP1 keeps **one** match at a time; `start` replaces the one before. Ids are `local-<time>-<random>`.
- Vs bot the human plays **White** (bottom), the bot **Black**. The board never flips.
- Names come from the setup, in the app language (`features/match/seats.ts`): "You" / "Bot · Easy", or the typed names with "Player 1" / "Player 2" as the default. The engine only stores labels (`enginePlayers`). Texts about the human use `_you` strings ("You win the game!").

## Save and resume (#36)

- One save slot (`savedMatch` key) in the `Storage` port (MMKV). `features/match/savedMatch.ts` writes `{ v, flowSchema, id, setup, savedAt, log }` as JSON.
- **Load = replay.** `parseSavedMatch` checks the versions (`SAVE_VERSION`, the engine's `MATCH_FLOW_SCHEMA_VERSION`) and rebuilds the flow with the engine's `replay(log)`, which checks every event again. The log holds every die, so no RNG is needed. Anything wrong (bad JSON, another version, an edited log, setup and log that differ) gives `broken`: the save is removed and never throws.
- `features/match/sessions.ts` saves when a match starts and each time the flow comes to rest (`isRestPoint`: awaiting a roll, the opening roll, or game over). So a confirmed turn, a pass, a game end, the next game and a rematch all save. Moves in the middle of a turn wait for Confirm.
- `saveNow()` saves at once, mid-turn too: when the app leaves the foreground (`useSaveOnBackground` in `app/_layout.tsx`) and on **Exit to home**.
- A finished match is removed from the slot. A rematch is saved as a new match (a new log, the same id).
- A save that fails (a storage error) only logs a warning. The move stays played, and the next save tries again.
- After an app restart, `get(id)` loads the save into a new game store (`createGameStore({ flow })`); new dice come from a new local RNG. A saved bot level this build cannot play becomes Easy.
- **Home** reads the slot each time it shows (`useFocusEffect`). With a save it shows **Continue game**: game, opponent, score, target and time since the save ("12 min ago"). A broken save shows the toast "Your saved game could not be opened." once.
- **New game** with a save: Start asks "Start a new game? Your saved game will end." (Start new / Cancel).

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
- The game-end sheet has **Next game** and **Home** (the match is saved, so Home shows Continue game).

## Match end (#33)

- The wireframes make match end a route, and the route map says the board opens it with `router.replace`, so "back" does not return to a finished board. So the board route is now a folder: `app/game/[id]/index.tsx` and `app/game/[id]/match-end.tsx`. Game end stays a sheet inside the board screen, so the final position stays visible.
- When the match ends (the last game, a resigned game that reaches the target, or Resign match), `GameScreen` waits 1 s and calls `onMatchOver`. The board route calls `router.replace(matchEndHref(id))`.
- The finished match is not in the save slot any more, so the match-end route finds the session in memory (`matchSessions.get`). It reads the match once, when it opens. After an app restart it is gone: "This game could not be opened." with Home. A match that is not over redirects to the board.
- `MatchEndScreen` (wireframe 9): the cup and confetti when a person wins (none when the bot wins), the title ("You won the match!", "Bot wins the match!", "Maria wins the match!"), "You resigned." when someone resigned, the big final score "3 – 1" with the names under it, "Portes · vs Bot (Easy) · first to 3" (`matchLabel` in `summary.ts`), and one row per game: winner, **Mono / Diplo** chip and points. Each row and the score are one element for screen readers ("Game 3, You won, Diplo, 2 points"). The result is announced when the screen opens.
- **Rematch** (main button, "Same settings · you start"): the engine's `createRematch` says who starts (owner rule: the last winner, no opening roll). The route calls the store's `rematch()` and `router.replace` back to the board.
- **Change settings** ends the session and opens the new-game screen of the same mode, filled with the last choices. **Home** ends the session and goes Home (no Continue card: the match is over).
- The win jingle (`matchWin`, `useGameFeedback`) plays on the board when the match ends. The match-end screen adds no sound.

## Differences from the wireframes

- The menu is a `Modal` sheet inside the board route, not a `menu.tsx` form-sheet route. So the board folder has no `menu.tsx`, and Settings from the menu is a push, not a modal.
- The celebration is a small Reanimated effect, not Lottie (see [Board screen](board-screen.md)).
- Home has no board art yet (art task); the art area shows the tagline.
- "Play vs bot" says "Easy for now. Medium is coming soon." until Medium works.
- A broken save on the board route shows the "could not be opened" card (not a dialog), with a Home button.
- The game also saves mid-turn when the app goes to the background or the user exits (the wireframe accepts losing those moves; we keep them).

## Tests

- `features/bot/botTurn.test.ts`: the bot turn with a fake `BotRunner` (roll, moves, confirm, timing with fake timers, forced think time, cancel, resume, errors).
- `features/bot/levels.test.ts`: the level check.
- `features/match/match.test.ts`: setup, seats, routes and params, last choices, sessions, resign.
- `HomeScreen.test.tsx`, `NewGameScreen.test.tsx`, `MatchScreen.test.tsx`: the screens (vs bot turn, pause while the menu is open, resign game and match, pass-and-play names).
- `MatchEndScreen.test.tsx`: the win with every game row, the celebration and the announcement; Rematch, Change settings and Home; a lost match (no celebration, the bot starts the rematch); a resigned match; pass-and-play names; reduce motion; Greek.
- `features/match/save.test.ts`: the save format (round trip, ten kinds of bad data dropped), when it saves, clearing a finished match, resume after a restart, the Continue texts and the background hook.
- `src/navigation.test.tsx`: the real routes with `expo-router/testing-library` (Home → New game → board → Home → Continue, the replace dialog, the `mode` param, an unknown id, a broken save; match end → Rematch → match end → Change settings, and match end → Home with no Continue card). It replaces the library's own Reanimated mock with ours.
