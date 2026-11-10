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
import { reminders } from '@/features/reminders/reminders';

export type AccountState =
  /** No account on this phone: nothing was asked of the server. */
  | { readonly kind: 'offline' }
  | { readonly kind: 'loading' }
  /** The server did not answer. Try again loads again. */
  | { readonly kind: 'failed' }
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

/** Loads the state (see the top of this file). */
async function loadAccount(
  auth: AuthProvider,
  usernames: Usernames,
  pushes: SignOutPushes | undefined,
): Promise<AccountState> {
  if (!hasOnlineAccount()) return { kind: 'offline' };
  const user = await auth.ready();
  if (user === null) return { kind: 'offline' };
  let mine: MyUsername;
  try {
    mine = await usernames.mine();
  } catch (error) {
    if (!isUsernameErrorData(error) || error.code !== 'NOT_SIGNED_IN') throw error;
    // The session outlived its user: sign it out, so the next invite starts fresh.
    await signOutOfOnline(auth, pushes).catch(forgetOnlineAccount);
    return { kind: 'offline' };
  }
  onlineAccountReady();
  if (user.isGuest || !mine.saved) {
    // A server from before #402 sends no `guestNumber`: show no number then.
    return { kind: 'guest', guestNumber: mine.guestNumber ?? null };
  }
  return { kind: 'saved', username: mine.name, keys: await auth.listKeys() };
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
  const [said, setSaid] = useState(0);
  // One action at a time: a second tap before the render sees `busy` does nothing.
  const acting = useRef(false);
  const live = useRef(true);
  // Only the newest load may set the state.
  const loads = useRef(0);
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

  const load = useCallback(() => {
    loads.current += 1;
    const n = loads.current;
    loadAccount(auth, usernames, pushes).then(
      (next) => {
        if (live.current && n === loads.current) setState(next);
      },
      () => {
        if (live.current && n === loads.current) setState({ kind: 'failed' });
      },
    );
  }, [auth, usernames, pushes]);

  useEffect(load, [load, visit]);

  const reload = () => {
    setState(hasOnlineAccount() ? { kind: 'loading' } : { kind: 'offline' });
    load();
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

  // After an action: load again with the cards still on the screen.
  const done = (next: AccountNote | null) => {
    if (next !== null) {
      setNote(next);
      setSaid((n) => n + 1);
    }
    load();
  };

  return {
    state,
    appleAvailable,
    busy,
    problem,
    note,
    offer,
    offerKey,
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
          done(null);
        },
      ),
    signInWithEmail: (credential) =>
      runForForm(
        'signIn',
        () => signInWithEmail(deps.auth, credential),
        () => {
          quietly(() => deps.analytics.track('online_sign_in', { method: 'email' }));
          reminders.stop();
          done(null);
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
        (result) => {
          if (result === 'saved') {
            done('saved');
            return;
          }
          setOfferKey('email');
          setOffer(result);
        },
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
          if (result === 'saved') done('saved');
          else if (result !== 'closed') {
            setOfferKey('apple');
            setOffer(result);
          }
        },
      ),
    moveGuest: () => {
      if (offer === null) return;
      run(
        'move',
        () => deps.auth.moveGuest(offer),
        () => done('moved'),
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
