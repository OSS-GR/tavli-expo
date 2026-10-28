/**
 * Match end (wireframe 9): who won the match, the final score, one row per
 * game, then Rematch, Change settings and Home.
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
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
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

  return (
    <View testID="match-end-screen" style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {celebrate ? <Celebration testID="match-celebration" kind="match" /> : null}
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {reason ? <Text style={styles.about}>{reason}</Text> : null}
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
        {onRematch && rematchHint !== null ? (
          <ActionButton
            testID="rematch-button"
            label={t('game.end.rematch')}
            subtitle={rematchHint}
            onPress={onRematch}
          />
        ) : null}
        {onReview ? (
          <ActionButton
            testID="review-button"
            label={t('game.end.review')}
            kind="secondary"
            onPress={onReview}
          />
        ) : null}
        {onChangeSettings ? (
          <ActionButton
            testID="change-settings-button"
            label={t('game.end.changeSettings')}
            kind="secondary"
            onPress={onChangeSettings}
          />
        ) : null}
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
