# App Store privacy labels (App Privacy)

> The answers for App Store Connect → App Privacy. Issue #137. Google Play: [play-data-safety.md](play-data-safety.md). Last review: 2026-10-27.

**This is not legal advice.** The answers follow the code on `main` on 2026-10-27 and Apple's App Privacy categories as we know them. The owner gives the final answers in App Store Connect.

**Keep four things in line:** these answers, the [Play data safety form](play-data-safety.md), the [privacy policy](../legal/privacy.md) and the iOS privacy manifest (`ios.privacyManifests` in `apps/mobile/app.json`). When a PR changes what leaves the phone (a new event, a new vendor, a new id, accounts, online play), it updates all four.

## What leaves the phone (from the code)

Two services get data. Nothing else leaves the phone. Local games (vs the bot, pass-and-play) make no network calls of their own.

| Service | What | When | Code |
|---------|------|------|------|
| **Sentry** (crash reports) | The error and stack trace; device facts (model, system and version, app version, memory, screen, language, time zone); a short trail of events before the error (breadcrumbs). No device name, no console lines, no query strings in URLs, no IP address in the event, no screenshots, no view hierarchy, no tracing, no replay. | Release builds with `EXPO_PUBLIC_SENTRY_DSN` only. Before an answer: sent **without** the install id. After **Allow usage data**: sent **with** the install id. After **Don't allow**: nothing. | `packages/adapters/crash-sentry/src/index.ts` (`scrubEvent`, `scrubBreadcrumb`, options), `apps/mobile/src/features/crash/consent.ts`, `setup.ts` |
| **PostHog EU** (usage data) | The events in [Analytics events](../architecture/analytics-events.md): app opened, game started / finished / abandoned, undo, resign, setting changed (key only), theme changed, screen viewed (route pattern), tutorial started / step / finished / skipped. Each event carries device facts (maker, model, system and version, screen, app name and version, language, time zone), the install id and PostHog's own random ids. No session replay, no autocapture, no GeoIP. | Only after **Allow usage data**. Before that the adapter drops every call. Turning it off empties the queue and resets PostHog's ids. | `packages/adapters/analytics-posthog/src/index.ts` (`postHogOptions`, the consent gate), `apps/mobile/src/features/analytics/connect.ts` |

The **install id** is a random UUID made on the phone (`apps/mobile/src/features/install-id/installId.ts`). The app makes it only after **Allow usage data**. It is not an advertising id and does not come from the hardware. It is the "Device ID" below.

What never leaves the phone: settings, saved games, the pass-and-play names, the consent answer. Apple counts data as "collected" only when it leaves the device, so these are not on the label.

## Step 1: Data collection

> Do you or your third-party partners collect data from this app?

**Yes, we collect data from this app.**

## Step 2: Data types

Tick these five. Leave every other box empty.

| Apple category | Data type | Why |
|----------------|-----------|-----|
| Identifiers | **Device ID** | The install id (PostHog `identify`, Sentry user id after Allow) and PostHog's random ids |
| Usage Data | **Product Interaction** | The PostHog events (app opened, games, settings, screens) |
| Diagnostics | **Crash Data** | Sentry crash and error reports |
| Diagnostics | **Performance Data** | Sentry's native SDKs report app hangs (iOS) and ANRs (Android) by default. The app does not turn this off. |
| Diagnostics | **Other Diagnostic Data** | Device facts and breadcrumbs in crash reports; Sentry release-health sessions; device facts on PostHog events |

Leave empty (the app does not collect them): Contact Info (name, email, phone, address), Health and Fitness, Financial Info, Location (precise and coarse: PostHog GeoIP is off, and Sentry is set not to store IPs), Sensitive Info, Contacts, User Content (pass-and-play names stay on the phone), Browsing History, Search History, Identifiers → User ID (no accounts), Purchases, Usage Data → Advertising Data, Usage Data → Other Usage Data, Other Data.

## Step 3: For each data type

Apple asks three questions per type. The answers are the same as the privacy manifest in `app.json`.

| Data type | Purposes | Linked to the user? | Used for tracking? |
|-----------|----------|---------------------|--------------------|
| Device ID | **Analytics**, **App Functionality** | **No** | **No** |
| Product Interaction | **Analytics** | **No** | **No** |
| Crash Data | **App Functionality** | **No** | **No** |
| Performance Data | **App Functionality** | **No** | **No** |
| Other Diagnostic Data | **App Functionality** | **No** | **No** |

