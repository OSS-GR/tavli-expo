# ADR-0007: Online game turn timer

- **Status:** Accepted
- **Date:** 2026-10-30
- **Issue:** #183 (owner feedback on the Play a friend flow)

## Context

Play a friend online offers two paces: **Live** (1 minute per turn, both players
present, no "your turn" push) and **Async** (24 hours per turn, remote, pushes).
The owner finds the binary pointless: a friend game is remote either way, so the
1-minute "live" case only differs from async by its deadline and by suppressing
the push.

The ask: drop the live/async option. Default to the async behaviour (24 h per
turn, no rush), and let a player set a **per-turn time limit in minutes** to make
a game faster. The field must not be called "async"; when no limit is set, the
game behaves as before under async.

## Options

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| A. Replace `pace` with `turnTimeMinutes` (`number \| null`) | One knob; default `null` reproduces async; a minutes value speeds it up | Breaks the contract, the DB schema (migration), the pure model and every caller of `pace` | Size L |
| B. Keep `pace`, add an optional minutes override | Smaller diff | Two ways to say "async"; keeps the live/async wording the owner wants gone | Size M |
| C. Keep the two paces, relabel live→"1 minute per turn" | Minimal | Does not match the request (still a binary; "if none" has no representation) | Size S |

## Decision

We choose **A**. Drop `OnlineGamePace` and `ONLINE_GAME_PACES`. A new
`turnTimeMinutes: number | null` travels in `NewInvite`, `InviteView`,
`OnlineGameView` and `GameSummary` (#256, #281, #297). `null` is the default and
keeps the async behaviour (24 h per turn). A player may set a number of minutes to
shorten the deadline.

Consequences:

- `TURN_TIME_MS[pace]` becomes `turnDeadlineMs(turnTimeMinutes)` in
  `packages/contracts`: `null` → `ASYNC_TURN_TIME_MS` (24 h), else
  `minutes * 60 * 1000`. `nextDeadline` and `deadlineAfter` take `turnTimeMinutes`
  instead of `pace`.
- There is no longer a "live, both players present" case for a friend game, so
  "your turn" and "game over" pushes go out for **every** online game. The
  `pace !== 'async'` gate is removed from `turnPushSide` and
  `matchEndPushSides` in `apps/server/convex/model/push.ts`.
- The client offset estimate (`timeLeft.ts`) uses
  `turnDeadlineMs(view.turnTimeMinutes)` instead of `TURN_TIME_MS[view.pace]`.
- DB schema (`apps/server/convex/schema.ts`): `games.pace` and `invites.pace`
  (`gamePace`) become `turnTimeMinutes` (`v.union(v.number(), v.null())`). See
  "Migration" below.
- Analytics (`ANALYTICS_EVENTS.invite_created`): `pace: OnlineGamePace` becomes
  `turnTimeMinutes: number | null` — and `docs/architecture/analytics-events.md`
  with it. The test `eventPlan.test.ts` checks the list.

### Migration

Convex validates a document against the schema on the next write; old rows still
holding `pace` (a literal string) break `v.union(v.number(), v.null())` when read
typed as `Doc<'games'>`. Since this is the dev deployment (online play is built
for real but not yet shipped to prod), we rename the field **in place** to
`turnTimeMinutes` and backfill from the literal: `live → 1`, `async` (and any
missing/`null`) → `null`. A one-off migration script runs on deploy (or, for the
in-memory server, `memory-server.ts` is constructed with the new field). If the
deployment is treated as throwaway, the backfill can be skipped.

### UI (decisions taken)

- `FriendSetupScreen`: replace the Live/Async segmented control with a
  **Turn time** picker: a "None (24 h a turn)" option (the default) and a few
  minute values a player can pick to speed a game up. No "async" wording.
- `InviteScreen.open` and the Home invite row: show the minutes value (or "24 h")
  instead of `view.pace`.

## Consequences

- What gets easier: one knob to reason about; remote "live" games now notify like
  the rest (which is correct, since both players are not watching).
- What gets harder: a schema migration on the dev deployment; every test and
  contract check that builds a game invite or asserts on `pace` must move to
  `turnTimeMinutes`.
- How we switch later: the adapter interface (`Invites`/`GameTransport` ports) and
  the contract checks in `@tavli/contracts/testing` are the only seams; flipping
  the default or adding minute presets is local to `turnDeadlineMs` and the setup
  screen.
