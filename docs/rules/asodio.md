# Asodio (Ασόδυο / Ασσόδυο)

Shared rules (dice, forced moves, bearing off, match) are in
`tavli-match.md`. This file lists only the Asodio rules.

> **Status: low-confidence spec.** Asodio is rare. It is not part of the
> Tavli rotation and has no federation rules. Sources disagree a lot. The
> default below is a product decision, not a single authoritative ruleset.
> All disputed points are flags.

## Summary

Asodio is the Greek name of **Acey-Deucey**. "Άσσος-δύο" = the roll 1-2.
All checkers start off the board and are entered into the opponent's home,
then race around like Portes, with hitting. Rolling 1-2 is the best roll:
the player plays 1 and 2, then chooses any double to play, then rolls again.

## What the sources say

| Topic | Greek folk version (EL Wikipedia, cna.gr, cardgamesgr) | Acey-Deucey (bkgm.com American; itavli.com) | "Ace-Deo" (bkgm.com Greek page, from Frantzis 1979) |
|---|---|---|---|
| Start | Off the board | Off the board | All 15 on opponent's 1-point |
| Entering | First entry needs 1-2 or a double (cardgamesgr: doubles only) | Any die enters | — |
| 1-2 roll | Play 1 and 2, then any double, then roll again | Same | Play 1 and 2, then any double; **no** extra roll |
| Other doubles | Extra roll after a double | No extra roll | No extra roll |
| Hit checker | Re-enters only with 1-2 or a double | Re-enters with any die | Re-enters with any die |
| Extra rules | Must gather all 15 in a quarter before advancing (unclear); exact-number bear-off | — | May "nominate" own blot that the opponent must hit |
| Scoring | 1 / 2 (mars), match to 7 (cardgamesgr) | 1 per opponent checker not borne off | 1 point, no gammons |

## Board & notation

- Own-perspective points 1–24 (see `tavli-match.md`). Contrary movement:
  White `p` = Black `25 - p`.
- Location 25 = "outside" (not yet entered, or hit). Off = 0.
- Door = 2+ checkers. Blot = 1 checker.

## Starting position

Default: each player has 15 checkers outside the board (location 25). The
board is empty.

```
  13 14 15 16 17 18 | 19 20 21 22 23 24
  ------------------+------------------
   .  .  .  .  .  . |  .  .  .  .  .  .
                    |
   .  .  .  .  .  . |  .  .  .  .  .  .
  ------------------+------------------
  12 11 10  9  8  7 |  6  5  4  3  2  1
  White: 15 outside (enter on W19-24). Black: 15 outside (enter on W1-6).
```

Flag `startPosition="opponentAcePoint"`: 15 checkers on own point 24 for
each player (Frantzis / bkgm "Ace-Deo"), same as the Plakoto setup.

## Direction of movement

Contrary, like Portes. Each player enters into own points 19–24 and moves
toward own point 1.

## Turn & dice rules

1. Opening roll and starter: as `tavli-match.md`.
2. Normal roll: two moves, doubles four moves. Must use as much of the roll
   as possible; higher die rule.
3. **1-2 roll (ασόδυο), default:**
   1. Play the 1 and the 2 (any order, any checkers).
   2. Then choose any double (1-1 … 6-6) and play it (four moves).
   3. Then roll again and take a new full turn.
   4. Another 1-2 repeats this.
   5. If the 1 or the 2 cannot be played, the turn ends at once: no chosen
      double, no extra roll.
   6. The player may choose a double that can be played only partly; the
      unplayable moves are lost, and there is no extra roll.
   7. When choosing a double, the player should choose the one they will
      play; the engine offers all six as options. The "must use max dice"
      rule applies inside the chosen double.
4. **Other doubles:** default (Greek folk sources) = after playing a double
   fully, roll again (`doublesGiveExtraRoll=true`). If not all four moves can
   be played, no extra roll.
5. A single turn can contain many rolls. The engine should model one turn as
   a chain of "sub-rolls".

## Movement rules

