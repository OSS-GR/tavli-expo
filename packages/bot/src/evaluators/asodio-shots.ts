/**
 * Shot counting for Asodio: with how many of the 36 rolls can the player on
 * roll pin (or, with `captureMode: "hit"`, hit) a lone checker of the other
 * player?
 *
 * It plays the roll one die at a time with the single-move rules of
 * `asodio-board.ts`, so the army rules hold: only the checkers the rules
 * let move can shoot, a checker that enters a new quarter is frozen there
 * (so a combined move stops at the quarter line), and a lock that ends in
 * the middle of the roll frees the rest of it. Doubles try the moves in
 * the engine's order (origins never go up), which reaches every end
 * position. Like the Portes and Plakoto counts, it ignores the "use as much
 * of the roll as possible" rules.
 */

import {
  BAR,
  PINNED,
  WAIT,
  allOutside,
  canMove,
  fillMoveContext,
  lowestFrom,
  playOne,
  quarterOf,
  undoOne,
} from './asodio-board';
import type { AsodioOptions, AsodioSide, MutableMoveContext } from './asodio-board';

/** The 21 different rolls: [die 1, die 2, how many of the 36 rolls]. */
const ROLLS: readonly (readonly [number, number, number])[] = (() => {
  const rolls: [number, number, number][] = [];
  for (let a = 1; a <= 6; a += 1) {
    for (let b = a; b <= 6; b += 1) rolls.push([a, b, a === b ? 1 : 2]);
  }
  return rolls;
})();

export interface AsodioShots {
  /** Rolls out of 36 that pin (or hit) at least one checker. */
  readonly any: number;
  /** Rolls out of 36 that pin each lone checker, by its point in the **waiting** player's own numbering. Length 25. */
  readonly perBlot: readonly number[];
  /** Rolls out of 36 that pin a checker in a quarter up to `lockQuarter` (see `countAsodioShots`). */
  readonly lock: number;
}

/** True when the waiter's checker on its own point `q` can be pinned (or hit). */
export function isTarget(roller: AsodioSide, waiter: AsodioSide, q: number, pin: boolean): boolean {
  if ((waiter[q] ?? 0) !== 1) return false;
  if (!pin) return true;
  return waiter[PINNED + q] !== 1 && (roller[25 - q] ?? 0) === 0;
}

/** True when the roll cannot move at all (the first-entry gate, or a bar checker that needs a 1-2 or a double). */
function rollGated(me: AsodioSide, a: number, b: number, options: AsodioOptions): boolean {
  const double = a === b;
  const special = double || a + b === 3;
  if (options.firstEntryGate && allOutside(me) && !(options.gateDoubleOnly ? double : special)) {
    return true;
  }
  return options.barEntryNeedsSpecial && (me[BAR] ?? 0) > 0 && !special;
}

function emptyContext(): MutableMoveContext {
  return { bar: 0, outside: 0, rear: 0, bearOff: false, highest: 0 };
}

/**
 * The work space of one shot count. One instance serves every call: the
 * count never calls itself and JavaScript runs one call at a time, so the
 * search allocates no arrays. Each call allocates only its result. Every
 * call sets all of the work space up again, so the result depends only on
 * the call's input.
 */
