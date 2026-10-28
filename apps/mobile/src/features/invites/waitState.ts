/**
 * What the waiting screen of the inviter shows (#281). Pure: the screen
 * watches the invite through the `Invites` port and turns each view or
 * error into one of these.
 */
import { isInviteErrorData, type InviteView } from '@tavli/contracts';

/**
 * - `loading`: waiting for the first view.
 * - `open`: waiting for the friend; the screen shows the code and the link.
 * - `joined`: the friend accepted; `gameId` is the new game.
 * - `declined`: the friend said no.
 * - `expired`: nobody answered within 24 hours.
 * - `cancelled`: the inviter took it back (on another screen or phone).
 * - `notFound`: no invite has this code, it is someone else's, or this
 *   phone is not signed in.
 * - `failed`: the watch failed (for example no network).
 */
export type WaitState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'open'; readonly view: InviteView }
  | { readonly kind: 'joined'; readonly gameId: string }
  | { readonly kind: 'declined' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'failed' };

export type WaitKind = WaitState['kind'];

/** The states after which the invite never changes again. */
export function isFinalWait(state: WaitState): boolean {
  return state.kind !== 'loading' && state.kind !== 'open' && state.kind !== 'failed';
}

/**
 * The state for a view of the watched invite. `me` is the signed-in user:
 * an invite from someone else is not this phone's to wait for, so it is
 * "not found" (a friend opens it on the invite screen instead).
 */
export function waitStateOfView(view: InviteView | null, me: string): WaitState {
  if (view === null || view.from !== me) return { kind: 'notFound' };
  switch (view.status) {
    case 'open':
      return { kind: 'open', view };
    case 'accepted':
      // An accepted invite always has its game; without one, treat it as failed.
      return view.gameId === null ? { kind: 'failed' } : { kind: 'joined', gameId: view.gameId };
    case 'declined':
      return { kind: 'declined' };
    case 'cancelled':
      return { kind: 'cancelled' };
    case 'expired':
      return { kind: 'expired' };
  }
}

/**
 * The state for a failed watch. With no sign-in the invite cannot be this
 * phone's, so it is "not found". Any other error may pass: Try again.
 */
export function waitStateOfError(error: unknown): WaitState {
  if (isInviteErrorData(error) && error.code === 'NOT_SIGNED_IN') return { kind: 'notFound' };
  return { kind: 'failed' };
}

/**
 * The state for a failed Cancel, when the error says what happened to the
 * invite. `null` for any other error: the invite may still be open, and
 * the user may try again. `INVITE_CLOSED` is `null` too: the watch shows
 * the answer (the friend may have just accepted), so the screen shows no
 * error for it.
 */
export function waitStateOfCancelError(error: unknown): WaitState | null {
  if (!isInviteErrorData(error)) return null;
  switch (error.code) {
    case 'INVITE_EXPIRED':
      return { kind: 'expired' };
    case 'INVITE_NOT_FOUND':
    case 'NOT_YOUR_INVITE':
    case 'NOT_SIGNED_IN':
      return { kind: 'notFound' };
    default:
      return null;
  }
}
