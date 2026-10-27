import { createMemoryStorage, type Storage } from '@tavli/contracts';
import { VARIANT_REGISTRY, createSeededRng, getVariant, type Dice } from '@tavli/engine';

import { createSessionRegistry, hasStarted, type MatchSession } from '@/features/match/sessions';
import { defaultSetup, gameLevels, type MatchSetup } from '@/features/match/setup';
import i18n from '@/i18n';

import { dateLocale, formatDate, historyRow, statParts } from './format';
import { createHistoryStore } from './historyStore';
import {
  HISTORY_STORAGE_KEY,
  HISTORY_VERSION,
  MAX_HISTORY_RECORDS,
  addRecord,
  parseHistory,
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
    games: 3,
    diploWins: { white: 1, black: 0 },
    draws: 0,
    ...over,
  };
}

function registry(storage: Storage = createMemoryStorage(), clock = { now: 1_000 }) {
  const history = createHistoryStore(createMemoryStorage());
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
        games: 0,
        diploWins: { white: 0, black: 0 },
        draws: 0,
      },
    ]);
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
  });

  it('does not change the save slot format of a match in play', () => {
    const { sessions, storage } = registry();
    const s = sessions.start(oneGameBot);
    openGame(s);
    const saved = JSON.parse(storage.getString('savedMatch')!) as Record<string, unknown>;
    expect(Object.keys(saved).sort()).toEqual(['flowSchema', 'id', 'log', 'savedAt', 'setup', 'v']);
    expect(storage.getString(HISTORY_STORAGE_KEY)).toBeUndefined();
  });

  it('a history error does not break the move', () => {
    const sessions = createSessionRegistry({
      createRng: () => createSeededRng(1),
      history: {
        add: () => {
          throw new Error('disk full');
        },
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
