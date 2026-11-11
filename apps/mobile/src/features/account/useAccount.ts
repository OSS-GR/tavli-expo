/**
 * The state and the actions of Settings → Account (#402, ADR-0008).
 *
 * - A phone that never played online (`hasOnlineAccount()` is false) is
 *   `offline`, and the screen makes no server call. From there only Sign
 *   in with Apple or an email code (#433) makes a call: never a guest. A guest is made only when
 *   the player makes or opens an invite (`signInForOnline`).
 * - Else the screen asks who is signed in (`auth.ready()`), the name
 *   (`Usernames.mine`) and, for a saved account, its keys
 *   (`AuthProvider.listKeys`). A session whose user is gone on the server
 *   (`NOT_SIGNED_IN`, for example after Apple's delete notice) is signed
 *   out and shows `offline`: never a dead end with only Try again.
 * - Save my account: a guest adds a key with Apple's sheet or an email
 *   code (`saveKey`) and keeps the same id, games and guest number. The
 *   same call adds a second kind of key to a saved account. The email
 *   calls (`signInWithEmail`, `saveWithEmail`) take the code from
 *   `EmailCodeForm` and reject with the server's answer, for the form to
 *   show.
 * - A key that has an account already (#403): for a guest the server
 *   sends a move offer (`offer`). The screen shows its counts and asks.
 *   Move (`moveGuest`) moves the guest's games and invites into that
 *   account, deletes the guest and signs in there; Keep closes the offer
 *   and the guest stays as it is. A saved account gets no offer, only
 *   `keyTaken`.
 * - An account keeps at least one key: Remove is off for the last one,
 *   and the server says `LAST_KEY` too.
 * - Sign out (`signOutOfOnline`, the push token first) and Delete
 *   (`deleteOnlineData`) end in `offline`, with a note that says so.
 * - One action at a time. A closed Apple sheet is no problem. After an
 *   action the screen loads again quietly: the cards stay until the new
 *   state is in.
 *
 * - A key sign-in stops the save reminders on Home (#404).
 * - The username step (#483): after an action that makes a saved account
 *   with no username (a guest's save, a key sign-in, a move), the screen
 *   shows `usernameStep` once, like the sign-in choices (#405). The
 *   action tells its load to ask (`load(true)`). A newer load that takes
 *   its place asks too, so it cannot lose the step; a load that failed
 *   passes the ask only to Try again (`failed.askName`). Adding a second
 *   key to a saved account does not ask: a save asks only when the
 *   screen showed no saved account at the tap. Save puts the new name on
 *   the card with no reload, and drops older loads still on their way;
 *   Not now only hides the step (`finishUsernameStep`). A failed load
 *   keeps an open step (and what was typed); a load that lands anywhere
 *   but `saved` closes it.
 *
 * Never send the user id, the Apple id or the email to analytics.
 */
import {
  AUTH_KEY_PROVIDERS,
  isAppleSheetUnfinished,
  isAuthErrorData,
  isUsernameErrorData,
  type Analytics,
  type AppleSheet,
  type AuthKey,
  type AuthKeyProvider,
  type AuthProvider,
  type EmailKeyCredential,
  type GuestMoveOffer,
  type MyUsername,
  type OnlineData,
  type Usernames,
} from '@tavli/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { quietly } from '@/features/analytics/quietly';
import { onlineAccountReady, signOutOfOnline, type SignOutPushes } from '@/features/online/account';
import { forgetOnlineAccount, hasOnlineAccount } from '@/features/online/accountHint';
import { deleteOnlineData } from '@/features/online/deleteData';
import { appleCredential, signInWithApple, signInWithEmail } from '@/features/online/signIn';
import { needsUsernameStep } from '@/features/online/usernameStep';
import { reminders } from '@/features/reminders/reminders';

export type AccountState =
  /** No account on this phone: nothing was asked of the server. */
  | { readonly kind: 'offline' }
  | { readonly kind: 'loading' }
  /**
   * The server did not answer. Try again loads again, and asks for a
   * name when this load did (`askName`, #483).
   */
  | { readonly kind: 'failed'; readonly askName: boolean }
  /** A guest: `guestNumber` is `null` until the first invite or game. */
  | { readonly kind: 'guest'; readonly guestNumber: string | null }
  /** A saved account (it has a key). */
  | {
      readonly kind: 'saved';
      readonly username: string | null;
      readonly keys: readonly AuthKey[];
    };

export type AccountAction = 'signIn' | 'save' | 'move' | 'removeKey' | 'signOut' | 'delete';

