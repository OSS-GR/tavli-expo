import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { ICONS } from '@/components/icons';
import i18n from '@/i18n';
import el from '@/i18n/el.json';
import en from '@/i18n/en.json';

import { textScalingProblems } from '../../../test/textScaling';
import type { JsonNode } from '../../../test/tree';

import { RELEASES, releaseTime, type WhatsNewRelease } from './releases';
import { WhatsNewScreen } from './WhatsNewScreen';

const problems = () => textScalingProblems(screen.toJSON() as JsonNode | JsonNode[] | null);

let focus: jest.SpyInstance;

beforeEach(() => {
  focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

const TWO: readonly WhatsNewRelease[] = [
  {
    date: '2026-11-10',
    entries: [
      { id: 'friends', icon: 'users' },
      { id: 'leaderboards', icon: 'trophy' },
    ],
  },
  { date: '2026-11-02', entries: [{ id: 'home', icon: 'house' }] },
];

describe('<WhatsNewScreen />', () => {
  it('lists each release under its date, newest first, with every entry', async () => {
    await render(<WhatsNewScreen onBack={jest.fn()} releases={TWO} />);
    const releases = screen
      .getAllByTestId(/^whats-new-release-/)
      .map((card) => card.props.testID as string);
    expect(releases).toEqual(['whats-new-release-2026-11-10', 'whats-new-release-2026-11-02']);
    expect(screen.getByRole('header', { name: 'Nov 10, 2026' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Nov 2, 2026' })).toBeOnTheScreen();

    const newest = within(screen.getByTestId('whats-new-release-2026-11-10'));
    expect(newest.getByText('Friends')).toBeOnTheScreen();
    expect(newest.getByText(en.whatsNew.entries.friends.body)).toBeOnTheScreen();
    expect(newest.getByText('Leaderboards')).toBeOnTheScreen();
    const older = within(screen.getByTestId('whats-new-release-2026-11-02'));
    expect(older.getByText('A new Home')).toBeOnTheScreen();
    expect(older.queryByText('Friends')).toBeNull();
  });

  it('marks only the newest release New, and says where to find each entry (#521)', async () => {
    await render(<WhatsNewScreen onBack={jest.fn()} releases={TWO} />);
    expect(screen.getAllByTestId('whats-new-newest')).toHaveLength(1);
    expect(screen.getByTestId('whats-new-newest')).toHaveTextContent('New');

    const friends = within(screen.getByTestId('whats-new-entry-friends'));
    expect(friends.getByText('Home › Friends')).toBeOnTheScreen();
    // Screen readers hear a comma, not "›".
    expect(friends.getByLabelText('Find it: Home, Friends')).toBeOnTheScreen();
    const home = within(screen.getByTestId('whats-new-entry-home'));
    expect(home.getByLabelText('Find it: Home')).toBeOnTheScreen();
  });

  it('shows the app list by default, and every entry once', async () => {
    await render(<WhatsNewScreen onBack={jest.fn()} />);
    for (const release of RELEASES) {
      expect(screen.getByTestId(`whats-new-release-${release.date}`)).toBeOnTheScreen();
      for (const entry of release.entries) {
        expect(screen.getByTestId(`whats-new-entry-${entry.id}`)).toBeOnTheScreen();
      }
    }
  });

  it('moves focus to the title, and Back goes back', async () => {
    const onBack = jest.fn();
    const user = userEvent.setup();
    await render(<WhatsNewScreen onBack={onBack} />);
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
    expect(screen.getByRole('header', { name: "What's new" })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows in Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await render(<WhatsNewScreen onBack={jest.fn()} releases={TWO} />);
    expect(screen.getByRole('header', { name: 'Τι νέο υπάρχει' })).toBeOnTheScreen();
    expect(screen.getByText('Φίλοι')).toBeOnTheScreen();
    expect(screen.getByText(el.whatsNew.entries.home.body)).toBeOnTheScreen();
    expect(screen.getByTestId('whats-new-newest')).toHaveTextContent('Νέο');
    expect(screen.getByLabelText('Πού θα το βρεις: Αρχική, Φίλοι')).toBeOnTheScreen();
    expect(screen.queryByText('Friends')).toBeNull();
  });

  it.each(['en', 'el'] as const)('follows a large font with no cut text (%s)', async (language) => {
    await act(async () => {
      await i18n.changeLanguage(language);
    });
    await render(<WhatsNewScreen onBack={jest.fn()} />);
    expect(problems()).toEqual([]);
  });
});

describe("What's new content (#471)", () => {
  it('lists real days, newest first, each once', () => {
    const dates = RELEASES.map((release) => release.date);
    for (const date of dates) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(releaseTime(date)).toISOString().slice(0, 10)).toBe(date);
    }
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('gives every release entries, each in one release only, with a known icon', () => {
    const ids = RELEASES.flatMap((release) => release.entries.map((entry) => entry.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const release of RELEASES) {
      expect(release.entries.length).toBeGreaterThan(0);
      for (const entry of release.entries) expect(ICONS[entry.icon]).toBeDefined();
    }
  });

  it('has a title, a body and where to find it in English and Greek for each entry, and no entry without a release', () => {
    const ids = RELEASES.flatMap((release) => release.entries.map((entry) => entry.id)).sort();
    expect(Object.keys(en.whatsNew.entries).sort()).toEqual(ids);
    for (const strings of [en, el]) {
      for (const id of ids) {
        const entry = strings.whatsNew.entries[id];
        expect(entry.title.trim()).not.toBe('');
        expect(entry.body.trim()).not.toBe('');
        expect(entry.where.trim()).not.toBe('');
      }
    }
  });

  it('never says "coming soon"', () => {
    const texts = [JSON.stringify(en.whatsNew), JSON.stringify(el.whatsNew)].join(' ');
    expect(texts).not.toMatch(/coming soon|soon|σύντομα/i);
  });
});
