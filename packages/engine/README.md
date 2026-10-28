# @tavli/engine

The rules of the Greek tavli games, in pure TypeScript. The same code runs on
the phone, in the bot and on the server.

Rules for this package (see `CLAUDE.md`):

- No React, no network, no vendor code.
- No `Math.random`. Chance comes from an `Rng` that the caller passes in.
- All game data is plain, readonly JSON. No classes in the state.
- Functions never change their input. They return new values.

## The model

### Players and points

- `PlayerId` is `'white' | 'black'`. Strings keep the JSON easy to read.
  `PerPlayer<T>` holds one value per player: `board.off.white`.
- Each player numbers the points 1–24 along their own path (24 = start,
  1 = deepest in home). Moves use the mover's own numbers, like the notation
  in `docs/rules/`: `24/18`, `25/22` (enter), `6/0` (bear off), `13/8*` (hit
  or pin).
- The board stores points in one **absolute** order: White's own numbering.
- `Direction` says how Black's numbers map to White's:
  - `'contrary'` (Portes, Plakoto, Asodio): `q = 25 - p`
  - `'parallel'` (Fevga): `q = p > 12 ? p - 12 : p + 12`
- Helpers: `ownToAbsolute`, `absoluteToOwn`, `otherPlayerPoint`.

### Board

```ts
interface PointState {
  white: number;
  black: number;
  pinned: PlayerId | null;
}
interface BoardState {
  points: PointState[]; // 24 entries, index i = absolute point i + 1
  bar: PerPlayer<number>; // hit checkers (Portes, Asodio with hitting)
  outside: PerPlayer<number>; // not entered yet (Asodio start)
  off: PerPlayer<number>; // borne off
}
```

- Both players can share a point only when one lone checker is pinned
  (Plakoto, Asodio). `pinned` says whose checker is under the other.
- Each player always has 15 checkers in total.
- `createBoard(layout, direction)` builds a board from each player's own view.
  `pipCount(board, player, direction)` counts pips (bar and outside = 25).

### Dice and RNG

- `Dice` is `readonly [DieValue, DieValue]`. `diceMoves(dice)` gives 2 moves,
  or 4 for a double.
- `DISTINCT_ROLLS` lists the 21 distinct rolls (higher die first) with their
  chance: 1/36 for a double, 2/36 for the rest. Use it to loop over every
  roll; do not build the list again.
- `Rng` has one method: `nextUint32()`. `rollDie` / `rollDice` use rejection
  sampling, so every face is equally likely.
- `createSeededRng(seed)` is xoshiro128\*\* (seeded with splitmix32). It is
  fast, small and statistically strong. Its state is four numbers, so it can
  be saved (`rng.state()`) and restored (`rngFromState`). It is **not**
  secure: online dice must come from the server with a secret seed or a
  secure `Rng` adapter.

### Moves, turns, state

```ts
interface Move {
  from: PointNumber | 'bar' | 'outside';
  to: PointNumber | 'off';
  die: DieValue;
  capture: 'none' | 'hit' | 'pin';
}
interface Turn {
  player: PlayerId;
  dice: Dice;
  moves: Move[];
} // moves: [] = pass
interface GameState {
  schemaVersion: 2;
  variant: VariantId; // 'portes', 'plakoto', ...
  rules: RuleSet; // the full rules, see "Rules as data"
  board: BoardState;
  toMove: PlayerId;
  dice: Dice | null; // null before the roll
  turnNumber: number; // 1 = first turn
  variantData: JsonObject | null; // extra data for a variant or the turn flow
}
```

- The state never stores what the board and the rules already tell you:
  the Asodio loading phase, a locked quarter, whether a Plakoto mother is
  pinned. Compute those when you need them.

### JSON

- `serializeGameState(state)` → string. `parseGameState(text)` → state.
- `validateGameState(value)` checks any object (for example from Convex) and
  returns a typed copy.
- Bad input throws `EngineError` with a `code` and a `path` such as
  `state.board.points[3].white`. Unknown fields are rejected.
  - `INVALID_JSON`, `UNSUPPORTED_SCHEMA_VERSION`, `INVALID_STATE`;
  - for `state.rules`: `INVALID_RULES`, `RULES_CONFLICT`, `UNKNOWN_PRESET`;
  - from a variant: `ILLEGAL_TURN`, and `NOT_SUPPORTED` for a flag that is
    not built yet;
  - from the match and turn flow: `ILLEGAL_ACTION` (the game or match is
    over, wrong player, wrong phase) and `ILLEGAL_MOVE` (a checker move
    that is not a legal next move).
- Change the shape of `GameState` → bump `GAME_STATE_SCHEMA_VERSION`.
- **Version 1 states are upgraded.** In version 1, `rules` was
  `{ id, version }`. The parser swaps it for the full preset with that id
  (`'asodio'` → `'asodio.kafeneio'`). An unknown id fails with
  `UNKNOWN_PRESET`. A version newer than the preset fails with
  `INVALID_STATE`. The result is always version 2.

## Rules as data

