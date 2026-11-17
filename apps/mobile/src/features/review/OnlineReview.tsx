/**
 * The game review of an online game (#604). The server keeps the game,
 * so the screen asks it for the record of one game of the match
 * (`GameTransport.gameRecord`): the match log up to the end of that game.
 * It replays the log with the engine and shows the same `ReviewScreen` as
 * a local match, with only your turns. The server gives a record only for
 * a game that is over, so the review never helps during play.
 *
 * While the record loads, a spinner with "Loading the game…". A failed
 * load (no network, an old server, a game not over) shows a problem
 * dialog: Try again loads it again, OK goes back. Nothing is saved, and
 * the log line names no game.
 */
import type { Analyzer } from '@tavli/bot';
import type { GameTransport, MatchGame } from '@tavli/contracts';
import { replay, type MatchFlow, type PlayerId } from '@tavli/engine';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ProblemDialog } from '@/components/Problem';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';

import { sendReviewOpened } from './reviewAnalytics';
import { ReviewScreen } from './ReviewScreen';

export interface OnlineReviewProps {
  gameId: string;
  /** The game of the match to review, from 1. */
  gameNumber: number;
  transport: GameTransport;
  onBack: () => void;
  /** For tests: another Analyzer. */
  analyzer?: Analyzer;
}

type Loaded =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | {
      readonly kind: 'ready';
      readonly flow: MatchFlow;
      readonly me: PlayerId;
      readonly game: MatchGame;
    };

const LOADING: Loaded = { kind: 'loading' };

/** The record's game as a match flow, or `null` when it is not a game that is over. */
function replayed(log: Parameters<typeof replay>[0]): MatchFlow | null {
  const flow = replay(log);
  const over = flow.game.phase === 'game-over' || flow.match.status === 'finished';
  return over ? flow : null;
}

export function OnlineReview({
  gameId,
  gameNumber,
  transport,
  onBack,
  analyzer,
}: OnlineReviewProps) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded>(LOADING);
  // Try again counts up, so the load runs again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    transport
      .gameRecord({ gameId, gameNumber })
      .then((record) => {
        if (!active) return;
        const flow = replayed(record.log);
        setLoaded(
          flow === null
            ? { kind: 'failed' }
            : { kind: 'ready', flow, me: record.side, game: record.choice },
        );
      })
      .catch(() => {
        // A fixed text only: the error may hold the game id.
        console.warn('could not load the game to review');
        if (active) setLoaded({ kind: 'failed' });
      });
    return () => {
      active = false;
    };
  }, [transport, gameId, gameNumber, attempt]);

  // Sent once the record is in, and not again when the load runs again
  // (a new transport): the game stays the same.
  const readyGame = loaded.kind === 'ready' ? loaded.game : null;
  useEffect(() => {
    if (readyGame !== null) sendReviewOpened(readyGame, true);
  }, [readyGame]);

  const retry = useCallback(() => {
    setLoaded(LOADING);
    setAttempt((n) => n + 1);
  }, []);

  const online = useMemo(
    () => (loaded.kind === 'ready' ? { me: loaded.me, game: loaded.game } : null),
    [loaded],
  );

  if (loaded.kind === 'ready' && online !== null) {
    return (
      <ReviewScreen
        online={online}
        flow={loaded.flow}
        onBack={onBack}
        {...(analyzer ? { analyzer } : {})}
      />
    );
  }
  return (
    <Screen>
      <ScreenHeader
        title={t('review.title')}
        onBack={onBack}
        backLabel={t('common.back')}
        testID="review-back"
      />
      {loaded.kind === 'loading' ? (
        <View testID="review-loading" style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.text}>{t('review.loading')}</Text>
        </View>
      ) : null}
      <ProblemDialog
        testID="review-problem"
        problem={
          loaded.kind === 'failed'
            ? { title: t('review.problem.title'), text: t('review.problem.text') }
            : null
        }
        okLabel={t('problem.ok')}
        onOk={onBack}
        retry={{ label: t('review.problem.retry'), onPress: retry }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create((theme) => ({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.sm,
  },
  text: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
}));