- **Purposes.** Apple's "App Functionality" includes keeping the app from crashing. "Analytics" covers usage data to understand how people use the app. No type is used for Third-Party Advertising, Developer's Advertising or Marketing, Product Personalization or Other Purposes.
- **Other Diagnostic Data** also rides on PostHog events (device model, system). If you want to be stricter, add **Analytics** as a second purpose. Then also add `NSPrivacyCollectedDataTypePurposeAnalytics` to that entry in `app.json` (a code change, in its own PR), so the label and the manifest still agree.
- **Tracking: No.** Apple's "tracking" means linking our data with other companies' data for ads, or sharing it with data brokers. The app has no ads, no ad SDK, no advertising id (IDFA), and does not use App Tracking Transparency. Sentry and PostHog process the data for us only. So no App Tracking Transparency prompt is needed.

### Why "not linked to the user"

Apple counts data as linked when it is tied to the user's identity, for example through an account or contact details. Tavlaki has no accounts and never collects a name, email or phone number. The install id is random, lives only in this install, and is not tied to any other id. So we answer **No**, the same as `NSPrivacyCollectedDataTypeLinked: false` in the manifest.

**Owner:** this is a judgment call. A random install id still groups events from one phone. If you want the most careful label, answer **Yes (linked)** for all five types, and change `NSPrivacyCollectedDataTypeLinked` to `true` in `app.json` in the same release. Either way, label and manifest must agree.

## The label people will see

With the answers above, the App Store page shows:

- **Data Used to Track You:** none.
- **Data Linked to You:** none.
- **Data Not Linked to You:** Identifiers, Usage Data, Diagnostics.

## Other App Privacy fields

| Field | Value |
|-------|-------|
| Privacy Policy URL | `https://tavlaki.com/privacy` (Greek localization: `https://tavlaki.com/el/privacy`) |
| User Privacy Choices URL (optional) | `https://tavlaki.com/privacy` (the section "Turning it off" explains the switch) |

## Owner checks before you submit

- [ ] Sentry organization is in the **EU** data region, and **Prevent Storing of IP Addresses** is on (`packages/adapters/crash-sentry/README.md`, step 5).
- [ ] PostHog project is in the **EU** cloud, and **Discard client IP data** is on (`docs/architecture/analytics-events.md`, Setup). If IPs were stored, Apple could see it as coarse location.
- [ ] The app has no other SDK that sends data. Today the only network SDKs are Sentry and PostHog. If you add one (for example EAS Update, push, Convex), update this page first.
- [ ] Test a native crash (not a JS error) **before** answering the consent screen, and look at the event in Sentry. Check that it has no `user.id` and no device name. See "Points to check" below.
- [ ] When accounts and online play ship (MVP2), redo the label: User ID, maybe Name or Email (sign-in), Gameplay Content, and "linked to the user" becomes **Yes**.

## Points to check in the code

These are not wrong on the label (the label already lists Device ID and diagnostics). They matter for the promise "before an answer, crash reports carry no id".

1. **Native crashes skip the JS scrub.** `scrubEvent` and `scrubBreadcrumb` run as the JS `beforeSend` and `beforeBreadcrumb`. A crash in native code (iOS or Android) is caught and sent by Sentry's native SDK. Its native `beforeSend` (in `@sentry/react-native`'s `RNSentryStart.java` and `RNSentry.mm`) only drops duplicates of JS errors; it does not call our scrub. Sentry's native SDKs may add their own random installation id as the user id when no user is set (we believe the Android SDK does). We did not confirm this in a build.
2. **Release-health sessions.** `enableAutoSessionTracking` is not set, so Sentry's default (on) applies. Sessions report app starts and crash-free state, with Sentry's own installation id. They are sent before an answer, like crash reports.

3. **The policy is behind on some events.** The privacy policy lists "Game left" as "Planned, not sent yet". The code sends it now as `game_abandoned` (`features/analytics/gameAnalytics.ts`, called from `features/match/sessions.ts`), and [Analytics events](../architecture/analytics-events.md) lists it. The four tutorial events from #135 (`tutorial_started`, `tutorial_step`, `tutorial_finished`, `tutorial_skipped`) are not in the policy either. The label is not affected (they are all Product Interaction). **Owner:** fix the policy text in all four legal files before launch.

If the test in point 1 shows an id before consent, open an issue: either set `enableAutoSessionTracking: false` and scrub native events (Sentry's native options), or change the policy text "sent, with no install id" to say Sentry adds its own random id.
