/**
 * A small, fast board for the Asodio evaluator, with a light copy of the
 * single-move rules (`docs/rules/asodio.md`, owner version and flags).
 *
 * Each player gets one plain array in that player's own numbering:
 *
 * | Index   | Meaning                                                      |
 * | ------- | ------------------------------------------------------------ |
 * | 0       | checkers borne off                                           |
 * | 1–24    | checkers on own point 1–24                                   |
 * | 25      | checkers waiting to enter: outside (never entered) + bar     |
 * | 26      | of those, the checkers on the bar (hit, `captureMode: "hit"`)|
 * | 26 + p  | 1 when this player's lone checker on own point p is pinned   |
 *
 * The first 26 entries have the same layout as a Portes `Side` (index 25 is
 * the bar there), so the race and bear-off code (`race.ts`, `bearoff.ts`)
 * reads them as they are: a waiting checker counts 25 pips, because a die
 * `d` enters it on own point `25 - d`.
 *
 * Asodio is a contrary game: own point `p` of one player is own point
 * `25 - p` of the other.
 *
 * The move rules here follow the engine (`packages/engine/src/variants/
 * asodio/moves.ts`) for one single move. The evaluator uses them for
 * features (die values with no move, shots, a frozen army). They ignore the
 * "use as much of the roll as possible" rules. The bot still plays only the
 * turns the engine lists.
 */

import type { GameState, PlayerId, RuleSet, Turn } from '@tavli/engine';

/** One player's checkers and pins. Length 51. */
export type AsodioSide = number[];

export const OFF = 0;
/** Checkers outside or on the bar. They enter with die `d` on own point `25 - d`. */
export const WAIT = 25;
/** Hit checkers (a part of `WAIT`). They enter before anything else moves. */
export const BAR = 26;
/** `side[PINNED + p]` is 1 when the side's checker on own point `p` is pinned. */
export const PINNED = 26;
const LENGTH = 51;

/** The flags the move rules read. */
export interface AsodioOptions {
  readonly pin: boolean;
  readonly higherDieRule: boolean;
  readonly firstEntryGate: boolean;
  readonly gateDoubleOnly: boolean;
  readonly mustEnterAllFirst: boolean;
  readonly moveWhileLoading: boolean;
  readonly barEntryNeedsSpecial: boolean;
  readonly quarterLock: boolean;
  readonly moveInsideFrozenQuarter: boolean;
  readonly exactBearOff: boolean;
  readonly bearOffWhilePinned: boolean;
  /** A turn may give the same player another roll or a question (the Acey-Deucey presets). */
  readonly chains: boolean;
  readonly scoring: RuleSet['scoring']['method'];
}

const optionsCache = new WeakMap<RuleSet, AsodioOptions>();

export function asodioOptions(rules: RuleSet): AsodioOptions {
  const cached = optionsCache.get(rules);
  if (cached !== undefined) return cached;
  const { entry, quarters, bearOff, extraRolls, specialRolls } = rules;
  const options: AsodioOptions = {
    pin: rules.capture.captureMode === 'pin',
    higherDieRule: rules.movement.higherDieRule,
    firstEntryGate: entry.firstEntryGate,
    gateDoubleOnly: entry.firstEntryGateRolls === 'doubleOnly',
    mustEnterAllFirst: entry.mustEnterAllFirst,
    moveWhileLoading: entry.moveWhileLoading,
    barEntryNeedsSpecial: entry.barEntryNeedsSpecial,
    quarterLock: quarters.quarterLock,
    moveInsideFrozenQuarter: quarters.moveInsideFrozenQuarter,
    exactBearOff: bearOff.exactBearOff,
    bearOffWhilePinned: bearOff.bearOffWhilePinned,
    chains:
      specialRolls.aceDeuceChoosesDouble ||
      extraRolls.aceDeuceExtraRoll ||
      extraRolls.doublesGiveExtraRoll,
    scoring: rules.scoring.method,
  };
  optionsCache.set(rules, options);
  return options;
}

