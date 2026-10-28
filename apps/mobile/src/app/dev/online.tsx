/**
 * Dev only (#255): an online game vs the bot on the in-memory server.
 * Pick a game, a pace and a length, then start: the board opens on the
 * online screen, and the bot plays the remote player through its own
 * transport (`features/online/devGame.ts`). Not linked from the app.
 * Release builds go home.
 */
import {
  ONLINE_GAME_CHOICES,
  type Difficulty,
  type OnlineGameChoice,
  type OnlineGamePace,
} from '@tavli/contracts';
import { Redirect, Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { SegmentedControl } from '@/components/settings/SegmentedControl';
import { gameHref } from '@/features/match/routes';
import { startDevGame, stopDevGame } from '@/features/online/devGame';
import { botLevels, botRunner, createLocalRng, onlinePlayerId, onlineServer } from '@/services';

const LENGTHS = ['1', '3', '5'] as const;
type Length = (typeof LENGTHS)[number];

/** The games the bot can play, each with its level: Medium when it has one. */
function botGames(): { choice: OnlineGameChoice; level: Difficulty }[] {
  return ONLINE_GAME_CHOICES.flatMap((choice) => {
    const levels = botLevels[choice];
    const level = levels.includes('medium') ? 'medium' : levels[0];
    return level === undefined ? [] : [{ choice, level }];
  });
}

export default function DevOnlineRoute() {
  const { t } = useTranslation();
  const [games] = useState(botGames);
  const [choice, setChoice] = useState<OnlineGameChoice>(games[0]?.choice ?? 'portes');
  const [pace, setPace] = useState<OnlineGamePace>('live');
  const [length, setLength] = useState<Length>('3');
  const [rng] = useState(createLocalRng);
  // The game lives while this screen is in the stack (under its board).
  // When it closes (Home, or back), the bot and the turn timers stop.
  useEffect(() => () => stopDevGame(), []);

  if (!__DEV__) return <Redirect href="/" />;

  const start = () => {
    const level = games.find((g) => g.choice === choice)?.level ?? 'easy';
    const { gameId } = startDevGame({
      server: onlineServer(),
      me: onlinePlayerId,
      choice,
      pace,
      targetPoints: Number(length),
      difficulty: level,
      runner: botRunner,
      rng,
    });
    router.push(gameHref(gameId));
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ headerShown: true, title: t('dev.online.title') }} />
      <Text style={styles.intro}>{t('dev.online.intro')}</Text>
      <SegmentedControl
        testID="dev-online-game"
        label={t('dev.online.game')}
        value={choice}
        onChange={setChoice}
        options={games.map((g) => ({ value: g.choice, label: t(`games.${g.choice}`) }))}
      />
      <SegmentedControl
        testID="dev-online-pace"
        label={t('dev.online.pace')}
        value={pace}
        onChange={setPace}
        options={[
          { value: 'live', label: t('dev.online.live') },
          { value: 'async', label: t('dev.online.async') },
        ]}
      />
      <SegmentedControl
        testID="dev-online-length"
        label={t('dev.online.length')}
        value={length}
        onChange={setLength}
        options={LENGTHS.map((value) => ({ value, label: value }))}
      />
      <ActionButton testID="dev-online-start" label={t('dev.online.start')} onPress={start} />
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.md,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.md),
  },
  intro: {
    ...theme.type.body,
    color: theme.colors.text,
  },
}));
