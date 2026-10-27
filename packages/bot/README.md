# @tavli/bot

Bot players for tavli, in pure TypeScript (ADR-0006). The design is in
`docs/architecture/bot-ai.md`.

Rules for this package (see `CLAUDE.md`):

- No React, no network, no vendor code. Lint blocks them.
- No `Math.random`. The bot gets a seeded `Rng` from the caller.
- No clock and no sleeping. The bot is pure and synchronous.
- The bot knows the rules only through the engine's `Variant` interface.

## The interface

```ts
type Difficulty = 'easy' | 'medium' | 'hard'; // from @tavli/contracts
type BotLevel = Difficulty | 'random'; // 'random' is for tests and as a baseline

interface Bot {
  chooseTurn(state: GameState, dice: Dice, level: BotLevel, opts: BotOptions): Turn;
}
interface ConfiguredBot extends Bot {
  supportedLevels(variant: VariantId): readonly Difficulty[]; // for the level picker
}
interface BotOptions {
  rng: Rng; // the bot's own RNG, never the dice RNG
  timeBudgetMs?: number; // for a deeper search later; easy and medium ignore it
}
interface Evaluator {
  id: string; // 'portes-heuristic-v1'
  variant: VariantId;
  evaluate(state: GameState): Evaluation; // from the view of state.toMove, before the roll
  scoreTurns?(state: GameState, turns: readonly Turn[]): readonly TurnScore[]; // optional fast path
}
interface Evaluation {
  win: number; // P(win)
  winDouble: number; // P(win a diplo)
  loseDouble: number; // P(lose a diplo)
  equity: number; // 2·win − 1 + winDouble − loseDouble, from −2 to +2
}
```

- `chooseTurn` returns one full turn for the roll. A pass is a turn with
  empty `moves`. If `state.dice` is set, it must equal `dice`.
- `createBot({ variants?, evaluators?, policies? })` builds a bot. Default:
  the engine's `VARIANT_REGISTRY`, `DEFAULT_EVALUATORS` (the Portes and
  Fevga heuristics for easy and medium) and `DEFAULT_LEVEL_POLICIES`.
- `bot.supportedLevels('portes')` and `bot.supportedLevels('fevga')` are
  `['easy', 'medium']` today. Easy works for every known variant; medium
  and hard need an evaluator. The app's level picker can use it, or probe
  `chooseTurn` and catch `NOT_IMPLEMENTED`: both give the same answer.
- `scoreTurns(variant, evaluator, state, turns)` and `pickTurn` are the
  1-ply core. `Analyzer` (hints, post-game review) is only a type for now.

Errors:

- `BotError('NOT_IMPLEMENTED')`: no evaluator for this level and variant
  (today: hard, and medium for every variant but Portes and Fevga).
- `BotError('INVALID_REQUEST')`: `dice` differs from `state.dice`, or a
  runner request names another variant than its state.
- `BotError('INVALID_REGISTRY')`: an evaluator sits under the wrong variant,
  or a temperature is not a number >= 0.
- Engine errors pass through: `ILLEGAL_TURN` for a finished game,
  `UNKNOWN_VARIANT`, `OUT_OF_RANGE` for a bad seed.

## The levels

Every level but `random` runs the same pipeline (bot-ai.md, section 4.1):

1. The engine lists the legal turns, one per end position.
2. The evaluator scores the end position of each turn from the opponent's
   view (1-ply). A turn that ends the game scores its true points.
3. A turn that wins the game now is **always** taken (the one with the most
   points).
4. Else the level picks with a softmax: chance ∝ `exp((score − best) / T)`,
   with the score in points. This is the noise. A bad turn is rare, a
   nearly-best turn is common, so mistakes look human.

