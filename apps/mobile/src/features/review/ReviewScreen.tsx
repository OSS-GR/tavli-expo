/**
 * The game review (#215): the biggest mistakes of the game that just
 * ended, biggest first (at most three). Each one shows the position before
 * the turn with its dice, what was played, the best turn and how bad the
 * mistake was. No mistake: "Well played!". A switch at the foot of each
 * card picks the turn the board marks, the way the Hint does (#230): the
 * best turn (default) or the played one, both on the position before the
 * turn.
 *
 * The route (`app/game/[id]/review.tsx`) opens it from the game-end sheet
 * and the match-end screen. It reads the game from the match log in
 * memory (`review.ts`); nothing is saved.
 *
 * Screen readers: each mistake is one element with the full text; the
 * board and the dice in it are hidden from them. The switch is hidden
 * too: it only changes the marks on that hidden board, and the card's
 * label already reads both turns. The result is read when the review is
 * done.
 */
import type { Analyzer } from '@tavli/bot';
import { diceMoves, type MatchFlow, type PlayerId } from '@tavli/engine';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { asodioMarks } from '@/features/board/asodio';
import { boardLayout, useBoardTheme, useHomeBoardSide } from '@/features/board/BoardCanvas';
import type { BoardView } from '@/features/board/boardModel';
import { DiceRow } from '@/features/board/DiceRow';
import { StaticBoard } from '@/features/board/StaticBoard';
import { diceView } from '@/features/game/gameStore';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import { seatsFor } from '@/features/match/seats';
import { HUMAN_SIDE, type MatchSetup } from '@/features/match/setup';
import { currentGameNumber, variantName } from '@/features/match/summary';
import { analyzer as appAnalyzer } from '@/services';

import type { Mistake } from './review';
import { mistakeText } from './reviewText';
import { useGameReview } from './useGameReview';

export interface ReviewScreenProps {
  setup: MatchSetup;
  /** The match flow; its game is the one that just ended. */
  flow: MatchFlow;
  /** For tests: another Analyzer. */
  analyzer?: Analyzer;
}

const BOTH_SIDES: readonly PlayerId[] = ['white', 'black'];
/** Which turn a card's board marks. */
type ShownTurn = 'played' | 'best';
/** The dice under each small board. */
const REVIEW_DIE_SIZE = 32;

export function ReviewScreen({ setup, flow, analyzer = appAnalyzer }: ReviewScreenProps) {
  const { t } = useTranslation();
  const vsBot = setup.mode === 'bot';
  // Vs the bot only the person's turns count; in pass-and-play both players'.
  const players = useMemo(() => (vsBot ? [HUMAN_SIDE] : BOTH_SIDES), [vsBot]);
  const review = useGameReview(flow, players, analyzer, setup.game);
  const seats = seatsFor(setup, t);

  const game = t('game.round', {
    number: currentGameNumber(flow),
    game: variantName(flow.game.state.variant, t),
  });
  let status: string | null = null;
  if (review.kind === 'failed') status = t('review.failed');
  else if (review.kind === 'done') {
    status =
      review.graded === 0
        ? t('review.nothing')
        : review.mistakes.length === 0
          ? t('review.wellPlayed')
          : vsBot
            ? t('review.intro_you')
            : t('review.intro');
  }
  useAnnouncement(status);

  return (
    <ScrollView testID="review-screen" style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">
        {game}
      </Text>
      {review.kind === 'busy' ? (
        <View testID="review-busy" style={styles.busy}>
          <ActivityIndicator />
          <Text style={styles.status}>{t('review.busy')}</Text>
        </View>
      ) : (
        <Text testID="review-status" style={styles.status}>
          {status}
        </Text>
      )}
      {review.kind === 'done'
        ? review.mistakes.map((mistake, i) => (
            <MistakeCard
              key={i}
              testID={`review-mistake-${i + 1}`}
              mistake={mistake}
              name={vsBot ? null : seats[mistake.turn.player].name}
            />
          ))
        : null}
      {review.kind === 'done' && review.mistakes.length > 0 ? (
        <Text style={styles.note}>{t('review.note')}</Text>
      ) : null}
    </ScrollView>
  );
}

interface MistakeCardProps {
  mistake: Mistake;
  /** The player's name in pass-and-play; `null` vs the bot ("You played"). */
  name: string | null;
  testID: string;
}

