/**
 * The blocks this phone knows (#441 review): one list per signed-in
 * player, asked once per app run, and a late answer never undoes a
 * change made here.
 */
import type { BlockedPlayer, Safety } from '@tavli/contracts';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { onlineFake } from '../../../test/onlineFake';
import { runOnFakeTimers } from '../../../test/clock';

import {
  BLOCKS_RETRY_MS,
  markBlocked,
  markUnblocked,
  useIsBlocked,
  useKnownBlocks,
} from './blocked';

runOnFakeTimers();

const listed = (...ids: string[]): BlockedPlayer[] =>
  ids.map((playerId) => ({ playerId, name: null, blockedAt: 0 }));

/** A `Safety` whose `listBlocked` answers when the test says. */
function slowSafety() {
  const answers: ((players: BlockedPlayer[]) => void)[] = [];
  const fails: ((error: unknown) => void)[] = [];
  const listBlocked = jest.fn(
    () =>
      new Promise<BlockedPlayer[]>((resolve, reject) => {
        answers.push(resolve);
        fails.push(reject);
      }),
  );
  const safety: Safety = { ...onlineFake.safety, listBlocked };
  return { safety, listBlocked, answers, fails };
}

function Probe({ safety, owner, id }: { safety?: Safety; owner: string; id: string }) {
  useKnownBlocks(safety, owner);
  const blocked = useIsBlocked(owner, id);
  return <Text testID={`${owner}:${id}`}>{blocked ? 'blocked' : 'free'}</Text>;
}

/** What the newest probe of `owner` and `id` shows. */
function shown(owner: string, id: string): string {
  const all = screen.getAllByTestId(`${owner}:${id}`);
  return String(all[all.length - 1]!.props.children);
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

describe('known blocks', () => {
  it('keeps each player’s blocks apart: another account never sees them', async () => {
    await render(
      <>
        <Probe owner="ann" id="x" />
        <Probe owner="bob" id="x" />
      </>,
    );
    await act(async () => markBlocked('ann', 'x'));
    expect([shown('ann', 'x'), shown('bob', 'x')]).toEqual(['blocked', 'free']);
  });

  it('asks the server once per player: a dev game and a real one each get their list', async () => {
    const dev = slowSafety();
    const real = slowSafety();
    const view = await render(<Probe safety={dev.safety} owner="me" id="bot" />);
    dev.answers[0]!(listed('bot'));
    await flush();
    expect(shown('me', 'bot')).toBe('blocked');
    await view.rerender(<Probe safety={real.safety} owner="user-1" id="x" />);
    real.answers[0]!(listed('x'));
    await flush();
    expect(shown('user-1', 'x')).toBe('blocked');
    // Once per player: a later screen does not ask again.
    await view.rerender(<Probe safety={dev.safety} owner="me" id="bot" />);
    expect(dev.listBlocked).toHaveBeenCalledTimes(1);
    expect(real.listBlocked).toHaveBeenCalledTimes(1);
  });

  it('a list that comes after an Unblock does not undo it', async () => {
    const { safety, answers } = slowSafety();
    await render(<Probe safety={safety} owner="me" id="x" />);
    await act(async () => {
      markBlocked('me', 'y');
      markUnblocked('me', 'x');
    });
    // The list left before the Unblock: it still holds x.
    answers[0]!(listed('x', 'z'));
    await flush();
    expect(shown('me', 'x')).toBe('free');
    await render(
      <>
        <Probe owner="me" id="y" />
        <Probe owner="me" id="z" />
      </>,
    );
    expect([shown('me', 'y'), shown('me', 'z')]).toEqual(['blocked', 'blocked']);
  });

  it('asks again after a failed list only once BLOCKS_RETRY_MS has passed', async () => {
    const { safety, listBlocked, fails } = slowSafety();
    const view = await render(<Probe safety={safety} owner="me" id="x" />);
    fails[0]!(new Error('offline'));
    await flush();
    await view.unmount();
    await render(<Probe safety={safety} owner="me" id="x" />);
    expect(listBlocked).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(BLOCKS_RETRY_MS);
    });
    await render(<Probe safety={safety} owner="me" id="x" />);
    expect(listBlocked).toHaveBeenCalledTimes(2);
  });

  it('never asks again after NOT_SIGNED_IN', async () => {
    const { safety, listBlocked, fails } = slowSafety();
    await render(<Probe safety={safety} owner="me" id="x" />);
    fails[0]!({ code: 'NOT_SIGNED_IN', message: 'no session' });
    await flush();
    await act(async () => {
      jest.advanceTimersByTime(BLOCKS_RETRY_MS * 10);
    });
    await render(<Probe safety={safety} owner="me" id="x" />);
    expect(listBlocked).toHaveBeenCalledTimes(1);
  });
});
