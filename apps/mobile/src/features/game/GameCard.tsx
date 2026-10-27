/**
 * A card over the board: no legal moves (wireframe 6f), and "This game
 * could not be opened." The board stays visible around it. Game end is
 * `GameEndSheet`; match end is its own screen (`MatchEndScreen`).
 *
 * When the card opens, screen reader focus moves to its title (#153); the
 * screen hides the board under it.
 */
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { useFocusOnShow } from '@/features/accessibility/focus';

import { useAnnouncement } from './useAnnouncement';

export interface GameCardProps {
  title: string;
  /** Lines under the title. */
  lines?: readonly string[];
  /** Small text at the bottom, e.g. "Closes by itself after 3 s." */
  footnote?: string;
  /** Buttons. */
  children?: ReactNode;
  testID?: string;
}

export function GameCard({ title, lines = [], footnote, children, testID }: GameCardProps) {
  const titleRef = useFocusOnShow();
  // Read on both platforms (a live region works on Android only).
  useAnnouncement([title, ...lines].join(' '));
  return (
    <View testID={testID} style={styles.card}>
      <Text ref={titleRef} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {lines.map((line, i) => (
        <Text key={i} style={styles.line}>
          {line}
        </Text>
      ))}
      {children ? <View style={styles.actions}>{children}</View> : null}
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    marginHorizontal: theme.space.lg,
    padding: theme.space.lg,
    gap: theme.space.sm,
    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  line: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  actions: {
    gap: theme.space.sm,
    paddingTop: theme.space.sm,
  },
  footnote: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    textAlign: 'center',
    fontStyle: 'italic',
  },
}));
