/**
 * Match end (wireframe 9, restyled after the "Match end" wireframe in
 * #361): a brass hero card with who won the match (a trophy badge for a win
 * by a person), the final score and the match, one row per game in a card,
 * then Rematch (the main button), Review, Change settings and Home.
 *
 * It shows a finished match and never changes it. The route
 * (`app/game/[id]/match-end.tsx`) starts the rematch and navigates.
 *
 * An online match (#255) passes `online` instead of `setup`: its seats
 * and label. It has no Rematch and no Change settings.
 */
import { createRematch, type Match, type PerPlayer, type PlayerId } from '@tavli/engine';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { CardFrame, RowDivider } from '@/components/SectionCard';
import { Celebration } from '@/features/game/Celebration';
import { isHumanWin } from '@/features/game/gameFeedback';
import { winType, type WinType } from '@/features/game/turnNotices';
import type { Seat } from '@/features/game/seats';
import { useAnnouncement } from '@/features/game/useAnnouncement';

import { seatsFor } from './seats';
import { HUMAN_SIDE, type MatchSetup } from './setup';
import { matchLabel, timedOutBy, variantName } from './summary';

/** An online match (#255): who sits where, and what the match was. */
export interface OnlineMatchEnd {
  readonly seats: PerPlayer<Seat>;
  /** Your side. Only your win is celebrated. */
  readonly me: PlayerId;
  /** "Portes · online". */
  readonly label: string;
}

interface LocalMatchEnd {
  setup: MatchSetup;
  onRematch: () => void;
  onChangeSettings: () => void;
  online?: undefined;
}

interface OnlineEnd {
  online: OnlineMatchEnd;
  setup?: undefined;
  onRematch?: undefined;
  onChangeSettings?: undefined;
}

export type MatchEndScreenProps = (LocalMatchEnd | OnlineEnd) & {
  /** A finished match. */
  match: Match;
  /** "Review": the biggest mistakes of the last game (#215). */
  onReview?: () => void;
  onHome: () => void;
  /**
   * Names this match for this app run (`matchKey` of its game store, #216):
   * the result is read once, and a remount does not read it again. Without
   * it, every time the screen mounts.
   */
  announceKey?: string;
};

/**
 * The chip of a game row: Mono or Diplo. A Tavli backgammon (3 points) and
 * a per-checker win (Acey-Deucey American, #245) show only their points.
 */
function winChipKey(type: WinType): 'matchEnd.mono' | 'matchEnd.diplo' | null {
  switch (type) {
    case 'mono':
      return 'matchEnd.mono';
    case 'diplo':
      return 'matchEnd.diplo';
    case 'points':
    case 'perChecker':
      return null;
  }
}

