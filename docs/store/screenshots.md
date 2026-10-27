# Store screenshots plan

> Which screenshots to take for the App Store and Google Play, the sizes, and how to take them. Issue #137. Last review: 2026-10-27.

Take every shot twice: once with the app in **English** and once in **Greek** (Settings → Language). Each store localization gets its own set.

## The six shots

The first two or three matter most: the stores show them first, in search results too. Captions are optional text to put above the picture (keep them short).

| # | Screen | Game and mode | State to show | Caption (en) | Caption (el) |
|---|--------|---------------|---------------|--------------|--------------|
| 1 | Board | Portes, vs bot (Medium) | Your turn, in the middle of a move: dice shown, one die used, a checker picked up and its target lit (like `apps/mobile/docs/screenshots/play-moving.png`, but with the strips and buttons) | Greek tavli, kafeneio style | Ελληνικό τάβλι, όπως στο καφενείο |
| 2 | New game | vs bot | The game picker with all five cards (Portes, Plakoto, Fevga, Tavli, Asodio), match length 3, level Medium | Portes, Plakoto, Fevga, Asodio | Πόρτες, Πλακωτό, Φεύγα, Ασόδιο |
| 3 | Board | Plakoto, pass-and-play, names "Maria" and "Nikos" | One or two pinned checkers on the board, the pill says "Maria's turn". Other option: the "Your mother is pinned" dialog (wireframe 17). | Pin, don't hit | Πλακώνεις, δεν χτυπάς |
| 4 | Board | Asodio, vs bot | Loading: both "to enter" stacks with counts, a few checkers entered after a 1-2 or a double | Roll a 1-2 to open the board | Φέρε ασόδυο για να ανοίξει το ταμπλό |
| 5 | Learn to play | Portes lesson (tutorial) | Lesson 5 of 7, "Hit a lone checker": the lesson text, the lit checker and its target ring. Open it from Settings → Help → **Learn to play**. | Learn in one minute | Μάθε να παίζεις σε ένα λεπτό |
| 6 | Match end | Tavli, pass-and-play, first to 5 | The cup and the final score, one row per game: Portes, Plakoto, Fevga, with Mono / Diplo chips | Two players, one phone | Δύο παίκτες, ένα κινητό |

Spare shots, if you want more (the App Store allows 10, Google Play 8): **Fevga** vs bot in mid-game (caption "Play the bot, even offline" / "Παίξε με τον υπολογιστή, και χωρίς internet"); the **How to play** page of Plakoto with its start picture; **Home** with the Continue card.

Do not show: "coming soon" items (Play a friend, Face-to-face, a locked level such as Asodio Hard until #164 ships), the welcome consent screen, dev screens. Hard works in Portes, Plakoto, Fevga and Tavli, so New game with Hard picked is fine there.

## Sizes

| Store | What | Size | Notes |
|-------|------|------|-------|
| App Store | iPhone 6.9" screenshots | **1320 × 2868** portrait (1290 × 2796 also works) | Required. Apple scales them down for smaller iPhones. 1 to 10 per language. |
| App Store | iPhone 6.5" screenshots | 1284 × 2778 or 1242 × 2688 | Only needed if you do not upload 6.9" ones |
| App Store | iPad | none | The app is iPhone only (`ios.supportsTablet` is not set in `app.json`, and Expo's default is `false`). |
| Google Play | Phone screenshots | **1080 × 1920** portrait (9:16) | 2 to 8. PNG or JPEG, no transparency. Each side 320–3,840 px, and the long side at most **2 ×** the short side. Use at least 4 shots of 1080 px or more to be shown in more places on Play. |
| Google Play | Feature graphic | **1024 × 500** | Required. **Owner:** make it from the app icon and a board picture (`pnpm --filter @tavli/mobile screenshots` renders `board-start.png`). No small text: Play may crop it. |
| Google Play | App icon | 512 × 512, 32-bit PNG | From `apps/mobile/assets/icon/` (see [App icon and splash](../design/app-icon.md)) |

**Owner:** check the current sizes in App Store Connect and the Play Console before you upload. Both stores change them from time to time.

Modern Android phones are taller than 2 : 1 (for example 1080 × 2400). Play rejects those shots. Use an emulator with a 1080 × 1920 screen, or crop.

## How to take them

### 1. Use a release build

Dev builds show the dev menu and other dev things. Use the **`preview`** EAS profile: it is a release build, and for iOS it is a simulator build (`apps/mobile/eas.json`).

```bash
cd apps/mobile
eas build --profile preview --platform ios      # simulator .app
eas build --profile preview --platform android  # .apk for the emulator
```

Or build locally in release mode: `npx expo run:ios --configuration Release` and `npx expo run:android --variant release`. See [Running the app](../process/running-the-app.md).

On the first launch, pick the language, then tap **Don't allow**. So the screenshot sessions send no usage data or crash reports.

### 2. iOS simulator

1. Open an iPhone Pro Max simulator (6.9", 1320 × 2868), for example **iPhone 17 Pro Max**, and install the build.
2. Clean the status bar:

   ```bash
   xcrun simctl status_bar booted override --time "9:41" --dataNetwork wifi --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
   ```

3. Get the app to the state in the table, then take the shot:

   ```bash
   xcrun simctl io booted screenshot shot-1-en.png
   ```

4. `xcrun simctl status_bar booted clear` when you are done.

### 3. Android emulator

1. Make an emulator (AVD) with a **1080 × 1920** screen (Android Studio → Device Manager → New hardware profile), and install the APK.
2. Clean the status bar with demo mode:

   ```bash
   adb shell settings put global sysui_demo_allowed 1
   adb shell am broadcast -a com.android.systemui.demo -e command enter
   adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941
   adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false
   adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false
   ```

3. Take the shot: `adb exec-out screencap -p > shot-1-en.png`
4. `adb shell am broadcast -a com.android.systemui.demo -e command exit` when you are done.

### 4. Getting each state

The dice are random, so you play to each state (the tutorial is the exception: its dice are fixed). Tips:

- **Pins (shot 3):** use pass-and-play, so you move both sides and can leave a lone checker to pin.
- **Asodio loading (shot 4):** it is the start of every Asodio game. Roll until a 1-2 or a double opens the board.
- **Match end (shot 6):** pass-and-play, Tavli, first to 5. You can resign games from the game menu to move fast, but play the **last** game to the end, so the screen does not say "resigned".
- **Plan a position:** the dev route `/dev/board` (dev builds only) shows fixed positions: Plakoto pins, Asodio loading, Asodio frozen army, bear-off. It has a dev picker on screen, so it is not for store shots, but it shows what a state looks like.
- `pnpm --filter @tavli/mobile screenshots` renders the board only (no buttons or strips). Use those pictures for the feature graphic or a website, not as store screenshots.

### 5. Before you upload

- [ ] No "Dev" or "Preview" text on screen, and no dev menu.
- [ ] Set the simulator or emulator to **light appearance** before every shot. `userInterfaceStyle` is `automatic` in `app.json`, so the system bars and dialogs follow the device setting; dark mode would mix with the app's light screens.
- [ ] Only the sample names "Maria" and "Nikos" (no real people).
- [ ] English shots in English, Greek shots in Greek, including the names on the board strips ("Bot" / "Υπολογιστής").
- [ ] Same order in both stores and both languages.
- [ ] Keep the full-size PNGs out of the repo (they are large). **Owner:** keep them in your own storage.
