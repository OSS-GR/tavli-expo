/**
 * Join with a code (#333): the field, the code slots (#521), the phone's
 * check (a bad code says why and calls back nothing), the keyboard's Go
 * key, a pasted link, the screen reader announcement and Greek. The route and the invite after it
 * are in `navigation.test.tsx`.
 */
import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import i18n from '@/i18n';

import { JoinCodeScreen } from './JoinCodeScreen';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';

runOnFakeTimers();

afterAll(async () => {
  await i18n.changeLanguage('en');
});

async function open() {
  const props = { onCode: jest.fn<void, [string]>(), onBack: jest.fn() };
  await renderWithRoot(<JoinCodeScreen {...props} />);
  return props;
}

const field = () => screen.getByTestId('join-code-input');
/** The characters on the bone tiles, in order. The slots are hidden from screen readers. */
const tiles = () =>
  screen
    .queryAllByTestId('join-code-tile', { includeHiddenElements: true })
    .map((tile) => tile.props.children as string);

const continueButton = () => screen.getByRole('button', { name: 'Join the game' });

describe('JoinCodeScreen', () => {
  it('shows the title, the field, empty slots and a Join the game that waits for 8 characters', async () => {
    await open();
    expect(screen.getByRole('header', { name: 'Join with a code' })).toBeOnTheScreen();
    expect(field().props).toMatchObject({
      autoCapitalize: 'characters',
      autoCorrect: false,
      accessibilityLabel: 'Invite code',
      returnKeyType: 'go',
    });
    expect(continueButton()).toBeDisabled();
    expect(tiles()).toEqual([]);
  });

  it('fills a slot per character, and turns Join the game on at 8 (#521)', async () => {
    await open();
    await fireEvent.changeText(field(), 'ab-cd 23');
    expect(tiles()).toEqual(['A', 'B', 'C', 'D', '2', '3']);
    expect(continueButton()).toBeDisabled();
    await fireEvent.changeText(field(), 'abcd2345');
    expect(tiles()).toEqual(['A', 'B', 'C', 'D', '2', '3', '4', '5']);
    expect(continueButton()).toBeEnabled();
  });

  it('opens a typed code in capital letters', async () => {
    const user = setupUser();
    const props = await open();
    await user.type(field(), 'abcd2345');
    await user.press(continueButton());
    expect(props.onCode).toHaveBeenCalledTimes(1);
    expect(props.onCode).toHaveBeenCalledWith('ABCD2345');
    expect(screen.queryByTestId('join-problem')).toBeNull();
  });

  it("opens the code with the keyboard's Go key", async () => {
    const props = await open();
    await fireEvent.changeText(field(), 'ABCD 2345');
    await fireEvent(field(), 'submitEditing');
    expect(props.onCode).toHaveBeenCalledWith('ABCD2345');
  });

  it('opens the code of a pasted share message', async () => {
    const props = await open();
    await fireEvent.changeText(
      field(),
      'Play tavli with me on Tavlaki. Open this link to join: tavlaki://invite/ABCD2345\nOr open Tavlaki, tap Join with a code and enter ABCD2345.',
    );
    // The field keeps only the code, so the slots show it.
    expect(field().props.value).toBe('ABCD2345');
    expect(tiles()).toEqual(['A', 'B', 'C', 'D', '2', '3', '4', '5']);
    await fireEvent.press(continueButton());
    expect(props.onCode).toHaveBeenCalledWith('ABCD2345');
  });

  it('says why a bad code is not a code, reads it out, and opens nothing', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const user = setupUser();
    const props = await open();

    await user.type(field(), 'ABCD234');
    // Join the game waits for 8 characters; the Go key checks sooner.
    expect(continueButton()).toBeDisabled();
    await fireEvent(field(), 'submitEditing');
    const short = 'The code is too short. A code has 8 characters.';
    expect(screen.getByTestId('join-problem')).toHaveTextContent(short);
    expect(announce).toHaveBeenCalledWith(short);

    await fireEvent.changeText(field(), 'ABCD234O');
    // A new text hides the old problem.
    expect(screen.queryByTestId('join-problem')).toBeNull();
    await fireEvent(field(), 'submitEditing');
    expect(screen.getByTestId('join-problem')).toHaveTextContent(
      'This is not a code. A code has only Latin letters and digits, with no 0, O, 1, I or L.',
    );

    await fireEvent.changeText(field(), 'ABCD23456');
    await fireEvent(field(), 'submitEditing');
    expect(screen.getByTestId('join-problem')).toHaveTextContent(
      'The code is too long. A code has 8 characters.',
    );

    await fireEvent.changeText(field(), 'tavlaki://invite/nope');
    await fireEvent(field(), 'submitEditing');
    expect(screen.getByTestId('join-problem')).toHaveTextContent(
      'This link has no invite code. Check the link, or type the code.',
    );

    // Spaces only: nothing to check, nothing to open.
    await fireEvent.changeText(field(), '   ');
    await fireEvent(field(), 'submitEditing');
    expect(screen.queryByTestId('join-problem')).toBeNull();
    expect(props.onCode).not.toHaveBeenCalled();
    announce.mockRestore();
  });

  it('goes back', async () => {
    const user = setupUser();
    const props = await open();
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it('shows Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    const props = await open();
    expect(screen.getByRole('header', { name: 'Μπες με κωδικό' })).toBeOnTheScreen();
    const greekField = field();
    expect(greekField.props.accessibilityLabel).toBe('Κωδικός πρόσκλησης');
    await fireEvent.changeText(greekField, 'ABCD');
    await fireEvent(greekField, 'submitEditing');
    expect(screen.getByTestId('join-problem')).toHaveTextContent(
      'Ο κωδικός είναι πολύ μικρός. Ένας κωδικός έχει 8 χαρακτήρες.',
    );
    // A Greek keyboard: Α, Β, Ε, Κ are read as Latin letters.
    await fireEvent.changeText(greekField, 'ΑΒΕΚ2345');
    await fireEvent.press(screen.getByRole('button', { name: 'Μπες στο παιχνίδι' }));
    expect(props.onCode).toHaveBeenCalledWith('ABEK2345');
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });
});
