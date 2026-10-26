# Portes (Πόρτες)

Shared rules (dice, forced moves, bearing off, match) are in
`tavli-match.md`. This file lists only the Portes rules.

## Summary

Portes ("doors") is the Greek form of international backgammon. The setup,
movement, hitting, bar and bearing off are the same as backgammon. The
differences are the scoring (no triple game, a "backgammon" counts as 2), no
doubling cube, and the Greek opening-roll custom.

## Board & notation

- Own-perspective points 1–24 (see `tavli-match.md`). Bar = 25, off = 0.
- Contrary movement: White point `p` = Black point `25 - p`.
- A **door (πόρτα)** is a point with 2 or more checkers of one player.
- A **blot** is a point with exactly 1 checker.
- **Εξάπορτο** = six doors in a row (a full prime).

## Starting position

Each player, in their own numbering:

| Point | Checkers |
|---|---|
| 24 | 2 |
| 13 | 5 |
| 8 | 3 |
| 6 | 5 |

Total 15. In White's numbering, Black's checkers are on 1 (2), 12 (5),
17 (3), 19 (5).

```
  13 14 15 16 17 18 | BAR | 19 20 21 22 23 24
  ------------------+-----+------------------
  W5  .  .  . B3  . |     | B5  .  .  .  . W2
                    |     |
  B5  .  .  . W3  . |     | W5  .  .  .  . B2
  ------------------+-----+------------------
  12 11 10  9  8  7 |     |  6  5  4  3  2  1
  (numbers = White's points; W = White, B = Black, digit = count)
```

## Direction of movement

Contrary. Each player moves from their point 24 toward their point 1. On the
diagram White moves counterclockwise (top row right→left, then bottom row
left→right). Black moves clockwise.

## Turn & dice rules

- Opening roll and later-game starter: see `tavli-match.md`
  (`openingRoll` flag, default = use the opening dice).
- Doubles are played four times.
- Must use both dice when possible; higher die rule applies.
- No doubling cube.

## Movement rules

1. A checker moves forward exactly the die value: from `p` to `p - d`.
2. A checker may land on: an empty point, a point with own checkers, or an
   opponent blot (this hits it).
3. A checker may not land on an opponent door (2+ checkers).
4. When one checker uses both dice, the intermediate point must also be a
   legal landing point. For doubles, every intermediate point must be legal.
5. A player with any checker on the bar must enter all bar checkers before
   moving any other checker.
6. Moves past point 1 are bearing off and follow the bearing-off rules.

## Hitting / pinning / blocking rules

1. Landing on an opponent blot hits it. The hit checker goes to the bar.
2. A checker may hit and then continue with the next die in the same turn
   (standard backgammon; see variant flag `noHitAndRunInHome`).
3. Entering from the bar: a die `d` enters on own point `25 - d` (opponent's
   home). The entry point must not be an opponent door. Entering on an
   opponent blot hits it.
4. If no die can enter, the turn is lost. If the opponent holds all six
   entry points (εξάπορτο), the player passes every turn until a point opens.
5. With two dice and two checkers on the bar: enter both if possible. If only
   one can enter, enter it and lose the rest of the roll.
6. With one checker on the bar: enter it with one die, then the other die may
   move any checker (including the one just entered).
7. Doors block landing. Six doors in a row can never be jumped by a single
   checker, because no die is larger than 6.

## Bearing off

- Shared rules apply (`tavli-match.md`).
- Extra condition: no own checker on the bar, and all 15 checkers in own
  home.
- If a checker is hit while bearing off, bearing off stops. The hit checker
  must enter and come back home first.

## Winning & scoring

| Result | Condition when the winner bears off the last checker | Points |
|---|---|---|
| Single (μονό) | Loser has borne off ≥1 checker | 1 |
| Double / mars (διπλό / μαρς) | Loser has borne off 0 checkers | 2 |
| "Backgammon" (international triple) | Loser has borne off 0 checkers **and** has a checker on the bar or in the winner's home | 2 by default (counts as a double) |

