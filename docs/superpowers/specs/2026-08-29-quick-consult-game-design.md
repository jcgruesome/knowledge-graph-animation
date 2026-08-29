# Quick Consult: the game — design

Date: 2026-08-29
Status: revised after adversarial design review and technical feasibility review
Builds on: the ReshapeX x Novanta Quick Consult knowledge graph animation in this repo

## Revision note

Version 1 of this spec was reviewed by an adversarial game-design pass and a technical pass against
the actual codebase. Both found serious problems. The two root causes were:

1. **Uncertainty lived in the player's memory.** Because the catalog is fixed and learnable, a good
   player is eventually never unsure — so the confidence dial that justifies the entire design
   became a novice-only mechanic, and five of eight upgrades (including the keystone) became null
   cards at mastery.
2. **The verb was drag.** A precise drag is Fitts-bound at 400-500ms, which made the stated
   difficulty curve impossible by roughly 2-3x, and it was the sole reason mobile was excluded —
   forfeiting most of the demand-gen funnel.

This version relocates uncertainty into the query data and changes the verb. Those two changes
resolve most of the review findings. The remaining findings are addressed individually and the
technical section now records what was verified in the code rather than what was assumed.

## Purpose

Two goals held at once:

1. **Demand-gen brand artifact.** A public, instantly playable web thing that puts ReshapeX in front
   of industrial buyers. Measured in plays, completion of the first query, and shares.
2. **A real game.** Optimized for genuine fun and depth, so it spreads *because* it is good.

The second goal serves the first. A mediocre game with a great logo gets one polite share; a good
game gets posted by strangers. Every trade-off resolves toward "is this fun" first.

The brand is carried by the mechanic, not by decoration. The central risk/reward dial is a direct
translation of the ReshapeX thesis: a confident wrong answer costs more than no answer.

### Success criteria, measurable

- **Comprehension:** 8 of 10 naive testers complete query 1 unaided in under 30 seconds.
- **Pull:** 5 of 10 naive testers ask to play again without being prompted.
- **Retention:** a returning player has a reason to start a fifth run.
- **Share:** the end-of-run artifact is posted without being asked for.
- **Balance:** tuned by simulation, not hand-play.

## Locked decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Core loop | Route the query | Player is the agent; the confidence dial is the brand thesis as a mechanic |
| Retention | Roguelite runs with between-wave upgrades | Highest depth ceiling and the strongest "one more run" pull |
| Mastery | Fixed catalog, everything else rerolls | Expertise is the product; learning the map is the skill |
| Presentation | Same engine, locked gameplay camera | Looks like the film, plays like a game, reuses most of the renderer |
| **Verb** | **Click/tap to select, keyboard shorthand for experts** | Drag is Fitts-bound and forfeits mobile; the signal animation is kept as a *result*, not an input |
| **Uncertainty** | **Lives in the query data, not the player's memory** | Memory-based doubt decays with skill and takes the whole dial with it |

## Core loop

### Anatomy of a query

A query is a customer spec that requires a **chain of modules**, not a single part:

```
UR10e · 12.5 kg · palletizing
  slot 1  tool changer        must be rated >= 12.5 kg
  slot 2  gripper             must suit the application
  slot 3  robot-side adapter  must match the robot flange family
```

Later waves add slots. Crucially, **slots are not all decisions**: choosing a gripper family implies
its adapter. A five-slot query is three decisions plus two implications, which is what keeps the
action economy humane (see Difficulty).

### Spec quality: where uncertainty actually lives

Queries arrive at one of three quality levels, and the mix shifts toward the bottom as waves
progress:

- **Complete** — every attribute needed is stated. A catalog-fluent player can answer with certainty.
- **Incomplete** — a required attribute is missing. "Needs to lift a hot casting, dusty cell" states
  no payload. Perfect catalog knowledge narrows this to a few candidates but cannot resolve it.
- **Contradictory** — two stated attributes conflict. A distributor sheet gives a flange code that
  does not match the stated robot model.

This is the single most important change from v1. A catalog-perfect player still has to judge
*"is this information sufficient to commit?"* — a decision that never decays with skill. It is also
truer to the product: real customer queries are vague, and declining to guess is the point.

### The verb

**Click or tap the arm, then the band.** Two actions per decision. Keyboard shorthand (arm key, then
band number) is available for players who want a higher ceiling, and is strictly optional.

