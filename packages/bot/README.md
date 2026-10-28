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
  mother question" below. It also answers the Asodio `chooseDouble`
  question of the Acey-Deucey presets (see "The Asodio heuristic"); the
  owner version (`asodio.kafeneio`) asks nothing.
- `createBot({ variants?, evaluators?, policies? })` builds a bot. Default:
  the engine's `VARIANT_REGISTRY`, `DEFAULT_EVALUATORS` (the Portes,
  Plakoto, Fevga and Asodio heuristics for easy and medium, and a trained
  net per game for hard) and `DEFAULT_LEVEL_POLICIES`.
- `bot.supportedLevels(v)` is `['easy', 'medium', 'hard']` for `portes`,
  `plakoto`, `fevga` and `asodio`. Easy works for every known variant;
  medium and hard need an evaluator. The app's
  level picker can use it, or probe `chooseTurn` and catch
  `NOT_IMPLEMENTED`: both give the same answer.
- `scoreTurns(variant, evaluator, state, turns)` and `pickTurn` are the
  1-ply core. `createAnalyzer` ranks the turns for hints (see "The
  Analyzer").

Errors:

- `BotError('NOT_IMPLEMENTED')`: no evaluator for this level and variant
  (only with a custom registry: the default one has every level).
- `BotError('INVALID_REQUEST')`: `dice` differs from `state.dice`, a
  runner request names another variant than its state, or `chooseAnswer`
  gets a state with no question.
- `BotError('INVALID_REGISTRY')`: an evaluator sits under the wrong variant,
  or a temperature is not a number >= 0.
- Engine errors pass through: `ILLEGAL_TURN` for a finished game (or a
  Plakoto state that waits for its answer), `UNKNOWN_VARIANT`,
  `OUT_OF_RANGE` for a bad seed.

## The Analyzer (hints)

`createAnalyzer({ variants?, evaluators? })` builds an `Analyzer` (#206),
for hints and later for post-game review. Same defaults as `createBot`.

```ts
const analyzer = createAnalyzer();
const ranked = analyzer.rankTurns(state, dice, { top: 3 }); // best first
ranked[0].turn; // the hint
ranked[1].equityLoss; // points lost against the best turn
analyzer.rankTurns(state, dice, { plies: 2, top: 3 }); // one roll deeper (#212)
analyzer.evaluate(state); // the chances of state.toMove, before the roll
```

- It uses the variant's best evaluator: hard (the net) if there is one,
  else medium. The default registry has a net for every game.
- `rankTurns` (`plies: 1`, the default) scores every legal turn with
  `scoreTurns` (1-ply), like the bot. A turn that wins at once ranks first
  (more points first), then the rest by score. Its best turn is what hard
  plays at temperature 0.
- Each `RankedTurn` has the `evaluation` after the turn, from the view of
  the mover (`state.toMove`), and `equityLoss` against the best turn (0 for
  the best, never below 0). At 1 ply, `evaluation.equity` is the turn's
  score. At 2 plies, a candidate's evaluation is the average over the 21
  replies, and the other turns keep their 1-ply evaluation (see "2-ply"
  below). When the turn ends the game, the evaluation is the true result.
- It follows `state.toMove`: an Asodio extra roll keeps the same player,
  and then the view after the turn is already the mover's. If
  `state.dice` is set (the chosen double), `dice` must equal it.
- No randomness. The same input gives the same output, and equal scores
  keep the engine's order of `legalTurns`.
- A forced turn (or a pass) is a list of one with `equityLoss` 0.
- `top` keeps the best `top` turns (an integer >= 1). Default: all.
- `evaluate` of a finished game gives the true result (a draw is half a
  win, like in the nets).
- Errors: `NOT_IMPLEMENTED` (no hard or medium evaluator),
  `INVALID_REQUEST` (`dice` differs from `state.dice`, a bad `top` or
  `plies`, or at 2 plies a question the variant cannot take an answer
  for: `prompt` with no `answerPrompt`, or a variant that still asks after
  8 answers in a row), `INVALID_REGISTRY` like
  `createBot`, and the engine's errors
  (a finished game in `rankTurns`, an unknown variant).

### 2-ply (#212)

`plies: 2` looks one roll deeper, for better hints and a fairer review:

1. Score every turn at 1 ply. The candidates are the best 8
   (`TWO_PLY_CANDIDATES`), plus any turn within 0.02 points of the best
   (`TWO_PLY_MARGIN`, a near tie), at most 16 in all
   (`TWO_PLY_MAX_CANDIDATES`).
2. For each candidate, play it, then average over the 21 different rolls
   of the next player (`DISTINCT_ROLLS` from the engine: a double 1/36,
   the others 2/36) the result after
   their best 1-ply reply (the turn hard plays at temperature 0).
3. Rank the candidates by that 2-ply equity. A turn that wins at once is
   still the best (its value is exact). The other turns follow in their
   1-ply order, with their 1-ply evaluation; their `equityLoss` is their
   1-ply loss, but never less than the last candidate's, so the list stays
   sorted. A candidate's `evaluation` is the average of the chances after
   each reply, from the mover's view, with the 2-ply equity.

**Two scales.** The candidates (first in the list) have 2-ply values; the
turns after them have 1-ply values, with `equityLoss` raised to at least
the last candidate's loss. Values across that boundary cannot be compared:
a 1-ply equity is not a 2-ply equity. A review that grades each turn (for
example "a blunder lost 0.3 points") should use `plies: 1`, or use 2-ply
values only for turns inside the candidates.

The engine drives every step, and the next player is always `toMove`:

- A question after the turn (Plakoto "resign or play on", the Asodio
  chosen double) gets the best 1-ply answer of the player asked
  (`scoreAnswers`, as the bot answers). Then play goes on.
- A state that holds dice (the Asodio chosen double) plays those dice: the
  value is the best reply with them, with no average over rolls.
- An Asodio extra roll keeps the same player to move. Then the "reply" is
  the mover's own next roll, so its value counts for the mover.

Why these numbers: on 189 random positions of all games with more than
one turn, 2-ply on the best 16 found its best turn in the 1-ply top 3 in
96 % of them, and outside the top 8 only twice. The margin adds near ties
past the top 8; the cap stops Asodio rolls with dozens of near-equal turns
from taking seconds.

**Time** (Node 22, dev container, after warm-up): the middle-game Portes
position in `src/analyzer-perf.test.ts` (4-2) ranks in about 110 ms; that
test checks < 2 s. Over 30 random positions per game: Portes median 34 ms
(worst 200 ms), Plakoto 87 ms (313 ms), Fevga 35 ms (140 ms), Asodio
3 ms (1.1 s). Acey-Deucey was slow: median 0.45 s, worst 7 s. Its rules
are not the net's, so it uses the Asodio heuristic, which cost about
0.2–0.4 ms per position against 0.03 ms for the Portes net. Since #225
it costs 4–4.9× less in Acey-Deucey and 2.4× less in the owner version
(see the table below). Hermes on a phone is several times slower than
Node, so a 2-ply hint fits the 1 s phone budget for Portes, Plakoto and
Fevga. For Asodio it does not yet: after #225 the worst 2-ply hint we saw
still takes 0.5–0.7 s in Node in Acey-Deucey, which is several seconds on
a phone. The bot's own play (`chooseTurn`) stays 1-ply.

**In the app (#219).** The Hint asks for 2 ply in Portes, Plakoto and
Fevga, and for 1 ply in Asodio (every preset): `hintPlies` in
`apps/mobile/src/features/hint/hint.ts`. The game review stays at 1 ply
(see "Two scales"). Asodio needs a deterministic cap on the work before it
can use 2 ply.

**Work bound.** `src/analyzer-work.test.ts` counts the positions the
evaluator scores in one 2-ply hint (`rankTurns` with `plies: 2, top: 1`):
each `evaluate` call, and each turn given to a `scoreTurns` fast path.
That count is deterministic, unlike the time. It plays 120 positions per
game (60 from games where both players play the 1-ply best turn, 60 from
random play) and checks the worst against a fixed bound:

| Game    | Median            | Worst seen (500 positions) | Bound  |
| ------- | ----------------- | -------------------------- | ------ |
| Portes  | about 2,000       | 14,501                     | 19,000 |
| Plakoto | about 2,500–3,600 | 19,065                     | 25,000 |
| Fevga   | about 1,300–1,700 | 13,649                     | 18,000 |

A scored position costs about 0.01–0.015 ms in Node (the nets), so the
bounds are about 0.2–0.4 s in Node. Raise a bound only with a reason here.

**The Asodio heuristic, before and after #225** (same scores; Node 22,
dev container, `pnpm --filter @tavli/bot bench:asodio`, on the 2,100
golden positions). "Position" is one `evaluateAsodioSides`; "turn" is
`scoreTurns` per legal turn (in Acey-Deucey it includes the engine's
`applyTurn`). The 2-ply rows are `rankTurns` with `plies: 2` on the same
30 random positions per preset, before and after:

| Preset               | Position (µs) | Turn (µs) | 2-ply median (ms) | 2-ply worst (ms) |
| -------------------- | ------------- | --------- | ----------------- | ---------------- |
| `asodio.kafeneio`    | 33 → 14       | 59 → 22   | 20 → 11           | 562 → 170        |
| Acey-Deucey Greek    | 60 → 15       | 79 → 21   | 95 → 44           | 2,447 → 516      |
| Acey-Deucey American | 177 → 36      | 206 → 41  | 407 → 92          | 3,957 → 690      |

Almost all of the time is the shot count (`asodio-shots.ts`). It now plays
moves in place and takes them back, shares the work of the 15 rolls with
two different dice, and skips branches that cannot land on a target. The
golden test (`asodio-heuristic.golden.test.ts`) checks that every score
stays exactly the same, and `asodio-shots.test.ts` compares the new shot
count with the first one (`src/testing/asodio-shots-reference.ts`) on
about 30,000 positions. The Acey-Deucey presets gain 4–4.9× per position.
The owner version gains 2.4×: there, most of the time is the search of the
doubles under the quarter lock, and a stronger cut there would need new
rules about the army in the search, which could change a score. The
Asodio net (hard, owner version) uses the same shot count, so it is faster
too.

The fixture `asodio-heuristic.golden.json` holds the scores from before
the speed work. Write it again (`pnpm --filter @tavli/bot golden:asodio`)
only when changing a score is the point, such as new weights. Never write
it again to make a speed change pass.

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

| Level  | Evaluator         | Noise (`T`) | How it plays                                                                                                                                                                                |
| ------ | ----------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| random | none              | uniform     | A uniformly random legal turn (`chooseRandomTurn`). Seeded, so it repeats. For tests and as a baseline. Not in the app.                                                                     |
| easy   | variant heuristic | 0.15        | About half its turns are not the best, but most of those cost little; about 1 in 5 loses more than 0.1 points. Never misses a win now.                                                      |
| medium | variant heuristic | 0.01        | Small noise: it only mixes turns that are almost equal (average loss about 0.001 points per turn).                                                                                          |
| hard   | variant net       | 0.01        | Portes (#147), Plakoto and Fevga (#156), Asodio (#164): a trained net, 1-ply, with the same small noise as medium. See "The Portes net", "The Plakoto and Fevga nets" and "The Asodio net". |

- Change the noise with `createBot({ policies: { medium: { temperature: 0.03 } } })`.
  `0` means "always a best turn" (ties at random).
- Easy for a variant with no evaluator plays a random turn, but still takes
  a turn that wins now.
- Same state, dice, level and seed → the same turn.
- Each variant uses its own heuristic (Portes, Plakoto, Fevga, Asodio)
  with the same temperatures. The "How it plays" numbers are for Portes;
  the others are in each variant's "strength and speed" section.
- A turn that keeps the same player to move (an Asodio extra roll) scores
  the evaluation for that player, not for the opponent (`src/score.ts`).

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

## The Portes net

The hard level for Portes (#147): a small neural net, trained by TD(λ)
self-play in the style of TD-Gammon (bot-ai.md, section 5). Code:
`src/evaluators/portes-net.ts` (the Portes inputs), `src/evaluators/net.ts`
(the net code shared with Plakoto, Fevga and Asodio: the forward pass, loading, the
evaluator and the 1-ply scoring), `src/train/` (training, dev only, for
every game), `scripts/train.ts` (the Node entry point).

**What it scores.** Like the heuristic, a position before the roll, from
the view of the player to roll. The net only scores **contact** positions.
A race (no contact) and a finished game use the Portes heuristic (the Keith
count, the Kleinman metric and the exact bear-off table), so the net never
has to learn the race. The hard level is 1-ply, with the same small noise
as medium (temperature 0.01).

**The net.** 201 inputs → 40 hidden units (sigmoid) → 3 outputs (sigmoid):
P(win), P(win a diplo), P(lose a diplo). `equity = 2·win − 1 + winDouble −
loseDouble`, with each diplo chance capped at the win (or loss) chance. The
inputs, the roller's side first, then the waiter's, each in its own
numbering:

| Inputs | What                                                                          |
| ------ | ----------------------------------------------------------------------------- |
| 192    | per own point 1–24, 4 units (TD-Gammon): n ≥ 1, n ≥ 2, n ≥ 3, (n − 3) / 2     |
| 4      | checkers on the bar / 2, borne off / 15                                       |
| 2      | pip counts / 100                                                              |
| 2      | rolls out of 36 that hit a blot, for each side (`shots.ts`)                   |
| 1      | the heuristic's contact score in logits / 4 (`contactScore`, default weights) |

Most inputs are 0, so the first layer only adds the weight rows of the
inputs that are set (a sparse sum). The last input ties the net to
`PORTES_DEFAULT_WEIGHTS`: if you retune the heuristic, retrain the net (a
test pins the net's value of a fixed position).

**The weights** ship in `src/evaluators/portes-net-weights.ts`: one base64
string of little-endian Float32 values (`float-codec.ts`): 8,203 weights, 32 KB as Float32, a 44 KB file. A `.ts`
file loads in Metro, Vitest and Node with no `fs` and no JSON import. The
evaluator decodes it on its first use, not at app start.

**Training** (`src/train/td.ts`, the same code for every game). The net
plays itself, greedy 1-ply, with the engine's `legalTurns` and the fast
board arrays. It scores the turns with `scoreNetCandidates` and picks with
`pickTurn` (temperature 0): the same code as the bot, so the training
policy and the bot cannot drift apart. A game stops at the first position
the net does not score (here: contact breaks; the race heuristic gives the
value) or at the end (the true result). A game longer than 1,000 turns is
dropped. Each position gets a λ-return target, computed backwards from the
end: `G_t = flip((1 − λ)·V_{t+1} + λ·G_{t+1})`, where `V_{t+1}` is the value
the net gave the chosen turn. Then one gradient step per position with
cross-entropy loss. A match against medium (1,000 paired games) runs every
10,000 games; `best.json` keeps the best one. Each match has its own seed
(`--eval-seed` + games played; #147 used seed 1 for all), so play the best
checkpoints again on a fresh seed before you ship one. The optional warm
start (`--warm N`) uses `--alpha` as its learning rate.

```sh
pnpm --filter @tavli/bot train -- train --game portes --out /tmp/portes-net --hidden 40 --games 200000 --seed 12
pnpm --filter @tavli/bot train -- eval --file /tmp/portes-net/best.json --games 2000 --seed 99
pnpm --filter @tavli/bot train -- export --file /tmp/portes-net/best.json
```

What we ran (Node 22, dev container, 4 cores): three runs side by side for
about 65 minutes, each on one core (about 45 self-play games per second
with 40 hidden units, a little less with 80, plus the matches). No warm
start. The plan was 200,000 games each; we stopped them after about an
hour, because the matches had been flat for a while. Then we played the
best checkpoints of each run again on a fresh seed (2,000 paired games,
seed 99):

| Run | Hidden | λ   | α (start → end of 200k) | Seed | Games played | Best checkpoint (seed 99) |
| --- | ------ | --- | ----------------------- | ---- | ------------ | ------------------------- |
| A   | 80     | 0.7 | 0.1 → 0.01              | 11   | 130,000      | 110k: 75.1 %, +0.63       |
| B   | 40     | 0.7 | 0.1 → 0.01              | 12   | 160,000      | **150k: 76.8 %, +0.66**   |
| C   | 80     | 0.5 | 0.05 → 0.005            | 13   | 130,000      | 120k: 74.8 %, +0.63       |

(Win share and points per game against medium.) All three runs beat
medium about 70 % of the time after only 10,000 games, and 73–76 % from
about 50,000 games on. The bigger net did not help, so we ship run B at
150,000 games (58 minutes of training): `portes-net-v1`. Its training
notes are in the weights file.

**Strength** of hard (the shipped net) against medium:

| Match                                                   | Hard wins      | Points per game |
| ------------------------------------------------------- | -------------- | --------------- |
| `simulate -- --games 1000 --a hard --b medium --seed 1` | 742 (74.2 %)   | +0.64           |
| 1,000 paired games, seed 2026 (`train -- eval`)         | 734 (73.4 %)   | +0.58           |
| 2,000 paired games, seed 99                             | 1,535 (76.8 %) | +0.66           |
| `strength.test.ts`: 200 paired games, seed 2029         | 157 (78.5 %)   |                 |

With `simulate`, hard scored 945 points against 307, with 203 diplo wins
against 49. So hard beats medium 73–77 % of the time, above the epic target
of 70 % (#52) by 3 to 7 points. The CI test needs 60 %. The checkpoint was
chosen by its seed-1 matches, so the fresh seeds (99, 2026) are the fair
numbers.

**2-ply.** We tried 2-ply on the best 3 turns (within 0.05 points of the
best), with a net from the middle of training. Over 400 paired games
against medium it won 286 games, against 287 for 1-ply, and the match took
16 times longer (79 s against 5 s). The strength test would then take far
more than its 30 s, so the hard level stays 1-ply.

**Decision time** of the hard bot (Node 22, dev container, after warm-up,
300 random positions): median 0.14 ms, p90 0.68 ms, p99 3.3 ms, max 5.0 ms
(medium on the same run: 0.08, 0.43, 2.2 and 5.7 ms). `src/hard-perf.test.ts` checks median < 50 ms
and worst < 300 ms.

## The Plakoto and Fevga nets

The hard level for Plakoto and Fevga (#156), built like the Portes net:
one hidden layer of 40 sigmoid units, 3 sigmoid outputs (P(win), P(win a
double), P(lose a double)), 1-ply, temperature 0.01. The shared code is in
`src/evaluators/net.ts`: a game plugs in through a `NetGame` (its board
arrays, its game end, its inputs, and the positions the net leaves to the
heuristic). The bot's evaluator (`createNetEvaluator`) and the trainer use
the same `NetGame`, so they score turns the same way.

**What the nets score.** Each net scores contact positions only. The
game's heuristic scores the rest (and so do the training games, which stop
there with the heuristic's value as the target):

- Plakoto (`plakoto-net.ts`): a race, a finished game, and **any position
  with a pinned mother**. A pinned mother nearly decides the game (README,
  "The mother question": the pinned side scores about −1.8), and the
  heuristic's number for it is close. So the net learns the play before a
  mother falls, and the training games stay short. After a pin, hard plays
  like medium. This holds for every `motherRule` (`offerConcede`,
  `instant`, `federation`): `usesNet` looks only at the board, so the
  heuristic scores every position with a pinned mother, whatever the rule
  does next. The mother question: hard scores "play on" like medium does,
  so it plays on.
- Fevga (`fevga-net.ts`): a race and a finished game. The runner rule and
  the prime bans come from the engine's legal turns.

**Inputs.** The roller's side first, then the waiter's, each in its own
numbering:

| Game    | Inputs | What                                                                                                |
| ------- | ------ | --------------------------------------------------------------------------------------------------- |
| both    | 192    | per own point 1–24, 4 units (TD-Gammon): n ≥ 1, n ≥ 2, n ≥ 3, (n − 3) / 2                           |
| Plakoto | 48     | pin units: the side's checker on own point 1–24 is pinned (a waiter pin is a pin the roller holds)  |
| Plakoto | 2      | a lone mother (one free checker left on own 24), per side                                           |
| Plakoto | 4      | borne off / 15, pip counts / 100                                                                    |
| Plakoto | 4      | rolls out of 36 that pin some checker, per side, and that pin the other mother (`plakoto-shots.ts`) |
| Plakoto | 1      | the heuristic's contact score in logits / 4                                                         |
| Fevga   | 4      | borne off / 15, pip counts / 100                                                                    |
| Fevga   | 20     | the heuristic's block features per side (`sideFeatures`): prime, trapped checkers, points ahead,    |
|         |        | blocked landings, dead dice, runner lock and runner distance (for the rules' runner target), home   |
|         |        | points, checkers on the start, stacked checkers                                                     |
| Fevga   | 1      | the heuristic's contact score in logits / 4                                                         |

Plakoto has 251 inputs, Fevga 217. The heuristic inputs tie each net to
its default weights (`PLAKOTO_DEFAULT_WEIGHTS`, `FEVGA_DEFAULT_WEIGHTS`): if
you retune a heuristic, retrain its net (a test pins each net's value of
the start).

**Weights:** `src/evaluators/plakoto-net-weights.ts` (10,203 weights, 41 KB
as Float32, a 55 KB file) and `src/evaluators/fevga-net-weights.ts` (8,843
weights, 35 KB as Float32, a 48 KB file). Both are under the 100 KB budget.

**Training** (the same trainer as Portes; Node 22, dev container, one core
per run, no warm start, λ 0.7):

```sh
pnpm --filter @tavli/bot train -- train --game plakoto --out /tmp/plakoto-net --hidden 40 --games 50000 --alpha 0.1 --alpha-end 0.01 --seed 21 --eval-every 5000 --eval-games 600
pnpm --filter @tavli/bot train -- train --game fevga --out /tmp/fevga-net --hidden 40 --games 100000 --alpha 0.1 --alpha-end 0.01 --seed 31
pnpm --filter @tavli/bot train -- train --game fevga --out /tmp/fevga-net-b --from /tmp/fevga-net/games-70000.json --games 30000 --alpha 0.03 --alpha-end 0.005 --seed 32 --eval-seed 2000000
pnpm --filter @tavli/bot train -- eval --game plakoto --file /tmp/plakoto-net/games-45000.json --games 1000 --seed 99
pnpm --filter @tavli/bot train -- export --game plakoto --file /tmp/plakoto-net/games-45000.json
```

| Run       | Hidden | α (start → end)                     | Seed | Games  | Time     | Best checkpoints (1,000 paired games, seed 99) |
| --------- | ------ | ----------------------------------- | ---- | ------ | -------- | ---------------------------------------------- |
| Plakoto A | 40     | 0.1 → 0.01                          | 21   | 50,000 | 31.5 min | 35k: 71.4 %; **45k: 73.1 %**; 50k: 72.6 %      |
| Plakoto B | 80     | 0.05 → 0.005                        | 22   | 35,000 | 27 min   | 30k: 76.0 %; 35k: 72.3 %                       |
| Fevga A   | 40     | 0.1 → 0.01 (stopped at 78k of 100k) | 31   | 78,000 | 33 min   | 50k: 79.5 %; 60k: 76.3 %; 70k: 78.9 %          |
| Fevga B   | 40     | 0.03 → 0.005, from A at 70k         | 32   | 30,000 | 13 min   | 10k: 79.8 %; 20k: 80.0 %; **30k: 80.0 %**      |

About 24 Plakoto and 40 Fevga self-play games per second with 40 hidden
units, plus the matches. Both nets passed 60 % against medium after 5,000
to 10,000 games. Plakoto B (80 hidden units) did a little better on one
checkpoint, but its weights file would be about 109 KB, over the budget,
and its last checkpoint was no better than A. So we ship Plakoto A at
45,000 games (`plakoto-net-v1`) and Fevga B at 30,000 (100,000 games in all,
about 43 minutes: `fevga-net-v1`). The training notes are in the weights
files. A first Plakoto run crashed at about 3,000 games: with
`motherCheckTiming: "afterEachMove"`, a turn that pins the mother and then
leaves it still asks the mother question. The trainer now answers
"play on" (`playOn` in `td.ts`).

**Strength** against medium (a draw is not a win):

| Match                                                                    | Plakoto hard                              | Fevga hard                       |
| ------------------------------------------------------------------------ | ----------------------------------------- | -------------------------------- |
| `simulate -- --variant <game> --games 1000 --a hard --b medium --seed 1` | 732 (73.2 %), 6 draws, 1,145 : 320 points | 810 (81.0 %), 1,185 : 203 points |
| 1,000 paired games, seed 2026 (`train -- eval`)                          | 736 (73.6 %), +0.85 points/game           | 807 (80.7 %), +1.01 points/game  |
| 1,000 paired games, seed 99 (used to pick the checkpoint)                | 731 (73.1 %)                              | 800 (80.0 %)                     |
| `*-strength.test.ts`: 200 paired games (seeds 2029, 3029)                | 150 (75.0 %)                              | 162 (81.0 %)                     |

Both are above the epic target of 70 % (#52); the CI tests need 60 %.
Seeds 1 and 2026 are fresh: no checkpoint was picked on them.

**Decision time** (Node 22, dev container, best of 3 runs, after warm-up,
300 random positions):

| Bot          | Median  | p90     | p99     | Max    |
| ------------ | ------- | ------- | ------- | ------ |
| Plakoto hard | 0.20 ms | 0.79 ms | 2.4 ms  | 3.0 ms |
| Fevga hard   | 0.07 ms | 0.22 ms | 0.66 ms | 1.1 ms |

`src/hard-perf.test.ts` checks a median under 50 ms and a p99 under 300 ms
for every net (Asodio: see "The Asodio net").

## The Asodio net

The hard level for Asodio (#164), owner version (`asodio.kafeneio`), built
like the other nets: 279 inputs → 40 hidden units (sigmoid) → 3 outputs,
1-ply, temperature 0.01. Code: `src/evaluators/asodio-net.ts`.

**What it scores.** Contact positions with no **mutual lock**. The Asodio
heuristic scores the rest: a race, a finished game, and a mutual lock
(both armies hold each other forever: a sure draw, scored 0). Training
games stop there too. The net counts a draw as half a win (the trainer's
target for a draw is `[0.5, 0, 0]`), so the heuristic's numbers are put in
the same terms (`evaluateAsodioFallback`: the same equity, with half the
draw chance in `win`).

**Only the owner rules.** The net was trained on `asodio.kafeneio`. For any
other rule set (the Acey-Deucey presets, with hits and roll chains, or a
changed army flag) the hard evaluator is the heuristic, for every position
(`isAsodioNetRules` compares the move flags with the owner version). So
hard plays like medium there, and the `chooseDouble` question goes to the
heuristic too. The owner version asks no question, so self-play never
meets a prompt (the trainer would answer one with `playOn`).

**Inputs** (the roller's side first, then the waiter's):

| Inputs | What                                                                                       |
| ------ | ------------------------------------------------------------------------------------------ |
| 192    | per own point 1–24, 4 units (TD-Gammon): n ≥ 1, n ≥ 2, n ≥ 3, (n − 3) / 2                  |
| 48     | pin units: the side's checker on own point 1–24 is pinned                                  |
| 4      | loading: checkers still outside / 15; the first-entry gate holds (all 15 outside)          |
| 4      | borne off / 15, pip counts / 100 (a waiting checker counts 25)                             |
| 8      | the quarter lock: the side's rear quarter, one-hot                                         |
| 8      | the quarter of the side's lowest pinned checker, one-hot (none when nothing is pinned)     |
| 4      | checkers frozen in front of the rear quarter / 15; a pinned checker holds the rear quarter |
| 4      | die values with no legal single move / 6; no die moves at all                              |
| 4      | rolls out of 36 that pin some checker, and that make a mutual lock, per side               |
| 2      | the heuristic's share of losses that are doubles (mars), per side                          |
| 1      | the heuristic's contact score in logits / 4                                                |

The heuristic inputs tie the net to `ASODIO_DEFAULT_WEIGHTS`: if you
retune the heuristic, retrain the net (a test pins the net's value of the
start).

**Weights:** `src/evaluators/asodio-net-weights.ts` (11,323 weights, 45 KB
as Float32, a 61 KB file), under the 100 KB budget.

**Training** (the shared trainer; Node 22, dev container, 4 cores, up to 4
runs side by side, no warm start). About 25 self-play games per second on
a free core (a game is about 75 turns before the hand-off; most loading
turns are forced), plus a 600-game match every 5,000 games:

```sh
pnpm --filter @tavli/bot train -- train --game asodio --out /tmp/asodio-net --hidden 40 --games 50000 --lambda 0.5 --alpha 0.05 --alpha-end 0.005 --seed 42 --eval-every 5000 --eval-games 600
pnpm --filter @tavli/bot train -- eval --game asodio --file /tmp/asodio-net/games-35000.json --games 1000 --seed 99
pnpm --filter @tavli/bot train -- export --game asodio --file /tmp/asodio-net/games-35000.json
```

| Run | Hidden | λ   | α (start → end)             | Seed | Games  | Time   | Best checkpoints (1,000 paired games, seed 99) |
| --- | ------ | --- | --------------------------- | ---- | ------ | ------ | ---------------------------------------------- |
| A   | 40     | 0.7 | 0.1 → 0.01                  | 41   | 50,000 | 88 min | 45k: 52.4 %; 50k: 49.5 %                       |
| B   | 40     | 0.5 | 0.05 → 0.005                | 42   | 50,000 | 88 min | **35k: 51.7 %**; 45k: 49.4 %; 50k: 49.5 %      |
| C   | 60     | 0.7 | 0.1 → 0.01 (stopped at 45k) | 43   | 45,000 | 78 min | 25k: 50.8 %                                    |
| E   | 40     | 0.7 | 0.03 → 0.003, from B at 35k | 45   | 10,000 | 19 min | 10k: 49.3 % (600 games; stopped)               |

The 600-game matches during training rose from about 40 % wins at 5,000
games to 47–51 % from 25,000 games on, then stayed flat. We ship B at
35,000 games (58 minutes of training): `asodio-net-v1`. A at 45,000 games
did a little better on seed 99, but worse on the fresh seed 2026 (47.4 %).

Tried and dropped (offline scripts, not in the repo):

- **2-ply with the heuristic** (the top 3 turns, all 21 replies): 75 wins,
  64 losses and 61 draws in 200 paired games against medium. No better
  than medium, and about 25 times slower.
- **Training against medium** half of the time (TD on games of the net
  against the heuristic, from B at 10,000 games): 48.0 %, then 43.3 %
  (600 games each). No gain.
- **Picking turns by the win chance only** (no doubles): 165 wins, against
  187 when it picks by equity (400 paired games).

**Strength** of hard (the shipped net) against medium. A draw is not a win:

| Match                                                                    | Hard wins    | Losses | Draws | Points per game   |
| ------------------------------------------------------------------------ | ------------ | ------ | ----- | ----------------- |
| `simulate -- --variant asodio --games 1000 --a hard --b medium --seed 1` | 489 (48.9 %) | 261    | 250   | +0.47 (909 : 442) |
| 1,000 paired games, seed 1 (`train -- eval`)                             | 515 (51.5 %) | 243    | 242   | +0.54             |
| 1,000 paired games, seed 2026                                            | 488 (48.8 %) | 257    | 255   | +0.47             |
| 1,000 paired games, seed 99 (used to pick the checkpoint)                | 517 (51.7 %) | 227    | 256   | +0.57             |
| `asodio-strength.test.ts`: 200 paired games, seed 2029                   | 102 (51.0 %) | 43     | 55    | +0.57 (187 : 73)  |

For comparison, medium against medium wins 34.6 % and draws 30.5 % ("Asodio
strength and speed"). So hard wins about half of its games against medium,
and about two thirds of the games that someone wins. Seeds 1 and 2026 are
fresh: no checkpoint was picked on them.

**The Asodio bar (owner decision, #164).** The other games ask hard to win
60 % of all 200 CI games against medium. Asodio does not: about a quarter
of its games end in a lock draw (see below), so 60 % of all games is out of
reach. In Asodio, hard must win **at least 60 % of the games that someone
wins** (wins / (wins + losses)) **and score more points than medium**, in
200 paired games. Draws are reported but do not count. The CI match
(`asodio-strength.test.ts`, seed 2029) gives 102 wins, 43 losses and 55
draws: 70 % of the decided games, 187 points against 73. The epic target
of 70 % of all games (#52) is not met in Asodio.

**Why the bar is hard to reach:** about a quarter of the games end in a
deadlock draw. In 300 games of an early net (B at 10,000 games) against
medium, 75 were draws. Medium made the locking pin in 45 of them (in 41,
hard was ahead), and hard in 30 (in 21, hard was behind: a draw was its
best result). Before 38 of medium's 45 locks, hard's last turn had no play
with fewer lock shots (27 of those turns were forced). The quarter lock
leaves little choice, so most draws come from the dice, not from the play.

**Decision time** (Node 22, dev container, best of 3 runs, after warm-up,
300 random positions): hard median 0.006 ms, p90 1.4 ms, p99 6.9 ms, max
8.3 ms (medium on the same run: 0.005, 1.2, 6.5 and 8.1 ms). Most loading
turns are forced, so the median is tiny. `src/hard-perf.test.ts` checks a
median under 50 ms and a p99 under 300 ms.

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

(Hard: see "The Plakoto and Fevga nets".)

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

(Hard: see "The Plakoto and Fevga nets".)

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

## The Asodio heuristic

Code: `src/evaluators/asodio-*.ts`. Rules: `docs/rules/asodio.md` (owner
version, preset `asodio.kafeneio`, answers A1–A6) and the engine README
("Asodio"). It works like the Plakoto heuristic: it scores a position
before the roll, from the view of the player to roll, on its own small
board arrays (`asodio-board.ts`: counts, waiting checkers at index 25 so
the race code reads them as 25 pips, and a "pinned" flag per point). The
board file also has a light copy of the engine's single-move rules (the
loading lock, the quarter lock, pins, bearing off), so the evaluator can
ask "which dice can this side move?" and count shots. The bot still plays
only the turns the engine lists.

**Contact** (a pin is possible, or a checker is pinned): a weighted sum of
features in logits, `win = sigmoid(score)`. For both sides:

- **Loading:** a waiting checker counts 25 pips. While the first-entry gate
  holds (all 15 outside), the side also loses `gatePips` (28 pips: on
  average 3.5 rolls pass before a 1-2 or a double). During loading there is
  no choice to make (every die enters on its spot), so this only matters
  for the evaluation, not for the moves.
- **The army moves as one (quarter lock):** a pin is worth `pinBase +
pinPips × (its own point) / 24`, plus `pinRear` when the pinned checker
  is in its owner's rear quarter: when it is the last one there, the whole
  army freezes (A6). A side with no legal move at all costs `frozen`; each
  die value with no legal single move costs `deadDie`.
- **Shots** (`asodio-shots.ts`): for each of the 21 rolls, it plays the
  dice one at a time with the single-move rules, so only checkers the army
  rules let move can shoot, a combined move stops at the quarter line (the
  checker freezes there), and a lock that ends in the middle of a roll
  frees the rest of it. The roller gains `blotShare × shots / 36 × (value of
the pin)` per target, plus `anyShot`; the other side's shots at the
  roller cost `rollerShare ×` the same.
- **Race:** the Kleinman chance of the pip counts, as a logit, × `race`.
- Made points (`madePoint`) and checkers off (`borneOff`).

**Draws.** Deadlocks (A5) are common, so the evaluator knows two things
about them:

- A **mutual lock** is a sure draw, and scores 0. Own quarter `k` of one
  side is quarter `3 − k` of the other. If our pinned checker is in our
  quarter `a` and theirs in their quarter `b`, with `a + b ≤ 2`, each pinner
  sits in front of its own pinned rear, so it is frozen for good. Neither
  pin can end, and neither side can bear off. (This needs the owner flags:
  pins, the quarter lock, frozen checkers that do not move.)
- **Lock shots:** the rolls that would make a mutual lock. The side that is
  behind takes such a pin, so a roller who is behind gets its equity pulled
  toward 0 by its lock-shot chance; a roller who is ahead loses
  `waiterLock ×` the other side's chance.

Adding the lock rules raised medium vs random from 62 % to 72 % wins
(200 games) and cut the draws from 34 % to 24 %.

**No contact**: the Portes race code (Keith, Kleinman, the bear-off table).
Asodio bears off as in Portes (A4).

`scoreTurns` fast path: it plays each turn on copies of the board arrays
and knows when a turn ends the game (all 15 off, or a deadlock). With a
roll chain (the Acey-Deucey presets: extra rolls, the chosen double) it
lets the engine play the turn instead, because the same player may move
again. A test checks the fast path against `applyTurn` + `result` +
`evaluate` for six flag sets.

### The chooseDouble question (Acey-Deucey presets)

The owner version asks nothing (no extra rolls, A3). In the Acey-Deucey
presets (`asodio.aceyDeuceyGreek`, `asodio.aceyDeuceyAmerican`) a 1-2
asks the player to choose a double (`prompt` kind `chooseDouble`, choices
`'1'` … `'6'`). The answer sets `state.dice` to `[d, d]` and the same
player moves. So `chooseAnswer` scores each choice as **the best turn with
that double** (1-ply over its legal turns), not as the position before a
roll. Then the level's softmax picks, as for a turn. `simulate` plays the
chosen double (it uses `state.dice` when the state holds dice) and follows
`state.toMove` through extra rolls. The Acey-Deucey presets hit instead of
pinning: a hit is worth `hitBase + hitPips × (pips the checker loses) /
24`. Their games never deadlock. Medium beats random 86.5 % (Greek) and
100 % (American) in 200 games each. Their scores use the `"tavli"` scale;
`"perChecker"` is not modelled.

### Asodio weights

All weights are in `ASODIO_DEFAULT_WEIGHTS`
(`src/evaluators/asodio-heuristic.ts`). Build a variant with
`createAsodioHeuristic({ ...ASODIO_DEFAULT_WEIGHTS, pinRear: 1.5 })`.

| Weight         | Default | What it does (score in logits)                                        |
| -------------- | ------- | --------------------------------------------------------------------- |
| `race`         | 0.3     | × logit of the Kleinman chance of the pip counts                      |
| `gatePips`     | 28      | pips added while the first-entry gate holds                           |
| `pinBase`      | 0.4     | per opponent checker we pin                                           |
| `pinPips`      | 0.4     | × (pinned checker's own point) / 24                                   |
| `pinRear`      | 1.2     | extra when the pinned checker is in its owner's rear quarter          |
| `hitBase`      | 0.2     | per hit (`captureMode: "hit"`)                                        |
| `hitPips`      | 0.8     | × pips the hit checker loses / 24                                     |
| `frozen`       | 1.5     | the side has no legal move with any die                               |
| `deadDie`      | 0.08    | per die value with no legal single move                               |
| `blotShare`    | 0.6     | × shots/36 × value of the pin, per target of the roller               |
| `anyShot`      | 0.2     | × (rolls that pin any checker)/36                                     |
| `rollerShare`  | 0.3     | × shots/36 × value, per roller checker the other side can pin         |
| `waiterLock`   | 0.5     | share of the other side's lock-shot chance that counts (roller ahead) |
| `madePoint`    | 0.04    | per made point (2+ checkers)                                          |
| `borneOff`     | 0.04    | per checker off                                                       |
| `double`       | 0.8     | mars share: × pips the loser needs to come home / (pips + 20)         |
| `pinnedDouble` | 0.8     | mars share at least this for a side with a pinned rear checker        |

Tuning: hand-picked, then checked by self-play. A coordinate search
(medium vs medium, 400 paired games per candidate, ±50 %) found no change
worth more than 0.07 points per game (the best: `race` 0.3 → 0.45, +0.065,
within the noise), and a sweep against random and easy
(400 games each) moved no win rate by more than its noise (about ±2.3 %).
Three more features were tried and dropped because they made medium
weaker: a cost per lone checker with a free opponent checker behind it
(medium vs random 73 % → 67 %), a cost per own checker that a later pin
could lock (72 % → 64 % at the higher weights), and a bonus for a pin held
by a frozen pinner (no gain). The Asodio skill is mostly in the lock rules
above, not in the weights.

### Asodio strength and speed

1,000 games per match, seed 1,
`pnpm --filter @tavli/bot simulate -- --variant asodio --a medium --b random`
(A plays White; the first player alternates):

| Match            | A wins       | A losses     | Draws (deadlock) | A points : B points | Mars wins (A) |
| ---------------- | ------------ | ------------ | ---------------- | ------------------- | ------------- |
| medium vs random | 688 (68.8 %) | 40 (4.0 %)   | 272 (27.2 %)     | 1,310 : 51          | 622           |
| medium vs easy   | 492 (49.2 %) | 181 (18.1 %) | 327 (32.7 %)     | 909 : 284           | 417           |
| easy vs random   | 528 (52.8 %) | 60 (6.0 %)   | 412 (41.2 %)     | 950 : 100           | 422           |
| medium vs medium | 346 (34.6 %) | 349          | 305 (30.5 %)     | 621 : 626           | 275           |
| easy vs easy     | 293 (29.3 %) | 277          | 430 (43.0 %)     | 503 : 482           | 210           |
| random vs random | 146 (14.6 %) | 144          | 710 (71.0 %)     | 245 : 229           | 99            |

**Deadlock draws are very common** (open question Q28): 30 % of
medium-vs-medium games, 43 % of easy-vs-easy games and 71 % of random
games end with both armies frozen. A draw is a non-win in the table. Of the
games that someone wins, medium wins 94.5 % against random and 73.1 %
against easy, and easy wins 89.8 % against random. Most wins are mars
(the frozen loser has borne off nothing).

Why so many draws, even for medium: when the two armies pass each other in
the middle of the board, each side's new quarter is the other side's rear
quarter. Checkers that arrive there are frozen, and they land on the
other side's last lone checkers. Once both sides have pinned such a
checker, it is a mutual lock. In 200 medium-vs-random games, every draw
went through a mutual lock first. Random made
the locking pin in 49 of 65 draws, and in almost all of them medium's
previous turn had no play with fewer lock shots (most of those turns had
only 1–3 legal plays: the quarter lock leaves little choice). Medium makes
the lock itself mostly when it is behind (a draw is better than a loss).

So the issue's bars (medium ≥ 85 % vs random and ≥ 70 % vs easy, draws as
non-wins) cannot be reached under the owner rules. `src/asodio-strength.test.ts`
plays `GAMES` = 200 games per match (fixed seeds, colours swapped halfway)
with bars set from the numbers above, with margin:

| Match            | Bar                                               | Got (200 games)           |
| ---------------- | ------------------------------------------------- | ------------------------- |
| medium vs random | wins ≥ 60 %, losses ≤ 10 %                        | 151 wins, 8 losses        |
| easy vs random   | wins ≥ 40 %, losses ≤ 15 %                        | 103 wins, 17 losses       |
| medium vs easy   | wins ≥ 35 %, and ≥ 65 % of the games someone wins | 92 wins, 32 losses (74 %) |

The three matches take about 20 s in all.

Decision time of the medium bot (Node 22, dev container, best of 3 runs,
after warm-up). Most loading turns are forced, so the median is tiny; the
slow turns are doubles while the army crosses a quarter line:

| Positions                                   | Median   | p90    | p99    | Max     |
| ------------------------------------------- | -------- | ------ | ------ | ------- |
| 300 random positions (the perf test set)    | 0.008 ms | 1.8 ms | 7.9 ms | 10.9 ms |
| 3,000 positions from medium-vs-medium games | 0.024 ms | 1.5 ms | 7.1 ms | 20 ms   |

`src/asodio-perf.test.ts` checks median < 20 ms and worst < 200 ms. In the
Acey-Deucey presets (no quarter lock, so more plays, and the engine path)
the worst case is about 145 ms. 1,000 medium-vs-easy owner-version games
take about 45 s (most of it is the shot count).

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
`--variant ID`, `--preset ID` (for example `asodio.aceyDeuceyGreek`;
default: the variant's default preset), `--help`. It prints wins, mono and diplo counts, average
turns, illegal turns and the time. The exit code is 1 if any game failed.

- The script runs the TypeScript source with plain Node (22.18 or newer
  strips the types). `scripts/register-ts.mjs` adds the missing `.ts`
  extension to our imports. There is no build step and no extra dependency.
- In code: `simulate({ variant, bots: [a, b], games, seed })`. Player A
  plays White, B plays Black, and the first player alternates by game. The
  dice RNG and each bot RNG are separate streams from each game's seed. Each
  chosen turn is checked by `variant.applyTurn`. When the variant asks a
  question after a turn, the asked player's bot answers it
  (`chooseAnswer`; `onAnswer` sees each answer). The next player is always
  `state.toMove` (an Asodio extra roll keeps the same player), and a state
  that already holds dice (the Asodio chosen double) plays those dice
  instead of a new roll. `rules` picks a preset (default: the variant's
  default). A failure carries its `gameSeed`, so `playGame` can replay it.

Numbers (Node 22, dev container, seed 1): 1,000 random-vs-random Portes
games take about 2 s; 1,000 medium-vs-easy games about 4–5 s. See
"Strength and speed" for the match results.

## Tests

`pnpm test` from the repo root, or `pnpm --filter @tavli/bot test` (about
45 s in the dev container; the Asodio strength test takes about 40 s with hard vs medium, and
the Plakoto one about 15 s with hard vs medium; the files run in parallel).

- `analyzer.test.ts`: a forced turn is one turn with no loss, a win now
  ranks first (even when the evaluator likes another turn), for every
  game the ranking holds every legal turn once, sorted, with `equityLoss`
  > = 0, the best turn is hard at temperature 0, the evaluations are from
  > the mover's view, the same input gives the same output, Acey-Deucey
  > roll chains, `top`, the evaluator choice and the errors.
- `analyzer-2ply.test.ts` (#212): 2-ply and 1-ply agree on a forced turn
  and a win now; every game's 2-ply ranking holds every legal turn once,
  sorted, the same for the same input; the candidates rank first and the
  rest keep their 1-ply order; a candidate's equity equals a count by hand
  over the 36 rolls; a race-only test evaluator splits into a direct shot
  at 1 ply but stays safe at 2 ply; the Plakoto mother question; Asodio
  extra rolls and chosen doubles; the errors (also a stub variant that
  asks a question with no `answerPrompt`).
- `analyzer-work.test.ts` (#219): the work of one 2-ply hint in Portes,
  Plakoto and Fevga stays under its bound (positions scored, see "2-ply").
- `analyzer-perf.test.ts`: a 2-ply hint for a middle-game Portes position
  takes < 2 s.
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

- `evaluators/fevga-heuristic.test.ts`: the parallel numbering, contact
  and the runner rule agree with the engine; colours are mirrors; the fast
  path equals the engine path; primes, a runner that is through, lost dice
  and a race lead score as they should.
- `fevga-bot.test.ts`: `supportedLevels('fevga')`, every turn comes from
  `legalTurns` and repeats for a seed, a win now is never missed, and
  medium loses much less per turn than easy. `fevga-strength.test.ts`
  (200 games per match) and `fevga-perf.test.ts`.
- `evaluators/asodio-heuristic.test.ts`: the board reads waiting
  checkers and pins, the deadlock test agrees with the engine, the mutual
  lock is a draw (and needs the owner flags), the shot count (direct,
  combined, a combined move stops at the quarter line, frozen checkers
  cannot shoot, lock shots), a pinned lagging checker and the entry gate
  cost, a finished game scores its points.
- `asodio-bot.test.ts`: `supportedLevels('asodio')`, legal and repeatable
  turns for every preset and flag mix, the fast path equals the engine
  path, a win now is never missed, medium pins the lagging checker that
  freezes the other army, a roll chain keeps the equity on the same side,
  the `chooseDouble` question (scores, levels), and whole games with roll
  chains. `asodio-strength.test.ts` (200 games per match) and
  `asodio-perf.test.ts`.
- `evaluators/portes-net.test.ts`: the inputs (TD-Gammon units, both
  colours give the same inputs, indexes in range), the shipped weights
  load and stay under 200 KB, outputs in range, a race uses the heuristic,
  a closed board scores high, the fast path equals the engine path, and a
  pinned value for one position. `evaluators/plakoto-net.test.ts` and
  `evaluators/fevga-net.test.ts`: the inputs (the start, pin units and lone
  mothers, the runner inputs with and without the runner rule, both colours
  give the same inputs, indexes in range and unique), the weights load and
  stay under 100 KB, outputs in range, the heuristic for a race (and for a
  pinned mother in Plakoto), the fast path equals the engine path (every
  mother rule; with and without the runner rule), and a pinned value for
  the start. `evaluators/asodio-net.test.ts`: the same checks for the
  Asodio net, plus the mutual lock as a draw (half a win) and the heuristic
  for every rule set but the owner version. `evaluators/float-codec.test.ts`: the base64 Float32 round
  trip and bad lengths. `train/td.test.ts`: a gradient step; for each
  game, a self-play game repeats for a seed, a game past `maxTurns` is
  dropped, the warm-start labels, the bot's score-only path gives the
  trainer's scores; the mother question is answered "play
  on"; game-end targets; save and load; the train script's flag parser.
- `strength.test.ts` (300 games per match; hard vs medium 200 games),
  hard vs medium in `plakoto-strength.test.ts`, `fevga-strength.test.ts`
  and `asodio-strength.test.ts` (200 games each; Asodio counts only the
  decided games, see "The Asodio net"), `perf.test.ts`, `hard-perf.test.ts` (all four nets),
  `simulate.test.ts` (1,000 random-vs-random games), `tune.test.ts` (a tiny
  search), and the runner and the command line.
