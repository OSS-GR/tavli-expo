# App shell: Home, new game, local matches

> How the app starts a local match (vs bot or pass-and-play) and what the screens around the board do. Code: `apps/mobile/src/app/` (routes) and `apps/mobile/src/features/{home,new-game,match,bot,rules,tutorial,history}/`. Last review: 2026-10-27.

## Routes

| Route | File | Screen |
|-------|------|--------|
| Home | `app/index.tsx` | `features/home/HomeScreen.tsx` |
| New game | `app/new-game.tsx?mode=bot\|local` | `features/new-game/NewGameScreen.tsx` |
| Board | `app/game/[id]/index.tsx` | `features/match/MatchScreen.tsx` (wraps `GameScreen`) |
| Match end | `app/game/[id]/match-end.tsx` | `features/match/MatchEndScreen.tsx` |
| Rules | `app/rules/[variant].tsx` | `features/rules/RulesScreen.tsx` |
| Settings | `app/settings.tsx` | `features/settings/SettingsScreen.tsx` |
| History | `app/history.tsx` | `features/history/HistoryScreen.tsx` |
| Tutorial | `app/tutorial.tsx?from=home\|rules\|settings&game=portes\|plakoto\|fevga\|asodio` | `features/tutorial/TutorialScreen.tsx` |
| First launch | `app/welcome/language.tsx`, `app/welcome/privacy.tsx` | `features/welcome/` |