`RuleSet` holds every flag from the "House-rule variants (flags)" tables in
`docs/rules/`. It is plain JSON. Field names are the flag names from the
docs (one exception: Asodio's `scoring` is `scoring.method`). Every field
has a doc comment that names the doc and the flag.

```ts
interface RuleSet {
  presetId: PresetId; // the preset it starts from, e.g. 'asodio.kafeneio'
  version: number; // the preset's version
  board: { startPosition };
  movement: { direction; higherDieRule; runnerRule; runnerTarget };
  capture: { captureMode; noHitAndRunInHome; intermediatePinBlocks; nominateBlot };
  entry: {
    firstEntryGate;
    firstEntryGateRolls;
    mustEnterAllFirst;
    moveWhileLoading;
    barEntryNeedsSpecial;
  };
  quarters: { quarterGathering; quarterLock; moveInsideFrozenQuarter };
  specialRolls: { aceDeuceChoosesDouble; complementaryDoubles };
  extraRolls: { aceDeuceExtraRoll; doublesGiveExtraRoll };
  bearOff: { exactBearOff; bearOffWhilePinned };
  primes: {
    primeRulesOff;
    p1NoPrimeOwnStart;
    p2NoPrimeFrontOfMother;
    p2Window;
    p3MustLeaveMove;
    p3Priority;
    noPrimeOwnHome;
    primeCheckTiming;
  };
  mother: { motherRule; motherCheckTiming; mutualMotherPin };
  scoring: { method; backgammonScores3; doublingCube; deadlock };
  match: {
    targetPoints;
    rotation;
    openingRoll;
    nextGameStarter;
    afterDrawStarter;
    rematchStarter;
  };
}
```

- Every group is in every `RuleSet`. A flag a game does not use keeps its
  neutral value (off, or the shared default).
- `captureMode` is `'hit'` (Portes), `'pin'` (Plakoto, Asodio kafeneio) or
  `'none'` (Fevga: one checker owns a point).
- `startPosition` is `'portes'` (2/5/3/5), `'allOnOwn24'` (Plakoto, Fevga,
  Asodio "opponentAcePoint") or `'offBoard'` (Asodio).
- Three fields are in the doc text, not in a flag table:
  `movement.direction`, `match.rematchStarter` (`tavli-match.md`) and
  `specialRolls.aceDeuceChoosesDouble` (`asodio.md`, 1-2 rule and A3).
- `RULE_SCHEMA` lists the allowed values of every field.

### Presets

| Preset                      | What it is                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `portes`                    | Portes. Hits, bar, mono 1 / diplo 2. A Portes-only match (`rotation: ['portes']`).                                                               |
| `tavli`                     | A Tavli match: Portes → Plakoto → Fevga (federation rotation). Each game uses its own default preset with these match flags.                     |
| `plakoto`                   | Plakoto. Pins. Mother rule `offerConcede` (owner).                                                                                               |
| `plakoto.federation`        | Plakoto with the ΕΟΠΤ mother rule (`motherRule: 'federation'`).                                                                                  |
| `fevga`                     | Fevga. Parallel, runner rule (`passMother`), prime rules P1/P2/P3.                                                                               |
| `asodio.kafeneio`           | The owner's Asodio (default): load all 15 first, quarter lock, pins, no extra rolls (A1–A5).                                                     |
| `asodio.aceyDeuceyGreek`    | Greek folk Acey-Deucey: hits; a 1-2 gives a chosen double and a new roll; doubles give a new roll; hit checkers need a 1-2 or a double to enter. |
| `asodio.aceyDeuceyAmerican` | American Acey-Deucey: hits, any die enters, a 1-2 gives a chosen double and a new roll, 1 point per checker left.                                |

- Each standard game has a default preset: `DEFAULT_PRESET_BY_GAME`.
- Portes and Fevga have no `.federation` preset: our defaults already follow
  ΕΟΠΤ there.
- The Asodio presets use `match.rotation: ['asodio']`, because Asodio is not
  in the standard rotation.
- `portes` is a single-game match (PM, #24). `tavli` is the match preset
  with the rotation (for #51). Portes, Plakoto and Fevga are all built, so a
  `tavli` match plays every game of the rotation.
- The two Acey-Deucey presets turn the owner's army rules off
  (`mustEnterAllFirst`, `quarterGathering`, `quarterLock`).
- `getPreset(id)` returns the frozen preset. Bump its `version` in
  `presets.ts` when you change any value.

### resolveRules

```ts
const rules = resolveRules('plakoto', { mother: { motherRule: 'instant' } });
const state = variant.initialState({ startingPlayer: 'white', rules });
```

`resolveRules(presetId, overrides)` copies the preset, merges the overrides
group by group (lists such as `rotation` are replaced, not merged), checks the
result and returns a fresh `RuleSet`. `presetId` and `version` cannot be
overridden. Errors:

- `UNKNOWN_PRESET`: no preset with this id.
- `INVALID_RULES`: unknown key, wrong type, value not allowed.
- `RULES_CONFLICT`: flags that cannot work together (below).

`validateRules(value)` runs the same checks on any object.
`serializeRules` / `parseRules` turn a `RuleSet` into JSON text and back.

### Combination rules

`validateRules` enforces each rule in `RULE_CONSTRAINTS`. The error path
points at the flag to change, and the message ends with the rule id. A flag
that only means something with another setting must stay neutral without it.

| Id                              | Rule                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `hitAndRunNeedsHit`             | `noHitAndRunInHome` needs `captureMode: 'hit'`.                                                                          |
| `nominateBlotNeedsHit`          | `nominateBlot` needs `captureMode: 'hit'`.                                                                               |
| `barEntryNeedsHit`              | `barEntryNeedsSpecial` needs `captureMode: 'hit'`. Pinned checkers never go to the bar.                                  |
| `intermediatePinNeedsPin`       | `intermediatePinBlocks` needs `captureMode: 'pin'`.                                                                      |
| `bearOffWhilePinnedNeedsPin`    | `bearOffWhilePinned` needs `captureMode: 'pin'`.                                                                         |
| `entryGateNeedsOffBoard`        | `firstEntryGate` needs `startPosition: 'offBoard'`.                                                                      |
| `enterAllFirstNeedsOffBoard`    | `mustEnterAllFirst` needs `startPosition: 'offBoard'`.                                                                   |
| `loadingLockNeedsEnterAllFirst` | `moveWhileLoading: false` needs `mustEnterAllFirst: true`.                                                               |
| `quarterLockNeedsGathering`     | `quarterLock` needs `quarterGathering` (the lock is the strict form).                                                    |
| `quarterLockNeedsEnterAllFirst` | `quarterLock` with `offBoard` needs `mustEnterAllFirst`: the starting quarter is locked until all 15 are in (phase 2.1). |
| `frozenMoveNeedsLock`           | `moveInsideFrozenQuarter` needs `quarterLock`.                                                                           |
| `runnerNeedsParallel`           | `runnerRule` needs `direction: 'parallel'`.                                                                              |
| `runnerNeedsStartStack`         | `runnerRule` needs `startPosition: 'allOnOwn24'`.                                                                        |
| `runnerBlocksGathering`         | `runnerRule` and `quarterGathering` cannot both be on: the runner must leave the quarter alone.                          |
| `p2NeedsParallel`               | `p2NoPrimeFrontOfMother` needs `direction: 'parallel'` (its window is defined for Fevga).                                |
| `primeRulesOffMeansOff`         | `primeRulesOff` needs P1, P2, P3 and `noPrimeOwnHome` all `false`.                                                       |
| `motherNeedsPin`                | `motherRule` other than `'none'` needs `captureMode: 'pin'`.                                                             |
| `motherNeedsStartStack`         | `motherRule` other than `'none'` needs `startPosition: 'allOnOwn24'`.                                                    |
| `backgammonNeedsTavliScoring`   | `backgammonScores3` needs `scoring.method: 'tavli'`.                                                                     |

Allowed on purpose: hitting with the Asodio quarter lock, `quarterLock`
without `mustEnterAllFirst` when nothing starts off the board, and prime
rules P1/P3 in contrary games.

### Adding or changing a flag

1. Change the flag table in `docs/rules/<game>.md`.
2. Add the field to its group in `rules.ts` (type, doc comment and
   `RULE_SCHEMA`). Typecheck fails until both match.
3. Set it in `NEUTRAL` and in the presets (`presets.ts`). Bump `version` of
   each preset you change.
4. Add a `RULE_CONSTRAINTS` entry if it only works with other flags, and a
   test case for it in `rules.test.ts`.
5. `rules-docs.test.ts` reads the flag tables from the docs and fails if a
   preset does not match them.

## How a variant plugs in

A variant is a plain object that implements `Variant`:

```ts
const portes: Variant = {
  id: 'portes',
  direction: 'contrary',
  initialState({ startingPlayer, rules }) { ... }, // rules: a RuleSet, default preset if left out
  legalTurns(state, dice) { ... },   // every legal full play; a pass is [{ moves: [] }]
  nextMoves(state, dice, played) { ... }, // single moves that keep the turn finishable
  applyTurn(state, turn) { ... },    // returns a new state; throws ILLEGAL_TURN
  isGameOver(state) { ... },
  result(state) { ... },             // { winner, points, reason } or null
  resignResult(state, player) { ... }, // optional: own scoring for a resignation
  prompt(state) { ... },             // optional: a question, e.g. "resign or play on"
  answerPrompt(state, player, choice) { ... }, // optional, with prompt
};

const variant = getVariant(VARIANT_REGISTRY, state.variant); // the built-in variants
const custom = createVariantRegistry([portes, myTestVariant]); // or build your own
```

The UI, the bot and the server only use this interface. A typical loop:

```ts
let state = variant.initialState({ startingPlayer: 'white' });
const dice = rollDice(rng);
state = { ...state, dice };
const turn = pick(variant.legalTurns(state, dice));
state = variant.applyTurn(state, turn);
```

`src/testing/race-variant.ts` is a tiny fake variant used only in tests. It
shows the whole flow.

**Why `nextMoves` and not "a prefix of `legalTurns`".** `legalTurns` lists
one play per end position. With 6-1, it lists `13/7 7/6` but not
`13/12 12/6`. A player who moves the 1 first must still be allowed to. So
the turn flow asks the variant: "after these moves, which single moves can
still finish a legal play?" The rule is the same as "a prefix of some legal
turn", for any order of the moves. A move that would leave part of the roll
unplayable (when another order plays all of it) is never listed.

A variant checks the `RuleSet` it gets with `validateRules`. It throws
`RULES_CONFLICT` for rules it cannot play (for example `direction:
'parallel'` in a contrary game), and `NOT_SUPPORTED` for a flag of its own
game that is not built yet. It never ignores a flag in silence.

`VARIANT_REGISTRY` holds `BUILT_IN_VARIANTS`: `portes`, `plakoto`, `fevga`
and `asodio`.

## Portes

Code: `src/variants/portes/`. Rules: `docs/rules/portes.md` and
`docs/rules/tavli-match.md`.

- `initialState`: 2/5/3/5 on own 24/13/8/6 for both players
  (`PORTES_START`), `dice: null`, `turnNumber: 1`.
- `legalTurns(state, dice)`: every legal full play. Doubles give four moves.
  Bar checkers enter first. No landing on a door (2+ opponent checkers).
  Landing on a blot hits it to the bar. Bearing off needs all 15 home; a die
  bears off from its own point, or from the highest point when the die is
  larger; otherwise it must move a checker inside home. The middle point of
  a combined move must be open too, because the search plays one die at a
  time. Then the "use as much of the roll as possible" rules: most dice
  first, then the higher die (`higherDieRule`). No legal move gives one pass
  turn (`moves: []`). On a finished game it throws `ILLEGAL_TURN`.
- **One play per end position.** Plays that end in the same position are
  listed once. We keep the first one the search finds: higher die first,
  then the bar, then own points from 24 down to 1. For a double the moves
  are listed from the back checker to the front.
- `applyTurn`: plays the moves one by one and checks each one (die left,
  origin, landing point, hit mark). A turn that uses every die is then legal.
  A shorter turn is checked against the full search (most dice, higher die,
  end position). So any legal order of the moves is accepted, not only the
  listed one. Bad turns throw `ILLEGAL_TURN`.
- `nextMoves(state, dice, played)`: plays `played` with the same checks as
  `applyTurn`, then tries every single move with a die that is left. A
  move is kept when the rest of the dice can still finish a legal play:
  the search from the new position must use exactly the dice still needed,
  and (when not all dice can be used) end in an end position of the full
  search. With only one die playable it must be the higher die.
  `portes-next-moves.test.ts` walks every move order in random positions
  and checks that they reach exactly the end positions of `legalTurns`.
- `result`: the winner bore off 15. Mono = 1 if the loser bore off at least
  one checker, else diplo = 2. A "backgammon" (loser also on the bar or in
  the winner's home) is 2, or 3 with `backgammonScores3`. The match adds
  up these points (see "Match").

Flags Portes reads: `movement.higherDieRule`, `capture.noHitAndRunInHome`
(a checker that hits in its own home, points 1–6, may not move again this
turn; the meaning is the proposal in `portes.md`), and
`scoring.backgammonScores3`. `match.*` is for the match (`match.ts`) and
the turn flow (#25). `scoring.doublingCube: true` throws `NOT_SUPPORTED`. Every other
flag must keep the `portes` preset value, or the variant throws
`RULES_CONFLICT` with the path of the flag.

### How the search stays fast

- It works on a private array (`position.ts`), not on `BoardState`, always
  from the mover's side.
- It remembers (position, dice left) pairs it has seen, so a double never
  searches the same middle position twice. Keys are Zobrist hashes kept up
  to date in the array (`PositionMap`); equal hashes are checked by
  comparing the arrays, so the map is exact.
- For a double, each move starts on the same point as the move before it,
  or a lower one. Every legal play can be put in this order with the same
  end position, so nothing is lost, and 4! orders become one.
- Numbers on the dev container (Node 22): median 0.013 ms per position, the
  worst of 2,000 random positions about 1 ms; 15 checkers on 15 points with
  4-4 (1,882 plays) about 3.5 ms. `portes-perf.test.ts` checks median < 5 ms
  and worst < 50 ms. It times each position 3 times and keeps the best, so
  a busy CI machine that pauses the test once does not fail it.
- Plain arrays of small integers: V8 copies `array.slice()` far faster than
  a typed array. That alone made the search 3 times faster.

### Tests

- `portes.test.ts`: one test per numbered edge case in `portes.md` and the
  movement, dice and bear-off cases (#9–#17) in `tavli-match.md`, named like
  `portes.md #7: ...`. Also flags, rules errors and `applyTurn` errors.
- `portes-edge-cases.test.ts`: checks that the index below lists every
  numbered edge case of `portes.md`, and that each listed file has a test
  named `portes.md #N`. A new case in the doc fails CI until it has a test.
- `portes-reference.test.ts`: a slow, simple generator (every order, no
  pruning) must find the same end positions in random positions.
- `portes-fuzz.test.ts` (#26): 10,000 random games to the end with a seeded
  RNG (game `n` uses seed `n`). After every move: 15 checkers per player,
  no point with both colors, and pip counts that only rise by a hit (the
  mover loses exactly the pips moved; the opponent gains exactly what a
  hit checker loses). After every turn: `applyTurn` gives the same board
  as the single moves. Most plays are a random walk of legal single moves
  by the oracle (below), because listing every play with `legalTurns` for
  900,000 turns is too slow for CI. When the walk gets stuck before all
  dice are used, and on one turn in 32 anyway, the play is a random pick
  from `legalTurns`, and each of its moves is checked against the oracle.
  About 9 s on the dev container. The hot loop uses plain `if` checks, not
  `expect`: `expect` is far too slow for millions of calls.
- Test helpers (not exported):
  - `src/testing/position-notation.ts` reads and writes positions like
    `w: 24x2 13x5 8x3 6x5 ; b: 6x15` (own numbering per side; a missing
    `off` means "the rest are off") and turns like `13/8* 8/5` or `4/0:6`.
    `portesState(text, { toMove, dice, rules, turnNumber })` gives a full
    `GameState`, so a test is one line:
    `portes.legalTurns(portesState('w: bar 6x14 ; b: 1x15'), [3, 3])`.
  - `src/testing/portes-oracle.ts`: a slow, simple rules model with no code
    shared with the variant: single moves (`canStep`, `step`) and all end
    positions of a roll (`referenceFinals`).
  - `src/testing/random-positions.ts` makes random positions.

### Portes edge-case index

Where each numbered edge case in `docs/rules/portes.md` is tested. Paths are
from `src/`. `portes-edge-cases.test.ts` reads this table.

| Case | Rule                                                       | Test file                                                                        |
| ---- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1    | Start: 15 each on 24/13/8/6 = 2/5/3/5                      | `variants/portes/portes.test.ts`                                                 |
| 2    | No landing on an opponent door                             | `variants/portes/portes.test.ts`                                                 |
| 3    | Landing on a blot hits it to the bar                       | `variants/portes/portes.test.ts`                                                 |
| 4    | Bar checker cannot enter → the whole turn is lost          | `variants/portes/portes.test.ts`                                                 |
| 5    | Two on the bar, 6-6: both enter on 19, then any sixes      | `variants/portes/portes.test.ts`                                                 |
| 6    | Two on the bar, one die enters → enter one, lose the other | `variants/portes/portes.test.ts`                                                 |
| 7    | Opponent holds 19–24 → pass every roll                     | `variants/portes/portes.test.ts`                                                 |
| 8    | No combined move through a door (6-1: 13/7/6)              | `variants/portes/portes.test.ts`                                                 |
| 9    | Hit and continue: 13/8\*/5 with 5-3                        | `variants/portes/portes.test.ts`                                                 |
| 10   | No bearing off with a checker on the bar or outside home   | `variants/portes/portes.test.ts`                                                 |
| 11   | Hit while bearing off → re-enter and come home first       | `variants/portes/portes.test.ts`                                                 |
| 12   | Loser off 0, none on bar or in winner's home → 2           | `variants/portes/portes.test.ts`                                                 |
| 13   | Loser off 0, a checker on the bar → 2 (3 with flag)        | `variants/portes/portes.test.ts`                                                 |
| 14   | Loser off 1+ → 1, even with a checker on the bar           | `variants/portes/portes.test.ts`                                                 |
| 15   | Game 1 opening roll is never a double                      | `flow/game-flow.test.ts` (the roll), `variants/portes/portes.test.ts` (the flag) |
| 16   | Doubles: 4 moves; enter and keep moving                    | `variants/portes/portes.test.ts`                                                 |

## Plakoto

Code: `src/variants/plakoto/`. Rules: `docs/rules/plakoto.md` and
`docs/rules/tavli-match.md`.

- `initialState`: 15 checkers on own 24 for both players (`PLAKOTO_START`).
  Default rules: the `plakoto` preset.
- Moves: no bar and no hits. Landing on one free opponent checker pins it
  (`capture: 'pin'`, written `13/8*`). A point is closed when it holds 2+
  opponent checkers, or when the opponent pins our checker there. We may
  land on our own pin (the stack grows). A pinned checker cannot move. When
  the last pinner leaves, the pin ends. No bearing off while one of our
  checkers is pinned (`bearOffWhilePinned`). The "use as much of the roll
  as possible" and higher-die rules work as in Portes.
- `capture.intermediatePinBlocks: true` (edge case 9): a checker that pins
  during a turn may not move on in the same turn, so a combined move
  through a lone opponent checker is illegal. A second checker on that pin
  may still move on (the pin stays).
- The search is the Portes one (`moves.ts`): one die at a time, one play
  per end position, (position, dice left) pruning for doubles. It moves
  checkers in place and takes them back, and copies a position only when it
  keeps it. Its map keys are small integers (30-bit hashes). It takes about
  1.3 times the Portes time per position.
- `resignResult` is not needed: the shared rule (`resignGame`) applies.

### Mother rule

Code: `mother.ts`. A player's mother is pinned when their lone checker on
own 24 has opponent checkers on top. The result is read from the board.

| `motherRule`             | One mother pinned                                                         | Both mothers pinned |
| ------------------------ | ------------------------------------------------------------------------- | ------------------- |
| `offerConcede` (default) | The pinned player is asked "resign or play on" (`Variant.prompt`).        | Draw, 0 points      |
| `federation`             | The pinner wins 2 (`motherPinned`) once the pinner has nothing on own 24. | Draw, 0 points      |
| `instant`                | The pinner wins 2 at once.                                                | Cannot happen       |
| `none`                   | Nothing special.                                                          | Nothing special     |

- `motherCheckTiming: "afterEachMove"` (default): the board is checked
  after every single move. When the game ends (a federation or instant
  win, or a draw), the turn stops at that move; the rest of the roll is not
  played. The moves so far must still be the start of a play that the
  normal rules allow. `legalTurns` then lists the cut plays (it tries every
  order), `nextMoves` returns `[]` after the move that ends the game, and
  the turn flow goes to `awaiting-confirm`.
- `"endOfTurn"`: the board is checked after the whole turn.
- `offerConcede` asks its question when the turn is over, with both
  timings, because the flow asks only between turns. The answer cannot
  change the rest of the turn, so the outcome is the same as with a
  question in the middle of the turn. With `"afterEachMove"`, a mother that
  was pinned after any move of the turn is asked about, even if the pin
  ended later in that turn (the pinner bore off). With `"endOfTurn"`, only
  a mother that is still pinned at the end is asked about.
- `offerConcede` keeps `{ offer, playOn, conceded }` in
  `state.variantData` (`null` when there is nothing to keep). `offer` is
  the player who must answer now: `prompt` returns `{ player, kind:
'motherPinned', choices: ['resign', 'playOn'] }`, and `legalTurns`,
  `nextMoves` and `applyTurn` throw `ILLEGAL_TURN` until the answer comes.
  `answerPrompt(state, player, 'resign')` ends the game: the opponent wins
  2 (`reason: 'resigned'`). `'playOn'` adds the player to `playOn`; that
  player is not asked again in this game.
- `mutualMotherPin: "replay"` throws `NOT_SUPPORTED` with `offerConcede`
  and `federation`.
- With `none`, two pinned mothers can never move again, so that game
  cannot end (an open question for the rules doc).

Flags Plakoto reads: `movement.higherDieRule`,
`capture.intermediatePinBlocks`, `bearOff.bearOffWhilePinned` and the three
`mother.*` flags. `match.*` is for the match. Every other flag must keep
the `plakoto` preset value, or the variant throws `RULES_CONFLICT`.

### Tests

- `plakoto.test.ts`: one test per numbered edge case in `plakoto.md`, named
  `plakoto.md #N: ...`. Also flags, rules errors and `applyTurn` errors.
- `plakoto-edge-cases.test.ts`: checks that the index below lists every
  numbered edge case of `plakoto.md`, and that each listed file has a test
  named `plakoto.md #N` (as for Portes).
- `plakoto-mother.test.ts`: `offerConcede` (question, answers, timing,
  draw), the mother rule through the turn flow, a real Plakoto game as game
  2 of a Tavli match, and random Plakoto matches through the flow that
  replay to the same JSON.
- `plakoto-reference.test.ts`: the oracle (below) and the `nextMoves` walk
  must find the same end positions as `legalTurns` in random positions, for
  each mother rule.
- `plakoto-fuzz.test.ts` (#98): 1,000 random games with every mother rule
  and a mix of flags, built like the Portes fuzz test. After every move: 15
  checkers per player, two colors on a point only as a pin, a pinned
  checker never moves, the mover's pips drop by exactly the pips moved and
  the opponent's never change. After every turn: `applyTurn` gives the same
  board as the single moves, and a play is shorter than the others only
  when the mother rule ended the game. Most plays are a random walk by the
  oracle; stuck turns and one turn in 32 use `legalTurns`. About 1.5 s.
  The engine tests run on one worker on a 2-core CI runner, so the game
  counts are kept small; raise `GAMES` for a longer local run.
- Test helpers (not exported):
  - `src/testing/plakoto-notation.ts` marks a pinned checker with `!`:
    `w: 24x14 8 ; b: 24x14 17!` means Black's 17 (White's 8) is pinned
    under White. `*` in a move is a pin: `13/8*`.
  - `src/testing/plakoto-oracle.ts`: a slow, simple Plakoto rules model
    with no code shared with the variant: single moves (`canStep`, `step`),
    the mid-turn mother end (`endsMidTurn`) and all end positions of a roll
    (`referenceFinals`).

### Plakoto edge-case index

Where each numbered edge case in `docs/rules/plakoto.md` is tested. Paths
are from `src/`. `plakoto-edge-cases.test.ts` reads this table.

| Case | Rule                                                    | Test file                          |
| ---- | ------------------------------------------------------- | ---------------------------------- |
| 1    | Start: 15 on own 24 each; first moves from 24           | `variants/plakoto/plakoto.test.ts` |
| 2    | Landing on a single opponent checker pins it            | `variants/plakoto/plakoto.test.ts` |
| 3    | No landing on 2+ opponent checkers                      | `variants/plakoto/plakoto.test.ts` |
| 4    | No landing where the opponent pins our checker          | `variants/plakoto/plakoto.test.ts` |
| 5    | Landing on our own pin is legal                         | `variants/plakoto/plakoto.test.ts` |
| 6    | Pinner leaves → the pinned checker moves next turn      | `variants/plakoto/plakoto.test.ts` |
| 7    | Two pinners: one leaves → still pinned; both → free     | `variants/plakoto/plakoto.test.ts` |
| 8    | A pinned checker does not count for the higher-die rule | `variants/plakoto/plakoto.test.ts` |
| 9    | 6-5 through a lone checker; `intermediatePinBlocks`     | `variants/plakoto/plakoto.test.ts` |
| 10   | Mother pinned, pinner's 24 empty → +2 at once, mid-turn | `variants/plakoto/plakoto.test.ts` |
| 11   | Mother pinned, pinner still on own 24 → game goes on    | `variants/plakoto/plakoto.test.ts` |
| 12   | Pinner then leaves own 24 → +2 at that moment           | `variants/plakoto/plakoto.test.ts` |
| 13   | Both mothers pinned → draw                              | `variants/plakoto/plakoto.test.ts` |
| 14   | The pinner leaves → mother free                         | `variants/plakoto/plakoto.test.ts` |
| 15   | 2+ on own 24 → the mother cannot be pinned              | `variants/plakoto/plakoto.test.ts` |
| 16   | All home, one pinned → no bearing off                   | `variants/plakoto/plakoto.test.ts` |
| 17   | Pinned during bear-off → bearing off stops              | `variants/plakoto/plakoto.test.ts` |
| 18   | Last checker off, loser has 0 off → 2                   | `variants/plakoto/plakoto.test.ts` |
| 19   | No legal move → pass                                    | `variants/plakoto/plakoto.test.ts` |
| 20   | `motherRule="instant"` → +2 at once; no draw            | `variants/plakoto/plakoto.test.ts` |

## Fevga

Code: `src/variants/fevga/`. Rules: `docs/rules/fevga.md` and
`docs/rules/tavli-match.md`.

- `initialState`: all 15 on own point 24 for both players (`FEVGA_START`).
  The movement is parallel, so White's 24 is Black's 12 (diagonal corners).
- Movement: a checker moves from `p` to `p - d` and may never land on a
  point with any opponent checker. There is no hitting and no bar. The
  middle points of a combined move must be free too, because the search
  plays one die at a time. Bearing off follows the shared rules.
- **Runner rule** (`movement.runnerRule`, default on): while a checker has
  left 24 but no checker has reached the target, the other checkers stay on 24. The target is own point 11 or lower (`runnerTarget: "passMother"`,
  the owner's choice from the ΕΟΠΤ text) or 12 or lower
  (`"reachQuarter"`). The board tells us this, so the state stores
  nothing. The rule ends in the middle of a turn: once the runner reaches
  the target, the rest of the roll may move any checker. If the runner
  cannot move, the roll is lost.
- **Prime rules** (`primes.*`), in the "Order of checks" of `fevga.md`:
  1. The search keeps every position it reaches as a candidate: full plays,
     shorter plays and "no move".
  2. P1 and P2 drop every candidate that ends holding all of own 19–24
     (P1) or own 6–11 (P2; 7–12 with `p2Window: "7-12"`). So a shorter
     play can become the longest legal one (edge case 12).
  3. Most dice, then the higher die rule (`higherDieRule`).
  4. P3: if some play leaves the opponent a single-die move (for any die
     1–6, with the opponent's runner rule and bearing off), drop the plays
     that do not. If none does, any play is legal and the opponent passes.
     With `p3Priority: "beforeDiceRule"`, P3 runs before step 3.

  `primeRulesOff` turns P1, P2 and P3 off.

- `legalTurns` lists one play per end position, higher die first, back
  checkers first. `applyTurn` accepts any legal order. A turn that uses
  every die, breaks no prime ban and leaves the opponent a move is legal at
  once; any other turn is checked against the full search.
  `nextMoves` keeps a move only when the rest of the dice can still end in
  a legal play (so it never offers a move that ends in a banned prime or an
  avoidable full block).
- `result`: the winner bore off 15. Single = 1 if the loser bore off at
  least one checker, else double = 2. Resigning uses the shared rule.
- Not built yet: `noPrimeOwnHome: true` and `primeCheckTiming:
"afterEachMove"` throw `NOT_SUPPORTED`. `fevga.md` does not say where
  they go in the order of checks. Flags of other games throw
  `RULES_CONFLICT`, like in Portes.
- The search works on a private array (`position.ts`) with a Zobrist hash,
  like Portes. It remembers (position, dice left) pairs it has seen. It
  cannot use the Portes "doubles in order" trick: in Fevga, moving the
  runner can free the checkers on 24. On the dev container (Node 22): about
  0.02 ms per position on average; 15 checkers on 15 points with a double
  (about 1,100 plays) 2 to 6 ms.

Tests:

- `fevga.test.ts`: one test per numbered edge case in `fevga.md`, named
  like `fevga.md #12: ...`, the shared dice and bear-off cases as they play
  in Fevga, every flag and the errors. `rules-docs.test.ts` fails if an
  edge case in `fevga.md` has no test with its number.
- `fevga-reference.test.ts`: a slow, simple generator that follows the
  order of checks step by step must find the same end positions, also in
  random near-block positions where P3 decides.
- `fevga-next-moves.test.ts`: every move order that `nextMoves` allows
  reaches exactly the end positions of `legalTurns`.
- `fevga-fuzz.test.ts`: 2,000 random games (and 100 per flag setting) to
  the end. After every move: 15 checkers each, never two colors on a
  point, pip count down by the die. After every turn: no P1 or P2 prime,
  the runner rule, and P3 (a full block only when every play blocks).
- `fevga-perf.test.ts`: median < 5 ms and worst < 50 ms.
- Test helpers: `src/testing/fevga-notation.ts` (the position notation for
  parallel movement: `fevgaState('w: 24x14 13 ; b: 24x15')`) and
  `src/testing/random-fevga-positions.ts`.

## Asodio

Code: `src/variants/asodio/`. Rules: `docs/rules/asodio.md` and
`docs/rules/tavli-match.md`. Default rules: the owner version,
`asodio.kafeneio`.

- `initialState`: all 15 checkers outside for both players
  (`ASODIO_START`), or all 15 on own 24 with `startPosition: "allOnOwn24"`
  (the doc's `"opponentAcePoint"`, `ASODIO_STACK_START`).
- Entering: a die `d` enters one checker (from outside or the bar) on own
  point `25 - d` (spot `d`). A double enters four on spot `d` (A1) because
  each of its four moves enters one. Moves from outside are written
  `from: 'outside'`, from the bar `from: 'bar'` (both `25/…` in notation).
- The roll gates, judged on the whole roll: `firstEntryGate` (all 15 still
  outside: only a 1-2 or a double moves; `"doubleOnly"`: only a double) and
  `barEntryNeedsSpecial` (a hit checker waits for a 1-2 or a double). A
  gated roll is a pass.
- The single-move rules, checked after every move (so a lock that ends in
  the middle of a roll frees the rest of it; open question Q26):
  1. Hit checkers enter before anything else moves. Checkers that never
     entered have no such priority.
  2. A pinned checker cannot move.
  3. While checkers are outside: `moveWhileLoading: false` (owner, A2) lets
     only entries move; `mustEnterAllFirst` keeps every checker in the
     starting quarter (own 19–24).
  4. `quarterLock` (owner): the rear quarter is the quarter of the last
     checker (outside or bar count as the starting quarter). A checker in
     front of it is frozen; with `moveInsideFrozenQuarter` it may move
     inside its own quarter. So a pinned lagging checker freezes the whole
     army and that player passes (A6).
  5. Landing: not on 2+ opponent checkers. `captureMode: "pin"` (owner):
     one free opponent checker is pinned, and a point where the opponent
     pins our checker is closed; `"hit"`: the checker goes to the bar.
  6. Bearing off: nothing outside or on the bar, all home, and (pins) none
     pinned unless `bearOffWhilePinned` (open question Q25). `exactBearOff`:
     only the exact die bears off.
- Then "use as much of the roll as possible" and the higher-die rule, as in
  Portes. `legalTurns` lists one play per end position; `applyTurn` accepts
  any legal order; `nextMoves` keeps a move only when the play can still
  be finished.
- **Roll chains** (`roll-chain.ts`). `applyTurn` keeps the same player to
  move when the roll gives another roll: a fully played double with
  `doublesGiveExtraRoll`; a 1-2 with both dice played and
  `aceDeuceExtraRoll`. With `aceDeuceChoosesDouble`, a 1-2 with both dice
  played asks a question: `prompt` returns `{ kind: 'chooseDouble',
choices: ['1', …, '6'] }` (`variantData: { chooseDouble: true }`).
  `answerPrompt(state, player, '4')` sets `dice: [4, 4]` and `variantData:
{ chosenDouble: 4 }`; the turn flow then starts that turn at once. The
  chosen double gives a new roll (with `aceDeuceExtraRoll`) only when all
  four moves were played. The owner version has no chain (A3).
- `result`: the winner bore off 15. `scoring.method`: `"tavli"` 1, or 2
  when the loser bore off none (A4); `"perChecker"` 1 per checker the loser
  has not borne off; `"singleOnly"` 1. **Deadlock** (A5): when neither
  player has a single legal move with any die, every roll passes forever,
  so the game is a draw (`reason: 'deadlock'`, 0 points). Resigning uses
  the shared rule (`pointsForLoss` follows `scoring.method`).
- Not built yet (`NOT_SUPPORTED`): `nominateBlot`, `complementaryDoubles`,
  `quarterGathering` without `quarterLock` (open question Q27) and the
  doubling cube. Flags of other games throw `RULES_CONFLICT`, as do
  `captureMode: "none"` and `startPosition: "portes"`.
- A board that cannot happen under the rules (a bar checker with pins, a
  pin with hits, checkers outside without `"offBoard"`) throws
  `INVALID_STATE`.
- The search is the Plakoto one on a private array (`position.ts`) with a
  Zobrist hash, including the "doubles in order" trick: a move from a
  higher origin (bar, then outside, then own 24 down to 1) only ever
  makes more moves legal for lower ones, so every play can be put in that
  order (proof in `moves.ts`).

Tests:

- `asodio.test.ts`: one test per numbered edge case in `asodio.md`, named
  `asodio.md #N: ...`. Cases 1–13 (the research version) run with the
  Acey-Deucey presets whose flags they name; cases 14–19 with
  `asodio.kafeneio`. Also the deadlock, every flag, the errors, and the
  turn flow (chosen double, a gated roll that passes, random matches that
  replay to the same JSON). `rules-docs.test.ts` fails if a case in the doc
  (also the owner cases under "Presets") has no test.
- `asodio-reference.test.ts`: in random positions of every preset and a
  mix of flags, `legalTurns` must find the same end positions as the slow
  rules model `src/testing/asodio-oracle.ts`, and the `nextMoves` walk
  must reach exactly those positions.
- `asodio-fuzz.test.ts`: 300 random owner-version games and 40 per flag
  mix, checked after every move (15 checkers each, stacking, pins never
  move, pip counts, the army rules, every move against the oracle) and
  after every turn (`applyTurn` board, the roll chain). About 3 s. In
  random play most owner-version games end in a deadlock (open question
  Q28).
- Test helpers: `src/testing/asodio-notation.ts` (`out`, `bar` and `!` for
  pins: `asodioState('w: 24 23 outx13 ; b: outx15')`, turns like
  `out/22 13/8*`) and `src/testing/random-asodio.ts`.

## Match

Code: `src/match.ts`. Rules: `docs/rules/tavli-match.md` ("Who starts later
games", "Winning & scoring", "Match format").

```ts
interface Match {
  schemaVersion: 1;
  rules: RuleSet; // rules.match holds the match flags
  targetPoints: number; // = rules.match.targetPoints (default 3)
  players: PerPlayer<string>; // names or ids from the app
  score: PerPlayer<number>; // = the sum of `games`
  games: GameRecord[]; // { variant, starter, winner, points, reason }
  rotationIndex: number; // = games.length % rotation.length
  nextStarter: PlayerId | null; // null = an opening roll decides
  status: 'in-progress' | 'finished';
  winner: PlayerId | null;
  resignedBy: PlayerId | null;
}
```

- `createMatch({ rules, targetPoints, players, starter })`. Every option has
  a default: the `portes` preset (a Portes-only match), its `targetPoints`
  (3), `white`/`black`, and an opening roll for game 1. Pass
  `getPreset('tavli')` for the rotation Portes → Plakoto → Fevga.
- `recordGameResult(match, result, { starter })` adds a finished game and
  returns the next match. Pass `starter` when an opening roll decided who
  started (`nextStarter` was `null`).
  - The match ends as soon as a score is ≥ `targetPoints`. Overshooting is
    fine (4 + 2 = 6 in a match to 5).
  - A draw (`winner: null`, 0 points) changes no score. The rotation moves
    on after every game, a draw too.
  - Next starter after a win: `nextGameStarter` (default the winner; or
    `alternate`, or `openingRoll` = `null`). After a draw:
    `afterDrawStarter` (default `openingRoll` = `null`).
- `resignGame(state, player)` → the `GameResult` for a resignation now: the
  opponent gets mono (1) if `player` has borne off a checker, else diplo
  (2). With `backgammonScores3`, 3 when `player` is also on the bar or in
  the opponent's home. Other `scoring.method` values work too
  (`pointsForLoss`). A variant can score it its own way with
  `resignResult`. Plakoto needs none: a player whose mother is pinned has
  borne off nothing, so the shared rule already gives 2.
- `resignMatch(match, player)` ends the match now. The opponent wins; the
  score stays as it is.
- `createRematch(match)`: same rules and players, score 0–0. With
  `rematchStarter: "lastGameWinner"` (default, owner rule) the winner of the
  last game starts with no opening roll. That is always the match winner.
- Rotation: `nextVariantId(match)` is the next game.
  `startNextGame(match, startingPlayer)` returns its start state. A game
  that is not built yet (today: Asodio, which is not in the `tavli` rotation)
  throws `UNKNOWN_VARIANT` with a clear message and the path of the
  rotation entry. `missingVariants(match)` lists them up front.
- `gameRules(match, variant)`: the game of `match.rules` uses those rules.
  The other games use their default preset with the same `match` group.
  With the `tavli` match preset, every game uses its default preset.
- `validateMatch(value)` checks a match from outside. Besides the shape, it
  checks that `score`, `rotationIndex`, `status`, `winner` and
  `nextStarter` fit the list of games. So the stored totals can never drift
  from the games. `serializeMatch` / `parseMatch` give JSON text.

Tests: `src/match.test.ts`, one test per match and scoring edge case in
`tavli-match.md` (#4–#8) and `portes.md` (#12–#14), named like
`tavli-match.md #7: ...`, plus every match flag, resign cases and the
validator. The opening-roll cases (#1–#3) belong to the turn flow (#25).

## Turn flow

Code: `src/flow/`. A pure reducer, no XState (the app may wrap it in
XState if it wants). Everything is plain JSON. Dice come from an `Rng` in
the context, never `Math.random`.

### One game: `GameFlow`

```
opening-roll → awaiting-roll → moving → awaiting-confirm → awaiting-roll … → game-over
```

```ts
interface GameFlow {
  phase: GamePhase; // the phases above, plus 'awaiting-answer'
  state: GameState; // at the start of the turn; state.dice = the roll
  starter: PlayerId | null; // null until the opening roll decides
  opening: OpeningRoll | null; // { white, black, ties }
  played: Move[]; // moves of this turn, not confirmed yet
  lastTurn: Turn | null; // the last finished turn, a pass too
  result: GameResult | null;
}
```

Actions (`player` is the player who acts):

| Action          | Phase            | What it does                                                                                                                                                                                                                                |
| --------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rollOpening`   | opening-roll     | One player rolls one die (`die` optional). A tie starts a new round. The higher die starts. `useOpeningDice` (default): the starter plays the two opening dice at once (phase `moving`). `rerollBoth`: the starter rolls (`awaiting-roll`). |
| `chooseStarter` | opening-roll     | Only with `chosenStarterRolls`: `player` starts and rolls.                                                                                                                                                                                  |
| `roll`          | awaiting-roll    | Rolls two dice (`dice` optional). No legal move → the turn passes by itself.                                                                                                                                                                |
| `move`          | moving           | One checker move: `{ from, to, die }`. Only a legal next move (`nextMoves`). With `autoConfirm: true` a complete turn ends at once.                                                                                                         |
| `undo`          | moving / confirm | Takes back the last move, down to the turn start.                                                                                                                                                                                           |
| `confirm`       | awaiting-confirm | Plays the turn. Only when the moves are a full legal play.                                                                                                                                                                                  |
| `answer`        | awaiting-answer  | Answers the variant's question (`Variant.prompt`).                                                                                                                                                                                          |
| `resign`        | any but opening  | Ends the game. The result is `resignGame` on the board at the start of the turn: moves not confirmed do not count.                                                                                                                          |
| `timeout`       | any but opening  | The player the game waits for (to move or to answer) ran out of time (online turn timers, #133). Scored like `resign`, with `reason: 'timeout'`. The flow has no clock: the server decides when time is up.                                 |

- `applyGameAction(flow, action, { rng, registry })` returns the next flow.
  Bad actions throw `ILLEGAL_ACTION` or `ILLEGAL_MOVE`.
- Dice: leave `die` / `dice` out and the flow rolls with `ctx.rng`. Fill
  them in to play dice rolled elsewhere (the server, a replay).
- Helpers for the UI, all computed: `legalNextMoves(flow)` (single moves
  grouped by source, each with `to`, `die` and `capture`),
  `remainingDice(flow)`, `canConfirm(flow)`, `canUndo(flow)`,
  `currentBoard(flow)` (the board with the played moves, via
  `applyMoveToBoard`) and `currentPrompt(flow)`.
- Variant questions: after every turn the flow calls `Variant.prompt`. If
  it returns a question, the phase is `awaiting-answer` until the player
  sends `answer`. The variant keeps the question in `state.variantData`
  (PM decision on #25). Plakoto uses it for "resign or play on", Asodio
  for the chosen double. When an answer sets `state.dice`, the flow starts
  that turn at once (`moving`, or a pass), with no roll.
- Extra rolls: the flow reads the player to move from the state that
  `applyTurn` returns, so a variant can give the same player another roll
  (Asodio).

### The match: `MatchFlow`

```ts
interface MatchFlow {
  schemaVersion: 1;
  match: Match; // score, games, next starter (see "Match")
  game: GameFlow; // the current game, or the last one
  log: FlowEvent[]; // log[0] = { type: 'start', rules, targetPoints, players, starter }
}
```

- `createMatchFlow(options)` takes the `createMatch` options. Game 1 starts
  at once.
- `applyMatchAction(flow, action, ctx)` takes every game action plus
  `nextGame` (after `game-over`) and `resignMatch`. When a game ends, its
  result goes into the match at once. `nextGame` starts the next game of
  the rotation with the starter from the match rules (winner of the last
  game; an opening roll after a draw). A game that is not built yet throws
  `UNKNOWN_VARIANT` and leaves the flow as it was.
- `matchPhase(flow)`: `playing`, `game-over` (between games) or
  `match-over`.
- `createRematchFlow(flow)`: a new flow for a rematch. The winner of the
  last game starts (`rematchStarter`).
- Event log: every action that worked is in `log`, with the dice that were
  rolled and the full move. `replay(log)` builds the exact same flow. A log
  without dice needs the same RNG: `replay(events, { seed })`. To load a
  flow from outside, replay its log: every event is checked again.

### Tests

- `game-flow.test.ts`: the opening-roll cases (`tavli-match.md` #1–#3,
  `portes.md` #15), every phase change, undo to the turn start, no confirm
  of an incomplete turn, the prefix rule, auto-pass (#13), auto-confirm,
  resign during a turn, the UI helpers and the prompt hook (with a fake
  variant).
- `match-flow.test.ts`: `tavli-match.md` #4–#6 through the flow (fake
  Plakoto and Fevga variants stand in for the real ones), match over,
  resign match, rematch, and random full matches with undos and
  resignations that replay to the same JSON, with and without dice in the
  log. `src/testing/random-flow.ts` picks the random actions.

## Not here yet

- Asodio `nominateBlot` and `complementaryDoubles` (throw `NOT_SUPPORTED`).
- A question in the middle of a turn. The flow asks `Variant.prompt` only
  after a turn, so Plakoto `offerConcede` with `motherCheckTiming:
"afterEachMove"` asks when the turn is over (see "Plakoto").
- Plakoto `mutualMotherPin: "replay"` (throws `NOT_SUPPORTED`).

## Commands

From the repo root: `pnpm test`, `pnpm typecheck`, `pnpm lint`.