class ShotSearch {
  /** Working copies of the roller and the waiter: moves are played and taken back. */
  readonly me: AsodioSide = new Array<number>(51).fill(0);
  readonly them: AsodioSide = new Array<number>(51).fill(0);
  options!: AsodioOptions;
  /** One move context per depth: a roll has at most 4 dice. */
  readonly contexts = [emptyContext(), emptyContext(), emptyContext(), emptyContext()];
  /** The targets at the start, as the roller's points (high to low). */
  readonly list: number[] = [];
  /** The roller's points over a pinned waiter checker: the only places a new target may appear. */
  readonly watch: number[] = [];
  /** The lowest target, in the roller's numbering. */
  lowest = 25;
  targets = 0;
  /** hit[q]: this roll pins (or hits) the waiter's checker on its own point q. */
  readonly hit: boolean[] = new Array<boolean>(25).fill(false);
  hits = 0;
  /** open[t]: the roller's point t holds a target this roll has not pinned yet. */
  readonly open: boolean[] = new Array<boolean>(26).fill(false);
  /** True when the roll can pin a new target (on a `watch` point). */
  found = false;
  /** below[t]: targets on the roller's points 1 … t (for the first version). */
  readonly below: number[] = new Array<number>(26).fill(0);
  /** start[t]: the roller's point t holds a target at the start. */
  readonly start: boolean[] = new Array<boolean>(26).fill(false);
  // The rolls with two different dice, by `x * 7 + y` (first die x, then y). A
  // mask has bit t for the roller's point t.
  /** direct[x]: the targets one move with die x pins at the start. */
  readonly direct: number[] = new Array<number>(7).fill(0);
  /** The targets die y pins after one move with die x. */
  readonly pairMask: number[] = new Array<number>(49).fill(0);
  /** The roll can pin a new target, so it runs the first version. */
  readonly pairFound: boolean[] = new Array<boolean>(49).fill(false);
  /** The roll cannot move at all (`rollGated`). */
  readonly gated: boolean[] = new Array<boolean>(49).fill(false);

  /** Rolls that ran the first version, over all calls (for tests). */
  fallbacks = 0;

  /** True when nothing more can change the result of this roll. */
  done(): boolean {
    return this.found || (this.hits === this.targets && this.watch.length === 0);
  }

  /** A legal move lands on `to`: take an open target, or note a new one. */
  land(to: number): void {
    if (to < 1) return;
    if (this.open[to] === true) {
      this.open[to] = false;
      this.hit[25 - to] = true;
      this.hits += 1;
    } else if (
      this.watch.length > 0 &&
      this.watch.includes(to) &&
      isTarget(this.me, this.them, 25 - to, this.options.pin)
    ) {
      this.found = true;
    }
  }

  /**
   * True when a checker at `top` or below stands on `t + die`, `t + 2 × die`
   * … (up to `left` moves) of an open target or a watched point `t`.
   */
  reach(die: number, left: number, top: number): boolean {
    const { me, open, list, watch } = this;
    for (const t of list) {
      if (open[t] !== true) continue;
      for (let k = 1, s = t + die; k <= left && s <= top; k += 1, s += die) {
        if ((me[s] ?? 0) > 0) return true;
      }
    }
    for (const t of watch) {
      for (let k = 1, s = t + die; k <= left && s <= top; k += 1, s += die) {
        if ((me[s] ?? 0) > 0) return true;
      }
    }
    return false;
  }

  /**
   * The moves of one `die` that pin at once: only the checkers one `die`
   * above an open target or a watched point matter. It is all the last die
   * of a roll can do. `ready`: the context of this depth is filled already.
   */
  lastDie(depth: number, die: number, top: number, ready = false): void {
    const { me, open, list, watch } = this;
    const ctx = this.contexts[depth] as MutableMoveContext;
    for (let i = 0; i < list.length + watch.length; i += 1) {
      const t = (i < list.length ? list[i] : watch[i - list.length]) as number;
      if (i < list.length && open[t] !== true) continue;
      const from = t + die;
      if (from > top || from <= this.lowest || (me[from] ?? 0) === 0) continue;
      if (!ready) {
        fillMoveContext(ctx, me, this.options);
        ready = true;
      }
      if (!canMove(me, this.them, from, die, ctx, this.options)) continue;
      this.land(t);
      if (this.done()) return;
    }
  }

