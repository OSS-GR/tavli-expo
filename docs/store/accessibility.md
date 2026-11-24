# App Store accessibility answers (App Accessibility)

> The answers for App Store Connect → App Accessibility (iPhone). Issue #682. Last review: 2026-11-21.

Apple shows these on the product page as "Supported Features". Answer **Yes** only when a person can do the **common tasks** with the feature: start a game, play it to the end, and open the main screens. A wrong Yes is worse than a No, so the answers below stay No where nobody has tested the whole app.

| Feature | Answer | Why |
|---------|--------|-----|
| **VoiceOver** | **Yes** | Screen reader users play through the move list, not the Skia board (`features/accessibility/`, #134). Game events are read out (`useAnnouncement`). Cards and sheets move focus to their title (`useFocusOnShow`) and hide what they cover (#153). Every board action has a button in the move list. |
| **Voice Control** | **No, for now** | Buttons have labels, but nobody has played a whole game with Voice Control. **Owner:** test it on a phone (start a game, roll, move with the move list, confirm), then answer Yes. |
| **Larger Text** | **Yes** | Text follows the phone's text size, with no line limits and no fixed-height boxes; screens scroll. `textScaling.test.tsx` checks Home, New game, the game screen, the end screens, History and the tutorial at large sizes. **Owner:** check 200 % on a phone before the answer goes live. |
| **Dark Interface** | **Yes** | The default board, Walnut Kafeneio, comes with dark app colors (`scheme: 'dark'` in `packages/ui/src/themes/walnut-kafeneio.ts`), and so does Kafeneio Night. The app does not follow the phone's dark mode (Olive Inlay is light), but it is dark by default. |
| **Differentiate Without Color Alone** | **No, for now** | Many cues use more than color (the picked row has a check mark, the lost dice get a line through them, the turn clock shows the time as text), but nobody has checked every screen. |
| **Sufficient Contrast** | **Yes** | Every app theme passes its contrast pairs in a test (`packages/ui/src/themes.test.ts`). |
| **Reduced Motion** | **Yes** | With Reduce Motion on, the kafeneio scene stays still, the tutorial has no shake or checker flight, and the board skips its motion (13 files read the setting). |
| **Captions** | Not applicable | The app has no video or spoken audio. |
| **Audio Descriptions** | Not applicable | The app has no video. |

**Accessibility URL (optional):** none yet. Leave it empty.

When a PR changes one of these (a new screen with no move-list button, a fixed text size, a new motion), update this file.