- ΕΟΠΤ 3.2: official backgammon rules apply, except the cube and triple games;
  triple games count as double.
- No doubling cube.

## Edge cases

1. Initial position has exactly 15 checkers per player on 24/13/8/6 =
   2/5/3/5.
2. Landing on an opponent door is illegal.
3. Landing on an opponent blot hits it; it goes to the bar.
4. With a checker on the bar, a roll that cannot enter loses the whole turn,
   even if other checkers could move.
5. Two checkers on bar, roll 6-6, entry point 19 open → enter both on 19,
   then play the other two sixes with any checkers.
6. Two checkers on bar, only one die can enter → enter one, lose the other
   die.
7. Opponent holds all of points 19–24 (from the entering player's view) →
   player passes; dice are not used.
8. Using both dice on one checker when the intermediate point is an opponent
   door is illegal, even if the final point is open (e.g. 6-1: 13/7/6 needs 7
   or 12 open).
9. Hit-and-continue: `13/8*/5` with 5-3 is legal by default.
10. Bearing off is illegal while any own checker is on the bar or outside
    home.
11. Checker hit during bear-off → must re-enter and return home before more
    bearing off.
12. Winner finishes; loser has borne off 0 checkers and none in winner's home
    or on bar → 2 points.
13. Winner finishes; loser has borne off 0 and a checker on the bar → 2
    points by default (3 with `backgammonScores3`).
14. Winner finishes; loser has borne off 1+ → 1 point, even if the loser
    still has a checker on the bar.
15. Opening roll in game 1 with `useOpeningDice` can never be a double.
16. Doubles: 4 moves; a checker may enter from the bar and keep moving with
    the remaining moves.

## House-rule variants (flags)

| Flag | Values | Default | Notes |
|---|---|---|---|
| `backgammonScores3` | bool | `false` | `true` follows international rules. Zizanio.gr scores backgammon as 3. ΕΟΠΤ, bkgm.com, Greek Wikipedia, Condos, sfakia-crete: counts as 2. |
| `doublingCube` | bool | `false` | Greek Portes uses no cube. Backgammon with cube is called "Βίδος/Vidos" in Greece. Only for an optional "international" mode. |
| `noHitAndRunInHome` | bool | `false` | English Wikipedia ("Portes (game)") says hit-and-run in the home board is not allowed. No other source confirms it, and the exact meaning is unclear. Proposed meaning if enabled: a checker that hits an opponent checker inside the mover's own home (points 1–6) may not move again in the same turn. Treat as unverified. |
| `openingRoll` | see `tavli-match.md` | `useOpeningDice` | |

## Sources

- ΕΟΠΤ Tournament Rules v1.0 (2025), §3.1–3.2: https://eopt.gr/wp-content/uploads/2025/08/%CE%BA%CE%B1%CE%BD%CE%BF%CE%BD%CE%B9%CF%83%CE%BC%CE%BF%CF%82.pdf
- bkgm.com, Portes: https://bkgm.com/variants/Portes.html
- bkgm.com, Backgammon rules: https://www.bkgm.com/rules.html
- Wikipedia (EN), Portes (game): https://en.wikipedia.org/wiki/Portes_(game)
- Wikipedia (EL), Πόρτες (τάβλι): https://el.wikipedia.org/wiki/Πόρτες_(τάβλι)
- Wikipedia (EL), Κανόνες του ταβλιού: https://el.wikipedia.org/wiki/Κανόνες_του_ταβλιού
- Zizanio.gr, Πόρτες κανόνες: https://zizanio.gr/tavli-portes-kanones
- Sfakia-Crete, Tavli: https://www.sfakia-crete.com/sfakia-crete/tavli.html
- Vassilis Condos, Tavli: https://bkgm.com/articles/Condos/Tavli/
- Tavli.net, Στήσιμο τάβλι: https://tavli.net/odigoi/stisimo-tavliou/