/** Reads one player's side from a state. */
export function asodioSideOf(state: GameState, player: PlayerId): AsodioSide {
  const { board } = state;
  const side: AsodioSide = new Array<number>(LENGTH).fill(0);
  side[OFF] = board.off[player];
  side[WAIT] = board.outside[player] + board.bar[player];
  side[BAR] = board.bar[player];
  const points = board.points;
  for (let i = 0; i < 24; i += 1) {
    const point = points[i];
    if (point === undefined) continue;
    const count = point[player];
    if (count === 0) continue;
    // Absolute point i + 1 is White's own number; Black's is 25 - (i + 1).
    const own = player === 'white' ? i + 1 : 24 - i;
    side[own] = count;
    if (point.pinned === player) side[PINNED + own] = 1;
  }
  return side;
}

/**
 * Plays a turn on copies of the two sides and returns them. It trusts the
 * turn: it comes from `legalTurns`.
 */
export function playAsodioTurn(
  mover: AsodioSide,
  opponent: AsodioSide,
  turn: Turn,
): [AsodioSide, AsodioSide] {
  const me = mover.slice();
  const them = opponent.slice();
  for (const move of turn.moves) {
    const to = move.to === 'off' ? OFF : (move.to as number);
    if (move.from === 'outside' || move.from === 'bar') {
      me[WAIT] = (me[WAIT] ?? 0) - 1;
      if (move.from === 'bar') me[BAR] = (me[BAR] ?? 0) - 1;
    } else {
      const from = move.from as number;
      me[from] = (me[from] ?? 0) - 1;
      // Phase 3.4: the last pinner leaves, the pinned checker is free.
      if (me[from] === 0) them[PINNED + 25 - from] = 0;
    }
    if (to !== OFF) applyCapture(them, 25 - to, move.capture);
    me[to] = (me[to] ?? 0) + 1;
  }
  return [me, them];
}

function applyCapture(them: AsodioSide, q: number, capture: string): void {
  if (capture === 'pin') {
    them[PINNED + q] = 1;
  } else if (capture === 'hit') {
    them[q] = (them[q] ?? 0) - 1;
    them[WAIT] = (them[WAIT] ?? 0) + 1;
    them[BAR] = (them[BAR] ?? 0) + 1;
  }
}

/** The quarter of own point `p`: 0 = 19–24 (the starting quarter) … 3 = 1–6 (home). */
export function quarterOf(p: number): number {
  return Math.floor((24 - p) / 6);
}

/** The quarter of the side's last checker (waiting checkers count as quarter 0). All off: 3. */
export function rearQuarter(side: AsodioSide): number {
  if ((side[WAIT] ?? 0) > 0) return 0;
  for (let p = 24; p >= 1; p -= 1) if ((side[p] ?? 0) > 0) return quarterOf(p);
  return 3;
}

/** True while the side has never entered a checker (the first-entry gate may hold). */
export function allOutside(side: AsodioSide): boolean {
  return (side[WAIT] ?? 0) - (side[BAR] ?? 0) === 15;
}

/** True when `me` may land on own point `to` (1–24). */
export function canLand(me: AsodioSide, them: AsodioSide, to: number, pin: boolean): boolean {
  const theirs = them[25 - to] ?? 0;
  if (theirs === 0) return true;
  if (!pin) return theirs === 1;
  // Our own pin there (their checker under ours), or a lone free checker.
  if (them[PINNED + 25 - to] === 1) return true;
  return theirs === 1 && me[PINNED + to] !== 1;
}

/** What the single-move test needs to know about a side, computed once. */
export interface MoveContext {
  readonly bar: number;
  readonly outside: number;
  readonly rear: number;
  readonly bearOff: boolean;
  /** The highest own point with a checker, when bearing off. */
  readonly highest: number;
}

/** A `MoveContext` that `fillMoveContext` can fill again (the shot search keeps one per depth). */
export type MutableMoveContext = { -readonly [K in keyof MoveContext]: MoveContext[K] };

export function moveContext(me: AsodioSide, options: AsodioOptions): MoveContext {
  const ctx: MutableMoveContext = { bar: 0, outside: 0, rear: 0, bearOff: false, highest: 0 };
  fillMoveContext(ctx, me, options);
  return ctx;
}

