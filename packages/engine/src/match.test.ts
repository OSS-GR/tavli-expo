import { describe, expect, it } from 'vitest';

import {
  createMatch,
  createRematch,
  gameRules,
  missingVariants,
  nextVariantId,
  recordGameResult,
  resignGame,
  resignMatch,
  startNextGame,
  validateMatch,
} from './match';
import type { Match } from './match';
import { getPreset, resolveRules } from './presets';
import type { RuleOverrides } from './rules';
import { parseMatch, serializeMatch } from './serialize';
import type { GameState } from './state';
import { portesState } from './testing/position-notation';
import { createVariantRegistry } from './variant';
import type { GameResult } from './variant';
import { portes } from './variants';

const win = (winner: 'white' | 'black', points = 1): GameResult => ({
  winner,
  points,
  reason: 'borneOff',
});
const draw: GameResult = { winner: null, points: 0, reason: 'bothMothersPinned' };

/** The Tavli match preset: Portes → Plakoto → Fevga. */
const TAVLI = getPreset('tavli');

function rules(overrides: RuleOverrides = {}) {
  return resolveRules('portes', overrides);
}

/** A match that only plays Portes. */
function portesMatch(targetPoints = 3, overrides: RuleOverrides = {}): Match {
  return createMatch({
    rules: rules({ ...overrides, match: { rotation: ['portes'], ...overrides.match } }),
    targetPoints,
    starter: 'white',
  });
}