1. **Entering:** a die `d` enters one outside checker on own point `25 - d`
   (opponent's home), if that point is not an opponent door. Entering on an
   opponent blot hits it.
2. Default entry gate (`firstEntryGate=true`): until a player has entered
   their first checker, only a 1-2 or a double lets them enter. Other rolls
   are lost (no move is possible). After the first entry, any die enters.
3. While a player still has unentered checkers (from the start), they may
   either enter or move checkers already on the board (American rule;
   default `mustEnterAllFirst=false`).
4. **Hit checkers** must be re-entered before any other move, like the bar in
   Portes. Unentered starting checkers do **not** have this priority.
   Engine: track `outsideStart` and `bar` counts separately.
5. Moving, landing, doors, combined moves: same as Portes.

## Hitting / pinning / blocking rules

- Same as Portes: landing on a blot hits it; the hit checker goes outside
  (bar) and must re-enter.
- Default: a hit checker re-enters with any die (`barEntryNeedsSpecial=false`).
  Greek folk sources say it needs a 1-2 or a double; flag.
- Blocks/doors as in Portes. Six doors in a row are legal.

## Bearing off

- Shared rules (`tavli-match.md`), plus: no checkers outside (unentered or
  hit) and all 15 in home.
- Flag `exactBearOff` (Greek folk & European Acey-Deucey): a die bears off
  only from the exact point; no "highest point" rule.

## Winning & scoring

Default (tavli convention, cardgamesgr):

| Result | Condition | Points |
|---|---|---|
| Single | Loser has borne off ≥1 | 1 |
| Double / mars | Loser has borne off 0 | 2 |

Flag `scoring`: `"tavli"` (default), `"perChecker"` (loser pays 1 per
checker not borne off — American), `"singleOnly"` (always 1 — Frantzis).

Asodio is not in the standard Tavli rotation. Offer it as a standalone game
or as an optional extra in a custom rotation.

## Edge cases

1. Start: 30 checkers outside, board empty.
2. `firstEntryGate`: first roll 6-4 → no move.
3. `firstEntryGate`: first roll 3-3 → enter four checkers on own 22 (or enter
   and move), then (default) roll again.
4. First roll 1-2 → enter on 24 and 23 (or enter and move), choose a double,
   play it, roll again.
5. After one checker is on board, a 6-4 may enter checkers on 19 and 21.
6. 1-2 where the 1 is blocked and the 2 is playable → play the 2; turn ends;
   no chosen double; no extra roll.
7. 1-2 → chosen double 6-6, only two sixes playable → play two; turn ends; no
   extra roll.
8. 1-2 → chosen double fully played → roll again; new 1-2 → repeat.
9. Hit checker on bar → must be entered before other moves; unentered start
   checkers do not block other moves.
10. Entry point is an opponent door → that die cannot enter.
11. Bearing off is illegal while any checker is outside (unentered or hit).
12. `doublesGiveExtraRoll=false`: a normal double ends the turn.
13. `scoring="perChecker"`: loser with 5 checkers left (on board or outside)
    loses 5 points.

## House-rule variants (flags)

| Flag | Values | Default | Notes |
|---|---|---|---|
| `startPosition` | `"offBoard"`, `"opponentAcePoint"` | `"offBoard"` | |
| `firstEntryGate` | bool | `true` | Greek folk sources. |
| `firstEntryGateRolls` | `"aceDeuceOrDouble"`, `"doubleOnly"` | `"aceDeuceOrDouble"` | cardgamesgr uses doubles only. |
| `mustEnterAllFirst` | bool | `false` | cardgamesgr: no moves until all 15 are entered. |
| `aceDeuceExtraRoll` | bool | `true` | Frantzis/bkgm "Ace-Deo": `false`. |
| `doublesGiveExtraRoll` | bool | `true` | Greek folk sources; American: `false`. |
| `complementaryDoubles` | bool | `false` | European Acey-Deucey: after a double, also play its complement (sum 7, e.g. 6-6 → 1-1), then roll again. |
| `barEntryNeedsSpecial` | bool | `false` | Greek folk sources: `true`. |
| `nominateBlot` | bool | `false` | Frantzis: at end of turn you may name an own blot; opponent must hit it if possible. |
| `quarterGathering` | bool | `false` | Greek Wikipedia/cna.gr: all 15 must gather in one quarter before any checker advances to the next. Rule is unclear; off by default. |
| `exactBearOff` | bool | `false` | |
| `scoring` | `"tavli"`, `"perChecker"`, `"singleOnly"` | `"tavli"` | |

## Sources

- Wikipedia (EL), Ασσόδυο: https://el.wikipedia.org/wiki/%CE%91%CF%83%CF%83%CF%8C%CE%B4%CF%85%CE%BF
- cna.gr, Το παιχνίδι «ασσόδυο»: https://www.cna.gr/authors/editorial/to-paichnidi-assodyo-gia-paiktes-me-ypsilo-iq/
- cardgamesgr blog, Ασσόδυο: https://cardgamesgr.blogspot.com/2014/07/assodio.html
- bkgm.com, Greek Acey-Deucey (Ace-Deo): https://bkgm.com/variants/AceyDeucey-Greek.html
- bkgm.com, American Acey-Deucey: https://bkgm.com/variants/AceyDeucey-American.html
- bkgm.com, Variants FAQ: https://bkgm.com/faq/Variants.html
- itavli.com, Acey-Deucey rules: https://www.itavli.com/rules-of-acey-deucey/
- Wikipedia (EL), Τάβλι (lists Asodio as a minor game): https://el.wikipedia.org/wiki/Τάβλι
