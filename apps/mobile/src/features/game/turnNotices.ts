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

/** How the game was won: mono (1), diplo (2), or another number of points. */
export type WinType = 'mono' | 'diplo' | 'points';

/**
 * The win type of a game worth `points`, by the scoring of its rules.
 * With `perChecker` scoring (Acey-Deucey American, #241, #245) there is no
 * mono or diplo: each point is a checker the loser has not borne off, so
 * the screens say "+1 point" or "+2 points".
 */
export function winType(
  result: { readonly points: number },
  scoring: RuleSet['scoring']['method'] = 'tavli',
): WinType {
  if (scoring === 'perChecker') return 'points';
  if (result.points === 1) return 'mono';
  if (result.points === 2) return 'diplo';
  return 'points';
}
