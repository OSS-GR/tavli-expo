# Store listing (Greek)

> Text for the App Store and Google Play, Greek (App Store: Greek; Google Play: `el-GR`). Issue #137. English: [listing.en.md](listing.en.md). Last review: 2026-10-27.

Copy each block as it is. The counts are Unicode characters, counted with a script. Each block says its limit.

The rules for this text are in the English file: [What the text may claim](listing.en.md#what-the-text-may-claim). The same owner questions apply (online "coming soon", the "Play a friend" card). Change both files together.

The game names follow the app's Greek texts (`apps/mobile/src/i18n/el.json`): **Πόρτες, Πλακωτό, Φεύγα, Ασόδιο, Τάβλι**. The app writes **Ασόδιο**. The rules doc also lists the spellings Ασόδυο and Ασσόδυο, so they go in the keywords. The texts use the tavli words of the app: πούλι, πλακώνω, μάνα, μονό / διπλό, βαθμοί.

## App name

Limit: 30. From [Vision](../vision.md#name-decided-2026-10-26).

```text
Ταβλάκι: Τάβλι του Καφενείου
```

28 characters.

## App Store subtitle

Limit: 30.

```text
Πόρτες, Πλακωτό, Φεύγα, Ασόδιο
```

30 characters. Other option: `Τάβλι με υπολογιστή ή με φίλο` (29).

## App Store promotional text

Limit: 170.

```text
Παίξε τα τέσσερα ελληνικά παιχνίδια με τον υπολογιστή ή με φίλο στο ίδιο κινητό. Πόρτες, Πλακωτό, Φεύγα και Ασόδιο, στα ελληνικά και στα αγγλικά. Χωρίς διαφημίσεις.
```

164 characters.

## App Store keywords

Limit: 100. Commas, no spaces. Words from the name and the subtitle are not repeated.

```text
ασόδυο,ασσόδυο,τάβλα,επιτραπέζιο,ζάρια,καφενείο,δύο παίκτες,υπολογιστής,backgammon,tavli,tavla
```

94 characters (157 bytes in UTF-8).

**Owner:** App Store Connect counts this limit in characters as far as we know. If it rejects the field, it may count bytes (Greek letters take 2 bytes each). Then drop words from the end until it fits.

**Owner:** Apple searches more than one language in some countries. We could not confirm which languages the Greek storefront searches. If it also searches the English (UK) listing, put the Latin words (`backgammon,tavli,tavla`) only there and use the room for more Greek words.

## Google Play short description

Limit: 80.

```text
Πόρτες, Πλακωτό, Φεύγα και Ασόδιο. Παίξε με τον υπολογιστή ή με φίλο.
```

69 characters.

## Full description

Limit: 4,000 (App Store description and Google Play full description).

```text
Το Ταβλάκι είναι το ελληνικό τάβλι, όπως παίζεται στο καφενείο.

ΚΑΙ ΤΑ ΤΕΣΣΕΡΑ ΕΛΛΗΝΙΚΑ ΠΑΙΧΝΙΔΙΑ
• Πόρτες: το κλασικό. Χτύπα τα ακάλυπτα πούλια και φτιάξε τις πόρτες σου.
• Πλακωτό: δεν χτυπάς, πλακώνεις. Αν πλακώσεις τη «μάνα» του αντιπάλου, το τελευταίο πούλι στην αφετηρία του, εκείνος διαλέγει: παραιτείται και χάνει 2 βαθμούς ή συνεχίζει.
• Φεύγα: ούτε χτύπημα ούτε πλάκωμα. Ένα πούλι κρατά τη θέση, οπότε κλείνεις τον δρόμο του αντιπάλου πιάνοντας θέσεις μπροστά του.
• Ασόδιο: όπως στο καφενείο. Φέρε ασόδυο (1-2) ή διπλές για να ανοίξει το ταμπλό, βάλε μέσα και τα 15 πούλια και προχώρα σαν ένας στρατός, τέταρτο τέταρτο.

Ή παίξε ολόκληρο Τάβλι: Πόρτες, Πλακωτό και Φεύγα με τη σειρά. Παίζετε στους 1, 3, 5 ή 7 βαθμούς. Το μονό είναι 1 βαθμός, το διπλό 2.

ΜΕ ΤΟΝ ΥΠΟΛΟΓΙΣΤΗ
Δύο επίπεδα. Το Εύκολο παίζει μια τυχαία σωστή κίνηση, ιδανικό για αρχή. Το Μέτριο παίζει σαν απλός παίκτης. Ο υπολογιστής παίζει μέσα στο κινητό σου, οπότε παίζεις και χωρίς internet.

ΔΥΟ ΠΑΙΚΤΕΣ, ΕΝΑ ΚΙΝΗΤΟ
Παίξτε με τη σειρά στο ίδιο κινητό. Γράψτε τα ονόματά σας, αν θέλετε. Το ταμπλό γυρίζει προς τον παίκτη που έχει σειρά.

ΜΑΘΕ ΝΑ ΠΑΙΖΕΙΣ
Πρώτη φορά στο τάβλι; Ένα μάθημα ενός λεπτού στο κανονικό ταμπλό σού μαθαίνει τις Πόρτες σε 7 μικρά βήματα: κίνηση πουλιού, παίξιμο και των δύο ζαριών, διπλές, πόρτα, χτύπημα, είσοδο από τη μέση και μάζεμα. Μετά παίζεις το πρώτο σου παιχνίδι με τον υπολογιστή στο Εύκολο.
Κάθε παιχνίδι έχει επίσης τη σελίδα «Πώς παίζεται»: την αρχική θέση, πώς κινούνται τα πούλια και τους ειδικούς κανόνες. Την ανοίγεις από την αρχική οθόνη, από το μενού του παιχνιδιού ή από το «Νέο παιχνίδι».

ΦΤΙΑΓΜΕΝΟ ΓΙΑ ΤΑΒΛΑΔΟΡΟΥΣ
• Ελληνικά και αγγλικά
• Αναίρεση κινήσεων μέχρι να πατήσεις «Επιβεβαίωση», ή αυτόματη επιβεβαίωση
• Μετρητής πόντων, αν τον θέλεις
• Το παιχνίδι αποθηκεύεται μόνο του. Συνεχίζεις όποτε θέλεις.
• Ξύλινο ταμπλό, με ήχους και δόνηση

ΧΩΡΙΣ ΔΙΑΦΗΜΙΣΕΙΣ, ΧΩΡΙΣ ΛΟΓΑΡΙΑΣΜΟ
Καμία διαφήμιση. Καμία σύνδεση. Τα παιχνίδια σου μένουν στο κινητό σου. Εσύ αποφασίζεις αν η εφαρμογή θα στέλνει ανώνυμα δεδομένα χρήσης, και μπορείς να αλλάξεις γνώμη όποτε θέλεις στις Ρυθμίσεις.

Πολιτική απορρήτου: https://tavlaki.com/el/privacy
```

2,156 characters.

Optional line (only if the owner wants it). Put it before "ΧΩΡΙΣ ΔΙΑΦΗΜΙΣΕΙΣ":

```text
ΕΡΧΕΤΑΙ ΣΥΝΤΟΜΑ
Παιχνίδι με φίλους online.
```

## What's new in v1.0

Limit: 4,000 on the App Store, 500 on Google Play.

```text
Η πρώτη έκδοση της εφαρμογής Ταβλάκι.
• Πόρτες, Πλακωτό, Φεύγα και Ασόδιο, και ολόκληρο Τάβλι
• Υπολογιστής σε Εύκολο και Μέτριο επίπεδο
• Δύο παίκτες σε ένα κινητό
• «Μάθε να παίζεις»: ένα μάθημα ενός λεπτού στο ταμπλό
• Σελίδα «Πώς παίζεται» για κάθε παιχνίδι
• Ελληνικά και αγγλικά
```

284 characters.

**Owner:** a native speaker should read the Greek once more before launch, as for the privacy policy.
