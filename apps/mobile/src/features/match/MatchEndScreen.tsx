/**
 * Match end (wireframe 9): who won the match, the final score, one row per
 * game, then Rematch, Change settings and Home.
 *
 * It shows a finished match and never changes it. The route
 * (`app/game/[id]/match-end.tsx`) starts the rematch and navigates.
 */
import { createRematch, type Match, type PlayerId } from '@tavli/engine';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Celebration } from '@/features/game/Celebration';
import { isHumanWin } from '@/features/game/gameFeedback';
import { winType } from '@/features/game/turnNotices';
import { useAnnouncement } from '@/features/game/useAnnouncement';

import { seatsFor } from './seats';
import { HUMAN_SIDE, type MatchSetup } from './setup';
import { matchLabel, variantName } from './summary';

export interface MatchEndScreenProps {
  setup: MatchSetup;
  /** A finished match. */
  match: Match;
  onRematch: () => void;
  onChangeSettings: () => void;
  onHome: () => void;
}

export function MatchEndScreen({
  setup,
  match,
  onRematch,
  onChangeSettings,
  onHome,
}: MatchEndScreenProps) {
  const { t } = useTranslation();
  const seats = seatsFor(setup, t);
  const name = (player: PlayerId) => seats[player].name;
  const winner = match.winner ?? 'white';
  // Like the win jingle (`matchWin`): only a win by a person is celebrated.
  const celebrate = isHumanWin(winner, setup.mode === 'bot' ? [HUMAN_SIDE] : undefined);

  const title = seats[winner].you
    ? t('game.end.matchWinner_you')
    : t('game.end.matchWinner', { name: name(winner) });
  // Resign match keeps the score as it was (docs/rules/tavli-match.md,
  // "Resigning"), so the screen says why the match ended (#181).
  const resigned =
    match.resignedBy === null
      ? null
      : seats[match.resignedBy].you
        ? t('game.end.resignedMatch_you')
        : t('game.end.resignedMatch', { name: name(match.resignedBy) });
  const scoreLine = t('game.end.score', {
    white: name('white'),
    black: name('black'),
    whiteScore: match.score.white,
    blackScore: match.score.black,
  });
  const about = [
    matchLabel(setup, t),
    t('home.continue.target', { target: match.targetPoints }),
  ].join(' · ');

  // The rematch starter comes from the engine (owner rule: the last winner).
  const starter = createRematch(match).nextStarter;
  const rematchHint =
    starter === null
      ? t('matchEnd.rematchHintOpening')
      : seats[starter].you
        ? t('matchEnd.rematchHint_you')
        : t('matchEnd.rematchHint', { name: name(starter) });

  useAnnouncement([title, resigned, scoreLine].filter(Boolean).join(' '));

  return (
    <View testID="match-end-screen" style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {celebrate ? <Celebration testID="match-celebration" kind="match" /> : null}
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {resigned ? <Text style={styles.about}>{resigned}</Text> : null}
        <View
          testID="final-score"
          style={styles.scoreBox}
          accessible
          accessibilityLabel={t('matchEnd.finalScore', { score: scoreLine })}>
          <Text style={styles.bigScore}>{`${match.score.white} – ${match.score.black}`}</Text>
          <View style={styles.scoreNames}>
            <Text style={styles.scoreName}>{name('white')}</Text>
            <Text style={styles.scoreName}>{name('black')}</Text>
          </View>
        </View>
        <Text style={styles.about}>{about}</Text>
        {match.games.length > 0 ? (
          <View testID="match-games" style={styles.games}>
            {match.games.map((record, i) => {
              // Each game names its variant (#109): "Game 2 · Plakoto".
              const game = t('game.round', { number: i + 1, game: variantName(record.variant, t) });
              const result =
                record.winner === null
                  ? t('matchEnd.draw')
                  : seats[record.winner].you
                    ? t('matchEnd.won_you')
                    : t('matchEnd.won', { name: name(record.winner) });
              const type = record.winner === null ? 'points' : winType(record);
              const chip = type === 'points' ? null : t(`matchEnd.${type}`);
              return (
                <View
                  key={i}
                  testID={`match-game-${i + 1}`}
                  style={[styles.row, i > 0 && styles.rowLine]}
                  accessible
                  accessibilityLabel={[
                    game,
                    result,
                    chip,
                    t('matchEnd.pointsLabel', { count: record.points }),
                  ]
                    .filter(Boolean)
                    .join(', ')}>
                  <Text style={styles.rowGame}>{game}</Text>
                  <Text style={styles.rowResult}>{result}</Text>
                  {chip ? (
                    <View style={styles.chip(type === 'diplo')}>
                      <Text style={styles.chipText(type === 'diplo')}>{chip}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.rowPoints}>
                    {t('matchEnd.points', { count: record.points })}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.actions}>
        <ActionButton
          testID="rematch-button"
          label={t('game.end.rematch')}
          subtitle={rematchHint}
          onPress={onRematch}
        />
        <ActionButton
          testID="change-settings-button"
          label={t('game.end.changeSettings')}
          kind="secondary"
          onPress={onChangeSettings}
        />
        <ActionButton
          testID="end-home-button"
          label={t('game.end.home')}
          kind="text"
          onPress={onHome}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: rt.insets.top,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.sm),
  },
  content: {
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.lg,
  },
  title: {
    ...theme.type.title,
    fontSize: 26,
    lineHeight: 32,
    color: theme.colors.text,
    textAlign: 'center',
  },
  scoreBox: {
    alignItems: 'center',
  },
  bigScore: {
    ...theme.type.display,
    fontSize: 56,
    lineHeight: 64,
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
  },
  scoreNames: {
    flexDirection: 'row',
    gap: theme.space.xxxl,
  },
  scoreName: {
    ...theme.type.bodyStrong,
    color: theme.colors.textDim,
  },
  about: {
    ...theme.type.body,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  games: {
    alignSelf: 'stretch',
    marginTop: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    minHeight: theme.touch.minTarget,
    paddingVertical: theme.space.sm,
  },
  rowLine: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.separator,
  },
  rowGame: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  rowResult: {
    ...theme.type.bodyStrong,
    flex: 1,
    color: theme.colors.text,
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
    ...theme.type.caption,
    fontWeight: '600',
    color: strong ? theme.colors.onAccent : theme.colors.text,
  }),
  rowPoints: {
    ...theme.type.bodyStrong,
    minWidth: 28,
    textAlign: 'right',
    color: theme.colors.text,
  },
  actions: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
  },
}));
