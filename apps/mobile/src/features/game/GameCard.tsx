/**
 * A card over the board: no legal moves (wireframe 6f), and "This game
 * could not be opened." The board stays visible around it. Game end is
 * `GameEndSheet`; match end is its own screen (`MatchEndScreen`).
 *
 * When the card opens, screen reader focus moves to its title (#153); the
 * screen hides the board under it.
 *
 * An `eyebrow` is a short line in caps over the title, in the problem
 * color ("TIME RAN OUT", #530). Screen readers hear it with the title.
 */
import { displayCaps } from '@tavli/ui';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { useFocusOnShow } from '@/features/accessibility/focus';

import { useAnnouncement } from './useAnnouncement';

export interface GameCardProps {
  /** A short line in caps over the title, in the problem color. */
  eyebrow?: string;
  title: string;
  /** Lines under the title. */
  lines?: readonly string[];
  /** Small text at the bottom, e.g. "Closes by itself after 3.5 s." */
  footnote?: string;
  /** Buttons. */
  children?: ReactNode;
  /**
   * Names the game event the card shows, for this app run (#216). With it
   * the card is read once: a remount does not read it again. Without it,
   * every time it opens.
   */
  announceKey?: string;
  /** Centers the texts (Figma: the "Time ran out" card, #530). */
  centered?: boolean;
  testID?: string;
}

export function GameCard({
  eyebrow,
  title,
  lines = [],
  footnote,
  children,
  announceKey,
  centered = false,
  testID,
}: GameCardProps) {
  const titleRef = useFocusOnShow();
  // Read on both platforms (a live region works on Android only).
  const heading = eyebrow ? `${eyebrow}. ${title}` : title;
  useAnnouncement([heading, ...lines].join(' '), announceKey);
  const align = centered ? styles.centered : null;
  return (
    <View testID={testID} style={styles.card}>
      {eyebrow ? (
        // The title's label says it: screen readers skip it here.
        <Text
          style={[styles.eyebrow, align]}
          accessibilityElementsHidden
          importantForAccessibility="no">
          {displayCaps(eyebrow)}
        </Text>
      ) : null}
      <Text
        ref={titleRef}
        style={[styles.title, align]}
        accessibilityRole="header"
        {...(eyebrow ? { accessibilityLabel: heading } : {})}>
        {title}
      </Text>
      {lines.map((line, i) => (
        <Text key={i} style={[styles.line, align]}>
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
  eyebrow: {
    ...theme.type.section,
    color: theme.colors.problem,
  },
  title: {
    ...theme.type.title2,
    color: theme.colors.text,
  },
  centered: {
    textAlign: 'center',
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
