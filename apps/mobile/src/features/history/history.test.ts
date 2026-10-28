import { createMemoryStorage, type GameSummary, type Storage } from '@tavli/contracts';
import {
  VARIANT_REGISTRY,
  createSeededRng,
  gameRules,
  getVariant,
  type Dice,
  type GameEndReason,
  type GameRecord,
  type PlayerId,
} from '@tavli/engine';

import { createSessionRegistry, hasStarted, type MatchSession } from '@/features/match/sessions';
import {
  GAME_CHOICES,
  MATCH_LENGTHS,
  defaultSetup,
  gameLevels,
  gamePreset,
  gameRotation,
  type MatchSetup,
} from '@/features/match/setup';
import i18n from '@/i18n';

import {
  dateLocale,
  formatDate,
  historyRow,
  onlineHistoryRow,
  recordSetup,
  statParts,
} from './format';
import { createHistoryStore } from './historyStore';
import {
  HISTORY_STORAGE_KEY,
  HISTORY_VERSION,
  MAX_HISTORY_RECORDS,
  addRecord,
  historyRecord,
  isDiplo,
  parseHistory,
  hasMatchRecord,
  serializeHistory,
  type HistoryRecord,
} from './records';
import { EMPTY_LINE, historyStats, winRate } from './stats';

const t = i18n.t.bind(i18n);
const LEVELS = gameLevels(['easy', 'medium']);
const oneGameBot: MatchSetup = { ...defaultSetup('bot'), targetPoints: 1 };

/** A record with sensible defaults: a 3-point Portes match won by you vs Easy. */
function rec(over: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    id: 'local-a@1',
    endedAt: 1,
    mode: 'bot',
    game: 'portes',
    botLevel: 'easy',
    names: { white: '', black: '' },
    targetPoints: 3,
    score: { white: 3, black: 1 },
    end: 'finished',
    winner: 'white',
    resignedBy: null,
    timedOutBy: null,
    games: 3,
    diploWins: { white: 1, black: 0 },
    draws: 0,
    matchNumber: 1,
    openingRoll: 'useOpeningDice',
    preset: gamePreset(over.game ?? 'portes'),
    ...over,
  };
}

function registry(
  storage: Storage = createMemoryStorage(),
  clock = { now: 1_000 },
  historyStorage: Storage = createMemoryStorage(),
) {
  const history = createHistoryStore(historyStorage);
  let seed = 1;
  const sessions = createSessionRegistry({
    createRng: () => createSeededRng(seed++),
    storage,
    levels: LEVELS,
    now: () => clock.now,
    history: history.getState(),
  });
  return { sessions, history, clock, storage };
}

/** A storage whose writes and removes can be made to fail. */
function flakyStorage() {
  const memory = createMemoryStorage();
  const failing = { writes: false, removes: false };
  const storage: Storage = {
    getString: (key) => memory.getString(key),
    setString: (key, value) => {
      if (failing.writes) throw new Error('write');
      memory.setString(key, value);
    },
    remove: (key) => {
      if (failing.removes) throw new Error('remove');
      memory.remove(key);
    },
  };
  return { storage, failing };
}

/** Rolls the opening (White wins it) so White is to move. */
function openGame(s: MatchSession) {
  const { dispatch } = s.store.getState();
  dispatch({ type: 'rollOpening', player: 'white', die: 6 });
  dispatch({ type: 'rollOpening', player: 'black', die: 1 });
}

/** Plays the first legal turn of the player to move and confirms it. */
function playTurn(s: MatchSession) {
  const { game } = s.store.getState().flow;
  const player = game.state.toMove;
  const dice = game.state.dice as Dice;
  const turn = getVariant(VARIANT_REGISTRY, 'portes').legalTurns(game.state, dice)[0]!;
  for (const move of turn.moves) s.store.getState().dispatch({ type: 'move', player, move });
  s.store.getState().dispatch({ type: 'confirm', player });
}

