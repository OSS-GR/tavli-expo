# Online game service

Status: first version (#126, part of #46), with turn timers (#133), invites by code (#252) and [sign-in](#sign-in) (#131). The game model is in the pure package `@tavli/online`, with an [in-memory server](#the-in-memory-server) (#251). It runs and is tested **offline**, with no Convex account. CI deploys it to Convex (#257, see [Deploy](#deploy)).

Decision: [ADR-0004](../decisions/0004-backend-auth.md) (Convex). Layout: [ADR-0002](../decisions/0002-modular-architecture.md).

## Where the code is

| Path | What it holds |
|---|---|
| `apps/server/convex/schema.ts` | The tables: `games`, `moves` and `invites` |
| `apps/server/convex/games.ts` | The Convex functions: `createGame`, `makeMove`, `answer`, `resign`, `getGame`, and the internal `checkTimeout`. They keep only the database and scheduler parts. |
| `apps/server/convex/caller.ts` | `signedInPlayer(ctx)`: the caller's player id from the sign-in token ([Sign-in](#sign-in)) |
| `apps/server/convex/convex.config.ts` | The Convex app: it uses the Better Auth component |
| `apps/server/convex/auth.ts` | Better Auth: the component client and `createAuth` (anonymous, Expo and Convex plugins) |
| `apps/server/convex/auth.config.ts` | The token issuer Convex trusts: Better Auth on the deployment's site URL |
| `apps/server/convex/http.ts` | The HTTP routes: Better Auth under `/api/auth` |
| `packages/online/src/online-game.ts` | The game logic, with no Convex code. Pure: dice come from an `Rng` argument |
| `packages/online/src/calls.ts` | The checks around each call, shared by both servers: `checkNewGame`, `checkCall` (game, caller, version), `callTimedOut`, `scheduledCheck`, `nextDeadline`, `eventActor` |
| `packages/online/src/memory-server.ts` | The [in-memory server](#the-in-memory-server): the same logic, a `GameTransport` per player |
| `apps/server/convex/model/cryptoRng.ts` | The dice RNG: `crypto.getRandomValues` |
| `apps/server/convex/invites.ts` | The invite functions ([Invites](#invites)) |
| `apps/server/convex/model/invites.ts` | The invite checks and codes, with no Convex code. Pure: `now` and the `Rng` are arguments |
| `packages/contracts/src/invite.ts` | `InviteView`, the statuses, the error codes, the code alphabet and `INVITE_TIME_MS` |
| `apps/server/convex/_generated/` | Convex codegen output, committed (see [Codegen](#codegen-without-a-deployment)) |
| `apps/server/convex/tsconfig.json` | The typecheck that `convex deploy` runs before it pushes |
| `.github/workflows/deploy-server.yml` | The deploy (see [Deploy](#deploy)) |
| `packages/contracts/src/game-transport.ts` | The `GameTransport` port, the `OnlineGameView` type, the paces and `TURN_TIME_MS` |
| `packages/contracts/src/auth.ts` | The `AuthProvider` port, `AuthUser`, the auth error codes and the in-memory provider |
| `packages/adapters/auth-better-auth` | `AuthProvider` on the Better Auth Expo client (its `README.md`) |

Only `apps/server` and the auth adapter import `convex` and Better Auth. The ports in `packages/contracts` and `@tavli/online` are plain TypeScript. The app must not import server code, so it uses `@tavli/online`. There is no Convex client adapter yet.

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
| `flow` | JSON text | The engine `MatchFlow` **without its log** (match, score, current game) |
| `status` | `active` · `finished` | |
| `winner` | `white` · `black` · `null` | The match winner |
| `version` | number | Starts at 1. Goes up by one on every change. |
| `eventCount` | number | Rows in `moves` for this game |
| `turnDeadline` | number · `null` | When the current turn runs out (epoch ms, server clock). `null` once the match is finished. |

Indexes: `by_white` and `by_black` (on `players.white` / `players.black`), for "my games" later.

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
- **Between games** the server starts the next game at once (with the opening roll, if the rules ask for one). The result of the finished game is in `match.games`.
- **Opening roll:** the server rolls it in `createGame`. `chosenStarterRolls` is not supported online; no preset uses it.

### Other calls

No call takes a player id. The caller is the signed-in user ([Sign-in](#sign-in)). With no sign-in, every call below except `checkTimeout` throws `NOT_SIGNED_IN`.

| Call | Who may call | Version | What it does |
|---|---|---|---|
| `createGame(players, choice, targetPoints, pace)` | one of the two players | – | New game at version 1. The opening and first roll are done, and the first turn's clock runs. Returns the id. |
| `makeMove(gameId, expectedVersion, moves)` | the player to move | yes | One full turn (above). Returns `{ ok: true, version }`, or `TIMED_OUT` ([Turn timers](#turn-timers)). |
| `answer(gameId, expectedVersion, choice)` | the player the question asks | yes | Answers `prompt` (Plakoto mother question: `resign` or `playOn`; Asodio chosen double). Then the server rolls on. Returns like `makeMove`. |
| `resign(gameId)` | either player, any time | no | Resigns the **match**; the opponent wins. No version, so a resign never fails only because the opponent just moved. It ignores the turn timer. Returns the new version. |
| `getGame(gameId)` | the two players | – | `OnlineGameView`, or `null` when there is no such game. Anyone else gets `NOT_A_PLAYER`. |
| `checkTimeout(gameId, version)` | internal (the scheduler) | yes | Runs at a turn deadline. Applies the time out if the game is still at `version`; else it does nothing. |

### Two phones at once

Every write call except `resign` takes `expectedVersion`. Convex mutations are serializable transactions (optimistic concurrency): when two calls on the same game overlap, Convex runs one again after the other one commits. The first one bumps the version. The second one then sees the new version and fails with `STALE_VERSION`. The phone then loads the game again. The test "two phones send the same turn at once" covers this.

### Turn timers

Owner answers Q3 and Q15: both **live** and **async** (slow) games. A turn lasts **1 minute live** and **24 hours async** (`TURN_TIME_MS` in contracts). When the time runs out, the player the server waits for **loses that game**. The match goes on with the next game, or ends if that game gave the last point.

- **The deadline.** Every save that leaves the match running sets `turnDeadline = now + TURN_TIME_MS[pace]`: `createGame`, `makeMove`, `answer`, and a time out (the server's rolls and the next game happen in the same save). So each wait for a player gets a full turn time, also when the same player acts again (an Asodio extra roll, an answer and then a roll). A finished match has `turnDeadline: null`.
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

`getGame` returns `OnlineGameView` (`packages/contracts`): `gameId`, `version`, `status`, `choice`, `pace`, `turnDeadline` (epoch ms on the server clock, `null` when finished; a phone shows the time left from it), `players`, `match` (rules, score, finished games), `game` (the engine `GameFlow` of the current game), `waitingFor` (the side to move or answer) and `prompt`. `game.played` is always empty, because turns are saved whole.

The app plays a game through the online store (`apps/mobile/src/features/online/`, #254): it plays the turn on the phone and sends it whole, and it shows the time left from `turnDeadline`. See "Online games" in [App shell](app-shell.md).

## The port

`GameTransport` in `packages/contracts`: `subscribe(gameId, onView, onError)`, `sendTurn({ gameId, expectedVersion, moves })`, `sendAnswer({ gameId, expectedVersion, choice })`, `resign(gameId)`. The calls carry no player id. The server reads the caller from the sign-in token, which the backend client gets from the `AuthProvider` port ([Sign-in](#sign-in)). `subscribe` is for the two players only: a stranger's `onError` gets `NOT_A_PLAYER`. A Convex adapter (`packages/adapters/backend-convex`) comes in a later issue.

## Sign-in

Issue #131. Owner decision: online play waits for sign-in. There is no play keyed on an install id. Guest (anonymous) accounts come first. Apple, Google and email magic link come in later issues.

### The server

- **Better Auth as a Convex component** (`@convex-dev/better-auth` 0.12.6, `better-auth` 1.6.33, ADR-0004). `convex.config.ts` installs the component. Its tables (users, sessions and so on) live in the component, not in our `schema.ts`.
- `auth.ts` builds Better Auth with three plugins: `anonymous` (guest accounts), `expo` (the app's `tavlaki://` scheme is a trusted origin) and `convex` (it signs a JWT for the Convex client).
- `http.ts` serves Better Auth's routes under `/api/auth` on the deployment's site URL (`.convex.site`). The app signs in there and gets a Convex token from `/api/auth/convex/token`.
- `auth.config.ts` tells Convex to trust tokens from that issuer. Convex checks each token and gives the functions `ctx.auth.getUserIdentity()`.
- The deployment needs the secret `BETTER_AUTH_SECRET`. The owner sets it with `npx convex env set`. It is never in the repo.

### Who calls

Every public function in `games.ts` and `invites.ts` gets the caller from `signedInPlayer(ctx)` in `caller.ts`:

- **The player id is `identity.subject`.** It is the Better Auth user id (the token's `sub`). It stays the same for a user across sessions and token refreshes. We do not use `tokenIdentifier` (issuer + subject): the issuer is the site URL, and a new site URL (a custom domain) would change every player id. There is one issuer. If a second one is ever added, move to `tokenIdentifier` and migrate the stored ids.
- **No identity:** `NOT_SIGNED_IN`. The code is in both `GAME_TRANSPORT_ERROR_CODES` and `INVITE_ERROR_CODES`, so every call can throw it.
- **A subject no player may have** (empty, or `server`, the log's `SERVER_ACTOR`): `BAD_REQUEST`.

### Who may read what

- `getGame`: only the two players. A stranger gets **`NOT_A_PLAYER`** (a thrown error, not `null`), so a client can tell "not yours" from "no such game". A missing game is `null` for anyone signed in. The check is `checkViewer` in `@tavli/online`. The in-memory server uses it too.
- `getInvite`: anyone signed in who has the code. The code is the secret.
- `listMyInvites`: the caller's own invites.

### The app side

- **The port:** `AuthProvider` in `packages/contracts/src/auth.ts`: `ready()`, `currentUser()`, `signInAsGuest()`, `signOut()`, `getToken({ forceRefresh })` (for the Convex client's `setAuth`) and `onChange(listener)`. `AuthUser` is `{ id, isGuest }`, and `id` is the token subject. Errors reject with `AuthErrorData` (`NETWORK` or `REJECTED`).
- **Contract checks:** `authProviderContract()` in `@tavli/contracts/testing`, plain async functions. The in-memory provider (`createMemoryAuthProvider`) and the Better Auth adapter (on a fake client) run them.
- **The adapter:** `@tavli/auth-better-auth` (`packages/adapters/auth-better-auth/README.md`). The app wiring (`services.ts`, `expo-secure-store`) is a later issue.

### Not done yet

- **Guest upgrade:** when a guest links Apple, Google or email, Better Auth makes a new user. Moving the guest's games and invites to the new id (`onLinkAccount`) comes with those sign-in methods.
- **`createGame` is public:** a signed-in user can start a game with any player id they know, as long as they are one of the two players. The app starts games through invites. Make `createGame` internal, or check the other player, once the app no longer needs it.

## Invites

Owner answer Q10: friends find each other by invite link (and later by username). Issue #252 builds the server part. A player makes an invite and shares its code, later as the link `https://tavlaki.com/i/<code>` (the app screen and the link route are #256). A friend accepts it, and the server starts the game.

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

Indexes: `by_code` (on `code`) and `by_from` (on `[from, status]`, for "my open invites").

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

`acceptInvite` and `createGame` share one helper: `insertGame` in `games.ts`. If the game cannot start, the whole call rolls back and the invite stays open.

### Calls

As with games, no call takes a player id. The caller is the signed-in user, and a call with no sign-in throws `NOT_SIGNED_IN`.

| Call | Who may call | What it does |
|---|---|---|
| `createInvite(choice, targetPoints, pace)` | anyone signed in | A new open invite from the caller. Rejects a bad match length (an integer of 1 or more) with `BAD_REQUEST`. Returns the code. |
| `getInvite(code)` | anyone signed in with the code | `InviteView` or `null` |
| `acceptInvite(code)` | anyone signed in but the inviter | The flow above. Returns the `gameId`. |
| `declineInvite(code)` | anyone signed in but the inviter | Marks the invite `declined`. |
| `cancelInvite(code)` | only the inviter | Marks the invite `cancelled`. |
| `listMyInvites()` | anyone signed in | The open invites the caller sent, newest first. Invites whose time is up are left out. |
| `expireInvite(inviteId)` | internal (the scheduler) | Runs at `expiresAt`. Marks the invite `expired` if it is still open. |

Decline and cancel check the invite like accept: open (`INVITE_CLOSED`) and in time (`INVITE_EXPIRED`). The inviter cannot decline (`OWN_INVITE`); another player cannot cancel (`NOT_YOUR_INVITE`).

### Expiry

An invite lasts **24 hours** (`INVITE_TIME_MS`, open question Q31). `createInvite` schedules `internal.invites.expireInvite` at `expiresAt`, as `checkTimeout` does for turns. If it runs too early, it schedules itself again. The calls check the time as well: at or after `expiresAt` (`now >= expiresAt`) an open invite counts as expired, also before the scheduler has marked it. `getInvite` then shows `expired` and `listMyInvites` leaves it out. An expired accept throws `INVITE_EXPIRED` and saves nothing; the scheduled `expireInvite` marks the row.

### Errors

A rejected invite call throws a `ConvexError` whose `data` is `{ code, message }` (`InviteErrorData`, `isInviteErrorData` in contracts). The codes are `INVITE_ERROR_CODES`: `INVITE_NOT_FOUND`, `INVITE_EXPIRED`, `INVITE_CLOSED`, `OWN_INVITE`, `NOT_YOUR_INVITE`, `BAD_REQUEST` and `NOT_SIGNED_IN`. If `insertGame` fails inside `acceptInvite`, the error is a game error (`GameTransportErrorData`).

## Tests (offline)

`pnpm test` runs Vitest in `apps/server` with the **edge runtime** environment (`@edge-runtime/vm`), as the convex-test docs say. convex-test runs the real functions against an in-memory database, with schema checks.

- `convex/games.test.ts` (convex-test): a full Portes game between two players with server dice (and the log replays to the saved game), an illegal move, a wrong player and a stranger, an old version (two phones at once), resign ends the match, the Plakoto mother question (only the pinned player answers; `playOn` and `resign`; a late answer times out), a missing game. Turn timers with `vi.useFakeTimers()` and `t.finishInProgressScheduledFunctions()`: a live time out loses the game and the next game starts; the match ends on the last point; a move just in time is fine and the old check does nothing; a late move gets `TIMED_OUT` and the time out is saved; async is 24 hours; resign stops the clock. Sign-in (#131): each call runs as a convex-test identity (`t.withIdentity({ subject })`); every function refuses a call with no identity (`NOT_SIGNED_IN`, nothing saved); a stranger cannot read a game (`NOT_A_PLAYER`); a new session of the same user plays on; bad subjects get `BAD_REQUEST`. Every test in the file uses fake timers, so no turn check fires on its own.
- `convex/model/cryptoRng.test.ts`: the secure RNG.
- `convex/invites.test.ts` (convex-test, fake timers): create and accept starts a game that `getGame` shows (the inviter is white); accept twice; your own invite; decline and cancel (and who may call them); an unknown and a malformed code; codes in any case; a code clash (a spy on `crypto.getRandomValues`); a game error rolls the accept back; the invite expires at 24 hours and accept, decline and cancel then fail; an accept just in time; `listMyInvites`; every call refuses a call with no identity; the inviter is the identity; a stranger cannot read the new game.
- `convex/model/invites.test.ts` (pure, seeded RNG): codes, the fair draw, clashes, the checks and the view.
- `convex/auth.test.ts` (convex-test with the Better Auth component, `register` from `@convex-dev/better-auth/test`): the `/api/auth` routes answer; a guest signs in over HTTP and gets a Convex token whose `sub` is the user id; that identity makes an invite.

`packages/online` (Vitest, pure, seeded RNG):

- `online-game.test.ts`: whole matches of every game choice with random legal turns and answers, replay equals the saved flow, no dice drawn ahead, error codes, the timer helpers and `timeOut`.
- `calls.test.ts`: the shared call checks, and `checkViewer` (who may read a game).
- `memory-server.test.ts`: the `GameTransport` contract checks, a whole match of each game choice through two transports, and the turn timers on a fake clock.

The test files and `test.setup.ts` have two dots in their names, so Convex does not deploy them. The module glob in `test.setup.ts` uses a negative pattern (`['./**/*.*s', '!./**/*.*.*s']`): the extglob from the convex-test docs does not work with the Vite glob of Vitest 5.

## Deploy

The Convex project has two deployments (#129), both in the EU (`eu-west-1`):

| Target | Deployment | URL | Deploy key (repo secret) | App variants |
|---|---|---|---|---|
| dev | `exciting-reindeer-792` | `https://exciting-reindeer-792.eu-west-1.convex.cloud` | `CONVEX_DEPLOY_KEY_DEV` | `development` |
| prod | `superb-dog-503` | `https://superb-dog-503.eu-west-1.convex.cloud` | `CONVEX_DEPLOY_KEY_PROD` | `preview`, `production` |

The URLs are public client config. They live in `apps/mobile/app.config.ts` (see [Running the app](../process/running-the-app.md#which-server-the-app-uses)). The deploy keys are secrets. They live only in GitHub, never in the repo.

Each deployment also needs the secret `BETTER_AUTH_SECRET` ([Sign-in](#sign-in)). The deploy does not set it: the owner sets it once per deployment with `npx convex env set BETTER_AUTH_SECRET <value>` (dev, then `--prod`). Without it, sign-in fails.

### How a deploy happens

The workflow `.github/workflows/deploy-server.yml` does it:

1. **Dev, by itself:** on each push to `main` that changes `apps/server/**`, `packages/engine/**`, `packages/contracts/**`, `packages/online/**`, `pnpm-lock.yaml`, the root config (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`), the setup action or the workflow. When the functions import another package, add its path there.
2. **Check the key.** The first step runs before any repo code. It fails with an `::error::` when the secret is empty, or when the key is for another deployment (a deploy key starts with `dev:<name>|` or `prod:<name>|`). It never prints the key. The error shows only the part before `|` (the key type and the public deployment name), so you can see which key is stored. A `project:` or `preview:` key fails too: it does not name one deployment.
3. **Test.** Install (`.github/actions/setup`), then `pnpm --filter @tavli/server typecheck` and `pnpm --filter @tavli/server test`.
4. **Deploy.** `pnpm exec convex deploy --typecheck enable` in `apps/server`, with `CONVEX_DEPLOY_KEY` from the secret. Convex typechecks with `convex/tsconfig.json`, writes `_generated/` again, bundles the functions, and pushes the functions, the schema and the indexes. With `--typecheck enable`, the deploy fails when the typecheck fails or cannot run. (The default, `try`, skips the typecheck when `convex/tsconfig.json` is missing.)

It never runs on pull requests, so PR code never sees a deploy key. Two deploys to the same target never overlap (one `concurrency` group per target), and a running deploy is never cancelled.

### Deploy to prod

1. Merge the change to `main`. Wait for the dev deploy to pass, and try it on a `development` build.
2. GitHub → **Actions** → **Deploy server** → **Run workflow**. Pick the branch `main` and the target `prod`.
3. The job runs in the GitHub environment `production`. GitHub makes it on the first run. The owner can add **required reviewers** there (Settings → Environments → `production`). Then each prod deploy waits for an approval. Dev runs use the environment `development`, with no rules.

A prod run from any branch but `main` fails at the first step.

### Roll back

A rollback is a new deploy of the old code:

1. Revert the bad commit on `main` with a PR (`git revert`). Its merge deploys dev again.
2. If prod has the bad code, run **Deploy server** with the target `prod` from `main` again.

A deploy does not change the stored data. Convex refuses a schema that the stored data does not match, so a rollback that removes a field or a table can fail. Then fix forward: keep the field optional in the schema, or clean up the data first.

## The in-memory server

`createMemoryGameServer({ rng, now })` in `@tavli/online` (#251) runs the same model and the same call checks as the Convex functions, with games in a `Map`. The app, its tests and the Convex adapter can play against the real server model with no network and no account. Its API is in `packages/online/README.md`.

- `createGame(callerId, players, choice, targetPoints, pace)` has the same rules as the Convex mutation. `transportFor(playerId)` gives that player's `GameTransport`.
- It acts like a network: `subscribe` calls `onView` on a later microtask (never inside the call), every call waits one microtask, and views, requests and log events are copies (a JSON round trip).
- It has no sign-in: `transportFor(playerId)` stands for that user, signed in. Errors reject with plain `GameTransportErrorData`, with the server codes. A missing game calls `onError` with `NOT_FOUND`, and a stranger's `subscribe` calls it with `NOT_A_PLAYER`.
- Time comes from `now()`. `runDueTimeouts()` is the in-memory `checkTimeout`: it applies every time out whose deadline has passed, each at its own deadline, like the scheduler. A late `sendTurn` gets `TIMED_OUT`, and the time out is saved.
- `events(gameId)` is the event log (like the `moves` rows), so a test can `replay` it.

### Contract checks

`gameTransportContract()` in `@tavli/contracts/testing` checks any `GameTransport`. The checks are plain async functions, so Vitest and Jest can both run them. The subject gives a way to create a game, a Plakoto game at the mother question, a missing game id, a transport per side (and for a stranger), and a legal turn. The checks: the first view arrives on a later tick; a legal turn reaches both players with `version + 1`; an old version gets `STALE_VERSION`; the wrong player gets `NOT_YOUR_TURN` and a stranger `NOT_A_PLAYER`; a stranger cannot watch a game (`subscribe` gets `NOT_A_PLAYER`); an incomplete turn gets `ILLEGAL_MOVE`; the mother question; resign finishes the match; no view after unsubscribe; a missing game gives `NOT_FOUND`; a view is a copy. Every rejection must pass `isGameTransportErrorData`. The in-memory server runs them, and the Convex adapter must run them too.

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

- **Sign-in follow-ups:** Apple, Google and email magic link; moving a guest's games after an upgrade; the app wiring of `@tavli/auth-better-auth`; the `createGame` exposure ([Not done yet](#not-done-yet)).
- **Invite limits:** nothing limits how many open invites one player makes, and nothing limits code guesses. With about 850 billion codes, a guess rarely hits. Add a cap and a rate limit per signed-in user.
- **Verify the dice** on a real deployment: `crypto.getRandomValues` in a mutation gives different, unpredictable dice per call.
- **Client adapter** (#253, not done yet): `packages/adapters/backend-convex` will implement `GameTransport` with the Convex React client. `apps/mobile/src/services.ts` will give it the URL from `convexUrl()` (`apps/mobile/src/convexUrl.ts`).
- **Clock skew:** `turnDeadline` is on the server clock. A phone should show the time left from the server time (for example the offset seen when the view arrives), not trust its own clock.
- **Friends, usernames, users, presence, push**: later issues. The invite app screen and link route: #256.
- **Document size**: one game row holds the whole match flow (a few KB). The log is in `moves`, so the row does not grow with the game.
