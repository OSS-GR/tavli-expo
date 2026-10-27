# Tavli match — format, scoring and shared rules

This file holds the rules shared by all games. The game files
(`portes.md`, `plakoto.md`, `fevga.md`, `asodio.md`) only list what is
different. If a game file says nothing about a topic, this file applies.

## Summary

A Tavli match is a series of games played in a fixed rotation:
Portes → Plakoto → Fevga → Portes → … The match ends when one player
reaches the target score (usually 3, 5 or 7 points). There is no doubling
cube. A game is worth 1 point (single) or 2 points (double, "mars").

## Board & notation

- 24 points in four quarters of six. Each player has 15 checkers. Two dice.
- **Own-perspective numbering.** Every player numbers the points 1–24 along
  their own path. Point 24 is the first point of the path (farthest from
  home). Point 1 is the last point (deepest in home). A player's checkers
  always move from higher numbers to lower numbers.
- **Home** = own points 1–6. **Starting quarter** = own points 19–24.
- Special locations: `bar` = 25 (only in hitting games: Portes, Asodio),
  `off` = 0 (borne off). In Asodio, "not yet entered" is also 25.
- **Move notation:** `from/to`, e.g. `24/18`, `25/22` (enter from bar),
  `6/0` (bear off). A hit can be marked with `*`: `13/8*`.
- **Conversion between the two players' numbers** (`p` = point for player A,
  `q` = same physical point for player B):
  - Contrary-movement games (Portes, Plakoto, Asodio): `q = 25 - p`.
  - Parallel-movement game (Fevga): `q = p > 12 ? p - 12 : p + 12`.
- Recommended engine storage: one array of 24 physical points, indexed from
  player A's view. Convert to player B's view with the formula of the game.
- Board diagrams in these files are drawn from White's (player A's) view.
  White's home is bottom right. White's point 24 is top right.

```
  13 14 15 16 17 18 | BAR | 19 20 21 22 23 24
  ------------------+-----+------------------
   (top row)        |     |       (top row)
                    |     |
   (bottom row)     |     |    (bottom row)
  ------------------+-----+------------------
  12 11 10  9  8  7 |     |  6  5  4  3  2  1    <- White's home: 1-6
```

## Starting position

See each game file.

## Direction of movement

- Portes, Plakoto, Asodio: contrary. The players move in opposite
  directions.
- Fevga: parallel. Both players move counterclockwise.

## Score names

- **Mono (μονό)** = single win = 1 point.
- **Diplo (διπλό)** = mars / double win = 2 points.
- There is no 3-point win in our default rules (owner, 2026-10-26).
- The UI shows these Greek names (English: single / double).

## Turn & dice rules (shared)

### Who starts the first game (opening roll)

Each player rolls one die. A tie is rolled again. The higher die starts.
Sources disagree on what happens next, so the engine needs a flag:

- `openingRoll: "useOpeningDice"` — the two opening dice are the first
  player's first roll. A double is impossible on the first turn. This is the
  rule of the Hellenic Federation of Traditional Tavli (ΕΟΠΤ, 2025).
- `openingRoll: "rerollBoth"` — the winner of the opening roll rolls both
  dice again. A double is possible. This is the rule on bkgm.com, English
  Wikipedia, and (per Greek Wikipedia) the most common café custom.
- `openingRoll: "chosenStarterRolls"` — players agree who starts; that player
  rolls both dice. (Greek Wikipedia "option 1".)

