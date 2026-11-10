# Legal pages

> The privacy policy for the app and the stores (issue #90), and the terms of use (#405). Last review: 2026-11-10 (#407 ratings and leaderboards; #320 block and report on the server, #435 how to report in the app, #403 moving a guest into an account, #399 the email code and AhaSend, #404 the reminder times on the phone, #406 friends on the server).

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
| [site/.well-known/apple-app-site-association](site/.well-known/apple-app-site-association) | iOS universal links (#332): `https://tavlaki.com/i/<code>` opens the app. JSON with no file extension |
| [site/i/index.html](site/i/index.html) | The invite fallback page (#332), served for every `https://tavlaki.com/i/<code>`. English and Greek on one page |
| [site/_redirects](site/_redirects) | Host rule (Cloudflare Workers static assets, Pages, Netlify): rewrite `/i/*` to the fallback page |
| [site/_headers](site/_headers) | Host rule: serve the association file as `application/json`; `noindex` on invite pages |
| [wrangler.jsonc](wrangler.jsonc) | The Cloudflare Worker that serves `site/` at `tavlaki.com` (static files only, no code) |

The app opens the terms from the username step (`termsUrl` in `apps/mobile/src/features/online/usernameStep.ts`): `https://tavlaki.com/el/terms` when the app language is Greek, else `https://tavlaki.com/terms`.

The app opens `https://tavlaki.com/privacy` (`PRIVACY_POLICY_URL` in `apps/mobile/src/features/privacy/consent.ts`, from PR #89). It links no Greek URL today. The English page links to the Greek page at the top, and the Greek page links back.

## Rules

- **Terms of use:** the same rules: change all four terms files together. The version date at the top is `TERMS_VERSION` (`packages/contracts/src/username.ts`). Raise both only when players must accept the terms again: the app then asks each saved player before their next username change, and the server refuses a change without it (`TERMS_NEEDED`).
- **Change all four files together.** Edit the English Markdown first, then the Greek Markdown, then both HTML pages. Change the "Last updated" date in all four.
- The policy describes what the code does. When a PR changes what data leaves the phone (a new event, a new vendor, a new id), it updates this policy in the same PR. The event list must match [`docs/architecture/analytics-events.md`](../architecture/analytics-events.md). The same PR also updates the store privacy answers ([`docs/store/app-privacy.md`](../store/app-privacy.md), [`docs/store/play-data-safety.md`](../store/play-data-safety.md)) and the iOS privacy manifest in `apps/mobile/app.json`.
- The HTML pages are plain HTML with inline CSS. No JavaScript, no fonts or images from other sites, no cookies. Keep it that way: the policy says so.
- `<!-- OWNER: ... -->` comments in the Markdown mark things the owner must confirm. They are left out of the HTML. The invite fallback page has no Markdown source, so its `OWNER` comment is in the HTML.

## How to make the HTML from the Markdown

Any Markdown-to-HTML tool works. With [pandoc](https://pandoc.org):

```bash
pandoc -f gfm -t html --wrap=none docs/legal/privacy.md
```

Remove the `<!-- ... -->` comments first. Wrap each `<table>…</table>` in `<div class="table">…</div>` (it scrolls on small screens). Paste the output between `<main>` and `<footer>` in the HTML page. Keep the `<head>`, the inline CSS and the footer as they are.

## How to publish

1. The site is a Cloudflare Worker with static assets (`wrangler.jsonc`): it serves the `site/` folder as the site root, `.well-known/` included, and reads `_redirects` and `_headers`. Cloudflare builds it from `main`. See [Invite links](#invite-links-332) for the steps. (Any static host with rewrites and headers works too, such as Netlify; GitHub Pages cannot rewrite `/i/*`.)
2. Point `tavlaki.com` at the host. Both `https://tavlaki.com/privacy` and `https://tavlaki.com/el/privacy` must open the pages. Cloudflare serves `privacy/index.html` at `/privacy/` and redirects `/privacy` there.
3. Use HTTPS. Do not add analytics or cookies to the site.
4. Put `https://tavlaki.com/privacy` in App Store Connect (App Privacy → Privacy Policy URL) and in the Google Play Console (App content → Privacy policy).

## Invite links (#332)

The share link of an invite is `https://tavlaki.com/i/<code>`. On an iPhone with Tavlaki (a production build: TestFlight or the App Store), iOS opens it in the app. Anywhere else it opens the fallback page `site/i/index.html`: **Get Tavlaki**, where the code is (the end of the address), and how to enter it with **Join with a code** (#333). The page runs no script and loads nothing from other sites, like the other pages. The app side is "Invites" in [`docs/architecture/app-shell.md`](../architecture/app-shell.md#invites-256).

Owner steps (`tavlaki.com` DNS is on Cloudflare, so a Cloudflare Worker is the simplest host; any static host with rewrites and headers works):

1. In the fallback page, replace both `https://testflight.apple.com/join/OWNER-TESTFLIGHT-LINK` links with the TestFlight public link (App Store Connect → TestFlight → External Testing → your group → Public Link). After the App Store launch, use `https://apps.apple.com/app/id6828172932` and drop the beta note (both languages). This is a repo change: open a PR, or ask an agent.
2. Cloudflare dashboard → **Workers & Pages** → **Create application** → connect GitHub and pick this repo. Project name `tavlaki` (the `name` in `wrangler.jsonc`), build command empty, deploy command `npx wrangler deploy`, **Preview builds** off, and under **Advanced settings** the **Path** `docs/legal`. Pick **Create new token** for the API token. Add the build variable `SKIP_DEPENDENCY_INSTALL` = `1`: without it Cloudflare installs the whole app's packages first (it finds the pnpm workspace above the path). Each push to `main` then publishes the site. Optional: in the Worker's **Settings → Build**, set the build watch paths to `docs/legal/*`, so other pushes start no build.
3. The Worker → **Settings → Domains & Routes** → **Add** → **Custom domain** → `tavlaki.com`. Cloudflare adds the DNS record and the HTTPS certificate (the Proton Mail records stay as they are). Do not add the record by hand. The link domain is `tavlaki.com`, not `www`; never redirect `tavlaki.com` to `www`, or iOS cannot read the file. Then turn off **Email Address Obfuscation** (Security → Settings): it adds a Cloudflare script to pages that show an email address, such as the privacy policy, and the pages promise no scripts. Do not turn on Cloudflare Web Analytics for the site.
4. Check the association file: `curl -sI https://tavlaki.com/.well-known/apple-app-site-association` must answer `200`, `content-type: application/json`, and no redirect. `_headers` sets the type; if the host ignores `_headers`, set the header in the host's settings.
5. Check the fallback page: `https://tavlaki.com/i/ABCD2345` shows "Get Tavlaki" and the address stays the same. `_redirects` rewrites `/i/*` to `/i/` (status `200`, a rewrite; `/i/index.html` as the target is a loop on Cloudflare, and the deploy fails). If your host does not read `_redirects`, add the same rewrite there. Also check that `https://tavlaki.com/privacy` and `/terms` still open.
6. Make a new production build (`eas build -p ios --profile production`) and send it to TestFlight. The entitlement `applinks:tavlaki.com` is in that build only: older builds never open the link. EAS turns on the Associated Domains capability for `com.tavlaki` by itself.
7. Test on an iPhone: "Universal links" in [`docs/process/running-the-app.md`](../process/running-the-app.md#universal-links-332).

Do not add analytics, cookies or outside fonts to the site. The invite pages carry a code in the address, so `_headers` and the page ask search engines not to index them, and the page sends no referrer to the TestFlight link.

## Before you publish (owner checklist)

- [ ] Publish only after PR #89 (`feat/61-analytics`) is merged. The policy describes the consent screen and the one privacy switch from that PR. On `main` before #89, crash reports always carry the install id.
- [ ] Put your full name (or a company name) in "Who is responsible", in both languages.
- [ ] Make `privacy@tavlaki.com` work (or change it in all four files).
- [ ] Sentry: check that the organization uses the **EU** data region (Frankfurt). Sentry sets it when the organization is made, and it cannot change later. If it is the US region, change the table in the policy.
- [ ] Sentry: turn on **Prevent Storing of IP Addresses** (see `packages/adapters/crash-sentry/README.md`).
- [ ] PostHog: use an **EU** project and turn on **Discard client IP data** (see `docs/architecture/analytics-events.md`).
- [ ] Convex: check that both deployments (dev and prod) are in the EU region `eu-west-1` (Ireland), and that `BETTER_AUTH_SECRET` is set on both (`npx convex env set`, never in the repo).
- [ ] Expo: check where Expo's push service processes the data and whether its terms need a data processing agreement. Then fix the Expo row in the policy (both languages, the `OWNER` comment).
- [ ] Accept the five vendors' data processing terms (DPA: Sentry, PostHog, Convex, Expo, AhaSend) and check the line about transfers outside the EU. For AhaSend, also check that the data stays in the EU, open and click tracking are off, and logs are kept one day.
- [ ] Check the retention times on your Sentry and PostHog plans. The policy states each vendor's documented default (checked 2026-10-27).
- [ ] Have the policy checked (see the note at the top).

## Usernames (#405)

A saved account (Sign in with Apple) may pick a username; guests keep "Guest 4821". The policy's "Online games with a friend" section says what the server keeps: the name as typed, its simple form for the uniqueness check, when the name last changed, the terms version and when it was accepted, and when the age box was ticked (never the age). Usernames are user content: the terms forbid bad names, the server filters them, and the owner renames or clears a name with `clearUsername`. See `docs/store/age-rating.md` ("User-generated content rules"). The age is 16, or 13 by the phone's region (`minimumAge`): **Owner:** a lawyer checks the list.

## Friends (#406)

A saved account may add friends: by a friend link (a random token, not the user id), by an exact username, or from recent opponents. The policy's "Online games with a friend" section lists what the server keeps: the friends and their match record, the requests (a declined one for 30 days), the link token, the times of recent username searches (never the text) and the friend invites. The app never asks for the contacts permission and never reads the address book (`apps/mobile/src/noContactsPermission.test.ts`). The stores still count a friends list as "Contacts" (social graph): both store answers and the `app.json` manifest tick it.

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