On commit, the signal races down the spoke and blooms the chosen band — the exact visual from the
animation. The tactile pleasure of routing a signal is preserved as a *result animation*; it simply
is not the input method. This is what puts mobile back in scope.

### The skill

Module bands are **not labelled during play** after onboarding. The player learns that the
tool-changer arm runs light-to-heavy clockwise, that UR adapters sit on the inner ring. Wave 1 they
read tooltips; wave 8 their hand goes there without thinking.

This is the same pattern recognition a real applications engineer builds over years, which is why
the fixed catalog matters: rerolling the map every run would make the skill unlearnable.

### The confidence dial

Three ways to close a query. All three are live at every skill level because doubt now comes from
the spec, not from recall.

| Action | Cost | Reward | Trust |
| --- | --- | --- | --- |
| **Answer** | None | Full points, extends streak | A wrong chain is a *hallucination*: the largest trust loss in the game |
| **Validate slot** | 1 validation charge, ~0.4s | Points reduced 15% per charge spent | None. Reports whether **that specific slot** is correct |
| **Escalate** | 1 escalation charge | 40% points, streak intact | None |

Two changes from v1, both from review findings:

- **Validation is per-slot, cheap, and budgeted** (3 charges per wave, refreshed each wave). In v1 it
  reported whole-chain validity only after every slot was filled, costing a quarter of the clock —
  an alarm the player had no time or information to act on. Now the interesting question is *which*
  slot you spend certainty on, which is a real decision that survives mastery.
- **Escalation spends its own charge pool** (2 per wave, +1 per 5 correct answers), not a queue slot.
  In v1 escalating cost almost exactly what letting the query time out cost, so the safe option was
  barely distinguishable from failure. It now also pays 40% rather than zero: handing a genuinely
  under-specified query to a human is correct play, and correct play should score.

### The trust and points economy

v1 never defined an exchange rate between trust and points, so neither the player nor the balance
sim could evaluate the dial. Defined here, and to be tuned by simulation:

- Trust starts at 100. Hallucination -25. Timeout -8. Escalation 0. Any correct answer +2.
- Score: base 100 per query x speed multiplier (up to 2.0) x streak multiplier.
- **1 trust is nominally worth 12 points.** This is the exchange rate the sim optimizes against and
  the number the tuning conversation is about.
- Streak resets on a hallucination or a timeout. Escalation leaves it intact.

**Trust is spendable.** The player may deliberately burn **5 trust** to commit instantly at the full
speed multiplier ("ship it"). Risk becomes a resource to allocate rather than only a punishment to
absorb, and it gives the aggressive and cautious builds a place to meet.

The 5 is load-bearing and was checked against the exchange rate rather than guessed: at 12 points per
trust, burning 10 would cost 120 points to gain at most 80, so no rational player would ever press
it. At 5 it costs 60 to gain up to 80 — positive only when the player is already near the top of the
speed multiplier, which is exactly when the decision is interesting.

## Standing configuration

v1 created and disposed of every query, so nothing the player did persisted and mistakes never
compounded — the review's verdict was "a quiz app with good particles". Mini Metro grips because a
minute-3 decision still hurts at minute 12.

So the player owns a small **standing configuration** that carries across the run:

- **Cache.** Answering a query adds its chain to a cache with limited slots. Cached chains auto-fill
  on a matching query, which is the throughput reward for consistency. But **a cached wrong chain
  keeps being wrong**: a hallucinated chain still enters the cache and keeps auto-filling matching
  queries until the player spends an action to evict it. The trust hit is immediate, so the player
  knows — the compounding cost is that fixing it competes for the same attention as answering.
  Mistakes now have a tail.
- **Capacity allocation.** A small pool of attention distributed across categories, where each point
  allocated to a category adds a clock bonus to queries touching it and removes one from every other
  category. Over-allocating to grippers makes gripper queries comfortable and everything else tight.
  Exact magnitudes come from simulation.

Both are visible on the board, both are the player's own doing, and both create the "my minute-3
decision is hurting me now" texture the design was missing.

## Run structure

### The inbox

Queries do not simply arrive. They land in an inbox showing difficulty and reward, and the player
**pulls** the one they want. Inbox size and concurrency are different things and are tuned
separately: the **inbox** is how many queries are visible to choose between, while **concurrency** is
how many the player may have in flight at once. A bigger inbox buys choice; higher concurrency
demands hands. This is the cheapest source of genuine decisions in the whole design and
v1 lacked it entirely: take the lucrative ambiguous one, or clear three easy ones while the clock is
kind?

