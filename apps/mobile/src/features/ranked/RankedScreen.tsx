/**
 * Play ranked (#532, ADR-0009, Figma 81:2): Home → Play ranked. A new
 * player close to your rating, live, two minutes a turn.
 *
 * - Ranked needs a rating, so a saved account. Who is signed in comes
 *   from `useAccount` (Settings → Account's state): a phone that never
 *   played online asks no server. A guest or nobody signed in sees "Save
 *   your account to play ranked": Continue with Apple (iPhone), Use email
 *   (the `EmailCodeForm` step) and Not now. They never see the search.
 *   The save works as on Account: the move offer, the problems and the
 *   username step are the same parts. After the save the setup shows.
 * - Setup: the table with an empty chair, the game (Portes, Plakoto,
 *   Fevga, Tavli), the clock card, your rating, **Find a player**. The
 *   first Find a player shows the rules sheet once (`rankedRules.ts`);
 *   I agree starts the search.
 * - Searching: the wait and the rating range, which grows on the clock
 *   (`seekRange`); Cancel. Back cancels too.
 * - After `NOBODY_YET_MS` with nobody: "Nobody yet" with Keep looking,
 *   Try another game (the game most players look for now) and Play the
 *   bot instead. Never a dead end, and never a fake player.
 * - A player sat down: the chair fills, both ratings and what the match
 *   is worth (`matchStakes`), "Starting in 3…" and Report or block. The
 *   game opens by itself after `MATCH_START_SECONDS`, or at a tap. Report
 *   or block holds the count while its sheet is open.
 * - A search the server ended after five minutes says so on the setup.
 * - Each dialog shares one `Sheet` (iOS shows no second `Modal`); each
 *   moves focus to its title. No text has a line limit.
 *
 * Navigation stays in the route (`app/ranked.tsx`).
 */
import {
  NOBODY_YET_MS,
  RANKED_GAMES,
  RANKED_TARGET_POINTS,
  seekRange,
  type Analytics,
  type EmailKeyCredential,
  type GameTransport,
  type LookingCounts,
  type MyRating,
  type RankedGame,
  type Ratings,
  type Safety,
  type Matchmaking,
} from '@tavli/contracts';
import { matchStakes } from '@tavli/online';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { ProblemCard } from '@/components/Problem';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionCard, SectionRow } from '@/components/SectionCard';
import { Sheet } from '@/components/Sheet';
import { AppleButton, MoveDialog } from '@/features/account/AccountScreen';
import { useAccount, type Account, type AccountDeps } from '@/features/account/useAccount';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import { EmailCodeForm } from '@/features/online/EmailCodeForm';
import { playerNameText } from '@/features/online/playerName';
import { UsernameForm } from '@/features/online/UsernameForm';
import { termsUrl } from '@/features/online/usernameStep';
import { ReportOrBlock, type SafetyPlayer } from '@/features/safety/ReportOrBlock';

import { RankedTable, type TablePlayer } from './RankedTable';
import { agreeRankedRules, hasAgreedRankedRules } from './rankedRules';
import {
  RankedFooterNote,
  RankedMatched,
  RankedNobody,
  RankedSearching,
  RankedSetup,
  type OtherGame,
  type RatingRange,
} from './RankedViews';
import { useRankedSearch, type RankedProblem } from './useRankedSearch';

/** "Starting in 3…": the match opens by itself after these seconds. */
export const MATCH_START_SECONDS = 3;

/** The table's width on the setup card and the other steps. */
const TABLE_MAX = 340;

export interface RankedScreenProps {
  /** The Account parts: who is signed in, and the save of a guest. */
  account: AccountDeps;
  matchmaking: Matchmaking;
  ratings: Ratings;
  /** Finds the other player's id for Report or block. */
  games: GameTransport;
  /** Block and report (#435). Without it there is no Report or block. */
  safety?: Safety;
  analytics: Analytics;
  /** Changes each time the screen shows again (after Account). */
  visit?: number;
  /** The game picked at the start (New player at a match end). */
  initialGame?: RankedGame;
  onBack: () => void;
  /** A match started: open the game. */
  onGame: (gameId: string) => void;
  /** Play the bot instead. */
  onBot: () => void;
  /** The phone clock. Default: `Date.now`. */
  now?: () => number;
}

/** A sheet over the screen: one at a time. */
type Dialog = 'rules' | 'report';

