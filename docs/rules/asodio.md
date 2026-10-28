# Asodio (Ασόδυο / Ασσόδυο)

Shared rules (dice, forced moves, bearing off, match) are in
`tavli-match.md`. This file lists only the Asodio rules.

> **Status: owner version is the default (2026-10-26).** The owner plays the
> Greek folk version with **pinning instead of hitting**. Source: the owner's
> cheat sheet (see "Owner version" below). Other versions stay as presets.
> Owner answered A1–A5 on 2026-10-26. A2 is marked for playtest review.

## Owner version (default preset: `kafeneio`)

Core idea: all 15 checkers move as **one army, quarter by quarter**, and you
**pin** (trap) the opponent's lone checkers instead of hitting them.

### Phase 1 — Entering (the loading lock)

1. All 15 checkers start **off the board**.
2. The board is **locked** for a player until they roll a **1-2 (ασόδυο)** or
   any **double**. Before that, other rolls do nothing; the turn passes.
3. **1-2:** enter one checker on spot 1 and one on spot 2 of the starting
   quarter (spot `d` = own point `25 - d`).
4. **Double `d-d`:** enter **four** checkers on spot `d` (owner, A1).
5. After the lock breaks, each die `d` enters one checker on spot `d`.
6. No checker may leave the starting quarter until **all 15** have entered.
7. **While loading, entered checkers do not move** (owner, A2, "I believe").
   Every die is used to enter. Flag `moveWhileLoading`, default `false`.

### Phase 2 — Quarter by quarter (the lock-in rule)

1. When all 15 checkers are in the starting quarter, the army may advance.
2. A checker that enters a **new quarter is frozen there**. It may not leave
   that quarter until all 15 own checkers are in the same quarter.