function MistakeCard({ mistake, name, testID }: MistakeCardProps) {
  const { t } = useTranslation();
  const theme = useBoardTheme();
  const homeSide = useHomeBoardSide();
  const [shown, setShown] = useState<ShownTurn>('best');
  const text = mistakeText(t, mistake, name);
  const { state } = mistake;
  const dice = state.dice ?? mistake.turn.dice;
  // The player who played sits at the bottom, like on their own turn.
  const view: BoardView = {
    viewer: mistake.turn.player,
    direction: state.rules.movement.direction,
  };
  // The board as on a table: wide and low, so it fits in a card.
  const aspectRatio = boardLayout(theme, 'classic', homeSide).aspectRatio;
  const strong = mistake.band === 'big';
  // Both turns start from the board before the turn, and both are the mover's.
  const marked = shown === 'best' ? mistake.best : mistake.turn;
  const options: { value: ShownTurn; label: string }[] = [
    {
      value: 'played',
      label: name === null ? t('review.show.played_you') : t('review.show.played', { name }),
    },
    { value: 'best', label: t('review.show.best') },
  ];
  return (
    <View style={styles.card}>
      {/* One element for screen readers, with the full text. */}
      <View testID={testID} style={styles.cardBody} accessible accessibilityLabel={text.label}>
        <View style={styles.cardHead}>
          <View style={styles.chip(strong)}>
            <Text style={styles.chipText(strong)}>{text.band}</Text>
          </View>
          <Text style={styles.turn}>{text.turn}</Text>
        </View>
        {/* The picture only: the card's label says it all. */}
        <View
          collapsable={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={styles.pictureRow}>
          <View style={styles.picture(aspectRatio)}>
            <StaticBoard
              board={state.board}
              view={view}
              marks={asodioMarks(state.board, state.rules, view)}
              layout="classic"
              turn={{ mover: mistake.turn.player, moves: marked.moves }}
              testID={`${testID}-board`}
            />
          </View>
          <View style={styles.dice}>
            <DiceRow
              theme={theme}
              dice={diceView(dice, diceMoves(dice))}
              rollKey={null}
              size={REVIEW_DIE_SIZE}
              testID={`${testID}-dice`}
            />
          </View>
        </View>
        <Text testID={`${testID}-played`} style={styles.line(shown === 'played')}>
          {text.played}
        </Text>
        <Text testID={`${testID}-best`} style={styles.line(shown === 'best')}>
          {text.best}
        </Text>
      </View>
      {/*
        Which turn the board marks. Hidden from screen readers like the
        board: it changes nothing they can perceive.
      */}
      <View
        testID={`${testID}-switch`}
        collapsable={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={styles.switch}>
        {options.map((option) => {
          const selected = option.value === shown;
          return (
            <Pressable
              key={option.value}
              testID={`${testID}-show-${option.value}`}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              onPress={() => setShown(option.value)}
              style={({ pressed }) => [styles.segment(selected), pressed && styles.pressed]}>
              <Text style={styles.segmentLabel(selected)}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.lg,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.lg),
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  status: {
    ...theme.type.body,
    flexShrink: 1,
    color: theme.colors.text,
  },
  card: {
    gap: theme.space.md,
    padding: theme.space.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  cardBody: {
    gap: theme.space.sm,
  },
  cardHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  chip: (strong: boolean) => ({
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xxs,
    borderRadius: theme.radii.pill,
    borderWidth: 2,
    borderColor: theme.colors.accent,
    backgroundColor: strong ? theme.colors.accent : 'transparent',
  }),
  chipText: (strong: boolean) => ({
    ...theme.type.bodyStrong,
    color: strong ? theme.colors.onAccent : theme.colors.text,
  }),
  turn: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  pictureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  picture: (aspectRatio: number) => ({
    flex: 1,
    aspectRatio,
  }),
  dice: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The line of the turn on the board is bold; the other one is regular.
  line: (selected: boolean) => ({
    ...(selected ? theme.type.bodyStrong : theme.type.body),
    color: theme.colors.text,
  }),
  // The buttons share a row; at a large font the second one wraps to a row
  // of its own, and a long label wraps inside its button.
  switch: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.xs,
    padding: theme.space.xs,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  segment: (selected: boolean) => ({
    flexGrow: 1,
    flexShrink: 1,
    minHeight: theme.touch.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radii.md,
    borderWidth: 2,
    borderColor: selected ? theme.colors.accent : 'transparent',
    backgroundColor: selected ? theme.colors.surfaceSelected : 'transparent',
  }),
  pressed: {
    opacity: 0.7,
  },
  // `textDim` on `surface` keeps 4.5:1 (checked in `packages/ui` for every app theme).
  segmentLabel: (selected: boolean) => ({
    ...(selected ? theme.type.bodyStrong : theme.type.body),
    textAlign: 'center',
    color: selected ? theme.colors.text : theme.colors.textDim,
  }),
  note: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
}));
