/**
 * Match end (wireframe 9). The board route opens it with `router.replace`
 * when the match is over.
 *
 * - A local match is no longer in the save slot (`sessions.ts`), so it
 *   comes from memory. After an app restart it is gone and the screen shows
 *   "This game could not be opened." with Home.
 * - An online game (#255) comes from the server, with no Rematch.
 */
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { matchSessions } from '@/features/match/appSessions';
import { MatchEndScreen } from '@/features/match/MatchEndScreen';
import { MissingGame } from '@/features/match/MissingGame';
import {
  gameHref,
  isLocalGameId,
  newGameHref,
  parseIdParam,
  reviewHref,
} from '@/features/match/routes';
import { OnlineConnect } from '@/features/online/OnlineConnect';
import { OnlineMatchEnd } from '@/features/online/OnlineMatchEnd';

/** Back to Home: pops to it, or opens it when this was the first screen. */
function goHome() {
  router.dismissTo('/');
}

export default function MatchEndRoute() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = parseIdParam(params.id);
  if (id !== null && !isLocalGameId(id)) {
    return (
      <OnlineConnect gameId={id} onHome={goHome}>
        {({ transport, me }) => (
          <OnlineMatchEnd gameId={id} transport={transport} me={me} onHome={goHome} />
        )}
      </OnlineConnect>
    );
  }
  return <LocalMatchEnd id={id} />;
}

function LocalMatchEnd({ id }: { id: string | null }) {
  // Read once: Rematch starts a new match in the same session before this
  // screen goes away, and the screen must not change under the user.
  const [opened] = useState(() => {
    const session = id === null ? null : matchSessions.get(id);
    if (session === null) return null;
    const { flow, matchKey } = session.store.getState();
    return { session, match: flow.match, matchKey };
  });

  if (opened === null) return <MissingGame onHome={goHome} />;
  const { session, match, matchKey } = opened;
  // A match that is not over yet belongs on the board.
  if (match.status !== 'finished') return <Redirect href={gameHref(session.id)} />;

  return (
    <MatchEndScreen
      setup={session.setup}
      match={match}
      // The result is read once per app run, not again on a remount (#216).
      announceKey={matchKey}
      onRematch={() => {
        // The last winner starts (engine `createRematch`); it is saved as a new match.
        session.store.getState().rematch();
        router.replace(gameHref(session.id));
      }}
      // The review of the last game (#215); Back returns here.
      onReview={() => router.push(reviewHref(session.id))}
      onChangeSettings={() => {
        matchSessions.end(session.id);
        router.replace(newGameHref(session.setup.mode));
      }}
      onHome={() => {
        matchSessions.end(session.id);
        goHome();
      }}
    />
  );
}