/** Writes the `MoveContext` of `me` into `ctx`, with no new object. */
export function fillMoveContext(
  ctx: MutableMoveContext,
  me: AsodioSide,
  options: AsodioOptions,
): void {
  const bar = me[BAR] ?? 0;
  const outside = (me[WAIT] ?? 0) - bar;
  let bearOff = bar === 0 && outside === 0;
  for (let p = 7; p <= 24 && bearOff; p += 1) if ((me[p] ?? 0) > 0) bearOff = false;
  if (bearOff && options.pin && !options.bearOffWhilePinned) {
    for (let p = 1; p <= 6; p += 1) if (me[PINNED + p] === 1) bearOff = false;
  }
  let highest = 0;
  if (bearOff) {
    for (let p = 6; p >= 1 && highest === 0; p -= 1) if ((me[p] ?? 0) > 0) highest = p;
  }
  ctx.bar = bar;
  ctx.outside = outside;
  ctx.rear = options.quarterLock ? rearQuarter(me) : 0;
  ctx.bearOff = bearOff;
  ctx.highest = highest;
}

/**
 * The lowest own point a checker on the board may move from with `die`:
 * `canMove` is false for every point below it (25: only an entry can
 * move). A search can skip those points; the answer is the same.
 */
export function lowestFrom(die: number, ctx: MoveContext, options: AsodioOptions): number {
  // Hit checkers enter first.
  if (ctx.bar > 0) return WAIT;
  let low = 1;
  if (ctx.outside > 0) {
    if (!options.moveWhileLoading) return WAIT;
    // The move must stay in the starting quarter (19–24).
    if (options.mustEnterAllFirst) low = 19 + die;
  }
  // A checker in front of the rear quarter is frozen (quarter > rear).
  if (options.quarterLock && !options.moveInsideFrozenQuarter) {
    low = Math.max(low, 19 - 6 * ctx.rear);
  }
  return Math.min(low, WAIT);
}

/**
 * True when `me` may move one checker from `from` (own point 1–24, or
 * `WAIT` to enter) with `die`. The roll gates (first entry, bar entry with
 * `barEntryNeedsSpecial`) are not checked here.
 */
export function canMove(
  me: AsodioSide,
  them: AsodioSide,
  from: number,
  die: number,
  ctx: MoveContext,
  options: AsodioOptions,
): boolean {
  if (from === WAIT) {
    if ((me[WAIT] ?? 0) === 0) return false;
    return canLand(me, them, 25 - die, options.pin);
  }
  // Hit checkers enter first.
  if (ctx.bar > 0) return false;
  if ((me[from] ?? 0) === 0 || me[PINNED + from] === 1) return false;
  const to = from - die;
  if (ctx.outside > 0) {
    if (!options.moveWhileLoading) return false;
    if (options.mustEnterAllFirst && to < 19) return false;
  }
  if (options.quarterLock) {
    const quarter = quarterOf(from);
    if (quarter > ctx.rear) {
      if (!options.moveInsideFrozenQuarter || to < 1 || quarterOf(to) !== quarter) return false;
    }
  }
  if (to >= 1) return canLand(me, them, to, options.pin);
  if (!ctx.bearOff) return false;
  return to === 0 || (!options.exactBearOff && from === ctx.highest);
}

// What `playOne` changed besides the checker itself, so `undoOne` can take it back.
const TOOK_BAR = 1;
const FREED_PIN = 2;
const PINNED_ONE = 4;
const HIT_ONE = 8;

/**
 * Plays one move that `canMove` allowed, in place: it changes `me` and
 * `them`. Returns a code for `undoOne`, which must get the same `from` and
 * `die`. The shot search plays and takes back moves this way, so it copies
 * no arrays.
 */
export function playOne(
  me: AsodioSide,
  them: AsodioSide,
  from: number,
  die: number,
  options: AsodioOptions,
): number {
  let code = 0;
  let to: number;
  if (from === WAIT) {
    me[WAIT] = (me[WAIT] ?? 0) - 1;
    if ((me[BAR] ?? 0) > 0) {
      me[BAR] = (me[BAR] ?? 0) - 1;
      code |= TOOK_BAR;
    }
    to = 25 - die;
  } else {
    me[from] = (me[from] ?? 0) - 1;
    // Phase 3.4: the last pinner leaves, the pinned checker is free.
    if (me[from] === 0 && them[PINNED + 25 - from] === 1) {
      them[PINNED + 25 - from] = 0;
      code |= FREED_PIN;
    }
    to = Math.max(0, from - die);
  }
  if (
    to > 0 &&
    (them[25 - to] ?? 0) === 1 &&
    them[PINNED + 25 - to] !== 1 &&
    me[PINNED + to] !== 1
  ) {
    if (options.pin) {
      them[PINNED + 25 - to] = 1;
      code |= PINNED_ONE;
    } else {
      applyCapture(them, 25 - to, 'hit');
      code |= HIT_ONE;
    }
  }
  me[to] = (me[to] ?? 0) + 1;
  return code;
}

