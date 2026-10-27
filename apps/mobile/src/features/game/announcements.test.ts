import {
  asodio,
  createGameFlow,
  createSeededRng,
  legalNextMoves,
  resolveRules,
  type PlayerId,
} from '@tavli/engine';

import i18n from '@/i18n';

import { turnAnnouncement, type AnnouncementNames } from './announcements';
import { createGameStore, diceChosen } from './gameStore';

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

  it('says that a double plays four times, once (#177)', () => {
    const { store, dispatch, announce } = afterFirstTurn();
    dispatch({ type: 'roll', player: 'black', dice: [4, 4] });
    expect(announce()).toEqual({ key: '0:2:roll', text: 'Bot rolled double 4: four moves of 4.' });
    // The same key while the dice split: `useAnnouncement` reads it once.
    expect(announce()?.key).toBe('0:2:roll');
    const nextMove = () => legalNextMoves(store.getState().flow.game)[0]?.moves[0];
    dispatch({ type: 'move', player: 'black', move: nextMove()! });
    expect(announce()).toBeNull();
    for (let move = nextMove(); move !== undefined; move = nextMove()) {
      dispatch({ type: 'move', player: 'black', move });
    }
    expect(store.getState().flow.game.played).toHaveLength(4);
    dispatch({ type: 'confirm', player: 'black' });
    dispatch({ type: 'roll', player: 'white', dice: [2, 2] });
    expect(announce()?.text).toBe('You rolled double 2: four moves of 2.');
  });

  it('reads a double in Greek', async () => {
    await i18n.changeLanguage('el');
    const { dispatch, announce } = afterFirstTurn();
    dispatch({ type: 'roll', player: 'black', dice: [4, 4] });
    expect(announce()?.text).toBe('Bot: έφερε διπλές 4: τέσσερις κινήσεις του 4.');
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

/**
 * Acey-Deucey Asodio: `player` plays a 1-2 from the empty board and must
 * now choose a double (`chooseDouble`).
 */
function afterAceDeuce(player: PlayerId) {
  const rules = resolveRules('asodio.aceyDeuceyGreek');
  const store = createGameStore({ players: names, rules, rng: createSeededRng(3) });
  const state = asodio.initialState({ startingPlayer: player, rules });
  store.setState({
    flow: { ...store.getState().flow, game: createGameFlow({ state, starter: player }) },
  });
  const { dispatch } = store.getState();
  dispatch({ type: 'roll', player, dice: [1, 2] });
  const nextMove = () => legalNextMoves(store.getState().flow.game)[0]?.moves[0];
  dispatch({ type: 'move', player, move: nextMove()! });
  dispatch({ type: 'move', player, move: nextMove()! });
  dispatch({ type: 'confirm', player });
  expect(store.getState().flow.game.phase).toBe('awaiting-answer');
  const announce = (who: AnnouncementNames = vsBot) =>
    turnAnnouncement(store.getState().flow, i18n.t, who);
  return { store, dispatch, nextMove, announce };
}

describe('turnAnnouncement: a chosen double (#202)', () => {
  it('says you chose the double, not that you rolled it', () => {
    const { store, dispatch, nextMove, announce } = afterAceDeuce('white');
    // The question is open: nothing to read yet.
    expect(announce()).toBeNull();
    dispatch({ type: 'answer', player: 'white', choice: '4' });
    expect(store.getState().flow.game.phase).toBe('moving');
    expect(announce()).toEqual({ key: '0:2:chosen', text: 'You chose double 4: four moves of 4.' });
    // A move ends the line. An undo to the turn start gives the same line and key, as after a roll.
    dispatch({ type: 'move', player: 'white', move: nextMove()! });
    expect(announce()).toBeNull();
    dispatch({ type: 'undo', player: 'white' });
    expect(announce()?.key).toBe('0:2:chosen');
  });

  it('reads the bot’s 1-2 and the double it chose, by name', () => {
    const { dispatch, announce } = afterAceDeuce('black');
    dispatch({ type: 'answer', player: 'black', choice: '6' });
    const said = announce();
    expect(said?.key).toBe('0:2:chosen');
    expect(said?.text).toMatch(
      /^Bot played: [^.]+; [^.]+\. Bot chose double 6: four moves of 6\.$/,
    );
    expect(said?.text).not.toMatch(/rolled/);
  });

  it('pass-and-play: the other player hears who chose which double', () => {
    const { dispatch, announce } = afterAceDeuce('white');
    dispatch({ type: 'answer', player: 'white', choice: '3' });
    expect(announce(passAndPlay)?.text).toMatch(
      /^Ann played: [^.]+; [^.]+\. Ann chose double 3: four moves of 3\.$/,
    );
  });

  it('a rolled double in the same rules still says "rolled"', () => {
    const { store, dispatch, nextMove, announce } = afterAceDeuce('white');
    dispatch({ type: 'answer', player: 'white', choice: '2' });
    for (let move = nextMove(); move !== undefined; move = nextMove()) {
      dispatch({ type: 'move', player: 'white', move });
    }
    dispatch({ type: 'confirm', player: 'white' });
    // All four moves played: the same player rolls again (asodio.md 3.3).
    expect(store.getState().flow.game.state.toMove).toBe('white');
    dispatch({ type: 'roll', player: 'white', dice: [5, 5] });
    expect(diceChosen(store.getState().flow)).toBe(false);
    expect(announce()?.text).toBe('You rolled double 5: four moves of 5.');
  });

  it('reads a chosen double in Greek', async () => {
    await i18n.changeLanguage('el');
    const you = afterAceDeuce('white');
    you.dispatch({ type: 'answer', player: 'white', choice: '4' });
    expect(you.announce()?.text).toBe('Διάλεξες διπλές 4: τέσσερις κινήσεις του 4.');
    const bot = afterAceDeuce('black');
    bot.dispatch({ type: 'answer', player: 'black', choice: '4' });
    expect(bot.announce()?.text).toMatch(/ Bot: διάλεξε διπλές 4: τέσσερις κινήσεις του 4\.$/);
  });
});

describe('diceChosen (#202)', () => {
  it('is true only while the turn plays the double chosen after a 1-2', () => {
    const { store, dispatch, nextMove } = afterAceDeuce('white');
    const chosen = () => diceChosen(store.getState().flow);
    expect(chosen()).toBe(false);
    dispatch({ type: 'answer', player: 'white', choice: '1' });
    expect(chosen()).toBe(true);
    dispatch({ type: 'move', player: 'white', move: nextMove()! });
    expect(chosen()).toBe(true);
    dispatch({ type: 'undo', player: 'white' });
    expect(chosen()).toBe(true);
  });

  it('is false for rolled dice', () => {
    const { store, dispatch } = afterFirstTurn();
    expect(diceChosen(store.getState().flow)).toBe(false);
    dispatch({ type: 'roll', player: 'black', dice: [4, 4] });
    expect(diceChosen(store.getState().flow)).toBe(false);
  });
});
