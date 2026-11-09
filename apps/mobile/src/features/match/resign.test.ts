/**
 * The Resign match dialog shows what the engine will score. The dialog asks
 * `previewResignMatch` (a phase check in the app), the engine decides in the
 * `resignMatch` action (a phase check in `applyMatchAction`). This test keeps
 * the two together for every phase of a game, so the dialog never promises a
 * score the match will not get.
 */
import {
  applyMatchAction,
  createMatchFlow,
  matchPhase,
  type MatchAction,
  type MatchFlow,
} from '@tavli/engine';

import { previewResignMatch } from './resign';

function act(flow: MatchFlow, actions: readonly MatchAction[]): MatchFlow {
  return actions.reduce((f, action) => applyMatchAction(f, action), flow);
}

const OPENING = createMatchFlow({ targetPoints: 5 });
const AWAITING_ROLL = createMatchFlow({ targetPoints: 5, starter: 'white' });
const MOVING = act(AWAITING_ROLL, [{ type: 'roll', player: 'white', dice: [3, 1] }]);
const AWAITING_CONFIRM = act(MOVING, [
  { type: 'move', player: 'white', move: { from: 8, to: 5, die: 3 } },
  { type: 'move', player: 'white', move: { from: 6, to: 5, die: 1 } },
]);
const GAME_OVER = act(MOVING, [{ type: 'resign', player: 'white' }]);
const MATCH_OVER = act(AWAITING_ROLL, [{ type: 'resignMatch', player: 'white' }]);

/** Every phase of a match, with whether a game is in play (the engine scores it). */
const CASES: readonly { name: string; flow: MatchFlow; phase: string; inPlay: boolean }[] = [
  { name: 'opening roll', flow: OPENING, phase: 'opening-roll', inPlay: false },
  { name: 'before the first roll', flow: AWAITING_ROLL, phase: 'awaiting-roll', inPlay: true },
  { name: 'moving', flow: MOVING, phase: 'moving', inPlay: true },
  { name: 'turn to confirm', flow: AWAITING_CONFIRM, phase: 'awaiting-confirm', inPlay: true },
  { name: 'game over', flow: GAME_OVER, phase: 'game-over', inPlay: false },
];

describe('previewResignMatch follows the engine (docs/rules/tavli-match.md, "Resigning")', () => {
  it.each(CASES)('$name: the game in play is scored as the dialog says', (c) => {
    // The case is the phase it is named for.
    expect(c.flow.game.phase).toBe(c.phase);
    expect(matchPhase(c.flow)).not.toBe('match-over');

    const preview = previewResignMatch(c.flow, 'white');
    const after = applyMatchAction(c.flow, { type: 'resignMatch', player: 'white' });
    const added = after.match.games.length - c.flow.match.games.length;

    expect(preview !== null).toBe(c.inPlay);
    if (preview === null) {
      // Nothing is added: the score stays as it was.
      expect(added).toBe(0);
      expect(after.match.score).toEqual(c.flow.match.score);
    } else {
      // One resigned game is added, with the points and score the dialog showed.
      expect(added).toBe(1);
      expect(after.match.games.at(-1)).toMatchObject({
        winner: preview.result.winner,
        points: preview.result.points,
        reason: 'resigned',
      });
      expect(after.match.score).toEqual(preview.score);
    }
    expect(after.match).toMatchObject({ status: 'finished', resignedBy: 'white' });
  });

  it('a finished match: no dialog, and the engine refuses another resign', () => {
    expect(matchPhase(MATCH_OVER)).toBe('match-over');
    expect(previewResignMatch(MATCH_OVER, 'white')).toBeNull();
    expect(() => applyMatchAction(MATCH_OVER, { type: 'resignMatch', player: 'black' })).toThrow(
      expect.objectContaining({ code: 'ILLEGAL_ACTION' }),
    );
  });

  it('the other player may resign too: the preview and the engine score their opponent', () => {
    const preview = previewResignMatch(MOVING, 'black');
    const after = applyMatchAction(MOVING, { type: 'resignMatch', player: 'black' });
    expect(preview?.result.winner).toBe('white');
    expect(after.match.score).toEqual(preview?.score);
    expect(after.match).toMatchObject({ winner: 'white', resignedBy: 'black' });
  });
});
