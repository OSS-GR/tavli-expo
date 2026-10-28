/**
 * The invite screen (#256) on its own in-memory server: each state, Accept
 * and Decline, errors, screen readers and Greek.
 */
import {
  INVITE_TIME_MS,
  type InviteErrorData,
  type InviteView,
  type Invites,
} from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { createMemoryGameServer } from '@tavli/online';
import { act, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import i18n from '@/i18n';

import { InviteScreen } from './InviteScreen';
import { stateOfError, stateOfView } from './inviteState';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';

const ME = 'me';
const FRIEND = 'friend';
const START = Date.UTC(2026, 9, 28, 12, 0, 0);

runOnFakeTimers();

afterAll(async () => {
  await i18n.changeLanguage('en');
});

/** A server whose clock the test moves by hand. */
function setup() {
  let clock = START;
  const server = createMemoryGameServer({ rng: createSeededRng(3), now: () => clock });
  return {
    server,
    wait: (ms: number) => {
      clock += ms;
    },
  };
}

async function openInvite(code: string, invites: Invites, me = ME) {
  const props = {
    onAccepted: jest.fn<void, [string]>(),
    onDeclined: jest.fn(),
    onHome: jest.fn(),
  };
  await renderWithRoot(<InviteScreen code={code} invites={invites} me={me} {...props} />);
  return props;
}

describe('InviteScreen', () => {
  it('loads, then shows the game, the match length and the pace', async () => {
    const { server } = setup();
    const code = server.createInvite(FRIEND, 'plakoto', 5, 'async');
    const real = server.invitesFor(ME);
    // The answer waits until the test lets it through.
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const invites: Invites = {
      ...real,
      getInvite: (text) => gate.then(() => real.getInvite(text)),
    };
    await openInvite(code.toLowerCase(), invites);
    expect(screen.getByRole('header', { name: 'Loading the invite…' })).toBeOnTheScreen();

    await act(async () => release());
    expect(await screen.findByRole('header', { name: 'Game invite' })).toBeOnTheScreen();
    expect(screen.getByText('A friend invites you to an online match.')).toBeOnTheScreen();
    expect(screen.getByText('Plakoto')).toBeOnTheScreen();
    expect(screen.getByText('First to 5 points')).toBeOnTheScreen();
    expect(screen.getByText('Async · 24 hours per turn')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeOnTheScreen();
  });

  it('shows a live invite of one point', async () => {
    const { server } = setup();
    const code = server.createInvite(FRIEND, 'tavli', 1, 'live');
    await openInvite(code, server.invitesFor(ME));
    expect(await screen.findByText('Tavli')).toBeOnTheScreen();
    expect(screen.getByText('First to 1 point')).toBeOnTheScreen();
    expect(screen.getByText('Live · 1 minute per turn')).toBeOnTheScreen();
  });

  it('Accept starts the game, and the inviter plays White', async () => {
    const user = setupUser();
    const { server } = setup();
    const code = server.createInvite(FRIEND, 'portes', 3, 'live');
    const props = await openInvite(code, server.invitesFor(ME));
    await user.press(await screen.findByRole('button', { name: 'Accept' }));

    expect(props.onAccepted).toHaveBeenCalledTimes(1);
    const gameId = props.onAccepted.mock.calls[0]?.[0] as string;
    expect(server.getGame(gameId)).toMatchObject({
      choice: 'portes',
      pace: 'live',
      players: { white: FRIEND, black: ME },
    });
    expect(server.getInvite(code)).toMatchObject({ status: 'accepted', gameId });
    expect(props.onDeclined).not.toHaveBeenCalled();
  });

  it('Decline closes the invite', async () => {
    const user = setupUser();
    const { server } = setup();
    const code = server.createInvite(FRIEND, 'fevga', 3, 'live');
    const props = await openInvite(code, server.invitesFor(ME));
    await user.press(await screen.findByRole('button', { name: 'Decline' }));

    expect(props.onDeclined).toHaveBeenCalledTimes(1);
    expect(props.onAccepted).not.toHaveBeenCalled();
    expect(server.getInvite(code)?.status).toBe('declined');
  });

  it('shows an expired invite, with a Home button', async () => {
    const user = setupUser();
    const { server, wait } = setup();
    const code = server.createInvite(FRIEND, 'portes', 3, 'live');
    wait(INVITE_TIME_MS);
    const props = await openInvite(code, server.invitesFor(ME));
    expect(
      await screen.findByRole('header', { name: 'This invite has expired' }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Home' }));
    expect(props.onHome).toHaveBeenCalledTimes(1);
  });

  it('shows an invite that was already used', async () => {
    const { server } = setup();
    const code = server.createInvite(FRIEND, 'portes', 3, 'live');
    await server.invitesFor('carol').acceptInvite(code);
    await openInvite(code, server.invitesFor(ME));
    expect(
      await screen.findByRole('header', { name: 'This invite was already used' }),
    ).toBeOnTheScreen();
  });

  it('shows "not found" for an unknown code', async () => {
    const { server } = setup();
    server.createInvite(FRIEND, 'portes', 3, 'live');
    await openInvite('ABCD2345', server.invitesFor(ME));
    expect(await screen.findByRole('header', { name: 'Invite not found' })).toBeOnTheScreen();
  });

  it('shows "not found" at once for a link with no code, with no server call', async () => {
    const invites: Invites = {
      getInvite: jest.fn(),
      acceptInvite: jest.fn(),
      declineInvite: jest.fn(),
    };
    await openInvite('ABCD234O', invites);
    expect(screen.getByRole('header', { name: 'Invite not found' })).toBeOnTheScreen();
    expect(invites.getInvite).not.toHaveBeenCalled();
  });

  it('shows your own invite, with no Accept', async () => {
    const { server } = setup();
    const code = server.createInvite(ME, 'portes', 3, 'live');
    await openInvite(code, server.invitesFor(ME));
    expect(
      await screen.findByRole('header', { name: 'This is your own invite' }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });

  it('shows the new state when the invite expires before Accept', async () => {
    const user = setupUser();
    const { server, wait } = setup();
    const code = server.createInvite(FRIEND, 'portes', 3, 'live');
    const props = await openInvite(code, server.invitesFor(ME));
    const accept = await screen.findByRole('button', { name: 'Accept' });
    wait(INVITE_TIME_MS);
    await user.press(accept);
    expect(
      await screen.findByRole('header', { name: 'This invite has expired' }),
    ).toBeOnTheScreen();
    expect(props.onAccepted).not.toHaveBeenCalled();
  });

  it('shows "did not load" with Try again when the call fails', async () => {
    const user = setupUser();
    const { server } = setup();
    const code = server.createInvite(FRIEND, 'portes', 3, 'live');
    const real = server.invitesFor(ME);
    let fail = true;
    const invites: Invites = {
      ...real,
      getInvite: (text) => (fail ? Promise.reject(new Error('offline')) : real.getInvite(text)),
    };
    await openInvite(code, invites);
    expect(
      await screen.findByRole('header', { name: 'The invite did not load' }),
    ).toBeOnTheScreen();
    fail = false;
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('header', { name: 'Game invite' })).toBeOnTheScreen();
  });

  it('keeps the invite open and says so when Accept fails for another reason', async () => {
    const user = setupUser();
    const { server } = setup();
    const code = server.createInvite(FRIEND, 'portes', 3, 'live');
    const real = server.invitesFor(ME);
    const invites: Invites = {
      ...real,
      acceptInvite: () => Promise.reject(new Error('offline')),
    };
    const props = await openInvite(code, invites);
    await user.press(await screen.findByRole('button', { name: 'Accept' }));
    expect(
      await screen.findByText('That did not work. Check the connection and try again.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled();
    expect(props.onAccepted).not.toHaveBeenCalled();
    expect(server.getInvite(code)?.status).toBe('open');
  });

  it('screen readers: focus moves to the title, and the invite is read', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { server } = setup();
    const code = server.createInvite(FRIEND, 'portes', 3, 'live');
    await openInvite(code, server.invitesFor(ME));
    await screen.findByRole('header', { name: 'Game invite' });
    expect(focus).toHaveBeenLastCalledWith(expect.anything(), 'focus');
    expect(announce).toHaveBeenLastCalledWith(
      'Game invite A friend invites you to an online match. Game: Portes. ' +
        'Match length: First to 3 points. Pace: Live · 1 minute per turn.',
    );
    focus.mockRestore();
    announce.mockRestore();
  });

  it('speaks Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    const { server } = setup();
    const code = server.createInvite(FRIEND, 'portes', 3, 'async');
    await openInvite(code, server.invitesFor(ME));
    expect(await screen.findByRole('header', { name: 'Πρόσκληση για παιχνίδι' })).toBeOnTheScreen();
    expect(screen.getByText('Πόρτες')).toBeOnTheScreen();
    expect(screen.getByText('Νικά όποιος φτάσει τους 3 βαθμούς')).toBeOnTheScreen();
    expect(screen.getByText('Χαλαρά · 24 ώρες τη σειρά')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Αποδοχή' })).toBeOnTheScreen();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });
});

describe('inviteState', () => {
  const view: InviteView = {
    code: 'ABCD2345',
    from: FRIEND,
    choice: 'portes',
    targetPoints: 3,
    pace: 'live',
    status: 'open',
    expiresAt: START + INVITE_TIME_MS,
    gameId: null,
  };
  const error = (code: InviteErrorData['code']): InviteErrorData => ({ code, message: 'x' });

  it('maps a view to a state', () => {
    expect(stateOfView(null, ME)).toEqual({ kind: 'notFound' });
    expect(stateOfView(view, ME)).toEqual({ kind: 'open', view });
    expect(stateOfView(view, FRIEND)).toEqual({ kind: 'own' });
    expect(stateOfView({ ...view, status: 'expired' }, ME)).toEqual({ kind: 'expired' });
    for (const status of ['accepted', 'declined', 'cancelled'] as const) {
      expect(stateOfView({ ...view, status }, ME)).toEqual({ kind: 'used' });
    }
  });

  it('maps an invite error to a state, and anything else to null', () => {
    expect(stateOfError(error('INVITE_EXPIRED'))).toEqual({ kind: 'expired' });
    expect(stateOfError(error('INVITE_CLOSED'))).toEqual({ kind: 'used' });
    expect(stateOfError(error('INVITE_NOT_FOUND'))).toEqual({ kind: 'notFound' });
    expect(stateOfError(error('BAD_REQUEST'))).toEqual({ kind: 'notFound' });
    expect(stateOfError(error('OWN_INVITE'))).toEqual({ kind: 'own' });
    expect(stateOfError(error('NOT_SIGNED_IN'))).toBeNull();
    expect(stateOfError(new Error('offline'))).toBeNull();
  });
});