| Level  | Evaluator        | Noise (`T`) | How it plays                                                                                                                           |
| ------ | ---------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| random | none             | uniform     | A uniformly random legal turn (`chooseRandomTurn`). Seeded, so it repeats. For tests and as a baseline. Not in the app.                |
| easy   | Portes heuristic | 0.15        | About half its turns are not the best, but most of those cost little; about 1 in 5 loses more than 0.1 points. Never misses a win now. |
| medium | Portes heuristic | 0.01        | Small noise: it only mixes turns that are almost equal (average loss about 0.001 points per turn).                                     |
| hard   | none yet (#52)   | 0           | Throws `NOT_IMPLEMENTED`.                                                                                                              |

- Change the noise with `createBot({ policies: { medium: { temperature: 0.03 } } })`.
  `0` means "always a best turn" (ties at random).
- Easy for a variant with no evaluator plays a random turn, but still takes
  a turn that wins now.
- Same state, dice, level and seed → the same turn.
- Each variant uses its own heuristic (Portes, Fevga) with the same
  temperatures. The "How it plays" numbers are for Portes; Fevga's are in
  "Fevga strength and speed".

## The Portes heuristic

Code: `src/evaluators/`. It scores a position before the roll, from the view
of the player to roll. It works on its own small board arrays
(`portes-board.ts`), not on `GameState`, and plays each turn on copies of
them (`scoreTurns` fast path). Tests check that the fast path gives the
same scores as `applyTurn` + `evaluate`.

**Contact** (a hit is still possible): a weighted sum of features gives a
score in logits, and `win = sigmoid(score)`. The features, for both sides:

- **Pip difference**: the Kleinman chance of the pip counts (below), as a
  logit, × `race`.
- **Blots and shots**: for each blot of the player who waits, the number of
  rolls out of 36 that hit it (`shots.ts`). It counts direct and indirect
  shots, doors in between, and entering from the bar. A blot costs more when
  it is far from home and when the hitter's home board is strong. The player
  to roll pays a little for each own blot the other side can still reach.
- **Made points** on own points 1–12, by a value table (the 5- and 6-points
  most).
- **Home-board points**, extra per opponent checker on the bar (a closed
  board).
- **Longest prime** with an opponent checker behind it.
- **Anchors** in the opponent's home (the best one, plus a share of others).
- **Checkers on the bar**, worse against a strong home board.
- **Borne off**, **stacking** (each checker past the third on a point) and
  **buried** checkers (past the second on the 1- or 2-point).
- **Diplo estimate**: the share of losses that are diplos grows with the
  pips the loser needs to bring every checker home.

**No contact** (a pure race), `race.ts`:

- The **Keith count** (Tom Keith, bkgm.com, "The Keith count"): pips plus
  wastage (+2 per extra checker on the 1-point, +1 on the 2-point, +1 per
  checker past 3 on the 3-point, +1 per empty 4-, 5- and 6-point). A short
  race also needs at least 3.5 pips per checker left.
- The **Kleinman metric** (Danny Kleinman, bkgm.com): with `D` = lead and
  `S` = sum of the counts, P(win) ≈ Φ((D + 4) / √(2·(S − 4))). The diplo
  chance uses the same normal model for "the loser bears off one checker in
  time".
- At the very end (both sides home with at most 6 checkers left) a
  **one-sided bear-off table** (`bearoff.ts`) gives exact numbers: the
  chance to finish in 1, 2, 3, … rolls, for the fastest bear-off. It is
  filled lazily (924 positions, about 35 ms in Node, once per app run). A
  test checks its moves against the engine's `legalTurns`.

How good the race numbers are (P(win) for White on roll, against 2,000
games played out by the medium bot):

| Race (own points)                                    | Evaluator | Played out |
| ---------------------------------------------------- | --------- | ---------- |
| 3 each on 2–6 vs the same                            | 0.60      | 0.63       |
| 5 each on 4–6 vs 3 each on 2–6                       | 0.29      | 0.25       |
| 3 each on 12, 9, 6, 5, 4 vs 3 each on 11, 8, 6, 5, 4 | 0.46      | 0.49       |
| 6 checkers on 1–3 vs 5 checkers on 1–3               | 0.80      | 0.79       |
| 1 + 2 on 6 vs 2 on 2                                 | 0.17      | 0.17       |

Before the bear-off table, the 6-vs-5 race was 0.52.

### Weights

All weights are in one typed, commented object, `PORTES_DEFAULT_WEIGHTS`
(`src/evaluators/portes-heuristic.ts`). Build a variant with
`createPortesHeuristic({ ...PORTES_DEFAULT_WEIGHTS, blotBase: 0.3 })`.

| Weight             | Default | What it does (score in logits)                                 |
| ------------------ | ------- | -------------------------------------------------------------- |
| `race`             | 0.4     | × logit of the Kleinman chance of the pip counts               |
| `madePoint`        | 1       | × `pointShape[p]` for each made point on own 1–12              |
| `pointShape`       | table   | 0.02 (1-pt) … 0.38 (5-pt), 0.35 (6-pt), 0.3 (bar point) … 0.02 |
| `homePointPerBar`  | 0.12    | per home point, per opponent checker on the bar (at most 3)    |
| `prime`            | 1       | × `primeShape[length]`: 0.1, 0.25, 0.5, 0.9, 1.5 for 2–6       |
| `anchor`           | 0.5     | × `anchorShape` of the best anchor (own 20 best)               |
| `secondAnchor`     | 0.4     | share of each further anchor                                   |
| `barChecker`       | 0.25    | per own checker on the bar                                     |
| `barPerHomePoint`  | 0.1     | extra per bar checker, per opponent home point                 |
| `borneOff`         | 0.04    | per checker off                                                |
| `stack`            | 0.06    | per checker past the third on a point                          |
| `buried`           | 0.05    | per checker past the second on the 1- or 2-point               |
| `blotBase`         | 0.4     | blot cost × shots/36                                           |
| `blotPips`         | 1.2     | blot cost part that grows with the pips lost when hit          |
| `blotPerHomePoint` | 0.12    | blot cost part per hitter home point                           |
| `anyShot`          | 0.2     | × (rolls that hit any blot)/36                                 |
| `rollerBlot`       | 0.06    | per own blot the opponent can still reach                      |
| `double`           | 0.65    | diplo share: × pips the loser needs to come home / (pips + 20) |

### Tuning

```sh
pnpm --filter @tavli/bot tune -- --games 1000 --rounds 1
```

A coordinate search (`src/tune.ts`): each scalar weight is tried at
`× (1 ± step)` in medium-vs-medium matches against the current weights, with
paired games (same dice seeds, colours swapped). A change is kept if it wins
by more than `--min-gain` points per game; then the best weights play a
fresh match against the start. Options: `--games`, `--rounds`, `--step`,
`--min-gain`, `--seed`, `--keys a,b,c`. It is optional and slow; CI does not
run it.

What we ran (Node 22, about 3 minutes in all):

- `--games 1000 --step 0.3 --min-gain 0.04 --seed 7` over all 17 scalar
  weights: every change was within ±0.06 points per game. One change
  (`double` 0.65 → 0.845, +0.041) passed the bar, but the fresh check gave
  +0.001 points per game (1,003 of 2,000 wins): noise.
- `--step 0.6` on the 8 main weights (`race`, `madePoint`, `prime`,
  `anchor`, `blotBase`, `blotPips`, `anyShot`, `barChecker`): nothing passed the bar; most
  big changes lost (`race` × 1.6: −0.061, `madePoint` × 0.4: −0.066).

So the hand-picked defaults sit near a local best, and we kept them.

## Strength and speed

1,000 games per match, seed 1, `pnpm --filter @tavli/bot simulate`
(A plays White; the first player alternates by game):

| Match            | A wins       | A points : B points | Diplo wins (A) |
| ---------------- | ------------ | ------------------- | -------------- |
| medium vs random | 999 (99.9 %) | 1,947 : 1           | 948            |
| medium vs easy   | 781 (78.1 %) | 1,186 : 242         | 405            |
| easy vs random   | 985 (98.5 %) | 1,880 : 17          | 895            |
| medium vs medium | 508 (50.8 %) | 625 : 579           | 117            |

`src/strength.test.ts` plays 300 games per match (fixed seeds, colours
swapped halfway): medium beats random 298/300 (needs 90 %), easy beats
random 297/300 (needs 70 %), medium beats easy 218/300 (needs 70 %).

Decision time of the medium bot (Node 22, dev container, after warm-up):

| Positions                                   | Median  | p90     | p99     | Max    |
| ------------------------------------------- | ------- | ------- | ------- | ------ |
| 300 random positions (the perf test set)    | 0.09 ms | 0.51 ms | 3.2 ms  | 3.9 ms |
| 5,000 positions from medium-vs-medium games | 0.03 ms | 0.12 ms | 0.45 ms | 7.9 ms |

`src/perf.test.ts` checks median < 20 ms and worst < 200 ms over the 300
random positions. Both bounds are far above the real numbers, so the test
is safe on a slow or busy CI machine. Hermes on a phone is many times
slower than Node, and the budget there is 200 ms.

## The Fevga heuristic

Code: `src/evaluators/fevga-heuristic.ts` and `fevga-board.ts`. Rules:
`docs/rules/fevga.md`. Fevga has no hitting: one checker holds a point, and
nobody may land on it. So the game is a race in which each side slows the
other down with blocks. The evaluator scores a position before the roll,
from the view of the player to roll, in the same way as Portes: a weighted
sum of features in logits, `win = sigmoid(score)`.

It works on its own side arrays (same layout as `portes-board.ts`, but with
parallel numbering: own point `p` of one side is `p > 12 ? p − 12 : p + 12`
of the other). The `scoreTurns` fast path plays each turn on a copy; a test
checks it gives the same scores as `applyTurn` + `evaluate`.

**Contact** (some checker still has an opponent checker in front of it).
The features, for both sides (`sideFeatures`, names in `FEVGA_FEATURES`):

- **Race**: the Kleinman chance of the pip counts, as a logit, × `race`.
- **Prime**: the best run of opponent points in front of the side's
  checkers, by a shape table, plus a share for each checker trapped behind
  it.
- **Points ahead**: opponent points in front of the side's last checker.
- **Blocked landings**: for each own point with checkers, the dice (1–6)
  whose landing point the opponent holds, × min(checkers, 3).
- **Stuck dice**: die values with no legal single move now (lost dice).
- **Runner**: until the runner passes its target (own point 11 by default,
  from the rules), only the runner may move. A cost, more when the runner
  is far from the target.
- **Home points** (own 1–6), **mother** (checkers still on own 24, which
  hold the opponent's point 12), **stacking** (each checker past the third
  on a point) and **borne off**.
- **Diplo estimate**: as in Portes, the share of losses that are diplos
  grows with the pips the loser needs to bear off one checker.

**No contact** (a pure race): the Portes race code (`race.ts`, Keith count
and Kleinman) and, at the very end, the exact bear-off table (`bearoff.ts`).
The bear-off rules are the shared ones, so both work for Fevga as is.

### Fevga weights

All weights are in `FEVGA_DEFAULT_WEIGHTS`. Build a variant with
`createFevgaHeuristic({ ...FEVGA_DEFAULT_WEIGHTS, pointAhead: 0.3 })`.

| Weight           | Default | What it does (score in logits)                               |
| ---------------- | ------- | ------------------------------------------------------------ |
| `race`           | 0.3     | × logit of the Kleinman chance of the pip counts             |
| `prime`          | 1       | × `primeShape[length]` of the best prime in front            |
| `primeShape`     | table   | 0.05, 0.15, 0.35, 0.7, 1.2 for 2–6                           |
| `trapped`        | 1       | × `primeShape[length]` × checkers behind the prime / 15      |
| `pointAhead`     | 0.2     | per opponent point in front of the side's last checker       |
| `blockedLanding` | 0.05    | per blocked (point, die) × min(checkers, 3) / 6              |
| `stuckDie`       | 0.15    | per die value with no legal move                             |
| `runnerLock`     | 0.3     | while the runner is not through                              |
| `runnerDistance` | 0.3     | × (runner point − target) / (24 − target), while not through |
| `homePoint`      | 0.05    | per held own home point (1–6)                                |
| `startChecker`   | 0.1     | per checker still on own 24 (the mother)                     |
| `stack`          | 0.04    | per checker past the third on a point                        |
| `borneOff`       | 0.02    | per checker off                                              |
| `double`         | 0.4     | diplo share: × pips the loser needs to save it / (pips + 20) |

How we set them: hand-picked, then a coordinate search like `src/tune.ts`
(which is Portes-only), with paired medium-vs-medium Fevga games (same dice
seeds, colours swapped):

- `race` 0.8 → 0.3 won +0.23 points per game (349 of 600). Every play of a
  roll moves the same pips, so a big race weight only drowns the block
  features. 0.15 and 0 were no better than 0.3.
- `pointAhead` (new, 0 → 0.2) won +0.11 points per game (440 of 800);
  0.4 and 0.7 were worse. `startChecker` 0.1 beats 0 by +0.04 points per
  game (2,000 games).
- Two more features (all held points; checkers in home) only lost and were
  dropped.
- A last round over all weights (`× 1.5` and `× 0.5`, 1,000 games each)
  changed nothing: every change was within ±0.06 points per game.

A check against the results of 400 medium-vs-medium games (during
tuning) shows the score is too confident: the best fit is
`win = sigmoid(k · score)` with `k` about 0.35 overall and 0.2 before
turn 70. This does not change medium's choices (only the order of the
scores counts), but the win numbers are rough, and easy's noise acts on
these inflated scores.

