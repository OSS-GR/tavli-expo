# ADR-0009: Play ranked

- **Status:** Accepted
- **Date:** 2026-11-13
- **Issue:** #529 (the rule), #530 (the clock on screen), #531 (matching)

## Context

Today every online game is a friend game: two people agree on an invite,
and the inviter picks the turn time (ADR-0007: none, which is 24 hours, or
a number of minutes). A time out loses the game for 1 point (#378), and
the match goes on.

The owner wants a second online mode, for people who do not know each
other: the app finds the opponent, and the match is rated. Strangers need
a fast, fixed pace, and one rule for a player who leaves: today a player
who closes the app just loses game after game on time, and the other
player waits a full turn time for each one.

## Options

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| A. Ranked games: a fixed 2-minute turn, and two time outs in a row lose the match | One clear rule; a player who leaves costs the other at most two turns; uses the engine's own `timeout` and `resignMatch` | A new field on the game; the rule must count time outs across games | Size M |
| B. Ranked games end the match on the first time out | Simplest | One slow network turn loses a whole rated match | Size S |
| C. Ranked games use the friend rule (a time out loses only the game) | No new rule | A match to 5 with a player who left takes 5 × 2 minutes or more; the other player waits for nothing | Size S |

## Decision

We choose **A** (owner, 2026-11-13):

1. The mode is called **Play ranked**.
2. One fixed turn time of **2 minutes** for the roll and the moves together
   (`RANKED_TURN_TIME_MINUTES`). There is no picker.
3. The clock shows on screen (#530, later).
4. A time out loses that game for 1 point, and the next game starts at
   once (as today).
5. A **second time out in a row** by the same player loses the whole match
   (`RANKED_TIMEOUTS_TO_LOSE` = 2). It is rated as a full loss. "In a row"
   counts the player's own turns across games, the opening roll too; a
   turn they play sets the count back to 0. The exact rule and its edge
   cases are in `docs/rules/tavli-match.md`, "Play ranked: time outs in a
   row" (edge cases 32 to 38).
6. Closing the app does not stop the clock.
7. No chat, and never a fake player: the opponent is always a real person.
8. Matching is #531, later. It starts a game through `insertGame` with
   `turnTimeMinutes: 2` and `ranked: true`.
9. Friend games are not ranked and keep today's rule.

How it is built:

- The stored game has `ranked` (Convex `games.ranked`, `v.optional`: rows
  from before #529 have none and read as `false`). The views carry it:
  `OnlineGameView.ranked` and `GameSummary.ranked`.
- The stored flow keeps each side's time outs in a row (`timeoutsInARow`).
- The pure rule is in `@tavli/online`: `timeOut(flow, rng, { ranked,
  timeoutsInARow })` plays the engine's `timeout`, and on the second one in
  a row also the engine's `resignMatch` for the late player. The engine
  does not change. Both servers call it; the Convex functions never copy
  the check.
- The app reads why a match ended from `OnlineGameView.matchEndReason`:
  `points`, `resigned` or `timeouts-in-a-row` (`ONLINE_MATCH_END_REASONS`).
- `rateMatch` sees a normal finished match with a winner, so the match is
  rated like any other (when both players are saved, as today).

### What changes from ADR-0007

ADR-0007 still holds for friend games: the inviter picks the turn time,
and a time out loses only the game. Ranked games differ:

- The turn time is fixed at 2 minutes (`checkRankedGame` refuses any other
  value), and no player picks it.
- A time out can end the match (point 5), not only the game.
- ADR-0007 sends "your turn" and "game over" pushes for every online game.
  That stays: a ranked match lost on time pushes "game over" to both
  players, like any match that ends on a time out.

## Consequences

- What gets easier: a player who leaves a ranked match costs the other
  player at most two turn times, and the result is clear and rated.
  Matching (#531) only has to call `insertGame` with the flag.
- What gets harder: the time out count is part of the stored flow, so a
  new save path must save through `storeStep` (it already must, #299).
  Every `OnlineGameView` and `GameSummary` literal needs the new fields.
- How we can switch later: the numbers are constants in
  `packages/contracts` (`RANKED_TURN_TIME_MINUTES`,
  `RANKED_TIMEOUTS_TO_LOSE`), and the rule is one helper
  (`losesRankedMatch` in `@tavli/online`). A different count or a rule for
  friend games changes only those.
