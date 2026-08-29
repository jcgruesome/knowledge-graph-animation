# Quick Consult: the game — design

Date: 2026-08-29
Status: approved for planning
Builds on: the ReshapeX x Novanta Quick Consult knowledge graph animation in this repo

## Purpose

Two goals held at once:

1. **Demand-gen brand artifact.** A public, instantly playable web thing that puts ReshapeX in
   front of industrial buyers. Measured in plays, shares, and inbound conversations.
2. **A real game.** Optimized for genuine fun and depth, so that it spreads *because* it is good
   rather than because it is marketing.

The second goal serves the first. A mediocre game with a great logo gets one polite share; a good
game gets posted by strangers. Every trade-off below resolves toward "is this fun" first.

The brand is carried by the mechanic, not by decoration. The central risk/reward dial is a direct
translation of the ReshapeX thesis: a confident wrong answer costs more than no answer.

### Success criteria

- A first-time player understands what to do within 20 seconds, without reading instructions.
- A returning player has a reason to start a fifth run.
- The end-of-run artifact is something a player would post without being asked.
- Balance is tuned by simulation, not by hand-play.

## Locked decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Core loop | Route the query | Player is the agent; the confidence dial is the brand thesis as a mechanic |
| Retention | Roguelite runs with between-wave upgrades | Highest depth ceiling and the strongest "one more run" pull |
| Mastery | Fixed catalog, everything else rerolls | Expertise is the product; learning the map is the skill |
| Presentation | Same engine, locked gameplay camera | Looks like the film, plays like a game, reuses ~90% of the renderer |

The roguelite choice has a known weakness: it is not graspable cold, which fights goal 1. The design
answers this by making wave 1 a tutorial that plays almost exactly like the existing animation, with
the first upgrade choice landing about 60 seconds in. Hook first, depth after.

## Core loop

### Anatomy of a query

A query is a customer spec that requires a **chain of modules**, not a single part:

```
UR10e · 12.5 kg · palletizing
  slot 1  tool changer        must be rated >= 12.5 kg
  slot 2  gripper             must suit the application
  slot 3  robot-side adapter  must match the robot flange family
```

Each slot is filled by one drag from the root, out along a spoke to a category hub, onto the correct
module band. Three drags closes a query.

Later waves add slots (compliance devices, utility couplers) and **constraints** that eliminate
otherwise-valid options: cleanroom, high temperature, ESD.

### The skill

Module bands are **not labelled during play**. The player learns that the tool-changer arm runs
light-to-heavy clockwise, that UR adapters sit on the inner ring. Wave 1 they squint and read
tooltips; wave 8 their hand goes there without thinking.

This is the same pattern recognition a real applications engineer spends years building, which is
why the fixed catalog matters: rerolling the map every run would make this skill unlearnable.

### The confidence dial

Three ways to close a query:

| Action | Speed | Points | Trust risk |
| --- | --- | --- | --- |
| **Answer** | Instant | Full, extends streak | Wrong chain is a *hallucination*: the largest trust loss in the game |
| **Cross-validate** | ~1s hold | 60% | None — reports whether the chain as a whole is valid, but not which slot is at fault |
| **Escalate** | Holds a queue slot for a fixed resolution delay (start at 6s) | Zero | None |

The tension the game is built around is the moment the player is 90% sure with 1.2 seconds on the
clock.

### Failure and pressure

**Trust** is the run's life bar, starting at 100. Hallucinations gouge it, timeouts chip it,
escalations never touch it, validated answers heal a little. Trust at zero ends the run.

Pressure comes from **concurrency**, not just the clock: wave 1 is one query at a time, wave 9 is
three in flight while a fourth times out.

Starting values, all to be replaced by simulation output (see Testing):

- Trust: start 100; hallucination -25; timeout -8; escalation 0; any correct answer +2 (whether or
  not it was cross-validated)
- Score: base 100 per query, x speed multiplier (up to 2.0), x streak multiplier; cross-validated
  answers score 60%; escalations score 0
- Streak resets on a hallucination or a timeout; escalation leaves it intact

## Run structure

A run is a shift of escalating waves. A wave is a batch of queries; between waves the player picks
one upgrade from three offered.

### Difficulty axes

Six axes ramp independently so progression never feels like one slider:

1. Wave size: 4 queries at wave 1, +1 per wave
2. Concurrency: 1 query in flight (waves 1-2), 2 (waves 3-5), 3 (waves 6+)
3. Clock: 12s at wave 1, roughly -7% per wave, floor 4s
4. Slots per query: 3 (waves 1-4), 4 (waves 5-8), 5 (waves 9+)
5. Constraints that eliminate options: cleanroom, high temp, ESD
6. Near-miss decoys: a module rated 12.4 kg when the query needs 12.5

Wave 1 is deliberately soft: one query, generous clock, bands labelled. It is the tutorial and it
is not announced as one.

### Upgrades

Three offered at each wave break from a pool clustered into three archetypes, so runs diverge. The
upgrades named below are the initial pool of eight; the target is roughly ten to twelve once
simulation shows which archetypes are underfed:

