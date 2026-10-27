# @tavli/crash-sentry

The `CrashReporter` port (`@tavli/contracts`) backed by Sentry, using `@sentry/react-native` ~8.28.0 (the Expo SDK 58 pin). Decision: [ADR-0003](../../../docs/decisions/0003-app-stack.md) (Sentry free tier behind a port).

## What it does

- **No DSN, no Sentry.** If `EXPO_PUBLIC_SENTRY_DSN` is missing, the app uses the no-op reporter and never starts Sentry. Dev builds (`__DEV__`) always use the no-op reporter.
- **Privacy.** `sendDefaultPii` is off. No screenshots, no view hierarchy, no session replay, no performance tracing. `beforeSend` keeps only the anonymous install id as the user and drops the device name. Never put names or emails in `captureMessage`, tags, extras or breadcrumbs.
- **Breadcrumbs.** Console breadcrumbs are dropped (a log line can hold anything). Request URLs in breadcrumbs lose their query string and fragment.
- **Opt-out.** `setEnabled(false)` closes the SDK (JS and native). From then on no new event or breadcrumb is sent. Events already handed to the transport before the opt-out may still go out while the SDK closes. If the player opted out before launch, the SDK never starts. Today there is no opt-out setting yet; `apps/mobile/src/features/crash/consent.ts` is the hook for it (TODO #61).
- **Never throws.** A Sentry failure must not crash the app.

## How the app uses it

| File                                               | Job                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/mobile/src/services.ts`                      | Picks Sentry or the no-op reporter                                                                     |
| `apps/mobile/src/features/crash/start.ts`          | Starts it first thing (imported first in `index.ts`), sets the install id, follows the privacy setting |
| `apps/mobile/src/features/crash/CrashBoundary.tsx` | Top-level error boundary: reports render errors and shows "Something went wrong" with a Restart button |
| `apps/mobile/app.config.ts`                        | Adds the `@sentry/react-native/expo` config plugin (source map upload)                                 |
| `apps/mobile/metro.config.js`                      | `getSentryExpoConfig`: adds Debug IDs to bundles and source maps                                       |
| `apps/mobile/app.json`                             | `ios.privacyManifests`: the "required reason" APIs Sentry uses                                         |

## Owner setup (one time)

Nothing here is a secret except `SENTRY_AUTH_TOKEN`. Never commit the token.

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

   Until this token exists, `app.config.ts` sets `disableAutoUpload`, so EAS builds still pass. Crash reports still arrive, but stack traces are not mapped to our source.

5. In the Sentry project, open **Settings → Security & Privacy** and turn on **Prevent Storing of IP Addresses**. Keep **Data Scrubber** and **Use Default Scrubbers** on. The app never sends an IP address, but Sentry could still see one from the network request.

6. **EAS Update** (later): after `eas update`, run `pnpm dlx sentry-expo-upload-sourcemaps dist` in `apps/mobile`. If that runs in GitHub Actions, add `SENTRY_AUTH_TOKEN` as a GitHub **repository secret** (Settings → Secrets and variables → Actions) and pass `SENTRY_ORG` and `SENTRY_PROJECT` as plain variables.
7. Optional: link the Sentry project in the EAS dashboard (Account settings → Connections → Sentry) to see crashes next to each build and update.

For a local release build with source maps, put the token in `apps/mobile/.env.local` (git ignores `.env*.local`).

## Check it works

Make a release build (for example the EAS `preview` profile), then trigger an error from a dev-only button. It shows in Sentry within a minute. Dev builds send nothing.

## Tests

`src/index.test.ts` mocks `@sentry/react-native` (Node cannot load React Native code). It runs the shared port contract (`runCrashReporterContract` from `@tavli/contracts/testing`) and checks the options, the opt-out and the privacy scrub.
