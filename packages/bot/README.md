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
  chooseAnswer?(state: GameState, level: BotLevel, opts: BotOptions): string; // Variant.prompt
}
interface ConfiguredBot extends Bot {
  supportedLevels(variant: VariantId): readonly Difficulty[]; // for the level picker
  chooseAnswer(state: GameState, level: BotLevel, opts: BotOptions): string;
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
- `chooseAnswer` answers the question a state waits for (`Variant.prompt`,
  phase `awaiting-answer` in the turn flow): today only Plakoto "resign or
  play on" after a mother is pinned (`motherRule: "offerConcede"`). It
  returns one of `prompt.choices` (`'resign'` or `'playOn'`) for
  `prompt.player`; pass it to the flow as the `answer` action. See "The
  mother question" below.
- `createBot({ variants?, evaluators?, policies? })` builds a bot. Default:
  the engine's `VARIANT_REGISTRY`, `DEFAULT_EVALUATORS` (the Portes and
  Plakoto heuristics for easy and medium) and `DEFAULT_LEVEL_POLICIES`.
- `bot.supportedLevels('portes')` and `bot.supportedLevels('plakoto')` are
  `['easy', 'medium']` today. Easy works
  for every known variant; medium and hard need an evaluator. The app's
  level picker can use it, or probe `chooseTurn` and catch
  `NOT_IMPLEMENTED`: both give the same answer.
- `scoreTurns(variant, evaluator, state, turns)` and `pickTurn` are the
  1-ply core. `Analyzer` (hints, post-game review) is only a type for now.

Errors:

- `BotError('NOT_IMPLEMENTED')`: no evaluator for this level and variant
  (today: hard, and medium for every variant but Portes and Plakoto).
- `BotError('INVALID_REQUEST')`: `dice` differs from `state.dice`, a
  runner request names another variant than its state, or `chooseAnswer`
  gets a state with no question.
- `BotError('INVALID_REGISTRY')`: an evaluator sits under the wrong variant,
  or a temperature is not a number >= 0.
- Engine errors pass through: `ILLEGAL_TURN` for a finished game (or a
  Plakoto state that waits for its answer), `UNKNOWN_VARIANT`,
  `OUT_OF_RANGE` for a bad seed.

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