  /** Plays `left` dice of the value `die` (a double), from `top` or below. */
  searchFast(depth: number, die: number, left: number, top: number): void {
    if (left === 1) {
      this.lastDie(depth, die, top);
      return;
    }
    if (!this.reach(die, left, top)) return;
    const { me, them, options } = this;
    const ctx = this.contexts[depth] as MutableMoveContext;
    fillMoveContext(ctx, me, options);
    // The pins with one move first: when they pin every target, the roll is done.
    this.lastDie(depth, die, top, true);
    if (this.done()) return;
    const low = Math.max(this.lowest + 1, lowestFrom(die, ctx, options));
    for (let from = top; from >= low; from -= 1) {
      if ((me[from] ?? 0) === 0 || !canMove(me, them, from, die, ctx, options)) continue;
      const code = playOne(me, them, from, die, options);
      this.searchFast(depth + 1, die, left - 1, from);
      undoOne(me, them, from, die, code);
      if (this.done()) return;
    }
  }

  /**
   * All 15 rolls a-b with two different dice at once. The roll a-b pins
   * what a or b pins alone from the start (`direct`), and what the other
   * die pins after one of them (`pairMask`). One move with die x leads to
   * the same position in each roll x-y, so each first move is played once
   * for all five rolls with it. `pairFound`: the roll can pin a new target.
   */
  pairRolls(): void {
    const { me, them, options, list, watch, start, direct, pairMask, pairFound, gated } = this;
    const root = this.contexts[0] as MutableMoveContext;
    const child = this.contexts[1] as MutableMoveContext;
    const pin = options.pin;
    fillMoveContext(root, me, options);
    for (let x = 1; x <= 6; x += 1) {
      direct[x] = 0;
      let useful = false;
      for (let y = 1; y <= 6; y += 1) if (y !== x && gated[x * 7 + y] !== true) useful = true;
      if (!useful) continue;
      const low = Math.max(this.lowest + 1, lowestFrom(x, root, options));
      for (let from = WAIT; from >= low; from -= 1) {
        if ((me[from] ?? 0) === 0 || !canMove(me, them, from, x, root, options)) continue;
        const to = from - x;
        if (to >= 1 && start[to] === true) direct[x] = (direct[x] ?? 0) | (1 << to);
        const code = playOne(me, them, from, x, options);
        let ready = false;
        for (let y = 1; y <= 6; y += 1) {
          const roll = x * 7 + y;
          if (y === x || gated[roll] === true || pairFound[roll] === true) continue;
          for (const t of list) {
            const bit = 1 << t;
            if (((pairMask[roll] ?? 0) & bit) !== 0) continue;
            const s = t + y;
            if (s > WAIT || s <= this.lowest || (me[s] ?? 0) === 0) continue;
            if (!ready) {
              fillMoveContext(child, me, options);
              ready = true;
            }
            if (canMove(me, them, s, y, child, options))
              pairMask[roll] = (pairMask[roll] ?? 0) | bit;
          }
          for (const p of watch) {
            const s = p + y;
            if (s > WAIT || s <= this.lowest || (me[s] ?? 0) === 0) continue;
            if (!isTarget(me, them, 25 - p, pin)) continue;
            if (!ready) {
              fillMoveContext(child, me, options);
              ready = true;
            }
            if (canMove(me, them, s, y, child, options)) pairFound[roll] = true;
          }
        }
        undoOne(me, them, from, x, code);
      }
    }
  }

  // ---- The first version: the search in its first order.

  /** True when some checker (at `top` or below) has a target at the start within `pips` in front of it. */
  inReach(pips: number, top: number): boolean {
    const { me, below } = this;
    for (let s = top; s > this.lowest; s -= 1) {
      if ((me[s] ?? 0) === 0) continue;
      if ((below[s - 1] ?? 0) - (below[Math.max(0, s - 1 - pips)] ?? 0) > 0) return true;
    }
    return false;
  }

  /** A move from `from` with `die` lands on `from − die`: marks the checker it pins (or hits) there. */
  mark(from: number, die: number): void {
    const to = from - die;
    if (to < 1) return;
    const q = 25 - to;
    if (!this.hit[q] && isTarget(this.me, this.them, q, this.options.pin)) {
      this.hit[q] = true;
      this.hits += 1;
    }
  }

