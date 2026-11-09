# Online game service

Status: first version (#126, part of #46), with turn timers (#133), invites by code (#252), [my games](#my-games) (#296), ["your turn" pushes](#push) (#280) and ["game over" pushes](#game-over) (#316), [sign-in](#sign-in) (#131), [account deletion](#delete-an-account) (#302), [Update needed](#update-needed) (#390), a [Convex client adapter](#the-convex-adapter) (#253) and its [invites adapter](#the-convex-invites-adapter) (#281). The game model is in the pure package `@tavli/online`, with an [in-memory server](#the-in-memory-server) (#251). It runs and is tested **offline**, with no Convex account. CI deploys it to Convex (#257, see [Deploy](#deploy)).

Decision: [ADR-0004](../decisions/0004-backend-auth.md) (Convex). Layout: [ADR-0002](../decisions/0002-modular-architecture.md).

## Where the code is

| Path | What it holds |
|---|---|
| `apps/server/convex/schema.ts` | The tables: `games`, `moves`, `drafts`, `invites`, `pushTokens`, `authKeys`, `usedKeyNonces`, `appleTokens` and `appleRevokes` |
| `apps/server/convex/games.ts` | The Convex functions: the public `makeMove`, `answer`, `resign`, `getGame` and `listMyGames`, the internal `createGame` and `checkTimeout`, and `insertGame` (the one way to start a game). They keep only the database and scheduler parts. |
| `apps/server/convex/account.ts` | `deleteMyAccount` ([Delete an account](#delete-an-account)); the app calls it through the `OnlineData` port ([In the app](#in-the-app), #315) |
| `apps/server/convex/appUpdate.ts` | `updatePolicy`: the lowest app build the server works with, from the deployment's env vars ([Update needed](#update-needed), #390). The one public function with no sign-in |
| `apps/server/convex/model/appUpdate.ts` | The pure part: `appUpdatePolicy(env, platform)` reads the env vars |
| `packages/contracts/src/app-update.ts` | The `AppUpdates` port, `AppUpdatePolicy` and the in-memory fake |
| `apps/server/convex/model/account.ts` | The pure part of account deletion: `gameOnDelete` (resign, keep or skip a game) |
| `apps/server/convex/caller.ts` | `signedInPlayer(ctx)`: the caller's player id from the sign-in token, and `existingPlayer(ctx)`: the same, for an account that still exists ([Sign-in](#sign-in)) |
| `apps/server/convex/convex.config.ts` | The Convex app: it uses the Better Auth component |
| `apps/server/convex/auth.ts` | Better Auth: the component client and `createAuth` (anonymous, Expo, Convex and key plugins, Sign in with Apple; the delete and link routes are off) |
| `apps/server/convex/keyPlugin.ts` | Our Better Auth plugin for [sign-in keys](#sign-in-keys): `/key/nonce`, `/key/save`, `/key/list`, `/key/remove`, `/key/apple-code` |
| `apps/server/convex/authKeys.ts` | The key claims and used nonces, each in one transaction: `claimKey`, `releaseKey`, `useKeyNonce`, `deleteKeysOf` |
| `apps/server/convex/appleTokens.ts` | [Apple's tokens](#apple-tokens-and-the-revoke): `saveAppleToken`, the revoke queue (`revokeAppleTokensOf`, `revokeAppleToken`) and Apple's notices (`appleNotifications`, `endAppleKey`) |
| `apps/server/convex/model/keyNonce.ts`, `model/appleIdToken.ts`, `model/appleTokens.ts` | The pure parts: the signed nonce, the Apple id token check (jose), and Apple's token calls, client secret and notices |
| `apps/server/convex/auth.config.ts` | The token issuer Convex trusts: Better Auth on the deployment's site URL |
| `apps/server/convex/http.ts` | The HTTP routes: Better Auth under `/api/auth` |
| `packages/online/src/online-game.ts` | The game logic, with no Convex code. Pure: dice come from an `Rng` argument |
| `packages/online/src/calls.ts` | The checks around each call, shared by both servers: `checkNewGame`, `checkCall` (game, caller, version), `callTimedOut`, `scheduledCheck`, `nextDeadline`, `eventActor` |
| `packages/online/src/summaries.ts` | [My games](#my-games): `summarizeGame` (one game for one player), `newestFirst` and `latestGames` (the list order and limit), shared by both servers |
| `packages/online/src/memory-server.ts` | The [in-memory server](#the-in-memory-server): the same logic, a `GameTransport` and an `Invites` per player |
| `packages/online/src/invites.ts` | The invite checks and codes, shared by both servers. Pure: `now` and the `Rng` are arguments (moved from `apps/server/convex/model/` in #256) |
| `apps/server/convex/model/cryptoRng.ts` | The dice RNG: `crypto.getRandomValues` |
| `apps/server/convex/invites.ts` | The invite functions ([Invites](#invites)) |
| `apps/server/convex/push.ts` | Push tokens, "your turn" and "game over" pushes ([Push](#push)): `registerPushToken`, `removePushToken`, `scheduleTurnPush` and the action `sendTurnPush` |
| `apps/server/convex/model/push.ts` | The pure push parts: who gets a push (`turnWait`, `turnPushSide`, `matchEndPushSides`), the text (`TURN_PUSH_TEXT`, `MATCH_END_PUSH_TEXT`), the retry (`retryTokens`, `pushStillDue`), the token cap |
| `packages/contracts/src/push.ts` | The `PushProvider` port, the push error codes and the recording provider |
| `packages/adapters/push-expo` | `PushProvider` on the Expo Push Service, with `fetch` only, and `isExpoPushToken` (its `README.md`) |
| `packages/contracts/src/invite.ts` | The `Invites` port, `InviteView`, the statuses, the error codes, the code alphabet and `INVITE_TIME_MS` |
| `apps/server/convex/_generated/` | Convex codegen output, committed (see [Codegen](#codegen-without-a-deployment)) |
| `apps/server/convex/tsconfig.json` | The typecheck that `convex deploy` runs before it pushes |
| `.github/workflows/deploy-server.yml` | The deploy (see [Deploy](#deploy)) |
| `packages/contracts/src/game-transport.ts` | The `GameTransport` port, the `OnlineGameView` and `GameSummary` types, `turnDeadlineMs`, `ASYNC_TURN_TIME_MS` and `MAX_LISTED_GAMES` |
| `packages/contracts/src/online-data.ts` | The `OnlineData` port: `deleteMyData()` ([In the app](#in-the-app), #315) |
| `packages/contracts/src/auth.ts` | The `AuthProvider` port, `AuthUser`, the auth error codes and the in-memory provider |
| `packages/adapters/auth-better-auth` | `AuthProvider` on the Better Auth Expo client (its `README.md`) |
| `packages/adapters/backend-convex` | `GameTransport`, `Invites` and `OnlineData` on the Convex client ([The port](#the-port), [invites adapter](#the-convex-invites-adapter), its `README.md`) |
| `apps/server/convex/test.network.ts` | Fake Convex clients over one convex-test backend, one per signed-in user, for the adapter tests |

Only `apps/server` and the adapters (`auth-better-auth`, `backend-convex`) import `convex` and Better Auth. The ports in `packages/contracts` and `@tavli/online` are plain TypeScript. The app must not import server code, so it uses `@tavli/online` and the ports.

## Data model

Engine data is stored as **JSON text**. So Convex field rules never limit the engine shapes, and the engine stays the only owner of them.

### `games`

| Field | Type | Notes |
|---|---|---|
| `players` | `{ white, black }` strings | Player ids: the Better Auth user id of each player ([Sign-in](#sign-in)) |
| `choice` | `portes` · `plakoto` · `fevga` · `asodio` · `tavli` | What the players picked. `tavli` = the Portes → Plakoto → Fevga rotation. |
| `turnTimeMinutes` | number · null | Turn time in minutes, or `null` for the 24-hour default ([Turn timers](#turn-timers)) (#183). |
| `targetPoints` | number | Match length |
| `rules` | JSON text | The match `RuleSet` (`serializeRules`) |
| `variant` | string | The variant of the current game |
| `flow` | JSON text | The engine `MatchFlow` **without its log** (match, score, current game), and `previousGame`: the game before the current one, as it ended (#299). `StoredFlow` in `@tavli/online`; a step saves it with `storeStep`, never with `storeFlow` alone. Games saved before #299 have no `previousGame` and still load. |
| `status` | `active` · `finished` | |
| `winner` | `white` · `black` · `null` | The match winner |
| `version` | number | Starts at 1. Goes up by one on every change. |
| `eventCount` | number | Rows in `moves` for this game |
| `turnDeadline` | number · `null` | When the current turn runs out (epoch ms, server clock). `null` once the match is finished. |
| `updatedAt` | number (optional) | The last saved change (epoch ms, server clock), for [my games](#my-games) (#296). Every save sets it. Games saved before #296 have none: they count their `_creationTime`. |

Indexes: `by_white` and `by_black` (`players.white` / `players.black`, then `status`, then `updatedAt`), for [my games](#my-games). One range of each is one player's games with one status, oldest change first.

### `moves`

The event log. One row per engine `FlowEvent`, in order: `start`, `rollOpening`, `roll`, `move`, `confirm`, `answer`, `timeout`, `nextGame`, `resignMatch`.

| Field | Notes |
|---|---|
| `gameId`, `seq` | `seq` 0 is the `start` event. Index `by_game` on `[gameId, seq]`. |
| `version` | The game version the event led to |
| `actor` | The player id who acted, or `server` (time outs, the next game and its opening roll). A `roll` row names the player who asked for it (#355), and a `rollOpening` row of a new match the player who tapped for that die (#379); the server still made the dice. |
| `event` | The `FlowEvent`, JSON text, with the dice in it |

`replay(events)` from `@tavli/engine` rebuilds the exact game from these rows. The tests check this. It gives history and replays (L3) almost for free.

The server does not replay the log on every move: it loads `games.flow`, which only the server writes. So a move costs the same at turn 5 and at turn 500.

### `drafts`

The turn so far of the player the server waits for (#374): the moves since the roll, before Confirm. The other phone shows them live ([Live moves](#live-moves)). A draft is never a saved turn.

| Field | Notes |
|---|---|
| `gameId` | Index `by_game`. At most one row per game. |
| `version` | The game version the draft was made on. |
| `seq` | 1 for the first draft of that version, then +1 per draft. |
| `moves` | `MoveInput[]` as JSON text: every move so far (empty after the last undo). |

Every save (`save` in `games.ts`) deletes the row, and `getGame` shows a draft only at its own version, while the game waits for a move. The row holds no player id. A draft is its own table, so a draft write does not run the [my games](#my-games) queries again.

### `authKeys`

Who owns each sign-in key (#397). Better Auth keeps its own `account` row per key; this table is the one-owner lock in front of it (see [Sign-in keys](#sign-in-keys)).

| Field | Notes |
|---|---|
| `providerId` | The Better Auth provider id, for example `apple`. |
| `accountId` | The provider's user id (Apple's `sub`). Index `by_key` (`providerId`, `accountId`): at most one row per key. |
| `userId` | The Better Auth user id (the player id). Index `by_user`: a user has at most one row per provider. |
| `claimedAt` | When this user claimed the key (server clock): the start of `CLAIM_GRACE_MS`. |

`claimKey` writes it, `releaseKey` and `deleteMyAccount` (`deleteKeysOf`) delete rows.

### `appleTokens`

Apple's refresh token for an Apple key (#398), so the server can revoke it when the key or the account goes. See [Apple tokens and the revoke](#apple-tokens-and-the-revoke).

| Field | Notes |
|---|---|
| `userId` | The player id. Index `by_user`. |
| `accountId` | Apple's `sub` (the key's `accountId`). Index `by_account`: one row per key. |
| `clientId` | The bundle id (or the Services ID) the code was for: Apple's `client_id` for the revoke. |
| `refreshToken` | Encrypted with Better Auth's secret, the way `encryptOAuthTokens` keeps tokens. |
| `savedAt` | When it was saved. |

`saveAppleToken` writes it. Key removal, account delete and Apple's notices delete rows.

### `appleRevokes`

Apple tokens waiting for their revoke (#398): `clientId`, `refreshToken` (encrypted) and `attempts`. The rows hold no player id; `revokeAppleToken` deletes each one after the revoke or its last try.

### `usedKeyNonces`

The nonces already used by a key sign-in or save (#397). A nonce is signed and holds its own end time, so the server stores only the used ones, to refuse them a second time.

| Field | Notes |
|---|---|
| `nonce` | The nonce text. Index `by_nonce`. |
| `expiresAt` | When it runs out. Index `by_expires`: each `useKeyNonce` deletes up to 10 old rows. |

The rows hold no player id.

## Rules of a game choice

`onlineGameRules(choice)` in `@tavli/online`: the preset of the game, and for one game `match.rotation = [game]`. This is the same as `gameRuleSet` in `apps/mobile/src/features/match/setup.ts`. The server must not import app code, so the few lines are copied. **Keep both in sync.** If they grow, move one helper into `packages/engine`.

## Move flow

Each mutation is **one Convex transaction**. If anything throws, nothing is saved.

```
client                     makeMove (one transaction)
  │  (sign-in token)         0. signed in?                        → NOT_SIGNED_IN
  │  gameId,                 1. load the game                     → NOT_FOUND
  │  expectedVersion,        2. caller is a player?               → NOT_A_PLAYER
  │  moves[]  ─────────────► 3. expectedVersion = version?        → STALE_VERSION
  │                          3b. turn time ran out?               → TIMED_OUT (time out saved)
  │                          4. match over?                       → GAME_OVER
  │                          5. caller is to move?                → NOT_YOUR_TURN
  │                          6. engine: each move, then confirm   → ILLEGAL_MOVE
  │                          7. server steps (advance):
  │                             start the next game + opening roll,
  │                             then stop at the next roll
  │                          8. save flow, version + 1, log rows,
  │                             new turnDeadline + checkTimeout
  ◄──── getGame (reactive) ─ both phones see the new version

client                     rollDice (one transaction, #355)
  │  gameId,                 0-5. the same checks as makeMove
  │  expectedVersion ──────► 6. phase is awaiting-roll, or (#379)
  │                             the caller's opening die is not in? → ILLEGAL_ACTION
  │                          7. roll the dice (secure RNG);
  │                             a roll with no move passes
  │                          8. save flow, version + 1, log rows;
  │                             the turnDeadline stays (a pass
  │                             starts the other side's time)
  ◄──── getGame (reactive) ─ both phones see the dice
```

- **A turn is sent whole.** `moves` is every move for the current roll, in order. The engine checks each one (`nextMoves`), and the turn must be a full legal play. An incomplete turn is `ILLEGAL_MOVE`. Undo stays on the phone.
- **The server rests only where it waits for a player:** `opening-roll` of a new match (each player taps for their die, #379), `awaiting-roll` (tap Roll, #355), `moving` (play your roll) or `awaiting-answer` (a question). Everything else happens on the server, inside the same transaction (`advance`).
- **The roll waits for its player** (#355). `advance` stops at `awaiting-roll`, and the dice are rolled only when that player calls `rollDice`. So the dice of a turn do not exist before the player taps Roll. The next game stays automatic, its opening roll too: no one taps for it. In Portes the winner starts the next game, so that game begins in `awaiting-roll`, with no dice.
- **A roll with no legal move** passes in the engine, inside `rollDice`. The new view waits for the other player's roll, and `game.lastTurn` is the pass: the player, the dice and no moves. Both phones learn of the pass and its dice from that view; there is no extra field.
- **Between games** the server starts the next game at once (with the opening roll, if the rules ask for one). The result of the finished game is in `match.games`. The finished game itself, as it ended, is the view's `previousGame` (#299): its `lastTurn` is the turn that ended it, and its board the end position. `advance` keeps it when it starts the next game: each step (`playTurn`, `answerPrompt`, `timeOut`, `resign`) returns a `SteppedFlow`, whose `endedGame` is the game the step ended, or `null`. Nothing plays the step again. A server reads the stored text once (`loadStored` gives the flow and `previousGame`) and saves with `storeStep(loaded, next)`: the step's `endedGame`, else the stored `previousGame`. `storeFlow(flow, previousGame)` takes the previous game as a required argument, so a new save path cannot drop it by mistake; a new match passes `null`. `listMyGames` does not use `previousGame` (summaries drop it).
- **Opening roll** (#379): a new match starts in `opening-roll` (`insertGame`; `advance` stops there only while `match.games` is empty). Each player taps for their own die: `rollDice` rolls the caller's die (the engine's `rollOpening`), and only then. Either player may roll first. A second roll of the same die is `ILLEGAL_ACTION`. A tie clears both dice, and both roll again. When the dice differ, the starter plays them (`useOpeningDice`) or rolls again (`rerollBoth`), as offline.
  - **The version race.** Both players may tap at the same moment, both at the same version. So `rollDice` checks no version while the stored game is in `opening-roll` (`rollCallVersion` in `@tavli/online`). The engine refuses a die that is already in, and Convex runs the two mutations one after the other (optimistic concurrency: the later one runs again on the new flow). So both dice count, in either order, and no player gets `STALE_VERSION` for the other player's die. The caller check and the deadline check still run.
  - **`waitingFor`** in `opening-roll` is White while White's die is not in, then Black. It picks the clock and the push. The app uses `mayRollOpening(view, side)` to show Roll for its own die, whatever `waitingFor` says.
  - **The deadline** is a turn's deadline. The first die keeps it (like a roll, `rollDeadline`); a tie or the end of the opening starts a new one. At the deadline, if one die is in, the other player loses the game on time (the engine allows `timeout` in `opening-roll` only for that side). If no die is in, nobody is late: the server rolls both dice (until a side starts), and the game goes on.
  - The next game of a match stays automatic (the server rolls its opening, if its rules ask for one). An older app cannot roll the opening of a new match; a new app on an older server sees a game past its opening and plays as before.
  - `chosenStarterRolls` is not supported online; no preset uses it.

### Other calls

No public call takes a player id. The caller is the signed-in user ([Sign-in](#sign-in)). With no sign-in, every public call below throws `NOT_SIGNED_IN`. A client cannot call the internal ones.

A game between two people starts only from an accepted invite ([Invites](#invites)): `acceptInvite` calls `insertGame`. `createGame` is internal (#274), so no user can start a game with another user who did not agree.

| Call | Who may call | Version | What it does |
|---|---|---|---|
| `createGame(callerId, players, choice, targetPoints, turnTimeMinutes)` | internal (tests, the Convex dashboard) | – | New game at version 1 through `insertGame`. It waits for both opening dice (#379), and the opening's clock runs. Tests roll them with `openGame(t, gameId, players)` (`convex/test.setup.ts`). An internal call has no sign-in, so `callerId` names who starts the game; it must be one of the players. Returns the id. |
| `rollDice(gameId, expectedVersion)` | the player the server waits for, in `awaiting-roll`; either player whose opening die is not in, in `opening-roll` | yes (not in `opening-roll`) | Rolls the caller's dice (#355), or the caller's opening die (#379, above). `ILLEGAL_ACTION` when the game does not wait for that roll. Returns like `makeMove`. |
| `makeMove(gameId, expectedVersion, moves)` | the player to move | yes | One full turn (above). Returns `{ ok: true, version }`, or `TIMED_OUT` ([Turn timers](#turn-timers)). |
| `answer(gameId, expectedVersion, choice)` | the player the question asks | yes | Answers `prompt` (Plakoto mother question: `resign` or `playOn`; Asodio chosen double). Then the server goes on to the next wait (a roll, or the chosen double to play). Returns like `makeMove`. |
| `resign(gameId)` | either player, any time | no | Resigns the **match**; the opponent wins. No version, so a resign never fails only because the opponent just moved. It ignores the turn timer. Returns the new version. |
| `setDraft(gameId, expectedVersion, moves)` | the player to move, in `moving` | yes | Saves the caller's turn so far ([Live moves](#live-moves)). Returns `null`. |
| `getGame(gameId)` | the two players | – | `OnlineGameView`, or `null` when there is no such game. Anyone else gets `NOT_A_PLAYER`. |
| `listMyGames(status)` | anyone signed in | – | The caller's games with `status` (`active` or `finished`) as `GameSummary`, newest change first, at most `MAX_LISTED_GAMES` (50). See [My games](#my-games). |
| `checkTimeout(gameId, version)` | internal (the scheduler) | yes | Runs at a turn deadline. Applies the time out if the game is still at `version`; else it does nothing. |

### Live moves

The other player sees each move as it happens (#374). After each move and undo, the mover's phone sends `setDraft` with every move of the turn so far. The pure check is `nextDraft` (`calls.ts`) and `checkDraft` (`online-game.ts`) in `@tavli/online`:

- Only the player the server waits for, only in `moving`, at `expectedVersion`. Each move must be legal from the board before it (the engine checks). A refused draft throws (`ILLEGAL_MOVE`, `NOT_YOUR_TURN`, `ILLEGAL_ACTION`, `STALE_VERSION`) and saves nothing.
- At or after the deadline it throws `TIMED_OUT` and saves nothing. The scheduled `checkTimeout` ends the game.
- A draft keeps the version and the deadline. It writes no `moves` row, schedules nothing and sends no push.
- The view's `draft` is `{ moves, seq }` or `null`. Both players watch `getGame`, so the other phone gets each draft at once, at the same version with a higher `seq`.
- Confirm (`makeMove`) still sends the whole turn, and the server checks it again. A draft is only for show: the turn need not match it.

**Rollout.** `draft` is optional in the view. An app from before #374 ignores it and the views at the same version. A new app on a server from before #374 gets "Could not find public function" from `setDraft`; the app drops the error and plays on, with no live moves.

### Two phones at once

Every write call except `resign` takes `expectedVersion`. Convex mutations are serializable transactions (optimistic concurrency): when two calls on the same game overlap, Convex runs one again after the other one commits. The first one bumps the version. The second one then sees the new version and fails with `STALE_VERSION`. The phone then loads the game again. The test "two phones send the same turn at once" covers this.

### Turn timers

Owner answers Q3 and Q15: both **timed** (one minute or more) and **untimed** (slow, 24-hour) games. A timed turn lasts the chosen number of minutes; an untimed turn lasts **24 hours** (`ASYNC_TURN_TIME_MS` in contracts). When the time runs out, the player the server waits for **loses that game**. The match goes on with the next game, or ends if that game gave the last point.

- **The deadline.** Every save that leaves the match running sets `turnDeadline = now + turnDeadlineMs(turnTimeMinutes)`: the new game (`insertGame`), `makeMove`, `answer`, and a time out (the next game happens in the same save). So each wait for a player gets a full turn time, also when the same player acts again (an Asodio extra roll, an answer and then a roll). `rollDice` is the one exception (#355): the roll is part of the turn, so the turn time covers the wait before the roll and the moves after it, and the save keeps the old `turnDeadline` (`rollDeadline` in `@tavli/online`). A roll with no legal move passes, and the other player's turn gets a full turn time. A finished match has `turnDeadline: null`.
- **The scheduler.** The same save schedules `internal.games.checkTimeout({ gameId, version })` with `ctx.scheduler.runAt(turnDeadline)`. Any later change bumps the version, so an old check does nothing. No cancel is needed. If a check ever runs before the deadline, it schedules itself again for the deadline.
- **On a call.** `rollDice`, `makeMove` and `answer` check the deadline after the version check. At or after the deadline (`now >= turnDeadline`), they save the time out instead of the call and return `{ ok: false, version, error: { code: 'TIMED_OUT', message } }`. This is a return value, not a thrown error: a thrown error rolls back the whole transaction, and so the time out too. A client adapter turns it into a `TIMED_OUT` rejection (the port's `rollDice` / `sendTurn` / `sendAnswer`). The scheduled check for the old version then does nothing.
- **The engine.** The time out is the engine game action `{ type: 'timeout', player }` (only the player the game waits for; in the opening roll only the side whose die is not in while the other die is, #379). The other player wins that game for **1 point**, also in the opening roll, with `reason: 'timeout'` in `GameResult` and `GameRecord`. The moves of an unfinished turn do not count. The engine has no clock: the server decides when time is up, with `Date.now()` inside the Convex function. The pure helpers `deadlineAfter`, `isTimedOut`, `timeOut`, `callTimedOut` and `scheduledCheck` in `@tavli/online` take `now` as an argument.
- **The log.** The `timeout` event is a row in `moves` with actor `server`, so `replay` still rebuilds the game.
- **Points.** A time out is always worth **1 point** (owner answer Q30, #378), in every game and preset: also when the late player has borne off no checker, where a resign would give a diplo (Acey-Deucey American: 15). A resign keeps its own score. The score is in the saved match, so the app shows the server's points, old builds too. Games timed out before #378 keep the points they were saved with (2 for a diplo); the server never replays a stored log, so they stay as they are.
- **Resign** (the match) ignores the timer: a resign is allowed at any time.
- **Time outs per player** are not stored: `match.games` has every game with `reason: 'timeout'` and its winner.

### Errors

A rejected call throws a `ConvexError` whose `data` is `{ code, message }` (`GameTransportErrorData` in contracts). The codes are `GAME_TRANSPORT_ERROR_CODES`: `NOT_FOUND`, `NOT_A_PLAYER`, `NOT_YOUR_TURN`, `STALE_VERSION`, `ILLEGAL_MOVE`, `ILLEGAL_ACTION`, `GAME_OVER`, `TIMED_OUT`, `BAD_REQUEST` and `NOT_SIGNED_IN` (no signed-in user, #131). Clients use the code, not the message.

## Dice

- Rolled **only on the server**, inside the mutation, through the engine's `Rng`. The server uses `createCryptoRng()` (Web Crypto, `crypto.getRandomValues`). It never uses the seeded engine RNG, which is predictable.
- A roll is made when its player taps Roll (`rollDice`, #355); the opening die of a new match when its player taps for it (#379). Only the opening of the next game of a match is rolled by the server itself. The server stores **no seed and no RNG state**, so the next dice do not exist anywhere before they are rolled. `getGame` shows only the current roll, and a pass's dice in `game.lastTurn`.
- Convex makes queries and mutations **deterministic**. Its docs say `Math.random` there is a seeded strong PRNG, and the seed is a hidden input of the function call. We expect `crypto.getRandomValues` in a mutation to work the same way. The seed stays on the server, so a client cannot predict a roll. **Check this on the first real deployment** (open point below).
- Lint blocks `Math.random` in `apps/server`.
- The pure tests in `packages/online` pass a seeded RNG. The Convex tests use the real server RNG and read the dice from `getGame`.

## The client view

`getGame` returns `OnlineGameView` (`packages/contracts`): `gameId`, `version`, `status`, `choice`, `turnTimeMinutes`, `turnDeadline` (epoch ms on the server clock, `null` when finished; a phone shows the time left from it), `players`, `match` (rules, score, finished games), `game` (the engine `MatchFlow` of the current game), `previousGame` (the game before `game`, as it ended, #299; `null` in the first game), `waitingFor` (the side to move or answer), `prompt` and `draft` (the mover's turn so far, or `null`, #374). `game.played` is always empty, because turns are saved whole; the phone plays `draft.moves` on top for the other player. `previousGame` stays the same until the next game ends; a match that ends keeps its last game in `game`. The phone replays the turn in `previousGame.lastTurn`, so the other player's winning turn flies before the game-end sheet (see "Between games" in `board-screen.md`).

## My games

`listMyGames({ status })` (#296) lists the caller's own games, so the app can show them on Home and the player can go back to a game.

- **Who.** The caller comes from `signedInPlayer(ctx)`; the query takes no player id. It never lists another player's game.
- **What.** Each game is a `GameSummary` (`packages/contracts`): `gameId`, `status`, `choice`, `presetId`, `variant` (the game being played now), `targetPoints`, `turnTimeMinutes`, `mySide`, `waitingFor`, `myTurn`, `score`, `winner`, `updatedAt` and `turnDeadline`. It tells nothing about the other player but their side (the other side). Open the game (`subscribe`) for the rest.
- **One source.** `summarizeGame` in `@tavli/online` builds the summary from the same `toView` input, so a list and an open game never disagree. The Convex query and the in-memory server both use it, and both sort with `latestGames` (newest `updatedAt` first; at the same time, the larger game id first).
- **The indexes.** The query reads the newest `MAX_LISTED_GAMES` of the caller's games on each side (`by_white` and `by_black`, equal on player and `status`, `order('desc')`), then keeps the newest `MAX_LISTED_GAMES` of both. So it reads at most 100 rows. A game saved before #296 has no `updatedAt`: the index puts it last, and its summary uses `_creationTime`.
- **A call, or a live list.** The port's `listMyGames` is a promise; the Convex adapter runs the query once (`client.query`). `watchMyGames({ status }, onList, onError)` (#297) watches the same query: the first list comes on a later tick, then a new list after each change, until the stop function. Each list is a copy. No new server function: Convex reruns the query after each save. Home uses the watch (see "Your online games" in [App shell](app-shell.md)).
- **Errors.** `NOT_SIGNED_IN` with no sign-in, and `BAD_REQUEST` for a bad subject, like every public call.

The app plays a game through the online store (`apps/mobile/src/features/online/`, #254): it plays the turn on the phone and sends it whole, and it shows the time left from `turnDeadline`. See "Online games" in [App shell](app-shell.md).

## The port

`GameTransport` in `packages/contracts`: `subscribe(gameId, onView, onError)`, `sendTurn({ gameId, expectedVersion, moves })`, `sendAnswer({ gameId, expectedVersion, choice })`, `resign(gameId)`, `listMyGames({ status })` ([My games](#my-games), #296) and `watchMyGames({ status }, onList, onError)` (#297). `listMyGames` is on this port, not a new one: it is a call of the same signed-in player on the same server and client, and every place that has a transport (the online screens, the services, the fakes) gets it with no new wiring. The calls carry no player id. The server reads the caller from the sign-in token, which the backend client gets from the `AuthProvider` port ([Sign-in](#sign-in)). `subscribe` is for the two players only: a stranger's `onError` gets `NOT_A_PLAYER`.

### The Convex adapter

`@tavli/backend-convex` (`packages/adapters/backend-convex`, #253) implements the port on the Convex client. Its `README.md` has the details.

- `createConvexGameTransport({ client })`: `client` is any object with `onUpdate(query, args, onResult, onError)`, `query(fn, args)` and `mutation(fn, args)`. `ConvexClient` from `convex/browser` fits, and a test passes a fake.
- `createConvexClient(url, auth)` makes the `ConvexClient` and calls `setAuth` with a token fetcher on the `AuthProvider` (`getToken({ forceRefresh })`). `createConvexGameTransportFromUrl(url, auth)` does both steps. The app makes one client and puts the transport on it (see [The app wiring](#the-app-wiring)).
- `subscribe` watches `getGame`. A view goes to `onView`; `null` goes to `onError` as `NOT_FOUND`. Both wait one microtask, so neither is called inside `subscribe` or after the stop function.
- `listMyGames` runs the `listMyGames` query once (`client.query`) and resolves with a copy of the list. `watchMyGames` watches it (`client.onUpdate`): each list is a copy and waits one microtask, like `subscribe`; errors map like the calls.
- A `ConvexError` whose `data` passes `isGameTransportErrorData` rejects with that data (a plain object). Every code maps so, `NOT_SIGNED_IN` too. Other errors (the network) reject as they are.
- `makeMove` and `answer` return `{ ok: false, error: { code: 'TIMED_OUT' } }` when the turn time ran out ([Turn timers](#turn-timers)): `sendTurn` and `sendAnswer` reject with that data. They resolve only after the mutation resolves.
- The function references are names (`GAME_FUNCTIONS` with `makeFunctionReference`), not the generated `api`: the `api` types pull in all server code, and `apps/server` depends on the adapter for its tests. `convex/convexTransport.test.ts` checks the names and types against `api`.
- **Offline test:** `apps/server/convex/convexTransport.test.ts` runs `gameTransportContract()` on the adapter with the real functions. A fake client runs each call through convex-test as one user (`t.withIdentity({ subject })`). After each mutation it runs the watched queries again before it resolves, like the real client, and it sends a query result only when it changed. Fake timers, like `games.test.ts`. It also covers a late turn (`TIMED_OUT`) and a call with no sign-in (`NOT_SIGNED_IN`). The fake clients live in `convex/test.network.ts`, shared with the invites test.

## Sign-in

Issue #131. Owner decision: online play waits for sign-in. There is no play keyed on an install id. Guest (anonymous) accounts come first. A guest saves the account with a sign-in key and keeps the same id ([Sign-in keys](#sign-in-keys), #397, ADR-0008): Apple now, the email code (#399) and Google (#410) later.

### The server

- **Better Auth as a Convex component** (`@convex-dev/better-auth` 0.13.0, `better-auth` 1.7.18, ADR-0004). `convex.config.ts` installs the component. Its tables (users, sessions and so on) live in the component, not in our `schema.ts`.
- `auth.ts` builds Better Auth with four plugins: `anonymous` (guest accounts), `expo` (the app's `tavlaki://` scheme is a trusted origin), `convex` (it signs a JWT for the Convex client; the JWT holds only `sub` and the session id, never an email) and our `keyPlugin` ([Sign-in keys](#sign-in-keys)).
- `http.ts` serves Better Auth's routes under `/api/auth` on the deployment's site URL (`.convex.site`). The app signs in there and gets a Convex token from `/api/auth/convex/token`.
- `auth.config.ts` tells Convex to trust tokens from that issuer. Convex checks each token and gives the functions `ctx.auth.getUserIdentity()`.
- The deployment needs the secret `BETTER_AUTH_SECRET`. The owner sets it with `npx convex env set`. It is never in the repo. `APPLE_SERVICES_ID` turns Sign in with Apple on; with no value, Apple is off (see "Sign in with Apple" in [`running-the-app.md`](../process/running-the-app.md)).

### Sign-in keys

Issue #397, ADR-0008. A key is a way to sign in to one account: Apple now. A guest has no key; an account with a key is saved (`isGuest` false).

- **Sign in on a new phone:** Better Auth's `/sign-in/social` with `{ provider: 'apple', idToken: { token, nonce } }`. The same Apple id gives the same account; a new one makes a new saved account.
- **Save a guest:** our `POST /key/save`, with the same body. The guest keeps the same user id, so its games, invites and push tokens stay. `isAnonymous` turns false. Apple's email is copied only when no other user has it. A key that is another user's gives `409 KEY_BELONGS_TO_OTHER` and changes nothing; a second Apple id on one account `409 PROVIDER_TAKEN`; the same key again does nothing.
- **`GET /key/list`** gives `{ keys: [{ provider }] }`. **`POST /key/remove`** `{ provider }` never removes the last key (`409 LAST_KEY`).
- **The nonce** (`POST /key/nonce`, no session): `<expiresAt>.<random>.<HMAC-SHA256>`, signed with `BETTER_AUTH_SECRET`, good for 10 minutes (`model/keyNonce.ts`). The server stores nothing when it makes one, so nonce spam costs no rows. The token check (`verifyKeyIdToken` in `auth.ts`) asks for a nonce, checks the HMAC and the time, checks the Apple token (`model/appleIdToken.ts`: Apple's keys, issuer, one of our bundle ids or the Services ID, at most 1 hour old, the nonce as is or as SHA-256 hex), then marks the nonce used (`useKeyNonce`, the `usedKeyNonces` table, one mutation). A used nonce fails. Each use deletes up to 10 run-out rows.
- **One owner per key:** Better Auth writes rows one call at a time, and its `account` table has no unique index. So before Better Auth makes an `account` row for a key, `databaseHooks.account.create.before` calls `claimKey` (the `authKeys` table, one mutation): the first user to claim an Apple id owns it, and a later claim by another user fails with `KEY_BELONGS_TO_OTHER`. `/key/remove` calls `releaseKey`, and `deleteMyAccount` calls `deleteKeysOf`, so a deleted account frees its Apple id. A claim with no `account` row behind it is stale after `CLAIM_GRACE_MS` (1 minute; the account write failed, or a remove stopped halfway) and goes to the next user who claims the key, so a failed write never locks an Apple id out. `claimKey` also refuses a user who holds a live claim on another key of the same provider (`PROVIDER_TAKEN`): `/key/save` checks that first, but two saves of two Apple ids on one account at the same moment would both pass that check.
- **How `/key/save` reads the token:** it runs the provider's `verifyIdToken` option (our `verifyKeyIdToken` in `auth.ts`; Better Auth's own sign-in runs that option before its built-in check), and takes the account id from the provider's `accountSubject` (Apple: `sub`), as Better Auth's sign-in does. Since Better Auth 1.7, `getUserInfo` gives no id. A provider with no `verifyIdToken` option is refused.
- **Turned off on purpose:** `/link-social` (it does not check that a key is free) and `/unlink-account` (it does not know the last-key rule), next to `/delete-anonymous-user`. Implicit linking by email is off (`disableImplicitLinking`), and a later sign-in never deletes a guest (`disableDeleteAnonymousUser`): only `deleteMyAccount` deletes. Apple's name and photo are never kept (`mapProfileToUser`); the username comes in #405.
- **Not yet:** the Apple web flow (Apple on Android) needs a client secret made from the `.p8` key (#401). The app does not send the Apple `authorizationCode` to `/key/apple-code` yet (#401), so no token is kept until then.
- **Tests:** `convex/authKeys.test.ts` signs in over HTTP with a fake Apple (`convex/test.apple.ts`): `useFakeApple(await fakeApple())` swaps Apple's keys with `setAppleKeys` and sets the env vars; `stopFakeApple()` in `afterEach`. Tests never reach Apple. `convex/betterAuthClient.test.ts` runs the `authProviderContract()` checks on the [Better Auth adapter](../../packages/adapters/auth-better-auth/README.md) with Better Auth's real client (no Expo plugin): `phoneFetch(t, phone)` sends its requests to convex-test with the app's origin and keeps the cookies, so the client's paths, bodies and error codes are checked against the real routes.

### Apple tokens and the revoke

Issue #398. Apple asks an app with Sign in with Apple to revoke the person's token when they delete their account in the app.

- **Keep the token:** after a sign-in or a save, the app sends the Apple sheet's code once: `POST /key/apple-code` `{ authorizationCode, clientId }` (session). `clientId` is the app's bundle id (one of `APPLE_BUNDLE_IDS`) or the Services ID. The server trades the code at Apple's `/auth/token` with a client secret, checks that the id token Apple sends back is for the user's own Apple key (`sub`), encrypts the refresh token (Better Auth's `setTokenUtil`) and keeps it in `appleTokens`. `saveAppleToken` checks the key again in its own transaction, so a key or account that went while Apple traded the code keeps no token. Errors: `400 NO_KEY` (no Apple key, also when it went during the trade), `400 BAD_REQUEST`, `401 INVALID_CODE` (Apple said no, another Apple id, or no `APPLE_*` key in the env). A newer code replaces the token; the old one is dropped, not revoked, because a revoke ends the person's Sign in with Apple for the app.
- **The client secret:** an ES256 JWT signed with the team's `.p8` key (`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`), `sub` = the client id, 5 minutes; a new one for each call (`makeAppleClientSecret` in `model/appleTokens.ts`).
- **Revoke:** `deleteMyAccount` and `/key/remove` (`releaseKey`) move the tokens to `appleRevokes`, in their own transaction, and schedule `revokeAppleToken` with the queue row's id only: a token never goes into scheduler args or logs. The issue first said to make the delete an action that revokes before the mutation. We kept the mutation: the builds in TestFlight call `deleteMyAccount` as a mutation, and the queue makes the revoke part of the delete's own transaction, so it can never be lost or undo the delete. The action calls Apple's `/auth/revoke`; a failure tries again after each of `REVOKE_WAITS_MS` (30 s, 5 min, 1 h), so a short outage at Apple does not lose it; then the row goes with a log line that holds no token, email or Apple id (an error logs only its name). Each try books its next step before it calls Apple (`startRevoke`: the next try, or for the last try the drop), so a try that crashes or times out never leaves its row. With no `APPLE_*` key the row goes with an error in the log (a token is kept only while the key is set, so this means the env changed).
- **Apple's notices:** `POST /apple/notifications` (`http.ts`) takes Apple's server-to-server notices: `{ "payload": "<JWT>" }`, RS256 from Apple, for one of our bundle ids or the Services ID (else `400`). On `consent-revoked` or `account-delete`, `endAppleKey` drops that Apple key with its tokens (no revoke: Apple ended them); with the user's last key it deletes the whole account (`deleteAccountOf`, the steps of `deleteMyAccount`). A notice from before the key was made (`event_time`) is about an older key of the same Apple id and changes nothing; so does a notice with no `event_time` (Apple puts it in every notice). The email notices change nothing. The owner sets the URL in Apple's developer site ([running the app](../process/running-the-app.md#sign-in-with-apple-396)).
- **Tests:** `convex/appleTokens.test.ts` uses a fake `AppleTokenClient` (`setAppleTokenClient`) and signs notices with the fake Apple's key; `convex/model/appleTokens.test.ts` checks the client secret, Apple's calls (a fake `fetch`) and the notice check. No test reaches Apple.

### Who calls

Every public function in `games.ts`, `invites.ts`, `push.ts` and `account.ts` gets the caller from `signedInPlayer(ctx)` in `caller.ts`. The one exception is `updatePolicy` in `appUpdate.ts` ([Update needed](#update-needed)): an old build must learn that it is too old also with no session, and the call reads no player data.

- **The player id is `identity.subject`.** It is the Better Auth user id (the token's `sub`). It stays the same for a user across sessions and token refreshes. We do not use `tokenIdentifier` (issuer + subject): the issuer is the site URL, and a new site URL (a custom domain) would change every player id. There is one issuer. If a second one is ever added, move to `tokenIdentifier` and migrate the stored ids.
- **No identity:** `NOT_SIGNED_IN`. The code is in both `GAME_TRANSPORT_ERROR_CODES` and `INVITE_ERROR_CODES`, so every call can throw it.
- **A subject no player may have** (empty, or `server`, the log's `SERVER_ACTOR`): `BAD_REQUEST`.
- **A deleted account** (#306): a token stays valid until it expires (15 minutes), also after `deleteMyAccount` deleted its user. The calls that save the caller's id in a row use `existingPlayer(ctx)`: `signedInPlayer`, then a read of the Better Auth user (`authComponent.getAnyUserById`). No user: `NOT_SIGNED_IN`. These calls are `createInvite`, `acceptInvite`, `declineInvite`, `registerPushToken` and `deleteMyAccount`. A new call that saves the caller's id must use it too.
  - **Cost:** one read of the component per call (a lookup by id). Only these calls pay it, and they are rare (an invite, an answer, a phone's token).
  - **Why not in every call:** queries run again on each change, and game calls are the busy ones; both would pay the read. They do not need it: after a delete the caller has no active game (each one was resigned), so a game call can only fail, and queries save nothing. It would also make every test use real Better Auth users.
  - **Tests:** a test that calls one of these functions signs in as a real Better Auth user. `authUsers(t, count)` in `convex/test.setup.ts` makes them (with `betterAuthTest.register(t)`); a made-up subject such as `'alice'` gets `NOT_SIGNED_IN` there.

### Who may read what

- `getGame`: only the two players. A stranger gets **`NOT_A_PLAYER`** (a thrown error, not `null`), so a client can tell "not yours" from "no such game". A missing game is `null` for anyone signed in. The check is `checkViewer` in `@tavli/online`. The in-memory server uses it too.
- `getInvite`: anyone signed in who has the code. The code is the secret.
- `listMyInvites`: the caller's own invites.
- `listMyGames`: the caller's own games, with nothing about the other player but their side.

### The app side

- **The port:** `AuthProvider` in `packages/contracts/src/auth.ts`: `ready()`, `currentUser()`, `signInAsGuest()`, `signOut()`, `getToken({ forceRefresh })` (for the Convex client's `setAuth`) and `onChange(listener)`. `AuthUser` is `{ id, isGuest }`, and `id` is the token subject. Errors reject with `AuthErrorData` (`NETWORK`, `REJECTED`, `SIGNED_IN`, `KEY_BELONGS_TO_OTHER`, `LAST_KEY`).
- **Keys on the port** (#397): `keyNonce()`, then the Apple sheet, then `signInWithKey(credential)` (nobody signed in; else `SIGNED_IN`) or `saveKey(credential)` (the signed-in user keeps the id). `listKeys()` and `removeKey(provider)`. A credential is `{ provider: 'apple', idToken, nonce }`. The issue named it `signInWithApple`; the port has one name for every kind of key. The in-memory provider's fake Apple takes `memoryAppleIdToken(sub, nonce)`.
- **Contract checks:** `authProviderContract()` in `@tavli/contracts/testing`, plain async functions. The in-memory provider (`createMemoryAuthProvider`) and the Better Auth adapter (on a fake client) run them. The subject gives `appleIdToken(sub, nonce)`.
- **The adapter:** `@tavli/auth-better-auth` (`packages/adapters/auth-better-auth/README.md`). The session cookie lives in `expo-secure-store` (`createSecureSessionStorage`).

### The app wiring

Issue #266. `apps/mobile/src/services.ts` exports `auth` (`AuthProvider`), `games` (`GameTransport`) and `invites` (`Invites`, #281):

- **All are set, or all are `undefined`.** They are `undefined` when the build has no Convex URL or no site URL (`convexServer()` in `apps/mobile/src/convexUrl.ts`). Then online play is off: a screen checks `games === undefined` and shows that.
- **The URLs.** `app.config.ts` puts the deployment URL in `extra.convexUrl` and the site URL in `extra.convexSiteUrl`, per app variant. The site URL is the deployment URL with `.convex.site` in place of `.convex.cloud`. `EXPO_PUBLIC_CONVEX_URL` and `EXPO_PUBLIC_CONVEX_SITE_URL` override them. See "Which server the app uses" in [`running-the-app.md`](../process/running-the-app.md#which-server-the-app-uses).
- **Built on first use** (`apps/mobile/src/onlineServices.ts`). At app start nothing runs: no network call, no socket, no read of the secure store. The first call to `auth` makes the Better Auth client. The first call to `games` or `invites` opens the one `ConvexClient` (one socket), and both share it (#281).
- **No guest at launch.** Only `auth.signInAsGuest()` makes an account, and only `signInForOnline` (`apps/mobile/src/features/online/account.ts`) calls it: when the user taps **Make an invite**, or **Show the invite** on an invite link (#281, see [App shell → Play a friend](app-shell.md#play-a-friend-281)). It uses the saved session first, so the guest is made once. Never send the user id to analytics. The [privacy policy](../legal/privacy.md) describes what this keeps.
- **The game routes** (`app/game/[id]/index.tsx` and `match-end.tsx`) connect through `useOnlineConnection(id)` (`features/online/connection.ts`, shown by `OnlineConnect.tsx`). A dev game (#255, `isDevGame` in `devGameIds.ts`) keeps the in-memory server of `onlineServer()` and plays as `onlinePlayerId`. Any other id plays on `games` as the user of the saved session (`auth.ready()`); the route makes no guest. No URL, nobody signed in, or a session that does not load shows "This game could not be opened."
- **The scheme** is `APP_SCHEME` (`tavlaki`, `convexUrl.ts`). It must match `scheme` in `app.json` and `trustedOrigins` in `convex/auth.ts`; `convexUrl.test.ts` checks both.
- **Jest:** the `@/services` fake (`jest.setup.ts`) gives the in-memory sign-in and server (`apps/mobile/test/onlineFake.ts`). One server serves `games`, `invites`, `onlineServer()`, `gameTransportFor` and `invitesFor`. `games` and `invites` act as the user signed in to `auth` at each call, and fail `NOT_SIGNED_IN` with nobody signed in. Each test starts with a new server, no cached transports, no dev game ids and nobody signed in (`test/afterEnv.ts`). A test makes games with `onlineFake.server().createGame(...)`.

### Not done yet

- **The app screens** for Sign in with Apple and saving a guest (#401), and the privacy policy for the Apple id and email the server can now keep (#401).
- **A known limit:** two first sign-ins at the same moment with the same new Apple id can leave one extra user with no key (the claim keeps the key with one user). That user has no data and no way in.

## Invites

Owner answer Q10: friends find each other by invite link (and later by username). Issue #252 builds the server part. A player makes an invite and shares its code, later as the link `https://tavlaki.com/i/<code>`. A friend accepts it, and the server starts the game. The app screen and the link route (`tavlaki://invite/<code>`) are in [App shell → Invites](app-shell.md#invites-256) (#256); they use the `Invites` port on the in-memory server until sign-in is wired.

### `invites`

| Field | Type | Notes |
|---|---|---|
| `code` | string | 8 characters from `INVITE_CODE_ALPHABET`, stored in capital letters. Unique. |
| `from` | string | The player id of the inviter. The inviter plays white. |
| `choice`, `targetPoints`, `turnTimeMinutes` | as in `games` | The game the inviter picked |
| `status` | `open` · `accepted` · `declined` · `cancelled` · `expired` | |
| `expiresAt` | number | Epoch ms (server clock): the time of `createInvite` + `INVITE_TIME_MS` (24 hours) |
| `gameId` | id · `null` | The game, once `accepted` |
| `answeredBy` | string · `null` | The player who accepted or declined |

Indexes: `by_code` (on `code`) and `by_from` (on `[from, status, expiresAt]`, for "my open invites" and the [cap](#cap-on-open-invites)). The open invites of one player whose time is not up are one range: `status = open` and `expiresAt > now`.

### Codes

- **8 characters** from `INVITE_CODE_ALPHABET` (contracts): the digits 2–9 and the capital letters without `I`, `L` and `O`. So there is no `0`/`O` or `1`/`I`/`L` to mix up. 31 characters give about 850 billion codes.
- **Random from Web Crypto:** `newInviteCode(createCryptoRng())`. Each character takes one uint32; values at the top of the range that would make some characters more common are drawn again.
- **A clash** (the code is in the table, in any status) makes the server try again with a new code, up to 10 times. Codes are never used again, also after the invite closes.
- **Not case sensitive:** `normalizeInviteCode` (contracts) drops spaces at the ends and turns the text into capital letters. Every call takes the code in any case. A text that cannot be a code (wrong length or character) is `BAD_REQUEST`; `getInvite` returns `null` for it.

### Flow

```
inviter                 server                                   friend
  │ createInvite ─────► insert invite (open, expiresAt = now + 24 h)
  │ ◄──── code          schedule expireInvite at expiresAt
  │ share the code ─────────────────────────────────────────────► │
  │                     acceptInvite (one transaction) ◄───────── │
  │                     1. code well formed?       → BAD_REQUEST
  │                     2. invite with this code?  → INVITE_NOT_FOUND
  │                     3. status at now: open?    → INVITE_EXPIRED when the
  │                        time is up (marked or not), else INVITE_CLOSED
  │                     4. not your own?           → OWN_INVITE
  │                     5. insertGame (white = inviter): waits for
  │                        both opening dice, turn clock
  │                     6. invite → accepted, gameId
  │ ◄── getInvite / listMyInvites / getGame (reactive) ─────────► │ gameId
```

`acceptInvite` and the internal `createGame` share one helper: `insertGame` in `games.ts`. If the game cannot start, the whole call rolls back and the invite stays open.

### Calls

As with games, no call takes a player id. The caller is the signed-in user, and a call with no sign-in throws `NOT_SIGNED_IN`.

| Call | Who may call | What it does |
|---|---|---|
| `createInvite(choice, targetPoints, turnTimeMinutes)` | anyone signed in | A new open invite from the caller. Rejects a caller at the [cap](#cap-on-open-invites) with `TOO_MANY_INVITES`, then a bad match length (an integer of 1 or more) with `BAD_REQUEST`. Returns the code. |
| `getInvite(code)` | anyone signed in with the code | `InviteView` or `null` |
| `acceptInvite(code)` | anyone signed in but the inviter | The flow above. Returns the `gameId`. |
| `declineInvite(code)` | anyone signed in but the inviter | Marks the invite `declined`. |
| `cancelInvite(code)` | only the inviter | Marks the invite `cancelled`. |
| `listMyInvites()` | anyone signed in | The open invites the caller sent, newest first. Invites whose time is up are left out. The app watches it (`watchMyInvites`, #314). |
| `expireInvite(inviteId)` | internal (the scheduler) | Runs at `expiresAt`. Marks the invite `expired` if it is still open. |

Decline and cancel check the invite like accept: open (`INVITE_CLOSED`) and in time (`INVITE_EXPIRED`). The inviter cannot decline (`OWN_INVITE`); another player cannot cancel (`NOT_YOUR_INVITE`).

### Expiry

An invite lasts **24 hours** (`INVITE_TIME_MS`; the owner kept it, Q31 in `docs/open-questions.md`). `createInvite` schedules `internal.invites.expireInvite` at `expiresAt`, as `checkTimeout` does for turns. If it runs too early, it schedules itself again. The calls check the time as well: at or after `expiresAt` (`now >= expiresAt`) an open invite counts as expired, also before the scheduler has marked it. `getInvite` then shows `expired` and `listMyInvites` leaves it out. An expired accept throws `INVITE_EXPIRED` and saves nothing; the scheduled `expireInvite` marks the row.

### Cap on open invites

One player may have at most **10** open invites at a time (`MAX_OPEN_INVITES`, #275). Each invite is a row and a scheduled `expireInvite`, and a guest account is free, so without a cap one user could fill the table. `createInvite` reads the caller's open invites whose time is not up on the `by_from` index (at most 10 rows), counts them with `countOpenInvites` and checks them with `checkInviteCap` (both in `@tavli/online`). At the cap it throws `TOO_MANY_INVITES` and saves nothing: no row, no scheduled expiry. An invite frees its place once it is accepted, declined or cancelled, and at `expiresAt`, also before the scheduled `expireInvite` marks it. The cap is per player: other players are not affected. The in-memory server runs the same check. Convex runs each mutation as one serializable transaction, so two calls at the same time cannot both take the last place.

### The Convex invites adapter

`createConvexInvites({ client })` in `@tavli/backend-convex` (`src/invites.ts`, #281) is the `Invites` port on the Convex client. The client needs `onUpdate`, `mutation` and `query` (`ConvexInvitesClient`; `ConvexClient` fits). The app puts it on the same client as the games.

- **The port** (`packages/contracts/src/invite.ts`) has `createInvite({ choice, targetPoints, turnTimeMinutes })`, `getInvite`, `watchInvite(code, onView, onError)`, `acceptInvite`, `declineInvite`, `cancelInvite`, `listMyInvites` and `watchMyInvites(onList, onError)` (#314). No call takes a player id.
- **`watchInvite`** watches `getInvite`, like `subscribe` for a game: each view (or `null`) waits one microtask, so nothing arrives inside `watchInvite` or after its stop function. Views are copies.
- **`watchMyInvites`** (#314) watches the existing `listMyInvites` query (`client.onUpdate`), like `watchMyGames`: no new server function and no new data. Convex runs the query again when one of the caller's invites changes: a new invite, an answer, a cancel, and the scheduled `expireInvite`. It does not run again when time alone passes, but the scheduled `expireInvite` patches the row at `expiresAt`, which is a change. The app keeps each invite until the list drops it, so a wrong phone clock never hides an open invite; it only says "Expiring now".
- **Errors.** A `ConvexError` whose `data` passes `isInviteErrorData` rejects (or goes to `onError`) with `{ code, message }` (`toInviteError`). `NOT_SIGNED_IN` maps the same way. Any other error stays as it is.
- **Names, not `api`.** `INVITE_FUNCTIONS` (`src/functions.ts`, with `INVITE_FUNCTION_NAMES`) names the functions in `invites.ts`, as `GAME_FUNCTIONS` does for the games. `convex/convexInvites.test.ts` checks the names and the argument and return types against `api`.
- **Offline test:** `apps/server/convex/convexInvites.test.ts` runs `invitesContract()` through the adapter on the real functions (fake clients from `test.network.ts`), plus no sign-in, a bad argument, the inviter watching an accept, the cap (`TOO_MANY_INVITES` as plain data) and the scheduled expiry reaching a watcher. `packages/adapters/backend-convex/src/invites.test.ts` checks the mapping on a fake client.
- **In the app:** `invites` in `apps/mobile/src/services.ts`. Dev invites (`/dev/online`) stay on the in-memory server (`invitesFor`).

### Errors

A rejected invite call throws a `ConvexError` whose `data` is `{ code, message }` (`InviteErrorData`, `isInviteErrorData` in contracts). The codes are `INVITE_ERROR_CODES`: `INVITE_NOT_FOUND`, `INVITE_EXPIRED`, `INVITE_CLOSED`, `OWN_INVITE`, `NOT_YOUR_INVITE`, `TOO_MANY_INVITES` (only `createInvite`), `BAD_REQUEST` and `NOT_SIGNED_IN`. If `insertGame` fails inside `acceptInvite`, the error is a game error (`GameTransportErrorData`).

## Push

ADR-0004 point 7: the server tells a player "your turn" in an **online** game, through the Expo Push Service, from a Convex action, behind the `PushProvider` port (#280). When a match ends, it tells the player who did not end it "game over" (#316, [Game over](#game-over)). This is the server part. The app part (ask for permission, get the token, register it, open the game on a tap) is #285: see [App shell → Turn notifications](app-shell.md#turn-notifications-285). The app calls `registerPushToken` and `removePushToken` through `createConvexPushTokens` (`@tavli/backend-convex`, `PUSH_FUNCTIONS`). All online games use push notifications, regardless of turn time.

### `pushTokens`

| Field | Type | Notes |
|---|---|---|
| `playerId` | string | The owner (the sign-in subject) |
| `token` | string | `ExponentPushToken[…]` or `ExpoPushToken[…]` (`isExpoPushToken` in `@tavli/push-expo`). One player at a time. |
| `platform` | `ios` · `android` | |
| `updatedAt` | number | Epoch ms (server clock) of the last register |

Indexes: `by_player` (on `[playerId, updatedAt]`, oldest first) and `by_token`.

### Calls

| Call | Who may call | What it does |
|---|---|---|
| `registerPushToken(token, platform)` | anyone signed in | Saves the token for the caller, or marks it fresh. A token of another player moves to the caller (the phone signed in to another account). Keeps at most `MAX_PUSH_TOKENS_PER_PLAYER` (5) per player: a new one drops the oldest, but never the token just registered (`tokensOverCap`), even on a tie of `updatedAt` or when another call's clock was ahead. A bad token shape is `BAD_REQUEST`. |
| `removePushToken(token)` | anyone signed in | Removes the token if it is the caller's (for example on sign-out). Another player's token stays, and the call does not say so. A bad token shape is `BAD_REQUEST`. |
| `turnPushTokens`, `removeDeadTokens`, `sendTurnPush` | internal | The send, below |

Neither public call takes a player id: both use `signedInPlayer(ctx)`. `registerPushToken` uses `existingPlayer(ctx)`, so a deleted account's token cannot save a token that nothing would remove (#306).

### When a push goes out

Every save in `games.ts` (`save`, and `insertGame` for a new game) calls `scheduleTurnPush(ctx, game, version, before, after, callerId)`. `before` and `after` are what the server waited for before and after the save (`turnWait`: the side from `waitingFor`, the side to move or the side that must answer a question, and the game number in the match, `match.games.length`). For a new game `before` is nobody. `callerId` is the player who caused the save, or `server` for a time out. `turnPushSide` picks the side to tell:

- only when the wait **moved to the other side**, or a **new game** of the match started. A time out ends a game, and the next game may wait for the same side again (with `nextGameStarter: "alternate"` or `"openingRoll"`); that player still gets a push. When the same side waits again in the same game (an Asodio extra roll, or White plays on after the mother question), there is no push;
- in the opening of a new match (#379) the wait follows `waitingFor`: a new match tells White to roll when Black made it (Black accepted an invite, or the internal `createGame` named Black). Black's die first leaves White waiting: no push. White's die first moves the wait to Black: Black gets one push. When the opening ends, the starter gets a push unless the starter rolled last. A tie after White's roll leaves White waiting again: no push;
- never when the match is over (that is a ["game over"](#game-over) push).

If that player has a token, the mutation schedules `sendTurnPush({ gameId, version, playerId })` with `runAfter(0)`. The action runs after the save is committed, so a push problem never fails or undoes a move. It reads the player's tokens and the turn deadline (`turnPushTokens`, newest first; no tokens when the game is no longer at `version`, so a late push is dropped), sends one message per token, and removes the tokens the push service calls dead (`DeviceNotRegistered`, `removeDeadTokens`). A player with no token costs no action.

Each message has `priority: 'high'`, so the phone shows it at once, and a **time to live** (`ttlSeconds`, Expo's `ttl`): the whole seconds left until the turn deadline (`turnPushTtl`). The push service drops the push after that, so a phone that comes back online days later never shows a stale "Your turn": the turn has timed out by then. An untimed turn is 24 hours, so a push lives at most 24 hours; a retry lives 30 s less. With no full second left (or no deadline), the action sends nothing.

A token whose push failed with `Failed` (the network, a request with no answer in 10 s, an HTTP 429 or 5xx, an answer we cannot read) or `MessageRateExceeded` gets **one** more try: the action schedules itself again after `PUSH_RETRY_MS` (30 s) with `attempt: 1` and only those `tokens` (`retryTokens`). The retry does the same version check, so it is dropped when the player has played since. A retry that fails again is not retried (`MAX_PUSH_RETRIES` = 1), and a failed token is not removed.

### Game over

Issue #316. A match that ends waits for nobody, so `turnPushSide` sends nothing. `scheduleTurnPush` also asks `matchEndPushSides(turnTimeMinutes, before, after, caller)` (`turnWait` has `over`: the match is over):

- only the save that **ends the match** (`after.over`, not `before.over`), and in every online game;
- after a winning move or a resign, the player who **did not end it**: never the caller, who sees the result;
- after a time out (`checkTimeout`, the caller is the server), **both** players;
- a game that ends while the match goes on starts the next game: that save sends "your turn" (above), not "game over". The two rules never pick for the same save (`model/push.test.ts` checks every case), so one save sends one kind of push.

Every save path goes through it: `save` (`makeMove`, `answer`, `resign`, `resignAs`, `checkTimeout`) and `insertGame` (a new match never ends at once). An account delete resigns the deleted player's games through `resignAs`, so the other player gets "game over"; the deleted player's tokens are gone, and they are the caller anyway.

It uses the same action, `sendTurnPush`, with `kind: 'matchEnd'` (`kind` may be missing and means `turn`, so jobs scheduled before a deploy still run). The message (`matchEndMessages`) has `priority: 'normal'`: nothing waits for the player and no clock runs, so the phone may hold it to save power. Its time to live is one day (`MATCH_END_PUSH_TTL_SECONDS`): there is no turn deadline, and an older note is no use. The retry works as for "your turn". The staleness check is `pushStillDue`: the game must still be at the saved `version` and **finished**. No save changes a finished match, so its version stays and the retry goes out.

### The text

`TURN_PUSH_TEXT` and `MATCH_END_PUSH_TEXT` in `convex/model/push.ts`, the one place: "your turn" is title "Your turn", body "An online game is waiting for your move."; "game over" is title "Tavlaki", body "Your game is over. See the result." (it does not say who won). English only for now: the server does not know the player's language. A later issue adds a locale field (on the token or the player) and picks the text by it. No names and no emails. `data` holds only `gameId`, so the app can open the game.

### The port and the adapter

- **Port:** `PushProvider` (`packages/contracts/src/push.ts`): `send(messages)` with `{ to, title, body, data: { gameId }, priority?, ttlSeconds? }`. It resolves with one `PushResult` per message, in order: `{ ok: true }` or `{ ok: false, error, message }`, where `error` is one of `PUSH_ERROR_CODES` (`DeviceNotRegistered`, `MessageTooBig`, `MessageRateExceeded`, `InvalidCredentials`, `Failed`). It never rejects.
- **Contract checks:** `pushProviderContract()` in `@tavli/contracts/testing`, plain async functions. The recording provider (`createRecordingPushProvider`) and the Expo adapter (on a fake `fetch`) run them.
- **Adapter:** `@tavli/push-expo` POSTs to `https://exp.host/--/api/v2/push/send`, at most 100 messages per request, with `fetch` only. A request with no answer in `EXPO_PUSH_TIMEOUT_MS` (10 s, option `timeoutMs`) is cut off (an `AbortSignal`, and the adapter stops waiting even when `fetch` ignores it): its messages are `Failed`, so they get the retry long before the Convex action's time limit. No access token is needed now. If push security is turned on for the Expo project, set `EXPO_ACCESS_TOKEN` on the deployment (`npx convex env set`); `push.ts` passes it. Never put it in the repo.

### How tests fake the sender

`push.ts` makes the Expo sender on first use and keeps it in a module variable. `setPushProvider(provider)` swaps it; `null` goes back to Expo. convex-test loads the modules in the test's own Vite module graph (`modules` in `test.setup.ts`), so the action sees the swap. `push.test.ts` sets a recording provider in `beforeEach` (`kill(token)` makes a dead token, `fail(token, error)` a failing one, `revive(token)` makes it work again) and clears it in `afterEach`. The retry runs on the fake clock: `vi.advanceTimersByTime(PUSH_RETRY_MS)` + `t.finishInProgressScheduledFunctions()`. No test reaches the network. A pure function that takes the sender would also work, but the test would then skip the real action, its version check and the token cleanup.

### Notes and open points

- **Sign-out:** `removePushToken` needs a live session (`signedInPlayer`). The app must call it **before** it signs out; after sign-out the call gets `NOT_SIGNED_IN` and the token stays with the old player until another player registers it, the push service calls it dead, or the cap drops it.
- **A token moves to the newest caller on purpose:** `registerPushToken` with a token another player holds moves it to the caller. One phone has one token, and it now belongs to the user signed in on it. So a token is treated as a **secret of the phone**: the app never shows it, never logs it and never sends it anywhere but `registerPushToken` and `removePushToken`. Someone who knows another phone's token could move it to their own account: that phone would then stop getting its owner's pushes. A push holds only a fixed text and a game id, so nothing else leaks.
- **Language:** the push text is English only (see [The text](#the-text)). A locale field comes later.
- **No expiry job yet:** a player keeps at most 5 tokens (`MAX_PUSH_TOKENS_PER_PLAYER`), and a token is dropped when the push service answers `DeviceNotRegistered`. Nothing removes a token that only went quiet. A scheduled job that removes tokens by an old `updatedAt` is a follow-up.

## Delete an account

Issue #302. App stores ask for in-app account deletion. The server part is the public mutation `deleteMyAccount` in `convex/account.ts`. The app calls it **Delete my online data** (#315, see [In the app](#in-the-app)). It takes no arguments: the caller comes from `existingPlayer(ctx)` ([Who calls](#who-calls)).

### What it does

One transaction. If any step throws, nothing is deleted. Two steps go on after the call, in pages: the active games past the first page (step 2) and the closed invites (step 7).

1. **Checks the user still exists.** A Convex token stays valid until it expires (15 minutes, the `convex` plugin's default), also after its user is deleted. So the call reads the Better Auth user (`existingPlayer`). No user: `NOT_SIGNED_IN`. A second call after a delete gets this clean error.
2. **Active games:** the caller resigns each one (`resignAs` in `games.ts`, the same checks and the same `save` as `resign`). The other player wins the match. The save bumps the version, so the turn timer's check does nothing, it deletes the game's [draft](#drafts) (#374), and `scheduleTurnPush` runs as on every save (a resign ends the match: the other player gets ["game over"](#game-over), nobody gets "your turn"). Nothing caps a player's active games (each accepted invite starts one), so the call resigns only the first `GAME_RESIGN_PAGE` (25) of them (#309). One resign reads the game, writes it and one `moves` row, and runs the engine once. So 25 make about 50 writes, far below Convex's limit of 16,000 per transaction. The run time (Convex allows 1 second) is an estimate, not measured. When the page was full, the call schedules the internal mutation `resignActiveGames`, which resigns the next page (`by_white`, then `by_black`) and runs again while its page was full. See [Games after the call](#games-after-the-call).
3. **Finished games** (and the games just resigned) stay for the other player, as they are. See [What is kept](#what-is-kept).
4. **Open invites:** the caller's open invites whose time is not up are deleted (`openInvitesOf` in `invites.ts`), so nobody can accept one. The cap keeps them few (at most `MAX_OPEN_INVITES`). An open invite's scheduled `expireInvite` then finds no row and does nothing. Invites someone else sent stay, also when the caller answered them.
5. **Push tokens:** every `pushTokens` row of the caller is deleted. So are the key claims (`authKeys`), and the caller's Apple tokens move to the revoke queue (`appleRevokes`, no user id): the revoke at Apple runs after the call ([Apple tokens and the revoke](#apple-tokens-and-the-revoke), #398).
6. **Better Auth:** the user, its sessions and its accounts (Apple, Google, … once they exist) are deleted with Better Auth's own delete, `internalAdapter.deleteUser`, from `createAuth(ctx).$context`. It runs on the component's tables through the component adapter, with Better Auth's database hooks. It is the step that the `/delete-user` route and the anonymous plugin's `/delete-anonymous-user` route run too.
7. **The other invites** (accepted, declined, cancelled, expired) are deleted after the call, in pages (#306). Nothing prunes finished invites, so a player can have many, and one Convex transaction may write at most 16,000 documents. The call schedules the internal mutation `deleteSentInvites`. Each run deletes up to `INVITE_DELETE_PAGE` (200) invites of the caller (`by_from`) and runs again when its page was full. Nobody can accept these invites (they are closed or their time is up), and no new one can come in: the user is gone, so `createInvite` refuses the old token.

Push tokens stay in the main transaction: they are capped (`MAX_PUSH_TOKENS_PER_PLAYER`, 5).

### Games after the call

Issue #309. For a moment after the call, a game of the deleted player can still be active, until its page runs.

- **No new game starts.** A game between two people starts only from `acceptInvite`. The call deletes the caller's open invites, and the caller can no longer accept one (`existingPlayer` finds no user). So the pages only shrink the set of active games.
- **Every game is reached.** Each run reads the active games from the start of both indexes again. A run whose page was not full saw every active game left, so none is missed. A game that ended in between (a turn timer, the other player's resign) is just not active any more.
- **The other player is not stuck while the pages run.** The turn timer (`checkTimeout`) reads no user, so it times out a turn of the deleted player as usual.
- **A run that throws stops the chain.** Convex does not run a failed mutation again, so the games after it would stay active. This cannot happen today: a resign of an active game of the player does not throw. If it ever did, only the turn timer would be left. It ends the current game, not the match (so a longer match needs one time out per game), and only when the server waits for the deleted player.
- **The old token** is valid for up to 15 more minutes, and `makeMove`, `answer` and `resign` take any signed-in caller (`signedInPlayer`). So in that moment it could still play in a game that is not resigned yet. That saves nothing new about the player: the game already holds the id.

The pure part, what happens to each game (`gameOnDelete`: `resign`, `keep` or `skip`), is in `convex/model/account.ts`.

### In the app

Issue #315. The app shows no account, so Settings → Privacy says **Delete my online data** ([App shell](app-shell.md#delete-my-online-data-315)). The port is `OnlineData` (`packages/contracts/src/online-data.ts`, one call: `deleteMyData()`; contract checks `onlineDataContract` in `@tavli/contracts/testing`). On Convex it is `createConvexOnlineData` (`@tavli/backend-convex`, `src/onlineData.ts`): it calls `deleteMyAccount`, named in `ACCOUNT_FUNCTIONS` (`src/functions.ts`). `convex/convexOnlineData.test.ts` checks that name against `api` and runs the contract checks through the adapter on the real function. The in-memory server has `onlineDataFor(playerId)` with the same steps (resign, cancel the open invites, forget the player) for the app's Jest tests and dev games.

The app removes the push token first, then deletes, then signs out (`deleteOnlineData` in `apps/mobile/src/features/online/deleteData.ts`). `NOT_SIGNED_IN` from the delete counts as done: the data is gone already. Better Auth's sign-out still answers after the user is deleted (`account.test.ts`: the old session cookie reaches `/api/auth/sign-out`, and no session row is left), so a retry never gets stuck.

### Why not Better Auth's delete route

Better Auth's `deleteUser` API (`/delete-user`) needs a request with a session, and refuses a session older than its `freshAge` (1 day) unless the user sends a password. Guests have no password, and the call would not run inside our transaction. `internalAdapter.deleteUser` needs neither and runs in the mutation.

Both delete routes are **off**, so no client can delete a user without steps 2–5 and 7: `/delete-user` because `user.deleteUser` is not enabled, `/delete-anonymous-user` through `disabledPaths` in `auth.ts`. `account.test.ts` checks that both answer 404.

### What is kept

- **Finished games and their `moves`** stay, so the other player keeps their history. The caller's player id stays in them (in `players`, in the stored flow and in the log). We keep the id and do not swap in a fixed "deleted player" id: the id is a random string that names nobody once the Better Auth user is gone, our tables hold no name, email or profile, and the id is in the stored flow and in every log row, so a swap would be a large rewrite. **A later issue that adds a name or a profile field to our tables must clear it here.**
- **Invites someone else sent** that the caller answered (`answeredBy`) stay with their sender.

### Errors

- No sign-in, or no Better Auth user for the token: `NOT_SIGNED_IN`.
- After the delete, the old token is valid for up to 15 more minutes. The calls that save the caller's id (`createInvite`, `acceptInvite`, `declineInvite`, `registerPushToken`) check the user (`existingPlayer`) and get `NOT_SIGNED_IN` (#306), so no row is saved under the deleted id. The other calls still pass `signedInPlayer`, but save nothing: once the game pages ran, the caller has no active game and no invite that is still open (see [Games after the call](#games-after-the-call)). See [Who calls](#who-calls).

## Update needed

Issue #390. A server deploy can break older app builds (#380). The owner then sets the lowest build that still works, and an older build shows the "Update needed" screen with one button, **Update** (TestFlight on iOS, Google Play on Android). The app side is in [App shell → Update needed](app-shell.md#update-needed-390).

### The env vars

The policy lives in the deployment's env vars, so the owner changes it with no deploy (Convex dashboard → the deployment → **Settings** → **Environment Variables**, or `pnpm exec convex env set <name> <value> --prod` in `apps/server`). None is a secret.

| Name | Value | When it is not set |
|---|---|---|
| `MIN_APP_BUILD_IOS` | The lowest iOS build number (`CFBundleVersion`, the EAS build number) that works, a whole number above 0 | No iOS build is blocked |
| `MIN_APP_BUILD_ANDROID` | The same for Android (`versionCode`) | No Android build is blocked |
| `FORCE_APP_UPDATE` | `true` or `1`: an older build shows the screen at once, also in the middle of an online game (breaking changes). Both phone systems | Older builds wait until the player leaves the game screen |
| `APP_UPDATE_URL_IOS` | Where Update goes on iOS, for example a TestFlight public link or the App Store page | The TestFlight app (`itms-beta://`), then the TestFlight page in the App Store |
| `APP_UPDATE_URL_ANDROID` | Where Update goes on Android | `market://details?id=<app id>`, then the Google Play web page |

A value that is not a whole number above 0 (a typo, `0`, `-3`) blocks nothing: a typo must never lock every player out. Any other `FORCE_APP_UPDATE` value counts as off. The parsing is `appUpdatePolicy` in `convex/model/appUpdate.ts`.

### The call

- `updatePolicy({ platform: 'ios' | 'android' })` is a query. It answers `{ minBuild, force, updateUrl }` (`AppUpdatePolicy` in `@tavli/contracts`) for that phone system.
- **No sign-in.** It is the one public function that does not call `signedInPlayer`: an old build may have no session, or a session the new server cannot read, and it must still learn that it is too old. It reads no table and returns nothing about players, so there is nothing to guard.
- **It sends the phone system only.** The app compares its own build on the phone, so the server never learns the build number, and nothing is stored. The privacy policy needs no change.
- The app adapter is `createConvexAppUpdates` (`@tavli/backend-convex`, `APP_UPDATE_FUNCTIONS`); `convex/convexAppUpdates.test.ts` checks its name and types against `api`.

### Deploy note

The function must be on a deployment before the env vars do anything. Deploy to prod once ([Deploy to prod](#deploy-to-prod)) before the first build that has the screen goes out. A build from before #390 never asks, so it cannot be blocked: only builds with the screen can be told to update. The owner's steps are in [Running the app → Update needed](../process/running-the-app.md#update-needed-390).

## Tests (offline)

`pnpm test` runs Vitest in `apps/server` with the **edge runtime** environment (`@edge-runtime/vm`), as the convex-test docs say. convex-test runs the real functions against an in-memory database, with schema checks.

- `convex/games.test.ts` (convex-test): a full Portes game between two players with server dice (and the log replays to the saved game), an illegal move, a wrong player and a stranger, an old version (two phones at once), resign ends the match, the Plakoto mother question (only the pinned player answers; `playOn` and `resign`; a late answer times out), a missing game. Turn timers with `vi.useFakeTimers()` and `t.finishInProgressScheduledFunctions()`: a live time out loses the game and the next game starts; the match ends on the last point; a move just in time is fine and the old check does nothing; a late move gets `TIMED_OUT` and the time out is saved; an untimed game waits 24 hours; resign stops the clock. Sign-in (#131): each call runs as a convex-test identity (`t.withIdentity({ subject })`); every function refuses a call with no identity (`NOT_SIGNED_IN`, nothing saved); a stranger cannot read a game (`NOT_A_PLAYER`); a new session of the same user plays on; bad subjects get `BAD_REQUEST`. `listMyGames` (#296): at most 50 games, the newest of both sides; a save moves a game to the top and a resign to `finished`; a game with no `updatedAt` comes last; no other player's id. Every test in the file uses fake timers, so no turn check fires on its own.
- `convex/model/cryptoRng.test.ts`: the secure RNG.
- `convex/push.test.ts` (convex-test, fake timers, a recording sender): register and remove; no sign-in; a subject with no Better Auth user cannot register (#306); a bad token shape; a stranger cannot remove a token; a token moves to the new player; the cap of 5, which never drops the token just registered; a turn sends one push to the other player; a new game tells the first player only when they did not start it; every phone of the player; no token, no action; a dead token is removed; the same player again (after the mother question) sends none; resign sends no "your turn"; a late push does nothing; a push after the turn deadline does nothing; a failed push leaves the game alone; a time out tells the winner who starts the next game, and tells the side that ran out of time when the next game waits for it again (`alternate`); a failed push is tried once more after 30 s for the failed tokens only (with the time to live left in the turn), and not a third time; a rate-limited push goes out on the retry; a retry is dropped when the player has played since. "Game over" (#316): a winning move (`lastBearOff`, so the dice cannot change the result) tells the other player, never the caller; a resign tells the other player; a time out that ends the match tells both; an untimed game sends none (win, resign, time out); a game that ends while the match goes on sends only "your turn"; no token, no action; a failed "game over" is tried once more after 30 s (the version check lets it go out) and not a third time; a "game over" for a match that still runs sends nothing.
- `convex/model/push.test.ts` (pure): `turnPushSide` (a new game of the match, never the caller), `matchEndPushSides` (never with the turn push, never the caller), `turnWait` (with `over`), the messages (high priority and the turn ttl; "game over" normal priority for one day), `pushMessages`, `pushStillDue`, `turnPushTtl`, the dead tokens, the retry tokens and the cap (it keeps the token just registered).
- `convex/invites.test.ts` (convex-test, fake timers, real Better Auth users from `authUsers`): create and accept starts a game that `getGame` shows (the inviter is white); accept twice; your own invite; decline and cancel (and who may call them); an unknown and a malformed code; codes in any case; a code clash (a spy on `crypto.getRandomValues`); the cap on open invites (`TOO_MANY_INVITES` and nothing saved; accept, decline, cancel and expiry free a place, also before the scheduler runs; another player is not affected); a game error rolls the accept back; the invite expires at 24 hours and accept, decline and cancel then fail; an accept just in time; `listMyInvites`; every call refuses a call with no identity; the calls that save the caller's id refuse a subject with no Better Auth user (#306); the inviter is the identity; a stranger cannot read the new game. It also runs the `invitesContract()` checks on the real functions (#256).
- `convex/auth.test.ts` (convex-test with the Better Auth component, `register` from `@convex-dev/better-auth/test`): the `/api/auth` routes answer; a guest signs in over HTTP and gets a Convex token whose `sub` is the user id; that identity makes an invite.
- `convex/account.test.ts` (convex-test with the Better Auth component, fake timers, a recording sender): Alice and Bob sign in as guests over HTTP. Alice, with an active game, a finished game, two invites, two push tokens and a linked account, deletes her account: Bob sees the active game won by her resign; the finished game is unchanged; her open invite, tokens, Better Auth user, session and account are gone, her cancelled invite goes in the scheduled `deleteSentInvites`, and Bob's stay; Bob gets one "game over" push (#316), nobody gets "your turn", and the turn timer does nothing. A second call, no sign-in and a token with no user get `NOT_SIGNED_IN`. After the delete, the old token gets `NOT_SIGNED_IN` from `createInvite`, `registerPushToken`, `acceptInvite` and `declineInvite`, and nothing is saved (#306); nobody can accept her open invite. An open invite whose time is up but that `expireInvite` has not closed yet stays after the call, gets `INVITE_EXPIRED` on accept, and is gone after `deleteSentInvites` (#309). `deleteSentInvites` deletes 2 pages + 1 invites in three runs and leaves Bob's. With 2 pages + 2 active games, the call resigns one page, a turn timer that runs out in between still ends one game, and `resignActiveGames` resigns a full page, then a part of one, and stops; other players' games stay. With exactly one page, the call resigns all and one empty run schedules nothing more (#309). A guest with no data; an untimed game and several games; other players' games are not touched; the Better Auth delete routes answer 404; sign-out with the old session cookie still answers after the delete (#315).
- `convex/model/account.test.ts` (pure): `gameOnDelete`.
- `convex/model/appUpdate.test.ts` (pure, #390): no env vars, each value, invalid values (they block nothing), and the force flag.
- `convex/convexAppUpdates.test.ts` (convex-test, #390): `updatePolicy` with the env vars set and not set, with nobody signed in; a bad argument; the [adapter](#update-needed) through the fake clients, signed in or not; `APP_UPDATE_FUNCTIONS` against `api`.
- `convex/convexTransport.test.ts` (convex-test, fake timers): the `GameTransport` contract checks on the [Convex adapter](#the-convex-adapter) with the real functions; a late turn, no sign-in and a bad id through the adapter; the adapter's function names and types against `api`.
- `convex/convexOnlineData.test.ts` (convex-test, #315): the `OnlineData` contract checks on `createConvexOnlineData` with the real `deleteMyAccount`; `ACCOUNT_FUNCTIONS` against `api`.
- `convex/convexInvites.test.ts` (convex-test, fake timers, real Better Auth users from `authUsers`, #281): the `Invites` contract checks on the [Convex invites adapter](#the-convex-invites-adapter) with the real functions; no sign-in, a bad argument, an accept seen by the watching inviter, the cap and the scheduled expiry through the adapter; `INVITE_FUNCTIONS` against `api`.

`packages/online` (Vitest, pure, seeded RNG):

- `online-game.test.ts`: whole matches of every game choice with random legal turns and answers, replay equals the saved flow, no dice drawn ahead, error codes, the timer helpers and `timeOut`.
- `calls.test.ts`: the shared call checks, and `checkViewer` (who may read a game).
- `memory-server.test.ts`: the `GameTransport` contract checks, a whole match of each game choice through two transports, the turn timers on a fake clock, and `listMyGames` (the limit, a copy, a time out moves a game to the top). `watchMyGames` is in the contract checks.
- `summaries.test.ts`: `summarizeGame` (the facts of the view, a finished match, nothing about the other player, a stranger gets `NOT_A_PLAYER`) and the list order.
- `invites.test.ts` (seeded RNG): codes, the fair draw, clashes, the checks, the cap count and the view.
- `memory-invites.test.ts`: the `Invites` contract checks on the in-memory server, the game an accept starts, codes and clashes, an accept whose game cannot start (the invite stays open), and the cap on open invites (the same cases as on Convex).
- `memory-online-data.test.ts`: the `OnlineData` contract checks on the in-memory server, and what a delete resigns, deletes and keeps (#315).

The test files and `test.setup.ts` have two dots in their names, so Convex does not deploy them. The module glob in `test.setup.ts` uses a negative pattern (`['./**/*.*s', '!./**/*.*.*s']`): the extglob from the convex-test docs does not work with the Vite glob of Vitest 5.

## Deploy

The Convex project has two deployments (#129), both in the EU (`eu-west-1`):

| Target | Deployment | URL | Deploy key (GitHub secret) | App variants |
|---|---|---|---|---|
| dev | `exciting-reindeer-792` | `https://exciting-reindeer-792.eu-west-1.convex.cloud` | `CONVEX_DEPLOY_KEY_DEV` | `development`, `preview` |
| prod | `superb-dog-503` | `https://superb-dog-503.eu-west-1.convex.cloud` | `CONVEX_DEPLOY_KEY_PROD` | `production` |

The URLs are public client config. They live in `apps/mobile/app.config.ts` (see [Running the app](../process/running-the-app.md#which-server-the-app-uses)). The deploy keys are secrets. They live only in GitHub, never in the repo. `CONVEX_DEPLOY_KEY_DEV` is a repo secret. `CONVEX_DEPLOY_KEY_PROD` is a secret of the GitHub environment `production`, which only `main` may use, so no other branch or workflow can read it. Do not keep a repo secret of the same name as well.

Each deployment also needs the secret `BETTER_AUTH_SECRET` ([Sign-in](#sign-in)). The deploy does not set it: the owner sets it once per deployment, with a new random value for each (`openssl rand -base64 32`). The easy way is the Convex dashboard: the deployment → **Settings** → **Environment Variables**. The CLI works too, from `apps/server`: `pnpm exec convex env set BETTER_AUTH_SECRET <value>` (dev, then `--prod`). Without it, sign-in fails. Both deployments have it (set 2026-10-28).

### How a deploy happens

The workflow `.github/workflows/deploy-server.yml` does it:

1. **Dev, by itself:** on each push to `main` that changes `apps/server/**`, `packages/engine/**`, `packages/contracts/**`, `packages/online/**`, `packages/adapters/push-expo/**`, `pnpm-lock.yaml`, the root config (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`), the setup action or the workflow. When the functions import another package, add its path there.
2. **Check the key.** The first step runs before any repo code. It fails with an `::error::` when the secret is empty, or when the key is for another deployment (a deploy key starts with `dev:<name>|` or `prod:<name>|`). It never prints the key. It also fails on a space or a line break around the key. For a Convex key of the wrong deployment or type, the error shows only the part before `|` (the key type and the public names), so you can see which key is stored; for any other text it shows nothing of it. A `project:` or `preview:` key fails too: it does not name one deployment.
3. **Test.** Install (`.github/actions/setup`), then `pnpm --filter @tavli/server typecheck` and `pnpm --filter @tavli/server test`.
4. **Deploy.** `pnpm exec convex deploy --typecheck enable` in `apps/server`, with `CONVEX_DEPLOY_KEY` from the secret. Convex typechecks with `convex/tsconfig.json`, writes `_generated/` again, bundles the functions, and pushes the functions, the schema and the indexes. With `--typecheck enable`, the deploy fails when the typecheck fails or cannot run. (The default, `try`, skips the typecheck when `convex/tsconfig.json` is missing.)

It never runs on pull requests, so PR code never sees a deploy key. Two deploys to the same target never overlap (one `concurrency` group per target), and a running deploy is never cancelled.

### Deploy to prod

1. Merge the change to `main`. Wait for the dev deploy to pass, and try it on a `development` build.
2. GitHub → **Actions** → **Deploy server** → **Run workflow**. Pick the branch `main` and the target `prod`.
3. The job runs in the GitHub environment `production`, which holds `CONVEX_DEPLOY_KEY_PROD` and allows only `main`. The owner can add **required reviewers** there (Settings → Environments → `production`). Then each prod deploy waits for an approval. Dev runs use the environment `development`, with no rules.

A prod run from any branch but `main` fails at the first step.

### Roll back

A rollback is a new deploy of the old code:

1. Revert the bad commit on `main` with a PR (`git revert`). Its merge deploys dev again.
2. If prod has the bad code, run **Deploy server** with the target `prod` from `main` again.

A deploy does not change the stored data. Convex refuses a schema that the stored data does not match, so a rollback that removes a field or a table can fail. Then fix forward: keep the field optional in the schema, or clean up the data first.

## The in-memory server

`createMemoryGameServer({ rng, now })` in `@tavli/online` (#251) runs the same model and the same call checks as the Convex functions, with games in a `Map`. The app, its tests and the Convex adapter can play against the real server model with no network and no account. Its API is in `packages/online/README.md`.

- `createGame(callerId, players, choice, targetPoints, turnTimeMinutes)` has the same rules as the internal Convex `createGame`. `transportFor(playerId)` gives that player's `GameTransport`. Its `listMyGames` lists that player's games like the Convex query (`summarizeGame`, `latestGames`); each save sets the game's `updatedAt` to `now()` (a time out from `runDueTimeouts()` to its deadline). Its `watchMyGames` sends a new list to each watcher after each save and each new game, and only when that player's list changed.
- It acts like a network: `subscribe` calls `onView` on a later microtask (never inside the call), every call waits one microtask, and views, requests and log events are copies (a JSON round trip).
- It has no sign-in: `transportFor(playerId)` stands for that user, signed in. Errors reject with plain `GameTransportErrorData`, with the server codes. A missing game calls `onError` with `NOT_FOUND`, and a stranger's `subscribe` calls it with `NOT_A_PLAYER`.
- Time comes from `now()`. `runDueTimeouts()` is the in-memory `checkTimeout`: it applies every time out whose deadline has passed, each at its own deadline, like the scheduler. A late `sendTurn` gets `TIMED_OUT`, and the time out is saved.
- `events(gameId)` is the event log (like the `moves` rows), so a test can `replay` it.
- Delete my online data (#315): `onlineDataFor(playerId)` gives that player's `OnlineData` port. Its `deleteMyData()` is the in-memory `deleteMyAccount`, in one go: it resigns the active matches, keeps the finished games and deletes the invites the player sent. After it, the id gets `NOT_SIGNED_IN` where Convex checks the user (`existingPlayer`): make, accept or decline an invite, and delete again.
- Invites (#256): `createInvite(callerId, choice, targetPoints, turnTimeMinutes)` makes an open invite, like the Convex mutation (the code comes from the server's `rng`, through `pickInviteCodeNow`, which shares its loop with `pickInviteCode`). It has the same [cap](#cap-on-open-invites): `TOO_MANY_INVITES` at 10 open invites (#275). `cancelInvite(callerId, code)` takes an open invite back, like the Convex `cancelInvite`. `invitesFor(playerId)` gives that player's `Invites` port, and `getInvite(code)` reads one invite. They use the same checks (`invites.ts`). `acceptInvite` starts the game through `createGame` (the inviter plays white); if the game cannot start, the invite stays open. No timer: an open invite counts as expired once `now()` reaches `expiresAt`. Errors reject with plain `InviteErrorData` (a game error with `GameTransportErrorData`).

### Contract checks

`gameTransportContract()` in `@tavli/contracts/testing` checks any `GameTransport`. The checks are plain async functions, so Vitest and Jest can both run them. The subject gives a way to create a game, a Plakoto game at the mother question, a game that White is not in (Black against the stranger), a missing game id, a transport per side (and for a stranger), a legal turn, and `passTime(ms)` to move the server clock. The checks: the first view arrives on a later tick; a legal turn reaches both players with `version + 1`, and the next view waits for a roll, with no dice; `rollDice` (#355) rolls only for the player the server waits for (the other player gets `NOT_YOUR_TURN`, a stranger `NOT_A_PLAYER`, an old version `STALE_VERSION`, a turn before the roll and a second roll `ILLEGAL_ACTION`), both players see the dice with `version + 1`, the roll keeps the turn deadline, and a pass waits for the other side's roll; a roll after the match gets `GAME_OVER` and one in a missing game `NOT_FOUND`; an old version gets `STALE_VERSION`; the wrong player gets `NOT_YOUR_TURN` and a stranger `NOT_A_PLAYER`; a stranger cannot watch a game (`subscribe` gets `NOT_A_PLAYER`); an incomplete turn gets `ILLEGAL_MOVE`; the mother question; resign finishes the match; no view after unsubscribe; a missing game gives `NOT_FOUND`; a view is a copy; `listMyGames` lists only my own games, newest first, and each summary matches my view; a change moves a game to the top; the status filter, and a finished game moves to `finished` (#296); `watchMyGames` sends the list on a later tick, then each change (a turn, a new game, a resign), lists only my own games, and sends nothing after stop (#297). The subject's `createGame` must make a watched list see the new game. Every rejection must pass `isGameTransportErrorData`. The in-memory server and the [Convex adapter](#the-convex-adapter) run them.

`invitesContract()` (#256) checks any `Invites`, the same way. The subject gives the inviter's id, a way to make an invite, the `Invites` of the inviter, a friend and a second friend, and `passTime(ms)` to move the server clock. The checks: `getInvite` shows an open invite for the code in any case; it resolves `null` for an unknown code and for text that is not a code; accept resolves with the game id and the invite shows it, and a second answer gets `INVITE_CLOSED`; decline closes the invite; the inviter gets `OWN_INVITE`; an unknown code gets `INVITE_NOT_FOUND` and text that is not a code `BAD_REQUEST`; the invite expires at `INVITE_TIME_MS` (then `INVITE_EXPIRED`); a view is a copy; `createInvite` gives a new code from the caller and refuses a bad match length; only the inviter cancels, and a late cancel gets `INVITE_EXPIRED`; `listMyInvites` lists the caller's open invites, newest first; `watchInvite` sends the invite later, then each change (accept, decline, cancel, expiry), until it stops (#281); `watchMyInvites` sends the caller's open invites later, then each change (a new invite, accept, decline, cancel, expiry), lists only the caller's own invites, gives each watcher its own copy, and sends nothing after stop (#314). Every rejection must pass `isInviteErrorData`. The in-memory server, the Convex functions (`apps/server/convex/invites.test.ts`) and the [Convex invites adapter](#the-convex-invites-adapter) (`convexInvites.test.ts`) run them.

## Codegen without a deployment

Convex code imports types from `convex/_generated/`. We **commit** these files, as Convex recommends. The CI checks never run codegen and need no account or secret. (The deploy writes `_generated/` again on the runner, but never commits it.)

The app uses a Convex component (Better Auth), so codegen needs a backend: the component's API comes from the push. `convex codegen --system-udfs` (the old offline way) does not know components, so it no longer works here. Instead, run:

```bash
pnpm --filter @tavli/server codegen   # node tools/codegen.mjs
```

`tools/codegen.mjs` runs Convex's **local backend** once, with no account and no keys: `convex dev --once` with `CONVEX_AGENT_MODE=anonymous` and `CONVEX_DEPLOYMENT=anonymous:anonymous-agent`. It hides any deploy key, so it never pushes to a cloud deployment. The first run downloads the backend binary from the Convex GitHub releases (it needs the network once). The local data lives in `apps/server/.convex/` (ignored). `convex dev` also writes `.env.local` and `convex/tsconfig.json`; the script puts back what was there before.

Run it after you add or rename a file in `convex/`. The push also checks what a real deploy checks. For example, **a module path may only hold letters, digits, `_` and `.`**: `model/crypto-rng.ts` failed (`InvalidConfig: Invalid module path`), so it is `model/cryptoRng.ts` now.

`_generated/` is skipped by ESLint and Prettier.

## Open points

- **Sign-in follow-ups:** Apple, Google and email magic link; moving a guest's games after an upgrade ([Not done yet](#not-done-yet)).
- **Invite limits:** one player may have 10 open invites ([cap](#cap-on-open-invites), #275), but nothing limits code guesses or how fast a player makes and cancels invites. With about 850 billion codes, a guess rarely hits. Add a rate limit per signed-in user.
- **Verify the dice** on a real deployment: `crypto.getRandomValues` in a mutation gives different, unpredictable dice per call.
- **Old data:** nothing deletes old invites, finished games or their moves yet. The privacy policy says we keep them until the player asks us to delete them.
- **Verify sign-in on a phone:** a guest sign-in on the dev deployment, the cookie in the secure store, and a token on the Convex socket. The tests cover the parts with fakes only.
- **A bad game id:** `getGame` and the mutations take `v.id('games')`. A string that is not a game id (for example from a broken link) fails argument validation, a plain error, not `NOT_FOUND`. The app should treat any non-port error on load as "cannot open this game".
- **Verify on a real deployment** that a mutation resolves only after the watched `getGame` shows its change (the offline test assumes it, as the Convex docs say).
- **Clock skew:** `turnDeadline` is on the server clock. A phone should show the time left from the server time (for example the offset seen when the view arrives), not trust its own clock.
- **Push follow-ups:** push receipts (Expo can also report a dead token later, in a receipt: a scheduled check of the receipts would remove those too); the text in the player's language.
- **Account deletion follow-ups:** the app screen (it calls `deleteMyAccount`, then signs out); a check of the Better Auth user on every call, so a deleted user's token stops at once ([Errors](#errors-2)); clear any name or profile field a later issue adds ([What is kept](#what-is-kept)).
- **Friends, usernames, users, presence**: later issues. The invite app screen and link route: #256. Play a friend (make, share, wait): #281.
- **Document size**: one game row holds the whole match flow (a few KB). The log is in `moves`, so the row does not grow with the game.
