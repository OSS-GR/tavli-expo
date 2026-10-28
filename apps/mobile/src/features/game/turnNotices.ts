/**
 * Turn notices the board screen shows. Pure.
 */
import type { Dice, GameFlow, MatchFlow, PlayerId, RuleSet } from '@tavli/engine';

/** The last turn was a pass: the player rolled and no checker could move (wireframe 6f). */
export interface PassNotice {
  /** Unique per pass, so a dismissed notice stays dismissed. */
  readonly key: string;
  readonly player: PlayerId;
  readonly dice: Dice;
}

export function passNotice(flow: MatchFlow): PassNotice | null {
  const game: GameFlow = flow.game;
  const last = game.lastTurn;
  if (last === null || last.moves.length > 0) return null;
  if (game.phase !== 'awaiting-roll' || game.state.toMove === last.player) return null;
  return {
    key: `${flow.match.games.length}:${game.state.turnNumber}`,
    player: last.player,
    dice: last.dice,
  };
}

/**
 * How the game was won: mono (1), diplo (2), another number of points (a
 * Tavli-scored backgammon, 3), or `perChecker`: 1 point per checker the
 * loser has not borne off (Acey-Deucey American, #241, #245).
 */
export type WinType = 'mono' | 'diplo' | 'points' | 'perChecker';

/**
 * The win type of a game worth `points`, by the scoring of its rules.
 * With `perChecker` scoring every win is `perChecker`, whatever the points:
 * there is no mono or diplo, and the screens count the checkers instead.
 */
export function winType(
  result: { readonly points: number },
  scoring: RuleSet['scoring']['method'] = 'tavli',
): WinType {
  if (scoring === 'perChecker') return 'perChecker';
  if (result.points === 1) return 'mono';
  if (result.points === 2) return 'diplo';
  return 'points';
}

/**
 * Does the game-end chip of this win get the filled (strong) style? A
 * diplo does, and so does a Tavli-scored win of more points (a backgammon,
 * 3). A mono and a per-checker win get the outlined chip (#245).
 */
export function isStrongWin(type: WinType): boolean {
  switch (type) {
    case 'diplo':
    case 'points':
      return true;
    case 'mono':
    case 'perChecker':
      return false;
  }
}
