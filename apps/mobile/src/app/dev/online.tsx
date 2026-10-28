/**
 * Dev only (#255): an online game vs the bot on the in-memory server.
 * Pick a game, a pace and a length, then start: the board opens on the
 * online screen, and the bot plays the remote player through its own
 * transport (`features/online/devGame.ts`). Not linked from the app.
 * Release builds go home.
 *
 * "Make an invite" (#256): the bot makes an invite with the same game,
 * pace and length, and the screen shows its code and links. Open it with
 * the button, or on a simulator:
 * `xcrun simctl openurl booted tavlaki://invite/<code>`. When this phone
 * accepts it, the bot plays the game (as White, the inviter).
 */
import {
  ONLINE_GAME_CHOICES,
  type Difficulty,
  type OnlineGameChoice,
  type OnlineGamePace,
} from '@tavli/contracts';
import { Redirect, Stack, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { SegmentedControl } from '@/components/settings/SegmentedControl';
import { inviteAppUrl, inviteUrl } from '@/features/invites/link';
import { gameHref, inviteHref } from '@/features/match/routes';
import { startDevGame, startDevInvite } from '@/features/online/devGame';
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
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  if (!__DEV__) return <Redirect href="/" />;

  const match = () => ({
    server: onlineServer,
    choice,
    pace,
    targetPoints: Number(length),
    difficulty: games.find((g) => g.choice === choice)?.level ?? 'easy',
    runner: botRunner,
    rng,
  });

  const start = () => {
    setInviteCode(null);
    const { gameId } = startDevGame({ ...match(), me: onlinePlayerId });
    router.push(gameHref(gameId));
  };

  const makeInvite = () => setInviteCode(startDevInvite(match()).code);

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
      <Text style={styles.heading} accessibilityRole="header">
        {t('dev.online.inviteTitle')}
      </Text>
      <Text style={styles.intro}>{t('dev.online.inviteIntro')}</Text>
      <ActionButton
        testID="dev-online-invite"
        kind="secondary"
        label={t('dev.online.makeInvite')}
        onPress={makeInvite}
      />
      {inviteCode === null ? null : (
        <>
          <Text testID="dev-online-invite-code" style={styles.intro} selectable>
            {t('dev.online.inviteCode', { code: inviteCode })}
          </Text>
          {/* Links and the simulator command, to copy. */}
          <Text style={styles.code} selectable>
            {inviteAppUrl(inviteCode)}
          </Text>
          <Text style={styles.code} selectable>
            {`xcrun simctl openurl booted ${inviteAppUrl(inviteCode)}`}
          </Text>
          <Text style={styles.code} selectable>
            {inviteUrl(inviteCode)}
          </Text>
          <ActionButton
            testID="dev-online-open-invite"
            label={t('dev.online.openInvite')}
            onPress={() => router.push(inviteHref(inviteCode))}
          />
        </>
      )}
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
  heading: {
    ...theme.type.title,
    color: theme.colors.text,
    marginTop: theme.space.md,
  },
  code: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
}));
