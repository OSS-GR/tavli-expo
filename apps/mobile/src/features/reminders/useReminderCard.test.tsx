/**
 * The reminder card on Home (#404): which card shows on a visit, on the
 * Jest online fake (`auth` and Apple's sheet) and a test clock.
 */
import { createMemoryStorage, type Storage } from '@tavli/contracts';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ReminderCard } from '@/features/home/ReminderCard';
import { rememberOnlineAccount } from '@/features/online/accountHint';
import { CONSENT_STORAGE_KEY } from '@/features/privacy/consent';
import { RELEASES } from '@/features/whats-new/releases';
import { createWhatsNewSeen, WHATS_NEW_STORAGE_KEY } from '@/features/whats-new/seen';
import { useWhatsNewCard } from '@/features/whats-new/useWhatsNewCard';
import { auth } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';

import { createReminders, REMINDERS_STORAGE_KEY, type Reminders } from './reminders';
import { DAY_MS, LAST_GAP_MS } from './schedule';
import { useReminderCard, type ReminderCardOptions } from './useReminderCard';

runOnFakeTimers();

const T0 = Date.UTC(2026, 10, 1, 12);

let now = T0;
let storage: Storage;
let reminders: Reminders;

beforeEach(() => {
  now = T0;
  storage = createMemoryStorage();
  reminders = createReminders(storage, () => now);
});

function Home(props: Omit<ReminderCardOptions, 'reminders'>) {
  const { card, hide, stop } = useReminderCard({ ...props, reminders });
  return card ? (
    <ReminderCard
      kind={card.kind}
      last={card.last}
      onAccept={hide}
      onDismiss={hide}
      onStop={stop}
    />
  ) : null;
}

/** Lets `auth` and the sheet answer (they answer on later microtasks). */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

/** Home comes into view at `at`. `online: false`: a build with no online play. */
async function visit(at: number, { online = true } = {}): Promise<void> {
  now = at;
  const onlineAuth = online ? auth : undefined;
  await render(<Home focused={false} auth={onlineAuth} />);
  await screen.rerender(<Home focused auth={onlineAuth} />);
  await flush();
}

function shownCard(): string | null {
  const card = screen.queryByTestId(/^home-reminder-(guest|offline)$/);
  return card === null ? null : String(card.props.testID);
}

function signInAsGuest(): void {
  onlineFake.authStore.session = { id: 'guest-1', isGuest: true };
  rememberOnlineAccount();
}