export function MatchEndScreen({
  setup,
  online,
  match,
  onRematch,
  onReview,
  onChangeSettings,
  onHome,
  announceKey,
}: MatchEndScreenProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const seats = online !== undefined ? online.seats : seatsFor(setup, t);
  const name = (player: PlayerId) => seats[player].name;
  const winner = match.winner ?? 'white';
  // Like the win jingle (`matchWin`): only a win by a person is celebrated.
  const humans =
    online !== undefined ? [online.me] : setup.mode === 'bot' ? [HUMAN_SIDE] : undefined;
  const celebrate = isHumanWin(winner, humans);

  const title = seats[winner].you
    ? t('game.end.matchWinner_you')
    : t('game.end.matchWinner', { name: name(winner) });
  // Why the match ended, when it was not won on the board: a resign, or a
  // turn timer that ran out in the last game (#170). Resign match keeps the
  // score as it was (docs/rules/tavli-match.md, "Resigning"), so the screen
  // says who resigned the match (#181).
  const timedOut = timedOutBy(match);
  const reason =
    match.resignedBy !== null
      ? seats[match.resignedBy].you
        ? t('game.end.resignedMatch_you')
        : t('game.end.resignedMatch', { name: name(match.resignedBy) })
      : timedOut !== null
        ? seats[timedOut].you
          ? t('game.end.timeout_you')
          : t('game.end.timeout', { name: name(timedOut) })
        : null;
  const scoreLine = t('game.end.score', {
    white: name('white'),
    black: name('black'),
    whiteScore: match.score.white,
    blackScore: match.score.black,
  });
  const about = [
    online !== undefined ? online.label : matchLabel(setup, t),
    t('home.continue.target', { target: match.targetPoints }),
  ].join(' · ');

  // The rematch starter comes from the engine (owner rule: the last winner).
  const starter = createRematch(match).nextStarter;
  const rematchHint =
    online !== undefined
      ? null
      : starter === null
        ? t('matchEnd.rematchHintOpening')
        : seats[starter].you
          ? t('matchEnd.rematchHint_you')
          : t('matchEnd.rematchHint', { name: name(starter) });

  useAnnouncement(
    [title, reason, scoreLine].filter(Boolean).join(' '),
    announceKey === undefined ? undefined : `${announceKey}:matchEnd`,
  );

  // One text, so it reads "3 – 1"; the winner's number is brass.
  const sideScore = (player: PlayerId) => (
    <Text style={player === winner ? styles.winnerScore : undefined}>{match.score[player]}</Text>
  );
  const rematchLabel = t('game.end.rematch');

  return (
    <Screen testID="match-end-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <View testID="match-hero" style={styles.hero}>
          {celebrate ? (
            <Celebration
              testID="match-celebration"
              kind="match"
              // A win by a person gets the trophy badge (#361).
              icon={
                <View testID="match-trophy" style={styles.badge}>
                  <Icon name="trophy" size={TROPHY_SIZE} color={theme.colors.turnText} />
                </View>
              }
            />
          ) : null}
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {reason ? <Text style={styles.reason}>{reason}</Text> : null}
          <View
            testID="final-score"
            style={styles.scoreBox}
            accessible
            accessibilityLabel={t('matchEnd.finalScore', { score: scoreLine })}>
            <Text style={styles.bigScore}>
              {sideScore('white')}
              {' – '}
              {sideScore('black')}
            </Text>
            <View style={styles.scoreNames}>
              <Text style={styles.scoreName}>{name('white')}</Text>
              <Text style={styles.scoreName}>{name('black')}</Text>
            </View>
          </View>
          <View style={styles.aboutChip}>
            <Text style={styles.about}>{about}</Text>
          </View>
        </View>
        {match.games.length > 0 ? (
          <CardFrame testID="match-games">
            {match.games.map((record, i) => {
              // Each game names its variant (#109): "Game 2 · Plakoto".
              const game = t('game.round', { number: i + 1, game: variantName(record.variant, t) });
              // A game lost on time says so (#170): "Bot won on time".
              const onTime = record.reason === 'timeout';
              const result =
                record.winner === null
                  ? t('matchEnd.draw')
                  : seats[record.winner].you
                    ? t(onTime ? 'matchEnd.wonOnTime_you' : 'matchEnd.won_you')
                    : t(onTime ? 'matchEnd.wonOnTime' : 'matchEnd.won', {
                        name: name(record.winner),
                      });
              // Every game of an app match scores like the match rules (#241).
              const type =
                record.winner === null ? 'points' : winType(record, match.rules.scoring.method);
              const chipKey = winChipKey(type);
              const chip = chipKey === null ? null : t(chipKey);
              return (
                <View key={i}>
                  {i > 0 ? <RowDivider /> : null}
                  <View
                    testID={`match-game-${i + 1}`}
                    style={styles.row}
                    accessible
                    accessibilityLabel={[
                      game,
                      result,
                      chip,
                      t('matchEnd.pointsLabel', { count: record.points }),
                    ]
                      .filter(Boolean)
                      .join(', ')}>
                    <View style={styles.rowTexts}>
                      <Text style={styles.rowGame}>{game}</Text>
                      <Text style={styles.rowResult}>{result}</Text>
                    </View>
                    {chip ? (
                      <View style={styles.chip(type === 'diplo')}>
                        <Text style={styles.chipText(type === 'diplo')}>{chip}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.rowPoints}>
                      {t('matchEnd.points', { count: record.points })}
                    </Text>
                  </View>
                </View>
              );
            })}
          </CardFrame>
        ) : null}
        {/* Pushes the buttons down on a tall screen; with a large font all of it scrolls. */}
        <View style={styles.spacer} />
        <View style={styles.actions}>
          {onRematch && rematchHint !== null ? (
            <View style={styles.rematch}>
              <ActionButton
                testID="rematch-button"
                label={rematchLabel}
                // The hint sits under the button; screen readers hear both.
                accessibilityLabel={`${rematchLabel}, ${rematchHint}`}
                onPress={onRematch}
              />
              <Text
                style={styles.rematchHint}
                accessibilityElementsHidden
                importantForAccessibility="no">
                {rematchHint}
              </Text>
            </View>
          ) : null}
          {onReview || onChangeSettings ? (
            <View style={styles.pair}>
              {onReview ? (
                <ActionButton
                  testID="review-button"
                  label={t('game.end.review')}
                  kind="secondary"
                  grow
                  onPress={onReview}
                />
              ) : null}
              {onChangeSettings ? (
                <ActionButton
                  testID="change-settings-button"
                  label={t('game.end.changeSettings')}
                  kind="secondary"
                  grow
                  onPress={onChangeSettings}
                />
              ) : null}
            </View>
          ) : null}
          <ActionButton
            testID="end-home-button"
            label={t('game.end.home')}
            kind="secondary"
            onPress={onHome}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

/** The trophy in its round badge, with a brass ring (#361). */
const TROPHY_SIZE = 32;
const BADGE_RING = 8;
const BADGE = 64 + 2 * BADGE_RING;

const styles = StyleSheet.create((theme, rt) => ({
  content: {
    flexGrow: 1,
    gap: theme.space.lg,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.xl,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.lg),
  },
  hero: {
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.xl,
    borderRadius: theme.radii.xl + 4,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface,
    // Brass light from the top, fading into the card.
    backgroundImage: `radial-gradient(120% 90% at 50% 0%, ${theme.colors.accentWash} 0%, ${theme.colors.surface} 100%)`,
    boxShadow: '0px 12px 28px rgba(0, 0, 0, 0.4)',
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: BADGE_RING,
    borderColor: theme.colors.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundDeep,
  },
  title: {
    ...theme.type.title,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: theme.colors.text,
    textAlign: 'center',
  },
  reason: {
    ...theme.type.body,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  scoreBox: {
    alignItems: 'center',
  },
  bigScore: {
    ...theme.type.display,
    fontSize: 52,
    lineHeight: 60,
    fontWeight: '800',
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  winnerScore: {
    color: theme.colors.turnText,
  },
  scoreNames: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: theme.space.xxxl,
  },
  scoreName: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  aboutChip: {
    marginTop: theme.space.xs,
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xxs,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.separator,
    backgroundColor: theme.colors.backgroundDeep,
  },
  about: {
    ...theme.type.caption,
    fontWeight: '600',
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.touch.button,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.sm,
  },
  rowTexts: {
    flex: 1,
    gap: theme.space.xxs,
  },
  rowGame: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  rowResult: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  chip: (strong: boolean) => ({
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xxs,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: strong ? theme.colors.accent : theme.colors.separator,
    backgroundColor: strong ? theme.colors.accent : theme.colors.backgroundDeep,
  }),
  chipText: (strong: boolean) => ({
    ...theme.type.caption,
    fontWeight: '700',
    color: strong ? theme.colors.onAccent : theme.colors.textDim,
  }),
  rowPoints: {
    ...theme.type.bodyStrong,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'right',
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
  },
  spacer: {
    flexGrow: 1,
  },
  actions: {
    gap: theme.space.md,
  },
  rematch: {
    gap: theme.space.xs,
  },
  rematchHint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  pair: {
    flexDirection: 'row',
    gap: theme.space.md,
  },
}));
