import { createSeededRng, legalNextMoves, type PlayerId } from '@tavli/engine';

import i18n from '@/i18n';

import { turnAnnouncement } from './announcements';
import { createGameStore } from './gameStore';

const names = { white: 'Ann', black: 'Bot' } as const;
const vsBot = {
  nameOf: (p: PlayerId) => (p === 'white' ? 'You' : 'Bot'),
  isYou: (p: PlayerId) => p === 'white',
};
const passAndPlay = { nameOf: (p: PlayerId) => names[p], isYou: () => false };

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

/** A match where White has won the opening and played its first turn. */
function afterFirstTurn() {
  const store = createGameStore({ players: names, rng: createSeededRng(3) });
  const { dispatch } = store.getState();
  dispatch({ type: 'rollOpening', player: 'white', die: 5 });
  dispatch({ type: 'rollOpening', player: 'black', die: 3 });
  const announce = () => turnAnnouncement(store.getState().flow, i18n.t, vsBot);
  // The opening card already says who starts and with what.
  expect(announce()).toBeNull();
  dispatch({ type: 'move', player: 'white', move: { from: 13, to: 8, die: 5 } });
  dispatch({ type: 'move', player: 'white', move: { from: 24, to: 21, die: 3 } });
  dispatch({ type: 'confirm', player: 'white' });
  return { store, dispatch, announce };
}

describe('turnAnnouncement', () => {
  it('reads the bot’s roll and its moves, never your own moves', () => {
    const { store, dispatch, announce } = afterFirstTurn();
    // Your own turn is not read back to you.
    expect(announce()).toBeNull();
    dispatch({ type: 'roll', player: 'black', dice: [6, 4] });
    expect(announce()).toEqual({ key: '0:2:roll', text: 'Bot rolled 6-4.' });
    // The first move ends the "rolled" line.
    const first = legalNextMoves(store.getState().flow.game)[0]!.moves[0]!;
    dispatch({ type: 'move', player: 'black', move: first });
    expect(announce()).toBeNull();
    const second = legalNextMoves(store.getState().flow.game)[0]!.moves[0]!;
    dispatch({ type: 'move', player: 'black', move: second });
    dispatch({ type: 'confirm', player: 'black' });
    const played = announce();
    expect(played?.key).toBe('0:3:played');
    expect(played?.text).toMatch(
      /^Bot played: Checker from point \d+ to point \d+.*\. Your turn\.$/,
    );
    expect(played?.text.split('; ')).toHaveLength(2);
    dispatch({ type: 'roll', player: 'white', dice: [3, 1] });
    expect(announce()).toEqual({ key: '0:3:roll', text: 'You rolled 3-1.' });
  });

  it('pass-and-play: reads every turn, so the next player hears it', () => {
    const { store } = afterFirstTurn();
    expect(turnAnnouncement(store.getState().flow, i18n.t, passAndPlay)?.text).toBe(
      'Ann played: Checker from point 13 to point 8; Checker from point 24 to point 21. The turn passes to Bot.',
    );
  });

  it('says nothing once the game is over (the game-end sheet reads the result)', () => {
    const { store, dispatch } = afterFirstTurn();
    dispatch({ type: 'resign', player: 'black' });
    expect(store.getState().flow.game.result).not.toBeNull();
    expect(turnAnnouncement(store.getState().flow, i18n.t, passAndPlay)).toBeNull();
  });
});
