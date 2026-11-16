# Greek copy

How the app speaks Greek (#549). Read this before you add or change a string in `apps/mobile/src/i18n/el.json`.

## The voice

- Write Greek as a Greek person would say it, not a copy of the English sentence. Keep the meaning, drop the English shape. Bad: «Δεν υπάρχει πια επαφή: τα πούλια απλώς τρέχουν για το σπίτι». Good: «Τα πούλια δεν συναντιούνται πια· από εδώ και πέρα μετράνε μόνο τα ζάρια».
- Warm and everyday, like a friend at the kafeneio. Short. Never formal or bureaucratic.
- Always the informal singular (εσύ), the welcome flow too. Only the legal texts use εσείς.
- Buttons use the words Greek apps use: Συνέχεια, Ακύρωση / Άκυρο, Αποθήκευση, Κλείσιμο, Πίσω, Δοκίμασε ξανά, or a short imperative («Ρίξε τα ζάρια», «Θα παίξω εγώ», «Μη με ξαναρωτήσεις»).
- An error title is «Κάτι πήγε στραβά», never «Δεν έγινε».
- A name in a sentence goes first with no colon and no article: «{{name}} έφερε 5-3», «{{name}} κέρδισε». A label may keep a colon: «Σειρά: {{name}}». Usernames have no gender, so avoid words that need one («Με καλούς τρόπους», not «Να είσαι ευγενικός»).
- Greek quotes «…», the Greek question mark «;», and the middle dot «·».

## Words

| English | Greek |
| --- | --- |
| checker | πούλι, πούλια; a lone checker: μοναχό πούλι / πούλι μόνο του |
| die, dice, roll | ζάρι, ζάρια, ζαριά |
| doubles | διπλές («έφερες εξάρες», «ασσάκια» for 1-1) |
| board / point / bar | ταμπλό / θέση / μέση; start point: αφετηρία |
| made point | πόρτα («κλείνω πόρτα») |
| hit | χτυπάω, χτύπημα |
| bear off | μαζεύω, μάζεμα; a checker not off: αμάζευτο |
| pin, mother (Plakoto) | πλακώνω, πλακωμένο; μάνα |
| race | «Τελική ευθεία»; fast forward: «Γρήγορο τέλος» |
| game, match | παρτίδα, ματς |
| match points | πόντος, πόντοι («στους 5 πόντους»); never βαθμοί |
| single, double win | μονό, διπλό |
| rating, leaderboards | βαθμολογία, Κατατάξεις; ranked: «Παιχνίδι κατάταξης» (owner, 2026-11-16; not «Ματς») |
| bot | υπολογιστής, never «μποτ» |
| hint | υπόδειξη |
| resign | παραίτηση, παραιτούμαι |
| house rules | Κανόνες παρέας |
| phone | κινητό |
| online | online |
| friend request, block, report | αίτημα φιλίας, αποκλεισμός, αναφορά |
| guest, username | επισκέπτης, όνομα χρήστη |

Game names are proper nouns: Πόρτες, Πλακωτό, Φεύγα, Ασόδυο, Τάβλι.

## Space

Greek runs about 30% longer than English. Labels under the round buttons, tabs, chips and seat lines must stay short: check them on a phone with Greek on. A label under a circle may wrap to two lines (see "Round buttons" in `docs/architecture/board-screen.md`).

Tests that read Greek text (`getByText('…')`) must change with the string.
