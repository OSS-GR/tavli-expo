/**
 * The board (wireframe 6). `id` is a local match id (`local-…`) or an
 * online game id (#255).
 *
 * - A local match comes from memory, or after an app restart from the
 *   save slot (`MatchScreen`).
 * - Any other id is an online game on the server (`OnlineMatchScreen`).
 *   Online games stay out of the save slot and History.
 *
 * An unknown id or a broken save shows "This game could not be opened."
 * Both screens sit at the same place in the tree, so the board keeps its
 * place (#185).
 *
 * When the match is over, the match-end screen replaces this one
 * (`router.replace`), so "back" does not return to a finished board.
 */
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { matchSessions } from '@/features/match/appSessions';
import { MatchScreen } from '@/features/match/MatchScreen';
import { MissingGame } from '@/features/match/MissingGame';
import {
  isLocalGameId,
  matchEndHref,
  parseIdParam,
  reviewHref,
  rulesHref,
} from '@/features/match/routes';
import { stopDevGame } from '@/features/online/devGame';
import { OnlineMatchScreen } from '@/features/online/OnlineMatchScreen';
import { gameTransportFor, onlinePlayerId } from '@/services';

/** Back to Home: pops to it, or opens it when the board was the first screen. */
function goHome() {
  router.dismissTo('/');
}

export default function GameRoute() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = parseIdParam(params.id);
  const focused = useIsFocused();
  // A dev game vs the bot (#255) stops when its board closes: nobody can
  // open it again. Other games go on, also when this board has no id.
  useEffect(
    () => () => {
      if (id !== null) stopDevGame(id);
    },
    [id],
  );

  if (id !== null && !isLocalGameId(id)) {
    return (
      <View style={styles.screen}>
        <OnlineMatchScreen
          gameId={id}
          transport={gameTransportFor(onlinePlayerId)}
          me={onlinePlayerId}
          paused={!focused}
          onExit={goHome}
          onSettings={() => router.push('/settings')}
          onRules={(variant, preset) => router.push(rulesHref(variant, preset))}
          onMatchOver={() => router.replace(matchEndHref(id))}
        />
      </View>
    );
  }

  const session = id === null ? null : matchSessions.get(id);
  if (session === null) return <MissingGame onHome={goHome} />;

  return (
    <View style={styles.screen}>
      <MatchScreen
        session={session}
        paused={!focused}
        onExit={() => {
          matchSessions.saveNow();
          goHome();
        }}
        onSettings={() => router.push('/settings')}
        // The rules of the game on the board (in Tavli, this game of the
        // rotation), in its rules version (#241).
        onRules={() => {
          const { state } = session.store.getState().flow.game;
          router.push(rulesHref(state.variant, state.rules.presetId));
        }}
        onMatchOver={() => router.replace(matchEndHref(session.id))}
        // The review of the game that just ended (#215); Back returns to the sheet.
        onReview={() => router.push(reviewHref(session.id))}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    paddingTop: rt.insets.top,
  },
}));
