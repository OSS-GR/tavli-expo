/**
 * Game end (wireframe 8): a sheet over the final board. Who won, how
 * (Mono / Diplo chip), why, the match score, then Next game and Home.
 *
 * The result is read to screen readers when the sheet shows, and focus
 * moves to its title (#153). The game screen hides everything under the
 * sheet from screen readers. The sheet scrolls when a large font makes it
 * taller than the screen.
 */
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { MAX_SHEET_WIDTH } from '@/components/Sheet';
import { useFocusOnShow } from '@/features/accessibility/focus';

import { CELEBRATION_HEIGHT, Celebration } from './Celebration';
import { useAnnouncement } from './useAnnouncement';

export interface GameEndSheetProps {
  /** "You win the game!" */
  title: string;
  /** "Diplo · +2 points". */
  chip: string;
  /** Diplo (or a Tavli backgammon) gets a filled chip; mono and a per-checker win an outlined one. */
  strongChip: boolean;
  /** "Bot did not bear off any checker." or "Mono: Maria resigned the game." */
  reason: string | null;
  /** The game that comes next: "Next: game 3 · Fevga" (#109). */
  next?: string;
  /** "Match", over the score. */
  matchLabel: string;
  /** "You 2 – 0 Bot". */
  score: string;
  /** "First to 3 points". */
  target: string;
  /** A human won: show the celebration. */
  celebrate: boolean;
  /** Next game and Home. */
  children: ReactNode;
  /**
   * Names this game end for this app run (#216): the result is read once,
   * and a remount does not read it again. Without it, every time it opens.
   */
  announceKey?: string;
  testID?: string;
}

export function GameEndSheet({
  title,
  chip,
  strongChip,
  reason,
  next,
  matchLabel,
  score,
  target,
  celebrate,
  children,
  announceKey,
  testID,
}: GameEndSheetProps) {
  const titleRef = useFocusOnShow();
  useAnnouncement([title, chip, reason, score, next].filter(Boolean).join(' '), announceKey);
  return (
    <View style={styles.root}>
      <View style={styles.scrim} />
      <View testID={testID} style={styles.sheet} accessibilityViewIsModal>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {/* Room for the celebration, which is drawn over the sheet (below). */}
          {celebrate ? <View style={styles.celebrationSpace} /> : null}
          <Text ref={titleRef} style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <View testID="game-end-chip" style={styles.chip(strongChip)}>
            <Text style={styles.chipText(strongChip)}>{chip}</Text>
          </View>
          {reason ? <Text style={styles.reason}>{reason}</Text> : null}
          <View style={styles.matchBox} accessible>
            <View>
              <Text style={styles.matchLabel}>{matchLabel}</Text>
              <Text style={styles.matchScore}>{score}</Text>
            </View>
            <Text style={styles.matchTarget}>{target}</Text>
          </View>
          {next ? (
            <Text testID="next-game-label" style={styles.next}>
              {next}
            </Text>
          ) : null}
          <View style={styles.actions}>{children}</View>
        </ScrollView>
        {/* Outside the scroll view, so nothing clips the confetti: it flies over the board. */}
        {celebrate ? (
          <View style={styles.celebration} pointerEvents="none">
            <Celebration testID="game-celebration" kind="game" />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    // In landscape (#185) the sheet keeps a readable width in the middle.
    alignItems: 'center',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.backgroundDeep,
    opacity: 0.5,
  },
  sheet: {
    // Never taller than the screen: the content scrolls instead.
    flexShrink: 1,
    maxHeight: '100%',
    width: '100%',
    maxWidth: MAX_SHEET_WIDTH,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: theme.colors.border,
  },
  scroll: {
    flexGrow: 0,
  },
  celebrationSpace: {
    height: CELEBRATION_HEIGHT.game,
  },
  celebration: {
    position: 'absolute',
    top: theme.space.lg,
    left: 0,
    right: 0,
  },
  content: {
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.xl,
    paddingTop: theme.space.lg,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.lg),
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
    textAlign: 'center',
  },
  chip: (strong: boolean) => ({
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radii.pill,
    borderWidth: 2,
    borderColor: theme.colors.accent,
    backgroundColor: strong ? theme.colors.accent : 'transparent',
  }),
  chipText: (strong: boolean) => ({
    ...theme.type.bodyStrong,
    color: strong ? theme.colors.onAccent : theme.colors.text,
  }),
  reason: {
    ...theme.type.body,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  matchBox: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: theme.space.sm,
    padding: theme.space.md,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.background,
  },
  matchLabel: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  matchScore: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  matchTarget: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  next: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: theme.space.xs,
    paddingTop: theme.space.sm,
  },
}));
