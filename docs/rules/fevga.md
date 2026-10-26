# Fevga (Φεύγα)

Shared rules (dice, forced moves, bearing off, match) are in
`tavli-match.md`. This file lists only the Fevga rules.

## Summary

Fevga ("run away") is a running game. Both players move in the same
direction and there is no hitting or pinning: a single checker owns a point.
Each player must first run one checker past the opponent's starting point,
and players may not build certain six-point blocks.

## Board & notation

- Own-perspective points 1–24 (see `tavli-match.md`). Off = 0. No bar.
- **Parallel movement conversion:** White point `p` = Black point
  `p > 12 ? p - 12 : p + 12`. So White 24 = Black 12, and White 12 =
  Black 24.
- **Starting point / mother (μάνα):** own point 24.
- **Starting quarter (αφετηρία):** own points 19–24.
- **Opponent's starting point:** own point 12. **Opponent's starting
  quarter:** own points 7–12.
- **Door:** any point with 1+ checkers of a player. The opponent may never
  land there.
- **Prime / εξάπορτο:** six consecutive points (along the track) each held by
  the same player.
- **Runner:** the first checker a player moves off point 24.

## Starting position

Each player has 15 checkers on own point 24. The two stacks are in diagonally
opposite corners. In White's numbering: White 24 = 15, Black on White 12 = 15.

```
  13 14 15 16 17 18 | 19 20 21 22 23 24
  ------------------+------------------
   .  .  .  .  .  . |  .  .  .  .  . W15
                    |
 B15  .  .  .  .  . |  .  .  .  .  .  .
  ------------------+------------------
  12 11 10  9  8  7 |  6  5  4  3  2  1
  (numbers = White's points)
  White home = W1-6 (bottom right). Black home = W13-18 (top left).
```

## Direction of movement

Parallel: both players move counterclockwise on the diagram.
White: W24 → W13 (top row, right to left) → W12 → W1 (bottom row, left to
right). Black: W12 → W1 → W24 → W13.

## Turn & dice rules

- Same as `tavli-match.md`.
- Doubles are played four times.
- Must use as much of the roll as possible; higher die rule.
- The Fevga restrictions below are applied when generating legal plays (see
  the algorithm in `tavli-match.md` and "Order of checks" below).

## Movement rules

1. A checker moves from `p` to `p - d`.
2. A checker may land only on an empty point or a point with own checkers.
3. A checker may never land on a point with any opponent checker.
4. When one checker uses both dice (or several moves of a double), every
   intermediate landing point must be legal (not held by the opponent).
5. **Runner rule (first checker):** at the start of the game a player may
   move only one checker (the runner). No other checker may leave point 24
   until the runner has **passed the opponent's starting point**, i.e. the
   runner is on own point 11 or lower (ΕΟΠΤ 3.4.ii; bkgm.com; EN Wikipedia).
   - The restriction ends in the middle of a turn: once the runner reaches
     point ≤ 11 with one die, the remaining dice may move any checker.
   - If the runner cannot move, the rest of the roll is lost (other checkers
     may not move instead).
6. **Prime rules** (see next section) can make an otherwise legal play
   illegal.

## Hitting / pinning / blocking rules

1. No hitting. No pinning. One checker holds a point.
2. Six held points in a row cannot be jumped by the opponent.

### Prime restrictions (default = ΕΟΠΤ 3.4.iii)

Checked on the position at the **end of the mover's turn** (default).

- **P1 — no prime in own starting quarter:** a player may not hold all six
  of own points 19–24.
- **P2 — no prime in front of the opponent's mother:** a player may not hold
  all six of own points 6–11 (the six points directly in front of the
  opponent's starting point; = opponent's points 18–23).
  *Interpretation:* sources say "in front of the opponent's mana" (ΕΟΠΤ) or
  "the opponent's first quadrant" (EN Wikipedia: own points 7–12). Default
  uses 6–11; flag `p2Window` allows 7–12.
