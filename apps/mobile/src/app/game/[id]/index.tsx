/**
 * The board of a local match (wireframe 6). `id` is a local match id
 * (`local-…`). After an app restart it comes from the save slot. An
 * unknown id or a broken save shows "This game could not be opened."
 *
 * When the match is over, the match-end screen replaces this one
 * (`router.replace`), so "back" does not return to a finished board.
 */
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { matchSessions } from '@/features/match/appSessions';
import { MatchScreen } from '@/features/match/MatchScreen';
import { MissingGame } from '@/features/match/MissingGame';
import { matchEndHref, parseIdParam, rulesHref } from '@/features/match/routes';

/** Back to Home: pops to it, or opens it when the board was the first screen. */
function goHome() {
  router.dismissTo('/');
}

export default function GameRoute() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = parseIdParam(params.id);
  const focused = useIsFocused();
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
        // The rules of the game on the board (in Tavli, this game of the rotation).
        onRules={() => router.push(rulesHref(session.store.getState().flow.game.state.variant))}
        onMatchOver={() => router.replace(matchEndHref(session.id))}
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
