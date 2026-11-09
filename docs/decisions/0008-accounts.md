# ADR-0008: Sign-in methods and account rules

- **Status:** Accepted (the owner settled each point on 2026-11-06; accepted by merging #408)
- **Date:** 2026-11-06
- **Issue:** #395 (epic #44)

## Context

Online play today makes a Better Auth guest (anonymous) account on the first
online tap. A guest lives on one phone: delete the app or change phones, and
the online games are gone. Friends, usernames and leaderboards need an account
that can come back on a new phone.

ADR-0004 (item 6) planned Sign in with Apple, Google, an email magic link and
guests. Four reviews checked the design (user experience, privacy and
security, technical fit with our Better Auth setup, and the App Store and
Google Play rules). Their main findings:

- Better Auth's `link-social` route does not check that a key is free, does
  not copy the email, and leaves the account marked as a guest. The anonymous
  plugin then deletes that "guest" on a later sign-in and skips the steps of
  `deleteMyAccount`.
- A magic link breaks on phones: mail scanners open it and use it up, and a
  link opened on a laptop does nothing.
- Apple asks for Sign in with Apple next to Google, and for the Apple token to
  be revoked when an account is deleted. Google Play asks for a web page to
  request deletion. Usernames and friends are user content for both stores
  (filter, report, block, terms).
- Contact matching would need personal data from people who never used the
  app, and hashed emails are easy to reverse.

## Options

| Option | Pros | Cons |
| --- | --- | --- |
| A. Accounts only: no guests for new players | One kind of account; simpler server | Someone who got a friend's link must sign up before one game of Tavli |
| B. Guests stay, and save into a real account | Anyone plays a friend in one tap; the account is the upgrade | Two kinds of account; a guest-to-account step we must write |
| C. Game Center and Play Games as keys | No taps on a new phone of the same OS | Each works on one OS only, gives no way to reach the player, and Better Auth supports neither |

## Decision

We choose **B**.

1. **Nobody needs an account to play.** Offline play never asks. Online play
   with a friend works as a guest.
2. **One sheet, only at the first online tap**, never at launch or during a
   game: Continue with Apple, Google or email, **Continue as a guest**, or
   Not now (stay offline). On iPhone Apple comes first; on Android Google
   comes first and Apple third (browser flow).
3. **Keys:** Sign in with Apple, Google, and a 6-digit email code. No password,
   and no magic link in v1 (a link can come after #332). Game Center and Play
   Games are left out for now.
4. **Saving a guest adds a key to the same account** (same id, games and
   invites), through our own `saveKey` step, not Better Auth's `link-social`.
   A key that already has an account is never joined in silence: the player
   chooses to move the guest's games there or to keep the guest. Two accounts
   that both have keys never merge.
5. **A username, friends, rating and the leaderboards need a saved account.**
   A guest plays friends by invite link or code, rematches, and sees their
   online games.
6. **Guest names:** "Guest" and four random digits, made once on the server
   with the guest account and kept for it. Not picked by the player and not
   taken from the phone. A new guest gets a new number.
7. **Reminders:** after the first "Continue as a guest" or "Not now", a Home
   card asks again at 24 hours, 1 week, 2 weeks and 1 month after that first
   choice, then never. One card per visit and per day at most. A player back
   after a long gap sees one card, which counts as the latest step due but
   never as the last one; the last card comes at least 2 weeks after the card
   before. The schedule lives only on the phone.
8. **Friends without contacts:** friend link, QR code, the system contact
   picker (one person, then the share sheet), exact username search and recent
   opponents. No contacts permission, no address book upload, no contact
   matching.
9. **Our own leaderboards** (friends and global), across iOS and Android.
   Players are on the global board by default and can hide their row.
10. **Privacy and security:** no name or photo from Apple or Google is stored;
    the Convex token holds the user id only; OAuth tokens are encrypted; email
    codes are stored hashed with send limits in Convex; no automatic account
    joins by email; Apple sign-in needs a server nonce. Account delete also
    revokes the Apple token and removes keys, email, username, friends, blocks
    and board rows. Analytics never get an email, a username or a user id.
11. **Minimum age:** 13, or 16 in EU countries that ask for it, asked once when
    a username is picked.
12. **Email sender:** a transactional mail service in an EU region with a data
    processing agreement, behind a `MailSender` port (picked in #399).

This replaces items 6 and 8 of ADR-0004. The rest of ADR-0004 stands.

## Consequences

- Easier: a friend's invite link still gets a new player to the board in one
  tap. The account has a clear reason to exist (username, friends, rating, a
  new phone).
- Harder: we write and test our own `saveKey` step, the guest-to-account move
  (in pages), Apple token revoke, and the reminder schedule.
- Every new table with player data (friends, requests, blocks, ratings) must
  be handled by `deleteMyAccount`, the guest move (`guestMove.ts`, #403) and
  the privacy policy.
- Switching later: the `AuthProvider` port hides Better Auth. Game Center or
  Play Games can still be added as extra keys without a change to the account
  model.

## Issues

#395 (this ADR), #396 (owner setup), #397 (Apple and Google keys), #398 (Apple
revoke), #399 (email code), #400 (guest names), #401 (the sign-in sheet), #402
(Settings → Account), #403 (guest into an existing account), #404 (reminders),
#405 (usernames), #406 (friends, epic #45), #407 (ratings and leaderboards,
epic #56).