/** Plays results into a match. Each game is started by `match.nextStarter`, or white. */
function play(match: Match, ...results: GameResult[]): Match {
  return results.reduce(
    (m, result) => recordGameResult(m, result, { starter: m.nextStarter ?? 'white' }),
    match,
  );
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const illegalAction = expect.objectContaining({ code: 'ILLEGAL_ACTION' });

describe('tavli-match.md edge cases (match and scoring)', () => {
  it('tavli-match.md #4: game 2 starter = winner of game 1, fresh dice, no opening contest', () => {
    // Game 1: an opening roll decided that black starts. White wins.
    const start = createMatch({ rules: rules({ match: { rotation: ['portes'] } }) });
    expect(start.nextStarter).toBeNull();
    const after = recordGameResult(start, win('white'), { starter: 'black' });
    expect(after.games[0]).toMatchObject({ starter: 'black', winner: 'white' });
    expect(after.nextStarter).toBe('white');
    const game2 = startNextGame(after, after.nextStarter ?? 'black');
    expect(game2).toMatchObject({ toMove: 'white', dice: null, turnNumber: 1 });
  });

  it('tavli-match.md #5: Plakoto draw → 0 points, next game Fevga, a new opening roll', () => {
    const afterDraw = play(createMatch({ rules: TAVLI, starter: 'white' }), win('black'), draw);
    expect(afterDraw.score).toEqual({ white: 0, black: 1 });
    expect(afterDraw.games[1]).toMatchObject({ variant: 'plakoto', winner: null, points: 0 });
    expect(nextVariantId(afterDraw)).toBe('fevga');
    expect(afterDraw.nextStarter).toBeNull();
    expect(afterDraw.status).toBe('in-progress');
  });

  it('tavli-match.md #6: after game 3 (Fevga) the rotation goes back to Portes', () => {
    const match = createMatch({ rules: TAVLI, targetPoints: 7, starter: 'white' });
    expect(nextVariantId(match)).toBe('portes');
    const after3 = play(match, win('white'), win('black'), win('white'));
    expect(after3.games.map((g) => g.variant)).toEqual(['portes', 'plakoto', 'fevga']);
    expect(after3.rotationIndex).toBe(0);
    expect(nextVariantId(after3)).toBe('portes');
    // The reverse rotation of some regions works the same way.
    const reverse = createMatch({
      rules: rules({ match: { rotation: ['fevga', 'plakoto', 'portes'] } }),
      starter: 'white',
    });
    expect(nextVariantId(play(reverse, win('white')))).toBe('plakoto');
  });

  it('tavli-match.md #7: match to 5, 4–3, the player with 4 wins a mars → 6–3, match over', () => {
    const at43 = play(portesMatch(5), win('white', 2), win('black', 2), win('white', 2));
    expect(at43.score).toEqual({ white: 4, black: 2 });
    const at43b = play(at43, win('black'));
    expect(at43b.score).toEqual({ white: 4, black: 3 });
    const end = play(at43b, win('white', 2));
    expect(end.score).toEqual({ white: 6, black: 3 });
    expect(end).toMatchObject({ status: 'finished', winner: 'white', nextStarter: null });
    expect(() => play(end, win('black'))).toThrow(illegalAction);
  });

  it('tavli-match.md #8: match to 5, 3–3, a single → 4–3, the match goes on', () => {
    const match = createMatch({ rules: TAVLI, targetPoints: 5, starter: 'white' });
    const at33 = play(match, win('white', 2), win('black', 2), win('white'), win('black'));
    expect(at33.score).toEqual({ white: 3, black: 3 });
    const at43 = play(at33, win('white'));
    expect(at43.score).toEqual({ white: 4, black: 3 });
    expect(at43.status).toBe('in-progress');
    // Five games played: the next one is game 6, Fevga.
    expect(nextVariantId(at43)).toBe('fevga');
    expect(at43.nextStarter).toBe('white');
  });

  it('tavli-match.md "Match format": the match ends as soon as a score is ≥ target', () => {
    const match = play(portesMatch(3), win('black', 2));
    expect(match.status).toBe('in-progress');
    const end = play(match, win('black'));
    expect(end).toMatchObject({ status: 'finished', winner: 'black', score: { black: 3 } });
  });

  it('tavli-match.md "Match format": overshooting the target is fine (2 + 2 = 4 in a match to 3)', () => {
    const end = play(portesMatch(3), win('white', 2), win('white', 2));
    expect(end).toMatchObject({ status: 'finished', winner: 'white', score: { white: 4 } });
  });

  it('tavli-match.md flag targetPoints: the default match is first to 3 points (owner)', () => {
    const match = createMatch();
    expect(match.targetPoints).toBe(3);
    expect(match.rules.match.targetPoints).toBe(3);
    expect(match).toMatchObject({ status: 'in-progress', score: { white: 0, black: 0 } });
    expect(match.nextStarter).toBeNull();
    expect(createMatch({ rules: TAVLI }).targetPoints).toBe(3);
  });

  it('tavli-match.md flag rotation: the portes preset is Portes only; tavli is the rotation (PM)', () => {
    expect(createMatch().rules.match.rotation).toEqual(['portes']);
    expect(createMatch({ rules: TAVLI }).rules.match.rotation).toEqual([
      'portes',
      'plakoto',
      'fevga',
    ]);
    // A default match plays Portes every game.
    const match = play(createMatch({ starter: 'white' }), win('white'), win('black'));
    expect(match.games.map((g) => g.variant)).toEqual(['portes', 'portes']);
    expect(startNextGame(match, 'black').variant).toBe('portes');
  });

  it('tavli-match.md flag targetPoints: any positive integer; the rules follow it', () => {
    const match = createMatch({ targetPoints: 11 });
    expect(match.targetPoints).toBe(11);
    expect(match.rules.match.targetPoints).toBe(11);
    expect(createMatch({ rules: rules({ match: { targetPoints: 7 } }) }).targetPoints).toBe(7);
    expect(() => createMatch({ targetPoints: 0 })).toThrow(
      expect.objectContaining({ code: 'OUT_OF_RANGE' }),
    );
    expect(() => createMatch({ targetPoints: 2.5 })).toThrow();
  });

  it('tavli-match.md flag rotation: a single-game rotation plays the same game every time', () => {
    const match = play(portesMatch(9), win('white'), win('black'), win('white'));
    expect(match.games.every((g) => g.variant === 'portes')).toBe(true);
    expect(match.rotationIndex).toBe(0);
  });

  it('tavli-match.md flag nextGameStarter: "alternate" and "openingRoll"', () => {
    const alternate = portesMatch(9, { match: { nextGameStarter: 'alternate' } });
    // White started and won; black starts the next game.
    expect(recordGameResult(alternate, win('white')).nextStarter).toBe('black');
    const opening = portesMatch(9, { match: { nextGameStarter: 'openingRoll' } });
    expect(recordGameResult(opening, win('white')).nextStarter).toBeNull();
  });

  it('tavli-match.md flag afterDrawStarter: "previousStarter" keeps the starter of the drawn game', () => {
    const match = createMatch({
      rules: rules({ match: { afterDrawStarter: 'previousStarter' } }),
      starter: 'white',
    });
    const after = play(match, win('black'), draw);
    // Black won game 1 and started game 2 (the draw), so black starts again.
    expect(after.games[1]?.starter).toBe('black');
    expect(after.nextStarter).toBe('black');
  });
});

describe('scores from the board (portes.md "Winning & scoring")', () => {
  const finish = (text: string, overrides: RuleOverrides = {}): GameResult => {
    const result = portes.result(portesState(text, { rules: rules(overrides) }));
    if (result === null) throw new Error('game not over');
    return result;
  };

  it('portes.md #12: loser has borne off 0, none on the bar or in the winner home → 2 points', () => {
    const match = play(portesMatch(), finish('w: offx15 ; b: 7x15'));
    expect(match.score).toEqual({ white: 2, black: 0 });
  });

  it('portes.md #13: loser has borne off 0 and one on the bar → 2 (3 with backgammonScores3)', () => {
    expect(play(portesMatch(), finish('w: offx15 ; b: bar 7x14')).score.white).toBe(2);
    const flag = { scoring: { backgammonScores3: true } };
    const match = play(portesMatch(5, flag), finish('w: offx15 ; b: bar 7x14', flag));
    expect(match.score.white).toBe(3);
  });

  it('portes.md #14: loser has borne off 1+ → 1 point, even with a checker on the bar', () => {
    const match = play(portesMatch(), finish('w: offx15 ; b: bar 6x13 offx1'));
    expect(match.score).toEqual({ white: 1, black: 0 });
  });
});

describe('recordGameResult', () => {
  it('needs the starter when an opening roll decided it', () => {
    const match = createMatch();
    expect(() => recordGameResult(match, win('white'))).toThrow(illegalAction);
    expect(recordGameResult(match, win('white'), { starter: 'black' }).games[0]?.starter).toBe(
      'black',
    );
  });

  it('rejects a starter that does not match nextStarter', () => {
    const match = createMatch({ starter: 'white' });
    expect(() => recordGameResult(match, win('white'), { starter: 'black' })).toThrow(
      illegalAction,
    );
    expect(recordGameResult(match, win('white')).games[0]?.starter).toBe('white');
  });

  it('rejects bad results', () => {
    const match = portesMatch();
    const bad = expect.objectContaining({ code: 'OUT_OF_RANGE' });
    expect(() => recordGameResult(match, { ...draw, points: 1 })).toThrow(bad);
    expect(() => recordGameResult(match, win('white', 0))).toThrow(bad);
    expect(() => recordGameResult(match, win('white', 1.5))).toThrow(bad);
    expect(() => recordGameResult(match, { winner: null, points: 0, reason: 'resigned' })).toThrow(
      bad,
    );
    expect(() => recordGameResult(match, { winner: null, points: 0, reason: 'timeout' })).toThrow(
      bad,
    );
    const odd = { winner: 'red', points: 1, reason: 'borneOff' } as unknown as GameResult;
    expect(() => recordGameResult(match, odd)).toThrow(bad);
  });

  it('never changes its input', () => {
    const match = portesMatch();
    const copy = clone(match);
    play(match, win('white'), win('black', 2));
    expect(match).toEqual(copy);
  });
});

describe('resignGame (owner: mono or diplo from the board right now)', () => {
  it('tavli-match.md #19: a player with a checker off resigns the game → mono, 1 point', () => {
    const state = portesState('w: 6x5 offx10 ; b: 1x14 offx1');
    expect(resignGame(state, 'black')).toEqual({ winner: 'white', points: 1, reason: 'resigned' });
  });

  it('gives diplo when the resigning player has borne off nothing', () => {
    const start = portes.initialState({ startingPlayer: 'white' });
    expect(resignGame(start, 'white')).toEqual({ winner: 'black', points: 2, reason: 'resigned' });
    // The opponent need not have borne off anything either.
    expect(resignGame(start, 'black').points).toBe(2);
  });

  it('backgammonScores3: 3 when the resigning player is on the bar or in the winner home', () => {
    const flag = rules({ scoring: { backgammonScores3: true } });
    const onBar = portesState('w: 6x15 ; b: bar 7x14', { rules: flag });
    expect(resignGame(onBar, 'black').points).toBe(3);
    // Black's own 19 is White's own 6: White's home.
    const inHome = portesState('w: 5x15 ; b: 19 7x14', { rules: flag });
    expect(resignGame(inHome, 'black').points).toBe(3);
    const clear = portesState('w: 6x15 ; b: 7x15', { rules: flag });
    expect(resignGame(clear, 'black').points).toBe(2);
    // Without the flag a backgammon is still a diplo.
    expect(resignGame(portesState('w: 6x15 ; b: bar 7x14'), 'black').points).toBe(2);
  });

  it('follows scoring.method for other scoring rules', () => {
    const base = portesState('w: 6x15 ; b: 7x10 offx5');
    const perChecker: GameState = {
      ...base,
      variant: 'asodio',
      rules: getPreset('asodio.aceyDeuceyAmerican'),
    };
    expect(resignGame(perChecker, 'black').points).toBe(10);
    const single: GameState = {
      ...base,
      rules: { ...base.rules, scoring: { ...base.rules.scoring, method: 'singleOnly' } },
    };
    expect(resignGame(portesState('w: 6x15 ; b: 7x15'), 'black').points).toBe(2);
    expect(
      resignGame({ ...single, board: portesState('w: 6x15 ; b: 7x15').board }, 'black'),
    ).toEqual({ winner: 'white', points: 1, reason: 'resigned' });
  });

  it('cannot resign a finished game', () => {
    expect(() => resignGame(portesState('w: offx15 ; b: 7x15'), 'black')).toThrow(illegalAction);
  });

  it('uses the variant resignResult hook when it has one (for example Plakoto later)', () => {
    const custom = {
      ...portes,
      resignResult: (_state: GameState, player: 'white' | 'black'): GameResult => ({
        winner: player === 'white' ? 'black' : 'white',
        points: 2,
        reason: 'resigned',
      }),
    };
    const registry = createVariantRegistry([custom]);
    const state = portesState('w: 6x5 offx10 ; b: 1x14 offx1');
    expect(resignGame(state, 'black', registry).points).toBe(2);
    expect(resignGame(state, 'black').points).toBe(1);
  });

  it('tavli-match.md #18: Portes to 3, 0–0, a resign before any checker is off → diplo, 2–0', () => {
    const state = portes.initialState({ startingPlayer: 'white' });
    const match = play(portesMatch(), resignGame(state, 'white'));
    expect(match.score).toEqual({ white: 0, black: 2 });
    expect(match.games[0]).toMatchObject({ reason: 'resigned', winner: 'black', points: 2 });
    expect(match).toMatchObject({ status: 'in-progress', winner: null, resignedBy: null });
    expect(match.nextStarter).toBe('black');
  });

  it('tavli-match.md #22: to 3, 0–2, a resigned game with no checker off → 0–4, won to the target', () => {
    const state = portes.initialState({ startingPlayer: 'white' });
    const match = play(portesMatch(3), win('black', 2), resignGame(state, 'white'));
    expect(match).toMatchObject({
      score: { white: 0, black: 4 },
      status: 'finished',
      winner: 'black',
      // Won to the target: nobody resigned the match.
      resignedBy: null,
    });
  });
});

describe('resignMatch and rematch', () => {
  it('resign match: the opponent wins the match now, the score stays', () => {
    const match = play(portesMatch(5), win('white', 2));
    const over = resignMatch(match, 'white');
    expect(over).toMatchObject({
      status: 'finished',
      winner: 'black',
      resignedBy: 'white',
      score: { white: 2, black: 0 },
      nextStarter: null,
    });
    expect(() => resignMatch(over, 'black')).toThrow(illegalAction);
    expect(() => recordGameResult(over, win('white'))).toThrow(illegalAction);
  });

  it('tavli-match.md rematchStarter "lastGameWinner": the winner of the last game starts, no opening roll', () => {
    const over = play(portesMatch(3), win('black'), win('white', 2), win('black', 2));
    expect(over.winner).toBe('black');
    const rematch = createRematch(over);
    expect(rematch).toMatchObject({
      nextStarter: 'black',
      score: { white: 0, black: 0 },
      games: [],
      status: 'in-progress',
      targetPoints: 3,
      players: over.players,
    });
    expect(rematch.rules).toEqual(over.rules);
    // After "resign match" the match winner starts the rematch.
    expect(createRematch(resignMatch(portesMatch(), 'black')).nextStarter).toBe('white');
  });

  it('tavli-match.md rematchStarter "openingRoll": an opening roll decides the rematch', () => {
    const over = play(portesMatch(1, { match: { rematchStarter: 'openingRoll' } }), win('white'));
    expect(createRematch(over).nextStarter).toBeNull();
  });

  it('a rematch needs a finished match', () => {
    expect(() => createRematch(portesMatch())).toThrow(illegalAction);
  });
});

describe('rotation and missing variants', () => {
  // A registry with only Portes stands in for games that are not built yet.
  const portesOnly = createVariantRegistry([portes]);

  it('lists the games of the rotation that are not built yet', () => {
    expect(missingVariants(createMatch({ rules: TAVLI }), portesOnly)).toEqual([
      'plakoto',
      'fevga',
    ]);
    // The real registry has every game of the tavli rotation now.
    expect(missingVariants(createMatch({ rules: TAVLI }))).toEqual([]);
    expect(missingVariants(createMatch())).toEqual([]);
  });

  it('startNextGame fails with a clear error when the next game is not built yet', () => {
    const match = play(createMatch({ rules: TAVLI, starter: 'white' }), win('white'));
    expect(nextVariantId(match)).toBe('plakoto');
    expect(() => startNextGame(match, 'white', portesOnly)).toThrow(
      expect.objectContaining({
        code: 'UNKNOWN_VARIANT',
        path: 'match.rules.match.rotation[1]',
        message: expect.stringContaining('plakoto is not available yet'),
      }),
    );
  });

  it('startNextGame uses the game rules and refuses a finished match', () => {
    const match = portesMatch(1, { scoring: { backgammonScores3: true } });
    const state = startNextGame(match, 'black');
    expect(state).toMatchObject({ variant: 'portes', toMove: 'black' });
    expect(state.rules).toEqual(match.rules);
    expect(() => startNextGame(play(match, win('white')), 'white')).toThrow(illegalAction);
  });

  it('gameRules: other games use their default preset with the match flags', () => {
    const own = createMatch({ rules: rules({ match: { rotation: ['portes', 'plakoto'] } }) });
    expect(gameRules(own, 'portes')).toBe(own.rules);
    expect(gameRules(own, 'plakoto').presetId).toBe('plakoto');
    // tavli is a match preset: every game uses its own default preset.
    const match = createMatch({ rules: TAVLI, targetPoints: 5 });
    const portesRules = gameRules(match, 'portes');
    expect(portesRules.presetId).toBe('portes');
    expect(portesRules.match).toEqual(match.rules.match);
    expect(startNextGame(match, 'white').rules).toEqual(portesRules);
    const plakoto = gameRules(match, 'plakoto');
    expect(plakoto.presetId).toBe('plakoto');
    expect(plakoto.mother.motherRule).toBe('offerConcede');
    expect(plakoto.match).toEqual(match.rules.match);
    expect(plakoto.match.targetPoints).toBe(5);
    expect(gameRules(match, 'fevga').movement.direction).toBe('parallel');
    // A rotation on a game preset (#247): that game plays it, the others their defaults.
    const federation = createMatch({
      rules: resolveRules('plakoto.federation', { match: { rotation: TAVLI.match.rotation } }),
    });
    expect(gameRules(federation, 'plakoto')).toBe(federation.rules);
    expect(gameRules(federation, 'plakoto').mother.motherRule).toBe('federation');
    expect(gameRules(federation, 'portes').presetId).toBe('portes');
    expect(gameRules(federation, 'fevga').presetId).toBe('fevga');
  });
});

describe('validateMatch', () => {
  const played = play(
    createMatch({ rules: TAVLI, targetPoints: 5, starter: 'black' }),
    win('white', 2),
    draw,
  );

  it('round-trips a match through JSON', () => {
    expect(parseMatch(serializeMatch(played))).toEqual(played);
    const over = play(portesMatch(1), win('black'));
    expect(validateMatch(JSON.parse(JSON.stringify(over)))).toEqual(over);
    const resigned = resignMatch(played, 'white');
    expect(validateMatch(JSON.parse(JSON.stringify(resigned)))).toEqual(resigned);
  });

  const broken = (change: (m: Record<string, unknown>) => void): unknown => {
    const copy = clone(played) as unknown as Record<string, unknown>;
    change(copy);
    return copy;
  };
  const at = (path: string) => expect.objectContaining({ code: 'INVALID_STATE', path });

  it('rejects stored totals that do not fit the games', () => {
    expect(() => validateMatch(broken((m) => (m['score'] = { white: 3, black: 0 })))).toThrow(
      at('match.score.white'),
    );
    expect(() => validateMatch(broken((m) => (m['rotationIndex'] = 0)))).toThrow(
      at('match.rotationIndex'),
    );
    expect(() => validateMatch(broken((m) => (m['nextStarter'] = 'white')))).toThrow(
      at('match.nextStarter'),
    );
    expect(() => validateMatch(broken((m) => (m['status'] = 'finished')))).toThrow(
      at('match.status'),
    );
    expect(() => validateMatch(broken((m) => (m['targetPoints'] = 7)))).toThrow(
      at('match.targetPoints'),
    );
  });

  it('rejects games that do not follow the rotation or come after the end', () => {
    const wrongGame = broken((m) => {
      (m['games'] as Record<string, unknown>[])[1] = {
        ...draw,
        variant: 'fevga',
        starter: 'white',
      };
    });
    expect(() => validateMatch(wrongGame)).toThrow(at('match.games[1].variant'));
    const over = clone(play(portesMatch(1), win('black'))) as unknown as Record<string, unknown>;
    (over['games'] as unknown[]).push({ ...win('white'), variant: 'portes', starter: 'black' });
    over['score'] = { white: 1, black: 1 };
    expect(() => validateMatch(over)).toThrow(at('match.games[1]'));
  });

  it('rejects bad fields and unknown versions', () => {
    expect(() => validateMatch(broken((m) => (m['extra'] = 1)))).toThrow(at('match.extra'));
    expect(() => validateMatch(broken((m) => (m['winner'] = 'red')))).toThrow(at('match.winner'));
    expect(() => validateMatch(broken((m) => (m['schemaVersion'] = 2)))).toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_SCHEMA_VERSION' }),
    );
    expect(() => validateMatch('nope')).toThrow(at('match'));
  });
});
