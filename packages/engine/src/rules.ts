/**
 * Rules as data (#57).
 *
 * A `RuleSet` holds every house-rule flag from the "House-rule variants
 * (flags)" tables in `docs/rules/*.md`, grouped by topic. It is plain JSON.
 * `GameState.rules` embeds the full, resolved `RuleSet`, so a saved game
 * always knows its exact rules, even after a preset changes.
 *
 * Every group is present in every `RuleSet`, also in games that do not use
 * it. A flag that a game does not use keeps its neutral value (for example
 * `primes.p1NoPrimeOwnStart = false` in Portes). `validateRules` checks that
 * flags which only make sense together are used together.
 *
 * Field names are the flag names from the docs, so you can search for them.
 * The one exception: the Asodio flag `scoring` is `scoring.method` here.
 *
 * The RuleSet holds settings only. It never holds game progress. Things like
 * "Asodio: is this player still loading?", "which quarter is locked?" or
 * "is the Plakoto mother pinned?" are computed from the board.
 */

import type { Direction } from './numbering';
import { STANDARD_VARIANT_IDS } from './state';
import type { StandardVariantId } from './state';

/** The ids of the built-in presets. See `presets.ts`. */
export const PRESET_IDS = [
  'portes',
  'plakoto',
  'plakoto.federation',
  'fevga',
  'asodio.kafeneio',
  'asodio.aceyDeuceyGreek',
  'asodio.aceyDeuceyAmerican',
] as const;

export type PresetId = (typeof PRESET_IDS)[number];

export function isPresetId(value: unknown): value is PresetId {
  return typeof value === 'string' && (PRESET_IDS as readonly string[]).includes(value);
}

/** Board and start position. */
export interface BoardRules {
  /**
   * Where the checkers start (each player, in own numbering).
   * - `'portes'`: 2/5/3/5 on 24/13/8/6 (`portes.md`, "Starting position").
   * - `'allOnOwn24'`: all 15 on own point 24 (`plakoto.md`, `fevga.md`).
   *   This is also Asodio's `startPosition="opponentAcePoint"` (`asodio.md`).
   * - `'offBoard'`: all 15 outside, not yet entered (`asodio.md` flag
   *   `startPosition`, default `"offBoard"`).
   */
  readonly startPosition: 'portes' | 'allOnOwn24' | 'offBoard';
}

/** Direction and general movement rules. */
export interface MovementRules {
  /**
   * How the two players move. `'contrary'` for Portes, Plakoto and Asodio;
   * `'parallel'` for Fevga (`tavli-match.md`, "Direction of movement").
   * A variant must reject a direction it does not support.
   */
  readonly direction: Direction;
  /**
   * `tavli-match.md` flag `higherDieRule` (default `true`): if only one die
   * can be played, play the higher one when possible.
   */
  readonly higherDieRule: boolean;
  /**
   * `fevga.md` flag `runnerRule` (default `true` in Fevga): only one checker
   * (the runner) may leave point 24 until it reaches `runnerTarget`.
   */
  readonly runnerRule: boolean;
  /**
   * `fevga.md` flag `runnerTarget` (default `"passMother"`, own point ≤ 11;
   * `"reachQuarter"` = own point ≤ 12).
   */
  readonly runnerTarget: 'passMother' | 'reachQuarter';
}

/** What landing on a lone opponent checker does. */
export interface CaptureRules {
  /**
   * - `'hit'`: the checker goes to the bar and must re-enter (Portes;
   *   Acey-Deucey).
   * - `'pin'`: the checker is pinned under ours (Plakoto; Asodio kafeneio).
   * - `'none'`: a single checker owns its point (Fevga).
   *
   * `asodio.md` flag `captureMode` (`"hit"` | `"pin"`, default `"pin"`).
   * `'none'` is added for Fevga (`fevga.md`, "Hitting / pinning").
   */
  readonly captureMode: 'hit' | 'pin' | 'none';
  /**
   * `portes.md` flag `noHitAndRunInHome` (default `false`, unverified): a
   * checker that hits inside the mover's home may not move again this turn.
   */
  readonly noHitAndRunInHome: boolean;
  /**
   * `plakoto.md` flag `intermediatePinBlocks` (default `false`): a combined
   * move may not pass over a lone opponent checker (edge case 9).
   */
  readonly intermediatePinBlocks: boolean;
  /**
   * `asodio.md` flag `nominateBlot` (default `false`): at the end of a turn
   * a player may name an own blot that the opponent must hit if possible.
   */
  readonly nominateBlot: boolean;
}

