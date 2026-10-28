import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { anyGameLevels } from '@/features/bot/levels';
import { ContinueCard } from '@/features/home/ContinueCard';
import { HomeInvites } from '@/features/home/HomeInvites';
import { HomeOnlineGames } from '@/features/home/HomeOnlineGames';
import { HomeScreen } from '@/features/home/HomeScreen';
import { LearnCard } from '@/features/home/LearnCard';
import { matchSessions } from '@/features/match/appSessions';
import {
  FRIEND_HREF,
  ONLINE_GAMES_HREF,
  gameHref,
  inviteWaitHref,
  newGameHref,
  rulesHref,
  tutorialHref,
} from '@/features/match/routes';
import type { SavedMatch } from '@/features/match/savedMatch';
import { continueSummary } from '@/features/match/summary';
import { hasOnlineAccount } from '@/features/online/accountHint';
import { offersTutorial } from '@/features/tutorial/progress';
import { useTutorial } from '@/features/tutorial/store';
import { auth, botLevels, games, invites } from '@/services';

interface SlotState {
  readonly saved: SavedMatch | null;
  readonly broken: boolean;
  readonly now: number;
}

/** Reads the save slot. A broken save is removed by `peek`, so its notice shows once. */
function readSlot(): SlotState {
  const result = matchSessions.peek();
  return {
    saved: result.kind === 'ok' ? result.saved : null,
    broken: result.kind === 'broken',
    now: Date.now(),
  };
}

export default function HomeRoute() {
  const { t } = useTranslation();
  const [slot, setSlot] = useState<SlotState>(readSlot);
  // Online games (#297) and invites (#314) only on a phone that has an
  // online account: with none, Home does not even load the session (no
  // network call at start).
  const [onlineAccount, setOnlineAccount] = useState(hasOnlineAccount);
  const focused = useIsFocused();
  // Read them again each time Home shows (back from a game or an invite).
  useFocusEffect(
    useCallback(() => {
      // `broken` goes back to false here (the save is gone now). The toast
      // was shown already and keeps its own timer. A sticky `broken` would
      // show it again whenever the text changes (a language switch).
      setSlot(readSlot());
      setOnlineAccount(hasOnlineAccount());
    }, []),
  );
  const { saved } = slot;
  const showLearn = offersTutorial(useTutorial((s) => s.status));
  const dismissLearn = useTutorial((s) => s.dismiss);

  return (
    <HomeScreen
      botLevels={anyGameLevels(botLevels)}
      notice={slot.broken ? t('home.continue.broken') : null}
      continueCard={
        saved ? (
          <ContinueCard
            summary={continueSummary(saved, t, slot.now)}
            onPress={() => router.push(gameHref(saved.id))}
          />
        ) : null
      }
      onlineGames={
        onlineAccount && auth !== undefined && games !== undefined ? (
          <HomeOnlineGames
            auth={auth}
            games={games}
            focused={focused}
            onOpen={(gameId) => router.push(gameHref(gameId))}
            onSeeAll={() => router.push(ONLINE_GAMES_HREF)}
          />
        ) : null
      }
      invites={
        onlineAccount && auth !== undefined && invites !== undefined ? (
          <HomeInvites
            auth={auth}
            invites={invites}
            focused={focused}
            onOpen={(code) => router.push(inviteWaitHref(code))}
          />
        ) : null
      }
      learnCard={
        showLearn ? (
          <LearnCard
            onStart={() => router.push(tutorialHref('home'))}
            onDismiss={() => dismissLearn()}
          />
        ) : null
      }
      onNewGame={(mode) => router.push(newGameHref(mode))}
      onSettings={() => router.push('/settings')}
      onHowToPlay={() => router.push(rulesHref('portes'))}
      onHistory={() => router.push('/history')}
      // Online play needs the server: a build without one shows "Coming soon".
      onPlayFriend={invites === undefined ? undefined : () => router.push(FRIEND_HREF)}
    />
  );
}
