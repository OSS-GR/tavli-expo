# Running the app

> Living document. Last review: 2026-10-28. Issues #39, #257.

This guide is for the owner. It shows every way to run Tavlaki without paid Apple or Google accounts. Follow the parts in order the first time.

## Before you start

**Why not Expo Go?** Tavlaki uses native modules (Skia, Unistyles with Nitro, MMKV, Reanimated). Expo Go cannot load them. You need a **development build**: your own copy of the app with these modules built in. It also has the Expo dev menu.

**When to rebuild.** You build the native app once. After that you only change JavaScript, and Metro (the dev server) sends the new code to the app in seconds. Rebuild only when:

- a package with native code is added or updated (the PR says so),
- `apps/mobile/app.json`, `app.config.ts` or a config plugin changes,
- we move to a new Expo SDK.

**Native folders are generated.** We use **CNG** (Continuous Native Generation). The `ios/` and `android/` folders in `apps/mobile` are made from `app.json` and `app.config.ts`. Git ignores them. Never edit them by hand. To reset them, run `npx expo prebuild --clean`.

**App variants.** One phone can hold three Tavlaki apps side by side:

| Variant | App name | App id | Used by |
| --- | --- | --- | --- |
| `development` (default) | Tavlaki Dev | `com.tavlaki.dev` | `npx expo run:*`, EAS `development*` profiles |
| `preview` | Tavlaki Preview | `com.tavlaki.preview` | EAS `preview` profile |
| `production` | Tavlaki | `com.tavlaki` | EAS `production` profile (store, later) |

The `APP_VARIANT` env var picks the variant (see `apps/mobile/app.config.ts`). Local builds use `development`. **Why:** a free Apple ID reserves every bundle id it signs. A reserved `com.tavlaki` could block the paid Apple account at launch. So we only sign `com.tavlaki` once the paid account exists.

### Which server the app uses