export function RankedScreen(props: RankedScreenProps) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const account = useAccount(props.account, props.visit ?? 0);
  const [emailStep, setEmailStep] = useState(false);
  const { state } = account;
  const saved = state.kind === 'saved' && account.usernameStep === null && !emailStep;

  const useCode = async (credential: EmailKeyCredential) => {
    if (state.kind === 'offline') await account.signInWithEmail(credential);
    else await account.saveWithEmail(credential);
    setEmailStep(false);
  };

  return (
    <Screen testID="ranked-screen">
      {saved ? (
        <RankedSaved {...props} titleRef={titleRef} username={state.username} />
      ) : (
        <>
          <ScreenHeader
            title={t('ranked.title')}
            titleRef={titleRef}
            onBack={props.onBack}
            backLabel={t('common.back')}
            testID="ranked-back"
          />
          <KeyboardAvoidingView
            style={styles.body}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled">
              {account.usernameStep !== null ? (
                <SectionCard padded testID="ranked-username-step">
                  <UsernameForm
                    usernames={props.account.usernames}
                    mine={account.usernameStep}
                    title={t('username.title')}
                    onDone={account.finishUsernameStep}
                    onNotNow={() => account.finishUsernameStep()}
                  />
                </SectionCard>
              ) : emailStep ? (
                <SectionCard padded testID="ranked-email">
                  <EmailCodeForm
                    auth={props.account.auth}
                    title={
                      state.kind === 'offline' ? t('emailCode.title') : t('emailCode.saveTitle')
                    }
                    onCode={useCode}
                    onBack={() => setEmailStep(false)}
                    backLabel={t('common.cancel')}
                  />
                </SectionCard>
              ) : state.kind === 'loading' ? (
                <ActivityIndicator testID="ranked-loading" />
              ) : state.kind === 'failed' ? (
                <>
                  <Text testID="ranked-failed" style={styles.line}>
                    {t('ranked.failed')}
                  </Text>
                  <ActionButton
                    testID="ranked-retry"
                    kind="secondary"
                    label={t('ranked.retry')}
                    onPress={account.reload}
                  />
                </>
              ) : (
                <RankedGate
                  account={account}
                  onEmail={() => setEmailStep(true)}
                  onNotNow={props.onBack}
                />
              )}
            </ScrollView>
          </KeyboardAvoidingView>
          <AccountSheet account={account} />
        </>
      )}
    </Screen>
  );
}

