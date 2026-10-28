import { createMemoryStorage, type Storage } from '@tavli/contracts';
import {
  MATCH_FLOW_SCHEMA_VERSION,
  VARIANT_REGISTRY,
  createSeededRng,
  getVariant,
  type Dice,
} from '@tavli/engine';
import { renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import i18n from '@/i18n';

import { SAVED_MATCH_KEY, SAVE_VERSION, parseSavedMatch, serializeSavedMatch } from './savedMatch';
import { createSessionRegistry, isRestPoint, type MatchSession } from './sessions';
import { defaultSetup, gameLevels, type MatchSetup } from './setup';
import { continueSummary, timeAgo } from './summary';
import { useSaveOnBackground } from './useSaveOnBackground';

const t = i18n.t.bind(i18n);
const LEVELS = gameLevels(['easy']);
const botSetup: MatchSetup = { ...defaultSetup('bot'), targetPoints: 5 };

function registry(storage: Storage, clock = { now: 1_000_000 }) {
  let seed = 1;
  return createSessionRegistry({
    createRng: () => createSeededRng(seed++),
    storage,
    levels: LEVELS,
    now: () => clock.now,
  });
}

const flowOf = (s: MatchSession) => s.store.getState().flow;

/** Rolls the opening (no tie) so a player is to move. */
function openGame(s: MatchSession) {
  const { dispatch } = s.store.getState();
  dispatch({ type: 'rollOpening', player: 'white', die: 6 });
  dispatch({ type: 'rollOpening', player: 'black', die: 1 });
}

/** Plays the rest of the current turn (the first legal play) without confirming. */
function playMoves(s: MatchSession) {
  const { game } = flowOf(s);
  const player = game.state.toMove;
  const dice = game.state.dice as Dice;
  const turn = getVariant(VARIANT_REGISTRY, 'portes').legalTurns(game.state, dice)[0]!;
  for (const move of turn.moves) s.store.getState().dispatch({ type: 'move', player, move });
}

function savedLogLength(storage: Storage): number {
  const result = parseSavedMatch(storage.getString(SAVED_MATCH_KEY), LEVELS);
  if (result.kind !== 'ok') throw new Error(result.kind);
  return result.saved.flow.log.length;
}

describe('saved match format', () => {
  const s = registry(createMemoryStorage()).start(botSetup);
  openGame(s);
  const text = serializeSavedMatch(s.id, s.setup, flowOf(s), 42);

  it('loads what it saved (the log is replayed by the engine)', () => {
    const result = parseSavedMatch(text, LEVELS);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.saved.id).toBe(s.id);
    expect(result.saved.setup).toEqual(botSetup);
    expect(result.saved.savedAt).toBe(42);
    expect(result.saved.flow).toEqual(flowOf(s));
  });

  it('has no save when the slot is empty', () => {
    expect(parseSavedMatch(undefined, LEVELS)).toEqual({ kind: 'none' });
  });

  it.each([
    ['not JSON', '{oops'],
    ['not an object', '[1,2]'],
    ['an old save version', JSON.stringify({ ...JSON.parse(text), v: SAVE_VERSION + 1 })],
    ['another flow schema', JSON.stringify({ ...JSON.parse(text), flowSchema: 0 })],
    ['a bad id', JSON.stringify({ ...JSON.parse(text), id: 'online-1' })],
    ['no log', JSON.stringify({ ...JSON.parse(text), log: null })],
    ['a bad mode', JSON.stringify({ ...JSON.parse(text), setup: { mode: 'online' } })],
    [
      'an edited die',
      JSON.stringify({
        ...JSON.parse(text),
        log: JSON.parse(text).log.map((e: { type: string }) =>
          e.type === 'rollOpening' ? { ...e, die: 9 } : e,
        ),
      }),
    ],
    ['a log without its start', JSON.stringify({ ...JSON.parse(text), log: [] })],
    [
      'a length the log does not have',
      JSON.stringify({ ...JSON.parse(text), setup: { ...botSetup, targetPoints: 7 } }),
    ],
  ])('drops %s safely', (_name, bad) => {
    const result = parseSavedMatch(bad, LEVELS);
    expect(result.kind).toBe('broken');
  });

  it('checks the flow schema the engine has today', () => {
    expect(JSON.parse(text).flowSchema).toBe(MATCH_FLOW_SCHEMA_VERSION);
  });

  it('plays a saved Medium bot as Easy when this build has no Medium', () => {
    const medium = serializeSavedMatch(s.id, { ...botSetup, botLevel: 'medium' }, flowOf(s), 1);
    const result = parseSavedMatch(medium, LEVELS);
    expect(result.kind === 'ok' && result.saved.setup.botLevel).toBe('easy');
  });
});