describe('the reminder card (#404)', () => {
  it('shows nothing before the first choice', async () => {
    await visit(T0 + 400 * DAY_MS);
    expect(shownCard()).toBeNull();
    signInAsGuest();
    // A guest from before #404: the clock starts at this visit.
    await visit(T0);
    expect(shownCard()).toBeNull();
    expect(reminders.state().start).toBe(T0);
  });

  it('asks a player with no account to play online, 24 hours after Not now', async () => {
    reminders.start();
    await visit(T0 + DAY_MS - 1);
    expect(shownCard()).toBeNull();
    await visit(T0 + DAY_MS);
    expect(shownCard()).toBe('home-reminder-offline');
    expect(screen.getByRole('header', { name: 'Play a friend online?' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play a friend' })).toBeOnTheScreen();
    // The ask is used: the next visit that day shows nothing.
    await visit(T0 + DAY_MS + 60_000);
    expect(shownCard()).toBeNull();
  });

  it('asks a guest to save the account, also with no Apple sheet: email works (#433)', async () => {
    signInAsGuest();
    reminders.start();
    await visit(T0 + DAY_MS);
    expect(shownCard()).toBe('home-reminder-guest');
    expect(screen.getByRole('header', { name: 'Save your online games?' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save my account' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Keep playing as a guest' })).toBeOnTheScreen();
  });

  it('stops for good after a sign-in with a key', async () => {
    reminders.start();
    onlineFake.authStore.session = { id: 'kept-1', isGuest: false };
    rememberOnlineAccount();
    await visit(T0 + DAY_MS);
    expect(shownCard()).toBeNull();
    expect(reminders.state().stopped).toBe(true);
  });

  it('shows no card when the session does not load', async () => {
    reminders.start();
    // A note of an account, but `ready()` gives null (no network).
    rememberOnlineAccount();
    await visit(T0 + DAY_MS);
    expect(shownCard()).toBeNull();
    expect(reminders.due()).toBe(true);
  });

  it('shows no card in a build with no online play', async () => {
    reminders.start();
    await visit(T0 + DAY_MS, { online: false });
    expect(shownCard()).toBeNull();
  });

  it('offers "Don\'t ask again" on the last ask, and then never asks', async () => {
    const user = setupUser();
    reminders.start();
    // Back after a month: one card, then the last one 2 weeks later.
    const back = T0 + 31 * DAY_MS;
    await visit(back);
    expect(shownCard()).toBe('home-reminder-offline');
    await user.press(screen.getByRole('button', { name: 'Not now' }));
    expect(shownCard()).toBeNull();
    await visit(back + LAST_GAP_MS);
    expect(shownCard()).toBe('home-reminder-offline');
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull();
    await user.press(screen.getByRole('button', { name: "Don't ask again" }));
    expect(shownCard()).toBeNull();
    expect(reminders.state().stopped).toBe(true);
    await visit(back + 400 * DAY_MS);
    expect(shownCard()).toBeNull();
  });

  it('hides the card when Home leaves the view', async () => {
    reminders.start();
    await visit(T0 + DAY_MS);
    expect(shownCard()).toBe('home-reminder-offline');
    await screen.rerender(<Home focused={false} auth={auth} />);
    expect(shownCard()).toBeNull();
  });

  it('keeps going when the phone cannot save or read the schedule', async () => {
    const broken: Storage = {
      ...storage,
      getString: () => {
        throw new Error('no disk');
      },
      setString: () => {
        throw new Error('no disk');
      },
    };
    reminders = createReminders(broken, () => now);
    reminders.start();
    await visit(T0 + DAY_MS);
    expect(shownCard()).toBeNull();
    // A saved value it cannot read counts as no schedule.
    storage.setString(REMINDERS_STORAGE_KEY, 'not json');
    expect(createReminders(storage, () => now).state().start).toBeNull();
  });
});

describe("with the What's new card (#471)", () => {
  /** Home's order: the reminder hook first, then What's new over it. */
  function HomeWithWhatsNew({ focused }: { focused: boolean }) {
    const reminder = useReminderCard({ focused, reminders, auth });
    const whatsNew = useWhatsNewCard({ focused, seen, reminders });
    if (whatsNew.shown) return <Text testID="home-whats-new">new</Text>;
    const { card } = reminder;
    return card ? (
      <ReminderCard
        kind={card.kind}
        last={card.last}
        onAccept={reminder.hide}
        onDismiss={reminder.hide}
        onStop={reminder.stop}
      />
    ) : null;
  }

  let seen: ReturnType<typeof createWhatsNewSeen>;

  beforeEach(() => {
    // A phone that answered the consent screen and saw only the older release.
    const phone = createMemoryStorage({
      [CONSENT_STORAGE_KEY]: '{"status":"denied"}',
      [WHATS_NEW_STORAGE_KEY]: RELEASES[1]!.date,
    });
    seen = createWhatsNewSeen(phone);
  });

  async function visitBoth(at: number): Promise<void> {
    now = at;
    await render(<HomeWithWhatsNew focused={false} />);
    await screen.rerender(<HomeWithWhatsNew focused />);
    await flush();
  }

  it.each([
    ['no account', () => undefined],
    ['a guest', signInAsGuest],
  ])('a due reminder (%s) waits a day and keeps its ask', async (_, setUp) => {
    setUp();
    reminders.start();
    await visitBoth(T0 + DAY_MS);
    expect(screen.getByTestId('home-whats-new')).toBeOnTheScreen();
    expect(shownCard()).toBeNull();
    expect(reminders.state().asked).toBe(0);

    await visitBoth(T0 + 2 * DAY_MS);
    expect(screen.queryByTestId('home-whats-new')).toBeNull();
    expect(shownCard()).not.toBeNull();
    expect(reminders.state().asked).toBe(1);
  });
});