| Level  | Evaluator         | Noise (`T`) | How it plays                                                                                                                           |
| ------ | ----------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| random | none              | uniform     | A uniformly random legal turn (`chooseRandomTurn`). Seeded, so it repeats. For tests and as a baseline. Not in the app.                |
| easy   | variant heuristic | 0.15        | About half its turns are not the best, but most of those cost little; about 1 in 5 loses more than 0.1 points. Never misses a win now. |
| medium | variant heuristic | 0.01        | Small noise: it only mixes turns that are almost equal (average loss about 0.001 points per turn).                                     |
| hard   | none yet (#52)    | 0           | Throws `NOT_IMPLEMENTED`.                                                                                                              |

- Change the noise with `createBot({ policies: { medium: { temperature: 0.03 } } })`.
  `0` means "always a best turn" (ties at random).
- Easy for a variant with no evaluator plays a random turn, but still takes
  a turn that wins now.
- Same state, dice, level and seed → the same turn.

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

## The Plakoto heuristic

Code: `src/evaluators/plakoto-*.ts`. Rules: `docs/rules/plakoto.md`. It
works like the Portes heuristic: it scores a position before the roll,
from the view of the player to roll, on its own small board arrays
(`plakoto-board.ts`: counts plus a "pinned" flag per point, in each
player's own numbering). The `scoreTurns` fast path plays each turn on
copies of them and knows when a turn ends the game, for every mother rule
(`plakotoTurnResult`). A test checks it against `applyTurn` + `result` +
`evaluate` for all four mother rules and both check timings.

**Contact** (a pin is possible, or a checker is pinned): a weighted sum of
features in logits, `win = sigmoid(score)`. For both sides:

- **Pins made and suffered**: each pinned opponent checker is worth
  `pinBase + pinPips × (its own point) / 24`, plus `pinHome` when our pinner
  sits in our home (it can stay there a long time). Suffered pins count the
  same, the other way.
- **Mother pinned** (`motherPinned`, the biggest weight). Most losses of
  the pinned side are then doubles (`motherDouble`).
- **Mother safety** (own checkers on the start point): a lone mother is a
  target. The player to roll gains `motherShot × shots / 36` for the other
  side's lone mother, and pays `rollerMother` for its own lone mother when an
  opponent checker is 1–12 pips behind it. Two or more checkers on the start
  are a door, so they are safe.
- **Lone checkers that can be pinned**, with their shot counts
  (`plakoto-shots.ts`: direct and combined shots; doors and pin points in
  between block; a pinned checker cannot shoot; pinners and pinned
  checkers cannot be pinned). Each costs `shots / 36 × blotShare × (value of
that pin)`, plus `anyShot` for the chance of any pin. The roller pays
  `rollerBlot` for each own lone checker in reach.
- **Race / pips**: the Kleinman chance of the pip counts, as a logit,
  × `race`.
- **Home board**: made points by a value table (`pointShape`, the home
  points most), and extra per home door while free opponent checkers still
  have to get out of our home (`homePointPerBack`).
- **Longest prime** of doors (2+ checkers or our pin) with a free opponent
  checker behind it.
- **Borne off** and **stacking**.

**No contact**: the Portes race code (Keith, Kleinman, the bear-off table).
Plakoto bears off by the shared rules, so the numbers are the same.

### The mother question

With `motherRule: "offerConcede"` (the app default), the pinned player is
asked "resign or play on" (`awaiting-answer`). `chooseAnswer` scores both
choices: `resign` = −2 points (the game ends), `playOn` = the evaluation
of the position. Then the level's softmax picks, like a turn.

- Playing on can never lose more than the 2 points of resigning, so the
  true best answer is always "play on". The evaluation of a pinned mother
  is close to −2 (it keeps the small draw chance: pin the other mother too).
- **Medium** (T = 0.01) plays on in practice. **Easy** (T = 0.15)
  sometimes resigns a near-lost game, like a tired human (about 40 % of its
  mother questions). That costs little: about 0.16 points each time.
- **Random** answers at random.

How good the number is (1,000 medium-vs-medium games, seed 99; the pinned
side always played on): 190 games had a pinned mother. The pinned side
scored −1.84 points per game (175 double losses, 15 draws, no wins); the
evaluator said −1.78 on average.

### Plakoto weights

All weights are in `PLAKOTO_DEFAULT_WEIGHTS`
(`src/evaluators/plakoto-heuristic.ts`). Build a variant with
`createPlakotoHeuristic({ ...PLAKOTO_DEFAULT_WEIGHTS, pinBase: 0.3 })`.

| Weight             | Default | What it does (score in logits)                                         |
| ------------------ | ------- | ---------------------------------------------------------------------- |
| `race`             | 0.2     | × logit of the Kleinman chance of the pip counts                       |
| `madePoint`        | 0.5     | × `pointShape[p]` for each made point on own 1–23                      |
| `pointShape`       | table   | 0.12 (1-pt) … 0.32 (5-pt), 0.3 (6-pt), 0.25 (7-pt) … 0.06–0.08 (13–23) |
| `homePointPerBack` | 0.06    | per home door, per free opponent checker still in our home (max 3)     |
| `prime`            | 1       | × `primeShape[length]`: 0.1, 0.25, 0.5, 0.9, 1.5 for 2–6               |
| `pinBase`          | 0.2     | per opponent checker we pin                                            |
| `pinPips`          | 0.56    | × (pinned checker's own point) / 24                                    |
| `pinHome`          | 0.2     | extra when our pinner is in our home                                   |
| `motherPinned`     | 4.5     | we pin the opponent's mother                                           |
| `motherDouble`     | 0.95    | share of the pinned side's losses that are doubles                     |
| `blotShare`        | 0.6     | × shots/36 × value of the pin, per waiter lone checker                 |
| `motherShot`       | 3       | × shots/36 at the waiter's lone mother                                 |
| `anyShot`          | 0.26    | × (rolls that pin any checker)/36                                      |
| `rollerBlot`       | 0.08    | per own lone checker with an opponent 1–12 pips behind                 |
| `rollerMother`     | 0.5     | own lone mother with an opponent 1–12 pips behind                      |
| `borneOff`         | 0.04    | per checker off                                                        |
| `stack`            | 0.05    | per checker past the third on a point (not the start)                  |
| `double`           | 0.975   | double share: × pips the loser needs to come home / (pips + 20)        |

Tuning: two rounds of the same coordinate search as for Portes (a scratch
copy of `src/tune.ts` for Plakoto; medium vs medium, 1,000 paired games per
candidate, keep a change at +0.05 points per game). Round 1 (±50 %, all
scalar weights) kept `race` 0.4 → 0.2, `madePoint` 1 → 0.5, `pinBase`
0.4 → 0.2 and `double` 0.65 → 0.975. Round 2 (±30 %, 12 main weights) kept
`pinPips` 0.8 → 0.56 and `anyShot` 0.2 → 0.26. On fresh seeds the tuned
weights beat the hand-picked ones by **+0.27 points per game** (560 wins,
411 losses, 29 draws in 1,000 games).

### Plakoto strength and speed

1,000 games per match, seed 1, half with each colour (A's numbers; a draw
is a game where both mothers were pinned):

| Match            | A wins       | Draws | A points : B points | Double wins (A) |
| ---------------- | ------------ | ----- | ------------------- | --------------- |
| medium vs random | 936 (93.6 %) | 48    | 1,802 : 28          | 866             |
| medium vs easy   | 849 (84.9 %) | 65    | 1,511 : 124         | 662             |
| easy vs random   | 846 (84.6 %) | 98    | 1,562 : 81          | 716             |

`src/plakoto-strength.test.ts` plays `GAMES` = 200 games per match (fixed
seeds, colours swapped halfway): medium beats random 187/200 (needs 85 %),
easy beats random 174/200 (needs 70 %), medium beats easy 171/200 (needs
70 %). Raise `GAMES` locally for tighter numbers.

Decision time of the medium bot (Node 22, dev container, best of 3 runs
per position):

| Positions                                   | Median  | p90     | p99     | Max     |
| ------------------------------------------- | ------- | ------- | ------- | ------- |
| 300 random positions (the perf test set)    | 0.07 ms | 0.26 ms | 0.83 ms | 0.98 ms |
| 5,000 positions from medium-vs-medium games | 0.05 ms | 0.25 ms | 1.4 ms  | 5.4 ms  |

`src/plakoto-perf.test.ts` checks median < 20 ms and worst < 200 ms.

Simulator: `pnpm --filter @tavli/bot simulate -- --variant plakoto --a medium --b easy`.
1,000 medium-vs-easy Plakoto games take about 13 s.

## The runner (for the app)

The app never calls the bot directly. It uses the `BotRunner` port from
`@tavli/contracts`:

```ts
const runner: BotRunner = new InlineBotRunner(); // or new InlineBotRunner(createBot({ evaluators }))
const turn = await runner.chooseMove({ variant: 'portes', state, dice, difficulty: 'easy', seed });
// Phase 'awaiting-answer' and the bot is prompt.player (Plakoto "resign or play on"):
const choice = await runner.chooseAnswer?.({ variant: 'plakoto', state, difficulty: 'easy', seed });
runner.cancel(); // the user left: pending requests reject with BotCancelledError
```

- A request is plain JSON. It carries a `seed`, not an RNG, so a worklet or
  a server runner can take the same request later.
- `InlineBotRunner` runs the bot on the same thread, in a microtask. A
  `cancel()` right after `chooseMove` stops the bot before it runs.
- Use a new seed for each request. Never reuse the dice seed.
- `chooseAnswer` is optional on the port, so older runners and test fakes
  still fit. `InlineBotRunner` has it (`runBotAnswer` is the synchronous
  core). `state` is the flow's `state` while the phase is
  `awaiting-answer`.

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

1. Write an `Evaluator` for the variant, like
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
4. If the variant asks questions (`Variant.prompt`), `chooseAnswer` and
   `simulate` handle them with no extra code: each choice is scored with
   the same evaluator.
5. Add tests: always legal, same seed gives the same turn, and a simulation
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
  chosen turn is checked by `variant.applyTurn`. When the variant asks a
  question after a turn, the asked player's bot answers it
  (`chooseAnswer`; `onAnswer` sees each answer). A failure carries its
  `gameSeed`, so `playGame` can replay it.

Numbers (Node 22, dev container, seed 1): 1,000 random-vs-random Portes
games take about 2 s; 1,000 medium-vs-easy games about 4–5 s. See
"Strength and speed" for the match results.

## Tests

`pnpm test` from the repo root, or `pnpm --filter @tavli/bot test` (about
16 s in the dev container; the Plakoto strength test takes about 8 s of
that).

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
- `evaluators/plakoto-heuristic.test.ts`: a pin held beats a pin suffered,
  deep pins are worth more, a pinned mother is nearly a lost double, a lone
  mother in reach costs, lone checkers in range cost, primes, the race; the
  Plakoto shot table (doors, pins, pinned shooters); the game end after a
  turn for each mother rule.
- `plakoto-bot.test.ts`: levels, legal and repeatable turns, the fast path
  equals the engine path for every mother rule, medium pins a mother, a
  winning mother pin is always taken, the mother question (scores, medium
  plays on, errors), the runner's `chooseAnswer`, and simulations with
  questions.
- `plakoto-strength.test.ts` (`GAMES` = 200 per match in CI),
  `plakoto-perf.test.ts`.
- `strength.test.ts` (300 games per match), `perf.test.ts`,
  `simulate.test.ts` (1,000 random-vs-random games), `tune.test.ts` (a tiny
  search), and the runner and the command line.