describe('saving a local match', () => {
  it('saves at the start, and after each finished turn, not in the middle of one', () => {
    const storage = createMemoryStorage();
    const s = registry(storage).start(botSetup);
    expect(savedLogLength(storage)).toBe(1);

    openGame(s); // the starter plays the opening dice: mid-turn
    expect(isRestPoint(flowOf(s))).toBe(false);
    expect(savedLogLength(storage)).toBe(2); // White's die: still at rest

    playMoves(s);
    expect(savedLogLength(storage)).toBe(2);
    s.store.getState().dispatch({ type: 'confirm', player: 'white' });
    expect(savedLogLength(storage)).toBe(flowOf(s).log.length);
  });

  it('saves mid-turn on saveNow (the app goes to the background)', () => {
    const storage = createMemoryStorage();
    const sessions = registry(storage);
    const s = sessions.start(botSetup);
    openGame(s);
    playMoves(s);
    sessions.saveNow();
    expect(savedLogLength(storage)).toBe(flowOf(s).log.length);
  });

  it('clears the slot when the match ends', () => {
    const storage = createMemoryStorage();
    const s = registry(storage).start(botSetup);
    openGame(s);
    expect(storage.getString(SAVED_MATCH_KEY)).toBeDefined();
    s.store.getState().dispatch({ type: 'resignMatch', player: 'white' });
    expect(storage.getString(SAVED_MATCH_KEY)).toBeUndefined();
  });

  it('saves the rematch as a new match', () => {
    const storage = createMemoryStorage();
    const s = registry(storage).start(botSetup);
    openGame(s);
    s.store.getState().dispatch({ type: 'resignMatch', player: 'black' });
    s.store.getState().rematch();
    expect(savedLogLength(storage)).toBe(1);
  });

  it('a new match replaces the saved one', () => {
    const storage = createMemoryStorage();
    const sessions = registry(storage);
    const first = sessions.start(botSetup);
    const second = sessions.start(defaultSetup('local'));
    const result = sessions.peek();
    expect(result.kind === 'ok' && result.saved.id).toBe(second.id);
    expect(sessions.get(first.id)).toBeNull();
  });

  it('keeps playing when the save fails (a storage error does not leave dispatch)', () => {
    const storage = createMemoryStorage();
    const s = registry(storage).start(botSetup);
    openGame(s);
    playMoves(s);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(storage, 'setString').mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(s.store.getState().dispatch({ type: 'confirm', player: 'white' })).toBe(true);
    expect(flowOf(s).game.state.toMove).toBe('black');
    expect(warn).toHaveBeenCalledWith('could not save the match', expect.any(Error));
    jest.restoreAllMocks();
  });

  it('start, peek, get and end never throw when storage fails', () => {
    const storage = createMemoryStorage();
    const sessions = registry(storage);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fail = () => {
      throw new Error('storage error');
    };
    jest.spyOn(storage, 'getString').mockImplementation(fail);
    jest.spyOn(storage, 'remove').mockImplementation(fail);
    jest.spyOn(storage, 'setString').mockImplementation(fail);

    const s = sessions.start(botSetup);
    expect(sessions.current()).toBe(s);
    expect(sessions.peek()).toEqual({ kind: 'none' });
    expect(sessions.get('some-other-id')).toBeNull();
    expect(() => sessions.end(s.id)).not.toThrow();
    expect(sessions.current()).toBeNull();
    expect(warn).toHaveBeenCalledWith('could not read the saved match', expect.any(Error));
    expect(warn).toHaveBeenCalledWith('could not remove the saved match', expect.any(Error));
    jest.restoreAllMocks();
  });

  it('end() forgets the match and clears its save', () => {
    const storage = createMemoryStorage();
    const sessions = registry(storage);
    const s = sessions.start(botSetup);
    sessions.end(s.id);
    expect(sessions.current()).toBeNull();
    expect(storage.getString(SAVED_MATCH_KEY)).toBeUndefined();
  });
});

