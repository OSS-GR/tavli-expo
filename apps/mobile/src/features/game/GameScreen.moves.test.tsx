import type { createRecordingFeedback } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { getLayout, getTheme } from '@tavli/themes';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { fitBoardWithShadow, slotRect, stackPosition } from '@/features/board/geometry';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import { feedback } from '@/services';

import { createGameStore } from './gameStore';
import { GameScreen } from './GameScreen';

import { touch } from '../../../test/gestureHandlerMock';
import { renderWithRoot } from '../../../test/render';
import { countNodes, findAllNodes, type JsonNode } from '../../../test/tree';

const haptics = feedback as ReturnType<typeof createRecordingFeedback>;
const SIZE = { width: 375, height: 500 };
const geo = fitBoardWithShadow(getLayout(getTheme('walnut-kafeneio'), 'portrait-rotated'), SIZE);
const PAN = 'game-board-pan';

const point = (index: number) => {
  const r = slotRect(geo, { kind: 'point', index });
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
const top = (index: number, count: number) =>
  stackPosition(geo, { kind: 'point', index }, count, count - 1);

/** White starts with 6-1 (opening roll 6 against 1). */
async function whiteToMove61() {
  const store = createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    rng: createSeededRng(5),
  });
  store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 6 });
  store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 1 });
  await renderWithRoot(<GameScreen store={store} />);
  await act(async () => {
    fireEvent(screen.getByTestId('game-board'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
    });
  });
  // Close the opening result ("Ann starts with 6-1") with a tap.
  await act(async () => {
    fireEvent.press(screen.getByTestId('opening-overlay'));
  });
  haptics.calls.length = 0;
  return store;
}

const played = (store: Awaited<ReturnType<typeof whiteToMove61>>) =>
  store.getState().flow.game.played.map((m) => `${m.from}/${m.to}`);

/** The opacity of the checker under the finger (a shared value: 0 or 1). */
function dragOpacity(): number {
  const [board] = findAllNodes(
    screen.toJSON() as JsonNode,
    (n) => n.props['testID'] === 'game-board-canvas',
  );
  const groups = findAllNodes(
    board ?? null,
    (n) => n.type === 'Group' && typeof n.props['opacity'] === 'object',
  );
  expect(groups).toHaveLength(1);
  return (groups[0]?.props['opacity'] as { value: number }).value;
}

beforeEach(async () => {
  haptics.calls.length = 0;
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

describe('<GameScreen /> moves', () => {
  it('moves a checker by drag and drop', async () => {
    const store = await whiteToMove61();
    const from = top(13, 5);
    const to = point(7);
    await touch(PAN, [from, { x: from.x - 30, y: from.y + 30 }, to]);
    expect(played(store)).toEqual(['13/7']);
    // Picked up, then placed.
    expect(haptics.calls).toEqual(['selection', 'light']);
  });

  it('flies a checker back from an illegal drop, with a warning', async () => {
    const store = await whiteToMove61();
    const from = top(13, 5);
    // 13/12 lands on Black's five checkers: not allowed.
    await touch(PAN, [from, { x: from.x, y: from.y + 20 }, point(12)]);
    expect(played(store)).toEqual([]);
    expect(haptics.calls).toEqual(['selection', 'warning']);
  });

  it('moves by tap-tap and shows the legal targets in between', async () => {
    const store = await whiteToMove61();
    await touch(PAN, [top(8, 3)]);
    // 8/7 and 8/2: two dashed target rings.
    expect(countNodes(screen.toJSON() as JsonNode, 'DashPathEffect')).toBe(2);
    expect(played(store)).toEqual([]);
    await touch(PAN, [point(7)]);
    expect(played(store)).toEqual(['8/7']);
    expect(countNodes(screen.toJSON() as JsonNode, 'DashPathEffect')).toBe(0);
  });

  it('drops the selection on a second tap', async () => {
    const store = await whiteToMove61();
    await touch(PAN, [top(6, 5)]);
    expect(countNodes(screen.toJSON() as JsonNode, 'DashPathEffect')).toBeGreaterThan(0);
    await touch(PAN, [top(6, 5)]);
    expect(countNodes(screen.toJSON() as JsonNode, 'DashPathEffect')).toBe(0);
    expect(played(store)).toEqual([]);
  });

  it('finishes the turn: after the last die, no checker can move', async () => {
    const store = await whiteToMove61();
    await touch(PAN, [top(13, 5), point(7)]);
    await touch(PAN, [top(8, 3), point(7)]);
    expect(played(store)).toEqual(['13/7', '8/7']);
    expect(store.getState().flow.game.phase).toBe('awaiting-confirm');
    // Nothing is movable now: a tap selects nothing.
    await touch(PAN, [top(6, 5)]);
    expect(countNodes(screen.toJSON() as JsonNode, 'DashPathEffect')).toBe(0);
  });

  it('hides the dragged checker after the move that ends the turn', async () => {
    await act(async () => {
      settingsStore.setState({ autoConfirmMoves: true });
    });
    const store = await whiteToMove61();
    await touch(PAN, [top(13, 5), point(7)]);
    expect(dragOpacity()).toBe(0);
    await touch(PAN, [top(8, 3), point(7)]);
    // Auto-confirm passed the turn to Black: no flight, and no drag copy left.
    expect(store.getState().flow.game.state.toMove).toBe('black');
    expect(dragOpacity()).toBe(0);
  });

  it('plays no move when the system cancels a drag', async () => {
    const store = await whiteToMove61();
    const from = top(13, 5);
    await touch(PAN, [from, { x: from.x - 30, y: from.y + 30 }, point(7)], { canceled: true });
    expect(played(store)).toEqual([]);
    expect(haptics.calls).toEqual(['selection']);
    expect(dragOpacity()).toBe(0);
  });

  it('does not treat a swipe as a tap', async () => {
    const store = await whiteToMove61();
    await touch(PAN, [top(8, 3)]);
    // A swipe from an empty point that ends on a target of the selected checker.
    await touch(PAN, [point(4), point(5), point(7)]);
    expect(played(store)).toEqual([]);
  });

  it('rolls when the board is tapped before the roll', async () => {
    const store = await whiteToMove61();
    await act(async () => {
      const { dispatch } = store.getState();
      dispatch({ type: 'move', player: 'white', move: { from: 13, to: 7, die: 6 } });
      dispatch({ type: 'move', player: 'white', move: { from: 8, to: 7, die: 1 } });
      dispatch({ type: 'confirm', player: 'white' });
    });
    expect(store.getState().flow.game.phase).toBe('awaiting-roll');
    await touch(PAN, [point(3)]);
    expect(store.getState().flow.game.state.dice).not.toBeNull();
  });
});