**Default:** `useOpeningDice` (federation rule). Confirmed by the owner on
2026-10-26. The other values stay available as options in Kafeneio mode (#58).

### Who starts later games

- The winner of the previous game starts the next game. They roll both dice
  for their first turn (no opening contest).
- After a drawn game (only possible in Plakoto and Asodio), the players do a new opening
  roll (ΕΟΠΤ 3.1.ii).
- **Rematch (owner rule, 2026-10-26):** when the same two players play again
  in the same session (a rematch), there is no opening roll. The winner of the
  last game starts. Flag `rematchStarter: "lastGameWinner" | "openingRoll"`,
  default `"lastGameWinner"`.

### Normal turn

- Roll two dice. Each die is a separate move of one checker.
- The two dice may move the same checker or two different checkers.
- When one checker uses both dice, the intermediate landing point must be a
  legal landing point too.
- The player may play the dice in either order.
- **Doubles** are played four times (e.g. 4-4 = four moves of 4). If not all
  four can be played, play as many as possible.

### Must use as much of the roll as possible

1. If both dice can be played (in either order), the player must play both.
2. For doubles, the player must play as many of the four moves as possible.
3. If only one die can be played, the player plays it.
4. **Higher die rule:** if either die could be played alone, but not both,
   the player must play the higher die. If only the lower die can be played,
   the player plays the lower die.
5. If no die can be played, the turn is lost ("γέλα" / pass).
6. A player may never refuse a legal move.

Engine algorithm:

1. Generate every sequence of single-die moves (both dice orders; up to four
   moves for doubles). Include shorter sequences that stop because no
   further move is legal.
2. Remove sequences that break a game-specific end-of-turn restriction
   (for example the Fevga prime rules).
3. Keep only sequences with the maximum number of dice used.
4. If that maximum is 1 and the dice are different, and some sequence uses
   the higher die, keep only sequences that use the higher die.
5. The remaining sequences are the legal plays. Deduplicate by final
   position if needed.

House-rule flag: `higherDieRule` (default `true`). Greek Wikipedia mentions a
variant where the player may choose which die to play. With `false`, step 4
is skipped.

### Bearing off (shared)

1. A player may bear off only when all 15 of their checkers are in their home
   (points 1–6). Game files add extra conditions (e.g. not pinned in
   Plakoto, nothing on the bar in Portes).
2. A die of value `d` bears off a checker from point `d`.
3. If point `d` is empty, the player must use the die to move a checker from a
   higher point (if such a move is legal).
4. If point `d` is empty and there is no checker on any higher point, the
   player bears off a checker from the highest occupied point.
5. The player may also use a die to move a checker inside home instead of
   bearing off, if that move is legal.
6. If a checker leaves home again (hit in Portes/Asodio), bearing off stops
   until that checker is back in home.
7. A checker can reach home with the first die and then be (or allow another
   checker to be) borne off with the second die in the same turn.

### Winning & scoring (shared)

- The first player to bear off all 15 checkers wins the game.
- **Single (μονό):** the loser has borne off at least one checker → 1 point.
- **Double / mars (διπλό / μαρς):** the loser has borne off no checkers →
  2 points.
- There is no triple game in Greek tavli. In Portes a "backgammon" counts as a
  double (ΕΟΠΤ 3.2). See `portes.md` for the flag.
- Plakoto has two extra outcomes: mother pin (2 points) and draw (0 points).
  See `plakoto.md`.
- No doubling cube. (Optional flag only for Portes; see `portes.md`.)

## Match format

- **Rotation:** Portes → Plakoto → Fevga, repeating. The rotation advances
  after every game, including a drawn Plakoto.
- **Target score:** usually 3, 5 or 7. Odd numbers are the custom. 11 is about
  the usual maximum; 13+ is rare (Greek Wikipedia).
- The match ends as soon as one player's total is ≥ target. Overshooting is
  fine (e.g. 4 + 2 = 6 in a 5-point match wins).
- There is no Crawford rule (there is no cube).
- The match always starts with Portes (default).

## Resigning (app rule)

The federation rules and our other sources do not say how a resign
scores. These are the app rules (owner, #63 and #181).

- **Resign game:** the opponent wins the game. They get what the position
  is worth now: diplo (2 points) if the resigning player has borne off no
  checker, else mono (1 point). With `backgammonScores3` (Portes, off by
  default) a backgammon position gives 3. A variant may score it in its own
  way (Plakoto `offerConcede`: 2). The points count in the match like any
  other win, so a resigned game can win the match.
- **Resign match:** the match ends at once and the opponent wins it.
  - The score stays as it is: the points of the finished games count. The
    game in play gives no points. The opponent does not get the target
    points, and the score is never reset.
  - A player may resign the match at any time while it is in play: at 0–0,
    during the opening roll, in the middle of a game, or after a game ends.
    (In pass-and-play the app offers it only to the player to move.)
  - The match end screen and the history show the real score and say who
    resigned the match ("You resigned the match").

## Edge cases

1. Opening roll tie (e.g. both roll 4): roll again until different.
2. `useOpeningDice`: opening dice 5 and 3 → starter plays 5-3. A double can
   never be the first roll of game 1.
3. `rerollBoth`: starter may roll a double (e.g. 6-6) on the first turn.
4. Game 2 starter = winner of game 1, rolling fresh dice; no opening contest.
5. Plakoto ends in a draw → 0 points to both; next game is Fevga; a new
   opening roll decides who starts Fevga.
6. Rotation after game 3 (Fevga) goes back to Portes.
7. Match to 5: score 4–3, player with 4 wins a mars → final 6–3, match over.
8. Match to 5: score 3–3, a single → 4–3, match continues with the next game
   in rotation.
9. Dice 6-5, only the 5 can be played → play the 5.
10. Dice 6-5, either die can be played alone but not both → must play the 6.
11. Dice 6-5, the 6 is blocked first, but 5 then 6 is legal → must play both
    (5 then 6).
12. Doubles 3-3 with only two legal threes → play two, lose the rest.
13. No legal move → turn passes; dice are still shown/recorded.
14. Bear off with die 6 when the highest checker is on point 4 → bear off
    from 4.
15. Bear off with die 3 when point 3 is empty and point 5 has a checker →
    must move a checker 3 pips from a higher point (e.g. 5/2), may not bear
    off from point 2.
16. With die 2, a player with a checker on point 2 may choose to move 6/4
    instead of bearing off from 2.
17. Last checker comes into home with the first die; the second die bears off
    a checker in the same turn.
18. Portes, match to 3, 0–0: the player to move resigns the game before any
    checker is off → diplo, the opponent leads 2–0.
19. A player who has borne off a checker resigns the game → mono, 1 point.
20. Match to 3, 0–0: a player resigns the match at the start → the opponent
    wins the match; the score stays 0–0.
21. Match to 3: a resigned game gives 0–2, then the loser resigns the match
    (after that game ends, or in the next game) → the opponent wins the
    match; the score stays 0–2. It is not reset to 0–0, and it is not 0–3.
22. Match to 3, 0–2: the trailing player resigns a game with no checker off
    → diplo, 0–4: the match is won to the target, not resigned.

## House-rule variants (flags)

| Flag | Values | Default | Notes |
|---|---|---|---|
| `targetPoints` | 1, 3, 5, 7, 9, 11 | **3** (owner, 2026-10-26) | Any positive integer is fine. The federation rules set no match length. |
| `rotation` | `["portes","plakoto","fevga"]`, `["fevga","plakoto","portes"]`, single game | P→Pl→F | Reverse order is played in some Greek regions (Greek Wikipedia). Single-game mode is useful for practice. `portes` preset = single-game match; `tavli` preset = rotation (PM, 2026-10-26). |
| `openingRoll` | `useOpeningDice`, `rerollBoth`, `chosenStarterRolls` | `useOpeningDice` | See above. Greek Wikipedia says the reverse rotation region requires `useOpeningDice`. |
| `nextGameStarter` | `previousWinner`, `alternate`, `openingRoll` | `previousWinner` | `alternate` is used by some official events for the first roll (Greek Wikipedia). |
| `afterDrawStarter` | `openingRoll`, `previousStarter` | `openingRoll` | ΕΟΠΤ 3.1.ii. |
| `higherDieRule` | bool | `true` | |

Physical-play rules that do not apply to an app RNG (kept for reference):
dice must land flat on the board, cocked or "on a checker" dice are re-rolled
(sfakia-crete.com, ΕΟΠΤ 2.3.ii); rolling before the opponent finishes does not
count; if a player stops the opponent's dice by hand, the opponent chooses the
numbers (Greek Wikipedia).

## Sources

- Hellenic Federation of Traditional Tavli (ΕΟΠΤ), Tournament Rules v1.0, Aug
  2025: https://eopt.gr/wp-content/uploads/2025/08/%CE%BA%CE%B1%CE%BD%CE%BF%CE%BD%CE%B9%CF%83%CE%BC%CE%BF%CF%82.pdf
- bkgm.com, Tavli: https://bkgm.com/variants/Tavli.html
- bkgm.com, Variants FAQ: https://bkgm.com/faq/Variants.html
- Vassilis Condos, "Tavli: Greek Backgammon": https://bkgm.com/articles/Condos/Tavli/
- Wikipedia (EN), Tavli: https://en.wikipedia.org/wiki/Tavli
- Wikipedia (EL), Τάβλι: https://el.wikipedia.org/wiki/Τάβλι
- Wikipedia (EL), Κανόνες του ταβλιού: https://el.wikipedia.org/wiki/Κανόνες_του_ταβλιού
- Sfakia-Crete, Tavli: https://www.sfakia-crete.com/sfakia-crete/tavli.html
- Zizanio.gr, Κανόνες Τάβλι: https://zizanio.gr/tavli-kanones
- Boardgammon, Τάβλι στην Ελλάδα: https://boardgammon.com/el/backgammon/culture/greece/
