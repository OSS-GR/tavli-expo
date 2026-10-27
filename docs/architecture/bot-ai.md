# Bot AI

> Living document. Research date: 2026-10-26. Owner: `packages/bot`.
> **Implemented API (#27):** `createBot(...).chooseTurn(state, dice, difficulty, { rng })` in `@tavli/bot`; the app uses the `BotRunner` port from `@tavli/contracts` (`chooseMove(req)`, async, seed-based). See `packages/bot/README.md`. The sketch in section 7 is the original design.
> **Hard level, Portes (#147), Plakoto and Fevga (#156):** a TD(λ)-trained net per game (`portes-net.ts`, `plakoto-net.ts`, `fevga-net.ts`, shared code in `net.ts`), 1-ply, registered as `hard` in `DEFAULT_EVALUATORS`. See sections 5.7 and 5.8 and `packages/bot/README.md`, "The Portes net" and "The Plakoto and Fevga nets".
> **Variant questions (#106):** `createBot(...).chooseAnswer(state, difficulty, { rng })` answers `Variant.prompt` (Plakoto "resign or play on"); the port has an optional `chooseAnswer(req)`. See section 4.5.
> Related: [ADR-0002 modular architecture](../decisions/0002-modular-architecture.md), [roadmap](../roadmap.md).

## 1. Summary and recommendation

- **Write our own bot in pure TypeScript.** Do not ship GNU Backgammon (GPL). No ready-made open bot covers Plakoto, Fevga, or Asodio anyway.
- **One bot package, many parts.** The bot is a *search* (how many moves ahead) plus an *evaluator* (how good is a position). Each part is pluggable. Each variant gets its own evaluator.
- **Easy and medium (MVP1, MVP3):** A hand-written heuristic evaluator with 1-ply search. Add random "noise" to make the bot weaker on purpose. No training needed. It costs under 10 ms per move.
- **Hard (v1.0):** A small neural net per variant, trained by us with TD(λ) self-play (the TD-Gammon method). Use 1-ply search, then 2-ply on the best 3–5 moves. The net is a small MLP. Plain TypeScript math runs it fast enough on a phone. No native ML library is needed.
- **Train in Node.js with our real engine.** This avoids a second copy of the rules in Python. Training runs on a laptop CPU overnight. A GPU is not needed for nets this small.
- **Run the bot off the UI thread** for hard mode, with `react-native-worklets`. Easy and medium are fast enough to run inline.
- **wildbg** (MIT/Apache-2.0 code, CC0 nets) is the best open engine we can legally use. It covers standard backgammon only. Use it as a benchmark for our Portes bot, and maybe later as a Portes evaluator. Do not make the MVP depend on it.

## 2. Options compared

### 2.1 Existing engines

| Engine | License | Variants | Can we ship it in a closed app? | Notes |
|---|---|---|---|---|
| GNU Backgammon (gnubg) | GPL-3.0+ (code and weights) | Backgammon only | **No** | Very strong. Nets: 250 inputs, 128 hidden, 5 outputs, split into contact / race / crashed nets. Fine as a **local** sparring partner during development (not shipped). |
| eXtreme Gammon (XG) | Proprietary, per-machine licence | Backgammon | No | Strongest commercial bot. Closed. |
| BGBlitz | Proprietary, freemium | Backgammon | No | Neural-net bot ("TachiAI"). Closed. |
| **wildbg** (Rust) | **MIT OR Apache-2.0** (code). Nets repo `wildbg-training` is **CC0-1.0** | Backgammon only | **Yes**, with licence notice | Alpha stage. Has a WASM build (`wildbg-wasm`, TypeScript types, runs in browsers). Nets are ONNX, run in Rust with `tract`. Contact net: 202 inputs → 300 → 250 → 200 → 6 outputs. Race net: 186 inputs. Trained from rollouts + supervised PyTorch, not TD. |
| Palamedes (Papahristou) | Not stated (research) | Portes, Plakoto, Fevga, more | Unknown — do not copy | Won Computer Olympiad 2011 and 2015. Expert level in all three Greek games. Author also ships *HappyGammon* on Android. Use the papers for ideas. We could contact the author about licensing. |
| TD-Gammon re-implementations (GitHub, Python/PyTorch) | Varies per repo | Backgammon | Check each repo | Good to learn from. Example: `OneUpWallStreet/TD-Gammon` (PyTorch, 80 hidden, 30k games). The algorithm itself is free to use; we write our own code. |
| PureTD (arXiv 2608.15146, Aug 2026) | Paper CC BY 4.0, code unknown | Backgammon | Ideas only | Self-play TD, MLP 200 → 512-512-256-256. Claims stronger than gnubg 1-ply with no search. Shows TD self-play is still state of the art for small budgets. |

No open bot for Plakoto, Fevga, or Asodio was found. I found no information on Asodio bots or published Asodio rules online. Our bot must rely on our own `docs/rules/asodio.md`.

### 2.2 Bot methods

| Method | Strength | Cost per move (phone) | Training | Good for |
|---|---|---|---|---|
| Random legal move | Very weak | < 1 ms | None | "Beginner" / tests |
| Heuristic eval + 1-ply | Weak–intermediate | 1–10 ms | None (hand-tune weights) | Easy, Medium |
| Heuristic + weight tuning by self-play | Intermediate | 1–10 ms | Minutes–hours | Better Medium |
| Neural net (TD self-play) + 1-ply | Strong | 10–50 ms | Hours on a laptop | Hard |
| Neural net + 2-ply (top N moves) | Very strong | 100–800 ms | Same net | Hard, hints |
| Monte Carlo rollouts / MCTS | Depends on eval inside | Seconds+ | None or net | Analysis on server, not live play |

Notes on MCTS: MCTS was tried for backgammon (van Lishout, Chaslot, Uiterwijk 2007, "MCGammon"). Plain rollouts with a weak policy are much weaker than a trained net. Dice make deep search expensive. Strong programs use a net with shallow search (1–3 ply), and rollouts only for offline analysis. We follow that.

### 2.3 On-device inference

| Option | Extra native code | App size | Speed for a tiny MLP | Works in Node + server | Verdict |
|---|---|---|---|---|---|
| **Pure TS (Float32Array loops)** | None | Weights only (~50–300 KB per net) | Good. No call overhead. | Yes, same code | **Pick this** |
| `onnxruntime-react-native` | Yes (config plugin; Expo plugin was recently patched for Android autolinking) | Several MB | Fast per call, but JS↔native cost per call hurts when we do 1000s of tiny evals | Separate package | Overkill |
| `react-native-fast-tflite` | Yes (JSI; v3 uses Nitro Modules) | Several MB | Same as above. GPU delegates do not help tiny nets | No | Overkill |
| WASM (e.g. `wildbg-wasm`) | Depends on Hermes WASM support | ~1–3 MB (estimate) | Good | Yes | **Not ready.** One secondary source (Callstack) says Hermes got WASM support around RN 0.84. The official RN blog does not confirm it. Re-check later. |
| Native Rust module (wildbg via Expo Module) | Yes, Rust toolchain for iOS + Android | ~1–3 MB | Best | No | Too much work for MVP |

## 3. Licensing notes

- **GNU Backgammon is GPL-3.0+.** If we link its code or ship its weights, our whole app must be GPL. Apple's App Store terms add limits that many people consider incompatible with the GPL. Examples: VLC was pulled from the App Store in 2011 after a GPL complaint. The gnubg maintainer said in 2014 that the App Store terms do not allow GPL programs. **Do not ship any gnubg code or weights.**
- **Using gnubg during development is fine.** We can run it on a laptop as an opponent to measure our bot. That does not distribute it.
- **gnubg output as training data** (for example rollout results) is a grey area. Program output is usually not covered by the GPL, but we keep it simple: **train shipped nets only on our own self-play data.**
- **wildbg is safe.** Code: MIT or Apache-2.0 (Carsten Wenderdel, 2023). Nets repo: CC0. If we port its code (e.g. input encoding) or ship its nets, add its licence text to our in-app "Open-source licences" screen. Check the licence of the stronger nets on its `nets` branch before use.
- **XG, BGBlitz, Palamedes:** proprietary or unknown. Do not copy code or weights. Ideas from papers are free to use.
- **Libraries:** ONNX Runtime (MIT) and TensorFlow Lite (Apache-2.0) are fine if we ever need them.
- **Not legal advice.** If we ever ship a third-party engine, ask a lawyer first.

## 4. Difficulty design

### 4.1 How one bot makes three levels

All levels use the same pipeline:

1. Ask the engine for all legal **turns** (full move sequences) for the dice. Remove duplicates that lead to the same position.
2. Score each resulting position with an **evaluator**.
3. Optionally look deeper (**2-ply**) on the best few.
4. Pick a move with a **noise policy** (this is how we make mistakes on purpose).

| Level | Evaluator | Search | Mistake policy |
|---|---|---|---|
| Easy | Heuristic | 1-ply | Softmax over scores, temperature 0.15. About half of its moves are not the best, but most of those cost little. Never passes a winning turn (e.g. a bear-off that wins). |
| Medium | Heuristic (tuned) | 1-ply | Softmax, temperature 0.01. Small, plausible mistakes only. |
| Hard | Neural net (Portes #147, Plakoto and Fevga #156, Asodio #164) | 1-ply (2-ply was tried: no gain, much slower; see 5.7) | Softmax, temperature 0.01, like medium. |
| (Later) Expert / Hints | Neural net | 2-ply, wider, longer time budget | None |

Why softmax noise and not random moves: a softmax picks good moves more often and bad moves rarely. The bot then looks like a weaker human, not a broken program. Track the **average equity loss per move** of each level in bot-vs-bot tests. Tune temperature until the levels are clearly apart (e.g. Hard beats Medium ~70%+, Medium beats Easy ~70%+).

**Measured (Portes, #28, 1,000 games, seed 1):** medium beats random 99.9%, medium beats easy 78.1%, and easy beats random 98.5%. Medium decides in 0.09 ms median and 3.9 ms worst (Node, 300 random positions). At "1 in 3 not best", medium beat easy only 57%, so easy uses more noise to keep the 70%+ gap.

**Measured (Plakoto, #106, 1,000 games, seed 1):** medium beats random 93.6%, medium beats easy 84.9%, and easy beats random 84.6% (draws, when both mothers are pinned, count as non-wins: 5–10% of games). Medium decides in 0.07 ms median and 1 ms worst (Node, 300 random positions). Same temperatures as Portes. Details: `packages/bot/README.md`, "The Plakoto heuristic".

**Measured (Fevga, #105, 1,000 games, seed 1):** medium beats random 94.4%, medium beats easy 81.4%, and easy beats random 74.0%. Same temperatures as Portes (easy 0.15, medium 0.01). Fevga has more luck: there is no hitting and every play of a roll moves the same pips, so a bot that only counts pips beats random play just 56%. Per turn, easy loses 0.075 points on average (71% of its turns are not the best); medium loses 0.002. Medium decides in 0.03 ms median and 1.7 ms worst (Node, 5,000 positions from medium games). Details: `packages/bot/README.md`, "The Fevga heuristic".

**Measured (Asodio owner version `asodio.kafeneio`, #125, 1,000 games, seed 1):** medium beats random 68.8% (4.0% losses, 27.2% draws), medium beats easy 49.2% (18.1% losses, 32.7% draws), and easy beats random 52.8% (6.0% losses, 41.2% draws). Draws are deadlocks (A5), and they are common: 30.5% of medium-vs-medium games, 43.0% of easy-vs-easy and 71.0% of random games (open question Q28). Of the games someone wins, medium wins 94.5% against random and 73.1% against easy. So the usual bars (85% / 70% with draws as non-wins) cannot be reached under the owner rules; the strength test uses bars set from these numbers. Same temperatures as Portes. Medium decides in 0.02 ms median and 20 ms worst (Node, 3,000 positions from medium games). Details: `packages/bot/README.md`, "The Asodio heuristic".

The bot gets its own injected RNG (seeded). It never uses `Math.random`. This keeps tests repeatable and matches the engine rule.

### 4.2 Heuristic evaluator (per variant)

A position score = weighted sum of features. Weights start hand-picked, then get tuned by self-play (simple hill-climbing: change a weight, play 2,000 games, keep it if it wins more).

| Feature | Portes | Plakoto | Fevga |
|---|---|---|---|
| Pip count difference (race) | ✓ | ✓ | ✓ (most important) |
| Checkers borne off | ✓ | ✓ | ✓ |
| Blots and direct/indirect shots | ✓ (hit risk) | ✓ (pin risk) | — (no hitting) |
| Checkers on bar | ✓ | — | — |
| Pinned checkers (mine / theirs) | — | ✓ (big weight) | — |
| "Mother" checker (last on start point) pinned | — | ✓ (huge weight; check `docs/rules/plakoto.md`) | — |
| Made points in home board | ✓ | ✓ | ✓ |
| Longest prime / blocking points in front of opponent | ✓ | ✓ | ✓ (single checker blocks in Fevga) |
| Anchors in opponent home | ✓ | ✓ | — |
| Checkers still on start point | — | ✓ | ✓ |
| Stacking / distribution | ✓ | ✓ | ✓ |

**Asodio, as built (#125, `asodio-heuristic-v1`, owner version `asodio.kafeneio`):** the evaluator has a light copy of the single-move rules (loading lock, quarter lock, pins) so it can count which dice a side can move and which pins each side can make next roll (a combined move stops at the quarter line, frozen checkers cannot shoot). Features: pins made and suffered (worth much more when the pinned checker is in its owner's rear quarter, because it freezes the whole army, A6), a side with no move at all, dice with no move, shots at lone checkers, the race (Kleinman, with the first-entry gate as extra pips), made points, borne off. With no contact: the Portes race code. Draws: a **mutual lock** (each side has a pinned checker that can never be freed, because each pinner is frozen in front of its own pinned rear; own quarter `a` + their quarter `b` ≤ 2) is a sure draw and scores 0, and the next roll's chance to make one pulls the equity toward 0 for the side that is behind. The lock rules raised medium vs random from 62% to 72% (200 games); the weights barely matter. The Acey-Deucey presets (hits, roll chains, the `chooseDouble` question) work too.

**Plakoto, as built (#106, `plakoto-heuristic-v1`):** pins made and suffered (worth more the further the pinned checker is from home, and when the pinner sits in its own home), the mother pinned (4.5 logits, and 95% of the pinned side's losses count double), mother safety (a lone mother costs by the shots at it; 2+ on the start point are safe), lone checkers that can be pinned with their shot counts, race (Kleinman), home-board points, longest prime, borne off and stacking. No contact: the Portes race code. Weights in `PLAKOTO_DEFAULT_WEIGHTS`, tuned by two rounds of self-play (+0.27 points per game over the hand-picked start). There is no "anchor" feature: in Plakoto the start points are the anchors, and pins replace hits.

**Fevga, as built (#105, `packages/bot/src/evaluators/fevga-heuristic.ts`).** In contact: the pip race (Kleinman, with a low weight), the best prime in front of the opponent plus the checkers trapped behind it, opponent points in front of a side's last checker, blocked landing points per die, die values with no move at all, the runner rule (until the runner passes own point 11 only it may move), home points, checkers still on the mother (own 24), stacking and checkers off. With no contact left it is a pure race, scored with the Portes race code and bear-off table. All weights are in `FEVGA_DEFAULT_WEIGHTS`. Self-play tuning found two things: a low race weight is much better (every play moves the same pips, so a big race term drowns the block features), and "points in front of the last checker" is the most useful block feature.

### 4.3 Feel human

- **Think time:** wait 500–1500 ms before moving. Shorter for forced or only-one moves (~300 ms). Longer for doubles and close decisions. Add small random jitter. Compute runs during this wait, so the user never sees the real cost.
- **Move checkers one by one** with the normal animation (~250–400 ms each), not all at once.
- **Mistakes look natural** (softmax over good options, see 4.1). Easy should still bear off and take obvious safe moves.
- **Optional:** bot names and avatars per level ("Yiayia", "Kafeneio regular", "Champion").

### 4.4 Fairness and anti-cheating

- **Dice fairness:** players often think bots cheat with dice. The bot never sees future dice. `chooseMove` only gets the current dice. The dice RNG and the bot RNG are separate objects. Later we can show dice statistics after a game.
- **Hints and analysis:** the same `Analyzer` gives hints and post-game review. Hints are **off in online games** (both players must agree for friendly games; never in ranked).
- **Bot use in online games:** online, the server decides dice and checks moves, but it cannot stop a player from running a bot on a second device. For ranked play later, compare each player's moves with the hard bot on the server. Flag accounts with an error rate that is too low over many games. This is how chess sites detect engines.
- **Do not ship the hard bot's weights as a server secret.** They will be in the app bundle. That is fine; a bot is not a secret.

### 4.5 Variant questions (Plakoto "resign or play on", Asodio "choose a double")

Some variants ask a player a question between turns (`Variant.prompt`, phase `awaiting-answer`). Plakoto does: with `motherRule: "offerConcede"` the pinned player chooses `resign` (the opponent wins 2 points) or `playOn`. The bot answers with the same 1-ply pipeline as a turn: apply each choice with the engine (`answerPrompt`), score the result (true points if the game ends, else the evaluator), then the level's softmax picks.

- Resigning loses 2 points, the most a Plakoto game can lose, so "play on" is never worse. The evaluator puts a pinned mother close to −2 (measured: the pinned side scores −1.84 per game when it plays on; the evaluator says −1.78). So medium plays on, and easy (more noise) resigns some near-lost games, like a human who gives up.
- Asodio, Acey-Deucey presets only: after a 1-2 the player chooses a double (`chooseDouble`, choices `1`–`6`). The answer sets the dice of the same player's next turn, so each choice is scored as the best turn with that double (1-ply), not as a position before a roll. The owner version asks nothing (A3).
- A turn or answer that keeps the same player to move (an Asodio extra roll) scores the evaluation for that player, not its negation. `simulate` always follows `state.toMove` and plays `state.dice` when the state already holds them.
- The app asks the runner (`BotRunner.chooseAnswer`) when the phase is `awaiting-answer` and `prompt.player` is the bot. `simulate` does the same with `Bot.chooseAnswer`.

## 5. Training plan (hard level)

### 5.1 Method: TD(λ) self-play

The net plays itself. After each move, it nudges its estimate of the previous position toward the new one (TD error). At the end, it uses the real result. This is how TD-Gammon learned (Tesauro, 1991–1998).

TD-Gammon reference points:

| Version | Hidden units | Self-play games | Search | Level |
|---|---|---|---|---|
| 0.0 | 40 | 200k | 1-ply | Intermediate, no expert features |
| 1.0 | 80 | 300k | 1-ply | Strong intermediate |
| 2.1 | 80 | 1.5M | 2-ply | Near top human |
| 3.1 | 160 | > 6M | 3-ply | World class |

Papahristou and Refanidis applied the same method to Portes, Plakoto, and Fevga, with one net per variant and expert features. They reached expert level. So the method works for our variants.

### 5.2 Where to train

- **Train in Node.js / TypeScript**, in a dev-only folder (e.g. `tools/bot-training`, not shipped). It imports `packages/engine` and `packages/bot`. One copy of the rules means no rule drift.
- Use `worker_threads` to run games on all CPU cores. Merge weight updates, or run separate seeds and keep the best.
- A tiny MLP does not need PyTorch or a GPU. Online TD learning is one position at a time, which GPUs are bad at.
- **Optional phase 3:** the wildbg style. Generate positions by self-play, roll them out (1,296 games each), then train a bigger net with supervised learning in PyTorch. Export weights to our JSON/binary format. More work, stronger result.

### 5.3 Encoding (inputs) per variant

Base encoding for all variants, from the player-to-move's view (Tesauro / wildbg style):

- Per point, per player: 4 values for checker count. 1 → `[1,0,0,0]`, 2 → `[0,1,0,0]`, 3 → `[0,0,1,0]`, n ≥ 4 → `[0,0,1,(n-3)/2]`. That is 24 × 4 × 2 = 192 inputs.
- Checkers borne off per player (scaled /15): 2 inputs.

Variant extras:

| Variant | Extra inputs |
|---|---|
| Portes | Bar per player (2). Expert features: pip difference, number of shots on my blots, longest prime, home points made. (~210 total) |
| Plakoto | Per point: "my checker pinned here" and "their checker pinned here" (48). Mother-checker pinned flags (2). Pinned counts (2). Pin threat on my single checkers. (~250 total) |
| Fevga | Per point we only need "held" + count (fits the base encoding). Extras: blocking prime length in front of each side, checkers not yet past the opponent's start area, pip difference. (~200 total) |
| Asodio | Base encoding + pins (48), loading, the quarter lock and the heuristic's lock shots (279 total; see 5.9). |

Outputs (sigmoid): **P(win)**, **P(win double/mars)**, **P(lose double/mars)**. Greek scoring uses 1 or 2 points, so we do not need backgammon (triple) outputs. Equity = 2·P(win) − 1 + P(win double) − P(lose double). Check this against each rules doc.

### 5.4 Network size and cost

- Start: **inputs ~200–250 → 1 hidden layer of 80–128 (sigmoid or tanh) → 3 outputs.** About 20–30k weights. ~100 KB as Float32. ~16–32k multiply-adds per evaluation.
- Later, if we need more strength: 2 hidden layers (e.g. 128-64), or a separate "race" net when contact is over (gnubg and wildbg both do this).
- Bearoff: add a small **one-sided bearoff table** for the race end (all checkers home). It is exact and cheap (tens of thousands of entries).

### 5.5 Training time (estimates — measure early)

- One game ≈ 50–70 turns × ~20 candidate positions ≈ 1,200 forward passes + 60 backward passes.
- With a 200×100 net, that is roughly 25–30M multiply-adds per game. Node/V8 on a laptop core does very roughly 0.5–1 G of these per second.
- So about **20–50 games/second per core**. 8 cores → **~500k–1M games overnight** per variant. That is TD-Gammon 1.0–2.0 territory.
- Four variants ≈ four nights of laptop time. A rented CPU box can do it faster. Cost: near zero.

### 5.6 How we know a net is better

- Play 10,000+ games vs the previous best net and vs the medium bot. Report win rate with a 95% confidence interval. (wildbg notes that even 300k games can wobble by 0.04 equity. Small gains need many games.)
- **Portes only:** also play vs gnubg and wildbg on a laptop (dev only). Portes is close to backgammon without the cube. Rule differences (e.g. how gammons/backgammons score) must be handled in the harness.
- Keep a set of test positions with known best moves per variant (we can write them with strong local players).
- Version every net: `weights/<variant>-v<N>.bin` + a hash + training notes in git.

### 5.7 What we built for Portes (#147)

What differs from the plan above, and why:

- **The net only scores contact.** A race uses the Portes heuristic (Keith count, Kleinman metric, exact bear-off table). Training games stop when contact breaks, with the race heuristic as the target. This is the gnubg idea of a separate race evaluator, without a second net.
- **Inputs:** the TD-Gammon units (192), bar and off (4), pip counts (2), the shot counts of both sides (2), and the heuristic's contact score (1). 201 in all. The last input gives the net the hand-made features at once. With it, the net beat medium about 70% of the time after only 10,000 self-play games.
- **Training in `packages/bot/src/train/`** (not `tools/bot-training`), with `scripts/train.ts` as the Node entry. No `worker_threads`: we ran separate processes with different settings and seeds, and kept the best.
- **λ-returns computed backwards at the end of each game** (the "forward view"), not eligibility traces. A step only touches the weight rows of the inputs that are set, so it is cheap.
- **Weights in a `.ts` file** (`portes-net-weights.ts`, base64 Float32), not a `.bin`, so Metro, Vitest and Node load it with no extra setup. The training notes are in the file and in the bot README.
- **1-ply only.** 2-ply on the top 3 turns gave no measurable gain over 400 games and was 16 times slower.

**Measured (Portes hard, #147):** the shipped net (`portes-net-v1`: 201 → 40 → 3, 44 KB file) beat medium in 742 of 1,000 games (`simulate`, seed 1), 734 of 1,000 paired games (seed 2026) and 1,535 of 2,000 (seed 99): 73–77%, above the 70% target. It took 150,000 self-play games, 58 minutes on one core. It decides in 0.14 ms median and 5 ms worst (Node, 300 random positions). Details and the training runs: `packages/bot/README.md`, "The Portes net".

### 5.8 Plakoto and Fevga (#156)

- **One trainer and one evaluator for every game.** A game plugs in through a `NetGame` (`packages/bot/src/evaluators/net.ts`): its fast board arrays, its game end, its inputs, and the positions the net leaves to the heuristic. The bot's evaluator and the trainer share the 1-ply scoring (`scoreNetCandidates`) and the pick (`pickTurn`), so training and play cannot drift. The Portes net runs on the same code, with the same numbers as before.
- **Plakoto leaves a pinned mother to the heuristic**, as well as the race. A pinned mother nearly decides the game, and the heuristic's value for it is close to the true one, so training games stop there. Inputs: the TD-Gammon units (192), pin units per point and side (48), lone mothers (2), off and pips (4), pin shots and mother shots (4), the heuristic's contact score (1): 251.
- **Fevga** has no pins or bar. Inputs: the TD-Gammon units (192), off and pips (4), the heuristic's block features per side (prime, trapped checkers, points ahead, blocked landings, dead dice, runner lock and distance, home points, start checkers, stacks: 20), and the contact score (1): 217.
- **Training:** TD(λ) as in 5.7, λ 0.7, 40 hidden units, no warm start, one core per run. Plakoto: 45,000 games (28 minutes). Fevga: 100,000 games in two runs (about 43 minutes). Self-play answers the Plakoto mother question with "play on". A game longer than 1,000 turns is dropped. Each match against medium uses its own seed, and the best checkpoints were played again on a fresh seed.

**Measured (#156):** Plakoto hard (`plakoto-net-v1`, 251 → 40 → 3, 55 KB file) beat medium in 732 of 1,000 games (`simulate`, seed 1, 6 draws) and 736 of 1,000 paired games (seed 2026): about 73%. Fevga hard (`fevga-net-v1`, 217 → 40 → 3, 48 KB file) won 810 and 807 of 1,000: about 81%. Both are above the 70% target. Median decision time 0.20 ms (Plakoto) and 0.07 ms (Fevga), worst 3 ms. Details: `packages/bot/README.md`, "The Plakoto and Fevga nets". With all three games of a Tavli match at Hard, the app now offers Hard for Tavli too.

### 5.9 Asodio (#164)

- **The net plays the owner version only** (`asodio.kafeneio`). For any other rule set (the Acey-Deucey presets with hits and roll chains, or a changed army flag) hard uses the heuristic for every position (`isAsodioNetRules`).
- **A mutual lock goes to the heuristic**, as well as the race. Both armies hold each other forever, so the game is a sure draw (0), and training games stop there. The net counts a draw as half a win (target `[0.5, 0, 0]`); the heuristic's numbers are put in the same terms, with the same equity.
- **Inputs:** the TD-Gammon units (192), pin units (48), loading (outside checkers, the first-entry gate: 4), off and pips (4), the quarter lock (rear quarter and lowest pinned quarter, one-hot: 16; frozen checkers and a pinned rear: 4), dead dice and a frozen army (4), pin shots and lock shots (4), the heuristic's mars shares (2) and contact score (1): 279.
- **Training:** TD(λ) as in 5.7, 40 hidden units, λ 0.5, α 0.05 → 0.005, no warm start: 35,000 games (58 minutes). Runs with λ 0.7, 60 hidden units, a longer run, training against medium, and 2-ply with the heuristic gave no more.

**Measured (#164):** Asodio hard (`asodio-net-v1`, 279 → 40 → 3, 61 KB file) beat medium in 489 of 1,000 games (`simulate`, seed 1: 261 losses, 250 draws, +0.47 points per game) and 488 of 1,000 paired games (seed 2026). That is about 50% of all games, below the 70% target: about a quarter of the games end in a deadlock draw, and most of those draws come from the dice (the quarter lock leaves few choices). Medium against medium wins 35% and draws 30%.

**The Asodio bar (owner decision, #164).** Because of the lock draws, the Asodio test does not ask for 60% of all games, like the other games. Hard must win at least 60% of the games that someone wins (wins / (wins + losses)) and score more points than medium, in 200 paired games; draws are reported but do not count. The CI match (seed 2029): 102 wins, 43 losses, 55 draws, so 70% of the decided games, and 187 points against 73. Median decision time 0.006 ms, p99 7 ms. Details: `packages/bot/README.md`, "The Asodio net".

## 6. On-device inference and threading

### 6.1 Budget per move (mid-range phone, e.g. Pixel 6a / iPhone 12 class)

| Level | Target compute | Hard ceiling |
|---|---|---|
| Easy / Medium | < 10 ms | 50 ms |
| Hard | < 300 ms | 800 ms (stop search when the budget runs out) |
| Hints / analysis | < 1 s | 2 s |

Hermes interprets bytecode (no JIT), so JS math is slower than in Node. Plan: build a tiny benchmark screen in MVP1 and measure on a real low-end Android phone.

Rough math for hard mode with a 30k-weight net:

- 1-ply: ~20 candidates (up to a few hundred for doubles before dedupe) × 30k = ~0.6M ops. Fast.
- 2-ply on top 4 candidates: 4 × 21 rolls × ~20 replies × 30k ≈ 50M ops. Maybe 0.3–1 s in Hermes. That is why we only go 2-ply on the top few, with a time budget.
- Speed tricks: flat `Float32Array` weights, no object allocation in loops, dedupe positions, cache evaluations by position hash, **incremental first layer** (update only the inputs that changed).

### 6.2 Keep the UI smooth

| Option | How | Pros | Cons |
|---|---|---|---|
| Inline on JS thread | Call `chooseMove` directly | Simplest | Freezes JS while it runs. Fine for < 20 ms (easy/medium) |
| Inline with time slicing | Search as a generator; yield every ~8 ms | No native deps | Slower overall; more code |
| **`react-native-worklets` runtime** | `createWorkletRuntime()` + `runOnRuntimeAsync()` | Real background thread. Already a dependency of Reanimated 4. **Bundle Mode** lets worklets use any code in the bundle (our engine and bot) | Bundle Mode needs setup; not yet the default mode. Test on both platforms |
| `react-native-worklets-core` (Margelo) | Similar worklet threads | Works with VisionCamera ecosystem | Another native dep |
| Server bot | HTTP/Edge function | Strongest search, no phone cost | Needs network, costs money; breaks offline goal |

**Pick:** inline for easy/medium in MVP1. Add a `BotRunner` port with a worklet adapter for hard mode in v1.0. Use the server only for heavy post-game analysis later, if ever.

## 7. Interface sketch (TypeScript)

The engine owns rules. The bot only calls the `Variant` interface (ADR-0002). Names below are a sketch; match them to the real engine types.

```ts
// packages/bot/src/types.ts
import type { GameState, Dice, Turn, VariantId, Rng } from '@tavli/engine';

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Win chances from the view of the player to move. */
export interface Evaluation {
  win: number;        // P(win)
  winDouble: number;  // P(win 2 points / mars)
  loseDouble: number; // P(lose 2 points / mars)
  equity: number;     // expected points, -2..+2
}

/** Scores a position. Heuristic, neural net, or (later) wildbg port. */
export interface Evaluator {
  readonly id: string;              // e.g. 'portes-nn-v3'
  readonly variant: VariantId;
  evaluate(state: GameState): Evaluation;
}

export interface BotOptions {
  rng: Rng;               // injected, seeded; never Math.random
  timeBudgetMs?: number;  // stop deeper search after this
}

/** The main entry point. Pure and synchronous. */
export interface Bot {
  chooseTurn(
    state: GameState,
    dice: Dice,
    difficulty: Difficulty,
    opts: BotOptions,
  ): Turn; // a Turn = the full list of single moves (Move[]) for this roll
}

/** Same machinery, used for hints and post-game review. */
export interface Analyzer {
  rankTurns(
    state: GameState,
    dice: Dice,
    opts?: { plies?: 1 | 2; top?: number },
  ): Array<{ turn: Turn; evaluation: Evaluation; equityLoss: number }>;
  evaluate(state: GameState): Evaluation;
}
```

```ts
// packages/contracts/src/bot-runner.ts — the port the app uses
export interface BotRunner {
  chooseMove(req: {
    variant: VariantId;
    state: GameState;
    dice: Dice;
    difficulty: Difficulty;
    seed: number;
    timeBudgetMs?: number;
  }): Promise<Turn>;
  cancel(): void; // e.g. user leaves the game
}
// Adapters: InlineBotRunner (MVP1), WorkletBotRunner (v1.0), ServerBotRunner (maybe later).
```

```ts
// packages/bot/src/index.ts — how parts plug together
export function createBot(registry: {
  evaluators: Record<VariantId, Partial<Record<Difficulty, Evaluator>>>;
}): Bot & Analyzer;
```

What the engine must provide for the bot:

- `legalTurns(state, dice): Turn[]` — full turns, with duplicates (same end position) removed. Must be fast.
- `applyTurn(state, turn): GameState` — pure, no mutation (or a fast undo API for search).
- `positionKey(state): string | bigint` — for caching.
- `result(state)` — winner and points (1 or 2).

Tests the bot package must have:

- Always returns a legal turn, for every variant, for 10k random positions.
- Same seed → same move.
- Takes a forced win when one exists.
- Bot-vs-bot simulation of 1,000 games finishes with no errors (this also tests the engine).

## 8. Phased plan

### Phase 1 — MVP (MVP1 Portes, then MVP3 other variants)

1. `packages/bot` with the interfaces above. Depends only on the engine.
2. `RandomEvaluator` (tests and "beginner").
3. Heuristic evaluator for Portes. 1-ply search. Softmax noise. **Easy + Medium.**
4. `InlineBotRunner` + human-like delays and one-by-one animation.
5. Bot-vs-bot CLI harness in Node (`tools/bot-arena`): runs N games, prints win rates and equity loss.
6. A benchmark screen in the dev build: time per move on a real low-end Android phone.
7. MVP3: heuristic evaluators for Plakoto, Fevga, Asodio. Tune weights by self-play hill-climbing in the arena.

### Phase 2 — Hard level (v1.0)

1. `tools/bot-training`: TD(λ) self-play in Node with `worker_threads`. Start with Portes.
2. Neural evaluator in pure TS. Load weights from a bundled binary file.
3. 2-ply search on top candidates, with a time budget and a position cache.
4. Bearoff table for the race end.
5. `WorkletBotRunner` (react-native-worklets, Bundle Mode) so hard mode never blocks the UI.
6. Train and ship nets for Plakoto, Fevga, Asodio. Measure each vs medium and vs the previous net. (Plakoto and Fevga: done, #156. Asodio: done, #164, with its own bar: 60% of the decided games, see 5.9.)
7. Benchmark the Portes net vs gnubg and wildbg locally (dev only).

### Phase 3 — Later

- Hints and post-game review with the `Analyzer` (roadmap "Later").
- Match-score-aware play (Tavli match to 5 or 7 points) using a match equity table.
- Server-side move analysis for ranked anti-cheat.
- Optional: stronger nets with rollouts + supervised training (wildbg style), or a port of the wildbg Portes evaluator if its licence and rules fit.
- Re-check WASM in Hermes. If it is stable, `wildbg-wasm` could become an "Expert" Portes evaluator.

## 9. Open questions

- Asodio: deadlock draws are common even between bots (30% of medium-vs-medium games, see 4.1 and Q28 in `docs/open-questions.md`). Most come from the two armies crossing in the middle of the board, where each side's new quarter is the other side's rear quarter. If playtests confirm it, a rules change (not a bot change) is the fix.
- Portes scoring: does our Portes count backgammon (triple)? It changes the net outputs.
- Plakoto: the mother rule is settled (`offerConcede`, owner, 2026-10-26; see `docs/rules/plakoto.md`). Open: should the bot resign a hopeless pinned mother at medium too, to save the human time? Today only easy sometimes does.

## 10. Sources

- wildbg repo (licence, WASM, status): https://github.com/carsten-wenderdel/wildbg
- wildbg WASM docs: https://github.com/carsten-wenderdel/wildbg/blob/main/docs/user/wildbg-wasm.md
- wildbg training docs: https://github.com/carsten-wenderdel/wildbg/blob/main/docs/dev/training.md
- wildbg input encoding: https://github.com/carsten-wenderdel/wildbg/blob/main/crates/engine/src/inputs.rs
- wildbg contact model: https://github.com/carsten-wenderdel/wildbg/blob/main/training/src/train_contact.py
- wildbg-training (CC0 nets): https://github.com/carsten-wenderdel/wildbg-training
- GNU Backgammon GPL: https://www.gnu.org/software/gnubg/manual/html_node/GPL-copying_002fwarranty-info.html
- gnubg maintainer on App Store (2014): https://lists.libreplanet.org/archive/html/bug-gnubg/2014-07/msg00002.html
- gnubg iPhone port discussion (2009): https://mail.gnu.org/archive/html/bug-gnubg/2009-07/msg00003.html
- gnubg net sizes: https://lists.libreplanet.org/archive/html/bug-gnubg/2012-04/msg00000.html
- VLC and the App Store (2011): https://www.engadget.com/2011-01-09-the-gpl-the-app-store-and-you.html
- eXtreme Gammon: https://en.wikipedia.org/wiki/EXtreme_Gammon
- BGBlitz: https://alternativeto.net/software/bgblitz/about
- TD-Gammon: https://en.wikipedia.org/wiki/TD-Gammon
- TD-Gammon PyTorch example: https://github.com/OneUpWallStreet/TD-Gammon
- PureTD (2026): https://arxiv.org/abs/2608.15146
- Palamedes project: https://nikpapa.com/Palamedes
- Papahristou & Refanidis, "On the Design and Training of Bots to Play Backgammon Variants" (AIAI 2012): https://dl.ifip.org/IFIP-AICT-381/hal-01521393
- Papahristou PhD thesis (2015): https://www.didaktorika.gr/eadd/handle/10442/43622?locale=en
- Opening statistics for backgammon variants (SETN 2014): https://ruomo.lib.uom.gr/handle/7000/886?mode=full
- MCTS in backgammon (2007): https://orbi.uliege.be/handle/2268/28469
- Tavli rules overview: https://en.wikipedia.org/wiki/Tavli
- react-native-worklets Bundle Mode: https://docs.swmansion.com/react-native-worklets/docs/bundleMode/
- react-native-worklets runOnRuntimeAsync: https://docs.swmansion.com/react-native-worklets/docs/threading/runOnRuntimeAsync/
- onnxruntime-react-native Expo plugin fix: https://app.semanticdiff.com/gh/microsoft/onnxruntime/commit/99e811d16d829ac1ad3724e2aed6eb49122bb5eb
- react-native-fast-tflite: https://github.com/mrousavy/react-native-fast-tflite
- Hermes WASM claim (secondary source): https://www.callstack.com/events/react-native-0-84-and-other-news
- React Native release blog: https://reactnative.dev/blog
