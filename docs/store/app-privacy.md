# App Store privacy labels (App Privacy)

> The answers for App Store Connect → App Privacy. Issue #137. Google Play: [play-data-safety.md](play-data-safety.md). Last review: 2026-10-28 (#281, online play with a friend).

**This is not legal advice.** The answers follow the code on `main` on 2026-10-28 and Apple's App Privacy categories as we know them. The owner gives the final answers in App Store Connect.

**Keep four things in line:** these answers, the [Play data safety form](play-data-safety.md), the [privacy policy](../legal/privacy.md) and the iOS privacy manifest (`ios.privacyManifests` in `apps/mobile/app.json`). When a PR changes what leaves the phone (a new event, a new vendor, a new id, accounts, online play), it updates all four.

## What leaves the phone (from the code)

Three services get data. Nothing else leaves the phone. Local games (vs the bot, pass-and-play) make no network calls of their own.

| Service | What | When | Code |
|---------|------|------|------|
| **Sentry** (crash reports) | The error and stack trace; device facts (model, system and version, app version, memory, screen, language, time zone); a short trail of events before the error (breadcrumbs). After Allow also native crashes, app hangs (iOS), ANRs (Android) and release-health sessions. No device name, no console lines, no query strings in URLs, no IP address in the event, no screenshots, no view hierarchy, no tracing, no replay. | Release builds with `EXPO_PUBLIC_SENTRY_DSN` only. Before an answer: **JS errors only, with no id at all** (#139: the native SDKs and sessions are off, because they add Sentry's own installation id). After **Allow usage data**: everything, **with** the install id (a native crash report from iOS may carry Sentry's installation id instead). After **Don't allow**: nothing. | `packages/adapters/crash-sentry/src/index.ts` (`scrubEvent`, `scrubBreadcrumb`, options), `apps/mobile/src/features/crash/consent.ts`, `setup.ts` |
| **PostHog EU** (usage data) | The events in [Analytics events](../architecture/analytics-events.md): app opened, game started / finished / abandoned, undo, resign, setting changed (key only), theme changed (app colors or board, and the theme id), screen viewed (route pattern), tutorial started / step / finished / skipped, hint shown (the game only), review opened (the game only), invite created (game, points and pace only). Each event carries device facts (maker, model, system and version, screen, app name and version, language, time zone), the install id and PostHog's own random ids. No session replay, no autocapture, no GeoIP. | Only after **Allow usage data**. Before that the adapter drops every call. Turning it off empties the queue and resets PostHog's ids. | `packages/adapters/analytics-posthog/src/index.ts` (`postHogOptions`, the consent gate), `apps/mobile/src/features/analytics/connect.ts` |
| **Convex** (the game server, online play with a friend, #281) | A guest account made by Better Auth's anonymous plugin: a random **user id**, made by the server, and a placeholder name and email (no real ones). The sign-in session: a random token, its expiry, and the IP address and user agent Better Auth records when the session is made. Under the user id: the player's **invites** (code, game, points, pace, status, expiry) and **online games** (both user ids, rules, every move and roll, score, turn deadlines). | Only when the player taps **Make an invite** (`/friend`) or **Show the invite** on an invite link (`/invite/<code>`): then `signInForOnline` makes the guest once (`auth.signInAsGuest()`), and the invite and game calls follow. A saved session (the cookie in the phone's secure store) is used again. Before that, opening an invite link (`/invite/<code>`) or a link to an online game (`/game/<id>`) only checks for a saved sign-in (Better Auth `getSession`, with the cookie if there is one): it makes no account and, without a saved sign-in, saves nothing and opens no game-server connection. The consent switch does not cover it: an online game cannot work without the server. The user id never goes to PostHog or Sentry. | `apps/mobile/src/features/online/account.ts`, `features/invites/`, `packages/adapters/auth-better-auth`, `packages/adapters/backend-convex`, `apps/server/convex/auth.ts` |

The **install id** is a random UUID made on the phone (`apps/mobile/src/features/install-id/installId.ts`). The app makes it only after **Allow usage data**. It is not an advertising id and does not come from the hardware. It is the "Device ID" below. The Convex **user id** is a different id: it is the "User ID" below, and it never goes to PostHog or Sentry.

What never leaves the phone: the saved settings (only the events above say that a setting or a theme changed), saved games, the pass-and-play names, the consent answer. Apple counts data as "collected" only when it leaves the device, so these are not on the label.

## Step 1: Data collection

> Do you or your third-party partners collect data from this app?

**Yes, we collect data from this app.**

## Step 2: Data types

Tick these seven. Leave every other box empty.

| Apple category | Data type | Why |
|----------------|-----------|-----|
| Identifiers | **User ID** | The guest account's random user id on Convex (online play with a friend, #281) |
| Identifiers | **Device ID** | The install id (PostHog `identify`, Sentry user id after Allow) and PostHog's random ids |
| User Content | **Gameplay Content** | The online games and invites on Convex: the moves, rolls and score of a game with a friend (#281) |
| Usage Data | **Product Interaction** | The PostHog events (app opened, games, settings, screens) |
| Diagnostics | **Crash Data** | Sentry crash and error reports |
| Diagnostics | **Performance Data** | App hangs (iOS) and ANRs (Android), after Allow only. These are Sentry native SDK defaults (checked in the SDK source in #139; not yet seen in a build). Declare them, as the manifest does. |
| Diagnostics | **Other Diagnostic Data** | Device facts and breadcrumbs in crash reports; Sentry release-health sessions (after Allow only, #139); device facts on PostHog events |

Leave empty (the app does not collect them): Contact Info (name, email, phone, address), Health and Fitness, Financial Info, Location (precise and coarse: PostHog GeoIP is off, Sentry is set not to store IPs, and the Better Auth session keeps the IP for sign-in only, never to find a place), Sensitive Info, Contacts, User Content → everything but Gameplay Content (pass-and-play names stay on the phone; the guest account has no real name or email), Browsing History, Search History, Purchases, Usage Data → Advertising Data, Usage Data → Other Usage Data, Other Data.

## Step 3: For each data type

Apple asks three questions per type. The answers match the privacy manifest in `app.json` (#139 set `NSPrivacyCollectedDataTypeLinked: true` for all five types; #281 added User ID and Gameplay Content, both linked).

| Data type | Purposes | Linked to the user? | Used for tracking? |
|-----------|----------|---------------------|--------------------|
| User ID | **App Functionality** | **Yes** | **No** |
| Device ID | **Analytics**, **App Functionality** | **Yes** | **No** |
| Gameplay Content | **App Functionality** | **Yes** | **No** |
| Product Interaction | **Analytics** | **Yes** | **No** |
| Crash Data | **App Functionality** | **Yes** | **No** |
| Performance Data | **App Functionality** | **Yes** | **No** |
| Other Diagnostic Data | **App Functionality** | **Yes** | **No** |

- **Purposes.** Apple's "App Functionality" includes keeping the app from crashing. "Analytics" covers usage data to understand how people use the app. No type is used for Third-Party Advertising, Developer's Advertising or Marketing, Product Personalization or Other Purposes.
- **Other Diagnostic Data** also rides on PostHog events (device model, system). If you want to be stricter, add **Analytics** as a second purpose. Then also add `NSPrivacyCollectedDataTypePurposeAnalytics` to that entry in `app.json` (a code change, in its own PR), so the label and the manifest still agree.
- **Tracking: No.** Apple's "tracking" means linking our data with other companies' data for ads, or sharing it with data brokers. The app has no ads, no ad SDK, no advertising id (IDFA), and does not use App Tracking Transparency. Sentry, PostHog and Convex process the data for us only. So no App Tracking Transparency prompt is needed.

### Why "linked to the user"

After **Allow usage data**, the app ties its data to the install id: `analytics.identify(getInstallId(storage))` in `features/analytics/connect.ts`, and `reporter.setUser(getInstallId(storage))` in `features/crash/setup.ts`. So every usage event, and every crash report and diagnostic after Allow, carries one persistent id. Apple treats data tied to a persistent identifier as linked, even without an account or a name. Apple asks one answer per data type, so a type that is linked some of the time is answered **Yes**. This is the safe default.

The online play data (User ID, Gameplay Content) is linked by design: the server keeps it under the user id.

**Tracking stays No**: the id is ours only, it is never combined with other companies' data, and nothing is used for ads.

**Owner:** you may still argue "not linked": no accounts, no name, email or phone, and the id is random and lives only in this install. If you choose that, keep the label and the manifest the same: set `NSPrivacyCollectedDataTypeLinked` back to `false` in `apps/mobile/app.json` (a code PR).

The iOS privacy manifest in `apps/mobile/app.json` says `NSPrivacyCollectedDataTypeLinked: true` for all seven types, and `NSPrivacyCollectedDataTypeTracking: false` (#139, #281).

## The label people will see

With the answers above, the App Store page shows:

- **Data Used to Track You:** none.
- **Data Linked to You:** Identifiers, User Content, Usage Data, Diagnostics.
- **Data Not Linked to You:** none.

## Other App Privacy fields

| Field | Value |
|-------|-------|
| Privacy Policy URL | `https://tavlaki.com/privacy` (Greek localization: `https://tavlaki.com/el/privacy`) |
| User Privacy Choices URL (optional) | `https://tavlaki.com/privacy` (the section "Turning it off" explains the switch) |

## Owner checks before you submit

- [ ] Sentry organization is in the **EU** data region, and **Prevent Storing of IP Addresses** is on (`packages/adapters/crash-sentry/README.md`, step 5).
- [ ] PostHog project is in the **EU** cloud, and **Discard client IP data** is on (`docs/architecture/analytics-events.md`, Setup). If IPs were stored, Apple could see it as coarse location.
- [ ] The app has no other SDK that sends data. Today the network SDKs are Sentry, PostHog and Convex (with Better Auth). If you add one (for example EAS Update or push), update this page first.
- [ ] In a release build, **before** answering the consent screen, trigger a JS error and look at the event in Sentry: no `user`, no `contexts.device.id`, no device name, and no session in Release Health. Then trigger a native crash: nothing should arrive, not even on the next launch. See "Pre-consent crash reports" below.
- [ ] `NSPrivacyCollectedDataTypeLinked` in `apps/mobile/app.json` matches the "linked" answers above (today: `true` for all seven).
- [ ] Both Convex deployments are in the EU (`eu-west-1`), and you accepted Convex's data processing terms (DPA). The deployments have `BETTER_AUTH_SECRET` set (`npx convex env set`; never in the repo).
- [ ] When sign-in with Apple, Google or an email link ships, redo the label: maybe Name or Email.

## Pre-consent crash reports (#139)

The promise is "before an answer, crash reports carry no id". Issue #139 checked the Sentry SDK source (`@sentry/react-native` 8.28.0, sentry-cocoa 9.29.0, sentry-android 8.57.0) and changed the adapter:

1. **Native events and sessions carry Sentry's own id.** The native SDKs set their random installation id as `user.id` on every event with no user (Android also as `device.id`), whatever `sendDefaultPii` says. Native crashes, app hangs and ANRs skip the JS scrub: the React Native SDK sets the native `beforeSend` itself. Sessions carry the same id.
2. **So before an answer the native SDK does not start** (`enableNative: false`, `enableAutoSessionTracking: false`). Only JS errors are sent, with no user and no device id. After **Allow**, the adapter starts Sentry again with the native SDK and sessions. Details: `packages/adapters/crash-sentry/README.md` ("Anonymous mode").
3. **The policy text is up to date.** It lists `game_abandoned` ("Game left"), the four tutorial events and `review_opened` ("Review opened"), and says what a crash report holds before and after the answer.

Labels: the pre-consent change does not change any box. Crash Data and Other Diagnostic Data are still collected before an answer (JS errors); Device ID, Performance Data and sessions only after Allow.