  /**
   * Plays `left` dice of the value `die`, from `top` or below. After the
   * first die of a double, each die starts at the checker the last one
   * moved or lower (origins never go up). One die alone starts at `WAIT`.
   */
  searchInOrder(depth: number, die: number, left: number, top: number): void {
    if (this.hits === this.targets) return;
    // No checker can reach a target with the dice left, whatever moves first.
    if (!this.inReach(die * left, top)) return;
    const { me, them, options } = this;
    const ctx = this.contexts[depth] as MutableMoveContext;
    fillMoveContext(ctx, me, options);
    for (let from = top; from > this.lowest; from -= 1) {
      if ((me[from] ?? 0) === 0 || !canMove(me, them, from, die, ctx, options)) continue;
      this.mark(from, die);
      if (this.hits === this.targets) return;
      if (left === 1) continue;
      const code = playOne(me, them, from, die, options);
      this.searchInOrder(depth + 1, die, left - 1, from);
      undoOne(me, them, from, die, code);
      if (this.hits === this.targets) return;
    }
  }

  /** The roll a-b (a < b) in the first order: b first, then a; then a first, then b. */
  pairInOrder(a: number, b: number): void {
    if (!this.inReach(a + b, WAIT)) return;
    const { me, them, options } = this;
    const ctx = this.contexts[0] as MutableMoveContext;
    fillMoveContext(ctx, me, options);
    for (let k = 0; k < 2; k += 1) {
      const die = k === 0 ? b : a;
      const other = k === 0 ? a : b;
      for (let from = WAIT; from > this.lowest; from -= 1) {
        if ((me[from] ?? 0) === 0 || !canMove(me, them, from, die, ctx, options)) continue;
        this.mark(from, die);
        if (this.hits === this.targets) return;
        const code = playOne(me, them, from, die, options);
        this.searchInOrder(1, other, 1, WAIT);
        undoOne(me, them, from, die, code);
        if (this.hits === this.targets) return;
      }
    }
  }

  count(
    roller: AsodioSide,
    waiter: AsodioSide,
    options: AsodioOptions,
    lockQuarter: number,
  ): AsodioShots {
    const { me, them, list, watch, hit, open, start, pairMask, pairFound, gated } = this;
    const pin = options.pin;
    list.length = 0;
    watch.length = 0;
    start.fill(false);
    this.targets = 0;
    this.lowest = 25;
    for (let t = 24; t >= 1; t -= 1) {
      const q = 25 - t;
      if (isTarget(roller, waiter, q, pin)) {
        this.targets += 1;
        this.lowest = t;
        list.push(t);
        start[t] = true;
      } else if (pin && waiter[PINNED + q] === 1) {
        watch.push(t);
      }
    }
    // A new result each time: a caller may keep or change it.
    if (this.targets === 0) return { any: 0, perBlot: new Array<number>(25).fill(0), lock: 0 };
    this.options = options;
    for (let i = 0; i < 51; i += 1) {
      me[i] = roller[i] ?? 0;
      them[i] = waiter[i] ?? 0;
    }
    let pairsLeft = false;
    for (const [a, b] of ROLLS) {
      const g = rollGated(roller, a, b, options);
      gated[a * 7 + b] = g;
      gated[b * 7 + a] = g;
      pairMask[a * 7 + b] = 0;
      pairMask[b * 7 + a] = 0;
      pairFound[a * 7 + b] = false;
      pairFound[b * 7 + a] = false;
      if (a !== b && !g) pairsLeft = true;
    }
    if (pairsLeft) this.pairRolls();
    let belowReady = false;
    const perBlot = new Array<number>(25).fill(0);
    let any = 0;
    let lock = 0;
    for (const [a, b, weight] of ROLLS) {
      if (gated[a * 7 + b] === true) continue;
      const fallback = a !== b && (pairFound[a * 7 + b] === true || pairFound[b * 7 + a] === true);
      if (a !== b && !fallback) {
        // The pair rolls are done: read the result from the masks.
        const mask =
          (this.direct[a] ?? 0) |
          (this.direct[b] ?? 0) |
          (pairMask[a * 7 + b] ?? 0) |
          (pairMask[b * 7 + a] ?? 0);
        if (mask === 0) continue;
        any += weight;
        let locks = false;
        for (const t of list) {
          if ((mask & (1 << t)) === 0) continue;
          const q = 25 - t;
          perBlot[q] = (perBlot[q] ?? 0) + weight;
          if (quarterOf(q) <= lockQuarter) locks = true;
        }
        if (locks) lock += weight;
        continue;
      }
      hit.fill(false);
      this.hits = 0;
      this.found = false;
      if (a === b) {
        for (const t of list) open[t] = true;
        this.searchFast(0, a, 4, WAIT);
        for (const t of list) open[t] = false;
      }
      if (this.found || fallback) {
        // A new target: the order of the search matters, so run the first version.
        this.fallbacks += 1;
        if (!belowReady) {
          const below = this.below;
          for (let t = 1; t <= 25; t += 1) below[t] = (below[t - 1] ?? 0) + (start[t] ? 1 : 0);
          belowReady = true;
        }
        hit.fill(false);
        this.hits = 0;
        if (a === b) this.searchInOrder(0, a, 4, WAIT);
        else this.pairInOrder(a, b);
      }
      if (this.hits === 0) continue;
      any += weight;
      let locks = false;
      for (let q = 1; q <= 24; q += 1) {
        if (hit[q] !== true) continue;
        perBlot[q] = (perBlot[q] ?? 0) + weight;
        if (quarterOf(q) <= lockQuarter) locks = true;
      }
      if (locks) lock += weight;
    }
    return { any, perBlot, lock };
  }
}