/** Why the last action failed. */
export type AccountProblem =
  /** Apple's sheet ended unfinished: most often no Apple ID on the phone (#442). */
  | 'appleUnfinished'
  /** This Apple ID has another account already, and the guest stays (#403). */
  | 'keyTaken'
  /** The same for an email address (#433). */
  | 'keyTakenEmail'
  /** The last key: an account keeps at least one. */
  | 'lastKey'
  | 'deleteFailed'
  /** Apple is off on the server (`KEY_OFF`, #462): no Services ID yet. */
  | 'appleOff'
  /** The server could not be reached. */
  | 'network'
  /** Anything else. */
  | 'other';

/** What just happened, said once on the screen. */
export type AccountNote = 'signedOut' | 'deleted' | 'saved' | 'moved';

export interface AccountDeps {
  readonly auth: AuthProvider;
  readonly usernames: Usernames;
  readonly data: OnlineData;
  readonly appleSheet: AppleSheet;
  readonly analytics: Analytics;
  /** The turn notifications, or `undefined` in a build without them. */
  readonly pushes: SignOutPushes | undefined;
}

export interface Account {
  readonly state: AccountState;
  /** Apple's sheet works on this phone (iPhone). `false` until the phone says. */
  readonly appleAvailable: boolean;
  readonly busy: AccountAction | null;
  readonly problem: AccountProblem | null;
  readonly note: AccountNote | null;
  /** The server's offer to move this guest into the key's account (#403), or `null`. */
  readonly offer: GuestMoveOffer | null;
  /** The kind of key the offer is for. */
  readonly offerKey: AuthKeyProvider;
  /**
   * A saved account with no username, just after a save, a key sign-in
   * or a move (#483): the screen shows the username step. `null` else.
   */
  readonly usernameStep: MyUsername | null;
  /**
   * Ends the username step and shows the account again: with the new
   * state after Save, with nothing after Not now.
   */
  readonly finishUsernameStep: (saved?: MyUsername) => void;
  /** Counts the problems and notes, so a screen reader hears each one (`useAnnouncement`). */
  readonly said: number;
  readonly reload: () => void;
  /** Offline: Sign in with Apple, to an account made on another phone or a new one. */
  readonly signInWithApple: () => void;
  /** A guest saves the account with Apple; a saved account adds an Apple key. */
  readonly saveWithApple: () => void;
  /**
   * Offline: signs in with the email form's code (#433). Rejects with the
   * server's answer (`AuthErrorData`) for the form.
   */
  readonly signInWithEmail: (credential: EmailKeyCredential) => Promise<void>;
  /**
   * A guest saves the account with the email form's code; a saved account
   * adds an email key. An address with another account gives a guest the
   * move offer and resolves; else it rejects for the form.
   */
  readonly saveWithEmail: (credential: EmailKeyCredential) => Promise<void>;
  /** Moves the guest into the account of the offer, and signs in there. */
  readonly moveGuest: () => void;
  /** Closes the offer: the guest stays as it is. */
  readonly keepGuest: () => void;
  /** OK on the problem popup. */
  readonly dismissProblem: () => void;
  readonly removeKey: (provider: AuthKeyProvider) => void;
  readonly signOut: () => void;
  readonly deleteAccount: () => void;
}

/** The kinds of key this account may still add on this phone. */
export function addableKeys(
  keys: readonly AuthKey[],
  appleAvailable: boolean,
): readonly AuthKeyProvider[] {
  // A new provider must say here whether this phone can add it.
  const canAdd: Record<AuthKeyProvider, boolean> = {
    apple: appleAvailable,
    // The email code works on every phone (#433).
    email: true,
  };
  return AUTH_KEY_PROVIDERS.filter(
    (provider) => canAdd[provider] && !keys.some((key) => key.provider === provider),
  );
}

/** The state, and the name the server gave (`null` when it asked none). */
interface Loaded {
  readonly state: AccountState;
  readonly mine: MyUsername | null;
}

const OFFLINE: Loaded = { state: { kind: 'offline' }, mine: null };