Unpulled queries expire on their own timer, so ignoring the inbox is not free.

### Difficulty

Wave size, concurrency, slot count and clock are **coupled, not independent**. v1 ramped six axes
that multiplied, producing a curve that was too flat for five waves, a 62% cliff at wave 6, and
physically impossible from wave 9. Concurrency now *buys clock back* rather than stacking on a
shrinking one.

Resulting curve, at 2 actions per decision:

| Wave | Queries | Concurrent | Slots | Decisions | Clock | Actions/sec |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 4 | 1 | 3 | 3 | 11.0s | 0.55 |
| 4 | 7 | 2 | 3 | 3 | 15.1s | 0.80 |
| 8 | 11 | 3 | 4 | 3 | 17.8s | 1.01 |
| 12 | 15 | 3 | 5 | 3 | 15.7s | 1.14 |
| 16+ | 19+ | 3 | 5 | 3 | 15.0s | 1.20 |

Peak sustained demand is 1.20 actions/sec, reached gradually and never exceeded. v1 peaked at 3.45
precise drags per second, which is competitive-RTS territory and meant nobody would ever have seen
the five-slot content.

Difficulty beyond wave 16 comes from **spec quality**, not speed: the mix shifts toward incomplete
and contradictory queries, so the pressure becomes judgement rather than hands.

### Upgrades

Three offered at each wave break from a pool clustered into three archetypes. The initial pool is
eight; the target is ten to twelve once simulation shows which archetypes are underfed.

**The dead-card rule, applied to every upgrade in the pool:** no upgrade may be worthless to an
expert. Every information effect must also have a throughput face, so it converts rather than dies
as the player learns. v1 failed this five times over.

- *Throughput* — cached chains auto-fill; +1 inbox slot; commit animation shortened
- *Safety* — +2 validation charges per wave **and** validated slots auto-fill next time (information
  becomes throughput); +1 escalation charge; one eviction-free cache correction per wave
- *Inference* — commit 40% faster; hallucination penalty +50%

**Keystone: "Trained the model."** Every query you escalate permanently teaches the system that
*class* of spec: future queries of the same shape arrive one quality level higher (contradictory
becomes incomplete, incomplete becomes complete). Escalation stops being cowardice and becomes
investment in your own future clarity — ReshapeX's flywheel as a strategic decision.

Note the difference from v1, where the keystone revealed *band positions* — which is precisely the
knowledge an expert already has, making the design's proudest idea a null card at mastery. Resolving
*spec ambiguity* is valuable no matter how well you know the catalog.

Guard for simulation: "Inference" is strictly better for a player who is never wrong and a trap for
one who is not. Aggregate sim runs will hide this. The knowledge-parameterized policy sweep (see
Testing) is what surfaces it.

### Between-wave events

- **RFP surge** — five queries at once, double points
- **Compliance audit** — every answer this wave must have at least one validated slot
- **Catalog extension** — a new module family is **added** to an arm, telegraphed one wave ahead

v1's version of the last one *reshuffled* an arm's bands. The review was right that this attacks the
exact skill the game asks the player to build and reads as the game cheating. Additive extension
grows the map instead of invalidating it, and the telegraph gives the player a wave to prepare.

## Onboarding

The success criterion is comprehension in 30 seconds without instructions, and nothing in v1
delivered it — "wave 1 is soft" is not the same as wave 1 being *legible*.

The first three queries are a **no-fail visual match**: the glyph on the query card matches the glyph
on exactly one band, every other band is dimmed and non-interactive, a ghost cursor demonstrates the
verb once, and there is no clock and no trust loss. Learn the verb, then the geometry, then the
vocabulary. Mini Metro's first minute is unloseable on purpose.

Jargon is introduced only after the verb is understood: the fourth query is the first to say
"tool changer" rather than show a shape.

## Modes

**Daily (the front door).** Ten queries, identical for everyone, fixed length, three minutes,
comparable score, emoji result grid. This is what a first-time visitor lands on.

v1 buried the daily seed as a between-runs feature behind a variable-length roguelite whose scores
were not comparable between two players — inverting the one thing Wordle actually teaches, which is
that a *common referent* is what makes a result worth posting. Comparison requires everyone to have
played the same thing.