describe('a record is saved when a match ends', () => {
  it('vs bot: the bot resigns the match, you win', () => {
    const { sessions, history, clock } = registry();
    const s = sessions.start({ ...defaultSetup('bot'), botLevel: 'medium', game: 'plakoto' });
    openGame(s);
    clock.now = 5_000;
    s.store.getState().dispatch({ type: 'resignMatch', player: 'black' });
    expect(history.getState().records).toEqual([
      {
        id: `${s.id}@5000`,
        endedAt: 5_000,
        mode: 'bot',
        game: 'plakoto',
        botLevel: 'medium',
        names: { white: '', black: '' },
        targetPoints: 3,
        score: { white: 0, black: 0 },
        end: 'finished',
        winner: 'white',
        resignedBy: 'black',
        timedOutBy: null,
        games: 0,
        diploWins: { white: 0, black: 0 },
        draws: 0,
        matchNumber: 1,
        openingRoll: 'useOpeningDice',
        preset: 'plakoto',
      },
    ]);
  });

  it('keeps the opening roll house rule of the match (#207)', () => {
    const { sessions, history } = registry();
    const s = sessions.start({ ...defaultSetup('local'), openingRoll: 'chosenStarterRolls' });
    s.store.getState().dispatch({ type: 'chooseStarter', player: 'black' });
    s.store.getState().dispatch({ type: 'resignMatch', player: 'black' });
    expect(history.getState().records[0]?.openingRoll).toBe('chosenStarterRolls');
  });

  it('keeps the rules version of the match: its preset (#241)', () => {
    const { sessions, history } = registry();
    const plakoto = sessions.start({
      ...defaultSetup('local'),
      game: 'plakoto',
      rulesVersions: { plakoto: 'plakoto.federation', asodio: 'asodio.kafeneio' },
    });
    plakoto.store.getState().dispatch({ type: 'resignMatch', player: 'black' });
    expect(history.getState().records[0]?.preset).toBe('plakoto.federation');
    const tavli = sessions.start({ ...defaultSetup('local'), game: 'tavli' });
    tavli.store.getState().dispatch({ type: 'resignMatch', player: 'black' });
    expect(history.getState().records[0]?.preset).toBe('tavli');
    // A Tavli match keeps the version of its Plakoto game (#247).
    const federation = sessions.start({
      ...defaultSetup('local'),
      game: 'tavli',
      rulesVersions: { plakoto: 'plakoto.federation', asodio: 'asodio.kafeneio' },
    });
    federation.store.getState().dispatch({ type: 'resignMatch', player: 'black' });
    expect(history.getState().records[0]).toMatchObject({
      game: 'tavli',
      preset: 'plakoto.federation',
    });
  });

  it('vs bot: you resign the only game at the start, the bot wins a diplo', () => {
    const { sessions, history } = registry();
    const s = sessions.start(oneGameBot);
    openGame(s);
    s.store.getState().dispatch({ type: 'resign', player: 'white' });
    expect(s.store.getState().flow.match.status).toBe('finished');
    const [record] = history.getState().records;
    expect(record).toMatchObject({
      winner: 'black',
      resignedBy: null,
      score: { white: 0, black: 2 },
      games: 1,
      diploWins: { white: 0, black: 1 },
      end: 'finished',
    });
  });

  it('vs bot: you resign a game, then the match: the record keeps the 0–2 (#181)', () => {
    const { sessions, history } = registry();
    const s = sessions.start(defaultSetup('bot'));
    openGame(s);
    s.store.getState().dispatch({ type: 'resign', player: 'white' });
    s.store.getState().dispatch({ type: 'nextGame' });
    s.store.getState().dispatch({ type: 'resignMatch', player: 'white' });
    expect(history.getState().records).toHaveLength(1);
    expect(history.getState().records[0]).toMatchObject({
      winner: 'black',
      resignedBy: 'white',
      score: { white: 0, black: 2 },
      games: 1,
      diploWins: { white: 0, black: 1 },
      end: 'finished',
    });
  });

  it('vs bot: your turn timer runs out in the last game, you lose the match on time (#170)', () => {
    const { sessions, history } = registry();
    const s = sessions.start(oneGameBot);
    openGame(s);
    s.store.getState().dispatch({ type: 'timeout', player: 'white' });
    expect(s.store.getState().flow.match.status).toBe('finished');
    expect(history.getState().records[0]).toMatchObject({
      end: 'finished',
      winner: 'black',
      resignedBy: null,
      timedOutBy: 'white',
      games: 1,
    });
  });

  it('a time-out that does not end the match is not a loss on time (#170)', () => {
    const { sessions, history } = registry();
    const s = sessions.start({ ...defaultSetup('bot'), targetPoints: 3 });
    openGame(s);
    const { dispatch } = s.store.getState();
    dispatch({ type: 'timeout', player: 'white' });
    expect(s.store.getState().flow.match.status).toBe('in-progress');
    // The match goes on; then White resigns it.
    dispatch({ type: 'resignMatch', player: 'white' });
    expect(history.getState().records[0]).toMatchObject({
      winner: 'black',
      resignedBy: 'white',
      timedOutBy: null,
    });
  });

  it('pass-and-play: keeps the names and the winner, no bot level', () => {
    const { sessions, history } = registry();
    const setup: MatchSetup = {
      ...defaultSetup('local'),
      game: 'tavli',
      targetPoints: 5,
      names: { white: 'Maria', black: '' },
    };
    const s = sessions.start(setup);
    openGame(s);
    s.store.getState().dispatch({ type: 'resignMatch', player: 'white' });
    expect(history.getState().records[0]).toMatchObject({
      mode: 'local',
      game: 'tavli',
      botLevel: null,
      names: { white: 'Maria', black: '' },
      targetPoints: 5,
      winner: 'black',
      resignedBy: 'white',
    });
  });

  it('records once per match, and a rematch is a new record', () => {
    const { sessions, history, clock } = registry();
    const s = sessions.start(oneGameBot);
    openGame(s);
    s.store.getState().dispatch({ type: 'resign', player: 'white' });
    // More changes to the finished match do not record it again.
    sessions.saveNow();
    expect(history.getState().records).toHaveLength(1);

    clock.now = 2_000;
    s.store.getState().rematch();
    s.store.getState().dispatch({ type: 'resignMatch', player: 'black' });
    const records = history.getState().records;
    expect(records.map((r) => r.winner)).toEqual(['white', 'black']);
    expect(records[0]!.id).not.toBe(records[1]!.id);
    // The rematch is the second match of the session.
    expect(records.map((r) => r.matchNumber)).toEqual([2, 1]);
  });

  it('adds only the match number to the save slot of a match in play', () => {
    const { sessions, storage } = registry();
    const s = sessions.start(oneGameBot);
    openGame(s);
    const saved = JSON.parse(storage.getString('savedMatch')!) as Record<string, unknown>;
    expect(Object.keys(saved).sort()).toEqual([
      'flowSchema',
      'id',
      'log',
      'matchNumber',
      'savedAt',
      'setup',
      'v',
    ]);
    expect(saved['matchNumber']).toBe(1);
    expect(storage.getString(HISTORY_STORAGE_KEY)).toBeUndefined();
  });

  it('a history error does not break the move', () => {
    const sessions = createSessionRegistry({
      createRng: () => createSeededRng(1),
      history: {
        add: () => {
          throw new Error('disk full');
        },
        hasMatch: () => false,
      },
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = sessions.start(oneGameBot);
    openGame(s);
    expect(s.store.getState().dispatch({ type: 'resignMatch', player: 'black' })).toBe(true);
    expect(s.store.getState().flow.match.status).toBe('finished');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('a left match', () => {
  it('is recorded as abandoned when a new match replaces it', () => {
    const { sessions, history } = registry();
    const s = sessions.start(defaultSetup('bot'));
    openGame(s);
    playTurn(s);
    sessions.start(defaultSetup('local'));
    expect(history.getState().records).toEqual([
      expect.objectContaining({
        id: expect.stringContaining(s.id),
        end: 'abandoned',
        winner: null,
      }),
    ]);
  });

  it('is recorded from the save slot after an app restart', () => {
    const storage = createMemoryStorage();
    const first = registry(storage);
    const s = first.sessions.start(defaultSetup('bot'));
    openGame(s);
    // The opening roll alone does not start the match; a move does.
    expect(hasStarted(s.store.getState().flow)).toBe(false);
    playTurn(s);
    expect(hasStarted(s.store.getState().flow)).toBe(true);
    // Restart: a new registry finds the match only in the save slot.
    const second = registry(storage);
    second.sessions.start(defaultSetup('local'));
    expect(second.history.getState().records).toEqual([
      expect.objectContaining({ id: expect.stringContaining(s.id), end: 'abandoned', mode: 'bot' }),
    ]);
  });

  it('is not recorded after the opening roll alone', () => {
    const { sessions, history } = registry();
    const s = sessions.start(defaultSetup('bot'));
    openGame(s);
    const { flow } = s.store.getState();
    expect(flow.log.map((e) => e.type)).toEqual(['start', 'rollOpening', 'rollOpening']);
    expect(hasStarted(flow)).toBe(false);
    sessions.start(defaultSetup('local'));
    expect(history.getState().records).toEqual([]);
  });

  it('is not recorded when nobody played yet, or when it was over', () => {
    const { sessions, history } = registry();
    sessions.start(defaultSetup('bot'));
    openGame(sessions.current()!);
    sessions.start(defaultSetup('bot'));
    expect(history.getState().records).toEqual([]);

    const s = sessions.current()!;
    openGame(s);
    s.store.getState().dispatch({ type: 'resignMatch', player: 'white' });
    sessions.start(defaultSetup('bot'));
    expect(history.getState().records.map((r) => r.end)).toEqual(['finished']);
  });
});

describe('rare cases (#150)', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('records a left match once, even when its save could not be removed', () => {
    const { storage, failing } = flakyStorage();
    const historyStorage = createMemoryStorage();
    const clock = { now: 1_000 };
    const first = registry(storage, clock, historyStorage);
    const old = first.sessions.start(defaultSetup('bot'));
    openGame(old);
    playTurn(old);

    // A new match replaces it, but the slot can be neither cleared nor written.
    failing.writes = true;
    failing.removes = true;
    clock.now = 2_000;
    const next = first.sessions.start(defaultSetup('local'));
    expect(storage.getString('savedMatch')).toContain(old.id);
    // The old save is stale now: it is not offered again.
    expect(first.sessions.peek()).toEqual({ kind: 'none' });
    first.sessions.end(next.id);
    clock.now = 3_000;
    first.sessions.start(defaultSetup('local'));

    // After a restart, the storage works again.
    failing.writes = false;
    failing.removes = false;
    clock.now = 4_000;
    const second = registry(storage, clock, historyStorage);
    expect(second.sessions.peek()).toEqual({ kind: 'none' });
    // `peek` only reads; `start` deletes the stale save.
    expect(storage.getString('savedMatch')).toContain(old.id);
    second.sessions.start(defaultSetup('bot'));
    expect(second.history.getState().records.map((r) => r.id)).toEqual([`${old.id}@2000`]);
    expect(storage.getString('savedMatch')).not.toContain(old.id);
  });

  it('does not record a match as left when it finished just before the app died', () => {
    const { storage, failing } = flakyStorage();
    const historyStorage = createMemoryStorage();
    const clock = { now: 1_000 };
    const first = registry(storage, clock, historyStorage);
    const s = first.sessions.start(oneGameBot);
    openGame(s);
    playTurn(s);
    // The match ends and is recorded; the app dies before the slot is cleared.
    failing.removes = true;
    clock.now = 2_000;
    s.store.getState().dispatch({ type: 'resignMatch', player: 'white' });
    expect(storage.getString('savedMatch')).toContain(s.id);

    failing.removes = false;
    clock.now = 3_000;
    const second = registry(storage, clock, historyStorage);
    expect(second.sessions.peek()).toEqual({ kind: 'none' });
    expect(second.sessions.get(s.id)).toBeNull();
    // Lookups do not delete it; `end` (the player is done with it) does.
    expect(storage.getString('savedMatch')).toContain(s.id);
    second.sessions.end(s.id);
    expect(storage.getString('savedMatch')).toBeUndefined();
    second.sessions.start(defaultSetup('local'));
    expect(second.history.getState().records.map((r) => [r.id, r.end])).toEqual([
      [`${s.id}@2000`, 'finished'],
    ]);
  });

  it('keeps a live rematch save when the clock moved back after the match ended', () => {
    const storage = createMemoryStorage();
    const historyStorage = createMemoryStorage();
    const clock = { now: 5_000 };
    const first = registry(storage, clock, historyStorage);
    const s = first.sessions.start(oneGameBot);
    openGame(s);
    s.store.getState().dispatch({ type: 'resignMatch', player: 'white' });
    // The phone clock is set back before the rematch is saved.
    clock.now = 1_000;
    s.store.getState().rematch();
    const player = s.store.getState().flow.game.state.toMove;
    s.store.getState().dispatch({ type: 'roll', player, dice: [6, 1] });
    playTurn(s);
    const live = storage.getString('savedMatch');

    // After a restart the rematch is still there to continue.
    const second = registry(storage, clock, historyStorage);
    expect(second.sessions.peek()).toMatchObject({
      kind: 'ok',
      saved: { id: s.id, savedAt: 1_000, matchNumber: 2 },
    });
    expect(second.sessions.get(s.id)).not.toBeNull();
    expect(storage.getString('savedMatch')).toBe(live);
  });

  it('reads a save from before #150 (no match number) as a live match', () => {
    const storage = createMemoryStorage();
    const historyStorage = createMemoryStorage();
    const first = registry(storage, { now: 1_000 }, historyStorage);
    const s = first.sessions.start(defaultSetup('bot'));
    openGame(s);
    playTurn(s);
    const old = JSON.parse(storage.getString('savedMatch')!) as Record<string, unknown>;
    delete old['matchNumber'];
    storage.setString('savedMatch', JSON.stringify(old));

    const second = registry(storage, { now: 2_000 }, historyStorage);
    expect(second.sessions.peek()).toMatchObject({ kind: 'ok', saved: { matchNumber: null } });
    second.sessions.start(defaultSetup('local'));
    expect(second.history.getState().records).toEqual([
      expect.objectContaining({ id: `${s.id}@2000`, end: 'abandoned', matchNumber: null }),
    ]);
  });

  it('still records a rematch that was left, after the app restarts', () => {
    const storage = createMemoryStorage();
    const historyStorage = createMemoryStorage();
    const clock = { now: 1_000 };
    const first = registry(storage, clock, historyStorage);
    const s = first.sessions.start(oneGameBot);
    openGame(s);
    clock.now = 2_000;
    s.store.getState().dispatch({ type: 'resignMatch', player: 'white' });
    // The rematch keeps the session id; it is saved after the record.
    clock.now = 3_000;
    s.store.getState().rematch();
    // The winner starts the rematch: no opening roll.
    const player = s.store.getState().flow.game.state.toMove;
    expect(s.store.getState().dispatch({ type: 'roll', player, dice: [6, 1] })).toBe(true);
    playTurn(s);

    const second = registry(storage, clock, historyStorage);
    expect(second.sessions.peek()).toMatchObject({ kind: 'ok', saved: { id: s.id } });
    clock.now = 4_000;
    second.sessions.start(defaultSetup('local'));
    expect(second.history.getState().records.map((r) => [r.id, r.end])).toEqual([
      [`${s.id}@4000`, 'abandoned'],
      [`${s.id}@2000`, 'finished'],
    ]);
  });

  it('records the match in memory as left when get(id) loads a saved one', () => {
    const { storage, failing } = flakyStorage();
    const history = createHistoryStore(createMemoryStorage());
    const gameAbandoned = jest.fn();
    let seed = 1;
    const sessions = createSessionRegistry({
      createRng: () => createSeededRng(seed++),
      storage,
      levels: LEVELS,
      now: () => 1_000,
      history: history.getState(),
      createAnalytics: () => ({
        gameStarted: () => undefined,
        actionApplied: () => undefined,
        gameAbandoned,
      }),
    });
    // Not started yet (opening roll only), so replacing it records nothing.
    const saved = sessions.start(defaultSetup('bot'));
    openGame(saved);
    failing.writes = true;
    failing.removes = true;
    const live = sessions.start(defaultSetup('local'));
    openGame(live);
    playTurn(live);
    expect(history.getState().records).toEqual([]);
    gameAbandoned.mockClear();

    // The slot still holds the first match; loading it drops the live one.
    expect(sessions.get(saved.id)?.id).toBe(saved.id);
    expect(sessions.current()?.id).toBe(saved.id);
    expect(gameAbandoned).toHaveBeenCalledWith(live.store.getState().flow);
    expect(history.getState().records).toEqual([
      expect.objectContaining({ id: `${live.id}@1000`, end: 'abandoned', mode: 'local' }),
    ]);
  });

  it('finds a match of a session by its number, not by a time', () => {
    const records = [
      rec({ id: 'local-a@5', endedAt: 5, matchNumber: 1 }),
      rec({ id: 'local-ab@9', endedAt: 9, matchNumber: 2 }),
      rec({ id: 'local-c@1', endedAt: 1, matchNumber: null }),
    ];
    expect(hasMatchRecord(records, 'local-a', 1)).toBe(true);
    expect(hasMatchRecord(records, 'local-a', 2)).toBe(false);
    // `local-ab` is another session.
    expect(hasMatchRecord(records, 'local-ab', 2)).toBe(true);
    expect(hasMatchRecord(records, 'local-a', 2)).toBe(false);
    // A record from before #150 names no match.
    expect(hasMatchRecord(records, 'local-c', 1)).toBe(false);
  });
});

describe('diplo wins', () => {
  const game = (winner: PlayerId | null, points: number, reason: GameEndReason): GameRecord => ({
    variant: 'portes',
    starter: 'white',
    winner,
    points,
    reason,
  });

  it('counts won games worth 2 points or more, as the rules score them', () => {
    const { sessions } = registry();
    const { match } = sessions.start(defaultSetup('bot')).store.getState().flow;
    const games = [
      game('white', 1, 'borneOff'), // mono: Black bore off a checker
      game('white', 2, 'borneOff'), // diplo: Black bore off none
      game('black', 2, 'motherPinned'), // Plakoto: a pinned mother is a double
      game('black', 2, 'resigned'), // a resign scores the position: here a double
      game('white', 1, 'resigned'), // ... and here a single
      game('white', 2, 'timeout'), // a timeout scores like a resign
      game('white', 3, 'borneOff'), // `backgammonScores3` (off by default): still a double
      game(null, 0, 'bothMothersPinned'), // a draw
    ];
    const record = historyRecord(
      'local-x',
      defaultSetup('bot'),
      { ...match, games },
      1,
      'finished',
      1,
    );
    expect(record.diploWins).toEqual({ white: 3, black: 2 });
    expect(record.draws).toBe(1);
    expect(games.map((g) => isDiplo(g))).toEqual([
      false,
      true,
      true,
      true,
      false,
      true,
      true,
      false,
    ]);
  });

  it('every game of the app uses Tavli scoring, but Acey-Deucey American (#241)', () => {
    const { sessions } = registry();
    const versions = [
      { plakoto: 'plakoto', asodio: 'asodio.kafeneio' },
      { plakoto: 'plakoto.federation', asodio: 'asodio.aceyDeuceyGreek' },
      { plakoto: 'plakoto', asodio: 'asodio.aceyDeuceyAmerican' },
    ] as const;
    for (const rulesVersions of versions) {
      for (const choice of GAME_CHOICES) {
        const { match } = sessions
          .start({ ...defaultSetup('bot'), game: choice, rulesVersions })
          .store.getState().flow;
        const american = match.rules.presetId === 'asodio.aceyDeuceyAmerican';
        for (const variant of gameRotation(choice)) {
          const { method, backgammonScores3 } = gameRules(match, variant).scoring;
          // `historyRecord` reads the scoring from the match rules: right for
          // every game, since only a one-game match can change it.
          expect({ choice, variant, method, backgammonScores3 }).toEqual({
            choice,
            variant,
            method: match.rules.scoring.method,
            backgammonScores3: false,
          });
          expect(method).toBe(american ? 'perChecker' : 'tavli');
        }
      }
    }
  });

  it('with perChecker scoring only 15 points (no checker off) is a diplo (#241)', () => {
    expect(isDiplo(game('white', 2, 'borneOff'), 'perChecker')).toBe(false);
    expect(isDiplo(game('white', 14, 'borneOff'), 'perChecker')).toBe(false);
    expect(isDiplo(game('white', 15, 'borneOff'), 'perChecker')).toBe(true);
    expect(isDiplo(game('black', 15, 'resigned'), 'perChecker')).toBe(true);
    expect(isDiplo(game(null, 0, 'deadlock'), 'perChecker')).toBe(false);
    expect(isDiplo(game('white', 2, 'borneOff'), 'tavli')).toBe(true);
    expect(isDiplo(game('white', 1, 'borneOff'), 'singleOnly')).toBe(false);

    const { sessions } = registry();
    const { match } = sessions
      .start({
        ...defaultSetup('bot'),
        game: 'asodio',
        rulesVersions: { plakoto: 'plakoto', asodio: 'asodio.aceyDeuceyAmerican' },
      })
      .store.getState().flow;
    const games = [game('white', 5, 'borneOff'), game('black', 15, 'borneOff')];
    const record = historyRecord(
      'local-x',
      defaultSetup('bot'),
      { ...match, games },
      1,
      'finished',
      1,
    );
    expect(record.diploWins).toEqual({ white: 0, black: 1 });
  });
});

describe('history list', () => {
  it('puts the newest first and keeps at most 200', () => {
    let records: HistoryRecord[] = [];
    for (let i = 1; i <= MAX_HISTORY_RECORDS + 5; i++) {
      records = addRecord(records, rec({ id: `r${i}`, endedAt: i }));
    }
    expect(records).toHaveLength(MAX_HISTORY_RECORDS);
    expect(records[0]!.id).toBe(`r${MAX_HISTORY_RECORDS + 5}`);
    expect(records.at(-1)!.id).toBe('r6');
  });

  it('replaces a record with the same id', () => {
    const records = addRecord([rec({ id: 'a' }), rec({ id: 'b' })], rec({ id: 'b', endedAt: 9 }));
    expect(records.map((r) => [r.id, r.endedAt])).toEqual([
      ['b', 9],
      ['a', 1],
    ]);
  });

  it('saves and loads, newest first, with the cap', () => {
    const storage = createMemoryStorage();
    const store = createHistoryStore(storage, 2);
    store.getState().add(rec({ id: 'a', endedAt: 1 }));
    store.getState().add(rec({ id: 'b', endedAt: 2 }));
    store.getState().add(rec({ id: 'c', endedAt: 3 }));
    expect(JSON.parse(storage.getString(HISTORY_STORAGE_KEY)!)).toMatchObject({
      v: HISTORY_VERSION,
    });
    expect(
      createHistoryStore(storage)
        .getState()
        .records.map((r) => r.id),
    ).toEqual(['c', 'b']);
  });

  it('clears every record', () => {
    const storage = createMemoryStorage();
    const store = createHistoryStore(storage);
    store.getState().add(rec());
    store.getState().clear();
    expect(store.getState().records).toEqual([]);
    expect(storage.getString(HISTORY_STORAGE_KEY)).toBeUndefined();
    expect(createHistoryStore(storage).getState().records).toEqual([]);
  });

  it('keeps working when the storage fails', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken: Storage = {
      getString: () => {
        throw new Error('read');
      },
      setString: () => {
        throw new Error('write');
      },
      remove: () => {
        throw new Error('remove');
      },
    };
    const store = createHistoryStore(broken);
    expect(store.getState().records).toEqual([]);
    store.getState().add(rec());
    expect(store.getState().records).toHaveLength(1);
    store.getState().clear();
    expect(store.getState().records).toEqual([]);
    // read, write, remove, then the empty-history fallback write.
    expect(warn).toHaveBeenCalledTimes(4);
    warn.mockRestore();
  });

  it('still clears when remove fails: it writes an empty history instead', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const memory = createMemoryStorage();
    const storage: Storage = {
      getString: (key) => memory.getString(key),
      setString: (key, value) => memory.setString(key, value),
      remove: () => {
        throw new Error('remove');
      },
    };
    const store = createHistoryStore(storage);
    store.getState().add(rec());
    store.getState().clear();
    expect(store.getState().records).toEqual([]);
    // After a restart the old records do not come back.
    expect(createHistoryStore(storage).getState().records).toEqual([]);
    warn.mockRestore();
  });

  it.each([
    ['nothing', undefined],
    ['not JSON', '{oops'],
    ['another version', JSON.stringify({ v: HISTORY_VERSION + 1, records: [rec()] })],
    ['no list', JSON.stringify({ v: HISTORY_VERSION })],
  ])('reads %s as an empty history', (_, text) => {
    expect(parseHistory(text)).toEqual([]);
  });

  it('drops bad records and keeps the good ones', () => {
    const bad: unknown[] = [
      null,
      { ...rec(), id: '' },
      { ...rec(), mode: 'online' },
      { ...rec(), game: 'chess' },
      { ...rec(), botLevel: 'expert' },
      { ...rec(), mode: 'local', botLevel: 'easy' },
      { ...rec(), end: 'finished', winner: null },
      { ...rec(), end: 'abandoned', winner: 'white' },
      { ...rec(), score: { white: -1, black: 0 } },
      { ...rec(), diploWins: null },
      { ...rec(), games: 1.5 },
      { ...rec(), targetPoints: 0 },
      { ...rec(), targetPoints: 1.5 },
      { ...rec(), targetPoints: '3' },
      { ...rec(), matchNumber: 0 },
      { ...rec(), matchNumber: '1' },
      // A time-out names the loser of a finished match.
      { ...rec(), timedOutBy: 'red' },
      { ...rec(), timedOutBy: 'white' },
      { ...rec(), end: 'abandoned', winner: null, timedOutBy: 'black' },
      { ...rec({ winner: 'black' }), resignedBy: 'white', timedOutBy: 'white' },
      // Times that make no valid date: they would crash the date text.
      { ...rec(), endedAt: 1e20 },
      { ...rec(), endedAt: -1 },
      { ...rec(), endedAt: Number.MAX_VALUE },
    ];
    const good = rec({ id: 'good' });
    const text = JSON.stringify({ v: HISTORY_VERSION, records: [...bad, good] });
    expect(parseHistory(text)).toEqual([good]);
    expect(parseHistory(serializeHistory([good]))).toEqual([good]);
  });

  it('keeps any positive match length, so an old record is never dropped for it', () => {
    const records = [...MATCH_LENGTHS, 2, 9, 15].map((targetPoints) =>
      rec({ id: `m${targetPoints}`, targetPoints }),
    );
    expect(parseHistory(serializeHistory(records))).toEqual(records);
  });

  it('saves and loads a match lost on time; a record from before #170 has no time-out', () => {
    const onTime = rec({ winner: 'black', score: { white: 1, black: 3 }, timedOutBy: 'white' });
    expect(parseHistory(serializeHistory([onTime]))).toEqual([onTime]);
    const { timedOutBy: _, ...old } = rec();
    const text = JSON.stringify({ v: HISTORY_VERSION, records: [old] });
    expect(parseHistory(text)).toEqual([rec()]);
  });

  it('reads a record from before #150 (no match number)', () => {
    const { matchNumber: _, ...old } = rec();
    const text = JSON.stringify({ v: HISTORY_VERSION, records: [old] });
    expect(parseHistory(text)).toEqual([rec({ matchNumber: null })]);
  });

  it('saves and loads the opening roll rule; a record from before #207 has the federation rule', () => {
    const records = [
      rec({ id: 'a', openingRoll: 'rerollBoth' }),
      rec({ id: 'b', openingRoll: 'chosenStarterRolls' }),
    ];
    expect(parseHistory(serializeHistory(records))).toEqual(records);
    const { openingRoll: _, ...old } = rec();
    const text = JSON.stringify({ v: HISTORY_VERSION, records: [old] });
    expect(parseHistory(text)).toEqual([rec({ openingRoll: 'useOpeningDice' })]);
  });

  it('saves and loads the rules version; a record from before #241 has the default preset', () => {
    const records = [
      rec({ id: 'a', game: 'plakoto', preset: 'plakoto.federation' }),
      rec({ id: 'b', game: 'asodio', preset: 'asodio.aceyDeuceyAmerican' }),
      rec({ id: 'c', game: 'tavli' }),
      rec({ id: 'd', game: 'tavli', preset: 'plakoto.federation' }),
    ];
    expect(parseHistory(serializeHistory(records))).toEqual(records);
    const old = (over: Partial<HistoryRecord>) => {
      const { preset: _, ...rest } = rec(over);
      return rest;
    };
    const text = JSON.stringify({
      v: HISTORY_VERSION,
      records: [
        old({ id: 'a', game: 'plakoto' }),
        old({ id: 'b', game: 'asodio' }),
        old({ id: 'c' }),
      ],
    });
    expect(parseHistory(text).map((r) => r.preset)).toEqual([
      'plakoto',
      'asodio.kafeneio',
      'portes',
    ]);
  });

  it('keeps a record whose preset is not one of its game, with the default preset (#241)', () => {
    const text = JSON.stringify({
      v: HISTORY_VERSION,
      records: [
        { ...rec({ id: 'a', game: 'plakoto' }), preset: 'asodio.aceyDeuceyGreek' },
        { ...rec({ id: 'b', game: 'portes' }), preset: 'plakoto.federation' },
        { ...rec({ id: 'c', game: 'asodio' }), preset: 'chess' },
        // A Tavli match plays no Asodio, and `plakoto` is never its preset (#247).
        { ...rec({ id: 'd', game: 'tavli' }), preset: 'asodio.aceyDeuceyGreek' },
        { ...rec({ id: 'e', game: 'tavli' }), preset: 'plakoto' },
      ],
    });
    expect(parseHistory(text).map((r) => r.preset)).toEqual([
      'plakoto',
      'portes',
      'asodio.kafeneio',
      'tavli',
      'tavli',
    ]);
  });

  it('keeps a record with an unknown opening roll rule, with the federation rule (#207)', () => {
    const text = JSON.stringify({
      v: HISTORY_VERSION,
      records: [
        { ...rec({ id: 'a' }), openingRoll: 'coinFlip' },
        { ...rec({ id: 'b' }), openingRoll: 42 },
      ],
    });
    expect(parseHistory(text)).toEqual([
      rec({ id: 'a', openingRoll: 'useOpeningDice' }),
      rec({ id: 'b', openingRoll: 'useOpeningDice' }),
    ]);
  });

  it('keeps one record per id, the first (newest)', () => {
    const text = serializeHistory([
      rec({ id: 'a', endedAt: 3 }),
      rec({ id: 'b', endedAt: 2 }),
      rec({ id: 'a', endedAt: 1 }),
    ]);
    expect(parseHistory(text).map((r) => [r.id, r.endedAt])).toEqual([
      ['a', 3],
      ['b', 2],
    ]);
  });

  it('keeps the stored order when the clock moved back', () => {
    const storage = createMemoryStorage();
    const store = createHistoryStore(storage);
    store.getState().add(rec({ id: 'first', endedAt: 100 }));
    // The phone clock was set back before the next match ended.
    store.getState().add(rec({ id: 'second', endedAt: 50 }));
    const order = ['second', 'first'];
    expect(store.getState().records.map((r) => r.id)).toEqual(order);
    expect(
      createHistoryStore(storage)
        .getState()
        .records.map((r) => r.id),
    ).toEqual(order);
  });
});

describe('stats', () => {
  const records = [
    rec({ id: '1', winner: 'white', diploWins: { white: 2, black: 0 } }),
    rec({ id: '2', winner: 'black', diploWins: { white: 0, black: 1 }, draws: 1 }),
    rec({ id: '3', end: 'abandoned', winner: null, diploWins: { white: 1, black: 0 } }),
    rec({ id: '4', botLevel: 'medium', winner: 'white', diploWins: { white: 0, black: 0 } }),
    rec({ id: '5', game: 'asodio', winner: 'black', draws: 2 }),
    rec({
      id: '6',
      game: 'asodio',
      mode: 'local',
      botLevel: null,
      winner: 'white',
      diploWins: { white: 3, black: 1 },
      draws: 1,
    }),
  ];

  it('counts per game (picker order) and per bot level', () => {
    const stats = historyStats(records);
    expect(stats.map((s) => s.game)).toEqual(['portes', 'asodio']);
    const [portes, asodio] = stats;
    expect(portes!.byLevel).toEqual([
      {
        level: 'easy',
        line: { played: 3, won: 1, lost: 1, unfinished: 1, diploWins: 3, draws: 1 },
      },
      {
        level: 'medium',
        line: { played: 1, won: 1, lost: 0, unfinished: 0, diploWins: 0, draws: 0 },
      },
    ]);
    expect(portes!.local).toBeNull();
    expect(asodio!.byLevel).toEqual([
      {
        level: 'easy',
        line: { played: 1, won: 0, lost: 1, unfinished: 0, diploWins: 1, draws: 2 },
      },
    ]);
    // Pass-and-play has no "you": only played and draws count.
    expect(asodio!.local).toEqual({
      played: 1,
      won: 0,
      lost: 0,
      unfinished: 0,
      diploWins: 0,
      draws: 1,
    });
  });

  it('gives the win rate as a whole percent of finished matches (won + lost)', () => {
    expect(winRate(EMPTY_LINE)).toBeNull();
    // Left matches only: no rate yet.
    expect(winRate({ ...EMPTY_LINE, played: 2, unfinished: 2 })).toBeNull();
    expect(winRate({ ...EMPTY_LINE, played: 3, won: 1, lost: 2 })).toBe(33);
    expect(winRate({ ...EMPTY_LINE, played: 3, won: 2, lost: 1 })).toBe(67);
    // A left match does not lower the rate.
    expect(winRate({ ...EMPTY_LINE, played: 5, won: 4, unfinished: 1 })).toBe(100);
    expect(winRate({ ...EMPTY_LINE, played: 1, lost: 1 })).toBe(0);
  });

  it('gives the same stats in any record order', () => {
    expect(historyStats([...records].reverse())).toEqual(historyStats(records));
  });

  it('has no stats with no records', () => {
    expect(historyStats([])).toEqual([]);
  });
});

describe('history texts', () => {
  it('describes a won, a lost and a left match vs the bot', () => {
    expect(historyRow(rec({ endedAt: Date.UTC(2026, 9, 27, 12) }), t, 'en-GB')).toEqual({
      title: 'Portes · vs Bot (Easy)',
      score: 'You 3 – 1 Bot · first to 3',
      badge: 'won',
      result: 'Won',
      date: '27 Oct 2026',
      label: 'Portes · vs Bot (Easy), You 3 – 1 Bot · first to 3, Won, 27 Oct 2026',
    });
    expect(historyRow(rec({ winner: 'black' }), t, 'en').result).toBe('Lost');
    expect(historyRow(rec({ end: 'abandoned', winner: null }), t, 'en').result).toBe(
      'Not finished',
    );
  });

  it('says who resigned the match, next to the score (#181)', () => {
    const lost = rec({ score: { white: 0, black: 2 }, winner: 'black', resignedBy: 'white' });
    expect(historyRow(lost, t, 'en')).toMatchObject({
      score: 'You 0 – 2 Bot · first to 3 · you resigned',
      result: 'Lost',
    });
    const won = rec({ score: { white: 0, black: 0 }, winner: 'white', resignedBy: 'black' });
    expect(historyRow(won, t, 'en').score).toBe('You 0 – 0 Bot · first to 3 · Bot resigned');
    const local = rec({ mode: 'local', botLevel: null, names: { white: 'Maria', black: '' } });
    expect(historyRow({ ...local, winner: 'black', resignedBy: 'white' }, t, 'en').score).toBe(
      'Maria 3 – 1 Player 2 · first to 3 · Maria resigned',
    );
  });

  it('names the winner in pass-and-play', () => {
    const local = rec({ mode: 'local', botLevel: null, names: { white: 'Maria', black: '' } });
    const row = historyRow({ ...local, winner: 'black' }, t, 'en');
    expect(row).toMatchObject({
      title: 'Portes · pass-and-play',
      score: 'Maria 3 – 1 Player 2 · first to 3',
      badge: 'winner',
      result: 'Player 2 won',
    });
  });

  it('says when a match was won or lost on time (#170)', () => {
    expect(historyRow(rec({ timedOutBy: 'black' }), t, 'en').result).toBe('Won on time');
    const lost = rec({ winner: 'black', timedOutBy: 'white' });
    expect(historyRow(lost, t, 'en')).toMatchObject({ badge: 'lost', result: 'Lost on time' });
    const local = rec({ mode: 'local', botLevel: null, names: { white: 'Maria', black: '' } });
    expect(historyRow({ ...local, winner: 'white', timedOutBy: 'black' }, t, 'en')).toMatchObject({
      badge: 'winner',
      result: 'Maria won on time',
    });
  });

  it('shows the opening roll house rule after the length (#221)', () => {
    const el = i18n.getFixedT('el');
    const reroll = rec({ openingRoll: 'rerollBoth' });
    expect(historyRow(reroll, t, 'en')).toMatchObject({
      score: 'You 3 – 1 Bot · first to 3 · Opening roll: Roll again',
      label:
        'Portes · vs Bot (Easy), You 3 – 1 Bot · first to 3 · Opening roll: Roll again, Won, Jan 1, 1970',
    });
    expect(historyRow(reroll, el, 'el').score).toBe(
      'Εσύ 3 – 1 Υπολογιστής · στους 3 · Πρώτη ζαριά: Ξαναρίχνει',
    );
    const chosen = rec({ openingRoll: 'chosenStarterRolls' });
    expect(historyRow(chosen, t, 'en').score).toBe(
      'You 3 – 1 Bot · first to 3 · Opening roll: Choose',
    );
    expect(historyRow(chosen, el, 'el').score).toBe(
      'Εσύ 3 – 1 Υπολογιστής · στους 3 · Πρώτη ζαριά: Διαλέγουμε',
    );
    // The federation rule shows nothing extra.
    expect(historyRow(rec(), t, 'en').score).toBe('You 3 – 1 Bot · first to 3');
    expect(historyRow(rec(), el, 'el').score).toBe('Εσύ 3 – 1 Υπολογιστής · στους 3');
    // It comes before the resign note.
    const resigned = rec({ openingRoll: 'rerollBoth', winner: 'black', resignedBy: 'white' });
    expect(historyRow(resigned, t, 'en').score).toBe(
      'You 3 – 1 Bot · first to 3 · Opening roll: Roll again · you resigned',
    );
  });

  it("keeps the record's opening roll in its setup (#221)", () => {
    for (const openingRoll of ['useOpeningDice', 'rerollBoth', 'chosenStarterRolls'] as const) {
      expect(recordSetup(rec({ openingRoll })).openingRoll).toBe(openingRoll);
      const local = rec({ mode: 'local', botLevel: null, openingRoll });
      expect(recordSetup(local)).toMatchObject({ mode: 'local', openingRoll });
    }
  });

  it('gives an unknown opening roll the federation rule and shows nothing for it (#221)', () => {
    // A record is typed, but one built in code could still carry a bad value.
    const odd = rec({ openingRoll: 'tossACoin' as HistoryRecord['openingRoll'] });
    expect(recordSetup(odd).openingRoll).toBe('useOpeningDice');
    expect(historyRow(odd, t, 'en').score).toBe('You 3 – 1 Bot · first to 3');
  });

  it('shows the rules version after the length (#241)', () => {
    const el = i18n.getFixedT('el');
    const federation = rec({ game: 'plakoto', preset: 'plakoto.federation' });
    expect(historyRow(federation, t, 'en')).toMatchObject({
      title: 'Plakoto · vs Bot (Easy)',
      score: 'You 3 – 1 Bot · first to 3 · Rules version: Federation',
      label:
        'Plakoto · vs Bot (Easy), You 3 – 1 Bot · first to 3 · Rules version: Federation, Won, Jan 1, 1970',
    });
    expect(historyRow(federation, el, 'el').score).toBe(
      'Εσύ 3 – 1 Υπολογιστής · στους 3 · Παραλλαγή: Ομοσπονδίας',
    );
    const greek = rec({
      game: 'asodio',
      preset: 'asodio.aceyDeuceyGreek',
      openingRoll: 'rerollBoth',
    });
    expect(historyRow(greek, t, 'en').score).toBe(
      'You 3 – 1 Bot · first to 3 · Opening roll: Roll again · Rules version: Greek',
    );
    expect(historyRow(greek, el, 'el').score).toBe(
      'Εσύ 3 – 1 Υπολογιστής · στους 3 · Πρώτη ζαριά: Ξαναρίχνει · Παραλλαγή: Ελληνική',
    );
    const american = rec({ game: 'asodio', preset: 'asodio.aceyDeuceyAmerican' });
    expect(historyRow(american, t, 'en').score).toBe(
      'You 3 – 1 Bot · first to 3 · Rules version: American',
    );
    // The default preset shows nothing extra.
    for (const game of ['plakoto', 'asodio', 'tavli', 'portes'] as const) {
      expect(historyRow(rec({ game }), t, 'en').score).toBe('You 3 – 1 Bot · first to 3');
    }
  });

  it('names the game of the version in a Tavli match (#247)', () => {
    const el = i18n.getFixedT('el');
    const federation = rec({ game: 'tavli', preset: 'plakoto.federation' });
    expect(historyRow(federation, t, 'en')).toMatchObject({
      title: 'Tavli · vs Bot (Easy)',
      score: 'You 3 – 1 Bot · first to 3 · Rules version (Plakoto): Federation',
    });
    expect(historyRow(federation, el, 'el').score).toBe(
      'Εσύ 3 – 1 Υπολογιστής · στους 3 · Παραλλαγή (Πλακωτό): Ομοσπονδίας',
    );
    expect(recordSetup(federation).rulesVersions).toEqual({
      plakoto: 'plakoto.federation',
      asodio: 'asodio.kafeneio',
    });
    expect(recordSetup(rec({ game: 'tavli' })).rulesVersions).toEqual({
      plakoto: 'plakoto',
      asodio: 'asodio.kafeneio',
    });
  });

  it("keeps the record's rules version in its setup (#241)", () => {
    expect(
      recordSetup(rec({ game: 'plakoto', preset: 'plakoto.federation' })).rulesVersions,
    ).toEqual({ plakoto: 'plakoto.federation', asodio: 'asodio.kafeneio' });
    expect(
      recordSetup(rec({ game: 'asodio', preset: 'asodio.aceyDeuceyGreek' })).rulesVersions,
    ).toEqual({ plakoto: 'plakoto', asodio: 'asodio.aceyDeuceyGreek' });
    // A preset that is not one of the game gets the default and shows nothing.
    const odd = rec({ game: 'portes', preset: 'plakoto.federation' });
    expect(recordSetup(odd).rulesVersions).toEqual({
      plakoto: 'plakoto',
      asodio: 'asodio.kafeneio',
    });
    expect(historyRow(odd, t, 'en').score).toBe('You 3 – 1 Bot · first to 3');
  });

  it('shows a match length the new-game screen does not offer as it is', () => {
    expect(
      historyRow(rec({ targetPoints: 9, score: { white: 9, black: 4 } }), t, 'en'),
    ).toMatchObject({
      title: 'Portes · vs Bot (Easy)',
      score: 'You 9 – 4 Bot · first to 9',
      result: 'Won',
    });
  });

  it('formats the date in the locale', () => {
    const ms = Date.UTC(2026, 9, 27, 12);
    expect(formatDate(ms, 'en-US')).toBe('Oct 27, 2026');
    expect(formatDate(ms, 'el')).toMatch(/27 Οκτ/);
    expect(formatDate(ms, 'not a locale!')).toBe('2026-10-27');
    // Never throws, even for a time that is not a date.
    expect(formatDate(1e20, 'en')).toBe('');
    expect(formatDate(Number.NaN, 'not a locale!')).toBe('');
    expect(historyRow(rec({ endedAt: 1e20 }), t, 'en').label).toBe(
      'Portes · vs Bot (Easy), You 3 – 1 Bot · first to 3, Won',
    );
  });

  it('makes one date formatter per locale', () => {
    const make = jest.spyOn(Intl, 'DateTimeFormat');
    const ms = Date.UTC(2026, 9, 27, 12);
    expect(formatDate(ms, 'en-AU')).toBe('27 Oct 2026');
    expect(formatDate(ms + 86_400_000, 'en-AU')).toBe('28 Oct 2026');
    // A locale that fails is tried once too.
    expect(formatDate(ms, 'also not a locale!')).toBe('2026-10-27');
    expect(formatDate(ms, 'also not a locale!')).toBe('2026-10-27');
    expect(make).toHaveBeenCalledTimes(2);
    make.mockRestore();
  });

  it('uses the phone locale when it speaks the app language', () => {
    const phone = [
      { languageCode: 'en', languageTag: 'en-GB' },
      { languageCode: 'el', languageTag: 'el-GR' },
    ];
    expect(dateLocale('el', phone)).toBe('el-GR');
    expect(dateLocale('en', phone)).toBe('en-GB');
    expect(dateLocale('en', [{ languageCode: 'de', languageTag: 'de-DE' }])).toBe('en');
  });

  it('lists the stat parts vs the bot and in pass-and-play', () => {
    const line = { played: 5, won: 3, lost: 1, unfinished: 1, diploWins: 2, draws: 1 };
    expect(statParts(line, 'bot', t)).toEqual([
      'Played 5',
      'Won 3',
      'Lost 1',
      'Win rate 75%',
      'Diplo wins 2',
      'Draws 1',
      'Not finished 1',
    ]);
    expect(statParts({ ...line, unfinished: 0 }, 'local', t)).toEqual(['Played 5', 'Draws 1']);
  });
});

describe('online history texts (#313)', () => {
  const finished: GameSummary = {
    gameId: 'g1',
    status: 'finished',
    choice: 'plakoto',
    presetId: 'plakoto',
    variant: 'plakoto',
    targetPoints: 5,
    pace: 'async',
    mySide: 'black',
    waitingFor: null,
    myTurn: false,
    score: { white: 2, black: 5 },
    winner: 'black',
    updatedAt: Date.UTC(2026, 9, 28, 12),
    turnDeadline: null,
  };

  it('names the winner, with your points first', () => {
    expect(onlineHistoryRow(finished, t, 'en-GB')).toEqual({
      title: 'Plakoto vs friend',
      score: '5–2 · first to 5',
      badge: 'won',
      result: 'You won',
      date: '28 Oct 2026',
      label: 'Plakoto vs friend, 5 to 2, first to 5, You won, 28 Oct 2026',
    });
    expect(onlineHistoryRow({ ...finished, mySide: 'white' }, t, 'en-GB')).toMatchObject({
      score: '2–5 · first to 5',
      badge: 'lost',
      result: 'Your friend won',
      label: 'Plakoto vs friend, 2 to 5, first to 5, Your friend won, 28 Oct 2026',
    });
  });

  it('shows no result when the server gives no winner', () => {
    expect(onlineHistoryRow({ ...finished, winner: null }, t, 'en-GB')).toMatchObject({
      badge: null,
      result: null,
      label: 'Plakoto vs friend, 5 to 2, first to 5, 28 Oct 2026',
    });
  });

  it('speaks Greek', async () => {
    await i18n.changeLanguage('el');
    try {
      expect(onlineHistoryRow(finished, t, 'el').label).toBe(
        'Πλακωτό με φίλο, 5 προς 2, στους 5, Κέρδισες, 28 Οκτ 2026',
      );
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});
