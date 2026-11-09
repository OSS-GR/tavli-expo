# Legal pages

> The privacy policy for the app and the stores (issue #90), and the terms of use (#405). Last review: 2026-11-09 (#320 block and report on the server, #435 how to report in the app, #403 moving a guest into an account).

**This is not legal advice.** The owner should have a lawyer or a GDPR expert check the policy and the terms before they go live.

## Files

| File | What it is |
|------|------------|
| [privacy.md](privacy.md) | English policy. **Source of truth.** |
| [privacy.el.md](privacy.el.md) | Greek policy. Same content as the English one. |
| [site/privacy/index.html](site/privacy/index.html) | English static page, served at `https://tavlaki.com/privacy` |
| [site/el/privacy/index.html](site/el/privacy/index.html) | Greek static page, served at `https://tavlaki.com/el/privacy` |
| [terms.md](terms.md) | English terms of use (#405). **Source of truth.** A draft for the lawyer check. |
| [terms.el.md](terms.el.md) | Greek terms of use. Same content as the English one. |
| [site/terms/index.html](site/terms/index.html) | English static page, served at `https://tavlaki.com/terms` |
| [site/el/terms/index.html](site/el/terms/index.html) | Greek static page, served at `https://tavlaki.com/el/terms` |

The app opens the terms from the username step (`termsUrl` in `apps/mobile/src/features/online/usernameStep.ts`): `https://tavlaki.com/el/terms` when the app language is Greek, else `https://tavlaki.com/terms`.

The app opens `https://tavlaki.com/privacy` (`PRIVACY_POLICY_URL` in `apps/mobile/src/features/privacy/consent.ts`, from PR #89). It links no Greek URL today. The English page links to the Greek page at the top, and the Greek page links back.

## Rules

- **Terms of use:** the same rules: change all four terms files together. The version date at the top is `TERMS_VERSION` (`packages/contracts/src/username.ts`). Raise both only when players must accept the terms again: the app then asks each saved player before their next username change, and the server refuses a change without it (`TERMS_NEEDED`).
- **Change all four files together.** Edit the English Markdown first, then the Greek Markdown, then both HTML pages. Change the "Last updated" date in all four.
- The policy describes what the code does. When a PR changes what data leaves the phone (a new event, a new vendor, a new id), it updates this policy in the same PR. The event list must match [`docs/architecture/analytics-events.md`](../architecture/analytics-events.md). The same PR also updates the store privacy answers ([`docs/store/app-privacy.md`](../store/app-privacy.md), [`docs/store/play-data-safety.md`](../store/play-data-safety.md)) and the iOS privacy manifest in `apps/mobile/app.json`.
- The HTML pages are plain HTML with inline CSS. No JavaScript, no fonts or images from other sites, no cookies. Keep it that way: the policy says so.
- `<!-- OWNER: ... -->` comments in the Markdown mark things the owner must confirm. They are left out of the HTML.

## How to make the HTML from the Markdown

Any Markdown-to-HTML tool works. With [pandoc](https://pandoc.org):

```bash
pandoc -f gfm -t html --wrap=none docs/legal/privacy.md
```

Remove the `<!-- ... -->` comments first. Wrap each `<table>…</table>` in `<div class="table">…</div>` (it scrolls on small screens). Paste the output between `<main>` and `<footer>` in the HTML page. Keep the `<head>`, the inline CSS and the footer as they are.

## How to publish

1. Use any static host (for example GitHub Pages, Cloudflare Pages or Netlify). Publish the `docs/legal/site/` folder as the site root.
2. Point `tavlaki.com` at the host. Both `https://tavlaki.com/privacy` and `https://tavlaki.com/el/privacy` must open the pages. Most hosts serve `privacy/index.html` for `/privacy` and `/privacy/` by themselves.
3. Use HTTPS. Do not add analytics or cookies to the site.
4. Put `https://tavlaki.com/privacy` in App Store Connect (App Privacy → Privacy Policy URL) and in the Google Play Console (App content → Privacy policy).

## Before you publish (owner checklist)

- [ ] Publish only after PR #89 (`feat/61-analytics`) is merged. The policy describes the consent screen and the one privacy switch from that PR. On `main` before #89, crash reports always carry the install id.
- [ ] Put your full name (or a company name) in "Who is responsible", in both languages.
- [ ] Make `privacy@tavlaki.com` work (or change it in all four files).
- [ ] Sentry: check that the organization uses the **EU** data region (Frankfurt). Sentry sets it when the organization is made, and it cannot change later. If it is the US region, change the table in the policy.
- [ ] Sentry: turn on **Prevent Storing of IP Addresses** (see `packages/adapters/crash-sentry/README.md`).
- [ ] PostHog: use an **EU** project and turn on **Discard client IP data** (see `docs/architecture/analytics-events.md`).
- [ ] Convex: check that both deployments (dev and prod) are in the EU region `eu-west-1` (Ireland), and that `BETTER_AUTH_SECRET` is set on both (`npx convex env set`, never in the repo).
- [ ] Expo: check where Expo's push service processes the data and whether its terms need a data processing agreement. Then fix the Expo row in the policy (both languages, the `OWNER` comment).
- [ ] Accept the four vendors' data processing terms (DPA: Sentry, PostHog, Convex, Expo) and check the line about transfers outside the EU.
- [ ] Check the retention times on your Sentry and PostHog plans. The policy states each vendor's documented default (checked 2026-10-27).
- [ ] Have the policy checked (see the note at the top).

## Usernames (#405)

A saved account (Sign in with Apple) may pick a username; guests keep "Guest 4821". The policy's "Online games with a friend" section says what the server keeps: the name as typed, its simple form for the uniqueness check, when the name last changed, the terms version and when it was accepted, and when the age box was ticked (never the age). Usernames are user content: the terms forbid bad names, the server filters them, and the owner renames or clears a name with `clearUsername`. See `docs/store/age-rating.md` ("User-generated content rules"). The age is 16, or 13 by the phone's region (`minimumAge`): **Owner:** a lawyer checks the list.

## Delete my account (#315, #402)

Settings → Account (#402) shows the account: the guest name or the username, the ways to sign in, Sign out (saved accounts only) and **Delete my account** (a guest sees **Delete my guest account**). Until #402 the row was "Delete my online data" in Settings → Privacy. The delete row shows when the phone is signed in. The server call is `deleteMyAccount` (#302): it deletes, for the signed-in user, the sign-in user, its sessions and linked accounts (Better Auth), every invite the user sent, every push token, and the guest name and username with the terms and age record (#400, #405). It resigns the user's running games, so the other player wins. It **keeps** finished games and their move logs for the other player. They hold the user's random user id, but no name (the guest name is gone) and no email, and once the sign-in user is gone the id names nobody. Invites someone else sent that the user answered stay with their sender. The app then signs out, so the next invite makes a new guest. See "Delete an account" in [`docs/architecture/online-game-service.md`](../architecture/online-game-service.md#delete-an-account).

The policy's "Delete your account" section (all four files) and the store answers describe it. A change to what the delete removes or keeps updates them in the same PR.

## Before you publish the terms (owner checklist, #405)

- [ ] Put your full name (or a company name) in "Who we are", in both languages.
- [ ] Have a lawyer check the terms: the age rule and country list, "The app as it is", the Apple section and "Law" (the `OWNER` comments).
- [ ] Publish `site/terms/` and `site/el/terms/` with the privacy pages, before the build with usernames goes to the stores.
- [ ] Add the terms URL to App Store Connect (License Agreement: a custom EULA, or keep Apple's standard one and link the terms in the description) and to the Play listing.

## Ideas for later (app changes, not part of #90)

- Open `https://tavlaki.com/el/privacy` when the app language is Greek.
- Show the install id and the online user id in Settings (Privacy or Account), so people can quote them in a data request.
- Delete old invites and finished online games on the server after a set time, and say how long in the policy.
- Better Auth keeps the IP address and the user agent on each sign-in session. If we do not need them, turn that off on the server (Better Auth's `advanced.ipAddress.disableIpTracking`) and update the policy.
- Android backup: decide if app data (the install id, saved games) should be left out of Android Auto Backup.
- When sign-in with Google or an email code, Apple on Android, friends or EAS Update go live, update the "Coming later" section first.
- Sign in with Apple is live on iPhone (#397, #398, #401). The policy's "Online games with a friend" section says what the server keeps: the Apple id, the email Apple gives (maybe a Hide My Email relay), Apple's id token (encrypted) and Apple's refresh token (encrypted, `appleTokens`, only to revoke it on delete). The App Store answers tick Email Address, and the iOS manifest has `NSPrivacyCollectedDataTypeEmailAddress`. The Android app shows no Apple button yet, so the Play form has no email. The analytics event `online_sign_in` carries the way in only (`apple` or `guest`).
- Online play with a friend is live (#281). The policy's "Online games with a friend (Convex)" section, the store answers and the iOS manifest (`NSPrivacyCollectedDataTypeUserID`, `NSPrivacyCollectedDataTypeGameplayContent`) describe it. Sign-in happens only in the sign-in choices (`apps/mobile/src/features/online/SignInChoices.tsx`, #401), after the player taps **Make an invite** or opens an invite link: the guest only through `signInForOnline` (`features/online/account.ts`), Apple through `signInWithApple` (`features/online/signIn.ts`). A new screen that makes a guest, or a new server table with player data, updates the policy in the same PR.
- Turn notifications are on for all online games (#285, #317). The policy's "Turn notifications (Expo)" section, the Expo row in the vendor table, the store answers and the iOS manifest (`NSPrivacyCollectedDataTypeDeviceID`) describe them. The app asks only after the player makes or accepts an invite (`apps/mobile/src/features/notifications/`), and sends the push token only to our server, and only after the player taps **Turn on** in the app (also on a phone that allows pushes already, such as Android 12). A change to when the app asks, or to what the server keeps per token, updates the policy in the same PR.