/** "Save your account to play ranked" (Figma 12): a guest, or nobody signed in. */
function RankedGate({
  account,
  onEmail,
  onNotNow,
}: {
  account: Account;
  onEmail: () => void;
  onNotNow: () => void;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const offline = account.state.kind === 'offline';
  const busy = account.busy !== null;
  return (
    <>
      <View testID="ranked-gate" style={styles.gate}>
        <RankedTable
          width={Math.min(width - 64, 240)}
          me={{ key: 'me', name: null }}
          opponent={null}
        />
        <Text style={styles.gateTitle} accessibilityRole="header">
          {t('ranked.gate.title')}
        </Text>
        <Text style={styles.gateText}>{t('ranked.gate.text')}</Text>
      </View>
      <SectionCard>
        <SectionRow
          icon="trophy"
          label={t('ranked.gate.rating')}
          hint={t('ranked.gate.ratingHint')}
        />
        <SectionRow
          icon="smartphone"
          label={t('ranked.gate.phones')}
          hint={t('ranked.gate.phonesHint')}
        />
      </SectionCard>
      <View style={styles.buttons}>
        {account.appleAvailable ? (
          <AppleButton
            testID="ranked-apple"
            onPress={() => {
              if (busy) return;
              if (offline) account.signInWithApple();
              else account.saveWithApple();
            }}
          />
        ) : null}
        <ActionButton
          testID="ranked-email-button"
          kind={account.appleAvailable ? 'secondary' : 'primary'}
          label={t('ranked.gate.email')}
          disabled={busy}
          onPress={onEmail}
        />
        <ActionButton
          testID="ranked-not-now"
          kind="text"
          label={t('ranked.gate.notNow')}
          onPress={onNotNow}
        />
        {account.busy !== null ? (
          <Text testID="ranked-gate-busy" style={styles.note}>
            {t(`account.busy.${account.busy}`)}
          </Text>
        ) : null}
      </View>
    </>
  );
}

/** The move offer and the problems of a save, as on Account. */
function AccountSheet({ account }: { account: Account }) {
  const { t } = useTranslation();
  const { offer, problem } = account;
  return (
    <Sheet
      visible={offer !== null || problem !== null}
      onClose={offer !== null ? account.keepGuest : account.dismissProblem}
      closeLabel={t(offer !== null ? 'common.cancel' : 'problem.ok')}
      look={offer === null ? 'bare' : 'dialog'}>
      {offer !== null ? (
        <MoveDialog
          title={t(
            account.offerKey === 'email'
              ? 'account.moveDialog.titleEmail'
              : 'account.moveDialog.title',
          )}
          activeGames={offer.activeGames}
          openInvites={offer.openInvites}
          onMove={account.moveGuest}
          onKeep={account.keepGuest}
        />
      ) : problem !== null ? (
        <ProblemCard
          key={account.said}
          testID="ranked-account-problem"
          problem={{
            title: t(`account.problem.${problem}.title`),
            text: t(`account.problem.${problem}.text`),
          }}
          okLabel={t('problem.ok')}
          onOk={account.dismissProblem}
        />
      ) : null}
    </Sheet>
  );
}

/** Your rating, for the setup and the stakes. `null` while it loads or when it fails. */
function useMyRating(ratings: Ratings): MyRating | null {
  const [mine, setMine] = useState<MyRating | null>(null);
  useEffect(() => {
    let live = true;
    ratings.mine().then(
      (value) => {
        if (live) setMine(value);
      },
      () => {
        // The setup shows "no hints" with no number; the search still works.
      },
    );
    return () => {
      live = false;
    };
  }, [ratings]);
  return mine;
}

/** A clock that ticks once a second while `on`. */
function useTicker(on: boolean, now: () => number): number {
  const [time, setTime] = useState(now);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setTime(now()), 1000);
    return () => clearInterval(id);
  }, [on, now]);
  return time;
}

/** The game to offer on "Try another game": the one most players look for. */
export function otherGame(counts: LookingCounts, game: RankedGame): OtherGame {
  const others = RANKED_GAMES.filter((g) => g !== game);
  let best = others[0] ?? game;
  for (const g of others) if (counts[g] > counts[best]) best = g;
  return { game: best, looking: counts[best] };
}

const defaultNow = () => Date.now();

