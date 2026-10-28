# @tavli/online

Online games in pure TypeScript (#251). It holds the game model that the
server runs, the checks around each server call, the invite checks, and
an **in-memory server** that gives a `GameTransport` and an `Invites` per
player.

It depends only on `@tavli/engine` and `@tavli/contracts`. No vendor code,
no network, no `Math.random` (lint blocks it). Dice come from an `Rng` that
the caller passes in.

Two servers use it:

- the Convex functions in `apps/server/convex/games.ts` and `invites.ts`
  (with the secure RNG, `createCryptoRng`);
- the in-memory server here, for the app, its tests and a dev game before
  the Convex project exists.

See `docs/architecture/online-game-service.md` for the move flow, the
turn timers and the data model.

## What it exports

| File                   | What it holds                                                                                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/online-game.ts`   | The game model: `onlineGameRules`, `createOnlineMatch`, `playTurn`, `answerPrompt`, `resign`, `timeOut`, `advance`, `toView`, `storeFlow` / `loadFlow`, the timer helpers `deadlineAfter` / `isTimedOut`, and `OnlineGameError`                                        |
| `src/calls.ts`         | The call checks both servers share: `checkNewGame`, `checkCall` (game, caller, version), `checkViewer` (who may read a game), `callTimedOut` + `TIMED_OUT_ERROR`, `scheduledCheck` (the turn timer check), `nextDeadline`, `matchStatus`, `eventActor`, `SERVER_ACTOR` |
| `src/invites.ts`       | The invite checks and codes (#252, moved here in #256): `newInviteCode`, `pickInviteCode`, `pickInviteCodeNow`, `newInvite`, `checkAnswer`, `checkCancel`, `inviteStatus`, `toInviteView`, and `InviteError`                                                           |
| `src/memory-server.ts` | `createMemoryGameServer({ rng, now })`                                                                                                                                                                                                                                 |
| `src/testing.ts`       | `@tavli/online/testing`, for tests only: `pickTurn`, `pickChoice`, `motherPin` (a Plakoto position for the mother question)                                                                                                                                            |

A failed check throws an `OnlineGameError` (`code` is a
`GameTransportErrorCode`). Each server turns it into its own error: Convex
throws a `ConvexError`, the in-memory transport rejects with plain
`{ code, message }`.

## The in-memory server

```ts
import { createMemoryGameServer } from '@tavli/online';

const server = createMemoryGameServer({ rng, now: () => clock });
const gameId = server.createGame('alice', { white: 'alice', black: 'bob' }, 'portes', 3, 'live');
const alice = server.transportFor('alice'); // a GameTransport
const stop = alice.subscribe(gameId, (view) => render(view));
await alice.sendTurn({ gameId, expectedVersion: view.version, moves });
```

- `createGame(callerId, players, choice, targetPoints, pace)`: same checks
  and result as the Convex mutation. It returns the id (`game-1`,
  `game-2`, …) and throws an `OnlineGameError` for bad arguments.
- `transportFor(playerId)`: a `GameTransport`. Every call it makes comes
  from that player. There is no sign-in here: the transport stands for
  that player, signed in. The Convex server reads the player from the
  sign-in token instead (#131).
- `subscribe` calls `onView` with the current view on a later microtask,
  then after each change. It never calls it inside `subscribe`. A missing
  game calls `onError` with `NOT_FOUND`. Only the two players may watch a
  game: a stranger's `onError` gets `NOT_A_PLAYER`, as on the server.
- A call waits one microtask before it changes anything, like a network.
- Views, requests and log events are copies (a JSON round trip). A client
  cannot change the server state.
- A rejected call rejects with plain `GameTransportErrorData`, with the
  same codes as the Convex server.
- **Time** comes from `now()`. Nothing runs on a timer. `runDueTimeouts()`
  applies every time out whose deadline has passed. It runs each check at
  its deadline, like the Convex scheduler, so a game that waited three
  turn times loses three games. A late `sendTurn` or `sendAnswer` gets
  `TIMED_OUT`, and the time out is saved, as on the server.
- `getGame(gameId)` gives the view, and `events(gameId)` the event log
  (`{ seq, version, actor, event }`, like the Convex `moves` rows).
  `replay(events.map((row) => row.event))` rebuilds the game.
- **Invites** (#256): `createInvite(callerId, choice, targetPoints, pace)`
  makes an open invite and returns its code (from the server's `rng`,
  through `pickInviteCodeNow`, the at-once twin of `pickInviteCode`).
  `cancelInvite(callerId, code)` takes an open invite back, like the
  Convex `cancelInvite`. `invitesFor(playerId)` gives that player's `Invites` port
  (`getInvite`, `acceptInvite`, `declineInvite`), and `getInvite(code)`
  reads one invite. The checks are those of `invites.ts`, as on Convex.
  `acceptInvite` starts the game with `createGame` (the inviter plays
  white). No timer: an open invite counts as expired once `now()` reaches
  `expiresAt`. A rejected call rejects with plain `InviteErrorData`.
- `setFlowForTest(gameId, flow)`, tests only: replaces the stored flow,
  like a Convex test that patches `games.flow`. Call it before anyone
  subscribes.

## Tests

`pnpm --filter @tavli/online test` (Vitest):

- `online-game.test.ts`: the model with a seeded RNG (moved from
  `apps/server`): whole matches of every game choice, replay, error codes,
  the timer helpers.
- `calls.test.ts`: the shared call checks, and `checkViewer`.
- `memory-server.test.ts`: the `GameTransport` contract checks
  (`gameTransportContract` from `@tavli/contracts/testing`), a whole
  match of each game choice through two transports (the log replays to
  the last view), and the turn timers on a fake clock.
- `invites.test.ts`: the invite checks and codes with a seeded RNG (moved
  from `apps/server`).
- `memory-invites.test.ts`: the `Invites` contract checks
  (`invitesContract`), the game an accept starts, codes and clashes.

An adapter of `GameTransport` (for example the Convex adapter) runs the
same contract checks. They are plain async functions, so Vitest and Jest
can both run them:

```ts
for (const check of gameTransportContract()) {
  it(check.name, () => check.run(makeSubject()));
}
```