/** Entering checkers from outside the board or from the bar. */
export interface EntryRules {
  /**
   * `asodio.md` flag `firstEntryGate` (default `true`): until the first
   * checker has entered, only `firstEntryGateRolls` let a player enter.
   */
  readonly firstEntryGate: boolean;
  /**
   * `asodio.md` flag `firstEntryGateRolls` (default `"aceDeuceOrDouble"`;
   * `"doubleOnly"` follows cardgamesgr).
   */
  readonly firstEntryGateRolls: 'aceDeuceOrDouble' | 'doubleOnly';
  /**
   * `asodio.md` flag `mustEnterAllFirst` (default `true`, owner): no checker
   * may leave the starting quarter until all 15 have entered.
   */
  readonly mustEnterAllFirst: boolean;
  /**
   * `asodio.md` flag `moveWhileLoading` (default `false`, owner A2): while
   * loading, entered checkers may not move; every die enters a checker.
   * `true` lets them move inside the starting quarter.
   */
  readonly moveWhileLoading: boolean;
  /**
   * `asodio.md` flag `barEntryNeedsSpecial` (default `false`): a hit checker
   * re-enters only with a 1-2 or a double.
   */
  readonly barEntryNeedsSpecial: boolean;
}

/** Asodio's quarter-by-quarter rules. */
export interface QuarterRules {
  /**
   * `asodio.md` flag `quarterGathering` (default `true`, owner): all 15
   * checkers gather in one quarter before any checker leaves it.
   */
  readonly quarterGathering: boolean;
  /**
   * `asodio.md` flag `quarterLock` (default `true`, owner): a checker that
   * enters a new quarter is frozen there until all 15 are in that quarter.
   * The strict form of `quarterGathering`.
   */
  readonly quarterLock: boolean;
  /**
   * `asodio.md` flag `moveInsideFrozenQuarter` (default `false`): frozen
   * checkers may move inside their quarter.
   */
  readonly moveInsideFrozenQuarter: boolean;
}

/** Special rolls: the 1-2 (ασόδυο) and doubles. */
export interface SpecialRollRules {
  /**
   * After a 1-2, the player also chooses any double and plays it
   * (`asodio.md`, "Turn & dice rules" 3.2). Not in the flag table. The owner
   * said no (A3), so it is `false` in `asodio.kafeneio`.
   */
  readonly aceDeuceChoosesDouble: boolean;
  /**
   * `asodio.md` flag `complementaryDoubles` (default `false`): after a
   * double, also play its complement (sum 7, for example 6-6 → 1-1).
   */
  readonly complementaryDoubles: boolean;
}

/** Rolls that give the same player another roll. */
export interface ExtraRollRules {
  /** `asodio.md` flag `aceDeuceExtraRoll` (default `false`, owner A3): roll again after a 1-2. */
  readonly aceDeuceExtraRoll: boolean;
  /**
   * `asodio.md` flag `doublesGiveExtraRoll` (default `false`, owner A3):
   * roll again after a fully played double.
   */
  readonly doublesGiveExtraRoll: boolean;
}

/** Bearing off. */
export interface BearOffRules {
  /**
   * `asodio.md` flag `exactBearOff` (default `false`): a die bears off only
   * from its exact point; no "highest point" rule.
   */
  readonly exactBearOff: boolean;
  /**
   * `plakoto.md` flag `bearOffWhilePinned` (default `false`): a player may
   * bear off while one of their checkers is pinned.
   */
  readonly bearOffWhilePinned: boolean;
}

/** Fevga prime rules (`fevga.md`, "Prime restrictions"). */
export interface PrimeRules {
  /**
   * `fevga.md` flag `primeRulesOff` (default `false`): turns off P1, P2, P3
   * and `noPrimeOwnHome`. When it is `true`, those four flags must be `false`
   * too, so the data never says two things.
   */
  readonly primeRulesOff: boolean;
  /** `fevga.md` flag `p1NoPrimeOwnStart` (default `true`): P1, no prime on own 19–24. */
  readonly p1NoPrimeOwnStart: boolean;
  /**
   * `fevga.md` flag `p2NoPrimeFrontOfMother` (default `true`): P2, no prime
   * in front of the opponent's mother (window `p2Window`).
   */
  readonly p2NoPrimeFrontOfMother: boolean;
  /** `fevga.md` flag `p2Window` (default `"6-11"`): own points for P2. */
  readonly p2Window: '6-11' | '7-12';
  /**
   * `fevga.md` flag `p3MustLeaveMove` (default `true`): P3, leave the
   * opponent at least one legal move, if possible.
   */
  readonly p3MustLeaveMove: boolean;
  /** `fevga.md` flag `p3Priority` (default `"afterDiceRule"`). */
  readonly p3Priority: 'afterDiceRule' | 'beforeDiceRule';
  /** `fevga.md` flag `noPrimeOwnHome` (default `false`): no prime on own 1–6. */
  readonly noPrimeOwnHome: boolean;
  /** `fevga.md` flag `primeCheckTiming` (default `"endOfTurn"`). */
  readonly primeCheckTiming: 'endOfTurn' | 'afterEachMove';
}

