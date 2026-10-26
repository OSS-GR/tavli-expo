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

interface Bot {
  chooseTurn(state: GameState, dice: Dice, difficulty: Difficulty, opts: BotOptions): Turn;
}
interface BotOptions {
  rng: Rng; // the bot's own RNG, never the dice RNG
  timeBudgetMs?: number; // for a deeper search later; easy ignores it
}
interface Evaluator {
  id: string; // 'portes-heuristic-v1'
  variant: VariantId;
  evaluate(state: GameState): Evaluation; // from the view of state.toMove
}
interface Evaluation {
  win: number;
  winDouble: number;
  loseDouble: number;
  equity: number;
}
```

- `chooseTurn` returns one full turn for the roll. A pass is a turn with
  empty `moves`. If `state.dice` is set, it must equal `dice`.
- `createBot({ variants?, evaluators? })` builds a bot. Default: the engine's
  `VARIANT_REGISTRY` and no evaluators.
- `Analyzer` (hints, post-game review) is only a type for now.

Errors:

- `BotError('NOT_IMPLEMENTED')`: no evaluator for this level and variant.
- `BotError('INVALID_REQUEST')`: `dice` differs from `state.dice`, or a
  runner request names another variant than its state.
- `BotError('INVALID_REGISTRY')`: an evaluator sits under the wrong variant.
- Engine errors pass through: `ILLEGAL_TURN` for a finished game,
  `UNKNOWN_VARIANT`, `OUT_OF_RANGE` for a bad seed.

## The levels today

| Level  | What it does now                                                               |
| ------ | ------------------------------------------------------------------------------ |
| easy   | A uniformly random legal turn (`chooseRandomTurn`). Works for every variant.   |
| medium | 1-ply with the registered evaluator: the best end position, ties at random.    |
| hard   | Same as medium. Without an evaluator, medium and hard throw `NOT_IMPLEMENTED`. |

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
   `src/portes/heuristic.ts`. It scores a position from the view of
   `state.toMove`. Keep it pure and fast.
2. Register it by variant id and level:

   ```ts
   const evaluators: EvaluatorRegistry = new Map([['portes', { medium: portesHeuristic }]]);
   const bot = createBot({ evaluators });
   ```

3. If the level needs more than "pick the best" (noise for medium, 2-ply for
   hard), add it in `chooseTurn` in `src/create-bot.ts`. Keep the RNG as the
   only source of chance.
4. Add tests: always legal, same seed gives the same turn, and a simulation
   against the level below it (`simulate`).

## Simulator

```sh
pnpm --filter @tavli/bot simulate -- --games 1000 --a easy --b easy
```

Options: `--games N`, `--a LEVEL` (White), `--b LEVEL` (Black), `--seed N`,
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

Numbers (Node 22, dev container, seed 1): 1,000 easy-vs-easy Portes games take
about 2 s. White 512 wins, Black 488; 394 mono and 606 diplo; 96 turns per game
on average; 0 illegal turns.

## Tests

`pnpm test` from the repo root. The 1,000-game simulation test takes about
2 s.