/** Loads the state (see the top of this file). */
async function loadAccount(
  auth: AuthProvider,
  usernames: Usernames,
  pushes: SignOutPushes | undefined,
): Promise<Loaded> {
  if (!hasOnlineAccount()) return OFFLINE;
  const user = await auth.ready();
  if (user === null) return OFFLINE;
  let mine: MyUsername;
  try {
    mine = await usernames.mine();
  } catch (error) {
    if (!isUsernameErrorData(error) || error.code !== 'NOT_SIGNED_IN') throw error;
    // The session outlived its user: sign it out, so the next invite starts fresh.
    await signOutOfOnline(auth, pushes).catch(forgetOnlineAccount);
    return OFFLINE;
  }
  onlineAccountReady();
  if (user.isGuest || !mine.saved) {
    // A server from before #402 sends no `guestNumber`: show no number then.
    return { state: { kind: 'guest', guestNumber: mine.guestNumber ?? null }, mine };
  }
  return { state: { kind: 'saved', username: mine.name, keys: await auth.listKeys() }, mine };
}

function problemOf(error: unknown): AccountProblem {
  if (isAppleSheetUnfinished(error)) return 'appleUnfinished';
  if (isAuthErrorData(error)) {
    if (error.code === 'KEY_BELONGS_TO_OTHER') return 'keyTaken';
    if (error.code === 'LAST_KEY') return 'lastKey';
    // Only Apple's actions get here: the email form has its own problems.
    if (error.code === 'KEY_OFF') return 'appleOff';
    if (error.code === 'NETWORK') return 'network';
  }
  return 'other';
}

/**
 * The account of Settings → Account. `visit` changes each time the screen
 * shows again (the route's focus), so a new username shows.
 */
