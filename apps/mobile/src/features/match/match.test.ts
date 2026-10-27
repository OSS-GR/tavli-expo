import { createMemoryStorage } from '@tavli/contracts';
import {
  VARIANT_REGISTRY,
  createGameFlow,
  createSeededRng,
  portes,
  type BoardState,
} from '@tavli/engine';

import { SAMPLE_POSITIONS } from '@/features/board/positions';
import i18n from '@/i18n';

import { lastSetupKey, loadLastSetup, saveLastSetup } from './lastSetup';
import { canResignGame, previewResign, resigningPlayer } from './resign';
import { gameHref, newGameHref, parseIdParam, parseModeParam, rulesHref } from './routes';
import { seatsFor } from './seats';
import { createSessionRegistry, newMatchId } from './sessions';
import {
  GAME_CHOICES,
  cleanName,
  defaultSetup,
  enginePlayers,
  gameLevels,
  gameRotation,
  gameRuleSet,
  isGameBuilt,
  isGameOpen,
  sanitizeSetup,
  type MatchSetup,
} from './setup';
import { currentGameLabel, nextGameLabel, variantName } from './summary';

const t = i18n.t.bind(i18n);

const botSetup: MatchSetup = { ...defaultSetup('bot'), targetPoints: 5 };
const localSetup: MatchSetup = { ...defaultSetup('local'), names: { white: 'Maria', black: '' } };

describe('match setup', () => {
  it('defaults to a match to 3 vs an easy bot', () => {
    expect(defaultSetup('bot')).toEqual({
      mode: 'bot',
      game: 'portes',
      targetPoints: 3,
      botLevel: 'easy',
      names: { white: '', black: '' },
    });
  });

  it('cleans names: trims and cuts to 16 characters (Greek too)', () => {
    expect(cleanName('  Maria  ')).toBe('Maria');
    expect(cleanName('Αλέξανδρος Παπαδόπουλος')).toBe('Αλέξανδρος Παπαδ');
    expect(cleanName(42)).toBe('');
  });

  it('sanitizes saved choices and drops levels this build cannot play', () => {
    expect(sanitizeSetup(null, 'local')).toEqual(defaultSetup('local'));
    expect(
      sanitizeSetup(
        { targetPoints: 7, botLevel: 'medium', names: { white: ' Ann ', black: 5 } },
        'bot',
        gameLevels(['easy']),
      ),
    ).toEqual({ ...defaultSetup('bot'), targetPoints: 7, names: { white: 'Ann', black: '' } });
    expect(sanitizeSetup({ targetPoints: 4, botLevel: 'hard' }, 'bot').targetPoints).toBe(3);
    expect(
      sanitizeSetup({ botLevel: 'medium' }, 'bot', gameLevels(['easy', 'medium'])).botLevel,
    ).toBe('medium');
  });

  it('gives the engine non-empty player labels', () => {
    expect(enginePlayers(botSetup)).toEqual({ white: 'you', black: 'bot' });
    expect(enginePlayers(localSetup)).toEqual({ white: 'Maria', black: 'player-2' });
  });
});

