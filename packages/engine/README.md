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
  - for `state.rules`: `INVALID_RULES`, `RULES_CONFLICT`, `UNKNOWN_PRESET`.
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
| `portes`                    | Portes. Hits, bar, mono 1 / diplo 2.                                                                                                             |
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
  applyTurn(state, turn) { ... },    // returns a new state; throws ILLEGAL_TURN
  isGameOver(state) { ... },
  result(state) { ... },             // { winner, points, reason } or null
};

const registry = createVariantRegistry([portes, plakoto, fevga]);
const variant = getVariant(registry, state.variant);
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

A variant checks the `RuleSet` it gets with `validateRules`. It throws
`RULES_CONFLICT` for rules it cannot play (for example `direction:
'parallel'` in a contrary game).

## Not here yet

- Portes move generation (#23), scoring (#24) and the turn state machine
  with the opening roll and Asodio roll chains (#25). They will read their
  flags from `state.rules`. Today no code acts on the flags yet.

## Commands

From the repo root: `pnpm test`, `pnpm typecheck`, `pnpm lint`.