const SEARCH = new ShotSearch();

/**
 * How many rolls ran the first version (a new target was possible), over
 * all calls so far. For tests: they check that the fallback really runs.
 */
export function asodioShotFallbacks(): number {
  return SEARCH.fallbacks;
}

/**
 * Counts the shots of `roller` at the lone checkers of `waiter`. Both in
 * their own numbering. `lock` counts the rolls that pin a waiter checker
 * in its own quarter `lockQuarter` or lower (−1: none). The evaluator uses
 * it for pins that would lock both armies (`mutualLock`).
 *
 * How the search works. #225 made it faster; the results stay exactly the
 * same as with the first version (`searchInOrder`):
 *
 * - It plays each roll one die at a time on working copies of the two
 *   sides, and takes each move back after it (`playOne`, `undoOne`).
 * - The first version stops a roll as soon as the count of checkers it
 *   pinned reaches the count of targets at the start. Then every target is
 *   pinned, unless a freed pin made a new target: the roller's last pinner
 *   leaves a point, and the waiter checker under it is free and alone.
 *   Only such a new target makes the result depend on the order of the
 *   search.
 * - Else the result is all the targets the roll can reach, found in any
 *   order. A double (`searchFast`) skips a branch when no checker can still
 *   land on a target the roll has not pinned yet: a checker on `s` lands
 *   only on `s − die`, `s − 2 × die` … The 15 rolls a-b share their work
 *   (`pairRolls`): a first move with die x is played once for every roll
 *   x-y. It skips the points `canMove` refuses anyway (`lowestFrom`).
 * - It watches the points of the waiter checkers pinned now (the only
 *   places a new target can appear). If a roll can pin a new target there,
 *   that roll runs the first version instead.
 *
 * `asodio-heuristic.golden.test.ts` checks the scores on 2,100 positions.
 */
export function countAsodioShots(
  roller: AsodioSide,
  waiter: AsodioSide,
  options: AsodioOptions,
  lockQuarter = -1,
): AsodioShots {
  return SEARCH.count(roller, waiter, options, lockQuarter);
}