describe('resuming after an app restart', () => {
  it('loads the saved match by id and keeps saving it', () => {
    const storage = createMemoryStorage();
    const before = registry(storage).start(botSetup);
    openGame(before);
    playMoves(before);
    before.store.getState().dispatch({ type: 'confirm', player: 'white' });
    const flow = flowOf(before);

    // A new app run: a fresh registry over the same storage.
    const after = registry(storage);
    expect(after.current()).toBeNull();
    const restored = after.get(before.id);
    expect(restored?.setup).toEqual(botSetup);
    expect(flowOf(restored!)).toEqual(flow);
    expect(after.get('local-other')).toBeNull();

    // Black (the bot) rolls: the dice come from the new run's RNG.
    restored!.store.getState().dispatch({ type: 'roll', player: 'black' });
    playMoves(restored!);
    restored!.store.getState().dispatch({ type: 'confirm', player: 'black' });
    expect(savedLogLength(storage)).toBe(flowOf(restored!).log.length);
  });

  it('drops a broken save: get() finds nothing and peek() reports it once', () => {
    const storage = createMemoryStorage({ [SAVED_MATCH_KEY]: '{"v":0}' });
    const sessions = registry(storage);
    expect(sessions.peek().kind).toBe('broken');
    expect(storage.getString(SAVED_MATCH_KEY)).toBeUndefined();
    expect(sessions.peek().kind).toBe('none');

    storage.setString(SAVED_MATCH_KEY, 'garbage');
    expect(sessions.get('local-1')).toBeNull();
    expect(storage.getString(SAVED_MATCH_KEY)).toBeUndefined();
  });
});

describe('continue card texts', () => {
  it('says how long ago', () => {
    expect(timeAgo(10_000, t)).toBe('just now');
    expect(timeAgo(12 * 60_000, t)).toBe('12 min ago');
    expect(timeAgo(3 * 3_600_000, t)).toBe('3 h ago');
    expect(timeAgo(86_400_000, t)).toBe('1 day ago');
    expect(timeAgo(2 * 86_400_000, t)).toBe('2 days ago');
  });

  it('names the game, the opponent, the score and the target', () => {
    const storage = createMemoryStorage();
    const clock = { now: 1_000_000 };
    const sessions = registry(storage, clock);
    sessions.start(botSetup);
    const result = sessions.peek();
    if (result.kind !== 'ok') throw new Error('no save');
    expect(continueSummary(result.saved, t, clock.now + 12 * 60_000)).toEqual({
      game: 'Portes · vs Bot (Easy)',
      status: 'You 0 – 0 Bot · first to 5 · 12 min ago',
    });
    const local = {
      ...result.saved,
      setup: { ...defaultSetup('local'), targetPoints: 5 as const },
    };
    expect(continueSummary(local, t, clock.now).game).toBe('Portes · pass-and-play');
  });
});