function RankedSaved({
  matchmaking,
  ratings,
  games,
  safety,
  analytics,
  initialGame = 'portes',
  onBack,
  onGame,
  onBot,
  now = defaultNow,
  titleRef,
  username,
}: RankedScreenProps & {
  titleRef: ReturnType<typeof useFocusOnShow>;
  username: string | null;
}) {
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const tableWidth = Math.min(width - 64, TABLE_MAX);
  const search = useRankedSearch({ matchmaking, analytics, now });
  const mine = useMyRating(ratings);
  const [game, setGame] = useState<RankedGame>(initialGame);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  // Keyed by the search, so a new search starts with "Nobody yet" closed.
  const [keptFor, setKeptFor] = useState<string | null>(null);
  const [countsFor, setCountsFor] = useState<{ key: string; counts: LookingCounts } | null>(null);
  const [reported, setReported] = useState<SafetyPlayer | null>(null);
  const [held, setHeld] = useState(false);
  const { state } = search;

  const searching = state.kind === 'searching';
  const clock = useTicker(searching, now);
  const waited = searching ? Math.max(0, clock - state.startedAt) : 0;
  const range: RatingRange | null = searching
    ? (() => {
        const span = seekRange(state.startedAt, state.startedAt + waited);
        return { low: state.rating - span, high: state.rating + span };
      })()
    : null;
  const searchKey = searching ? `${state.game}:${state.startedAt}` : null;
  const nobody = searching && waited >= NOBODY_YET_MS && keptFor !== searchKey;
  const counts = countsFor !== null && countsFor.key === searchKey ? countsFor.counts : null;

  // "Try another game" needs the counts: ask once when "Nobody yet" shows.
  const { lookingCounts } = search;
  useEffect(() => {
    if (!nobody || searchKey === null) return;
    let live = true;
    void lookingCounts().then((value) => {
      if (live && value !== null) setCountsFor({ key: searchKey, counts: value });
    });
    return () => {
      live = false;
    };
  }, [nobody, searchKey, lookingCounts]);

  // A player sat down: count down, then open the game. Report or block holds it.
  const matchedId = state.kind === 'matched' ? state.gameId : null;
  // Keyed by the game, so each match found counts from the start.
  const [counted, setCounted] = useState<{ id: string; left: number } | null>(null);
  const count = counted !== null && counted.id === matchedId ? counted.left : MATCH_START_SECONDS;
  const paused = dialog === 'report';
  // The route passes a new `onGame` each render: keep the latest, and open
  // each game once.
  const openGame = useRef(onGame);
  useEffect(() => {
    openGame.current = onGame;
  }, [onGame]);
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (matchedId === null || paused) return;
    if (count <= 0) {
      if (opened.current === matchedId) return;
      opened.current = matchedId;
      openGame.current(matchedId);
      return;
    }
    const id = setTimeout(() => setCounted({ id: matchedId, left: count - 1 }), 1000);
    return () => clearTimeout(id);
  }, [matchedId, paused, count]);

  const stakes = useMemo(() => {
    if (state.kind !== 'matched' || mine === null) return null;
    return matchStakes(
      { rating: state.me.rating, experience: mine.experience },
      state.opponent.rating,
      RANKED_TARGET_POINTS,
    );
  }, [state, mine]);

  const said =
    state.kind === 'matched'
      ? t('ranked.matched.said', {
          name: playerNameText(state.opponent.name, t) ?? t('online.opponent'),
          rating: state.opponent.rating,
        })
      : null;
  useAnnouncement(said);

  const meKey = `me:${username ?? ''}`;
  const me: TablePlayer = { key: meKey, name: username };

  const find = () => {
    if (!hasAgreedRankedRules()) {
      setDialog('rules');
      return;
    }
    void search.find(game);
  };

  // Leave only when the search is gone: a failed cancel shows its problem.
  const back = async () => {
    if (searching && !(await search.cancel('cancelled'))) return;
    onBack();
  };

  const openReport = async () => {
    if (matchedId === null || safety === undefined) return;
    setDialog('report');
    try {
      const list = await games.listMyGames({ status: 'active' });
      const row = list.find((g) => g.gameId === matchedId);
      if (row === undefined) throw new Error('game not found');
      setReported({
        id: row.opponentId,
        name: state.kind === 'matched' ? state.opponent.name : null,
      });
    } catch {
      setDialog(null);
    }
  };

  const problem: RankedProblem | null = search.problem;
  const sheetOpen = dialog !== null || problem !== null;
  const closeSheet = () => {
    if (held) return;
    if (dialog !== null) {
      setDialog(null);
      setReported(null);
    } else search.dismissProblem();
  };

  return (
    <>
      <ScreenHeader
        title={t('ranked.title')}
        titleRef={titleRef}
        onBack={() => void back()}
        backLabel={t('common.back')}
        testID="ranked-back"
      />
      <ScrollView style={styles.body} contentContainerStyle={styles.content}>
        {state.kind === 'loading' ? (
          <ActivityIndicator testID="ranked-loading" />
        ) : state.kind === 'idle' ? (
          <>
            {search.expired ? (
              <Text testID="ranked-expired" style={styles.line}>
                {t('ranked.expired')}
              </Text>
            ) : null}
            <RankedSetup
              game={game}
              onGame={setGame}
              rating={mine?.rating ?? null}
              tableWidth={Math.min(tableWidth, 240)}
              me={me}
            />
          </>
        ) : state.kind === 'searching' && range !== null ? (
          nobody ? (
            <RankedNobody
              game={state.game}
              range={range}
              other={counts === null ? null : otherGame(counts, state.game)}
              busy={search.busy}
              onKeepLooking={() => setKeptFor(searchKey)}
              onOtherGame={(other) => {
                setGame(other);
                void search.switchGame(other);
              }}
              onBot={() => {
                void search.cancel('bot').then((done) => {
                  if (done) onBot();
                });
              }}
            />
          ) : (
            <RankedSearching
              game={state.game}
              waitedMs={waited}
              range={range}
              tableWidth={tableWidth}
              me={me}
            />
          )
        ) : state.kind === 'matched' ? (
          <RankedMatched
            game={state.game}
            me={state.me}
            meKey={meKey}
            opponent={state.opponent}
            stakes={stakes}
            tableWidth={tableWidth}
          />
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        {state.kind === 'idle' ? (
          <>
            <ActionButton
              testID="ranked-find"
              label={t('ranked.setup.find')}
              busy={search.busy}
              disabled={search.busy}
              onPress={find}
            />
            <RankedFooterNote text={t('ranked.setup.footnote', { count: RANKED_TARGET_POINTS })} />
          </>
        ) : state.kind === 'searching' ? (
          <ActionButton
            testID="ranked-cancel"
            kind="secondary"
            label={t('common.cancel')}
            disabled={search.busy}
            onPress={() => void search.cancel('cancelled')}
          />
        ) : state.kind === 'matched' ? (
          <>
            <ActionButton
              testID="ranked-start"
              label={t('ranked.matched.starting', { count: Math.max(count, 0) })}
              // Ends the count: the effect opens the game, once.
              onPress={() => setCounted({ id: state.gameId, left: 0 })}
            />
            {safety !== undefined ? (
              <ActionButton
                testID="ranked-report"
                kind="text"
                label={t('safety.action')}
                onPress={() => void openReport()}
              />
            ) : null}
          </>
        ) : null}
      </View>
      <Sheet
        visible={sheetOpen}
        onClose={closeSheet}
        closeLabel={t(dialog === 'rules' ? 'common.cancel' : 'problem.ok')}
        look={dialog === 'rules' ? 'sheet' : dialog === 'report' ? 'dialog' : 'bare'}>
        {dialog === 'rules' ? (
          <RankedRules
            onAgree={() => {
              agreeRankedRules();
              setDialog(null);
              void search.find(game);
            }}
            onTerms={() => void Linking.openURL(termsUrl(i18n.language))}
          />
        ) : dialog === 'report' ? (
          reported !== null && safety !== undefined ? (
            <ReportOrBlock
              player={reported}
              safety={safety}
              onClose={() => {
                setDialog(null);
                setReported(null);
              }}
              onHold={setHeld}
            />
          ) : (
            <ActivityIndicator />
          )
        ) : problem !== null ? (
          <ProblemCard
            testID="ranked-problem"
            problem={{
              title: t(`ranked.problem.${problem}.title`),
              text: t(`ranked.problem.${problem}.text`),
            }}
            okLabel={t('problem.ok')}
            onOk={search.dismissProblem}
          />
        ) : null}
      </Sheet>
    </>
  );
}

/** The house rules, once (Figma 11): the clock rule first. */
function RankedRules({ onAgree, onTerms }: { onAgree: () => void; onTerms: () => void }) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const lines = [
    ['clock', 'clock'],
    ['kind', 'handshake'],
    ['help', 'lightbulb'],
    ['report', 'flag'],
  ] as const;
  return (
    <View testID="ranked-rules" style={styles.rules}>
      <Text ref={titleRef} style={styles.rulesTitle} accessibilityRole="header">
        {t('ranked.rules.title')}
      </Text>
      {lines.map(([key]) => (
        <Text key={key} testID={`ranked-rule-${key}`} style={styles.rule}>
          <Text style={styles.ruleLead}>{t(`ranked.rules.${key}Lead`)}</Text>{' '}
          {t(`ranked.rules.${key}Text`)}
        </Text>
      ))}
      <ActionButton testID="ranked-agree" label={t('ranked.rules.agree')} onPress={onAgree} />
      <View style={styles.rulesNote}>
        <Text style={styles.note}>{t('ranked.rules.once')}</Text>
        <ActionButton
          testID="ranked-terms"
          kind="text"
          size="small"
          label={t('ranked.rules.terms')}
          onPress={onTerms}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  body: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: theme.space.lg,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.lg,
  },
  footer: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.lg),
  },
  line: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  note: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  gate: {
    alignItems: 'center',
    gap: theme.space.sm,
    padding: theme.space.lg,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.accentLine,
    backgroundColor: theme.colors.surface,
  },
  gateTitle: {
    ...theme.type.title2,
    color: theme.colors.text,
    textAlign: 'center',
  },
  gateText: {
    ...theme.type.callout,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  buttons: {
    gap: theme.space.sm,
  },
  rules: {
    gap: theme.space.md,
  },
  rulesTitle: {
    ...theme.type.title2,
    color: theme.colors.text,
  },
  rule: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  ruleLead: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  rulesNote: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.xs,
  },
}));
