/**
 * Match end (wireframe 9, restyled in the Figma polish pass, #515): who
 * won the match, a 52 pt final score with each side's checker, a short
 * list of the games, then Rematch (the one brass button), Review and Home
 * side by side, and Change settings as a text button.
 *
 * - A win by a person shows the trophy medallion (`EmptyMedallion`,
 *   `small`) inside the `Celebration` confetti. With Reduce motion the
 *   medallion shows with no confetti. Nobody's win shows no medallion.
 * - Each game row: the game, the winner's checker, the winner (with Mono
 *   or Diplo) and the points; your points are brass.
 *
 * It shows a finished match and never changes it. The route
 * (`app/game/[id]/match-end.tsx`) starts the rematch and navigates.
 *
 * An online match (#255) passes `online` instead of `setup`: its seats
 * and label. It has no Rematch and no Change settings.
 */
import { createRematch, opponent, type Match, type PerPlayer, type PlayerId } from '@tavli/engine';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { sideWood } from '@/components/avatar';
import { CheckerAvatar } from '@/components/CheckerAvatar';
import { EmptyMedallion } from '@/components/EmptyMedallion';
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
  /** Report or block the other player (#435). Without it there is no button. */
  readonly onReportOrBlock?: () => void;
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
 * The word after a game row's winner: Mono or Diplo. A Tavli backgammon
 * (3 points) and a per-checker win (Acey-Deucey American, #245) show only
 * their points.
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
  // One game in the whole match: the line above names it, so a row says
  // only "Game 2". A Tavli rotation names each game: "Game 2 · Plakoto".
  const oneGame = match.rules.match.rotation.length === 1;

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
    <Text style={styles.sideScore(player === winner)}>{match.score[player]}</Text>
  );
  const side = (player: PlayerId) => (
    <View style={styles.side}>
      <CheckerAvatar wood={sideWood(player)} size={SCORE_CHECKER} name={null} />
      <Text style={styles.sideName(player === winner)}>{name(player)}</Text>
    </View>
  );
  const rematchLabel = t('game.end.rematch');
  const home = (
    <ActionButton
      testID="end-home-button"
      label={t('game.end.home')}
      icon="house"
      kind="secondary"
      grow
      onPress={onHome}
    />
  );

  return (
    <Screen testID="match-end-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <View testID="match-hero" style={styles.hero}>
          {celebrate ? (
            <Celebration
              testID="match-celebration"
              kind="match"
              // A win by a person gets the trophy medallion (#361, #515).
              icon={<EmptyMedallion testID="match-trophy" icon="trophy" size="small" />}
            />
          ) : null}
          <View style={styles.titles}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.about}>{about}</Text>
            {reason ? <Text style={styles.reason}>{reason}</Text> : null}
          </View>
          <View
            testID="final-score"
            style={styles.scoreRow}
            accessible
            accessibilityLabel={t('matchEnd.finalScore', { score: scoreLine })}>
            {side('white')}
            <Text style={styles.bigScore}>
              {sideScore('white')}
              <Text style={styles.dash}>{' – '}</Text>
              {sideScore('black')}
            </Text>
            {side('black')}
          </View>
        </View>
        {match.games.length > 0 ? (
          <CardFrame testID="match-games">
            {match.games.map((record, i) => {
              // Each game names its variant (#109): "Game 2 · Plakoto".
              const game = t('game.round', { number: i + 1, game: variantName(record.variant, t) });
              const shortGame = oneGame ? t('matchEnd.game', { number: i + 1 }) : game;
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
              const yours = record.winner !== null && seats[record.winner].you;
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
                    <Text style={styles.rowGame}>{shortGame}</Text>
                    {record.winner === null ? (
                      <View style={styles.noChecker} />
                    ) : (
                      <CheckerAvatar
                        wood={sideWood(record.winner)}
                        size={ROW_CHECKER}
                        name={null}
                      />
                    )}
                    <Text style={styles.rowResult}>
                      {result}
                      {chip ? <Text style={styles.rowChip}>{` · ${chip}`}</Text> : null}
                    </Text>
                    <Text style={styles.rowPoints(yours)}>
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
                icon="rotateCcw"
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
          {onReview ? (
            <View style={styles.pair}>
              <ActionButton
                testID="review-button"
                label={t('game.end.review')}
                icon="chart"
                kind="secondary"
                grow
                onPress={onReview}
              />
              {home}
            </View>
          ) : (
            home
          )}
          {onChangeSettings ? (
            <ActionButton
              testID="change-settings-button"
              label={t('game.end.changeSettings')}
              kind="text"
              onPress={onChangeSettings}
            />
          ) : null}
          {online?.onReportOrBlock ? (
            <ActionButton
              testID="end-report-block"
              label={t('safety.action')}
              accessibilityLabel={t('safety.actionLabel', { name: name(opponent(online.me)) })}
              kind="text"
              onPress={online.onReportOrBlock}
            />
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

/** The checker beside each side's score (Figma: 30 pt; the nearest avatar size). */
const SCORE_CHECKER = 32;
/** The winner's checker in a game row. */
const ROW_CHECKER = 18;

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
    gap: theme.space.lg,
  },
  titles: {
    alignItems: 'center',
    gap: theme.space.xxs,
  },
  title: {
    ...theme.type.title1,
    color: theme.colors.text,
    textAlign: 'center',
  },
  about: {
    ...theme.type.callout,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  reason: {
    ...theme.type.callout,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.lg,
  },
  side: {
    alignItems: 'center',
    gap: theme.space.xs,
    flexShrink: 1,
  },
  sideName: (strong: boolean) => ({
    ...theme.type.footnote,
    color: strong ? theme.colors.text : theme.colors.textDim,
    textAlign: 'center',
  }),
  bigScore: {
    ...theme.type.numeral,
    fontSize: 52,
    lineHeight: 60,
    textAlign: 'center',
  },
  sideScore: (winner: boolean) => ({
    color: winner ? theme.colors.turnText : theme.colors.textDim,
  }),
  dash: {
    ...theme.type.title1,
    color: theme.colors.textDim,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.touch.minTarget,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.sm,
  },
  rowGame: {
    ...theme.type.footnote,
    minWidth: 56,
    maxWidth: '40%',
    color: theme.colors.textDim,
  },
  noChecker: {
    width: ROW_CHECKER,
  },
  rowResult: {
    ...theme.type.callout,
    flex: 1,
    color: theme.colors.text,
  },
  rowChip: {
    color: theme.colors.textDim,
  },
  rowPoints: (yours: boolean) => ({
    ...theme.type.numeral,
    fontSize: 17,
    lineHeight: 22,
    minWidth: 28,
    textAlign: 'right',
    color: yours ? theme.colors.turnText : theme.colors.textDim,
  }),
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
