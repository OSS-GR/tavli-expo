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
  - for `state.rules`: `INVALID_RULES`, `RULES_CONFLICT`, `UNKNOWN_PRESET`;
  - from a variant: `ILLEGAL_TURN`, and `NOT_SUPPORTED` for a flag that is
    not built yet;
  - from the match and turn flow: `ILLEGAL_ACTION` (the game or match is
    over, wrong player, wrong phase).
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
  with the rotation (for #51). Until Plakoto and Fevga exist, a `tavli`
  match fails at game 2 with `UNKNOWN_VARIANT`. That is expected.
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
  resignResult(state, player) { ... }, // optional: own scoring for a resignation
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

A variant checks the `RuleSet` it gets with `validateRules`. It throws
`RULES_CONFLICT` for rules it cannot play (for example `direction:
'parallel'` in a contrary game), and `NOT_SUPPORTED` for a flag of its own
game that is not built yet. It never ignores a flag in silence.

`VARIANT_REGISTRY` holds `BUILT_IN_VARIANTS`. Today that is only `portes`.

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
  and worst < 50 ms.
- Plain arrays of small integers: V8 copies `array.slice()` far faster than
  a typed array. That alone made the search 3 times faster.

### Tests

- `portes.test.ts`: one test per numbered edge case in `portes.md` and the
  movement, dice and bear-off cases (#9–#17) in `tavli-match.md`, named like
  `portes.md #7: ...`. Also flags, rules errors and `applyTurn` errors.
- `portes-reference.test.ts`: a slow, simple generator (every order, no
  pruning) must find the same end positions in random positions.
- `portes-fuzz.test.ts`: 2,000 random games to the end, with checks after
  every turn. It uses plain `if` checks, not `expect`, in the hot loop:
  `expect` is far too slow for millions of calls.
- Test helpers (not exported): `src/testing/position-notation.ts` reads and
  writes positions like `w: 24x2 13x5 8x3 6x5 ; b: 6x15` (own numbering per
  side; a missing `off` means "the rest are off") and turns like `13/8* 8/5`
  or `4/0:6`. `src/testing/random-positions.ts` makes random positions.

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
  `resignResult` (Plakoto "resign or play on" later).
- `resignMatch(match, player)` ends the match now. The opponent wins; the
  score stays as it is.
- `createRematch(match)`: same rules and players, score 0–0. With
  `rematchStarter: "lastGameWinner"` (default, owner rule) the winner of the
  last game starts with no opening roll. That is always the match winner.
- Rotation: `nextVariantId(match)` is the next game.
  `startNextGame(match, startingPlayer)` returns its start state. A game
  that is not built yet (today: Plakoto, Fevga, so game 2 of a `tavli`
  match) throws `UNKNOWN_VARIANT` with a clear message and the path of the
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

## Not here yet

- The turn state machine with the opening roll and Asodio roll chains
  (#25). It reads its flags from `state.rules`.
- Plakoto, Fevga and Asodio variants.

## Commands

From the repo root: `pnpm test`, `pnpm typecheck`, `pnpm lint`.
