# Google Play data safety form

> The answers for Play Console → App content → Data safety. Issue #137. Apple: [app-privacy.md](app-privacy.md). Last review: 2026-10-27.

**This is not legal advice.** The answers follow the code on `main` on 2026-10-27 and the Data safety categories as we know them. The owner gives the final answers in the Play Console.

The facts (what leaves the phone, when, and the code that does it) are in [app-privacy.md → What leaves the phone](app-privacy.md#what-leaves-the-phone-from-the-code). This page puts the same facts in Google's format. Change both pages, the [privacy policy](../legal/privacy.md) and the iOS manifest in `apps/mobile/app.json` together.

## Google's words

- **Collected:** the data leaves the phone (to us or to a service we use).
- **Shared:** the data goes to another company for its **own** use. Data that a service provider (Sentry, PostHog) processes **for us**, under its terms, is not "shared".
- **Processed ephemerally:** used in memory only and not stored. Our data is stored, so the answer is always **No**.
- **Optional:** the user can choose if the data is collected.

## Section 1: Data collection and security

| Question | Answer | Why |
|----------|--------|-----|
| Does your app collect or share any of the required user data types? | **Yes** | Crash reports and opt-in usage data |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | Both SDKs send over HTTPS (`https://eu.i.posthog.com`, the Sentry DSN is `https://…`). **Owner:** check that the DSN starts with `https://`. |
| Which methods of account creation does your app support? | **My app does not allow users to create an account** | No accounts yet (MVP2) |
| Do you provide a way for users to request that their data is deleted? | **Yes**. Method: an email to `privacy@tavlaki.com` | The [privacy policy](../legal/privacy.md#your-rights) promises deletion on request by that email, so the form must say Yes. The app does not show the install id yet, so finding one person's data can be hard; the policy says so. Showing the id in Settings would help (an idea in [legal/README.md](../legal/README.md#ideas-for-later-app-changes-not-part-of-90)). **Owner:** make `privacy@tavlaki.com` work before launch. |
| Independent security review | Leave off | — |

## Section 2: Data types

Tick these four. Leave every other type empty.

| Category | Data type | What it is in Tavlaki |
|----------|-----------|-----------------------|
| App activity | **App interactions** | The PostHog events: app opened, game started / finished / abandoned, undo, resign, setting changed, theme changed, screen viewed, tutorial started / step / finished / skipped, review opened |
| App info and performance | **Crash logs** | Sentry crash and error reports |
| App info and performance | **Diagnostics** | Device facts and breadcrumbs in crash reports; after Allow also app hangs / ANRs and Sentry sessions; device facts on PostHog events |
| Device or other IDs | **Device or other IDs** | The random install id and PostHog's random ids |

Leave empty: Location (approximate and precise: PostHog GeoIP is off, Sentry is set not to store IPs), Personal info (name, email, user IDs, address, phone, and the rest), Financial info, Health and fitness, Messages, Photos and videos, Audio files, Files and docs, Calendar, Contacts, App activity → In-app search, Installed apps, Other user-generated content (pass-and-play names stay on the phone), Other actions, Web browsing, App info and performance → Other app performance data.

## Section 3: Questions for each data type

| Data type | Collected | Shared | Processed ephemerally | Required or optional | Purposes |
|-----------|-----------|--------|-----------------------|----------------------|----------|
| App interactions | Yes | No | No | **Optional** | **Analytics** |
| Crash logs | Yes | No | No | **Required** (see note) | **Analytics** |
| Diagnostics | Yes | No | No | **Required** (see note) | **Analytics** |
| Device or other IDs | Yes | No | No | **Optional** | **Analytics** |

- **Purposes.** Google's "Analytics" includes "monitor app health, diagnose and fix bugs or crashes". So crash logs and diagnostics go under Analytics, not App functionality. (Apple puts crash data under App Functionality. That is a difference in the two forms, not in the facts.) No data is used for App functionality, Developer communications, Advertising or marketing, Fraud prevention, Personalization or Account management.
- **Required or optional.** Usage data and the install id are sent only after **Allow usage data**, so App interactions and Device or other IDs are **Optional**. Crash reports (JS errors, with their device facts and breadcrumbs) are sent **before** the first answer, so users cannot fully opt out of them: answer **Required**, even though **Don't allow** and the Settings switch turn them off later.
- **Device or other IDs** before an answer: none. The app sends no install id, and since #139 Sentry's native SDK (which adds its own random id to native events and sessions) does not start before **Allow** (see [app-privacy.md → Pre-consent crash reports](app-privacy.md#pre-consent-crash-reports-139)). So **Optional** is right. If a build shows an id before the answer, open a bug and change this to **Required** until it is fixed.

## What the Play listing will show

- **No data shared with third parties.**
- **Data collected:** App activity, App info and performance, Device or other IDs.
- **Data is encrypted in transit.**
- **You can request that data be deleted.**

## Other App content forms in the Play Console

| Form | Answer |
|------|--------|
| Privacy policy | `https://tavlaki.com/privacy` |
| Ads | **No, my app does not contain ads** |
| App access | **All functionality is available without special access** (no sign-in) |
| Advertising ID | **No**, the app does not use an advertising ID. **Owner:** check that the release build's merged `AndroidManifest.xml` has no `com.google.android.gms.permission.AD_ID` permission (no dependency should add it today). |
| Content rating | See [age-rating.md](age-rating.md) |
| Target audience and content | See [age-rating.md](age-rating.md#google-play-target-audience) |
| Government apps, Financial features, Health | Not one of these |

## Owner checks before you submit

- [ ] Sentry: EU data region, **Prevent Storing of IP Addresses** on.
- [ ] PostHog: EU cloud, **Discard client IP data** on.
- [ ] The answers here and in [app-privacy.md](app-privacy.md) say the same thing.
- [ ] Redo this form when accounts, online play, push or EAS Update ship. Then Personal info (user IDs, maybe name or email), shared data and account deletion (a web link is required for apps with accounts) change.
