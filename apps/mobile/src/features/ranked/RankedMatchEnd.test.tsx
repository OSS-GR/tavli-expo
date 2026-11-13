/**
 * The end of a ranked match (#532): the rating change and the buttons.
 */
import type { FriendStatus } from '@tavli/contracts';
import { render, screen, userEvent } from '@testing-library/react-native';

import { RankedEndActions, RankedRatingChange } from './RankedMatchEnd';

const nikos = { kind: 'username', name: 'nikos_k' } as const;

function actions(friend: FriendStatus | null) {
  const props = {
    opponentName: nikos,
    friend,
    sending: false,
    onPlayAgain: jest.fn(),
    onAddFriend: jest.fn(),
    onNewPlayer: jest.fn(),
  };
  return props;
}

describe('<RankedRatingChange />', () => {
  it('shows the rating before and after, and the change', async () => {
    const user = userEvent.setup();
    const onLeaderboards = jest.fn();
    await render(
      <RankedRatingChange rating={{ before: 1490, after: 1502 }} onLeaderboards={onLeaderboards} />,
    );
    expect(screen.getByTestId('ranked-end-rating')).toHaveTextContent(/Rating 1490 → 1502/);
    expect(screen.getByTestId('ranked-end-change')).toHaveTextContent('+12');
    await user.press(screen.getByTestId('ranked-end-rating'));
    expect(onLeaderboards).toHaveBeenCalledTimes(1);
  });

  it('shows a loss with a minus sign', async () => {
    await render(
      <RankedRatingChange rating={{ before: 1500, after: 1489 }} onLeaderboards={jest.fn()} />,
    );
    expect(screen.getByTestId('ranked-end-change')).toHaveTextContent('−11');
  });

  it('a match that left the rating the same shows no change (not rated)', async () => {
    await render(
      <RankedRatingChange rating={{ before: 1500, after: 1500 }} onLeaderboards={jest.fn()} />,
    );
    expect(screen.getByTestId('ranked-end-rating')).toHaveTextContent(/Rating 1500/);
    expect(screen.getByTestId('ranked-end-rating')).not.toHaveTextContent(/→/);
    expect(screen.queryByTestId('ranked-end-change')).toBeNull();
  });

  it('after an app restart shows only the new rating', async () => {
    await render(
      <RankedRatingChange rating={{ before: null, after: 1502 }} onLeaderboards={jest.fn()} />,
    );
    expect(screen.getByTestId('ranked-end-rating')).toHaveTextContent(/Rating 1502/);
    expect(screen.queryByTestId('ranked-end-change')).toBeNull();
  });
});

describe('<RankedEndActions />', () => {
  it('with a stranger: New player first, then Add friend; no Play again', async () => {
    const user = userEvent.setup();
    const props = actions('none');
    await render(<RankedEndActions {...props} />);
    expect(screen.queryByTestId('ranked-end-play-again')).toBeNull();
    await user.press(screen.getByTestId('ranked-end-add-friend'));
    expect(props.onAddFriend).toHaveBeenCalledTimes(1);
    await user.press(screen.getByTestId('ranked-end-new-player'));
    expect(props.onNewPlayer).toHaveBeenCalledTimes(1);
  });

  it('with a friend: Play nikos_k again, and no Add friend', async () => {
    const user = userEvent.setup();
    const props = actions('friends');
    await render(<RankedEndActions {...props} />);
    await user.press(screen.getByRole('button', { name: 'Play nikos_k again' }));
    expect(props.onPlayAgain).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('ranked-end-add-friend')).toBeNull();
  });

  it('after a request: says it was sent', async () => {
    await render(<RankedEndActions {...actions('sent')} />);
    expect(screen.getByTestId('ranked-end-request-sent')).toHaveTextContent(
      'Friend request sent to nikos_k',
    );
    expect(screen.queryByTestId('ranked-end-add-friend')).toBeNull();
  });

  it('they asked you first: Add friend still shows', async () => {
    await render(<RankedEndActions {...actions('received')} />);
    expect(screen.getByTestId('ranked-end-add-friend')).toBeOnTheScreen();
  });
});