The daily requires no server: the seed is derived from the date, and results are share text.

**Endless (the depth mode).** The roguelite described above, reached from the daily's end card.

## Share loop

The end card shows score, waves, hallucination count, and a **six-second cinematic replay**, rendered
with the drifting camera, god rays and haze, ReshapeX logo in the corner.

But the clip alone is an ad, not a flex: a correct chain looks identical no matter who played it.
People post proof of cleverness, not proof of reaction time. So the shareable also carries:

- **The decision** — the route taken and the escalation policy, which differ between players
- **A comparative stat** — "you escalated on 3% of queries; the median is 22%"

Between runs: personal bests and a cosmetic status ladder (Junior -> Senior -> Principal applications
engineer) based on lifetime correct answers, stored in localStorage. The ladder grants no power, so
the fixed catalog stays pure. Clearing browser storage resets it; that is acceptable and should be
stated in the UI.

## Presentation

The gameplay camera is **locked** to one fixed, slightly angled view, with pointer parallax and
micro-drift explicitly disabled (both are live in `cameraRig` today). The map never moves, so spatial
memory can form.

The cinematic camera is reserved for attract mode, wave transitions, and the end-of-run replay.

Renderer modules are kept: instanced nodes, glass-strand ribbons, signals, volumetric haze, god rays,
bloom, the trail accumulator. Gameplay runs at density 1 for readability.

**Open risk:** bloom and the trail accumulator are tuned for a film, and their smear over precise
selection feedback is untested. Phase 1 must confirm that a selected band reads unambiguously
through that stack, or the gameplay view needs its own reduced post chain.

## Architecture

### The seam, corrected

v1 claimed "the renderer is already a start-time consumer, so the render layer barely changes." The
technical review found this is **true for nodes and false for edges**:

- **Nodes:** `aIgnite` is real and the GPU derives activation from it. The buffer is static today, but
  adding a `setIgnite()` alongside the existing `setUnfurl()` is roughly five lines.
- **Edges:** `aTiming` is **per-vertex, not per-edge** — a spoke expands to 40 vertices — and the
  edge-to-vertex-range map is discarded after construction. There are no setters at all, and
  `EdgeField` has no `setUnfurl` equivalent, so the moment gameplay moves a node its edges will not
  follow. Runtime edge timing should be routed through the existing per-edge `uDynamic` data texture,
  which has two unused channels. That is a shader change plus a CPU rewrite, not a trivial addition.

### Modules

```
game/catalog.ts     fixed catalog: slot categories, bands, attributes, compatibility rules (authored)
game/query.ts       seeded query generation, spec-quality mix, difficulty parameters
game/state.ts       trust, score, streak, inbox, cache, capacity — a pure reducer
game/upgrades.ts    pool and effects
game/run.ts         wave machine, events
                    ────────── boundary: nothing above imports Three.js ──────────
game/bridge.ts      game state -> start-time writes on the renderers
game/input.ts       selection, hit testing
game/hud.ts         DOM: inbox, slots, trust, charges, upgrade cards
```

The boundary was verified: `graph.ts`, `schedule.ts` and `motion.ts` are already Three-free.
`palette.ts` imports `Color` and is the one leak to guard when game code needs band colour.

### Determinism

The seeded `mulberry32` PRNG carries over. A run is a seed plus recorded inputs, which makes the
daily, the replay, and reproducible bug reports the same mechanism.

**Verified hole:** `Math.random()` is called in `inject()` and in `audio.ts`. `inject()` is the current
interaction entry point and must be rewritten rather than reused.

### Verified technical debt

Each of these was confirmed in the code and is real work, not speculation:

1. **`main.ts` cannot be re-entered.** It is roughly 1,000 lines of module-level singletons with no
   teardown or re-init. A roguelite starting run 2 has nowhere to go. This is the largest single
   refactor in the project and v1 did not mention `main.ts` at all. It is now phase 0.
2. **The 20-second loop is structural, not a constant.** `envelope()` and `foldFactor()` exist in two
   CPU copies and two compiled shaders, with roughly a dozen call sites. Worse, activation is
   evaluated twice — at `t` and `t + LOOP` — and maxed, so "time is modulo 20s" is baked into every
   per-frame evaluation on both CPU and GPU. `cameraRig` is parameterized on `LOOP` too.