Settings sections: Game (auto-confirm, pip counts, board view, **Bot speed**: Slow, Normal, Fast), Sound and feel, Language, Board (board theme), Look (app colors), Accessibility (**Move list**: Automatic, On, Off; Automatic shows it while a screen reader is on, see [Board screen](board-screen.md#accessibility)), Help, History (**Match history**, **Clear history**) and Privacy. Every change saves at once.

- **Welcome gate (#61, #116).** `app/_layout.tsx` wraps the routes in two `Stack.Protected` groups on the consent answer. Until the user answers, every app route redirects to `/welcome/language`, so a deep link or a restored route cannot skip consent. After the answer, the welcome routes redirect to Home. **A new route file must be listed in the app group**; `features/welcome/welcomeFlow.test.tsx` fails until it is.
- Screens get callbacks (`onNewGame`, `onExit`, …). Only the route files call `router`.
- **Start game** saves the choices (`lastSetup.ts`, per mode), starts a session and calls `router.replace` to the board. So "back" from the board goes Home, not to the form.
- The board route has `gestureEnabled: false`: an iOS edge swipe would fight the checker drag.
- An unknown id shows "This game could not be opened." with a Home button (`MissingGame.tsx`), on the board and on match end.
- Links and params live in `features/match/routes.ts` (`newGameHref`, `gameHref`, `matchEndHref`, `parseModeParam`, `parseIdParam`).

## Rules pages (#112, #124)

- `/rules/portes`, `/rules/plakoto`, `/rules/fevga` and `/rules/asodio` each show a full page. `/rules/tavli` explains the match rotation and links to its three games (`TAVLI_GAMES`; Asodio is not in the rotation). Any other id says there are no rules.
- Opened from Home (**How to play**), the in-game menu (**How to play Plakoto**: the game on the board, in Tavli the game of the rotation) and New game (the **i** button on each game card). Only the route files call `router`.
- `features/rules/content.ts` lists each page's sections in reading order: goal, start position, dice and turns, how checkers move, hitting / pinning / no hitting, the special rules (Plakoto mother, Fevga first checker and six-in-a-row bans, Asodio entering and the loading lock, quarter by quarter, the draw), bearing off and points. Shared sections (`rules.common.*`) appear on every page; a game can add its own line to a shared section (for example Plakoto: no bearing off while pinned).
- The texts live in one i18n group, `rules.*`. Each body is a few short lines split by `\n`; each line shows as one bullet paragraph. Greek uses tavli words: πόρτα, πλάκωμα, μάνα, εξάπορτο, μάζεμα, μονό / διπλό, βαθμοί.
- The texts describe the **default presets** only (`DEFAULT_PRESET_BY_GAME`): Plakoto `motherRule: "offerConcede"` (resign for diplo or play on; both mothers pinned is a draw), Fevga runner rule to pass the opponent's mother and the prime bans P1, P2 (points 6–11) and P3, Asodio `asodio.kafeneio` (A1–A6: a 1-2 or a double opens the board, a double enters four, entered checkers wait until all 15 are in, the quarter lock, pins, no bearing off while pinned, a deadlock is a draw). When a default flag changes, update the page.
- The start position is a small `StaticBoard` (60% of the width, at most 240 pt, the theme's aspect ratio) built from the engine's start layouts and the preset's direction, with White (light checkers) at the bottom. It is one image for screen readers ("The board at the start of Fevga"). The Asodio picture is an empty board with both "to enter" stacks (15 each).
- Every section title is a header. Nothing has a fixed height, so the page works at large text sizes, and it scrolls.
- Each game's page starts with **Learn to play on the board**, which opens that game's lessons (#128, #149, #159). The Tavli page has none.

## Tutorial (#128)

A one-minute lesson in Portes on the real board, before the first game.

- **Where it opens.** After the welcome flow, Home shows a **Learn to play** card (`features/home/LearnCard.tsx`) under the Continue card: **Start the lesson** and **Not now**. The card shows until the tutorial is finished or dismissed. It always opens again from Settings → Help → **Learn to play** and from the top of the Portes rules page (**Learn to play on the board**). The `from` param says where it was opened (for `tutorial_started`).
- **Settings → Help (#159).** **Learn to play ›** opens a sheet (`features/tutorial/TutorialSettings.tsx`, in the shared `Sheet`) with one button per game: Portes, Plakoto, Fevga, Asodio (`TUTORIAL_GAMES` in `features/match/routes.ts`, names from `games.*`), and **Cancel**. A pick closes the sheet and pushes `tutorialHref('settings', game)`. The sheet scrolls, so it fits a small phone with a large font.
- **Lessons** (`features/tutorial/lessons.ts`), each on a fixed position with fixed dice, in the `portes` preset, White (you) at the bottom:
  1. `move`: one checker, one die (13 → 9 with the 4).
  2. `bothDice`: one checker with both dice (5 and 3).
  3. `double`: 3-3 moves four times.
  4. `makePoint`: two checkers to point 7 make a door, which blocks the opponent.
  5. `hit`: hit Black's lone checker on 9.
  6. `enter`: enter from the bar (the 5 lands on a door; the 3 enters).
  7. `bearOff`: bear off the last two checkers.
- **Plakoto, Fevga (#149) and Asodio (#159) lessons.** Four short lessons each, on what is new after Portes. They open from the top of each game's rules page (**Learn to play on the board**, `?game=plakoto`, `?game=fevga` or `?game=asodio`; no `game` param = Portes) and from Settings → Help. Each lesson plays in its game's default preset (`lessonRules`: `DEFAULT_PRESET_BY_GAME`, so Asodio is `asodio.kafeneio`), so the rules are those of a real game.
  - Plakoto: `pin` (pin Black's lone checker on 9; no bar), `pinned` (your checker on 16 is pinned and cannot move; move another), `mother` (pin Black's mother on your point 1), `plakotoBearOff` (bear off, none pinned). After the mother pin, the "resign or play on" card of the app default (`offerConcede`) shows over the board (`MotherLessonCard`, the game's `GameCard` with the same two buttons). It is the opponent's card, so a tap only says what that answer does. The card scrolls when it is taller than the board (small phone, large font), and screen readers skip the board under it.
  - Fevga: `sameWay` (the start in opposite corners; run the first checker with both dice), `holdPoint` (one dark checker holds point 6, so the 4 is blocked), `runner` (13 → 11 passes Black's start, then a checker leaves 24), `sixInARow` (a 5 from 24 would fill points 19 to 24, so only the 6 is played; `fevga.md` edge case 12).
  - Asodio (owner version, `asodio.md`): `aceDeuce` (all 15 wait off the board; the 1-2 opens it and enters on 24 and 23), `enterAll` (3-3 enters the last four on 22; the checkers on the board wait while one is still off, A1 and A2), `quarterLock` (14 checkers on 14 to 18 are frozen behind the last one on 20; move it up, then any checker moves), `pinLast` (pin Black's last checker alone on your 10; Black's whole army is frozen, A6). The board marks frozen checkers as in a game (`asodioMarks`).
  - The end card offers **Play Plakoto** / **Play Fevga** / **Play Asodio** (`/new-game?mode=bot&first=plakoto`: that game vs the Easy bot).
- **No RNG, no second rule book.** `startLesson` builds a `GameFlow` from the lesson's board and rolls the lesson's dice (`roll` with `dice`). The board offers the engine's `legalNextMoves`, filtered to the moves the lesson teaches (`lessonMoves`). So the board lights up only the checker to touch (`InteractiveBoard` `cue`), and after a tap only the right target. Taps and drags work as in a game.
- **Each lesson**: a title, one line of text, the lit checker; a wrong touch (a tap on another checker, a miss after picking the checker, a drop on a wrong place) shakes the text and shows a hint, with the `invalidMove` haptic. After success: a success line and **Next**. **Skip** is always in the top bar. "Lesson 2 of 7" shows the progress.
- **End card**: "You know the basics!", **Play your first game** (replaces the tutorial with `/new-game?mode=bot&first=1`: Portes vs the Easy bot, whatever was chosen last; `firstGameSetup` in `setup.ts`) and **Home**.
- **State** (`features/tutorial/progress.ts`): `new`, `dismissed` (Not now, or Skip) or `done`, per lesson set, saved as `{ version, status }` in the `Storage` port: Portes under the key `tutorial` (as before #149), the others under `tutorial.plakoto`, `tutorial.fevga` and `tutorial.asodio` (#159). A new game only adds a key, so the keys saved before it still load. The store keeps Portes in `status` (the Home card offers only Portes) and the others in `variants`. It never leaves the phone, so it needs no consent. It is apart from Settings, so a settings reset does not bring the card back. `done` never goes back to `dismissed`.
- **Analytics** (`tutorialAnalytics.ts`): `tutorial_started`, `tutorial_step`, `tutorial_finished`, `tutorial_skipped`, each with the lesson set (`game`), through the `Analytics` port, so only after **Allow usage data**. An analytics error is logged and dropped. See [Analytics events](analytics-events.md).
- **Accessibility.** Titles are headers. The board's label says what the lesson asks ("Your checker on point 13 is lit. … Move it 4 points, to point 9."). The hint and the success line are a live region and are announced. With **Reduce motion** on there is no shake and no checker flight; the hint still shows.
- No swipe back on the tutorial route (`gestureEnabled: false`), like the board: it would fight the drag. Skip goes back where it came from (Home after a deep link).

## Local matches

- `features/match/setup.ts`: the new-game choices (`MatchSetup`): mode, game (default Portes, see [Choosing the game](#choosing-the-game-109)), match length 1 / 3 / 5 / 7 (default 3), bot level, names. `sanitizeSetup` turns any saved value into a valid setup: a game that is locked in this mode becomes Portes, a bot level the game has no bot for becomes the easiest one it has.
- `features/match/sessions.ts`: a session is the setup plus a game store (`createGameStore`, with `rules: gameRuleSet(setup.game)`). MVP1 keeps **one** match at a time; `start` replaces the one before. Ids are `local-<time>-<random>`.
- Vs bot the human plays **White** (bottom), the bot **Black**. The board never flips.
- Names come from the setup, in the app language (`features/match/seats.ts`): "You" / "Bot · Easy", or the typed names with "Player 1" / "Player 2" as the default. The engine only stores labels (`enginePlayers`). Texts about the human use `_you` strings ("You win the game!").

## Choosing the game (#109)

- The game picker on New game lists the games that are open as radio cards: **Portes**, **Plakoto**, **Fevga**, **Tavli** (all three in rotation) and **Asodio**. Default: Portes, or the last game chosen in this mode. Locked games are dashed chips; a tap shows the toast "Coming soon: Asodio".
- Each game uses its engine preset (`gamePreset`, `gameRuleSet` in `setup.ts`):
  - Portes, Plakoto, Fevga, Asodio: a **one-game match**. Asodio uses the owner version, `asodio.kafeneio`. The engine's Plakoto and Fevga presets keep the shared rotation Portes → Plakoto → Fevga, so the app sets `match.rotation` to the one game ("single game" in `tavli-match.md`).
  - Tavli: the `tavli` preset, Portes → Plakoto → Fevga → Portes → … Each game uses its own default preset and the match flags of `tavli`; the engine scores every game the same way (mono 1, diplo 2) per `docs/rules/tavli-match.md`.
- **When a game is locked** (`isGameOpen`): when the engine or the board cannot play every game of its rotation (`isGameBuilt` checks the engine registry and `BOARD_GAMES` in `features/match/setup.ts`; since #124 every game is built), and, vs bot, when the bot has no level for it. Pass-and-play needs no bot, so every built game is open there.
- **Bot levels per game** (`features/bot/levels.ts`, `botLevelsByGame`): for each variant the app asks the bot `supportedLevels(variant)` (bots from `createBot` have it), or else plays a probe turn from that variant's start at each level and drops the levels that throw `NOT_IMPLEMENTED`. Tavli gets the levels that work in all three games, because one match has one bot level. `services.ts` keeps the result in `botLevels` (a `GameLevels` record). A new bot variant or level shows up by itself when the bot package gets it.
- Each game card has an **i** button that opens its rules page (`/rules/<game>`) without choosing the game.
- The level control shows the levels of the chosen game. Switching to a game without the chosen level shows that level locked and plays the easiest level; switching back brings the choice back.
- The board shows which game is being played, in a line under the top strip: "Game 2 · Plakoto" (`currentGameLabel` in `summary.ts`). It stays on the finished game until **Next game**. The menu's **How to play** opens the rules of the game on the board.
- The game-end sheet names the next game: "Next: game 3 · Fevga" (`nextGameLabel`). The match-end rows name each game: "Game 2 · Plakoto".

## Save and resume (#36)

- One save slot (`savedMatch` key) in the `Storage` port (MMKV). `features/match/savedMatch.ts` writes `{ v, flowSchema, id, setup, savedAt, log }` as JSON.
- **Load = replay.** `parseSavedMatch` checks the versions (`SAVE_VERSION`, the engine's `MATCH_FLOW_SCHEMA_VERSION`) and rebuilds the flow with the engine's `replay(log)`, which checks every event again. The log holds every die, so no RNG is needed. Anything wrong (bad JSON, another version, an edited log, setup and log that differ) gives `broken`: the save is removed and never throws.
- `features/match/sessions.ts` saves when a match starts and each time the flow comes to rest (`isRestPoint`: awaiting a roll, the opening roll, or game over). So a confirmed turn, a pass, a game end, the next game and a rematch all save. Moves in the middle of a turn wait for Confirm.
- `saveNow()` saves at once, mid-turn too: when the app leaves the foreground (`useSaveOnBackground` in `app/_layout.tsx`) and on **Exit to home**.
- A finished match is removed from the slot. A rematch is saved as a new match (a new log, the same id).
- The game (#109) is `setup.game`. The save shape did not change, so `SAVE_VERSION` stays 1: older saves always held `game: 'portes'`, and a save with no game loads as Portes. `parseSavedMatch` checks that the game is built and that the log's rules are that game's preset and rotation; else the save is `broken`. A saved game the bot cannot play any more keeps its game (the log already holds it) and plays the easiest level.
- A save that fails (a storage error) only logs a warning. The move stays played, and the next save tries again.
- After an app restart, `get(id)` loads the save into a new game store (`createGameStore({ flow })`); new dice come from a new local RNG. A saved bot level this build cannot play becomes Easy.
- **Home** reads the slot each time it shows (`useFocusEffect`). With a save it shows **Continue game**: game, opponent, score, target and time since the save ("12 min ago"). A broken save shows the toast "Your saved game could not be opened." once.
- **New game** with a save: Start asks "Start a new game? Your saved game will end." (Start new / Cancel).

## History (#142)

The player's past local matches and simple stats, offline.

- **Records** (`features/history/records.ts`). `sessions.ts` adds one record through its `history` dep (`appSessions.ts` wires `historyStore`):
  - when a match is over (`end: 'finished'`): won to the target, a resigned game that reaches it, a game lost on time that reaches it (`timedOutBy`, #170), or **Resign match** (`resignedBy`). Once per match: a rematch in the same session is a new record. The id is `<session id>@<time>`.
  - when a new match replaces one that had started (`end: 'abandoned'`, no winner), in memory or only in the save slot after a restart. "Started" (`hasStarted`): a game finished, or someone rolled for a turn or moved. The opening roll alone does not count. A match left before that gets no record.
  - when `get(id)` loads a saved match while another one is in memory (rare: that one's save failed). The one in memory is left: `abandoned` and `game_abandoned`.
- **Stale saves** (#150): a match is named by its session id and its `matchNumber` (1, then +1 per rematch). The save slot and every record carry it. A save of a match the history already holds (`hasMatchRecord`) is stale: the match finished but the app died before the slot was cleared, or it was left but the slot could not be removed. No time is compared, so a phone clock set back cannot make a live rematch save look stale. `peek()` and `get(id)` treat a stale save as no save (not on Home, not loaded, not recorded again) but never delete it; `start()` and `end(id)` do. Saves and records from before #150 have no number (`null`) and are never stale.
- A record holds: `id`, `endedAt`, `mode`, `game`, `botLevel` (vs bot; `null` in pass-and-play), `names` (pass-and-play names as typed), `targetPoints` (any positive whole number loads, so old records stay; the row shows it as it is, and only the setup used for labels falls back to the default length), the final `score`, `end`, `winner`, `resignedBy`, `timedOutBy` (the loser, when the last game ended on time and that ended the match; `timedOutBy` in `features/match/summary.ts`; `null` in records from before #170), the number of `games`, `diploWins` per player (games won with 2 points or more, mars), drawn games (`draws`) and `matchNumber`. "2 or more" is right because every game the app offers uses Tavli scoring: a single is 1 point and every double is 2 (no checker off, a pinned mother, a resign or timeout in such a position). Only `backgammonScores3` gives 3, and that is a double too. A test checks the scoring of every game; Acey-Deucey `perChecker` scoring would need a new rule.
- **Storage**: `{ v: 1, records }` JSON under the key `history` in the `Storage` port, newest first, at most 200 (`MAX_HISTORY_RECORDS`). Loading keeps the stored order (no sort by time, so a clock set back does not reorder the list). It never leaves the phone, so it needs no consent. The save slot of the match in play (`savedMatch`) did not change. Bad JSON or another version reads as an empty history; a bad record is dropped (also a time that makes no valid date), and of two records with one id the newest stays. A storage error, or a history error inside `dispatch`, only logs.
- **Screen** (`/history`, header shown, in the app group of `_layout.tsx`). With no record: "No matches yet" and **Play** (New game vs bot). Else **Stats**, then **Matches**, newest first. Each row is one element for screen readers: "Portes · vs Bot (Easy), You 3 – 1 Bot · first to 3, Won, Oct 27, 2026". After Resign match the score part says who resigned: "You 0 – 2 Bot · first to 3 · you resigned" (#181). The badge is **Won** / **Lost** vs the bot, "Maria won" in pass-and-play, **Not finished** for a left match. A match lost on time says so: "Won on time", "Lost on time", "Maria won on time" (#170). The date uses the phone locale when it speaks the app language (`dateLocale`), else the app language.
- **Stats** (`features/history/stats.ts`), per game (Portes, Plakoto, Fevga, Tavli, Asodio; only games with a match) and per bot level: played (finished and left), won, lost, win rate (`won / (won + lost)`, whole percent of finished matches, "—" before one is won or lost), diplo (mars) wins and draws. A left match is neither won nor lost ("Not finished"), so it does not change the win rate. A drawn game counts on its own, not as a loss. Pass-and-play has no "you", so its line has only played and draws.
- **Entry points**: a small **History** link on Home under **How to play**, and Settings → History: **Match history ›** and **Clear history**, which asks first (Clear / Cancel). Clear is off while the history is empty.
- No numbers in fixed boxes and no line limits: `textScaling.test.tsx` checks the screen.
- **Known limits.** A match the player leaves and never replaces (it stays in the save slot) gets no record. A record that fails to save (a storage error) stays in memory and goes into the next save, but is lost if the app closes first; there is no retry.

## Pass-and-play (#35)

- Two optional names (max 16 characters, trimmed). Empty names show "Player 1" / "Player 2" in the app language, so they follow a language switch.
- **Board view** on the new-game screen edits Settings → Board view (`features/settings/BoardViewPicker.tsx`), so both screens agree and a change from the in-game menu applies at once. **Flip** (default) turns the board to the player to move after each Confirm; **Fixed** keeps White at the bottom. **Face-to-face** shows locked (owner: after MVP1).
- The pill on the active strip names the player ("Maria's turn"), as wireframe 6 asks.
- No "pass the phone" screen: wireframe 6e says pass-and-play has no locked state. After Confirm the board flips and the next player sees the Roll button with their name.
- Each player taps for their own opening die.
- Everything is local: no network call anywhere in a pass-and-play match.

## The bot turn

- The app reaches the bot only through the `BotRunner` port. `services.ts` wires `InlineBotRunner` and lists the levels the bot can play per game (`botLevels`, from `features/bot/levels.ts`, see [Choosing the game](#choosing-the-game-109)). Today Easy and Medium work in Portes, Plakoto, Fevga and Asodio (the Asodio heuristic, #125), and Hard works in all four (a trained net per game, #147, #156 and #164). So Tavli, which needs a level in all three of its games, has Hard too. No level shows locked with the real bot; the locked ("coming soon") state stays for a bot that lacks a level.
- `features/bot/botTurn.ts` plays one bot turn: wait, **roll** (the flow's `Rng` rolls), ask the runner and wait `thinkingDelayMs` at the same time (the short "forced" range when there is only one legal play; right after its own roll, never before the dice have landed), play the moves **one by one**, with a short extra pause after a hit, then **confirm** once the last checker has landed. Settings → Bot speed (Slow, Normal, Fast) picks the timings; see [Bot turn timing](board-screen.md#bot-turn-timing-172). It sends the same actions as a human, so each move flies on the board.
- `GameScreen` starts the bot turn when nothing covers the board (opening result, pass card, end cards) and the screen is not paused. The menu and screens on top (Settings) pause it; `cancel()` clears the timers and cancels the runner. On resume the bot keeps moves that start its plan, or takes them back.
- During the bot turn the board takes no touches and the controls row is a locked box: "Bot's turn…", then the bot's dice and "Bot rolled 4-2 and is moving…".
- Opening roll vs bot: one tap rolls both dice. A bot that cannot move shows the pass card for 3.5 s, or until you tap OK ("Bot cannot move. Your turn." in the wireframe). Your own pass card waits for OK; the bot starts its turn after that (#178).

## In-game menu and resign

- The menu button sits left of the top strip. The menu is a bottom sheet (`components/Sheet.tsx`, a React Native `Modal`): Resign game, Resign match, How to play, Settings, Exit to home, Resume.
- Who resigns (`features/match/resign.ts`): the human vs the bot; in pass-and-play the player to move. Nobody can resign the game during the opening roll.
- The resign dialog shows what the engine would score (`resignGame`): diplo (2) if the resigner has borne off no checker, else mono (1), and the match score after it. **Resign** is outlined, **Keep playing** is the main button.
- Resign match ends the match at once (`resignMatch`). The score stays as it is: finished games count, the game in play gives nothing, and the opponent does not get the target (`docs/rules/tavli-match.md`, "Resigning", #181).
- After a resigned game the game-end sheet says why it gives these points: "Diplo: you resigned before you bore off a checker." or "Mono: you resigned the game."
- The game-end sheet has **Next game** and **Home** (the match is saved, so Home shows Continue game).

## Match end (#33)

- The wireframes make match end a route, and the route map says the board opens it with `router.replace`, so "back" does not return to a finished board. So the board route is now a folder: `app/game/[id]/index.tsx` and `app/game/[id]/match-end.tsx`. Game end stays a sheet inside the board screen, so the final position stays visible.
- When the match ends (the last game, a resigned game or a game lost on time that reaches the target, or Resign match), `GameScreen` waits 1 s and calls `onMatchOver`. The board route calls `router.replace(matchEndHref(id))`.
- The finished match is not in the save slot any more, so the match-end route finds the session in memory (`matchSessions.get`). It reads the match once, when it opens. After an app restart it is gone: "This game could not be opened." with Home. A match that is not over redirects to the board.
- `MatchEndScreen` (wireframe 9): the cup and confetti when a person wins (none when the bot wins), the title ("You won the match!", "Bot wins the match!", "Maria wins the match!"), "You resigned the match." / "Maria resigned the match." after Resign match (#181), "Bot ran out of time." when the last game ended on a time-out (#170, not after **Resign match**), the big final score "3 – 1" with the names under it, "Portes · vs Bot (Easy) · first to 3" (`matchLabel` in `summary.ts`), and one row per game: the game ("Game 2 · Plakoto"), winner ("Bot won on time" for a game lost on time), **Mono / Diplo** chip and points. Each row and the score are one element for screen readers ("Game 3 · Fevga, You won, Diplo, 2 points"). The result is announced when the screen opens.
- **Rematch** (main button, "Same settings · you start"): the engine's `createRematch` says who starts (owner rule: the last winner, no opening roll). The route calls the store's `rematch()` and `router.replace` back to the board.
- **Change settings** ends the session and opens the new-game screen of the same mode, filled with the last choices. **Home** ends the session and goes Home (no Continue card: the match is over).
- The win jingle (`matchWin`, `useGameFeedback`) plays on the board when the match ends. The match-end screen adds no sound.

## Differences from the wireframes

- The menu is a `Modal` sheet inside the board route, not a `menu.tsx` form-sheet route. So the board folder has no `menu.tsx`, and Settings from the menu is a push, not a modal.
- The celebration is a small Reanimated effect, not Lottie (see [Board screen](board-screen.md)).
- Home has no board art yet (art task); the art area shows the tagline.
- The "Play vs bot" subtitle lists the bot levels: "Easy, Medium or Hard" (Greek: "Εύκολο, Μέτριο ή Δύσκολο"). `levelList` in `HomeScreen.tsx` builds it from the levels the bot plays in at least one game (`anyGameLevels` in `features/bot/levels.ts`), so it changes when the bot gets a level (#182).
- A broken save on the board route shows the "could not be opened" card (not a dialog), with a Home button.
- The game also saves mid-turn when the app goes to the background or the user exits (the wireframe accepts losing those moves; we keep them).
- New game has a small **i** button on each game card that opens its rules page (not in wireframe 4).

## Tests

- `features/bot/botTurn.test.ts`: the bot turn with a fake `BotRunner` (roll, moves, confirm, timing with fake timers, forced think time, cancel, resume, errors).
- `features/bot/levels.test.ts`: the level check per variant (`supportedLevels` or a probe), with fake bots that support chosen variants; Tavli gets the levels of all three games.
- `features/match/match.test.ts`: setup (games, presets, locked games, levels per game), seats, routes and params, last choices, sessions (the rules of the chosen game), game labels, resign.
- `HomeScreen.test.tsx`, `NewGameScreen.test.tsx`, `MatchScreen.test.tsx`: the screens (the game picker vs bot and in pass-and-play, locked games, levels per game; vs bot turn, pause while the menu is open, resign game and match, pass-and-play names; a Tavli match through Portes → Plakoto → Fevga with the game label and the next game).
- `MatchEndScreen.test.tsx`: the win with every game row (and the game of each row in a Tavli match), the celebration and the announcement; Rematch, Change settings and Home; a lost match (no celebration, the bot starts the rematch); a resigned match; a match lost on time (the reason, the rows, the announcement, Greek; a time-out in an earlier game or before Resign match is not the reason); pass-and-play names; reduce motion; Greek.
- `features/match/save.test.ts`: the save format (round trip, ten kinds of bad data dropped; the saved game: Tavli after a restart, an old save without a game, a game the log does not have), when it saves, clearing a finished match, resume after a restart, the Continue texts and the background hook.
- `features/rules/RulesScreen.test.tsx`: every page shows its sections in order with headers, the start pictures, the Tavli links (not Asodio), the Asodio page, unknown ids, Greek, and that `en` and `el` have the same `rules.*` keys (and the same number of lines), all used by a page.
- `features/tutorial/lessons.test.ts`: every lesson starts in its game's default preset with its fixed dice, offers only the moves it teaches, and can be finished; the Plakoto, Fevga and Asodio lessons check the engine's own rule (a pinned checker, the runner lock, the six-in-a-row ban; the loading lock, waiting entered checkers, the quarter lock, a frozen army). `TutorialScreen.variants.test.tsx`: the Plakoto, Fevga and Asodio lessons with taps and with the move list, the mother card, the pinned- and frozen-checker hints, Greek. `progress.test.ts`: the saved status per game (Asodio too, and the keys saved before it), bad data, a failing storage, and the four events (none before opt-in, an error dropped). `SettingsScreen.test.tsx`: the game picker (each game, Cancel, Greek). `TutorialScreen.test.tsx`: the whole tutorial with taps only, the lit checker and its target, the hint and shake after a wrong touch, reduce motion, skip from any lesson, Greek.
- `features/history/history.test.ts`: a record at match end (vs bot, pass-and-play, a resigned game with a diplo, Resign match, a match lost on time and a time-out that does not end the match), once per match and again after a rematch, a left match (in memory and from the save slot; none when nobody played), the save slot unchanged, a history error that does not break the move; the rare cases of #150 (a left match whose slot could not be removed is recorded once, a match that finished just before the app died is not recorded as left, a left rematch still is, a live rematch save survives a clock set back, lookups never delete a save, old saves and records without a match number, `get(id)` records the match it drops); diplo wins per the rules and the Tavli scoring of every game; the list order, the cap, clear, a failing storage, bad data; the stats math; the row texts, dates and locales. `HistoryScreen.test.tsx`: the empty state, the rows and their labels (also "Lost on time"), the stats rows, Greek, and Settings → History (open, clear with confirm and cancel).
- `src/navigation.test.tsx`: the real routes with `expo-router/testing-library` (Home → New game → board → Home → Continue, the replace dialog, the `mode` param, an unknown id, a broken save; match end → Rematch → match end → Change settings, and match end → Home with no Continue card; History from Home (empty → Play → a won match) and from Settings (clear); the rules pages from New game, the in-game menu and the Tavli page; the tutorial from Home, skipped, opened again from Settings and the rules page, and played to the end with taps into New game with Portes vs Easy; the Plakoto lessons from their rules page, saved apart, into New game with Plakoto vs Easy; the Fevga lessons skipped; Settings → Help opens each game's lessons, and the Asodio lessons played to the end into New game with Asodio vs Easy; the Asodio rules page). It replaces the library's own Reanimated mock with ours.
