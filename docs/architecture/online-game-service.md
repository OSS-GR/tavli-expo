# Online game service

Status: first version (#126, part of #46), with turn timers (#133). It runs and is tested **offline**, with no Convex account. Deploying needs the owner (a later issue).

Decision: [ADR-0004](../decisions/0004-backend-auth.md) (Convex). Layout: [ADR-0002](../decisions/0002-modular-architecture.md).

## Where the code is

| Path | What it holds |
|---|---|
| `apps/server/convex/schema.ts` | The tables: `games` and `moves` |
| `apps/server/convex/games.ts` | The Convex functions: `createGame`, `makeMove`, `answer`, `resign`, `getGame`, and the internal `checkTimeout` |
| `apps/server/convex/model/online-game.ts` | The game logic, with no Convex code. Pure: dice come from an `Rng` argument |
| `apps/server/convex/model/crypto-rng.ts` | The dice RNG: `crypto.getRandomValues` |
| `apps/server/convex/_generated/` | Convex codegen output, committed (see [Codegen](#codegen-without-a-deployment)) |
| `packages/contracts/src/game-transport.ts` | The `GameTransport` port, the `OnlineGameView` type, the paces and `TURN_TIME_MS` |

Only `apps/server` imports `convex`. The port in `packages/contracts` is plain TypeScript. There is no client adapter yet.

## Data model

Engine data is stored as **JSON text**. So Convex field rules never limit the engine shapes, and the engine stays the only owner of them.

### `games`

| Field | Type | Notes |
|---|---|---|
| `players` | `{ white, black }` strings | Plain player ids for now. Users come later. |
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

`onlineGameRules(choice)` in `model/online-game.ts`: the preset of the game, and for one game `match.rotation = [game]`. This is the same as `gameRuleSet` in `apps/mobile/src/features/match/setup.ts`. The server must not import app code, so the few lines are copied. **Keep both in sync.** If they grow, move one helper into `packages/engine`.

## Move flow

Each mutation is **one Convex transaction**. If anything throws, nothing is saved.

```
client                     makeMove (one transaction)
  │  gameId, callerId,       1. load the game                     → NOT_FOUND
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

| Call | Who may call | Version | What it does |
|---|---|---|---|
| `createGame(callerId, players, choice, targetPoints, pace)` | one of the two players | – | New game at version 1. The opening and first roll are done, and the first turn's clock runs. Returns the id. |
| `makeMove(gameId, callerId, expectedVersion, moves)` | the player to move | yes | One full turn (above). Returns `{ ok: true, version }`, or `TIMED_OUT` ([Turn timers](#turn-timers)). |
| `answer(gameId, callerId, expectedVersion, choice)` | the player the question asks | yes | Answers `prompt` (Plakoto mother question: `resign` or `playOn`; Asodio chosen double). Then the server rolls on. Returns like `makeMove`. |
| `resign(gameId, callerId)` | either player, any time | no | Resigns the **match**; the opponent wins. No version, so a resign never fails only because the opponent just moved. It ignores the turn timer. Returns the new version. |
| `getGame(gameId)` | anyone with the id (for now) | – | `OnlineGameView` or `null` |
| `checkTimeout(gameId, version)` | internal (the scheduler) | yes | Runs at a turn deadline. Applies the time out if the game is still at `version`; else it does nothing. |

### Two phones at once

Every write call except `resign` takes `expectedVersion`. Convex mutations are serializable transactions (optimistic concurrency): when two calls on the same game overlap, Convex runs one again after the other one commits. The first one bumps the version. The second one then sees the new version and fails with `STALE_VERSION`. The phone then loads the game again. The test "two phones send the same turn at once" covers this.

### Turn timers

Owner answers Q3 and Q15: both **live** and **async** (slow) games. A turn lasts **1 minute live** and **24 hours async** (`TURN_TIME_MS` in contracts). When the time runs out, the player the server waits for **loses that game**. The match goes on with the next game, or ends if that game gave the last point.

- **The deadline.** Every save that leaves the match running sets `turnDeadline = now + TURN_TIME_MS[pace]`: `createGame`, `makeMove`, `answer`, and a time out (the server's rolls and the next game happen in the same save). So each wait for a player gets a full turn time, also when the same player acts again (an Asodio extra roll, an answer and then a roll). A finished match has `turnDeadline: null`.
- **The scheduler.** The same save schedules `internal.games.checkTimeout({ gameId, version })` with `ctx.scheduler.runAt(turnDeadline)`. Any later change bumps the version, so an old check does nothing. No cancel is needed. If a check ever runs before the deadline, it schedules itself again for the deadline.
- **On a call.** `makeMove` and `answer` check the deadline after the version check. At or after the deadline (`now >= turnDeadline`), they save the time out instead of the call and return `{ ok: false, version, error: { code: 'TIMED_OUT', message } }`. This is a return value, not a thrown error: a thrown error rolls back the whole transaction, and so the time out too. A client adapter turns it into a `TIMED_OUT` rejection (the port's `sendTurn` / `sendAnswer`). The scheduled check for the old version then does nothing.
- **The engine.** The time out is the engine game action `{ type: 'timeout', player }` (only the player the game waits for, not during the opening roll). It ends the game like a resign of that game (`resignGame`: mono 1 if the player has borne off a checker, else diplo 2), with `reason: 'timeout'` in `GameResult` and `GameRecord`. The engine has no clock: the server decides when time is up, with `Date.now()` inside the Convex function. The pure helpers `deadlineAfter`, `isTimedOut` and `timeOut` in `model/online-game.ts` take `now` as an argument.
- **The log.** The `timeout` event is a row in `moves` with actor `server`, so `replay` still rebuilds the game.
- **Points.** The rules docs do not say what a timed-out game is worth. We use the single-game resign value (open question Q30).
- **Resign** (the match) ignores the timer: a resign is allowed at any time.
- **Time outs per player** are not stored: `match.games` has every game with `reason: 'timeout'` and its winner.

### Errors

A rejected call throws a `ConvexError` whose `data` is `{ code, message }` (`GameTransportErrorData` in contracts). The codes are `GAME_TRANSPORT_ERROR_CODES`. Clients use the code, not the message.

## Dice

- Rolled **only on the server**, inside the mutation, through the engine's `Rng`. The server uses `createCryptoRng()` (Web Crypto, `crypto.getRandomValues`). It never uses the seeded engine RNG, which is predictable.
- A roll is made at the moment its turn starts. The server stores **no seed and no RNG state**, so the next dice do not exist anywhere before they are rolled. `getGame` shows only the current roll.
- Convex makes queries and mutations **deterministic**. Its docs say `Math.random` there is a seeded strong PRNG, and the seed is a hidden input of the function call. We expect `crypto.getRandomValues` in a mutation to work the same way. The seed stays on the server, so a client cannot predict a roll. **Check this on the first real deployment** (open point below).
- Lint blocks `Math.random` in `apps/server`.
- The pure tests in `model/online-game.test.ts` pass a seeded RNG. The Convex tests use the real server RNG and read the dice from `getGame`.

## The client view

`getGame` returns `OnlineGameView` (`packages/contracts`): `gameId`, `version`, `status`, `choice`, `pace`, `turnDeadline` (epoch ms on the server clock, `null` when finished; a phone shows the time left from it), `players`, `match` (rules, score, finished games), `game` (the engine `GameFlow` of the current game), `waitingFor` (the side to move or answer) and `prompt`. `game.played` is always empty, because turns are saved whole.

## The port

`GameTransport` in `packages/contracts`: `subscribe(gameId, onView, onError)`, `sendTurn({ gameId, expectedVersion, moves })`, `sendAnswer({ gameId, expectedVersion, choice })`, `resign(gameId)`. The calls carry no player id: the adapter knows the caller (auth). A Convex adapter (`packages/adapters/backend-convex`) comes in a later issue.

## Tests (offline)

`pnpm test` runs Vitest in `apps/server` with the **edge runtime** environment (`@edge-runtime/vm`), as the convex-test docs say. convex-test runs the real functions against an in-memory database, with schema checks.

- `convex/games.test.ts` (convex-test): a full Portes game between two players with server dice (and the log replays to the saved game), an illegal move, a wrong player and a stranger, an old version (two phones at once), resign ends the match, the Plakoto mother question (only the pinned player answers; `playOn` and `resign`; a late answer times out), a missing game. Turn timers with `vi.useFakeTimers()` and `t.finishInProgressScheduledFunctions()`: a live time out loses the game and the next game starts; the match ends on the last point; a move just in time is fine and the old check does nothing; a late move gets `TIMED_OUT` and the time out is saved; async is 24 hours; resign stops the clock. Every test in the file uses fake timers, so no turn check fires on its own.
- `convex/model/online-game.test.ts` (pure, seeded RNG): whole matches of every game choice with random legal turns and answers, replay equals the saved flow, no dice drawn ahead, error codes, the timer helpers and `timeOut`.
- `convex/model/crypto-rng.test.ts`: the secure RNG.

The test files and `test.setup.ts` have two dots in their names, so Convex does not deploy them. The module glob in `test.setup.ts` uses a negative pattern (`['./**/*.*s', '!./**/*.*.*s']`): the extglob from the convex-test docs does not work with the Vite glob of Vitest 5.

## Codegen without a deployment

Convex code imports types from `convex/_generated/`. We **commit** these files, as Convex recommends. CI never runs codegen and needs no account or secret.

`npx convex codegen` normally needs a deployment (`CONVEX_DEPLOYMENT`). It fails without one. To regenerate offline, run:

```bash
pnpm --filter @tavli/server codegen   # convex codegen --system-udfs --typecheck disable
```

`--system-udfs` is a hidden CLI flag. With it, the CLI skips the deployment and runs its plain local codegen. The output is the normal `_generated` code of an app with no Convex components. Run it after you add or rename a file in `convex/`. Once there is a deployment, `npx convex dev` writes the same files. When the app adds Convex components (for example Better Auth or presence, which need `convex.config.ts`), codegen needs a deployment: use `npx convex dev` then.

`_generated/` is skipped by ESLint and Prettier.

## Open points

- **Deploy** (owner): create the Convex project (EU region if offered), run `npx convex dev` once in `apps/server`, add `CONVEX_DEPLOY_KEY` as a secret for deploys. Not needed for CI.
- **Auth** (#46): replace the `callerId` argument with the Better Auth user (`ctx.auth`). Then `getGame` should answer only the two players.
- **Verify the dice** on a real deployment: `crypto.getRandomValues` in a mutation gives different, unpredictable dice per call.
- **Client adapter**: `packages/adapters/backend-convex` implements `GameTransport` with the Convex React client.
- **Clock skew:** `turnDeadline` is on the server clock. A phone should show the time left from the server time (for example the offset seen when the view arrives), not trust its own clock.
- **Invites, friends, users, presence, push**: later issues.
- **Document size**: one game row holds the whole match flow (a few KB). The log is in `moves`, so the row does not grow with the game.
