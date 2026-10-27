import { createRecordingCrashReporter } from '@tavli/contracts';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

import i18n from '@/i18n';

import { CrashBoundary } from './CrashBoundary';

let shouldThrow = true;

function Bomb() {
  if (shouldThrow) throw new Error('board exploded');
  return <Text>Board is fine</Text>;
}

// React logs caught render errors with console.error. Keep the test output clean.
let consoleError: jest.SpyInstance;

beforeEach(() => {
  shouldThrow = true;
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(async () => {
  consoleError.mockRestore();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('<CrashBoundary />', () => {
  it('renders its children when nothing throws', async () => {
    shouldThrow = false;
    const reporter = createRecordingCrashReporter();
    await render(
      <CrashBoundary reporter={reporter}>
        <Bomb />
      </CrashBoundary>,
    );

    expect(screen.getByText('Board is fine')).toBeOnTheScreen();
    expect(reporter.reports).toEqual([]);
  });

  it('shows the fallback screen and reports the error', async () => {
    const reporter = createRecordingCrashReporter();
    await render(
      <CrashBoundary reporter={reporter}>
        <Bomb />
      </CrashBoundary>,
    );

    expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Restart' })).toBeOnTheScreen();
    // No error details on screen.
    expect(screen.queryByText(/board exploded/)).toBeNull();

    expect(reporter.reports).toHaveLength(1);
    const [report] = reporter.reports;
    expect(report).toMatchObject({
      kind: 'exception',
      error: expect.objectContaining({ message: 'board exploded' }),
      context: { level: 'fatal', tags: { boundary: 'root' } },
    });
    expect(report?.kind === 'exception' && report.context?.componentStack).toContain('Bomb');
  });

  it('shows the fallback screen in Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await render(
      <CrashBoundary reporter={createRecordingCrashReporter()}>
        <Bomb />
      </CrashBoundary>,
    );

    expect(screen.getByRole('header', { name: 'Κάτι πήγε στραβά' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Επανεκκίνηση' })).toBeOnTheScreen();
  });

  it('restarts the app when the player taps Restart', async () => {
    const user = userEvent.setup();
    const onRestart = jest.fn();
    await render(
      <CrashBoundary reporter={createRecordingCrashReporter()} onRestart={onRestart}>
        <Bomb />
      </CrashBoundary>,
    );

    await user.press(screen.getByRole('button', { name: 'Restart' }));

    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('renders the app again if a full reload fails', async () => {
    const user = userEvent.setup();
    const onRestart = jest.fn(() => {
      shouldThrow = false;
      return Promise.reject(new Error('reload not available'));
    });
    await render(
      <CrashBoundary reporter={createRecordingCrashReporter()} onRestart={onRestart}>
        <Bomb />
      </CrashBoundary>,
    );

    await user.press(screen.getByRole('button', { name: 'Restart' }));

    expect(await screen.findByText('Board is fine')).toBeOnTheScreen();
  });

  it('sends nothing when crash reports are off, but still shows the fallback', async () => {
    const reporter = createRecordingCrashReporter();
    reporter.setEnabled(false);
    await render(
      <CrashBoundary reporter={reporter}>
        <Bomb />
      </CrashBoundary>,
    );

    expect(screen.getByTestId('crash-screen')).toBeOnTheScreen();
    expect(reporter.reports).toEqual([]);
  });
});