### Fevga strength and speed

1,000 games per match, seed 1,
`pnpm --filter @tavli/bot simulate -- --variant fevga` (A plays White):

| Match            | A wins       | A points : B points | Diplo wins (A) |
| ---------------- | ------------ | ------------------- | -------------- |
| medium vs random | 944 (94.4 %) | 1,319 : 57          | 375            |
| medium vs easy   | 814 (81.4 %) | 1,044 : 197         | 230            |
| easy vs random   | 740 (74.0 %) | 928 : 276           | 188            |
| medium vs medium | 494 (49.4 %) | 553 : 556           | 59             |
| random vs random | 485 (48.5 %) | 564 : 604           | 79             |

Fevga has more luck than Portes: a bot that only knows the pip count beats
random play only 56 % of the time (400 games), because every play moves the
same pips. Blocks are the skill. Per turn (7,900 turns from medium games),
easy plays a turn that is not the best 71 % of the time and loses 0.075
points on average (27 % of turns lose more than 0.1); medium loses 0.002.

`src/fevga-strength.test.ts` plays 200 games per match (fixed seeds,
colours swapped halfway; raise `GAMES` for a local check). It asks for
medium ≥ 85 % against random (gets 189/200), easy ≥ 60 % against random
(153/200), and medium ≥ 70 % against easy (170/200). The three matches take
about 6 s in all.

