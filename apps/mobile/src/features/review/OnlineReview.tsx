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
 * dialog: OK goes back, and Try again loads it again when another try can
 * help (not for a refusal that comes back the same each time). Nothing is
 * saved, and the log line names only the error code, never the game.
 */
import type { Analyzer } from '@tavli/bot';
import { isGameTransportErrorData, type GameTransport, type MatchGame } from '@tavli/contracts';
import { replay, type MatchFlow, type PlayerId } from '@tavli/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  | { readonly kind: 'failed'; readonly canRetry: boolean }
  | {
      readonly kind: 'ready';
      readonly flow: MatchFlow;
      readonly me: PlayerId;
      readonly game: MatchGame;
    };

const LOADING: Loaded = { kind: 'loading' };

/** Refusals that come back the same on every try: no Try again for them. */
const LASTING_CODES: ReadonlySet<string> = new Set([
  'ILLEGAL_ACTION',
  'BAD_REQUEST',
  'NOT_FOUND',
  'NOT_A_PLAYER',
]);

/** The error's code for the log (no id or text), or `unknown`. */
function errorCode(error: unknown): string {
  return isGameTransportErrorData(error) ? error.code : 'unknown';
}

/** One load: the request and what came back. A new request shows LOADING. */
interface Load {
  readonly request: object;
  readonly result: Loaded;
}

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
  // Try again counts up, so the load runs again.
  const [attempt, setAttempt] = useState(0);
  // A new game, transport or try is a new request: until its answer the
  // screen shows LOADING, never the last game's review or problem.
  const request = useMemo(
    () => ({ transport, gameId, gameNumber, attempt }),
    [transport, gameId, gameNumber, attempt],
  );
  const [load, setLoad] = useState<Load | null>(null);
  const loaded = load !== null && load.request === request ? load.result : LOADING;

  useEffect(() => {
    let active = true;
    const done = (result: Loaded) => {
      if (active) setLoad({ request, result });
    };
    request.transport
      .gameRecord({ gameId: request.gameId, gameNumber: request.gameNumber })
      .then((record) => {
        const flow = replayed(record.log);
        done(
          flow === null
            ? { kind: 'failed', canRetry: false }
            : { kind: 'ready', flow, me: record.side, game: record.choice },
        );
      })
      .catch((error: unknown) => {
        const code = errorCode(error);
        // The code only: the error's text may hold the game id.
        console.warn('could not load the game to review', code);
        done({ kind: 'failed', canRetry: !LASTING_CODES.has(code) });
      });
    return () => {
      active = false;
    };
  }, [request]);

  // Sent once per game reviewed: not again when the load runs again (a new
  // transport or Try again), but again for another game.
  const sentFor = useRef<string | null>(null);
  const readyKey = loaded.kind === 'ready' ? `${gameId}:${gameNumber}` : null;
  const readyGame = loaded.kind === 'ready' ? loaded.game : null;
  useEffect(() => {
    if (readyKey === null || readyGame === null || sentFor.current === readyKey) return;
    sentFor.current = readyKey;
    sendReviewOpened(readyGame, true);
  }, [readyKey, readyGame]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

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
        {...(loaded.kind === 'failed' && loaded.canRetry
          ? { retry: { label: t('review.problem.retry'), onPress: retry } }
          : {})}
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
