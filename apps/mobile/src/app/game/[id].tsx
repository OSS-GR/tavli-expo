/**
 * The board of a local match (wireframe 6). `id` is a local match id
 * (`local-…`). An unknown id shows "This game could not be opened."
 */
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { GameCard } from '@/features/game/GameCard';
import { matchSessions } from '@/features/match/appSessions';
import { MatchScreen } from '@/features/match/MatchScreen';
import { newGameHref, parseIdParam, rulesHref } from '@/features/match/routes';

/** Back to Home: pops to it, or opens it when the board was the first screen. */
function goHome() {
  router.dismissTo('/');
}

export default function GameRoute() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = parseIdParam(params.id);
  const focused = useIsFocused();
  const session = id === null ? null : matchSessions.get(id);

  if (session === null) {
    return (
      <View style={styles.screen}>
        <GameCard testID="game-missing" title={t('game.missing.title')}>
          <ActionButton label={t('game.missing.home')} onPress={goHome} />
        </GameCard>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <MatchScreen
        session={session}
        paused={!focused}
        onExit={goHome}
        onSettings={() => router.push('/settings')}
        onRules={() => router.push(rulesHref(session.setup.game))}
        onChangeSettings={() => {
          matchSessions.end(session.id);
          router.replace(newGameHref(session.setup.mode));
        }}
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
