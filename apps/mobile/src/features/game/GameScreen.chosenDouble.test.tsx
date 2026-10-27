/**
 * Screen readers and a chosen double (#202). In the Acey-Deucey presets of
 * Asodio a 1-2 lets the player choose a double. Nobody rolls it, so the
 * screen says "chose", not "rolled". (How the dice show is in
 * `GameScreen.doubles.test.tsx`.)
 */
import { InlineBotRunner, createBot } from '@tavli/bot';
import {
  asodio,
  createGameFlow,
  createSeededRng,
  legalNextMoves,
  resolveRules,
  type MatchAction,
  type PerPlayer,
  type PlayerId,
  type Rng,
} from '@tavli/engine';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { AccessibilityInfo } from 'react-native';

import { DOUBLE_SPLIT_AT_MS } from '@/features/board/diceMotion';
import { DOUBLE_LABEL_MS } from '@/features/board/useDoubleReveal';
import i18n from '@/i18n';

import { createGameStore, type GameStore } from './gameStore';
import { GameScreen, type BotSeat } from './GameScreen';
import { diceWereRolled } from './rolledDice';
import type { Seat } from './seats';

import { runOnFakeTimers } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';

const SIZE = { width: 375, height: 500 };
const rules = resolveRules('asodio.aceyDeuceyGreek');
const seats: PerPlayer<Seat> = {
  white: { name: 'You', label: 'You', turnLabel: 'Your turn', you: true },
  black: { name: 'Bot', label: 'Bot · Easy', turnLabel: 'Playing', you: false },
};

/** An Acey-Deucey game from the empty board, `player` to roll. */
function aceyDeucey(player: PlayerId, rng: Rng = createSeededRng(5)): GameStore {
  const store = createGameStore({ players: { white: 'Ann', black: 'Bob' }, rules, rng });
  const state = asodio.initialState({ startingPlayer: player, rules });
  store.setState({
    flow: { ...store.getState().flow, game: createGameFlow({ state, starter: player }) },
  });
  return store;
}

async function show(store: GameStore, props: Partial<ComponentProps<typeof GameScreen>> = {}) {
  await renderWithRoot(<GameScreen store={store} {...props} />);
  await act(async () => {
    fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
    });
  });
}

const tick = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

/** White rolls 1-2 and plays it: the question "which double?" is open. */
async function whitePlaysAceDeuce(store: GameStore) {
  const send = async (action: MatchAction) => {
    await act(async () => {
      expect(store.getState().dispatch(action)).toBe(true);
    });
  };
  await send({ type: 'roll', player: 'white', dice: [1, 2] });
  for (let i = 0; i < 2; i++) {
    const move = legalNextMoves(store.getState().flow.game)[0]!.moves[0]!;
    await send({ type: 'move', player: 'white', move });
  }
  await send({ type: 'confirm', player: 'white' });
  expect(store.getState().flow.game.phase).toBe('awaiting-answer');
  return send;
}

let announce: jest.SpyInstance;
const said = () => announce.mock.calls.map(([text]) => String(text));

// The screen and the bot run on timers.
runOnFakeTimers();

beforeEach(async () => {
  await i18n.changeLanguage('en');
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(() => {
  announce.mockRestore();
});

describe('<GameScreen /> a chosen double is read as chosen (#202)', () => {
  it('your choice: "You chose double 4: four moves of 4", once, and never "rolled"', async () => {
    const store = aceyDeucey('white');
    await show(store, { seats });
    const send = await whitePlaysAceDeuce(store);
    await send({ type: 'answer', player: 'white', choice: '4' });
    await tick(DOUBLE_SPLIT_AT_MS + DOUBLE_LABEL_MS);

    expect(said().filter((t) => t === 'You chose double 4: four moves of 4.')).toHaveLength(1);
    expect(said().filter((t) => /double/i.test(t))).toHaveLength(1);
  });

  it('the bot’s choice: its 1-2 and the double it chose are read once, by name', async () => {
    // The first roll is 1-2 (the bot's), then seeded dice.
    const seeded = createSeededRng(7);
    const first = [0, 1];
    const rng: Rng = { nextUint32: () => first.shift() ?? seeded.nextUint32() };
    const store = aceyDeucey('black', rng);
    const bot: BotSeat = {
      player: 'black',
      difficulty: 'easy',
      runner: new InlineBotRunner(createBot()),
      rng: createSeededRng(1),
      timing: { thinkMs: () => 0 },
    };
    await show(store, { seats, bot });
    // The bot rolls 1-2, plays it, then answers the question.
    const chosen = () => {
      const { flow } = store.getState();
      return flow.game.state.dice !== null && !diceWereRolled(flow);
    };
    for (let guard = 0; guard < 200 && !chosen(); guard++) await tick(50);
    expect(chosen()).toBe(true);
    const [value, other] = store.getState().flow.game.state.dice!;
    expect(other).toBe(value);

    const line = new RegExp(
      `^Bot played: [^.]+; [^.]+\\. Bot chose double ${value}: four moves of ${value}\\.$`,
    );
    expect(said().filter((t) => line.test(t))).toHaveLength(1);
    expect(said().filter((t) => /rolled double/.test(t))).toHaveLength(0);
  });

  it('reads your choice in Greek, with the name of the double', async () => {
    await i18n.changeLanguage('el');
    const store = aceyDeucey('white');
    await show(store, { seats });
    const send = await whitePlaysAceDeuce(store);
    await send({ type: 'answer', player: 'white', choice: '5' });
    expect(announce).toHaveBeenCalledWith('Διάλεξες πεντάρες: τέσσερις κινήσεις του 5.');
    // The 1-2 was rolled ("Έφερες 1-2."); the double was not.
    expect(said().filter((t) => /Έφερες πεντάρες/.test(t))).toHaveLength(0);
  });
});
