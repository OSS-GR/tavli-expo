/**
 * The opening roll house rule (#207) on the game screen: the engine flag
 * `match.openingRoll`. Each flag gets its own path; the screen only sends
 * engine actions. On fake timers: the cards close on timers.
 */
import { InlineBotRunner, createBot } from '@tavli/bot';
import { createMemoryStorage } from '@tavli/contracts';
import { createSeededRng, type DieValue, type PerPlayer, type PlayerId } from '@tavli/engine';
import { act, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { createSessionRegistry } from '@/features/match/sessions';
import { defaultSetup, gameRuleSet, type OpeningRollRule } from '@/features/match/setup';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';

import { createGameStore, turnView, type GameStore } from './gameStore';
import { GameScreen, OPENING_RESULT_MS, type BotSeat } from './GameScreen';
import type { Seat } from './seats';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { renderWithRoot as render } from '../../../test/render';

const hidden = { includeHiddenElements: true };

function newStore(
  openingRoll: OpeningRollRule,
  names: PerPlayer<string> = { white: 'Maria', black: 'Nikos' },
): GameStore {
  return createGameStore({
    players: names,
    targetPoints: 3,
    rules: gameRuleSet('portes', openingRoll),
    rng: createSeededRng(5),
  });
}

const BOT_SEATS: PerPlayer<Seat> = {
  white: { name: 'You', label: 'You', turnLabel: 'Your turn', you: true },
  black: { name: 'Bot', label: 'Bot · Easy', turnLabel: 'Playing', you: false },
};

const bot: BotSeat = {
  player: 'black',
  difficulty: 'easy',
  runner: new InlineBotRunner(createBot()),
  rng: createSeededRng(1),
  timing: { beforeRollMs: 0, moveMs: 0, thinkMs: () => 0 },
};

/** Rolls a set opening die, as the Roll button would. */
async function rollDie(store: GameStore, player: PlayerId, die: DieValue) {
  await act(async () => {
    store.getState().dispatch({ type: 'rollOpening', player, die });
  });
}

async function wait(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

const game = (store: GameStore) => store.getState().flow.game;
const message = () => screen.getByTestId('opening-message');

let announce: jest.SpyInstance;
const announced = () => announce.mock.calls.map(([text]) => text as string);

runOnFakeTimers();

beforeEach(async () => {
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

afterEach(async () => {
  announce.mockRestore();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('<GameScreen /> opening roll house rule (#207)', () => {
  it('useOpeningDice (the default): the starter plays the two opening dice', async () => {
    expect(gameRuleSet('portes').match.openingRoll).toBe('useOpeningDice');
    const store = newStore('useOpeningDice');
    await render(<GameScreen store={store} />);
    expect(announced()).toContain(
      'Each player rolls one die. The higher die starts and plays both. Maria: roll.',
    );
    await rollDie(store, 'white', 6);
    await rollDie(store, 'black', 3);
    expect(message()).toHaveTextContent('Maria starts with 6-3.');
    expect(game(store).phase).toBe('moving');
    expect(game(store).state.dice).toEqual([6, 3]);
  });

  describe('rerollBoth', () => {
    it('the starter rolls both dice again after the result closes', async () => {
      const user = setupUser();
      const store = newStore('rerollBoth');
      await render(<GameScreen store={store} />);
      expect(message()).toHaveTextContent(
        'Each player rolls one die. The higher die starts and rolls both dice again.',
      );
      await rollDie(store, 'white', 2);
      await rollDie(store, 'black', 5);

      expect(message()).toHaveTextContent('Nikos starts (5-2) and rolls again.');
      expect(announced()).toContain('Nikos starts (5-2) and rolls again.');
      expect(game(store).phase).toBe('awaiting-roll');
      expect(game(store).state.toMove).toBe('black');
      expect(game(store).state.dice).toBeNull();
      // While the result shows there is no Roll: a tap closes the card first.
      expect(screen.queryByTestId('roll-button')).toBeNull();
      await user.press(screen.getByTestId('opening-overlay'));
      expect(screen.queryByTestId('opening-card')).toBeNull();
      expect(game(store).state.dice).toBeNull();

      // Now Nikos rolls both dice; the roll is read like any roll.
      await user.press(screen.getByRole('button', { name: 'Roll dice, or tap the board' }));
      const dice = game(store).state.dice;
      expect(dice).not.toBeNull();
      expect(store.getState().flow.log.filter((e) => e.type === 'roll')).toHaveLength(1);
      expect(announced().some((text) => text.startsWith('Nikos rolled'))).toBe(true);
    });

    /** Nikos won the opening and rolled his own first dice. */
    async function rolledAgain(store: GameStore) {
      await rollDie(store, 'white', 2);
      await rollDie(store, 'black', 5);
      await act(async () => {
        store.getState().dispatch({ type: 'roll', player: 'black', dice: [4, 1] });
      });
      expect(game(store).phase).toBe('moving');
    }

    /** No opening card over the board, and the rolled dice can be played. */
    function expectPlayable(store: GameStore) {
      expect(screen.queryByTestId('opening-card')).toBeNull();
      expect(screen.getByTestId('game-board-layer')).toHaveProp(
        'importantForAccessibility',
        'auto',
      );
      expect(screen.getByTestId('confirm-button')).toBeOnTheScreen();
      const move = turnView(store.getState().flow).legal[0]!.moves[0]!;
      expect(store.getState().dispatch({ type: 'move', player: 'black', move })).toBe(true);
    }

    it('a remount after the starter rolled does not bring the result back', async () => {
      const store = newStore('rerollBoth');
      await render(<GameScreen store={store} />);
      await rolledAgain(store);
      await screen.unmount();
      await render(<GameScreen store={store} />);
      expectPlayable(store);
    });

    it('a resume after the starter rolled does not bring the result back', async () => {
      const storage = createMemoryStorage();
      const sessions = () =>
        createSessionRegistry({ createRng: () => createSeededRng(3), storage });
      const setup = { ...defaultSetup('local'), openingRoll: 'rerollBoth' as const };
      const first = sessions();
      const { id, store: played } = first.start(setup);
      await rolledAgain(played);
      first.saveNow();

      const resumed = sessions().get(id);
      expect(resumed).not.toBeNull();
      await render(<GameScreen store={resumed!.store} />);
      expectPlayable(resumed!.store);
    });

    it('the result also closes by itself', async () => {
      const store = newStore('rerollBoth');
      await render(<GameScreen store={store} />);
      await rollDie(store, 'white', 6);
      await rollDie(store, 'black', 1);
      await wait(OPENING_RESULT_MS + 10);
      expect(screen.queryByTestId('opening-card')).toBeNull();
      expect(screen.getByTestId('roll-button')).toBeOnTheScreen();
    });

    it('vs bot: "You start" and you roll again', async () => {
      const store = newStore('rerollBoth', { white: 'you', black: 'bot' });
      await render(<GameScreen store={store} openingTaps="one" seats={BOT_SEATS} bot={bot} />);
      await rollDie(store, 'white', 6);
      await rollDie(store, 'black', 3);
      expect(message()).toHaveTextContent('You start (6-3). Roll again.');
    });

    it('vs bot: the bot starts, waits for the result to close, then rolls', async () => {
      const store = newStore('rerollBoth', { white: 'you', black: 'bot' });
      await render(<GameScreen store={store} openingTaps="one" seats={BOT_SEATS} bot={bot} />);
      await rollDie(store, 'white', 1);
      await rollDie(store, 'black', 5);
      expect(message()).toHaveTextContent('Bot starts (5-1) and rolls again.');
      await wait(OPENING_RESULT_MS - 10);
      expect(game(store).state.dice).toBeNull();
      await wait(20);
      await waitFor(() =>
        expect(store.getState().flow.log.some((e) => e.type === 'roll')).toBe(true),
      );
    });

    it('Greek: the result', async () => {
      await act(async () => {
        await i18n.changeLanguage('el');
      });
      const store = newStore('rerollBoth', { white: 'Μαρία', black: 'Νίκος' });
      await render(<GameScreen store={store} />);
      await rollDie(store, 'white', 6);
      await rollDie(store, 'black', 3);
      expect(message()).toHaveTextContent('Ξεκινά: Μαρία (6-3). Ξαναρίχνει τα ζάρια.');
    });
  });

  describe('chosenStarterRolls', () => {
    const card = () => within(screen.getByTestId('starter-card'));

    it('pass-and-play: either player picks who starts; that player rolls', async () => {
      const user = setupUser();
      const store = newStore('chosenStarterRolls');
      await render(<GameScreen store={store} />);

      // A card asks; there are no opening dice and no Roll button.
      expect(card().getByRole('header', { name: 'Who starts?' })).toBeOnTheScreen();
      expect(card().getByText('Choose who starts. That player rolls both dice.')).toBeOnTheScreen();
      expect(screen.queryByTestId('opening-card')).toBeNull();
      expect(screen.queryByTestId('roll-button')).toBeNull();
      expect(announced()).toContain('Who starts? Choose who starts. That player rolls both dice.');
      // Screen readers skip the board under the card (#153).
      const layer = screen.getByTestId('game-board-layer', hidden);
      expect(layer).toHaveProp('importantForAccessibility', 'no-hide-descendants');
      expect(layer).toHaveProp('collapsable', false);

      expect(card().getByRole('button', { name: 'Maria starts' })).toBeOnTheScreen();
      await user.press(card().getByRole('button', { name: 'Nikos starts' }));

      expect(screen.queryByTestId('starter-card')).toBeNull();
      expect(game(store).phase).toBe('awaiting-roll');
      expect(game(store).starter).toBe('black');
      expect(game(store).state.toMove).toBe('black');
      expect(announced()).toContain('Nikos starts.');
      expect(screen.getByTestId('game-board-layer')).toHaveProp(
        'importantForAccessibility',
        'auto',
      );

      await user.press(screen.getByRole('button', { name: 'Roll dice, or tap the board' }));
      expect(game(store).state.dice).not.toBeNull();
      expect(announced().some((text) => text.startsWith('Nikos rolled'))).toBe(true);
    });

    it('a tap on the board does not start the game', async () => {
      const user = setupUser();
      const store = newStore('chosenStarterRolls');
      await render(<GameScreen store={store} />);
      await user.press(screen.getByTestId('game-board', hidden));
      expect(game(store).phase).toBe('opening-roll');
      expect(screen.getByTestId('starter-card')).toBeOnTheScreen();
    });

    it('vs bot: you pick; "I start" lets you roll', async () => {
      const user = setupUser();
      const store = newStore('chosenStarterRolls', { white: 'you', black: 'bot' });
      await render(<GameScreen store={store} openingTaps="one" seats={BOT_SEATS} bot={bot} />);
      const buttons = card().getAllByRole('button');
      expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual(['I start', 'Bot starts']);
      // The bot does not pick by itself.
      await wait(30_000);
      expect(game(store).phase).toBe('opening-roll');

      await user.press(card().getByRole('button', { name: 'I start' }));
      expect(game(store).state.toMove).toBe('white');
      expect(announced()).toContain('You start.');
      expect(screen.getByRole('button', { name: 'Roll dice, or tap the board' })).toBeOnTheScreen();
    });

    it('vs bot: "Bot starts" and the bot rolls its first turn', async () => {
      const user = setupUser();
      const store = newStore('chosenStarterRolls', { white: 'you', black: 'bot' });
      await render(<GameScreen store={store} openingTaps="one" seats={BOT_SEATS} bot={bot} />);
      await user.press(card().getByRole('button', { name: 'Bot starts' }));
      expect(announced()).toContain('Bot starts.');
      await waitFor(
        () => expect(store.getState().flow.log.some((e) => e.type === 'roll')).toBe(true),
        { timeout: 30_000 },
      );
      expect(game(store).starter).toBe('black');
    });

    it('Greek: the card and its buttons', async () => {
      await act(async () => {
        await i18n.changeLanguage('el');
      });
      const store = newStore('chosenStarterRolls', { white: 'Μαρία', black: 'Νίκος' });
      await render(<GameScreen store={store} />);
      expect(card().getByRole('header', { name: 'Ποιος ξεκινά;' })).toBeOnTheScreen();
      expect(
        card().getByText('Διαλέξτε ποιος ξεκινά. Αυτός ρίχνει και τα δύο ζάρια.'),
      ).toBeOnTheScreen();
      expect(card().getByRole('button', { name: 'Ξεκινά: Μαρία' })).toBeOnTheScreen();
      expect(card().getByRole('button', { name: 'Ξεκινά: Νίκος' })).toBeOnTheScreen();
    });
  });
});
