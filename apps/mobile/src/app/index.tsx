import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { anyGameLevels } from '@/features/bot/levels';
import { ContinueCard } from '@/features/home/ContinueCard';
import { GuestReminderCard } from '@/features/home/GuestReminderCard';
import { HomeFriendInvites } from '@/features/home/HomeFriendInvites';
import { HomeInvites } from '@/features/home/HomeInvites';
import { HomeOnlineGames } from '@/features/home/HomeOnlineGames';
import { HomeScreen } from '@/features/home/HomeScreen';
import { LearnCard } from '@/features/home/LearnCard';
import { ReminderCard } from '@/features/home/ReminderCard';
import { QUICK_START_GAMES } from '@/features/home/QuickStartHero';
import { matchSessions } from '@/features/match/appSessions';
import { loadLastSetup, saveLastSetup } from '@/features/match/lastSetup';
import {
  FRIEND_HREF,
  FRIENDS_HREF,
  JOIN_HREF,
  ONLINE_GAMES_HREF,
  RATINGS_HREF,
  WHATS_NEW_HREF,
  gameHref,
  inviteHref,
  inviteWaitHref,
  newGameHref,
  rulesHref,
  tutorialHref,
} from '@/features/match/routes';
import type { SavedMatch } from '@/features/match/savedMatch';
import { isGameOpen, sanitizeSetup, type MatchSetup } from '@/features/match/setup';
import { continueSummary } from '@/features/match/summary';
import { hasOnlineAccount } from '@/features/online/accountHint';
import { reminders } from '@/features/reminders/reminders';
import { useReminderCard } from '@/features/reminders/useReminderCard';
import { offersTutorial } from '@/features/tutorial/progress';
import { useTutorial } from '@/features/tutorial/store';
import { whatsNewSeen } from '@/features/whats-new/seen';
import { auth, botLevels, friends, games, invites, ratings, storage } from '@/services';

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
  // What's new (#471): the dot and the heartbeat until the page opens.
  const [whatsNewFresh, setWhatsNewFresh] = useState(() => whatsNewSeen.due());
  // The last choices vs the bot (#517): the quick start card starts a
  // match with them, so one tap plays the game with the last length,
  // level and house rules.
  const [botSetup, setBotSetup] = useState<MatchSetup>(() =>
    loadLastSetup(storage, 'bot', botLevels),
  );
  const focused = useIsFocused();
  // Read them again each time Home shows (back from a game or an invite).
  useFocusEffect(
    useCallback(() => {
      // `broken` goes back to false here (the save is gone now). The toast
      // was shown already and keeps its own timer. A sticky `broken` would
      // show it again whenever the text changes (a language switch).
      setSlot(readSlot());
      setOnlineAccount(hasOnlineAccount());
      setWhatsNewFresh(whatsNewSeen.due());
      setBotSetup(loadLastSetup(storage, 'bot', botLevels));
    }, []),
  );
  const { saved } = slot;
  const showLearn = offersTutorial(useTutorial((s) => s.status));
  const dismissLearn = useTutorial((s) => s.dismiss);
  // Save a guest account, or play online (#404). Only with online play.
  const reminder = useReminderCard({
    focused,
    reminders,
    auth: invites === undefined ? undefined : auth,
  });
  const { card } = reminder;

  return (
    <HomeScreen
      botLevels={anyGameLevels(botLevels)}
      hour={new Date(slot.now).getHours()}
      notice={slot.broken ? t('home.continue.broken') : null}
      continueCard={
        saved ? (
          <ContinueCard
            summary={continueSummary(saved, t, slot.now)}
            board={{
              board: saved.flow.game.state.board,
              direction: saved.flow.game.state.rules.movement.direction,
            }}
            onPress={() => router.push(gameHref(saved.id))}
          />
        ) : null
      }
      reminderCard={
        card ? (
          card.kind === 'guest' && auth !== undefined && games !== undefined ? (
            <GuestReminderCard
              auth={auth}
              games={games}
              last={card.last}
              onAccept={() => {
                reminder.hide();
                router.push('/account');
              }}
              onDismiss={reminder.hide}
              onStop={reminder.stop}
            />
          ) : (
            <ReminderCard
              kind={card.kind}
              last={card.last}
              onAccept={() => {
                reminder.hide();
                router.push(card.kind === 'guest' ? '/account' : FRIEND_HREF);
              }}
              onDismiss={reminder.hide}
              onStop={reminder.stop}
            />
          )
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
      friendInvites={
        onlineAccount && auth !== undefined && friends !== undefined ? (
          <HomeFriendInvites
            auth={auth}
            friends={friends}
            focused={focused}
            onOpen={(code) => router.push(inviteHref(code))}
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
      quickStart={{
        games: QUICK_START_GAMES.filter((game) => isGameOpen(game, 'bot', botLevels)),
        last: botSetup.game,
        level: botSetup.botLevel,
      }}
      onBotLevel={(botLevel) => {
        const next = { ...botSetup, botLevel };
        saveLastSetup(storage, next);
        setBotSetup(next);
      }}
      onQuickStart={(game) => {
        // The game's own levels decide: a level it lacks becomes its easiest.
        const setup = sanitizeSetup({ ...botSetup, game }, 'bot', botLevels);
        saveLastSetup(storage, setup);
        const session = matchSessions.start(setup);
        router.push(gameHref(session.id));
      }}
      onSettings={() => router.push('/settings')}
      onWhatsNew={() => router.push(WHATS_NEW_HREF)}
      whatsNewFresh={whatsNewFresh}
      onHowToPlay={() => router.push(rulesHref('portes'))}
      onHistory={() => router.push('/history')}
      // Online play needs the server: a build without one shows "Coming soon".
      onPlayFriend={invites === undefined ? undefined : () => router.push(FRIEND_HREF)}
      onJoinWithCode={invites === undefined ? undefined : () => router.push(JOIN_HREF)}
      // Friends and Leaderboards (#486): the screens say what a guest or
      // a phone with no account can do, so the tiles show to everyone.
      onFriends={auth && friends ? () => router.push(FRIENDS_HREF) : undefined}
      onRatings={auth && ratings ? () => router.push(RATINGS_HREF) : undefined}
    />
  );
}
