# App Store privacy labels (App Privacy)

> The answers for App Store Connect → App Privacy. Issue #137. Google Play: [play-data-safety.md](play-data-safety.md). Last review: 2026-11-13 (#320, block and report; #406, friends; #407, ratings; #531, Play ranked).

**This is not legal advice.** The answers follow the code on `main` on 2026-10-28 and Apple's App Privacy categories as we know them. The owner gives the final answers in App Store Connect.

**Keep four things in line:** these answers, the [Play data safety form](play-data-safety.md), the [privacy policy](../legal/privacy.md) and the iOS privacy manifest (`ios.privacyManifests` in `apps/mobile/app.json`). When a PR changes what leaves the phone (a new event, a new vendor, a new id, accounts, online play), it updates all four.

## What leaves the phone (from the code)

Four services get data. Nothing else leaves the phone. Local games (vs the bot, pass-and-play) make no network calls of their own.

| Service | What | When | Code |
|---------|------|------|------|
| **Sentry** (crash reports) | The error and stack trace; device facts (model, system and version, app version, memory, screen, language, time zone); a short trail of events before the error (breadcrumbs). After Allow also native crashes, app hangs (iOS), ANRs (Android) and release-health sessions. No device name, no console lines, no query strings in URLs, no IP address in the event, no screenshots, no view hierarchy, no tracing, no replay. | Release builds with `EXPO_PUBLIC_SENTRY_DSN` only. Before an answer: **JS errors only, with no id at all** (#139: the native SDKs and sessions are off, because they add Sentry's own installation id). After **Allow usage data**: everything, **with** the install id (a native crash report from iOS may carry Sentry's installation id instead). After **Don't allow**: nothing. | `packages/adapters/crash-sentry/src/index.ts` (`scrubEvent`, `scrubBreadcrumb`, options), `apps/mobile/src/features/crash/consent.ts`, `setup.ts` |
| **PostHog EU** (usage data) | The events in [Analytics events](../architecture/analytics-events.md): app opened, game started / finished / abandoned, undo, resign, setting changed (key only), theme changed (app colors or board, and the theme id), screen viewed (route pattern), tutorial started / step / finished / skipped, hint shown (the game only), review opened (the game only), invite created (game, points and pace only), push permission answered (granted or denied only), online sign-in (`apple` or `guest` only). Each event carries device facts (maker, model, system and version, screen, app name and version, language, time zone), the install id and PostHog's own random ids. No session replay, no autocapture, no GeoIP. | Only after **Allow usage data**. Before that the adapter drops every call. Turning it off empties the queue and resets PostHog's ids. | `packages/adapters/analytics-posthog/src/index.ts` (`postHogOptions`, the consent gate), `apps/mobile/src/features/analytics/connect.ts` |
| **Convex** (the game server, online play with a friend, #281) | An account with a random **user id**, made by the server, and a **guest name**: "Guest" and 4 random digits, picked by the server with `createCryptoRng` at the first invite or game, not unique, shown to the other player (#400, `playerNames`). A guest account (Better Auth's anonymous plugin) has a placeholder name and email (no real ones). **Sign in with Apple** (#401, iPhone, only if the player picks it) adds the **Apple id** (Apple's `sub` for our team), the **email** Apple gives (the person's own or a Hide My Email relay), Apple's id token (encrypted, `account` row) and Apple's refresh token (encrypted, `appleTokens`, kept only to revoke it on delete, #398). Never Apple's name or photo. **An email code** (#399, only if the player picks it) adds the **email address** the player types, kept as the sign-in key (an `account` row and its `authKeys` claim); the code and the send log are only HMACs (the code for 5 minutes, the log for a day, `emailCodes` and `emailCodeSends`). The sign-in session: a random token, its expiry, and the IP address and user agent Better Auth records when the session is made. Under the user id: the player's **invites** (code, game, points, pace, status, expiry) and **online games** (both user ids, rules, every move and roll, score, turn deadlines; while a turn is played, its moves so far, deleted when the turn is saved, #374). | Only when the player taps **Make an invite** (`/friend`) or opens an invite link (`/invite/<code>`), and picks a way in the sign-in choices (#401): **Continue as a guest** (`signInForOnline` makes the guest once, `auth.signInAsGuest()`) or **Continue with Apple** (`signInWithApple`, `features/online/signIn.ts`). **Not now** signs in nothing. Then the invite and game calls follow. A saved session (the cookie in the phone's secure store) is used again. Before that, opening an invite link (`/invite/<code>`) or a link to an online game (`/game/<id>`) only checks for a saved sign-in (Better Auth `getSession`, with the cookie if there is one): it makes no account and, without a saved sign-in, saves nothing and opens no game-server connection. The consent switch does not cover it: an online game cannot work without the server. The user id, the Apple id and the email never go to PostHog or Sentry. The player can delete it all in the app (**Settings → Account → Delete my account**, #315, #402; see below). | `apps/mobile/src/features/online/account.ts`, `features/online/deleteData.ts`, `features/invites/`, `packages/adapters/auth-better-auth`, `packages/adapters/backend-convex`, `apps/server/convex/auth.ts` |
| **Convex** (ratings, #407; saved accounts only) | The **rating** of a saved player (FIBS formula, 1500 to start), its experience points and the number of rated matches; "Show me on the global board" (on by default); and per pair of players the count of rated matches on their last day (at most 3 a day count). Only matches between two saved accounts count; never a guest's match or a match ended by an account delete. The friends board shows friends' names and ratings; the global board shows the top 50 with a username and 5 rated matches. | When a match between two saved accounts ends; the boards when a saved player opens them. | `apps/server/convex/ratings.ts`, `packages/online/src/ratings.ts`, `packages/adapters/backend-convex/src/ratings.ts` |
| **Convex** (Play ranked, #531; saved accounts only) | A **seek** (`seeks` table): the user id, the game (Portes, Plakoto, Fevga or Tavli), the rating at that time and when the player asked; after a match, the game id. The matching job pairs two seeks of the same game with close ratings (never a block either way, at most 3 rated matches of a pair a day) and starts a normal online game (2-minute turns, to 3 points, rated). The two players then see each other's name and rating: they are usually strangers. Others see only how many players wait for each game. A seek goes on cancel, after 5 minutes with no match, or 10 minutes after the match; the account delete deletes it. | Only when a saved player asks for a ranked match. | `apps/server/convex/matchmaking.ts`, `packages/online/src/matchmaking.ts`, `packages/adapters/backend-convex/src/matchmaking.ts` |
| **Convex** (friends, #406; saved accounts only) | The **friends list**: for each friendship both user ids, since when, and the match record between the two; **friend requests** (who asked whom, when; a declined one stays 30 days so the sender cannot ask again before then); the **friend link** token (random, `createCryptoRng`, resettable, never the user id); the times of recent username searches (not the search text), for the limit of 30 an hour; friend invites (an invite row with `to`, and a push with the fixed text "A friend invites you to a game." and the invite code). No contact matching: the app never reads the address book, and no call takes a phone number or email. A block ends the friendship. | Only when a saved player opens the friends screens: share or open a friend link, search a username, ask, answer, invite or remove a friend. | `apps/server/convex/friends.ts`, `friendEdges.ts`, `packages/online/src/friends.ts`, `packages/adapters/backend-convex/src/friends.ts` |
| **AhaSend** (the email code, #399) | The email address and the email with the code, to deliver it. Open and click tracking off; AhaSend keeps the delivery record for one day and no copy of the text (`retention` in `@tavli/mail-ahasend`). | Only when the player asks for an email code (the screen is #433). | `packages/adapters/mail-ahasend`, `apps/server/convex/mail.ts`, `apps/server/convex/keyPlugin.ts` |
| **Convex** and **Expo** (turn notifications, #285) | The phone's Expo **push token** and its system (`ios` or `android`), under the user id; at most 5 per player. To send a push, the server gives Expo the token, a fixed text ("Your turn", or "Your game is over. See the result." when an async match ends, #316) and the game id. Expo passes it to Apple's or Google's push service. No name, no email, no moves. | Only after the player turns on turn notifications: the app offers them after the player makes or accepts an **async** invite, or from **Settings → Turn notifications**. Never at first launch. The token is sent only when the phone allows notifications and a guest account exists. It is removed on sign-out and by **Delete my account**, when Expo says the phone no longer takes pushes, and when a sixth phone is added. The token never goes to PostHog or Sentry; PostHog gets only the answer (granted or denied), after Allow. | `apps/mobile/src/features/notifications/`, `packages/adapters/notifications-expo`, `packages/adapters/backend-convex/src/pushTokens.ts`, `apps/server/convex/push.ts` |

The **install id** is a random UUID made on the phone (`apps/mobile/src/features/install-id/installId.ts`). The app makes it only after **Allow usage data**. It is not an advertising id and does not come from the hardware. It is the "Device ID" below. The Convex **user id** is a different id: it is the "User ID" below, and it never goes to PostHog or Sentry. The **push token** is a third id: a random address for this app on this phone, made by Apple or Google. We count it as "Device ID" too (App Functionality), to be safe.

What never leaves the phone: the saved settings (only the events above say that a setting or a theme changed), saved games, the pass-and-play names, the consent answer. Apple counts data as "collected" only when it leaves the device, so these are not on the label.

## Step 1: Data collection

> Do you or your third-party partners collect data from this app?

**Yes, we collect data from this app.**

## Step 2: Data types

Tick these nine. Leave every other box empty.

| Apple category | Data type | Why |
|----------------|-----------|-----|
| Contact Info | **Email Address** | The email Apple gives with Sign in with Apple (the person's own or a Hide My Email relay), kept on Convex with the account (#401), or the address the player types for the email code (#399). Only when the player picks Apple or the email code. |
| Identifiers | **User ID** | The guest account's random user id on Convex (online play with a friend, #281), its guest name ("Guest" and 4 random digits, picked by the server, #400) and the username a saved account picks (#405): Apple's User ID covers a screen name or handle |
| Identifiers | **Device ID** | The install id (PostHog `identify`, Sentry user id after Allow), PostHog's random ids, and the push token on Convex (turn notifications, #285) |
| Contacts | **Contacts** | The friends list on Convex (#406): Apple's "Contacts" includes a social graph. The app never reads the phone's address book. |
| User Content | **Gameplay Content** | The online games and invites on Convex: the moves, rolls and score of a game with a friend (#281), and a saved account's rating and its rated match count (#407, shown to friends and, with "Show me on the global board" on, on the global board with the username) |
| Usage Data | **Product Interaction** | The PostHog events (app opened, games, settings, screens) |
| Diagnostics | **Crash Data** | Sentry crash and error reports |
| Diagnostics | **Performance Data** | App hangs (iOS) and ANRs (Android), after Allow only. These are Sentry native SDK defaults (checked in the SDK source in #139; not yet seen in a build). Declare them, as the manifest does. |
| Diagnostics | **Other Diagnostic Data** | Device facts and breadcrumbs in crash reports; Sentry release-health sessions (after Allow only, #139); device facts on PostHog events |

Leave empty (the app does not collect them): Contact Info → everything but Email Address (name, phone, address; Apple's name is never kept), Health and Fitness, Financial Info, Location (precise and coarse: PostHog GeoIP is off, Sentry is set not to store IPs, and the Better Auth session keeps the IP for sign-in only, never to find a place), Sensitive Info, User Content → everything but Gameplay Content (pass-and-play names stay on the phone; the guest account has no real name or email), Browsing History, Search History (the server keeps only the times of username searches, for the limit, never the text), Purchases, Usage Data → Advertising Data, Usage Data → Other Usage Data, Other Data.

## Step 3: For each data type

Apple asks three questions per type. The answers match the privacy manifest in `app.json` (#139 set `NSPrivacyCollectedDataTypeLinked: true` for all five types; #281 added User ID and Gameplay Content, both linked; #401 added Email Address, linked; #406 added Contacts, linked).

| Data type | Purposes | Linked to the user? | Used for tracking? |
|-----------|----------|---------------------|--------------------|
| Email Address | **App Functionality** | **Yes** | **No** |
| User ID | **App Functionality** | **Yes** | **No** |
| Device ID | **Analytics**, **App Functionality** | **Yes** | **No** |
| Contacts | **App Functionality** | **Yes** | **No** |
| Gameplay Content | **App Functionality** | **Yes** | **No** |
| Product Interaction | **Analytics** | **Yes** | **No** |
| Crash Data | **App Functionality** | **Yes** | **No** |
| Performance Data | **App Functionality** | **Yes** | **No** |
| Other Diagnostic Data | **App Functionality** | **Yes** | **No** |

- **Purposes.** Apple's "App Functionality" includes keeping the app from crashing. "Analytics" covers usage data to understand how people use the app. No type is used for Third-Party Advertising, Developer's Advertising or Marketing, Product Personalization or Other Purposes.
- **Other Diagnostic Data** also rides on PostHog events (device model, system). If you want to be stricter, add **Analytics** as a second purpose. Then also add `NSPrivacyCollectedDataTypePurposeAnalytics` to that entry in `app.json` (a code change, in its own PR), so the label and the manifest still agree.
- **Tracking: No.** Apple's "tracking" means linking our data with other companies' data for ads, or sharing it with data brokers. The app has no ads, no ad SDK, no advertising id (IDFA), and does not use App Tracking Transparency. Sentry, PostHog, Convex and Expo process the data for us only. So no App Tracking Transparency prompt is needed.

### Why "linked to the user"

After **Allow usage data**, the app ties its data to the install id: `analytics.identify(getInstallId(storage))` in `features/analytics/connect.ts`, and `reporter.setUser(getInstallId(storage))` in `features/crash/setup.ts`. So every usage event, and every crash report and diagnostic after Allow, carries one persistent id. Apple treats data tied to a persistent identifier as linked, even without an account or a name. Apple asks one answer per data type, so a type that is linked some of the time is answered **Yes**. This is the safe default.

The online play data (Email Address, User ID, Contacts, Gameplay Content) is linked by design: the server keeps it under the user id.

**Tracking stays No**: the id is ours only, it is never combined with other companies' data, and nothing is used for ads.

**Owner:** for the install id and the diagnostics you may still argue "not linked": no name or phone, and the id is random and lives only in this install. (The online data, and the Apple email, stay linked.) If you choose that, keep the label and the manifest the same: set `NSPrivacyCollectedDataTypeLinked` back to `false` in `apps/mobile/app.json` (a code PR).

The iOS privacy manifest in `apps/mobile/app.json` says `NSPrivacyCollectedDataTypeLinked: true` for all nine types, and `NSPrivacyCollectedDataTypeTracking: false` (#139, #281, #401, #406).

## The label people will see

With the answers above, the App Store page shows:

- **Data Used to Track You:** none.
- **Data Linked to You:** Contact Info, Contacts, Identifiers, User Content, Usage Data, Diagnostics.
- **Data Not Linked to You:** none.

## Delete my account (#315, #402)

Apple asks apps that make an account to let people delete it in the app (App Review Guideline 5.1.1(v)). The guest account is an account, so the app has **Settings → Account → Delete my account** (a guest sees **Delete my guest account**, #402). The Account row is in every build with online play; the delete row shows when the phone is signed in. After a confirm dialog, the app takes the push token off the server, calls `deleteMyAccount` (`apps/server/convex/account.ts`, #302), signs out and forgets its account note (`apps/mobile/src/features/online/deleteData.ts`). The server resigns the games in progress, deletes the invites the player made, the push tokens, the username, the Better Auth user and its sessions, cancels Sign in with Apple at Apple, and keeps finished games under the old random id, which leads to no account. The policy says this in "Delete your account". In App Review notes, say where the row is: Settings → Account, after an online game or invite on that phone (or after Continue with Apple there).

## Other App Privacy fields

| Field | Value |
|-------|-------|
| Privacy Policy URL | `https://tavlaki.com/privacy` (Greek localization: `https://tavlaki.com/el/privacy`) |
| User Privacy Choices URL (optional) | `https://tavlaki.com/privacy` (the section "Turning it off" explains the switch) |

## Owner checks before you submit

- [ ] Sentry organization is in the **EU** data region, and **Prevent Storing of IP Addresses** is on (`packages/adapters/crash-sentry/README.md`, step 5).
- [ ] PostHog project is in the **EU** cloud, and **Discard client IP data** is on (`docs/architecture/analytics-events.md`, Setup). If IPs were stored, Apple could see it as coarse location.
- [ ] The app has no other SDK that sends data. Today the network SDKs are Sentry, PostHog, Convex (with Better Auth) and Expo Notifications (the push token, #285). If you add one (for example EAS Update), update this page first.
- [ ] In a release build, **before** answering the consent screen, trigger a JS error and look at the event in Sentry: no `user`, no `contexts.device.id`, no device name, and no session in Release Health. Then trigger a native crash: nothing should arrive, not even on the next launch. See "Pre-consent crash reports" below.
- [ ] `NSPrivacyCollectedDataTypeLinked` in `apps/mobile/app.json` matches the "linked" answers above (today: `true` for all nine).
- [ ] Both Convex deployments are in the EU (`eu-west-1`), and you accepted Convex's data processing terms (DPA). The deployments have `BETTER_AUTH_SECRET` set (`npx convex env set`; never in the repo).
- [ ] Check where Expo's push service processes the data, and whether its terms need a data processing agreement (DPA).
- [ ] Email Address is ticked since Sign in with Apple (#401). Usernames (#405) are screen names, so they fall under User ID (Apple: "screen name, handle"), not Name or Other User Content. The server also keeps when the player accepted the terms and ticked the age box: no age or birthday. Blocks and reports (#320) are tied to the user id: a report keeps a reason from a fixed list and the reported username, with no free text, so no new data type (User ID covers them). The email code (#399) needs no new type: Email Address covers it (App Functionality, linked, no tracking). Ratings (#407) are computed from the online games: Gameplay Content covers them, so the privacy manifest (`apps/mobile/app.json`) needs no new type. A Play ranked seek (#531) holds the user id, the game, the rating and the time: User ID and Gameplay Content cover it, so again no new type in the label or the manifest. When Google ships, check the label again.

## Pre-consent crash reports (#139)

The promise is "before an answer, crash reports carry no id". Issue #139 checked the Sentry SDK source (`@sentry/react-native` 8.28.0, sentry-cocoa 9.29.0, sentry-android 8.57.0) and changed the adapter:

1. **Native events and sessions carry Sentry's own id.** The native SDKs set their random installation id as `user.id` on every event with no user (Android also as `device.id`), whatever `sendDefaultPii` says. Native crashes, app hangs and ANRs skip the JS scrub: the React Native SDK sets the native `beforeSend` itself. Sessions carry the same id.
2. **So before an answer the native SDK does not start** (`enableNative: false`, `enableAutoSessionTracking: false`). Only JS errors are sent, with no user and no device id. After **Allow**, the adapter starts Sentry again with the native SDK and sessions. Details: `packages/adapters/crash-sentry/README.md` ("Anonymous mode").
3. **The policy text is up to date.** It lists `game_abandoned` ("Game left"), the four tutorial events and `review_opened` ("Review opened"), and says what a crash report holds before and after the answer.

Labels: the pre-consent change does not change any box. Crash Data and Other Diagnostic Data are still collected before an answer (JS errors); Device ID, Performance Data and sessions only after Allow.
