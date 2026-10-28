/**
 * What the invite screen shows (#256). Pure: the screen loads the invite
 * through the `Invites` port and turns each answer into one of these.
 */
import { isInviteErrorData, type InviteView } from '@tavli/contracts';

/**
 * - `loading`: waiting for the server.
 * - `open`: the friend can accept or decline.
 * - `expired`: nobody answered within 24 hours.
 * - `used`: someone accepted or declined it, or the inviter took it back.
 * - `notFound`: no invite has this code, or the link has no code.
 * - `own`: this phone made the invite.
 * - `failed`: the invite did not load (for example no network).
 */
export type InviteScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'open'; readonly view: InviteView }
  | { readonly kind: 'expired' }
  | { readonly kind: 'used' }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'own' }
  | { readonly kind: 'failed' };

export type InviteScreenKind = InviteScreenState['kind'];

/** The state for the answer of `getInvite`. `me` is the player id of this phone. */
export function stateOfView(view: InviteView | null, me: string): InviteScreenState {
  if (view === null) return { kind: 'notFound' };
  if (view.status === 'expired') return { kind: 'expired' };
  if (view.status !== 'open') return { kind: 'used' };
  if (view.from === me) return { kind: 'own' };
  return { kind: 'open', view };
}

/**
 * The state for a rejected call, when the rejection says what happened to
 * the invite. `null` for any other error: the call failed, and the user
 * may try again.
 */
export function stateOfError(error: unknown): InviteScreenState | null {
  if (!isInviteErrorData(error)) return null;
  switch (error.code) {
    case 'INVITE_EXPIRED':
      return { kind: 'expired' };
    case 'INVITE_CLOSED':
      return { kind: 'used' };
    case 'INVITE_NOT_FOUND':
    case 'BAD_REQUEST':
      return { kind: 'notFound' };
    case 'OWN_INVITE':
      return { kind: 'own' };
    default:
      return null;
  }
}
