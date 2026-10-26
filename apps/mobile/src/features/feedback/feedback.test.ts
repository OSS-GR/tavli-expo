import {
  createRecordingFeedback,
  createRecordingSoundPlayer,
  type SoundPlayer,
} from '@tavli/contracts';
import { allSoundFiles, FEEDBACK_EVENTS, getTheme, listThemeIds } from '@tavli/themes';
import { act } from '@testing-library/react-native';

import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import { sound } from '@/services';

import { appSound, createGameFeedback, loadThemeSounds, MIN_GAP_MS, soundBank } from './feedback';
import { THEME_SOUNDS } from './themeSounds';

const theme = getTheme('walnut-kafeneio');
const recorded = sound as ReturnType<typeof createRecordingSoundPlayer>;

function setup(start = 1000) {
  let t = start;
  const player = createRecordingSoundPlayer();
  const haptics = createRecordingFeedback();
  const feedback = createGameFeedback({ theme, sound: player, haptics, now: () => t });
  return {
    feedback,
    player,
    haptics,
    wait: (ms: number) => {
      t += ms;
    },
  };
}

beforeEach(async () => {
  recorded.played.length = 0;
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

describe('createGameFeedback: one place for sound and haptic', () => {
  it('maps each game event to the theme sound and haptic', () => {
    const rows = FEEDBACK_EVENTS.map((event) => {
      const { feedback, player, haptics } = setup();
      feedback.event(event);
      return [event, player.played[0] ?? null, haptics.calls[0] ?? null];
    });
    expect(rows).toEqual([
      ['checkerPickUp', null, 'selection'],
      ['checkerPlace', 'checkerPlace', 'light'],
      ['checkerHit', 'checkerHit', 'medium'],
      ['bearOff', 'bearOff', 'light'],
      ['diceShake', null, null],
      ['diceRoll', 'diceRoll', null],
      ['diceLand', 'diceLand', 'light'],
      ['invalidMove', 'invalidMove', 'warning'],
      ['turnStart', 'turnStart', null],
      ['gameWin', 'gameWin', 'success'],
      ['matchWin', 'matchWin', 'success'],
    ]);
  });

  it('drops a checker click that comes too soon after the last one', () => {
    const { feedback, player, haptics, wait } = setup();
    feedback.event('checkerPlace');
    wait(MIN_GAP_MS.checkerPlace - 1);
    feedback.event('checkerPlace');
    wait(1);
    feedback.event('checkerPlace');
    // Other events have their own gap.
    feedback.event('checkerHit');
    expect(player.played).toEqual(['checkerPlace', 'checkerPlace', 'checkerHit']);
    expect(haptics.calls).toEqual(['light', 'light', 'medium']);
  });

  it('plays every die landing', () => {
    const { feedback, player } = setup();
    feedback.event('diceLand');
    feedback.event('diceLand');
    expect(player.played).toEqual(['diceLand', 'diceLand']);
  });
});

describe('app sound', () => {
  it('follows Settings → Sound', async () => {
    appSound.play('checkerPlace');
    await act(async () => {
      settingsStore.getState().setSetting('sound', false);
    });
    appSound.play('checkerHit');
    expect(recorded.played).toEqual(['checkerPlace']);
  });

  it('keeps haptics when sound is off', async () => {
    await act(async () => {
      settingsStore.getState().setSetting('sound', false);
    });
    const haptics = createRecordingFeedback();
    createGameFeedback({ theme, haptics }).event('checkerHit');
    expect(recorded.played).toEqual([]);
    expect(haptics.calls).toEqual(['medium']);
  });
});

describe('theme sounds', () => {
  it('has a Metro require for every sound of every bundled theme', () => {
    for (const id of listThemeIds()) {
      const files = allSoundFiles(getTheme(id)).sort();
      expect(Object.keys(THEME_SOUNDS[id] ?? {}).sort()).toEqual(files);
    }
  });

  it('builds a bank with every take of every sound', () => {
    const bank = soundBank(theme, { 'sounds/checker-place-1.m4a': 1, 'sounds/checker-hit.m4a': 2 });
    expect(bank).toEqual({ checkerPlace: [1], checkerHit: [2] });
    const full = soundBank(theme);
    expect(full['checkerPlace']).toHaveLength(3);
    expect(full['diceRoll']).toHaveLength(2);
    expect(Object.keys(full)).not.toContain('checkerPickUp');
  });

  it('preloads a theme once', () => {
    const player: SoundPlayer & { loaded: unknown[] } = createRecordingSoundPlayer();
    loadThemeSounds(theme, player);
    expect(player.loaded).toEqual([soundBank(theme)]);
    loadThemeSounds(theme);
    loadThemeSounds(theme);
    expect((sound as ReturnType<typeof createRecordingSoundPlayer>).loaded).toHaveLength(1);
  });
});