export function useAccount(deps: AccountDeps, visit = 0): Account {
  const [state, setState] = useState<AccountState>(() =>
    hasOnlineAccount() ? { kind: 'loading' } : { kind: 'offline' },
  );
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<AccountAction | null>(null);
  const [problem, setProblem] = useState<AccountProblem | null>(null);
  const [note, setNote] = useState<AccountNote | null>(null);
  const [offer, setOffer] = useState<GuestMoveOffer | null>(null);
  const [offerKey, setOfferKey] = useState<AuthKeyProvider>('apple');
  const [usernameStep, setUsernameStep] = useState<MyUsername | null>(null);
  const [said, setSaid] = useState(0);
  // One action at a time: a second tap before the render sees `busy` does nothing.
  const acting = useRef(false);
  const live = useRef(true);
  // The newest load: only it may set the state. `askName` stays true
  // until it lands, so a load that takes its place asks too.
  const latest = useRef<{ readonly askName: boolean }>({ askName: false });
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const { auth, usernames, appleSheet, pushes } = deps;
  useEffect(() => {
    let on = true;
    appleSheet.isAvailable().then(
      (available) => {
        if (on) setAppleAvailable(available);
      },
      () => {},
    );
    return () => {
      on = false;
    };
  }, [appleSheet]);

  /**
   * Loads the state. With `askName` (an action that may make a saved
   * account), a saved account with no username gets the username step.
   */
  const load = useCallback(
    (askName: boolean) => {
      const asks = askName || latest.current.askName;
      const me = { askName: asks };
      latest.current = me;
      loadAccount(auth, usernames, pushes).then(
        ({ state: next, mine }) => {
          if (!live.current || latest.current !== me) return;
          latest.current = { askName: false };
          setState(next);
          // No saved account (signed out, or the session is gone): no step.
          if (next.kind !== 'saved') setUsernameStep(null);
          else if (asks && mine !== null && needsUsernameStep(mine)) setUsernameStep(mine);
        },
        () => {
          if (!live.current || latest.current !== me) return;
          latest.current = { askName: false };
          // An open step stays with what was typed. Only Try again asks
          // again, not a later load.
          setState({ kind: 'failed', askName: asks });
        },
      );
    },
    [auth, usernames, pushes],
  );

  useEffect(() => {
    load(false);
  }, [load, visit]);

  const reload = () => {
    const askName = state.kind === 'failed' && state.askName;
    setState(hasOnlineAccount() ? { kind: 'loading' } : { kind: 'offline' });
    load(askName);
  };

  /** Runs one action; `then` gets its result while the screen is still there. */
  function run<T>(action: AccountAction, call: () => Promise<T>, then: (result: T) => void) {
    if (acting.current) return;
    acting.current = true;
    setBusy(action);
    setProblem(null);
    setNote(null);
    setOffer(null);
    call().then(
      (result) => {
        acting.current = false;
        if (!live.current) return;
        setBusy(null);
        then(result);
      },
      (error: unknown) => {
        acting.current = false;
        if (!live.current) return;
        setBusy(null);
        setProblem(action === 'delete' ? 'deleteFailed' : problemOf(error));
        setSaid((n) => n + 1);
      },
    );
  }

  /**
   * Runs the email form's call. Like `run`, but a failure goes back to the
   * form (it says what the server's answer means), not to `problem`.
   */
  async function runForForm<T>(
    action: AccountAction,
    call: () => Promise<T>,
    then: (result: T) => void,
  ): Promise<void> {
    // Another action runs: the form says "try again".
    if (acting.current) throw new Error('busy');
    acting.current = true;
    setBusy(action);
    setProblem(null);
    setNote(null);
    setOffer(null);
    let result: T;
    try {
      result = await call();
    } finally {
      acting.current = false;
      if (live.current) setBusy(null);
    }
    if (live.current) then(result);
  }

  /**
   * After an action: load again with the cards still on the screen.
   * `askName`: the action may have made a saved account (#483).
   */
  const done = (next: AccountNote | null, askName = false) => {
    if (next !== null) {
      setNote(next);
      setSaid((n) => n + 1);
    }
    load(askName);
  };

  /**
   * The end of a save (Apple or email): the move offer, or the note.
   * `askName` comes from the tap: a save asks for a name only when the
   * screen showed no saved account then (a guest's save).
   */
  const afterSave = (result: 'saved' | GuestMoveOffer, key: AuthKeyProvider, askName: boolean) => {
    if (result !== 'saved') {
      setOfferKey(key);
      setOffer(result);
    } else done('saved', askName);
  };
  // Adding a key to a saved account asks for no name.
  const savesGuest = state.kind !== 'saved';

  return {
    state,
    appleAvailable,
    busy,
    problem,
    note,
    offer,
    offerKey,
    usernameStep,
    finishUsernameStep: (saved) => {
      setUsernameStep(null);
      // Save: the card shows the new name at once, with no reload. An
      // older load still on its way must not put the old name back.
      if (saved !== undefined) {
        latest.current = { askName: false };
        setState((now) => (now.kind === 'saved' ? { ...now, username: saved.name } : now));
      }
    },
    said,
    reload,
    signInWithApple: () =>
      run(
        'signIn',
        () => signInWithApple(deps.auth, deps.appleSheet),
        (user) => {
          if (user === null) return;
          quietly(() => deps.analytics.track('online_sign_in', { method: 'apple' }));
          reminders.stop();
          done(null, true);
        },
      ),
    signInWithEmail: (credential) =>
      runForForm(
        'signIn',
        () => signInWithEmail(deps.auth, credential),
        () => {
          quietly(() => deps.analytics.track('online_sign_in', { method: 'email' }));
          reminders.stop();
          done(null, true);
        },
      ),
    saveWithEmail: (credential) =>
      runForForm(
        'save',
        async (): Promise<'saved' | GuestMoveOffer> => {
          try {
            await deps.auth.saveKey(credential);
          } catch (error) {
            // A guest whose address has an account already: ask before a move.
            if (isAuthErrorData(error) && error.code === 'KEY_BELONGS_TO_OTHER' && error.move) {
              return error.move;
            }
            throw error;
          }
          return 'saved';
        },
        (result) => afterSave(result, 'email', savesGuest),
      ),
    saveWithApple: () =>
      run(
        'save',
        async (): Promise<'closed' | 'saved' | GuestMoveOffer> => {
          const credential = await appleCredential(deps.auth, deps.appleSheet);
          if (credential === null) return 'closed';
          try {
            await deps.auth.saveKey(credential);
          } catch (error) {
            // A guest whose key has an account already: ask before a move.
            if (isAuthErrorData(error) && error.code === 'KEY_BELONGS_TO_OTHER' && error.move) {
              return error.move;
            }
            throw error;
          }
          return 'saved';
        },
        (result) => {
          if (result !== 'closed') afterSave(result, 'apple', savesGuest);
        },
      ),
    moveGuest: () => {
      if (offer === null) return;
      run(
        'move',
        () => deps.auth.moveGuest(offer),
        () => done('moved', true),
      );
    },
    dismissProblem: () => setProblem(null),
    keepGuest: () => {
      if (offer === null) return;
      setOffer(null);
      setProblem(offerKey === 'email' ? 'keyTakenEmail' : 'keyTaken');
      setSaid((n) => n + 1);
    },
    removeKey: (provider) =>
      run(
        'removeKey',
        () => deps.auth.removeKey(provider),
        () => done(null),
      ),
    signOut: () =>
      run(
        'signOut',
        () => signOutOfOnline(deps.auth, deps.pushes),
        () => done('signedOut'),
      ),
    deleteAccount: () =>
      run(
        'delete',
        () => deleteOnlineData({ auth: deps.auth, data: deps.data, pushes: deps.pushes }),
        () => done('deleted'),
      ),
  };
}