Decision time of the medium bot (Node 22, dev container, best of 3 runs,
after warm-up):

| Positions                                   | Median  | p90     | p99     | Max     |
| ------------------------------------------- | ------- | ------- | ------- | ------- |
| 300 random positions (the perf test set)    | 0.03 ms | 0.15 ms | 0.42 ms | 1.19 ms |
| 5,000 positions from medium-vs-medium games | 0.03 ms | 0.14 ms | 0.66 ms | 1.73 ms |

`src/fevga-perf.test.ts` checks median < 20 ms and worst < 200 ms.

## The runner (for the app)

The app never calls the bot directly. It uses the `BotRunner` port from
`@tavli/contracts`:

```ts
const runner: BotRunner = new InlineBotRunner(); // or new InlineBotRunner(createBot({ evaluators }))
const turn = await runner.chooseMove({ variant: 'portes', state, dice, difficulty: 'easy', seed });
runner.cancel(); // the user left: pending requests reject with BotCancelledError
```

- A request is plain JSON. It carries a `seed`, not an RNG, so a worklet or
  a server runner can take the same request later.
- `InlineBotRunner` runs the bot on the same thread, in a microtask. A
  `cancel()` right after `chooseMove` stops the bot before it runs.
- Use a new seed for each request. Never reuse the dice seed.

