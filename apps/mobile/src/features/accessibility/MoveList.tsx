/**
 * The move list (#134): a row of buttons under the board, one per legal
 * next move. Screen readers read the full move ("Checker from point 13 to
 * point 8, hits"); on screen each button shows the short form ("13 → 8").
 *
 * It shows for screen reader users by default and for everyone with
 * Settings → Move list → On (`useMoveListShown`). It plays the same moves
 * as the board: the screen passes the same `legal` list.
 */
import type { Move, SourceMoves } from '@tavli/engine';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { moveChoices, moveKey, moveLabel, moveShortLabel } from './moveList';

export interface MoveListProps {
  /** Legal single moves now (`legalNextMoves`, or a lesson's moves). Empty: no list. */
  legal: readonly SourceMoves[];
  onMove: (move: Move) => void;
  testID?: string;
}

export function MoveList({ legal, onMove, testID = 'move-list' }: MoveListProps) {
  const { t } = useTranslation();
  const moves = moveChoices(legal);
  if (moves.length === 0) return null;
  return (
    <View testID={testID} style={styles.root}>
      <Text style={styles.title} accessibilityRole="header">
        {t('game.moveList.title')}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {moves.map((move) => (
          <Pressable
            key={moveKey(move)}
            testID={`${testID}-${moveKey(move)}`}
            accessibilityRole="button"
            accessibilityLabel={moveLabel(t, move)}
            onPress={() => onMove(move)}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Text style={styles.label}>{moveShortLabel(t, move)}</Text>
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
  pressed: {
    opacity: 0.7,
  },
  label: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
}));