/** Plakoto's mother (μάνα) rule. */
export interface MotherRules {
  /**
   * `plakoto.md` flag `motherRule` (default `"offerConcede"`, owner):
   * `"offerConcede"` = the pinned player resigns (2 points) or plays on;
   * `"federation"` = ΕΟΠΤ 3.3.iii; `"instant"` = 2 points at once, no draw;
   * `"none"` = no special result. Games without a mother use `"none"`.
   */
  readonly motherRule: 'offerConcede' | 'federation' | 'instant' | 'none';
  /** `plakoto.md` flag `motherCheckTiming` (default `"afterEachMove"`). */
  readonly motherCheckTiming: 'afterEachMove' | 'endOfTurn';
  /** `plakoto.md` flag `mutualMotherPin` (default `"draw"`). */
  readonly mutualMotherPin: 'draw' | 'replay';
}

/** Points for one game. */
export interface ScoringRules {
  /**
   * `asodio.md` flag `scoring` (default `"tavli"`): `"tavli"` = mono 1 /
   * diplo 2; `"perChecker"` = 1 per checker the loser has not borne off;
   * `"singleOnly"` = always 1.
   */
  readonly method: 'tavli' | 'perChecker' | 'singleOnly';
  /**
   * `portes.md` flag `backgammonScores3` (default `false`, owner: only mono
   * 1 and diplo 2). `true` scores an international "backgammon" as 3.
   */
  readonly backgammonScores3: boolean;
  /** `portes.md` flag `doublingCube` (default `false`). */
  readonly doublingCube: boolean;
  /** `asodio.md` flag `deadlock` (default `"draw"`, owner A5): no one can ever move. */
  readonly deadlock: 'draw';
}

/** The match around the games (`tavli-match.md`). */
export interface MatchRules {
  /** `tavli-match.md` flag `targetPoints` (default `3`, owner). Any positive integer. */
  readonly targetPoints: number;
  /**
   * `tavli-match.md` flag `rotation` (default Portes → Plakoto → Fevga).
   * One entry = single-game mode. Asodio is not in the standard rotation
   * (`asodio.md`), so the Asodio presets use `['asodio']`.
   */
  readonly rotation: readonly StandardVariantId[];
  /** `tavli-match.md` flag `openingRoll` (default `"useOpeningDice"`, owner / ΕΟΠΤ). */
  readonly openingRoll: 'useOpeningDice' | 'rerollBoth' | 'chosenStarterRolls';
  /** `tavli-match.md` flag `nextGameStarter` (default `"previousWinner"`). */
  readonly nextGameStarter: 'previousWinner' | 'alternate' | 'openingRoll';
  /** `tavli-match.md` flag `afterDrawStarter` (default `"openingRoll"`, ΕΟΠΤ 3.1.ii). */
  readonly afterDrawStarter: 'openingRoll' | 'previousStarter';
  /**
   * `tavli-match.md` flag `rematchStarter` (default `"lastGameWinner"`,
   * owner): who starts a rematch in the same session. In the text, not in
   * the table.
   */
  readonly rematchStarter: 'lastGameWinner' | 'openingRoll';
}

/** The flag groups. Every `RuleSet` has all of them. */
export interface RuleGroups {
  readonly board: BoardRules;
  readonly movement: MovementRules;
  readonly capture: CaptureRules;
  readonly entry: EntryRules;
  readonly quarters: QuarterRules;
  readonly specialRolls: SpecialRollRules;
  readonly extraRolls: ExtraRollRules;
  readonly bearOff: BearOffRules;
  readonly primes: PrimeRules;
  readonly mother: MotherRules;
  readonly scoring: ScoringRules;
  readonly match: MatchRules;
}

export type RuleGroupName = keyof RuleGroups;

/** The full rules of one game. Plain JSON. */
export interface RuleSet extends RuleGroups {
  /** The preset these rules start from. Overrides do not change it. */
  readonly presetId: PresetId;
  /** The preset's version (integer ≥ 1). Bump it in `presets.ts` when a preset changes. */
  readonly version: number;
}

