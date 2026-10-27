/**
 * The move list (#134): a row of buttons under the board, one per legal
 * next move. Screen readers read the full move ("Checker from point 13 to
 * point 8, hits"); on screen each button shows the short form ("13 → 8").
 *
 * It shows for screen reader users by default and for everyone with
 * Settings → Move list → On (`useMoveListShown`). It plays the same moves
 * as the board: the screen passes the same `legal` list, and the same
 * combined paths (#180, one checker with several dice: "13 → 10 → 5").
 * With `hint` it starts with the Hint button (#209), the same one as under
 * the board.
 */
import type { Move, SourceMoves } from '@tavli/engine';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { MovePath } from '@/features/board/combined';

import { choiceLabel, choiceShortLabel, listChoices } from './moveList';

/** The Hint button of the list (#209). */
export interface MoveListHint {
  /** The text on the button: "Hint", or "Thinking…" while busy. */
  readonly label: string;
  /** What a screen reader says: "Hint", or "Hide the hint" while one shows. */
  readonly accessibilityLabel: string;
  readonly busy: boolean;
  readonly onPress: () => void;
}

export interface MoveListProps {
  /** Legal single moves now (`legalNextMoves`, or a lesson's moves). Empty: no list. */
  legal: readonly SourceMoves[];
  onMove: (move: Move) => void;
  /** One checker with several dice (`flowPaths`). Shown only with `onSteps`. */
  paths?: readonly MovePath[];
  /** A path button was pressed: play its steps in order. */
  onSteps?: (steps: readonly Move[]) => void;
  /** Shows the Hint button first in the row. */
  hint?: MoveListHint;
  testID?: string;
}

export function MoveList({
  legal,
  onMove,
  paths,
  onSteps,
  hint,
  testID = 'move-list',
}: MoveListProps) {
  const { t } = useTranslation();
  const choices = listChoices(legal, onSteps && legal.length > 0 ? (paths ?? []) : []);
  if (choices.length === 0) return null;
  const press = (moves: readonly Move[]) => {
    const [move] = moves;
    if (moves.length > 1) onSteps?.(moves);
    else if (move !== undefined) onMove(move);
  };
  return (
    <View testID={testID} style={styles.root}>
      <Text style={styles.title} accessibilityRole="header">
        {t('game.moveList.title')}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {hint ? (
          <Pressable
            testID={`${testID}-hint`}
            accessibilityRole="button"
            accessibilityLabel={hint.accessibilityLabel}
            accessibilityState={{ disabled: hint.busy, busy: hint.busy }}
            disabled={hint.busy}
            onPress={hint.onPress}
            style={({ pressed }) => [styles.button, styles.hint, pressed && styles.pressed]}>
            <Text style={styles.label}>{hint.label}</Text>
          </Pressable>
        ) : null}
        {choices.map((choice) => (
          <Pressable
            key={choice.key}
            testID={`${testID}-${choice.key}`}
            accessibilityRole="button"
            accessibilityLabel={choiceLabel(t, choice.moves)}
            onPress={() => press(choice.moves)}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Text style={styles.label}>{choiceShortLabel(t, choice.moves)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingLeft: theme.space.lg,
  },
  title: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  row: {
    gap: theme.space.sm,
    paddingRight: theme.space.lg,
    alignItems: 'center',
  },
  button: {
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radii.md,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  // Not a move: the accent edge sets it apart.
  hint: {
    borderColor: theme.colors.accent,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
}));
