# Online game service

Status: first version (#126, part of #46), with turn timers (#133), invites by code (#252), [my games](#my-games) (#296), ["your turn" pushes](#push) (#280), [sign-in](#sign-in) (#131), [account deletion](#delete-an-account) (#302), a [Convex client adapter](#the-convex-adapter) (#253) and its [invites adapter](#the-convex-invites-adapter) (#281). The game model is in the pure package `@tavli/online`, with an [in-memory server](#the-in-memory-server) (#251). It runs and is tested **offline**, with no Convex account. CI deploys it to Convex (#257, see [Deploy](#deploy)).

Decision: [ADR-0004](../decisions/0004-backend-auth.md) (Convex). Layout: [ADR-0002](../decisions/0002-modular-architecture.md).

## Where the code is

| Path | What it holds |
|---|---|
| `apps/server/convex/schema.ts` | The tables: `games`, `moves`, `invites` and `pushTokens` |
| `apps/server/convex/games.ts` | The Convex functions: the public `makeMove`, `answer`, `resign`, `getGame` and `listMyGames`, the internal `createGame` and `checkTimeout`, and `insertGame` (the one way to start a game). They keep only the database and scheduler parts. |
| `apps/server/convex/account.ts` | `deleteMyAccount` ([Delete an account](#delete-an-account)) |
| `apps/server/convex/model/account.ts` | The pure part of account deletion: `gameOnDelete` (resign, keep or skip a game) |
| `apps/server/convex/caller.ts` | `signedInPlayer(ctx)`: the caller's player id from the sign-in token ([Sign-in](#sign-in)) |
| `apps/server/convex/convex.config.ts` | The Convex app: it uses the Better Auth component |
| `apps/server/convex/auth.ts` | Better Auth: the component client and `createAuth` (anonymous, Expo and Convex plugins; the delete routes are off) |
| `apps/server/convex/auth.config.ts` | The token issuer Convex trusts: Better Auth on the deployment's site URL |
| `apps/server/convex/http.ts` | The HTTP routes: Better Auth under `/api/auth` |
| `packages/online/src/online-game.ts` | The game logic, with no Convex code. Pure: dice come from an `Rng` argument |
| `packages/online/src/calls.ts` | The checks around each call, shared by both servers: `checkNewGame`, `checkCall` (game, caller, version), `callTimedOut`, `scheduledCheck`, `nextDeadline`, `eventActor` |
| `packages/online/src/summaries.ts` | [My games](#my-games): `summarizeGame` (one game for one player), `newestFirst` and `latestGames` (the list order and limit), shared by both servers |
| `packages/online/src/memory-server.ts` | The [in-memory server](#the-in-memory-server): the same logic, a `GameTransport` and an `Invites` per player |
| `packages/online/src/invites.ts` | The invite checks and codes, shared by both servers. Pure: `now` and the `Rng` are arguments (moved from `apps/server/convex/model/` in #256) |
| `apps/server/convex/model/cryptoRng.ts` | The dice RNG: `crypto.getRandomValues` |
| `apps/server/convex/invites.ts` | The invite functions ([Invites](#invites)) |
| `apps/server/convex/push.ts` | Push tokens and "your turn" pushes ([Push](#push)): `registerPushToken`, `removePushToken`, `scheduleTurnPush` and the action `sendTurnPush` |
| `apps/server/convex/model/push.ts` | The pure push parts: who gets a push (`turnWait`, `turnPushSide`), the text (`TURN_PUSH_TEXT`), the retry (`retryTokens`), the token cap |
| `packages/contracts/src/push.ts` | The `PushProvider` port, the push error codes and the recording provider |
| `packages/adapters/push-expo` | `PushProvider` on the Expo Push Service, with `fetch` only, and `isExpoPushToken` (its `README.md`) |
| `packages/contracts/src/invite.ts` | The `Invites` port, `InviteView`, the statuses, the error codes, the code alphabet and `INVITE_TIME_MS` |
| `apps/server/convex/_generated/` | Convex codegen output, committed (see [Codegen](#codegen-without-a-deployment)) |
| `apps/server/convex/tsconfig.json` | The typecheck that `convex deploy` runs before it pushes |
| `.github/workflows/deploy-server.yml` | The deploy (see [Deploy](#deploy)) |
| `packages/contracts/src/game-transport.ts` | The `GameTransport` port, the `OnlineGameView` and `GameSummary` types, the paces, `TURN_TIME_MS` and `MAX_LISTED_GAMES` |
| `packages/contracts/src/auth.ts` | The `AuthProvider` port, `AuthUser`, the auth error codes and the in-memory provider |
| `packages/adapters/auth-better-auth` | `AuthProvider` on the Better Auth Expo client (its `README.md`) |
| `packages/adapters/backend-convex` | `GameTransport` and `Invites` on the Convex client ([The port](#the-port), [invites adapter](#the-convex-invites-adapter), its `README.md`) |
| `apps/server/convex/test.network.ts` | Fake Convex clients over one convex-test backend, one per signed-in user, for the adapter tests |

Only `apps/server` and the adapters (`auth-better-auth`, `backend-convex`) import `convex` and Better Auth. The ports in `packages/contracts` and `@tavli/online` are plain TypeScript. The app must not import server code, so it uses `@tavli/online` and the ports.

## Data model

Engine data is stored as **JSON text**. So Convex field rules never limit the engine shapes, and the engine stays the only owner of them.

### `games`

| Field | Type | Notes |
|---|---|---|
| `players` | `{ white, black }` strings | Player ids: the Better Auth user id of each player ([Sign-in](#sign-in)) |
| `choice` | `portes` · `plakoto` · `fevga` · `asodio` · `tavli` | What the players picked. `tavli` = the Portes → Plakoto → Fevga rotation. |
| `pace` | `live` · `async` | Turn time: 1 minute live, 24 hours async ([Turn timers](#turn-timers)) |
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
| `actor` | The player id who acted, or `server` (rolls, time outs, the next game) |
| `event` | The `FlowEvent`, JSON text, with the dice in it |

`replay(events)` from `@tavli/engine` rebuilds the exact game from these rows. The tests check this. It gives history and replays (L3) almost for free.

The server does not replay the log on every move: it loads `games.flow`, which only the server writes. So a move costs the same at turn 5 and at turn 500.

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
  │                             roll the next dice (secure RNG),
  │                             pass a roll with no move,
  │                             start the next game + opening roll
  │                          8. save flow, version + 1, log rows,
  │                             new turnDeadline + checkTimeout
  ◄──── getGame (reactive) ─ both phones see the new version
```

- **A turn is sent whole.** `moves` is every move for the current roll, in order. The engine checks each one (`nextMoves`), and the turn must be a full legal play. An incomplete turn is `ILLEGAL_MOVE`. Undo stays on the phone.
- **The server rests only where it waits for a player:** `moving` (play your roll) or `awaiting-answer` (a question). Everything else happens on the server, inside the same transaction (`advance`).
- **A roll with no legal move** passes by itself, as in the engine flow. `game.lastTurn` shows the dice of the pass.
- **Between games** the server starts the next game at once (with the opening roll, if the rules ask for one). The result of the finished game is in `match.games`. The finished game itself, as it ended, is the view's `previousGame` (#299): its `lastTurn` is the turn that ended it, and its board the end position. `advance` keeps it when it starts the next game: each step (`playTurn`, `answerPrompt`, `timeOut`, `resign`) returns a `SteppedFlow`, whose `endedGame` is the game the step ended, or `null`. Nothing plays the step again. A server reads the stored text once (`loadStored` gives the flow and `previousGame`) and saves with `storeStep(loaded, next)`: the step's `endedGame`, else the stored `previousGame`. `storeFlow(flow, previousGame)` takes the previous game as a required argument, so a new save path cannot drop it by mistake; a new match passes `null`. `listMyGames` does not use `previousGame` (summaries drop it).
- **Opening roll:** the server rolls it when the game starts (`insertGame`). `chosenStarterRolls` is not supported online; no preset uses it.

### Other calls

No public call takes a player id. The caller is the signed-in user ([Sign-in](#sign-in)). With no sign-in, every public call below throws `NOT_SIGNED_IN`. A client cannot call the internal ones.

A game between two people starts only from an accepted invite ([Invites](#invites)): `acceptInvite` calls `insertGame`. `createGame` is internal (#274), so no user can start a game with another user who did not agree.

| Call | Who may call | Version | What it does |
|---|---|---|---|
| `createGame(callerId, players, choice, targetPoints, pace)` | internal (tests, the Convex dashboard) | – | New game at version 1 through `insertGame`. The opening and first roll are done, and the first turn's clock runs. An internal call has no sign-in, so `callerId` names who starts the game; it must be one of the players. Returns the id. |
| `makeMove(gameId, expectedVersion, moves)` | the player to move | yes | One full turn (above). Returns `{ ok: true, version }`, or `TIMED_OUT` ([Turn timers](#turn-timers)). |
| `answer(gameId, expectedVersion, choice)` | the player the question asks | yes | Answers `prompt` (Plakoto mother question: `resign` or `playOn`; Asodio chosen double). Then the server rolls on. Returns like `makeMove`. |
| `resign(gameId)` | either player, any time | no | Resigns the **match**; the opponent wins. No version, so a resign never fails only because the opponent just moved. It ignores the turn timer. Returns the new version. |
| `getGame(gameId)` | the two players | – | `OnlineGameView`, or `null` when there is no such game. Anyone else gets `NOT_A_PLAYER`. |
| `listMyGames(status)` | anyone signed in | – | The caller's games with `status` (`active` or `finished`) as `GameSummary`, newest change first, at most `MAX_LISTED_GAMES` (50). See [My games](#my-games). |
| `checkTimeout(gameId, version)` | internal (the scheduler) | yes | Runs at a turn deadline. Applies the time out if the game is still at `version`; else it does nothing. |

### Two phones at once

Every write call except `resign` takes `expectedVersion`. Convex mutations are serializable transactions (optimistic concurrency): when two calls on the same game overlap, Convex runs one again after the other one commits. The first one bumps the version. The second one then sees the new version and fails with `STALE_VERSION`. The phone then loads the game again. The test "two phones send the same turn at once" covers this.

### Turn timers

Owner answers Q3 and Q15: both **live** and **async** (slow) games. A turn lasts **1 minute live** and **24 hours async** (`TURN_TIME_MS` in contracts). When the time runs out, the player the server waits for **loses that game**. The match goes on with the next game, or ends if that game gave the last point.

- **The deadline.** Every save that leaves the match running sets `turnDeadline = now + TURN_TIME_MS[pace]`: the new game (`insertGame`), `makeMove`, `answer`, and a time out (the server's rolls and the next game happen in the same save). So each wait for a player gets a full turn time, also when the same player acts again (an Asodio extra roll, an answer and then a roll). A finished match has `turnDeadline: null`.
- **The scheduler.** The same save schedules `internal.games.checkTimeout({ gameId, version })` with `ctx.scheduler.runAt(turnDeadline)`. Any later change bumps the version, so an old check does nothing. No cancel is needed. If a check ever runs before the deadline, it schedules itself again for the deadline.
- **On a call.** `makeMove` and `answer` check the deadline after the version check. At or after the deadline (`now >= turnDeadline`), they save the time out instead of the call and return `{ ok: false, version, error: { code: 'TIMED_OUT', message } }`. This is a return value, not a thrown error: a thrown error rolls back the whole transaction, and so the time out too. A client adapter turns it into a `TIMED_OUT` rejection (the port's `sendTurn` / `sendAnswer`). The scheduled check for the old version then does nothing.
- **The engine.** The time out is the engine game action `{ type: 'timeout', player }` (only the player the game waits for, not during the opening roll). It ends the game like a resign of that game (`resignGame`: mono 1 if the player has borne off a checker, else diplo 2), with `reason: 'timeout'` in `GameResult` and `GameRecord`. The engine has no clock: the server decides when time is up, with `Date.now()` inside the Convex function. The pure helpers `deadlineAfter`, `isTimedOut`, `timeOut`, `callTimedOut` and `scheduledCheck` in `@tavli/online` take `now` as an argument.
- **The log.** The `timeout` event is a row in `moves` with actor `server`, so `replay` still rebuilds the game.
- **Points.** The rules docs do not say what a timed-out game is worth. We use the single-game resign value (open question Q30).
- **Resign** (the match) ignores the timer: a resign is allowed at any time.
- **Time outs per player** are not stored: `match.games` has every game with `reason: 'timeout'` and its winner.

### Errors

A rejected call throws a `ConvexError` whose `data` is `{ code, message }` (`GameTransportErrorData` in contracts). The codes are `GAME_TRANSPORT_ERROR_CODES`: `NOT_FOUND`, `NOT_A_PLAYER`, `NOT_YOUR_TURN`, `STALE_VERSION`, `ILLEGAL_MOVE`, `ILLEGAL_ACTION`, `GAME_OVER`, `TIMED_OUT`, `BAD_REQUEST` and `NOT_SIGNED_IN` (no signed-in user, #131). Clients use the code, not the message.

## Dice

- Rolled **only on the server**, inside the mutation, through the engine's `Rng`. The server uses `createCryptoRng()` (Web Crypto, `crypto.getRandomValues`). It never uses the seeded engine RNG, which is predictable.
- A roll is made at the moment its turn starts. The server stores **no seed and no RNG state**, so the next dice do not exist anywhere before they are rolled. `getGame` shows only the current roll.
- Convex makes queries and mutations **deterministic**. Its docs say `Math.random` there is a seeded strong PRNG, and the seed is a hidden input of the function call. We expect `crypto.getRandomValues` in a mutation to work the same way. The seed stays on the server, so a client cannot predict a roll. **Check this on the first real deployment** (open point below).
- Lint blocks `Math.random` in `apps/server`.
- The pure tests in `packages/online` pass a seeded RNG. The Convex tests use the real server RNG and read the dice from `getGame`.

## The client view

`getGame` returns `OnlineGameView` (`packages/contracts`): `gameId`, `version`, `status`, `choice`, `pace`, `turnDeadline` (epoch ms on the server clock, `null` when finished; a phone shows the time left from it), `players`, `match` (rules, score, finished games), `game` (the engine `GameFlow` of the current game), `previousGame` (the game before `game`, as it ended, #299; `null` in the first game), `waitingFor` (the side to move or answer) and `prompt`. `game.played` is always empty, because turns are saved whole. `previousGame` stays the same until the next game ends; a match that ends keeps its last game in `game`. The phone replays the turn in `previousGame.lastTurn`, so the other player's winning turn flies before the game-end sheet (see "Between games" in `board-screen.md`).

## My games

`listMyGames({ status })` (#296) lists the caller's own games, so the app can show them on Home and the player can go back to a game.

- **Who.** The caller comes from `signedInPlayer(ctx)`; the query takes no player id. It never lists another player's game.
- **What.** Each game is a `GameSummary` (`packages/contracts`): `gameId`, `status`, `choice`, `presetId`, `variant` (the game being played now), `targetPoints`, `pace`, `mySide`, `waitingFor`, `myTurn`, `score`, `winner`, `updatedAt` and `turnDeadline`. It tells nothing about the other player but their side (the other side). Open the game (`subscribe`) for the rest.
- **One source.** `summarizeGame` in `@tavli/online` builds the summary from the same `toView` input, so a list and an open game never disagree. The Convex query and the in-memory server both use it, and both sort with `latestGames` (newest `updatedAt` first; at the same time, the larger game id first).
- **The indexes.** The query reads the newest `MAX_LISTED_GAMES` of the caller's games on each side (`by_white` and `by_black`, equal on player and `status`, `order('desc')`), then keeps the newest `MAX_LISTED_GAMES` of both. So it reads at most 100 rows. A game saved before #296 has no `updatedAt`: the index puts it last, and its summary uses `_creationTime`.
- **A call, not a live list.** The port's `listMyGames` is a promise; the Convex adapter runs the query once (`client.query`). Call it again to see changes (for example when Home comes into view).
- **Errors.** `NOT_SIGNED_IN` with no sign-in, and `BAD_REQUEST` for a bad subject, like every public call.

The app plays a game through the online store (`apps/mobile/src/features/online/`, #254): it plays the turn on the phone and sends it whole, and it shows the time left from `turnDeadline`. See "Online games" in [App shell](app-shell.md).

## The port

`GameTransport` in `packages/contracts`: `subscribe(gameId, onView, onError)`, `sendTurn({ gameId, expectedVersion, moves })`, `sendAnswer({ gameId, expectedVersion, choice })`, `resign(gameId)` and `listMyGames({ status })` ([My games](#my-games), #296). `listMyGames` is on this port, not a new one: it is a call of the same signed-in player on the same server and client, and every place that has a transport (the online screens, the services, the fakes) gets it with no new wiring. The calls carry no player id. The server reads the caller from the sign-in token, which the backend client gets from the `AuthProvider` port ([Sign-in](#sign-in)). `subscribe` is for the two players only: a stranger's `onError` gets `NOT_A_PLAYER`.

### The Convex adapter

`@tavli/backend-convex` (`packages/adapters/backend-convex`, #253) implements the port on the Convex client. Its `README.md` has the details.

- `createConvexGameTransport({ client })`: `client` is any object with `onUpdate(query, args, onResult, onError)`, `query(fn, args)` and `mutation(fn, args)`. `ConvexClient` from `convex/browser` fits, and a test passes a fake.
- `createConvexClient(url, auth)` makes the `ConvexClient` and calls `setAuth` with a token fetcher on the `AuthProvider` (`getToken({ forceRefresh })`). `createConvexGameTransportFromUrl(url, auth)` does both steps. The app makes one client and puts the transport on it (see [The app wiring](#the-app-wiring)).
- `subscribe` watches `getGame`. A view goes to `onView`; `null` goes to `onError` as `NOT_FOUND`. Both wait one microtask, so neither is called inside `subscribe` or after the stop function.
- `listMyGames` runs the `listMyGames` query once (`client.query`) and resolves with a copy of the list.
- A `ConvexError` whose `data` passes `isGameTransportErrorData` rejects with that data (a plain object). Every code maps so, `NOT_SIGNED_IN` too. Other errors (the network) reject as they are.
- `makeMove` and `answer` return `{ ok: false, error: { code: 'TIMED_OUT' } }` when the turn time ran out ([Turn timers](#turn-timers)): `sendTurn` and `sendAnswer` reject with that data. They resolve only after the mutation resolves.
- The function references are names (`GAME_FUNCTIONS` with `makeFunctionReference`), not the generated `api`: the `api` types pull in all server code, and `apps/server` depends on the adapter for its tests. `convex/convexTransport.test.ts` checks the names and types against `api`.
- **Offline test:** `apps/server/convex/convexTransport.test.ts` runs `gameTransportContract()` on the adapter with the real functions. A fake client runs each call through convex-test as one user (`t.withIdentity({ subject })`). After each mutation it runs the watched queries again before it resolves, like the real client, and it sends a query result only when it changed. Fake timers, like `games.test.ts`. It also covers a late turn (`TIMED_OUT`) and a call with no sign-in (`NOT_SIGNED_IN`). The fake clients live in `convex/test.network.ts`, shared with the invites test.

## Sign-in

Issue #131. Owner decision: online play waits for sign-in. There is no play keyed on an install id. Guest (anonymous) accounts come first. Apple, Google and email magic link come in later issues.

### The server

- **Better Auth as a Convex component** (`@convex-dev/better-auth` 0.12.6, `better-auth` 1.6.33, ADR-0004). `convex.config.ts` installs the component. Its tables (users, sessions and so on) live in the component, not in our `schema.ts`.
- `auth.ts` builds Better Auth with three plugins: `anonymous` (guest accounts), `expo` (the app's `tavlaki://` scheme is a trusted origin) and `convex` (it signs a JWT for the Convex client).
- `http.ts` serves Better Auth's routes under `/api/auth` on the deployment's site URL (`.convex.site`). The app signs in there and gets a Convex token from `/api/auth/convex/token`.
- `auth.config.ts` tells Convex to trust tokens from that issuer. Convex checks each token and gives the functions `ctx.auth.getUserIdentity()`.
- The deployment needs the secret `BETTER_AUTH_SECRET`. The owner sets it with `npx convex env set`. It is never in the repo.

### Who calls

Every public function in `games.ts`, `invites.ts`, `push.ts` and `account.ts` gets the caller from `signedInPlayer(ctx)` in `caller.ts`:

- **The player id is `identity.subject`.** It is the Better Auth user id (the token's `sub`). It stays the same for a user across sessions and token refreshes. We do not use `tokenIdentifier` (issuer + subject): the issuer is the site URL, and a new site URL (a custom domain) would change every player id. There is one issuer. If a second one is ever added, move to `tokenIdentifier` and migrate the stored ids.
- **No identity:** `NOT_SIGNED_IN`. The code is in both `GAME_TRANSPORT_ERROR_CODES` and `INVITE_ERROR_CODES`, so every call can throw it.
- **A subject no player may have** (empty, or `server`, the log's `SERVER_ACTOR`): `BAD_REQUEST`.

### Who may read what

- `getGame`: only the two players. A stranger gets **`NOT_A_PLAYER`** (a thrown error, not `null`), so a client can tell "not yours" from "no such game". A missing game is `null` for anyone signed in. The check is `checkViewer` in `@tavli/online`. The in-memory server uses it too.
- `getInvite`: anyone signed in who has the code. The code is the secret.
- `listMyInvites`: the caller's own invites.
- `listMyGames`: the caller's own games, with nothing about the other player but their side.

### The app side

- **The port:** `AuthProvider` in `packages/contracts/src/auth.ts`: `ready()`, `currentUser()`, `signInAsGuest()`, `signOut()`, `getToken({ forceRefresh })` (for the Convex client's `setAuth`) and `onChange(listener)`. `AuthUser` is `{ id, isGuest }`, and `id` is the token subject. Errors reject with `AuthErrorData` (`NETWORK` or `REJECTED`).
- **Contract checks:** `authProviderContract()` in `@tavli/contracts/testing`, plain async functions. The in-memory provider (`createMemoryAuthProvider`) and the Better Auth adapter (on a fake client) run them.
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

- **Guest upgrade:** when a guest links Apple, Google or email, Better Auth makes a new user. Moving the guest's games and invites to the new id (`onLinkAccount`) comes with those sign-in methods. After the link, the anonymous plugin deletes the guest's Better Auth user by itself (not through `deleteMyAccount`), so the move must happen in `onLinkAccount`, before that.

## Invites

Owner answer Q10: friends find each other by invite link (and later by username). Issue #252 builds the server part. A player makes an invite and shares its code, later as the link `https://tavlaki.com/i/<code>`. A friend accepts it, and the server starts the game. The app screen and the link route (`tavlaki://invite/<code>`) are in [App shell → Invites](app-shell.md#invites-256) (#256); they use the `Invites` port on the in-memory server until sign-in is wired.

### `invites`

| Field | Type | Notes |
|---|---|---|
| `code` | string | 8 characters from `INVITE_CODE_ALPHABET`, stored in capital letters. Unique. |
| `from` | string | The player id of the inviter. The inviter plays white. |
| `choice`, `targetPoints`, `pace` | as in `games` | The game the inviter picked |
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
  │                     5. insertGame (white = inviter): opening roll,
  │                        first roll, turn clock
  │                     6. invite → accepted, gameId
  │ ◄── getInvite / listMyInvites / getGame (reactive) ─────────► │ gameId
```

`acceptInvite` and the internal `createGame` share one helper: `insertGame` in `games.ts`. If the game cannot start, the whole call rolls back and the invite stays open.

### Calls

As with games, no call takes a player id. The caller is the signed-in user, and a call with no sign-in throws `NOT_SIGNED_IN`.

| Call | Who may call | What it does |
|---|---|---|
| `createInvite(choice, targetPoints, pace)` | anyone signed in | A new open invite from the caller. Rejects a caller at the [cap](#cap-on-open-invites) with `TOO_MANY_INVITES`, then a bad match length (an integer of 1 or more) with `BAD_REQUEST`. Returns the code. |
| `getInvite(code)` | anyone signed in with the code | `InviteView` or `null` |
| `acceptInvite(code)` | anyone signed in but the inviter | The flow above. Returns the `gameId`. |
| `declineInvite(code)` | anyone signed in but the inviter | Marks the invite `declined`. |
| `cancelInvite(code)` | only the inviter | Marks the invite `cancelled`. |
| `listMyInvites()` | anyone signed in | The open invites the caller sent, newest first. Invites whose time is up are left out. |
| `expireInvite(inviteId)` | internal (the scheduler) | Runs at `expiresAt`. Marks the invite `expired` if it is still open. |

Decline and cancel check the invite like accept: open (`INVITE_CLOSED`) and in time (`INVITE_EXPIRED`). The inviter cannot decline (`OWN_INVITE`); another player cannot cancel (`NOT_YOUR_INVITE`).

### Expiry

An invite lasts **24 hours** (`INVITE_TIME_MS`; the owner kept it, Q31 in `docs/open-questions.md`). `createInvite` schedules `internal.invites.expireInvite` at `expiresAt`, as `checkTimeout` does for turns. If it runs too early, it schedules itself again. The calls check the time as well: at or after `expiresAt` (`now >= expiresAt`) an open invite counts as expired, also before the scheduler has marked it. `getInvite` then shows `expired` and `listMyInvites` leaves it out. An expired accept throws `INVITE_EXPIRED` and saves nothing; the scheduled `expireInvite` marks the row.

### Cap on open invites

One player may have at most **10** open invites at a time (`MAX_OPEN_INVITES`, #275). Each invite is a row and a scheduled `expireInvite`, and a guest account is free, so without a cap one user could fill the table. `createInvite` reads the caller's open invites whose time is not up on the `by_from` index (at most 10 rows), counts them with `countOpenInvites` and checks them with `checkInviteCap` (both in `@tavli/online`). At the cap it throws `TOO_MANY_INVITES` and saves nothing: no row, no scheduled expiry. An invite frees its place once it is accepted, declined or cancelled, and at `expiresAt`, also before the scheduled `expireInvite` marks it. The cap is per player: other players are not affected. The in-memory server runs the same check. Convex runs each mutation as one serializable transaction, so two calls at the same time cannot both take the last place.

### The Convex invites adapter

`createConvexInvites({ client })` in `@tavli/backend-convex` (`src/invites.ts`, #281) is the `Invites` port on the Convex client. The client needs `onUpdate`, `mutation` and `query` (`ConvexInvitesClient`; `ConvexClient` fits). The app puts it on the same client as the games.

- **The port** (`packages/contracts/src/invite.ts`) has `createInvite({ choice, targetPoints, pace })`, `getInvite`, `watchInvite(code, onView, onError)`, `acceptInvite`, `declineInvite`, `cancelInvite` and `listMyInvites`. No call takes a player id.
- **`watchInvite`** watches `getInvite`, like `subscribe` for a game: each view (or `null`) waits one microtask, so nothing arrives inside `watchInvite` or after its stop function. Views are copies.
- **Errors.** A `ConvexError` whose `data` passes `isInviteErrorData` rejects (or goes to `onError`) with `{ code, message }` (`toInviteError`). `NOT_SIGNED_IN` maps the same way. Any other error stays as it is.
- **Names, not `api`.** `INVITE_FUNCTIONS` (`src/functions.ts`, with `INVITE_FUNCTION_NAMES`) names the functions in `invites.ts`, as `GAME_FUNCTIONS` does for the games. `convex/convexInvites.test.ts` checks the names and the argument and return types against `api`.
- **Offline test:** `apps/server/convex/convexInvites.test.ts` runs `invitesContract()` through the adapter on the real functions (fake clients from `test.network.ts`), plus no sign-in, a bad argument, the inviter watching an accept, the cap (`TOO_MANY_INVITES` as plain data) and the scheduled expiry reaching a watcher. `packages/adapters/backend-convex/src/invites.test.ts` checks the mapping on a fake client.
- **In the app:** `invites` in `apps/mobile/src/services.ts`. Dev invites (`/dev/online`) stay on the in-memory server (`invitesFor`).

### Errors

A rejected invite call throws a `ConvexError` whose `data` is `{ code, message }` (`InviteErrorData`, `isInviteErrorData` in contracts). The codes are `INVITE_ERROR_CODES`: `INVITE_NOT_FOUND`, `INVITE_EXPIRED`, `INVITE_CLOSED`, `OWN_INVITE`, `NOT_YOUR_INVITE`, `TOO_MANY_INVITES` (only `createInvite`), `BAD_REQUEST` and `NOT_SIGNED_IN`. If `insertGame` fails inside `acceptInvite`, the error is a game error (`GameTransportErrorData`).

## Push

ADR-0004 point 7: the server tells a player "your turn" in an **async** game, through the Expo Push Service, from a Convex action, behind the `PushProvider` port (#280). This is the server part. The app part (ask for permission, get the token, register it, open the game on a tap) is a later issue.

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

Neither public call takes a player id: both use `signedInPlayer(ctx)`.

### When a push goes out

Every save in `games.ts` (`save`, and `insertGame` for a new game) calls `scheduleTurnPush(ctx, game, version, before, after, callerId)`. `before` and `after` are what the server waited for before and after the save (`turnWait`: the side from `waitingFor`, the side to move or the side that must answer a question, and the game number in the match, `match.games.length`). For a new game `before` is nobody. `callerId` is the player who caused the save, or `server` for a time out. `turnPushSide` picks the side to tell:

- only in an **async** game: a live game never pushes, both players are in the app;
- never the caller: they are in the app (a new game they started, a game they ended);
- only when the wait **moved to the other side**, or a **new game** of the match started. A time out ends a game, and the next game may wait for the same side again (with `nextGameStarter: "alternate"` or `"openingRoll"`); that player still gets a push. When the same side waits again in the same game (an Asodio extra roll, or White plays on after the mother question), there is no push;
- never when the match is over.

If that player has a token, the mutation schedules `sendTurnPush({ gameId, version, playerId })` with `runAfter(0)`. The action runs after the save is committed, so a push problem never fails or undoes a move. It reads the player's tokens and the turn deadline (`turnPushTokens`, newest first; no tokens when the game is no longer at `version`, so a late push is dropped), sends one message per token, and removes the tokens the push service calls dead (`DeviceNotRegistered`, `removeDeadTokens`). A player with no token costs no action.

Each message has `priority: 'high'`, so the phone shows it at once, and a **time to live** (`ttlSeconds`, Expo's `ttl`): the whole seconds left until the turn deadline (`turnPushTtl`). The push service drops the push after that, so a phone that comes back online days later never shows a stale "Your turn": the turn has timed out by then. An async turn is 24 hours, so a push lives at most 24 hours; a retry lives 30 s less. With no full second left (or no deadline), the action sends nothing.

A token whose push failed with `Failed` (the network, a request with no answer in 10 s, an HTTP 429 or 5xx, an answer we cannot read) or `MessageRateExceeded` gets **one** more try: the action schedules itself again after `PUSH_RETRY_MS` (30 s) with `attempt: 1` and only those `tokens` (`retryTokens`). The retry does the same version check, so it is dropped when the player has played since. A retry that fails again is not retried (`MAX_PUSH_RETRIES` = 1), and a failed token is not removed.

### The text

`TURN_PUSH_TEXT` in `convex/model/push.ts`, the one place: title "Your turn", body "An online game is waiting for your move." English only for now: the server does not know the player's language. A later issue adds a locale field (on the token or the player) and picks the text by it. No names and no emails. `data` holds only `gameId`, so the app can open the game.

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

Issue #302. App stores ask for in-app account deletion. The app screen is a later issue; the server part is the public mutation `deleteMyAccount` in `convex/account.ts`. It takes no arguments: the caller comes from `signedInPlayer(ctx)`.

### What it does

One transaction. If any step throws, nothing is deleted.

1. **Checks the user still exists.** A Convex token stays valid until it expires (15 minutes, the `convex` plugin's default), also after its user is deleted. So the call reads the Better Auth user (`authComponent.getAnyUserById`). No user: `NOT_SIGNED_IN`. A second call after a delete gets this clean error.
2. **Active games:** the caller resigns each one (`resignAs` in `games.ts`, the same checks and the same `save` as `resign`). The other player wins the match. The save bumps the version, so the turn timer's check does nothing, and `scheduleTurnPush` runs as on every save (a resign ends the match, so no push goes out).
3. **Finished games** (and the games just resigned) stay for the other player, as they are. See [What is kept](#what-is-kept).
4. **Invites:** every invite the caller sent is deleted, open or not. An open invite's scheduled `expireInvite` then finds no row and does nothing. Invites someone else sent stay, also when the caller answered them.
5. **Push tokens:** every `pushTokens` row of the caller is deleted.
6. **Better Auth:** the user, its sessions and its accounts (Apple, Google, … once they exist) are deleted with Better Auth's own delete, `internalAdapter.deleteUser`, from `createAuth(ctx).$context`. It runs on the component's tables through the component adapter, with Better Auth's database hooks. It is the step that the `/delete-user` route and the anonymous plugin's `/delete-anonymous-user` route run too.

The pure part, what happens to each game (`gameOnDelete`: `resign`, `keep` or `skip`), is in `convex/model/account.ts`.

### Why not Better Auth's delete route

Better Auth's `deleteUser` API (`/delete-user`) needs a request with a session, and refuses a session older than its `freshAge` (1 day) unless the user sends a password. Guests have no password, and the call would not run inside our transaction. `internalAdapter.deleteUser` needs neither and runs in the mutation.

Both delete routes are **off**, so no client can delete a user without steps 2–5: `/delete-user` because `user.deleteUser` is not enabled, `/delete-anonymous-user` through `disabledPaths` in `auth.ts`. `account.test.ts` checks that both answer 404.

### What is kept

- **Finished games and their `moves`** stay, so the other player keeps their history. The caller's player id stays in them (in `players`, in the stored flow and in the log). We keep the id and do not swap in a fixed "deleted player" id: the id is a random string that names nobody once the Better Auth user is gone, our tables hold no name, email or profile, and the id is in the stored flow and in every log row, so a swap would be a large rewrite. **A later issue that adds a name or a profile field to our tables must clear it here.**
- **Invites someone else sent** that the caller answered (`answeredBy`) stay with their sender.

### Errors

- No sign-in, or no Better Auth user for the token: `NOT_SIGNED_IN`.
- A token whose user was deleted still passes `signedInPlayer` until it expires, so for up to 15 minutes other calls (for example `createInvite`) could still save rows under the deleted id. The app signs out right after the delete, so this needs a client that keeps the old token on purpose. Checking the user on every call is an open point.

## Tests (offline)

`pnpm test` runs Vitest in `apps/server` with the **edge runtime** environment (`@edge-runtime/vm`), as the convex-test docs say. convex-test runs the real functions against an in-memory database, with schema checks.

- `convex/games.test.ts` (convex-test): a full Portes game between two players with server dice (and the log replays to the saved game), an illegal move, a wrong player and a stranger, an old version (two phones at once), resign ends the match, the Plakoto mother question (only the pinned player answers; `playOn` and `resign`; a late answer times out), a missing game. Turn timers with `vi.useFakeTimers()` and `t.finishInProgressScheduledFunctions()`: a live time out loses the game and the next game starts; the match ends on the last point; a move just in time is fine and the old check does nothing; a late move gets `TIMED_OUT` and the time out is saved; async is 24 hours; resign stops the clock. Sign-in (#131): each call runs as a convex-test identity (`t.withIdentity({ subject })`); every function refuses a call with no identity (`NOT_SIGNED_IN`, nothing saved); a stranger cannot read a game (`NOT_A_PLAYER`); a new session of the same user plays on; bad subjects get `BAD_REQUEST`. `listMyGames` (#296): at most 50 games, the newest of both sides; a save moves a game to the top and a resign to `finished`; a game with no `updatedAt` comes last; no other player's id. Every test in the file uses fake timers, so no turn check fires on its own.
- `convex/model/cryptoRng.test.ts`: the secure RNG.
- `convex/push.test.ts` (convex-test, fake timers, a recording sender): register and remove; no sign-in; a bad token shape; a stranger cannot remove a token; a token moves to the new player; the cap of 5, which never drops the token just registered; a turn in an async game sends one push to the other player; a live game sends none; a new game tells the first player only when they did not start it; every phone of the player; no token, no action; a dead token is removed; the same player again (after the mother question) sends none; resign sends none; a late push does nothing; a push after the turn deadline does nothing; a failed push leaves the game alone; a time out tells the winner who starts the next game, and tells the side that ran out of time when the next game waits for it again (`alternate`); a failed push is tried once more after 30 s for the failed tokens only (with the time to live left in the turn), and not a third time; a rate-limited push goes out on the retry; a retry is dropped when the player has played since.
- `convex/model/push.test.ts` (pure): `turnPushSide` (a new game of the match, never the caller), `turnWait`, the messages (high priority, the ttl), `turnPushTtl`, the dead tokens, the retry tokens and the cap (it keeps the token just registered).
- `convex/invites.test.ts` (convex-test, fake timers): create and accept starts a game that `getGame` shows (the inviter is white); accept twice; your own invite; decline and cancel (and who may call them); an unknown and a malformed code; codes in any case; a code clash (a spy on `crypto.getRandomValues`); the cap on open invites (`TOO_MANY_INVITES` and nothing saved; accept, decline, cancel and expiry free a place, also before the scheduler runs; another player is not affected); a game error rolls the accept back; the invite expires at 24 hours and accept, decline and cancel then fail; an accept just in time; `listMyInvites`; every call refuses a call with no identity; the inviter is the identity; a stranger cannot read the new game. It also runs the `invitesContract()` checks on the real functions (#256).
- `convex/auth.test.ts` (convex-test with the Better Auth component, `register` from `@convex-dev/better-auth/test`): the `/api/auth` routes answer; a guest signs in over HTTP and gets a Convex token whose `sub` is the user id; that identity makes an invite.
- `convex/account.test.ts` (convex-test with the Better Auth component, fake timers, a recording sender): Alice and Bob sign in as guests over HTTP. Alice, with an active game, a finished game, two invites, two push tokens and a linked account, deletes her account: Bob sees the active game won by her resign; the finished game is unchanged; her invites, tokens, Better Auth user, session and account are gone, and Bob's stay; no push goes out and the turn timer does nothing. A second call, no sign-in and a token with no user get `NOT_SIGNED_IN`. A guest with no data; a live game and several games; other players' games are not touched; the Better Auth delete routes answer 404.
- `convex/model/account.test.ts` (pure): `gameOnDelete`.
- `convex/convexTransport.test.ts` (convex-test, fake timers): the `GameTransport` contract checks on the [Convex adapter](#the-convex-adapter) with the real functions; a late turn, no sign-in and a bad id through the adapter; the adapter's function names and types against `api`.
- `convex/convexInvites.test.ts` (convex-test, fake timers, #281): the `Invites` contract checks on the [Convex invites adapter](#the-convex-invites-adapter) with the real functions; no sign-in, a bad argument, an accept seen by the watching inviter, the cap and the scheduled expiry through the adapter; `INVITE_FUNCTIONS` against `api`.

`packages/online` (Vitest, pure, seeded RNG):

- `online-game.test.ts`: whole matches of every game choice with random legal turns and answers, replay equals the saved flow, no dice drawn ahead, error codes, the timer helpers and `timeOut`.
- `calls.test.ts`: the shared call checks, and `checkViewer` (who may read a game).
- `memory-server.test.ts`: the `GameTransport` contract checks, a whole match of each game choice through two transports, the turn timers on a fake clock, and `listMyGames` (the limit, a copy, a time out moves a game to the top).
- `summaries.test.ts`: `summarizeGame` (the facts of the view, a finished match, nothing about the other player, a stranger gets `NOT_A_PLAYER`) and the list order.
- `invites.test.ts` (seeded RNG): codes, the fair draw, clashes, the checks, the cap count and the view.
- `memory-invites.test.ts`: the `Invites` contract checks on the in-memory server, the game an accept starts, codes and clashes, an accept whose game cannot start (the invite stays open), and the cap on open invites (the same cases as on Convex).

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

- `createGame(callerId, players, choice, targetPoints, pace)` has the same rules as the internal Convex `createGame`. `transportFor(playerId)` gives that player's `GameTransport`. Its `listMyGames` lists that player's games like the Convex query (`summarizeGame`, `latestGames`); each save sets the game's `updatedAt` to `now()` (a time out from `runDueTimeouts()` to its deadline).
- It acts like a network: `subscribe` calls `onView` on a later microtask (never inside the call), every call waits one microtask, and views, requests and log events are copies (a JSON round trip).
- It has no sign-in: `transportFor(playerId)` stands for that user, signed in. Errors reject with plain `GameTransportErrorData`, with the server codes. A missing game calls `onError` with `NOT_FOUND`, and a stranger's `subscribe` calls it with `NOT_A_PLAYER`.
- Time comes from `now()`. `runDueTimeouts()` is the in-memory `checkTimeout`: it applies every time out whose deadline has passed, each at its own deadline, like the scheduler. A late `sendTurn` gets `TIMED_OUT`, and the time out is saved.
- `events(gameId)` is the event log (like the `moves` rows), so a test can `replay` it.
- Invites (#256): `createInvite(callerId, choice, targetPoints, pace)` makes an open invite, like the Convex mutation (the code comes from the server's `rng`, through `pickInviteCodeNow`, which shares its loop with `pickInviteCode`). It has the same [cap](#cap-on-open-invites): `TOO_MANY_INVITES` at 10 open invites (#275). `cancelInvite(callerId, code)` takes an open invite back, like the Convex `cancelInvite`. `invitesFor(playerId)` gives that player's `Invites` port, and `getInvite(code)` reads one invite. They use the same checks (`invites.ts`). `acceptInvite` starts the game through `createGame` (the inviter plays white); if the game cannot start, the invite stays open. No timer: an open invite counts as expired once `now()` reaches `expiresAt`. Errors reject with plain `InviteErrorData` (a game error with `GameTransportErrorData`).

### Contract checks

`gameTransportContract()` in `@tavli/contracts/testing` checks any `GameTransport`. The checks are plain async functions, so Vitest and Jest can both run them. The subject gives a way to create a game, a Plakoto game at the mother question, a game that White is not in (Black against the stranger), a missing game id, a transport per side (and for a stranger), a legal turn, and `passTime(ms)` to move the server clock. The checks: the first view arrives on a later tick; a legal turn reaches both players with `version + 1`; an old version gets `STALE_VERSION`; the wrong player gets `NOT_YOUR_TURN` and a stranger `NOT_A_PLAYER`; a stranger cannot watch a game (`subscribe` gets `NOT_A_PLAYER`); an incomplete turn gets `ILLEGAL_MOVE`; the mother question; resign finishes the match; no view after unsubscribe; a missing game gives `NOT_FOUND`; a view is a copy; `listMyGames` lists only my own games, newest first, and each summary matches my view; a change moves a game to the top; the status filter, and a finished game moves to `finished` (#296). Every rejection must pass `isGameTransportErrorData`. The in-memory server and the [Convex adapter](#the-convex-adapter) run them.

`invitesContract()` (#256) checks any `Invites`, the same way. The subject gives the inviter's id, a way to make an invite, the `Invites` of the inviter, a friend and a second friend, and `passTime(ms)` to move the server clock. The checks: `getInvite` shows an open invite for the code in any case; it resolves `null` for an unknown code and for text that is not a code; accept resolves with the game id and the invite shows it, and a second answer gets `INVITE_CLOSED`; decline closes the invite; the inviter gets `OWN_INVITE`; an unknown code gets `INVITE_NOT_FOUND` and text that is not a code `BAD_REQUEST`; the invite expires at `INVITE_TIME_MS` (then `INVITE_EXPIRED`); a view is a copy; `createInvite` gives a new code from the caller and refuses a bad match length; only the inviter cancels, and a late cancel gets `INVITE_EXPIRED`; `listMyInvites` lists the caller's open invites, newest first; `watchInvite` sends the invite later, then each change (accept, decline, cancel, expiry), until it stops (#281). Every rejection must pass `isInviteErrorData`. The in-memory server, the Convex functions (`apps/server/convex/invites.test.ts`) and the [Convex invites adapter](#the-convex-invites-adapter) (`convexInvites.test.ts`) run them.

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
- **My invites and games in the app:** nothing in the app lists the open invites (`listMyInvites`) or the online games of the player yet, so the inviter must keep the waiting screen open (#281).
- **Old data:** nothing deletes old invites, finished games or their moves yet. The privacy policy says we keep them until the player asks us to delete them.
- **Verify sign-in on a phone:** a guest sign-in on the dev deployment, the cookie in the secure store, and a token on the Convex socket. The tests cover the parts with fakes only.
- **A bad game id:** `getGame` and the mutations take `v.id('games')`. A string that is not a game id (for example from a broken link) fails argument validation, a plain error, not `NOT_FOUND`. The app should treat any non-port error on load as "cannot open this game".
- **Verify on a real deployment** that a mutation resolves only after the watched `getGame` shows its change (the offline test assumes it, as the Convex docs say).
- **Clock skew:** `turnDeadline` is on the server clock. A phone should show the time left from the server time (for example the offset seen when the view arrives), not trust its own clock.
- **Push follow-ups:** the app part (permission, token, register on sign-in, remove on sign-out, open the game on a tap); push receipts (Expo can also report a dead token later, in a receipt: a scheduled check of the receipts would remove those too); the text in the player's language; a push when a game ends on time.
- **Account deletion follow-ups:** the app screen (it calls `deleteMyAccount`, then signs out); a check of the Better Auth user on every call, so a deleted user's token stops at once ([Errors](#errors-2)); clear any name or profile field a later issue adds ([What is kept](#what-is-kept)).
- **Friends, usernames, users, presence**: later issues. The invite app screen and link route: #256. Play a friend (make, share, wait): #281.
- **Document size**: one game row holds the whole match flow (a few KB). The log is in `moves`, so the row does not grow with the game.
