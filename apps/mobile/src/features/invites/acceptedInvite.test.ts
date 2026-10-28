import { inviteAccepted, onInviteAccepted } from './acceptedInvite';

describe('inviteAccepted (#256)', () => {
  it('calls each listener with the game id, until it stops', () => {
    const first = jest.fn();
    const second = jest.fn();
    const stopFirst = onInviteAccepted(first);
    const stopSecond = onInviteAccepted(second);
    inviteAccepted('g1');
    expect(first).toHaveBeenCalledWith('g1');
    expect(second).toHaveBeenCalledWith('g1');
    stopFirst();
    inviteAccepted('g2');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    stopSecond();
  });

  it('lets a listener stop itself while it runs, and still calls the others', () => {
    const other = jest.fn();
    const stopSelf: { stop?: () => void } = {};
    const self = jest.fn(() => stopSelf.stop?.());
    stopSelf.stop = onInviteAccepted(self);
    const stopOther = onInviteAccepted(other);
    inviteAccepted('g1');
    inviteAccepted('g2');
    expect(self).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(2);
    stopOther();
  });
});
