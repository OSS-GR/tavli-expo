// The "my games" summaries (#296): one game for one player, and the list order.

import { describe, expect, it } from 'vitest';

import { MAX_LISTED_GAMES } from '@tavli/contracts';
import type { GameSummary } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';

import { OnlineGameError, createOnlineMatch, resign, toView } from './online-game';
import { latestGames, newestFirst, summarizeGame } from './summaries';
import type { SummaryInput } from './summaries';

const PLAYERS = { white: 'alice', black: 'bob' };

function input(choice: 'portes' | 'tavli' = 'portes'): SummaryInput {
  const rng = createSeededRng(3);
  return {
    gameId: 'g1',
    version: 4,
    choice,
    pace: 'async',
    turnDeadline: 5000,
    players: PLAYERS,
    flow: createOnlineMatch({ choice, targetPoints: 3, players: PLAYERS }, rng),
    updatedAt: 1234,
  };
}

function summary(gameId: string, updatedAt: number): GameSummary {
  return { ...summarizeGame(input(), 'alice'), gameId, updatedAt };
}

describe('summarizeGame', () => {
  it('holds the facts of the view, for the side of the player', () => {
    const game = input('tavli');
    const view = toView({ ...game, previousGame: null });
    const mover = view.waitingFor;
    for (const [playerId, side] of [
      ['alice', 'white'],
      ['bob', 'black'],
    ] as const) {
      expect(summarizeGame(game, playerId)).toEqual({
        gameId: 'g1',
        status: 'active',
        choice: 'tavli',
        presetId: 'tavli',
        variant: 'portes',
        targetPoints: 3,
        pace: 'async',
        mySide: side,
        waitingFor: mover,
        myTurn: mover === side,
        score: { white: 0, black: 0 },
        winner: null,
        updatedAt: 1234,
        turnDeadline: 5000,
      });
    }
  });

  it('a finished match: no turn, no deadline, the winner', () => {
    const game = input();
    const flow = resign(game.flow, 'black', createSeededRng(1));
    const finished = summarizeGame({ ...game, flow }, 'bob');
    expect(finished).toMatchObject({
      status: 'finished',
      waitingFor: null,
      myTurn: false,
      winner: 'white',
      turnDeadline: null,
    });
    expect(finished.score).toEqual(flow.match.score);
  });

  it('tells nothing about the other player but their side', () => {
    const text = JSON.stringify(summarizeGame(input(), 'alice'));
    expect(text).not.toContain('bob');
    expect(text).not.toContain('alice');
  });

  it('refuses a player who is not in the game', () => {
    expect(() => summarizeGame(input(), 'eve')).toThrow(OnlineGameError);
    try {
      summarizeGame(input(), 'eve');
    } catch (error) {
      expect((error as OnlineGameError).code).toBe('NOT_A_PLAYER');
    }
  });
});

describe('the list order', () => {
  it('newest change first; at the same time, the larger id first', () => {
    const list = [summary('a', 1), summary('b', 3), summary('c', 1), summary('d', 2)];
    expect([...list].sort(newestFirst).map((s) => s.gameId)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('latestGames keeps the MAX_LISTED_GAMES newest', () => {
    const list = Array.from({ length: MAX_LISTED_GAMES + 5 }, (_, i) => summary(`g${i}`, i));
    const latest = latestGames(list);
    expect(latest).toHaveLength(MAX_LISTED_GAMES);
    expect(latest[0]?.updatedAt).toBe(MAX_LISTED_GAMES + 4);
    expect(latest[MAX_LISTED_GAMES - 1]?.updatedAt).toBe(5);
  });
});
