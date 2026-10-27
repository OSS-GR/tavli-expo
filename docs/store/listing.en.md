# Store listing (English)

> Text for the App Store and Google Play, English. Issue #137. Greek: [listing.el.md](listing.el.md). Last review: 2026-10-27.

Copy each block as it is. The counts are Unicode characters, counted with a script. Each block says its limit.

The text describes only what the app does today (v1.0.0 on `main`). When a feature ships or changes, update this file and the Greek one together.

## What the text may claim

Checked in the code on 2026-10-27:

| Claim | Where it is in the code |
|-------|-------------------------|
| Portes, Plakoto, Fevga, Asodio, and a Tavli match (Portes → Plakoto → Fevga) | `features/match/setup.ts`, [App shell](../architecture/app-shell.md#choosing-the-game-109) |
| Match to 1, 3, 5 or 7 points; mono = 1, diplo = 2 | `features/match/setup.ts`, `newGame.length.*` texts |
| Bot: Easy and Medium in all four games. Hard is "coming soon" | `features/bot/levels.ts`, `services.ts` (`botLevels`) |
| The bot plays on the phone. Local games need no network | `InlineBotRunner` in `services.ts`; App shell, "Pass-and-play" |
| Pass-and-play on one phone, optional names, the board turns to the player | `features/match/seats.ts`, `settings.boardView.*` |
| A "How to play" page for each game, with the start position | `features/rules/` |
| "Learn to play": a one-minute Portes lesson on the real board, 7 lessons (move, both dice, a double, make a door, hit, enter from the bar, bear off). Opens from a Home card, Settings → Help and the Portes rules page | `features/tutorial/` (`lessons.ts`), [App shell](../architecture/app-shell.md#tutorial-128) |
| Greek and English | `apps/mobile/src/i18n/` |
| The game saves by itself; Continue on Home | `features/match/savedMatch.ts` |
| Undo, Confirm, auto-confirm, pip counts, sound, haptics | `features/settings/settings.ts` |
| One board theme: Walnut kafeneio | `themes.walnut-kafeneio` |
| No ads, no account, opt-in usage data | [Privacy policy](../legal/privacy.md) |

Do **not** claim:

- **A tutorial for every game.** The lesson teaches Portes only. Plakoto, Fevga and Asodio have rules pages.
- **Online play, friends, invites, push.** Not built (MVP2). Home shows "Play a friend · Coming soon".
- **Hard bot, more themes, face-to-face view.** The app shows them as "coming soon".
- **Dark mode, iPad, accessibility claims.** Not checked for the store.

**Owner:** decide if the listing mentions online play as "coming soon". The default here is **no**. Apple can reject metadata that names features the app does not have (App Review Guideline 2.3). An optional line is at the end of the description section.

**Owner:** Apple may also question the "Play a friend · Coming soon" card on Home (Guideline 2.1, no placeholder features). Consider hiding it in v1.0, or be ready to explain it in the review notes.

## App name

Limit: 30 (App Store name and Google Play title). From [Vision](../vision.md#name-decided-2026-10-26).

```text
Tavlaki: Kafeneio Backgammon
```

28 characters.

## App Store subtitle

Limit: 30.

```text
Portes, Plakoto, Fevga, Asodio
```

30 characters. Other option: `Greek tavli vs bot or a friend` (30).

## App Store promotional text

Limit: 170. You can change it any time without a new build.

```text
Play the four Greek tavli games against the bot or a friend on the same phone. Portes, Plakoto, Fevga and Asodio, with the rules in Greek and English. No ads.
```

158 characters.

## App Store keywords

Limit: 100. Commas, no spaces. Apple already searches the name and the subtitle, so their words are not repeated here.

```text
tavli,tavla,greek,board game,dice,offline,two player,pass and play,bot,classic,strategy,narde
```

93 characters.

## Google Play short description

Limit: 80.

```text
Greek tavli: Portes, Plakoto, Fevga and Asodio. Play the bot or a friend.
```

73 characters.

## Full description

Limit: 4,000 (App Store description and Google Play full description). The same text works for both stores.

```text
Tavlaki is Greek tavli (backgammon), the way it is played at the kafeneio.

PLAY ALL FOUR GREEK GAMES
• Portes: the classic game. Hit a lone checker and build your doors.
• Plakoto: no hitting. You pin the other player's checker under yours. Pin their "mother", the last checker on their start point, and they can resign for 2 points or play on.
• Fevga: no hitting and no pinning. One checker holds a point, so you block the other player by holding the points in front of them.
• Asodio: the kafeneio version. Roll a 1-2 or a double to open the board, bring in all 15 checkers, then move as one army, quarter by quarter.

Or play a full Tavli match: Portes, Plakoto and Fevga in turn. Play to 1, 3, 5 or 7 points. Mono is 1 point, diplo is 2.

PLAY THE BOT
Two levels. Easy plays a random legal move, so it is good for learning. Medium plays like a casual player. The bot plays on your phone, so you can play with no internet.

PASS-AND-PLAY
Two players, one phone. Type your names if you like. The board turns to the player whose turn it is.

LEARN TO PLAY
New to tavli? A one-minute lesson on the real board teaches Portes in 7 short steps: move a checker, use both dice, play a double, make a door, hit, enter from the bar and bear off. Then play your first game against the Easy bot.
Every game also has a "How to play" page: the start position, how checkers move, and the special rules. Open it from Home, from the game menu or from the New game screen.

MADE FOR TAVLI PLAYERS
• Greek and English
• Undo your moves until you confirm the turn, or turn on auto-confirm
• Pip counts, if you want them
• Your game saves by itself. Come back later and continue.
• A wooden board, with sound and haptics

NO ADS, NO ACCOUNT
No ads. No sign-in. Your games stay on your phone. You choose if the app may send anonymous usage data, and you can change your answer any time in Settings.

Privacy policy: https://tavlaki.com/privacy
```

1,926 characters.

Optional line (only if the owner wants it, see above). Put it before "NO ADS, NO ACCOUNT":

```text
COMING SOON
Play your friends online.
```

## What's new in v1.0

Limit: 4,000 on the App Store, 500 on Google Play. This text fits both.

```text
The first release of Tavlaki.
• Portes, Plakoto, Fevga and Asodio, and full Tavli matches
• Easy and Medium bot
• Pass-and-play on one phone
• Learn to play: a one-minute lesson on the board
• How to play pages for every game
• Greek and English
```

245 characters.

## Other store fields

| Field | Value |
|-------|-------|
| Category | App Store: Games → Board (secondary: Strategy). Google Play: Board. |
| Price | **Owner:** free (the vision has no ads and no purchases for now). |
| In-app purchases | None |
| Contains ads (Google Play) | No |
| Privacy policy URL | `https://tavlaki.com/privacy` |
| Support URL (App Store, required) | **Owner:** for example `https://tavlaki.com` with a contact address. No page exists yet. |
| Marketing URL (App Store, optional) | `https://tavlaki.com` (when the site exists) |
| Contact email (Google Play, required) | **Owner:** for example `support@tavlaki.com`. It is public on the listing. |
| Copyright (App Store) | **Owner:** `2026 <your name or company>` |
| Age rating | See [age-rating.md](age-rating.md) |
| Privacy answers | [app-privacy.md](app-privacy.md) (Apple), [play-data-safety.md](play-data-safety.md) (Google) |
| Screenshots | [screenshots.md](screenshots.md) |