- **Throughput** — cached answers auto-fill a repeated slot; one arm stays permanently labelled;
  +1 queue slot
- **Safety** — the first slot of each query is auto-validated free; a live confidence percentage on
  the current chain; one undo per wave
- **Inference** — commit 40% faster, hallucination penalty +50%

**Keystone upgrade: "Trained the model."** Every query the player escalates permanently reveals that
module's band for the rest of the run. Escalation stops being pure cowardice and becomes investment:
hand hard queries to a human early so the system is smarter later. This is ReshapeX's flywheel as a
strategic decision, and it turns the safe option into an interesting one.

### Between-wave events

Occasional, not every wave:

- **RFP surge** — five queries at once, double points
- **Compliance audit** — every answer this wave must be cross-validated
- **Catalog update** — one arm's bands reshuffle, so rote memorization does not trivialize run 50

## Share loop

When trust hits zero the end card shows score, waves survived, queries answered, and hallucination
count — plus a **six-second cinematic replay of the player's best chain**, rendered with the drifting
camera, god rays and haze, with the ReshapeX logo in the corner.

This reuses the existing `export.ts` recorder and the cinematic camera path. The reward for a good
run is a clip worth posting, which makes the demand-gen engine a by-product of the game rather than
a tax on it.

Between runs: personal bests, a daily seed shared by everyone, and a cosmetic status ladder (Junior
-> Senior -> Principal applications engineer) based on lifetime validated answers. The ladder grants
no power, so the fixed catalog stays pure.

## Presentation

The gameplay camera is **locked** to one fixed, slightly angled view. The map never moves, so spatial
memory can form — which is the entire mastery mechanic.

The cinematic camera is reserved for attract mode, wave transitions, and the end-of-run replay.

Every renderer module is kept: instanced nodes, glass-strand ribbons, signals, volumetric haze, god
rays, bloom, the trail accumulator. Gameplay runs at density 1 for readability; the 20k-node density
becomes attract-mode spectacle.

## Architecture

### The seam

The renderer is already a start-time consumer: nodes read `aIgnite`, edges read `aTiming`, and the
shaders derive activation, unfurl and draw state from those. Today a precomputed schedule writes
them; in the game the player writes them. The render layer barely changes — gameplay is simply a
different producer feeding the same seam.

### Modules

```
game/catalog.ts     fixed catalog: slot categories, bands, attributes, compatibility rules (authored)
game/query.ts       seeded query generation + difficulty parameters
game/state.ts       trust, score, streak, queue, slots — a pure reducer
game/upgrades.ts    upgrade pool and effects
game/run.ts         wave machine, events
                    ────────── boundary: nothing above imports Three.js ──────────
game/bridge.ts      game state -> start-time writes on the existing renderers
game/input.ts       drag routing and hit testing
game/hud.ts         DOM HUD: slots, trust, queue, upgrade cards
```

Existing modules are reused as-is where possible. `graph.ts` gains game metadata (slot category,
band, attributes per node). `audio.ts` becomes event-driven rather than cue-list driven.

### The purity boundary

Game logic imports zero Three.js. This is not stylistic: it is what makes headless balance
simulation possible, and a roguelite that cannot be simulated cannot be balanced.

### Determinism

The existing seeded `mulberry32` PRNG carries over. A run is a seed plus recorded inputs, which makes
the daily seed, the end-card replay, and reproducible bug reports all the same mechanism.

### Known gotchas

1. **`envelope()` in `schedule.ts` is hardcoded to the 20-second loop.** It fades everything from 17s
   and folds the graph back into buds. Correct for a film, fatal for a four-minute run. It must
   become a mode rather than a constant.
2. **`pickNode()` is O(n) per call.** Acceptable for a click, unusable during a 60fps drag at higher
   densities. The locked camera makes screen positions static per pose, so a 2D grid can be
   precomputed once and hit-tested in constant time.

## Phasing

1. **Feel prototype (disposable).** One wave, three slots, drag-to-route, no upgrades, no trust. Its
   only job is to answer "is this fun in the hand?" If it is not, we change the loop before building
   anything on top of it.
2. **The game.** Waves, trust, concurrency, the confidence dial, upgrades, events, balance simulation.
3. **The share loop.** End card, cinematic replay, daily seed, status ladder.

## Testing

- **Unit** — pure game logic: scoring, trust arithmetic, hallucination detection, compatibility
  rules, upgrade effects, difficulty curve. No browser required.
- **Simulation** — ten thousand runs per balance change with scripted player policies (perfect,
  sloppy, escalation-heavy, speed-greedy). Reports trust curves, where runs actually end, and
  upgrade win rates to surface dominant strategies.
- **Determinism** — the same seed and input log must produce an identical final state.
- **Visual** — screenshot checks at fixed run states, as done for the animation.

## Out of scope

Deliberately excluded, and each would need its own design pass:

- Multiplayer or head-to-head
- Accounts, server-side persistence, or a global leaderboard beyond the daily seed
- Procedural catalog generation
- Permanent power unlocks between runs
- Mobile-first redesign. The game is desktop-first because drag routing needs precision; touch
  support is a later question, not a silent assumption.