## Think time

The bot does not wait. The app waits before it shows the move:

```ts
const ms = thinkingDelayMs('medium', uiRng); // 600–1200 ms
const forced = thinkingDelayMs('medium', uiRng, { forced: true }); // 250–400 ms
```

| Level  | Range       |
| ------ | ----------- |
| easy   | 500–1000 ms |
| medium | 600–1200 ms |
| hard   | 700–1500 ms |
| forced | 250–400 ms  |

Use `forced` when there is only one legal turn (or a pass). Start the runner
at the same time as the wait, so the user does not see the real cost.

## How to add a level (or a variant)

1. Write an `Evaluator` for the variant, for example
   `src/evaluators/plakoto-heuristic.ts`. It scores a position from the view
   of `state.toMove`. Keep it pure and fast. Add a `scoreTurns` fast path if
   `applyTurn` + `evaluate` is too slow.
2. Register it by variant id and level:

   ```ts
   const evaluators: EvaluatorRegistry = new Map([
     ['portes', { easy: portesHeuristic, medium: portesHeuristic }],
     ['plakoto', { easy: plakotoHeuristic, medium: plakotoHeuristic }],
   ]);
   const bot = createBot({ evaluators });
   ```

3. The noise is a per-level temperature (`policies`). If a level needs more
   than 1-ply (2-ply for hard), add it in `chooseTurn` in
   `src/create-bot.ts`. Keep the RNG as the only source of chance.
