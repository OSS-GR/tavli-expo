# Dice throw spike: throw the dice onto the board with a swipe

> Issue #183. A design spike: a prototype on the dev board screen, then the first steps in real games. Last review: 2026-10-30.

## The idea

The owner asked: "Can we test how throwing the dice on the board like a real game would look? What if I swipe to throw the dice?"

The spike answers three questions: how it looks, what it costs to build for real, and whether we should.

## Try it

1. Run a development build (see [Running the app](../process/running-the-app.md)).
2. Open the dev board screen: `/dev/board` (not linked from the app; release builds go home).
3. Pick **Dice → Throw on the board**.
4. Swipe anywhere under the header: on the board, or up from the controls under it. A tap on the board, or the **Roll** button, throws too.

The board follows Settings: the board theme, the home board side and the layout (Tall or Classic). The dice roll on the whole playing surface, both halves, so a swipe in any direction can land them on any side of the board. They may stop on top of checkers: the spike does not clear a space (see the cost table).

## Preview

One throw, drawn headless with the same code the dev screen plays (`pnpm --filter @tavli/mobile screenshots`, file `apps/mobile/tools/screenshots/diceThrow.shot.tsx`). Faint ghosts show where each die just was.

![Five frames of one throw: the throw, in flight, the first bounce, the second bounce, the rest pose](dice-throw/throw-strip.png)

The whole throw as a GIF (30 fps): [throw.gif](dice-throw/throw.gif). The tool writes it only when `ffmpeg` is installed.

## How it works

All the code is in `apps/mobile/src/features/dice-throw/`, plus a switch on the dev board screen (`src/app/dev/board.tsx`).

1. **The result comes first.** The RNG rolls the dice (`rollDice(rng)`, the same injected RNG the games use). The animation never picks a value.
2. **A plan lands on that result.** `planThrow` (`throwPath.ts`, pure TypeScript, no React) simulates the two dice at 60 samples a second, with 4 physics steps per sample:
   - The swipe sets only the direction and the speed, never the start (`swipeToThrow`). The direction runs from where the finger went down to where it lifted. The speed is the finger speed from Gesture Handler, clamped to 450–1200 pt/s; without a usable velocity it comes from the swipe length.
   - The dice come in from the wall behind the throw (`entryPoint`): on the line through the middle of the field, side by side across the throw, with room for both. So every throw crosses the whole field. A swipe up starts at the middle of the near wall; a swipe up and to the right starts on the near wall, left of the middle.
   - Drag and rolling friction slow them down (`dampSpeed`, an exact formula, so the result does not depend on the frame rate).
   - They bounce off the four walls of the field (`reflect`: half the speed into the wall stays, most of the speed along it stays) and off each other.
   - The walls come from the theme layout: the smallest rect around all of `layout.fields` (the whole playing surface), less half a die (`throwField.ts`).
   - The spin and the faces count **back from the end**. So the die always stops at the theme's resting tilt (`layout.dice.tilt`) and on the rolled value. On the way, a die shows a new face after each 0.9 die sizes of travel, and never the same or the opposite face twice in a row (like a real die rolling over an edge, `faceSequence`).
   - A die is drawn up to 16% bigger at full speed, so it looks "in the air".
   - **The bar is a raised divider** (`throwBar`, `ThrowBar`): the gap between the two fields. A die over any part of it is in the bar zone. A die that meets the bar at 250 pt/s or more (`hopSpeed`) hops over it: it flies with no friction, is drawn up to 30% bigger at the top of the hop, and a knock plays when it lands. A slower die bounces off the edge of the zone. No die rests on the bar, and a throw never starts on it: a swipe along the bar starts on the player's side of it (`offBar`, `bar.shelter`).
   - Same input, same plan: there is no randomness in the planner.
3. **Reanimated plays the plan.** One shared value runs from 0 to the end of the throw (`withTiming`, linear). Each die (`ThrownDie.tsx`) reads its pose with `sampleAt`, a worklet, on the UI thread. It draws with the board's own `DieBody` and `DiePips`.
4. **Knocks.** The plan lists every hit with its time and strength. `hitCues` joins hits closer than 70 ms, and each cue plays `diceLand` (sound and haptic) through `features/feedback`. The throw starts with `diceRoll`.
5. **When the dice stop**, the text under the board says "Rolled 2 and 4." and `useAnnouncement` reads it to screen readers.

