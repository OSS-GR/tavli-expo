# @tavli/crash-sentry

The `CrashReporter` port (`@tavli/contracts`) backed by Sentry, using `@sentry/react-native` ~8.28.0 (the Expo SDK 58 pin). Decision: [ADR-0003](../../../docs/decisions/0003-app-stack.md) (Sentry free tier behind a port).

## What it does

- **No DSN, no Sentry.** If `EXPO_PUBLIC_SENTRY_DSN` is missing, the app uses the no-op reporter and never starts Sentry. Dev builds (`__DEV__`) always use the no-op reporter.
- **Privacy.** `sendDefaultPii` is off. No screenshots, no view hierarchy, no session replay, no performance tracing. `beforeSend` keeps only the anonymous install id as the user (or no user at all), drops the device name, and drops the ids the native SDKs add to JS events (`contexts.device.id` on Android, `contexts.app.device_app_hash` on iOS). Never put names or emails in `captureMessage`, tags, extras or breadcrumbs.
- **Breadcrumbs.** Console breadcrumbs are dropped (a log line can hold anything). Request URLs in breadcrumbs lose their query string and fragment.
- **Opt-out.** `setEnabled(false)` closes the SDK (JS and native). From then on no new event or breadcrumb is sent. Events already handed to the transport before the opt-out may still go out while the SDK closes. If the player opted out before launch, the SDK never starts.
- **One privacy switch (#61).** The app's consent answer (`apps/mobile/src/features/privacy/consent.ts`) drives crash reports and analytics together. The rules are in `apps/mobile/src/features/crash/consent.ts`:
  - **Before an answer (anonymous mode):** JS errors are sent, with no user id and no other id. The native SDKs do not start (`enableNative: false`) and there is no session tracking (`enableAutoSessionTracking: false`). See "Anonymous mode" below.
  - **"Allow usage data" (identified mode):** reports carry the anonymous install id (`setUser`). The native SDKs run: native crashes, app hangs, ANRs and release-health sessions. If "Allow" comes while the app runs, the adapter closes Sentry and starts it again in this mode.
  - **"Don't allow":** `setEnabled(false)` and `setUser(null)`. Nothing is sent.

### Anonymous mode (before the answer, #139)

What we found in the SDK (`@sentry/react-native` 8.28.0, sentry-cocoa 9.29.0, sentry-android 8.57.0):

- The native SDKs give every event with no user a user id: their own random **installation id** (iOS `SentryClient` `setUserIdIfNoUserSet`; Android `DefaultAndroidEventProcessor.mergeUser`, which also sets `device.id`). `sendDefaultPii: false` does not turn this off.
- Native crashes, app hangs and ANRs are made and sent by the native SDK. The JS `beforeSend` never sees them, and the React Native SDK sets the native `beforeSend` itself (it only drops duplicate JS errors), so JS cannot strip the id.
- `enableNativeCrashHandling: false` is not enough on Android: it removes the crash, old ANR and NDK integrations, but not `AnrV2Integration` (Android 11+), which reports past ANRs with the installation id. The React Native SDK has no option to turn it off.
- Release-health sessions are native too, and carry the installation id as `did`.
- JS events get the native user and contexts through `fetchNativeDeviceContexts`. `beforeSend` runs after that, so for JS events the scrub works.

So before the answer the adapter does not start the native SDK at all. A report before the answer is a JS error with: the error and stack, the SDK's JS facts (platform, React Native and Hermes versions, environment), our breadcrumbs, and no user, device id or session.

Trade-offs, accepted by design:

- No native crash, app hang or ANR reports before the answer. The welcome flow asks on the first launch, so this window is short.
- JS events before the answer have no release name or native device facts (phone model, system version). The JS SDK reads those from the native SDK. Stack traces are still mapped: the bundle has Debug IDs.
- No offline queue: JS events are sent with `fetch`, so an event made with no network is lost.
- After "Allow", native crash reports from iOS can still carry Sentry's installation id instead of our install id: a crash is sent on the next launch, and the iOS SDK does not apply the scope to crash events. The privacy policy says so.
- **Never throws.** A Sentry failure must not crash the app.

## How the app uses it

| File                                               | Job                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/services.ts`                      | Picks Sentry or the no-op reporter                                                                      |
| `apps/mobile/src/features/crash/start.ts`          | Starts it first thing (imported first in `index.ts`), follows the consent store (`features/privacy`)    |
| `apps/mobile/src/features/crash/CrashBoundary.tsx` | Top-level error boundary: reports render errors and shows "Something went wrong" with a Restart button  |
| `apps/mobile/app.json`                             | `plugins`: the `@sentry/react-native/expo` config plugin (source map upload), with no options           |
| `apps/mobile/metro.config.js`                      | `getSentryExpoConfig`: adds Debug IDs to bundles and source maps                                        |
| `apps/mobile/app.json`                             | `ios.privacyManifests`: the "required reason" APIs Sentry uses, and the data Sentry and PostHog collect |

## Owner setup (one time)

Nothing here is a secret except `SENTRY_AUTH_TOKEN`. Never commit the token.

`SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_URL`, `SENTRY_AUTH_TOKEN` and `SENTRY_DISABLE_AUTO_UPLOAD` are read only by Sentry's build scripts, while the native build runs. Never pass them to the config plugin from `app.config.ts`. The app config goes into the fingerprint, which EAS makes on your computer and on the build server. A value that only EAS has (the secret token) or only your computer has (`.env.local`) makes every EAS build fail ("Runtime version calculated on local machine not equal to runtime version calculated during build"). `expo config` prints "Missing config for organization, project". That is expected: the build scripts read the env vars.

1. Sign up at [sentry.io](https://sentry.io/signup/) (free tier: 5,000 errors a month). Create a **React Native** project. Note the **organization slug**, the **project slug** and the **DSN** (Project settings → Client Keys (DSN)).
2. Add the DSN as an EAS environment variable. It is public (it ships in the app), so plain-text visibility is fine:

   ```bash
   cd apps/mobile
   eas env:create --name EXPO_PUBLIC_SENTRY_DSN --value "https://...ingest.sentry.io/..." --environment preview --environment production --visibility plaintext
   ```

   Optional: `EXPO_PUBLIC_SENTRY_ENVIRONMENT` (for example `preview`) per environment, to tell test builds apart. Without it, release builds report `production`.

3. Add the org and project slugs (not secret):

   ```bash
   eas env:create --name SENTRY_ORG --value "<org-slug>" --environment preview --environment production --visibility plaintext
   eas env:create --name SENTRY_PROJECT --value "<project-slug>" --environment preview --environment production --visibility plaintext
   ```

4. Create an **Organization Auth Token** at Sentry → Settings → Auth Tokens (it is scoped for source map upload). Add it as a **secret** EAS variable:

   ```bash
   eas env:create --name SENTRY_AUTH_TOKEN --value "<token>" --environment preview --environment production --visibility secret
   ```

   **Done (2026-10-28, #338).** Every preview and production EAS build now uploads its source maps and debug files, so stack traces point to our source. Debug builds (the `development` profiles) never upload. If a build fails at the Sentry upload step, check the token. To skip the upload while you fix it, add `SENTRY_DISABLE_AUTO_UPLOAD=true` as an EAS variable for that environment. Never put it back in `eas.json`: a value there wins over every EAS variable.

5. In the Sentry project, open **Settings → Security & Privacy** and turn on **Prevent Storing of IP Addresses**. Keep **Data Scrubber** and **Use Default Scrubbers** on. The app never sends an IP address, but Sentry could still see one from the network request.

6. **EAS Update:** after `eas update`, run `pnpm dlx sentry-expo-upload-sourcemaps dist` in `apps/mobile`. It needs `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` in your shell or in `apps/mobile/.env.local`: `eas env:exec` cannot read a secret variable. If that runs in GitHub Actions, add `SENTRY_AUTH_TOKEN` as a GitHub **repository secret** (Settings → Secrets and variables → Actions) and pass `SENTRY_ORG` and `SENTRY_PROJECT` as plain variables.
7. Optional: link the Sentry project in the EAS dashboard (Account settings → Connections → Sentry) to see crashes next to each build and update.

For a local release build with source maps, put the token, `SENTRY_ORG` and `SENTRY_PROJECT` in `apps/mobile/.env.local` (git ignores `.env*.local`). Without the token, put `SENTRY_DISABLE_AUTO_UPLOAD=true` there instead, or the release build fails at the upload step.

## Check it works

The app has no button that sends a test error. Check with Release Health instead: after "Allow usage data" the app turns on Sentry's session tracking (`IDENTIFIED_OPTIONS`).

1. Install a release build (the TestFlight build, or an EAS `preview` build) and tap **Allow usage data**. Crash reports follow that one switch.
2. Use the app for a moment, then send it to the background or close it. Sentry gets a session when it ends.
3. In Sentry, open the project → **Releases**. The build's release (for example `com.tavlaki@1.0.0+1`, environment `production` unless `EXPO_PUBLIC_SENTRY_ENVIRONMENT` is set) shows at least one session. Then the DSN, the network and the consent switch all work.
4. Real errors show under **Issues** within a minute. Their stack traces point to our source when the build uploaded its source maps (step 4), or after `sentry-expo-upload-sourcemaps` for an EAS update (step 6).

Dev builds send nothing (the no-op reporter). Before an answer only JS errors go out, with no id and no session ("Anonymous mode" above), so the Releases check needs "Allow". After "Don't allow" nothing goes out.

## Tests

`src/index.test.ts` mocks `@sentry/react-native` (Node cannot load React Native code). It runs the shared port contract (`runCrashReporterContract` from `@tavli/contracts/testing`) and checks the options, the opt-out and the privacy scrub.