/** Takes back the move `playOne` played (`code` is what it returned). */
export function undoOne(
  me: AsodioSide,
  them: AsodioSide,
  from: number,
  die: number,
  code: number,
): void {
  const to = from === WAIT ? 25 - die : Math.max(0, from - die);
  me[to] = (me[to] ?? 0) - 1;
  if ((code & PINNED_ONE) !== 0) {
    them[PINNED + 25 - to] = 0;
  } else if ((code & HIT_ONE) !== 0) {
    them[25 - to] = (them[25 - to] ?? 0) + 1;
    them[WAIT] = (them[WAIT] ?? 0) - 1;
    them[BAR] = (them[BAR] ?? 0) - 1;
  }
  if (from === WAIT) {
    me[WAIT] = (me[WAIT] ?? 0) + 1;
    if ((code & TOOK_BAR) !== 0) me[BAR] = (me[BAR] ?? 0) + 1;
  } else {
    if ((code & FREED_PIN) !== 0) them[PINNED + 25 - from] = 1;
    me[from] = (me[from] ?? 0) + 1;
  }
}

/** For each die 1–6: true when `me` has a legal single move with it (gates aside). */
export function movableDice(me: AsodioSide, them: AsodioSide, options: AsodioOptions): boolean[] {
  const ctx = moveContext(me, options);
  const out: boolean[] = [false, false, false, false, false, false, false];
  for (let die = 1; die <= 6; die += 1) {
    if (canMove(me, them, WAIT, die, ctx, options)) {
      out[die] = true;
      continue;
    }
    for (let from = 24; from >= 1; from -= 1) {
      if (canMove(me, them, from, die, ctx, options)) {
        out[die] = true;
        break;
      }
    }
  }
  return out;
}

/** True when `me` has some legal single move with some die 1–6 (the engine's `hasAnyMove`). */
export function hasAnyMove(me: AsodioSide, them: AsodioSide, options: AsodioOptions): boolean {
  const dice = movableDice(me, them, options);
  for (let die = 1; die <= 6; die += 1) if (dice[die] === true) return true;
  return false;
}

/** The lowest quarter (own numbering) with a pinned checker of the side, or 4 if none. */
export function lowestPinnedQuarter(side: AsodioSide): number {
  for (let p = 24; p >= 1; p -= 1) if (side[PINNED + p] === 1) return quarterOf(p);
  return 4;
}

/**
 * True when the two armies hold each other forever, so the game must end
 * in a deadlock draw (A5), even if some checkers can still move now.
 *
 * Own quarter `k` of one side is own quarter `3 − k` of the other. Say our
 * checker in our quarter `a` is pinned, and their checker in their quarter
 * `b` is pinned, with `a + b ≤ 2`. Our pinner on it sits in their quarter
 * `3 − a > b`: in front of their rear quarter (at most `b` while their
 * checker is pinned), so it is frozen. Their pinner sits in our quarter
 * `3 − b > a`, frozen the same way. Neither pin can ever end, and a side
 * with a pinned checker outside home can never bear off. This needs the
 * quarter lock with frozen checkers that do not move (`kafeneio`).
 */
export function mutualLock(a: AsodioSide, b: AsodioSide, options: AsodioOptions): boolean {
  if (!options.pin || !options.quarterLock || options.moveInsideFrozenQuarter) return false;
  return lowestPinnedQuarter(a) + lowestPinnedQuarter(b) <= 2;
}

/** True when some pin exists, or some checker still has an opponent checker in front of it. */
export function asodioContact(a: AsodioSide, b: AsodioSide): boolean {
  for (let p = 1; p <= 24; p += 1) {
    if (a[PINNED + p] === 1 || b[PINNED + p] === 1) return true;
  }
  let backA = 0;
  for (let p = 25; p >= 1; p -= 1) {
    if ((a[p] ?? 0) > 0) {
      backA = p;
      break;
    }
  }
  // The back checker of `b`, in `a`'s numbering (25 - own point; waiting = 0).
  let backB = 25;
  for (let q = 25; q >= 1; q -= 1) {
    if ((b[q] ?? 0) > 0) {
      backB = 25 - q;
      break;
    }
  }
  return backA > backB;
}