describe('seats', () => {
  it('names you and the bot, with the level in the strip', () => {
    const seats = seatsFor(botSetup, t);
    expect(seats.white).toEqual({ name: 'You', label: 'You', turnLabel: 'Your turn', you: true });
    expect(seats.black).toEqual({
      name: 'Bot',
      label: 'Bot · Easy',
      turnLabel: 'Playing',
      you: false,
    });
  });

  it('falls back to Player 1 / Player 2 in the app language', async () => {
    expect(seatsFor(localSetup, t).black.name).toBe('Player 2');
    expect(seatsFor(localSetup, t).white).toEqual({
      name: 'Maria',
      label: 'Maria',
      turnLabel: 'Maria’s turn',
      you: false,
    });
    await i18n.changeLanguage('el');
    try {
      expect(seatsFor(localSetup, t).black.name).toBe('Παίκτης 2');
      expect(seatsFor(botSetup, t).black.label).toBe('Υπολογιστής · Εύκολο');
      expect(seatsFor(localSetup, t).black.turnLabel).toBe('Σειρά: Παίκτης 2');
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});

describe('routes', () => {
  it('builds hrefs with params', () => {
    expect(newGameHref('local')).toEqual({ pathname: '/new-game', params: { mode: 'local' } });
    expect(gameHref('local-1')).toEqual({ pathname: '/game/[id]', params: { id: 'local-1' } });
    expect(rulesHref('portes')).toEqual({
      pathname: '/rules/[variant]',
      params: { variant: 'portes' },
    });
  });

  it('reads params safely', () => {
    expect(parseModeParam('local')).toBe('local');
    expect(parseModeParam(['local', 'bot'])).toBe('local');
    expect(parseModeParam('online')).toBe('bot');
    expect(parseModeParam(undefined)).toBe('bot');
    expect(parseIdParam('local-1')).toBe('local-1');
    expect(parseIdParam('')).toBeNull();
    expect(parseIdParam(undefined)).toBeNull();
  });
});

describe('last choices', () => {
  it('remembers the setup per mode', () => {
    const storage = createMemoryStorage();
    saveLastSetup(storage, botSetup);
    expect(loadLastSetup(storage, 'bot', gameLevels(['easy']))).toEqual(botSetup);
    expect(loadLastSetup(storage, 'local', gameLevels(['easy']))).toEqual(defaultSetup('local'));
  });

  it('gives the defaults for broken data', () => {
    const storage = createMemoryStorage({ [lastSetupKey('bot')]: '{not json' });
    expect(loadLastSetup(storage, 'bot', gameLevels(['easy']))).toEqual(defaultSetup('bot'));
  });
});

describe('sessions', () => {
  it('keeps one match at a time, found by id', () => {
    let seed = 1;
    const sessions = createSessionRegistry({ createRng: () => createSeededRng(seed++) });
    const first = sessions.start(botSetup);
    expect(first.id).toMatch(/^local-/);
    expect(sessions.get(first.id)).toBe(first);
    expect(first.store.getState().flow.match.targetPoints).toBe(5);

    const second = sessions.start(localSetup);
    expect(second.id).not.toBe(first.id);
    expect(sessions.get(first.id)).toBeNull();
    expect(sessions.current()).toBe(second);
    sessions.end(second.id);
    expect(sessions.current()).toBeNull();
  });

  it('makes ids from the clock and the rng', () => {
    expect(newMatchId(createSeededRng(1), 36)).toMatch(/^local-10-[0-9a-z]+$/);
  });
});

describe('resign', () => {
  function startedFlow(board?: BoardState) {
    const sessions = createSessionRegistry({ createRng: () => createSeededRng(4) });
    const { store } = sessions.start(localSetup);
    const base = portes.initialState({ startingPlayer: 'white' });
    const state = board ? { ...base, board } : base;
    store.setState({
      flow: { ...store.getState().flow, game: createGameFlow({ state, starter: 'white' }) },
    });
    return store;
  }

  it('lets the human resign vs the bot, and the player to move in pass-and-play', () => {
    const store = startedFlow();
    const flow = store.getState().flow;
    expect(resigningPlayer(flow, 'bot')).toBe('white');
    expect(resigningPlayer(flow, 'local')).toBe('white');
    expect(canResignGame(flow, 'white')).toBe(true);
  });

  it('allows no game resign during the opening roll', () => {
    const sessions = createSessionRegistry({ createRng: () => createSeededRng(4) });
    const flow = sessions.start(localSetup).store.getState().flow;
    expect(flow.game.phase).toBe('opening-roll');
    expect(resigningPlayer(flow, 'local')).toBeNull();
    expect(canResignGame(flow, resigningPlayer(flow, 'bot'))).toBe(false);
  });

  it('gives diplo when the resigner has borne off nothing, else mono', () => {
    const store = startedFlow();
    const diplo = previewResign(store.getState().flow, 'white');
    expect(diplo.result).toEqual({ winner: 'black', points: 2, reason: 'resigned' });
    expect(diplo.score).toEqual({ white: 0, black: 2 });

    // White has borne off a checker.
    const mono = previewResign(startedFlow(SAMPLE_POSITIONS.bearoff).getState().flow, 'white');
    expect(mono.result.points).toBe(1);
  });
});

describe('the chosen game (#109)', () => {
  const PORTES_ONLY = gameLevels(['easy', 'medium'], {
    plakoto: [],
    fevga: [],
    tavli: [],
    asodio: [],
  });

  it('uses the engine presets, one game or the Tavli rotation', () => {
    expect(GAME_CHOICES.filter((game) => isGameBuilt(game))).toEqual([
      'portes',
      'plakoto',
      'fevga',
      'tavli',
      'asodio',
    ]);
    expect(gameRotation('tavli')).toEqual(['portes', 'plakoto', 'fevga']);
    // A game is built only when the engine has it too.
    const noAsodio = new Map([...VARIANT_REGISTRY].filter(([id]) => id !== 'asodio'));
    expect(isGameBuilt('asodio', noAsodio)).toBe(false);
    expect(isGameBuilt('portes', noAsodio)).toBe(true);
    for (const game of ['portes', 'plakoto', 'fevga', 'asodio'] as const) {
      const rules = gameRuleSet(game);
      expect(rules.presetId).toBe(game === 'asodio' ? 'asodio.kafeneio' : game);
      // A one-game match plays only that game.
      expect(rules.match.rotation).toEqual([game]);
      expect(gameRotation(game)).toEqual([game]);
    }
    expect(gameRuleSet('tavli').presetId).toBe('tavli');
    expect(gameRuleSet('plakoto').capture.captureMode).toBe('pin');
    expect(gameRuleSet('fevga').movement.direction).toBe('parallel');
  });

  it('opens a game vs the bot only with a bot level; pass-and-play needs none', () => {
    expect(isGameOpen('plakoto', 'bot', PORTES_ONLY)).toBe(false);
    expect(isGameOpen('plakoto', 'local', PORTES_ONLY)).toBe(true);
    expect(isGameOpen('portes', 'bot', PORTES_ONLY)).toBe(true);
    // Asodio (#124): pass-and-play always; vs bot with a level.
    expect(isGameOpen('asodio', 'local', PORTES_ONLY)).toBe(true);
    expect(isGameOpen('asodio', 'bot', PORTES_ONLY)).toBe(false);
    expect(isGameOpen('asodio', 'bot', gameLevels(['easy'], { asodio: ['easy'] }))).toBe(true);
  });

  it('keeps the saved game when it is open, else Portes', () => {
    expect(sanitizeSetup({ game: 'tavli' }, 'bot').game).toBe('tavli');
    expect(sanitizeSetup({ game: 'fevga' }, 'local', PORTES_ONLY).game).toBe('fevga');
    expect(sanitizeSetup({ game: 'fevga' }, 'bot', PORTES_ONLY).game).toBe('portes');
    expect(sanitizeSetup({ game: 'asodio' }, 'local').game).toBe('asodio');
    expect(sanitizeSetup({ game: 'asodio' }, 'bot', PORTES_ONLY).game).toBe('portes');
    expect(sanitizeSetup({ game: 'chess' }, 'local').game).toBe('portes');
    // A saved match keeps any built game.
    expect(sanitizeSetup({ game: 'fevga' }, 'bot', PORTES_ONLY, { keepBuiltGame: true }).game).toBe(
      'fevga',
    );
  });

  it('picks the bot level from the levels of the game', () => {
    const levels = gameLevels(['easy', 'medium'], { tavli: ['easy'] });
    expect(sanitizeSetup({ game: 'tavli', botLevel: 'medium' }, 'bot', levels).botLevel).toBe(
      'easy',
    );
    expect(sanitizeSetup({ game: 'portes', botLevel: 'medium' }, 'bot', levels).botLevel).toBe(
      'medium',
    );
  });

  it('starts the match with the rules of the game', () => {
    const sessions = createSessionRegistry({ createRng: () => createSeededRng(3) });
    const tavli = sessions.start({ ...defaultSetup('local'), game: 'tavli' });
    expect(tavli.store.getState().flow.match.rules.presetId).toBe('tavli');
    expect(tavli.store.getState().flow.game.state.variant).toBe('portes');
    const plakoto = sessions.start({ ...defaultSetup('bot'), game: 'plakoto' });
    const { match, game } = plakoto.store.getState().flow;
    expect(match.rules.match.rotation).toEqual(['plakoto']);
    expect(game.state.variant).toBe('plakoto');
  });

  it('names the game on the board and the next one', () => {
    const sessions = createSessionRegistry({ createRng: () => createSeededRng(3) });
    const s = sessions.start({ ...defaultSetup('local'), game: 'tavli', targetPoints: 7 });
    s.store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 6 });
    s.store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 1 });
    expect(currentGameLabel(s.store.getState().flow, t)).toBe('Game 1 · Portes');
    s.store.getState().dispatch({ type: 'resign', player: 'white' });
    const flow = s.store.getState().flow;
    expect(currentGameLabel(flow, t)).toBe('Game 1 · Portes');
    expect(nextGameLabel(flow.match, t)).toBe('Next: game 2 · Plakoto');
    s.store.getState().dispatch({ type: 'nextGame' });
    expect(currentGameLabel(s.store.getState().flow, t)).toBe('Game 2 · Plakoto');
    expect(variantName('fevga', i18n.getFixedT('el'))).toBe('Φεύγα');
    expect(variantName('asodio', i18n.getFixedT('el'))).toBe('Ασόδιο');
  });
});