Gestures follow the board rules (#174, #186): one touch is never both a swipe and a tap. The pan covers the whole throw view (the board, the Roll row and the dev screen's controls); the tap covers only the board. They sit on nested views, and Gesture Handler lets only one run: the first to activate cancels the other. The tap stays on the board because an active gesture cancels the press of a button under it (`cancelsJSResponder`); the pan may cancel one, so a swipe that starts on a button only throws. There is no `...spread` inside the gesture hook configs. A touch that the system takes away (a notification shade, a call) throws nothing.

### Owner feedback (2026-10-29, the bar)

The dice crossed the bar and slid along it as if it were flat felt. Now the bar is a raised divider: a fast die hops over it, a slow one bounces off, and none rests on it or starts on it (see "How it works"). The speed was "good now".

### Owner feedback (2026-10-29)

The throw was "too fast, almost aggressive", and the dice could only roll in one half of the board. So the launch speed came down (it was 450–1800 pt/s), the drag and the bounce got softer (a bounce keeps 40% of the speed, it was 50%), and the dice may roll on the whole board. The first try (300–800 pt/s, 1.4 to 2.2 s) was then "too slow". The current tuning plays it 1.5 times faster over the same distance: 450–1200 pt/s and about 0.9 to 1.5 s a throw (it was about 1 s at the start, but with twice the launch speed).

### Owner feedback (2026-10-28)

The first version threw the dice from where the finger let go, and only a swipe that started on the board counted. A short swipe near the far wall made a short, awkward throw. Now a swipe may start anywhere in the throw view, and where the finger went down decides where the dice come in: from the wall of the field closest to the touch, straight into the field, at the point along that wall under the touch (a touch at the bottom throws from the bottom, even far off to the side). The swipe sets only the speed. A tap on the board throws from the player's wall, at the point along it under the tap. The game board needs the same in the real build: a swipe area bigger than the board.

Reduce Motion: the dice show at rest at once (`restPlan`), with no flight and no knocks.

Tests: `throwPath.test.ts` (the math and the planner: the dice stay inside the field, land on the value at the resting tilt, bounce on a hard throw, stay apart at rest, glide into the row slots), `throwField.test.ts` (the field on the tall, mirrored and classic layouts) and `DiceThrowBoard.test.tsx` (swipe, tap, Roll button, a cancelled touch, the classic board, the RNG values in order). In the app, `GameScreen.test.tsx` checks that the throw plays from the Roll button and from a swipe outside the board, and that a swipe during the bot's turn rolls nothing.

## In the game (built 2026-10-29/30)

The dev screen's throw now plays in real games (`BoardThrow.tsx`, `features/dice-throw/`), exactly like on the dev board:

- A roll in a game — by swipe, a tap on the board, or the Roll button — plays the throw over the board. The values come from the engine (the log's `roll` event); the animation never picks a value.
- The swipe on the board works while it is your roll and nothing can move (`onBoardSwipe` in `InteractiveBoard`). Where the finger went down picks where the dice come in: from the wall of the field closest to the touch, straight into the field, at the point along that wall under the touch (`swipeToThrow`); the swipe sets only the speed. A tap on the board throws from the roller's wall, at the point along it under the tap (`tapThrow`). In a game that flips to the roller the roller is the viewer (the bottom wall); in pass-and-play and the bot the board stays put, so the roller may be the opponent on the top wall — the dice come from there, the angle the roller looks at the board from.
- The swipe may also start outside the board, on the strips and the space around it (`game-swipe-area` in `GameScreen`, `SWIPE_AREA` in `board/interaction.ts`): a second pan over the whole board region that needs three times the movement of the board's own pan. On the board that one always activates first and wins the race, so checkers still drag. The area stays off in landscape (the move list scrolls there) and while a card covers the board. It shifts its touch into the board's points by the board frame's origin (the frame sits between the strips in the classic layout), so the touch picks the same side it would on the board.
- At rest the thrown dice glide into their dice-row slots and take the row's size and tilt (`settlePlan` in `throwPath.ts`, `settleTargets` in `board/boardDice.ts`), so the row takes over without a jump. In landscape the dice row sits outside the board canvas, so there the row still appears without the glide.
- The bot's roll throws from the near wall (`buttonThrow`).
- While the throw plays, the dice row waits hidden (`diceHidden`); when it ends, the row shows the rolled dice without a second tumble (`rest` on `DiceRow`, until the next roll re-keys it). A thrown double keeps its two-then-split reveal.
- The opening roll shows its dice on the card, at rest: the card covers the board, so nothing throws under it. Vs the bot one swipe or tap rolls both opening dice (`openingTaps="one"`): the swipe that starts your roll also rolls the bot's — by design. In the later turns of a bot game a swipe rolls nothing (`canRoll` refuses; a test in `GameScreen.test.tsx` keeps it that way).
- Online rolls do not throw yet (the server's dice; see the cost table below). Reduce Motion never arms a throw: the dice appear as before.
- The roll sound comes from the store event (`gameFeedback`); the throw plays only the knocks.

## Numbers

| What                                        | Value                                    |
| ------------------------------------------- | ---------------------------------------- |
| One throw, slowest to fastest               | about 0.9 s to 1.5 s                     |
| Wall hits on a hard throw                   | 0 to 4, the first after about 0.5–0.7 s |
| Plan size                                   | about 70 samples, about 11 KB as JSON    |
| Planning time (Node on a laptop)            | about 0.5 ms                             |
| Work per frame on the UI thread             | 2 transforms, 12 face opacities          |

## Cost to build for real

About **6 to 9 days** (size L), in this order:

| Step                                                                                                                                                                                    | Days  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Draw the thrown dice on their own canvas over the board, like `DiceRow` does now. Then the board picture does not redraw on every frame of the throw.                                  | 1     |
| ~~Hand over at rest: the dice glide into the dice area (`boardDiceBox`), then `DiceRow` takes over (used dice, the 2 × 2 grid for a double).~~ Done in portrait (2026-10-30, `settlePlan` glides each die into its row slot). In landscape the dice row sits outside the board canvas, so the dice still appear there without the glide. | — |
| ~~The swipe on the game board when it is your roll. The board pan moves checkers; before the roll there is nothing to move, so a swipe can throw. Keep tap-to-roll and the Roll button.~~ Done (2026-10-30, with the throw itself, see "In the game"). | — |
| The other player's throw (bot, pass-and-play, online): a fixed throw from the far wall (`buttonThrow`). The bot throws from the near wall since 2026-10-30; the far wall and online remain. | 0.5 |
| Online games: the dice come from the server state (see below).                                                                                                                          | 0.5–1 |
| A wooden rattle sound per theme, louder for a harder hit (the feedback port has no volume yet).                                                                                         | 0.5–1 |
| Look: a squash at each face change so the roll reads as 3D, not as a flicker. Tune on phones.                                                                                           | 1     |
| A setting to turn the throw off, and checks on a low-end Android phone.                                                                                                                 | 1     |

The pure parts (`throwPath.ts`, `throwField.ts`) and their tests can stay as they are.

## Risks

**Low-end Android performance.** Not measured in this spike: there was no phone. What we know:

- The plan is made once per throw on the JS thread (about 0.5 ms on a laptop; expect under 10 ms on a slow phone with Hermes, less than one frame).
- During the throw only one shared value changes. The UI thread reads two poses per frame. That is cheap.
- The cost to watch: on the dev screen the dice draw **inside** the board canvas, so Skia redraws the whole board picture (wood images, 30 checkers with shadows) on each frame, and each die has a blurred shadow. In the real build the dice get their own canvas (see the cost table). If a slow phone still drops frames, drop the die shadow blur during the flight.
- Next step: the owner runs the dev screen on a cheap Android phone with the Perf Monitor on (Dev Menu → Perf Monitor) and checks the UI frame rate during a throw. Go only if it stays near 60 fps.

**Accessibility.**

- The swipe is never the only way. The Roll button stays, and a tap throws too. Screen reader users roll with the button (VoiceOver and TalkBack take the swipe for their own gestures).
- With Reduce Motion on, the dice show at rest at once.
- The result is read with `useAnnouncement` once the dice stop. In real games, check `features/game/announcements.ts` first so the roll is not read twice.
- The board view on the dev screen is one accessible element with a label. In real games the move list (`features/accessibility`) stays the way to play.

**Fairness in online games.**

- The server dice stay the truth. The animation lands on the server's result; it never makes one. The swipe speed and direction change only the path, never the faces.
- The server rolls the next dice in the same mutation that saves the last turn (`apps/server/convex/games.ts`). So when your turn starts, the dice are already in the game state. The app plans the throw to land on `state.dice` (the CLAUDE.md rule: play `state.dice` when the state already holds dice). There is no wait for the network during the throw.
- Because the dice are in the state before the throw, a changed app could show them a second early. That gives no real edge: the throw is a show, and the player sees the result a second later anyway.
- The same holds for local games: the injected RNG rolls first, as now.

**Other risks.**

- Doubles: the throw shows two dice; the game shows four. The hand-over step above solves it (`DiceRow` shows the 2 × 2 grid).
- A long throw slows play down. A throw takes about 1.5 s; a tap during the throw could skip to the rest pose.
- On the classic board the surface is wide and short, so the dice hit the walls more often. Tune the speeds per layout if it looks busy.

## Recommendation

**Build it, as a small follow-up after a phone check.** The look is good enough for a 2D tumble, the code is small and pure, and it does not touch the rules or the server. It makes the game feel like a real table, which is the point of the app.

1. Owner: try `/dev/board` on a phone, and on a cheap Android phone if you can. Say yes or no to the look.
2. If yes: open one issue (size L) for the steps in the cost table, local and bot games first, online after.
3. Keep a setting to turn the throw off. Keep the Roll button and tap-to-roll as they are.
