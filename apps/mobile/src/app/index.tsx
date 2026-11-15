import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { anyGameLevels } from '@/features/bot/levels';
import { ContinueCard } from '@/features/home/ContinueCard';
import { GuestReminderCard } from '@/features/home/GuestReminderCard';
import { HomeFriendInvites, useFriendInvites } from '@/features/home/HomeFriendInvites';
import {
  InviteHero,
  OnlineGameHero,
  RankedHero,
  SavedGameRow,
} from '@/features/home/HomeHeroCards';
import { HomeInvites } from '@/features/home/HomeInvites';
import { HomeOnlineGames } from '@/features/home/HomeOnlineGames';
import { HomeScreen } from '@/features/home/HomeScreen';
import { heroGameId, pickHero } from '@/features/home/heroPick';
import { lastModes } from '@/features/home/lastModes';
import { LearnCard } from '@/features/home/LearnCard';
import { ReminderCard } from '@/features/home/ReminderCard';
import { useTileNews } from '@/features/home/useTileNews';
import { INVITE_TICK_MS } from '@/features/invites/myInvites';
import { matchSessions } from '@/features/match/appSessions';
import {
  FRIEND_HREF,
  FRIENDS_HREF,
  JOIN_HREF,
  RANKED_HREF,
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
import { continueSummary } from '@/features/match/summary';
import { hasOnlineAccount } from '@/features/online/accountHint';
import { listTickMs, useMyOnlineGames, usePhoneClock } from '@/features/online/myGames';
import { reminders } from '@/features/reminders/reminders';
import { useReminderCard } from '@/features/reminders/useReminderCard';
import { offersTutorial } from '@/features/tutorial/progress';
import { useTutorial } from '@/features/tutorial/store';
import { whatsNewSeen } from '@/features/whats-new/seen';
import { auth, botLevels, friends, games, invites, matchmaking, ratings } from '@/services';

/** How often the invite hero's time left updates. */
const INVITE_HERO_TICK_MS = INVITE_TICK_MS;

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
  // Play ranked in the hero for a ranked regular (#517).
  const [rankedRegular, setRankedRegular] = useState(() => lastModes.rankedRegular());
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
      setRankedRegular(lastModes.rankedRegular());
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
  // Your rating on Play ranked and the friend requests on Friends (#517).
  const news = useTileNews({ auth, ratings, friends, enabled: onlineAccount, focused });
  // Your games and the friend invites to you (#297, #486), for the hero
  // and the lists under it (#517). None on a phone with no online account.
  const online = useMyOnlineGames(onlineAccount ? auth : undefined, games);
  const friendInvites = useFriendInvites(onlineAccount ? auth : undefined, friends, focused);
  const onlineList = online.state.status === 'loaded' ? online.state.games : [];
  const offset = online.state.status === 'loaded' ? online.state.offset : 0;
  const pick = pickHero({
    games: onlineList,
    friendInvites,
    hasSave: saved !== null,
    rankedRegular: rankedRegular && matchmaking !== undefined,
  });
  const inHero = heroGameId(pick);
  const heroGame = pick.kind === 'turn' || pick.kind === 'waiting' ? pick.game : null;
  // The hero's clock and the invite's ticks while Home is in view.
  const heroNow = usePhoneClock(
    heroGame !== null
      ? listTickMs([heroGame])
      : pick.kind === 'invite'
        ? INVITE_HERO_TICK_MS
        : null,
    focused,
  );
  const savedSummary = saved ? continueSummary(saved, t, slot.now) : null;
  const openSaved = saved ? () => router.push(gameHref(saved.id)) : () => {};

  let hero: ReactNode = null;
  if (heroGame !== null && games !== undefined) {
    hero = (
      <OnlineGameHero
        games={games}
        game={heroGame}
        now={heroNow}
        offset={offset}
        onPress={() => router.push(gameHref(heroGame.gameId))}
      />
    );
  } else if (pick.kind === 'invite') {
    const { code } = pick.invite;
    hero = (
      <InviteHero
        invite={pick.invite}
        now={heroNow}
        onPress={() => router.push(inviteHref(code))}
      />
    );
  } else if (pick.kind === 'saved' && saved && savedSummary) {
    hero = (
      <ContinueCard
        summary={savedSummary}
        board={{
          board: saved.flow.game.state.board,
          direction: saved.flow.game.state.rules.movement.direction,
        }}
        onPress={openSaved}
      />
    );
  } else if (pick.kind === 'ranked') {
    hero = <RankedHero rating={news.rating} onPress={() => router.push(RANKED_HREF)} />;
  }
  // The saved game is in "Your games" when the hero is another game.
  const savedRow =
    saved && savedSummary && pick.kind !== 'saved' ? (
      <SavedGameRow summary={savedSummary} vsBot={saved.setup.mode === 'bot'} onPress={openSaved} />
    ) : null;

  return (
    <HomeScreen
      botLevels={anyGameLevels(botLevels)}
      hour={new Date(slot.now).getHours()}
      notice={slot.broken ? t('home.continue.broken') : null}
      hero={hero}
      heroRanked={pick.kind === 'ranked'}
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
        <HomeOnlineGames
          state={online.state}
          retry={online.retry}
          heroGameId={inHero}
          saved={savedRow}
          focused={focused}
          onOpen={(gameId) => router.push(gameHref(gameId))}
          onSeeAll={() => router.push(ONLINE_GAMES_HREF)}
        />
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
        <HomeFriendInvites
          invites={
            pick.kind === 'invite'
              ? friendInvites.filter((invite) => invite.code !== pick.invite.code)
              : friendInvites
          }
          onOpen={(code) => router.push(inviteHref(code))}
        />
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
      onWhatsNew={() => router.push(WHATS_NEW_HREF)}
      whatsNewFresh={whatsNewFresh}
      onHowToPlay={() => router.push(rulesHref('portes'))}
      onHistory={() => router.push('/history')}
      // Online play needs the server: a build without one shows "Coming soon".
      onPlayFriend={invites === undefined ? undefined : () => router.push(FRIEND_HREF)}
      onJoinWithCode={invites === undefined ? undefined : () => router.push(JOIN_HREF)}
      onPlayRanked={matchmaking === undefined ? undefined : () => router.push(RANKED_HREF)}
      // Friends and Leaderboards (#486): the screens say what a guest or
      // a phone with no account can do, so the tiles show to everyone.
      onFriends={auth && friends ? () => router.push(FRIENDS_HREF) : undefined}
      onRatings={auth && ratings ? () => router.push(RATINGS_HREF) : undefined}
      {...(news.rating === undefined ? {} : { rankedRating: news.rating })}
      friendRequests={news.friendRequests}
    />
  );
}
