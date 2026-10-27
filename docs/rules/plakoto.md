# Plakoto (Πλακωτό)

Shared rules (dice, forced moves, bearing off, match) are in
`tavli-match.md`. This file lists only the Plakoto rules.

## Summary

Plakoto is a contrary-movement game where checkers are not hit but
**pinned** ("πλάκωμα"). Each player starts with all 15 checkers on one point.
Pinning the opponent's last checker on its starting point (the **mother**,
μάνα) usually wins a double game.

## Board & notation

- Own-perspective points 1–24 (see `tavli-match.md`). Off = 0. There is no
  bar.
- Contrary movement: White point `p` = Black point `25 - p`.
- **Starting point** = own point 24 (= opponent's point 1).
- **Mother (μάνα):** a player's checker that is alone on that player's own
  point 24, when all the player's other checkers have left it. (Some sources
  also call point 24 itself "the mana".)
- **Door (πόρτα):** a point the opponent may not land on. It is either
  2+ checkers of one player, or a point where one player pins the other.
- **Pinned checker:** a lone checker with one or more opponent checkers on
  top of it.

## Starting position

Each player has 15 checkers on their own point 24. In White's numbering:
White 24 = 15, Black on White's 1 = 15.

```
  13 14 15 16 17 18 | 19 20 21 22 23 24
  ------------------+------------------
   .  .  .  .  .  . |  .  .  .  .  . W15
                    |
   .  .  .  .  .  . |  .  .  .  .  . B15
  ------------------+------------------
  12 11 10  9  8  7 |  6  5  4  3  2  1
  (numbers = White's points)
```

White's start (W24) is Black's home point 1. Black's start (W1 = B24) is
White's home point 1.

## Direction of movement

