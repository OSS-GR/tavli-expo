# Store screenshots

> Which screenshots go on the App Store page, their sizes, and how to take them. Issues #137, #682. Last review: 2026-11-21.

The shots come from the live app on the iOS Simulator. The full-size PNGs are in [images/](images/), ready to upload: the 6.3" shots, the Duo shots and both header images (`header-3840x1646-text.png`, `header-3840x1646-notext.png`). They have no alpha channel, because App Store Connect refuses screenshots with one.

## Sizes

App Store Connect asks for these (v1.0 page, 2026-11-21):

| Set | Size | Simulator | Notes |
|-----|------|-----------|-------|
| iPhone 6.3" | **1206 × 2622** portrait | iPhone 17 Pro | Required. Apple scales it for other iPhones. Up to 10 per language. |
| iPhone Duo | **2853 × 2007** landscape (the open inner screen) | iPhone Duo, posture open | The app supports the open Duo (#649, #659). |
| Header image (optional) | 3840 × 1646 | none | Made (2026-11-21): the icon, the name and three phone shots on the walnut colors. A second version has the phones only. Walnut, Olive Inlay and Kafeneio Night, left to right. |
| iPad | none | | The app is iPhone only (`ios.supportsTablet` is not set). |

**Owner:** check the sizes in App Store Connect before you upload. Apple changes them from time to time.

## iPhone 6.3" shots

The first three matter most: the store shows them in search results too.

| # | File | Screen | State | Caption |
|---|------|--------|-------|---------|
| 1 | `01-board.png` | Game, Portes vs Hard | Double 4s, a checker picked, its targets lit, a blot to hit | Greek tavli, kafeneio style |
| 2 | `02-home.png` | Home | Hero board, Play vs bot, Learn to play | Play the computer, friends or ranked |
| 3 | `03-games.png` | Play vs bot setup | Portes, Plakoto, Fevga, Asodio and Tavli; 5 points; Hard | Four Greek games |
| 4 | `04-online.png` | Online game, Plakoto | Your turn, the turn clock ring, Roll dice | Play a friend online |
| 5 | `05-hint.png` | Game, opening 4-2 | The hint line and the lit checkers | A hint when you need it |
| 6 | `06-lesson.png` | Learn Plakoto, lesson 3 of 4 | "The mother", lesson text on the real board | Learn on the real board |
| 7 | `07-boards.png` | Settings → Board & look | The three boards, Kafeneio Night picked | Three boards, your colors |

## iPhone Duo shots

| # | File | Screen | State | Caption |
|---|------|--------|-------|---------|
| 1 | `duo-01-board.png` | Online game, Portes (rows layout) | Your turn, dice on the board, Undo and Confirm on the rail | Made for the open Duo |
| 2 | `duo-02-home.png` | Home, two columns | The saved game and More ways to play | Every way to play, side by side |

The Duo shots use the Olive Inlay board, so the set shows a second look.

## What a shot must not show

- Real players: no real usernames, ratings of real people, or leaderboards from the dev server. The online shots use the dev in-memory game (`tavlaki://dev/online`), where the other side is a bot named "Guest" + 4 digits.
- Dev things: the Expo tools button, the dev menu, "Dev" text.
- Things that do not exist yet (see "Do not claim" in [listing.en.md](listing.en.md#what-the-text-may-claim)).

## How to take them

1. Use an iPhone 17 Pro simulator for the 6.3" set (its screenshots are 1206 × 2622) and the iPhone Duo simulator, opened, for the Duo set.
2. Clean the status bar:

   ```bash
   xcrun simctl status_bar booted override --time "9:41" --dataNetwork wifi --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
   ```

3. A dev build works if you turn off the Expo **Tools button** in the dev menu. A `preview` build has no dev parts at all (`eas build --profile preview --platform ios`).
4. Open the states with links: `tavlaki://dev/online` (online game vs the bot), `tavlaki://tutorial?from=home&game=plakoto&start=2` (lesson 3), `tavlaki://settings/board` (boards).
5. Take the shot: `xcrun simctl io <device> screenshot shot.png`. On the open Duo, `simctl` fails; take the screenshot with the simulator's own screenshot command instead.
6. `xcrun simctl status_bar booted clear` when you are done.

No Greek shots (owner, 2026-11-21): the Greek page uses the English shots.