/**
 * Changes on top of a preset, for `resolveRules`. Same groups as `RuleSet`,
 * every field optional. Lists (like `match.rotation`) replace the preset's
 * list; they are not merged.
 */
export type RuleOverrides = {
  readonly [G in RuleGroupName]?: Partial<RuleGroups[G]>;
};

// ---------------------------------------------------------------------------
// Field schema: used by the validator and by the README / tests.

export type FieldSpec =
  | { readonly kind: 'boolean' }
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'integer'; readonly min: number }
  | {
      readonly kind: 'list';
      readonly values: readonly string[];
      readonly minLength: number;
      readonly maxLength: number;
    };

const bool = { kind: 'boolean' } as const;
function oneOf<const T extends readonly string[]>(...values: T) {
  return { kind: 'enum', values } as const;
}

/** The shape of every group: field name → allowed values. */
export const RULE_SCHEMA = {
  board: {
    startPosition: oneOf('portes', 'allOnOwn24', 'offBoard'),
  },
  movement: {
    direction: oneOf('contrary', 'parallel'),
    higherDieRule: bool,
    runnerRule: bool,
    runnerTarget: oneOf('passMother', 'reachQuarter'),
  },
  capture: {
    captureMode: oneOf('hit', 'pin', 'none'),
    noHitAndRunInHome: bool,
    intermediatePinBlocks: bool,
    nominateBlot: bool,
  },
  entry: {
    firstEntryGate: bool,
    firstEntryGateRolls: oneOf('aceDeuceOrDouble', 'doubleOnly'),
    mustEnterAllFirst: bool,
    moveWhileLoading: bool,
    barEntryNeedsSpecial: bool,
  },
  quarters: {
    quarterGathering: bool,
    quarterLock: bool,
    moveInsideFrozenQuarter: bool,
  },
  specialRolls: {
    aceDeuceChoosesDouble: bool,
    complementaryDoubles: bool,
  },
  extraRolls: {
    aceDeuceExtraRoll: bool,
    doublesGiveExtraRoll: bool,
  },
  bearOff: {
    exactBearOff: bool,
    bearOffWhilePinned: bool,
  },
  primes: {
    primeRulesOff: bool,
    p1NoPrimeOwnStart: bool,
    p2NoPrimeFrontOfMother: bool,
    p2Window: oneOf('6-11', '7-12'),
    p3MustLeaveMove: bool,
    p3Priority: oneOf('afterDiceRule', 'beforeDiceRule'),
    noPrimeOwnHome: bool,
    primeCheckTiming: oneOf('endOfTurn', 'afterEachMove'),
  },
  mother: {
    motherRule: oneOf('offerConcede', 'federation', 'instant', 'none'),
    motherCheckTiming: oneOf('afterEachMove', 'endOfTurn'),
    mutualMotherPin: oneOf('draw', 'replay'),
  },
  scoring: {
    method: oneOf('tavli', 'perChecker', 'singleOnly'),
    backgammonScores3: bool,
    doublingCube: bool,
    deadlock: oneOf('draw'),
  },
  match: {
    targetPoints: { kind: 'integer', min: 1 },
    rotation: {
      kind: 'list',
      values: STANDARD_VARIANT_IDS,
      minLength: 1,
      maxLength: 12,
    },
    openingRoll: oneOf('useOpeningDice', 'rerollBoth', 'chosenStarterRolls'),
    nextGameStarter: oneOf('previousWinner', 'alternate', 'openingRoll'),
    afterDrawStarter: oneOf('openingRoll', 'previousStarter'),
    rematchStarter: oneOf('lastGameWinner', 'openingRoll'),
  },
} as const satisfies { readonly [G in RuleGroupName]: Record<keyof RuleGroups[G], FieldSpec> };

/** The value type a field spec allows. */
type SpecValue<S> = S extends { readonly kind: 'boolean' }
  ? boolean
  : S extends { readonly kind: 'enum'; readonly values: readonly (infer V)[] }
    ? V
    : S extends { readonly kind: 'integer' }
      ? number
      : S extends { readonly kind: 'list'; readonly values: readonly (infer V)[] }
        ? readonly V[]
        : never;

/** `RuleGroups` as the schema describes it. A test checks that it equals `RuleGroups`. */
export type RuleGroupsFromSchema = {
  readonly [G in keyof typeof RULE_SCHEMA]: {
    readonly [K in keyof (typeof RULE_SCHEMA)[G]]: SpecValue<(typeof RULE_SCHEMA)[G][K]>;
  };
};

/** The group names, in the order they appear in a `RuleSet`. */
export const RULE_GROUPS = Object.keys(RULE_SCHEMA) as readonly RuleGroupName[];
