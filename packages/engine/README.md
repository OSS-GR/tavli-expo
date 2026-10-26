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
  schemaVersion: 1;
  variant: VariantId; // 'portes', 'plakoto', ...
  rules: { id: string; version: number };
  board: BoardState;
  toMove: PlayerId;
  dice: Dice | null; // null before the roll
  turnNumber: number; // 1 = first turn
  variantData: JsonObject | null; // extra data for a variant or the turn flow
}
```

### JSON

- `serializeGameState(state)` → string. `parseGameState(text)` → state.
- `validateGameState(value)` checks any object (for example from Convex) and
  returns a typed copy.
- Bad input throws `EngineError` with a `code` (`INVALID_JSON`,
  `UNSUPPORTED_SCHEMA_VERSION`, `INVALID_STATE`) and a `path` such as
  `state.board.points[3].white`. Unknown fields are rejected.
- Change the shape of `GameState` → bump `GAME_STATE_SCHEMA_VERSION`.

## How a variant plugs in

A variant is a plain object that implements `Variant`:

```ts
const portes: Variant = {
  id: 'portes',
  direction: 'contrary',
  initialState({ startingPlayer, rules }) { ... },
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

## Not here yet

- Portes move generation (#23), scoring (#24), the turn state machine with
  the opening roll and Asodio roll chains (#25), and `RuleSet` presets (#57).
- `GameState.rules` is only a reference (`id` + `version`) until #57.

## Commands

From the repo root: `pnpm test`, `pnpm typecheck`, `pnpm lint`.
