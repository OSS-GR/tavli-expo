/**
 * Dev only: a vs-bot Portes match that is already a race, with you to roll,
 * so Fast forward shows at once (`docs/rules/tavli-match.md`, "Fast
 * forward a race"). It starts a new match (it replaces the saved one),
 * lets the bot play both sides until the race (`playToRace`), then opens
 * the board. The Maestro flows in `apps/mobile/.maestro/` open it with
 * `tavlaki://dev/race`. Not linked from the app. Release builds go home.
 */
import { Redirect, Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { matchSessions } from '@/features/match/appSessions';
import { playToRace } from '@/features/match/devRace';
import { gameHref } from '@/features/match/routes';
import { defaultSetup, sanitizeSetup } from '@/features/match/setup';
import { botLevels, botRunner, createLocalRng } from '@/services';

export default function DevRaceRoute() {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!__DEV__) return;
    let gone = false;
    const setup = sanitizeSetup({ ...defaultSetup('bot'), botLevel: 'medium' }, 'bot', botLevels);
    const session = matchSessions.start(setup);
    void playToRace(session.store, { runner: botRunner, rng: createLocalRng() }).then(
      (ok) => {
        if (gone) return;
        if (ok) router.replace(gameHref(session.id));
        else setFailed(true);
      },
      (error: unknown) => {
        console.error('dev race failed', error);
        if (!gone) setFailed(true);
      },
    );
    return () => {
      gone = true;
    };
  }, []);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: true, title: t('dev.race.title') }} />
      <Text testID="dev-race-status" style={styles.text}>
        {failed ? t('dev.race.failed') : t('dev.race.busy')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.space.lg,
    backgroundColor: theme.colors.background,
  },
  text: {
    ...theme.type.body,
    color: theme.colors.text,
    textAlign: 'center',
  },
}));