3. **`pickNode()` is O(n) and subtly wrong.** The O(n) part is harmless at density 1. The correctness
   part is not: it does not model the vertex shader's dormant-node drift, so the CPU hit-test already
   disagrees with what is drawn — specifically for unlit nodes, exactly the ones a player must hit.
   It also has no depth ordering, so a distant leaf can beat a near hub. Both are live bugs today.
4. **`export.ts` cannot serve the share loop as written.** Duration is hardcoded but trivially
   parameterized; the real problems are that it force-downloads a file rather than returning a Blob,
   cannot seed arbitrary state, freezes the app during real-time capture, and is **WebM-only**.
   WebM is poorly supported on Safari/iOS and social platforms want H.264. The entire demand-gen
   thesis rests on this. An H.264 path or a server-side transcode is a phase-3 prerequisite, not a
   detail.
5. **Catalog extension forces a renderer rebuild.** `EdgeField` and `NodeField` bake geometry from
   `graph.positions` in their constructors with no incremental path, so the event costs a teardown
   and reconstruction of both fields mid-run. Budget for it or restrict extensions to wave breaks.
6. **Node position exists in four representations** — CPU unfurl, GLSL unfurl, `nodeWorldPos` (which
   duplicates the `BUD` constant), and shader-only drift — of which only one is authoritative for
   rendering. Drag-free selection reduces the pain but hit-test accuracy still depends on collapsing
   these.
7. **The layout is now a compatibility contract.** `LAYOUT_VERSION` has already churned eight times.
   "Fixed catalog, mastery by memorization" means it cannot change again without invalidating every
   player's learned map and every historical daily score. Needs a versioning and migration story.

`audio.ts` is the one piece of good news: the voices are already event-shaped with absolute
timestamps, so making it event-driven is roughly 50 lines.

## Phasing

**Phase 0 — make the app re-enterable.** Extract `main.ts`'s singletons into a constructible scene
that can be torn down and rebuilt. Nothing else can proceed without this and it is invisible to
players, so it goes first and gets no game-design debate.

**Phase 1 — feel prototype, disposable.** One wave, three slots, click-to-select, spec-quality
variation, no upgrades, no trust. Its only job is to answer whether this is fun in the hand.

*Kill criteria, decided now so the gate can actually close:* 8 of 10 naive testers complete query 1
unaided in under 30 seconds, and 5 of 10 ask to play again. Judged by whoever runs the sessions, not
by the author. If it misses, the loop changes before anything is built on top of it.

**Phase 2 — the game.** Waves, trust economy, inbox, the confidence dial, standing configuration,
upgrades, events, balance simulation.

**Phase 3 — the share loop.** Daily mode, end card, replay, H.264 path, instrumentation.

## Testing

- **Unit** — pure game logic: scoring, trust arithmetic, hallucination detection, compatibility rules,
  upgrade effects, cache behaviour. No browser.
- **Simulation** — ten thousand runs per balance change. **Policies must be parameterized by catalog
  knowledge**, not assume it: per-band knowledge probability and recall latency, swept from novice to
  expert. v1's fixed-knowledge policies could never have modelled the game's central variable, which
  is how the confidence dial behaves as knowledge grows — the sim would have reported on the scoring
  formula and nothing about the game. Reports trust curves, where runs end, upgrade win rates by
  knowledge level, and any upgrade that is dominant at one skill level and a trap at another.
- **Determinism** — same seed plus input log produces an identical final state.
- **Visual** — screenshot checks at fixed run states, and an explicit legibility check that a selected
  band reads through bloom and the trail accumulator.

## Instrumentation

Goal 1 is unmeasurable without this, and v1 had no plan at all. Minimum viable funnel:

- Landed, first interaction, query 1 completed, query 3 completed, daily completed, endless started,
  run 2 started, shared
- Drop-off at the 30-second mark specifically, since that is the stated comprehension bar
- Share rate per completed run
- Client-side, aggregate, no personal data

## Out of scope

Deliberately excluded; each would need its own design pass:

- Multiplayer or head-to-head
- Accounts and server-side persistence. The daily works from a date-derived seed with share text, so
  no backend is required. A global leaderboard would need one and is therefore excluded.
- Procedural catalog generation
- Permanent power unlocks between runs

**No longer out of scope:** mobile. It was excluded in v1 only because of the drag verb. Click/tap
selection is touch-native, so mobile is a supported target, and the demand-gen funnel survives.
