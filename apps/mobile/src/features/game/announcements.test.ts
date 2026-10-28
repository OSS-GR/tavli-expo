import {
  asodio,
  createGameFlow,
  createSeededRng,
  legalNextMoves,
  resolveRules,
  type PlayerId,
} from '@tavli/engine';
import { createMemoryGameServer } from '@tavli/online';
import { pickTurn } from '@tavli/online/testing';

import { gameRuleSet, type OpeningRollRule } from '@/features/match/setup';
import { viewFlow } from '@/features/online/onlineStore';
import i18n from '@/i18n';

import {
  onlineOpeningLine,
  onlineTurnAnnouncement,
  turnAnnouncement,
  type AnnouncementNames,
} from './announcements';
import { createGameStore } from './gameStore';
import { diceWereRolled } from './rolledDice';

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

  // Greek names each double by its value (the owner's words).
  it.each([
    [1, 'ασσάκια'],
    [2, 'δυάρες'],
    [3, 'τριάρες'],
    [4, 'τεσσάρες'],
    [5, 'πεντάρες'],
    [6, 'εξάρες'],
  ] as const)('reads %i-%i in Greek by its name: %s', async (value, name) => {
    await i18n.changeLanguage('el');
    const { dispatch, announce } = afterFirstTurn();
    dispatch({ type: 'roll', player: 'black', dice: [value, value] });
    expect(announce()?.text).toBe(`Bot: έφερε ${name}: τέσσερις κινήσεις του ${value}.`);
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

describe('turnAnnouncement with an opening roll house rule (#207)', () => {
  const storeWith = (openingRoll: OpeningRollRule) =>
    createGameStore({
      players: names,
      rules: gameRuleSet('portes', openingRoll),
      rng: createSeededRng(3),
    });

  it('rerollBoth: the starter’s own first roll is read', () => {
    const store = storeWith('rerollBoth');
    const { dispatch } = store.getState();
    dispatch({ type: 'rollOpening', player: 'white', die: 5 });
    dispatch({ type: 'rollOpening', player: 'black', die: 3 });
    const announce = () => turnAnnouncement(store.getState().flow, i18n.t, passAndPlay);
    // The opening card says who starts.
    expect(announce()).toBeNull();
    dispatch({ type: 'roll', player: 'white', dice: [6, 6] });
    expect(announce()?.text).toBe('Ann rolled double 6: four moves of 6.');
  });

  it('chosenStarterRolls: says who was picked, then reads the roll', () => {
    const store = storeWith('chosenStarterRolls');
    const { dispatch } = store.getState();
    const announce = () => turnAnnouncement(store.getState().flow, i18n.t, vsBot);
    expect(announce()).toBeNull();
    dispatch({ type: 'chooseStarter', player: 'white' });
    expect(announce()).toEqual({ key: '0:1:starter', text: 'You start.' });
    dispatch({ type: 'roll', player: 'white', dice: [4, 2] });
    expect(announce()).toEqual({ key: '0:1:roll', text: 'You rolled 4-2.' });

    const other = storeWith('chosenStarterRolls');
    other.getState().dispatch({ type: 'chooseStarter', player: 'black' });
    expect(turnAnnouncement(other.getState().flow, i18n.t, passAndPlay)?.text).toBe('Bot starts.');
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
    expect(diceWereRolled(store.getState().flow)).toBe(true);
    expect(announce()?.text).toBe('You rolled double 5: four moves of 5.');
  });

  it('reads a chosen double in Greek', async () => {
    await i18n.changeLanguage('el');
    const you = afterAceDeuce('white');
    you.dispatch({ type: 'answer', player: 'white', choice: '4' });
    expect(you.announce()?.text).toBe('Διάλεξες τεσσάρες: τέσσερις κινήσεις του 4.');
    const bot = afterAceDeuce('black');
    bot.dispatch({ type: 'answer', player: 'black', choice: '4' });
    expect(bot.announce()?.text).toMatch(/ Bot: διάλεξε τεσσάρες: τέσσερις κινήσεις του 4\.$/);
  });

  it.each([
    ['1', 'ασσάκια'],
    ['2', 'δυάρες'],
    ['3', 'τριάρες'],
    ['4', 'τεσσάρες'],
    ['5', 'πεντάρες'],
    ['6', 'εξάρες'],
  ])('names the chosen double %s in Greek by its value: %s', async (value, name) => {
    await i18n.changeLanguage('el');
    const { dispatch, announce } = afterAceDeuce('white');
    dispatch({ type: 'answer', player: 'white', choice: value });
    expect(announce()?.text).toBe(`Διάλεξες ${name}: τέσσερις κινήσεις του ${value}.`);
  });
});

describe('online announcements (#255)', () => {
  const online = {
    nameOf: (p: PlayerId) => (p === 'white' ? 'You' : 'Opponent'),
    isYou: (p: PlayerId) => p === 'white',
  };
  const game = () => {
    const server = createMemoryGameServer({ rng: createSeededRng(5), now: () => 0 });
    const gameId = server.createGame('me', { white: 'me', black: 'bot' }, 'portes', 3, 'live');
    const view = () => server.getGame(gameId)!;
    const play = async () => {
      const player = view().waitingFor === 'white' ? 'me' : 'bot';
      await server.transportFor(player).sendTurn({
        gameId,
        expectedVersion: view().version,
        moves: pickTurn(view().game, createSeededRng(view().version)),
      });
    };
    return { view, play };
  };

  it('says who starts, with the server’s opening roll', () => {
    const { view } = game();
    const flow = viewFlow(view());
    const line = onlineOpeningLine(flow.game, i18n.t, online);
    expect(line).toMatch(/^(You start|Opponent starts) with [1-6]-[1-6]\.$/);
    // The screen reader hears the same line.
    expect(onlineTurnAnnouncement(flow, i18n.t, online)).toBe(line);
  });

  it('reads the opponent’s whole turn and your roll in one text', async () => {
    const { view, play } = game();
    while (view().waitingFor !== 'black') await play();
    await play();
    const flow = viewFlow(view());
    expect(onlineOpeningLine(flow.game, i18n.t, online)).toBeNull();
    const [a, b] = flow.game.state.dice!;
    const roll = a === b ? /You rolled double/ : new RegExp(`You rolled ${a}-${b}\\.$`);
    const text = onlineTurnAnnouncement(flow, i18n.t, online);
    expect(text).toMatch(/^Opponent played: Checker from point \d+ to point \d+/);
    expect(text).toMatch(roll);
  });

  it('does not read your own turn back to you', async () => {
    const { view, play } = game();
    while (view().waitingFor !== 'white') await play();
    await play();
    const flow = viewFlow(view());
    expect(flow.game.lastTurn?.player).toBe('white');
    expect(onlineTurnAnnouncement(flow, i18n.t, online)).toMatch(/^Opponent rolled /);
  });
});