Contrary. Each player moves from own point 24 to own point 1. White moves
counterclockwise on the diagram; Black clockwise. The app may draw the board
turned or mirrored (for example, with the player's home at the bottom left).
Only the path from own 24 to own 1 counts.

## Turn & dice rules

- Same as `tavli-match.md`. Opening roll: game 1 of a match is normally
  Portes, so Plakoto is usually started by the Portes winner.
- Doubles are played four times.
- Must use both dice when possible; higher die rule.

## Movement rules

1. A checker moves from `p` to `p - d`.
2. A checker may land on:
   - an empty point;
   - a point with own checkers (any number, including a point where the
     player is pinning an opponent checker);
   - a point with exactly one opponent checker that is **not** pinning
     anything — this pins it.
3. A checker may not land on:
   - a point with 2+ opponent checkers;
   - a point where the opponent is pinning one of our checkers (we cannot
     free our own checker by landing there).
   In short: a point is a legal target if it is empty, or its top checker is
   ours, or it holds exactly one opponent checker and nothing else.
4. When one checker uses both dice, every intermediate landing point must
   also be legal. An intermediate landing on a single opponent checker pins
   it (the pin happens; then the checker moves on and the pin is released).
   Default: allowed (standard "touch" rules). See edge case 9.
5. A pinned checker cannot move.
6. The checker on top (pinner) can move away at any time. When the last
   pinning checker leaves, the pinned checker is free again.
7. There is no bar and no re-entry. Checkers never go backward.

## Hitting / pinning / blocking rules

1. No hitting. Landing on a lone opponent checker pins it.
2. A checker that is itself pinned cannot move and cannot pin.
3. A checker that is pinning cannot be pinned (that point is a door for the
   opponent).
4. The pinner may add more of its own checkers on the same point.
5. The pinned checker stays pinned until **all** opponent checkers leave
   that point.
6. Doors (2+ own checkers, or a pin) block the opponent from landing.
7. Six doors in a row cannot be jumped. Building a 6-prime is legal in
   Plakoto.

### Mother (μάνα) rule — federation version

> **App default is `offerConcede`** (owner's choice): the pinned player may resign for 2 points or play on. See the flags table. The federation version below is a preset.

Let A's mother be pinned by B (B has a checker on A's point 24 = B's point 1,
on top of A's last checker there).

1. **Instant double:** the game ends at once and B wins **2 points** as soon
   as both are true: (a) A's mother is pinned by B, and (b) B has **no**
   checkers left on B's own starting point (B's point 24). Check after every
   single checker move.
2. If B still has checkers on B's point 24, the game continues. B's own
   mother is still at risk.
3. **Draw:** if both mothers are pinned at the same time, the game ends at
   once as a draw. Nobody scores. (Next game: see `tavli-match.md`.)
4. If B moves the pinning checker(s) off A's mother before condition 1 is
   met, A's mother is free again and the game continues normally.

Note: B pins A's mother by landing on B's own point 1. So the pinning checker
is in B's home. A's other checkers can still play, but A can never bear off
while the mother is pinned.

## Bearing off

- Shared rules apply (`tavli-match.md`).
- Extra condition: a player may not bear off while **any** of their checkers
  is pinned (ΕΟΠΤ 3.3.ii; Greek Wikipedia; zizanio.gr). This includes a
  pinned checker inside the player's own home.
- If a checker is pinned during bearing off, bearing off stops until it is
  free. The player may still make other legal moves inside home.
- If no legal move exists, the turn is lost.

## Winning & scoring

| Result | Condition | Points |
|---|---|---|
| Single | Winner bears off all 15; loser has borne off ≥1 | 1 |
| Double / mars | Winner bears off all 15; loser has borne off 0 | 2 |
| Mother win | Mother rule condition 1 (see above) | 2 |
| Draw | Both mothers pinned | 0 / 0 |

The "Mother win" and "Draw" rows are for `motherRule: "federation"`. The
app default is `"offerConcede"`: when a mother is pinned, the pinned player
chooses **Resign** (the opponent wins 2 points) or **Play on** (the game
goes on as with `"none"`). See the flags table and open questions Q23 and
Q24 in `docs/open-questions.md`.

There is no triple game and no cube.

## Edge cases

Edge cases 10–14 use `motherRule: "federation"`. The default
`"offerConcede"` asks the pinned player instead (see "Winning & scoring").

1. Start: 15 on own 24 for each side; first moves from 24 only.
2. Landing on a single opponent checker pins it; it cannot move.
3. Landing on a point with 2+ opponent checkers is illegal.
4. Landing on a point where the opponent pins our checker is illegal.
5. Landing on a point where we pin an opponent checker is legal (stack
   grows).
6. Pinner moves away → pinned checker can move next turn.
7. Two pinners on a point; one leaves → still pinned; both leave → free.
8. A pinned checker is not counted as "able to move" when computing legal
   plays (affects the higher-die rule).
9. Combined move 6-5 where the intermediate point holds a single opponent
   checker: the move passes through and ends elsewhere; the opponent checker
   is not pinned at the end of the move (default). With flag
   `intermediatePinBlocks=true`, such a combined move is illegal.
10. A's last checker on 24 alone; B lands on B's 1 → A's mother pinned. If B
    has 0 checkers on B's 24 → game over, B +2 immediately (even mid-turn).
11. Same as 10, but B still has checkers on B's 24 → game continues.
12. Continue 11: B later moves the last checker off B's 24 while still pinning
    A's mother → game over at that moment, B +2.
13. Continue 11: A pins B's mother → draw, 0 points.
14. Continue 11: B moves the pinning checker away → A's mother free; no
    special result.
15. A has 2+ checkers on own 24 → B cannot land there (door) → mother rule
    impossible.
16. All 15 of A in home, but one A checker in home is pinned → A cannot bear
    off; A may only move other home checkers, otherwise passes.
17. A is bearing off; B pins an A checker in A's home → A must stop bearing
    off.
18. Winner bears off last checker while loser has borne off 0 → 2 points.
19. A player with no legal move (everything pinned or blocked) passes.
20. With flag `motherRule="instant"`: pinning the mother ends the game at
    once (+2), whatever the pinner's own position; draw is impossible.

## House-rule variants (flags)

| Flag | Values | Default | Notes |
|---|---|---|---|
| `motherRule` | `"offerConcede"`, `"federation"`, `"instant"`, `"none"` | `"offerConcede"` (owner) | `offerConcede` (owner, 2026-10-26): when a mother is pinned, the pinned player chooses **Resign** (opponent wins 2 points) or **Play on** (game continues as `none`). Vs bot and pass-and-play the human decides; online, only the pinned player decides. `federation`: rule above (ΕΟΠΤ 3.3.iii, bkgm.com, EN Wikipedia agree). `instant`: pinning the mother ends the game double at once; no draw (Greek Wikipedia variant). `none`: no special result; the game simply continues (pinned mother can only be freed when the pinner leaves; Greek Wikipedia says this "almost always" ends as a double anyway). |
| `motherCheckTiming` | `"afterEachMove"`, `"endOfTurn"` | `"afterEachMove"` | ΕΟΠΤ says "the moment". |
| `mutualMotherPin` | `"draw"`, `"replay"` | `"draw"` | Draw = 0 points. `replay` = replay the same Plakoto game (not seen in sources; offered for casual play only). |
| `intermediatePinBlocks` | bool | `false` | See edge case 9. Sources are silent; default treats the jumped-on checker as unaffected. |
| `bearOffWhilePinned` | bool | `false` | All sources forbid bearing off while pinned. |

## Sources

- ΕΟΠΤ Tournament Rules v1.0 (2025), §3.3: https://eopt.gr/wp-content/uploads/2025/08/%CE%BA%CE%B1%CE%BD%CE%BF%CE%BD%CE%B9%CF%83%CE%BC%CE%BF%CF%82.pdf
- bkgm.com, Plakoto: https://bkgm.com/variants/Plakoto.html
- Wikipedia (EN), Plakoto: https://en.wikipedia.org/wiki/Plakoto
- Wikipedia (EL), Πλακωτό: https://el.wikipedia.org/wiki/Πλακωτό
- Wikipedia (EL), Κανόνες του ταβλιού: https://el.wikipedia.org/wiki/Κανόνες_του_ταβλιού
- Zizanio.gr, Πλακωτό κανόνες: https://zizanio.gr/tavli-plakoto-kanones
- Vassilis Condos, Tavli: https://bkgm.com/articles/Condos/Tavli/
- Boardgammon, Τάβλι στην Ελλάδα: https://boardgammon.com/el/backgammon/culture/greece/