Online games talk to a Convex deployment (#257). The variant picks it:

| Variant | Convex deployment | URL |
| --- | --- | --- |
| `development` | dev | `https://exciting-reindeer-792.eu-west-1.convex.cloud` |
| `preview` | prod | `https://superb-dog-503.eu-west-1.convex.cloud` |
| `production` | prod | `https://superb-dog-503.eu-west-1.convex.cloud` |

Sign-in (Better Auth, #266) uses the same deployment's **site URL**: the same name with `.convex.site` in place of `.convex.cloud` (for example `https://superb-dog-503.eu-west-1.convex.site`).

**How it works.** `apps/mobile/app.config.ts` puts the URL in `extra.convexUrl` and the site URL in `extra.convexSiteUrl`. The app reads them in one place: `apps/mobile/src/convexUrl.ts` (`convexServer()`, used by `services.ts`). Without both URLs, online play is off (`auth` and `games` in `services.ts` are `undefined`). Expo evaluates `app.config.ts` both for `npx expo start` (Metro sends the config to the dev build) and for EAS builds (the config is built into the app). So one table covers local runs and cloud builds, and `eas.json` needs no URL: its profiles only set `APP_VARIANT`. The URLs are public, so they may be in the repo. The deploy keys are not (see [online game service](../architecture/online-game-service.md#deploy)).

**Use your own deployment.** Set `EXPO_PUBLIC_CONVEX_URL`. It wins over the variant. Then restart Metro:

```bash
# for one run
EXPO_PUBLIC_CONVEX_URL=https://your-name-123.eu-west-1.convex.cloud npx expo start

# or keep it in apps/mobile/.env.local (git ignores it)
echo 'EXPO_PUBLIC_CONVEX_URL=https://your-name-123.eu-west-1.convex.cloud' > .env.local
```

The site URL follows: `https://your-name-123.eu-west-1.convex.site`. Set `EXPO_PUBLIC_CONVEX_SITE_URL` only when it is somewhere else, for example a custom domain.

For a local Convex backend, an `http://` URL works too. A local backend has no `.convex.cloud` name, so also set its site URL, or online play stays off:

```bash
EXPO_PUBLIC_CONVEX_URL=http://127.0.0.1:3210 EXPO_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211 npx expo start
```

To try prod from a dev build, set `EXPO_PUBLIC_CONVEX_URL` to the prod URL. An EAS build reads both variables from the EAS environment variables, if you set them there. Check the result with `npx expo config --type public` (look at `extra.convexUrl` and `extra.convexSiteUrl`).

**Updates (`eas update`) carry the URL too.** The URL is fixed when the bundle is built. Run `eas update` with the same `APP_VARIANT` as the build it targets (for example `APP_VARIANT=production eas update --channel production`). Without `APP_VARIANT`, the bundle gets the dev URL, and a store build that loads it talks to dev. A stray `EXPO_PUBLIC_CONVEX_URL` or `EXPO_PUBLIC_CONVEX_SITE_URL` in your shell or `.env.local` also goes into the bundle, so clear it first.

**Setup once** (all parts):

1. Install Node 22 and pnpm (see the README).
2. In the repo root, run `pnpm install`.
3. Run every app command below from `apps/mobile`:

   ```bash
   cd apps/mobile
   ```

## 1. iOS simulator on the Mac

Needs: a Mac with **Xcode 26.4 or newer** (Expo SDK 58 needs it). No Apple account.

**Set up Xcode once:**

1. Install **Xcode** from the Mac App Store. Open it once and accept the license.
2. Xcode > **Settings** > **Locations**: pick the newest **Command Line Tools**.
3. Xcode > **Settings** > **Components**: under **iOS**, click **Get** to install a simulator.

**Run the app:**

```bash
npx expo run:ios
```

The first run builds all native code. It takes 10–20 minutes. Later runs are much faster. When it is done, the simulator opens Tavlaki Dev, and Metro keeps running in the terminal.

**Next days:** the app stays installed on the simulator. Just start Metro and press `i`:

```bash
npx expo start
```

## 2. Your iPhone with a free Apple ID

Needs: the Mac with Xcode (part 1), your iPhone, a USB cable, your normal Apple ID. No paid account.

**Set up once:**

1. Xcode > **Settings** > **Accounts** > **+** > **Apple ID**. Sign in. Xcode makes a free **Personal Team** for you.
2. Plug in the iPhone. Unlock it and tap **Trust**.
3. Turn on **Developer Mode** on the iPhone: **Settings** > **Privacy & Security** > **Developer Mode** > on. The phone restarts. Tap **Turn On** after the restart.

**Build and install:**

```bash
npx expo run:ios --device
```

Pick your iPhone from the list. If Expo asks for a team, pick your **Personal Team**.

If the build fails with a signing error:

1. Open `apps/mobile/ios/TavlakiDev.xcworkspace` in Xcode.
2. Click the **TavlakiDev** project, then the **TavlakiDev** target, then **Signing & Capabilities**.
3. Tick **Automatically manage signing**. Set **Team** to "_Your Name_ (Personal Team)". Keep the bundle id `com.tavlaki.dev`.
4. Run `npx expo run:ios --device` again.

**First launch:** iOS says "Untrusted Developer". On the iPhone go to **Settings** > **General** > **VPN & Device Management**, tap your Apple ID, then **Trust**.

**Use it:** the iPhone and the Mac must be on the **same Wi-Fi**. Start Metro with `npx expo start`, then open Tavlaki Dev on the phone. Allow **Local Network** access when iOS asks.

**Limits of a free Apple ID:**

- The app stops opening after **7 days**. Plug in the phone and run `npx expo run:ios --device` again. Your data stays.
- Up to 3 of your own apps on the phone, and up to 10 new app ids per week.
- No push notifications, Sign in with Apple or Universal Links. These need the paid account (v1.0).
- Friends cannot install it. Testers need TestFlight, which needs the paid account.

## 3. Android emulator (Mac or Windows)

Needs: **Android Studio**. No Google account. You have no Android phone, so we use the emulator.

**Set up once:**

1. Install **Android Studio** and open it. Let the setup wizard install the Android SDK.
2. Android Studio > **Device Manager** > **Create device**. Pick a recent Pixel and the newest system image.
3. Set the env vars Expo needs.

   Mac (add to `~/.zshrc`, then open a new terminal):

   ```bash
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools"
   ```

   Windows: in **System Properties** > **Environment Variables**, set `JAVA_HOME` to `C:\Program Files\Android\Android Studio\jbr` and `ANDROID_HOME` to `%LOCALAPPDATA%\Android\Sdk`. Add `%ANDROID_HOME%\platform-tools` to `Path`.

**Run the app:** start the emulator from **Device Manager** (the play button), then:

```bash
npx expo run:android
```

The first run takes 10–20 minutes. Next days: start the emulator, run `npx expo start` and press `a`.

## 4. Cloud builds with EAS (optional)

EAS builds the app on Expo's servers. Use it when you do not want to wait for a local build, or when you want an Android APK file. Do not use it for every change: the free plan is small.

**EAS Free plan:** 15 Android and 15 iOS builds per month, a slow queue, and a 45-minute limit per build. The limit resets each month. There is no surprise bill.

### The EAS project

The app is linked to the EAS project [`@oss_gr-org/tavlaki`](https://expo.dev/accounts/oss_gr-org/projects/tavlaki) (#292). `apps/mobile/app.json` holds its `owner`, `extra.eas.projectId` and `updates.url`. To use EAS, install the CLI and log in with an Expo account in the `oss_gr-org` organization. Run `eas` commands from `apps/mobile`.

```bash
npm install --global eas-cli   # eas.json needs version 25 or newer
eas login
```

Do **not** run `eas update` yet.

How the project was linked (you only need this for a new project):

- `eas init --account oss_gr-org` in `apps/mobile`. It writes `owner` and `extra.eas.projectId` to `app.json`. It also copies `extra.router` there; delete that copy, because the `expo-router` plugin adds it.
- `eas update:configure` cannot write to `app.config.ts`. It prints the `updates.url`; add it to `app.json` by hand.
- `pnpm format` in the repo root: EAS CLI writes `app.json` in its own style.

### Build profiles (`apps/mobile/eas.json`)

| Profile | What you get | Needs | Use it for |
| --- | --- | --- | --- |
| `development-simulator` | iOS dev build for the **simulator** | Expo account only | Dev build for the Mac without building in Xcode |
| `development` | Dev build for **devices**. Android: APK. iOS: ad hoc build. | Android: Expo account only. iOS: **paid Apple account** (later) | Android emulator or phones |
| `preview` | Release build. Android: **APK** you can install directly. iOS: **simulator** build. | Expo account only | Trying the real app without Metro |
| `production` | Store builds (Android AAB, iOS App Store) | **Paid Apple and Google accounts** (v1.0) | Later |

**Commands:**

```bash
# iOS simulator dev build. Installs on the simulator when done.
eas build --platform ios --profile development-simulator
eas build:run --platform ios --latest

# Android APK (release). Open the link on an Android phone or the emulator.
eas build --platform android --profile preview
```

The first Android build asks to make a **keystore** (the signing key). Say **yes**. EAS keeps it safe for you. It needs no Google account.

**Manual GitHub workflow.** The **EAS build** workflow (`.github/workflows/eas-build.yml`) starts a cloud build from the Actions tab. It only runs when you click **Run workflow**. It needs a repo secret `EXPO_TOKEN`: make a token on expo.dev > **Account settings** > **Access tokens**, then add it in GitHub > **Settings** > **Secrets and variables** > **Actions**. The run does not wait for the build, so it uses about 2 GitHub minutes.

### Versions and build numbers

- **`version`** in `app.json` (now `1.0.0`) is the version people see in the store. We change it by hand for each store release.
- **Build numbers** (iOS `buildNumber`, Android `versionCode`) live on EAS (`appVersionSource: "remote"`). The `production` profile has `autoIncrement`, so each store build gets a new number. Stores reject a repeated number. Do not set build numbers in `app.json`.
- Local builds (`expo run:*`) use build number 1. That is fine for testing.

### EAS Update (over-the-air updates), for later

- Builds from each profile listen on the **channel** with the same name: `development`, `preview`, `production`.
- `runtimeVersion` uses the **`fingerprint`** policy. EAS makes a hash of everything native. An update only reaches builds with the same native code, so a JS update can never crash a build that misses a native module.
- The hash also includes the app name and app id, so each variant has its own runtime version. Publish an update with the same `APP_VARIANT` as the builds it is for.
- No updates are published yet. Dev builds get their code from Metro anyway.

## 5. Where things are in the app

| Route | What it is |
| --- | --- |
| `/` | Home: New game, and Continue when a match is saved |
| `/new-game` | New game: vs the bot or pass-and-play, match length |
| `/game/<id>` | The board for a match (opened from New game or Continue) |
| `/rules/<variant>` | How to play (a stub for now) |
| `/settings` | Settings (language, sound, haptics, board options) |
| `/dev/board` | **Dev only.** The board with sample positions. You can flip the board. **Dice → Throw on the board** turns on the dice throw spike (#183, [findings](../design/dice-throw-spike.md)). |
| `/dev/online` | **Dev only.** An online game vs the bot on the in-memory server (#255). Pick a game, a pace (live: 60 s a turn; async: 24 h) and a match length, then tap **Start game**. **Make an invite** makes an invite from the bot instead and shows its code and links (#256). The game lives only while the app runs. |
| `/invite/<code>` | An invite to an online game (#256). It shows the game, the length and the pace, with Accept and Decline. Opened by the link `tavlaki://invite/<code>`. |
| `/_sitemap` | Expo Router's list of all routes. Tap one to open it. |

Dev routes only work in development builds. Release builds (the `preview` profile) send them back home.

**How to open a route:**

- iOS simulator: `xcrun simctl openurl booted "tavlaki://dev/board"`
- iPhone: type `tavlaki://dev/board` in Safari's address bar.
- Android emulator: `adb shell am start -a android.intent.action.VIEW -d "tavlaki://dev/board"`

To try the online screen: open `tavlaki://dev/online` (or pick `dev/online` in `/_sitemap`). The bot plays its turns on its own, and a turn timer that runs out ends that game, as on the real server.

To try an invite link (#256):

1. Open `tavlaki://dev/online`, pick the game, and tap **Make an invite**. The screen shows the code, for example `ABCD2345`.
2. Open the link: tap **Open the invite**, or on the iOS simulator run `xcrun simctl openurl booted "tavlaki://invite/ABCD2345"` (Android: `adb shell am start -a android.intent.action.VIEW -d "tavlaki://invite/ABCD2345"`).
3. Tap **Accept**. The board opens, and the bot plays White.

The invite lives on the in-memory server, so it works only while the app runs. A link that opens the app on first launch shows language and consent first, then the invite. The `https://tavlaki.com/i/<code>` link does not open the app yet: it needs universal links and app links.

**Dev menu:** press `m` in the Metro terminal, shake the phone, or press `Cmd+D` (iOS simulator) / `Cmd+M` or `Ctrl+M` (Android emulator). It has reload and the performance monitor.

## 6. Common errors and fixes

| You see | Fix |
| --- | --- |
| Pressing `i` or `a` opens **Expo Go**, or "No development build installed" | Build and install the dev build first: `npx expo run:ios` or `npx expo run:android`. |
| Red screen: a native module is missing (for example `NitroModules`, `RNSkia`, `MMKV`, `Worklets`, `ExpoSecureStore`) | The native app is older than the code. Rebuild: `npx expo run:ios` / `npx expo run:android`. |
| Strange errors after pulling new code | Run `pnpm install` in the repo root, then `npx expo start --clear`. |
| Native build fails after a native package change | `npx expo prebuild --clean`, then `npx expo run:ios` / `run:android` again. |
| "Xcode must be 26.4 or newer" or iOS SDK errors | Update Xcode in the Mac App Store. Then `npx expo prebuild --clean`. |
| "No simulator available" | Xcode > **Settings** > **Components** > **Get** an iOS simulator. |
| iPhone: "Untrusted Developer" | **Settings** > **General** > **VPN & Device Management** > trust your Apple ID. |
| iPhone app does not open any more | The free 7-day profile ran out. Run `npx expo run:ios --device` again. |
| Xcode: "Signing requires a development team" or "No profiles for 'com.tavlaki.dev'" | Pick your Personal Team in **Signing & Capabilities** (part 2). |
| Xcode: "Failed to register bundle identifier" | Someone else has that id. Tell the PM. Do **not** switch to `com.tavlaki`. |
| iPhone: "Could not connect to development server" | Same Wi-Fi for phone and Mac. Allow Local Network: **Settings** > **Privacy & Security** > **Local Network** > Tavlaki Dev. Or try `npx expo start --tunnel`. |
| "Port 8081 is in use" | Another Metro is running. Close it, or say yes to use another port. |
| Android: "SDK location not found" or `JAVA_HOME is not set` | Set `ANDROID_HOME` and `JAVA_HOME` (part 3) and open a new terminal. |
| Android: "No Android connected device found" | Start the emulator in Android Studio's **Device Manager** first. |
| EAS: "EAS project not configured" | Run `eas` from `apps/mobile`, where `app.json` is (part 4). |
| EAS: "does not satisfy the CLI version constraint" | Your `eas-cli` is too old. Run `npm install --global eas-cli`. |
| EAS: iOS `development` build asks for an Apple Developer account | Expected. Use `development-simulator`, or build locally with Xcode (part 2). |
| EAS: build limit reached | Wait for the monthly reset, or build locally (parts 1–3). |
| CI `format:check` fails after an EAS command changed `app.json` | Run `pnpm format` in the repo root and commit. |
