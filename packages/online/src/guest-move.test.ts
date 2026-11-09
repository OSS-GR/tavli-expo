// Moving a guest into an account (#403): the pure helpers, and the move
// on the in-memory server.

import { describe, expect, it } from 'vitest';

import { createSeededRng } from '@tavli/engine';

import {
  guestGameMove,
  renamePlayerInEvent,
  renamePlayerInFlow,
  renamePlayers,
} from './guest-move';
import { createMemoryGameServer } from './memory-server';
import { createOnlineMatch, loadStored, storeFlow } from './online-game';
import { openMemoryGame, pickTurn } from './testing';

const GAME = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null } as const;

describe('guest move helpers', () => {
  it('a game becomes the account’s, unless it is between the two', () => {
    const players = { white: 'guest', black: 'friend' };
    expect(guestGameMove(players, true, 'guest', 'me')).toBe('rename');
    expect(guestGameMove(players, false, 'guest', 'me')).toBe('rename');
    const between = { white: 'me', black: 'guest' };
    expect(guestGameMove(between, true, 'guest', 'me')).toBe('resign');
    expect(guestGameMove(between, false, 'guest', 'me')).toBe('keep');
  });

  it('renames one side only', () => {
    expect(renamePlayers({ white: 'guest', black: 'friend' }, 'guest', 'me')).toEqual({
      white: 'me',
      black: 'friend',
    });
    expect(renamePlayers({ white: 'friend', black: 'guest' }, 'guest', 'me')).toEqual({
      white: 'friend',
      black: 'me',
    });
  });

  it('renames the players of a stored flow and keeps the rest', () => {
    const flow = createOnlineMatch(
      { choice: 'portes', targetPoints: 3, players: { white: 'guest', black: 'friend' } },
      createSeededRng(1),
    );
    const text = storeFlow(flow, null);
    const moved = loadStored(renamePlayerInFlow(text, 'guest', 'me'));
    expect(moved.flow.match.players).toEqual({ white: 'me', black: 'friend' });
    expect({ ...moved.flow.match, players: null }).toEqual({
      ...loadStored(text).flow.match,
      players: null,
    });
    expect(moved.flow.game).toEqual(loadStored(text).flow.game);
  });

  it('renames the start event and leaves other events as they are', () => {
    const start = JSON.stringify({
      type: 'start',
      targetPoints: 3,
      players: { white: 'friend', black: 'guest' },
      starter: null,
    });
    expect(JSON.parse(renamePlayerInEvent(start, 'guest', 'me'))).toMatchObject({
      type: 'start',
      players: { white: 'friend', black: 'me' },
    });
    const roll = JSON.stringify({ type: 'action', action: { type: 'roll', player: 'white' } });
    expect(renamePlayerInEvent(roll, 'guest', 'me')).toBe(roll);
  });
});

describe('moveGuest on the in-memory server', () => {
  function setup() {
    const server = createMemoryGameServer({ rng: createSeededRng(7), now: () => START });
    return server;
  }
  const START = Date.UTC(2026, 10, 9, 12, 0, 0);

  async function playWith(server: ReturnType<typeof setup>, from: string, to: string) {
    const code = await server.invitesFor(from).createInvite(GAME);
    const gameId = await server.invitesFor(to).acceptInvite(code);
    await openMemoryGame(server, gameId);
    return gameId;
  }

  /** The player the game waits for plays, through their own transport. */
  async function playNext(server: ReturnType<typeof setup>, gameId: string) {
    const view = server.getGame(gameId)!;
    const transport = server.transportFor(view.players[view.waitingFor!]);
    const expectedVersion = view.version;
    if (view.prompt !== null) {
      await transport.sendAnswer({ gameId, expectedVersion, choice: view.prompt.choices[0]! });
    } else if (view.game.phase === 'awaiting-roll') {
      await transport.rollDice({ gameId, expectedVersion });
    } else {
      await transport.sendTurn({
        gameId,
        expectedVersion,
        moves: pickTurn(view.game, createSeededRng(1)),
      });
    }
    return server.getGame(gameId)!;
  }

  it('counts the guest’s games in progress and open invites', async () => {
    const server = setup();
    await playWith(server, 'friend', 'guest');
    await server.invitesFor('guest').createInvite(GAME);
    await server.invitesFor('guest').createInvite(GAME);
    expect(server.guestMoveCounts('guest')).toEqual({ activeGames: 1, openInvites: 2 });
  });

  it('a moved game stays playable for both players', async () => {
    const server = setup();
    const gameId = await playWith(server, 'friend', 'guest');
    server.moveGuest('guest', 'me');
    expect(server.getGame(gameId)!.players).toEqual({ white: 'friend', black: 'me' });
    expect(server.events(gameId)[0]!.event).toMatchObject({
      type: 'start',
      players: { white: 'friend', black: 'me' },
    });
    expect(server.events(gameId).some((row) => row.actor === 'guest')).toBe(false);
    // Whoever the game waits for can roll: the friend, or the account.
    const before = server.getGame(gameId)!.version;
    const after = await playNext(server, gameId);
    expect(after.version).toBeGreaterThan(before);
    await expect(
      server.transportFor('guest').rollDice({ gameId, expectedVersion: after.version }),
    ).rejects.toMatchObject({ code: 'NOT_A_PLAYER' });
    expect(await server.transportFor('me').listMyGames({ status: 'active' })).toHaveLength(1);
  });

  it('a game between the two ends with the guest resigning, and keeps the guest', async () => {
    const server = setup();
    const gameId = await playWith(server, 'me', 'guest');
    server.moveGuest('guest', 'me');
    const view = server.getGame(gameId)!;
    expect(view.players).toEqual({ white: 'me', black: 'guest' });
    expect(view.status).toBe('finished');
    expect(view.match.winner).toBe('white');
  });

  it('moves invites, answers, blocks and reports, then deletes the guest', async () => {
    const server = setup();
    const open = await server.invitesFor('guest').createInvite(GAME);
    // The guest met two players: one answered its invite, one it answered.
    const answered = await server.invitesFor('guest').createInvite(GAME);
    await server.invitesFor('ann').declineInvite(answered);
    const theirs = await server.invitesFor('bob').createInvite(GAME);
    await server.invitesFor('guest').declineInvite(theirs);
    await server.safetyFor('guest').block('ann');
    await server.safetyFor('bob').report({ playerId: 'guest', reason: 'name' });

    server.moveGuest('guest', 'me');

    expect(server.getInvite(open)).toMatchObject({ status: 'open' });
    expect(server.guestMoveCounts('me').openInvites).toBe(1);
    // The account met them now: it may block bob, and it blocks ann already.
    await server.safetyFor('me').block('bob');
    expect((await server.safetyFor('me').listBlocked()).map((p) => p.playerId).sort()).toEqual([
      'ann',
      'bob',
    ]);
    expect(server.reportsOf()).toEqual([
      expect.objectContaining({ reporterId: 'bob', reportedId: 'me', reason: 'name' }),
    ]);
    await expect(server.invitesFor('guest').createInvite(GAME)).rejects.toMatchObject({
      code: 'NOT_SIGNED_IN',
    });
  });

  it('drops a block or report between the guest and the account', async () => {
    const server = setup();
    await playWith(server, 'me', 'guest');
    await server.safetyFor('guest').block('me');
    await server.safetyFor('me').report({ playerId: 'guest', reason: 'other' });
    server.moveGuest('guest', 'me');
    expect(await server.safetyFor('me').listBlocked()).toEqual([]);
    expect(server.reportsOf()).toEqual([]);
  });
});