describe('useSaveOnBackground', () => {
  it('saves when the app leaves the foreground', async () => {
    let listener: ((state: string) => void) | undefined;
    const remove = jest.fn();
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
      listener = fn as (state: string) => void;
      return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    const save = jest.fn();
    const { unmount } = await renderHook(() => useSaveOnBackground(save));
    listener?.('active');
    expect(save).not.toHaveBeenCalled();
    listener?.('background');
    listener?.('inactive');
    expect(save).toHaveBeenCalledTimes(2);
    await unmount();
    expect(remove).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('the saved game (#109)', () => {
  const tavliSetup: MatchSetup = { ...defaultSetup('local'), game: 'tavli', targetPoints: 5 };

  function savedText(setup: MatchSetup) {
    const s = registry(createMemoryStorage()).start(setup);
    openGame(s);
    return { s, text: serializeSavedMatch(s.id, s.setup, flowOf(s), 42) };
  }

  it('keeps the game and the Tavli rotation after a restart', () => {
    const storage = createMemoryStorage();
    const s = registry(storage).start(tavliSetup);
    openGame(s);
    s.store.getState().dispatch({ type: 'resign', player: flowOf(s).game.state.toMove });
    s.store.getState().dispatch({ type: 'nextGame' });
    expect(flowOf(s).game.state.variant).toBe('plakoto');

    const restored = registry(storage).get(s.id);
    expect(restored?.setup.game).toBe('tavli');
    expect(restored && flowOf(restored).game.state.variant).toBe('plakoto');
    expect(restored && flowOf(restored).match.games.map((g) => g.variant)).toEqual(['portes']);
  });

  it('keeps a game the bot cannot play any more (the match is under way)', () => {
    const { text } = savedText({ ...defaultSetup('bot'), game: 'fevga' });
    const result = parseSavedMatch(text, gameLevels(['easy'], { fevga: [] }));
    expect(result.kind === 'ok' && result.saved.setup).toMatchObject({
      game: 'fevga',
      botLevel: 'easy',
    });
  });

  it('loads a version 1 save from before #109 (Portes, maybe with no game) as Portes', () => {
    const { text } = savedText(botSetup);
    const old = JSON.parse(text);
    expect(old.v).toBe(1);
    expect(parseSavedMatch(text, LEVELS).kind).toBe('ok');
    delete old.setup.game;
    const result = parseSavedMatch(JSON.stringify(old), LEVELS);
    expect(result.kind === 'ok' && result.saved.setup.game).toBe('portes');
  });

  it.each([
    ['a game the log does not have', 'plakoto'],
    ['another built game the log does not play', 'asodio'],
    ['an unknown game', 'chess'],
  ])('drops a save with %s', (_name, game) => {
    const { text } = savedText(tavliSetup);
    const bad = JSON.parse(text);
    bad.setup.game = game;
    expect(parseSavedMatch(JSON.stringify(bad), LEVELS).kind).toBe('broken');
  });

  it('drops a one-game save whose log plays the Tavli rotation', () => {
    const tavli = JSON.parse(savedText(tavliSetup).text);
    const bad = { ...tavli, setup: { ...tavliSetup, game: 'portes' } };
    expect(parseSavedMatch(JSON.stringify(bad), LEVELS).kind).toBe('broken');
  });
});

describe('the opening roll house rule in the save (#207)', () => {
  it.each(['rerollBoth', 'chosenStarterRolls'] as const)(
    'resumes a %s match with the same rule, still before the first roll',
    (openingRoll) => {
      const storage = createMemoryStorage();
      const setup: MatchSetup = { ...defaultSetup('local'), openingRoll };
      const s = registry(storage).start(setup);
      expect(flowOf(s).match.rules.match.openingRoll).toBe(openingRoll);

      const restored = registry(storage).get(s.id);
      expect(restored?.setup.openingRoll).toBe(openingRoll);
      const flow = restored && flowOf(restored);
      expect(flow?.match.rules.match.openingRoll).toBe(openingRoll);
      expect(flow?.game.phase).toBe('opening-roll');
      // `chosenStarterRolls` waits for a pick; the others for the opening roll.
      expect(flow?.game.opening === null).toBe(openingRoll === 'chosenStarterRolls');
    },
  );

  it('resumes a chosen starter: the pick is in the log', () => {
    const storage = createMemoryStorage();
    const s = registry(storage).start({
      ...defaultSetup('bot'),
      openingRoll: 'chosenStarterRolls',
    });
    expect(s.store.getState().dispatch({ type: 'chooseStarter', player: 'black' })).toBe(true);

    const restored = registry(storage).get(s.id);
    const game = restored && flowOf(restored).game;
    expect(game?.phase).toBe('awaiting-roll');
    expect(game?.starter).toBe('black');
  });

  it('loads a save from before #207 (no rule) with the federation rule', () => {
    const s = registry(createMemoryStorage()).start(botSetup);
    const old = JSON.parse(serializeSavedMatch(s.id, s.setup, flowOf(s), 42));
    delete old.setup.openingRoll;
    const result = parseSavedMatch(JSON.stringify(old), LEVELS);
    expect(result.kind === 'ok' && result.saved.setup.openingRoll).toBe('useOpeningDice');
  });

  it('drops a save whose setup and log name another rule', () => {
    const s = registry(createMemoryStorage()).start(botSetup);
    const bad = JSON.parse(serializeSavedMatch(s.id, s.setup, flowOf(s), 42));
    bad.setup.openingRoll = 'rerollBoth';
    expect(parseSavedMatch(JSON.stringify(bad), LEVELS).kind).toBe('broken');
  });
});

describe('the rules version in the save (#241)', () => {
  const versions = { plakoto: 'plakoto.federation', asodio: 'asodio.aceyDeuceyGreek' } as const;

  it.each([
    ['plakoto', 'plakoto.federation'],
    ['asodio', 'asodio.aceyDeuceyGreek'],
  ] as const)('resumes a %s match in its rules version', (game, preset) => {
    const storage = createMemoryStorage();
    const s = registry(storage).start({ ...defaultSetup('local'), game, rulesVersions: versions });
    expect(flowOf(s).match.rules.presetId).toBe(preset);
    expect(flowOf(s).game.state.rules.presetId).toBe(preset);

    const restored = registry(storage).get(s.id);
    expect(restored?.setup.rulesVersions).toEqual(versions);
    expect(restored && flowOf(restored).game.state.rules.presetId).toBe(preset);
  });

  it('loads a save from before #241 (no versions) with the default presets', () => {
    for (const game of ['plakoto', 'asodio'] as const) {
      const s = registry(createMemoryStorage()).start({ ...defaultSetup('local'), game });
      const old = JSON.parse(serializeSavedMatch(s.id, s.setup, flowOf(s), 42));
      delete old.setup.rulesVersions;
      const result = parseSavedMatch(JSON.stringify(old), LEVELS);
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;
      expect(result.saved.setup.rulesVersions).toEqual({
        plakoto: 'plakoto',
        asodio: 'asodio.kafeneio',
      });
      expect(result.saved.flow.match.rules.presetId).toBe(
        game === 'plakoto' ? 'plakoto' : 'asodio.kafeneio',
      );
    }
  });

  it('drops a save whose setup and log name another version', () => {
    const s = registry(createMemoryStorage()).start({
      ...defaultSetup('local'),
      game: 'asodio',
      rulesVersions: versions,
    });
    const bad = JSON.parse(serializeSavedMatch(s.id, s.setup, flowOf(s), 42));
    bad.setup.rulesVersions = { ...versions, asodio: 'asodio.aceyDeuceyAmerican' };
    expect(parseSavedMatch(JSON.stringify(bad), LEVELS).kind).toBe('broken');
    // The version of another game does not matter: only `game` is played.
    const fine = JSON.parse(serializeSavedMatch(s.id, s.setup, flowOf(s), 42));
    fine.setup.rulesVersions = { ...versions, plakoto: 'plakoto' };
    expect(parseSavedMatch(JSON.stringify(fine), LEVELS).kind).toBe('ok');
  });
});