- **P3 — must leave the opponent a move, if possible:** after the turn, the
  opponent must have at least one legal single-die move for at least one die
  value 1–6 (using the opponent's full rules, including their runner rule and
  bearing off). If **every** legal play of the roll would leave the opponent
  with no move, the player may play any of them. (ΕΟΠΤ: "εφόσον είναι
  δυνατόν" — if possible; EN Wikipedia: "if the blocked player cannot
  legally unblock, they lose their turn".)
- bkgm.com / Condos phrase P3 as: if you hold a 6-prime and the opponent has
  all remaining checkers behind it, you must open a point. P3 covers this.

### Order of checks (engine)

1. Generate all move sequences (movement rules + runner rule).
2. Drop sequences whose final position breaks P1 or P2. These are absolute
   bans. A shorter sequence may then become the longest legal one.
3. Apply the "use as many dice as possible" rule and the higher die rule.
4. Apply P3 among the remaining plays: if at least one leaves the opponent a
   move, drop those that do not.

Flag `p3Priority` lets P3 run before step 3 (i.e. a player must even give up
a die to avoid a full block). Default runs P3 after step 3, because the
"play the full roll" rule is the base rule and P3 is "if possible".

## Bearing off

- Shared rules apply (`tavli-match.md`).
- Own home = own points 1–6 (for White: bottom right; for Black: White's
  13–18).
- All 15 checkers must be in home.

## Winning & scoring

| Result | Condition | Points |
|---|---|---|
| Single | Loser has borne off ≥1 | 1 |
| Double / mars | Loser has borne off 0 | 2 |

No triple game, no cube.

## Edge cases

1. Start: White 15 on W24, Black 15 on W12 (= B24).
2. First turn, any roll: only the runner may move.
3. Opening 6-6 (opponent's 15 still on own 12): runner 24/18; next 6 would
   land on 12 (held) → illegal. Other checkers may not move. Only one 6 is
   played.
4. Opening 4-4: 24/20/16; third 4 lands on 12 → illegal. Two 4s played.
5. Opening 3-3: 24/21/18/15; fourth 3 lands on 12 → illegal. Three 3s played.
6. Opening 5-5: 24/19/14/9 — runner passed 12. The fourth 5 may be played by
   any checker (e.g. 24/19 or 9/4).
7. Opening 6-5: runner 24/13 (via 18 or 19). Both dice used; restriction
   still on (13 > 11).
8. Runner on 13, roll 2-1: play 13/11 first, then the 1 with any checker.
   Playing 13/12 first is illegal (12 held), so the play must be 13/11 then
   a 1.
9. Runner on 13, roll 1-1, opponent still on 12: 13/12 illegal → no move,
   pass (other checkers locked by the runner rule).
10. Landing on any point with one opponent checker is illegal.
11. Combined move through an opponent-held point is illegal (e.g. 6-1 from
    20 where 14 and 19 are both opponent-held).
12. A play that ends with own points 19–24 all held is illegal (P1). If it
    is the only way to use both dice, the player must use one die only (or
    a different full play).
13. A play that ends with own points 6–11 all held is illegal (P2).
14. Six consecutive held points elsewhere (e.g. 13–18) are legal, unless P3
    applies.
15. P3: if one full play leaves the opponent no move and another full play
    does not, the player must choose one that does not.
16. P3: if every full play leaves the opponent no move, any of them is legal;
    the opponent then passes.
17. Opponent passes because of their own runner being blocked → this counts
    as "no legal move" for P3.
18. Bearing off follows shared rules; no hitting, so a checker never leaves
    home once inside.
19. Winner bears off all 15 while loser has 0 off → 2 points.

## House-rule variants (flags)

| Flag | Values | Default | Notes |
|---|---|---|---|
| `runnerRule` | bool | `true` | All sources have it. Gioul (Fevga variant) turns it off. |
| `runnerTarget` | `"passMother"` (own ≤11), `"reachQuarter"` (own ≤12) | `"passMother"` (confirmed 2026-10-26 from the ΕΟΠΤ text: «Κάθε παίκτης υποχρεούται να μετακινήσει μόνο ένα πούλι μέχρι αυτό να περάσει τη μάνα του αντιπάλου.») | ΕΟΠΤ, bkgm.com, EN Wikipedia: pass the opponent's start. Greek Wikipedia, Condos, itavli: reach the opponent's starting quarter. They differ only if the opponent's start point is already empty. |
| `p1NoPrimeOwnStart` | bool | `true` | ΕΟΠΤ, bkgm.com, itavli, EN Wikipedia. |
| `p2NoPrimeFrontOfMother` | bool | `true` | ΕΟΠΤ, Greek Wikipedia. Greek Wikipedia says some players allow it. |
| `p2Window` | `"6-11"`, `"7-12"` | `"6-11"` | See interpretation note above. |
| `p3MustLeaveMove` | bool | `true` | All modern sources. |
| `p3Priority` | `"afterDiceRule"`, `"beforeDiceRule"` | `"afterDiceRule"` | |
| `noPrimeOwnHome` | bool | `false` | Greek Wikipedia mentions a ban on holding all six home points at the end of a roll. Not in other sources. |
| `primeCheckTiming` | `"endOfTurn"`, `"afterEachMove"` | `"endOfTurn"` | Sources are silent. |
| `primeRulesOff` | bool | `false` | EN Wikipedia: some Greek regions do not enforce prime rules (Moultezim also has no prime limit). Turns off P1, P2 and P3. |

Related variant (not in scope; listed for future work): **Gioul
(Γκιούλ/Gul bara)** — Fevga without the runner rule and without prime limits;
from a later turn, a rolled double forces the player to also play every
higher double in order up to 6-6 (Greek Wikipedia, Condos).

## Sources

- ΕΟΠΤ Tournament Rules v1.0 (2025), §3.4: https://eopt.gr/wp-content/uploads/2025/08/%CE%BA%CE%B1%CE%BD%CE%BF%CE%BD%CE%B9%CF%83%CE%BC%CE%BF%CF%82.pdf
- bkgm.com, Fevga: https://bkgm.com/variants/Fevga.html
- Wikipedia (EN), Fevga: https://en.wikipedia.org/wiki/Fevga
- Wikipedia (EL), Φεύγα: https://el.wikipedia.org/wiki/Φεύγα
- Vassilis Condos, Tavli: https://bkgm.com/articles/Condos/Tavli/
- itavli.com, Narde/Fevga rules: https://www.itavli.com/rules-of-narde-fevga/
- Zizanio.gr, Φεύγα κανόνες: https://zizanio.gr/tavli-feuga-kanones
- Boardgammon, Τάβλι στην Ελλάδα: https://boardgammon.com/el/backgammon/culture/greece/