4. Add tests: always legal, same seed gives the same turn, and a simulation
   against the level below it (`simulate`).

## Simulator

```sh
pnpm --filter @tavli/bot simulate -- --games 1000 --a easy --b easy
```

Options: `--games N`, `--a LEVEL` (White), `--b LEVEL` (Black), where
`LEVEL` is `random`, `easy`, `medium` or `hard`, `--seed N`,
`--variant ID`, `--help`. It prints wins, mono and diplo counts, average
turns, illegal turns and the time. The exit code is 1 if any game failed.

- The script runs the TypeScript source with plain Node (22.18 or newer
  strips the types). `scripts/register-ts.mjs` adds the missing `.ts`
  extension to our imports. There is no build step and no extra dependency.
- In code: `simulate({ variant, bots: [a, b], games, seed })`. Player A
  plays White, B plays Black, and the first player alternates by game. The
  dice RNG and each bot RNG are separate streams from each game's seed. Each
  chosen turn is checked by `variant.applyTurn`. A failure carries its
  `gameSeed`, so `playGame` can replay it.

Numbers (Node 22, dev container, seed 1): 1,000 random-vs-random Portes
games take about 2 s; 1,000 medium-vs-easy games about 4–5 s. See
"Strength and speed" for the match results.

## Tests

`pnpm test` from the repo root, or `pnpm --filter @tavli/bot test` (about
10 s on 4 cores; the files run in parallel).

- `create-bot.test.ts`: every level plays legal turns and repeats itself for
  a seed; passes; a win now is never missed (easy, medium, the fallback,
  even with a huge temperature and an evaluator that wants to lose);
  sound opening moves; the fast path equals the engine path;
  `supportedLevels`.
- `evaluators/portes-heuristic.test.ts`: more exposed blots score lower, a
  closed board beats an open one, longer primes and anchors score higher,
  the race evaluation grows with the pip lead; the shot table; Keith and
  Kleinman.
- `evaluators/bearoff.test.ts`: known bear-off values, moves equal the
  engine's, and the evaluator agrees with played-out races.
- `evaluators/fevga-heuristic.test.ts`: the parallel numbering, contact
  and the runner rule agree with the engine; colours are mirrors; the fast
  path equals the engine path; primes, a runner that is through, lost dice
  and a race lead score as they should.
- `fevga-bot.test.ts`: `supportedLevels('fevga')`, every turn comes from
  `legalTurns` and repeats for a seed, a win now is never missed, and
  medium loses much less per turn than easy. `fevga-strength.test.ts`
  (200 games per match) and `fevga-perf.test.ts`.
- `strength.test.ts` (300 games per match), `perf.test.ts`,
  `simulate.test.ts` (1,000 random-vs-random games), `tune.test.ts` (a tiny
  search), and the runner and the command line.
