import {
  ASK_GAP_MS,
  DAY_MS,
  FIRST_ASK_GAMES,
  NEW_SUPPORT_ASK,
  NEXT_ASK_GAMES,
  askDue,
  countGames,
  notNow,
  parseSupportAsk,
  stop,
  type SupportAskState,
} from './schedule';

const T0 = Date.UTC(2026, 10, 16, 12);

/** Plays `n` won games one by one; returns the state and the games that showed the card (1-based). */
function play(state: SupportAskState, n: number, now: number, won = true) {
  const asks: number[] = [];
  for (let i = 1; i <= n; i++) {
    const next = countGames(state, { count: 1, mayShow: won, now });
    state = next.state;
    if (next.ask) asks.push(i);
  }
  return { state, asks };
}

describe('the support ask schedule', () => {
  it('asks first after the 2nd finished game', () => {
    expect(FIRST_ASK_GAMES).toBe(2);
    const { asks, state } = play(NEW_SUPPORT_ASK, 2, T0);
    expect(asks).toEqual([2]);
    expect(state).toEqual({ games: 0, asked: true, lastAskAt: T0, stopped: false });
  });

  it('then every 10 finished games, at most once every 7 days', () => {
    const first = play(NEW_SUPPORT_ASK, 2, T0).state;
    // 10 more games the same week: no ask.
    const sameWeek = play(first, NEXT_ASK_GAMES + 5, T0 + DAY_MS);
    expect(sameWeek.asks).toEqual([]);
    expect(askDue(sameWeek.state, T0 + DAY_MS)).toBe(false);
    // After 7 days the next finished game asks.
    const later = play(sameWeek.state, 1, T0 + ASK_GAP_MS);
    expect(later.asks).toEqual([1]);
  });

  it('waits for 10 games after the 7 days too', () => {
    const first = play(NEW_SUPPORT_ASK, 2, T0).state;
    const { asks } = play(first, NEXT_ASK_GAMES, T0 + 30 * DAY_MS);
    expect(asks).toEqual([NEXT_ASK_GAMES]);
  });

  it('never asks after a lost game, and the loss does not use up the ask', () => {
    const one = play(NEW_SUPPORT_ASK, 1, T0).state;
    const lost = play(one, 1, T0, false);
    expect(lost.asks).toEqual([]);
    expect(askDue(lost.state, T0)).toBe(true);
    const lostAgain = play(lost.state, 1, T0, false);
    expect(lostAgain.asks).toEqual([]);
    const won = play(lostAgain.state, 1, T0);
    expect(won.asks).toEqual([1]);
  });

  it('"Not now" starts the 10-game count again', () => {
    const first = play(NEW_SUPPORT_ASK, 2, T0).state;
    const some = play(first, 4, T0, false).state;
    expect(some.games).toBe(4);
    expect(notNow(some).games).toBe(0);
    expect(notNow(NEW_SUPPORT_ASK)).toBe(NEW_SUPPORT_ASK);
  });

  it('"Don\'t ask again" stops it for good', () => {
    const stopped = stop(NEW_SUPPORT_ASK);
    const { asks, state } = play(stopped, 50, T0 + 100 * DAY_MS);
    expect(asks).toEqual([]);
    expect(state).toBe(stopped);
    expect(stop(stopped)).toBe(stopped);
  });

  it('counts a whole ranked match at once', () => {
    const { ask, state } = countGames(NEW_SUPPORT_ASK, { count: 3, mayShow: true, now: T0 });
    expect(ask).toBe(true);
    expect(state.games).toBe(0);
  });

  it('a clock that moved back never brings an ask early', () => {
    const first = play(NEW_SUPPORT_ASK, 2, T0).state;
    const { asks } = play(first, 30, T0 - 3 * DAY_MS);
    expect(asks).toEqual([]);
  });

  it('reads a saved state, and a broken one as new', () => {
    const state: SupportAskState = { games: 3, asked: true, lastAskAt: T0, stopped: false };
    expect(parseSupportAsk(JSON.stringify(state))).toEqual(state);
    expect(parseSupportAsk(undefined)).toBe(NEW_SUPPORT_ASK);
    expect(parseSupportAsk('not json')).toBe(NEW_SUPPORT_ASK);
    expect(parseSupportAsk('null')).toBe(NEW_SUPPORT_ASK);
    expect(parseSupportAsk('{"games":-1,"lastAskAt":"x"}')).toEqual(NEW_SUPPORT_ASK);
  });
});