3. A checker that reached the new quarter is **frozen in place** (literal
   reading of the owner's sheet, matches A2). Flag `moveInsideFrozenQuarter`,
   default `false`. Confirm in playtests.
4. If one checker lags behind, the whole front is frozen.

### Phase 3 — Pinning (Plakoto style)

1. No hitting. Checkers never go to a bar.
2. Landing on a lone opponent checker **pins** it. The pinned checker cannot
   move. Only the pinner's checkers may land on that point.
3. Because of the lock-in rule, pinning a lagging checker freezes the
   opponent's whole army.
4. When the pinner leaves, the pinned checker is free again (as in Plakoto).
5. Landing on 2+ opponent checkers is not allowed.

### Bearing off and winning

- Bear off as in Portes once all 15 are in the home quarter (owner, A4).
- Score 1 point, or 2 (mars) if the loser has borne off none (owner, A4).

### Owner answers (2026-10-26)

| # | Question | Answer |
|---|----------|--------|
| A1 | How many checkers does a double enter? | Four on that spot |
| A2 | Can checkers move while waiting? | Not while loading (owner "not 100% sure"). After loading, frozen checkers stay in place (flag). |
| A3 | Extra roll or free double after 1-2 or a double? | No |
| A4 | Bearing off and scoring as in Portes? | Yes |
| A5 | Deadlock (no one can ever move)? | Draw, 0 points |
| A6 | Pinned lagging checker freezes its owner's army? | Yes; that player passes until freed (default, not asked) |

## Summary (research on other versions)

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
A resign scores the same way as the position (`tavli-match.md`,
"Resigning"): with `"perChecker"` the opponent gets 1 point per checker the
resigning player has not borne off, on the board or outside.

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
| `mustEnterAllFirst` | bool | `true` (owner) | cardgamesgr: no moves until all 15 are entered. |
| `aceDeuceExtraRoll` | bool | `false` (owner, A3) | Frantzis/bkgm "Ace-Deo": `false`. |
| `doublesGiveExtraRoll` | bool | `false` (owner, A3) | Greek folk sources; American: `false`. |
| `complementaryDoubles` | bool | `false` | European Acey-Deucey: after a double, also play its complement (sum 7, e.g. 6-6 → 1-1), then roll again. |
| `barEntryNeedsSpecial` | bool | `false` | Greek folk sources: `true`. |
| `captureMode` | `"hit"`, `"pin"` | `"pin"` (owner) | Owner version pins like Plakoto. Acey-Deucey hits. |
| `quarterLock` | bool | `true` (owner) | A checker that enters a new quarter is frozen until all 15 are in that quarter. |
| `moveWhileLoading` | bool | `false` (owner, A2) | Entered checkers may not move until all 15 are in. |
| `moveInsideFrozenQuarter` | bool | `false` | Frozen checkers may not move inside their quarter. |
| `deadlock` | `"draw"` | `"draw"` (owner, A5) | No one can ever move: draw, 0 points. |
| `nominateBlot` | bool | `false` | Frantzis: at end of turn you may name an own blot; opponent must hit it if possible. |
| `quarterGathering` | bool | `true` (owner) | Greek Wikipedia/cna.gr and the owner: all 15 gather in one quarter before advancing. See `quarterLock`. |
| `exactBearOff` | bool | `false` | |
| `scoring` | `"tavli"`, `"perChecker"`, `"singleOnly"` | `"tavli"` | |

### Presets

| Preset | Flags |
|---|---|
| `kafeneio` (default, owner) | `startPosition=offBoard`, `firstEntryGate=true`, `mustEnterAllFirst=true`, `quarterGathering=true`, `quarterLock=true`, `captureMode=pin`, no extra rolls |
| `aceyDeuceyGreek` | `captureMode=hit`, `aceDeuceExtraRoll=true`, `doublesGiveExtraRoll=true`, `barEntryNeedsSpecial=true` |
| `aceyDeuceyAmerican` | `captureMode=hit`, `firstEntryGate=false`, `scoring=perChecker` |

The app offers all three on New game → House rules → Rules version (#241): **Standard** (`kafeneio`), **Greek** and **American**. A Tavli match has no Asodio, so it never uses them.

Owner edge cases (add tests for each):

14. `kafeneio`: first roll 5-3 → board locked, no move, turn passes.
15. `kafeneio`: first roll 1-2 → one checker on spot 1, one on spot 2.
16. `kafeneio`: 14 checkers in the starting quarter, 1 outside → no checker
    may leave the starting quarter.
17. `kafeneio`: a checker enters quarter 2 → it may not move to quarter 3
    until all 15 are in quarter 2.
18. `kafeneio`: landing on a lone opponent checker pins it; the pinned
    checker has no legal moves.
19. `kafeneio`: the opponent's last checker in a quarter is pinned → none of
    the opponent's checkers may leave that quarter.

## Sources

- Owner's cheat sheet "Greek Tavli Cheat Sheet: Asodio Variant" (shared 2026-10-26)

- Wikipedia (EL), Ασσόδυο: https://el.wikipedia.org/wiki/%CE%91%CF%83%CF%83%CF%8C%CE%B4%CF%85%CE%BF
- cna.gr, Το παιχνίδι «ασσόδυο»: https://www.cna.gr/authors/editorial/to-paichnidi-assodyo-gia-paiktes-me-ypsilo-iq/
- cardgamesgr blog, Ασσόδυο: https://cardgamesgr.blogspot.com/2014/07/assodio.html
- bkgm.com, Greek Acey-Deucey (Ace-Deo): https://bkgm.com/variants/AceyDeucey-Greek.html
- bkgm.com, American Acey-Deucey: https://bkgm.com/variants/AceyDeucey-American.html
- bkgm.com, Variants FAQ: https://bkgm.com/faq/Variants.html
- itavli.com, Acey-Deucey rules: https://www.itavli.com/rules-of-acey-deucey/
- Wikipedia (EL), Τάβλι (lists Asodio as a minor game): https://el.wikipedia.org/wiki/Τάβλι
